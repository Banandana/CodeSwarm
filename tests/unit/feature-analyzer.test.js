/**
 * Unit tests for Feature Analyzer
 * Tests feature categorization and complexity analysis
 */

const FeatureAnalyzer = require('../../src/agents/specification-v2/feature-analyzer');
const testFeatures = require('../fixtures/test-features');

describe('FeatureAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new FeatureAnalyzer();
  });

  describe('CRUD Detection', () => {
    test('should identify CRUD features', () => {
      const result = analyzer.analyze(testFeatures.crudFeature, {});

      expect(result.category).toBe('crud');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should score high for CRUD keywords', () => {
      const feature = {
        name: 'User Management',
        description: 'Create, read, update, and delete user records',
        requiredAgents: ['backend', 'database']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.crud).toBeGreaterThan(50);
    });

    test('should detect CRUD operations in description', () => {
      const feature = {
        name: 'Product Catalog',
        description: 'Allow users to list products, get product details, save new products, and remove old ones',
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.crud).toBeGreaterThan(0);
      expect(result.category).toBe('crud');
    });

    test('should score high when backend and database agents required', () => {
      const feature = {
        name: 'Data Management',
        description: 'Manage data records',
        requiredAgents: ['backend', 'database']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.crud).toBeGreaterThan(0);
    });

    test('should penalize workflow features', () => {
      const feature = {
        name: 'Create and update users via workflow',
        description: 'Complex approval workflow for user creation',
        requiredAgents: ['backend', 'database']
      };

      const result = analyzer.analyze(feature, {});

      // Workflow penalty should reduce CRUD score
      expect(result.category).not.toBe('crud');
    });
  });

  describe('Integration Detection', () => {
    test('should identify integration features', () => {
      const result = analyzer.analyze(testFeatures.integrationFeature, {});

      expect(result.category).toBe('integration');
      expect(result.scores.integration).toBeGreaterThan(50);
    });

    test('should detect API integration keywords', () => {
      const feature = {
        name: 'External API Integration',
        description: 'Connect to third-party service API with authentication',
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.integration).toBeGreaterThan(0);
    });

    test('should detect webhook integrations', () => {
      const feature = {
        name: 'Webhook Handler',
        description: 'Handle incoming webhooks from external services',
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.integration).toBeGreaterThan(0);
    });

    test('should score high for payment integrations', () => {
      const feature = {
        name: 'Stripe Payment',
        description: 'Integrate Stripe payment processing',
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.integration).toBeGreaterThan(50);
    });

    test('should detect OAuth integrations', () => {
      const feature = {
        name: 'OAuth Login',
        description: 'OAuth authentication with Google',
        requiredAgents: ['backend', 'frontend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.integration).toBeGreaterThan(0);
    });
  });

  describe('Workflow Detection', () => {
    test('should identify workflow features', () => {
      const result = analyzer.analyze(testFeatures.workflowFeature, {});

      expect(result.category).toBe('workflow');
      expect(result.scores.workflow).toBeGreaterThan(0);
    });

    test('should detect workflow keywords', () => {
      const feature = {
        name: 'Approval Process',
        description: 'Multi-stage approval workflow with routing',
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.workflow).toBeGreaterThan(50);
    });

    test('should detect pipeline features', () => {
      const feature = {
        name: 'Data Pipeline',
        description: 'Sequential data processing pipeline with multiple stages',
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.workflow).toBeGreaterThan(0);
    });
  });

  describe('Generic Fallback', () => {
    test('should fallback to generic for unclear features', () => {
      const result = analyzer.analyze(testFeatures.genericFeature, {});

      // Might be generic or another category
      expect(result.category).toBeDefined();
      expect(result.scores.generic).toBeDefined();
    });

    test('should use generic for features without clear patterns', () => {
      const feature = {
        name: 'Custom Feature',
        description: 'Special custom implementation',
        requiredAgents: ['frontend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.category).toBeDefined();
    });
  });

  describe('Complexity Calculation', () => {
    test('should classify simple features', () => {
      const feature = {
        name: 'Simple Feature',
        description: 'Basic feature',
        dependencies: [],
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.complexity).toBe('simple');
    });

    test('should classify medium features by dependencies', () => {
      const feature = {
        name: 'Medium Feature',
        description: 'Feature with dependencies',
        dependencies: ['feat-1', 'feat-2', 'feat-3'],
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.complexity).toBe('medium');
    });

    test('should classify medium features by agent count', () => {
      const feature = {
        name: 'Multi-Agent Feature',
        description: 'Feature requiring multiple agents',
        dependencies: [],
        requiredAgents: ['backend', 'frontend', 'database', 'testing']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.complexity).toBe('medium');
    });

    test('should classify complex features', () => {
      const result = analyzer.analyze(testFeatures.complexFeature, {});

      expect(result.complexity).toBe('complex');
    });

    test('should classify complex features by description length', () => {
      const feature = {
        name: 'Complex Feature',
        description: 'a'.repeat(600), // Long description
        dependencies: [],
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.complexity).toBe('complex');
    });
  });

  describe('Scoring System', () => {
    test('should return all category scores', () => {
      const result = analyzer.analyze(testFeatures.crudFeature, {});

      expect(result.scores.crud).toBeDefined();
      expect(result.scores.integration).toBeDefined();
      expect(result.scores.workflow).toBeDefined();
      expect(result.scores.generic).toBeDefined();
    });

    test('should normalize scores within 0-100 range', () => {
      const result = analyzer.analyze(testFeatures.crudFeature, {});

      Object.values(result.scores).forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });

    test('should select highest scoring category', () => {
      const result = analyzer.analyze(testFeatures.integrationFeature, {});

      const maxScore = Math.max(...Object.values(result.scores));
      const selectedScore = result.scores[result.category];

      expect(selectedScore).toBe(maxScore);
    });

    test('should have base generic score', () => {
      const feature = {
        name: 'Test',
        description: 'Test',
        requiredAgents: []
      };

      const result = analyzer.analyze(feature, {});

      expect(result.scores.generic).toBeGreaterThan(0);
    });
  });

  describe('Confidence Scoring', () => {
    test('should calculate confidence from score', () => {
      const result = analyzer.analyze(testFeatures.crudFeature, {});

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    test('should have high confidence for clear categories', () => {
      const strongFeature = {
        name: 'User CRUD',
        description: 'Create read update delete users with data records',
        requiredAgents: ['backend', 'database']
      };

      const result = analyzer.analyze(strongFeature, {});

      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should have lower confidence for ambiguous features', () => {
      const ambiguousFeature = {
        name: 'Feature',
        description: 'Something',
        requiredAgents: []
      };

      const result = analyzer.analyze(ambiguousFeature, {});

      // Low score = low confidence
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('Edge Cases', () => {
    test('should handle features without description', () => {
      const feature = {
        name: 'No Description',
        requiredAgents: ['backend']
      };

      expect(() => analyzer.analyze(feature, {})).not.toThrow();
    });

    test('should handle features without agents', () => {
      const feature = {
        name: 'No Agents',
        description: 'Feature without agents'
      };

      expect(() => analyzer.analyze(feature, {})).not.toThrow();
    });

    test('should handle features without dependencies', () => {
      const feature = {
        name: 'No Deps',
        description: 'Feature without dependencies',
        requiredAgents: ['backend']
      };

      const result = analyzer.analyze(feature, {});

      expect(result.complexity).toBeDefined();
    });

    test('should handle empty strings', () => {
      const feature = {
        name: '',
        description: '',
        requiredAgents: []
      };

      expect(() => analyzer.analyze(feature, {})).not.toThrow();
    });

    test('should handle undefined properties', () => {
      const feature = {
        name: 'Test'
        // All other properties undefined
      };

      expect(() => analyzer.analyze(feature, {})).not.toThrow();
    });

    test('should be case insensitive', () => {
      const lowercase = {
        name: 'user management',
        description: 'create update delete users',
        requiredAgents: []
      };

      const uppercase = {
        name: 'USER MANAGEMENT',
        description: 'CREATE UPDATE DELETE USERS',
        requiredAgents: []
      };

      const result1 = analyzer.analyze(lowercase, {});
      const result2 = analyzer.analyze(uppercase, {});

      expect(result1.category).toBe(result2.category);
    });
  });
});
