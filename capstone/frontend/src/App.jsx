import { useEffect, useState } from 'react';
import { api, setToken } from './api.js';
import Inspector from './components/Inspector.jsx';
import CrudPage from './components/CrudPage.jsx';
import Login from './components/Login.jsx';
import Shop from './pages/Shop.jsx';
import Orders from './pages/Orders.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import Products from './pages/Products.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Lab from './pages/Lab.jsx';
import Profile from './pages/Profile.jsx';
import Security from './pages/Security.jsx';

const Categories = p => <CrudPage {...p} endpoint="/categories" pk="cat_id" noun="category"
  note="Saving a name that already exists updates it instead of failing (INSERT ... ON CONFLICT). A category that still has products or sub-categories cannot be deleted: the foreign key refuses it."
  fields={[
    { name: 'cat_name', label: 'Name' },
    { name: 'parent_cat_id', label: 'Parent category (optional)', optionsFrom: '/categories', optionValue: 'cat_id', optionLabel: 'cat_name' }
  ]}
  columns={[{ h: 'ID', k: 'cat_id' }, { h: 'Name', k: 'cat_name' }, { h: 'Parent', f: r => r.parent_name || '—' }]} />;

const ALL = ['customer', 'manager', 'admin'];
const STAFF = ['manager', 'admin'];
const PAGES = [
  ['shop', 'Shop', ALL, Shop],
  ['orders', 'Orders', ALL, Orders],
  ['profile', 'My profile', ALL, Profile],
  ['products', 'Products', STAFF, Products],
  ['categories', 'Categories', STAFF, Categories],
  ['dashboard', 'Dashboard', STAFF, Dashboard],
  ['reports', 'Reports', STAFF, Reports],
  ['lab', 'SQL lab', STAFF, Lab],
  ['users', 'Users', ['admin'], Users],
  ['security', 'Security lab', ALL, Security]
];

const stored = () => { try { return JSON.parse(localStorage.getItem('shop_session')); } catch { return null; } };

export default function App() {
  const [session, setSession] = useState(stored);
  const [tab, setTab] = useState('shop');
  const [log, setLog] = useState([]);
  const [msg, setMsg] = useState({ text: '', err: false });

  setToken(session && session.token);

  const leave = () => {
    try { localStorage.removeItem('shop_session'); } catch {}
    setSession(null); setLog([]); setMsg({ text: '', err: false }); setTab('shop');
  };

  useEffect(() => {
    window.addEventListener('session-expired', leave);
    return () => window.removeEventListener('session-expired', leave);
  }, []);

  const say = (text, err = false) => setMsg({ text, err });

  const call = async (url, opts) => {
    try {
      const body = await api(url, opts);
      if (body.log && body.log.length) setLog(body.log);
      return body;
    } catch {
      say('Could not reach the server. Check that the backend is running.', true);
      return { ok: false, data: [] };
    }
  };

  const onLogin = (data, firstLog) => {
    try { localStorage.setItem('shop_session', JSON.stringify(data)); } catch {}
    setToken(data.token);
    setSession(data);
    if (firstLog && firstLog.length) setLog(firstLog);
  };

  const logout = async () => { await call('/auth/logout', { method: 'POST' }); leave(); };

  if (!session) return <Login onLogin={onLogin} />;

  const pages = PAGES.filter(p => p[2].includes(session.role));
  const View = (pages.find(p => p[0] === tab) || pages[0])[3];

  return (
    <>
      <header className="top">
        <h1 className="brand">Stockline Shop</h1>
        <div className="who">
          <span>{session.name}</span>
          <span className={'chip ' + session.role}>{session.role}</span>
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      <div className={'layout' + (log.length ? '' : ' solo')}>
        <main>
          <nav role="tablist">
            {pages.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); say(''); }}>{label}</button>
            ))}
          </nav>
          <div className="card"><View key={tab} call={call} say={say} user={session} /></div>
          <p className={'msg' + (msg.err ? ' err' : '')} role="status">{msg.text}</p>
        </main>
        {log.length > 0 && <Inspector log={log} />}
      </div>
    </>
  );
}
