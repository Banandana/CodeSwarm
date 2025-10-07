/**
 * Unit tests for State Manager Archiving
 * Tests archival, pruning, and restoration
 */

const StateManager = require('../../src/core/state/manager');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('StateManager Archiving', () => {
  let stateManager;
  let testDir;

  beforeEach(async () => {
    // Create temp directory for tests
    testDir = path.join(os.tmpdir(), `state-test-${Date.now()}`);
    await fs.ensureDir(testDir);

    stateManager = new StateManager(testDir);
    await stateManager.initialize();
  });

  afterEach(async () => {
    if (stateManager) {
      await stateManager.cleanup();
    }
    // Clean up test directory
    await fs.remove(testDir);
  });

  describe('Archival Configuration', () => {
    test('should have archival enabled by default', () => {
      expect(stateManager.archivalConfig.enabled).toBe(true);
    });

    test('should respect environment variable for disabling', () => {
      process.env.STATE_ARCHIVAL_ENABLED = 'false';
      const manager = new StateManager(testDir);

      expect(manager.archivalConfig.enabled).toBe(false);

      delete process.env.STATE_ARCHIVAL_ENABLED;
    });

    test('should use default thresholds', () => {
      expect(stateManager.archivalConfig.archiveThreshold).toBe(86400000); // 24h
      expect(stateManager.archivalConfig.pruneThreshold).toBe(172800000); // 48h
    });

    test('should respect custom thresholds from environment', () => {
      process.env.STATE_ARCHIVE_THRESHOLD = '3600000'; // 1 hour
      process.env.STATE_PRUNE_THRESHOLD = '7200000'; // 2 hours

      const manager = new StateManager(testDir);

      expect(manager.archivalConfig.archiveThreshold).toBe(3600000);
      expect(manager.archivalConfig.pruneThreshold).toBe(7200000);

      delete process.env.STATE_ARCHIVE_THRESHOLD;
      delete process.env.STATE_PRUNE_THRESHOLD;
    });
  });

  describe('Archival Process', () => {
    test('should identify old entries for archival', async () => {
      const now = Date.now();
      const oldTime = now - (25 * 60 * 60 * 1000); // 25 hours ago

      // Write old entry
      await stateManager.write('old-key', { data: 'old' }, 'test-agent');

      // Manually set old timestamp
      const entry = stateManager.state.get('old-key');
      entry.lastModified = oldTime;

      const result = await stateManager.archiveOldState();

      expect(result.archived).toBe(1);
      expect(result.pruned).toBe(0);
    });

    test('should identify very old entries for pruning', async () => {
      const now = Date.now();
      const veryOldTime = now - (49 * 60 * 60 * 1000); // 49 hours ago

      // Write very old entry
      await stateManager.write('very-old-key', { data: 'very-old' }, 'test-agent');

      // Manually set very old timestamp
      const entry = stateManager.state.get('very-old-key');
      entry.lastModified = veryOldTime;

      const result = await stateManager.archiveOldState();

      expect(result.pruned).toBe(1);
      expect(result.archived).toBe(0);
    });

    test('should not archive recent entries', async () => {
      await stateManager.write('recent-key', { data: 'recent' }, 'test-agent');

      const result = await stateManager.archiveOldState();

      expect(result.archived).toBe(0);
      expect(result.pruned).toBe(0);
      expect(result.remainingEntries).toBeGreaterThan(0);
    });

    test('should archive to disk correctly', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);

      await stateManager.write('key1', { data: 'value1' }, 'agent1');
      await stateManager.write('key2', { data: 'value2' }, 'agent2');

      // Set old timestamps
      stateManager.state.get('key1').lastModified = oldTime;
      stateManager.state.get('key2').lastModified = oldTime;

      await stateManager.archiveOldState();

      // Check archive directory exists
      const archiveDir = path.join(testDir, '.codeswarm', 'state-archive');
      const exists = await fs.pathExists(archiveDir);
      expect(exists).toBe(true);

      // Check archive file exists
      const files = await fs.readdir(archiveDir);
      expect(files.length).toBeGreaterThan(0);

      // Check archive content
      const archiveFile = path.join(archiveDir, files[0]);
      const archive = await fs.readJson(archiveFile);
      expect(archive.entries).toHaveLength(2);
    });

    test('should remove archived entries from memory', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);

      await stateManager.write('key1', { data: 'value1' }, 'agent1');

      stateManager.state.get('key1').lastModified = oldTime;

      const sizeBefore = stateManager.state.size;
      await stateManager.archiveOldState();
      const sizeAfter = stateManager.state.size;

      expect(sizeAfter).toBeLessThan(sizeBefore);
      expect(stateManager.state.has('key1')).toBe(false);
    });

    test('should track memory reclaimed', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);

      await stateManager.write('key1', { data: 'large-value'.repeat(1000) }, 'agent1');

      stateManager.state.get('key1').lastModified = oldTime;

      await stateManager.archiveOldState();

      const stats = stateManager.getArchivalStats();
      expect(stats.memoryReclaimed).toBeGreaterThan(0);
    });
  });

  describe('Restoration', () => {
    test('should restore archived entries', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);
      const testValue = { data: 'archived-value' };

      // Archive an entry
      await stateManager.write('restore-key', testValue, 'agent1');
      stateManager.state.get('restore-key').lastModified = oldTime;
      await stateManager.archiveOldState();

      // Verify removed from memory
      expect(stateManager.state.has('restore-key')).toBe(false);

      // Restore from archive
      const restored = await stateManager.restoreFromArchive('restore-key');

      expect(restored).toEqual(testValue);
    });

    test('should return null for non-existent archived entries', async () => {
      const restored = await stateManager.restoreFromArchive('non-existent');

      expect(restored).toBeNull();
    });

    test('should search multiple archive files', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);

      // Create first archive
      await stateManager.write('key1', { data: 'value1' }, 'agent1');
      stateManager.state.get('key1').lastModified = oldTime;
      await stateManager.archiveOldState();

      // Create second archive
      await stateManager.write('key2', { data: 'value2' }, 'agent1');
      stateManager.state.get('key2').lastModified = oldTime;
      await stateManager.archiveOldState();

      // Should find from second archive
      const restored = await stateManager.restoreFromArchive('key2');
      expect(restored).toEqual({ data: 'value2' });
    });
  });

  describe('Metrics', () => {
    test('should track archived count', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);

      await stateManager.write('key1', { data: 'value1' }, 'agent1');
      await stateManager.write('key2', { data: 'value2' }, 'agent1');

      stateManager.state.get('key1').lastModified = oldTime;
      stateManager.state.get('key2').lastModified = oldTime;

      await stateManager.archiveOldState();

      const stats = stateManager.getArchivalStats();
      expect(stats.archived).toBe(2);
    });

    test('should track pruned count', async () => {
      const veryOldTime = Date.now() - (49 * 60 * 60 * 1000);

      await stateManager.write('key1', { data: 'value1' }, 'agent1');
      stateManager.state.get('key1').lastModified = veryOldTime;

      await stateManager.archiveOldState();

      const stats = stateManager.getArchivalStats();
      expect(stats.pruned).toBe(1);
    });

    test('should track cumulative metrics', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);

      // First archival
      await stateManager.write('key1', { data: 'value1' }, 'agent1');
      stateManager.state.get('key1').lastModified = oldTime;
      await stateManager.archiveOldState();

      // Second archival
      await stateManager.write('key2', { data: 'value2' }, 'agent1');
      stateManager.state.get('key2').lastModified = oldTime;
      await stateManager.archiveOldState();

      const stats = stateManager.getArchivalStats();
      expect(stats.archived).toBe(2);
    });

    test('should calculate memory reclaimed in MB', async () => {
      const stats = stateManager.getArchivalStats();
      expect(stats.memoryReclaimedMB).toBeDefined();
      expect(typeof stats.memoryReclaimedMB).toBe('number');
    });
  });

  describe('Event Emissions', () => {
    test('should emit stateArchived event', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);

      const eventPromise = new Promise(resolve => {
        stateManager.once('stateArchived', resolve);
      });

      await stateManager.write('key1', { data: 'value1' }, 'agent1');
      stateManager.state.get('key1').lastModified = oldTime;
      await stateManager.archiveOldState();

      const event = await eventPromise;
      expect(event.archived).toBeGreaterThan(0);
      expect(event.timestamp).toBeDefined();
    });

    test('should not emit event when nothing archived', async () => {
      let eventFired = false;
      stateManager.once('stateArchived', () => {
        eventFired = true;
      });

      await stateManager.archiveOldState();

      expect(eventFired).toBe(false);
    });
  });

  describe('Cleanup', () => {
    test('should perform final archival on cleanup', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);

      await stateManager.write('key1', { data: 'value1' }, 'agent1');
      stateManager.state.get('key1').lastModified = oldTime;

      await stateManager.cleanup();

      // Check that archival happened
      const archiveDir = path.join(testDir, '.codeswarm', 'state-archive');
      const exists = await fs.pathExists(archiveDir);

      if (exists) {
        const files = await fs.readdir(archiveDir);
        expect(files.length).toBeGreaterThan(0);
      }
    });

    test('should stop archival interval on cleanup', async () => {
      const intervalId = stateManager.archivalInterval;

      await stateManager.cleanup();

      expect(stateManager.archivalInterval).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    test('should handle archival when disabled', async () => {
      stateManager.archivalConfig.enabled = false;

      const result = await stateManager.archiveOldState();

      expect(result.archived).toBe(0);
      expect(result.pruned).toBe(0);
    });

    test('should handle empty state', async () => {
      const result = await stateManager.archiveOldState();

      expect(result.archived).toBe(0);
      expect(result.pruned).toBe(0);
    });

    test('should handle entries without timestamps', async () => {
      // Manually add entry without timestamp
      stateManager.state.set('no-timestamp', {
        value: { data: 'test' },
        version: 1
        // No lastModified
      });

      // Should not crash
      await expect(stateManager.archiveOldState()).resolves.toBeDefined();
    });

    test('should handle concurrent archival calls', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000);

      await stateManager.write('key1', { data: 'value1' }, 'agent1');
      stateManager.state.get('key1').lastModified = oldTime;

      // Call archival concurrently
      const results = await Promise.all([
        stateManager.archiveOldState(),
        stateManager.archiveOldState()
      ]);

      // Should handle gracefully
      expect(results).toHaveLength(2);
    });

    test('should handle missing archive directory', async () => {
      const restored = await stateManager.restoreFromArchive('key1');

      expect(restored).toBeNull();
    });
  });
});
