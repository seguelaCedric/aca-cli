import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('session', () => {
  const realHome = process.env.HOME;
  let tempHome: string;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'aca-cli-session-test-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = realHome;
    globalThis.fetch = realFetch;
    if (existsSync(tempHome)) rmSync(tempHome, { recursive: true, force: true });
  });

  it('readSession returns null when no file exists', async () => {
    const { readSession } = await import('../src/session.js');
    expect(readSession()).toBeNull();
  });

  it('loginWithToken stores an api_token session and returns it', async () => {
    const { loginWithToken, readSession } = await import('../src/session.js');
    const token = 'aca_TestTokenWithLotsOfPaddingCharactersAbcdef1234';
    const session = loginWithToken(token);
    expect(session.auth_method).toBe('api_token');
    expect(session.access_token).toBe(token);
    expect(session.refresh_token).toBeUndefined();

    const persisted = readSession();
    expect(persisted?.auth_method).toBe('api_token');
    expect(persisted?.access_token).toBe(token);
  });

  it('loginWithToken rejects tokens that do not start with aca_', async () => {
    const { loginWithToken } = await import('../src/session.js');
    expect(() => loginWithToken('ghp_thiswontwork')).toThrow(/Invalid token format/);
  });

  it('loginWithToken rejects tokens that are too short', async () => {
    const { loginWithToken } = await import('../src/session.js');
    expect(() => loginWithToken('aca_short')).toThrow(/Invalid token format/);
  });

  it('getAccessToken exchanges an api_token for a derived session JWT and caches it', async () => {
    const { loginWithToken, getAccessToken, readSession } = await import('../src/session.js');
    const token = 'aca_AnotherTokenWithEnoughCharactersToBeAcceptedXyz';
    loginWithToken(token);

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'derived.jwt.one', expires_in: 3600 }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await getAccessToken()).toBe('derived.jwt.one');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: `Bearer ${token}` });

    // Cached: a second call within the expiry window doesn't re-exchange.
    expect(await getAccessToken()).toBe('derived.jwt.one');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readSession()?.derived_access_token).toBe('derived.jwt.one');
  });

  it('getAccessToken re-exchanges an api_token once the derived session is near expiry', async () => {
    const { loginWithToken, getAccessToken } = await import('../src/session.js');
    loginWithToken('aca_ExpiryTestTokenWithEnoughCharactersAbcdefghij');

    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      return new Response(
        JSON.stringify({ access_token: `derived.jwt.${call}`, expires_in: call === 1 ? 30 : 3600 }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    expect(await getAccessToken()).toBe('derived.jwt.1');
    expect(await getAccessToken()).toBe('derived.jwt.2');
  });

  it('getAccessToken surfaces a clear error when the exchange fails', async () => {
    const { loginWithToken, getAccessToken } = await import('../src/session.js');
    loginWithToken('aca_FailureTestTokenWithEnoughCharactersAbcdefgh');
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    await expect(getAccessToken()).rejects.toThrow(/Token exchange failed \(401\)/);
  });

  it('clearSession wipes the file', async () => {
    const { loginWithToken, clearSession, readSession } = await import('../src/session.js');
    loginWithToken('aca_YetAnotherTokenWithSufficientLengthAbcdefghij');
    expect(readSession()).not.toBeNull();
    clearSession();
    expect(readSession()).toBeNull();
  });

  it('legacy v0.1.x sessions (no auth_method) default to jwt', async () => {
    const { writeSession, readSession } = await import('../src/session.js');
    // Simulate a v0.1.x session file (no auth_method field, has refresh_token).
    writeSession({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.legacyjwt',
      refresh_token: 'refreshme',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      email: 'old@example.com',
    } as unknown as Parameters<typeof writeSession>[0]);
    const next = readSession();
    expect(next?.auth_method).toBe('jwt');
    expect(next?.email).toBe('old@example.com');
  });
});
