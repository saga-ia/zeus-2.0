// Instagram: tela /instagram, no layout novo: barra do topo com as abas (Direct, Agentes, Calendário, Desempenho,
// Configuração), seletor de conta e novo post.
//   Direct e Agentes: agentes de IA que respondem as DMs (motor myIG / zeuschatig) -> /api/instagram/p/<caminho>
//   Calendário, Desempenho, Novo post e Contas: publicador de posts (Automatik Inst) -> /zeuspost/api/<caminho>
//   Campanhas em massa, Geral e a conexão de contas seguem no painel de Posts (/posts), embutido dentro da Configuração.
// Carregado depois do script principal: usa state, icon, ICONS, e (escape), bindOnce, RENDERERS, zAlert, zConfirm,
// cfgToast, cfgSwitch e souAdmin de lá.
(function(){
  const ROXO = "#673DE6", VERDE = "#0F7A68", VERM = "#C0341C", AMBAR = "#9A6700", CINZA = "#66666F", AZUL = "#1D5FD1";
  // tons do layout novo, na família do roxo da Central: escuro para texto sobre o claro, claro para avatar e seleção
  const ROXO_E = "#5429C9", TINT = "#F0ECFD", SEL = "#F7F4FE", MUTE = "#9A9AA3", BOLHA = "#EFEAFD", BOLHA_B = "#DDD3FA";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:10px 12px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none;box-sizing:border-box";
  const TA = IN + ";resize:vertical;min-height:88px;line-height:1.5";
  const LBL = "display:block;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#66666F;margin:0 0 6px";
  const HELP = "margin:6px 0 0;font-size:12px;color:#66666F;line-height:1.5";
  const BTN_PRI = "display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:9px;background:" + ROXO + ";color:#FFFFFF;font:inherit;font-size:12.5px;font-weight:700;border:0;cursor:pointer;white-space:nowrap";
  const BTN_SEC = "display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF;color:#17171A;cursor:pointer;white-space:nowrap";
  const BTN_DANGER = BTN_SEC + ";color:" + VERM + ";border-color:rgba(192,52,28,0.35)";
  const BTN_TOP = "height:36px;padding:0 14px;border:none;border-radius:9px;background:" + ROXO + ";color:#FFFFFF;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:6px";
  const BTN_ROW = "height:32px;padding:0 12px;border:1px solid #E0E0E5;border-radius:8px;background:#FFFFFF;color:#17171A;font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;text-decoration:none";
  const CHIP = "display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11.5px;font-weight:600;white-space:nowrap";
  const CARD = "background:#FFFFFF;border:1px solid #E6E6EA;border-radius:14px";
  const SEG = on => `flex:1;text-align:center;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;background:${on ? "#FFFFFF" : "transparent"};color:${on ? "#17171A" : CINZA};box-shadow:${on ? "0 1px 2px rgba(0,0,0,.08)" : "none"}`;
  const CHEV = '<path d="M6 9l6 6 6-6"/>';
  const API = "/api/instagram/p";
  const MODELOS = [["claude-opus-4-7", "Opus 4.7", "mais inteligente"], ["claude-sonnet-4-6", "Sonnet 4.6", "equilibrado"], ["claude-haiku-4-5", "Haiku 4.5", "rápido e barato"]];
  const REGRAS = { default: ["Padrão", "Atende qualquer mensagem que não bater em outra regra"], keyword: ["Palavra-chave", "Entra quando a mensagem contém uma das palavras"], first_message: ["Primeira mensagem", "Ainda não é usada pelo motor"], comment_dm: ["DM vinda de comentário", "Ainda não é usada pelo motor"], sender_username: ["Usuário específico", "Ainda não é usada pelo motor"] };
  const ERROS = { unauthorized: "A sessão com o myIG expirou. Recarregue a página.", "admin only": "Só administradores.", "name required": "Dê um nome ao agente.", "not found": "Não encontrado.", "agent not found": "Esse agente não existe mais.", "rule_type required": "Escolha o tipo da regra.", "no tenant available": "Nenhuma conta do Instagram conectada no myIG.", "text required": "Escreva a mensagem.", "tenant not connected": "A conta do Instagram não está conectada no myIG.", "ig api error": "O Instagram recusou o envio. O token da conta no myIG pode estar vencido." };
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  // status de um post na agenda: [rótulo, cor do texto, fundo, grupo do filtro do calendário]
  const ST_POST = { scheduled: ["Agendado", "#4A22B8", BOLHA, "agendado"], publishing: ["Publicando", "#2F5FA8", "#E6EEF9", "agendado"], published: ["Publicado", "#1E7A4D", "#E8F5EE", "publicado"], failed: ["Falhou", "#B02E26", "#FDECEA", "falhou"], draft: ["Rascunho", CINZA, "#F1F1F3", "rascunho"], paused: ["Pausado", CINZA, "#F1F1F3", "rascunho"] };
  const stPost = s => ST_POST[s] || [s || "-", CINZA, "#F1F1F3", "rascunho"];
  const TIPO = { feed: "Feed", reel: "Reels", story: "Story", carousel: "Carrossel" };
  const CAPTION_MAX = 2200, HASHTAG_MAX = 30; // limites do Instagram
  const modeloRot = m => { const x = MODELOS.find(y => y[0] === m); return x ? x[1] : (m || "—"); };

  function G(){
    if(!state.ig){ const h = hojeBRT(); state.ig = { view: "direct", cfg: "contas", contasPainel: false, massaId: null, accMenu: false, agentes: null, tenant: null, erro: null, modal: null, busy: {},
      conv: { lista: null, cf: "todas", aberta: null, msgs: null, runs: null, enviando: false, erro: null, pausarAoEnviar: true }, live: null, sse: null,
      contas: null, conta: "", perfis: {}, perfisPedidos: {}, resumo: null,
      cal: { y: +h.slice(0, 4), m: +h.slice(5, 7) - 1, evs: null, erro: null, off: {} },
      perf: { dias: 30, evs: null, an: null, anEm: 0, erro: null, coletando: false },
      post: null }; }
    return state.ig;
  }
  async function api(p, opts){
    opts = opts || {};
    const init = { method: opts.method || "GET" };
    if(opts.body !== undefined){ init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(opts.body); }
    const r = await fetch(API + p, init);
    const j = await r.json().catch(() => ({}));
    if(!r.ok){ const codigo = j.error || ("HTTP " + r.status); const err = new Error(ERROS[codigo] || codigo + (j.body ? " (" + JSON.stringify(j.body).slice(0, 160) + ")" : "")); err.codigo = codigo; throw err; }
    return j;
  }
  // API do publicador de posts (Automatik Inst), pela ponte /zeuspost da Central
  async function zp(p, opts){
    opts = opts || {};
    const init = { method: opts.method || "GET", credentials: "same-origin" };
    if(opts.form) init.body = opts.form;
    else if(opts.body !== undefined){ init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(opts.body); }
    const r = await fetch("/zeuspost/api" + p, init);
    if(r.redirected && /\/login/.test(r.url)){ location.href = "/login"; throw new Error("Sessão expirada. Entre de novo na Central."); }
    const j = await r.json().catch(() => ({}));
    if(!r.ok || (j && j.error && !j.ok)) throw new Error((j && j.error) || "Erro " + r.status);
    return j;
  }
  const falha = (prefixo, err) => zAlert(prefixo + ": " + (err && err.message ? err.message : err));
  const BRT = { timeZone: "America/Sao_Paulo" };
  const dt = s => s ? new Date(/Z$|[+-]\d\d:\d\d$/.test(s) ? s : String(s).replace(" ", "T") + "Z") : null; // o SQLite grava UTC sem fuso
  const hora = s => { const d = dt(s); return d ? d.toLocaleTimeString("pt-BR", Object.assign({ hour: "2-digit", minute: "2-digit" }, BRT)) : ""; };
  const dataHora = s => { const d = dt(s); return d ? d.toLocaleString("pt-BR", Object.assign({ day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }, BRT)) : ""; };
  const relativo = s => { const d = dt(s); if(!d) return ""; const m = Math.round((Date.now() - d) / 60000); if(m < 1) return "agora"; if(m < 60) return m + " min"; if(m < 1440) return Math.round(m / 60) + " h"; return d.toLocaleDateString("pt-BR", Object.assign({ day: "2-digit", month: "2-digit" }, BRT)); };
  // datas dos posts vêm em segundos (epoch) e aparecem sempre no horário de Brasília (UTC-3, sem horário de verão),
  // qualquer que seja o fuso do navegador. O publicador também lê "AAAA-MM-DDTHH:MM" como horário de Brasília.
  const pad = n => String(n).padStart(2, "0");
  const dSeg = ts => new Date(ts * 1000);
  const diaBRT = ts => dSeg(ts).toLocaleDateString("en-CA", BRT); // AAAA-MM-DD
  const hojeBRT = () => diaBRT(Date.now() / 1000);
  const ymd = (y, m, d) => y + "-" + pad(m + 1) + "-" + pad(d);
  const segBRT = (y, m, d) => Date.UTC(y, m, d, 3, 0, 0) / 1000; // meia-noite de Brasília, em epoch
  const hSeg = ts => ts ? dSeg(ts).toLocaleTimeString("pt-BR", Object.assign({ hour: "2-digit", minute: "2-digit" }, BRT)) : "-";
  const dSegCurta = ts => ts ? dSeg(ts).toLocaleDateString("pt-BR", Object.assign({ day: "2-digit", month: "2-digit" }, BRT)) : "-";
  const curta = k => k.slice(8, 10) + "/" + k.slice(5, 7); // AAAA-MM-DD -> DD/MM
  const naiveBRT = v => new Date(String(v).slice(0, 16) + ":00-03:00"); // valor do <input datetime-local>, lido como Brasília
  const num = v => (Number(v) || 0).toLocaleString("pt-BR");
  const compact = v => { v = Number(v) || 0; return v >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + " mi" : v >= 1e4 ? (v / 1e3).toFixed(1).replace(".", ",") + " mil" : v.toLocaleString("pt-BR"); };
  const safeUrl = u => { const s = String(u || ""); return /^(https?:\/\/|\/)/i.test(s) ? e(s) : ""; };
  const ini = n => String(n || "").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).map(p => Array.from(p)[0]).join("").toUpperCase() || "@";
  // nome, @ e foto de quem mandou a DM: vem do myIG (contacts) ou do perfil buscado pela Central
  const perfil = t => (t && G().perfis[String(t.ig_sender_id)]) || null;
  const nomeDe = t => { const p = perfil(t); return (p && p.name) || t.ig_name || null; };
  const userDe = t => { const p = perfil(t); return (p && p.username) || t.ig_username || null; };
  const quem = t => nomeDe(t) || (userDe(t) ? "@" + userDe(t) : "Contato " + String(t.ig_sender_id || "").slice(-6));
  const arroba = t => userDe(t) ? "@" + userDe(t) : "";
  const avatar = (t, tam) => { const p = perfil(t), temNome = nomeDe(t) || userDe(t); const base = `width:${tam}px;height:${tam}px;flex:0 0 ${tam}px;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#F1F1F3;color:${temNome ? "#3C3C44" : MUTE};font-size:${Math.round(tam / 3)}px;font-weight:700`; const fb = temNome ? e(ini(temNome)) : icon('<circle cx="12" cy="9" r="3.5"/><path d="M5 20c1-3.5 4-5 7-5s6 1.5 7 5"/>', Math.round(tam * 0.45), "currentColor"); return `<span style="${base};position:relative">${fb}${p && p.pic ? `<img src="${e(p.pic)}" alt="" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()">` : ""}</span>`; };
  // Busca na Central os perfis que ainda não temos (até 40 por vez) e grava no myIG para a próxima vez
  async function perfisBuscar(lista){
    const g = G(); const ids = [...new Set((lista || []).map(t => String(t.ig_sender_id || "")).filter(id => id && !g.perfis[id] && !g.perfisPedidos[id]))].slice(0, 40);
    if(!ids.length) return; ids.forEach(id => { g.perfisPedidos[id] = true; });
    try { const r = await fetch("/api/instagram/perfis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }); const j = await r.json(); Object.assign(g.perfis, j.perfis || {}); if(Object.keys(j.perfis || {}).length && g.view === "direct") repaint(g.conv.aberta ? "lista" : null); }
    catch(err){}
  }
  const statusRun = { done: ["Concluída", VERDE], error: ["Erro", VERM], timeout: ["Tempo esgotado", VERM], running: ["Rodando", AMBAR], pending: ["Na fila", CINZA] };

  // ─── contas ──────────────────────────────────────────────────────────────────
  const contaAtual = () => { const g = G(); return (g.contas || []).find(c => String(c.id) === String(g.conta)) || null; };
  const contaPorId = id => (G().contas || []).find(c => String(c.id) === String(id)) || null;
  const contasNome = ids => (ids || []).map(id => { const c = contaPorId(id); return c ? "@" + c.user : "#" + id; }).join(", ") || "-";
  const contaAvatar = (c, tam, borda) => `<span style="width:${tam}px;height:${tam}px;flex:0 0 ${tam}px;border-radius:50%;${borda ? "border:2px solid #FFFFFF;" : ""}background:${TINT};color:${ROXO_E};font-size:${Math.max(8.5, Math.round(tam / 3))}px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;box-sizing:border-box;position:relative">${e(ini(c.nome || c.user))}${c.foto && safeUrl(c.foto) ? `<img src="${safeUrl(c.foto)}" alt="" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()">` : ""}</span>`;
  const qConta = () => G().conta ? "&account_id=" + encodeURIComponent(G().conta) : "";
  const postsHash = (tab, extra) => "#/" + tab + (() => { const q = []; if(G().conta) q.push("conta=" + encodeURIComponent(G().conta)); if(extra) q.push(extra); return q.length ? "?" + q.join("&") : ""; })();
  const tenantUser = () => (G().tenant || {}).ig_username || "";

  // ─── carga ───────────────────────────────────────────────────────────────────
  async function loadContas(){
    const g = G();
    try { const j = await zp("/accounts"); const lista = Array.isArray(j) ? j : (j.accounts || []); g.contas = lista.filter(a => !a.platform || a.platform === "instagram").map(a => ({ id: a.id, user: a.platform_username, nome: a.platform_name, foto: a.profile_picture, seguidores: a.followers, status: a.status || "active", ativa: a.status ? a.status === "active" : true })).sort((a, b) => (Number(b.seguidores) || 0) - (Number(a.seguidores) || 0)); }
    catch(err){ g.contas = g.contas || []; }
    repaint(g.view === "config" || g.view === "compose" || g.view === "calendario" ? null : "topo");
  }
  async function loadResumo(){ const g = G(); try { g.resumo = await zp("/summary?from=" + (Math.floor(Date.now() / 1000) - 30 * 86400) + "&to=" + (Math.floor(Date.now() / 1000) + 365 * 86400)); } catch(err){} repaint(g.view === "config" ? null : "topo"); }
  async function loadAgentes(){ const g = G(); try { const j = await api("/agents"); g.agentes = j.agents || []; g.tenant = j.tenant || g.tenant; g.erro = null; } catch(err){ g.erro = err.message; } repaint(g.view === "agentes" ? null : g.view === "direct" && !g.conv.aberta ? null : "topo"); }
  async function loadThreads(){
    const g = G(), c = g.conv;
    try { c.lista = (await api("/threads")).threads || []; c.erro = null; if(c.aberta){ const a = c.lista.find(x => x.id === c.aberta.id); if(a) c.aberta = Object.assign({}, c.aberta, a, { unread_count: 0 }); } } catch(err){ c.erro = err.message; }
    repaint(g.view !== "direct" ? "topo" : c.aberta ? "lista" : null);
    perfisBuscar(c.lista);
  }
  async function loadThread(id, so){
    const c = G().conv;
    try { const j = await api("/threads/" + id); if(!c.aberta || c.aberta.id !== id) return; c.aberta = Object.assign({}, c.aberta, j.thread, { unread_count: 0 }); c.msgs = j.messages || []; c.runs = j.runs || []; c.erro = null; const ult = (c.msgs[c.msgs.length - 1] || {}); if(G().live && G().live.thread_id === id && ult.direction === "out") G().live = null; }
    catch(err){ c.erro = err.message; }
    if(G().view === "direct") repaint(so ? "msgs" : null);
  }
  async function loadCal(){
    const g = G(), c = g.cal, chave = c.y + "-" + c.m + "-" + g.conta;
    try { const j = await zp("/schedule?from=" + segBRT(c.y, c.m, 1) + "&to=" + (segBRT(c.y, c.m + 1, 1) - 1) + "&limit=5000" + qConta()); if(chave !== c.y + "-" + c.m + "-" + g.conta) return; c.evs = j.eventos || []; c.erro = null; }
    catch(err){ c.erro = err.message; }
    if(g.view === "calendario") repaint();
  }
  async function loadPerf(){
    const g = G(), p = g.perf, agora = Math.floor(Date.now() / 1000), de = agora - p.dias * 86400;
    try {
      const [ag, an] = await Promise.all([zp("/schedule?from=" + de + "&to=" + (agora + 30 * 86400) + "&limit=5000" + qConta()), p.an && Date.now() - p.anEm < 300000 ? p.an : zp("/analytics")]);
      p.evs = ag.eventos || []; p.de = de; if(an !== p.an){ p.an = an; p.anEm = Date.now(); } p.erro = null;
    } catch(err){ p.erro = err.message; }
    if(g.view === "desempenho") repaint();
  }
  // SSE do myIG: runs e mensagens novas. O fim da run não é avisado, então o "IA pensando" também cai quando a resposta chega ou o timeout passa
  function sseOn(){
    const g = G(); if(g.sse) return;
    try {
      const es = new EventSource(API + "/stream"); g.sse = es;
      es.addEventListener("run", ev => { try { const r = JSON.parse(ev.data); if(r.status === "running") g.live = { thread_id: r.thread_id, agent_id: r.agent_id, em: Date.now(), timeout: ((g.agentes || []).find(a => a.id === r.agent_id) || {}).timeout_seconds || 120 }; else if(g.live && g.live.thread_id === r.thread_id) g.live = null; if(g.view !== "direct") return; if(g.conv.aberta && g.conv.aberta.id === r.thread_id) loadThread(r.thread_id, true); else repaint(g.conv.aberta ? "lista" : null); } catch(err){} });
      es.addEventListener("message", ev => { try { const m = JSON.parse(ev.data); if(g.conv.aberta && g.conv.aberta.contact_id === m.contact_id){ if(!(g.conv.msgs || []).some(x => x.id === m.id)){ g.conv.msgs = (g.conv.msgs || []).concat([m]); if(m.direction === "out" && g.live && g.live.thread_id === g.conv.aberta.id) g.live = null; if(g.view === "direct") repaint("msgs"); } } loadThreads(); } catch(err){} });
      es.onerror = () => { try { es.close(); } catch(err){} g.sse = null; setTimeout(() => { if(state.screen === "instagram") sseOn(); }, 3000); };
    } catch(err){ g.sse = null; }
  }
  function sseOff(){ const g = G(); if(g.sse){ try { g.sse.close(); } catch(err){} g.sse = null; } }
  let _tick = null, _n = 0;
  function pollingOn(){
    if(_tick) return;
    _tick = setInterval(() => {
      const g = G(); _n++;
      if(state.screen !== "instagram"){ sseOff(); if(g.modal){ g.modal = null; modalHost(); } return; }
      if(document.visibilityState === "hidden" || g.modal) return;
      if(g.live && Date.now() - g.live.em > (g.live.timeout + 10) * 1000){ g.live = null; if(g.view === "direct") repaint(g.conv.aberta ? "lista" : null); }
      if(g.view === "direct" && _n % 2 === 0){ loadThreads(); if(g.conv.aberta) loadThread(g.conv.aberta.id, true); }
      if(g.view === "agentes" && _n % 6 === 0) loadAgentes();
      if(g.view === "calendario" && _n % 9 === 0) loadCal();
      if(g.view === "desempenho" && _n % 24 === 0) loadPerf();
      if(g.view !== "direct" && _n % 12 === 0) loadThreads(); // mantém o contador de não lidas do topo
    }, 5000);
  }

  // ─── layout: barra do topo (abas, seletor de conta, novo post) + área da aba ──
  function page(){
    const g = G();
    return `<div style="height:100vh;display:flex;flex-direction:column;min-width:0">
      <div id="ig-top">${topo()}</div>
      <div id="ig-main" style="flex:1;min-height:0;display:flex;background:${g.view === "direct" ? "#FFFFFF" : "#F6F6F7"}">${main()}</div>
    </div>`;
  }
  function topo(){
    const g = G(), ag = g.agentes || [], ativos = ag.filter(a => a.active).length, naoLidas = (g.conv.lista || []).reduce((a, x) => a + (x.unread_count || 0), 0), cs = g.contas || [], c = contaAtual();
    const aba = (id, rot, n, alerta) => { const on = g.view === id; return `<span data-ig-view="${id}" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-size:13px;white-space:nowrap;cursor:pointer;font-weight:${on ? 600 : 400};color:${on ? "#17171A" : CINZA};background:${on ? "#FFFFFF" : "transparent"};box-shadow:${on ? "0 1px 2px rgba(0,0,0,.08)" : "none"}">${rot}${n ? `<span style="font-size:10.5px;font-weight:600;padding:0 6px;border-radius:8px;background:${alerta ? "#FDECEA" : on ? TINT : "#E9E9EC"};color:${alerta ? "#B02E26" : on ? ROXO_E : CINZA}">${n}</span>` : ""}</span>`; };
    const opc = (id, rot, sub, av) => { const on = String(g.conta) === String(id); return `<div data-ig-conta-pick="${id}" data-hover style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;background:${on ? SEL : "transparent"}">${av}
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${rot}</div><div style="font-size:11.5px;color:${CINZA}">${sub}</div></div>
        <span style="font-size:13px;color:${ROXO};font-weight:700">${on ? "✓" : ""}</span></div>`; };
    const pilha = c ? [c] : cs.slice(0, 3);
    return `<div style="display:flex;align-items:center;gap:16px;padding:14px 24px;background:#FFFFFF;border-bottom:1px solid #E6E6EA;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:10px"><span style="width:32px;height:32px;border-radius:9px;background:#FBEAF1;color:#B4316B;display:flex;align-items:center;justify-content:center">${icon(ICONS.instagram, 18, "currentColor")}</span><span style="${HEAD};font-size:17px;font-weight:600">Instagram</span></div>
      <div style="display:flex;gap:2px;padding:3px;background:#F1F1F3;border-radius:10px;overflow-x:auto;scrollbar-width:none;max-width:100%">${aba("direct", "Direct", naoLidas)}${aba("agentes", "Agentes", g.agentes ? ativos + "/" + ag.length : "", g.agentes && !ativos)}${aba("fluxos", "Fluxos", window.igFluxos && igFluxos.ativos() ? igFluxos.ativos() + " ativo" + (igFluxos.ativos() > 1 ? "s" : "") : "")}${aba("calendario", "Calendário", g.resumo ? g.resumo.agendadas : "")}${aba("desempenho", "Desempenho", "")}${aba("config", "Configuração", "")}</div>
      <span style="flex:1"></span>
      <div data-ig-accbox style="position:relative">
        <div data-ig-accmenu title="Filtrar por conta do Instagram" style="display:flex;align-items:center;gap:10px;height:36px;padding:0 10px 0 6px;border:1px solid ${g.accMenu ? "#CFCFD6" : "#E0E0E5"};border-radius:10px;background:#FFFFFF;cursor:pointer">
          <span style="display:flex">${pilha.map((x, k) => `<span style="display:flex;margin-left:${k ? "-6px" : "0"}">${contaAvatar(x, 24, true)}</span>`).join("")}</span>
          <span style="font-size:13px;font-weight:500;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis">${c ? "@" + e(c.user) : g.contas ? "Todas as contas" : "Carregando..."}</span>
          ${icon(CHEV, 12, MUTE)}
        </div>
        ${g.accMenu ? `<div id="ig-acc-pop" class="pop-down" style="position:absolute;top:42px;right:0;z-index:50;width:290px;max-height:60vh;overflow-y:auto;background:#FFFFFF;border:1px solid #E6E6EA;border-radius:12px;box-shadow:0 12px 32px rgba(20,20,30,.12);padding:6px">
          ${opc("", "Todas as contas", `${cs.length} conta${cs.length === 1 ? "" : "s"} conectada${cs.length === 1 ? "" : "s"}`, `<span style="width:30px;height:30px;flex:0 0 30px;border-radius:50%;background:#F1F1F3;color:${ROXO_E};font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">∗</span>`)}
          ${cs.map(x => opc(x.id, "@" + e(x.user), compact(x.seguidores) + " seguidores" + (x.ativa ? "" : " · reconectar"), contaAvatar(x, 30))).join("")}
          <div style="height:1px;background:#EEEEF1;margin:6px 4px"></div>
          <div data-ig-conectar data-hover style="padding:8px 10px;border-radius:8px;font-size:13px;color:${ROXO_E};font-weight:600;cursor:pointer">+ Conectar conta</div>
        </div>` : ""}
      </div>
      <button data-ig-novo-post style="${BTN_TOP}">+ Novo post</button>
    </div>`;
  }
  function main(){
    const v = G().view;
    if(v === "agentes") return agentes();
    if(v === "fluxos") return window.igFluxos ? igFluxos.html() : carregando("Carregando fluxos...");
    if(v === "calendario") return calendario();
    if(v === "desempenho") return desempenho();
    if(v === "compose") return compose();
    if(v === "config") return config();
    return direct();
  }
  const vazio = (t, sub) => `<div style="padding:48px 24px;text-align:center;background:#FFFFFF;border:1px dashed #DCDCE2;border-radius:14px;font-size:13.5px;color:${CINZA}"><div style="font-weight:600;color:#17171A;margin-bottom:4px">${t}</div>${sub || ""}</div>`;
  const carregando = t => `<div style="color:${CINZA};font-size:13px">${t || "Carregando..."}</div>`;
  const selo = s => { const x = stPost(s); return `<span style="${CHIP};background:${x[2]};color:${x[1]}">${x[0]}</span>`; };

  // ─── Direct: DMs com os agentes de IA ────────────────────────────────────────
  function convVis(){ const c = G().conv; return (c.lista || []).filter(t => c.cf !== "naoLidas" || t.unread_count > 0); }
  // as DMs automáticas só existem na conta ligada ao myIG; com outra conta escolhida no topo, a lista fica vazia
  const directFora = () => { const c = contaAtual(), u = tenantUser(); return !!(c && u && c.user !== u); };
  function listaHTML(){
    const g = G(), c = g.conv, a = c.aberta, lista = c.lista, u = tenantUser();
    if(directFora()) return `<div style="padding:40px 20px;text-align:center;font-size:13px;color:${MUTE};line-height:1.5">As DMs automáticas só estão ligadas em @${e(u)}. Escolha essa conta ou <span data-ig-conta-pick="" style="color:${ROXO_E};font-weight:600;cursor:pointer">todas as contas</span>.</div>`;
    if(!lista) return `<div style="padding:16px 14px;font-size:12.5px;color:${CINZA}">${c.erro ? e(c.erro) : "Carregando..."}</div>`;
    const vis = convVis();
    if(!vis.length) return `<div style="padding:40px 20px;text-align:center;font-size:13px;color:${MUTE}">${c.cf === "naoLidas" ? "Nenhuma conversa sem ler." : "Nenhuma conversa ainda."}</div>`;
    return vis.map(t => { const on = a && a.id === t.id, pensando = g.live && g.live.thread_id === t.id; return `<div data-ig-abrir="${t.id}" ${on ? "" : "data-hover"} style="display:flex;gap:11px;padding:12px 14px;cursor:pointer;border-bottom:1px solid #F4F4F6;background:${on ? SEL : "transparent"}">
        ${avatar(t, 36)}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:8px"><span style="flex:1;min-width:0;font-size:13.5px;font-weight:${t.unread_count ? 700 : 500};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(quem(t))}</span><span style="font-size:11.5px;color:${t.unread_count ? ROXO_E : MUTE};white-space:nowrap">${relativo(t.last_message_at)}</span></div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:2px"><span style="flex:1;min-width:0;font-size:12.5px;color:${t.unread_count ? "#17171A" : CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pensando ? `<span class="tm-pulse" style="color:${ROXO_E}">IA pensando...</span>` : (t.last_direction === "out" ? `<span style="color:${MUTE}">${t.last_sent_by === "instagram" || /^operator/.test(t.last_sent_by || "") ? "Você" : t.last_sent_by === "flow" ? "Fluxo" : "IA"}: </span>` : "") + e(t.last_text || "—")}</span>${t.unread_count ? `<span style="min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:${ROXO};color:#FFFFFF;font-size:10.5px;font-weight:700;display:flex;align-items:center;justify-content:center">${t.unread_count}</span>` : ""}</div>
          <div style="font-size:11.5px;color:${MUTE};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u ? "@" + e(u) : ""}${t.agent_name ? `${u ? " · " : ""}${e(t.agent_name)}` : ""}${t.paused ? ` · <span style="color:#B02E26">IA pausada</span>` : ""}</div>
        </div></div>`; }).join("");
  }
  function direct(){
    const g = G(), c = g.conv, a = c.aberta, ag = g.agentes || [], semAgente = g.agentes && !ag.some(x => x.active);
    const pill = (id, rot) => `<span data-ig-cf="${id}" style="white-space:nowrap;flex:0 0 auto;padding:5px 11px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;background:${c.cf === id ? TINT : "#F6F6F7"};color:${c.cf === id ? ROXO_E : CINZA}">${rot}</span>`;
    return `<div style="width:clamp(240px,30%,320px);flex:0 0 clamp(240px,30%,320px);border-right:1px solid #E6E6EA;background:#FFFFFF;display:flex;flex-direction:column;min-height:0">
        ${semAgente ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#FDF5F4;border-bottom:1px solid #F4DEDB"><span style="width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#C2342B"></span><span style="flex:1;font-size:12.5px;color:#7A2A24;line-height:1.35">${ag.length ? (ag.length === 1 ? e(ag[0].name) + " pausado" : "Nenhum agente ativo") + ". Ninguém responde as DMs." : "Nenhum agente criado. Ninguém responde as DMs."}</span><span ${ag.length === 1 ? `data-ig-toggle="${ag[0].id}"` : `data-ig-view="agentes"`} style="font-size:12.5px;font-weight:600;color:${ROXO_E};cursor:pointer;white-space:nowrap">${ag.length === 1 ? "Ativar" : ag.length ? "Ver agentes" : "Criar agente"}</span></div>` : ""}
        <div style="display:flex;gap:6px;padding:12px 14px;border-bottom:1px solid #F0F0F2;overflow-x:auto;scrollbar-width:none">${pill("todas", "Todas")}${pill("naoLidas", "Não lidas")}</div>
        <div id="ig-lista" data-scroll="lista" style="flex:1;min-height:0;overflow-y:auto">${listaHTML()}</div>
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;background:#FFFFFF">${a ? chat(a) : `<div style="margin:auto;text-align:center;color:${CINZA};font-size:13px;padding:30px">${icon(ICONS.instagram, 28, "#C6C6CC")}<div style="margin-top:10px">Escolha uma conversa à esquerda.</div></div>`}</div>`;
  }
  function chat(a){
    const c = G().conv, u = tenantUser(), p = perfil(a), run = c.runs && c.runs[0];
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 20px;background:#FFFFFF;border-bottom:1px solid #E6E6EA;flex-wrap:wrap">
        ${avatar(a, 34)}
        <div style="flex:1 1 120px;min-width:0">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(quem(a))}${nomeDe(a) && arroba(a) ? ` <span style="font-weight:400;color:${CINZA}">${e(arroba(a))}</span>` : ""}</div>
          <div style="font-size:12px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u ? "DM para @" + e(u) : "Direct"}${a.agent_name ? " · agente " + e(a.agent_name) : ""}${p && p.seguidores != null ? " · " + num(p.seguidores) + " seguidores" : ""}</div>
        </div>
        <a href="${userDe(a) ? "https://www.instagram.com/" + encodeURIComponent(userDe(a)) + "/" : "https://www.instagram.com/direct/inbox/"}" target="_blank" rel="noopener" title="${userDe(a) ? "Abre o perfil no Instagram" : "Abre a caixa de DMs do Instagram"}" data-hover style="flex:0 0 32px;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:${CINZA}">${icon(ICONS.extLink, 15, "currentColor")}</a>
        <button data-ig-pausa="${a.paused ? "resume" : "pause"}" title="${a.paused ? "A IA não responde nesta conversa. Clique para ela voltar a responder." : "A IA responde nesta conversa. Clique para assumir você."}" style="display:flex;align-items:center;gap:7px;flex:0 0 auto;height:32px;padding:0 12px;border:none;border-radius:20px;background:${a.paused ? "#FDECEA" : "#E8F5EE"};color:${a.paused ? "#B02E26" : "#1E7A4D"};font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>${a.paused ? "IA pausada · retomar" : "IA respondendo · pausar"}</button>
      </div>
      <div id="ig-msgs" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:24px;display:flex;flex-direction:column;gap:10px">${msgsHTML()}</div>
      <form data-ig-reply style="margin:0;padding:12px 84px 14px 20px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:flex-end;gap:10px;padding:8px 8px 8px 14px;background:#FFFFFF;border:1px solid #E0E0E5;border-radius:12px">
          <textarea data-ig-reply-texto data-keep="reply" rows="1" placeholder="${u ? "Responder como @" + e(u) : "Responder como operador"} (Enter envia, Shift+Enter quebra linha)" style="flex:1;min-width:0;border:0;outline:none;resize:none;font:inherit;font-size:13.5px;line-height:1.45;color:#17171A;background:transparent;padding:7px 0;max-height:140px"></textarea>
          <button type="submit" ${c.enviando ? "disabled" : ""} title="Enviar" style="width:34px;height:34px;flex:0 0 34px;border:0;border-radius:9px;background:${c.enviando ? "#B4B4BC" : ROXO};color:#FFFFFF;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0">${icon('<path d="M4 12l16-8-6 16-2-7z"/>', 15, "currentColor")}</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap;font-size:11.5px;color:${MUTE}">
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;color:${CINZA}"><input data-ig-pausar-ao-enviar type="checkbox" ${c.pausarAoEnviar ? "checked" : ""} style="width:13px;height:13px;accent-color:${ROXO}">Pausar a IA nesta conversa ao enviar</label>
          ${run ? `<span>Última resposta da IA: <span style="color:${(statusRun[run.status] || [0, CINZA])[1]};font-weight:600">${(statusRun[run.status] || [run.status])[0]}</span> · ${modeloRot(run.model)}${run.duration_ms != null ? " · " + (run.duration_ms / 1000).toFixed(1).replace(".", ",") + " s" : ""} · ${dataHora(run.started_at)}</span>` : ""}
        </div>
      </form>`;
  }
  // Mídia da mensagem (link assinado da Meta: pode expirar depois de um tempo)
  function midiaHTML(m){
    const u = m.media_url; if(!u || !/^https:\/\//.test(u)) return "";
    const t = m.text || "";
    if(/^🎤/.test(t)) return `<audio controls preload="none" src="${e(u)}" style="display:block;margin-top:8px;max-width:260px;height:36px"></audio>`;
    if(/^📷/.test(t)) return `<a href="${e(u)}" target="_blank" rel="noopener" style="display:block;margin-top:8px"><img src="${e(u)}" alt="" loading="lazy" onerror="this.parentNode.textContent='(imagem expirou na Meta)'" style="max-width:240px;max-height:240px;border-radius:9px;display:block"></a>`;
    if(/^🎬/.test(t)) return `<video controls preload="none" src="${e(u)}" style="display:block;margin-top:8px;max-width:260px;border-radius:9px"></video>`;
    return ` <a href="${e(u)}" target="_blank" rel="noopener" style="color:#1D5FD1;font-size:12.5px">abrir</a>`;
  }
  function msgsHTML(){
    const g = G(), c = g.conv, ms = c.msgs;
    if(!ms) return `<div style="margin:auto;color:${CINZA};font-size:12.5px">${c.erro ? e(c.erro) : "Carregando mensagens..."}</div>`;
    let dia = "", html = ms.map(m => { const d = dt(m.created_at), rot = d ? d.toLocaleDateString("pt-BR", Object.assign({ day: "2-digit", month: "long" }, BRT)) : ""; const sep = rot !== dia ? `<div style="align-self:center;font-size:11.5px;color:${MUTE};padding:3px 10px;background:#FFFFFF;border:1px solid #EEEEF1;border-radius:20px;margin:4px 0">${rot}</div>` : ""; dia = rot;
      // quem enviou: humano (operador na Central ou a própria conta pelo app do Instagram) fica em azul; IA e fluxo em roxo
      const fora = m.direction === "out", sb = m.sent_by || "", humano = /^operator/.test(sb) || sb === "instagram";
      const quem = !fora ? "" : sb === "instagram" ? "você pelo Instagram · " : /^operator/.test(sb) ? "operador · " : sb === "flow" ? "fluxo · " : "IA · ";
      return sep + `<div style="display:flex;flex-direction:column;align-items:${fora ? "flex-end" : "flex-start"};gap:3px"><div style="max-width:min(460px,80%);padding:10px 13px;border-radius:12px;font-size:13.5px;line-height:1.45;background:${fora ? (humano ? "#E6EEF9" : BOLHA) : "#F6F6F7"};color:#17171A;border:1px solid ${fora ? (humano ? "#CFDDF3" : BOLHA_B) : "#EEEEF1"};white-space:pre-wrap;word-wrap:break-word">${e(m.text || "")}${midiaHTML(m)}</div><span style="font-size:11px;color:${MUTE}">${quem}${hora(m.created_at)}</span></div>`; }).join("");
    if(!ms.length) html = `<div style="margin:auto;color:${CINZA};font-size:12.5px">Nenhuma mensagem ainda.</div>`;
    if(g.live && c.aberta && g.live.thread_id === c.aberta.id) html += `<div style="display:flex;flex-direction:column;align-items:flex-end"><div style="padding:10px 13px;border-radius:12px;background:${BOLHA};border:1px solid ${BOLHA_B};font-size:12.5px;color:${ROXO_E}"><span class="tm-pulse">IA pensando...</span></div></div>`;
    return html;
  }
  async function abrirConversa(id){
    const c = G().conv; const t = (c.lista || []).find(x => x.id === id); if(!t) return;
    c.aberta = Object.assign({}, t, { unread_count: 0 }); c.msgs = null; c.runs = null; repaint();
    await loadThread(id, false);
  }
  async function responder(texto){
    const g = G(), c = g.conv, a = c.aberta; texto = String(texto || "").trim(); if(!a || !texto || c.enviando) return;
    c.enviando = true; repaint();
    try { await api(`/threads/${a.id}/send`, { method: "POST", body: { text: texto } }); if(c.pausarAoEnviar && !a.paused) await api(`/threads/${a.id}/pause`, { method: "POST" }); }
    catch(err){ falha("Não consegui enviar", err); const ta = document.querySelector("[data-ig-reply-texto]"); if(ta) ta.value = texto; }
    c.enviando = false; await loadThread(a.id, false); loadThreads();
  }
  async function alternarAgente(id){
    const g = G(), a = (g.agentes || []).find(x => x.id === id); if(!a || g.busy[id]) return;
    g.busy[id] = true; repaint();
    try { await api("/agents/" + id, { method: "PUT", body: { active: !a.active } }); a.active = a.active ? 0 : 1; cfgToast(a.active ? `"${a.name}" ativado.` : `"${a.name}" pausado.`); } catch(err){ falha("Não consegui alterar", err); }
    g.busy[id] = false; repaint(); loadAgentes();
  }

  // ─── Agentes ─────────────────────────────────────────────────────────────────
  function agentes(){
    const g = G(), ag = g.agentes;
    let corpo;
    if(!ag) corpo = g.erro ? vazio("Não consegui falar com o myIG", e(g.erro)) : carregando();
    else if(!ag.length) corpo = vazio("Nenhum agente criado ainda", "Crie o primeiro para começar a responder as DMs automaticamente.");
    else corpo = ag.map(cardAgente).join("");
    return `<div data-scroll="ag" style="flex:1;min-width:0;overflow-y:auto;padding:24px 28px 60px">
      <div style="max-width:860px;display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px;font-size:13px;color:${CINZA};line-height:1.5">Cada agente tem instruções próprias. As regras dizem quando ele entra numa conversa; depois que entra, segue nela até o fim.</div>
          <button data-ig-novo style="${BTN_ROW}">+ Novo agente</button>
        </div>
        ${corpo}
      </div>
    </div>`;
  }
  function cardAgente(a){
    const busy = G().busy[a.id], cor = a.color || "#17171A", prompt = String(a.system_prompt || "").replace(/\s+/g, " ").trim(), u = tenantUser();
    const link = (attr, rot, extra) => `<span ${attr} data-hover style="padding:6px 10px;border-radius:8px;font-size:13px;cursor:pointer;${extra || ""}">${rot}</span>`;
    return `<div style="${CARD};overflow:hidden">
      <div style="display:flex;align-items:center;gap:14px;padding:18px 20px;flex-wrap:wrap">
        <span style="width:44px;height:44px;flex:0 0 44px;border-radius:12px;background:${e(cor)};color:#FFFFFF;${HEAD};font-weight:600;font-size:17px;display:flex;align-items:center;justify-content:center">${e((a.name || "?").trim()[0].toUpperCase())}</span>
        <div style="flex:1;min-width:180px"><div style="${HEAD};font-weight:600;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(a.name)}</div><div style="font-size:12.5px;color:${CINZA}">${modeloRot(a.model)} · responde em até ${a.timeout_seconds || 120} s${u ? " · @" + e(u) : ""}</div></div>
        <span style="font-size:12px;font-weight:600;color:${a.active ? "#1E7A4D" : CINZA}">${a.active ? "Ativo" : "Pausado"}</span>
        <span title="${a.active ? "Ativo: responde DMs" : "Pausado: não responde"}" style="display:flex">${cfgSwitch(!!a.active, `data-ig-toggle="${a.id}"${busy ? " disabled" : ""}`)}</span>
      </div>
      <div style="margin:0 20px;padding:14px 16px;background:#F6F6F7;border-radius:10px;font-size:13px;line-height:1.55;color:#3C3C44">${prompt ? e(prompt.slice(0, 220)) + (prompt.length > 220 ? "…" : "") : `<span style="color:${MUTE}">Sem instruções definidas. Sem elas, o agente responde sem personalidade.</span>`}</div>
      <div style="display:flex;align-items:center;gap:4px;padding:12px;margin-top:12px;border-top:1px solid #EEEEF1">
        ${link(`data-ig-editar="${a.id}"`, "Editar instruções")}${link(`data-ig-editar="${a.id}" data-regras="1"`, "Regras de entrada")}
        ${link(`data-ig-apagar="${a.id}"`, "Apagar", "margin-left:auto;color:#B02E26")}
      </div>
    </div>`;
  }

  // ─── modais: agente (criar / editar + regras), post da agenda e dia do calendário ─
  function abrirModal(m){ G().modal = m; modalHost(); }
  function fecharModal(){ G().modal = null; modalHost(); }
  function modalHost(){
    let host = document.getElementById("ig-modal-host");
    const m = G().modal;
    if(!m || state.screen !== "instagram"){ if(host) host.remove(); document.body.style.overflow = ""; return; }
    if(!host){ host = document.createElement("div"); host.id = "ig-modal-host"; document.body.appendChild(host); }
    document.body.style.overflow = "hidden";
    host.innerHTML = modal(m); bind(host);
    const foco = host.querySelector("[autofocus]"); if(foco) foco.focus();
    if(m.rolarRegras){ m.rolarRegras = false; const r = host.querySelector("[data-ig-regras]"); if(r) r.scrollIntoView({ block: "center" }); }
  }
  function shell(titulo, sub, corpo, rodape, largura){
    return `<div data-ig-backdrop style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(23,23,26,0.32)">
      <div class="pop-down" style="width:100%;max-width:${largura || 560}px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;border-radius:18px;background:#FFFFFF;box-shadow:0 30px 80px rgba(23,23,26,0.25);overflow:hidden">
        <div style="display:flex;align-items:flex-start;gap:12px;padding:20px 22px 14px;border-bottom:1px solid #E6E6EA"><div style="flex:1;min-width:0"><div style="${HEAD};font-size:18px;font-weight:600">${titulo}</div>${sub ? `<div style="font-size:12.5px;color:${CINZA};margin-top:4px;line-height:1.5">${sub}</div>` : ""}</div><span data-ig-fechar data-hover title="Fechar" style="width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 32px">${icon(ICONS.x, 16, CINZA)}</span></div>
        <div style="padding:18px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:16px">${corpo}</div>
        ${rodape ? `<div style="display:flex;align-items:center;gap:10px;padding:14px 22px;border-top:1px solid #E6E6EA;flex-wrap:wrap">${rodape}</div>` : ""}
      </div></div>`;
  }
  async function abrirAgente(id, regras){
    if(!id) return abrirModal({ tipo: "agente", d: { name: "", system_prompt: "", model: "claude-opus-4-7", color: "#17171A", timeout_seconds: 120, active: true }, regras: [] });
    abrirModal({ tipo: "agente", id, carregando: true });
    try { const j = await api("/agents/" + id); const m = G().modal; if(!m || m.id !== id) return; const a = j.agent; m.d = { name: a.name || "", system_prompt: a.system_prompt || "", model: a.model || "claude-opus-4-7", color: a.color || "#17171A", timeout_seconds: a.timeout_seconds || 120, active: !!a.active, avatar_emoji: a.avatar_emoji }; m.regras = j.rules || []; m.carregando = false; m.rolarRegras = !!regras; modalHost(); kbCarregar(m); }
    catch(err){ fecharModal(); falha("Não consegui abrir o agente", err); }
  }
  function sincronizar(){ const m = G().modal; if(!m || !m.d) return; document.querySelectorAll("#ig-modal-host [data-ag]").forEach(el => { const k = el.dataset.ag; m.d[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value; }); }
  function modal(m){
    if(m.tipo === "evento") return modalEvento(m);
    if(m.tipo === "dia") return modalDia(m);
    if(m.tipo !== "agente") return "";
    if(m.carregando) return shell("Agente", "", carregando(), "", 720);
    const d = m.d, novo = !m.id;
    const regraTipo = m.regraTipo || "keyword";
    return shell(novo ? "Novo agente" : `Editar "${e(d.name)}"`, "As instruções viram o cérebro do agente: quem ele é, o que faz, tom de voz, regras e limites.", `
      <div style="display:flex;gap:12px;flex-wrap:wrap"><div style="flex:1 1 240px"><label style="${LBL}">Nome do agente</label><input data-ag="name" autofocus value="${e(d.name)}" placeholder="Ex.: SDR do Congresso" style="${IN}"></div>
        <div style="flex:1 1 200px"><label style="${LBL}">Modelo</label><select data-ag="model" class="cat-select" style="${IN}">${MODELOS.map(x => `<option value="${x[0]}" ${d.model === x[0] ? "selected" : ""}>${x[1]} · ${x[2]}</option>`).join("")}${MODELOS.some(x => x[0] === d.model) ? "" : `<option value="${e(d.model)}" selected>${e(d.model)}</option>`}</select></div>
        <div style="flex:0 1 80px"><label style="${LBL}">Cor</label><input data-ag="color" type="color" value="${e(d.color)}" style="${IN};padding:4px;height:42px"></div></div>
      <div><label style="${LBL}">Instruções e personalidade</label><textarea data-ag="system_prompt" rows="12" style="${TA};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;min-height:220px" placeholder="Você é o SDR do Jefferson Henrike, especialista em…\nSua missão é…\nRegras de atendimento…">${e(d.system_prompt)}</textarea><p style="${HELP}">O agente sempre recebe, além disso: responder em português, curto, no formato de DM, sem markdown. Ele vê as últimas 20 mensagens da conversa.</p></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end"><div style="flex:0 1 200px"><label style="${LBL}">Tempo máximo de resposta (s)</label><input data-ag="timeout_seconds" type="number" min="30" max="600" value="${d.timeout_seconds}" style="${IN}"><p style="${HELP}">Entre 30 e 600. Passou disso, a resposta é descartada.</p></div>
        <label style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:500;cursor:pointer;padding-bottom:26px"><input data-ag="active" type="checkbox" ${d.active ? "checked" : ""} style="width:16px;height:16px;accent-color:${ROXO}">Agente ativo (responde DMs)</label></div>
      ${novo ? `<p style="${HELP};margin:0">Depois de criar, você define as regras de quando ele entra em ação.</p>` : `
      ${kbSecao(m)}
      <div data-ig-regras style="border:1px solid #E6E6EA;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:12px">
        <div><div style="font-size:13.5px;font-weight:600">Quando este agente entra em ação</div><p style="${HELP};margin-top:3px">Sem nenhuma regra, ele só atende se for o único agente ativo. Palavras-chave têm prioridade sobre o padrão. Depois que um agente entra numa conversa, ele continua nela.</p></div>
        ${m.regras.length ? m.regras.map(r => { const t = REGRAS[r.rule_type] || [r.rule_type, ""]; const morta = ["first_message", "comment_dm", "sender_username"].includes(r.rule_type); return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #EFEFF1;border-radius:10px;background:#FAFAFA;font-size:12.5px"><span style="${CHIP};background:${morta ? "#F1F1F3" : TINT};color:${morta ? CINZA : ROXO_E}">${t[0]}</span><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.rule_value ? e(r.rule_value) : `<span style="color:${MUTE}">sempre</span>`}${morta ? ` <span style="color:${AMBAR}">· ainda não usada pelo motor</span>` : ""}</span><span style="color:${MUTE};font-size:11.5px">prioridade ${r.priority || 0}</span><span data-ig-regra-del="${r.id}" title="Remover" style="cursor:pointer;display:flex;opacity:.6">${icon(ICONS.x, 13, "currentColor")}</span></div>`; }).join("") : `<div style="font-size:12.5px;color:${MUTE}">Nenhuma regra ainda.</div>`}
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;border-top:1px solid #F1F1F3;padding-top:12px">
          <div style="flex:0 1 190px"><label style="${LBL}">Tipo</label><select data-f="regra-tipo" class="cat-select" style="${IN}"><option value="keyword" ${regraTipo === "keyword" ? "selected" : ""}>Palavra-chave</option><option value="default" ${regraTipo === "default" ? "selected" : ""}>Padrão (sem palavra)</option></select></div>
          <div style="flex:1 1 200px"><label style="${LBL}">${regraTipo === "keyword" ? "Palavras, separadas por vírgula" : "Valor"}</label><input data-f="regra-valor" ${regraTipo === "default" ? "disabled" : ""} placeholder="${regraTipo === "keyword" ? "preço, valor, quanto custa" : "não se aplica"}" style="${IN}${regraTipo === "default" ? ";background:#F7F7F8" : ""}"></div>
          <div style="flex:0 1 110px"><label style="${LBL}">Prioridade</label><input data-f="regra-prio" type="number" value="0" style="${IN}"></div>
          <span data-ig-regra-add style="${BTN_SEC};height:42px">${icon(ICONS.plus, 13, "currentColor")}Adicionar</span></div>
      </div>`}`,
      `<span style="flex:1"></span><span data-ig-fechar style="${BTN_SEC}">${novo ? "Cancelar" : "Fechar"}</span><span data-ig-salvar style="${BTN_PRI}">${novo ? "Criar agente" : "Salvar"}</span>`, 760);
  }
  // ─── Base de conhecimento do agente (RAG): usa a Biblioteca da Central ─────────
  const KB_API = "/api/instagram/kb/";
  async function kbJson(url, opts){ const r = await fetch(url, opts); const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; }
  async function kbCarregar(m){
    try {
      const [cfg, bib] = await Promise.all([kbJson(KB_API + m.id), kbJson("/api/knowledge")]);
      const pastas = bib.folders || [], porId = {}; pastas.forEach(f => { porId[f.id] = f; });
      const caminho = f => { const n = []; let x = f, k = 0; while(x && k++ < 20){ n.unshift(x.name); x = x.parentId ? porId[x.parentId] : null; } return n.join(" / "); };
      const contaDocs = {}; (bib.docs || []).forEach(d => { if(d.folderId) contaDocs[d.folderId] = (contaDocs[d.folderId] || 0) + 1; });
      m.kb = { modo: cfg.modo, pastas: cfg.pastas || [], docs: cfg.docs || 0, mudou: false, enviando: false,
        lista: pastas.map(f => ({ id: f.id, nome: caminho(f), n: contaDocs[f.id] || 0 })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) };
    } catch(err){ m.kb = { erro: err.message }; }
    if(G().modal === m){ sincronizar(); modalHost(); }
  }
  async function kbSalvar(m){
    const j = await kbJson(KB_API + m.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: m.kb.modo, pastas: m.kb.pastas }) });
    m.kb.modo = j.modo; m.kb.pastas = j.pastas; m.kb.docs = j.docs; m.kb.mudou = false;
  }
  function kbSecao(m){
    const kb = m.kb;
    const cab = `<div><div style="font-size:13.5px;font-weight:600">Base de conhecimento</div><p style="${HELP};margin-top:3px">Documentos da Biblioteca que o agente consulta antes de responder cada DM. Ele recebe só os trechos ligados à mensagem (RAG) e responde com base neles.</p></div>`;
    const caixa = c => `<div data-ig-kb style="border:1px solid #E6E6EA;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:12px">${cab}${c}</div>`;
    if(!kb) return caixa(`<div style="font-size:12.5px;color:${CINZA}">Carregando a Biblioteca...</div>`);
    if(kb.erro) return caixa(`<div style="font-size:12.5px;color:${VERM}">Não consegui carregar: ${e(kb.erro)}</div>`);
    const seg = (v, rot) => `<span data-ig-kb-modo="${v}" style="${SEG(kb.modo === v)}">${rot}</span>`;
    const resumo = kb.modo === "nenhuma" ? "O agente responde só com as instruções dele." : `${kb.docs} documento${kb.docs === 1 ? "" : "s"} pronto${kb.docs === 1 ? "" : "s"} para consulta${kb.mudou ? " (salve para aplicar)" : ""}.`;
    const lista = kb.modo !== "pastas" ? "" : kb.lista.length ? `<div style="max-height:220px;overflow-y:auto;border:1px solid #EFEFF1;border-radius:10px">${kb.lista.map(f => { const on = kb.pastas.includes(f.id); return `<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #F4F4F6;font-size:12.5px;cursor:pointer"><input type="checkbox" data-ig-kb-pasta="${e(f.id)}" ${on ? "checked" : ""} style="width:15px;height:15px;accent-color:${ROXO}"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(f.nome)}</span><span style="color:${MUTE}">${f.n}</span></label>`; }).join("")}</div><p style="${HELP};margin:0">As subpastas entram junto.</p>` : `<div style="font-size:12.5px;color:${CINZA}">A Biblioteca ainda não tem pastas. Envie arquivos abaixo e eu crio a pasta deste agente.</div>`;
    return caixa(`<div style="display:flex;padding:3px;background:#F1F1F3;border-radius:10px;align-self:flex-start;flex-wrap:wrap">${seg("nenhuma", "Sem base")}${seg("tudo", "Toda a Biblioteca")}${seg("pastas", "Pastas escolhidas")}</div>
      ${lista}
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="flex:1;min-width:200px;font-size:12.5px;color:${kb.modo === "nenhuma" ? CINZA : "#1E7A4D"}">${resumo}</span>
        <label style="${BTN_SEC}${kb.enviando ? ";opacity:.5;pointer-events:none" : ""}">${icon(ICONS.attach, 13, "currentColor")}${kb.enviando ? "Enviando..." : "Enviar arquivos para este agente"}<input data-ig-kb-arquivos type="file" multiple accept=".pdf,.doc,.docx,.pptx,.xlsx,.csv,.txt,.md,.json,.html" hidden></label>
        <a href="/biblioteca" target="_blank" rel="noopener" style="font-size:12.5px;color:${ROXO_E};font-weight:600;text-decoration:none">Abrir Biblioteca</a>
      </div>
      <p style="${HELP};margin:0">Os arquivos enviados aqui vão para a pasta "Agentes do Instagram / ${e(m.d.name || "agente")}" na Biblioteca e já entram na base deste agente. PDF, Word, planilha, texto, até 50 MB cada.</p>`);
  }
  async function kbEnviar(m, files){
    files = Array.from(files || []).filter(f => f.size <= 50 * 1024 * 1024); if(!files.length) return zAlert("Arquivo acima de 50 MB.");
    sincronizar(); m.kb.enviando = true; modalHost();
    try {
      if(m.kb.mudou) await kbSalvar(m); // não perde a escolha que ainda não foi salva
      const p = await kbJson(KB_API + m.id + "/pasta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: m.d.name || ("Agente " + m.id) }) });
      for(let i = 0; i < files.length; i += 20){ const fd = new FormData(); files.slice(i, i + 20).forEach(f => fd.append("files", f)); fd.append("folderId", p.pasta); await kbJson("/api/knowledge", { method: "POST", body: fd }); }
      cfgToast(files.length + (files.length === 1 ? " arquivo enviado" : " arquivos enviados") + ". A leitura leva alguns segundos; depois o agente já consulta.");
      m.kb = null; modalHost(); await kbCarregar(m);
      setTimeout(() => { if(G().modal === m && m.kb && !m.kb.mudou) kbCarregar(m); }, 8000); // atualiza a contagem depois da leitura
    } catch(err){ if(m.kb) m.kb.enviando = false; modalHost(); falha("Não consegui enviar", err); }
  }
  async function salvarAgente(){
    const m = G().modal; if(!m || !m.d) return; sincronizar();
    const d = m.d; if(!d.name.trim()) return zAlert("Dê um nome ao agente.");
    const t = Math.min(600, Math.max(30, Number(d.timeout_seconds) || 120));
    const body = { name: d.name.trim(), system_prompt: d.system_prompt, model: d.model, color: d.color, timeout_seconds: t, max_turns: 1, avatar_emoji: d.avatar_emoji || "robot", active: !!d.active };
    try {
      if(m.id){ await api("/agents/" + m.id, { method: "PUT", body }); if(m.kb && m.kb.mudou) await kbSalvar(m); fecharModal(); cfgToast("Agente salvo."); }
      else { const j = await api("/agents", { method: "POST", body }); m.id = j.agent.id; m.regras = []; cfgToast("Agente criado. Agora defina quando ele entra em ação."); modalHost(); }
      loadAgentes();
    } catch(err){ falha("Não consegui salvar", err); }
  }
  // Post da agenda (avulso ou item de campanha): prévia, status, contas, legenda e as ações possíveis
  const midiaDe = ev => { let u = ev.media_url || ev.media_path || ""; if(String(u).charAt(0) === "["){ try { u = JSON.parse(u)[0] || ""; } catch(err){ u = ""; } } return safeUrl(u); };
  // Todas as lâminas do carrossel (o servidor manda media_urls; post antigo só tem media_url)
  const midiasDe = ev => { const l = Array.isArray(ev.media_urls) && ev.media_urls.length ? ev.media_urls : [midiaDe(ev)]; return l.map(safeUrl).filter(Boolean); };
  const ehVideoEv = ev => ev.tipo === "reel" || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(ev.media_url || ev.media_path || "") || String(ev.media_type || "").indexOf("video") === 0;
  const tituloEv = ev => ev.titulo || (ev.caption || "").replace(/\s+/g, " ").slice(0, 80) || ev.media_name || "Sem legenda";
  function modalEvento(m){
    const ev = m.ev, url = midiaDe(ev), video = ehVideoEv(ev), campanha = ev.origem === "campanha";
    const corpo = `
      ${!video && midiasDe(ev).length > 1
        ? `<div><div style="font-size:11.5px;color:${CINZA};margin-bottom:6px">${midiasDe(ev).length} lâminas · clique para ver em tamanho real</div><div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px">${midiasDe(ev).map((u, i) => `<a href="${u}" target="_blank" rel="noopener" title="Lâmina ${i + 1}" style="position:relative;flex:0 0 auto;display:block;height:220px;border-radius:10px;overflow:hidden;background:#0F0F12"><img src="${u}" alt="Lâmina ${i + 1}" loading="lazy" style="height:220px;width:auto;display:block"><span style="position:absolute;top:6px;left:6px;padding:2px 7px;border-radius:6px;background:rgba(23,23,26,0.72);color:#FFFFFF;font-size:11px;font-weight:600">${i + 1}</span></a>`).join("")}</div></div>`
        : url ? `<div style="display:flex;justify-content:center;background:#0F0F12;border-radius:12px;overflow:hidden;max-height:300px">${video ? `<video src="${url}" controls preload="metadata" style="max-height:300px;max-width:100%"></video>` : `<a href="${url}" target="_blank" rel="noopener" style="display:flex"><img src="${url}" alt="" style="max-height:300px;max-width:100%;object-fit:contain"></a>`}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${selo(ev.status)}<span style="${CHIP};background:#F6F6F7;color:#3C3C44">${TIPO[ev.tipo] || "Feed"}</span>${campanha ? `<span style="${CHIP};background:#F6F6F7;color:#3C3C44">Campanha: ${e(ev.titulo || "#" + ev.campaign_id)}</span>` : ""}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
        <div><div style="font-size:11.5px;color:${CINZA};margin-bottom:3px">Quando</div><div style="font-size:13.5px">${e(dSeg(ev.quando).toLocaleDateString("pt-BR", Object.assign({ weekday: "long", day: "2-digit", month: "long", year: "numeric" }, BRT)))}, ${hSeg(ev.quando)}</div></div>
        <div><div style="font-size:11.5px;color:${CINZA};margin-bottom:3px">Contas</div><div style="font-size:13.5px">${e(contasNome(ev.account_ids))}</div></div>
      </div>
      ${ev.caption ? `<div><div style="font-size:11.5px;color:${CINZA};margin-bottom:4px">Legenda</div><div style="font-size:13.5px;line-height:1.55;white-space:pre-wrap;background:#F6F6F7;border-radius:10px;padding:12px;max-height:180px;overflow:auto">${e(ev.caption)}</div></div>` : ""}
      ${ev.media_name ? `<div style="font-size:12.5px;color:${CINZA}">Arquivo: ${e(ev.media_name)}</div>` : ""}
      ${ev.error_message ? `<div style="padding:10px 14px;border:1px solid rgba(192,52,28,0.3);border-radius:10px;background:rgba(192,52,28,0.05);font-size:12.5px;color:${VERM};line-height:1.5">${e(ev.error_message)}</div>` : ""}
      ${m.resultados && m.resultados.length ? `<div><div style="font-size:11.5px;color:${CINZA};margin-bottom:6px">Resultado por conta</div><div style="border:1px solid #E6E6EA;border-radius:12px;overflow:hidden">${m.resultados.map(r => `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #F4F4F6"><div style="flex:1;min-width:0"><div style="font-size:13px">${e(contasNome([r.account_id]))}</div>${r.error_message ? `<div style="font-size:11.5px;color:${VERM};line-height:1.45">${e(r.error_message)}</div>` : ""}</div>${selo(r.status)}</div>`).join("")}</div></div>` : ""}`;
    let rodape;
    if(campanha && ev.editavel){
      // post de campanha ainda não publicado: horário e legenda própria deste post (vazia = regra de legenda da campanha)
      const story = ev.tipo === "story";
      return shell(e(ev.titulo || "Item de campanha"), "Post de campanha em massa. A alteração vale só para este post; o resto da campanha continua igual.", corpo.replace(/<div><div style="font-size:11\.5px;color:[^"]*;margin-bottom:4px">Legenda<\/div>[\s\S]*?<\/div><\/div>/, "") + `
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;border-top:1px solid #F1F1F3;padding-top:14px">
          <div style="flex:0 1 240px"><label style="${LBL}">Novo horário (Brasília)</label><input data-ig-item-quando type="datetime-local" value="${e(localDe(ev.quando))}" style="${IN}"></div>
        </div>
        ${story ? `<p style="${HELP};margin:0">Story não tem legenda no Instagram.</p>` : `<div><label style="${LBL}">Legenda deste post</label><textarea data-ig-item-legenda rows="5" placeholder="Vazia: usa a legenda da campanha (fixa, IA ou estrofes)" style="${TA}">${e(ev.caption_propria ? ev.caption : "")}</textarea><p style="${HELP}">${ev.caption_propria ? "Este post já tem legenda própria." : "Hoje este post usa a regra de legenda da campanha, gerada na hora de publicar."}</p></div>`}`,
        `<span data-ig-item-remover style="${BTN_DANGER}${m.ocupado ? ";opacity:.5;pointer-events:none" : ""}">${icon(ICONS.trash, 13, "currentColor")}Remover da programação</span><span style="flex:1"></span><span data-ig-ev-campanha="${ev.campaign_id}" style="${BTN_SEC}">Abrir campanha</span><span data-ig-item-salvar style="${BTN_PRI}${m.ocupado ? ";opacity:.5;pointer-events:none" : ""}">${m.ocupado ? "Salvando..." : "Salvar alterações"}</span>`, 640);
    }
    if(campanha) rodape = `<span style="flex:1"></span><span data-ig-fechar style="${BTN_SEC}">Fechar</span><span data-ig-ev-campanha="${ev.campaign_id}" style="${BTN_PRI}">Abrir campanha</span>`;
    else { const editavel = ["draft", "scheduled", "failed"].includes(ev.status);
      rodape = `<span data-ig-ev-excluir style="${BTN_DANGER}">${icon(ICONS.trash, 13, "currentColor")}Excluir</span><span style="flex:1"></span>${editavel ? `<span data-ig-ev-publicar style="${BTN_SEC}${m.ocupado ? ";opacity:.5;pointer-events:none" : ""}">${m.ocupado ? "Publicando..." : ev.status === "failed" ? "Tentar publicar agora" : "Publicar agora"}</span><span data-ig-ev-editar style="${BTN_PRI}">Editar</span>` : `<span data-ig-fechar style="${BTN_SEC}">Fechar</span>`}`; }
    return shell(e(ev.titulo || (campanha ? "Item de campanha" : "Post #" + ev.post_id)), "", corpo, rodape, 640);
  }
  async function abrirEvento(ev){
    abrirModal({ tipo: "evento", ev, resultados: null });
    if(ev.origem !== "post") return;
    try { const p = (await zp("/posts")).find(x => String(x.id) === String(ev.post_id)); const m = G().modal; if(m && m.tipo === "evento" && m.ev === ev && p && p.results && p.results.length){ m.resultados = p.results; modalHost(); } } catch(err){}
  }
  const recarregarAgenda = () => { const g = G(); loadResumo(); if(g.view === "calendario") loadCal(); if(g.view === "desempenho") loadPerf(); };
  async function publicarAgora(ev){
    // Post agendado para o futuro: deixa claro que "Publicar agora" ANTECIPA (já houve carrossel publicado 2 dias antes por engano)
    const futuro = ev.status === "scheduled" && ev.quando && dSeg(ev.quando).getTime() > Date.now() + 60000;
    const quandoTxt = futuro ? dSeg(ev.quando).toLocaleDateString("pt-BR", Object.assign({ weekday: "long", day: "2-digit", month: "2-digit" }, BRT)) + " às " + hSeg(ev.quando) : "";
    const pergunta = futuro
      ? `Este post está AGENDADO para ${quandoTxt}. "Publicar agora" ANTECIPA: ele vai ao ar neste momento em ${contasNome(ev.account_ids)} e não sai mais no horário agendado. Não dá para desfazer por aqui.\n\nSe você só queria manter o agendamento, clique em Cancelar.`
      : `O post vai ao ar imediatamente em ${contasNome(ev.account_ids)}. Não dá para desfazer por aqui. Publicar?`;
    if(!await zConfirm(pergunta, { ok: futuro ? "Sim, publicar agora" : "Publicar", danger: futuro })) return false;
    const m = G().modal; if(m && m.tipo === "evento"){ m.ocupado = true; modalHost(); } else cfgToast("Publicando...");
    try { const r = await zp("/posts/" + ev.post_id + "/publish", { method: "POST", body: {} }); const falhou = (r.results || []).filter(x => x.status === "failed" || x.error); if(falhou.length) zAlert("A Meta recusou: " + (falhou[0].error || falhou[0].error_message || "erro desconhecido")); else cfgToast("Publicado."); }
    catch(err){ falha("Não consegui publicar", err); }
    if(G().modal && G().modal.tipo === "evento") fecharModal();
    recarregarAgenda(); return true;
  }
  function modalDia(m){
    const lista = m.lista || [];
    return shell(e(new Date(m.dia + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })), `${lista.length} ${lista.length === 1 ? "publicação" : "publicações"} no dia`,
      `<div style="display:flex;flex-direction:column;gap:6px">${lista.map(ev => { const x = stPost(ev.status); return `<div data-ig-ev="${e(ev.id)}" data-hover style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;cursor:pointer"><strong style="width:44px;font-size:12.5px;font-variant-numeric:tabular-nums">${hSeg(ev.quando)}</strong><div style="flex:1;min-width:0"><div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(tituloEv(ev))}</div><div style="font-size:11.5px;color:${CINZA}">${e(contasNome(ev.account_ids))} · ${TIPO[ev.tipo] || "Feed"}</div></div><span style="${CHIP};background:${x[2]};color:${x[1]}">${x[0]}</span></div>`; }).join("")}</div>`,
      `<span style="flex:1"></span><span data-ig-fechar style="${BTN_SEC}">Fechar</span><span data-ig-dia-novo="${m.dia}" style="${BTN_PRI}">Novo post neste dia</span>`, 560);
  }

  // ─── Calendário: agenda do mês (posts avulsos + itens de campanha) ───────────
  function calendario(){
    const g = G(), c = g.cal, evs = c.evs;
    const conta = grp => (evs || []).filter(ev => stPost(ev.status)[3] === grp).length;
    const chips = [["agendado", "Agendado", ROXO], ["publicado", "Publicado", "#1E8E5A"], ["falhou", "Falhou", "#C2342B"], ["rascunho", "Rascunho", MUTE]].map(s => `<span data-ig-cal-st="${s[0]}" title="${c.off[s[0]] ? "Mostrar" : "Esconder"} no calendário" style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:20px;font-size:12px;cursor:pointer;background:${c.off[s[0]] ? "transparent" : "#FFFFFF"};color:${c.off[s[0]] ? MUTE : "#3C3C44"};white-space:nowrap"><span style="width:7px;height:7px;border-radius:2px;background:${s[2]}"></span>${s[1]} · ${evs ? conta(s[0]) : "…"}</span>`).join("");
    const nav = (d, rot, tit) => `<span data-ig-cal-nav="${d}" title="${tit}" style="width:32px;height:32px;border:1px solid #E0E0E5;border-radius:8px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;cursor:pointer">${rot}</span>`;
    let grade;
    if(!evs) grade = `<div style="padding:40px;text-align:center">${c.erro ? `<span style="color:${VERM};font-size:13px">${e(c.erro)}</span>` : carregando()}</div>`;
    else {
      const porDia = {}; evs.filter(ev => !c.off[stPost(ev.status)[3]]).forEach(ev => { const k = diaBRT(ev.quando); (porDia[k] = porDia[k] || []).push(ev); });
      Object.values(porDia).forEach(l => l.sort((a, b) => a.quando - b.quando));
      const ini0 = new Date(c.y, c.m, 1), total = new Date(c.y, c.m + 1, 0).getDate(), offset = ini0.getDay(), hoje = hojeBRT(), cel = [];
      for(let i = 0; i < offset; i++) cel.push({ out: true, n: new Date(c.y, c.m, i - offset + 1).getDate() });
      for(let d = 1; d <= total; d++){ const k = ymd(c.y, c.m, d); cel.push({ n: d, k, evs: porDia[k] || [], hoje: k === hoje }); }
      let prox = 1; while(cel.length % 7) cel.push({ out: true, n: prox++ });
      const chip = ev => { const x = stPost(ev.status), a = contaPorId((ev.account_ids || [])[0]); return `<div data-ig-ev="${e(ev.id)}" title="${e(hSeg(ev.quando) + " · " + x[0] + " · " + tituloEv(ev))}" style="display:flex;align-items:center;gap:6px;padding:3px 7px;border-radius:6px;font-size:11.5px;background:${x[2]};color:${x[1]};white-space:nowrap;overflow:hidden;cursor:pointer"><strong style="font-weight:600">${hSeg(ev.quando)}</strong><span style="overflow:hidden;text-overflow:ellipsis">${a ? "@" + e(a.user) : e(tituloEv(ev))}${(ev.account_ids || []).length > 1 ? " +" + (ev.account_ids.length - 1) : ""}</span></div>`; };
      grade = `<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-bottom:1px solid #EEEEF1">${["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map(w => `<span style="padding:10px 12px;font-size:11px;letter-spacing:0.1em;font-weight:700;color:${MUTE}">${w}</span>`).join("")}</div>
        <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr))">${cel.map(d => d.out ? `<div style="min-height:118px;padding:8px;border-right:1px solid #F2F2F4;border-bottom:1px solid #F2F2F4;background:#FAFAFB"><span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;font-size:12.5px;font-weight:500;color:#B8B8C0">${d.n}</span></div>`
          : `<div data-ig-dia="${d.k}" data-hover title="Clique para criar um post neste dia" style="min-height:118px;padding:8px;border-right:1px solid #F2F2F4;border-bottom:1px solid #F2F2F4;background:#FFFFFF;display:flex;flex-direction:column;gap:4px;cursor:pointer;min-width:0">
            <span style="align-self:flex-start;min-width:24px;height:24px;padding:0 6px;border-radius:12px;font-size:12.5px;font-weight:${d.hoje ? 700 : 500};display:flex;align-items:center;justify-content:center;background:${d.hoje ? ROXO : "transparent"};color:${d.hoje ? "#FFFFFF" : "#3C3C44"}">${d.n}</span>
            ${d.evs.slice(0, 3).map(chip).join("")}${d.evs.length > 3 ? `<span data-ig-dia-mais="${d.k}" style="font-size:11.5px;color:${CINZA};padding-left:4px;cursor:pointer">+${d.evs.length - 3} no dia</span>` : ""}</div>`).join("")}</div>`;
    }
    return `<div data-scroll="cal" style="flex:1;min-width:0;overflow:auto;padding:20px 28px 60px">
      <div style="min-width:760px;max-width:1240px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
          ${nav(-1, "‹", "Mês anterior")}<span style="${HEAD};font-weight:600;font-size:17px;min-width:150px;text-align:center">${MESES[c.m]} ${c.y}</span>${nav(1, "›", "Próximo mês")}
          <span data-ig-cal-nav="0" style="font-size:13px;color:${CINZA};cursor:pointer;padding:0 6px">Hoje</span>
          <div style="flex:1"></div>${chips}
        </div>
        ${c.erro && evs ? `<div style="margin-bottom:12px;font-size:12.5px;color:${VERM}">${e(c.erro)}</div>` : ""}
        <div style="${CARD};overflow:hidden">${grade}</div>
      </div>
    </div>`;
  }

  // ─── Desempenho: entregas do período, alcance, melhores horários, próximas e falhas ─
  function desempenho(){
    const g = G(), p = g.perf, evs = p.evs, an = p.an;
    if(!evs || !an) return `<div style="flex:1;min-width:0;padding:24px 28px">${p.erro ? vazio("Não consegui carregar o desempenho", e(p.erro)) : carregando()}</div>`;
    const agora = Math.floor(Date.now() / 1000), noPeriodo = evs.filter(x => x.quando >= p.de && x.quando <= agora);
    const pub = noPeriodo.filter(x => x.status === "published"), falhas = noPeriodo.filter(x => x.status === "failed").sort((a, b) => b.quando - a.quando);
    const agend = evs.filter(x => x.status === "scheduled" && x.quando >= agora).sort((a, b) => a.quando - b.quando);
    const taxa = pub.length + falhas.length ? Math.round(pub.length / (pub.length + falhas.length) * 100) + "%" : "—";
    const nAgend = g.conta ? agend.length : (g.resumo ? g.resumo.agendadas : agend.length);
    // barras: publicações entregues por dia do período
    const dias = Array.from({ length: p.dias }, (_, i) => diaBRT(agora - (p.dias - 1 - i) * 86400));
    const porDia = {}; pub.forEach(x => { const k = diaBRT(x.quando); porDia[k] = (porDia[k] || 0) + 1; });
    const serie = dias.map(k => porDia[k] || 0), maxDia = Math.max(1, ...serie);
    const t = an.totals || {}, hmObj = an.heatmap || {}, hm = hmObj.heatmap || [], top = hmObj.top_hours || [];
    const eng = t.reach ? (((Number(t.likes) || 0) + (Number(t.comments) || 0) + (Number(t.saves) || 0) + (Number(t.shares) || 0)) / t.reach * 100).toFixed(1).replace(".", ",") + "%" : "—";
    const kpi = (rot, v, cor) => `<div><div style="font-size:12px;color:${CINZA}">${rot}</div><div style="${HEAD};font-size:26px;font-weight:600;color:${cor || "#17171A"}">${v}</div></div>`;
    const tit = (a, sub) => `<div style="flex:1"><div style="${HEAD};font-weight:600;font-size:15px">${a}</div>${sub ? `<div style="font-size:12.5px;color:${CINZA};margin-top:2px">${sub}</div>` : ""}</div>`;
    const rotulo = a => `<div style="font-size:11px;letter-spacing:0.12em;font-weight:700;color:${CINZA};margin-bottom:14px">${a}</div>`;
    const ESCALA = ["#F4F4F6", "#E7DFFB", "#C9B8F5", "#9C7DEE", ROXO], maxHm = Math.max(1, ...hm.map(l => Math.max(0, ...l)));
    const recentes = (an.recentPosts || []).filter(x => !g.conta || !contaAtual() || x.platform_username === contaAtual().user).slice(0, 8);
    const COLS = "grid-template-columns:minmax(0,2.2fr) minmax(0,1fr) 0.9fr 0.7fr 0.7fr 0.7fr 28px;gap:10px";
    return `<div data-scroll="perf" style="flex:1;min-width:0;overflow-y:auto;padding:24px 28px 60px">
      <div style="max-width:1180px;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="display:flex;padding:3px;background:#F1F1F3;border-radius:10px">${[[7, "7 dias"], [30, "30 dias"], [90, "90 dias"]].map(x => `<span data-ig-periodo="${x[0]}" style="${SEG(p.dias === x[0])}">${x[1]}</span>`).join("")}</div>
          <span style="flex:1"></span>
          <span style="font-size:12px;color:${MUTE}">Métricas atualizadas a cada 30 min</span>
          <span data-ig-coletar style="font-size:12.5px;color:${ROXO_E};font-weight:600;cursor:pointer;${p.coletando ? "opacity:.5;pointer-events:none" : ""}">${p.coletando ? "Coletando na Meta..." : "Atualizar agora"}</span>
        </div>
        ${p.erro ? `<div style="font-size:12.5px;color:${VERM}">${e(p.erro)}</div>` : ""}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr));gap:16px">
          <div style="${CARD};padding:20px">
            ${rotulo("PUBLICAÇÕES · " + p.dias + " DIAS")}
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">${kpi("Entregues", num(pub.length))}${kpi("Agendadas", num(nAgend))}${kpi("Falhas", num(falhas.length), falhas.length ? "#B02E26" : null)}${kpi("Taxa de entrega", taxa, taxa === "—" ? null : "#1E7A4D")}</div>
            <div style="display:flex;align-items:flex-end;gap:${p.dias > 30 ? 1 : 3}px;height:84px;margin-top:18px">${serie.map((v, i) => `<div title="${curta(dias[i])}: ${v} ${v === 1 ? "publicação" : "publicações"}" style="flex:1;height:${Math.round(v / maxDia * 100)}%;min-height:2px;border-radius:2px;background:${i === serie.length - 1 ? ROXO : "#D5C8F8"}"></div>`).join("")}</div>
            <div style="display:flex;justify-content:space-between;font-size:10.5px;color:${MUTE};margin-top:6px"><span>${curta(dias[0])}</span><span>${curta(dias[Math.floor(dias.length / 2)])}</span><span>${curta(dias[dias.length - 1])}</span></div>
          </div>
          <div style="${CARD};padding:20px">
            ${rotulo("ALCANCE E ENGAJAMENTO · " + num(an.totalPosts) + " POSTS, TODAS AS CONTAS")}
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 10px">${kpi("Alcance", compact(t.reach))}${kpi("Views", compact(t.views))}${kpi("Curtidas", num(t.likes))}${kpi("Comentários", num(t.comments))}${kpi("Salvos", num(t.saves))}${kpi("Engajamento", eng)}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr));gap:16px">
          <div style="${CARD};padding:20px;overflow-x:auto">
            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:16px">${tit("Melhores horários", "Alcance médio por dia e hora · " + num(hmObj.total_samples) + " posts")}</div>
            ${hm.length ? `<div style="min-width:440px">${hm.map((linha, d) => `<div style="display:flex;align-items:center;gap:3px;margin-bottom:3px"><span style="width:30px;font-size:11px;color:${CINZA}">${DIAS[d]}</span>${linha.map((v, h) => `<span title="${DIAS[d]} ${h}h: alcance médio ${num(Math.round(v))}" style="flex:1;height:16px;border-radius:3px;background:${ESCALA[v ? Math.min(4, 1 + Math.floor(v / maxHm * 3.999)) : 0]}"></span>`).join("")}</div>`).join("")}
              <div style="display:flex;gap:3px;padding-left:33px;margin-top:4px">${Array.from({ length: 24 }, (_, h) => `<span style="flex:1;font-size:9.5px;color:${MUTE};text-align:center">${h % 3 === 0 ? h : ""}</span>`).join("")}</div></div>` : `<div style="font-size:12.5px;color:${CINZA}">Ainda sem amostras suficientes.</div>`}
          </div>
          <div style="${CARD};padding:20px 0 6px">
            <div style="padding:0 20px 10px">${tit("Janelas de pico", "Maior alcance médio")}</div>
            ${top.length ? top.slice(0, 5).map((h, i) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 20px;border-top:1px solid #F2F2F4"><span style="width:22px;font-size:12px;color:${MUTE}">${i + 1}</span><div style="flex:1"><div style="font-size:13.5px;font-weight:600">${DIAS[h.dow]} às ${h.hour}h</div><div style="font-size:12px;color:${CINZA}">${h.samples} ${h.samples === 1 ? "post" : "posts"} na amostra</div></div><span style="${HEAD};font-weight:600">${num(Math.round(h.avg_reach))}</span></div>`).join("") : `<div style="padding:10px 20px;font-size:12.5px;color:${CINZA}">Sem dados ainda.</div>`}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr));gap:16px">
          <div style="${CARD};padding:20px 0 6px">
            <div style="display:flex;align-items:center;padding:0 20px 10px">${tit("Próximas publicações")}<span data-ig-view="calendario" style="font-size:13px;color:${ROXO_E};font-weight:600;cursor:pointer">Ver calendário</span></div>
            ${agend.length ? agend.slice(0, 5).map(n => `<div data-ig-ev="${e(n.id)}" data-hover style="display:flex;align-items:center;gap:12px;padding:11px 20px;border-top:1px solid #F2F2F4;cursor:pointer"><span style="width:44px;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums">${hSeg(n.quando)}</span><div style="flex:1;min-width:0"><div style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(tituloEv(n))}</div><div style="font-size:12px;color:${CINZA}">${dSegCurta(n.quando)} · ${e(contasNome(n.account_ids))}</div></div><span style="font-size:11.5px;color:${CINZA};padding:2px 8px;border:1px solid #EEEEF1;border-radius:6px">${TIPO[n.tipo] || "Feed"}</span></div>`).join("") : `<div style="padding:14px 20px;border-top:1px solid #F2F2F4;font-size:12.5px;color:${CINZA}">Nada agendado. <span data-ig-novo-post style="color:${ROXO_E};font-weight:600;cursor:pointer">Criar post</span></div>`}
          </div>
          <div style="${CARD};padding:20px 0 6px">
            <div style="display:flex;align-items:center;padding:0 20px 10px">${tit("Falhas recentes")}<span style="font-size:12px;font-weight:600;color:${falhas.length ? "#B02E26" : CINZA}">${falhas.length} no período</span></div>
            ${falhas.length ? falhas.slice(0, 5).map(n => `<div style="display:flex;align-items:center;gap:12px;padding:11px 20px;border-top:1px solid #F2F2F4"><span style="width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#C2342B"></span><div data-ig-ev="${e(n.id)}" style="flex:1;min-width:0;cursor:pointer"><div style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(tituloEv(n))} · ${TIPO[n.tipo] || "Feed"}</div><div style="font-size:12px;color:${CINZA}">${dSegCurta(n.quando)} às ${hSeg(n.quando)} · ${e(contasNome(n.account_ids))}</div></div>${n.origem === "post" ? `<span data-ig-retry="${e(n.id)}" style="font-size:12.5px;color:${ROXO_E};font-weight:600;cursor:pointer;white-space:nowrap">Tentar de novo</span>` : ""}</div>`).join("") : `<div style="padding:14px 20px;border-top:1px solid #F2F2F4;font-size:12.5px;color:${CINZA}">Nenhuma falha no período.</div>`}
          </div>
        </div>
        <div style="${CARD};padding:20px 0 6px;overflow-x:auto">
          <div style="padding:0 20px 12px">${tit("Publicações recentes", "Métricas coletadas do Instagram por post")}</div>
          <div style="min-width:680px">
            <div style="display:grid;${COLS};padding:8px 20px;font-size:11px;letter-spacing:0.08em;font-weight:700;color:${MUTE};border-bottom:1px solid #EEEEF1"><span>POST</span><span>CONTA</span><span>PUBLICADO</span><span style="text-align:right">ALCANCE</span><span style="text-align:right">VIEWS</span><span style="text-align:right">CURTIDAS</span><span></span></div>
            ${recentes.length ? recentes.map(x => `<div style="display:grid;${COLS};align-items:center;padding:11px 20px;border-bottom:1px solid #F4F4F6;font-size:13px"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e((x.caption || "").replace(/\s+/g, " ").slice(0, 90) || x.title || "Sem legenda")}</span><span style="color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">@${e(x.platform_username || "")}</span><span style="color:${CINZA};white-space:nowrap">${dSegCurta(x.published_at)} ${hSeg(x.published_at)}</span><span style="text-align:right">${num(x.reach)}</span><span style="text-align:right">${num(x.views)}</span><span style="text-align:right">${num(x.likes)}</span>${x.permalink && safeUrl(x.permalink) ? `<a href="${safeUrl(x.permalink)}" target="_blank" rel="noopener" title="Abrir no Instagram" data-hover style="width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:${CINZA}">${icon(ICONS.extLink, 13, "currentColor")}</a>` : "<span></span>"}</div>`).join("") : `<div style="padding:14px 20px;font-size:12.5px;color:${CINZA}">Nenhum post publicado ainda.</div>`}
          </div>
        </div>
      </div>
    </div>`;
  }

  // ─── Novo post / edição ──────────────────────────────────────────────────────
  const localDe = ts => diaBRT(ts) + "T" + hSeg(ts); // valor de <input datetime-local>, em horário de Brasília
  function novoPost(pre){
    const g = G(); pre = pre || {};
    g.post = { id: null, status: null, editavel: true, title: "", caption: "", media_path: "", media_type: "", destino: "feed", contas: g.conta ? [Number(g.conta)] : [], modo: "agendar", quando: pre.date ? pre.date + "T18:00" : "", enviando: false, salvando: false };
    g.view = "compose"; g.accMenu = false; repaint();
  }
  async function editarPost(id){
    const g = G();
    try {
      const p = (await zp("/posts")).find(x => String(x.id) === String(id)); if(!p) throw new Error("Post #" + id + " não encontrado.");
      g.post = { id: p.id, status: p.status, editavel: ["draft", "scheduled", "failed"].includes(p.status), title: p.title || "", caption: p.caption || "", media_path: p.media_path || "", media_type: String(p.media_type || "").indexOf("video") === 0 ? "video" : "image", destino: p.post_type === "story" ? "story" : "feed", contas: (p.account_ids || []).map(Number), modo: p.scheduled_at ? "agendar" : "rascunho", quando: p.scheduled_at ? localDe(p.scheduled_at) : "", enviando: false, salvando: false };
      g.view = "compose"; g.accMenu = false; repaint();
    } catch(err){ falha("Não consegui abrir o post", err); }
  }
  const postVideo = () => G().post.media_type === "video";
  const postCarrossel = () => String(G().post.media_path || "").charAt(0) === "[";
  const postMidia = () => midiaDe({ media_path: G().post.media_path });
  const capCount = () => { const f = G().post, tags = (f.caption.match(/#[\wÀ-ú]+/g) || []).length; return `<span style="color:${f.caption.length > CAPTION_MAX ? VERM : "inherit"}">${num(f.caption.length)} / ${num(CAPTION_MAX)}</span> · <span style="color:${tags > HASHTAG_MAX ? VERM : "inherit"}">${tags} / ${HASHTAG_MAX} hashtags</span>`; };
  const prevCap = () => { const f = G().post, c0 = contaPorId(f.contas[0]); return f.caption ? `<strong>${c0 ? e(c0.user) : "sua_conta"}</strong> ${e(f.caption)}` : `<span style="color:${MUTE}">A legenda aparece aqui.</span>`; };
  function compose(){
    const g = G(), f = g.post, cs = g.contas || [], story = f.destino === "story", url = postMidia(), video = postVideo(), c0 = contaPorId(f.contas[0]);
    const seg = (attr, ops, atual) => `<div style="display:flex;padding:3px;background:#F1F1F3;border-radius:10px">${ops.map(o => `<span ${attr}="${o[0]}" style="${SEG(atual === o[0])}">${o[1]}</span>`).join("")}</div>`;
    const rot = (a, dir) => `<div style="display:flex;font-size:12.5px;margin-bottom:8px"><span style="font-weight:600;flex:1">${a}</span>${dir || ""}</div>`;
    const dica = f.modo === "agora" ? "Vai ao ar assim que você confirmar. Vídeos podem levar alguns minutos para a Meta processar." : f.modo === "agendar" ? "O publicador verifica a fila a cada minuto e posta no horário (horário de Brasília)." : "Fica guardado sem data. Você agenda depois pelo calendário.";
    const midia = f.enviando ? `<div style="padding:26px;border:1.5px dashed #DCDCE2;border-radius:12px;text-align:center;font-size:13px;color:${CINZA}"><span class="tm-pulse">Enviando ${e(f.enviando)}...</span></div>`
      : url ? `<div style="display:flex;align-items:center;gap:12px;border:1px solid #E6E6EA;border-radius:12px;padding:10px;flex-wrap:wrap"><span style="width:56px;height:56px;flex:0 0 56px;border-radius:9px;background:#F1F1F3;overflow:hidden;display:flex;align-items:center;justify-content:center;color:${MUTE}">${video ? icon('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>', 22, "currentColor") : `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover">`}</span><div style="flex:1;min-width:120px"><div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(String(f.media_path).split("/").pop().replace(/["\]]+$/, ""))}</div><div style="font-size:11.5px;color:${CINZA}">${postCarrossel() ? "Carrossel" : video ? "Vídeo" : "Imagem"} enviada</div></div><label style="${BTN_ROW}">Trocar<input data-ig-post-arquivo type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" hidden></label><span data-ig-post-tira style="${BTN_ROW};color:#B02E26">Remover</span></div>`
      : `<label data-ig-post-drop style="display:block;padding:26px;border:1.5px dashed #DCDCE2;border-radius:12px;text-align:center;font-size:13px;color:${CINZA};cursor:pointer"><span style="color:${ROXO_E};font-weight:600">Escolher arquivo</span> ou arraste aqui<div style="font-size:12px;color:${MUTE};margin-top:4px">JPG, PNG, WebP, MP4 ou MOV até 100 MB${story ? "" : ". Vídeo no feed sai como Reels"}</div><input data-ig-post-arquivo type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" hidden></label>`;
    const botao = f.salvando ? (f.modo === "agora" ? "Publicando..." : "Salvando...") : f.modo === "agora" ? "Publicar agora" : f.modo === "agendar" ? (f.id && f.editavel ? "Salvar agendamento" : "Agendar post") : "Salvar rascunho";
    return `<div data-scroll="post" style="flex:1;min-width:0;overflow-y:auto;padding:24px 28px 60px">
      <div style="max-width:1080px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
          <span data-ig-view="calendario" style="font-size:13px;color:${CINZA};cursor:pointer">‹ Voltar</span>
          <span style="${HEAD};font-weight:600;font-size:19px;flex:1">${f.id ? "Editar post #" + f.id : "Novo post"}${f.id && f.status ? ` <span style="vertical-align:middle;margin-left:6px">${selo(f.status)}</span>` : ""}</span>
          ${f.id ? "" : `<div style="display:flex;padding:3px;background:#F1F1F3;border-radius:10px"><span style="${SEG(true)}">Post único</span><span data-ig-massa style="${SEG(false)}">Em massa</span></div>`}
        </div>
        ${f.id && !f.editavel ? `<div style="margin-bottom:16px;padding:12px 14px;border:1px solid #DDD3FA;border-radius:12px;background:${SEL};font-size:12.5px;color:#3C3C44;line-height:1.5">Este post já foi publicado (ou está publicando) e não pode mais ser alterado. Você pode usar o conteúdo como base: mude o que quiser e salve como um post novo.</div>` : ""}
        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
          <div style="flex:1.5 1 420px;min-width:0;${CARD};padding:22px;display:flex;flex-direction:column;gap:20px">
            <div>${rot("Formato")}<div style="display:inline-flex">${seg("data-ig-post-destino", [["feed", "Feed ou Reels"], ["story", "Story"]], f.destino)}</div>${story ? `<p style="${HELP}">Story exige imagem ou vídeo (até 60 s) e não aceita legenda, link nem enquete pela API da Meta.</p>` : ""}</div>
            <div>${rot("Mídia")}${midia}</div>
            ${story ? "" : `<div>${rot("Legenda", `<span id="ig-cap-count" style="color:${MUTE}">${capCount()}</span>`)}<textarea data-ig-post-caption data-keep="caption" placeholder="Escreva a legenda…" style="${TA};min-height:110px;border-color:#E0E0E5">${e(f.caption)}</textarea></div>`}
            <div>${rot("Título interno", `<span style="color:${MUTE}">opcional</span>`)}<input data-ig-post-title data-keep="title" maxlength="120" value="${e(f.title)}" placeholder="Só para você achar o post depois. Ex.: Dica de gestão 12" style="${IN};border-color:#E0E0E5"></div>
            <div>${rot("Publicar em", `<span style="color:${MUTE}">${f.contas.length ? f.contas.length + (f.contas.length === 1 ? " conta" : " contas") : "escolha ao menos uma"}</span>`)}
              ${cs.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${cs.map(c => { const on = f.contas.includes(Number(c.id)); return `<span data-ig-post-conta="${c.id}" style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:9px;border:1px solid ${on ? ROXO : "#E0E0E5"};background:${on ? SEL : "#FFFFFF"};font-size:13px;cursor:pointer"><span style="width:14px;height:14px;flex:0 0 14px;border-radius:4px;border:1.5px solid ${on ? ROXO : "#C8C8CE"};background:${on ? ROXO : "#FFFFFF"};color:#FFFFFF;font-size:10px;display:flex;align-items:center;justify-content:center;box-sizing:border-box">${on ? "✓" : ""}</span>@${e(c.user)}${c.ativa ? "" : ` <span style="font-size:11px;color:${AMBAR}">reconectar</span>`}</span>`; }).join("")}</div>` : `<div style="font-size:12.5px;color:${CINZA}">${g.contas ? `Nenhuma conta conectada. <span data-ig-conectar style="color:${ROXO_E};font-weight:600;cursor:pointer">Conectar conta</span>` : "Carregando contas..."}</div>`}
            </div>
          </div>
          <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:14px;position:sticky;top:0">
            <div style="${CARD};overflow:hidden">
              <div style="display:flex;align-items:center;gap:8px;padding:12px 14px">${c0 ? contaAvatar(c0, 26) : `<span style="width:26px;height:26px;border-radius:50%;background:#F1F1F3"></span>`}<span style="font-size:13px;font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c0 ? e(c0.user) : "sua_conta"}</span>${f.contas.length > 1 ? `<span style="font-size:11.5px;color:${CINZA}">+${f.contas.length - 1}</span>` : ""}<span style="font-size:11.5px;color:${MUTE}">${story ? "Story" : video ? "Reels" : "Feed"}</span></div>
              <div style="aspect-ratio:${story || video ? "9 / 16" : "4 / 5"};max-height:440px;width:100%;background:${url ? "#0F0F12" : "#F1F1F3"};display:flex;align-items:center;justify-content:center;font-size:12.5px;color:${MUTE};overflow:hidden">${url ? (video ? `<video src="${url}" controls muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:contain"></video>` : `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:${story ? "contain" : "cover"}">`) : "A mídia aparece aqui"}</div>
              ${story ? "" : `<div id="ig-prev-cap" style="padding:12px 14px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;max-height:130px;overflow:auto">${prevCap()}</div>`}
            </div>
            <div style="${CARD};padding:16px;display:flex;flex-direction:column;gap:12px">
              <div style="font-size:12.5px;font-weight:600">Quando</div>
              ${seg("data-ig-post-modo", [["agora", "Agora"], ["agendar", "Agendar"], ["rascunho", "Rascunho"]], f.modo)}
              ${f.modo === "agendar" ? `<input data-ig-post-quando data-keep="quando" type="datetime-local" value="${e(f.quando)}" title="Data e hora no horário de Brasília" style="${IN};border-color:#E0E0E5">` : ""}
              <div style="font-size:12px;color:${CINZA};line-height:1.5">${dica}</div>
              <button data-ig-post-salvar ${f.salvando || f.enviando ? "disabled" : ""} style="${BTN_TOP};height:40px;width:100%${f.salvando || f.enviando ? ";opacity:.6" : ""}">${botao}</button>
              ${f.id && f.editavel ? `<span data-ig-post-excluir style="align-self:center;font-size:12.5px;color:#B02E26;cursor:pointer">Excluir post</span>` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }
  async function enviarMidia(file){
    const g = G(), f = g.post; if(!f || !file) return;
    if(file.size > 100 * 1024 * 1024) return zAlert("Arquivo acima de 100 MB.");
    f.enviando = file.name + " (" + (file.size / 1048576).toFixed(1).replace(".", ",") + " MB)"; repaint();
    try { const fd = new FormData(); fd.append("file", file); const r = await zp("/upload", { method: "POST", form: fd }); f.media_path = r.path; f.media_type = String(r.mimetype || file.type).indexOf("video") === 0 ? "video" : "image"; cfgToast("Mídia enviada."); }
    catch(err){ falha("Falha no envio", err); }
    f.enviando = false; if(g.view === "compose" && g.post === f) repaint();
  }
  async function salvarPost(){
    const g = G(), f = g.post; if(!f || f.salvando) return;
    const story = f.destino === "story", video = postVideo();
    if(story && !f.media_path) return zAlert("Story precisa de uma imagem ou vídeo.");
    if(!story && !f.caption.trim()) return zAlert("Escreva a legenda.");
    if(!story && f.caption.length > CAPTION_MAX) return zAlert("A legenda passou de 2.200 caracteres.");
    if(f.modo !== "rascunho" && !f.contas.length) return zAlert("Selecione ao menos uma conta.");
    if(f.modo !== "rascunho" && !story && !f.media_path) return zAlert("O Instagram exige imagem ou vídeo para publicar.");
    if(f.modo === "agendar"){ if(!f.quando) return zAlert("Escolha a data e a hora."); if(naiveBRT(f.quando) < new Date()) return zAlert("Esse horário já passou (o horário é o de Brasília)."); }
    const nomes = contasNome(f.contas);
    if(f.modo === "agora" && !await zConfirm(`Vai ao ar imediatamente em ${nomes}. Confirma?`, { ok: "Publicar" })) return;
    const corpo = { title: f.title, caption: story ? "" : f.caption, media_path: f.media_path, media_type: f.media_type || "image", post_type: story ? "story" : postCarrossel() ? "carousel" : video ? "video" : "image", platforms: ["instagram"], account_ids: f.contas, scheduled_at: f.modo === "agendar" ? f.quando : null, status: f.modo === "agendar" ? "scheduled" : "draft" };
    f.salvando = true; repaint();
    try {
      let id = f.id && f.editavel ? f.id : null;
      if(id) await zp("/posts/" + id, { method: "PUT", body: corpo }); else id = (await zp("/posts", { method: "POST", body: corpo })).id;
      if(f.modo === "agora"){
        const r = await zp("/posts/" + id + "/publish", { method: "POST", body: {} });
        const falhou = (r.results || []).filter(x => x.status === "failed" || x.error);
        if(falhou.length){ f.salvando = false; zAlert("A Meta recusou: " + (falhou[0].error || falhou[0].error_message || "erro desconhecido") + ". O post ficou salvo para você corrigir."); recarregarAgenda(); return editarPost(id); }
        cfgToast("Publicado em " + nomes + ".");
      } else cfgToast(f.modo === "agendar" ? "Agendado para " + curta(f.quando) + " às " + f.quando.slice(11, 16) + "." : "Rascunho salvo.");
      if(f.modo === "agendar"){ g.cal.y = +f.quando.slice(0, 4); g.cal.m = +f.quando.slice(5, 7) - 1; }
      g.post = null; g.cal.evs = null; g.view = "calendario"; repaint(); loadCal(); loadResumo();
    } catch(err){ f.salvando = false; repaint(); falha("Não consegui salvar", err); }
  }

  // ─── Configuração: contas, campanhas em massa e geral ────────────────────────
  // Conectar conta, campanhas em massa e ajustes gerais seguem no painel de Posts, embutido aqui dentro.
  const CFGS = { contas: ["Contas", "Contas do Instagram conectadas ao ZEUS."], massa: ["Campanhas em massa", "Agende vários posts de uma vez a partir de uma planilha ou pasta."], geral: ["Geral", "Publicador, fuso horário e notificações."] };
  function quadroSrc(){
    const g = G(); if(g.view !== "config") return null;
    if(g.cfg === "massa") return "/posts/index.html" + postsHash("massa", g.massaId ? "id=" + encodeURIComponent(g.massaId) : "");
    if(g.cfg === "geral") return "/posts/index.html" + postsHash("config");
    if(g.cfg === "contas" && g.contasPainel) return "/posts/index.html" + postsHash("contas");
    return null;
  }
  function cfgNav(){
    const g = G(), r = g.resumo || {}, n = { contas: g.contas ? g.contas.length || "" : "", massa: r.campanhas_total || "", geral: "" };
    return Object.keys(CFGS).map(k => { const on = k === g.cfg; return `<div data-ig-cfg="${k}" ${on ? "" : "data-hover"} style="display:flex;align-items:center;padding:9px 12px;border-radius:9px;font-size:13.5px;cursor:pointer;background:${on ? TINT : "transparent"};color:${on ? ROXO_E : "#3C3C44"};font-weight:${on ? 600 : 400}"><span style="flex:1">${CFGS[k][0]}</span><span style="font-size:12px;color:${MUTE}">${n[k]}</span></div>`; }).join("");
  }
  function config(){
    const g = G(), src = quadroSrc(), cs = g.contas, u = tenantUser();
    const lateral = `<div id="ig-cfgnav" style="width:220px;flex:0 0 220px;border-right:1px solid #E6E6EA;background:#FFFFFF;padding:16px 12px;display:flex;flex-direction:column;gap:2px;overflow-y:auto">${cfgNav()}</div>`;
    if(src) return lateral + `<div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0">
        ${g.cfg === "contas" ? `<div style="display:flex;align-items:center;gap:12px;padding:10px 20px;background:#FFFFFF;border-bottom:1px solid #E6E6EA"><span data-ig-contas-voltar style="font-size:13px;color:${CINZA};cursor:pointer">‹ Voltar para as contas</span><span style="flex:1"></span><span style="font-size:12px;color:${MUTE}">Conexão e permissões das contas</span></div>` : ""}
        <iframe id="ig-posts-frame" data-k="${e(src)}" title="${CFGS[g.cfg][0]}" src="${e(src)}" style="flex:1;width:100%;border:0;background:#FAFAFA"></iframe>
      </div>`;
    const cartao = c => `<div style="${CARD};padding:18px;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="width:44px;height:44px;flex:0 0 44px;border-radius:50%;padding:2px;background:conic-gradient(from 210deg,#E8B04A,#C2342B,#B4316B,#E8B04A);display:flex;box-sizing:border-box">${contaAvatar(c, 40, true)}</span>
          <div style="flex:1;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">@${e(c.user)}</div><div style="font-size:12.5px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(c.nome || "")}</div></div>
          <span data-ig-conectar data-hover title="Gerenciar conexão" style="width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:${MUTE};cursor:pointer">⋯</span>
        </div>
        <div style="display:flex;align-items:baseline;gap:6px"><span style="${HEAD};font-size:24px;font-weight:600">${compact(c.seguidores)}</span><span style="font-size:12.5px;color:${CINZA}">seguidores</span></div>
        <div style="display:flex;align-items:center;gap:8px;padding-top:14px;border-top:1px solid #F0F0F2;font-size:12px">
          <span style="display:flex;align-items:center;gap:5px;color:${c.ativa ? "#1E7A4D" : AMBAR};font-weight:600"><span style="width:6px;height:6px;border-radius:50%;background:${c.ativa ? "#1E8E5A" : "#C2760A"}"></span>${c.ativa ? "Conectada" : "Reconectar"}</span>
          <span style="flex:1"></span>
          ${u && c.user === u ? `<span title="Os agentes de IA respondem as DMs desta conta" style="padding:2px 8px;border-radius:6px;background:#F6F6F7;color:#3C3C44">Direct</span>` : ""}<span style="padding:2px 8px;border-radius:6px;background:#F6F6F7;color:#3C3C44">Posts</span>
        </div>
      </div>`;
    return lateral + `<div data-scroll="cfg" style="flex:1;min-width:0;overflow-y:auto;padding:24px 28px 60px">
        <div style="max-width:880px">
          <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:18px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><div style="${HEAD};font-weight:600;font-size:19px">Contas</div><div style="font-size:13px;color:${CINZA};margin-top:3px">${CFGS.contas[1]}</div></div><button data-ig-conectar style="${BTN_TOP}">+ Conectar conta</button></div>
          ${!cs ? carregando("Carregando contas...") : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:12px">${cs.map(cartao).join("")}
            <div data-ig-conectar data-hover-border style="min-height:170px;border:1.5px dashed #DCDCE2;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:${CINZA};cursor:pointer"><span style="width:36px;height:36px;border-radius:50%;background:#F6F6F7;display:flex;align-items:center;justify-content:center;font-size:18px">+</span><span style="font-size:13px;font-weight:600">Conectar conta</span></div></div>`}
        </div>
      </div>`;
  }
  // o painel embutido avisa quando a pessoa navega por dentro dele; o que já é nativo aqui abre na aba certa
  window.addEventListener("message", ev => {
    if(ev.origin !== location.origin || !ev.data || !ev.data.zpRoute || state.screen !== "instagram") return;
    const g = G(), r = ev.data.zpRoute, fr = document.getElementById("ig-posts-frame"); if(g.view !== "config" || !fr) return;
    if(r === (g.cfg === "massa" ? "massa" : g.cfg === "geral" ? "config" : "contas")) return;
    let q = {}; try { q = Object.fromEntries(new URLSearchParams((fr.contentWindow.location.hash.split("?")[1]) || "")); } catch(err){}
    if(r === "calendario") ir("calendario");
    else if(r === "novo"){ if(q.id) editarPost(q.id); else novoPost({ date: q.date }); }
    else if(r === "analytics" || r === "dashboard") ir("desempenho");
    else if(r === "massa"){ g.cfg = "massa"; g.massaId = q.id || null; g.contasPainel = false; repaint(); }
    else if(r === "config"){ g.cfg = "geral"; g.contasPainel = false; repaint(); }
    else if(r === "contas"){ g.cfg = "contas"; g.contasPainel = true; repaint(); }
  });

  // ─── eventos ─────────────────────────────────────────────────────────────────
  function carregar(){
    const g = G(), v = g.view;
    if(v === "direct"){ loadThreads(); loadAgentes(); }
    if(v === "agentes") loadAgentes();
    if(v === "fluxos" && window.igFluxos) igFluxos.carregar();
    if(v === "calendario") loadCal();
    if(v === "desempenho"){ loadPerf(); if(!g.resumo) loadResumo(); }
    if(v === "config"){ loadContas(); loadResumo(); }
  }
  function ir(v){ const g = G(); g.view = v; g.erro = null; g.accMenu = false; if(v === "config"){ g.contasPainel = false; g.massaId = null; } repaint(); carregar(); }
  function repaint(so){
    const root = document.getElementById("ig-root"); if(!root || state.screen !== "instagram") return;
    const g = G(), pintaTopo = () => { const top = document.getElementById("ig-top"); if(top && !g.accMenu){ top.innerHTML = topo(); bind(top); } };
    if(so === "msgs"){ const box = document.getElementById("ig-msgs"); if(box){ const fim = box.scrollHeight - box.scrollTop - box.clientHeight < 80; box.innerHTML = msgsHTML(); if(fim) box.scrollTop = box.scrollHeight; } return; }
    if(so === "topo"){ pintaTopo(); return; }
    // só a lista de conversas e os contadores do topo (a conversa aberta e o que a pessoa digita ficam como estão)
    if(so === "lista"){ const box = document.getElementById("ig-lista"); if(box){ box.innerHTML = listaHTML(); bind(box); } pintaTopo(); return; }
    // com o painel de Posts embutido na tela, não recria o iframe à toa (ele recarregaria): só o topo e o menu lateral
    const src = quadroSrc(), fr = document.getElementById("ig-posts-frame");
    if(src && fr && fr.dataset.k === src){ const top = document.getElementById("ig-top"); if(top){ top.innerHTML = topo(); bind(top); } const nav = document.getElementById("ig-cfgnav"); if(nav){ nav.innerHTML = cfgNav(); bind(nav); } return; }
    const ativo = document.activeElement, keep = ativo && root.contains(ativo) && ativo.dataset && ativo.dataset.keep ? { k: ativo.dataset.keep, v: ativo.value, s: ativo.selectionStart } : null;
    const rolagem = {}; root.querySelectorAll("[data-scroll]").forEach(el => { rolagem[el.dataset.scroll] = [el.scrollTop, el.scrollLeft]; });
    const antes = document.getElementById("ig-msgs"), longeDoFim = antes && g.conv.msgs && antes.scrollHeight - antes.scrollTop - antes.clientHeight >= 80 ? antes.scrollTop : null;
    root.innerHTML = page(); bind(root);
    if(g.view === "fluxos" && window.igFluxos) igFluxos.montar(); // o construtor de fluxos liga os próprios eventos
    root.querySelectorAll("[data-scroll]").forEach(el => { const r = rolagem[el.dataset.scroll]; if(r){ el.scrollTop = r[0]; el.scrollLeft = r[1]; } });
    const box = document.getElementById("ig-msgs"); if(box) box.scrollTop = longeDoFim == null ? box.scrollHeight : longeDoFim;
    if(keep){ const el = root.querySelector(`[data-keep="${keep.k}"]`); if(el){ if(keep.k === "reply") el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch(err){} } }
    if(!g.modal && document.getElementById("ig-modal-host")) modalHost();
  }
  const acharEvento = id => { const g = G(), m = g.modal; return ((m && m.tipo === "dia" && m.lista) || []).concat(g.cal.evs || [], g.perf.evs || []).find(x => String(x.id) === String(id)) || null; };
  function bind(root){
    const q = sel => root.querySelectorAll(sel);
    const clique = (sel, fn) => q(sel).forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); fn(el, ev); }));
    clique("[data-ig-view]", el => ir(el.dataset.igView));
    // topo: seletor de conta e novo post
    clique("[data-ig-accmenu]", () => { const g = G(); g.accMenu = !g.accMenu; const top = document.getElementById("ig-top"); if(top){ top.innerHTML = topo(); bind(top); } });
    clique("[data-ig-conta-pick]", el => { const g = G(); g.conta = el.dataset.igContaPick; g.accMenu = false; g.cal.evs = null; g.perf.evs = null; repaint(); if(g.view === "calendario") loadCal(); if(g.view === "desempenho") loadPerf(); });
    clique("[data-ig-conectar]", () => { const g = G(); g.accMenu = false; g.view = "config"; g.cfg = "contas"; g.contasPainel = true; repaint(); });
    clique("[data-ig-contas-voltar]", () => { const g = G(); g.contasPainel = false; repaint(); loadContas(); });
    clique("[data-ig-novo-post]", () => novoPost());
    clique("[data-ig-cfg]", el => { const g = G(); g.cfg = el.dataset.igCfg; g.contasPainel = false; g.massaId = null; repaint(); if(g.cfg === "contas") loadContas(); });
    // agentes
    clique("[data-ig-novo]", () => abrirAgente(null));
    clique("[data-ig-editar]", el => abrirAgente(+el.dataset.igEditar, !!el.dataset.regras));
    q("[data-ig-toggle]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); ev.preventDefault(); alternarAgente(+el.dataset.igToggle); }));
    clique("[data-ig-apagar]", async el => { const id = +el.dataset.igApagar, a = (G().agentes || []).find(x => x.id === id); if(!await zConfirm(`Apagar o agente "${a ? a.name : ""}"? As regras dele somem. As conversas que ele atendia ficam sem agente.`, { ok: "Apagar", danger: true })) return; try { await api("/agents/" + id, { method: "DELETE" }); cfgToast("Agente apagado."); loadAgentes(); } catch(err){ falha("Não consegui apagar", err); } });
    // modais
    clique("[data-ig-fechar]", () => fecharModal());
    q("[data-ig-backdrop]").forEach(el => bindOnce(el, "click", ev => { if(ev.target === el){ ev.stopPropagation(); fecharModal(); } }));
    clique("[data-ig-salvar]", () => salvarAgente());
    q('[data-f="regra-tipo"]').forEach(el => bindOnce(el, "change", () => { sincronizar(); G().modal.regraTipo = el.value; modalHost(); }));
    clique("[data-ig-kb-modo]", el => { const m = G().modal; if(!m || !m.kb) return; sincronizar(); m.kb.modo = el.dataset.igKbModo; m.kb.mudou = true; modalHost(); });
    q("[data-ig-kb-pasta]").forEach(el => bindOnce(el, "change", () => { const m = G().modal; if(!m || !m.kb) return; const id = el.dataset.igKbPasta; m.kb.pastas = el.checked ? [...new Set(m.kb.pastas.concat(id))] : m.kb.pastas.filter(x => x !== id); m.kb.mudou = true; const r = document.querySelector("#ig-modal-host [data-ig-kb] span[style*='flex:1;min-width:200px']"); if(r) r.textContent = "Salve para aplicar a nova escolha de pastas."; }));
    q("[data-ig-kb-arquivos]").forEach(el => bindOnce(el, "change", () => { const f = el.files; const m = G().modal; if(m && m.id && f && f.length) kbEnviar(m, f); el.value = ""; }));
    clique("[data-ig-regra-add]", async () => { const m = G().modal; sincronizar(); const tipo = (root.querySelector('[data-f="regra-tipo"]') || {}).value || "keyword", valor = ((root.querySelector('[data-f="regra-valor"]') || {}).value || "").trim(), prio = parseInt((root.querySelector('[data-f="regra-prio"]') || {}).value, 10) || 0; if(tipo === "keyword" && !valor) return zAlert("Informe as palavras-chave, separadas por vírgula."); try { const j = await api(`/agents/${m.id}/rules`, { method: "POST", body: { rule_type: tipo, rule_value: tipo === "keyword" ? valor : "", priority: prio } }); m.regras.unshift(j.rule); m.regraTipo = tipo; modalHost(); } catch(err){ falha("Não consegui adicionar a regra", err); } });
    q('[data-f="regra-valor"]').forEach(el => bindOnce(el, "keydown", ev => { if(ev.key === "Enter"){ ev.preventDefault(); const b = root.querySelector("[data-ig-regra-add]"); if(b) b.click(); } }));
    clique("[data-ig-regra-del]", async el => { const m = G().modal, id = +el.dataset.igRegraDel; try { await api("/rules/" + id, { method: "DELETE" }); sincronizar(); m.regras = m.regras.filter(r => r.id !== id); modalHost(); } catch(err){ falha("Não consegui remover a regra", err); } });
    // direct
    clique("[data-ig-cf]", el => { G().conv.cf = el.dataset.igCf; repaint(); });
    clique("[data-ig-abrir]", el => abrirConversa(+el.dataset.igAbrir));
    clique("[data-ig-pausa]", async el => { const a = G().conv.aberta; if(!a) return; try { await api(`/threads/${a.id}/${el.dataset.igPausa}`, { method: "POST" }); cfgToast(el.dataset.igPausa === "pause" ? "IA pausada nesta conversa. Você assumiu." : "IA retomada nesta conversa."); await loadThread(a.id, false); loadThreads(); } catch(err){ falha("Não consegui", err); } });
    q("[data-ig-pausar-ao-enviar]").forEach(el => bindOnce(el, "change", () => { G().conv.pausarAoEnviar = el.checked; }));
    q("[data-ig-reply]").forEach(el => bindOnce(el, "submit", ev => { ev.preventDefault(); const ta = el.querySelector("[data-ig-reply-texto]"); const t = ta.value; ta.value = ""; ta.style.height = ""; responder(t); }));
    q("[data-ig-reply-texto]").forEach(el => { bindOnce(el, "keydown", ev => { if(ev.key === "Enter" && !ev.shiftKey){ ev.preventDefault(); el.form.requestSubmit(); } }); bindOnce(el, "input", () => { el.style.height = "auto"; el.style.height = Math.min(140, el.scrollHeight) + "px"; }); });
    // calendário e posts da agenda
    clique("[data-ig-cal-nav]", el => { const g = G(), c = g.cal, n = parseInt(el.dataset.igCalNav, 10), h = hojeBRT(), d = n === 0 ? new Date(+h.slice(0, 4), +h.slice(5, 7) - 1, 1) : new Date(c.y, c.m + n, 1); c.y = d.getFullYear(); c.m = d.getMonth(); c.evs = null; repaint(); loadCal(); });
    clique("[data-ig-cal-st]", el => { const c = G().cal; c.off[el.dataset.igCalSt] = !c.off[el.dataset.igCalSt]; repaint(); });
    clique("[data-ig-ev]", el => { const ev = acharEvento(el.dataset.igEv); if(ev) abrirEvento(ev); });
    clique("[data-ig-dia-mais]", el => { const k = el.dataset.igDiaMais, c = G().cal; abrirModal({ tipo: "dia", dia: k, lista: (c.evs || []).filter(ev => !c.off[stPost(ev.status)[3]] && diaBRT(ev.quando) === k).sort((a, b) => a.quando - b.quando) }); });
    clique("[data-ig-dia]", el => novoPost({ date: el.dataset.igDia }));
    clique("[data-ig-dia-novo]", el => { const d = el.dataset.igDiaNovo; fecharModal(); novoPost({ date: d }); });
    clique("[data-ig-ev-campanha]", el => { const g = G(); fecharModal(); g.view = "config"; g.cfg = "massa"; g.massaId = el.dataset.igEvCampanha; g.contasPainel = false; repaint(); });
    clique("[data-ig-item-salvar]", async () => {
      const m = G().modal; if(!m || !m.ev || m.ocupado) return; const ev = m.ev;
      const q = document.querySelector("#ig-modal-host [data-ig-item-quando]"), l = document.querySelector("#ig-modal-host [data-ig-item-legenda]");
      const body = {};
      if(q && q.value && q.value !== localDe(ev.quando)){ if(naiveBRT(q.value) < new Date()) return zAlert("Esse horário já passou (o horário é o de Brasília)."); body.scheduled_at = q.value; }
      if(l){ const v = l.value.trim(); if(v !== (ev.caption_propria ? ev.caption : "")) body.caption = v; if(v.length > CAPTION_MAX) return zAlert("A legenda passou de 2.200 caracteres."); }
      if(!Object.keys(body).length) return fecharModal();
      m.ocupado = true; modalHost();
      try { await zp(`/bulk/campaigns/${ev.campaign_id}/items/${ev.item_id}`, { method: "PATCH", body }); cfgToast("Post alterado."); fecharModal(); recarregarAgenda(); }
      catch(err){ m.ocupado = false; modalHost(); falha("Não consegui alterar o post", /Cannot PATCH|404/.test(err.message) ? new Error("o servidor de posts ainda não foi atualizado para aceitar alteração") : err); }
    });
    clique("[data-ig-item-remover]", async () => {
      const m = G().modal; if(!m || !m.ev || m.ocupado) return; const ev = m.ev;
      if(!await zConfirm("Remover este post da programação da campanha? Os outros posts da campanha continuam agendados.", { ok: "Remover", danger: true })) return;
      try { await zp(`/bulk/campaigns/${ev.campaign_id}/items/${ev.item_id}`, { method: "DELETE" }); cfgToast("Post removido da programação."); fecharModal(); recarregarAgenda(); }
      catch(err){ falha("Não consegui remover", err); }
    });
    clique("[data-ig-ev-editar]", () => { const m = G().modal; if(!m || !m.ev) return; const id = m.ev.post_id; fecharModal(); editarPost(id); });
    clique("[data-ig-ev-publicar]", () => { const m = G().modal; if(m && m.ev) publicarAgora(m.ev); });
    clique("[data-ig-ev-excluir]", async () => { const m = G().modal; if(!m || !m.ev) return; const ev = m.ev; if(!await zConfirm(ev.status === "published" ? "Excluir este post? Isso apaga o registro aqui no painel. O post já publicado continua no Instagram." : "Excluir este post? Ele sai da agenda e não será publicado.", { ok: "Excluir", danger: true })) return; try { await zp("/posts/" + ev.post_id, { method: "DELETE" }); cfgToast("Post excluído."); fecharModal(); recarregarAgenda(); } catch(err){ falha("Não consegui excluir", err); } });
    // desempenho
    clique("[data-ig-periodo]", el => { const p = G().perf; p.dias = +el.dataset.igPeriodo; p.evs = null; repaint(); loadPerf(); });
    clique("[data-ig-retry]", el => { const ev = acharEvento(el.dataset.igRetry); if(ev) publicarAgora(ev); });
    clique("[data-ig-coletar]", async () => { const p = G().perf; if(p.coletando) return; p.coletando = true; repaint(); try { await zp("/analytics/collect", { method: "POST", body: {} }); p.anEm = 0; cfgToast("Métricas atualizadas."); } catch(err){ falha("Não consegui atualizar as métricas", err); } p.coletando = false; loadPerf(); });
    // novo post
    clique("[data-ig-massa]", () => { const g = G(); g.view = "config"; g.cfg = "massa"; g.massaId = null; g.contasPainel = false; repaint(); });
    clique("[data-ig-post-destino]", el => { G().post.destino = el.dataset.igPostDestino; repaint(); });
    clique("[data-ig-post-modo]", el => { G().post.modo = el.dataset.igPostModo; repaint(); });
    clique("[data-ig-post-conta]", el => { const f = G().post, id = Number(el.dataset.igPostConta); f.contas = f.contas.includes(id) ? f.contas.filter(x => x !== id) : f.contas.concat(id); repaint(); });
    clique("[data-ig-post-tira]", () => { const f = G().post; f.media_path = ""; f.media_type = ""; repaint(); });
    clique("[data-ig-post-salvar]", () => salvarPost());
    clique("[data-ig-post-excluir]", async () => { const g = G(), f = g.post; if(!f || !f.id) return; if(!await zConfirm("Excluir este post? Ele sai da agenda e não será publicado.", { ok: "Excluir", danger: true })) return; try { await zp("/posts/" + f.id, { method: "DELETE" }); cfgToast("Post excluído."); g.post = null; g.cal.evs = null; g.view = "calendario"; repaint(); loadCal(); loadResumo(); } catch(err){ falha("Não consegui excluir", err); } });
    q("[data-ig-post-arquivo]").forEach(el => bindOnce(el, "change", () => { const f = el.files && el.files[0]; el.value = ""; enviarMidia(f); }));
    q("[data-ig-post-drop]").forEach(el => { bindOnce(el, "dragover", ev => { ev.preventDefault(); el.style.borderColor = ROXO; }); bindOnce(el, "dragleave", () => { el.style.borderColor = "#DCDCE2"; }); bindOnce(el, "drop", ev => { ev.preventDefault(); el.style.borderColor = "#DCDCE2"; const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if(f) enviarMidia(f); }); });
    q("[data-ig-post-caption]").forEach(el => bindOnce(el, "input", () => { G().post.caption = el.value; const n = document.getElementById("ig-cap-count"), p = document.getElementById("ig-prev-cap"); if(n) n.innerHTML = capCount(); if(p) p.innerHTML = prevCap(); }));
    q("[data-ig-post-title]").forEach(el => bindOnce(el, "input", () => { G().post.title = el.value; }));
    q("[data-ig-post-quando]").forEach(el => { const f = () => { G().post.quando = el.value; }; bindOnce(el, "change", f); bindOnce(el, "input", f); });
  }
  document.addEventListener("keydown", ev => { if(ev.key !== "Escape" || state.screen !== "instagram") return; const g = G(); if(g.modal) fecharModal(); else if(g.accMenu){ g.accMenu = false; repaint("topo"); } });
  // clique fora fecha o seletor de conta
  document.addEventListener("click", ev => { const g = state.ig; if(!g || !g.accMenu || state.screen !== "instagram") return; if(ev.target.closest && ev.target.closest("[data-ig-accbox]")) return; g.accMenu = false; const p = document.getElementById("ig-acc-pop"); if(p) p.remove(); }, true);

  // ─── plug na Central ────────────────────────────────────────────────────────
  RENDERERS.instagram = function(){
    if(typeof souAdmin === "function" && !souAdmin()) return `<div style="padding:34px 40px"><h1 style="${HEAD};font-size:25px;font-weight:600;margin:0 0 6px">Instagram</h1><p style="margin:0;color:${CINZA}">Só administradores da conta acessam o Instagram, porque ele controla os agentes que respondem as DMs.</p></div>`;
    const g = G();
    // vindo de Conectores (Instagram ou Facebook em destaque): abre direto nas contas, ou no painel de conexão com a Meta
    if(state.igAbrir){ g.view = "config"; g.cfg = "contas"; g.contasPainel = state.igAbrir === "conexao"; g.massaId = null; g.accMenu = false; delete state.igAbrir; }
    if(g.view === "compose" && !g.post) g.view = "calendario";
    setTimeout(() => {
      const root = document.getElementById("ig-root"); if(!root) return;
      bind(root); modalHost(); pollingOn(); sseOn();
      if(g.view === "fluxos" && window.igFluxos) igFluxos.montar();
      if(!g.contas) loadContas();
      if(!g.resumo) loadResumo();
      if(g.view !== "direct" && g.view !== "agentes" && !g.agentes) loadAgentes();
      if(g.view !== "direct" && !g.conv.lista) loadThreads();
      carregar();
    }, 0);
    return `<div id="ig-root">${page()}</div>`;
  };
  if(state.screen === "instagram"){ const slot = document.getElementById("main-slot"); if(slot){ slot.innerHTML = RENDERERS.instagram(); } }
})();
