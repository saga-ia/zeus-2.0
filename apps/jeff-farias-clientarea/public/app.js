const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const tabsEl = $('#tabs');
const contentEl = $('#content');
const popup = $('#popup');

const state = { paras: [], answers: {}, actions: [], blocks: [], current: -1, arqSub: 0, overrides: {}, editing: false };

const EDITABLE_SELECTORS = 'h1,h2,h3,h4,p,li,td,th,.arq-arrow,.arq-eyebrow,.arq-tag,.arq-h,.arq-h3,.arq-sub,.arq-lbl,.home-eyebrow,.home-title';

function applyOverrides(root, blockKey){
  if (!root) return;
  let i = 0;
  root.querySelectorAll(EDITABLE_SELECTORS).forEach(el => {
    if (el.querySelector(EDITABLE_SELECTORS)) return;
    if (el.closest('.qbox') || el.closest('.action') || el.closest('.arq-subnav') || el.closest('.edit-toolbar')) return;
    const key = blockKey + '::' + el.tagName.toLowerCase() + '::' + (i++);
    el.dataset.editKey = key;
    const ov = state.overrides[key];
    if (ov) {
      if (ov.hidden) {
        el.dataset.hidden = '1';
        el.dataset.hiddenContent = ov.content;
        el.style.display = 'none';
      } else {
        el.innerHTML = ov.content;
      }
    }
  });
}

function mountEditUI(card, blockKey){
  if (!card) return;
  const bar = document.createElement('div');
  bar.className = 'edit-toolbar';
  bar.innerHTML = `
    <button class="edit-pencil" title="Editar textos desta página" aria-label="Editar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
      <span>Editar</span>
    </button>`;
  card.prepend(bar);
  const btn = bar.querySelector('.edit-pencil');
  btn.onclick = () => toggleEdit(card, blockKey);
  if (state.editing) enterEdit(card);
}

function enterEdit(card){
  card.classList.add('editing');
  card.querySelectorAll('[data-edit-key]').forEach(el => {
    if (el.dataset.hidden === '1') {
      el.style.display = '';
      el.innerHTML = el.dataset.hiddenContent || '';
      el.classList.add('was-hidden');
    }
    el.dataset.original = el.innerHTML;
    el.dataset.originalHidden = el.dataset.hidden === '1' ? '1' : '0';
    el.contentEditable = 'true';
    el.spellcheck = true;
    if (!el.querySelector('.vis-group')) {
      const grp = document.createElement('span');
      grp.className = 'vis-group';
      grp.contentEditable = 'false';
      grp.dataset.role = 'vis-group';
      const visBtn = document.createElement('button');
      visBtn.type = 'button';
      visBtn.className = 'vis-btn vis-on';
      visBtn.title = 'Salvar visível: este texto aparece no site';
      visBtn.innerHTML = '<span class="vis-ico">👁</span><span class="vis-lbl">Visível</span>';
      const intBtn = document.createElement('button');
      intBtn.type = 'button';
      intBtn.className = 'vis-btn vis-off';
      intBtn.title = 'Salvar interno: oculta do site, fica só na documentação';
      intBtn.innerHTML = '<span class="vis-ico">🔒</span><span class="vis-lbl">Interno</span>';
      const sync = () => {
        const internal = el.dataset.hidden === '1';
        visBtn.classList.toggle('active', !internal);
        intBtn.classList.toggle('active', internal);
      };
      sync();
      const stop = e => { e.stopPropagation(); e.preventDefault(); };
      visBtn.onclick = e => { stop(e); el.dataset.hidden = '0'; sync(); };
      intBtn.onclick = e => { stop(e); el.dataset.hidden = '1'; sync(); };
      grp.appendChild(visBtn);
      grp.appendChild(intBtn);
      el.appendChild(grp);
    }
  });
  let footer = card.querySelector('.edit-footer');
  if (!footer) {
    footer = document.createElement('div');
    footer.className = 'edit-footer';
    footer.innerHTML = `
      <span class="edit-hint">Clique no texto pra editar. Em cada bloco escolha <b>👁 Visível</b> (aparece no site) ou <b>🔒 Interno</b> (oculto, só na documentação).</span>
      <button class="btn edit-cancel">Cancelar</button>
      <button class="btn primary edit-save">Salvar</button>`;
    card.appendChild(footer);
    footer.querySelector('.edit-save').onclick = () => saveEdits(card);
    footer.querySelector('.edit-cancel').onclick = () => cancelEdits(card);
  }
}

function exitEdit(card){
  state.editing = false;
  card.classList.remove('editing');
  card.querySelectorAll('[data-edit-key]').forEach(el => {
    el.contentEditable = 'false';
    const grp = el.querySelector('.vis-group');
    if (grp) grp.remove();
    delete el.dataset.original;
    delete el.dataset.originalHidden;
    el.classList.remove('was-hidden');
    if (el.dataset.hidden === '1') {
      el.dataset.hiddenContent = el.innerHTML;
      el.innerHTML = '';
      el.style.display = 'none';
    }
  });
  const footer = card.querySelector('.edit-footer');
  if (footer) footer.remove();
}

function toggleEdit(card, blockKey){
  if (card.classList.contains('editing')) {
    cancelEdits(card);
  } else {
    state.editing = true;
    enterEdit(card);
  }
}

function stripToggle(html){
  return (html || '')
    .replace(/<span[^>]*class="[^"]*vis-group[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<button[^>]*class="[^"]*vis-toggle[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '')
    .trim();
}

function cancelEdits(card){
  card.querySelectorAll('[data-edit-key]').forEach(el => {
    if (el.dataset.original !== undefined) {
      const grp = el.querySelector('.vis-group');
      if (grp) grp.remove();
      el.innerHTML = el.dataset.original;
    }
    el.dataset.hidden = el.dataset.originalHidden === '1' ? '1' : '0';
  });
  exitEdit(card);
}

async function saveEdits(card){
  const changes = {};
  card.querySelectorAll('[data-edit-key]').forEach(el => {
    const grp = el.querySelector('.vis-group');
    if (grp) grp.remove();
    const cur = stripToggle(el.innerHTML);
    const wasHidden = el.dataset.originalHidden === '1';
    const isHidden = el.dataset.hidden === '1';
    const origStripped = stripToggle(el.dataset.original || '');
    const contentChanged = cur !== origStripped;
    const hiddenChanged = wasHidden !== isHidden;
    if (contentChanged || hiddenChanged) {
      changes[el.dataset.editKey] = { content: cur, hidden: isHidden };
    }
    el.innerHTML = cur;
  });
  const saveBtn = card.querySelector('.edit-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'; }
  if (Object.keys(changes).length) {
    const r = await fetch('/api/overrides', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ changes })
    }).then(r=>r.json()).catch(()=>({error:1}));
    if (r && r.ok) {
      for (const [k, v] of Object.entries(changes)) state.overrides[k] = v;
    } else {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar'; }
      alert('Falha ao salvar. Tente novamente.');
      return;
    }
  }
  exitEdit(card);
  flashSaved(card);
}

function flashSaved(card){
  const t = document.createElement('div');
  t.className = 'edit-toast';
  t.textContent = 'Salvo';
  card.appendChild(t);
  setTimeout(()=>t.remove(), 1600);
}

const hashKey = s => {
  let h = 0; for (let i=0;i<s.length;i++){ h = ((h<<5)-h) + s.charCodeAt(i); h |= 0; }
  return 'q' + Math.abs(h).toString(36);
};

const cleanTitle = s => (s||'').replace(/^\s*BLOCO\s*\d+\s*[—–\-:.]?\s*/i, '').trim();
const cleanText = s => (s||'')
  .replace(/\s*\(\s*Skill\s*\d*\s*\)/gi, '')
  .replace(/\s*\b(?:n[ao]|d[ao]|em|com|pela|sobre|para|através\s+da)\s+Skill\s*\d*\b\.?/gi, '')
  .replace(/\s*\bSkill\s*\d*\b\.?/gi, '')
  .replace(/\s+([,.;:!?])/g, '$1')
  .replace(/\s{2,}/g, ' ')
  .trim();

const colorOf = run => {
  const c = (run.c||'').toLowerCase();
  if (c.includes('hl=cyan')) return 'cyan';
  if (c.includes('hl=yellow')) return 'yellow';
  if (c.includes('hl=red')) return 'red';
  if (c.includes('hl=green')) return 'green';
  return null;
};

const detectOwner = txt => {
  const t = txt.toLowerCase();
  if (/jefferson|jeff\b|me\s+|meu\s+|mim\b/.test(t)) return 'jeff';
  return 'cliente';
};

function buildBlocks(paras){
  // Each block starts at a paragraph that begins with a cyan run.
  const blocks = [];
  let cur = null;
  paras.forEach((p, idx) => {
    const firstColor = p[0] && colorOf(p[0]);
    if (firstColor === 'cyan') {
      const title = p.filter(r => colorOf(r) === 'cyan').map(r => r.t).join(' ').trim();
      cur = { title: title || 'Sem título', start: idx, paras: [] };
      blocks.push(cur);
    } else if (cur) {
      cur.paras.push({ idx, runs: p });
    } else {
      // pre-block content: stash in an "Início" block
      if (!blocks._intro) {
        blocks._intro = { title: 'Início', start: 0, paras: [] };
        blocks.push(blocks._intro);
        cur = blocks._intro;
      }
      cur.paras.push({ idx, runs: p });
    }
  });
  // Merge duplicate "diagnóstico inicial" blocks if adjacent
  const merged = [];
  blocks.forEach(b => {
    const last = merged[merged.length-1];
    if (last && last.title.toLowerCase() === b.title.toLowerCase()) {
      last.paras.push(...b.paras);
    } else merged.push(b);
  });
  return merged;
}

function goHome(){
  state.current = -1;
  renderTabs();
  renderContent();
  window.scrollTo({top:0,behavior:'smooth'});
}

function goBlock(i){
  state.current = i;
  renderTabs();
  renderContent();
  window.scrollTo({top:0,behavior:'smooth'});
}

function makeBackBtn(){
  const b = document.createElement('button');
  b.className = 'btn back-btn';
  b.innerHTML = '← Início';
  b.onclick = goHome;
  return b;
}

function renderTabs(){
  tabsEl.innerHTML = '';
  const home = document.createElement('button');
  home.className = 'tab home active';
  home.textContent = 'Início';
  home.onclick = goHome;
  tabsEl.appendChild(home);
}

function paraToHTML(runs){
  let html = '';
  for (const r of runs) {
    const c = colorOf(r);
    const cleaned = cleanText(r.t||'');
    const safe = cleaned.replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
    if (c === 'yellow') {
      html += `<span class="hl-yellow" data-tip="${safe.replace(/"/g,'&quot;')}">${safe}</span>`;
    } else if (c === 'red') {
      html += `<span class="hl-red">${safe}</span>`;
    } else if (c === 'green') {
      html += `<span class="hl-green">${safe}</span>`;
    } else if (c === 'cyan') {
      // skip cyan inside body (only used as title)
      continue;
    } else {
      html += safe;
    }
  }
  return html;
}

function renderContent(){
  if (state.current === -1) {
    contentEl.innerHTML = `
      <section class="home-hero card">
        <div class="home-eyebrow">Farias Souza</div>
        <h1 class="home-title">Posicionamento Arquetípico<br/><span>e Estratégias de Posicionamento</span></h1>
      </section>`;
    const home = contentEl.querySelector('.home-hero');
    applyOverrides(home, 'home');
    mountEditUI(home, 'home');

    const grid = document.createElement('div');
    grid.className = 'home-grid';
    state.blocks.forEach((b, i) => {
      const card = document.createElement('button');
      card.className = 'home-nav-card';
      card.innerHTML = `<span class="hnc-title">${cleanTitle(b.title)}</span><span class="hnc-arrow">→</span>`;
      card.onclick = () => goBlock(i);
      grid.appendChild(card);
    });
    contentEl.appendChild(grid);
    return;
  }
  const block = state.blocks[state.current];
  if (!block) { contentEl.innerHTML = '<div class="empty">Sem conteúdo</div>'; return; }

  if (block.custom && block.render) {
    contentEl.innerHTML = '';
    contentEl.appendChild(makeBackBtn());
    const node = block.render();
    contentEl.appendChild(node);
    const blockKey = 'custom::' + (block.title || 'sem-titulo') + '::' + (state.arqSub || 0);
    applyOverrides(node, blockKey);
    mountEditUI(node, blockKey);
    window.scrollTo({top:0});
    return;
  }

  contentEl.innerHTML = '';
  contentEl.appendChild(makeBackBtn());
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `<h2>${cleanTitle(block.title)}</h2>`;

  // Group consecutive non-empty paragraphs in flowing text. After paragraphs that
  // include red runs, emit a question box. After paragraphs that include green
  // runs, emit action items.
  const reds = [];
  const greens = [];

  block.paras.forEach(({ runs }) => {
    if (!runs || !runs.length) return;
    const html = paraToHTML(runs);
    if (html.trim()) {
      const p = document.createElement('p');
      p.innerHTML = html;
      card.appendChild(p);
    }
    runs.forEach(r => {
      const c = colorOf(r);
      const t = cleanText(r.t||'');
      if (!t) return;
      if (c === 'red') reds.push(t);
      else if (c === 'green') greens.push(t);
    });
  });

  // Question boxes: dedupe by question_key, one box per red run
  const seen = new Set();
  reds.forEach(qtext => {
    const key = hashKey(block.title + '|' + qtext);
    if (seen.has(key)) return; seen.add(key);
    const existing = state.answers[key];
    const box = document.createElement('div');
    box.className = 'qbox';
    box.innerHTML = `
      <label>Pergunta</label>
      <p style="margin:0 0 10px;color:#ffd6dc">${qtext}</p>
      <textarea placeholder="Resposta do cliente...">${existing?.answer ? existing.answer.replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])) : ''}</textarea>
      <div class="row">
        <span class="ts">${existing?.updated_at ? 'Salvo em ' + existing.updated_at : ''}</span>
        <button class="btn primary">Salvar resposta</button>
      </div>`;
    const ta = box.querySelector('textarea');
    const btn = box.querySelector('button');
    const ts = box.querySelector('.ts');
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Salvando...';
      const r = await fetch('/api/answer', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ block: block.title, question_key: key, answer: ta.value })
      }).then(r=>r.json()).catch(()=>({error:1}));
      btn.disabled = false; btn.textContent = 'Salvar resposta';
      if (r && r.ok) { ts.textContent = 'Salvo agora'; await loadState(); }
    };
    card.appendChild(box);
  });

  // Action items
  if (greens.length || state.actions.some(a => a.block === block.title)) {
    const wrap = document.createElement('div');
    wrap.className = 'actions';
    wrap.innerHTML = `<h3 style="margin:14px 0 4px;color:#9af0d2;font-size:14px;letter-spacing:.3px">Ações deste bloco</h3>`;

    // existing actions for this block
    const existing = state.actions.filter(a => a.block === block.title);
    existing.forEach(a => wrap.appendChild(actionEl(a)));

    // suggested green items not yet created
    const existingTitles = new Set(existing.map(a => cleanText(a.title).toLowerCase()));
    greens.forEach(gtext => {
      const t = gtext.replace(/^[\s•\-–—]+/, '').trim();
      if (!t || t.length < 4) return;
      if (existingTitles.has(t.toLowerCase())) return;
      const btn = document.createElement('div');
      btn.className = 'action';
      btn.innerHTML = `
        <div>
          <div class="a-title">${t}</div>
          <div class="a-meta"><span class="owner">${detectOwner(t)}</span><span>sugerida pelo doc</span></div>
        </div>
        <div class="a-ctrls"><button class="btn green">Adicionar</button></div>`;
      btn.querySelector('button').onclick = async () => {
        await fetch('/api/action', {
          method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify({ owner: detectOwner(t), title: t, block: block.title })
        });
        await loadState(); renderContent();
      };
      wrap.appendChild(btn);
    });

    if (wrap.children.length > 1) card.appendChild(wrap);
  }

  contentEl.appendChild(card);

  const blockKey = 'block::' + (block.title || 'sem-titulo');
  applyOverrides(card, blockKey);
  mountEditUI(card, blockKey);

  // wire popup hovers
  card.querySelectorAll('.hl-yellow').forEach(el => {
    el.addEventListener('mouseenter', e => showPopup(e, el.dataset.tip));
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
  });
}

function actionEl(a){
  const el = document.createElement('div');
  el.className = 'action' + (a.status === 'concluida' ? ' done' : '');
  el.innerHTML = `
    <div>
      <div class="a-title">${cleanText(a.title).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]))}</div>
      <div class="a-meta">
        <span class="owner">${a.owner}</span>
        ${a.due_date ? `<span>prazo ${a.due_date}</span>` : ''}
        ${a.chase_count ? `<span class="chase">${a.chase_count}× cobrada</span>` : ''}
      </div>
    </div>
    <div class="a-ctrls">
      ${a.status === 'concluida'
        ? `<button class="btn">Reabrir</button>`
        : `<button class="btn green">Concluir</button>`}
      <button class="btn danger" title="Remover">×</button>
    </div>`;
  const [doneBtn, delBtn] = el.querySelectorAll('button');
  doneBtn.onclick = async () => {
    await fetch('/api/action/'+a.id, {
      method:'PATCH', headers:{'content-type':'application/json'},
      body: JSON.stringify({ status: a.status === 'concluida' ? 'pendente' : 'concluida' })
    });
    await loadState(); renderContent();
  };
  delBtn.onclick = async () => {
    if (!confirm('Remover esta ação?')) return;
    await fetch('/api/action/'+a.id, { method:'DELETE' });
    await loadState(); renderContent();
  };
  return el;
}

function showPopup(e, txt){
  popup.textContent = txt;
  popup.classList.remove('hidden');
  moveTip(e);
}
function moveTip(e){
  const pad = 14;
  const w = popup.offsetWidth, h = popup.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 10) x = e.clientX - w - pad;
  if (y + h > innerHeight - 10) y = e.clientY - h - pad;
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
}
function hideTip(){ popup.classList.add('hidden'); }

const ARQ_SUBS = [
    {
      key: 'atual',
      label: 'Arquétipo Atual',
      tag: '01 · O QUE ELE É HOJE',
      render: () => `
        <h2 class="arq-h">O Arquétipo Atual: Governante + Herói</h2>
        <p>O posicionamento atual do Farias projeta uma combinação de dois arquétipos fortes. Cada um tem valor real, mas juntos criam um problema específico para o objetivo de high ticket.</p>
        <table class="arq-table">
          <thead><tr><th>O GOVERNANTE</th><th>O HERÓI</th></tr></thead>
          <tbody>
            <tr><td>Foca em ordem, método e controle.</td><td>Foca em superação, ação e performance.</td></tr>
            <tr><td>"Crescer sem método gera caos operacional."</td><td>"Meritocracia real. Crescimento por performance."</td></tr>
            <tr><td>Estabelece padrão, define o que é certo.</td><td>Combate o inimigo (ineficiência, falta de gestão).</td></tr>
            <tr><td>Postura séria, terno, anos sóbrios.</td><td>Imagens de tubarão, F1, xadrez, intensidade.</td></tr>
            <tr><td>Fala de sistema, previsibilidade, padrão.</td><td>Fala de batalha, vitória, conquista diária.</td></tr>
          </tbody>
        </table>
        <h3 class="arq-h3">Como isso aparece na comunicação hoje</h3>
        <ul>
          <li>Linguagem de executor: "fazer acontecer", "bater meta", "ritmo de sprint".</li>
          <li>Narrativa de quem resolve o problema, não de quem mapeia o território.</li>
          <li>Conteúdo centrado em gestão operacional e performance de time.</li>
          <li>Posicionamento de autoridade que compete com outros executivos, não que os orienta.</li>
        </ul>
        <h3 class="arq-h3">O problema de permanecer nesse posicionamento</h3>
        <div class="arq-box yellow">
          <p>No arquétipo Herói, o Farias ocupa o campo de batalha. Ele é quem luta contra a ineficiência. Ele é o São Jorge contra o dragão.</p>
          <p>O problema: ninguém paga R$ 100.000 para contratar outro Herói. Pagam para contratar quem já venceu o jogo que eles ainda estão tentando jogar.</p>
          <p class="arq-arrow">Para vender mentoria de alto ticket, ele precisa sair do campo de batalha e assumir o lugar de quem mapeia para quem ainda está nele.</p>
        </div>`
    },
    {
      key: 'desejado',
      label: 'Arquétipo Desejado',
      tag: '02 · O LUGAR DA TRANSIÇÃO',
      render: () => `
        <h2 class="arq-h">O Arquétipo Desejado: Governante + Sábio de Cicatriz</h2>
        <p>A transição não é descartar o que o Farias é. É elevar o registro. O Governante permanece como arquétipo primário, mas muda de papel: sai do combate e assume o trono. O Herói some da identidade dele e reaparece no cliente.</p>
        <table class="arq-table">
          <thead><tr><th>GOVERNANTE — Primário</th><th>SÁBIO DE CICATRIZ — Secundário</th></tr></thead>
          <tbody>
            <tr><td>Define o território. Não precisa provar que é capaz.</td><td>Sabedoria forjada em operação, não em estudo.</td></tr>
            <tr><td>Fala de posição de poder, não de competição.</td><td>A diferença do Seu Zé: apertar o parafuso certo.</td></tr>
            <tr><td>Quem ocupa o trono não combate. Direciona.</td><td>O que nenhum concorrente pode copiar: a cicatriz.</td></tr>
            <tr><td>Comunicação aristocrática no high ticket.</td><td>Autoridade que vem do fazer, não do conhecer.</td></tr>
            <tr><td>Atrai quem quer jogar o jogo de alto nível.</td><td>27 anos de operação real é o ativo, não o currículo.</td></tr>
          </tbody>
        </table>
        <h3 class="arq-h3">A diferença entre Sábio Acadêmico e Sábio de Cicatriz</h3>
        <p>O Sábio Acadêmico estuda, ensina, certifica. IBGC, FDC e Insper são Sábios Acadêmicos. Esse território já tem donos. Entrar ali é competir pela porta mais disputada.</p>
        <p>O Sábio de Cicatriz operou no nível que a maioria só lê sobre. Não ensina governança. Ensina o que aprendeu pagando caro para aprender.</p>
        <p class="arq-arrow">Farias não leu sobre McDonald's, Walmart e Board Academy. Ele construiu, errou, corrigiu e chegou. Essa diferença é irreplicável.</p>
        <h3 class="arq-h3">A mudança central na jornada do Herói</h3>
        <p>A transformação mais importante é uma troca de papel na narrativa:</p>
        <table class="arq-table">
          <thead><tr><th>POSIÇÃO ATUAL</th><th>O QUE MUDA</th><th>POSIÇÃO DESEJADA</th></tr></thead>
          <tbody>
            <tr><td>Farias é o Herói</td><td><em>Quem protagoniza a jornada</em></td><td>O cliente é o Herói</td></tr>
            <tr><td>Farias combate inimigos</td><td><em>Quem enfrenta obstáculos</em></td><td>O cliente enfrenta seus medos</td></tr>
            <tr><td>Farias entrega a solução</td><td><em>Quem entrega o auxílio sobrenatural</em></td><td>Farias entrega o mapa</td></tr>
            <tr><td>Conteúdo do fazedor</td><td><em>Tom e postura do conteúdo</em></td><td>Conteúdo do orientador</td></tr>
          </tbody>
        </table>`
    },
    {
      key: 'voz',
      label: 'Como a Voz Muda',
      tag: 'NA PRÁTICA',
      render: () => `
        <h2 class="arq-h">Na Prática, Como a Voz Muda</h2>
        <table class="arq-table">
          <thead><tr><th>COMO FALA HOJE</th><th>COMO PASSA A FALAR</th></tr></thead>
          <tbody>
            <tr><td>"Crescer sem método gera caos."</td><td>"O executivo que chegou ao topo sem método de decisão vai chegar ao teto antes do tempo."</td></tr>
            <tr><td>"Execute com padrão de excelência."</td><td>"Depois de 20 anos executando, você está pronto para um jogo diferente."</td></tr>
            <tr><td>"Mentalidade de dono é o que separa."</td><td>"A maioria confunde o cargo com o poder. O poder está na decisão, não no título."</td></tr>
            <tr><td>"Meta, ritmo e performance."</td><td>"Eu já operei o que você quer construir. Vou te mostrar o caminho de quem esteve lá."</td></tr>
          </tbody>
        </table>`
    },
    {
      key: 'ref-br',
      label: 'Referências Brasil',
      tag: '03 · QUEM JÁ FEZ ESSA TRANSIÇÃO',
      render: () => `
        <h2 class="arq-h">Quem já fez essa transição · Brasil</h2>
        <p>Cinco referências reais de pessoas que saíram do arquétipo Herói/Executor e assumiram o papel de Governante/Sábio de Cicatriz. Dois deles são referências declaradas do próprio Farias.</p>
        <article class="arq-ref">
          <header><strong>Flávio Augusto da Silva</strong> <span>@geracaodevalor — Referência declarada do Farias</span></header>
          <p><b>ANTES — O que era:</b> Fundou e construiu a Wizard do zero, com franquias pelo Brasil inteiro. Era o empreendedor em campo, o executivo que fez tudo acontecer. Comunicação alta intensidade, centrada no fazer e no crescimento acelerado.</p>
          <p><b>DEPOIS — O que se tornou:</b> Vendeu a Wizard por mais de R$ 2 bilhões. Parou de falar sobre como construir uma empresa e passou a falar sobre decisão, geração de valor e visão de longo prazo. Criou o @geracaodevalor e se tornou a referência para quem quer construir algo grande com propósito e método. Hoje não compete. Orienta.</p>
          <p class="arq-arrow"><b>O que o Farias extrai disso:</b> A venda da Wizard não foi o fim. Foi o ponto de virada onde ele saiu do campo e assumiu o posto de quem direciona. O Farias tem o mesmo ponto de virada disponível. Não das grandes corporações. Agora orienta quem quer chegar onde ele esteve.</p>
        </article>
        <article class="arq-ref">
          <header><strong>Alfredo Soares</strong> <span>@alfredosoares — Referência declarada do Farias</span></header>
          <p><b>ANTES — O que era:</b> Executivo com trajetória operacional intensa, passagem por grandes empresas e eventos como Rock in Rio. Era o cara que executava, entregava resultado e falava sobre fazer acontecer com energia e intensidade.</p>
          <p><b>DEPOIS — O que se tornou:</b> Criou o movimento "Não Pare" e se tornou referência para empreendedores e executivos que querem crescer sem parar de evoluir. Passou a falar de jornada, persistência e aprendizado contínuo. Hoje é mais reconhecido pelo movimento que criou do que pelas empresas onde trabalhou.</p>
          <p class="arq-arrow"><b>O que o Farias extrai disso:</b> Alfredo criou um movimento com nome próprio antes de ter todos os produtos prontos. O movimento veio primeiro, os produtos seguiram. O Farias tem o movimento "O Próximo Ciclo" e o mesmo potencial de fazer isso no mercado de executivos seniores.</p>
        </article>
        <article class="arq-ref">
          <header><strong>Alex Hormozi</strong> <span>@hormozi — Referência internacional de alta relevância</span></header>
          <p><b>ANTES — O que era:</b> Abriu academia de ginástica, escalou para mais de 30 unidades, quase faliu, reconstruiu. Era o operador que sabia exatamente como escalar um negócio de serviço. Comunicação intensa de quem está no campo, batendo meta todo dia.</p>
          <p><b>DEPOIS — O que se tornou:</b> Vendeu a operação de academias e criou a Acquisition.com. Passou a entregar gratuitamente tudo que aprendeu sobre vender, contratar, escalar, precificar. Hoje tem mais de 10 milhões de seguidores. Não vende o conhecimento. Vende o acesso a ele em alto nível. Os livros são gratuitos.</p>
          <p class="arq-arrow"><b>O que o Farias extrai disso:</b> A mentoria custa milhões. Hormozi demonstrou que dar o método publicamente não destrói o negócio de alto ticket. Pelo contrário: quem lê o livro é o quanto sabe, quer pagar para ter o acesso direto. O Farias pode fazer o mesmo com a travessia de carreira.</p>
        </article>`
    },
    {
      key: 'ref-int',
      label: 'Referências Internacionais',
      tag: '03B · INTERNACIONAIS',
      render: () => `
        <h2 class="arq-h">Quem já fez essa transição · Internacional</h2>
        <article class="arq-ref">
          <header><strong>Ray Dalio</strong> <span>@raydalio — O caso clássico de operador que virou Sábio de Cicatriz</span></header>
          <p><b>ANTES — O que era:</b> Fundou a Bridgewater Associates em 1975, construiu o maior fundo de hedge do mundo. Por décadas foi o executor, o gestor agressivo, o cara que tomava decisões difíceis com dados. Comunicação interna extremamente exigente e pouco conhecida fora do mercado financeiro.</p>
          <p><b>DEPOIS — O que se tornou:</b> Publicou "Principles" em 2017 e transformou décadas de decisão difícil em um framework público. Passou a ser a referência mundial em como tomar decisões em ambientes de incerteza. Não parou de operar. Mas o mundo o reconhece agora como o cara que codificou o jogo da decisão.</p>
          <p class="arq-arrow"><b>O que o Farias extrai disso:</b> Dalio não inventou a sabedoria. Ele a codificou depois de décadas praticando. O Farias tem o mesmo ativo: 27 anos de decisão real em operações de escala. A diferença está em organizar isso em um framework com nome e método próprios, como o "Seu Zé" já começa a fazer.</p>
        </article>
        <article class="arq-ref">
          <header><strong>Jack Welch</strong> <span>Chairman & CEO da GE por 20 anos</span></header>
          <p><b>ANTES — O que era:</b> Assumiu a GE em 1981 e a transformou em uma das maiores empresas do mundo. Era o Herói puro: agressivo, focado em corte de custo, performance e resultado imediato. Ficou conhecido como "Neutron Jack" pela intensidade com que reestruturava operações.</p>
          <p><b>DEPOIS — O que se tornou:</b> Saiu da GE em 2001 e passou a próxima década sendo a referência de como construir líderes e empresas de alto nível. Escreveu "Vencer", deu mentorias para CEOs globais, ensinou no MIT Sloan. Sua palavra valia mais hora da GE do que dentro. O legado não foi a empresa. Foi o método.</p>
          <p class="arq-arrow"><b>O que o Farias extrai disso:</b> Welch mostrou que 20 anos de execução se transformam em autoridade de mentor quando codificados e posicionados corretamente. O Farias tem a mesma janela: o que ele fez no Walmart, no Burger King e na Board Academy não é currículo. É o conteúdo do método que ele agora ensina.</p>
        </article>`
    },
    {
      key: 'mapa',
      label: 'Mapa da Transformação',
      tag: '04 · O MAPA DA TRANSFORMAÇÃO',
      render: () => `
        <h2 class="arq-h">O Mapa da Transformação</h2>
        <h3 class="arq-h3">O que muda em cada camada</h3>
        <table class="arq-table">
          <thead><tr><th>DE (ARQUÉTIPO ATUAL)</th><th>PARA (ARQUÉTIPO DESEJADO)</th></tr></thead>
          <tbody>
            <tr><td>Executor que combate o caos</td><td>Governante que define o próximo nível</td></tr>
            <tr><td>Autoridade que compete</td><td>Autoridade que orienta</td></tr>
            <tr><td>Conteúdo de performance diária</td><td>Conteúdo de decisão e legado</td></tr>
            <tr><td>"Faça assim que funciona"</td><td>"Eu já fiz. Vou te mostrar onde estão os parafusos"</td></tr>
            <tr><td>Herói da narrativa</td><td>Mentor da jornada do cliente</td></tr>
            <tr><td>Prova de resultado próprio</td><td>Prova pelo resultado do mentorado</td></tr>
            <tr><td>Alcança quem quer executar melhor</td><td>Alcança quem quer decidir melhor</td></tr>
            <tr><td>Vende produtividade e método</td><td>Vende acesso e transformação de carreira</td></tr>
          </tbody>
        </table>
        <h3 class="arq-h3">A frase que resume a transição</h3>
        <div class="arq-box yellow">
          <p>"Eu não estou mais no campo de batalha. Eu sou o general que já venceu essa guerra e agora mostra o mapa para quem precisa vencer a sua."</p>
          <p class="arq-arrow">Essa é a voz do Governante com Sábio de Cicatriz.</p>
          <p class="arq-arrow">Essa é a voz que fecha mentoria de R$ 80.000 a R$ 150.000.</p>
          <p class="arq-arrow">Essa é a voz que o Farias já tem dentro de si.</p>
          <p>O trabalho é trazê-la para a superfície da comunicação.</p>
        </div>
        <h3 class="arq-h3">Os três sinais de que a transição está acontecendo</h3>
        <ul>
          <li>O conteúdo começa a falar sobre o cliente como protagonista, não sobre Farias como solução.</li>
          <li>As histórias do passado corporativo passam a ser ensinamentos, não conquistas.</li>
          <li>O CTA deixa de ser "aprenda comigo" e passa a ser "vamos trabalhar juntos".</li>
        </ul>`
    }
  ];

function arquetiposBlock(){
  const subs = ARQ_SUBS;
  return {
    title: 'Arquétipos',
    custom: true,
    render: () => {
      const wrap = document.createElement('section');
      wrap.className = 'card arq-card';
      const header = document.createElement('div');
      header.className = 'arq-header';
      header.innerHTML = `
        <div class="arq-eyebrow">Posicionamento Arquetípico</div>
        <h1 class="arq-title">Farias Souza · Mapa de Reposicionamento</h1>
        <p class="arq-sub">Do Herói no campo de batalha ao Governante com Sábio de Cicatriz no trono.</p>`;
      wrap.appendChild(header);

      const subnav = document.createElement('nav');
      subnav.className = 'arq-subnav';
      subs.forEach((s, i) => {
        const b = document.createElement('button');
        b.className = 'arq-subtab' + (state.arqSub === i ? ' active' : '');
        b.innerHTML = `<span class="arq-num">${String(i+1).padStart(2,'0')}</span><span class="arq-lbl">${s.label}</span>`;
        b.onclick = () => { state.arqSub = i; renderContent(); };
        subnav.appendChild(b);
      });
      wrap.appendChild(subnav);

      const body = document.createElement('div');
      body.className = 'arq-body';
      const cur = subs[state.arqSub] || subs[0];
      body.innerHTML = `<div class="arq-tag">${cur.tag}</div>${cur.render()}`;
      wrap.appendChild(body);

      return wrap;
    }
  };
}

async function loadDoc(){
  const r = await fetch('/api/doc').then(r=>r.json());
  state.paras = r.paras || [];
  const docBlocks = buildBlocks(state.paras);
  state.blocks = [arquetiposBlock(), ...docBlocks];
}

/* ---------- Busca global ---------- */
const SEARCH_INDEX = [];

function stripTagsToText(html){
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent.replace(/\s+/g, ' ').trim();
}

function normalizeForSearch(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
}

function escSearch(s){
  return (s||'').replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
}

function highlightHit(text, q){
  if (!text) return '';
  if (!q) return escSearch(text);
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let i = lower.indexOf(ql);
  if (i < 0) {
    const nText = normalizeForSearch(text);
    const nQ = normalizeForSearch(q);
    const j = nText.indexOf(nQ);
    if (j < 0) return escSearch(text);
    return escSearch(text.slice(0,j)) + '<mark>' + escSearch(text.slice(j, j+q.length)) + '</mark>' + escSearch(text.slice(j+q.length));
  }
  return escSearch(text.slice(0,i)) + '<mark>' + escSearch(text.slice(i, i+q.length)) + '</mark>' + escSearch(text.slice(i+q.length));
}

function snippetAround(text, q){
  if (!text) return '';
  const lower = text.toLowerCase();
  let i = lower.indexOf(q.toLowerCase());
  if (i < 0) {
    const nText = normalizeForSearch(text);
    const nQ = normalizeForSearch(q);
    i = nText.indexOf(nQ);
  }
  if (i < 0) return text.slice(0, 140);
  const start = Math.max(0, i - 50);
  const end = Math.min(text.length, i + q.length + 110);
  let s = text.slice(start, end);
  if (start > 0) s = '...' + s;
  if (end < text.length) s = s + '...';
  return s;
}

function buildSearchIndex(){
  SEARCH_INDEX.length = 0;
  SEARCH_INDEX.push({
    crumb: 'Início',
    title: 'Posicionamento Arquetípico e Estratégias de Posicionamento',
    text: 'página inicial home abertura',
    target: { current: -1, arqSub: 0 }
  });
  state.blocks.forEach((b, i) => {
    if (b.custom && b.title === 'Arquétipos') {
      ARQ_SUBS.forEach((s, j) => {
        SEARCH_INDEX.push({
          crumb: 'Arquétipos',
          title: s.label,
          text: stripTagsToText(s.render()),
          target: { current: i, arqSub: j }
        });
      });
    } else {
      const text = (b.paras||[]).map(p =>
        (p.runs||[]).map(r => cleanText(r.t||'')).join(' ')
      ).join(' ');
      SEARCH_INDEX.push({
        crumb: 'Bloco',
        title: cleanTitle(b.title),
        text,
        target: { current: i, arqSub: 0 }
      });
    }
  });
}

function navigateToSearchTarget(target){
  state.current = target.current;
  state.arqSub = target.arqSub || 0;
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');
  const results = document.getElementById('search-results');
  if (input) input.value = '';
  if (clear) clear.hidden = true;
  if (results) { results.hidden = true; results.innerHTML = ''; }
  renderTabs();
  renderContent();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function runSearch(q){
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;
  if (!q || q.length < 2) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    return;
  }
  const nq = normalizeForSearch(q);
  const hits = [];
  SEARCH_INDEX.forEach(e => {
    const nTitle = normalizeForSearch(e.title);
    const nText = normalizeForSearch(e.text);
    let score = 0;
    if (nTitle.startsWith(nq)) score += 200;
    else if (nTitle.includes(nq)) score += 120;
    if (nText.includes(nq)) score += 20;
    if (score) hits.push({ entry: e, score });
  });
  hits.sort((a,b) => b.score - a.score);
  const top = hits.slice(0, 12);
  if (!top.length) {
    resultsEl.innerHTML = '<div class="search-empty">Nada encontrado</div>';
    resultsEl.hidden = false;
    return;
  }
  resultsEl.innerHTML = top.map((h, i) => {
    const e = h.entry;
    const showSnippet = !normalizeForSearch(e.title).includes(nq);
    return `
      <button class="search-result${i === 0 ? ' focused' : ''}" data-idx="${i}">
        <div class="sr-crumb">${escSearch(e.crumb)}</div>
        <div class="sr-title">${highlightHit(e.title, q)}</div>
        ${showSnippet && e.text ? `<div class="sr-snippet">${highlightHit(snippetAround(e.text, q), q)}</div>` : ''}
      </button>`;
  }).join('');
  resultsEl.hidden = false;
  resultsEl.querySelectorAll('.search-result').forEach((btn, i) => {
    btn.onclick = () => navigateToSearchTarget(top[i].entry.target);
  });
}

function wireSearch(){
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');
  const results = document.getElementById('search-results');
  if (!input || !clear || !results) return;

  input.addEventListener('input', () => {
    const v = input.value.trim();
    clear.hidden = !v;
    runSearch(v);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = ''; clear.hidden = true; results.hidden = true;
    } else if (e.key === 'Enter') {
      const focused = results.querySelector('.search-result.focused') || results.querySelector('.search-result');
      if (focused) focused.click();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = Array.from(results.querySelectorAll('.search-result'));
      if (!items.length) return;
      let idx = items.findIndex(el => el.classList.contains('focused'));
      idx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx <= 0 ? items.length - 1 : idx - 1);
      items.forEach(el => el.classList.remove('focused'));
      items[idx].classList.add('focused');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  });
  clear.addEventListener('click', () => {
    input.value = ''; clear.hidden = true; results.hidden = true; input.focus();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.side-search')) results.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input.focus(); input.select();
    }
  });
}
async function loadState(){
  const r = await fetch('/api/state').then(r=>r.json());
  state.answers = {};
  (r.answers||[]).forEach(a => state.answers[a.question_key] = a);
  state.actions = r.actions || [];
}
async function loadOverrides(){
  const r = await fetch('/api/overrides').then(r=>r.json()).catch(()=>({overrides:{}}));
  state.overrides = r.overrides || {};
}

(async () => {
  await loadDoc();
  await loadState();
  await loadOverrides();
  buildSearchIndex();
  wireSearch();
  renderTabs();
  renderContent();
})();
