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
      stepTimeout: config.stepTimeout || 5000,
      model: config.model || 'claude-3-sonnet-20240229'
    };

    this.usage = {
      total: 0,
      reserved: 0,
      operations: new Map(),
      history: []
    };

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000
    });

    this.costEstimator = new CostEstimator({
      model: this.config.model
    });

    // Priority queue for budget allocation
    this.priorityQueue = {
      HIGH: [],
      MEDIUM: [],
      LOW: []
    };

    // Start cleanup interval
    this._startCleanupInterval();
  }

  /**
   * Validate operation before execution (with priority support)
   * @param {string} operationId
   * @param {number} estimatedCost
   * @param {string} agentId
   * @param {string} priority - HIGH, MEDIUM, LOW
   * @returns {Promise<Object>}
   */
  async validateOperation(operationId, estimatedCost, agentId, priority = 'MEDIUM') {
    try {
      // Circuit breaker check
      if (!this.circuitBreaker.canExecute()) {
        const state = this.circuitBreaker.getState();
        throw new BudgetError(
          `Budget system in circuit breaker mode (${state.state}). ` +
          `Next attempt at: ${new Date(state.nextAttemptTime).toISOString()}`
        );
      }

      // Calculate projected usage
      const totalProjected = this.usage.total + this.usage.reserved + estimatedCost;

      // Hard limit check
      if (totalProjected > this.config.maxBudget) {
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
      if (reserveRemaining < this.config.minReserve) {
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

      // Reserve the budget
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

      // Warning threshold check
      const utilizationPercent = totalProjected / this.config.maxBudget;
      if (utilizationPercent >= this.config.warningThreshold) {
        this.emit('budgetWarning', {
          operationId,
          utilization: utilizationPercent,
          projected: totalProjected,
          threshold: this.config.warningThreshold,
          remaining: this.config.maxBudget - totalProjected
        });
      }

      this.circuitBreaker.recordSuccess();

      return {
        approved: true,
        operationId,
        estimatedCost,
        remaining: this.config.maxBudget - totalProjected,
        utilizationPercent
      };

    } catch (error) {
      this.circuitBreaker.recordFailure();

      if (error instanceof BudgetError) {
        throw error;
      }

      throw new BudgetValidationError(
        `Budget validation failed: ${error.message}`,
        { operationId, agentId, originalError: error.message }
      );
    }
  }

  /**
   * Record actual usage after operation completion
   * @param {string} operationId
   * @param {number} actualCost
   * @returns {Promise<Object>}
   */
  async recordUsage(operationId, actualCost) {
    const operation = this.usage.operations.get(operationId);

    if (!operation) {
      throw new BudgetError(`Unknown operation: ${operationId}`);
    }

    // Update totals
    this.usage.total += actualCost;
    this.usage.reserved -= operation.estimatedCost;

    // Update operation record
    operation.actualCost = actualCost;
    operation.status = 'completed';
    operation.completedAt = Date.now();
    operation.variance = actualCost - operation.estimatedCost;
    operation.variancePercent = (operation.variance / operation.estimatedCost) * 100;

    // Add to history
    this.usage.history.push({
      ...operation,
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

    for (const [operationId, operation] of this.usage.operations.entries()) {
      if (operation.status === 'reserved' &&
          (now - operation.timestamp) > this.config.stepTimeout) {

        // Release reservation
        this.usage.reserved -= operation.estimatedCost;
        this.usage.operations.delete(operationId);
        expired.push(operationId);

        this.emit('operationExpired', {
          operationId,
          estimatedCost: operation.estimatedCost,
          agentId: operation.agentId,
          age: now - operation.timestamp
        });
      }
    }

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
