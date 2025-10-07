# Next Steps for CodeSwarm

## Immediate: Test the Fixes

### 1. Run Debug Test (5-minute timeout)

```bash
# Clean up any previous test data
rm -rf ./debug-test

# Run with 5-minute timeout to allow system timeouts to fire
timeout 300 node src/cli/index.js start \
  --proposal hello-world-test.md \
  --output ./debug-test \
  --mode verbose 2>&1 | tee debug.log

# After test completes (or times out), examine the logs
tail -100 debug.log
```

**What to Look For**:
- Last log message before hang shows the exact failure point
- If timeout fires: "⏱️ Task timeout after 180000ms"
- If error occurs: Stack trace with specific error

### 2. Analyze Debug Logs

Check where execution stopped:

**Scenario A: Stops at "[ClaudeClient] Making API call..."**
- **Root Cause**: Claude API not responding
- **Fix**: Add API request timeout (60s)
- **Location**: `src/api/claude-client.js:82`

**Scenario B: Stops at "[BackendAgent] Parsing response..."**
- **Root Cause**: Response format incorrect or unparseable
- **Fix**: Add better error handling in `_parseResponse()`
- **Location**: `src/agents/backend-agent.js:113-133`

**Scenario C: Stops at "[BackendAgent] Executing file operations..."**
- **Root Cause**: File write hanging via communication hub
- **Fix**: Add timeout to FILE_WRITE messages
- **Location**: `src/core/communication/hub.js:397-426`

**Scenario D: Task timeout fires**
- **Root Cause**: Confirmed - task execution taking >3 minutes
- **Fix**: Increase timeout OR investigate why task so slow

**Scenario E: Everything works**
- **Success!** Files created in `./debug-test`
- Move to more complex tests

---

## Short Term: Fix Identified Issues

### Option A: Add Claude API Request Timeout

**File**: `src/api/claude-client.js`

```javascript
// Around line 80, replace:
const response = await this.client.messages.create(request);

// With:
const apiTimeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Claude API timeout after 60s')), 60000)
);

const response = await Promise.race([
  this.client.messages.create(request),
  apiTimeout
]);
```

### Option B: Improve Response Parsing

**File**: `src/agents/backend-agent.js`

Add validation before parsing:
```javascript
_parseResponse(content) {
  try {
    // Log the response for debugging
    console.log('[BackendAgent] Raw response:', content.substring(0, 500));

    // Validate response not empty
    if (!content || content.trim().length === 0) {
      throw new AgentError('Empty response from Claude');
    }

    // Try to extract JSON...
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                     content.match(/```\n([\s\S]*?)\n```/) ||
                     [null, content];

    const jsonStr = jsonMatch[1] || content;

    // Validate JSON string not empty
    if (!jsonStr || jsonStr.trim().length === 0) {
      throw new AgentError('No JSON content found in response');
    }

    const parsed = JSON.parse(jsonStr.trim());

    // Validate parsed object has expected structure
    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new AgentError('Response missing required "files" array', { parsed });
    }

    return parsed;

  } catch (error) {
    // Log more details
    console.error('[BackendAgent] Parse error:', error.message);
    console.error('[BackendAgent] Content sample:', content.substring(0, 200));
    throw new AgentError(
      `Failed to parse Claude response: ${error.message}`,
      { agentId: this.agentId, content: content.substring(0, 200) }
    );
  }
}
```

### Option C: Add File Operation Timeout

**File**: `src/core/communication/hub.js`

Already has 30s timeout (line 420-423), but may need adjustment.

---

## Medium Term: Improve System Robustness

### 1. Add Retry Logic to Claude API Calls

Currently retries exist but may need tuning:
- Increase retry attempts for transient failures
- Add exponential backoff
- Log retry attempts

### 2. Improve Prompt Generation

**Issue**: Generated prompts may be too large or malformed
**Solution**:
- Add prompt size validation
- Test prompts with smaller max_tokens
- Add prompt templates validation

### 3. Add Circuit Breaker Pattern

Prevent cascading failures:
- Track failure rates per agent type
- Temporarily disable failing agents
- Alert when circuit breaks

### 4. Add Health Checks

```bash
# Add a health check command
node src/cli/index.js health-check

# Should verify:
# - Claude API key valid
# - API reachable
# - Budget manager working
# - File system writable
```

---

## Long Term: System Improvements

### 1. Better Error Messages

Replace technical errors with user-friendly messages:
- "Claude API not responding" instead of "Promise timeout"
- "Invalid API key" instead of "401 Unauthorized"
- "Budget exceeded" with clear next steps

### 2. Add Monitoring/Telemetry

Track:
- Success/failure rates per agent type
- Average task execution time
- Claude API response times
- Budget consumption rate

### 3. Add Resume Capability

Currently has checkpoint system but needs:
- Better checkpoint validation
- Resume from specific task
- Checkpoint cleanup (delete old checkpoints)

### 4. Add Progress Estimation

Show estimated completion time based on:
- Number of tasks remaining
- Average time per task type
- Budget remaining

### 5. Add Dry Run Mode

```bash
node src/cli/index.js start --dry-run \
  --proposal project.md \
  --output ./output

# Should:
# - Analyze proposal
# - Show task breakdown
# - Estimate cost
# - NOT make API calls
# - NOT write files
```

---

## Testing Strategy

### Phase 1: Unit Tests (Current Priority)

Test individual components in isolation:

```bash
# Test proposal parser
npm test -- proposal-parser.test.js

# Test backend agent (mock Claude API)
npm test -- backend-agent.test.js

# Test communication hub
npm test -- communication-hub.test.js
```

### Phase 2: Integration Tests

Test component interactions:

```bash
# Test agent → hub → claude flow
npm test -- integration/agent-claude.test.js

# Test checkpoint save/restore
npm test -- integration/checkpoint.test.js

# Test file operations
npm test -- integration/file-ops.test.js
```

### Phase 3: End-to-End Tests

Test complete workflows:

```bash
# Hello World (simplest)
npm test -- e2e/hello-world.test.js

# Simple API (REST endpoints)
npm test -- e2e/simple-api.test.js

# Todo App (CRUD + UI)
npm test -- e2e/todo-app.test.js
```

### Phase 4: Load/Stress Tests

Test system limits:

```bash
# Large project (20+ tasks)
npm test -- stress/large-project.test.js

# Concurrent agents (10+ agents)
npm test -- stress/concurrent-agents.test.js

# Budget limit enforcement
npm test -- stress/budget-limits.test.js
```

---

## Documentation Improvements

### 1. Add Troubleshooting Guide

**File**: `TROUBLESHOOTING.md`

Common issues and solutions:
- System hangs → Check debug logs
- API errors → Verify API key
- Budget errors → Increase budget limit
- File permission errors → Check output directory

### 2. Add Architecture Diagram

Visual representation of:
- Component relationships
- Message flow
- Data flow
- Error handling paths

### 3. Add API Documentation

For each agent:
- Expected input format
- Output format
- Error conditions
- Example usage

### 4. Add Contributing Guide

**File**: `CONTRIBUTING.md`

- How to add new agent types
- How to add new prompts
- Code style guidelines
- Testing requirements

---

## Priority Order

### CRITICAL (Do First)
1. ✅ Fix async Promise anti-pattern (DONE)
2. ✅ Add debug logging (DONE)
3. 🔄 Run debug test to identify hang point (NEXT)
4. ⏳ Apply targeted fix based on findings

### HIGH (Do Soon)
5. Add Claude API request timeout
6. Improve response parsing with validation
7. Add unit tests for critical components
8. Add health check command

### MEDIUM (Do Later)
9. Add retry logic improvements
10. Add circuit breaker pattern
11. Add monitoring/telemetry
12. Improve error messages

### LOW (Nice to Have)
13. Add dry run mode
14. Add progress estimation
15. Create architecture diagram
16. Write contributing guide

---

## Success Criteria

### Milestone 1: Basic Functionality
- ✅ System starts without errors
- ✅ Propsal parsing works
- ✅ Task decomposition works
- ⏳ **Task execution completes** (CURRENT BLOCKER)
- ⏳ Files generated correctly
- ⏳ Simple projects work end-to-end

### Milestone 2: Reliability
- Tasks complete within expected time
- Errors handled gracefully
- System recovers from failures
- Checkpoints work correctly
- Resume functionality works

### Milestone 3: Production Ready
- All tests passing
- Error messages user-friendly
- Documentation complete
- Performance acceptable
- Cost tracking accurate

---

## Quick Reference

### Run Tests
```bash
# Quick test (2 min timeout)
timeout 120 node src/cli/index.js start --proposal hello-world-test.md --output ./test --mode verbose 2>&1 | tee test.log

# Full test (5 min timeout)
timeout 300 node src/cli/index.js start --proposal hello-world-test.md --output ./test --mode verbose 2>&1 | tee test.log

# Check logs
tail -50 test.log
```

### Check Status
```bash
# View checkpoint
cat ./test/.codeswarm/.codeswarm/history/*.json | jq .

# View state
cat ./test/.codeswarm/.codeswarm/state.json | jq .

# Check budget
grep -i "budget" test.log
```

### Clean Up
```bash
# Remove test data
rm -rf ./test ./debug-test *.log

# Remove old checkpoints
rm -rf */.codeswarm

# Reset completely
git clean -fdx
```

---

## Contact & Support

If you encounter issues:
1. Check `TROUBLESHOOTING.md`
2. Review `ROOT_CAUSE_ANALYSIS.md` for technical details
3. Examine debug logs for clues
4. Open GitHub issue with logs attached

---

**Last Updated**: 2025-10-06
**Status**: Fixes applied, awaiting test results
**Next Action**: Run debug test with 5-minute timeout
