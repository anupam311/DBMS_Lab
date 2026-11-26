import { useEffect, useRef, useState } from 'react';
import { api, money } from '../api.js';
import { usePagedSearch, Pager } from '../components/paging.jsx';
import ProductFilters, { PRODUCT_DEFAULTS } from '../components/ProductFilters.jsx';

export default function Shop({ call, say }) {
  const s = usePagedSearch(call, '/catalog/search', PRODUCT_DEFAULTS, 9);
  const [cats, setCats] = useState([]);
  const [qty, setQty] = useState({});
  const prices = useRef({});

  useEffect(() => { api('/categories').then(r => setCats(r.data || [])); }, []);
  (s.data.rows || []).forEach(p => { prices.current[p.prod_id] = Number(p.price); });

  const picked = Object.entries(qty).map(([prod_id, q]) => ({ prod_id, qty: Number(q) })).filter(i => i.qty > 0);
  const total = picked.reduce((t, i) => t + i.qty * (prices.current[i.prod_id] || 0), 0);

  const place = async () => {
    const r = await call('/orders', { method: 'POST', body: JSON.stringify({ items: picked }) });
    if (r.ok) { say(r.message); setQty({}); s.reload(); } else say(r.error, true);
  };

  return (
    <>
      <ProductFilters f={s.f} change={s.change} cats={cats} />
      <div className="bar cart">
        <span>{picked.length ? picked.length + ' item(s), ' + money(total) : 'Choose how many of each you want'}</span>
        <button className="btn" onClick={place} disabled={!picked.length}>Place order</button>
      </div>
      {s.data.rows && s.data.rows.length === 0 && <p className="note">No products match your filters.</p>}
      <div className="grid">
        {(s.data.rows || []).map(p => (
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
      <Pager page={s.page} pages={s.pages} total={s.data.total} onPage={s.goTo} noun="products" />
    </>
  );
}
