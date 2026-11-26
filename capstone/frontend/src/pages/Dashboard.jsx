import { useEffect, useState } from 'react';
import { money } from '../api.js';
import Table from '../components/Table.jsx';

const KPIS = [
  ['Revenue', r => money(r.revenue), 'SUM'], ['Orders', r => r.total_orders, 'COUNT'],
  ['Average order', r => money(r.avg_order), 'AVG'], ['Smallest order', r => money(r.min_order), 'MIN'],
  ['Largest order', r => money(r.max_order), 'MAX'], ['Units sold', r => r.units_sold, 'SUM'],
  ['Customers', r => r.customers, 'COUNT'], ['Products', r => r.products, 'COUNT'], ['Low stock (under 5)', r => r.low_stock, 'COUNT WHERE']
];

function Bars({ rows, label, value, format }) {
  const max = Math.max(1, ...rows.map(r => Number(value(r))));
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div className="hrow" key={i}>
          <span className="hlabel">{label(r)}</span>
          <div className="htrack"><div className="hfill" style={{ width: (Number(value(r)) / max * 100) + '%' }} /></div>
          <b>{format(r)}</b>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ call }) {
  const [d, setD] = useState(null);
  const [minOrders, setMinOrders] = useState('1');
  const [cities, setCities] = useState(null);

  useEffect(() => {
    Promise.all([call('/dashboard/summary'), call('/dashboard/status'), call('/dashboard/monthly'), call('/dashboard/cities?min=1')])
      .then(([a, b, c, e]) => { setD({ sum: (a.data || [])[0], status: b.data || [], monthly: c.data || [] }); setCities(e.data || []); });
  }, []);

  if (!d || !d.sum) return <p className="note">Loading…</p>;
  return (
    <>
      <p className="note">Every figure is calculated by the database with aggregate functions. The small label on each card names the function used.</p>
      <div className="kpis">
        {KPIS.map(([label, fmt, fn]) => (
          <div className="kpi" key={label}><span>{label}</span><b>{fmt(d.sum)}</b><small>{fn}</small></div>
        ))}
      </div>
      <h3>Orders by status <small className="tag2">GROUP BY</small></h3>
      <Bars rows={d.status} label={r => r.status} value={r => r.order_count} format={r => r.order_count + ' orders, ' + money(r.amount)} />
      <h3>Revenue by month <small className="tag2">date_trunc + GROUP BY</small></h3>
      <Bars rows={d.monthly} label={r => r.month} value={r => r.revenue} format={r => money(r.revenue)} />
      <h3>Revenue by city <small className="tag2">GROUP BY + HAVING</small></h3>
      <div className="bar">
        Only cities with at least
        <input type="number" min="1" value={minOrders} onChange={e => setMinOrders(e.target.value)} aria-label="Minimum orders" />
        orders
        <button className="btn ghost" onClick={async () => setCities((await call('/dashboard/cities?min=' + (minOrders || 1))).data || [])}>Apply</button>
      </div>
      <Table rows={cities} cols={[
        { h: 'City', k: 'city' }, { h: 'Customers', num: 1, k: 'customers' },
        { h: 'Orders', num: 1, k: 'order_count' }, { h: 'Revenue', num: 1, f: r => money(r.revenue) }
      ]} />
    </>
  );
}
