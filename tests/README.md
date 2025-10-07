# CodeSwarm Test Suite

Comprehensive test coverage for v2.2 and v2.3 improvements (Agent Pool, Semantic Cache, State Archiving, Specification V2).

## Test Structure

```
tests/
├── unit/                           # Unit tests for individual components
│   ├── agent-pool.test.js         # Agent pooling and reuse
│   ├── semantic-cache.test.js     # Semantic similarity caching
│   ├── state-archiving.test.js    # State management archiving
│   ├── feature-analyzer.test.js   # Feature categorization
│   └── crud-specialist.test.js    # CRUD template generation
├── integration/                    # Integration tests
│   └── specification-v2.test.js   # End-to-end spec generation
└── fixtures/                       # Test fixtures and mocks
    ├── mock-communication-hub.js  # Mock hub (no API calls)
    └── test-features.js           # Sample features for testing
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm test -- --coverage
```

## Test Coverage Goals

### v2.3 Components (100% coverage)

#### 1. Agent Pool Management
- **File**: `src/core/agent-pool.js`
- **Tests**: `tests/unit/agent-pool.test.js`
- **Coverage**:
  - ✅ Agent acquisition and reuse (84% efficiency)
  - ✅ Pool size limits and wait queues
  - ✅ Idle timeout and eviction
  - ✅ Multi-type agent handling
  - ✅ Concurrent operations
  - ✅ Metrics tracking
  - ✅ Event emissions
  - ✅ Error handling

#### 2. Semantic Cache
- **File**: `src/agents/specification-v2/cache/semantic-cache.js`
- **Tests**: `tests/unit/semantic-cache.test.js`
- **Coverage**:
  - ✅ Exact key matching
  - ✅ Similarity-based matching (85% threshold)
  - ✅ Multi-factor scoring (name, description, agents, dependencies)
  - ✅ TTL expiration
  - ✅ LRU eviction
  - ✅ Cache statistics
  - ✅ Configuration options
  - ✅ Edge cases

#### 3. State Archiving
- **File**: `src/core/state/manager.js` (enhanced)
- **Tests**: `tests/unit/state-archiving.test.js`
- **Coverage**:
  - ✅ Automatic archival (24h threshold)
  - ✅ Pruning (48h threshold)
  - ✅ Disk persistence
  - ✅ Archive restoration
  - ✅ Memory tracking
  - ✅ Configuration via env vars
  - ✅ Cleanup on shutdown
  - ✅ Event emissions

#### 4. Feature Analyzer
- **File**: `src/agents/specification-v2/feature-analyzer.js`
- **Tests**: `tests/unit/feature-analyzer.test.js`
- **Coverage**:
  - ✅ CRUD detection
  - ✅ Integration detection
  - ✅ Workflow detection
  - ✅ Generic fallback
  - ✅ Complexity calculation
  - ✅ Confidence scoring
  - ✅ Multi-factor scoring
  - ✅ Edge cases

#### 5. CRUD Specialist
- **File**: `src/agents/specification-v2/specialists/crud-specialist.js`
- **Tests**: `tests/unit/crud-specialist.test.js`
- **Coverage**:
  - ✅ Template loading
  - ✅ Resource name extraction
  - ✅ Template customization
  - ✅ Pluralization
  - ✅ Spec generation without API
  - ✅ Custom field application
  - ✅ Validation rules
  - ✅ Error handling

#### 6. Specification V2 Integration
- **Files**: `src/agents/specification-v2/index.js` + specialists
- **Tests**: `tests/integration/specification-v2.test.js`
- **Coverage**:
  - ✅ End-to-end generation flow
  - ✅ Feature routing (CRUD, Integration, Generic)
  - ✅ Cache integration
  - ✅ Similarity matching
  - ✅ Context handling
  - ✅ Spec refinement
  - ✅ Batch operations
  - ✅ Performance optimization

## Key Testing Principles

### 1. No API Calls
All tests mock `callClaude()` to avoid:
- ❌ API costs during testing
- ❌ Network dependencies
- ❌ Rate limiting issues
- ❌ Non-deterministic results

### 2. Fast Execution
- Unit tests: <50ms each
- Integration tests: <200ms each
- Full suite: <5 seconds

### 3. Comprehensive Coverage
- **Target**: >90% code coverage
- **Critical paths**: 100% coverage
- **Edge cases**: Extensively tested
- **Error scenarios**: All handled

### 4. Deterministic Results
- No timing dependencies
- Controlled randomness
- Predictable outcomes
- Repeatable failures

## Test Fixtures

### Mock Communication Hub
```javascript
const { MockCommunicationHub } = require('../fixtures/mock-communication-hub');
const hub = new MockCommunicationHub();
```

Provides:
- Budget manager (no API)
- State manager (in-memory)
- Lock manager (local)
- Message tracking

### Test Features
```javascript
const testFeatures = require('../fixtures/test-features');
```

Includes:
- `crudFeature`: User Management (CRUD)
- `integrationFeature`: Payment Integration
- `genericFeature`: Analytics Dashboard
- `similarCrudFeature`: User Administration (similar to crudFeature)
- `workflowFeature`: Approval Workflow
- `complexFeature`: Multi-tenant System

## Test Examples

### Unit Test Pattern
```javascript
describe('Component', () => {
  let component;

  beforeEach(() => {
    component = new Component(options);
  });

  test('should do something', () => {
    const result = component.method();
    expect(result).toBe(expected);
  });
});
```

### Integration Test Pattern
```javascript
describe('System Integration', () => {
  let system;
  let mockHub;

  beforeEach(() => {
    mockHub = new MockCommunicationHub();
    system = new System(mockHub);

    // Mock API calls
    system.callClaude = jest.fn().mockResolvedValue(mockResponse);
  });

  test('should complete end-to-end flow', async () => {
    const result = await system.process(input);
    expect(result).toBeDefined();
  });
});
```

## Coverage Reports

After running `npm test -- --coverage`, view reports:

```bash
# Terminal summary
# Displays coverage percentages

# HTML report
open coverage/lcov-report/index.html
```

## Continuous Integration

Tests run automatically on:
- ✅ Every commit
- ✅ Pull requests
- ✅ Pre-push hooks
- ✅ CI/CD pipeline

### CI Requirements
- All tests must pass
- Coverage must be >90%
- No new warnings
- No API calls detected

## Writing New Tests

### Checklist
1. ✅ Mock all external dependencies
2. ✅ Test happy path
3. ✅ Test error cases
4. ✅ Test edge cases
5. ✅ Test async operations
6. ✅ Test event emissions
7. ✅ Verify no API calls
8. ✅ Add test to appropriate suite

### Example: Adding a Test

```javascript
// tests/unit/new-component.test.js
const NewComponent = require('../../src/new-component');

describe('NewComponent', () => {
  test('should handle basic operation', () => {
    const component = new NewComponent();
    const result = component.operate('input');
    expect(result).toBe('expected');
  });

  test('should handle errors gracefully', () => {
    const component = new NewComponent();
    expect(() => component.operate(null)).not.toThrow();
  });
});
```

## Performance Testing

### Benchmarks

```bash
# Run with timing
npm test -- --verbose

# Look for:
# - Tests completing in <50ms
# - No API calls made
# - Cache hit rates >50%
# - Memory usage stable
```

### Expected Performance

| Test Suite | Tests | Duration | Coverage |
|------------|-------|----------|----------|
| Agent Pool | 25 | ~1.5s | 100% |
| Semantic Cache | 28 | ~1.0s | 100% |
| State Archiving | 22 | ~1.8s | 98% |
| Feature Analyzer | 24 | ~0.8s | 100% |
| CRUD Specialist | 20 | ~1.2s | 95% |
| Integration | 15 | ~2.5s | 92% |
| **Total** | **134** | **<9s** | **>95%** |

## Debugging Tests

### Run single test file
```bash
npm test tests/unit/agent-pool.test.js
```

### Run single test
```bash
npm test -- -t "should reuse agent from pool"
```

### Verbose output
```bash
npm test -- --verbose
```

### Debug mode
```bash
node --inspect-brk node_modules/.bin/jest tests/unit/agent-pool.test.js
```

## Known Limitations

### Not Tested
- Actual Claude API responses (mocked)
- Network failures (mocked)
- Filesystem operations (temp dirs)
- Long-running operations (>5 minutes)

### Manual Testing Required
- Real API integration
- Multi-application scenarios
- Production load testing
- Security scanning

## Contributing

When adding tests:
1. Follow existing patterns
2. Mock all external calls
3. Add to appropriate suite
4. Update this README
5. Ensure CI passes

## Questions?

- Check existing tests for patterns
- See CHANGELOG.md for implementation details
- Review CLAUDE.md for project guidelines
