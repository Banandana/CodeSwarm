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
      timeout: config.timeout || 600000  // 10 minutes for very complex responses
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
    console.log(`[ClaudeClient] sendMessage called:`, {
      agentId,
      messageCount: messages.length,
      hasSystemPrompt: !!options.systemPrompt,
      priority: options.priority || 'MEDIUM'
    });

    // Validate inputs
    Validator.validateMessages(messages);
    Validator.validateAgentId(agentId);

    // Always create new operationId for budget tracking
    const operationId = uuidv4();
    console.log(`[ClaudeClient] Operation ID generated:`, operationId);

    const estimatedCost = this._estimateCost(messages, options);
    console.log(`[ClaudeClient] Cost estimation calculated:`, {
      operationId,
      estimatedCost: estimatedCost.toFixed(6),
      model: options.model || this.config.model,
      messageLength: messages.map(m => m.content).join('\n').length
    });

    try {
      // Always validate budget for this specific operation
      console.log(`[ClaudeClient] Budget validation starting:`, {
        operationId,
        estimatedCost: estimatedCost.toFixed(4),
        agentId,
        model: options.model || this.config.model,
        priority: options.priority || 'MEDIUM'
      });

      await this.budgetManager.validateOperation(
        operationId,
        estimatedCost,
        agentId,
        options.priority || 'MEDIUM'
      );

      console.log(`[ClaudeClient] Budget validation passed:`, {
        operationId,
        agentId
      });

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

      console.log(`[ClaudeClient] API request prepared:`, {
        operationId,
        model: request.model,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        systemPromptLength: request.system ? request.system.length : 0,
        messageCount: messages.length
      });

      // Make API call with timeout protection (3 minutes for complex responses)
      const timeoutMs = this.config.timeout;
      console.log(`[ClaudeClient] Request timeout configured:`, {
        operationId,
        timeoutMs,
        timeoutSeconds: timeoutMs / 1000
      });

      const apiTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Claude API timeout after ${timeoutMs/1000}s`)), timeoutMs)
      );

      console.log(`[ClaudeClient] Starting API call:`, {
        operationId,
        timestamp: new Date().toISOString()
      });

      const response = await Promise.race([
        this.client.messages.create(request),
        apiTimeout
      ]);

      const duration = Date.now() - startTime;
      console.log(`[ClaudeClient] API call completed:`, {
        operationId,
        duration,
        durationSeconds: (duration / 1000).toFixed(2)
      });

      // Calculate actual cost
      const actualCost = this._calculateActualCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
        request.model
      );

      const variance = actualCost - estimatedCost;
      const variancePercent = estimatedCost > 0 ? ((variance / estimatedCost) * 100).toFixed(2) : 0;

      console.log(`[ClaudeClient] Response processing:`, {
        operationId,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        actualCost: actualCost.toFixed(6),
        estimatedCost: estimatedCost.toFixed(6),
        variance: variance.toFixed(6),
        variancePercent: `${variancePercent}%`,
        stopReason: response.stop_reason
      });

      const responseTime = Date.now() - startTime;

      // Record actual usage
      console.log(`[ClaudeClient] Recording usage:`, {
        operationId,
        actualCost: actualCost.toFixed(6)
      });

      await this.budgetManager.recordUsage(operationId, actualCost);

      console.log(`[ClaudeClient] Usage recorded successfully:`, {
        operationId
      });

      // Extract text content
      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      console.log(`[ClaudeClient] Request completed successfully:`, {
        operationId,
        agentId,
        totalDuration: responseTime,
        contentLength: content.length
      });

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
        errorType: error.constructor.name,
        stack: error.stack?.split('\n')[0]
      });

      // Clean up budget reservation on failure
      console.log(`[ClaudeClient] Attempting budget cleanup:`, {
        operationId
      });

      try {
        await this.budgetManager.releaseReservation(operationId);
        console.log(`[ClaudeClient] Budget reservation released:`, {
          operationId
        });
      } catch (cleanupError) {
        console.error(`[ClaudeClient] Failed to release reservation:`, {
          operationId,
          cleanupError: cleanupError.message
        });
      }

      // Handle specific API errors
      if (error.status === 429) {
        console.error(`[ClaudeClient] Rate limit exceeded:`, {
          operationId,
          agentId,
          retryAfter: error.headers?.['retry-after']
        });
        throw new APIError('Rate limit exceeded', {
          operationId,
          agentId,
          retryAfter: error.headers?.['retry-after']
        });
      }

      if (error.status === 401) {
        console.error(`[ClaudeClient] Invalid API key:`, {
          operationId,
          agentId
        });
        throw new APIError('Invalid API key', {
          operationId,
          agentId
        });
      }

      console.error(`[ClaudeClient] Throwing APIError:`, {
        operationId,
        agentId,
        statusCode: error.status
      });

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
    console.log(`[ClaudeClient] streamMessage called:`, {
      agentId,
      messageCount: messages.length,
      hasSystemPrompt: !!options.systemPrompt,
      priority: options.priority || 'MEDIUM'
    });

    // Always create new operationId for budget tracking
    const operationId = uuidv4();
    console.log(`[ClaudeClient] Stream operation ID generated:`, operationId);

    const estimatedCost = this._estimateCost(messages, options);
    console.log(`[ClaudeClient] Stream cost estimation:`, {
      operationId,
      estimatedCost: estimatedCost.toFixed(6),
      model: options.model || this.config.model
    });

    try {
      // Always validate budget for this specific operation
      console.log(`[ClaudeClient] Stream budget validation starting:`, {
        operationId,
        estimatedCost: estimatedCost.toFixed(4),
        agentId,
        priority: options.priority || 'MEDIUM'
      });

      await this.budgetManager.validateOperation(
        operationId,
        estimatedCost,
        agentId,
        options.priority || 'MEDIUM'
      );

      console.log(`[ClaudeClient] Stream budget validation passed:`, {
        operationId
      });

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

      console.log(`[ClaudeClient] Stream request prepared:`, {
        operationId,
        model: request.model,
        max_tokens: request.max_tokens,
        systemPromptLength: request.system ? request.system.length : 0
      });

      // Stream response
      let fullContent = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let chunkCount = 0;

      // Make API call with timeout protection (use configured timeout)
      const timeoutMs = this.config.timeout;
      console.log(`[ClaudeClient] Stream timeout configured:`, {
        operationId,
        timeoutMs,
        timeoutSeconds: timeoutMs / 1000
      });

      const apiTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Claude API stream timeout after ${timeoutMs/1000}s`)), timeoutMs)
      );

      console.log(`[ClaudeClient] Starting stream API call:`, {
        operationId,
        timestamp: new Date().toISOString()
      });

      const stream = await Promise.race([
        this.client.messages.create(request),
        apiTimeout
      ]);

      console.log(`[ClaudeClient] Stream established, processing events:`, {
        operationId
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const text = event.delta.text || '';
          fullContent += text;
          chunkCount++;
          onChunk(text);
        } else if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
          console.log(`[ClaudeClient] Stream message_start:`, {
            operationId,
            inputTokens
          });
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
          console.log(`[ClaudeClient] Stream message_delta:`, {
            operationId,
            outputTokens
          });
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ClaudeClient] Stream completed:`, {
        operationId,
        duration,
        durationSeconds: (duration / 1000).toFixed(2),
        chunkCount,
        contentLength: fullContent.length
      });

      const actualCost = this._calculateActualCost(
        inputTokens,
        outputTokens,
        request.model
      );

      const variance = actualCost - estimatedCost;
      const variancePercent = estimatedCost > 0 ? ((variance / estimatedCost) * 100).toFixed(2) : 0;

      console.log(`[ClaudeClient] Stream response processing:`, {
        operationId,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        actualCost: actualCost.toFixed(6),
        estimatedCost: estimatedCost.toFixed(6),
        variance: variance.toFixed(6),
        variancePercent: `${variancePercent}%`
      });

      const responseTime = Date.now() - startTime;

      console.log(`[ClaudeClient] Recording stream usage:`, {
        operationId,
        actualCost: actualCost.toFixed(6)
      });

      await this.budgetManager.recordUsage(operationId, actualCost);

      console.log(`[ClaudeClient] Stream usage recorded successfully:`, {
        operationId
      });

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
      console.error(`[ClaudeClient] Stream error:`, {
        operationId,
        agentId,
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack?.split('\n')[0]
      });

      // Clean up budget reservation on failure
      console.log(`[ClaudeClient] Attempting stream budget cleanup:`, {
        operationId
      });

      try {
        await this.budgetManager.releaseReservation(operationId);
        console.log(`[ClaudeClient] Stream budget reservation released:`, {
          operationId
        });
      } catch (cleanupError) {
        console.error(`[ClaudeClient] Failed to release stream reservation:`, {
          operationId,
          cleanupError: cleanupError.message
        });
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

    const estimatedCost = (inputTokens * costs.input) + (outputTokens * costs.output);

    console.log(`[ClaudeClient] _estimateCost:`, {
      model,
      inputTextLength: inputText.length,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      inputCostPer1k: (costs.input * 1000).toFixed(6),
      outputCostPer1k: (costs.output * 1000).toFixed(6),
      totalEstimatedCost: estimatedCost.toFixed(6)
    });

    return estimatedCost;
  }

  /**
   * Calculate actual cost from usage
   * @private
   */
  _calculateActualCost(inputTokens, outputTokens, model) {
    const costs = this.costs[model] || this.costs['claude-3-sonnet-20240229'];
    const actualCost = (inputTokens * costs.input) + (outputTokens * costs.output);

    console.log(`[ClaudeClient] _calculateActualCost:`, {
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost: (inputTokens * costs.input).toFixed(6),
      outputCost: (outputTokens * costs.output).toFixed(6),
      actualCost: actualCost.toFixed(6)
    });

    return actualCost;
  }

  /**
   * Health check
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    console.log(`[ClaudeClient] Health check starting...`);
    const startTime = Date.now();

    try {
      const response = await this.sendMessage(
        [{ role: 'user', content: 'Reply with just "OK"' }],
        'health-check',
        { maxTokens: 10 }
      );

      const duration = Date.now() - startTime;
      const isHealthy = response.content.includes('OK');

      console.log(`[ClaudeClient] Health check completed:`, {
        duration,
        isHealthy,
        responseContent: response.content.substring(0, 50)
      });

      return isHealthy;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[ClaudeClient] Health check failed:`, {
        duration,
        error: error.message,
        errorType: error.constructor.name
      });
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
