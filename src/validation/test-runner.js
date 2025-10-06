/**
 * Test Runner
 * Executes Jest tests and collects results
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class TestRunner {
  constructor(options = {}) {
    this.options = options;
    this.jestPath = options.jestPath || 'npx';
  }

  /**
   * Run Jest tests
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runTests(options = {}) {
    const {
      testPath = null,
      coverage = false,
      verbose = false,
      bail = false,
      maxWorkers = null
    } = options;

    try {
      const jestResult = await this._runJest({
        testPath,
        coverage,
        verbose,
        bail,
        maxWorkers
      });

      return this._processTestResult(jestResult);

    } catch (error) {
      return {
        success: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        duration: 0,
        coverage: null,
        testSuites: [],
        error: error.message
      };
    }
  }

  /**
   * Run specific test file
   * @param {string} testFile - Path to test file
   * @returns {Promise<Object>} Test results
   */
  async runTestFile(testFile) {
    return this.runTests({ testPath: testFile });
  }

  /**
   * Run tests with coverage
   * @returns {Promise<Object>} Test results with coverage
   */
  async runWithCoverage() {
    return this.runTests({ coverage: true });
  }

  /**
   * Run Jest
   * @private
   */
  async _runJest(options) {
    return new Promise((resolve, reject) => {
      const args = ['jest', '--json'];

      if (options.testPath) {
        args.push(options.testPath);
      }

      if (options.coverage) {
        args.push('--coverage');
        args.push('--coverageReporters=json-summary');
      }

      if (options.verbose) {
        args.push('--verbose');
      }

      if (options.bail) {
        args.push('--bail');
      }

      if (options.maxWorkers) {
        args.push(`--maxWorkers=${options.maxWorkers}`);
      }

      const jest = spawn(this.jestPath, args, {
        cwd: process.cwd(),
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      jest.stdout.on('data', data => {
        stdout += data.toString();
      });

      jest.stderr.on('data', data => {
        stderr += data.toString();
      });

      jest.on('close', code => {
        // Jest returns exit code 1 when tests fail, which is normal
        resolve({
          code,
          stdout,
          stderr
        });
      });

      jest.on('error', err => {
        if (err.code === 'ENOENT') {
          reject(new Error('Jest not found. Please install: npm install --save-dev jest'));
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Process Jest results
   * @private
   */
  _processTestResult(jestResult) {
    try {
      // Parse JSON output from Jest
      const parsed = JSON.parse(jestResult.stdout);

      const result = {
        success: parsed.success,
        totalTests: parsed.numTotalTests,
        passedTests: parsed.numPassedTests,
        failedTests: parsed.numFailedTests,
        skippedTests: parsed.numPendingTests + parsed.numTodoTests,
        duration: parsed.testResults.reduce((sum, suite) => sum + (suite.endTime - suite.startTime), 0),
        testSuites: [],
        coverage: null
      };

      // Process test suites
      for (const suite of parsed.testResults) {
        const suiteResult = {
          name: path.basename(suite.name),
          path: suite.name,
          success: suite.status === 'passed',
          duration: suite.endTime - suite.startTime,
          tests: []
        };

        // Process individual tests
        for (const test of suite.assertionResults) {
          suiteResult.tests.push({
            title: test.title,
            fullName: test.fullName,
            status: test.status,
            duration: test.duration || 0,
            failureMessages: test.failureMessages || []
          });
        }

        result.testSuites.push(suiteResult);
      }

      // Read coverage if available
      if (this.options.coverage) {
        result.coverage = this._readCoverage();
      }

      return result;

    } catch (parseError) {
      // If JSON parsing fails, return error
      return {
        success: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        duration: 0,
        coverage: null,
        testSuites: [],
        error: `Failed to parse Jest output: ${parseError.message}`,
        rawOutput: jestResult.stdout.substring(0, 1000)
      };
    }
  }

  /**
   * Read coverage report
   * @private
   */
  async _readCoverage() {
    try {
      const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
      const coverageData = await fs.readFile(coveragePath, 'utf8');
      const coverage = JSON.parse(coverageData);

      // Extract total coverage
      const total = coverage.total;

      return {
        lines: {
          covered: total.lines.covered,
          total: total.lines.total,
          percent: total.lines.pct
        },
        statements: {
          covered: total.statements.covered,
          total: total.statements.total,
          percent: total.statements.pct
        },
        functions: {
          covered: total.functions.covered,
          total: total.functions.total,
          percent: total.functions.pct
        },
        branches: {
          covered: total.branches.covered,
          total: total.branches.total,
          percent: total.branches.pct
        }
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Check if file is a Jest test file
   * @param {string} filePath - Path to file
   * @returns {boolean}
   */
  static isTestFile(filePath) {
    const fileName = path.basename(filePath);
    return (
      fileName.endsWith('.test.js') ||
      fileName.endsWith('.test.jsx') ||
      fileName.endsWith('.test.ts') ||
      fileName.endsWith('.test.tsx') ||
      fileName.endsWith('.spec.js') ||
      fileName.endsWith('.spec.jsx') ||
      fileName.endsWith('.spec.ts') ||
      fileName.endsWith('.spec.tsx')
    );
  }

  /**
   * Get formatted report
   * @param {Object} results - Test results
   * @returns {string}
   */
  getFormattedReport(results) {
    let report = '\n';
    report += '='.repeat(60) + '\n';
    report += 'Jest Test Results\n';
    report += '='.repeat(60) + '\n\n';

    if (results.error) {
      report += `✗ ERROR: ${results.error}\n`;
      return report;
    }

    report += `Status: ${results.success ? '✓ PASS' : '✗ FAIL'}\n`;
    report += `Total Tests: ${results.totalTests}\n`;
    report += `Passed: ${results.passedTests}\n`;
    report += `Failed: ${results.failedTests}\n`;
    report += `Skipped: ${results.skippedTests}\n`;
    report += `Duration: ${(results.duration / 1000).toFixed(2)}s\n\n`;

    // Coverage
    if (results.coverage) {
      report += '-'.repeat(60) + '\n';
      report += 'Coverage\n';
      report += '-'.repeat(60) + '\n';
      report += `Lines: ${results.coverage.lines.percent}% (${results.coverage.lines.covered}/${results.coverage.lines.total})\n`;
      report += `Statements: ${results.coverage.statements.percent}% (${results.coverage.statements.covered}/${results.coverage.statements.total})\n`;
      report += `Functions: ${results.coverage.functions.percent}% (${results.coverage.functions.covered}/${results.coverage.functions.total})\n`;
      report += `Branches: ${results.coverage.branches.percent}% (${results.coverage.branches.covered}/${results.coverage.branches.total})\n\n`;
    }

    // Test suites
    if (results.testSuites.length > 0) {
      report += '-'.repeat(60) + '\n';
      report += 'Test Suites\n';
      report += '-'.repeat(60) + '\n';

      for (const suite of results.testSuites) {
        const icon = suite.success ? '✓' : '✗';
        report += `${icon} ${suite.name} (${(suite.duration / 1000).toFixed(2)}s)\n`;

        // Show failed tests
        const failedTests = suite.tests.filter(t => t.status === 'failed');
        if (failedTests.length > 0) {
          for (const test of failedTests) {
            report += `  ✗ ${test.title}\n`;
            if (test.failureMessages.length > 0) {
              report += `    ${test.failureMessages[0].split('\n')[0]}\n`;
            }
          }
        }
      }

      report += '\n';
    }

    report += '='.repeat(60) + '\n';

    return report;
  }
}

module.exports = TestRunner;
