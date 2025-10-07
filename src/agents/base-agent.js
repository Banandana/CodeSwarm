/**
 * Base Agent
 * Abstract base class for all specialist agents
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { AgentError } = require('../utils/errors');
const MessageProtocol = require('../core/communication/protocol');

class BaseAgent extends EventEmitter {
  constructor(agentId, agentType, communicationHub, options = {}) {
    super();

    this.agentId = agentId || `${agentType}-${uuidv4()}`;
    this.agentType = agentType;
    this.communicationHub = communicationHub;

    this.config = {
      maxConcurrentTasks: options.maxConcurrentTasks || 1,
      heartbeatInterval: options.heartbeatInterval || 0, // DISABLED by default (0 = disabled)
      taskTimeout: options.taskTimeout || 300000, // 5 minutes
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000
    };

    this.state = {
      status: 'idle', // idle, working, waiting, error
      currentTask: null,
      completedTasks: [],
      failedTasks: [],
      startTime: null,
      conversationHistory: []
    };

    // Start heartbeat only if enabled (0 = disabled)
    // NOTE: Heartbeats disabled by default to prevent message queue saturation
    // with 10+ concurrent agents. Enable with heartbeatInterval > 0 if needed.
    if (this.config.heartbeatInterval > 0) {
      this._startHeartbeat();
    }
  }

  /**
   * Initialize agent (override in subclasses if needed)
   * @returns {Promise<void>}
   */
  async initialize() {
    this.emit('initialized', {
      agentId: this.agentId,
      agentType: this.agentType,
      timestamp: Date.now()
    });
  }

  /**
   * Execute a task (must be implemented by subclasses)
   * @param {Object} task - Task to execute
   * @returns {Promise<Object>} Task result
   */
  async executeTask(task) {
    throw new AgentError(
      'executeTask must be implemented by subclass',
      { agentId: this.agentId, agentType: this.agentType }
    );
  }

  /**
   * Handle task assignment from coordinator
   * @param {Object} task - Task object
   * @returns {Promise<Object>}
   */
  async handleTaskAssignment(task) {
    try {
      // Update state
      this.state.status = 'working';
      this.state.currentTask = task;

      this.emit('taskStarted', {
        agentId: this.agentId,
        taskId: task.id,
        timestamp: Date.now()
      });

      // Execute task with timeout
      const result = await this._executeWithTimeout(task);

      // Update state
      this.state.status = 'idle';
      this.state.currentTask = null;
      this.state.completedTasks.push({
        taskId: task.id,
        timestamp: Date.now(),
        result
      });

      this.emit('taskCompleted', {
        agentId: this.agentId,
        taskId: task.id,
        result,
        timestamp: Date.now()
      });

      // Send completion message to coordinator
      await this.sendMessage({
        type: 'TASK_COMPLETE',
        payload: {
          taskId: task.id,
          result,
          conversationHistory: this.state.conversationHistory
        },
        priority: 'NORMAL'
      });

      return result;

    } catch (error) {
      // Handle task failure
      this.state.status = 'error';
      this.state.failedTasks.push({
        taskId: task.id,
        error: error.message,
        timestamp: Date.now()
      });

      this.emit('taskFailed', {
        agentId: this.agentId,
        taskId: task.id,
        error: error.message,
        timestamp: Date.now()
      });

      // Notify coordinator of failure
      await this.sendMessage({
        type: 'TASK_FAILED',
        payload: {
          taskId: task.id,
          error: error.message,
          stackTrace: error.stack
        },
        priority: 'HIGH'
      });

      throw error;
    } finally {
      // Clear current task
      this.state.currentTask = null;
      if (this.state.status !== 'error') {
        this.state.status = 'idle';
      }
    }
  }

  /**
   * Execute task with timeout
   * @private
   */
  async _executeWithTimeout(task) {
    const timeoutMs = this.config.taskTimeout || 180000; // 3 minutes default

    console.log(`[${this.agentId}] Starting task with ${timeoutMs}ms timeout:`, task.id);

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        console.error(`[${this.agentId}] ⏱️ Task timeout after ${timeoutMs}ms:`, {
          taskId: task.id,
          agentType: this.agentType
        });
        reject(new AgentError(
          `Task timeout after ${timeoutMs}ms: ${task.id}`,
          { agentId: this.agentId, taskId: task.id, timeout: timeoutMs }
        ));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        this.executeTask(task),
        timeoutPromise
      ]);
      console.log(`[${this.agentId}] ✓ Task completed:`, task.id);
      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (error) {
      console.error(`[${this.agentId}] ✗ Task failed:`, task.id, error.message);
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Convert priority string to number
   * @private
   */
  _convertPriority(priority) {
    const priorityMap = {
      'CRITICAL': 0,
      'HIGH': 1,
      'MEDIUM': 2,
      'NORMAL': 2,
      'LOW': 3
    };

    if (typeof priority === 'number') return priority;
    return priorityMap[priority] || 2;
  }

  /**
   * Send message via communication hub
   * @param {Object} message - Message object
   * @returns {Promise<Object>}
   */
  async sendMessage(message) {
    // Use protocol helper to create standardized message
    const fullMessage = MessageProtocol.createMessage(
      message.type,
      this.agentId,
      message.payload,
      this._convertPriority(message.priority || 'NORMAL')
    );

    // Add any additional fields that aren't in the standard protocol
    if (message.estimatedCost) {
      fullMessage.estimatedCost = message.estimatedCost;
    }
    if (message.actualCost) {
      fullMessage.actualCost = message.actualCost;
    }

    return await this.communicationHub.routeMessage(fullMessage);
  }

  /**
   * Request file read
   * @param {string} filePath - Path to file
   * @returns {Promise<string>}
   */
  async readFile(filePath) {
    const response = await this.sendMessage({
      type: 'FILE_READ',
      payload: { filePath },
      priority: 'NORMAL'
    });

    return response.content;
  }

  /**
   * Request file write
   * @param {string} filePath - Path to file
   * @param {string} content - File content
   * @param {Object} options - Write options
   * @returns {Promise<Object>}
   */
  async writeFile(filePath, content, options = {}) {
    const response = await this.sendMessage({
      type: 'FILE_WRITE',
      payload: { filePath, content, options },
      priority: 'NORMAL'
    });

    return response;
  }

  /**
   * Request file lock
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} Lock ID
   */
  async acquireLock(filePath) {
    const response = await this.sendMessage({
      type: 'LOCK',
      payload: { resource: filePath },
      priority: 'HIGH'
    });

    return response.lockId;
  }

  /**
   * Release file lock
   * @param {string} lockId - Lock ID
   * @returns {Promise<void>}
   */
  async releaseLock(lockId) {
    await this.sendMessage({
      type: 'UNLOCK',
      payload: { lockId },
      priority: 'HIGH'
    });
  }

  /**
   * Request Claude API call
   * @param {Array} messages - Conversation messages
   * @param {Object} options - API options
   * @returns {Promise<Object>}
   */
  async callClaude(messages, options = {}) {
    const response = await this.sendMessage({
      type: 'CLAUDE_REQUEST',
      payload: { messages, options },
      priority: options.priority || 'MEDIUM'
    });

    // Store in conversation history
    this.state.conversationHistory.push({
      messages,
      response: response.content,
      timestamp: Date.now(),
      cost: response.usage?.cost
    });

    return response;
  }

  /**
   * Request handoff to another agent
   * @param {string} targetAgentType - Type of agent to hand off to
   * @param {Object} context - Context for handoff
   * @returns {Promise<Object>}
   */
  async requestHandoff(targetAgentType, context) {
    return await this.sendMessage({
      type: 'HANDOFF',
      payload: {
        targetAgentType,
        context: {
          ...context,
          fromAgent: this.agentType,
          conversationHistory: this.state.conversationHistory
        }
      },
      priority: 'HIGH'
    });
  }

  /**
   * Parse Claude JSON response (shared utility for all agents)
   * @param {string} content - Claude response content
   * @returns {Object} Parsed JSON object
   * @protected
   */
  parseClaudeJSON(content) {
    try {
      // Clean up the content first
      let cleanContent = content.trim();
      let jsonStr = cleanContent;

      // Strategy 1: Try regex patterns with proper extraction
      const patterns = [
        /```json\s*\n([\s\S]*?)\n```/,  // ```json\n...\n```
        /```json\s+([\s\S]*?)\s*```/,   // ```json ...\n```
        /```\s*\n([\s\S]*?)\n```/,      // ```\n...\n```
        /```\s+([\s\S]*?)\s*```/        // ``` ...\n```
      ];

      for (const pattern of patterns) {
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
          try {
            return JSON.parse(match[1].trim());
          } catch (e) {
            // This pattern didn't work, try next
            continue;
          }
        }
      }

      // Strategy 2: Remove code fences with string replacement
      jsonStr = cleanContent
        .replace(/^```json\s*\n?/i, '')
        .replace(/^```\s*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim();

      // Try to parse the cleaned string
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        // Strategy 3: Find JSON object boundaries
        const jsonMatch = cleanContent.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1].trim());
        }
      }

      // Strategy 4: Last resort - try raw content
      return JSON.parse(cleanContent);

    } catch (error) {
      // Log full response for debugging
      console.error(`[${this.agentId}] Parse error:`, error.message);
      console.error(`[${this.agentId}] Response preview:`, content.substring(0, 1000));

      throw new AgentError(
        `Failed to parse Claude response: ${error.message}`,
        {
          agentId: this.agentId,
          content: content.substring(0, 1000),
          parseError: error.message
        }
      );
    }
  }

  /**
   * Validate task before execution
   * @param {Object} task - Task to validate
   * @returns {Object} { valid: boolean, reason?: string }
   */
  validateTask(task) {
    if (!task.id) {
      return { valid: false, reason: 'Task missing ID' };
    }

    if (!task.description) {
      return { valid: false, reason: 'Task missing description' };
    }

    // Subclasses can add more validation
    return { valid: true };
  }

  /**
   * Get agent status
   * @returns {Object}
   */
  getStatus() {
    return {
      agentId: this.agentId,
      agentType: this.agentType,
      status: this.state.status,
      currentTask: this.state.currentTask?.id || null,
      completedTasks: this.state.completedTasks.length,
      failedTasks: this.state.failedTasks.length,
      uptime: this.state.startTime ? Date.now() - this.state.startTime : 0
    };
  }

  /**
   * Get conversation history
   * @returns {Array}
   */
  getConversationHistory() {
    return this.state.conversationHistory;
  }

  /**
   * Start heartbeat to coordinator
   * @private
   */
  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({
        type: 'HEARTBEAT',
        payload: {
          status: this.state.status,
          currentTask: this.state.currentTask?.id || null
        },
        priority: 'LOW'
      }).catch(error => {
        // Log but don't throw - heartbeat failure shouldn't crash agent
        this.emit('error', new AgentError(
          `Heartbeat failed: ${error.message}`,
          { agentId: this.agentId }
        ));
      });
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   * @private
   */
  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Retry operation with exponential backoff
   * @param {Function} operation - Async operation to retry
   * @param {number} attempt - Current attempt number
   * @returns {Promise<any>}
   */
  async retryWithBackoff(operation, attempt = 1) {
    try {
      return await operation();
    } catch (error) {
      console.error(`[${this.agentId}] Operation failed (attempt ${attempt}/${this.config.retryAttempts}):`, error.message);

      if (attempt >= this.config.retryAttempts) {
        console.error(`[${this.agentId}] Max retries reached, failing operation`);
        throw error;
      }

      const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
      console.log(`[${this.agentId}] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      return this.retryWithBackoff(operation, attempt + 1);
    }
  }

  /**
   * Shutdown agent gracefully
   * @returns {Promise<void>}
   */
  async shutdown() {
    this._stopHeartbeat();

    this.emit('shutdown', {
      agentId: this.agentId,
      completedTasks: this.state.completedTasks.length,
      failedTasks: this.state.failedTasks.length,
      timestamp: Date.now()
    });
  }

  /**
   * Serialize agent state for checkpointing
   * @returns {Object}
   */
  serialize() {
    return {
      agentId: this.agentId,
      agentType: this.agentType,
      status: this.state.status,
      currentTask: this.state.currentTask,
      completedTasks: this.state.completedTasks,
      failedTasks: this.state.failedTasks,
      conversationHistory: this.state.conversationHistory,
      timestamp: Date.now()
    };
  }

  /**
   * Restore agent state from checkpoint
   * @param {Object} state - Serialized state
   */
  restore(state) {
    this.state.status = state.status || 'idle';
    this.state.currentTask = state.currentTask || null;
    this.state.completedTasks = state.completedTasks || [];
    this.state.failedTasks = state.failedTasks || [];
    this.state.conversationHistory = state.conversationHistory || [];

    this.emit('restored', {
      agentId: this.agentId,
      timestamp: Date.now()
    });
  }
}

module.exports = BaseAgent;
