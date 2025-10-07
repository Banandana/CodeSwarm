# Hello World Test - Budget Tracking Bug Found

## Summary
Running a simple hello world test revealed a critical regression introduced by fix B2 (budget untracked operations). The system is rejecting valid operations that were properly validated.

## Bug Found During Testing

### Error
```
[ClaudeClient] API call completed in 15023ms
[ClaudeClient] Error in sendMessage: {
  operationId: '1de22ce8-5ef9-4226-8608-375043cc9858',
  error: 'Cannot record usage for untracked operation: 1de22ce8-5ef9-4226-8608-375043cc9858...',
}
```

### Root Cause
The fix for B2 made `recordUsage()` strictly reject untracked operations. However, there's a mismatch in how budget operations are tracked:

1. **Hub-level validation** (removed): Hub used to validate budget using `message.id` as the operation ID
2. **ClaudeClient validation** (added): ClaudeClient now validates budget using its own UUID as operation ID
3. **Mismatch**: The operation validated by ClaudeClient is the one that needs to be recorded, but something is clearing or not storing it properly

### Test Command
```bash
node src/cli/index.js start --proposal ./test-output/proposal.yaml --output ./test-output --budget 15.0
```

### Test Proposal
```yaml
name: hello-world-test
description: Simple hello world test
requirements:
  - Create a hello.js file
  - File should print "Hello, World!" to the console
```

## Fixes Applied (Partial)

###1. Added `estimatedCost` to CLAUDE_REQUEST messages
**File**: `src/agents/base-agent.js`
- Added `_estimateClaudeCost()` method
- Modified `callClaude()` to calculate and include `estimatedCost` in message

### 2. ClaudeClient now always validates its own operations
**File**: `src/api/claude-client.js`
- Removed logic that skipped validation when `operationId` was passed in
- Always creates own UUID for operation tracking
- Always calls `validateOperation()` before API call
- Always calls `recordUsage()` after API call
- Uses `releaseReservation()` in error handlers (not `recordUsage(0)`)

### 3. Removed duplicate budget validation from Hub
**File**: `src/core/communication/hub.js`
- Removed budget validation logic from `routeMessage()`
- Added comment explaining ClaudeClient handles its own validation

### 4. Removed operation ID passing in app.js
**File**: `src/app.js`
- Removed code that passed `message.id` as `operationId` to ClaudeClient
- Simplified claudeRequestHandler

## Remaining Issue

**Status**: ❌ NOT RESOLVED

The test still fails with "untracked operation" errors. The API calls complete successfully, indicating:
- `validateOperation()` is being called and succeeding
- API call happens and completes
- `recordUsage()` is called but fails

**Hypothesis**: Something is happening between validate and recordUsage that clears the operation from the budget manager's tracking map. Possible causes:
1. Multiple BudgetManager instances?
2. Operation being deleted prematurely?
3. Timing/race condition?
4. Mutex not protecting the entire flow?

## Test Results

### Coordinator Agent
✅ Works correctly - able to analyze proposal and create execution plan

### Feature Coordinator Agent
❌ Fails with untracked operation error

### Specialist Agents
❌ Not reached due to feature coordinator failure

## Next Steps

1. Add debug logging to track operation lifecycle:
   - Log when operation is stored in validateOperation()
   - Log when operation is looked up in recordUsage()
   - Log if operation map is being cleared

2. Verify single BudgetManager instance across all agents

3. Check if there's a cleanup/timeout mechanism clearing operations

4. Consider adding operation expiration tracking to detect premature cleanup

## Production Impact

🔴 **CRITICAL**: This is a regression that breaks ALL agent Claude API calls. The system cannot function without being able to track budget properly.

**Recommended Action**:
- Investigate operation lifecycle immediately
- May need to temporarily relax B2 fix validation
- Or redesign budget tracking to be more resilient

## Files Modified
- `src/agents/base-agent.js` - Added cost estimation
- `src/api/claude-client.js` - Fixed budget validation flow
- `src/app.js` - Simplified Claude request handling
- `src/core/communication/hub.js` - Removed duplicate validation
- `test-output/proposal.yaml` - Hello world test proposal

## Testing Notes
- Budget set to $15 (above $10 minimum reserve)
- Simple single-file generation task
- First coordinator call succeeds, subsequent feature coordinator fails
- Consistent failure pattern across retries
