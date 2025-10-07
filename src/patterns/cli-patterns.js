/**
 * CLI Application Patterns
 * Architectural and design patterns for command-line applications
 */

class CLIPatterns {
  constructor() {
    this.patterns = this._initializePatterns();
  }

  getAllPatterns() {
    return this.patterns;
  }

  selectPatterns(requirements, features) {
    const selected = {
      architectural: [],
      command: [],
      output: [],
      configuration: [],
      interaction: []
    };

    // Select architectural pattern
    if (requirements.complexity === 'high' || features.subcommands) {
      selected.architectural.push(this.patterns.architectural.commandTree);
    } else {
      selected.architectural.push(this.patterns.architectural.simple);
    }

    // Command patterns
    if (features.interactive) {
      selected.command.push(this.patterns.command.repl);
      selected.interaction.push(this.patterns.interaction.prompt);
    }

    if (features.pipeline) {
      selected.command.push(this.patterns.command.pipeline);
    }

    // Output patterns
    if (features.progress) {
      selected.output.push(this.patterns.output.progressBar);
    }

    if (features.formatted) {
      selected.output.push(this.patterns.output.structured);
    }

    // Configuration
    if (features.configurable) {
      selected.configuration.push(this.patterns.configuration.cascading);
    }

    // Always include
    selected.command.push(this.patterns.command.parser);
    selected.output.push(this.patterns.output.colored);

    return selected;
  }

  _initializePatterns() {
    return {
      architectural: {
        commandTree: {
          name: 'Command Tree Architecture',
          description: 'Hierarchical command structure like git',
          structure: {
            root: 'Main command entry',
            subcommands: 'Nested command groups',
            actions: 'Leaf command handlers',
            routing: 'Command dispatcher'
          },
          components: {
            parser: 'Argument and option parser',
            registry: 'Command registration',
            executor: 'Command execution',
            help: 'Auto-generated help'
          },
          examples: ['git', 'docker', 'kubectl', 'aws-cli'],
          benefits: ['Scalability', 'Organization', 'Discoverability']
        },

        simple: {
          name: 'Simple CLI Architecture',
          description: 'Single-purpose command line tool',
          structure: {
            parser: 'Argument parser',
            validator: 'Input validation',
            executor: 'Main logic',
            output: 'Result formatter'
          },
          examples: ['ls', 'grep', 'curl', 'jq'],
          benefits: ['Simplicity', 'Unix philosophy', 'Composability']
        },

        plugin: {
          name: 'Plugin Architecture',
          description: 'Extensible CLI with plugins',
          components: {
            core: 'Core functionality',
            loader: 'Plugin loader',
            api: 'Plugin API',
            registry: 'Plugin registry'
          },
          discovery: {
            path: 'File system paths',
            npm: 'NPM packages',
            binary: 'Executable plugins'
          },
          examples: ['eslint', 'webpack-cli', 'vue-cli'],
          benefits: ['Extensibility', 'Ecosystem', 'Modularity']
        },

        daemon: {
          name: 'CLI with Daemon',
          description: 'CLI frontend with background service',
          components: {
            cli: 'Command-line interface',
            daemon: 'Background service',
            ipc: 'Inter-process communication',
            client: 'Client library'
          },
          communication: {
            socket: 'Unix/TCP sockets',
            http: 'REST/gRPC API',
            pipe: 'Named pipes'
          },
          examples: ['docker', 'systemctl', 'pm2'],
          benefits: ['Performance', 'State persistence', 'Resource sharing']
        }
      },

      command: {
        parser: {
          name: 'Command Parser Pattern',
          description: 'Parse command-line arguments',
          components: {
            lexer: 'Tokenize input',
            parser: 'Parse tokens',
            validator: 'Validate arguments',
            builder: 'Build command object'
          },
          features: {
            options: {
              short: 'Short flags (-v)',
              long: 'Long flags (--verbose)',
              values: 'Option values (--output file.txt)',
              multiple: 'Multiple values'
            },
            arguments: {
              positional: 'Ordered arguments',
              variadic: 'Variable number',
              optional: 'Optional arguments',
              required: 'Required arguments'
            }
          },
          libraries: {
            node: ['commander', 'yargs', 'minimist'],
            python: ['argparse', 'click', 'fire'],
            rust: ['clap', 'structopt'],
            go: ['cobra', 'urfave/cli']
          }
        },

        repl: {
          name: 'REPL Pattern',
          description: 'Read-Eval-Print Loop',
          components: {
            reader: 'Input reader',
            evaluator: 'Command evaluator',
            printer: 'Output formatter',
            loop: 'Execution loop'
          },
          features: {
            history: 'Command history',
            completion: 'Tab completion',
            multiline: 'Multi-line input',
            context: 'Stateful context'
          },
          enhancement: {
            syntax: 'Syntax highlighting',
            suggestions: 'Command suggestions',
            shortcuts: 'Keyboard shortcuts'
          },
          examples: ['node', 'python', 'mysql', 'redis-cli']
        },

        pipeline: {
          name: 'Pipeline Pattern',
          description: 'Unix-style pipeable commands',
          principles: {
            stdin: 'Read from standard input',
            stdout: 'Write to standard output',
            stderr: 'Errors to standard error',
            composition: 'Combine with pipes'
          },
          features: {
            streaming: 'Process data as stream',
            filtering: 'Filter mode support',
            transformation: 'Transform data',
            aggregation: 'Aggregate results'
          },
          implementation: {
            detection: 'Detect pipe/tty',
            buffering: 'Line/full buffering',
            formats: 'Multiple output formats'
          }
        },

        batch: {
          name: 'Batch Processing Pattern',
          description: 'Process multiple items',
          features: {
            parallel: 'Parallel execution',
            progress: 'Progress reporting',
            resume: 'Resumable operations',
            dryRun: 'Preview mode'
          },
          errorHandling: {
            continue: 'Continue on error',
            retry: 'Retry failed items',
            rollback: 'Rollback changes'
          }
        }
      },

      output: {
        colored: {
          name: 'Colored Output Pattern',
          description: 'ANSI color codes for terminal output',
          usage: {
            status: 'Success (green), Error (red), Warning (yellow)',
            highlighting: 'Syntax highlighting',
            emphasis: 'Bold, underline, italic',
            themes: 'Color themes'
          },
          detection: {
            tty: 'TTY detection',
            colorSupport: 'Terminal color support',
            noColor: 'NO_COLOR environment',
            force: 'Force color option'
          },
          libraries: {
            node: ['chalk', 'colors', 'kleur'],
            python: ['colorama', 'termcolor', 'rich'],
            rust: ['colored', 'ansi_term'],
            go: ['fatih/color', 'gookit/color']
          }
        },

        structured: {
          name: 'Structured Output Pattern',
          description: 'Machine-readable output formats',
          formats: {
            json: {
              description: 'JSON output',
              features: ['Pretty print', 'Compact', 'Streaming']
            },
            yaml: {
              description: 'YAML output',
              features: ['Human-readable', 'Comments']
            },
            table: {
              description: 'Table format',
              features: ['ASCII', 'Unicode', 'CSV', 'TSV']
            },
            xml: {
              description: 'XML output',
              features: ['Structured', 'Schema support']
            }
          },
          selection: {
            flag: '--output-format',
            auto: 'Auto-detect from pipe',
            negotiation: 'Content negotiation'
          }
        },

        progressBar: {
          name: 'Progress Bar Pattern',
          description: 'Visual progress indication',
          types: {
            determinate: 'Known total',
            indeterminate: 'Unknown total',
            multi: 'Multiple progress bars',
            nested: 'Nested operations'
          },
          features: {
            percentage: 'Completion percentage',
            eta: 'Estimated time',
            speed: 'Processing speed',
            custom: 'Custom metrics'
          },
          libraries: {
            node: ['cli-progress', 'ora', 'progress'],
            python: ['tqdm', 'rich.progress', 'alive-progress'],
            rust: ['indicatif', 'pbr'],
            go: ['cheggaaa/pb', 'vbauerster/mpb']
          }
        },

        logging: {
          name: 'CLI Logging Pattern',
          description: 'Structured logging for CLI',
          levels: {
            debug: 'Detailed debugging',
            info: 'Informational',
            warn: 'Warnings',
            error: 'Errors',
            fatal: 'Fatal errors'
          },
          features: {
            verbosity: 'Adjustable verbosity',
            quiet: 'Quiet mode',
            logFile: 'File logging',
            structured: 'JSON logs'
          }
        },

        pager: {
          name: 'Pager Integration',
          description: 'Long output handling',
          detection: 'TTY and output length',
          pagers: ['less', 'more', 'bat'],
          bypass: '--no-pager option'
        }
      },

      configuration: {
        cascading: {
          name: 'Cascading Configuration',
          description: 'Multiple configuration sources',
          precedence: {
            1: 'Command-line arguments',
            2: 'Environment variables',
            3: 'Configuration file (local)',
            4: 'Configuration file (global)',
            5: 'Defaults'
          },
          locations: {
            local: './.toolrc',
            user: '~/.config/tool/',
            system: '/etc/tool/',
            env: 'TOOL_CONFIG'
          },
          formats: ['JSON', 'YAML', 'TOML', 'INI'],
          features: {
            validation: 'Schema validation',
            migration: 'Config migration',
            generation: 'Config generation'
          }
        },

        environment: {
          name: 'Environment Pattern',
          description: 'Environment-based configuration',
          variables: {
            prefix: 'Tool-specific prefix',
            mapping: 'Variable to option mapping',
            parsing: 'Type parsing'
          },
          examples: {
            debug: 'TOOL_DEBUG=1',
            config: 'TOOL_CONFIG_PATH=/path',
            credentials: 'TOOL_API_KEY=secret'
          }
        },

        profile: {
          name: 'Profile Pattern',
          description: 'Named configuration sets',
          features: {
            multiple: 'Multiple profiles',
            switching: 'Profile selection',
            inheritance: 'Profile inheritance',
            override: 'Profile overrides'
          },
          storage: {
            file: 'Profile files',
            directory: 'Profile directories'
          },
          examples: ['aws-cli profiles', 'kubectl contexts']
        }
      },

      interaction: {
        prompt: {
          name: 'Interactive Prompt Pattern',
          description: 'User input prompts',
          types: {
            text: 'Text input',
            password: 'Hidden input',
            confirm: 'Yes/no confirmation',
            select: 'Single selection',
            multiselect: 'Multiple selection',
            autocomplete: 'Autocomplete input'
          },
          features: {
            validation: 'Input validation',
            defaults: 'Default values',
            help: 'Inline help',
            history: 'Input history'
          },
          libraries: {
            node: ['inquirer', 'prompts', 'enquirer'],
            python: ['prompt_toolkit', 'questionary', 'PyInquirer'],
            rust: ['dialoguer', 'requestty'],
            go: ['AlecAivazis/survey', 'manifoldco/promptui']
          }
        },

        wizard: {
          name: 'Wizard Pattern',
          description: 'Multi-step guided process',
          components: {
            steps: 'Sequential steps',
            validation: 'Step validation',
            navigation: 'Back/next navigation',
            summary: 'Review summary'
          },
          features: {
            conditional: 'Conditional steps',
            branching: 'Branching paths',
            persistence: 'Save progress'
          },
          examples: ['npm init', 'create-react-app', 'yo generators']
        },

        autocomplete: {
          name: 'Autocomplete Pattern',
          description: 'Command and argument completion',
          types: {
            static: 'Predefined completions',
            dynamic: 'Runtime completions',
            contextual: 'Context-aware'
          },
          shells: {
            bash: 'Bash completion',
            zsh: 'Zsh completion',
            fish: 'Fish completion',
            powershell: 'PowerShell completion'
          },
          generation: {
            manual: 'Manual definitions',
            automatic: 'Generated from schema'
          }
        }
      },

      error: {
        handling: {
          name: 'Error Handling Pattern',
          description: 'Consistent error management',
          types: {
            validation: 'Input validation errors',
            runtime: 'Runtime errors',
            system: 'System errors',
            network: 'Network errors'
          },
          display: {
            message: 'User-friendly message',
            details: 'Technical details',
            suggestions: 'Fix suggestions',
            documentation: 'Help links'
          },
          codes: {
            standard: 'Exit codes (0-255)',
            custom: 'Application codes',
            mapping: 'Error to exit code'
          }
        },

        recovery: {
          name: 'Error Recovery Pattern',
          description: 'Graceful error recovery',
          strategies: {
            retry: 'Automatic retry',
            fallback: 'Fallback behavior',
            interactive: 'User intervention',
            partial: 'Partial success'
          }
        }
      },

      distribution: {
        packaging: {
          name: 'CLI Packaging Pattern',
          description: 'Distribution methods',
          methods: {
            npm: 'NPM global package',
            binary: 'Standalone binary',
            installer: 'Platform installer',
            container: 'Docker container'
          },
          considerations: {
            dependencies: 'Dependency bundling',
            size: 'Binary size optimization',
            startup: 'Startup time',
            updates: 'Update mechanism'
          }
        },

        versioning: {
          name: 'Version Management',
          description: 'CLI version handling',
          features: {
            display: '--version flag',
            check: 'Version checking',
            compatibility: 'Version compatibility',
            migration: 'Version migration'
          }
        }
      }
    };
  }

  getImplementationExample(pattern, language) {
    const examples = {
      'command-tree': {
        javascript: `
// Commander.js Command Tree
const { Command } = require('commander');

const program = new Command();

program
  .name('myapp')
  .description('CLI application with subcommands')
  .version('1.0.0');

// Subcommand: config
const config = program.command('config');

config
  .command('get <key>')
  .description('Get configuration value')
  .action((key) => {
    console.log(\`Config \${key}: \${getConfig(key)}\`);
  });

config
  .command('set <key> <value>')
  .description('Set configuration value')
  .action((key, value) => {
    setConfig(key, value);
    console.log(\`Set \${key} = \${value}\`);
  });

// Subcommand: deploy
program
  .command('deploy <environment>')
  .description('Deploy to environment')
  .option('-f, --force', 'Force deployment')
  .option('--dry-run', 'Preview changes')
  .action((environment, options) => {
    if (options.dryRun) {
      console.log(\`Would deploy to \${environment}\`);
    } else {
      deploy(environment, options);
    }
  });

program.parse();`,

        python: `
# Click Command Tree
import click

@click.group()
@click.version_option(version='1.0.0')
def cli():
    """CLI application with subcommands."""
    pass

@cli.group()
def config():
    """Manage configuration."""
    pass

@config.command()
@click.argument('key')
def get(key):
    """Get configuration value."""
    value = get_config(key)
    click.echo(f"Config {key}: {value}")

@config.command()
@click.argument('key')
@click.argument('value')
def set(key, value):
    """Set configuration value."""
    set_config(key, value)
    click.echo(f"Set {key} = {value}")

@cli.command()
@click.argument('environment')
@click.option('--force', is_flag=True, help='Force deployment')
@click.option('--dry-run', is_flag=True, help='Preview changes')
def deploy(environment, force, dry_run):
    """Deploy to environment."""
    if dry_run:
        click.echo(f"Would deploy to {environment}")
    else:
        perform_deploy(environment, force)

if __name__ == '__main__':
    cli()`,

        go: `
// Cobra Command Tree
package main

import (
    "fmt"
    "github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
    Use:   "myapp",
    Short: "CLI application with subcommands",
    Version: "1.0.0",
}

var configCmd = &cobra.Command{
    Use:   "config",
    Short: "Manage configuration",
}

var configGetCmd = &cobra.Command{
    Use:   "get [key]",
    Short: "Get configuration value",
    Args:  cobra.ExactArgs(1),
    Run: func(cmd *cobra.Command, args []string) {
        key := args[0]
        value := getConfig(key)
        fmt.Printf("Config %s: %s\\n", key, value)
    },
}

var deployCmd = &cobra.Command{
    Use:   "deploy [environment]",
    Short: "Deploy to environment",
    Args:  cobra.ExactArgs(1),
    Run: func(cmd *cobra.Command, args []string) {
        environment := args[0]
        force, _ := cmd.Flags().GetBool("force")
        dryRun, _ := cmd.Flags().GetBool("dry-run")

        if dryRun {
            fmt.Printf("Would deploy to %s\\n", environment)
        } else {
            deploy(environment, force)
        }
    },
}

func init() {
    rootCmd.AddCommand(configCmd)
    configCmd.AddCommand(configGetCmd)

    deployCmd.Flags().Bool("force", false, "Force deployment")
    deployCmd.Flags().Bool("dry-run", false, "Preview changes")
    rootCmd.AddCommand(deployCmd)
}

func main() {
    rootCmd.Execute()
}`
      },

      'interactive-prompt': {
        javascript: `
// Inquirer.js Interactive Prompts
const inquirer = require('inquirer');

async function interactiveSetup() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: 'my-project',
      validate: (input) => {
        if (!/^[a-z0-9-]+$/.test(input)) {
          return 'Name must be lowercase with hyphens only';
        }
        return true;
      }
    },
    {
      type: 'list',
      name: 'template',
      message: 'Select template:',
      choices: ['React', 'Vue', 'Angular', 'Vanilla']
    },
    {
      type: 'checkbox',
      name: 'features',
      message: 'Select features:',
      choices: [
        { name: 'TypeScript', value: 'ts', checked: true },
        { name: 'ESLint', value: 'lint' },
        { name: 'Testing', value: 'test' },
        { name: 'Docker', value: 'docker' }
      ]
    },
    {
      type: 'confirm',
      name: 'git',
      message: 'Initialize git repository?',
      default: true
    }
  ]);

  return answers;
}`,

        python: `
# Prompt Toolkit Interactive
from prompt_toolkit import prompt
from prompt_toolkit.completion import WordCompleter
from prompt_toolkit.validation import Validator, ValidationError

class ProjectNameValidator(Validator):
    def validate(self, document):
        text = document.text
        if not re.match(r'^[a-z0-9-]+$', text):
            raise ValidationError(
                message='Name must be lowercase with hyphens only',
                cursor_position=len(text)
            )

def interactive_setup():
    # Text input with validation
    name = prompt(
        'Project name: ',
        default='my-project',
        validator=ProjectNameValidator()
    )

    # Autocomplete selection
    templates = ['React', 'Vue', 'Angular', 'Vanilla']
    completer = WordCompleter(templates)
    template = prompt(
        'Select template: ',
        completer=completer
    )

    # Multiple selection (custom implementation)
    features = multiselect_prompt(
        'Select features:',
        ['TypeScript', 'ESLint', 'Testing', 'Docker']
    )

    # Confirmation
    git = prompt('Initialize git? (y/n): ').lower() == 'y'

    return {
        'name': name,
        'template': template,
        'features': features,
        'git': git
    }`
      },

      'progress-bar': {
        javascript: `
// CLI Progress Bar
const ProgressBar = require('cli-progress');
const colors = require('ansi-colors');

// Single progress bar
async function downloadFiles(files) {
  const bar = new ProgressBar.SingleBar({
    format: colors.cyan('{bar}') + ' | {percentage}% | {value}/{total} Files | {filename}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true
  });

  bar.start(files.length, 0, { filename: 'N/A' });

  for (let i = 0; i < files.length; i++) {
    bar.update(i, { filename: files[i].name });
    await downloadFile(files[i]);
  }

  bar.stop();
}

// Multiple progress bars
async function parallelDownload(files) {
  const multibar = new ProgressBar.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: ' {bar} | {filename} | {value}/{total}'
  });

  const bars = files.map(file => {
    const bar = multibar.create(file.size, 0);
    downloadFileWithProgress(file, (progress) => {
      bar.update(progress, { filename: file.name });
    });
    return bar;
  });

  await Promise.all(downloads);
  multibar.stop();
}`,

        python: `
# TQDM Progress Bar
from tqdm import tqdm
import time

def download_files(files):
    """Single progress bar example"""
    for file in tqdm(files, desc="Downloading", unit="file"):
        download_file(file)

def parallel_download(files):
    """Multiple progress bars"""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def download_with_progress(file):
        with tqdm(total=file.size, desc=file.name, unit='B',
                  unit_scale=True, leave=False) as pbar:
            for chunk in download_chunks(file):
                pbar.update(len(chunk))
        return file

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(download_with_progress, f) for f in files]

        # Overall progress
        for future in tqdm(as_completed(futures), total=len(files),
                          desc="Total Progress"):
            result = future.result()

# Custom progress with rich
from rich.progress import Progress, SpinnerColumn, TextColumn

def process_with_rich():
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
    ) as progress:
        task = progress.add_task("[cyan]Processing...", total=100)

        for i in range(100):
            progress.update(task, advance=1)
            time.sleep(0.01)`
      }
    };

    return examples[pattern]?.[language] || '';
  }
}

module.exports = CLIPatterns;