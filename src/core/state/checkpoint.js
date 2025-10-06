/**
 * Checkpoint System
 * Saves and restores system state for crash recovery
 */

const fs = require('fs-extra');
const path = require('path');
const { StateError } = require('../../utils/errors');

class CheckpointManager {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.checkpointDir = path.join(outputDir, '.codeswarm');
    this.checkpointFile = path.join(this.checkpointDir, 'state.json');
    this.historyDir = path.join(this.checkpointDir, 'history');
  }

  /**
   * Initialize checkpoint directory
   */
  async initialize() {
    await fs.ensureDir(this.checkpointDir);
    await fs.ensureDir(this.historyDir);
  }

  /**
   * Create checkpoint
   * @param {Object} state - Current system state
   * @returns {Promise<string>} Checkpoint ID
   */
  async createCheckpoint(state) {
    try {
      await this.initialize();

      const checkpoint = {
        id: `checkpoint_${Date.now()}`,
        timestamp: Date.now(),
        version: '1.0.0',
        state: {
          currentTask: state.currentTask,
          completedTasks: state.completedTasks || [],
          pendingTasks: state.pendingTasks || [],
          failedTasks: state.failedTasks || [],
          budgetUsed: state.budgetUsed || 0,
          budgetRemaining: state.budgetRemaining || 0,
          filesModified: state.filesModified || [],
          filesCreated: state.filesCreated || [],
          agents: state.agents ? state.agents.map(a => this._serializeAgent(a)) : [],
          projectInfo: state.projectInfo || {},
          config: state.config || {}
        }
      };

      // Write main checkpoint
      await fs.writeJSON(this.checkpointFile, checkpoint, { spaces: 2 });

      // Archive to history
      const historyFile = path.join(this.historyDir, `${checkpoint.id}.json`);
      await fs.writeJSON(historyFile, checkpoint, { spaces: 2 });

      return checkpoint.id;
    } catch (error) {
      throw new StateError(`Failed to create checkpoint: ${error.message}`, {
        outputDir: this.outputDir,
        error: error.message
      });
    }
  }

  /**
   * Load latest checkpoint
   * @returns {Promise<Object|null>}
   */
  async loadLatestCheckpoint() {
    try {
      if (!await fs.pathExists(this.checkpointFile)) {
        return null;
      }

      const checkpoint = await fs.readJSON(this.checkpointFile);

      // Validate checkpoint structure
      if (!this._validateCheckpoint(checkpoint)) {
        throw new StateError('Invalid checkpoint structure');
      }

      return checkpoint;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new StateError(`Failed to load checkpoint: ${error.message}`, {
        checkpointFile: this.checkpointFile,
        error: error.message
      });
    }
  }

  /**
   * Check if checkpoint exists
   * @returns {Promise<boolean>}
   */
  async hasCheckpoint() {
    return await fs.pathExists(this.checkpointFile);
  }

  /**
   * Get checkpoint metadata
   * @returns {Promise<Object|null>}
   */
  async getCheckpointMetadata() {
    const checkpoint = await this.loadLatestCheckpoint();

    if (!checkpoint) {
      return null;
    }

    return {
      id: checkpoint.id,
      timestamp: checkpoint.timestamp,
      age: Date.now() - checkpoint.timestamp,
      completedTasks: checkpoint.state.completedTasks.length,
      pendingTasks: checkpoint.state.pendingTasks.length,
      failedTasks: checkpoint.state.failedTasks.length,
      budgetUsed: checkpoint.state.budgetUsed,
      filesModified: checkpoint.state.filesModified.length,
      filesCreated: checkpoint.state.filesCreated.length
    };
  }

  /**
   * Restore state from checkpoint
   * @returns {Promise<Object>}
   */
  async restoreFromCheckpoint() {
    const checkpoint = await this.loadLatestCheckpoint();

    if (!checkpoint) {
      throw new StateError('No checkpoint found to restore from');
    }

    return {
      shouldResume: true,
      checkpointId: checkpoint.id,
      timestamp: checkpoint.timestamp,
      currentTask: checkpoint.state.currentTask,
      completedTasks: checkpoint.state.completedTasks,
      pendingTasks: checkpoint.state.pendingTasks,
      failedTasks: checkpoint.state.failedTasks,
      budgetUsed: checkpoint.state.budgetUsed,
      budgetRemaining: checkpoint.state.budgetRemaining,
      filesModified: checkpoint.state.filesModified,
      filesCreated: checkpoint.state.filesCreated,
      agents: checkpoint.state.agents.map(a => this._deserializeAgent(a)),
      projectInfo: checkpoint.state.projectInfo,
      config: checkpoint.state.config
    };
  }

  /**
   * Clear checkpoint (after successful completion)
   */
  async clearCheckpoint() {
    try {
      if (await fs.pathExists(this.checkpointFile)) {
        await fs.remove(this.checkpointFile);
      }
    } catch (error) {
      throw new StateError(`Failed to clear checkpoint: ${error.message}`);
    }
  }

  /**
   * Get checkpoint history
   * @param {number} limit - Max number of checkpoints to return
   * @returns {Promise<Array>}
   */
  async getHistory(limit = 10) {
    try {
      await this.initialize();

      const files = await fs.readdir(this.historyDir);
      const checkpointFiles = files
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const checkpoints = [];
      for (const file of checkpointFiles) {
        const checkpoint = await fs.readJSON(path.join(this.historyDir, file));
        checkpoints.push({
          id: checkpoint.id,
          timestamp: checkpoint.timestamp,
          completedTasks: checkpoint.state.completedTasks.length,
          pendingTasks: checkpoint.state.pendingTasks.length
        });
      }

      return checkpoints;
    } catch (error) {
      throw new StateError(`Failed to get checkpoint history: ${error.message}`);
    }
  }

  /**
   * Serialize agent state
   * @private
   */
  _serializeAgent(agent) {
    return {
      id: agent.id,
      type: agent.type,
      status: agent.status,
      currentTask: agent.currentTask,
      completedTasks: agent.completedTasks || [],
      metadata: agent.metadata || {}
    };
  }

  /**
   * Deserialize agent state
   * @private
   */
  _deserializeAgent(agentData) {
    return {
      id: agentData.id,
      type: agentData.type,
      status: agentData.status,
      currentTask: agentData.currentTask,
      completedTasks: agentData.completedTasks || [],
      metadata: agentData.metadata || {}
    };
  }

  /**
   * Validate checkpoint structure
   * @private
   */
  _validateCheckpoint(checkpoint) {
    return (
      checkpoint &&
      checkpoint.id &&
      checkpoint.timestamp &&
      checkpoint.state &&
      Array.isArray(checkpoint.state.completedTasks) &&
      Array.isArray(checkpoint.state.pendingTasks)
    );
  }
}

module.exports = CheckpointManager;
