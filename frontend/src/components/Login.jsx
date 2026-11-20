import { useState } from 'react';
import { api } from '../api.js';

const DEMOS = [
  ['Admin', 'admin@shop.com', 'admin123'],
  ['Manager', 'manager@shop.com', 'manager123'],
  ['Customer', 'aman@mail.com', 'customer123']
];

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '', city: '' });
  const [msg, setMsg] = useState({ text: '', err: false });
  const set = k => e => setF({ ...f, [k]: e.target.value });

  const submit = async e => {
    e.preventDefault();
    try {
      if (mode === 'login') {
        const r = await api('/auth/login', { method: 'POST', body: JSON.stringify(f) });
        if (r.ok) onLogin(r.data[0], r.log); else setMsg({ text: r.error, err: true });
      } else {
        const r = await api('/auth/register', { method: 'POST', body: JSON.stringify(f) });
        if (r.ok) { setMode('login'); setMsg({ text: r.message, err: false }); } else setMsg({ text: r.error, err: true });
      }
    } catch {
      setMsg({ text: 'Cannot reach the server. Is the backend running?', err: true });
    }
  };

  return (
    <div className="login">
      <h1 className="brand">Blue Harbor Shop</h1>
      <p className="tag">Orders, stock and reports, powered by PostgreSQL</p>
      <form className="card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        {mode === 'register' && (
          <>
            <label>Name<input value={f.name} onChange={set('name')} /></label>
            <label>City<input value={f.city} onChange={set('city')} /></label>
          </>
        )}
        <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} /></label>
        <button className="btn" type="submit">{mode === 'login' ? 'Log in' : 'Sign up'}</button>
        <p className={'msg' + (msg.err ? ' err' : '')}>{msg.text}</p>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMsg({ text: '', err: false }); }}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
        </button>
        {mode === 'login' && (
          <div className="demos">
            <span>Try a demo account:</span>
            {DEMOS.map(([label, email, password]) => (
              <button type="button" key={label} className={'chip ' + label.toLowerCase()} onClick={() => setF({ ...f, email, password })}>{label}</button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
