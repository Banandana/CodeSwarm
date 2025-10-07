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
      features: [],
      featureCoordinators: new Map(),
      taskQueue: [],
      activeTasks: new Map(),
      completedTasks: [],
      failedTasks: [],
      agents: new Map(),
      fileAllocation: new Map()
    };

    // Circuit breaker for recovery attempts to prevent infinite loops
    this.recoveryCircuitBreaker = {
      maxAttempts: 3,
      attemptsByTask: new Map(), // taskId -> attempt count
      resetTimeout: 300000 // 5 minutes
    };

    // Add error handler to prevent crashes on unhandled errors
    // This is critical for long-running agent processes
    this.on('error', (error) => {
      console.error(`[${this.agentId}] Error:`, error.message);
      // Log but continue - don't crash the system
    });
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

      // Call Claude API (with retry for network errors only)
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

      // Parse plan (NO RETRY - parsing errors should fail fast)
      const plan = this._parseResponse(response.content);

      // Enhance with project info
      plan.projectInfo = projectInfo;

      // Store plan
      this.orchestration.projectPlan = plan;

      // Validate features exist
      if (!plan.features || !Array.isArray(plan.features) || plan.features.length === 0) {
        throw new AgentError(
          'Plan must contain at least one feature',
          { agentId: this.agentId }
        );
      }

      // Store features
      this.orchestration.features = plan.features;

      // Emit event
      this.emit('proposalAnalyzed', {
        totalFeatures: plan.features.length,
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

    console.log(`[${this.agentId}] Starting execution with ${this.orchestration.features.length} features`);

    this.emit('executionStarted', {
      totalFeatures: this.orchestration.features.length,
      timestamp: Date.now()
    });

    try {
      // Skip feature planning if already have feature coordinators (from resume)
      if (this.orchestration.featureCoordinators.size === 0) {
        // Spawn feature coordinators and plan all features
        await this._planFeatures();

        // Build unified task queue from all feature tasks
        this._buildTaskQueue(plan);
      } else {
        console.log(`[${this.agentId}] Using existing feature plans from checkpoint (${this.orchestration.featureCoordinators.size} features)`);
      }

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
   * Plan all features in parallel using feature coordinators
   * @private
   */
  async _planFeatures() {
    console.log(`[${this.agentId}] Planning ${this.orchestration.features.length} features in parallel`);

    // Spawn feature coordinators for all features
    const planningPromises = this.orchestration.features.map(async (feature) => {
      return await this._spawnFeatureCoordinator(feature);
    });

    // Wait for all feature planning to complete
    const results = await Promise.allSettled(planningPromises);

    // Check for failures
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`[${this.agentId}] ${failures.length} features failed to plan`);
      failures.forEach((f, i) => {
        console.error(`  Feature ${i}: ${f.reason}`);
      });
      throw new AgentError(
        `Failed to plan ${failures.length} features`,
        { agentId: this.agentId, failures: failures.length }
      );
    }

    console.log(`[${this.agentId}] All ${this.orchestration.features.length} features planned successfully`);
  }

  /**
   * Spawn a feature coordinator and plan the feature
   * @private
   */
  async _spawnFeatureCoordinator(feature) {
    const FeatureCoordinatorAgent = require('./feature-coordinator-agent');
    // Use feature ID + timestamp + random string for guaranteed uniqueness
    const coordinatorId = `feature-coord-${feature.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[${this.agentId}] Spawning coordinator for feature: ${feature.name}`);

    const coordinator = new FeatureCoordinatorAgent(
      coordinatorId,
      this.communicationHub,
      {
        ...this.config,
        parentCoordinatorId: this.agentId
      }
    );

    await coordinator.initialize();

    // Plan the feature (generates detailed tasks)
    const plan = await coordinator.planFeature(feature);

    // Store coordinator reference
    this.orchestration.featureCoordinators.set(feature.id, {
      coordinator,
      plan,
      feature
    });

    console.log(`[${this.agentId}] Feature ${feature.name} planned: ${plan.tasks.length} tasks`);

    return plan;
  }

  /**
   * Build task queue from all feature tasks
   * @private
   */
  _buildTaskQueue(plan) {
    // Collect all tasks from all feature coordinators with globally unique IDs
    const allTasks = [];

    for (const [featureId, featureData] of this.orchestration.featureCoordinators) {
      // Prefix task IDs with feature ID to ensure global uniqueness
      const prefixedTasks = featureData.plan.tasks.map(task => ({
        ...task,
        id: `${featureId}-${task.id}`,
        originalId: task.id,  // Keep original for reference
        // Prefix dependencies with same feature ID
        dependencies: (task.dependencies || []).map(depId => `${featureId}-${depId}`)
      }));

      allTasks.push(...prefixedTasks);
    }

    console.log(`[${this.agentId}] Collected ${allTasks.length} tasks from ${this.orchestration.featureCoordinators.size} features`);

    // Handle feature-level dependencies
    if (plan.featureDependencies && plan.featureDependencies.sequential) {
      for (const [sourceFeatureId, targetFeatureId] of plan.featureDependencies.sequential) {
        // Get last task of source feature
        const sourceTasks = allTasks.filter(t => t.parentFeatureId === sourceFeatureId);
        if (sourceTasks.length === 0) continue;

        const lastSourceTask = sourceTasks[sourceTasks.length - 1];

        // Get first task of target feature
        const targetTasks = allTasks.filter(t => t.parentFeatureId === targetFeatureId);
        if (targetTasks.length === 0) continue;

        const firstTargetTask = targetTasks[0];

        // Add dependency from target's first task to source's last task
        if (!firstTargetTask.dependencies) {
          firstTargetTask.dependencies = [];
        }
        firstTargetTask.dependencies.push(lastSourceTask.id);

        console.log(`[${this.agentId}] Added feature dependency: ${targetFeatureId} depends on ${sourceFeatureId}`);
      }
    }

    // Sort tasks by dependency order and priority
    const taskMap = new Map(allTasks.map(t => [t.id, t]));

    // Build dependency graph
    const dependencyGraph = new Map();
    for (const task of allTasks) {
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
    // Track all task promises for event-driven completion
    const activeTaskPromises = new Map();

    // Process queue until all tasks are completed
    while (this.orchestration.taskQueue.length > 0 ||
           this.orchestration.activeTasks.size > 0) {

      // Check for tasks ready to execute
      const readyTasks = this._getReadyTasks();

      // Assign tasks to agents and collect promises
      for (const task of readyTasks) {
        const taskPromise = this._assignTask(task);
        activeTaskPromises.set(task.id, taskPromise);
      }

      // Wait for at least one task to complete using Promise.race
      if (activeTaskPromises.size > 0) {
        await Promise.race(Array.from(activeTaskPromises.values())).catch(() => {
          // Ignore errors here, they're handled in _handleTaskFailure
        });

        // Clean up completed task promises
        for (const [taskId, promise] of activeTaskPromises.entries()) {
          // Check if task is no longer active
          if (!this.orchestration.activeTasks.has(taskId)) {
            activeTaskPromises.delete(taskId);
          }
        }
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
   * @returns {Promise} Task completion promise
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

      // Send task assignment message and return promise for event-driven completion
      const taskPromise = agent.handleTaskAssignment(task)
        .then(result => {
          this._handleTaskSuccess(task, result);
          return result;
        })
        .catch(error => {
          this._handleTaskFailure(task, error);
          throw error;
        });

      return taskPromise;

    } catch (error) {
      await this._handleTaskFailure(task, error);
      throw error;
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
   * Attempt to recover from task failure with circuit breaker
   * @private
   */
  async _attemptRecovery(task, error) {
    // Check circuit breaker - prevent infinite recovery loops
    const attemptCount = this.recoveryCircuitBreaker.attemptsByTask.get(task.id) || 0;

    if (attemptCount >= this.recoveryCircuitBreaker.maxAttempts) {
      console.error(`[${this.agentId}] Circuit breaker open for task ${task.id} (${attemptCount} attempts)`);
      this.emit('circuitBreakerOpen', {
        taskId: task.id,
        attemptCount,
        maxAttempts: this.recoveryCircuitBreaker.maxAttempts
      });
      return { success: false, reason: 'circuit_breaker_open' };
    }

    // Increment attempt count
    this.recoveryCircuitBreaker.attemptsByTask.set(task.id, attemptCount + 1);

    // Reset circuit breaker after timeout
    setTimeout(() => {
      this.recoveryCircuitBreaker.attemptsByTask.delete(task.id);
    }, this.recoveryCircuitBreaker.resetTimeout);

    try {
      const context = {
        failedTask: task,
        error: error.message,
        completedTasks: this.orchestration.completedTasks,
        pendingTasks: this.orchestration.taskQueue,
        budgetUsed: this._getTotalCost(),
        budgetRemaining: await this._getRemainingBudget(),
        attemptNumber: attemptCount + 1,
        maxAttempts: this.recoveryCircuitBreaker.maxAttempts
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
      console.error(`[${this.agentId}] Recovery attempt failed for task ${task.id}:`, recoveryError.message);
      return { success: false, reason: 'recovery_error', error: recoveryError.message };
    }
  }

  /**
   * Wait for at least one task to complete (DEPRECATED - now using Promise.race)
   * This method is kept for backwards compatibility but is no longer used
   * @private
   * @deprecated Use Promise.race on task promises instead
   */
  async _waitForTaskCompletion() {
    // This method is no longer needed with event-driven task completion
    // Tasks complete via Promise.race in _processTaskQueue
    // Keeping this stub for backwards compatibility
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
      // Clean up the content first
      let cleanContent = content.trim();

      // Try multiple extraction strategies
      let jsonStr = cleanContent;

      // Strategy 1: Extract from markdown code fences with 'json' language tag
      let jsonMatch = cleanContent.match(/```json\s*\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1];
      } else {
        // Strategy 2: Extract from generic markdown code fences
        jsonMatch = cleanContent.match(/```\s*\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1];
        } else {
          // Strategy 3: Remove leading/trailing code fences if present
          jsonStr = cleanContent
            .replace(/^```json\s*\n?/i, '')
            .replace(/^```\s*\n?/, '')
            .replace(/\n?```\s*$/, '');
        }
      }

      // Final cleanup
      jsonStr = jsonStr.trim();

      // Attempt to parse
      return JSON.parse(jsonStr);

    } catch (error) {
      // Provide detailed error info for debugging
      console.error('[CoordinatorAgent] JSON Parse Error:', error.message);
      console.error('[CoordinatorAgent] Content sample:', content.substring(0, 500));

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
        totalFeatures: this.orchestration.features.length,
        totalTasks: this.orchestration.taskQueue.length,
        estimatedBudget: this.orchestration.projectPlan.estimatedBudget
      } : null,
      progress: {
        pending: this.orchestration.taskQueue.length,
        active: this.orchestration.activeTasks.size,
        completed: this.orchestration.completedTasks.length,
        failed: this.orchestration.failedTasks.length
      },
      features: Array.from(this.orchestration.featureCoordinators.entries()).map(([id, data]) => ({
        id,
        name: data.feature.name,
        totalTasks: data.plan.tasks.length,
        completedTasks: data.plan.tasks.filter(t => {
          // Need to match with prefixed ID since tasks in completedTasks have feature prefix
          const prefixedId = `${id}-${t.id}`;
          return this.orchestration.completedTasks.some(ct => ct.id === prefixedId);
        }).length
      }))
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
        features: this.orchestration.features,
        featureCoordinators: Array.from(this.orchestration.featureCoordinators.entries()).map(([id, data]) => ({
          featureId: id,
          feature: data.feature,
          plan: data.plan,
          coordinatorState: data.coordinator?.serialize() || null
        })),
        taskQueue: this.orchestration.taskQueue,
        completedTasks: this.orchestration.completedTasks,
        failedTasks: this.orchestration.failedTasks,
        fileAllocation: Array.from(this.orchestration.fileAllocation.entries())
      },
      recoveryCircuitBreaker: {
        attemptsByTask: Array.from(this.recoveryCircuitBreaker.attemptsByTask.entries())
      }
    };
  }

  /**
   * Restore coordinator state from checkpoint
   * @param {Object} state - Saved state from checkpoint
   */
  restore(state) {
    // Call parent restore for basic agent fields
    super.restore(state);

    // Restore orchestration state
    if (state.orchestration) {
      this.orchestration.projectPlan = state.orchestration.projectPlan || null;
      this.orchestration.features = state.orchestration.features || [];
      this.orchestration.taskQueue = state.orchestration.taskQueue || [];
      this.orchestration.completedTasks = state.orchestration.completedTasks || [];
      this.orchestration.failedTasks = state.orchestration.failedTasks || [];

      // Reconstruct fileAllocation Map
      if (state.orchestration.fileAllocation) {
        this.orchestration.fileAllocation = new Map(state.orchestration.fileAllocation);
      }

      // Restore feature coordinators (plans and features, not coordinator instances)
      // Coordinator instances will be recreated if needed
      if (state.orchestration.featureCoordinators) {
        this.orchestration.featureCoordinators.clear();

        for (const fcData of state.orchestration.featureCoordinators) {
          this.orchestration.featureCoordinators.set(fcData.featureId, {
            coordinator: null,  // Don't restore instances, will be recreated if needed
            plan: fcData.plan,
            feature: fcData.feature
          });
        }
      }

      console.log(`[${this.agentId}] Restored coordinator state:`);
      console.log(`  - Features: ${this.orchestration.features.length}`);
      console.log(`  - Feature coordinators: ${this.orchestration.featureCoordinators.size}`);
      console.log(`  - Pending tasks: ${this.orchestration.taskQueue.length}`);
      console.log(`  - Completed tasks: ${this.orchestration.completedTasks.length}`);
      console.log(`  - Failed tasks: ${this.orchestration.failedTasks.length}`);
    }

    // Restore circuit breaker state
    if (state.recoveryCircuitBreaker) {
      this.recoveryCircuitBreaker.attemptsByTask = new Map(
        state.recoveryCircuitBreaker.attemptsByTask || []
      );
    }

    this.emit('coordinatorRestored', {
      features: this.orchestration.features.length,
      pendingTasks: this.orchestration.taskQueue.length,
      completedTasks: this.orchestration.completedTasks.length,
      timestamp: Date.now()
    });
  }

  /**
   * Shutdown coordinator and all sub-agents
   * @returns {Promise<void>}
   */
  async shutdown() {
    console.log(`[${this.agentId}] Shutting down coordinator...`);

    // Shutdown all feature coordinators
    for (const [featureId, featureData] of this.orchestration.featureCoordinators) {
      if (featureData.coordinator) {
        try {
          await featureData.coordinator.shutdown();
        } catch (error) {
          console.error(`[${this.agentId}] Error shutting down feature coordinator ${featureId}:`, error.message);
        }
      }
    }

    // Shutdown all specialist agents
    for (const [agentType, agent] of this.orchestration.agents) {
      try {
        await agent.shutdown();
      } catch (error) {
        console.error(`[${this.agentId}] Error shutting down ${agentType} agent:`, error.message);
      }
    }

    // Clear all maps
    this.orchestration.featureCoordinators.clear();
    this.orchestration.agents.clear();
    this.orchestration.activeTasks.clear();

    // Call parent shutdown
    await super.shutdown();

    console.log(`[${this.agentId}] Coordinator shutdown complete`);
  }
}

module.exports = CoordinatorAgent;
