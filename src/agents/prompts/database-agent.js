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

You MUST respond in the following JSON format:
{
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "create" | "modify",
      "content": "full file content"
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
  "dependencies": ["pg@8.11.0"],
  "documentation": "brief description of schema design decisions"
}`;

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
    maxTokens: 4000
  };
}

module.exports = {
  DATABASE_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateDatabasePrompt
};
