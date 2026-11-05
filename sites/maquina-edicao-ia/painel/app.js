(() => {
  'use strict';

  const source = window.caixaPreta || {};
  const bonus = source.kind === 'bonus';
  const list = value => Array.isArray(value) ? value : [];
  const text = value => value == null ? '' : String(value);
  const escape = value => text(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const slug = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const two = value => String(value).padStart(2, '0');
  const brand = bonus ? 'Skills Bônus' : 'Caixa Preta';
  const main = document.getElementById('main');
  const nav = document.getElementById('nav');
  const toast = document.getElementById('toast');
  if (!main || !nav) return;

  const usedRoutes = new Set();
  function prepare(items, prefix, fallback) {
    return list(items).filter(item => item && typeof item === 'object').map((item, index) => {
      let id = slug(item.id) || `${fallback}${two(index + 1)}`;
      let route = id.startsWith(`${prefix}-`) ? id : `${prefix}-${id}`;
      if (usedRoutes.has(route)) route += `-${index + 1}`;
      usedRoutes.add(route);
      return {...item, _route: route, _index: index};
    });
  }
  const skills = prepare(source.skills, 'skill', 'skill-');
  const presets = bonus ? [] : prepare(source.presets, 'modelo', '');
  const commands = bonus ? [] : prepare(source.commands, 'comando', 'cmd-');
  const downloads = list(source.downloads).filter(item => item && typeof item === 'object');
  const builders = new Map();
  const memory = new Map();
  const search = {query: '', category: ''};
  let storageAvailable = true;
  let toastTimer;
  let rendered = false;

  function localHref(value) {
    const path = text(value).trim();
    if (!path || /^[a-z][a-z\d+.-]*:/i.test(path) || /^[\\/]/.test(path) || /[?#\u0000-\u001f]/.test(path)) return '';
    const parts = path.replace(/\\/g, '/').split('/').filter(part => part && part !== '.');
    if (!parts.length || parts.includes('..')) return '';
    return `../${parts.map(encodeURIComponent).join('/')}`;
  }

  function localLink(path, label, className = 'btn secondary', download = false) {
    const href = localHref(path);
    return href ? `<a class="${escape(className)}" href="${escape(href)}"${download ? ' download' : ''}>${escape(label)}</a>` : '';
  }

  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4800);
  }

  function readValues(id) {
    if (memory.has(id)) return memory.get(id);
    let values = Object.create(null);
    try {
      const raw = window.localStorage.getItem(`caixa-preta:v1:${bonus ? 'bonus' : 'premium'}:${id}`);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const [key, value] of Object.entries(saved)) if (typeof value === 'string') values[key] = value;
      }
    } catch (_) { storageAvailable = false; }
    memory.set(id, values);
    return values;
  }

  function saveValues(id, values) {
    memory.set(id, values);
    try { window.localStorage.setItem(`caixa-preta:v1:${bonus ? 'bonus' : 'premium'}:${id}`, JSON.stringify(values)); }
    catch (_) { storageAvailable = false; }
  }

  function placeholders(prompt) {
    const result = [];
    const seen = new Set();
    for (const match of text(prompt).matchAll(/\[([^\[\]\r\n]+)\]/g)) {
      const key = match[1].trim();
      if (key && !seen.has(key)) { seen.add(key); result.push(key); }
    }
    return result;
  }

  function compose(builder) {
    return builder.prompt.replace(/\[([^\[\]\r\n]+)\]/g, (whole, raw) => {
      const value = builder.values[raw.trim()];
      return typeof value === 'string' && value.trim() ? value.trim() : whole;
    });
  }

  function progress(builder) {
    const filled = builder.fields.filter(key => text(builder.values[key]).trim()).length;
    let label = builder.fields.length ? `${filled} de ${builder.fields.length} campos preenchidos. Vazios mantêm os colchetes.` : 'Comando completo, sem campos para preencher.';
    if (!storageAvailable) label += ' Salvamento local indisponível; copie antes de fechar.';
    return label;
  }

  function promptBuilder(id, title, prompt) {
    const key = `prompt-${slug(id) || 'principal'}`;
    const value = text(prompt);
    if (!value.trim()) return '<p class="empty">Este comando ainda não foi incluído nos dados do pacote.</p>';
    const builder = {id: key, title: text(title), prompt: value, fields: placeholders(value), values: readValues(key)};
    builders.set(key, builder);
    return `<section class="builder" data-builder="${escape(key)}" aria-labelledby="${escape(key)}-title">
      <div class="builder-head"><h3 id="${escape(key)}-title">${escape(title)}</h3><p>Preencha com os dados do seu projeto. Para um item opcional ausente, escreva “não fornecido”. Os valores ficam apenas neste navegador.</p></div>
      ${builder.fields.length ? `<div class="fields">${builder.fields.map((field, index) => `<label for="${escape(key)}-field-${index}">${escape(field)}<textarea id="${escape(key)}-field-${index}" data-builder-field="${index}" placeholder="${escape(`[${field}]`)}" spellcheck="false">${escape(builder.values[field] || '')}</textarea></label>`).join('')}</div>` : '<div class="fields"><p class="progress-label">Leia o comando e confira se ele corresponde ao resultado que você quer.</p></div>'}
      <div class="prompt-actions"><button type="button" class="btn" data-action="copy">Copiar comando completo</button><button type="button" class="btn secondary" data-action="download">Baixar TXT</button>${builder.fields.length ? '<button type="button" class="btn secondary" data-action="clear">Limpar campos</button>' : ''}<span class="progress-label" data-progress aria-live="polite">${escape(progress(builder))}</span></div>
      <details class="prompt-display"><summary>Ver comando completo</summary><pre data-preview tabindex="0">${escape(compose(builder))}</pre></details>
    </section>`;
  }

  function refreshBuilder(element, builder) {
    const preview = element.querySelector('[data-preview]');
    const label = element.querySelector('[data-progress]');
    if (preview) preview.textContent = compose(builder);
    if (label) label.textContent = progress(builder);
  }

  function bulletList(values, emptyText = 'Nenhum item adicional indicado.') {
    const items = list(values);
    return items.length ? `<ul>${items.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : `<p>${escape(emptyText)}</p>`;
  }

  function skillLinks(ids) {
    return list(ids).map(id => {
      const found = skills.find(skill => text(skill.id) === text(id));
      return found ? `<a class="chip" href="#${escape(found._route)}">${escape(found.title || found.id)}</a>` : `<span class="chip">${escape(id)}</span>`;
    }).join('');
  }

  function demoVideo(media, options = {}) {
    const item = media && typeof media === 'object' ? media : {};
    const href = localHref(item.video);
    if (!href) return '';
    const poster = localHref(item.poster);
    const inLink = options.inLink === true;
    const caption = options.caption ? `<figcaption>${options.caption}</figcaption>` : '';
    const attrs = inLink ? ' aria-hidden="true" tabindex="-1"' : ` controls aria-label="${escape(options.label || '')}"`;
    return `<figure class="demo ${escape(options.className || '')}"><div class="demo-stage"><video data-model-video${attrs} autoplay muted loop playsinline preload="metadata"${poster ? ` poster="${escape(poster)}"` : ''} src="${escape(href)}"></video></div>${caption}</figure>`;
  }

  function tutorialSection() {
    const tutorial = source.tutorial && typeof source.tutorial === 'object' ? source.tutorial : null;
    if (!tutorial || !localHref(tutorial.video)) return '';
    const steps = list(tutorial.steps);
    return `<section class="tutorial" aria-labelledby="tutorial-title"><div class="tutorial-copy"><p class="eyebrow">${escape(tutorial.eyebrow || 'Tutorial em vídeo')}</p><h2 id="tutorial-title">${escape(tutorial.title || 'Tutorial')}</h2>${tutorial.description ? `<p>${escape(tutorial.description)}</p>` : ''}</div>${demoVideo(tutorial, {className: 'demo-tutorial', label: tutorial.title || 'Tutorial', caption: tutorial.note ? `<p>${escape(tutorial.note)}</p>` : ''})}${steps.length ? `<ol class="tutorial-steps">${steps.map((step, index) => `<li><span>${two(index + 1)}</span>${escape(step)}</li>`).join('')}</ol>` : ''}</section>`;
  }

  function skillCards(items = skills) {
    if (!items.length) return '<p class="empty">Nenhuma skill foi incluída neste pacote.</p>';
    return `<div class="grid">${items.map(skill => {
      const demo = demoVideo(skill.demo, {className: 'demo-card', inLink: true});
      const body = `<span class="number">${skill.master ? 'SKILL MESTRE / COMECE COM UMA REFERÊNCIA' : `SKILL ${two(skill._index + 1)}`}</span><h3>${escape(skill.title || skill.id)}</h3><p>${escape(skill.description)}</p>${skill.master ? '<div class="chips"><span class="chip">Analisa o vídeo</span><span class="chip">Extrai os padrões</span><span class="chip">Prepara a direção</span></div>' : ''}<small>Quando usar e comando de ativação →</small>`;
      return `<a class="card${skill.master ? ' master-card' : ''}${demo ? ' has-demo' : ''}" href="#${escape(skill._route)}">${demo}${skill.master && demo ? `<div class="master-body">${body}</div>` : body}</a>`;
    }).join('')}</div>`;
  }

  function modelVideo(preset, detail = false) {
    const sample = preset.sample && typeof preset.sample === 'object' ? preset.sample : {};
    const href = localHref(sample.video);
    if (!href) return '';
    const poster = localHref(sample.poster);
    const duration = Number(sample.durationSeconds);
    const durationLabel = Number.isFinite(duration) && duration > 0 ? duration.toLocaleString('pt-BR', {maximumFractionDigits: 2}) : '5';
    const captionId = `${preset._route}-${detail ? 'detail' : 'card'}-sample-caption`;
    const format = sample.format === '9:16' ? 'portrait' : 'landscape';
    return `<figure class="model-sample ${detail ? 'model-sample-detail' : 'model-sample-card'} ${format}"><div class="model-video-stage"><video data-model-video controls autoplay muted loop playsinline preload="metadata"${poster ? ` poster="${escape(poster)}"` : ''} src="${escape(href)}" aria-label="${escape(`Exemplo de ${preset.title}`)}" aria-describedby="${escape(captionId)}">Seu navegador não reproduz este vídeo. ${localLink(sample.video, 'Abrir vídeo', 'video-fallback')}</video></div><figcaption id="${escape(captionId)}"><strong>Exemplo renderizado · ${escape(durationLabel)}s</strong>${detail ? '<p>Este é o resultado com os materiais indicados. Outros vídeos podem produzir variações.</p>' : ''}</figcaption></figure>`;
  }

  function sampleDetails(preset) {
    const sample = preset.sample && typeof preset.sample === 'object' ? preset.sample : null;
    if (!sample || !localHref(sample.video)) return '';
    const materialLinks = localLink(sample.commandPath, 'Baixar comando aplicado ↓', 'btn secondary', true) + localLink(sample.sourceVideo, 'Baixar trecho de entrada ↓', 'btn secondary', true);
    return `<details class="sample-method"><summary>Como este exemplo foi feito</summary><div class="sample-method-body">${sample.sourceSummary ? `<section><h3>Fonte utilizada</h3><p>${escape(sample.sourceSummary)}</p></section>` : ''}${list(sample.changes).length ? `<section><h3>O que mudou nesta edição</h3>${bulletList(sample.changes)}</section>` : ''}${list(sample.preExisting).length ? `<section><h3>Elementos que já estavam na entrada</h3>${bulletList(sample.preExisting)}</section>` : ''}${sample.notes ? `<section><h3>Observações</h3><p>${escape(sample.notes)}</p></section>` : ''}${materialLinks ? `<section><h3>Comando e materiais deste exemplo</h3><div class="actions">${materialLinks}</div></section>` : ''}</div></details>`;
  }

  function presetCards(items = presets) {
    if (!items.length) return '<p class="empty">Os modelos ainda não foram incluídos nos dados do pacote.</p>';
    return `<div class="grid model-grid">${items.map(preset => `<article class="card model-card" aria-labelledby="${escape(preset._route)}-card-title">${modelVideo(preset)}<a class="model-card-body" href="#${escape(preset._route)}"><span class="number">MODELO ${two(preset._index + 1)}</span><h3 id="${escape(preset._route)}-card-title">${escape(preset.title)}</h3><p>${escape(preset.description)}</p><small>Ver comando e materiais →</small></a></article>`).join('')}</div>`;
  }

  function commandCards(items) {
    return items.length ? `<div class="command-list">${items.map(command => `<a class="command-card" href="#${escape(command._route)}"><div><small>${escape(command.category || 'COMANDO')} / ${escape(command.id || two(command._index + 1))}</small><h3>${escape(command.title)}</h3><p>${escape(command.whenToUse)}</p></div><span aria-hidden="true">↗</span></a>`).join('')}</div>` : '<p class="empty">Nenhum comando encontrado. Tente outra palavra ou categoria.</p>';
  }

  function top(title, intro, eyebrow = '', back = '', code = '') {
    return `${back ? `<a class="back" href="#${escape(back)}">← Voltar à biblioteca</a>` : ''}${eyebrow ? `<p class="eyebrow">${escape(eyebrow)}</p>` : ''}<div class="detail-top"><h1>${escape(title)}</h1>${code ? `<span class="code" aria-hidden="true">${escape(code)}</span>` : ''}</div>${intro ? `<p class="intro">${escape(intro)}</p>` : ''}`;
  }

  function home() {
    return `<section class="hero"><div><p class="eyebrow">Máquina de Edição IA / ${bonus ? 'Material complementar' : 'Biblioteca de produção'}</p><h1>${bonus ? 'Skills<br><span>Bônus.</span>' : 'Caixa<br><span>Preta.</span>'}</h1><p class="intro">${bonus ? 'Três skills para orientar o briefing, cuidar das legendas e revisar com menos retrabalho.' : 'Escolha a direção do vídeo, preencha seu projeto e leve um pedido completo para o seu agente.'}</p><div class="actions"><a class="btn" href="#${bonus ? 'skills' : 'modelos'}">${bonus ? 'Explorar as skills' : 'Escolher um modelo'} ↗</a><a class="btn secondary" href="#instalar">Como usar</a></div><p class="label">Arquivos locais. Comandos editáveis. Seu projeto no controle.</p><div class="stats">${bonus ? `<div><strong>${skills.length}</strong>skills de apoio</div><div><strong>Local</strong>campos neste navegador</div>` : `<div><strong>${presets.length}</strong>modelos de edição</div><div><strong>${commands.length}</strong>comandos práticos</div><div><strong>${skills.length}</strong>skills do pacote</div>`}</div></div><div class="scene" aria-hidden="true"><div class="screen"><small>DIREÇÃO DE EDIÇÃO</small><strong>Clareza.<br><span>Em ação.</span></strong><div class="frame"></div></div><div class="timeline"><div class="track"><i></i><i></i><i></i></div><div class="track"><i></i><i></i><i></i><i></i></div><div class="playhead"></div></div><div class="caption">ESCOLHA / PREENCHA / EXECUTE / REVISE</div></div></section>
      <div class="flow"><div><small>01</small><strong>Escolha</strong><p>${bonus ? 'Encontre a skill adequada à etapa.' : 'Selecione o modelo ou comando da vez.'}</p></div><div><small>02</small><strong>Preencha</strong><p>Troque os campos pelos dados reais do projeto.</p></div><div><small>03</small><strong>Envie</strong><p>Use no agente com acesso aos seus arquivos.</p></div><div><small>04</small><strong>Revise</strong><p>Confira a amostra e preserve o que aprovou.</p></div></div>
      <div class="section-title"><h2>${bonus ? 'Suas skills' : 'Veja os exemplos em vídeo'}</h2><a href="#${bonus ? 'skills' : 'modelos'}">${bonus ? 'Ver todas as skills' : 'Ver todos os modelos'} →</a></div>${bonus ? skillCards() : `<p class="sample-note">Este é o resultado com os materiais indicados. Outros vídeos podem produzir variações.</p>${presetCards(presets.slice(0, 4))}`}
      ${!bonus && commands.length ? `<div class="section-title"><h2>Resolva a próxima etapa</h2><a href="#comandos">Ver comandos →</a></div>${commandCards(commands.slice(0, 3))}` : ''}
      <div class="note"><strong>O painel prepara o pedido.</strong> A edição acontece no seu projeto, no Codex ou no Claude Code. Os arquivos e comandos deste pacote não ativam serviços, não entram em contas e não incluem o uso das ferramentas.</div>`;
  }

  function modelsPage() {
    return `${top('Modelos de edição', 'Assista aos exemplos renderizados, confira os materiais usados e adapte o comando à sua gravação.', `${presets.length} caminhos para começar`)}<p class="sample-note">Este é o resultado com os materiais indicados. Outros vídeos podem produzir variações.</p>${presetCards()}`;
  }

  function modelPage(preset) {
    return `${top(preset.title, preset.description, 'Modelo de edição', 'modelos', two(preset._index + 1))}<div class="chips">${preset.format ? `<span class="chip">${escape(preset.format)}</span>` : ''}${preset.durationHint ? `<span class="chip">${escape(preset.durationHint)}</span>` : ''}</div>
      ${modelVideo(preset, true)}${sampleDetails(preset)}<div class="split"><section class="box"><h3>Quando usar</h3><p>${escape(preset.useCase || preset.description)}</p>${list(preset.skills).length ? `<h4>Skills relacionadas</h4><div class="chips">${skillLinks(preset.skills)}</div>` : ''}</section><section class="box"><h3>Separe os materiais</h3><h4>Essenciais</h4>${bulletList(preset.requiredAssets)}${list(preset.optionalAssets).length ? `<h4>Opcionais</h4>${bulletList(preset.optionalAssets)}` : ''}</section></div>
      ${list(preset.beats).length ? `<div class="section-title"><h2>Como a composição se desenvolve</h2></div><div class="beats">${preset.beats.map(beat => `<div class="beat"><strong>${escape(beat.phase)}</strong><p>${escape(beat.visual)}</p><small>${escape(beat.purpose)}</small></div>`).join('')}</div>` : ''}
      ${promptBuilder(preset._route, 'Monte o comando deste modelo', preset.prompt)}
      ${list(preset.review).length ? `<section class="box"><h3>Critérios para revisar a amostra</h3>${bulletList(preset.review)}</section>` : ''}`;
  }

  function filteredCommands() {
    const query = normalize(search.query).trim();
    return commands.filter(command => (!search.category || text(command.category) === search.category) && (!query || normalize([command.title, command.category, command.whenToUse, command.expectedResult, command.prompt].join(' ')).includes(query)));
  }

  function commandsPage() {
    const categories = [...new Set(commands.map(command => text(command.category)).filter(Boolean))];
    const found = filteredCommands();
    return `${top('Comandos para cada etapa', 'Busque pelo problema que precisa resolver ou filtre pela etapa da produção.', `${commands.length} comandos completos`)}<div class="search"><input type="search" id="command-search" aria-label="Buscar comandos" placeholder="Busque por legenda, revisão, enquadramento…" value="${escape(search.query)}"><select id="command-category" aria-label="Filtrar comandos por categoria"><option value="">Todas as categorias</option>${categories.map(category => `<option value="${escape(category)}"${category === search.category ? ' selected' : ''}>${escape(category)}</option>`).join('')}</select></div><p class="progress-label" id="command-count" aria-live="polite">${found.length} de ${commands.length} comandos</p><div id="command-results">${commandCards(found)}</div>`;
  }

  function updateCommands() {
    const result = document.getElementById('command-results');
    const count = document.getElementById('command-count');
    if (!result) return;
    const found = filteredCommands();
    result.innerHTML = commandCards(found);
    if (count) count.textContent = `${found.length} de ${commands.length} comandos`;
  }

  function commandPage(command) {
    return `${top(command.title, command.whenToUse, command.category || 'Comando de produção', 'comandos')}<div class="split"><section class="box"><h3>Resultado esperado</h3><p>${escape(command.expectedResult || 'Confira o resultado conforme os critérios do seu pedido.')}</p></section><section class="box"><h3>Skills relacionadas</h3>${list(command.skills).length ? `<div class="chips">${skillLinks(command.skills)}</div>` : '<p>Use no contexto do projeto e preserve as decisões já aprovadas.</p>'}</section></div>${promptBuilder(command._route, 'Personalize o comando', command.prompt)}`;
  }

  function skillsPage() {
    return `${top('Skills para orientar o agente', 'Cada skill reúne instruções para uma tarefa específica. Instale no projeto ou peça ao agente para ler o arquivo correspondente.', `${skills.length} skills ${bonus ? 'bônus' : 'incluídas'}`)}<div class="actions actions-top"><a class="btn" href="#instalar">Como usar e instalar</a>${localLink('skills.zip', 'Baixar todas as skills ↓', 'btn secondary', true)}</div>${tutorialSection()}${skillCards()}`;
  }

  function skillPage(skill) {
    const path = text(skill.path) || `skills/${text(skill.id)}/SKILL.md`;
    const extraction = skill.master ? '<section class="extraction-map"><h2>Da referência à sua próxima edição</h2><div class="flow"><div><small>01</small><strong>Envie o vídeo</strong><p>Forneça o arquivo ou um link acessível à ferramenta.</p></div><div><small>02</small><strong>Leia os padrões</strong><p>Cenas, enquadramento, ritmo, texto, motion e áudio.</p></div><div><small>03</small><strong>Guarde a receita</strong><p>Mapa com evidências e regras que você pode reutilizar.</p></div><div><small>04</small><strong>Aplique depois</strong><p>Use o prompt de recriação com a sua gravação.</p></div></div><div class="box"><h3>O que a skill entrega</h3><div class="output-files"><div><code>referencia-de-edicao.md</code><p>Leitura do estilo, evidências e limites da análise.</p></div><div><code>mapa-de-cenas.csv</code><p>Momentos do vídeo e o que acontece em cada um.</p></div><div><code>receita-visual.json</code><p>Regras de composição para orientar outra edição.</p></div><div><code>prompt-de-recriacao.txt</code><p>Comando pronto para adaptar o estilo ao seu material.</p></div></div></div></section>' : '';
    const demo = demoVideo(skill.demo, {className: 'demo-detail', label: `Animação da skill ${text(skill.title || skill.id)}`, caption: '<strong>Animação explicativa</strong><p>Mostra a função desta skill. Não representa o resultado de um pedido específico.</p>'});
    return `${top(skill.title || skill.id, skill.description, skill.master ? 'Skill mestre' : 'Skill do pacote', 'skills')}${demo}${extraction}<div class="split"><section class="box"><h3>Quando usar</h3><p>${escape(skill.whenToUse || skill.description)}</p></section><section class="box"><h3>Arquivo da skill</h3><p>${escape(path)}</p><div class="actions">${localLink(path, 'Baixar SKILL.md ↓', 'btn secondary', true)}${localLink('skills.zip', 'Pacote completo ↓', 'btn secondary', true)}</div></section></div>${promptBuilder(skill._route, 'Ative esta skill no seu projeto', skill.starterPrompt)}<div class="note">Informe o caminho real depois de extrair o pacote. Copiar este comando não instala a skill nem dá ao agente acesso a uma pasta que você não abriu.</div>`;
  }

  function downloadList() {
    return downloads.map(item => {
      const href = localHref(item.path);
      if (!href) return '';
      return `<a class="download" href="${escape(href)}" download><span>${escape(item.title || item.path)}${item.note ? `<br><small>${escape(item.note)}</small>` : ''}</span><span aria-hidden="true">↓</span></a>`;
    }).join('');
  }

  function installPage() {
    return `${top('Do pacote ao seu projeto', 'Mantenha os arquivos juntos, escolha seu agente e use uma amostra para validar a execução.', 'Como usar')}
      <section class="install-step"><span>01</span><div><h3>Extraia o pacote completo</h3><p>Descompacte o ZIP em uma pasta do computador. Abra este painel a partir dessa pasta e preserve a estrutura: os downloads apontam para arquivos locais que o acompanham.</p><p>O painel funciona offline. Consultar documentação externa, acessar o agente ou usar uma ferramenta online pode exigir internet e condições próprias.</p></div></section>
      <section class="install-step"><span>02</span><div><h3>Abra a pasta no Codex ou no Claude Code</h3><p>Use o agente em um ambiente com acesso à pasta do projeto. Escolha o caminho compatível com seu sistema e sua conta. Um comando com o nome de um arquivo não substitui o acesso real àquele arquivo.</p><p>Separe a gravação original e os materiais de apoio. Indique os caminhos reais nos campos do comando antes de enviá-lo.</p></div></section>
      <section class="install-step"><span>03</span><div><h3>Instale as skills locais, se quiser</h3><p>O instalador que acompanha o pacote copia as skills para o projeto: <strong>.agents/skills</strong> para Codex ou <strong>.claude/skills</strong> para Claude Code. Ele não acessa contas, não ativa serviços e não concede permissões ao agente.</p><p>Com Node.js disponível, abra o terminal na pasta que contém <strong>instalar-skills.mjs</strong>. Comece pela simulação e confira os destinos:</p><pre class="terminal">node instalar-skills.mjs --editor ambos --project "CAMINHO DO PROJETO"</pre><p>Troque <strong>ambos</strong> por <strong>codex</strong> ou <strong>claude</strong> se usar apenas um editor. Para copiar os arquivos, repita o comando com <strong>--apply</strong>. A pasta do projeto precisa existir; versões diferentes já instaladas não são sobrescritas.</p><p>Você também pode pedir ao agente para ler o SKILL.md diretamente. Depois de instalar, abra ou retome o projeto e confirme se a skill foi reconhecida.</p><div class="actions">${localLink('instalar-skills.mjs', 'Baixar instalador local ↓', 'btn secondary', true)}${localLink('skills.zip', 'Baixar skills ↓', 'btn secondary', true)}</div></div></section>
      <section class="install-step"><span>04</span><div><h3>Prepare o Remotion e aplique o pedido</h3><p>As skills deste pacote são complementares. As skills oficiais do Remotion são um recurso externo e devem ser obtidas pela documentação oficial atual, quando o projeto usar Remotion. O pacote não instala automaticamente o editor, as dependências ou as skills oficiais.</p><p>Use o comando abaixo no agente que tem acesso à pasta. Preserve instalações que já funcionam, confira o que falta e respeite as autorizações e os limites definidos para o trabalho.</p><div class="docs-links"><a href="https://www.remotion.dev/docs/ai/skills" target="_blank" rel="noopener noreferrer">Skills oficiais do Remotion ↗</a><a href="https://www.remotion.dev/docs" target="_blank" rel="noopener noreferrer">Documentação do Remotion ↗</a></div></div></section>
      ${promptBuilder('instalar', 'Prepare o uso das skills', source.installPrompt)}
      <div class="note"><strong>Antes de ampliar a edição:</strong> confira a gravação, os campos preenchidos e uma amostra representativa. O pacote não inclui assinaturas, créditos, APIs ou serviços adicionais.</div>
      <div class="section-title"><h2>Arquivos do pacote</h2><p>Downloads locais, preservando a pasta extraída.</p></div>${downloadList() || '<p class="empty">Consulte os arquivos na pasta principal do pacote.</p>'}`;
  }

  function currentHash() {
    try { return decodeURIComponent(window.location.hash.slice(1)) || 'inicio'; }
    catch (_) { return 'nao-encontrado'; }
  }

  function renderNav(active) {
    const items = [['inicio', 'Início']];
    if (!bonus) items.push(['modelos', `Modelos (${presets.length})`], ['comandos', `Comandos (${commands.length})`]);
    items.push(['skills', 'Skills'], ['instalar', 'Como usar']);
    nav.innerHTML = items.map(([route, label]) => `<a href="#${route}"${active === route ? ' class="active" aria-current="page"' : ''}>${escape(label)}</a>`).join('');
  }

  function pauseSampleVideos(except = null) {
    main.querySelectorAll('video[data-model-video]').forEach(video => {
      if (video !== except && !video.paused) video.pause();
    });
  }

  function render() {
    const route = currentHash();
    if (route === 'main' && rendered) { main.focus({preventScroll: true}); return; }
    builders.clear();
    let html;
    let active = route;
    let title = brand;
    const model = presets.find(item => item._route === route);
    const command = commands.find(item => item._route === route);
    const skill = skills.find(item => item._route === route);
    if (route === 'inicio' || route === 'main') { html = home(); active = 'inicio'; }
    else if (!bonus && route === 'modelos') { html = modelsPage(); title = 'Modelos'; }
    else if (!bonus && route === 'comandos') { html = commandsPage(); title = 'Comandos'; }
    else if (route === 'skills') { html = skillsPage(); title = 'Skills'; }
    else if (route === 'instalar') { html = installPage(); title = 'Como usar'; }
    else if (model) { html = modelPage(model); active = 'modelos'; title = text(model.title); }
    else if (command) { html = commandPage(command); active = 'comandos'; title = text(command.title); }
    else if (skill) { html = skillPage(skill); active = 'skills'; title = text(skill.title || skill.id); }
    else { html = `${top('Página não encontrada', 'Esse item não está disponível neste pacote.')}<a class="btn" href="#inicio">Voltar ao início</a>`; active = ''; title = 'Página não encontrada'; }
    pauseSampleVideos();
    main.innerHTML = html;
    main.querySelectorAll('video[data-model-video]').forEach(video => {
      video.muted = true;
      video.play().catch(() => { /* Native controls remain available if autoplay is blocked. */ });
    });
    renderNav(active);
    document.title = `${title === brand ? brand : `${title} · ${brand}`} · Máquina de Edição IA`;
    if (rendered) { main.focus({preventScroll: true}); window.scrollTo({top: 0, behavior: 'auto'}); }
    rendered = true;
  }

  async function copyText(value) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) { /* file:// and browser permissions may require the local fallback. */ }
    const previous = document.activeElement;
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.left = '-10000px';
    field.style.top = '0';
    document.body.appendChild(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, value.length);
    let success = false;
    try { success = document.execCommand('copy'); } catch (_) { /* manual copy remains available */ }
    field.remove();
    if (previous && typeof previous.focus === 'function') previous.focus({preventScroll: true});
    return success;
  }

  function downloadText(builder) {
    const blob = new Blob([compose(builder)], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug(builder.title) || builder.id}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    notify('TXT preparado com o comando completo e os campos preenchidos.');
  }

  main.addEventListener('input', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.id === 'command-search') { search.query = target.value; updateCommands(); return; }
    if (!target.matches('[data-builder-field]')) return;
    const container = target.closest('[data-builder]');
    const builder = container && builders.get(container.dataset.builder);
    if (!builder) return;
    const field = builder.fields[Number(target.dataset.builderField)];
    if (field == null) return;
    builder.values[field] = target.value;
    saveValues(builder.id, builder.values);
    refreshBuilder(container, builder);
  });

  main.addEventListener('change', event => {
    if (event.target.id === 'command-category') { search.category = event.target.value; updateCommands(); }
  });

  main.addEventListener('click', async event => {
    const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button) return;
    const container = button.closest('[data-builder]');
    const builder = container && builders.get(container.dataset.builder);
    if (!builder) return;
    if (button.dataset.action === 'copy') {
      const success = await copyText(compose(builder));
      if (success) {
        const missing = builder.fields.filter(field => !text(builder.values[field]).trim()).length;
        notify(missing ? `Comando copiado. ${missing} campo(s) vazio(s) permanecem entre colchetes.` : 'Comando completo copiado.');
      } else {
        const details = container.querySelector('details');
        if (details) details.open = true;
        const preview = container.querySelector('[data-preview]');
        if (preview) {
          preview.focus();
          const range = document.createRange();
          range.selectNodeContents(preview);
          const selection = window.getSelection();
          if (selection) { selection.removeAllRanges(); selection.addRange(range); }
        }
        notify('A cópia automática foi bloqueada. O texto está selecionado na prévia; copie pelo navegador.');
      }
    } else if (button.dataset.action === 'download') {
      try { downloadText(builder); } catch (_) { notify('O navegador bloqueou o download. Use a prévia para copiar o comando.'); }
    } else if (button.dataset.action === 'clear') {
      builder.values = Object.create(null);
      saveValues(builder.id, builder.values);
      container.querySelectorAll('[data-builder-field]').forEach(field => { field.value = ''; });
      refreshBuilder(container, builder);
      notify('Campos deste comando limpos. O modelo original foi preservado.');
    }
  });

  const brandElement = document.getElementById('brand');
  if (brandElement) brandElement.textContent = bonus ? 'SKILLS BÔNUS' : 'CAIXA PRETA';
  const footerVersion = document.getElementById('footerVersion');
  if (footerVersion) footerVersion.textContent = `Versão ${bonus ? '1.0' : '1.2'} · materiais locais`;
  const footer = document.getElementById('footerBrand');
  if (footer) footer.textContent = `${brand} · Máquina de Edição IA`;
  window.addEventListener('hashchange', render);
  window.addEventListener('pagehide', () => pauseSampleVideos());
  render();
})();
