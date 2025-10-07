/**
 * Centralized Logging Service
 * Stores logs in .codeswarm/logs/ directory
 */

const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

class Logger {
  constructor(outputDir = null) {
    this.outputDir = outputDir;
    this.logDir = outputDir ? path.join(outputDir, '.codeswarm', 'logs') : null;
    this.logger = null;
    this.sessionId = this._generateSessionId();
    this.consoleOnly = !outputDir; // Fallback mode before initialization
  }

  /**
   * Initialize logger with output directory
   */
  async initialize(outputDir) {
    this.outputDir = outputDir;
    this.logDir = path.join(outputDir, '.codeswarm', 'logs');
    this.consoleOnly = false;

    // Create logs directory
    await fs.ensureDir(this.logDir);
    await fs.ensureDir(path.join(this.logDir, 'agents'));

    // Create winston logger
    const transports = [
      // Console output (for user)
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
        level: process.env.LOG_CONSOLE_LEVEL || 'info'
      }),

      // Main log file (daily rotation)
      new DailyRotateFile({
        dirname: this.logDir,
        filename: 'codeswarm-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: process.env.LOG_MAX_SIZE || '20m',
        maxFiles: process.env.LOG_MAX_FILES || '14d',
        level: process.env.LOG_LEVEL || 'debug',
        format: winston.format.json()
      }),

      // Error log file
      new winston.transports.File({
        filename: path.join(this.logDir, 'error.log'),
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 5,
        format: winston.format.json()
      }),

      // API call logs (for budget tracking)
      new winston.transports.File({
        filename: path.join(this.logDir, 'api-calls.log'),
        level: 'info',
        maxsize: 10485760,
        maxFiles: 5,
        format: winston.format.json()
      })
    ];

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { sessionId: this.sessionId },
      transports
    });

    this.info('Logger initialized', { outputDir, sessionId: this.sessionId });
    return this;
  }

  /**
   * Generate unique session ID
   */
  _generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize metadata to remove sensitive information
   */
  _sanitize(meta) {
    if (!meta || typeof meta !== 'object') return meta;

    const sanitized = { ...meta };
    const sensitiveKeys = ['apiKey', 'password', 'token', 'secret', 'authorization'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Log levels
   */
  debug(message, meta = {}) {
    const sanitizedMeta = this._sanitize(meta);

    if (this.logger) {
      this.logger.debug(message, sanitizedMeta);
    } else if (this.consoleOnly) {
      console.log(`[DEBUG] ${message}`, sanitizedMeta);
    }
  }

  info(message, meta = {}) {
    const sanitizedMeta = this._sanitize(meta);

    if (this.logger) {
      this.logger.info(message, sanitizedMeta);
    } else if (this.consoleOnly) {
      console.log(`[INFO] ${message}`, sanitizedMeta);
    }
  }

  warn(message, meta = {}) {
    const sanitizedMeta = this._sanitize(meta);

    if (this.logger) {
      this.logger.warn(message, sanitizedMeta);
    } else if (this.consoleOnly) {
      console.warn(`[WARN] ${message}`, sanitizedMeta);
    }
  }

  error(message, meta = {}) {
    const sanitizedMeta = this._sanitize(meta);

    if (this.logger) {
      this.logger.error(message, sanitizedMeta);
    } else if (this.consoleOnly) {
      console.error(`[ERROR] ${message}`, sanitizedMeta);
    }
  }

  /**
   * Agent-specific logging
   */
  agent(agentId, level, message, meta = {}) {
    this[level](message, { ...meta, agentId, component: 'agent' });
  }

  /**
   * API call logging (for budget tracking)
   */
  apiCall(details) {
    this.info('API call', {
      component: 'api',
      model: details.model,
      inputTokens: details.inputTokens,
      outputTokens: details.outputTokens,
      cost: details.cost,
      operation: details.operation,
      agentId: details.agentId,
      duration: details.duration
    });
  }

  /**
   * Task logging
   */
  task(taskId, phase, message, meta = {}) {
    this.info(message, { ...meta, taskId, phase, component: 'task' });
  }

  /**
   * Budget logging
   */
  budget(operation, details) {
    this.info(`Budget ${operation}`, {
      component: 'budget',
      operation,
      ...details
    });
  }

  /**
   * State logging
   */
  state(operation, details) {
    this.debug(`State ${operation}`, {
      component: 'state',
      operation,
      ...details
    });
  }

  /**
   * Get log statistics
   */
  async getStats() {
    if (!this.logDir) return null;

    try {
      const files = await fs.readdir(this.logDir);
      const stats = {
        totalFiles: files.length,
        totalSize: 0,
        totalSizeFormatted: '',
        oldestLog: null,
        newestLog: null,
        sessionId: this.sessionId
      };

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          stats.totalSize += stat.size;

          if (!stats.oldestLog || stat.mtime < stats.oldestLog) {
            stats.oldestLog = stat.mtime;
          }
          if (!stats.newestLog || stat.mtime > stats.newestLog) {
            stats.newestLog = stat.mtime;
          }
        }
      }

      // Format size
      if (stats.totalSize < 1024) {
        stats.totalSizeFormatted = `${stats.totalSize} B`;
      } else if (stats.totalSize < 1024 * 1024) {
        stats.totalSizeFormatted = `${(stats.totalSize / 1024).toFixed(2)} KB`;
      } else {
        stats.totalSizeFormatted = `${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`;
      }

      return stats;
    } catch (error) {
      this.error('Failed to get log stats', { error: error.message });
      return null;
    }
  }

  /**
   * Clean old logs
   */
  async cleanOldLogs(daysToKeep = 14) {
    if (!this.logDir) return 0;

    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    try {
      const files = await fs.readdir(this.logDir);
      let cleaned = 0;

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile() && stat.mtime.getTime() < cutoffTime) {
          await fs.remove(filePath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.info(`Cleaned ${cleaned} old log files`, { daysToKeep });
      }

      return cleaned;
    } catch (error) {
      this.error('Failed to clean old logs', { error: error.message });
      return 0;
    }
  }

  /**
   * Graceful shutdown
   */
  async close() {
    if (this.logger) {
      return new Promise((resolve) => {
        this.logger.end(() => {
          this.logger = null;
          resolve();
        });
      });
    }
  }
}

// Singleton instance
let globalLogger = null;

function getLogger() {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

async function initializeLogger(outputDir) {
  const logger = getLogger();
  await logger.initialize(outputDir);
  return logger;
}

async function closeLogger() {
  if (globalLogger) {
    await globalLogger.close();
    globalLogger = null;
  }
}

module.exports = {
  Logger,
  getLogger,
  initializeLogger,
  closeLogger
};
