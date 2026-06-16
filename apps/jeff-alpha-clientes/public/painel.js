(function(){
'use strict';

const init = window.__INITIAL__ || { blocks: [], state: { answers: {}, actions: {} }, client_name: '' };
const blocks = init.blocks || [];
const state = init.state || { answers: {}, actions: {} };
const isAdmin = !!init.adminMode;

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function groupByTab(blocks) {
  const groups = [];
  let cur = null;
  for (const b of blocks) {
    if (b.kind === 'tab') {
      cur = { id: b.id, title: b.title || 'Sem título', items: [] };
      groups.push(cur);
    } else {
      if (!cur) {
        cur = { id: '_intro', title: 'Início', items: [] };
        groups.push(cur);
      }
      cur.items.push(b);
    }
  }
  return groups;
}

const groups = groupByTab(blocks);

const tabsEl = document.getElementById('tabs');
const contentEl = document.getElementById('content');
const popupEl = document.getElementById('popup');

let activeTab = null; // tela principal abre vazia; só mostra os cards quando clicar em "Início"

// ===== Widget de upload de documentos =====
function uploadEndpoints(scope) {
  if (init.uploadBaseUrl) {
    return {
      list: init.uploadBaseUrl + '?scope=' + encodeURIComponent(scope),
      upload: init.uploadBaseUrl,
      download: function(id){ return init.uploadBaseUrl + '/' + id; },
      del: function(id){ return init.uploadBaseUrl + '/' + id + '/delete'; },
      canDelete: function(){ return true; },
    };
  }
  return {
    list: '/api/uploads?scope=' + encodeURIComponent(scope),
    upload: '/api/upload',
    download: function(id){ return '/uploads/' + id; },
    del: function(id){ return '/uploads/' + id + '/delete'; },
    canDelete: function(u){ return (u.uploaded_by_kind === 'client'); },
  };
}

function fmtBytes(b){
  if (b > 1048576) return (b/1048576).toFixed(1) + ' MB';
  if (b > 1024) return Math.round(b/1024) + ' KB';
  return (b||0) + ' B';
}

function renderUploadWidget(scope){
  const isPreview = !!init.previewMode;
  return `
    <div class="upload-widget" data-scope="${escapeHtml(scope)}" style="margin-top:28px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 22px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <h3 style="margin:0;font-size:15px;color:var(--fg);letter-spacing:-.01em">Documentos</h3>
        ${isPreview ? '<span style="font-size:11px;color:var(--highlight)">preview — upload desativado</span>' : `
          <label class="upload-btn" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--accent-soft);border:1px solid var(--accent-line);color:var(--accent);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">
            <span>+ Subir arquivo</span>
            <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display:none" data-upload-input>
          </label>
        `}
      </div>
      <div data-upload-status style="font-size:12px;color:var(--fg-3);margin-bottom:10px;min-height:16px"></div>
      <div data-upload-list style="display:flex;flex-direction:column;gap:6px"></div>
    </div>`;
}

function mountUploadWidget(scope){
  const widget = contentEl.querySelector(`.upload-widget[data-scope="${scope}"]`);
  if (!widget) return;
  const ep = uploadEndpoints(scope);
  const listEl = widget.querySelector('[data-upload-list]');
  const statusEl = widget.querySelector('[data-upload-status]');
  const fileInput = widget.querySelector('[data-upload-input]');

  function renderList(uploads){
    if (!uploads.length) {
      listEl.innerHTML = '<div style="color:var(--fg-3);font-size:13px;padding:10px 0">Nenhum arquivo ainda.</div>';
      return;
    }
    listEl.innerHTML = uploads.map(u => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-2);border:1px solid var(--line);border-radius:8px">
        <span style="flex-shrink:0;font-size:18px">📄</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(u.original_name || ('arquivo ' + u.id))}</div>
          <div style="font-size:11px;color:var(--fg-3)">${fmtBytes(u.size)} · ${escapeHtml(u.uploaded_at || '')} · ${u.uploaded_by_kind === 'client' ? 'cliente' : 'equipe'}</div>
        </div>
        <a href="${ep.download(u.id)}" target="_blank" style="font-size:12px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;color:var(--fg-2);text-decoration:none">Baixar</a>
        ${ep.canDelete(u) ? `<button data-del="${u.id}" style="font-size:12px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--fg-3);cursor:pointer">×</button>` : ''}
      </div>
    `).join('');
    listEl.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remover este arquivo?')) return;
        const id = btn.getAttribute('data-del');
        const r = await fetch(ep.del(id), { method: 'POST' });
        const j = await r.json();
        if (j.ok) loadList();
        else alert('Erro: ' + (j.error || 'falhou'));
      });
    });
  }

  async function loadList(){
    if (init.previewMode) { renderList([]); return; }
    try {
      const r = await fetch(ep.list);
      const j = await r.json();
      renderList(j.uploads || []);
    } catch(e) { statusEl.textContent = 'Erro ao listar: ' + e.message; }
  }

  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (f.size > 30 * 1024 * 1024) { statusEl.textContent = 'Arquivo grande demais (max 30 MB).'; return; }
      const fd = new FormData();
      fd.append('file', f);
      fd.append('scope', scope);
      statusEl.textContent = 'Enviando ' + f.name + '...';
      try {
        const r = await fetch(ep.upload, { method: 'POST', body: fd });
        const j = await r.json();
        if (j.ok) {
          statusEl.textContent = 'Enviado.';
          fileInput.value = '';
          loadList();
          setTimeout(() => { statusEl.textContent = ''; }, 2500);
        } else {
          statusEl.textContent = 'Erro: ' + (j.error || 'falhou');
        }
      } catch(e) { statusEl.textContent = 'Erro: ' + e.message; }
    });
  }

  loadList();
}

// Botões fixos da sidebar (navegação principal). "Início" abre o grupo home (cards do template).
const SIDEBAR_BUTTONS = [
  { id: 'sb_estrategia',         label: 'Estratégia' },
  { id: 'sb_inicio',             label: 'Início', isHome: true },
  { id: 'sb_whatsapp',           label: 'Whatsapp' },
  { id: 'sb_telegram',           label: 'Telegram' },
  { id: 'sb_instagram_facebook', label: 'Instagram e Facebook' },
  { id: 'sb_youtube',            label: 'Youtube' },
  { id: 'sb_tiktok',             label: 'Tiktok' },
  { id: 'sb_linkedin',           label: 'Linkedin' },
  { id: 'sb_email_mkt',          label: 'E-mail Mkt' },
  { id: 'sb_cadastrar_rede',     label: 'Cadastrar nova rede', isAction: true },
  { id: 'sb_agente_lia',         label: 'Agente Lia' },
];

function renderTabs() {
  tabsEl.innerHTML = '';
  if (!groups.length) return;
  const homeGroupId = groups[0].id;
  SIDEBAR_BUTTONS.forEach(b => {
    const el = document.createElement('div');
    const isActive = (b.isHome && activeTab === homeGroupId) || (!b.isHome && activeTab === b.id);
    el.className = 'side-tab' + (isActive ? ' active' : '');
    el.innerHTML = `<span>${escapeHtml(b.label)}</span>`;
    el.addEventListener('click', () => {
      activeTab = b.isHome ? homeGroupId : b.id;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    tabsEl.appendChild(el);
  });
}

function renderHomeGrid() {
  const sec = document.createElement('section');
  sec.className = 'home-wrap';
  const cards = groups.slice(1);
  sec.innerHTML = `
    <div class="home-hero">
      <span class="home-client">${escapeHtml(init.client_name || '')}</span>
      <h1 class="home-title">Posicionamento Arquetípico<br>e Estratégias de Posicionamento</h1>
    </div>
    <div class="home-grid">
      ${cards.map(gr => `
        <div class="home-card" data-gid="${escapeHtml(gr.id)}">
          <span class="home-card-label">${escapeHtml(gr.title)}</span>
          <span class="home-card-arrow">&#8594;</span>
        </div>
      `).join('')}
    </div>
    ${renderUploadWidget('inicio')}`;
  sec.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', () => {
      activeTab = card.getAttribute('data-gid');
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  contentEl.appendChild(sec);
  mountUploadWidget('inicio');
}

function renderContent() {
  contentEl.innerHTML = '';
  if (!groups.length) {
    contentEl.innerHTML = `<div style="padding:60px 0;text-align:center;color:var(--fg-3)">
      <h2 style="color:var(--fg-3);margin:0 0 8px">Painel em construção</h2>
      <p>Sua consultora está montando o conteúdo personalizado pra você. Volte em breve.</p>
    </div>`;
    return;
  }
  // Tela principal abre vazia. Cards aparecem só ao clicar em "Início" na lateral.
  if (activeTab === null) {
    contentEl.innerHTML = `<div style="padding:120px 24px;text-align:center">
      <h2 style="color:var(--fg-3);font-weight:500;margin:0 0 12px;font-size:22px">Bem-vindo${init.client_name ? ', ' + escapeHtml(init.client_name) : ''}.</h2>
      <p style="color:var(--fg-3);font-size:14px;margin:0">Clique em qualquer botão da lateral para começar.</p>
    </div>`;
    return;
  }

  // Botões fixos da sidebar (Estratégia, Whatsapp, Agente Lia, etc) — telas em construção
  const sb = (typeof SIDEBAR_BUTTONS !== 'undefined') ? SIDEBAR_BUTTONS.find(x => x.id === activeTab && !x.isHome) : null;
  if (sb) {
    if (sb.id === 'sb_estrategia') {
      contentEl.innerHTML = `<section class="tab-section">
        <h2>Estratégia</h2>
        ${renderUploadWidget('estrategia')}
      </section>`;
      mountUploadWidget('estrategia');
    } else if (sb.isAction) {
      contentEl.innerHTML = `<section class="tab-section">
        <h2>${escapeHtml(sb.label)}</h2>
        <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:32px;text-align:center;color:var(--fg-3)">
          <p style="margin:0 0 14px">Funcionalidade em construção.</p>
          <p style="margin:0;font-size:13px">Vai abrir um formulário pra cadastrar nova rede social no painel.</p>
        </div>
      </section>`;
    } else {
      contentEl.innerHTML = `<section class="tab-section">
        <h2>${escapeHtml(sb.label)}</h2>
        <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:32px;text-align:center;color:var(--fg-3)">
          <p style="margin:0">Conteúdo de <b style="color:var(--fg-2)">${escapeHtml(sb.label)}</b> em construção.</p>
        </div>
      </section>`;
    }
    return;
  }

  const g = groups.find(x => x.id === activeTab) || groups[0];

  // Início (primeiro grupo, sem conteúdo) → renderiza home grid
  if (g === groups[0] && groups.length > 1 && g.items.length === 0) {
    renderHomeGrid();
    return;
  }

  const sec = document.createElement('section');
  sec.className = 'tab-section';
  let html = `<h2>${escapeHtml(g.title)}</h2>`;
  for (const b of g.items) {
    if (b.kind === 'text') {
      html += `<div class="block-text" data-search-text="${escapeHtml(b.text||'')}">${linkifyHighlights(escapeHtml(b.text||''))}</div>`;
    } else if (b.kind === 'highlight') {
      // highlights inline são gerenciados pelo linkifyHighlights — bloco standalone também
      html += `<div class="block-text"><span class="hl" data-popup="${escapeHtml(b.popup||'')}">${escapeHtml(b.term||'')}</span></div>`;
    } else if (b.kind === 'question') {
      const prev = (state.answers && state.answers[b.id]) || '';
      if (isAdmin) {
        html += `<div class="qcard" data-search-text="${escapeHtml((b.text||'') + ' ' + prev)}">
          <div class="q-text"><span class="q-icon">⚠️</span>${escapeHtml(b.text||'')}</div>
          ${prev ? `<div style="background:var(--bg-2);border:1px solid var(--line);border-radius:8px;padding:12px;white-space:pre-wrap;color:var(--fg)">${escapeHtml(prev)}</div>` : `<div style="font-style:italic;color:var(--fg-3);font-size:13px">— ainda não respondida —</div>`}
        </div>`;
      } else {
        html += `<div class="qcard" data-search-text="${escapeHtml((b.text||'') + ' ' + prev)}">
          <div class="q-text"><span class="q-icon">⚠️</span>${escapeHtml(b.text||'')}</div>
          <textarea data-q="${escapeHtml(b.id)}" placeholder="Sua resposta...">${escapeHtml(prev)}</textarea>
          <div class="q-actions">
            <button class="q-save" data-save="${escapeHtml(b.id)}">Salvar resposta</button>
            <span class="q-status" id="qs_${escapeHtml(b.id)}"></span>
          </div>
        </div>`;
      }
    } else if (b.kind === 'action' && isAdmin) {
      const done = (state.actions && state.actions[b.id] && state.actions[b.id].value === 'done');
      html += `<label class="acard ${done?'done':''}" data-search-text="${escapeHtml(b.text||'')}">
        <input type="checkbox" data-action="${escapeHtml(b.id)}" ${done?'checked':''}>
        <span class="a-icon">✓</span>
        <span class="a-text">${escapeHtml(b.text||'')}</span>
      </label>`;
    }
  }
  sec.innerHTML = html;
  contentEl.appendChild(sec);
}

function linkifyHighlights(html) {
  // os destaques são blocos próprios; sem auto-detection inline por enquanto
  return html;
}

function render() {
  renderTabs();
  renderContent();
}

// popup destaque
contentEl.addEventListener('mouseenter', (ev) => {
  const t = ev.target.closest && ev.target.closest('.hl');
  if (!t) return;
  const txt = t.getAttribute('data-popup');
  if (!txt) return;
  popupEl.textContent = txt;
  const r = t.getBoundingClientRect();
  popupEl.style.left = (r.left) + 'px';
  popupEl.style.top = (r.bottom + 8) + 'px';
  popupEl.classList.remove('hidden');
}, true);
contentEl.addEventListener('mouseleave', (ev) => {
  if (ev.target.closest && ev.target.closest('.hl')) popupEl.classList.add('hidden');
}, true);

// salvar resposta
contentEl.addEventListener('click', async (ev) => {
  const btn = ev.target.closest && ev.target.closest('button.q-save');
  if (!btn) return;
  const blockId = btn.getAttribute('data-save');
  const ta = contentEl.querySelector(`textarea[data-q="${CSS.escape(blockId)}"]`);
  if (!ta) return;
  const status = document.getElementById('qs_' + blockId);
  status.className = 'q-status saving'; status.textContent = 'Salvando...';
  btn.disabled = true;
  try {
    const r = await fetch('/api/answer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_id: blockId, value: ta.value })
    });
    const j = await r.json();
    if (!j.ok) throw new Error('save failed');
    state.answers[blockId] = ta.value;
    status.className = 'q-status saved'; status.textContent = 'Salvo';
    setTimeout(() => { status.textContent = ''; status.className = 'q-status'; }, 2500);
  } catch(e) {
    status.className = 'q-status error'; status.textContent = 'Erro: ' + e.message;
  } finally { btn.disabled = false; }
});

// admin: marcar acao
if (isAdmin) {
  contentEl.addEventListener('change', async (ev) => {
    const cb = ev.target.closest && ev.target.matches('input[type=checkbox][data-action]') ? ev.target : null;
    if (!cb) return;
    const id = cb.getAttribute('data-action');
    const done = cb.checked;
    cb.closest('.acard').classList.toggle('done', done);
    const url = init.actionUrl || '/painel/action';
    try {
      await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ block_id: id, done }) });
      state.actions[id] = { value: done ? 'done' : '' };
    } catch(e) { console.error(e); }
  });
}

// busca
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const searchResults = document.getElementById('search-results');
function buildIndex() {
  const idx = [];
  groups.forEach(g => {
    g.items.forEach(b => {
      let text = '';
      if (b.kind === 'text') text = b.text || '';
      else if (b.kind === 'highlight') text = (b.term || '') + ' — ' + (b.popup || '');
      else if (b.kind === 'question') text = (b.text || '') + ' ' + ((state.answers && state.answers[b.id]) || '');
      else if (b.kind === 'action' && isAdmin) text = b.text || '';
      if (text.trim()) idx.push({ groupId: g.id, groupTitle: g.title, blockId: b.id, kind: b.kind, text });
    });
  });
  return idx;
}
const searchIdx = buildIndex();
function highlight(s, q) {
  if (!q) return escapeHtml(s);
  const re = new RegExp('(' + q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + ')', 'gi');
  return escapeHtml(s).replace(re, '<mark>$1</mark>');
}
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (!q) { searchResults.hidden = true; searchResults.innerHTML = ''; searchClear.hidden = true; return; }
    searchClear.hidden = false;
    const lower = q.toLowerCase();
    const hits = searchIdx.filter(it => it.text.toLowerCase().includes(lower)).slice(0, 12);
    if (!hits.length) {
      searchResults.innerHTML = '<div class="search-result" style="color:var(--fg-3)">Nada encontrado.</div>';
      searchResults.hidden = false;
      return;
    }
    searchResults.innerHTML = hits.map(h => {
      const i = h.text.toLowerCase().indexOf(lower);
      const start = Math.max(0, i - 30);
      const snippet = (start > 0 ? '...' : '') + h.text.slice(start, start + 120) + (h.text.length > start+120 ? '...' : '');
      return `<div class="search-result" data-go="${escapeHtml(h.groupId)}::${escapeHtml(h.blockId)}">
        <div style="color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">${escapeHtml(h.groupTitle)}</div>
        <div>${highlight(snippet, q)}</div>
      </div>`;
    }).join('');
    searchResults.hidden = false;
  });
  searchClear.addEventListener('click', () => { searchInput.value = ''; searchResults.hidden = true; searchClear.hidden = true; searchInput.focus(); });
  searchResults.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-go]');
    if (!t) return;
    const [gid, bid] = t.getAttribute('data-go').split('::');
    activeTab = gid; render();
    setTimeout(() => {
      const tas = document.querySelectorAll(`[data-q="${CSS.escape(bid)}"], [data-action="${CSS.escape(bid)}"]`);
      const block = tas[0] ? tas[0].closest('.qcard, .acard') : contentEl.querySelector(`[data-search-text]`);
      if (block) {
        block.classList.add('search-hit');
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => block.classList.remove('search-hit'), 1800);
      }
      searchResults.hidden = true;
    }, 50);
  });
}

render();
})();
