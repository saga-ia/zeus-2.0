// Fluxos de conversa do Instagram (aba "Fluxos" da tela /instagram): construtor visual no estilo ManyChat.
// Blocos ligados por setas: gatilho, mensagem com botões ou respostas rápidas, imagem, áudio gravado, pergunta,
// espera e passagem para um agente de IA. O motor roda no myIG (zeuschatig/src/flows.js) e a API dele vem pela ponte
// /api/instagram/p/flows. Este arquivo cuida da própria área (#igfx): o redesenho das outras abas não mexe no canvas.
// Carregado depois do instagram.js: usa state, icon, ICONS, e (escape), zConfirm e cfgToast da Central.
(function(){
  const API = "/api/instagram/p/flows";
  const ROXO = "#673DE6", ROXO_E = "#5429C9", TINT = "#F0ECFD", VERDE = "#0F7A68", VERM = "#C0341C", CINZA = "#66666F", MUTE = "#9A9AA3", BORDA = "#E6E6EA";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:9px 11px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:13px;color:#17171A;background:#FFFFFF;outline:none;box-sizing:border-box";
  const BTN = "display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:8px 13px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF;color:#17171A;cursor:pointer;white-space:nowrap";
  const BTN_PRI = "display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:8px 14px;border:0;border-radius:9px;font:inherit;font-size:12.5px;font-weight:700;background:" + ROXO + ";color:#FFFFFF;cursor:pointer;white-space:nowrap";
  const LBL = "display:block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#66666F;margin:14px 0 6px";
  const HELP = "margin:6px 0 0;font-size:11.5px;color:#66666F;line-height:1.5";
  const LARG = 272; // largura dos blocos no canvas

  const IC = {
    gatilho: ICONS.bolt,
    mensagem: '<path d="M4 5h16v11H9l-5 4z"/>',
    imagem: ICONS.image,
    audio: ICONS.mic,
    pergunta: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.2v.01"/>',
    espera: ICONS.clock,
    agente: ICONS.sparkle,
    link: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };
  const TIPOS = {
    gatilho: { rot: "Quando...", sub: "Gatilho", cor: "#9A6700", fundo: "rgba(237,161,0,0.12)" },
    mensagem: { rot: "Enviar mensagem", sub: "Instagram", cor: "#B4316B", fundo: "#FBEAF1" },
    imagem: { rot: "Enviar imagem", sub: "Instagram", cor: "#B4316B", fundo: "#FBEAF1" },
    audio: { rot: "Enviar áudio", sub: "Instagram", cor: "#B4316B", fundo: "#FBEAF1" },
    pergunta: { rot: "Fazer pergunta", sub: "Espera a resposta", cor: "#1D5FD1", fundo: "#E6EEF9" },
    espera: { rot: "Esperar", sub: "Pausa", cor: "#66666F", fundo: "#F1F1F3" },
    agente: { rot: "Agente de IA", sub: "Passa a conversa", cor: ROXO_E, fundo: TINT },
  };
  const PALETA = [["mensagem", "Mensagem", "Texto com botões ou respostas rápidas"], ["imagem", "Imagem", "Foto ou arte anexada"], ["audio", "Áudio", "Grave pelo microfone ou envie"],
    ["pergunta", "Pergunta", "Espera a pessoa responder e guarda"], ["espera", "Esperar", "Pausa antes do próximo passo"], ["agente", "Agente de IA", "A IA assume a conversa"]];

  let F = { lista: null, erro: null, carregando: false, ed: null };
  let _salvarT = null;

  // ─── API ───────────────────────────────────────────────────────────────────
  async function api(p, opts){
    opts = opts || {};
    const init = { method: opts.method || "GET" };
    if(opts.body !== undefined){ init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(opts.body); }
    const r = await fetch(API + p, init);
    const j = await r.json().catch(() => ({}));
    if(!r.ok){ const err = new Error(j.error || ("HTTP " + r.status)); err.dados = j; throw err; }
    return j;
  }
  async function carregar(){
    F.carregando = true;
    try { F.lista = (await api("")).flows || []; F.erro = null; } catch(err){ F.erro = err.message; }
    F.carregando = false;
    if(!F.ed) pintar();
  }
  async function abrir(id){
    try {
      const j = await api("/" + id);
      F.ed = { id: j.flow.id, name: j.flow.name, active: j.flow.active, stats: j.flow.stats, def: j.flow.definition, agentes: j.agentes || [],
        sel: null, selSeta: null, z: 1, px: 60, py: 40, estado: "salvo", problemas: null, menu: null, sim: null };
      pintar();
      setTimeout(enquadrar, 0);
    } catch(err){ cfgToast("Não abri o fluxo: " + err.message, true); }
  }
  async function novo(){
    try { const j = await api("", { method: "POST", body: { name: "Novo fluxo" } }); F.lista = null; await abrir(j.flow.id); F.ed.sel = "g1"; pintar(); }
    catch(err){ cfgToast("Não criei o fluxo: " + err.message, true); }
  }
  function voltar(){ if(F.ed && F.ed.estado === "sujo") salvarJa(); F.ed = null; pintar(); carregar(); }

  // Salvamento automático (1 s depois da última mudança)
  function mudou(){ const ed = F.ed; if(!ed) return; ed.estado = "sujo"; pintarBarra(); clearTimeout(_salvarT); _salvarT = setTimeout(salvarJa, 1000); }
  async function salvarJa(){
    clearTimeout(_salvarT); const ed = F.ed; if(!ed) return;
    ed.estado = "salvando"; pintarBarra();
    try { const j = await api("/" + ed.id, { method: "PUT", body: { name: ed.name, definition: ed.def } }); if(F.ed === ed){ ed.estado = ed.estado === "sujo" ? "sujo" : "salvo"; ed.problemas = null; ed.stats = j.flow.stats; } }
    catch(err){ if(F.ed === ed){ ed.estado = "erro"; ed.problemas = (err.dados && err.dados.problemas) || [err.message]; } }
    pintarBarra();
  }
  async function ativar(liga){
    const ed = F.ed; if(!ed) return;
    if(liga && !await zConfirm(`Ativar "${ed.name}"? A partir de agora ele responde de verdade as DMs de quem disparar o gatilho.`, { ok: "Ativar", danger: false })) return;
    clearTimeout(_salvarT);
    try { const j = await api("/" + ed.id, { method: "PUT", body: { name: ed.name, definition: ed.def, active: liga } }); ed.active = j.flow.active; ed.estado = "salvo"; ed.problemas = null; cfgToast(liga ? "Fluxo ativado." : "Fluxo desativado."); }
    catch(err){ ed.problemas = (err.dados && err.dados.problemas) || [err.message]; ed.estado = ed.estado === "salvando" ? "sujo" : ed.estado; }
    pintarBarra();
  }

  // ─── definição: ajudantes ──────────────────────────────────────────────────
  const D = () => F.ed.def;
  const noDe = id => D().nodes.find(n => n.id === id);
  const novoId = p => p + Math.random().toString(36).slice(2, 7);
  function portas(n){
    const x = n.data || {};
    if(n.type === "agente") return [];
    if(n.type === "gatilho") return [["proximo", "Então"]];
    if(n.type === "pergunta") return [["resposta", "Quando responder"]];
    if(n.type === "mensagem"){ const segue = (x.botoes || []).filter(b => b.tipo !== "link"); if(segue.length) return segue.map(b => ["btn:" + b.id, b.titulo || "Botão"]); }
    return [["proximo", "Próximo passo"]];
  }
  function ligar(de, porta, para){
    const d = D(); if(de === para) return;
    d.edges = d.edges.filter(e => !(e.de === de && e.porta === porta));
    d.edges.push({ de, porta, para }); mudou();
  }
  function criarBloco(tipo, x, y){
    const dados = { mensagem: { texto: "", estilo: "botoes", botoes: [] }, imagem: { url: "", legenda: "" }, audio: { url: "" }, pergunta: { texto: "", campo: "" }, espera: { segundos: 60 }, agente: { agentId: null } }[tipo];
    const n = { id: novoId(tipo.slice(0, 2)), type: tipo, x: Math.round(x), y: Math.round(y), data: dados };
    D().nodes.push(n); mudou(); return n;
  }
  function apagarBloco(id){
    const n = noDe(id); if(!n || n.type === "gatilho") return;
    const d = D(); d.nodes = d.nodes.filter(x => x.id !== id); d.edges = d.edges.filter(e => e.de !== id && e.para !== id);
    F.ed.sel = null; mudou(); pintarCanvas(); pintarLado();
  }
  function duplicarBloco(id){
    const n = noDe(id); if(!n || n.type === "gatilho") return;
    const c = JSON.parse(JSON.stringify(n)); c.id = novoId(n.type.slice(0, 2)); c.x += 40; c.y += 40;
    if(c.data.botoes) c.data.botoes.forEach(b => { b.id = Math.random().toString(36).slice(2, 7); });
    D().nodes.push(c); F.ed.sel = c.id; mudou(); pintarCanvas(); pintarLado();
  }
  const fmtEspera = s => { s = +s || 0; return s >= 3600 && s % 3600 === 0 ? s / 3600 + (s === 3600 ? " hora" : " horas") : s >= 60 && s % 60 === 0 ? s / 60 + " min" : s + " s"; };
  const resumoGatilho = x => !x ? "Sem gatilho" : x.tipo === "primeira" ? "Primeira mensagem da pessoa" : (x.palavras || []).filter(Boolean).length ? (x.modo === "exata" ? "Mensagem igual a: " : "Mensagem com: ") + x.palavras.filter(Boolean).join(", ") : "Palavra-chave não definida";

  // ─── lista de fluxos ───────────────────────────────────────────────────────
  function listaHTML(){
    const l = F.lista;
    const cards = !l ? `<div style="color:${CINZA};font-size:13px">${F.erro ? e(F.erro) : "Carregando fluxos..."}</div>`
      : !l.length ? `<div style="padding:48px 24px;text-align:center;background:#FFFFFF;border:1px dashed #DCDCE2;border-radius:14px"><div style="font-size:14px;font-weight:600;margin-bottom:6px">Nenhum fluxo ainda</div><div style="font-size:13px;color:${CINZA};margin-bottom:16px">Monte uma conversa com mensagens, botões, imagem e áudio que dispara quando alguém manda uma palavra-chave.</div><button data-fx-novo style="${BTN_PRI}">${icon(ICONS.plus, 13, "currentColor")} Criar primeiro fluxo</button></div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">${l.map(f => `<div data-fx-abrir="${f.id}" data-hover-border style="background:#FFFFFF;border:1px solid ${BORDA};border-radius:14px;padding:16px;cursor:pointer;display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;${f.active ? `background:#E8F5EE;color:#1E7A4D` : `background:#F1F1F3;color:${CINZA}`}">${f.active ? "Ativo" : "Rascunho"}</span><span style="font-size:11.5px;color:${MUTE}">${f.blocos} blocos</span><span style="flex:1"></span>
            <span data-fx-dup="${f.id}" title="Duplicar" style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:${CINZA}" data-hover>${icon(ICONS.copy, 14)}</span>
            <span data-fx-del="${f.id}" title="Excluir" style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:${VERM}" data-hover>${icon(ICONS.trash, 14)}</span></div>
          <div style="${HEAD};font-size:15px;font-weight:600">${e(f.name)}</div>
          <div style="font-size:12.5px;color:${CINZA};display:flex;gap:6px;align-items:flex-start">${icon(IC.gatilho, 13, "#9A6700")}<span>${e(resumoGatilho(f.gatilho))}</span></div>
          <div style="display:flex;gap:14px;font-size:12px;color:${CINZA};border-top:1px solid #F1F1F3;padding-top:10px"><span><b style="color:#17171A">${f.stats.total}</b> execuções</span><span><b style="color:#17171A">${f.stats.concluidos}</b> concluídas</span>${f.stats.andamento ? `<span><b style="color:#17171A">${f.stats.andamento}</b> em andamento</span>` : ""}${f.stats.erros ? `<span style="color:${VERM}"><b>${f.stats.erros}</b> com erro</span>` : ""}</div>
        </div>`).join("")}</div>`;
    return `<div style="flex:1;min-width:0;overflow-y:auto;padding:24px" data-scroll="fx-lista">
      <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:18px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><div style="${HEAD};font-size:20px;font-weight:600">Fluxos de conversa</div>
        <div style="font-size:12.5px;color:${CINZA};margin-top:4px;line-height:1.5">Respostas automáticas montadas em blocos. Um fluxo ativo responde antes dos agentes de IA quando a mensagem bate no gatilho.</div></div>
        ${l && l.length ? `<button data-fx-novo style="${BTN_PRI}">${icon(ICONS.plus, 13, "currentColor")} Novo fluxo</button>` : ""}</div>${cards}</div>`;
  }

  // ─── blocos no canvas ──────────────────────────────────────────────────────
  function porta(id, p){ return `<span data-fx-port="${e(id)}|${e(p)}" title="Arraste para ligar ao próximo bloco" style="position:absolute;right:-8px;top:50%;margin-top:-8px;width:16px;height:16px;border-radius:50%;background:#FFFFFF;border:2px solid #A9A9B2;cursor:crosshair;box-sizing:border-box;z-index:2"></span>`; }
  function corpoBloco(n){
    const x = n.data || {}, linha = (t, cor) => `<div style="font-size:12.5px;color:${cor || "#3C3C44"};line-height:1.45;white-space:pre-wrap;word-break:break-word;max-height:96px;overflow:hidden">${t}</div>`;
    const vazio = t => `<div style="border:1.5px dashed #D5D5DC;border-radius:9px;padding:12px;text-align:center;font-size:12.5px;color:${MUTE}">${t}</div>`;
    if(n.type === "gatilho") return `<div style="font-size:12.5px;color:#3C3C44;line-height:1.5">${x.tipo === "primeira" ? "Quando a pessoa manda a <b>primeira mensagem</b> para a conta." : (x.palavras || []).filter(Boolean).length ? `Quando a mensagem ${x.modo === "exata" ? "for exatamente" : "tiver"}: ${x.palavras.filter(Boolean).map(w => `<span style="display:inline-block;margin:2px 3px 0 0;padding:1px 8px;border-radius:20px;background:#FFF4D6;color:#7A5200;font-weight:600">${e(w)}</span>`).join("")}` : vazio("+ Defina a palavra-chave")}</div>`;
    if(n.type === "mensagem"){
      const bs = x.botoes || [];
      const txt = String(x.texto || "").trim() ? linha(e(x.texto)) : vazio("Escreva o texto");
      const bot = bs.map(b => `<div style="position:relative;margin-top:6px;padding:8px 10px;border-radius:9px;background:${x.estilo === "rapidas" ? "#FFFFFF" : "#F6F6F7"};border:1px solid ${x.estilo === "rapidas" ? "#D5D5DC" : "transparent"};font-size:12.5px;font-weight:600;text-align:center;color:${b.tipo === "link" ? "#1D5FD1" : "#17171A"}">${e(b.titulo || "Botão")}${b.tipo === "link" ? " " + icon(IC.link, 11, "#1D5FD1") : ""}${b.tipo !== "link" ? porta(n.id, "btn:" + b.id) : ""}</div>`).join("");
      return txt + bot;
    }
    if(n.type === "imagem") return (x.url ? `<img src="${e(x.url)}" alt="" style="width:100%;max-height:150px;object-fit:cover;border-radius:9px;display:block">` : vazio("Envie uma imagem")) + (x.legenda ? `<div style="margin-top:6px">${linha(e(x.legenda))}</div>` : "");
    if(n.type === "audio") return x.url ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;background:#F6F6F7;font-size:12.5px">${icon(IC.audio, 14, "#B4316B")}<span>Áudio${x.duracao ? " de " + x.duracao + " s" : ""}</span></div>` : vazio("Grave ou envie o áudio");
    if(n.type === "pergunta") return (String(x.texto || "").trim() ? linha(e(x.texto)) : vazio("Escreva a pergunta")) + (x.campo ? `<div style="margin-top:6px;font-size:11.5px;color:${CINZA}">Guarda a resposta em <b>{{${e(x.campo)}}}</b></div>` : "");
    if(n.type === "espera") return `<div style="font-size:13px;color:#3C3C44">Espera <b>${fmtEspera(x.segundos)}</b> e segue</div>`;
    if(n.type === "agente"){ const a = (F.ed.agentes || []).find(y => y.id === x.agentId); return a ? `<div style="font-size:12.5px;color:#3C3C44;line-height:1.5">A conversa passa para <b>${e(a.name)}</b>${a.active ? "" : ` <span style="color:${VERM}">(desligado)</span>`}</div>` : vazio("Escolha o agente"); }
    return "";
  }
  function blocoHTML(n){
    const t = TIPOS[n.type], sel = F.ed.sel === n.id, ps = portas(n);
    const rodape = ps.filter(p => !String(p[0]).startsWith("btn:")).map(p => `<div style="position:relative;text-align:right;font-size:11.5px;color:${CINZA};padding:10px 14px 2px 0">${p[1]}${porta(n.id, p[0])}</div>`).join("");
    return `<div data-fx-node="${e(n.id)}" style="position:absolute;left:${n.x}px;top:${n.y}px;width:${LARG}px;background:#FFFFFF;border:${sel ? "2px solid " + ROXO : "1px solid #E0E0E5"};border-radius:14px;box-shadow:${sel ? "0 6px 22px rgba(103,61,230,0.18)" : "0 2px 8px rgba(23,23,26,0.06)"};padding:${sel ? "11px 13px 9px" : "12px 14px 10px"};cursor:grab;user-select:none;touch-action:none">
      ${n.type !== "gatilho" ? `<span data-fx-in style="position:absolute;left:-7px;top:24px;width:12px;height:12px;border-radius:50%;background:#A9A9B2;border:2px solid #FFFFFF"></span>` : ""}
      ${sel && n.type !== "gatilho" ? `<div style="position:absolute;top:-42px;left:50%;transform:translateX(-50%);display:flex;gap:2px;padding:4px;background:#FFFFFF;border-radius:10px;box-shadow:0 4px 14px rgba(23,23,26,0.14)"><span data-fx-dupbloco title="Duplicar bloco" data-hover style="width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#3C3C44">${icon(ICONS.copy, 15)}</span><span data-fx-delbloco title="Excluir bloco" data-hover style="width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${VERM}">${icon(ICONS.trash, 15)}</span></div>` : ""}
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px"><span style="width:28px;height:28px;border-radius:8px;background:${t.fundo};color:${t.cor};display:flex;align-items:center;justify-content:center;flex:0 0 28px">${icon(IC[n.type], 15, "currentColor")}</span>
        <span style="min-width:0"><span style="display:block;font-size:10.5px;color:${MUTE}">${t.sub}</span><span style="display:block;font-size:13.5px;font-weight:600;color:#17171A">${t.rot}</span></span></div>
      ${corpoBloco(n)}${rodape}
    </div>`;
  }

  // ─── editor: barra, canvas, lado ───────────────────────────────────────────
  function barraHTML(){
    const ed = F.ed, est = { salvo: ["Salvo", VERDE], sujo: ["Alterações não salvas", MUTE], salvando: ["Salvando...", MUTE], erro: ["Não salvo", VERM] }[ed.estado] || ["", MUTE];
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:#FFFFFF;border-bottom:1px solid ${BORDA};flex-wrap:wrap">
      <span data-fx-voltar data-hover style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:12.5px;color:${CINZA}">${icon(ICONS.chevLeft, 13)} Fluxos</span>
      <input data-fx-nome value="${e(ed.name)}" maxlength="80" style="${IN};width:auto;min-width:160px;max-width:300px;font-weight:600;border-color:transparent;background:transparent" title="Nome do fluxo">
      <span style="font-size:12px;color:${est[1]};display:flex;align-items:center;gap:6px">${ed.estado === "salvo" ? "✓ " : ""}${est[0]}</span>
      <span style="flex:1"></span>
      <span style="font-size:12px;color:${CINZA}">${ed.stats ? ed.stats.total + " execuções" : ""}</span>
      <button data-fx-sim style="${BTN}">${icon(ICONS.play, 12, "currentColor")} ${ed.sim ? "Fechar simulador" : "Simular"}</button>
      ${ed.active ? `<button data-fx-ativar="0" style="${BTN};color:${VERM}">Desativar</button><span style="font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:20px;background:#E8F5EE;color:#1E7A4D">● Ativo</span>`
        : `<span style="font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:20px;background:#FFF4D6;color:#7A5200" title="Enquanto for rascunho, o fluxo não responde ninguém">Rascunho: não responde DMs</span><button data-fx-ativar="1" style="${BTN_PRI}">Ativar fluxo</button>`}
    </div>
    ${ed.problemas ? `<div style="padding:10px 16px;background:rgba(192,52,28,0.07);border-bottom:1px solid rgba(192,52,28,0.2);font-size:12.5px;color:${VERM};line-height:1.6"><b>${ed.estado === "erro" && ed.active ? "Não salvei: o fluxo está ativo e tem problemas." : "Antes de ativar, corrija:"}</b> ${ed.problemas.map(e).join(" · ")}</div>` : ""}`;
  }
  function canvasHTML(){
    const ed = F.ed;
    return `<div id="fx-canvas" style="position:absolute;inset:0;overflow:hidden;background-color:#F6F6F7;background-image:radial-gradient(#D9D9DF 1px,transparent 1px);background-size:${22 * ed.z}px ${22 * ed.z}px;background-position:${ed.px}px ${ed.py}px;touch-action:none;cursor:default">
      <div id="fx-layer" style="position:absolute;left:0;top:0;transform-origin:0 0;transform:translate(${ed.px}px,${ed.py}px) scale(${ed.z})">
        <svg id="fx-setas" style="position:absolute;left:0;top:0;width:1px;height:1px;max-width:none !important;overflow:visible"></svg>
        <div id="fx-nos">${D().nodes.map(blocoHTML).join("")}</div>
      </div>
      <div class="fx-dica" style="position:absolute;left:50%;top:12px;transform:translateX(-50%);padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.9);border:1px solid ${BORDA};font-size:12px;color:${CINZA};pointer-events:none;white-space:nowrap">${ed.sel ? "Edite o bloco no painel ao lado" : "Clique num bloco para editar · arraste a bolinha para ligar"}</div>
      <button data-fx-mais title="Adicionar bloco" style="position:absolute;right:18px;top:18px;width:52px;height:52px;border-radius:50%;border:0;background:${ROXO};color:#FFFFFF;cursor:pointer;box-shadow:0 8px 22px rgba(103,61,230,0.35);display:flex;align-items:center;justify-content:center">${icon(ICONS.plus, 22, "currentColor")}</button>
      <div style="position:absolute;left:18px;bottom:18px;display:flex;flex-direction:column;gap:6px">
        ${[["zoom-mais", ICONS.plus, "Aproximar"], ["zoom-menos", '<path d="M5 12h14" stroke-width="2.2"/>', "Afastar"], ["enquadrar", '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', "Enquadrar tudo"]].map(b => `<button data-fx-${b[0]} title="${b[2]}" style="width:36px;height:36px;border-radius:9px;border:1px solid ${BORDA};background:#FFFFFF;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#3C3C44">${icon(b[1], 15, "currentColor")}</button>`).join("")}
      </div>
      <div id="fx-menu-host"></div>
      <div id="fx-seta-x"></div>
    </div>`;
  }
  function editorHTML(){
    const ed = F.ed;
    return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0">
      <div id="fx-barra">${barraHTML()}</div>
      <div style="flex:1;min-height:0;display:flex;position:relative" class="fx-corpo">
        <div style="flex:1;min-width:0;position:relative" id="fx-canvas-host">${canvasHTML()}</div>
        <div id="fx-lado" class="fx-lado" style="width:350px;flex:0 0 350px;border-left:1px solid ${BORDA};background:#FFFFFF;overflow-y:auto;display:${ed.sel || ed.sim ? "block" : "none"}">${ladoHTML()}</div>
      </div>
      <style>@media (max-width: 860px){ .fx-corpo{ flex-direction:column } #fx-canvas-host{ min-height:58vh; flex:0 0 58vh !important } .fx-dica{ display:none } .fx-lado{ width:100% !important; flex:0 0 auto !important; max-height:52vh; border-left:0 !important; border-top:1px solid ${BORDA} } }</style>
    </div>`;
  }

  // ─── setas ─────────────────────────────────────────────────────────────────
  function pontoDe(el){
    const layer = document.getElementById("fx-layer"), lr = layer.getBoundingClientRect(), r = el.getBoundingClientRect(), z = F.ed.z;
    return { x: (r.left + r.width / 2 - lr.left) / z, y: (r.top + r.height / 2 - lr.top) / z };
  }
  const curva = (a, b) => { const dx = Math.max(50, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
  function desenharSetas(temp){
    const svg = document.getElementById("fx-setas"); if(!svg) return;
    const ed = F.ed, out = [`<defs><marker id="fx-ponta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8E8E99"/></marker><marker id="fx-ponta-sel" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${ROXO}"/></marker></defs>`];
    D().edges.forEach((ed2, i) => {
      const pe = document.querySelector(`[data-fx-port="${CSS.escape(ed2.de + "|" + ed2.porta)}"]`), alvo = document.querySelector(`[data-fx-node="${CSS.escape(ed2.para)}"] [data-fx-in]`);
      if(!pe || !alvo) return;
      const a = pontoDe(pe), b = pontoDe(alvo), sel = ed.selSeta === i, d = curva(a, b);
      out.push(`<path d="${d}" fill="none" stroke="transparent" stroke-width="14" data-fx-seta="${i}" style="cursor:pointer;pointer-events:stroke"/><path d="${d}" fill="none" stroke="${sel ? ROXO : "#8E8E99"}" stroke-width="${sel ? 2.5 : 2}" marker-end="url(#fx-ponta${sel ? "-sel" : ""})" style="pointer-events:none"/>`);
      if(sel) ed.selSetaMeio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    });
    if(temp) out.push(`<path d="${curva(temp.a, temp.b)}" fill="none" stroke="${ROXO}" stroke-width="2" stroke-dasharray="6 5"/>`);
    svg.innerHTML = out.join("");
    // marca as portas ligadas
    document.querySelectorAll("[data-fx-port]").forEach(p => { const [de, po] = p.dataset.fxPort.split("|"); const lig = D().edges.some(x => x.de === de && x.porta === po); p.style.background = lig ? "#8E8E99" : "#FFFFFF"; p.style.borderColor = lig ? "#8E8E99" : "#A9A9B2"; });
    const host = document.getElementById("fx-seta-x");
    if(host){ const m = ed.selSeta != null && ed.selSetaMeio; host.innerHTML = m ? `<button data-fx-seta-del title="Remover ligação" style="position:absolute;left:${m.x * ed.z + ed.px - 13}px;top:${m.y * ed.z + ed.py - 13}px;width:26px;height:26px;border-radius:50%;border:0;background:${VERM};color:#FFFFFF;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.2)">${icon(ICONS.x, 12, "currentColor")}</button>` : "";
      const b = host.querySelector("[data-fx-seta-del]"); if(b) b.addEventListener("click", ev => { ev.stopPropagation(); D().edges.splice(ed.selSeta, 1); ed.selSeta = null; mudou(); desenharSetas(); }); }
  }
  function aplicarVista(){
    const ed = F.ed, layer = document.getElementById("fx-layer"), cv = document.getElementById("fx-canvas"); if(!layer || !cv) return;
    layer.style.transform = `translate(${ed.px}px,${ed.py}px) scale(${ed.z})`;
    cv.style.backgroundSize = `${22 * ed.z}px ${22 * ed.z}px`; cv.style.backgroundPosition = `${ed.px}px ${ed.py}px`;
    desenharSetas();
  }
  function zoomEm(fator, cx, cy){
    const ed = F.ed, z = Math.min(1.6, Math.max(0.35, ed.z * fator));
    ed.px = cx - (cx - ed.px) * (z / ed.z); ed.py = cy - (cy - ed.py) * (z / ed.z); ed.z = z; aplicarVista();
  }
  function enquadrar(){
    const ed = F.ed, cv = document.getElementById("fx-canvas"); if(!ed || !cv || !D().nodes.length) return;
    const xs = D().nodes.map(n => n.x), ys = D().nodes.map(n => n.y);
    const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 60, maxX = Math.max(...xs) + LARG + 60, maxY = Math.max(...ys) + 260;
    const z = Math.min(1, Math.max(0.35, Math.min(cv.clientWidth / (maxX - minX), cv.clientHeight / (maxY - minY))));
    ed.z = z; ed.px = (cv.clientWidth - (maxX - minX) * z) / 2 - minX * z; ed.py = Math.max(20, (cv.clientHeight - (maxY - minY) * z) / 2) - minY * z; aplicarVista();
  }
  const paraCanvas = (cx, cy) => { const r = document.getElementById("fx-canvas").getBoundingClientRect(), ed = F.ed; return { x: (cx - r.left - ed.px) / ed.z, y: (cy - r.top - ed.py) / ed.z }; };

  // ─── menu de blocos ────────────────────────────────────────────────────────
  function abrirMenu(cx, cy, pendente){
    const ed = F.ed, cv = document.getElementById("fx-canvas"), r = cv.getBoundingClientRect();
    ed.menu = { pos: paraCanvas(cx, cy), ligar: pendente || null };
    const host = document.getElementById("fx-menu-host");
    const left = Math.min(Math.max(8, cx - r.left), r.width - 290), top = Math.min(Math.max(8, cy - r.top), r.height - 380);
    host.innerHTML = `<div data-fx-menu style="position:absolute;left:${left}px;top:${top}px;width:280px;background:#FFFFFF;border:1px solid ${BORDA};border-radius:14px;box-shadow:0 18px 44px rgba(23,23,26,0.18);padding:8px;z-index:10">
      <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${CINZA};padding:6px 8px">${pendente ? "Próximo passo" : "Adicionar bloco"}</div>
      ${PALETA.map(p => `<div data-fx-criar="${p[0]}" data-hover style="display:flex;gap:10px;align-items:center;padding:8px;border-radius:9px;cursor:pointer"><span style="width:30px;height:30px;border-radius:8px;background:${TIPOS[p[0]].fundo};color:${TIPOS[p[0]].cor};display:flex;align-items:center;justify-content:center;flex:0 0 30px">${icon(IC[p[0]], 15, "currentColor")}</span><span><span style="display:block;font-size:13px;font-weight:600">${p[1]}</span><span style="display:block;font-size:11.5px;color:${CINZA}">${p[2]}</span></span></div>`).join("")}
    </div>`;
    host.querySelectorAll("[data-fx-criar]").forEach(el => el.addEventListener("click", ev => {
      ev.stopPropagation(); const m = ed.menu; const n = criarBloco(el.dataset.fxCriar, m.pos.x, m.pos.y - 20);
      if(m.ligar) ligar(m.ligar.de, m.ligar.porta, n.id);
      fecharMenu(); ed.sel = n.id; pintarCanvas(); pintarLado();
    }));
  }
  function fecharMenu(){ if(!F.ed) return; F.ed.menu = null; const h = document.getElementById("fx-menu-host"); if(h) h.innerHTML = ""; }

  // ─── painel lateral: edição do bloco ───────────────────────────────────────
  function ladoHTML(){
    const ed = F.ed;
    if(ed.sim) return simHTML();
    const n = ed.sel && noDe(ed.sel); if(!n) return "";
    const x = n.data, t = TIPOS[n.type];
    const cab = `<div style="display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #F1F1F3"><span style="width:30px;height:30px;border-radius:8px;background:${t.fundo};color:${t.cor};display:flex;align-items:center;justify-content:center">${icon(IC[n.type], 15, "currentColor")}</span><span style="flex:1;font-size:14px;font-weight:600">${t.rot}</span><span data-fx-fechar-lado data-hover style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${CINZA}">${icon(ICONS.x, 14)}</span></div>`;
    const vars = `<p style="${HELP}">Use <b>{{nome}}</b> para o primeiro nome da pessoa${D().nodes.some(y => y.type === "pergunta" && y.data.campo) ? " e " + D().nodes.filter(y => y.type === "pergunta" && y.data.campo).map(y => "<b>{{" + e(y.data.campo) + "}}</b>").join(", ") + " para as respostas guardadas" : ""}.</p>`;
    let c = "";
    if(n.type === "gatilho"){
      const op = (v, rot, sub) => `<label style="display:flex;gap:10px;padding:10px 12px;border:1px solid ${x.tipo === v ? ROXO : BORDA};background:${x.tipo === v ? "rgba(103,61,230,0.05)" : "#FFFFFF"};border-radius:10px;cursor:pointer;margin-bottom:8px"><input type="radio" name="fx-gat" data-fx-gat-tipo="${v}" ${x.tipo === v ? "checked" : ""} style="accent-color:${ROXO};margin-top:2px"><span><span style="display:block;font-size:13px;font-weight:600">${rot}</span><span style="display:block;font-size:11.5px;color:${CINZA};margin-top:2px">${sub}</span></span></label>`;
      c = `<label style="${LBL}">Dispara quando</label>${op("palavra", "A mensagem tem uma palavra-chave", "Ex.: quem mandar \"preço\" ou \"valor\"")}${op("primeira", "A pessoa manda a primeira mensagem", "Só para quem nunca falou com a conta")}
        ${x.tipo === "palavra" ? `<label style="${LBL}">Palavras-chave</label><input data-fx-campo="palavras" value="${e((x.palavras || []).join(", "))}" placeholder="preço, valor, quero" style="${IN}"><p style="${HELP}">Separe por vírgula. Maiúsculas e acentos não importam.</p>
          <label style="${LBL}">Como comparar</label><select data-fx-campo="modo" style="${IN}"><option value="contem" ${x.modo !== "exata" ? "selected" : ""}>A mensagem contém a palavra</option><option value="exata" ${x.modo === "exata" ? "selected" : ""}>A mensagem é exatamente a palavra</option></select>` : ""}
        <p style="${HELP};margin-top:14px">Comentários em posts continuam no auto-DM de comentários. Cuidado para a palavra não ser a mesma de uma automação do ManyChat: as duas responderiam.</p>`;
    }
    if(n.type === "mensagem"){
      const bs = x.botoes || [], rap = x.estilo === "rapidas", max = rap ? 13 : 3;
      c = `<label style="${LBL}">Texto</label><textarea data-fx-campo="texto" rows="5" maxlength="1000" placeholder="Oi {{nome}}! ..." style="${IN};resize:vertical;line-height:1.5">${e(x.texto || "")}</textarea>${vars}
        <label style="${LBL}">Botões</label>
        <div style="display:flex;gap:4px;padding:3px;background:#F1F1F3;border-radius:9px;margin-bottom:8px">${[["botoes", "Botões (até 3)"], ["rapidas", "Respostas rápidas (até 13)"]].map(s => `<span data-fx-estilo="${s[0]}" style="flex:1;text-align:center;padding:6px;border-radius:7px;font-size:12px;cursor:pointer;${(x.estilo || "botoes") === s[0] ? "background:#FFFFFF;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)" : "color:" + CINZA}">${s[1]}</span>`).join("")}</div>
        <p style="${HELP};margin:0 0 8px">${rap ? "Aparecem como balões embaixo da mensagem e somem depois do toque. Só texto, até 20 caracteres." : "Ficam presos na mensagem. Podem seguir o fluxo ou abrir um link. Até 20 caracteres."}</p>
        ${bs.map((b, i) => `<div style="border:1px solid ${BORDA};border-radius:10px;padding:10px;margin-bottom:8px">
          <div style="display:flex;gap:6px"><input data-fx-botao="${i}" data-k="titulo" value="${e(b.titulo || "")}" maxlength="20" placeholder="Título do botão" style="${IN}"><span data-fx-botao-del="${i}" title="Remover" data-hover style="width:34px;flex:0 0 34px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${VERM}">${icon(ICONS.trash, 14)}</span></div>
          ${rap ? "" : `<select data-fx-botao="${i}" data-k="tipo" style="${IN};margin-top:6px"><option value="proximo" ${b.tipo !== "link" ? "selected" : ""}>Seguir o fluxo</option><option value="link" ${b.tipo === "link" ? "selected" : ""}>Abrir um link</option></select>
          ${b.tipo === "link" ? `<input data-fx-botao="${i}" data-k="url" value="${e(b.url || "")}" placeholder="https://..." style="${IN};margin-top:6px">` : ""}`}</div>`).join("")}
        ${bs.length < max ? `<button data-fx-botao-add style="${BTN};width:100%">${icon(ICONS.plus, 12, "currentColor")} Adicionar ${rap ? "resposta rápida" : "botão"}</button>` : ""}
        ${bs.some(b => b.tipo !== "link") ? `<p style="${HELP}">Cada botão tem a própria bolinha no bloco: arraste para ligar ao que acontece depois do clique.</p>` : ""}`;
    }
    if(n.type === "imagem"){
      c = `<label style="${LBL}">Imagem</label>${x.url ? `<img src="${e(x.url)}" alt="" style="width:100%;border-radius:10px;border:1px solid ${BORDA};display:block;margin-bottom:8px">` : ""}
        <label style="${BTN};width:100%;box-sizing:border-box">${icon(ICONS.image, 13, "currentColor")} ${x.url ? "Trocar imagem" : "Enviar imagem"}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-fx-upload="imagem" hidden></label>
        <p style="${HELP}">PNG, JPG, GIF ou WebP, até 8 MB.</p>
        <label style="${LBL}">Legenda (opcional)</label><textarea data-fx-campo="legenda" rows="3" maxlength="1000" placeholder="Vai como uma mensagem logo depois da imagem" style="${IN};resize:vertical">${e(x.legenda || "")}</textarea>${vars}`;
    }
    if(n.type === "audio"){
      const g = ed.grav;
      c = `<label style="${LBL}">Áudio</label>${x.url ? `<audio controls src="${e(x.url)}" style="width:100%;margin-bottom:8px"></audio>` : ""}
        ${g && g.no === n.id && g.rec ? `<button data-fx-gravar style="${BTN};width:100%;color:${VERM};border-color:${VERM}">● Gravando ${g.seg || 0} s · toque para parar</button>`
          : g && g.no === n.id && g.subindo ? `<div style="font-size:12.5px;color:${CINZA};padding:8px 0">Enviando o áudio...</div>`
          : `<button data-fx-gravar style="${BTN_PRI};width:100%">${icon(ICONS.mic, 13, "currentColor")} ${x.url ? "Gravar de novo" : "Gravar áudio"}</button>`}
        <label style="${BTN};width:100%;box-sizing:border-box;margin-top:8px">Enviar arquivo de áudio<input type="file" accept="audio/*" data-fx-upload="audio" hidden></label>
        <p style="${HELP}">Chega como mensagem de voz. O servidor converte para M4A, o formato que o Instagram aceita.</p>`;
    }
    if(n.type === "pergunta"){
      c = `<label style="${LBL}">Pergunta</label><textarea data-fx-campo="texto" rows="4" maxlength="1000" placeholder="Qual é o seu melhor e-mail?" style="${IN};resize:vertical">${e(x.texto || "")}</textarea>${vars}
        <label style="${LBL}">Guardar a resposta como</label><input data-fx-campo="campo" value="${e(x.campo || "")}" maxlength="30" placeholder="email" style="${IN}">
        <p style="${HELP}">Depois use <b>{{${e(x.campo || "email")}}}</b> em outras mensagens. O fluxo espera a pessoa responder (até 24 h, limite da Meta).</p>`;
    }
    if(n.type === "espera"){
      const s = +x.segundos || 60, un = s % 3600 === 0 ? 3600 : s % 60 === 0 ? 60 : 1;
      c = `<label style="${LBL}">Esperar</label><div style="display:flex;gap:8px"><input type="number" min="1" data-fx-espera-n value="${s / un}" style="${IN}"><select data-fx-espera-u style="${IN}"><option value="1" ${un === 1 ? "selected" : ""}>segundos</option><option value="60" ${un === 60 ? "selected" : ""}>minutos</option><option value="3600" ${un === 3600 ? "selected" : ""}>horas</option></select></div>
        <p style="${HELP}">Até 23 horas: depois de 24 h sem a pessoa responder, a Meta não deixa mais mandar mensagem.</p>`;
    }
    if(n.type === "agente"){
      const ags = ed.agentes || [];
      c = `<label style="${LBL}">Agente</label>${ags.length ? `<select data-fx-agente style="${IN}"><option value="">Escolha...</option>${ags.map(a => `<option value="${a.id}" ${x.agentId === a.id ? "selected" : ""}>${e(a.name)}${a.active ? "" : " (desligado)"}</option>`).join("")}</select>` : `<div style="font-size:12.5px;color:${CINZA}">Nenhum agente no Instagram. Crie em Agentes.</div>`}
        <p style="${HELP}">O fluxo termina aqui e as próximas mensagens da pessoa vão para esse agente. Ele precisa estar ligado.</p>`;
    }
    return cab + `<div style="padding:4px 18px 22px">${c}</div>`;
  }

  // ─── gravação e upload de mídia ────────────────────────────────────────────
  async function subir(no, tipo, blob){
    const ed = F.ed;
    ed.grav = { no: no.id, subindo: true }; pintarLado();
    try {
      const r = await fetch(API + "/media?tipo=" + tipo, { method: "POST", headers: { "Content-Type": blob.type || (tipo === "audio" ? "audio/webm" : "image/png") }, body: blob });
      const j = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(j.error || "HTTP " + r.status);
      no.data.url = j.url; if(tipo === "audio") no.data.duracao = j.duracao || null;
      mudou(); pintarNo(no.id);
    } catch(err){ cfgToast("Não enviei o arquivo: " + err.message, true); }
    if(F.ed === ed){ ed.grav = null; pintarLado(); }
  }
  async function gravar(no){
    const ed = F.ed, g = ed.grav;
    if(g && g.rec){ g.rec.stop(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch(err){ cfgToast("O navegador não liberou o microfone.", true); return; }
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined), partes = [];
    ed.grav = { no: no.id, rec, seg: 0, t: setInterval(() => { if(ed.grav && ed.grav.rec === rec){ ed.grav.seg++; if(ed.grav.seg >= 120) rec.stop(); pintarLado(); } }, 1000) };
    rec.ondataavailable = ev => { if(ev.data && ev.data.size) partes.push(ev.data); };
    rec.onstop = () => { clearInterval(ed.grav && ed.grav.t); stream.getTracks().forEach(t => t.stop()); const blob = new Blob(partes, { type: (rec.mimeType || "audio/webm").split(";")[0] }); if(blob.size) subir(no, "audio", blob); else { ed.grav = null; pintarLado(); } };
    rec.start(); pintarLado();
  }

  // ─── simulador (nada é enviado) ────────────────────────────────────────────
  function simIniciar(){
    const g = D().nodes.find(n => n.type === "gatilho"), x = (g && g.data) || {};
    const fala = x.tipo === "primeira" ? "Oi!" : ((x.palavras || []).filter(Boolean)[0] || "oi");
    F.ed.sim = { msgs: [{ eu: true, texto: fala }], espera: null, attrs: { nome: "Maria" } };
    simAndar(g ? seguinte(g.id, "proximo") : null);
  }
  function seguinte(de, porta){ const e2 = D().edges.find(x => x.de === de && x.porta === porta); return e2 ? noDe(e2.para) : null; }
  const simTexto = t => String(t || "").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, k) => F.ed.sim.attrs[k] != null ? F.ed.sim.attrs[k] : "");
  function simAndar(n){
    const s = F.ed.sim; s.espera = null;
    for(let i = 0; n && i < 40; i++){
      const x = n.data || {};
      if(n.type === "mensagem"){ s.msgs.push({ texto: simTexto(x.texto), botoes: x.botoes || [], estilo: x.estilo, no: n.id });
        if((x.botoes || []).some(b => b.tipo !== "link")){ s.espera = { tipo: "botao", no: n.id }; return; } n = seguinte(n.id, "proximo"); continue; }
      if(n.type === "imagem"){ s.msgs.push({ img: x.url }); if(x.legenda) s.msgs.push({ texto: simTexto(x.legenda) }); n = seguinte(n.id, "proximo"); continue; }
      if(n.type === "audio"){ s.msgs.push({ audio: x.url }); n = seguinte(n.id, "proximo"); continue; }
      if(n.type === "espera"){ s.msgs.push({ nota: "⏱ espera " + fmtEspera(x.segundos) }); n = seguinte(n.id, "proximo"); continue; }
      if(n.type === "pergunta"){ s.msgs.push({ texto: simTexto(x.texto) }); s.espera = { tipo: "resposta", no: n.id, campo: x.campo }; return; }
      if(n.type === "agente"){ const a = (F.ed.agentes || []).find(y => y.id === x.agentId); s.msgs.push({ nota: "A conversa passa para o agente " + (a ? a.name : "(não escolhido)") }); return; }
      n = seguinte(n.id, "proximo");
    }
    s.msgs.push({ nota: "Fim do fluxo" });
  }
  function simHTML(){
    const s = F.ed.sim;
    const bolha = m => m.nota ? `<div style="text-align:center;font-size:11.5px;color:${MUTE};margin:8px 0">${e(m.nota)}</div>`
      : m.eu ? `<div style="display:flex;justify-content:flex-end;margin:6px 0"><div style="max-width:78%;padding:8px 12px;border-radius:16px 16px 4px 16px;background:${ROXO};color:#FFFFFF;font-size:13px;white-space:pre-wrap">${e(m.texto)}</div></div>`
      : m.img ? `<div style="margin:6px 0"><img src="${e(m.img)}" alt="" style="max-width:70%;border-radius:14px;display:block"></div>`
      : m.audio ? `<div style="margin:6px 0"><audio controls src="${e(m.audio)}" style="width:80%"></audio></div>`
      : `<div style="margin:6px 0;max-width:82%"><div style="padding:8px 12px;border-radius:16px 16px 16px 4px;background:#EFEFF2;font-size:13px;white-space:pre-wrap;word-break:break-word">${e(m.texto) || "<i style='color:#9A9AA3'>(sem texto)</i>"}</div>
          ${m.botoes && m.botoes.length ? (m.estilo === "rapidas" ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${m.botoes.map(b => `<span data-fx-sim-btn="${e(m.no)}|${e(b.id)}" style="padding:6px 12px;border-radius:18px;border:1px solid ${ROXO};color:${ROXO};font-size:12.5px;cursor:pointer;background:#FFFFFF">${e(b.titulo || "Botão")}</span>`).join("")}</div>`
            : `<div style="margin-top:4px;border-radius:12px;overflow:hidden;border:1px solid ${BORDA}">${m.botoes.map(b => `<div data-fx-sim-btn="${e(m.no)}|${e(b.id)}" style="padding:9px;text-align:center;font-size:13px;font-weight:600;color:${b.tipo === "link" ? "#1D5FD1" : "#17171A"};border-top:1px solid ${BORDA};cursor:pointer;background:#FFFFFF">${e(b.titulo || "Botão")}${b.tipo === "link" ? " ↗" : ""}</div>`).join("")}</div>`) : ""}</div>`;
    return `<div style="display:flex;flex-direction:column;height:100%;min-height:420px">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #F1F1F3"><span style="flex:1;font-size:14px;font-weight:600">Simulador</span><button data-fx-sim-reini style="${BTN};padding:6px 10px;font-size:12px">Recomeçar</button></div>
      <div style="padding:6px 18px;font-size:11.5px;color:${CINZA};background:#FAFAFB">Nada é enviado: é só para testar o caminho. {{nome}} aparece como "Maria".</div>
      <div id="fx-sim-msgs" style="flex:1;overflow-y:auto;padding:12px 16px">${s.msgs.map(bolha).join("")}</div>
      ${s.espera && s.espera.tipo === "resposta" ? `<div style="display:flex;gap:6px;padding:10px 12px;border-top:1px solid #F1F1F3"><input data-fx-sim-in placeholder="Responder como a pessoa..." style="${IN}"><button data-fx-sim-env style="${BTN_PRI}">Enviar</button></div>` : ""}
    </div>`;
  }
  function simClique(noId, btnId){
    const s = F.ed.sim, n = noDe(noId), b = n && (n.data.botoes || []).find(x => x.id === btnId); if(!b) return;
    if(b.tipo === "link"){ if(b.url) window.open(b.url, "_blank", "noopener"); return; }
    s.msgs.push({ eu: true, texto: b.titulo }); simAndar(seguinte(noId, "btn:" + btnId)); pintarLado(true);
  }
  function simResponder(txt){
    const s = F.ed.sim; if(!s.espera || s.espera.tipo !== "resposta" || !String(txt).trim()) return;
    s.msgs.push({ eu: true, texto: txt }); if(s.espera.campo) s.attrs[s.espera.campo] = txt;
    simAndar(seguinte(s.espera.no, "resposta")); pintarLado(true);
  }

  // ─── pintura parcial ───────────────────────────────────────────────────────
  function pintar(){ const r = document.getElementById("igfx"); if(!r) return; r.innerHTML = F.ed ? editorHTML() : listaHTML(); montar(r); }
  function pintarBarra(){ const b = document.getElementById("fx-barra"); if(b && F.ed){ b.innerHTML = barraHTML(); montarBarra(b); } }
  function pintarCanvas(){ const h = document.getElementById("fx-nos"); if(!h || !F.ed) return; h.innerHTML = D().nodes.map(blocoHTML).join(""); montarNos(h); desenharSetas(); }
  function pintarNo(id){ const el = document.querySelector(`[data-fx-node="${CSS.escape(id)}"]`), n = noDe(id); if(!el || !n){ pintarCanvas(); return; } const tmp = document.createElement("div"); tmp.innerHTML = blocoHTML(n); const novo = tmp.firstElementChild; el.replaceWith(novo); montarNos(novo.parentElement, novo); desenharSetas(); }
  function pintarLado(rolar){
    const l = document.getElementById("fx-lado"); if(!l || !F.ed) return;
    l.style.display = F.ed.sel || F.ed.sim ? "block" : "none"; l.innerHTML = ladoHTML(); montarLado(l);
    if(rolar){ const m = document.getElementById("fx-sim-msgs"); if(m) m.scrollTop = m.scrollHeight; }
    setTimeout(desenharSetas, 0);
  }

  // ─── eventos ───────────────────────────────────────────────────────────────
  const on = (root, sel, tipo, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(tipo, ev => fn(el, ev)));
  function montar(r){
    if(!F.ed){
      on(r, "[data-fx-novo]", "click", (_el, ev) => { ev.stopPropagation(); novo(); });
      on(r, "[data-fx-abrir]", "click", el => abrir(+el.dataset.fxAbrir));
      on(r, "[data-fx-dup]", "click", async (el, ev) => { ev.stopPropagation(); try { await api("/" + el.dataset.fxDup + "/duplicar", { method: "POST" }); cfgToast("Fluxo duplicado (como rascunho)."); carregar(); } catch(err){ cfgToast(err.message, true); } });
      on(r, "[data-fx-del]", "click", async (el, ev) => { ev.stopPropagation(); const f = (F.lista || []).find(x => x.id === +el.dataset.fxDel);
        if(!await zConfirm(`Excluir o fluxo "${f ? f.name : ""}"? ${f && f.active ? "Ele está ativo e para de responder na hora. " : ""}Não dá para desfazer.`)) return;
        try { await api("/" + el.dataset.fxDel, { method: "DELETE" }); carregar(); } catch(err){ cfgToast(err.message, true); } });
      return;
    }
    montarBarra(document.getElementById("fx-barra")); montarCanvas(); montarNos(document.getElementById("fx-nos")); montarLado(document.getElementById("fx-lado"));
    setTimeout(desenharSetas, 0);
  }
  function montarBarra(b){
    const ed = F.ed; if(!b) return;
    on(b, "[data-fx-voltar]", "click", () => voltar());
    on(b, "[data-fx-nome]", "input", el => { ed.name = el.value; mudou(); });
    on(b, "[data-fx-sim]", "click", () => { if(ed.sim) ed.sim = null; else { ed.sel = null; ed.selSeta = null; simIniciar(); } pintarBarra(); pintarCanvas(); pintarLado(true); });
    on(b, "[data-fx-ativar]", "click", el => ativar(el.dataset.fxAtivar === "1"));
  }
  function montarNos(h, so){
    if(!h) return;
    const alvo = so ? so.parentElement || h : h;
    on(alvo, "[data-fx-dupbloco]", "click", (_el, ev) => { ev.stopPropagation(); duplicarBloco(F.ed.sel); });
    on(alvo, "[data-fx-delbloco]", "click", async (_el, ev) => { ev.stopPropagation(); apagarBloco(F.ed.sel); });
  }
  function montarCanvas(){
    const cv = document.getElementById("fx-canvas"), ed = F.ed; if(!cv) return;
    cv.addEventListener("wheel", ev => {
      ev.preventDefault(); const r = cv.getBoundingClientRect();
      if(ev.ctrlKey || ev.metaKey) zoomEm(Math.exp(-ev.deltaY * 0.01), ev.clientX - r.left, ev.clientY - r.top);
      else { ed.px -= ev.deltaX; ed.py -= ev.deltaY; aplicarVista(); }
    }, { passive: false });
    on(cv, "[data-fx-mais]", "click", (el, ev) => { ev.stopPropagation(); if(ed.menu){ fecharMenu(); return; } const r = el.getBoundingClientRect(); abrirMenu(r.left - 230, r.bottom + 8); });
    on(cv, "[data-fx-zoom-mais]", "click", (_e, ev) => { ev.stopPropagation(); zoomEm(1.2, cv.clientWidth / 2, cv.clientHeight / 2); });
    on(cv, "[data-fx-zoom-menos]", "click", (_e, ev) => { ev.stopPropagation(); zoomEm(1 / 1.2, cv.clientWidth / 2, cv.clientHeight / 2); });
    on(cv, "[data-fx-enquadrar]", "click", (_e, ev) => { ev.stopPropagation(); enquadrar(); });

    cv.addEventListener("pointerdown", ev => {
      if(ev.pointerType === "mouse" && ev.button !== 0) return;
      const t = ev.target;
      if(t.closest("[data-fx-menu]") || t.closest("button") || t.closest("[data-fx-dupbloco]") || t.closest("[data-fx-delbloco]")) return;
      const porta = t.closest("[data-fx-port]"), no = t.closest("[data-fx-node]"), seta = t.closest("[data-fx-seta]");
      const x0 = ev.clientX, y0 = ev.clientY; let moveu = false, fim, mover;
      const solto = () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", fim); window.removeEventListener("pointercancel", fim); };
      if(porta){
        ev.preventDefault();
        const [de, p] = porta.dataset.fxPort.split("|"), a = pontoDe(porta);
        mover = e2 => { moveu = moveu || Math.hypot(e2.clientX - x0, e2.clientY - y0) > 6; if(moveu) desenharSetas({ a, b: paraCanvas(e2.clientX, e2.clientY) }); };
        fim = e2 => { solto(); desenharSetas();
          if(!moveu) return;
          const el = document.elementFromPoint(e2.clientX, e2.clientY), alvo = el && el.closest("[data-fx-node]");
          if(alvo && alvo.dataset.fxNode !== de && (noDe(alvo.dataset.fxNode) || {}).type !== "gatilho"){ ligar(de, p, alvo.dataset.fxNode); desenharSetas(); }
          else if(!alvo && el && el.closest("#fx-canvas")) abrirMenu(e2.clientX, e2.clientY, { de, porta: p });
        };
      } else if(no){
        const id = no.dataset.fxNode, n = noDe(id), nx = n.x, ny = n.y;
        mover = e2 => { const dx = e2.clientX - x0, dy = e2.clientY - y0; if(!moveu && Math.hypot(dx, dy) < 4) return; moveu = true; no.style.cursor = "grabbing";
          n.x = Math.round(nx + dx / ed.z); n.y = Math.round(ny + dy / ed.z); no.style.left = n.x + "px"; no.style.top = n.y + "px"; desenharSetas(); };
        fim = () => { solto(); if(moveu){ mudou(); no.style.cursor = "grab"; return; }
          fecharMenu(); if(ed.sel === id && !ed.sim) return; ed.sel = id; ed.selSeta = null; ed.sim = null; pintarBarra(); pintarCanvas(); pintarLado(); };
      } else if(seta){
        ed.selSeta = +seta.dataset.fxSeta; if(ed.sel){ ed.sel = null; pintarCanvas(); pintarLado(); } desenharSetas(); return;
      } else {
        const px0 = ed.px, py0 = ed.py; cv.style.cursor = "grabbing";
        mover = e2 => { const dx = e2.clientX - x0, dy = e2.clientY - y0; if(Math.hypot(dx, dy) > 3){ moveu = true; fecharMenu(); } ed.px = px0 + dx; ed.py = py0 + dy; aplicarVista(); };
        fim = () => { solto(); cv.style.cursor = "default"; if(moveu) return;
          fecharMenu(); const tinha = ed.sel || ed.selSeta != null; ed.sel = null; ed.selSeta = null; if(tinha){ pintarCanvas(); pintarLado(); } };
      }
      window.addEventListener("pointermove", mover); window.addEventListener("pointerup", fim); window.addEventListener("pointercancel", fim);
    });
  }
  function montarLado(l){
    const ed = F.ed; if(!l) return;
    const n = ed.sel && noDe(ed.sel);
    on(l, "[data-fx-fechar-lado]", "click", () => { ed.sel = null; pintarCanvas(); pintarLado(); });
    // simulador
    on(l, "[data-fx-sim-btn]", "click", el => { const [no, b] = el.dataset.fxSimBtn.split("|"); simClique(no, b); });
    on(l, "[data-fx-sim-reini]", "click", () => { simIniciar(); pintarLado(true); });
    const sIn = l.querySelector("[data-fx-sim-in]");
    if(sIn){ sIn.focus(); sIn.addEventListener("keydown", ev => { if(ev.key === "Enter") simResponder(sIn.value); }); }
    on(l, "[data-fx-sim-env]", "click", () => { if(sIn) simResponder(sIn.value); });
    if(!n) return;
    const x = n.data, pinta = () => { mudou(); pintarNo(n.id); };
    on(l, "[data-fx-campo]", "input", el => { const k = el.dataset.fxCampo; let v = el.value;
      if(k === "palavras") x.palavras = v.split(",").map(s => s.trim()).filter(Boolean);
      else if(k === "campo"){ v = v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_]+/g, "_").slice(0, 30); if(v !== el.value) el.value = v; x.campo = v; }
      else x[k] = v;
      pinta(); });
    on(l, "[data-fx-campo]", "change", el => { if(el.tagName === "SELECT"){ x[el.dataset.fxCampo] = el.value; pinta(); } });
    on(l, "[data-fx-gat-tipo]", "change", el => { x.tipo = el.dataset.fxGatTipo; if(!x.palavras) x.palavras = []; pinta(); pintarLado(); });
    on(l, "[data-fx-estilo]", "click", el => {
      const est = el.dataset.fxEstilo; if((x.estilo || "botoes") === est) return;
      x.estilo = est; x.botoes = x.botoes || [];
      if(est === "rapidas") x.botoes.forEach(b => { if(b.tipo === "link"){ b.tipo = "proximo"; delete b.url; } });
      if(est === "botoes" && x.botoes.length > 3){ const sai = x.botoes.splice(3); D().edges = D().edges.filter(e2 => !(e2.de === n.id && sai.some(b => e2.porta === "btn:" + b.id))); cfgToast("Botões aceitam no máximo 3: os excedentes saíram."); }
      pinta(); pintarLado(); });
    on(l, "[data-fx-botao]", "input", el => { const b = x.botoes[+el.dataset.fxBotao], k = el.dataset.k; b[k] = el.value;
      if(k === "tipo"){ if(el.value === "link") D().edges = D().edges.filter(e2 => !(e2.de === n.id && e2.porta === "btn:" + b.id)); else delete b.url; pinta(); pintarLado(); return; }
      pinta(); });
    on(l, "[data-fx-botao-del]", "click", el => { const b = x.botoes.splice(+el.dataset.fxBotaoDel, 1)[0]; D().edges = D().edges.filter(e2 => !(e2.de === n.id && e2.porta === "btn:" + b.id)); pinta(); pintarLado(); });
    on(l, "[data-fx-botao-add]", "click", () => { x.botoes = x.botoes || []; x.botoes.push({ id: Math.random().toString(36).slice(2, 7), titulo: "", tipo: "proximo" });
      // botões que seguem o fluxo substituem o "próximo passo" da mensagem
      if(x.botoes.filter(b => b.tipo !== "link").length === 1) D().edges = D().edges.filter(e2 => !(e2.de === n.id && e2.porta === "proximo"));
      pinta(); pintarLado(); const ins = l.querySelectorAll('[data-k="titulo"]'); if(ins.length) ins[ins.length - 1].focus(); });
    on(l, "[data-fx-upload]", "change", el => { const f = el.files && el.files[0]; if(!f) return; const tipo = el.dataset.fxUpload;
      if(f.size > (tipo === "audio" ? 15 : 8) * 1024 * 1024){ cfgToast("Arquivo grande demais.", true); return; } subir(n, tipo, f); });
    on(l, "[data-fx-gravar]", "click", () => gravar(n));
    const nEsp = l.querySelector("[data-fx-espera-n]"), uEsp = l.querySelector("[data-fx-espera-u]");
    const esp = () => { x.segundos = Math.max(1, Math.min(23 * 3600, Math.round((+nEsp.value || 1) * (+uEsp.value || 1)))); pinta(); };
    if(nEsp){ nEsp.addEventListener("input", esp); uEsp.addEventListener("change", esp); }
    on(l, "[data-fx-agente]", "change", el => { x.agentId = +el.value || null; pinta(); });
  }
  document.addEventListener("keydown", ev => {
    const ed = F.ed; if(!ed || state.screen !== "instagram" || !document.getElementById("fx-canvas")) return;
    const t = ev.target; if(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if(ev.key === "Escape"){ if(ed.menu) fecharMenu(); else if(ed.sel || ed.selSeta != null){ ed.sel = null; ed.selSeta = null; pintarCanvas(); pintarLado(); } }
    if(ev.key === "Delete" || ev.key === "Backspace"){
      if(ed.selSeta != null){ D().edges.splice(ed.selSeta, 1); ed.selSeta = null; mudou(); desenharSetas(); ev.preventDefault(); }
      else if(ed.sel && (noDe(ed.sel) || {}).type !== "gatilho"){ apagarBloco(ed.sel); ev.preventDefault(); }
    }
  });
  window.addEventListener("resize", () => { if(F.ed && document.getElementById("fx-canvas")) desenharSetas(); });
  // salva antes de sair da página com alteração pendente
  window.addEventListener("beforeunload", () => { if(F.ed && F.ed.estado === "sujo"){ try { navigator.sendBeacon && fetch(API + "/" + F.ed.id, { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: F.ed.name, definition: F.ed.def }) }); } catch(err){} } });

  // ─── encaixe na aba Instagram (instagram.js) ───────────────────────────────
  window.igFluxos = {
    html: () => `<div id="igfx" style="flex:1;min-width:0;display:flex;min-height:0">${F.ed ? editorHTML() : listaHTML()}</div>`,
    montar: () => { const r = document.getElementById("igfx"); if(r) montar(r); },
    carregar: () => { if(!F.ed) carregar(); },
    ativos: () => (F.lista || []).filter(f => f.active).length,
  };
})();
