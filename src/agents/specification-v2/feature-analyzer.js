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
