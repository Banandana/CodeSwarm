/**
 * Specification Validator
 * Helper for parsing and validating code structure
 */

const { parse: babelParse } = require('@babel/parser');

class SpecValidator {
  /**
   * Try to parse code to AST
   * @param {string} code - Code to parse
   * @param {string} language - Language (javascript, typescript)
   * @returns {Object|null} AST or null if parsing fails
   */
  static parseCode(code, language = 'javascript') {
    try {
      if (language === 'javascript' || language === 'typescript') {
        const ast = babelParse(code, {
          sourceType: 'module',
          plugins: [
            'jsx',
            'typescript',
            'decorators-legacy',
            'classProperties',
            'objectRestSpread',
            'asyncGenerators',
            'dynamicImport',
            'optionalChaining',
            'nullishCoalescingOperator'
          ],
          errorRecovery: true
        });
        return ast;
      }

      // For other languages, return null (can't parse)
      return null;

    } catch (error) {
      console.warn('[SpecValidator] Failed to parse code:', error.message);
      return null;
    }
  }

  /**
   * Extract function/method signatures from code
   * @param {string} code - Code to analyze
   * @returns {Array} Array of signatures
   */
  static extractSignatures(code) {
    const signatures = [];

    try {
      const ast = this.parseCode(code);
      if (!ast) return signatures;

      // Simple traversal for function declarations
      // This is simplified - a real implementation would use babel-traverse
      const functionPattern = /(?:function|async\s+function)\s+(\w+)\s*\((.*?)\)/g;
      const methodPattern = /(\w+)\s*\((.*?)\)\s*\{/g;

      let match;
      while ((match = functionPattern.exec(code)) !== null) {
        signatures.push({
          type: 'function',
          name: match[1],
          parameters: match[2].split(',').map(p => p.trim()).filter(p => p)
        });
      }

      while ((match = methodPattern.exec(code)) !== null) {
        signatures.push({
          type: 'method',
          name: match[1],
          parameters: match[2].split(',').map(p => p.trim()).filter(p => p)
        });
      }

    } catch (error) {
      // Fall back to regex if AST parsing fails
      const functionPattern = /(?:function|async\s+function|const\s+\w+\s*=\s*(?:async\s*)?\(.*?\)\s*=>|class\s+\w+)/g;
      const matches = code.match(functionPattern) || [];
      return matches.map(m => ({ raw: m }));
    }

    return signatures;
  }

  /**
   * Check if code matches expected interface
   * @param {string} code - Code to check
   * @param {Object} interface - Expected interface
   * @returns {Object} Validation result
   */
  static validateInterface(code, expectedInterface) {
    const signatures = this.extractSignatures(code);
    const missing = [];

    for (const method of expectedInterface.methods || []) {
      const found = signatures.some(sig =>
        sig.name === method.name &&
        sig.parameters.length === method.parameters.length
      );

      if (!found) {
        missing.push(method.name);
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }
}

module.exports = SpecValidator;
