const API = {
  token: () => localStorage.getItem('zp_token'),
  headers: () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${API.token()}` }),

  async get(path) {
    const r = await fetch('/api' + path, { headers: API.headers() });
    if (r.status === 401) { localStorage.clear(); window.location.href = '/'; }
    return r.json();
  },
  async post(path, body) {
    const r = await fetch('/api' + path, { method: 'POST', headers: API.headers(), body: JSON.stringify(body) });
    if (r.status === 401) { localStorage.clear(); window.location.href = '/'; }
    return r.json();
  },
  async put(path, body) {
    const r = await fetch('/api' + path, { method: 'PUT', headers: API.headers(), body: JSON.stringify(body) });
    return r.json();
  },
  async del(path) {
    const r = await fetch('/api' + path, { method: 'DELETE', headers: API.headers() });
    return r.json();
  }
};

function requireAuth() {
  if (!API.token()) window.location.href = '/';
}

function platformIcon(p) {
  if (p === 'instagram') return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`;
  if (p === 'youtube') return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.58 7.19a2.76 2.76 0 0 0-1.94-1.95C18 4.75 12 4.75 12 4.75s-6 0-7.64.49a2.76 2.76 0 0 0-1.94 1.95A28.84 28.84 0 0 0 2 12a28.84 28.84 0 0 0 .42 4.81 2.76 2.76 0 0 0 1.94 1.95c1.64.49 7.64.49 7.64.49s6 0 7.64-.49a2.76 2.76 0 0 0 1.94-1.95A28.84 28.84 0 0 0 22 12a28.84 28.84 0 0 0-.42-4.81zM10 15.5v-7l6 3.5-6 3.5z"/></svg>`;
  if (p === 'tiktok') return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.2 8.2 0 0 0 4.78 1.52V6.77a4.85 4.85 0 0 1-1.01-.08z"/></svg>`;
  return '';
}

function platformColor(p) {
  if (p === 'instagram') return 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)';
  if (p === 'youtube') return '#ff0000';
  if (p === 'tiktok') return '#000000';
  return '#7c3aed';
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(s) {
  const map = { draft: ['Rascunho', '#64748b'], scheduled: ['Agendado', '#7c3aed'], published: ['Publicado', '#10b981'], failed: ['Falhou', '#ef4444'], partial: ['Parcial', '#f59e0b'] };
  const [label, color] = map[s] || [s, '#64748b'];
  return `<span style="background:${color}22;color:${color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">${label}</span>`;
}
