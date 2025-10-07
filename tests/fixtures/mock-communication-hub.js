/**
 * Mock Communication Hub for testing
 * Does not make API calls
 */

const EventEmitter = require('events');

class MockCommunicationHub extends EventEmitter {
  constructor() {
    super();
    this.messages = [];
    this.budgetManager = new MockBudgetManager();
    this.stateManager = new MockStateManager();
    this.lockManager = new MockLockManager();
  }

  async sendMessage(message) {
    this.messages.push(message);
    return { success: true, messageId: `msg-${Date.now()}` };
  }

  getMessages() {
    return this.messages;
  }

  clearMessages() {
    this.messages = [];
  }
}

class MockBudgetManager extends EventEmitter {
  constructor() {
    super();
    this.totalUsed = 0;
    this.maxBudget = 100;
    this.operations = new Map();
  }

  async validateOperation(operationId, estimatedCost, agentId) {
    if (this.totalUsed + estimatedCost > this.maxBudget) {
      throw new Error('Budget exceeded');
    }
    this.operations.set(operationId, { estimated: estimatedCost, agentId });
    return true;
  }

  async recordUsage(operationId, actualCost) {
    this.totalUsed += actualCost;
    const op = this.operations.get(operationId);
    if (op) {
      op.actual = actualCost;
    }
  }

  getStatus() {
    return {
      totalUsed: this.totalUsed,
      remaining: this.maxBudget - this.totalUsed,
      maxBudget: this.maxBudget
    };
  }

  reset() {
    this.totalUsed = 0;
    this.operations.clear();
  }
}

class MockStateManager extends EventEmitter {
  constructor() {
    super();
    this.state = new Map();
  }

  async read(key, agentId) {
    return this.state.get(key) || null;
  }

  async write(key, value, agentId) {
    this.state.set(key, { value, version: 1, lastModified: Date.now() });
    return { version: 1, timestamp: Date.now() };
  }

  async subscribe(pattern, callback, agentId) {
    return `sub-${Date.now()}`;
  }

  clear() {
    this.state.clear();
  }
}

class MockLockManager extends EventEmitter {
  constructor() {
    super();
    this.locks = new Map();
  }

  async acquireLock(resource, agentId, timeout) {
    const lockId = `lock-${Date.now()}`;
    this.locks.set(lockId, { resource, agentId, acquiredAt: Date.now() });
    return lockId;
  }

  async releaseLock(lockId, agentId) {
    this.locks.delete(lockId);
    return true;
  }

  async verifyLock(lockId, agentId) {
    return this.locks.has(lockId);
  }

  clear() {
    this.locks.clear();
  }
}

module.exports = {
  MockCommunicationHub,
  MockBudgetManager,
  MockStateManager,
  MockLockManager
};
