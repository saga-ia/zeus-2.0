// Núcleo do painel do Agente Posts: API, roteador por hash, componentes e gráficos.
// Cada tela vive em view-<nome>.js e se registra em ZP.views.<nome> = { mount(el, params) }.
(function () {
  const API_BASE = '/zeuspost/api';

  // ─── utilitários ───────────────────────────────────────────────────────────
  const e = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => { const s = String(u || ''); return /^(https?:\/\/|\/)/i.test(s) ? e(s) : ''; };
  const pad = (n) => String(n).padStart(2, '0');
  const dObj = (ts) => new Date(ts * 1000);
  const fmt = {
    n: (v) => (Number(v) || 0).toLocaleString('pt-BR'),
    compact: (v) => { v = Number(v) || 0; return v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' mi' : v >= 1e4 ? (v / 1e3).toFixed(1).replace('.', ',') + ' mil' : v.toLocaleString('pt-BR'); },
    date: (ts) => ts ? dObj(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-',
    time: (ts) => ts ? dObj(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
    dt: (ts) => ts ? fmt.date(ts) + ' às ' + fmt.time(ts) : '-',
    full: (ts) => ts ? dObj(ts).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) + ', ' + fmt.time(ts) : '-',
    ymd: (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    local: (ts) => { const d = dObj(ts); return fmt.ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }, // valor de <input datetime-local>
    rel: (ts) => {
      if (!ts) return '-';
      const s = Math.round(ts - Date.now() / 1000), a = Math.abs(s);
      const t = a < 3600 ? Math.max(1, Math.round(a / 60)) + ' min' : a < 86400 ? Math.round(a / 3600) + ' h' : Math.round(a / 86400) + ' d';
      return s >= 0 ? 'em ' + t : 'há ' + t;
    },
  };

  // ─── ícones (mesmo traço da Central) ───────────────────────────────────────
  const I = {
    grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    plus: '<path d="M12 5v14M5 12h14" stroke-width="2.2"/>',
    check: '<path d="M5 12l5 5 9-11" stroke-width="2.4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18" stroke-width="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    refresh: '<path d="M4 12a8 8 0 1 1 3 6"/><path d="M4 19v-5h5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
    story: '<circle cx="12" cy="12" r="9" stroke-dasharray="3.2 2.6"/><circle cx="12" cy="12" r="4.5"/>',
    layers: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
    rocket: '<path d="M5 15c-1 2-1 4-1 4s2 0 4-1M9 15l-1-4c2-5 6-7 11-7 0 5-2 9-7 11l-3-0z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="2.4"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 17v3h16v-3"/>',
    chevL: '<path d="M15 5l-7 7 7 7" stroke-width="2"/>', chevR: '<path d="M9 5l7 7-7 7" stroke-width="2"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    heart: '<path d="M12 20s-7-4.5-9-9a4.5 4.5 0 0 1 9-2 4.5 4.5 0 0 1 9 2c-2 4.5-9 9-9 9z"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .8 3 3 3 6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  };
  const icon = (name, size, color) => `<svg class="ic" width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[name] || ''}</svg>`;

  // ─── API ───────────────────────────────────────────────────────────────────
  async function request(method, path, body, isForm) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body != null) { if (isForm) opt.body = body; else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); } }
    const r = await fetch(API_BASE + path, opt);
    // sessão da Central expirada: a Central responde com redirect pro /login (HTML)
    if (r.redirected || !(r.headers.get('content-type') || '').includes('json')) {
      if (r.redirected && /\/login/.test(r.url)) { (window.top || window).location.href = '/login'; throw new Error('Sessão expirada. Entre de novo na Central.'); }
      if (!r.ok) throw new Error('Erro ' + r.status);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j && j.error && !j.ok)) throw new Error((j && j.error) || 'Erro ' + r.status);
    return j;
  }
  const api = {
    get: (p) => request('GET', p), post: (p, b) => request('POST', p, b == null ? {} : b), put: (p, b) => request('PUT', p, b),
    del: (p) => request('DELETE', p), form: (p, fd) => request('POST', p, fd, true),
    qs: (o) => { const q = new URLSearchParams(); Object.entries(o || {}).forEach(([k, v]) => { if (v !== '' && v != null) q.set(k, v); }); const s = q.toString(); return s ? '?' + s : ''; },
  };

  // contas conectadas: usadas em quase toda tela
  let _acc = null, _accAt = 0;
  async function accounts(force) {
    if (!force && _acc && Date.now() - _accAt < 60000) return _acc;
    _acc = await api.get('/accounts'); _accAt = Date.now(); return _acc;
  }
  const accName = (list, ids) => (ids || []).map((id) => { const a = (list || []).find((x) => x.id === id); return a ? '@' + a.platform_username : '#' + id; }).join(', ') || '-';
  const avatar = (a, size) => {
    const ini = e(String(a.platform_name || a.platform_username || '?').replace(/[^A-Za-zÀ-ú ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '@');
    const st = size ? `style="width:${size}px;height:${size}px;flex-basis:${size}px"` : '';
    return `<span class="avatar" ${st}>${a.profile_picture ? `<img src="${safeUrl(a.profile_picture)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${ini}'))">` : ini}</span>`;
  };

  // ─── componentes ───────────────────────────────────────────────────────────
  const STATUS = {
    scheduled: ['Agendado', 'b-amber'], published: ['Publicado', 'b-green'], failed: ['Falhou', 'b-red'], publishing: ['Publicando', 'b-blue'],
    draft: ['Rascunho', ''], paused: ['Pausado', ''], active: ['Ativa', 'b-green'], completed: ['Concluída', 'b-blue'], pending: ['Pendente', 'b-amber'], processing: ['Processando', 'b-blue'],
  };
  const TIPO = { feed: ['Feed', 'image'], reel: ['Reels', 'video'], story: ['Story', 'story'], carousel: ['Carrossel', 'layers'] };
  const ui = {
    badge: (s) => { const x = STATUS[s] || [s || '-', '']; return `<span class="badge ${x[1]}">${e(x[0])}</span>`; },
    statusLabel: (s) => (STATUS[s] || [s])[0],
    tipo: (t) => { const x = TIPO[t] || TIPO.feed; return `<span class="tag">${icon(x[1], 12)}${x[0]}</span>`; },
    tipoIcon: (t) => (TIPO[t] || TIPO.feed)[1],
    loading: (msg) => `<div class="state"><span class="spin"></span><div style="margin-top:12px">${e(msg || 'Carregando...')}</div></div>`,
    empty: (titulo, texto, acaoHtml, ic) => `<div class="state"><div class="ico">${icon(ic || 'calendar', 20)}</div><strong>${e(titulo)}</strong>${e(texto || '')}${acaoHtml ? `<div style="margin-top:14px">${acaoHtml}</div>` : ''}</div>`,
    error: (msg) => `<div class="note err">${icon('alert', 17)}<div>${e(msg)}</div></div>`,
    note: (kind, html, ic) => `<div class="note ${kind}">${icon(ic || (kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'alert'), 17)}<div>${html}</div></div>`,
    kpi: (label, value, detail, color) => `<div class="kpi"><div class="l"><i style="background:${color || 'var(--mute)'}"></i>${e(label)}</div><div class="v num">${e(value)}</div>${detail ? `<div class="d">${e(detail)}</div>` : ''}</div>`,
    thumb: (ev) => {
      const u = ev.media_url || ev.media_path;
      const isVid = ev.tipo === 'reel' || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u || '') || String(ev.media_type || '').startsWith('video');
      if (u && !isVid && safeUrl(u)) return `<span class="thumb"><img src="${safeUrl(u)}" alt="" loading="lazy" onerror="this.remove()"></span>`;
      return `<span class="thumb">${icon(isVid ? 'video' : ui.tipoIcon(ev.tipo), 18)}</span>`;
    },
    toast(msg, kind) {
      let box = document.getElementById('toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
      const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; box.appendChild(t);
      setTimeout(() => t.remove(), kind === 'err' ? 6500 : 3200);
    },
    // modal({ title, body(html), wide, actions:[{label, kind:'pri'|'danger', onClick(close, btn)}] }) → close()
    modal(o) {
      const ov = document.createElement('div'); ov.className = 'ov';
      ov.innerHTML = `<div class="modal ${o.wide ? 'wide' : ''}" role="dialog"><div class="modal-h"><h2 class="grow">${e(o.title || '')}</h2><span class="icon-btn" data-x>${icon('x', 16)}</span></div><div class="modal-b">${o.body || ''}</div>${(o.actions || []).length ? '<div class="modal-f"></div>' : ''}</div>`;
      const close = () => { ov.remove(); document.removeEventListener('keydown', esc); if (o.onClose) o.onClose(); };
      const esc = (ev) => { if (ev.key === 'Escape') close(); };
      document.addEventListener('keydown', esc);
      ov.addEventListener('mousedown', (ev) => { if (ev.target === ov) close(); });
      ov.querySelector('[data-x]').onclick = close;
      const f = ov.querySelector('.modal-f');
      (o.actions || []).forEach((a) => { const b = document.createElement('button'); b.className = 'btn ' + (a.kind || ''); b.innerHTML = (a.icon ? icon(a.icon, 14) : '') + e(a.label); b.onclick = () => a.onClick ? a.onClick(close, b) : close(); f.appendChild(b); });
      document.body.appendChild(ov);
      if (o.onOpen) o.onOpen(ov.querySelector('.modal-b'), close);
      return close;
    },
    confirm: (o) => new Promise((res) => {
      let done = false;
      ui.modal({ title: o.title, body: `<div style="font-size:13.5px;line-height:1.55;color:var(--ink-2)">${o.html || e(o.text || '')}</div>`, onClose: () => { if (!done) res(false); },
        actions: [{ label: 'Cancelar', onClick: (c) => c() }, { label: o.ok || 'Confirmar', kind: o.danger ? 'danger' : 'pri', onClick: (c) => { done = true; res(true); c(); } }] });
    }),
    busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin" style="width:14px;height:14px"></span>' + e(label || 'Aguarde...'); } else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; } },
    // seletor de contas em filtros
    accOptions: (list, sel) => `<option value="">Todas as contas</option>` + (list || []).map((a) => `<option value="${a.id}" ${String(sel) === String(a.id) ? 'selected' : ''}>@${e(a.platform_username)}</option>`).join(''),
  };

  // ─── gráficos em SVG (mesmo desenho dos da Central: linha verde fina, área em degradê) ───
  let _gid = 0;
  function linePath(vals, w, h, padT, padB) {
    const max = Math.max(1, ...vals), n = vals.length, ih = h - padT - padB;
    return vals.map((v, i) => `${i ? 'L' : 'M'}${(n === 1 ? w / 2 : (i / (n - 1)) * w).toFixed(1)} ${(padT + ih - (v / max) * ih).toFixed(1)}`).join(' ');
  }
  const charts = {
    spark: (vals, color) => `<svg viewBox="0 0 160 34" preserveAspectRatio="none" style="width:100%;height:34px;display:block"><path d="${linePath(vals.length ? vals : [0, 0], 160, 34, 4, 4)}" fill="none" stroke="${color || '#0F7A68'}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`,
    area: (vals, color) => {
      const c = color || '#0F7A68', id = 'ga' + (++_gid), p = linePath(vals.length ? vals : [0, 0], 420, 90, 8, 4);
      return `<svg viewBox="0 0 420 90" preserveAspectRatio="none" style="width:100%;height:90px;display:block"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c}" stop-opacity="0.22"/><stop offset="100%" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><path d="${p} L420 90 L0 90 Z" fill="url(#${id})"/><path d="${p}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
    },
    // gráfico de linha com eixo: labels = rótulos do eixo X (mostra início, meio e fim)
    line: (vals, labels, color) => {
      const c = color || '#0F7A68', max = Math.max(1, ...vals), n = vals.length;
      const X = (i) => 56 + (n <= 1 ? 118 : (i / (n - 1)) * 236), Y = (v) => 106 - (v / max) * 88;
      const path = vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
      const tick = (i) => labels && labels[i] != null ? `<text x="${X(i).toFixed(0)}" y="132" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${e(labels[i])}</text>` : '';
      return `<svg viewBox="0 0 300 150" style="width:100%;height:auto;display:block"><g stroke="#F1F1F3" stroke-width="1"><line x1="56" y1="18" x2="292" y2="18"/><line x1="56" y1="62" x2="292" y2="62"/><line x1="56" y1="106" x2="292" y2="106"/></g>
        <g fill="#66666F" font-size="9" font-family="DM Sans" text-anchor="end"><text x="50" y="21">${fmt.compact(max)}</text><text x="50" y="65">${max >= 2 ? fmt.compact(Math.round(max / 2)) : ''}</text><text x="50" y="109">0</text></g>
        <path d="${path || 'M56 106 L292 106'}" fill="none" stroke="${c}" stroke-width="1.8"/>
        <g fill="#66666F" font-size="9" font-family="DM Sans" text-anchor="middle">${tick(0)}${n > 2 ? tick(Math.floor((n - 1) / 2)) : ''}${n > 1 ? tick(n - 1) : ''}</g></svg>`;
    },
    // barras horizontais: rows = [{label, value, hint}]
    hbars: (rows, color) => { const max = Math.max(1, ...rows.map((r) => r.value)); return rows.map((r) => `<div style="margin-bottom:14px"><div class="row" style="margin-bottom:6px;flex-wrap:nowrap"><span class="grow trunc" style="font-size:13px">${e(r.label)}</span><strong class="num" style="font-size:13px">${e(r.hint != null ? r.hint : fmt.n(r.value))}</strong></div><div class="bar"><i style="width:${Math.max(2, (r.value / max) * 100).toFixed(1)}%;background:${color || 'var(--green)'}"></i></div></div>`).join(''); },
    card: (title, inner, right) => `<div class="card" style="overflow:hidden"><div class="card-h"><strong style="font-size:13.5px;font-weight:600" class="grow">${e(title)}</strong>${right || ''}</div><div class="card-b">${inner}</div></div>`,
  };
  // agrupa eventos por dia entre dois instantes → { labels:['09/07',...], series(fn) }
  function byDay(fromTs, toTs) {
    const days = []; const d = new Date(fromTs * 1000); d.setHours(0, 0, 0, 0);
    while (d.getTime() / 1000 <= toTs) { days.push(fmt.ymd(d)); d.setDate(d.getDate() + 1); }
    return { days, labels: days.map((k) => k.slice(8) + '/' + k.slice(5, 7)), count: (evs, pick) => { const m = Object.fromEntries(days.map((k) => [k, 0])); evs.forEach((ev) => { const k = fmt.ymd(dObj(ev.quando || ev.ts)); if (k in m) m[k] += pick ? pick(ev) : 1; }); return days.map((k) => m[k]); } };
  }

  // ─── roteador ──────────────────────────────────────────────────────────────
  let _cleanup = null, _timer = null;
  function parseHash() {
    const h = (location.hash || '#/dashboard').replace(/^#\/?/, ''); const [name, q] = h.split('?');
    return { name: name || 'dashboard', params: Object.fromEntries(new URLSearchParams(q || '')) };
  }
  function go(name, params) { location.hash = '#/' + name + api.qs(params); }
  async function route() {
    const { name, params } = parseHash(); const app = document.getElementById('app');
    if (_cleanup) { try { _cleanup(); } catch (_) {} _cleanup = null; }
    if (_timer) { clearInterval(_timer); _timer = null; }
    document.querySelectorAll('.ov').forEach((o) => o.remove());
    const v = ZP.views[name];
    if (!v) { app.innerHTML = `<div class="page">${ui.empty('Tela não encontrada', 'Volte para o dashboard.', `<a class="btn" href="#/dashboard">Abrir dashboard</a>`)}</div>`; return; }
    app.innerHTML = `<div class="page">${ui.loading()}</div>`; window.scrollTo(0, 0);
    try { parent !== window && parent.postMessage({ zpRoute: name }, location.origin); } catch (_) {}
    try { const c = await v.mount(app, params); if (typeof c === 'function') _cleanup = c; }
    catch (err) { console.error(err); app.innerHTML = `<div class="page">${ui.error('Não consegui carregar esta tela: ' + err.message)}<button class="btn" onclick="location.reload()">Tentar de novo</button></div>`; }
  }
  // recarrega dados a cada N segundos enquanto a aba está visível (as telas antigas faziam o mesmo)
  function every(seconds, fn) { if (_timer) clearInterval(_timer); _timer = setInterval(() => { if (!document.hidden && !document.querySelector('.ov')) fn(); }, seconds * 1000); }

  window.ZP = { views: {}, api, accounts, accName, avatar, ui, charts, byDay, fmt, e, safeUrl, icon, go, every, route };
  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', route);
})();
