/**
 * Frontend Agent Prompt Templates
 * Specialized prompts for frontend development tasks
 */

const FRONTEND_SYSTEM_PROMPT = `You are a frontend development specialist in the CodeSwarm autonomous code generation system.

Your role:
- Implement user interfaces and client-side logic
- Create responsive, accessible components
- Implement state management
- Handle API integration on client side
- Follow UI/UX best practices
- Write maintainable, performant frontend code

Guidelines:
- Use modern ES6+ JavaScript/TypeScript
- Follow component-based architecture
- Implement responsive design (mobile-first)
- Ensure accessibility (ARIA labels, semantic HTML)
- Handle loading and error states
- Optimize for performance (lazy loading, code splitting)
- Follow framework conventions (React/Vue/Angular)

ACCESSIBILITY CHECKLIST (WCAG 2.1):
1. Semantic HTML: Use proper elements (button, nav, main, etc.)
2. ARIA labels: Add aria-label, aria-describedby where needed
3. Keyboard navigation: All interactive elements accessible via keyboard
4. Color contrast: Minimum 4.5:1 for normal text, 3:1 for large text
5. Focus indicators: Visible focus states for keyboard users
6. Alt text: Descriptive alt attributes for all images

ERROR STATE PATTERNS:
- Always handle loading, error, and empty states
- Show user-friendly error messages (never expose stack traces)
- Provide retry mechanisms for failed API calls
Example:
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;
  if (!data) return <EmptyState />;
  return <DataDisplay data={data} />;

PROJECT CONTEXT SCHEMA:
You receive projectInfo with this structure:
{
  "frontend": {
    "framework": "react" | "vue" | "angular" | "svelte",
    "language": "javascript" | "typescript",
    "styling": "css" | "scss" | "styled-components" | "tailwind",
    "stateManagement": "useState" | "redux" | "zustand" | "mobx" | "context",
    "router": "react-router" | "vue-router" | "next" | null
  }
}
Adapt your code to match specified frameworks. Use sensible defaults if not specified.

TESTING REQUIREMENTS:
Your code must be testable:
- Export components for unit testing
- Separate business logic from presentation
- Use data-testid attributes for test selectors
- Document expected props and behavior
- Provide test scenarios in testCases array

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
      "path": "relative/path/to/Component.jsx",
      "action": "create",
      "contentBase64": "BASE64_ENCODED_FILE_CONTENT_HERE"
    }
  ],
  "dependencies": ["package-name@version"],
  "assets": ["images or styles needed"],
  "testCases": ["description of test cases needed"],
  "documentation": "brief description of changes"
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
5. dependencies: MUST be array of "package@version" strings
6. assets: MUST be array of strings (can be empty)
7. testCases: MUST be non-empty array of strings
8. documentation: MUST be non-empty string
9. NO trailing commas, NO comments in JSON

EXAMPLE RESPONSE:
{
  "files": [
    {
      "path": "src/components/UserCard.jsx",
      "action": "create",
      "content": "import React from 'react';\\nimport PropTypes from 'prop-types';\\n\\nfunction UserCard({ user, onEdit }) {\\n  return (\\n    <div className=\\"user-card\\" data-testid=\\"user-card\\">\\n      <img src={user.avatar} alt={user.name} />\\n      <h3>{user.name}</h3>\\n      <button onClick={() => onEdit(user.id)} aria-label=\\"Edit user\\">Edit</button>\\n    </div>\\n  );\\n}\\n\\nUserCard.propTypes = {\\n  user: PropTypes.shape({\\n    id: PropTypes.string.isRequired,\\n    name: PropTypes.string.isRequired,\\n    avatar: PropTypes.string\\n  }).isRequired,\\n  onEdit: PropTypes.func.isRequired\\n};\\n\\nexport default UserCard;"
    }
  ],
  "dependencies": ["react@18.2.0", "prop-types@15.8.1"],
  "assets": [],
  "testCases": [
    "Should render user information correctly",
    "Should call onEdit with user id when Edit button clicked",
    "Should have proper ARIA labels for accessibility"
  ],
  "documentation": "Created UserCard component with accessibility features and prop validation"
}

DO NOT wrap your response in markdown code blocks.
DO NOT add any text before or after the JSON.
If you cannot complete the task, return a valid JSON with error field.`;

const TASK_TEMPLATES = {
  CREATE_COMPONENT: (task) => `
Create a frontend component:

Task: ${task.description}
Component Name: ${task.metadata?.componentName || 'Not specified'}
Component Type: ${task.metadata?.componentType || 'Functional'}

Project Context:
- Framework: ${task.projectInfo?.frontend?.framework || 'React'}
- Styling: ${task.projectInfo?.frontend?.styling || 'CSS'}
- State Management: ${task.projectInfo?.frontend?.stateManagement || 'useState/Context'}

Requirements:
1. Create a reusable, well-structured component
2. Handle props validation (PropTypes or TypeScript)
3. Implement proper error boundaries if needed
4. Add loading states for async operations
5. Ensure accessibility (ARIA labels, keyboard navigation)
6. Make it responsive (mobile, tablet, desktop)
7. Follow framework best practices

Component Structure:
- Clear prop interface
- Proper state management
- Event handler implementation
- Conditional rendering
- Error handling

Output your response in the required JSON format.`,

  CREATE_PAGE: (task) => `
Create a page/view component:

Task: ${task.description}
Page Name: ${task.metadata?.pageName || 'Not specified'}
Route: ${task.metadata?.route || 'Not specified'}

Project Context:
- Framework: ${task.projectInfo?.frontend?.framework || 'React'}
- Router: ${task.projectInfo?.frontend?.router || 'React Router'}
- Layout: ${task.projectInfo?.frontend?.layout || 'Not specified'}

Existing Components:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Create page component with proper routing
2. Integrate with layout/navigation
3. Handle page-level state
4. Implement data fetching if needed
5. Add SEO meta tags (title, description)
6. Handle loading and error states
7. Ensure responsive design

Page Elements:
- Header/title
- Main content area
- API integration if needed
- Navigation integration
- Footer if applicable

Output your response in the required JSON format.`,

  IMPLEMENT_STATE_MANAGEMENT: (task) => `
Implement state management:

Task: ${task.description}
State Type: ${task.metadata?.stateType || 'Not specified'}
Scope: ${task.metadata?.scope || 'Global'}

Project Context:
- Framework: ${task.projectInfo?.frontend?.framework || 'React'}
- State Solution: ${task.projectInfo?.frontend?.stateManagement || 'Context API'}

State Requirements:
${JSON.stringify(task.metadata?.stateRequirements || {}, null, 2)}

Requirements:
1. Set up state management solution (Redux/Context/Zustand/etc)
2. Define state structure
3. Implement actions/reducers/mutations
4. Add selectors if applicable
5. Handle async operations (thunks/sagas)
6. Add dev tools integration
7. Document state flow

State Management:
- Clear state structure
- Action creators
- Reducers/handlers
- Middleware if needed
- Provider setup

Output your response in the required JSON format.`,

  CREATE_FORM: (task) => `
Create a form component:

Task: ${task.description}
Form Purpose: ${task.metadata?.formPurpose || 'Not specified'}
Fields: ${JSON.stringify(task.metadata?.fields || [], null, 2)}

Project Context:
- Framework: ${task.projectInfo?.frontend?.framework || 'React'}
- Form Library: ${task.projectInfo?.frontend?.formLibrary || 'None'}
- Validation: ${task.projectInfo?.frontend?.validation || 'Manual'}

Requirements:
1. Create form with all specified fields
2. Implement client-side validation
3. Handle form submission
4. Show validation errors clearly
5. Implement loading state during submission
6. Handle success/error responses
7. Make form accessible (labels, ARIA)

Form Features:
- Controlled inputs
- Validation rules
- Error messages
- Submit handler
- Reset functionality
- Disabled state while submitting

Output your response in the required JSON format.`,

  STYLE_COMPONENT: (task) => `
Style a component:

Task: ${task.description}
Component: ${task.metadata?.component || 'Not specified'}
Styling Approach: ${task.metadata?.stylingApproach || 'Not specified'}

Project Context:
- Styling Solution: ${task.projectInfo?.frontend?.styling || 'CSS'}
- Design System: ${task.projectInfo?.frontend?.designSystem || 'Custom'}
- Theme: ${task.projectInfo?.frontend?.theme || 'Light'}

Design Requirements:
${JSON.stringify(task.metadata?.designRequirements || {}, null, 2)}

Requirements:
1. Apply styles using project's styling solution
2. Ensure responsive design (mobile-first)
3. Follow design system/brand guidelines
4. Implement dark mode if needed
5. Handle hover/focus/active states
6. Ensure accessibility (contrast ratios)
7. Optimize for performance

Styling Checklist:
- Layout (flexbox/grid)
- Typography
- Colors and contrast
- Spacing and alignment
- Responsive breakpoints
- Transitions/animations
- Browser compatibility

Output your response in the required JSON format.`,

  INTEGRATE_API: (task) => `
Integrate API into frontend:

Task: ${task.description}
API Endpoints: ${JSON.stringify(task.metadata?.endpoints || [], null, 2)}
HTTP Client: ${task.projectInfo?.frontend?.httpClient || 'fetch'}

Project Context:
- Framework: ${task.projectInfo?.frontend?.framework || 'React'}
- State Management: ${task.projectInfo?.frontend?.stateManagement || 'useState'}

Requirements:
1. Set up API client/service
2. Implement API call functions
3. Handle authentication (tokens, headers)
4. Implement error handling
5. Add loading states
6. Implement retry logic if needed
7. Cache responses where appropriate

API Integration:
- API service module
- Request/response interceptors
- Error handling
- Loading states
- Success/error notifications
- Data transformation

Output your response in the required JSON format.`,

  FIX_UI_BUG: (task) => `
Fix frontend bug:

Task: ${task.description}
Bug Description: ${task.metadata?.bugDescription || 'Not specified'}
Expected Behavior: ${task.metadata?.expected || 'Not specified'}
Actual Behavior: ${task.metadata?.actual || 'Not specified'}

Affected Component:
${task.existingFiles?.map(f => `${f.path}\n${f.content}`).join('\n\n') || 'Not provided'}

Requirements:
1. Identify root cause of the bug
2. Fix without breaking existing functionality
3. Test in multiple browsers if applicable
4. Verify responsive behavior
5. Check accessibility impact
6. Add comments explaining the fix

Debugging Checklist:
- Console errors
- React DevTools
- Network requests
- State updates
- Event handlers
- CSS specificity issues

Output your response in the required JSON format.`
};

/**
 * Generate prompt for frontend task
 * @param {Object} task - Task object
 * @param {Object} context - Additional context
 * @returns {Object} { systemPrompt, userPrompt }
 */
function generateFrontendPrompt(task, context = {}) {
  const description = task.description.toLowerCase();

  let userPrompt;

  if (description.includes('component') && !description.includes('page')) {
    userPrompt = TASK_TEMPLATES.CREATE_COMPONENT(task);
  } else if (description.includes('page') || description.includes('view') || description.includes('screen')) {
    userPrompt = TASK_TEMPLATES.CREATE_PAGE(task);
  } else if (description.includes('state') || description.includes('redux') || description.includes('context')) {
    userPrompt = TASK_TEMPLATES.IMPLEMENT_STATE_MANAGEMENT(task);
  } else if (description.includes('form')) {
    userPrompt = TASK_TEMPLATES.CREATE_FORM(task);
  } else if (description.includes('style') || description.includes('css') || description.includes('design')) {
    userPrompt = TASK_TEMPLATES.STYLE_COMPONENT(task);
  } else if (description.includes('api') || description.includes('fetch') || description.includes('request')) {
    userPrompt = TASK_TEMPLATES.INTEGRATE_API(task);
  } else if (description.includes('fix') || description.includes('bug')) {
    userPrompt = TASK_TEMPLATES.FIX_UI_BUG(task);
  } else {
    // Generic frontend task
    userPrompt = `
Implement frontend task:

Task: ${task.description}

Project Context:
- Framework: ${task.projectInfo?.frontend?.framework || 'React'}
- Styling: ${task.projectInfo?.frontend?.styling || 'CSS'}
- State Management: ${task.projectInfo?.frontend?.stateManagement || 'useState'}

Existing Files:
${task.existingFiles?.map(f => `- ${f.path}`).join('\n') || 'None'}

Requirements:
1. Follow framework best practices
2. Ensure responsive design
3. Handle loading and error states
4. Ensure accessibility
5. Write clean, maintainable code

Output your response in the required JSON format.`;
  }

  return {
    systemPrompt: FRONTEND_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.7,
    maxTokens: 8000  // Increased from 4000 to handle complex multi-file responses
  };
}

module.exports = {
  FRONTEND_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  generateFrontendPrompt
};
