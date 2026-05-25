import type { Command } from 'commander';
import { fail } from '../output.js';
import { CLI_NAME } from '../constants.js';

function collectCommandNames(program: Command): string[] {
  const names: string[] = [];
  const walk = (cmd: Command, prefix: string[]): void => {
    for (const sub of cmd.commands) {
      const name = sub.name();
      const full = [...prefix, name].join(' ');
      names.push(full);
      walk(sub, [...prefix, name]);
    }
  };
  walk(program, []);
  return names;
}

function bash(program: Command): string {
  const commands = collectCommandNames(program).join(' ');
  return `# aca-cli bash completion
_aca_completion() {
  local cur prev words cword
  _init_completion || return
  local commands="${commands}"
  COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
}
complete -F _aca_completion ${CLI_NAME}
`;
}

function zsh(program: Command): string {
  const commands = collectCommandNames(program)
    .map((c) => `"${c}"`)
    .join(' ');
  return `#compdef ${CLI_NAME}
# aca-cli zsh completion
_aca() {
  local -a commands
  commands=(${commands})
  _arguments '*::command:->subcmd'
  case $state in
    subcmd) _describe 'command' commands ;;
  esac
}
_aca "$@"
`;
}

function fish(program: Command): string {
  const lines = collectCommandNames(program).map(
    (c) => `complete -c ${CLI_NAME} -f -a "${c}"`,
  );
  return `# aca-cli fish completion\n${lines.join('\n')}\n`;
}

export function registerCompletion(program: Command): void {
  program
    .command('completion')
    .description('Print shell completion script (pipe into your shell rc file)')
    .argument('<shell>', 'bash | zsh | fish')
    .action((shell: string) => {
      switch (shell) {
        case 'bash':
          process.stdout.write(bash(program));
          break;
        case 'zsh':
          process.stdout.write(zsh(program));
          break;
        case 'fish':
          process.stdout.write(fish(program));
          break;
        default:
          fail(`Unknown shell "${shell}". Supported: bash, zsh, fish`);
      }
    });
}
