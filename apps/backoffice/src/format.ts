// Display helpers: money strings from the API ("12.50") and shop-local dates.

/** API money string → integer cents (display math only; the server owns real totals). */
export const cents = (s: string | number | null | undefined) => Math.round(Number(s ?? 0) * 100);

const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "1240.5" → "1,240.50" */
export const money = (s: string | number | null | undefined) => nf.format(cents(s) / 100);
export const moneyCents = (c: number) => nf.format(c / 100);

// ponytail: one module-level shop timezone, set once from /settings on login
let tz = 'UTC';
export const setShopTz = (zone: string) => {
  tz = zone;
};

const part = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', ...opts })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );

/** Shop-local calendar day, YYYY-MM-DD (what report `from`/`to` expect). */
export const isoDay = (d = new Date()) => {
  const p = part(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
};

/** Calendar arithmetic on YYYY-MM-DD strings. */
export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "05/11/2026 16:30" */
export const dateTime = (iso: string) => {
  const p = part(new Date(iso), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};
/** "05/11 16:30" */
export const shortDateTime = (iso: string) => dateTime(iso).replace(/\/\d{4}/, '');
/** "05/11/2026" */
export const date = (iso: string) => dateTime(iso).slice(0, 10);
/** "16:30" */
export const time = (iso: string) => dateTime(iso).slice(11);

export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

/** Date range for a report preset. Weeks start on Monday. */
export function presetRange(preset: Exclude<Preset, 'custom'>, today = isoDay()): [string, string] {
  switch (preset) {
    case 'today':
      return [today, today];
    case 'yesterday':
      return [addDays(today, -1), addDays(today, -1)];
    case 'week': {
      const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
      return [addDays(today, -dow), today];
    }
    case 'month':
      return [`${today.slice(0, 8)}01`, today];
  }
}

const COLORS = ['#2459b3', '#0e6b4e', '#a8670a', '#6b3f86', '#b3245e', '#1f7a8c'];
/** Avatar initials and a stable color per name. */
export function avatar(name: string) {
  const words = name.trim().split(/\s+/);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  const hash = [...name].reduce((h, c) => h + c.charCodeAt(0), 0);
  return { initials, color: COLORS[hash % COLORS.length] };
}

export const methodLabel = (m: string) => ({ CASH: 'Cash', CARD: 'Card', OTHER: 'Other' })[m] ?? m;
