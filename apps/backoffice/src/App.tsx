// App shell (06 Part B): login gate, role-based nav, top bar, routes.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, setOnUnauthorized, setToken } from './api';
import { setShopTz } from './format';
import { Categories } from './pages/Categories';
import { Customers } from './pages/Customers';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Login } from './pages/Login';
import { Products } from './pages/Products';
import { Reports } from './pages/Reports';
import { Sales } from './pages/Sales';
import { SettingsPage } from './pages/Settings';
import { Staff } from './pages/Staff';
import { RANK, type Me, type Role, type Settings } from './types';
import { Avatar, Forbidden, SessionCtx, useRoute, type Session } from './ui';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  section: string;
  role: Role;
  page: () => ReactNode;
}
const NAV: NavItem[] = [
  { path: '', label: 'Dashboard', icon: 'i-dash', section: '', role: 'MANAGER', page: () => <Dashboard /> },
  { path: 'products', label: 'Products', icon: 'i-box', section: 'Catalog', role: 'MANAGER', page: () => <Products /> },
  {
    path: 'categories',
    label: 'Categories',
    icon: 'i-tag',
    section: 'Catalog',
    role: 'MANAGER',
    page: () => <Categories />,
  },
  {
    path: 'inventory',
    label: 'Inventory',
    icon: 'i-layers',
    section: 'Catalog',
    role: 'MANAGER',
    page: () => <Inventory />,
  },
  { path: 'sales', label: 'Sales', icon: 'i-receipt', section: 'Sales', role: 'MANAGER', page: () => <Sales /> },
  {
    path: 'customers',
    label: 'Customers',
    icon: 'i-users',
    section: 'Sales',
    role: 'MANAGER',
    page: () => <Customers />,
  },
  { path: 'reports', label: 'Reports', icon: 'i-chart', section: 'Sales', role: 'MANAGER', page: () => <Reports /> },
  { path: 'staff', label: 'Staff', icon: 'i-shield', section: 'Admin', role: 'ADMIN', page: () => <Staff /> },
  {
    path: 'settings',
    label: 'Settings',
    icon: 'i-sliders',
    section: 'Admin',
    role: 'ADMIN',
    page: () => <SettingsPage />,
  },
];

/** User + shop settings for the stored token, or the refusal message for a cashier (06 B1). */
async function loadSession(): Promise<{ me: Me; settings: Settings } | string> {
  const me = await api<Me>('/auth/me');
  if (RANK[me.role] < RANK.MANAGER) {
    setToken(null);
    return 'The back office is for managers. Use the POS.';
  }
  const settings = await api<Settings>('/settings');
  setShopTz(settings.timezone);
  return { me, settings };
}

export function App() {
  const [session, setSession] = useState<{ me: Me; settings: Settings } | null>(null);
  const [checking, setChecking] = useState(!!getToken());

  const logout = useCallback(() => {
    setToken(null);
    setSession(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => setSession(null));
    if (!getToken()) return;
    loadSession()
      .then((s) => typeof s !== 'string' && setSession(s))
      // Only a rejected token signs out; a network blip or a 500 leaves the token for the next try
      .catch((e) => e instanceof ApiError && e.status === 401 && setToken(null))
      .finally(() => setChecking(false));
  }, []);

  async function onToken() {
    const s = await loadSession();
    if (typeof s === 'string') return s;
    setSession(s);
    return null;
  }

  if (checking) return null;
  if (!session) return <Login onToken={onToken} />;
  return <Shell {...session} setSettings={(settings) => setSession({ ...session, settings })} logout={logout} />;
}

function Shell(props: Omit<Session, 'lowStock'>) {
  const { parts } = useRoute();
  const { me, settings, logout } = props;
  const section = parts[0] ?? '';
  const item = NAV.find((n) => n.path === section) ?? NAV[0];
  const [lowStock, setLowStock] = useState(0);

  // Inventory badge: low-stock count, refreshed whenever the page changes
  useEffect(() => {
    let live = true;
    api<{ data: unknown[] }>('/reports/low-stock').then(
      (r) => live && setLowStock(r.data.length),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [section]);

  useEffect(() => {
    document.title = `${item.label} · ${settings.shopName}`;
  }, [item, settings.shopName]);

  const visible = NAV.filter((n) => RANK[me.role] >= RANK[n.role]);
  return (
    <SessionCtx.Provider value={{ ...props, lowStock }}>
      <div className="app">
        <aside className="side" aria-label="Main">
          <div className="logo">
            <span className="logo-mark">{settings.shopName.slice(0, 1).toUpperCase()}</span>
            {settings.shopName}
          </div>
          {visible.map((n, i) => {
            const head = n.section !== visible[i - 1]?.section && n.section;
            return (
              <div key={n.path} style={{ display: 'contents' }}>
                {head && <div className="sec">{head}</div>}
                <a
                  href={`#/${n.path}`}
                  className={n === item ? 'on' : undefined}
                  aria-current={n === item ? 'page' : undefined}
                >
                  <span className={`ico ${n.icon}`} />
                  {n.label}
                  {n.path === 'inventory' && lowStock > 0 && (
                    <span className="cnt" title={`${lowStock} at or below reorder level`}>
                      {lowStock}
                    </span>
                  )}
                </a>
              </div>
            );
          })}
          <a
            href="#/"
            style={{ marginTop: 'auto' }}
            onClick={(e) => {
              e.preventDefault();
              logout();
            }}
          >
            <span className="ico i-lock" />
            Log out
          </a>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="crumb">
              {item.section && `${item.section} / `}
              <b>{item.label}</b>
            </div>
            <div className="row">
              <Avatar name={me.name} />
              <span style={{ fontWeight: 550 }}>{me.name}</span>
              <span className="badge plain">{me.role === 'ADMIN' ? 'Admin' : 'Manager'}</span>
            </div>
          </header>
          {RANK[me.role] >= RANK[item.role] ? item.page() : <Forbidden />}
        </div>
      </div>
    </SessionCtx.Provider>
  );
}
