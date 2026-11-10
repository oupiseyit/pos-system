// Shared UI: hash router, session, toasts, data loading, states (06 states checklist), dialog, form bits.
// Markup and class names come from mockups/v2/styles.css.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { api } from './api';
import { avatar } from './format';
import type { Me, Settings } from './types';

/* ---------- Router: #/section/id?query ---------- */
const onHash = (cb: () => void) => {
  addEventListener('hashchange', cb);
  return () => removeEventListener('hashchange', cb);
};
export function useRoute() {
  const hash = useSyncExternalStore(onHash, () => location.hash);
  return useMemo(() => {
    const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
    return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(query) };
  }, [hash]);
}
export const go = (path: string) => {
  location.hash = path;
};

/* ---------- Session ---------- */
export interface Session {
  me: Me;
  settings: Settings;
  setSettings: (s: Settings) => void;
  lowStock: number;
  logout: () => void;
}
export const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx) as Session;

/* ---------- Toasts ---------- */
type ToastFn = (msg: string, kind?: 'error' | 'ok') => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: 'error' | 'ok'; n: number } | null>(null);
  const show = useCallback<ToastFn>((msg, kind = 'error') => setT((p) => ({ msg, kind, n: (p?.n ?? 0) + 1 })), []);
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), 4000);
    return () => clearTimeout(id);
  }, [t]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div className="toast" role={t.kind === 'error' ? 'alert' : 'status'} key={t.n}>
          <span className={`ico s ${t.kind === 'error' ? 'i-alert' : 'i-refresh'}`} style={okIco(t.kind)} />
          {t.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
const okIco = (kind: string) => (kind === 'ok' ? { color: '#7fd9b4' } : undefined);

/* ---------- Data loading ---------- */
/**
 * GET `path` (null = don't load). Errors become a toast and the screen keeps what it had.
 * `data` belongs to the current path only, so a detail panel never shows the previous record.
 */
export function useLoad<T>(path: string | null) {
  const [n, setN] = useState(0);
  const toast = useToast();
  const [st, setSt] = useState<{ path: string | null; n: number; data?: T; error?: Error }>({ path: null, n: -1 });
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then(
      (data) => live && setSt({ path, n, data }),
      (error: Error) => {
        if (!live) return;
        setSt({ path, n, error });
        toast(error.message);
      },
    );
    return () => {
      live = false;
    };
  }, [path, n, toast]);
  const same = st.path === path;
  return {
    data: same ? st.data : undefined,
    error: same ? st.error : undefined,
    loading: !!path && (!same || st.n !== n),
    reload: useCallback(() => setN((x) => x + 1), []),
  };
}

/* ---------- States ---------- */
/** Skeleton rows, shown only after 300 ms so fast loads don't flash. */
export function Loading({ rows = 4 }: { rows?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div style={{ padding: 20, display: 'grid', gap: 14 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel" style={{ width: `${90 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function Empty({ msg, action }: { msg: string; action?: ReactNode }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
      <span className="t2">{msg}</span>
      {action}
    </div>
  );
}

export function Forbidden() {
  return (
    <div className="page">
      <div className="card card-b" style={{ maxWidth: 480 }}>
        <h2>You don’t have access to this</h2>
        <p className="t2">This page is for admins. Ask the shop owner if you need it.</p>
        <a className="btn" href="#/">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}

/* ---------- Dialog ---------- */
export function Dialog(props: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass inline arrows: keep the latest in a ref so the effect below runs once per open,
  // not on every keystroke (which used to move focus to the ✕ mid-typing).
  const { onClose } = props;
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // Read during the first render, before an autoFocus inside the dialog moves focus
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    const d = ref.current;
    // Keep an autoFocus the caller chose; else the first field, else the first footer button
    if (!d?.contains(document.activeElement))
      (
        d?.querySelector<HTMLElement>('.card-b :is(input, textarea, select):not(:disabled)') ??
        d?.querySelector<HTMLElement>('.card-f button:not(:disabled)')
      )?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('keydown', esc);
      // Back to the opener, unless something else already took focus (e.g. the receipt's New sale)
      if (document.activeElement === document.body) opener?.focus();
    };
  }, [opener]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t" ref={ref}>
        <div className="card-h">
          <h2 id="dlg-t">{props.title}</h2>
          <button className="btn btn-ghost icon-btn" aria-label="Close" onClick={onClose}>
            <span className="ico s i-x" />
          </button>
        </div>
        <div className="card-b">{props.children}</div>
        <div className="card-f">{props.footer}</div>
      </div>
    </div>
  );
}

/* ---------- Form bits ---------- */
export function Field(p: {
  id: string;
  label: string;
  req?: boolean;
  error?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={p.id} className={p.req ? 'req' : undefined}>
        {p.label}
      </label>
      {p.children}
      {p.error && (
        <span className="ferr" id={`${p.id}-err`}>
          <span className="ico s i-alert" />
          {p.error}
        </span>
      )}
      {p.help && <span className="help">{p.help}</span>}
    </div>
  );
}

/** Props for an <input> with error styling + aria wiring. */
export const inp = (id: string, error?: string, extra = '') => ({
  id,
  className: `input ${extra} ${error ? 'err' : ''}`.trim(),
  'aria-invalid': !!error || undefined,
  'aria-describedby': error ? `${id}-err` : undefined,
});

export function Avatar({ name, size }: { name: string; size?: number }) {
  const a = avatar(name);
  const style = { '--c': a.color, ...(size && { width: size, height: size, fontSize: size * 0.35 }) };
  return (
    <span className="av" style={style as React.CSSProperties} aria-hidden="true">
      {a.initials}
    </span>
  );
}

export function Pager({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  return (
    <div className="pager">
      <span>
        {from}–{Math.min(total, page * limit)} of {total}
      </span>
      <div className="row">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="btn btn-sm" disabled={page * limit >= total} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function Seg<T extends string>(p: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={p.label}>
      {p.options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          className={v === p.value ? 'on' : undefined}
          aria-pressed={v === p.value}
          onClick={() => p.onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/**
 * Search-as-you-type picker on a native <datalist>. `search(q)` gives the API path (a Page<T>).
 * Enter picks the row `exact` accepts (a scanned barcode/SKU), or the only result.
 */
export function Picker<T extends { id: string }>(props: {
  id: string;
  value: T | null;
  onPick: (v: T | null) => void;
  search: (q: string) => string;
  label: (v: T) => string;
  exact?: (v: T, q: string) => boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const { value, label, onPick } = props;
  const [text, setText] = useState(value ? label(value) : '');
  const q = useDebounced(text.trim());
  const picked = !!value && text === label(value);
  const opts = useLoad<{ data: T[]; total: number }>(q && !picked ? props.search(q) : null);
  const toast = useToast();

  function change(v: string) {
    setText(v);
    if (!v) return onPick(null);
    const hit = opts.data?.data.find((o) => label(o) === v);
    if (hit) onPick(hit);
    else if (value) onPick(null);
  }

  async function enter() {
    const v = text.trim();
    if (!v || picked) return;
    try {
      const r = await api<{ data: T[]; total: number }>(props.search(v));
      const hit = r.data.find((o) => props.exact?.(o, v)) ?? (r.total === 1 ? r.data[0] : undefined);
      if (!hit) return toast(`Nothing matches “${v}”`);
      setText(label(hit));
      onPick(hit);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <div className="input-icon">
      <span className="ico s i-search" />
      <input
        id={props.id}
        className="input"
        style={{ width: '100%' }} // beats `.filters .input { width: auto }`
        list={`${props.id}-list`}
        placeholder={props.placeholder}
        aria-label={props.ariaLabel}
        autoComplete="off"
        value={text}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            enter();
          }
        }}
      />
      <datalist id={`${props.id}-list`}>
        {opts.data?.data.map((o) => (
          <option key={o.id} value={label(o)} />
        ))}
      </datalist>
    </div>
  );
}

/** Value that settles `ms` after the last change (search boxes). */
export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export const StatusBadge = ({ status }: { status: string }) =>
  status === 'VOIDED' ? <span className="badge bad">Voided</span> : <span className="badge ok">Completed</span>;
