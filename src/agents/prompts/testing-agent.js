/**
 * Testing Agent Prompt Templates
 * Specialized prompts for test generation and execution
 */

const TESTING_SYSTEM_PROMPT = `You are a testing specialist in the CodeSwarm autonomous code generation system.

Your role:
- Generate comprehensive test suites
- Cover unit, integration, and edge cases
- Follow testing best practices (AAA pattern, descriptive names)
- Aim for high code coverage with meaningful tests
- Write maintainable, clear test code

Guidelines:
- Use descriptive test names that explain the scenario
- Follow AAA pattern: Arrange, Act, Assert
- Test both success and failure cases
- Include edge cases and boundary conditions
- Mock external dependencies appropriately
- Keep tests isolated and independent
- Avoid testing implementation details

You MUST respond in the following JSON format:
{
  "files": [
    {
      "path": "relative/path/to/test.spec.js",
      "action": "create" | "modify",
      "content": "full test file content"
    }
  ],
  "dependencies": ["jest@29.0.0", "supertest@6.3.0"],
  "testCoverage": {
    "expectedCoverage": 85,
    "criticalPaths": ["list of critical code paths tested"]
  },
  "documentation": "brief description of test strategy"
}`;

const TASK_TEMPLATES = {
  GENERATE_UNIT_TESTS: (task) => `
Generate unit tests for the following code:

Task: ${task.description}
Target File: ${task.metadata?.targetFile || 'Not specified'}

Source Code:
\`\`\`
${task.metadata?.sourceCode || 'Not provided'}
\`\`\`

Project Context:
- Test Framework: ${task.projectInfo?.testing?.framework || 'Jest'}
- Language: ${task.projectInfo?.language || 'JavaScript'}
- Assertion Library: ${task.projectInfo?.testing?.assertions || 'Jest expect'}

Requirements:
1. Test all public methods/functions
2. Cover success cases and error cases
3. Test edge cases (null, undefined, empty, large values)
4. Test boundary conditions
5. Mock external dependencies (APIs, database, file system)
6. Use descriptive test names
7. Aim for 80%+ code coverage

Test Structure:
- Organize tests in describe blocks by function/method
- Use beforeEach/afterEach for setup/teardown
- Each test should be independent
- Follow naming: "should [expected behavior] when [condition]"

Output your response in the required JSON format.`,

  GENERATE_INTEGRATION_TESTS: (task) => `
Generate integration tests:

Task: ${task.description}
Target: ${task.metadata?.target || 'Not specified'}
Endpoints: ${JSON.stringify(task.metadata?.endpoints || [], null, 2)}

Project Context:
- Framework: ${task.projectInfo?.backend?.framework || 'Express.js'}
- Database: ${task.projectInfo?.backend?.database || 'Not specified'}
- Test Framework: ${task.projectInfo?.testing?.framework || 'Jest'}

Existing Code:
${task.existingFiles?.map(f => `- ${f.path}\n${f.content}`).join('\n\n') || 'None'}

Requirements:
1. Test API endpoints end-to-end
2. Test database operations
3. Test authentication/authorization flows
4. Test error responses (400, 401, 403, 404, 500)
5. Use test database or mocks
6. Clean up test data after each test
7. Test request validation

For REST APIs:
- Use supertest for HTTP assertions
- Test all HTTP methods (GET, POST, PUT, DELETE)
- Verify status codes and response bodies
- Test with valid and invalid data

Output your response in the required JSON format.`,

  GENERATE_E2E_TESTS: (task) => `
Generate end-to-end tests:

Task: ${task.description}
User Flow: ${task.metadata?.userFlow || 'Not specified'}

Project Context:
- Frontend: ${task.projectInfo?.frontend?.framework || 'Not specified'}
- Backend: ${task.projectInfo?.backend?.framework || 'Not specified'}
- E2E Framework: ${task.projectInfo?.testing?.e2eFramework || 'Playwright'}

Requirements:
1. Test complete user workflows
2. Simulate real user interactions
3. Test across multiple pages/components
4. Verify data persistence
5. Test happy path and error scenarios
6. Use page object pattern for maintainability

Output your response in the required JSON format.`,

  FIX_FAILING_TEST: (task) => `
Fix failing test:

Task: ${task.description}
Test File: ${task.metadata?.testFile || 'Not specified'}
Failure Message: ${task.metadata?.failureMessage || 'Not provided'}

Test Code:
\`\`\`
${task.metadata?.testCode || 'Not provided'}
\`\`\`

Source Code:
\`\`\`
${task.metadata?.sourceCode || 'Not provided'}
\`\`\`

Requirements:
1. Identify why the test is failing
2. Determine if it's a test issue or code issue
3. Fix the root cause
4. Ensure test is still meaningful after fix
5. Verify the fix doesn't break other tests

Analysis:
- Is the test correctly written?
- Is the assertion correct?
- Are mocks/stubs set up properly?
- Is the source code behaving as expected?

Output your response in the required JSON format.`,

  ADD_TEST_COVERAGE: (task) => `
Add test coverage for uncovered code:

Task: ${task.description}
Coverage Report: ${JSON.stringify(task.metadata?.coverageReport || {}, null, 2)}
Uncovered Files: ${task.metadata?.uncoveredFiles?.join(', ') || 'Not specified'}

Source Code:
${task.existingFiles?.map(f => `- ${f.path}\n${f.content}`).join('\n\n') || 'None'}

Requirements:
1. Focus on critical paths first
2. Test error handling
3. Test edge cases
4. Add integration tests if needed
5. Aim to reach 80%+ coverage
6. Don't write tests just for coverage - ensure they're meaningful

Priority Areas:
- Business logic
- Error handling
- Input validation
- Authentication/authorization
- Data transformations

Output your response in the required JSON format.`,

  CREATE_TEST_MOCKS: (task) => `
Create test mocks and fixtures:

Task: ${task.description}
Mock Targets: ${task.metadata?.mockTargets?.join(', ') || 'Not specified'}

Project Context:
- Test Framework: ${task.projectInfo?.testing?.framework || 'Jest'}
- Mocking Library: ${task.projectInfo?.testing?.mocking || 'Jest'}

Requirements:
1. Create reusable mock implementations
2. Provide realistic test data
3. Support different test scenarios
4. Make mocks easy to configure
5. Include both success and error scenarios

Mock Types:
- API responses
- Database queries
- External services
- File system operations
- Time/dates

Output your response in the required JSON format.`,

  PERFORMANCE_TESTS: (task) => `
Create performance tests:

Task: ${task.description}
Performance Target: ${task.metadata?.performanceTarget || 'Not specified'}
Load Requirements: ${task.metadata?.loadRequirements || 'Not specified'}

Project Context:
- Backend: ${task.projectInfo?.backend?.framework || 'Not specified'}
- Load Testing Tool: ${task.projectInfo?.testing?.loadTesting || 'Artillery'}

Requirements:
1. Define performance benchmarks
2. Test under expected load
3. Test under peak load
4. Identify bottlenecks
5. Measure response times
6. Test concurrent users

Metrics to Track:
- Response time (p50, p95, p99)
- Throughput (requests/second)
- Error rate
- Memory usage
- CPU usage

Output your response in the required JSON format.`
};

/**
 * Generate prompt for testing task
 * @param {Object} task - Task object
 * @param {Object} context - Additional context
 * @returns {Object} { systemPrompt, userPrompt }
 */
function generateTestingPrompt(task, context = {}) {
  const description = task.description.toLowerCase();

  let userPrompt;

  if (description.includes('unit test')) {
    userPrompt = TASK_TEMPLATES.GENERATE_UNIT_TESTS(task);
  } else if (description.includes('integration test')) {
    userPrompt = TASK_TEMPLATES.GENERATE_INTEGRATION_TESTS(task);
  } else if (description.includes('e2e') || description.includes('end-to-end')) {
    userPrompt = TASK_TEMPLATES.GENERATE_E2E_TESTS(task);
  } else if (description.includes('fix') && description.includes('test')) {
    userPrompt = TASK_TEMPLATES.FIX_FAILING_TEST(task);
  } else if (description.includes('coverage')) {
    userPrompt = TASK_TEMPLATES.ADD_TEST_COVERAGE(task);
  } else if (description.includes('mock') || description.includes('fixture')) {
    userPrompt = TASK_TEMPLATES.CREATE_TEST_MOCKS(task);
  } else if (description.includes('performance') || description.includes('load')) {
    userPrompt = TASK_TEMPLATES.PERFORMANCE_TESTS(task);
  } else {
    // Generic test generation
    userPrompt = `
Generate tests for the following:

Task: ${task.description}

Project Context:
- Test Framework: ${task.projectInfo?.testing?.framework || 'Jest'}
- Language: ${task.projectInfo?.language || 'JavaScript'}

Source Code:
${task.existingFiles?.map(f => `- ${f.path}\n${f.content}`).join('\n\n') || 'None'}

Requirements:
1. Write comprehensive tests
2. Cover success and error cases
3. Include edge cases
4. Use descriptive test names
5. Mock external dependencies
6. Aim for high code coverage

Output your response in the required JSON format.`;
  }

  return {
    systemPrompt: TESTING_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5, // Lower temperature for more consistent test generation
    maxTokens: 4000
  };
}

module.exports = {
  TESTING_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateTestingPrompt
};
