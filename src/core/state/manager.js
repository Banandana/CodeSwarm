/**
 * State Manager
 * Manages system state with eventual consistency and checkpointing
 */

const EventEmitter = require('events');
const CheckpointManager = require('./checkpoint');
const { StateError, ConcurrencyError } = require('../../utils/errors');

class StateManager extends EventEmitter {
  constructor(outputDir) {
    super();

    this.state = new Map();
    this.subscribers = new Map();
    this.operationQueue = [];
    this.isProcessing = false;
    this.vectorClock = new Map();
    this.checkpointManager = new CheckpointManager(outputDir);

    // System state
    this.systemState = {
      currentTask: null,
      completedTasks: [],
      pendingTasks: [],
      failedTasks: [],
      budgetUsed: 0,
      budgetRemaining: 0,
      filesModified: [],
      filesCreated: [],
      agents: [],
      projectInfo: {},
      config: {}
    };
  }

  /**
   * Initialize state manager
   */
  async initialize() {
    await this.checkpointManager.initialize();

    // Check for existing checkpoint
    if (await this.checkpointManager.hasCheckpoint()) {
      const metadata = await this.checkpointManager.getCheckpointMetadata();
      this.emit('checkpointFound', metadata);
    }
  }

  /**
   * Read operation with consistency guarantees
   * @param {string} key
   * @param {string} agentId
   * @param {string} consistency - 'eventual' or 'strong' (default: 'eventual')
   * @returns {Promise<any>}
   */
  async read(key, agentId, consistency = 'eventual') {
    return new Promise((resolve) => {
      this.operationQueue.push({
        type: 'READ',
        key,
        agentId,
        consistency,
        timestamp: Date.now(),
        resolve,
        reject: () => {}, // Reads don't fail
        retryCount: 0 // C2: Track retry count to prevent infinite loop
      });

      this._processQueue();
    });
  }

  /**
   * Write operation with conflict detection
   * @param {string} key
   * @param {any} value
   * @param {string} agentId
   * @param {number} expectedVersion
   * @returns {Promise<Object>}
   */
  async write(key, value, agentId, expectedVersion = null) {
    return new Promise((resolve, reject) => {
      this.operationQueue.push({
        type: 'WRITE',
        key,
        value,
        agentId,
        expectedVersion,
        timestamp: Date.now(),
        resolve,
        reject
      });

      this._processQueue();
    });
  }

  /**
   * Subscribe to state changes
   * @param {string|RegExp} pattern
   * @param {Function} callback
   * @param {string} agentId
   * @returns {Promise<string>}
   */
  async subscribe(pattern, callback, agentId) {
    const subscriptionId = `${agentId}-${Date.now()}-${Math.random()}`;

    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Map());
    }

    this.subscribers.get(pattern).set(subscriptionId, {
      callback,
      agentId,
      createdAt: Date.now()
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe from state changes
   * @param {string} subscriptionId
   */
  async unsubscribe(subscriptionId) {
    for (const [pattern, subscribers] of this.subscribers.entries()) {
      if (subscribers.has(subscriptionId)) {
        subscribers.delete(subscriptionId);
        return true;
      }
    }
    return false;
  }

  /**
   * Get consistent view for an agent
   * @param {string} agentId
   * @returns {Promise<Object>}
   */
  async getConsistentView(agentId) {
    const snapshot = {};

    for (const [key, entry] of this.state.entries()) {
      snapshot[key] = {
        value: entry.value,
        version: entry.version,
        lastModified: entry.lastModified,
        lastModifiedBy: entry.lastModifiedBy
      };
    }

    return snapshot;
  }

  /**
   * Update system state (for checkpointing)
   * @param {Object} updates
   */
  updateSystemState(updates) {
    this.systemState = {
      ...this.systemState,
      ...updates
    };
  }

  /**
   * Get system state
   * @returns {Object}
   */
  getSystemState() {
    return { ...this.systemState };
  }

  /**
   * Create checkpoint
   * @returns {Promise<string>}
   */
  async createCheckpoint() {
    const checkpointId = await this.checkpointManager.createCheckpoint(this.systemState);
    this.emit('checkpointCreated', { checkpointId, timestamp: Date.now() });
    return checkpointId;
  }

  /**
   * Restore from checkpoint
   * @returns {Promise<Object>}
   */
  async restoreFromCheckpoint() {
    const restored = await this.checkpointManager.restoreFromCheckpoint();
    this.systemState = {
      currentTask: restored.currentTask,
      completedTasks: restored.completedTasks,
      pendingTasks: restored.pendingTasks,
      failedTasks: restored.failedTasks,
      budgetUsed: restored.budgetUsed,
      budgetRemaining: restored.budgetRemaining,
      filesModified: restored.filesModified,
      filesCreated: restored.filesCreated,
      agents: restored.agents,
      projectInfo: restored.projectInfo,
      config: restored.config
    };

    this.emit('checkpointRestored', { checkpointId: restored.checkpointId });
    return restored;
  }

  /**
   * Process operation queue sequentially
   * @private
   */
  async _processQueue() {
    if (this.isProcessing || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.operationQueue.length > 0) {
        const operation = this.operationQueue.shift();

        try {
          await this._executeOperation(operation);
        } catch (error) {
          operation.reject(error);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute individual operation
   * @private
   */
  async _executeOperation(operation) {
    const { type, key, value, agentId, expectedVersion, consistency, resolve, reject } = operation;

    // Update vector clock
    const currentClock = this.vectorClock.get(agentId) || 0;
    this.vectorClock.set(agentId, currentClock + 1);

    if (type === 'READ') {
      // Strong consistency: wait for all pending writes to complete
      if (consistency === 'strong' && this.operationQueue.some(op => op.type === 'WRITE' && op.key === key)) {
        // C2: Add max retry count to prevent infinite loop
        const maxRetries = 10;
        operation.retryCount = (operation.retryCount || 0) + 1;

        if (operation.retryCount > maxRetries) {
          // Fallback to eventual consistency after max retries
          this.emit('consistencyFallback', {
            key,
            agentId,
            retryCount: operation.retryCount,
            message: 'Strong consistency failed after max retries, falling back to eventual'
          });
          const stateEntry = this.state.get(key);
          resolve(stateEntry ? stateEntry.value : null);
          return;
        }

        // Re-queue this read operation to execute after writes
        this.operationQueue.push(operation);
        return;
      }

      const stateEntry = this.state.get(key);
      resolve(stateEntry ? stateEntry.value : null);
      return;
    }

    if (type === 'WRITE') {
      const currentEntry = this.state.get(key);

      // Optimistic locking check
      if (expectedVersion !== null && currentEntry && currentEntry.version !== expectedVersion) {
        throw new ConcurrencyError(
          `Version conflict for key ${key}. Expected: ${expectedVersion}, Current: ${currentEntry.version}`
        );
      }

      const newVersion = (currentEntry ? currentEntry.version : 0) + 1;

      this.state.set(key, {
        value,
        version: newVersion,
        lastModified: Date.now(),
        lastModifiedBy: agentId,
        vectorClock: new Map(this.vectorClock)
      });

      // Notify subscribers
      await this._notifySubscribers(key, value, agentId);

      resolve({
        version: newVersion,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Notify pattern-matching subscribers
   * @private
   */
  async _notifySubscribers(key, value, agentId) {
    for (const [pattern, subscribers] of this.subscribers.entries()) {
      let matches = false;

      if (typeof pattern === 'string') {
        matches = key === pattern || key.startsWith(pattern.replace('*', ''));
      } else if (pattern instanceof RegExp) {
        matches = pattern.test(key);
      }

      if (matches) {
        for (const [subscriptionId, subscription] of subscribers.entries()) {
          // Don't notify the agent that made the change
          if (subscription.agentId !== agentId) {
            // C7: Wrap callback in try-catch inside setImmediate
            setImmediate(() => {
              try {
                subscription.callback({
                  key,
                  value,
                  changedBy: agentId,
                  timestamp: Date.now()
                });
              } catch (error) {
                this.emit('subscriptionError', {
                  subscriptionId,
                  key,
                  agentId: subscription.agentId,
                  error: error.message,
                  stack: error.stack
                });
              }
            });
          }
        }
      }
    }
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStatistics() {
    return {
      stateEntries: this.state.size,
      subscribers: Array.from(this.subscribers.values()).reduce((sum, s) => sum + s.size, 0),
      queuedOperations: this.operationQueue.length,
      vectorClockSize: this.vectorClock.size,
      systemState: {
        completedTasks: this.systemState.completedTasks.length,
        pendingTasks: this.systemState.pendingTasks.length,
        failedTasks: this.systemState.failedTasks.length,
        filesModified: this.systemState.filesModified.length,
        filesCreated: this.systemState.filesCreated.length
      }
    };
  }

  /**
   * Clear all state (for testing)
   */
  async clear() {
    this.state.clear();
    this.subscribers.clear();
    this.operationQueue = [];
    this.vectorClock.clear();
    this.systemState = {
      currentTask: null,
      completedTasks: [],
      pendingTasks: [],
      failedTasks: [],
      budgetUsed: 0,
      budgetRemaining: 0,
      filesModified: [],
      filesCreated: [],
      agents: [],
      projectInfo: {},
      config: {}
    };
  }

  /**
   * Cleanup resources and prepare for shutdown
   */
  async cleanup() {
    console.log('[StateManager] Cleaning up resources...');

    // Process remaining operations with timeout
    const startTime = Date.now();
    const maxWait = 5000; // 5 seconds

    while (this.operationQueue.length > 0 && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.operationQueue.length > 0) {
      console.warn(`[StateManager] ${this.operationQueue.length} operations still pending after cleanup timeout`);
    }

    // Clear all subscribers
    const subscriberCount = Array.from(this.subscribers.values()).reduce((sum, s) => sum + s.size, 0);
    this.subscribers.clear();

    console.log(`[StateManager] Cleanup complete: ${subscriberCount} subscribers removed`);

    this.emit('cleaned', {
      pendingOperations: this.operationQueue.length,
      subscribersRemoved: subscriberCount,
      timestamp: Date.now()
    });
  }
}

module.exports = StateManager;
