// localStorage as JSON, with change notifications so React re-renders (useSyncExternalStore).
// Everything the till needs offline lives here: device, session, catalog, outbox (03 §5).
import { useSyncExternalStore } from 'react';

export const K = {
  device: 'pos.device', // { code }
  counter: 'pos.counter', // last receipt number used on this till
  session: 'pos.session', // { token, user }
  users: 'pos.users', // people who logged in here before: [{ email, name }]
  fails: 'pos.fails', // wrong PINs per email since the last success
  outbox: 'pos.outbox',
  products: 'pos.products',
  categories: 'pos.categories',
  customers: 'pos.customers',
  settings: 'pos.settings',
  sync: 'pos.sync', // { productsSince, customersSince, at }
} as const;

let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};
if (typeof window !== 'undefined') addEventListener('storage', bump); // another tab changed it

const cache = new Map<string, { raw: string | null; value: unknown }>();

/** Parsed value (cached until the stored string changes). Treat the result as read-only. */
export function read<T>(key: string, fallback: T): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value = fallback;
  if (raw !== null)
    try {
      value = JSON.parse(raw) as T;
    } catch {
      // corrupt entry: fall back
    }
  cache.set(key, { raw, value });
  return value;
}

/** Throws if storage is full or blocked, on purpose: a sale must never look saved when it isn't. */
export function write(key: string, value: unknown) {
  if (value === undefined || value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
  bump();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** Re-render whenever anything in the store changes. */
export const useStore = () => useSyncExternalStore(subscribe, () => version);

/* ---------- Online status ---------- */
const onNet = (l: () => void) => {
  addEventListener('online', l);
  addEventListener('offline', l);
  return () => {
    removeEventListener('online', l);
    removeEventListener('offline', l);
  };
};
export const useOnline = () => useSyncExternalStore(onNet, () => navigator.onLine);
