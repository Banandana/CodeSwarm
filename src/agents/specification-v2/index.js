const FeatureAnalyzer = require('./feature-analyzer');
const SpecificationCache = require('./cache/specification-cache');
const SemanticCache = require('./cache/semantic-cache');

class SpecificationSystemV2 {
  constructor(communicationHub, options = {}) {
    this.hub = communicationHub;
    this.analyzer = new FeatureAnalyzer();

    // Use semantic cache if enabled, otherwise basic cache
    const useSemanticCache = options.useSemanticCache !== false; // Default true
    this.cache = useSemanticCache
      ? new SemanticCache({
          maxSize: options.cacheSize || 100,
          ttl: options.cacheTTL || 3600000,
          similarityThreshold: options.similarityThreshold || 0.85
        })
      : new SpecificationCache(options.cacheSize, options.cacheTTL);

    // Load specialists
    this.specialists = {
      crud: new (require('./specialists/crud-specialist'))(communicationHub),
      integration: new (require('./specialists/integration-specialist'))(communicationHub),
      generic: new (require('./specialists/generic-specialist'))(communicationHub)
    };
  }

  async generateSpecification(feature, context) {
    console.log(`[SpecV2] Generating specification for: ${feature.name}`);

    // 1. Analyze feature type
    const analysis = this.analyzer.analyze(feature, context);
    console.log(`[SpecV2] Feature categorized as: ${analysis.category}`);

    // 2. Check cache (with similarity matching if semantic cache)
    const cacheKey = this.getCacheKey(feature, analysis);
    const cached = this.cache.get(cacheKey, feature);
    if (cached) {
      console.log(`[SpecV2] Cache hit for ${feature.name}`);
      return this.adaptCachedSpec(cached, feature, context);
    }

    // 3. Route to appropriate specialist
    const specialist = this.specialists[analysis.category] || this.specialists.generic;

    // 4. Generate specification
    const spec = await specialist.generate(feature, {
      ...context,
      analysis,
      category: analysis.category
    });

    // 5. Cache the result (store feature for similarity matching)
    this.cache.set(cacheKey, spec, feature);

    return spec;
  }

  async refineSpecification(spec, qualityReport) {
    console.log(`[SpecV2] Refining specification for: ${spec.feature.name}`);

    // Use the same specialist that generated it
    const analysis = this.analyzer.analyze(spec.feature, {});
    const specialist = this.specialists[analysis.category] || this.specialists.generic;

    if (specialist.refine) {
      return await specialist.refine(spec, qualityReport);
    }

    // If specialist doesn't support refinement, regenerate with more context
    return await specialist.generate(spec.feature, {
      previousSpec: spec,
      issues: qualityReport.issues,
      refinement: true
    });
  }

  getCacheKey(feature, analysis) {
    return `${analysis.category}:${feature.name}:${this.hashFeature(feature)}`;
  }

  hashFeature(feature) {
    const str = JSON.stringify({
      name: feature.name,
      description: feature.description,
      requiredAgents: feature.requiredAgents
    });
    return require('crypto').createHash('md5').update(str).digest('hex').substr(0, 8);
  }

  adaptCachedSpec(cached, feature, context) {
    // Adapt cached spec to new feature
    const adapted = JSON.parse(JSON.stringify(cached));
    adapted.featureId = feature.id;
    adapted.feature = feature;
    adapted.createdAt = Date.now();
    adapted.fromCache = true;
    return adapted;
  }
}

module.exports = SpecificationSystemV2;
