import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { sessionPath } from './paths.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';

/**
 * Session storage supports two auth methods:
 *
 *   - api_token (preferred, since v0.2.0): a long-lived `aca_<43 chars>` token
 *     issued from app.aca.io → Settings → CLI Tokens. No refresh. Works for
 *     any user including Google sign-in. The token IS the access token.
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
 * Returns the current access token, refreshing the JWT if needed. API tokens
 * are long-lived and never refreshed.
 */
export async function getAccessToken(): Promise<string> {
  const session = readSession();
  if (!session?.access_token) {
    throw new Error('Not logged in. Run `aca login` first.');
  }
  if (session.auth_method === 'api_token') {
    return session.access_token;
  }
  // JWT path
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - now < 60) {
    const refreshed = await refreshJwt(session);
    return refreshed.access_token;
  }
  return session.access_token;
}
