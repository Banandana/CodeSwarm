/**
 * Transaction Manager
 * Handles multi-file atomic operations with rollback support
 */

const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { FileSystemError } = require('../utils/errors');

class TransactionManager extends EventEmitter {
  constructor(fileOps) {
    super();
    this.fileOps = fileOps;
    this.transactions = new Map();
  }

  /**
   * Begin a new transaction
   * @param {string} transactionId - Optional transaction ID
   * @returns {string} transactionId
   */
  beginTransaction(transactionId = null) {
    const txId = transactionId || uuidv4();

    // F4: Detect nested transactions
    if (this.transactions.has(txId)) {
      throw new FileSystemError(
        `Transaction ${txId} already exists - nested transactions not supported`,
        { transactionId: txId }
      );
    }

    this.transactions.set(txId, {
      id: txId,
      status: 'ACTIVE',
      files: [],
      backups: new Map(),
      startTime: Date.now(),
      operations: []
    });

    this.emit('transactionBegun', {
      transactionId: txId,
      timestamp: Date.now()
    });

    return txId;
  }

  /**
   * Add file operation to transaction
   * @param {string} transactionId
   * @param {Object} operation
   */
  addOperation(transactionId, operation) {
    const tx = this.transactions.get(transactionId);

    if (!tx) {
      throw new FileSystemError(`Transaction ${transactionId} not found`);
    }

    if (tx.status !== 'ACTIVE') {
      throw new FileSystemError(`Transaction ${transactionId} is not active (status: ${tx.status})`);
    }

    tx.operations.push({
      ...operation,
      timestamp: Date.now()
    });

    tx.files.push(operation.filePath);
  }

  /**
   * Store backup before modifying file
   * @param {string} transactionId
   * @param {string} filePath
   * @param {string} content
   */
  async storeBackup(transactionId, filePath, content) {
    const tx = this.transactions.get(transactionId);

    if (!tx) {
      throw new FileSystemError(`Transaction ${transactionId} not found`);
    }

    tx.backups.set(filePath, {
      content,
      timestamp: Date.now()
    });
  }

  /**
   * Commit transaction - make all changes permanent
   * @param {string} transactionId
   * @returns {Promise<Object>}
   */
  async commitTransaction(transactionId) {
    const tx = this.transactions.get(transactionId);

    if (!tx) {
      throw new FileSystemError(`Transaction ${transactionId} not found`);
    }

    if (tx.status !== 'ACTIVE') {
      throw new FileSystemError(`Transaction ${transactionId} is not active (status: ${tx.status})`);
    }

    try {
      tx.status = 'COMMITTING';

      // All operations already executed, just mark as committed
      tx.status = 'COMMITTED';
      tx.commitTime = Date.now();

      // Clear backups (no longer needed)
      tx.backups.clear();

      this.emit('transactionCommitted', {
        transactionId,
        filesAffected: tx.files.length,
        operations: tx.operations.length,
        duration: tx.commitTime - tx.startTime,
        timestamp: Date.now()
      });

      // Remove transaction after short delay (keep for debugging)
      setTimeout(() => {
        this.transactions.delete(transactionId);
      }, 60000); // Keep for 1 minute

      return {
        success: true,
        transactionId,
        filesAffected: tx.files.length,
        operations: tx.operations.length
      };

    } catch (error) {
      // Commit failed, rollback
      await this.rollbackTransaction(transactionId);
      throw error;
    }
  }

  /**
   * Rollback transaction - restore all files from backups
   * @param {string} transactionId
   * @returns {Promise<Object>}
   */
  async rollbackTransaction(transactionId) {
    const tx = this.transactions.get(transactionId);

    if (!tx) {
      throw new FileSystemError(`Transaction ${transactionId} not found`);
    }

    try {
      tx.status = 'ROLLING_BACK';

      const restoredFiles = [];
      const errors = [];

      // Restore all backed up files
      for (const [filePath, backup] of tx.backups) {
        try {
          // F6: Verify lock before rollback if lockManager exists
          if (this.fileOps.lockManager) {
            const lockInfo = await this.fileOps.lockManager.getLockInfo(filePath);
            if (lockInfo && lockInfo.locked) {
              this.emit('warning', {
                message: `File ${filePath} is locked during rollback - may cause conflicts`,
                transactionId,
                filePath,
                lockInfo
              });
            }
          }

          const fullPath = path.join(this.fileOps.outputDir, filePath);
          await fs.writeFile(fullPath, backup.content, 'utf-8');
          restoredFiles.push(filePath);
        } catch (error) {
          errors.push({
            filePath,
            error: error.message
          });
        }
      }

      // Delete any newly created files
      for (const op of tx.operations) {
        if (op.action === 'create') {
          try {
            const fullPath = path.join(this.fileOps.outputDir, op.filePath);
            if (await fs.pathExists(fullPath)) {
              // F5: Check if file was modified since creation before deleting
              const currentContent = await fs.readFile(fullPath, 'utf-8');
              const stats = await fs.stat(fullPath);
              const opTimestamp = op.timestamp || Date.now();

              // Warn if file was modified after operation
              if (stats.mtime.getTime() > opTimestamp + 1000) { // 1 second grace period
                this.emit('warning', {
                  message: `File ${op.filePath} was modified after creation - deleting anyway`,
                  transactionId,
                  filePath: op.filePath,
                  opTime: new Date(opTimestamp),
                  modTime: stats.mtime
                });
              }

              await fs.unlink(fullPath);
              restoredFiles.push(op.filePath);
            }
          } catch (error) {
            errors.push({
              filePath: op.filePath,
              error: error.message
            });
          }
        }
      }

      tx.status = 'ROLLED_BACK';
      tx.rollbackTime = Date.now();

      this.emit('transactionRolledBack', {
        transactionId,
        restoredFiles: restoredFiles.length,
        errors: errors.length,
        timestamp: Date.now()
      });

      // Remove transaction after short delay
      setTimeout(() => {
        this.transactions.delete(transactionId);
      }, 60000);

      return {
        success: true,
        transactionId,
        restoredFiles,
        errors
      };

    } catch (error) {
      tx.status = 'ROLLBACK_FAILED';

      // Better error handling in rollback
      this.emit('error', {
        message: `Transaction rollback failed for ${transactionId}`,
        transactionId,
        error: error.message,
        stack: error.stack
      });

      throw new FileSystemError(
        `Failed to rollback transaction ${transactionId}: ${error.message}`,
        { transactionId, error: error.message }
      );
    }
  }

  /**
   * Get transaction status
   * @param {string} transactionId
   * @returns {Object}
   */
  getTransaction(transactionId) {
    const tx = this.transactions.get(transactionId);

    if (!tx) {
      return null;
    }

    return {
      id: tx.id,
      status: tx.status,
      filesAffected: tx.files.length,
      operations: tx.operations.length,
      startTime: tx.startTime,
      duration: Date.now() - tx.startTime
    };
  }

  /**
   * Get all active transactions
   * @returns {Array}
   */
  getActiveTransactions() {
    return Array.from(this.transactions.values())
      .filter(tx => tx.status === 'ACTIVE')
      .map(tx => ({
        id: tx.id,
        status: tx.status,
        filesAffected: tx.files.length,
        startTime: tx.startTime,
        duration: Date.now() - tx.startTime
      }));
  }

  /**
   * Clean up old transactions
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [txId, tx] of this.transactions.entries()) {
      const age = now - tx.startTime;

      if (age > maxAge && tx.status !== 'ACTIVE') {
        this.transactions.delete(txId);
      }
    }
  }
}

module.exports = TransactionManager;
