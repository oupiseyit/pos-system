// A6 Sale complete — mockups/v2/a6-receipt.html. The receipt prints out over the sell screen
// (slides down over the cart) and prints automatically once. Enter starts the next sale.
import { useEffect } from 'react';
import { methodLabel, money, moneyCents } from '../../../backoffice/src/format';
import { PrintSlip, Receipt } from '../../../backoffice/src/receipt';
import { settings } from '../catalog';
import { entryReceipt } from '../receipt';
import type { Finished } from './Pay';

export function Done({ sale, onNew }: { sale: Finished; onNew: () => void }) {
  const shop = settings();
  const s = sale.entry.sale;

  useEffect(() => {
    // Timer + cleanup so React's dev double-mount still prints only once
    const id = setTimeout(() => print(), 300);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    // The Enter that completed the sale in the Pay dialog is still bubbling to window when this
    // mounts; only a later key press may start the next sale (else no receipt is printed).
    const mounted = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.timeStamp > mounted) {
        e.preventDefault();
        onNew();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onNew]);

  const pay = s.payments.map((p) => `${methodLabel(p.method)} ${money(p.tendered ?? p.amount)}`).join(' + ');
  return (
    <div className="printout" role="dialog" aria-modal="true" aria-label="Sale complete">
      <div className="done-card">
        <span className="badge ok">Sale complete</span>
        <div className="t2" style={{ marginTop: 14 }}>
          Change due
        </div>
        <div className="due-change">{moneyCents(sale.change)}</div>
        <div className="t3 sm num">
          {s.receiptNo} · {pay}
        </div>
        <div className="acts">
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
      </div>
      <div className="slot">
        {shop ? (
          <div className="printing">
            <Receipt settings={shop} sale={entryReceipt(sale.entry)} />
            <PrintSlip settings={shop} sale={entryReceipt(sale.entry)} />
          </div>
        ) : (
          <p className="t2" style={{ alignSelf: 'center' }}>
            Shop settings aren’t on this till yet, so there’s no receipt to print.
          </p>
        )}
      </div>
    </div>
  );
}
