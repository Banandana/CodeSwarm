/**
 * Backup Manager
 * Handles directory backups before modifications
 */

const fs = require('fs-extra');
const path = require('path');
const { FileSystemError } = require('../utils/errors');

class BackupManager {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.backupDir = `${outputDir}-backup`;
    this.backupTimestamp = null;
  }

  /**
   * Create full backup of output directory
   * @returns {Promise<string>} Backup path
   */
  async createBackup() {
    try {
      // Check if output directory exists
      if (!await fs.pathExists(this.outputDir)) {
        return null; // Nothing to backup
      }

      this.backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const timestampedBackupDir = `${this.backupDir}/${this.backupTimestamp}`;

      await fs.ensureDir(timestampedBackupDir);

      // Copy entire directory
      await fs.copy(this.outputDir, timestampedBackupDir, {
        overwrite: false,
        errorOnExist: false,
        filter: (src) => {
          // Exclude .codeswarm directory from backup
          return !src.includes('.codeswarm');
        }
      });

      // Create backup metadata
      const metadata = {
        timestamp: this.backupTimestamp,
        originalPath: this.outputDir,
        backupPath: timestampedBackupDir,
        createdAt: Date.now()
      };

      await fs.writeJSON(
        path.join(timestampedBackupDir, '.backup-metadata.json'),
        metadata,
        { spaces: 2 }
      );

      return timestampedBackupDir;
    } catch (error) {
      throw new FileSystemError(`Backup failed: ${error.message}`, {
        outputDir: this.outputDir,
        error: error.message
      });
    }
  }

  /**
   * List all backups
   * @returns {Promise<Array>}
   */
  async listBackups() {
    try {
      if (!await fs.pathExists(this.backupDir)) {
        return [];
      }

      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
      const backups = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metadataPath = path.join(this.backupDir, entry.name, '.backup-metadata.json');

          if (await fs.pathExists(metadataPath)) {
            const metadata = await fs.readJSON(metadataPath);
            backups.push({
              name: entry.name,
              path: path.join(this.backupDir, entry.name),
              ...metadata
            });
          }
        }
      }

      // Sort by creation time (newest first)
      return backups.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      throw new FileSystemError(`Failed to list backups: ${error.message}`);
    }
  }

  /**
   * Restore from backup
   * @param {string} backupName - Backup timestamp name
   * @param {Object} options - Restore options
   * @returns {Promise<boolean>}
   */
  async restore(backupName, options = {}) {
    try {
      const backupPath = path.join(this.backupDir, backupName);

      if (!await fs.pathExists(backupPath)) {
        throw new Error(`Backup not found: ${backupName}`);
      }

      // CRITICAL: Backup restore should only happen when system is shutdown
      // or with explicit bypass for emergency recovery
      if (!options.systemShutdown && !options.emergencyRestore) {
        throw new FileSystemError(
          'Backup restore requires system shutdown or emergency restore flag. ' +
          'Active file locks must be released before restore.',
          { backupName, safetyCheck: 'failed' }
        );
      }

      // Remove current output directory
      if (await fs.pathExists(this.outputDir)) {
        await fs.remove(this.outputDir);
      }

      // Restore from backup
      await fs.copy(backupPath, this.outputDir, {
        overwrite: true
      });

      return true;
    } catch (error) {
      throw new FileSystemError(`Restore failed: ${error.message}`, {
        backupName,
        error: error.message
      });
    }
  }

  /**
   * Get latest backup
   * @returns {Promise<Object|null>}
   */
  async getLatestBackup() {
    const backups = await this.listBackups();
    return backups.length > 0 ? backups[0] : null;
  }

  /**
   * Delete old backups (keep last N)
   * @param {number} keep - Number of backups to keep
   * @returns {Promise<number>} Number of deleted backups
   */
  async cleanup(keep = 5) {
    try {
      const backups = await this.listBackups();

      if (backups.length <= keep) {
        return 0;
      }

      const toDelete = backups.slice(keep);
      let deleted = 0;

      for (const backup of toDelete) {
        await fs.remove(backup.path);
        deleted++;
      }

      return deleted;
    } catch (error) {
      throw new FileSystemError(`Backup cleanup failed: ${error.message}`);
    }
  }
}

module.exports = BackupManager;
