/**
 * Test fixtures for features
 */

module.exports = {
  crudFeature: {
    id: 'feat-001',
    name: 'User Management',
    description: 'Create, read, update, and delete user records with authentication',
    requiredAgents: ['backend', 'database'],
    dependencies: [],
    priority: 'high'
  },

  integrationFeature: {
    id: 'feat-002',
    name: 'Payment Integration',
    description: 'Integration with Stripe payment API for processing payments',
    requiredAgents: ['backend', 'integration'],
    dependencies: ['feat-001'],
    priority: 'high'
  },

  genericFeature: {
    id: 'feat-003',
    name: 'Analytics Dashboard',
    description: 'Real-time analytics dashboard with custom visualizations',
    requiredAgents: ['frontend', 'backend', 'database'],
    dependencies: ['feat-001'],
    priority: 'medium'
  },

  similarCrudFeature: {
    id: 'feat-004',
    name: 'User Administration',
    description: 'Manage and administer user accounts with CRUD operations',
    requiredAgents: ['backend', 'database'],
    dependencies: [],
    priority: 'high'
  },

  workflowFeature: {
    id: 'feat-005',
    name: 'Approval Workflow',
    description: 'Multi-stage approval workflow with notifications and routing',
    requiredAgents: ['backend', 'frontend'],
    dependencies: ['feat-001'],
    priority: 'medium'
  },

  complexFeature: {
    id: 'feat-006',
    name: 'Multi-tenant System',
    description: 'Complete multi-tenant architecture with data isolation, tenant management, and billing',
    requiredAgents: ['backend', 'frontend', 'database', 'devops', 'testing'],
    dependencies: ['feat-001', 'feat-002', 'feat-003'],
    priority: 'critical'
  }
};
