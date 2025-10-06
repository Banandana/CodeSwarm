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

      this.emit('phaseCompleted', {
        phase: 'analysis',
        result: {
          totalTasks: plan.tasks.length,
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
    // Listen for task completion to create checkpoints
    this.coordinator.on('taskCompleted', async (event) => {
      this.execution.completedTasks.push(event.taskId);

      // Checkpoint after each task
      if (this.config.checkpointInterval === 'per-task') {
        await this._checkpoint('task-completed', {
          taskId: event.taskId,
          completedCount: this.execution.completedTasks.length
        });
      }

      this.emit('progress', {
        completed: this.execution.completedTasks.length,
        total: plan.tasks.length,
        percentage: (this.execution.completedTasks.length / plan.tasks.length) * 100,
        timestamp: Date.now()
      });
    });

    this.coordinator.on('taskFailed', async (event) => {
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
    });

    // Execute the plan
    const result = await this.coordinator.executePlan();

    return result;
  }

  /**
   * Create checkpoint
   * @private
   */
  async _checkpoint(type, additionalData = {}) {
    try {
      const coordinatorState = this.coordinator.serialize();

      // Flatten orchestration data for checkpoint compatibility
      const state = {
        // Top-level required fields
        currentTask: coordinatorState.orchestration?.projectPlan?.currentTask || this.execution.currentTask || null,
        completedTasks: coordinatorState.orchestration?.completedTasks || this.execution.completedTasks || [],
        pendingTasks: coordinatorState.orchestration?.taskQueue || [],
        failedTasks: coordinatorState.orchestration?.failedTasks || this.execution.failedTasks || [],

        // Budget tracking
        budgetUsed: await this._getBudgetUsed(),
        budgetRemaining: await this._getBudgetRemaining(),

        // File tracking
        filesCreated: this.execution.filesCreated || [],
        filesModified: this.execution.filesModified || [],

        // Agent tracking
        agents: coordinatorState.orchestration?.agents || [],

        // Project info
        projectInfo: coordinatorState.orchestration?.projectPlan?.projectInfo || {},

        // Config
        config: this.config || {},

        // Keep full orchestration for debugging
        orchestration: coordinatorState.orchestration,

        // Execution metadata
        execution: {
          startTime: this.execution.startTime,
          currentTask: this.execution.currentTask
        },

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

    if (!plan.tasks || plan.tasks.length === 0) {
      issues.push('No tasks in plan');
    }

    // Check for circular dependencies
    const cycles = this._detectCircularDependencies(plan.tasks);
    if (cycles.length > 0) {
      issues.push(`Circular dependencies detected: ${cycles.join(', ')}`);
    }

    // Check budget
    if (plan.estimatedBudget && plan.estimatedBudget <= 0) {
      issues.push('Invalid budget estimate');
    }

    // Check file conflicts
    const conflicts = this._detectFileConflicts(plan.fileAllocation);
    if (conflicts.length > 0) {
      issues.push(`File conflicts detected: ${conflicts.length} files`);
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
}

module.exports = TaskExecutor;
