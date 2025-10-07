/**
 * Agent Pool Manager
 * Reuses agent instances to reduce initialization overhead
 */

const EventEmitter = require('events');

class AgentPool extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      maxPerType: options.maxPerType || 3,
      idleTimeout: options.idleTimeout || 300000, // 5 minutes
      enableMetrics: options.enableMetrics !== false
    };

    // Pool structure: agentType -> array of available agents
    this.pools = new Map();

    // Busy agents: agentId -> { agent, acquiredAt, taskId }
    this.busy = new Map();

    // Agent creation count per type
    this.created = new Map();

    // Metrics
    this.metrics = {
      acquired: 0,
      released: 0,
      created: 0,
      reused: 0,
      evicted: 0
    };

    // Start cleanup interval
    this._startCleanupInterval();
  }

  /**
   * Acquire an agent from the pool or create new one
   * @param {string} agentType - Type of agent to acquire
   * @param {Function} createFn - Function to create new agent if needed
   * @returns {Promise<Object>} Agent instance
   */
  async acquire(agentType, createFn) {
    // Initialize pool for this type if doesn't exist
    if (!this.pools.has(agentType)) {
      this.pools.set(agentType, []);
      this.created.set(agentType, 0);
    }

    const available = this.pools.get(agentType);

    // Try to reuse existing agent
    if (available.length > 0) {
      const agent = available.pop();

      this.busy.set(agent.agentId, {
        agent,
        acquiredAt: Date.now(),
        taskId: null
      });

      this.metrics.acquired++;
      this.metrics.reused++;

      this.emit('agentReused', {
        agentType,
        agentId: agent.agentId,
        poolSize: available.length
      });

      console.log(`[AgentPool] Reused ${agentType} agent: ${agent.agentId} (pool: ${available.length} available)`);

      return agent;
    }

    // Check if we can create a new agent
    const currentCount = this.created.get(agentType) || 0;
    const busyCount = Array.from(this.busy.values()).filter(
      b => b.agent.agentType === agentType
    ).length;

    const totalCount = currentCount + busyCount;

    if (totalCount >= this.config.maxPerType) {
      // Wait for an agent to be released
      console.log(`[AgentPool] Max agents reached for ${agentType} (${totalCount}/${this.config.maxPerType}), waiting...`);

      return await this._waitForAgent(agentType);
    }

    // Create new agent
    const agent = await createFn();

    this.created.set(agentType, currentCount + 1);
    this.metrics.created++;
    this.metrics.acquired++;

    this.busy.set(agent.agentId, {
      agent,
      acquiredAt: Date.now(),
      taskId: null
    });

    this.emit('agentCreated', {
      agentType,
      agentId: agent.agentId,
      totalCreated: this.created.get(agentType)
    });

    console.log(`[AgentPool] Created new ${agentType} agent: ${agent.agentId} (total created: ${this.created.get(agentType)})`);

    return agent;
  }

  /**
   * Release an agent back to the pool
   * @param {Object} agent - Agent to release
   * @param {Object} options - Release options
   */
  release(agent, options = {}) {
    const busyEntry = this.busy.get(agent.agentId);

    if (!busyEntry) {
      console.warn(`[AgentPool] Attempted to release unknown agent: ${agent.agentId}`);
      return;
    }

    this.busy.delete(agent.agentId);
    this.metrics.released++;

    // Check if agent should be destroyed
    if (options.destroy || options.error) {
      this.emit('agentDestroyed', {
        agentType: agent.agentType,
        agentId: agent.agentId,
        reason: options.error ? 'error' : 'manual'
      });

      console.log(`[AgentPool] Destroyed ${agent.agentType} agent: ${agent.agentId} (reason: ${options.error || 'manual'})`);

      // Decrement created count
      const count = this.created.get(agent.agentType) || 0;
      this.created.set(agent.agentType, Math.max(0, count - 1));

      return;
    }

    // Return to pool
    const pool = this.pools.get(agent.agentType);
    if (pool) {
      // Mark last release time
      agent._poolLastReleased = Date.now();

      pool.push(agent);

      this.emit('agentReleased', {
        agentType: agent.agentType,
        agentId: agent.agentId,
        poolSize: pool.length,
        duration: Date.now() - busyEntry.acquiredAt
      });

      console.log(`[AgentPool] Released ${agent.agentType} agent: ${agent.agentId} (pool: ${pool.length} available)`);
    }
  }

  /**
   * Wait for an agent to become available
   * @private
   */
  async _waitForAgent(agentType) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const available = this.pools.get(agentType);

        if (available && available.length > 0) {
          clearInterval(checkInterval);

          const agent = available.pop();

          this.busy.set(agent.agentId, {
            agent,
            acquiredAt: Date.now(),
            taskId: null
          });

          this.metrics.acquired++;
          this.metrics.reused++;

          console.log(`[AgentPool] Agent became available: ${agent.agentId}`);

          resolve(agent);
        }
      }, 100);

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        throw new Error(`Timeout waiting for ${agentType} agent`);
      }, 30000);
    });
  }

  /**
   * Cleanup idle agents
   * @private
   */
  _startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this._cleanupIdleAgents();
    }, 60000); // Every minute
  }

  /**
   * Remove idle agents from pool
   * @private
   */
  _cleanupIdleAgents() {
    const now = Date.now();

    for (const [agentType, pool] of this.pools.entries()) {
      const toRemove = [];

      for (let i = 0; i < pool.length; i++) {
        const agent = pool[i];
        const idleTime = now - (agent._poolLastReleased || 0);

        if (idleTime > this.config.idleTimeout) {
          toRemove.push(i);
        }
      }

      // Remove in reverse order to maintain indices
      for (let i = toRemove.length - 1; i >= 0; i--) {
        const removed = pool.splice(toRemove[i], 1)[0];

        this.metrics.evicted++;

        // Decrement created count
        const count = this.created.get(agentType) || 0;
        this.created.set(agentType, Math.max(0, count - 1));

        this.emit('agentEvicted', {
          agentType,
          agentId: removed.agentId,
          idleTime: now - removed._poolLastReleased
        });

        console.log(`[AgentPool] Evicted idle ${agentType} agent: ${removed.agentId} (idle: ${Math.round(idleTime / 1000)}s)`);
      }
    }
  }

  /**
   * Get pool statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const stats = {
      metrics: { ...this.metrics },
      pools: {},
      busy: this.busy.size,
      efficiency: this.metrics.acquired > 0
        ? (this.metrics.reused / this.metrics.acquired) * 100
        : 0
    };

    for (const [agentType, pool] of this.pools.entries()) {
      stats.pools[agentType] = {
        available: pool.length,
        created: this.created.get(agentType) || 0,
        busy: Array.from(this.busy.values()).filter(
          b => b.agent.agentType === agentType
        ).length
      };
    }

    return stats;
  }

  /**
   * Destroy all agents and clean up
   */
  async destroy() {
    clearInterval(this.cleanupInterval);

    // Clear all pools
    for (const pool of this.pools.values()) {
      pool.length = 0;
    }

    this.busy.clear();
    this.pools.clear();
    this.created.clear();

    console.log('[AgentPool] Destroyed all agents and pools');
  }
}

module.exports = AgentPool;
