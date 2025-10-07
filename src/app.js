/**
 * CodeSwarm Main Application
 * Integrates all components
 */

require('dotenv').config();

const fs = require('fs-extra');
const path = require('path');

// Core components
const BudgetManager = require('./core/budget/manager');
const StateManager = require('./core/state/manager');
const DistributedLockManager = require('./core/locking/distributed-lock');
const CommunicationHub = require('./core/communication/hub');
const CheckpointManager = require('./core/state/checkpoint');
const { initializeLogger, closeLogger } = require('./core/logging/logger');

// File system
const FileSystemOperations = require('./filesystem/operations');
const GitManager = require('./filesystem/git-manager');
const BackupManager = require('./filesystem/backup');

// API
const ClaudeClient = require('./api/claude-client');

// Agents
const CoordinatorAgent = require('./agents/coordinator-agent');

// Tasks
const ProposalParser = require('./tasks/proposal-parser');
const TaskExecutor = require('./tasks/task-executor');

// Validation
const SecurityScanner = require('./validation/security-scanner');

// CLI
const ProgressDisplay = require('./cli/progress-display');

const { CodeSwarmError } = require('./utils/errors');

class CodeSwarm {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.CLAUDE_API_KEY,
      model: config.model || process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
      budgetLimit: config.budgetLimit || parseFloat(process.env.BUDGET_LIMIT) || 10.0,
      maxConcurrentAgents: config.maxConcurrentAgents ||
        parseInt(process.env.MAX_CONCURRENT_AGENTS) || 3,
      mode: config.mode || 'verbose'
    };

    // Validate API key
    if (!this.config.apiKey) {
      throw new CodeSwarmError(
        'Claude API key is required. Set CLAUDE_API_KEY environment variable or run setup.',
        { code: 'MISSING_API_KEY' }
      );
    }

    this.components = {};
    this.progressDisplay = null;
    this.logger = null;
    this.eventListeners = []; // Track all event listeners for cleanup
  }

  /**
   * Generate code from proposal
   * @param {string} proposal - Proposal text
   * @param {string} outputDir - Output directory
   * @param {Object} options - Generation options
   * @returns {Promise<Object>}
   */
  async generate(proposal, outputDir, options = {}) {
    try {
      // Initialize logger first
      this.logger = await initializeLogger(outputDir);
      this.logger.info('Starting code generation', {
        proposalLength: proposal.length,
        outputDir,
        budget: options.budget || this.config.budgetLimit
      });

      // Initialize components
      await this._initialize(outputDir, options);

      // Show start
      const parsed = ProposalParser.parse(proposal);
      this.progressDisplay.start({
        name: parsed.title,
        description: parsed.description
      });

      this.logger.info('Proposal parsed', {
        title: parsed.title,
        featuresCount: parsed.features.length
      });

      // Create backup
      this.progressDisplay.phase('backup');
      await this.components.backup.createBackup();

      // Execute project
      this.progressDisplay.phase('generation');

      const result = await this.components.executor.executeProject(
        proposal,
        {
          title: parsed.title,
          description: parsed.description,
          features: parsed.features,
          technicalRequirements: parsed.technicalRequirements,
          constraints: parsed.constraints
        }
      );

      // Run security scan
      this.progressDisplay.phase('security-scan');
      const scanResults = await this.components.scanner.scanAll();
      await this.components.scanner.saveReport(scanResults);

      if (scanResults.summary.CRITICAL > 0 || scanResults.summary.HIGH > 0) {
        this.progressDisplay.warning(
          `Security scan found ${scanResults.summary.CRITICAL} critical and ` +
          `${scanResults.summary.HIGH} high severity issues. ` +
          `See SECURITY_REPORT.md for details.`
        );
      }

      // Initialize git if not already
      const gitInitialized = await this.components.git.initialize();
      if (gitInitialized) {
        await this.components.git.createInitialCommit();
      }

      // Show completion
      this.progressDisplay.complete({
        ...result,
        securityIssues: scanResults.issuesFound
      });

      this.logger.info('Code generation completed', {
        filesCreated: result.filesCreated?.length || 0,
        tasksCompleted: result.tasksCompleted,
        securityIssues: scanResults.issuesFound
      });

      return result;

    } catch (error) {
      if (this.logger) {
        this.logger.error('Code generation failed', {
          error: error.message,
          stack: error.stack
        });
      }
      this.progressDisplay.error(error.message);
      throw error;
    } finally {
      await this._cleanup();
    }
  }

  /**
   * Resume from checkpoint
   * @param {string} outputDir - Output directory
   * @param {Object} options - Resume options
   * @returns {Promise<Object>}
   */
  async resume(outputDir, options = {}) {
    try {
      // Initialize logger first
      this.logger = await initializeLogger(outputDir);
      this.logger.info('Resuming code generation from checkpoint', { outputDir });

      // Initialize components
      await this._initialize(outputDir, options);

      // Load checkpoint
      const checkpoint = await this.components.checkpointManager.loadLatestCheckpoint();

      if (!checkpoint) {
        throw new CodeSwarmError(
          'No checkpoint found to resume from',
          { outputDir }
        );
      }

      this.progressDisplay.resuming(checkpoint);

      // Resume execution
      const result = await this.components.executor.resumeFromCheckpoint(checkpoint);

      // Run security scan
      this.progressDisplay.phase('security-scan');
      const scanResults = await this.components.scanner.scanAll();
      await this.components.scanner.saveReport(scanResults);

      // Show completion
      this.progressDisplay.complete(result);

      return result;

    } catch (error) {
      this.progressDisplay.error(error.message);
      throw error;
    } finally {
      await this._cleanup();
    }
  }

  /**
   * Initialize all components
   * @private
   */
  async _initialize(outputDir, options = {}) {
    // Ensure output directory exists
    await fs.ensureDir(outputDir);
    await fs.ensureDir(path.join(outputDir, '.codeswarm'));

    // Progress display
    this.progressDisplay = new ProgressDisplay(options.mode || this.config.mode);

    // Budget manager
    this.components.budget = new BudgetManager({
      maxBudget: options.budget || this.config.budgetLimit,
      minReserve: parseFloat(process.env.MIN_BUDGET_RESERVE) || 1.0,
      warningThreshold: 0.9,
      logger: this.logger
    });

    // State manager
    this.components.state = new StateManager(
      path.join(outputDir, '.codeswarm'),
      { logger: this.logger }
    );

    await this.components.state.initialize();

    // Lock manager
    this.components.locks = new DistributedLockManager();

    // File system operations (with lock manager integration)
    this.components.fileOps = new FileSystemOperations(outputDir, this.components.locks);

    // Claude API client
    this.components.claude = new ClaudeClient(this.components.budget, {
      apiKey: this.config.apiKey,
      model: this.config.model,
      logger: this.logger
    });

    // Communication hub
    this.components.hub = new CommunicationHub(
      this.components.state,
      this.components.locks,
      this.components.budget,
      {
        maxConcurrentOperations: 50,
        logger: this.logger
      }
    );

    // Remove any existing listeners to prevent duplicates
    this.components.hub.removeAllListeners('FILE_READ');
    this.components.hub.removeAllListeners('FILE_WRITE');
    this.components.hub.removeAllListeners('CLAUDE_REQUEST');

    // Attach file operations handler to hub
    const fileReadHandler = async (message) => {
      try {
        const content = await this.components.fileOps.readFile(message.payload.filePath);
        this.components.hub.emit(`FILE_READ_RESPONSE_${message.id}`, { content });
      } catch (error) {
        this.components.hub.emit(`FILE_READ_ERROR_${message.id}`, error);
      }
    };

    const fileWriteHandler = async (message) => {
      try {
        const result = await this.components.fileOps.writeFile(
          message.payload.filePath,
          message.payload.content,
          message.payload.options
        );
        this.components.hub.emit(`FILE_WRITE_RESPONSE_${message.id}`, result);
      } catch (error) {
        this.components.hub.emit(`FILE_WRITE_ERROR_${message.id}`, error);
      }
    };

    const claudeRequestHandler = async (message) => {
      try {
        // ClaudeClient handles its own budget validation
        const result = await this.components.claude.sendMessage(
          message.payload.messages,
          message.agentId,
          message.payload.options
        );
        // Emit response event that the hub is waiting for
        this.components.hub.emit(`CLAUDE_RESPONSE_${message.id}`, result);
      } catch (error) {
        // Emit error event that the hub is waiting for
        this.components.hub.emit(`CLAUDE_ERROR_${message.id}`, error);
      }
    };

    this.components.hub.on('FILE_READ', fileReadHandler);
    this.components.hub.on('FILE_WRITE', fileWriteHandler);
    this.components.hub.on('CLAUDE_REQUEST', claudeRequestHandler);

    // Track listeners for cleanup
    this.eventListeners.push(
      { emitter: this.components.hub, event: 'FILE_READ', handler: fileReadHandler },
      { emitter: this.components.hub, event: 'FILE_WRITE', handler: fileWriteHandler },
      { emitter: this.components.hub, event: 'CLAUDE_REQUEST', handler: claudeRequestHandler }
    );

    // Checkpoint manager
    this.components.checkpointManager = new CheckpointManager(
      path.join(outputDir, '.codeswarm')
    );

    // Coordinator agent
    this.components.coordinator = new CoordinatorAgent(
      'coordinator-main',
      this.components.hub,
      {
        maxConcurrentTasks: this.config.maxConcurrentAgents,
        logger: this.logger
      }
    );

    await this.components.coordinator.initialize();

    // Task executor
    this.components.executor = new TaskExecutor(
      this.components.coordinator,
      this.components.checkpointManager,
      {
        checkpointInterval: 'per-task'
      }
    );

    // Wire up file operations tracking to executor
    this.components.fileOps.on('fileCreated', (event) => {
      this.components.executor.execution.filesCreated.push(event.filePath);
    });

    this.components.fileOps.on('fileModified', (event) => {
      this.components.executor.execution.filesModified.push(event.filePath);
    });

    // Security scanner
    this.components.scanner = new SecurityScanner(outputDir);

    // Backup manager
    this.components.backup = new BackupManager(outputDir);

    // Git manager
    this.components.git = new GitManager(outputDir);

    // Wire up event handlers for progress display
    this._wireEventHandlers();
  }

  /**
   * Wire up event handlers for progress display
   * @private
   */
  _wireEventHandlers() {
    // Define handler functions
    const phaseStartedHandler = (event) => {
      this.progressDisplay.phase(event.phase, event.result);
    };

    const progressHandler = (event) => {
      this.progressDisplay.progress(event);
    };

    const checkpointCreatedHandler = (event) => {
      this.progressDisplay.checkpoint(event.type);
    };

    const taskAssignedHandler = (event) => {
      this.progressDisplay.taskStart({
        id: event.taskId,
        name: event.taskId,
        agentType: event.agentType
      });
    };

    const taskCompletedHandler = (event) => {
      this.progressDisplay.taskComplete(
        { id: event.taskId, agentType: event.agentType },
        {}
      );
    };

    const taskFailedHandler = (event) => {
      this.progressDisplay.taskFail(
        { id: event.taskId, agentType: event.agentType },
        event.error
      );
    };

    const budgetWarningCoordHandler = (event) => {
      this.progressDisplay.budgetUpdate({
        total: event.totalCost + event.remaining,
        used: event.totalCost,
        remaining: event.remaining
      });
    };

    const budgetWarningHandler = (event) => {
      this.progressDisplay.warning(
        `Budget at ${event.utilizationPercent.toFixed(1)}% ` +
        `($${event.totalCost.toFixed(2)} / $${event.maxBudget.toFixed(2)})`
      );
    };

    // Attach handlers
    this.components.executor.on('phaseStarted', phaseStartedHandler);
    this.components.executor.on('progress', progressHandler);
    this.components.executor.on('checkpointCreated', checkpointCreatedHandler);
    this.components.coordinator.on('taskAssigned', taskAssignedHandler);
    this.components.coordinator.on('taskCompleted', taskCompletedHandler);
    this.components.coordinator.on('taskFailed', taskFailedHandler);
    this.components.coordinator.on('budgetWarning', budgetWarningCoordHandler);
    this.components.budget.on('budgetWarning', budgetWarningHandler);

    // Track all listeners for cleanup
    this.eventListeners.push(
      { emitter: this.components.executor, event: 'phaseStarted', handler: phaseStartedHandler },
      { emitter: this.components.executor, event: 'progress', handler: progressHandler },
      { emitter: this.components.executor, event: 'checkpointCreated', handler: checkpointCreatedHandler },
      { emitter: this.components.coordinator, event: 'taskAssigned', handler: taskAssignedHandler },
      { emitter: this.components.coordinator, event: 'taskCompleted', handler: taskCompletedHandler },
      { emitter: this.components.coordinator, event: 'taskFailed', handler: taskFailedHandler },
      { emitter: this.components.coordinator, event: 'budgetWarning', handler: budgetWarningCoordHandler },
      { emitter: this.components.budget, event: 'budgetWarning', handler: budgetWarningHandler }
    );
  }

  /**
   * Cleanup components
   * @private
   */
  async _cleanup() {
    // Remove all event listeners
    for (const { emitter, event, handler } of this.eventListeners) {
      emitter.removeListener(event, handler);
    }
    this.eventListeners = [];

    // Shutdown coordinator and all its agents
    if (this.components.coordinator) {
      await this.components.coordinator.shutdown();
    }

    // Shutdown communication hub
    if (this.components.hub) {
      await this.components.hub.shutdown();
    }

    // Cleanup state manager
    if (this.components.state) {
      await this.components.state.cleanup();
    }

    // Cleanup lock manager
    if (this.components.locks) {
      await this.components.locks.cleanup();
    }

    // Cleanup budget reservations
    if (this.components.budget) {
      this.components.budget.stopCleanup();
      await this.components.budget.cleanup();
    }

    // Close logger last
    if (this.logger) {
      this.logger.info('Shutting down logger');
      await closeLogger();
      this.logger = null;
    }

    // Clear component references
    this.components = {};
  }

  /**
   * Get system status
   * @returns {Object}
   */
  getStatus() {
    if (!this.components.coordinator) {
      return { status: 'not_initialized' };
    }

    return {
      coordinator: this.components.coordinator.getStatus(),
      budget: this.components.budget.getStatus(),
      executor: this.components.executor?.getStatus()
    };
  }
}

module.exports = CodeSwarm;
