/**
 * Application Type Detector
 * Analyzes projects to determine application type and target platforms
 */

class ApplicationTypeDetector {
  constructor() {
    // Define indicators for each application type
    this.typeIndicators = {
      web: {
        keywords: ['website', 'web app', 'webapp', 'portal', 'dashboard', 'admin panel', 'spa', 'single page', 'rest api', 'graphql', 'http', 'https', 'browser', 'responsive', 'pwa'],
        features: ['api', 'authentication', 'database', 'cloud', 'serverless', 'microservice'],
        agents: ['backend', 'frontend'],
        weight: 1.0
      },

      desktop: {
        keywords: ['desktop', 'native app', 'standalone', 'offline', 'local', 'system tray', 'menu bar', 'file system', 'electron', 'qt', 'wpf', 'winforms', 'gtk', 'javafx', 'tauri'],
        features: ['file management', 'system integration', 'offline mode', 'local database', 'native ui'],
        agents: ['desktop', 'native'],
        weight: 1.2
      },

      mobile: {
        keywords: ['mobile', 'ios', 'android', 'iphone', 'ipad', 'tablet', 'react native', 'flutter', 'swift', 'kotlin', 'xamarin', 'ionic', 'app store', 'play store', 'push notification'],
        features: ['touch', 'gesture', 'camera', 'gps', 'offline sync', 'push notifications'],
        agents: ['mobile', 'ios', 'android'],
        weight: 1.3
      },

      cli: {
        keywords: ['cli', 'command line', 'terminal', 'console', 'shell', 'script', 'automation', 'tool', 'utility', 'bash', 'powershell', 'npm package', 'pip package'],
        features: ['command parsing', 'piping', 'scripting', 'automation'],
        agents: ['cli', 'scripting'],
        weight: 1.5
      },

      embedded: {
        keywords: ['embedded', 'iot', 'firmware', 'microcontroller', 'mcu', 'arduino', 'esp32', 'raspberry pi', 'stm32', 'sensor', 'actuator', 'real-time', 'rtos', 'bare metal'],
        features: ['hardware', 'gpio', 'i2c', 'spi', 'uart', 'low power', 'real time'],
        agents: ['embedded', 'firmware'],
        weight: 1.8
      },

      game: {
        keywords: ['game', 'gaming', '2d', '3d', 'graphics', 'render', 'unity', 'unreal', 'godot', 'physics', 'multiplayer', 'fps', 'rpg', 'puzzle', 'simulation', 'vr', 'ar'],
        features: ['rendering', 'physics', 'ai', 'multiplayer', 'graphics', 'audio'],
        agents: ['game', 'graphics'],
        weight: 1.7
      },

      ml: {
        keywords: ['machine learning', 'ml', 'ai', 'artificial intelligence', 'model', 'training', 'inference', 'neural network', 'deep learning', 'tensorflow', 'pytorch', 'scikit-learn', 'data science'],
        features: ['model training', 'data processing', 'inference', 'pipeline', 'feature engineering'],
        agents: ['ml', 'data'],
        weight: 1.6
      },

      blockchain: {
        keywords: ['blockchain', 'smart contract', 'dapp', 'web3', 'ethereum', 'solidity', 'nft', 'defi', 'cryptocurrency', 'ledger', 'consensus'],
        features: ['smart contracts', 'transactions', 'wallet', 'consensus', 'mining'],
        agents: ['blockchain', 'smart-contract'],
        weight: 1.9
      },

      data: {
        keywords: ['etl', 'data pipeline', 'data processing', 'stream processing', 'batch', 'kafka', 'spark', 'airflow', 'data warehouse', 'analytics', 'reporting'],
        features: ['data ingestion', 'transformation', 'aggregation', 'streaming', 'batch processing'],
        agents: ['data', 'pipeline'],
        weight: 1.4
      }
    };

    // Platform indicators
    this.platformIndicators = {
      windows: ['windows', 'win32', 'wpf', 'winforms', '.net', 'uwp', 'exe', 'msi'],
      macos: ['mac', 'macos', 'osx', 'cocoa', 'swift', 'objective-c', 'dmg', 'pkg'],
      linux: ['linux', 'ubuntu', 'debian', 'fedora', 'gtk', 'kde', 'gnome', 'x11', 'wayland'],
      ios: ['ios', 'iphone', 'ipad', 'swift', 'objective-c', 'xcode', 'app store', 'testflight'],
      android: ['android', 'kotlin', 'java', 'play store', 'apk', 'aab', 'material design'],
      web: ['browser', 'chrome', 'firefox', 'safari', 'edge', 'web', 'html', 'css', 'javascript'],
      embedded: ['mcu', 'microcontroller', 'arduino', 'esp32', 'stm32', 'rtos', 'bare-metal'],
      cloud: ['aws', 'azure', 'gcp', 'cloud', 'serverless', 'kubernetes', 'docker'],
      crossPlatform: ['cross-platform', 'multi-platform', 'universal', 'everywhere']
    };
  }

  /**
   * Detect application type from project plan and features
   * @param {Object} projectPlan - Project plan from proposal
   * @param {Array} features - Feature list
   * @returns {Object} Detection result with confidence scores
   */
  detectApplicationType(projectPlan, features) {
    const description = this._getFullDescription(projectPlan, features);
    const scores = {};

    // Calculate scores for each application type
    for (const [type, indicators] of Object.entries(this.typeIndicators)) {
      scores[type] = this._calculateTypeScore(description, features, indicators);
    }

    // Sort by score and get top matches
    const sortedTypes = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([type, score]) => ({ type, score, confidence: this._calculateConfidence(score) }));

    // Determine primary and secondary types
    const primary = sortedTypes[0];
    const secondary = sortedTypes[1]?.score > 0.3 ? sortedTypes[1] : null;

    // Determine if hybrid architecture needed
    const isHybrid = secondary && (secondary.score / primary.score) > 0.7;

    return {
      primary: primary.type,
      primaryConfidence: primary.confidence,
      secondary: secondary?.type || null,
      secondaryConfidence: secondary?.confidence || 0,
      isHybrid,
      scores: Object.fromEntries(
        sortedTypes.map(({ type, score, confidence }) => [type, { score, confidence }])
      ),
      category: this._determineCategory(primary.type),
      recommendation: this._generateRecommendation(primary, secondary, isHybrid)
    };
  }

  /**
   * Detect target platforms from project description
   * @param {Object} projectPlan - Project plan
   * @param {Array} features - Features
   * @param {Object} appType - Detected application type
   * @returns {Object} Platform detection result
   */
  detectTargetPlatforms(projectPlan, features, appType) {
    const description = this._getFullDescription(projectPlan, features);
    const platforms = {
      primary: [],
      secondary: [],
      deployment: null
    };

    // Check for explicit platform mentions
    for (const [platform, keywords] of Object.entries(this.platformIndicators)) {
      const score = this._calculatePlatformScore(description, keywords);
      if (score > 0.5) {
        platforms.primary.push(platform);
      } else if (score > 0.2) {
        platforms.secondary.push(platform);
      }
    }

    // Apply defaults based on application type if no platforms detected
    if (platforms.primary.length === 0) {
      platforms.primary = this._getDefaultPlatforms(appType.primary);
    }

    // Determine deployment platform
    platforms.deployment = this._determineDeploymentPlatform(platforms.primary, appType);

    // Add platform versions if specified
    platforms.versions = this._extractPlatformVersions(description);

    return platforms;
  }

  /**
   * Analyze resource requirements based on application type
   * @param {Object} appType - Detected application type
   * @param {Array} features - Features
   * @returns {Object} Resource requirements
   */
  analyzeResourceRequirements(appType, features) {
    const requirements = {
      memory: {},
      cpu: {},
      storage: {},
      network: {},
      power: {}
    };

    // Set base requirements by app type
    switch (appType.primary) {
      case 'embedded':
        requirements.memory = { min: '256KB', max: '32MB', typical: '4MB' };
        requirements.cpu = { cores: 1, frequency: '8MHz-200MHz' };
        requirements.power = { critical: true, battery: true };
        break;

      case 'mobile':
        requirements.memory = { min: '512MB', max: '4GB', typical: '2GB' };
        requirements.cpu = { cores: '2-8', frequency: '1GHz-3GHz' };
        requirements.power = { critical: true, battery: true };
        requirements.network = { offline: true, cellular: true };
        break;

      case 'desktop':
        requirements.memory = { min: '2GB', max: '32GB', typical: '8GB' };
        requirements.cpu = { cores: '2-16', frequency: '2GHz-5GHz' };
        requirements.storage = { installation: '100MB-2GB', data: 'unlimited' };
        break;

      case 'game':
        requirements.memory = { min: '4GB', max: '32GB', typical: '16GB' };
        requirements.cpu = { cores: '4-16', frequency: '3GHz-5GHz' };
        requirements.gpu = { required: true, vram: '2GB-16GB' };
        break;

      case 'web':
        requirements.memory = { serverSide: true, scalable: true };
        requirements.cpu = { serverSide: true, scalable: true };
        requirements.network = { critical: true, bandwidth: 'variable' };
        break;

      case 'ml':
        requirements.memory = { min: '8GB', max: '256GB', gpu: true };
        requirements.cpu = { cores: '8-64', gpu: 'recommended' };
        requirements.storage = { models: '100MB-10GB', datasets: '1GB-1TB' };
        break;
    }

    // Adjust based on specific features
    this._adjustResourcesForFeatures(requirements, features);

    return requirements;
  }

  /**
   * Determine deployment needs based on application type and platforms
   * @param {Object} appType - Application type
   * @param {Object} platforms - Target platforms
   * @returns {Object} Deployment configuration
   */
  determineDeploymentNeeds(appType, platforms) {
    const deployment = {
      strategy: null,
      distribution: [],
      updates: {},
      packaging: null
    };

    switch (appType.primary) {
      case 'web':
        deployment.strategy = 'cloud';
        deployment.distribution = ['continuous-deployment'];
        deployment.updates = { mechanism: 'rolling', frequency: 'continuous' };
        break;

      case 'desktop':
        deployment.strategy = 'installer';
        deployment.distribution = this._getDesktopDistribution(platforms.primary);
        deployment.packaging = this._getDesktopPackaging(platforms.primary);
        deployment.updates = { mechanism: 'in-app', frequency: 'periodic' };
        break;

      case 'mobile':
        deployment.strategy = 'app-store';
        deployment.distribution = this._getMobileStores(platforms.primary);
        deployment.updates = { mechanism: 'store-managed', codePush: true };
        break;

      case 'embedded':
        deployment.strategy = 'firmware';
        deployment.distribution = ['ota', 'flash-tool'];
        deployment.updates = { mechanism: 'ota', validation: 'checksum' };
        break;

      case 'cli':
        deployment.strategy = 'package-manager';
        deployment.distribution = ['npm', 'pip', 'homebrew', 'apt', 'yum'];
        deployment.updates = { mechanism: 'package-manager', frequency: 'manual' };
        break;
    }

    return deployment;
  }

  // Private helper methods

  _getFullDescription(projectPlan, features) {
    const parts = [
      projectPlan.projectInfo?.title || '',
      projectPlan.projectInfo?.description || '',
      projectPlan.description || ''
    ];

    // Add feature descriptions
    if (features && Array.isArray(features)) {
      features.forEach(f => {
        parts.push(f.name || '');
        parts.push(f.description || '');
      });
    }

    return parts.join(' ').toLowerCase();
  }

  _calculateTypeScore(description, features, indicators) {
    let score = 0;
    let matches = 0;

    // Check keywords
    indicators.keywords.forEach(keyword => {
      if (description.includes(keyword.toLowerCase())) {
        score += 1.0 * indicators.weight;
        matches++;
      }
    });

    // Check feature names
    if (features && Array.isArray(features)) {
      indicators.features.forEach(feature => {
        if (features.some(f =>
          f.name?.toLowerCase().includes(feature) ||
          f.description?.toLowerCase().includes(feature)
        )) {
          score += 0.8 * indicators.weight;
          matches++;
        }
      });

      // Check required agents
      indicators.agents.forEach(agent => {
        if (features.some(f =>
          f.requiredAgents?.includes(agent)
        )) {
          score += 1.2 * indicators.weight;
          matches++;
        }
      });
    }

    // Normalize score
    return matches > 0 ? score / Math.sqrt(matches) : 0;
  }

  _calculatePlatformScore(description, keywords) {
    let score = 0;
    keywords.forEach(keyword => {
      if (description.includes(keyword.toLowerCase())) {
        score += 1.0;
      }
    });
    return score / keywords.length;
  }

  _calculateConfidence(score) {
    if (score > 2.0) return 'high';
    if (score > 1.0) return 'medium';
    if (score > 0.5) return 'low';
    return 'very-low';
  }

  _determineCategory(primaryType) {
    const categories = {
      web: 'web',
      desktop: 'native',
      mobile: 'native',
      cli: 'tool',
      embedded: 'system',
      game: 'entertainment',
      ml: 'ai',
      blockchain: 'distributed',
      data: 'infrastructure'
    };
    return categories[primaryType] || 'general';
  }

  _generateRecommendation(primary, secondary, isHybrid) {
    if (isHybrid && secondary) {
      return `Hybrid ${primary.type}/${secondary.type} architecture recommended`;
    }

    const confidence = primary.confidence;
    if (confidence === 'high') {
      return `${primary.type} architecture strongly recommended`;
    } else if (confidence === 'medium') {
      return `${primary.type} architecture recommended with moderate confidence`;
    } else {
      return `${primary.type} architecture suggested, but consider reviewing requirements`;
    }
  }

  _getDefaultPlatforms(appType) {
    const defaults = {
      web: ['web'],
      desktop: ['windows', 'macos', 'linux'],
      mobile: ['ios', 'android'],
      cli: ['linux', 'macos', 'windows'],
      embedded: ['embedded'],
      game: ['windows', 'macos', 'linux'],
      ml: ['cloud', 'linux'],
      blockchain: ['web', 'cloud'],
      data: ['cloud', 'linux']
    };
    return defaults[appType] || ['web'];
  }

  _determineDeploymentPlatform(primaryPlatforms, appType) {
    if (primaryPlatforms.includes('cloud')) return 'cloud';
    if (primaryPlatforms.includes('embedded')) return 'embedded';
    if (appType.primary === 'web') return 'cloud';
    if (appType.primary === 'mobile') return 'app-stores';
    if (appType.primary === 'desktop') return 'installers';
    return 'hybrid';
  }

  _extractPlatformVersions(description) {
    const versions = {};

    // iOS version detection
    const iosMatch = description.match(/ios\s*(\d+)/i);
    if (iosMatch) versions.ios = `${iosMatch[1]}.0+`;

    // Android version detection
    const androidMatch = description.match(/android\s*(\d+)/i);
    if (androidMatch) versions.android = `${androidMatch[1]}.0+`;

    // Windows version detection
    if (description.includes('windows 11')) versions.windows = '11+';
    else if (description.includes('windows 10')) versions.windows = '10+';

    return versions;
  }

  _adjustResourcesForFeatures(requirements, features) {
    features.forEach(feature => {
      const name = feature.name?.toLowerCase() || '';

      if (name.includes('video') || name.includes('streaming')) {
        requirements.network.bandwidth = 'high';
        requirements.memory.streaming = true;
      }

      if (name.includes('offline')) {
        requirements.storage.offline = '1GB+';
        requirements.network.offline = true;
      }

      if (name.includes('real-time') || name.includes('realtime')) {
        requirements.latency = { max: '100ms', target: '10ms' };
      }

      if (name.includes('ai') || name.includes('ml')) {
        requirements.cpu.ml = true;
        if (!requirements.gpu) requirements.gpu = { recommended: true };
      }
    });
  }

  _getDesktopDistribution(platforms) {
    const distribution = [];
    if (platforms.includes('windows')) distribution.push('installer', 'microsoft-store');
    if (platforms.includes('macos')) distribution.push('dmg', 'mac-app-store');
    if (platforms.includes('linux')) distribution.push('apt', 'snap', 'flatpak');
    return distribution;
  }

  _getDesktopPackaging(platforms) {
    const packaging = {};
    if (platforms.includes('windows')) packaging.windows = 'msi|exe|msix';
    if (platforms.includes('macos')) packaging.macos = 'dmg|pkg|app';
    if (platforms.includes('linux')) packaging.linux = 'deb|rpm|appimage';
    return packaging;
  }

  _getMobileStores(platforms) {
    const stores = [];
    if (platforms.includes('ios')) stores.push('app-store', 'testflight');
    if (platforms.includes('android')) stores.push('play-store', 'f-droid');
    return stores;
  }
}

module.exports = ApplicationTypeDetector;