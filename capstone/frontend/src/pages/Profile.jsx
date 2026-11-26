import { useEffect, useState } from 'react';

export default function Profile({ call, say }) {
  const [p, setP] = useState(null);
  const [pw, setPw] = useState({ old_password: '', new_password: '' });

  useEffect(() => { call('/profile').then(r => setP((r.data || [])[0])); }, []);

  const save = async e => {
    e.preventDefault();
    const r = await call('/profile', { method: 'PUT', body: JSON.stringify(p) });
    if (r.ok) say(r.message); else say(r.error, true);
  };
  const change = async e => {
    e.preventDefault();
    const r = await call('/profile/password', { method: 'POST', body: JSON.stringify(pw) });
    if (r.ok) { say(r.message); setPw({ old_password: '', new_password: '' }); } else say(r.error, true);
  };

  if (!p) return <p className="note">Loading…</p>;
  return (
    <>
      <p className="note">Saving runs an UPDATE on your own row. Changing the password re-hashes it with bcrypt inside the database.</p>
      <form className="form" onSubmit={save}>
        <label>Name<input value={p.name || ''} onChange={e => setP({ ...p, name: e.target.value })} /></label>
        <label>City<input value={p.city || ''} onChange={e => setP({ ...p, city: e.target.value })} /></label>
        <label>Email<input value={p.email} disabled /></label>
        <label>Role<input value={p.role} disabled /></label>
        <div className="bar"><button className="btn" type="submit">Save profile</button></div>
      </form>
      <h3>Change password</h3>
      <form className="form" onSubmit={change}>
        <label>Current password<input type="password" value={pw.old_password} onChange={e => setPw({ ...pw, old_password: e.target.value })} /></label>
        <label>New password<input type="password" value={pw.new_password} onChange={e => setPw({ ...pw, new_password: e.target.value })} /></label>
        <div className="bar"><button className="btn" type="submit">Change password</button></div>
      </form>
    </>
  );
}
