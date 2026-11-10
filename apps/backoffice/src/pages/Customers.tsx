// B7 Customers — mockups/v2/b7-customers.html. Routes: #/customers, #/customers/new, #/customers/:id
import { useState, type FormEvent } from 'react';
import { api, fieldErrors, qs } from '../api';
import { date, money, shortDateTime } from '../format';
import type { Customer, CustomerDetail, Page } from '../types';
import { Avatar, Empty, Field, go, inp, Loading, Pager, useDebounced, useLoad, useRoute, useToast } from '../ui';

export function Customers() {
  const { parts } = useRoute();
  const sel = parts[1];
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const list = useLoad<Page<Customer>>(`/customers${qs({ search: q, page, limit: 50 })}`);

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Customers</h1>
          <p>{list.data ? `${list.data.total} customers` : ' '}</p>
        </div>
        <a className="btn btn-primary" href="#/customers/new">
          <span className="ico s i-plus" />
          Add customer
        </a>
      </div>
      <div className={sel ? 'split' : undefined}>
        <section className="card">
          <div className="filters">
            <div className="input-icon grow">
              <span className="ico s i-search" />
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="Search name, phone or email"
                aria-label="Search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          {list.loading && !list.data ? (
            <Loading />
          ) : !list.data?.data.length ? (
            <Empty
              msg={search ? 'No customers match' : 'No customers yet'}
              action={
                <a className="btn btn-primary" href="#/customers/new">
                  Add customer
                </a>
              }
            />
          ) : (
            <>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th className="r">Sales</th>
                    <th className="r">Total spent</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((c) => (
                    <tr
                      key={c.id}
                      className={c.id === sel ? 'sel' : undefined}
                      onClick={() => go(`/customers/${c.id}`)}
                    >
                      <td>
                        <div className="row">
                          <Avatar name={c.name} />
                          <a className="cell-main" href={`#/customers/${c.id}`} style={{ color: 'inherit' }}>
                            {c.name}
                          </a>
                        </div>
                      </td>
                      <td className={`num ${c.phone ? 't2' : 't3'}`}>{c.phone ?? '—'}</td>
                      <td className={c.email ? 't2' : 't3'}>{c.email ?? '—'}</td>
                      <td className={`r num ${c.salesCount ? '' : 't3'}`}>{c.salesCount}</td>
                      <td className={`r num ${c.salesCount ? '' : 't3'}`}>{money(c.totalSpent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager {...list.data} onPage={setPage} />
            </>
          )}
        </section>
        {sel && (
          <CustomerPanel
            key={sel}
            id={sel === 'new' ? null : sel}
            onChange={(id) => {
              list.reload();
              go(id ? `/customers/${id}` : '/customers');
            }}
          />
        )}
      </div>
    </div>
  );
}

function CustomerPanel({ id, onChange }: { id: string | null; onChange: (id: string | null) => void }) {
  const one = useLoad<CustomerDetail>(id && `/customers/${id}`);
  if (id && !one.data)
    return <div className="card panel">{one.loading ? <Loading rows={8} /> : <Empty msg="Customer not found" />}</div>;
  return (
    <CustomerForm
      c={one.data ?? null}
      onChange={(x) => {
        if (x === id) one.reload(); // same record: refresh stats; new/deleted: the route changes instead
        onChange(x);
      }}
    />
  );
}

function CustomerForm({ c, onChange }: { c: CustomerDetail | null; onChange: (id: string | null) => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: c?.name ?? '',
    phone: c?.phone ?? '',
    email: c?.email ?? '',
    notes: c?.notes ?? '',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = c
        ? await api<{ id: string }>(`/customers/${c.id}`, 'PATCH', f)
        : await api<{ id: string }>('/customers', 'POST', f);
      setErrs({});
      toast('Customer saved', 'ok');
      onChange(saved.id);
    } catch (err) {
      setErrs(fieldErrors(err));
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!c || !confirm(`Delete customer “${c.name}”?`)) return;
    try {
      await api(`/customers/${c.id}`, 'DELETE');
      toast('Customer deleted', 'ok');
      onChange(null);
    } catch (err) {
      toast((err as Error).message);
    }
  }

  const hasSales = !!c?.recentSales.length;
  const stat = { padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r)' };
  return (
    <form className="card panel" onSubmit={submit} aria-labelledby="ct">
      <div className="card-h">
        <div className="row">
          <Avatar name={c?.name || '?'} size={40} />
          <div>
            <h2 id="ct">{c?.name ?? 'New customer'}</h2>
            <span className="t3 sm">{c ? `Customer since ${date(c.createdAt)}` : 'Add a customer'}</span>
          </div>
        </div>
        <a className="btn btn-ghost icon-btn" aria-label="Close" href="#/customers">
          <span className="ico s i-x" />
        </a>
      </div>
      <div className="card-b" style={{ display: 'grid', gap: 14 }}>
        {c && (
          <div className="g2">
            <div style={stat}>
              <div className="t3 sm">Sales</div>
              <div className="num" style={{ fontSize: 22, fontWeight: 650 }}>
                {c.stats.salesCount}
              </div>
            </div>
            <div style={stat}>
              <div className="t3 sm">Total spent</div>
              <div className="num" style={{ fontSize: 22, fontWeight: 650 }}>
                {money(c.stats.totalSpent)}
              </div>
            </div>
          </div>
        )}
        <Field id="n" label="Name" req error={errs.name}>
          <input {...inp('n', errs.name)} required value={f.name} onChange={set('name')} />
        </Field>
        <div className="g2">
          <Field id="p" label="Phone" error={errs.phone}>
            <input {...inp('p', errs.phone, 'num')} type="tel" value={f.phone} onChange={set('phone')} />
          </Field>
          <Field id="e" label="Email" error={errs.email}>
            <input {...inp('e', errs.email)} type="email" value={f.email} onChange={set('email')} />
          </Field>
        </div>
        <Field id="no" label="Notes" error={errs.notes}>
          <textarea {...inp('no', errs.notes)} rows={2} value={f.notes} onChange={set('notes')} />
        </Field>
        {c && (
          <div>
            <div className="t3 sm" style={{ marginBottom: 6 }}>
              Recent sales
            </div>
            {hasSales ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                <table className="tbl">
                  <tbody>
                    {c.recentSales.map((s) => (
                      <tr key={s.id} onClick={() => go(`/sales/${s.id}`)}>
                        <td className="num">
                          <a href={`#/sales/${s.id}`}>{s.receiptNo}</a>
                        </td>
                        <td className="num t3">{shortDateTime(s.createdAt)}</td>
                        <td className={`r num ${s.status === 'VOIDED' ? 't3' : ''}`}>{money(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <span className="t3 sm">No sales yet</span>
            )}
          </div>
        )}
      </div>
      <div className="card-f" style={{ justifyContent: 'space-between' }}>
        {c && hasSales ? (
          <span className="tip" data-tip="This customer has sales">
            <button type="button" className="btn btn-danger" disabled>
              Delete
            </button>
          </span>
        ) : c ? (
          <button type="button" className="btn btn-danger" onClick={remove}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={busy}>
          {c ? 'Save changes' : 'Add customer'}
        </button>
      </div>
    </form>
  );
}
