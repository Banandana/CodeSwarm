/**
 * Architectural Design Agent
 * Generates comprehensive system architecture before feature specification
 */

const BaseAgent = require('./base-agent');
const { generateArchitecturalDesignPrompt } = require('./prompts/architectural-design-agent');
const { AgentError } = require('../utils/errors');
const { v4: uuidv4 } = require('uuid');
const ApplicationTypeDetector = require('../architecture/application-type-detector');
const DeploymentStrategySelector = require('../architecture/deployment-strategy-selector');
const PatternLibrary = require('../patterns/pattern-library');
const DesktopPatterns = require('../patterns/desktop-patterns');
const MobilePatterns = require('../patterns/mobile-patterns');
const EmbeddedPatterns = require('../patterns/embedded-patterns');
const GamePatterns = require('../patterns/game-patterns');
const MLPatterns = require('../patterns/ml-patterns');
const CLIPatterns = require('../patterns/cli-patterns');

class ArchitecturalDesignAgent extends BaseAgent {
  constructor(agentId, communicationHub, options = {}) {
    super(agentId, 'architectural-design', communicationHub, {
      ...options,
      temperature: options.temperature || 0.4,  // Balanced creativity and precision
      maxTokens: options.maxTokens || 8000,     // Large context for comprehensive design
      priority: options.priority || 'CRITICAL'   // Architecture is critical path
    });

    // Initialize application type detector
    this.appTypeDetector = new ApplicationTypeDetector();

    // Initialize deployment strategy selector
    this.deploymentSelector = new DeploymentStrategySelector();

    // Initialize pattern libraries
    this.patterns = this._initializePatternLibrary();
    this.patternLibraries = {
      web: new PatternLibrary(),
      desktop: new DesktopPatterns(),
      mobile: new MobilePatterns(),
      embedded: new EmbeddedPatterns(),
      game: new GamePatterns(),
      ml: new MLPatterns(),
      cli: new CLIPatterns()
    };

    // Initialize common constraints
    this.commonConstraints = this._initializeCommonConstraints();
  }

  /**
   * Design comprehensive system architecture
   * @param {Object} projectPlan - Project plan from coordinator
   * @param {Array} features - Features identified from proposal
   * @returns {Promise<Object>} Architecture specification
   */
  async designArchitecture(projectPlan, features) {
    try {
      console.log(`[${this.agentId}] Starting architecture design for ${features.length} features`);

      // Analyze requirements
      const requirements = await this._analyzeRequirements(projectPlan, features);

      // Generate architectural design
      const architecture = await this._generateArchitecture(requirements, projectPlan, features);

      // Enhance with patterns
      const enhancedArchitecture = await this._applyPatterns(architecture, requirements);

      // Add constraints
      const finalArchitecture = await this._addConstraints(enhancedArchitecture, requirements);

      // Add metadata
      finalArchitecture.architectureId = `arch-${Date.now()}-${uuidv4().substr(0, 8)}`;
      finalArchitecture.version = '1.0';
      finalArchitecture.projectId = projectPlan.projectInfo?.projectId || 'unknown';
      finalArchitecture.created = new Date().toISOString();

      console.log(`[${this.agentId}] Architecture design completed: ${finalArchitecture.architectureId}`);

      return finalArchitecture;

    } catch (error) {
      throw new AgentError(
        `Failed to design architecture: ${error.message}`,
        { agentId: this.agentId, error: error.message }
      );
    }
  }

  /**
   * Revise architecture based on quality gate feedback
   * @param {Object} architecture - Original architecture
   * @param {Array} issues - Quality gate issues
   * @returns {Promise<Object>} Revised architecture
   */
  async reviseArchitecture(architecture, issues) {
    try {
      console.log(`[${this.agentId}] Revising architecture based on ${issues.length} issues`);

      const { systemPrompt, userPrompt, temperature, maxTokens } =
        generateArchitecturalDesignPrompt('REVISE', {
          architecture,
          issues
        });

      const response = await this.callClaude(
        [{ role: 'user', content: userPrompt }],
        {
          systemPrompt,
          temperature,
          maxTokens,
          priority: 'CRITICAL'
        }
      );

      const revisedArchitecture = this._parseArchitectureResponse(response.content);

      // Preserve metadata
      revisedArchitecture.architectureId = architecture.architectureId;
      revisedArchitecture.version = (parseFloat(architecture.version) + 0.1).toFixed(1);
      revisedArchitecture.projectId = architecture.projectId;
      revisedArchitecture.created = architecture.created;
      revisedArchitecture.revised = new Date().toISOString();

      return revisedArchitecture;

    } catch (error) {
      throw new AgentError(
        `Failed to revise architecture: ${error.message}`,
        { agentId: this.agentId, architectureId: architecture.architectureId }
      );
    }
  }

  /**
   * Analyze project requirements
   * @private
   */
  async _analyzeRequirements(projectPlan, features) {
    // Detect application type
    const appTypeAnalysis = this.appTypeDetector.detectApplicationType(projectPlan, features);

    // Detect platforms
    const platformAnalysis = this.appTypeDetector.detectPlatforms(projectPlan);

    // Get deployment strategy
    const deploymentStrategy = this.deploymentSelector.selectDeploymentStrategy(
      appTypeAnalysis.appType,
      platformAnalysis.platforms,
      projectPlan.constraints || {}
    );

    const requirements = {
      appType: appTypeAnalysis.appType,
      platforms: platformAnalysis.platforms,
      deployment: deploymentStrategy,
      scale: this._determineScale(projectPlan, features),
      complexity: this._determineComplexity(features),
      performance: this._extractPerformanceRequirements(projectPlan),
      security: this._extractSecurityRequirements(projectPlan),
      integration: this._extractIntegrationRequirements(projectPlan),
      realtime: this._hasRealtimeRequirements(features),
      dataIntensive: this._isDataIntensive(features),
      userFacing: this._hasUserInterface(features),
      apiDriven: this._needsAPI(features),
      techStack: projectPlan.projectInfo?.techStack || [],
      constraints: projectPlan.constraints || [],
      // Add app-type specific requirements
      ...this._getAppTypeSpecificRequirements(appTypeAnalysis.appType, projectPlan)
    };

    return requirements;
  }

  /**
   * Generate architecture using Claude API
   * @private
   */
  async _generateArchitecture(requirements, projectPlan, features) {
    const { systemPrompt, userPrompt, temperature, maxTokens } =
      generateArchitecturalDesignPrompt('DESIGN', {
        projectPlan,
        features,
        requirements
      });

    const response = await this.retryWithBackoff(async () => {
      return await this.callClaude(
        [{ role: 'user', content: userPrompt }],
        {
          systemPrompt,
          temperature,
          maxTokens,
          priority: 'CRITICAL'
        }
      );
    });

    return this._parseArchitectureResponse(response.content);
  }

  /**
   * Apply architectural patterns
   * @private
   */
  async _applyPatterns(architecture, requirements) {
    // Get the appropriate pattern library for the app type
    const primaryAppType = requirements.appType.primary;
    const patternLibrary = this.patternLibraries[primaryAppType] || this.patternLibraries.web;

    let selectedPatterns = {};

    // App-type specific pattern selection
    switch (primaryAppType) {
      case 'desktop':
        selectedPatterns = patternLibrary.selectPatterns(requirements, {
          pluginSupport: requirements.extensible,
          documentBased: requirements.documentBased,
          multiWindow: requirements.multiWindow,
          uiFramework: requirements.uiFramework || 'electron',
          native: requirements.native
        });
        break;

      case 'mobile':
        selectedPatterns = patternLibrary.selectPatterns(requirements,
          requirements.platforms.primary[0] || 'cross-platform'
        );
        break;

      case 'embedded':
        selectedPatterns = patternLibrary.selectPatterns(requirements, {
          realtime: requirements.realtime,
          memory: requirements.memoryConstraint || 512 * 1024,
          batteryPowered: requirements.batteryPowered
        });
        break;

      case 'game':
        const gameType = requirements.gameType || ['general'];
        selectedPatterns = patternLibrary.selectPatterns(requirements, gameType);
        break;

      case 'ml':
        const mlType = requirements.mlType || 'general';
        selectedPatterns = patternLibrary.selectPatterns(requirements, mlType);
        break;

      case 'cli':
        selectedPatterns = patternLibrary.selectPatterns(requirements, {
          subcommands: requirements.complexity === 'high',
          interactive: requirements.interactive,
          pipeline: requirements.pipeline,
          progress: requirements.progress,
          formatted: requirements.formatted,
          configurable: requirements.configurable
        });
        break;

      case 'web':
      default:
        // Use existing web pattern selection logic
        selectedPatterns = this._selectWebPatterns(requirements);
        break;
    }

    // Apply patterns to architecture
    if (!architecture.patterns) {
      architecture.patterns = {};
    }

    // Merge selected patterns with architecture
    Object.keys(selectedPatterns).forEach(category => {
      architecture.patterns[category] = selectedPatterns[category];
    });

    // Add cross-cutting patterns if needed
    if (requirements.appType.isHybrid) {
      architecture.patterns.hybrid = this._selectHybridPatterns(requirements.appType);
    }

    return architecture;
  }

  /**
   * Select web patterns (existing logic)
   * @private
   */
  _selectWebPatterns(requirements) {
    const patterns = {
      architectural: [],
      design: [],
      integration: []
    };

    // Architectural patterns
    if (requirements.scale === 'high' || requirements.complexity === 'high') {
      patterns.architectural.push('microservices');
    } else if (requirements.scale === 'medium') {
      patterns.architectural.push('modular-monolith');
    } else {
      patterns.architectural.push('monolithic');
    }

    if (requirements.realtime) {
      patterns.architectural.push('event-driven');
      patterns.architectural.push('websocket');
    }

    if (requirements.apiDriven) {
      patterns.architectural.push('api-gateway');
      patterns.architectural.push('rest');
    }

    // Design patterns
    patterns.design.push('repository', 'factory');
    if (requirements.dataIntensive) {
      patterns.design.push('cqrs');
    }

    // Integration patterns
    patterns.integration = this._selectIntegrationPatterns(requirements);

    return patterns;
  }

  /**
   * Select hybrid patterns
   * @private
   */
  _selectHybridPatterns(appType) {
    const patterns = [];

    if (appType.primary === 'web' && appType.secondary.includes('mobile')) {
      patterns.push('responsive-design', 'pwa', 'api-first');
    }

    if (appType.primary === 'desktop' && appType.secondary.includes('web')) {
      patterns.push('electron-ipc', 'local-server', 'webview');
    }

    if (appType.primary === 'ml' && appType.secondary.includes('web')) {
      patterns.push('model-serving-api', 'batch-online-hybrid');
    }

    return patterns;
  }

  /**
   * Add constraints to architecture
   * @private
   */
  async _addConstraints(architecture, requirements) {
    const constraints = {
      technical: [],
      performance: [],
      security: []
    };

    // Technical constraints
    if (architecture.components && architecture.components.length > 0) {
      const languages = new Set();
      architecture.components.forEach(c => {
        if (c.technology?.language) {
          languages.add(c.technology.language);
        }
      });

      if (languages.size <= 2) {
        constraints.technical.push({
          id: 'tech-stack-consistency',
          type: 'mandatory',
          description: `All services must use ${Array.from(languages).join(' or ')}`,
          applies_to: 'all_components'
        });
      }
    }

    // Performance constraints
    if (requirements.performance.responseTime) {
      constraints.performance.push({
        id: 'response-time',
        type: 'mandatory',
        description: `95th percentile response time < ${requirements.performance.responseTime}ms`,
        measurement: 'synthetic monitoring'
      });
    }

    // Security constraints
    if (requirements.security.authentication) {
      constraints.security.push({
        id: 'auth-required',
        type: 'mandatory',
        description: 'All endpoints require authentication except health checks',
        exceptions: ['/health', '/metrics', '/ready']
      });
    }

    architecture.constraints = constraints;

    return architecture;
  }

  /**
   * Parse architecture response from Claude
   * @private
   */
  _parseArchitectureResponse(content) {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try parsing entire content as JSON
      return JSON.parse(content);
    } catch (error) {
      // Fallback: construct from text analysis
      console.warn(`[${this.agentId}] Failed to parse JSON, using fallback parser`);
      return this._fallbackParser(content);
    }
  }

  /**
   * Fallback parser for non-JSON responses
   * @private
   */
  _fallbackParser(content) {
    // Basic structure extraction
    const architecture = {
      overview: {
        style: 'monolithic',
        description: 'Fallback architecture - manual review recommended'
      },
      components: [],
      dataArchitecture: {},
      securityArchitecture: {},
      patterns: {
        architectural: ['monolithic'],
        design: ['mvc']
      },
      constraints: {
        technical: [],
        performance: [],
        security: []
      }
    };

    // Try to extract component information
    const componentMatches = content.match(/component[s]?:?\s*([^\n]+)/gi);
    if (componentMatches) {
      componentMatches.forEach((match, idx) => {
        architecture.components.push({
          id: `component-${idx}`,
          name: match.replace(/component[s]?:?\s*/i, '').trim(),
          type: 'service'
        });
      });
    }

    return architecture;
  }

  /**
   * Determine project scale
   * @private
   */
  _determineScale(projectPlan, features) {
    const featureCount = features.length;

    if (featureCount >= 10) return 'high';
    if (featureCount >= 5) return 'medium';
    return 'low';
  }

  /**
   * Determine project complexity
   * @private
   */
  _determineComplexity(features) {
    let complexity = 0;

    features.forEach(feature => {
      if (feature.dependencies && feature.dependencies.length > 2) complexity++;
      if (feature.priority === 'CRITICAL') complexity++;
      if (feature.requiredAgents && feature.requiredAgents.length > 3) complexity++;
    });

    if (complexity >= features.length * 0.5) return 'high';
    if (complexity >= features.length * 0.3) return 'medium';
    return 'low';
  }

  /**
   * Extract performance requirements
   * @private
   */
  _extractPerformanceRequirements(projectPlan) {
    const requirements = {};

    // Check for performance keywords in description
    const description = projectPlan.projectInfo?.description || '';
    if (description.match(/high.?performance|fast|quick|responsive|real.?time/i)) {
      requirements.responseTime = 200;
      requirements.throughput = 1000;
    } else {
      requirements.responseTime = 500;
      requirements.throughput = 100;
    }

    return requirements;
  }

  /**
   * Extract security requirements
   * @private
   */
  _extractSecurityRequirements(projectPlan) {
    const requirements = {};

    const description = projectPlan.projectInfo?.description || '';

    // Check for authentication needs
    if (description.match(/auth|login|user|account|secure|private/i)) {
      requirements.authentication = true;
      requirements.authorization = true;
    }

    // Check for encryption needs
    if (description.match(/encrypt|secure|sensitive|payment|medical|financial/i)) {
      requirements.encryption = true;
    }

    return requirements;
  }

  /**
   * Extract integration requirements
   * @private
   */
  _extractIntegrationRequirements(projectPlan) {
    const requirements = [];

    const description = projectPlan.projectInfo?.description || '';

    if (description.match(/third.?party|external|api|integration|webhook/i)) {
      requirements.push('external-apis');
    }

    if (description.match(/database|storage|persist/i)) {
      requirements.push('database');
    }

    if (description.match(/cache|redis|memcache/i)) {
      requirements.push('caching');
    }

    return requirements;
  }

  /**
   * Check for realtime requirements
   * @private
   */
  _hasRealtimeRequirements(features) {
    return features.some(f =>
      f.name.match(/real.?time|live|stream|websocket|push|notification/i) ||
      f.description?.match(/real.?time|live|stream|websocket|push|notification/i)
    );
  }

  /**
   * Check if project is data intensive
   * @private
   */
  _isDataIntensive(features) {
    return features.some(f =>
      f.name.match(/data|analytics|report|dashboard|etl|warehouse/i) ||
      f.description?.match(/data|analytics|report|dashboard|etl|warehouse/i)
    );
  }

  /**
   * Check if project has UI
   * @private
   */
  _hasUserInterface(features) {
    return features.some(f =>
      f.requiredAgents?.includes('frontend') ||
      f.name.match(/ui|interface|dashboard|portal|app|website/i)
    );
  }

  /**
   * Check if project needs API
   * @private
   */
  _needsAPI(features) {
    return features.some(f =>
      f.requiredAgents?.includes('backend') ||
      f.name.match(/api|endpoint|service|rest|graphql/i)
    );
  }

  /**
   * Select design patterns
   * @private
   */
  _selectDesignPatterns(architecture) {
    const patterns = [];

    // Always include basic patterns
    patterns.push('repository', 'factory');

    // Add patterns based on architecture style
    if (architecture.overview?.style === 'microservices') {
      patterns.push('service-locator', 'circuit-breaker', 'saga');
    }

    if (architecture.overview?.style === 'event-driven') {
      patterns.push('observer', 'publish-subscribe', 'event-sourcing');
    }

    return patterns;
  }

  /**
   * Select integration patterns
   * @private
   */
  _selectIntegrationPatterns(requirements) {
    const patterns = [];

    if (requirements.scale === 'high') {
      patterns.push('circuit-breaker', 'bulkhead', 'retry');
    }

    if (requirements.integration.includes('external-apis')) {
      patterns.push('adapter', 'facade', 'anti-corruption-layer');
    }

    return patterns;
  }

  /**
   * Initialize pattern library
   * @private
   */
  _initializePatternLibrary() {
    return {
      microservices: {
        name: 'Microservices',
        components: ['api-gateway', 'service-registry', 'config-service'],
        patterns: ['Circuit Breaker', 'Service Discovery', 'API Gateway']
      },
      'event-driven': {
        name: 'Event Driven',
        components: ['event-bus', 'event-store'],
        patterns: ['Event Sourcing', 'CQRS', 'Saga']
      },
      monolithic: {
        name: 'Monolithic',
        components: ['application-server'],
        patterns: ['MVC', 'Layered Architecture']
      }
    };
  }

  /**
   * Initialize common constraints
   * @private
   */
  _initializeCommonConstraints() {
    return {
      technical: [
        {
          id: 'consistent-error-handling',
          description: 'Use centralized error handling across all components'
        },
        {
          id: 'logging-standard',
          description: 'Use structured logging with correlation IDs'
        }
      ],
      performance: [
        {
          id: 'connection-pooling',
          description: 'Use connection pooling for all database connections'
        }
      ],
      security: [
        {
          id: 'encryption-at-rest',
          description: 'Encrypt all sensitive data at rest'
        },
        {
          id: 'encryption-in-transit',
          description: 'Use TLS 1.3 for all network communication'
        }
      ]
    };
  }

  /**
   * Get app-type specific requirements
   * @private
   */
  _getAppTypeSpecificRequirements(appType, projectPlan) {
    const requirements = {};
    const description = projectPlan.projectInfo?.description || '';

    switch (appType.primary) {
      case 'desktop':
        requirements.multiWindow = description.match(/multi.?window|workspace|panel/i) !== null;
        requirements.documentBased = description.match(/document|editor|ide/i) !== null;
        requirements.extensible = description.match(/plugin|extension|addon/i) !== null;
        requirements.native = description.match(/native|system|os/i) !== null;
        requirements.uiFramework = this._detectDesktopFramework(projectPlan);
        break;

      case 'mobile':
        requirements.offlineSupport = description.match(/offline|sync|local/i) !== null;
        requirements.pushNotifications = description.match(/notification|push|alert/i) !== null;
        requirements.nativeFeatures = description.match(/camera|gps|sensor|bluetooth/i) !== null;
        requirements.crossPlatform = appType.confidence < 0.8;
        break;

      case 'embedded':
        requirements.realtime = true;
        requirements.memoryConstraint = this._extractMemoryConstraint(description);
        requirements.batteryPowered = description.match(/battery|portable|wearable/i) !== null;
        requirements.connectivity = this._extractConnectivity(description);
        break;

      case 'game':
        requirements.gameType = this._detectGameType(description);
        requirements.multiplayer = description.match(/multiplayer|online|pvp|coop/i) !== null;
        requirements.graphics = description.match(/3d|three.?dimensional/i) ? '3d' : '2d';
        requirements.platform = this._detectGamePlatform(projectPlan);
        break;

      case 'ml':
        requirements.mlType = this._detectMLType(description);
        requirements.deployment = description.match(/real.?time|online|api/i) ? 'realtime' : 'batch';
        requirements.scale = description.match(/distributed|large.?scale|big.?data/i) ? 'distributed' : 'single';
        requirements.continuous = description.match(/continuous|retrain|update/i) !== null;
        requirements.dataVolume = description.match(/large|big.?data|stream/i) ? 'large' : 'small';
        break;

      case 'cli':
        requirements.interactive = description.match(/interactive|prompt|wizard/i) !== null;
        requirements.pipeline = description.match(/pipe|stream|filter/i) !== null;
        requirements.progress = description.match(/progress|loading|status/i) !== null;
        requirements.formatted = description.match(/format|json|yaml|table/i) !== null;
        requirements.configurable = description.match(/config|settings|preferences/i) !== null;
        break;

      case 'blockchain':
        requirements.network = this._detectBlockchainNetwork(description);
        requirements.smartContract = description.match(/smart.?contract|solidity|defi/i) !== null;
        requirements.wallet = description.match(/wallet|transaction|payment/i) !== null;
        break;

      case 'data':
        requirements.pipelineType = description.match(/etl|stream|batch/i) || 'batch';
        requirements.storage = description.match(/warehouse|lake|database/i) || 'database';
        requirements.processing = description.match(/spark|hadoop|flink/i) || 'native';
        break;
    }

    return requirements;
  }

  /**
   * Detect desktop framework
   * @private
   */
  _detectDesktopFramework(projectPlan) {
    const tech = projectPlan.projectInfo?.techStack?.join(' ') || '';
    const desc = projectPlan.projectInfo?.description || '';
    const combined = `${tech} ${desc}`.toLowerCase();

    if (combined.match(/electron/)) return 'electron';
    if (combined.match(/tauri/)) return 'tauri';
    if (combined.match(/qt|pyqt/)) return 'qt';
    if (combined.match(/wpf|winforms|\.net/)) return 'dotnet';
    if (combined.match(/swing|javafx/)) return 'java';

    return 'electron'; // Default
  }

  /**
   * Extract memory constraint for embedded
   * @private
   */
  _extractMemoryConstraint(description) {
    const match = description.match(/(\d+)\s*(kb|mb|gb)/i);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const multipliers = { kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
      return value * multipliers[unit];
    }
    return 64 * 1024; // Default 64KB
  }

  /**
   * Extract connectivity for embedded
   * @private
   */
  _extractConnectivity(description) {
    const connectivity = [];
    if (description.match(/mqtt/i)) connectivity.push('mqtt');
    if (description.match(/coap/i)) connectivity.push('coap');
    if (description.match(/modbus/i)) connectivity.push('modbus');
    if (description.match(/can/i)) connectivity.push('can');
    if (description.match(/lora/i)) connectivity.push('lorawan');
    if (description.match(/wifi|wireless/i)) connectivity.push('wifi');
    if (description.match(/bluetooth|ble/i)) connectivity.push('bluetooth');
    return connectivity.length > 0 ? connectivity : ['wifi'];
  }

  /**
   * Detect game type
   * @private
   */
  _detectGameType(description) {
    const types = [];
    if (description.match(/rpg|role.?playing/i)) types.push('rpg');
    if (description.match(/strategy|rts/i)) types.push('strategy');
    if (description.match(/shooter|fps/i)) types.push('shooter');
    if (description.match(/puzzle/i)) types.push('puzzle');
    if (description.match(/platformer|jump/i)) types.push('platformer');
    if (description.match(/simulation|sim/i)) types.push('simulation');
    return types.length > 0 ? types : ['general'];
  }

  /**
   * Detect game platform
   * @private
   */
  _detectGamePlatform(projectPlan) {
    const desc = projectPlan.projectInfo?.description || '';
    if (desc.match(/mobile|ios|android/i)) return 'mobile';
    if (desc.match(/console|playstation|xbox|nintendo/i)) return 'console';
    if (desc.match(/web|browser|html5/i)) return 'web';
    return 'pc';
  }

  /**
   * Detect ML type
   * @private
   */
  _detectMLType(description) {
    if (description.match(/classification|classify/i)) return 'classification';
    if (description.match(/regression|predict/i)) return 'regression';
    if (description.match(/cluster/i)) return 'clustering';
    if (description.match(/recommendation|recommend/i)) return 'recommendation';
    if (description.match(/nlp|text|language/i)) return 'nlp';
    if (description.match(/vision|image|video/i)) return 'computer-vision';
    if (description.match(/reinforcement/i)) return 'reinforcement';
    return 'general';
  }

  /**
   * Detect blockchain network
   * @private
   */
  _detectBlockchainNetwork(description) {
    if (description.match(/ethereum|eth/i)) return 'ethereum';
    if (description.match(/binance|bsc/i)) return 'binance';
    if (description.match(/polygon|matic/i)) return 'polygon';
    if (description.match(/solana/i)) return 'solana';
    if (description.match(/bitcoin|btc/i)) return 'bitcoin';
    return 'ethereum'; // Default
  }
}

module.exports = ArchitecturalDesignAgent;