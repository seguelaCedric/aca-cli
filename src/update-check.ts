import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { updateCheckPath } from './paths.js';
import { NPM_REGISTRY_URL, UPDATE_CHECK_INTERVAL_MS } from './constants.js';
import { readConfig } from './config.js';

interface CheckCache {
  last_check_at: number;
  latest_version?: string;
}

function readCache(): CheckCache | null {
  const path = updateCheckPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CheckCache;
  } catch {
    return null;
  }
}

function writeCache(cache: CheckCache): void {
  writeFileSync(updateCheckPath(), JSON.stringify(cache, null, 2), { mode: 0o600 });
}

function isNewer(current: string, latest: string): boolean {
  const c = current.split('.').map((n) => parseInt(n, 10));
  const l = latest.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const ci = c[i] ?? 0;
    const li = l[i] ?? 0;
    if (li > ci) return true;
    if (li < ci) return false;
  }
  return false;
}

export async function maybeCheckForUpdate(currentVersion: string): Promise<void> {
  const config = readConfig();
  if (config.update_check_enabled === false) return;

  const cache = readCache();
  const now = Date.now();
  if (cache && now - cache.last_check_at < UPDATE_CHECK_INTERVAL_MS) {
    if (cache.latest_version && isNewer(currentVersion, cache.latest_version)) {
      notify(currentVersion, cache.latest_version);
    }
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(NPM_REGISTRY_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return;
    const data = (await res.json()) as { version?: string };
    const latest = data.version;
    if (!latest) return;
    writeCache({ last_check_at: now, latest_version: latest });
    if (isNewer(currentVersion, latest)) notify(currentVersion, latest);
  } catch {
    // Silent failure — update check is best-effort.
  }
}

function notify(current: string, latest: string): void {
  process.stderr.write(
    `\n→ aca-cli ${latest} is available (you have ${current}). Run \`npm i -g @seguelac/aca-cli\` to update.\n   Disable with \`aca config set update_check_enabled false\`.\n\n`,
  );
}
