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

    console.log(`[DistributedLockManager] Lock acquisition requested:`, {
      lockId,
      resourceId,
      agentId,
      timeout: lockTimeout,
      expiresAt: new Date(expiresAt).toISOString(),
      currentLockHolder: this.locks.get(resourceId)?.agentId,
      queueLength: this.lockQueue.get(resourceId)?.length || 0
    });

    // Check for deadlock before waiting
    const wouldDeadlock = this.deadlockDetector.wouldCauseDeadlock(agentId, resourceId);
    console.debug(`[DistributedLockManager] Deadlock check:`, {
      resourceId,
      agentId,
      wouldDeadlock
    });

    if (wouldDeadlock) {
      const status = this.deadlockDetector.getStatus();
      console.error(`[DistributedLockManager] Deadlock detected:`, {
        resourceId,
        agentId,
        potentialCycles: status.potentialDeadlocks
      });
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
        const now = Date.now();

        // Check if lock is available
        const currentLock = this.locks.get(resourceId);
        const isAvailable = !currentLock || this._isExpired(currentLock);

        console.debug(`[DistributedLockManager] Lock availability check:`, {
          lockId,
          resourceId,
          agentId,
          hasCurrentLock: !!currentLock,
          currentLockExpired: currentLock ? this._isExpired(currentLock) : null,
          isAvailable
        });

        if (isAvailable) {
          // Lock is available
          console.log(`[DistributedLockManager] Lock available, granting immediately:`, {
            lockId,
            resourceId,
            agentId
          });
          this._grantLock(resourceId, agentId, lockId, expiresAt);
          resolve(lockId);
          return;
        }

        // Lock is held, check if we've timed out
        if (now >= expiresAt) {
          console.warn(`[DistributedLockManager] Lock request timed out:`, {
            lockId,
            resourceId,
            agentId,
            timeout: lockTimeout,
            currentLockHolder: currentLock?.agentId
          });

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

        const queue = this.lockQueue.get(resourceId);
        queue.push({
          lockId,
          agentId,
          expiresAt,
          resolve,
          reject,
          cancelled: false  // FIX B6: Track cancellation state
        });

        console.log(`[DistributedLockManager] Added to wait queue:`, {
          lockId,
          resourceId,
          agentId,
          queuePosition: queue.length,
          queueLength: queue.length,
          currentLockHolder: currentLock?.agentId,
          timeRemaining: expiresAt - now
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
    console.log(`[DistributedLockManager] Lock release requested:`, {
      lockId
    });

    // Find resource for this lock
    let resourceId = null;
    for (const [rid, lock] of this.locks.entries()) {
      if (lock.lockId === lockId) {
        resourceId = rid;
        break;
      }
    }

    if (!resourceId) {
      console.error(`[DistributedLockManager] Cannot release unknown lock:`, {
        lockId,
        activeLocks: this.locks.size
      });
      throw new LockError(`Unknown lock ID: ${lockId}`);
    }

    const lock = this.locks.get(resourceId);
    const heldDuration = Date.now() - lock.acquiredAt;

    console.log(`[DistributedLockManager] Releasing lock:`, {
      lockId,
      resourceId,
      agentId: lock.agentId,
      heldDuration,
      queueLength: this.lockQueue.get(resourceId)?.length || 0
    });

    // Remove lock
    this.locks.delete(resourceId);
    this.deadlockDetector.releaseResource(resourceId);

    console.debug(`[DistributedLockManager] Lock removed from registry:`, {
      resourceId,
      remainingLocks: this.locks.size
    });

    this.emit('lockReleased', {
      lockId,
      resourceId,
      agentId: lock.agentId,
      heldDuration
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
    const acquiredAt = Date.now();

    console.log(`[DistributedLockManager] Granting lock:`, {
      lockId,
      resourceId,
      agentId,
      acquiredAt: new Date(acquiredAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      duration: expiresAt - acquiredAt
    });

    this.locks.set(resourceId, {
      resourceId,
      lockId,
      agentId,
      acquiredAt,
      expiresAt
    });

    this.deadlockDetector.acquireResource(agentId, resourceId);

    console.debug(`[DistributedLockManager] Lock registered:`, {
      resourceId,
      totalActiveLocks: this.locks.size
    });

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

    console.debug(`[DistributedLockManager] Processing queue:`, {
      resourceId,
      queueExists: !!queue,
      queueLength: queue?.length || 0
    });

    if (!queue || queue.length === 0) {
      console.debug(`[DistributedLockManager] Queue empty, nothing to process:`, {
        resourceId
      });
      return;
    }

    // Get next waiter
    const waiter = queue.shift();
    const now = Date.now();

    console.log(`[DistributedLockManager] Processing next waiter:`, {
      resourceId,
      lockId: waiter.lockId,
      agentId: waiter.agentId,
      cancelled: waiter.cancelled,
      expired: now >= waiter.expiresAt,
      timeRemaining: waiter.expiresAt - now,
      remainingInQueue: queue.length
    });

    // FIX B6: Check if request was cancelled (important to check before expiration)
    if (waiter.cancelled) {
      console.warn(`[DistributedLockManager] Skipping cancelled waiter:`, {
        resourceId,
        lockId: waiter.lockId,
        agentId: waiter.agentId
      });
      // Skip cancelled requests and try next waiter
      await this._processQueue(resourceId);
      return;
    }

    // Check if request has expired
    if (now >= waiter.expiresAt) {
      console.warn(`[DistributedLockManager] Waiter expired while in queue:`, {
        resourceId,
        lockId: waiter.lockId,
        agentId: waiter.agentId,
        expiresAt: new Date(waiter.expiresAt).toISOString()
      });

      waiter.reject(new TimeoutError(
        `Lock request expired while waiting`,
        { resourceId, lockId: waiter.lockId }
      ));

      // Try next waiter
      await this._processQueue(resourceId);
      return;
    }

    // Grant lock to next waiter
    console.log(`[DistributedLockManager] Granting lock to next waiter:`, {
      resourceId,
      lockId: waiter.lockId,
      agentId: waiter.agentId
    });

    this._grantLock(resourceId, waiter.agentId, waiter.lockId, waiter.expiresAt);
    waiter.resolve(waiter.lockId);

    // Clean up empty queue
    if (queue.length === 0) {
      console.debug(`[DistributedLockManager] Queue now empty:`, { resourceId });
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
      console.debug(`[DistributedLockManager] No queue to mark cancellation:`, {
        resourceId,
        lockId
      });
      return;
    }

    const waiter = queue.find(w => w.lockId === lockId);
    if (waiter) {
      waiter.cancelled = true;
      console.log(`[DistributedLockManager] Marked lock request as cancelled:`, {
        resourceId,
        lockId,
        agentId: waiter.agentId,
        queuePosition: queue.indexOf(waiter) + 1,
        queueLength: queue.length
      });
    } else {
      console.debug(`[DistributedLockManager] Lock request not found in queue:`, {
        resourceId,
        lockId
      });
    }
  }

  /**
   * Remove request from queue
   * @private
   */
  _removeFromQueue(resourceId, lockId) {
    const queue = this.lockQueue.get(resourceId);

    if (!queue) {
      console.debug(`[DistributedLockManager] No queue to remove from:`, {
        resourceId,
        lockId
      });
      return;
    }

    const index = queue.findIndex(w => w.lockId === lockId);
    if (index !== -1) {
      const removed = queue.splice(index, 1)[0];
      console.log(`[DistributedLockManager] Removed request from queue:`, {
        resourceId,
        lockId,
        agentId: removed.agentId,
        wasAtPosition: index + 1,
        remainingInQueue: queue.length
      });
    } else {
      console.debug(`[DistributedLockManager] Lock request not found to remove:`, {
        resourceId,
        lockId
      });
    }

    if (queue.length === 0) {
      console.debug(`[DistributedLockManager] Queue empty after removal:`, { resourceId });
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

    console.debug(`[DistributedLockManager] Cleanup cycle starting:`, {
      timestamp: new Date(now).toISOString(),
      activeLocks: this.locks.size,
      totalQueued: Array.from(this.lockQueue.values()).reduce((sum, q) => sum + q.length, 0)
    });

    for (const [resourceId, lock] of this.locks.entries()) {
      const isExpired = now >= lock.expiresAt;
      const age = now - lock.acquiredAt;

      console.debug(`[DistributedLockManager] Checking lock:`, {
        resourceId,
        lockId: lock.lockId,
        agentId: lock.agentId,
        age,
        expiresAt: new Date(lock.expiresAt).toISOString(),
        isExpired
      });

      if (isExpired) {
        expired.push({ resourceId, lock });
      }
    }

    // Release expired locks
    for (const { resourceId, lock } of expired) {
      console.warn(`[DistributedLockManager] Releasing expired lock:`, {
        resourceId,
        lockId: lock.lockId,
        agentId: lock.agentId,
        heldDuration: now - lock.acquiredAt,
        expiredBy: now - lock.expiresAt
      });

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

    console.log(`[DistributedLockManager] Cleanup cycle complete:`, {
      expiredCount: expired.length,
      remainingLocks: this.locks.size,
      totalQueued: Array.from(this.lockQueue.values()).reduce((sum, q) => sum + q.length, 0)
    });
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
