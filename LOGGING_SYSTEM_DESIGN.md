# Logging System Design - Store Logs in .codeswarm Directory

## Current State Analysis

### Current Logging Approach
The codebase currently uses:
1. **Console logging** (`console.log`, `console.error`, `console.warn`) scattered across 33+ files
2. **No centralized logging system** - direct console calls everywhere
3. **No structured logging** - free-form text messages
4. **No log persistence** - logs only go to stdout/stderr
5. **No log rotation** - N/A since nothing is persisted

### Files with Heavy Logging
```
src/core/communication/hub.js          - Message routing logs
src/core/budget/manager.js             - Budget tracking logs
src/core/state/manager.js              - State operations logs
src/agents/coordinator-agent.js        - Orchestration logs
src/agents/specification-v2/index.js   - Spec generation logs
src/api/claude-client.js               - API call logs
src/cli/index.js                       - CLI interaction logs
src/cli/progress-display.js            - User-facing progress
```

### .codeswarm Directory Structure (Current)
```
<output-directory>/.codeswarm/
├── state.json              # Checkpoint state
├── config.json             # Project configuration
├── backups/                # Project backups
│   └── backup_*.tar.gz
└── state-archive/          # Archived state (v2.3)
    └── archive_*.json
```

## Proposed Solution

### 1. Centralized Logger Service

**File:** `src/core/logging/logger.js`

```javascript
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
  }

  /**
   * Initialize logger with output directory
   */
  async initialize(outputDir) {
    this.outputDir = outputDir;
    this.logDir = path.join(outputDir, '.codeswarm', 'logs');

    // Create logs directory
    await fs.ensureDir(this.logDir);

    // Create winston logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { sessionId: this.sessionId },
      transports: [
        // Console output (for user)
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
          level: 'info'
        }),

        // Main log file (daily rotation)
        new DailyRotateFile({
          dirname: this.logDir,
          filename: 'codeswarm-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          level: 'debug'
        }),

        // Error log file
        new winston.transports.File({
          filename: path.join(this.logDir, 'error.log'),
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 5
        }),

        // Agent-specific logs
        new DailyRotateFile({
          dirname: path.join(this.logDir, 'agents'),
          filename: 'agent-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '10m',
          maxFiles: '7d',
          level: 'debug'
        }),

        // API call logs (for budget tracking)
        new winston.transports.File({
          filename: path.join(this.logDir, 'api-calls.log'),
          level: 'info',
          maxsize: 10485760,
          maxFiles: 5
        })
      ]
    });

    this.info('Logger initialized', { outputDir, sessionId: this.sessionId });
  }

  /**
   * Generate unique session ID
   */
  _generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log levels
   */
  debug(message, meta = {}) {
    if (this.logger) {
      this.logger.debug(message, meta);
    } else {
      console.log(`[DEBUG] ${message}`, meta);
    }
  }

  info(message, meta = {}) {
    if (this.logger) {
      this.logger.info(message, meta);
    } else {
      console.log(`[INFO] ${message}`, meta);
    }
  }

  warn(message, meta = {}) {
    if (this.logger) {
      this.logger.warn(message, meta);
    } else {
      console.warn(`[WARN] ${message}`, meta);
    }
  }

  error(message, meta = {}) {
    if (this.logger) {
      this.logger.error(message, meta);
    } else {
      console.error(`[ERROR] ${message}`, meta);
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
      agentId: details.agentId
    });
  }

  /**
   * Task logging
   */
  task(taskId, phase, message, meta = {}) {
    this.info(message, { ...meta, taskId, phase, component: 'task' });
  }

  /**
   * Get log statistics
   */
  async getStats() {
    if (!this.logDir) return null;

    const files = await fs.readdir(this.logDir);
    const stats = {
      totalFiles: files.length,
      totalSize: 0,
      oldestLog: null,
      newestLog: null
    };

    for (const file of files) {
      const filePath = path.join(this.logDir, file);
      const stat = await fs.stat(filePath);
      stats.totalSize += stat.size;

      if (!stats.oldestLog || stat.mtime < stats.oldestLog) {
        stats.oldestLog = stat.mtime;
      }
      if (!stats.newestLog || stat.mtime > stats.newestLog) {
        stats.newestLog = stat.mtime;
      }
    }

    return stats;
  }

  /**
   * Clean old logs
   */
  async cleanOldLogs(daysToKeep = 14) {
    if (!this.logDir) return;

    const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const files = await fs.readdir(this.logDir);

    let cleaned = 0;
    for (const file of files) {
      const filePath = path.join(this.logDir, file);
      const stat = await fs.stat(filePath);

      if (stat.mtime < cutoff) {
        await fs.remove(filePath);
        cleaned++;
      }
    }

    this.info(`Cleaned ${cleaned} old log files`);
    return cleaned;
  }
}

// Singleton instance
let globalLogger = null;

module.exports = {
  Logger,

  /**
   * Get or create global logger
   */
  getLogger() {
    if (!globalLogger) {
      globalLogger = new Logger();
    }
    return globalLogger;
  },

  /**
   * Initialize global logger
   */
  async initializeLogger(outputDir) {
    const logger = this.getLogger();
    await logger.initialize(outputDir);
    return logger;
  }
};
```

### 2. Migration Strategy

**Phase 1: Add Logger Service**
- Create `src/core/logging/logger.js`
- Add winston dependencies
- Initialize in `app.js`

**Phase 2: Update Core Components**
- Replace console logs in core/ with logger
- Pass logger through CommunicationHub
- Update all agents to use logger

**Phase 3: Enhanced Logging**
- Add structured logging metadata
- Implement log querying/searching
- Add log viewer CLI command

### 3. Updated .codeswarm Directory Structure

```
<output-directory>/.codeswarm/
├── state.json              # Checkpoint state
├── config.json             # Project configuration
├── backups/                # Project backups
│   └── backup_*.tar.gz
├── state-archive/          # Archived state
│   └── archive_*.json
└── logs/                   # NEW: Centralized logs
    ├── codeswarm-2025-10-07.log     # Main daily log
    ├── codeswarm-2025-10-06.log
    ├── error.log                     # Error-only log
    ├── api-calls.log                 # API usage tracking
    └── agents/                       # Agent-specific logs
        ├── agent-2025-10-07.log
        └── agent-2025-10-06.log
```

### 4. Integration Points

#### app.js
```javascript
const { initializeLogger } = require('./core/logging/logger');

class CodeSwarm {
  async generate(proposal, outputDir, options = {}) {
    // Initialize logger first
    this.logger = await initializeLogger(outputDir);
    this.logger.info('Starting code generation', { proposal: proposal.slice(0, 100) });

    // Pass logger to components
    await this._initialize(outputDir, options);

    // ... rest of generation
  }

  async _initialize(outputDir, options) {
    // Pass logger to all components
    this.components.hub = new CommunicationHub(
      stateManager,
      lockManager,
      budgetManager,
      { logger: this.logger }
    );

    this.components.coordinator = new CoordinatorAgent(
      'main-coordinator',
      this.components.hub,
      { logger: this.logger }
    );

    // ... other components
  }
}
```

#### CommunicationHub
```javascript
class CommunicationHub extends EventEmitter {
  constructor(stateManager, lockManager, budgetManager, options = {}) {
    super();
    this.logger = options.logger || require('./logging/logger').getLogger();
    // ... rest of constructor
  }

  async routeMessage(message) {
    this.logger.debug('Message received', {
      messageId: message.id,
      type: message.type,
      agentId: message.agentId
    });

    // Replace all console.log with this.logger.*
  }
}
```

#### Base Agent
```javascript
class BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    this.logger = options.logger || communicationHub.logger;

    this.logger.agent(agentId, 'info', 'Agent initialized', {
      type: this.constructor.name
    });
  }
}
```

### 5. Benefits

#### Before (Current State)
```javascript
console.log(`[CommunicationHub] Message received:`, { messageId: message.id });
// Issues:
// - Not persisted
// - Hard to filter
// - No structured search
// - Lost after session ends
// - Clutters console
```

#### After (Proposed)
```javascript
this.logger.debug('Message received', {
  messageId: message.id,
  type: message.type,
  agentId: message.agentId,
  component: 'hub'
});
// Benefits:
// - Persisted to disk
// - Structured JSON format
// - Searchable by component/agent
// - Daily rotation
// - Separate error logs
// - API call tracking
```

### 6. New CLI Commands

```bash
# View logs
node src/cli/index.js logs --output ./my-project

# View logs with filtering
node src/cli/index.js logs --output ./my-project --level error

# View agent-specific logs
node src/cli/index.js logs --output ./my-project --agent coordinator

# View API call history
node src/cli/index.js logs --output ./my-project --api-calls

# Clean old logs
node src/cli/index.js clean --output ./my-project --logs --days 7
```

### 7. Configuration

**.env additions:**
```bash
# Logging configuration
LOG_LEVEL=debug              # debug, info, warn, error
LOG_MAX_SIZE=20m             # Max size per log file
LOG_MAX_FILES=14d            # Keep logs for 14 days
LOG_CONSOLE_LEVEL=info       # Console output level
```

## Implementation Steps

### Step 1: Dependencies
```bash
npm install winston winston-daily-rotate-file
```

### Step 2: Create Logger Service
- Create `src/core/logging/logger.js`
- Add tests for logger

### Step 3: Update app.js
- Initialize logger at start
- Pass to all components
- Add cleanup in finally block

### Step 4: Update Core Components (Priority Order)
1. `src/core/communication/hub.js` - High logging volume
2. `src/core/budget/manager.js` - Budget tracking critical
3. `src/core/state/manager.js` - State operations tracking
4. `src/api/claude-client.js` - API call logging
5. `src/agents/coordinator-agent.js` - Orchestration logging

### Step 5: Update All Agents
- `src/agents/base-agent.js` - Add logger to base class
- Update all 7+ specialist agents
- Update specification agents

### Step 6: Add CLI Commands
- `logs` command for viewing
- Update `clean` command for log cleanup
- Update `status` command to show log stats

### Step 7: Documentation
- Update README.md with logging info
- Add logging section to APPLICATION.md
- Create troubleshooting guide using logs

## Testing Strategy

### Unit Tests
```javascript
// tests/unit/logger.test.js
describe('Logger', () => {
  test('should create log files in .codeswarm/logs', async () => {
    const logger = new Logger();
    await logger.initialize('./test-output');

    logger.info('Test message');

    const exists = await fs.pathExists('./test-output/.codeswarm/logs');
    expect(exists).toBe(true);
  });

  test('should rotate logs daily', async () => {
    // Test daily rotation logic
  });

  test('should separate error logs', async () => {
    // Test error log separation
  });
});
```

### Integration Tests
```javascript
// tests/integration/logging.test.js
describe('Logging Integration', () => {
  test('should log API calls with cost tracking', async () => {
    // Test API logging flow
  });

  test('should track agent activities', async () => {
    // Test agent logging
  });
});
```

## Performance Considerations

### Async Logging
- Use winston's async transports to avoid blocking
- Buffer logs in memory before flushing to disk
- Max buffer size: 1MB or 1000 messages

### Log Rotation
- Daily rotation to prevent large files
- Max 14 days retention by default
- Auto-cleanup on size limits (20MB per file)

### Console Output
- Keep console output at INFO level by default
- Allow DEBUG via environment variable
- Separate user-facing progress from debug logs

## Security Considerations

### Sensitive Data
- **Never log** API keys, passwords, tokens
- **Redact** email addresses in logs
- **Sanitize** user input before logging
- **Exclude** file contents from logs (log paths only)

### Log Access
- Logs stored in `.codeswarm/logs/` (same as other project data)
- No special permissions needed (same as project files)
- `.gitignore` already excludes `.codeswarm/`

## Migration Checklist

- [ ] Install winston and winston-daily-rotate-file
- [ ] Create `src/core/logging/logger.js`
- [ ] Add logger tests
- [ ] Update app.js to initialize logger
- [ ] Update CommunicationHub
- [ ] Update BudgetManager
- [ ] Update StateManager
- [ ] Update ClaudeClient (API logging)
- [ ] Update CoordinatorAgent
- [ ] Update BaseAgent
- [ ] Update all specialist agents
- [ ] Add `logs` CLI command
- [ ] Update `clean` command
- [ ] Update `status` command
- [ ] Add logging documentation
- [ ] Update .gitignore (verify .codeswarm excluded)
- [ ] Test end-to-end logging flow
- [ ] Update CHANGELOG.md

## Estimated Effort

- **Logger Service Creation**: 2-3 hours
- **Core Component Updates**: 3-4 hours
- **Agent Updates**: 2-3 hours
- **CLI Commands**: 1-2 hours
- **Testing**: 2-3 hours
- **Documentation**: 1-2 hours

**Total**: 11-17 hours

## Rollout Strategy

### Phase 1 (v2.5.0 - Core Logging)
- Implement logger service
- Update core components only
- Basic file logging

### Phase 2 (v2.6.0 - Full Integration)
- Update all agents
- Add CLI commands
- Complete migration from console

### Phase 3 (v2.7.0 - Enhanced Features)
- Log querying/searching
- Log analytics dashboard
- Performance metrics from logs
