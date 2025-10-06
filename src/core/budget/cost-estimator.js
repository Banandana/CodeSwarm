/**
 * Cost Estimator for Claude API Operations
 * Estimates token usage and costs before execution
 */

class CostEstimator {
  constructor(config = {}) {
    // Cost per token (approximate, in USD)
    this.costs = {
      'claude-3-opus-20240229': {
        input: 0.000015,
        output: 0.000075
      },
      'claude-3-sonnet-20240229': {
        input: 0.000003,
        output: 0.000015
      },
      'claude-3-haiku-20240307': {
        input: 0.00000025,
        output: 0.00000125
      }
    };

    this.model = config.model || 'claude-3-sonnet-20240229';
    this.defaultMaxTokens = config.maxTokens || 4000;
  }

  /**
   * Estimate tokens from text
   * Rough approximation: ~4 characters per token
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    if (!text) return 0;

    // More accurate estimation considering:
    // - Average token length is ~4 characters
    // - Code tends to be slightly less dense than prose
    const baseEstimate = Math.ceil(text.length / 4);

    // Add 10% buffer for safety
    return Math.ceil(baseEstimate * 1.1);
  }

  /**
   * Estimate cost for a message
   * @param {Array} messages - Array of message objects
   * @param {Object} options
   * @returns {Object}
   */
  estimateMessageCost(messages, options = {}) {
    const maxTokens = options.maxTokens || this.defaultMaxTokens;

    // Calculate input tokens
    const inputText = messages.map(m => m.content || '').join('\n');
    const inputTokens = this.estimateTokens(inputText);

    // Estimate output tokens (use maxTokens as upper bound)
    // Typically actual output is ~60-70% of max, but we use full max for safety
    const outputTokens = maxTokens;

    const totalTokens = inputTokens + outputTokens;

    // Calculate costs
    const costs = this.costs[this.model];
    const inputCost = inputTokens * costs.input;
    const outputCost = outputTokens * costs.output;
    const totalCost = inputCost + outputCost;

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost,
      outputCost,
      totalCost,
      model: this.model
    };
  }

  /**
   * Estimate cost for task execution
   * @param {Object} task
   * @returns {number}
   */
  estimateTaskCost(task) {
    // Base cost factors
    const complexityMultipliers = {
      low: 1.0,
      medium: 1.5,
      high: 2.0,
      critical: 2.5
    };

    const taskTypeMultipliers = {
      'file-creation': 1.0,
      'file-modification': 0.7,
      'code-review': 0.5,
      'test-generation': 0.8,
      'documentation': 0.6,
      'architecture': 1.2,
      'debugging': 1.5
    };

    // Estimate base cost
    const baseMessages = this._generateBaseMessages(task);
    const baseCost = this.estimateMessageCost(baseMessages);

    // Apply multipliers
    const complexity = task.complexity || 'medium';
    const taskType = task.type || 'file-creation';

    const complexityMult = complexityMultipliers[complexity] || 1.0;
    const typeMult = taskTypeMultipliers[taskType] || 1.0;

    // Account for potential retries (average 1.2x for error correction)
    const retryMultiplier = 1.2;

    const estimatedCost = baseCost.totalCost * complexityMult * typeMult * retryMultiplier;

    return {
      baseCost: baseCost.totalCost,
      complexity,
      taskType,
      complexityMultiplier: complexityMult,
      typeMultiplier: typeMult,
      retryMultiplier,
      estimatedCost,
      breakdown: baseCost
    };
  }

  /**
   * Generate base messages for cost estimation
   * @private
   */
  _generateBaseMessages(task) {
    const systemPrompt = `You are a specialist agent working on: ${task.description}`;
    const userPrompt = this._buildUserPrompt(task);

    return [
      { role: 'user', content: systemPrompt + '\n\n' + userPrompt }
    ];
  }

  /**
   * Build user prompt based on task
   * @private
   */
  _buildUserPrompt(task) {
    let prompt = `Task: ${task.description}\n\n`;

    if (task.requirements) {
      prompt += `Requirements:\n${task.requirements}\n\n`;
    }

    if (task.context) {
      prompt += `Context:\n${JSON.stringify(task.context, null, 2)}\n\n`;
    }

    if (task.existingCode) {
      prompt += `Existing Code:\n${task.existingCode}\n\n`;
    }

    prompt += `Please implement the required functionality.`;

    return prompt;
  }

  /**
   * Estimate cost for project
   * @param {Array} tasks
   * @returns {Object}
   */
  estimateProjectCost(tasks) {
    const taskCosts = tasks.map(task => this.estimateTaskCost(task));

    const totalCost = taskCosts.reduce((sum, tc) => sum + tc.estimatedCost, 0);
    const breakdown = taskCosts.map((tc, i) => ({
      taskId: tasks[i].id,
      taskName: tasks[i].name,
      estimatedCost: tc.estimatedCost,
      complexity: tc.complexity
    }));

    return {
      totalTasks: tasks.length,
      totalEstimatedCost: totalCost,
      averageCostPerTask: totalCost / tasks.length,
      breakdown,
      confidence: '±20%' // Typical estimation variance
    };
  }

  /**
   * Update model and recalculate
   * @param {string} model
   */
  setModel(model) {
    if (!this.costs[model]) {
      throw new Error(`Unknown model: ${model}`);
    }
    this.model = model;
  }
}

module.exports = CostEstimator;
