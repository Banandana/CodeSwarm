/**
 * Semantic Cache with Similarity Matching
 * Caches specifications with semantic similarity-based retrieval
 */

class SemanticCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.config = {
      maxSize: options.maxSize || 100,
      ttl: options.ttl || 3600000, // 1 hour
      similarityThreshold: options.similarityThreshold || 0.85,
      enableSimilarityMatching: options.enableSimilarityMatching !== false
    };

    this.metrics = {
      hits: 0,
      misses: 0,
      similarityHits: 0,
      exactHits: 0
    };
  }

  /**
   * Get from cache with similarity matching
   * @param {string} key - Cache key
   * @param {Object} feature - Feature object for similarity matching
   * @returns {Object|null} Cached value or null
   */
  get(key, feature = null) {
    // Try exact match first
    const exactMatch = this._getExact(key);
    if (exactMatch) {
      this.metrics.hits++;
      this.metrics.exactHits++;
      return exactMatch;
    }

    // Try similarity matching if enabled and feature provided
    if (this.config.enableSimilarityMatching && feature) {
      const similarMatch = this._getSimilar(feature);
      if (similarMatch) {
        this.metrics.hits++;
        this.metrics.similarityHits++;
        return similarMatch;
      }
    }

    this.metrics.misses++;
    return null;
  }

  /**
   * Get exact match from cache
   * @private
   */
  _getExact(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  /**
   * Get similar match from cache
   * @private
   */
  _getSimilar(feature) {
    let bestMatch = null;
    let bestScore = 0;

    for (const [key, entry] of this.cache.entries()) {
      // Check TTL
      if (Date.now() - entry.timestamp > this.config.ttl) {
        this.cache.delete(key);
        continue;
      }

      // Skip if no feature stored
      if (!entry.feature) continue;

      // Calculate similarity
      const similarity = this._calculateSimilarity(feature, entry.feature);

      if (similarity > bestScore && similarity >= this.config.similarityThreshold) {
        bestScore = similarity;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      bestMatch.accessCount++;
      bestMatch.lastAccessed = Date.now();
      console.log(`[SemanticCache] Similarity match found (score: ${bestScore.toFixed(2)})`);
      return bestMatch.value;
    }

    return null;
  }

  /**
   * Calculate similarity between two features
   * @private
   */
  _calculateSimilarity(feature1, feature2) {
    let score = 0;
    let factors = 0;

    // Name similarity (30%)
    const nameSimilarity = this._stringSimilarity(
      feature1.name?.toLowerCase() || '',
      feature2.name?.toLowerCase() || ''
    );
    score += nameSimilarity * 0.3;
    factors += 0.3;

    // Description similarity (40%)
    const descSimilarity = this._stringSimilarity(
      feature1.description?.toLowerCase() || '',
      feature2.description?.toLowerCase() || ''
    );
    score += descSimilarity * 0.4;
    factors += 0.4;

    // Required agents match (20%)
    const agentSimilarity = this._arrayOverlap(
      feature1.requiredAgents || [],
      feature2.requiredAgents || []
    );
    score += agentSimilarity * 0.2;
    factors += 0.2;

    // Dependencies count similarity (10%)
    const deps1 = (feature1.dependencies || []).length;
    const deps2 = (feature2.dependencies || []).length;
    const depSimilarity = deps1 === 0 && deps2 === 0 ? 1 :
      1 - Math.abs(deps1 - deps2) / Math.max(deps1, deps2, 1);
    score += depSimilarity * 0.1;
    factors += 0.1;

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Calculate string similarity using Levenshtein-based approach
   * @private
   */
  _stringSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    // Use word-based similarity for better semantic matching
    const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0.0;

    // Calculate Jaccard similarity
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate array overlap percentage
   * @private
   */
  _arrayOverlap(arr1, arr2) {
    if (arr1.length === 0 && arr2.length === 0) return 1.0;
    if (arr1.length === 0 || arr2.length === 0) return 0.0;

    const set1 = new Set(arr1);
    const set2 = new Set(arr2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {Object} value - Value to cache
   * @param {Object} feature - Original feature for similarity matching
   */
  set(key, value, feature = null) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this._evictOldest();
    }

    this.cache.set(key, {
      value,
      feature, // Store feature for similarity matching
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0
    });
  }

  /**
   * Evict oldest entry
   * @private
   */
  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      exactHits: this.metrics.exactHits,
      similarityHits: this.metrics.similarityHits,
      hitRate: total > 0 ? this.metrics.hits / total : 0,
      similarityHitRate: this.metrics.hits > 0 ? this.metrics.similarityHits / this.metrics.hits : 0,
      size: this.cache.size,
      maxSize: this.config.maxSize
    };
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
    this.metrics = {
      hits: 0,
      misses: 0,
      similarityHits: 0,
      exactHits: 0
    };
  }
}

module.exports = SemanticCache;
