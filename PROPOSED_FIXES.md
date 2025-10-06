# CodeSwarm System Fixes

## Fix #1: Add New Message Types for File Operations

**Problem**: READ/WRITE collision between state and file operations

**Solution**: Add dedicated message types for file operations

### Changes Required:

#### 1. Update `src/core/communication/protocol.js`
Add new message types:
```javascript
FILE_READ: 'FILE_READ',
FILE_WRITE: 'FILE_WRITE',
```

Update `requiresBudget()` to include `FILE_WRITE`.

#### 2. Update `src/agents/base-agent.js`
Change `readFile()` and `writeFile()` to use new types:
```javascript
async readFile(filePath) {
  const response = await this.sendMessage({
    type: 'FILE_READ',  // Changed from 'READ'
    payload: { filePath },
    priority: 'NORMAL'
  });
  return response.content;
}

async writeFile(filePath, content, options = {}) {
  const response = await this.sendMessage({
    type: 'FILE_WRITE',  // Changed from 'WRITE'
    payload: { filePath, content, options },
    priority: 'NORMAL'
  });
  return response;
}
```

#### 3. Update `src/core/communication/hub.js`
Add handlers for file operations:
```javascript
async _handleFileRead(message) {
  return new Promise((resolve, reject) => {
    this.once(`FILE_READ_RESPONSE_${message.id}`, (result) => {
      resolve(result);
    });
    this.once(`FILE_READ_ERROR_${message.id}`, (error) => {
      reject(error);
    });
    this.emit('FILE_READ', message);
    setTimeout(() => reject(new Error('File read timeout')), 30000);
  });
}

async _handleFileWrite(message) {
  return new Promise((resolve, reject) => {
    this.once(`FILE_WRITE_RESPONSE_${message.id}`, (result) => {
      resolve(result);
    });
    this.once(`FILE_WRITE_ERROR_${message.id}`, (error) => {
      reject(error);
    });
    this.emit('FILE_WRITE', message);
    setTimeout(() => reject(new Error('File write timeout')), 30000);
  });
}
```

Add switch cases:
```javascript
case MessageProtocol.MESSAGE_TYPES.FILE_READ:
  result = await this._handleFileRead(message);
  break;

case MessageProtocol.MESSAGE_TYPES.FILE_WRITE:
  result = await this._handleFileWrite(message);
  break;
```

#### 4. Update `src/app.js`
Change event handlers to emit responses:
```javascript
this.components.hub.on('FILE_READ', async (message) => {
  try {
    const content = await this.components.fileOps.readFile(message.payload.filePath);
    this.components.hub.emit(`FILE_READ_RESPONSE_${message.id}`, { content });
  } catch (error) {
    this.components.hub.emit(`FILE_READ_ERROR_${message.id}`, error);
  }
});

this.components.hub.on('FILE_WRITE', async (message) => {
  try {
    const result = await this.components.fileOps.writeFile(
      message.payload.filePath,
      message.payload.content,
      message.payload.options
    );
    this.components.hub.emit(`FILE_WRITE_RESPONSE_${message.id}`, result);
  } catch (error) {
    this.components.hub.emit(`FILE_WRITE_ERROR_${message.id}`, error);
  }
});
```

---

## Fix #2: Add Sonnet 3.5 Pricing

**Problem**: Missing claude-3-5-sonnet pricing

**Solution**: Add to cost table

### Changes Required:

#### Update `src/api/claude-client.js:26-30`
```javascript
this.costs = {
  'claude-3-opus-20240229': { input: 0.000015, output: 0.000075 },
  'claude-3-sonnet-20240229': { input: 0.000003, output: 0.000015 },
  'claude-3-5-sonnet-20241022': { input: 0.000003, output: 0.000015 },  // NEW
  'claude-3-haiku-20240307': { input: 0.00000025, output: 0.00000125 }
};
```

---

## Fix #3: Fix Priority String/Number Mismatch

**Problem**: Agents send priority as strings, protocol expects numbers

**Solution**: Convert string priorities to numbers

### Changes Required:

#### Update `src/agents/base-agent.js:178-187`
Add helper method:
```javascript
_convertPriority(priority) {
  const priorityMap = {
    'CRITICAL': 0,
    'HIGH': 1,
    'MEDIUM': 2,
    'NORMAL': 2,
    'LOW': 3
  };

  if (typeof priority === 'number') return priority;
  return priorityMap[priority] || 2;
}

async sendMessage(message) {
  const fullMessage = {
    id: uuidv4(),
    agentId: this.agentId,
    timestamp: Date.now(),
    ...message,
    priority: this._convertPriority(message.priority || 'NORMAL')  // Convert here
  };

  return await this.communicationHub.routeMessage(fullMessage);
}
```

---

## Fix #4: Add Message Protocol Helper Usage

**Problem**: Manual message construction bypasses protocol helpers

**Solution**: Use MessageProtocol.createMessage()

### Changes Required:

#### Update `src/agents/base-agent.js`
Import and use protocol:
```javascript
const MessageProtocol = require('../core/communication/protocol');

async sendMessage(message) {
  // Use protocol helper instead of manual construction
  const fullMessage = MessageProtocol.createMessage(
    message.type,
    this.agentId,
    message.payload,
    this._convertPriority(message.priority || 'NORMAL')
  );

  // Add any additional fields
  if (message.estimatedCost) {
    fullMessage.estimatedCost = message.estimatedCost;
  }

  return await this.communicationHub.routeMessage(fullMessage);
}
```

---

## Fix #5: Add Input Validation

**Problem**: No validation of inputs

**Solution**: Add validation helpers

### Changes Required:

#### Create `src/utils/validation.js`
```javascript
const path = require('path');

class Validator {
  static validateFilePath(filePath, baseDir) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }

    const resolved = path.resolve(baseDir, filePath);
    if (!resolved.startsWith(baseDir)) {
      throw new Error('Path traversal detected');
    }

    return resolved;
  }

  static validateMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }

    for (const msg of messages) {
      if (!msg.content) {
        throw new Error('Message must have content');
      }
    }
  }

  static validateAgentId(agentId) {
    if (!agentId || typeof agentId !== 'string') {
      throw new Error('Invalid agent ID');
    }
  }
}

module.exports = Validator;
```

#### Update file operations to use validation
In `src/filesystem/operations.js`, add path validation.

---

## Implementation Order

### Phase 1: Critical Fixes (Must do before running)
1. Fix #1 - File operation message types (30 minutes)
2. Fix #2 - Add Sonnet 3.5 pricing (2 minutes)

### Phase 2: High Priority (Should do)
3. Fix #3 - Priority conversion (10 minutes)

### Phase 3: Medium Priority (Nice to have)
4. Fix #4 - Use protocol helpers (15 minutes)
5. Fix #5 - Input validation (20 minutes)

**Total estimated time for critical fixes: 32 minutes**

---

## Testing Plan

After implementing fixes:

1. **Unit test**: Create a simple test to verify message routing
2. **Integration test**: Test with minimal proposal (Hello World server)
3. **Full test**: Run with gameboy emulator proposal

---

## Risk Assessment

### Without Fixes:
- **100% failure rate** - System will crash on file operations

### With Critical Fixes Only:
- **~80% success rate** - Basic functionality should work
- Priority issues won't break it, just slow it down
- Budget tracking works even without hub validation

### With All Fixes:
- **~95% success rate** - Robust, production-ready system
- Remaining 5% is unknown unknowns and edge cases

---

## Recommendations

1. **Implement Critical Fixes First** (Fixes #1, #2)
2. **Test with simple proposal** ($1-2)
3. **If successful, implement High Priority fixes** (Fix #3)
4. **Run full emulator generation**

This approach minimizes cost while ensuring system reliability.
