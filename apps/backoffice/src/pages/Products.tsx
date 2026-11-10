// B3 Products — mockups/v2/b3-products.html. Routes: #/products, #/products/new, #/products/:id
import { useState, type FormEvent } from 'react';
import { api, fieldErrors, qs } from '../api';
import { money } from '../format';
import type { Category, Page, Product } from '../types';
import {
  Empty,
  Field,
  go,
  inp,
  Loading,
  Pager,
  Seg,
  useDebounced,
  useLoad,
  useRoute,
  useSession,
  useToast,
} from '../ui';

type Active = 'true' | 'false' | 'all';

export function Products() {
  const { parts } = useRoute();
  const sel = parts[1];
  const { lowStock } = useSession();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState<Active>('true');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const list = useLoad<Page<Product>>(`/products${qs({ search: q, categoryId, active, page, limit: 50 })}`);
  const cats = useLoad<Category[]>('/categories');
  const catName = new Map((cats.data ?? []).map((c) => [c.id, c.name]));
  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Products</h1>
          <p>
            {list.data ? `${list.data.total} products` : ' '}
            {lowStock > 0 && ` · ${lowStock} at or below reorder level`}
          </p>
        </div>
        <a className="btn btn-primary" href="#/products/new">
          <span className="ico s i-plus" />
          Add product
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
                placeholder="Search name, SKU or barcode"
                aria-label="Search"
                value={search}
                onChange={(e) => filter(setSearch)(e.target.value)}
              />
            </div>
            <select
              className="input"
              aria-label="Category"
              value={categoryId}
              onChange={(e) => filter(setCategoryId)(e.target.value)}
            >
              <option value="">All categories</option>
              {cats.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Seg
              label="Status"
              value={active}
              options={[
                ['true', 'Active'],
                ['false', 'Inactive'],
                ['all', 'All'],
              ]}
              onChange={filter(setActive)}
            />
          </div>
          {list.loading && !list.data ? (
            <Loading />
          ) : !list.data?.data.length ? (
            <Empty
              msg={search || categoryId ? 'No products match' : 'No products yet'}
              action={
                <a className="btn btn-primary" href="#/products/new">
                  Add product
                </a>
              }
            />
          ) : (
            <>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name ↑</th>
                    <th>Category</th>
                    <th className="r">Price</th>
                    <th className="r">Stock</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((p) => (
                    <tr key={p.id} className={p.id === sel ? 'sel' : undefined} onClick={() => go(`/products/${p.id}`)}>
                      <td className="num t2">{p.sku}</td>
                      <td className="cell-main">
                        <a href={`#/products/${p.id}`} style={{ color: 'inherit' }}>
                          {p.name}
                        </a>
                      </td>
                      <td className="t2">{p.categoryId ? catName.get(p.categoryId) : '—'}</td>
                      <td className="r num">{money(p.price)}</td>
                      <td className={`r num ${stockClass(p)}`}>{p.stockQty < 0 ? `−${-p.stockQty}` : p.stockQty}</td>
                      <td>
                        {p.active ? (
                          <span className="badge ok plain">Yes</span>
                        ) : (
                          <span className="badge plain">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager {...list.data} onPage={setPage} />
            </>
          )}
        </section>
        {sel && (
          <ProductPanel
            key={sel}
            id={sel === 'new' ? null : sel}
            categories={cats.data ?? []}
            onSaved={(p) => {
              list.reload();
              go(`/products/${p.id}`);
            }}
          />
        )}
      </div>
    </div>
  );
}

const stockClass = (p: Product) => (p.stockQty < 0 ? 'neg' : p.stockQty <= p.reorderLevel ? 'low' : '');

function ProductPanel(props: { id: string | null; categories: Category[]; onSaved: (p: Product) => void }) {
  const one = useLoad<Product>(props.id && `/products/${props.id}`);
  if (props.id && !one.data)
    return <div className="card panel">{one.loading ? <Loading rows={8} /> : <Empty msg="Product not found" />}</div>;
  return <ProductForm product={one.data ?? null} {...props} onSaved={(p) => (one.reload(), props.onSaved(p))} />;
}

function ProductForm({
  product,
  categories,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  onSaved: (p: Product) => void;
}) {
  const toast = useToast();
  const init = {
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? '',
    price: product?.price ?? '',
    cost: product?.cost ?? '',
    taxRate: product?.taxRate ?? '',
    reorderLevel: String(product?.reorderLevel ?? ''),
    active: product?.active ?? true,
  };
  const [f, setF] = useState(init);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = {
      sku: f.sku,
      barcode: f.barcode,
      name: f.name,
      categoryId: f.categoryId || null,
      price: f.price,
      active: f.active,
      // Optional fields are left out when blank, so the server keeps/defaults them
      ...(f.cost && { cost: f.cost }),
      ...(f.taxRate && { taxRate: f.taxRate }),
      ...(f.reorderLevel !== '' && { reorderLevel: Number(f.reorderLevel) }),
    };
    try {
      const saved = product
        ? await api<Product>(`/products/${product.id}`, 'PATCH', body)
        : await api<Product>('/products', 'POST', body);
      setErrs({});
      toast('Product saved', 'ok');
      onSaved(saved);
    } catch (err) {
      setErrs(fieldErrors(err));
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const low = product && product.stockQty <= product.reorderLevel;
  return (
    <form className="card panel" onSubmit={submit} aria-labelledby="ft">
      <div className="card-h">
        <div>
          <h2 id="ft">{product?.name ?? 'New product'}</h2>
          <span className="t3 sm">{product ? 'Edit product' : 'Add a product to the catalog'}</span>
        </div>
        <a className="btn btn-ghost icon-btn" aria-label="Close" href="#/products">
          <span className="ico s i-x" />
        </a>
      </div>
      <div className="card-b" style={{ display: 'grid', gap: 14 }}>
        <div className="g2">
          <Field id="sku" label="SKU" req error={errs.sku}>
            <input {...inp('sku', errs.sku, 'num')} required value={f.sku} onChange={set('sku')} />
          </Field>
          <Field id="bc" label="Barcode" error={errs.barcode}>
            <input {...inp('bc', errs.barcode, 'num')} value={f.barcode} onChange={set('barcode')} />
          </Field>
        </div>
        <Field id="nm" label="Name" req error={errs.name}>
          <input {...inp('nm', errs.name)} required value={f.name} onChange={set('name')} />
        </Field>
        <Field id="cat" label="Category" error={errs.categoryId}>
          <select {...inp('cat', errs.categoryId)} value={f.categoryId} onChange={set('categoryId')}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="g2">
          <Field id="pr" label="Price" req error={errs.price}>
            <input
              {...inp('pr', errs.price, 'num')}
              required
              inputMode="decimal"
              value={f.price}
              onChange={set('price')}
            />
          </Field>
          <Field id="co" label="Cost" error={errs.cost}>
            <input {...inp('co', errs.cost, 'num')} inputMode="decimal" value={f.cost} onChange={set('cost')} />
          </Field>
          <Field id="tx" label="Tax rate %" error={errs.taxRate}>
            <input
              {...inp('tx', errs.taxRate, 'num')}
              inputMode="decimal"
              placeholder="10.00"
              value={f.taxRate}
              onChange={set('taxRate')}
            />
          </Field>
          <Field id="ro" label="Reorder level" error={errs.reorderLevel}>
            <input
              {...inp('ro', errs.reorderLevel, 'num')}
              type="number"
              min={0}
              value={f.reorderLevel}
              onChange={set('reorderLevel')}
            />
          </Field>
        </div>
        {product && (
          <div
            className="between"
            style={{
              padding: '12px 14px',
              background: low ? 'var(--warn-50)' : 'var(--surface-2)',
              borderRadius: 'var(--r)',
            }}
          >
            <div>
              <div className="sm" style={{ color: low ? 'var(--warn)' : 'var(--text-2)', fontWeight: 550 }}>
                Stock on hand
              </div>
              <div
                className="num"
                style={{
                  fontSize: 22,
                  fontWeight: 650,
                  color: product.stockQty < 0 ? 'var(--danger)' : low ? 'var(--warn)' : undefined,
                }}
              >
                {product.stockQty}
              </div>
            </div>
            <div className="row">
              <a className="btn btn-sm" href={`#/inventory/receive?p=${product.id}`}>
                Receive stock
              </a>
              <a className="btn btn-sm" href={`#/inventory/count?p=${product.id}`}>
                Count stock
              </a>
            </div>
          </div>
        )}
        <label className="check">
          <input
            type="checkbox"
            className="switch"
            checked={f.active}
            onChange={(e) => setF({ ...f, active: e.target.checked })}
          />{' '}
          Active
        </label>
      </div>
      <div className="card-f">
        <button type="button" className="btn" onClick={() => (product ? (setF(init), setErrs({})) : go('/products'))}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {product ? 'Save changes' : 'Add product'}
        </button>
      </div>
    </form>
  );
}
