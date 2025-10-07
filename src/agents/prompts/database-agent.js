/**
 * Database Agent Prompt Templates
 * Specialized prompts for database design and operations
 */

const DATABASE_SYSTEM_PROMPT = `You are a database specialist in the CodeSwarm autonomous code generation system.

Your role:
- Design efficient database schemas
- Write optimized queries
- Implement migrations
- Design proper indexes for performance
- Ensure data integrity and consistency
- Follow database best practices

Guidelines:
- Normalize data appropriately (usually 3NF)
- Use foreign keys for referential integrity
- Add indexes for frequently queried fields
- Consider query performance in schema design
- Use transactions for data consistency
- Follow naming conventions (snake_case for SQL, camelCase for NoSQL)
- Add proper constraints (NOT NULL, UNIQUE, CHECK)

SCHEMA DESIGN PATTERNS:
For Relational Databases:
- Primary keys: Use UUID or BIGSERIAL for scalability
- Timestamps: Always include created_at, updated_at
- Soft deletes: Add deleted_at for audit trails
- Foreign keys: REFERENCES with ON DELETE CASCADE/SET NULL
Example:
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX idx_users_email ON users(email);

For NoSQL (MongoDB):
- Schema validation using JSON Schema
- Compound indexes for multi-field queries
- Consider embedding vs referencing based on access patterns
- Use proper data types (Date, ObjectId, etc.)

MIGRATION SAFETY:
- Always provide both up and down migrations
- Use transactions when possible
- Add IF NOT EXISTS for idempotency
- Never drop columns with data without backup plan
- Test migrations on copy of production data
Example:
  exports.up = (knex) => knex.schema.createTable('users', (table) => {
    table.uuid('id').primary();
    table.string('email').unique().notNullable();
    table.timestamps(true, true);
  });
  exports.down = (knex) => knex.schema.dropTableIfExists('users');

PROJECT CONTEXT SCHEMA:
You receive projectInfo with this structure:
{
  "database": {
    "type": "postgresql" | "mysql" | "mongodb" | "sqlite",
    "orm": "sequelize" | "typeorm" | "prisma" | "mongoose" | "knex" | null,
    "expectedScale": "small" | "medium" | "large",
    "expectedLoad": "low" | "medium" | "high"
  }
}
Adapt your schema design to match database type and scale.

TESTING REQUIREMENTS:
Your database code must be testable:
- Provide seed data for testing
- Use test database configuration
- Document rollback procedures
- Include migration test scenarios
- Provide test cases in testCases array

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanatory text.
Your entire response must be parseable as JSON.

REQUIRED JSON FORMAT (MUST CONTAIN EXACTLY ONE FILE):

CRITICAL ENCODING REQUIREMENT:
- The "contentBase64" field MUST contain Base64-encoded file content
- DO NOT use "content" field - use "contentBase64" instead
- Base64 encoding prevents ALL escaping issues
- To encode: convert your file content to Base64 string

{
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "create",
      "contentBase64": "BASE64_ENCODED_FILE_CONTENT_HERE"
    }
  ],
  "migrations": [
    {
      "version": "001",
      "description": "Create users table",
      "up": "SQL or migration code",
      "down": "Rollback code"
    }
  ],
  "indexes": ["list of indexes created"],
  "dependencies": ["package-name@version"],
  "testCases": ["description of test cases needed"],
  "documentation": "brief description of schema design decisions"
}

JSON VALIDATION RULES (CRITICAL - RESPONSE WILL FAIL IF NOT VALID JSON):
1. Response MUST start with { and end with }
2. files: MUST be array with EXACTLY ONE file object (not zero, not multiple)
3. The single file MUST have: path (string), action ("create" or "modify"), content (string)
4. contentBase64: MUST be valid Base64-encoded string with ALL special characters escaped:
   - Every " must be \\\\"
   - Every \\\\ must be \\\\\\\\
   - Every newline must be \\\\n
   - Every tab must be \\\\t
   - TRIPLE-CHECK the content field for unescaped quotes!
5. migrations: MUST be array (can be empty if not applicable)
6. Each migration MUST have: version, description, up, down
7. indexes: MUST be array of strings (can be empty)
8. dependencies: MUST be array of "package@version" strings
9. testCases: MUST be non-empty array of strings
10. documentation: MUST be non-empty string
11. NO trailing commas, NO comments in JSON

EXAMPLE RESPONSE:
{
  "files": [
    {
      "path": "db/migrations/001_create_users.js",
      "action": "create",
      "content": "exports.up = (knex) => knex.schema.createTable('users', (table) => {\\n  table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));\\n  table.string('email', 255).unique().notNullable();\\n  table.string('password_hash', 255).notNullable();\\n  table.timestamps(true, true);\\n  table.timestamp('deleted_at').nullable();\\n});\\n\\nexports.down = (knex) => knex.schema.dropTableIfExists('users');"
    }
  ],
  "migrations": [
    {
      "version": "001",
      "description": "Create users table with email, password, and timestamps",
      "up": "CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());",
      "down": "DROP TABLE IF EXISTS users;"
    }
  ],
  "indexes": ["idx_users_email ON users(email)", "idx_users_created_at ON users(created_at)"],
  "dependencies": ["knex@2.5.1", "pg@8.11.3"],
  "testCases": [
    "Should create users table with proper constraints",
    "Should enforce unique email constraint",
    "Should rollback migration successfully",
    "Should create indexes on email and created_at"
  ],
  "documentation": "Created users table with UUID primary key, email uniqueness, and soft delete support via deleted_at column"
}

DO NOT wrap your response in markdown code blocks.
DO NOT add any text before or after the JSON.
If you cannot complete the task, return a valid JSON with error field.`;

const TASK_TEMPLATES = {
  DESIGN_SCHEMA: (task) => `
Design database schema:

Task: ${task.description}
Entities: ${JSON.stringify(task.metadata?.entities || [], null, 2)}
Relationships: ${JSON.stringify(task.metadata?.relationships || [], null, 2)}

Project Context:
- Database: ${task.projectInfo?.database?.type || 'PostgreSQL'}
- ORM/ODM: ${task.projectInfo?.database?.orm || 'None'}
- Scale: ${task.projectInfo?.database?.expectedScale || 'Small'}

Existing Schema:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Design normalized schema (3NF for relational, appropriate structure for NoSQL)
2. Define primary keys and foreign keys
3. Add appropriate constraints (NOT NULL, UNIQUE, CHECK)
4. Design indexes for common queries
5. Consider data types carefully
6. Plan for scalability
7. Include timestamps (created_at, updated_at)

For Relational Databases:
- Use appropriate data types (VARCHAR, INTEGER, TIMESTAMP, etc.)
- Define relationships (one-to-one, one-to-many, many-to-many)
- Consider cascade delete/update rules
- Use junction tables for many-to-many

For NoSQL:
- Consider access patterns
- Denormalize where appropriate for read performance
- Design for horizontal scaling
- Use appropriate indexes

Output your response in the required JSON format.`,

  CREATE_MIGRATION: (task) => `
Create database migration:

Task: ${task.description}
Migration Type: ${task.metadata?.migrationType || 'Not specified'}
Changes: ${JSON.stringify(task.metadata?.changes || [], null, 2)}

Project Context:
- Database: ${task.projectInfo?.database?.type || 'PostgreSQL'}
- Migration Tool: ${task.projectInfo?.database?.migrationTool || 'Knex.js'}

Existing Migrations:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Create both up and down migrations
2. Make migrations idempotent where possible
3. Handle data migration if needed
4. Add appropriate indexes
5. Preserve existing data
6. Test rollback capability
7. Use transactions for consistency

Migration Checklist:
- Schema changes (CREATE, ALTER, DROP)
- Data migration if needed
- Index creation/removal
- Constraint changes
- Default values

Output your response in the required JSON format.`,

  OPTIMIZE_QUERIES: (task) => `
Optimize database queries:

Task: ${task.description}
Slow Queries: ${JSON.stringify(task.metadata?.slowQueries || [], null, 2)}
Current Performance: ${task.metadata?.currentPerf || 'Not specified'}
Target Performance: ${task.metadata?.targetPerf || 'Not specified'}

Project Context:
- Database: ${task.projectInfo?.database?.type || 'PostgreSQL'}
- ORM: ${task.projectInfo?.database?.orm || 'None'}

Query Code:
\`\`\`
${task.metadata?.queryCode || 'Not provided'}
\`\`\`

Query Execution Plan:
\`\`\`
${task.metadata?.executionPlan || 'Not provided'}
\`\`\`

Requirements:
1. Analyze query execution plan
2. Add missing indexes
3. Rewrite queries for efficiency
4. Eliminate N+1 queries
5. Use appropriate JOINs
6. Consider query caching
7. Avoid SELECT *

Optimization Strategies:
- Add indexes on WHERE, JOIN, ORDER BY columns
- Use EXPLAIN/ANALYZE to understand query plan
- Batch queries where possible
- Use connection pooling
- Consider denormalization for read-heavy workloads
- Add covering indexes for common queries

Output your response in the required JSON format.`,

  CREATE_SEED_DATA: (task) => `
Create seed data:

Task: ${task.description}
Tables: ${task.metadata?.tables?.join(', ') || 'Not specified'}
Data Requirements: ${JSON.stringify(task.metadata?.dataRequirements || {}, null, 2)}

Project Context:
- Database: ${task.projectInfo?.database?.type || 'PostgreSQL'}
- Environment: ${task.metadata?.environment || 'development'}

Schema:
${task.existingFiles?.map(f => `- ${f.path}\n${f.content}`).join('\n\n') || 'None'}

Requirements:
1. Create realistic test data
2. Respect foreign key constraints (insert in correct order)
3. Include various scenarios (active/inactive, different states)
4. Generate sufficient data for testing
5. Make seeds idempotent (can run multiple times)
6. Use faker or similar for realistic data

Seed Data Should Include:
- Different user types/roles
- Various entity states
- Related data across tables
- Edge cases for testing
- Enough volume for realistic testing

Output your response in the required JSON format.`,

  DESIGN_INDEXES: (task) => `
Design database indexes:

Task: ${task.description}
Tables: ${task.metadata?.tables?.join(', ') || 'Not specified'}
Common Queries: ${JSON.stringify(task.metadata?.commonQueries || [], null, 2)}

Project Context:
- Database: ${task.projectInfo?.database?.type || 'PostgreSQL'}
- Expected Load: ${task.projectInfo?.database?.expectedLoad || 'Medium'}

Schema:
${task.existingFiles?.map(f => `${f.path}\n${f.content}`).join('\n\n') || 'None'}

Requirements:
1. Analyze query patterns
2. Create indexes for WHERE clauses
3. Create indexes for JOIN columns
4. Create indexes for ORDER BY columns
5. Consider composite indexes for multi-column queries
6. Balance read vs write performance
7. Avoid over-indexing

Index Types to Consider:
- B-tree (default, good for equality and range queries)
- Hash (equality only, faster than B-tree)
- GiST/GIN (full-text search, array operations)
- Partial indexes (for filtered queries)
- Covering indexes (include columns)

Index Strategy:
- High cardinality columns benefit most from indexes
- Foreign keys should be indexed
- Frequently filtered columns should be indexed
- Consider index size vs performance gain

Output your response in the required JSON format.`,

  IMPLEMENT_TRANSACTIONS: (task) => `
Implement database transactions:

Task: ${task.description}
Operations: ${JSON.stringify(task.metadata?.operations || [], null, 2)}
Isolation Level: ${task.metadata?.isolationLevel || 'READ COMMITTED'}

Project Context:
- Database: ${task.projectInfo?.database?.type || 'PostgreSQL'}
- ORM: ${task.projectInfo?.database?.orm || 'None'}

Code to Modify:
${task.existingFiles?.map(f => `${f.path}\n${f.content}`).join('\n\n') || 'None'}

Requirements:
1. Wrap related operations in transactions
2. Implement proper rollback on errors
3. Use appropriate isolation level
4. Handle deadlock scenarios
5. Keep transactions short
6. Avoid long-running transactions

Transaction Checklist:
- Begin transaction
- Execute all operations
- Commit on success
- Rollback on any error
- Release connection
- Handle connection pool properly

Use Cases for Transactions:
- Multiple related inserts/updates
- Financial operations
- Inventory updates
- User registration (user + profile + settings)
- Order processing

Output your response in the required JSON format.`,

  BACKUP_STRATEGY: (task) => `
Design backup and recovery strategy:

Task: ${task.description}
Database: ${task.projectInfo?.database?.type || 'PostgreSQL'}
Data Volume: ${task.metadata?.dataVolume || 'Not specified'}
RTO/RPO: ${task.metadata?.rtoRpo || 'Not specified'}

Requirements:
1. Design backup schedule (full, incremental)
2. Implement backup scripts
3. Define retention policy
4. Plan recovery procedures
5. Test backup restoration
6. Consider point-in-time recovery

Backup Components:
- Full database dumps
- Incremental backups
- Transaction log backups (for point-in-time recovery)
- Schema backups
- Backup verification

Output your response in the required JSON format.`
};

/**
 * Generate prompt for database task
 * @param {Object} task - Task object
 * @param {Object} context - Additional context
 * @returns {Object} { systemPrompt, userPrompt }
 */
function generateDatabasePrompt(task, context = {}) {
  const description = task.description.toLowerCase();

  let userPrompt;

  if (description.includes('schema') || description.includes('model')) {
    userPrompt = TASK_TEMPLATES.DESIGN_SCHEMA(task);
  } else if (description.includes('migration')) {
    userPrompt = TASK_TEMPLATES.CREATE_MIGRATION(task);
  } else if (description.includes('optimize') || description.includes('query')) {
    userPrompt = TASK_TEMPLATES.OPTIMIZE_QUERIES(task);
  } else if (description.includes('seed') || description.includes('fixture')) {
    userPrompt = TASK_TEMPLATES.CREATE_SEED_DATA(task);
  } else if (description.includes('index')) {
    userPrompt = TASK_TEMPLATES.DESIGN_INDEXES(task);
  } else if (description.includes('transaction')) {
    userPrompt = TASK_TEMPLATES.IMPLEMENT_TRANSACTIONS(task);
  } else if (description.includes('backup')) {
    userPrompt = TASK_TEMPLATES.BACKUP_STRATEGY(task);
  } else {
    // Generic database task
    userPrompt = `
Implement database task:

Task: ${task.description}

Project Context:
- Database: ${task.projectInfo?.database?.type || 'PostgreSQL'}
- ORM: ${task.projectInfo?.database?.orm || 'None'}

Existing Files:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Follow database best practices
2. Ensure data integrity
3. Consider performance
4. Add appropriate indexes
5. Use transactions where needed
6. Write efficient queries

Output your response in the required JSON format.`;
  }

  return {
    systemPrompt: DATABASE_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5, // Lower temperature for consistent schema design
    maxTokens: 8000  // Increased from 4000 to handle complex multi-file responses
  };
}

module.exports = {
  DATABASE_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateDatabasePrompt
};
