/**
 * Specification Quality Gate System
 *
 * Validates spec quality before acceptance to prevent poor specs
 * from propagating through the system.
 */
class SpecificationQualityGate {
  constructor(options = {}) {
    this.config = {
      minOverallScore: options.minOverallScore || 80,
      minRevisionScore: options.minRevisionScore || 60,
      weights: {
        completeness: 0.35,
        consistency: 0.30,
        testability: 0.20,
        coverage: 0.10,
        clarity: 0.05
      }
    };
  }

  /**
   * Multi-stage spec validation
   *
   * @param {Object} spec - Specification to validate
   * @returns {Object} Validation result with score and recommendation
   */
  async validateSpec(spec) {
    const checks = await Promise.all([
      this.checkCompleteness(spec),
      this.checkConsistency(spec),
      this.checkTestability(spec),
      this.checkCoverage(spec),
      this.checkClarity(spec)
    ]);

    return this.computeQualityScore(checks);
  }

  /**
   * Completeness: All required sections present and non-empty
   */
  async checkCompleteness(spec) {
    let score = 0;
    const issues = [];

    // Check acceptance criteria (CRITICAL)
    const criteria = spec.specification?.acceptanceCriteria || [];
    if (criteria.length < 2) {
      issues.push({
        type: 'missing_acceptance_criteria',
        severity: 'critical',
        message: `Only ${criteria.length} acceptance criteria (need ≥ 2)`
      });
    } else {
      score += 50; // 50% for having criteria
    }

    // Check API contracts (if feature needs them)
    if (this.featureNeedsAPI(spec)) {
      const contracts = spec.specification?.apiContracts || [];
      if (contracts.length === 0) {
        issues.push({
          type: 'missing_api_contracts',
          severity: 'high',
          message: 'Feature appears to need API but no contracts defined'
        });
      } else {
        score += 30; // 30% for API contracts
      }
    } else {
      score += 30; // Full credit if not needed
    }

    // Check data schemas
    const schemas = spec.specification?.dataSchemas || [];
    if (schemas.length > 0) {
      score += 20; // 20% for data schemas
    }

    return {
      category: 'completeness',
      score: Math.min(100, score),
      passed: score >= 70,
      issues
    };
  }

  /**
   * Consistency: Specs don't contradict each other
   */
  async checkConsistency(spec) {
    const issues = [];

    // Check 1: API contracts reference schemas that exist
    const definedSchemas = new Set(
      (spec.specification?.dataSchemas || []).map(s => s.name)
    );

    for (const contract of spec.specification?.apiContracts || []) {
      const referencedSchemas = this.extractSchemaReferences(contract);

      for (const schemaRef of referencedSchemas) {
        if (!definedSchemas.has(schemaRef)) {
          issues.push({
            type: 'missing_schema',
            severity: 'high',
            contract: contract.endpoint,
            schema: schemaRef,
            message: `Contract ${contract.endpoint} references undefined schema: ${schemaRef}`
          });
        }
      }
    }

    // Check 2: Interfaces reference correct error types
    const definedErrors = new Set(
      (spec.specification?.errorHandling || []).map(e => e.errorType)
    );

    for (const iface of spec.specification?.interfaces || []) {
      for (const method of iface.methods || []) {
        for (const errorType of method.throws || []) {
          if (!definedErrors.has(errorType) && !this.isStandardError(errorType)) {
            issues.push({
              type: 'missing_error_type',
              severity: 'medium',
              interface: iface.name,
              method: method.name,
              errorType,
              message: `Method ${iface.name}.${method.name} throws undefined error: ${errorType}`
            });
          }
        }
      }
    }

    // Check 3: Acceptance criteria reference defined contracts
    for (const criterion of spec.specification?.acceptanceCriteria || []) {
      const referencedEndpoints = this.extractEndpointReferences(criterion.expectedBehavior || '');

      for (const endpoint of referencedEndpoints) {
        const exists = (spec.specification?.apiContracts || []).some(
          c => c.endpoint === endpoint
        );

        if (!exists) {
          issues.push({
            type: 'missing_endpoint',
            severity: 'medium',
            criterionId: criterion.id,
            endpoint,
            message: `Criterion ${criterion.id} references undefined endpoint: ${endpoint}`
          });
        }
      }
    }

    const score = Math.max(0, 100 - issues.length * 15); // -15 per issue

    return {
      category: 'consistency',
      score,
      passed: issues.length <= 2,
      issues
    };
  }

  /**
   * Testability: Acceptance criteria are measurable
   */
  async checkTestability(spec) {
    const criteria = spec.specification?.acceptanceCriteria || [];
    let testable = 0;
    const issues = [];

    for (const criterion of criteria) {
      // Check if explicitly marked as testable
      if (criterion.testable === false) {
        issues.push({
          type: 'not_testable',
          criterionId: criterion.id,
          description: criterion.description,
          message: 'Criterion marked as not testable'
        });
        continue;
      }

      // Check if has expected behavior
      if (!criterion.expectedBehavior || criterion.expectedBehavior.length < 10) {
        issues.push({
          type: 'vague_behavior',
          criterionId: criterion.id,
          description: criterion.description,
          message: 'Expected behavior too vague or missing'
        });
        continue;
      }

      // Check if has verification method
      if (!criterion.verificationMethod) {
        issues.push({
          type: 'no_verification_method',
          criterionId: criterion.id,
          description: criterion.description,
          message: 'No verification method specified'
        });
        continue;
      }

      testable++;
    }

    const score = criteria.length > 0 ? (testable / criteria.length) * 100 : 0;

    return {
      category: 'testability',
      score,
      passed: score >= 80,
      testableCount: testable,
      totalCount: criteria.length,
      issues
    };
  }

  /**
   * Coverage: All feature aspects covered
   */
  async checkCoverage(spec) {
    const issues = [];
    let score = 100;

    // Feature appears to need database but no schemas
    if (this.featureNeedsDatabase(spec)) {
      const schemas = spec.specification?.dataSchemas || [];
      if (schemas.length === 0) {
        issues.push({
          type: 'missing_data_schemas',
          severity: 'high',
          message: 'Feature appears to need database but no schemas defined'
        });
        score -= 30;
      }
    }

    // Feature has API endpoints but no error handling
    if ((spec.specification?.apiContracts || []).length > 0) {
      const errors = spec.specification?.errorHandling || [];
      if (errors.length === 0) {
        issues.push({
          type: 'missing_error_handling',
          severity: 'medium',
          message: 'API contracts defined but no error handling specified'
        });
        score -= 20;
      }
    }

    // Security-sensitive feature but no security requirements
    if (this.isSecuritySensitive(spec)) {
      const secReqs = spec.specification?.securityRequirements || [];
      if (secReqs.length === 0) {
        issues.push({
          type: 'missing_security_requirements',
          severity: 'high',
          message: 'Security-sensitive feature but no security requirements'
        });
        score -= 30;
      }
    }

    return {
      category: 'coverage',
      score: Math.max(0, score),
      passed: score >= 70,
      issues
    };
  }

  /**
   * Clarity: Specs are unambiguous
   */
  async checkClarity(spec) {
    const issues = [];
    let score = 100;

    // Check acceptance criteria descriptions
    for (const criterion of spec.specification?.acceptanceCriteria || []) {
      if (!criterion.description || criterion.description.length < 10) {
        issues.push({
          type: 'too_brief',
          criterionId: criterion.id,
          message: 'Description too brief to be clear'
        });
        score -= 10;
      }

      // Check for vague words
      const vagueWords = ['should', 'might', 'could', 'maybe', 'possibly'];
      const hasVague = vagueWords.some(word =>
        (criterion.description || '').toLowerCase().includes(word)
      );

      if (hasVague) {
        issues.push({
          type: 'vague_language',
          criterionId: criterion.id,
          message: 'Uses vague language (should/might/could)'
        });
        score -= 5;
      }
    }

    return {
      category: 'clarity',
      score: Math.max(0, score),
      passed: score >= 70,
      issues
    };
  }

  /**
   * Compute overall quality score
   */
  computeQualityScore(checks) {
    const weights = this.config.weights;

    const score = checks.reduce((acc, check) => {
      return acc + (check.score * weights[check.category]);
    }, 0);

    const allIssues = checks.flatMap(c => c.issues || []);
    const criticalIssues = allIssues.filter(i => i.severity === 'critical');

    // Automatic fail if critical issues
    const passed = score >= this.config.minOverallScore && criticalIssues.length === 0;

    const recommendation =
      passed ? 'accept' :
      score >= this.config.minRevisionScore ? 'revise' : 'regenerate';

    return {
      overallScore: Math.round(score),
      passed,
      recommendation,
      checks,
      criticalIssues: criticalIssues.length,
      totalIssues: allIssues.length
    };
  }

  /**
   * Helper: Determine if feature needs API
   */
  featureNeedsAPI(spec) {
    const keywords = ['endpoint', 'api', 'rest', 'http', 'route'];
    const description = (spec.feature?.description || '').toLowerCase();
    return keywords.some(kw => description.includes(kw));
  }

  /**
   * Helper: Determine if feature needs database
   */
  featureNeedsDatabase(spec) {
    const keywords = ['database', 'table', 'schema', 'store', 'persist', 'save'];
    const description = (spec.feature?.description || '').toLowerCase();
    return keywords.some(kw => description.includes(kw));
  }

  /**
   * Helper: Determine if feature is security-sensitive
   */
  isSecuritySensitive(spec) {
    const keywords = ['auth', 'login', 'password', 'token', 'security', 'permission'];
    const description = (spec.feature?.description || '').toLowerCase();
    return keywords.some(kw => description.includes(kw));
  }

  /**
   * Helper: Extract schema references from API contract
   */
  extractSchemaReferences(contract) {
    const refs = [];
    const json = JSON.stringify(contract);

    // Simple pattern: look for references like "$ref": "schemas/User"
    const refPattern = /schemas\/(\w+)/g;
    let match;
    while ((match = refPattern.exec(json)) !== null) {
      refs.push(match[1]);
    }

    return refs;
  }

  /**
   * Helper: Extract endpoint references from text
   */
  extractEndpointReferences(text) {
    const endpoints = [];

    // Pattern: "POST /auth/login" or "/users"
    const endpointPattern = /(?:GET|POST|PUT|DELETE|PATCH)?\s*(\/[\w\/-]+)/gi;
    let match;
    while ((match = endpointPattern.exec(text)) !== null) {
      endpoints.push(match[1]);
    }

    return endpoints;
  }

  /**
   * Helper: Check if error type is standard
   */
  isStandardError(errorType) {
    const standardErrors = [
      'Error', 'TypeError', 'ReferenceError', 'SyntaxError',
      'RangeError', 'EvalError', 'URIError'
    ];
    return standardErrors.includes(errorType);
  }
}

module.exports = SpecificationQualityGate;
