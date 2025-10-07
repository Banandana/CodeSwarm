# State Management & Checkpoint Analysis

## Problem Statement

The state.json and checkpoint files contain empty arrays for task tracking (`completedTasks`, `pendingTasks`, `failedTasks`), even though the system is actively executing tasks. This breaks crash recovery functionality since task progress cannot be resumed.

## Root Cause Analysis

### 1. Data Flow Mismatch

The checkpoint system has a **structural mismatch** between what data exists and what data gets saved:

```
CoordinatorAgent.orchestration {
  projectPlan: {...},
  features: [...],
  featureCoordinators: Map(),
  taskQueue: [],           // ← Task info lives here
  activeTasks: Map(),      // ← And here
  completedTasks: [],      // ← And here
  failedTasks: []          // ← And here
}

TaskExecutor._checkpoint() {
  orchestration: coordinatorState.orchestration,  // ← Passes full orchestration
  execution: {...},
  budgetUsed: ...,
  budgetRemaining: ...
}

CheckpointManager.createCheckpoint(state) {
  checkpoint.state = {
    completedTasks: state.completedTasks || [],   // ← WRONG! Expects flat array
    pendingTasks: state.pendingTasks || [],       // ← WRONG! Expects flat array
    failedTasks: state.failedTasks || [],         // ← WRONG! Expects flat array
    // ... ignores state.orchestration entirely!
  }
}
```

**The Issue**:
- TaskExecutor passes `state.orchestration` with nested structure
- CheckpointManager expects flat `state.completedTasks`, `state.pendingTasks`
- CheckpointManager **completely ignores** `state.orchestration`
- Result: Empty arrays saved to checkpoint

### 2. Hierarchical Task Architecture

The system uses a **two-level hierarchy**:

```
CoordinatorAgent (main)
├─ Features (high level)
│  ├─ Feature 1: "ROM Loading"
│  ├─ Feature 2: "CPU Core"
│  └─ Feature 3: "PPU Graphics"
│
└─ Feature Coordinators (per-feature)
   ├─ FeatureCoordinator for Feature 1
   │  └─ Tasks: [task-001, task-002, task-003, ...]
   ├─ FeatureCoordinator for Feature 2
   │  └─ Tasks: [task-004, task-005, task-006, ...]
   └─ FeatureCoordinator for Feature 3
      └─ Tasks: [task-007, task-008, task-009, ...]
```

**Tasks are distributed across multiple FeatureCoordinators**, not stored in a single flat list.

### 3. Task Location Mapping

| Component | What It Tracks | Current State |
|-----------|---------------|---------------|
| `CoordinatorAgent.orchestration.features` | List of features to build | ✅ Saved in checkpoints |
| `CoordinatorAgent.orchestration.featureCoordinators` | Map of FeatureCoordinator instances | ✅ Serialized (lines 828-833) |
| `FeatureCoordinator.tasks` | Per-feature task list | ❌ **NOT EXTRACTED** |
| `CoordinatorAgent.orchestration.completedTasks` | Global completed task IDs | ✅ Saved (line 835) |
| `CoordinatorAgent.orchestration.taskQueue` | Pending tasks | ✅ Saved (line 834) |
| `CheckpointManager` flat arrays | Expected by checkpoint schema | ❌ **NOT POPULATED** |

## Specific Code Issues

### Issue 1: CheckpointManager Ignores Orchestration Structure

**File**: `src/core/state/checkpoint.js:39-52`

```javascript
async createCheckpoint(state) {
  const checkpoint = {
    state: {
      currentTask: state.currentTask,
      completedTasks: state.completedTasks || [],      // ← Expects state.completedTasks
      pendingTasks: state.pendingTasks || [],          // ← Expects state.pendingTasks
      failedTasks: state.failedTasks || [],            // ← Expects state.failedTasks
      // ... no handling of state.orchestration
    }
  };
}
```

**Problem**: Expects flat arrays but receives nested `state.orchestration` object.

### Issue 2: TaskExecutor Passes Wrong Structure

**File**: `src/tasks/task-executor.js:202-228`

```javascript
async _checkpoint(type, additionalData = {}) {
  const coordinatorState = this.coordinator.serialize();

  const state = {
    orchestration: coordinatorState.orchestration,  // ← Nested structure
    execution: {...},
    budgetUsed: ...,
    budgetRemaining: ...
  };

  await this.checkpointManager.createCheckpoint(state);  // ← Mismatch!
}
```

**Problem**: Passes nested structure, but CheckpointManager expects flat structure.

### Issue 3: No Task Extraction from Orchestration

The checkpoint system never **extracts and flattens** task data from the orchestration hierarchy.

## Impact

### Current Behavior
1. ✅ System runs and executes tasks successfully
2. ✅ Budget tracking works
3. ❌ Checkpoints save empty task arrays
4. ❌ Cannot resume from checkpoint (would lose all task progress)
5. ❌ No visibility into task status from state files

### After Crash
If the system crashes:
- Budget info: **Recoverable** ✅
- Files created: **Recoverable** ✅
- Task progress: **LOST** ❌
- Which tasks completed: **LOST** ❌
- Which tasks pending: **LOST** ❌
- Which tasks failed: **LOST** ❌

## Solution Design

### Option 1: Fix CheckpointManager to Extract Orchestration Data (RECOMMENDED)

**Pros**:
- Minimal changes to existing architecture
- Maintains current coordinator structure
- Single point of fix

**Cons**:
- CheckpointManager needs to understand orchestration structure

**Implementation**:
```javascript
// src/core/state/checkpoint.js
async createCheckpoint(state) {
  // Extract task data from orchestration if present
  let completedTasks = state.completedTasks || [];
  let pendingTasks = state.pendingTasks || [];
  let failedTasks = state.failedTasks || [];

  if (state.orchestration) {
    // Extract from main coordinator
    completedTasks = state.orchestration.completedTasks || [];
    failedTasks = state.orchestration.failedTasks || [];
    pendingTasks = state.orchestration.taskQueue || [];

    // Also extract tasks from feature coordinators
    if (state.orchestration.featureCoordinators) {
      state.orchestration.featureCoordinators.forEach(fc => {
        if (fc.coordinatorState?.orchestration) {
          completedTasks.push(...(fc.coordinatorState.orchestration.completedTasks || []));
          failedTasks.push(...(fc.coordinatorState.orchestration.failedTasks || []));
          pendingTasks.push(...(fc.coordinatorState.orchestration.taskQueue || []));
        }
      });
    }
  }

  const checkpoint = {
    state: {
      completedTasks,
      pendingTasks,
      failedTasks,
      orchestration: state.orchestration,  // Also save full structure
      execution: state.execution,
      // ...
    }
  };
}
```

### Option 2: Change TaskExecutor to Flatten Data

**Pros**:
- CheckpointManager stays simple
- TaskExecutor controls checkpoint format

**Cons**:
- TaskExecutor needs to traverse orchestration tree
- More complex implementation
- Multiple changes needed if structure changes

### Option 3: Dual Storage (Both Flat and Nested)

**Pros**:
- Maximum compatibility
- Easy to query both ways
- Migration path for future changes

**Cons**:
- Data duplication
- Larger checkpoint files
- Two sources of truth (sync issues)

## Recommended Fix

**Option 1** is recommended because:
1. Single point of change (CheckpointManager)
2. Maintains architectural separation (coordinator doesn't need to know checkpoint format)
3. Can aggregate tasks from all feature coordinators
4. Backward compatible (won't break existing code)

## Implementation Steps

1. **Update CheckpointManager.createCheckpoint()**
   - Extract tasks from `state.orchestration.completedTasks`
   - Extract tasks from `state.orchestration.taskQueue`
   - Extract tasks from `state.orchestration.failedTasks`
   - Aggregate tasks from all `state.orchestration.featureCoordinators`
   - Save both flat arrays (for compatibility) and full orchestration structure

2. **Update CheckpointManager.loadLatestCheckpoint()**
   - Verify task arrays are populated
   - Add migration for old checkpoints (empty arrays)

3. **Add Task Aggregation Helper**
   ```javascript
   _aggregateTasks(orchestration) {
     // Collect all tasks from main coordinator and feature coordinators
   }
   ```

4. **Update CoordinatorAgent.restore()**
   - Ensure it properly rebuilds feature coordinators from checkpoint
   - Verify task queue restoration works

5. **Test Recovery**
   - Create checkpoint mid-execution
   - Kill process
   - Resume from checkpoint
   - Verify tasks continue from correct point

## Testing Checklist

- [ ] Checkpoints contain non-empty task arrays
- [ ] All completed tasks are recorded
- [ ] All pending tasks are recorded
- [ ] Failed tasks are recorded
- [ ] Feature coordinator states are preserved
- [ ] Resume from checkpoint restores task queue
- [ ] Resume from checkpoint doesn't re-execute completed tasks
- [ ] Budget tracking remains accurate after resume
- [ ] File tracking remains accurate after resume

## File Changes Required

1. `src/core/state/checkpoint.js` (primary changes)
   - Lines 39-52: Update checkpoint structure creation
   - Add task aggregation helper method

2. `src/agents/coordinator-agent.js` (verification only)
   - Lines 822-843: Verify serialize() is complete
   - Lines 849-870: Verify restore() is complete

3. `src/tasks/task-executor.js` (no changes needed)
   - Already passing correct structure

## Risk Assessment

**Low Risk** - The fix is isolated to checkpoint creation and doesn't affect runtime execution logic. Worst case: checkpoints still empty (current state).

**High Value** - Enables proper crash recovery, which is a critical feature for long-running code generation tasks.
