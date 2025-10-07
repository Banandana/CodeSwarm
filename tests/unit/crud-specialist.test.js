/**
 * Unit tests for CRUD Specialist
 * Tests template-based generation without API calls
 */

const CRUDSpecialist = require('../../src/agents/specification-v2/specialists/crud-specialist');
const { MockCommunicationHub } = require('../fixtures/mock-communication-hub');
const testFeatures = require('../fixtures/test-features');

describe('CRUDSpecialist', () => {
  let specialist;
  let mockHub;

  beforeEach(() => {
    mockHub = new MockCommunicationHub();
    specialist = new CRUDSpecialist(mockHub);
  });

  describe('Template Loading', () => {
    test('should load base CRUD template', () => {
      expect(specialist.template).toBeDefined();
      expect(specialist.template.apiContracts).toBeDefined();
      expect(specialist.template.dataSchemas).toBeDefined();
      expect(specialist.template.acceptanceCriteria).toBeDefined();
    });

    test('should have standard REST endpoints in template', () => {
      const endpoints = specialist.template.apiContracts;

      const methods = endpoints.map(e => ({ method: e.method, endpoint: e.endpoint }));

      expect(methods).toContainEqual({ method: 'GET', endpoint: '/api/resources' });
      expect(methods).toContainEqual({ method: 'GET', endpoint: '/api/resources/:id' });
      expect(methods).toContainEqual({ method: 'POST', endpoint: '/api/resources' });
      expect(methods).toContainEqual({ method: 'PUT', endpoint: '/api/resources/:id' });
      expect(methods).toContainEqual({ method: 'DELETE', endpoint: '/api/resources/:id' });
    });

    test('should have standard acceptance criteria', () => {
      const criteria = specialist.template.acceptanceCriteria;

      expect(criteria.length).toBeGreaterThan(0);
      expect(criteria.every(c => c.testable)).toBe(true);
    });
  });

  describe('Resource Name Extraction', () => {
    test('should extract resource from "manage" pattern', () => {
      const feature = {
        name: 'Manage Users',
        description: 'User management'
      };

      const name = specialist.extractResourceName(feature);

      expect(name).toBe('users');
    });

    test('should extract resource from "management" pattern', () => {
      const feature = {
        name: 'User Management',
        description: 'Manage users'
      };

      const name = specialist.extractResourceName(feature);

      expect(name).toBe('user');
    });

    test('should extract resource from "CRUD" pattern', () => {
      const feature = {
        name: 'Product CRUD',
        description: 'Product operations'
      };

      const name = specialist.extractResourceName(feature);

      expect(name).toBe('product');
    });

    test('should extract resource from "create" pattern', () => {
      const feature = {
        name: 'Create Orders',
        description: 'Order creation'
      };

      const name = specialist.extractResourceName(feature);

      expect(name).toBe('orders');
    });

    test('should use first significant word as fallback', () => {
      const feature = {
        name: 'Invoice Operations',
        description: 'Handle invoices'
      };

      const name = specialist.extractResourceName(feature);

      expect(name).toBe('invoice');
    });

    test('should filter out common words', () => {
      const feature = {
        name: 'The User System',
        description: 'A user system'
      };

      const name = specialist.extractResourceName(feature);

      expect(name).not.toBe('the');
      expect(name).not.toBe('a');
    });
  });

  describe('Template Customization', () => {
    test('should replace resource names in template', () => {
      const template = specialist.template;
      const customized = specialist.customizeTemplate(template, 'user', testFeatures.crudFeature);

      const endpointPaths = customized.apiContracts.map(e => e.endpoint);

      expect(endpointPaths).toContain('/api/users');
      expect(endpointPaths).toContain('/api/users/:id');
    });

    test('should pluralize resource names correctly', () => {
      expect(specialist.pluralize('user')).toBe('users');
      expect(specialist.pluralize('product')).toBe('products');
      expect(specialist.pluralize('category')).toBe('categories');
      expect(specialist.pluralize('class')).toBe('classes');
    });

    test('should capitalize resource name in schema', () => {
      const template = specialist.template;
      const customized = specialist.customizeTemplate(template, 'user', testFeatures.crudFeature);

      expect(customized.dataSchemas[0].name).toBe('User');
    });

    test('should preserve template structure', () => {
      const template = specialist.template;
      const customized = specialist.customizeTemplate(template, 'order', testFeatures.crudFeature);

      expect(customized.apiContracts).toHaveLength(template.apiContracts.length);
      expect(customized.dataSchemas).toHaveLength(template.dataSchemas.length);
      expect(customized.acceptanceCriteria).toHaveLength(template.acceptanceCriteria.length);
    });
  });

  describe('Specification Generation (No API)', () => {
    test('should generate basic spec without API calls', async () => {
      // Override callClaude to avoid API call
      specialist.callClaude = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          fields: [],
          validations: [],
          additionalEndpoints: []
        })
      });

      const spec = await specialist.generate(testFeatures.crudFeature, {});

      expect(spec).toBeDefined();
      expect(spec.specId).toBeDefined();
      expect(spec.featureId).toBe(testFeatures.crudFeature.id);
      expect(spec.specification).toBeDefined();
      expect(spec.generatedBy).toBe('crud-specialist');
    });

    test('should include standard CRUD endpoints', async () => {
      specialist.callClaude = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          fields: [],
          validations: [],
          additionalEndpoints: []
        })
      });

      const spec = await specialist.generate(testFeatures.crudFeature, {});

      const endpoints = spec.specification.apiContracts;
      const methods = endpoints.map(e => e.method);

      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('DELETE');
    });

    test('should include standard error handling', async () => {
      specialist.callClaude = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          fields: [],
          validations: [],
          additionalEndpoints: []
        })
      });

      const spec = await specialist.generate(testFeatures.crudFeature, {});

      expect(spec.specification.errorHandling).toBeDefined();
      expect(spec.specification.errorHandling.length).toBeGreaterThan(0);
    });

    test('should handle API failure gracefully', async () => {
      specialist.callClaude = jest.fn().mockRejectedValue(new Error('API Error'));

      const spec = await specialist.generate(testFeatures.crudFeature, {});

      // Should still return valid spec with empty customization
      expect(spec).toBeDefined();
      expect(spec.specification).toBeDefined();
    });
  });

  describe('Customization Application', () => {
    test('should apply custom fields to schema', () => {
      const spec = { dataSchemas: [{ properties: {} }] };
      const customization = {
        fields: [
          { name: 'email', type: 'string', required: true, description: 'User email' },
          { name: 'age', type: 'integer', required: false, description: 'User age' }
        ],
        validations: [],
        additionalEndpoints: []
      };

      const result = specialist.applyCustomization(spec, customization);

      expect(result.dataSchemas[0].properties.email).toBeDefined();
      expect(result.dataSchemas[0].properties.email.type).toBe('string');
      expect(result.dataSchemas[0].properties.age).toBeDefined();
    });

    test('should apply validation rules', () => {
      const spec = { errorHandling: [] };
      const customization = {
        fields: [],
        validations: [
          { field: 'email', rule: 'must be valid email', message: 'Invalid email' }
        ],
        additionalEndpoints: []
      };

      const result = specialist.applyCustomization(spec, customization);

      expect(result.errorHandling.length).toBeGreaterThan(0);
      expect(result.errorHandling[0].field).toBe('email');
    });

    test('should handle empty customization', () => {
      const spec = { dataSchemas: [{ properties: {} }], errorHandling: [] };
      const customization = {
        fields: [],
        validations: [],
        additionalEndpoints: []
      };

      const result = specialist.applyCustomization(spec, customization);

      expect(result).toBeDefined();
      expect(result.dataSchemas[0].properties).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    test('should handle feature without description', async () => {
      specialist.callClaude = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          fields: [],
          validations: [],
          additionalEndpoints: []
        })
      });

      const feature = {
        id: 'feat-001',
        name: 'User Management',
        requiredAgents: ['backend']
      };

      const spec = await specialist.generate(feature, {});

      expect(spec).toBeDefined();
    });

    test('should handle very long feature names', async () => {
      specialist.callClaude = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          fields: [],
          validations: [],
          additionalEndpoints: []
        })
      });

      const feature = {
        id: 'feat-001',
        name: 'Very Long Feature Name That Goes On And On And On',
        description: 'Test'
      };

      const spec = await specialist.generate(feature, {});

      expect(spec).toBeDefined();
    });

    test('should handle special characters in names', () => {
      const feature = {
        name: 'User-Management_System',
        description: 'Test'
      };

      const name = specialist.extractResourceName(feature);

      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });

    test('should handle empty feature name', () => {
      const feature = {
        name: '',
        description: 'Test'
      };

      const name = specialist.extractResourceName(feature);

      expect(name).toBe('resource'); // Fallback
    });
  });
});
