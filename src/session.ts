import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { sessionPath } from './paths.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';

/**
 * Session storage supports two auth methods:
 *
 *   - api_token (preferred, since v0.2.0): a long-lived `aca_<43 chars>` token
 *     issued from app.aca.io → Settings → CLI Tokens. No refresh. Works for
 *     any user including Google sign-in.
 *
 *     The token itself is never sent to PostgREST or edge functions directly
 *     for /rest/v1/* calls — PostgREST's own JWT verification rejects any
 *     Authorization bearer that isn't a signed 3-part JWT, regardless of
 *     what the request's RLS policies would otherwise allow. Instead
 *     `getAccessToken()` exchanges it (via the `cli-token-exchange` edge
 *     function) for a short-lived real Supabase session and caches that
 *     under `derived_access_token` until it's close to expiry, at which
 *     point it transparently re-exchanges. Edge functions that already
 *     accept `aca_` tokens directly (via `_shared/cli-auth.ts`) are happy to
 *     receive the derived JWT instead, so callers don't need to care which
 *     kind of token is in play.
 *
 *   - jwt (legacy, v0.1.x): a Supabase JWT obtained via password grant.
 *     Auto-refreshes via refresh_token. Only works for email/password accounts.
 */

export type AuthMethod = 'api_token' | 'jwt';

export interface Session {
  auth_method?: AuthMethod;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user_id?: string;
  email?: string;
  // Cache for the api_token path: a real session JWT exchanged from
  // access_token, plus when it stops being safe to reuse.
  derived_access_token?: string;
  derived_expires_at?: number;
}

export function readSession(): Session | null {
  const path = sessionPath();
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!data?.access_token) return null;
    // Default legacy sessions to jwt for backwards compat with v0.1.x files.
    if (!data.auth_method) data.auth_method = 'jwt';
    return data as Session;
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  const path = sessionPath();
  writeFileSync(path, JSON.stringify(session, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function clearSession(): void {
  const path = sessionPath();
  if (existsSync(path)) writeFileSync(path, '{}', { mode: 0o600 });
}

/**
 * Store an API token issued by app.aca.io. No network call needed — the
 * caller has already verified the token works (or will discover it doesn't
 * on first use).
 */
export function loginWithToken(token: string): Session {
  if (!token.startsWith('aca_') || token.length < 20) {
    throw new Error('Invalid token format. Expected `aca_<...>`.');
  }
  const session: Session = {
    auth_method: 'api_token',
    access_token: token,
  };
  writeSession(session);
  return session;
}

/**
 * Email + password login (legacy). Only works for users who created their
 * account with a password — Google-auth users must use `loginWithToken`.
 */
export async function loginWithPassword(email: string, password: string): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    // Detect the OAuth-user case and give a better error.
    if (res.status === 400 && /invalid login credentials/i.test(body)) {
      throw new Error(
        'Email/password sign-in failed. If your account uses Google sign-in, ' +
          'generate a token at app.aca.io → Settings → CLI Tokens and run ' +
          '`aca login --token <value>` instead.',
      );
    }
    throw new Error(`Login failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user?: { id?: string; email?: string };
  };
  const session: Session = {
    auth_method: 'jwt',
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user_id: data.user?.id,
    email: data.user?.email,
  };
  writeSession(session);
  return session;
}

async function refreshJwt(session: Session): Promise<Session> {
  if (!session.refresh_token) {
    throw new Error('Session has no refresh token. Run `aca login` again.');
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) throw new Error('Session refresh failed. Run `aca login` again.');
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  };
  const next: Session = {
    ...session,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
  };
  writeSession(next);
  return next;
}

/**
 * Exchange a long-lived `aca_` token for a short-lived real Supabase session
 * via the cli-token-exchange edge function. See the Session doc comment for
 * why this indirection exists.
 */
async function exchangeApiToken(apiToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cli-token-exchange`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Token exchange returned no access token');
  }
  return { access_token: data.access_token, expires_in: data.expires_in ?? 3600 };
}

/**
 * Returns the current access token, refreshing/re-exchanging as needed.
 *
 * - api_token: exchanged for a real session JWT, cached until it's within a
 *   minute of expiry, then transparently re-exchanged from the same `aca_`
 *   token (which itself never expires from the CLI's perspective).
 * - jwt: refreshed via its own refresh_token when close to expiry.
 */
export async function getAccessToken(): Promise<string> {
  const session = readSession();
  if (!session?.access_token) {
    throw new Error('Not logged in. Run `aca login` first.');
  }
  if (session.auth_method === 'api_token') {
    const now = Math.floor(Date.now() / 1000);
    if (session.derived_access_token && session.derived_expires_at && session.derived_expires_at - now > 60) {
      return session.derived_access_token;
    }
    const derived = await exchangeApiToken(session.access_token);
    writeSession({
      ...session,
      derived_access_token: derived.access_token,
      derived_expires_at: Math.floor(Date.now() / 1000) + derived.expires_in,
    });
    return derived.access_token;
  }
  // JWT path
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - now < 60) {
    const refreshed = await refreshJwt(session);
    return refreshed.access_token;
  }
  return session.access_token;
}
