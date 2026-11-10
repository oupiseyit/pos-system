// fetch wrapper: bearer token, JSON in/out, `{ error, details }` → ApiError, 401 → back to login.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const KEY = 'bo.token';
const store = {
  get: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(KEY, t);
      else localStorage.removeItem(KEY);
    } catch {
      // private mode: token lives in memory only
    }
  },
};

let token = store.get();
let onUnauthorized = () => {};

export const getToken = () => token;
export const setToken = (t: string | null) => {
  token = t;
  store.set(t);
};
export const setOnUnauthorized = (fn: () => void) => {
  onUnauthorized = fn;
};

/** Query string from an object, skipping empty values. */
export const qs = (q: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

async function request(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && token) {
    // Expired or revoked session: drop it; the app shows login and keeps the current URL
    setToken(null);
    onUnauthorized();
  }
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
    throw new ApiError(res.status, b.error ?? res.statusText, b.details);
  }
  return res;
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await request(path, method, body);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Fetch a report as CSV (needs the auth header, so no plain link) and save it. */
export async function downloadCsv(path: string, filename: string) {
  const blob = await (await request(path, 'GET')).blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0); // revoking synchronously can cancel the download
}

/** Field errors from a 400 (zod `details`) or a 409 (`details.field`). */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || !e.details || typeof e.details !== 'object') return {};
  const d = e.details as Record<string, unknown>;
  if (e.status === 409 && typeof d.field === 'string') return { [d.field]: 'Already used' };
  if (e.status !== 400) return {};
  return Object.fromEntries(
    Object.entries(d)
      .filter(([, v]) => Array.isArray(v) && v.length)
      .map(([k, v]) => [k, String((v as unknown[])[0])]),
  );
}
