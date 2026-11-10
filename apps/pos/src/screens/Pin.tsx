// A2 PIN login — mockups/v2/a2-pin-login.html
import { useEffect, useState } from 'react';
import { avatar, time } from '../../../backoffice/src/format';
import { api, ApiError, isNetworkError, type Session } from '../api';
import { Top } from '../App';
import { refresh } from '../catalog';
import { K, read, useOnline, write } from '../store';

interface Known {
  email: string;
  name: string;
}
const MAX_TRIES = 5;

export function Pin() {
  const online = useOnline();
  const users = read<Known[]>(K.users, []);
  const [email, setEmail] = useState(users[0]?.email ?? '');
  const [other, setOther] = useState(!users.length);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const who = users.find((u) => u.email === email);

  async function submit(value: string) {
    if (!email || value.length < 4 || busy) return;
    setBusy(true);
    try {
      const s = await api<Session>('/auth/pin', 'POST', { email, pin: value });
      write(K.users, [{ email: s.user.email, name: s.user.name }, ...users.filter((u) => u.email !== s.user.email)]);
      write(K.fails, { ...read<Record<string, number>>(K.fails, {}), [email]: 0 });
      write(K.session, s);
      refresh().catch(() => {}); // fresh catalog on every login (03 §5)
    } catch (err) {
      setPin('');
      setShake((n) => n + 1);
      const fails = read<Record<string, number>>(K.fails, {});
      if (isNetworkError(err)) setError('Login needs a connection');
      else if (err instanceof ApiError && err.status === 423) {
        const until = (err.details as { lockedUntil?: string } | undefined)?.lockedUntil;
        write(K.fails, { ...fails, [email]: 0 });
        setError(until ? `Locked until ${time(until)}` : 'Locked');
      } else if (err instanceof ApiError && err.status === 401) {
        const n = (fails[email] ?? 0) + 1;
        write(K.fails, { ...fails, [email]: n });
        const left = MAX_TRIES - n;
        setError(left > 0 ? `Wrong PIN (${left} ${left === 1 ? 'try' : 'tries'} left)` : 'Wrong PIN');
      } else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function press(k: string) {
    setError('');
    if (k === 'back') setPin((p) => p.slice(0, -1));
    else if (k === 'go') submit(pin);
    else setPin((p) => (p.length < 6 ? p + k : p));
  }

  // Physical keyboard: digits, Backspace, Enter (unless typing an email)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('go');
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }); // re-subscribes each render so the handler sees the current PIN

  const pick = (e: string) => {
    setEmail(e);
    setOther(false);
    setPin('');
    setError('');
  };
  const dots = Math.max(4, pin.length);
  const disabled = !online || !email;

  return (
    <div className="pos">
      <Top />
      <main style={{ flex: 1, display: 'grid', placeItems: 'center', overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 28 }}>
          <div
            className="users"
            role="radiogroup"
            aria-label="Who is signing in"
            style={{ flexWrap: 'wrap', justifyContent: 'center' }}
          >
            {users.map((u) => {
              const a = avatar(u.name);
              const on = !other && u.email === email;
              return (
                <button
                  key={u.email}
                  className={`user ${on ? 'on' : ''}`}
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(u.email)}
                >
                  <span className="av" style={{ '--c': a.color } as React.CSSProperties}>
                    {a.initials}
                  </span>
                  {u.name.split(' ')[0]}
                </button>
              );
            })}
            <button
              className={`user add ${other ? 'on' : ''}`}
              onClick={() => {
                setOther(true);
                setEmail('');
                setPin('');
              }}
            >
              <span className="av">
                <span className="ico i-plus" />
              </span>
              Other user
            </button>
          </div>
          {other && (
            <div className="field" style={{ width: 300 }}>
              <label htmlFor="em">Your email</label>
              <input
                id="em"
                className="input"
                type="email"
                autoComplete="username"
                autoFocus
                style={{ height: 44 }}
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div className="t2" style={{ fontWeight: 550, marginBottom: 14 }}>
              {online ? (who && !other ? `Enter PIN for ${who.name.split(' ')[0]}` : 'Enter your PIN') : 'Offline'}
            </div>
            <div
              key={shake}
              className={`dots ${error ? 'bad shake' : ''}`}
              role="img"
              aria-label={`${pin.length} of ${dots} digits entered`}
              style={{ justifyContent: 'center' }}
            >
              {Array.from({ length: dots }, (_, i) => (
                <i key={i} className={i < pin.length ? 'on' : undefined} />
              ))}
            </div>
            {(error || !online) && (
              <div className="note bad" role="alert" style={{ marginTop: 16, justifyContent: 'center' }}>
                <span className="ico s i-alert" />
                {online ? error : 'Login needs a connection'}
              </div>
            )}
          </div>
          <div className="pad" aria-label="PIN keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
              <button key={k} className="key" disabled={disabled} onClick={() => press(k)}>
                {k}
              </button>
            ))}
            <button className="key" aria-label="Delete" disabled={disabled} onClick={() => press('back')}>
              ⌫
            </button>
            <button className="key" disabled={disabled} onClick={() => press('0')}>
              0
            </button>
            <button
              className="key go"
              aria-label="Sign in"
              disabled={disabled || pin.length < 4 || busy}
              onClick={() => press('go')}
            >
              →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
