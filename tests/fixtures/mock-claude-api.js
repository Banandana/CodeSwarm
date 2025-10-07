/**
 * Advanced Mock Claude API
 * Simulates realistic Claude API responses for comprehensive testing
 */

class MockClaudeAPI {
  constructor(options = {}) {
    this.callCount = 0;
    this.callHistory = [];
    this.shouldFail = options.shouldFail || false;
    this.failureRate = options.failureRate || 0;
    this.delay = options.delay || 0;
    this.responses = options.responses || {};
  }

  /**
   * Mock Claude API call
   */
  async mockApiCall(messages, options = {}) {
    this.callCount++;

    const call = {
      callNumber: this.callCount,
      messages,
      options,
      timestamp: Date.now()
    };
    this.callHistory.push(call);

    // Simulate delay
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    // Simulate random failures
    if (this.shouldFail || Math.random() < this.failureRate) {
      throw new Error('API Error: Rate limit exceeded');
    }

    // Extract prompt type from messages
    const userMessage = messages.find(m => m.role === 'user');
    const promptType = this.detectPromptType(userMessage?.content || '');

    // Return appropriate mock response
    return this.generateResponse(promptType, messages, options);
  }

  /**
   * Detect what kind of prompt this is
   */
  detectPromptType(content) {
    const lower = content.toLowerCase();

    if (lower.includes('analyze') && lower.includes('proposal')) {
      return 'ANALYZE_PROPOSAL';
    }
    if (lower.includes('specification') || lower.includes('spec')) {
      return 'GENERATE_SPEC';
    }
    if (lower.includes('plan') && lower.includes('feature')) {
      return 'PLAN_FEATURE';
    }
    if (lower.includes('implement') || lower.includes('code')) {
      return 'IMPLEMENT_TASK';
    }
    if (lower.includes('review')) {
      return 'REVIEW_CODE';
    }
    if (lower.includes('architecture')) {
      return 'DESIGN_ARCHITECTURE';
    }
    if (lower.includes('crud')) {
      return 'CRUD_CUSTOMIZATION';
    }

    return 'GENERIC';
  }

  /**
   * Generate appropriate mock response based on prompt type
   */
  generateResponse(promptType, messages, options) {
    // Use custom response if provided
    if (this.responses[promptType]) {
      return {
        content: JSON.stringify(this.responses[promptType]),
        usage: { input_tokens: 100, output_tokens: 50 }
      };
    }

    // Generate default responses
    switch (promptType) {
      case 'ANALYZE_PROPOSAL':
        return this.mockAnalyzeProposal();

      case 'GENERATE_SPEC':
        return this.mockGenerateSpecification();

      case 'PLAN_FEATURE':
        return this.mockPlanFeature();

      case 'IMPLEMENT_TASK':
        return this.mockImplementTask();

      case 'REVIEW_CODE':
        return this.mockReviewCode();

      case 'DESIGN_ARCHITECTURE':
        return this.mockDesignArchitecture();

      case 'CRUD_CUSTOMIZATION':
        return this.mockCRUDCustomization();

      default:
        return this.mockGenericResponse();
    }
  }

  /**
   * Mock proposal analysis response
   */
  mockAnalyzeProposal() {
    return {
      content: JSON.stringify({
        features: [
          {
            id: 'feat-001',
            name: 'User Authentication',
            description: 'Secure user login and registration system',
            requiredAgents: ['backend', 'database', 'frontend'],
            priority: 'high',
            dependencies: []
          },
          {
            id: 'feat-002',
            name: 'Data Management',
            description: 'CRUD operations for user data',
            requiredAgents: ['backend', 'database'],
            priority: 'high',
            dependencies: ['feat-001']
          }
        ],
        estimatedBudget: 5.0,
        criticalPath: ['feat-001', 'feat-002'],
        risks: ['Authentication complexity', 'Data security']
      }),
      usage: { input_tokens: 200, output_tokens: 150 }
    };
  }

  /**
   * Mock specification generation response
   */
  mockGenerateSpecification() {
    return {
      content: JSON.stringify({
        apiContracts: [
          {
            endpoint: '/api/users',
            method: 'GET',
            description: 'List all users',
            authentication: 'required',
            requestSchema: {
              type: 'object',
              properties: {
                page: { type: 'integer', default: 1 },
                limit: { type: 'integer', default: 20 }
              }
            },
            responseSchema: {
              success: {
                status: 200,
                body: {
                  type: 'object',
                  properties: {
                    data: { type: 'array' },
                    total: { type: 'integer' }
                  }
                }
              }
            }
          }
        ],
        dataSchemas: [
          {
            name: 'User',
            type: 'object',
            properties: {
              id: { type: 'string', required: true },
              email: { type: 'string', required: true },
              name: { type: 'string', required: true },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        ],
        acceptanceCriteria: [
          {
            id: 'AC-001',
            description: 'User can register with email and password',
            expectedBehavior: 'POST /api/register creates user account',
            verificationMethod: 'integration_test',
            testable: true
          }
        ],
        errorHandling: [
          {
            errorType: 'ValidationError',
            condition: 'Invalid email format',
            retry: false,
            userMessage: 'Please provide a valid email address'
          }
        ]
      }),
      usage: { input_tokens: 300, output_tokens: 400 }
    };
  }

  /**
   * Mock feature planning response
   */
  mockPlanFeature() {
    return {
      content: JSON.stringify({
        tasks: [
          {
            id: 'task-001',
            title: 'Create user model',
            agentType: 'database',
            dependencies: [],
            estimatedCost: 0.5
          },
          {
            id: 'task-002',
            title: 'Implement authentication endpoints',
            agentType: 'backend',
            dependencies: ['task-001'],
            estimatedCost: 1.0
          }
        ],
        totalCost: 1.5
      }),
      usage: { input_tokens: 150, output_tokens: 100 }
    };
  }

  /**
   * Mock code implementation response
   */
  mockImplementTask() {
    return {
      content: JSON.stringify({
        files: [
          {
            path: 'src/models/user.js',
            content: `class User {
  constructor(id, email, name) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.createdAt = new Date();
  }

  validate() {
    if (!this.email || !this.email.includes('@')) {
      throw new Error('Invalid email');
    }
    return true;
  }
}

module.exports = User;`,
            action: 'create'
          }
        ],
        tests: [
          {
            path: 'tests/models/user.test.js',
            content: `test('should create user with valid email', () => {
  const user = new User('1', 'test@example.com', 'Test User');
  expect(user.email).toBe('test@example.com');
});`
          }
        ]
      }),
      usage: { input_tokens: 250, output_tokens: 300 }
    };
  }

  /**
   * Mock code review response
   */
  mockReviewCode() {
    return {
      content: JSON.stringify({
        overallScore: 85,
        recommendation: 'accept',
        issues: [
          {
            severity: 'low',
            type: 'style',
            message: 'Consider adding JSDoc comments',
            file: 'src/models/user.js',
            line: 1
          }
        ],
        strengths: [
          'Clean class structure',
          'Good validation logic',
          'Follows naming conventions'
        ]
      }),
      usage: { input_tokens: 200, output_tokens: 120 }
    };
  }

  /**
   * Mock architecture design response
   */
  mockDesignArchitecture() {
    return {
      content: JSON.stringify({
        overview: {
          style: 'monolithic',
          keyDecisions: ['REST API', 'PostgreSQL database', 'JWT authentication'],
          rationale: 'Simple deployment for MVP'
        },
        components: [
          {
            id: 'api-server',
            type: 'service',
            responsibility: 'Handle HTTP requests',
            technology: 'Node.js + Express'
          },
          {
            id: 'database',
            type: 'database',
            responsibility: 'Data persistence',
            technology: 'PostgreSQL'
          }
        ],
        patterns: {
          architectural: ['monolithic', 'layered'],
          design: ['repository', 'service-layer'],
          integration: ['rest-api']
        }
      }),
      usage: { input_tokens: 180, output_tokens: 220 }
    };
  }

  /**
   * Mock CRUD customization response
   */
  mockCRUDCustomization() {
    return {
      content: JSON.stringify({
        fields: [
          {
            name: 'email',
            type: 'string',
            required: true,
            description: 'User email address'
          },
          {
            name: 'role',
            type: 'string',
            required: false,
            description: 'User role (admin, user)'
          }
        ],
        validations: [
          {
            field: 'email',
            rule: 'must be valid email format',
            message: 'Invalid email address'
          }
        ],
        additionalEndpoints: []
      }),
      usage: { input_tokens: 100, output_tokens: 80 }
    };
  }

  /**
   * Mock generic response
   */
  mockGenericResponse() {
    return {
      content: JSON.stringify({
        result: 'success',
        data: { message: 'Mock response generated' }
      }),
      usage: { input_tokens: 50, output_tokens: 30 }
    };
  }

  /**
   * Get call statistics
   */
  getStats() {
    return {
      totalCalls: this.callCount,
      callHistory: this.callHistory,
      uniquePromptTypes: [...new Set(this.callHistory.map(c =>
        this.detectPromptType(c.messages.find(m => m.role === 'user')?.content || '')
      ))]
    };
  }

  /**
   * Reset mock state
   */
  reset() {
    this.callCount = 0;
    this.callHistory = [];
  }

  /**
   * Set custom response for specific prompt type
   */
  setResponse(promptType, response) {
    this.responses[promptType] = response;
  }

  /**
   * Simulate API failure
   */
  setFailure(shouldFail, failureRate = 0) {
    this.shouldFail = shouldFail;
    this.failureRate = failureRate;
  }

  /**
   * Simulate API delay
   */
  setDelay(ms) {
    this.delay = ms;
  }
}

/**
 * Create a mock callClaude function
 */
function createMockCallClaude(apiMock) {
  return async function(messages, options = {}) {
    return await apiMock.mockApiCall(messages, options);
  };
}

module.exports = {
  MockClaudeAPI,
  createMockCallClaude
};
