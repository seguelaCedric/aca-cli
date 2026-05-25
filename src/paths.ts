import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { CONFIG_DIR_NAME, SESSION_FILE, CONFIG_FILE, UPDATE_CHECK_FILE } from './constants.js';

export function configDir(): string {
  const dir = join(homedir(), CONFIG_DIR_NAME);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function sessionPath(): string {
  return join(configDir(), SESSION_FILE);
}

export function configPath(): string {
  return join(configDir(), CONFIG_FILE);
}

export function updateCheckPath(): string {
  return join(configDir(), UPDATE_CHECK_FILE);
}
