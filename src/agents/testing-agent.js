/**
 * Testing Agent
 * Specializes in test generation and validation
 */

const BaseAgent = require('./base-agent');
const { generateTestingPrompt } = require('./prompts/testing-agent');
const { AgentError } = require('../utils/errors');

class TestingAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'testing', communicationHub, options);

    // Add error handler to prevent crashes
    this.on('error', (error) => {
      this.logger.agent(this.agentId, "error", `[${this.agentId}] Error:`, error.message);
    });
  }

  /**
   * Execute testing task
   * @param {Object} task - Task to execute
   * @returns {Promise<Object>}
   */
  async executeTask(task) {
    this.logger.agent(this.agentId, "debug", `[TestingAgent] executeTask called for task:`, task.id);

    // Validate task
    this.logger.agent(this.agentId, "debug", `[TestingAgent] Validating task...`);
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
      this.logger.agent(this.agentId, "debug", `[TestingAgent] Transaction started: ${transactionId}`);
    }

    try {
      // Prepare context
      this.logger.agent(this.agentId, "debug", `[TestingAgent] Preparing context...`);
      const context = await this._prepareContext(task);
      this.logger.agent(this.agentId, "debug", `[TestingAgent] Context prepared`);

      // Generate prompt
      this.logger.agent(this.agentId, "debug", `[TestingAgent] Generating prompt...`);
      const { systemPrompt, userPrompt, temperature, maxTokens } =
        generateTestingPrompt(task, context);

      // Call Claude API
      this.logger.agent(this.agentId, "debug", `[TestingAgent] Calling Claude API...`);
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

      // Parse response with null safety
      this.logger.agent(this.agentId, "debug", `[TestingAgent] Parsing response...`);
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
        this.logger.agent(this.agentId, "warn", `[TestingAgent] Warning: Very short response content (${contentTrimmed.length} chars)`);
      }

      const result = this._parseResponse(response.content);

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

      // Execute file operations (write test files) with transaction
      await this._executeFileOperations(result.files, task, transactionId);

      // Commit transaction on success
      if (transactionId && this.fileOps && this.fileOps.transactionManager) {
        await this.fileOps.transactionManager.commitTransaction(transactionId);
        this.logger.agent(this.agentId, "debug", `[TestingAgent] Transaction committed: ${transactionId}`);
      }

      // Run tests if requested
      let testResults = null;
      if (task.metadata?.runTests) {
        testResults = await this._runTests(task);
      }

      return {
        taskId: task.id,
        agentType: this.agentType,
        files: result.files.map(f => ({
          path: f.path,
          action: f.action,
          size: (f.content || f.contentBase64 || '').length
        })),
        dependencies: result.dependencies || [],
        testCoverage: result.testCoverage,
        testResults,
        documentation: result.documentation,
        usage: response.usage,
        metadata: response.metadata
      };
    } catch (error) {
      // Rollback transaction on error
      if (transactionId && this.fileOps && this.fileOps.transactionManager) {
        try {
          await this.fileOps.transactionManager.rollbackTransaction(transactionId);
          this.logger.agent(this.agentId, "debug", `[TestingAgent] Transaction rolled back: ${transactionId}`);
        } catch (rollbackError) {
          this.logger.agent(this.agentId, "error", `[TestingAgent] Failed to rollback transaction ${transactionId}:`, rollbackError.message);
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
      existingFiles: [],
      sourceCode: null // Store source code here instead of mutating task
    };

    // Read source code files to test
    if (task.filesToRead && task.filesToRead.length > 0) {
      for (const filePath of task.filesToRead) {
        try {
          const content = await this.readFile(filePath);

          // Store source code in context, not in task metadata
          context.sourceCode = content;

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
      // Acquire lock BEFORE try block for create and modify operations
      let lockId = null;
      if (file.action === 'modify' || file.action === 'create') {
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
      } catch (error) {
        // Wrap release in try-catch with logging
        if (lockId) {
          try {
            await this.releaseLock(lockId);
          } catch (releaseError) {
            this.logger.agent(this.agentId, "error", `[TestingAgent] Failed to release lock ${lockId}:`, releaseError.message);
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
            this.logger.agent(this.agentId, "error", `[TestingAgent] Failed to release lock ${lockId} in finally:`, releaseError.message);
          }
        }
      }
    }
  }

  /**
   * Run tests (sends message to request test execution)
   * @private
   */
  async _runTests(task) {
    try {
      const response = await this.sendMessage({
        type: 'RUN_TESTS',
        payload: {
          taskId: task.id,
          testFiles: task.metadata?.testFiles || [],
          framework: task.projectInfo?.testing?.framework || 'jest'
        },
        priority: 'NORMAL'
      });

      return response.testResults;

    } catch (error) {
      this.emit('warning', {
        message: `Could not run tests: ${error.message}`,
        taskId: task.id
      });

      return null;
    }
  }

  /**
   * Validate testing-specific task requirements
   * @param {Object} task
   * @returns {Object}
   */
  validateTask(task) {
    const baseValidation = super.validateTask(task);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    if (task.agentType && task.agentType !== 'testing') {
      return {
        valid: false,
        reason: `Task assigned to wrong agent type: ${task.agentType}`
      };
    }

    return { valid: true };
  }
}

module.exports = TestingAgent;
