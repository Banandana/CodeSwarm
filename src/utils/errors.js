/**
 * Custom error types for CodeSwarm
 */

class CodeSwarmError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = Date.now();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

class BudgetError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'BUDGET_ERROR', context);
  }
}

class BudgetValidationError extends BudgetError {
  constructor(message, context = {}) {
    super(message, { ...context, type: 'VALIDATION' });
    this.code = 'BUDGET_VALIDATION_ERROR';
  }
}

class CostOverrunError extends BudgetError {
  constructor(message, context = {}) {
    super(message, { ...context, type: 'OVERRUN' });
    this.code = 'COST_OVERRUN_ERROR';
  }
}

class StateError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'STATE_ERROR', context);
  }
}

class ConcurrencyError extends StateError {
  constructor(message, context = {}) {
    super(message, { ...context, type: 'CONCURRENCY' });
    this.code = 'CONCURRENCY_ERROR';
  }
}

class LockError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'LOCK_ERROR', context);
  }
}

class DeadlockError extends LockError {
  constructor(message, context = {}) {
    super(message, { ...context, type: 'DEADLOCK' });
    this.code = 'DEADLOCK_ERROR';
  }
}

class TimeoutError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'TIMEOUT_ERROR', context);
  }
}

class CommunicationError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'COMMUNICATION_ERROR', context);
  }
}

class AgentError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'AGENT_ERROR', context);
  }
}

class TaskError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'TASK_ERROR', context);
  }
}

class ValidationError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'VALIDATION_ERROR', context);
  }
}

class FileSystemError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'FILESYSTEM_ERROR', context);
  }
}

class APIError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'API_ERROR', context);
  }
}

class ConfigurationError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'CONFIGURATION_ERROR', context);
  }
}

class SecurityError extends CodeSwarmError {
  constructor(message, context = {}) {
    super(message, 'SECURITY_ERROR', context);
  }
}

module.exports = {
  CodeSwarmError,
  BudgetError,
  BudgetValidationError,
  CostOverrunError,
  StateError,
  ConcurrencyError,
  LockError,
  DeadlockError,
  TimeoutError,
  CommunicationError,
  AgentError,
  TaskError,
  ValidationError,
  FileSystemError,
  APIError,
  ConfigurationError,
  SecurityError
};
