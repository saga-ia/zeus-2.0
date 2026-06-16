(function(){
'use strict';

const state = {
  sessionId: null,
  slug: null,
  current: 0,
  total: 0,
  sections: [],
  answers: {}
};

const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

function setProgress(idx, total){
  const pct = Math.round((idx / (total + 1)) * 100);
  const bar = document.getElementById('progressBar');
  const lbl = document.getElementById('progressLabel');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = pct + '%';
}

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadSchema(){
  const r = await fetch('/api/form/schema');
  const j = await r.json();
  state.sections = j.sections || [];
  state.total = state.sections.length;
}

async function startSession(){
  const slug = state.slug;
  const r = await fetch('/api/form/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slug ? { slug } : {})
  });
  const j = await r.json();
  state.sessionId = j.session_id;
  if (j.answers && typeof j.answers === 'object') Object.assign(state.answers, j.answers);
  if (j.completed) {
    state.current = state.total + 1;
    return true;
  }
  const tag = document.getElementById('sessionTag');
  if (tag) tag.textContent = slug ? ('formulário · ' + slug) : ('sessão ' + j.session_id);
  return false;
}

function renderSection(idx){
  const mount = document.getElementById('sectionMount');
  $$('section.card').forEach(s => s.hidden = true);

  if (idx === 0){
    document.querySelector('section.card.hero').hidden = false;
    setProgress(0, state.total);
    return;
  }
  if (idx > state.total){
    document.querySelector('section.card.done').hidden = false;
    setProgress(state.total + 1, state.total);
    return;
  }

  const sec = state.sections[idx - 1];
  let html = `<section class="card" data-section="${sec.ordem}">
    <span class="section-tag">${escapeHtml(sec.tag)} · seção ${sec.ordem} de ${state.total}</span>
    <h2>${escapeHtml(sec.title)}</h2>`;
  if (sec.subtitle) html += `<p class="subtitle">${escapeHtml(sec.subtitle)}</p>`;

  for (const f of sec.questions){
    const prev = state.answers[f.qkey] || '';
    const req = f.required ? '<span class="req">*</span>' : '';
    const hint = f.hint ? `<span class="hint">${escapeHtml(f.hint)}</span>` : '';
    if (f.qtype === 'photo'){
      const hasPhoto = prev && prev !== '';
      html += `<div class="field">
        <label>${escapeHtml(f.label)}${req}</label>
        ${hint}
        <label class="file-drop" for="file_${f.qkey}">
          <p><strong>Clique para enviar</strong> ou arraste uma foto aqui</p>
          <p style="font-size:12px">JPG, PNG ou WEBP — máx 8MB</p>
        </label>
        <input id="file_${f.qkey}" type="file" accept="image/jpeg,image/png,image/webp" data-key="${f.qkey}" />
        <div class="photo-preview${hasPhoto ? ' show' : ''}" id="prev_${f.qkey}"><img alt="preview" src="${hasPhoto ? '/api/form/photo/' + state.sessionId + '?t=' + Date.now() : ''}"/></div>
      </div>`;
    } else if (f.qtype === 'textarea'){
      const big = f.big ? ' style="min-height:280px"' : '';
      html += `<div class="field">
        <label for="i_${f.qkey}">${escapeHtml(f.label)}${req}</label>
        ${hint}
        <textarea id="i_${f.qkey}" data-key="${f.qkey}" data-required="${f.required?1:0}" data-min="${f.min_length||0}"${big}>${escapeHtml(prev)}</textarea>
      </div>`;
    } else {
      const t = ['email','tel','text'].includes(f.qtype) ? f.qtype : 'text';
      html += `<div class="field">
        <label for="i_${f.qkey}">${escapeHtml(f.label)}${req}</label>
        ${hint}
        <input id="i_${f.qkey}" type="${t}" data-key="${f.qkey}" data-required="${f.required?1:0}" value="${escapeHtml(prev)}" />
      </div>`;
    }
  }

  html += `<div class="actions">
    <button class="btn ghost" data-action="back" ${idx === 1 ? 'disabled' : ''}>Voltar</button>
    <span class="save-status" id="saveStatus"></span>
    <button class="btn primary pulse" data-action="next">${idx === state.total ? 'Finalizar' : 'Continuar'}</button>
  </div>
  </section>`;

  mount.innerHTML = html;
  setProgress(idx, state.total);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const photoInput = mount.querySelector('input[type=file]');
  if (photoInput) photoInput.addEventListener('change', onPhotoChange);
}

async function onPhotoChange(ev){
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024){
    alert('Foto muito grande. Máximo 8MB.');
    ev.target.value = '';
    return;
  }
  const key = ev.target.getAttribute('data-key');
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    const preview = document.getElementById('prev_' + key);
    if (preview){
      preview.querySelector('img').src = dataUrl;
      preview.classList.add('show');
    }
    try {
      const r = await fetch('/api/form/photo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: state.sessionId, data_url: dataUrl })
      });
      if (!r.ok) throw new Error('upload falhou');
      state.answers[key] = '[foto enviada]';
    } catch(e){
      alert('Erro ao enviar foto: ' + e.message);
    }
  };
  reader.readAsDataURL(file);
}

function collectAnswers(idx){
  if (idx < 1 || idx > state.total) return [];
  const sec = state.sections[idx - 1];
  const out = [];
  for (const f of sec.questions){
    if (f.qtype === 'photo') continue;
    const el = document.getElementById('i_' + f.qkey);
    if (!el) continue;
    const value = (el.value || '').trim();
    state.answers[f.qkey] = value;
    out.push({ key: f.qkey, label: f.label, value: value });
  }
  return out;
}

function validate(idx){
  if (idx < 1 || idx > state.total) return true;
  const sec = state.sections[idx - 1];
  for (const f of sec.questions){
    if (f.qtype === 'photo') continue;
    const el = document.getElementById('i_' + f.qkey);
    if (!el) continue;
    const v = (el.value || '').trim();
    if (f.required && !v){
      el.focus();
      el.style.borderColor = 'var(--red)';
      flashStatus('Preencha os campos obrigatórios', 'error');
      setTimeout(() => { el.style.borderColor = ''; }, 1800);
      return false;
    }
    if (f.min_length && v.length < f.min_length){
      el.focus();
      flashStatus(`Mínimo ${f.min_length} caracteres (você tem ${v.length})`, 'error');
      return false;
    }
  }
  return true;
}

function flashStatus(msg, kind){
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.className = 'save-status ' + (kind || '');
  el.textContent = msg;
  if (kind !== 'error') setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 2200);
}

async function saveSection(idx, answers){
  flashStatus('Salvando...', 'saving');
  try {
    const r = await fetch('/api/form/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId, section: idx, answers })
    });
    if (!r.ok) throw new Error('save failed');
    flashStatus('Salvo', 'saved');
    return true;
  } catch(e){
    flashStatus('Erro ao salvar — tentando seguir', 'error');
    return false;
  }
}

async function complete(){
  try {
    await fetch('/api/form/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId })
    });
  } catch(e){}
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-action]');
  if (!t) return;
  const action = t.getAttribute('data-action');
  if (action === 'next'){
    if (state.current >= 1 && state.current <= state.total){
      if (!validate(state.current)) return;
      const answers = collectAnswers(state.current);
      await saveSection(state.current, answers);
    }
    state.current += 1;
    if (state.current > state.total){ await complete(); }
    renderSection(state.current);
  } else if (action === 'back'){
    if (state.current >= 2){
      const answers = collectAnswers(state.current);
      saveSection(state.current, answers);
      state.current -= 1;
      renderSection(state.current);
    }
  }
});

(async function init(){
  state.slug = window.__SLUG__ || null;
  await loadSchema();
  const alreadyDone = await startSession();
  if (alreadyDone) {
    renderSection(state.total + 1);
  } else {
    renderSection(0);
  }
})();
})();
