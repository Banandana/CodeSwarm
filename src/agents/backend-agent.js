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

    // Add error handler to prevent crashes
    this.on('error', (error) => {
      console.error(`[${this.agentId}] Error:`, error.message);
    });
  }

  /**
   * Execute backend development task
   * @param {Object} task - Task to execute
   * @returns {Promise<Object>}
   */
  async executeTask(task) {
    console.log(`[BackendAgent] executeTask called for task:`, task.id);

    // Validate task
    console.log(`[BackendAgent] Validating task...`);
    const validation = this.validateTask(task);
    if (!validation.valid) {
      throw new AgentError(
        `Invalid task: ${validation.reason}`,
        { agentId: this.agentId, taskId: task.id }
      );
    }

    // Prepare context for prompt generation
    console.log(`[BackendAgent] Preparing context...`);
    const context = await this._prepareContext(task);
    console.log(`[BackendAgent] Context prepared`);

    // Generate prompt
    console.log(`[BackendAgent] Generating prompt...`);
    const { systemPrompt, userPrompt, temperature, maxTokens } =
      generateBackendPrompt(task, context);
    console.log(`[BackendAgent] Prompt generated (${userPrompt.length} chars)`);

    // Call Claude API
    console.log(`[BackendAgent] Calling Claude API...`);
    const response = await this.retryWithBackoff(async () => {
      try {
        const claudeResponse = await this.callClaude(
          [{ role: 'user', content: userPrompt }],
          {
            systemPrompt,
            temperature,
            maxTokens,
            priority: task.priority || 'MEDIUM'
          }
        );
        console.log(`[BackendAgent] Claude API responded (${claudeResponse.content?.length || 0} chars)`);
        return claudeResponse;
      } catch (error) {
        console.error(`[BackendAgent] Claude API call failed:`, error.message);
        throw error;
      }
    });

    // Parse response
    console.log(`[BackendAgent] Parsing response...`);
    const result = this._parseResponse(response.content);
    console.log(`[BackendAgent] Response parsed, ${result.files?.length || 0} files to write`);

    // Validate exactly one file
    if (!result.files || result.files.length !== 1) {
      throw new AgentError(
        `Agent must return exactly 1 file, got ${result.files?.length || 0}. Task: ${task.id}`,
        { agentId: this.agentId, taskId: task.id, fileCount: result.files?.length || 0 }
      );
    }

    // Execute file operations
    console.log(`[BackendAgent] Executing file operations...`);
    await this._executeFileOperations(result.files, task);
    console.log(`[BackendAgent] File operations complete`);

    // Return result
    return {
      taskId: task.id,
      agentType: this.agentType,
      files: result.files.map(f => ({
        path: f.path,
        action: f.action,
        size: (f.contentBase64 || f.content || '').length
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
    return this.parseClaudeJSON(content);
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
        // Decode Base64 content if present, otherwise use plain content
        const content = file.contentBase64
          ? Buffer.from(file.contentBase64, 'base64').toString('utf-8')
          : file.content;

        if (!content) {
          throw new Error(`File ${file.path} has no content or contentBase64 field`);
        }

        // Acquire lock for file
        let lockId;
        if (file.action === 'modify') {
          lockId = await this.acquireLock(file.path);
        }

        try {
          if (file.action === 'create' || file.action === 'modify') {
            await this.writeFile(file.path, content, {
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
