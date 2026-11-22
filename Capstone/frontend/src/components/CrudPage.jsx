import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Table from './Table.jsx';

export default function CrudPage({ call, say, endpoint, pk, noun, fields, columns, note }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [options, setOptions] = useState({});

  useEffect(() => {
    call(endpoint).then(r => setRows(r.data || []));
    fields.filter(f => f.optionsFrom).forEach(async f => {
      const r = await api(f.optionsFrom);
      setOptions(o => ({ ...o, [f.name]: r.data || [] }));
    });
  }, []);

  const reload = async () => setRows((await api(endpoint)).data || []);

  const save = async e => {
    e.preventDefault();
    const editing = form[pk] !== undefined;
    const r = await call(endpoint + (editing ? '/' + form[pk] : ''), { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) });
    if (r.ok) { say(r.message); setForm(null); reload(); } else say(r.error, true);
  };

  const remove = async row => {
    if (!confirm('Delete this ' + noun + '?')) return;
    const r = await call(endpoint + '/' + row[pk], { method: 'DELETE' });
    if (r.ok) { say(r.message); reload(); } else say(r.error, true);
  };

  return (
    <>
      {note && <p className="note">{note}</p>}
      {!form && <div className="bar"><button className="btn" onClick={() => setForm({})}>Add {noun}</button></div>}
      {form && (
        <form className="form" onSubmit={save}>
          {fields.map(f => (
            <label key={f.name}>{f.label}
              {f.optionsFrom ? (
                <select value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })}>
                  <option value="">Choose…</option>
                  {(options[f.name] || []).map(o => <option key={o[f.optionValue]} value={o[f.optionValue]}>{o[f.optionLabel]}</option>)}
                </select>
              ) : (
                <input type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} value={form[f.name] ?? ''}
                  onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
              )}
            </label>
          ))}
          <div className="bar">
            <button className="btn" type="submit">Save {noun}</button>
            <button className="btn ghost" type="button" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      <Table rows={rows} cols={[
        ...columns,
        { h: 'Actions', f: r => (
          <>
            <button className="btn ghost" onClick={() => setForm({ ...r })}>Edit</button>{' '}
            <button className="btn ghost danger" onClick={() => remove(r)}>Delete</button>
          </>
        ) }
      ]} />
    </>
  );
}
