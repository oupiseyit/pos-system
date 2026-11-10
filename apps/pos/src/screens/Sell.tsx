// A3 Sell screen + A4 customer dialog + line editor — mockups/v2/a3-sell.html, a4-customer.html
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { avatar, cents, money } from '../../../backoffice/src/format';
import { Dialog, Field, useToast } from '../../../backoffice/src/ui';
import { api, isNetworkError, type Session } from '../api';
import { syncNow, Top, type Cust, type View } from '../App';
import {
  addCustomer,
  categories,
  customers,
  products,
  settings,
  type CachedCustomer,
  type CachedProduct,
} from '../catalog';
import { addProduct, discountCents, setDiscount, setQty, totals, type Line } from '../cart';
import { peekReceiptNo } from '../outbox';
import { K, useOnline, useStore, write } from '../store';
import { Done } from './Done';
import { Pay, type Finished } from './Pay';

/** Tile/line icon from the category name (06 A3); anything unmatched gets a box. */
const ICONS: [RegExp, string][] = [
  [/coffee|latte|espresso/i, 'cup'],
  [/\btea\b/i, 'leaf'],
  [/bak|cake|bread|pastr/i, 'bread'],
  [/drink|water|juice|soda|beverage/i, 'bottle'],
];
export const catIcon = (name?: string) => ICONS.find(([re]) => name && re.test(name))?.[1] ?? 'box';
const CatIc = ({ icon }: { icon: string }) => (
  <span className={`cat-ic t-${icon}`} aria-hidden="true">
    <span className={`ico i-${icon}`} />
  </span>
);

export function Sell(props: {
  session: Session;
  go: (v: View) => void;
  lines: Line[];
  setLines: (f: (l: Line[]) => Line[]) => void;
  customer: Cust | null;
  setCustomer: (c: Cust | null) => void;
  onFinished: (f: Finished) => void;
  /** A6: the sale just completed, shown as the receipt slide-over */
  finished: Finished | null;
  onNew: () => void;
}) {
  useStore();
  const { session, lines, setLines, customer } = props;
  const toast = useToast();
  const online = useOnline();
  const search = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'customer' | 'pay' | { line: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const all = products();
  const byId = new Map(all.map((p) => [p.id, p]));
  const cats = categories();
  const shop = settings();
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const iconOf = (productId: string) => catIcon(catName.get(byId.get(productId)?.categoryId ?? ''));
  // The selected line (last added or tapped) is what the Discount button edits
  const selLine = lines.find((l) => l.productId === sel) ?? lines.at(-1);
  const t = totals(lines);
  const totalCents = cents(t.total);
  const needle = q.trim().toLowerCase();
  const shown = all.filter(
    (p) =>
      (!cat || p.categoryId === cat) &&
      (!needle ||
        p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) ||
        p.barcode?.includes(needle)),
  );
  const fmtTotal = (s: string) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: shop?.currency ?? 'USD' }).format(
        cents(s) / 100,
      );
    } catch {
      return money(s);
    }
  };

  const focus = () => setTimeout(() => search.current?.focus(), 0);
  const add = (p: CachedProduct) => {
    setLines((l) => addProduct(l, p));
    setSel(p.id);
    focus();
  };

  // The scan box keeps focus unless a dialog is open (06 A3)
  const finished = props.finished;
  useEffect(() => {
    if (!dialog && !menu && !finished) search.current?.focus();
  }, [dialog, menu, finished]);

  // Keyboard: F2 search, F4 customer, F9 / Ctrl+Enter pay (Esc is handled by the dialogs)
  const canPay = lines.length > 0 && totalCents >= 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || finished) return;
      if (e.key === 'F2') {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setDialog('customer');
      } else if ((e.key === 'F9' || (e.key === 'Enter' && e.ctrlKey)) && canPay) {
        e.preventDefault();
        setDialog('pay');
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [dialog, canPay, finished]);

  /** Enter after a scan: exact barcode or SKU adds it; otherwise the text just filters. */
  function scan() {
    const v = q.trim();
    if (!v) return;
    const hit = all.find((p) => p.barcode === v || p.sku.toLowerCase() === v.toLowerCase());
    if (hit) {
      add(hit);
      setQ('');
    } else if (shown.length === 1) {
      add(shown[0]);
      setQ('');
    } else if (!shown.length) {
      toast(`No product matches “${v}”`);
      setQ('');
    }
  }

  function clear() {
    if (lines.length && !confirm('Clear this sale?')) return;
    setLines(() => []);
    props.setCustomer(null);
    focus();
  }

  const editing = dialog && typeof dialog === 'object' ? lines.find((l) => l.productId === dialog.line) : undefined;

  return (
    <div className="pos">
      <Top
        onAttention={() => props.go('attention')}
        right={
          <div style={{ position: 'relative' }}>
            <button className="btn" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>
              Menu <span className="ico s i-chev" />
            </button>
            {/* click-away layer closes the menu */}
            {menu && <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={() => setMenu(false)} />}
            {menu && (
              <nav className="menu" role="menu" onClick={() => setMenu(false)}>
                <a role="menuitem" href="#" onClick={(e) => (e.preventDefault(), props.go('recent'))}>
                  <span className="ico s i-receipt" />
                  Recent sales
                </a>
                <a
                  role="menuitem"
                  href="#"
                  aria-disabled={!online}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!online) return;
                    syncNow();
                    toast('Syncing…', 'ok');
                  }}
                >
                  <span className="ico s i-refresh" />
                  Sync now
                  {!online && (
                    <span className="badge warn plain" style={{ marginLeft: 'auto' }}>
                      Needs connection
                    </span>
                  )}
                </a>
                <div className="sep" />
                <a role="menuitem" href="#" onClick={(e) => (e.preventDefault(), lock())}>
                  <span className="ico s i-lock" />
                  Lock
                </a>
                <a role="menuitem" href="#" onClick={(e) => (e.preventDefault(), lock())}>
                  <span className="ico s i-user" />
                  Log out
                </a>
              </nav>
            )}
          </div>
        }
      >
        <span className="who">
          <Av name={session.user.name} size={26} />
          {session.user.name}
        </span>
      </Top>

      <div className="sell">
        <section className="catalog">
          <label className="scan">
            <span className="ico i-search" />
            <input
              ref={search}
              placeholder="Search products or scan a barcode"
              aria-label="Scan or search"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                  e.preventDefault();
                  scan();
                } else if (e.key === 'Escape') setQ('');
              }}
            />
            <button
              type="button"
              className="scan-btn"
              title="Put the cursor in the scan box (F2)"
              onClick={() => search.current?.focus()}
            >
              <span className="ico i-scan" />
              Scan
            </button>
          </label>
          <div className="cats" role="group" aria-label="Category">
            <button className={`cat ${cat ? '' : 'on'}`} aria-pressed={!cat} onClick={() => (setCat(null), focus())}>
              All <b>{all.length}</b>
            </button>
            {cats.map((c) => {
              const n = all.filter((p) => p.categoryId === c.id).length;
              return n ? (
                <button
                  key={c.id}
                  className={`cat ${cat === c.id ? 'on' : ''}`}
                  aria-pressed={cat === c.id}
                  onClick={() => (setCat(c.id), focus())}
                >
                  {c.name} <b>{n}</b>
                </button>
              ) : null;
            })}
          </div>
          {!all.length ? (
            <div className="t2" style={{ padding: 24 }}>
              No products on this till yet.{' '}
              {online ? 'They load after sign-in — try Menu → Sync now.' : 'Connect once to load the catalog.'}
            </div>
          ) : !shown.length ? (
            <div className="t2" style={{ padding: 24 }}>
              No products match “{q}”.
            </div>
          ) : (
            <div className="tiles">
              {shown.map((p) => (
                <button key={p.id} className="tile" onClick={() => add(p)}>
                  <div className="top">
                    <CatIc icon={iconOf(p.id)} />
                    <span className={`left ${p.stockQty <= 0 ? 'out' : p.stockQty <= p.reorderLevel ? 'lo' : ''}`}>
                      {p.stockQty <= 0 ? 'Out' : `${p.stockQty} left`}
                    </span>
                  </div>
                  <div className="nm">{p.name}</div>
                  <div className="pr">{money(p.price)}</div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="cart" aria-label="Current sale">
          <div className="cart-h">
            <h2>Current sale</h2>
            <span className="order" title="Receipt number this sale will get">
              {peekReceiptNo()}
            </span>
          </div>
          <div className="lines">
            {!lines.length && (
              <p className="t3" style={{ padding: '24px 18px', margin: 0 }}>
                Scan or tap a product to start a sale.
              </p>
            )}
            {lines.map((l) => (
              <div
                key={l.productId}
                className={`line ${l === selLine ? 'on' : ''}`}
                tabIndex={0}
                role="button"
                aria-label={`Edit ${l.name}`}
                onClick={() => {
                  setSel(l.productId);
                  setDialog({ line: l.productId });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) setDialog({ line: l.productId });
                }}
              >
                <CatIc icon={iconOf(l.productId)} />
                <span style={{ minWidth: 0 }}>
                  <span className="nm" style={{ display: 'block' }}>
                    {l.name}
                  </span>
                  <span className="each">{money(l.unitPrice)} each</span>
                </span>
                <span className="q" onClick={(e) => e.stopPropagation()}>
                  <button
                    aria-label={`Decrease ${l.name}`}
                    onClick={() => setLines((x) => setQty(x, l.productId, l.qty - 1))}
                  >
                    −
                  </button>
                  <span aria-label="Quantity">{l.qty}</span>
                  <button
                    className="plus"
                    aria-label={`Increase ${l.name}`}
                    onClick={() => {
                      setSel(l.productId);
                      setLines((x) => setQty(x, l.productId, l.qty + 1));
                    }}
                  >
                    +
                  </button>
                </span>
                <span className="amt">
                  {money((cents(l.unitPrice) * l.qty) / 100)}
                  {cents(l.discount) > 0 && <span className="disc">−{money(l.discount)}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="cart-tools">
            <button
              className={`btn ${selLine && cents(selLine.discount) > 0 ? 'set' : ''}`}
              disabled={!selLine}
              title={selLine ? `Discount on ${selLine.name}` : 'Add a product first'}
              onClick={() => selLine && setDialog({ line: selLine.productId })}
            >
              <span className="ico s i-percent" />
              Discount
            </button>
            <button
              className={`btn ${customer ? 'set' : ''}`}
              title="Attach a customer (F4)"
              onClick={() => setDialog('customer')}
            >
              <span className="ico s i-user" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {customer ? customer.name : 'Customer'}
              </span>
              {!customer && <span className="kbd">F4</span>}
            </button>
          </div>
          <div className="sum">
            <div className="between">
              <span>Subtotal</span>
              <span>{money(t.subtotal)}</span>
            </div>
            <div className="between">
              <span>Discount</span>
              <span>{cents(t.discount) ? `−${money(t.discount)}` : '0.00'}</span>
            </div>
            <div className="between">
              <span>Tax</span>
              <span>{money(t.tax)}</span>
            </div>
            <div className="between total">
              <span>Total</span>
              {/* key = value: a new total remounts the span, replaying the bump animation (none for an empty cart) */}
              <span key={t.total} className={totalCents ? 'bump' : undefined} aria-live="polite">
                {fmtTotal(t.total)}
              </span>
            </div>
          </div>
          <div className="cart-act">
            <button className="btn btn-xl" onClick={clear}>
              Clear
            </button>
            <button className="btn btn-primary btn-xl" disabled={!canPay} onClick={() => setDialog('pay')}>
              Pay {money(t.total)}{' '}
              <span className="kbd" style={{ borderColor: '#fff' }}>
                F9
              </span>
            </button>
          </div>
        </aside>
      </div>

      {dialog === 'customer' && (
        <CustomerDialog
          current={customer}
          onRemove={() => {
            props.setCustomer(null);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
          onPick={(c) => {
            props.setCustomer(c);
            setDialog(null);
          }}
        />
      )}
      {editing && (
        <LineEditor
          line={editing}
          stock={byId.get(editing.productId)?.stockQty}
          onClose={() => setDialog(null)}
          onChange={(f) => setLines(f)}
        />
      )}
      {finished && <Done sale={finished} onNew={props.onNew} />}
      {dialog === 'pay' && (
        <Pay
          session={session}
          lines={lines}
          customer={customer}
          onClose={() => setDialog(null)}
          onFinished={(f) => {
            setDialog(null); // Sell stays mounted under the receipt slide-over, so close Pay here
            props.onFinished(f);
          }}
        />
      )}
    </div>
  );
}

/** Lock and Log out both end the session; the PIN screen keeps this person preselected. */
const lock = () => write(K.session, null);

export function Av({ name, size = 30 }: { name: string; size?: number }) {
  const a = avatar(name);
  return (
    <span
      className="av"
      aria-hidden="true"
      style={{ '--c': a.color, width: size, height: size, fontSize: size * 0.38 } as React.CSSProperties}
    >
      {a.initials}
    </span>
  );
}

/* ---------- Line editor: qty, discount (amount or %), remove ---------- */
function LineEditor(p: {
  line: Line;
  stock?: number;
  onClose: () => void;
  onChange: (f: (l: Line[]) => Line[]) => void;
}) {
  const { line } = p;
  const [disc, setDisc] = useState(cents(line.discount) ? line.discount : '');
  const [pct, setPct] = useState(false);
  const value = disc === '' ? 0 : discountCents(line, pct ? `${disc}%` : disc);
  const err = value === null ? `Discount must be between 0 and ${money((cents(line.unitPrice) * line.qty) / 100)}` : '';

  function done(e?: FormEvent) {
    e?.preventDefault();
    if (value === null) return;
    p.onChange((l) => setDiscount(l, line.productId, value));
    p.onClose();
  }

  return (
    <Dialog
      title={line.name}
      onClose={p.onClose}
      footer={
        <>
          <button
            className="btn btn-danger"
            style={{ marginRight: 'auto' }}
            onClick={() => {
              p.onChange((l) => setQty(l, line.productId, 0));
              p.onClose();
            }}
          >
            Remove
          </button>
          <button className="btn btn-primary btn-lg" disabled={value === null} onClick={() => done()}>
            Done
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={done}>
        <div className="between">
          <span className="t2">
            {money(line.unitPrice)} each{p.stock !== undefined && ` · ${p.stock} in stock`}
          </span>
          <span className="q" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-lg"
              aria-label="Decrease"
              onClick={() => p.onChange((l) => setQty(l, line.productId, line.qty - 1))}
            >
              −
            </button>
            <span
              className="num"
              style={{ fontSize: 22, fontWeight: 650, minWidth: 40, textAlign: 'center' }}
              aria-label="Quantity"
            >
              {line.qty}
            </span>
            <button
              type="button"
              className="btn btn-lg"
              aria-label="Increase"
              onClick={() => p.onChange((l) => setQty(l, line.productId, line.qty + 1))}
            >
              +
            </button>
          </span>
        </div>
        <Field id="disc" label="Discount" error={err}>
          <div className="row">
            <input
              id="disc"
              className={`input num ${err ? 'err' : ''}`}
              inputMode="decimal"
              placeholder="0.00"
              style={{ height: 44, fontSize: 17 }}
              value={disc}
              onChange={(e) => setDisc(e.target.value)}
            />
            <div className="seg" role="group" aria-label="Discount type">
              <button
                type="button"
                className={pct ? undefined : 'on'}
                aria-pressed={!pct}
                onClick={() => setPct(false)}
              >
                Amount
              </button>
              <button type="button" className={pct ? 'on' : undefined} aria-pressed={pct} onClick={() => setPct(true)}>
                %
              </button>
            </div>
          </div>
        </Field>
        {value !== null && value > 0 && (
          <p className="t2" style={{ margin: 0 }}>
            Line: {money((cents(line.unitPrice) * line.qty) / 100)} − {money(value / 100)} ={' '}
            <b className="num">{money((cents(line.unitPrice) * line.qty - value) / 100)}</b>
          </p>
        )}
      </form>
    </Dialog>
  );
}

/* ---------- A4 Customer dialog ---------- */
function CustomerDialog({
  current,
  onRemove,
  onClose,
  onPick,
}: {
  current: Cust | null;
  onRemove: () => void;
  onClose: () => void;
  onPick: (c: Cust) => void;
}) {
  const online = useOnline();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<CachedCustomer | null>(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const all = customers();
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  const found = (
    needle
      ? all.filter(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            (digits && c.phone?.replace(/\D/g, '').includes(digits)) ||
            c.email?.toLowerCase().includes(needle),
        )
      : all
  ).slice(0, 30);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await api<CachedCustomer>('/customers', 'POST', f);
      addCustomer({ ...c, salesCount: 0, totalSpent: '0.00' });
      onPick(c);
    } catch (err) {
      toast(isNetworkError(err) ? 'Needs connection' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (creating)
    return (
      <Dialog
        title="New customer"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={() => setCreating(false)}>
              Back
            </button>
            <button className="btn btn-primary" form="newc" disabled={busy || !f.name.trim() || !online}>
              Save and attach
            </button>
          </>
        }
      >
        <form id="newc" className="stack" onSubmit={create}>
          <Field id="cn" label="Name" req>
            <input
              id="cn"
              className="input"
              required
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <div className="g2">
            <Field id="cph" label="Phone">
              <input
                id="cph"
                className="input num"
                type="tel"
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
              />
            </Field>
            <Field id="cem" label="Email">
              <input
                id="cem"
                className="input"
                type="email"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </Field>
          </div>
        </form>
      </Dialog>
    );

  return (
    <Dialog
      title="Attach customer"
      onClose={onClose}
      footer={
        <div className="between" style={{ width: '100%' }}>
          <span className="row">
            <button className="btn" disabled={!online} onClick={() => setCreating(true)}>
              <span className="ico s i-plus" />
              New customer
            </button>
            {!online && <span className="badge warn">Needs connection</span>}
            {current && (
              <button className="btn btn-danger" onClick={onRemove}>
                Remove {current.name}
              </button>
            )}
          </span>
          <button className="btn btn-primary" disabled={!sel} onClick={() => sel && onPick(sel)}>
            {sel ? `Attach ${sel.name}` : 'Attach'}
          </button>
        </div>
      }
    >
      <div className="input-icon">
        <span className="ico s i-search" />
        <input
          className="input"
          style={{ height: 44, fontSize: 15 }}
          aria-label="Search by name or phone"
          placeholder="Name or phone"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (sel ?? found[0])) onPick((sel ?? found[0]) as CachedCustomer);
          }}
        />
      </div>
      <p className="help" style={{ margin: '8px 0 12px' }}>
        Searching {all.length} customers cached on this till
      </p>
      <div style={{ maxHeight: 320, overflow: 'auto', margin: '0 -22px' }}>
        <table className="tbl">
          <tbody>
            {found.map((c) => (
              <tr
                key={c.id}
                className={sel?.id === c.id ? 'sel' : undefined}
                onClick={() => setSel(c)}
                onDoubleClick={() => onPick(c)}
              >
                <td>
                  <div className="row">
                    <Av name={c.name} />
                    <div>
                      <div className="cell-main">{c.name}</div>
                      {c.email && <div className="cell-sub">{c.email}</div>}
                    </div>
                  </div>
                </td>
                <td className="num t2">{c.phone ?? ''}</td>
                <td className="r t3 sm">
                  {c.salesCount} sale{c.salesCount === 1 ? '' : 's'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!found.length && (
          <p className="t3" style={{ padding: '8px 22px' }}>
            No customer matches.
          </p>
        )}
      </div>
    </Dialog>
  );
}
