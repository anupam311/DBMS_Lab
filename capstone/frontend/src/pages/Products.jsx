import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Table from '../components/Table.jsx';
import { usePagedSearch, Pager, categoryOptions } from '../components/paging.jsx';
import ProductFilters, { PRODUCT_DEFAULTS } from '../components/ProductFilters.jsx';

export default function Products({ call, say }) {
  const s = usePagedSearch(call, '/catalog/search', PRODUCT_DEFAULTS, 10);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(null);
  const [bulk, setBulk] = useState({ cat_id: '', percent: '10', below: '5', add: '20' });

  useEffect(() => { api('/categories').then(r => setCats(r.data || [])); }, []);

  const done = r => { if (r.ok) { say(r.message); s.reload(); return true; } say(r.error, true); return false; };
  const post = (url, body, method = 'POST') => call(url, { method, body: body && JSON.stringify(body) });

  const save = async e => {
    e.preventDefault();
    const editing = form.prod_id !== undefined;
    if (done(await post('/products' + (editing ? '/' + form.prod_id : ''), form, editing ? 'PUT' : 'POST'))) setForm(null);
  };
  const remove = async p => { if (confirm('Delete ' + p.prod_name + '?')) done(await post('/products/' + p.prod_id, null, 'DELETE')); };
  const dropUnsold = async () => {
    if (confirm('Delete every product that has never been ordered? This cannot be undone.')) done(await post('/products/unsold', null, 'DELETE'));
  };

  return (
    <>
      <p className="note">Every action here calls a stored procedure. Click a column heading to sort, or use the filters.</p>
      <ProductFilters f={s.f} change={s.change} cats={cats} />
      {!form && <div className="bar"><button className="btn" onClick={() => setForm({})}>Add product</button></div>}
      {form && (
        <form className="form" onSubmit={save}>
          <label>Name<input value={form.prod_name ?? ''} onChange={e => setForm({ ...form, prod_name: e.target.value })} /></label>
          <label>Category
            <select value={form.cat_id ?? ''} onChange={e => setForm({ ...form, cat_id: e.target.value })}>
              <option value="">Choose…</option>
              {categoryOptions(cats).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label>Price<input type="number" step="any" value={form.price ?? ''} onChange={e => setForm({ ...form, price: e.target.value })} /></label>
          <label>Stock<input type="number" value={form.stock ?? ''} onChange={e => setForm({ ...form, stock: e.target.value })} /></label>
          <div className="bar">
            <button className="btn" type="submit">{form.prod_id !== undefined ? 'Save changes (UPDATE)' : 'Add product (INSERT)'}</button>
            <button className="btn ghost" type="button" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      <Table rows={s.data.rows} sort={{ key: s.f.sort, dir: s.f.dir }} onSort={s.sortBy} cols={[
        { h: 'ID', k: 'prod_id', sortKey: 'id' },
        { h: 'Name', k: 'prod_name', sortKey: 'name' },
        { h: 'Category', k: 'cat_name', sortKey: 'category' },
        { h: 'Price', num: 1, sortKey: 'price', f: r => '₹' + Number(r.price).toLocaleString('en-IN') },
        { h: 'Stock', num: 1, k: 'stock', sortKey: 'stock' },
        { h: 'Actions', f: r => (
          <>
            <button className="btn ghost" onClick={() => setForm({ ...r })}>Edit</button>{' '}
            <button className="btn ghost" onClick={async () => done(await post('/products/' + r.prod_id + '/clone', {}))}>Copy</button>{' '}
            <button className="btn ghost danger" onClick={() => remove(r)}>Delete</button>
          </>
        ) }
      ]} />
      <Pager page={s.page} pages={s.pages} total={s.data.total} onPage={s.goTo} noun="products" />

      <div className="bulk">
        <h3>Bulk operations</h3>
        <p className="note">Each button runs one set-based SQL statement that changes many rows at once. Watch the right panel to see the statement and the trigger messages.</p>
        <div className="bulkrow">
          <b>UPDATE prices</b>
          <select value={bulk.cat_id} onChange={e => setBulk({ ...bulk, cat_id: e.target.value })} aria-label="Category for price change">
            <option value="">All categories</option>
            {categoryOptions(cats).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <input type="number" value={bulk.percent} onChange={e => setBulk({ ...bulk, percent: e.target.value })} aria-label="Percent change" /> %
          <button className="btn ghost" onClick={async () => done(await post('/products/bulk-price', { cat_id: bulk.cat_id, percent: bulk.percent }))}>Apply</button>
        </div>
        <div className="bulkrow">
          <b>UPDATE stock</b> products with stock below
          <input type="number" value={bulk.below} onChange={e => setBulk({ ...bulk, below: e.target.value })} aria-label="Stock below" />
          add <input type="number" value={bulk.add} onChange={e => setBulk({ ...bulk, add: e.target.value })} aria-label="Units to add" />
          <button className="btn ghost" onClick={async () => done(await post('/products/restock', { below: bulk.below, add: bulk.add }))}>Restock</button>
        </div>
        <div className="bulkrow">
          <b>DELETE</b> products that were never ordered
          <button className="btn ghost danger" onClick={dropUnsold}>Delete unsold</button>
        </div>
      </div>
    </>
  );
}
