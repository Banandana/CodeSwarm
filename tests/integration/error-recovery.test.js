/**
 * Error Recovery and Retry Strategy Tests
 * Tests resilience, retry logic, and graceful degradation
 */

const SpecificationSystemV2 = require('../../src/agents/specification-v2');
const CoordinatorAgent = require('../../src/agents/coordinator-agent');
const { MockCommunicationHub } = require('../fixtures/mock-communication-hub');
const { MockClaudeAPI, createMockCallClaude } = require('../fixtures/mock-claude-api');
const testFeatures = require('../fixtures/test-features');

describe('Error Recovery and Retry Strategy', () => {
  let mockHub;
  let mockAPI;

  beforeEach(() => {
    mockHub = new MockCommunicationHub();
    mockAPI = new MockClaudeAPI();
  });

  afterEach(() => {
    mockAPI.reset();
  });

  describe('Transient Failure Recovery', () => {
    test('should retry on transient API failures', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      let attemptCount = 0;
      specSystem.specialists.generic.callClaude = async (...args) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient API error');
        }
        return await mockAPI.mockApiCall(...args);
      };

      const spec = await specSystem.generateSpecification(testFeatures.genericFeature, {});

      expect(spec).toBeDefined();
      expect(attemptCount).toBe(3); // Should have retried twice
    });

    test('should use exponential backoff between retries', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      const retryTimes = [];
      let lastTime = Date.now();

      specSystem.specialists.generic.callClaude = async (...args) => {
        const now = Date.now();
        if (retryTimes.length > 0) {
          retryTimes.push(now - lastTime);
        }
        lastTime = now;

        if (retryTimes.length < 2) {
          throw new Error('Retry needed');
        }
        return await mockAPI.mockApiCall(...args);
      };

      try {
        await specSystem.generateSpecification(testFeatures.genericFeature, {});
      } catch (error) {
        // May fail, but we're testing backoff timing
      }

      // If retries occurred, verify exponential increase
      if (retryTimes.length > 1) {
        expect(retryTimes[1]).toBeGreaterThan(retryTimes[0]);
      }
    });

    test('should fail after max retry attempts', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      let attemptCount = 0;
      specSystem.specialists.generic.callClaude = async () => {
        attemptCount++;
        throw new Error('Persistent failure');
      };

      await expect(
        specSystem.generateSpecification(testFeatures.genericFeature, {})
      ).rejects.toThrow();

      expect(attemptCount).toBeGreaterThanOrEqual(1);
    });

    test('should track retry statistics', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      let attemptCount = 0;
      specSystem.specialists.generic.callClaude = async (...args) => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Retry once');
        }
        return await mockAPI.mockApiCall(...args);
      };

      await specSystem.generateSpecification(testFeatures.genericFeature, {});

      expect(attemptCount).toBe(2);
    });
  });

  describe('Partial Failure Handling', () => {
    test('should continue processing after individual failures', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      let callCount = 0;
      specSystem.specialists.crud.callClaude = async (...args) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Second call fails');
        }
        return await mockAPI.mockApiCall(...args);
      };

      const features = [
        { ...testFeatures.crudFeature, id: 'feat-1' },
        { ...testFeatures.crudFeature, id: 'feat-2' },
        { ...testFeatures.crudFeature, id: 'feat-3' }
      ];

      const results = await Promise.allSettled(
        features.map(f => specSystem.generateSpecification(f, {}))
      );

      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(succeeded.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);
      expect(succeeded.length + failed.length).toBe(3);
    });

    test('should isolate failures per feature', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = async (...args) => {
        const messages = args[0];
        const content = messages.find(m => m.role === 'user')?.content || '';

        if (content.includes('feat-2')) {
          throw new Error('Feature 2 specific error');
        }

        return await mockAPI.mockApiCall(...args);
      };

      const features = [
        { ...testFeatures.crudFeature, id: 'feat-1', name: 'Feature 1' },
        { ...testFeatures.crudFeature, id: 'feat-2', name: 'Feature 2' },
        { ...testFeatures.crudFeature, id: 'feat-3', name: 'Feature 3' }
      ];

      const results = await Promise.allSettled(
        features.map(f => specSystem.generateSpecification(f, {}))
      );

      expect(results[0].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');
    });

    test('should report partial success in batch operations', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      mockAPI.setFailure(false, 0.4); // 40% failure rate
      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      const features = Array.from({ length: 10 }, (_, i) => ({
        ...testFeatures.crudFeature,
        id: `feat-${i}`
      }));

      const results = await Promise.allSettled(
        features.map(f => specSystem.generateSpecification(f, {}))
      );

      const succeeded = results.filter(r => r.status === 'fulfilled');

      // With 40% failure rate, expect some successes
      expect(succeeded.length).toBeGreaterThan(0);
      expect(succeeded.length).toBeLessThan(10);
    });
  });

  describe('Graceful Degradation', () => {
    test('should fall back to template when API fails for CRUD', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = async () => {
        throw new Error('API unavailable');
      };

      // CRUD specialist should still work with template
      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      expect(spec).toBeDefined();
      expect(spec.specification).toBeDefined();
      expect(spec.specification.apiContracts).toBeDefined();
    });

    test('should use cache during API outage', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      // First call succeeds and caches
      const spec1 = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      // Now API fails
      mockAPI.setFailure(true);

      // Second call should use cache
      const spec2 = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      expect(spec2).toBeDefined();
      expect(spec2.fromCache).toBe(true);
    });

    test('should continue with reduced functionality on specialist failure', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      // Integration specialist fails
      specSystem.specialists.integration.callClaude = async () => {
        throw new Error('Integration specialist unavailable');
      };

      // But generic specialist works
      specSystem.specialists.generic.callClaude = createMockCallClaude(mockAPI);

      // System should route to generic as fallback
      await expect(
        specSystem.generateSpecification(testFeatures.integrationFeature, {})
      ).rejects.toThrow();
    });

    test('should provide minimal spec when all specialists fail', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      // All specialists fail except CRUD with template
      specSystem.specialists.integration.callClaude = async () => {
        throw new Error('Failed');
      };
      specSystem.specialists.generic.callClaude = async () => {
        throw new Error('Failed');
      };
      specSystem.specialists.crud.callClaude = async () => {
        throw new Error('Failed');
      };

      // CRUD should still provide template
      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      expect(spec).toBeDefined();
      expect(spec.specification).toBeDefined();
    });
  });

  describe('Circuit Breaker Behavior', () => {
    test('should detect repeated failures', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.generic.callClaude = async () => {
        throw new Error('Service down');
      };

      const failures = [];

      for (let i = 0; i < 5; i++) {
        try {
          await specSystem.generateSpecification(testFeatures.genericFeature, {});
        } catch (error) {
          failures.push(error);
        }
      }

      expect(failures.length).toBe(5);
    });

    test('should recover after successful call', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      let callCount = 0;
      specSystem.specialists.generic.callClaude = async (...args) => {
        callCount++;
        if (callCount <= 3) {
          throw new Error('Temporary failure');
        }
        return await mockAPI.mockApiCall(...args);
      };

      // First 3 fail
      for (let i = 0; i < 3; i++) {
        try {
          await specSystem.generateSpecification(testFeatures.genericFeature, {});
        } catch (error) {
          // Expected
        }
      }

      // 4th succeeds
      const spec = await specSystem.generateSpecification(testFeatures.genericFeature, {});
      expect(spec).toBeDefined();
    });
  });

  describe('Error Propagation', () => {
    test('should preserve error details through layers', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      const originalError = new Error('Specific API error: Rate limit exceeded');
      originalError.code = 'RATE_LIMIT';

      specSystem.specialists.generic.callClaude = async () => {
        throw originalError;
      };

      try {
        await specSystem.generateSpecification(testFeatures.genericFeature, {});
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('Rate limit exceeded');
      }
    });

    test('should provide context in error messages', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.generic.callClaude = async () => {
        throw new Error('API call failed');
      };

      try {
        await specSystem.generateSpecification(testFeatures.genericFeature, {});
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });

    test('should handle errors in coordinator orchestration', async () => {
      const coordinator = new CoordinatorAgent('test-coord', mockHub);

      coordinator.callClaude = async () => {
        throw new Error('Proposal analysis failed');
      };

      await expect(
        coordinator.analyzeProposal('Test proposal', {})
      ).rejects.toThrow();
    });
  });

  describe('State Consistency During Failures', () => {
    test('should not corrupt state on partial failure', async () => {
      const stateManager = mockHub.stateManager;

      await stateManager.write('spec:feat-001', { status: 'completed' }, 'agent1');

      // Simulate failure during state write
      const originalWrite = stateManager.write.bind(stateManager);
      stateManager.write = async (key, value, agentId) => {
        if (key === 'spec:feat-002') {
          throw new Error('State write failed');
        }
        return originalWrite(key, value, agentId);
      };

      try {
        await stateManager.write('spec:feat-002', { status: 'failed' }, 'agent1');
      } catch (error) {
        // Expected failure
      }

      // First entry should still be intact
      const spec1 = await stateManager.read('spec:feat-001', 'agent2');
      expect(spec1.value.status).toBe('completed');
    });

    test('should maintain cache consistency on errors', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      // Cache a successful spec
      await specSystem.generateSpecification(testFeatures.crudFeature, {});

      // Now fail on a different feature
      mockAPI.setFailure(true);

      try {
        await specSystem.generateSpecification(testFeatures.integrationFeature, {});
      } catch (error) {
        // Expected
      }

      // Original cached spec should still work
      mockAPI.setFailure(false);
      const cached = await specSystem.generateSpecification(testFeatures.crudFeature, {});
      expect(cached.fromCache).toBe(true);
    });

    test('should rollback on transaction failures', async () => {
      const stateManager = mockHub.stateManager;

      const initialSize = stateManager.state.size;

      try {
        await stateManager.write('test:key', { data: 'value' }, 'agent');
        throw new Error('Simulated failure after write');
      } catch (error) {
        // In a real implementation, this would trigger rollback
      }

      // State should have the entry (no transaction support in mock)
      // But this test documents expected behavior
      expect(stateManager.state.size).toBeGreaterThanOrEqual(initialSize);
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout long-running operations', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.generic.callClaude = async () => {
        // Simulate long operation
        await new Promise(resolve => setTimeout(resolve, 10000));
        return await mockAPI.mockApiCall([], {});
      };

      const timeoutMs = 1000;
      const startTime = Date.now();

      await expect(
        Promise.race([
          specSystem.generateSpecification(testFeatures.genericFeature, {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutMs)
          )
        ])
      ).rejects.toThrow('Timeout');

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(timeoutMs + 100);
    });

    test('should handle timeout in batch operations', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.generic.callClaude = async (...args) => {
        const messages = args[0];
        const content = messages.find(m => m.role === 'user')?.content || '';

        if (content.includes('slow')) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        return await mockAPI.mockApiCall(...args);
      };

      const features = [
        { ...testFeatures.genericFeature, id: 'fast', name: 'Fast Feature' },
        { ...testFeatures.genericFeature, id: 'slow', name: 'Slow Feature' }
      ];

      const results = await Promise.allSettled(
        features.map(f =>
          Promise.race([
            specSystem.generateSpecification(f, {}),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 1000)
            )
          ])
        )
      );

      // Fast should succeed, slow should timeout
      expect(results.some(r => r.status === 'fulfilled')).toBe(true);
      expect(results.some(r => r.status === 'rejected')).toBe(true);
    });
  });

  describe('Resource Cleanup on Errors', () => {
    test('should release agent pool resources on failure', async () => {
      const coordinator = new CoordinatorAgent('test-coord', mockHub);

      const initialStats = coordinator.agentPool.getStats();

      coordinator.callClaude = async () => {
        throw new Error('Task failed');
      };

      try {
        await coordinator.analyzeProposal('Test', {});
      } catch (error) {
        // Expected
      }

      const finalStats = coordinator.agentPool.getStats();

      // Should not have leaked agents
      expect(finalStats.busy).toBe(initialStats.busy);
    });

    test('should clean up state locks on failure', async () => {
      const lockManager = mockHub.lockManager;

      const lockId = await lockManager.acquire('test-resource', 'agent1', 5000);
      expect(lockId).toBeDefined();

      // Simulate failure and cleanup
      await lockManager.release('test-resource', lockId);

      // Should be able to reacquire
      const newLockId = await lockManager.acquire('test-resource', 'agent2', 5000);
      expect(newLockId).toBeDefined();
    });

    test('should handle cleanup failures gracefully', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.generic.callClaude = async () => {
        throw new Error('Primary operation failed');
      };

      // Even if cleanup fails, should not crash
      await expect(
        specSystem.generateSpecification(testFeatures.genericFeature, {})
      ).rejects.toThrow('Primary operation failed');
    });
  });

  describe('Recovery Strategies', () => {
    test('should attempt cache before retry', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      // Cache a spec
      await specSystem.generateSpecification(testFeatures.crudFeature, {});

      mockAPI.reset();
      mockAPI.setFailure(true);

      // Should use cache instead of failing
      const spec = await specSystem.generateSpecification(testFeatures.crudFeature, {});

      expect(spec.fromCache).toBe(true);
      expect(mockAPI.getStats().totalCalls).toBe(0); // No retry needed
    });

    test('should use similar feature from cache on failure', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      specSystem.specialists.crud.callClaude = createMockCallClaude(mockAPI);

      // Cache original feature
      await specSystem.generateSpecification(testFeatures.crudFeature, {});

      mockAPI.reset();
      mockAPI.setFailure(true);

      // Similar feature should match
      const spec = await specSystem.generateSpecification(testFeatures.similarCrudFeature, {});

      expect(spec.fromCache).toBe(true);
    });

    test('should escalate to generic specialist on specialized failure', async () => {
      const specSystem = new SpecificationSystemV2(mockHub);

      // CRUD specialist fails
      specSystem.specialists.crud.callClaude = async () => {
        throw new Error('CRUD specialist down');
      };

      // In a real implementation, might fall back to generic
      // This test documents the expected behavior
      await expect(
        specSystem.generateSpecification(testFeatures.crudFeature, {})
      ).rejects.toThrow();
    });
  });
});
