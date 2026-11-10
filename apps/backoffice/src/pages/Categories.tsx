// B4 Categories — mockups/v2/b4-categories.html. Inline rename saves on Enter or blur.
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Category } from '../types';
import { Empty, Loading, useLoad, useToast } from '../ui';

export function Categories() {
  const list = useLoad<Category[]>('/categories');
  const toast = useToast();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/categories', 'POST', { name });
      setName('');
      list.reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }

  async function rename(c: Category, input: HTMLInputElement) {
    const value = input.value;
    if (value.trim() === c.name) return;
    try {
      await api(`/categories/${c.id}`, 'PATCH', { name: value });
      setSaved(c.id);
      list.reload();
    } catch (err) {
      toast((err as Error).message);
      input.value = c.name; // put the old name back (the row doesn't re-render: its name didn't change)
    }
  }

  async function remove(c: Category) {
    if (!confirm(`Delete category “${c.name}”?`)) return;
    try {
      await api(`/categories/${c.id}`, 'DELETE');
      list.reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-h">
        <div>
          <h1>Categories</h1>
          <p>Click a name to rename it. Saves on Enter or when you leave the field.</p>
        </div>
      </div>
      <section className="card">
        <form onSubmit={add}>
          <table className="tbl static">
            <thead>
              <tr>
                <th>Name</th>
                <th className="r">Products</th>
                <th className="r" style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {list.data?.map((c) => (
                <tr key={`${c.id}:${c.name}`}>
                  <td>
                    <input
                      className="input inl"
                      defaultValue={c.name}
                      aria-label="Category name"
                      onFocus={() => setSaved(null)}
                      onBlur={(e) => rename(c, e.currentTarget)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.currentTarget.blur();
                        } else if (e.key === 'Escape') {
                          e.currentTarget.value = c.name;
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  </td>
                  <td className={`r num ${c.productCount ? 't2' : 't3'}`}>{c.productCount}</td>
                  <td className="r">
                    {saved === c.id ? (
                      <span className="badge ok plain">Saved</span>
                    ) : c.productCount ? (
                      <span className="tip" data-tip={`${c.productCount} products use this category`}>
                        <button type="button" className="btn btn-sm btn-danger" disabled>
                          Delete
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(c)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <input
                    className="input"
                    placeholder="New category name"
                    aria-label="New category name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </td>
                <td className="r">
                  <button className="btn btn-sm btn-primary" disabled={!name.trim()}>
                    <span className="ico s i-plus" />
                    Add
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </form>
        {list.loading && !list.data && <Loading />}
        {list.data?.length === 0 && <Empty msg="No categories yet — type a name above and press Add" />}
      </section>
    </div>
  );
}
