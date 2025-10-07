/**
 * Distributed Lock Manager
 * Handles resource locking with deadlock detection and timeout
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const DeadlockDetector = require('./deadlock-detector');
const { LockError, DeadlockError, TimeoutError } = require('../../utils/errors');

class DistributedLockManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      defaultTimeout: options.defaultTimeout || 30000, // 30 seconds
      cleanupInterval: options.cleanupInterval || 5000 // 5 seconds
    };

    // Lock registry: resourceId -> lock info
    this.locks = new Map();

    // Lock queue: resourceId -> waiting agents
    this.lockQueue = new Map();

    // Deadlock detection
    this.deadlockDetector = new DeadlockDetector();

    // Start cleanup
    this._startCleanup();
  }

  /**
   * Acquire lock on resource
   * @param {string} resourceId
   * @param {string} agentId
   * @param {number} timeout
   * @returns {Promise<string>} lockId
   */
  async acquireLock(resourceId, agentId, timeout = null) {
    const lockId = uuidv4();
    const lockTimeout = timeout || this.options.defaultTimeout;
    const expiresAt = Date.now() + lockTimeout;

    // Check for deadlock before waiting
    if (this.deadlockDetector.wouldCauseDeadlock(agentId, resourceId)) {
      const status = this.deadlockDetector.getStatus();
      throw new DeadlockError(
        `Acquiring lock on ${resourceId} would cause deadlock`,
        {
          agentId,
          resourceId,
          potentialCycles: status.potentialDeadlocks
        }
      );
    }

    return new Promise((resolve, reject) => {
      const attemptAcquire = () => {
        // Check if lock is available
        const currentLock = this.locks.get(resourceId);

        if (!currentLock || this._isExpired(currentLock)) {
          // Lock is available
          this._grantLock(resourceId, agentId, lockId, expiresAt);
          resolve(lockId);
          return;
        }

        // Lock is held, check if we've timed out
        if (Date.now() >= expiresAt) {
          // FIX B6: Mark as cancelled before removing from queue
          this._markAsCancelled(resourceId, lockId);
          this._removeFromQueue(resourceId, lockId);
          this.deadlockDetector.waitForGraph.get(agentId)?.delete(resourceId);

          reject(new TimeoutError(
            `Failed to acquire lock on ${resourceId} within ${lockTimeout}ms`,
            { resourceId, agentId, lockId, timeout: lockTimeout }
          ));
          return;
        }

        // Add to wait queue
        if (!this.lockQueue.has(resourceId)) {
          this.lockQueue.set(resourceId, []);
        }

        this.lockQueue.get(resourceId).push({
          lockId,
          agentId,
          expiresAt,
          resolve,
          reject,
          cancelled: false  // FIX B6: Track cancellation state
        });

        // Record wait edge for deadlock detection
        this.deadlockDetector.addWaitEdge(agentId, resourceId);
      };

      attemptAcquire();
    });
  }

  /**
   * Release lock
   * @param {string} lockId
   * @returns {boolean}
   */
  async releaseLock(lockId) {
    // Find resource for this lock
    let resourceId = null;
    for (const [rid, lock] of this.locks.entries()) {
      if (lock.lockId === lockId) {
        resourceId = rid;
        break;
      }
    }

    if (!resourceId) {
      throw new LockError(`Unknown lock ID: ${lockId}`);
    }

    const lock = this.locks.get(resourceId);

    // Remove lock
    this.locks.delete(resourceId);
    this.deadlockDetector.releaseResource(resourceId);

    this.emit('lockReleased', {
      lockId,
      resourceId,
      agentId: lock.agentId,
      heldDuration: Date.now() - lock.acquiredAt
    });

    // Process queue for this resource
    await this._processQueue(resourceId);

    return true;
  }

  /**
   * Verify lock ownership
   * @param {string} lockId
   * @param {string} agentId
   * @returns {boolean}
   */
  async verifyLock(lockId, agentId) {
    for (const lock of this.locks.values()) {
      if (lock.lockId === lockId) {
        // Check if lock is expired
        if (this._isExpired(lock)) {
          return false;
        }

        return lock.agentId === agentId;
      }
    }

    return false;
  }

  /**
   * Get lock info
   * @param {string} resourceId
   * @returns {Object|null}
   */
  getLockInfo(resourceId) {
    const lock = this.locks.get(resourceId);

    if (!lock) {
      return null;
    }

    return {
      resourceId,
      lockId: lock.lockId,
      agentId: lock.agentId,
      acquiredAt: lock.acquiredAt,
      expiresAt: lock.expiresAt,
      age: Date.now() - lock.acquiredAt,
      timeRemaining: Math.max(0, lock.expiresAt - Date.now()),
      isExpired: this._isExpired(lock)
    };
  }

  /**
   * Grant lock to agent
   * @private
   */
  _grantLock(resourceId, agentId, lockId, expiresAt) {
    this.locks.set(resourceId, {
      resourceId,
      lockId,
      agentId,
      acquiredAt: Date.now(),
      expiresAt
    });

    this.deadlockDetector.acquireResource(agentId, resourceId);

    this.emit('lockAcquired', {
      lockId,
      resourceId,
      agentId,
      expiresAt
    });
  }

  /**
   * Process lock queue for resource
   * FIX B6: Now checks for cancellation before granting lock
   * @private
   */
  async _processQueue(resourceId) {
    const queue = this.lockQueue.get(resourceId);

    if (!queue || queue.length === 0) {
      return;
    }

    // Get next waiter
    const waiter = queue.shift();

    // FIX B6: Check if request was cancelled (important to check before expiration)
    if (waiter.cancelled) {
      // Skip cancelled requests and try next waiter
      await this._processQueue(resourceId);
      return;
    }

    // Check if request has expired
    if (Date.now() >= waiter.expiresAt) {
      waiter.reject(new TimeoutError(
        `Lock request expired while waiting`,
        { resourceId, lockId: waiter.lockId }
      ));

      // Try next waiter
      await this._processQueue(resourceId);
      return;
    }

    // Grant lock to next waiter
    this._grantLock(resourceId, waiter.agentId, waiter.lockId, waiter.expiresAt);
    waiter.resolve(waiter.lockId);

    // Clean up empty queue
    if (queue.length === 0) {
      this.lockQueue.delete(resourceId);
    }
  }

  /**
   * Mark a lock request as cancelled (FIX B6: Lock Leak on Timeout)
   * This prevents cancelled requests from being granted locks later
   * @private
   */
  _markAsCancelled(resourceId, lockId) {
    const queue = this.lockQueue.get(resourceId);

    if (!queue) {
      return;
    }

    const waiter = queue.find(w => w.lockId === lockId);
    if (waiter) {
      waiter.cancelled = true;
    }
  }

  /**
   * Remove request from queue
   * @private
   */
  _removeFromQueue(resourceId, lockId) {
    const queue = this.lockQueue.get(resourceId);

    if (!queue) {
      return;
    }

    const index = queue.findIndex(w => w.lockId === lockId);
    if (index !== -1) {
      queue.splice(index, 1);
    }

    if (queue.length === 0) {
      this.lockQueue.delete(resourceId);
    }
  }

  /**
   * Check if lock is expired
   * @private
   */
  _isExpired(lock) {
    return Date.now() >= lock.expiresAt;
  }

  /**
   * Cleanup expired locks
   * @private
   */
  async _cleanup() {
    const now = Date.now();
    const expired = [];

    for (const [resourceId, lock] of this.locks.entries()) {
      if (now >= lock.expiresAt) {
        expired.push({ resourceId, lock });
      }
    }

    // Release expired locks
    for (const { resourceId, lock } of expired) {
      this.locks.delete(resourceId);
      this.deadlockDetector.releaseResource(resourceId);

      this.emit('lockExpired', {
        lockId: lock.lockId,
        resourceId,
        agentId: lock.agentId
      });

      // Process queue
      await this._processQueue(resourceId);
    }
  }

  /**
   * Start cleanup interval
   * @private
   */
  _startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this._cleanup().catch(err => {
        this.emit('error', new LockError('Cleanup failed', { error: err.message }));
      });
    }, this.options.cleanupInterval);
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
   * Cleanup resources and prepare for shutdown
   */
  async cleanup() {
    console.log('[DistributedLockManager] Cleaning up resources...');

    // Stop cleanup interval
    this.stopCleanup();

    // Release all locks
    const lockCount = this.locks.size;
    const queuedCount = Array.from(this.lockQueue.values()).reduce((sum, q) => sum + q.length, 0);

    // Reject all queued lock requests
    for (const [resourceId, queue] of this.lockQueue.entries()) {
      for (const request of queue) {
        request.reject(new LockError('Lock manager is shutting down', { resourceId }));
      }
    }

    // Clear all data structures
    this.locks.clear();
    this.lockQueue.clear();
    this.deadlockDetector.clear();

    console.log(`[DistributedLockManager] Cleanup complete: ${lockCount} locks released, ${queuedCount} queued requests rejected`);

    this.emit('cleaned', {
      locksReleased: lockCount,
      queuedRequestsRejected: queuedCount,
      timestamp: Date.now()
    });
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStatistics() {
    const deadlockStatus = this.deadlockDetector.getStatus();

    return {
      activeLocks: this.locks.size,
      queuedRequests: Array.from(this.lockQueue.values()).reduce((sum, q) => sum + q.length, 0),
      resources: Array.from(this.locks.keys()),
      deadlockDetection: deadlockStatus
    };
  }

  /**
   * Clear all locks (for testing)
   */
  clear() {
    this.locks.clear();
    this.lockQueue.clear();
    this.deadlockDetector.clear();
  }
}

module.exports = DistributedLockManager;
