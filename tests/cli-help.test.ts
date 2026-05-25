import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', 'dist', 'index.js');

function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', [BIN, ...args], { encoding: 'utf8' });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; status?: number };
    return { stdout: String(e.stdout ?? ''), status: e.status ?? 1 };
  }
}

describe('CLI help', () => {
  it('--help lists all top-level commands', () => {
    const { stdout, status } = run(['--help']);
    expect(status).toBe(0);
    for (const cmd of [
      'login',
      'logout',
      'whoami',
      'org',
      'enroll',
      'lists',
      'leads',
      'inbox',
      'reply',
      'campaign',
      'contact',
      'autopilot',
      'config',
      'completion',
    ]) {
      expect(stdout).toContain(cmd);
    }
  });

  it('--version prints the version', () => {
    const { stdout } = run(['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('completion zsh emits a #compdef directive', () => {
    const { stdout } = run(['completion', 'zsh']);
    expect(stdout).toMatch(/^#compdef aca/);
  });

  it('completion bash emits a complete -F directive', () => {
    const { stdout } = run(['completion', 'bash']);
    expect(stdout).toContain('complete -F _aca_completion');
  });

  it('completion fish emits complete -c lines', () => {
    const { stdout } = run(['completion', 'fish']);
    expect(stdout).toContain('complete -c aca');
  });
});
