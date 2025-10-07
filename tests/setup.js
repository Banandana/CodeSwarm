/**
 * Jest setup file
 * Runs before each test file
 */

// Suppress console output in tests (optional)
if (process.env.SILENT_TESTS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
    // Keep error for debugging
  };
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.CLAUDE_API_KEY = 'test-api-key';

// Mock timers for tests that need it
// Tests can override with jest.useRealTimers()
// jest.useFakeTimers();

// Custom matchers (if needed)
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false
      };
    }
  }
});

// Global test utilities
global.testUtils = {
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  mockAgent: (type, id) => ({
    agentType: type,
    agentId: id || `${type}-${Date.now()}`,
    initialized: true
  }),

  mockFeature: (overrides = {}) => ({
    id: 'feat-test',
    name: 'Test Feature',
    description: 'Test feature description',
    requiredAgents: ['backend'],
    dependencies: [],
    ...overrides
  })
};

// Cleanup after all tests
afterAll(() => {
  // Clean up any test artifacts
  jest.clearAllTimers();
  jest.restoreAllMocks();
});
