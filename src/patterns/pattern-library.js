/**
 * Pattern Library
 * Provides reusable architectural and design patterns
 */

const fs = require('fs-extra');
const path = require('path');

class PatternLibrary {
  constructor() {
    this.patterns = this._loadPatterns();
  }

  /**
   * Select patterns based on requirements
   * @param {Object} requirements - Project requirements
   * @returns {Object} Selected patterns
   */
  selectPatterns(requirements) {
    const selected = {
      architectural: [],
      design: [],
      integration: [],
      data: []
    };

    // Architectural patterns
    if (requirements.scale === 'high' || requirements.complexity === 'high') {
      selected.architectural.push(this.patterns.architectural.microservices);
      selected.architectural.push(this.patterns.architectural.apiGateway);
    } else if (requirements.scale === 'medium') {
      selected.architectural.push(this.patterns.architectural.modularMonolith);
    } else {
      selected.architectural.push(this.patterns.architectural.layered);
    }

    if (requirements.realtime) {
      selected.architectural.push(this.patterns.architectural.eventDriven);
      selected.architectural.push(this.patterns.architectural.pubSub);
    }

    // Design patterns
    selected.design.push(this.patterns.design.repository);
    selected.design.push(this.patterns.design.factory);

    if (requirements.complexity === 'high') {
      selected.design.push(this.patterns.design.strategy);
      selected.design.push(this.patterns.design.decorator);
    }

    if (requirements.realtime || requirements.eventDriven) {
      selected.design.push(this.patterns.design.observer);
    }

    // Integration patterns
    if (requirements.scale === 'high') {
      selected.integration.push(this.patterns.integration.circuitBreaker);
      selected.integration.push(this.patterns.integration.retry);
      selected.integration.push(this.patterns.integration.bulkhead);
    }

    if (requirements.integration?.includes('external-apis')) {
      selected.integration.push(this.patterns.integration.adapter);
      selected.integration.push(this.patterns.integration.antiCorruptionLayer);
    }

    // Data patterns
    if (requirements.dataIntensive) {
      selected.data.push(this.patterns.data.cqrs);
      if (requirements.scale === 'high') {
        selected.data.push(this.patterns.data.eventSourcing);
      }
    }

    if (requirements.scale === 'high' || requirements.complexity === 'high') {
      selected.data.push(this.patterns.data.saga);
    }

    return selected;
  }

  /**
   * Apply pattern to generate components
   * @param {Object} pattern - Pattern to apply
   * @param {Object} context - Context for pattern application
   * @returns {Object} Generated components/configuration
   */
  applyPattern(pattern, context) {
    if (!pattern.template) {
      return null;
    }

    // Deep clone the template
    const result = JSON.parse(JSON.stringify(pattern.template));

    // Replace placeholders with context values
    const replacePlaceholders = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].replace(/\{\{(\w+)\}\}/g, (match, p1) => {
            return context[p1] || match;
          });
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          replacePlaceholders(obj[key]);
        }
      }
    };

    replacePlaceholders(result);
    return result;
  }

  /**
   * Get pattern by name
   * @param {string} category - Pattern category
   * @param {string} name - Pattern name
   * @returns {Object} Pattern definition
   */
  getPattern(category, name) {
    return this.patterns[category]?.[name];
  }

  /**
   * Load pattern definitions
   * @private
   */
  _loadPatterns() {
    // In a production system, these would be loaded from JSON files
    // For now, we'll define them inline
    return {
      architectural: {
        microservices: {
          name: 'Microservices',
          description: 'Distributed architecture with independent services',
          applicability: {
            scale: ['high'],
            complexity: ['high'],
            teamSize: ['>5']
          },
          template: {
            components: [
              {
                id: 'api-gateway',
                name: 'API Gateway',
                type: 'service',
                responsibility: 'Route requests, handle auth, rate limiting',
                required: true
              },
              {
                id: 'service-registry',
                name: 'Service Registry',
                type: 'service',
                responsibility: 'Service discovery and registration',
                required: true
              },
              {
                id: 'config-service',
                name: 'Configuration Service',
                type: 'service',
                responsibility: 'Centralized configuration management',
                required: false
              }
            ],
            patterns: ['API Gateway', 'Service Discovery', 'Circuit Breaker']
          }
        },

        modularMonolith: {
          name: 'Modular Monolith',
          description: 'Monolithic deployment with modular internal structure',
          applicability: {
            scale: ['medium'],
            complexity: ['medium'],
            teamSize: ['3-5']
          },
          template: {
            components: [
              {
                id: 'app-server',
                name: 'Application Server',
                type: 'service',
                responsibility: 'Main application with modular structure'
              }
            ],
            patterns: ['Domain Modules', 'Dependency Injection']
          }
        },

        layered: {
          name: 'Layered Architecture',
          description: 'Traditional n-tier architecture',
          applicability: {
            scale: ['low'],
            complexity: ['low'],
            teamSize: ['1-3']
          },
          template: {
            components: [
              {
                id: 'presentation',
                name: 'Presentation Layer',
                type: 'layer',
                responsibility: 'User interface and API endpoints'
              },
              {
                id: 'business',
                name: 'Business Layer',
                type: 'layer',
                responsibility: 'Business logic and rules'
              },
              {
                id: 'data',
                name: 'Data Layer',
                type: 'layer',
                responsibility: 'Data access and persistence'
              }
            ],
            patterns: ['MVC', 'Repository']
          }
        },

        eventDriven: {
          name: 'Event-Driven Architecture',
          description: 'Asynchronous communication through events',
          applicability: {
            realtime: true,
            scale: ['medium', 'high']
          },
          template: {
            components: [
              {
                id: 'event-bus',
                name: 'Event Bus',
                type: 'infrastructure',
                responsibility: 'Event routing and delivery'
              },
              {
                id: 'event-store',
                name: 'Event Store',
                type: 'database',
                responsibility: 'Event persistence and replay'
              }
            ],
            patterns: ['Event Sourcing', 'CQRS', 'Publish-Subscribe']
          }
        },

        apiGateway: {
          name: 'API Gateway',
          description: 'Unified entry point for all API requests',
          template: {
            components: [
              {
                id: 'api-gateway',
                name: 'API Gateway',
                type: 'service',
                responsibility: 'Request routing, auth, rate limiting, caching'
              }
            ]
          }
        },

        pubSub: {
          name: 'Publish-Subscribe',
          description: 'Decoupled communication through topics',
          template: {
            components: [
              {
                id: 'message-broker',
                name: 'Message Broker',
                type: 'infrastructure',
                responsibility: 'Message routing and delivery'
              }
            ]
          }
        }
      },

      design: {
        repository: {
          name: 'Repository',
          description: 'Abstraction layer for data access',
          implementation: `
interface Repository<T> {
  findById(id: string): Promise<T>
  findAll(): Promise<T[]>
  save(entity: T): Promise<T>
  delete(id: string): Promise<void>
}`
        },

        factory: {
          name: 'Factory',
          description: 'Encapsulate object creation',
          implementation: `
class Factory {
  create(type, params) {
    switch(type) {
      case 'A': return new TypeA(params)
      case 'B': return new TypeB(params)
    }
  }
}`
        },

        strategy: {
          name: 'Strategy',
          description: 'Encapsulate algorithms',
          implementation: `
interface Strategy {
  execute(data): Result
}
class Context {
  constructor(strategy: Strategy)
  executeStrategy(data) {
    return this.strategy.execute(data)
  }
}`
        },

        observer: {
          name: 'Observer',
          description: 'Subscribe to state changes',
          implementation: `
class Subject {
  observers = []
  subscribe(observer) { this.observers.push(observer) }
  notify(event) {
    this.observers.forEach(o => o.update(event))
  }
}`
        },

        decorator: {
          name: 'Decorator',
          description: 'Add behavior without modifying class',
          implementation: `
class Decorator {
  constructor(component) { this.component = component }
  operation() {
    // Add behavior
    return this.component.operation()
  }
}`
        }
      },

      integration: {
        circuitBreaker: {
          name: 'Circuit Breaker',
          description: 'Prevent cascading failures',
          implementation: {
            states: ['CLOSED', 'OPEN', 'HALF_OPEN'],
            config: {
              failureThreshold: 5,
              timeout: 60000,
              resetTimeout: 30000
            }
          }
        },

        retry: {
          name: 'Retry',
          description: 'Retry failed operations',
          implementation: {
            config: {
              maxAttempts: 3,
              backoff: 'exponential',
              initialDelay: 1000
            }
          }
        },

        bulkhead: {
          name: 'Bulkhead',
          description: 'Isolate resources',
          implementation: {
            config: {
              maxConcurrent: 10,
              maxQueue: 50,
              timeout: 30000
            }
          }
        },

        adapter: {
          name: 'Adapter',
          description: 'Convert interface to expected format',
          implementation: `
class Adapter {
  constructor(adaptee) { this.adaptee = adaptee }
  request() {
    return this.adaptee.specificRequest()
  }
}`
        },

        antiCorruptionLayer: {
          name: 'Anti-Corruption Layer',
          description: 'Isolate from external system changes',
          implementation: `
class AntiCorruptionLayer {
  translateRequest(internalRequest) {
    return externalFormat
  }
  translateResponse(externalResponse) {
    return internalFormat
  }
}`
        }
      },

      data: {
        cqrs: {
          name: 'CQRS',
          description: 'Separate read and write models',
          template: {
            components: [
              {
                id: 'command-service',
                name: 'Command Service',
                responsibility: 'Handle write operations'
              },
              {
                id: 'query-service',
                name: 'Query Service',
                responsibility: 'Handle read operations'
              },
              {
                id: 'read-model',
                name: 'Read Model Database',
                type: 'database',
                responsibility: 'Optimized for queries'
              }
            ]
          }
        },

        eventSourcing: {
          name: 'Event Sourcing',
          description: 'Store state as sequence of events',
          template: {
            components: [
              {
                id: 'event-store',
                name: 'Event Store',
                type: 'database',
                responsibility: 'Store all domain events'
              },
              {
                id: 'projection-service',
                name: 'Projection Service',
                responsibility: 'Build read models from events'
              }
            ]
          }
        },

        saga: {
          name: 'Saga',
          description: 'Manage distributed transactions',
          implementation: {
            types: ['Orchestration', 'Choreography'],
            compensationRequired: true
          }
        }
      }
    };
  }

  /**
   * Get patterns suitable for a component type
   * @param {string} componentType - Type of component
   * @returns {Array} Suitable patterns
   */
  getPatternsForComponent(componentType) {
    const patterns = [];

    switch (componentType) {
      case 'service':
        patterns.push(
          this.patterns.design.repository,
          this.patterns.design.factory,
          this.patterns.integration.circuitBreaker
        );
        break;
      case 'database':
        patterns.push(
          this.patterns.data.cqrs,
          this.patterns.data.eventSourcing
        );
        break;
      case 'api':
        patterns.push(
          this.patterns.architectural.apiGateway,
          this.patterns.integration.adapter
        );
        break;
    }

    return patterns;
  }
}

module.exports = PatternLibrary;