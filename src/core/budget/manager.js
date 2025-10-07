/**
 * Budget Manager
 * Handles budget tracking, validation, and enforcement with priority-based allocation
 */

const EventEmitter = require('events');
const CircuitBreaker = require('./circuit-breaker');
const CostEstimator = require('./cost-estimator');
const { BudgetError, BudgetValidationError, CostOverrunError } = require('../../utils/errors');

class BudgetManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxBudget: config.maxBudget || 100.0,
      minReserve: config.minReserve || 10.0,
      warningThreshold: config.warningThreshold || 0.9,
      // stepTimeout: Operation timeout before cleanup (default 2 minutes)
      //   - Set to 120s to accommodate Claude API response times (15-30s typical)
      //   - ClaudeClient has its own 10-minute timeout for complex responses
      //   - Operations failing before this timeout will still be cleaned up
      stepTimeout: config.stepTimeout || 120000,  // 2 minutes (was 5000ms)
      model: config.model || 'claude-3-sonnet-20240229'
    };

    this.usage = {
      total: 0,
      reserved: 0,
      operations: new Map(),
      history: []
    };

    // Validate dependencies
    try {
      this.circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 30000
      });

      if (!this.circuitBreaker) {
        throw new Error('CircuitBreaker did not initialize properly');
      }
    } catch (error) {
      throw new BudgetError(
        `Failed to initialize CircuitBreaker: ${error.message}`,
        { originalError: error.message }
      );
    }

    try {
      this.costEstimator = new CostEstimator({
        model: this.config.model
      });

      if (!this.costEstimator) {
        throw new Error('CostEstimator did not initialize properly');
      }
    } catch (error) {
      throw new BudgetError(
        `Failed to initialize CostEstimator: ${error.message}`,
        { originalError: error.message }
      );
    }

    // Priority queue for budget allocation
    this.priorityQueue = {
      HIGH: [],
      MEDIUM: [],
      LOW: []
    };

    // Mutex for atomic operations (FIX B1: Budget Race Condition)
    // This prevents race conditions during validate-and-reserve operations
    this.operationMutex = Promise.resolve();
    this.mutexQueue = [];

    // Start cleanup interval
    this._startCleanupInterval();
  }

  /**
   * Acquire mutex for atomic operations (FIX B1: Budget Race Condition)
   * @private
   * @returns {Promise<Function>} unlock function
   */
  async _acquireMutex() {
    console.debug(`[BudgetManager] Mutex acquisition requested, queue length: ${this.mutexQueue.length}`);

    // Create a new promise that will be the next mutex
    let unlock;
    const nextMutex = new Promise(resolve => {
      unlock = resolve;
    });

    // Wait for current mutex, then replace it
    const currentMutex = this.operationMutex;
    this.operationMutex = nextMutex;

    await currentMutex;
    console.debug(`[BudgetManager] Mutex acquired`);
    return unlock;
  }

  /**
   * Validate operation before execution (with priority support)
   * FIX B1: Now uses mutex for atomic validate-and-reserve
   * @param {string} operationId
   * @param {number} estimatedCost
   * @param {string} agentId
   * @param {string} priority - HIGH, MEDIUM, LOW
   * @returns {Promise<Object>}
   */
  async validateOperation(operationId, estimatedCost, agentId, priority = 'MEDIUM') {
    console.log(`[BudgetManager] validateOperation called:`, {
      operationId,
      estimatedCost,
      agentId,
      priority,
      currentReserved: this.usage.reserved,
      currentTotal: this.usage.total,
      currentRemaining: this.getRemainingBudget()
    });

    // FIX B1: Acquire mutex for atomic validate-and-reserve operation
    const unlock = await this._acquireMutex();
    console.debug(`[BudgetManager] Mutex acquired for validateOperation: ${operationId}`);

    try {
      // Circuit breaker check
      const canExecute = this.circuitBreaker.canExecute();
      console.debug(`[BudgetManager] Circuit breaker check: ${canExecute}`);

      if (!canExecute) {
        const state = this.circuitBreaker.getState();
        console.warn(`[BudgetManager] Circuit breaker blocking operation:`, {
          operationId,
          state: state.state,
          failureCount: state.failureCount,
          nextAttemptTime: new Date(state.nextAttemptTime).toISOString()
        });
        throw new BudgetError(
          `Budget system in circuit breaker mode (${state.state}). ` +
          `Next attempt at: ${new Date(state.nextAttemptTime).toISOString()}`
        );
      }

      // Calculate projected usage (atomic read within mutex)
      const totalProjected = this.usage.total + this.usage.reserved + estimatedCost;
      console.debug(`[BudgetManager] Budget calculation:`, {
        operationId,
        currentTotal: this.usage.total,
        currentReserved: this.usage.reserved,
        estimatedCost,
        totalProjected,
        maxBudget: this.config.maxBudget,
        wouldExceed: totalProjected > this.config.maxBudget
      });

      // Hard limit check
      if (totalProjected > this.config.maxBudget) {
        console.error(`[BudgetManager] Budget limit exceeded:`, {
          operationId,
          requested: estimatedCost,
          projected: totalProjected,
          limit: this.config.maxBudget,
          overage: totalProjected - this.config.maxBudget
        });

        this.emit('budgetExceeded', {
          operationId,
          requested: estimatedCost,
          projected: totalProjected,
          limit: this.config.maxBudget,
          remaining: this.getRemainingBudget()
        });

        throw new CostOverrunError(
          `Operation would exceed budget limit: $${totalProjected.toFixed(4)} > $${this.config.maxBudget}`,
          {
            operationId,
            estimatedCost,
            totalProjected,
            maxBudget: this.config.maxBudget
          }
        );
      }

      // Reserve check
      const reserveRemaining = this.config.maxBudget - totalProjected;
      console.debug(`[BudgetManager] Reserve check:`, {
        operationId,
        reserveRemaining,
        minReserve: this.config.minReserve,
        meetsRequirement: reserveRemaining >= this.config.minReserve
      });

      if (reserveRemaining < this.config.minReserve) {
        console.warn(`[BudgetManager] Minimum reserve violated:`, {
          operationId,
          reserveRemaining,
          minReserve: this.config.minReserve,
          shortfall: this.config.minReserve - reserveRemaining
        });
        throw new BudgetError(
          `Operation would violate minimum reserve requirement: ` +
          `$${reserveRemaining.toFixed(4)} < $${this.config.minReserve}`,
          {
            operationId,
            reserveRemaining,
            minReserve: this.config.minReserve
          }
        );
      }

      // Reserve the budget (atomic write within mutex)
      this.usage.reserved += estimatedCost;
      this.usage.operations.set(operationId, {
        operationId,
        estimatedCost,
        actualCost: 0,
        agentId,
        priority,
        timestamp: Date.now(),
        status: 'reserved'
      });

      console.log(`[BudgetManager] Budget reserved successfully:`, {
        operationId,
        estimatedCost,
        newReserved: this.usage.reserved,
        operationsMapSize: this.usage.operations.size,
        status: 'reserved'
      });

      // Warning threshold check
      const utilizationPercent = totalProjected / this.config.maxBudget;
      if (utilizationPercent >= this.config.warningThreshold) {
        console.warn(`[BudgetManager] Budget warning threshold reached:`, {
          operationId,
          utilization: utilizationPercent,
          threshold: this.config.warningThreshold,
          projected: totalProjected,
          remaining: this.config.maxBudget - totalProjected
        });
        this.emit('budgetWarning', {
          operationId,
          utilization: utilizationPercent,
          projected: totalProjected,
          threshold: this.config.warningThreshold,
          remaining: this.config.maxBudget - totalProjected
        });
      }

      // FIX B4: Removed recordSuccess() from here
      // Circuit breaker success should only be recorded after operation completes (in recordUsage)

      console.log(`[BudgetManager] validateOperation completed successfully:`, {
        operationId,
        approved: true,
        remaining: this.config.maxBudget - totalProjected,
        utilizationPercent
      });

      return {
        approved: true,
        operationId,
        estimatedCost,
        remaining: this.config.maxBudget - totalProjected,
        utilizationPercent
      };

    } catch (error) {
      console.error(`[BudgetManager] validateOperation failed:`, {
        operationId,
        error: error.message,
        errorType: error.constructor.name
      });

      this.circuitBreaker.recordFailure();

      if (error instanceof BudgetError) {
        throw error;
      }

      throw new BudgetValidationError(
        `Budget validation failed: ${error.message}`,
        { operationId, agentId, originalError: error.message }
      );
    } finally {
      // FIX B1: Always release mutex, even on error
      console.debug(`[BudgetManager] Mutex released for validateOperation: ${operationId}`);
      unlock();
    }
  }

  /**
   * Release reserved budget without recording usage (FIX B3: Reserved Budget Not Released)
   * Should be called in error handlers when operation fails before completion
   * @param {string} operationId
   * @returns {Promise<Object>}
   */
  async releaseReservation(operationId) {
    console.log(`[BudgetManager] releaseReservation called:`, {
      operationId,
      currentReserved: this.usage.reserved,
      operationExists: this.usage.operations.has(operationId)
    });

    const operation = this.usage.operations.get(operationId);

    if (!operation) {
      console.error(`[BudgetManager] Cannot release unknown operation:`, { operationId });
      throw new BudgetError(
        `Cannot release reservation: unknown operation ${operationId}`
      );
    }

    if (operation.status !== 'reserved') {
      console.error(`[BudgetManager] Cannot release non-reserved operation:`, {
        operationId,
        currentStatus: operation.status
      });
      throw new BudgetError(
        `Cannot release reservation: operation ${operationId} is ${operation.status}`
      );
    }

    // Release the reserved budget
    const previousReserved = this.usage.reserved;
    this.usage.reserved -= operation.estimatedCost;
    this.usage.operations.delete(operationId);

    console.log(`[BudgetManager] Reservation released:`, {
      operationId,
      releasedAmount: operation.estimatedCost,
      previousReserved,
      newReserved: this.usage.reserved,
      operationsMapSize: this.usage.operations.size
    });

    this.emit('reservationReleased', {
      operationId,
      estimatedCost: operation.estimatedCost,
      agentId: operation.agentId,
      reason: 'explicit-release'
    });

    return {
      operationId,
      releasedAmount: operation.estimatedCost,
      remaining: this.getRemainingBudget()
    };
  }

  /**
   * Record actual usage after operation completion
   * FIX B4: Now records circuit breaker success
   * FIX B2: Now rejects untracked operations
   * @param {string} operationId
   * @param {number} actualCost
   * @returns {Promise<Object>}
   */
  async recordUsage(operationId, actualCost) {
    console.log(`[BudgetManager] recordUsage called:`, {
      operationId,
      actualCost,
      currentTotal: this.usage.total,
      currentReserved: this.usage.reserved,
      operationExists: this.usage.operations.has(operationId)
    });

    const operation = this.usage.operations.get(operationId);

    // FIX B2: Reject untracked operations instead of silently recording them
    if (!operation) {
      console.error(`[BudgetManager] Cannot record usage for untracked operation:`, {
        operationId,
        actualCost,
        operationsMapSize: this.usage.operations.size
      });
      throw new BudgetError(
        `Cannot record usage for untracked operation: ${operationId}. ` +
        `All operations must be validated via validateOperation() before recording usage.`,
        {
          operationId,
          actualCost,
          reason: 'untracked-operation'
        }
      );
    }

    // Update totals
    const previousTotal = this.usage.total;
    const previousReserved = this.usage.reserved;
    this.usage.total += actualCost;
    this.usage.reserved -= operation.estimatedCost;

    // Update operation record
    operation.actualCost = actualCost;
    operation.status = 'completed';
    operation.completedAt = Date.now();
    operation.variance = actualCost - operation.estimatedCost;
    operation.variancePercent = (operation.variance / operation.estimatedCost) * 100;

    console.log(`[BudgetManager] Budget totals updated:`, {
      operationId,
      previousTotal,
      newTotal: this.usage.total,
      actualCost,
      previousReserved,
      newReserved: this.usage.reserved,
      releasedReserved: operation.estimatedCost,
      variance: operation.variance,
      variancePercent: operation.variancePercent.toFixed(2) + '%'
    });

    // Add to history
    this.usage.history.push({
      ...operation,
      duration: operation.completedAt - operation.timestamp
    });

    console.debug(`[BudgetManager] Operation added to history:`, {
      operationId,
      historyLength: this.usage.history.length,
      duration: operation.completedAt - operation.timestamp
    });

    this.emit('usageRecorded', {
      operationId,
      estimatedCost: operation.estimatedCost,
      actualCost,
      variance: operation.variance,
      variancePercent: operation.variancePercent,
      totalUsage: this.usage.total,
      remaining: this.getRemainingBudget()
    });

    // FIX B4: Record circuit breaker success AFTER operation completes
    // This ensures we only count successful operations, not just successful validations
    console.debug(`[BudgetManager] Recording circuit breaker success for operation: ${operationId}`);
    this.circuitBreaker.recordSuccess();

    return {
      operationId,
      actualCost,
      remaining: this.getRemainingBudget(),
      utilizationPercent: (this.usage.total + this.usage.reserved) / this.config.maxBudget * 100
    };
  }

  /**
   * Allocate budget with priority support
   * @param {Array} tasks - Tasks with estimated costs and priorities
   * @returns {Object}
   */
  async allocateBudget(tasks) {
    // Separate by priority
    const highPriority = tasks.filter(t => t.priority === 'HIGH' || t.isCriticalPath);
    const mediumPriority = tasks.filter(t => t.priority === 'MEDIUM' && !t.isCriticalPath);
    const lowPriority = tasks.filter(t => t.priority === 'LOW');

    // Calculate costs
    const highCost = highPriority.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);
    const mediumCost = mediumPriority.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);
    const lowCost = lowPriority.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);
    const totalCost = highCost + mediumCost + lowCost;

    const availableBudget = this.getRemainingBudget();

    // Ensure high priority tasks can be funded
    if (highCost > availableBudget) {
      throw new BudgetError(
        `Insufficient budget for high-priority tasks: $${highCost.toFixed(4)} required, $${availableBudget.toFixed(4)} available`
      );
    }

    // Allocate remaining budget proportionally to medium and low priority
    const remainingAfterHigh = availableBudget - highCost;
    const mediumLowTotal = mediumCost + lowCost;

    let mediumAllocation = mediumCost;
    let lowAllocation = lowCost;

    if (mediumLowTotal > remainingAfterHigh) {
      // Need to scale back medium and low priority tasks
      const scale = remainingAfterHigh / mediumLowTotal;
      mediumAllocation = mediumCost * scale;
      lowAllocation = lowCost * scale;
    }

    return {
      totalBudget: this.config.maxBudget,
      availableBudget,
      allocations: {
        high: {
          tasks: highPriority.length,
          allocated: highCost,
          percentage: (highCost / availableBudget) * 100
        },
        medium: {
          tasks: mediumPriority.length,
          allocated: mediumAllocation,
          percentage: (mediumAllocation / availableBudget) * 100
        },
        low: {
          tasks: lowPriority.length,
          allocated: lowAllocation,
          percentage: (lowAllocation / availableBudget) * 100
        }
      },
      totalAllocated: highCost + mediumAllocation + lowAllocation,
      unallocated: availableBudget - (highCost + mediumAllocation + lowAllocation)
    };
  }

  /**
   * Get remaining budget
   * @returns {number}
   */
  getRemainingBudget() {
    return Math.max(0, this.config.maxBudget - this.usage.total - this.usage.reserved);
  }

  /**
   * Get current status
   * @returns {Object}
   */
  getStatus() {
    const utilized = this.usage.total + this.usage.reserved;
    const remaining = this.getRemainingBudget();

    return {
      maxBudget: this.config.maxBudget,
      totalUsed: this.usage.total,
      reserved: this.usage.reserved,
      utilized,
      remaining,
      utilizationPercent: (utilized / this.config.maxBudget) * 100,
      activeOperations: Array.from(this.usage.operations.values())
        .filter(op => op.status === 'reserved').length,
      completedOperations: this.usage.history.length,
      circuitBreakerState: this.circuitBreaker.getState().state,
      averageCostPerOperation: this.usage.history.length > 0
        ? this.usage.history.reduce((sum, op) => sum + op.actualCost, 0) / this.usage.history.length
        : 0
    };
  }

  /**
   * Get usage history with analytics
   * @returns {Object}
   */
  getUsageAnalytics() {
    if (this.usage.history.length === 0) {
      return {
        totalOperations: 0,
        message: 'No operations completed yet'
      };
    }

    const costs = this.usage.history.map(op => op.actualCost);
    const variances = this.usage.history.map(op => op.variance);
    const durations = this.usage.history.map(op => op.duration);

    return {
      totalOperations: this.usage.history.length,
      costStatistics: {
        total: this.usage.total,
        average: costs.reduce((a, b) => a + b, 0) / costs.length,
        min: Math.min(...costs),
        max: Math.max(...costs),
        median: this._calculateMedian(costs)
      },
      varianceStatistics: {
        average: variances.reduce((a, b) => a + b, 0) / variances.length,
        percentAccurate: variances.filter(v => Math.abs(v) < 0.001).length / variances.length * 100
      },
      durationStatistics: {
        average: durations.reduce((a, b) => a + b, 0) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations)
      },
      byPriority: this._groupByPriority(),
      byAgent: this._groupByAgent()
    };
  }

  /**
   * Cleanup expired reservations
   * @private
   */
  async cleanup() {
    const now = Date.now();
    const expired = [];

    console.debug(`[BudgetManager] Cleanup cycle starting:`, {
      timestamp: new Date(now).toISOString(),
      totalOperations: this.usage.operations.size,
      stepTimeout: this.config.stepTimeout,
      currentReserved: this.usage.reserved
    });

    for (const [operationId, operation] of this.usage.operations.entries()) {
      const age = now - operation.timestamp;
      const isExpired = operation.status === 'reserved' && age > this.config.stepTimeout;

      console.debug(`[BudgetManager] Checking operation:`, {
        operationId,
        status: operation.status,
        age,
        timeout: this.config.stepTimeout,
        isExpired
      });

      if (isExpired) {
        // Release reservation
        this.usage.reserved -= operation.estimatedCost;
        this.usage.operations.delete(operationId);
        expired.push(operationId);

        console.warn(`[BudgetManager] Operation expired and released:`, {
          operationId,
          estimatedCost: operation.estimatedCost,
          agentId: operation.agentId,
          age,
          newReserved: this.usage.reserved,
          operationsMapSize: this.usage.operations.size
        });

        this.emit('operationExpired', {
          operationId,
          estimatedCost: operation.estimatedCost,
          agentId: operation.agentId,
          age: now - operation.timestamp
        });
      }
    }

    console.log(`[BudgetManager] Cleanup cycle complete:`, {
      expiredCount: expired.length,
      expiredOperations: expired,
      remainingOperations: this.usage.operations.size,
      currentReserved: this.usage.reserved
    });

    return expired;
  }

  /**
   * Start cleanup interval
   * @private
   */
  _startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(err => {
        this.emit('error', new BudgetError('Cleanup failed', { error: err.message }));
      });
    }, 10000); // Every 10 seconds
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Calculate median
   * @private
   */
  _calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Group history by priority
   * @private
   */
  _groupByPriority() {
    const groups = { HIGH: [], MEDIUM: [], LOW: [] };

    for (const op of this.usage.history) {
      const priority = op.priority || 'MEDIUM';
      if (groups[priority]) {
        groups[priority].push(op);
      }
    }

    return Object.keys(groups).reduce((acc, priority) => {
      const ops = groups[priority];
      acc[priority] = {
        count: ops.length,
        totalCost: ops.reduce((sum, op) => sum + op.actualCost, 0),
        averageCost: ops.length > 0 ? ops.reduce((sum, op) => sum + op.actualCost, 0) / ops.length : 0
      };
      return acc;
    }, {});
  }

  /**
   * Group history by agent
   * @private
   */
  _groupByAgent() {
    const groups = {};

    for (const op of this.usage.history) {
      if (!groups[op.agentId]) {
        groups[op.agentId] = [];
      }
      groups[op.agentId].push(op);
    }

    return Object.keys(groups).reduce((acc, agentId) => {
      const ops = groups[agentId];
      acc[agentId] = {
        count: ops.length,
        totalCost: ops.reduce((sum, op) => sum + op.actualCost, 0),
        averageCost: ops.length > 0 ? ops.reduce((sum, op) => sum + op.actualCost, 0) / ops.length : 0
      };
      return acc;
    }, {});
  }

  /**
   * Export budget data for reporting
   * @returns {Object}
   */
  exportData() {
    return {
      config: this.config,
      status: this.getStatus(),
      analytics: this.getUsageAnalytics(),
      history: this.usage.history,
      timestamp: Date.now()
    };
  }
}

module.exports = BudgetManager;
