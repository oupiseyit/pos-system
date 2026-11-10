// A7 Recent sales — mockups/v2/a7-recent-sales.html. Today's sales on this till: server + not yet synced.
import { useEffect, useState } from 'react';
import { isoDay, money, time } from '../../../backoffice/src/format';
import { PrintSlip, Receipt } from '../../../backoffice/src/receipt';
import { RANK, type Sale, type SaleSummary } from '../../../backoffice/src/types';
import { Dialog, Field, useToast } from '../../../backoffice/src/ui';
import { api, type Session } from '../api';
import { Top, type View } from '../App';
import { settings } from '../catalog';
import { entries, type Entry } from '../outbox';
import { entryReceipt } from '../receipt';
import { K, read, useOnline, useStore } from '../store';

type Status = 'COMPLETED' | 'VOIDED' | 'PENDING' | 'ATTENTION';
interface Row {
  id: string;
  receiptNo: string;
  createdAt: string;
  cashierName: string;
  total: string;
  status: Status;
  local?: Entry;
}
const BADGE: Record<Status, [string, string]> = {
  COMPLETED: ['ok', 'Completed'],
  VOIDED: ['bad', 'Voided'],
  PENDING: ['warn', 'Pending sync'],
  ATTENTION: ['bad', 'Needs attention'],
};

export function Recent({ session, go }: { session: Session; go: (v: View) => void }) {
  useStore();
  const online = useOnline();
  const code = read<{ code: string }>(K.device, { code: '' }).code;
  const manager = RANK[session.user.role] >= RANK.MANAGER;
  const [server, setServer] = useState<SaleSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [n, setN] = useState(0);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  // Refetch when the outbox shrinks: an uploaded sale leaves the local list and must come back from the server
  const queued = entries().length;

  useEffect(() => {
    if (!online) return;
    let live = true;
    const today = isoDay();
    // A cashier gets only their own sales today; a manager gets everyone's (05 §9)
    api<{ data: SaleSummary[] }>(`/sales?from=${today}&to=${today}&limit=200`).then(
      (r) => {
        if (!live) return;
        setLoadError('');
        setServer(r.data.filter((s) => s.receiptNo.startsWith(`${code}-`)));
      },
      (e: Error) => live && setLoadError(`Couldn’t load sales from the server: ${e.message}`),
    );
    return () => {
      live = false;
    };
  }, [online, n, code, queued]);

  const today = isoDay();
  const local: Row[] = entries()
    .filter((e) => isoDay(new Date(e.sale.createdAt)) === today)
    .map((e) => ({
      id: e.sale.id,
      receiptNo: e.sale.receiptNo,
      createdAt: e.sale.createdAt,
      cashierName: e.cashierName,
      total: e.sale.totals.total,
      status: e.state === 'attention' ? 'ATTENTION' : 'PENDING',
      local: e,
    }));
  const ids = new Set(local.map((r) => r.id));
  const rows = [...local, ...(server ?? []).filter((s) => !ids.has(s.id)).map((s): Row => ({ ...s, status: s.status }))]
    .filter((r) => !q.trim() || r.receiptNo.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const current = rows.find((r) => r.id === sel) ?? null;

  return (
    <div className="pos">
      <Top
        onAttention={() => go('attention')}
        left={
          <>
            <button className="btn" onClick={() => go('sell')}>
              <span className="ico s i-back" />
              Sell
            </button>
            <h2>Recent sales</h2>
            <span className="till">{code} · today</span>
          </>
        }
      >
        {manager && <span className="badge info plain">Manager view · {session.user.name.split(' ')[0]}</span>}
      </Top>
      <div className="sell" style={{ gridTemplateColumns: '1fr 440px' }}>
        <section className="catalog">
          <div className="input-icon" style={{ maxWidth: 420 }}>
            <span className="ico s i-search" />
            <input
              className="input"
              style={{ height: 44 }}
              placeholder={`Receipt number, e.g. ${code}-000124`}
              aria-label="Search receipt number"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {!online && (
            <div className="note warn">
              <span className="ico s i-alert" />
              Offline: showing only the sales still on this till.
            </div>
          )}
          <div className="card" style={{ overflow: 'auto' }}>
            {rows.length ? (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Time</th>
                    <th>Cashier</th>
                    <th className="r">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.id === sel ? 'sel' : undefined} onClick={() => setSel(r.id)}>
                      <td className="num cell-main">
                        <button
                          className="linkish"
                          style={{ color: 'inherit', fontWeight: 'inherit' }}
                          onClick={() => setSel(r.id)}
                        >
                          {r.receiptNo}
                        </button>
                      </td>
                      <td className="num t2">{time(r.createdAt)}</td>
                      <td>{r.cashierName}</td>
                      <td
                        className={`r num ${r.status === 'VOIDED' ? 't3' : ''}`}
                        style={r.status === 'VOIDED' ? { textDecoration: 'line-through' } : undefined}
                      >
                        {money(r.total)}
                      </td>
                      <td>
                        <span className={`badge ${BADGE[r.status][0]}`}>{BADGE[r.status][1]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="t2" style={{ padding: 20, margin: 0 }}>
                {loadError && server === null
                  ? loadError
                  : server === null && online
                    ? 'Loading…'
                    : q
                      ? 'No sale matches that receipt number.'
                      : 'No sales on this till today.'}
              </p>
            )}
          </div>
        </section>
        <aside className="cart" style={{ background: 'var(--surface-2)' }}>
          {current ? (
            <Detail
              key={`${current.id}:${current.status}`}
              row={current}
              manager={manager}
              onVoided={() => setN((x) => x + 1)}
            />
          ) : (
            <p className="t3" style={{ padding: 24 }}>
              Pick a sale to see its receipt.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Detail({ row, manager, onVoided }: { row: Row; manager: boolean; onVoided: () => void }) {
  const online = useOnline();
  const toast = useToast();
  const shop = settings();
  const [sale, setSale] = useState<Sale | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row.local || !online) return;
    let live = true;
    api<Sale>(`/sales/${row.id}`).then(
      (s) => live && setSale(s),
      (e: Error) => toast(e.message),
    );
    return () => {
      live = false;
    };
  }, [row.id, row.local, online, toast]);

  const receipt = row.local ? entryReceipt(row.local) : sale;
  const canVoid = manager && online && !row.local && row.status === 'COMPLETED';

  async function doVoid() {
    setBusy(true);
    try {
      await api(`/sales/${row.id}/void`, 'POST', { reason });
      toast(`Sale ${row.receiptNo} voided`, 'ok');
      setVoiding(false);
      onVoided();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="cart-h between" style={{ background: 'var(--surface)' }}>
        <div>
          <h3 className="num">{row.receiptNo}</h3>
          <span className="t3 sm">
            {row.cashierName} · {time(row.createdAt)}
          </span>
        </div>
        <span className={`badge ${BADGE[row.status][0]}`}>{BADGE[row.status][1]}</span>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'grid',
          justifyItems: 'center',
          alignContent: 'start',
          padding: 20,
        }}
      >
        {shop && receipt ? (
          <>
            <Receipt settings={shop} sale={receipt} small />
            <PrintSlip settings={shop} sale={receipt} />
          </>
        ) : (
          <p className="t3">{online ? 'Loading…' : 'The receipt needs a connection.'}</p>
        )}
      </div>
      <div
        className="cart-act"
        style={{ gridTemplateColumns: '1fr 1fr', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
      >
        <button className="btn btn-lg" disabled={!shop || !receipt} onClick={() => print()}>
          <span className="ico s i-printer" />
          Reprint
        </button>
        {manager ? (
          <span
            className="tip"
            data-tip={
              canVoid
                ? 'Reason required'
                : row.local
                  ? 'Not synced yet'
                  : !online
                    ? 'Needs connection'
                    : 'Already voided'
            }
          >
            <button
              className="btn btn-lg btn-danger"
              style={{ width: '100%' }}
              disabled={!canVoid}
              onClick={() => (setReason(''), setVoiding(true))}
            >
              Void sale
            </button>
          </span>
        ) : (
          <span />
        )}
      </div>
      {voiding && (
        <Dialog
          title={`Void ${row.receiptNo}?`}
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
              The sale stops counting in reports and its items go back into stock.
            </p>
            <Field id="vr" label="Reason" req>
              <textarea id="vr" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        </Dialog>
      )}
    </>
  );
}
