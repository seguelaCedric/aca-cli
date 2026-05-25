import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';
import { getAccessToken } from './session.js';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  };
}

export async function restGet<T = unknown>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'GET',
    headers: { ...headers, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`REST GET ${path} -> ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export async function restPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`REST PATCH ${path} -> ${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}

export async function restPost<T = unknown>(
  path: string,
  body: unknown,
  { upsert = false }: { upsert?: boolean } = {},
): Promise<T> {
  const headers = await authHeaders();
  const preferParts = ['return=representation'];
  if (upsert) preferParts.push('resolution=merge-duplicates');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Prefer: preferParts.join(','),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`REST POST ${path} -> ${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}

export async function restDelete(path: string): Promise<unknown> {
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`REST DELETE ${path} -> ${res.status}: ${txt}`);
  }
  return res.status === 204 ? null : await res.json();
}

export async function invokeFn<T = unknown>(name: string, body?: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const obj = parsed as { error?: string; message?: string } | null;
    const msg = obj?.error || obj?.message || text || `${res.status}`;
    throw new Error(`fn ${name} -> ${res.status}: ${msg}`);
  }
  return parsed as T;
}
