// Novo visual "Roxo + magenta" da Central (handoff em design-system/novo-visual/design_handoff_zeus_central_magenta).
// Carregado por último: troca o desenho do menu lateral (aberto e recolhido), cria a barra inferior e a gaveta do celular
// e a busca ⌘K. Mantém os mesmos atributos do menu antigo (data-go, data-toggle-*), então os cliques continuam
// funcionando pelo attach() do index.html. Menu do usuário, troca de empresa e notificações saem do sidebar() antigo.
(function(){
  if(typeof sidebar !== "function" || typeof render !== "function") return;
  const SIDEBAR_ANTIGO = sidebar, RENDER_ANTIGO = render;
  const SVG = (d, n, extra) => `<svg width="${n || 16}" height="${n || 16}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra || ""}>${d}</svg>`;
  const RAIO = n => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>`;

  // ─── estrutura do menu (seções e cores do handoff) ───────────────────────────
  const AG = ["agentes","catalogo","equipes","equipe","criarEquipe","habilidades","conhecimento","criarAgente","agente"];
  const MT = ["motores","motorVendas","motorExec","motorAuditor","motorLeads","motorQualidade","motorDiagnostico","growthAgente","growthDash"];
  const FE = ["ferramentas","swot","ferramenta","aplicacao"];
  const SECOES = [
    { id: "base", itens: [["home", "Início", "home"], ["jarvis", "Jarvis", "jarvis"]] },
    { id: "operar", rot: "OPERAR", cor: "#673DE6", fundo: "rgba(103,61,230,0.10)", ponto: "#8B6CF0",
      itens: [["rotinas", "Rotinas", "rotinas"], ["agentes", "Agentes", "agentes", AG], ["motores", "Gestão Inteligente", "motores", MT], ["acoes", "Atividades", "acoes"]] },
    { id: "canais", rot: "CANAIS", cor: "#BE185D", fundo: "rgba(190,24,93,0.09)", ponto: "#EC4899",
      itens: [["whatsapp", "WhatsApp", "whatsapp"], ["instagram", "Instagram", "instagram"], ["linkedin", "LinkedIn", "linkedin"], ["tiktok", "TikTok", "tiktok", null, "Em configuração"], ["edicaoVideo", "Edição de Vídeo", "video"]] },
    { id: "organizar", rot: "ORGANIZAR", cor: "#7C3AED", fundo: "rgba(124,58,237,0.10)", ponto: "#A78BFA",
      itens: [["organograma", "Organograma", "org"], ["ferramentas", "Ferramentas", "ferramentas", FE], [null, "Formações", "formacoes"], [null, "Trilhas", "trilhas"]] },
    { id: "contexto", rot: "CONTEXTO", cor: "#0F7A68", fundo: "rgba(15,122,104,0.10)", ponto: "#2DD4BF",
      itens: [["biblioteca", "Biblioteca", "biblioteca"], ["conectores", "Conectores", "connectors"]] },
  ];
  // ícones do submenu: os mesmos traços do menu antigo
  const IC_SUB = { meus: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    zeus: '<path d="M9.9 3.5l1.5 4.3a1 1 0 0 0 .6.6l4.3 1.5-4.3 1.5a1 1 0 0 0-.6.6l-1.5 4.3-1.5-4.3a1 1 0 0 0-.6-.6L3.5 9.9l4.3-1.5a1 1 0 0 0 .6-.6z"/><path d="M18 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7zM18.5 3v3M20 4.5h-3"/>',
    equipes: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    hab: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 11l2-2-2-2M11 13h4"/>', con: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>' };
  const SUB_AGENTES = [["agentes", "Meus agentes", "@meus", ["agentes","criarAgente","agente"]], ["catalogo", "Agentes ZEUS", "@zeus", ["catalogo"]],
    ["equipes", "Equipes de agentes", "@equipes", ["equipes","equipe","criarEquipe"]], ["habilidades", "Habilidades", "@hab", ["habilidades"]], ["conhecimento", "Conhecimento", "@con", ["conhecimento"]]];
  const CFG = ["empresa","permissoes","config"];
  const ativo = (it, s) => it[0] && (it[3] ? it[3].includes(s) : it[0] === s);
  const ico = k => k && k[0] === "@" ? IC_SUB[k.slice(1)] : ((ICONS && ICONS[k]) || "");
  window.ZV_SECOES = SECOES; // as fases seguintes (cabeçalho de página) usam as mesmas seções e cores

  // pedaços que continuam vindo do menu antigo (menu do usuário, empresas)
  function pedacosAntigos(){
    if(!state.userMenuOpen && !state.wsMenuOpen) return { ws: "", user: "" };
    const t = document.createElement("div"); t.innerHTML = SIDEBAR_ANTIGO();
    const ws = t.querySelector("[data-ws-menu]"), us = t.querySelector("[data-user-menu]");
    if(ws){ ws.style.top = "104px"; }
    return { ws: ws ? ws.outerHTML : "", user: us ? us.outerHTML : "" };
  }
  const avatar = n => meFoto() ? `<img class="zsb-av" src="${meFoto()}" alt="" style="width:${n}px;height:${n}px;flex:0 0 ${n}px">` : `<span class="zsb-av" style="width:${n}px;height:${n}px;flex:0 0 ${n}px">${e(meIniciais(meNome()))}</span>`;
  const sino = (n) => { const q = typeof notifNaoLidas === "function" ? notifNaoLidas() : 0;
    return `<span data-toggle-notif title="Notificações" class="zsb-ico" style="position:relative;width:${n}px;height:${n}px">${SVG(ico("bell"), n > 34 ? 18 : 16)}${q ? `<span class="zsb-badge">${q > 99 ? "99+" : q}</span>` : ""}</span>`; };

  // ─── menu aberto ──────────────────────────────────────────────────────────────
  function menuAberto(){
    const s = state.screen, p = pedacosAntigos(), emAg = AG.includes(s), cfgOn = CFG.includes(s);
    const item = it => {
      if(!it[0]) return `<div class="zsb-it zsb-bloq" title="Em breve">${SVG(ico(it[2]))}<span class="t">${e(it[1])}</span>${SVG(ico("lock"), 12)}</div>`;
      const on = ativo(it, s);
      let h = `<div data-go="${it[0]}" class="zsb-it"${on ? " data-on" : ""}>${SVG(ico(it[2]))}<span class="t">${e(it[1])}</span>${it[4] ? `<span class="zsb-ponto" title="${e(it[4])}"></span>` : ""}</div>`;
      return h;
    };
    const nav = SECOES.map(g => (g.rot ? `<div class="zsb-sec"><i style="background:${g.ponto}"></i><span>${g.rot}</span><em></em></div>` : "") + g.itens.map(item).join("")).join("");
    return `<div class="zsb-wrap"><aside class="zsb sb-full">
      <div class="zsb-topo"><div class="zsb-logo" data-go="home"><span class="zsb-raio">${RAIO(15)}</span><b>ZEUS</b></div>
        <span data-toggle-sidebar title="Recolher menu" class="zsb-ico">${SVG(ico("sidebarToggle"))}</span></div>
      ${p.ws}
      <div data-toggle-ws class="zsb-emp">${meEmpresaIcone(24)}<span class="n">${e(meEmpresa())}</span><span style="display:flex;color:rgba(255,255,255,0.6)">${SVG(ico("updown"), 13)}</span></div>
      <div data-zv-busca class="zsb-busca">${SVG(ico("search"), 15)}<span class="t">Buscar ou ir para…</span><span class="zsb-kbd">${ehMac() ? "⌘K" : "Ctrl K"}</span></div>
      <nav class="zsb-nav"><div class="zsb-pilula"></div>${nav}</nav>
      <div class="zsb-pe">${p.user}${typeof notifPanelHTML === "function" ? notifPanelHTML() : ""}
        <div data-toggle-user class="zsb-eu">${avatar(30)}<span style="flex:1;min-width:0"><b>${e(mePrimeiroNome())}</b><small>${e((state.me && state.me.user && state.me.user.roleLabel) || meEmpresa())}</small></span></div>
        ${sino(32)}
        <span data-go="empresa" title="Configurações" class="zsb-ico" style="width:32px;height:32px;${cfgOn ? "background:rgba(255,255,255,0.18);color:#FFFFFF" : ""}">${SVG(ico("cog"))}</span>
      </div>
    </aside></div>`;
  }
  // ─── menu recolhido (rail) ───────────────────────────────────────────────────
  function menuRecolhido(){
    const s = state.screen, p = pedacosAntigos(), cfgOn = CFG.includes(s);
    const nav = SECOES.map(g => (g.rot ? `<span class="zsb-rsep"></span>` : "") + g.itens.filter(it => it[0]).map(it =>
      `<span data-go="${it[0]}" data-zv-dica="${e(it[1])}" class="zsb-ri"${ativo(it, s) ? " data-on" : ""}>${SVG(ico(it[2]), 18)}${it[4] ? `<span class="zsb-ponto"></span>` : ""}</span>`).join("")).join("");
    return `<div class="zsb-wrap"><aside class="zsb zsb-rail sb-rail">
      <span class="zsb-raio" data-go="home" style="width:30px;height:30px;margin-bottom:8px;cursor:pointer">${RAIO(16)}</span>
      <span data-toggle-sidebar data-zv-dica="Expandir menu" class="zsb-ico" style="width:36px;height:36px;margin-bottom:6px">${SVG(ico("sidebarToggle"), 17)}</span>
      <span data-go="jarvis" data-zv-dica="Falar com o ZEUS" style="cursor:pointer;margin-bottom:6px" class="zsb-esfera"><em></em><i></i></span>
      <span data-zv-busca data-zv-dica="Buscar (${ehMac() ? "⌘K" : "Ctrl K"})" class="zsb-ico" style="width:40px;height:40px">${SVG(ico("search"), 18)}</span>
      <div class="zsb-rnav">${nav}</div>
      <div class="zsb-pe" style="flex-direction:column;border-top:0;padding:4px 0 0;gap:2px">${p.user}${typeof notifPanelHTML === "function" ? notifPanelHTML().replace("left:12px;right:12px", "left:76px;width:300px;bottom:0") : ""}
        ${sino(40)}
        <span data-go="empresa" data-zv-dica="Configurações" class="zsb-ico" style="width:40px;height:40px;${cfgOn ? "background:rgba(255,255,255,0.18);color:#FFFFFF" : ""}">${SVG(ico("cog"), 18)}</span>
        <span data-toggle-user data-zv-dica="${e(meNome())}" style="cursor:pointer;margin-top:6px">${avatar(30)}</span>
      </div>
    </aside></div>`;
  }
  const ehMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  window.sidebar = function(){ return state.collapsed && !(typeof ehCelular === "function" && ehCelular()) ? menuRecolhido() : menuAberto(); };

  // pílula do item ativo desliza da posição anterior até a nova
  let _pilulaY = null;
  function moverPilula(){
    const nav = document.querySelector(".zsb-nav"), pil = nav && nav.querySelector(".zsb-pilula"); if(!pil) return;
    const on = nav.querySelector(".zsb-it[data-on]");
    if(!on){ pil.style.opacity = "0"; return; }
    const y = on.offsetTop, h = on.offsetHeight;
    pil.style.left = on.offsetLeft + "px"; pil.style.right = "12px";
    if(_pilulaY !== null && _pilulaY !== y){ pil.style.transition = "none"; pil.style.transform = `translateY(${_pilulaY}px)`; pil.style.height = h + "px"; pil.style.opacity = "1"; void pil.offsetWidth; pil.style.transition = ""; }
    pil.style.transform = `translateY(${y}px)`; pil.style.height = h + "px"; pil.style.opacity = "1";
    _pilulaY = y;
    if(on.offsetTop + h > nav.scrollTop + nav.clientHeight || on.offsetTop < nav.scrollTop) nav.scrollTop = Math.max(0, on.offsetTop - 80);
  }
  // dica do menu recolhido (fora do aside, que rola e cortaria a dica)
  document.addEventListener("mouseover", ev => {
    const el = ev.target.closest && ev.target.closest(".zsb-rail [data-zv-dica]"), d = document.getElementById("zsb-dica");
    if(!el){ if(d) d.remove(); return; }
    const r = el.getBoundingClientRect(), x = d || Object.assign(document.createElement("div"), { id: "zsb-dica" });
    x.textContent = el.dataset.zvDica; x.style.left = (r.right + 12) + "px"; x.style.top = (r.top + r.height / 2) + "px";
    if(!d) document.body.appendChild(x);
  });

  // ─── celular: barra inferior e gaveta de menu ────────────────────────────────
  function montarCelular(){
    const root = document.getElementById("root"); if(!root || document.getElementById("zmob-bar")) return;
    const bar = document.createElement("nav"); bar.id = "zmob-bar"; root.appendChild(bar);
    const fundo = document.createElement("div"); fundo.id = "zmob-fundo"; fundo.dataset.zvFechar = ""; root.appendChild(fundo);
    const sh = document.createElement("div"); sh.id = "zmob-sheet"; root.appendChild(sh);
  }
  function barraHTML(){
    const s = state.screen, b = (go, rot, ic, on) => `<span data-go="${go}" class="zmob-b"${on ? " data-on" : ""}><i>${SVG(ico(ic), 20)}</i>${rot}</span>`;
    return b("home", "Início", "home", s === "home") + b("agentes", "Agentes", "agentes", AG.includes(s))
      + `<span data-go="jarvis" class="zmob-jv" aria-label="Falar com o ZEUS"><em></em><i></i></span>`
      + b("chat", "Conversas", "chatBubble", s === "chat")
      + `<span data-zv-menu class="zmob-b"${document.documentElement.classList.contains("zmob-aberto") ? " data-on" : ""}><i>${SVG(ico("grid"), 20)}</i>Menu</span>`;
  }
  function gavetaHTML(){
    const s = state.screen;
    const t = it => !it[0] ? `<div class="zsh-t zsb-bloq"><i style="background:#F1F1F3;color:#9A9AA3">${SVG(ico(it[2]), 22)}</i>${e(it[1])}</div>` : null;
    const secoes = SECOES.map(g => {
      const cor = g.cor || "#673DE6", fundo = g.fundo || "rgba(103,61,230,0.10)";
      const itens = g.itens.map(it => t(it) || `<div data-go="${it[0]}" class="zsh-t"${ativo(it, s) ? " data-on" : ""}><i style="background:${fundo};color:${cor}">${SVG(ico(it[2]), 22)}${it[4] ? `<span class="zsb-ponto"></span>` : ""}</i>${e(it[1])}</div>`).join("");
      return `<div class="zsh-sec"><i style="background:${cor}"></i>${g.rot || "PRINCIPAL"}</div><div class="zsh-grade">${itens}</div>`;
    }).join("");
    return `<div class="zsh-alca" data-zv-fechar></div>
      <div class="zsh-eu">${avatar(42)}<span style="flex:1;min-width:0"><b>${e(meNome())}</b><small>${e(meEmpresa())}</small></span>
        <span class="zsh-notif">${sino(38)}</span><span data-go="empresa" class="zsb-ico" style="width:38px;height:38px">${SVG(ico("cog"), 18)}</span></div>
      ${state.notifOpen && typeof notifPanelHTML === "function" ? `<div style="position:relative;height:min(420px,55vh);margin-bottom:8px">${notifPanelHTML().replace("bottom:64px", "bottom:0;top:0")}</div>` : ""}
      <div data-zv-busca class="zsh-busca">${SVG(ico("search"), 17)}Buscar ou ir para…</div>${secoes}`;
  }
  function abrirGaveta(abrir){
    document.documentElement.classList.toggle("zmob-aberto", abrir);
    sincronizarCelular();
  }
  function sincronizarCelular(){
    montarCelular();
    const bar = document.getElementById("zmob-bar"); if(bar) bar.innerHTML = barraHTML();
    const sh = document.getElementById("zmob-sheet"); if(sh && document.documentElement.classList.contains("zmob-aberto")) sh.innerHTML = gavetaHTML();
    if(typeof attach === "function") attach();
  }
  document.addEventListener("click", ev => {
    const t = ev.target.closest ? ev.target : null; if(!t) return;
    if(t.closest("[data-zv-menu]")){ ev.stopPropagation(); abrirGaveta(!document.documentElement.classList.contains("zmob-aberto")); return; }
    if(t.closest("[data-zv-fechar]")){ abrirGaveta(false); return; }
    if(t.closest("[data-zv-busca]")){ ev.stopPropagation(); abrirGaveta(false); abrirBusca(); return; }
  }, true);

  // ─── busca ⌘K: telas, abas e agentes ─────────────────────────────────────────
  const EXTRAS = [["chat", "Conversas", "chatBubble", "Conversas com o ZEUS"], ["memoria", "Memória", "book", "O que o ZEUS lembra de você"], ["empresa", "Configurações", "cog", "Empresa, usuários e preferências"]]
    .concat(SUB_AGENTES.map(x => [x[0], x[1], x[2], "Agentes"]));
  let _busca = null;
  const norm = v => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function opcoesBusca(q){
    q = norm(q).trim();
    const telas = [];
    SECOES.forEach(g => g.itens.forEach(it => { if(it[0]) telas.push({ go: it[0], rot: it[1], ic: it[2], sub: g.rot ? g.rot.charAt(0) + g.rot.slice(1).toLowerCase() : "Principal", cor: g.cor || "#673DE6", fundo: g.fundo || "rgba(103,61,230,0.10)" }); }));
    EXTRAS.forEach(x => { if(!telas.some(t => t.go === x[0] && t.rot === x[1])) telas.push({ go: x[0], rot: x[1], ic: x[2], sub: x[3], cor: "#673DE6", fundo: "rgba(103,61,230,0.10)" }); });
    const ags = ((state.agentsData && state.agentsData.agents) || []).map(a => ({ agente: a.id, rot: a.name, ic: "agentes", sub: a.categoryLabel || "Agente", cor: "#BE185D", fundo: "rgba(190,24,93,0.09)" }));
    const f = o => !q || norm(o.rot + " " + o.sub).includes(q);
    return [["Páginas", telas.filter(f)], ["Agentes", ags.filter(f).slice(0, q ? 12 : 6)]].filter(x => x[1].length);
  }
  function pintarBusca(){
    if(!_busca) return;
    const grupos = opcoesBusca(_busca.q), lista = []; grupos.forEach(g => g[1].forEach(o => lista.push(o)));
    _busca.lista = lista; _busca.sel = Math.min(_busca.sel, Math.max(0, lista.length - 1));
    let k = -1;
    const html = grupos.map(g => `<div class="zcmd-gr">${g[0].toUpperCase()}</div>` + g[1].map(o => { k++; return `<div class="zcmd-it" data-zv-op="${k}"${k === _busca.sel ? " data-sel" : ""}><i style="background:${o.fundo};color:${o.cor}">${SVG(ico(o.ic), 16)}</i>${e(o.rot)}<small>${e(o.sub)}</small></div>`; }).join("")).join("");
    const l = document.querySelector("#zcmd .zcmd-lista"); if(l){ l.innerHTML = html || `<div class="zcmd-vazio">Nada encontrado para "${e(_busca.q)}".</div>`; const s = l.querySelector("[data-sel]"); if(s) s.scrollIntoView({ block: "nearest" }); }
  }
  function abrirBusca(){
    if(document.getElementById("zcmd")) return;
    _busca = { q: "", sel: 0, lista: [] };
    const ov = document.createElement("div"); ov.id = "zcmd";
    ov.innerHTML = `<div class="zcmd-cx"><div class="zcmd-in">${SVG(ico("search"), 18, 'style="color:#673DE6"')}<input placeholder="Buscar páginas, abas e agentes…" autocomplete="off"><span class="zsb-kbd" style="color:#66666F;border-color:#E6E6EA;background:#F7F7F8">Esc</span></div><div class="zcmd-lista"></div><div class="zcmd-pe"><span>↑ ↓ navegar</span><span>Enter abrir</span><span>Esc fechar</span></div></div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector("input"); inp.focus();
    inp.addEventListener("input", () => { _busca.q = inp.value; _busca.sel = 0; pintarBusca(); });
    ov.addEventListener("mousedown", ev => { const it = ev.target.closest("[data-zv-op]"); if(it){ ev.preventDefault(); escolher(+it.dataset.zvOp); return; } if(!ev.target.closest(".zcmd-cx")) fecharBusca(); });
    ov.addEventListener("mousemove", ev => { const it = ev.target.closest("[data-zv-op]"); if(it && +it.dataset.zvOp !== _busca.sel){ _busca.sel = +it.dataset.zvOp; pintarBusca(); } });
    pintarBusca();
    if(!state.agentsData && typeof fetch === "function") fetch("/api/agents").then(r => r.ok ? r.json() : null).then(j => { if(j && !state.agentsData){ state.agentsData = j; pintarBusca(); } }).catch(() => {});
  }
  function fecharBusca(){ const ov = document.getElementById("zcmd"); if(ov) ov.remove(); _busca = null; }
  function escolher(i){
    const o = _busca && _busca.lista[i]; if(!o) return; fecharBusca();
    if(o.agente) setState({ screen: "agente", agentId: o.agente, editAgentId: null, wsMenuOpen: false, userMenuOpen: false });
    else setState({ screen: o.go, wsMenuOpen: false, userMenuOpen: false });
  }
  document.addEventListener("keydown", ev => {
    if((ev.metaKey || ev.ctrlKey) && !ev.altKey && (ev.key === "k" || ev.key === "K")){ ev.preventDefault(); document.getElementById("zcmd") ? fecharBusca() : abrirBusca(); return; }
    if(!_busca) return;
    if(ev.key === "Escape"){ ev.preventDefault(); ev.stopPropagation(); fecharBusca(); }
    else if(ev.key === "ArrowDown"){ ev.preventDefault(); _busca.sel = Math.min(_busca.sel + 1, _busca.lista.length - 1); pintarBusca(); }
    else if(ev.key === "ArrowUp"){ ev.preventDefault(); _busca.sel = Math.max(_busca.sel - 1, 0); pintarBusca(); }
    else if(ev.key === "Enter"){ ev.preventDefault(); escolher(_busca.sel); }
  }, true);

  // ─── fase 2: faixa colorida no topo de cada tela + abas internas ─────────────
  // A tela continua desenhando o próprio cabeçalho. Depois do desenho, a faixa pega título e descrição, MOVE os botões
  // e as abas da própria tela (os mesmos elementos, com os cliques já ligados) e esconde o cabeçalho antigo.
  //  - padrão: o h1 da tela é o título da página
  //  - fora: o título é fixo (telas de duas colunas, cujo h1 é o título da coluna)
  //  - origem: telas sem h1 (WhatsApp, Instagram) dizem qual elemento do topo vira faixa e o que mover dele
  const FAIXA = { operar: "linear-gradient(120deg,#230C3F 0%,#4B26C2 50%,#7C5CF0 100%)", canais: "linear-gradient(120deg,#230C3F 0%,#7E1D6E 45%,#BE185D 80%,#EC4899 110%)",
    organizar: "linear-gradient(120deg,#230C3F 0%,#5B21B6 50%,#8B5CF6 100%)", contexto: "linear-gradient(120deg,#230C3F 0%,#134E4A 50%,#4B26C2 100%)", base: "linear-gradient(120deg,#230C3F 0%,#4B26C2 50%,#673DE6 100%)" };
  const COR = { operar: "#673DE6", canais: "#BE185D", organizar: "#7C3AED", contexto: "#0F7A68", base: "#673DE6" };
  const GRUPO_AGENTES = { sec: "operar", crumb: "Operar · Agentes", ic: "agentes", titulo: "Agentes", desc: "Seus agentes, o catálogo oficial do ZEUS e tudo que eles usam para trabalhar.", abas: "agentes" };
  const GRUPO_GESTAO = { sec: "operar", crumb: "Operar · Gestão Inteligente", ic: "motores", titulo: "Gestão Inteligente", abas: "gestao" };
  const GRUPO_CFG = { sec: "base", crumb: "Conta · Configurações", ic: "cog", titulo: "Configurações", desc: "Empresa, pessoas, IA e governança da conta.", fora: true, abas: "config" };
  const TELAS = {
    rotinas: { sec: "operar", crumb: "Operar · Rotinas", ic: "rotinas" },
    agentes: GRUPO_AGENTES, catalogo: GRUPO_AGENTES, equipes: GRUPO_AGENTES, habilidades: GRUPO_AGENTES, conhecimento: GRUPO_AGENTES,
    motores: GRUPO_GESTAO,
    motorVendas: Object.assign({}, GRUPO_GESTAO, { fora: true, desc: "Habilidades de IA que apoiam gestão, execução, treinamento e pré-vendas da operação comercial." }),
    acoes: { sec: "operar", crumb: "Operar · Atividades", ic: "acoes", titulo: "Atividades", desc: "Todas as ações da equipe, sincronizadas com o ClickUp e agrupadas por status.", fora: true, abas: "acoes" },
    whatsapp: { sec: "canais", crumb: "Canais · WhatsApp", ic: "whatsapp", titulo: "WhatsApp", desc: "Conversas, funil e o atendimento do ZEUS no WhatsApp.", origem: "#wa-top > div", abasDe: "[data-wa-view]", mover: "[data-wa-sdrbox],[data-wa-lead-novo]", alto: true },
    instagram: { sec: "canais", crumb: "Canais · Instagram", ic: "instagram", titulo: "Instagram", desc: "Direct com atendimento do ZEUS, publicações e automações da conta.", origem: "#ig-top > div", abasDe: "[data-ig-view]", moverDepois: true, alto: true },
    linkedin: { sec: "canais", crumb: "Canais · LinkedIn", ic: "linkedin", abas: "linkedin" },
    tiktok: { sec: "canais", crumb: "Canais · TikTok", ic: "tiktok" },
    edicaoVideo: { sec: "canais", crumb: "Canais · Edição de Vídeo", ic: "video", titulo: "Edição de Vídeo", desc: "Cortes, Reels, legenda animada e vinheta a partir dos seus vídeos.", fora: true, alto: true },
    organograma: { sec: "organizar", crumb: "Organizar · Organograma", ic: "org" },
    ferramentas: { sec: "organizar", crumb: "Organizar · Ferramentas", ic: "ferramentas" },
    biblioteca: { sec: "contexto", crumb: "Contexto · Biblioteca", ic: "biblioteca", titulo: "Biblioteca", desc: "Tudo que o time guardou: arquivos, links e as criações dos agentes.", fora: true, abas: "biblioteca" },
    conectores: { sec: "contexto", crumb: "Contexto · Conectores", ic: "connectors" },
    memoria: { sec: "base", crumb: "Memória", ic: "book" },
    config: GRUPO_CFG, empresa: GRUPO_CFG, permissoes: GRUPO_CFG,
  };
  const MT_VENDAS = ["motorVendas","motorExec","motorAuditor","motorLeads","motorQualidade","motorDiagnostico"];
  const tituloCaso = t => t.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(E|Com|De)\b/g, x => x.toLowerCase());
  // cada aba: { rot, ic, on, go } navega por data-go | { cfg } troca a seção de Configurações | { proxy } clica no botão da própria tela
  function abasDe(tipo){
    const s = state.screen;
    if(tipo === "agentes") return [["agentes", "Meus agentes", "@meus", ["agentes"]], ["catalogo", "Agentes ZEUS", "@zeus", ["catalogo"]], ["equipes", "Equipes", "@equipes", ["equipes"]],
      ["habilidades", "Habilidades", "@hab", ["habilidades"]], ["conhecimento", "Conhecimento", "@con", ["conhecimento"]]].map(a => ({ go: a[0], rot: a[1], ic: a[2], on: a[3].includes(s) }));
    if(tipo === "gestao") return [{ go: "motores", rot: "Visão geral", ic: "grid", on: s === "motores" }, { go: "motorVendas", rot: "Motor de Vendas", ic: "briefcase", on: MT_VENDAS.includes(s) },
      { go: "growthDash", rot: "Motor de Growth", ic: "chart", on: s === "growthDash" || s === "growthAgente" }];
    if(tipo === "acoes"){
      const on = v => { const el = document.querySelector(`#main-slot [data-ac-view="${v}"][data-ac-id=""]`); return !!el && !el.hasAttribute("data-hover"); };
      return [{ proxy: '[data-ac-view="all"][data-ac-id=""]', rot: "Todas as ações", ic: "acoes", on: on("all") }, { proxy: '[data-ac-view="closed"][data-ac-id=""]', rot: "Concluídas", ic: "check", on: on("closed") },
        { proxy: '[data-ac-view="painel"][data-ac-id=""]', rot: "Painel de entregas", ic: "grid", on: on("painel") }];
    }
    if(tipo === "linkedin"){
      const ab = state.liAba || "posts";
      return [{ fn: () => liIrAba("posts"), rot: "Posts", ic: "file", on: ab === "posts" }, { fn: () => liIrAba("estrategia"), rot: "Estratégia", ic: "spark", on: ab === "estrategia" }];
    }
    if(tipo === "biblioteca"){ // as 4 visões da coluna da esquerda viram abas; a coluna fica com a busca e as pastas
      // a visão ativa sai do título interno (a coluna da esquerda nem sempre é redesenhada): "Biblioteca" = Início
      const h = [...document.querySelectorAll("#main-slot h1")].find(x => !x.closest("[data-zv-faixa]")), tit = h ? h.textContent.trim() : "";
      const on = v => ({ inicio: "Biblioteca", recentes: "Recentes", favoritos: "Favoritos", todos: "Todos os arquivos" })[v] === tit;
      return [["inicio", "Início", "home"], ["recentes", "Recentes", "clock"], ["favoritos", "Favoritos", "star"], ["todos", "Todos os arquivos", "file"]]
        .map(([v, rot, ic]) => ({ proxy: `[data-bib-v="${v}"]:not(.zbn-aba)`, rot, ic, on: on(v), esconder: v }));

    }
    if(tipo === "config"){
      if(typeof CFG_MENU === "undefined") return [];
      const vis = id => typeof cfgSecVisivel !== "function" || cfgSecVisivel(id), sec = state.cfgSec || "dados";
      const ics = { "GERAL": "cog", "PESSOAS E ORGANIZAÇÃO": "users", "OPERAÇÃO COM IA": "spark", "APRENDIZADO E CONTEÚDO": "book", "GOVERNANÇA": "shield" };
      return CFG_MENU.map(g => [g[0], g[1].filter(it => vis(it[0]))]).filter(g => g[1].length)
        .map(g => ({ cfg: g[1][0][0], rot: tituloCaso(g[0]), ic: ics[g[0]] || "folder", on: g[1].some(it => it[0] === sec), secs: g[1].map(it => it[0]) }));
    }
    return [];
  }
  const ehRotulo = el => el && el.children.length === 0 && el.textContent.trim().length < 60 && ((el.textContent.trim() === el.textContent.trim().toUpperCase() && /[A-Z]/.test(el.textContent)) || /^Conta\s/.test(el.textContent.trim()));
  function cabecalhoDe(h1){
    const col = h1.parentElement, linha = col && col.parentElement;
    const emColuna = col && /flex:\s*1/.test(col.getAttribute("style") || "") && linha && /display:\s*flex/.test(linha.getAttribute("style") || "");
    const irmaos = emColuna ? [...col.children] : [...h1.parentElement.children];
    const i = irmaos.indexOf(h1), prox = irmaos[i + 1];
    const desc = prox && (prox.tagName === "P" || (prox.tagName === "DIV" && !prox.querySelector("input,button,select,textarea,[data-go],img") && prox.textContent.trim().length < 400)) ? prox : null;
    const rotulo = ehRotulo(irmaos[i - 1]) ? irmaos[i - 1] : null;
    const botoes = emColuna ? [...linha.children].filter(c => c !== col) : [];
    return { emColuna, col, linha, desc, rotulo, botoes };
  }
  let _abaX = null;
  function aplicarFaixa(){
    const main = document.getElementById("main-slot"); if(!main) return;
    const cfg = TELAS[state.screen], velha = main.querySelector(":scope > [data-zv-faixa]"), abasVelhas = main.querySelector(":scope > [data-zv-abas]");
    if(!cfg){ if(velha) velha.remove(); if(abasVelhas) abasVelhas.remove(); document.documentElement.style.setProperty("--zv-faixa-h", "0px"); return; }
    const h1 = !cfg.fora && !cfg.origem ? [...main.querySelectorAll("h1")].find(h => !h.closest("[data-zv-faixa]")) : null;
    const origem = cfg.origem ? main.querySelector(cfg.origem) : null;
    const pendente = (h1 && !h1.dataset.zvOk) || (origem && !origem.dataset.zvOk);
    if(velha && velha.dataset.tela === state.screen && !pendente){ alinharFaixa(); atualizarAbas(cfg); return; } // já aplicada: só confere a aba ativa
    if(cfg.origem && !origem) return; // tela ainda montando
    {
      const c = h1 ? cabecalhoDe(h1) : null;
      const titulo = cfg.titulo || (h1 ? h1.textContent.trim() : "");
      const desc = cfg.desc || (c && c.desc ? c.desc.innerHTML : "");
      const faixa = document.createElement("div"); faixa.dataset.zvFaixa = ""; faixa.dataset.tela = state.screen; faixa.className = "zbn"; faixa.style.background = FAIXA[cfg.sec];
      faixa.innerHTML = `<div class="zbn-pontos"></div><div class="zbn-luz"></div><div class="zbn-in">
        <div class="zbn-crumb"><span>Conta ${e(meEmpresa())}</span>${SVG('<path d="M9 6l6 6-6 6"/>', 11)}<b>${e(cfg.crumb)}</b></div>
        <div class="zbn-linha"><div class="zbn-tit"><span class="zbn-ico" style="color:${COR[cfg.sec]}">${SVG(ico(cfg.ic), 24)}</span><div style="min-width:0"><h2>${e(titulo)}</h2>${desc ? `<p>${desc}</p>` : ""}</div></div><div class="zbn-acoes"></div></div></div>`;
      const acoes = faixa.querySelector(".zbn-acoes");
      let abasProprias = null;
      if(c){
        c.botoes.forEach(b => acoes.appendChild(b));
        if(c.emColuna) c.linha.style.display = "none"; else { h1.style.display = "none"; if(c.desc) c.desc.style.display = "none"; }
        if(c.rotulo) c.rotulo.style.display = "none";
        h1.dataset.zvOk = "1";
        const pg = h1.closest('[style*="padding:34px"]'); if(pg) pg.style.paddingTop = "22px";
      }
      if(origem){
        const tabs = cfg.abasDe && origem.querySelector(cfg.abasDe);
        if(tabs) abasProprias = tabs.parentElement;
        [...origem.children].forEach(ch => { if(ch === abasProprias || ch.querySelector("[data-wa-view],[data-ig-view]") && ch === abasProprias) return;
          const spacer = ch.tagName === "SPAN" && /flex:\s*1/.test(ch.getAttribute("style") || "") && !ch.children.length;
          const titulo = ch.querySelector && ch.querySelector('[style*="Space Grotesk"]') && ch.children.length <= 3 && !ch.querySelector("button,[data-hover]");
          if(cfg.moverDepois ? (!spacer && !titulo && ch !== abasProprias) : (cfg.mover && ch.matches(cfg.mover))) acoes.appendChild(ch); });
        origem.style.display = "none"; origem.dataset.zvOk = "1";
      }
      if(velha) velha.replaceWith(faixa); else main.insertBefore(faixa, main.firstChild);
      if(abasVelhas) abasVelhas.remove();
      if(cfg.abas || abasProprias){
        const barra = document.createElement("div"); barra.dataset.zvAbas = ""; barra.className = "zbn-abas";
        barra.innerHTML = `<div class="zbn-abas-in"><div class="zbn-abas-cx"><span class="zbn-ind"></span></div></div>`;
        const cx = barra.querySelector(".zbn-abas-cx");
        if(abasProprias){ abasProprias.classList.add("zbn-proprias"); [...abasProprias.children].forEach(t => { t.classList.add("zbn-aba"); cx.appendChild(t); }); }
        else cx.insertAdjacentHTML("beforeend", abasDe(cfg.abas).map((a, k) => `<span class="zbn-aba" data-zv-aba="${k}"${a.go ? ` data-go="${a.go}"` : ""}${a.on ? " data-on" : ""}>${SVG(ico(a.ic), 15)}${e(a.rot)}</span>`).join(""));
        faixa.after(barra);
        if(typeof attach === "function") attach();
      }
      requestAnimationFrame(() => { alinharFaixa(); atualizarAbas(cfg); medirFaixa(cfg); });
    }
  }
  // aba ativa (abas geradas aqui ou as da própria tela) e filtros que dependem dela
  function atualizarAbas(cfg){
    const barra = document.querySelector("#main-slot > [data-zv-abas]"); if(!barra) return;
    const cor = COR[cfg.sec];
    if(cfg.abas){
      const lista = abasDe(cfg.abas);
      barra.querySelectorAll("[data-zv-aba]").forEach(el => { const a = lista[+el.dataset.zvAba]; if(!a) return; el.toggleAttribute("data-on", !!a.on); el.style.color = a.on ? cor : ""; });
      if(cfg.abas === "config"){ // coluna da esquerda: só as seções do grupo ativo; os rótulos de grupo viram as abas
        const g = lista.find(a => a.on) || lista[0];
        document.querySelectorAll("#main-slot [data-cfg-sec]").forEach(el => { if(el.closest("[data-zv-abas]")) return; el.style.display = g && g.secs.includes(el.dataset.cfgSec) ? "" : "none"; });
        document.querySelectorAll("#main-slot nav > div:not([data-cfg-sec])").forEach(el => { if(/^[A-ZÇÃÕÉ ]{4,}$/.test(el.textContent.trim())) el.style.display = "none"; });
      }
      if(cfg.abas === "acoes") document.querySelectorAll('#main-slot [data-ac-view="all"][data-ac-id=""],#main-slot [data-ac-view="closed"][data-ac-id=""],#main-slot [data-ac-view="painel"][data-ac-id=""]').forEach(el => { el.style.display = "none"; });
      if(cfg.abas === "biblioteca") lista.forEach(t => document.querySelectorAll(`#main-slot [data-bib-v="${t.esconder}"]`).forEach(el => { if(!el.closest("[data-zv-abas]")) el.style.display = "none"; }));
      if(cfg.abas === "linkedin"){ const el = document.querySelector('#main-slot span[onclick^="liIrAba"]'); if(el && el.parentElement) el.parentElement.style.display = "none"; }
      // título interno que só repete a faixa ou a aba ativa ("Biblioteca", "Todas as ações"): some, os botões ao lado ficam
      if(cfg.fora){
        const nomes = [cfg.titulo].concat(lista.map(t => t.rot)).map(x => String(x || "").trim().toLowerCase());
        const h = [...document.querySelectorAll("#main-slot h1")].find(x => !x.closest("[data-zv-faixa]"));
        if(h){ const rep = nomes.includes(h.textContent.trim().toLowerCase()), p = h.nextElementSibling && h.nextElementSibling.tagName === "P" ? h.nextElementSibling : null;
          h.style.display = rep ? "none" : ""; if(p) p.style.display = rep ? "none" : ""; }
      }
    } else {
      barra.querySelectorAll(".zbn-aba").forEach(el => { const on = /font-weight:\s*600/.test(el.getAttribute("style") || ""); el.toggleAttribute("data-on", on); });
    }
    const on = barra.querySelector(".zbn-aba[data-on]"), ind = barra.querySelector(".zbn-ind"); if(!on || !ind){ if(ind) ind.style.opacity = "0"; return; }
    const x = on.offsetLeft, w = on.offsetWidth;
    if(_abaX !== null && _abaX !== x && ind.style.opacity !== "1"){ ind.style.transition = "none"; ind.style.transform = `translateX(${_abaX}px)`; ind.style.width = w + "px"; void ind.offsetWidth; ind.style.transition = ""; }
    ind.style.transform = `translateX(${x}px)`; ind.style.width = w + "px"; ind.style.opacity = "1"; ind.style.background = cfg.sec === "canais" ? "rgba(190,24,93,0.10)" : "rgba(103,61,230,0.10)"; _abaX = x;
  }
  // faixa e abas alinhadas com o conteúdo da tela (cada tela tem a própria largura e alinhamento)
  function alinharFaixa(){
    const main = document.getElementById("main-slot"), f = main && main.querySelector(":scope > [data-zv-faixa]"); if(!f) return;
    const pg = [...main.children].find(c => !c.hasAttribute("data-zv-faixa") && !c.hasAttribute("data-zv-abas")); if(!pg) return;
    // o contêiner de página é o primeiro bloco com padding lateral (padding:34px 40px ...) ou largura máxima
    let alvo = pg.matches('[style*="padding:"]') ? pg : pg.querySelector('[style*="padding:34px"],[style*="padding:26px 40px"],[style*="padding:28px 40px"],[style*="max-width"]') || pg;
    const r = alvo.getBoundingClientRect(), cs = getComputedStyle(alvo);
    let me = 12, md = 12;
    // faixa sempre na largura toda (não pula de tamanho entre abas); página centralizada com largura máxima encosta à esquerda, alinhada com o texto da faixa
    const cfgT = TELAS[state.screen] || {};
    if(!cfgT.fora && r.width >= 300){ const ml = parseFloat(cs.marginLeft) || 0, mr = parseFloat(cs.marginRight) || 0; if(ml > 20 && Math.abs(ml - mr) < 4){ alvo.style.marginLeft = "0"; alvo.style.marginRight = "auto"; } }
    if(innerWidth <= 820){ me = md = 10; }
    f.style.setProperty("margin-left", me + "px", "important"); f.style.setProperty("margin-right", md + "px", "important");
    const inn = f.querySelector(".zbn-in"); inn.style.maxWidth = "none"; inn.style.margin = "0"; inn.style.paddingLeft = ""; inn.style.paddingRight = "";
    const ab = main.querySelector(":scope > [data-zv-abas] .zbn-abas-in"); if(ab){ ab.style.maxWidth = "none"; ab.style.margin = "0"; ab.style.paddingLeft = (me + 28) + "px"; ab.style.paddingRight = (md + 28) + "px"; }
  }
  window.addEventListener("resize", () => { clearTimeout(window._zvAl); window._zvAl = setTimeout(alinharFaixa, 80); });
  // telas de altura cheia (WhatsApp, Instagram, Edição de Vídeo) descontam a faixa e as abas
  function medirFaixa(cfg){
    const f = document.querySelector("#main-slot > [data-zv-faixa]"), a = document.querySelector("#main-slot > [data-zv-abas]");
    const h = cfg && cfg.alto && f ? f.offsetHeight + 12 + (a ? a.offsetHeight : 0) : 0;
    document.documentElement.style.setProperty("--zv-faixa-h", h + "px");
    document.documentElement.toggleAttribute("data-zv-alto", !!(cfg && cfg.alto));
  }
  // cliques nas abas que não navegam por data-go (Configurações e Atividades)
  document.addEventListener("click", ev => {
    const el = ev.target.closest && ev.target.closest("[data-zv-aba]"); if(!el || el.hasAttribute("data-go")) return;
    const cfg = TELAS[state.screen]; if(!cfg || !cfg.abas) return;
    const a = abasDe(cfg.abas)[+el.dataset.zvAba]; if(!a) return;
    ev.stopPropagation();
    if(a.cfg) setState({ screen: "config", cfgSec: a.cfg });
    else if(a.proxy){ const alvo = document.querySelector("#main-slot " + a.proxy); if(alvo) alvo.click(); setTimeout(() => atualizarAbas(cfg), 60); }
    else if(a.fn){ a.fn(); setTimeout(() => atualizarAbas(cfg), 60); }
  }, true);
  // Gestão Inteligente: cada motor ganha o cabeçalho escuro em degradê do protótipo (Vendas roxo, Growth magenta)
  const IC_MOTOR = ['<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/>', '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'];
  function decorarMotores(){
    if(state.screen !== "motores") return;
    [...document.querySelectorAll("#main-slot h2")].filter(h => !h.closest("[data-zv-faixa]")).forEach((h2, i) => {
      const linha = h2.parentElement, card = linha && linha.parentElement, p = linha && linha.nextElementSibling;
      if(!card || card.dataset.zvMotor || !p || p.tagName !== "P" || !card.querySelector("[data-go]")) return;
      card.dataset.zvMotor = "1"; card.classList.add("zmot");
      const topo = document.createElement("div"); topo.className = "zmot-topo"; topo.style.background = FAIXA[i % 2 ? "canais" : "operar"];
      topo.innerHTML = `<div class="zbn-pontos"></div><div class="zbn-luz"></div><div class="zmot-l1"><span class="zmot-ico">${SVG(IC_MOTOR[i % 2], 20)}</span></div>`;
      const selo = linha.querySelector("span"); if(selo){ selo.classList.add("zmot-selo"); topo.querySelector(".zmot-l1").appendChild(selo); }
      card.insertBefore(topo, linha); topo.appendChild(linha); topo.appendChild(p);
    });
  }
  // telas que se redesenham sozinhas (dados chegando, rotinas.js, organograma.js...) reaplicam a faixa
  // Reaplica na hora (o observador roda antes da tela ser pintada): com espera, o cabeçalho antigo aparecia por um instante
  // a cada redesenho. As mudanças feitas aqui mesmo são descartadas com takeRecords; com a faixa já aplicada, aplicarFaixa
  // só confere alinhamento e aba ativa.
  const obs = new MutationObserver(() => { aplicarFaixa(); decorarMotores(); obs.takeRecords(); });
  function observar(){ const m = document.getElementById("main-slot"); if(m && !m._zvObs){ m._zvObs = 1; obs.observe(m, { childList: true, subtree: true }); } }

  // ─── fase 4: foto real de cada agente do time na tela de voz ─────────────────
  // Coloque /public/fotos-agentes/<id>.jpg (nina, sobral, icaro, gustavo, maicom, otavio, smith, tome, talles, eduardo).
  // Cada foto é testada uma vez por carga de página; sem arquivo, o cartão continua com a inicial.
  const TIME = ["nina","sobral","icaro","gustavo","maicom","otavio","smith","tome","talles","eduardo"], FOTOS = {};
  TIME.forEach(id => { const im = new Image(); im.onload = () => { FOTOS[id] = im.src; pintarFotos(); }; im.src = "/fotos-agentes/" + id + ".jpg?v=1"; });
  function pintarFotos(){
    document.querySelectorAll("#jv-root [data-jv-card]").forEach(c => {
      const src = FOTOS[c.dataset.jvCard], av = c.querySelector(".jv-av");
      if(src && av && !av.querySelector("img")) av.insertAdjacentHTML("afterbegin", `<img src="${src}" alt="" class="zv-foto">`);
    });
  }
  const obsFotos = new MutationObserver(() => { if(Object.keys(FOTOS).length) pintarFotos(); });
  function observarFotos(){ const c = document.getElementById("jv-cena"); if(c && !c._zvObs){ c._zvObs = 1; obsFotos.observe(c, { childList: true, subtree: true }); pintarFotos(); } }

  // ─── depois de cada desenho: pílula, celular ─────────────────────────────────
  let _telaAnt = null;
  window.render = function(){
    const r = RENDER_ANTIGO.apply(this, arguments);
    if(state.screen !== _telaAnt){ _telaAnt = state.screen; document.documentElement.classList.remove("zmob-aberto"); }
    document.documentElement.dataset.zvTela = state.screen;
    moverPilula(); sincronizarCelular(); observar(); aplicarFaixa(); decorarMotores(); setTimeout(observarFotos, 0);
    return r;
  };
  // primeiro desenho já aconteceu antes deste arquivo: redesenha o menu no visual novo
  const sl = document.getElementById("sidebar-slot");
  if(sl){ sl.innerHTML = window.sidebar(); if(typeof attach === "function") attach(); }
  _telaAnt = state.screen; document.documentElement.dataset.zvTela = state.screen; moverPilula(); sincronizarCelular(); observar(); aplicarFaixa(); setTimeout(observarFotos, 0);
})();
