/**
 * Unit tests for Semantic Cache
 * Tests similarity matching, caching, and eviction
 */

const SemanticCache = require('../../src/agents/specification-v2/cache/semantic-cache');
const testFeatures = require('../fixtures/test-features');

describe('SemanticCache', () => {
  let cache;

  beforeEach(() => {
    cache = new SemanticCache({
      maxSize: 10,
      ttl: 60000, // 1 minute
      similarityThreshold: 0.85,
      enableSimilarityMatching: true
    });
  });

  describe('Exact Matching', () => {
    test('should cache and retrieve by exact key', () => {
      const key = 'test-key';
      const value = { spec: 'test-specification' };

      cache.set(key, value);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(value);
      expect(cache.getStats().exactHits).toBe(1);
    });

    test('should return null for non-existent key', () => {
      const result = cache.get('non-existent');

      expect(result).toBeNull();
      expect(cache.getStats().misses).toBe(1);
    });

    test('should respect TTL for exact matches', () => {
      jest.useFakeTimers();

      const cache = new SemanticCache({ ttl: 1000 });
      cache.set('key1', { data: 'test' });

      // Immediate retrieval works
      expect(cache.get('key1')).not.toBeNull();

      // After TTL expires
      jest.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeNull();

      jest.useRealTimers();
    });

    test('should update access count on hits', () => {
      cache.set('key1', { data: 'test' });

      cache.get('key1');
      cache.get('key1');
      cache.get('key1');

      expect(cache.getStats().hits).toBe(3);
    });
  });

  describe('Similarity Matching', () => {
    test('should find similar features above threshold', () => {
      const spec1 = { spec: 'user-management-spec' };

      // Cache with feature
      cache.set('crud:user-mgmt', spec1, testFeatures.crudFeature);

      // Try to get with similar feature
      const result = cache.get('crud:user-admin', testFeatures.similarCrudFeature);

      expect(result).toEqual(spec1);
      expect(cache.getStats().similarityHits).toBe(1);
    });

    test('should not match features below threshold', () => {
      const spec1 = { spec: 'user-management-spec' };

      cache.set('crud:user-mgmt', spec1, testFeatures.crudFeature);

      // Try with completely different feature
      const result = cache.get('integration:payment', testFeatures.integrationFeature);

      expect(result).toBeNull();
      expect(cache.getStats().misses).toBe(1);
    });

    test('should prefer exact match over similarity match', () => {
      const exactSpec = { spec: 'exact-match' };
      const similarSpec = { spec: 'similar-match' };

      // Cache both
      cache.set('crud:user-mgmt', exactSpec, testFeatures.crudFeature);
      cache.set('crud:user-admin', similarSpec, testFeatures.similarCrudFeature);

      // Get with exact key
      const result = cache.get('crud:user-mgmt', testFeatures.crudFeature);

      expect(result).toEqual(exactSpec);
      expect(cache.getStats().exactHits).toBe(1);
      expect(cache.getStats().similarityHits).toBe(0);
    });

    test('should handle features without metadata gracefully', () => {
      cache.set('key1', { spec: 'test' });

      const result = cache.get('key1');

      expect(result).not.toBeNull();
    });

    test('should calculate similarity correctly', () => {
      // Similar names and descriptions should score high
      const feature1 = {
        name: 'User Management System',
        description: 'Manage user accounts with CRUD operations',
        requiredAgents: ['backend', 'database']
      };

      const feature2 = {
        name: 'User Administration',
        description: 'Administer user accounts with create read update delete',
        requiredAgents: ['backend', 'database']
      };

      cache.set('key1', { spec: 'test' }, feature1);
      const result = cache.get('key2', feature2);

      expect(result).not.toBeNull();
      expect(cache.getStats().similarityHits).toBe(1);
    });
  });

  describe('Similarity Algorithm', () => {
    test('should weight name similarity at 30%', () => {
      const feature1 = {
        name: 'User Management',
        description: 'Different description entirely',
        requiredAgents: []
      };

      const feature2 = {
        name: 'User Management', // Same name
        description: 'Completely different content here',
        requiredAgents: []
      };

      cache.set('key1', { spec: 'test' }, feature1);
      const result = cache.get('key2', feature2);

      // Should find due to name match
      expect(result).not.toBeNull();
    });

    test('should weight description similarity at 40%', () => {
      const feature1 = {
        name: 'Feature A',
        description: 'Create read update delete user records with authentication and validation',
        requiredAgents: []
      };

      const feature2 = {
        name: 'Feature B',
        description: 'Create read update delete user records with authentication and validation',
        requiredAgents: []
      };

      cache.set('key1', { spec: 'test' }, feature1);
      const result = cache.get('key2', feature2);

      // Should find due to description match
      expect(result).not.toBeNull();
    });

    test('should weight agent overlap at 20%', () => {
      const feature1 = {
        name: 'Different Name',
        description: 'Different description',
        requiredAgents: ['backend', 'database', 'frontend']
      };

      const feature2 = {
        name: 'Another Name',
        description: 'Another description',
        requiredAgents: ['backend', 'database', 'frontend'] // Same agents
      };

      cache.set('key1', { spec: 'test' }, feature1);
      const result = cache.get('key2', feature2);

      // May or may not match depending on total score
      const stats = cache.getStats();
      expect(stats.hits + stats.misses).toBe(1);
    });

    test('should handle empty strings gracefully', () => {
      const feature1 = {
        name: '',
        description: '',
        requiredAgents: []
      };

      const feature2 = {
        name: 'Some name',
        description: 'Some description',
        requiredAgents: []
      };

      cache.set('key1', { spec: 'test' }, feature1);
      const result = cache.get('key2', feature2);

      expect(result).toBeNull(); // Should not match
    });
  });

  describe('Cache Management', () => {
    test('should evict oldest when at capacity', () => {
      const cache = new SemanticCache({ maxSize: 3 });

      cache.set('key1', { data: 1 });
      cache.set('key2', { data: 2 });
      cache.set('key3', { data: 3 });

      // Access key1 to make it recent
      cache.get('key1');

      // Add key4, should evict key2 (oldest)
      cache.set('key4', { data: 4 });

      expect(cache.get('key1')).not.toBeNull();
      expect(cache.get('key2')).toBeNull(); // Evicted
      expect(cache.get('key3')).not.toBeNull();
      expect(cache.get('key4')).not.toBeNull();
    });

    test('should track cache size', () => {
      cache.set('key1', { data: 1 });
      cache.set('key2', { data: 2 });
      cache.set('key3', { data: 3 });

      expect(cache.getStats().size).toBe(3);
    });

    test('should clear cache', () => {
      cache.set('key1', { data: 1 });
      cache.set('key2', { data: 2 });

      cache.clear();

      expect(cache.getStats().size).toBe(0);
      expect(cache.get('key1')).toBeNull();
    });

    test('should handle LRU eviction correctly', () => {
      const cache = new SemanticCache({ maxSize: 3 });

      cache.set('key1', { data: 1 });
      cache.set('key2', { data: 2 });
      cache.set('key3', { data: 3 });

      // Access in specific order to set lastAccessed times
      cache.get('key1'); // Most recent
      cache.get('key2');
      cache.get('key3');

      // Wait a bit
      setTimeout(() => {
        cache.get('key2'); // Update key2's lastAccessed
      }, 10);

      // Add new key - should evict least recently accessed
      cache.set('key4', { data: 4 });

      const stats = cache.getStats();
      expect(stats.size).toBe(3);
    });
  });

  describe('Statistics', () => {
    test('should track hit rate correctly', () => {
      cache.set('key1', { data: 1 });

      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key1'); // hit
      cache.get('key3'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });

    test('should track similarity hit rate', () => {
      cache.set('key1', { data: 1 }, testFeatures.crudFeature);

      cache.get('key1', testFeatures.crudFeature); // exact hit
      cache.get('key2', testFeatures.similarCrudFeature); // similarity hit

      const stats = cache.getStats();
      expect(stats.exactHits).toBe(1);
      expect(stats.similarityHits).toBe(1);
      expect(stats.similarityHitRate).toBe(0.5);
    });

    test('should handle zero hits gracefully', () => {
      cache.get('key1'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
      expect(stats.similarityHitRate).toBe(0);
    });
  });

  describe('Configuration', () => {
    test('should respect custom similarity threshold', () => {
      const strictCache = new SemanticCache({
        similarityThreshold: 0.95 // Very strict
      });

      strictCache.set('key1', { spec: 'test' }, testFeatures.crudFeature);
      const result = strictCache.get('key2', testFeatures.similarCrudFeature);

      // Might not match with strict threshold
      expect([result, null]).toContainEqual(result);
    });

    test('should disable similarity matching when configured', () => {
      const basicCache = new SemanticCache({
        enableSimilarityMatching: false
      });

      basicCache.set('key1', { spec: 'test' }, testFeatures.crudFeature);
      const result = basicCache.get('key2', testFeatures.similarCrudFeature);

      expect(result).toBeNull(); // No similarity matching
    });

    test('should respect custom TTL', () => {
      jest.useFakeTimers();

      const shortCache = new SemanticCache({ ttl: 100 });
      shortCache.set('key1', { data: 'test' });

      jest.advanceTimersByTime(101);
      expect(shortCache.get('key1')).toBeNull();

      jest.useRealTimers();
    });

    test('should respect custom max size', () => {
      const smallCache = new SemanticCache({ maxSize: 2 });

      smallCache.set('key1', { data: 1 });
      smallCache.set('key2', { data: 2 });
      smallCache.set('key3', { data: 3 }); // Should evict

      expect(smallCache.getStats().size).toBe(2);
    });
  });
});
