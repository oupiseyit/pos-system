// A8 Needs attention — mockups/v2/a8-needs-attention.html. Sales the server rejected (4xx).
// Retry or (manager, typed reason) discard; nothing is ever discarded automatically.
import { useState } from 'react';
import { money } from '../../../backoffice/src/format';
import { RANK } from '../../../backoffice/src/types';
import type { Session } from '../api';
import { syncNow, Top, type View } from '../App';
import { discard, entries, retry, type Entry } from '../outbox';
import { useStore } from '../store';

export function Attention({ session, go }: { session: Session; go: (v: View) => void }) {
  useStore();
  const list = entries().filter((e) => e.state === 'attention');
  const manager = RANK[session.user.role] >= RANK.MANAGER;
  return (
    <div className="pos">
      <Top
        left={
          <>
            <button className="btn" onClick={() => go('sell')}>
              <span className="ico s i-back" />
              Sell
            </button>
            <h2>Needs attention</h2>
          </>
        }
      />
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }} className="stack">
          <div className="note info">
            The server rejected these sales. They stay on this till until someone retries them or a manager discards
            them. Nothing is discarded automatically.
          </div>
          {!list.length && (
            <div className="card card-b">
              <p className="t2" style={{ margin: 0 }}>
                Nothing needs attention.{' '}
                <button className="linkish" onClick={() => go('sell')}>
                  Back to selling
                </button>
              </p>
            </div>
          )}
          {list.map((e) => (
            <Item key={e.sale.id} e={e} manager={manager} who={session.user.name} />
          ))}
        </div>
      </main>
    </div>
  );
}

function Item({ e, manager, who }: { e: Entry; manager: boolean; who: string }) {
  const [details, setDetails] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState('');
  const id = e.sale.id;
  return (
    <article
      className="card"
      style={discarding ? { borderColor: '#efc1c1', boxShadow: '0 0 0 3px var(--danger-50)' } : undefined}
    >
      <div className="card-h">
        <div className="row">
          <span className="ico i-alert" style={{ color: 'var(--danger)' }} />
          <div>
            <div className="num cell-main">{e.sale.receiptNo}</div>
            <div className="err">
              {e.error?.status} · {e.error?.message}
            </div>
          </div>
        </div>
        <span className="num" style={{ fontSize: 18, fontWeight: 650 }}>
          {money(e.sale.totals.total)}
        </span>
      </div>
      {discarding ? (
        <>
          <div className="card-b stack">
            <div className="field">
              <label htmlFor={`why-${id}`} className="req">
                Reason for discarding
              </label>
              <input
                id={`why-${id}`}
                className="input"
                autoFocus
                value={reason}
                onChange={(x) => setReason(x.target.value)}
              />
              <span className="help">Logged to the console with your name. This cannot be undone.</span>
            </div>
          </div>
          <div className="card-f">
            <button className="btn" onClick={() => setDiscarding(false)}>
              Cancel
            </button>
            <button
              className="btn btn-danger-solid"
              disabled={!reason.trim()}
              onClick={() => confirm(`Discard ${e.sale.receiptNo} for good?`) && discard(id, reason, who)}
            >
              Discard {e.sale.receiptNo}
            </button>
          </div>
        </>
      ) : (
        <div className="card-b">
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                retry(id);
                syncNow();
              }}
            >
              <span className="ico s i-refresh" />
              Retry
            </button>
            <div className="grow">
              <button className="btn" aria-expanded={details} onClick={() => setDetails(!details)}>
                {details ? 'Hide details' : 'Show details'}
              </button>
              {details && (
                <pre className="attn-pre">
                  {`POST /sales → ${e.error?.status}\n${JSON.stringify(e.error?.body, null, 2)}\n\n${JSON.stringify(
                    {
                      id,
                      createdAt: e.sale.createdAt,
                      cashier: e.cashierName,
                      items: e.sale.items.length,
                      totals: e.sale.totals,
                    },
                    null,
                    2,
                  )}`}
                </pre>
              )}
            </div>
            {manager && (
              <button className="btn btn-danger" onClick={() => setDiscarding(true)}>
                Discard…
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
