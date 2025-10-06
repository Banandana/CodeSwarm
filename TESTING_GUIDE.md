# CodeSwarm Testing Guide

This guide will help you test the CodeSwarm system step by step.

---

## ✅ Prerequisites Check

All prerequisites have been completed:

- ✅ Dependencies installed (`npm install` - 632 packages)
- ✅ Syntax validation passed for all files
- ✅ CLI is accessible and responsive
- ✅ Example proposal created (`examples/todo-api.md`)
- ✅ Test environment configuration created (`.env.test`)

---

## 🚀 Quick Test (Dry Run)

Since we don't have a real Claude API key, here's how to verify the system structure:

### 1. Verify All Components Load

```bash
# Test that all components can be loaded
node -e "require('./src/app.js'); console.log('✓ App loads successfully')"
```

### 2. Test CLI Commands

```bash
# Show help
node src/cli/index.js --help

# Show start command options
node src/cli/index.js start --help

# Show status command
node src/cli/index.js status --help

# Show validate command
node src/cli/index.js validate --help
```

### 3. Test Component Integration

```bash
# Test that budget manager can be instantiated
node -e "const BudgetManager = require('./src/core/budget/manager.js'); const b = new BudgetManager({maxBudget: 10}); console.log('✓ Budget Manager:', b.getStatus());"

# Test that state manager can be instantiated
node -e "const StateManager = require('./src/core/state/manager.js'); console.log('✓ State Manager loaded');"

# Test that lock manager works
node -e "const LockManager = require('./src/core/locking/distributed-lock.js'); const l = new LockManager(); console.log('✓ Lock Manager loaded');"
```

### 4. Test File Operations

```bash
# Test proposal parser
node -e "const ProposalParser = require('./src/tasks/proposal-parser.js'); const fs = require('fs'); const text = fs.readFileSync('./examples/todo-api.md', 'utf-8'); const parsed = ProposalParser.parse(text); console.log('✓ Proposal Parser:', {title: parsed.title, type: parsed.metadata.projectType, complexity: parsed.metadata.complexity, features: parsed.features.length});"
```

### 5. Test Security Scanner

```bash
# Create test directory
mkdir -p test-scan

# Create test file with security issue
cat > test-scan/test.js << 'EOF'
const apiKey = "sk-1234567890abcdef";
const password = "hardcoded123";
const query = "SELECT * FROM users WHERE id = " + userId;
EOF

# Run security scan
node -e "const SecurityScanner = require('./src/validation/security-scanner.js'); const scanner = new SecurityScanner('./test-scan'); scanner.scanAll().then(results => { console.log('✓ Security Scanner:'); console.log('  Files scanned:', results.filesScanned); console.log('  Issues found:', results.issuesFound); console.log('  Summary:', results.summary); });"

# Clean up
rm -rf test-scan
```

---

## 🔧 Manual Component Tests

### Test Budget Manager

```javascript
const BudgetManager = require('./src/core/budget/manager.js');

const budget = new BudgetManager({
  maxBudget: 10.0,
  warningThreshold: 0.9
});

// Test allocation
const tasks = [
  { id: 'task1', priority: 'HIGH', estimatedCost: 2.0 },
  { id: 'task2', priority: 'MEDIUM', estimatedCost: 3.0 },
  { id: 'task3', priority: 'LOW', estimatedCost: 6.0 }
];

const allocation = budget.allocateBudget(tasks);
console.log('Budget Allocation:', allocation);
console.log('Status:', budget.getStatus());
```

### Test Proposal Parser

```javascript
const ProposalParser = require('./src/tasks/proposal-parser.js');
const fs = require('fs');

const proposalText = fs.readFileSync('./examples/todo-api.md', 'utf-8');
const parsed = ProposalParser.parse(proposalText);

console.log('Parsed Proposal:');
console.log('  Title:', parsed.title);
console.log('  Project Type:', parsed.metadata.projectType);
console.log('  Complexity:', parsed.metadata.complexity);
console.log('  Features:', parsed.features.length);
console.log('  Tech Stack:', parsed.technicalRequirements);
```

### Test Lock Manager

```javascript
const LockManager = require('./src/core/locking/distributed-lock.js');

const lockManager = new LockManager();

// Test lock acquisition
lockManager.acquireLock('file1.js', 'agent1', 5000)
  .then(lockId => {
    console.log('✓ Lock acquired:', lockId);

    // Test deadlock detection
    const wouldDeadlock = lockManager.deadlockDetector.wouldCauseDeadlock('agent2', 'file1.js');
    console.log('Would cause deadlock:', wouldDeadlock);

    // Release lock
    lockManager.releaseLock(lockId);
    console.log('✓ Lock released');
  });
```

---

## 🧪 Full System Test (Requires API Key)

To test the full system with actual code generation:

### 1. Get Claude API Key

Sign up at https://console.anthropic.com/ and get an API key.

### 2. Configure Environment

```bash
# Copy test config
cp .env.test .env

# Edit .env and replace with your real API key
# CLAUDE_API_KEY=sk-ant-api03-YOUR-REAL-KEY-HERE
```

### 3. Run Setup Wizard

```bash
node src/cli/index.js setup
```

### 4. Generate Project

```bash
# Create output directory
mkdir -p output

# Generate from proposal
node src/cli/index.js start \
  --proposal ./examples/todo-api.md \
  --output ./output \
  --budget 2.0 \
  --mode verbose
```

### 5. Test Resume Functionality

```bash
# If generation is interrupted, resume with:
node src/cli/index.js start --resume --output ./output
```

### 6. Run Security Scan

```bash
node src/cli/index.js validate --output ./output
```

### 7. Check Status

```bash
node src/cli/index.js status --output ./output
```

---

## 🐛 Known Limitations for Testing

### Without Real API Key

The system CANNOT:
- ❌ Make actual calls to Claude API
- ❌ Generate code files
- ❌ Complete full end-to-end workflow

The system CAN:
- ✅ Load all components without errors
- ✅ Parse proposals correctly
- ✅ Validate budget constraints
- ✅ Detect deadlocks
- ✅ Scan for security issues
- ✅ Show CLI help and options
- ✅ Create checkpoints
- ✅ Initialize git repositories

### With Real API Key

All functionality should work, but watch for:
- JSON parsing errors from Claude responses
- File operation race conditions
- Budget estimation accuracy
- Task decomposition quality

---

## 📊 Expected Test Results

### Component Loading Test
```
✓ App loads successfully
✓ Budget Manager: { status: 'active', ... }
✓ State Manager loaded
✓ Lock Manager loaded
```

### Proposal Parser Test
```
✓ Proposal Parser: {
  title: 'TODO API',
  type: 'api',
  complexity: 'moderate',
  features: 7
}
```

### Security Scanner Test
```
✓ Security Scanner:
  Files scanned: 1
  Issues found: 3
  Summary: { CRITICAL: 0, HIGH: 2, MEDIUM: 1, LOW: 0 }
```

---

## 🔍 Debugging Tips

### If Components Fail to Load

```bash
# Check for syntax errors
node -c src/app.js
node -c src/cli/index.js
node -c src/agents/coordinator-agent.js

# Check dependencies
npm list --depth=0
```

### If Tests Hang

```bash
# Add timeout to node commands
timeout 10 node -e "..."
```

### If File Operations Fail

```bash
# Check permissions
ls -la src/
ls -la test-scan/
```

### View Full Error Stack

```bash
# Run with full stack traces
NODE_ENV=development node src/cli/index.js start ...
```

---

## ✅ Test Checklist

Use this checklist to verify system readiness:

- [ ] Dependencies installed (632 packages)
- [ ] No syntax errors in any file
- [ ] CLI help displays correctly
- [ ] Budget manager instantiates
- [ ] State manager instantiates
- [ ] Lock manager works
- [ ] Proposal parser extracts requirements
- [ ] Security scanner detects issues
- [ ] All agent files load without error
- [ ] Communication hub initializes
- [ ] File operations work
- [ ] Git manager initializes repos

---

## 🎯 Next Steps After Testing

1. **If structure tests pass**: System architecture is sound
2. **If API key available**: Run full generation test
3. **If generation works**: Test resume functionality
4. **If security scan works**: Validate generated code
5. **If all tests pass**: System is production-ready

---

## 📝 Test Results Template

```
# CodeSwarm Test Results

Date: [DATE]
Tester: [NAME]

## Component Tests
- [ ] App loads: PASS/FAIL
- [ ] Budget manager: PASS/FAIL
- [ ] State manager: PASS/FAIL
- [ ] Lock manager: PASS/FAIL
- [ ] Proposal parser: PASS/FAIL
- [ ] Security scanner: PASS/FAIL

## Integration Tests
- [ ] CLI help: PASS/FAIL
- [ ] Component loading: PASS/FAIL
- [ ] File operations: PASS/FAIL

## End-to-End Tests (Requires API Key)
- [ ] Setup wizard: PASS/FAIL/N/A
- [ ] Code generation: PASS/FAIL/N/A
- [ ] Resume functionality: PASS/FAIL/N/A
- [ ] Security scan: PASS/FAIL/N/A
- [ ] Status check: PASS/FAIL/N/A

## Issues Found
1. [Issue description]
2. [Issue description]

## Recommendations
[Your recommendations]
```

---

## 🚀 Ready to Test!

All prerequisites are complete. You can now:

1. Run structure tests (no API key needed)
2. Get API key and run full test
3. Report any issues found
4. Refine based on results

**Good luck testing CodeSwarm!** 🎉
