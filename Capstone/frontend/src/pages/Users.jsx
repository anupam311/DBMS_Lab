import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Table from '../components/Table.jsx';

export default function Users({ call, say, user }) {
  const [rows, setRows] = useState(null);

  useEffect(() => { call('/users').then(r => setRows(r.data || [])); }, []);
  const reload = async () => setRows((await api('/users')).data || []);

  const setRole = async (id, role) => {
    const r = await call('/users/' + id + '/role', { method: 'PUT', body: JSON.stringify({ role }) });
    if (r.ok) say(r.message); else say(r.error, true);
    reload();
  };

  const remove = async id => {
    if (!confirm('Delete this user?')) return;
    const r = await call('/users/' + id, { method: 'DELETE' });
    if (r.ok) say(r.message); else say(r.error, true);
    reload();
  };

  return (
    <>
      <p className="note">Only admins can open this page. Changing a role takes effect on the next request. Users with orders cannot be deleted.</p>
      <Table rows={rows} cols={[
        { h: 'ID', k: 'user_id' }, { h: 'Name', k: 'name' }, { h: 'Email', k: 'email' }, { h: 'City', k: 'city' },
        { h: 'Role', f: r => (
          <select value={r.role} disabled={r.user_id === user.user_id} aria-label={'Role of ' + r.name} onChange={e => setRole(r.user_id, e.target.value)}>
            {['admin', 'manager', 'customer'].map(x => <option key={x}>{x}</option>)}
          </select>
        ) },
        { h: 'Delete', f: r => r.user_id === user.user_id ? null : <button className="btn ghost danger" onClick={() => remove(r.user_id)}>Delete</button> }
      ]} />
    </>
  );
}
