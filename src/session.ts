import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { sessionPath } from './paths.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id?: string;
  email?: string;
}

export function readSession(): Session | null {
  const path = sessionPath();
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!data?.access_token) return null;
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

export async function login(email: string, password: string): Promise<Session> {
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
    throw new Error(`Login failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user?: { id?: string; email?: string };
  };
  const session: Session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user_id: data.user?.id,
    email: data.user?.email,
  };
  writeSession(session);
  return session;
}

async function refresh(session: Session): Promise<Session> {
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

export async function getAccessToken(): Promise<string> {
  const session = readSession();
  if (!session?.access_token) {
    throw new Error('Not logged in. Run `aca login` first.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - now < 60) {
    const refreshed = await refresh(session);
    return refreshed.access_token;
  }
  return session.access_token;
}
