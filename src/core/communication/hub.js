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
      console.log(`[CommunicationHub] Message received:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId,
        priority: message.priority,
        payloadSize: JSON.stringify(message.payload || {}).length,
        timestamp: message.timestamp
      });

      // Validate message
      MessageProtocol.validateMessage(message);
      console.log(`[CommunicationHub] Message validation passed:`, { messageId: message.id });

      // NOTE: Budget validation for CLAUDE_REQUEST is handled by ClaudeClient
      // to avoid double validation and ensure proper operation ID tracking.
      // Other message types that require budget could be validated here in the future.

      // Add to queue with priority
      return await this._enqueueMessage(message);

    } catch (error) {
      console.log(`[CommunicationHub] Message routing failed:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId,
        error: error.message,
        stack: error.stack
      });
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

    console.log(`[CommunicationHub] READ operation starting:`, {
      messageId: message.id,
      agentId: message.agentId,
      key,
      consistency
    });

    try {
      // C5: Pass consistency parameter to StateManager.read()
      const value = await this.stateManager.read(key, message.agentId, consistency);

      const duration = Date.now() - startTime;
      console.log(`[CommunicationHub] READ operation completed:`, {
        messageId: message.id,
        agentId: message.agentId,
        key,
        consistency,
        hasValue: value !== undefined,
        duration
      });

      this.emit('operationComplete', {
        type: 'READ',
        agentId: message.agentId,
        key,
        duration
      });

      return { success: true, data: value };
    } catch (error) {
      console.log(`[CommunicationHub] READ operation failed:`, {
        messageId: message.id,
        agentId: message.agentId,
        key,
        consistency,
        error: error.message,
        duration: Date.now() - startTime
      });
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

    console.log(`[CommunicationHub] WRITE operation starting:`, {
      messageId: message.id,
      agentId: message.agentId,
      key,
      hasLockId: !!lockId,
      lockId,
      expectedVersion,
      valueSize: JSON.stringify(value || {}).length
    });

    try {
      // Verify lock if provided
      if (lockId) {
        console.log(`[CommunicationHub] Verifying lock for WRITE:`, {
          messageId: message.id,
          agentId: message.agentId,
          lockId
        });
        const hasLock = await this.lockManager.verifyLock(lockId, message.agentId);
        if (!hasLock) {
          console.log(`[CommunicationHub] Lock verification failed for WRITE:`, {
            messageId: message.id,
            agentId: message.agentId,
            lockId
          });
          throw new Error('Invalid or expired lock for write operation');
        }
        console.log(`[CommunicationHub] Lock verification passed for WRITE:`, {
          messageId: message.id,
          agentId: message.agentId,
          lockId
        });
      }

      const result = await this.stateManager.write(
        key,
        value,
        message.agentId,
        expectedVersion
      );

      const duration = Date.now() - startTime;
      console.log(`[CommunicationHub] WRITE operation completed:`, {
        messageId: message.id,
        agentId: message.agentId,
        key,
        version: result.version,
        duration
      });

      this.emit('operationComplete', {
        type: 'WRITE',
        agentId: message.agentId,
        key,
        duration
      });

      return { success: true, version: result.version };
    } catch (error) {
      console.log(`[CommunicationHub] WRITE operation failed:`, {
        messageId: message.id,
        agentId: message.agentId,
        key,
        error: error.message,
        duration: Date.now() - startTime
      });
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

    console.log(`[CommunicationHub] LOCK operation starting:`, {
      messageId: message.id,
      agentId: message.agentId,
      resource,
      timeout
    });

    try {
      const lockId = await this.lockManager.acquireLock(
        resource,
        message.agentId,
        timeout
      );

      console.log(`[CommunicationHub] LOCK operation succeeded:`, {
        messageId: message.id,
        agentId: message.agentId,
        resource,
        lockId
      });

      return { success: true, lockId };
    } catch (error) {
      console.log(`[CommunicationHub] LOCK operation failed:`, {
        messageId: message.id,
        agentId: message.agentId,
        resource,
        error: error.message
      });
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

    console.log(`[CommunicationHub] UNLOCK operation starting:`, {
      messageId: message.id,
      agentId: message.agentId,
      lockId
    });

    try {
      await this.lockManager.releaseLock(lockId);

      console.log(`[CommunicationHub] UNLOCK operation succeeded:`, {
        messageId: message.id,
        agentId: message.agentId,
        lockId
      });

      return { success: true };
    } catch (error) {
      console.log(`[CommunicationHub] UNLOCK operation failed:`, {
        messageId: message.id,
        agentId: message.agentId,
        lockId,
        error: error.message
      });
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
    console.log(`[CommunicationHub] CLAUDE_REQUEST operation starting:`, {
      messageId: message.id,
      agentId: message.agentId,
      promptSize: JSON.stringify(message.payload?.prompt || '').length,
      hasTools: !!message.payload?.tools,
      toolCount: message.payload?.tools?.length || 0
    });

    // The actual Claude client is in app.js, so we emit an event
    // and the app.js handler will respond
    return new Promise((resolve, reject) => {
      const responseEvent = `CLAUDE_RESPONSE_${message.id}`;
      const errorEvent = `CLAUDE_ERROR_${message.id}`;
      let timeoutId;

      const cleanup = () => {
        console.log(`[CommunicationHub] Cleaning up CLAUDE_REQUEST event listeners:`, {
          messageId: message.id,
          agentId: message.agentId,
          responseEvent,
          errorEvent
        });
        this.removeAllListeners(responseEvent);
        this.removeAllListeners(errorEvent);
        if (timeoutId) clearTimeout(timeoutId);
      };

      this.once(responseEvent, (result) => {
        console.log(`[CommunicationHub] CLAUDE_REQUEST response received:`, {
          messageId: message.id,
          agentId: message.agentId,
          hasResult: !!result,
          resultSize: JSON.stringify(result || {}).length
        });
        cleanup();
        resolve(result);
      });

      this.once(errorEvent, (error) => {
        console.log(`[CommunicationHub] CLAUDE_REQUEST error received:`, {
          messageId: message.id,
          agentId: message.agentId,
          error: error.message || error
        });
        cleanup();
        reject(error);
      });

      // Emit the request event
      console.log(`[CommunicationHub] Emitting CLAUDE_REQUEST event:`, {
        messageId: message.id,
        agentId: message.agentId,
        responseEvent,
        errorEvent,
        timeoutMs: 600000
      });
      this.emit('CLAUDE_REQUEST', message);

      // Timeout after 10 minutes for complex responses
      timeoutId = setTimeout(() => {
        console.log(`[CommunicationHub] CLAUDE_REQUEST timed out:`, {
          messageId: message.id,
          agentId: message.agentId,
          timeoutMs: 600000
        });
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
    console.log(`[CommunicationHub] FILE_READ operation starting:`, {
      messageId: message.id,
      agentId: message.agentId,
      path: message.payload?.path
    });

    return new Promise((resolve, reject) => {
      const responseEvent = `FILE_READ_RESPONSE_${message.id}`;
      const errorEvent = `FILE_READ_ERROR_${message.id}`;
      let timeoutId;

      const cleanup = () => {
        console.log(`[CommunicationHub] Cleaning up FILE_READ event listeners:`, {
          messageId: message.id,
          agentId: message.agentId,
          responseEvent,
          errorEvent
        });
        this.removeAllListeners(responseEvent);
        this.removeAllListeners(errorEvent);
        if (timeoutId) clearTimeout(timeoutId);
      };

      this.once(responseEvent, (result) => {
        console.log(`[CommunicationHub] FILE_READ response received:`, {
          messageId: message.id,
          agentId: message.agentId,
          hasResult: !!result,
          contentSize: result?.content?.length || 0
        });
        cleanup();
        resolve(result);
      });

      this.once(errorEvent, (error) => {
        console.log(`[CommunicationHub] FILE_READ error received:`, {
          messageId: message.id,
          agentId: message.agentId,
          error: error.message || error
        });
        cleanup();
        reject(error);
      });

      // Emit the request event
      console.log(`[CommunicationHub] Emitting FILE_READ event:`, {
        messageId: message.id,
        agentId: message.agentId,
        path: message.payload?.path,
        responseEvent,
        errorEvent,
        timeoutMs: 30000
      });
      this.emit('FILE_READ', message);

      // Timeout after 30 seconds
      timeoutId = setTimeout(() => {
        console.log(`[CommunicationHub] FILE_READ timed out:`, {
          messageId: message.id,
          agentId: message.agentId,
          timeoutMs: 30000
        });
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
    console.log(`[CommunicationHub] FILE_WRITE operation starting:`, {
      messageId: message.id,
      agentId: message.agentId,
      path: message.payload?.path,
      contentSize: message.payload?.content?.length || 0
    });

    return new Promise((resolve, reject) => {
      const responseEvent = `FILE_WRITE_RESPONSE_${message.id}`;
      const errorEvent = `FILE_WRITE_ERROR_${message.id}`;
      let timeoutId;

      const cleanup = () => {
        console.log(`[CommunicationHub] Cleaning up FILE_WRITE event listeners:`, {
          messageId: message.id,
          agentId: message.agentId,
          responseEvent,
          errorEvent
        });
        this.removeAllListeners(responseEvent);
        this.removeAllListeners(errorEvent);
        if (timeoutId) clearTimeout(timeoutId);
      };

      this.once(responseEvent, (result) => {
        console.log(`[CommunicationHub] FILE_WRITE response received:`, {
          messageId: message.id,
          agentId: message.agentId,
          hasResult: !!result
        });
        cleanup();
        resolve(result);
      });

      this.once(errorEvent, (error) => {
        console.log(`[CommunicationHub] FILE_WRITE error received:`, {
          messageId: message.id,
          agentId: message.agentId,
          error: error.message || error
        });
        cleanup();
        reject(error);
      });

      // Emit the request event
      console.log(`[CommunicationHub] Emitting FILE_WRITE event:`, {
        messageId: message.id,
        agentId: message.agentId,
        path: message.payload?.path,
        responseEvent,
        errorEvent,
        timeoutMs: 30000
      });
      this.emit('FILE_WRITE', message);

      // Timeout after 30 seconds
      timeoutId = setTimeout(() => {
        console.log(`[CommunicationHub] FILE_WRITE timed out:`, {
          messageId: message.id,
          agentId: message.agentId,
          timeoutMs: 30000
        });
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

    console.log(`[CommunicationHub] Processing message queue:`, {
      queueLength: this.messageQueue.length,
      activeOperations: this.activeOperations.size,
      maxConcurrentOperations: this.options.maxConcurrentOperations,
      pendingResponses: this.pendingResponses.size
    });

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

      console.log(`[CommunicationHub] Queue sorted by priority:`, {
        queueLength: this.messageQueue.length,
        topMessages: this.messageQueue.slice(0, 3).map(m => ({
          id: m.id,
          type: m.type,
          priority: m.priority,
          agentId: m.agentId,
          timestamp: m.timestamp
        }))
      });

      const message = this.messageQueue.shift();

      if (!message) {
        break;
      }

      console.log(`[CommunicationHub] Dequeued message for processing:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId,
        priority: message.priority,
        queueLengthAfter: this.messageQueue.length
      });

      // C3: Check timeout - ensure not already handled
      if (Date.now() > message.timeout) {
        console.log(`[CommunicationHub] Message timeout detected in queue:`, {
          messageId: message.id,
          type: message.type,
          agentId: message.agentId,
          timeout: message.timeout,
          currentTime: Date.now(),
          timeExpired: Date.now() - message.timeout
        });
        const pending = this.pendingResponses.get(message.id);
        if (pending && !pending.handled) {
          pending.handled = true; // Mark as handled to prevent double timeout
          pending.reject(new TimeoutError(`Message ${message.id} timed out`));
          this.pendingResponses.delete(message.id);
          console.log(`[CommunicationHub] Message timeout handled and rejected:`, {
            messageId: message.id
          });
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
      console.log(`[CommunicationHub] Queue has more messages, scheduling next processing:`, {
        remainingMessages: this.messageQueue.length
      });
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

    console.log(`[CommunicationHub] Processing message started:`, {
      messageId: message.id,
      type: message.type,
      agentId: message.agentId,
      operationKey,
      activeOperationsCount: this.activeOperations.size
    });

    try {
      let result;

      console.log(`[CommunicationHub] Selecting handler for message type:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId
      });

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

      console.log(`[CommunicationHub] Message processing completed successfully:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId,
        duration,
        hasResult: !!result,
        stats: {
          processed: this.stats.messagesProcessed,
          failed: this.stats.messagesFailed,
          avgProcessingTime: this.stats.averageProcessingTime
        }
      });

      this.emit('messageProcessed', { message, result, duration });

      // Resolve pending promise
      const pending = this.pendingResponses.get(message.id);
      if (pending && !pending.handled) {
        console.log(`[CommunicationHub] Resolving pending response:`, {
          messageId: message.id,
          type: message.type,
          agentId: message.agentId
        });
        pending.handled = true; // C3: Mark as handled
        pending.resolve(result);
        this.pendingResponses.delete(message.id);
      } else {
        console.log(`[CommunicationHub] No pending response to resolve:`, {
          messageId: message.id,
          type: message.type,
          agentId: message.agentId,
          hasPending: !!pending,
          alreadyHandled: pending?.handled
        });
      }

    } catch (error) {
      this.stats.messagesFailed++;

      console.log(`[CommunicationHub] Message processing failed:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId,
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime,
        retryCount: message.retryCount || 0,
        maxRetries: this.options.retryAttempts
      });

      this.emit('messageError', {
        message,
        error: error.message
      });

      // Retry if possible
      if (MessageProtocol.canRetry(message, this.options.retryAttempts)) {
        const retryMessage = MessageProtocol.createRetryMessage(message);

        console.log(`[CommunicationHub] Retrying message:`, {
          originalMessageId: message.id,
          retryMessageId: retryMessage.id,
          retryCount: retryMessage.retryCount,
          maxRetries: this.options.retryAttempts
        });

        // C1: Transfer pendingResponses to new message ID on retry
        const oldPending = this.pendingResponses.get(message.id);
        if (oldPending && !oldPending.handled) {
          this.pendingResponses.set(retryMessage.id, oldPending);
          this.pendingResponses.delete(message.id); // Cleanup old message ID
          console.log(`[CommunicationHub] Transferred pending response to retry message:`, {
            oldMessageId: message.id,
            newMessageId: retryMessage.id
          });
        }

        this.messageQueue.unshift(retryMessage);
      } else {
        console.log(`[CommunicationHub] Max retries exceeded, rejecting message:`, {
          messageId: message.id,
          type: message.type,
          agentId: message.agentId,
          retryCount: message.retryCount || 0,
          maxRetries: this.options.retryAttempts
        });
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
      console.log(`[CommunicationHub] Message processing finished, operation removed:`, {
        messageId: message.id,
        operationKey,
        activeOperationsCount: this.activeOperations.size
      });
    }
  }

  /**
   * Enqueue message with promise
   * @private
   */
  async _enqueueMessage(message) {
    return new Promise((resolve, reject) => {
      console.log(`[CommunicationHub] Enqueueing message:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId,
        priority: message.priority,
        currentQueueLength: this.messageQueue.length,
        maxQueueSize: this.options.maxQueueSize
      });

      // C6: Check queue saturation
      if (this.messageQueue.length >= this.options.maxQueueSize) {
        console.log(`[CommunicationHub] Queue saturation detected, rejecting message:`, {
          messageId: message.id,
          type: message.type,
          agentId: message.agentId,
          queueLength: this.messageQueue.length,
          maxQueueSize: this.options.maxQueueSize
        });
        reject(new CommunicationError(
          `Message queue full (${this.messageQueue.length}/${this.options.maxQueueSize}). System is saturated.`,
          { messageId: message.id, agentId: message.agentId }
        ));
        return;
      }

      const timeoutMs = message.timeout - Date.now();
      console.log(`[CommunicationHub] Setting up timeout for message:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId,
        timeoutMs,
        timeoutAt: message.timeout
      });

      const timeoutId = setTimeout(() => {
        console.log(`[CommunicationHub] Message timeout fired in enqueue:`, {
          messageId: message.id,
          type: message.type,
          agentId: message.agentId
        });
        const pending = this.pendingResponses.get(message.id);
        if (pending && !pending.handled) {
          pending.handled = true; // C3: Mark as handled
          this.pendingResponses.delete(message.id);
          console.log(`[CommunicationHub] Message timeout rejection executed:`, {
            messageId: message.id
          });
          reject(new TimeoutError(`Message ${message.id} timed out in queue`));
        }
      }, timeoutMs);

      this.pendingResponses.set(message.id, {
        resolve: (result) => {
          console.log(`[CommunicationHub] Pending response resolved:`, {
            messageId: message.id,
            type: message.type,
            agentId: message.agentId,
            hasResult: !!result
          });
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          console.log(`[CommunicationHub] Pending response rejected:`, {
            messageId: message.id,
            type: message.type,
            agentId: message.agentId,
            error: error.message || error
          });
          clearTimeout(timeoutId);
          reject(error);
        },
        handled: false, // C3: Track if already handled
        timeoutId: timeoutId
      });

      console.log(`[CommunicationHub] Pending response registered:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId,
        pendingResponsesCount: this.pendingResponses.size
      });

      this.messageQueue.push(message);

      console.log(`[CommunicationHub] Message added to queue:`, {
        messageId: message.id,
        type: message.type,
        agentId: message.agentId,
        queueLength: this.messageQueue.length
      });

      // Trigger processing
      setImmediate(() => this._processMessageQueue());
    });
  }

  /**
   * Start message processor (can be called to restart after shutdown)
   */
  startMessageProcessor() {
    console.log(`[CommunicationHub] Starting message processor:`, {
      hasExistingProcessor: !!this.processorInterval
    });

    // Stop existing processor if running
    if (this.processorInterval) {
      console.log(`[CommunicationHub] Stopping existing processor before restart`);
      clearInterval(this.processorInterval);
    }

    // Start new processor
    this.processorInterval = setInterval(() => {
      if (this.messageQueue.length > 0) {
        this._processMessageQueue();
      }
    }, 100); // Check every 100ms

    console.log(`[CommunicationHub] Message processor started with 100ms interval`);
  }

  /**
   * Stop message processor
   */
  stopProcessor() {
    console.log(`[CommunicationHub] Stopping message processor:`, {
      hasProcessor: !!this.processorInterval,
      queueLength: this.messageQueue.length,
      activeOperations: this.activeOperations.size
    });

    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
      console.log(`[CommunicationHub] Message processor stopped`);
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
    console.log(`[CommunicationHub] Agent cleanup starting:`, {
      agentId,
      subscriptionCount: this.agentSubscriptions.get(agentId)?.size || 0
    });

    // Cleanup all subscriptions for this agent
    const agentSubs = this.agentSubscriptions.get(agentId);
    if (agentSubs) {
      console.log(`[CommunicationHub] Cleaning up agent subscriptions:`, {
        agentId,
        subscriptions: Array.from(agentSubs)
      });

      for (const subscriptionId of agentSubs) {
        try {
          console.log(`[CommunicationHub] Unsubscribing subscription:`, {
            agentId,
            subscriptionId
          });
          await this.stateManager.unsubscribe(subscriptionId);
          this.subscriptions.delete(subscriptionId);
          console.log(`[CommunicationHub] Subscription unsubscribed successfully:`, {
            agentId,
            subscriptionId
          });
        } catch (error) {
          // Log but don't fail
          console.log(`[CommunicationHub] Subscription cleanup error:`, {
            agentId,
            subscriptionId,
            error: error.message,
            stack: error.stack
          });
          this.emit('cleanupError', {
            agentId,
            subscriptionId,
            error: error.message
          });
        }
      }
      this.agentSubscriptions.delete(agentId);
    }

    console.log(`[CommunicationHub] Agent cleanup completed:`, {
      agentId
    });

    this.emit('agentCleaned', { agentId });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log(`[CommunicationHub] Shutdown initiated:`, {
      queuedMessages: this.messageQueue.length,
      activeOperations: this.activeOperations.size,
      pendingResponses: this.pendingResponses.size,
      subscriptions: this.subscriptions.size,
      agents: this.agentSubscriptions.size
    });

    this.emit('shuttingDown');

    console.log(`[CommunicationHub] Stopping message processor`);
    this.stopProcessor();

    // Wait for active operations
    const maxWait = 30000;
    const start = Date.now();

    console.log(`[CommunicationHub] Waiting for active operations to complete:`, {
      activeOperations: this.activeOperations.size,
      maxWaitMs: maxWait
    });

    while (this.activeOperations.size > 0 && (Date.now() - start) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.activeOperations.size > 0 && (Date.now() - start) % 5000 < 100) {
        console.log(`[CommunicationHub] Still waiting for active operations:`, {
          activeOperations: this.activeOperations.size,
          elapsedMs: Date.now() - start
        });
      }
    }

    if (this.activeOperations.size > 0) {
      console.log(`[CommunicationHub] Shutdown timeout reached with active operations:`, {
        activeOperations: this.activeOperations.size,
        operations: Array.from(this.activeOperations.keys())
      });
    } else {
      console.log(`[CommunicationHub] All active operations completed`);
    }

    // C4: Cleanup all agent subscriptions
    console.log(`[CommunicationHub] Cleaning up all agent subscriptions:`, {
      agentCount: this.agentSubscriptions.size,
      agents: Array.from(this.agentSubscriptions.keys())
    });

    for (const agentId of this.agentSubscriptions.keys()) {
      await this.cleanupAgent(agentId);
    }

    console.log(`[CommunicationHub] Shutdown completed:`, {
      queuedMessages: this.messageQueue.length,
      activeOperations: this.activeOperations.size,
      pendingResponses: this.pendingResponses.size
    });

    this.emit('shutdown');
  }
}

module.exports = CommunicationHub;
