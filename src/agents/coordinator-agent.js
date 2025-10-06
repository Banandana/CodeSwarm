/**
 * Coordinator Agent
 * Orchestrates the entire code generation system
 */

const BaseAgent = require('./base-agent');
const { generateCoordinatorPrompt } = require('./prompts/coordinator-agent');
const { AgentError } = require('../utils/errors');

class CoordinatorAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'coordinator', communicationHub, options);

    this.orchestration = {
      projectPlan: null,
      taskQueue: [],
      activeTasks: new Map(),
      completedTasks: [],
      failedTasks: [],
      agents: new Map(),
      fileAllocation: new Map()
    };
  }

  /**
   * Initialize coordinator and analyze proposal
   * @param {string} proposal - Project proposal text
   * @param {Object} projectInfo - Project metadata
   * @returns {Promise<Object>}
   */
  async analyzeProposal(proposal, projectInfo = {}) {
    try {
      // Generate analysis prompt
      const { systemPrompt, userPrompt, temperature, maxTokens } =
        generateCoordinatorPrompt('ANALYZE_PROPOSAL', { proposal });

      // Call Claude API
      const response = await this.retryWithBackoff(async () => {
        return await this.callClaude(
          [{ role: 'user', content: userPrompt }],
          {
            systemPrompt,
            temperature,
            maxTokens,
            priority: 'HIGH'
          }
        );
      });

      // Parse plan
      const plan = this._parseResponse(response.content);

      // Enhance with project info
      plan.projectInfo = projectInfo;

      // Store plan
      this.orchestration.projectPlan = plan;

      // Build task queue with priorities
      this._buildTaskQueue(plan);

      // Emit event
      this.emit('proposalAnalyzed', {
        totalTasks: plan.tasks.length,
        estimatedBudget: plan.estimatedBudget,
        criticalPath: plan.criticalPath,
        timestamp: Date.now()
      });

      return plan;

    } catch (error) {
      throw new AgentError(
        `Failed to analyze proposal: ${error.message}`,
        { agentId: this.agentId }
      );
    }
  }

  /**
   * Execute project plan
   * @returns {Promise<Object>}
   */
  async executePlan() {
    if (!this.orchestration.projectPlan) {
      throw new AgentError('No project plan available', { agentId: this.agentId });
    }

    const plan = this.orchestration.projectPlan;

    this.emit('executionStarted', {
      totalTasks: plan.tasks.length,
      timestamp: Date.now()
    });

    try {
      // Process tasks according to dependency graph
      await this._processTaskQueue();

      // Return final results
      return {
        success: true,
        completedTasks: this.orchestration.completedTasks.length,
        failedTasks: this.orchestration.failedTasks.length,
        filesCreated: this._getFilesCreated(),
        filesModified: this._getFilesModified(),
        totalCost: this._getTotalCost()
      };

    } catch (error) {
      throw new AgentError(
        `Execution failed: ${error.message}`,
        {
          agentId: this.agentId,
          completedTasks: this.orchestration.completedTasks.length,
          failedTasks: this.orchestration.failedTasks.length
        }
      );
    }
  }

  /**
   * Build task queue from plan
   * @private
   */
  _buildTaskQueue(plan) {
    // Sort tasks by dependency order and priority
    const taskMap = new Map(plan.tasks.map(t => [t.id, t]));

    // Build dependency graph
    const dependencyGraph = new Map();
    for (const task of plan.tasks) {
      dependencyGraph.set(task.id, task.dependencies || []);
    }

    // Topological sort
    const sorted = this._topologicalSort(taskMap, dependencyGraph);

    // Sort within same level by priority
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    sorted.sort((a, b) => {
      return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
    });

    this.orchestration.taskQueue = sorted;
  }

  /**
   * Topological sort for task ordering
   * @private
   */
  _topologicalSort(taskMap, dependencyGraph) {
    const visited = new Set();
    const result = [];

    function visit(taskId) {
      if (visited.has(taskId)) return;

      visited.add(taskId);

      const deps = dependencyGraph.get(taskId) || [];
      for (const depId of deps) {
        visit(depId);
      }

      const task = taskMap.get(taskId);
      if (task) {
        result.push(task);
      }
    }

    for (const taskId of taskMap.keys()) {
      visit(taskId);
    }

    return result;
  }

  /**
   * Process task queue
   * @private
   */
  async _processTaskQueue() {
    while (this.orchestration.taskQueue.length > 0 ||
           this.orchestration.activeTasks.size > 0) {

      // Check for tasks ready to execute
      const readyTasks = this._getReadyTasks();

      // Assign tasks to agents
      for (const task of readyTasks) {
        await this._assignTask(task);
      }

      // Wait for at least one task to complete
      if (this.orchestration.activeTasks.size > 0) {
        await this._waitForTaskCompletion();
      }

      // Check budget status
      await this._checkBudgetStatus();
    }
  }

  /**
   * Get tasks ready to execute (dependencies satisfied)
   * @private
   */
  _getReadyTasks() {
    const maxConcurrent = this.config.maxConcurrentTasks || 3;
    const availableSlots = maxConcurrent - this.orchestration.activeTasks.size;

    if (availableSlots <= 0) {
      return [];
    }

    const ready = [];
    const completedIds = new Set(this.orchestration.completedTasks.map(t => t.id));

    for (let i = 0; i < this.orchestration.taskQueue.length && ready.length < availableSlots; i++) {
      const task = this.orchestration.taskQueue[i];

      // Check if dependencies are satisfied
      const deps = task.dependencies || [];
      const depsComplete = deps.every(depId => completedIds.has(depId));

      if (depsComplete) {
        ready.push(task);
        this.orchestration.taskQueue.splice(i, 1);
        i--; // Adjust index after removal
      }
    }

    return ready;
  }

  /**
   * Assign task to appropriate specialist agent
   * @private
   */
  async _assignTask(task) {
    try {
      // Get or create agent for task type
      let agent = this.orchestration.agents.get(task.agentType);

      if (!agent) {
        agent = await this._createAgent(task.agentType);
        this.orchestration.agents.set(task.agentType, agent);
      }

      // Mark task as active
      this.orchestration.activeTasks.set(task.id, {
        task,
        agent,
        startTime: Date.now()
      });

      this.emit('taskAssigned', {
        taskId: task.id,
        agentType: task.agentType,
        timestamp: Date.now()
      });

      // Send task assignment message
      const taskPromise = agent.handleTaskAssignment(task);

      // Handle completion
      taskPromise
        .then(result => this._handleTaskSuccess(task, result))
        .catch(error => this._handleTaskFailure(task, error));

    } catch (error) {
      await this._handleTaskFailure(task, error);
    }
  }

  /**
   * Create specialist agent
   * @private
   */
  async _createAgent(agentType) {
    try {
      let AgentClass;

      switch (agentType) {
        case 'backend':
          AgentClass = require('./backend-agent');
          return new AgentClass(null, this.communicationHub);
        case 'testing':
          AgentClass = require('./testing-agent');
          return new AgentClass(null, this.communicationHub);
        case 'database':
          AgentClass = require('./database-agent');
          return new AgentClass(null, this.communicationHub);
        case 'frontend':
          AgentClass = require('./frontend-agent');
          return new AgentClass(null, this.communicationHub);
        case 'devops':
          AgentClass = require('./devops-agent');
          return new AgentClass(null, this.communicationHub);
        case 'docs':
          AgentClass = require('./docs-agent');
          return new AgentClass(null, this.communicationHub);
        case 'architect':
          AgentClass = require('./architect-agent');
          return new AgentClass(null, this.communicationHub);
        default:
          throw new AgentError(
            `Unknown agent type: ${agentType}`,
            { agentId: this.agentId }
          );
      }
    } catch (error) {
      throw new AgentError(
        `Failed to create ${agentType} agent: ${error.message}`,
        {
          agentId: this.agentId,
          agentType,
          originalError: error.message,
          stack: error.stack
        }
      );
    }
  }

  /**
   * Handle successful task completion
   * @private
   */
  async _handleTaskSuccess(task, result) {
    // Remove from active tasks
    this.orchestration.activeTasks.delete(task.id);

    // Add to completed
    this.orchestration.completedTasks.push({
      id: task.id,
      result,
      completedAt: Date.now()
    });

    this.emit('taskCompleted', {
      taskId: task.id,
      agentType: task.agentType,
      timestamp: Date.now()
    });
  }

  /**
   * Handle task failure
   * @private
   */
  async _handleTaskFailure(task, error) {
    // Remove from active tasks
    this.orchestration.activeTasks.delete(task.id);

    // Attempt recovery
    const recovery = await this._attemptRecovery(task, error);

    if (recovery.success) {
      // Re-queue task or modified tasks
      if (recovery.modifiedTasks) {
        this.orchestration.taskQueue.unshift(...recovery.modifiedTasks);
      } else {
        this.orchestration.taskQueue.unshift(task);
      }
    } else {
      // Add to failed tasks
      this.orchestration.failedTasks.push({
        id: task.id,
        error: error.message,
        failedAt: Date.now()
      });

      this.emit('taskFailed', {
        taskId: task.id,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Attempt to recover from task failure
   * @private
   */
  async _attemptRecovery(task, error) {
    try {
      const context = {
        failedTask: task,
        error: error.message,
        completedTasks: this.orchestration.completedTasks,
        pendingTasks: this.orchestration.taskQueue,
        budgetUsed: this._getTotalCost(),
        budgetRemaining: await this._getRemainingBudget()
      };

      const { systemPrompt, userPrompt, temperature, maxTokens } =
        generateCoordinatorPrompt('REPLAN_AFTER_FAILURE', context);

      const response = await this.callClaude(
        [{ role: 'user', content: userPrompt }],
        { systemPrompt, temperature, maxTokens, priority: 'HIGH' }
      );

      const recovery = this._parseResponse(response.content);

      return {
        success: recovery.strategy !== 'escalate',
        modifiedTasks: recovery.modifiedTasks
      };

    } catch (recoveryError) {
      return { success: false };
    }
  }

  /**
   * Wait for at least one task to complete
   * @private
   */
  async _waitForTaskCompletion() {
    const timeout = 300000; // 5 minutes
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.orchestration.activeTasks.size === 0) {
          clearInterval(checkInterval);
          resolve();
        }

        // Timeout check
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);

          const staleTasks = Array.from(this.orchestration.activeTasks.values())
            .map(t => ({
              taskId: t.task.id,
              agentType: t.task.agentType,
              runtime: Date.now() - t.startTime
            }));

          this.emit('taskTimeout', { staleTasks });

          reject(new AgentError(
            `Task completion timeout after ${timeout}ms. Stale tasks: ${JSON.stringify(staleTasks)}`,
            {
              agentId: this.agentId,
              staleTasks
            }
          ));
        }
      }, 1000);
    });
  }

  /**
   * Check budget status and reallocate if needed
   * @private
   */
  async _checkBudgetStatus() {
    const totalCost = this._getTotalCost();
    const remaining = await this._getRemainingBudget();
    const total = totalCost + remaining;

    if (remaining / total < 0.2) { // Less than 20% remaining
      this.emit('budgetWarning', {
        totalCost,
        remaining,
        utilizationPercent: (totalCost / total) * 100,
        timestamp: Date.now()
      });
    }
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
        { agentId: this.agentId, content: content.substring(0, 200) }
      );
    }
  }

  /**
   * Get total cost across all tasks
   * @private
   */
  _getTotalCost() {
    return this.state.conversationHistory.reduce((sum, entry) => {
      return sum + (entry.cost || 0);
    }, 0);
  }

  /**
   * Get remaining budget
   * @private
   */
  async _getRemainingBudget() {
    const response = await this.sendMessage({
      type: 'BUDGET_STATUS',
      payload: {},
      priority: 'NORMAL'
    });

    return response.remaining || 0;
  }

  /**
   * Get list of files created
   * @private
   */
  _getFilesCreated() {
    const files = new Set();

    for (const task of this.orchestration.completedTasks) {
      if (task.result?.files) {
        for (const file of task.result.files) {
          if (file.action === 'create') {
            files.add(file.path);
          }
        }
      }
    }

    return Array.from(files);
  }

  /**
   * Get list of files modified
   * @private
   */
  _getFilesModified() {
    const files = new Set();

    for (const task of this.orchestration.completedTasks) {
      if (task.result?.files) {
        for (const file of task.result.files) {
          if (file.action === 'modify') {
            files.add(file.path);
          }
        }
      }
    }

    return Array.from(files);
  }

  /**
   * Get current status
   * @returns {Object}
   */
  getStatus() {
    return {
      ...super.getStatus(),
      projectPlan: this.orchestration.projectPlan ? {
        totalTasks: this.orchestration.projectPlan.tasks.length,
        estimatedBudget: this.orchestration.projectPlan.estimatedBudget
      } : null,
      progress: {
        pending: this.orchestration.taskQueue.length,
        active: this.orchestration.activeTasks.size,
        completed: this.orchestration.completedTasks.length,
        failed: this.orchestration.failedTasks.length
      }
    };
  }

  /**
   * Serialize coordinator state
   * @returns {Object}
   */
  serialize() {
    return {
      ...super.serialize(),
      orchestration: {
        projectPlan: this.orchestration.projectPlan,
        taskQueue: this.orchestration.taskQueue,
        completedTasks: this.orchestration.completedTasks,
        failedTasks: this.orchestration.failedTasks,
        fileAllocation: Array.from(this.orchestration.fileAllocation.entries())
      }
    };
  }
}

module.exports = CoordinatorAgent;
