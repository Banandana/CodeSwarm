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

    // Begin transaction for file operations
    let transactionId = null;
    if (this.fileOps && this.fileOps.transactionManager) {
      transactionId = this.fileOps.transactionManager.beginTransaction();
      console.log(`[BackendAgent] Transaction started: ${transactionId}`);
    }

    try {
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

      // Parse response with null safety
      console.log(`[BackendAgent] Parsing response...`);
      if (!response || !response.content) {
        throw new AgentError(
          `Invalid response from Claude API: ${!response ? 'response is null/undefined' : 'response.content is null/undefined'}`,
          { agentId: this.agentId, taskId: task.id }
        );
      }

      // Validate content has substance
      const contentTrimmed = response.content.trim();
      if (contentTrimmed.length === 0) {
        throw new AgentError(
          `Empty response content from Claude API`,
          { agentId: this.agentId, taskId: task.id }
        );
      }

      if (contentTrimmed.length < 10) {
        console.warn(`[BackendAgent] Warning: Very short response content (${contentTrimmed.length} chars)`);
      }

      const result = this._parseResponse(response.content);
      console.log(`[BackendAgent] Response parsed, ${result.files?.length || 0} files to write`);

      // Validate files is an array
      if (!Array.isArray(result.files)) {
        throw new AgentError(
          `Result.files must be an array, got ${typeof result.files}. Task: ${task.id}`,
          { agentId: this.agentId, taskId: task.id, filesType: typeof result.files }
        );
      }

      // Validate exactly one file
      if (result.files.length !== 1) {
        throw new AgentError(
          `Agent must return exactly 1 file, got ${result.files.length}. Task: ${task.id}`,
          { agentId: this.agentId, taskId: task.id, fileCount: result.files.length }
        );
      }

      // Execute file operations with transaction
      console.log(`[BackendAgent] Executing file operations...`);
      await this._executeFileOperations(result.files, task, transactionId);
      console.log(`[BackendAgent] File operations complete`);

      // Commit transaction on success
      if (transactionId && this.fileOps && this.fileOps.transactionManager) {
        await this.fileOps.transactionManager.commitTransaction(transactionId);
        console.log(`[BackendAgent] Transaction committed: ${transactionId}`);
      }

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
    } catch (error) {
      // Rollback transaction on error
      if (transactionId && this.fileOps && this.fileOps.transactionManager) {
        try {
          await this.fileOps.transactionManager.rollbackTransaction(transactionId);
          console.log(`[BackendAgent] Transaction rolled back: ${transactionId}`);
        } catch (rollbackError) {
          console.error(`[BackendAgent] Failed to rollback transaction ${transactionId}:`, rollbackError.message);
        }
      }
      throw error;
    }
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
  async _executeFileOperations(files, task, transactionId = null) {
    if (!files || files.length === 0) {
      return;
    }

    // Validate files is an array
    if (!Array.isArray(files)) {
      throw new AgentError(
        `Files must be an array, got ${typeof files}`,
        { agentId: this.agentId, taskId: task.id }
      );
    }

    for (const file of files) {
      // Acquire lock BEFORE try block for modify operations
      let lockId = null;
      if (file.action === 'modify') {
        lockId = await this.acquireLock(file.path);

        // Validate lock was acquired
        if (!lockId) {
          throw new AgentError(
            `Failed to acquire lock for file: ${file.path}`,
            { agentId: this.agentId, taskId: task.id, filePath: file.path }
          );
        }
      }

      try {
        // Decode Base64 content if present, otherwise use plain content
        const content = file.contentBase64
          ? Buffer.from(file.contentBase64, 'base64').toString('utf-8')
          : file.content;

        if (!content) {
          throw new Error(`File ${file.path} has no content or contentBase64 field`);
        }

        if (file.action === 'create' || file.action === 'modify') {
          await this.writeFile(file.path, content, {
            action: file.action,
            taskId: task.id,
            lockId: lockId,
            agentId: this.agentId,
            transactionId: transactionId
          });

          this.emit('fileModified', {
            agentId: this.agentId,
            taskId: task.id,
            filePath: file.path,
            action: file.action,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        // Wrap release in try-catch with logging
        if (lockId) {
          try {
            await this.releaseLock(lockId);
          } catch (releaseError) {
            console.error(`[BackendAgent] Failed to release lock ${lockId}:`, releaseError.message);
          }
        }

        throw new AgentError(
          `Failed to write file ${file.path}: ${error.message}`,
          {
            agentId: this.agentId,
            taskId: task.id,
            filePath: file.path
          }
        );
      } finally {
        // Release lock in finally block
        if (lockId) {
          try {
            await this.releaseLock(lockId);
          } catch (releaseError) {
            console.error(`[BackendAgent] Failed to release lock ${lockId} in finally:`, releaseError.message);
          }
        }
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
