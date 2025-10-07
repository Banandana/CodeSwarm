/**
 * DevOps Agent Prompt Templates
 * Specialized prompts for DevOps and infrastructure tasks
 */

const DEVOPS_SYSTEM_PROMPT = `You are a DevOps specialist in the CodeSwarm autonomous code generation system.

Your role:
- Configure containerization and deployment
- Set up CI/CD pipelines
- Manage infrastructure as code
- Configure monitoring and logging
- Optimize deployment processes
- Ensure security and scalability

Guidelines:
- Follow infrastructure as code principles
- Use industry-standard tools (Docker, GitHub Actions, etc.)
- Implement security best practices
- Optimize for cost and performance
- Document all configuration
- Make deployments reproducible

DOCKER BEST PRACTICES:
- Use official, minimal base images (alpine when possible)
- Multi-stage builds to reduce image size
- Run as non-root user for security
- Use .dockerignore to exclude unnecessary files
- Optimize layer caching (copy package files before source)
Example:
  FROM node:18-alpine AS builder
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production
  COPY . .
  RUN npm run build

  FROM node:18-alpine
  RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
  WORKDIR /app
  COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
  USER nodejs
  EXPOSE 3000
  HEALTHCHECK --interval=30s --timeout=3s CMD node healthcheck.js
  CMD ["node", "dist/server.js"]

CI/CD PIPELINE STAGES:
1. Checkout code
2. Install dependencies (with caching)
3. Run linters and code quality checks
4. Run tests (unit, integration)
5. Build application
6. Security scanning (Snyk, OWASP, etc.)
7. Build and push Docker image
8. Deploy to environment
9. Run smoke tests
10. Notify team of results

SECRETS MANAGEMENT:
- Never commit secrets to version control
- Use environment variables or secret managers
- Document all required secrets
- Provide .env.example with dummy values
- Use different secrets per environment
Example secrets list:
  - DATABASE_URL
  - API_KEY
  - JWT_SECRET
  - OAUTH_CLIENT_ID
  - OAUTH_CLIENT_SECRET

PROJECT CONTEXT SCHEMA:
You receive projectInfo with this structure:
{
  "deployment": {
    "platform": "docker" | "kubernetes" | "heroku" | "vercel" | "aws",
    "containerized": true | false,
    "ciPlatform": "github-actions" | "gitlab-ci" | "jenkins" | "circleci"
  },
  "services": ["service1", "service2"]
}
Adapt your configuration to match deployment requirements.

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanatory text.
Your entire response must be parseable as JSON.

REQUIRED JSON FORMAT:
{
  "files": [
    {
      "path": "relative/path/to/file",
      "action": "create",
      "content": "full file content"
    }
  ],
  "commands": ["commands to run after file creation"],
  "secrets": ["list of required secrets/env vars"],
  "documentation": "brief description of setup"
}

JSON VALIDATION RULES:
1. Response MUST start with { and end with }
2. files: MUST be non-empty array
3. Each file MUST have: path (string), action ("create" or "modify"), content (string)
4. content: MUST properly escape quotes (\\\"), newlines (\\n), backslashes (\\\\)
5. commands: MUST be array of strings (can be empty)
6. secrets: MUST be array of strings (can be empty)
7. documentation: MUST be non-empty string
8. NO trailing commas, NO comments in JSON

EXAMPLE RESPONSE:
{
  "files": [
    {
      "path": "Dockerfile",
      "action": "create",
      "content": "FROM node:18-alpine AS builder\\nWORKDIR /app\\nCOPY package*.json ./\\nRUN npm ci --only=production\\nCOPY . .\\nRUN npm run build\\n\\nFROM node:18-alpine\\nRUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001\\nWORKDIR /app\\nCOPY --from=builder --chown=nodejs:nodejs /app/dist ./dist\\nCOPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules\\nUSER nodejs\\nEXPOSE 3000\\nHEALTHCHECK --interval=30s --timeout=3s CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1\\nCMD [\\"node\\", \\"dist/server.js\\"]"
    },
    {
      "path": ".dockerignore",
      "action": "create",
      "content": "node_modules\\nnpm-debug.log\\n.git\\n.env\\n*.md\\ntests\\n.github"
    }
  ],
  "commands": [
    "docker build -t myapp:latest .",
    "docker run -p 3000:3000 myapp:latest"
  ],
  "secrets": [
    "DATABASE_URL",
    "JWT_SECRET",
    "API_KEY"
  ],
  "documentation": "Multi-stage Dockerfile with non-root user, health checks, and optimized layer caching for Node.js application"
}

DO NOT wrap your response in markdown code blocks.
DO NOT add any text before or after the JSON.
If you cannot complete the task, return a valid JSON with error field.`;

const TASK_TEMPLATES = {
  CREATE_DOCKERFILE: (task) => `
Create Dockerfile for application:

Task: ${task.description}
Application Type: ${task.metadata?.appType || 'Not specified'}
Runtime: ${task.metadata?.runtime || 'Node.js'}

Project Context:
- Language: ${task.projectInfo?.backend?.language || 'JavaScript'}
- Framework: ${task.projectInfo?.backend?.framework || 'Express'}
- Database: ${task.projectInfo?.database?.type || 'None'}

Requirements:
1. Use appropriate base image (official, minimal)
2. Implement multi-stage build if applicable
3. Run as non-root user
4. Optimize layer caching
5. Include health check
6. Set proper environment variables
7. Expose necessary ports
8. Add .dockerignore file

Dockerfile Best Practices:
- Minimal image size
- Security scanning
- Layer optimization
- Clear documentation
- Development vs production variants

Output your response in the required JSON format.`,

  CREATE_CI_PIPELINE: (task) => `
Create CI/CD pipeline:

Task: ${task.description}
CI Platform: ${task.metadata?.ciPlatform || 'GitHub Actions'}
Deployment Target: ${task.metadata?.deploymentTarget || 'Not specified'}

Project Context:
- Language: ${task.projectInfo?.backend?.language || 'JavaScript'}
- Tests: ${task.projectInfo?.testing?.framework || 'Jest'}
- Build Tool: ${task.projectInfo?.buildTool || 'npm'}

Pipeline Requirements:
${JSON.stringify(task.metadata?.pipelineSteps || [], null, 2)}

Requirements:
1. Set up CI pipeline (lint, test, build)
2. Implement automated testing
3. Add code quality checks
4. Set up deployment workflow
5. Configure environment-specific deploys
6. Add manual approval for production
7. Implement rollback mechanism

Pipeline Stages:
- Checkout code
- Install dependencies
- Run linters
- Run tests
- Build application
- Security scanning
- Deploy to environment
- Health check

Output your response in the required JSON format.`,

  CREATE_DEPLOYMENT_SCRIPT: (task) => `
Create deployment script:

Task: ${task.description}
Deployment Type: ${task.metadata?.deploymentType || 'Not specified'}
Target Environment: ${task.metadata?.environment || 'Production'}

Project Context:
- Platform: ${task.projectInfo?.deployment?.platform || 'Not specified'}
- Container: ${task.projectInfo?.deployment?.containerized || false}

Requirements:
1. Create deployment script/configuration
2. Handle environment variables
3. Implement zero-downtime deployment
4. Add health checks
5. Implement rollback capability
6. Add logging and monitoring
7. Document deployment process

Deployment Checklist:
- Pre-deployment checks
- Database migrations
- Static asset handling
- Service restart
- Health verification
- Rollback procedure

Output your response in the required JSON format.`,

  CONFIGURE_ENVIRONMENT: (task) => `
Configure environment:

Task: ${task.description}
Environment: ${task.metadata?.environment || 'Production'}

Project Requirements:
${JSON.stringify(task.projectInfo || {}, null, 2)}

Requirements:
1. Create environment configuration files
2. Document all required variables
3. Separate secrets from config
4. Provide example files
5. Add validation for required vars
6. Document setup process

Environment Configuration:
- .env.example with all variables
- Documentation for each variable
- Default values where appropriate
- Security considerations
- Platform-specific setup

Output your response in the required JSON format.`,

  SETUP_MONITORING: (task) => `
Set up monitoring and logging:

Task: ${task.description}
Monitoring Solution: ${task.metadata?.monitoringSolution || 'Not specified'}
Metrics: ${JSON.stringify(task.metadata?.metrics || [], null, 2)}

Project Context:
- Application Type: ${task.projectInfo?.projectType || 'web-app'}
- Scale: ${task.projectInfo?.scale || 'small'}

Requirements:
1. Configure application logging
2. Set up error tracking
3. Implement health check endpoints
4. Configure metrics collection
5. Set up alerting rules
6. Create monitoring dashboard
7. Document monitoring setup

Monitoring Components:
- Structured logging
- Error tracking (Sentry, etc.)
- Health check endpoint
- Metrics endpoint (Prometheus format)
- Alert configuration
- Dashboard config

Output your response in the required JSON format.`,

  CREATE_INFRASTRUCTURE: (task) => `
Create infrastructure as code:

Task: ${task.description}
IaC Tool: ${task.metadata?.iacTool || 'Docker Compose'}
Infrastructure: ${JSON.stringify(task.metadata?.infrastructure || {}, null, 2)}

Project Context:
- Services: ${JSON.stringify(task.projectInfo?.services || [], null, 2)}
- Database: ${task.projectInfo?.database?.type || 'PostgreSQL'}

Requirements:
1. Define all infrastructure components
2. Configure networking
3. Set up volumes for persistence
4. Define resource limits
5. Configure dependencies between services
6. Add health checks
7. Document infrastructure

Infrastructure Components:
- Application services
- Database services
- Cache services (if needed)
- Network configuration
- Volume mounts
- Environment variables

Output your response in the required JSON format.`
};

/**
 * Generate prompt for devops task
 * @param {Object} task - Task object
 * @param {Object} context - Additional context
 * @returns {Object} { systemPrompt, userPrompt }
 */
function generateDevOpsPrompt(task, context = {}) {
  const description = task.description.toLowerCase();

  let userPrompt;

  if (description.includes('dockerfile') || (description.includes('docker') && description.includes('container'))) {
    userPrompt = TASK_TEMPLATES.CREATE_DOCKERFILE(task);
  } else if (description.includes('ci') || description.includes('cd') || description.includes('pipeline')) {
    userPrompt = TASK_TEMPLATES.CREATE_CI_PIPELINE(task);
  } else if (description.includes('deploy') || description.includes('deployment')) {
    userPrompt = TASK_TEMPLATES.CREATE_DEPLOYMENT_SCRIPT(task);
  } else if (description.includes('environment') || description.includes('config')) {
    userPrompt = TASK_TEMPLATES.CONFIGURE_ENVIRONMENT(task);
  } else if (description.includes('monitor') || description.includes('logging') || description.includes('observability')) {
    userPrompt = TASK_TEMPLATES.SETUP_MONITORING(task);
  } else if (description.includes('infrastructure') || description.includes('compose')) {
    userPrompt = TASK_TEMPLATES.CREATE_INFRASTRUCTURE(task);
  } else {
    // Generic DevOps task
    userPrompt = `
Implement DevOps task:

Task: ${task.description}

Project Context:
${JSON.stringify(task.projectInfo || {}, null, 2)}

Requirements:
1. Follow DevOps best practices
2. Implement security measures
3. Document all steps
4. Make it reproducible
5. Consider scalability

Output your response in the required JSON format.`;
  }

  return {
    systemPrompt: DEVOPS_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5, // Lower for more consistent config
    maxTokens: 4000
  };
}

module.exports = {
  DEVOPS_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateDevOpsPrompt
};
