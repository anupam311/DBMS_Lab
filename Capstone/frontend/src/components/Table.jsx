export default function Table({ cols, rows }) {
  if (!rows) return <p className="note">Loading…</p>;
  if (!rows.length) return <p className="note">Nothing here yet.</p>;
  return (
    <div className="scroll">
      <table>
        <thead><tr>{cols.map(c => <th key={c.h} className={c.num ? 'num' : ''}>{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map(c => <td key={c.h} className={c.num ? 'num' : ''}>{c.f ? c.f(r) : r[c.k]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
