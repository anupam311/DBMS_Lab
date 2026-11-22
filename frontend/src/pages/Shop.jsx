import { useEffect, useState } from 'react';
import { api, money } from '../api.js';

const PAGE_SIZE = 9;
const byName = (a, b) => a.prod_name.localeCompare(b.prod_name, undefined, { sensitivity: 'base', numeric: true });

export default function Shop({ call, say }) {
  const [items, setItems] = useState(null);
  const [qty, setQty] = useState({});
  const [page, setPage] = useState(0);
  const [jump, setJump] = useState('1');

  useEffect(() => { call('/catalog').then(r => setItems(r.data || [])); }, []);

  const picked = Object.entries(qty).map(([prod_id, q]) => ({ prod_id, qty: Number(q) })).filter(i => i.qty > 0);
  const total = picked.reduce((s, i) => s + i.qty * ((items.find(p => String(p.prod_id) === i.prod_id) || {}).price || 0), 0);

  const place = async () => {
    const r = await call('/orders', { method: 'POST', body: JSON.stringify({ items: picked }) });
    if (r.ok) { say(r.message); setQty({}); setItems((await api('/catalog')).data); } else say(r.error, true);
  };

  if (!items) return <p className="note">Loading…</p>;

  const sorted = [...items].sort(byName);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const goTo = n => {
    const target = Math.min(Math.max(Math.round(Number(n)) || current + 1, 1), pages);
    setPage(target - 1);
    setJump(String(target));
  };

  return (
    <>
      <div className="bar cart">
        <span>{picked.length ? picked.length + ' item(s), ' + money(total) : 'Choose how many of each you want'}</span>
        <button className="btn" onClick={place} disabled={!picked.length}>Place order</button>
      </div>
      <div className="grid">
        {visible.map(p => (
          <div key={p.prod_id} className={'product hue' + (p.cat_id % 5)}>
            <span className="chip-cat">{p.cat_name}</span>
            <h3>{p.prod_name}</h3>
            <div className="price">{money(p.price)}</div>
            <div className={'stock' + (p.stock < 5 ? ' low' : '')}>{p.stock === 0 ? 'Sold out' : p.stock < 5 ? 'Only ' + p.stock + ' left' : p.stock + ' in stock'}</div>
            <input type="number" min="0" max={p.stock} value={qty[p.prod_id] || 0} aria-label={'Quantity of ' + p.prod_name}
              onChange={e => setQty({ ...qty, [p.prod_id]: e.target.value })} />
          </div>
        ))}
      </div>
      {pages > 1 && (
        <form className="pager" onSubmit={e => { e.preventDefault(); goTo(jump); }}>
          <button type="button" className="btn ghost" onClick={() => goTo(current)} disabled={current === 0}>Previous</button>
          <label>Page
            <input type="number" min="1" max={pages} value={jump} aria-label="Go to page"
              onChange={e => setJump(e.target.value)} onBlur={() => goTo(jump)} />
            of {pages}
          </label>
          <button type="submit" className="btn ghost">Go</button>
          <button type="button" className="btn ghost" onClick={() => goTo(current + 2)} disabled={current >= pages - 1}>Next</button>
        </form>
      )}
    </>
  );
}