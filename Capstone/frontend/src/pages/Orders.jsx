import { useEffect, useState } from 'react';
import { api, money, when } from '../api.js';
import Table from '../components/Table.jsx';

const STATUSES = ['PLACED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

export default function Orders({ call, say, user }) {
  const [orders, setOrders] = useState(null);
  const staff = user.role !== 'customer';

  useEffect(() => { call('/orders').then(r => setOrders(r.data || [])); }, []);
  const reload = async () => setOrders((await api('/orders')).data || []);

  const setStatus = async (id, status) => {
    const r = await call('/orders/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
    if (r.ok) say(r.message); else say(r.error, true);
    reload();
  };

  const cancel = async id => {
    if (!confirm('Cancel order #' + id + ' and put its items back in stock?')) return;
    const r = await call('/orders/' + id, { method: 'DELETE' });
    if (r.ok) say(r.message); else say(r.error, true);
    reload();
  };

  return (
    <>
      <p className="note">{staff ? 'You see every order.' : 'You only see your own orders. PostgreSQL row level security filters the rest out.'}</p>
      <Table rows={orders} cols={[
        { h: 'Order', k: 'order_id' }, { h: 'Customer', k: 'customer' }, { h: 'Items', num: 1, k: 'items' },
        { h: 'Date', f: r => when(r.order_date) }, { h: 'Total', num: 1, f: r => money(r.total) },
        { h: 'Status', f: r => staff ? (
          <select value={r.status} aria-label={'Status of order ' + r.order_id} onChange={e => setStatus(r.order_id, e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : <span className={'pill ' + r.status.toLowerCase()}>{r.status}</span> },
        { h: 'Cancel', f: r => ['PLACED', 'SHIPPED'].includes(r.status)
          ? <button className="btn ghost danger" onClick={() => cancel(r.order_id)}>Cancel</button> : null }
      ]} />
    </>
  );
}
