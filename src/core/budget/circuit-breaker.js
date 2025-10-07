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
    console.debug(`[CircuitBreaker] State mutex acquisition requested, current state: ${this.state}`);

    let unlock;
    const nextMutex = new Promise(resolve => {
      unlock = resolve;
    });

    const currentMutex = this.stateTransitionMutex;
    this.stateTransitionMutex = nextMutex;

    await currentMutex;
    console.debug(`[CircuitBreaker] State mutex acquired`);
    return unlock;
  }

  /**
   * Check if operation can proceed
   * Note: This method is synchronous for performance, but state transitions are serialized
   * @returns {boolean}
   */
  canExecute() {
    const now = Date.now();
    const result = this._determineCanExecute(now);

    console.debug(`[CircuitBreaker] canExecute check:`, {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      now,
      nextAttemptTime: this.nextAttemptTime,
      timeUntilNextAttempt: this.nextAttemptTime ? this.nextAttemptTime - now : null,
      canExecute: result
    });

    return result;
  }

  /**
   * Internal logic for canExecute
   * @private
   */
  _determineCanExecute(now) {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      // Check if enough time has passed to try again
      // Note: Actual state transition to HALF_OPEN happens in recordSuccess/recordFailure
      if (now >= this.nextAttemptTime) {
        console.log(`[CircuitBreaker] Reset timeout elapsed, allowing test request`, {
          resetTimeout: this.resetTimeout,
          timeSinceFailure: now - this.lastFailureTime
        });
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
    console.log(`[CircuitBreaker] recordSuccess called, current state:`, {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount
    });

    const unlock = await this._acquireStateMutex();

    try {
      const previousState = this.state;
      const previousSuccessCount = this.successCount;

      this.failureCount = 0;
      console.debug(`[CircuitBreaker] Failure count reset to 0`);

      // Handle state transitions based on current state
      if (this.state === 'OPEN') {
        // If we're OPEN but can execute (past timeout), transition to HALF_OPEN
        const now = Date.now();
        if (now >= this.nextAttemptTime) {
          this.state = 'HALF_OPEN';
          this.successCount = 1;
          console.log(`[CircuitBreaker] State transition: OPEN -> HALF_OPEN`, {
            reason: 'success after timeout',
            successCount: this.successCount,
            successThreshold: this.successThreshold
          });
        } else {
          console.warn(`[CircuitBreaker] Success recorded in OPEN state but timeout not elapsed`, {
            now,
            nextAttemptTime: this.nextAttemptTime,
            timeRemaining: this.nextAttemptTime - now
          });
        }
      } else if (this.state === 'HALF_OPEN') {
        this.successCount++;
        console.log(`[CircuitBreaker] Success counter incremented in HALF_OPEN:`, {
          successCount: this.successCount,
          successThreshold: this.successThreshold,
          remaining: this.successThreshold - this.successCount
        });

        if (this.successCount >= this.successThreshold) {
          this.state = 'CLOSED';
          this.successCount = 0;
          console.log(`[CircuitBreaker] State transition: HALF_OPEN -> CLOSED`, {
            reason: 'success threshold reached',
            successesRecorded: previousSuccessCount + 1
          });
        }
      } else {
        // Already CLOSED, stay CLOSED
        this.state = 'CLOSED';
        console.debug(`[CircuitBreaker] Success recorded in CLOSED state (normal operation)`);
      }

      if (previousState !== this.state) {
        console.log(`[CircuitBreaker] State changed: ${previousState} -> ${this.state}`);
      }
    } finally {
      console.debug(`[CircuitBreaker] State mutex released after recordSuccess`);
      unlock();
    }
  }

  /**
   * Record failed operation
   * FIX B5: Now uses mutex to serialize state transitions
   */
  async recordFailure() {
    console.log(`[CircuitBreaker] recordFailure called, current state:`, {
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold
    });

    const unlock = await this._acquireStateMutex();

    try {
      const previousState = this.state;
      const previousFailureCount = this.failureCount;

      this.failureCount++;
      this.lastFailureTime = Date.now();

      console.log(`[CircuitBreaker] Failure counter updated:`, {
        previousCount: previousFailureCount,
        newCount: this.failureCount,
        threshold: this.failureThreshold,
        remaining: this.failureThreshold - this.failureCount
      });

      if (this.state === 'HALF_OPEN') {
        // Failed while testing - go back to OPEN
        this.state = 'OPEN';
        this.nextAttemptTime = this.lastFailureTime + this.resetTimeout;
        this.successCount = 0;
        console.warn(`[CircuitBreaker] State transition: HALF_OPEN -> OPEN`, {
          reason: 'test failed',
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
          resetTimeout: this.resetTimeout
        });
        return;
      }

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttemptTime = this.lastFailureTime + this.resetTimeout;
        console.error(`[CircuitBreaker] State transition: ${previousState} -> OPEN`, {
          reason: 'failure threshold exceeded',
          failureCount: this.failureCount,
          failureThreshold: this.failureThreshold,
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
          resetTimeout: this.resetTimeout
        });
      } else {
        console.log(`[CircuitBreaker] Failure recorded but threshold not reached:`, {
          state: this.state,
          failureCount: this.failureCount,
          threshold: this.failureThreshold
        });
      }

      if (previousState !== this.state) {
        console.log(`[CircuitBreaker] State changed: ${previousState} -> ${this.state}`);
      }
    } finally {
      console.debug(`[CircuitBreaker] State mutex released after recordFailure`);
      unlock();
    }
  }

  /**
   * Manually reset circuit breaker
   */
  reset() {
    console.log(`[CircuitBreaker] Manual reset requested`, {
      previousState: this.state,
      previousFailureCount: this.failureCount,
      previousSuccessCount: this.successCount
    });

    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    console.log(`[CircuitBreaker] Reset complete, state: CLOSED`);
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
