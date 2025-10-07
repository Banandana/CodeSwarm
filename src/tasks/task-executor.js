/**
 * Task Executor
 * Manages task execution flow with checkpointing
 */

const EventEmitter = require('events');
const { TaskError } = require('../utils/errors');

class TaskExecutor extends EventEmitter {
  constructor(coordinator, checkpointManager, options = {}) {
    super();

    this.coordinator = coordinator;
    this.checkpointManager = checkpointManager;

    this.config = {
      checkpointInterval: options.checkpointInterval || 'per-task',
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 5000
    };

    this.execution = {
      startTime: null,
      currentTask: null,
      completedTasks: [],
      failedTasks: [],
      filesCreated: [],
      filesModified: [],
      paused: false
    };
  }

  /**
   * Execute project from proposal
   * @param {string} proposal - Project proposal
   * @param {Object} projectInfo - Project metadata
   * @returns {Promise<Object>}
   */
  async executeProject(proposal, projectInfo) {
    try {
      this.execution.startTime = Date.now();

      // Analyze proposal and create plan
      this.emit('phaseStarted', { phase: 'analysis', timestamp: Date.now() });

      const plan = await this.coordinator.analyzeProposal(proposal, projectInfo);

      // In hierarchical coordination, plan has features, not tasks
      // Tasks are generated later by feature coordinators
      this.emit('phaseCompleted', {
        phase: 'analysis',
        result: {
          totalFeatures: plan.features?.length || 0,
          estimatedBudget: plan.estimatedBudget
        },
        timestamp: Date.now()
      });

      // Create initial checkpoint
      await this._checkpoint('initial', {
        plan,
        projectInfo
      });

      // Execute plan
      this.emit('phaseStarted', { phase: 'execution', timestamp: Date.now() });

      const result = await this._executeWithCheckpointing(plan);

      this.emit('phaseCompleted', {
        phase: 'execution',
        result,
        timestamp: Date.now()
      });

      // Create final checkpoint
      await this._checkpoint('final', result);

      return {
        success: true,
        ...result,
        duration: Date.now() - this.execution.startTime
      };

    } catch (error) {
      // Create error checkpoint
      await this._checkpoint('error', {
        error: error.message,
        completedTasks: this.execution.completedTasks.length
      });

      throw new TaskError(
        `Project execution failed: ${error.message}`,
        { originalError: error.message }
      );
    }
  }

  /**
   * Resume execution from checkpoint
   * @param {Object} checkpoint - Checkpoint data
   * @returns {Promise<Object>}
   */
  async resumeFromCheckpoint(checkpoint) {
    try {
      this.emit('resuming', {
        checkpointId: checkpoint.id,
        completedTasks: checkpoint.state.completedTasks?.length || 0,
        timestamp: Date.now()
      });

      // Restore coordinator state
      this.coordinator.restore(checkpoint.state);

      // Continue execution
      const result = await this._executeWithCheckpointing(
        checkpoint.state.projectPlan
      );

      return {
        success: true,
        resumed: true,
        ...result
      };

    } catch (error) {
      throw new TaskError(
        `Failed to resume from checkpoint: ${error.message}`,
        { checkpointId: checkpoint.id }
      );
    }
  }

  /**
   * Execute plan with periodic checkpointing
   * @private
   */
  async _executeWithCheckpointing(plan) {
    // Define handler functions for cleanup
    const taskCompletedHandler = async (event) => {
      this.execution.completedTasks.push(event.taskId);

      // Checkpoint after each task
      if (this.config.checkpointInterval === 'per-task') {
        await this._checkpoint('task-completed', {
          taskId: event.taskId,
          completedCount: this.execution.completedTasks.length
        });
      }

      // Get total task count from coordinator's task queue
      const totalTasks = (this.coordinator.orchestration.completedTasks?.length || 0) +
                        (this.coordinator.orchestration.taskQueue?.length || 0) +
                        (this.coordinator.orchestration.activeTasks?.size || 0);

      this.emit('progress', {
        completed: this.execution.completedTasks.length,
        total: totalTasks > 0 ? totalTasks : this.execution.completedTasks.length,
        percentage: totalTasks > 0 ? (this.execution.completedTasks.length / totalTasks) * 100 : 0,
        timestamp: Date.now()
      });
    };

    const taskFailedHandler = async (event) => {
      this.execution.failedTasks.push({
        taskId: event.taskId,
        error: event.error
      });

      // Checkpoint on failure
      await this._checkpoint('task-failed', {
        taskId: event.taskId,
        error: event.error
      });

      this.emit('taskFailure', {
        taskId: event.taskId,
        error: event.error,
        timestamp: Date.now()
      });
    };

    // Attach listeners
    this.coordinator.on('taskCompleted', taskCompletedHandler);
    this.coordinator.on('taskFailed', taskFailedHandler);

    try {
      // Execute the plan
      const result = await this.coordinator.executePlan();
      return result;
    } finally {
      // Remove listeners after execution completes
      this.coordinator.removeListener('taskCompleted', taskCompletedHandler);
      this.coordinator.removeListener('taskFailed', taskFailedHandler);
    }
  }

  /**
   * Create checkpoint
   * @private
   */
  async _checkpoint(type, additionalData = {}) {
    try {
      const coordinatorState = this.coordinator.serialize();

      // Save orchestration state directly without flattening
      const state = {
        // Full orchestration state (contains projectPlan, features, taskQueue, etc.)
        orchestration: coordinatorState.orchestration,

        // Execution metadata
        execution: {
          startTime: this.execution.startTime,
          currentTask: this.execution.currentTask,
          filesCreated: this.execution.filesCreated || [],
          filesModified: this.execution.filesModified || []
        },

        // Budget tracking
        budgetUsed: await this._getBudgetUsed(),
        budgetRemaining: await this._getBudgetRemaining(),

        // Config
        config: this.config || {},

        // Additional data
        ...additionalData
      };

      await this.checkpointManager.createCheckpoint(state);

      this.emit('checkpointCreated', {
        type,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('error', new TaskError(
        `Checkpoint failed: ${error.message}`,
        { type, error: error.message }
      ));
    }
  }

  /**
   * Get budget used from budget manager
   * @private
   */
  async _getBudgetUsed() {
    try {
      if (!this.coordinator.communicationHub) return 0;

      const status = this.coordinator.communicationHub.budgetManager?.getStatus();
      return status?.totalUsed || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get remaining budget from budget manager
   * @private
   */
  async _getBudgetRemaining() {
    try {
      if (!this.coordinator.communicationHub) return 0;

      const status = this.coordinator.communicationHub.budgetManager?.getStatus();
      return status?.remaining || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Pause execution
   */
  async pause() {
    this.execution.paused = true;

    // Create pause checkpoint
    await this._checkpoint('paused', {
      pausedAt: Date.now()
    });

    this.emit('paused', { timestamp: Date.now() });
  }

  /**
   * Resume execution
   */
  resume() {
    this.execution.paused = false;
    this.emit('resumed', { timestamp: Date.now() });
  }

  /**
   * Get execution status
   * @returns {Object}
   */
  getStatus() {
    return {
      startTime: this.execution.startTime,
      currentTask: this.execution.currentTask,
      completedTasks: this.execution.completedTasks.length,
      failedTasks: this.execution.failedTasks.length,
      paused: this.execution.paused,
      duration: this.execution.startTime ?
        Date.now() - this.execution.startTime : 0
    };
  }

  /**
   * Validate project can be executed
   * @param {Object} plan - Project plan
   * @returns {Object} { valid: boolean, issues: Array }
   */
  validatePlan(plan) {
    const issues = [];

    // In hierarchical coordination, check for features instead of tasks
    if (plan.features) {
      if (plan.features.length === 0) {
        issues.push('No features in plan');
      }
    } else if (!plan.tasks || plan.tasks.length === 0) {
      // Fallback for non-hierarchical plans
      issues.push('No tasks or features in plan');
    }

    // Check for circular dependencies (only if tasks are already generated)
    if (plan.tasks) {
      const cycles = this._detectCircularDependencies(plan.tasks);
      if (cycles.length > 0) {
        issues.push(`Circular dependencies detected: ${cycles.join(', ')}`);
      }
    }

    // Check budget
    if (plan.estimatedBudget && plan.estimatedBudget <= 0) {
      issues.push('Invalid budget estimate');
    }

    // Check file conflicts (only if fileAllocation exists)
    if (plan.fileAllocation) {
      const conflicts = this._detectFileConflicts(plan.fileAllocation);
      if (conflicts.length > 0) {
        issues.push(`File conflicts detected: ${conflicts.length} files`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Detect circular dependencies in task graph
   * @private
   */
  _detectCircularDependencies(tasks) {
    const graph = new Map();

    // Build graph
    for (const task of tasks) {
      graph.set(task.id, task.dependencies || []);
    }

    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    function dfs(taskId, path = []) {
      if (recursionStack.has(taskId)) {
        cycles.push([...path, taskId].join(' -> '));
        return;
      }

      if (visited.has(taskId)) {
        return;
      }

      visited.add(taskId);
      recursionStack.add(taskId);

      const deps = graph.get(taskId) || [];
      for (const dep of deps) {
        dfs(dep, [...path, taskId]);
      }

      recursionStack.delete(taskId);
    }

    for (const taskId of graph.keys()) {
      if (!visited.has(taskId)) {
        dfs(taskId);
      }
    }

    return cycles;
  }

  /**
   * Detect file conflicts
   * @private
   */
  _detectFileConflicts(fileAllocation) {
    const conflicts = [];

    if (!fileAllocation) {
      return conflicts;
    }

    for (const [file, tasks] of Object.entries(fileAllocation)) {
      if (tasks.length > 1) {
        conflicts.push({
          file,
          tasks
        });
      }
    }

    return conflicts;
  }

  /**
   * Validate integration across completed tasks (Enhancement 5)
   * Runs every N tasks to check system-level compatibility
   * @param {Array} completedTasks - All completed tasks
   * @param {Array} specs - All specifications
   * @returns {Promise<Object>} Integration validation result
   * @private
   */
  async _validateIntegration(completedTasks, specs) {
    const IntegrationValidator = require('../validation/integration-validator');

    const validator = new IntegrationValidator(
      this.coordinator.orchestration.projectPlan?.projectInfo?.outputDir || './output',
      this.coordinator.components
    );

    try {
      const result = await validator.validateIntegration(completedTasks, specs);

      console.log(`[TaskExecutor] Integration validation:`);
      console.log(`  Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
      console.log(`  Total issues: ${result.totalIssues}`);
      console.log(`  Critical issues: ${result.criticalIssues}`);

      if (result.criticalIssues > 0) {
        console.warn(`[TaskExecutor] ⚠️  ${result.criticalIssues} critical integration issues found!`);
        // Log critical issues
        result.issues
          .filter(i => i.severity === 'critical')
          .forEach(issue => {
            console.warn(`  - ${issue.message}`);
          });
      }

      return result;

    } catch (error) {
      console.error(`[TaskExecutor] Integration validation failed:`, error.message);
      return {
        passed: false,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Review task implementation against specification (Enhancement 2)
   * Uses confidence-based decision thresholds
   * @param {Object} task - Task that was executed
   * @param {Array} generatedFiles - Files generated by task
   * @param {Object} spec - Specification for the feature
   * @param {Object} validationResults - Syntax/security validation results
   * @returns {Promise<Object>} Review result with decision
   * @private
   */
  async _reviewAgainstSpec(task, generatedFiles, spec, validationResults = {}) {
    const ReviewAgent = require('../agents/review-agent');
    const reviewAgent = new ReviewAgent('review-temp', this.coordinator.communicationHub);
    await reviewAgent.initialize();

    try {
      const review = await reviewAgent.reviewImplementation(
        task,
        generatedFiles,
        spec,
        validationResults
      );

      console.log(`[TaskExecutor] Review for ${task.id}:`);
      console.log(`  Compliance: ${review.complianceScore}%`);
      console.log(`  Confidence: ${review.confidence.overall}% (${review.confidence.reliable ? 'RELIABLE' : 'UNCERTAIN'})`);

      // Adjust thresholds based on confidence
      let status;
      if (!review.confidence.reliable) {
        console.log(`[TaskExecutor] Low review confidence, using conservative thresholds`);

        // Conservative approach when uncertain
        if (review.complianceScore >= 98) {
          status = 'accept';
        } else if (review.complianceScore >= 85) {
          status = 'fix_required';
        } else {
          status = 'regenerate_required';
        }
      } else {
        // Standard thresholds when confident
        if (review.complianceScore >= 95) {
          status = 'accept';
        } else if (review.complianceScore >= 70) {
          status = 'fix_required';
        } else {
          status = 'regenerate_required';
        }
      }

      return { ...review, status };

    } catch (error) {
      console.error(`[TaskExecutor] Review failed for ${task.id}:`, error.message);
      // On review failure, accept if validation passed
      return {
        status: validationResults.syntaxValid ? 'accept' : 'regenerate_required',
        error: error.message,
        fallback: true
      };
    }
  }
}

module.exports = TaskExecutor;
