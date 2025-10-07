const BaseAgent = require('../../base-agent');

class GenericSpecialist extends BaseAgent {
  constructor(communicationHub) {
    super('generic-specialist', 'specification', communicationHub);
  }

  async generate(feature, context) {
    console.log(`[Generic Specialist] Handling non-standard feature: ${feature.name}`);

    // Use a simplified, focused prompt
    const prompt = this.buildFocusedPrompt(feature, context);

    const response = await this.callClaude(
      [{ role: 'user', content: prompt }],
      {
        systemPrompt: 'Generate a concise, well-structured specification. Focus on what is explicitly needed.',
        maxTokens: 2000, // Less than legacy but enough for non-standard features
        temperature: 0.3
      }
    );

    return this.parseResponse(response.content, feature);
  }

  buildFocusedPrompt(feature, context) {
    return `Create a specification for this feature:

Name: ${feature.name}
Description: ${feature.description}
Type: ${context.category || 'general'}
Required Agents: ${JSON.stringify(feature.requiredAgents || [])}

Generate a JSON specification with:
1. apiContracts - if APIs are needed
2. dataSchemas - data structures
3. acceptanceCriteria - at least 2 testable criteria
4. errorHandling - common error cases

Focus on what's explicitly mentioned. Don't over-specify.

Output valid JSON only.`;
  }

  parseResponse(content, feature) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const specification = JSON.parse(jsonMatch[0]);

      return {
        specId: `spec-${feature.id}-${Date.now()}`,
        featureId: feature.id,
        feature,
        specification,
        version: 1,
        createdAt: Date.now(),
        generatedBy: 'generic-specialist'
      };
    } catch (error) {
      console.error('[Generic Specialist] Failed to parse response:', error);
      // Return minimal valid specification
      return {
        specId: `spec-${feature.id}-${Date.now()}`,
        featureId: feature.id,
        feature,
        specification: {
          apiContracts: [],
          dataSchemas: [],
          acceptanceCriteria: [
            {
              id: 'AC-001',
              description: feature.name,
              expectedBehavior: feature.description,
              verificationMethod: 'manual',
              testable: false
            }
          ],
          errorHandling: []
        },
        version: 1,
        createdAt: Date.now(),
        generatedBy: 'generic-specialist-fallback'
      };
    }
  }
}

module.exports = GenericSpecialist;
