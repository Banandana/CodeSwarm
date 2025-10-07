/**
 * Documentation Agent
 * Specializes in generating and maintaining documentation
 */

const BaseAgent = require('./base-agent');
const { generateDocsPrompt } = require('./prompts/docs-agent');
const { AgentError } = require('../utils/errors');

class DocsAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'docs', communicationHub, options);

    // Add error handler to prevent crashes
    this.on('error', (error) => {
      console.error(`[${this.agentId}] Error:`, error.message);
    });
  }

  /**
   * Execute documentation task
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
      generateDocsPrompt(task, context);

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

    // Validate exactly one file
    if (!result.files || result.files.length !== 1) {
      throw new AgentError(
        `Agent must return exactly 1 file, got ${result.files?.length || 0}. Task: ${task.id}`,
        { agentId: this.agentId, taskId: task.id, fileCount: result.files?.length || 0 }
      );
    }
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
      sections: result.sections || [],
      coverage: result.coverage || 'N/A',
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

    // Read existing files if specified
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
    return this.parseClaudeJSON(content);
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
   * Validate documentation-specific task requirements
   * @param {Object} task
   * @returns {Object}
   */
  validateTask(task) {
    const baseValidation = super.validateTask(task);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    if (task.agentType && task.agentType !== 'docs') {
      return {
        valid: false,
        reason: `Task assigned to wrong agent type: ${task.agentType}`
      };
    }

    return { valid: true };
  }
}

module.exports = DocsAgent;
