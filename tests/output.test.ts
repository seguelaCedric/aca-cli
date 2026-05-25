import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { output } from '../src/output.js';

describe('output', () => {
  const logs: string[] = [];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs.length = 0;
    logSpy = vi.spyOn(console, 'log').mockImplementation((s: unknown) => {
      logs.push(String(s));
    });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((s: unknown) => {
      logs.push(String(s));
      return true;
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('emits valid JSON when --json is set', () => {
    output({ a: 1 }, { json: true });
    expect(JSON.parse(logs.join(''))).toEqual({ a: 1 });
  });

  it('prints "(no data)" for null', () => {
    output(null);
    expect(logs.join('\n')).toContain('(no data)');
  });

  it('prints "(empty)" for empty array', () => {
    output([]);
    expect(logs.join('\n')).toContain('(empty)');
  });

  it('prints a table for arrays of objects', () => {
    output([{ id: '1', name: 'foo' }, { id: '2', name: 'bar' }]);
    const out = logs.join('\n');
    expect(out).toContain('id');
    expect(out).toContain('name');
    expect(out).toContain('foo');
    expect(out).toContain('bar');
  });

  it('prints key/value for objects', () => {
    output({ alpha: 1, beta: 'two' });
    const out = logs.join('\n');
    expect(out).toMatch(/alpha\s+1/);
    expect(out).toMatch(/beta\s+two/);
  });
});
