// A1 Device setup (first run only) — mockups/v2/a1-device-setup.html
import { useState, type FormEvent } from 'react';
import { RANK } from '../../../backoffice/src/types';
import { api, ApiError, isNetworkError, type Session } from '../api';
import { K, write } from '../store';

export function Setup() {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^[A-Z0-9]{2,4}$/.test(code) && email && /^\d{4,6}$/.test(pin);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Checked online; the manager's session is used only for this check and then dropped
      const s = await api<Session>('/auth/pin', 'POST', { email, pin });
      if (RANK[s.user.role] < RANK.MANAGER) return setError('Only a manager or admin can set up a till.');
      write(K.counter, 0);
      write(K.device, { code });
    } catch (err) {
      setError(
        isNetworkError(err)
          ? 'Setup needs a connection.'
          : err instanceof ApiError && err.status === 423
            ? 'This manager is locked. Try again later.'
            : 'Invalid email or PIN',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'radial-gradient(1200px 600px at 50% -10%, var(--primary-50), var(--bg))',
      }}
    >
      <main style={{ width: 460, maxWidth: '100%' }}>
        <div className="logo" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <span className="logo-mark">P</span>POS
        </div>
        <form className="card" onSubmit={submit} noValidate>
          <div className="card-b stack" style={{ padding: 28 }}>
            <div>
              <span className="badge info plain">First run · manager only</span>
              <h1 style={{ marginTop: 12 }}>Set up this till</h1>
              <p className="t2" style={{ margin: '6px 0 0' }}>
                Give this device a short code. It prefixes every receipt number, e.g.{' '}
                <span className="num">T1-000124</span>.
              </p>
            </div>
            {error && (
              <div className="note bad" role="alert">
                <span className="ico s i-alert" />
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="code" className="req">
                Device code
              </label>
              <input
                id="code"
                className="input num"
                maxLength={4}
                autoFocus
                autoComplete="off"
                style={{ height: 52, fontSize: 24, width: 140, letterSpacing: '.12em' }}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <span className="help">2–4 letters or digits</span>
            </div>
            <hr className="hr" style={{ margin: '4px 0' }} />
            <div className="field">
              <label htmlFor="email" className="req">
                Manager email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pin" className="req">
                Manager PIN
              </label>
              <input
                id="pin"
                className="input num"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                style={{ letterSpacing: '.35em' }}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
          </div>
          <div className="card-f" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="help row">
              <span className="ico s i-lock" />
              Checked online, role must be Manager or above
            </span>
            <button className="btn btn-primary" disabled={!valid || busy}>
              Save and continue
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
