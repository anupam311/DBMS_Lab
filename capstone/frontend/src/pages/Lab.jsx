import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Table from '../components/Table.jsx';

const EXAMPLES = [
  ['Selecting rows', [
    ['WHERE, ORDER BY, LIMIT', "SELECT prod_name, price, stock\nFROM product\nWHERE price > 500\nORDER BY price DESC\nLIMIT 10"],
    ['DISTINCT and IS NOT NULL', "SELECT DISTINCT city\nFROM app_user\nWHERE city IS NOT NULL\nORDER BY city\nLIMIT 20"],
    ['LIKE, BETWEEN, IN', "SELECT prod_name, price, stock\nFROM product\nWHERE prod_name ILIKE 'a%'\n   OR price BETWEEN 100 AND 300\n   OR stock IN (0, 1, 2)\nORDER BY prod_name\nLIMIT 15"],
    ['CASE expression', "SELECT prod_name, stock,\n  CASE WHEN stock = 0 THEN 'sold out'\n       WHEN stock < 5 THEN 'low'\n       ELSE 'ok' END AS level\nFROM product\nORDER BY stock\nLIMIT 15"],
    ['String and date functions', "SELECT order_id, to_char(order_date, 'DD Mon YYYY') AS day,\n       EXTRACT(dow FROM order_date) AS weekday, lower(status) AS status\nFROM orders\nORDER BY order_date DESC\nLIMIT 10"]
  ]],
  ['Aggregates', [
    ['COUNT, SUM, AVG, MIN, MAX', "SELECT COUNT(*) AS orders, SUM(total) AS revenue,\n       ROUND(AVG(total), 2) AS average, MIN(total) AS smallest, MAX(total) AS largest\nFROM orders\nWHERE status <> 'CANCELLED'"],
    ['GROUP BY and HAVING', "SELECT status, COUNT(*) AS orders, SUM(total) AS amount\nFROM orders\nGROUP BY status\nHAVING COUNT(*) > 0\nORDER BY amount DESC"]
  ]],
  ['Joins', [
    ['INNER JOIN', "SELECT o.order_id, u.name, o.total\nFROM orders o\nJOIN app_user u ON u.user_id = o.user_id\nORDER BY o.total DESC\nLIMIT 10"],
    ['Three-table join', "SELECT o.order_id, p.prod_name, oi.qty, oi.unit_price\nFROM orders o\nJOIN order_item oi ON oi.order_id = o.order_id\nJOIN product p ON p.prod_id = oi.prod_id\nORDER BY o.order_id DESC\nLIMIT 15"],
    ['LEFT JOIN (never sold)', "SELECT p.prod_name\nFROM product p\nLEFT JOIN order_item oi ON oi.prod_id = p.prod_id\nWHERE oi.prod_id IS NULL\nLIMIT 15"],
    ['Self join', "SELECT c.cat_name AS category, par.cat_name AS parent\nFROM category c\nLEFT JOIN category par ON par.cat_id = c.parent_cat_id\nORDER BY 2, 1\nLIMIT 20"]
  ]],
  ['Subqueries and sets', [
    ['Scalar subquery', "SELECT prod_name, price\nFROM product\nWHERE price > (SELECT AVG(price) FROM product)\nORDER BY price DESC\nLIMIT 10"],
    ['EXISTS', "SELECT u.name\nFROM app_user u\nWHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.user_id AND o.total > 1000)\nLIMIT 10"],
    ['EXCEPT', "SELECT user_id FROM orders WHERE status = 'DELIVERED'\nEXCEPT\nSELECT user_id FROM orders WHERE status = 'CANCELLED'"]
  ]],
  ['Advanced', [
    ['Window function', "SELECT prod_name, cat_id, price,\n       RANK() OVER (PARTITION BY cat_id ORDER BY price DESC) AS rank_in_category\nFROM product\nORDER BY cat_id, rank_in_category\nLIMIT 20"],
    ['Recursive CTE', "WITH RECURSIVE t AS (\n  SELECT cat_id, cat_name, 0 AS depth FROM category WHERE parent_cat_id IS NULL\n  UNION ALL\n  SELECT c.cat_id, c.cat_name, t.depth + 1 FROM category c JOIN t ON c.parent_cat_id = t.cat_id\n)\nSELECT * FROM t ORDER BY depth, cat_name"],
    ['Privileges (this is denied)', "SELECT password_hash FROM app_user"]
  ]]
];

const cell = v => v === null ? <i>NULL</i> : typeof v === 'object' ? JSON.stringify(v) : String(v);

function SqlConsole({ call }) {
  const [sql, setSql] = useState(EXAMPLES[0][1][0][1]);
  const [out, setOut] = useState(null);

  const run = async () => {
    const started = performance.now();
    const r = await call('/lab/sql', { method: 'POST', body: JSON.stringify({ sql }) });
    setOut(r.ok ? { rows: r.data[0].result, ms: performance.now() - started } : { error: r.error });
  };

  return (
    <>
      <p className="note">Write any SELECT query. It runs under your own database role, in a read-only transaction with a 3 second limit and at most 200 rows. Tables you can read: product, category, orders, order_item, and app_user (only user_id, name and city).</p>
      <textarea className="sql" rows={7} value={sql} spellCheck={false} aria-label="SQL query"
        onChange={e => setSql(e.target.value)} onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') run(); }} />
      <div className="bar"><button className="btn" onClick={run}>Run query</button><small className="hint">or press Ctrl + Enter</small></div>
      {out && out.error && <div className="result no">{out.error}</div>}
      {out && out.rows && (
        <>
          <p className="note">{out.rows.length} row(s) returned in {out.ms.toFixed(0)} ms.</p>
          {out.rows.length > 0 && (
            <Table rows={out.rows} cols={Object.keys(out.rows[0]).map(k => ({ h: k, f: r => cell(r[k]) }))} />
          )}
        </>
      )}
      <h3>Examples</h3>
      {EXAMPLES.map(([group, items]) => (
        <div className="exgroup" key={group}>
          <b>{group}</b>
          <div className="exlist">
            {items.map(([title, text]) => <button key={title} className="btn ghost" onClick={() => setSql(text)}>{title}</button>)}
          </div>
        </div>
      ))}
    </>
  );
}

function Schema({ call }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    Promise.all([call('/lab/schema/columns'), call('/lab/schema/constraints'), call('/lab/schema/indexes')])
      .then(([a, b, c]) => setD({ cols: a.data || [], cons: b.data || [], idx: c.data || [] }));
  }, []);
  if (!d) return <p className="note">Loading…</p>;
  return (
    <>
      <p className="note">Read live from the database catalog. This is the DDL side: tables, data types, keys, constraints and indexes.</p>
      <h3>Columns</h3>
      <Table rows={d.cols} cols={[{ h: 'Table', k: 'table_name' }, { h: 'Column', k: 'column_name' }, { h: 'Type', k: 'data_type' },
        { h: 'Nullable', k: 'nullable' }, { h: 'Default', f: r => <code>{r.column_default}</code> }]} />
      <h3>Constraints</h3>
      <Table rows={d.cons} cols={[{ h: 'Table', k: 'table_name' }, { h: 'Kind', k: 'kind' }, { h: 'Name', k: 'constraint_name' },
        { h: 'Definition', f: r => <code>{r.definition}</code> }]} />
      <h3>Indexes</h3>
      <Table rows={d.idx} cols={[{ h: 'Table', k: 'table_name' }, { h: 'Index', k: 'index_name' }, { h: 'Definition', f: r => <code>{r.definition}</code> }]} />
    </>
  );
}

function Transactions({ call }) {
  const [products, setProducts] = useState([]);
  const [prod, setProd] = useState('');
  const [delta, setDelta] = useState('-3');
  const [res, setRes] = useState(null);

  const load = async () => (await api('/catalog/search?size=100&sort=name')).data || [];
  useEffect(() => { load().then(p => { setProducts(p); if (p[0]) setProd(String(p[0].prod_id)); }); }, []);
  const stockOf = (list, id) => { const p = list.find(x => String(x.prod_id) === String(id)); return p ? p.stock : null; };

  const run = async mode => {
    const before = stockOf(products, prod);
    const body = JSON.stringify({ prod_id: prod, delta });
    const r = await call('/lab/txn/' + mode, { method: 'POST', body });
    const fresh = await load();
    setProducts(fresh);
    setRes({ mode, before, ok: r.ok, message: r.ok ? r.message : r.error, after: stockOf(fresh, prod),
      inside: mode !== 'savepoint' && r.ok ? r.data[0].p_stock_after : null, steps: mode === 'savepoint' && r.ok ? r.data : null });
  };

  return (
    <>
      <p className="note">Change a product's stock inside a transaction, then either COMMIT it (kept) or ROLLBACK (undone). The savepoint demo shows an inner failure being undone while the earlier work stays.</p>
      <div className="filters">
        <select value={prod} onChange={e => setProd(e.target.value)} aria-label="Product">
          {products.map(p => <option key={p.prod_id} value={p.prod_id}>{p.prod_name} (stock {p.stock})</option>)}
        </select>
        <label className="check">Change stock by <input type="number" value={delta} onChange={e => setDelta(e.target.value)} /></label>
        <button className="btn" onClick={() => run('commit')}>Change and COMMIT</button>
        <button className="btn ghost" onClick={() => run('rollback')}>Change and ROLLBACK</button>
        <button className="btn ghost" onClick={() => run('savepoint')}>Savepoint demo</button>
      </div>
      {res && (
        <div className={'result ' + (res.ok ? 'ok' : 'no')}>
          {res.message}
          {res.mode !== 'savepoint' && res.ok && <div>Stock before: {res.before}. Inside the transaction: {res.inside}. After it finished: {res.after}.</div>}
          {res.mode === 'savepoint' && res.ok && <div>Stock before: {res.before}. After the demo finished: {res.after}.</div>}
        </div>
      )}
      {res && res.steps && <Table rows={res.steps} cols={[{ h: 'Step', k: 'step' }, { h: 'Stock', num: 1, k: 'stock_value' }]} />}
    </>
  );
}

export default function Lab({ call }) {
  const [tab, setTab] = useState('sql');
  const TABS = [['sql', 'SQL console'], ['schema', 'Schema explorer'], ['txn', 'Transactions']];
  return (
    <>
      <div className="subtabs">
        {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'sql' && <SqlConsole call={call} />}
      {tab === 'schema' && <Schema call={call} />}
      {tab === 'txn' && <Transactions call={call} />}
    </>
  );
}
