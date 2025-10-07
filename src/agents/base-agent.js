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

    console.log(`[${this.agentType}] Agent initialized:`, {
      agentId: this.agentId,
      agentType: this.agentType,
      maxConcurrentTasks: this.config.maxConcurrentTasks,
      taskTimeout: this.config.taskTimeout,
      retryAttempts: this.config.retryAttempts,
      retryDelay: this.config.retryDelay,
      heartbeatInterval: this.config.heartbeatInterval,
      heartbeatEnabled: this.config.heartbeatInterval > 0
    });

    // Start heartbeat only if enabled (0 = disabled)
    // NOTE: Heartbeats disabled by default to prevent message queue saturation
    // with 10+ concurrent agents. Enable with heartbeatInterval > 0 if needed.
    if (this.config.heartbeatInterval > 0) {
      console.log(`[${this.agentType}] Starting heartbeat:`, {
        agentId: this.agentId,
        interval: this.config.heartbeatInterval
      });
      this._startHeartbeat();
    }
  }

  /**
   * Initialize agent (override in subclasses if needed)
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log(`[${this.agentType}] Initializing agent:`, {
      agentId: this.agentId,
      timestamp: new Date().toISOString()
    });

    this.emit('initialized', {
      agentId: this.agentId,
      agentType: this.agentType,
      timestamp: Date.now()
    });

    console.log(`[${this.agentType}] Agent initialization complete:`, {
      agentId: this.agentId
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
   * Load architectural constraints for task execution
   * @param {Object} task - Task being executed
   * @returns {Promise<Object>} Constraints and patterns
   */
  async loadArchitecturalContext(task) {
    try {
      // Load architecture from state
      const architecture = await this.readState('architecture:current');

      if (!architecture) {
        console.log(`[${this.agentType}] No architecture found in state`);
        return null;
      }

      const context = {
        architecture,
        constraints: null,
        component: null,
        patterns: architecture.patterns
      };

      // Find matching component
      if (architecture.components) {
        context.component = architecture.components.find(c =>
          c.id === task.componentId ||
          c.id === task.targetComponent ||
          task.files?.some(f => f.includes(c.id))
        );
      }

      // Load constraints
      if (architecture.constraints) {
        const ConstraintEngine = require('../constraints/constraint-engine');
        const engine = new ConstraintEngine();
        engine.loadConstraints(architecture);

        // Get constraints for this task
        const taskContext = {
          componentId: context.component?.id || task.componentId,
          taskType: task.type,
          agentType: this.agentType
        };

        context.constraints = engine.getConstraintInstructions(task);
      }

      console.log(`[${this.agentType}] Loaded architectural context for task ${task.id}`);

      return context;

    } catch (error) {
      console.warn(`[${this.agentType}] Failed to load architectural context: ${error.message}`);
      return null;
    }
  }

  /**
   * Handle task assignment from coordinator
   * @param {Object} task - Task object
   * @returns {Promise<Object>}
   */
  async handleTaskAssignment(task) {
    console.log(`[${this.agentType}] Task assignment received:`, {
      agentId: this.agentId,
      taskId: task.id,
      taskType: task.type,
      description: task.description?.substring(0, 100),
      timestamp: new Date().toISOString()
    });

    const taskStartTime = Date.now();

    try {
      // Update state
      console.log(`[${this.agentType}] Updating state to 'working':`, {
        agentId: this.agentId,
        taskId: task.id,
        previousStatus: this.state.status
      });

      this.state.status = 'working';
      this.state.currentTask = task;

      this.emit('taskStarted', {
        agentId: this.agentId,
        taskId: task.id,
        timestamp: Date.now()
      });

      console.log(`[${this.agentType}] Executing task:`, {
        agentId: this.agentId,
        taskId: task.id
      });

      // Execute task with timeout
      const result = await this._executeWithTimeout(task);

      const taskDuration = Date.now() - taskStartTime;

      console.log(`[${this.agentType}] Task execution completed:`, {
        agentId: this.agentId,
        taskId: task.id,
        duration: taskDuration,
        durationSeconds: (taskDuration / 1000).toFixed(2),
        resultSize: JSON.stringify(result).length
      });

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

      console.log(`[${this.agentType}] Sending task completion message:`, {
        agentId: this.agentId,
        taskId: task.id,
        conversationHistoryLength: this.state.conversationHistory.length
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

      console.log(`[${this.agentType}] Task completed successfully:`, {
        agentId: this.agentId,
        taskId: task.id,
        totalDuration: Date.now() - taskStartTime
      });

      return result;

    } catch (error) {
      const taskDuration = Date.now() - taskStartTime;

      console.error(`[${this.agentType}] Task execution failed:`, {
        agentId: this.agentId,
        taskId: task.id,
        duration: taskDuration,
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack?.split('\n').slice(0, 3)
      });

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

      console.log(`[${this.agentType}] Sending task failure notification:`, {
        agentId: this.agentId,
        taskId: task.id
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
      console.log(`[${this.agentType}] Task cleanup:`, {
        agentId: this.agentId,
        taskId: task.id,
        finalStatus: this.state.status
      });

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
    const payloadSize = JSON.stringify(message.payload || {}).length;

    console.log(`[${this.agentType}] Sending message:`, {
      agentId: this.agentId,
      type: message.type,
      priority: message.priority || 'NORMAL',
      payloadSize,
      hasEstimatedCost: !!message.estimatedCost,
      hasActualCost: !!message.actualCost,
      timestamp: new Date().toISOString()
    });

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

    const startTime = Date.now();
    const response = await this.communicationHub.routeMessage(fullMessage);
    const duration = Date.now() - startTime;

    console.log(`[${this.agentType}] Message sent successfully:`, {
      agentId: this.agentId,
      type: message.type,
      duration,
      responseSize: JSON.stringify(response).length
    });

    return response;
  }

  /**
   * Request file read
   * @param {string} filePath - Path to file
   * @returns {Promise<string>}
   */
  async readFile(filePath) {
    console.log(`[${this.agentType}] Requesting file read:`, {
      agentId: this.agentId,
      filePath
    });

    const startTime = Date.now();
    const response = await this.sendMessage({
      type: 'FILE_READ',
      payload: { filePath },
      priority: 'NORMAL'
    });

    const duration = Date.now() - startTime;
    console.log(`[${this.agentType}] File read completed:`, {
      agentId: this.agentId,
      filePath,
      duration,
      contentSize: response.content?.length || 0
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
    console.log(`[${this.agentType}] Requesting file write:`, {
      agentId: this.agentId,
      filePath,
      contentSize: content.length,
      options
    });

    const startTime = Date.now();
    const response = await this.sendMessage({
      type: 'FILE_WRITE',
      payload: { filePath, content, options },
      priority: 'NORMAL'
    });

    const duration = Date.now() - startTime;
    console.log(`[${this.agentType}] File write completed:`, {
      agentId: this.agentId,
      filePath,
      duration,
      bytesWritten: content.length
    });

    return response;
  }

  /**
   * Request file lock
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} Lock ID
   */
  async acquireLock(filePath) {
    console.log(`[${this.agentType}] Requesting lock:`, {
      agentId: this.agentId,
      resource: filePath
    });

    const startTime = Date.now();
    const response = await this.sendMessage({
      type: 'LOCK',
      payload: { resource: filePath },
      priority: 'HIGH'
    });

    const duration = Date.now() - startTime;
    console.log(`[${this.agentType}] Lock acquired:`, {
      agentId: this.agentId,
      resource: filePath,
      lockId: response.lockId,
      duration
    });

    return response.lockId;
  }

  /**
   * Release file lock
   * @param {string} lockId - Lock ID
   * @returns {Promise<void>}
   */
  async releaseLock(lockId) {
    console.log(`[${this.agentType}] Releasing lock:`, {
      agentId: this.agentId,
      lockId
    });

    const startTime = Date.now();
    await this.sendMessage({
      type: 'UNLOCK',
      payload: { lockId },
      priority: 'HIGH'
    });

    const duration = Date.now() - startTime;
    console.log(`[${this.agentType}] Lock released:`, {
      agentId: this.agentId,
      lockId,
      duration
    });
  }

  /**
   * Request Claude API call
   * @param {Array} messages - Conversation messages
   * @param {Object} options - API options
   * @returns {Promise<Object>}
   */
  async callClaude(messages, options = {}) {
    console.log(`[${this.agentType}] Requesting Claude API call:`, {
      agentId: this.agentId,
      messageCount: messages.length,
      model: options.model || 'default',
      maxTokens: options.maxTokens || 'default',
      priority: options.priority || 'MEDIUM',
      hasSystemPrompt: !!options.systemPrompt
    });

    // Estimate cost for budget validation
    const estimatedCost = this._estimateClaudeCost(messages, options);
    console.log(`[${this.agentType}] Claude cost estimated:`, {
      agentId: this.agentId,
      estimatedCost: estimatedCost.toFixed(6)
    });

    const startTime = Date.now();
    const response = await this.sendMessage({
      type: 'CLAUDE_REQUEST',
      payload: { messages, options },
      priority: options.priority || 'MEDIUM',
      estimatedCost: estimatedCost
    });

    const duration = Date.now() - startTime;

    console.log(`[${this.agentType}] Claude API call completed:`, {
      agentId: this.agentId,
      duration,
      durationSeconds: (duration / 1000).toFixed(2),
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
      actualCost: response.usage?.cost?.toFixed(6),
      estimatedCost: estimatedCost.toFixed(6),
      costVariance: response.usage?.variance?.toFixed(6)
    });

    // Store in conversation history
    this.state.conversationHistory.push({
      messages,
      response: response.content,
      timestamp: Date.now(),
      cost: response.usage?.cost
    });

    console.log(`[${this.agentType}] Conversation history updated:`, {
      agentId: this.agentId,
      historyLength: this.state.conversationHistory.length,
      totalCost: this.state.conversationHistory
        .reduce((sum, entry) => sum + (entry.cost || 0), 0)
        .toFixed(6)
    });

    return response;
  }

  /**
   * Estimate Claude API cost
   * @private
   */
  _estimateClaudeCost(messages, options = {}) {
    // Approximate cost estimation (same as ClaudeClient)
    const costs = {
      'claude-3-opus-20240229': { input: 0.000015, output: 0.000075 },
      'claude-3-sonnet-20240229': { input: 0.000003, output: 0.000015 },
      'claude-3-5-sonnet-20241022': { input: 0.000003, output: 0.000015 },
      'claude-3-haiku-20240307': { input: 0.00000025, output: 0.00000125 },
      'claude-sonnet-4-5': { input: 0.000003, output: 0.000015 },
      'claude-sonnet-4-5-20250929': { input: 0.000003, output: 0.000015 }
    };

    const model = options.model || process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229';
    const modelCosts = costs[model] || costs['claude-3-sonnet-20240229'];

    // Estimate input tokens (with 20% buffer)
    const inputText = messages.map(m => m.content).join('\n');
    const inputTokens = Math.ceil((inputText.length / 4) * 1.2);

    // Estimate output tokens (use max as conservative estimate)
    const maxTokens = options.maxTokens || 4000;

    return (inputTokens * modelCosts.input) + (maxTokens * modelCosts.output);
  }

  /**
   * Request handoff to another agent
   * @param {string} targetAgentType - Type of agent to hand off to
   * @param {Object} context - Context for handoff
   * @returns {Promise<Object>}
   */
  async requestHandoff(targetAgentType, context) {
    console.log(`[${this.agentType}] Requesting handoff:`, {
      agentId: this.agentId,
      fromAgent: this.agentType,
      targetAgentType,
      contextSize: JSON.stringify(context).length,
      conversationHistoryLength: this.state.conversationHistory.length
    });

    const startTime = Date.now();
    const response = await this.sendMessage({
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

    const duration = Date.now() - startTime;
    console.log(`[${this.agentType}] Handoff completed:`, {
      agentId: this.agentId,
      targetAgentType,
      duration,
      success: !!response
    });

    return response;
  }

  /**
   * Parse Claude JSON response (shared utility for all agents)
   * @param {string} content - Claude response content
   * @returns {Object} Parsed JSON object
   * @protected
   */
  parseClaudeJSON(content) {
    console.log(`[${this.agentType}] Parsing Claude JSON response:`, {
      agentId: this.agentId,
      contentLength: content.length,
      contentPreview: content.substring(0, 100)
    });

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

      console.log(`[${this.agentType}] Attempting regex pattern matching:`, {
        agentId: this.agentId,
        patternCount: patterns.length
      });

      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
          console.log(`[${this.agentType}] Pattern ${i + 1} matched:`, {
            agentId: this.agentId,
            extractedLength: match[1].length
          });
          try {
            const parsed = JSON.parse(match[1].trim());
            console.log(`[${this.agentType}] Successfully parsed with pattern ${i + 1}:`, {
              agentId: this.agentId,
              objectKeys: Object.keys(parsed).length
            });
            return parsed;
          } catch (e) {
            console.warn(`[${this.agentType}] Pattern ${i + 1} extraction failed:`, {
              agentId: this.agentId,
              error: e.message
            });
            continue;
          }
        }
      }

      console.log(`[${this.agentType}] No patterns matched, trying string replacement:`, {
        agentId: this.agentId
      });

      // Strategy 2: Remove code fences with string replacement
      jsonStr = cleanContent
        .replace(/^```json\s*\n?/i, '')
        .replace(/^```\s*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim();

      // Try to parse the cleaned string
      try {
        const parsed = JSON.parse(jsonStr);
        console.log(`[${this.agentType}] Successfully parsed with string replacement:`, {
          agentId: this.agentId,
          objectKeys: Object.keys(parsed).length
        });
        return parsed;
      } catch (e) {
        console.warn(`[${this.agentType}] String replacement parsing failed:`, {
          agentId: this.agentId,
          error: e.message
        });

        // Strategy 3: Find JSON object boundaries
        const jsonMatch = cleanContent.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          console.log(`[${this.agentType}] Found JSON object boundaries:`, {
            agentId: this.agentId,
            extractedLength: jsonMatch[1].length
          });
          const parsed = JSON.parse(jsonMatch[1].trim());
          console.log(`[${this.agentType}] Successfully parsed with boundary detection:`, {
            agentId: this.agentId,
            objectKeys: Object.keys(parsed).length
          });
          return parsed;
        }
      }

      console.log(`[${this.agentType}] Attempting raw content parse:`, {
        agentId: this.agentId
      });

      // Strategy 4: Last resort - try raw content
      const parsed = JSON.parse(cleanContent);
      console.log(`[${this.agentType}] Successfully parsed raw content:`, {
        agentId: this.agentId,
        objectKeys: Object.keys(parsed).length
      });
      return parsed;

    } catch (error) {
      // Log full response for debugging
      console.error(`[${this.agentType}] Parse error - all strategies failed:`, {
        agentId: this.agentId,
        error: error.message,
        errorType: error.constructor.name,
        contentLength: content.length,
        contentPreview: content.substring(0, 1000)
      });

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
    console.log(`[${this.agentType}] Validating task:`, {
      agentId: this.agentId,
      taskId: task.id,
      hasDescription: !!task.description,
      taskType: task.type
    });

    if (!task.id) {
      console.warn(`[${this.agentType}] Task validation failed: Missing ID`, {
        agentId: this.agentId
      });
      return { valid: false, reason: 'Task missing ID' };
    }

    if (!task.description) {
      console.warn(`[${this.agentType}] Task validation failed: Missing description`, {
        agentId: this.agentId,
        taskId: task.id
      });
      return { valid: false, reason: 'Task missing description' };
    }

    console.log(`[${this.agentType}] Task validation passed:`, {
      agentId: this.agentId,
      taskId: task.id
    });

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
    console.log(`[${this.agentType}] Retry attempt ${attempt}/${this.config.retryAttempts}:`, {
      agentId: this.agentId,
      attempt,
      maxAttempts: this.config.retryAttempts
    });

    const attemptStartTime = Date.now();

    try {
      const result = await operation();
      const duration = Date.now() - attemptStartTime;

      console.log(`[${this.agentType}] Operation succeeded on attempt ${attempt}:`, {
        agentId: this.agentId,
        attempt,
        duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - attemptStartTime;

      console.error(`[${this.agentType}] Operation failed (attempt ${attempt}/${this.config.retryAttempts}):`, {
        agentId: this.agentId,
        attempt,
        maxAttempts: this.config.retryAttempts,
        duration,
        error: error.message,
        errorType: error.constructor.name
      });

      if (attempt >= this.config.retryAttempts) {
        console.error(`[${this.agentType}] Max retries reached, failing operation:`, {
          agentId: this.agentId,
          totalAttempts: attempt,
          finalError: error.message
        });
        throw error;
      }

      const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
      console.log(`[${this.agentType}] Retrying with backoff:`, {
        agentId: this.agentId,
        delay,
        delaySeconds: (delay / 1000).toFixed(2),
        nextAttempt: attempt + 1
      });

      await new Promise(resolve => setTimeout(resolve, delay));

      return this.retryWithBackoff(operation, attempt + 1);
    }
  }

  /**
   * Shutdown agent gracefully
   * @returns {Promise<void>}
   */
  async shutdown() {
    console.log(`[${this.agentType}] Shutting down agent:`, {
      agentId: this.agentId,
      currentStatus: this.state.status,
      hasCurrentTask: !!this.state.currentTask,
      completedTasks: this.state.completedTasks.length,
      failedTasks: this.state.failedTasks.length,
      conversationHistoryLength: this.state.conversationHistory.length
    });

    const totalCost = this.state.conversationHistory
      .reduce((sum, entry) => sum + (entry.cost || 0), 0);

    console.log(`[${this.agentType}] Agent statistics:`, {
      agentId: this.agentId,
      totalTasks: this.state.completedTasks.length + this.state.failedTasks.length,
      successRate: this.state.completedTasks.length > 0
        ? ((this.state.completedTasks.length / (this.state.completedTasks.length + this.state.failedTasks.length)) * 100).toFixed(2) + '%'
        : 'N/A',
      totalCost: totalCost.toFixed(6),
      apiCalls: this.state.conversationHistory.length
    });

    this._stopHeartbeat();

    console.log(`[${this.agentType}] Heartbeat stopped:`, {
      agentId: this.agentId
    });

    this.emit('shutdown', {
      agentId: this.agentId,
      completedTasks: this.state.completedTasks.length,
      failedTasks: this.state.failedTasks.length,
      timestamp: Date.now()
    });

    console.log(`[${this.agentType}] Agent shutdown complete:`, {
      agentId: this.agentId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Serialize agent state for checkpointing
   * @returns {Object}
   */
  serialize() {
    console.log(`[${this.agentType}] Serializing agent state:`, {
      agentId: this.agentId,
      status: this.state.status,
      hasCurrentTask: !!this.state.currentTask,
      completedTasks: this.state.completedTasks.length,
      failedTasks: this.state.failedTasks.length,
      conversationHistoryLength: this.state.conversationHistory.length
    });

    const serialized = {
      agentId: this.agentId,
      agentType: this.agentType,
      status: this.state.status,
      currentTask: this.state.currentTask,
      completedTasks: this.state.completedTasks,
      failedTasks: this.state.failedTasks,
      conversationHistory: this.state.conversationHistory,
      timestamp: Date.now()
    };

    const serializedSize = JSON.stringify(serialized).length;

    console.log(`[${this.agentType}] State serialization complete:`, {
      agentId: this.agentId,
      serializedSize,
      timestamp: new Date().toISOString()
    });

    return serialized;
  }

  /**
   * Restore agent state from checkpoint
   * @param {Object} state - Serialized state
   */
  restore(state) {
    console.log(`[${this.agentType}] Restoring agent state:`, {
      agentId: this.agentId,
      restoredStatus: state.status,
      hasCurrentTask: !!state.currentTask,
      completedTasks: state.completedTasks?.length || 0,
      failedTasks: state.failedTasks?.length || 0,
      conversationHistoryLength: state.conversationHistory?.length || 0,
      checkpointTimestamp: state.timestamp ? new Date(state.timestamp).toISOString() : 'N/A'
    });

    this.state.status = state.status || 'idle';
    this.state.currentTask = state.currentTask || null;
    this.state.completedTasks = state.completedTasks || [];
    this.state.failedTasks = state.failedTasks || [];
    this.state.conversationHistory = state.conversationHistory || [];

    this.emit('restored', {
      agentId: this.agentId,
      timestamp: Date.now()
    });

    console.log(`[${this.agentType}] Agent state restored:`, {
      agentId: this.agentId,
      currentStatus: this.state.status,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = BaseAgent;
