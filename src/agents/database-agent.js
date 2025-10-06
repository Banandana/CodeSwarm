/**
 * Database Agent
 * Specializes in database design and operations
 */

const BaseAgent = require('./base-agent');
const { generateDatabasePrompt } = require('./prompts/database-agent');
const { AgentError } = require('../utils/errors');

class DatabaseAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'database', communicationHub, options);
  }

  /**
   * Execute database task
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

    // Prepare context
    const context = await this._prepareContext(task);

    // Generate prompt
    const { systemPrompt, userPrompt, temperature, maxTokens } =
      generateDatabasePrompt(task, context);

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

    return {
      taskId: task.id,
      agentType: this.agentType,
      files: result.files.map(f => ({
        path: f.path,
        action: f.action,
        size: f.content.length
      })),
      migrations: result.migrations || [],
      indexes: result.indexes || [],
      dependencies: result.dependencies || [],
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

    // Read existing schema/migration files
    if (task.filesToRead && task.filesToRead.length > 0) {
      for (const filePath of task.filesToRead) {
        try {
          const content = await this.readFile(filePath);

          context.existingFiles.push({
            path: filePath,
            content,
            lines: content.split('\n').length
          });
        } catch (error) {
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
   * Parse Claude response
   * @private
   */
  _parseResponse(content) {
    try {
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
          content: content.substring(0, 200)
        }
      );
    }
  }

  /**
   * Execute file operations
   * @private
   */
  async _executeFileOperations(files, task) {
    if (!files || files.length === 0) {
      return;
    }

    for (const file of files) {
      try {
        let lockId;
        if (file.action === 'modify') {
          lockId = await this.acquireLock(file.path);
        }

        try {
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
        } finally {
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
   * Validate database-specific task requirements
   * @param {Object} task
   * @returns {Object}
   */
  validateTask(task) {
    const baseValidation = super.validateTask(task);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    if (task.agentType && task.agentType !== 'database') {
      return {
        valid: false,
        reason: `Task assigned to wrong agent type: ${task.agentType}`
      };
    }

    return { valid: true };
  }
}

module.exports = DatabaseAgent;
