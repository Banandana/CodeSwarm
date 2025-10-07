/**
 * Semantic Correctness Validator (Enhancement 3)
 *
 * Validates business logic correctness beyond structural checks.
 * Uses Claude API to reason about code semantics.
 */

const BaseAgent = require('../agents/base-agent');

class SemanticValidator extends BaseAgent {
  constructor(communicationHub) {
    super('semantic-validator', 'validator', communicationHub);
  }

  /**
   * Validate semantic correctness
   * @param {string} code - Generated code
   * @param {Object} spec - Specification
   * @param {string} tests - Test code (optional)
   * @returns {Promise<Object>} Validation result
   */
  async validateSemantics(code, spec, tests = '') {
    const checks = await Promise.all([
      this.validateBusinessLogic(code, spec),
      this.validateEdgeCases(code, spec, tests),
      this.validateErrorRecovery(code, spec),
      this.validateSecurityProperties(code, spec),
      this.validatePerformanceCharacteristics(code, spec)
    ]);

    return this.aggregateSemanticResults(checks);
  }

  /**
   * Validate business logic correctness using Claude
   */
  async validateBusinessLogic(code, spec) {
    const criteria = spec.specification?.acceptanceCriteria || [];

    if (criteria.length === 0) {
      return {
        category: 'business_logic',
        score: 100,
        skipped: true,
        reason: 'No acceptance criteria to validate'
      };
    }

    const prompt = this._buildBusinessLogicPrompt(code, criteria);

    try {
      const response = await this.callClaude([
        { role: 'user', content: prompt }
      ], {
        temperature: 0.2,
        maxTokens: 2000,
        priority: 'NORMAL'
      });

      const analysis = this._parseSemanticAnalysis(response.content);

      const correct = analysis.criteriaResults.filter(r => r.semanticallyCorrect).length;
      const score = criteria.length > 0 ? (correct / criteria.length) * 100 : 0;

      return {
        category: 'business_logic',
        score: Math.round(score),
        details: analysis.criteriaResults,
        concerns: analysis.criteriaResults.flatMap(r => r.concerns || [])
      };
    } catch (error) {
      console.error('[SemanticValidator] Business logic validation failed:', error.message);
      return {
        category: 'business_logic',
        score: 50,
        error: error.message
      };
    }
  }

  /**
   * Validate edge case handling
   */
  async validateEdgeCases(code, spec, tests) {
    const issues = [];

    const edgeCases = [
      {
        pattern: /null|undefined/i,
        description: 'Null/undefined handling',
        severity: 'high'
      },
      {
        pattern: /\.length\s*===?\s*0|empty/i,
        description: 'Empty input handling',
        severity: 'medium'
      },
      {
        pattern: /boundary|limit|max|min/i,
        description: 'Boundary conditions',
        severity: 'medium'
      },
      {
        pattern: /negative|<\s*0/i,
        description: 'Negative number handling',
        severity: 'low'
      },
      {
        pattern: /concurrent|race|mutex|lock/i,
        description: 'Concurrency issues',
        severity: 'high'
      }
    ];

    for (const edgeCase of edgeCases) {
      const handledInCode = edgeCase.pattern.test(code);
      const testedInTests = tests && edgeCase.pattern.test(tests);

      if (!handledInCode && !testedInTests) {
        issues.push({
          type: 'missing_edge_case',
          description: edgeCase.description,
          severity: edgeCase.severity,
          message: `No evidence of ${edgeCase.description} in code or tests`
        });
      }
    }

    const severityWeights = { high: 20, medium: 15, low: 10 };
    const penalty = issues.reduce((acc, issue) => {
      return acc + (severityWeights[issue.severity] || 15);
    }, 0);

    const score = Math.max(0, 100 - penalty);

    return {
      category: 'edge_cases',
      score,
      issues
    };
  }

  /**
   * Validate error recovery behavior
   */
  async validateErrorRecovery(code, spec) {
    const issues = [];

    const hasTryCatch = /try\s*\{[\s\S]*catch/.test(code);
    const hasErrorHandling = /throw\s+|catch\s*\(/.test(code);

    if (!hasTryCatch && !hasErrorHandling) {
      issues.push({
        type: 'no_error_handling',
        severity: 'high',
        message: 'No try/catch or error throwing found'
      });
    }

    const errorSpecs = spec.specification?.errorHandling || [];
    const retriesRequired = errorSpecs.filter(e => e.retry === true);

    if (retriesRequired.length > 0) {
      const hasRetryLogic = /retry|attempt/i.test(code);

      if (!hasRetryLogic) {
        issues.push({
          type: 'missing_retry_logic',
          severity: 'medium',
          message: `Spec requires retries for ${retriesRequired.length} error types, but no retry logic found`
        });
      }
    }

    const score = Math.max(0, 100 - issues.length * 25);

    return {
      category: 'error_recovery',
      score,
      issues
    };
  }

  /**
   * Validate security properties
   */
  async validateSecurityProperties(code, spec) {
    const issues = [];

    const secRequirements = spec.specification?.securityRequirements || [];

    if (secRequirements.length === 0) {
      return {
        category: 'security_semantics',
        score: 100,
        skipped: true
      };
    }

    for (const req of secRequirements) {
      const verified = await this._verifySecurityRequirement(code, req);

      if (!verified.passed) {
        issues.push({
          type: 'security_requirement_not_met',
          requirement: req.requirement,
          severity: 'critical',
          details: verified.reason
        });
      }
    }

    const additionalChecks = [
      {
        name: 'password_hashing',
        pattern: /bcrypt|scrypt|argon2/i,
        required: /password|hash/i.test(code),
        severity: 'critical',
        message: 'Password handling found but no secure hashing library'
      },
      {
        name: 'sql_injection',
        pattern: /\$\{.*\}|`\$\{|'\s*\+\s*\w+\s*\+\s*'/,
        antiPattern: true,
        required: /query|sql|execute/i.test(code),
        severity: 'critical',
        message: 'Possible SQL injection via string concatenation'
      },
      {
        name: 'xss_prevention',
        pattern: /dangerouslySetInnerHTML|innerHTML\s*=/,
        antiPattern: true,
        required: /html|render/i.test(code),
        severity: 'high',
        message: 'Possible XSS via innerHTML'
      }
    ];

    for (const check of additionalChecks) {
      if (!check.required) continue;

      const hasPattern = check.pattern.test(code);

      if (check.antiPattern) {
        if (hasPattern) {
          issues.push({
            type: check.name,
            severity: check.severity,
            message: check.message
          });
        }
      } else {
        if (!hasPattern) {
          issues.push({
            type: check.name,
            severity: check.severity,
            message: check.message
          });
        }
      }
    }

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const score = criticalCount > 0 ? 0 : Math.max(0, 100 - issues.length * 20);

    return {
      category: 'security_semantics',
      score,
      issues
    };
  }

  /**
   * Validate performance characteristics
   */
  async validatePerformanceCharacteristics(code, spec) {
    const issues = [];

    const antiPatterns = [
      {
        pattern: /for\s*\([^)]*\)\s*\{[^}]*for\s*\([^)]*\)/s,
        issue: 'Nested loops detected (O(n²) or worse)',
        severity: 'medium'
      },
      {
        pattern: /while\s*\(\s*true\s*\)/,
        issue: 'Infinite loop without clear break condition',
        severity: 'high'
      },
      {
        pattern: /\.forEach\([^)]*\.forEach/s,
        issue: 'Nested forEach (consider using more efficient approach)',
        severity: 'low'
      }
    ];

    for (const antiPattern of antiPatterns) {
      if (antiPattern.pattern.test(code)) {
        issues.push({
          type: 'performance_antipattern',
          description: antiPattern.issue,
          severity: antiPattern.severity
        });
      }
    }

    const score = Math.max(0, 100 - issues.length * 20);

    return {
      category: 'performance',
      score,
      issues
    };
  }

  /**
   * Verify specific security requirement
   */
  async _verifySecurityRequirement(code, requirement) {
    const verification = requirement.verification || '';

    if (verification.includes('bcrypt')) {
      const hasBcrypt = /bcrypt|scrypt|argon2/i.test(code);
      return {
        passed: hasBcrypt,
        reason: hasBcrypt ? 'Bcrypt usage found' : 'No bcrypt or equivalent found'
      };
    }

    if (verification.includes('JWT_SECRET')) {
      const hasSecret = /JWT_SECRET|process\.env\./i.test(code);
      return {
        passed: hasSecret,
        reason: hasSecret ? 'Environment variable usage found' : 'No environment variable usage'
      };
    }

    if (verification.includes('rate limit')) {
      const hasRateLimit = /rateLimit|rate-limit/i.test(code);
      return {
        passed: hasRateLimit,
        reason: hasRateLimit ? 'Rate limiting found' : 'No rate limiting middleware'
      };
    }

    return {
      passed: true,
      reason: 'Could not verify automatically'
    };
  }

  /**
   * Build business logic validation prompt
   */
  _buildBusinessLogicPrompt(code, criteria) {
    return `You are reviewing code for semantic correctness.

SPECIFICATION (Acceptance Criteria):
${criteria.map(c => `${c.id}: ${c.description}\nExpected: ${c.expectedBehavior}`).join('\n\n')}

CODE:
\`\`\`javascript
${code}
\`\`\`

TASK: For each acceptance criterion, determine if the code semantically implements it correctly.

Look for:
- Correct algorithm/logic
- Proper state transitions
- Correct calculations
- Appropriate validations
- Edge case handling
- Error handling

Output JSON (valid JSON only, no markdown):
{
  "criteriaResults": [
    {
      "criterionId": "AC-001",
      "semanticallyCorrect": true,
      "confidence": 95,
      "reasoning": "explanation",
      "concerns": ["potential issue 1", "potential issue 2"]
    }
  ]
}`;
  }

  /**
   * Parse semantic analysis response
   */
  _parseSemanticAnalysis(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    } catch (error) {
      console.error('[SemanticValidator] Failed to parse semantic analysis:', error.message);
      return {
        criteriaResults: []
      };
    }
  }

  /**
   * Aggregate all semantic results
   */
  aggregateSemanticResults(checks) {
    const weights = {
      business_logic: 0.40,
      edge_cases: 0.20,
      error_recovery: 0.20,
      security_semantics: 0.15,
      performance: 0.05
    };

    let overallScore = 0;
    const allIssues = [];

    for (const check of checks) {
      if (check.skipped) {
        overallScore += 100 * weights[check.category];
      } else {
        overallScore += check.score * weights[check.category];
      }

      if (check.issues) {
        allIssues.push(...check.issues);
      }
      if (check.concerns) {
        allIssues.push(...check.concerns.map(c => ({ type: 'concern', message: c })));
      }
    }

    const criticalIssues = allIssues.filter(i => i.severity === 'critical');

    return {
      overallScore: Math.round(overallScore),
      passed: overallScore >= 70 && criticalIssues.length === 0,
      checks,
      criticalIssues: criticalIssues.length,
      totalIssues: allIssues.length,
      issues: allIssues
    };
  }
}

module.exports = SemanticValidator;
