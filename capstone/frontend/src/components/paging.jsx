import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export function usePagedSearch(call, url, initial, size) {
  const [f, setF] = useState(initial);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: null, total: 0 });
  const first = useRef(true);

  const query = () => url + '?' + new URLSearchParams({ ...f, page, size }).toString();
  const apply = r => setData({ rows: r.data || [], total: r.data && r.data[0] ? Number(r.data[0].total_rows) : 0 });

  useEffect(() => {
    const t = setTimeout(() => call(query()).then(apply), first.current ? 0 : 250);
    first.current = false;
    return () => clearTimeout(t);
  }, [JSON.stringify(f), page]);

  const pages = Math.max(1, Math.ceil(data.total / size));
  const change = patch => { setF({ ...f, ...patch }); setPage(1); };

  return {
    f, data, page, pages, change,
    sortBy: key => change(f.sort === key ? { dir: f.dir === 'asc' ? 'desc' : 'asc' } : { sort: key, dir: 'asc' }),
    goTo: n => setPage(Math.min(Math.max(Math.round(Number(n)) || page, 1), pages)),
    reload: async () => {
      const r = await api(query());
      apply(r);
      if (r.data && !r.data.length && page > 1) setPage(page - 1);
    }
  };
}

export function Pager({ page, pages, total, onPage, noun }) {
  const [jump, setJump] = useState(String(page));
  useEffect(() => setJump(String(page)), [page]);
  return (
    <form className="pager" onSubmit={e => { e.preventDefault(); onPage(jump); }}>
      <span className="count">{total} {noun}</span>
      {pages > 1 && (
        <>
          <button type="button" className="btn ghost" onClick={() => onPage(page - 1)} disabled={page <= 1}>Previous</button>
          <label>Page
            <input type="number" min="1" max={pages} value={jump} aria-label="Go to page"
              onChange={e => setJump(e.target.value)} onBlur={() => onPage(jump)} />
            of {pages}
          </label>
          <button type="submit" className="btn ghost">Go</button>
          <button type="button" className="btn ghost" onClick={() => onPage(page + 1)} disabled={page >= pages}>Next</button>
        </>
      )}
    </form>
  );
}

export function categoryOptions(cats) {
  const byName = (a, b) => a.cat_name.localeCompare(b.cat_name);
  const out = [];
  cats.filter(c => !c.parent_cat_id).sort(byName).forEach(p => {
    out.push({ id: p.cat_id, label: p.cat_name });
    cats.filter(c => c.parent_cat_id === p.cat_id).sort(byName).forEach(c => out.push({ id: c.cat_id, label: '— ' + c.cat_name }));
  });
  cats.forEach(c => { if (!out.some(o => o.id === c.cat_id)) out.push({ id: c.cat_id, label: c.cat_name }); });
  return out;
}
