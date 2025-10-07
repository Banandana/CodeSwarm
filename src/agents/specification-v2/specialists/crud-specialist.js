const BaseAgent = require('../../base-agent');

class CRUDSpecialist extends BaseAgent {
  constructor(communicationHub) {
    super('crud-specialist', 'specification', communicationHub);
    this.template = this.loadTemplate();
  }

  loadTemplate() {
    // Base CRUD template
    return {
      apiContracts: [
        {
          endpoint: '/api/resources',
          method: 'GET',
          description: 'List all resources',
          authentication: 'required',
          requestSchema: {
            type: 'object',
            properties: {
              page: { type: 'integer', default: 1 },
              limit: { type: 'integer', default: 20 },
              sort: { type: 'string' },
              filter: { type: 'object' }
            }
          },
          responseSchema: {
            success: {
              status: 200,
              body: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: '#/definitions/Resource' } },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' }
                }
              }
            }
          }
        },
        {
          endpoint: '/api/resources/:id',
          method: 'GET',
          description: 'Get resource by ID',
          authentication: 'required'
        },
        {
          endpoint: '/api/resources',
          method: 'POST',
          description: 'Create new resource',
          authentication: 'required'
        },
        {
          endpoint: '/api/resources/:id',
          method: 'PUT',
          description: 'Update resource',
          authentication: 'required'
        },
        {
          endpoint: '/api/resources/:id',
          method: 'DELETE',
          description: 'Delete resource',
          authentication: 'required'
        }
      ],
      dataSchemas: [
        {
          name: 'Resource',
          type: 'object',
          properties: {
            id: { type: 'string', required: true },
            createdAt: { type: 'string', format: 'date-time', required: true },
            updatedAt: { type: 'string', format: 'date-time', required: true }
          }
        }
      ],
      acceptanceCriteria: [
        {
          id: 'AC-001',
          description: 'User can create a new resource',
          expectedBehavior: 'POST request creates resource and returns it with generated ID',
          verificationMethod: 'integration_test',
          testable: true
        },
        {
          id: 'AC-002',
          description: 'User can retrieve resource by ID',
          expectedBehavior: 'GET request returns resource data for valid ID',
          verificationMethod: 'integration_test',
          testable: true
        },
        {
          id: 'AC-003',
          description: 'User can update existing resource',
          expectedBehavior: 'PUT request updates resource and returns updated data',
          verificationMethod: 'integration_test',
          testable: true
        },
        {
          id: 'AC-004',
          description: 'User can delete resource',
          expectedBehavior: 'DELETE request removes resource and returns success',
          verificationMethod: 'integration_test',
          testable: true
        }
      ],
      errorHandling: [
        {
          errorType: 'ValidationError',
          condition: 'Invalid input data',
          retry: false,
          userMessage: 'Please check your input and try again'
        },
        {
          errorType: 'NotFoundError',
          condition: 'Resource not found',
          retry: false,
          userMessage: 'The requested resource was not found'
        }
      ]
    };
  }

  async generate(feature, context) {
    console.log(`[CRUD Specialist] Generating spec for: ${feature.name}`);

    // Extract resource name from feature
    const resourceName = this.extractResourceName(feature);

    // Start with template
    let spec = JSON.parse(JSON.stringify(this.template));

    // Customize template for this resource
    spec = this.customizeTemplate(spec, resourceName, feature);

    // Get specific fields and rules from Claude (focused call)
    const customization = await this.getResourceSpecifics(feature, resourceName);

    // Apply customization
    spec = this.applyCustomization(spec, customization);

    // Format as specification
    return {
      specId: `spec-${feature.id}-${Date.now()}`,
      featureId: feature.id,
      feature,
      specification: spec,
      version: 1,
      createdAt: Date.now(),
      generatedBy: 'crud-specialist'
    };
  }

  extractResourceName(feature) {
    // Try to extract the resource name from feature
    const name = feature.name.toLowerCase();

    // Common patterns
    const patterns = [
      /manage\s+(\w+)/,
      /(\w+)\s+management/,
      /(\w+)\s+crud/,
      /create\s+(\w+)/
    ];

    for (const pattern of patterns) {
      const match = name.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Fallback: use first significant word
    const words = name.split(' ').filter(w =>
      !['the', 'a', 'an', 'create', 'manage', 'add'].includes(w.toLowerCase())
    );

    return words[0] || 'resource';
  }

  customizeTemplate(template, resourceName, feature) {
    const singular = resourceName;
    const plural = this.pluralize(resourceName);
    const capitalized = singular.charAt(0).toUpperCase() + singular.slice(1);

    // Deep clone and replace
    const json = JSON.stringify(template);
    const customized = json
      .replace(/resources/g, plural)
      .replace(/resource/g, singular)
      .replace(/Resource/g, capitalized);

    return JSON.parse(customized);
  }

  async getResourceSpecifics(feature, resourceName) {
    const prompt = `For a ${resourceName} CRUD feature: "${feature.description}"

Provide ONLY the additional fields needed for the data schema and any special validation rules.

Return as JSON:
{
  "fields": [
    { "name": "fieldName", "type": "string", "required": true, "description": "..." }
  ],
  "validations": [
    { "field": "fieldName", "rule": "...", "message": "..." }
  ],
  "additionalEndpoints": []
}

Be concise. Only include what's specifically mentioned or clearly needed.`;

    try {
      const response = await this.callClaude(
        [{ role: 'user', content: prompt }],
        {
          systemPrompt: 'You are a specification expert. Provide minimal, focused customizations for CRUD operations.',
          maxTokens: 800,
          temperature: 0.2
        }
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn(`[CRUD Specialist] Failed to get customization:`, error.message);
    }

    // Return empty customization on error
    return { fields: [], validations: [], additionalEndpoints: [] };
  }

  applyCustomization(spec, customization) {
    // Add custom fields to data schema
    if (customization.fields && customization.fields.length > 0) {
      const schema = spec.dataSchemas[0];
      customization.fields.forEach(field => {
        schema.properties[field.name] = {
          type: field.type,
          required: field.required,
          description: field.description
        };
      });
    }

    // Add validation rules
    if (customization.validations && customization.validations.length > 0) {
      // Add to error handling or create validation section
      customization.validations.forEach(validation => {
        spec.errorHandling.push({
          errorType: 'ValidationError',
          condition: validation.rule,
          field: validation.field,
          userMessage: validation.message
        });
      });
    }

    return spec;
  }

  pluralize(word) {
    // Simple pluralization
    if (word.endsWith('y')) {
      return word.slice(0, -1) + 'ies';
    }
    if (word.endsWith('s')) {
      return word + 'es';
    }
    return word + 's';
  }

  async refine(spec, qualityReport) {
    console.log(`[CRUD Specialist] Refining specification`);

    // Extract specific issues
    const issues = qualityReport.checks
      .filter(c => !c.passed)
      .flatMap(c => c.issues || []);

    if (issues.length === 0) return spec;

    // Build focused refinement prompt
    const prompt = `Fix these specific issues in the CRUD specification:

${issues.map(i => `- ${i.message}`).join('\n')}

Current specification section that needs fixing:
${JSON.stringify(spec.specification, null, 2).substring(0, 1000)}

Provide ONLY the fixes needed, not the entire specification.`;

    const response = await this.callClaude(
      [{ role: 'user', content: prompt }],
      {
        systemPrompt: 'Fix the specific issues mentioned. Be surgical and precise.',
        maxTokens: 500,
        temperature: 0.1
      }
    );

    // Apply fixes (this is simplified - real implementation would be more sophisticated)
    // For now, just return the original spec with a version bump
    spec.version = (spec.version || 1) + 1;
    spec.refined = true;

    return spec;
  }
}

module.exports = CRUDSpecialist;
