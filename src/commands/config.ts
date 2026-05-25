import type { Command } from 'commander';
import { readConfig, updateConfig } from '../config.js';
import { output, fail } from '../output.js';

const ALLOWED_KEYS = ['active_org_id', 'update_check_enabled'] as const;
type ConfigKey = (typeof ALLOWED_KEYS)[number];

function coerce(key: ConfigKey, raw: string): string | boolean {
  if (key === 'update_check_enabled') {
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    fail(`update_check_enabled must be true or false, got "${raw}"`);
  }
  return raw;
}

export function registerConfig(program: Command): void {
  const config = program.command('config').description('Manage CLI configuration');

  config
    .command('show')
    .description('Show current config')
    .option('--json', 'Emit JSON')
    .action((opts: { json?: boolean }) => {
      output(readConfig(), { json: opts.json });
    });

  config
    .command('set')
    .description(`Set a config key. Allowed: ${ALLOWED_KEYS.join(', ')}`)
    .argument('<key>')
    .argument('<value>')
    .option('--json', 'Emit JSON')
    .action((key: string, value: string, opts: { json?: boolean }) => {
      if (!ALLOWED_KEYS.includes(key as ConfigKey)) {
        fail(`Unknown key "${key}". Allowed: ${ALLOWED_KEYS.join(', ')}`);
      }
      const next = updateConfig({ [key]: coerce(key as ConfigKey, value) });
      output(next, { json: opts.json });
    });

  config
    .command('unset')
    .description('Remove a config key')
    .argument('<key>')
    .option('--json', 'Emit JSON')
    .action((key: string, opts: { json?: boolean }) => {
      if (!ALLOWED_KEYS.includes(key as ConfigKey)) {
        fail(`Unknown key "${key}". Allowed: ${ALLOWED_KEYS.join(', ')}`);
      }
      const next = updateConfig({ [key]: undefined });
      output(next, { json: opts.json });
    });
}
