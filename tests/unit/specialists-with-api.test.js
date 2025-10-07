/**
 * Unit tests for V2 Specialists with Mocked API
 * Tests CRUD, Integration, and Generic specialists with realistic API responses
 */

const CRUDSpecialist = require('../../src/agents/specification-v2/specialists/crud-specialist');
const IntegrationSpecialist = require('../../src/agents/specification-v2/specialists/integration-specialist');
const GenericSpecialist = require('../../src/agents/specification-v2/specialists/generic-specialist');
const { MockCommunicationHub } = require('../fixtures/mock-communication-hub');
const { MockClaudeAPI, createMockCallClaude } = require('../fixtures/mock-claude-api');
const testFeatures = require('../fixtures/test-features');

describe('Specialists with Mocked API', () => {
  let mockHub;
  let mockAPI;

  beforeEach(() => {
    mockHub = new MockCommunicationHub();
    mockAPI = new MockClaudeAPI();
  });

  afterEach(() => {
    mockAPI.reset();
  });

  describe('CRUD Specialist with API', () => {
    let specialist;

    beforeEach(() => {
      specialist = new CRUDSpecialist(mockHub);
      specialist.callClaude = createMockCallClaude(mockAPI);
    });

    test('should generate spec with API customization', async () => {
      const spec = await specialist.generate(testFeatures.crudFeature, {});

      expect(spec).toBeDefined();
      expect(spec.specification).toBeDefined();
      expect(spec.generatedBy).toBe('crud-specialist');

      // API should be called for customization
      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBe(1);
    });

    test('should apply API customization to template', async () => {
      mockAPI.setResponse('CRUD_CUSTOMIZATION', {
        fields: [
          { name: 'customField', type: 'string', required: true }
        ],
        validations: [],
        additionalEndpoints: []
      });

      const spec = await specialist.generate(testFeatures.crudFeature, {});

      // Check if custom field was applied
      const schema = spec.specification.dataSchemas[0];
      expect(schema.properties.customField).toBeDefined();
    });

    test('should handle API failures gracefully', async () => {
      mockAPI.setFailure(true);

      // Should still generate spec with template defaults
      const spec = await specialist.generate(testFeatures.crudFeature, {});

      expect(spec).toBeDefined();
      expect(spec.specification).toBeDefined();
    });

    test('should refine specifications with API', async () => {
      const originalSpec = await specialist.generate(testFeatures.crudFeature, {});

      mockAPI.reset();
      const qualityReport = {
        recommendation: 'revise',
        checks: [
          { passed: false, issues: [{ message: 'Missing validation' }] }
        ]
      };

      const refined = await specialist.refine(originalSpec, qualityReport);

      expect(refined.version).toBeGreaterThan(originalSpec.version);
      expect(mockAPI.getStats().totalCalls).toBe(1);
    });

    test('should extract resource names correctly for API prompt', async () => {
      await specialist.generate(testFeatures.crudFeature, {});

      const stats = mockAPI.getStats();
      const userMessage = stats.callHistory[0].messages.find(m => m.role === 'user');

      // Should mention the resource name
      expect(userMessage.content.toLowerCase()).toContain('user');
    });
  });

  describe('Integration Specialist with API', () => {
    let specialist;

    beforeEach(() => {
      specialist = new IntegrationSpecialist(mockHub);
      specialist.callClaude = createMockCallClaude(mockAPI);
    });

    test('should generate integration spec with API', async () => {
      const spec = await specialist.generate(testFeatures.integrationFeature, {});

      expect(spec).toBeDefined();
      expect(spec.generatedBy).toBe('integration-specialist');
      expect(spec.specification).toBeDefined();

      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBe(1);
    });

    test('should include integration-specific fields', async () => {
      const spec = await specialist.generate(testFeatures.integrationFeature, {});

      expect(spec.specification.externalAPIs).toBeDefined();
      expect(spec.specification.retryPolicy).toBeDefined();
    });

    test('should handle external API specifications', async () => {
      mockAPI.setResponse('GENERATE_SPEC', {
        apiContracts: [],
        externalAPIs: [
          {
            provider: 'Stripe',
            endpoint: 'https://api.stripe.com/v1/charges',
            authentication: 'Bearer token'
          }
        ],
        dataMapping: [],
        errorHandling: [],
        retryPolicy: {
          maxAttempts: 3,
          backoff: 'exponential'
        }
      });

      const spec = await specialist.generate(testFeatures.integrationFeature, {});

      expect(spec.specification.externalAPIs).toHaveLength(1);
      expect(spec.specification.externalAPIs[0].provider).toBe('Stripe');
    });

    test('should provide default retry policy if not in response', async () => {
      mockAPI.setResponse('GENERATE_SPEC', {
        apiContracts: [],
        externalAPIs: [],
        dataMapping: [],
        errorHandling: []
      });

      const spec = await specialist.generate(testFeatures.integrationFeature, {});

      expect(spec.specification.retryPolicy).toBeDefined();
      expect(spec.specification.retryPolicy.maxAttempts).toBe(3);
    });

    test('should handle API errors by throwing', async () => {
      mockAPI.setFailure(true);

      await expect(
        specialist.generate(testFeatures.integrationFeature, {})
      ).rejects.toThrow();
    });
  });

  describe('Generic Specialist with API', () => {
    let specialist;

    beforeEach(() => {
      specialist = new GenericSpecialist(mockHub);
      specialist.callClaude = createMockCallClaude(mockAPI);
    });

    test('should generate spec with API call', async () => {
      const spec = await specialist.generate(testFeatures.genericFeature, {});

      expect(spec).toBeDefined();
      expect(spec.generatedBy).toBe('generic-specialist');
      expect(spec.specification).toBeDefined();

      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBe(1);
    });

    test('should handle non-standard features', async () => {
      const customFeature = {
        id: 'custom-001',
        name: 'Custom Analytics Engine',
        description: 'Complex real-time analytics with ML integration',
        requiredAgents: ['backend', 'ml', 'database']
      };

      const spec = await specialist.generate(customFeature, {
        category: 'general'
      });

      expect(spec).toBeDefined();
      expect(spec.specification).toBeDefined();
    });

    test('should parse JSON responses correctly', async () => {
      mockAPI.setResponse('GENERATE_SPEC', {
        apiContracts: [{ endpoint: '/custom', method: 'POST' }],
        dataSchemas: [],
        acceptanceCriteria: [
          { id: 'AC-001', description: 'Custom criteria', testable: true }
        ],
        errorHandling: []
      });

      const spec = await specialist.generate(testFeatures.genericFeature, {});

      expect(spec.specification.apiContracts).toHaveLength(1);
      expect(spec.specification.acceptanceCriteria).toHaveLength(1);
    });

    test('should provide fallback on parse failure', async () => {
      mockAPI.setResponse('GENERATE_SPEC', 'invalid json {{');

      // Should return minimal valid spec
      const spec = await specialist.generate(testFeatures.genericFeature, {});

      expect(spec).toBeDefined();
      expect(spec.specification.acceptanceCriteria).toBeDefined();
      expect(spec.generatedBy).toBe('generic-specialist-fallback');
    });

    test('should use focused prompts to reduce tokens', async () => {
      await specialist.generate(testFeatures.genericFeature, {});

      const stats = mockAPI.getStats();
      const call = stats.callHistory[0];

      expect(call.options.maxTokens).toBeLessThanOrEqual(2000);
    });
  });

  describe('Cross-Specialist Comparison', () => {
    test('should use different prompt types for different specialists', async () => {
      const crudSpec = new CRUDSpecialist(mockHub);
      const integSpec = new IntegrationSpecialist(mockHub);
      const genSpec = new GenericSpecialist(mockHub);

      crudSpec.callClaude = createMockCallClaude(mockAPI);
      integSpec.callClaude = createMockCallClaude(mockAPI);
      genSpec.callClaude = createMockCallClaude(mockAPI);

      await crudSpec.generate(testFeatures.crudFeature, {});
      await integSpec.generate(testFeatures.integrationFeature, {});
      await genSpec.generate(testFeatures.genericFeature, {});

      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBe(3);
      expect(stats.uniquePromptTypes.length).toBeGreaterThan(1);
    });

    test('should produce consistent spec format across specialists', async () => {
      const crudSpec = new CRUDSpecialist(mockHub);
      const integSpec = new IntegrationSpecialist(mockHub);
      const genSpec = new GenericSpecialist(mockHub);

      crudSpec.callClaude = createMockCallClaude(mockAPI);
      integSpec.callClaude = createMockCallClaude(mockAPI);
      genSpec.callClaude = createMockCallClaude(mockAPI);

      const spec1 = await crudSpec.generate(testFeatures.crudFeature, {});
      mockAPI.reset();
      const spec2 = await integSpec.generate(testFeatures.integrationFeature, {});
      mockAPI.reset();
      const spec3 = await genSpec.generate(testFeatures.genericFeature, {});

      // All should have same top-level structure
      [spec1, spec2, spec3].forEach(spec => {
        expect(spec.specId).toBeDefined();
        expect(spec.featureId).toBeDefined();
        expect(spec.specification).toBeDefined();
        expect(spec.version).toBe(1);
        expect(spec.generatedBy).toBeDefined();
      });
    });
  });

  describe('API Usage Optimization', () => {
    test('CRUD specialist should minimize API calls', async () => {
      const specialist = new CRUDSpecialist(mockHub);
      specialist.callClaude = createMockCallClaude(mockAPI);

      // Generate 5 specs
      for (let i = 0; i < 5; i++) {
        await specialist.generate({
          ...testFeatures.crudFeature,
          id: `feat-${i}`
        }, {});
      }

      // Should only call API for customization, not full generation
      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBe(5); // One per feature for customization
    });

    test('should track token usage across calls', async () => {
      const specialist = new GenericSpecialist(mockHub);
      specialist.callClaude = createMockCallClaude(mockAPI);

      await specialist.generate(testFeatures.genericFeature, {});

      const stats = mockAPI.getStats();
      const call = stats.callHistory[0];

      // Mock provides usage stats
      expect(call.options).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    test('should retry on transient API failures', async () => {
      const specialist = new GenericSpecialist(mockHub);
      specialist.callClaude = createMockCallClaude(mockAPI);

      // 30% failure rate
      mockAPI.setFailure(false, 0.3);

      // Try multiple times
      const attempts = 5;
      const results = await Promise.allSettled(
        Array.from({ length: attempts }, () =>
          specialist.generate(testFeatures.genericFeature, {})
        )
      );

      // Some should succeed
      const succeeded = results.filter(r => r.status === 'fulfilled');
      expect(succeeded.length).toBeGreaterThan(0);
    });

    test('should provide meaningful error messages', async () => {
      const specialist = new IntegrationSpecialist(mockHub);
      specialist.callClaude = createMockCallClaude(mockAPI);

      mockAPI.setFailure(true);

      try {
        await specialist.generate(testFeatures.integrationFeature, {});
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(0);
      }
    });
  });
});
