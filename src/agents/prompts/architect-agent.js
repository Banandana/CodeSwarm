/**
 * Architect Agent Prompt Templates
 * Specialized prompts for system architecture and design tasks
 */

const ARCHITECT_SYSTEM_PROMPT = `You are a software architect specialist in the CodeSwarm autonomous code generation system.

Your role:
- Design system architecture and structure
- Define module boundaries and responsibilities
- Create scalable, maintainable designs
- Make technology stack recommendations
- Design database schemas and data models
- Define API contracts and interfaces
- Ensure architectural consistency

Guidelines:
- Follow SOLID principles
- Apply appropriate design patterns
- Consider scalability and performance
- Ensure maintainability and testability
- Document architectural decisions
- Consider security implications
- Balance complexity vs simplicity
- Think long-term sustainability

ARCHITECTURAL DECISION TEMPLATE:
Every major decision must be documented with:
- Decision: Clear statement of what was chosen
- Rationale: Why this choice makes sense
- Alternatives: Other options that were considered
- Tradeoffs: Pros and cons of the decision
- Impact: What systems/components are affected
Example:
  {
    "decision": "Use PostgreSQL as primary database",
    "rationale": "Need ACID compliance for financial transactions, strong JSON support for flexible data, excellent query performance",
    "alternatives": ["MongoDB (considered for flexibility but lacks transactions)", "MySQL (considered but weaker JSON support)"],
    "tradeoffs": "Pros: ACID, strong typing, JSON support. Cons: Less flexible schema changes than NoSQL",
    "impact": "All data models, ORM choice, query patterns"
  }

DESIGN PATTERNS TO CONSIDER:
- Creational: Factory, Builder, Singleton
- Structural: Adapter, Decorator, Facade
- Behavioral: Strategy, Observer, Command
- Architectural: MVC, Microservices, Event-Driven, Layered
Choose patterns that solve real problems, not just for academic reasons.

SCALABILITY CONSIDERATIONS:
- Horizontal vs Vertical scaling
- Stateless design for horizontal scaling
- Caching strategy (Redis, CDN)
- Database read replicas for read-heavy workloads
- Message queues for async processing
- Load balancing strategy
- Rate limiting and throttling

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
  "decisions": [
    {
      "decision": "What was decided",
      "rationale": "Why it was decided",
      "alternatives": ["Other options considered"],
      "tradeoffs": "Pros and cons",
      "impact": "What is affected"
    }
  ],
  "recommendations": ["Technology or pattern recommendations"],
  "documentation": "brief description of architecture"
}

JSON VALIDATION RULES:
1. Response MUST start with { and end with }
2. files: MUST be non-empty array
3. Each file MUST have: path (string), action ("create" or "modify"), content (string)
4. content: MUST properly escape quotes (\\\"), newlines (\\n), backslashes (\\\\)
5. decisions: MUST be array of decision objects
6. Each decision MUST have: decision, rationale, alternatives (array), tradeoffs, impact
7. recommendations: MUST be array of strings
8. documentation: MUST be non-empty string
9. NO trailing commas, NO comments in JSON

EXAMPLE RESPONSE:
{
  "files": [
    {
      "path": "docs/architecture.md",
      "action": "create",
      "content": "# System Architecture\\n\\n## Overview\\nThis system follows a layered architecture pattern with clear separation of concerns.\\n\\n## Components\\n- API Layer: Express.js REST API\\n- Service Layer: Business logic\\n- Data Layer: PostgreSQL with Sequelize ORM\\n- Cache Layer: Redis for session and data caching\\n\\n## Data Flow\\n1. Client sends HTTP request to API\\n2. API validates request and calls service\\n3. Service executes business logic\\n4. Service calls data layer for persistence\\n5. Response flows back through layers"
    }
  ],
  "decisions": [
    {
      "decision": "Use layered architecture pattern",
      "rationale": "Clear separation of concerns, testable components, follows SOLID principles",
      "alternatives": ["Microservices (too complex for current scale)", "Monolithic (harder to test and scale)"],
      "tradeoffs": "Pros: Maintainable, testable, clear boundaries. Cons: Some overhead from layer abstractions",
      "impact": "All code organization, testing strategy, deployment"
    },
    {
      "decision": "Use PostgreSQL as primary database",
      "rationale": "ACID compliance needed for transactions, excellent JSON support, strong ecosystem",
      "alternatives": ["MongoDB (no ACID)", "MySQL (weaker JSON support)"],
      "tradeoffs": "Pros: ACID, type safety, performance. Cons: Schema migrations more rigid than NoSQL",
      "impact": "Data models, query patterns, scaling strategy"
    }
  ],
  "recommendations": [
    "Use Redis for caching frequently accessed data",
    "Implement repository pattern for data access abstraction",
    "Add circuit breaker pattern for external API calls",
    "Use dependency injection for testability"
  ],
  "documentation": "Designed layered architecture with Express.js API, service layer for business logic, PostgreSQL for data persistence, and Redis for caching"
}

DO NOT wrap your response in markdown code blocks.
DO NOT add any text before or after the JSON.
If you cannot complete the task, return a valid JSON with error field.`;

const TASK_TEMPLATES = {
  DESIGN_SYSTEM_ARCHITECTURE: (task) => `
Design system architecture:

Task: ${task.description}
Project Type: ${task.metadata?.projectType || 'Web application'}
Scale: ${task.metadata?.scale || 'Small to medium'}

Requirements:
${JSON.stringify(task.metadata?.requirements || {}, null, 2)}

Constraints:
${JSON.stringify(task.metadata?.constraints || {}, null, 2)}

Requirements:
1. Design overall system architecture
2. Define major components and their responsibilities
3. Design data flow and communication patterns
4. Choose appropriate architectural patterns (MVC, microservices, etc.)
5. Consider scalability and performance
6. Document architectural decisions
7. Create architecture diagram (ASCII/Mermaid)

Architecture Design Checklist:
- System components and modules
- Component responsibilities
- Communication patterns
- Data flow
- Technology stack recommendations
- Scalability considerations
- Security architecture
- Deployment architecture
- Monitoring and observability
- Error handling strategy

Architectural Patterns to Consider:
- Monolithic vs Microservices
- Layered architecture
- Event-driven architecture
- CQRS and Event Sourcing
- Serverless
- Hexagonal architecture

Output your response in the required JSON format.`,

  DESIGN_DATABASE_SCHEMA: (task) => `
Design database schema:

Task: ${task.description}
Database Type: ${task.metadata?.databaseType || 'PostgreSQL'}
Data Model: ${task.metadata?.dataModel || 'Relational'}

Entities and Relationships:
${JSON.stringify(task.metadata?.entities || {}, null, 2)}

Requirements:
${JSON.stringify(task.metadata?.requirements || [], null, 2)}

Requirements:
1. Design normalized database schema
2. Define tables/collections with fields
3. Specify data types and constraints
4. Design relationships and foreign keys
5. Add indexes for performance
6. Consider data integrity
7. Plan for scalability

Database Design Checklist:
- Entity-Relationship diagram
- Table definitions:
  - Primary keys
  - Foreign keys
  - Unique constraints
  - Check constraints
  - Default values
- Indexes for query optimization
- Data types and sizes
- Normalization level (1NF, 2NF, 3NF)
- Audit fields (created_at, updated_at)
- Soft delete strategy
- Migration strategy

Schema Design Principles:
- Normalize to reduce redundancy
- Denormalize strategically for performance
- Use appropriate data types
- Add indexes on foreign keys and search fields
- Consider query patterns
- Plan for data growth

Output your response in the required JSON format with schema definition files.`,

  DESIGN_API_CONTRACT: (task) => `
Design API contract:

Task: ${task.description}
API Type: ${task.metadata?.apiType || 'REST'}
API Version: ${task.metadata?.version || '1.0'}

Endpoints Needed:
${JSON.stringify(task.metadata?.endpoints || [], null, 2)}

Requirements:
1. Define API endpoints and methods
2. Specify request/response formats
3. Design authentication and authorization
4. Define error response format
5. Version the API appropriately
6. Document rate limiting
7. Consider backwards compatibility

API Design Checklist:
- RESTful resource design
- HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Request parameters:
  - Path parameters
  - Query parameters
  - Request body
- Response formats:
  - Success responses
  - Error responses
  - Status codes
- Authentication scheme (JWT, OAuth, etc.)
- Authorization rules
- Rate limiting strategy
- Pagination design
- Filtering and sorting
- API versioning strategy

API Design Principles:
- Use nouns for resources
- Use HTTP methods appropriately
- Return appropriate status codes
- Consistent error format
- Include pagination metadata
- Support filtering and sorting
- Version breaking changes

Output your response in the required JSON format with OpenAPI/Swagger spec.`,

  REFACTOR_ARCHITECTURE: (task) => `
Refactor existing architecture:

Task: ${task.description}
Current Issues: ${task.metadata?.issues || 'Not specified'}
Goals: ${JSON.stringify(task.metadata?.goals || [], null, 2)}

Current Architecture:
${task.existingFiles?.map(f => `${f.path}\n${f.content.substring(0, 500)}...`).join('\n\n') || 'Not provided'}

Requirements:
1. Analyze current architecture
2. Identify issues and pain points
3. Propose refactoring plan
4. Maintain backwards compatibility where possible
5. Plan migration strategy
6. Minimize disruption
7. Document changes

Refactoring Checklist:
- Current architecture analysis
- Identified problems:
  - Tight coupling
  - Code duplication
  - Poor separation of concerns
  - Performance bottlenecks
  - Scalability issues
- Proposed improvements:
  - New structure
  - Design patterns to apply
  - Dependencies to remove/add
- Migration plan:
  - Step-by-step approach
  - Backwards compatibility
  - Testing strategy
- Risk assessment
- Rollback plan

Refactoring Principles:
- Make incremental changes
- Maintain functionality
- Test thoroughly
- Document changes
- Consider team capacity
- Plan for gradual rollout

Output your response in the required JSON format with refactoring plan.`,

  DESIGN_MODULE_STRUCTURE: (task) => `
Design module structure:

Task: ${task.description}
Project Type: ${task.projectInfo?.projectType || 'Not specified'}
Scale: ${task.metadata?.scale || 'Medium'}

Project Context:
${JSON.stringify(task.projectInfo || {}, null, 2)}

Requirements:
1. Design module/package structure
2. Define clear module boundaries
3. Minimize coupling between modules
4. Maximize cohesion within modules
5. Define public interfaces
6. Plan for extensibility
7. Document module responsibilities

Module Design Checklist:
- Module hierarchy and organization
- Module responsibilities:
  - Single Responsibility Principle
  - Clear purpose
  - Well-defined interface
- Dependencies between modules:
  - Dependency direction
  - Minimize circular dependencies
  - Depend on abstractions
- Public API surface:
  - Exported functions/classes
  - Hidden implementation details
- Configuration strategy
- Error handling approach
- Logging strategy

Module Organization Patterns:
- Feature-based (group by feature)
- Layer-based (group by technical layer)
- Domain-driven (group by business domain)
- Hybrid approach

Directory Structure Example:
\`\`\`
src/
  core/           # Core business logic
  api/            # API layer
  services/       # Business services
  repositories/   # Data access
  utils/          # Shared utilities
  config/         # Configuration
\`\`\`

Output your response in the required JSON format with structure documentation.`,

  CHOOSE_TECH_STACK: (task) => `
Choose technology stack:

Task: ${task.description}
Project Type: ${task.metadata?.projectType || 'Web application'}
Requirements: ${JSON.stringify(task.metadata?.requirements || [], null, 2)}
Constraints: ${JSON.stringify(task.metadata?.constraints || {}, null, 2)}

Team Context:
- Team size: ${task.metadata?.teamSize || 'Not specified'}
- Experience: ${task.metadata?.teamExperience || 'Not specified'}
- Timeline: ${task.metadata?.timeline || 'Not specified'}

Requirements:
1. Recommend appropriate technologies for each layer
2. Consider team expertise
3. Evaluate long-term maintainability
4. Consider community support
5. Evaluate performance requirements
6. Consider cost implications
7. Document rationale for each choice

Technology Decisions:
- Frontend:
  - Framework (React/Vue/Angular/Svelte)
  - State management
  - Styling solution
  - Build tools
- Backend:
  - Language (Node.js/Python/Go/Java)
  - Framework (Express/FastAPI/Gin/Spring)
  - API type (REST/GraphQL/gRPC)
- Database:
  - Type (SQL/NoSQL)
  - Specific database (PostgreSQL/MongoDB/Redis)
  - ORM/ODM
- Infrastructure:
  - Hosting (Cloud provider)
  - Containerization (Docker)
  - Orchestration (Kubernetes)
  - CI/CD tools
- Additional tools:
  - Testing frameworks
  - Logging and monitoring
  - Authentication
  - Caching

Evaluation Criteria:
- Meets functional requirements
- Team expertise and learning curve
- Community support and ecosystem
- Performance characteristics
- Scalability potential
- Long-term maintainability
- Cost (licensing, hosting)
- Security considerations

Output your response in the required JSON format with technology recommendations.`,

  DESIGN_INTEGRATION_STRATEGY: (task) => `
Design integration strategy:

Task: ${task.description}
Systems to Integrate: ${JSON.stringify(task.metadata?.systems || [], null, 2)}
Integration Type: ${task.metadata?.integrationType || 'Not specified'}

Requirements:
1. Design integration architecture
2. Choose integration patterns
3. Handle data synchronization
4. Manage authentication between systems
5. Handle errors and retries
6. Ensure idempotency
7. Monitor integration health

Integration Design Checklist:
- Integration patterns:
  - API-based (REST/GraphQL)
  - Message queue (async)
  - Webhook/callback
  - File-based
  - Database replication
- Data flow:
  - Direction (one-way/bi-directional)
  - Frequency (real-time/batch)
  - Volume
- Authentication:
  - API keys
  - OAuth
  - JWT
  - Mutual TLS
- Error handling:
  - Retry strategy
  - Dead letter queue
  - Circuit breaker
  - Fallback behavior
- Data transformation:
  - Mapping rules
  - Validation
  - Enrichment
- Monitoring:
  - Success/failure rates
  - Latency
  - Data quality

Integration Patterns:
- Synchronous (request/response)
- Asynchronous (message queue)
- Event-driven
- ETL/ELT
- CDC (Change Data Capture)

Output your response in the required JSON format with integration design.`
};

/**
 * Generate prompt for architect task
 * @param {Object} task - Task object
 * @param {Object} context - Additional context
 * @returns {Object} { systemPrompt, userPrompt }
 */
function generateArchitectPrompt(task, context = {}) {
  const description = task.description.toLowerCase();

  let userPrompt;

  if (description.includes('system') && (description.includes('architecture') || description.includes('design'))) {
    userPrompt = TASK_TEMPLATES.DESIGN_SYSTEM_ARCHITECTURE(task);
  } else if (description.includes('database') && (description.includes('schema') || description.includes('design'))) {
    userPrompt = TASK_TEMPLATES.DESIGN_DATABASE_SCHEMA(task);
  } else if (description.includes('api') && (description.includes('contract') || description.includes('design') || description.includes('spec'))) {
    userPrompt = TASK_TEMPLATES.DESIGN_API_CONTRACT(task);
  } else if (description.includes('refactor') || description.includes('restructure')) {
    userPrompt = TASK_TEMPLATES.REFACTOR_ARCHITECTURE(task);
  } else if (description.includes('module') || description.includes('structure') || description.includes('organization')) {
    userPrompt = TASK_TEMPLATES.DESIGN_MODULE_STRUCTURE(task);
  } else if (description.includes('tech stack') || description.includes('technology') || description.includes('choose')) {
    userPrompt = TASK_TEMPLATES.CHOOSE_TECH_STACK(task);
  } else if (description.includes('integration') || description.includes('integrate')) {
    userPrompt = TASK_TEMPLATES.DESIGN_INTEGRATION_STRATEGY(task);
  } else {
    // Generic architecture task
    userPrompt = `
Design architectural solution:

Task: ${task.description}

Project Context:
${JSON.stringify(task.projectInfo || {}, null, 2)}

Requirements:
1. Design appropriate architecture
2. Follow best practices and principles
3. Consider scalability and maintainability
4. Document architectural decisions
5. Provide clear rationale

Output your response in the required JSON format.`;
  }

  return {
    systemPrompt: ARCHITECT_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.6, // Slightly lower for consistent architecture decisions
    maxTokens: 4000
  };
}

module.exports = {
  ARCHITECT_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateArchitectPrompt
};
