// fetch for the till. Unlike the back office, a 401 never logs the cashier out: selling goes on
// offline-style and sync resumes after the next PIN login (03 §5).
import { ApiError } from '../../backoffice/src/api';
import type { Me } from '../../backoffice/src/types';
import { K, read } from './store';

export { ApiError };

export interface Session {
  token: string;
  user: Me;
}

export async function api<T>(path: string, method = 'GET', body?: unknown, token?: string): Promise<T> {
  const t = token ?? read<Session | null>(K.session, null)?.token;
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(t && { Authorization: `Bearer ${t}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
    throw new ApiError(res.status, b.error ?? res.statusText, b.details);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** fetch() rejects only when the request never reached a server. */
export const isNetworkError = (e: unknown) => e instanceof TypeError;
