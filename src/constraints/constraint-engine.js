/**
 * Constraint Engine
 * Enforces architectural constraints on implementations
 */

class ConstraintEngine {
  constructor() {
    this.constraints = new Map();
  }

  /**
   * Load constraints from architecture
   * @param {Object} architecture - Architecture specification
   */
  loadConstraints(architecture) {
    if (!architecture.constraints) {
      return;
    }

    // Load technical constraints
    if (architecture.constraints.technical) {
      architecture.constraints.technical.forEach(constraint => {
        this.addConstraint('technical', constraint);
      });
    }

    // Load performance constraints
    if (architecture.constraints.performance) {
      architecture.constraints.performance.forEach(constraint => {
        this.addConstraint('performance', constraint);
      });
    }

    // Load security constraints
    if (architecture.constraints.security) {
      architecture.constraints.security.forEach(constraint => {
        this.addConstraint('security', constraint);
      });
    }
  }

  /**
   * Add a constraint
   * @param {string} category - Constraint category
   * @param {Object} constraint - Constraint definition
   */
  addConstraint(category, constraint) {
    if (!this.constraints.has(category)) {
      this.constraints.set(category, []);
    }

    this.constraints.get(category).push({
      ...constraint,
      category,
      id: constraint.id || `${category}-${Date.now()}`
    });
  }

  /**
   * Validate implementation against constraints
   * @param {Object} implementation - Implementation to validate
   * @param {Object} context - Context including task, component, etc.
   * @returns {Object} Validation result
   */
  validateAgainstConstraints(implementation, context = {}) {
    const violations = [];
    const warnings = [];

    // Check each category of constraints
    for (const [category, constraints] of this.constraints) {
      for (const constraint of constraints) {
        if (this._appliesTo(constraint, context)) {
          const result = this._checkConstraint(implementation, constraint, context);

          if (!result.satisfied) {
            if (constraint.type === 'mandatory') {
              violations.push({
                constraintId: constraint.id,
                category: constraint.category,
                description: constraint.description,
                violation: result.violation,
                severity: 'error'
              });
            } else {
              warnings.push({
                constraintId: constraint.id,
                category: constraint.category,
                description: constraint.description,
                violation: result.violation,
                severity: 'warning'
              });
            }
          }
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings,
      totalIssues: violations.length + warnings.length
    };
  }

  /**
   * Get constraints for a specific component
   * @param {string} componentId - Component ID
   * @returns {Array} Applicable constraints
   */
  getConstraintsForComponent(componentId) {
    const applicable = [];

    for (const [category, constraints] of this.constraints) {
      for (const constraint of constraints) {
        if (this._appliesTo(constraint, { componentId })) {
          applicable.push(constraint);
        }
      }
    }

    return applicable;
  }

  /**
   * Get constraints by category
   * @param {string} category - Category name
   * @returns {Array} Constraints in category
   */
  getConstraintsByCategory(category) {
    return this.constraints.get(category) || [];
  }

  /**
   * Apply constraints to code generation
   * @param {Object} task - Task being executed
   * @returns {Object} Constraint instructions for agent
   */
  getConstraintInstructions(task) {
    const instructions = {
      technical: [],
      performance: [],
      security: []
    };

    const context = {
      componentId: task.componentId,
      taskType: task.type,
      agentType: task.agentType
    };

    for (const [category, constraints] of this.constraints) {
      for (const constraint of constraints) {
        if (this._appliesTo(constraint, context)) {
          instructions[category].push(this._formatInstruction(constraint));
        }
      }
    }

    return instructions;
  }

  /**
   * Check if constraint applies to context
   * @private
   */
  _appliesTo(constraint, context) {
    // Check if constraint applies to all
    if (constraint.applies_to === 'all' || constraint.applies_to === 'all_components') {
      return true;
    }

    // Check if constraint applies to specific component
    if (constraint.applies_to === context.componentId) {
      return true;
    }

    // Check if constraint applies to component type
    if (constraint.applies_to === context.componentType) {
      return true;
    }

    // Check if constraint applies to agent type
    if (constraint.applies_to === context.agentType) {
      return true;
    }

    // Check array of applicable targets
    if (Array.isArray(constraint.applies_to)) {
      return constraint.applies_to.includes(context.componentId) ||
             constraint.applies_to.includes(context.componentType) ||
             constraint.applies_to.includes(context.agentType);
    }

    return false;
  }

  /**
   * Check if implementation satisfies constraint
   * @private
   */
  _checkConstraint(implementation, constraint, context) {
    switch (constraint.category) {
      case 'technical':
        return this._checkTechnicalConstraint(implementation, constraint);
      case 'performance':
        return this._checkPerformanceConstraint(implementation, constraint);
      case 'security':
        return this._checkSecurityConstraint(implementation, constraint);
      default:
        return { satisfied: true };
    }
  }

  /**
   * Check technical constraint
   * @private
   */
  _checkTechnicalConstraint(implementation, constraint) {
    // Example checks based on constraint ID patterns
    if (constraint.id === 'tech-stack-consistency') {
      // Check if implementation uses allowed languages
      const allowedLanguages = this._extractAllowedLanguages(constraint.description);
      const usedLanguage = implementation.language || implementation.technology?.language;

      if (usedLanguage && allowedLanguages.length > 0) {
        const satisfied = allowedLanguages.some(lang =>
          usedLanguage.toLowerCase().includes(lang.toLowerCase())
        );

        if (!satisfied) {
          return {
            satisfied: false,
            violation: `Uses ${usedLanguage} but constraint requires ${allowedLanguages.join(' or ')}`
          };
        }
      }
    }

    if (constraint.id === 'consistent-error-handling') {
      // Check for error handling patterns
      const hasErrorHandling = implementation.content?.includes('try') ||
                               implementation.content?.includes('catch') ||
                               implementation.content?.includes('error');

      if (!hasErrorHandling) {
        return {
          satisfied: false,
          violation: 'No error handling detected in implementation'
        };
      }
    }

    if (constraint.id === 'logging-standard') {
      // Check for logging implementation
      const hasLogging = implementation.content?.includes('log') ||
                         implementation.content?.includes('logger');

      if (!hasLogging) {
        return {
          satisfied: false,
          violation: 'No logging implementation detected'
        };
      }
    }

    return { satisfied: true };
  }

  /**
   * Check performance constraint
   * @private
   */
  _checkPerformanceConstraint(implementation, constraint) {
    if (constraint.id === 'response-time') {
      // Check for performance optimizations
      const hasOptimizations = implementation.content?.includes('cache') ||
                               implementation.content?.includes('index') ||
                               implementation.content?.includes('async');

      if (!hasOptimizations && constraint.type === 'mandatory') {
        return {
          satisfied: false,
          violation: 'No performance optimizations detected for response time constraint'
        };
      }
    }

    if (constraint.id === 'connection-pooling') {
      // Check for connection pooling
      if (implementation.content?.includes('database') ||
          implementation.content?.includes('connection')) {
        const hasPooling = implementation.content?.includes('pool') ||
                          implementation.content?.includes('Pool');

        if (!hasPooling) {
          return {
            satisfied: false,
            violation: 'Database connections should use connection pooling'
          };
        }
      }
    }

    return { satisfied: true };
  }

  /**
   * Check security constraint
   * @private
   */
  _checkSecurityConstraint(implementation, constraint) {
    if (constraint.id === 'auth-required') {
      // Check for authentication
      const exceptions = constraint.exceptions || [];
      const isException = exceptions.some(ex =>
        implementation.path?.includes(ex) || implementation.endpoint?.includes(ex)
      );

      if (!isException) {
        const hasAuth = implementation.content?.includes('auth') ||
                        implementation.content?.includes('Auth') ||
                        implementation.content?.includes('authenticate');

        if (!hasAuth) {
          return {
            satisfied: false,
            violation: 'Authentication required but not implemented'
          };
        }
      }
    }

    if (constraint.id === 'encryption-at-rest') {
      // Check for encryption in database/storage operations
      if (implementation.content?.includes('save') ||
          implementation.content?.includes('store')) {
        const hasEncryption = implementation.content?.includes('encrypt') ||
                              implementation.content?.includes('crypto');

        if (!hasEncryption) {
          return {
            satisfied: false,
            violation: 'Sensitive data should be encrypted at rest'
          };
        }
      }
    }

    if (constraint.id === 'encryption-in-transit') {
      // Check for TLS/HTTPS usage
      if (implementation.content?.includes('http://')) {
        return {
          satisfied: false,
          violation: 'Use HTTPS instead of HTTP for secure communication'
        };
      }
    }

    return { satisfied: true };
  }

  /**
   * Format constraint as instruction for agent
   * @private
   */
  _formatInstruction(constraint) {
    let instruction = constraint.description;

    if (constraint.type === 'mandatory') {
      instruction = `MANDATORY: ${instruction}`;
    } else {
      instruction = `RECOMMENDED: ${instruction}`;
    }

    if (constraint.exceptions && constraint.exceptions.length > 0) {
      instruction += ` (except: ${constraint.exceptions.join(', ')})`;
    }

    return instruction;
  }

  /**
   * Extract allowed languages from constraint description
   * @private
   */
  _extractAllowedLanguages(description) {
    const languages = [];

    // Common language names to look for
    const commonLanguages = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust',
      'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Node.js'
    ];

    commonLanguages.forEach(lang => {
      if (description.includes(lang)) {
        languages.push(lang);
      }
    });

    return languages;
  }

  /**
   * Generate constraint report
   * @param {Array} violations - Constraint violations
   * @returns {string} Formatted report
   */
  generateReport(violations) {
    if (violations.length === 0) {
      return 'All constraints satisfied ✓';
    }

    let report = `Constraint Violations (${violations.length}):\n\n`;

    const byCategory = {};
    violations.forEach(v => {
      if (!byCategory[v.category]) {
        byCategory[v.category] = [];
      }
      byCategory[v.category].push(v);
    });

    for (const [category, categoryViolations] of Object.entries(byCategory)) {
      report += `${category.toUpperCase()} (${categoryViolations.length}):\n`;
      categoryViolations.forEach(v => {
        report += `  - ${v.description}\n`;
        report += `    Violation: ${v.violation}\n`;
        report += `    Severity: ${v.severity}\n\n`;
      });
    }

    return report;
  }
}

module.exports = ConstraintEngine;