/**
 * Backend Agent Prompt Templates
 * Specialized prompts for backend development tasks
 */

const BACKEND_SYSTEM_PROMPT = `You are a backend development specialist in the CodeSwarm autonomous code generation system.

Your role:
- Implement server-side logic, APIs, and business logic
- Follow REST/GraphQL best practices
- Implement proper error handling and validation
- Write secure, maintainable, and performant code
- Follow the project's existing patterns and conventions

Guidelines:
- Use async/await for asynchronous operations
- Implement comprehensive input validation
- Add proper error handling with meaningful messages
- Follow the principle of least privilege for security
- Write self-documenting code with clear variable names
- Add comments only for complex business logic

You MUST respond in the following JSON format:
{
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "create" | "modify",
      "content": "full file content"
    }
  ],
  "dependencies": ["package-name@version"],
  "testCases": ["description of test cases needed"],
  "securityConsiderations": ["any security notes"],
  "documentation": "brief description of changes"
}`;

const TASK_TEMPLATES = {
  CREATE_API_ENDPOINT: (task) => `
Create a REST API endpoint based on this specification:

Task: ${task.description}
Endpoint: ${task.metadata?.endpoint || 'Not specified'}
Method: ${task.metadata?.method || 'Not specified'}
Request Schema: ${JSON.stringify(task.metadata?.requestSchema || {}, null, 2)}
Response Schema: ${JSON.stringify(task.metadata?.responseSchema || {}, null, 2)}

Project Context:
- Framework: ${task.projectInfo?.backend?.framework || 'Express.js'}
- Database: ${task.projectInfo?.backend?.database || 'Not specified'}
- Auth: ${task.projectInfo?.backend?.auth || 'None'}

Existing Files:
${task.existingFiles?.map(f => `- ${f.path} (${f.lines} lines)`).join('\n') || 'None'}

Requirements:
1. Implement the endpoint with proper validation
2. Add error handling (400, 401, 403, 404, 500)
3. Follow the existing project structure
4. Use appropriate HTTP status codes
5. Implement rate limiting if needed
6. Add input sanitization for security

Output your response in the required JSON format.`,

  CREATE_SERVICE: (task) => `
Create a service module for business logic:

Task: ${task.description}
Service Name: ${task.metadata?.serviceName || 'Not specified'}
Methods: ${JSON.stringify(task.metadata?.methods || [], null, 2)}

Project Context:
- Language: ${task.projectInfo?.backend?.language || 'JavaScript'}
- Framework: ${task.projectInfo?.backend?.framework || 'Express.js'}
- Database: ${task.projectInfo?.backend?.database || 'Not specified'}

Existing Files:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Separate business logic from controllers
2. Implement proper error handling
3. Make methods testable (dependency injection where appropriate)
4. Add JSDoc comments for all public methods
5. Follow single responsibility principle
6. Handle edge cases gracefully

Output your response in the required JSON format.`,

  CREATE_MIDDLEWARE: (task) => `
Create Express middleware:

Task: ${task.description}
Middleware Type: ${task.metadata?.middlewareType || 'Not specified'}
Purpose: ${task.metadata?.purpose || 'Not specified'}

Project Context:
- Framework: ${task.projectInfo?.backend?.framework || 'Express.js'}
- Auth Strategy: ${task.projectInfo?.backend?.auth || 'None'}

Existing Middleware:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Follow Express middleware signature (req, res, next)
2. Add proper error handling
3. Call next() appropriately
4. Add descriptive error messages
5. Consider performance implications
6. Make it reusable and configurable

Output your response in the required JSON format.`,

  CREATE_MODEL: (task) => `
Create a data model:

Task: ${task.description}
Model Name: ${task.metadata?.modelName || 'Not specified'}
Schema: ${JSON.stringify(task.metadata?.schema || {}, null, 2)}

Project Context:
- Database: ${task.projectInfo?.backend?.database || 'Not specified'}
- ORM/ODM: ${task.projectInfo?.backend?.orm || 'Not specified'}

Existing Models:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Define proper schema with types and constraints
2. Add validation rules
3. Implement hooks/middleware if needed (pre-save, post-save)
4. Add indexes for performance
5. Define relationships to other models
6. Add instance and static methods if needed
7. Follow naming conventions (singular for model, plural for collection)

Output your response in the required JSON format.`,

  IMPLEMENT_AUTH: (task) => `
Implement authentication/authorization:

Task: ${task.description}
Auth Type: ${task.metadata?.authType || 'JWT'}
Strategy: ${task.metadata?.strategy || 'Not specified'}

Project Context:
- Framework: ${task.projectInfo?.backend?.framework || 'Express.js'}
- Database: ${task.projectInfo?.backend?.database || 'Not specified'}

Requirements:
1. Implement secure password hashing (bcrypt)
2. Generate and validate tokens
3. Create auth middleware for protected routes
4. Add refresh token logic if applicable
5. Implement proper session management
6. Add rate limiting for auth endpoints
7. Follow OWASP security best practices

Security Checklist:
- Hash passwords with bcrypt (10+ rounds)
- Use secure token generation
- Implement token expiration
- Validate all inputs
- Prevent timing attacks
- Add CSRF protection if using sessions

Output your response in the required JSON format.`,

  FIX_BUG: (task) => `
Fix backend bug:

Task: ${task.description}
Bug Description: ${task.metadata?.bugDescription || 'Not specified'}
Expected Behavior: ${task.metadata?.expected || 'Not specified'}
Actual Behavior: ${task.metadata?.actual || 'Not specified'}
Error Message: ${task.metadata?.error || 'None'}

Affected Files:
${task.existingFiles?.map(f => `- ${f.path}\n${f.content}`).join('\n\n') || 'None'}

Requirements:
1. Identify root cause
2. Fix the bug without breaking existing functionality
3. Add validation to prevent similar bugs
4. Update error handling if needed
5. Consider edge cases
6. Suggest test cases to catch this bug

Output your response in the required JSON format.`,

  OPTIMIZE_PERFORMANCE: (task) => `
Optimize backend performance:

Task: ${task.description}
Target: ${task.metadata?.target || 'Not specified'}
Current Performance: ${task.metadata?.currentPerf || 'Not specified'}
Goal: ${task.metadata?.goalPerf || 'Not specified'}

Affected Files:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Optimization Areas:
1. Database queries (indexing, query optimization, caching)
2. Algorithm efficiency (reduce time complexity)
3. Memory usage (avoid leaks, optimize data structures)
4. I/O operations (batch processing, async operations)
5. Caching strategies (Redis, in-memory)
6. Connection pooling

Requirements:
- Maintain existing functionality
- Add performance benchmarks in comments
- Document optimization rationale
- Avoid premature optimization

Output your response in the required JSON format.`
};

/**
 * Generate prompt for backend task
 * @param {Object} task - Task object
 * @param {Object} context - Additional context
 * @returns {Object} { systemPrompt, userPrompt }
 */
function generateBackendPrompt(task, context = {}) {
  // Determine task type from description
  const description = task.description.toLowerCase();

  let userPrompt;

  if (description.includes('api') || description.includes('endpoint')) {
    userPrompt = TASK_TEMPLATES.CREATE_API_ENDPOINT(task);
  } else if (description.includes('service')) {
    userPrompt = TASK_TEMPLATES.CREATE_SERVICE(task);
  } else if (description.includes('middleware')) {
    userPrompt = TASK_TEMPLATES.CREATE_MIDDLEWARE(task);
  } else if (description.includes('model') || description.includes('schema')) {
    userPrompt = TASK_TEMPLATES.CREATE_MODEL(task);
  } else if (description.includes('auth') || description.includes('login')) {
    userPrompt = TASK_TEMPLATES.IMPLEMENT_AUTH(task);
  } else if (description.includes('fix') || description.includes('bug')) {
    userPrompt = TASK_TEMPLATES.FIX_BUG(task);
  } else if (description.includes('optimize') || description.includes('performance')) {
    userPrompt = TASK_TEMPLATES.OPTIMIZE_PERFORMANCE(task);
  } else {
    // Generic template
    userPrompt = `
Implement the following backend task:

Task: ${task.description}

Project Context:
- Framework: ${task.projectInfo?.backend?.framework || 'Not specified'}
- Database: ${task.projectInfo?.backend?.database || 'Not specified'}
- Language: ${task.projectInfo?.backend?.language || 'JavaScript'}

Existing Files:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Follow best practices for the framework
2. Add proper error handling
3. Implement validation
4. Write clean, maintainable code
5. Consider security implications
6. Add necessary comments

Output your response in the required JSON format.`;
  }

  return {
    systemPrompt: BACKEND_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.7,
    maxTokens: 4000
  };
}

module.exports = {
  BACKEND_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateBackendPrompt
};
