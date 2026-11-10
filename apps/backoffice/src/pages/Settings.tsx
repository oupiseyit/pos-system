// B10 Settings (ADMIN) — mockups/v2/b10-settings.html, with a live 80mm receipt preview.
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '../api';
import { setShopTz } from '../format';
import { Receipt, SAMPLE } from '../receipt';
import type { Settings } from '../types';
import { Field, inp, useSession, useToast } from '../ui';

// Native lists of ISO 4217 currencies and IANA zones; no data files to maintain
const CURRENCIES = Intl.supportedValuesOf('currency');
const ZONES = Intl.supportedValuesOf('timeZone');

export function SettingsPage() {
  const { settings, setSettings } = useSession();
  const toast = useToast();
  const [f, setF] = useState<Settings>(settings);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  // Keep the saved value selectable even if this browser's Intl list lacks it
  const withSaved = (list: string[], v: string) => (list.includes(v) ? list : [v, ...list]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api<Settings>('/settings', 'PUT', f);
      setShopTz(saved.timezone);
      setSettings(saved);
      setF(saved);
      setErrs({});
      toast('Settings saved', 'ok');
    } catch (err) {
      setErrs(fieldErrors(err));
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Shop settings</h1>
          <p>These details print on every receipt.</p>
        </div>
      </div>
      <div className="settings-grid">
        <form className="card" onSubmit={submit}>
          <div className="card-h">
            <h2>Shop details</h2>
          </div>
          <div className="card-b" style={{ display: 'grid', gap: 14 }}>
            <Field id="name" label="Shop name" req error={errs.shopName}>
              <input {...inp('name', errs.shopName)} required value={f.shopName} onChange={set('shopName')} />
            </Field>
            <Field id="addr" label="Address" error={errs.address}>
              <input {...inp('addr', errs.address)} value={f.address} onChange={set('address')} />
            </Field>
            <div className="g2">
              <Field id="tel" label="Phone" error={errs.phone}>
                <input {...inp('tel', errs.phone, 'num')} type="tel" value={f.phone} onChange={set('phone')} />
              </Field>
              <Field id="vat" label="Tax id" error={errs.taxId}>
                <input {...inp('vat', errs.taxId, 'num')} value={f.taxId} onChange={set('taxId')} />
              </Field>
            </div>
          </div>
          <div className="card-h" style={{ borderTop: '1px solid var(--border)' }}>
            <h2>Region</h2>
          </div>
          <div className="card-b g2">
            <Field id="cur" label="Currency" error={errs.currency}>
              <select {...inp('cur', errs.currency)} value={f.currency} onChange={set('currency')}>
                {withSaved(CURRENCIES, f.currency).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field id="tz" label="Timezone" error={errs.timezone}>
              <select {...inp('tz', errs.timezone)} value={f.timezone} onChange={set('timezone')}>
                {withSaved(ZONES, f.timezone).map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="card-h" style={{ borderTop: '1px solid var(--border)' }}>
            <h2>Receipt</h2>
          </div>
          <div className="card-b">
            <Field id="foot" label="Footer" error={errs.receiptFooter}>
              <textarea
                {...inp('foot', errs.receiptFooter)}
                rows={3}
                value={f.receiptFooter}
                onChange={set('receiptFooter')}
              />
            </Field>
          </div>
          <div className="card-f">
            <button type="button" className="btn" onClick={() => (setF(settings), setErrs({}))}>
              Discard
            </button>
            <button className="btn btn-primary" disabled={busy}>
              Save settings
            </button>
          </div>
        </form>
        <div style={{ position: 'sticky', top: 80 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <span className="t2" style={{ fontWeight: 550 }}>
              Live preview
            </span>
            <span className="badge plain">80 mm</span>
          </div>
          <Receipt settings={f} sale={SAMPLE} />
        </div>
      </div>
    </div>
  );
}
