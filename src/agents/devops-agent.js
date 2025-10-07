/**
 * DevOps Agent
 * Specializes in DevOps and infrastructure tasks
 */

const BaseAgent = require('./base-agent');
const { generateDevOpsPrompt } = require('./prompts/devops-agent');
const { AgentError } = require('../utils/errors');

class DevOpsAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'devops', communicationHub, options);

    // Add error handler to prevent crashes
    this.on('error', (error) => {
      console.error(`[${this.agentId}] Error:`, error.message);
    });
  }

  /**
   * Execute DevOps task
   * @param {Object} task - Task to execute
   * @returns {Promise<Object>}
   */
  async executeTask(task) {
    console.log(`[DevOpsAgent] executeTask called for task:`, task.id);

    // Validate task
    console.log(`[DevOpsAgent] Validating task...`);
    const validation = this.validateTask(task);
    if (!validation.valid) {
      throw new AgentError(
        `Invalid task: ${validation.reason}`,
        { agentId: this.agentId, taskId: task.id }
      );
    }

    // Prepare context
    console.log(`[DevOpsAgent] Preparing context...`);
    const context = await this._prepareContext(task);
    console.log(`[DevOpsAgent] Context prepared`);

    // Generate prompt
    console.log(`[DevOpsAgent] Generating prompt...`);
    const { systemPrompt, userPrompt, temperature, maxTokens } =
      generateDevOpsPrompt(task, context);

    // Call Claude API
    console.log(`[DevOpsAgent] Calling Claude API...`);
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
        size: (f.content || f.contentBase64 || '').length
      })),
      commands: result.commands || [],
      secrets: result.secrets || [],
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
          // Decode Base64 content if present, otherwise use plain content
          const content = file.contentBase64
            ? Buffer.from(file.contentBase64, 'base64').toString('utf-8')
            : file.content;

          if (!content) {
            throw new Error(`File ${file.path} has no content or contentBase64 field`);
          }

          await this.writeFile(file.path, content, {
            action: file.action,
            taskId: task.id,
            lockId: lockId,
            agentId: this.agentId
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
   * Validate DevOps-specific task requirements
   * @param {Object} task
   * @returns {Object}
   */
  validateTask(task) {
    const baseValidation = super.validateTask(task);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    if (task.agentType && task.agentType !== 'devops') {
      return {
        valid: false,
        reason: `Task assigned to wrong agent type: ${task.agentType}`
      };
    }

    return { valid: true };
  }
}

module.exports = DevOpsAgent;
