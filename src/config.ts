import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { configPath } from './paths.js';

export interface Config {
  active_org_id?: string;
  update_check_enabled?: boolean;
}

const DEFAULTS: Config = {
  update_check_enabled: true,
};

export function readConfig(): Config {
  const path = configPath();
  if (!existsSync(path)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeConfig(config: Config): void {
  const path = configPath();
  writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function updateConfig(patch: Partial<Config>): Config {
  const next = { ...readConfig(), ...patch };
  writeConfig(next);
  return next;
}
