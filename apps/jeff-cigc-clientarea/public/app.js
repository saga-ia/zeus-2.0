(function () {
  const root = document.getElementById('app');
  const state = { user: null, modal: null };

  const fmt = {
    num(n) {
      if (n == null) return '—';
      if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
      return String(n);
    },
    date(s) {
      if (!s) return '—';
      const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
      if (isNaN(d)) return s;
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    },
    initials(name) {
      return (name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase();
    },
    role(r) {
      return ({ admin: 'Admin', marketing: 'Marketing', comercial: 'Comercial', organizador: 'Organizador' })[r] || r;
    },
    escape(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
  };

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, opts || {}));
    let body = null;
    try { body = await r.json(); } catch (_) {}
    if (!r.ok) {
      const err = new Error((body && body.error) || `HTTP ${r.status}`);
      err.status = r.status; err.body = body;
      throw err;
    }
    return body;
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function on(node, sel, ev, fn) {
    node.querySelectorAll(sel).forEach(n => n.addEventListener(ev, fn));
  }

  // ---------- Auth ----------
  async function init() {
    try {
      const r = await api('/api/me');
      state.user = r.user;
      renderShell();
    } catch (e) {
      renderLogin();
    }
  }

  function renderLogin(errorMsg) {
    root.innerHTML = '';
    const node = el(`
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-brand">
            <div class="login-brand-mark">CI</div>
            <div class="login-brand-text">CIGC 2026<strong>Área do Cliente</strong></div>
          </div>
          <h1>Entrar</h1>
          <p>Acesso restrito à equipe organizadora.</p>
          ${errorMsg ? `<div class="alert">${fmt.escape(errorMsg)}</div>` : ''}
          <form id="loginForm">
            <div class="field"><label>Email</label><input type="email" name="email" required autocomplete="email"></div>
            <div class="field"><label>Senha</label><input type="password" name="password" required autocomplete="current-password"></div>
            <button type="submit" class="btn" id="loginBtn">Entrar</button>
          </form>
        </div>
      </div>
    `);
    root.appendChild(node);
    node.querySelector('#loginForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const btn = node.querySelector('#loginBtn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
        state.user = r.user;
        renderShell();
      } catch (e) {
        renderLogin(e.message === 'invalid_credentials' ? 'Email ou senha incorretos.' : 'Não foi possível entrar. Tente novamente.');
      }
    });
  }

  async function logout() {
    try { await api('/api/logout', { method: 'POST' }); } catch (_) {}
    state.user = null;
    renderLogin();
  }

  // ---------- Shell ----------
  function renderShell() {
    const u = state.user;
    root.innerHTML = '';
    const node = el(`
      <div class="shell">
        <div class="topbar">
          <div class="topbar-brand">
            <div class="topbar-mark">CI</div>
            <div class="topbar-title">CIGC 2026<small>Área do cliente · Glauco</small></div>
          </div>
          <div class="topbar-user">
            <div class="name"><strong>${fmt.escape(u.name)}</strong></div>
            <span class="role-badge">${fmt.role(u.role)}</span>
            <button class="btn btn-ghost btn-sm" id="logoutBtn">Sair</button>
          </div>
        </div>
        <div class="banner-wrap">
          <img src="/assets/banner.jpg" alt="CIGC 2026">
          <div class="banner-meta">04 · 05 · 06 set · APCD São Paulo</div>
        </div>
        <div class="cards" id="cards"></div>
      </div>
    `);
    root.appendChild(node);
    node.querySelector('#logoutBtn').addEventListener('click', logout);
    renderCards(node.querySelector('#cards'));
  }

  function card({ icon, title, sub, pill, onClick }) {
    const n = el(`
      <div class="card">
        ${pill ? `<div class="card-pill">${fmt.escape(pill)}</div>` : ''}
        <div class="card-icon">${icon}</div>
        <h3>${fmt.escape(title)}</h3>
        <div class="card-sub">${sub}</div>
        <div class="card-cta">Abrir →</div>
      </div>
    `);
    n.addEventListener('click', onClick);
    return n;
  }

  function renderCards(host) {
    const role = state.user.role;
    host.innerHTML = '';

    host.appendChild(card({
      icon: '👤', title: 'Glauco — Organizador',
      sub: 'Decisor estratégico do congresso. Veja contato direto, papel no evento e canal de comunicação.',
      pill: 'Cliente',
      onClick: () => openTeamModal('organizador', 'Organizador')
    }));

    host.appendChild(card({
      icon: '📣', title: 'Equipe de Marketing',
      sub: 'Time responsável pelas estratégias, palestrantes, captação e conversão durante o evento.',
      pill: role === 'admin' || role === 'marketing' ? 'Editar' : 'Ver',
      onClick: () => openTeamModal('marketing', 'Marketing')
    }));

    host.appendChild(card({
      icon: '💼', title: 'Equipe Comercial',
      sub: 'Time de inscrições, relacionamento com congressistas e operação comercial no evento.',
      pill: role === 'admin' || role === 'comercial' ? 'Editar' : 'Ver',
      onClick: () => openTeamModal('comercial', 'Comercial')
    }));

    host.appendChild(card({
      icon: '🎤', title: 'Palestrantes',
      sub: 'Lista de palestrantes confirmados e em negociação para o congresso.',
      onClick: () => openSpeakersModal()
    }));

    host.appendChild(card({
      icon: '📸', title: 'Instagram do Congresso',
      sub: 'Snapshot do perfil oficial, últimas postagens e busca por conteúdo já publicado.',
      onClick: () => openInstagramModal()
    }));

    host.appendChild(card({
      icon: '🎭', title: 'Teatro APCD',
      sub: 'Local oficial do evento. Localização, fotos e medidas da visita técnica.',
      pill: 'Local',
      onClick: () => openVenueModal()
    }));
  }

  // ---------- Venue (Teatro APCD) ----------
  async function openVenueModal() {
    const body = el('<div><div class="empty-state"><div class="spinner"></div></div></div>');
    openModal({ title: 'Teatro APCD · Local do CIGC 2026', body, size: 'lg' });
    try {
      const r = await api('/api/venue');
      renderVenueBody(body, r);
    } catch (e) {
      body.innerHTML = `<div class="alert">Falha ao carregar: ${fmt.escape(e.message)}</div>`;
    }
  }

  function renderVenueBody(body, data) {
    const info = data.info || {};
    const photos = data.photos || [];
    const isAdmin = state.user.role === 'admin';
    body.innerHTML = '';

    const head = el(`
      <div class="venue-head">
        <div class="venue-info">
          <div class="venue-line"><span class="venue-label">Endereço</span><span>${fmt.escape(info.address || '—')}</span></div>
          <div class="venue-line"><span class="venue-label">Capacidade</span><span>${fmt.escape(info.capacity || '—')}</span></div>
          ${info.notes ? `<div class="venue-line"><span class="venue-label">Notas</span><span>${fmt.escape(info.notes)}</span></div>` : ''}
        </div>
        <div class="venue-actions">
          <a class="btn btn-green" href="${fmt.escape(info.maps_url || '#')}" target="_blank" rel="noopener">📍 Localização</a>
          <button class="btn" id="visitaTecnicaBtn">📐 Visita Técnica</button>
        </div>
      </div>
    `);
    body.appendChild(head);
    head.querySelector('#visitaTecnicaBtn').addEventListener('click', () => openMeasurementsModal());

    const mapBox = el(`
      <div class="venue-map">
        <iframe loading="lazy" src="https://www.google.com/maps?q=${info.lat},${info.lng}&hl=pt-BR&z=16&output=embed" allowfullscreen></iframe>
      </div>
    `);
    body.appendChild(mapBox);

    const galleryHead = el(`<div class="section-head"><h3>Fotos do Teatro</h3>${isAdmin ? '<button class="btn btn-sm" id="addPhotoBtn">+ Adicionar foto</button>' : ''}</div>`);
    body.appendChild(galleryHead);

    const gallery = el('<div class="venue-gallery"></div>');
    if (photos.length === 0) {
      gallery.appendChild(el('<div class="empty-state"><h4>Sem fotos ainda</h4><p>As fotos do local serão adicionadas conforme a equipe enviar.</p></div>'));
    } else {
      photos.forEach(p => {
        const card = el(`
          <figure class="venue-photo">
            <img src="${fmt.escape(p.photo_url)}" alt="${fmt.escape(p.caption || 'Foto Teatro APCD')}" loading="lazy">
            ${p.caption ? `<figcaption>${fmt.escape(p.caption)}</figcaption>` : ''}
            ${isAdmin ? `<button class="photo-del" data-id="${p.id}" title="Remover">×</button>` : ''}
          </figure>
        `);
        if (isAdmin) {
          card.querySelector('.photo-del').addEventListener('click', async () => {
            if (!confirm('Remover esta foto?')) return;
            try { await api(`/api/venue/photos/${p.id}`, { method: 'DELETE' }); openVenueModal(); }
            catch (e) { alert(e.message); }
          });
        }
        gallery.appendChild(card);
      });
    }
    body.appendChild(gallery);

    if (isAdmin) {
      const addBtn = galleryHead.querySelector('#addPhotoBtn');
      addBtn && addBtn.addEventListener('click', () => {
        const url = prompt('URL da foto (ex: /teatro/fotos/foto1.jpg):');
        if (!url) return;
        const caption = prompt('Legenda (opcional):') || '';
        api('/api/venue/photos', { method: 'POST', body: JSON.stringify({ photo_url: url, caption }) })
          .then(() => openVenueModal())
          .catch(e => alert('Erro: ' + e.message));
      });
    }
  }

  async function openMeasurementsModal() {
    const body = el('<div><div class="empty-state"><div class="spinner"></div></div></div>');
    openModal({ title: 'Visita Técnica · Medidas do Teatro APCD', body, size: 'lg' });
    try {
      const r = await api('/api/venue');
      renderMeasurementsBody(body, r.measurements || []);
    } catch (e) {
      body.innerHTML = `<div class="alert">Falha ao carregar: ${fmt.escape(e.message)}</div>`;
    }
  }

  function renderMeasurementsBody(body, measurements) {
    const isAdmin = state.user.role === 'admin';
    body.innerHTML = '';

    body.appendChild(el(`<p style="color:var(--text-300);font-size:13px;margin:0 0 16px">Medidas oficiais coletadas pela equipe de estrutura na visita técnica. Cada item traz a foto, a medida e o que ela representa.</p>`));

    if (measurements.length === 0) {
      body.appendChild(el('<div class="empty-state"><h4>Sem medidas registradas</h4><p>Aguardando reenvio das informações pela equipe no grupo de estrutura.</p></div>'));
    }

    const grid = el('<div class="measurements-grid"></div>');
    measurements.forEach(m => {
      const item = el(`
        <article class="measurement-item">
          ${m.photo_url ? `<div class="measurement-photo"><img src="${fmt.escape(m.photo_url)}" alt="${fmt.escape(m.label)}" loading="lazy"></div>` : '<div class="measurement-photo measurement-photo-empty">📐</div>'}
          <div class="measurement-body">
            <div class="measurement-value">${fmt.escape(m.value)}</div>
            <div class="measurement-label">${fmt.escape(m.label)}</div>
            ${m.notes ? `<div class="measurement-notes">${fmt.escape(m.notes)}</div>` : ''}
          </div>
          ${isAdmin ? `<button class="photo-del" data-id="${m.id}" title="Remover">×</button>` : ''}
        </article>
      `);
      if (isAdmin) {
        item.querySelector('.photo-del').addEventListener('click', async () => {
          if (!confirm('Remover esta medida?')) return;
          try { await api(`/api/venue/measurements/${m.id}`, { method: 'DELETE' }); openMeasurementsModal(); }
          catch (e) { alert(e.message); }
        });
      }
      grid.appendChild(item);
    });
    body.appendChild(grid);

    if (isAdmin) {
      const form = el(`
        <form class="add-form" style="margin-top:24px">
          <input class="full" name="label" placeholder="O que é (ex: Largura do palco)" required>
          <input class="full" name="value" placeholder="Medida (ex: 12,40 m)" required>
          <input class="full" name="photo_url" placeholder="URL da foto (ex: /teatro/medidas/palco.jpg)">
          <textarea class="full" name="notes" placeholder="Observações (opcional)" rows="2"></textarea>
          <button class="btn full" type="submit">+ Adicionar medida</button>
        </form>
      `);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const payload = {};
        fd.forEach((v, k) => { if (v) payload[k] = v; });
        try {
          await api('/api/venue/measurements', { method: 'POST', body: JSON.stringify(payload) });
          openMeasurementsModal();
        } catch (e) { alert('Erro: ' + e.message); }
      });
      body.appendChild(form);
    }
  }

  // ---------- Modal helpers ----------
  function openModal({ title, body, footer, size }) {
    closeModal();
    const overlay = el(`
      <div class="modal-overlay">
        <div class="modal ${size === 'lg' ? 'modal-lg' : ''}">
          <div class="modal-head">
            <h2>${fmt.escape(title)}</h2>
            <button class="modal-close" type="button">×</button>
          </div>
          <div class="modal-body"></div>
          ${footer ? '<div class="modal-footer"></div>' : ''}
        </div>
      </div>
    `);
    overlay.querySelector('.modal-body').appendChild(body);
    if (footer) overlay.querySelector('.modal-footer').appendChild(footer);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.body.appendChild(overlay);
    state.modal = overlay;
    return overlay;
  }

  function closeModal() {
    if (state.modal) { state.modal.remove(); state.modal = null; }
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ---------- Team modal ----------
  async function openTeamModal(area, label) {
    const body = el('<div><div class="empty-state"><div class="spinner"></div></div></div>');
    openModal({ title: label, body });
    try {
      const r = await api(`/api/team/${area}`);
      renderTeamBody(body, area, label, r.members || []);
    } catch (e) {
      body.innerHTML = `<div class="alert">Falha ao carregar: ${fmt.escape(e.message)}</div>`;
    }
  }

  function canEditArea(area) {
    const r = state.user.role;
    if (r === 'admin') return true;
    if (area === 'marketing' && r === 'marketing') return true;
    if (area === 'comercial' && r === 'comercial') return true;
    return false;
  }

  function renderTeamBody(body, area, label, members) {
    body.innerHTML = '';
    if (area === 'comercial') {
      const cta = el(`
        <a class="btn btn-cigc" href="https://cigc-comercial.jefersonhenrike.com/" target="_blank" rel="noopener" style="margin-bottom:16px;text-decoration:none">
          📍 Pesquisas geográficas dos donos de clínica
        </a>
      `);
      body.appendChild(cta);
    }
    if (members.length === 0) {
      body.appendChild(el(`<div class="empty-state"><h4>Sem membros cadastrados</h4><p>Adicione o time de ${fmt.escape(label)} abaixo.</p></div>`));
    }
    members.forEach(m => body.appendChild(memberRow(m, area)));

    if (canEditArea(area)) {
      const form = el(`
        <form class="add-form" style="margin-top:18px">
          <input name="name" placeholder="Nome" required>
          <input name="role" placeholder="Função / cargo">
          <input name="phone" placeholder="Telefone (5562...)">
          <input name="instagram" placeholder="Instagram (sem @)">
          <input class="full" name="photo_url" placeholder="URL da foto (opcional)">
          <textarea class="full" name="notes" placeholder="Observações" rows="2"></textarea>
          <button class="btn full" type="submit">Adicionar membro</button>
        </form>
      `);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const payload = { area };
        fd.forEach((v, k) => { if (v) payload[k] = v; });
        try {
          await api('/api/team', { method: 'POST', body: JSON.stringify(payload) });
          openTeamModal(area, label);
        } catch (e) {
          alert('Erro ao adicionar: ' + e.message);
        }
      });
      body.appendChild(form);
    }
  }

  function memberRow(m, area) {
    const editable = canEditArea(area);
    const node = el(`
      <div class="contact-row" style="flex-direction:column;align-items:flex-start;gap:8px">
        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;gap:12px">
          <div style="display:flex;gap:14px;align-items:center;flex:1">
            <div class="profile-photo" style="width:48px;height:48px;font-size:18px">${m.photo_url ? `<img src="${fmt.escape(m.photo_url)}">` : fmt.initials(m.name)}</div>
            <div>
              <strong style="font-size:11px;color:var(--text-300);text-transform:uppercase;letter-spacing:0.5px">${fmt.escape(m.role || '—')}</strong>
              <div style="font-size:15px;font-weight:600">${fmt.escape(m.name)}</div>
            </div>
          </div>
          ${editable ? `<button class="btn btn-ghost btn-sm" data-action="del">Remover</button>` : ''}
        </div>
        ${m.phone || m.instagram || m.notes ? `
          <div style="width:100%;display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--text-300)">
            ${m.phone ? `<span>📞 <a href="https://wa.me/${fmt.escape(m.phone)}" target="_blank">${fmt.escape(m.phone)}</a></span>` : ''}
            ${m.instagram ? `<span>📷 <a href="https://instagram.com/${fmt.escape(m.instagram.replace(/^@/, ''))}" target="_blank">@${fmt.escape(m.instagram.replace(/^@/, ''))}</a></span>` : ''}
            ${m.notes ? `<span style="width:100%">📝 ${fmt.escape(m.notes)}</span>` : ''}
          </div>` : ''}
      </div>
    `);
    if (editable) {
      node.querySelector('[data-action="del"]').addEventListener('click', async () => {
        if (!confirm(`Remover ${m.name}?`)) return;
        try {
          await api(`/api/team/${m.id}`, { method: 'DELETE' });
          node.remove();
        } catch (e) { alert(e.message); }
      });
    }
    return node;
  }

  // ---------- Speakers modal ----------
  async function openSpeakersModal() {
    const body = el('<div><div class="empty-state"><div class="spinner"></div></div></div>');
    openModal({ title: 'Palestrantes', body, size: 'lg' });
    try {
      const r = await api('/api/speakers');
      renderSpeakersBody(body, r.speakers || []);
    } catch (e) {
      body.innerHTML = `<div class="alert">Falha ao carregar: ${fmt.escape(e.message)}</div>`;
    }
  }

  function canEditSpeakers() {
    return state.user.role === 'admin' || state.user.role === 'marketing';
  }

  function renderSpeakersBody(body, speakers) {
    body.innerHTML = '';
    const list = el('<div class="speakers-list"></div>');
    if (speakers.length === 0) {
      list.appendChild(el('<div class="empty-state"><h4>Nenhum palestrante ainda</h4><p>Adicione o primeiro abaixo.</p></div>'));
    }
    speakers.forEach(s => {
      const row = el(`
        <div class="speaker-row">
          <div class="info" style="display:flex;gap:12px;align-items:center">
            <div class="profile-photo" style="width:42px;height:42px;font-size:15px">${s.photo_url ? `<img src="${fmt.escape(s.photo_url)}">` : fmt.initials(s.name)}</div>
            <div>
              <strong>${fmt.escape(s.name)} ${s.confirmed ? '' : '<span style="color:var(--text-500);font-weight:400">(em negociação)</span>'}</strong>
              <small>${s.talk_topic ? fmt.escape(s.talk_topic) : '—'}${s.instagram ? ` · <a href="https://instagram.com/${fmt.escape(s.instagram.replace(/^@/, ''))}" target="_blank">@${fmt.escape(s.instagram.replace(/^@/, ''))}</a>` : ''}</small>
            </div>
          </div>
          ${canEditSpeakers() ? `<button class="btn btn-ghost btn-sm" data-id="${s.id}">Remover</button>` : ''}
        </div>
      `);
      if (canEditSpeakers()) {
        row.querySelector('[data-id]').addEventListener('click', async () => {
          if (!confirm(`Remover ${s.name}?`)) return;
          try { await api(`/api/speakers/${s.id}`, { method: 'DELETE' }); openSpeakersModal(); } catch (e) { alert(e.message); }
        });
      }
      list.appendChild(row);
    });
    body.appendChild(list);

    if (canEditSpeakers()) {
      const form = el(`
        <form class="add-form">
          <input name="name" placeholder="Nome do palestrante" required>
          <input name="instagram" placeholder="Instagram (sem @)">
          <input class="full" name="talk_topic" placeholder="Tema da palestra">
          <input class="full" name="photo_url" placeholder="URL da foto (opcional)">
          <label class="full" style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-300)"><input type="checkbox" name="confirmed" checked> Confirmado</label>
          <button class="btn full" type="submit">Adicionar palestrante</button>
        </form>
      `);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const payload = {
          name: fd.get('name'),
          instagram: fd.get('instagram') || null,
          talk_topic: fd.get('talk_topic') || null,
          photo_url: fd.get('photo_url') || null,
          confirmed: fd.get('confirmed') === 'on'
        };
        try {
          await api('/api/speakers', { method: 'POST', body: JSON.stringify(payload) });
          openSpeakersModal();
        } catch (e) { alert(e.message); }
      });
      body.appendChild(form);
    }
  }

  // ---------- Instagram modal ----------
  async function openInstagramModal() {
    const body = el('<div><div class="empty-state"><div class="spinner"></div></div></div>');
    openModal({ title: 'Instagram do Congresso', body, size: 'lg' });
    try {
      const r = await api('/api/instagram/snapshot');
      renderInstagramBody(body, r);
    } catch (e) {
      body.innerHTML = `<div class="alert">Falha ao carregar: ${fmt.escape(e.message)}</div>`;
    }
  }

  function renderInstagramBody(body, payload) {
    const handle = payload.handle || 'congressoclinicas';
    const snap = payload.snapshot;
    const data = snap && snap.data;
    body.innerHTML = '';

    const refreshRow = el(`
      <div class="refresh-row">
        <span>${snap ? `Atualizado em ${fmt.date(snap.fetched_at)} · @${fmt.escape(handle)}` : `Sem snapshot ainda · @${fmt.escape(handle)}`}</span>
        <button class="btn" id="refreshIg">Atualizar agora</button>
      </div>
    `);
    body.appendChild(refreshRow);
    refreshRow.querySelector('#refreshIg').addEventListener('click', async () => {
      const btn = refreshRow.querySelector('#refreshIg');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        await api('/api/instagram/refresh', { method: 'POST' });
        openInstagramModal();
      } catch (e) {
        alert('Falha ao atualizar: ' + e.message);
        btn.disabled = false; btn.textContent = 'Atualizar agora';
      }
    });

    if (data) {
      const stats = el(`
        <div class="ig-stats">
          <div class="ig-stat"><div class="ig-stat-num">${fmt.num(data.followersCount)}</div><div class="ig-stat-label">Seguidores</div></div>
          <div class="ig-stat"><div class="ig-stat-num">${fmt.num(data.followsCount)}</div><div class="ig-stat-label">Seguindo</div></div>
          <div class="ig-stat"><div class="ig-stat-num">${fmt.num(data.postsCount)}</div><div class="ig-stat-label">Posts</div></div>
          <div class="ig-stat"><div class="ig-stat-num">${data.verified ? '✓' : '—'}</div><div class="ig-stat-label">Verificado</div></div>
        </div>
      `);
      body.appendChild(stats);
      if (data.biography) body.appendChild(el(`<div class="ig-bio">${fmt.escape(data.biography)}</div>`));
    } else {
      body.appendChild(el('<div class="empty-state"><h4>Nenhum snapshot ainda</h4><p>Clique em "Atualizar agora" para puxar o perfil pela primeira vez.</p></div>'));
    }

    const searchBox = el(`
      <div class="search-box">
        <input type="text" id="igQuery" placeholder="Buscar nas postagens (palavra-chave)…">
        <button class="btn" id="igSearchBtn">Buscar</button>
      </div>
    `);
    body.appendChild(searchBox);
    const resultsHost = el('<div></div>');
    body.appendChild(resultsHost);

    if (data && data.latestPosts && data.latestPosts.length) {
      resultsHost.innerHTML = '<h4 style="margin:18px 0 10px;font-size:13px;color:var(--text-300);text-transform:uppercase;letter-spacing:0.5px">Últimos posts</h4>';
      const grid = el('<div class="ig-posts"></div>');
      data.latestPosts.forEach(p => grid.appendChild(postTile(p)));
      resultsHost.appendChild(grid);
    }

    const doSearch = async () => {
      const q = searchBox.querySelector('#igQuery').value.trim();
      if (!q) return;
      const btn = searchBox.querySelector('#igSearchBtn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      resultsHost.innerHTML = '<div class="empty-state"><div class="spinner"></div><p style="margin-top:10px">Buscando…</p></div>';
      try {
        const r = await api('/api/instagram/search', { method: 'POST', body: JSON.stringify({ query: q }) });
        resultsHost.innerHTML = `<h4 style="margin:18px 0 10px;font-size:13px;color:var(--text-300);text-transform:uppercase;letter-spacing:0.5px">${r.matches.length} resultado(s) para "${fmt.escape(q)}" — ${r.total_scanned} posts varridos</h4>`;
        if (r.matches.length === 0) {
          resultsHost.appendChild(el('<div class="empty-state"><p>Nenhum post bateu com essa busca.</p></div>'));
        } else {
          const grid = el('<div class="ig-posts"></div>');
          r.matches.forEach(p => grid.appendChild(postTile(p)));
          resultsHost.appendChild(grid);
        }
      } catch (e) {
        resultsHost.innerHTML = `<div class="alert">Erro: ${fmt.escape(e.message)}</div>`;
      } finally {
        btn.disabled = false; btn.textContent = 'Buscar';
      }
    };
    searchBox.querySelector('#igSearchBtn').addEventListener('click', doSearch);
    searchBox.querySelector('#igQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  }

  function postTile(p) {
    const url = p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : '#');
    const img = p.displayUrl || '';
    const tile = el(`
      <a class="ig-post" href="${fmt.escape(url)}" target="_blank" rel="noopener">
        ${img ? `<img src="${fmt.escape(img)}" alt="" loading="lazy">` : '<div style="width:100%;height:100%;display:grid;place-items:center;color:var(--text-500);font-size:24px">📷</div>'}
        <div class="ig-post-meta">
          <span>♥ ${fmt.num(p.likesCount)}</span>
          <span>💬 ${fmt.num(p.commentsCount)}</span>
        </div>
      </a>
    `);
    return tile;
  }

  init();
})();
