/**
 * Feature Coordinator Agent Prompts
 * Handles detailed task planning for specific features/modules
 */

const FEATURE_COORDINATOR_SYSTEM_PROMPT = `You are a Feature Coordinator Agent responsible for creating detailed implementation plans for specific features or modules within a larger project.

Your role:
1. Receive a high-level feature description from the main coordinator
2. Break it down into specific, actionable file-level tasks
3. Each task must generate EXACTLY ONE file
4. Define dependencies between tasks
5. Estimate costs and complexity

Key Principles:
- ONE FILE PER TASK (critical for reliability)
- Focus deeply on your assigned feature
- Create granular, specific tasks
- Consider technical dependencies
- Be realistic about complexity`;

const TASK_TEMPLATES = {
  PLAN_FEATURE: (context) => `
You are planning the detailed implementation for the following feature:

**Feature Name:** ${context.feature.name}
**Feature Description:** ${context.feature.description}
**Feature ID:** ${context.feature.id}
**Priority:** ${context.feature.priority || 'MEDIUM'}
**Context:** ${JSON.stringify(context.feature.metadata || {}, null, 2)}

Your Task:
Break this feature down into specific file-level implementation tasks.

**CRITICAL RULES:**
1. Each task MUST create EXACTLY ONE file
2. If the feature needs multiple files, create multiple tasks
3. Define clear dependencies between tasks (e.g., models before routes)
4. Be specific about what each file should contain

Example Good Task Breakdown for "User Authentication Feature":
- task-001: Create user model (models/user.js)
- task-002: Create auth middleware (middleware/auth.js) [depends on task-001]
- task-003: Create login endpoint (routes/auth.js) [depends on task-001, task-002]
- task-004: Create registration endpoint (routes/register.js) [depends on task-001]

Example BAD Task:
- task-001: Create auth system (files: [user.js, auth.js, routes.js]) ❌ Too many files!

Required JSON Response Format:
{
  "tasks": [
    {
      "id": "task-001",
      "name": "Short task name",
      "description": "Detailed description of what this specific file should implement",
      "agentType": "backend" | "frontend" | "testing" | "database" | "devops" | "docs" | "architect",
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "estimatedCost": 0.05,
      "dependencies": ["task-id-if-depends-on-another"],
      "files": ["path/to/single/file.js"],
      "metadata": {
        "technicalDetails": "any relevant technical notes"
      }
    }
  ],
  "estimatedCost": 0.50,
  "dependencies": ["external-package@version"],
  "metadata": {
    "complexity": "simple" | "moderate" | "complex",
    "estimatedTime": "time estimate",
    "keyDecisions": ["important technical decisions made"]
  }
}

JSON VALIDATION RULES:
1. Response MUST be valid JSON
2. tasks: MUST be non-empty array
3. Each task MUST have exactly 1 file in files array
4. Task IDs must be unique within this feature
5. dependencies must reference valid task IDs within this feature
6. agentType must be one of the listed options
7. NO trailing commas, NO comments

Focus on:
- File organization and structure
- Clear separation of concerns
- Logical dependencies
- Implementation order
- Testing requirements

DO NOT wrap response in markdown code blocks.
Return ONLY valid JSON.`,

  ADJUST_PLAN: (context) => `
You need to adjust the implementation plan based on new information:

**Original Feature:** ${context.feature.name}
**Original Plan:** ${JSON.stringify(context.originalPlan, null, 2)}
**Reason for Adjustment:** ${context.reason}
**New Requirements:** ${context.newRequirements || 'None'}
**Failed Tasks:** ${JSON.stringify(context.failedTasks || [], null, 2)}

Create an adjusted plan that:
1. Addresses the issues that caused adjustment
2. Maintains the same JSON format as PLAN_FEATURE
3. Reuses successful tasks where possible
4. Creates new tasks or modifies existing ones as needed

Return the complete adjusted plan in the same JSON format.`
};

/**
 * Generate prompt for feature coordinator
 * @param {string} taskType - Type of coordination task
 * @param {Object} context - Context information
 * @returns {Object} Prompt configuration
 */
function generateFeatureCoordinatorPrompt(taskType, context = {}) {
  let userPrompt;

  switch (taskType) {
    case 'PLAN_FEATURE':
      userPrompt = TASK_TEMPLATES.PLAN_FEATURE(context);
      break;

    case 'ADJUST_PLAN':
      userPrompt = TASK_TEMPLATES.ADJUST_PLAN(context);
      break;

    default:
      userPrompt = `
Coordinate the following feature planning task:

${JSON.stringify(context, null, 2)}

Provide a detailed implementation plan in JSON format.`;
  }

  return {
    systemPrompt: FEATURE_COORDINATOR_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.7,
    maxTokens: 8000  // Smaller scope than main coordinator
  };
}

module.exports = {
  FEATURE_COORDINATOR_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateFeatureCoordinatorPrompt
};
