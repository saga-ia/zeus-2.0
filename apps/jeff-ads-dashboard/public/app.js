(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const state = {
    accounts: [],
    bms: [],
    activeTab: 'overview',
    loadedFor: { overview: null, creatives: null, metadash: null }
  };

  const charts = {};
  function mkChart(id, config) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    const ctx = document.getElementById(id);
    if (!ctx) return;
    charts[id] = new Chart(ctx, config);
  }

  let mdData = null;
  let mdCampFilter = [];
  let mdActiveOnly = false;

  function getDateParams() {
    const preset = $('#preset-select').value;
    if (preset === 'custom') {
      const since = $('#date-since').value;
      const until = $('#date-until').value;
      if (since && until) return { qs: `since=${since}&until=${until}`, key: `custom:${since}:${until}`, body: { since, until } };
      return { qs: 'date_preset=last_7d', key: 'last_7d', body: { date_preset: 'last_7d' } };
    }
    return { qs: `date_preset=${preset}`, key: preset, body: { date_preset: preset } };
  }

  const fmtBRL = (v) => {
    const n = Number(v || 0);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
  };
  const fmtInt = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const fmtPct = (v) => `${Number(v || 0).toFixed(2)}%`;

  function setStatus(text, cls) {
    const pill = $('#status-pill');
    pill.textContent = text;
    pill.className = 'pill' + (cls ? ' ' + cls : '');
  }

  function showLoading(text) {
    $('#loading-text').textContent = text || 'Carregando…';
    $('#loading').classList.remove('hidden');
  }
  function hideLoading() { $('#loading').classList.add('hidden'); }

  function showError(container, msg) {
    container.innerHTML = `<div class="error-banner">${msg}</div>`;
  }

  function activateTab(tab) {
    state.activeTab = tab;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
    const accountId = $('#account-select').value;
    if (!accountId) return;
    const dp = getDateParams();
    const showInactive = $('#show-inactive').checked;
    const key = `${accountId}|${dp.key}|${showInactive}`;
    if (tab === 'creatives' && state.loadedFor.creatives !== key) {
      loadCreatives();
    }
    if (tab === 'metadash' && state.loadedFor.metadash !== key) {
      loadMetaDash();
    }
  }

  async function loadAccounts() {
    try {
      setStatus('carregando contas…');
      const r = await fetch('/api/accounts');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'falha ao carregar contas');
      state.accounts = data.accounts || [];
      state.bms = data.bms || [];

      const bmSel = $('#bm-select');
      bmSel.innerHTML = '<option value="">Todas as BMs</option>';
      state.bms
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .forEach(bm => {
          const o = document.createElement('option');
          o.value = bm.id || 'personal';
          o.textContent = `${bm.name} (${bm.accounts.length})`;
          bmSel.appendChild(o);
        });
      renderAccountSelect();
      const sel = $('#account-select');
      if (!sel.value && state.accounts.length > 0) {
        sel.value = state.accounts[0].id;
      }
      setStatus(`${state.accounts.length} contas`, 'ok');
    } catch (e) {
      setStatus('erro nas contas', 'err');
      showError($('#campaigns-list'), `Erro ao carregar contas: ${e.message}`);
    }
  }

  function renderAccountSelect() {
    const bmId = $('#bm-select').value;
    const sel = $('#account-select');
    const prev = sel.value;
    sel.innerHTML = '<option value="">Selecione uma conta</option>';
    let list = state.accounts;
    if (bmId) {
      list = list.filter(a => (a.bm_id || 'personal') === bmId);
    }
    list
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .forEach(acc => {
        const o = document.createElement('option');
        o.value = acc.id;
        const tag = acc.status === 1 ? '' : ' [inativa]';
        o.textContent = `${acc.name}${tag}`;
        sel.appendChild(o);
      });
    if (prev && [...sel.options].some(o => o.value === prev)) {
      sel.value = prev;
    }
  }

  async function loadCampaigns() {
    const accountId = $('#account-select').value;
    if (!accountId) {
      $('#campaigns-list').innerHTML = '<div class="empty">Selecione uma conta e clique em Aplicar.</div>';
      $('#kpis').innerHTML = '';
      $('#camps-count').textContent = '0';
      return;
    }
    const dp = getDateParams();
    const showInactive = $('#show-inactive').checked;
    const key = `${accountId}|${dp.key}|${showInactive}`;

    showLoading('Buscando campanhas…');
    try {
      const [campR, sumR] = await Promise.all([
        fetch(`/api/campaigns?account_id=${accountId}&${dp.qs}&show_inactive=${showInactive ? 1 : 0}`).then(r => r.json()),
        fetch(`/api/account-summary?account_id=${accountId}&${dp.qs}`).then(r => r.json())
      ]);
      if (campR.error) throw new Error(campR.error);
      renderKpis(sumR.summary);
      renderCampaigns(campR.campaigns || []);
      state.loadedFor.overview = key;
    } catch (e) {
      showError($('#campaigns-list'), `Erro: ${e.message}`);
      $('#kpis').innerHTML = '';
    } finally {
      hideLoading();
    }
  }

  function renderKpis(summary) {
    const el = $('#kpis');
    if (!summary) {
      el.innerHTML = '<div class="empty">Sem dados de performance no período.</div>';
      return;
    }
    const actions = summary.actions || [];
    const findAction = (type) => {
      const a = actions.find(x => x.action_type === type);
      return a ? Number(a.value || 0) : 0;
    };
    const purchases = findAction('purchase') || findAction('omni_purchase') || findAction('offsite_conversion.fb_pixel_purchase');
    const leads = findAction('lead') || findAction('onsite_conversion.lead_grouped');
    const conversations = findAction('onsite_conversion.messaging_conversation_started_7d') || findAction('messaging_conversation_started_7d');
    const linkClicks = findAction('link_click');

    const cards = [
      { label: 'Gasto', value: fmtBRL(summary.spend) },
      { label: 'Impressões', value: fmtInt(summary.impressions) },
      { label: 'Cliques', value: fmtInt(summary.clicks), sub: linkClicks ? `${fmtInt(linkClicks)} no link` : null },
      { label: 'CTR', value: fmtPct(summary.ctr) },
      { label: 'CPM', value: fmtBRL(summary.cpm) },
      { label: 'Alcance', value: fmtInt(summary.reach) }
    ];
    if (conversations > 0) cards.push({ label: 'Conversas iniciadas', value: fmtInt(conversations) });
    if (leads > 0) cards.push({ label: 'Leads', value: fmtInt(leads) });
    if (purchases > 0) cards.push({ label: 'Compras', value: fmtInt(purchases) });

    el.innerHTML = cards.map(k => `
      <div class="kpi">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
      </div>
    `).join('');
  }

  function renderCampaigns(camps) {
    $('#camps-count').textContent = camps.length;
    const el = $('#campaigns-list');
    if (!camps.length) {
      el.innerHTML = '<div class="empty">Nenhuma campanha encontrada nesse filtro.</div>';
      return;
    }
    el.innerHTML = camps.map(c => {
      const ins = c.insights || {};
      const actions = ins.actions || [];
      const find = (t) => {
        const a = actions.find(x => x.action_type === t);
        return a ? Number(a.value || 0) : 0;
      };
      const conv = find('onsite_conversion.messaging_conversation_started_7d') || find('messaging_conversation_started_7d');
      const lead = find('lead') || find('onsite_conversion.lead_grouped');
      const purch = find('purchase') || find('omni_purchase');
      const result = conv || lead || purch;
      const resultLabel = conv ? 'Conversas' : lead ? 'Leads' : purch ? 'Compras' : null;

      const statusCls = c.effective_status === 'ACTIVE' ? 'active' :
                        c.effective_status === 'PAUSED' ? 'paused' : 'deleted';
      const budget = c.daily_budget ? `${fmtBRL(c.daily_budget)}/dia` :
                     c.lifetime_budget ? `${fmtBRL(c.lifetime_budget)} total` : 'sem budget';

      return `
        <div class="campaign-row">
          <div>
            <div class="campaign-name">
              <span class="status-dot ${statusCls}"></span>${escapeHtml(c.name)}
            </div>
            <div class="campaign-meta">
              <span>${c.objective || '—'}</span>
              <span>${budget}</span>
              <span>${c.effective_status || c.status}</span>
            </div>
          </div>
          <div class="campaign-metrics">
            <div class="metric">
              <div class="metric-value">${fmtBRL(ins.spend)}</div>
              <div class="metric-label">Gasto</div>
            </div>
            <div class="metric">
              <div class="metric-value">${fmtInt(ins.impressions)}</div>
              <div class="metric-label">Impr.</div>
            </div>
            <div class="metric">
              <div class="metric-value">${fmtPct(ins.ctr)}</div>
              <div class="metric-label">CTR</div>
            </div>
            ${resultLabel ? `<div class="metric">
              <div class="metric-value">${fmtInt(result)}</div>
              <div class="metric-label">${resultLabel}</div>
            </div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadCreatives() {
    const accountId = $('#account-select').value;
    if (!accountId) {
      $('#creatives-grid').innerHTML = '<div class="empty">Selecione uma conta e clique em Aplicar.</div>';
      return;
    }
    const dp = getDateParams();
    showLoading('Buscando criativos…');
    try {
      const r = await fetch(`/api/creatives?account_id=${accountId}&${dp.qs}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      renderCreatives(data.creatives || []);
      state.loadedFor.creatives = `${accountId}|${dp.key}|${$('#show-inactive').checked}`;
    } catch (e) {
      showError($('#creatives-grid'), `Erro: ${e.message}`);
    } finally {
      hideLoading();
    }
  }

  function renderCreatives(list) {
    $('#creatives-count').textContent = list.length;
    const el = $('#creatives-grid');
    if (!list.length) {
      el.innerHTML = '<div class="empty">Nenhum criativo com performance no período.</div>';
      return;
    }
    el.innerHTML = list.slice(0, 60).map(c => {
      const ins = c.insights || {};
      const cre = c.creative || {};
      const thumb = cre.thumbnail_url || cre.image_url;
      const title = cre.title || cre.name || c.name;
      return `
        <div class="creative-card">
          ${thumb
            ? `<div class="creative-thumb" style="background-image:url('${escapeAttr(thumb)}')"></div>`
            : `<div class="creative-thumb empty">sem thumbnail</div>`}
          <div class="creative-body">
            <div class="creative-title">${escapeHtml(title || '—')}</div>
            <div class="creative-camp">${escapeHtml(ins.campaign_name || '')}</div>
            <div class="creative-stats">
              <div class="creative-stat"><strong>${fmtBRL(ins.spend)}</strong><span>Gasto</span></div>
              <div class="creative-stat"><strong>${fmtPct(ins.ctr)}</strong><span>CTR</span></div>
              <div class="creative-stat"><strong>${fmtInt(ins.impressions)}</strong><span>Impr.</span></div>
              <div class="creative-stat"><strong>${fmtBRL(ins.cpc)}</strong><span>CPC</span></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async function runAi(query) {
    const accountId = $('#account-select').value;
    if (!accountId) {
      $('#ai-result').innerHTML = `<div class="error-banner">Selecione uma conta antes de pedir análise.</div>`;
      return;
    }
    if (!query || !query.trim()) {
      $('#ai-result').innerHTML = `<div class="error-banner">Escreva uma pergunta pra IA.</div>`;
      return;
    }
    const dp = getDateParams();
    showLoading('IA analisando dados (pode levar até 30s)…');
    $('#ai-go').disabled = true;
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, query, ...dp.body })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      if (data.parse_error) {
        $('#ai-result').innerHTML = `<div class="card"><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px">${escapeHtml(data.raw || '')}</pre></div>`;
        return;
      }
      renderAi(data.analysis);
    } catch (e) {
      $('#ai-result').innerHTML = `<div class="error-banner">Erro na análise: ${escapeHtml(e.message)}</div>`;
    } finally {
      hideLoading();
      $('#ai-go').disabled = false;
    }
  }

  function renderAi(a) {
    if (!a) { $('#ai-result').innerHTML = ''; return; }
    const winners = (a.winners || []).map(w => `
      <div class="ai-item">
        <div class="ai-item-name">${escapeHtml(w.name || '')}</div>
        <div class="ai-item-why">${escapeHtml(w.why || '')}</div>
        ${w.metric ? `<div class="ai-item-metric">${escapeHtml(w.metric)}</div>` : ''}
      </div>
    `).join('');
    const losers = (a.losers || []).map(l => `
      <div class="ai-item">
        <div class="ai-item-name">${escapeHtml(l.name || '')}</div>
        <div class="ai-item-why">${escapeHtml(l.why || '')}</div>
        ${l.metric ? `<div class="ai-item-metric">${escapeHtml(l.metric)}</div>` : ''}
      </div>
    `).join('');
    const kpis = (a.kpis || []).map(k => `
      <div class="kpi">
        <div class="kpi-label">${escapeHtml(k.label || '')}</div>
        <div class="kpi-value">${escapeHtml(k.value || '')}</div>
      </div>
    `).join('');
    const recs = (a.recommendations || []).map(r => `<div class="ai-rec">${escapeHtml(r)}</div>`).join('');

    $('#ai-result').innerHTML = `
      ${a.headline ? `<div class="ai-headline">${escapeHtml(a.headline)}</div>` : ''}
      ${kpis ? `<div class="kpis-row">${kpis}</div>` : ''}
      ${a.summary ? `<div class="card"><div class="ai-summary">${escapeHtml(a.summary)}</div></div>` : ''}
      ${(winners || losers) ? `
        <div class="cols-2">
          ${winners ? `<div class="ai-section card"><h3>Ganhando</h3><div class="ai-list">${winners}</div></div>` : ''}
          ${losers ? `<div class="ai-section card"><h3>Perdendo</h3><div class="ai-list">${losers}</div></div>` : ''}
        </div>` : ''}
      ${recs ? `<div class="ai-section card"><h3>Recomendações</h3><div class="ai-recs">${recs}</div></div>` : ''}
    `;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function bind() {
    $$('.tab').forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));
    $('#bm-select').addEventListener('change', renderAccountSelect);
    $('#preset-select').addEventListener('change', () => {
      const isCustom = $('#preset-select').value === 'custom';
      $('#custom-range').classList.toggle('hidden', !isCustom);
      if (isCustom && !$('#date-since').value) {
        const today = new Date();
        const past = new Date(); past.setDate(past.getDate() - 7);
        const iso = (d) => d.toISOString().slice(0, 10);
        $('#date-since').value = iso(past);
        $('#date-until').value = iso(today);
      }
    });
    $('#apply-btn').addEventListener('click', () => {
      if (state.activeTab === 'creatives') loadCreatives();
      else if (state.activeTab === 'metadash') { state.loadedFor.metadash = null; loadMetaDash(); }
      else loadCampaigns();
    });
    $('#account-select').addEventListener('change', () => {
      if (state.activeTab === 'creatives') loadCreatives();
      else if (state.activeTab === 'metadash') { state.loadedFor.metadash = null; loadMetaDash(); }
      else loadCampaigns();
    });
    $('#ai-go').addEventListener('click', () => runAi($('#ai-query').value));
    $$('.chip').forEach(c => c.addEventListener('click', () => {
      $('#ai-query').value = c.dataset.q;
      runAi(c.dataset.q);
    }));
    $('#ai-mic').addEventListener('click', toggleMicRecording);
    bindMetaDash();
  }

  // ===== Audio recording for AI query =====
  const mic = { recorder: null, chunks: [], stream: null, mime: '', recording: false };

  function setMicStatus(text, cls) {
    const el = $('#ai-mic-status');
    if (!text) { el.classList.add('hidden'); return; }
    el.textContent = text;
    el.className = 'ai-mic-status' + (cls ? ' ' + cls : '');
  }

  function setMicButton(state) {
    const btn = $('#ai-mic');
    const label = btn.querySelector('.mic-label');
    btn.classList.toggle('recording', state === 'recording');
    btn.disabled = state === 'transcribing';
    label.textContent = state === 'recording' ? 'Parar' : state === 'transcribing' ? 'Transcrevendo…' : 'Gravar';
  }

  function pickMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    if (typeof MediaRecorder === 'undefined') return null;
    for (const m of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  async function toggleMicRecording() {
    if (mic.recording) {
      stopRecording();
      return;
    }
    const accountId = $('#account-select').value;
    if (!accountId) {
      setMicStatus('Selecione uma conta antes de gravar.', 'error');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicStatus('Navegador não suporta gravação. Use Chrome/Edge atualizado.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mic.recorder = recorder;
      mic.stream = stream;
      mic.chunks = [];
      mic.mime = recorder.mimeType || mime || 'audio/webm';
      mic.recording = true;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) mic.chunks.push(e.data); };
      recorder.onstop = onRecorderStop;
      recorder.start();
      setMicButton('recording');
      setMicStatus('Gravando… clique em Parar quando terminar.', 'recording');
    } catch (e) {
      setMicStatus('Erro ao acessar microfone: ' + (e.message || e.name), 'error');
    }
  }

  function stopRecording() {
    if (mic.recorder && mic.recorder.state !== 'inactive') mic.recorder.stop();
    if (mic.stream) mic.stream.getTracks().forEach(t => t.stop());
    mic.recording = false;
  }

  async function onRecorderStop() {
    setMicButton('transcribing');
    setMicStatus('Transcrevendo áudio…');
    try {
      const blob = new Blob(mic.chunks, { type: mic.mime });
      if (blob.size < 500) {
        setMicStatus('Áudio muito curto. Tente de novo.', 'error');
        setMicButton('idle');
        return;
      }
      const b64 = await blobToBase64(blob);
      const r = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio_b64: b64, mime: mic.mime })
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || 'falha na transcrição');
      const text = (data.text || '').trim();
      if (!text) {
        setMicStatus('Não consegui ouvir o que você falou. Tente de novo.', 'error');
        setMicButton('idle');
        return;
      }
      $('#ai-query').value = text;
      setMicStatus('Transcrição pronta. Disparando análise…');
      setMicButton('idle');
      runAi(text).finally(() => setMicStatus(''));
    } catch (e) {
      setMicStatus('Erro: ' + (e.message || e), 'error');
      setMicButton('idle');
    }
  }

  // ===== Meta Dashboard =====

  function mdGetLeads(actions) {
    if (!Array.isArray(actions)) return 0;
    const types = ['lead', 'onsite_conversion.lead_grouped', 'leadgen.other', 'offsite_conversion.fb_pixel_lead'];
    return types.reduce((sum, t) => {
      const a = actions.find(x => x.action_type === t);
      return sum + (a ? Number(a.value || 0) : 0);
    }, 0);
  }

  async function loadMetaDash() {
    const accountId = $('#account-select').value;
    if (!accountId) {
      $('#md-empty').classList.remove('hidden');
      return;
    }
    const dp = getDateParams();
    const key = `${accountId}|${dp.key}`;
    if (state.loadedFor.metadash === key) return;

    showLoading('Carregando Meta Dashboard…');
    $('#md-empty').classList.add('hidden');
    try {
      const r = await fetch(`/api/meta-dashboard?account_id=${accountId}&${dp.qs}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      mdData = data;
      mdCampFilter = [];
      renderMetaDash(data);
      state.loadedFor.metadash = key;
    } catch (e) {
      const el = $('#md-empty');
      el.classList.remove('hidden');
      el.textContent = `Erro ao carregar: ${e.message}`;
    } finally {
      hideLoading();
    }
  }

  function renderMetaDash(d) {
    renderMdScore(d.score, d.score_reasons);
    renderMdRecs(d.recommendations);
    renderMdKpis(d.summary, d.leads, d.cpl, d.delta);
    renderMdFunnel(d.campaigns, '');
    renderMdSpend(d.campaigns);
    renderMdTimeline(d.time_series);
    renderMdTopAdChart(d.top_ads);
    renderMdLeadRate(d.summary, d.leads);
    renderMdCplChart(d.time_series);
    renderMdGender(d.gender_breakdown);
    renderMdAge(d.age_breakdown);
    renderMdTopCreatives(d.top_ads);
    renderMdRegions(d.region_breakdown);
    renderMdCampaignsTable(d.campaigns);
    renderMdAdsTable(d.all_ads);
  }

  function renderMdScore(score, reasons) {
    const arc = $('#md-score-arc');
    const num = $('#md-score-num');
    const label = $('#md-score-label');
    const reasonsEl = $('#md-score-reasons');
    const circumference = 326.73;
    arc.setAttribute('stroke-dashoffset', circumference - circumference * score / 100);
    const color = score >= 70 ? 'var(--green)' : score >= 50 ? '#f59e0b' : 'var(--red)';
    arc.setAttribute('stroke', color);
    num.textContent = score;
    label.textContent = score >= 70 ? 'Saudável' : score >= 50 ? 'Atenção' : 'Crítico';
    label.style.color = color;
    reasonsEl.innerHTML = (reasons && reasons.length)
      ? reasons.map(r => `<div class="md-reason">${escapeHtml(r)}</div>`).join('')
      : '<div class="md-reason ok">Sem alertas críticos</div>';
  }

  function renderMdRecs(recs) {
    const el = $('#md-recs');
    if (!recs || !recs.length) { el.innerHTML = ''; return; }
    el.innerHTML = recs.map(r => {
      const cls = r.priority === 'alta' ? 'high' : r.priority === 'media' ? 'med' : 'ok';
      const pLabel = r.priority === 'alta' ? 'Alta' : r.priority === 'media' ? 'Média' : 'OK';
      return `<div class="md-rec-item ${cls}"><span class="md-rec-priority">${pLabel}</span>${escapeHtml(r.text)}</div>`;
    }).join('');
  }

  function renderMdKpis(summary, leads, cpl, delta) {
    const el = $('#md-kpis');
    if (!summary) { el.innerHTML = ''; return; }
    const dPct = (v) => {
      if (v == null || isNaN(v)) return '';
      const sign = v >= 0 ? '+' : '';
      const cls = v > 1 ? 'up' : v < -1 ? 'down' : 'flat';
      return `<div class="kpi-delta ${cls}">${sign}${Number(v).toFixed(1)}%</div>`;
    };
    const cards = [
      { label: 'Investimento', value: fmtBRL(summary.spend), d: delta?.spend },
      { label: 'Impressões', value: fmtInt(summary.impressions), d: delta?.impressions },
      { label: 'Cliques', value: fmtInt(summary.clicks), d: delta?.clicks },
      { label: 'Alcance', value: fmtInt(summary.reach), d: delta?.reach },
      { label: 'Leads', value: fmtInt(leads), d: delta?.leads },
      { label: 'CPL', value: fmtBRL(cpl) },
      { label: 'CTR', value: fmtPct(summary.ctr) },
      { label: 'CPM', value: fmtBRL(summary.cpm) },
      { label: 'Frequência', value: Number(summary.frequency || 0).toFixed(2) }
    ];
    el.innerHTML = cards.map(k => `
      <div class="kpi">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        ${k.d != null ? dPct(k.d) : ''}
      </div>`).join('');
  }

  function renderMdFunnel(camps, objective) {
    const filtered = objective ? camps.filter(c => c.objective === objective) : camps;
    const t = filtered.reduce((acc, c) => {
      acc.reach += Number(c.reach || 0);
      acc.impressions += Number(c.impressions || 0);
      acc.clicks += Number(c.clicks || 0);
      acc.leads += mdGetLeads(c.actions);
      return acc;
    }, { reach: 0, impressions: 0, clicks: 0, leads: 0 });
    const maxVal = Math.max(t.reach, t.impressions, t.clicks, t.leads, 1);
    const steps = [
      { label: 'Alcance', value: t.reach },
      { label: 'Impressões', value: t.impressions },
      { label: 'Cliques', value: t.clicks },
      { label: 'Leads', value: t.leads }
    ];
    $('#md-funnel').innerHTML = steps.map(s => `
      <div class="md-funnel-stage">
        <div class="md-funnel-label">${s.label}</div>
        <div class="md-funnel-bar-wrap"><div class="md-funnel-bar" style="width:${Math.round(s.value / maxVal * 100)}%"></div></div>
        <div class="md-funnel-val">${fmtInt(s.value)}</div>
      </div>`).join('');
  }

  function renderMdSpend(camps) {
    const el = $('#md-spend-cards');
    const sorted = [...camps].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)).slice(0, 5);
    if (!sorted.length) { el.innerHTML = '<div class="empty">Sem dados.</div>'; return; }
    el.innerHTML = sorted.map(c => `
      <div class="md-spend-card">
        <div class="md-spend-label">${escapeHtml((c.campaign_name || '—').slice(0, 35))}</div>
        <div class="md-spend-val">${fmtBRL(c.spend)}</div>
      </div>`).join('');
  }

  const chartColors = {
    blue: '#3b82f6', green: '#10b981', yellow: '#f59e0b',
    grid: 'rgba(255,255,255,0.05)', tick: '#94a3b8', legend: '#e2e8f0'
  };

  function renderMdTimeline(series) {
    const labels = series.map(d => { const [,m,day] = d.date.split('-'); return `${day}/${m}`; });
    mkChart('md-chart-timeline', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Investimento (R$)', data: series.map(d => d.spend), borderColor: chartColors.blue, backgroundColor: 'rgba(59,130,246,0.12)', tension: 0.3, yAxisID: 'y', pointRadius: 2 },
          { label: 'Leads', data: series.map(d => d.leads), borderColor: chartColors.green, backgroundColor: 'rgba(16,185,129,0.12)', tension: 0.3, yAxisID: 'y1', pointRadius: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { position: 'left', ticks: { color: chartColors.tick, callback: v => 'R$' + v.toFixed(0) }, grid: { color: chartColors.grid } },
          y1: { position: 'right', ticks: { color: chartColors.green }, grid: { drawOnChartArea: false } },
          x: { ticks: { color: chartColors.tick, maxTicksLimit: 10 }, grid: { color: chartColors.grid } }
        },
        plugins: { legend: { labels: { color: chartColors.legend } } }
      }
    });
  }

  function renderMdTopAdChart(ads) {
    const top = ads.slice(0, 8);
    mkChart('md-chart-topad', {
      type: 'bar',
      data: {
        labels: top.map(a => (a.ad_name || '').slice(0, 18)),
        datasets: [
          { label: 'Gasto (R$)', data: top.map(a => Number(a.spend || 0)), backgroundColor: chartColors.blue, yAxisID: 'y' },
          { label: 'Leads', data: top.map(a => a.leads || 0), backgroundColor: chartColors.green, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { ticks: { color: chartColors.tick, callback: v => 'R$' + v.toFixed(0) }, grid: { color: chartColors.grid } },
          y1: { position: 'right', ticks: { color: chartColors.green }, grid: { drawOnChartArea: false } },
          x: { ticks: { color: chartColors.tick, maxRotation: 45 }, grid: { color: chartColors.grid } }
        },
        plugins: { legend: { labels: { color: chartColors.legend } } }
      }
    });
  }

  function renderMdLeadRate(summary, leads) {
    const impressions = Number(summary?.impressions || 0);
    const rate = impressions > 0 ? (leads / impressions * 100) : 0;
    $('#md-leadrate-val').textContent = `Lead Rate: ${rate.toFixed(2)}%`;
    mkChart('md-chart-leadrate', {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [rate, Math.max(0, 100 - rate)],
          backgroundColor: [chartColors.green, 'rgba(255,255,255,0.08)'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
  }

  function renderMdCplChart(series) {
    const labels = series.map(d => { const [,m,day] = d.date.split('-'); return `${day}/${m}`; });
    mkChart('md-chart-cpl', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Leads', data: series.map(d => d.leads), backgroundColor: chartColors.green, yAxisID: 'y' },
          { type: 'line', label: 'CPL (R$)', data: series.map(d => d.leads > 0 ? d.spend / d.leads : 0), borderColor: chartColors.yellow, tension: 0.3, yAxisID: 'y1', pointRadius: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { ticks: { color: chartColors.tick }, grid: { color: chartColors.grid } },
          y1: { position: 'right', ticks: { color: chartColors.yellow, callback: v => 'R$' + v.toFixed(0) }, grid: { drawOnChartArea: false } },
          x: { ticks: { color: chartColors.tick, maxTicksLimit: 10 }, grid: { color: chartColors.grid } }
        },
        plugins: { legend: { labels: { color: chartColors.legend } } }
      }
    });
  }

  function renderMdGender(data) {
    const labels = data.map(d => d.gender === 'male' ? 'Masculino' : d.gender === 'female' ? 'Feminino' : 'N/I');
    mkChart('md-chart-gender', {
      type: 'doughnut',
      data: { labels, datasets: [{ data: data.map(d => Number(d.reach || 0)), backgroundColor: ['#3b82f6','#ec4899','#94a3b8'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: chartColors.legend, font: { size: 11 } } } } }
    });
  }

  function renderMdAge(data) {
    mkChart('md-chart-age', {
      type: 'doughnut',
      data: { labels: data.map(d => d.age), datasets: [{ data: data.map(d => Number(d.reach || 0)), backgroundColor: ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: chartColors.legend, font: { size: 11 } } } } }
    });
  }

  function renderMdTopCreatives(ads) {
    const el = $('#md-top-creatives');
    $('#md-topads-count').textContent = ads.length;
    if (!ads.length) { el.innerHTML = '<div class="empty">Sem criativos.</div>'; return; }
    el.innerHTML = ads.map(a => `
      <div class="creative-card">
        ${a.thumbnail ? `<div class="creative-thumb" style="background-image:url('${escapeAttr(a.thumbnail)}')"></div>` : '<div class="creative-thumb empty">sem thumb</div>'}
        <div class="creative-body">
          <div class="creative-title">${escapeHtml((a.ad_name || '').slice(0, 40))}</div>
          <div class="creative-camp">${escapeHtml(a.campaign_name || '')}</div>
          <div class="creative-stats">
            <div class="creative-stat"><strong>${fmtBRL(a.spend)}</strong><span>Gasto</span></div>
            <div class="creative-stat"><strong>${fmtInt(a.leads)}</strong><span>Leads</span></div>
            <div class="creative-stat"><strong>${fmtPct(a.ctr)}</strong><span>CTR</span></div>
          </div>
        </div>
      </div>`).join('');
  }

  function renderMdRegions(regions) {
    const el = $('#md-regions');
    if (!regions || !regions.length) { el.innerHTML = '<div class="empty">Sem dados de região.</div>'; return; }
    const maxR = Math.max(...regions.map(r => Number(r.reach || 0)), 1);
    el.innerHTML = regions.slice(0, 15).map((r, i) => `
      <div class="md-region-row">
        <div class="md-region-rank">${i + 1}</div>
        <div class="md-region-info">
          <div class="md-region-name">${escapeHtml(r.region || '—')}</div>
          <div class="md-region-bar-wrap"><div class="md-region-bar" style="width:${Math.round(Number(r.reach || 0) / maxR * 100)}%"></div></div>
        </div>
        <div class="md-region-val">${fmtInt(r.reach)}</div>
      </div>`).join('');
  }

  function renderMdCampaignsTable(camps) {
    const el = $('#md-campaigns-table');
    const visible = mdActiveOnly ? camps.filter(c => c.effective_status === 'ACTIVE') : camps;
    if (!visible.length) { el.innerHTML = '<div class="empty">Sem campanhas.</div>'; return; }
    el.innerHTML = `
      <table class="md-table">
        <thead><tr>
          <th style="width:32px"></th>
          <th class="md-td-num">#</th>
          <th>Campanha</th>
          <th>Status</th>
          <th>Investimento</th>
          <th>Cliques</th>
          <th>CTR</th>
          <th>Leads</th>
        </tr></thead>
        <tbody>
          ${visible.map((c, i) => {
            const statusCls = c.effective_status === 'ACTIVE' ? 'active' : c.effective_status === 'PAUSED' ? 'paused' : 'deleted';
            const statusLabel = c.effective_status === 'ACTIVE' ? 'Ativa' : c.effective_status === 'PAUSED' ? 'Pausada' : (c.effective_status || '—');
            return `
            <tr>
              <td><input type="checkbox" class="md-camp-cb" data-id="${escapeAttr(c.campaign_id)}" ${mdCampFilter.includes(c.campaign_id) ? 'checked' : ''}></td>
              <td class="md-td-num">${i + 1}</td>
              <td class="md-camp-name">${escapeHtml(c.campaign_name || '—')}</td>
              <td><span class="status-dot ${statusCls}"></span>${escapeHtml(statusLabel)}</td>
              <td>${fmtBRL(c.spend)}</td>
              <td>${fmtInt(c.clicks)}</td>
              <td>${fmtPct(c.ctr)}</td>
              <td>${fmtInt(c.leads)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function renderMdAdsTable(ads) {
    const el = $('#md-ads-table');
    $('#md-ads-count').textContent = ads.length;
    if (!ads.length) { el.innerHTML = '<div class="empty">Sem anúncios.</div>'; return; }
    el.innerHTML = `
      <table class="md-table">
        <thead><tr>
          <th class="md-td-num">#</th>
          <th>Campanha</th>
          <th>Conjunto</th>
          <th>Anuncio</th>
          <th class="md-td-val">Investimento</th>
          <th class="md-td-val">Cliques</th>
          <th class="md-td-val">CTR</th>
          <th class="md-td-val">Leads</th>
        </tr></thead>
        <tbody>
          ${ads.slice(0, 50).map((a, i) => `
            <tr>
              <td class="md-td-num">${i + 1}</td>
              <td class="md-td-dim">${escapeHtml(a.campaign_name || '—')}</td>
              <td class="md-td-dim">${escapeHtml(a.adset_name || '—')}</td>
              <td class="md-camp-name">${escapeHtml(a.ad_name || '—')}</td>
              <td class="md-td-val">${fmtBRL(a.spend)}</td>
              <td class="md-td-val">${fmtInt(a.clicks)}</td>
              <td class="md-td-val">${fmtPct(a.ctr)}</td>
              <td class="md-td-val">${fmtInt(a.leads)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function bindMetaDash() {
    $$('.md-ftab').forEach(btn => btn.addEventListener('click', () => {
      $$('.md-ftab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (mdData) renderMdFunnel(mdData.campaigns, btn.dataset.obj);
    }));

    $('#md-camp-filter-btn').addEventListener('click', () => {
      if (!mdData) return;
      mdCampFilter = $$('.md-camp-cb:checked').map(cb => cb.dataset.id);
      if (!mdCampFilter.length) { renderMetaDash(mdData); return; }
      const filtered = { ...mdData, campaigns: mdData.campaigns.filter(c => mdCampFilter.includes(c.campaign_id)) };
      renderMetaDash(filtered);
    });

    $('#md-camp-clear-btn').addEventListener('click', () => {
      mdCampFilter = [];
      $$('.md-camp-cb').forEach(cb => cb.checked = false);
      if (mdData) renderMetaDash(mdData);
    });

    $('#md-active-only').addEventListener('change', (e) => {
      mdActiveOnly = e.target.checked;
      if (mdData) renderMdCampaignsTable(mdData.campaigns);
    });

    $('#md-refresh-btn').addEventListener('click', () => {
      state.loadedFor.metadash = null;
      loadMetaDash();
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const s = String(fr.result || '');
        const idx = s.indexOf(',');
        resolve(idx >= 0 ? s.slice(idx + 1) : s);
      };
      fr.onerror = () => reject(fr.error || new Error('read error'));
      fr.readAsDataURL(blob);
    });
  }

  bind();
  loadAccounts();
})();
