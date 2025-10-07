# CodeSwarm Application Architecture

**Version:** 2.1
**Last Updated:** 2025-10-07
**Status:** Production-Ready (Experimental)

---

## Overview

CodeSwarm is a **multi-agent autonomous code generation system** that transforms project proposals into production-ready code through intelligent task decomposition, distributed coordination, and budget-controlled API usage. It now supports **diverse application types** beyond web applications.

**Core Concept:** Rather than a single AI generating all code, CodeSwarm employs a **hierarchical two-tier agent architecture** where a main coordinator delegates feature development to specialized feature coordinators, which in turn spawn domain-expert worker agents (backend, frontend, database, testing, etc.) that execute in parallel while respecting dependencies.

**Key Differentiators:**
- **Multi-Application Support (v2.1):** Generates architectures for web, desktop, mobile, CLI, embedded, game, ML, blockchain, and data applications
- **Architectural Design Step (v2.1):** Generates system architecture before feature specification with pattern libraries and deployment strategies
- **Specification-Driven Development (v2.0):** Formal specifications with quality gates prevent poor requirements from propagating
- **Multi-Layered Validation:** Structural, semantic, and integration validation ensure correctness at every level
- **Confidence-Aware Decisions:** Adaptive thresholds based on review confidence prevent false positives
- **Crash Recovery:** Checkpointing and transactional file operations ensure reliability for long-running tasks

---

## System Architecture

### High-Level Architecture (v2.0)

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface                          │
│              CLI (src/cli/index.js)                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Application Layer                          │
│                  (src/app.js)                                │
│  • Project orchestration                                     │
│  • Component lifecycle management                            │
│  • Progress reporting                                        │
└────────────┬────────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼──────────┐  ┌──▼─────────────────────────────────────┐
│ Coordinator  │  │     Core Infrastructure                 │
│   Agent      │  │  ┌──────────────┐  ┌────────────────┐  │
│              │◄─┼─►│ Budget Mgr   │  │ State Manager  │  │
│ • Proposal   │  │  │ (src/core/   │  │ (src/core/     │  │
│   analysis   │  │  │  budget/)    │  │  state/)       │  │
│ • Spec gen★  │  │  └──────┬───────┘  └────────┬───────┘  │
│ • Feature    │  │         │                   │          │
│   breakdown  │  │  ┌──────▼───────────────────▼───────┐  │
│ • Task plan  │  │  │   Communication Hub              │  │
└───┬──────────┘  │  │   (src/core/communication/)      │  │
    │             │  │   • Message routing              │  │
    │             │  │   • State coordination           │  │
    │             │  │   • Lock management              │  │
    │             │  └──────────────┬───────────────────┘  │
    │             └─────────────────┼──────────────────────┘
    │                               │
┌───▼───────────────────────────────▼─────────────────────────┐
│         ★ Specification Layer (NEW v2.0)                     │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Specification    │  │ Spec Quality     │                │
│  │ Agent            │  │ Gate             │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│              Feature Coordinators (Parallel)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Feature-001   │  │Feature-002   │  │Feature-003   │      │
│  │Coordinator   │  │Coordinator   │  │Coordinator   │      │
│  │+ Spec Ref★   │  │+ Spec Ref★   │  │+ Spec Ref★   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────┐
│                  Worker Agent Pool                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │Architect│ │Backend  │ │Frontend │ │Database │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│  │Testing  │ │DevOps   │ │  Docs   │                       │
│  └─────────┘ └─────────┘ └─────────┘                       │
└─────────┬───────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│      ★ Validation & Review Layer (ENHANCED v2.0)            │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Review Agent     │  │ Semantic         │                │
│  │ + Confidence★    │  │ Validator★       │                │
│  └──────────────────┘  └──────────────────┘                │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Integration      │  │ Security/Syntax  │                │
│  │ Validator★       │  │ (existing)       │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────┬───────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│            File System & Validation Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Filesystem    │  │Test Runner   │  │Git Manager   │      │
│  │Transactions  │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  Output: Generated code + Tests + Git history + Reports     │
└─────────────────────────────────────────────────────────────┘

★ = New in v2.0
```

---

## Enhanced Architecture Support (v2.1)

### Application Type Detection

CodeSwarm now automatically detects the type of application being built and tailors the architecture accordingly:

**Supported Application Types:**
- **Web Applications:** Traditional web apps, SPAs, PWAs, APIs
- **Desktop Applications:** Electron, native GUI apps, IDE plugins
- **Mobile Applications:** iOS, Android, React Native, Flutter
- **CLI Applications:** Command-line tools, scripts, system utilities
- **Embedded Systems:** IoT devices, microcontrollers, real-time systems
- **Games:** 2D/3D games, multiplayer, mobile games
- **ML/AI Systems:** Training pipelines, inference servers, edge AI
- **Blockchain:** DApps, smart contracts, crypto wallets
- **Data Applications:** ETL pipelines, analytics platforms, data processing

**Detection Components:**
- `ApplicationTypeDetector` - Analyzes project descriptions and features to identify app type
- `DeploymentStrategySelector` - Selects appropriate deployment methods per app type
- Platform-specific pattern libraries for each application type

### Pattern Libraries

Each application type has its own pattern library with domain-specific architectural patterns:

**Desktop Patterns (`src/patterns/desktop-patterns.js`):**
- Plugin Architecture
- Document-View Pattern
- Workspace Management
- IPC Communication
- Native API Integration

**Mobile Patterns (`src/patterns/mobile-patterns.js`):**
- Clean Architecture
- VIPER, MVP, MVI patterns
- Offline-First
- Sync Adapters
- Biometric Authentication

**Embedded Patterns (`src/patterns/embedded-patterns.js`):**
- RTOS architectures
- Power Management
- Real-time constraints
- Communication protocols (MQTT, CoAP, Modbus)
- Memory optimization

**Game Patterns (`src/patterns/game-patterns.js`):**
- Entity Component System (ECS)
- Game Loop patterns
- Client-side prediction
- Rendering optimization
- Platform-specific patterns

**ML Patterns (`src/patterns/ml-patterns.js`):**
- Feature Store
- Model Serving (online/batch/edge)
- Distributed Training
- Model Monitoring
- MLOps pipelines

**CLI Patterns (`src/patterns/cli-patterns.js`):**
- Command Tree Architecture
- REPL Pattern
- Interactive Prompts
- Progress Indicators
- Pipeline Pattern

### Deployment Strategies

Automatic selection of deployment strategies based on application type:

- **Web:** Cloud platforms, containerization, CI/CD pipelines
- **Desktop:** Installers (MSI, DMG, DEB), app stores, auto-updaters
- **Mobile:** App Store, Google Play, beta testing platforms
- **CLI:** Package managers (npm, pip, homebrew)
- **Embedded:** OTA updates, firmware deployment
- **Games:** Steam, Epic Games Store, platform-specific stores
- **ML:** Model registries, serving infrastructure, edge deployment

### Enhanced Architectural Design Agent

The Architectural Design Agent has been enhanced to:

1. **Detect Application Type:** Automatically identifies the type of application from project requirements
2. **Select Appropriate Patterns:** Chooses patterns from the relevant pattern library
3. **Configure Deployment:** Sets up deployment strategies specific to the app type
4. **Apply Constraints:** Enforces platform-specific constraints (memory for embedded, latency for games, etc.)
5. **Generate Hybrid Architectures:** Handles applications that span multiple types (e.g., web + mobile)

---

## Core Components

### 1. Application Orchestrator

**File:** `src/app.js` (main entry point)

**Purpose:** High-level workflow orchestration and component lifecycle management.

**Responsibilities:**
- Initialize all core systems (budget, state, communication, validation)
- Orchestrate end-to-end project generation flow
- Coordinate between coordinator agents and infrastructure
- Manage progress reporting and error handling
- Execute post-generation tasks (security scan, git init)

**Key Method:**
```javascript
async generate(proposal, outputDir, options) {
  // 1. Initialize systems
  // 2. Validate budget
  // 3. Create backup
  // 4. Execute project (TaskExecutor)
  // 5. Run security scan
  // 6. Initialize git
  // 7. Report completion
}
```

**Integration Points:**
- `TaskExecutor` - Executes task queue
- `SecurityScanner` - Post-generation validation
- `GitManager` - Version control integration
- `ProgressDisplay` - User feedback

---

### 2. Budget Management System

**Files:**
- `src/core/budget/manager.js` - Core budget tracking and enforcement
- `src/core/budget/circuit-breaker.js` - Overrun prevention
- `src/core/budget/cost-estimator.js` - Token/cost estimation

**Purpose:** Real-time cost tracking and enforcement to prevent Claude API budget overruns.

**Architecture:**
```
Budget Manager
├─ validateOperation(operationId, estimatedCost, agentId)
│  ├─ Check circuit breaker status
│  ├─ Verify hard limit (maxBudget)
│  ├─ Verify reserve budget (minReserve)
│  ├─ Reserve cost atomically (mutex-protected)
│  └─ Emit warning if near threshold
│
├─ recordUsage(operationId, actualCost)
│  ├─ Convert reserved → actual
│  ├─ Update totals
│  ├─ Record success in circuit breaker
│  └─ Emit usage event
│
├─ releaseReservation(operationId) [NEW - Fix B3]
│  └─ Handle failed operations without recording usage
│
└─ cleanup()
   └─ Release stuck operations (10+ min timeout)
```

**Critical Features:**
1. **Mutex-Protected Operations** (Fix B1) - Prevents race conditions in concurrent validation
2. **Reserved Budget Tracking** - Distinguishes between reserved vs. actually spent budget
3. **Circuit Breaker** - Blocks operations after 3+ consecutive failures
4. **Priority-Based Allocation** - Critical-path tasks get budget first
5. **Smart Cleanup** - Only releases truly stuck operations (10+ min), not active long-running tasks

**Configuration:**
```javascript
{
  maxBudget: 100.0,           // Total budget limit ($)
  minReserve: 10.0,           // Reserve for cleanup/recovery
  warningThreshold: 0.9,      // Alert at 90% usage
  stepTimeout: 120000         // 2 minutes per operation
}
```

---

### 3. State Management System

**Files:**
- `src/core/state/manager.js` - State coordination with eventual consistency
- `src/core/state/checkpoint.js` - Crash recovery and persistence

**Purpose:** Centralized state management with eventual consistency guarantees and checkpoint-based crash recovery.

**Architecture:**
```
State Manager
├─ read(key, agentId, consistency='eventual')
│  ├─ Queue read operation
│  ├─ Process with vector clocks
│  └─ Return value
│
├─ write(key, value, agentId, expectedVersion)
│  ├─ Queue write operation
│  ├─ Check optimistic lock (version)
│  ├─ Update state with new version
│  ├─ Notify subscribers
│  └─ Update vector clock
│
├─ subscribe(pattern, callback, agentId)
│  └─ Register for state change notifications
│
└─ getConsistentView(agentId)
   └─ Return snapshot of all state
```

**Consistency Model:**
- **Eventual Consistency** - Default mode, fast reads
- **Strong Consistency** - Optional mode with read queue and max 10 retries (Fix C2)
- **Vector Clocks** - Track causality across agents
- **Optimistic Locking** - Version-based conflict detection

**Checkpoint System:**

**File:** `src/core/state/checkpoint.js`

**Purpose:** Enable resume-from-crash capability.

```javascript
createCheckpoint(state) {
  // Extract task data from hierarchical orchestration structure
  // Save: completedTasks, pendingTasks, failedTasks, budget, files
  // Store: .codeswarm/checkpoints/checkpoint-{timestamp}.json
}

loadLatestCheckpoint() {
  // Find most recent checkpoint
  // Restore task queue and budget state
  // Return orchestration state for coordinator
}
```

**Recent Fix (2025-10-06):** Fixed hierarchical task extraction from two-tier coordinator structure. Now properly aggregates tasks from both main coordinator and all feature coordinators.

---

### 4. Communication Hub

**Files:**
- `src/core/communication/hub.js` - Central message router
- `src/core/communication/protocol.js` - Message protocol definitions

**Purpose:** Route messages between agents with priority handling, budget integration, and state coordination.

**Message Types:**
```javascript
MESSAGE_TYPES = {
  READ: 'READ',           // State read request
  WRITE: 'WRITE',         // State write request
  SUBSCRIBE: 'SUBSCRIBE', // Subscribe to state changes
  LOCK: 'LOCK',           // Acquire resource lock
  UNLOCK: 'UNLOCK',       // Release resource lock
  HEARTBEAT: 'HEARTBEAT'  // Agent health check (disabled by default)
}

PRIORITIES = {
  CRITICAL: 0,  // Coordination messages
  HIGH: 1,      // Task execution
  NORMAL: 2,    // State reads
  LOW: 3        // Heartbeats, monitoring
}
```

**Key Enhancement (Deviation 1):**

**Problem:** Original spec had blocking `this.processing` flag preventing concurrent message processing.

**Fix:** Removed blocking flag, enabled true concurrent processing up to `maxConcurrentOperations` (default 50).

**Impact:** System can now handle 20+ concurrent agents without queue saturation.

**Workflow:**
```
Message → Validate → Budget Check → Enqueue (priority sort) → Process
                                      ↓
                              Route to handler:
                              ├─ READ → StateManager.read()
                              ├─ WRITE → LockManager.verify() → StateManager.write()
                              ├─ LOCK → LockManager.acquireLock()
                              └─ SUBSCRIBE → Subscribe to state pattern
```

**Configuration:**
```javascript
{
  maxConcurrentOperations: 50,  // Parallel message limit
  messageTimeout: 30000,         // Message expiry (ms)
  retryAttempts: 3               // Failed message retries
}
```

---

### 5. Distributed Locking

**Files:**
- `src/core/locking/distributed-lock.js` - Lock acquisition and verification
- `src/core/locking/deadlock-detector.js` - Deadlock prevention

**Purpose:** Coordinate concurrent file access with deadlock detection.

**Features:**
- **Timeout-Based Locks** - Auto-release after timeout
- **Deadlock Detection** - Cycle detection in lock dependency graph
- **Lock Verification** - All file operations must verify lock ownership (Fix L6)
- **Hierarchical Ordering** - Reduce deadlock via resource ordering

**API:**
```javascript
acquireLock(resource, agentId, timeout)  // Returns lockId
releaseLock(lockId, agentId)             // Release lock
verifyLock(lockId, agentId)              // Check lock ownership
```

---

### 6. Agent System (Two-Tier Architecture)

**Key Deviation from Spec:** Hierarchical two-tier coordination (Deviation 5)

#### Tier 1: Main Coordinator

**File:** `src/agents/coordinator-agent.js`

**Purpose:** Strategic planning - creates high-level feature breakdown.

**Workflow:**
```
1. analyzeProposal(proposal)
   ├─ Call Claude API with proposal
   ├─ Generate 5-15 high-level features
   ├─ Define feature dependencies
   └─ Return: { features[], projectPlan }

2. _planFeatures(features)
   ├─ Spawn FeatureCoordinator per feature (parallel)
   ├─ Each FC creates file-level tasks
   └─ Aggregate all tasks into global queue

3. _buildTaskQueue()
   ├─ Topological sort (respects dependencies)
   └─ Return execution-ready task queue
```

**Feature Structure:**
```javascript
{
  id: "feature-001",
  name: "Authentication System",
  description: "JWT-based authentication with login/logout",
  priority: "HIGH",
  estimatedFiles: 5,
  dependencies: [],
  requiredAgents: ["backend", "database", "testing"]
}
```

#### Tier 2: Feature Coordinators

**File:** `src/agents/feature-coordinator-agent.js`

**Purpose:** Tactical planning - breaks features into file-level tasks.

**Workflow:**
```
planFeature(feature) {
  // Call Claude API with feature description
  // Create 3-6 file-level tasks per feature
  // Each task creates EXACTLY ONE file (Deviation 4)
  // Return: { tasks[] }
}
```

**Task Structure:**
```javascript
{
  id: "task-001",
  name: "Create auth service",
  description: "Implement AuthService class with login/register",
  agentType: "backend",
  priority: "HIGH",
  dependencies: [],
  files: ["src/auth/auth-service.js"],  // EXACTLY ONE FILE
  estimatedCost: 0.35
}
```

**Why One File Per Task (Deviation 4):**
- Large multi-file JSON responses had ~50% failure rate
- Smaller JSON responses (<2KB) have ~100% success rate
- Better parallelization (multiple tasks run concurrently)
- Clearer failure attribution

#### Tier 3: Worker Agents

**Files:**
- `src/agents/base-agent.js` - Base class with shared functionality
- `src/agents/backend-agent.js` - REST APIs, services, authentication
- `src/agents/frontend-agent.js` - UI components, pages, forms
- `src/agents/database-agent.js` - Schemas, migrations, queries
- `src/agents/testing-agent.js` - Unit, integration, E2E tests
- `src/agents/devops-agent.js` - Docker, CI/CD, deployment
- `src/agents/docs-agent.js` - API docs, README, comments
- `src/agents/architect-agent.js` - System design, refactoring

**Base Agent Capabilities:**
```javascript
class BaseAgent extends EventEmitter {
  // Core execution
  async executeTask(task, context)
  async callClaude(messages, options)

  // Retry logic
  async retryWithBackoff(operation, attempt)

  // State management
  async readState(key)
  async writeState(key, value)

  // Communication
  async sendMessage(type, payload)
}
```

**Agent Selection:**
Task's `agentType` field determines which specialist agent executes it.

#### Specification Agent (v2.0)

**File:** `src/agents/specification-agent.js`

**Purpose:** Generate formal specifications for features before implementation.

**Specification Structure:**
```javascript
{
  specId: "spec-feature-001-1696598400000",
  featureId: "feature-001",
  feature: { /* feature details */ },
  version: 1,
  specification: {
    apiContracts: [
      {
        endpoint: "/api/users",
        method: "POST",
        description: "Create new user",
        requestSchema: { /* JSON schema */ },
        responseSchema: {
          success: { status: 200, body: { /* schema */ } },
          error: { status: 400, body: { /* schema */ } }
        },
        authentication: "required"
      }
    ],
    dataSchemas: [
      {
        name: "User",
        type: "object",
        properties: {
          id: { type: "string", required: true },
          email: { type: "string", required: true }
        }
      }
    ],
    acceptanceCriteria: [
      {
        id: "AC-001",
        description: "User can register with valid email",
        expectedBehavior: "POST /api/users returns 201 with user object",
        verificationMethod: "integration_test",
        testable: true
      }
    ],
    interfaces: [
      {
        name: "UserService",
        type: "class",
        methods: [
          {
            name: "createUser",
            parameters: [{ name: "userData", type: "object" }],
            returns: { type: "Promise<User>" },
            throws: ["ValidationError", "DuplicateEmailError"]
          }
        ]
      }
    ],
    errorHandling: [
      {
        errorType: "ValidationError",
        condition: "Invalid input data",
        retry: false,
        userMessage: "Please check your input and try again"
      }
    ],
    securityRequirements: [
      {
        requirement: "Passwords must be hashed with bcrypt",
        verification: "Check for bcrypt.hash() in code"
      }
    ]
  },
  createdAt: 1696598400000
}
```

**Methods:**
- `generateSpecification(feature, context)` - Generate new spec
- `reviseSpecification(spec, feedback)` - Improve spec based on quality gate feedback
- `saveSpecification(spec)` - Persist to state
- `loadSpecification(specId)` - Retrieve from state

**Integration:**
- Called by coordinator's `generateSpecifications()` method
- Uses Claude API with temperature 0.3 for precision
- Specifications stored in `coordinator.orchestration.specifications`

#### Specification Quality Gate (v2.0)

**File:** `src/validation/spec-quality-gate.js`

**Purpose:** Validate specification quality before acceptance.

**Quality Dimensions:**
1. **Completeness (35%):** All required sections present
   - Acceptance criteria (≥2 required)
   - API contracts (if feature needs API)
   - Data schemas (if provided)

2. **Consistency (30%):** No contradictions
   - API contracts reference defined schemas
   - Interfaces reference defined error types
   - Acceptance criteria reference defined endpoints

3. **Testability (20%):** Criteria are measurable
   - Has expected behavior
   - Has verification method
   - Not marked as untestable

4. **Coverage (10%):** All aspects covered
   - Database features have schemas
   - APIs have error handling
   - Security features have security requirements

5. **Clarity (5%):** Unambiguous language
   - Descriptions ≥10 characters
   - No vague words (should, might, could, maybe)

**Decision Logic:**
- **Score ≥80%:** Accept (spec is good)
- **Score 60-80%:** Revise with feedback
- **Score <60%:** Regenerate from scratch
- **Max 3 attempts** per specification

**Output:**
```javascript
{
  overallScore: 85,
  passed: true,
  recommendation: 'accept',
  checks: [ /* individual check results */ ],
  criticalIssues: 0,
  totalIssues: 2
}
```

---

### 7. Task Execution System

**File:** `src/tasks/task-executor.js`

**Purpose:** Execute task queue with dependency resolution, validation, and error handling.

**Execution Flow (v2.0):**
```
executeProject(proposal, projectInfo) {
  1. Coordinator.analyzeProposal() → features

  ★ 2. Coordinator.generateSpecifications() → validated specs (NEW)
       ├─ For each feature:
       │  ├─ SpecAgent.generateSpecification()
       │  ├─ QualityGate.validateSpec() → score
       │  ├─ If score ≥ 80%: Accept
       │  ├─ If score 60-80%: Revise
       │  └─ If score < 60%: Regenerate (max 3 attempts)
       └─ Store in orchestration.specifications

  3. Coordinator._planFeatures() → tasks (aggregated from FCs)
  4. Topological sort (dependency order)
  5. For each task:
     ├─ Budget check
     ├─ Lock file
     ├─ Execute with appropriate agent → generated code
     ├─ Validate (security, syntax, tests)
     │
     ★ ├─ Review against spec (NEW v2.0)
     │  ├─ ReviewAgent.reviewImplementation()
     │  │  ├─ Structural review
     │  │  ├─ Semantic validation (Claude API)
     │  │  └─ Confidence scoring
     │  ├─ Combined score = 60% structural + 40% semantic
     │  └─ Decision based on confidence:
     │     ├─ High confidence: Accept ≥95%, Fix 70-95%, Regen <70%
     │     └─ Low confidence: Accept ≥98%, Fix 85-98%, Regen <85%
     │
     ├─ Write file (if accepted)
     ├─ Git commit
     ├─ Checkpoint
     └─ Release lock

  ★ 6. Every 5 tasks: Integration validation (NEW v2.0)
     └─ IntegrationValidator.validateIntegration()
        ├─ API contract compatibility
        ├─ Schema consistency
        ├─ Dependency chain
        └─ Integration tests

  7. Return summary
}
```

**Error Handling:**
```
Task Failure → _handleTaskFailure() → _attemptRecovery()
                                       ├─ Retry (same agent)
                                       ├─ Reassign (different agent)
                                       ├─ Breakdown (split into subtasks)
                                       ├─ Skip (mark non-critical)
                                       └─ Escalate (ask user)

Circuit Breaker: Max 3 attempts per task
```

**Proposal Parser:**

**File:** `src/tasks/proposal-parser.js`

Extracts structured info from text proposals:
- Project title
- Description
- Tech stack
- Key features
- Requirements

---

### 8. Validation System

#### Security Scanner

**File:** `src/validation/security-scanner.js`

**Purpose:** Pattern-based security vulnerability detection.

**Checks:**
- Hardcoded secrets (AWS keys, API keys, passwords)
- SQL injection (string concatenation in queries)
- XSS vulnerabilities (innerHTML, dangerouslySetInnerHTML)
- Command injection (exec, eval with user input)
- Path traversal (.. in file paths)
- Insecure configurations (CORS, SSL)

**Output:**
```javascript
{
  issuesFound: 3,
  issues: [
    {
      file: "src/auth.js",
      line: 45,
      type: "SECRET",
      severity: "HIGH",
      pattern: "AWS Access Key",
      snippet: "const key = 'AKIAIOSFODNN7EXAMPLE';"
    }
  ]
}
```

#### Syntax Checker

**File:** `src/validation/syntax-checker.js`

**Purpose:** ESLint-based syntax and code quality validation.

**Checks:**
- Syntax errors
- Undefined variables
- Unused variables
- Code quality rules (eqeqeq, no-eval, curly)

**Languages:** JavaScript, TypeScript

#### Python Checker

**File:** `src/validation/python-checker.js`

**Purpose:** Pylint-based Python validation.

**Checks:**
- Python syntax errors
- PEP 8 compliance
- Code quality issues

#### Test Runner

**File:** `src/validation/test-runner.js`

**Purpose:** Execute generated tests and report coverage.

**Supported:**
- Jest (JavaScript/TypeScript)
- Pytest (Python)

**Output:**
```javascript
{
  passed: true,
  totalTests: 42,
  passedTests: 42,
  failedTests: 0,
  coverage: {
    lines: 87,
    statements: 89,
    functions: 85,
    branches: 78
  }
}
```

#### Review Agent (v2.0)

**File:** `src/agents/review-agent.js`

**Purpose:** Review generated code against specifications with confidence scoring.

**Features:**
- **Structural Review:** Validates API contracts, interfaces, acceptance criteria, data schemas, error handling
- **Confidence Scoring:** 5-factor confidence calculation (parsability, spec quality, reviewability, detectability, complexity)
- **Adaptive Thresholds:** Conservative decisions when confidence is low
- **Gap Detection:** Identifies missing or incomplete implementations

**Confidence Factors:**
```javascript
{
  parsability: 0.25,      // Can code be parsed to AST?
  specQuality: 0.30,      // Is spec complete?
  reviewability: 0.20,    // Is task simple?
  detectability: 0.15,    // Are gaps obvious?
  complexity: 0.10        // Code complexity
}
```

**Decision Logic:**
- **High Confidence (≥70%):**
  - Accept: Score ≥95%
  - Fix: Score 70-95%
  - Regenerate: Score <70%
- **Low Confidence (<70%):**
  - Accept: Score ≥98% (conservative)
  - Fix: Score 85-98%
  - Regenerate: Score <85%

#### Semantic Validator (v2.0)

**File:** `src/validation/semantic-validator.js`

**Purpose:** Validate business logic correctness beyond structural checks.

**Validation Dimensions:**
1. **Business Logic (40%):** Claude API-based correctness reasoning against acceptance criteria
2. **Edge Cases (20%):** Null/undefined, empty inputs, boundaries, negative numbers, concurrency
3. **Error Recovery (20%):** Try/catch, retries, graceful degradation
4. **Security Properties (15%):** Password hashing, SQL injection, XSS prevention
5. **Performance (5%):** Nested loops, infinite loops, inefficient patterns

**Integration:**
- Combined with structural review: 60% structural + 40% semantic
- Falls back gracefully on API errors (neutral 50% score)
- Uses Claude API with low temperature (0.2) for analytical precision

#### Integration Validator (v2.0)

**File:** `src/validation/integration-validator.js`

**Purpose:** Validate that completed tasks work together at system level.

**Validation Layers:**
1. **API Contract Compatibility:** Producer-consumer schema matching
2. **Schema Consistency:** Same schema name = same structure across specs
3. **Dependency Chain:** All dependencies satisfied and completed
4. **Data Flow Integrity:** Type compatibility across data flows (placeholder)
5. **Integration Tests:** Runs E2E tests if available

**Trigger:** Designed to run every N tasks (e.g., every 5 tasks)

**Issue Severity:**
- **Critical:** Schema conflicts, missing dependencies (blocks execution)
- **High:** Incomplete dependencies (warns)
- **Medium/Low:** Logged for review

---

### 9. Filesystem Management

#### Transaction Manager

**File:** `src/filesystem/transaction-manager.js`

**Purpose:** Atomic file operations with rollback capability.

**Features:**
- **Atomic Writes** - All-or-nothing file creation
- **Rollback** - Restore from backup on failure
- **Lock Integration** - Verify lock before write
- **Transaction Log** - Audit trail of all operations

#### Backup System

**File:** `src/filesystem/backup.js`

**Purpose:** Full directory backups before generation starts.

**Storage:** `.codeswarm/backups/backup-{timestamp}/`

#### Git Manager

**File:** `src/filesystem/git-manager.js`

**Purpose:** Git integration for version control.

**Features:**
- Auto-initialize repository
- Per-task commits with descriptive messages
- Conventional commit format
- Support for existing repositories

**Commit Format:**
```
feat(auth): implement JWT authentication service

- Add AuthService class with login/register methods
- Add password hashing with bcrypt
- Add JWT token generation

🤖 Generated with CodeSwarm
Task: task-001
Agent: backend-agent-001
```

---

### 10. Claude API Integration

**File:** `src/api/claude-client.js`

**Purpose:** Budget-validated API client for Claude.

**Key Features:**
```javascript
async sendMessage(messages, agentId, options) {
  1. Estimate token count
  2. Validate budget (BudgetManager.validateOperation)
  3. Call Claude API
  4. Record actual usage (BudgetManager.recordUsage)
  5. Return response + metadata
}
```

**Budget Integration:**
- Pre-validates every API call
- Tracks estimated vs actual cost
- Throws BudgetError if limit exceeded
- Releases reservation on failure

**Model:** `claude-3-5-sonnet-20241022` (default)

**Cost Tracking:**
```javascript
{
  inputTokens: 1523,
  outputTokens: 892,
  totalTokens: 2415,
  cost: 0.036   // $0.036
}
```

---

### 11. CLI Interface

**File:** `src/cli/index.js`

**Commands:**
```bash
# Setup wizard (interactive)
codeswarm setup

# Start generation
codeswarm start --proposal ./proposal.txt --output ./my-project --budget 10

# Resume from checkpoint
codeswarm start --output ./my-project --resume

# Check status
codeswarm status --output ./my-project

# Run validation
codeswarm validate --output ./my-project

# Clean temporary files
codeswarm clean --output ./my-project
```

**Progress Display:**

**File:** `src/cli/progress-display.js`

Real-time progress UI showing:
- Current phase (analysis, planning, execution, validation)
- Task completion (15/42 completed)
- Budget usage ($23.45 / $100.00)
- Current task details
- Errors/warnings

**Modes:**
- **Verbose** - Detailed agent logs
- **Concise** - Summary only (default)

---

## Data Flow

### Complete Generation Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER INPUT                                                │
│    proposal.txt + budget + output directory                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 2. APPLICATION INITIALIZATION (app.js)                       │
│    • Create BudgetManager(budget)                            │
│    • Create StateManager()                                   │
│    • Create LockManager()                                    │
│    • Create CommunicationHub(state, lock, budget)            │
│    • Create backup of output directory                       │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 3. PROPOSAL ANALYSIS (coordinator-agent.js)                  │
│    CoordinatorAgent.analyzeProposal(proposal)                │
│    → Claude API call (strategic planning)                    │
│    → Output: 5-15 features with dependencies                 │
│    Budget: ~$0.30-0.50                                       │
│    Time: ~30 seconds                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 4. FEATURE PLANNING (feature-coordinator-agent.js)           │
│    Parallel: Spawn FeatureCoordinator per feature            │
│    Each: FeatureCoordinator.planFeature(feature)             │
│    → Claude API call (tactical planning)                     │
│    → Output: 3-8 file-level tasks per feature                │
│    Budget: ~$0.20-0.30 per feature                           │
│    Time: ~20 seconds per feature (parallel)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 5. TASK QUEUE BUILDING (coordinator-agent.js)                │
│    Aggregate all tasks from all FeatureCoordinators          │
│    Topological sort (respect dependencies)                   │
│    → Output: Execution-ready task queue (40+ tasks)          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 6. TASK EXECUTION LOOP (task-executor.js)                    │
│    For each task in queue:                                   │
│      ├─ BudgetManager.validateOperation() ✓                  │
│      ├─ LockManager.acquireLock(file) ✓                      │
│      ├─ Get appropriate WorkerAgent (backend/frontend/etc)   │
│      ├─ WorkerAgent.executeTask(task)                        │
│      │  └─ Claude API call (generate code)                   │
│      │     Budget: ~$0.20-0.40                               │
│      │     Time: ~30-60 seconds                              │
│      ├─ Validate generated code:                             │
│      │  ├─ SecurityScanner.scan(code) ✓                      │
│      │  ├─ SyntaxChecker.check(code) ✓                       │
│      │  └─ TestRunner.run(tests) ✓                           │
│      ├─ Write file (TransactionManager.write)                │
│      ├─ Git commit (GitManager.commit)                       │
│      ├─ Checkpoint (CheckpointManager.createCheckpoint)      │
│      └─ LockManager.releaseLock() ✓                          │
│                                                               │
│    Parallelization: Up to maxConcurrentTasks (default 3)     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 7. POST-GENERATION VALIDATION (app.js)                       │
│    • SecurityScanner.scanAll() - Full project scan           │
│    • Save security report                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 8. COMPLETION & REPORTING                                    │
│    • Display summary:                                        │
│      - Tasks completed: 42/42                                │
│      - Budget used: $47.23 / $100.00                         │
│      - Time elapsed: 23 minutes                              │
│      - Security issues: 2 (view report)                      │
│    • Output directory ready for use                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Patterns

### 1. Circuit Breaker Pattern

**Location:** `src/core/budget/circuit-breaker.js`

**Purpose:** Prevent cascading failures in budget system.

**Logic:**
```
Operation Failure → Increment failure count
If failures >= 3 → Open circuit (block all operations)
Wait 30 seconds → Half-open (allow one test)
Success → Close circuit (normal operation)
```

### 2. Event-Driven Architecture

**Pattern:** Most core components extend `EventEmitter`

**Events:**
```javascript
// BudgetManager
emit('budgetWarning', { usage, threshold })
emit('circuitBreakerOpen', { failures })
emit('usageRecorded', { operationId, actualCost })

// StateManager
emit('subscriptionError', { subscriptionId, error })

// CommunicationHub
emit('operation:complete', { type, agentId, duration })
emit('message:processed', { message, result })
```

**Benefit:** Loose coupling, extensibility, monitoring

### 3. Optimistic Locking

**Location:** `src/core/state/manager.js`

**Pattern:**
```javascript
// Read with version
const entry = await stateManager.read('user:123');
// version = 5

// Modify locally
entry.value.name = 'Alice';

// Write with expected version
await stateManager.write('user:123', entry.value, agentId, 5);
// If current version != 5 → ConcurrencyError
// If matches → version becomes 6
```

**Benefit:** Conflict detection without locks

### 4. Vector Clocks

**Location:** `src/core/state/manager.js`

**Purpose:** Track causality in distributed agent system.

```javascript
vectorClock = {
  'coordinator-001': 15,
  'backend-001': 8,
  'frontend-001': 12
}

// On every state operation, increment agent's clock
```

**Benefit:** Detect concurrent vs. causal writes

### 5. Retry with Exponential Backoff

**Location:** `src/agents/base-agent.js`

```javascript
async retryWithBackoff(operation, attempt = 1) {
  try {
    return await operation();
  } catch (error) {
    if (attempt >= maxAttempts) throw error;

    const delay = baseDelay * Math.pow(2, attempt - 1);
    await sleep(delay);

    return this.retryWithBackoff(operation, attempt + 1);
  }
}
```

**Usage:** Network errors, API failures, transient issues

**Config:** Max 3 retries, 1s → 2s → 4s delays

---

## File Organization

### Directory Structure

```
src/
├── agents/                      # Agent implementations
│   ├── base-agent.js           # Base class (shared logic)
│   ├── coordinator-agent.js    # Main coordinator (Tier 1)
│   ├── feature-coordinator-agent.js  # Feature coordinators (Tier 2)
│   ├── specification-agent.js  # ★ Spec generation (v2.0)
│   ├── review-agent.js         # ★ Code review + confidence (v2.0)
│   ├── backend-agent.js        # Backend specialist
│   ├── frontend-agent.js       # Frontend specialist
│   ├── database-agent.js       # Database specialist
│   ├── testing-agent.js        # Testing specialist
│   ├── devops-agent.js         # DevOps specialist
│   ├── docs-agent.js           # Documentation specialist
│   ├── architect-agent.js      # Architecture specialist
│   └── prompts/                # Agent-specific prompts
│       ├── coordinator-agent.js
│       ├── feature-coordinator-agent.js
│       ├── backend-agent.js
│       └── ... (one per agent)
│
├── api/
│   └── claude-client.js        # Budget-integrated API client
│
├── cli/
│   ├── index.js                # CLI entry point
│   ├── progress-display.js     # Real-time progress UI
│   ├── commands/               # Command handlers
│   └── ui/                     # UI components
│
├── core/
│   ├── budget/
│   │   ├── manager.js          # Budget tracking & enforcement
│   │   ├── circuit-breaker.js  # Overrun prevention
│   │   └── cost-estimator.js   # Token/cost estimation
│   ├── communication/
│   │   ├── hub.js              # Message router
│   │   └── protocol.js         # Message protocol
│   ├── locking/
│   │   ├── distributed-lock.js # Lock manager
│   │   └── deadlock-detector.js # Deadlock prevention
│   └── state/
│       ├── manager.js          # State coordination
│       └── checkpoint.js       # Crash recovery
│
├── filesystem/
│   ├── transaction-manager.js  # Atomic file operations
│   ├── backup.js               # Directory backups
│   ├── git-manager.js          # Git integration
│   └── operations.js           # File I/O utilities
│
├── tasks/
│   ├── task-executor.js        # Task execution orchestration
│   └── proposal-parser.js      # Proposal text parsing
│
├── validation/
│   ├── spec-quality-gate.js    # ★ Spec quality validation (v2.0)
│   ├── spec-validator.js       # ★ AST parsing helpers (v2.0)
│   ├── semantic-validator.js   # ★ Semantic correctness (v2.0)
│   ├── integration-validator.js # ★ Cross-task validation (v2.0)
│   ├── security-scanner.js     # Security vulnerability detection
│   ├── syntax-checker.js       # ESLint validation
│   ├── python-checker.js       # Pylint validation
│   ├── test-runner.js          # Test execution (Jest)
│   └── pytest-runner.js        # Python test execution
│
├── utils/
│   ├── errors.js               # Custom error types
│   └── validation.js           # Validation utilities
│
└── app.js                       # Main application orchestrator
```

### Output Directory Structure

```
output-directory/
├── src/                         # Generated source code
│   ├── auth/
│   │   ├── auth-service.js
│   │   └── middleware.js
│   ├── api/
│   │   └── routes.js
│   └── ...
│
├── tests/                       # Generated tests
│   ├── auth.test.js
│   └── ...
│
├── .git/                        # Git repository
│   └── ... (one commit per task)
│
└── .codeswarm/                  # CodeSwarm metadata
    ├── checkpoints/             # Crash recovery points
    │   └── checkpoint-{timestamp}.json
    ├── backups/                 # Pre-generation backups
    │   └── backup-{timestamp}/
    ├── validation/              # Validation reports
    │   ├── security-report.json
    │   └── syntax-report.json
    ├── state.json               # Final state snapshot
    └── config.json              # Project-specific config
```

---

## Configuration

### Environment Variables

```bash
# Claude API
CLAUDE_API_KEY=sk-ant-...               # Required
CLAUDE_MODEL=claude-3-5-sonnet-20241022 # Default model

# Budget
BUDGET_LIMIT=100.0                      # Max budget ($)
MIN_BUDGET_RESERVE=10.0                 # Reserve for recovery
BUDGET_WARNING_THRESHOLD=0.9            # Alert at 90%

# Concurrency
MAX_CONCURRENT_AGENTS=10                # Parallel agents
MAX_CONCURRENT_TASKS=3                  # Parallel task execution
MAX_CONCURRENT_OPERATIONS=50            # Parallel messages (hub)

# Timeouts
OPERATION_TIMEOUT=120000                # 2 minutes
MESSAGE_TIMEOUT=30000                   # 30 seconds
LOCK_TIMEOUT=300000                     # 5 minutes

# Features
ENABLE_CHECKPOINTS=true                 # Crash recovery
ENABLE_GIT_INTEGRATION=true             # Git commits
ENABLE_VALIDATION=true                  # Security/syntax checks
ENABLE_TESTING=true                     # Run generated tests
```

### Runtime Configuration

**File:** `.codeswarm/config.json` (per-project)

```json
{
  "project": {
    "name": "my-ecommerce-api",
    "techStack": ["Node.js", "Express", "PostgreSQL"],
    "outputDir": "/path/to/output"
  },
  "generation": {
    "budget": 50.0,
    "budgetUsed": 23.45,
    "tasksCompleted": 15,
    "tasksPending": 27,
    "tasksFailed": 0
  },
  "agents": {
    "maxConcurrent": 5,
    "enabledTypes": ["backend", "database", "testing"]
  }
}
```

---

## Performance Characteristics

### Typical Project (40 tasks)

| Phase | Duration | Budget | Bottleneck |
|-------|----------|--------|------------|
| Proposal Analysis | 30s | $0.40 | Claude API |
| Feature Planning (parallel) | 20s | $1.50 | Claude API |
| Task Execution | 40min | $15-25 | Claude API + validation |
| Validation | 5min | $0 | Syntax/security scanning |
| **Total** | **~45min** | **$17-27** | **Claude API latency** |

### Scaling

- **Small project** (10 tasks): ~15 minutes, ~$8
- **Medium project** (40 tasks): ~45 minutes, ~$20
- **Large project** (100 tasks): ~2 hours, ~$50

### Concurrency

- **Agents:** 10 concurrent (configurable)
- **Tasks:** 3 concurrent (configurable)
- **Messages:** 50 concurrent (hub capacity)

### Cost Breakdown

- **Coordination:** ~10% (proposal analysis, feature planning)
- **Implementation:** ~80% (task execution)
- **Validation:** ~10% (quality checks)

---

## Error Handling

### Error Types

**File:** `src/utils/errors.js`

```javascript
class CodeSwarmError extends Error              // Base error
class BudgetError extends CodeSwarmError        // Budget exceeded
class CostOverrunError extends BudgetError      // Hard limit exceeded
class StateError extends CodeSwarmError         // State operation failed
class ConcurrencyError extends StateError       // Optimistic lock conflict
class CommunicationError extends CodeSwarmError // Message routing failed
class TimeoutError extends CommunicationError   // Operation timeout
class APIError extends CodeSwarmError           // Claude API failure
class ValidationError extends CodeSwarmError    // Input validation failed
```

### Recovery Strategies

| Error Type | Strategy | Max Retries |
|------------|----------|-------------|
| Network error | Exponential backoff | 3 |
| API rate limit | Wait + retry | 3 |
| Budget exceeded | Fail fast (circuit breaker) | 0 |
| Validation failure | Regenerate task | 3 |
| Lock timeout | Release + retry | 2 |
| Deadlock detected | Release all + retry with ordering | 2 |
| State conflict | Retry with updated version | 3 |

### Crash Recovery

**Checkpoint Frequency:** After every task completion

**Resume Process:**
```javascript
// Load latest checkpoint
const checkpoint = await CheckpointManager.loadLatestCheckpoint();

// Restore coordinator state
coordinator.restore(checkpoint.orchestration);

// Restore budget
budgetManager.restore(checkpoint.budgetUsed, checkpoint.budgetRemaining);

// Continue from pending tasks
await executor.executeProject(proposal, {
  resumeFrom: checkpoint,
  skipCompleted: checkpoint.completedTasks
});
```

---

## Testing Strategy

### Unit Tests

- Budget manager operations
- State manager consistency
- Lock manager deadlock detection
- Message protocol validation
- Security scanner pattern matching

### Integration Tests

- End-to-end project generation (simple)
- Checkpoint save/restore
- Agent coordination
- Concurrent task execution

### Test Files

```
tests/
├── unit/
│   ├── budget-manager.test.js
│   ├── state-manager.test.js
│   ├── lock-manager.test.js
│   └── security-scanner.test.js
│
└── integration/
    ├── full-generation.test.js
    ├── checkpoint-recovery.test.js
    └── concurrent-agents.test.js
```

---

## Known Limitations

### Current Gaps

1. **CLI Wizard Incomplete** - Setup requires manual `.env` configuration
2. **No Specification Generation** - Tasks use descriptions, not formal specs
3. **No Post-Execution Review** - Validation checks code quality, not spec compliance
4. **No Fix Mode** - Always regenerates on failure, no incremental fixes
5. **Limited AST Analysis** - No deep code structure verification

### Workarounds

1. **Manual Config** - Use `.env.example` as template
2. **Detailed Descriptions** - Feature coordinators create detailed task descriptions
3. **Validation Suite** - Security + syntax + tests provide quality gates
4. **Circuit Breaker** - Limits retry waste (max 3 attempts)

### Planned Enhancements

See `SPECIFICATION_AND_REVIEW_SYSTEM_DESIGN.md` for:
- Formal specification generation
- Implementation review agent
- Fix mode for minor corrections
- AST-based contract verification

---

## Dependencies

### Core Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.9.1",        // Claude API client
  "commander": "^11.1.0",                // CLI framework
  "inquirer": "^9.2.12",                 // Interactive prompts
  "chalk": "^5.3.0",                     // Terminal colors
  "ora": "^7.0.1",                       // Progress spinners
  "eslint": "^8.55.0",                   // JavaScript linting
  "dotenv": "^16.3.1",                   // Environment variables
  "uuid": "^9.0.1"                       // Unique IDs
}
```

### Optional Dependencies

```json
{
  "jest": "^29.7.0",                     // JavaScript testing
  "pytest": "^7.4.3"                     // Python testing (via subprocess)
}
```

---

## Security Considerations

### API Key Protection

- Store in `.env` file (not committed)
- Validate on startup
- Never log API keys
- Rotate keys regularly

### Generated Code Safety

- Security scanner checks for common vulnerabilities
- Syntax validation before execution
- Sandboxed file operations (transaction manager)
- Backup before any generation

### Budget Protection

- Hard limit enforcement (circuit breaker)
- Reserved budget tracking
- Real-time cost monitoring
- Alert at warning threshold (90%)

---

## Monitoring & Observability

### Logs

All components log to console with structured format:

```
[ComponentName] Message
[BudgetManager] Operation validated: task-001 ($0.35)
[StateManager] Write completed: feature-001 (version 3)
[TaskExecutor] Task completed: task-001 (45.2s, $0.38)
```

### Metrics

Track in real-time:
- Budget: used, reserved, available
- Tasks: completed, pending, failed
- Agents: active, idle
- Performance: avg task time, API latency

### Reporting

**Files:**
- `.codeswarm/state.json` - Final state snapshot
- `.codeswarm/validation/security-report.json` - Security scan results
- `IMPLEMENTATION.md` - Auto-generated implementation report

---

## Getting Started

### Installation

```bash
git clone <repository>
cd dev-system-with-cr
npm install
```

### Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit with your API key
nano .env
# Set: CLAUDE_API_KEY=sk-ant-...
```

### Basic Usage

```bash
# Create proposal
echo "Build a REST API for a todo list with Express and PostgreSQL" > proposal.txt

# Generate code
node src/cli/index.js start \
  --proposal ./proposal.txt \
  --output ./my-todo-api \
  --budget 20

# Output will be in ./my-todo-api/
```

### Resume from Crash

```bash
# If generation crashes, resume from checkpoint
node src/cli/index.js start \
  --output ./my-todo-api \
  --resume
```

---

## Glossary

- **Agent** - Autonomous AI entity executing tasks (coordinator or worker)
- **Budget** - Dollar limit for Claude API usage
- **Checkpoint** - Saved state for crash recovery
- **Circuit Breaker** - Failure prevention pattern (blocks after 3 failures)
- **Feature** - High-level module (e.g., "Authentication System")
- **Feature Coordinator** - Tier-2 agent that plans features
- **Lock** - Exclusive file access token
- **Main Coordinator** - Tier-1 agent that analyzes proposals
- **Message** - Communication between agents via hub
- **Optimistic Locking** - Conflict detection via version comparison
- **Task** - File-level unit of work (creates one file)
- **Vector Clock** - Causality tracking in distributed system
- **Worker Agent** - Tier-3 specialist agent (backend, frontend, etc.)

---

## References

- **IMPLEMENTATION.md** - Full spec with code examples and architecture details
- **SPEC_COMPLIANCE_AUDIT.md** - Comparison of implementation to original spec (85% compliant)
- **SPEC_COMPLIANCE_SUMMARY.md** - Concise compliance summary
- **STATE_MANAGEMENT_ANALYSIS.md** - Deep dive into checkpoint system
- **SPECIFICATION_AND_REVIEW_SYSTEM_DESIGN.md** - Planned enhancements (spec generation, review, fix mode)
- **README.md** - Quick start guide

---

## Version History

- **2.0** (2025-10-06) - Specification and Review System
  - **Enhancement 1: Specification Quality Gate**
    - Formal specification generation before implementation
    - 5-factor quality validation (completeness, consistency, testability, coverage, clarity)
    - 3-attempt retry with revise/regenerate logic
    - Files: `spec-quality-gate.js`, `specification-agent.js`

  - **Enhancement 2: Review Confidence Scoring**
    - Structural code review against specifications
    - 5-factor confidence scoring (parsability, spec quality, reviewability, detectability, complexity)
    - Adaptive decision thresholds based on confidence
    - Files: `review-agent.js`, `spec-validator.js`

  - **Enhancement 3: Semantic Correctness Validation**
    - Business logic validation using Claude API
    - 5-dimensional analysis (business logic, edge cases, error recovery, security, performance)
    - Combined scoring: 60% structural + 40% semantic
    - File: `semantic-validator.js`

  - **Enhancement 5: Cross-Task Integration Validation**
    - System-level compatibility checks
    - 4-layer validation (API compatibility, schema consistency, dependency chain, data flow)
    - Runs every N tasks (recommended: every 5 tasks)
    - File: `integration-validator.js`

  - **Quality Improvements (Expected):**
    - Spec compliance: +35-45%
    - Semantic errors: -40%
    - API contract bugs: -50%
    - Integration bugs: -60%
    - False confidence: Eliminated

  - **Performance Impact:**
    - Budget: +15-20% (acceptable for quality gain)
    - Time: +20-25% (acceptable for quality gain)

  - **Modified Files:**
    - `coordinator-agent.js`: Added `generateSpecifications()` method
    - `task-executor.js`: Added `_reviewAgainstSpec()` and `_validateIntegration()` methods

- **1.0** (2025-10-06) - Initial production release
  - Two-tier coordination architecture
  - Checkpoint system fixed
  - Concurrent message processing
  - One-file-per-task enforcement
  - 7 specialist agents
  - Comprehensive validation suite

---

**End of Documentation**

**See Also:**
- `CHANGELOG.md` - Detailed change log with migration guide
- `SPECIFICATION_AND_REVIEW_SYSTEM_DESIGN.md` - Full design specification for v2.0 enhancements
