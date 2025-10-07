/**
 * Architecture Quality Gate
 * Validates architectural designs before acceptance
 */

class ArchitectureQualityGate {
  constructor(options = {}) {
    this.config = {
      minOverallScore: options.minOverallScore || 80,
      minRevisionScore: options.minRevisionScore || 60,
      weights: {
        completeness: options.weights?.completeness || 0.25,
        consistency: options.weights?.consistency || 0.25,
        feasibility: options.weights?.feasibility || 0.20,
        scalability: options.weights?.scalability || 0.15,
        security: options.weights?.security || 0.15
      }
    };
  }

  /**
   * Validate architecture against quality criteria
   * @param {Object} architecture - Architecture to validate
   * @returns {Object} Validation result
   */
  async validate(architecture) {
    console.log('[ArchitectureQualityGate] Starting validation');

    const checks = await Promise.all([
      this.checkCompleteness(architecture),
      this.checkConsistency(architecture),
      this.checkFeasibility(architecture),
      this.checkScalability(architecture),
      this.checkSecurity(architecture)
    ]);

    const result = this.computeQualityScore(checks);

    console.log(`[ArchitectureQualityGate] Validation complete: Score=${result.overallScore}, Passed=${result.passed}`);

    return result;
  }

  /**
   * Check if all required sections are present and complete
   * @param {Object} architecture
   * @returns {Object} Check result
   */
  async checkCompleteness(architecture) {
    const issues = [];
    let score = 100;

    // Required top-level sections
    const requiredSections = [
      'overview',
      'components',
      'dataArchitecture',
      'securityArchitecture',
      'deploymentArchitecture'
    ];

    for (const section of requiredSections) {
      if (!architecture[section]) {
        issues.push({
          type: 'missing_section',
          severity: 'critical',
          message: `Missing required section: ${section}`
        });
        score -= 20;
      }
    }

    // Check overview completeness
    if (architecture.overview) {
      if (!architecture.overview.style) {
        issues.push({
          type: 'missing_field',
          severity: 'high',
          message: 'Missing architecture style in overview'
        });
        score -= 10;
      }
      if (!architecture.overview.keyDecisions || architecture.overview.keyDecisions.length === 0) {
        issues.push({
          type: 'missing_field',
          severity: 'medium',
          message: 'No key architectural decisions documented'
        });
        score -= 5;
      }
    }

    // Check components completeness
    if (architecture.components) {
      if (architecture.components.length === 0) {
        issues.push({
          type: 'empty_section',
          severity: 'critical',
          message: 'No components defined'
        });
        score -= 20;
      } else {
        // Check each component has required fields
        architecture.components.forEach((comp, idx) => {
          if (!comp.id) {
            issues.push({
              type: 'missing_field',
              severity: 'high',
              message: `Component ${idx} missing ID`
            });
            score -= 5;
          }
          if (!comp.responsibility) {
            issues.push({
              type: 'missing_field',
              severity: 'medium',
              message: `Component ${comp.id || idx} missing responsibility`
            });
            score -= 3;
          }
          if (!comp.technology) {
            issues.push({
              type: 'missing_field',
              severity: 'medium',
              message: `Component ${comp.id || idx} missing technology stack`
            });
            score -= 3;
          }
        });
      }
    }

    // Check data architecture
    if (architecture.dataArchitecture) {
      if (!architecture.dataArchitecture.databases || architecture.dataArchitecture.databases.length === 0) {
        issues.push({
          type: 'missing_field',
          severity: 'high',
          message: 'No databases defined in data architecture'
        });
        score -= 10;
      }
      if (!architecture.dataArchitecture.dataFlow || architecture.dataArchitecture.dataFlow.length === 0) {
        issues.push({
          type: 'missing_field',
          severity: 'medium',
          message: 'No data flow defined'
        });
        score -= 5;
      }
    }

    // Check security architecture
    if (architecture.securityArchitecture) {
      if (!architecture.securityArchitecture.authentication) {
        issues.push({
          type: 'missing_field',
          severity: 'critical',
          message: 'No authentication strategy defined'
        });
        score -= 15;
      }
      if (!architecture.securityArchitecture.authorization) {
        issues.push({
          type: 'missing_field',
          severity: 'high',
          message: 'No authorization model defined'
        });
        score -= 10;
      }
    }

    return {
      category: 'completeness',
      score: Math.max(0, score),
      passed: score >= 70,
      issues
    };
  }

  /**
   * Check for internal consistency and references
   * @param {Object} architecture
   * @returns {Object} Check result
   */
  async checkConsistency(architecture) {
    const issues = [];
    let score = 100;

    // Build component ID set
    const componentIds = new Set();
    if (architecture.components) {
      architecture.components.forEach(c => {
        if (c.id) componentIds.add(c.id);
      });
    }

    // Check component dependencies exist
    if (architecture.components) {
      architecture.components.forEach(component => {
        if (component.dependencies) {
          component.dependencies.forEach(dep => {
            if (!componentIds.has(dep)) {
              issues.push({
                type: 'invalid_reference',
                severity: 'high',
                message: `Component ${component.id} depends on non-existent component: ${dep}`
              });
              score -= 10;
            }
          });
        }
      });
    }

    // Check data flow references
    if (architecture.dataArchitecture?.dataFlow) {
      architecture.dataArchitecture.dataFlow.forEach(flow => {
        if (!componentIds.has(flow.from)) {
          issues.push({
            type: 'invalid_reference',
            severity: 'high',
            message: `Data flow references non-existent source: ${flow.from}`
          });
          score -= 8;
        }
        if (!componentIds.has(flow.to)) {
          issues.push({
            type: 'invalid_reference',
            severity: 'high',
            message: `Data flow references non-existent target: ${flow.to}`
          });
          score -= 8;
        }
      });
    }

    // Check for circular dependencies
    const cycles = this._detectCircularDependencies(architecture.components || []);
    if (cycles.length > 0) {
      cycles.forEach(cycle => {
        issues.push({
          type: 'circular_dependency',
          severity: 'critical',
          message: `Circular dependency detected: ${cycle}`
        });
        score -= 15;
      });
    }

    // Check technology consistency
    const languages = new Set();
    const databases = new Set();

    if (architecture.components) {
      architecture.components.forEach(comp => {
        if (comp.technology?.language) {
          languages.add(comp.technology.language);
        }
      });
    }

    if (languages.size > 3) {
      issues.push({
        type: 'technology_sprawl',
        severity: 'medium',
        message: `Too many programming languages (${languages.size}): ${Array.from(languages).join(', ')}`
      });
      score -= 5;
    }

    return {
      category: 'consistency',
      score: Math.max(0, score),
      passed: score >= 70,
      issues
    };
  }

  /**
   * Check technical feasibility
   * @param {Object} architecture
   * @returns {Object} Check result
   */
  async checkFeasibility(architecture) {
    const issues = [];
    let score = 100;

    // Check if architecture style matches requirements
    if (architecture.overview?.style === 'microservices') {
      if (!architecture.components || architecture.components.length < 3) {
        issues.push({
          type: 'style_mismatch',
          severity: 'high',
          message: 'Microservices architecture should have multiple services'
        });
        score -= 15;
      }

      // Check for required microservices components
      const hasApiGateway = architecture.components?.some(c =>
        c.id?.includes('gateway') || c.name?.toLowerCase().includes('gateway')
      );

      if (!hasApiGateway) {
        issues.push({
          type: 'missing_component',
          severity: 'medium',
          message: 'Microservices architecture should include an API Gateway'
        });
        score -= 10;
      }
    }

    // Check deployment feasibility
    if (architecture.deploymentArchitecture?.containerization?.enabled) {
      const hasOrchestration = architecture.deploymentArchitecture.containerization.orchestration;
      if (!hasOrchestration) {
        issues.push({
          type: 'missing_config',
          severity: 'medium',
          message: 'Container orchestration not specified for containerized deployment'
        });
        score -= 10;
      }
    }

    // Check database feasibility
    if (architecture.dataArchitecture?.databases) {
      architecture.dataArchitecture.databases.forEach(db => {
        if (!db.backup) {
          issues.push({
            type: 'missing_config',
            severity: 'high',
            message: `Database ${db.id} missing backup strategy`
          });
          score -= 8;
        }
      });
    }

    return {
      category: 'feasibility',
      score: Math.max(0, score),
      passed: score >= 70,
      issues
    };
  }

  /**
   * Check scalability characteristics
   * @param {Object} architecture
   * @returns {Object} Check result
   */
  async checkScalability(architecture) {
    const issues = [];
    let score = 100;

    // Check component scalability
    if (architecture.components) {
      let scalableComponents = 0;
      architecture.components.forEach(comp => {
        if (comp.constraints?.scalability?.horizontal ||
            comp.constraints?.scalability?.vertical) {
          scalableComponents++;
        }
      });

      const scalabilityRatio = scalableComponents / architecture.components.length;
      if (scalabilityRatio < 0.5) {
        issues.push({
          type: 'scalability_gap',
          severity: 'medium',
          message: `Only ${Math.round(scalabilityRatio * 100)}% of components have scalability defined`
        });
        score -= 15;
      }
    }

    // Check for bottlenecks
    if (architecture.components) {
      const componentDependencyCounts = {};
      architecture.components.forEach(comp => {
        if (comp.dependencies) {
          comp.dependencies.forEach(dep => {
            componentDependencyCounts[dep] = (componentDependencyCounts[dep] || 0) + 1;
          });
        }
      });

      // Check for components with many dependents (potential bottlenecks)
      Object.entries(componentDependencyCounts).forEach(([compId, count]) => {
        if (count > 3) {
          const comp = architecture.components.find(c => c.id === compId);
          if (!comp?.constraints?.scalability?.horizontal) {
            issues.push({
              type: 'bottleneck_risk',
              severity: 'high',
              message: `Component ${compId} has ${count} dependents but no horizontal scaling`
            });
            score -= 10;
          }
        }
      });
    }

    // Check caching strategy
    if (!architecture.dataArchitecture?.caching) {
      issues.push({
        type: 'missing_optimization',
        severity: 'medium',
        message: 'No caching strategy defined'
      });
      score -= 10;
    }

    return {
      category: 'scalability',
      score: Math.max(0, score),
      passed: score >= 70,
      issues
    };
  }

  /**
   * Check security aspects
   * @param {Object} architecture
   * @returns {Object} Check result
   */
  async checkSecurity(architecture) {
    const issues = [];
    let score = 100;

    // Check authentication
    if (!architecture.securityArchitecture?.authentication) {
      issues.push({
        type: 'missing_security',
        severity: 'critical',
        message: 'No authentication mechanism defined'
      });
      score -= 20;
    } else {
      if (!architecture.securityArchitecture.authentication.tokenExpiry) {
        issues.push({
          type: 'security_config',
          severity: 'medium',
          message: 'Token expiry not specified'
        });
        score -= 5;
      }
    }

    // Check authorization
    if (!architecture.securityArchitecture?.authorization) {
      issues.push({
        type: 'missing_security',
        severity: 'critical',
        message: 'No authorization model defined'
      });
      score -= 20;
    }

    // Check encryption
    if (!architecture.securityArchitecture?.encryption) {
      issues.push({
        type: 'missing_security',
        severity: 'high',
        message: 'No encryption strategy defined'
      });
      score -= 15;
    } else {
      if (!architecture.securityArchitecture.encryption.inTransit) {
        issues.push({
          type: 'security_config',
          severity: 'high',
          message: 'Encryption in transit not specified'
        });
        score -= 10;
      }
      if (!architecture.securityArchitecture.encryption.atRest) {
        issues.push({
          type: 'security_config',
          severity: 'high',
          message: 'Encryption at rest not specified'
        });
        score -= 10;
      }
    }

    // Check compliance
    if (!architecture.securityArchitecture?.compliance ||
        architecture.securityArchitecture.compliance.length === 0) {
      issues.push({
        type: 'missing_security',
        severity: 'medium',
        message: 'No compliance standards specified'
      });
      score -= 5;
    }

    // Check for security constraints
    if (!architecture.constraints?.security ||
        architecture.constraints.security.length === 0) {
      issues.push({
        type: 'missing_constraints',
        severity: 'medium',
        message: 'No security constraints defined'
      });
      score -= 5;
    }

    return {
      category: 'security',
      score: Math.max(0, score),
      passed: score >= 70,
      issues
    };
  }

  /**
   * Compute overall quality score
   * @param {Array} checks - Individual check results
   * @returns {Object} Overall result
   */
  computeQualityScore(checks) {
    const weights = this.config.weights;
    let weightedSum = 0;
    let totalWeight = 0;
    let allIssues = [];
    let criticalIssues = 0;
    let highIssues = 0;

    const checksByCategory = {};

    checks.forEach(check => {
      checksByCategory[check.category] = check;
      const weight = weights[check.category] || 0;
      weightedSum += check.score * weight;
      totalWeight += weight;

      if (check.issues) {
        allIssues = allIssues.concat(check.issues);
        check.issues.forEach(issue => {
          if (issue.severity === 'critical') criticalIssues++;
          if (issue.severity === 'high') highIssues++;
        });
      }
    });

    const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    // Determine recommendation
    let recommendation = 'accept';
    if (criticalIssues > 0 || overallScore < this.config.minRevisionScore) {
      recommendation = 'regenerate';
    } else if (overallScore < this.config.minOverallScore) {
      recommendation = 'revise';
    }

    return {
      overallScore,
      passed: overallScore >= this.config.minOverallScore && criticalIssues === 0,
      recommendation,
      checks: checksByCategory,
      issues: allIssues,
      criticalIssues,
      highIssues,
      totalIssues: allIssues.length
    };
  }

  /**
   * Detect circular dependencies in components
   * @private
   */
  _detectCircularDependencies(components) {
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (compId, path = []) => {
      if (recursionStack.has(compId)) {
        const cycleStart = path.indexOf(compId);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), compId].join(' -> '));
        }
        return;
      }

      if (visited.has(compId)) {
        return;
      }

      visited.add(compId);
      recursionStack.add(compId);

      const component = components.find(c => c.id === compId);
      if (component?.dependencies) {
        component.dependencies.forEach(dep => {
          dfs(dep, [...path, compId]);
        });
      }

      recursionStack.delete(compId);
    };

    components.forEach(comp => {
      if (comp.id && !visited.has(comp.id)) {
        dfs(comp.id);
      }
    });

    return cycles;
  }
}

module.exports = ArchitectureQualityGate;