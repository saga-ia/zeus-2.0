(function(){
'use strict';

const SECTIONS = [
  {
    n: 1, title: '1. Início', tag: 'Identificação',
    fields: [
      { key: 'nome', label: 'Nome completo', type: 'text', required: true },
      { key: 'telefone', label: 'Telefone com DDD', type: 'tel', required: true, hint: '(ex: 11 91234-5678)' },
      { key: 'email', label: 'Melhor e-mail', type: 'email', required: true },
      { key: 'foto', label: 'Foto para cadastro', type: 'photo' }
    ]
  },
  {
    n: 2, title: '2. Conhecendo o especialista', tag: 'Sobre você',
    fields: [
      { key: 'instagram', label: 'Qual o @ do seu Instagram', type: 'text', required: true },
      { key: 'historia_pessoal', label: 'História pessoal/profissional', hint: 'Uma breve descrição de sua trajetória até aqui.', type: 'textarea', required: true },
      { key: 'produtos_servicos_brief', label: 'Me fala sobre seus produtos ou serviços', hint: 'Quais são, e como são entregues aos clientes.', type: 'textarea', required: true },
      { key: 'cargo', label: 'Cargo ou profissão principal', type: 'text', required: true },
      { key: 'empresa', label: 'Empresa (se houver)', type: 'text' },
      { key: 'redes', label: 'Website e redes sociais', hint: 'LinkedIn, Instagram, Facebook, etc.', type: 'textarea' },
      { key: 'valores_pessoais', label: 'Valores pessoais que você gostaria de transmitir', type: 'textarea', required: true },
      { key: 'valores_profissionais', label: 'Valores profissionais que você gostaria de transmitir', type: 'textarea', required: true },
      { key: 'proposito_pessoal', label: 'Qual o seu propósito pessoal?', hint: 'O que te move a fazer o que faz?', type: 'textarea', required: true },
      { key: 'proposito_profissional', label: 'Qual o seu propósito profissional?', hint: 'O que te move a fazer o que faz?', type: 'textarea', required: true },
      { key: 'descricao_publico', label: 'Como gostaria que o público descrevesse você em uma frase?', type: 'textarea', required: true }
    ]
  },
  {
    n: 3, title: '3. Produtos e Serviços', tag: 'Oferta',
    fields: [
      { key: 'principais_produtos', label: 'Quais são os principais produtos ou serviços que você oferece?', type: 'textarea', required: true },
      { key: 'descricao_produtos', label: 'Descreva brevemente cada um deles', hint: 'Quais problemas resolvem, quais benefícios oferecem.', type: 'textarea', required: true },
      { key: 'diferencial', label: 'Qual o principal diferencial em comparação com a concorrência?', type: 'textarea', required: true },
      { key: 'produto_novo', label: 'Há algum produto ou serviço novo que você gostaria de destacar?', type: 'textarea' },
      { key: 'objecoes', label: 'Principais objeções que seus clientes costumam ter ao comprar?', type: 'textarea', required: true }
    ]
  },
  {
    n: 4, title: '4. Público-Alvo', tag: 'Cliente ideal',
    fields: [
      { key: 'publico_principal', label: 'Quem é o seu público-alvo principal?', type: 'textarea', required: true },
      { key: 'faixa_etaria', label: 'Qual a faixa etária do seu público-alvo?', type: 'text', required: true },
      { key: 'interesses', label: 'Interesses principais do seu público', hint: 'O que gostam, fazem no tempo livre, preocupações, aspirações.', type: 'textarea', required: true },
      { key: 'ocupacao', label: 'Qual a ocupação ou status profissional do público?', hint: 'Empresários, autônomos, profissionais liberais, etc.', type: 'textarea', required: true },
      { key: 'escolaridade', label: 'Nível de escolaridade e conhecimento', hint: 'Cursos/áreas de formação mais comuns.', type: 'textarea' },
      { key: 'dores', label: 'Principais "dores" do público e como você resolve', type: 'textarea', required: true },
      { key: 'consciencia', label: 'Nível de consciência do público', hint: 'Desconhece o problema? Sabe do problema mas não da solução? Conhece soluções mas não você? Pronto pra comprar?', type: 'textarea', required: true },
      { key: 'percepcao', label: 'Como você acha que seu público te enxerga atualmente?', type: 'textarea', required: true },
      { key: 'desafios', label: 'Quais os desafios que você enfrenta?', type: 'textarea', required: true },
      { key: 'medos', label: 'Quais os medos que você tem?', type: 'textarea', required: true }
    ]
  },
  {
    n: 5, title: '5. Concorrência e Mercado', tag: 'Mercado',
    fields: [
      { key: 'concorrentes', label: 'Quem são seus principais concorrentes (nomes ou marcas)?', type: 'textarea', required: true },
      { key: 'diferenciacao', label: 'Como você se diferencia deles?', type: 'textarea', required: true },
      { key: 'ameacas', label: 'Quais são as maiores ameaças ou desafios no seu setor atualmente?', type: 'textarea', required: true },
      { key: 'mercado_nao_entendeu', label: 'O que o mercado ainda não entendeu sobre você ou seu produto?', type: 'textarea' },
      { key: 'concorrentes_ruins', label: 'Concorrentes que não fazem um bom trabalho?', type: 'textarea' }
    ]
  },
  {
    n: 6, title: '6. Objetivos e Metas', tag: 'Direção',
    fields: [
      { key: 'objetivo_principal', label: 'Qual o principal objetivo deste trabalho de posicionamento?', type: 'textarea', required: true },
      { key: 'objetivo_outros', label: 'Se a resposta foi "outros", explique', type: 'textarea' },
      { key: 'metas_6m', label: 'Metas principais para os próximos 6 meses', hint: 'Aumentar seguidores, fechar mais vendas, expandir mercados, etc.', type: 'textarea', required: true },
      { key: 'autoridade', label: 'Em que você gostaria de ser reconhecido(a) como autoridade?', type: 'textarea', required: true }
    ]
  },
  {
    n: 7, title: '7. Estilo de Comunicação e Branding', tag: 'Voz',
    fields: [
      { key: 'tom', label: 'Como você gostaria que fosse o tom da sua comunicação?', type: 'textarea', required: true },
      { key: 'sentimento', label: 'Sentimento ou emoção principal a transmitir', hint: 'Alegria, inspiração, confiança, seriedade.', type: 'textarea', required: true },
      { key: 'palavras', label: 'Palavras ou termos específicos que gostaria de usar com frequência', type: 'textarea' },
      { key: 'referencias_perfis', label: 'Referências (perfis @ que gostaria de modelar)', type: 'textarea' },
      { key: 'referencias_links', label: 'Referências (links pra eu poder ver)', type: 'textarea' }
    ]
  },
  {
    n: 8, title: '8. Histórico e Resultados', tag: 'Track record',
    fields: [
      { key: 'investiu_antes', label: 'Já investiu em posicionamento digital antes?', hint: 'O que funcionou? O que não deu certo?', type: 'textarea', required: true },
      { key: 'presenca_atual', label: 'Sua presença atual nas redes', hint: 'Número de seguidores, engajamento, etc.', type: 'textarea', required: true },
      { key: 'cases', label: 'Algum case de sucesso (cliente satisfeito, resultado marcante)?', type: 'textarea' }
    ]
  },
  {
    n: 9, title: '9. Expectativas e Preferências', tag: 'Trabalho',
    fields: [
      { key: 'expectativas', label: 'Quais são suas expectativas para este trabalho?', type: 'textarea', required: true },
      { key: 'referencias_estudo', label: 'Referências de estudo / material de apoio', type: 'textarea' },
      { key: 'ferramentas', label: 'Ferramentas/plataformas que já utiliza', hint: 'Instagram, YouTube, Blog, E-mail marketing, etc.', type: 'textarea', required: true },
      { key: 'equipe_suporte', label: 'Tem equipe de suporte ou faz tudo independente?', type: 'textarea', required: true },
      { key: 'envolvimento', label: 'Prefere participar ativamente da criação de conteúdo ou prefere delegar?', type: 'textarea', required: true }
    ]
  },
  {
    n: 10, title: '10. Sua História', tag: 'Jornada',
    subtitle: 'Me conte com detalhes quem você é, como foi sua infância, adolescência. O que você fazia, como foi sua vida nessa época. Me diga quais eram seus sonhos.',
    fields: [
      { key: 'historia_completa', label: 'Sua história — sem filtro, como se contasse pra alguém de confiança', hint: 'Mínimo 500 caracteres. Não precisa ficar bonito.', type: 'textarea', required: true, minLength: 500, big: true },
      { key: 'info_essencial', label: 'Existe alguma informação essencial que ainda não abordamos?', type: 'textarea' }
    ]
  }
];

const TOTAL = SECTIONS.length;
const state = {
  sessionId: null,
  current: 0,
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

function detectSlug(){
  const url = new URL(window.location.href);
  const qSlug = (url.searchParams.get('u') || url.searchParams.get('slug') || '').toLowerCase().trim();
  if (qSlug) return qSlug;
  const host = window.location.hostname.toLowerCase();
  const m = host.match(/^([a-z0-9-]+)\.jefersonhenrike\.com$/);
  if (m && m[1] !== 'onboarding' && m[1] !== 'www') return m[1];
  return null;
}

async function startSession(){
  const slug = detectSlug();
  try {
    const r = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slug ? { slug } : {})
    });
    const j = await r.json();
    state.sessionId = j.session_id;
    if (j.answers && typeof j.answers === 'object') {
      Object.assign(state.answers, j.answers);
    }
    const tag = document.getElementById('sessionTag');
    if (tag) tag.textContent = slug ? ('formulário · ' + slug) : ('sessão ' + j.session_id);
  } catch(e){
    console.error('session error', e);
  }
}

function renderSection(sectionIdx){
  const mount = document.getElementById('sectionMount');
  $$('section.card').forEach(s => s.hidden = true);

  if (sectionIdx === 0){
    document.querySelector('section.card.hero').hidden = false;
    setProgress(0, TOTAL);
    return;
  }

  if (sectionIdx > TOTAL){
    document.querySelector('section.card.done').hidden = false;
    setProgress(TOTAL + 1, TOTAL);
    return;
  }

  const sec = SECTIONS[sectionIdx - 1];
  let html = `<section class="card" data-section="${sec.n}">
    <span class="section-tag">${sec.tag} · seção ${sec.n} de ${TOTAL}</span>
    <h2>${sec.title}</h2>`;
  if (sec.subtitle) html += `<p class="subtitle">${sec.subtitle}</p>`;

  for (const f of sec.fields){
    const prev = state.answers[f.key] || '';
    const req = f.required ? '<span class="req">*</span>' : '';
    const hint = f.hint ? `<span class="hint">${f.hint}</span>` : '';
    if (f.type === 'photo'){
      html += `<div class="field">
        <label>${f.label}${req}</label>
        ${hint}
        <label class="file-drop" for="file_${f.key}">
          <p><strong>Clique para enviar</strong> ou arraste uma foto aqui</p>
          <p style="font-size:12px">JPG, PNG ou WEBP — máx 8MB</p>
        </label>
        <input id="file_${f.key}" type="file" accept="image/jpeg,image/png,image/webp" data-key="${f.key}" />
        <div class="photo-preview" id="prev_${f.key}"><img alt="preview"/></div>
      </div>`;
    } else if (f.type === 'textarea'){
      const big = f.big ? ' style="min-height:280px"' : '';
      html += `<div class="field">
        <label for="i_${f.key}">${f.label}${req}</label>
        ${hint}
        <textarea id="i_${f.key}" data-key="${f.key}" data-required="${f.required?1:0}" data-min="${f.minLength||0}"${big}>${escapeHtml(prev)}</textarea>
      </div>`;
    } else {
      html += `<div class="field">
        <label for="i_${f.key}">${f.label}${req}</label>
        ${hint}
        <input id="i_${f.key}" type="${f.type}" data-key="${f.key}" data-required="${f.required?1:0}" value="${escapeHtml(prev)}" />
      </div>`;
    }
  }

  html += `<div class="actions">
    <button class="btn ghost" data-action="back" ${sectionIdx === 1 ? 'disabled' : ''}>Voltar</button>
    <span class="save-status" id="saveStatus"></span>
    <button class="btn primary pulse" data-action="next">${sectionIdx === TOTAL ? 'Finalizar' : 'Continuar'}</button>
  </div>
  </section>`;

  mount.innerHTML = html;
  setProgress(sectionIdx, TOTAL);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const photoInput = mount.querySelector('input[type=file]');
  if (photoInput) photoInput.addEventListener('change', onPhotoChange);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
      const r = await fetch('/api/photo', {
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

function collectAnswers(sectionIdx){
  if (sectionIdx < 1 || sectionIdx > TOTAL) return [];
  const sec = SECTIONS[sectionIdx - 1];
  const out = [];
  for (const f of sec.fields){
    if (f.type === 'photo') continue;
    const el = document.getElementById('i_' + f.key);
    if (!el) continue;
    const value = (el.value || '').trim();
    state.answers[f.key] = value;
    out.push({ key: f.key, label: f.label, value: value });
  }
  return out;
}

function validate(sectionIdx){
  if (sectionIdx < 1 || sectionIdx > TOTAL) return true;
  const sec = SECTIONS[sectionIdx - 1];
  for (const f of sec.fields){
    if (f.type === 'photo') continue;
    const el = document.getElementById('i_' + f.key);
    if (!el) continue;
    const v = (el.value || '').trim();
    if (f.required && !v){
      el.focus();
      el.style.borderColor = 'var(--red)';
      flashStatus('Preencha os campos obrigatórios', 'error');
      setTimeout(() => { el.style.borderColor = ''; }, 1800);
      return false;
    }
    if (f.minLength && v.length < f.minLength){
      el.focus();
      flashStatus(`Mínimo ${f.minLength} caracteres (você tem ${v.length})`, 'error');
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

async function saveSection(sectionIdx, answers){
  flashStatus('Salvando...', 'saving');
  try {
    const r = await fetch('/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId, section: sectionIdx, answers })
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
    await fetch('/api/complete', {
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
    if (state.current >= 1 && state.current <= TOTAL){
      if (!validate(state.current)) return;
      const answers = collectAnswers(state.current);
      await saveSection(state.current, answers);
    }
    state.current += 1;
    if (state.current > TOTAL){ await complete(); }
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
  await startSession();
  renderSection(0);
})();
})();
