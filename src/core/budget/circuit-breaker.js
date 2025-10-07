/**
 * Circuit Breaker for Budget System
 * Prevents cascade failures when budget validation repeatedly fails
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.successThreshold = options.successThreshold || 2; // successes needed to close from half-open

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    // FIX B5: State transition queue to prevent race conditions
    // Ensures state transitions are serialized
    this.stateTransitionMutex = Promise.resolve();
  }

  /**
   * Acquire mutex for state transitions (FIX B5: Circuit Breaker State Race)
   * @private
   * @returns {Promise<Function>} unlock function
   */
  async _acquireStateMutex() {
    let unlock;
    const nextMutex = new Promise(resolve => {
      unlock = resolve;
    });

    const currentMutex = this.stateTransitionMutex;
    this.stateTransitionMutex = nextMutex;

    await currentMutex;
    return unlock;
  }

  /**
   * Check if operation can proceed
   * Note: This method is synchronous for performance, but state transitions are serialized
   * @returns {boolean}
   */
  canExecute() {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      const now = Date.now();

      // Check if enough time has passed to try again
      // Note: Actual state transition to HALF_OPEN happens in recordSuccess/recordFailure
      if (now >= this.nextAttemptTime) {
        return true;
      }

      return false;
    }

    // HALF_OPEN state - allow attempt
    return true;
  }

  /**
   * Record successful operation
   * FIX B5: Now uses mutex to serialize state transitions
   */
  async recordSuccess() {
    const unlock = await this._acquireStateMutex();

    try {
      this.failureCount = 0;

      // Handle state transitions based on current state
      if (this.state === 'OPEN') {
        // If we're OPEN but can execute (past timeout), transition to HALF_OPEN
        const now = Date.now();
        if (now >= this.nextAttemptTime) {
          this.state = 'HALF_OPEN';
          this.successCount = 1;
        }
      } else if (this.state === 'HALF_OPEN') {
        this.successCount++;

        if (this.successCount >= this.successThreshold) {
          this.state = 'CLOSED';
          this.successCount = 0;
        }
      } else {
        // Already CLOSED, stay CLOSED
        this.state = 'CLOSED';
      }
    } finally {
      unlock();
    }
  }

  /**
   * Record failed operation
   * FIX B5: Now uses mutex to serialize state transitions
   */
  async recordFailure() {
    const unlock = await this._acquireStateMutex();

    try {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.state === 'HALF_OPEN') {
        // Failed while testing - go back to OPEN
        this.state = 'OPEN';
        this.nextAttemptTime = this.lastFailureTime + this.resetTimeout;
        this.successCount = 0;
        return;
      }

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttemptTime = this.lastFailureTime + this.resetTimeout;
      }
    } finally {
      unlock();
    }
  }

  /**
   * Manually reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * Get current state information
   * @returns {Object}
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      canExecute: this.canExecute()
    };
  }
}

module.exports = CircuitBreaker;
