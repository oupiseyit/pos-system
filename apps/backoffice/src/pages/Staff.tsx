// B9 Staff (ADMIN) — mockups/v2/b9-staff.html. Routes: #/staff, #/staff/new, #/staff/:id
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '../api';
import { time } from '../format';
import type { Role, User } from '../types';
import { Avatar, Empty, Field, go, inp, Loading, useLoad, useRoute, useSession, useToast } from '../ui';

const ROLE: Record<Role, [string, string]> = {
  ADMIN: ['Admin', 'info'],
  MANAGER: ['Manager', 'warn'],
  CASHIER: ['Cashier', ''],
};
const locked = (u: User) => !!u.lockedUntil && new Date(u.lockedUntil) > new Date();

export function Staff() {
  const { parts } = useRoute();
  const { me } = useSession();
  const sel = parts[1];
  const list = useLoad<User[]>('/users');
  const users = list.data ?? [];
  const nLocked = users.filter(locked).length;
  const current = sel && sel !== 'new' ? users.find((u) => u.id === sel) : undefined;

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Staff</h1>
          <p>
            {users.length} people{nLocked > 0 && ` · ${nLocked} locked`}
          </p>
        </div>
        <a className="btn btn-primary" href="#/staff/new">
          <span className="ico s i-plus" />
          Add staff
        </a>
      </div>
      <div className={sel ? 'split' : undefined}>
        <section className="card">
          {list.loading && !list.data ? (
            <Loading />
          ) : !users.length ? (
            <Empty msg="No staff yet" />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>PIN set</th>
                  <th>Locked</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={u.id === sel ? 'sel' : undefined} onClick={() => go(`/staff/${u.id}`)}>
                    <td>
                      <div className="row">
                        <Avatar name={u.name} />
                        <div>
                          <a
                            href={`#/staff/${u.id}`}
                            className={`cell-main ${u.active ? '' : 't3'}`}
                            style={{ color: u.active ? 'inherit' : undefined }}
                          >
                            {u.name}
                          </a>
                          {u.id === me.id && (
                            <span className="t3" style={{ fontWeight: 400 }}>
                              {' '}
                              (you)
                            </span>
                          )}
                          <div className="cell-sub">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge plain ${ROLE[u.role][1]}`}>{ROLE[u.role][0]}</span>
                    </td>
                    <td>
                      {u.active ? <span className="badge ok">Active</span> : <span className="badge">Inactive</span>}
                    </td>
                    <td>{u.hasPin ? '✓' : <span className="t3">—</span>}</td>
                    <td>
                      {locked(u) ? (
                        <span className="badge bad">
                          <span className="num">{time(u.lockedUntil as string)}</span>
                        </span>
                      ) : (
                        <span className="t3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {sel === 'new' ? (
          <StaffForm key="new" user={null} onSaved={(u) => (list.reload(), go(`/staff/${u.id}`))} />
        ) : current ? (
          <StaffForm key={`${current.id}:${current.lockedUntil}`} user={current} onSaved={list.reload} />
        ) : sel && list.data ? (
          <div className="card panel">
            <Empty msg="Staff member not found" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StaffForm({ user, onSaved }: { user: User | null; onSaved: (u: User) => void }) {
  const { me } = useSession();
  const toast = useToast();
  const self = user?.id === me.id;
  const init = {
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? ('CASHIER' as Role),
    active: user?.active ?? true,
  };
  const [f, setF] = useState(init);
  const [password, setPassword] = useState<string | null>(user ? null : '');
  const [pin, setPin] = useState<string | null>(user ? null : '');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(body: object, msg: string) {
    setBusy(true);
    try {
      const u = user ? await api<User>(`/users/${user.id}`, 'PATCH', body) : await api<User>('/users', 'POST', body);
      setErrs({});
      setPassword(null);
      setPin(null);
      toast(msg, 'ok');
      onSaved(u);
    } catch (err) {
      setErrs(fieldErrors(err));
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save(
      {
        ...f,
        ...(password && { password }),
        ...(pin && { pin }),
      },
      user ? 'Staff member saved' : 'Staff member added',
    );
  }

  return (
    <form className="card panel" onSubmit={submit} aria-labelledby="st">
      <div className="card-h">
        <div className="row">
          <Avatar name={user?.name || '?'} size={40} />
          <div>
            <h2 id="st">{user?.name ?? 'New staff member'}</h2>
            <span className="t3 sm">{user ? ROLE[user.role][0] : 'Add someone to the team'}</span>
          </div>
        </div>
        <a className="btn btn-ghost icon-btn" aria-label="Close" href="#/staff">
          <span className="ico s i-x" />
        </a>
      </div>
      <div className="card-b" style={{ display: 'grid', gap: 14 }}>
        {user && locked(user) && (
          <div className="note bad between">
            <span className="row">
              <span className="ico s i-lock" />
              Locked after 5 wrong PINs, until {time(user.lockedUntil as string)}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => save({ unlock: true }, `${user.name} unlocked`)}
            >
              Unlock
            </button>
          </div>
        )}
        <Field id="n" label="Name" req error={errs.name}>
          <input
            {...inp('n', errs.name)}
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <Field id="e" label="Email" req error={errs.email}>
          <input
            {...inp('e', errs.email)}
            type="email"
            required
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </Field>
        <Field id="r" label="Role" error={errs.role}>
          <select
            {...inp('r', errs.role)}
            disabled={self}
            value={f.role}
            onChange={(e) => setF({ ...f, role: e.target.value as Role })}
          >
            <option value="CASHIER">Cashier</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        {password === null || pin === null ? (
          <div className="g2">
            {password === null ? (
              <button className="btn" type="button" onClick={() => setPassword('')}>
                Set new password
              </button>
            ) : (
              <span />
            )}
            {pin === null && (
              <button className="btn" type="button" onClick={() => setPin('')}>
                Set new PIN
              </button>
            )}
          </div>
        ) : null}
        {password !== null && (
          <Field
            id="pw"
            label={user ? 'New password' : 'Password'}
            req
            error={errs.password}
            help="At least 8 characters"
          >
            <input
              {...inp('pw', errs.password)}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {pin !== null && (
          <Field id="pin" label={user ? 'New PIN' : 'PIN'} error={errs.pin} help="4–6 digits, for the POS">
            <input
              {...inp('pin', errs.pin, 'num')}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4,6}"
              required={!!user}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </Field>
        )}
        <label className="check">
          <input
            type="checkbox"
            className="switch"
            disabled={self}
            checked={f.active}
            onChange={(e) => setF({ ...f, active: e.target.checked })}
          />{' '}
          Active
        </label>
        {self && (
          <p className="help" style={{ margin: 0 }}>
            On your own account, Role and Active are disabled. You can’t demote or deactivate yourself.
          </p>
        )}
      </div>
      <div className="card-f">
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!user) return go('/staff');
            setF(init);
            setPassword(null);
            setPin(null);
            setErrs({});
          }}
        >
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {user ? 'Save changes' : 'Add staff'}
        </button>
      </div>
    </form>
  );
}
