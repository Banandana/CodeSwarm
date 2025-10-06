/**
 * Claude API Client
 * Handles communication with Claude API with budget integration
 */

const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { APIError } = require('../utils/errors');
const Validator = require('../utils/validation');

class ClaudeClient {
  constructor(budgetManager, config = {}) {
    this.budgetManager = budgetManager;

    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.CLAUDE_API_KEY
    });

    this.config = {
      model: config.model || process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
      maxTokens: config.maxTokens || 4000,
      temperature: config.temperature || 0.7,
      timeout: config.timeout || 60000
    };

    // Cost tracking (approximate, adjust based on actual pricing)
    this.costs = {
      'claude-3-opus-20240229': { input: 0.000015, output: 0.000075 },
      'claude-3-sonnet-20240229': { input: 0.000003, output: 0.000015 },
      'claude-3-5-sonnet-20241022': { input: 0.000003, output: 0.000015 },
      'claude-3-haiku-20240307': { input: 0.00000025, output: 0.00000125 },
      'claude-sonnet-4-5': { input: 0.000003, output: 0.000015 },
      'claude-sonnet-4-5-20250929': { input: 0.000003, output: 0.000015 }
    };
  }

  /**
   * Send message with budget validation
   * @param {Array} messages - Array of message objects
   * @param {string} agentId - Agent making the request
   * @param {Object} options - Additional options
   * @returns {Promise<Object>}
   */
  async sendMessage(messages, agentId, options = {}) {
    // Validate inputs
    Validator.validateMessages(messages);
    Validator.validateAgentId(agentId);

    // Use provided operationId if available (already validated), otherwise create new one
    const operationId = options.operationId || uuidv4();
    const estimatedCost = this._estimateCost(messages, options);

    try {
      // Budget validation (skip if operationId was provided - already validated)
      if (!options.operationId) {
        await this.budgetManager.validateOperation(
          operationId,
          estimatedCost,
          agentId,
          options.priority || 'MEDIUM'
        );
      }

      const startTime = Date.now();

      // Prepare request
      const request = {
        model: options.model || this.config.model,
        max_tokens: options.maxTokens || this.config.maxTokens,
        messages: messages,
        temperature: options.temperature ?? this.config.temperature
      };

      // Add system prompt if provided
      if (options.systemPrompt) {
        request.system = options.systemPrompt;
      }

      // Make API call
      const response = await this.client.messages.create(request);

      // Calculate actual cost
      const actualCost = this._calculateActualCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
        request.model
      );

      const responseTime = Date.now() - startTime;

      // Record actual usage
      await this.budgetManager.recordUsage(operationId, actualCost);

      // Extract text content
      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      return {
        content,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          cost: actualCost,
          estimatedCost,
          variance: actualCost - estimatedCost
        },
        metadata: {
          operationId,
          agentId,
          responseTime,
          model: request.model,
          stopReason: response.stop_reason
        },
        raw: response
      };

    } catch (error) {
      // Log error for debugging
      console.error(`[ClaudeClient] Error in sendMessage:`, {
        operationId,
        agentId,
        error: error.message,
        status: error.status,
        stack: error.stack?.split('\n')[0]
      });

      // Clean up budget reservation on failure
      try {
        await this.budgetManager.recordUsage(operationId, 0);
      } catch (cleanupError) {
        console.error(`[ClaudeClient] Failed to clean up budget:`, cleanupError.message);
      }

      // Handle specific API errors
      if (error.status === 429) {
        throw new APIError('Rate limit exceeded', {
          operationId,
          agentId,
          retryAfter: error.headers?.['retry-after']
        });
      }

      if (error.status === 401) {
        throw new APIError('Invalid API key', {
          operationId,
          agentId
        });
      }

      throw new APIError(
        `Claude API request failed: ${error.message}`,
        {
          operationId,
          agentId,
          statusCode: error.status,
          originalError: error.message
        }
      );
    }
  }

  /**
   * Stream response (for long-running tasks)
   * @param {Array} messages
   * @param {string} agentId
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async streamMessage(messages, agentId, onChunk, options = {}) {
    // Use provided operationId if available (already validated), otherwise create new one
    const operationId = options.operationId || uuidv4();
    const estimatedCost = this._estimateCost(messages, options);

    try {
      // Budget validation (skip if operationId was provided - already validated)
      if (!options.operationId) {
        await this.budgetManager.validateOperation(
          operationId,
          estimatedCost,
          agentId,
          options.priority || 'MEDIUM'
        );
      }

      const startTime = Date.now();

      // Prepare request
      const request = {
        model: options.model || this.config.model,
        max_tokens: options.maxTokens || this.config.maxTokens,
        messages: messages,
        temperature: options.temperature ?? this.config.temperature,
        stream: true
      };

      if (options.systemPrompt) {
        request.system = options.systemPrompt;
      }

      // Stream response
      let fullContent = '';
      let inputTokens = 0;
      let outputTokens = 0;

      const stream = await this.client.messages.create(request);

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const text = event.delta.text || '';
          fullContent += text;
          onChunk(text);
        } else if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
        }
      }

      const actualCost = this._calculateActualCost(
        inputTokens,
        outputTokens,
        request.model
      );

      const responseTime = Date.now() - startTime;

      await this.budgetManager.recordUsage(operationId, actualCost);

      return {
        content: fullContent,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost: actualCost,
          estimatedCost,
          variance: actualCost - estimatedCost
        },
        metadata: {
          operationId,
          agentId,
          responseTime,
          model: request.model
        }
      };

    } catch (error) {
      try {
        await this.budgetManager.recordUsage(operationId, 0);
      } catch (cleanupError) {
        // Ignore
      }

      throw new APIError(
        `Claude API stream failed: ${error.message}`,
        { operationId, agentId, originalError: error.message }
      );
    }
  }

  /**
   * Estimate cost before making request
   * @private
   */
  _estimateCost(messages, options = {}) {
    const model = options.model || this.config.model;
    const costs = this.costs[model] || this.costs['claude-3-sonnet-20240229'];

    // Estimate input tokens (with 20% buffer as specified)
    const inputText = messages.map(m => m.content).join('\n');
    const inputTokens = Math.ceil((inputText.length / 4) * 1.2);

    // Estimate output tokens (use max as conservative estimate)
    const maxTokens = options.maxTokens || this.config.maxTokens;
    const outputTokens = maxTokens;

    return (inputTokens * costs.input) + (outputTokens * costs.output);
  }

  /**
   * Calculate actual cost from usage
   * @private
   */
  _calculateActualCost(inputTokens, outputTokens, model) {
    const costs = this.costs[model] || this.costs['claude-3-sonnet-20240229'];
    return (inputTokens * costs.input) + (outputTokens * costs.output);
  }

  /**
   * Health check
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const response = await this.sendMessage(
        [{ role: 'user', content: 'Reply with just "OK"' }],
        'health-check',
        { maxTokens: 10 }
      );

      return response.content.includes('OK');
    } catch (error) {
      return false;
    }
  }

  /**
   * Get model information
   * @returns {Object}
   */
  getModelInfo() {
    const model = this.config.model;
    const costs = this.costs[model];

    return {
      model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      costs: costs ? {
        inputPer1k: (costs.input * 1000).toFixed(4),
        outputPer1k: (costs.output * 1000).toFixed(4)
      } : null
    };
  }
}

module.exports = ClaudeClient;
