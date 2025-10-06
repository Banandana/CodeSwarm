# CodeSwarm Architecture Review

**Purpose:** Get feedback on foundation before building agent layer
**Date:** 2025-10-06

---

## 🏗️ Core Architectural Decisions

### 1. Budget System Design

#### What I Built
```javascript
class BudgetManager {
  // Priority-based allocation
  async allocateBudget(tasks) {
    - High priority (critical path) gets budget first
    - Medium/Low scaled proportionally if insufficient
    - Throws error if critical path can't be funded
  }

  // Reservation system
  async validateOperation(operationId, estimatedCost, agentId, priority) {
    - Reserves budget before operation starts
    - Checks against hard limit + reserve
    - 90% warning threshold
    - Circuit breaker if repeated failures
  }

  // Actual tracking
  async recordUsage(operationId, actualCost) {
    - Records variance between estimated vs actual
    - Updates totals
    - Emits events for monitoring
  }
}
```

#### Questions for You

**Q1:** Should budget allocation be **more aggressive** with low-priority tasks? yes

**Q2:** Circuit breaker timeout is **30 seconds**. perfect

**Q3:** Budget analytics track per-agent and per-priority. What else would be useful? that sounds good

---

### 2. Checkpoint System Design

#### What I Built
```javascript
class CheckpointManager {
  async createCheckpoint(state) {
    // Saves to .codeswarm/state.json
    {
      currentTask,
      completedTasks: [],
      pendingTasks: [],
      failedTasks: [],
      budgetUsed,
      filesModified: [],
      filesCreated: [],
      agents: [...], // Serialized agent states
      projectInfo,
      config
    }

    // Also archives to .codeswarm/history/checkpoint_{timestamp}.json
  }
}
```

#### Questions for You

**Q4:** Checkpoint creates **2 copies** (current + history). This is perfect. Prefer more disk usage with full audit trail
- Pro: Full audit trail, can restore any checkpoint
- Con: More disk usage
- Alternative: Only keep current + last N checkpoints?

**Q5:** Agent serialization saves: `{id, type, status, currentTask, completedTasks, metadata}`
- Is this **enough context** to resume an agent? determine this yourself with best judgement.
- Should it save: conversation history, intermediate results, file drafts? save conversation history and immediate results

**Q6:** Currently **no compression** on checkpoints. Add it? no.
- Could save 70-80% disk space
- Trade-off: Slower save/load (probably negligible)

---

### 3. Lock Manager Design

#### What I Built
```javascript
class DistributedLockManager {
  async acquireLock(resourceId, agentId, timeout) {
    // Before acquiring, check for deadlock
    if (deadlockDetector.wouldCauseDeadlock(agentId, resourceId)) {
      throw DeadlockError with cycle info
    }

    // If resource locked, add to queue
    // Process queue FIFO when lock released
    // Auto-expire locks after timeout
  }
}

class DeadlockDetector {
  // Wait-for graph: agent -> resources waiting for
  // Resource ownership: resource -> owning agent
  // Detects cycles using DFS before adding wait edge
}
```

#### Questions for You

**Q7:** Deadlock detection is **proactive** (prevents before acquiring). Should it also be **reactive**? use proactive
- Currently: Refuses lock if would create cycle
- Alternative: Allow lock, periodically scan for cycles, break oldest?
- Trade-off: Proactive is safer, reactive allows more parallelism

**Q8:** Lock timeout default is **30 seconds**. Reasonable? yes
- File operations should be fast (<5s)
- But code generation could take longer
- What's acceptable wait time for an agent?

**Q9:** Lock queue is **FIFO**. Should it be **priority-based**? make it FIFO.
- Currently: First agent to request gets it when released
- Alternative: High-priority agents jump the queue?

---

### 4. Communication Hub Design

#### What I Built
```javascript
class CommunicationHub {
  async routeMessage(message) {
    1. Validate message structure
    2. Check budget if required
    3. Add to priority queue
    4. Process based on type:
       - READ: stateManager.read()
       - WRITE: verify lock, stateManager.write()
       - LOCK: lockManager.acquireLock()
       - TASK_ASSIGN: emit event for coordinator
       - etc.
    5. Return result or retry on failure
  }
}
```

#### Message Protocol
- 12 message types defined
- 4 priority levels (CRITICAL, HIGH, NORMAL, LOW)
- Retry logic (up to 3 attempts for retriable messages)
- Timeout (30s default)

#### Questions for You

**Q10:** Message queue is **priority-based with timestamp tiebreaker**. Good enough? yes
- Currently: Sorts by priority, then timestamp
- Issue: Could starve low-priority messages if high-priority keeps coming
- Alternative: Add aging (low-priority promoted over time)?

**Q11:** Max concurrent operations is **10**. How to determine optimal value? 10 is fine
- Too low: Underutilizes Claude API (slow)
- Too high: Budget exhaustion, memory issues
- Should this be **auto-tuned** based on:
  - Available budget?
  - System memory?
  - API rate limits?

**Q12:** Retry logic is **simple exponential backoff** (3 attempts, 1s → 2s → 4s delays) good
- Sufficient for transient errors?
- Should it be **smarter** (different strategies for different error types)?

---

### 5. State Management Design

#### What I Built
```javascript
class StateManager {
  // Eventual consistency model
  async write(key, value, agentId, expectedVersion) {
    - Optimistic locking using version numbers
    - Throws ConcurrencyError if version mismatch
    - Updates vector clock for consistency
    - Notifies subscribers
  }

  // Sequential operation queue
  - All operations processed in order
  - Guarantees consistency
  - Trade-off: No parallel state operations
}
```

#### Questions for You

**Q13:** State operations are **strictly sequential**. Is this too conservative? no. guarantee consistency.
- Pro: Guaranteed consistency, no race conditions
- Con: Can't parallelize independent state updates
- Alternative: Allow parallel operations for different keys?
- Risk: More complex, potential for subtle bugs

**Q14:** Optimistic locking requires agents to **know expected version**. use best judgement
- Currently: Agent must read first, then write with version
- Alternative: Add "write-if-newer" that auto-resolves?
- When should version conflicts be:
  - Hard errors (current)?
  - Auto-merged?
  - Queued for user resolution?

**Q15:** Subscription system uses **pattern matching** (string or regex) yes
- Is this flexible enough?
- Examples of patterns agents might need:
  - `"tasks/*"` - All task updates
  - `"files/*"` - All file changes
  - `/^agent-/` - All agent state
- Should it support **compound conditions** (AND/OR/NOT)?

---

### 6. Error Handling Strategy

#### What I Built
15 error types inheriting from `CodeSwarmError`:
- BudgetError, StateError, LockError, CommunicationError, etc.
- Each error includes:
  - Message
  - Code
  - Context object (arbitrary data)
  - Timestamp
  - Stack trace

#### Questions for You

**Q16:** Error context can include **sensitive data** (API keys, file contents). yes
- Should errors be **sanitized** before logging?
- What's the policy on error data retention?
- Should there be separate "user-facing" vs "debug" error messages?

**Q17:** sounds good
```
1st attempt: Same agent retries
2nd attempt: Different specialist agent (per your spec)
3rd attempt: Escalate to user
```
- Is **2 retries** the right number?
- Should retry strategy vary by error type?
  - Syntax error: Retry with same agent (simple fix)
  - Logic error: Different agent (needs different approach)
  - Budget error: Don't retry (fundamental problem)

---

## 🔄 Integration Points (Not Yet Implemented)

### 7. File Operations Strategy

#### What I Need to Decide

**Q18:** File modification detection - which strategy? A.

**Option A: Simple Heuristic**
```javascript
if (task.description.includes('rewrite') || task.description.includes('refactor')) {
  return 'FILE_LEVEL'; // Replace entire file
}
if (file.size > 200 lines) {
  return 'FUNCTION_LEVEL'; // Parse and modify functions
}
return 'FILE_LEVEL';
```

**Option B: Ask Claude**
```javascript
const analysis = await claude.analyze({
  prompt: "Should this task modify the entire file or specific functions?",
  task: task,
  file: existingCode
});
return analysis.strategy; // FILE_LEVEL or FUNCTION_LEVEL
```

**Option C: Always Function-Level for Existing Files**
```javascript
if (fileExists) {
  return 'FUNCTION_LEVEL'; // Always parse and merge
} else {
  return 'FILE_LEVEL'; // New file, write from scratch
}
```

Which approach? Or hybrid?

---

**Q19:** Function-level editing requires **AST parsing**. Language strategy?

**Option A: Start with JavaScript Only**
- Use `@babel/parser` for JS/TS
- Add Python/Go/Rust later
- Pros: Simpler, faster to MVP
- Cons: Limited language support initially

**Option B: Multi-Language from Start**
- JS: Babel
- Python: ast module
- Go: go/ast
- Rust: syn crate (via WASM or subprocess)
- Pros: Complete from day 1
- Cons: Much more complex

**Option C: Use Tree-sitter (Universal Parser)**
- Single library for all languages
- Pros: Unified API, many languages supported
- Cons: Learning curve, potential performance issues

Which approach? B.

---

**Q20:** File conflict resolution - when 2 agents need same file:

Current plan: **Upfront coordination** (lock manager)
- Agent 1 requests file lock
- Agent 2 waits
- Sequential, safe

Alternative: **Optimistic merge**
- Both agents work on copies
- Merge changes using diff/patch
- Faster, but risks conflicts

Which is better for this use case? current plan

---

### 8. Claude API Integration

#### What I Need to Decide

**Q21:** Prompt construction for agents. Which style?

**Option A: Structured**
```javascript
{
  role: "system",
  content: "You are a Backend Specialist Agent. Your task: ..."
},
{
  role: "user",
  content: "Task: Create user authentication\nContext: {json}\nRequirements: ..."
}
```

**Option B: Conversational**
```javascript
{
  role: "user",
  content: "I'm building a REST API. I need you to implement user authentication with JWT tokens. Here's what I have so far: ..."
}
```

**Option C: Template-Based**
```javascript
const prompt = templates.backend_agent.authenticate({
  task: task,
  context: context,
  existingCode: code
});
```

Which style produces best results? I prefer either A or C. use best judgement

---

**Q22:** Context window management. How much context to include?

**Minimal Context** (your spec):
```javascript
{
  parentTaskId,
  overallGoal,
  requiredFiles: [] // Only files directly needed
}
```

**Expanded Context** (alternative):
```javascript
{
  parentTaskId,
  overallGoal,
  projectStructure: {}, // Full directory tree
  dependencies: [],
  completedTasks: [], // Summary of what's done
  designDecisions: [] // Key architectural choices
}
```

What's the **right balance**?
- Too little: Agent makes inconsistent choices
- Too much: Wasted tokens, exceeds context window

Find a balance between the two.

---

**Q23:** Cost estimation accuracy. Current algorithm:
```javascript
estimatedTokens = (inputText.length / 4) * 1.1; // 10% buffer
outputTokens = maxTokens; // Conservative (use full allocation)
```

Is this too conservative? Alternative:
```javascript
outputTokens = maxTokens * 0.7; // Typical usage is 60-70%
```

Trade-off: Accuracy vs safety. If estimates are too low, budget errors. Too high, inefficient.

use the current algorithm but give a slightly bigger buffer.

---

### 9. Agent Coordination

#### What I Need to Decide

**Q24:** Coordinator agent's decision-making authority:

**Option A: Autonomous** (current design)
- Coordinator analyzes proposal
- Creates task graph
- Assigns to specialists
- User only intervenes on errors

**Option B: Interactive**
- Coordinator proposes plan
- User approves before execution
- User can modify task assignments
- More control, slower

**Option C: Hybrid**
- Autonomous for simple projects
- Interactive for complex/expensive ones
- Threshold: complexity > 8 or cost > $50?

Which approach?

do interactive for high level plan. autonomous once the plan is approved by the user.

---

**Q25:** Agent handoff protocol. When Backend Agent realizes it needs Database Agent:

**Current Design:**
```javascript
await hub.routeMessage({
  type: 'HANDOFF',
  payload: {
    task: currentTask,
    targetAgentType: 'database',
    reason: 'Need schema design before implementing models'
  }
});
```

But **who handles handoff routing**?
- Coordinator? (centralized control)
- Agents directly? (peer-to-peer)
- Hub routes, coordinator decides? (hybrid)

come up with pros and cons for each and give a recommendation to me.

---

**Q26:** Agent specialization boundaries. When is a task "too complex" for one agent?

Example: "Create user authentication system"
- Backend Agent could do it alone
- OR: Database Agent (schema) → Backend Agent (API) → Testing Agent (tests)

**Heuristic needed:**
```javascript
if (task.estimatedCost > THRESHOLD || task.subtasks.length > N) {
  decompose into subtasks;
  assign to multiple specialists;
} else {
  assign to single specialist;
}
```

What should THRESHOLD and N be?

if one reasonably believes the task quality will be degraded by letting one agent do it alone, it should be broken down.
ideally items are broken down as much as possible.

---

## 📊 Performance Considerations

### 10. System Performance

#### Questions for You

**Q27:** Latency budget. You specified <200ms for agent communication.
- Read from state: ~1-5ms ✅
- Acquire lock: ~5-20ms (no contention) ✅
- Message routing: ~10-30ms ✅
- **Total: ~16-55ms** (well under 200ms)

But **Claude API calls** take 2-10 seconds. Should the 200ms only apply to **internal communication**?

yes

**Q28:** Memory usage. No hard limits set currently.
- State manager: Unbounded Map (all key-value pairs in memory)
- Message queue: Could grow large under load
- Agent states: ~1KB per agent

Should there be **memory caps**?
- Max state entries?
- Max queue size?
- Max concurrent agents?

no. there should be a max concurrent agents value though.

**Q29:** Checkpoint frequency. "After every task" could mean:
- Very frequent for small tasks (~every 30 seconds)
- Infrequent for long tasks (~every 10 minutes)

Should checkpointing be **time-based** instead?
- Every N minutes OR after task completion, whichever comes first?


frequently, after task completion for tasks which implement a feature or section of code

---

## 🎨 User Experience Decisions

### 11. CLI & Progress Display

#### Questions for You

**Q30:** Progress display verbosity. You want "nested tree view with live agent activity":

**Verbose Mode:**
```
✓ Phase 1: Database Schema (2m 34s)
  ✓ Create user table (45s) [Database Agent]
  ✓ Create auth table (38s) [Database Agent]
⏳ Phase 2: Backend API (in progress)
  ✓ User model (1m 12s) [Backend Agent]
  ⏳ Auth controller (45s elapsed) [Backend Agent]
    → Currently: Writing JWT token validation logic
  ⏸️ API tests (pending) [Testing Agent]
⏸️ Phase 3: Documentation (pending)

Budget: $12.45 / $50.00 (24.9%)
Estimated remaining: ~15 minutes
```

**Concise Mode:**
```
[████████████░░░░░░░░] 60% - Auth controller (Backend Agent)
Budget: $12.45/$50 | Est: 15min remaining
```

Which is default? Or always show both?

show both

---

**Q31:** Interactive pauses. "After each major task" could mean different things:

**Option A: After Top-Level Tasks**
```
✓ Completed: Database Schema
⏸️ Paused. Next: Backend API (estimated $15, 8 minutes)
   Continue? [Y/n] Modify? [m] Skip? [s]
```

**Option B: After Every Task**
```
✓ Completed: Create user table
⏸️ Next: Create auth table (estimated $2, 45s)
   Continue? [Y/n]
```

Option A is less interrupting but less control. Which?

interactive pauses after top level tasks

---

**Q32:** Dry-run output format. You want "task breakdown + estimated file changes + budget validation":

**Option A: Simple List**
```
Dry Run Results:
Tasks: 12 total, 5 parallel
Budget: $42.50 estimated (85% of limit)
Files: 8 new, 3 modified
Estimated time: 25 minutes
```

**Option B: Detailed Tree**
```
Phase 1: Database (3 tasks, $8, 5min)
  - Create user schema (1 file: schema/user.sql)
  - Create auth schema (1 file: schema/auth.sql)
  - Migration script (1 file: migrations/001_init.sql)
Phase 2: Backend (5 tasks, $22, 12min)
  - User model (1 file: models/user.js)
  - Auth controller (1 file: controllers/auth.js, modify: routes/index.js)
  ...
Total: $42.50, 25min, 8 new files, 3 modified
```

Which level of detail?

detailed

---

## 🔒 Security & Safety

### 12. Security Considerations

#### Questions for You

**Q33:** API key storage. Currently uses `.env` file (per-project).
- Is this secure enough?
- Alternative: OS keychain integration?
- What about shared/team projects?

just use .env

**Q34:** Generated code security. Should CodeSwarm scan for:
- Hardcoded secrets/passwords?
- SQL injection vulnerabilities?
- XSS vulnerabilities?
- Or trust that agents generate secure code?

scan for these things and generate a report in the output

**Q35:** File system access boundaries. Should CodeSwarm be **sandboxed**?
- Currently: Can read/write anywhere in output directory
- Alternative: Whitelist only specific directories?
- What about reading system files for context (package.json, etc.)?

codeswarm should only be able to read/write to the output directory. that should be considered a working directory.

---

## 🎯 Decision Priority

### Must Decide Before Continuing

**Critical (blocking agent implementation):**
- Q18: File modification strategy
- Q19: AST parsing approach
- Q21: Prompt construction style
- Q24: Coordinator authority level
- Q25: Handoff protocol routing

**High (affects user experience):**
- Q1: Budget allocation strategy
- Q8: Lock timeout values
- Q10: Message queue fairness
- Q30: Progress display verbosity
- Q31: Interactive pause frequency

**Medium (can use defaults, refine later):**
- Q2, Q3, Q4, Q6, Q7, Q9, Q11-17, Q22-23, Q26-29, Q32-35

---

## 💭 My Recommendations

Based on the implementation so far, here's what I'd suggest:

1. **File Operations:** Option C (Always function-level for existing) - Safest
2. **AST Parsing:** Option A (JavaScript first) - Faster to MVP
3. **Prompt Style:** Option C (Template-based) - Most maintainable
4. **Coordinator:** Option C (Hybrid) - Best balance
5. **Handoff Routing:** Coordinator decides - Centralized control
6. **Progress Display:** Verbose by default, flag for concise
7. **Interactive Pauses:** After top-level tasks - Less interrupting

But I want **your input** before proceeding!

look at my comments and determine from your recommendations and what I've written what to do.

---

## 📋 What I Need From You

Please review and provide guidance on:

1. **Critical decisions** (Q18, Q19, Q21, Q24, Q25) - Needed to continue
2. **Your priorities** - Which features matter most?
3. **Any concerns** about current architecture
4. **Preferences** on UX questions (Q30-Q32)
5. **Timeline** - Should I prioritize MVP or completeness?

---

**Status:** Awaiting feedback before implementing agent layer
**Next:** Based on your answers, I'll implement agents using consistent patterns from foundation
