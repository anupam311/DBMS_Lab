import { useEffect, useState } from 'react';
import { api, money, when, day } from '../api.js';
import Table from '../components/Table.jsx';

const REPORTS = [
  { id: 'top', label: 'Top products', url: '/reports/top-products',
    note: 'Window function: RANK() OVER (PARTITION BY category), joined across product, category and sales.',
    cols: [{ h: 'Category', k: 'cat_name' }, { h: 'Product', k: 'prod_name' }, { h: 'Units', num: 1, k: 'units' },
      { h: 'Revenue', num: 1, f: r => money(r.revenue) }, { h: 'Rank', num: 1, k: 'rank_in_category' }] },
  { id: 'tree', label: 'Category tree', url: '/reports/category-tree',
    note: 'Recursive CTE that walks the parent column of the category table.',
    cols: [{ h: 'Category', f: r => <span style={{ paddingLeft: r.depth * 22 }}>{r.cat_name}</span> }, { h: 'Depth', num: 1, k: 'depth' }, { h: 'Path', k: 'path' }] },
  { id: 'insights', label: 'Customer insights', url: '/reports/insights',
    note: 'A NOT EXISTS subquery and an above-average subquery, combined with UNION.',
    cols: [{ h: 'Segment', k: 'segment' }, { h: 'Customer', k: 'customer' }, { h: 'City', k: 'city' },
      { h: 'Orders', num: 1, k: 'order_count' }, { h: 'Spent', num: 1, f: r => money(r.spent) }] },
  { id: 'rollup', label: 'Revenue rollup', url: '/reports/rollup',
    note: 'GROUP BY ROLLUP gives subtotals per category and a grand total.',
    cols: [{ h: 'Category', k: 'category' }, { h: 'Product', k: 'product' }, { h: 'Units', num: 1, k: 'units' }, { h: 'Revenue', num: 1, f: r => money(r.revenue) }] },
  { id: 'daily', label: 'Daily sales', url: '/reports/daily', refresh: true,
    note: 'Read from a materialized view. It holds stored results until a procedure refreshes it.',
    cols: [{ h: 'Day', f: r => day(r.day) }, { h: 'Orders', num: 1, k: 'orders_count' }, { h: 'Revenue', num: 1, f: r => money(r.revenue) }] },
  { id: 'index', label: 'Index check', url: '/reports/explain',
    note: "EXPLAIN of one customer's orders. Sequential scans are switched off for the check so the index shows up.",
    cols: [{ h: 'Query plan', f: r => <code>{r.line}</code> }] },
  { id: 'audit', label: 'Audit log', url: '/reports/audit',
    note: 'Rows written by triggers and procedures: price changes, low stock, cancellations, logins.',
    cols: [{ h: '#', k: 'log_id' }, { h: 'Event', f: r => <span className="pill">{r.event}</span> }, { h: 'Detail', k: 'detail' }, { h: 'When', f: r => when(r.logged_at) }] }
];

export default function Reports({ call, say }) {
  const [active, setActive] = useState('top');
  const [rows, setRows] = useState(null);
  const rep = REPORTS.find(r => r.id === active);

  useEffect(() => { setRows(null); call(rep.url).then(r => setRows(r.data || [])); }, [active]);

  const refresh = async () => {
    const r = await call('/reports/refresh', { method: 'POST' });
    if (r.ok) { say(r.message); setRows((await api(rep.url)).data); } else say(r.error, true);
  };

  return (
    <>
      <div className="subtabs">
        {REPORTS.map(r => <button key={r.id} className={active === r.id ? 'on' : ''} onClick={() => setActive(r.id)}>{r.label}</button>)}
      </div>
      <p className="note">{rep.note}</p>
      {rep.refresh && <div className="bar"><button className="btn" onClick={refresh}>Refresh now</button></div>}
      <Table rows={rows} cols={rep.cols} />
    </>
  );
}
