/**
 * Pytest Runner
 * Executes Python tests using Pytest and collects results
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class PytestRunner {
  constructor(options = {}) {
    this.options = options;
    this.pytestPath = options.pytestPath || 'pytest';
  }

  /**
   * Run Pytest tests
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runTests(options = {}) {
    const {
      testPath = null,
      coverage = false,
      verbose = false,
      maxFail = null
    } = options;

    try {
      const pytestResult = await this._runPytest({
        testPath,
        coverage,
        verbose,
        maxFail
      });

      return this._processTestResult(pytestResult);

    } catch (error) {
      return {
        success: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        duration: 0,
        coverage: null,
        testFiles: [],
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
   * Run Pytest
   * @private
   */
  async _runPytest(options) {
    // Generate temp file for JSON report
    const reportFile = path.join(os.tmpdir(), `pytest_report_${Date.now()}.json`);

    return new Promise((resolve, reject) => {
      const args = [
        `--json-report`,
        `--json-report-file=${reportFile}`,
        '--tb=short'
      ];

      if (options.testPath) {
        args.push(options.testPath);
      }

      if (options.coverage) {
        args.push('--cov');
        args.push('--cov-report=json');
      }

      if (options.verbose) {
        args.push('-v');
      }

      if (options.maxFail) {
        args.push(`--maxfail=${options.maxFail}`);
      }

      const pytest = spawn(this.pytestPath, args, {
        cwd: process.cwd(),
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      pytest.stdout.on('data', data => {
        stdout += data.toString();
      });

      pytest.stderr.on('data', data => {
        stderr += data.toString();
      });

      pytest.on('close', async (code) => {
        // Read JSON report
        let reportData = null;
        try {
          const reportContent = await fs.readFile(reportFile, 'utf8');
          reportData = JSON.parse(reportContent);
        } catch (err) {
          // Report file might not exist if pytest failed to run
        }

        // Clean up temp file
        await fs.unlink(reportFile).catch(() => {});

        resolve({
          code,
          stdout,
          stderr,
          reportData
        });
      });

      pytest.on('error', err => {
        if (err.code === 'ENOENT') {
          reject(new Error('Pytest not found. Please install: pip install pytest pytest-json-report'));
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Process Pytest results
   * @private
   */
  _processTestResult(pytestResult) {
    if (!pytestResult.reportData) {
      // Fallback to parsing stdout if JSON report not available
      return this._parseTextOutput(pytestResult);
    }

    const report = pytestResult.reportData;

    const result = {
      success: report.exitcode === 0,
      totalTests: report.summary?.total || 0,
      passedTests: report.summary?.passed || 0,
      failedTests: report.summary?.failed || 0,
      skippedTests: report.summary?.skipped || 0,
      errorTests: report.summary?.error || 0,
      duration: report.duration || 0,
      testFiles: [],
      coverage: null
    };

    // Process test files
    if (report.tests) {
      const fileMap = new Map();

      for (const test of report.tests) {
        const filePath = test.nodeid.split('::')[0];

        if (!fileMap.has(filePath)) {
          fileMap.set(filePath, {
            path: filePath,
            name: path.basename(filePath),
            tests: []
          });
        }

        fileMap.get(filePath).tests.push({
          name: test.nodeid.split('::').slice(1).join('::'),
          outcome: test.outcome,
          duration: test.call?.duration || 0,
          message: test.call?.longrepr || null
        });
      }

      result.testFiles = Array.from(fileMap.values());
    }

    // Read coverage if available
    if (this.options.coverage) {
      result.coverage = this._readCoverage();
    }

    return result;
  }

  /**
   * Parse text output (fallback)
   * @private
   */
  _parseTextOutput(pytestResult) {
    const output = pytestResult.stdout + pytestResult.stderr;

    // Extract summary line (e.g., "5 passed, 2 failed in 1.23s")
    const summaryMatch = output.match(/(\d+)\s+passed|(\d+)\s+failed|(\d+)\s+skipped/g);

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    if (summaryMatch) {
      for (const match of summaryMatch) {
        const num = parseInt(match);
        if (match.includes('passed')) passed = num;
        if (match.includes('failed')) failed = num;
        if (match.includes('skipped')) skipped = num;
      }
    }

    const total = passed + failed + skipped;

    return {
      success: failed === 0 && pytestResult.code === 0,
      totalTests: total,
      passedTests: passed,
      failedTests: failed,
      skippedTests: skipped,
      errorTests: 0,
      duration: 0,
      testFiles: [],
      coverage: null,
      rawOutput: output.substring(0, 1000)
    };
  }

  /**
   * Read coverage report
   * @private
   */
  async _readCoverage() {
    try {
      const coveragePath = path.join(process.cwd(), 'coverage.json');
      const coverageData = await fs.readFile(coveragePath, 'utf8');
      const coverage = JSON.parse(coverageData);

      // Calculate total coverage
      const totals = coverage.totals;

      return {
        lines: {
          covered: totals.covered_lines,
          total: totals.num_statements,
          percent: totals.percent_covered
        },
        missing: totals.missing_lines,
        excludedLines: totals.excluded_lines
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Check if file is a Pytest test file
   * @param {string} filePath - Path to file
   * @returns {boolean}
   */
  static isTestFile(filePath) {
    const fileName = path.basename(filePath);
    return (
      fileName.startsWith('test_') && fileName.endsWith('.py') ||
      fileName.endsWith('_test.py')
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
    report += 'Pytest Test Results\n';
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

    if (results.errorTests > 0) {
      report += `Errors: ${results.errorTests}\n`;
    }

    report += `Duration: ${results.duration.toFixed(2)}s\n\n`;

    // Coverage
    if (results.coverage) {
      report += '-'.repeat(60) + '\n';
      report += 'Coverage\n';
      report += '-'.repeat(60) + '\n';
      report += `Lines: ${results.coverage.lines.percent.toFixed(2)}% (${results.coverage.lines.covered}/${results.coverage.lines.total})\n`;
      if (results.coverage.missing > 0) {
        report += `Missing Lines: ${results.coverage.missing}\n`;
      }
      report += '\n';
    }

    // Test files
    if (results.testFiles.length > 0) {
      report += '-'.repeat(60) + '\n';
      report += 'Test Files\n';
      report += '-'.repeat(60) + '\n';

      for (const file of results.testFiles) {
        const passed = file.tests.filter(t => t.outcome === 'passed').length;
        const failed = file.tests.filter(t => t.outcome === 'failed').length;
        const icon = failed === 0 ? '✓' : '✗';

        report += `${icon} ${file.name} (${passed}/${file.tests.length} passed)\n`;

        // Show failed tests
        const failedTests = file.tests.filter(t => t.outcome === 'failed');
        if (failedTests.length > 0) {
          for (const test of failedTests) {
            report += `  ✗ ${test.name}\n`;
            if (test.message) {
              const firstLine = test.message.split('\n')[0];
              report += `    ${firstLine.substring(0, 80)}\n`;
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

module.exports = PytestRunner;
