import { categoryOptions } from './paging.jsx';

export const PRODUCT_DEFAULTS = { text: '', cat: '', min: '', max: '', in_stock: '', sort: 'name', dir: 'asc' };

export default function ProductFilters({ f, change, cats }) {
  return (
    <div className="filters">
      <input type="search" placeholder="Search by name" value={f.text} aria-label="Search products"
        onChange={e => change({ text: e.target.value })} />
      <select value={f.cat} aria-label="Category" onChange={e => change({ cat: e.target.value })}>
        <option value="">All categories</option>
        {categoryOptions(cats).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <input type="number" min="0" placeholder="Min price" value={f.min} aria-label="Minimum price"
        onChange={e => change({ min: e.target.value })} />
      <input type="number" min="0" placeholder="Max price" value={f.max} aria-label="Maximum price"
        onChange={e => change({ max: e.target.value })} />
      <label className="check">
        <input type="checkbox" checked={f.in_stock === '1'} onChange={e => change({ in_stock: e.target.checked ? '1' : '' })} /> In stock only
      </label>
      <select value={f.sort} aria-label="Sort by" onChange={e => change({ sort: e.target.value })}>
        <option value="name">Sort: Name</option>
        <option value="price">Sort: Price</option>
        <option value="stock">Sort: Stock</option>
        <option value="category">Sort: Category</option>
        <option value="id">Sort: ID</option>
      </select>
      <button type="button" className="btn ghost" onClick={() => change({ dir: f.dir === 'asc' ? 'desc' : 'asc' })}>
        {f.dir === 'asc' ? 'Ascending ▲' : 'Descending ▼'}
      </button>
      <button type="button" className="btn ghost" onClick={() => change(PRODUCT_DEFAULTS)}>Clear</button>
    </div>
  );
}
