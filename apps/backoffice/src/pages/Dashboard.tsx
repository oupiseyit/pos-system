// B2 Dashboard — mockups/v2/b2-dashboard.html
import { useState } from 'react';
import { qs } from '../api';
import { addDays, cents, isoDay, methodLabel, money, moneyCents } from '../format';
import { Empty, Loading, Seg, useLoad, useSession } from '../ui';

interface DailyRow {
  date: string;
  salesCount: number;
  total: string;
}
interface ProductRow {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  total: string;
}
interface PaymentRow {
  method: string;
  amount: string;
}

const BAR_COLOR: Record<string, string> = { CASH: 'var(--primary)', CARD: 'var(--info)', OTHER: 'var(--text-3)' };

export function Dashboard() {
  const { me, lowStock } = useSession();
  const [days, setDays] = useState<'7' | '30'>('7');
  const today = isoDay();
  const n = Number(days);
  // Fetch at least 8 days so "same day last week" is always in range
  const from = addDays(today, -Math.max(n - 1, 7));
  const daily = useLoad<{ data: DailyRow[] }>(`/reports/daily${qs({ from, to: today })}`);
  const day = qs({ from: today, to: today });
  const products = useLoad<{ data: ProductRow[] }>(`/reports/products${day}`);
  const payments = useLoad<{ data: PaymentRow[] }>(`/reports/payments${day}`);

  const byDate = new Map((daily.data?.data ?? []).map((r) => [r.date, r]));
  const series = Array.from({ length: n }, (_, i) => {
    const d = addDays(today, i - n + 1);
    return { date: d, cents: cents(byDate.get(d)?.total) };
  });
  const t = byDate.get(today);
  const lw = byDate.get(addDays(today, -7));
  const todayCents = cents(t?.total);
  const lwCents = cents(lw?.total);
  const count = t?.salesCount ?? 0;
  const weekday = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

  const hour = Number(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false }));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const [whole, dec] = moneyCents(todayCents).split('.');
  const payRows = payments.data?.data ?? [];
  const payTotal = payRows.reduce((s, r) => s + cents(r.amount), 0);

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>
            {greet}, {me.name.split(' ')[0]}
          </h1>
          <p>Here’s how the shop is doing today.</p>
        </div>
        <a className="btn" href="#/reports">
          <span className="ico s i-chart" />
          Open reports
        </a>
      </div>

      <div className="g3" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <div className="lbl">
            <span className="ico s i-receipt" />
            Net sales today
          </div>
          <div className="val">
            {whole}
            <small>.{dec}</small>
          </div>
          {lwCents > 0 && <Delta pct={((todayCents - lwCents) / lwCents) * 100} />}{' '}
          <span className="t3 sm">vs last {weekday}</span>
        </div>
        <div className="card kpi">
          <div className="lbl">
            <span className="ico s i-users" />
            Number of sales
          </div>
          <div className="val">{count}</div>
          {lw && (
            <span className={`delta ${count >= lw.salesCount ? 'up' : 'down'}`}>
              {count >= lw.salesCount ? '↑' : '↓'} {Math.abs(count - lw.salesCount)}
            </span>
          )}{' '}
          <span className="t3 sm">avg basket {count ? moneyCents(Math.round(todayCents / count)) : '0.00'}</span>
        </div>
        <a className="card kpi" href="#/reports/low-stock" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className="lbl">
            <span className="ico s i-alert" style={{ color: 'var(--warn)' }} />
            Low stock
          </div>
          <div className="val" style={{ color: lowStock ? 'var(--warn)' : undefined }}>
            {lowStock}
          </div>
          <span className="sm" style={{ color: 'var(--primary)', fontWeight: 550 }}>
            View low-stock report →
          </span>
        </a>
      </div>

      <div className="dash-2">
        <section className="card">
          <div className="card-h">
            <h2>Net sales · last {n} days</h2>
            <Seg
              label="Range"
              value={days}
              options={[
                ['7', '7d'],
                ['30', '30d'],
              ]}
              onChange={setDays}
            />
          </div>
          <div className="card-b" style={{ paddingTop: 8 }}>
            {daily.loading && !daily.data ? <Loading /> : <Chart series={series} />}
          </div>
        </section>
        <section className="card">
          <div className="card-h">
            <h2>Payment methods today</h2>
          </div>
          <div className="card-b">
            {payments.loading ? (
              <Loading rows={3} />
            ) : !payRows.length ? (
              <Empty msg="No payments yet today" />
            ) : (
              <>
                {payRows.map((r) => (
                  <div className="bar-row" key={r.method}>
                    <span>{methodLabel(r.method)}</span>
                    <span className="bar-track">
                      <i
                        style={
                          {
                            width: `${(cents(r.amount) / payTotal) * 100}%`,
                            '--c': BAR_COLOR[r.method],
                          } as React.CSSProperties
                        }
                      />
                    </span>
                    <span className="num r">{money(r.amount)}</span>
                  </div>
                ))}
                <div
                  className="between"
                  style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 12 }}
                >
                  <span className="t2">Total</span>
                  <span className="num" style={{ fontWeight: 650 }}>
                    {moneyCents(payTotal)}
                  </span>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h2>Top products today</h2>
          <a href="#/reports/products" className="sm">
            See all
          </a>
        </div>
        {products.loading ? (
          <Loading rows={5} />
        ) : !products.data?.data.length ? (
          <Empty msg="No sales yet today" />
        ) : (
          <table className="tbl static">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Product</th>
                <th>SKU</th>
                <th className="r">Qty</th>
                <th className="r">Net sales</th>
              </tr>
            </thead>
            <tbody>
              {products.data.data.slice(0, 5).map((p, i) => (
                <tr key={p.productId}>
                  <td className="t3 num">{i + 1}</td>
                  <td className="cell-main">{p.name}</td>
                  <td className="t2 num">{p.sku}</td>
                  <td className="r num">{p.qty}</td>
                  <td className="r num">{money(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const Delta = ({ pct }: { pct: number }) => (
  <span className={`delta ${pct >= 0 ? 'up' : 'down'}`}>
    {pct >= 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
  </span>
);

/** Area chart, same geometry as the mockup's SVG (600×220, baseline at y=190). */
function Chart({ series }: { series: { date: string; cents: number }[] }) {
  const max = Math.max(...series.map((s) => s.cents), 1);
  const step = 558 / Math.max(series.length - 1, 1);
  const pts = series.map((s, i) => [20 + i * step, 190 - (s.cents / max) * 150] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const every = Math.ceil(series.length / 7);
  const label = (d: string, i: number) =>
    i === series.length - 1
      ? 'Today'
      : series.length <= 7
        ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
        : `${d.slice(8)}/${d.slice(5, 7)}`;
  const desc = `Net sales over ${series.length} days, from ${moneyCents(series[0].cents)} to ${moneyCents(series[series.length - 1].cents)}`;
  return (
    <svg className="area" viewBox="0 0 600 220" preserveAspectRatio="none" role="img" aria-label={desc}>
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0e6b4e" stopOpacity=".22" />
          <stop offset="1" stopColor="#0e6b4e" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 100, 160].map((y) => (
        <line key={y} className="grid" x1="0" x2="600" y1={y} y2={y} />
      ))}
      <path fill="url(#g)" d={`${line} L${last[0]} 190 L20 190Z`} />
      <path className="line" d={line} />
      <circle cx={last[0]} cy={last[1]} r="5" fill="#fff" stroke="#0e6b4e" strokeWidth="2.5" />
      <text x={Math.min(last[0] - 38, 540)} y={Math.max(last[1] - 14, 12)}>
        {moneyCents(series[series.length - 1].cents)}
      </text>
      {series.map((s, i) =>
        i % every === 0 || i === series.length - 1 ? (
          <text
            key={s.date}
            x={Math.min(Math.max(pts[i][0] - 12, 0), 560)}
            y="212"
            style={i === series.length - 1 ? { fill: '#0e6b4e' } : undefined}
          >
            {label(s.date, i)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
