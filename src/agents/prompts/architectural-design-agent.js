/**
 * Prompts for Architectural Design Agent
 * Generates system architecture before feature specification
 */

/**
 * Generate prompts for architectural design operations
 * @param {string} operation - Operation type (DESIGN, REVISE)
 * @param {Object} context - Context data
 * @returns {Object} Prompt configuration
 */
function generateArchitecturalDesignPrompt(operation, context) {
  switch (operation) {
    case 'DESIGN':
      return generateDesignPrompt(context);
    case 'REVISE':
      return generateRevisionPrompt(context);
    default:
      throw new Error(`Unknown architecture operation: ${operation}`);
  }
}

/**
 * Generate architecture design prompt
 * @private
 */
function generateDesignPrompt(context) {
  const { projectPlan, features, requirements } = context;

  const systemPrompt = `You are a senior software architect with 15+ years of experience designing production systems.
Your architectural designs must be:
- Scalable and performant
- Secure by default
- Maintainable and testable
- Cost-effective
- Following industry best practices (SOLID, DRY, KISS)
- Using proven architectural patterns

You specialize in:
- Microservices and distributed systems
- Cloud-native architectures
- Security architecture
- Performance optimization
- DevOps and CI/CD

Your output must be valid JSON following the exact schema provided.`;

  const userPrompt = `Design a comprehensive system architecture for this project.

PROJECT INFORMATION:
${JSON.stringify(projectPlan.projectInfo || {}, null, 2)}

FEATURES TO IMPLEMENT:
${features.map(f => `- ${f.name}: ${f.description}`).join('\n')}

ANALYZED REQUIREMENTS:
- Scale: ${requirements.scale}
- Complexity: ${requirements.complexity}
- Performance: Response time < ${requirements.performance.responseTime}ms, Throughput > ${requirements.performance.throughput} req/s
- Security: Authentication=${requirements.security.authentication}, Encryption=${requirements.security.encryption}
- Integration needs: ${requirements.integration.join(', ')}
- Real-time requirements: ${requirements.realtime}
- Data intensive: ${requirements.dataIntensive}
- User interface: ${requirements.userFacing}
- API driven: ${requirements.apiDriven}

TASK: Generate a complete architectural specification with the following structure:

{
  "overview": {
    "style": "microservices|monolithic|serverless|event-driven|hybrid",
    "description": "High-level architecture description",
    "keyDecisions": [
      {
        "decision": "What architectural decision was made",
        "rationale": "Why this decision was made",
        "alternatives": ["Alternative options considered"],
        "tradeoffs": "What tradeoffs this decision involves"
      }
    ]
  },
  "components": [
    {
      "id": "unique-component-id",
      "name": "Component Name",
      "type": "service|library|database|queue|cache",
      "responsibility": "What this component is responsible for",
      "technology": {
        "language": "Programming language",
        "framework": "Framework or library",
        "database": "Database if applicable",
        "dependencies": ["List of key dependencies"]
      },
      "interfaces": [
        {
          "type": "REST|GraphQL|gRPC|WebSocket|MessageQueue",
          "description": "Interface description",
          "endpoint": "Endpoint or topic"
        }
      ],
      "dependencies": ["IDs of components this depends on"],
      "constraints": {
        "performance": {
          "maxLatency": "Maximum acceptable latency",
          "minThroughput": "Minimum throughput"
        },
        "scalability": {
          "horizontal": true/false,
          "vertical": true/false,
          "autoScaling": {
            "enabled": true/false,
            "minInstances": 1,
            "maxInstances": 10,
            "targetCPU": 70
          }
        }
      }
    }
  ],
  "dataArchitecture": {
    "databases": [
      {
        "id": "database-id",
        "type": "PostgreSQL|MongoDB|Redis|DynamoDB|etc",
        "purpose": "What data this stores",
        "schemas": ["List of schemas or collections"],
        "replication": "master-slave|multi-master|sharding",
        "backup": "Backup strategy"
      }
    ],
    "caching": {
      "strategy": "Redis|Memcached|CDN|In-memory",
      "layers": ["Where caching is applied"],
      "ttl": "Default time-to-live"
    },
    "dataFlow": [
      {
        "from": "source-component-id",
        "to": "target-component-id",
        "type": "synchronous|asynchronous|streaming",
        "protocol": "HTTP|gRPC|WebSocket|MessageQueue",
        "dataFormat": "JSON|Protocol Buffers|XML"
      }
    ]
  },
  "securityArchitecture": {
    "authentication": {
      "type": "JWT|OAuth2|SAML|Session",
      "provider": "Component that handles auth",
      "tokenExpiry": "Token lifetime",
      "refreshStrategy": "How tokens are refreshed"
    },
    "authorization": {
      "model": "RBAC|ABAC|ACL",
      "implementation": "Where authorization is enforced",
      "policyEngine": "Library or service used"
    },
    "encryption": {
      "inTransit": "TLS version",
      "atRest": "Encryption algorithm",
      "keyManagement": "How keys are managed"
    },
    "compliance": ["OWASP Top 10", "GDPR", "HIPAA", "PCI-DSS"]
  },
  "patterns": {
    "architectural": ["List of architectural patterns used"],
    "design": ["List of design patterns used"],
    "integration": ["List of integration patterns used"],
    "data": ["List of data patterns used"]
  },
  "crossCuttingConcerns": {
    "logging": {
      "framework": "Logging library or service",
      "format": "Log format (JSON, plaintext)",
      "levels": ["error", "warn", "info", "debug"],
      "centralization": "How logs are aggregated"
    },
    "monitoring": {
      "metrics": "Metrics collection system",
      "tracing": "Distributed tracing system",
      "apm": "Application performance monitoring"
    },
    "errorHandling": {
      "strategy": "centralized|distributed",
      "reporting": "Error reporting service",
      "userFacing": "How errors are shown to users"
    }
  },
  "deploymentArchitecture": {
    "platform": "AWS|GCP|Azure|Kubernetes|Docker",
    "containerization": {
      "enabled": true/false,
      "orchestration": "Kubernetes|Docker Swarm|ECS",
      "registry": "Container registry"
    },
    "cicd": {
      "pipeline": "CI/CD platform",
      "stages": ["build", "test", "security-scan", "deploy"],
      "environments": ["dev", "staging", "production"]
    },
    "infrastructure": {
      "iac": "Terraform|CloudFormation|Pulumi",
      "configuration": "How configuration is managed"
    }
  },
  "constraints": {
    "technical": [
      {
        "id": "constraint-id",
        "type": "mandatory|recommended",
        "description": "Constraint description",
        "applies_to": "Which components this applies to"
      }
    ],
    "performance": [
      {
        "id": "perf-constraint-id",
        "type": "mandatory|recommended",
        "description": "Performance constraint",
        "measurement": "How this is measured"
      }
    ],
    "security": [
      {
        "id": "sec-constraint-id",
        "type": "mandatory|recommended",
        "description": "Security constraint",
        "exceptions": ["Any exceptions"]
      }
    ]
  },
  "riskAssessment": {
    "identified": [
      {
        "risk": "Risk description",
        "probability": "low|medium|high",
        "impact": "low|medium|high",
        "mitigation": "How to mitigate this risk"
      }
    ],
    "technicalDebt": [
      {
        "area": "Area of technical debt",
        "effort": "low|medium|high",
        "priority": "low|medium|high",
        "plan": "Plan to address"
      }
    ]
  },
  "costEstimate": {
    "infrastructure": {
      "monthly": 1000,
      "breakdown": {
        "compute": 500,
        "storage": 200,
        "network": 150,
        "other": 150
      }
    },
    "scaling": {
      "formula": "Cost scaling formula",
      "breakpoints": [
        {
          "users": 1000,
          "cost": 1200
        }
      ]
    }
  }
}

Consider the following architectural styles based on requirements:
- Use MICROSERVICES for: high scale, complex domains, independent team deployment
- Use MONOLITHIC for: simple projects, small teams, rapid prototyping
- Use SERVERLESS for: event-driven, sporadic load, cost optimization
- Use EVENT-DRIVEN for: real-time updates, loose coupling, async processing
- Use HYBRID for: mixed requirements, gradual migration

Apply these patterns where appropriate:
- API Gateway pattern for unified API entry point
- Circuit Breaker for resilient service communication
- CQRS for read/write separation in data-intensive apps
- Event Sourcing for audit trails and time-travel debugging
- Repository pattern for data access abstraction
- Factory pattern for object creation
- Observer pattern for event handling

Ensure all components have clear:
- Single responsibility
- Well-defined interfaces
- Explicit dependencies
- Performance constraints
- Security requirements

Return ONLY valid JSON matching the schema above.`;

  return {
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    maxTokens: 8000
  };
}

/**
 * Generate architecture revision prompt
 * @private
 */
function generateRevisionPrompt(context) {
  const { architecture, issues } = context;

  const systemPrompt = `You are a senior software architect reviewing and improving an existing architecture.
You must address specific quality issues while preserving the overall design intent.
Your revisions should be minimal and targeted, fixing only the identified problems.
Return valid JSON following the same schema as the original architecture.`;

  const userPrompt = `Revise this architecture to address the quality gate issues.

ORIGINAL ARCHITECTURE:
${JSON.stringify(architecture, null, 2)}

ISSUES TO ADDRESS:
${issues.map((issue, idx) => `${idx + 1}. ${issue.message || issue}`).join('\n')}

REVISION REQUIREMENTS:
1. Address ALL listed issues
2. Preserve the overall architectural style unless it's the source of issues
3. Keep all valid design decisions
4. Maintain backward compatibility where possible
5. Document any breaking changes
6. Update the riskAssessment section if new risks are introduced

Focus on fixing:
- Missing required sections (add them with appropriate content)
- Inconsistent component references (ensure all IDs match)
- Missing dependencies (add required dependencies)
- Incomplete specifications (fill in missing details)
- Security gaps (add proper security controls)
- Performance issues (add appropriate constraints)

Return the complete revised architecture as valid JSON.
Only change what's necessary to address the issues.`;

  return {
    systemPrompt,
    userPrompt,
    temperature: 0.3,  // Lower temperature for revisions
    maxTokens: 8000
  };
}

module.exports = { generateArchitecturalDesignPrompt };