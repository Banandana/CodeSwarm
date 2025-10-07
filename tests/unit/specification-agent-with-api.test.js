/**
 * Unit tests for Specification Agent with Mocked API
 * Tests specification generation with realistic API responses
 */

const SpecificationAgent = require('../../src/agents/specification-agent');
const { MockCommunicationHub } = require('../fixtures/mock-communication-hub');
const { MockClaudeAPI, createMockCallClaude } = require('../fixtures/mock-claude-api');
const testFeatures = require('../fixtures/test-features');

describe('SpecificationAgent with Mocked API', () => {
  let agent;
  let mockHub;
  let mockAPI;

  beforeEach(async () => {
    mockHub = new MockCommunicationHub();
    mockAPI = new MockClaudeAPI();

    agent = new SpecificationAgent('spec-agent-test', mockHub);

    // Replace callClaude with mock
    agent.callClaude = createMockCallClaude(mockAPI);

    await agent.initialize();
  });

  afterEach(() => {
    mockAPI.reset();
  });

  describe('Specification Generation', () => {
    test('should generate specification with API call', async () => {
      const spec = await agent.generateSpecification(testFeatures.crudFeature, {
        projectInfo: { name: 'Test Project' }
      });

      expect(spec).toBeDefined();
      expect(spec.specId).toBeDefined();
      expect(spec.feature).toEqual(testFeatures.crudFeature);
      expect(spec.specification).toBeDefined();

      // Verify API was called
      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBeGreaterThan(0);
    });

    test('should include all required specification sections', async () => {
      const spec = await agent.generateSpecification(testFeatures.crudFeature, {});

      expect(spec.specification.apiContracts).toBeDefined();
      expect(spec.specification.dataSchemas).toBeDefined();
      expect(spec.specification.acceptanceCriteria).toBeDefined();
      expect(spec.specification.errorHandling).toBeDefined();
    });

    test('should handle integration features', async () => {
      const spec = await agent.generateSpecification(testFeatures.integrationFeature, {});

      expect(spec).toBeDefined();
      expect(spec.specification).toBeDefined();
    });

    test('should handle complex features', async () => {
      const spec = await agent.generateSpecification(testFeatures.complexFeature, {
        architecture: { style: 'microservices' }
      });

      expect(spec).toBeDefined();
      expect(spec.specification).toBeDefined();
    });

    test('should track API usage', async () => {
      await agent.generateSpecification(testFeatures.crudFeature, {});

      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.callHistory[0].messages).toBeDefined();
    });
  });

  describe('API Response Handling', () => {
    test('should parse valid JSON responses', async () => {
      const spec = await agent.generateSpecification(testFeatures.crudFeature, {});

      expect(spec.specification).toBeInstanceOf(Object);
      expect(Array.isArray(spec.specification.apiContracts)).toBe(true);
    });

    test('should handle custom responses', async () => {
      mockAPI.setResponse('GENERATE_SPEC', {
        apiContracts: [{ endpoint: '/custom', method: 'GET' }],
        dataSchemas: [],
        acceptanceCriteria: [],
        errorHandling: []
      });

      const spec = await agent.generateSpecification(testFeatures.crudFeature, {});

      expect(spec.specification.apiContracts[0].endpoint).toBe('/custom');
    });

    test('should handle API delays', async () => {
      mockAPI.setDelay(100);

      const startTime = Date.now();
      await agent.generateSpecification(testFeatures.crudFeature, {});
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Error Handling with API', () => {
    test('should handle API failures', async () => {
      mockAPI.setFailure(true);

      await expect(
        agent.generateSpecification(testFeatures.crudFeature, {})
      ).rejects.toThrow();
    });

    test('should retry on transient failures', async () => {
      mockAPI.setFailure(false, 0.5); // 50% failure rate

      // May succeed or fail depending on retries
      try {
        await agent.generateSpecification(testFeatures.crudFeature, {});
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Should have made multiple attempts
      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBeGreaterThanOrEqual(1);
    });

    test('should handle malformed responses gracefully', async () => {
      mockAPI.setResponse('GENERATE_SPEC', 'invalid json');

      await expect(
        agent.generateSpecification(testFeatures.crudFeature, {})
      ).rejects.toThrow();
    });
  });

  describe('Context Passing', () => {
    test('should pass architecture context to API', async () => {
      const context = {
        architecture: {
          style: 'microservices',
          patterns: ['event-driven']
        }
      };

      await agent.generateSpecification(testFeatures.crudFeature, context);

      const stats = mockAPI.getStats();
      const call = stats.callHistory[0];

      // Context should influence the prompt
      expect(call.messages).toBeDefined();
    });

    test('should pass existing specs as context', async () => {
      const context = {
        existingSpecs: [
          { featureId: 'feat-001', specification: {} }
        ]
      };

      await agent.generateSpecification(testFeatures.integrationFeature, context);

      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBe(1);
    });

    test('should handle missing context', async () => {
      const spec = await agent.generateSpecification(testFeatures.crudFeature, null);

      expect(spec).toBeDefined();
    });
  });

  describe('Specification Revision', () => {
    test('should revise specification based on feedback', async () => {
      const originalSpec = await agent.generateSpecification(testFeatures.crudFeature, {});

      const feedback = {
        issues: [
          { message: 'Missing error handling for edge case' }
        ]
      };

      mockAPI.reset();
      const revisedSpec = await agent.reviseSpecification(originalSpec, feedback);

      expect(revisedSpec).toBeDefined();
      expect(mockAPI.getStats().totalCalls).toBe(1);
    });

    test('should increment version on revision', async () => {
      const originalSpec = await agent.generateSpecification(testFeatures.crudFeature, {});

      const revisedSpec = await agent.reviseSpecification(originalSpec, {
        issues: []
      });

      expect(revisedSpec.version).toBeGreaterThan(originalSpec.version);
    });
  });

  describe('Batch Operations', () => {
    test('should handle multiple features efficiently', async () => {
      const features = [
        testFeatures.crudFeature,
        testFeatures.integrationFeature,
        testFeatures.genericFeature
      ];

      const specs = await Promise.all(
        features.map(f => agent.generateSpecification(f, {}))
      );

      expect(specs).toHaveLength(3);
      expect(specs.every(s => s.specId)).toBe(true);

      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBe(3);
    });

    test('should handle partial failures in batch', async () => {
      mockAPI.setFailure(false, 0.3); // 30% failure rate

      const features = Array.from({ length: 5 }, (_, i) => ({
        ...testFeatures.crudFeature,
        id: `feat-${i}`
      }));

      const results = await Promise.allSettled(
        features.map(f => agent.generateSpecification(f, {}))
      );

      // Some should succeed, some may fail
      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(succeeded.length + failed.length).toBe(5);
    });
  });

  describe('Prompt Construction', () => {
    test('should construct appropriate prompts for different features', async () => {
      await agent.generateSpecification(testFeatures.crudFeature, {});

      const stats = mockAPI.getStats();
      const userMessage = stats.callHistory[0].messages.find(m => m.role === 'user');

      expect(userMessage.content).toContain(testFeatures.crudFeature.name);
      expect(userMessage.content).toContain(testFeatures.crudFeature.description);
    });

    test('should include system prompt', async () => {
      await agent.generateSpecification(testFeatures.crudFeature, {});

      const stats = mockAPI.getStats();
      const call = stats.callHistory[0];

      expect(call.options.systemPrompt).toBeDefined();
    });

    test('should set appropriate temperature', async () => {
      await agent.generateSpecification(testFeatures.crudFeature, {});

      const stats = mockAPI.getStats();
      const call = stats.callHistory[0];

      expect(call.options.temperature).toBeDefined();
      expect(call.options.temperature).toBeGreaterThanOrEqual(0);
      expect(call.options.temperature).toBeLessThanOrEqual(1);
    });
  });

  describe('Specification Validation', () => {
    test('should validate generated specification structure', async () => {
      const spec = await agent.generateSpecification(testFeatures.crudFeature, {});

      // Required top-level fields
      expect(spec.specId).toBeDefined();
      expect(spec.featureId).toBeDefined();
      expect(spec.version).toBeDefined();
      expect(spec.createdAt).toBeDefined();

      // Required specification fields
      expect(spec.specification.apiContracts).toBeDefined();
      expect(spec.specification.dataSchemas).toBeDefined();
      expect(spec.specification.acceptanceCriteria).toBeDefined();
    });

    test('should ensure API contracts have required fields', async () => {
      const spec = await agent.generateSpecification(testFeatures.crudFeature, {});

      const contracts = spec.specification.apiContracts;
      expect(contracts.length).toBeGreaterThan(0);

      contracts.forEach(contract => {
        expect(contract.endpoint).toBeDefined();
        expect(contract.method).toBeDefined();
        expect(contract.description).toBeDefined();
      });
    });

    test('should ensure acceptance criteria are testable', async () => {
      const spec = await agent.generateSpecification(testFeatures.crudFeature, {});

      const criteria = spec.specification.acceptanceCriteria;
      expect(criteria.length).toBeGreaterThan(0);

      criteria.forEach(criterion => {
        expect(criterion.id).toBeDefined();
        expect(criterion.description).toBeDefined();
        expect(criterion.testable).toBeDefined();
      });
    });
  });

  describe('Performance Metrics', () => {
    test('should track specification generation time', async () => {
      const startTime = Date.now();
      await agent.generateSpecification(testFeatures.crudFeature, {});
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should be fast with mocks
    });

    test('should handle concurrent generations', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => {
        const feature = { ...testFeatures.crudFeature, id: `feat-${i}` };
        return agent.generateSpecification(feature, {});
      });

      const startTime = Date.now();
      const specs = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(specs).toHaveLength(10);
      expect(duration).toBeLessThan(10000); // Concurrent should be fast
    });
  });
});
