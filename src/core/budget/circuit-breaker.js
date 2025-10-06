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
  }

  /**
   * Check if operation can proceed
   * @returns {boolean}
   */
  canExecute() {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      const now = Date.now();

      // Check if enough time has passed to try again
      if (now >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        return true;
      }

      return false;
    }

    // HALF_OPEN state - allow attempt
    return true;
  }

  /**
   * Record successful operation
   */
  recordSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    } else {
      this.state = 'CLOSED';
    }
  }

  /**
   * Record failed operation
   */
  recordFailure() {
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
