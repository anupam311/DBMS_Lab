import { useState } from 'react';
import { api, money, when } from '../api.js';
import Table from '../components/Table.jsx';
import { usePagedSearch, Pager } from '../components/paging.jsx';

const STATUSES = ['PLACED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const DEFAULTS = { status: '', from: '', to: '', text: '', sort: 'id', dir: 'desc' };

export default function Orders({ call, say, user }) {
  const s = usePagedSearch(call, '/orders/search', DEFAULTS, 10);
  const staff = user.role !== 'customer';

  const act = async (url, opts) => {
    const r = await call(url, opts);
    if (r.ok) say(r.message); else say(r.error, true);
    s.reload();
  };

  return (
    <>
      <p className="note">{staff ? 'You see every order.' : 'You only see your own orders. PostgreSQL row level security filters the rest out.'} Click a heading to sort.</p>
      <div className="filters">
        <input type="search" placeholder={staff ? 'Customer name or order number' : 'Order number'} value={s.f.text}
          aria-label="Search orders" onChange={e => s.change({ text: e.target.value })} />
        <select value={s.f.status} aria-label="Status" onChange={e => s.change({ status: e.target.value })}>
          <option value="">All statuses</option>
          {STATUSES.map(x => <option key={x}>{x}</option>)}
        </select>
        <label className="check">From <input type="date" value={s.f.from} onChange={e => s.change({ from: e.target.value })} /></label>
        <label className="check">To <input type="date" value={s.f.to} onChange={e => s.change({ to: e.target.value })} /></label>
        <button type="button" className="btn ghost" onClick={() => s.change(DEFAULTS)}>Clear</button>
      </div>
      <Table rows={s.data.rows} sort={{ key: s.f.sort, dir: s.f.dir }} onSort={s.sortBy} cols={[
        { h: 'Order', k: 'order_id', sortKey: 'id' },
        { h: 'Customer', k: 'customer', sortKey: 'customer' },
        { h: 'Items', num: 1, k: 'items', sortKey: 'items' },
        { h: 'Date', sortKey: 'date', f: r => when(r.order_date) },
        { h: 'Total', num: 1, sortKey: 'total', f: r => money(r.total) },
        { h: 'Status', sortKey: 'status', f: r => staff ? (
          <select value={r.status} aria-label={'Status of order ' + r.order_id}
            onChange={e => act('/orders/' + r.order_id + '/status', { method: 'PUT', body: JSON.stringify({ status: e.target.value }) })}>
            {STATUSES.map(x => <option key={x}>{x}</option>)}
          </select>
        ) : <span className={'pill ' + r.status.toLowerCase()}>{r.status}</span> },
        { h: 'Cancel', f: r => ['PLACED', 'SHIPPED'].includes(r.status)
          ? <button className="btn ghost danger" onClick={() => {
              if (confirm('Cancel order #' + r.order_id + ' and put its items back in stock?')) act('/orders/' + r.order_id, { method: 'DELETE' });
            }}>Cancel</button> : null }
      ]} />
      <Pager page={s.page} pages={s.pages} total={s.data.total} onPage={s.goTo} noun="orders" />
    </>
  );
}
