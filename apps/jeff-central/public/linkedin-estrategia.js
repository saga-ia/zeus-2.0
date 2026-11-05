// Estratégia do LinkedIn (aba "Estratégia" da tela /linkedin): a pessoa escolhe objetivo, público, pilares com peso,
// tom, formatos, ritmo, newsletter, CTA, proibições e o planejamento automático. O ZEUS segue isso em tudo que escreve
// para o LinkedIn e monta a semana em rascunhos. Serve para qualquer cliente: cada Central tem a própria estratégia.
// Backend: /api/social/linkedin/estrategia (linkedin-estrategia.js). Sugerir e planejar rodam como tarefa (a IA leva
// mais que o tempo do proxy) e esta tela acompanha. Carregado depois do index: usa state, liRender, e, icon, ICONS,
// cfgToast, zConfirm, souAdmin, CFG_BOX, CFG_IN, LI_BTN, LI_BTN_PRI e liRecarregarLista.
(function(){
  const API = "/api/social/linkedin/estrategia";
  const ROXO = "#673DE6", CINZA = "#66666F", MUTE = "#9A9AA3", VERM = "#C0341C", VERDE = "#0F7A68", BORDA = "#E6E6EA";
  const LBL = "display:block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#66666F;margin:0 0 6px";
  const HELP = "margin:6px 0 0;font-size:11.5px;color:#66666F;line-height:1.5";
  const SEC = "padding:18px 20px;border-top:1px solid #F1F1F3";
  const DIAS = [["seg", "Seg"], ["ter", "Ter"], ["qua", "Qua"], ["qui", "Qui"], ["sex", "Sex"], ["sab", "Sáb"], ["dom", "Dom"]];
  const OBJ = [["autoridade", "Autoridade", "Ser lembrado como referência no assunto"], ["leads", "Gerar leads", "Puxar conversas e oportunidades comerciais"], ["ambos", "Os dois", "Autoridade que vira conversa comercial"]];
  const TONS = [["direto", "Direto"], ["didatico", "Didático"], ["provocativo", "Provocativo"], ["inspirador", "Inspirador"], ["tecnico", "Técnico"], ["humor", "Bem-humorado"]];
  const FORM = [["texto", "Só texto"], ["imagem", "Texto + imagem"], ["varias", "Várias imagens"]];
  const FREQ = [["semanal", "Semanal"], ["quinzenal", "Quinzenal"], ["mensal", "Mensal"]];

  const E = () => state.liEst || (state.liEst = { carregando: true });
  const copia = o => JSON.parse(JSON.stringify(o));
  const podeEditar = () => typeof souAdmin === "function" && souAdmin();
  async function api(p, metodo, corpo){
    const r = await fetch(API + p, { method: metodo || "GET", headers: corpo ? { "Content-Type": "application/json" } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }
  window.liEstCarregar = async function(){
    const g = E(); if(g._pedindo) return; g._pedindo = true;
    try { const j = await api(""); Object.assign(g, { dados: j.estrategia, padrao: j.padrao, previa: j.previa, carregando: false, erro: null }); if(!g.form) g.form = j.estrategia ? copia(j.estrategia) : null; }
    catch(err){ Object.assign(g, { carregando: false, erro: err.message }); }
    g._pedindo = false; liRender();
  };
  window.liIrAba = function(k){ state.liAba = k; if(k === "estrategia" && (!state.liEst || state.liEst.erro)){ state.liEst = null; liEstCarregar(); } liRender(); };

  // ─── edição do formulário (sem redesenhar enquanto digita) ──────────────────
  const F = () => E().form;
  function sujo(){ E().sujo = true; const b = document.getElementById("li-est-salvar"); if(b){ b.disabled = false; b.style.opacity = 1; b.textContent = "Salvar estratégia"; } }
  window.liEstCampo = function(k, el){ const f = F(); if(!f) return; if(k.startsWith("nl.")) f.newsletter[k.slice(3)] = el.type === "checkbox" ? el.checked : el.value; else f[k] = el.type === "checkbox" ? el.checked : el.value; sujo(); if(el.dataset.redesenha) liRender(); };
  window.liEstLista = function(k, v){ const f = F(); const l = f[k] || (f[k] = []); const i = l.indexOf(v); if(i >= 0) l.splice(i, 1); else { if(k === "tons" && l.length >= 3){ cfgToast("Escolha até 3 tons.", true); return; } l.push(v); } sujo(); liRender(); };
  window.liEstObjetivo = function(v){ F().objetivo = v; sujo(); liRender(); };
  window.liEstPilar = function(i, k, el){ const p = F().pilares[i]; p[k] = k === "peso" ? Math.max(0, Math.min(100, parseInt(el.value, 10) || 0)) : el.value; sujo(); if(k === "peso") pintarPesos(); };
  window.liEstPilarAdd = function(){ const f = F(); if(f.pilares.length >= 8) return; f.pilares.push({ id: Math.random().toString(36).slice(2, 8), nome: "", descricao: "", peso: f.pilares.length ? 10 : 100 }); sujo(); liRender(); setTimeout(() => { const el = document.getElementById("li-est-p-nome-" + (f.pilares.length - 1)); if(el) el.focus(); }, 0); };
  window.liEstPilarDel = function(i){ F().pilares.splice(i, 1); sujo(); liRender(); };
  window.liEstEquilibrar = function(){ const ps = F().pilares; if(!ps.length) return; const base = Math.floor(100 / ps.length); ps.forEach((p, i) => { p.peso = base + (i < 100 - base * ps.length ? 1 : 0); }); sujo(); liRender(); };
  function pintarPesos(){
    const ps = F().pilares, tot = ps.reduce((a, p) => a + (+p.peso || 0), 0) || 1;
    ps.forEach((p, i) => { const el = document.getElementById("li-est-p-pct-" + i); if(el) el.textContent = Math.round((+p.peso || 0) * 100 / tot) + "%"; const b = document.getElementById("li-est-p-bar-" + i); if(b) b.style.width = Math.round((+p.peso || 0) * 100 / tot) + "%"; });
  }

  window.liEstSalvar = async function(){
    const g = E(), f = g.form;
    if(!f.pilares.filter(p => String(p.nome).trim()).length){ cfgToast("Cadastre pelo menos um pilar.", true); return; }
    if(!f.dias.length){ cfgToast("Escolha pelo menos um dia de post.", true); return; }
    g.salvando = true; liRender();
    try { const j = await api("", "PUT", f); g.dados = j.estrategia; g.form = copia(j.estrategia); g.sujo = false; cfgToast("Estratégia salva. O ZEUS passa a seguir ela nos posts."); g.previa = (await api("")).previa; }
    catch(err){ cfgToast("Não salvou: " + err.message, true); }
    g.salvando = false; liRender();
  };
  window.liEstDescartar = function(){ const g = E(); g.form = g.dados ? copia(g.dados) : null; g.sujo = false; liRender(); };
  window.liEstComecar = function(){ const g = E(); g.form = copia(g.padrao); g.form.pilares = []; g.sujo = true; liRender(); };

  // ─── tarefas de IA (sugerir / planejar) ─────────────────────────────────────
  async function acompanhar(t){
    const g = E(); g.tarefa = t; liRender();
    while(g.tarefa && g.tarefa.id === t.id && g.tarefa.status === "rodando"){
      await new Promise(r => setTimeout(r, 2500));
      try { g.tarefa = (await api("/tarefa/" + t.id)).tarefa; } catch(err){ g.tarefa = { status: "erro", erro: err.message, tipo: t.tipo }; }
      const s = document.getElementById("li-est-tarefa-seg"); if(s) s.textContent = Math.round((Date.now() - t.inicio) / 1000) + " s";
    }
    const fim = g.tarefa; g.tarefa = null;
    if(fim.tipo === "conversa" && g.conv) g.conv.esperando = false;
    if(fim.status === "erro") cfgToast((fim.tipo === "planejar" ? "Não planejei: " : "A IA não respondeu: ") + fim.erro, true);
    else if(fim.tipo === "conversa"){ const r = fim.resultado, c = g.conv;
      if(c && r.pronto){ g.form = Object.assign(copia(g.padrao), r.estrategia); g.sujo = true; g.resumo = r.resumo; g.conv = null; cfgToast("Estratégia montada. Revise e salve."); }
      else if(c){ c.msgs.push({ eu: false, texto: r.pergunta }); c.sugestoes = r.sugestoes || []; setTimeout(() => { const i = document.getElementById("li-est-conv-in"); if(i) i.focus(); }, 0); } }
    else if(fim.tipo === "sugerir"){ g.form = Object.assign(copia(g.padrao), fim.resultado); g.sujo = true; cfgToast("Sugestão pronta. Revise, ajuste e salve."); }
    else { const r = fim.resultado; cfgToast(`${r.posts} posts${r.newsletter ? " e 1 edição da newsletter" : ""} criados como rascunho, com data sugerida.`); state.liAba = "posts"; state.liFiltro = "rascunho"; liRecarregarLista(); }
    liRender();
  }
  // ─── conversa guiada ────────────────────────────────────────────────────────
  const inicial = () => ({ msgs: [{ eu: false, texto: "Oi! Vou montar a estratégia do seu LinkedIn com você em umas 6 perguntas rápidas. Pra começar: o que sua empresa vende e pra quem?" }], sugestoes: [], esperando: false });
  window.liEstConversar = async function(){
    const g = E();
    if(g.form && !await zConfirm("Refazer a estratégia conversando com a IA? O formulário atual só é trocado no fim, e nada é salvo sem você clicar em Salvar.", { ok: "Conversar", danger: false })) return;
    g.conv = inicial(); liRender(); setTimeout(() => { const i = document.getElementById("li-est-conv-in"); if(i) i.focus(); }, 0);
  };
  window.liEstConvSair = function(){ const g = E(); g.conv = null; if(!g.form){ g.form = copia(g.padrao); g.form.pilares = []; g.sujo = true; } liRender(); };
  window.liEstResponder = async function(txt){
    const g = E(), c = g.conv; if(!c || c.esperando) return;
    const el = document.getElementById("li-est-conv-in");
    txt = String(txt == null ? (el ? el.value : "") : txt).trim(); if(!txt) return;
    if(el) el.value = ""; // a render() da Central devolve o texto do campo focado: limpa antes
    c.msgs.push({ eu: true, texto: txt }); c.sugestoes = []; c.esperando = true; liRender();
    try { acompanhar((await api("/conversa", "POST", { mensagens: c.msgs })).tarefa); }
    catch(err){ c.esperando = false; c.msgs.pop(); cfgToast(err.message, true); liRender(); }
  };
  window.liEstSugestao = function(i){ const c = E().conv; if(c && c.sugestoes[i] != null) liEstResponder(c.sugestoes[i]); };
  function conversaHTML(){
    const g = E(), c = g.conv;
    const bolha = m => m.eu ? `<div style="display:flex;justify-content:flex-end"><div style="max-width:78%;padding:10px 14px;border-radius:16px 16px 4px 16px;background:${ROXO};color:#FFFFFF;font-size:13.5px;line-height:1.5;white-space:pre-wrap">${e(m.texto)}</div></div>`
      : `<div style="display:flex;gap:10px;align-items:flex-end"><span style="width:30px;height:30px;flex:0 0 30px;border-radius:50%;background:rgba(103,61,230,0.12);color:${ROXO};display:flex;align-items:center;justify-content:center">${icon(ICONS.bolt, 14, "currentColor")}</span><div style="max-width:78%;padding:10px 14px;border-radius:16px 16px 16px 4px;background:#F1F1F3;font-size:13.5px;line-height:1.5;white-space:pre-wrap">${e(m.texto)}</div></div>`;
    const respostas = c.msgs.filter(m => m.eu).length;
    return `<div style="${CFG_BOX};padding:0;max-width:760px;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #F1F1F3"><div style="flex:1"><div style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600">Montar a estratégia com o ZEUS</div><div style="font-size:12px;color:${CINZA};margin-top:2px">Responda com suas palavras ou toque numa sugestão. No fim ele preenche tudo para você revisar.</div></div>
        <span style="font-size:11.5px;color:${MUTE};white-space:nowrap">${Math.min(respostas, 7)} de ~6</span></div>
      <div id="li-est-conv-msgs" style="display:flex;flex-direction:column;gap:10px;padding:18px 20px;max-height:52vh;overflow-y:auto">${c.msgs.map(bolha).join("")}
        ${c.esperando ? `<div style="display:flex;gap:10px;align-items:center;color:${MUTE};font-size:12.5px"><span style="width:30px;flex:0 0 30px"></span>ZEUS está pensando...</div>` : ""}</div>
      ${c.sugestoes.length && !c.esperando ? `<div style="display:flex;gap:6px;flex-wrap:wrap;padding:0 20px 12px">${c.sugestoes.map((x, i) => `<span onclick="liEstSugestao(${i})" style="padding:7px 12px;border-radius:18px;border:1px solid ${ROXO};color:#5429C9;font-size:12.5px;cursor:pointer;background:#FFFFFF">${e(x)}</span>`).join("")}</div>` : ""}
      <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid #F1F1F3"><input id="li-est-conv-in" ${c.esperando ? "disabled" : ""} placeholder="Sua resposta..." onkeydown="if(event.key==='Enter'){event.preventDefault();liEstResponder();}" style="${CFG_IN}"><button onclick="liEstResponder()" ${c.esperando ? "disabled" : ""} style="${LI_BTN_PRI}">Enviar</button></div>
      <div style="padding:0 20px 14px;font-size:12px;color:${MUTE}"><span onclick="liEstConvSair()" style="cursor:pointer;text-decoration:underline">${g.form ? "Voltar ao formulário" : "Pular e preencher do zero"}</span></div>
    </div>`;
  }

  window.liEstSugerir = async function(){
    const g = E(), briefing = (document.getElementById("li-est-briefing") || {}).value || g.briefing || "";
    g.briefing = briefing;
    if(g.dados && !await zConfirm("Trocar o formulário pela sugestão da IA? Nada é salvo até você clicar em Salvar.", { ok: "Sugerir", danger: false })) return;
    try { acompanhar((await api("/sugerir", "POST", { briefing })).tarefa); } catch(err){ cfgToast(err.message, true); }
  };
  window.liEstPlanejar = async function(semana){
    const g = E();
    if(g.sujo){ cfgToast("Salve a estratégia antes de planejar.", true); return; }
    if(!await zConfirm(`Montar ${semana === "atual" ? "o resto desta semana" : "a próxima semana"} pela estratégia? Os posts nascem como rascunho com data sugerida: nada é publicado sem você aprovar.`, { ok: "Planejar", danger: false })) return;
    try { acompanhar((await api("/planejar", "POST", { semana })).tarefa); } catch(err){ cfgToast(err.message, true); }
  };

  // ─── tela ───────────────────────────────────────────────────────────────────
  const chip = (on, txt, acao, dis) => `<span ${dis ? "" : `onclick="${acao}"`} style="display:inline-flex;align-items:center;padding:7px 13px;border-radius:20px;font-size:12.5px;cursor:${dis ? "default" : "pointer"};border:1px solid ${on ? ROXO : "#DADADF"};background:${on ? "rgba(103,61,230,0.08)" : "#FFFFFF"};color:${on ? "#5429C9" : "#3C3C44"};font-weight:${on ? 600 : 400}">${txt}</span>`;
  const quando = ms => new Date(ms).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  function tarefaHTML(){
    const t = E().tarefa; if(!t || t.tipo === "conversa") return "";
    return `<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:12px;background:rgba(103,61,230,0.06);border:1px solid rgba(103,61,230,0.2);margin-bottom:16px">
      <span style="width:16px;height:16px;border-radius:50%;border:2px solid ${ROXO};border-top-color:transparent;animation:li-est-gira 0.9s linear infinite;flex:0 0 16px"></span>
      <span style="flex:1;font-size:13px;color:#3C3C44">${t.tipo === "sugerir" ? "O ZEUS está montando uma estratégia para essa conta..." : "O ZEUS está escrevendo a semana pelos pilares (posts e, se for semana dela, a newsletter)..."} <span style="color:${MUTE}">pode levar até 2 minutos · <span id="li-est-tarefa-seg">0 s</span></span></span>
      <style>@keyframes li-est-gira{to{transform:rotate(360deg)}}</style></div>`;
  }
  function boasVindasHTML(){
    const g = E(), ed = podeEditar();
    return `<div style="${CFG_BOX};padding:24px;max-width:760px">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:600;margin-bottom:6px">Defina a estratégia do LinkedIn</div>
      <p style="margin:0 0 16px;font-size:13px;color:${CINZA};line-height:1.6">Com ela o ZEUS para de criar posts soltos: escreve dentro dos pilares e do tom que você escolher, no ritmo certo, e monta a semana inteira em rascunho para você aprovar.</p>
      ${ed ? `<label style="${LBL}">Conte em 2 ou 3 frases o negócio e o que você quer com o LinkedIn</label>
      <textarea id="li-est-briefing" rows="4" placeholder="Ex.: agência de tráfego para empresas B2B de ticket alto. Quero ser visto como referência em aquisição e receber pedidos de diagnóstico." style="${CFG_IN};resize:vertical;line-height:1.5">${e(g.briefing || "")}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button onclick="liEstSugerir()" ${g.tarefa ? "disabled" : ""} style="${LI_BTN_PRI}">${icon(ICONS.bolt, 13, "currentColor")} Sugerir com IA</button><button onclick="liEstComecar()" style="${LI_BTN}">Preencher do zero</button></div>
      <p style="${HELP}">A sugestão só preenche o formulário: você revisa e salva.</p>` : `<p style="margin:0;font-size:13px;color:${CINZA}">Peça a um administrador da conta para definir.</p>`}
    </div>`;
  }
  function formHTML(){
    const g = E(), f = g.form, ed = podeEditar(), dis = ed ? "" : "disabled";
    const tot = f.pilares.reduce((a, p) => a + (+p.peso || 0), 0) || 1;
    const sec = (titulo, sub, corpo) => `<div style="${SEC}"><div style="font-size:14px;font-weight:600;margin-bottom:${sub ? 2 : 10}px">${titulo}</div>${sub ? `<div style="font-size:12px;color:${CINZA};margin-bottom:12px">${sub}</div>` : ""}${corpo}</div>`;
    const objetivo = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">${OBJ.map(([k, n, d]) => `<div ${ed ? `onclick="liEstObjetivo('${k}')"` : ""} style="padding:12px 14px;border-radius:12px;cursor:${ed ? "pointer" : "default"};border:1px solid ${f.objetivo === k ? ROXO : BORDA};background:${f.objetivo === k ? "rgba(103,61,230,0.05)" : "#FFFFFF"}"><div style="font-size:13.5px;font-weight:600">${n}</div><div style="font-size:12px;color:${CINZA};margin-top:2px">${d}</div></div>`).join("")}</div>`;
    const publico = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
      <div><label style="${LBL}">Público</label><textarea id="li-est-publico" ${dis} rows="3" oninput="liEstCampo('publico', this)" placeholder="Quem você quer atrair" style="${CFG_IN};resize:vertical">${e(f.publico)}</textarea></div>
      <div><label style="${LBL}">Como quer ser lembrado</label><textarea id="li-est-pos" ${dis} rows="3" oninput="liEstCampo('posicionamento', this)" placeholder="Ex.: quem entende de aquisição ponta a ponta" style="${CFG_IN};resize:vertical">${e(f.posicionamento)}</textarea></div></div>`;
    const pilares = f.pilares.map((p, i) => { const pct = Math.round((+p.peso || 0) * 100 / tot); return `<div style="border:1px solid ${BORDA};border-radius:12px;padding:12px;margin-bottom:8px">
        <div style="display:flex;gap:8px;align-items:center"><input id="li-est-p-nome-${i}" ${dis} value="${e(p.nome)}" maxlength="60" oninput="liEstPilar(${i}, 'nome', this)" placeholder="Nome do pilar" style="${CFG_IN};font-weight:600">
          <input id="li-est-p-peso-${i}" ${dis} type="number" min="0" max="100" value="${+p.peso || 0}" oninput="liEstPilar(${i}, 'peso', this)" title="Peso" style="${CFG_IN};width:74px;flex:0 0 74px;text-align:right"><span id="li-est-p-pct-${i}" style="width:40px;flex:0 0 40px;font-size:12.5px;font-weight:600;text-align:right">${pct}%</span>
          ${ed ? `<span onclick="liEstPilarDel(${i})" title="Remover" style="width:30px;flex:0 0 30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${VERM}">${icon(ICONS.trash, 14)}</span>` : ""}</div>
        <div style="height:4px;background:#F1F1F3;border-radius:0 4px 4px 0;margin:8px 0"><div id="li-est-p-bar-${i}" style="height:100%;width:${pct}%;background:${ROXO};border-radius:0 4px 4px 0"></div></div>
        <input id="li-est-p-desc-${i}" ${dis} value="${e(p.descricao)}" maxlength="300" oninput="liEstPilar(${i}, 'descricao', this)" placeholder="O que entra nesse pilar (ex.: erros de funil que vejo em auditorias)" style="${CFG_IN};font-size:12.5px"></div>`; }).join("");
    const pilaresBloco = pilares + (ed ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${f.pilares.length < 8 ? `<button onclick="liEstPilarAdd()" style="${LI_BTN}">${icon(ICONS.plus, 12, "currentColor")} Adicionar pilar</button>` : ""}${f.pilares.length > 1 ? `<button onclick="liEstEquilibrar()" style="${LI_BTN}">Dividir igual</button>` : ""}</div>` : "") + `<p style="${HELP}">O peso define quantos posts de cada pilar entram no calendário. A porcentagem é calculada sobre a soma.</p>`;
    const tom = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${TONS.map(([k, n]) => chip(f.tons.includes(k), n, `liEstLista('tons','${k}')`, !ed)).join("")}</div>
      <label style="${LBL}">Como escrever (opcional)</label><textarea id="li-est-como" ${dis} rows="3" oninput="liEstCampo('comoEscrever', this)" placeholder="Ex.: frases curtas, sempre um exemplo real, falar com o dono e não com o gestor" style="${CFG_IN};resize:vertical">${e(f.comoEscrever)}</textarea>`;
    const ritmo = `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
        <div><label style="${LBL}">Posts por semana</label><select id="li-est-qtd" ${dis} onchange="liEstCampo('postsSemana', this)" data-redesenha="1" style="${CFG_IN};width:110px">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${+f.postsSemana === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div><label style="${LBL}">Horário</label><input id="li-est-hora" ${dis} type="time" value="${e(f.horario)}" onchange="liEstCampo('horario', this)" style="${CFG_IN};width:120px"></div></div>
      <label style="${LBL}">Dias de post</label><div style="display:flex;gap:6px;flex-wrap:wrap">${DIAS.map(([k, n]) => chip(f.dias.includes(k), n, `liEstLista('dias','${k}')`, !ed)).join("")}</div>
      ${+f.postsSemana > f.dias.length ? `<p style="${HELP};color:#9A6700">Você escolheu ${f.postsSemana} posts mas só ${f.dias.length} dia${f.dias.length === 1 ? "" : "s"}: o plano usa ${f.dias.length}.</p>` : +f.postsSemana < f.dias.length ? `<p style="${HELP}">Com ${f.postsSemana} posts em ${f.dias.length} dias, o plano espaça os posts na semana.</p>` : ""}
      <label style="${LBL};margin-top:14px">Formatos</label><div style="display:flex;gap:6px;flex-wrap:wrap">${FORM.map(([k, n]) => chip(f.formatos.includes(k), n, `liEstLista('formatos','${k}')`, !ed)).join("")}</div>
      <p style="${HELP}">Nos posts com imagem, o rascunho traz a descrição da arte para gerar no Agente de Design.</p>`;
    const nl = f.newsletter;
    const newsletter = `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:${nl.ativa ? 12 : 0}px"><input type="checkbox" ${dis} ${nl.ativa ? "checked" : ""} onchange="liEstCampo('nl.ativa', this)" data-redesenha="1" style="accent-color:${ROXO};width:16px;height:16px"><span style="font-size:13px">Tenho (ou quero ter) uma newsletter no LinkedIn</span></label>
      ${nl.ativa ? `<div style="display:flex;gap:12px;flex-wrap:wrap"><div style="flex:1;min-width:200px"><label style="${LBL}">Nome</label><input id="li-est-nl-nome" ${dis} value="${e(nl.nome)}" maxlength="80" oninput="liEstCampo('nl.nome', this)" style="${CFG_IN}"></div>
        <div><label style="${LBL}">Frequência</label><select ${dis} onchange="liEstCampo('nl.frequencia', this)" style="${CFG_IN};width:140px">${FREQ.map(([k, n]) => `<option value="${k}" ${nl.frequencia === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div><label style="${LBL}">Dia</label><select ${dis} onchange="liEstCampo('nl.dia', this)" style="${CFG_IN};width:110px">${DIAS.map(([k, n]) => `<option value="${k}" ${nl.dia === k ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
        <p style="${HELP}">A API do LinkedIn não publica newsletter: o ZEUS entrega a edição pronta para você copiar e colar. Os posts da semana puxam para ela.</p>` : ""}`;
    const regras = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
      <div><label style="${LBL}">Chamada para ação padrão</label><textarea id="li-est-cta" ${dis} rows="3" oninput="liEstCampo('cta', this)" placeholder="Ex.: comenta 'diagnóstico' que eu te mando o checklist" style="${CFG_IN};resize:vertical">${e(f.cta)}</textarea></div>
      <div><label style="${LBL}">O ZEUS nunca deve</label><textarea id="li-est-proib" ${dis} rows="3" oninput="liEstCampo('proibicoes', this)" placeholder="Ex.: citar cliente pelo nome, falar de política, prometer resultado" style="${CFG_IN};resize:vertical">${e(f.proibicoes)}</textarea></div></div>`;
    const auto = `<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer"><input type="checkbox" ${dis} ${f.autoPlanejar ? "checked" : ""} onchange="liEstCampo('autoPlanejar', this)" style="accent-color:${ROXO};width:16px;height:16px;margin-top:2px"><span><span style="display:block;font-size:13px;font-weight:600">Piloto automático: toda segunda às 8h o ZEUS escreve e agenda a semana</span><span style="display:block;font-size:12px;color:${CINZA};margin-top:2px;line-height:1.5">Os posts entram na aba Posts como <b>Agendado</b> e saem sozinhos no horário. Até lá você pode editar ou cancelar cada um. Os administradores recebem um aviso quando a semana é montada. A newsletter continua pronta para copiar, e o LinkedIn precisa estar conectado.</span></span></label>`;
    const pv = g.previa;
    const previa = pv && g.dados && !g.sujo ? `<div style="${SEC};background:#FAFAFB"><div style="font-size:14px;font-weight:600;margin-bottom:10px">Como fica a próxima semana</div>
      <div style="display:flex;flex-direction:column;gap:6px">${pv.newsletter ? `<div style="display:flex;gap:10px;font-size:12.5px"><span style="width:120px;flex:0 0 120px;color:${CINZA}">${quando(pv.newsletter)}</span><span style="font-weight:600;color:#1D5FD1">Newsletter${g.dados.newsletter.nome ? " · " + e(g.dados.newsletter.nome) : ""}</span></div>` : ""}
        ${pv.vagas.map(v => `<div style="display:flex;gap:10px;font-size:12.5px"><span style="width:120px;flex:0 0 120px;color:${CINZA}">${quando(v.quando)}</span><span><b>${e(v.pilar || "Livre")}</b> <span style="color:${MUTE}">· ${(FORM.find(x => x[0] === v.formato) || [0, v.formato])[1]}</span></span></div>`).join("")}</div></div>` : "";
    const barra = ed ? `<div style="position:sticky;bottom:0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 20px;border-top:1px solid ${BORDA};background:#FFFFFF;border-radius:0 0 16px 16px">
      <button id="li-est-salvar" onclick="liEstSalvar()" ${!g.sujo || g.salvando ? "disabled" : ""} style="${LI_BTN_PRI};${!g.sujo ? "opacity:.5" : ""}">${g.salvando ? "Salvando..." : g.sujo ? "Salvar estratégia" : "Salva"}</button>
      ${g.sujo && g.dados ? `<button onclick="liEstDescartar()" style="${LI_BTN}">Descartar alterações</button>` : ""}
      <button onclick="liEstConversar()" ${g.tarefa ? "disabled" : ""} style="${LI_BTN}">${icon(ICONS.bolt, 12, "currentColor")} Refazer com a IA</button>
      <span style="flex:1"></span>
      ${g.dados ? `<button onclick="liEstPlanejar('atual')" ${g.tarefa ? "disabled" : ""} style="${LI_BTN}">Planejar esta semana</button><button onclick="liEstPlanejar('proxima')" ${g.tarefa ? "disabled" : ""} style="${LI_BTN_PRI}">Planejar a próxima semana</button>` : ""}
    </div>` : "";
    return `<div style="${CFG_BOX};padding:0;max-width:980px">
      <div style="padding:18px 20px"><div style="font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:600">Estratégia do LinkedIn</div><div style="font-size:12.5px;color:${CINZA};margin-top:3px">O ZEUS segue isso em todo post, no "Gerar com IA" e no chat.${g.dados && g.dados.atualizadoEm ? " Salva em " + quando(g.dados.atualizadoEm) + "." : ""}</div></div>
      ${g.resumo && g.sujo ? `<div style="margin:0 20px 14px;padding:12px 14px;border-radius:12px;background:rgba(103,61,230,0.06);font-size:12.5px;color:#3C3C44;line-height:1.55"><b>O que o ZEUS entendeu:</b> ${e(g.resumo)} Revise os campos e clique em Salvar.</div>` : ""}
      ${sec("Objetivo", "", objetivo)}${sec("Público e posicionamento", "", publico)}${sec("Pilares de conteúdo", "Os assuntos que você quer que te associem. De 3 a 5 costuma funcionar melhor.", pilaresBloco)}
      ${sec("Tom de voz", "Escolha até 3.", tom)}${sec("Ritmo e formatos", "", ritmo)}${sec("Newsletter", "", newsletter)}${sec("Chamada e limites", "", regras)}${sec("Automático", "", auto)}
      ${previa}${barra}
    </div>`;
  }
  window.liEstrategiaHTML = function(){
    const g = E();
    if(g.carregando) return `<div style="font-size:13px;color:${CINZA}">Carregando estratégia...</div>`;
    if(g.erro) return `<div style="${CFG_BOX};padding:18px;font-size:13px;color:${VERM}">Não carreguei a estratégia: ${e(g.erro)} <span onclick="liIrAba('estrategia')" style="color:${ROXO};cursor:pointer;font-weight:600;margin-left:6px">Tentar de novo</span></div>`;
    if(!g.form && !g.conv && podeEditar()) g.conv = inicial(); // primeiro acesso: começa conversando
    const html = tarefaHTML() + (g.conv ? conversaHTML() : g.form ? formHTML() : boasVindasHTML());
    if(g.conv) setTimeout(() => { const m = document.getElementById("li-est-conv-msgs"); if(m) m.scrollTop = m.scrollHeight; }, 0);
    return html;
  };
})();
