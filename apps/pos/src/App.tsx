// POS app (06 Part A): device setup → PIN → sell. Sync loops run while someone is logged in.
import { useEffect, useState, type ReactNode } from 'react';
import { setShopTz, time } from '../../backoffice/src/format';
import type { Session } from './api';
import { refresh, settings } from './catalog';
import type { Line } from './cart';
import { entries, flush } from './outbox';
import { Attention } from './screens/Attention';
import type { Finished } from './screens/Pay';
import { Pin } from './screens/Pin';
import { Recent } from './screens/Recent';
import { Sell } from './screens/Sell';
import { Setup } from './screens/Setup';
import { K, read, useOnline, useStore } from './store';

export type View = 'sell' | 'recent' | 'attention';
export interface Cust {
  id: string;
  name: string;
}

/** Ask the sync loop to run now (after a sale, "Sync now", retry). */
export const syncNow = () => dispatchEvent(new Event('pos:sync'));

export function App() {
  useStore();
  const device = read<{ code: string } | null>(K.device, null);
  const session = read<Session | null>(K.session, null);
  const tz = settings()?.timezone;
  useEffect(() => {
    if (tz) setShopTz(tz);
  }, [tz]);
  if (!device) return <Setup />;
  if (!session) return <Pin />;
  return <Main key={session.token} session={session} />;
}

function Main({ session }: { session: Session }) {
  const [view, setView] = useState<View>('sell');
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<Cust | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);

  // Upload loop (03 §5): now, every 30 s, when the network returns, and on demand.
  // A 401 pauses it until the next PIN login (this component remounts per token).
  useEffect(() => {
    let paused = false;
    let lastCatalog = 0;
    const tick = async () => {
      if (!navigator.onLine) return;
      if (!paused && (await flush()) === 'unauthorized') paused = true;
      // Catalog deltas every 5 min (and on demand)
      if (Date.now() - lastCatalog > 5 * 60_000) {
        lastCatalog = Date.now();
        await refresh().catch(() => (lastCatalog = 0));
      }
    };
    const now = () => {
      lastCatalog = 0;
      paused = false;
      tick();
    };
    tick();
    const id = setInterval(tick, 30_000);
    addEventListener('online', tick);
    addEventListener('pos:sync', now);
    return () => {
      clearInterval(id);
      removeEventListener('online', tick);
      removeEventListener('pos:sync', now);
    };
  }, []);

  if (view === 'recent') return <Recent session={session} go={setView} />;
  if (view === 'attention') return <Attention session={session} go={setView} />;
  return (
    <Sell
      session={session}
      go={setView}
      lines={lines}
      setLines={setLines}
      customer={customer}
      setCustomer={setCustomer}
      finished={finished}
      onNew={() => setFinished(null)}
      onFinished={(f) => {
        setLines([]);
        setCustomer(null);
        setFinished(f);
        syncNow();
      }}
    />
  );
}

/** Header badge (06 A3): online/offline + pending count, red when sales need attention. */
export function Conn({ onAttention }: { onAttention?: () => void }) {
  useStore();
  const online = useOnline();
  const list = entries();
  const attn = list.filter((e) => e.state === 'attention').length;
  const pending = list.length - attn;
  if (attn)
    return (
      <button
        className="conn attn"
        style={{ border: 0, cursor: 'pointer' }}
        onClick={onAttention}
        disabled={!onAttention}
      >
        <span className="ico s i-alert" />
        {attn} need{attn === 1 ? 's' : ''} attention
      </button>
    );
  return (
    <span className={`conn ${online ? 'on' : 'off'}`} role="status">
      <i />
      {online ? 'Online' : 'Offline'} · {pending} pending
    </span>
  );
}

/** POS top bar; `left` replaces the logo (A7/A8 put a Back button there). */
export function Top(props: { left?: ReactNode; children?: ReactNode; right?: ReactNode; onAttention?: () => void }) {
  useStore();
  const shop = settings()?.shopName ?? 'POS';
  const code = read<{ code: string } | null>(K.device, null)?.code;
  return (
    <header className="pos-top">
      {props.left ?? (
        <>
          <div className="logo">
            <span className="logo-mark">{shop.slice(0, 1).toUpperCase()}</span>
            {shop}
          </div>
          {code && <span className="till">{code}</span>}
        </>
      )}
      {props.children}
      <div className="grow" />
      <Conn onAttention={props.onAttention} />
      <Clock />
      {props.right}
    </header>
  );
}

/** Shop-local HH:MM in the top bar (06 A3). */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="clock" aria-label="Shop time">
      {time(now.toISOString())}
    </span>
  );
}
