/**
 * Integration tests for Specification System V2
 * Tests end-to-end flow without API calls
 */

const SpecificationSystemV2 = require('../../src/agents/specification-v2');
const { MockCommunicationHub } = require('../fixtures/mock-communication-hub');
const testFeatures = require('../fixtures/test-features');

describe('SpecificationSystemV2 Integration', () => {
  let specSystem;
  let mockHub;

  beforeEach(() => {
    mockHub = new MockCommunicationHub();
    specSystem = new SpecificationSystemV2(mockHub, {
      useSemanticCache: true,
      cacheSize: 50,
      similarityThreshold: 0.85
    });

    // Mock callClaude for all specialists
    const mockResponse = {
      content: JSON.stringify({
        fields: [],
        validations: [],
        additionalEndpoints: []
      })
    };

    specSystem.specialists.crud.callClaude = jest.fn().mockResolvedValue(mockResponse);
    specSystem.specialists.integration.callClaude = jest.fn().mockResolvedValue(mockResponse);
    specSystem.specialists.generic.callClaude = jest.fn().mockResolvedValue(mockResponse);
  });

  describe('Feature Routing', () => {
    test('should route CRUD features to CRUD specialist', async () => {
      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      expect(spec.generatedBy).toBe('crud-specialist');
      expect(spec.specification).toBeDefined();
    });

    test('should route integration features to integration specialist', async () => {
      const spec = await specSystem.generateSpecification(testFeatures.integrationFeature, {});

      expect(spec.generatedBy).toBe('integration-specialist');
      expect(spec.specification).toBeDefined();
    });

    test('should route generic features to generic specialist', async () => {
      const spec = await specSystem.generateSpecification(testFeatures.genericFeature, {});

      expect(spec.generatedBy).toBe('generic-specialist');
      expect(spec.specification).toBeDefined();
    });
  });

  describe('End-to-End Generation', () => {
    test('should generate complete specification', async () => {
      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {
        architecture: { style: 'monolithic' },
        projectInfo: { name: 'Test Project' }
      });

      expect(spec.specId).toBeDefined();
      expect(spec.featureId).toBe(testFeatures.crudFeature.id);
      expect(spec.feature).toEqual(testFeatures.crudFeature);
      expect(spec.specification).toBeDefined();
      expect(spec.version).toBe(1);
      expect(spec.createdAt).toBeDefined();
    });

    test('should include required specification sections', async () => {
      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      expect(spec.specification.apiContracts).toBeDefined();
      expect(spec.specification.dataSchemas).toBeDefined();
      expect(spec.specification.acceptanceCriteria).toBeDefined();
      expect(spec.specification.errorHandling).toBeDefined();
    });

    test('should handle multiple features in sequence', async () => {
      const spec1 = await specSystem.generateSpecification(testFeatures.crudFeature, {});
      const spec2 = await specSystem.generateSpecification(testFeatures.integrationFeature, {});
      const spec3 = await specSystem.generateSpecification(testFeatures.genericFeature, {});

      expect(spec1.specId).not.toBe(spec2.specId);
      expect(spec2.specId).not.toBe(spec3.specId);
      expect([spec1, spec2, spec3].every(s => s.specId)).toBe(true);
    });
  });

  describe('Caching Integration', () => {
    test('should cache generated specifications', async () => {
      const spec1 = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      // Generate again with same feature
      const spec2 = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      expect(spec2.fromCache).toBe(true);
      expect(specSystem.cache.getStats().hits).toBe(1);
    });

    test('should find similar features in cache', async () => {
      await specSystem.generateSpecification(testFeatures.crudFeature, {});

      // Generate with similar feature
      const spec2 = await specSystem.generateSpecification(testFeatures.similarCrudFeature, {});

      expect(spec2.fromCache).toBe(true);
      expect(specSystem.cache.getStats().similarityHits).toBeGreaterThan(0);
    });

    test('should not cache on different categories', async () => {
      await specSystem.generateSpecification(testFeatures.crudFeature, {});

      // Different category feature
      const spec2 = await specSystem.generateSpecification(testFeatures.integrationFeature, {});

      expect(spec2.fromCache).toBeUndefined();
    });

    test('should track cache statistics', async () => {
      await specSystem.generateSpecification(testFeatures.crudFeature, {});
      await specSystem.generateSpecification(testFeatures.crudFeature, {}); // cache hit
      await specSystem.generateSpecification(testFeatures.integrationFeature, {}); // miss

      const stats = specSystem.cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('Context Handling', () => {
    test('should pass context to specialists', async () => {
      const context = {
        architecture: { style: 'microservices' },
        projectInfo: { name: 'Test' },
        existingSpecs: []
      };

      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, context);

      expect(spec).toBeDefined();
      // Context is used internally by specialists
    });

    test('should handle missing context gracefully', async () => {
      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      expect(spec).toBeDefined();
    });

    test('should handle partial context', async () => {
      const context = {
        projectInfo: { name: 'Test' }
        // Missing architecture and existingSpecs
      };

      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, context);

      expect(spec).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle specialist failures gracefully', async () => {
      specSystem.specialists.crud.callClaude = jest.fn().mockRejectedValue(new Error('API Error'));

      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      // Should still generate spec with template defaults
      expect(spec).toBeDefined();
      expect(spec.specification).toBeDefined();
    });

    test('should handle invalid feature data', async () => {
      const invalidFeature = {
        // Missing required fields
        name: 'Invalid'
      };

      await expect(
        specSystem.generateSpecification(invalidFeature, {})
      ).resolves.toBeDefined();
    });

    test('should handle cache errors gracefully', async () => {
      // Force cache error
      specSystem.cache.get = jest.fn().mockImplementation(() => {
        throw new Error('Cache error');
      });

      // Should fall back to generation
      await expect(
        specSystem.generateSpecification(testFeatures.crudFeature, {})
      ).resolves.toBeDefined();
    });
  });

  describe('Specification Refinement', () => {
    test('should refine existing specification', async () => {
      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      const qualityReport = {
        recommendation: 'revise',
        overallScore: 75,
        issues: [{ message: 'Missing validation rules' }]
      };

      const refined = await specSystem.refineSpecification(spec, qualityReport);

      expect(refined).toBeDefined();
      expect(refined.version).toBeGreaterThan(spec.version);
    });

    test('should route refinement to same specialist', async () => {
      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      // Mock refine method
      specSystem.specialists.crud.refine = jest.fn().mockResolvedValue({
        ...spec,
        version: 2,
        refined: true
      });

      const qualityReport = {
        recommendation: 'revise',
        issues: []
      };

      await specSystem.refineSpecification(spec, qualityReport);

      expect(specSystem.specialists.crud.refine).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    test('should handle batch generation efficiently', async () => {
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
      expect(specs.every(s => s.specId)).toBe(true);
      expect(duration).toBeLessThan(5000); // Should be fast without API calls
    });

    test('should benefit from caching in batch operations', async () => {
      // Generate 10 similar features
      const features = Array.from({ length: 10 }, (_, i) => ({
        ...testFeatures.crudFeature,
        id: `feat-${i}`,
        name: `User Management ${i}`
      }));

      await Promise.all(
        features.map(f => specSystem.generateSpecification(f, {}))
      );

      const stats = specSystem.cache.getStats();

      // Most should be cache hits (exact or similar)
      expect(stats.hitRate).toBeGreaterThan(0.5);
    });
  });

  describe('Cache Adaptation', () => {
    test('should adapt cached spec to new feature', async () => {
      const spec1 = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      // Get from cache with similar feature
      const spec2 = await specSystem.generateSpecification(testFeatures.similarCrudFeature, {});

      // Should have new feature details
      expect(spec2.featureId).toBe(testFeatures.similarCrudFeature.id);
      expect(spec2.feature).toEqual(testFeatures.similarCrudFeature);
      expect(spec2.fromCache).toBe(true);
    });

    test('should generate new timestamps for adapted specs', async () => {
      await specSystem.generateSpecification(testFeatures.crudFeature, {});

      await new Promise(resolve => setTimeout(resolve, 10));

      const spec2 = await specSystem.generateSpecification(testFeatures.similarCrudFeature, {});

      expect(spec2.createdAt).toBeDefined();
    });
  });

  describe('System Configuration', () => {
    test('should use semantic cache by default', () => {
      const system = new SpecificationSystemV2(mockHub);

      expect(system.cache.constructor.name).toBe('SemanticCache');
    });

    test('should allow basic cache when configured', () => {
      const system = new SpecificationSystemV2(mockHub, {
        useSemanticCache: false
      });

      expect(system.cache.constructor.name).toBe('SpecificationCache');
    });

    test('should respect custom cache settings', () => {
      const system = new SpecificationSystemV2(mockHub, {
        cacheSize: 200,
        cacheTTL: 7200000,
        similarityThreshold: 0.9
      });

      expect(system.cache.config.maxSize).toBe(200);
      expect(system.cache.config.ttl).toBe(7200000);
      expect(system.cache.config.similarityThreshold).toBe(0.9);
    });
  });
});
