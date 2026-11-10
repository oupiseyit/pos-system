// A5 Pay dialog — mockups/v2/a5-pay.html. Complete saves to the outbox first, then shows the receipt.
import { useEffect, useRef, useState } from 'react';
import { cents, methodLabel, money, moneyCents } from '../../../backoffice/src/format';
import { useToast } from '../../../backoffice/src/ui';
import { fromCents, toCents } from '../../../api/src/totals';
import type { Session } from '../api';
import type { Cust } from '../App';
import { payState, quickCash, toSale, totals, type Line, type Payment } from '../cart';
import { add, nextReceiptNo, type Entry, type Method } from '../outbox';
import { K, read } from '../store';

export interface Finished {
  entry: Entry;
  change: number;
}

export function Pay(p: {
  session: Session;
  lines: Line[];
  customer: Cust | null;
  onClose: () => void;
  onFinished: (f: Finished) => void;
}) {
  const toast = useToast();
  const due = cents(totals(p.lines).total);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [method, setMethod] = useState<Method>('CASH');
  const [input, setInput] = useState('');
  const [reference, setReference] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const s = payState(due, payments, method, input);
  const { onClose } = p;

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [method, payments.length]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  function pick(m: Method) {
    setMethod(m);
    // Card / Other default to the remaining amount (06 A5)
    setInput(m === 'CASH' ? '' : fromCents(s.remaining));
  }

  function addPayment() {
    if (!s.canAdd) return;
    const amount = fromCents(toCents(input)); // "10" → "10.00"; canAdd already validated it
    setPayments([
      ...payments,
      {
        method,
        amount,
        ...(method === 'CASH' && { tendered: amount }),
        ...(method !== 'CASH' && reference && { reference }),
      },
    ]);
    setInput('');
    setReference('');
    setMethod('CASH');
  }

  function complete() {
    if (!s.canComplete) return;
    const final = s.final
      ? [...payments, { ...s.final, ...(s.final.method !== 'CASH' && reference && { reference }) }]
      : payments;
    try {
      const deviceCode = read<{ code: string }>(K.device, { code: '' }).code;
      const sale = toSale({
        id: crypto.randomUUID(),
        receiptNo: nextReceiptNo(),
        deviceCode,
        cashierId: p.session.user.id,
        customerId: p.customer?.id ?? null,
        lines: p.lines,
        payments: final,
      });
      const entry = { sale, cashierName: p.session.user.name, customerName: p.customer?.name ?? null };
      add(entry); // on the device before anything prints (03 §5)
      p.onFinished({ entry: { ...entry, state: 'pending' }, change: s.change });
    } catch (e) {
      toast(`Couldn’t save the sale on this till: ${(e as Error).message}`);
    }
  }

  const cash = method === 'CASH';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="pay-t" style={{ width: 620 }}>
        <div className="card-h" style={{ alignItems: 'flex-end' }}>
          <div>
            <div id="pay-t" className="t2" style={{ fontWeight: 550 }}>
              Amount due
            </div>
            <div className="due">{moneyCents(due)}</div>
          </div>
          <div className="r">
            <div className="t3 sm">{payments.length ? 'Split payment' : ' '}</div>
            <div className="sm">
              Paid <span className="num">{moneyCents(s.paid)}</span> · Remaining{' '}
              <b className="num">{moneyCents(s.remaining)}</b>
            </div>
          </div>
        </div>
        <div className="card-b">
          <div className="methods" role="radiogroup" aria-label="Payment method">
            {(['CASH', 'CARD', 'OTHER'] as Method[]).map((m) => (
              <button
                key={m}
                className={`method ${m === method ? 'on' : ''}`}
                role="radio"
                aria-checked={m === method}
                disabled={s.remaining <= 0}
                onClick={() => pick(m)}
              >
                {methodLabel(m)}
              </button>
            ))}
          </div>
          {s.remaining > 0 && (
            <>
              <div className="field" style={{ marginTop: 18 }}>
                <label htmlFor="tender">{cash ? 'Cash tendered' : `${methodLabel(method)} amount`}</label>
                <input
                  id="tender"
                  ref={ref}
                  className={`input tender ${s.error ? 'err' : ''}`}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-describedby={s.error ? 'tender-err' : undefined}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (s.canComplete) complete();
                      else addPayment();
                    }
                  }}
                />
                {s.error && (
                  <span className="ferr" id="tender-err" role="alert">
                    <span className="ico s i-alert" />
                    {s.error}
                  </span>
                )}
              </div>
              {cash ? (
                <>
                  <div className="quick" style={{ marginTop: 10 }}>
                    {quickCash(s.remaining).map((c, i) => (
                      <button key={c} className="btn" onClick={() => setInput(fromCents(c))}>
                        {i === 0 ? 'Exact' : c % 100 ? moneyCents(c) : c / 100}
                      </button>
                    ))}
                  </div>
                  <div
                    className="between"
                    style={{
                      marginTop: 18,
                      padding: '14px 16px',
                      background: 'var(--primary-50)',
                      borderRadius: 'var(--r)',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>Change</span>
                    <span className="change" aria-live="polite">
                      {moneyCents(s.change)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="ref">Reference (optional)</label>
                  <input id="ref" className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              )}
            </>
          )}
          <hr className="hr" />
          <div className="between">
            <span className="t2" style={{ fontWeight: 550 }}>
              Payments
            </span>
            <button className="btn btn-sm" disabled={!s.canAdd} onClick={addPayment}>
              <span className="ico s i-plus" />
              Add payment
            </button>
          </div>
          {payments.length ? (
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {payments.map((x, i) => (
                <div className="between" key={i}>
                  <span>{methodLabel(x.method)}</span>
                  <span className="row">
                    <span className="num">{money(x.amount)}</span>
                    <button
                      className="btn btn-ghost icon-btn btn-sm"
                      aria-label={`Remove ${methodLabel(x.method)} ${money(x.amount)}`}
                      onClick={() => setPayments(payments.filter((_, j) => j !== i))}
                    >
                      <span className="ico s i-x" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="t3 sm" style={{ margin: '6px 0 0' }}>
              None yet. Enter a partial amount and press Add payment to split.
            </p>
          )}
          {!cash && (
            <div className="note info" style={{ marginTop: 14 }}>
              Run the card on the terminal first.
            </div>
          )}
        </div>
        <div className="card-f">
          <button className="btn btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-lg"
            style={{ minWidth: 180 }}
            disabled={!s.canComplete}
            onClick={complete}
          >
            Complete sale
          </button>
        </div>
      </div>
    </div>
  );
}
