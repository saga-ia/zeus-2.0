
const STAGES = window.STAGES;
let allLeads = [];
let currentView = 'kanban';
let modalLead = null;
let kanbanFilter = 'all';
let metricsFilter = 'all';
let dragPhone = null;
const CIRC = 2 * Math.PI * 70;

// Helpers case-insensitive
function platHas(l, code) {
  return (l['Plataforma (FB/IG)'] || '').toUpperCase().includes(code.toUpperCase());
}
function isDono(l) {
  return (l['Dono de Clinica'] || '').toLowerCase().startsWith('sim');
}

// ── VIEW TOGGLE ──────────────────────────────────────────────────────────────
function setView(v) {
  currentView = v;
  document.getElementById('view-table').style.display = v === 'list' ? 'block' : 'none';
  document.getElementById('view-kanban').style.display = v === 'kanban' ? 'block' : 'none';
  document.getElementById('btn-view-list').classList.toggle('active', v === 'list');
  document.getElementById('btn-view-kanban').classList.toggle('active', v === 'kanban');
  if (v === 'kanban' && allLeads.length) { initFilterTabs(); renderKanban(allLeads); }
}

// ── DATA ─────────────────────────────────────────────────────────────────────
async function loadLeads() {
  document.getElementById('leads-body').innerHTML = '<tr><td colspan="13" class="loading"><div class="spin"></div><br>Carregando...</td></tr>';
  document.getElementById('kanban-board').innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-500)"><div class="spin"></div><br>Carregando leads...</div>';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const r = await fetch('/api/leads', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) {
      throw new Error('Sessao expirada. Faca login novamente.');
    }
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Erro ao carregar leads');
    allLeads = data.leads || [];
    buildFilters();
    updateStats(allLeads);
    applyFilters();
    initFilterTabs();
    if (currentView === 'kanban') renderKanban(allLeads);
  } catch(e) {
    const msg = e.name === 'AbortError' ? 'Tempo esgotado. Clique em Atualizar para tentar de novo.' : e.message;
    console.error('loadLeads error:', msg);
    document.getElementById('leads-body').innerHTML = '<tr><td colspan="13" class="empty">' + msg + '</td></tr>';
    document.getElementById('kanban-board').innerHTML = '<div style="padding:60px;text-align:center;color:#f87171;font-size:14px">' + msg + '<br><br><button onclick="loadLeads()" style="padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(124,77,255,0.2);color:#c4b5fd;cursor:pointer;font-family:inherit">Tentar novamente</button></div>';
  }
}

// ── KANBAN ───────────────────────────────────────────────────────────────────
function initFilterTabs() {
  const el = document.getElementById('k-filter-tabs');
  if (!el) return;
  const all = [{key:'all', label:'Todas', color:'#8e85ad'}].concat(STAGES);
  el.innerHTML = all.map(s => `
    <button class="k-filter-tab${kanbanFilter===s.key?' active':''}"
      data-stage="${s.key}" onclick="setKanbanFilter('${s.key}')">${s.label}</button>
  `).join('');
}

function setKanbanFilter(key) {
  kanbanFilter = key;
  document.querySelectorAll('.k-filter-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.stage === key);
  });
  renderKanban(allLeads);
}

function renderKanban(leads) {
  const board = document.getElementById('kanban-board');
  const visibleLeads = kanbanFilter === 'all' ? leads : leads.filter(l => (l._stage || 'novo_lead') === kanbanFilter);
  const byStage = {};
  STAGES.forEach(s => { byStage[s.key] = []; });
  visibleLeads.forEach(l => {
    const st = l._stage || 'novo_lead';
    if (byStage[st]) byStage[st].push(l); else byStage['novo_lead'].push(l);
  });

  board.innerHTML = STAGES.map(s => {
    const cards = byStage[s.key];
    const cardHtml = cards.length
      ? cards.map(l => {
          const ph = l._phone_key || '';
          return `
          <div class="k-card" draggable="true" ondragstart="dragStart(event,'${ph}')" onclick="openModal(${JSON.stringify(l).replace(/"/g,'&quot;')})">
            <div class="k-card-name">${esc(l['Nome'])}</div>
            <div class="k-card-phone">${esc(l['Telefone'])}</div>
            <div class="k-card-email">${esc(l['Email'])}</div>
            <div class="k-card-date" title="Cadastro">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${esc(l['Data/Hora (BRT)']) || 'sem data'}
            </div>
            <div class="k-card-actions" onclick="event.stopPropagation()">
              <button class="k-btn k-btn-wa" onclick="openWhatsApp('${ph}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                WhatsApp
              </button>
              <button class="k-btn k-btn-copy" onclick="copyPhone('${ph}', event)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                Copiar
              </button>
            </div>
          </div>`;
        }).join('')
      : `<div style="padding:20px;text-align:center;color:var(--text-500);font-size:12px">Sem leads</div>`;

    return `<div class="k-col">
      <div class="k-col-header">
        <div class="k-dot" style="background:${s.color}"></div>
        <div class="k-col-title">${s.label}</div>
        <div class="k-badge">${cards.length}</div>
      </div>
      <div class="k-cards" ondragover="event.preventDefault()" ondragenter="dragEnter(event,'${s.key}')" ondragleave="dragLeave(event)" ondrop="dragDrop(event,'${s.key}')">${cardHtml}</div>
    </div>`;
  }).join('');
}

function openWhatsApp(phone) {
  const ph = phone.replace(/\D/g, '');
  const waNum = (ph.startsWith('55') && ph.length >= 12) ? ph : '55' + ph;
  const lead = allLeads.find(l => l._phone_key === phone);
  if (lead && lead._stage === 'novo_lead') {
    fetch('/api/kanban/move', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({phone, stage:'inicio_atendimento'})
    }).then(() => {
      lead._stage = 'inicio_atendimento';
      renderKanban(allLeads);
    });
  }
  window.open('https://wa.me/' + waNum, '_blank');
}

function copyPhone(phone, event) {
  event.stopPropagation();
  const btn = event.currentTarget;
  navigator.clipboard.writeText(phone).then(() => {
    const orig = btn.innerHTML;
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  });
}

function toggleExport() {
  const menu = document.getElementById('export-menu');
  menu.classList.toggle('open');
}

function exportContacts(stage) {
  document.getElementById('export-menu').classList.remove('open');
  const leads = stage === 'all' ? allLeads : allLeads.filter(l => (l._stage||'novo_lead') === stage);
  const cols = ['Nome','Telefone','Email','Nome da Clinica','Dono de Clinica','Segmento','Cidade','Estado','Regiao','Plataforma (FB/IG)','Etapa'];
  const rows = [cols.join(';')];
  leads.forEach(l => {
    const st = STAGE_MAP[l._stage] || STAGE_MAP['novo_lead'];
    const vals = cols.slice(0,-1).map(h => '"' + (l[h]||'').replace(/"/g,'""') + '"');
    vals.push('"' + st.label + '"');
    rows.push(vals.join(';'));
  });
  const blob = new Blob(['﻿' + rows.join('\\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leads-cigc-' + (stage==='all'?'todos':stage) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── MOVE MODAL ───────────────────────────────────────────────────────────────
function openModal(lead) {
  modalLead = lead;
  document.getElementById('modal-name').textContent = lead['Nome'] || 'Lead';
  const dt = lead['Data/Hora (BRT)'] || '';
  document.getElementById('modal-sub').textContent =
    (lead['Telefone'] || '') + (dt ? '  ·  cadastrado em ' + dt : '');

  const list = document.getElementById('stage-list');
  list.innerHTML = STAGES.map(s => `
    <div class="stage-opt${lead._stage === s.key ? ' current' : ''}" onclick="moveLead('${s.key}')">
      <div class="stage-opt-dot" style="background:${s.color}"></div>
      <span class="stage-opt-label">${s.label}</span>
    </div>`).join('');

  document.getElementById('move-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('move-modal').classList.remove('open');
  modalLead = null;
}

async function moveLead(stage) {
  if (!modalLead) return;
  const phone = modalLead._phone_key;
  closeModal();
  try {
    await fetch('/api/kanban/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, stage })
    });
    // Update local state
    allLeads.forEach(l => { if (l._phone_key === phone) l._stage = stage; });
    applyFilters();
    if (currentView === 'kanban') renderKanban(allLeads);
  } catch(e) { console.error(e); }
}

document.getElementById('move-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('move-modal')) closeModal();
});

// ── TABLE ────────────────────────────────────────────────────────────────────
function buildFilters() {
  const regioes = [...new Set(allLeads.map(l => l['Regiao']).filter(Boolean))].sort();
  const estados = [...new Set(allLeads.map(l => l['Estado']).filter(Boolean))].sort();
  const segmentos = [...new Set(allLeads.map(l => l['Segmento']).filter(Boolean))].sort();

  const populate = (id, list) => {
    const sel = document.getElementById(id);
    const first = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(first);
    list.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  };
  populate('filter-regiao', regioes);
  populate('filter-estado', estados);
  populate('filter-segmento', segmentos);
}

function updateStats(leads) {
  document.getElementById('stat-total').textContent = leads.length;
  document.getElementById('stat-fb').textContent = leads.filter(l => platHas(l,'FB')).length;
  document.getElementById('stat-ig').textContent = leads.filter(l => platHas(l,'IG')).length;
  document.getElementById('stat-donos').textContent = leads.filter(isDono).length;
  document.getElementById('stat-estados').textContent = new Set(leads.map(l => l['Estado']).filter(Boolean)).size;
  document.getElementById('stat-cidades').textContent = new Set(leads.map(l => l['Cidade']).filter(Boolean)).size;
}

function applyFilters() {
  const q = document.getElementById('search').value.toLowerCase();
  const plat = document.getElementById('filter-plataforma').value;
  const regiao = document.getElementById('filter-regiao').value;
  const estado = document.getElementById('filter-estado').value;
  const seg = document.getElementById('filter-segmento').value;
  const dono = document.getElementById('filter-dono').value;
  const stageF = document.getElementById('filter-stage').value;

  const filtered = allLeads.filter(l => {
    const searchable = [l['Nome'],l['Email'],l['Telefone'],l['Nome da Clinica'],l['Cidade']].join(' ').toLowerCase();
    if (q && !searchable.includes(q)) return false;
    if (plat && !platHas(l, plat)) return false;
    if (regiao && l['Regiao'] !== regiao) return false;
    if (estado && l['Estado'] !== estado) return false;
    if (seg && l['Segmento'] !== seg) return false;
    if (dono) {
      const d = isDono(l);
      if (dono === 'Sim' && !d) return false;
      if (dono === 'Nao' && d) return false;
    }
    if (stageF && (l._stage||'novo_lead') !== stageF) return false;
    return true;
  });

  renderTable(filtered);
  document.getElementById('table-count').textContent = filtered.length + ' de ' + allLeads.length + ' leads';
}

const STAGE_MAP = {};
STAGES.forEach(s => { STAGE_MAP[s.key] = s; });

function renderTable(leads) {
  if (!leads.length) {
    document.getElementById('leads-body').innerHTML = '<tr><td colspan="13" class="empty">Nenhum lead encontrado</td></tr>';
    return;
  }
  const rows = leads.map(l => {
    const plat = (l['Plataforma (FB/IG)'] || '').toUpperCase();
    const conn = l['Conexao (WiFi/5G)'] || '';
    const dono = l['Dono de Clinica'] || '';
    const platTag = plat.includes('FB') ? '<span class="tag tag-fb">FB</span>' : plat.includes('IG') ? '<span class="tag tag-ig">IG</span>' : esc(plat);
    const connTag = conn.includes('WiFi') ? '<span class="tag tag-wifi">WiFi</span>' : conn.includes('5G') ? '<span class="tag tag-5g">5G</span>' : esc(conn);
    const donoTag = dono.toLowerCase().startsWith('sim') ? '<span class="tag tag-sim">Sim</span>' : dono ? '<span class="tag tag-nao">Nao</span>' : '';
    const st = STAGE_MAP[l._stage] || STAGE_MAP['novo_lead'];
    const stageTag = `<span class="tag" style="background:${st.color}22;color:${st.color}">${st.label}</span>`;
    return `<tr>
      <td>${esc(l['Nome'])}</td>
      <td>${esc(l['Telefone'])}</td>
      <td>${esc(l['Nome da Clinica'])}</td>
      <td>${donoTag}</td>
      <td>${esc(l['Segmento'])}</td>
      <td>${esc(l['Cidade'])}</td>
      <td>${esc(l['Estado'])}</td>
      <td>${esc(l['Regiao'])}</td>
      <td>${platTag}</td>
      <td>${connTag}</td>
      <td>${esc(l['Posicionamento'])}</td>
      <td>${stageTag}</td>
      <td>${esc(l['Data/Hora (BRT)'])}</td>
    </tr>`;
  }).join('');
  document.getElementById('leads-body').innerHTML = rows;
}

// ── METRICS ──────────────────────────────────────────────────────────────────
function buildGauge(label, display, pct, colorStart, colorEnd, sub) {
  const dash = Math.max(0, Math.min(pct / 100, 1)) * CIRC;
  const id = 'g' + Math.random().toString(36).slice(2);
  return `<div class="gauge-item">
    <svg width="180" height="180" viewBox="0 0 180 180">
      <defs>
        <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colorStart}"/>
          <stop offset="100%" stop-color="${colorEnd}"/>
        </linearGradient>
      </defs>
      <circle cx="90" cy="90" r="70" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14"/>
      <circle cx="90" cy="90" r="70" fill="none" stroke="url(#${id})" stroke-width="14"
        stroke-dasharray="${dash.toFixed(2)} ${CIRC.toFixed(2)}"
        transform="rotate(-90,90,90)"
        stroke-linecap="round"/>
      <text x="90" y="84" text-anchor="middle" fill="#f8f6ff" font-size="24" font-weight="800" font-family="Inter,sans-serif">${display}</text>
      <text x="90" y="108" text-anchor="middle" fill="#8e85ad" font-size="13" font-family="Inter,sans-serif">${pct.toFixed(1)}%</text>
    </svg>
    <div class="gauge-label">${label}</div>
    ${sub ? `<div class="gauge-sub">${sub}</div>` : ''}
  </div>`;
}

function buildTopList(title, items, color) {
  if (!items.length) return '';
  const max = items[0].count;
  const rows = items.slice(0, 6).map((it, i) => {
    const w = max > 0 ? (it.count / max * 100).toFixed(1) : 0;
    return `<div class="top-row">
      <span class="top-rank">${i+1}</span>
      <span class="top-name">${esc(it.name)}</span>
      <div class="top-bar-wrap"><div class="top-bar" style="width:${w}%;background:${color}"></div></div>
      <span class="top-val">${it.count}</span>
    </div>`;
  }).join('');
  return `<div class="top-card"><h3>${title}</h3>${rows}</div>`;
}

function topN(arr, key) {
  const map = {};
  arr.forEach(l => { const v = l[key] || 'N/A'; map[v] = (map[v] || 0) + 1; });
  return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
}

function openMetrics() {
  if (!allLeads.length) { alert('Carregue os leads primeiro.'); return; }
  metricsFilter = 'all';
  const tabs = document.getElementById('metrics-filter-tabs');
  if (tabs) {
    const defs = [
      {key:'all', label:'Todos'},
      {key:'fb', label:'Facebook'},
      {key:'ig', label:'Instagram'},
      {key:'dono', label:'Donos de Clinica'},
    ];
    tabs.innerHTML = defs.map(d =>
      `<button class="m-filter-tab${metricsFilter===d.key?' active':''}" data-f="${d.key}" onclick="setMetricsFilter('${d.key}')">${d.label}</button>`
    ).join('');
  }
  renderMetrics(allLeads);
  document.getElementById('metrics-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function setMetricsFilter(key) {
  metricsFilter = key;
  document.querySelectorAll('.m-filter-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.f === key);
  });
  renderMetrics(applyMetricsFilter());
}

function applyMetricsFilter() {
  if (metricsFilter === 'fb')   return allLeads.filter(l => platHas(l,'FB'));
  if (metricsFilter === 'ig')   return allLeads.filter(l => platHas(l,'IG'));
  if (metricsFilter === 'dono') return allLeads.filter(isDono);
  return allLeads;
}

function closeMetrics() {
  document.getElementById('metrics-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMetrics(); closeModal(); document.getElementById('export-menu').classList.remove('open'); } });
document.addEventListener('click', e => {
  const wrap = document.getElementById('export-wrap');
  if (wrap && !wrap.contains(e.target)) document.getElementById('export-menu').classList.remove('open');
});

function renderMetrics(leads) {
  const n = leads.length;
  document.getElementById('m-total').textContent = metricsFilter === 'all' ? n : `${n} / ${allLeads.length}`;

  const pctFB = n ? leads.filter(l=>platHas(l,'FB')).length / n * 100 : 0;
  const pctIG = n ? leads.filter(l=>platHas(l,'IG')).length / n * 100 : 0;
  const pctDono = n ? leads.filter(isDono).length / n * 100 : 0;
  const pctWifi = n ? leads.filter(l=>(l['Conexao (WiFi/5G)']||'').toLowerCase().includes('wifi')).length / n * 100 : 0;
  const pct5G = n ? leads.filter(l=>(l['Conexao (WiFi/5G)']||'').toLowerCase().includes('5g')).length / n * 100 : 0;
  const pctEmail = n ? leads.filter(l=>l['Email'] && l['Email'].includes('@')).length / n * 100 : 0;
  const topEstado = topN(leads, 'Estado')[0];
  const pctTopEstado = (topEstado && n) ? topEstado.count / n * 100 : 0;
  const topRegiao = topN(leads, 'Regiao')[0];
  const pctTopRegiao = (topRegiao && n) ? topRegiao.count / n * 100 : 0;

  const gauges = [
    buildGauge('Donos de Clinica', pctDono.toFixed(0)+'%', pctDono, '#7c4dff', '#d6b56a', null),
    buildGauge('Facebook', pctFB.toFixed(0)+'%', pctFB, '#3b82f6', '#60a5fa', null),
    buildGauge('Instagram', pctIG.toFixed(0)+'%', pctIG, '#d946ef', '#e879f9', null),
    buildGauge('WiFi', pctWifi.toFixed(0)+'%', pctWifi, '#22c55e', '#86efac', null),
    buildGauge('5G', pct5G.toFixed(0)+'%', pct5G, '#f97316', '#fdba74', null),
    buildGauge('Email Preenchido', pctEmail.toFixed(0)+'%', pctEmail, '#06b6d4', '#67e8f9', null),
    buildGauge('Top Estado', pctTopEstado.toFixed(0)+'%', pctTopEstado, '#d6b56a', '#f0d08a', topEstado ? topEstado.name : ''),
    buildGauge('Top Regiao', pctTopRegiao.toFixed(0)+'%', pctTopRegiao, '#8b5cf6', '#c4b5fd', topRegiao ? topRegiao.name : ''),
  ];
  document.getElementById('gauges-grid').innerHTML = gauges.join('');

  // Pizza dos estados + lista de contatos do filtro
  ensureExtras();
  document.getElementById('m-pie-section').innerHTML =
    buildPieCard('Distribuicao por Estado', topN(leads, 'Estado'));
  document.getElementById('m-contacts').innerHTML =
    buildContactsCard(leads, metricsFilter);

  const tops = [
    buildTopList('Por Criativo (UTM)', topN(leads,'Criativo (UTM)'), '#d6b56a'),
    buildTopList('Por Cidade', topN(leads,'Cidade'), '#d946ef'),
    buildTopList('Por Regiao', topN(leads,'Regiao'), '#22c55e'),
    buildTopList('Por Segmento', topN(leads,'Segmento'), '#f97316'),
    buildTopList('Por Posicionamento', topN(leads,'Posicionamento'), '#e879f9'),
    buildTopList('Por Dia da Semana', topN(leads,'Dia da Semana'), '#60a5fa'),
  ];
  document.getElementById('top-lists').innerHTML = tops.join('');
}

// ── EXTRA SECTIONS (pizza + contatos) ─────────────────────────────────────────
function ensureExtras() {
  if (document.getElementById('m-extras-style')) return;
  const style = document.createElement('style');
  style.id = 'm-extras-style';
  style.textContent = `
    .m-section{max-width:1200px;margin:0 auto 28px;padding:20px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:14px}
    .m-section h3{font-size:13px;font-weight:700;color:var(--text-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px}
    .m-pie-wrap{display:grid;grid-template-columns:260px 1fr;gap:24px;align-items:center}
    @media(max-width:640px){.m-pie-wrap{grid-template-columns:1fr}}
    .m-pie-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px 16px;max-height:240px;overflow-y:auto}
    .m-pie-legend-item{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-300)}
    .m-pie-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .m-pie-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .m-pie-val{font-weight:700;color:var(--text-100);font-size:11px}
    .m-contacts-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;max-height:420px;overflow-y:auto}
    .m-contact-card{background:rgba(124,77,255,0.06);border:1px solid rgba(124,77,255,0.18);border-radius:10px;padding:10px 12px}
    .m-contact-name{font-size:13px;font-weight:700;color:#f8f6ff;margin-bottom:2px}
    .m-contact-phone{font-size:12px;color:#c4b5fd;margin-bottom:4px}
    .m-contact-meta{font-size:11px;color:var(--text-500);line-height:1.5}
    .m-contact-actions{display:flex;gap:6px;margin-top:8px}
    .m-contact-actions button{flex:1;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:#c4b5fd;font-size:11px;cursor:pointer;font-family:inherit}
    .m-contact-actions button.wa{background:rgba(34,197,94,0.18);color:#86efac;border-color:rgba(34,197,94,0.3)}
    .m-empty{padding:24px;text-align:center;color:var(--text-500);font-size:13px}
  `;
  document.head.appendChild(style);

  const overlay = document.querySelector('#metrics-overlay .metrics-body');
  if (!overlay) return;
  const gauges = document.getElementById('gauges-grid');
  const divider = overlay.querySelector('.divider');

  const pieSec = document.createElement('div');
  pieSec.id = 'm-pie-section';
  pieSec.className = 'm-section';

  const contactsSec = document.createElement('div');
  contactsSec.id = 'm-contacts';
  contactsSec.className = 'm-section';

  if (divider) {
    overlay.insertBefore(pieSec, divider);
    overlay.insertBefore(contactsSec, divider);
  } else {
    gauges.parentNode.insertBefore(pieSec, gauges.nextSibling);
    gauges.parentNode.insertBefore(contactsSec, pieSec.nextSibling);
  }
}

const PIE_COLORS = ['#7c4dff','#d6b56a','#3b82f6','#d946ef','#22c55e','#f97316','#06b6d4','#8b5cf6','#ef4444','#60a5fa','#84cc16','#f59e0b','#ec4899','#14b8a6','#a855f7','#eab308','#10b981','#f43f5e','#0ea5e9','#a3e635','#fb7185','#fbbf24','#34d399','#c084fc','#fda4af','#fdba74','#bef264'];

function buildPieCard(title, items) {
  if (!items.length) return `<h3>${title}</h3><div class="m-empty">Sem dados</div>`;
  const total = items.reduce((s,i)=>s+i.count,0);
  const cx = 130, cy = 130, r = 110;
  let acc = 0;
  const slices = items.map((it, idx) => {
    const frac = it.count / total;
    const startAng = acc * 2 * Math.PI - Math.PI/2;
    const endAng = (acc + frac) * 2 * Math.PI - Math.PI/2;
    acc += frac;
    const x1 = cx + r * Math.cos(startAng), y1 = cy + r * Math.sin(startAng);
    const x2 = cx + r * Math.cos(endAng),   y2 = cy + r * Math.sin(endAng);
    const large = frac > 0.5 ? 1 : 0;
    const color = PIE_COLORS[idx % PIE_COLORS.length];
    if (items.length === 1) {
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
    }
    return `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}" stroke="#0b0617" stroke-width="2">
      <title>${esc(it.name)}: ${it.count} (${(frac*100).toFixed(1)}%)</title>
    </path>`;
  }).join('');
  const legend = items.map((it, idx) => {
    const pct = (it.count / total * 100).toFixed(1);
    const color = PIE_COLORS[idx % PIE_COLORS.length];
    return `<div class="m-pie-legend-item">
      <div class="m-pie-dot" style="background:${color}"></div>
      <span class="m-pie-name" title="${esc(it.name)}">${esc(it.name)}</span>
      <span class="m-pie-val">${it.count} (${pct}%)</span>
    </div>`;
  }).join('');
  return `<h3>${title}</h3>
    <div class="m-pie-wrap">
      <svg width="260" height="260" viewBox="0 0 260 260">${slices}</svg>
      <div class="m-pie-legend">${legend}</div>
    </div>`;
}

function buildContactsCard(leads, filter) {
  const labelMap = { all:'Todos os Contatos', fb:'Contatos via Facebook', ig:'Contatos via Instagram', dono:'Donos de Clinica' };
  const title = labelMap[filter] || 'Contatos';
  if (!leads.length) return `<h3>${title}</h3><div class="m-empty">Nenhum contato neste filtro</div>`;
  const cards = leads.slice(0, 200).map(l => {
    const ph = l._phone_key || (l['Telefone']||'').replace(/\D/g,'');
    const plat = (l['Plataforma (FB/IG)']||'').toUpperCase();
    const platShort = plat.includes('FB') ? 'FB' : plat.includes('IG') ? 'IG' : '-';
    const dono = isDono(l) ? 'Sim' : 'Nao';
    const utm = l['Criativo (UTM)'] || '-';
    return `<div class="m-contact-card">
      <div class="m-contact-name">${esc(l['Nome'])}</div>
      <div class="m-contact-phone">${esc(l['Telefone'])}</div>
      <div class="m-contact-meta">
        ${esc(l['Nome da Clinica']||'sem clinica')} · Dono: ${dono}<br>
        ${esc(l['Cidade']||'-')} / ${esc(l['Estado']||'-')} · ${platShort}<br>
        <span style="color:#d6b56a">UTM: ${esc(utm)}</span>
      </div>
      <div class="m-contact-actions">
        <button class="wa" onclick="openWhatsApp('${ph}')">WhatsApp</button>
        <button onclick="copyPhone('${ph}', event)">Copiar</button>
      </div>
    </div>`;
  }).join('');
  const more = leads.length > 200 ? `<div class="m-empty">+ ${leads.length - 200} contatos extras (filtre mais ou use Lista)</div>` : '';
  return `<h3>${title} (${leads.length})</h3><div class="m-contacts-list">${cards}</div>${more}`;
}

// ── DRAG AND DROP ─────────────────────────────────────────────────────────────
function dragStart(e, phone) {
  dragPhone = phone;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.5';
}

function dragDrop(e, stage) {
  e.preventDefault();
  if (!dragPhone) return;
  e.currentTarget.classList.remove('drag-over');
  const phone = dragPhone;
  dragPhone = null;
  const lead = allLeads.find(l => l._phone_key === phone);
  if (!lead || lead._stage === stage) return;
  fetch('/api/kanban/move', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({phone, stage})
  }).then(() => {
    allLeads.forEach(l => { if (l._phone_key === phone) l._stage = stage; });
    renderKanban(allLeads);
  }).catch(console.error);
}

function dragEnter(e, stage) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function dragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function esc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadLeads();
