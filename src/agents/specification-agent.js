/**
 * Specification Agent
 * Generates formal specifications for features before implementation
 */

const BaseAgent = require('./base-agent');
const { AgentError } = require('../utils/errors');

class SpecificationAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'specification', communicationHub, options);
  }

  /**
   * Generate formal specification for a feature
   * @param {Object} feature - Feature description from coordinator
   * @param {Object} context - Project context and existing specs
   * @returns {Promise<Object>} Generated specification
   */
  async generateSpecification(feature, context = {}) {
    try {
      // NEW: Include architectural context
      const architecture = context.architecture;
      let component = null;
      let constraints = null;

      if (architecture) {
        // Find the component this feature maps to
        component = architecture.components?.find(c =>
          c.id === feature.componentId ||
          c.name?.toLowerCase().includes(feature.name?.toLowerCase()) ||
          feature.requiredAgents?.some(agent => c.id?.includes(agent))
        );

        // Get applicable constraints
        if (architecture.constraints) {
          const ConstraintEngine = require('../constraints/constraint-engine');
          const engine = new ConstraintEngine();
          engine.loadConstraints(architecture);
          constraints = engine.getConstraintsForComponent(component?.id || feature.id);
        }
      }

      const prompt = this._buildSpecificationPrompt(feature, {
        ...context,
        architecture,
        component,
        constraints,
        patterns: architecture?.patterns
      });

      const response = await this.callClaude(
        [{ role: 'user', content: prompt }],
        {
          systemPrompt: this._getSystemPrompt(architecture),
          temperature: 0.3, // Lower temperature for precise specs
          maxTokens: 4000,
          priority: 'HIGH'
        }
      );

      const spec = this._parseSpecification(response.content, feature);

      // Add architectural context to spec
      if (component) {
        spec.componentId = component.id;
        spec.componentTechnology = component.technology;
      }

      return spec;

    } catch (error) {
      throw new AgentError(
        `Failed to generate specification: ${error.message}`,
        { agentId: this.agentId, featureId: feature.id }
      );
    }
  }

  /**
   * Revise specification based on quality gate feedback
   * @param {Object} spec - Original specification
   * @param {Array} checks - Quality check results
   * @returns {Promise<Object>} Revised specification
   */
  async reviseSpecification(spec, checks) {
    try {
      const issues = checks.flatMap(c => c.issues || []);

      const prompt = this._buildRevisionPrompt(spec, issues);

      const response = await this.callClaude(
        [{ role: 'user', content: prompt }],
        {
          systemPrompt: this._getSystemPrompt(),
          temperature: 0.2,
          maxTokens: 4000,
          priority: 'HIGH'
        }
      );

      const revisedSpec = this._parseSpecification(response.content, spec.feature);
      revisedSpec.specId = spec.specId; // Keep same ID
      revisedSpec.version = (spec.version || 1) + 1;

      return revisedSpec;

    } catch (error) {
      throw new AgentError(
        `Failed to revise specification: ${error.message}`,
        { agentId: this.agentId, specId: spec.specId }
      );
    }
  }

  /**
   * Save specification to state
   */
  async saveSpecification(spec) {
    const key = `spec:${spec.specId}`;
    await this.writeState(key, spec);
  }

  /**
   * Load specification from state
   */
  async loadSpecification(specId) {
    const key = `spec:${specId}`;
    return await this.readState(key);
  }

  /**
   * Build specification generation prompt
   */
  _buildSpecificationPrompt(feature, context) {
    const existingSpecs = context.existingSpecs || [];
    const projectContext = context.projectInfo || {};
    const architecture = context.architecture;
    const component = context.component;
    const constraints = context.constraints;

    let architectureSection = '';
    if (architecture) {
      architectureSection = `
ARCHITECTURAL CONTEXT:
Style: ${architecture.overview?.style}
${component ? `
Mapped Component: ${component.name}
Component Type: ${component.type}
Technology: ${JSON.stringify(component.technology, null, 2)}
Responsibility: ${component.responsibility}
` : ''}
${constraints && constraints.length > 0 ? `
Applicable Constraints:
${constraints.map(c => `- ${c.description} (${c.type})`).join('\n')}
` : ''}
${architecture.patterns ? `
Patterns to Apply:
- Architectural: ${architecture.patterns.architectural?.join(', ') || 'N/A'}
- Design: ${architecture.patterns.design?.join(', ') || 'N/A'}
` : ''}
`;
    }

    return `You are a technical specification writer. Create a formal, detailed specification for this feature that aligns with the system architecture.

PROJECT CONTEXT:
${JSON.stringify(projectContext, null, 2)}

${architectureSection}

FEATURE TO SPECIFY:
ID: ${feature.id}
Name: ${feature.name}
Description: ${feature.description}
Priority: ${feature.priority}
Dependencies: ${JSON.stringify(feature.dependencies || [])}
Required Agents: ${JSON.stringify(feature.requiredAgents || [])}

${existingSpecs.length > 0 ? `
EXISTING SPECIFICATIONS (for reference):
${existingSpecs.map(s => `- ${s.feature?.name}: ${s.specId}`).join('\n')}
` : ''}

TASK: Generate a complete, formal specification with:

1. **API Contracts** (if applicable):
   - Endpoint, method, request/response schemas
   - Status codes and error responses
   - Authentication requirements

2. **Data Schemas**:
   - Entity definitions with fields and types
   - Relationships and constraints
   - Validation rules

3. **Acceptance Criteria** (minimum 2, detailed):
   - ID, description, expected behavior
   - Verification method (unit test, integration test, manual)
   - Testable: true/false

4. **Interfaces** (if applicable):
   - Class/module interfaces
   - Method signatures with parameters and return types
   - Throws clauses

5. **Error Handling**:
   - Error types and conditions
   - Retry behavior (if applicable)
   - User-facing error messages

6. **Security Requirements** (if security-sensitive):
   - Authentication/authorization requirements
   - Data protection requirements
   - Verification methods

Output ONLY valid JSON in this EXACT format:
{
  "specification": {
    "apiContracts": [
      {
        "endpoint": "/api/endpoint",
        "method": "POST",
        "description": "...",
        "requestSchema": { "type": "object", "properties": {...}, "required": [...] },
        "responseSchema": {
          "success": { "status": 200, "body": {...} },
          "error": { "status": 400, "body": {...} }
        },
        "authentication": "required|optional|none"
      }
    ],
    "dataSchemas": [
      {
        "name": "EntityName",
        "type": "object",
        "properties": {
          "field": { "type": "string", "required": true, "description": "..." }
        }
      }
    ],
    "acceptanceCriteria": [
      {
        "id": "AC-001",
        "description": "Clear, specific criterion",
        "expectedBehavior": "Detailed description of expected behavior",
        "verificationMethod": "unit_test|integration_test|manual",
        "testable": true
      }
    ],
    "interfaces": [
      {
        "name": "InterfaceName",
        "type": "class|module",
        "methods": [
          {
            "name": "methodName",
            "parameters": [{ "name": "param", "type": "string" }],
            "returns": { "type": "Promise<Type>" },
            "throws": ["ErrorType"]
          }
        ]
      }
    ],
    "errorHandling": [
      {
        "errorType": "ValidationError",
        "condition": "When request validation fails",
        "retry": false,
        "userMessage": "User-friendly message"
      }
    ],
    "securityRequirements": [
      {
        "requirement": "Password must be hashed with bcrypt",
        "verification": "Check for bcrypt.hash() in code"
      }
    ]
  }
}

IMPORTANT:
- Provide specific, testable acceptance criteria
- Include all relevant API contracts
- Define schemas for all data entities
- Be precise and unambiguous
- Output ONLY the JSON, no markdown or explanation`;
  }

  /**
   * Build revision prompt
   */
  _buildRevisionPrompt(spec, issues) {
    return `You are revising a specification based on quality feedback.

ORIGINAL SPECIFICATION:
${JSON.stringify(spec.specification, null, 2)}

QUALITY ISSUES FOUND:
${issues.map(i => `- [${i.severity}] ${i.message}`).join('\n')}

TASK: Fix the issues and output the complete revised specification.

Rules:
- Address all issues listed above
- Keep the same structure
- Make acceptance criteria more specific and testable
- Ensure API contracts reference defined schemas
- Add missing error handling
- Add verification methods to criteria

Output ONLY valid JSON in the same format as the original.`;
  }

  /**
   * Get system prompt for specification generation
   */
  _getSystemPrompt(architecture = null) {
    return `You are an expert technical specification writer. You create precise, formal specifications that developers can implement exactly as specified. Your specifications are:
- Complete and unambiguous
- Testable and verifiable
- Consistent and well-structured
- Include all necessary details for implementation`;
  }

  /**
   * Parse specification from Claude response
   */
  _parseSpecification(content, feature) {
    try {
      // Extract JSON from response (might be wrapped in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!parsed.specification) {
        throw new Error('Missing specification field');
      }

      // Generate spec ID if not present
      const specId = `spec-${feature.id}-${Date.now()}`;

      return {
        specId,
        featureId: feature.id,
        feature,
        specification: parsed.specification,
        version: 1,
        createdAt: Date.now()
      };

    } catch (error) {
      throw new AgentError(
        `Failed to parse specification: ${error.message}`,
        { agentId: this.agentId }
      );
    }
  }
}

module.exports = SpecificationAgent;
