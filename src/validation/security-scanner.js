/**
 * Security Scanner
 * Passive security scanning for generated code
 */

const fs = require('fs-extra');
const path = require('path');
const { SecurityError } = require('../utils/errors');

class SecurityScanner {
  constructor(outputDir) {
    this.outputDir = outputDir;

    // Security patterns to detect
    this.patterns = {
      // Hardcoded secrets
      secrets: [
        {
          name: 'AWS Access Key',
          pattern: /AKIA[0-9A-Z]{16}/gi,
          severity: 'HIGH'
        },
        {
          name: 'API Key',
          pattern: /(api[_-]?key|apikey)[\s]*[:=][\s]*['"][a-zA-Z0-9_\-]{16,}['"]/gi,
          severity: 'HIGH'
        },
        {
          name: 'Password in Code',
          pattern: /(password|passwd|pwd)[\s]*[:=][\s]*['"][^'"]{4,}['"]/gi,
          severity: 'HIGH'
        },
        {
          name: 'Private Key',
          pattern: /-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----/gi,
          severity: 'CRITICAL'
        },
        {
          name: 'JWT Token',
          pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
          severity: 'HIGH'
        },
        {
          name: 'Generic Secret',
          pattern: /(secret|token)[\s]*[:=][\s]*['"][a-zA-Z0-9_\-]{16,}['"]/gi,
          severity: 'MEDIUM'
        }
      ],

      // SQL Injection
      sqlInjection: [
        {
          name: 'String Concatenation in SQL',
          pattern: /(query|sql)[\s]*[+]=[\s]*['"`]/gi,
          severity: 'HIGH',
          description: 'Potential SQL injection via string concatenation'
        },
        {
          name: 'Template Literal in SQL',
          pattern: /(query|sql)[\s]*=[\s]*`.*\$\{.*\}.*`/gi,
          severity: 'HIGH',
          description: 'Potential SQL injection via template literals'
        },
        {
          name: 'Direct User Input in Query',
          pattern: /(query|execute|raw)\([^)]*req\.(body|params|query)/gi,
          severity: 'HIGH',
          description: 'User input directly in SQL query'
        }
      ],

      // XSS vulnerabilities
      xss: [
        {
          name: 'innerHTML Assignment',
          pattern: /\.innerHTML[\s]*=[\s]*(?!['"])/gi,
          severity: 'MEDIUM',
          description: 'Potential XSS via innerHTML without sanitization'
        },
        {
          name: 'document.write',
          pattern: /document\.write\(/gi,
          severity: 'MEDIUM',
          description: 'Use of document.write() can lead to XSS'
        },
        {
          name: 'eval() Usage',
          pattern: /\beval\s*\(/gi,
          severity: 'HIGH',
          description: 'eval() can execute arbitrary code'
        },
        {
          name: 'dangerouslySetInnerHTML',
          pattern: /dangerouslySetInnerHTML/gi,
          severity: 'MEDIUM',
          description: 'React dangerouslySetInnerHTML without sanitization'
        }
      ],

      // Command Injection
      commandInjection: [
        {
          name: 'Shell Command Execution',
          pattern: /(exec|spawn|execSync|spawnSync)\([^)]*req\.(body|params|query)/gi,
          severity: 'CRITICAL',
          description: 'User input in shell command execution'
        },
        {
          name: 'Child Process with Shell',
          pattern: /shell:\s*true/gi,
          severity: 'MEDIUM',
          description: 'Shell enabled in child process'
        }
      ],

      // Path Traversal
      pathTraversal: [
        {
          name: 'Direct File Access',
          pattern: /(readFile|writeFile|unlink|rmdir)\([^)]*req\.(body|params|query)/gi,
          severity: 'HIGH',
          description: 'User input directly in file operations'
        },
        {
          name: 'path.join with User Input',
          pattern: /path\.join\([^)]*req\.(body|params|query)/gi,
          severity: 'MEDIUM',
          description: 'User input in path.join without validation'
        }
      ],

      // Insecure Configurations
      insecureConfig: [
        {
          name: 'Disabled HTTPS',
          pattern: /(https|ssl)[\s]*[:=][\s]*(false|0)/gi,
          severity: 'MEDIUM',
          description: 'HTTPS/SSL disabled'
        },
        {
          name: 'Weak Crypto',
          pattern: /\b(md5|sha1)\b/gi,
          severity: 'LOW',
          description: 'Weak cryptographic algorithm'
        },
        {
          name: 'Debug Mode Enabled',
          pattern: /debug[\s]*[:=][\s]*true/gi,
          severity: 'LOW',
          description: 'Debug mode enabled'
        }
      ]
    };
  }

  /**
   * Scan all files in output directory
   * @returns {Promise<Object>} Scan report
   */
  async scanAll() {
    const report = {
      timestamp: Date.now(),
      filesScanned: 0,
      issuesFound: 0,
      issues: [],
      summary: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0
      }
    };

    try {
      const files = await this._getFiles();

      for (const file of files) {
        const fileIssues = await this.scanFile(file);

        if (fileIssues.length > 0) {
          report.issuesFound += fileIssues.length;
          report.issues.push({
            file,
            issues: fileIssues
          });

          // Update summary
          for (const issue of fileIssues) {
            report.summary[issue.severity]++;
          }
        }

        report.filesScanned++;
      }

      return report;

    } catch (error) {
      throw new SecurityError(
        `Security scan failed: ${error.message}`,
        { error: error.message }
      );
    }
  }

  /**
   * Scan a single file
   * @param {string} filePath - Relative path to file
   * @returns {Promise<Array>} Issues found
   */
  async scanFile(filePath) {
    const fullPath = path.join(this.outputDir, filePath);
    const issues = [];

    try {
      // Only scan text files
      const ext = path.extname(filePath);
      const textExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.json', '.yml', '.yaml', '.env'];

      if (!textExtensions.includes(ext)) {
        return issues;
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      // Scan with each pattern category
      for (const [category, patterns] of Object.entries(this.patterns)) {
        for (const pattern of patterns) {
          const matches = this._findMatches(content, lines, pattern);
          issues.push(...matches);
        }
      }

      return issues;

    } catch (error) {
      // If file can't be read, skip it
      return issues;
    }
  }

  /**
   * Find pattern matches in file
   * @private
   */
  _findMatches(content, lines, pattern) {
    const matches = [];
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);

    let match;
    while ((match = regex.exec(content)) !== null) {
      // Find line number
      const lineNumber = this._getLineNumber(content, match.index);
      const line = lines[lineNumber - 1];

      // Check if in comment (simple heuristic)
      if (this._isInComment(line, match[0])) {
        continue;
      }

      matches.push({
        name: pattern.name,
        severity: pattern.severity,
        description: pattern.description || pattern.name,
        line: lineNumber,
        column: match.index - content.lastIndexOf('\n', match.index),
        match: match[0],
        context: line.trim()
      });
    }

    return matches;
  }

  /**
   * Get line number from character index
   * @private
   */
  _getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Check if match is in a comment
   * @private
   */
  _isInComment(line, match) {
    const trimmed = line.trim();

    // Single line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      return true;
    }

    // Check if match is after comment marker
    const commentIndex = line.indexOf('//');
    const hashIndex = line.indexOf('#');
    const matchIndex = line.indexOf(match);

    if (commentIndex !== -1 && matchIndex > commentIndex) {
      return true;
    }

    if (hashIndex !== -1 && matchIndex > hashIndex) {
      return true;
    }

    return false;
  }

  /**
   * Get all scannable files
   * @private
   */
  async _getFiles() {
    const { glob } = require('glob');

    const files = await glob('**/*', {
      cwd: this.outputDir,
      nodir: true,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.codeswarm/**',
        '**/dist/**',
        '**/build/**',
        '**/*.min.js',
        '**/*.map'
      ]
    });

    return files;
  }

  /**
   * Generate security report
   * @param {Object} scanResults - Results from scanAll()
   * @returns {string} Markdown report
   */
  generateReport(scanResults) {
    let report = '# Security Scan Report\n\n';

    report += `**Scan Date:** ${new Date(scanResults.timestamp).toISOString()}\n\n`;
    report += `**Files Scanned:** ${scanResults.filesScanned}\n\n`;
    report += `**Issues Found:** ${scanResults.issuesFound}\n\n`;

    // Summary
    report += '## Summary\n\n';
    report += '| Severity | Count |\n';
    report += '|----------|-------|\n';
    report += `| CRITICAL | ${scanResults.summary.CRITICAL} |\n`;
    report += `| HIGH     | ${scanResults.summary.HIGH} |\n`;
    report += `| MEDIUM   | ${scanResults.summary.MEDIUM} |\n`;
    report += `| LOW      | ${scanResults.summary.LOW} |\n\n`;

    // Issues by file
    if (scanResults.issues.length > 0) {
      report += '## Issues by File\n\n';

      for (const fileReport of scanResults.issues) {
        report += `### ${fileReport.file}\n\n`;

        for (const issue of fileReport.issues) {
          report += `**[${issue.severity}] ${issue.name}** (Line ${issue.line})\n\n`;
          report += `${issue.description}\n\n`;
          report += '```\n';
          report += issue.context + '\n';
          report += '```\n\n';
        }
      }
    } else {
      report += '## No Issues Found\n\n';
      report += 'No security issues were detected in the scanned files.\n\n';
    }

    // Recommendations
    report += '## Recommendations\n\n';

    if (scanResults.summary.CRITICAL > 0) {
      report += '- **CRITICAL issues require immediate attention.** Review and fix before deployment.\n';
    }

    if (scanResults.summary.HIGH > 0) {
      report += '- **HIGH severity issues should be addressed** before production use.\n';
    }

    if (scanResults.summary.MEDIUM > 0) {
      report += '- **MEDIUM issues should be reviewed** and fixed where appropriate.\n';
    }

    report += '\n---\n\n';
    report += '*This is an automated security scan. Manual security review is still recommended.*\n';

    return report;
  }

  /**
   * Save report to file
   * @param {Object} scanResults
   * @param {string} outputPath
   * @returns {Promise<void>}
   */
  async saveReport(scanResults, outputPath = 'SECURITY_REPORT.md') {
    const report = this.generateReport(scanResults);
    const fullPath = path.join(this.outputDir, outputPath);

    await fs.writeFile(fullPath, report, 'utf-8');
  }
}

module.exports = SecurityScanner;
