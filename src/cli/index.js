#!/usr/bin/env node

/**
 * CodeSwarm CLI
 * Main command-line interface
 */

const { Command } = require('commander');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

const program = new Command();

program
  .name('codeswarm')
  .description('Autonomous code generation system powered by Claude')
  .version('0.1.0');

/**
 * Start command - main entry point
 */
program
  .command('start')
  .description('Start code generation from proposal')
  .option('-p, --proposal <path>', 'Path to proposal file')
  .option('-o, --output <path>', 'Output directory')
  .option('--budget <amount>', 'Budget limit in dollars', parseFloat)
  .option('--mode <mode>', 'Display mode (verbose|concise)', 'verbose')
  .option('--resume', 'Resume from checkpoint if available')
  .action(async (options) => {
    try {
      const CodeSwarm = require('../app');
      const codeswarm = new CodeSwarm();

      // Interactive prompts if options not provided
      if (!options.proposal && !options.resume) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'proposal',
            message: 'Path to proposal file:',
            validate: async (input) => {
              if (await fs.pathExists(input)) {
                return true;
              }
              return 'File does not exist';
            }
          },
          {
            type: 'input',
            name: 'output',
            message: 'Output directory:',
            default: './output'
          },
          {
            type: 'number',
            name: 'budget',
            message: 'Budget limit ($):',
            default: 10.0
          },
          {
            type: 'list',
            name: 'mode',
            message: 'Display mode:',
            choices: ['verbose', 'concise'],
            default: 'verbose'
          }
        ]);

        Object.assign(options, answers);
      }

      // Set output directory
      const outputDir = path.resolve(options.output || './output');

      // Check for resume
      if (options.resume) {
        const checkpointPath = path.join(outputDir, '.codeswarm', 'state.json');

        if (await fs.pathExists(checkpointPath)) {
          console.log(chalk.cyan('Found checkpoint. Resuming...\n'));

          await codeswarm.resume(outputDir, {
            mode: options.mode
          });
        } else {
          console.log(chalk.yellow('No checkpoint found. Starting fresh...\n'));
          options.resume = false;
        }
      }

      if (!options.resume) {
        // Read proposal
        const proposalPath = path.resolve(options.proposal);
        const proposal = await fs.readFile(proposalPath, 'utf-8');

        // Start generation
        await codeswarm.generate(proposal, outputDir, {
          budget: options.budget,
          mode: options.mode
        });
      }

    } catch (error) {
      console.error(chalk.red('\n✗ Error:'), error.message);
      if (error.context) {
        console.error(chalk.gray('Context:'), error.context);
      }
      process.exit(1);
    }
  });

/**
 * Status command - show current status
 */
program
  .command('status')
  .description('Show status of current project')
  .option('-o, --output <path>', 'Output directory', './output')
  .action(async (options) => {
    try {
      const outputDir = path.resolve(options.output);
      const statePath = path.join(outputDir, '.codeswarm', 'state.json');

      if (!await fs.pathExists(statePath)) {
        console.log(chalk.yellow('No active project found in this directory'));
        return;
      }

      const state = await fs.readJSON(statePath);

      console.log(chalk.bold.cyan('\n📊 Project Status\n'));
      console.log(chalk.gray('─'.repeat(60)));

      if (state.projectPlan) {
        console.log(chalk.bold('Project:'), state.projectPlan.projectAnalysis?.type || 'Unknown');
      }

      if (state.execution) {
        console.log(chalk.bold('Status:'), state.currentTask ? 'Running' : 'Paused');
        console.log(chalk.bold('Completed:'), chalk.green(state.execution.completedTasks?.length || 0));
        console.log(chalk.bold('Failed:'), chalk.red(state.execution.failedTasks?.length || 0));
        console.log(chalk.bold('Pending:'), state.orchestration?.taskQueue?.length || 0);
      }

      if (state.budgetUsed !== undefined) {
        console.log(chalk.bold('Budget Used:'), chalk.yellow(`$${state.budgetUsed.toFixed(2)}`));
      }

      console.log(chalk.gray('─'.repeat(60)));
      console.log();

    } catch (error) {
      console.error(chalk.red('Error reading status:'), error.message);
      process.exit(1);
    }
  });

/**
 * Validate command - run security scan
 */
program
  .command('validate')
  .description('Run security scan on generated code')
  .option('-o, --output <path>', 'Output directory', './output')
  .action(async (options) => {
    try {
      const SecurityScanner = require('../validation/security-scanner');
      const outputDir = path.resolve(options.output);

      if (!await fs.pathExists(outputDir)) {
        console.log(chalk.red('Output directory does not exist'));
        return;
      }

      console.log(chalk.cyan('🔍 Running security scan...\n'));

      const scanner = new SecurityScanner(outputDir);
      const results = await scanner.scanAll();

      // Save report
      await scanner.saveReport(results);

      // Display summary
      console.log(chalk.bold('Scan complete!'));
      console.log(`Files scanned: ${results.filesScanned}`);
      console.log(`Issues found: ${results.issuesFound}`);

      if (results.summary.CRITICAL > 0) {
        console.log(chalk.red.bold(`CRITICAL: ${results.summary.CRITICAL}`));
      }

      if (results.summary.HIGH > 0) {
        console.log(chalk.red(`HIGH: ${results.summary.HIGH}`));
      }

      if (results.summary.MEDIUM > 0) {
        console.log(chalk.yellow(`MEDIUM: ${results.summary.MEDIUM}`));
      }

      if (results.summary.LOW > 0) {
        console.log(chalk.gray(`LOW: ${results.summary.LOW}`));
      }

      console.log(chalk.cyan(`\nFull report saved to: ${path.join(outputDir, 'SECURITY_REPORT.md')}`));

    } catch (error) {
      console.error(chalk.red('Validation error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Setup command - interactive setup wizard
 */
program
  .command('setup')
  .description('Run setup wizard')
  .action(async () => {
    try {
      console.log(chalk.bold.cyan('\n🚀 CodeSwarm Setup Wizard\n'));

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiKey',
          message: 'Claude API Key:',
          validate: (input) => {
            if (input.length > 0) return true;
            return 'API key is required';
          }
        },
        {
          type: 'list',
          name: 'model',
          message: 'Default Claude model:',
          choices: [
            { name: 'Claude 3 Sonnet (balanced)', value: 'claude-3-sonnet-20240229' },
            { name: 'Claude 3 Opus (most capable)', value: 'claude-3-opus-20240229' },
            { name: 'Claude 3 Haiku (fastest)', value: 'claude-3-haiku-20240307' }
          ],
          default: 'claude-3-sonnet-20240229'
        },
        {
          type: 'number',
          name: 'budget',
          message: 'Default budget limit ($):',
          default: 10.0
        },
        {
          type: 'number',
          name: 'maxConcurrentAgents',
          message: 'Max concurrent agents:',
          default: 3
        }
      ]);

      // Create .env file
      const envPath = path.join(process.cwd(), '.env');
      const envContent = `
# Claude API Configuration
CLAUDE_API_KEY=${answers.apiKey}
CLAUDE_MODEL=${answers.model}

# Budget Configuration
BUDGET_LIMIT=${answers.budget}
MIN_BUDGET_RESERVE=1.0
BUDGET_WARNING_THRESHOLD=0.9

# System Configuration
MAX_CONCURRENT_AGENTS=${answers.maxConcurrentAgents}
DEFAULT_AGENT_COUNT=2
`;

      await fs.writeFile(envPath, envContent.trim() + '\n');

      console.log(chalk.green('\n✓ Configuration saved to .env'));
      console.log(chalk.cyan('\nYou\'re all set! Run'), chalk.bold('codeswarm start'), chalk.cyan('to begin.'));
      console.log();

    } catch (error) {
      console.error(chalk.red('Setup error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Logs command - view and analyze logs
 */
program
  .command('logs')
  .description('View logs from code generation')
  .option('-o, --output <path>', 'Output directory', './output')
  .option('-f, --follow', 'Follow log output in real-time')
  .option('-l, --lines <count>', 'Number of lines to show', '50')
  .option('--level <level>', 'Filter by log level (debug|info|warn|error)')
  .option('--agent <id>', 'Filter by agent ID')
  .option('--api', 'Show API calls only')
  .option('--errors', 'Show errors only')
  .action(async (options) => {
    try {
      const outputDir = path.resolve(options.output);
      const logsDir = path.join(outputDir, '.codeswarm', 'logs');

      if (!await fs.pathExists(logsDir)) {
        console.log(chalk.yellow('No logs found in this directory'));
        return;
      }

      // Find most recent log file
      const files = await fs.readdir(logsDir);
      const mainLogs = files
        .filter(f => f.startsWith('codeswarm-') && f.endsWith('.log'))
        .sort()
        .reverse();

      if (mainLogs.length === 0) {
        console.log(chalk.yellow('No log files found'));
        return;
      }

      const logFile = options.api
        ? path.join(logsDir, 'api-calls.log')
        : options.errors
        ? path.join(logsDir, 'error.log')
        : path.join(logsDir, mainLogs[0]);

      if (!await fs.pathExists(logFile)) {
        console.log(chalk.yellow('Log file not found'));
        return;
      }

      console.log(chalk.cyan(`\n📝 Logs from: ${path.basename(logFile)}\n`));
      console.log(chalk.gray('─'.repeat(80)));

      // Read and parse logs
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      const numLines = parseInt(options.lines);

      // Filter and display
      let displayLines = lines;

      // Apply filters
      if (options.level) {
        displayLines = displayLines.filter(line => {
          try {
            const log = JSON.parse(line);
            return log.level === options.level;
          } catch {
            return false;
          }
        });
      }

      if (options.agent) {
        displayLines = displayLines.filter(line => {
          try {
            const log = JSON.parse(line);
            return log.agentId === options.agent;
          } catch {
            return false;
          }
        });
      }

      // Take last N lines
      const recentLines = displayLines.slice(-numLines);

      // Format and display
      recentLines.forEach(line => {
        try {
          const log = JSON.parse(line);
          const timestamp = new Date(log.timestamp).toLocaleTimeString();
          const level = log.level.toUpperCase();
          const levelColor =
            level === 'ERROR' ? chalk.red :
            level === 'WARN' ? chalk.yellow :
            level === 'INFO' ? chalk.cyan :
            chalk.gray;

          const prefix = `${chalk.gray(timestamp)} ${levelColor(level.padEnd(5))}`;

          if (log.component) {
            console.log(`${prefix} ${chalk.bold(log.component)}: ${log.message}`);
          } else if (log.agentId) {
            console.log(`${prefix} ${chalk.blue(log.agentId)}: ${log.message}`);
          } else {
            console.log(`${prefix} ${log.message}`);
          }

          // Show important metadata
          if (log.level === 'error' && log.error) {
            console.log(chalk.gray(`  Error: ${log.error}`));
          }
          if (log.cost) {
            console.log(chalk.gray(`  Cost: $${log.cost.toFixed(6)}`));
          }
        } catch {
          // Non-JSON line, print as-is
          console.log(chalk.gray(line));
        }
      });

      console.log(chalk.gray('─'.repeat(80)));
      console.log(chalk.gray(`\nShowing ${recentLines.length} lines from ${displayLines.length} total`));

      if (options.follow) {
        console.log(chalk.cyan('\n👁️  Following logs (Ctrl+C to exit)...\n'));
        const { spawn } = require('child_process');
        const tail = spawn('tail', ['-f', logFile]);

        tail.stdout.on('data', (data) => {
          const lines = data.toString().trim().split('\n');
          lines.forEach(line => {
            try {
              const log = JSON.parse(line);
              const timestamp = new Date(log.timestamp).toLocaleTimeString();
              const level = log.level.toUpperCase();
              const levelColor =
                level === 'ERROR' ? chalk.red :
                level === 'WARN' ? chalk.yellow :
                level === 'INFO' ? chalk.cyan :
                chalk.gray;

              console.log(`${chalk.gray(timestamp)} ${levelColor(level.padEnd(5))} ${log.message}`);
            } catch {
              console.log(chalk.gray(line));
            }
          });
        });

        process.on('SIGINT', () => {
          tail.kill();
          process.exit(0);
        });
      }

    } catch (error) {
      console.error(chalk.red('Logs error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Clean command - remove checkpoints and temp files
 */
program
  .command('clean')
  .description('Clean checkpoints and temporary files')
  .option('-o, --output <path>', 'Output directory', './output')
  .option('--all', 'Remove all generated code as well')
  .option('--logs', 'Also remove log files')
  .action(async (options) => {
    try {
      const outputDir = path.resolve(options.output);
      const codeswarmDir = path.join(outputDir, '.codeswarm');

      if (await fs.pathExists(codeswarmDir)) {
        if (options.logs) {
          await fs.remove(codeswarmDir);
          console.log(chalk.green('✓ Cleaned CodeSwarm temporary files and logs'));
        } else {
          // Remove state files but keep logs
          const statePath = path.join(codeswarmDir, 'state.json');
          const archivePath = path.join(codeswarmDir, 'state-archive');
          if (await fs.pathExists(statePath)) await fs.remove(statePath);
          if (await fs.pathExists(archivePath)) await fs.remove(archivePath);
          console.log(chalk.green('✓ Cleaned CodeSwarm temporary files (logs preserved)'));
        }
      }

      if (options.all) {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.yellow('This will delete all generated code. Are you sure?'),
            default: false
          }
        ]);

        if (confirm.confirmed) {
          await fs.remove(outputDir);
          console.log(chalk.green('✓ Removed all generated code'));
        } else {
          console.log(chalk.gray('Cancelled'));
        }
      }

    } catch (error) {
      console.error(chalk.red('Clean error:'), error.message);
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
