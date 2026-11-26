export default function Table({ cols, rows, sort, onSort }) {
  if (!rows) return <p className="note">Loading…</p>;
  if (!rows.length) return <p className="note">Nothing here yet.</p>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {cols.map(c => {
              const active = sort && c.sortKey && sort.key === c.sortKey;
              return (
                <th key={c.h} className={c.num ? 'num' : ''}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortKey && onSort
                    ? <button className="sortbtn" onClick={() => onSort(c.sortKey)}>{c.h}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
                    : c.h}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map(c => <td key={c.h} className={c.num ? 'num' : ''}>{c.f ? c.f(r) : r[c.k]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
