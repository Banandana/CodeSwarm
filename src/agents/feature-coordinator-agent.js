/**
 * Feature Coordinator Agent
 * Manages detailed task planning and execution for a specific feature/module
 * Operates as a sub-coordinator under the main coordinator
 */

const BaseAgent = require('./base-agent');
const { generateFeatureCoordinatorPrompt } = require('./prompts/feature-coordinator-agent');
const { AgentError } = require('../utils/errors');

class FeatureCoordinatorAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'feature-coordinator', communicationHub, options);

    this.feature = null;
    this.tasks = [];
    this.completedTasks = [];
    this.failedTasks = [];
    this.activeTasks = new Map();
    this.workerAgents = new Map();

    // Add error handler
    this.on('error', (error) => {
      console.error(`[${this.agentId}] Error:`, error.message);
    });
  }

  /**
   * Plan detailed tasks for the assigned feature
   * @param {Object} feature - Feature specification from main coordinator
   * @returns {Promise<Object>}
   */
  async planFeature(feature) {
    try {
      this.feature = feature;

      console.log(`[${this.agentId}] Planning feature: ${feature.name}`);

      // Generate detailed task plan
      const { systemPrompt, userPrompt, temperature, maxTokens } =
        generateFeatureCoordinatorPrompt('PLAN_FEATURE', { feature });

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

      // Validate tasks
      if (!plan.tasks || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
        throw new AgentError(
          `Feature plan must contain at least one task`,
          { agentId: this.agentId, featureId: feature.id }
        );
      }

      // Validate each task has exactly one file
      for (const task of plan.tasks) {
        if (!task.files || task.files.length !== 1) {
          throw new AgentError(
            `Task ${task.id} must have exactly 1 file, got ${task.files?.length || 0}`,
            { agentId: this.agentId, taskId: task.id }
          );
        }
      }

      // Store tasks with parent feature reference
      this.tasks = plan.tasks.map(task => ({
        ...task,
        parentFeatureId: feature.id,
        parentCoordinatorId: this.agentId
      }));

      console.log(`[${this.agentId}] Created ${this.tasks.length} tasks for feature ${feature.name}`);

      this.emit('featurePlanned', {
        featureId: feature.id,
        taskCount: this.tasks.length,
        estimatedCost: plan.estimatedCost || 0,
        timestamp: Date.now()
      });

      return {
        featureId: feature.id,
        tasks: this.tasks,
        estimatedCost: plan.estimatedCost || 0,
        dependencies: plan.dependencies || [],
        metadata: plan.metadata || {}
      };

    } catch (error) {
      throw new AgentError(
        `Failed to plan feature ${feature?.name}: ${error.message}`,
        { agentId: this.agentId, featureId: feature?.id }
      );
    }
  }

  /**
   * Execute all tasks for this feature
   * @returns {Promise<Object>}
   */
  async executeFeature() {
    if (!this.feature || this.tasks.length === 0) {
      throw new AgentError(
        'No feature plan available. Call planFeature() first.',
        { agentId: this.agentId }
      );
    }

    console.log(`[${this.agentId}] Executing ${this.tasks.length} tasks for feature ${this.feature.name}`);

    this.emit('featureExecutionStarted', {
      featureId: this.feature.id,
      taskCount: this.tasks.length,
      timestamp: Date.now()
    });

    try {
      // Process tasks in dependency order
      const taskQueue = [...this.tasks];
      const completedIds = new Set();

      while (taskQueue.length > 0 || this.activeTasks.size > 0) {
        // Get ready tasks
        const readyTasks = this._getReadyTasks(taskQueue, completedIds);

        // Assign ready tasks to worker agents
        for (const task of readyTasks) {
          await this._assignTaskToWorker(task);
        }

        // Wait for at least one task to complete
        if (this.activeTasks.size > 0) {
          await this._waitForTaskCompletion();
        }

        // Update completed IDs
        this.completedTasks.forEach(t => completedIds.add(t.id));
      }

      // Return results
      return {
        featureId: this.feature.id,
        success: this.failedTasks.length === 0,
        completedTasks: this.completedTasks.length,
        failedTasks: this.failedTasks.length,
        results: this.completedTasks,
        errors: this.failedTasks
      };

    } catch (error) {
      throw new AgentError(
        `Failed to execute feature ${this.feature.name}: ${error.message}`,
        { agentId: this.agentId, featureId: this.feature.id }
      );
    }
  }

  /**
   * Get tasks ready to execute (dependencies satisfied)
   * @private
   */
  _getReadyTasks(taskQueue, completedIds) {
    const maxConcurrent = this.config.maxConcurrentTasks || 5;
    const availableSlots = maxConcurrent - this.activeTasks.size;

    if (availableSlots <= 0) {
      return [];
    }

    const ready = [];

    for (let i = 0; i < taskQueue.length && ready.length < availableSlots; i++) {
      const task = taskQueue[i];
      const deps = task.dependencies || [];
      const depsComplete = deps.every(depId => completedIds.has(depId));

      if (depsComplete) {
        ready.push(task);
        taskQueue.splice(i, 1);
        i--;
      }
    }

    return ready;
  }

  /**
   * Assign task to appropriate worker agent
   * @private
   */
  async _assignTaskToWorker(task) {
    try {
      // Get or create worker agent for task type
      let agent = this.workerAgents.get(task.agentType);

      if (!agent) {
        agent = await this._createWorkerAgent(task.agentType);
        this.workerAgents.set(task.agentType, agent);
      }

      // Mark task as active
      this.activeTasks.set(task.id, {
        task,
        agent,
        startTime: Date.now()
      });

      console.log(`[${this.agentId}] Assigned task ${task.id} to ${task.agentType} agent`);

      // Send task assignment
      const taskPromise = agent.handleTaskAssignment(task);

      // Handle completion
      taskPromise
        .then(result => this._handleTaskSuccess(task, result))
        .catch(error => this._handleTaskFailure(task, error));

    } catch (error) {
      console.error(`[${this.agentId}] Failed to assign task ${task.id}:`, error.message);
      this.failedTasks.push({ task, error: error.message });
      this.activeTasks.delete(task.id);
    }
  }

  /**
   * Create worker agent instance
   * @private
   */
  async _createWorkerAgent(agentType) {
    const AgentClass = this._getAgentClass(agentType);
    const agentId = `${agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const agent = new AgentClass(agentId, this.communicationHub, {
      ...this.config,
      parentCoordinatorId: this.agentId
    });

    await agent.initialize();
    return agent;
  }

  /**
   * Get agent class by type
   * @private
   */
  _getAgentClass(agentType) {
    const agentMap = {
      'backend': require('./backend-agent'),
      'frontend': require('./frontend-agent'),
      'testing': require('./testing-agent'),
      'database': require('./database-agent'),
      'devops': require('./devops-agent'),
      'docs': require('./docs-agent'),
      'architect': require('./architect-agent')
    };

    const AgentClass = agentMap[agentType];
    if (!AgentClass) {
      throw new AgentError(
        `Unknown agent type: ${agentType}`,
        { agentId: this.agentId, agentType }
      );
    }

    return AgentClass;
  }

  /**
   * Handle task success
   * @private
   */
  _handleTaskSuccess(task, result) {
    this.activeTasks.delete(task.id);
    this.completedTasks.push({ ...task, result });

    console.log(`[${this.agentId}] Task ${task.id} completed successfully`);

    this.emit('taskCompleted', {
      featureId: this.feature.id,
      taskId: task.id,
      timestamp: Date.now()
    });
  }

  /**
   * Handle task failure
   * @private
   */
  _handleTaskFailure(task, error) {
    this.activeTasks.delete(task.id);
    this.failedTasks.push({ ...task, error: error.message });

    console.error(`[${this.agentId}] Task ${task.id} failed:`, error.message);

    this.emit('taskFailed', {
      featureId: this.feature.id,
      taskId: task.id,
      error: error.message,
      timestamp: Date.now()
    });
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
        if (this.activeTasks.size === 0) {
          clearInterval(checkInterval);
          resolve();
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new AgentError(
            `Task completion timeout after ${timeout}ms`,
            { agentId: this.agentId }
          ));
        }
      }, 1000);
    });
  }

  /**
   * Parse Claude response
   * @private
   */
  _parseResponse(content) {
    return this.parseClaudeJSON(content);
  }

  /**
   * Serialize feature coordinator state
   */
  serialize() {
    return {
      ...super.serialize(),
      feature: this.feature,
      tasks: this.tasks,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks
    };
  }
}

module.exports = FeatureCoordinatorAgent;
