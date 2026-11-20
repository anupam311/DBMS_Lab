import { useEffect, useState } from 'react';
import { api, money } from '../api.js';

export default function Shop({ call, say }) {
  const [items, setItems] = useState(null);
  const [qty, setQty] = useState({});

  useEffect(() => { call('/catalog').then(r => setItems(r.data || [])); }, []);

  const picked = Object.entries(qty).map(([prod_id, q]) => ({ prod_id, qty: Number(q) })).filter(i => i.qty > 0);
  const total = picked.reduce((s, i) => s + i.qty * ((items.find(p => String(p.prod_id) === i.prod_id) || {}).price || 0), 0);

  const place = async () => {
    const r = await call('/orders', { method: 'POST', body: JSON.stringify({ items: picked }) });
    if (r.ok) { say(r.message); setQty({}); setItems((await api('/catalog')).data); } else say(r.error, true);
  };

  if (!items) return <p className="note">Loading…</p>;
  return (
    <>
      <div className="bar cart">
        <span>{picked.length ? picked.length + ' item(s), ' + money(total) : 'Choose how many of each you want'}</span>
        <button className="btn" onClick={place} disabled={!picked.length}>Place order</button>
      </div>
      <div className="grid">
        {items.map(p => (
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
    </>
  );
}
