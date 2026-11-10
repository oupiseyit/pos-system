// B5 Inventory — mockups/v2/b5-inventory.html. Routes: #/inventory[/receive|/count|/movements][?p=productId]
import { useState, type FormEvent } from 'react';
import { api, qs } from '../api';
import { shortDateTime } from '../format';
import type { Movement, Page, Product, Reason } from '../types';
import { Empty, Field, go, inp, Loading, Pager, Picker, useLoad, useRoute, useToast } from '../ui';

const TABS = [
  ['receive', 'Receive'],
  ['count', 'Count'],
  ['movements', 'Movements'],
] as const;

export function Inventory() {
  const { parts, q } = useRoute();
  const tab = parts[1] ?? 'receive';
  const p = q.get('p');
  // A product handed over from B3 ("Receive stock" / "Count stock")
  const pre = useLoad<Product>(p && `/products/${p}`);
  const ready = !p || pre.data || pre.error;
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Inventory</h1>
          <p>Receive deliveries, count shelves and review every stock movement.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'on' : undefined}
            onClick={() => go(`/inventory/${k}`)}
          >
            {label}
          </button>
        ))}
      </div>
      {!ready ? (
        <Loading />
      ) : tab === 'count' ? (
        <Count key={p} initial={pre.data ?? null} />
      ) : tab === 'movements' ? (
        <Movements />
      ) : (
        <Receive key={p} initial={pre.data ?? null} />
      )}
    </div>
  );
}

/** Search-or-scan product field; Enter on a scanned barcode or SKU picks it. */
function ProductPicker(props: {
  id: string;
  product: Product | null;
  onPick: (p: Product | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <Picker<Product>
      id={props.id}
      value={props.product}
      onPick={props.onPick}
      search={(s) => `/products${qs({ search: s, active: 'all', limit: 10 })}`}
      label={(p) => `${p.name} · ${p.sku}`}
      exact={(p, s) => p.barcode === s || p.sku.toLowerCase() === s.toLowerCase()}
      placeholder={props.placeholder ?? 'Search or scan a product'}
      ariaLabel={props.ariaLabel}
    />
  );
}

/* ---------- Receive ---------- */
interface Line {
  key: number;
  product: Product | null;
  qty: string;
  cost: string;
}
let nextKey = 1;
const blank = (product: Product | null = null): Line => ({ key: nextKey++, product, qty: '', cost: '' });

function Receive({ initial }: { initial: Product | null }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>(() => [blank(initial)]);
  const [summary, setSummary] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const ready = lines.filter((l) => l.product && Number(l.qty) > 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/inventory/receive', 'POST', {
        note,
        items: ready.map((l) => ({ productId: l.product?.id, qty: Number(l.qty), ...(l.cost && { cost: l.cost }) })),
      });
      setSummary(
        ready.map((l) => `${l.product?.sku} ${l.product?.stockQty} → ${(l.product?.stockQty ?? 0) + Number(l.qty)}`),
      );
      setLines([blank()]);
      setNote('');
      toast('Delivery saved', 'ok');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ maxWidth: 900 }}>
      <form className="card" onSubmit={save}>
        <div className="card-b" style={{ paddingBottom: 14 }}>
          <Field id="rn" label="Note">
            <input
              {...inp('rn')}
              placeholder="Supplier and invoice number"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <table className="tbl static">
          <thead>
            <tr>
              <th>Product</th>
              <th className="r" style={{ width: 120 }}>
                Qty
              </th>
              <th className="r" style={{ width: 170 }}>
                New cost <span className="t3">(optional)</span>
              </th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td>
                  <ProductPicker
                    id={`rp${l.key}`}
                    ariaLabel={`Product, row ${i + 1}`}
                    product={l.product}
                    onPick={(product) => set(l.key, { product })}
                  />
                </td>
                <td>
                  <input
                    className="input num r"
                    type="number"
                    min={1}
                    aria-label={`Qty, row ${i + 1}`}
                    value={l.qty}
                    onChange={(e) => set(l.key, { qty: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input num r"
                    inputMode="decimal"
                    placeholder={l.product ? l.product.cost : '—'}
                    aria-label={`New cost, row ${i + 1}`}
                    value={l.cost}
                    onChange={(e) => set(l.key, { cost: e.target.value })}
                  />
                </td>
                <td>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      aria-label={`Remove row ${i + 1}`}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      <span className="ico s i-x" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-f" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn" onClick={() => setLines((ls) => [...ls, blank()])}>
            <span className="ico s i-plus" />
            Add row
          </button>
          <button className="btn btn-primary" disabled={busy || !ready.length}>
            Save receipt
          </button>
        </div>
      </form>
      {summary && (
        <div className="note info" style={{ marginTop: 16, display: 'block' }} role="status">
          <b>Saved.</b> New stock:{' '}
          {summary.map((s, i) => (
            <span key={s}>
              {i > 0 && ' · '}
              <span className="num">{s}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Count ---------- */
function Count({ initial }: { initial: Product | null }) {
  const toast = useToast();
  const [product, setProduct] = useState(initial);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const change = product && counted !== '' ? Number(counted) - product.stockQty : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    setBusy(true);
    try {
      const r = await api<{ movement: unknown }>('/inventory/adjust', 'POST', {
        productId: product.id,
        countedQty: Number(counted),
        note,
      });
      toast(
        r.movement ? `Recorded ${signed(change ?? 0)} for ${product.name}` : 'Count matches; nothing recorded',
        'ok',
      );
      setProduct(await api<Product>(`/products/${product.id}`));
      setCounted('');
      setNote('');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ maxWidth: 560 }}>
      <form className="card" onSubmit={save}>
        <div className="card-b stack">
          <Field id="cp" label="Product">
            <ProductPicker id="cp" product={product} onPick={setProduct} />
          </Field>
          {product && (
            <div
              className="between"
              style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r)' }}
            >
              <span className="t2">Current stock</span>
              <span className="num" style={{ fontSize: 22, fontWeight: 650 }}>
                {product.stockQty}
              </span>
            </div>
          )}
          <div className="g2">
            <Field id="cq" label="Counted qty" req>
              <input
                {...inp('cq', undefined, 'num')}
                type="number"
                min={0}
                required
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </Field>
            <Field id="cn" label="Note" req>
              <input {...inp('cn')} required value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="card-f" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span aria-live="polite">
            {change !== null && (
              <>
                This will record{' '}
                <b className={`num ${change < 0 ? 'down' : change > 0 ? 'up' : ''}`}>{signed(change)}</b>
              </>
            )}
          </span>
          <button className="btn btn-primary" disabled={busy || !product || counted === '' || !note.trim()}>
            Confirm count
          </button>
        </div>
      </form>
    </section>
  );
}
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/* ---------- Movements ---------- */
export const REASON: Record<Reason, [string, string]> = {
  SALE: ['Sale', ''],
  RECEIVE: ['Receive', 'ok'],
  ADJUST: ['Count', 'warn'],
  RETURN: ['Void', 'bad'],
};

function Movements() {
  const [product, setProduct] = useState<Product | null>(null);
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const list = useLoad<Page<Movement>>(
    `/inventory/movements${qs({ productId: product?.id, reason, from, to, page, limit: 50 })}`,
  );
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <section className="card">
      <div className="filters">
        <div className="grow">
          <ProductPicker
            id="mp"
            product={product}
            onPick={reset(setProduct)}
            placeholder="Any product"
            ariaLabel="Product"
          />
        </div>
        <select className="input" aria-label="Reason" value={reason} onChange={(e) => reset(setReason)(e.target.value)}>
          <option value="">All reasons</option>
          {Object.entries(REASON).map(([k, [l]]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="date"
          aria-label="From"
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
        />
        <span className="t3">→</span>
        <input
          className="input"
          type="date"
          aria-label="To"
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
        />
      </div>
      {list.loading && !list.data ? (
        <Loading />
      ) : !list.data?.data.length ? (
        <Empty msg="No stock movements match" />
      ) : (
        <>
          <table className="tbl static">
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th className="r">Change</th>
                <th>Reason</th>
                <th>Receipt</th>
                <th>User</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((m) => (
                <tr key={m.id}>
                  <td className="num t2">{shortDateTime(m.createdAt)}</td>
                  <td className="cell-main">{m.productName}</td>
                  <td className={`r num ${m.qtyChange < 0 ? 'down' : 'up'}`}>{signed(m.qtyChange)}</td>
                  <td>
                    <span className={`badge plain ${REASON[m.reason][1]}`}>{REASON[m.reason][0]}</span>
                  </td>
                  <td>
                    {m.saleId ? (
                      <a className="num" href={`#/sales/${m.saleId}`}>
                        {m.receiptNo}
                      </a>
                    ) : (
                      <span className="t3">—</span>
                    )}
                  </td>
                  <td>{m.userName}</td>
                  <td className={m.note ? undefined : 't3'}>{m.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager {...list.data} onPage={setPage} />
        </>
      )}
    </section>
  );
}
