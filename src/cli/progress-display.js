/**
 * Progress Display
 * Shows execution progress in both verbose and concise modes
 */

const chalk = require('chalk');

class ProgressDisplay {
  constructor(mode = 'verbose') {
    this.mode = mode; // 'verbose' or 'concise'

    this.state = {
      startTime: null,
      phase: null,
      currentTask: null,
      progress: {
        total: 0,
        completed: 0,
        failed: 0
      },
      budget: {
        total: 0,
        used: 0,
        remaining: 0
      },
      tree: []
    };
  }

  /**
   * Start display
   * @param {Object} projectInfo
   */
  start(projectInfo) {
    this.state.startTime = Date.now();

    console.log(chalk.bold.cyan('\n🚀 CodeSwarm - Autonomous Code Generation\n'));

    if (this.mode === 'verbose') {
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.bold('Project:'), projectInfo.name || 'Untitled');
      if (projectInfo.description) {
        console.log(chalk.bold('Description:'), projectInfo.description);
      }
      console.log(chalk.gray('─'.repeat(60)));
      console.log();
    }
  }

  /**
   * Show phase change
   * @param {string} phase
   * @param {Object} data
   */
  phase(phase, data = {}) {
    this.state.phase = phase;

    if (this.mode === 'verbose') {
      console.log(chalk.bold.blue(`\n▶ Phase: ${phase.toUpperCase()}`));

      if (phase === 'analysis' && data.totalTasks) {
        console.log(chalk.gray(`  → ${data.totalTasks} tasks identified`));
        console.log(chalk.gray(`  → Estimated budget: $${data.estimatedBudget?.toFixed(2) || '0.00'}`));
      }

      console.log();
    } else {
      // Concise mode
      console.log(chalk.blue(`[${phase}]`));
    }
  }

  /**
   * Show task start
   * @param {Object} task
   */
  taskStart(task) {
    this.state.currentTask = task;

    if (this.mode === 'verbose') {
      const icon = this._getAgentIcon(task.agentType);
      console.log(chalk.yellow(`  ${icon} ${task.name}`));
      console.log(chalk.gray(`     Agent: ${task.agentType} | Priority: ${task.priority}`));
    } else {
      console.log(chalk.gray(`  → ${task.name}`));
    }
  }

  /**
   * Show task completion
   * @param {Object} task
   * @param {Object} result
   */
  taskComplete(task, result) {
    this.state.progress.completed++;
    this.state.currentTask = null;

    if (this.mode === 'verbose') {
      const icon = this._getAgentIcon(task.agentType);
      console.log(chalk.green(`  ✓ ${icon} ${task.name}`));

      if (result.files && result.files.length > 0) {
        console.log(chalk.gray(`     Files: ${result.files.map(f => f.path).join(', ')}`));
      }

      if (result.usage?.cost) {
        console.log(chalk.gray(`     Cost: $${result.usage.cost.toFixed(4)}`));
      }

      console.log();
    } else {
      console.log(chalk.green(`  ✓ ${task.name}`));
    }
  }

  /**
   * Show task failure
   * @param {Object} task
   * @param {string} error
   */
  taskFail(task, error) {
    this.state.progress.failed++;
    this.state.currentTask = null;

    if (this.mode === 'verbose') {
      const icon = this._getAgentIcon(task.agentType);
      console.log(chalk.red(`  ✗ ${icon} ${task.name}`));
      console.log(chalk.red(`     Error: ${error}`));
      console.log();
    } else {
      console.log(chalk.red(`  ✗ ${task.name} - ${error}`));
    }
  }

  /**
   * Update progress bar
   * @param {Object} progress
   */
  progress(progress) {
    this.state.progress = progress;

    const percentage = progress.total > 0 ?
      (progress.completed / progress.total) * 100 : 0;

    if (this.mode === 'verbose') {
      const barWidth = 40;
      const filledWidth = Math.round((barWidth * percentage) / 100);
      const emptyWidth = barWidth - filledWidth;

      const bar = chalk.green('█'.repeat(filledWidth)) +
                  chalk.gray('░'.repeat(emptyWidth));

      process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear line
      process.stdout.write(
        `  Progress: [${bar}] ${percentage.toFixed(1)}% ` +
        `(${progress.completed}/${progress.total})`
      );
    }
  }

  /**
   * Show budget update
   * @param {Object} budget
   */
  budgetUpdate(budget) {
    this.state.budget = budget;

    if (this.mode === 'verbose') {
      const utilizationPercent = (budget.used / budget.total) * 100;

      let color = chalk.green;
      if (utilizationPercent > 90) {
        color = chalk.red;
      } else if (utilizationPercent > 75) {
        color = chalk.yellow;
      }

      console.log(
        color(`\n  💰 Budget: $${budget.used.toFixed(2)} / $${budget.total.toFixed(2)} ` +
              `(${utilizationPercent.toFixed(1)}%)`)
      );
    }
  }

  /**
   * Show warning
   * @param {string} message
   */
  warning(message) {
    console.log(chalk.yellow(`  ⚠ Warning: ${message}`));
  }

  /**
   * Show error
   * @param {string} message
   */
  error(message) {
    console.log(chalk.red(`  ✗ Error: ${message}`));
  }

  /**
   * Show completion summary
   * @param {Object} result
   */
  complete(result) {
    const duration = Date.now() - this.state.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    console.log(); // New line after progress bar

    if (result.success) {
      console.log(chalk.bold.green('\n✓ Project Generation Complete!\n'));
    } else {
      console.log(chalk.bold.red('\n✗ Project Generation Failed\n'));
    }

    if (this.mode === 'verbose') {
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.bold('Summary:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`  Tasks Completed: ${chalk.green(result.completedTasks || 0)}`);

      if (result.failedTasks > 0) {
        console.log(`  Tasks Failed: ${chalk.red(result.failedTasks)}`);
      }

      if (result.filesCreated) {
        console.log(`  Files Created: ${chalk.cyan(result.filesCreated.length)}`);
      }

      if (result.filesModified) {
        console.log(`  Files Modified: ${chalk.cyan(result.filesModified.length)}`);
      }

      if (result.totalCost) {
        console.log(`  Total Cost: ${chalk.yellow('$' + result.totalCost.toFixed(2))}`);
      }

      console.log(`  Duration: ${minutes}m ${seconds}s`);
      console.log(chalk.gray('─'.repeat(60)));
    } else {
      console.log(`${result.completedTasks || 0} tasks completed in ${minutes}m ${seconds}s`);
      console.log(`Cost: $${result.totalCost?.toFixed(2) || '0.00'}`);
    }

    if (result.filesCreated && result.filesCreated.length > 0 && this.mode === 'verbose') {
      console.log(chalk.bold('\nFiles Created:'));
      for (const file of result.filesCreated.slice(0, 10)) {
        console.log(chalk.gray(`  - ${file}`));
      }

      if (result.filesCreated.length > 10) {
        console.log(chalk.gray(`  ... and ${result.filesCreated.length - 10} more`));
      }
    }

    console.log();
  }

  /**
   * Show checkpoint created
   * @param {string} type
   */
  checkpoint(type) {
    if (this.mode === 'verbose') {
      console.log(chalk.gray(`  💾 Checkpoint saved (${type})`));
    }
  }

  /**
   * Show resuming from checkpoint
   * @param {Object} checkpoint
   */
  resuming(checkpoint) {
    console.log(chalk.cyan(`\n▶ Resuming from checkpoint...`));

    if (this.mode === 'verbose') {
      console.log(chalk.gray(`  Checkpoint: ${checkpoint.id}`));
      console.log(chalk.gray(`  Previously completed: ${checkpoint.completedTasks || 0} tasks`));
      console.log();
    }
  }

  /**
   * Get agent icon
   * @private
   */
  _getAgentIcon(agentType) {
    const icons = {
      coordinator: '🧠',
      backend: '⚙️',
      frontend: '🎨',
      testing: '🧪',
      database: '🗄️',
      devops: '🚀',
      docs: '📝',
      architect: '🏗️'
    };

    return icons[agentType] || '🤖';
  }

  /**
   * Clear line
   * @private
   */
  _clearLine() {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }

  /**
   * Set display mode
   * @param {string} mode - 'verbose' or 'concise'
   */
  setMode(mode) {
    this.mode = mode;
  }

  /**
   * Show nested task tree (for verbose mode)
   * @param {Object} node
   * @param {number} depth
   */
  showTree(node, depth = 0) {
    if (this.mode !== 'verbose') return;

    const indent = '  '.repeat(depth);
    const icon = this._getAgentIcon(node.agentType);

    let status = chalk.gray('○');
    if (node.status === 'completed') status = chalk.green('✓');
    if (node.status === 'failed') status = chalk.red('✗');
    if (node.status === 'in-progress') status = chalk.yellow('●');

    console.log(`${indent}${status} ${icon} ${node.name}`);

    if (node.children) {
      for (const child of node.children) {
        this.showTree(child, depth + 1);
      }
    }
  }
}

module.exports = ProgressDisplay;
