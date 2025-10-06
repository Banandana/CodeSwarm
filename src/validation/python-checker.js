/**
 * Python Syntax Checker
 * Validates Python code syntax using Pylint
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class PythonChecker {
  constructor(options = {}) {
    this.options = options;
    this.pylintPath = options.pylintPath || 'pylint';
  }

  /**
   * Check syntax of Python files
   * @param {string|string[]} filePaths - File path(s) to check
   * @returns {Promise<Object>} Validation results
   */
  async check(filePaths) {
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

        // Run Pylint
        const pylintResult = await this._runPylint(filePath);

        // Process results
        const fileResult = this._processFileResult(filePath, pylintResult);
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
            type: 'system'
          }]
        });
        results.totalErrors++;
        results.success = false;
      }
    }

    return results;
  }

  /**
   * Check syntax of Python code string
   * @param {string} code - Code string to check
   * @param {string} fileName - Virtual file name
   * @returns {Promise<Object>} Validation results
   */
  async checkCode(code, fileName = 'input.py') {
    try {
      // Write code to temporary file
      const tempFile = path.join(os.tmpdir(), `codeswarm_${Date.now()}_${fileName}`);
      await fs.writeFile(tempFile, code, 'utf8');

      try {
        // Run Pylint on temp file
        const pylintResult = await this._runPylint(tempFile);

        // Process results
        const fileResult = this._processFileResult(fileName, pylintResult);

        return {
          success: fileResult.errorCount === 0,
          totalFiles: 1,
          totalErrors: fileResult.errorCount,
          totalWarnings: fileResult.warningCount,
          files: [fileResult]
        };

      } finally {
        // Clean up temp file
        await fs.unlink(tempFile).catch(() => {});
      }

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
            type: 'system'
          }]
        }]
      };
    }
  }

  /**
   * Run Pylint on a file
   * @private
   */
  async _runPylint(filePath) {
    return new Promise((resolve, reject) => {
      const args = [
        '--output-format=json',
        '--score=no',
        '--disable=C0111,C0103,R0903', // Disable some style warnings
        filePath
      ];

      const pylint = spawn(this.pylintPath, args);

      let stdout = '';
      let stderr = '';

      pylint.stdout.on('data', data => {
        stdout += data.toString();
      });

      pylint.stderr.on('data', data => {
        stderr += data.toString();
      });

      pylint.on('close', code => {
        // Pylint returns non-zero exit code when issues found
        // This is normal, so we don't reject on non-zero exit
        if (stderr && code !== 0 && stdout === '') {
          // Only reject if there's stderr and no stdout (actual error)
          reject(new Error(`Pylint error: ${stderr}`));
        } else {
          resolve({
            code,
            stdout,
            stderr
          });
        }
      });

      pylint.on('error', err => {
        if (err.code === 'ENOENT') {
          reject(new Error('Pylint not found. Please install: pip install pylint'));
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Process Pylint result for a single file
   * @private
   */
  _processFileResult(filePath, pylintResult) {
    let messages = [];
    let errorCount = 0;
    let warningCount = 0;

    try {
      // Parse JSON output
      if (pylintResult.stdout) {
        const parsed = JSON.parse(pylintResult.stdout);

        messages = parsed.map(msg => {
          const severity = this._getSeverity(msg.type);
          if (severity === 'error') errorCount++;
          if (severity === 'warning') warningCount++;

          return {
            severity,
            message: msg.message,
            line: msg.line,
            column: msg.column,
            type: msg.type,
            symbol: msg.symbol,
            messageId: msg['message-id']
          };
        });
      }
    } catch (parseError) {
      // If JSON parsing fails, try to extract issues from text
      if (pylintResult.stdout) {
        messages.push({
          severity: 'warning',
          message: 'Could not parse Pylint output',
          line: null,
          column: null,
          type: 'parse-error'
        });
        warningCount++;
      }
    }

    return {
      path: filePath,
      success: errorCount === 0,
      errorCount,
      warningCount,
      messages
    };
  }

  /**
   * Get severity from Pylint message type
   * @private
   */
  _getSeverity(type) {
    // E: Error, F: Fatal
    if (type === 'error' || type === 'fatal') return 'error';

    // W: Warning, C: Convention, R: Refactor
    return 'warning';
  }

  /**
   * Check if file is Python
   * @param {string} filePath - Path to file
   * @returns {boolean}
   */
  static isPythonFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.py';
  }

  /**
   * Get formatted report
   * @param {Object} results - Validation results
   * @returns {string}
   */
  getFormattedReport(results) {
    let report = '\n';
    report += '='.repeat(60) + '\n';
    report += 'Python Syntax Validation Report\n';
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
          const location = msg.line ? `${msg.line}:${msg.column || 0}` : 'N/A';
          const icon = msg.severity === 'error' ? '✗' : '⚠';
          const type = msg.symbol ? `[${msg.symbol}]` : msg.type ? `[${msg.type}]` : '';

          report += `  ${icon} ${location} ${msg.message} ${type}\n`;
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

module.exports = PythonChecker;
