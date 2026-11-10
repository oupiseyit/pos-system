// B1 Login — mockups/v2/b1-login.html
import { useState, type FormEvent } from 'react';
import { api, ApiError, setToken } from '../api';

export function Login({ onToken }: { onToken: () => Promise<string | null> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ token: string }>('/auth/login', 'POST', { email, password });
      setToken(r.token);
      const refused = await onToken();
      if (refused) setError(refused);
    } catch (err) {
      // Generic on 401 so we never say which half was wrong
      setError(err instanceof ApiError && err.status === 401 ? 'Invalid email or password' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const bad = error === 'Invalid email or password';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', minHeight: '100vh' }}>
      <main style={{ display: 'grid', placeItems: 'center', padding: 40, background: 'var(--surface)' }}>
        <form style={{ width: 380, maxWidth: '100%' }} className="stack" onSubmit={submit} noValidate>
          <div className="logo">
            <span className="logo-mark">B</span>Back office
          </div>
          <div style={{ marginTop: 36 }}>
            <h1 style={{ fontSize: 28 }}>Sign in to back office</h1>
            <p className="t2" style={{ margin: '6px 0 0' }}>
              For managers and admins.
            </p>
          </div>
          {error && (
            <div className="note bad" role="alert">
              <span className="ico s i-alert" />
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="e">Email</label>
            <input
              id="e"
              className={`input ${bad ? 'err' : ''}`}
              style={{ height: 44 }}
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="p">Password</label>
            <input
              id="p"
              className={`input ${bad ? 'err' : ''}`}
              style={{ height: 44 }}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
      <aside
        style={{
          background: 'linear-gradient(160deg,#0e6b4e,#0a3f30)',
          color: '#fff',
          padding: 56,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 28,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(600px 400px at 80% 10%,rgba(255,255,255,.12),transparent)',
          }}
        />
        <h2 style={{ fontSize: 34, lineHeight: 1.15, maxWidth: '15ch', position: 'relative' }}>
          Today’s takings, stock and staff in one place.
        </h2>
      </aside>
    </div>
  );
}
