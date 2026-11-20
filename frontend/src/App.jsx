import { useEffect, useState } from 'react';
import { api, setToken } from './api.js';
import Inspector from './components/Inspector.jsx';
import CrudPage from './components/CrudPage.jsx';
import Login from './components/Login.jsx';
import Shop from './pages/Shop.jsx';
import Orders from './pages/Orders.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import Security from './pages/Security.jsx';

const Products = p => <CrudPage {...p} endpoint="/products" pk="prod_id" noun="product"
  note="Every save calls a stored procedure. Try a price of 0 or a negative stock: the database refuses it. Change a price and open Reports > Audit log to see the trigger's entry."
  fields={[
    { name: 'prod_name', label: 'Name' },
    { name: 'cat_id', label: 'Category', optionsFrom: '/categories', optionValue: 'cat_id', optionLabel: 'cat_name' },
    { name: 'price', label: 'Price', type: 'number' },
    { name: 'stock', label: 'Stock', type: 'number' }
  ]}
  columns={[{ h: 'ID', k: 'prod_id' }, { h: 'Name', k: 'prod_name' }, { h: 'Category', k: 'cat_name' },
    { h: 'Price', num: 1, f: r => '₹' + Number(r.price).toLocaleString('en-IN') }, { h: 'Stock', num: 1, k: 'stock' }]} />;

const ALL = ['customer', 'manager', 'admin'];
const PAGES = [
  ['shop', 'Shop', ALL, Shop],
  ['orders', 'Orders', ALL, Orders],
  ['products', 'Products', ['manager', 'admin'], Products],
  ['reports', 'Reports', ['manager', 'admin'], Reports],
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
        <h1 className="brand">Stockline</h1>
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
