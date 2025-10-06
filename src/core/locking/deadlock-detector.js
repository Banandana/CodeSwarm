/**
 * Deadlock Detector
 * Detects circular dependencies in lock acquisitions
 */

const { DeadlockError } = require('../../utils/errors');

class DeadlockDetector {
  constructor() {
    // Wait-for graph: agent -> resources it's waiting for
    this.waitForGraph = new Map();
    // Resource ownership: resource -> agent that owns it
    this.resourceOwners = new Map();
  }

  /**
   * Record that an agent is waiting for a resource
   * @param {string} agentId
   * @param {string} resourceId
   */
  addWaitEdge(agentId, resourceId) {
    if (!this.waitForGraph.has(agentId)) {
      this.waitForGraph.set(agentId, new Set());
    }
    this.waitForGraph.get(agentId).add(resourceId);
  }

  /**
   * Record that an agent acquired a resource
   * @param {string} agentId
   * @param {string} resourceId
   */
  acquireResource(agentId, resourceId) {
    // Remove from wait graph
    if (this.waitForGraph.has(agentId)) {
      this.waitForGraph.get(agentId).delete(resourceId);
    }

    // Set ownership
    this.resourceOwners.set(resourceId, agentId);
  }

  /**
   * Record that an agent released a resource
   * @param {string} resourceId
   */
  releaseResource(resourceId) {
    this.resourceOwners.delete(resourceId);
  }

  /**
   * Check for deadlock before adding wait edge
   * @param {string} agentId
   * @param {string} resourceId
   * @returns {boolean} - true if would cause deadlock
   */
  wouldCauseDeadlock(agentId, resourceId) {
    // Get owner of requested resource
    const resourceOwner = this.resourceOwners.get(resourceId);

    if (!resourceOwner) {
      return false; // Resource is available
    }

    // Check if this would create a cycle
    return this._detectCycle(agentId, resourceOwner, new Set());
  }

  /**
   * Detect cycle using DFS
   * @private
   * @param {string} startAgent
   * @param {string} currentAgent
   * @param {Set} visited
   * @returns {boolean}
   */
  _detectCycle(startAgent, currentAgent, visited) {
    if (currentAgent === startAgent) {
      return true; // Cycle detected
    }

    if (visited.has(currentAgent)) {
      return false; // Already explored this path
    }

    visited.add(currentAgent);

    // Check what resources this agent is waiting for
    const waitingFor = this.waitForGraph.get(currentAgent);

    if (!waitingFor) {
      return false;
    }

    // For each resource the agent is waiting for
    for (const resourceId of waitingFor) {
      const owner = this.resourceOwners.get(resourceId);

      if (owner && this._detectCycle(startAgent, owner, visited)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get current deadlock status
   * @returns {Object}
   */
  getStatus() {
    return {
      waitingAgents: this.waitForGraph.size,
      lockedResources: this.resourceOwners.size,
      potentialDeadlocks: this._findAllCycles()
    };
  }

  /**
   * Find all cycles in wait-for graph
   * @private
   * @returns {Array}
   */
  _findAllCycles() {
    const cycles = [];

    for (const [agentId] of this.waitForGraph) {
      const cycle = this._findCycleFrom(agentId);
      if (cycle) {
        cycles.push(cycle);
      }
    }

    return cycles;
  }

  /**
   * Find cycle starting from specific agent
   * @private
   * @param {string} startAgent
   * @returns {Array|null}
   */
  _findCycleFrom(startAgent) {
    const path = [startAgent];
    const visited = new Set([startAgent]);

    return this._dfs(startAgent, path, visited);
  }

  /**
   * DFS to find cycle
   * @private
   */
  _dfs(currentAgent, path, visited) {
    const waitingFor = this.waitForGraph.get(currentAgent);

    if (!waitingFor) {
      return null;
    }

    for (const resourceId of waitingFor) {
      const owner = this.resourceOwners.get(resourceId);

      if (!owner) {
        continue;
      }

      if (owner === path[0]) {
        // Found cycle
        return [...path, owner];
      }

      if (!visited.has(owner)) {
        visited.add(owner);
        path.push(owner);

        const cycle = this._dfs(owner, path, visited);
        if (cycle) {
          return cycle;
        }

        path.pop();
        visited.delete(owner);
      }
    }

    return null;
  }

  /**
   * Clear all tracking data
   */
  clear() {
    this.waitForGraph.clear();
    this.resourceOwners.clear();
  }
}

module.exports = DeadlockDetector;
