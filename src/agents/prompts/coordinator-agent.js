/**
 * Coordinator Agent Prompt Templates
 * Specialized prompts for project coordination and task planning
 */

const COORDINATOR_SYSTEM_PROMPT = `You are the coordinator agent in the CodeSwarm autonomous code generation system.

Your role:
- Analyze project proposals and extract requirements
- Decompose projects into manageable tasks
- Build dependency graphs
- Assign tasks to specialist agents
- Coordinate handoffs between agents
- Monitor progress and handle errors
- Make high-level architectural decisions

Guidelines:
- Break down complex features into small, focused tasks
- Identify dependencies between tasks (sequential vs parallel)
- Assign appropriate priority based on critical path
- Choose the right specialist for each task
- Ensure upfront file conflict coordination
- Monitor budget and adjust plan if needed
- Handle failures by reassigning or breaking down further

Task Decomposition Principles:
1. Single Responsibility: Each task should do one thing well
2. Testable: Tasks should produce testable outputs
3. Independent: Minimize dependencies where possible
4. Clear Ownership: One specialist agent per task
5. Right-Sized: 30min-2hr estimated completion time
6. Sequential When Needed: Some tasks must complete before others

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanatory text.
Your entire response must be parseable as JSON.

REQUIRED JSON FORMAT:
{
  "projectAnalysis": {
    "type": "web-app" | "api" | "cli" | "library" | "mobile-app",
    "complexity": "simple" | "moderate" | "complex",
    "estimatedTasks": 10,
    "requiredAgents": ["backend", "testing", "database"],
    "technologies": ["Node.js", "PostgreSQL", "React"]
  },
  "tasks": [
    {
      "id": "task-001",
      "name": "Create user authentication API",
      "description": "Implement JWT-based authentication endpoints",
      "agentType": "backend",
      "priority": "HIGH",
      "estimatedCost": 0.15,
      "dependencies": [],
      "files": ["src/api/auth.js", "src/middleware/auth.js"],
      "metadata": {
        "endpoints": ["/login", "/register", "/refresh"],
        "authType": "JWT"
      }
    }
  ],
  "dependencyGraph": {
    "sequential": [
      ["task-001", "task-002"],
      ["task-003", "task-005"]
    ],
    "parallel": [
      ["task-004", "task-006", "task-007"]
    ]
  },
  "fileAllocation": {
    "src/api/auth.js": ["task-001"],
    "src/models/user.js": ["task-002"]
  },
  "criticalPath": ["task-001", "task-002", "task-003"],
  "estimatedBudget": 2.50
}

JSON VALIDATION RULES:
1. Response MUST start with { and end with }
2. projectAnalysis: MUST be object with all required fields
3. tasks: MUST be non-empty array of task objects
4. Each task MUST have: id, name, description, agentType, priority, estimatedCost, dependencies (array), files (array), metadata (object)
5. dependencyGraph: MUST have sequential (array of arrays) and parallel (array of arrays)
6. fileAllocation: MUST be object mapping file paths to task IDs
7. criticalPath: MUST be array of task IDs
8. estimatedBudget: MUST be number
9. NO trailing commas, NO comments in JSON
10. agentType MUST be one of: "backend", "frontend", "testing", "database", "devops", "docs", "architect"
11. priority MUST be one of: "HIGH", "MEDIUM", "LOW"

EXAMPLE RESPONSE:
{
  "projectAnalysis": {
    "type": "web-app",
    "complexity": "moderate",
    "estimatedTasks": 8,
    "requiredAgents": ["backend", "frontend", "database", "testing"],
    "technologies": ["Node.js", "React", "PostgreSQL"]
  },
  "tasks": [
    {
      "id": "task-001",
      "name": "Design database schema for users",
      "description": "Create users table with email, password, and profile fields",
      "agentType": "database",
      "priority": "HIGH",
      "estimatedCost": 0.12,
      "dependencies": [],
      "files": ["db/migrations/001_create_users.js", "db/models/user.js"],
      "metadata": {
        "tables": ["users"],
        "fields": ["email", "password_hash", "name"]
      }
    },
    {
      "id": "task-002",
      "name": "Create user authentication API",
      "description": "Implement JWT-based login and registration endpoints",
      "agentType": "backend",
      "priority": "HIGH",
      "estimatedCost": 0.18,
      "dependencies": ["task-001"],
      "files": ["src/api/auth.js", "src/middleware/auth.js"],
      "metadata": {
        "endpoints": ["/login", "/register"],
        "authType": "JWT"
      }
    }
  ],
  "dependencyGraph": {
    "sequential": [
      ["task-001", "task-002"]
    ],
    "parallel": [
      ["task-003", "task-004"]
    ]
  },
  "fileAllocation": {
    "src/api/auth.js": ["task-002"],
    "db/models/user.js": ["task-001"]
  },
  "criticalPath": ["task-001", "task-002"],
  "estimatedBudget": 1.25
}

DO NOT wrap your response in markdown code blocks.
DO NOT add any text before or after the JSON.
If you cannot complete the task, return a valid JSON with error field.`;

const TASK_TEMPLATES = {
  ANALYZE_PROPOSAL: (proposal) => `
Analyze the following project proposal and create a comprehensive implementation plan:

${proposal}

Your Analysis Should Include:

1. **Project Type & Complexity**
   - Identify the project type (web app, API, CLI tool, library, etc.)
   - Assess complexity (simple, moderate, complex)
   - Estimate total number of tasks needed

2. **Technology Stack**
   - Backend framework (if applicable)
   - Frontend framework (if applicable)
   - Database (if applicable)
   - Key libraries and dependencies

3. **Core Features**
   - List all features mentioned or implied
   - Prioritize features (critical path first)
   - Identify optional/nice-to-have features

4. **Task Decomposition**
   Break down the project into tasks following these rules:
   - Each task should take 30 minutes to 2 hours
   - Tasks should be single-purpose and testable
   - Assign appropriate specialist agent (backend, frontend, testing, database, devops, docs)
   - Identify dependencies between tasks
   - Assign priorities (HIGH for critical path, MEDIUM for important, LOW for nice-to-have)
   - Estimate API cost for each task (be conservative)

5. **Dependency Analysis**
   - Identify which tasks must be sequential
   - Identify which tasks can run in parallel
   - Determine critical path
   - Flag potential conflicts (multiple agents modifying same file)

6. **File Coordination**
   - List all files that will be created/modified
   - Assign files to specific tasks
   - Identify file conflicts and plan coordination

7. **Budget Estimation**
   - Estimate total API cost
   - Identify high-cost tasks
   - Suggest where to allocate budget priority

Output your response in the required JSON format with comprehensive task breakdown.`,

  REPLAN_AFTER_FAILURE: (context) => `
A task has failed. Analyze the failure and create a recovery plan:

Failed Task:
${JSON.stringify(context.failedTask, null, 2)}

Error:
${context.error}

Current Project State:
- Completed Tasks: ${context.completedTasks.length}
- Pending Tasks: ${context.pendingTasks.length}
- Budget Used: $${context.budgetUsed}
- Budget Remaining: $${context.budgetRemaining}

Recovery Strategy Options:
1. **Retry with Same Agent**: Try again with better context
2. **Assign to Different Agent**: Use a different specialist
3. **Break Down Further**: Split into smaller subtasks
4. **Skip and Continue**: Mark as non-critical and proceed
5. **Request Human Intervention**: Escalate to user

Your Response Should Include:
1. Root cause analysis of the failure
2. Recommended recovery strategy
3. Modified task definition (if breaking down)
4. Updated dependencies (if task order changes)
5. Budget impact

Output your response in the following JSON format:
{
  "analysis": "Description of what went wrong",
  "strategy": "retry" | "reassign" | "breakdown" | "skip" | "escalate",
  "modifiedTasks": [...], // If breaking down or modifying
  "reasoning": "Why this strategy was chosen",
  "budgetImpact": 0.25
}`,

  COORDINATE_HANDOFF: (context) => `
Coordinate a handoff between specialist agents:

Current Task: ${JSON.stringify(context.currentTask, null, 2)}
From Agent: ${context.fromAgent}
To Agent: ${context.toAgent}
Reason: ${context.reason}

Context from Previous Agent:
${JSON.stringify(context.previousContext, null, 2)}

Your Response Should Include:
1. What the next agent needs to know
2. Which files were modified
3. What remains to be done
4. Any constraints or requirements
5. Testing requirements

Output your response in the following JSON format:
{
  "handoffSummary": "Brief description of what was completed",
  "filesModified": ["list of files"],
  "nextSteps": "What the receiving agent should do",
  "context": {
    // Key information for next agent
  },
  "testingNeeded": ["list of test requirements"]
}`,

  BUDGET_REALLOCATION: (context) => `
Budget warning triggered. Analyze remaining tasks and reallocate budget:

Current Budget Status:
- Total Budget: $${context.totalBudget}
- Used: $${context.budgetUsed} (${context.usagePercent}%)
- Reserved: $${context.budgetReserved}
- Available: $${context.budgetAvailable}

Completed Tasks: ${context.completedTasks.length}
Pending Tasks: ${context.pendingTasks.length}

Pending Tasks:
${context.pendingTasks.map(t => `- ${t.name} (${t.priority}, $${t.estimatedCost})`).join('\n')}

Options:
1. **Continue as Planned**: Enough budget remains
2. **Prioritize Critical**: Focus on HIGH priority tasks only
3. **Optimize Prompts**: Reduce token usage in prompts
4. **Request Budget Increase**: Ask user for more budget

Your Response Should Include:
1. Analysis of budget situation
2. Recommended action
3. Which tasks to prioritize/defer
4. Updated budget allocation

Output your response in the following JSON format:
{
  "analysis": "Description of budget situation",
  "recommendation": "continue" | "prioritize" | "optimize" | "increase",
  "prioritizedTasks": ["task-001", "task-002"],
  "deferredTasks": ["task-010", "task-011"],
  "reasoning": "Why this approach",
  "projectedCompletion": "What will be completed with available budget"
}`,

  RESOLVE_FILE_CONFLICT: (context) => `
Multiple tasks need to modify the same file. Coordinate the resolution:

File: ${context.file}

Conflicting Tasks:
${context.tasks.map(t => `- ${t.name} (${t.agentType})`).join('\n')}

Resolution Options:
1. **Sequential**: Execute tasks one after another
2. **Merge**: Combine task requirements and do in one operation
3. **Split File**: Refactor to reduce coupling
4. **Prioritize**: Choose most important task, defer others

Your Response Should Include:
1. Analysis of the conflict
2. Recommended resolution
3. Updated task order/assignments
4. File structure changes if needed

Output your response in the following JSON format:
{
  "analysis": "Description of the conflict",
  "resolution": "sequential" | "merge" | "split" | "prioritize",
  "updatedTasks": [...],
  "reasoning": "Why this resolution",
  "fileChanges": {
    // Any file structure modifications needed
  }
}`,

  GENERATE_STATUS_REPORT: (context) => `
Generate a status report for the user:

Project: ${context.projectName}
Start Time: ${new Date(context.startTime).toISOString()}
Current Time: ${new Date().toISOString()}

Progress:
- Completed: ${context.completedTasks.length} tasks
- In Progress: ${context.inProgressTasks.length} tasks
- Pending: ${context.pendingTasks.length} tasks
- Failed: ${context.failedTasks.length} tasks

Budget:
- Used: $${context.budgetUsed}
- Reserved: $${context.budgetReserved}
- Remaining: $${context.budgetRemaining}

Files:
- Created: ${context.filesCreated.length}
- Modified: ${context.filesModified.length}

Recent Tasks:
${context.recentTasks.map(t => `- ${t.name} (${t.status})`).join('\n')}

Generate a concise, informative status report in markdown format.`
};

/**
 * Generate prompt for coordinator task
 * @param {string} taskType - Type of coordination task
 * @param {Object} context - Context for the task
 * @returns {Object} { systemPrompt, userPrompt }
 */
function generateCoordinatorPrompt(taskType, context = {}) {
  let userPrompt;

  switch (taskType) {
    case 'ANALYZE_PROPOSAL':
      userPrompt = TASK_TEMPLATES.ANALYZE_PROPOSAL(context.proposal);
      break;

    case 'REPLAN_AFTER_FAILURE':
      userPrompt = TASK_TEMPLATES.REPLAN_AFTER_FAILURE(context);
      break;

    case 'COORDINATE_HANDOFF':
      userPrompt = TASK_TEMPLATES.COORDINATE_HANDOFF(context);
      break;

    case 'BUDGET_REALLOCATION':
      userPrompt = TASK_TEMPLATES.BUDGET_REALLOCATION(context);
      break;

    case 'RESOLVE_FILE_CONFLICT':
      userPrompt = TASK_TEMPLATES.RESOLVE_FILE_CONFLICT(context);
      break;

    case 'GENERATE_STATUS_REPORT':
      userPrompt = TASK_TEMPLATES.GENERATE_STATUS_REPORT(context);
      break;

    default:
      userPrompt = `
Coordinate the following task:

${JSON.stringify(context, null, 2)}

Analyze the situation and provide coordination guidance in the appropriate format.`;
  }

  return {
    systemPrompt: COORDINATOR_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.7,
    maxTokens: 4000
  };
}

module.exports = {
  COORDINATOR_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateCoordinatorPrompt
};
