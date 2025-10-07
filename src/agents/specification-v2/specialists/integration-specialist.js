const BaseAgent = require('../../base-agent');

class IntegrationSpecialist extends BaseAgent {
  constructor(communicationHub) {
    super('integration-specialist', 'specification', communicationHub);
  }

  async generate(feature, context) {
    console.log(`[Integration Specialist] Generating spec for: ${feature.name}`);

    const prompt = `Create an integration specification for:

Feature: ${feature.name}
Description: ${feature.description}

Focus on:
1. External API endpoints we need to call
2. Authentication methods required
3. Data transformation between systems
4. Error handling for network issues
5. Rate limiting and retry logic

Generate JSON with:
- apiContracts: Our endpoints
- externalAPIs: External endpoints we consume
- dataMapping: Field transformations
- errorHandling: Integration-specific errors
- retryPolicy: Retry configuration

Be specific about integration points.`;

    const response = await this.callClaude(
      [{ role: 'user', content: prompt }],
      {
        systemPrompt: 'You are an integration expert. Focus on system interoperability.',
        maxTokens: 1500,
        temperature: 0.3
      }
    );

    return this.parseResponse(response.content, feature);
  }

  parseResponse(content, feature) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const specification = JSON.parse(jsonMatch[0]);

      // Ensure integration-specific fields
      if (!specification.externalAPIs) specification.externalAPIs = [];
      if (!specification.retryPolicy) {
        specification.retryPolicy = {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelay: 1000
        };
      }

      return {
        specId: `spec-${feature.id}-${Date.now()}`,
        featureId: feature.id,
        feature,
        specification,
        version: 1,
        createdAt: Date.now(),
        generatedBy: 'integration-specialist'
      };
    } catch (error) {
      // Fallback to generic specialist
      throw error;
    }
  }
}

module.exports = IntegrationSpecialist;
