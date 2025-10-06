/**
 * Documentation Agent Prompt Templates
 * Specialized prompts for documentation generation tasks
 */

const DOCS_SYSTEM_PROMPT = `You are a technical documentation specialist in the CodeSwarm autonomous code generation system.

Your role:
- Generate comprehensive technical documentation
- Write clear, accurate API documentation
- Create user guides and tutorials
- Document code with meaningful comments
- Maintain consistency across documentation
- Ensure documentation is up-to-date with code

Guidelines:
- Write in clear, concise language
- Use proper markdown formatting
- Include code examples where relevant
- Document all parameters, return values, and exceptions
- Follow documentation best practices
- Make docs accessible to target audience
- Include diagrams where helpful
- Keep documentation maintainable

You MUST respond in the following JSON format:
{
  "files": [
    {
      "path": "relative/path/to/file.md",
      "action": "create" | "modify",
      "content": "full file content"
    }
  ],
  "sections": ["list of documented sections"],
  "coverage": "percentage of code documented",
  "documentation": "brief description of documentation changes"
}`;

const TASK_TEMPLATES = {
  GENERATE_API_DOCS: (task) => `
Generate API documentation:

Task: ${task.description}
API Type: ${task.metadata?.apiType || 'REST'}
Documentation Format: ${task.metadata?.format || 'Markdown'}

Project Context:
- Language: ${task.projectInfo?.backend?.language || 'JavaScript'}
- Framework: ${task.projectInfo?.backend?.framework || 'Express'}
- API Version: ${task.projectInfo?.apiVersion || '1.0.0'}

Source Files:
${task.existingFiles?.map(f => `${f.path}\n${f.content.substring(0, 500)}...`).join('\n\n') || 'Not provided'}

Requirements:
1. Document all endpoints with HTTP methods
2. Document request parameters (path, query, body)
3. Document response formats and status codes
4. Include authentication/authorization requirements
5. Provide example requests and responses
6. Document error responses
7. Add rate limiting information if applicable

API Documentation Structure:
- Overview and base URL
- Authentication section
- Endpoint documentation:
  - Method and path
  - Description
  - Parameters (required/optional)
  - Request body schema
  - Response schema
  - Status codes
  - Example request/response
  - Error scenarios

Output your response in the required JSON format.`,

  CREATE_README: (task) => `
Create README.md file:

Task: ${task.description}
Project Name: ${task.metadata?.projectName || 'Not specified'}
Project Type: ${task.metadata?.projectType || 'Not specified'}

Project Context:
${JSON.stringify(task.projectInfo || {}, null, 2)}

Existing Files:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Create comprehensive README.md
2. Include project title and description
3. Add installation instructions
4. Document usage examples
5. List prerequisites and dependencies
6. Include configuration instructions
7. Add contributing guidelines reference
8. Include license information

README Structure:
- Project title and badges
- Description and features
- Table of contents
- Prerequisites
- Installation steps
- Configuration
- Usage examples
- API documentation link (if applicable)
- Testing instructions
- Contributing
- License
- Contact/support information

Make it clear, professional, and helpful for new users.

Output your response in the required JSON format.`,

  ADD_CODE_COMMENTS: (task) => `
Add documentation comments to code:

Task: ${task.description}
Documentation Style: ${task.metadata?.style || 'JSDoc'}
Coverage Target: ${task.metadata?.coverage || 'All public APIs'}

Source Code:
${task.existingFiles?.map(f => `File: ${f.path}\n${f.content}`).join('\n\n') || 'Not provided'}

Requirements:
1. Add documentation comments to all functions/classes
2. Document parameters with types and descriptions
3. Document return values
4. Document thrown exceptions/errors
5. Add usage examples where helpful
6. Document edge cases and gotchas
7. Use appropriate doc comment style (JSDoc/docstring/etc)

Documentation Comment Requirements:
- Function/method purpose
- Parameter descriptions with types
- Return value description with type
- Exceptions that may be thrown
- Usage examples for complex functions
- Notes about side effects
- Deprecation notices if applicable

Follow language-specific conventions:
- JavaScript: JSDoc format
- Python: Google/NumPy docstring style
- TypeScript: TSDoc format
- Other: Language-appropriate style

Output your response in the required JSON format with modified files.`,

  CREATE_ARCHITECTURE_DOC: (task) => `
Create architecture documentation:

Task: ${task.description}
Architecture Type: ${task.metadata?.architectureType || 'System Architecture'}

Project Context:
${JSON.stringify(task.projectInfo || {}, null, 2)}

Existing Files (for reference):
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Document system architecture and design
2. Describe major components and their responsibilities
3. Document data flow and interactions
4. Include architecture diagrams (ASCII/Mermaid)
5. Document design decisions and rationale
6. Describe scalability considerations
7. Document security architecture

Architecture Documentation Structure:
- System overview
- Architecture diagram
- Component descriptions:
  - Purpose and responsibility
  - Key classes/modules
  - Dependencies
  - API surface
- Data flow diagrams
- Design decisions:
  - What was decided
  - Why it was decided
  - Alternatives considered
- Technology stack
- Deployment architecture
- Security considerations
- Performance considerations
- Future improvements

Output your response in the required JSON format.`,

  CREATE_USER_GUIDE: (task) => `
Create user guide:

Task: ${task.description}
Target Audience: ${task.metadata?.audience || 'End users'}
Guide Type: ${task.metadata?.guideType || 'User manual'}

Project Context:
- Project Type: ${task.projectInfo?.projectType || 'Not specified'}
- Features: ${JSON.stringify(task.projectInfo?.features || [], null, 2)}

Requirements:
1. Write comprehensive user guide
2. Use clear, non-technical language
3. Include step-by-step instructions
4. Add screenshots/diagrams (descriptions)
5. Cover all major features
6. Include troubleshooting section
7. Add FAQ section

User Guide Structure:
- Introduction and overview
- Getting started
  - Account setup
  - First-time configuration
- Feature guides:
  - Feature description
  - Step-by-step instructions
  - Screenshots (described)
  - Tips and best practices
- Advanced usage
- Troubleshooting
  - Common issues
  - Solutions
- FAQ
- Glossary
- Support and contact

Make it accessible to non-technical users.

Output your response in the required JSON format.`,

  CREATE_CONTRIBUTING_GUIDE: (task) => `
Create contributing guide:

Task: ${task.description}
Project Type: ${task.metadata?.projectType || 'Open source'}

Project Context:
- Language: ${task.projectInfo?.backend?.language || 'JavaScript'}
- Framework: ${task.projectInfo?.backend?.framework || 'Express'}
- Testing: ${task.projectInfo?.testing?.framework || 'Jest'}

Development Setup:
${JSON.stringify(task.projectInfo?.development || {}, null, 2)}

Requirements:
1. Create CONTRIBUTING.md file
2. Document development setup
3. Explain code style and conventions
4. Document testing requirements
5. Explain pull request process
6. Include code of conduct reference
7. Document commit message format

Contributing Guide Structure:
- Introduction and welcome
- Code of conduct
- How to contribute:
  - Reporting bugs
  - Suggesting features
  - Submitting changes
- Development setup:
  - Prerequisites
  - Installation steps
  - Running locally
- Code guidelines:
  - Style guide
  - Naming conventions
  - Best practices
- Testing requirements:
  - Writing tests
  - Running tests
  - Coverage requirements
- Pull request process:
  - Branch naming
  - Commit messages
  - PR description
  - Review process
- Community and support

Output your response in the required JSON format.`,

  UPDATE_CHANGELOG: (task) => `
Update CHANGELOG:

Task: ${task.description}
Version: ${task.metadata?.version || 'Not specified'}
Release Type: ${task.metadata?.releaseType || 'Not specified'}

Recent Changes:
${JSON.stringify(task.metadata?.changes || [], null, 2)}

Existing Changelog:
${task.existingFiles?.[0]?.content || 'No existing changelog'}

Requirements:
1. Follow Keep a Changelog format
2. Add new version entry
3. Categorize changes appropriately
4. Include dates
5. Maintain reverse chronological order
6. Link to relevant issues/PRs if applicable

Changelog Categories:
- Added: New features
- Changed: Changes in existing functionality
- Deprecated: Soon-to-be removed features
- Removed: Removed features
- Fixed: Bug fixes
- Security: Security fixes

Format:
## [Version] - YYYY-MM-DD
### Added
- New feature description

### Fixed
- Bug fix description

Output your response in the required JSON format.`
};

/**
 * Generate prompt for documentation task
 * @param {Object} task - Task object
 * @param {Object} context - Additional context
 * @returns {Object} { systemPrompt, userPrompt }
 */
function generateDocsPrompt(task, context = {}) {
  const description = task.description.toLowerCase();

  let userPrompt;

  if (description.includes('api') && (description.includes('doc') || description.includes('documentation'))) {
    userPrompt = TASK_TEMPLATES.GENERATE_API_DOCS(task);
  } else if (description.includes('readme')) {
    userPrompt = TASK_TEMPLATES.CREATE_README(task);
  } else if (description.includes('comment') || description.includes('jsdoc') || description.includes('docstring')) {
    userPrompt = TASK_TEMPLATES.ADD_CODE_COMMENTS(task);
  } else if (description.includes('architecture') || description.includes('design doc')) {
    userPrompt = TASK_TEMPLATES.CREATE_ARCHITECTURE_DOC(task);
  } else if (description.includes('user guide') || description.includes('manual') || description.includes('tutorial')) {
    userPrompt = TASK_TEMPLATES.CREATE_USER_GUIDE(task);
  } else if (description.includes('contributing') || description.includes('contribution')) {
    userPrompt = TASK_TEMPLATES.CREATE_CONTRIBUTING_GUIDE(task);
  } else if (description.includes('changelog')) {
    userPrompt = TASK_TEMPLATES.UPDATE_CHANGELOG(task);
  } else {
    // Generic documentation task
    userPrompt = `
Generate documentation:

Task: ${task.description}

Project Context:
${JSON.stringify(task.projectInfo || {}, null, 2)}

Existing Files:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Create clear, comprehensive documentation
2. Use proper markdown formatting
3. Include code examples where relevant
4. Ensure accuracy and completeness
5. Make it easy to understand
6. Follow documentation best practices

Output your response in the required JSON format.`;
  }

  return {
    systemPrompt: DOCS_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.6, // Slightly lower for consistent documentation
    maxTokens: 4000
  };
}

module.exports = {
  DOCS_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateDocsPrompt
};
