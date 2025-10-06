/**
 * Syntax Checker
 * Validates JavaScript/TypeScript code syntax using ESLint
 */

const { ESLint } = require('eslint');
const path = require('path');
const fs = require('fs').promises;

class SyntaxChecker {
  constructor(options = {}) {
    this.options = options;
    this.eslint = null;
  }

  /**
   * Initialize ESLint with configuration
   * @private
   */
  async _initESLint() {
    if (this.eslint) return;

    const config = {
      overrideConfig: {
        env: {
          node: true,
          es2021: true,
          browser: true
        },
        parserOptions: {
          ecmaVersion: 2021,
          sourceType: 'module',
          ecmaFeatures: {
            jsx: true
          }
        },
        rules: {
          // Error-level rules (syntax errors)
          'no-undef': 'error',
          'no-unused-vars': 'warn',
          'no-const-assign': 'error',
          'no-dupe-keys': 'error',
          'no-dupe-args': 'error',
          'no-duplicate-case': 'error',
          'no-empty': 'warn',
          'no-ex-assign': 'error',
          'no-extra-semi': 'error',
          'no-func-assign': 'error',
          'no-obj-calls': 'error',
          'no-unreachable': 'warn',
          'valid-typeof': 'error',

          // Code quality rules
          'eqeqeq': 'warn',
          'no-eval': 'error',
          'no-with': 'error',
          'no-shadow': 'warn',

          // Best practices
          'curly': 'warn',
          'dot-notation': 'warn',
          'no-alert': 'warn',
          'no-console': 'off',
          'no-debugger': 'warn',

          // ES6
          'arrow-spacing': 'warn',
          'no-var': 'warn',
          'prefer-const': 'warn',
          'prefer-arrow-callback': 'warn'
        }
      },
      ...this.options.eslintConfig
    };

    this.eslint = new ESLint(config);
  }

  /**
   * Check syntax of JavaScript/TypeScript files
   * @param {string|string[]} filePaths - File path(s) to check
   * @returns {Promise<Object>} Validation results
   */
  async check(filePaths) {
    await this._initESLint();

    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const results = {
      success: true,
      totalFiles: paths.length,
      totalErrors: 0,
      totalWarnings: 0,
      files: []
    };

    for (const filePath of paths) {
      try {
        // Check if file exists
        await fs.access(filePath);

        // Run ESLint
        const lintResults = await this.eslint.lintFiles([filePath]);

        // Process results for this file
        const fileResult = this._processFileResult(filePath, lintResults[0]);
        results.files.push(fileResult);

        results.totalErrors += fileResult.errorCount;
        results.totalWarnings += fileResult.warningCount;

        if (fileResult.errorCount > 0) {
          results.success = false;
        }

      } catch (error) {
        results.files.push({
          path: filePath,
          success: false,
          errorCount: 1,
          warningCount: 0,
          messages: [{
            severity: 'error',
            message: error.message,
            line: null,
            column: null,
            rule: 'system'
          }]
        });
        results.totalErrors++;
        results.success = false;
      }
    }

    return results;
  }

  /**
   * Check syntax of code string
   * @param {string} code - Code string to check
   * @param {string} fileName - Virtual file name (for context)
   * @returns {Promise<Object>} Validation results
   */
  async checkCode(code, fileName = 'input.js') {
    await this._initESLint();

    try {
      const lintResults = await this.eslint.lintText(code, {
        filePath: fileName
      });

      const fileResult = this._processFileResult(fileName, lintResults[0]);

      return {
        success: fileResult.errorCount === 0,
        totalFiles: 1,
        totalErrors: fileResult.errorCount,
        totalWarnings: fileResult.warningCount,
        files: [fileResult]
      };

    } catch (error) {
      return {
        success: false,
        totalFiles: 1,
        totalErrors: 1,
        totalWarnings: 0,
        files: [{
          path: fileName,
          success: false,
          errorCount: 1,
          warningCount: 0,
          messages: [{
            severity: 'error',
            message: error.message,
            line: null,
            column: null,
            rule: 'system'
          }]
        }]
      };
    }
  }

  /**
   * Process ESLint result for a single file
   * @private
   */
  _processFileResult(filePath, lintResult) {
    if (!lintResult) {
      return {
        path: filePath,
        success: true,
        errorCount: 0,
        warningCount: 0,
        messages: []
      };
    }

    const messages = lintResult.messages.map(msg => ({
      severity: msg.severity === 2 ? 'error' : 'warning',
      message: msg.message,
      line: msg.line,
      column: msg.column,
      rule: msg.ruleId,
      source: msg.source
    }));

    return {
      path: filePath,
      success: lintResult.errorCount === 0,
      errorCount: lintResult.errorCount,
      warningCount: lintResult.warningCount,
      messages
    };
  }

  /**
   * Check if file is JavaScript/TypeScript
   * @param {string} filePath - Path to file
   * @returns {boolean}
   */
  static isJavaScriptFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext);
  }

  /**
   * Get formatted report
   * @param {Object} results - Validation results
   * @returns {string}
   */
  getFormattedReport(results) {
    let report = '\n';
    report += '='.repeat(60) + '\n';
    report += 'JavaScript/TypeScript Syntax Validation Report\n';
    report += '='.repeat(60) + '\n\n';

    report += `Total Files: ${results.totalFiles}\n`;
    report += `Total Errors: ${results.totalErrors}\n`;
    report += `Total Warnings: ${results.totalWarnings}\n`;
    report += `Status: ${results.success ? '✓ PASS' : '✗ FAIL'}\n\n`;

    for (const file of results.files) {
      if (file.errorCount > 0 || file.warningCount > 0) {
        report += '-'.repeat(60) + '\n';
        report += `File: ${file.path}\n`;
        report += `Errors: ${file.errorCount}, Warnings: ${file.warningCount}\n`;
        report += '-'.repeat(60) + '\n';

        for (const msg of file.messages) {
          const location = msg.line ? `${msg.line}:${msg.column}` : 'N/A';
          const icon = msg.severity === 'error' ? '✗' : '⚠';
          const rule = msg.rule ? `[${msg.rule}]` : '';

          report += `  ${icon} ${location} ${msg.message} ${rule}\n`;

          if (msg.source) {
            report += `     ${msg.source}\n`;
          }
        }

        report += '\n';
      }
    }

    if (results.totalErrors === 0 && results.totalWarnings === 0) {
      report += '✓ No issues found!\n';
    }

    report += '='.repeat(60) + '\n';

    return report;
  }
}

module.exports = SyntaxChecker;
