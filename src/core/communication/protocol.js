/**
 * Message Protocol Definitions
 * Defines message types and protocol for agent communication
 */

const { v4: uuidv4 } = require('uuid');

class MessageProtocol {
  static MESSAGE_TYPES = {
    // Core operations
    READ: 'READ',
    WRITE: 'WRITE',
    SUBSCRIBE: 'SUBSCRIBE',
    UNSUBSCRIBE: 'UNSUBSCRIBE',

    // Locking operations
    LOCK: 'LOCK',
    UNLOCK: 'UNLOCK',

    // Agent coordination
    TASK_ASSIGN: 'TASK_ASSIGN',
    TASK_COMPLETE: 'TASK_COMPLETE',
    TASK_FAILED: 'TASK_FAILED',
    HANDOFF: 'HANDOFF',

    // System messages
    HEARTBEAT: 'HEARTBEAT',
    STATUS_REQUEST: 'STATUS_REQUEST',
    STATUS_RESPONSE: 'STATUS_RESPONSE',
    SHUTDOWN: 'SHUTDOWN'
  };

  static PRIORITIES = {
    CRITICAL: 0,
    HIGH: 1,
    NORMAL: 2,
    LOW: 3
  };

  /**
   * Create a standardized message
   * @param {string} type
   * @param {string} agentId
   * @param {Object} payload
   * @param {number} priority
   * @returns {Object}
   */
  static createMessage(type, agentId, payload, priority = this.PRIORITIES.NORMAL) {
    if (!this.MESSAGE_TYPES[type]) {
      throw new Error(`Invalid message type: ${type}`);
    }

    return {
      id: this.generateMessageId(),
      type,
      agentId,
      payload: payload || {},
      priority,
      timestamp: Date.now(),
      timeout: Date.now() + 30000, // 30s default
      requiresBudget: this.requiresBudget(type),
      retryCount: 0
    };
  }

  /**
   * Generate unique message ID
   * @returns {string}
   */
  static generateMessageId() {
    return `msg_${Date.now()}_${uuidv4().substring(0, 8)}`;
  }

  /**
   * Validate message structure
   * @param {Object} message
   * @returns {boolean}
   * @throws {Error}
   */
  static validateMessage(message) {
    const required = ['id', 'type', 'agentId', 'payload', 'timestamp'];
    const missing = required.filter(field => !(field in message));

    if (missing.length > 0) {
      throw new Error(`Invalid message: missing fields ${missing.join(', ')}`);
    }

    if (!this.MESSAGE_TYPES[message.type]) {
      throw new Error(`Invalid message type: ${message.type}`);
    }

    return true;
  }

  /**
   * Check if message type requires budget validation
   * @param {string} type
   * @returns {boolean}
   */
  static requiresBudget(type) {
    const budgetRequired = [
      'TASK_ASSIGN',
      'WRITE', // If writing generated code
      'HANDOFF'
    ];

    return budgetRequired.includes(type);
  }

  /**
   * Check if message can be retried
   * @param {Object} message
   * @param {number} maxRetries
   * @returns {boolean}
   */
  static canRetry(message, maxRetries = 3) {
    const retriableTypes = [
      'READ',
      'WRITE',
      'STATUS_REQUEST',
      'HEARTBEAT'
    ];

    return (
      retriableTypes.includes(message.type) &&
      message.retryCount < maxRetries
    );
  }

  /**
   * Create retry message
   * @param {Object} originalMessage
   * @returns {Object}
   */
  static createRetryMessage(originalMessage) {
    return {
      ...originalMessage,
      id: this.generateMessageId(),
      retryCount: (originalMessage.retryCount || 0) + 1,
      timestamp: Date.now(),
      timeout: Date.now() + 30000
    };
  }

  /**
   * Create response message
   * @param {Object} originalMessage
   * @param {Object} result
   * @param {boolean} success
   * @returns {Object}
   */
  static createResponse(originalMessage, result, success = true) {
    return {
      id: this.generateMessageId(),
      type: `${originalMessage.type}_RESPONSE`,
      agentId: 'system',
      inResponseTo: originalMessage.id,
      payload: {
        success,
        result,
        originalType: originalMessage.type
      },
      priority: originalMessage.priority,
      timestamp: Date.now()
    };
  }

  /**
   * Create error response
   * @param {Object} originalMessage
   * @param {Error} error
   * @returns {Object}
   */
  static createErrorResponse(originalMessage, error) {
    return {
      id: this.generateMessageId(),
      type: `${originalMessage.type}_ERROR`,
      agentId: 'system',
      inResponseTo: originalMessage.id,
      payload: {
        success: false,
        error: {
          message: error.message,
          code: error.code,
          name: error.name
        },
        originalType: originalMessage.type
      },
      priority: originalMessage.priority,
      timestamp: Date.now()
    };
  }
}

module.exports = MessageProtocol;
