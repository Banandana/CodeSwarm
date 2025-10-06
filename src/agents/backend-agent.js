/**
 * Backend Agent
 * Specializes in backend development tasks
 */

const BaseAgent = require('./base-agent');
const { generateBackendPrompt } = require('./prompts/backend-agent');
const { AgentError } = require('../utils/errors');

class BackendAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'backend', communicationHub, options);
  }

  /**
   * Execute backend development task
   * @param {Object} task - Task to execute
   * @returns {Promise<Object>}
   */
  async executeTask(task) {
    // Validate task
    const validation = this.validateTask(task);
    if (!validation.valid) {
      throw new AgentError(
        `Invalid task: ${validation.reason}`,
        { agentId: this.agentId, taskId: task.id }
      );
    }

    // Prepare context for prompt generation
    const context = await this._prepareContext(task);

    // Generate prompt
    const { systemPrompt, userPrompt, temperature, maxTokens } =
      generateBackendPrompt(task, context);

    // Call Claude API
    const response = await this.retryWithBackoff(async () => {
      return await this.callClaude(
        [{ role: 'user', content: userPrompt }],
        {
          systemPrompt,
          temperature,
          maxTokens,
          priority: task.priority || 'MEDIUM'
        }
      );
    });

    // Parse response
    const result = this._parseResponse(response.content);

    // Execute file operations
    await this._executeFileOperations(result.files, task);

    // Return result
    return {
      taskId: task.id,
      agentType: this.agentType,
      files: result.files.map(f => ({
        path: f.path,
        action: f.action,
        size: f.content.length
      })),
      dependencies: result.dependencies || [],
      testCases: result.testCases || [],
      securityConsiderations: result.securityConsiderations || [],
      documentation: result.documentation,
      usage: response.usage,
      metadata: response.metadata
    };
  }

  /**
   * Prepare context for task execution
   * @private
   */
  async _prepareContext(task) {
    const context = {
      projectInfo: task.projectInfo || {},
      existingFiles: []
    };

    // Read existing files if specified in task
    if (task.filesToRead && task.filesToRead.length > 0) {
      for (const filePath of task.filesToRead) {
        try {
          const content = await this.readFile(filePath);
          const lines = content.split('\n').length;

          context.existingFiles.push({
            path: filePath,
            content,
            lines
          });
        } catch (error) {
          // File doesn't exist or can't be read - continue anyway
          this.emit('warning', {
            message: `Could not read file: ${filePath}`,
            error: error.message
          });
        }
      }
    }

    return context;
  }

  /**
   * Parse Claude response (expects JSON format)
   * @private
   */
  _parseResponse(content) {
    try {
      // Try to extract JSON from response
      // Claude sometimes wraps JSON in markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                       content.match(/```\n([\s\S]*?)\n```/) ||
                       [null, content];

      const jsonStr = jsonMatch[1] || content;
      return JSON.parse(jsonStr.trim());

    } catch (error) {
      throw new AgentError(
        `Failed to parse Claude response: ${error.message}`,
        {
          agentId: this.agentId,
          content: content.substring(0, 200) // First 200 chars for debugging
        }
      );
    }
  }

  /**
   * Execute file operations (write/modify files)
   * @private
   */
  async _executeFileOperations(files, task) {
    if (!files || files.length === 0) {
      return;
    }

    for (const file of files) {
      try {
        // Acquire lock for file
        let lockId;
        if (file.action === 'modify') {
          lockId = await this.acquireLock(file.path);
        }

        try {
          if (file.action === 'create' || file.action === 'modify') {
            await this.writeFile(file.path, file.content, {
              action: file.action,
              taskId: task.id
            });

            this.emit('fileModified', {
              agentId: this.agentId,
              taskId: task.id,
              filePath: file.path,
              action: file.action,
              timestamp: Date.now()
            });
          }
        } finally {
          // Release lock
          if (lockId) {
            await this.releaseLock(lockId);
          }
        }

      } catch (error) {
        throw new AgentError(
          `Failed to write file ${file.path}: ${error.message}`,
          {
            agentId: this.agentId,
            taskId: task.id,
            filePath: file.path
          }
        );
      }
    }
  }

  /**
   * Validate backend-specific task requirements
   * @param {Object} task
   * @returns {Object}
   */
  validateTask(task) {
    const baseValidation = super.validateTask(task);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // Backend-specific validation
    if (task.agentType && task.agentType !== 'backend') {
      return {
        valid: false,
        reason: `Task assigned to wrong agent type: ${task.agentType}`
      };
    }

    return { valid: true };
  }
}

module.exports = BackendAgent;
