# Specification System V2 - Step-by-Step Implementation Guide

## Quick Start: Minimal Working Implementation

This guide provides the exact steps to implement a working version of the new specification system with minimal changes to existing code.

## Step 1: Create Directory Structure

```bash
mkdir -p src/agents/specification-v2/specialists
mkdir -p src/agents/specification-v2/cache
```

## Step 2: Create Feature Flag in Coordinator

**File:** `src/agents/coordinator-agent.js`

Add after the existing `generateSpecifications` method:

```javascript
// Add this method to check if we should use new system
shouldUseNewSpecificationSystem() {
  // Start with explicit control via environment variable
  if (process.env.USE_NEW_SPEC_SYSTEM === 'true') return true;
  if (process.env.USE_NEW_SPEC_SYSTEM === 'false') return false;

  // Default to false initially
  return false;
}

// Add new method for V2 system
async generateSpecificationsV2(projectContext = {}) {
  console.log(`[${this.agentId}] Using NEW specification system for ${this.orchestration.features.length} features`);

  const SpecificationSystemV2 = require('./specification-v2');
  const qualityGate = new (require('../validation/spec-quality-gate'))();
  const specSystem = new SpecificationSystemV2(this.communicationHub);

  const specifications = [];

  for (const feature of this.orchestration.features) {
    let spec = null;
    let attempts = 0;
    const maxAttempts = 2; // Fewer attempts needed with better system

    while (attempts < maxAttempts) {
      try {
        attempts++;
        spec = await specSystem.generateSpecification(feature, {
          ...projectContext,
          existingSpecs: specifications,
          architecture: this.orchestration.architecture
        });

        // Use existing quality gate
        const quality = await qualityGate.validateSpec(spec);
        console.log(`[${this.agentId}] Spec quality: ${quality.overallScore}/100`);

        if (quality.recommendation === 'accept') {
          specifications.push(spec);
          break;
        } else if (quality.recommendation === 'revise' && attempts < maxAttempts) {
          spec = await specSystem.refineSpecification(spec, quality);
        }

      } catch (error) {
        console.error(`[${this.agentId}] Spec generation failed:`, error.message);
        if (attempts >= maxAttempts) {
          console.warn(`[${this.agentId}] Falling back to legacy system for ${feature.name}`);
          // Fallback to legacy for this feature
          const SpecificationAgent = require('./specification-agent');
          const legacyAgent = new SpecificationAgent('spec-fallback', this.communicationHub);
          await legacyAgent.initialize();
          spec = await legacyAgent.generateSpecification(feature, projectContext);
          specifications.push(spec);
          break;
        }
      }
    }
  }

  console.log(`[${this.agentId}] Generated ${specifications.length} specifications with new system`);
  return specifications;
}

// Modify existing generateSpecifications to route
async generateSpecifications(projectContext = {}) {
  if (this.shouldUseNewSpecificationSystem()) {
    return await this.generateSpecificationsV2(projectContext);
  }

  // ... existing implementation continues unchanged
  console.log(`[${this.agentId}] Using LEGACY specification system for ${this.orchestration.features.length} features`);
  // ... rest of existing code
}
```

## Step 3: Create Main V2 System

**File:** `src/agents/specification-v2/index.js`

```javascript
const FeatureAnalyzer = require('./feature-analyzer');
const SpecificationCache = require('./cache/specification-cache');

class SpecificationSystemV2 {
  constructor(communicationHub) {
    this.hub = communicationHub;
    this.analyzer = new FeatureAnalyzer();
    this.cache = new SpecificationCache();

    // Load specialists
    this.specialists = {
      crud: new (require('./specialists/crud-specialist'))(communicationHub),
      integration: new (require('./specialists/integration-specialist'))(communicationHub),
      generic: new (require('./specialists/generic-specialist'))(communicationHub)
    };
  }

  async generateSpecification(feature, context) {
    console.log(`[SpecV2] Generating specification for: ${feature.name}`);

    // 1. Analyze feature type
    const analysis = this.analyzer.analyze(feature, context);
    console.log(`[SpecV2] Feature categorized as: ${analysis.category}`);

    // 2. Check cache
    const cacheKey = this.getCacheKey(feature, analysis);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`[SpecV2] Cache hit for ${feature.name}`);
      return this.adaptCachedSpec(cached, feature, context);
    }

    // 3. Route to appropriate specialist
    const specialist = this.specialists[analysis.category] || this.specialists.generic;

    // 4. Generate specification
    const spec = await specialist.generate(feature, {
      ...context,
      analysis,
      category: analysis.category
    });

    // 5. Cache the result
    this.cache.set(cacheKey, spec);

    return spec;
  }

  async refineSpecification(spec, qualityReport) {
    console.log(`[SpecV2] Refining specification for: ${spec.feature.name}`);

    // Use the same specialist that generated it
    const analysis = this.analyzer.analyze(spec.feature, {});
    const specialist = this.specialists[analysis.category] || this.specialists.generic;

    if (specialist.refine) {
      return await specialist.refine(spec, qualityReport);
    }

    // If specialist doesn't support refinement, regenerate with more context
    return await specialist.generate(spec.feature, {
      previousSpec: spec,
      issues: qualityReport.issues,
      refinement: true
    });
  }

  getCacheKey(feature, analysis) {
    return `${analysis.category}:${feature.name}:${this.hashFeature(feature)}`;
  }

  hashFeature(feature) {
    const str = JSON.stringify({
      name: feature.name,
      description: feature.description,
      requiredAgents: feature.requiredAgents
    });
    return require('crypto').createHash('md5').update(str).digest('hex').substr(0, 8);
  }

  adaptCachedSpec(cached, feature, context) {
    // Adapt cached spec to new feature
    const adapted = JSON.parse(JSON.stringify(cached));
    adapted.featureId = feature.id;
    adapted.feature = feature;
    adapted.createdAt = Date.now();
    adapted.fromCache = true;
    return adapted;
  }
}

module.exports = SpecificationSystemV2;
```

## Step 4: Create Feature Analyzer

**File:** `src/agents/specification-v2/feature-analyzer.js`

```javascript
class FeatureAnalyzer {
  analyze(feature, context) {
    const description = `${feature.name} ${feature.description}`.toLowerCase();

    // Calculate category scores
    const scores = {
      crud: this.scoreCRUD(description, feature),
      integration: this.scoreIntegration(description, feature),
      workflow: this.scoreWorkflow(description, feature),
      generic: 10 // Base score for generic
    };

    // Find highest scoring category
    let maxScore = 0;
    let category = 'generic';

    for (const [cat, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        category = cat;
      }
    }

    // Calculate complexity
    const complexity = this.calculateComplexity(feature);

    return {
      category,
      scores,
      complexity,
      confidence: maxScore / 100
    };
  }

  scoreCRUD(description, feature) {
    let score = 0;

    // CRUD keywords
    const crudOps = ['create', 'read', 'update', 'delete', 'list', 'get', 'set', 'save', 'remove', 'fetch'];
    const dataWords = ['data', 'record', 'entity', 'model', 'resource', 'item', 'object'];

    // Check for CRUD operations
    crudOps.forEach(op => {
      if (description.includes(op)) score += 15;
    });

    // Check for data-related terms
    dataWords.forEach(word => {
      if (description.includes(word)) score += 10;
    });

    // Check if it's primarily backend work
    if (feature.requiredAgents?.includes('backend') &&
        feature.requiredAgents?.includes('database')) {
      score += 20;
    }

    // Penalty if it mentions complex workflows
    if (description.includes('workflow') || description.includes('process')) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }

  scoreIntegration(description, feature) {
    let score = 0;

    const integrationWords = ['api', 'external', 'third-party', 'integration', 'webhook',
                              'sync', 'import', 'export', 'connect', 'service'];

    integrationWords.forEach(word => {
      if (description.includes(word)) score += 20;
    });

    // Check for specific integration patterns
    if (description.includes('oauth') || description.includes('auth')) score += 15;
    if (description.includes('payment') || description.includes('stripe')) score += 25;

    return Math.min(100, score);
  }

  scoreWorkflow(description, feature) {
    let score = 0;

    const workflowWords = ['workflow', 'process', 'flow', 'pipeline', 'sequence',
                           'approval', 'review', 'stage', 'step'];

    workflowWords.forEach(word => {
      if (description.includes(word)) score += 20;
    });

    return Math.min(100, score);
  }

  calculateComplexity(feature) {
    let complexity = 'simple';

    // Factor in dependencies
    if (feature.dependencies?.length > 2) complexity = 'medium';
    if (feature.dependencies?.length > 5) complexity = 'complex';

    // Factor in number of required agents
    if (feature.requiredAgents?.length > 3) complexity = 'medium';
    if (feature.requiredAgents?.length > 5) complexity = 'complex';

    // Factor in description length
    if (feature.description?.length > 500) complexity = 'complex';

    return complexity;
  }
}

module.exports = FeatureAnalyzer;
```

## Step 5: Create CRUD Specialist

**File:** `src/agents/specification-v2/specialists/crud-specialist.js`

```javascript
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
```

## Step 6: Create Generic Specialist (Fallback)

**File:** `src/agents/specification-v2/specialists/generic-specialist.js`

```javascript
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
```

## Step 7: Create Simple Cache

**File:** `src/agents/specification-v2/cache/specification-cache.js`

```javascript
class SpecificationCache {
  constructor(maxSize = 100, ttl = 3600000) { // 1 hour TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    entry.accessCount++;
    return entry.value;
  }

  set(key, value) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 0
    });
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size
    };
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

module.exports = SpecificationCache;
```

## Step 8: Create Integration Specialist (Optional - Phase 2)

**File:** `src/agents/specification-v2/specialists/integration-specialist.js`

```javascript
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
```

## Step 9: Test the Implementation

Create a test script:

**File:** `test-spec-v2.js`

```javascript
// Test script to verify new specification system

const SpecificationSystemV2 = require('./src/agents/specification-v2');

async function testSpecificationV2() {
  console.log('Testing Specification System V2...\n');

  // Mock communication hub
  const mockHub = {
    emit: () => {},
    on: () => {}
  };

  const system = new SpecificationSystemV2(mockHub);

  // Test CRUD feature
  const crudFeature = {
    id: 'test-crud-001',
    name: 'User Management',
    description: 'Create, read, update and delete user accounts with email and password',
    requiredAgents: ['backend', 'database'],
    dependencies: []
  };

  console.log('Testing CRUD feature...');
  const crudSpec = await system.generateSpecification(crudFeature, {});
  console.log('Generated:', crudSpec.generatedBy);
  console.log('Endpoints:', crudSpec.specification.apiContracts.length);

  // Test Integration feature
  const integrationFeature = {
    id: 'test-int-001',
    name: 'Stripe Payment Integration',
    description: 'Integrate with Stripe API for payment processing',
    requiredAgents: ['backend'],
    dependencies: []
  };

  console.log('\nTesting Integration feature...');
  const intSpec = await system.generateSpecification(integrationFeature, {});
  console.log('Generated:', intSpec.generatedBy);

  // Test cache
  console.log('\nTesting cache...');
  const cachedSpec = await system.generateSpecification(crudFeature, {});
  console.log('From cache:', cachedSpec.fromCache === true);

  // Show cache stats
  console.log('\nCache stats:', system.cache.getStats());
}

// Run test
testSpecificationV2().catch(console.error);
```

## Step 10: Enable in Production

### Option A: Environment Variable

```bash
# .env file
USE_NEW_SPEC_SYSTEM=true
```

### Option B: Gradual Rollout

Modify the `shouldUseNewSpecificationSystem` method:

```javascript
shouldUseNewSpecificationSystem() {
  // Rollout percentage (0-100)
  const rollout = parseInt(process.env.SPEC_V2_ROLLOUT || '0');

  // Hash project ID to deterministically assign to rollout
  if (this.orchestration.projectPlan?.projectId) {
    const hash = require('crypto')
      .createHash('md5')
      .update(this.orchestration.projectPlan.projectId)
      .digest('hex');

    const projectNumber = parseInt(hash.substr(0, 8), 16);
    const projectPercentage = projectNumber % 100;

    return projectPercentage < rollout;
  }

  return false;
}
```

## Monitoring

Add logging to track performance:

```javascript
// In coordinator-agent.js, after generating specs
if (this.shouldUseNewSpecificationSystem()) {
  console.log(`[METRICS] Spec V2 Performance:
    - Features: ${specifications.length}
    - Time: ${Date.now() - startTime}ms
    - Cache hits: ${specSystem.cache.getStats().hits}
    - Cache hit rate: ${specSystem.cache.getStats().hitRate}
  `);
}
```

## Rollback Plan

If issues arise:

1. **Immediate rollback:**
```bash
USE_NEW_SPEC_SYSTEM=false
```

2. **Or remove the feature flag check:**
```javascript
async generateSpecifications(projectContext = {}) {
  // Comment out new system
  // if (this.shouldUseNewSpecificationSystem()) {
  //   return await this.generateSpecificationsV2(projectContext);
  // }

  // Force legacy
  console.log(`[${this.agentId}] Using LEGACY specification system`);
  // ... existing implementation
}
```

## Success Criteria

Monitor these metrics:

1. **API Token Usage**: Should decrease by >50%
2. **Generation Time**: Should be similar or better
3. **Quality Scores**: Should maintain or improve
4. **Cache Hit Rate**: Should reach >30% after warmup
5. **Error Rate**: Should not increase

## Next Steps

After successful Phase 1:

1. Add more specialists (workflow, realtime, etc.)
2. Implement smarter refinement
3. Add cross-project learning
4. Optimize cache with similarity matching
5. Add metrics dashboard

This implementation provides a working V2 system with minimal risk and easy rollback.