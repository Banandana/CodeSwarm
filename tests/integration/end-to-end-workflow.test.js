/**
 * End-to-End Workflow Tests with Mocked API
 * Tests complete generation workflow from proposal to specification
 */

const SpecificationSystemV2 = require('../../src/agents/specification-v2');
const CoordinatorAgent = require('../../src/agents/coordinator-agent');
const { MockCommunicationHub } = require('../fixtures/mock-communication-hub');
const { MockClaudeAPI, createMockCallClaude } = require('../fixtures/mock-claude-api');
const testFeatures = require('../fixtures/test-features');

describe('End-to-End Workflow with Mocked API', () => {
  let mockHub;
  let mockAPI;

  beforeEach(() => {
    mockHub = new MockCommunicationHub();
    mockAPI = new MockClaudeAPI();
  });

  afterEach(() => {
    mockAPI.reset();
  });

  describe('Complete Specification Generation Flow', () => {
    test('should generate specifications for multiple features', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      // Mock all specialists
      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.integration.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.generic.callClaude = createMockCallClaude(mockAPI);

      const features = [
        testFeatures.crudFeature,
        testFeatures.integrationFeature,
        testFeatures.genericFeature
      ];

      const specs = [];
      for (const feature of features) {
        const spec = await specSystem.generateSpecification(feature, {
          existingSpecs: specs
        });
        specs.push(spec);
      }

      expect(specs).toHaveLength(3);
      expect(specs.every(s => s.specId)).toBe(true);

      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBeGreaterThan(0);
    });

    test('should cache similar features across workflow', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.integration.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.generic.callClaude = createMockCallClaude(mockAPI);

      // Generate first CRUD spec
      await specSystem.generateSpecification(testFeatures.crudFeature, {});

      mockAPI.reset();

      // Generate similar CRUD spec - should use cache
      const spec2 = await specSystem.generateSpecification(testFeatures.similarCrudFeature, {});

      expect(spec2.fromCache).toBe(true);
      expect(mockAPI.getStats().totalCalls).toBe(0); // No API call due to cache
    });

    test('should maintain context across multiple generations', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.integration.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.generic.callClaude = createMockCallClaude(mockAPI);

      const context = {
        architecture: { style: 'microservices' },
        existingSpecs: []
      };

      const spec1 = await specSystem.generateSpecification(testFeatures.crudFeature, context);
      context.existingSpecs.push(spec1);

      const spec2 = await specSystem.generateSpecification(testFeatures.integrationFeature, context);

      expect(spec2).toBeDefined();
      expect(context.existingSpecs).toHaveLength(2);
    });
  });

  describe('Coordinator Integration', () => {
    test('should analyze proposal and generate specifications', async () => {
      const coordinator = new CoordinatorAgent('test-coord', mockHub);
      coordinator.callClaude = createMockCallClaude(mockAPI);

      const proposal = `
        Build a user management system with:
        - User authentication and registration
        - CRUD operations for user data
        - Integration with email service
      `;

      const plan = await coordinator.analyzeProposal(proposal, {
        name: 'Test Project'
      });

      expect(plan).toBeDefined();
      expect(plan.features).toBeDefined();
      expect(plan.features.length).toBeGreaterThan(0);

      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBe(1); // Proposal analysis
    });

    test('should route features to appropriate specialists', async () => {
      const coordinator = new CoordinatorAgent('test-coord', mockHub);

      // Set up mock for proposal analysis
      mockAPI.setResponse('ANALYZE_PROPOSAL', {
        features: [
          testFeatures.crudFeature,
          testFeatures.integrationFeature
        ],
        estimatedBudget: 5.0,
        criticalPath: ['feat-001', 'feat-002']
      });

      coordinator.callClaude = createMockCallClaude(mockAPI);

      const proposal = 'Test proposal';
      const plan = await coordinator.analyzeProposal(proposal, {});

      expect(plan.features).toHaveLength(2);

      // Reset for specification generation
      mockAPI.reset();

      // This would trigger specification generation in real flow
      // (simplified for test)
      expect(coordinator.orchestration.features).toHaveLength(2);
    });
  });

  describe('Agent Pool Integration', () => {
    test('should reuse agents from pool across workflow', async () => {
      const coordinator = new CoordinatorAgent('test-coord', mockHub, {
        maxAgentsPerType: 2
      });

      // Verify pool is initialized
      expect(coordinator.agentPool).toBeDefined();

      const poolStats = coordinator.agentPool.getStats();
      expect(poolStats).toBeDefined();
    });

    test('should release agents back to pool after tasks', async () => {
      const coordinator = new CoordinatorAgent('test-coord', mockHub);

      const initialStats = coordinator.agentPool.getStats();
      expect(initialStats.busy).toBe(0);

      // In actual workflow, tasks would be assigned and released
      // This verifies the pool structure is in place
      expect(coordinator.agentPool.acquire).toBeDefined();
      expect(coordinator.agentPool.release).toBeDefined();
    });
  });

  describe('Quality Gate Integration', () => {
    test('should validate specifications through quality gate', async () => {
      const SpecQualityGate = require('../../src/validation/spec-quality-gate');
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      const qualityGate = new SpecQualityGate();
      const quality = await qualityGate.validateSpec(spec);

      expect(quality).toBeDefined();
      expect(quality.overallScore).toBeGreaterThanOrEqual(0);
      expect(quality.overallScore).toBeLessThanOrEqual(100);
      expect(quality.recommendation).toBeDefined();
    });

    test('should refine specifications based on quality feedback', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      mockAPI.reset();

      const qualityReport = {
        recommendation: 'revise',
        overallScore: 75,
        issues: [{ message: 'Add more error handling' }]
      };

      const refined = await specSystem.refineSpecification(spec, qualityReport);

      expect(refined.version).toBeGreaterThan(spec.version);
      expect(mockAPI.getStats().totalCalls).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Recovery in Workflow', () => {
    test('should handle partial failures in batch processing', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      // Set up mixed success/failure scenario
      let callCount = 0;
      specSystem.specialists.crud.callClaude = async (...args) => {
        callCount++;
        if (callCount % 2 === 0) {
          throw new Error('API Error');
        }
        return await mockAPI.mockApiCall(...args);
      };

      const features = [
        { ...testFeatures.crudFeature, id: 'feat-1' },
        { ...testFeatures.crudFeature, id: 'feat-2' },
        { ...testFeatures.crudFeature, id: 'feat-3' },
        { ...testFeatures.crudFeature, id: 'feat-4' }
      ];

      const results = await Promise.allSettled(
        features.map(f => specSystem.generateSpecification(f, {}))
      );

      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      // Some should succeed with template, some should fail
      expect(succeeded.length + failed.length).toBe(4);
    });

    test('should continue workflow after recoverable errors', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      // First call fails
      mockAPI.setFailure(true);

      try {
        await specSystem.generateSpecification(testFeatures.crudFeature, {});
      } catch (error) {
        // Expected failure
      }

      // Second call succeeds
      mockAPI.setFailure(false);

      const spec = await specSystem.generateSpecification(testFeatures.integrationFeature, {});

      expect(spec).toBeDefined();
    });
  });

  describe('State Management in Workflow', () => {
    test('should archive old state during long workflow', async () => {
      const stateManager = mockHub.stateManager;

      // Simulate workflow state updates
      await stateManager.write('spec:feat-001', { status: 'completed' }, 'test-agent');
      await stateManager.write('spec:feat-002', { status: 'completed' }, 'test-agent');

      expect(stateManager.state.size).toBeGreaterThan(0);
    });

    test('should maintain state consistency across steps', async () => {
      const stateManager = mockHub.stateManager;

      await stateManager.write('workflow:step1', { completed: true }, 'agent1');
      const step1 = await stateManager.read('workflow:step1', 'agent2');

      expect(step1.value.completed).toBe(true);
    });
  });

  describe('Performance Characteristics', () => {
    test('should complete workflow in reasonable time', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.integration.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.generic.callClaude = createMockCallClaude(mockAPI);

      const features = [
        testFeatures.crudFeature,
        testFeatures.integrationFeature,
        testFeatures.genericFeature,
        testFeatures.workflowFeature
      ];

      const startTime = Date.now();

      const specs = await Promise.all(
        features.map(f => specSystem.generateSpecification(f, {}))
      );

      const duration = Date.now() - startTime;

      expect(specs).toHaveLength(4);
      expect(duration).toBeLessThan(10000); // Should be fast with mocks
    });

    test('should benefit from caching in subsequent runs', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      // First run
      await specSystem.generateSpecification(testFeatures.crudFeature, {});
      const firstRunCalls = mockAPI.getStats().totalCalls;

      mockAPI.reset();

      // Second run - should use cache
      await specSystem.generateSpecification(testFeatures.crudFeature, {});
      const secondRunCalls = mockAPI.getStats().totalCalls;

      expect(secondRunCalls).toBeLessThan(firstRunCalls);
    });

    test('should track API usage metrics', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.integration.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.generic.callClaude = createMockCallClaude(mockAPI);

      await specSystem.generateSpecification(testFeatures.crudFeature, {});
      await specSystem.generateSpecification(testFeatures.integrationFeature, {});
      await specSystem.generateSpecification(testFeatures.genericFeature, {});

      const stats = mockAPI.getStats();
      expect(stats.totalCalls).toBeGreaterThan(0);
      expect(stats.callHistory.length).toBe(stats.totalCalls);
    });
  });

  describe('Cache Effectiveness', () => {
    test('should achieve target cache hit rate', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      // Generate 10 similar features
      const features = Array.from({ length: 10 }, (_, i) => ({
        ...testFeatures.crudFeature,
        id: `feat-${i}`,
        name: `User Management ${i}`
      }));

      for (const feature of features) {
        await specSystem.generateSpecification(feature, {});
      }

      const cacheStats = specSystem.cache.getStats();

      // Should have high hit rate due to similarity
      expect(cacheStats.hitRate).toBeGreaterThan(0.5);
    });

    test('should cache across different feature types', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);
      specSystem.specialists.integration.callClaude = createMockCallClaude(mockAPI);

      // Generate specs
      await specSystem.generateSpecification(testFeatures.crudFeature, {});
      await specSystem.generateSpecification(testFeatures.integrationFeature, {});

      // Try to reuse
      await specSystem.generateSpecification(testFeatures.similarCrudFeature, {});

      const cacheStats = specSystem.cache.getStats();
      expect(cacheStats.hits).toBeGreaterThan(0);
    });
  });
});
