export default function Inspector({ log }) {
  return (
    <aside className="inspector" aria-live="polite">
      <h2>Behind the scenes</h2>
      <p className="sub">The backend only calls the database. Purple lines are messages printed by procedures and triggers inside PostgreSQL.</p>
      {log.map((l, i) => {
        if (l.notice) return <div key={i} className="step notice"><b>Inside PostgreSQL</b><span>{l.notice}</span></div>;
        const tx = /^(BEGIN|COMMIT|ROLLBACK)/.test(l.sql);
        return (
          <div key={i} className={'step ' + (l.error ? 'err' : tx ? 'tx' : 'call')}>
            <b>{l.error ? 'Error' : tx ? 'Transaction' : 'Backend call'}</b>
            <code>{l.sql.replace(/\s+/g, ' ').trim()}</code>
            <span>{l.error ? l.error : l.ms.toFixed(1) + ' ms'}</span>
          </div>
        );
      })}
    </aside>
  );
}
