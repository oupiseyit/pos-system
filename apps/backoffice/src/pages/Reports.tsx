// B8 Reports — mockups/v2/b8-reports.html. Route: #/reports/:report
import { useState } from 'react';
import { downloadCsv, qs } from '../api';
import { cents, isoDay, methodLabel, money, moneyCents, presetRange, type Preset } from '../format';
import { Empty, go, Loading, Seg, useLoad, useRoute, useSession, useToast } from '../ui';

type Row = Record<string, string | number | null>;
interface Col {
  key: string;
  label: string;
  kind: 'text' | 'int' | 'money';
  /** Summed in the totals row */
  sum?: boolean;
  fmt?: (v: Row[string]) => string;
}
interface Report {
  id: string;
  title: string;
  desc: string;
  dated: boolean;
  cols: Col[];
}

const m = (key: string, label: string, sum = true): Col => ({ key, label, kind: 'money', sum });
const n = (key: string, label: string, sum = true): Col => ({ key, label, kind: 'int', sum });
const t = (key: string, label: string, fmt?: Col['fmt']): Col => ({ key, label, kind: 'text', fmt });

const REPORTS: Report[] = [
  {
    id: 'daily',
    title: 'Daily',
    desc: 'Totals per day. Voided sales are excluded.',
    dated: true,
    cols: [
      t('date', 'Date'),
      n('salesCount', 'Sales'),
      m('subtotal', 'Subtotal'),
      m('discount', 'Discount'),
      m('tax', 'Tax'),
      m('total', 'Total'),
    ],
  },
  {
    id: 'products',
    title: 'Products',
    desc: 'Quantity and revenue per product. Margin uses the current cost.',
    dated: true,
    cols: [
      t('sku', 'SKU'),
      t('name', 'Product'),
      n('qty', 'Qty'),
      m('net', 'Net'),
      m('tax', 'Tax'),
      m('total', 'Total'),
      m('cost', 'Cost'),
      m('margin', 'Margin'),
    ],
  },
  {
    id: 'cashiers',
    title: 'Cashiers',
    desc: 'Sales and voids per cashier.',
    dated: true,
    cols: [t('name', 'Cashier'), n('salesCount', 'Sales'), n('voidCount', 'Voids'), m('total', 'Total')],
  },
  {
    id: 'payments',
    title: 'Payments',
    desc: 'Totals by payment method, with expected cash for cash-up.',
    dated: true,
    cols: [
      t('method', 'Method', (v) => methodLabel(String(v))),
      n('count', 'Payments'),
      m('amount', 'Amount'),
      m('tendered', 'Tendered'),
      m('change', 'Change'),
    ],
  },
  {
    id: 'low-stock',
    title: 'Low stock',
    desc: 'Active products at or below their reorder level, negative first.',
    dated: false,
    cols: [
      t('sku', 'SKU'),
      t('name', 'Product'),
      n('stockQty', 'Stock', false),
      n('reorderLevel', 'Reorder level', false),
    ],
  },
  {
    id: 'inventory-value',
    title: 'Inventory value',
    desc: 'Stock on hand at cost. Negative stock counts as 0.',
    dated: false,
    cols: [
      t('sku', 'SKU'),
      t('name', 'Product'),
      n('stockQty', 'Stock', false),
      m('cost', 'Unit cost', false),
      m('value', 'Value'),
    ],
  },
];

const PRESETS: [Preset, string][] = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['custom', 'Custom'],
];

export function Reports() {
  const { parts } = useRoute();
  const { lowStock } = useSession();
  const toast = useToast();
  const rep = REPORTS.find((r) => r.id === parts[1]) ?? REPORTS[0];
  const [preset, setPreset] = useState<Preset>('today');
  const [[from, to], setRange] = useState(() => presetRange('today'));
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const valid = !rep.dated || (from && to && from <= to);
  const query = rep.dated ? qs({ from, to }) : '';
  const res = useLoad<{ data?: Row[]; items?: Row[]; totals?: Row; totalValue?: string }>(
    valid ? `/reports/${rep.id}${query}` : null,
  );

  const rows = [...(res.data?.data ?? res.data?.items ?? [])];
  if (sort) {
    const col = rep.cols.find((c) => c.key === sort.key);
    rows.sort((a, b) => {
      const d =
        col?.kind === 'text'
          ? String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''))
          : Number(a[sort.key] ?? 0) - Number(b[sort.key] ?? 0);
      return sort.desc ? -d : d;
    });
  }
  const totals: Row =
    res.data?.totals ??
    Object.fromEntries(
      rep.cols
        .filter((c) => c.sum && c.kind !== 'text')
        .map((c) => {
          const s = rows.reduce((acc, r) => acc + (c.kind === 'money' ? cents(r[c.key]) : Number(r[c.key] ?? 0)), 0);
          return [c.key, c.kind === 'money' ? (s / 100).toFixed(2) : s];
        }),
    );
  const expectedCash = rep.id === 'payments' ? (rows.find((r) => r.method === 'CASH')?.amount ?? '0') : null;

  const cell = (c: Col, v: Row[string]) =>
    v === null || v === undefined ? '—' : c.fmt ? c.fmt(v) : c.kind === 'money' ? money(v) : String(v);
  const toggle = (key: string) => setSort((s) => (s?.key === key ? { key, desc: !s.desc } : { key, desc: false }));

  async function exportCsv() {
    try {
      await downloadCsv(
        `/reports/${rep.id}${qs({ ...(rep.dated && { from, to }), format: 'csv' })}`,
        `${rep.id}${rep.dated ? `-${from}-${to}` : `-${isoDay()}`}.csv`,
      );
    } catch (err) {
      toast((err as Error).message);
    }
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>{rep.title}</h1>
          <p>{rep.desc}</p>
        </div>
        <button className="btn" onClick={exportCsv} disabled={!valid}>
          <span className="ico s i-download" />
          Export CSV
        </button>
      </div>
      <div className="rep-grid">
        <nav className="card rep" style={{ padding: 8 }} aria-label="Report">
          {REPORTS.map((r) => (
            <button
              key={r.id}
              className={r === rep ? 'on' : undefined}
              aria-current={r === rep ? 'page' : undefined}
              onClick={() => {
                setSort(null);
                go(`/reports/${r.id}`);
              }}
            >
              {r.title}
              {r.id === 'low-stock' && lowStock > 0 && (
                <span className="badge warn plain" style={{ marginLeft: 'auto' }}>
                  {lowStock}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="stack">
          {rep.dated && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Seg
                label="Date preset"
                value={preset}
                options={PRESETS}
                onChange={(p) => {
                  setPreset(p);
                  if (p !== 'custom') setRange(presetRange(p));
                }}
              />
              <div className="grow" />
              <input
                className="input"
                type="date"
                style={{ width: 'auto' }}
                aria-label="From"
                value={from}
                onChange={(e) => (setPreset('custom'), setRange([e.target.value, to]))}
              />
              <span className="t3">→</span>
              <input
                className="input"
                type="date"
                style={{ width: 'auto' }}
                aria-label="To"
                value={to}
                onChange={(e) => (setPreset('custom'), setRange([from, e.target.value]))}
              />
            </div>
          )}
          {!valid && (
            <div className="note bad" role="alert">
              <span className="ico s i-alert" />
              Pick a start date on or before the end date.
            </div>
          )}
          <div className={expectedCash !== null ? 'rep-cash' : undefined}>
            <section className="card" style={{ overflowX: 'auto' }}>
              {res.loading && !res.data ? (
                <Loading />
              ) : !rows.length ? (
                <Empty msg={rep.dated ? 'No sales in this period' : 'Nothing to show'} />
              ) : (
                <table className="tbl static">
                  <thead>
                    <tr>
                      {rep.cols.map((c) => (
                        <th
                          key={c.key}
                          className={`sort ${c.kind === 'text' ? '' : 'r'}`}
                          aria-sort={sort?.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
                        >
                          <button
                            className="linkish"
                            style={{ color: 'inherit', fontWeight: 'inherit' }}
                            onClick={() => toggle(c.key)}
                          >
                            {c.label}
                            {sort?.key === c.key && (sort.desc ? ' ↓' : ' ↑')}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={String(r.productId ?? r.cashierId ?? r.method ?? r.date ?? i)}>
                        {rep.cols.map((c) => (
                          <td
                            key={c.key}
                            className={
                              c.kind === 'text'
                                ? c.key === 'name' || c.key === 'method'
                                  ? 'cell-main'
                                  : 'num t2'
                                : `r num ${c.key === 'stockQty' && Number(r[c.key]) < 0 ? 'neg' : ''}`
                            }
                          >
                            {cell(c, r[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {rep.cols.some((c) => c.sum && c.kind !== 'text') && (
                    <tfoot>
                      <tr>
                        {rep.cols.map((c, i) => (
                          <td key={c.key} className={c.kind === 'text' ? undefined : 'r num'}>
                            {i === 0
                              ? 'Total'
                              : c.sum && c.kind !== 'text'
                                ? cell(
                                    c,
                                    rep.id === 'inventory-value' && c.key === 'value'
                                      ? (res.data?.totalValue ?? null)
                                      : totals[c.key],
                                  )
                                : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </section>
            {expectedCash !== null && (
              <div
                className="card"
                style={{ padding: 20, background: 'linear-gradient(160deg,#0e6b4e,#0a4a37)', color: '#fff', border: 0 }}
              >
                <div style={{ opacity: 0.8, fontWeight: 500 }}>Expected cash in drawer</div>
                <div
                  className="num"
                  style={{ fontSize: 36, fontWeight: 650, letterSpacing: '-.04em', margin: '6px 0 10px' }}
                >
                  {moneyCents(cents(expectedCash))}
                </div>
                <div className="sm" style={{ opacity: 0.75 }}>
                  Cash taken minus change given, completed sales only. All tills,{' '}
                  {from === to ? from : `${from} → ${to}`}.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
