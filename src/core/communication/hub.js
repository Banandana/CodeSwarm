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
      maxQueueSize: options.maxQueueSize || 1000, // C6: Prevent queue saturation
      ...options
    };

    // Message management
    this.messageQueue = [];
    this.activeOperations = new Map();
    this.pendingResponses = new Map();
    this.processing = false;

    // Subscriptions - C4: Track subscriptions by agent for cleanup
    this.subscriptions = new Map(); // subscriptionId -> subscription
    this.agentSubscriptions = new Map(); // agentId -> Set<subscriptionId>

    // Statistics
    this.stats = {
      messagesProcessed: 0,
      messagesFailed: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };

    // Start message processor
    this.startMessageProcessor();
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

      // NOTE: Budget validation for CLAUDE_REQUEST is handled by ClaudeClient
      // to avoid double validation and ensure proper operation ID tracking.
      // Other message types that require budget could be validated here in the future.

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
      // C5: Pass consistency parameter to StateManager.read()
      const value = await this.stateManager.read(key, message.agentId, consistency);

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

      // C4: Track subscription by agent for cleanup
      if (!this.agentSubscriptions.has(message.agentId)) {
        this.agentSubscriptions.set(message.agentId, new Set());
      }
      this.agentSubscriptions.get(message.agentId).add(subscriptionId);

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
   * Handle CLAUDE_REQUEST operations
   * @private
   */
  async _handleClaudeRequest(message) {
    // The actual Claude client is in app.js, so we emit an event
    // and the app.js handler will respond
    return new Promise((resolve, reject) => {
      const responseEvent = `CLAUDE_RESPONSE_${message.id}`;
      const errorEvent = `CLAUDE_ERROR_${message.id}`;
      let timeoutId;

      const cleanup = () => {
        this.removeAllListeners(responseEvent);
        this.removeAllListeners(errorEvent);
        if (timeoutId) clearTimeout(timeoutId);
      };

      this.once(responseEvent, (result) => {
        cleanup();
        resolve(result);
      });

      this.once(errorEvent, (error) => {
        cleanup();
        reject(error);
      });

      // Emit the request event
      this.emit('CLAUDE_REQUEST', message);

      // Timeout after 10 minutes for complex responses
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Claude request timed out'));
      }, 600000);
    });
  }

  /**
   * Handle BUDGET_CHECK operations
   * @private
   */
  async _handleBudgetCheck(message) {
    const { estimatedCost, priority } = message.payload;

    const validation = await this.budgetManager.validateOperation(
      message.id,
      estimatedCost,
      message.agentId,
      priority || 'MEDIUM'
    );

    return {
      success: true,
      approved: validation.approved,
      remaining: validation.remaining,
      utilizationPercent: validation.utilizationPercent
    };
  }

  /**
   * Handle BUDGET_STATUS operations
   * @private
   */
  async _handleBudgetStatus(message) {
    const status = await this.budgetManager.getStatus();

    return {
      success: true,
      ...status
    };
  }

  /**
   * Handle FILE_READ operations
   * @private
   */
  async _handleFileRead(message) {
    return new Promise((resolve, reject) => {
      const responseEvent = `FILE_READ_RESPONSE_${message.id}`;
      const errorEvent = `FILE_READ_ERROR_${message.id}`;
      let timeoutId;

      const cleanup = () => {
        this.removeAllListeners(responseEvent);
        this.removeAllListeners(errorEvent);
        if (timeoutId) clearTimeout(timeoutId);
      };

      this.once(responseEvent, (result) => {
        cleanup();
        resolve(result);
      });

      this.once(errorEvent, (error) => {
        cleanup();
        reject(error);
      });

      // Emit the request event
      this.emit('FILE_READ', message);

      // Timeout after 30 seconds
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('File read timeout'));
      }, 30000);
    });
  }

  /**
   * Handle FILE_WRITE operations
   * @private
   */
  async _handleFileWrite(message) {
    return new Promise((resolve, reject) => {
      const responseEvent = `FILE_WRITE_RESPONSE_${message.id}`;
      const errorEvent = `FILE_WRITE_ERROR_${message.id}`;
      let timeoutId;

      const cleanup = () => {
        this.removeAllListeners(responseEvent);
        this.removeAllListeners(errorEvent);
        if (timeoutId) clearTimeout(timeoutId);
      };

      this.once(responseEvent, (result) => {
        cleanup();
        resolve(result);
      });

      this.once(errorEvent, (error) => {
        cleanup();
        reject(error);
      });

      // Emit the request event
      this.emit('FILE_WRITE', message);

      // Timeout after 30 seconds
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('File write timeout'));
      }, 30000);
    });
  }

  /**
   * Handle TASK_FAILED operations
   * @private
   */
  async _handleTaskFailed(message) {
    const { taskId, error, stackTrace } = message.payload;

    this.emit('taskFailed', {
      taskId,
      agentId: message.agentId,
      error,
      stackTrace
    });

    return { success: true, taskId };
  }

  /**
   * Handle UNSUBSCRIBE operations
   * @private
   */
  async _handleUnsubscribe(message) {
    const { subscriptionId } = message.payload;

    try {
      await this.stateManager.unsubscribe(subscriptionId);

      // Remove from subscriptions map
      const subscription = this.subscriptions.get(subscriptionId);
      this.subscriptions.delete(subscriptionId);

      // C4: Remove from agent subscription tracking
      if (subscription && this.agentSubscriptions.has(subscription.agentId)) {
        this.agentSubscriptions.get(subscription.agentId).delete(subscriptionId);
      }

      return { success: true, subscriptionId };
    } catch (error) {
      throw new CommunicationError(
        `Unsubscribe failed: ${error.message}`
      );
    }
  }

  /**
   * Handle HEARTBEAT operations
   * @private
   */
  async _handleHeartbeat(message) {
    const { status, currentTask } = message.payload;

    this.emit('agentHeartbeat', {
      agentId: message.agentId,
      status,
      currentTask,
      timestamp: message.timestamp
    });

    return { success: true, received: true };
  }

  /**
   * Handle STATUS_REQUEST operations
   * @private
   */
  async _handleStatusRequest(message) {
    const status = this.getStatus();

    return {
      success: true,
      status
    };
  }

  /**
   * Handle STATUS_RESPONSE operations
   * @private
   */
  async _handleStatusResponse(message) {
    // Status responses are informational, just emit event
    this.emit('statusReceived', {
      agentId: message.agentId,
      status: message.payload
    });

    return { success: true };
  }

  /**
   * Handle SHUTDOWN operations
   * @private
   */
  async _handleShutdown(message) {
    this.emit('shutdownRequested', {
      agentId: message.agentId,
      reason: message.payload.reason
    });

    return { success: true, acknowledged: true };
  }

  /**
   * Process message queue
   * @private
   *
   * NOTE: This implementation deviates from IMPLEMENTATION.md lines 542-543.
   * Original spec had a blocking `this.processing` flag that prevented concurrent
   * message processing, contradicting the intent of `maxConcurrentOperations`.
   * This fix enables true concurrent processing for scalability with 10+ agents.
   */
  async _processMessageQueue() {
    if (this.messageQueue.length === 0) {
      return;
    }

    // Process multiple messages concurrently up to maxConcurrentOperations
    while (
      this.messageQueue.length > 0 &&
      this.activeOperations.size < this.options.maxConcurrentOperations
    ) {
      // Sort by priority and timestamp
      this.messageQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.timestamp - b.timestamp;
      });

      const message = this.messageQueue.shift();

      if (!message) {
        break;
      }

      // C3: Check timeout - ensure not already handled
      if (Date.now() > message.timeout) {
        const pending = this.pendingResponses.get(message.id);
        if (pending && !pending.handled) {
          pending.handled = true; // Mark as handled to prevent double timeout
          pending.reject(new TimeoutError(`Message ${message.id} timed out`));
          this.pendingResponses.delete(message.id);
        }
        continue;
      }

      // Process message concurrently - fire and forget
      // Errors are handled within _processMessage
      this._processMessage(message).catch(error => {
        // Error already logged in _processMessage
        // This catch prevents unhandled promise rejections
      });
    }

    // Continue processing if queue has more messages
    if (this.messageQueue.length > 0) {
      setImmediate(() => this._processMessageQueue());
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

        case MessageProtocol.MESSAGE_TYPES.CLAUDE_REQUEST:
          result = await this._handleClaudeRequest(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.BUDGET_CHECK:
          result = await this._handleBudgetCheck(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.BUDGET_STATUS:
          result = await this._handleBudgetStatus(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.FILE_READ:
          result = await this._handleFileRead(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.FILE_WRITE:
          result = await this._handleFileWrite(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.TASK_FAILED:
          result = await this._handleTaskFailed(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.UNSUBSCRIBE:
          result = await this._handleUnsubscribe(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.HEARTBEAT:
          result = await this._handleHeartbeat(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.STATUS_REQUEST:
          result = await this._handleStatusRequest(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.STATUS_RESPONSE:
          result = await this._handleStatusResponse(message);
          break;

        case MessageProtocol.MESSAGE_TYPES.SHUTDOWN:
          result = await this._handleShutdown(message);
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
      if (pending && !pending.handled) {
        pending.handled = true; // C3: Mark as handled
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

        // C1: Transfer pendingResponses to new message ID on retry
        const oldPending = this.pendingResponses.get(message.id);
        if (oldPending && !oldPending.handled) {
          this.pendingResponses.set(retryMessage.id, oldPending);
          this.pendingResponses.delete(message.id); // Cleanup old message ID
        }

        this.messageQueue.unshift(retryMessage);
      } else {
        // Reject pending promise
        const pending = this.pendingResponses.get(message.id);
        if (pending && !pending.handled) {
          pending.handled = true; // C3: Mark as handled
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
      // C6: Check queue saturation
      if (this.messageQueue.length >= this.options.maxQueueSize) {
        reject(new CommunicationError(
          `Message queue full (${this.messageQueue.length}/${this.options.maxQueueSize}). System is saturated.`,
          { messageId: message.id, agentId: message.agentId }
        ));
        return;
      }

      const timeoutId = setTimeout(() => {
        const pending = this.pendingResponses.get(message.id);
        if (pending && !pending.handled) {
          pending.handled = true; // C3: Mark as handled
          this.pendingResponses.delete(message.id);
          reject(new TimeoutError(`Message ${message.id} timed out in queue`));
        }
      }, message.timeout - Date.now());

      this.pendingResponses.set(message.id, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        handled: false, // C3: Track if already handled
        timeoutId: timeoutId
      });

      this.messageQueue.push(message);

      // Trigger processing
      setImmediate(() => this._processMessageQueue());
    });
  }

  /**
   * Start message processor (can be called to restart after shutdown)
   */
  startMessageProcessor() {
    // Stop existing processor if running
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
    }

    // Start new processor
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
   * C4: Cleanup agent subscriptions on disconnect
   * @param {string} agentId
   */
  async cleanupAgent(agentId) {
    // Cleanup all subscriptions for this agent
    const agentSubs = this.agentSubscriptions.get(agentId);
    if (agentSubs) {
      for (const subscriptionId of agentSubs) {
        try {
          await this.stateManager.unsubscribe(subscriptionId);
          this.subscriptions.delete(subscriptionId);
        } catch (error) {
          // Log but don't fail
          this.emit('cleanupError', {
            agentId,
            subscriptionId,
            error: error.message
          });
        }
      }
      this.agentSubscriptions.delete(agentId);
    }

    this.emit('agentCleaned', { agentId });
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

    // C4: Cleanup all agent subscriptions
    for (const agentId of this.agentSubscriptions.keys()) {
      await this.cleanupAgent(agentId);
    }

    this.emit('shutdown');
  }
}

module.exports = CommunicationHub;
