// WhatsApp: tela /whatsapp. SDRs de pré-atendimento no WhatsApp por cima do motor jeff-sdrs, no layout novo:
// barra do topo com as abas (Conversas, Funil, Resultados, Configuração), seletor de SDR e novo lead.
// Carregado depois do script principal: usa state, icon, ICONS, e (escape), bindOnce, RENDERERS, zAlert, zConfirm,
// cfgToast, cfgSwitch e souAdmin de lá.
// Backend: /api/whatsapp/p/<caminho> repassa para a API do jeff-sdrs e /api/whatsapp/crm/<caminho> para o CRM (whatsapp-sdrs.js).
(function(){
  const ROXO = "#673DE6", VERDE = "#0F7A68", VERM = "#C0341C", AMBAR = "#9A6700", CINZA = "#66666F", AZUL = "#1D5FD1";
  // tons do layout novo, na família do roxo da Central: escuro para texto sobre o claro, claro para avatar e seleção
  const ROXO_E = "#5429C9", TINT = "#F0ECFD", SEL = "#F7F4FE", MUTE = "#9A9AA3", BOLHA = "#EFEAFD", BOLHA_B = "#DDD3FA";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const BOX = "border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;box-shadow:0 4px 18px rgba(23,23,26,0.04)";
  const IN = "width:100%;padding:10px 12px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none;box-sizing:border-box";
  const TA = IN + ";resize:vertical;min-height:88px;line-height:1.5";
  const LBL = "display:block;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#66666F;margin:0 0 6px";
  const HELP = "margin:6px 0 0;font-size:12px;color:#66666F;line-height:1.5";
  const BTN_PRI = "display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:9px;background:" + ROXO + ";color:#FFFFFF;font:inherit;font-size:12.5px;font-weight:700;border:0;cursor:pointer;white-space:nowrap";
  const BTN_SEC = "display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF;color:#17171A;cursor:pointer;white-space:nowrap";
  const BTN_MINI = "display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #DADADF;border-radius:8px;font:inherit;font-size:12px;background:#FFFFFF;color:#17171A;cursor:pointer;white-space:nowrap";
  const BTN_DANGER = BTN_SEC + ";color:" + VERM + ";border-color:rgba(192,52,28,0.35)";
  const CHIP = "display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11.5px;font-weight:600;white-space:nowrap";
  const SEG = (on) => `padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;${on ? "background:#FFFFFF;font-weight:600;box-shadow:0 1px 3px rgba(23,23,26,0.12)" : "color:#66666F"}`;
  const API = "/api/whatsapp/p";
  const STATUS = { ready: ["Conectado", VERDE], qr: ["Aguardando leitura", ROXO], connecting: ["Conectando...", AMBAR], idle: ["Desligado", CINZA], disconnected: ["Desconectado", VERM] };
  const MODELOS = { anthropic: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"], openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"], gemini: ["gemini-2.0-flash-exp", "gemini-1.5-pro"] };
  const PROVEDORES = [["anthropic", "Anthropic"], ["openai", "OpenAI"], ["gemini", "Gemini"]];
  const ERROS = { unauthenticated: "A sessão com o sistema de SDRs expirou. Recarregue a página.", forbidden: "Sem permissão para isso.", slot_not_found: "Esse SDR não existe.", sem_mensagem_disparo: "Cadastre pelo menos uma mensagem de disparo em Configurações > Disparo antes de iniciar.", master_slot_invalido: "O SDR principal escolhido não vale (não pode ser ele mesmo).", lista_vazia: "Nenhum contato na lista.", sem_contatos: "Não achei contatos válidos.", sheet_read_failed: "Não consegui ler a planilha. Confira o link e se está compartilhada com qualquer pessoa com o link.", arquivo_ausente: "Nenhum arquivo enviado.", extensao_invalida: "Só aceito planilhas .xlsx ou .xls.", planilha_vazia: "A planilha está vazia.", xlsx_parse_fail: "Não consegui ler essa planilha.", arquivo_muito_grande: "Arquivo grande demais (limite 64 MB).", tipo_nao_suportado: "Esse tipo de arquivo não é aceito.", mime_nao_imagem: "Esse arquivo não é uma imagem.", em_uso: "Essa chave está em uso por algum SDR. Troque a chave deles antes de excluir.", chave_invalida: "Essa chave parece incompleta.", provider_invalido: "Provedor inválido.", missing_phone: "Informe o número.", phone_invalid: "Número inválido. Use DDI + DDD + número, só dígitos (ex.: 5511999999999).", payload_too_large: "Lista grande demais. Divida em partes menores.", not_found: "Não encontrado.", reset_failed: "Não consegui resetar a memória." };
  const MOTIVOS = { invalid_format: "formato inválido", ambiguous_no_ddi: "sem DDI (precisa começar com 55)", too_short: "número curto", too_long: "número longo", empty: "vazio", dedupe_batch: "repetido na própria lista", dedupe_pending_or_sent: "já está na fila ou já recebeu" };

  // Estado próprio desta tela. Não pode ser state.wa: esse é do conector de WhatsApp (/waConnector) e tem outro formato.
  function W(){
    if(!state.waSdr) state.waSdr = { view: "conversas", sdrs: null, loading: false, error: null, todos: false, modal: null, busy: {}, sdrFiltro: "", sdrMenu: false, detalhes: null,
      conv: { lista: null, cf: "todas", busca: "", aberta: null, msgs: null, enviando: false, erro: null },
      mat: null, log: null, keys: null, keysErro: null,
      crm: { leads: null, stages: null, erro: null, busca: "", tags: null, tagsErro: null, stats: null, arrasto: null } };
    return state.waSdr;
  }
  async function api(p, opts){
    opts = opts || {};
    const init = { method: opts.method || "GET" };
    if(opts.form){ init.body = opts.form; }
    else if(opts.body !== undefined){ init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(opts.body); }
    const r = await fetch((opts.base || API) + p, init);
    const j = await r.json().catch(() => ({}));
    if(!r.ok){
      const codigo = j.error || ("HTTP " + r.status);
      let msg = ERROS[codigo] || j.msg || codigo;
      if(j.detail && !ERROS[codigo]) msg += " (" + j.detail + ")";
      if(/not ready/.test(codigo)) msg = "O chip desse SDR não está conectado.";
      const err = new Error(msg); err.codigo = codigo; err.dados = j; throw err;
    }
    return j;
  }
  const crmApi = (p, opts) => api(p, Object.assign({ base: "/api/whatsapp/crm" }, opts || {}));
  const falha = (prefixo, err) => zAlert(prefixo + ": " + (err && err.message ? err.message : err));
  const fmtFone = p => { const d = String(p || "").replace(/\D/g, ""); if(!d) return ""; if(d.length === 13 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`; if(d.length === 12 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`; return "+" + d; };
  const BRT = { timeZone: "America/Sao_Paulo" };
  const hora = d => new Date(d).toLocaleTimeString("pt-BR", Object.assign({ hour: "2-digit", minute: "2-digit" }, BRT));
  const dataHora = d => new Date(d).toLocaleString("pt-BR", Object.assign({ day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }, BRT));
  const diaOuHora = d => { const x = new Date(d); return x.toDateString() === new Date().toDateString() ? hora(x) : x.toLocaleDateString("pt-BR", Object.assign({ day: "2-digit", month: "2-digit" }, BRT)); };
  const utcSql = s => new Date(String(s).replace(" ", "T") + "Z");
  const nomeSlot = s => (s && s.name) ? s.name : "SDR " + (s ? s.slot : "");
  const configurado = s => !!(s.name || s.phone || s.zeus_mode || (s.status && s.status !== "idle") || s.instructions || s.upload_pending || s.upload_sent);
  const porSlot = n => (W().sdrs || []).find(s => s.slot === n);

  // ─── carga e polling ─────────────────────────────────────────────────────────
  async function loadSdrs(silencioso){
    const w = W(); if(!silencioso){ w.loading = true; repaint(); }
    try { w.sdrs = (await api("/sdrs")).sdrs; w.error = null; } catch(err){ w.error = err.message; }
    w.loading = false; repaint();
  }
  async function loadConv(silencioso){
    const w = W(), c = w.conv;
    try {
      const j = await api("/conversations" + (w.sdrFiltro ? "?slot=" + encodeURIComponent(w.sdrFiltro) : "") + (w.sdrFiltro ? "&" : "?") + "limit=300");
      c.lista = j.conversations; c.erro = null;
      if(c.aberta){ const ainda = c.lista.find(x => x.slot === c.aberta.slot && x.chat_id === c.aberta.chat_id); if(ainda) c.aberta = Object.assign({}, c.aberta, ainda, { unread: 0 }); }
    } catch(err){ c.erro = err.message; }
    if(c.aberta){ await loadMsgs(true); repaint("lista"); } else repaint();
  }
  async function loadMsgs(silencioso){
    const c = W().conv, a = c.aberta; if(!a) return;
    try { const j = await api("/conversations/messages?slot=" + a.slot + "&chat_id=" + encodeURIComponent(a.chat_id) + "&limit=300"); if(c.aberta === a || (c.aberta && c.aberta.chat_id === a.chat_id)) c.msgs = j.messages; }
    catch(err){ c.erro = err.message; }
    repaint(silencioso ? "msgs" : null);
  }
  async function loadMat(){
    const w = W();
    try { const [cfg, log] = await Promise.all([api("/maturation/config"), api("/maturation/log")]); w.mat = cfg; w.log = log.log; w.error = null; } catch(err){ w.error = err.message; }
    repaint();
  }
  async function loadKeys(){
    const w = W();
    try { w.keys = (await api("/system/keys")).keys; w.keysErro = null; } catch(err){ w.keysErro = err.message; }
    repaint();
  }
  let _tick = null, _n = 0;
  function pollingOn(){
    if(_tick) return;
    _tick = setInterval(async () => {
      if(state.screen !== "whatsapp"){ if(W().modal){ W().modal = null; modalHost(); } return; }
      if(document.visibilityState === "hidden") return;
      const w = W(); _n++;
      // modais com vida própria
      if(w.modal && w.modal.tipo === "conectar"){ await conectarRefresh(); }
      if(w.modal && w.modal.tipo === "config" && w.modal.aba === "contatos" && _n % 2 === 0){ await jobsRefresh(); }
      // com conversa aberta só a lista e as mensagens são repintadas, então dá para atualizar enquanto a pessoa digita
      const foco = document.activeElement && document.activeElement.closest && document.activeElement.closest("#wa-root input, #wa-root textarea, #wa-root select");
      const conversando = w.view === "conversas" && !!w.conv.aberta;
      if(foco && !conversando) return;
      if(w.view === "sdrs") await loadSdrs(true);
      else if(w.view === "conversas"){ await loadConv(true); if(_n % 10 === 0 && !foco && !w.sdrMenu) loadSdrs(true); }
      else if(w.view === "maturacao" && _n % 2 === 0) { await loadSdrs(true); await loadMat(); }
      else if(w.view === "leads" && _n % 10 === 0 && !w.crm.arrasto) await loadLeads(true);
      else if(w.view === "estatisticas" && _n % 10 === 0) await loadStats();
    }, 3000);
  }

  // ─── layout: barra do topo (abas, seletor de SDR, novo lead) + área da aba ────
  const CFG = {
    sdrs: ["SDRs", "Agentes de pré-atendimento. Cada um usa um chip (ou o ZEUS), instruções e uma lista de contatos ou palavras-gatilho."],
    maturacao: ["Maturar chips", "Aquecimento entre chips conectados: eles trocam mensagens casuais entre si para o número ganhar histórico antes de atender de verdade."],
    tags: ["Tags de IA", "Etiquetas que a IA aplica nas conversas. A instrução é o critério para marcar. Se o nome da tag for igual a uma etapa do funil, o lead é movido para ela."],
    chaves: ["Chaves de IA", "Chaves dos provedores (Anthropic, OpenAI, Gemini) que os SDRs usam para responder. Cada SDR escolhe a sua em Configurações › Conversa."]
  };
  const ehCfg = v => !!CFG[v];
  const BTN_TOP = "height:36px;padding:0 14px;border:none;border-radius:9px;background:" + ROXO + ";color:#FFFFFF;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px";
  const BTN_ROW = "height:32px;padding:0 12px;border:1px solid #E0E0E5;border-radius:8px;background:#FFFFFF;color:#17171A;font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px";
  const CHEV = '<path d="M6 9l6 6 6-6"/>';
  const sdrIni = s => iniciais(nomeSlot(s));
  const corStatus = st => st === "ready" ? "#1E8E5A" : st === "disconnected" ? "#C2342B" : (st === "qr" || st === "connecting") ? "#C2760A" : "#B8B8C0";
  const subStatus = s => s.zeus_mode ? "Atendendo pelo ZEUS" : s.status === "ready" ? (s.phone ? fmtFone(s.phone) : "Conectado") : s.status === "disconnected" ? "Desconectado" : s.status === "qr" ? "Aguardando leitura do QR" : s.status === "connecting" ? "Conectando..." : "Sem chip conectado";
  function page(){
    return `<div style="height:100vh;display:flex;flex-direction:column;min-width:0">
      <div id="wa-top">${topo()}</div>
      <div id="wa-main" style="flex:1;min-height:0;display:flex;background:#F6F6F7">${main()}</div>
    </div>`;
  }
  function topo(){
    const w = W(), lista = (w.sdrs || []).filter(configurado), f = w.sdrFiltro ? porSlot(+w.sdrFiltro) : null;
    const naoLidas = (w.conv.lista || []).filter(c => c.unread).length, nLeads = w.crm.leads ? leadsSdr().length : 0;
    const atual = ehCfg(w.view) ? "config" : w.view;
    const aba = (id, rot, n) => { const on = atual === id; return `<span data-wa-view="${id === "config" ? (ehCfg(w.view) ? w.view : "sdrs") : id}" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-size:13px;white-space:nowrap;cursor:pointer;font-weight:${on ? 600 : 400};color:${on ? "#17171A" : CINZA};background:${on ? "#FFFFFF" : "transparent"};box-shadow:${on ? "0 1px 2px rgba(0,0,0,.08)" : "none"}">${rot}${n ? `<span style="font-size:10.5px;font-weight:600;padding:0 6px;border-radius:8px;background:${on ? TINT : "#E9E9EC"};color:${on ? ROXO_E : CINZA}">${n}</span>` : ""}</span>`; };
    const opc = (id, rot, sub, ini, dot, subCor) => { const on = String(w.sdrFiltro) === String(id); return `<div data-wa-sdr-pick="${id}" data-hover style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;background:${on ? SEL : "transparent"}">
        <span style="position:relative;width:30px;height:30px;flex:0 0 30px;border-radius:50%;background:${id === "" ? "#F1F1F3" : TINT};color:${ROXO_E};font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${ini}${dot ? `<span style="position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;border:2px solid #FFFFFF;background:${dot}"></span>` : ""}</span>
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${rot}</div><div style="font-size:11.5px;color:${subCor || CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div></div>
        <span style="font-size:13px;color:${ROXO};font-weight:700">${on ? "✓" : ""}</span></div>`; };
    const pilha = f ? [f] : lista.slice(0, 3), ativos = lista.filter(s => s.ai_active).length;
    return `<div style="display:flex;align-items:center;gap:16px;padding:14px 24px;background:#FFFFFF;border-bottom:1px solid #E6E6EA;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:10px"><span style="width:32px;height:32px;border-radius:9px;background:#E8F5EE;color:#1E7A4D;display:flex;align-items:center;justify-content:center">${icon(ICONS.whatsapp, 18, "currentColor")}</span><span style="${HEAD};font-size:17px;font-weight:600">WhatsApp</span></div>
      <div style="display:flex;gap:2px;padding:3px;background:#F1F1F3;border-radius:10px;overflow-x:auto;scrollbar-width:none;max-width:100%">${aba("conversas", "Conversas", naoLidas)}${aba("leads", "Funil", nLeads)}${aba("estatisticas", "Resultados", "")}${aba("config", "Configuração", "")}</div>
      <span style="flex:1"></span>
      <div data-wa-sdrbox style="position:relative">
        <div data-wa-sdrmenu title="Filtrar conversas e funil por SDR" style="display:flex;align-items:center;gap:10px;height:36px;padding:0 10px 0 6px;border:1px solid ${w.sdrMenu ? "#CFCFD6" : "#E0E0E5"};border-radius:10px;background:#FFFFFF;cursor:pointer">
          <span style="display:flex">${pilha.map((s, k) => `<span style="width:24px;height:24px;margin-left:${k ? "-6px" : "0"};border-radius:50%;border:2px solid #FFFFFF;background:${TINT};color:${ROXO_E};font-size:8.5px;letter-spacing:-0.02em;font-weight:700;display:flex;align-items:center;justify-content:center">${e(sdrIni(s))}</span>`).join("")}</span>
          <span style="font-size:13px;font-weight:500;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis">${f ? e(nomeSlot(f)) : "Todos os SDRs"}</span>
          ${icon(CHEV, 12, MUTE)}
        </div>
        ${w.sdrMenu ? `<div id="wa-sdr-pop" class="pop-down" style="position:absolute;top:42px;right:0;z-index:50;width:290px;max-height:60vh;overflow-y:auto;background:#FFFFFF;border:1px solid #E6E6EA;border-radius:12px;box-shadow:0 12px 32px rgba(20,20,30,.12);padding:6px">
          ${opc("", "Todos os SDRs", w.sdrs ? `${lista.length} SDR${lista.length === 1 ? "" : "s"} · ${ativos} com agente ativo` : "Carregando...", "∗", null)}
          ${lista.map(s => opc(s.slot, e(nomeSlot(s)), e(subStatus(s)), e(sdrIni(s)), corStatus(s.status || "idle"), s.status === "disconnected" ? "#B02E26" : null)).join("")}
          <div style="height:1px;background:#EEEEF1;margin:6px 4px"></div>
          <div data-wa-novo data-hover style="padding:8px 10px;border-radius:8px;font-size:13px;color:${ROXO_E};font-weight:600;cursor:pointer">+ Novo SDR</div>
        </div>` : ""}
      </div>
      <button data-wa-lead-novo style="${BTN_TOP}">+ Novo lead</button>
    </div>`;
  }
  function main(){
    const w = W();
    if(w.view === "leads") return leads();
    if(w.view === "estatisticas") return estatisticas();
    if(ehCfg(w.view)) return config();
    return conversas();
  }
  const vazio = (t, sub) => `<div style="padding:48px 24px;text-align:center;background:#FFFFFF;border:1px dashed #DCDCE2;border-radius:14px;font-size:13.5px;color:${CINZA}"><div style="font-weight:600;color:#17171A;margin-bottom:4px">${t}</div>${sub || ""}</div>`;
  const erroFaixa = msg => `<div style="margin-bottom:14px;padding:10px 14px;border:1px solid rgba(192,52,28,0.3);border-radius:10px;background:rgba(192,52,28,0.05);font-size:12.5px;color:${VERM}">${e(msg)}</div>`;

  // ─── Configuração: SDRs, maturação, tags e chaves, com o menu à esquerda ─────
  function config(){
    const w = W(), v = w.view, d = CFG[v], lista = w.sdrs || [];
    const conta = { sdrs: lista.filter(configurado).length || "", maturacao: "", tags: w.crm.tags ? w.crm.tags.length || "" : "", chaves: w.keys ? w.keys.length || "" : "" };
    const acaoBtn = { sdrs: `<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:${CINZA};cursor:pointer">${cfgSwitch(w.todos, 'data-wa-todos')}Mostrar os 16 slots</label><button data-wa-novo style="${BTN_TOP}">+ Novo SDR</button>`, maturacao: "", tags: `<button data-wa-tag-nova style="${BTN_TOP}">+ Nova tag</button>`, chaves: `<button data-wa-chave-nova style="${BTN_TOP}">+ Adicionar chave</button>` }[v];
    const corpo = v === "maturacao" ? maturacao() : v === "tags" ? tags() : v === "chaves" ? chaves() : sdrs();
    return `<div style="width:220px;flex:0 0 220px;border-right:1px solid #E6E6EA;background:#FFFFFF;padding:16px 12px;display:flex;flex-direction:column;gap:2px;overflow-y:auto">
        ${Object.keys(CFG).map(k => { const on = k === v; return `<div data-wa-view="${k}" ${on ? "" : "data-hover"} style="display:flex;align-items:center;padding:9px 12px;border-radius:9px;font-size:13.5px;cursor:pointer;background:${on ? TINT : "transparent"};color:${on ? ROXO_E : "#3C3C44"};font-weight:${on ? 600 : 400}"><span style="flex:1">${CFG[k][0]}</span><span style="font-size:12px;color:${MUTE}">${conta[k]}</span></div>`; }).join("")}
      </div>
      <div data-scroll="cfg" style="flex:1;min-width:0;overflow-y:auto;padding:24px 28px 60px">
        <div style="max-width:${v === "maturacao" ? 980 : 900}px">
          <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:18px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><div style="${HEAD};font-weight:600;font-size:19px">${d[0]}</div><div style="font-size:13px;color:${CINZA};margin-top:3px;line-height:1.5">${d[1]}</div></div>${acaoBtn}</div>
          ${corpo}
        </div>
      </div>`;
  }
  function sdrs(){
    const w = W(), lista = w.sdrs;
    if(!lista) return w.error ? vazio("Não consegui falar com o sistema de SDRs", e(w.error)) : `<div style="color:${CINZA};font-size:13px;padding:10px 0">Carregando SDRs...</div>`;
    const vis = lista.filter(s => w.todos || configurado(s));
    return (w.error ? erroFaixa(w.error) : "") + (vis.length ? `<div style="background:#FFFFFF;border:1px solid #E6E6EA;border-radius:14px;overflow:hidden">${vis.map(card).join("")}</div>`
      : vazio("Nenhum SDR configurado ainda", `Clique em <strong>Novo SDR</strong> para dar nome ao primeiro e conectar um chip de WhatsApp ou ativar com o ZEUS.`));
  }
  // Uma linha por SDR: quem é, como está, disparo, e as ações (instruções, chip, configurações, ligar/pausar o agente)
  function card(s){
    const st = s.status || "idle", busy = W().busy[s.slot];
    const ligado = ["ready", "qr", "connecting"].includes(st);
    const b = (attr, label, pri) => `<button data-wa-act="${attr}" data-slot="${s.slot}" style="${BTN_ROW}${pri ? ";background:" + ROXO + ";border-color:" + ROXO + ";color:#FFFFFF" : ""}${busy ? ";opacity:.5;pointer-events:none" : ""}">${label}</button>`;
    let conexao;
    if(s.zeus_mode) conexao = b("zeus-off", "Desativar ZEUS") + (ligado ? b("desconectar", "Desconectar chip") : b("conectar", "Conectar chip"));
    else if(st === "idle" || st === "disconnected") conexao = b("conectar", "Conectar chip") + b("ativar", "Usar o ZEUS");
    else if(st === "connecting") conexao = b("desconectar", "Cancelar conexão");
    else if(st === "qr") conexao = b("conectar", "Ver QR / código", true) + b("desconectar", "Cancelar");
    else conexao = b("desconectar", "Desconectar chip");
    const pend = s.upload_pending || 0, sent = s.upload_sent || 0, errs = s.upload_error || 0, rodando = !!s.dispatch_running, ativo = s.sdr_mode === "ativo";
    let disp, dispBtn;
    if(ativo){
      disp = `${rodando ? `<strong style="color:#1E7A4D">Disparando</strong>` : "Disparo parado"} · ${sent} enviado${sent === 1 ? "" : "s"} · ${pend} na fila${errs ? ` · <span style="color:#B02E26">${errs} erro${errs === 1 ? "" : "s"}</span>` : ""}`;
      dispBtn = rodando ? b("pausar", "Pausar disparo") : pend ? b("iniciar", "Iniciar disparo") : (sent + errs) ? b("reiniciar", "Reiniciar fila") : `<span title="Sem contatos na fila. Adicione em Configurações > Contatos." style="${BTN_ROW};opacity:.5;cursor:default">Iniciar disparo</span>`;
    } else {
      disp = rodando ? `<strong style="color:#1E7A4D">Atendendo</strong> · responde quando a palavra-gatilho chegar` : "Pausado · não responde a gatilhos";
      dispBtn = rodando ? b("pausar", "Pausar atendimento") : b("iniciar", "Iniciar atendimento");
    }
    return `<div style="display:flex;align-items:center;gap:8px 14px;padding:14px 18px;border-bottom:1px solid #F2F2F4;flex-wrap:wrap">
      <span style="position:relative;width:38px;height:38px;flex:0 0 38px;border-radius:50%;background:${TINT};color:${ROXO_E};font-weight:700;font-size:12.5px;display:flex;align-items:center;justify-content:center">${e(sdrIni(s))}<span title="${(STATUS[st] || [st])[0]}" style="position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;border-radius:50%;border:2px solid #FFFFFF;background:${corStatus(st)};${st === "connecting" || st === "qr" ? "animation:tmPulse 1.2s ease-in-out infinite" : ""}"></span></span>
      <div style="flex:1 1 220px;min-width:0">
        <div style="display:flex;align-items:center;gap:4px"><span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(nomeSlot(s))}</span><span data-wa-act="renomear" data-slot="${s.slot}" data-hover title="Editar nome e cargo" style="width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 24px">${icon(ICONS.edit, 12, MUTE)}</span></div>
        <div style="font-size:12.5px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ativo ? "Ativo" : "Receptivo"} · ${st === "disconnected" ? `<span style="color:#B02E26">desconectado</span>` : e(subStatus(s)).replace(/^[A-Z]/, x => x.toLowerCase())} · slot ${s.slot}${s.role_label ? " · " + e(s.role_label) : ""}</div>
        <div style="font-size:12px;color:${MUTE};margin-top:2px">${disp}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${dispBtn}${b("instrucoes", "Instruções" + (s.instructions ? " ✓" : ""))}${conexao}${b("config", "Configurações")}
        <span title="Agente ${s.ai_active ? "ativo" : "pausado"}: liga ou pausa as respostas deste SDR" style="display:flex;align-items:center;margin-left:4px">${cfgSwitch(!!s.ai_active, `data-wa-act="toggle" data-slot="${s.slot}"`)}</span></div>
    </div>`;
  }
  async function acao(act, slot){
    const w = W(), s = porSlot(slot); if(!s && act !== "novo") return;
    const ocupado = async fn => { w.busy[slot] = true; repaint(); try { await fn(); } finally { w.busy[slot] = false; } await loadSdrs(true); };
    try {
      if(act === "toggle") return ocupado(() => api(`/sdrs/${slot}/toggle-active`, { method: "POST" }));
      if(act === "renomear") return abrirModal({ tipo: "nome", slot });
      if(act === "conectar"){ if(s.zeus_mode){ if(!await zConfirm(`Vou desativar o ZEUS em "${nomeSlot(s)}" e abrir o pareamento do chip. Confirma?`)) return; await api(`/sdrs/${slot}/zeus-mode`, { method: "POST", body: { enabled: false } }); } return abrirConectar(slot); }
      if(act === "ativar") return abrirModal({ tipo: "ativar", slot });
      if(act === "zeus-off"){ if(!await zConfirm(`Desativar o ZEUS em "${nomeSlot(s)}"?`)) return; return ocupado(() => api(`/sdrs/${slot}/zeus-mode`, { method: "POST", body: { enabled: false } })); }
      if(act === "desconectar"){ if(s.status === "ready" && !await zConfirm(`Desconectar o WhatsApp de "${nomeSlot(s)}"? O chip sai de "Aparelhos conectados" no celular e vai precisar parear de novo.`, { ok: "Desconectar" })) return; return ocupado(() => api(`/sdrs/${slot}/disconnect`, { method: "POST" })); }
      if(act === "iniciar") return ocupado(async () => { await api(`/sdrs/${slot}/dispatch/start`, { method: "POST" }); cfgToast(s.sdr_mode === "ativo" ? "Disparos iniciados." : "Atendimento iniciado."); });
      if(act === "pausar"){ if(!await zConfirm(`Pausar o atendimento de "${nomeSlot(s)}"? A fila fica salva e você retoma quando quiser.`, { ok: "Pausar" })) return; return ocupado(() => api(`/sdrs/${slot}/dispatch/pause`, { method: "POST" })); }
      if(act === "reiniciar"){ const n = (s.upload_sent || 0) + (s.upload_error || 0); if(!await zConfirm(`Reiniciar a fila de "${nomeSlot(s)}"? A mensagem inicial vai ser enviada de novo para ${n} contato${n === 1 ? "" : "s"} que já receberam ou deram erro.`, { ok: "Reiniciar" })) return; return ocupado(async () => { await api(`/sdrs/${slot}/dispatch/reset-queue`, { method: "POST" }); await api(`/sdrs/${slot}/dispatch/start`, { method: "POST" }); }); }
      if(act === "instrucoes") return abrirInstrucoes(slot);
      if(act === "config") return abrirConfig(slot);
    } catch(err){ w.busy[slot] = false; falha("Não consegui concluir", err); loadSdrs(true); }
  }
  function novoSdr(){
    const lista = W().sdrs || []; const livre = lista.find(s => !configurado(s));
    if(!livre) return zAlert("Os 16 slots já estão em uso. Reaproveite um SDR existente ou limpe um que não usa mais.");
    abrirModal({ tipo: "nome", slot: livre.slot, novo: true });
  }

  // ─── modais ──────────────────────────────────────────────────────────────────
  function abrirModal(m){ W().modal = m; modalHost(); }
  function fecharModal(){ const m = W().modal; W().modal = null; modalHost(); if(m && (m.tipo === "conectar" || m.tipo === "config")) loadSdrs(true); }
  function modalHost(){
    let host = document.getElementById("wa-modal-host");
    const m = W().modal;
    if(!m || state.screen !== "whatsapp"){ if(host) host.remove(); document.body.style.overflow = ""; return; }
    if(!host){ host = document.createElement("div"); host.id = "wa-modal-host"; document.body.appendChild(host); }
    document.body.style.overflow = "hidden";
    host.innerHTML = modal(m); bind(host);
    const foco = host.querySelector("[autofocus]"); if(foco) foco.focus();
  }
  function shell(m, titulo, sub, corpo, rodape, largura){
    return `<div data-wa-backdrop style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(23,23,26,0.32)">
      <div class="pop-down" style="width:100%;max-width:${largura || 560}px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;border-radius:18px;background:#FFFFFF;box-shadow:0 30px 80px rgba(23,23,26,0.25);overflow:hidden">
        <div style="display:flex;align-items:flex-start;gap:12px;padding:20px 22px 14px;border-bottom:1px solid #E6E6EA">
          <div style="flex:1;min-width:0"><div style="${HEAD};font-size:18px;font-weight:600">${titulo}</div>${sub ? `<div style="font-size:12.5px;color:${CINZA};margin-top:4px;line-height:1.5">${sub}</div>` : ""}</div>
          <span data-wa-fechar data-hover title="Fechar" style="width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 32px">${icon(ICONS.x, 16, CINZA)}</span>
        </div>
        <div id="wa-modal-body" style="padding:18px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:16px">${corpo}</div>
        ${rodape ? `<div style="display:flex;align-items:center;gap:10px;padding:14px 22px;border-top:1px solid #E6E6EA;flex-wrap:wrap">${rodape}</div>` : ""}
      </div></div>`;
  }
  const cancelar = `<span data-wa-fechar style="${BTN_SEC}">Cancelar</span>`;
  function modal(m){
    const s = porSlot(m.slot) || { slot: m.slot };
    if(m.tipo === "nome") return shell(m, m.novo ? "Novo SDR" : "Nome e cargo", m.novo ? `Vai usar o slot ${m.slot}. Depois você conecta um chip ou ativa com o ZEUS.` : "", `
      <div><label style="${LBL}">Nome do SDR</label><input data-f="name" autofocus value="${e(s.name || "")}" placeholder="Ex.: Ana, pré-vendas" maxlength="60" style="${IN}"></div>
      <div><label style="${LBL}">Cargo ou função</label><input data-f="role_label" value="${e(s.role_label || "")}" placeholder="Ex.: Pré-vendas do Congresso" maxlength="60" style="${IN}"></div>`,
      `<span style="flex:1"></span>${cancelar}<span data-wa-salvar-nome style="${BTN_PRI}">${m.novo ? "Criar SDR" : "Salvar"}</span>`);
    if(m.tipo === "ativar") return shell(m, `Ativar "${e(nomeSlot(s))}"`, "Escolha quem vai atender por esse SDR.", `
      <div data-wa-ativar="zeus" data-hover-border style="display:flex;gap:14px;padding:16px;border:1px solid #E6E6EA;border-radius:14px;cursor:pointer"><span style="width:38px;height:38px;flex:0 0 38px;border-radius:10px;background:rgba(103,61,230,0.12);display:flex;align-items:center;justify-content:center">${icon(ICONS.bolt, 18, "none", ROXO)}</span><div><div style="font-weight:600;font-size:13.5px;margin-bottom:4px">Usar o ZEUS nesse atendimento</div><div style="font-size:12.5px;color:${CINZA};line-height:1.5">O ZEUS assume a personalidade das instruções deste SDR e responde pelo número principal quando o gatilho bater. Não precisa de chip.</div></div></div>
      <div data-wa-ativar="chip" data-hover-border style="display:flex;gap:14px;padding:16px;border:1px solid #E6E6EA;border-radius:14px;cursor:pointer"><span style="width:38px;height:38px;flex:0 0 38px;border-radius:10px;background:rgba(15,122,104,0.12);display:flex;align-items:center;justify-content:center">${icon(ICONS.whatsapp, 18, VERDE)}</span><div><div style="font-weight:600;font-size:13.5px;margin-bottom:4px">Usar um chip próprio</div><div style="font-size:12.5px;color:${CINZA};line-height:1.5">Parear um número dedicado por QR code ou código de 8 dígitos. O SDR responde pelo próprio número.</div></div></div>`, "");
    if(m.tipo === "conectar") return modalConectar(m, s);
    if(m.tipo === "instrucoes") return shell(m, `Instruções de "${e(nomeSlot(s))}"`, "O que esse SDR deve fazer, tom de voz, roteiro de qualificação e links para passar. O agente lê isso quando for responder.", m.carregando ? `<div style="color:${CINZA};font-size:13px">Carregando...</div>` : `
      <div><textarea data-f="instructions" autofocus rows="14" maxlength="20000" style="${TA};min-height:260px" placeholder="Ex.:\n\nVocê é o SDR de pré-vendas da Alpha Digital.\n\nObjetivo: qualificar o lead que veio do anúncio e agendar reunião de diagnóstico.\n\nPerguntas chave:\n1. Qual o faturamento atual?\n2. Já investe em tráfego?\n3. Quando pretende começar?\n\nSe qualificar, envie o link: https://...">${e(m.texto || "")}</textarea>
      <p style="${HELP}">${m.atualizado ? "Última atualização em " + dataHora(m.atualizado) + "." : "Sem instruções cadastradas ainda."}</p></div>`,
      `<span style="flex:1"></span>${cancelar}<span data-wa-salvar-instrucoes style="${BTN_PRI}">Salvar instruções</span>`, 680);
    if(m.tipo === "config") return modalConfig(m, s);
    if(m.tipo === "lead") return modalLead(m);
    if(m.tipo === "novoLead") return shell(m, "Novo lead", "Entra na etapa \"Novo Lead\" do funil. Para disparar para ele, adicione o número também na lista de contatos do SDR.", `
      <div style="display:flex;gap:12px;flex-wrap:wrap"><div style="flex:1 1 200px"><label style="${LBL}">Nome completo</label><input data-f="nome" autofocus value="${e((m.pre || {}).nome || "")}" placeholder="Nome do lead" style="${IN}"></div><div style="flex:1 1 160px"><label style="${LBL}">Telefone</label><input data-f="telefone" type="tel" inputmode="numeric" value="${e((m.pre || {}).telefone || "")}" placeholder="5511999998888" style="${IN}"></div></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><div style="flex:1 1 200px"><label style="${LBL}">Empresa</label><input data-f="empresa" placeholder="Opcional" style="${IN}"></div><div style="flex:1 1 160px"><label style="${LBL}">Cargo</label><input data-f="posicao" placeholder="Ex.: Dono, Gerente" style="${IN}"></div></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><div style="flex:1 1 200px"><label style="${LBL}">E-mail</label><input data-f="email" type="email" placeholder="Opcional" style="${IN}"></div><div style="flex:1 1 120px"><label style="${LBL}">Cidade</label><input data-f="cidade" placeholder="Opcional" style="${IN}"></div><div style="flex:0 1 90px"><label style="${LBL}">UF</label><input data-f="estado" maxlength="2" placeholder="SP" style="${IN};text-transform:uppercase"></div></div>`,
      `<span style="flex:1"></span>${cancelar}<span data-wa-lead-criar style="${BTN_PRI}">Criar lead</span>`, 640);
    if(m.tipo === "tag"){ const t = m.tag || {}; return shell(m, t.id ? `Editar tag "${e(t.name)}"` : "Nova tag de IA", "A IA analisa cada mensagem que o lead manda e marca a tag quando a instrução bater. Se o nome da tag for igual a uma etapa do funil, o lead é movido para ela.", `
      <div style="display:flex;gap:12px;flex-wrap:wrap"><div style="flex:1 1 220px"><label style="${LBL}">Nome da tag</label><input data-f="name" ${t.id ? "disabled" : "autofocus"} value="${e(t.name || "")}" maxlength="40" placeholder="ex.: interesse_alto, quer_agendar" style="${IN}${t.id ? ";background:#F7F7F8;color:#66666F" : ""}"><p style="${HELP}">Vira minúsculas com underline automaticamente. Máximo 40 caracteres.</p></div>
        <div style="flex:1 1 160px"><label style="${LBL}">Categoria</label><select data-f="category" class="cat-select" style="${IN}">${["qualificação", "objeção", "urgência", "comportamento", "fechamento", "geral"].map(c => `<option value="${c}" ${(t.category || "geral") === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div style="flex:0 1 90px"><label style="${LBL}">Cor</label><input data-f="color" type="color" value="${e(t.color || "#673DE6")}" style="${IN};padding:4px;height:42px"></div></div>
      <div><label style="${LBL}">Instrução: quando marcar esta tag</label><textarea data-f="instruction" rows="5" ${t.id ? "autofocus" : ""} placeholder="Descreva para a IA a situação exata da conversa em que essa tag deve ser marcada. Ex.: quando o lead demonstrar urgência, pedir para agendar reunião ou perguntar 'quando começa?'" style="${TA}">${e(t.instruction || "")}</textarea><p style="${HELP}">Quanto mais concreto o critério, melhor a IA acerta. Cite palavras-gatilho ou intenções.</p></div>`,
      `<span style="flex:1"></span>${cancelar}<span data-wa-tag-salvar style="${BTN_PRI}">${t.id ? "Salvar" : "Cadastrar tag"}</span>`, 640); }
    if(m.tipo === "chave") return shell(m, "Nova chave de IA", "A chave fica cifrada no servidor. Depois de salvar, só os 4 últimos dígitos aparecem.", `
      <div><label style="${LBL}">Provedor</label><select data-f="provider" class="cat-select" style="${IN}">${PROVEDORES.map(p => `<option value="${p[0]}">${p[1]}</option>`).join("")}</select></div>
      <div><label style="${LBL}">Apelido</label><input data-f="label" autofocus placeholder="Ex.: anthropic-prod" maxlength="100" style="${IN}"></div>
      <div><label style="${LBL}">Chave</label><input data-f="key" type="password" autocomplete="off" placeholder="Cole a chave (sk-ant-..., sk-... ou AIza...)" style="${IN}"></div>`,
      `<span style="flex:1"></span>${cancelar}<span data-wa-salvar-chave style="${BTN_PRI}">Cadastrar chave</span>`);
    return "";
  }

  // conectar chip: QR ou código, com atualização a cada 3s
  async function abrirConectar(slot){
    const s = porSlot(slot);
    abrirModal({ tipo: "conectar", slot, aba: "qr", fone: "", codigo: null, aviso: "Gerando QR code, aguarde...", qr: null });
    try { if(s && s.status !== "ready" && s.status !== "connecting") await api(`/sdrs/${slot}/reconnect`, { method: "POST" }); } catch(err){ W().modal && (W().modal.aviso = err.message); }
    conectarRefresh();
  }
  async function conectarRefresh(){
    const m = W().modal; if(!m || m.tipo === undefined || m.tipo !== "conectar") return;
    try {
      const { sdr } = await api(`/sdrs/${m.slot}`);
      if(W().modal !== m) return;
      if(sdr.status === "ready"){ fecharModal(); cfgToast(`"${nomeSlot(sdr)}" conectado em ${fmtFone(sdr.phone)}.`); loadSdrs(true); return; }
      m.status = sdr.status;
      if(sdr.status === "idle") m.aviso = "A sessão caiu. Clique em \"Gerar novo QR code\" para tentar de novo.";
      else if(!sdr.last_qr) m.aviso = "Gerando QR code, aguarde...";
      else m.aviso = "";
      m.qr = sdr.last_qr && String(sdr.last_qr).startsWith("data:") ? sdr.last_qr : null;
      if(sdr.pairing_code) m.codigo = sdr.pairing_code;
      conectarPaint();
    } catch(err){ m.aviso = err.message; conectarPaint(); }
  }
  function conectarPaint(){
    // repinta só a área viva (não o campo do telefone, que a pessoa pode estar digitando)
    const alvo = document.getElementById("wa-conectar-vivo"); if(alvo){ alvo.innerHTML = conectarVivo(W().modal); bind(alvo); }
  }
  function conectarVivo(m){
    if(m.aba === "qr") return `<div style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <div style="width:256px;height:256px;border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:8px">${m.qr ? `<img src="${m.qr}" alt="QR code" style="width:240px;height:240px;display:block">` : `<span class="tm-pulse" style="font-size:12.5px;color:${CINZA};text-align:center;padding:20px">${e(m.aviso || "Aguardando...")}</span>`}</div>
        ${m.qr && m.aviso ? `<div style="font-size:12.5px;color:${VERM}">${e(m.aviso)}</div>` : ""}
        <span data-wa-conectar-novo style="${BTN_SEC}">${icon(ICONS.refresh, 13, "currentColor")}Gerar novo QR code</span></div>`;
    return `<div style="display:flex;flex-direction:column;gap:12px">
        <div style="padding:22px;border:1px solid #E6E6EA;border-radius:16px;background:#FAFAFA;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:8px;font-weight:700;color:${m.codigo ? "#17171A" : "#B4B4BC"}">${m.codigo ? e(String(m.codigo).replace(/^(.{4})(.{4})$/, "$1-$2")) : "––––––––"}</div>
        ${m.aviso && !m.codigo ? `<div class="${/aguarde/i.test(m.aviso) ? "tm-pulse" : ""}" style="font-size:12.5px;color:${/caiu|erro|inválido|não/i.test(m.aviso) ? VERM : CINZA};text-align:center">${e(m.aviso)}</div>` : ""}
        ${m.codigo ? `<span data-wa-pair="1" style="${BTN_SEC};align-self:center">${icon(ICONS.refresh, 13, "currentColor")}Gerar novo código</span>` : ""}</div>`;
  }
  function modalConectar(m, s){
    const passos = m.aba === "qr" ? ["Abra o WhatsApp no celular do chip", "Toque em <strong>Configurações › Aparelhos conectados</strong>", "Toque em <strong>Conectar aparelho</strong> e aponte a câmera para a tela"] : ["Abra o WhatsApp no celular do chip", "Toque em <strong>Aparelhos conectados › Conectar aparelho</strong>", "Toque em <strong>Conectar com número de telefone</strong>", "Digite o código acima"];
    return shell(m, `Conectar chip em "${e(nomeSlot(s))}"`, "Escolha como quer parear o número.", `
      <div style="display:inline-flex;gap:3px;padding:4px;border:1px solid #E6E6EA;border-radius:11px;background:#F1F1F3;align-self:flex-start"><span data-wa-conectar-aba="qr" style="${SEG(m.aba === "qr")}">QR code</span><span data-wa-conectar-aba="token" style="${SEG(m.aba === "token")}">Código de 8 dígitos</span></div>
      ${m.aba === "token" ? `<div><label style="${LBL}">Número do chip (DDI + DDD + número, só dígitos)</label><div style="display:flex;gap:8px"><input data-f="fone" type="tel" inputmode="numeric" value="${e(m.fone || "")}" placeholder="5511999999999" style="${IN}"><span data-wa-pair="0" style="${BTN_PRI}">Gerar código</span></div></div>` : ""}
      <div id="wa-conectar-vivo">${conectarVivo(m)}</div>
      <ol style="margin:0;padding-left:20px;font-size:12.5px;color:#3C3C44;line-height:1.8">${passos.map(p => `<li>${p}</li>`).join("")}</ol>`,
      `<span data-wa-act="desconectar" data-slot="${m.slot}" data-wa-fechar-depois style="${BTN_DANGER}">Desconectar este chip</span><span style="flex:1"></span><span data-wa-fechar style="${BTN_SEC}">Fechar</span>`, 600);
  }
  async function pedirCodigo(force){
    const m = W().modal; if(!m) return;
    const inp = document.querySelector('#wa-modal-host [data-f="fone"]'); const fone = String((inp && inp.value) || m.fone || "").replace(/\D/g, ""); m.fone = fone;
    if(fone.length < 10 || fone.length > 15) return zAlert(ERROS.phone_invalid);
    m.aviso = "Gerando código, aguarde até 20 segundos..."; m.codigo = null; conectarPaint();
    try { const r = await api(`/sdrs/${m.slot}/pair-code`, { method: "POST", body: { phone: fone, force: !!force } }); if(r.code){ m.codigo = r.code; m.aviso = ""; } conectarPaint(); }
    catch(err){ m.aviso = err.message; conectarPaint(); }
  }

  // instruções
  async function abrirInstrucoes(slot){
    abrirModal({ tipo: "instrucoes", slot, carregando: true });
    try { const { sdr } = await api(`/sdrs/${slot}/instructions`); const m = W().modal; if(!m || m.slot !== slot) return; m.carregando = false; m.texto = sdr.instructions || ""; m.atualizado = sdr.instructions_updated_at; modalHost(); }
    catch(err){ fecharModal(); falha("Não consegui carregar as instruções", err); }
  }

  // configurações do SDR
  async function abrirConfig(slot){
    abrirModal({ tipo: "config", slot, carregando: true, aba: null });
    try {
      const j = await api(`/sdrs/${slot}/config`);
      const m = W().modal; if(!m || m.slot !== slot) return;
      const c = j.sdr || {};
      m.d = { sdr_mode: c.sdr_mode === "ativo" ? "ativo" : "receptivo", trigger_mode: c.trigger_mode === "strict" ? "strict" : "any", master_slot: c.master_slot || "", welcome_message: c.welcome_message || "", instructions: c.instructions || "", conversation_instructions: c.conversation_instructions || "", reference_url: c.reference_url || "", personality_level: c.personality_level == null ? 5 : c.personality_level,
        dispatch_min_delay: c.dispatch_min_delay || 30, dispatch_max_delay: c.dispatch_max_delay || 60, dispatch_pause_every: c.dispatch_pause_every || 10, dispatch_pause_seconds: c.dispatch_pause_seconds == null ? 300 : c.dispatch_pause_seconds,
        dispatch_messages: (j.dispatch_messages || []).map(x => x.body), triggers: j.triggers || [], ai_key_id: c.ai_key_id ? String(c.ai_key_id) : "", ai_provider: c.ai_provider || "", ai_model: c.ai_model || "", ai_daily_limit: c.ai_daily_limit == null ? 20 : c.ai_daily_limit, ai_paused_until: c.ai_paused_until,
        send_link_enabled: !!c.send_link_enabled, send_link_url: c.send_link_url || "", send_link_trigger: c.send_link_trigger || "", send_file_enabled: !!c.send_file_enabled, send_file_path: c.send_file_path || "", send_file_trigger: c.send_file_trigger || "", send_image_enabled: !!c.send_image_enabled, send_image_path: c.send_image_path || "", send_image_trigger: c.send_image_trigger || "" };
      m.chaves = j.available_keys || []; m.carregando = false; m.aba = m.d.sdr_mode === "ativo" ? "disparo" : "gatilhos"; m.jobs = null; m.stats = null;
      modalHost(); jobsRefresh(); statsRefresh();
    } catch(err){ fecharModal(); falha("Não consegui carregar as configurações", err); }
  }
  const ABAS = { ativo: [["disparo", "Disparo"], ["contatos", "Contatos"], ["conversa", "Conversa"], ["avancado", "Avançado"]], receptivo: [["gatilhos", "Gatilhos"], ["conversa", "Conversa"], ["avancado", "Avançado"]] };
  // Lê os campos da tela para o rascunho antes de qualquer repintura (troca de aba, lista dinâmica)
  function sincronizar(){
    const m = W().modal; if(!m || m.tipo !== "config" || !m.d) return;
    document.querySelectorAll("#wa-modal-host [data-cfg]").forEach(el => { const k = el.dataset.cfg; if(el.type === "checkbox") m.d[k] = el.checked; else if(el.type === "number" || el.type === "range") m.d[k] = el.value === "" ? "" : Number(el.value); else m.d[k] = el.value; });
    document.querySelectorAll("#wa-modal-host [data-cfg-msg]").forEach(el => { m.d.dispatch_messages[+el.dataset.cfgMsg] = el.value; });
  }
  function modalConfig(m, s){
    if(m.carregando) return shell(m, `Configurações de "${e(nomeSlot(s))}"`, "", `<div style="color:${CINZA};font-size:13px">Carregando...</div>`, "", 720);
    const d = m.d, abas = ABAS[d.sdr_mode];
    const campo = (k, rot, ph, sub, tipo, extra) => `<div style="flex:1 1 200px"><label style="${LBL}">${rot}</label><input data-cfg="${k}" type="${tipo || "text"}" value="${e(d[k] == null ? "" : d[k])}" placeholder="${e(ph || "")}" ${extra || ""} style="${IN}">${sub ? `<p style="${HELP}">${sub}</p>` : ""}</div>`;
    const area = (k, rot, ph, sub, linhas) => `<div><label style="${LBL}">${rot}</label><textarea data-cfg="${k}" rows="${linhas || 4}" placeholder="${e(ph || "")}" style="${TA}">${e(d[k] || "")}</textarea>${sub ? `<p style="${HELP}">${sub}</p>` : ""}</div>`;
    const bloco = (t, corpo, sub) => `<div style="border:1px solid #E6E6EA;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:14px"><div><div style="font-size:13.5px;font-weight:600">${t}</div>${sub ? `<p style="${HELP};margin-top:3px">${sub}</p>` : ""}</div>${corpo}</div>`;
    let corpo = "";
    if(m.aba === "disparo") corpo = `
      ${area("instructions", "Instruções para iniciar a conversa", "Ex.: Ao iniciar contato, apresente-se como Ana da Alpha, diga o motivo do contato e seja calorosa.", "Tom e abordagem do primeiro contato. É o mesmo texto do botão Instruções do cartão.", 3)}
      ${bloco("Mensagens de disparo", `<div style="display:flex;flex-direction:column;gap:10px">${d.dispatch_messages.length ? d.dispatch_messages.map((t, i) => `<div style="display:flex;gap:8px;align-items:flex-start"><span style="width:24px;height:24px;flex:0 0 24px;border-radius:7px;background:#F1F1F3;font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:8px">${i + 1}</span><textarea data-cfg-msg="${i}" rows="2" maxlength="2000" placeholder="Oi {nome}, tudo bem? Sou a Ana da Alpha..." style="${TA};min-height:64px">${e(t)}</textarea><span data-wa-msg-del="${i}" data-hover title="Remover" style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;margin-top:6px">${icon(ICONS.x, 13, CINZA)}</span></div>`).join("") : `<div style="font-size:12.5px;color:${CINZA}">Nenhuma mensagem ainda. Sem pelo menos uma, o disparo não inicia.</div>`}</div><span data-wa-msg-add style="${BTN_SEC};align-self:flex-start">${icon(ICONS.plus, 13, "currentColor")}Adicionar variação</span>`, "Cada envio usa uma variação diferente, em rodízio, para evitar bloqueio. Use <strong>{nome}</strong> para puxar o nome do contato. Recomendado: 3 a 5 variações bem diferentes.")}
      ${bloco("Ritmo dos disparos", `<div style="display:flex;gap:12px;flex-wrap:wrap">${campo("dispatch_min_delay", "Espera mínima (s)", "30", "", "number", 'min="3" max="3600"')}${campo("dispatch_max_delay", "Espera máxima (s)", "60", "", "number", 'min="3" max="3600"')}</div><div style="display:flex;gap:12px;flex-wrap:wrap">${campo("dispatch_pause_every", "Pausa a cada N envios", "10", "", "number", 'min="1" max="1000"')}${campo("dispatch_pause_seconds", "Duração da pausa (s)", "300", "0 desliga a pausa.", "number", 'min="0" max="86400"')}</div>`, "Entre um envio e o próximo o sistema espera um tempo aleatório entre o mínimo e o máximo.")}`;
    else if(m.aba === "contatos") corpo = `
      ${bloco("Lista de contatos", `<div id="wa-jobs">${jobsHTML(m)}</div>`, "Quem vai receber o disparo. Pendentes entram na fila assim que o atendimento iniciar.")}
      ${bloco("Adicionar contatos", `
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input data-f="manual-fone" type="tel" inputmode="numeric" placeholder="DDI + DDD + número (ex.: 5511999998888)" style="${IN};flex:1 1 200px"><input data-f="manual-nome" placeholder="Nome (opcional)" style="${IN};flex:1 1 140px"><span data-wa-manual style="${BTN_SEC}">${icon(ICONS.plus, 13, "currentColor")}Adicionar</span></div>
        <div><label style="${LBL}">Ou cole uma lista (um por linha: número,nome)</label><textarea data-f="lista" rows="4" placeholder="5511999998888,Fulano\n5562988887777,Maria" style="${TA}"></textarea><p style="${HELP}">Aceita colar direto do Excel ou CSV. Todo número precisa ter DDI e DDD. Número curto é ignorado.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><span data-wa-lista-salvar style="${BTN_PRI}">Salvar lista</span><label style="${BTN_SEC}">${icon(ICONS.attach, 13, "currentColor")}Enviar arquivo .txt, .csv ou .xlsx<input data-wa-arquivo type="file" accept=".txt,.csv,.tsv,.xlsx,.xls" hidden></label></div></div>
        <div><label style="${LBL}">Ou um link do Google Sheets</label><div style="display:flex;gap:8px"><input data-f="sheet" type="url" placeholder="https://docs.google.com/spreadsheets/d/..." style="${IN}"><span data-wa-sheet style="${BTN_SEC}">Puxar</span></div><p style="${HELP}">Número na primeira coluna e nome na segunda. A planilha precisa estar compartilhada com "qualquer pessoa com o link".</p></div>`)}`;
    else if(m.aba === "gatilhos") corpo = `
      ${bloco("Palavras ou frases que ativam este SDR", `<div style="display:flex;flex-wrap:wrap;gap:6px">${d.triggers.length ? d.triggers.map((t, i) => `<span style="${CHIP};background:rgba(103,61,230,0.1);color:${ROXO}">${e(t)}<span data-wa-trig-del="${i}" style="cursor:pointer;display:flex">${icon(ICONS.x, 11, "currentColor")}</span></span>`).join("") : `<span style="font-size:12.5px;color:${CINZA}">Nenhuma palavra-gatilho ainda.</span>`}</div><div style="display:flex;gap:8px"><input data-f="trig" placeholder="ex.: quero saber mais, kit congresso, comprar" style="${IN}"><span data-wa-trig-add style="${BTN_SEC}">${icon(ICONS.plus, 13, "currentColor")}Adicionar</span></div>`, "Quando qualquer uma aparecer numa mensagem recebida, este SDR assume a conversa. Não diferencia maiúsculas. Separe várias por vírgula.")}
      ${area("welcome_message", "Mensagem inicial ao ativar (opcional)", "Ex.: Oi {nome}, vi que você mostrou interesse. Posso te passar mais detalhes?", "Enviada uma vez quando o gatilho é detectado. Vazio: ele só continua a conversa.", 3)}`;
    else if(m.aba === "conversa"){
      const prov = d.ai_provider || (m.chaves.find(k => String(k.id) === d.ai_key_id) || {}).provider || "";
      const modelos = MODELOS[prov] || [];
      corpo = `
      ${area("conversation_instructions", "Instruções da conversa", "Como o SDR conduz a conversa: objetivo, perguntas de qualificação, o que oferecer, o que evitar, quando passar para um humano, links.", "O agente lê isso ao responder cada mensagem. Seja específico: roteiro, tom de voz, ordem das perguntas.", 6)}
      <div><label style="${LBL}">Personalidade · <span id="wa-pers">${d.personality_level}</span></label><input data-cfg="personality_level" type="range" min="0" max="10" step="1" value="${d.personality_level}" style="width:100%;accent-color:${ROXO}"><p style="${HELP}">0 a 3: segue o roteiro ao pé da letra. 4 a 6: equilibra roteiro e naturalidade. 7 a 10: mais espontâneo, adapta ao cliente.</p></div>
      ${campo("reference_url", "Link de referência", "https://empresadocliente.com.br", "O SDR consulta esse site para tirar dúvidas sobre a empresa ou o produto.", "url")}
      ${bloco("Inteligência artificial", `
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="flex:1 1 200px"><label style="${LBL}">Chave de API</label><select data-cfg="ai_key_id" class="cat-select" style="${IN}"><option value="">Não usar IA (ZEUS ou manual)</option>${m.chaves.map(k => `<option value="${k.id}" ${String(k.id) === d.ai_key_id ? "selected" : ""}>${e(k.label)} · ${e(k.provider)} · ****${e(k.key_last4)}</option>`).join("")}</select><p style="${HELP}">Cadastre chaves em <strong>Chaves de IA</strong>, no menu da esquerda.</p></div>
          <div style="flex:1 1 160px"><label style="${LBL}">Provedor</label><select data-cfg="ai_provider" class="cat-select" style="${IN}"><option value="">O da chave</option>${PROVEDORES.map(p => `<option value="${p[0]}" ${d.ai_provider === p[0] ? "selected" : ""}>${p[1]}</option>`).join("")}</select></div>
          <div style="flex:1 1 200px"><label style="${LBL}">Modelo</label><select data-cfg="ai_model" class="cat-select" style="${IN}"><option value="">Padrão do provedor</option>${modelos.map(x => `<option value="${x}" ${d.ai_model === x ? "selected" : ""}>${x}</option>`).join("")}${d.ai_model && !modelos.includes(d.ai_model) ? `<option value="${e(d.ai_model)}" selected>${e(d.ai_model)}</option>` : ""}</select></div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">${campo("ai_daily_limit", "Limite diário de respostas por IA", "20", "Depois disso o SDR para de responder por IA até o dia seguinte. 0 desliga o limite.", "number", 'min="0" max="10000"')}
          <div style="flex:1 1 220px;display:flex;flex-direction:column;gap:8px"><span style="font-size:12.5px;color:${CINZA}">${m.stats ? `Usadas hoje: <strong style="color:#17171A">${m.stats.used_today}</strong> de ${d.ai_daily_limit || "ilimitado"}` : ""}${d.ai_paused_until && new Date(d.ai_paused_until) > new Date() ? ` · <span style="color:${AMBAR}">IA pausada até ${hora(d.ai_paused_until)}</span>` : ""}</span><div style="display:flex;gap:8px"><span data-wa-ia="pausar" style="${BTN_MINI}">Pausar IA por 10 min</span><span data-wa-ia="retomar" style="${BTN_MINI}">Retomar agora</span></div></div></div>`, "Sem chave escolhida, o SDR não responde por IA (o fluxo do ZEUS continua funcionando).")}
      ${bloco("Recursos de envio", ["link", "file", "image"].map(k => { const rot = { link: "Enviar link", file: "Enviar arquivo (PDF, áudio, vídeo, docx...)", image: "Enviar imagem" }[k], on = d["send_" + k + "_enabled"], path = d["send_" + k + "_path"]; return `<div style="border-top:1px solid #F1F1F3;padding-top:12px"><label style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:500;cursor:pointer"><input data-cfg="send_${k}_enabled" type="checkbox" ${on ? "checked" : ""} style="width:16px;height:16px;accent-color:${ROXO}">${rot}</label>
        <div style="display:${on ? "flex" : "none"};gap:10px;flex-wrap:wrap;margin-top:10px" data-wa-rec="${k}">${k === "link" ? campo("send_link_url", "URL", "https://...") : `<div style="flex:1 1 200px"><label style="${LBL}">Arquivo</label><label style="${BTN_SEC}">${icon(k === "image" ? ICONS.image : ICONS.attach, 13, "currentColor")}${k === "image" ? "Escolher imagem" : "Escolher arquivo"}<input data-wa-midia="${k}" type="file" accept="${k === "image" ? "image/*" : "application/pdf,audio/*,video/*,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"}" hidden></label><p style="${HELP}">${path ? "Atual: " + e(path.split("/").pop()) : "Nenhum arquivo enviado ainda."}${k === "file" ? " Limite 64 MB." : ""}</p></div>`}${campo("send_" + k + "_trigger", "Quando enviar", k === "link" ? "ex.: após o lead confirmar interesse" : k === "image" ? "ex.: quando o cliente pedir foto" : "ex.: quando o cliente pedir o material")}</div></div>`; }).join(""), "Quando ligados, o SDR pode mandar esses itens durante a conversa, no momento que você descrever.")}`;
    } else if(m.aba === "avancado") corpo = `
      ${bloco("Modo de gatilho (só receptivo)", `<div style="display:inline-flex;gap:3px;padding:4px;border:1px solid #E6E6EA;border-radius:11px;background:#F1F1F3;align-self:flex-start"><span data-wa-trigmode="any" style="${SEG(d.trigger_mode === "any")}">Padrão</span><span data-wa-trigmode="strict" style="${SEG(d.trigger_mode === "strict")}">Estrito</span></div>`, "<strong>Padrão</strong>: se nenhuma palavra-gatilho de nenhum SDR deste chip bater, este SDR pega a conversa mesmo assim. <strong>Estrito</strong>: só assume quando o gatilho for detectado.")}
      <div><label style="${LBL}">Compartilhar o chip de outro SDR</label><select data-cfg="master_slot" class="cat-select" style="${IN}"><option value="">Este SDR usa o próprio chip</option>${(W().sdrs || []).filter(x => x.slot !== m.slot && (x.status === "ready" || x.phone)).map(x => `<option value="${x.slot}" ${String(d.master_slot) === String(x.slot) ? "selected" : ""}>${e(nomeSlot(x))}${x.phone ? " · " + fmtFone(x.phone) : ""}</option>`).join("")}</select><p style="${HELP}">Para este SDR atender pelo mesmo WhatsApp de outro, aponte para ele aqui.</p></div>
      <div style="border:1px solid rgba(192,52,28,0.3);border-radius:14px;padding:16px 18px;background:rgba(192,52,28,0.03)"><div style="font-size:13.5px;font-weight:600;color:${VERM};margin-bottom:6px">Zona de perigo</div><p style="${HELP};margin:0 0 12px"><strong>Resetar a memória de conversas</strong> apaga o histórico interno, os vínculos de contato, o log de IA e os disparos já feitos, só deste SDR. Serve para testar do zero ou reaproveitar a mesma lista. Não mexe no WhatsApp do cliente, nas configurações, no chip pareado nem nas mídias.</p><span data-wa-reset-memoria style="${BTN_DANGER}">${icon(ICONS.trash, 13, "currentColor")}Resetar memória de conversas</span></div>`;
    return shell(m, `Configurações de "${e(nomeSlot(s))}"`, "", `
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><span style="${LBL};margin:0">Modo de operação</span><div style="display:inline-flex;gap:3px;padding:4px;border:1px solid #E6E6EA;border-radius:11px;background:#F1F1F3"><span data-wa-modo="ativo" style="${SEG(d.sdr_mode === "ativo")}">Ativo · dispara contatos</span><span data-wa-modo="receptivo" style="${SEG(d.sdr_mode === "receptivo")}">Receptivo · responde gatilho</span></div></div>
      <p style="${HELP};margin:-6px 0 0"><strong>Ativo</strong>: você sobe uma lista e o SDR inicia a conversa com as mensagens de disparo em rodízio. <strong>Receptivo</strong>: o SDR espera e assume a conversa quando uma palavra-gatilho aparece.</p>
      <div style="display:inline-flex;gap:3px;padding:4px;border:1px solid #E6E6EA;border-radius:11px;background:#F1F1F3;align-self:flex-start;flex-wrap:wrap">${abas.map(a => `<span data-wa-aba="${a[0]}" style="${SEG(m.aba === a[0])}">${a[1]}</span>`).join("")}</div>
      ${corpo}`,
      `<span style="flex:1"></span>${cancelar}<span data-wa-salvar-config style="${BTN_PRI}">Salvar configurações</span>`, 760);
  }
  function jobsHTML(m){
    const j = m.jobs;
    if(!j) return `<div style="font-size:12.5px;color:${CINZA}">Carregando...</div>`;
    const n = k => (j.counts.find(c => c.status === k) || {}).n || 0;
    const tile = (rot, v, cor) => `<div style="flex:1 1 90px;padding:10px 12px;border:1px solid #EFEFF1;border-radius:10px;background:#FAFAFA"><div style="font-size:11px;color:${CINZA}">${rot}</div><div style="${HEAD};font-size:20px;font-weight:700;color:${cor || "#17171A"}">${v}</div></div>`;
    const ST = { pending: ["Pendente", CINZA], processing: ["Enviando", AMBAR], sent: ["Enviado", VERDE], error: ["Erro", VERM], duplicate: ["Repetido", CINZA] };
    return `<div style="display:flex;gap:8px;flex-wrap:wrap">${tile("Pendentes", n("pending"))}${tile("Enviados", n("sent"), VERDE)}${tile("Erros", n("error"), n("error") ? VERM : null)}</div>
      ${j.jobs.length ? `<div style="max-height:260px;overflow-y:auto;border:1px solid #EFEFF1;border-radius:10px">${j.jobs.map(x => { const s = ST[x.status] || [x.status, CINZA]; return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid #F4F4F6;font-size:12.5px"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fmtFone(x.target_phone)}${x.target_name ? ` <span style="color:${CINZA}">· ${e(x.target_name)}</span>` : ""}${x.error ? `<span style="display:block;font-size:11px;color:${VERM}">${e(x.error)}</span>` : ""}</span><span style="${CHIP};background:${s[1]}14;color:${s[1]}">${s[0]}</span><span data-wa-job-del="${x.id}" title="Remover" style="cursor:pointer;display:flex;opacity:.5">${icon(ICONS.x, 12, "currentColor")}</span></div>`; }).join("")}</div>
      ${n("pending") ? `<span data-wa-jobs-cancelar style="${BTN_MINI};align-self:flex-start;color:${VERM}">Cancelar todos os pendentes</span>` : ""}` : `<div style="font-size:12.5px;color:${CINZA}">Nenhum contato cadastrado ainda. Adicione abaixo.</div>`}`;
  }
  async function jobsRefresh(){
    const m = W().modal; if(!m || m.tipo !== "config") return;
    try { m.jobs = await api(`/sdrs/${m.slot}/upload-jobs`); } catch(err){ m.jobs = { jobs: [], counts: [] }; }
    const el = document.getElementById("wa-jobs"); if(el && W().modal === m){ el.innerHTML = jobsHTML(m); bind(el); }
  }
  async function statsRefresh(){
    const m = W().modal; if(!m || m.tipo !== "config") return;
    try { m.stats = await api(`/sdrs/${m.slot}/ai-stats`); if(m.aba === "conversa"){ sincronizar(); modalHost(); } } catch(err){}
  }
  function parseLista(txt){
    const out = [], vistos = new Set();
    String(txt || "").replace(/^﻿/, "").split(/\r?\n/).forEach(l => {
      let linha = l.replace(/ /g, " ").replace(/^\s*(\d+[.)]\s+|[-*•]\s+)/, "").replace(/\b(cel|tel|whats|wpp|numero|número|fone)\s*:\s*/ig, "").trim();
      if(!linha) return;
      const partes = linha.split(/[,;|\t]/).map(x => x.trim()).filter(Boolean);
      let fone = null, nome = [];
      partes.forEach(p => { const d = p.replace(/\D/g, ""); if(!fone && d.length >= 10 && d.length <= 15 && d.length >= p.replace(/[\s()+\-.]/g, "").length) fone = d; else if(/[A-Za-zÀ-ÿ]/.test(p)) nome.push(p); });
      if(!fone){ const soNums = linha.match(/\d[\d\s().+-]{8,}\d/g) || []; soNums.forEach(x => { const d = x.replace(/\D/g, ""); if(d.length >= 10 && d.length <= 15 && !vistos.has(d)){ vistos.add(d); out.push({ phone: d, name: null }); } }); return; }
      if(vistos.has(fone)) return; vistos.add(fone);
      out.push({ phone: fone, name: nome.join(" ").trim() || null });
    });
    return out;
  }
  function resultadoUpload(r, origem){
    const linhas = [`${origem}: ${r.added} adicionado${r.added === 1 ? "" : "s"}` + (r.skipped || r.duplicated ? `, ${(r.skipped || 0) + (r.duplicated || 0)} rejeitado${(r.skipped || 0) + (r.duplicated || 0) === 1 ? "" : "s"}` : "") + "."];
    if(r.added === 0 && (r.skipped || r.duplicated)) linhas.push("Atenção: nada entrou.");
    if(r.rejected_samples && r.rejected_samples.length) linhas.push("Exemplos rejeitados: " + r.rejected_samples.slice(0, 5).map(x => `${x.phone} (${MOTIVOS[x.reason] || x.reason})`).join("; ") + ".");
    if(r.added && !(r.skipped || r.duplicated)) cfgToast(linhas[0]); else zAlert(linhas.join("\n"), { erro: !r.added });
  }
  async function enviarContatos(contatos, origem){
    const m = W().modal; if(!m) return;
    try { const r = await api(`/sdrs/${m.slot}/upload-contacts`, { method: "POST", body: { contacts: contatos } }); resultadoUpload(r, origem); jobsRefresh(); loadSdrs(true); return r; }
    catch(err){ falha("Não consegui salvar os contatos", err); }
  }
  function corpoConfig(d){
    return { welcome_message: d.welcome_message, triggers: d.triggers, trigger_mode: d.trigger_mode, master_slot: d.master_slot === "" ? null : Number(d.master_slot), ai_active: porSlot(W().modal.slot) && porSlot(W().modal.slot).ai_active ? 1 : 0, sdr_mode: d.sdr_mode, personality_level: Number(d.personality_level), reference_url: d.reference_url || null, conversation_instructions: d.conversation_instructions, instructions: d.instructions,
      dispatch_min_delay: Number(d.dispatch_min_delay) || 30, dispatch_max_delay: Number(d.dispatch_max_delay) || 60, dispatch_pause_every: Number(d.dispatch_pause_every) || 10, dispatch_pause_seconds: d.dispatch_pause_seconds === "" ? 300 : Number(d.dispatch_pause_seconds), dispatch_messages: d.dispatch_messages.map(t => String(t || "").trim()).filter(Boolean).map(body => ({ body })),
      ai_key_id: d.ai_key_id || null, ai_provider: d.ai_provider || null, ai_model: d.ai_model || null, ai_daily_limit: d.ai_daily_limit === "" ? 20 : Number(d.ai_daily_limit),
      send_link_enabled: d.send_link_enabled ? 1 : 0, send_link_url: d.send_link_url || null, send_link_trigger: d.send_link_trigger || null, send_file_enabled: d.send_file_enabled ? 1 : 0, send_file_trigger: d.send_file_trigger || null, send_image_enabled: d.send_image_enabled ? 1 : 0, send_image_trigger: d.send_image_trigger || null };
  }
  async function salvarConfig(){
    const m = W().modal; if(!m || m.tipo !== "config") return; sincronizar();
    const lista = document.querySelector('#wa-modal-host [data-f="lista"]');
    if(lista && lista.value.trim()){ const c = parseLista(lista.value); if(c.length && await zConfirm(`Salvar também os ${c.length} contato${c.length === 1 ? "" : "s"} que estão na caixa de lista?`)) await enviarContatos(c, "Lista colada"); }
    try { await api(`/sdrs/${m.slot}/config`, { method: "PUT", body: corpoConfig(m.d) }); fecharModal(); cfgToast("Configurações salvas."); loadSdrs(true); }
    catch(err){ falha("Não consegui salvar", err); }
  }
  async function enviarMidia(kind, file){
    const m = W().modal; if(!m || !file) return;
    const fd = new FormData(); fd.append("file", file); fd.append("kind", kind);
    cfgToast(`Enviando ${file.name}...`);
    try { const r = await api(`/sdrs/${m.slot}/media-upload`, { method: "POST", form: fd }); sincronizar(); m.d["send_" + kind + "_path"] = r.path; m.d["send_" + kind + "_enabled"] = true; modalHost(); cfgToast(`${r.name} enviado.`); }
    catch(err){ falha("Não consegui enviar o arquivo", err); }
  }

  // ─── conversas: lista, conversa aberta e o painel do lead ─────────────────────
  const iniciais = n => { const t = String(n || ""); if(/^\+?[\d\s().-]+$/.test(t)) return "#"; return t.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).map(p => Array.from(p)[0]).join("").toUpperCase() || "#"; };
  const convNome = x => x.contact_name || fmtFone(x.contact_phone) || "Contato";
  const convSdr = x => { const s = porSlot(x.slot); return s ? nomeSlot(s) : (x.sdr_name || "SDR " + x.slot); };
  const convFone = x => { const d = String(x.contact_phone || "").replace(/\D/g, ""); if(d.length >= 10 && d.length <= 15) return d; const m = String(x.chat_id || "").match(/^(\d{10,15})@c\.us$/); return m ? m[1] : ""; };
  // lead do funil com o mesmo número desta conversa
  const convLead = x => { const f = convFone(x); if(!f) return null; return (W().crm.leads || []).find(l => String(l._phone || "").replace(/\D/g, "") === f) || null; };
  const detalhesOn = () => { const d = W().detalhes; return d == null ? window.innerWidth > 1280 : d; };
  function convVis(){
    const c = W().conv, q = (c.busca || "").toLowerCase(), qd = q.replace(/\D/g, "");
    return (c.lista || []).filter(x => (c.cf !== "naoLidas" || x.unread) && (!q || String(x.contact_name || "").toLowerCase().includes(q) || (qd && String(x.contact_phone || "").includes(qd))));
  }
  function listaHTML(){
    const c = W().conv, lista = c.lista, a = c.aberta, vis = convVis();
    if(!lista) return `<div style="padding:16px 14px;font-size:12.5px;color:${CINZA}">${c.erro ? e(c.erro) : "Carregando..."}</div>`;
    if(!vis.length) return `<div style="padding:40px 20px;text-align:center;font-size:13px;color:${MUTE}">${c.busca ? "Nada com esse nome ou número." : c.cf === "naoLidas" ? "Nenhuma conversa sem ler." : "Sem conversas ainda. Conecte um SDR e espere as mensagens chegarem."}</div>`;
    return vis.map(x => { const on = a && a.slot === x.slot && a.chat_id === x.chat_id; return `<div data-wa-conv-abrir="${x.slot}|${e(x.chat_id)}" ${on ? "" : "data-hover"} style="display:flex;gap:11px;padding:12px 14px;cursor:pointer;border-bottom:1px solid #F4F4F6;background:${on ? SEL : "transparent"}">
        <span style="width:36px;height:36px;flex:0 0 36px;border-radius:50%;background:${on ? TINT : "#F1F1F3"};color:${on ? ROXO_E : "#3C3C44"};font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${e(iniciais(convNome(x)))}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:8px"><span style="flex:1;min-width:0;font-size:13.5px;font-weight:${x.unread ? 700 : 500};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(convNome(x))}</span><span style="font-size:11.5px;color:${x.unread ? ROXO_E : MUTE};white-space:nowrap">${x.last_ts ? diaOuHora(x.last_ts * 1000) : ""}</span></div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:2px"><span style="flex:1;min-width:0;font-size:12.5px;color:${x.unread ? "#17171A" : CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.last_from_me ? `<span style="color:${MUTE}">SDR: </span>` : ""}${e(x.last_message || "")}</span>${x.unread ? `<span style="width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:${ROXO}"></span>` : ""}</div>
          <div style="font-size:11.5px;color:${MUTE};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(convSdr(x))}</div>
        </div></div>`; }).join("");
  }
  function conversas(){
    const c = W().conv, a = c.aberta;
    const pill = (id, rot) => `<span data-wa-cf="${id}" style="white-space:nowrap;flex:0 0 auto;padding:5px 11px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;background:${c.cf === id ? TINT : "#F6F6F7"};color:${c.cf === id ? ROXO_E : CINZA}">${rot}</span>`;
    return `<div style="width:clamp(240px,30%,320px);flex:0 0 clamp(240px,30%,320px);border-right:1px solid #E6E6EA;background:#FFFFFF;display:flex;flex-direction:column;min-height:0">
        <div style="display:flex;align-items:center;gap:6px;padding:12px 14px;border-bottom:1px solid #F0F0F2">
          ${pill("todas", "Todas")}${pill("naoLidas", "Não lidas")}
          <label style="position:relative;flex:1;min-width:0;display:block"><span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);display:flex">${icon(ICONS.search, 13, MUTE)}</span><input data-wa-conv-busca data-keep="busca" value="${e(c.busca || "")}" placeholder="Buscar" title="Buscar contato ou número" style="width:100%;height:28px;padding:0 8px 0 27px;border:1px solid #EEEEF1;border-radius:20px;font:inherit;font-size:12px;color:#17171A;background:#FFFFFF;outline:none;box-sizing:border-box"></label>
          <span data-wa-sync data-hover title="Sincronizar as conversas dos chips conectados com o WhatsApp" style="flex:0 0 28px;width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${CINZA}${W().sincronizando ? ";opacity:.45;pointer-events:none" : ""}">${icon(ICONS.refresh, 14, "currentColor")}</span>
        </div>
        <div id="wa-lista" data-scroll="lista" style="flex:1;min-height:0;overflow-y:auto">${listaHTML()}</div>
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0">${a ? chat(a) : `<div style="margin:auto;text-align:center;color:${CINZA};font-size:13px;padding:30px">${icon(ICONS.chatBubble, 28, "#C6C6CC")}<div style="margin-top:10px">Escolha uma conversa à esquerda para ler e responder.</div></div>`}</div>
      ${a && detalhesOn() ? detalhes(a) : ""}`;
  }
  function chat(a){
    const c = W().conv, s = porSlot(a.slot), on = !!(s && s.ai_active), fone = convFone(a);
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 20px;background:#FFFFFF;border-bottom:1px solid #E6E6EA">
        <span style="width:34px;height:34px;flex:0 0 34px;border-radius:50%;background:#F1F1F3;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${e(iniciais(convNome(a)))}</span>
        <div style="flex:1 1 120px;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(convNome(a))}</div><div style="font-size:12px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fone && a.contact_name ? fmtFone(fone) + " · " : ""}${e(convSdr(a))}</div></div>
        ${s ? `<button data-wa-conv-ia="${a.slot}" title="${on ? "O agente deste SDR está respondendo. Clique para pausar (vale para todas as conversas dele)." : "O agente deste SDR está pausado. Clique para religar."}" style="display:flex;align-items:center;gap:7px;flex:0 0 auto;height:32px;padding:0 12px;border:none;border-radius:20px;background:${on ? "#E8F5EE" : TINT};color:${on ? "#1E7A4D" : ROXO_E};font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>${on ? "IA respondendo" : "IA pausada"}</button>` : ""}
        <span data-wa-detalhes data-hover title="Detalhes do lead" style="flex:0 0 32px;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${CINZA};background:${detalhesOn() ? "#F1F1F3" : "transparent"}">${icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>', 16, "currentColor")}</span>
      </div>
      <div id="wa-msgs" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:24px;display:flex;flex-direction:column;gap:10px">${msgsHTML()}</div>
      <form data-wa-reply style="margin:0;padding:12px 84px 16px 20px;background:#F6F6F7">
        <div style="display:flex;align-items:flex-end;gap:10px;padding:8px 8px 8px 14px;background:#FFFFFF;border:1px solid #E0E0E5;border-radius:12px">
          <textarea data-wa-reply-texto data-autogrow data-keep="reply" rows="1" placeholder="Escreva uma mensagem (Enter envia, Shift+Enter quebra linha)" style="flex:1;min-width:0;border:0;outline:none;resize:none;font:inherit;font-size:13.5px;line-height:1.45;color:#17171A;background:transparent;padding:7px 0;max-height:140px"></textarea>
          <button type="submit" ${c.enviando ? "disabled" : ""} title="Enviar" style="width:34px;height:34px;flex:0 0 34px;border:0;border-radius:9px;background:${c.enviando ? "#B4B4BC" : ROXO};color:#FFFFFF;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0">${icon('<path d="M4 12l16-8-6 16-2-7z"/>', 15, "currentColor")}</button>
        </div>
      </form>`;
  }
  // Painel à direita: o que o funil sabe sobre quem está na conversa. Sem lead com esse número, oferece criar.
  function detalhes(a){
    const l = convLead(a), fone = convFone(a), et = l ? etapa(l._stage) : null;
    const rot = t => `<div style="font-size:11.5px;color:${CINZA};margin-bottom:4px">${t}</div>`;
    const campo = (t, v) => `<div>${rot(t)}<div style="font-size:13.5px;word-break:break-word">${v}</div></div>`;
    return `<div data-scroll="det" style="width:270px;flex:0 0 270px;background:#FFFFFF;border-left:1px solid #E6E6EA;padding:20px;display:flex;flex-direction:column;gap:18px;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px"><span style="${HEAD};font-weight:600;font-size:15px;flex:1">Lead</span>${l ? `<span data-wa-lead="${e(l._key)}" style="font-size:12.5px;color:${ROXO_E};font-weight:600;cursor:pointer">Abrir ficha</span>` : ""}</div>
      ${l ? `<div>${rot("Etapa do funil")}<label style="display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid #E0E0E5;border-radius:9px;font-size:13px"><span style="width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:${et[2]}"></span><select data-wa-det-etapa="${e(l._key)}" style="flex:1;min-width:0;border:0;outline:none;background:transparent;font:inherit;font-size:13px;color:#17171A;appearance:none;-webkit-appearance:none;cursor:pointer">${ETAPAS.map(x => `<option value="${x[0]}" ${l._stage === x[0] ? "selected" : ""}>${x[1]}</option>`).join("")}</select>${icon(CHEV, 12, MUTE)}</label></div>` : ""}
      ${campo("Telefone", fone ? fmtFone(fone) : "—")}
      ${campo("SDR responsável", e(convSdr(a)))}
      ${l && limpo(l.Empresa) ? campo("Empresa", e(limpo(l.Empresa)) + (l["Posição"] ? ` <span style="color:${CINZA}">· ${e(l["Posição"])}</span>` : "")) : ""}
      ${l ? campo("Origem", l._key.startsWith("manual-") ? "Cadastro manual" : "Disparo do SDR") : ""}
      ${l ? `<div>${rot(`Notas <span data-wa-notas-st style="color:${MUTE}"></span>`)}<textarea data-wa-lead-notas="${e(l._key)}" data-keep="notas" rows="4" placeholder="Adicionar nota sobre o lead" style="width:100%;min-height:72px;padding:10px 12px;border:1px solid #E0E0E5;border-radius:9px;font:inherit;font-size:13px;line-height:1.5;color:#17171A;background:#FFFFFF;outline:none;resize:vertical;box-sizing:border-box">${e(l._notes || "")}</textarea></div>`
        : `<div style="font-size:12.5px;color:${CINZA};line-height:1.5">${W().crm.leads ? "Este contato ainda não está no funil." : "Carregando o funil..."}</div>${W().crm.leads ? `<button data-wa-lead-novo="conv" style="${BTN_ROW};align-self:flex-start">+ Criar lead</button>` : ""}`}
    </div>`;
  }
  // Pede ao motor de SDRs para espelhar as conversas que já existem nos chips conectados e acompanha até terminar
  async function sincronizarConversas(){
    const w = W(); if(w.sincronizando) return;
    w.sincronizando = true; repaint();
    try {
      const j = await api("/sdrs/sync-chats", { method: "POST", body: {} });
      if(!(j.conectados || []).length){ w.sincronizando = false; repaint(); return zAlert("Nenhum chip de SDR está conectado agora. Conecte um chip em Configuração › SDRs para sincronizar as conversas."); }
      cfgToast("Sincronizando as conversas dos chips conectados...");
      for(let i = 0; i < 75; i++){
        await new Promise(r => setTimeout(r, 4000));
        const s = await api("/sdrs/sync-chats"); await loadConv(true);
        const est = Object.values(s.estado || {});
        if(est.length && est.every(x => !x.rodando)){ const erro = est.find(x => x.erro); cfgToast(erro ? "A sincronização terminou com erro: " + erro.erro : est.reduce((a, x) => a + (x.chats || 0), 0) + " conversas sincronizadas com o WhatsApp.", !!erro); break; }
      }
    } catch(err){ falha("Não consegui sincronizar as conversas", err); }
    w.sincronizando = false; repaint();
  }
  function msgsHTML(){
    const c = W().conv, ms = c.msgs;
    if(!ms) return `<div style="margin:auto;color:${CINZA};font-size:12.5px">${c.erro ? e(c.erro) : "Carregando mensagens..."}</div>`;
    if(!ms.length) return `<div style="margin:auto;color:${CINZA};font-size:12.5px">Nenhuma mensagem ainda.</div>`;
    let dia = "";
    return ms.map(m => { const d = new Date(m.ts * 1000), rot = d.toLocaleDateString("pt-BR", Object.assign({ day: "2-digit", month: "long" }, BRT)); const sep = rot !== dia ? `<div style="align-self:center;font-size:11.5px;color:${MUTE};padding:3px 10px;background:#FFFFFF;border:1px solid #EEEEF1;border-radius:20px;margin:4px 0">${rot}</div>` : ""; dia = rot;
      return sep + `<div style="display:flex;flex-direction:column;align-items:${m.from_me ? "flex-end" : "flex-start"};gap:3px"><div style="max-width:min(460px,80%);padding:10px 13px;border-radius:12px;font-size:13.5px;line-height:1.45;background:${m.from_me ? BOLHA : "#FFFFFF"};color:#17171A;border:1px solid ${m.from_me ? BOLHA_B : "#EEEEF1"};white-space:pre-wrap;word-wrap:break-word">${m.body ? e(m.body) : `<span style="color:${CINZA};font-style:italic">${m.type && m.type !== "chat" ? "[" + e(m.type) + "]" : "[mídia]"}</span>`}</div><span style="font-size:11px;color:${MUTE}">${m.from_me ? "SDR · " : ""}${hora(d)}</span></div>`; }).join("");
  }
  async function abrirConversa(slot, chatId){
    const c = W().conv; const x = (c.lista || []).find(y => y.slot === slot && y.chat_id === chatId); if(!x) return;
    c.aberta = Object.assign({}, x, { unread: 0 }); c.msgs = null; repaint();
    api("/conversations/mark-read", { method: "POST", body: { slot, chat_id: chatId } }).catch(() => {});
    await loadMsgs(false);
  }
  async function responder(texto){
    const c = W().conv, a = c.aberta; texto = String(texto || "").trim(); if(!a || !texto || c.enviando) return;
    c.enviando = true; repaint();
    try { await api("/conversations/reply", { method: "POST", body: { slot: a.slot, chat_id: a.chat_id, body: texto } }); c.msgs = (c.msgs || []).concat([{ id: "tmp" + Date.now(), from_me: 1, body: texto, ts: Math.floor(Date.now() / 1000), type: "chat" }]); }
    catch(err){ falha("Não consegui enviar", err); const ta = document.querySelector("[data-wa-reply-texto]"); if(ta) ta.value = texto; }
    c.enviando = false; repaint(); setTimeout(() => loadMsgs(true), 900);
  }

  // ─── maturação ───────────────────────────────────────────────────────────────
  function maturacao(){
    const w = W(), m = w.mat, cfg = m && m.config, sts = (m && m.statuses) || [];
    const prontos = (w.sdrs || []).filter(s => s.status === "ready");
    const num = (k, rot, min) => `<div style="flex:1 1 140px"><label style="${LBL}">${rot}</label><input data-mat="${k}" type="number" min="${min}" value="${cfg ? cfg[k] : ""}" style="${IN}"></div>`;
    return `<div>
      ${!m ? (w.error ? vazio("Não consegui carregar", e(w.error)) : `<div style="color:${CINZA};font-size:13px">Carregando...</div>`) : `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;align-items:start">
        <div style="${BOX};padding:20px;display:flex;flex-direction:column;gap:16px">
          <div style="display:flex;align-items:center;gap:12px"><div style="flex:1"><div style="${HEAD};font-size:15px;font-weight:600">Aquecimento ${cfg.enabled ? `<span style="${CHIP};background:${VERDE}14;color:${VERDE};margin-left:6px">ligado</span>` : `<span style="${CHIP};background:#F1F1F3;color:${CINZA};margin-left:6px">desligado</span>`}</div><div style="font-size:12.5px;color:${CINZA};margin-top:3px">Roda em ciclos, respeitando o limite diário de cada chip.</div></div>${cfgSwitch(!!cfg.enabled, 'data-wa-mat-toggle')}</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">${num("min_turns", "Turnos mínimos", 1)}${num("max_turns", "Turnos máximos", 1)}</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">${num("min_delay_seconds", "Espera mínima (s)", 10)}${num("max_delay_seconds", "Espera máxima (s)", 10)}</div>
          <div style="display:flex">${num("daily_max_sessions", "Máximo de sessões por chip por dia", 1)}</div>
          <span data-wa-mat-salvar style="${BTN_PRI};align-self:flex-start">Salvar configuração</span>
        </div>
        <div style="${BOX};padding:20px;display:flex;flex-direction:column;gap:12px">
          <div><div style="${HEAD};font-size:15px;font-weight:600">Chips no aquecimento</div><div style="font-size:12.5px;color:${CINZA};margin-top:3px">Só chips conectados entram. Precisa de pelo menos 2 ligados.</div></div>
          ${prontos.length ? prontos.map(s => { const st = sts.find(x => x.slot === s.slot) || {}; return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #F1F1F3"><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(nomeSlot(s))}</div><div style="font-size:12px;color:${CINZA}">${fmtFone(s.phone)} · hoje: ${st.sessions_today || 0} sess${(st.sessions_today || 0) === 1 ? "ão" : "ões"}</div></div>${cfgSwitch(!!st.enabled, `data-wa-mat-slot="${s.slot}" data-on="${st.enabled ? 1 : 0}"`)}</div>`; }).join("") : `<div style="font-size:12.5px;color:${CINZA};padding:10px 0">Nenhum chip conectado. Conecte pelo menos 2 em <span data-wa-view="sdrs" style="color:${ROXO_E};cursor:pointer;font-weight:600">SDRs</span>.</div>`}
        </div>
      </div>
      <div style="${BOX};padding:20px;margin-top:14px"><div style="${HEAD};font-size:15px;font-weight:600;margin-bottom:12px">Histórico recente</div>
        ${(w.log || []).length ? `<div style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column">${w.log.map(l => { const de = porSlot(l.from_slot), para = porSlot(l.to_slot); return `<div style="display:flex;gap:12px;padding:9px 0;border-top:1px solid #F1F1F3;font-size:12.5px"><span style="color:#9A9AA3;white-space:nowrap;width:44px">${hora(utcSql(l.ts))}</span><span style="color:${CINZA};white-space:nowrap">${e(de ? nomeSlot(de) : "Slot " + l.from_slot)} → ${e(para ? nomeSlot(para) : "Slot " + l.to_slot)}</span><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(l.body)}</span></div>`; }).join("")}</div>` : `<div style="font-size:12.5px;color:${CINZA}">Ainda sem histórico.</div>`}
      </div>`}
    </div>`;
  }

  // ─── chaves de IA ────────────────────────────────────────────────────────────
  function chaves(){
    const w = W(), ks = w.keys;
    return `<div>
      <div style="${BOX};padding:6px 20px">${!ks ? `<div style="padding:14px 0;font-size:13px;color:${CINZA}">${w.keysErro ? e(w.keysErro) : "Carregando..."}</div>` : !ks.length ? `<div style="padding:24px 0;font-size:13px;color:${CINZA};text-align:center">Nenhuma chave cadastrada. Sem chave, os SDRs não respondem por IA.</div>` : ks.map(k => `<div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-top:1px solid #F1F1F3"><span style="width:36px;height:36px;border-radius:10px;background:rgba(103,61,230,0.1);display:flex;align-items:center;justify-content:center">${icon(ICONS.lock, 16, ROXO)}</span><div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">${e(k.label)}</div><div style="font-size:12px;color:${CINZA}">${e(k.provider)} · termina em ${e(k.key_last4)} · cadastrada em ${new Date(utcSql(k.created_at)).toLocaleDateString("pt-BR", BRT)}</div></div><span data-wa-chave-del="${k.id}" data-hover title="Excluir" style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.trash, 15, CINZA)}</span></div>`).join("")}</div>
      <p style="${HELP};margin-top:14px">A chave completa fica cifrada no servidor (AES-256-GCM) e nunca é exibida de novo.</p>
    </div>`;
  }

  // ─── CRM: leads, estatísticas e tags ─────────────────────────────────────────
  const ETAPAS = [["disparado", "Disparado", "#9A9AA3"], ["conversa_iniciada", "Conversa iniciada", AZUL], ["novo_lead", "Novo lead", ROXO], ["em_negociacao", "Em negociação", AMBAR], ["chamar_novamente", "Chamar novamente", "#C2410C"], ["iniciou_compra", "Iniciou compra", "#0E7490"], ["finalizou_compra", "Finalizou compra", VERDE], ["perdido", "Não vai / Perdido", VERM]];
  const etapa = k => ETAPAS.find(x => x[0] === k) || [k, k, CINZA];
  // Nomes vindos do WhatsApp às vezes trazem pedaços de HTML; fica só o texto
  const limpo = v => { let t = String(v || ""); const m = t.match(/title="([^"]*)/); if(m) t = m[1]; return t.replace(/<[^>]*>?/g, " ").replace(/\s+/g, " ").trim(); };
  const leadNome = l => limpo(l["Nome Completo"]) || fmtFone(l._phone) || "(sem nome)";
  const leadSdr = l => { const s = porSlot(l._dispatch_slot); return s ? nomeSlot(s) : (l._dispatch_slot ? "SDR " + l._dispatch_slot : ""); };
  async function loadLeads(silencioso){
    const c = W().crm; if(!silencioso){ c.erro = null; repaint(); }
    try { const j = await crmApi("/leads"); c.leads = j.leads || []; c.stages = j.stages || null; c.erro = null; } catch(err){ c.erro = err.message; }
    repaint();
  }
  async function loadTags(){
    const c = W().crm;
    try { c.tags = (await crmApi("/tags/list")).tags || []; c.tagsErro = null; } catch(err){ c.tagsErro = err.message; }
    repaint();
  }
  // Funil: colunas por etapa. Etapa vazia fica recolhida (continua aceitando cartão arrastado).
  const leadsSdr = () => { const w = W(); return (w.crm.leads || []).filter(l => !w.sdrFiltro || String(l._dispatch_slot || "") === String(w.sdrFiltro)); };
  const leadsVis = () => { const q = (W().crm.busca || "").toLowerCase(), qd = q.replace(/\D/g, ""); return leadsSdr().filter(l => !q || leadNome(l).toLowerCase().includes(q) || limpo(l.Empresa).toLowerCase().includes(q) || (qd && String(l._phone || "").includes(qd))); };
  const PALETA = [[TINT, ROXO_E], ["#E6EEF9", "#2F5FA8"], ["#E8F5EE", "#1E7A4D"], ["#F4E8F0", "#9A3B6E"], ["#FBF1E0", "#8F5208"]];
  function leads(){
    const c = W().crm;
    if(!c.leads) return `<div style="flex:1;min-width:0;padding:24px 28px">${c.erro ? vazio("Não consegui falar com o CRM", e(c.erro)) : `<div style="color:${CINZA};font-size:13px">Carregando leads...</div>`}</div>`;
    const lista = leadsVis(), cols = ETAPAS.map(et => ({ et, its: lista.filter(l => l._stage === et[0]) }));
    const coluna = x => { const et = x.et, n = x.its.length;
      if(!n) return `<div data-wa-col="${et[0]}" title="${et[1]}" style="width:44px;flex:0 0 44px;background:#EFEFF1;border:1px solid transparent;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0"><span style="width:8px;height:8px;border-radius:50%;background:${et[2]}"></span><span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:12.5px;font-weight:600;color:#3C3C44;white-space:nowrap">${et[1]}</span><span style="font-size:11.5px;color:${MUTE}">0</span></div>`;
      return `<div data-wa-col="${et[0]}" style="width:272px;flex:0 0 272px;display:flex;flex-direction:column;min-height:0;background:#EFEFF1;border:1px solid transparent;border-radius:14px;padding:6px">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 8px 10px"><span style="width:8px;height:8px;border-radius:50%;background:${et[2]}"></span><span style="flex:1;font-size:13px;font-weight:600">${et[1]}</span><span style="min-width:22px;height:20px;padding:0 7px;border-radius:10px;background:#FFFFFF;font-size:11.5px;font-weight:600;color:#3C3C44;display:flex;align-items:center;justify-content:center">${n}</span>${et[0] === "novo_lead" ? `<span data-wa-lead-novo data-hover title="Novo lead" style="width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:${CINZA};cursor:pointer;font-size:15px">+</span>` : ""}</div>
        <div data-scroll="col-${et[0]}" style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:0 0 4px">${x.its.map(l => leadCard(l, et)).join("")}</div></div>`; };
    return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0">
      <div style="display:flex;align-items:center;gap:16px;padding:16px 28px 0;flex-wrap:wrap">
        <span style="font-size:13px;color:${CINZA};white-space:nowrap"><strong style="color:#17171A">${lista.length}</strong> lead${lista.length === 1 ? "" : "s"} no funil</span>
        <div style="flex:1;min-width:200px;max-width:420px;display:flex;height:6px;border-radius:6px;overflow:hidden;background:#E9E9EC;gap:2px">${cols.filter(x => x.its.length).map(x => `<span title="${x.et[1]}: ${x.its.length}" style="flex:${x.its.length} 0 0;background:${x.et[2]}"></span>`).join("")}</div>
        <span style="flex:1"></span>
        <label style="position:relative;display:block"><span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);display:flex">${icon(ICONS.search, 13, MUTE)}</span><input data-wa-lead-busca data-keep="lbusca" value="${e(c.busca)}" placeholder="Buscar nome, empresa ou número" style="width:240px;height:32px;padding:0 10px 0 29px;border:1px solid #E0E0E5;border-radius:9px;font:inherit;font-size:12.5px;color:#17171A;background:#FFFFFF;outline:none;box-sizing:border-box"></label>
        <span style="font-size:12px;color:${MUTE}">Arraste o cartão para mudar a etapa</span>
      </div>
      ${c.erro ? `<div style="padding:12px 28px 0">${erroFaixa(c.erro)}</div>` : ""}
      <div data-scroll="funil" style="flex:1;min-height:0;overflow-x:auto;padding:16px 28px 24px;display:flex;gap:10px;align-items:stretch">${cols.map(coluna).join("")}</div>
    </div>`;
  }
  function leadCard(l, et){
    const t = l._timeline || {}, sdr = leadSdr(l), nome = leadNome(l), p = PALETA[(nome.length + String(l._phone || "").length) % PALETA.length];
    const quando = t.replied_at ? "respondeu " + diaOuHora(t.replied_at * 1000) : t.sent_at ? diaOuHora(t.sent_at * 1000) : "";
    return `<div draggable="true" data-wa-lead="${e(l._key)}" style="background:#FFFFFF;border-radius:10px;padding:12px;box-shadow:0 1px 2px rgba(20,20,30,.06);cursor:grab;user-select:none;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="width:32px;height:32px;flex:0 0 32px;border-radius:50%;background:${p[0]};color:${p[1]};font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:center">${e(iniciais(nome))}</span>
        <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(nome)}</div><div style="font-size:12px;color:${CINZA};font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${limpo(l.Empresa) ? e(limpo(l.Empresa)) + " · " : ""}${fmtFone(l._phone)}</div></div>
      </div>
      ${sdr || quando ? `<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:${CINZA}">
        ${sdr ? `<span style="display:flex;align-items:center;gap:5px;padding:2px 8px 2px 3px;border-radius:20px;background:#F6F6F7;min-width:0"><span style="width:16px;height:16px;flex:0 0 16px;border-radius:50%;background:${TINT};color:${ROXO_E};font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center">${e(iniciais(sdr))}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(sdr)}</span></span>` : ""}
        <span style="flex:1"></span><span style="white-space:nowrap">${quando}</span>
      </div>` : ""}
      ${l._notes ? `<div style="font-size:11.5px;color:#3C3C44;background:#FFFBEB;border:1px solid #FDE68A;border-radius:7px;padding:4px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(l._notes)}</div>` : ""}
    </div>`;
  }
  async function moverLead(key, stage){
    const c = W().crm, l = (c.leads || []).find(x => x._key === key); if(!l || l._stage === stage) return;
    const antes = l._stage; l._stage = stage; repaint();
    try { await crmApi("/stage", { method: "POST", body: { key, stage } }); if(W().modal && W().modal.tipo === "lead" && W().modal.key === key) modalHost(); }
    catch(err){ l._stage = antes; repaint(); falha("Não consegui mover o lead", err); }
  }
  let _notasTimer = null;
  function modalLead(m){
    const c = W().crm, l = (c.leads || []).find(x => x._key === m.key);
    if(!l) return shell(m, "Lead", "", `<div style="color:${CINZA};font-size:13px">Esse lead não está mais na lista.</div>`, `<span style="flex:1"></span><span data-wa-fechar style="${BTN_SEC}">Fechar</span>`);
    const t = l._timeline || {}, et = etapa(l._stage), sdr = leadSdr(l), fone = String(l._phone || "").replace(/\D/g, "");
    const conv = (W().conv.lista || []).find(x => fone && (String(x.chat_id).startsWith(fone + "@") || String(x.contact_phone) === fone));
    const info = [["Telefone", fmtFone(l._phone)], ["E-mail", l["E-mail Corporativo"]], ["Cargo", l["Posição"]], ["Cidade", [l.Cidade, l["Estado/Região"]].filter(Boolean).join(" / ")], ["Atendido por", sdr], ["Origem", l._key.startsWith("manual-") ? "Cadastro manual" : "Disparo do SDR"]].filter(x => x[1]);
    const marco = (ok, rot, ts) => `<div style="display:flex;align-items:center;gap:10px;font-size:12.5px"><span style="width:10px;height:10px;border-radius:50%;background:${ok ? et[2] : "#DADADF"};flex:0 0 10px"></span><span style="flex:1;color:${ok ? "#17171A" : "#9A9AA3"}">${rot}</span><span style="color:${CINZA}">${ok ? dataHora(ts * 1000) : ""}</span></div>`;
    return shell(m, e(leadNome(l)), limpo(l.Empresa) ? e(limpo(l.Empresa)) + (l["Posição"] ? " · " + e(l["Posição"]) : "") : "", `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">${info.map(x => `<div style="padding:10px 12px;border:1px solid #EFEFF1;border-radius:10px;background:#FAFAFA"><div style="font-size:11px;color:${CINZA}">${x[0]}</div><div style="font-size:13px;font-weight:500;margin-top:2px;word-break:break-word">${e(x[1])}</div></div>`).join("")}</div>
      <div><label style="${LBL}">Etapa no funil</label><div style="display:flex;flex-wrap:wrap;gap:6px">${ETAPAS.map(x => `<span data-wa-lead-etapa="${x[0]}" style="${CHIP};cursor:pointer;padding:6px 11px;background:${l._stage === x[0] ? x[2] : "#F1F1F3"};color:${l._stage === x[0] ? "#FFFFFF" : "#3C3C44"}"><span style="width:7px;height:7px;border-radius:50%;background:${l._stage === x[0] ? "#FFFFFF" : x[2]}"></span>${x[1]}</span>`).join("")}</div></div>
      <div style="border:1px solid #E6E6EA;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px">${marco(t.sent_at, "Disparo enviado", t.sent_at)}${marco(t.delivered_at, "Mensagem entregue", t.delivered_at)}${marco(t.replied_at, "Lead respondeu", t.replied_at)}</div>
      <div><label style="${LBL}">Anotações internas <span id="wa-notas-st" style="font-weight:500;text-transform:none;letter-spacing:0;color:#9A9AA3"></span></label><textarea data-wa-lead-notas rows="4" placeholder="Notas sobre este lead. Salva sozinho enquanto você escreve." style="${TA}">${e(l._notes || "")}</textarea></div>`,
      `${l._key.startsWith("manual-") || l._key.startsWith("sync-") ? `<span data-wa-lead-excluir style="${BTN_DANGER}">${icon(ICONS.trash, 13, "currentColor")}Excluir</span>` : ""}<span style="flex:1"></span>${conv ? `<span data-wa-lead-conversa="${conv.slot}|${e(conv.chat_id)}" style="${BTN_SEC}">${icon(ICONS.chatBubble, 13, "currentColor")}Ver conversa</span>` : ""}${fone ? `<a href="https://wa.me/${fone.startsWith("55") ? fone : "55" + fone}" target="_blank" rel="noopener" style="${BTN_SEC};text-decoration:none">${icon(ICONS.whatsapp, 13, VERDE)}Abrir no WhatsApp</a>` : ""}<span data-wa-fechar style="${BTN_SEC}">Fechar</span>`, 680);
  }
  // Estatísticas: calculadas aqui a partir dos leads do CRM, da fila dos SDRs e das conversas
  async function loadStats(){
    const w = W(), c = w.crm;
    try {
      const [leads, sdrsJ, convs] = await Promise.all([crmApi("/leads"), api("/sdrs"), api("/conversations?limit=300")]);
      c.leads = leads.leads || []; w.sdrs = sdrsJ.sdrs; w.conv.lista = convs.conversations;
      const cfgs = w.sdrs.filter(configurado);
      const stats = await Promise.all(cfgs.map(s => api(`/sdrs/${s.slot}/ai-stats`).then(j => ({ slot: s.slot, used: j.used_today || 0, last: j.last || [] })).catch(() => ({ slot: s.slot, used: 0, last: [] }))));
      c.stats = { ia: stats, em: Date.now() }; c.erro = null;
    } catch(err){ c.erro = err.message; }
    repaint();
  }
  function estatisticas(){
    const w = W(), c = w.crm, L = c.leads;
    if(!L || !c.stats) return `<div style="flex:1;min-width:0;padding:24px 28px">${c.erro ? vazio("Não consegui carregar", e(c.erro)) : `<div style="color:${CINZA};font-size:13px">Calculando...</div>`}</div>`;
    const sdrs = (w.sdrs || []).filter(configurado), convs = w.conv.lista || [];
    const rank = { disparado: 0, conversa_iniciada: 1, novo_lead: 2, em_negociacao: 3, chamar_novamente: 3, iniciou_compra: 4, finalizou_compra: 5, perdido: 99 };
    const respondeu = l => (l._timeline || {}).replied_at || (rank[l._stage] >= 2 && l._stage !== "perdido");
    const n = L.length, entregues = L.filter(l => (l._timeline || {}).delivered_at || (rank[l._stage] >= 1 && l._stage !== "perdido")).length, responderam = L.filter(respondeu).length;
    const negoc = L.filter(l => ["em_negociacao", "chamar_novamente", "iniciou_compra"].includes(l._stage)).length, fechados = L.filter(l => l._stage === "finalizou_compra").length, perdidos = L.filter(l => l._stage === "perdido").length;
    const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
    const tempos = L.map(l => l._timeline || {}).filter(t => t.sent_at && t.replied_at && t.replied_at > t.sent_at).map(t => t.replied_at - t.sent_at).sort((a, b) => a - b);
    const mediana = tempos.length ? tempos[Math.floor(tempos.length / 2)] : null;
    const dur = s => s == null ? "—" : s < 3600 ? Math.round(s / 60) + " min" : s < 86400 ? (s / 3600).toFixed(1).replace(".", ",") + " h" : Math.round(s / 86400) + " d";
    const fila = (w.sdrs || []).reduce((a, s) => ({ p: a.p + (s.upload_pending || 0), s: a.s + (s.upload_sent || 0), e: a.e + (s.upload_error || 0) }), { p: 0, s: 0, e: 0 });
    const naoLidas = convs.filter(x => x.unread).length, iaHoje = c.stats.ia.reduce((a, x) => a + x.used, 0), iaErros = c.stats.ia.reduce((a, x) => a + x.last.filter(y => y.status !== "ok").length, 0);
    const passo = (rot, v, p, ultimo) => `<div style="padding:18px 20px;${ultimo ? "" : "border-right:1px solid #EEEEF1"}">
        <div style="font-size:12px;color:${CINZA}">${rot}</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px"><span style="${HEAD};font-size:28px;font-weight:600">${v}</span>${p == null ? "" : `<span style="font-size:12.5px;color:${ROXO_E};font-weight:600">${p}%</span>`}</div>
        <div style="height:4px;border-radius:4px;background:#F1F1F3;margin-top:12px;overflow:hidden"><div style="height:100%;width:${p == null ? 100 : p}%;background:${ROXO};border-radius:4px"></div></div></div>`;
    const card = (t, sub, corpo, semPad) => `<div style="background:#FFFFFF;border:1px solid #E6E6EA;border-radius:14px;padding:${semPad ? "20px 0 8px" : "20px"}"><div style="${semPad ? "padding:0 20px" : ""}"><div style="${HEAD};font-weight:600;font-size:15px">${t}</div><div style="font-size:12.5px;color:${CINZA};margin-bottom:${semPad ? 12 : 18}px">${sub}</div></div>${corpo}</div>`;
    // últimos 14 dias, em horário de Brasília
    const hojeBRT = new Date(new Date().toLocaleString("en-US", BRT)); hojeBRT.setHours(0, 0, 0, 0);
    const dias = Array.from({ length: 14 }, (_, i) => { const d = new Date(hojeBRT); d.setDate(d.getDate() - (13 - i)); return d; });
    const chave = ts => new Date(new Date(ts * 1000).toLocaleString("en-US", BRT)).toDateString();
    const serie = campo => dias.map(d => L.filter(l => (l._timeline || {})[campo] && chave(l._timeline[campo]) === d.toDateString()).length);
    const env = serie("sent_at"), resp = serie("replied_at"), maxDia = Math.max(1, ...env, ...resp);
    const grafico = `<div style="display:flex;align-items:flex-end;gap:6px;height:150px;border-bottom:1px solid #EEEEF1">${dias.map((d, i) => `<div title="${d.toLocaleDateString("pt-BR")}: ${env[i]} disparo${env[i] === 1 ? "" : "s"}, ${resp[i]} resposta${resp[i] === 1 ? "" : "s"}" style="flex:1;display:flex;align-items:flex-end;justify-content:center;gap:2px;height:100%"><div style="width:45%;max-width:9px;height:${Math.round(env[i] / maxDia * 100)}%;min-height:2px;border-radius:4px 4px 0 0;background:#DADADF"></div><div style="width:45%;max-width:9px;height:${Math.round(resp[i] / maxDia * 100)}%;min-height:${resp[i] ? 2 : 0}px;border-radius:4px 4px 0 0;background:${ROXO}"></div></div>`).join("")}</div>
      <div style="display:flex;gap:6px;margin-top:6px">${dias.map(d => `<span style="flex:1;text-align:center;font-size:10.5px;color:${MUTE}">${d.getDate()}</span>`).join("")}</div>
      <div style="display:flex;gap:14px;font-size:11.5px;color:${CINZA};margin-top:12px"><span style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:2px;background:#DADADF"></span>Disparos</span><span style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:2px;background:${ROXO}"></span>Respostas</span></div>`;
    // por SDR: leads, quantos responderam e uso da IA hoje
    const COLS = "grid-template-columns:minmax(0,1.6fr) 0.6fr 0.6fr 0.9fr;gap:10px";
    const porSdr = sdrs.map(s => { const ls = L.filter(l => l._dispatch_slot === s.slot), ia = c.stats.ia.find(x => x.slot === s.slot) || { used: 0, last: [] }, erro = ia.last[0] && ia.last[0].status !== "ok"; return { s, n: ls.length, resp: pct(ls.filter(respondeu).length, ls.length), ia: `${ia.used}${s.ai_daily_limit ? " / " + s.ai_daily_limit : ""}${erro ? " · erro" : ""}`, iaCor: erro ? "#B02E26" : ia.used ? "#1E7A4D" : CINZA }; }).sort((a, b) => b.n - a.n);
    const tabela = porSdr.length ? `<div style="display:grid;${COLS};padding:8px 20px;font-size:11px;letter-spacing:0.08em;font-weight:700;color:${MUTE};border-bottom:1px solid #EEEEF1"><span>SDR</span><span style="text-align:right">LEADS</span><span style="text-align:right">RESP.</span><span style="text-align:right">IA HOJE</span></div>
      ${porSdr.map(x => `<div style="display:grid;${COLS};align-items:center;padding:11px 20px;border-bottom:1px solid #F4F4F6;font-size:13px"><span style="display:flex;align-items:center;gap:8px;min-width:0"><span title="${e(subStatus(x.s))}" style="width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:${corStatus(x.s.status || "idle")}"></span><span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(nomeSlot(x.s))}</span></span><span style="text-align:right">${x.n}</span><span style="text-align:right;color:${CINZA}">${x.resp}%</span><span style="text-align:right;color:${x.iaCor}">${x.ia}</span></div>`).join("")}` : `<div style="padding:0 20px 12px;font-size:12.5px;color:${CINZA}">Nenhum SDR configurado.</div>`;
    const porEtapa = ETAPAS.map(et => [et, L.filter(l => l._stage === et[0]).length]), maxEt = Math.max(1, ...porEtapa.map(x => x[1]));
    const etapas = `<div style="display:flex;flex-direction:column;gap:10px">${porEtapa.map(([et, v]) => `<div style="display:flex;align-items:center;gap:12px;font-size:12.5px"><span style="display:flex;align-items:center;gap:8px;width:170px;flex:0 0 170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:${et[2]}"></span>${et[1]}</span><span style="flex:1;height:6px;border-radius:6px;background:#F1F1F3;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(v ? 2 : 0, Math.round(v / maxEt * 100))}%;background:${et[2]};border-radius:6px"></span></span><strong style="width:34px;text-align:right">${v}</strong><span style="width:40px;text-align:right;color:${CINZA};font-size:11.5px">${pct(v, n)}%</span></div>`).join("")}</div>`;
    return `<div data-scroll="res" style="flex:1;min-width:0;overflow-y:auto;padding:24px 28px 60px">
      <div style="max-width:1120px;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;font-size:12px;color:${MUTE}"><span style="flex:1;font-size:13px;color:${CINZA}">Funil dos leads disparados pelos SDRs</span>Atualizado ${hora(c.stats.em)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));background:#FFFFFF;border:1px solid #E6E6EA;border-radius:14px;overflow:hidden">
          ${passo("Leads no funil", n, null)}${passo("Receberam", entregues, pct(entregues, n))}${passo("Responderam", responderam, pct(responderam, n))}${passo("Em negociação", negoc, pct(negoc, n))}${passo("Fecharam", fechados, pct(fechados, n), true)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px 28px;padding:14px 20px;background:#FFFFFF;border:1px solid #E6E6EA;border-radius:12px;font-size:13px;color:${CINZA}">
          <span><strong style="color:#17171A">${fila.p}</strong> na fila de disparo · ${fila.s} enviado${fila.s === 1 ? "" : "s"}${fila.e ? ` · <span style="color:#B02E26">${fila.e} com erro</span>` : ""}</span>
          <span><strong style="color:#17171A">${convs.length}</strong> conversa${convs.length === 1 ? "" : "s"} aberta${convs.length === 1 ? "" : "s"} · ${naoLidas} sem ler</span>
          <span>Tempo até a resposta: <strong style="color:#17171A">${dur(mediana)}</strong></span>
          <span><strong style="color:#17171A">${iaHoje}</strong> resposta${iaHoje === 1 ? "" : "s"} por IA hoje${iaErros ? ` · <span style="color:#B02E26">${iaErros} com erro</span>` : ""}</span>
          <span><strong style="color:#17171A">${perdidos}</strong> perdido${perdidos === 1 ? "" : "s"}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr));gap:16px">
          ${card("Disparos e respostas", "Últimos 14 dias", grafico)}
          ${card("Por SDR", "Leads, respostas e uso da IA hoje", tabela, true)}
        </div>
        ${card("Por etapa", "Onde os leads estão agora", etapas)}
      </div>
    </div>`;
  }
  function tags(){
    const c = W().crm, ts = c.tags;
    return `<div>
      <div style="${BOX};padding:6px 20px">${!ts ? `<div style="padding:14px 0;font-size:13px;color:${CINZA}">${c.tagsErro ? e(c.tagsErro) : "Carregando..."}</div>` : !ts.length ? `<div style="padding:24px 0;font-size:13px;color:${CINZA};text-align:center">Nenhuma tag ainda.</div>` : ts.map(t => `<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-top:1px solid #F1F1F3"><span style="width:12px;height:12px;border-radius:50%;background:${e(t.color || CINZA)};margin-top:4px;flex:0 0 12px"></span><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:13.5px;font-weight:600">${e(t.name)}</span>${t.is_system ? `<span style="${CHIP};background:#F1F1F3;color:${CINZA}">sistema</span>` : ""}<span style="font-size:11.5px;color:${CINZA}">${e(t.category)} · usada ${t.usage_count}×</span></div><div style="font-size:12.5px;color:${t.instruction ? "#3C3C44" : "#9A9AA3"};margin-top:3px;line-height:1.5">${t.instruction ? e(t.instruction) : "Sem instrução: a IA marca pelo nome e pela categoria."}</div></div>${t.is_system ? "" : `<span data-wa-tag-editar="${t.id}" data-hover title="Editar" style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.edit, 14, CINZA)}</span><span data-wa-tag-del="${t.id}" data-hover title="Excluir" style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.trash, 14, CINZA)}</span>`}</div>`).join("")}</div>
    </div>`;
  }

  // ─── eventos ─────────────────────────────────────────────────────────────────
  // troca de aba: muda a tela e busca o que ela precisa
  function carregar(){
    const w = W(), v = w.view;
    if(v === "conversas"){ loadConv(true); if(!w.crm.leads) loadLeads(true); }
    if(v === "sdrs") loadSdrs(true);
    if(v === "maturacao"){ loadSdrs(true); loadMat(); }
    if(v === "chaves") loadKeys();
    if(v === "leads"){ if(!w.conv.lista) loadConv(true); loadLeads(!!w.crm.leads); }
    if(v === "estatisticas") loadStats();
    if(v === "tags") loadTags();
  }
  function ir(v){ const w = W(); w.view = v; w.error = null; w.sdrMenu = false; repaint(); carregar(); }
  function repaint(so){
    const root = document.getElementById("wa-root"); if(!root || state.screen !== "whatsapp") return;
    if(so === "msgs"){ const box = document.getElementById("wa-msgs"); if(box){ const fim = box.scrollHeight - box.scrollTop - box.clientHeight < 80; box.innerHTML = msgsHTML(); if(fim) box.scrollTop = box.scrollHeight; } return; }
    // só a lista de conversas e os contadores do topo (a conversa aberta e o que a pessoa digita ficam como estão)
    if(so === "lista"){ const box = document.getElementById("wa-lista"), top = document.getElementById("wa-top"); if(box){ box.innerHTML = listaHTML(); bind(box); } if(top && !W().sdrMenu){ top.innerHTML = topo(); bind(top); } return; }
    const ativo = document.activeElement, keep = ativo && root.contains(ativo) && ativo.dataset && ativo.dataset.keep ? { k: ativo.dataset.keep, v: ativo.value, s: ativo.selectionStart } : null;
    const rolagem = {}; root.querySelectorAll("[data-scroll]").forEach(el => { rolagem[el.dataset.scroll] = [el.scrollTop, el.scrollLeft]; });
    const antes = document.getElementById("wa-msgs"), longeDoFim = antes && W().conv.msgs && antes.scrollHeight - antes.scrollTop - antes.clientHeight >= 80 ? antes.scrollTop : null;
    root.innerHTML = page(); bind(root);
    root.querySelectorAll("[data-scroll]").forEach(el => { const r = rolagem[el.dataset.scroll]; if(r){ el.scrollTop = r[0]; el.scrollLeft = r[1]; } });
    const box = document.getElementById("wa-msgs"); if(box) box.scrollTop = longeDoFim == null ? box.scrollHeight : longeDoFim;
    if(keep){ const el = root.querySelector(`[data-keep="${keep.k}"]`); if(el){ el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch(err){} } }
    // o modal não é redesenhado aqui (apagaria o que a pessoa está digitando); só some se tiver sido fechado
    if(!W().modal && document.getElementById("wa-modal-host")) modalHost();
  }
  function bind(root){
    const q = sel => root.querySelectorAll(sel);
    q("[data-wa-view]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); ir(el.dataset.waView); }));
    // topo: seletor de SDR (filtra conversas e funil)
    q("[data-wa-sdrmenu]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const w = W(); w.sdrMenu = !w.sdrMenu; const top = document.getElementById("wa-top"); if(top){ top.innerHTML = topo(); bind(top); } }));
    q("[data-wa-sdr-pick]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const w = W(); w.sdrFiltro = el.dataset.waSdrPick; w.sdrMenu = false; w.conv.lista = null; w.conv.aberta = null; w.conv.msgs = null; repaint(); loadConv(true); }));
    // conversas: filtro, painel do lead, IA do SDR e etapa
    q("[data-wa-cf]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); W().conv.cf = el.dataset.waCf; repaint(); }));
    q("[data-wa-sync]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); sincronizarConversas(); }));
    q("[data-wa-detalhes]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); W().detalhes = !detalhesOn(); repaint(); }));
    q("[data-wa-conv-ia]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const slot = +el.dataset.waConvIa, s = porSlot(slot); if(!s) return; if(!await zConfirm(s.ai_active ? `Pausar o agente de "${nomeSlot(s)}"? Ele para de responder em todas as conversas deste SDR, não só nesta. Você responde por aqui até religar.` : `Religar o agente de "${nomeSlot(s)}"? Ele volta a responder em todas as conversas deste SDR.`, { ok: s.ai_active ? "Pausar agente" : "Religar agente" })) return; acao("toggle", slot); }));
    q("[data-wa-det-etapa]").forEach(el => bindOnce(el, "change", () => moverLead(el.dataset.waDetEtapa, el.value)));
    // CRM: leads
    q("[data-wa-lead-busca]").forEach(el => bindOnce(el, "input", () => { W().crm.busca = el.value; repaint(); }));
    q("[data-wa-lead-novo]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const a = W().conv.aberta; abrirModal({ tipo: "novoLead", pre: el.dataset.waLeadNovo === "conv" && a ? { nome: a.contact_name || "", telefone: convFone(a) } : null }); }));
    q("[data-wa-lead]").forEach(el => { bindOnce(el, "click", ev => { ev.stopPropagation(); abrirModal({ tipo: "lead", key: el.dataset.waLead }); }); bindOnce(el, "dragstart", ev => { W().crm.arrasto = el.dataset.waLead; ev.dataTransfer.effectAllowed = "move"; try { ev.dataTransfer.setData("text/plain", el.dataset.waLead); } catch(err){} el.style.opacity = ".5"; }); bindOnce(el, "dragend", () => { W().crm.arrasto = null; el.style.opacity = ""; }); });
    q("[data-wa-col]").forEach(el => { const solta = () => { el.style.borderColor = "transparent"; el.style.background = "#EFEFF1"; }; bindOnce(el, "dragover", ev => { if(!W().crm.arrasto) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; el.style.borderColor = ROXO; el.style.background = "#E9E4FB"; }); bindOnce(el, "dragleave", solta); bindOnce(el, "drop", ev => { ev.preventDefault(); const key = W().crm.arrasto || ev.dataTransfer.getData("text/plain"); W().crm.arrasto = null; solta(); if(key) moverLead(key, el.dataset.waCol); }); });
    q("[data-wa-lead-etapa]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); moverLead(W().modal.key, el.dataset.waLeadEtapa); }));
    q("[data-wa-lead-notas]").forEach(el => bindOnce(el, "input", () => { const key = el.dataset.waLeadNotas || W().modal.key, st = (el.parentNode && el.parentNode.querySelector("[data-wa-notas-st]")) || document.getElementById("wa-notas-st"); if(st) st.textContent = "· salvando..."; clearTimeout(_notasTimer); _notasTimer = setTimeout(async () => { try { await crmApi("/notes", { method: "POST", body: { key, notes: el.value } }); const l = (W().crm.leads || []).find(x => x._key === key); if(l) l._notes = el.value; if(st) st.textContent = "· salvo"; } catch(err){ if(st) st.textContent = "· não salvou: " + err.message; } }, 600); }));
    q("[data-wa-lead-conversa]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const [slot, chat] = el.dataset.waLeadConversa.split("|"); fecharModal(); W().view = "conversas"; W().conv.cf = "todas"; W().conv.busca = ""; repaint(); abrirConversa(+slot, chat); }));
    q("[data-wa-lead-excluir]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal, l = (W().crm.leads || []).find(x => x._key === m.key); if(!await zConfirm(`Excluir o lead "${l ? leadNome(l) : ""}" do CRM? As anotações somem junto. O contato continua na lista de disparo do SDR.`, { ok: "Excluir", danger: true })) return; try { await crmApi(`/manual-lead/${encodeURIComponent(m.key)}`, { method: "DELETE" }); fecharModal(); cfgToast("Lead excluído."); loadLeads(true); } catch(err){ falha("Não consegui excluir", err); } }));
    q("[data-wa-lead-criar]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const v = k => ((root.querySelector(`[data-f="${k}"]`) || {}).value || "").trim(); if(!v("nome")) return zAlert("Informe o nome do lead."); const tel = v("telefone").replace(/\D/g, ""); if(tel && tel.length < 10) return zAlert("Telefone curto. Use DDI + DDD + número."); try { await crmApi("/manual-lead", { method: "POST", body: { nome: v("nome"), empresa: v("empresa"), telefone: tel, email: v("email"), posicao: v("posicao"), cidade: v("cidade"), estado: v("estado").toUpperCase() } }); fecharModal(); cfgToast("Lead criado. Ele entra na etapa Novo lead do funil."); loadLeads(true); } catch(err){ falha("Não consegui criar o lead", err); } }));
    // CRM: tags
    q("[data-wa-tag-nova]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); abrirModal({ tipo: "tag" }); }));
    q("[data-wa-tag-editar]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const t = (W().crm.tags || []).find(x => String(x.id) === el.dataset.waTagEditar); if(t) abrirModal({ tipo: "tag", tag: t }); }));
    q("[data-wa-tag-salvar]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal, v = k => ((root.querySelector(`[data-f="${k}"]`) || {}).value || "").trim(); if(!m.tag && !v("name")) return zAlert("Dê um nome à tag."); if(!v("instruction")) return zAlert("Escreva a instrução. A IA precisa saber quando marcar."); try { if(m.tag) await crmApi(`/tags/update/${m.tag.id}`, { method: "POST", body: { instruction: v("instruction"), category: v("category"), color: v("color") } }); else await crmApi("/tags/create", { method: "POST", body: { name: v("name"), category: v("category"), color: v("color"), instruction: v("instruction") } }); fecharModal(); cfgToast(m.tag ? "Tag atualizada." : "Tag cadastrada."); loadTags(); } catch(err){ falha("Não consegui salvar a tag", err.codigo === "tag_already_exists" ? "já existe uma tag com esse nome" : err.codigo === "name_invalid" ? "nome inválido" : err); } }));
    q("[data-wa-tag-del]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const t = (W().crm.tags || []).find(x => String(x.id) === el.dataset.waTagDel); if(!await zConfirm(`Excluir a tag "${t ? t.name : ""}"? Ela sai de todos os leads.`, { ok: "Excluir", danger: true })) return; try { await crmApi(`/tags/${el.dataset.waTagDel}`, { method: "DELETE" }); cfgToast("Tag excluída."); loadTags(); } catch(err){ falha("Não consegui excluir", err); } }));
    q("[data-wa-todos]").forEach(el => bindOnce(el, "click", ev => { ev.preventDefault(); ev.stopPropagation(); W().todos = !W().todos; repaint(); }));
    q("[data-wa-novo]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const w = W(); w.sdrMenu = false; if(w.view !== "sdrs"){ w.view = "sdrs"; repaint(); } novoSdr(); }));
    q("[data-wa-act]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); ev.preventDefault(); if(el.hasAttribute("data-wa-fechar-depois")) fecharModal(); acao(el.dataset.waAct, +el.dataset.slot); }));
    // modais
    q("[data-wa-fechar]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); fecharModal(); }));
    q("[data-wa-backdrop]").forEach(el => bindOnce(el, "click", ev => { if(ev.target === el){ ev.stopPropagation(); fecharModal(); } }));
    q("[data-wa-salvar-nome]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal; const nome = (root.querySelector('[data-f="name"]') || {}).value || "", cargo = (root.querySelector('[data-f="role_label"]') || {}).value || "";
      if(!nome.trim()) return zAlert("Dê um nome ao SDR."); try { await api(`/sdrs/${m.slot}`, { method: "PATCH", body: { name: nome.trim(), role_label: cargo.trim() } }); const novo = m.novo; fecharModal(); await loadSdrs(true); if(novo){ cfgToast(`SDR "${nome.trim()}" criado. Agora conecte um chip ou ative com o ZEUS.`); } } catch(err){ falha("Não consegui salvar", err); } }));
    q("[data-wa-ativar]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal, slot = m.slot;
      if(el.dataset.waAtivar === "chip"){ fecharModal(); return abrirConectar(slot); }
      try { await api(`/sdrs/${slot}/zeus-mode`, { method: "POST", body: { enabled: true } }); fecharModal(); cfgToast(`ZEUS ativado em "${nomeSlot(porSlot(slot))}". Ele responde por esse SDR quando o gatilho bater.`); loadSdrs(true); } catch(err){ falha("Não consegui ativar", err); } }));
    q("[data-wa-conectar-aba]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const m = W().modal; const inp = root.querySelector('[data-f="fone"]'); if(inp) m.fone = inp.value; m.aba = el.dataset.waConectarAba; if(m.aba === "token" && !m.codigo) m.aviso = "Informe o número do chip e clique em Gerar código."; else if(m.aba === "qr" && !m.qr) m.aviso = "Gerando QR code, aguarde..."; modalHost(); }));
    q("[data-wa-conectar-novo]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal; m.qr = null; m.aviso = "Reiniciando a sessão e gerando um QR code novo..."; conectarPaint(); try { await api(`/sdrs/${m.slot}/reconnect`, { method: "POST" }); } catch(err){ m.aviso = err.message; conectarPaint(); } }));
    q("[data-wa-pair]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); pedirCodigo(el.dataset.waPair === "1"); }));
    q('[data-f="fone"]').forEach(el => bindOnce(el, "keydown", ev => { if(ev.key === "Enter"){ ev.preventDefault(); pedirCodigo(false); } }));
    q("[data-wa-salvar-instrucoes]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal, ta = root.querySelector('[data-f="instructions"]'); try { await api(`/sdrs/${m.slot}/instructions`, { method: "PUT", body: { instructions: ta ? ta.value : "" } }); fecharModal(); cfgToast("Instruções salvas."); loadSdrs(true); } catch(err){ falha("Não consegui salvar", err); } }));
    // config
    q("[data-wa-modo]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); sincronizar(); const m = W().modal; m.d.sdr_mode = el.dataset.waModo; m.aba = ABAS[m.d.sdr_mode][0][0]; modalHost(); }));
    q("[data-wa-aba]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); sincronizar(); W().modal.aba = el.dataset.waAba; modalHost(); if(W().modal.aba === "contatos") jobsRefresh(); }));
    q("[data-wa-trigmode]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); sincronizar(); W().modal.d.trigger_mode = el.dataset.waTrigmode; modalHost(); }));
    q("[data-wa-msg-add]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); sincronizar(); W().modal.d.dispatch_messages.push(""); modalHost(); const tas = document.querySelectorAll("#wa-modal-host [data-cfg-msg]"); if(tas.length) tas[tas.length - 1].focus(); }));
    q("[data-wa-msg-del]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); sincronizar(); W().modal.d.dispatch_messages.splice(+el.dataset.waMsgDel, 1); modalHost(); }));
    const addTrig = () => { sincronizar(); const m = W().modal, inp = document.querySelector('#wa-modal-host [data-f="trig"]'); if(!inp) return; inp.value.split(",").map(x => x.trim().toLowerCase()).filter(Boolean).forEach(t => { if(!m.d.triggers.includes(t)) m.d.triggers.push(t); }); modalHost(); const novo = document.querySelector('#wa-modal-host [data-f="trig"]'); if(novo) novo.focus(); };
    q("[data-wa-trig-add]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); addTrig(); }));
    q('[data-f="trig"]').forEach(el => bindOnce(el, "keydown", ev => { if(ev.key === "Enter"){ ev.preventDefault(); addTrig(); } }));
    q("[data-wa-trig-del]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); sincronizar(); W().modal.d.triggers.splice(+el.dataset.waTrigDel, 1); modalHost(); }));
    q('[data-cfg="personality_level"]').forEach(el => bindOnce(el, "input", () => { const v = document.getElementById("wa-pers"); if(v) v.textContent = el.value; }));
    q('[data-cfg="ai_key_id"],[data-cfg="ai_provider"]').forEach(el => bindOnce(el, "change", () => { sincronizar(); const m = W().modal; if(el.dataset.cfg === "ai_provider") m.d.ai_model = ""; modalHost(); }));
    q('[data-cfg^="send_"][type="checkbox"]').forEach(el => bindOnce(el, "change", () => { const k = el.dataset.cfg.replace(/^send_|_enabled$/g, ""); const bl = root.querySelector(`[data-wa-rec="${k}"]`); if(bl) bl.style.display = el.checked ? "flex" : "none"; }));
    q("[data-wa-midia]").forEach(el => bindOnce(el, "change", () => { const f = el.files && el.files[0]; el.value = ""; enviarMidia(el.dataset.waMidia, f); }));
    q("[data-wa-ia]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal; try { if(el.dataset.waIa === "pausar"){ const r = await api(`/sdrs/${m.slot}/ai-pause`, { method: "POST", body: { minutes: 10 } }); sincronizar(); m.d.ai_paused_until = r.paused_until; cfgToast("IA pausada por 10 minutos."); } else { await api(`/sdrs/${m.slot}/ai-resume`, { method: "POST" }); sincronizar(); m.d.ai_paused_until = null; cfgToast("IA retomada."); } modalHost(); } catch(err){ falha("Não consegui", err); } }));
    q("[data-wa-reset-memoria]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal, s = porSlot(m.slot); if(!await zConfirm(`Resetar a memória de conversas de "${nomeSlot(s)}"? Histórico interno, vínculos, log de IA e disparos já feitos deste SDR serão apagados. Isso não tem volta.`, { ok: "Resetar" })) return;
      try { const r = await api(`/sdrs/${m.slot}/reset-memory`, { method: "POST" }); const d = r.deleted || {}; zAlert(`Memória de "${nomeSlot(s)}" resetada.\n\nMensagens: ${d.messages || 0}\nConversas: ${d.conversations || 0}\nVínculos: ${d.bindings || 0}\nInterações de IA: ${d.interactions || 0}\nDisparos antigos: ${d.jobs || 0}`, { erro: false }); jobsRefresh(); loadSdrs(true); } catch(err){ falha("Não consegui resetar", err); } }));
    q("[data-wa-manual]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const f = root.querySelector('[data-f="manual-fone"]'), n = root.querySelector('[data-f="manual-nome"]'); const d = String(f.value || "").replace(/\D/g, ""); if(d.length < 10) return zAlert("Número curto. Use DDI + DDD + número (ex.: 5511987654321)."); const r = await enviarContatos([{ phone: d, name: (n.value || "").trim() || null }], "Contato"); if(r && r.added){ f.value = ""; n.value = ""; f.focus(); } }));
    q('[data-f="manual-fone"],[data-f="manual-nome"]').forEach(el => bindOnce(el, "keydown", ev => { if(ev.key === "Enter"){ ev.preventDefault(); const b = root.querySelector("[data-wa-manual]"); if(b) b.click(); } }));
    q("[data-wa-lista-salvar]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const ta = root.querySelector('[data-f="lista"]'); const c = parseLista(ta.value); if(!c.length) return zAlert("Nenhum contato válido. Um por linha, com DDI e DDD (ex.: 5511999998888,Fulano)."); if(!await zConfirm(`Salvar ${c.length} contato${c.length === 1 ? "" : "s"} na lista deste SDR?`)) return; const r = await enviarContatos(c, "Lista colada"); if(r) ta.value = ""; }));
    q("[data-wa-arquivo]").forEach(el => bindOnce(el, "change", async () => { const f = el.files && el.files[0]; el.value = ""; if(!f) return; const m = W().modal;
      if(/\.xlsx?$/i.test(f.name)){ const fd = new FormData(); fd.append("file", f); try { const r = await api(`/sdrs/${m.slot}/upload-xlsx`, { method: "POST", form: fd }); resultadoUpload(r, "Planilha"); jobsRefresh(); loadSdrs(true); } catch(err){ falha("Não consegui ler a planilha", err); } return; }
      const buf = new Uint8Array(await f.arrayBuffer()); let enc = "utf-8"; if(buf[0] === 0xFF && buf[1] === 0xFE) enc = "utf-16le"; else if(buf[0] === 0xFE && buf[1] === 0xFF) enc = "utf-16be"; const txt = new TextDecoder(enc).decode(buf); const ta = root.querySelector('[data-f="lista"]'); if(ta){ ta.value = txt; const b = root.querySelector("[data-wa-lista-salvar]"); if(b) b.click(); } }));
    q("[data-wa-sheet]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const inp = root.querySelector('[data-f="sheet"]'); const url = (inp.value || "").trim(); if(!url) return zAlert("Cole o link do Google Sheets primeiro."); const m = W().modal; try { const r = await api(`/sdrs/${m.slot}/upload-sheet`, { method: "POST", body: { url } }); resultadoUpload(r, "Planilha"); jobsRefresh(); loadSdrs(true); if(r.added) inp.value = ""; } catch(err){ falha("Não consegui ler a planilha", err); } }));
    q("[data-wa-job-del]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal; try { await api(`/sdrs/${m.slot}/upload-jobs/${el.dataset.waJobDel}`, { method: "DELETE" }); jobsRefresh(); loadSdrs(true); } catch(err){ falha("Não consegui remover", err); } }));
    q("[data-wa-jobs-cancelar]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const m = W().modal; if(!await zConfirm("Cancelar todos os contatos pendentes deste SDR? Os que já receberam continuam no histórico.", { ok: "Cancelar pendentes" })) return; try { await api(`/sdrs/${m.slot}/upload-jobs`, { method: "DELETE" }); jobsRefresh(); loadSdrs(true); } catch(err){ falha("Não consegui cancelar", err); } }));
    q("[data-wa-salvar-config]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); salvarConfig(); }));
    // conversas
    q("[data-wa-conv-busca]").forEach(el => bindOnce(el, "input", () => { W().conv.busca = el.value; repaint("lista"); }));
    q("[data-wa-conv-abrir]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const [slot, chat] = el.dataset.waConvAbrir.split("|"); abrirConversa(+slot, chat); }));
    q("[data-wa-reply]").forEach(el => bindOnce(el, "submit", ev => { ev.preventDefault(); const ta = el.querySelector("[data-wa-reply-texto]"); const t = ta.value; ta.value = ""; ta.style.height = ""; responder(t); }));
    q("[data-wa-reply-texto]").forEach(el => { bindOnce(el, "keydown", ev => { if(ev.key === "Enter" && !ev.shiftKey){ ev.preventDefault(); el.form.requestSubmit(); } }); bindOnce(el, "input", () => { el.style.height = "auto"; el.style.height = Math.min(140, el.scrollHeight) + "px"; }); });
    // maturação
    q("[data-wa-mat-toggle]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const cfg = W().mat && W().mat.config; if(!cfg) return; try { await api("/maturation/config", { method: "PUT", body: { enabled: !cfg.enabled } }); cfgToast(cfg.enabled ? "Aquecimento desligado." : "Aquecimento ligado."); loadMat(); } catch(err){ falha("Não consegui alterar", err); } }));
    q("[data-wa-mat-salvar]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const b = {}; root.querySelectorAll("[data-mat]").forEach(i => { b[i.dataset.mat] = parseInt(i.value, 10); }); if(Object.values(b).some(v => !Number.isFinite(v) || v < 0)) return zAlert("Preencha todos os campos com números válidos."); if(b.min_turns > b.max_turns || b.min_delay_seconds > b.max_delay_seconds) return zAlert("O mínimo não pode ser maior que o máximo."); try { await api("/maturation/config", { method: "PUT", body: b }); cfgToast("Configuração salva."); loadMat(); } catch(err){ falha("Não consegui salvar", err); } }));
    q("[data-wa-mat-slot]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); try { await api(`/maturation/slot/${el.dataset.waMatSlot}`, { method: "POST", body: { enabled: el.dataset.on !== "1" } }); loadMat(); } catch(err){ falha("Não consegui alterar", err); } }));
    // chaves
    q("[data-wa-chave-nova]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); abrirModal({ tipo: "chave" }); }));
    q("[data-wa-salvar-chave]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const v = k => (root.querySelector(`[data-f="${k}"]`) || {}).value || ""; if(v("key").trim().length < 12) return zAlert("Cole a chave completa."); try { await api("/system/keys", { method: "POST", body: { provider: v("provider"), label: v("label").trim() || undefined, key: v("key").trim() } }); fecharModal(); cfgToast("Chave cadastrada."); loadKeys(); } catch(err){ falha("Não consegui cadastrar", err); } }));
    q("[data-wa-chave-del]").forEach(el => bindOnce(el, "click", async ev => { ev.stopPropagation(); const k = (W().keys || []).find(x => String(x.id) === el.dataset.waChaveDel); if(!await zConfirm(`Excluir a chave "${k ? k.label : ""}"? Se algum SDR usa essa chave, a exclusão é recusada.`, { ok: "Excluir" })) return; try { await api(`/system/keys/${el.dataset.waChaveDel}`, { method: "DELETE" }); cfgToast("Chave excluída."); loadKeys(); } catch(err){ falha("Não consegui excluir", err); } }));
  }
  document.addEventListener("keydown", ev => { if(ev.key === "Escape" && state.screen === "whatsapp"){ if(W().modal) fecharModal(); else if(W().sdrMenu){ W().sdrMenu = false; repaint(); } } });
  // clique fora fecha o seletor de SDR
  document.addEventListener("click", ev => { const w = state.waSdr; if(!w || !w.sdrMenu || state.screen !== "whatsapp") return; if(ev.target.closest && ev.target.closest("[data-wa-sdrbox]")) return; w.sdrMenu = false; const p = document.getElementById("wa-sdr-pop"); if(p) p.remove(); }, true);

  // ─── plug na Central ────────────────────────────────────────────────────────
  RENDERERS.whatsapp = function(){
    if(typeof souAdmin === "function" && !souAdmin()) return `<div style="padding:34px 40px"><h1 style="${HEAD};font-size:25px;font-weight:600;margin:0 0 6px">WhatsApp</h1><p style="margin:0;color:${CINZA}">Só administradores da conta acessam o WhatsApp, porque ele controla os números, os disparos e a IA dos SDRs.</p></div>`;
    setTimeout(() => {
      const root = document.getElementById("wa-root"); if(!root) return;
      bind(root); modalHost(); pollingOn();
      const w = W();
      if(!w.sdrs && !w.loading) loadSdrs(true);
      carregar();
      // os contadores das abas (não lidas e leads) valem em qualquer aba
      if(w.view !== "conversas" && !w.conv.lista) loadConv(true);
      if(w.view !== "conversas" && w.view !== "leads" && w.view !== "estatisticas" && !w.crm.leads) loadLeads(true);
    }, 0);
    return `<div id="wa-root">${page()}</div>`;
  };
  if(state.screen === "whatsapp"){ const slot = document.getElementById("main-slot"); if(slot){ slot.innerHTML = RENDERERS.whatsapp(); } }
})();
