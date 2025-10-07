/**
 * File System Operations
 * Handles safe file read/write/merge operations with AST parsing
 */

const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const { FileSystemError } = require('../utils/errors');
const Validator = require('../utils/validation');
const TransactionManager = require('./transaction-manager');

class FileSystemOperations extends EventEmitter {
  constructor(outputDir, lockManager = null) {
    super();
    this.outputDir = outputDir;
    this.fileHistory = new Map();
    this.lockManager = lockManager;

    // Transaction manager for multi-file operations
    this.transactionManager = new TransactionManager(this);

    // Current transaction context (per-agent)
    this.activeTransactions = new Map();

    // File history size limit (LRU)
    this.maxHistorySize = 100;
  }

  /**
   * Determine modification strategy for a file
   * @param {Object} task
   * @param {string} filePath
   * @returns {Promise<string>} 'FILE_LEVEL' or 'FUNCTION_LEVEL'
   */
  async determineEditStrategy(task, filePath) {
    const fullPath = path.join(this.outputDir, filePath);

    // New file = file-level
    if (!await fs.pathExists(fullPath)) {
      return 'FILE_LEVEL';
    }

    const description = task.description.toLowerCase();

    // Keywords indicating full rewrite
    if (description.includes('rewrite') ||
        description.includes('refactor') ||
        description.includes('replace')) {
      return 'FILE_LEVEL';
    }

    // Check file size
    const stats = await fs.stat(fullPath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const lineCount = content.split('\n').length;

    // Small files (<200 lines) = file-level (simpler)
    if (lineCount < 200) {
      return 'FILE_LEVEL';
    }

    // Large files with targeted changes = function-level
    if (description.includes('add') ||
        description.includes('modify') ||
        description.includes('update') ||
        description.includes('fix')) {
      return 'FUNCTION_LEVEL';
    }

    // Default to file-level for safety
    return 'FILE_LEVEL';
  }

  /**
   * Read file safely
   * @param {string} filePath - Relative to output directory
   * @returns {Promise<string>}
   */
  async readFile(filePath, options = {}) {
    try {
      // Validate file path using validation utility
      const fullPath = Validator.validateFilePath(filePath, this.outputDir);

      if (!await fs.pathExists(fullPath)) {
        return null;
      }

      // SECURITY: Check for symbolic links to prevent symlink attacks
      const stats = await fs.lstat(fullPath);
      if (stats.isSymbolicLink()) {
        throw new FileSystemError(
          `Security: Symbolic links are not allowed: ${filePath}`,
          { filePath, securityIssue: 'symlink_detected' }
        );
      }

      // SECURITY: Check file size limit before reading (10MB default)
      const maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
      if (stats.size > maxFileSize) {
        throw new FileSystemError(
          `Security: File size exceeds read limit. Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB, Limit: ${(maxFileSize / 1024 / 1024).toFixed(2)}MB`,
          {
            filePath,
            size: stats.size,
            limit: maxFileSize,
            securityIssue: 'file_size_limit_exceeded'
          }
        );
      }

      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      throw new FileSystemError(
        `Failed to read file ${filePath}: ${error.message}`,
        { filePath, error: error.message }
      );
    }
  }

  /**
   * Write file safely (atomic operation)
   * @param {string} filePath - Relative to output directory
   * @param {string} content
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async writeFile(filePath, content, options = {}) {
    try {
      // Validate file path using validation utility
      const fullPath = Validator.validateFilePath(filePath, this.outputDir);

      // SECURITY: Check file size limit (10MB default)
      const maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
      const contentSize = Buffer.byteLength(content, 'utf-8');

      if (contentSize > maxFileSize) {
        throw new FileSystemError(
          `Security: File size exceeds limit. Size: ${(contentSize / 1024 / 1024).toFixed(2)}MB, Limit: ${(maxFileSize / 1024 / 1024).toFixed(2)}MB`,
          {
            filePath,
            size: contentSize,
            limit: maxFileSize,
            securityIssue: 'file_size_limit_exceeded'
          }
        );
      }

      // SECURITY: Check for symbolic links to prevent symlink attacks
      if (await fs.pathExists(fullPath)) {
        const stats = await fs.lstat(fullPath);
        if (stats.isSymbolicLink()) {
          throw new FileSystemError(
            `Security: Symbolic links are not allowed: ${filePath}`,
            { filePath, securityIssue: 'symlink_detected' }
          );
        }
      }

      // CRITICAL: Verify lock before writing (if lockManager is available)
      // Skip lock verification only for 'overwrite' actions or when explicitly bypassed
      if (this.lockManager && options.action !== 'overwrite' && !options.bypassLock) {
        const { lockId, agentId } = options;

        if (!lockId) {
          throw new FileSystemError(
            `Lock required for file write operation on ${filePath}`,
            { filePath, action: options.action }
          );
        }

        // Verify the lock is valid and held by this agent
        const lockValid = await this.lockManager.verifyLock(lockId, agentId);
        if (!lockValid) {
          throw new FileSystemError(
            `Lock verification failed for ${filePath} - file may be locked by another agent`,
            { filePath, lockId, agentId }
          );
        }
      }

      // Check if file already exists
      const exists = await fs.pathExists(fullPath);

      // Ensure directory exists
      await fs.ensureDir(path.dirname(fullPath));

      // Store previous version in history (with size limit)
      if (exists) {
        const previousContent = await fs.readFile(fullPath, 'utf-8');

        // Store in history with LRU eviction
        this._addToHistory(filePath, previousContent);

        // If transaction is active, store backup
        const transactionId = options.transactionId;
        if (transactionId) {
          await this.transactionManager.storeBackup(transactionId, filePath, previousContent);
        }
      }

      // Atomic write using temp file with cleanup
      // Use timestamp + random to avoid collisions in concurrent operations
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const tempPath = `${fullPath}.tmp.${timestamp}.${random}`;

      try {
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, fullPath);
      } catch (error) {
        // Clean up temp file on failure
        try {
          if (await fs.pathExists(tempPath)) {
            await fs.unlink(tempPath);
          }
        } catch (cleanupError) {
          // Log but don't throw
          this.emit('warning', {
            message: `Failed to cleanup temp file: ${tempPath}`,
            error: cleanupError.message
          });
        }
        throw error;
      }

      // Record operation in transaction if active
      if (options.transactionId) {
        this.transactionManager.addOperation(options.transactionId, {
          type: 'write',
          filePath,
          action: options.action,
          taskId: options.taskId,
          timestamp: Date.now()
        });
      }

      // Emit event for tracking
      const action = exists ? 'modified' : 'created';
      this.emit(exists ? 'fileModified' : 'fileCreated', {
        filePath,
        size: content.length,
        lines: content.split('\n').length,
        action,
        timestamp: Date.now()
      });

      return {
        filePath,
        size: content.length,
        lines: content.split('\n').length,
        action
      };
    } catch (error) {
      throw new FileSystemError(
        `Failed to write file ${filePath}: ${error.message}`,
        { filePath, error: error.message }
      );
    }
  }

  /**
   * Merge changes into existing file (function-level)
   * This is a simplified implementation - full AST parsing would be more robust
   * @param {string} filePath
   * @param {Object} changes
   * @returns {Promise<string>}
   */
  async mergeChanges(filePath, changes) {
    const existingContent = await this.readFile(filePath);

    if (!existingContent) {
      throw new FileSystemError(`Cannot merge into non-existent file: ${filePath}`);
    }

    // For now, use simple line-based merging
    // In production, this would use AST parsing for JS/TS/Python
    const lines = existingContent.split('\n');

    // Apply changes (simplified)
    if (changes.type === 'insert') {
      lines.splice(changes.line, 0, ...changes.content.split('\n'));
    } else if (changes.type === 'replace') {
      const startLine = changes.startLine;
      const endLine = changes.endLine;
      lines.splice(startLine, endLine - startLine + 1, ...changes.content.split('\n'));
    } else if (changes.type === 'delete') {
      lines.splice(changes.startLine, changes.endLine - changes.startLine + 1);
    }

    return lines.join('\n');
  }

  /**
   * Check if file can be safely modified
   * @param {string} filePath
   * @returns {Promise<Object>}
   */
  async canModifyFile(filePath) {
    const fullPath = path.join(this.outputDir, filePath);

    if (!await fs.pathExists(fullPath)) {
      return { canModify: true, reason: 'new_file' };
    }

    // Check if file is a known type we can parse
    const ext = path.extname(filePath);
    const supportedExtensions = [
      '.js', '.jsx', '.ts', '.tsx',  // JavaScript/TypeScript
      '.py',                          // Python
      '.json',                        // JSON (safe to parse)
      '.md', '.txt'                   // Text files
    ];

    if (!supportedExtensions.includes(ext)) {
      return {
        canModify: false,
        reason: 'unsupported_type',
        extension: ext
      };
    }

    // Check file size (don't modify huge files)
    const stats = await fs.stat(fullPath);
    if (stats.size > 1024 * 1024) { // 1MB
      return {
        canModify: false,
        reason: 'file_too_large',
        size: stats.size
      };
    }

    return { canModify: true, reason: 'modifiable' };
  }

  /**
   * Get file metadata
   * @param {string} filePath
   * @returns {Promise<Object>}
   */
  async getFileMetadata(filePath) {
    const fullPath = path.join(this.outputDir, filePath);

    if (!await fs.pathExists(fullPath)) {
      return null;
    }

    const stats = await fs.stat(fullPath);
    const content = await fs.readFile(fullPath, 'utf-8');

    return {
      path: filePath,
      size: stats.size,
      lines: content.split('\n').length,
      extension: path.extname(filePath),
      modified: stats.mtime,
      created: stats.birthtime
    };
  }

  /**
   * List all files in output directory
   * @param {string} pattern - Glob pattern (optional)
   * @returns {Promise<Array>}
   */
  async listFiles(pattern = '**/*') {
    const { glob } = require('glob');

    const files = await glob(pattern, {
      cwd: this.outputDir,
      nodir: true,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.codeswarm/**',
        '**/dist/**',
        '**/build/**'
      ]
    });

    return files;
  }

  /**
   * Create directory structure
   * @param {string} dirPath
   * @returns {Promise<void>}
   */
  async ensureDirectory(dirPath) {
    const fullPath = path.join(this.outputDir, dirPath);

    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedOutputDir = path.resolve(this.outputDir);

    if (!resolvedPath.startsWith(resolvedOutputDir)) {
      throw new FileSystemError(
        `Access denied: Path outside output directory`,
        { dirPath, outputDir: this.outputDir }
      );
    }

    await fs.ensureDir(fullPath);
  }

  /**
   * Delete file
   * @param {string} filePath
   * @param {Object} options - Delete options including lockId and agentId
   * @returns {Promise<void>}
   */
  async deleteFile(filePath, options = {}) {
    const fullPath = path.join(this.outputDir, filePath);

    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedOutputDir = path.resolve(this.outputDir);

    if (!resolvedPath.startsWith(resolvedOutputDir)) {
      throw new FileSystemError(
        `Access denied: Path outside output directory`,
        { filePath, outputDir: this.outputDir }
      );
    }

    // SECURITY: Check for symbolic links to prevent symlink attacks
    if (await fs.pathExists(fullPath)) {
      const stats = await fs.lstat(fullPath);
      if (stats.isSymbolicLink()) {
        throw new FileSystemError(
          `Security: Symbolic links are not allowed: ${filePath}`,
          { filePath, securityIssue: 'symlink_detected' }
        );
      }
    }

    // CRITICAL: Verify lock before deleting (if lockManager is available)
    if (this.lockManager && !options.bypassLock) {
      const { lockId, agentId } = options;

      if (!lockId) {
        throw new FileSystemError(
          `Lock required for file delete operation on ${filePath}`,
          { filePath }
        );
      }

      // Verify the lock is valid and held by this agent
      const lockValid = await this.lockManager.verifyLock(lockId, agentId);
      if (!lockValid) {
        throw new FileSystemError(
          `Lock verification failed for ${filePath} - file may be locked by another agent`,
          { filePath, lockId, agentId }
        );
      }
    }

    if (await fs.pathExists(fullPath)) {
      // Store in history before deleting
      const content = await fs.readFile(fullPath, 'utf-8');
      this.fileHistory.set(filePath, {
        content,
        timestamp: Date.now(),
        deleted: true
      });

      await fs.remove(fullPath);

      // Emit event for tracking
      this.emit('fileDeleted', {
        filePath,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Restore file from history
   * @param {string} filePath
   * @param {Object} options - Restore options including lockId and agentId
   * @returns {Promise<boolean>}
   */
  async restoreFromHistory(filePath, options = {}) {
    const history = this.fileHistory.get(filePath);

    if (!history) {
      return false;
    }

    // Pass through options to ensure lock verification if required
    await this.writeFile(filePath, history.content, {
      action: 'overwrite',
      ...options
    });
    return true;
  }

  /**
   * Get project structure as tree
   * @returns {Promise<Object>}
   */
  async getProjectStructure() {
    const files = await this.listFiles();
    const structure = {
      root: this.outputDir,
      files: [],
      directories: new Set()
    };

    for (const file of files) {
      structure.files.push(file);

      // Extract directory path
      const dir = path.dirname(file);
      if (dir !== '.') {
        structure.directories.add(dir);
      }
    }

    return {
      root: structure.root,
      files: structure.files,
      directories: Array.from(structure.directories).sort()
    };
  }

  /**
   * Add file to history with LRU eviction
   * @param {string} filePath
   * @param {string} content
   * @private
   */
  _addToHistory(filePath, content) {
    // Remove oldest entries if history is full
    if (this.fileHistory.size >= this.maxHistorySize) {
      // Find oldest entry
      let oldestKey = null;
      let oldestTime = Date.now();

      for (const [key, value] of this.fileHistory.entries()) {
        if (value.timestamp < oldestTime) {
          oldestTime = value.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.fileHistory.delete(oldestKey);
      }
    }

    // Add new entry
    this.fileHistory.set(filePath, {
      content,
      timestamp: Date.now()
    });
  }

  /**
   * Validate file path safety
   * @param {string} filePath
   * @returns {boolean}
   */
  isPathSafe(filePath) {
    // Check for directory traversal attempts
    if (filePath.includes('..')) {
      return false;
    }

    // Check for absolute paths
    if (path.isAbsolute(filePath)) {
      return false;
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      '/etc/', '/root/', '/home/', '~/',
      'C:\\', 'D:\\',
      '/usr/', '/var/', '/tmp/'
    ];

    return !suspiciousPatterns.some(pattern => filePath.includes(pattern));
  }
}

module.exports = FileSystemOperations;
