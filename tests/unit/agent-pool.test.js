/**
 * Unit tests for Agent Pool Management
 * Tests agent reuse, pooling, eviction, and metrics
 */

const AgentPool = require('../../src/core/agent-pool');

// Mock agent class
class MockAgent {
  constructor(type, id) {
    this.agentType = type;
    this.agentId = id || `${type}-${Date.now()}-${Math.random()}`;
    this.initialized = true;
  }
}

describe('AgentPool', () => {
  let pool;

  beforeEach(() => {
    pool = new AgentPool({
      maxPerType: 3,
      idleTimeout: 1000, // 1 second for testing
      enableMetrics: true
    });
  });

  afterEach(async () => {
    await pool.destroy();
  });

  describe('Agent Acquisition', () => {
    test('should create new agent when pool is empty', async () => {
      const agent = await pool.acquire('backend', () => new MockAgent('backend'));

      expect(agent).toBeDefined();
      expect(agent.agentType).toBe('backend');
      expect(pool.getStats().metrics.created).toBe(1);
      expect(pool.getStats().metrics.reused).toBe(0);
    });

    test('should reuse agent from pool', async () => {
      // Create and release an agent
      const agent1 = await pool.acquire('backend', () => new MockAgent('backend'));
      pool.release(agent1);

      // Acquire again - should reuse
      const agent2 = await pool.acquire('backend', () => new MockAgent('backend'));

      expect(agent2.agentId).toBe(agent1.agentId);
      expect(pool.getStats().metrics.created).toBe(1);
      expect(pool.getStats().metrics.reused).toBe(1);
    });

    test('should create multiple agents up to maxPerType', async () => {
      const createFn = () => new MockAgent('backend');

      const agent1 = await pool.acquire('backend', createFn);
      const agent2 = await pool.acquire('backend', createFn);
      const agent3 = await pool.acquire('backend', createFn);

      expect(pool.getStats().pools.backend.busy).toBe(3);
      expect(pool.getStats().metrics.created).toBe(3);
    });

    test('should wait when pool limit reached', async () => {
      jest.setTimeout(10000);

      const createFn = () => new MockAgent('backend');

      // Acquire max agents
      const agent1 = await pool.acquire('backend', createFn);
      const agent2 = await pool.acquire('backend', createFn);
      const agent3 = await pool.acquire('backend', createFn);

      // Start acquiring 4th agent (will wait)
      const acquirePromise = pool.acquire('backend', createFn);

      // Release one agent after short delay
      setTimeout(() => pool.release(agent1), 200);

      // Should acquire the released agent
      const agent4 = await acquirePromise;
      expect(agent4.agentId).toBe(agent1.agentId);
      expect(pool.getStats().metrics.reused).toBe(1);
    });

    test('should handle multiple agent types independently', async () => {
      const backend = await pool.acquire('backend', () => new MockAgent('backend'));
      const frontend = await pool.acquire('frontend', () => new MockAgent('frontend'));
      const database = await pool.acquire('database', () => new MockAgent('database'));

      expect(pool.getStats().pools.backend).toBeDefined();
      expect(pool.getStats().pools.frontend).toBeDefined();
      expect(pool.getStats().pools.database).toBeDefined();
      expect(pool.getStats().metrics.created).toBe(3);
    });
  });

  describe('Agent Release', () => {
    test('should return agent to pool on release', async () => {
      const agent = await pool.acquire('backend', () => new MockAgent('backend'));
      expect(pool.getStats().pools.backend.available).toBe(0);

      pool.release(agent);

      expect(pool.getStats().pools.backend.available).toBe(1);
      expect(pool.getStats().metrics.released).toBe(1);
    });

    test('should destroy agent on release with destroy flag', async () => {
      const agent = await pool.acquire('backend', () => new MockAgent('backend'));
      const initialCreated = pool.getStats().pools.backend.created;

      pool.release(agent, { destroy: true });

      expect(pool.getStats().pools.backend.available).toBe(0);
      expect(pool.getStats().pools.backend.created).toBe(initialCreated - 1);
    });

    test('should destroy agent on release with error', async () => {
      const agent = await pool.acquire('backend', () => new MockAgent('backend'));

      pool.release(agent, { error: 'Test error' });

      expect(pool.getStats().pools.backend.available).toBe(0);
    });

    test('should handle releasing unknown agent gracefully', () => {
      const unknownAgent = new MockAgent('backend', 'unknown-id');

      expect(() => pool.release(unknownAgent)).not.toThrow();
    });
  });

  describe('Idle Agent Eviction', () => {
    test('should evict idle agents after timeout', async () => {
      jest.setTimeout(5000);

      const agent = await pool.acquire('backend', () => new MockAgent('backend'));
      pool.release(agent);

      expect(pool.getStats().pools.backend.available).toBe(1);

      // Wait for idle timeout + cleanup interval
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(pool.getStats().metrics.evicted).toBeGreaterThan(0);
    });

    test('should not evict recently used agents', async () => {
      const agent = await pool.acquire('backend', () => new MockAgent('backend'));
      pool.release(agent);

      // Immediately check - should not be evicted
      expect(pool.getStats().pools.backend.available).toBe(1);
      expect(pool.getStats().metrics.evicted).toBe(0);
    });
  });

  describe('Pool Statistics', () => {
    test('should track acquisition metrics', async () => {
      const agent1 = await pool.acquire('backend', () => new MockAgent('backend'));
      pool.release(agent1);

      const agent2 = await pool.acquire('backend', () => new MockAgent('backend'));

      const stats = pool.getStats();
      expect(stats.metrics.acquired).toBe(2);
      expect(stats.metrics.created).toBe(1);
      expect(stats.metrics.reused).toBe(1);
    });

    test('should calculate efficiency correctly', async () => {
      const agent = await pool.acquire('backend', () => new MockAgent('backend'));
      pool.release(agent);

      await pool.acquire('backend', () => new MockAgent('backend'));
      await pool.acquire('backend', () => new MockAgent('backend'));

      const stats = pool.getStats();
      // 3 acquired: 1 created, 2 reused = 66.7% efficiency
      expect(stats.efficiency).toBeCloseTo(66.7, 1);
    });

    test('should track pool sizes per type', async () => {
      const backend1 = await pool.acquire('backend', () => new MockAgent('backend'));
      const backend2 = await pool.acquire('backend', () => new MockAgent('backend'));
      pool.release(backend1);

      const frontend1 = await pool.acquire('frontend', () => new MockAgent('frontend'));

      const stats = pool.getStats();
      expect(stats.pools.backend.available).toBe(1);
      expect(stats.pools.backend.busy).toBe(1);
      expect(stats.pools.backend.created).toBe(2);
      expect(stats.pools.frontend.available).toBe(0);
      expect(stats.pools.frontend.busy).toBe(1);
    });
  });

  describe('Event Emissions', () => {
    test('should emit agentCreated event', async () => {
      const eventPromise = new Promise(resolve => {
        pool.once('agentCreated', resolve);
      });

      await pool.acquire('backend', () => new MockAgent('backend'));

      const event = await eventPromise;
      expect(event.agentType).toBe('backend');
      expect(event.agentId).toBeDefined();
    });

    test('should emit agentReused event', async () => {
      const agent = await pool.acquire('backend', () => new MockAgent('backend'));
      pool.release(agent);

      const eventPromise = new Promise(resolve => {
        pool.once('agentReused', resolve);
      });

      await pool.acquire('backend', () => new MockAgent('backend'));

      const event = await eventPromise;
      expect(event.agentType).toBe('backend');
    });

    test('should emit agentReleased event', async () => {
      const agent = await pool.acquire('backend', () => new MockAgent('backend'));

      const eventPromise = new Promise(resolve => {
        pool.once('agentReleased', resolve);
      });

      pool.release(agent);

      const event = await eventPromise;
      expect(event.agentType).toBe('backend');
      expect(event.duration).toBeDefined();
    });

    test('should emit agentEvicted event on idle timeout', async () => {
      jest.setTimeout(5000);

      const agent = await pool.acquire('backend', () => new MockAgent('backend'));
      pool.release(agent);

      const eventPromise = new Promise(resolve => {
        pool.once('agentEvicted', resolve);
      });

      // Wait for eviction
      const event = await eventPromise;
      expect(event.agentType).toBe('backend');
      expect(event.idleTime).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle concurrent acquisitions', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        pool.acquire('backend', () => new MockAgent('backend'))
      );

      const agents = await Promise.all(promises);

      expect(agents).toHaveLength(10);
      expect(pool.getStats().metrics.created).toBeLessThanOrEqual(3); // maxPerType
    });

    test('should handle rapid acquire-release cycles', async () => {
      for (let i = 0; i < 20; i++) {
        const agent = await pool.acquire('backend', () => new MockAgent('backend'));
        pool.release(agent);
      }

      const stats = pool.getStats();
      expect(stats.metrics.acquired).toBe(20);
      expect(stats.metrics.created).toBe(1); // Should only create once
      expect(stats.metrics.reused).toBe(19);
    });

    test('should cleanup on destroy', async () => {
      const agent1 = await pool.acquire('backend', () => new MockAgent('backend'));
      const agent2 = await pool.acquire('frontend', () => new MockAgent('frontend'));
      pool.release(agent1);

      await pool.destroy();

      const stats = pool.getStats();
      expect(stats.pools).toEqual({});
      expect(stats.busy).toBe(0);
    });
  });
});
