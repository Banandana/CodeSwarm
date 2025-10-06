/**
 * Proposal Parser
 * Extracts structured requirements from proposal text
 */

class ProposalParser {
  /**
   * Parse proposal text into structured format
   * @param {string} proposalText - Raw proposal text
   * @returns {Object} Parsed proposal
   */
  static parse(proposalText) {
    const proposal = {
      raw: proposalText,
      title: this._extractTitle(proposalText),
      description: this._extractDescription(proposalText),
      features: this._extractFeatures(proposalText),
      technicalRequirements: this._extractTechnicalRequirements(proposalText),
      constraints: this._extractConstraints(proposalText),
      metadata: this._extractMetadata(proposalText)
    };

    return proposal;
  }

  /**
   * Extract project title
   * @private
   */
  static _extractTitle(text) {
    // Look for first heading or title-like line
    const lines = text.split('\n');

    for (const line of lines) {
      // Markdown heading
      if (line.startsWith('# ')) {
        return line.replace(/^# /, '').trim();
      }

      // Title: format
      if (line.match(/^title:/i)) {
        return line.replace(/^title:/i, '').trim();
      }

      // First non-empty line if nothing else found
      if (line.trim() && !this._isMetadataLine(line)) {
        return line.trim();
      }
    }

    return 'Untitled Project';
  }

  /**
   * Extract project description
   * @private
   */
  static _extractDescription(text) {
    const lines = text.split('\n');
    const descLines = [];
    let inDescription = false;

    for (const line of lines) {
      // Skip title
      if (line.startsWith('# ')) continue;

      // Look for description section
      if (line.match(/^##?\s*(description|overview|summary)/i)) {
        inDescription = true;
        continue;
      }

      // Stop at next section
      if (inDescription && line.startsWith('#')) {
        break;
      }

      if (inDescription && line.trim()) {
        descLines.push(line.trim());
      }

      // If no description section, take first paragraph
      if (!inDescription && line.trim() && !this._isMetadataLine(line) && !line.startsWith('#')) {
        descLines.push(line.trim());
        if (descLines.length > 5) break; // Limit to first paragraph
      }
    }

    return descLines.join(' ') || 'No description provided';
  }

  /**
   * Extract features/requirements
   * @private
   */
  static _extractFeatures(text) {
    const features = [];
    const lines = text.split('\n');
    let inFeatures = false;

    for (const line of lines) {
      // Look for features section
      if (line.match(/^##?\s*(features?|requirements?|functionality)/i)) {
        inFeatures = true;
        continue;
      }

      // Stop at next major section
      if (inFeatures && line.match(/^##?\s/)) {
        break;
      }

      if (inFeatures) {
        // Bullet points
        const bulletMatch = line.match(/^[-*+]\s+(.+)/);
        if (bulletMatch) {
          features.push({
            description: bulletMatch[1].trim(),
            priority: this._inferPriority(bulletMatch[1])
          });
        }

        // Numbered list
        const numberedMatch = line.match(/^\d+\.\s+(.+)/);
        if (numberedMatch) {
          features.push({
            description: numberedMatch[1].trim(),
            priority: this._inferPriority(numberedMatch[1])
          });
        }
      }
    }

    // If no explicit features section, extract from entire text
    if (features.length === 0) {
      const actionVerbs = /\b(implement|create|build|add|develop|design|support|enable|provide|include)\b/gi;
      const sentences = text.split(/[.!?]+/);

      for (const sentence of sentences) {
        if (actionVerbs.test(sentence) && sentence.length > 20 && sentence.length < 200) {
          features.push({
            description: sentence.trim(),
            priority: this._inferPriority(sentence)
          });
        }
      }
    }

    return features;
  }

  /**
   * Extract technical requirements
   * @private
   */
  static _extractTechnicalRequirements(text) {
    const requirements = {
      backend: {},
      frontend: {},
      database: {},
      deployment: {},
      testing: {}
    };

    const lowerText = text.toLowerCase();

    // Backend frameworks
    if (lowerText.includes('express')) requirements.backend.framework = 'Express.js';
    if (lowerText.includes('fastify')) requirements.backend.framework = 'Fastify';
    if (lowerText.includes('nestjs') || lowerText.includes('nest.js')) requirements.backend.framework = 'NestJS';
    if (lowerText.includes('flask')) requirements.backend.framework = 'Flask';
    if (lowerText.includes('django')) requirements.backend.framework = 'Django';

    // Frontend frameworks
    if (lowerText.includes('react')) requirements.frontend.framework = 'React';
    if (lowerText.includes('vue')) requirements.frontend.framework = 'Vue';
    if (lowerText.includes('angular')) requirements.frontend.framework = 'Angular';
    if (lowerText.includes('svelte')) requirements.frontend.framework = 'Svelte';
    if (lowerText.includes('next.js') || lowerText.includes('nextjs')) requirements.frontend.framework = 'Next.js';

    // Databases
    if (lowerText.includes('postgresql') || lowerText.includes('postgres')) requirements.database.type = 'PostgreSQL';
    if (lowerText.includes('mysql')) requirements.database.type = 'MySQL';
    if (lowerText.includes('mongodb')) requirements.database.type = 'MongoDB';
    if (lowerText.includes('redis')) requirements.database.cache = 'Redis';

    // Authentication
    if (lowerText.includes('jwt')) requirements.backend.auth = 'JWT';
    if (lowerText.includes('oauth')) requirements.backend.auth = 'OAuth';
    if (lowerText.includes('passport')) requirements.backend.auth = 'Passport.js';

    // Testing
    if (lowerText.includes('jest')) requirements.testing.framework = 'Jest';
    if (lowerText.includes('mocha')) requirements.testing.framework = 'Mocha';
    if (lowerText.includes('pytest')) requirements.testing.framework = 'Pytest';

    // Language
    if (lowerText.includes('typescript')) {
      requirements.backend.language = 'TypeScript';
      requirements.frontend.language = 'TypeScript';
    } else if (lowerText.includes('python')) {
      requirements.backend.language = 'Python';
    } else {
      requirements.backend.language = 'JavaScript';
    }

    return requirements;
  }

  /**
   * Extract constraints (budget, timeline, etc.)
   * @private
   */
  static _extractConstraints(text) {
    const constraints = {};

    // Budget constraints
    const budgetMatch = text.match(/budget[:\s]+\$?([\d.]+)/i);
    if (budgetMatch) {
      constraints.budget = parseFloat(budgetMatch[1]);
    }

    // Timeline constraints
    const timelineMatch = text.match(/timeline[:\s]+(\d+)\s*(day|week|month)s?/i);
    if (timelineMatch) {
      constraints.timeline = {
        value: parseInt(timelineMatch[1]),
        unit: timelineMatch[2]
      };
    }

    // Performance requirements
    if (text.match(/performance|fast|optimize|speed/i)) {
      constraints.performanceCritical = true;
    }

    // Scalability requirements
    if (text.match(/scalable?|scale|high[ -]traffic|concurrent users/i)) {
      constraints.scalable = true;
    }

    return constraints;
  }

  /**
   * Extract metadata
   * @private
   */
  static _extractMetadata(text) {
    const metadata = {
      complexity: this._estimateComplexity(text),
      projectType: this._inferProjectType(text),
      wordCount: text.split(/\s+/).length
    };

    return metadata;
  }

  /**
   * Estimate project complexity
   * @private
   */
  static _estimateComplexity(text) {
    const lowerText = text.toLowerCase();
    let score = 0;

    // Features count
    const featureIndicators = (text.match(/[-*+]\s+/g) || []).length;
    score += Math.min(featureIndicators * 2, 30);

    // Technical complexity indicators
    const complexKeywords = [
      'authentication', 'authorization', 'real-time', 'websocket',
      'microservices', 'docker', 'kubernetes', 'cache', 'queue',
      'payment', 'notification', 'email', 'search', 'analytics'
    ];

    for (const keyword of complexKeywords) {
      if (lowerText.includes(keyword)) {
        score += 5;
      }
    }

    // Scale indicators
    if (lowerText.match(/scale|concurrent|high[ -]traffic/)) {
      score += 10;
    }

    // Categorize
    if (score < 20) return 'simple';
    if (score < 50) return 'moderate';
    return 'complex';
  }

  /**
   * Infer project type
   * @private
   */
  static _inferProjectType(text) {
    const lowerText = text.toLowerCase();

    if (lowerText.match(/web[ -]?app|website|web application/)) {
      return 'web-app';
    }

    if (lowerText.match(/api|rest|graphql|endpoint/)) {
      return 'api';
    }

    if (lowerText.match(/cli|command[ -]line|terminal/)) {
      return 'cli';
    }

    if (lowerText.match(/library|package|module|npm|pip/)) {
      return 'library';
    }

    if (lowerText.match(/mobile|ios|android|react native/)) {
      return 'mobile-app';
    }

    return 'web-app'; // Default
  }

  /**
   * Infer feature priority
   * @private
   */
  static _inferPriority(text) {
    const lowerText = text.toLowerCase();

    if (lowerText.match(/\b(must|critical|essential|required|core)\b/)) {
      return 'HIGH';
    }

    if (lowerText.match(/\b(should|important|prefer)\b/)) {
      return 'MEDIUM';
    }

    if (lowerText.match(/\b(nice[ -]to[ -]have|optional|consider|may)\b/)) {
      return 'LOW';
    }

    return 'MEDIUM'; // Default
  }

  /**
   * Check if line is metadata (not content)
   * @private
   */
  static _isMetadataLine(line) {
    return line.match(/^(author|date|version|tags?):/i);
  }
}

module.exports = ProposalParser;
