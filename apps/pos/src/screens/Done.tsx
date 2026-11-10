// A6 Receipt preview / print — mockups/v2/a6-receipt.html. Prints automatically once.
import { useEffect } from 'react';
import { methodLabel, money, moneyCents } from '../../../backoffice/src/format';
import { renderReceipt } from '../../../backoffice/src/receipt';
import { Top } from '../App';
import { settings } from '../catalog';
import { entryReceipt } from '../receipt';
import type { Finished } from './Pay';

export function Done({ sale, onNew }: { sale: Finished; onNew: () => void }) {
  const shop = settings();
  const s = sale.entry.sale;

  useEffect(() => {
    // Timer + cleanup so React's dev double-mount still prints only once
    const id = setTimeout(() => print(), 150);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNew();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onNew]);

  const pay = s.payments.map((p) => `${methodLabel(p.method)} ${money(p.tendered ?? p.amount)}`).join(' + ');
  return (
    <div className="pos">
      <Top />
      <main className="done">
        <div style={{ justifySelf: 'end', textAlign: 'right' }}>
          <span className="badge ok">Sale complete</span>
          <div className="t2" style={{ marginTop: 18 }}>
            Change due
          </div>
          <div
            className="num"
            style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-.05em', color: 'var(--primary)', lineHeight: 1.1 }}
          >
            {moneyCents(sale.change)}
          </div>
          <div className="t3 sm num">
            {s.receiptNo} · {pay}
          </div>
        </div>
        {shop ? (
          <pre className="receipt">{renderReceipt(shop, entryReceipt(sale.entry))}</pre>
        ) : (
          <p className="t2">Shop settings aren’t on this till yet, so there’s no receipt to print.</p>
        )}
        <div style={{ display: 'grid', gap: 10, width: 240 }}>
          <button className="btn btn-primary btn-xl" autoFocus onClick={onNew}>
            New sale{' '}
            <span className="kbd" style={{ borderColor: '#fff' }}>
              Enter
            </span>
          </button>
          <button className="btn btn-lg" onClick={() => print()}>
            <span className="ico s i-printer" />
            Print again
          </button>
        </div>
      </main>
    </div>
  );
}
