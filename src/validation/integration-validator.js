/**
 * Integration Validator (Enhancement 5)
 *
 * Validates that completed tasks work together at system level.
 * Checks API compatibility, schema consistency, and dependency chains.
 */

const TestRunner = require('./test-runner');

class IntegrationValidator {
  constructor(outputDir, components) {
    this.outputDir = outputDir;
    this.components = components;
  }

  /**
   * Validate integration between completed tasks
   * @param {Array} completedTasks - Tasks that have been completed
   * @param {Array} specs - Specifications for all features
   * @returns {Promise<Object>} Integration validation result
   */
  async validateIntegration(completedTasks, specs) {
    console.log(`[IntegrationValidator] Validating integration of ${completedTasks.length} tasks`);

    const checks = await Promise.all([
      this.validateAPIContractCompatibility(completedTasks, specs),
      this.validateSchemaConsistency(completedTasks, specs),
      this.validateDependencyChain(completedTasks),
      this.validateDataFlowIntegrity(completedTasks, specs)
    ]);

    // Run integration tests if available
    const integrationTests = await this.runIntegrationTests(completedTasks);
    if (integrationTests && !integrationTests.skipped) {
      checks.push(integrationTests);
    }

    return this.aggregateIntegrationResults(checks);
  }

  /**
   * Validate API contracts between tasks are compatible
   */
  async validateAPIContractCompatibility(tasks, specs) {
    const issues = [];

    // Build graph of API dependencies
    const apiGraph = this._buildAPIGraph(tasks, specs);

    console.log(`[IntegrationValidator] Checking ${apiGraph.edges.length} API dependencies`);

    // Check each producer-consumer pair
    for (const edge of apiGraph.edges) {
      const producer = edge.producer;
      const consumer = edge.consumer;

      // Get producer's output contract
      const producerSpec = specs.find(s => s.specId === producer.specId);
      if (!producerSpec) continue;

      const producerContract = this._findContract(producerSpec, edge.endpoint);
      if (!producerContract) {
        issues.push({
          type: 'missing_producer_contract',
          producer: producer.id,
          endpoint: edge.endpoint,
          severity: 'high',
          message: `Producer ${producer.id} missing contract for ${edge.endpoint}`
        });
        continue;
      }

      // Get consumer's input expectations
      const consumerSpec = specs.find(s => s.specId === consumer.specId);
      if (!consumerSpec) continue;

      const consumerExpectation = this._findConsumerExpectation(consumerSpec, edge.endpoint);

      // Validate compatibility
      const compatible = this._checkSchemaCompatibility(
        producerContract.responseSchema?.success?.body || {},
        consumerExpectation?.requestSchema || {}
      );

      if (!compatible.isCompatible) {
        issues.push({
          type: 'api_contract_mismatch',
          producer: producer.id,
          consumer: consumer.id,
          endpoint: edge.endpoint,
          severity: 'critical',
          details: compatible.issues,
          message: `API mismatch between ${producer.id} and ${consumer.id} at ${edge.endpoint}`
        });
      }
    }

    return {
      category: 'api_compatibility',
      passed: issues.length === 0,
      issuesFound: issues.length,
      issues
    };
  }

  /**
   * Validate schema consistency across tasks
   */
  async validateSchemaConsistency(tasks, specs) {
    const issues = [];
    const schemas = new Map();

    console.log(`[IntegrationValidator] Checking schema consistency across ${specs.length} specs`);

    // Collect all schemas
    for (const spec of specs) {
      if (!spec || !spec.specification) continue;

      for (const schema of spec.specification.dataSchemas || []) {
        if (schemas.has(schema.name)) {
          // Same schema name - must be identical or compatible
          const existing = schemas.get(schema.name);
          const consistent = this._checkSchemaEquality(existing.schema, schema);

          if (!consistent.isEqual) {
            issues.push({
              type: 'schema_conflict',
              schemaName: schema.name,
              spec1: existing.specId,
              spec2: spec.specId,
              severity: 'critical',
              differences: consistent.differences,
              message: `Schema ${schema.name} defined differently in ${existing.specId} and ${spec.specId}`
            });
          }
        } else {
          schemas.set(schema.name, { schema, specId: spec.specId });
        }
      }
    }

    return {
      category: 'schema_consistency',
      passed: issues.length === 0,
      uniqueSchemas: schemas.size,
      issuesFound: issues.length,
      issues
    };
  }

  /**
   * Validate dependency chain is correctly implemented
   */
  async validateDependencyChain(tasks) {
    const issues = [];

    console.log(`[IntegrationValidator] Validating dependency chain for ${tasks.length} tasks`);

    // Check each task's dependencies are satisfied
    for (const task of tasks) {
      for (const depId of task.dependencies || []) {
        const depTask = tasks.find(t => t.id === depId);

        if (!depTask) {
          issues.push({
            type: 'missing_dependency',
            task: task.id,
            missingDependency: depId,
            severity: 'critical',
            message: `Task ${task.id} depends on ${depId} which doesn't exist`
          });
        } else if (depTask.status !== 'completed') {
          issues.push({
            type: 'incomplete_dependency',
            task: task.id,
            dependency: depId,
            status: depTask.status,
            severity: 'high',
            message: `Task ${task.id} depends on incomplete task ${depId}`
          });
        }
      }
    }

    return {
      category: 'dependency_chain',
      passed: issues.length === 0,
      issuesFound: issues.length,
      issues
    };
  }

  /**
   * Validate data flow integrity
   */
  async validateDataFlowIntegrity(tasks, specs) {
    // TODO: Implement data flow tracing
    return {
      category: 'data_flow',
      passed: true,
      skipped: true,
      reason: 'Data flow tracing not yet implemented'
    };
  }

  /**
   * Run integration tests if available
   */
  async runIntegrationTests(completedTasks) {
    // Look for integration test files
    const integrationTests = completedTasks
      .filter(t => t.agentType === 'testing')
      .filter(t => t.files?.some(f => f.includes('integration') || f.includes('e2e')));

    if (integrationTests.length === 0) {
      return {
        category: 'integration_tests',
        skipped: true,
        reason: 'No integration tests found'
      };
    }

    console.log(`[IntegrationValidator] Running ${integrationTests.length} integration test suites`);

    const testRunner = new TestRunner(this.outputDir);
    const results = [];

    for (const testTask of integrationTests) {
      try {
        const result = await testRunner.run(testTask.files[0]);
        results.push(result);
      } catch (error) {
        results.push({
          passed: false,
          error: error.message,
          file: testTask.files[0]
        });
      }
    }

    const allPassed = results.every(r => r.passed);
    const failedTests = results.filter(r => !r.passed);

    return {
      category: 'integration_tests',
      passed: allPassed,
      totalSuites: results.length,
      failedSuites: failedTests.length,
      results
    };
  }

  /**
   * Aggregate integration results
   */
  aggregateIntegrationResults(checks) {
    const allIssues = checks.flatMap(c => c.issues || []);
    const criticalIssues = allIssues.filter(i => i.severity === 'critical');
    const passed = checks.every(c => c.passed || c.skipped);

    return {
      passed,
      checks,
      totalIssues: allIssues.length,
      criticalIssues: criticalIssues.length,
      issues: allIssues
    };
  }

  /**
   * Build API dependency graph
   */
  _buildAPIGraph(tasks, specs) {
    const graph = { nodes: [], edges: [] };

    for (const task of tasks) {
      graph.nodes.push(task);
    }

    // Find edges (simplified heuristic)
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const task1 = tasks[i];
        const task2 = tasks[j];

        // Check if task2 depends on task1's API
        if (task2.dependencies?.includes(task1.id)) {
          // Find common endpoints
          const spec1 = specs.find(s => s.specId === task1.specId);
          const contracts1 = spec1?.specification?.apiContracts || [];

          for (const contract of contracts1) {
            graph.edges.push({
              producer: task1,
              consumer: task2,
              endpoint: contract.endpoint
            });
          }
        }
      }
    }

    return graph;
  }

  /**
   * Find contract in spec
   */
  _findContract(spec, endpoint) {
    if (!spec || !spec.specification) return null;

    return (spec.specification.apiContracts || []).find(
      c => c.endpoint === endpoint
    );
  }

  /**
   * Find consumer expectation (simplified)
   */
  _findConsumerExpectation(spec, endpoint) {
    // In reality, would parse code to find how consumer uses the API
    return null;
  }

  /**
   * Check schema compatibility
   */
  _checkSchemaCompatibility(producerSchema, consumerSchema) {
    const issues = [];

    if (!consumerSchema || !consumerSchema.required) {
      return { isCompatible: true, issues };
    }

    for (const requiredField of consumerSchema.required || []) {
      if (!producerSchema.properties || !producerSchema.properties[requiredField]) {
        issues.push(`Consumer requires field '${requiredField}' but producer doesn't provide it`);
      }
    }

    return {
      isCompatible: issues.length === 0,
      issues
    };
  }

  /**
   * Check schema equality
   */
  _checkSchemaEquality(schema1, schema2) {
    const differences = [];

    // Compare names
    if (schema1.name !== schema2.name) {
      differences.push(`Name mismatch: ${schema1.name} vs ${schema2.name}`);
    }

    // Compare properties
    const props1 = Object.keys(schema1.properties || {});
    const props2 = Object.keys(schema2.properties || {});

    const missing1 = props2.filter(p => !props1.includes(p));
    const missing2 = props1.filter(p => !props2.includes(p));

    if (missing1.length > 0) {
      differences.push(`Schema 1 missing properties: ${missing1.join(', ')}`);
    }

    if (missing2.length > 0) {
      differences.push(`Schema 2 missing properties: ${missing2.join(', ')}`);
    }

    // Compare types for common properties
    for (const prop of props1.filter(p => props2.includes(p))) {
      const type1 = schema1.properties[prop]?.type;
      const type2 = schema2.properties[prop]?.type;

      if (type1 !== type2) {
        differences.push(`Property '${prop}' type mismatch: ${type1} vs ${type2}`);
      }
    }

    return {
      isEqual: differences.length === 0,
      differences
    };
  }
}

module.exports = IntegrationValidator;
