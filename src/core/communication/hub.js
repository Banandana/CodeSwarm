/**
 * Communication Hub
 * Central coordinator for all agent communication
 * Integrates state management, locking, and budget validation
 */

const EventEmitter = require('events');
const MessageProtocol = require('./protocol');
const { CommunicationError, TimeoutError } = require('../../utils/errors');

class CommunicationHub extends EventEmitter {
  constructor(stateManager, lockManager, budgetManager, options = {}) {
    super();

    this.stateManager = stateManager;
    this.lockManager = lockManager;
    this.budgetManager = budgetManager;

    this.options = {
      maxConcurrentOperations: options.maxConcurrentOperations || 10,
      messageTimeout: options.messageTimeout || 30000,
      retryAttempts: options.retryAttempts || 3,
      ...options
    };

    // Message management
    this.messageQueue = [];
    this.activeOperations = new Map();
    this.pendingResponses = new Map();
    this.processing = false;

    // Subscriptions
    this.subscriptions = new Map();

    // Statistics
    this.stats = {
      messagesProcessed: 0,
      messagesFailed: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };

    // Start message processor
    this._startMessageProcessor();
  }

  /**
   * Route message to appropriate handler
   * @param {Object} message
   * @returns {Promise<any>}
   */
  async routeMessage(message) {
    try {
      // Validate message
      MessageProtocol.validateMessage(message);

      // Budget validation if required
      if (message.requiresBudget && message.estimatedCost) {
        const validation = await this.budgetManager.validateOperation(
          message.id,
          message.estimatedCost,
          message.agentId,
          message.priority === MessageProtocol.PRIORITIES.HIGH ? 'HIGH' : 'MEDIUM'
        );

        if (!validation.approved) {
          throw new CommunicationError('Budget validation failed', {
            messageId: message.id,
            agentId: message.agentId
          });
        }
      }

      // Add to queue with priority
      return await this._enqueueMessage(message);

    } catch (error) {
      this.emit('routingError', {
        messageId: message.id,
        error: error.message
      });
      throw new CommunicationError(
        `Message routing failed: ${error.message}`,
        { message, error: error.message }
      );
    }
  }

  /**
   * Handle READ operations
   * @private
   */
  async _handleRead(message) {
    const { key, consistency = 'eventual' } = message.payload;
    const startTime = Date.now();

    try {
      const value = await this.stateManager.read(key, message.agentId);

      this.emit('operationComplete', {
        type: 'READ',
        agentId: message.agentId,
        key,
        duration: Date.now() - startTime
      });

      return { success: true, data: value };
    } catch (error) {
      throw new CommunicationError(
        `Read operation failed for key ${key}: ${error.message}`
      );
    }
  }

  /**
   * Handle WRITE operations
   * @private
   */
  async _handleWrite(message) {
    const { key, value, lockId, expectedVersion } = message.payload;
    const startTime = Date.now();

    try {
      // Verify lock if provided
      if (lockId) {
        const hasLock = await this.lockManager.verifyLock(lockId, message.agentId);
        if (!hasLock) {
          throw new Error('Invalid or expired lock for write operation');
        }
      }

      const result = await this.stateManager.write(
        key,
        value,
        message.agentId,
        expectedVersion
      );

      this.emit('operationComplete', {
        type: 'WRITE',
        agentId: message.agentId,
        key,
        duration: Date.now() - startTime
      });

      return { success: true, version: result.version };
    } catch (error) {
      throw new CommunicationError(
        `Write operation failed for key ${key}: ${error.message}`
      );
    }
  }

  /**
   * Handle LOCK operations
   * @private
   */
  async _handleLock(message) {
    const { resource, timeout = 30000 } = message.payload;

    try {
      const lockId = await this.lockManager.acquireLock(
        resource,
        message.agentId,
        timeout
      );

      return { success: true, lockId };
    } catch (error) {
      throw new CommunicationError(
        `Lock acquisition failed for ${resource}: ${error.message}`
      );
    }
  }

  /**
   * Handle UNLOCK operations
   * @private
   */
  async _handleUnlock(message) {
    const { lockId } = message.payload;

    try {
      await this.lockManager.releaseLock(lockId);
      return { success: true };
    } catch (error) {
      throw new CommunicationError(
        `Lock release failed: ${error.message}`
      );
    }
  }

  /**
   * Handle SUBSCRIBE operations
   * @private
   */
  async _handleSubscribe(message) {
    const { pattern, callbackId } = message.payload;

    try {
      // Create callback that emits event
      const callback = (change) => {
        this.emit('stateChange', {
          subscriptionId: callbackId,
          agentId: message.agentId,
          change
        });
      };

      const subscriptionId = await this.stateManager.subscribe(
        pattern,
        callback,
        message.agentId
      );

      // Store subscription mapping
      this.subscriptions.set(subscriptionId, {
        agentId: message.agentId,
        pattern,
        callbackId
      });

      return { success: true, subscriptionId };
    } catch (error) {
      throw new CommunicationError(
        `Subscribe failed: ${error.message}`
      );
    }
  }

  /**
   * Handle TASK_ASSIGN operations
   * @private
   */
  async _handleTaskAssign(message) {
    const { task, targetAgentId } = message.payload;

    this.emit('taskAssigned', {
      taskId: task.id,
      fromAgent: message.agentId,
      toAgent: targetAgentId,
      task
    });

    return { success: true, taskId: task.id };
  }

  /**
   * Handle TASK_COMPLETE operations
   * @private
   */
  async _handleTaskComplete(message) {
    const { taskId, result } = message.payload;

    // Record actual budget usage if provided
    if (message.actualCost) {
      await this.budgetManager.recordUsage(message.id, message.actualCost);
    }

    this.emit('taskCompleted', {
      taskId,
      agentId: message.agentId,
      result
    });

    return { success: true, taskId };
  }

  /**
   * Handle HANDOFF operations
   * @private
   */
  async _handleHandoff(message) {
    const { task, targetAgentType, reason } = message.payload;

    this.emit('handoffRequested', {
      taskId: task.id,
      fromAgent: message.agentId,
      toAgentType: targetAgentType,
      reason
    });

    return { success: true, taskId: task.id };
  }

  /**
   * Process message queue
   * @private
   */
  async _processMessageQueue() {
    if (this.processing || this.messageQueue.length === 0) {
      return;
    }

    if (this.activeOperations.size >= this.options.maxConcurrentOperations) {
      return;
    }

    this.processing = true;

    try {
      // Sort by priority and timestamp
      this.messageQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.timestamp - b.timestamp;
      });

      const message = this.messageQueue.shift();

      if (!message) {
        return;
      }

      // Check timeout
      if (Date.now() > message.timeout) {
        const pending = this.pendingResponses.get(message.id);
        if (pending) {
          pending.reject(new TimeoutError(`Message ${message.id} timed out`));
          this.pendingResponses.delete(message.id);
        }
        return;
      }

      // Process message
      setImmediate(() => this._processMessage(message));

    } finally {
      this.processing = false;

      // Continue processing
      if (this.messageQueue.length > 0) {
        setImmediate(() => this._processMessageQueue());
      }
    }
  }

  /**
   * Process individual message
   * @private
   */
  async _processMessage(message) {
    const operationKey = `${message.type}_${message.agentId}_${Date.now()}`;
    this.activeOperations.set(operationKey, message);

    const startTime = Date.now();

    try {
      let result;

      switch (message.type) {
        case MessageProtocol.MESSAGE_TYPES.READ:
          result = await this._handleRead(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.WRITE:
          result = await this._handleWrite(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.LOCK:
          result = await this._handleLock(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.UNLOCK:
          result = await this._handleUnlock(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.SUBSCRIBE:
          result = await this._handleSubscribe(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.TASK_ASSIGN:
          result = await this._handleTaskAssign(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.TASK_COMPLETE:
          result = await this._handleTaskComplete(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.HANDOFF:
          result = await this._handleHandoff(message);
          break;

        default:
          throw new Error(`Unsupported message type: ${message.type}`);
      }

      // Update statistics
      const duration = Date.now() - startTime;
      this.stats.messagesProcessed++;
      this.stats.totalProcessingTime += duration;
      this.stats.averageProcessingTime =
        this.stats.totalProcessingTime / this.stats.messagesProcessed;

      this.emit('messageProcessed', { message, result, duration });

      // Resolve pending promise
      const pending = this.pendingResponses.get(message.id);
      if (pending) {
        pending.resolve(result);
        this.pendingResponses.delete(message.id);
      }

    } catch (error) {
      this.stats.messagesFailed++;

      this.emit('messageError', {
        message,
        error: error.message
      });

      // Retry if possible
      if (MessageProtocol.canRetry(message, this.options.retryAttempts)) {
        const retryMessage = MessageProtocol.createRetryMessage(message);
        this.messageQueue.unshift(retryMessage);
      } else {
        // Reject pending promise
        const pending = this.pendingResponses.get(message.id);
        if (pending) {
          pending.reject(error);
          this.pendingResponses.delete(message.id);
        }
      }
    } finally {
      this.activeOperations.delete(operationKey);
    }
  }

  /**
   * Enqueue message with promise
   * @private
   */
  async _enqueueMessage(message) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(message.id);
        reject(new TimeoutError(`Message ${message.id} timed out in queue`));
      }, message.timeout - Date.now());

      this.pendingResponses.set(message.id, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      this.messageQueue.push(message);

      // Trigger processing
      setImmediate(() => this._processMessageQueue());
    });
  }

  /**
   * Start message processor
   * @private
   */
  _startMessageProcessor() {
    this.processorInterval = setInterval(() => {
      if (this.messageQueue.length > 0) {
        this._processMessageQueue();
      }
    }, 100); // Check every 100ms
  }

  /**
   * Stop message processor
   */
  stopProcessor() {
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
    }
  }

  /**
   * Get status
   * @returns {Object}
   */
  getStatus() {
    return {
      queuedMessages: this.messageQueue.length,
      activeOperations: this.activeOperations.size,
      pendingResponses: this.pendingResponses.size,
      subscriptions: this.subscriptions.size,
      statistics: { ...this.stats }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.emit('shuttingDown');

    this.stopProcessor();

    // Wait for active operations
    const maxWait = 30000;
    const start = Date.now();

    while (this.activeOperations.size > 0 && (Date.now() - start) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.emit('shutdown');
  }
}

module.exports = CommunicationHub;
