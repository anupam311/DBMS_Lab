const BASE = import.meta.env.VITE_API_URL || '';
let token = '';

export const setToken = t => { token = t || ''; };

export async function api(url, opts = {}) {
  const res = await fetch(BASE + '/api' + url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
  });
  const body = await res.json();
  if (res.status === 401 && token) window.dispatchEvent(new Event('session-expired'));
  return body;
}

export const money = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
export const when = d => new Date(d).toLocaleString();
export const day = d => new Date(d).toLocaleDateString();
