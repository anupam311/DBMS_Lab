import { useState } from 'react';

const TESTS = [
  ['read_hashes', "Read other people's password hashes", 'Nobody has this privilege, not even the admin.'],
  ['list_users', 'List all users', 'Admins only.'],
  ['run_report', 'Run a sales report', 'Managers and admins.'],
  ['count_orders', 'Count the orders I can see', 'Customers see only their own (row level security).']
];

export default function Security({ call, user }) {
  const [results, setResults] = useState({});

  const run = async test => {
    const r = await call('/security/test', { method: 'POST', body: JSON.stringify({ test }) });
    setResults({ ...results, [test]: r.ok ? r.data[0].result : r.error });
  };

  return (
    <>
      <p className="note">You are <b>{user.name}</b>, running with the database role <span className={'chip ' + user.role}>role_{user.role}</span>.
        Roles inherit downwards: admin includes manager, and manager includes customer. Press a button to run that action under your role.</p>
      <div className="tests">
        {TESTS.map(([id, label, hint]) => (
          <div key={id} className="test">
            <div><b>{label}</b><div className="hint">{hint}</div></div>
            <button className="btn" onClick={() => run(id)}>Try it</button>
            {results[id] && <div className={'result ' + (results[id].startsWith('ALLOWED') ? 'ok' : 'no')}>{results[id]}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
