// B6 Sales — mockups/v2/b6-sales.html. Routes: #/sales, #/sales/:id
import { useState } from 'react';
import { api, qs } from '../api';
import { cents, dateTime, isoDay, methodLabel, money, moneyCents, time } from '../format';
import { PrintSlip } from '../receipt';
import type { Customer, Page, Sale, SaleSummary } from '../types';
import {
  Dialog,
  Empty,
  Field,
  go,
  Loading,
  Pager,
  Picker,
  StatusBadge,
  useDebounced,
  useLoad,
  useRoute,
  useSession,
  useToast,
} from '../ui';

const payLabel = (m: string[]) => (m.length > 1 ? 'Split' : methodLabel(m[0] ?? ''));

export function Sales() {
  const { parts } = useRoute();
  const sel = parts[1];
  const today = isoDay();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [cashierId, setCashierId] = useState('');
  const [status, setStatus] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [receipt, setReceipt] = useState('');
  const [page, setPage] = useState(1);
  const receiptNo = useDebounced(receipt.trim());
  const list = useLoad<Page<SaleSummary>>(
    `/sales${qs({ from, to, cashierId, status, customerId: customer?.id, receiptNo, page, limit: 50 })}`,
  );
  // Cashiers who sold in the range (/users is admin-only, so managers can't list staff)
  const cashiers = useLoad<{ data: { cashierId: string; name: string }[] }>(
    `/reports/cashiers${qs({ from: from || '2000-01-01', to: to || today })}`,
  );
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Sales</h1>
          <p>
            {list.data ? `${list.data.total} sales` : ' '}
            {from && from === to ? (from === today ? ' today' : ` on ${from}`) : ''}
          </p>
        </div>
      </div>
      <div className={sel ? 'split' : undefined}>
        <section className="card">
          <div className="filters">
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
            <select
              className="input"
              aria-label="Cashier"
              value={cashierId}
              onChange={(e) => reset(setCashierId)(e.target.value)}
            >
              <option value="">All cashiers</option>
              {cashiers.data?.data.map((c) => (
                <option key={c.cashierId} value={c.cashierId}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              aria-label="Status"
              value={status}
              onChange={(e) => reset(setStatus)(e.target.value)}
            >
              <option value="">Any status</option>
              <option value="COMPLETED">Completed</option>
              <option value="VOIDED">Voided</option>
            </select>
            <div style={{ width: 170 }}>
              <Picker<Customer>
                id="sc"
                value={customer}
                onPick={reset(setCustomer)}
                search={(s) => `/customers${qs({ search: s, limit: 10 })}`}
                label={(c) => (c.phone ? `${c.name} · ${c.phone}` : c.name)}
                placeholder="Customer"
                ariaLabel="Customer"
              />
            </div>
            <input
              className="input num"
              placeholder="Receipt no"
              aria-label="Receipt no"
              style={{ width: 120 }}
              value={receipt}
              onChange={(e) => reset(setReceipt)(e.target.value)}
            />
          </div>
          {list.loading && !list.data ? (
            <Loading />
          ) : !list.data?.data.length ? (
            <Empty msg="No sales match these filters" />
          ) : (
            <>
              <table className="tbl dense">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>{from && from === to ? 'Time' : 'Date'}</th>
                    <th>Cashier</th>
                    <th>Customer</th>
                    <th>Payment</th>
                    <th className="r">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((s) => (
                    <tr key={s.id} className={s.id === sel ? 'sel' : undefined} onClick={() => go(`/sales/${s.id}`)}>
                      <td className="num cell-main">
                        <a href={`#/sales/${s.id}`} style={{ color: 'inherit' }}>
                          {s.receiptNo}
                        </a>
                      </td>
                      <td className="num t2">{from && from === to ? time(s.createdAt) : dateTime(s.createdAt)}</td>
                      <td>{s.cashierName}</td>
                      <td className={s.customerName ? undefined : 't3'}>{s.customerName ?? '—'}</td>
                      <td className="t2">{payLabel(s.paymentMethods)}</td>
                      <td className={`r num ${s.status === 'VOIDED' ? 't3' : ''}`}>{money(s.total)}</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager {...list.data} onPage={setPage} />
            </>
          )}
        </section>
        {sel && <SaleDetail key={sel} id={sel} onVoided={list.reload} />}
      </div>
    </div>
  );
}

function SaleDetail({ id, onVoided }: { id: string; onVoided: () => void }) {
  const { settings } = useSession();
  const toast = useToast();
  const one = useLoad<Sale>(`/sales/${id}`);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const s = one.data;
  if (!s)
    return <aside className="card panel">{one.loading ? <Loading rows={8} /> : <Empty msg="Sale not found" />}</aside>;

  // Offline sales reach the server later: show when and by whom (06 B6)
  const lateSync = new Date(s.syncedAt).getTime() - new Date(s.createdAt).getTime() > 60_000;

  async function doVoid() {
    setBusy(true);
    try {
      await api(`/sales/${id}/void`, 'POST', { reason });
      setVoiding(false);
      toast(`Sale ${s?.receiptNo} voided`, 'ok');
      one.reload();
      onVoided();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="card panel">
      <div className="card-h">
        <div>
          <h2 className="num">{s.receiptNo}</h2>
          <span className="t3 sm">
            {dateTime(s.createdAt)} · Till {s.deviceCode}
          </span>
        </div>
        <StatusBadge status={s.status} />
      </div>
      <div className="card-b" style={{ display: 'grid', gap: 16 }}>
        {s.status === 'VOIDED' && (
          <div className="note bad">
            <span className="ico s i-alert" />
            <span>
              Voided {s.voidedAt && dateTime(s.voidedAt)} by {s.voidedBy?.name}: {s.voidReason}
            </span>
          </div>
        )}
        {lateSync && (
          <div className="note warn">
            <span className="ico s i-refresh" />
            <span>
              Synced {time(s.syncedAt)} by {s.syncedBy.name}. This sale was made offline.
            </span>
          </div>
        )}
        <div className="g2 sm">
          <div>
            <div className="t3">Cashier</div>
            <div style={{ fontWeight: 550 }}>{s.cashier.name}</div>
          </div>
          <div>
            <div className="t3">Customer</div>
            {s.customer ? (
              <a href={`#/customers/${s.customer.id}`} style={{ fontWeight: 550 }}>
                {s.customer.name}
              </a>
            ) : (
              <span className="t3">—</span>
            )}
          </div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
          <table className="tbl static">
            <tbody>
              {s.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div className="cell-main">{it.nameSnapshot}</div>
                    <div className="cell-sub num">
                      {it.qty} × {money(it.unitPrice)}
                      {cents(it.discount) > 0 && ` · discount −${money(it.discount)}`}
                    </div>
                  </td>
                  <td className="r num">{moneyCents(cents(it.unitPrice) * it.qty - cents(it.discount))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="t2" style={{ fontWeight: 500 }}>
                  Tax
                </td>
                <td className="r num">{money(s.tax)}</td>
              </tr>
              <tr>
                <td>Total</td>
                <td className="r num">{money(s.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div>
          <div className="t3 sm" style={{ marginBottom: 6 }}>
            Payments
          </div>
          {s.payments.map((p) => (
            <div className="between" key={p.id}>
              <span>{methodLabel(p.method)}</span>
              <span className="num">
                {money(p.tendered ?? p.amount)}
                {cents(p.change) > 0 && <span className="t3"> · change {money(p.change)}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="card-f">
        <button className="btn" onClick={() => print()}>
          <span className="ico s i-printer" />
          Reprint
        </button>
        {s.status === 'COMPLETED' && (
          <button className="btn btn-danger" onClick={() => (setReason(''), setVoiding(true))}>
            Void sale…
          </button>
        )}
      </div>
      <PrintSlip settings={settings} sale={s} />
      {voiding && (
        <Dialog
          title={`Void ${s.receiptNo}?`}
          onClose={() => setVoiding(false)}
          footer={
            <>
              <button className="btn" onClick={() => setVoiding(false)}>
                Cancel
              </button>
              <button className="btn btn-danger-solid" disabled={busy || !reason.trim()} onClick={doVoid}>
                Void sale
              </button>
            </>
          }
        >
          <div className="stack">
            <p className="t2" style={{ margin: 0 }}>
              The sale stops counting in reports and its items go back into stock. This can’t be undone.
            </p>
            <Field id="vr" label="Reason" req>
              <textarea id="vr" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        </Dialog>
      )}
    </aside>
  );
}
