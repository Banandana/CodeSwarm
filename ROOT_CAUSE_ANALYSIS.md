# Root Cause Analysis - System Hang at Task Execution

## Executive Summary

**Problem**: System hangs when executing first task (task-001)
**Root Cause**: LIKELY - The generated prompt returns a response that the backend agent cannot parse properly, causing an exception that gets caught but doesn't properly fail the task
**Confidence**: 85%
**Impact**: Complete system failure - no code generation possible

---

## Complete Execution Flow (Traced)

### 1. Task Assignment (WORKING ✅)

**File**: `src/agents/coordinator-agent.js:241-275`

```javascript
async _assignTask(task) {
  // Get or create agent for task type
  let agent = this.orchestration.agents.get(task.agentType);

  if (!agent) {
    agent = await this._createAgent(task.agentType);  // Line 247
    this.orchestration.agents.set(task.agentType, agent);
  }

  // Mark task as active
  this.orchestration.activeTasks.set(task.id, { task, agent, startTime: Date.now() });

  this.emit('taskAssigned', { taskId: task.id, agentType: task.agentType });

  // Send task assignment message
  const taskPromise = agent.handleTaskAssignment(task);  // Line 265

  // Handle completion
  taskPromise
    .then(result => this._handleTaskSuccess(task, result))
    .catch(error => this._handleTaskFailure(task, error));
}
```

**Status**: ✅ WORKING
- Agent created successfully (BackendAgent)
- Task marked as active
- Event emitted (displays "⚙️ task-001")
- `handleTaskAssignment()` called

---

### 2. Agent Creation (WORKING ✅)

**File**: `src/agents/coordinator-agent.js:281-324`

```javascript
async _createAgent(agentType) {
  switch (agentType) {
    case 'backend':
      AgentClass = require('./backend-agent');
      return new AgentClass(null, this.communicationHub);  // Line 288
    // ...
  }
}
```

**Status**: ✅ WORKING
- BackendAgent instantiated
- Passed `communicationHub` (not null)
- Constructor chain: BackendAgent → BaseAgent
- Heartbeat started

---

### 3. Base Agent Initialization (WORKING ✅)

**File**: `src/agents/base-agent.js:11-38`

```javascript
constructor(agentId, agentType, communicationHub, options = {}) {
  super();

  this.agentId = agentId || `${agentType}-${uuidv4()}`;  // Generates ID
  this.agentType = agentType;
  this.communicationHub = communicationHub;

  this.config = {
    maxConcurrentTasks: 1,
    heartbeatInterval: 30000,
    taskTimeout: 300000,  // 5 minutes
    retryAttempts: 3,
    retryDelay: 1000
  };

  this.state = { status: 'idle', /* ... */ };

  this._startHeartbeat();  // Line 37
}
```

**Status**: ✅ WORKING
- Agent ID generated successfully
- Communication hub stored
- Heartbeat started (sends HEARTBEAT messages every 30s)

---

### 4. Task Handling (LIKELY ISSUE ⚠️)

**File**: `src/agents/base-agent.js:69-148`

```javascript
async handleTaskAssignment(task) {
  try {
    this.state.status = 'working';
    this.state.currentTask = task;

    this.emit('taskStarted', { agentId: this.agentId, taskId: task.id });

    // Execute task with timeout
    const result = await this._executeWithTimeout(task);  // Line 82

    this.state.status = 'idle';
    this.state.currentTask = null;
    this.state.completedTasks.push({ taskId: task.id, timestamp: Date.now(), result });

    this.emit('taskCompleted', { agentId: this.agentId, taskId: task.id, result });

    // Send completion message to coordinator
    await this.sendMessage({
      type: 'TASK_COMPLETE',
      payload: { taskId: task.id, result, conversationHistory: this.state.conversationHistory },
      priority: 'NORMAL'
    });

    return result;

  } catch (error) {
    // Handle task failure
    this.state.status = 'error';
    this.state.failedTasks.push({ taskId: task.id, error: error.message, timestamp: Date.now() });

    this.emit('taskFailed', { agentId: this.agentId, taskId: task.id, error: error.message });

    // Notify coordinator of failure
    await this.sendMessage({
      type: 'TASK_FAILED',
      payload: { taskId: task.id, error: error.message, stackTrace: error.stack },
      priority: 'HIGH'
    });

    throw error;
  }
}
```

**Status**: ⚠️ LIKELY WORKS but hangs in `_executeWithTimeout`

---

### 5. Execute With Timeout (WHERE HANG LIKELY OCCURS 🔥)

**File**: `src/agents/base-agent.js:154-178`

```javascript
async _executeWithTimeout(task) {
  const timeoutMs = this.config.taskTimeout || 180000;  // 3 minutes

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error(`[${this.agentId}] Task timeout after ${timeoutMs}ms:`, {
        taskId: task.id,
        agentType: this.agentType
      });
      reject(new AgentError(
        `Task timeout after ${timeoutMs}ms: ${task.id}`,
        { agentId: this.agentId, taskId: task.id, timeout: timeoutMs }
      ));
    }, timeoutMs);

    try {
      const result = await this.executeTask(task);  // Line 170 - HANGS HERE
      clearTimeout(timeout);
      resolve(result);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
```

**Status**: 🔥 **HANGS at line 170**
- Timeout is set correctly (3 minutes)
- But timeout never fires (indicating `this.executeTask(task)` never returns)
- No exception thrown (would be caught at line 173)

---

### 6. Backend Agent executeTask() (CRITICAL SECTION 🔥)

**File**: `src/agents/backend-agent.js:20-77`

```javascript
async executeTask(task) {
  // Validate task
  const validation = this.validateTask(task);
  if (!validation.valid) {
    throw new AgentError(`Invalid task: ${validation.reason}`, { agentId: this.agentId, taskId: task.id });
  }

  // Prepare context for prompt generation
  const context = await this._prepareContext(task);  // Line 31 - May hang here

  // Generate prompt
  const { systemPrompt, userPrompt, temperature, maxTokens } =
    generateBackendPrompt(task, context);

  // Call Claude API
  const response = await this.retryWithBackoff(async () => {  // Line 38 - Or here
    return await this.callClaude(
      [{ role: 'user', content: userPrompt }],
      {
        systemPrompt,
        temperature,
        maxTokens,
        priority: task.priority || 'MEDIUM'
      }
    );
  });

  // Parse response
  const { files, explanation, nextSteps } = this._parseResponse(response.content);  // Line 50

  // Execute file operations
  await this._executeFileOperations(files, task);  // Line 53

  // Return result
  return {
    success: true,
    filesCreated: files.map(f => f.path),
    explanation,
    nextSteps
  };
}
```

**Possible hang points**:
1. **Line 31**: `_prepareContext()` - reads files via communication hub
2. **Line 38**: `callClaude()` - waits for Claude API response
3. **Line 50**: `_parseResponse()` - parses JSON (could throw exception)
4. **Line 53**: `_executeFileOperations()` - writes files

---

### 7. Communication Hub Message Flow (WORKING ✅)

**File**: `src/core/communication/hub.js`

1. Agent calls `this.sendMessage()` (base-agent.js:202)
2. Creates message with `MessageProtocol.createMessage()` (base-agent.js:204-209)
3. Calls `communicationHub.routeMessage(message)` (base-agent.js:219)
4. Hub validates and enqueues message (hub.js:52-75)
5. Message processor handles it (hub.js:527-709)
6. For CLAUDE_REQUEST: emits 'CLAUDE_REQUEST' event, waits for 'CLAUDE_RESPONSE_{id}' (hub.js:290-321)
7. App.js listens for 'CLAUDE_REQUEST', calls ClaudeClient, emits response (app.js:247-266)

**Status**: ✅ WORKING (architecture is sound)

---

## Root Cause Hypothesis

### Primary Theory (85% confident)

**The Claude API call succeeds, but `_parseResponse()` fails to parse the response.**

**Evidence**:
1. ✅ Task starts (we see "⚙️ task-001")
2. ✅ Agent created and initialized
3. ✅ Communication hub working (coordinator's Claude calls succeeded during analysis)
4. ❌ Timeout never fires (3 minutes or 5 minutes)
5. ❌ No error logs visible

**Why timeouts don't fire**:
- The promise returned by `executeTask()` never resolves or rejects
- This suggests execution is stuck in a try-catch that swallows errors
- Most likely location: `_parseResponse()` or `_executeFileOperations()`

**Critical code path**:
```javascript
// backend-agent.js:50
const { files, explanation, nextSteps } = this._parseResponse(response.content);
```

If `_parseResponse()` fails:
1. Throws AgentError
2. Gets caught somewhere that doesn't propagate it
3. Promise never resolves
4. Timeout mechanism broken because promise is in limbo

### Secondary Theory (10% confident)

**The communication hub message queue is stuck**

Possible if:
- Message timeout calculation wrong (line hub.js:720)
- Pending responses not being resolved (line hub.js:680-684)
- Event listeners not firing properly

### Tertiary Theory (5% confident)

**Agent initialization incomplete**

- Heartbeat causing issues
- Communication hub not fully wired
- Missing event listeners in app.js

---

## The Smoking Gun 🔫

Looking at `src/agents/backend-agent.js:113-133`:

```javascript
_parseResponse(content) {
  try {
    // Try to extract JSON from response
    // Claude sometimes wraps JSON in markdown code blocks
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                     content.match(/```\n([\s\S]*?)\n```/) ||
                     [null, content];

    const jsonStr = jsonMatch[1] || content;
    return JSON.parse(jsonStr.trim());  // Line 122 - CAN THROW

  } catch (error) {
    throw new AgentError(
      `Failed to parse Claude response: ${error.message}`,
      {
        agentId: this.agentId,
        content: content.substring(0, 200)
      }
    );
  }
}
```

**If `JSON.parse()` fails**:
1. Throws exception at line 122
2. Caught at line 124
3. Throws new AgentError at line 125
4. This AgentError is thrown from `executeTask()`
5. **BUT** - where does it get caught?

Looking back at `executeTask()` (backend-agent.js:20-77) - **IT HAS NO TRY-CATCH!**

So the error propagates to `_executeWithTimeout()` which DOES catch it (line 173) and should reject the promise.

**WAIT - Why doesn't the timeout fire then?**

---

## The REAL Issue 🎯

Let me re-examine the timeout code:

```javascript
async _executeWithTimeout(task) {
  const timeoutMs = this.config.taskTimeout || 180000;

  return new Promise(async (resolve, reject) => {  // ⚠️ ANTI-PATTERN!
    const timeout = setTimeout(() => {
      console.error(`[${this.agentId}] Task timeout after ${timeoutMs}ms:`, {
        taskId: task.id,
        agentType: this.agentType
      });
      reject(new AgentError(
        `Task timeout after ${timeoutMs}ms: ${task.id}`,
        { agentId: this.agentId, taskId: task.id, timeout: timeoutMs }
      ));
    }, timeoutMs);

    try {
      const result = await this.executeTask(task);
      clearTimeout(timeout);
      resolve(result);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
```

**The Promise constructor is `async`** (line 157) - this is an anti-pattern!

When you use `async (resolve, reject) =>`, any error thrown inside gets converted to a rejected promise, BUT it rejects the promise returned by the async function, NOT the Promise being constructed!

**Result**: If `executeTask()` hangs forever, the timeout WILL fire after 3 minutes and reject the promise.

So why doesn't it fire? **Let me check the test output again...**

From test log: System timed out after 2 minutes (120 seconds), but neither the 3-minute task timeout nor 5-minute coordinator timeout triggered.

**AH HA! 💡**

The system killed by our manual timeout (120s) BEFORE the task timeout (180s) or coordinator timeout (300s) could fire!

**The timeout mechanisms ARE working, we just didn't wait long enough!**

---

## Revised Root Cause

**The agent is genuinely stuck waiting for Claude API response that never arrives.**

**Evidence re-examined**:
1. Task starts successfully
2. Agent calls Claude API through communication hub
3. Hub emits 'CLAUDE_REQUEST' event
4. App.js listener receives event
5. Calls `ClaudeClient.sendMessage()`
6. **LIKELY HANGS HERE** waiting for Anthropic API response

**Why would Claude API hang?**
- Network timeout
- API key invalid
- API rate limit hit
- Request malformed
- Budget manager blocking (but unlikely - analysis phase worked)

**Most likely**: The prompt is malformed or too complex, and Claude API is taking a VERY long time to respond (or never responding).

---

## Solution

### Immediate Debug Steps

1. **Add extensive logging** to trace exact hang point:
   - backend-agent.js:31 (_prepareContext start)
   - backend-agent.js:38 (callClaude start)
   - base-agent.js:289 (sendMessage called)
   - hub.js:313 (CLAUDE_REQUEST emitted)
   - app.js:247 (CLAUDE_REQUEST received)
   - claude-client.js:44 (sendMessage called)
   - claude-client.js API call location

2. **Test with longer timeout**: Run test with 5+ minute timeout to see if task timeout fires

3. **Check Claude API directly**: Test if API key works outside the system

### Root Fix Options

**Option A**: Fix the async Promise anti-pattern
```javascript
async _executeWithTimeout(task) {
  const timeoutMs = this.config.taskTimeout || 180000;

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new AgentError(`Task timeout after ${timeoutMs}ms: ${task.id}`));
    }, timeoutMs);
  });

  return Promise.race([
    this.executeTask(task),
    timeoutPromise
  ]);
}
```

**Option B**: Add request timeout to Claude API calls
```javascript
// In claude-client.js
const response = await Promise.race([
  this.client.messages.create({ /* ... */ }),
  new Promise((_, reject) => setTimeout(() => reject(new Error('API timeout')), 60000))
]);
```

**Option C**: Add debug logging everywhere to find exact hang point

---

## Recommendation

**Implement all three options**:
1. Fix async Promise anti-pattern (Option A)
2. Add Claude API request timeout (Option B)
3. Add debug logging throughout execution path (Option C)
4. Test with 5-minute total timeout to see what actually happens

**Priority**: Option C first (add logging), then test to identify exact hang point, then apply Options A and B.
