/**
 * State Manager
 * Manages system state with eventual consistency and checkpointing
 */

const EventEmitter = require('events');
const CheckpointManager = require('./checkpoint');
const { StateError, ConcurrencyError } = require('../../utils/errors');
const fs = require('fs-extra');
const path = require('path');
const { getLogger } = require('../logging/logger');

class StateManager extends EventEmitter {
  constructor(outputDir, options = {}) {
    super();

    this.logger = options.logger || getLogger();
    this.outputDir = outputDir;
    this.state = new Map();
    this.subscribers = new Map();
    this.operationQueue = [];
    this.isProcessing = false;
    this.vectorClock = new Map();
    this.checkpointManager = new CheckpointManager(outputDir);

    // Archival configuration
    this.archivalConfig = {
      enabled: process.env.STATE_ARCHIVAL_ENABLED !== 'false', // Default enabled
      archiveThreshold: parseInt(process.env.STATE_ARCHIVE_THRESHOLD) || 86400000, // 24 hours
      archiveDir: path.join(outputDir, '.codeswarm', 'state-archive'),
      pruneThreshold: parseInt(process.env.STATE_PRUNE_THRESHOLD) || 172800000, // 48 hours
      archiveInterval: parseInt(process.env.STATE_ARCHIVE_INTERVAL) || 3600000 // 1 hour
    };

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

    // Archival metrics
    this.archivalMetrics = {
      archived: 0,
      pruned: 0,
      memoryReclaimed: 0
    };

    // Start archival interval if enabled
    if (this.archivalConfig.enabled) {
      this._startArchivalInterval();
    }
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
   * Start archival interval
   * @private
   */
  _startArchivalInterval() {
    if (this.archivalInterval) return;

    this.logger.state('[StateManager] Starting state archival system');

    this.archivalInterval = setInterval(async () => {
      try {
        await this.archiveOldState();
      } catch (error) {
        this.logger.error('[StateManager] Archival error:', error.message);
      }
    }, this.archivalConfig.archiveInterval);
  }

  /**
   * Archive old state entries to disk
   * @returns {Promise<Object>} Archival statistics
   */
  async archiveOldState() {
    if (!this.archivalConfig.enabled) {
      return { archived: 0, pruned: 0 };
    }

    const now = Date.now();
    const toArchive = [];
    const toPrune = [];

    // Identify entries to archive or prune
    for (const [key, entry] of this.state.entries()) {
      const age = now - (entry.lastModified || entry.timestamp || 0);

      if (age > this.archivalConfig.pruneThreshold) {
        // Very old entries - prune entirely
        toPrune.push(key);
      } else if (age > this.archivalConfig.archiveThreshold) {
        // Old entries - archive to disk
        toArchive.push({ key, entry });
      }
    }

    // Archive entries
    if (toArchive.length > 0) {
      await this._archiveToDisk(toArchive);

      // Remove from memory after archiving
      for (const { key } of toArchive) {
        const entry = this.state.get(key);
        if (entry) {
          const size = JSON.stringify(entry).length;
          this.archivalMetrics.memoryReclaimed += size;
        }
        this.state.delete(key);
      }

      this.archivalMetrics.archived += toArchive.length;
    }

    // Prune very old entries
    if (toPrune.length > 0) {
      for (const key of toPrune) {
        this.state.delete(key);
      }
      this.archivalMetrics.pruned += toPrune.length;
    }

    if (toArchive.length > 0 || toPrune.length > 0) {
      this.logger.state(`[StateManager] Archived ${toArchive.length} entries, pruned ${toPrune.length} entries`);
      this.logger.state(`[StateManager] Memory reclaimed: ${Math.round(this.archivalMetrics.memoryReclaimed / 1024)}KB`);

      this.emit('stateArchived', {
        archived: toArchive.length,
        pruned: toPrune.length,
        remainingEntries: this.state.size,
        timestamp: Date.now()
      });
    }

    return {
      archived: toArchive.length,
      pruned: toPrune.length,
      remainingEntries: this.state.size
    };
  }

  /**
   * Archive entries to disk
   * @private
   */
  async _archiveToDisk(entries) {
    await fs.ensureDir(this.archivalConfig.archiveDir);

    const archiveFile = path.join(
      this.archivalConfig.archiveDir,
      `archive-${Date.now()}.json`
    );

    const archiveData = {
      timestamp: Date.now(),
      entries: entries.map(({ key, entry }) => ({
        key,
        value: entry.value,
        version: entry.version,
        lastModified: entry.lastModified,
        lastModifiedBy: entry.lastModifiedBy
      }))
    };

    await fs.writeJson(archiveFile, archiveData, { spaces: 2 });
  }

  /**
   * Restore archived state if needed
   * @param {string} key - State key to restore
   * @returns {Promise<any>} Restored value or null
   */
  async restoreFromArchive(key) {
    const archiveDir = this.archivalConfig.archiveDir;

    if (!await fs.pathExists(archiveDir)) {
      return null;
    }

    const archiveFiles = (await fs.readdir(archiveDir))
      .filter(f => f.startsWith('archive-') && f.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first

    for (const file of archiveFiles) {
      const archivePath = path.join(archiveDir, file);
      const archive = await fs.readJson(archivePath);

      const entry = archive.entries.find(e => e.key === key);
      if (entry) {
        this.logger.state(`[StateManager] Restored ${key} from archive: ${file}`);
        return entry.value;
      }
    }

    return null;
  }

  /**
   * Get archival statistics
   * @returns {Object}
   */
  getArchivalStats() {
    return {
      ...this.archivalMetrics,
      currentStateSize: this.state.size,
      memoryReclaimedMB: Math.round(this.archivalMetrics.memoryReclaimed / (1024 * 1024) * 100) / 100,
      archivalEnabled: this.archivalConfig.enabled
    };
  }

  /**
   * Cleanup resources and prepare for shutdown
   */
  async cleanup() {
    this.logger.state('[StateManager] Cleaning up resources...');

    // Stop archival interval
    if (this.archivalInterval) {
      clearInterval(this.archivalInterval);
      this.archivalInterval = null;
    }

    // Final archival before shutdown
    if (this.archivalConfig.enabled) {
      await this.archiveOldState();
    }

    // Process remaining operations with timeout
    const startTime = Date.now();
    const maxWait = 5000; // 5 seconds

    while (this.operationQueue.length > 0 && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.operationQueue.length > 0) {
      this.logger.warn(`[StateManager] ${this.operationQueue.length} operations still pending after cleanup timeout`);
    }

    // Clear all subscribers
    const subscriberCount = Array.from(this.subscribers.values()).reduce((sum, s) => sum + s.size, 0);
    this.subscribers.clear();

    this.logger.state(`[StateManager] Cleanup complete: ${subscriberCount} subscribers removed`);

    this.emit('cleaned', {
      pendingOperations: this.operationQueue.length,
      subscribersRemoved: subscriberCount,
      timestamp: Date.now()
    });
  }
}

module.exports = StateManager;
