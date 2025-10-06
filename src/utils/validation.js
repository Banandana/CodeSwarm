/**
 * Input Validation Utilities
 * Provides validation for common operations
 */

const path = require('path');

class Validator {
  /**
   * Validate file path to prevent path traversal
   * @param {string} filePath - Path to validate
   * @param {string} baseDir - Base directory to restrict to
   * @returns {string} Resolved safe path
   * @throws {Error} If path is invalid or attempts traversal
   */
  static validateFilePath(filePath, baseDir) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path: must be a non-empty string');
    }

    if (!baseDir || typeof baseDir !== 'string') {
      throw new Error('Invalid base directory: must be a non-empty string');
    }

    // Resolve the path
    const resolved = path.resolve(baseDir, filePath);

    // Check if resolved path is within base directory
    if (!resolved.startsWith(path.resolve(baseDir))) {
      throw new Error('Path traversal detected: file path must be within base directory');
    }

    return resolved;
  }

  /**
   * Validate Claude messages array
   * @param {Array} messages - Messages to validate
   * @throws {Error} If messages are invalid
   */
  static validateMessages(messages) {
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }

    if (messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (!msg || typeof msg !== 'object') {
        throw new Error(`Message at index ${i} must be an object`);
      }

      if (!msg.role) {
        throw new Error(`Message at index ${i} missing required field: role`);
      }

      if (!msg.content) {
        throw new Error(`Message at index ${i} missing required field: content`);
      }

      if (msg.role !== 'user' && msg.role !== 'assistant') {
        throw new Error(`Message at index ${i} has invalid role: ${msg.role}`);
      }
    }
  }

  /**
   * Validate agent ID
   * @param {string} agentId - Agent ID to validate
   * @throws {Error} If agent ID is invalid
   */
  static validateAgentId(agentId) {
    if (!agentId || typeof agentId !== 'string') {
      throw new Error('Invalid agent ID: must be a non-empty string');
    }

    if (agentId.length > 100) {
      throw new Error('Invalid agent ID: too long (max 100 characters)');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      throw new Error('Invalid agent ID: must contain only alphanumeric characters, hyphens, and underscores');
    }
  }

  /**
   * Validate budget amount
   * @param {number} amount - Budget amount to validate
   * @throws {Error} If amount is invalid
   */
  static validateBudgetAmount(amount) {
    if (typeof amount !== 'number') {
      throw new Error('Budget amount must be a number');
    }

    if (!Number.isFinite(amount)) {
      throw new Error('Budget amount must be finite');
    }

    if (amount < 0) {
      throw new Error('Budget amount cannot be negative');
    }

    if (amount > 10000) {
      throw new Error('Budget amount too large (max $10,000)');
    }
  }

  /**
   * Validate task object
   * @param {Object} task - Task to validate
   * @throws {Error} If task is invalid
   */
  static validateTask(task) {
    if (!task || typeof task !== 'object') {
      throw new Error('Task must be an object');
    }

    if (!task.id || typeof task.id !== 'string') {
      throw new Error('Task must have a valid id');
    }

    if (!task.description || typeof task.description !== 'string') {
      throw new Error('Task must have a valid description');
    }
  }
}

module.exports = Validator;
