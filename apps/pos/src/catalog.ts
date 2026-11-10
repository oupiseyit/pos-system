// Local catalog cache (03 §5): products, categories, customers and settings in localStorage.
// Products and customers refresh as deltas (`updatedSince`); the sell screen reads only from here.
import type { Category, Customer, Product, Settings } from '../../backoffice/src/types';
import { api } from './api';
import { K, read, write } from './store';

type Stamped = { id: string; updatedAt: string };
export type CachedProduct = Product & { updatedAt: string };
export type CachedCustomer = Customer & { updatedAt: string };

interface Sync {
  productsSince?: string;
  customersSince?: string;
  at?: string;
}

export const products = () => read<CachedProduct[]>(K.products, []);
export const categories = () => read<Category[]>(K.categories, []);
export const customers = () => read<CachedCustomer[]>(K.customers, []);
export const settings = () => read<Settings | null>(K.settings, null);
export const lastSync = () => read<Sync>(K.sync, {}).at;

/** Every page of a paginated list changed since `since`. */
async function changed<T extends Stamped>(path: string, since?: string) {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      updatedSince: since ?? new Date(0).toISOString(),
      page: String(page),
      limit: '200',
    });
    const r = await api<{ data: T[]; total: number }>(`${path}?${q}`);
    out.push(...r.data);
    if (page * 200 >= r.total) return out;
  }
}

/** Merge changed rows into the cached list; `keep` drops rows (e.g. deactivated products). */
export function merge<T extends Stamped>(cached: T[], fresh: T[], keep: (x: T) => boolean = () => true) {
  const map = new Map(cached.map((x) => [x.id, x]));
  for (const x of fresh) {
    if (keep(x)) map.set(x.id, x);
    else map.delete(x.id);
  }
  return [...map.values()].sort((a, b) =>
    'name' in a && 'name' in b ? String(a.name).localeCompare(String(b.name)) : 0,
  );
}
/** Newest updatedAt seen: the next delta starts there (server clock, so no skew). */
const newest = (rows: Stamped[], prev?: string) =>
  rows.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), prev ?? new Date(0).toISOString());

// ponytail: customers deleted in the back office stay cached until the till is set up again
export async function refresh() {
  const sync = read<Sync>(K.sync, {});
  const [p, c, cats, s] = await Promise.all([
    changed<CachedProduct>('/products', sync.productsSince),
    changed<CachedCustomer>('/customers', sync.customersSince),
    api<Category[]>('/categories'),
    api<Settings>('/settings'),
  ]);
  write(
    K.products,
    merge(products(), p, (x) => x.active),
  );
  write(K.customers, merge(customers(), c));
  write(K.categories, cats);
  write(K.settings, s);
  write(K.sync, {
    productsSince: newest(p, sync.productsSince),
    customersSince: newest(c, sync.customersSince),
    at: new Date().toISOString(),
  });
}

/** A customer created at the till goes straight into the cache. */
export const addCustomer = (c: CachedCustomer) => write(K.customers, merge(customers(), [c]));
