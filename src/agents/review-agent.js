/**
 * Review Agent
 * Reviews generated code against specifications with confidence scoring
 */

const BaseAgent = require('./base-agent');
const SpecValidator = require('../validation/spec-validator');
const { AgentError } = require('../utils/errors');

class ReviewAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'reviewer', communicationHub, options);

    // Confidence scoring config
    this.confidenceConfig = {
      minReliable: options.minReliableConfidence || 70,
      factors: {
        parsability: 0.25,
        specQuality: 0.30,
        reviewability: 0.20,
        detectability: 0.15,
        complexity: 0.10
      }
    };
  }

  /**
   * Review implementation with confidence scoring and semantic validation (Enhancement 3)
   * @param {Object} task - Task being reviewed
   * @param {Array} generatedFiles - Generated code files
   * @param {Object} spec - Specification
   * @param {Object} validationResults - Syntax/security validation results
   * @returns {Promise<Object>} Review result with confidence
   */
  async reviewImplementation(task, generatedFiles, spec, validationResults = {}) {
    try {
      // Perform structural review
      const review = await this._performStructuralReview(
        task,
        generatedFiles,
        spec,
        validationResults
      );

      // Perform semantic validation (Enhancement 3)
      const SemanticValidator = require('../validation/semantic-validator');
      const semanticValidator = new SemanticValidator(this.communicationHub);
      await semanticValidator.initialize();

      const code = generatedFiles[0]?.content || '';
      const tests = generatedFiles.find(f => f.path?.includes('test'))?.content || '';

      const semanticResults = await semanticValidator.validateSemantics(code, spec, tests);

      // Combine structural and semantic scores (60% structural, 40% semantic)
      const combinedScore = (review.complianceScore * 0.6) + (semanticResults.overallScore * 0.4);

      // Calculate review confidence
      const confidence = await this._calculateReviewConfidence(
        task,
        generatedFiles,
        spec,
        review
      );

      return {
        ...review,
        complianceScore: Math.round(combinedScore),
        structuralScore: review.complianceScore,
        semanticScore: semanticResults.overallScore,
        semanticResults,
        confidence: {
          overall: confidence.overall,
          byCategory: confidence.byCategory,
          factors: confidence.factors,
          reliable: confidence.overall >= this.confidenceConfig.minReliable
        }
      };

    } catch (error) {
      throw new AgentError(
        `Review failed: ${error.message}`,
        { agentId: this.agentId, taskId: task.id }
      );
    }
  }

  /**
   * Perform structural review against specification
   */
  async _performStructuralReview(task, generatedFiles, spec, validationResults) {
    const gaps = [];
    let complianceScore = 100;

    if (!spec || spec.fallback) {
      // No spec available - basic validation only
      return {
        complianceScore: validationResults.syntaxValid ? 75 : 50,
        gaps: [],
        specAvailable: false,
        note: 'No specification available for detailed review'
      };
    }

    const code = generatedFiles[0]?.content || '';

    // Check API contracts
    const apiGaps = this._checkAPIContracts(code, spec);
    gaps.push(...apiGaps);
    complianceScore -= apiGaps.length * 10;

    // Check interfaces
    const interfaceGaps = this._checkInterfaces(code, spec);
    gaps.push(...interfaceGaps);
    complianceScore -= interfaceGaps.length * 10;

    // Check acceptance criteria (simplified check)
    const criteriaGaps = this._checkAcceptanceCriteria(code, spec);
    gaps.push(...criteriaGaps);
    complianceScore -= criteriaGaps.length * 8;

    // Check data schemas
    const schemaGaps = this._checkDataSchemas(code, spec);
    gaps.push(...schemaGaps);
    complianceScore -= schemaGaps.length * 5;

    // Check error handling
    const errorGaps = this._checkErrorHandling(code, spec);
    gaps.push(...errorGaps);
    complianceScore -= errorGaps.length * 7;

    return {
      complianceScore: Math.max(0, complianceScore),
      gaps,
      specAvailable: true,
      checks: {
        apiContracts: apiGaps.length === 0,
        interfaces: interfaceGaps.length === 0,
        acceptanceCriteria: criteriaGaps.length === 0,
        dataSchemas: schemaGaps.length === 0,
        errorHandling: errorGaps.length === 0
      }
    };
  }

  /**
   * Calculate how confident we are in this review
   */
  async _calculateReviewConfidence(task, generatedFiles, spec, review) {
    const factors = [];

    // Factor 1: Code Parsability (25%)
    const parsable = await this._tryParseCode(generatedFiles[0]?.content || '');
    factors.push({
      name: 'code_parsability',
      score: parsable ? 100 : 30,
      weight: this.confidenceConfig.factors.parsability,
      reason: parsable ?
        'Code parsed successfully via AST' :
        'Parser failed, using regex fallback (less accurate)'
    });

    // Factor 2: Spec Quality (30%)
    const specQuality = this._assessSpecQuality(spec);
    factors.push({
      name: 'spec_quality',
      score: specQuality.score,
      weight: this.confidenceConfig.factors.specQuality,
      reason: specQuality.reason
    });

    // Factor 3: Reviewability (20%)
    const reviewability = this._assessReviewability(task, spec);
    factors.push({
      name: 'reviewability',
      score: reviewability.score,
      weight: this.confidenceConfig.factors.reviewability,
      reason: reviewability.reason
    });

    // Factor 4: Gap Detectability (15%)
    const detectability = this._assessGapDetectability(review.gaps || []);
    factors.push({
      name: 'gap_detectability',
      score: detectability.score,
      weight: this.confidenceConfig.factors.detectability,
      reason: detectability.reason
    });

    // Factor 5: Code Complexity (10%)
    const complexity = this._assessCodeComplexity(generatedFiles[0]?.content || '');
    factors.push({
      name: 'code_complexity',
      score: complexity.score,
      weight: this.confidenceConfig.factors.complexity,
      reason: complexity.reason
    });

    // Compute weighted overall confidence
    const overall = factors.reduce((acc, f) => acc + (f.score * f.weight), 0);

    // Per-category confidence
    const byCategory = {
      apiContracts: this._categoryConfidence(factors, ['parsability', 'spec_quality']),
      acceptanceCriteria: this._categoryConfidence(factors, ['reviewability', 'detectability']),
      interfaces: this._categoryConfidence(factors, ['parsability', 'complexity']),
      overall: overall
    };

    return {
      overall: Math.round(overall),
      byCategory,
      factors
    };
  }

  /**
   * Check API contracts implementation
   */
  _checkAPIContracts(code, spec) {
    const gaps = [];
    const contracts = spec.specification?.apiContracts || [];

    for (const contract of contracts) {
      const endpoint = contract.endpoint;
      const method = contract.method;

      // Simple check: does endpoint exist in code?
      const endpointPattern = new RegExp(`['"\`]${endpoint}['"\`]`);
      const methodPattern = new RegExp(`\\.${method.toLowerCase()}\\s*\\(`);

      if (!endpointPattern.test(code)) {
        gaps.push({
          category: 'api_contract',
          severity: 'high',
          contract: endpoint,
          message: `Endpoint ${method} ${endpoint} not found in code`
        });
      } else if (!methodPattern.test(code)) {
        gaps.push({
          category: 'api_contract',
          severity: 'medium',
          contract: endpoint,
          message: `HTTP method ${method} not explicitly used for ${endpoint}`
        });
      }
    }

    return gaps;
  }

  /**
   * Check interface implementation
   */
  _checkInterfaces(code, spec) {
    const gaps = [];
    const interfaces = spec.specification?.interfaces || [];

    for (const iface of interfaces) {
      const result = SpecValidator.validateInterface(code, iface);

      if (!result.valid) {
        for (const missing of result.missing) {
          gaps.push({
            category: 'interface',
            severity: 'high',
            interface: iface.name,
            method: missing,
            message: `Missing method ${iface.name}.${missing}`
          });
        }
      }
    }

    return gaps;
  }

  /**
   * Check acceptance criteria (simplified)
   */
  _checkAcceptanceCriteria(code, spec) {
    const gaps = [];
    const criteria = spec.specification?.acceptanceCriteria || [];

    for (const criterion of criteria) {
      // Extract key terms from criterion
      const terms = this._extractKeyTerms(criterion.description);

      // Check if any terms are missing from code
      const missingTerms = terms.filter(term => !code.toLowerCase().includes(term.toLowerCase()));

      if (missingTerms.length > terms.length * 0.5) {
        gaps.push({
          category: 'acceptance_criteria',
          severity: 'medium',
          criterionId: criterion.id,
          message: `Criterion ${criterion.id} may not be fully implemented (missing key terms)`
        });
      }
    }

    return gaps;
  }

  /**
   * Check data schema usage
   */
  _checkDataSchemas(code, spec) {
    const gaps = [];
    const schemas = spec.specification?.dataSchemas || [];

    for (const schema of schemas) {
      const schemaName = schema.name;

      // Check if schema is referenced in code
      if (!code.includes(schemaName)) {
        gaps.push({
          category: 'data_schema',
          severity: 'low',
          schema: schemaName,
          message: `Schema ${schemaName} not referenced in code`
        });
      }
    }

    return gaps;
  }

  /**
   * Check error handling
   */
  _checkErrorHandling(code, spec) {
    const gaps = [];
    const errorTypes = spec.specification?.errorHandling || [];

    const hasTryCatch = /try\s*\{[\s\S]*catch/.test(code);

    if (errorTypes.length > 0 && !hasTryCatch) {
      gaps.push({
        category: 'error_handling',
        severity: 'medium',
        message: 'Spec requires error handling but no try/catch found'
      });
    }

    for (const errorSpec of errorTypes) {
      if (errorSpec.retry && !/retry|attempt/i.test(code)) {
        gaps.push({
          category: 'error_handling',
          severity: 'medium',
          errorType: errorSpec.errorType,
          message: `Error ${errorSpec.errorType} requires retry but no retry logic found`
        });
      }
    }

    return gaps;
  }

  /**
   * Assess spec quality
   */
  _assessSpecQuality(spec) {
    if (!spec || spec.error || spec.fallback) {
      return {
        score: 0,
        reason: 'No spec available (fallback mode)'
      };
    }

    let score = 100;
    const reasons = [];

    if ((spec.specification?.apiContracts || []).length === 0) {
      score -= 20;
      reasons.push('No API contracts');
    }

    if ((spec.specification?.acceptanceCriteria || []).length < 2) {
      score -= 30;
      reasons.push('Few acceptance criteria');
    }

    if ((spec.specification?.interfaces || []).length === 0) {
      score -= 10;
      reasons.push('No interfaces defined');
    }

    return {
      score: Math.max(0, score),
      reason: reasons.length > 0 ? reasons.join('; ') : 'Complete, high-quality spec'
    };
  }

  /**
   * Assess how reviewable this task is
   */
  _assessReviewability(task, spec) {
    let score = 100;
    const reasons = [];

    if (task.files?.length > 1) {
      score -= 20;
      reasons.push('Multiple files harder to review');
    }

    if (!spec || (spec.specification?.apiContracts || []).length === 0) {
      score -= 30;
      reasons.push('No API contracts to verify');
    }

    if (!spec || (spec.specification?.acceptanceCriteria || []).length < 2) {
      score -= 20;
      reasons.push('Few acceptance criteria');
    }

    if (task.priority === 'CRITICAL') {
      score -= 10;
      reasons.push('Critical task requires higher scrutiny');
    }

    return {
      score: Math.max(0, score),
      reason: reasons.length > 0 ? reasons.join('; ') : 'Highly reviewable task'
    };
  }

  /**
   * Assess gap detectability
   */
  _assessGapDetectability(gaps) {
    if (gaps.length === 0) {
      return {
        score: 100,
        reason: 'No gaps detected (high confidence in absence)'
      };
    }

    const obviousGaps = gaps.filter(g =>
      g.category === 'api_contract' ||
      g.category === 'missing_schema'
    );

    const subtleGaps = gaps.length - obviousGaps.length;
    const obviousRatio = obviousGaps.length / gaps.length;

    const score = 50 + (obviousRatio * 50);

    return {
      score: Math.round(score),
      reason: subtleGaps > 0 ?
        `${subtleGaps} subtle gaps may be inaccurate` :
        'All gaps are obvious structural issues'
    };
  }

  /**
   * Assess code complexity
   */
  _assessCodeComplexity(code) {
    const lines = code.split('\n').length;
    const complexity = this._calculateCyclomaticComplexity(code);

    let score = 100;
    const reasons = [];

    if (lines > 200) {
      score -= 20;
      reasons.push('Large file (>200 lines)');
    }

    if (complexity > 15) {
      score -= 30;
      reasons.push(`High complexity (${complexity})`);
    }

    return {
      score: Math.max(0, score),
      reason: reasons.length > 0 ? reasons.join('; ') : 'Simple, easy to review'
    };
  }

  /**
   * Try to parse code to AST
   */
  async _tryParseCode(code) {
    try {
      const ast = SpecValidator.parseCode(code, 'javascript');
      return ast !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate cyclomatic complexity (simplified)
   */
  _calculateCyclomaticComplexity(code) {
    const decisions = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bwhile\s*\(/g,
      /\bfor\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\s*.*\s*:/g
    ];

    let complexity = 1;

    for (const pattern of decisions) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Calculate category-specific confidence
   */
  _categoryConfidence(factors, relevantFactorNames) {
    const relevant = factors.filter(f => relevantFactorNames.includes(f.name));
    const totalWeight = relevant.reduce((acc, f) => acc + f.weight, 0);
    const weightedScore = relevant.reduce((acc, f) => acc + (f.score * f.weight), 0);

    return totalWeight > 0 ? weightedScore / totalWeight : 50;
  }

  /**
   * Extract key terms from text
   */
  _extractKeyTerms(text) {
    // Simple extraction: find words longer than 4 chars
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    // Remove common words
    const commonWords = ['must', 'should', 'will', 'when', 'then', 'that', 'this', 'with', 'from'];
    return words.filter(w => !commonWords.includes(w));
  }
}

module.exports = ReviewAgent;
