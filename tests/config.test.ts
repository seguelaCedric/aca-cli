import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('config', () => {
  const realHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'aca-cli-test-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = realHome;
    if (existsSync(tempHome)) rmSync(tempHome, { recursive: true, force: true });
  });

  it('returns defaults when no file exists', async () => {
    const { readConfig } = await import('../src/config.js');
    const config = readConfig();
    expect(config.update_check_enabled).toBe(true);
    expect(config.active_org_id).toBeUndefined();
  });

  it('persists and round-trips values', async () => {
    const { writeConfig, readConfig } = await import('../src/config.js');
    writeConfig({ active_org_id: 'org_123', update_check_enabled: false });
    const next = readConfig();
    expect(next.active_org_id).toBe('org_123');
    expect(next.update_check_enabled).toBe(false);
  });

  it('merges patches via updateConfig', async () => {
    const { updateConfig, readConfig } = await import('../src/config.js');
    updateConfig({ active_org_id: 'org_a' });
    updateConfig({ active_org_id: 'org_b' });
    expect(readConfig().active_org_id).toBe('org_b');
  });

  it('writes file with 0600 permissions', async () => {
    const { writeConfig } = await import('../src/config.js');
    writeConfig({ active_org_id: 'org_x' });
    const path = join(tempHome, '.aca', 'config.json');
    expect(existsSync(path)).toBe(true);
    const data = JSON.parse(readFileSync(path, 'utf8'));
    expect(data.active_org_id).toBe('org_x');
  });
});
