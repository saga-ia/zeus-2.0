// Social Media: Brand Kit por marca, em 5 passos (Objetivo, Marca, Público, Identidade, Estilo).
// É o que o agente de design usa para criar os posts de imagem com IA (CLI tools/marca no servidor).
// Carregado depois do script principal: usa state, setState, icon, ICONS, e (escape), bindOnce e attach de lá.
// Abre na aba Brand Kit do Agente de Design (e dos agentes de design da empresa). /ferramentas/social-media redireciona pra lá. Backend: /api/social (social.js).
(function(){
  const ROXO = "#673DE6", VERDE = "#0F7A68", CINZA = "#66666F", VERM = "#C0341C";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:11px 13px;border:1px solid #E6E6EA;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#F4F4F6;outline:none;box-sizing:border-box";
  const BTN_PRI = "display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 20px;border-radius:10px;background:" + ROXO + ";color:#FFFFFF;font:inherit;font-size:13.5px;font-weight:700;border:0;cursor:pointer";
  const BTN_SEC = "display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:12.5px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const P = {
    objetivo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    marca: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
    publico: '<circle cx="9" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14.5 14.2A5 5 0 0 1 21 19"/>',
    identidade: '<path d="M12 11c0 3-1 6-3 8M8.5 6.5A6 6 0 0 1 18 11c0 2-.3 4-1 6M6 9a6 6 0 0 0-.5 3c0 1.7-.4 3.3-1 4.5M12 7a4 4 0 0 1 4 4c0 1.2-.1 2.4-.4 3.5M8 11a4 4 0 0 1 1-2.7"/>',
    estilo: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    vender: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    autoridade: '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>',
    engajamento: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    leads: '<circle cx="10" cy="8" r="3.5"/><path d="M3 20c0-3.6 3.1-6.5 7-6.5 1.3 0 2.5.3 3.5.9M18 14v6M15 17h6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    logo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    copia: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    lampada: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    varinha: '<path d="M4 20l11-11M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3M18 3l1 1"/>'
  };
  const PASSOS = [
    ["objetivo", "Objetivo", "Qual seu principal objetivo?", "Vamos começar entendendo sua meta principal", "#E8F0FE", "#1A6CE8"],
    ["marca", "Marca", "Conte sobre sua marca", "Informações básicas para personalizarmos seu conteúdo", "#E8F0FE", "#1A6CE8"],
    ["publico", "Público", "Quem é seu público-alvo?", "Descreva as pessoas que você quer alcançar", "#E8F0FE", "#1A6CE8"],
    ["identidade", "Identidade", "Qual a personalidade da sua marca?", "Como você quer que as pessoas percebam sua marca?", "#FDECEC", "#D0453A"],
    ["estilo", "Estilo", "Estilo visual da marca", "Defina a identidade visual para suas criações", "#FDF1E3", "#C9771B"]
  ];
  const OBJ = [
    ["vender", "Vender mais produtos/serviços", "Aumentar vendas e conversões", "#22C55E"],
    ["autoridade", "Construir autoridade", "Se tornar referência no seu nicho", "#E0489A"],
    ["engajamento", "Aumentar engajamento", "Criar comunidade ativa", "#EF4444"],
    ["leads", "Gerar leads qualificados", "Captar potenciais clientes", "#1A6CE8"]
  ];
  const TONS = ["Descontraído", "Profissional", "Inspirador", "Educativo", "Divertido", "Acolhedor", "Direto", "Sofisticado", "Amigável", "Motivacional"];
  const PAISES = [["BR", "Brasil"], ["PT", "Portugal"], ["US", "Estados Unidos"], ["AR", "Argentina"], ["MX", "México"], ["ES", "Espanha"], ["CO", "Colômbia"], ["CL", "Chile"], ["UY", "Uruguai"], ["PY", "Paraguai"]];
  const PALETAS = [
    ["Pôr do Sol", "#F97316", "#FDE68A", "#FBBF24"], ["Menta", "#0D9488", "#CCFBF1", "#2DD4BF"], ["Floresta", "#2F6B4F", "#D1E7DD", "#52B788"],
    ["Lavanda", "#7C3AED", "#EDE9FE", "#A855F7"], ["Oceano", "#1D4ED8", "#DBEAFE", "#38BDF8"], ["Grafite", "#18181B", "#E4E4E7", "#F59E0B"],
    ["Rosé", "#BE185D", "#FCE7F3", "#F472B6"], ["Terra", "#9A3412", "#FFEDD5", "#D97706"]
  ];
  const FID = [
    ["fiel", "Cópia fiel", "Segue o layout exatamente, só troca o conteúdo", "marcas que querem consistência total no feed", P.copia],
    ["forte", "Inspiração forte", "Mesmos estilos e elementos, mas layouts variados", "a maioria das marcas que quer equilíbrio", P.estilo],
    ["livre", "Referência livre", "Pega a vibe geral, mas pode ser criativo", "marcas criativas que gostam de surpreender", P.lampada]
  ];

  function S(){ if(!state.soc) state.soc = { marcas: null, loading: false, erro: null, view: "lista", id: null, passo: 1, d: {}, marca: null, av: {}, msg: null, busy: null, modal: null, refinar: false }; return state.soc; }
  async function api(url, method, body){
    const r = await fetch("/api/social" + url, { method: method || "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  async function carregar(){
    const s = S(); if(s.loading) return; s.loading = true;
    try { s.marcas = (await api("")).marcas; s.erro = null; } catch(err){ s.erro = err.message; }
    s.loading = false;
    if(abrirPedida()) return;
    paint();
  }
  // "Editar marca" no Agente de Design: abre direto o Brand Kit da marca escolhida (s.abrirId)
  function abrirPedida(){
    const s = S(); if(!s.abrirId || !s.marcas) return false;
    const m = s.marcas.find(x => x.id === s.abrirId); s.abrirId = null;
    if(!m) return false;
    abrir(m, m.completo ? "kit" : "wizard", 1); return true;
  }
  function paint(){ const root = document.getElementById("soc-root"); if(!root) return; root.innerHTML = page(); if(typeof attach === "function") attach(); }
  function aviso(txt, erro){ const s = S(); s.msg = txt ? [txt, !!erro] : null; const el = document.getElementById("soc-msg"); if(el) el.outerHTML = msgHTML(); else paint(); }
  function msgHTML(){ const m = S().msg; return `<div id="soc-msg">${m ? `<div style="margin:0 0 14px;padding:10px 13px;border-radius:10px;font-size:12.5px;border:1px solid ${m[1] ? "rgba(192,52,28,0.3)" : "rgba(15,122,104,0.3)"};background:${m[1] ? "rgba(192,52,28,0.06)" : "rgba(15,122,104,0.06)"};color:${m[1] ? VERM : VERDE}">${e(m[0])}</div>` : ""}</div>`; }

  // ─── Lista de marcas ────────────────────────────────────────────────────────
  function lista(){
    const s = S();
    const voltar = s.embed ? "" : `<span data-soc-voltar-lp style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:${CINZA};cursor:pointer;margin-bottom:22px">${icon(ICONS.arrowLeft, 14, "currentColor")}Sobre a ferramenta</span>`;
    const topo = `<div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:22px"><div style="flex:1;min-width:260px">
        <div style="font-size:10.5px;letter-spacing:0.16em;color:${ROXO};font-weight:700;margin-bottom:8px">SOCIAL MEDIA · BRAND KIT</div>
        <h1 style="${HEAD};font-size:25px;font-weight:600;margin:0 0 6px">Marcas</h1>
        <p style="margin:0;color:${CINZA};font-size:13.5px;line-height:1.55;max-width:640px">Cada marca guarda objetivo, público, tom de voz, cores, logo e estilo visual. O agente de design usa esse kit para criar os posts de imagem com IA.</p></div>
        <span data-soc-nova style="${BTN_PRI}">${icon(ICONS.plus, 15, "currentColor")}Nova marca</span></div>`;
    let corpo;
    if(s.erro) corpo = `<div style="padding:20px;border:1px solid rgba(192,52,28,0.3);border-radius:14px;color:${VERM};font-size:13px">Não consegui carregar as marcas: ${e(s.erro)}</div>`;
    else if(!s.marcas) corpo = `<div style="padding:30px;color:${CINZA};font-size:13px">Carregando marcas...</div>`;
    else if(!s.marcas.length) corpo = `<div style="padding:40px 24px;border:1px dashed #DADADF;border-radius:16px;text-align:center">
        <span style="width:52px;height:52px;border-radius:50%;background:#FDF1E3;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">${icon(P.estilo, 24, "#C9771B")}</span>
        <div style="${HEAD};font-size:17px;font-weight:600;margin-bottom:6px">Nenhuma marca cadastrada ainda</div>
        <p style="margin:0 auto 16px;color:${CINZA};font-size:13px;max-width:420px;line-height:1.55">Configure a primeira marca em 5 passos simples. Leva uns 5 minutos.</p>
        <span data-soc-nova style="${BTN_PRI}">${icon(ICONS.plus, 15, "currentColor")}Configurar marca</span></div>`;
    else corpo = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px">${s.marcas.map(cardMarca).join("")}</div>`;
    return `<div style="padding:30px 40px 60px;max-width:1240px">${voltar}${topo}${msgHTML()}${corpo}</div>`;
  }
  function swatches(c, n){ return ["primaria", "secundaria", "destaque"].filter(k => c && c[k]).map(k => `<span title="${e(c[k])}" style="width:${n}px;height:${n}px;border-radius:50%;background:${e(c[k])};border:1px solid rgba(0,0,0,0.08);display:inline-block"></span>`).join(""); }
  function cardMarca(m){
    const d = m.dados || {};
    const ob = OBJ.find(o => o[0] === d.objetivo);
    return `<div style="border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:18px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="width:48px;height:48px;flex:0 0 48px;border-radius:12px;border:1px solid #EFEFF1;background:#FAFAFA;display:flex;align-items:center;justify-content:center;overflow:hidden">${m.logo ? `<img src="${e(m.logo)}" alt="" style="max-width:86%;max-height:86%;object-fit:contain">` : `<span style="${HEAD};font-weight:700;color:${ROXO}">${e((m.nome || "?").slice(0, 2).toUpperCase())}</span>`}</span>
        <div style="min-width:0;flex:1"><div style="${HEAD};font-size:15.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(m.nome)}</div>
          <div style="font-size:12px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(d.tag || (d.instagram ? "@" + d.instagram : ""))}</div></div>
        <span style="font-size:10px;font-weight:700;letter-spacing:0.06em;padding:4px 9px;border-radius:20px;${m.completo ? `color:${VERDE};border:1px solid rgba(15,122,104,0.35);background:rgba(15,122,104,0.07)` : `color:#9A5B00;border:1px solid rgba(201,119,27,0.4);background:#FDF6EC`}">${m.completo ? "COMPLETO" : "INCOMPLETO"}</span>
      </div>
      <p style="margin:0;font-size:12.5px;color:${CINZA};line-height:1.5;min-height:37px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${e(d.oQueFaz || "Sem descrição ainda.")}</p>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${swatches(d.cores, 16)}${ob ? `<span style="margin-left:${d.cores && d.cores.primaria ? "6px" : "0"};font-size:11px;color:#3C3C44;border:1px solid #E6E6EA;background:#F7F7F8;padding:3px 9px;border-radius:20px">${e(ob[1])}</span>` : ""}</div>
      <div style="display:flex;gap:8px;margin-top:2px">
        <span data-soc-abrir="${e(m.id)}" style="${BTN_SEC};flex:1;justify-content:center">${icon(m.completo ? P.estilo : ICONS.edit, 13, "currentColor")}${m.completo ? "Ver Brand Kit" : "Continuar"}</span>
        <span data-soc-excluir="${e(m.id)}" title="Excluir marca" style="${BTN_SEC};padding:9px 11px">${icon(ICONS.trash, 13, "currentColor")}</span>
      </div></div>`;
  }

  // ─── Wizard ─────────────────────────────────────────────────────────────────
  function lbl(t, opc, sub){ return `<div style="font-size:12.5px;font-weight:600;margin-bottom:${sub ? 2 : 7}px">${t}${opc ? ` <span style="font-weight:400;color:#9A9AA3;font-size:11.5px">(opcional)</span>` : ""}</div>${sub ? `<div style="font-size:12px;color:${CINZA};margin-bottom:7px">${sub}</div>` : ""}`; }
  function campo(k, t, ph, opts){
    opts = opts || {};
    const v = S().d[k] || "";
    const input = opts.area
      ? `<textarea data-soc-campo="${k}" rows="${opts.rows || 3}" placeholder="${e(ph)}" style="${IN};resize:vertical;line-height:1.5">${e(v)}</textarea>`
      : opts.prefix ? `<label style="position:relative;display:block"><span style="position:absolute;left:13px;top:50%;transform:translateY(-50%);color:${CINZA};font-size:13.5px">${opts.prefix}</span><input data-soc-campo="${k}" value="${e(v)}" placeholder="${e(ph)}" style="${IN};padding-left:30px"></label>`
      : `<input data-soc-campo="${k}" value="${e(v)}" placeholder="${e(ph)}" style="${IN}">`;
    return `<div>${lbl(t, opts.opc, opts.sub)}${input}</div>`;
  }
  function avancado(n, conteudo){
    const aberto = !!S().av[n];
    return `<div style="border:1px solid #E6E6EA;border-radius:14px;background:#FAFAFB">
      <div data-soc-av="${n}" style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer">
        <span style="width:32px;height:32px;border-radius:50%;background:#E8F0FE;display:flex;align-items:center;justify-content:center;flex:0 0 32px">${icon(P.lampada, 15, "#1A6CE8")}</span>
        <div style="flex:1"><div style="font-size:13px;font-weight:600">Configurações avançadas</div><div style="font-size:11.5px;color:${CINZA}">Esses detalhes ajudam a IA a criar conteúdo ainda melhor, mas você pode preencher depois.</div></div>
        ${icon(aberto ? ICONS.chevUp : ICONS.chevDown, 15, CINZA)}
      </div>
      ${aberto ? `<div style="padding:4px 16px 18px;display:flex;flex-direction:column;gap:16px">${conteudo}</div>` : ""}
    </div>`;
  }
  function passo1(){
    const d = S().d;
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px">${OBJ.map(o => {
      const on = d.objetivo === o[0];
      return `<div data-soc-obj="${o[0]}" style="border:${on ? "2px solid " + ROXO : "1px solid #E6E6EA"};border-radius:14px;background:${on ? "rgba(103,61,230,0.05)" : "#FFFFFF"};padding:${on ? 17 : 18}px;cursor:pointer;box-shadow:${on ? "0 6px 16px rgba(103,61,230,0.12)" : "none"}">
        <span style="width:38px;height:38px;border-radius:11px;background:${o[3]};display:flex;align-items:center;justify-content:center;margin-bottom:14px">${icon(P[o[0]], 18, "#FFFFFF")}</span>
        <div style="font-size:13.5px;font-weight:700;margin-bottom:3px">${o[1]}</div><div style="font-size:12px;color:${CINZA}">${o[2]}</div></div>`; }).join("")}</div>`;
  }
  function passo2(){
    const d = S().d;
    return `<div style="display:flex;flex-direction:column;gap:18px">
      ${campo("nome", "Nome da marca", "Ex: Best Green")}
      <div>${lbl("Onde essa marca atua?", false, "Usamos para mostrar as datas comemorativas certas do seu país")}
        <select data-soc-campo="pais" style="${IN};cursor:pointer">${PAISES.map(p => `<option value="${p[1]}" ${(d.pais || "Brasil") === p[1] ? "selected" : ""}>${p[0]}  ${p[1]}</option>`).join("")}</select></div>
      ${campo("oQueFaz", "O que a marca faz?", "Ex: Vende produtos de alimentação saudável", { area: true, sub: "Descreva em poucas frases o negócio, produto ou serviço" })}
      ${avancado(2, [
        campo("tag", "Tag / Rótulo", "Ex: BestGreen Brasil", { opc: true, sub: "Identificador curto para diferenciar marcas com nomes parecidos" }),
        campo("instagram", "@ do Instagram", "suamarca", { opc: true, prefix: "@" }),
        campo("website", "Website", "suamarca.com.br", { opc: true }),
        campo("diferencial", "O que torna a marca única?", "Ex: preços mais baixos e maior variedade", { opc: true, area: true, sub: "Qual o diferencial em relação aos concorrentes?" }),
        campo("produtos", "Produtos/Serviços principais", "Ex: suplementos, barras de proteína, vitaminas e grãos", { opc: true, area: true, sub: "Liste os principais e, se possível, a faixa de preço" })
      ].join(""))}</div>`;
  }
  function passo3(){
    return `<div style="display:flex;flex-direction:column;gap:18px">
      ${campo("clienteIdeal", "Quem é o cliente ideal?", "Ex: jovens, adultos e idosos que buscam uma vida mais saudável pela alimentação", { area: true, sub: "Idade, gênero, localização, profissão, estilo de vida" })}
      ${avancado(3, [
        campo("dores", "Quais são as dores e problemas desse público?", "O que incomoda? O que falta?", { opc: true, area: true, sub: "O que incomoda? O que falta? Que problema precisam resolver?" }),
        campo("desejos", "Quais são os desejos e sonhos?", "Ex: querem ter uma vida mais longa", { opc: true, area: true, sub: "O que querem alcançar? Como querem se sentir?" }),
        campo("objecoes", "O que impede de comprar?", "Ex: acham caro, não confiam em loja online", { opc: true, area: true, sub: "Dúvidas e objeções mais comuns" })
      ].join(""))}</div>`;
  }
  function formLabel(v){ return v < 34 ? "Informal" : v > 66 ? "Formal" : "Equilibrado"; }
  function passo4(){
    const d = S().d, tons = d.tons || [];
    const f = d.formalidade === undefined ? 50 : d.formalidade;
    return `<div style="display:flex;flex-direction:column;gap:18px">
      <div>${lbl("Tom de voz", false, "Selecione os tons que melhor representam sua marca")}
        <div style="display:flex;flex-wrap:wrap;gap:8px">${TONS.map(t => { const on = tons.includes(t);
          return `<span data-soc-tom="${e(t)}" style="padding:7px 14px;border-radius:20px;font-size:12.5px;cursor:pointer;border:1px solid ${on ? "rgba(26,108,232,0.45)" : "#DADADF"};background:${on ? "#E3EDFD" : "#FFFFFF"};color:${on ? "#1A5BC4" : "#17171A"};font-weight:${on ? 600 : 400}">${e(t)}</span>`; }).join("")}</div></div>
      ${avancado(4, [
        campo("persona", "Se a marca fosse uma pessoa, como ela seria?", "Ex: seria uma amiga confiante e estilosa, que fala de forma direta mas acolhedora...", { opc: true, area: true, sub: "Descreva personalidade, jeito de falar, estilo" }),
        `<div>${lbl("Nível de formalidade", true)}
          <div style="display:flex;align-items:center;gap:14px;font-size:12.5px;color:${CINZA}"><span>Informal</span><input data-soc-formal type="range" min="0" max="100" step="5" value="${f}" style="flex:1;accent-color:#1A6CE8"><span>Formal</span></div>
          <div id="soc-formal-lbl" style="text-align:center;font-size:12.5px;color:#1A6CE8;font-weight:600;margin-top:4px">${formLabel(f)}</div></div>`,
        campo("palavrasUsa", "Palavras/expressões que a marca USA", "Ex: Seja Green!", { opc: true, area: true, sub: "Termos, bordões, jeitos de falar característicos" }),
        campo("palavrasEvita", "Palavras/expressões que a marca NÃO USA", "Ex: gírias, palavrões, termos muito pesados", { opc: true, area: true, sub: "O que evitar na comunicação?" })
      ].join(""))}</div>`;
  }
  function passo5(){
    const s = S(), d = s.d, m = s.marca || {}, c = d.cores || {};
    const logoBox = m.logo
      ? `<div style="border:2px dashed #DADADF;border-radius:16px;padding:18px;display:flex;align-items:center;gap:18px;flex-wrap:wrap">
          <span style="position:relative;width:96px;height:96px;border-radius:14px;border:1px solid #E6E6EA;background:#FFFFFF;display:flex;align-items:center;justify-content:center">
            <img src="${e(m.logo)}" alt="Logo" style="max-width:84%;max-height:84%;object-fit:contain">
            <span style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#22C55E;display:flex;align-items:center;justify-content:center;border:2px solid #FFFFFF">${icon(ICONS.check, 11, "#FFFFFF")}</span></span>
          <div style="flex:1;min-width:180px"><div style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#16A34A;margin-bottom:8px">${icon(ICONS.check, 14, "currentColor")}Logo enviada com sucesso</div>
            ${(d.coresLogo || []).length ? `<div style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:${CINZA}">${icon(P.estilo, 14, "#C9771B")}Cores detectadas: ${d.coresLogo.map(x => `<span title="${e(x)}" style="width:18px;height:18px;border-radius:50%;background:${e(x)};display:inline-block;border:1px solid rgba(0,0,0,0.08)"></span>`).join("")}</div>` : ""}</div>
          <span data-soc-logo-rm title="Remover logo" style="cursor:pointer;display:flex;padding:6px">${icon(ICONS.x, 15, CINZA)}</span></div>`
      : `<label style="border:2px dashed #DADADF;border-radius:16px;padding:34px 20px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;background:#FFFFFF">
          <span style="width:52px;height:52px;border-radius:13px;background:#F4F4F6;display:flex;align-items:center;justify-content:center;margin-bottom:6px">${icon(P.upload, 22, "#3C3C44")}</span>
          <span style="font-size:14px;font-weight:600">${s.busy === "logo" ? "Enviando..." : "Enviar logo"}</span>
          <span style="font-size:12px;color:${CINZA}">PNG, JPG ou WebP até 5MB</span><span style="font-size:11px;color:#9A9AA3">SVG aceito (convertido para PNG)</span>
          <input data-soc-logo-file type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none"></label>`;
    const atuais = `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:12px 14px;border-radius:12px;background:#F4F4F6;font-size:12.5px;color:${CINZA}"><span>Cores atuais:</span>
      ${[["primaria", "Primária"], ["secundaria", "Secundária"], ["destaque", "Destaque"]].map(k => `<span style="display:inline-flex;align-items:center;gap:7px"><span style="width:28px;height:28px;border-radius:50%;background:${c[k[0]] ? e(c[k[0]]) : "#FFFFFF"};border:1px solid ${c[k[0]] ? "rgba(0,0,0,0.08)" : "#DADADF"}"></span>${k[1]}</span>`).join("")}</div>`;
    const cores = c.personalizar
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">${[["primaria", "Primária"], ["secundaria", "Secundária"], ["destaque", "Destaque"]].map(k => `<div><div style="font-size:12px;font-weight:600;margin-bottom:6px">${k[1]}</div>
          <div style="display:flex;gap:8px;align-items:center"><input data-soc-cor-pick="${k[0]}" type="color" value="${e(c[k[0]] || "#CCCCCC")}" style="width:40px;height:40px;border:1px solid #E6E6EA;border-radius:9px;padding:3px;background:#FFFFFF;cursor:pointer">
          <input data-soc-cor="${k[0]}" value="${e(c[k[0]] || "")}" placeholder="#000000" maxlength="7" style="${IN};font-family:ui-monospace,monospace"></div></div>`).join("")}</div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">${PALETAS.map(p => { const on = c.paleta === p[0];
          return `<div data-soc-paleta="${e(p[0])}" style="border:${on ? "2px solid " + ROXO : "1px solid #E6E6EA"};border-radius:12px;padding:${on ? 9 : 10}px;cursor:pointer;background:#FFFFFF;text-align:center">
            <div style="display:flex;justify-content:center;gap:4px;margin-bottom:6px">${p.slice(1).map(x => `<span style="width:20px;height:20px;border-radius:50%;background:${x};border:1px solid rgba(0,0,0,0.06)"></span>`).join("")}</div><div style="font-size:11.5px;color:#3C3C44">${e(p[0])}</div></div>`; }).join("")}</div>`;
    const refs = (m.refs || []);
    const fid = FID.find(f => f[0] === d.fidelidade);
    const refsHTML = refs.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px">${refs.map(r => `<span style="position:relative;width:74px;height:92px;border-radius:10px;overflow:hidden;border:1px solid #E6E6EA;background:#F4F4F6"><img src="${e(r.url)}" alt="" style="width:100%;height:100%;object-fit:cover"><span data-soc-ref-rm="${e(r.id)}" title="Remover" style="position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(23,23,26,0.7);display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.x, 10, "#FFFFFF")}</span></span>`).join("")}
        ${fid ? `<span data-soc-fid-edit style="align-self:center;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:${ROXO};border:1px solid rgba(103,61,230,0.35);background:rgba(103,61,230,0.06);padding:5px 10px;border-radius:20px;cursor:pointer">${icon(fid[4], 12, "currentColor")}${e(fid[1])}</span>` : ""}</div>` : "";
    const gerando = s.busy === "ia";
    return `<div style="display:flex;flex-direction:column;gap:22px">
      <div><div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:10px">${icon(P.logo, 15, "#C9771B")}Logo da marca <span style="font-size:10.5px;font-weight:600;color:${CINZA};background:#F1F1F3;padding:2px 7px;border-radius:6px">opcional</span></div>${logoBox}</div>
      <div><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600">${icon(P.estilo, 15, "#1A6CE8")}Cores da marca</span>
        <span style="margin-left:auto;font-size:12.5px;color:#3C3C44">Personalizar</span>
        <span data-soc-personalizar style="width:40px;height:22px;border-radius:20px;background:${c.personalizar ? "#22C55E" : "#DADADF"};position:relative;cursor:pointer;transition:background .2s"><span style="position:absolute;top:2px;left:${c.personalizar ? 20 : 2}px;width:18px;height:18px;border-radius:50%;background:#FFFFFF;box-shadow:0 1px 3px rgba(0,0,0,0.2);transition:left .2s"></span></span></div>
        <div style="display:flex;flex-direction:column;gap:12px">${atuais}${cores}</div></div>
      <div><div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:4px">${icon(ICONS.sparkle, 15, "#C9771B")}Descrição do estilo visual</div>
        <div style="font-size:12px;color:${CINZA};margin-bottom:10px">A IA gera esta descrição com base nos dados da sua marca. Edite livremente ou adicione uma referência visual.</div>
        ${refsHTML}
        <textarea data-soc-campo="descricaoEstilo" rows="7" placeholder="${gerando ? "Gerando a descrição com IA..." : "Ex: identidade clean e arejada, tipografia sans-serif moderna, tons de verde botânico com neutros suaves..."}" ${gerando ? "disabled" : ""} style="${IN};resize:vertical;line-height:1.55;${gerando ? "opacity:.6" : ""}">${e(d.descricaoEstilo || "")}</textarea>
        ${s.refinar ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><input id="soc-refinar-txt" placeholder="O que ajustar? Ex: mais minimalista, fotos com fundo branco" style="${IN};flex:1;min-width:220px;background:#FFFFFF"><span data-soc-refinar-go style="${BTN_PRI};padding:9px 16px;font-size:12.5px">${icon(ICONS.sparkle, 13, "currentColor")}Refinar</span></div>` : ""}
        <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;align-items:center">
          <label style="${BTN_SEC};${refs.length >= 8 ? "opacity:.5;pointer-events:none" : ""}">${icon(P.upload, 13, "currentColor")}${s.busy === "ref" ? "Enviando..." : "Adicionar referência visual"}<input data-soc-ref-file type="file" accept="image/png,image/jpeg,image/webp" style="display:none"></label>
          <span data-soc-refinar style="${BTN_SEC};margin-left:auto;${gerando ? "opacity:.6;pointer-events:none" : ""}">${icon(P.varinha, 13, "currentColor")}${gerando ? "Gerando..." : (d.descricaoEstilo ? "Refinar com IA" : "Gerar com IA")}</span></div>
        <div style="font-size:11.5px;color:#9A9AA3;margin-top:8px">Esta descrição guia a IA na geração de imagens para sua marca. Quanto mais detalhada, melhores os resultados.</div></div>
    </div>`;
  }
  function wizard(){
    const s = S(), n = s.passo, ps = PASSOS[n - 1];
    const corpo = [passo1, passo2, passo3, passo4, passo5][n - 1]();
    const bolinhas = PASSOS.map((p, i) => { const feito = i + 1 <= n; const ir = i + 1 < n || (s.id && i + 1 !== n);
      return `<div ${ir ? `data-soc-ir="${i + 1}"` : ""} style="display:flex;flex-direction:column;align-items:center;gap:7px;${ir ? "cursor:pointer" : ""}">
        <span style="width:40px;height:40px;border-radius:50%;background:${feito ? "#1A6CE8" : "#EDEDF0"};display:flex;align-items:center;justify-content:center">${icon(P[p[0]], 18, feito ? "#FFFFFF" : "#9A9AA3")}</span>
        <span style="font-size:11.5px;font-weight:${i + 1 === n ? 700 : 500};color:${feito ? "#17171A" : "#9A9AA3"}">${p[1]}</span></div>`; }).join("");
    return `<div style="background:#F7F7F8;min-height:100%">
      <div style="background:#FFFFFF;border-bottom:1px solid #E6E6EA;padding:16px 40px;display:flex;align-items:center;gap:12px">
        <span data-soc-lista style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:${CINZA};cursor:pointer">${icon(ICONS.arrowLeft, 14, "currentColor")}Marcas</span>
        <div style="margin-left:14px;padding-left:14px;border-left:1px solid #E6E6EA"><div style="${HEAD};font-size:14px;font-weight:700">${e(s.d.nome || "Nova marca")} <span style="font-size:10px;color:${ROXO};vertical-align:super">AI</span></div><div style="font-size:11.5px;color:${CINZA}">Configure sua marca em 5 passos simples</div></div>
        <span style="margin-left:auto;font-size:12.5px;color:${CINZA}">Passo ${n} de 5</span></div>
      <div style="max-width:760px;margin:0 auto;padding:22px 24px 40px">
        <div style="height:5px;border-radius:5px;background:#E6E6EA;margin-bottom:20px"><div style="height:100%;width:${n * 20}%;border-radius:5px;background:#1A6CE8;transition:width .3s"></div></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:32px">${bolinhas}</div>
        <div style="text-align:center;margin-bottom:26px">
          <span style="width:58px;height:58px;border-radius:50%;background:${ps[4]};display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px">${icon(P[ps[0]], 26, ps[5])}</span>
          <h1 style="${HEAD};font-size:23px;font-weight:700;margin:0 0 6px">${ps[2]}</h1><p style="margin:0;color:${CINZA};font-size:13.5px">${ps[3]}</p></div>
        ${msgHTML()}
        <div style="max-width:${n === 1 ? 560 : 640}px;margin:0 auto">${corpo}</div>
        <div style="display:flex;align-items:center;margin:34px auto 0;max-width:640px;padding-top:18px;border-top:1px solid #E6E6EA">
          ${n > 1 ? `<span data-soc-voltar style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#1A6CE8;cursor:pointer;font-weight:600">${icon(ICONS.arrowLeft, 14, "currentColor")}Voltar</span>` : ""}
          <span data-soc-avancar style="${BTN_PRI};margin-left:auto;background:#1A6CE8;border-radius:22px;padding:11px 22px;${s.busy === "salvar" ? "opacity:.6;pointer-events:none" : ""}">${s.busy === "salvar" ? "Salvando..." : n === 5 ? "Finalizar" : "Continuar"}${icon(n === 5 ? ICONS.check : ICONS.arrowRight, 14, "currentColor")}</span></div>
      </div>${s.modal === "fid" ? modalFid() : ""}</div>`;
  }
  function modalFid(){
    const s = S(), sel = s.fidSel || s.d.fidelidade || "";
    return `<div data-soc-modal-bg style="position:fixed;inset:0;background:rgba(23,23,26,0.45);z-index:900;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="background:#FFFFFF;border-radius:20px;width:100%;max-width:360px;padding:22px 18px 18px;position:relative;box-shadow:0 30px 70px rgba(0,0,0,0.25)">
        <span data-soc-modal-x style="position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:50%;border:1px solid #E6E6EA;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.x, 12, CINZA)}</span>
        <div style="text-align:center;margin-bottom:16px"><div style="${HEAD};font-size:16px;font-weight:700;margin-bottom:4px">Quanto seguir a referência?</div><div style="font-size:12px;color:${CINZA}">Escolha o nível de fidelidade para seus posts</div></div>
        <div style="display:flex;flex-direction:column;gap:10px">${FID.map(f => { const on = sel === f[0];
          return `<div data-soc-fid="${f[0]}" style="border:${on ? "1.5px solid #17171A" : "1px solid #E6E6EA"};border-radius:12px;padding:${on ? "11.5px" : "12px"};display:flex;gap:11px;cursor:pointer">
            <span style="width:28px;height:28px;flex:0 0 28px;border-radius:50%;background:#F1F1F3;display:flex;align-items:center;justify-content:center">${icon(f[4], 13, "#3C3C44")}</span>
            <div><div style="font-size:12.5px;font-weight:700">${f[1]}</div><div style="font-size:11.5px;color:#3C3C44;margin:2px 0">${f[2]}</div><div style="font-size:10.5px;color:#9A9AA3;font-style:italic">Recomendado para: ${f[3]}</div></div></div>`; }).join("")}</div>
        <span data-soc-fid-ok style="${BTN_PRI};width:100%;margin-top:16px;border-radius:12px;background:${sel ? "#1A6CE8" : "#A9C8F5"};${sel ? "" : "pointer-events:none"};box-sizing:border-box">Avançar${icon(ICONS.chevRight, 13, "currentColor")}</span>
      </div></div>`;
  }

  // ─── Brand Kit pronto ───────────────────────────────────────────────────────
  function kit(){
    const s = S(), m = s.marca || {}, d = m.dados || {};
    const ob = OBJ.find(o => o[0] === d.objetivo), fid = FID.find(f => f[0] === d.fidelidade);
    const linha = (rot, v) => v ? `<div style="display:flex;gap:14px;padding:9px 0;border-top:1px solid #F1F1F3;font-size:13px"><span style="color:${CINZA};min-width:150px;flex:0 0 150px">${rot}</span><span style="flex:1;line-height:1.5;white-space:pre-wrap">${e(v)}</span></div>` : "";
    const bloco = (n, tit, conteudo) => `<div style="border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:18px 20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="width:30px;height:30px;border-radius:50%;background:${PASSOS[n - 1][4]};display:flex;align-items:center;justify-content:center">${icon(P[PASSOS[n - 1][0]], 14, PASSOS[n - 1][5])}</span>
      <span style="${HEAD};font-size:15px;font-weight:600">${tit}</span><span data-soc-editar="${n}" style="margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:${ROXO};cursor:pointer;font-weight:600">${icon(ICONS.edit, 12, "currentColor")}Editar</span></div>${conteudo}</div>`;
    const c = d.cores || {};
    return `<div style="padding:30px 40px 60px;max-width:1100px">
      <span data-soc-lista style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:${CINZA};cursor:pointer;margin-bottom:20px">${icon(ICONS.arrowLeft, 14, "currentColor")}Marcas</span>
      ${msgHTML()}
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:22px">
        <span style="width:68px;height:68px;border-radius:16px;border:1px solid #E6E6EA;background:#FFFFFF;display:flex;align-items:center;justify-content:center;overflow:hidden">${m.logo ? `<img src="${e(m.logo)}" alt="" style="max-width:84%;max-height:84%;object-fit:contain">` : `<span style="${HEAD};font-size:22px;font-weight:700;color:${ROXO}">${e((m.nome || "?").slice(0, 2).toUpperCase())}</span>`}</span>
        <div style="flex:1;min-width:220px"><div style="font-size:10.5px;letter-spacing:0.16em;color:${ROXO};font-weight:700;margin-bottom:4px">BRAND KIT</div>
          <h1 style="${HEAD};font-size:25px;font-weight:600;margin:0">${e(m.nome)}</h1>
          <div style="font-size:12.5px;color:${CINZA};margin-top:3px">${[d.tag, d.instagram && "@" + d.instagram, d.website].filter(Boolean).map(e).join(" · ")}</div></div>
        <span style="font-size:10.5px;font-weight:700;letter-spacing:0.06em;padding:5px 11px;border-radius:20px;${m.completo ? `color:${VERDE};border:1px solid rgba(15,122,104,0.35);background:rgba(15,122,104,0.07)` : `color:#9A5B00;border:1px solid rgba(201,119,27,0.4);background:#FDF6EC`}">${m.completo ? "PRONTO PARA O AGENTE DE DESIGN" : "INCOMPLETO"}</span>
        <span data-soc-criar-post="${e(m.id)}" style="${BTN_PRI}">${icon(ICONS.sparkle, 14, "currentColor")}Criar post</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px">
        ${bloco(1, "Objetivo", linha("Objetivo principal", ob && ob[1]))}
        ${bloco(2, "Marca", linha("O que faz", d.oQueFaz) + linha("Onde atua", d.pais) + linha("Diferencial", d.diferencial) + linha("Produtos/serviços", d.produtos))}
        ${bloco(3, "Público", linha("Cliente ideal", d.clienteIdeal) + linha("Dores", d.dores) + linha("Desejos", d.desejos) + linha("Objeções", d.objecoes))}
        ${bloco(4, "Identidade", linha("Tom de voz", (d.tons || []).join(", ")) + linha("Personalidade", d.persona) + linha("Formalidade", d.formalidade !== undefined ? formLabel(d.formalidade) + " (" + d.formalidade + "/100)" : "") + linha("Usa", d.palavrasUsa) + linha("Não usa", d.palavrasEvita))}
      </div>
      <div style="margin-top:16px">${bloco(5, "Estilo visual", `
        <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;padding:8px 0 12px">${[["primaria", "Primária"], ["secundaria", "Secundária"], ["destaque", "Destaque"]].filter(k => c[k[0]]).map(k => `<div style="display:flex;align-items:center;gap:9px"><span style="width:38px;height:38px;border-radius:10px;background:${e(c[k[0]])};border:1px solid rgba(0,0,0,0.08)"></span><div><div style="font-size:12px;font-weight:600">${k[1]}</div><div style="font-size:11.5px;color:${CINZA};font-family:ui-monospace,monospace">${e(c[k[0]])}</div></div></div>`).join("")}</div>
        ${d.descricaoEstilo ? `<div style="padding:14px 16px;border-radius:12px;background:#F7F7F8;font-size:13px;line-height:1.6">${e(d.descricaoEstilo)}</div>` : ""}
        ${(m.refs || []).length ? `<div style="font-size:12px;color:${CINZA};margin:14px 0 8px">Referências visuais${fid ? " · " + e(fid[1]) : ""}</div><div style="display:flex;flex-wrap:wrap;gap:10px">${m.refs.map(r => `<a href="${e(r.url)}" target="_blank" rel="noopener" style="width:90px;height:112px;border-radius:10px;overflow:hidden;border:1px solid #E6E6EA;display:block"><img src="${e(r.url)}" alt="" style="width:100%;height:100%;object-fit:cover"></a>`).join("")}</div>` : ""}`)}</div>
      <div style="margin-top:16px;border:1px solid #E6E6EA;border-radius:16px;background:#FAFAFA;padding:14px 18px;font-size:12.5px;color:${CINZA};line-height:1.55">${icon(ICONS.info, 13, ROXO)} O agente de design e os demais agentes do ZEUS leem este Brand Kit ao criar posts para <strong>${e(m.nome)}</strong>. Basta citar a marca no pedido.</div>
    </div>`;
  }

  function page(){ const s = S(); return s.view === "wizard" ? wizard() : s.view === "kit" ? kit() : lista(); }

  // ─── Ações ──────────────────────────────────────────────────────────────────
  function abrir(m, view, passo){
    const s = S();
    s.id = m ? m.id : null; s.marca = m || null;
    s.d = m ? JSON.parse(JSON.stringify(m.dados || {})) : { pais: "Brasil", cores: { personalizar: false } };
    if(!s.d.cores) s.d.cores = { personalizar: false };
    s.view = view; s.passo = passo || 1; s.av = {}; s.msg = null; s.modal = null; s.refinar = false;
    paint(); window.scrollTo(0, 0);
  }
  function validar(n){
    const d = S().d;
    if(n === 1 && !d.objetivo) return "Escolha o principal objetivo.";
    if(n === 2 && !(d.nome || "").trim()) return "Informe o nome da marca.";
    if(n === 2 && !(d.oQueFaz || "").trim()) return "Conte em poucas frases o que a marca faz.";
    if(n === 3 && !(d.clienteIdeal || "").trim()) return "Descreva o cliente ideal.";
    if(n === 4 && !(d.tons || []).length) return "Selecione pelo menos um tom de voz.";
    if(n === 5 && !(d.descricaoEstilo || "").trim()) return "Gere ou escreva a descrição do estilo visual.";
    return null;
  }
  async function salvar(){
    const s = S();
    const m = s.id ? await api("/" + s.id, "PUT", s.d) : await api("", "POST", s.d);
    s.id = m.id; s.marca = m;
    const i = (s.marcas || []).findIndex(x => x.id === m.id);
    if(s.marcas){ if(i >= 0) s.marcas[i] = m; else s.marcas.unshift(m); }
    return m;
  }
  async function irPara(n){
    const s = S();
    s.busy = "salvar"; paint();
    try { await salvar(); s.msg = null; } catch(err){ s.busy = null; s.msg = ["Não consegui salvar: " + err.message, true]; paint(); return; }
    s.busy = null; s.passo = n; s.av = {}; s.refinar = false; paint(); window.scrollTo(0, 0);
    if(n === 5 && !(s.d.descricaoEstilo || "").trim()) gerarEstilo("");
  }
  async function avancar(){
    const s = S(), err = validar(s.passo);
    if(err){ aviso(err, true); return; }
    if(s.passo < 5) return irPara(s.passo + 1);
    s.busy = "salvar"; paint();
    try { await salvar(); } catch(x){ s.busy = null; s.msg = ["Não consegui salvar: " + x.message, true]; paint(); return; }
    s.busy = null; s.view = "kit"; s.msg = ["Brand Kit salvo. O agente de design já pode criar posts para " + (s.marca.nome || "a marca") + ".", false]; paint(); window.scrollTo(0, 0);
  }
  async function gerarEstilo(pedido){
    const s = S(); if(!s.id || s.busy === "ia") return;
    s.busy = "ia"; s.msg = null; paint();
    try {
      const j = await api("/" + s.id + "/ia/estilo", "POST", { dados: s.d, atual: s.d.descricaoEstilo || "", pedido: pedido || "" });
      s.d.descricaoEstilo = j.descricao; s.refinar = false;
      try { await salvar(); } catch(_){}
    } catch(err){ s.msg = [err.message, true]; }
    s.busy = null; paint();
  }

  // Arquivo → dataURL. SVG vira PNG; foto grande é reduzida (lado maior 1600px) pra caber no limite.
  function lerArquivo(file){ return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error("não consegui ler o arquivo")); r.readAsDataURL(file); }); }
  function carregarImg(src){ return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("imagem inválida")); i.src = src; }); }
  async function prepararImagem(file, opts){
    if(file.size > 5 * 1024 * 1024 && !opts.reduzir) throw new Error("A imagem passa de 5MB.");
    let url = await lerArquivo(file);
    const svg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if(svg || (opts.reduzir && file.size > 1.5 * 1024 * 1024)){
      const img = await carregarImg(url);
      const w0 = img.naturalWidth || 1024, h0 = img.naturalHeight || 1024;
      const alvo = svg ? 1024 : 1600, k = Math.min(1, alvo / Math.max(w0, h0)) || 1;
      const esc = svg ? alvo / Math.max(w0, h0) : k;
      const cv = document.createElement("canvas"); cv.width = Math.round(w0 * esc); cv.height = Math.round(h0 * esc);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      url = svg ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.88);
    }
    return url;
  }
  // Cores dominantes da logo: ignora transparente e quase-branco, agrupa tons próximos
  async function coresDaLogo(url){
    try {
      const img = await carregarImg(url);
      const cv = document.createElement("canvas"); cv.width = 72; cv.height = 72;
      const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, 72, 72);
      const px = cx.getImageData(0, 0, 72, 72).data, cont = {};
      for(let i = 0; i < px.length; i += 4){
        if(px[i + 3] < 200) continue;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        if(r > 232 && g > 232 && b > 232) continue;
        const k = (r >> 4) + "," + (g >> 4) + "," + (b >> 4);
        const c = cont[k] || (cont[k] = { n: 0, r: 0, g: 0, b: 0 }); c.n++; c.r += r; c.g += g; c.b += b;
      }
      const grupos = [];
      Object.values(cont).sort((a, b) => b.n - a.n).forEach(c => {
        const cor = [c.r / c.n, c.g / c.n, c.b / c.n];
        const g = grupos.find(x => Math.hypot(x.cor[0] - cor[0], x.cor[1] - cor[1], x.cor[2] - cor[2]) < 60);
        if(g) g.n += c.n; else grupos.push({ cor, n: c.n });
      });
      const hex = v => Math.round(v).toString(16).padStart(2, "0");
      return grupos.sort((a, b) => b.n - a.n).filter(g => g.n >= 12).slice(0, 3).map(g => ("#" + hex(g.cor[0]) + hex(g.cor[1]) + hex(g.cor[2])).toUpperCase());
    } catch(_){ return []; }
  }
  async function enviarLogo(file){
    const s = S(); if(!file) return;
    s.busy = "logo"; s.msg = null; paint();
    try {
      const url = await prepararImagem(file, {});
      const cores = await coresDaLogo(url);
      s.marca = await api("/" + s.id + "/logo", "PUT", { dataUrl: url });
      if(cores.length){
        s.d.coresLogo = cores;
        s.d.cores = { personalizar: true, primaria: cores[0], secundaria: cores[1] || s.d.cores.secundaria || "#424242", destaque: cores[2] || clarear(cores[0], 0.3) };
      }
      await salvar();
    } catch(err){ s.busy = null; s.msg = ["Logo: " + err.message, true]; paint(); return; }
    s.busy = null;
    // A descrição foi escrita antes da logo: reescreve com as cores e o visual dela
    if((s.d.descricaoEstilo || "").trim()) gerarEstilo("Atualize a descrição para a logo recém-enviada e as cores da marca atuais.");
    else paint();
  }
  function clarear(hex, k){ const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * k)); return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase(); }
  async function enviarRef(file, fidelidade){
    const s = S(); if(!file) return;
    s.busy = "ref"; s.msg = null; paint();
    try {
      const url = await prepararImagem(file, { reduzir: true });
      s.marca = await api("/" + s.id + "/refs", "POST", { dataUrl: url, nome: file.name });
      s.d.fidelidade = fidelidade;
      await salvar();
    } catch(err){ s.busy = null; s.msg = ["Referência: " + err.message, true]; paint(); return; }
    s.busy = null;
    gerarEstilo("Incorpore o que se vê nas referências visuais, respeitando o nível de fidelidade escolhido.");
  }

  let _refPend = null;
  function bind(root){
    bindOnce(root, "click", async ev => {
      const s = S(); const q = sel => ev.target.closest(sel);
      let el;
      if((el = q("[data-soc-voltar-lp]"))){ setState({ toolView: "lp" }); return; }
      if((el = q("[data-soc-nova]"))){ abrir(null, "wizard", 1); return; }
      if((el = q("[data-soc-abrir]"))){ const m = (s.marcas || []).find(x => x.id === el.dataset.socAbrir); if(m) abrir(m, m.completo ? "kit" : "wizard", 1); return; }
      if((el = q("[data-soc-excluir]"))){
        const m = (s.marcas || []).find(x => x.id === el.dataset.socExcluir); if(!m) return;
        if(!confirm(`Excluir a marca "${m.nome}"? Logo, referências e o Brand Kit serão apagados.`)) return;
        try { await api("/" + m.id, "DELETE"); s.marcas = s.marcas.filter(x => x.id !== m.id); s.msg = ["Marca excluída.", false]; } catch(err){ s.msg = [err.message, true]; }
        paint(); return;
      }
      if((el = q("[data-soc-criar-post]"))){ if(typeof designAbrirMarca === "function") designAbrirMarca(el.dataset.socCriarPost); return; }
      if((el = q("[data-soc-lista]"))){ s.view = "lista"; s.msg = null; paint(); carregar(); return; }
      if((el = q("[data-soc-editar]"))){ abrir(s.marca, "wizard", parseInt(el.dataset.socEditar, 10)); return; }
      if((el = q("[data-soc-av]"))){ s.av[el.dataset.socAv] = !s.av[el.dataset.socAv]; paint(); return; }
      if((el = q("[data-soc-obj]"))){ s.d.objetivo = el.dataset.socObj; s.msg = null; paint(); return; }
      if((el = q("[data-soc-tom]"))){ const t = el.dataset.socTom, l = s.d.tons || []; s.d.tons = l.includes(t) ? l.filter(x => x !== t) : l.concat([t]); s.msg = null; paint(); return; }
      if((el = q("[data-soc-personalizar]"))){ s.d.cores.personalizar = !s.d.cores.personalizar; paint(); return; }
      if((el = q("[data-soc-paleta]"))){ const p = PALETAS.find(x => x[0] === el.dataset.socPaleta); if(p) s.d.cores = { personalizar: false, paleta: p[0], primaria: p[1], secundaria: p[2], destaque: p[3] }; paint(); return; }
      if((el = q("[data-soc-logo-rm]"))){ try { s.marca = await api("/" + s.id + "/logo", "DELETE"); delete s.d.coresLogo; await salvar(); } catch(err){ s.msg = [err.message, true]; } paint(); return; }
      if((el = q("[data-soc-ref-rm]"))){ try { s.marca = await api("/" + s.id + "/refs/" + el.dataset.socRefRm, "DELETE"); } catch(err){ s.msg = [err.message, true]; } paint(); return; }
      if((el = q("[data-soc-refinar-go]"))){ const t = document.getElementById("soc-refinar-txt"); gerarEstilo(t ? t.value : ""); return; }
      if((el = q("[data-soc-refinar]"))){ if(!s.d.descricaoEstilo){ gerarEstilo(""); return; } s.refinar = !s.refinar; paint(); const t = document.getElementById("soc-refinar-txt"); if(t) t.focus(); return; }
      if((el = q("[data-soc-fid-edit]"))){ _refPend = null; s.fidSel = s.d.fidelidade; s.modal = "fid"; paint(); return; }
      if((el = q("[data-soc-fid]"))){ s.fidSel = el.dataset.socFid; paint(); return; }
      if((el = q("[data-soc-fid-ok]"))){
        const f = s.fidSel; s.modal = null; s.fidSel = null;
        if(_refPend){ const file = _refPend; _refPend = null; enviarRef(file, f); }
        else { s.d.fidelidade = f; paint(); try { await salvar(); } catch(_){} }
        return;
      }
      if((el = q("[data-soc-modal-x]")) || ev.target.matches("[data-soc-modal-bg]")){ s.modal = null; s.fidSel = null; _refPend = null; paint(); return; }
      if((el = q("[data-soc-ir]"))){ const n = parseInt(el.dataset.socIr, 10); if(n > s.passo){ const err = validar(s.passo); if(err){ aviso(err, true); return; } } irPara(n); return; }
      if((el = q("[data-soc-voltar]"))){ irPara(s.passo - 1); return; }
      if((el = q("[data-soc-avancar]"))){ avancar(); return; }
    });
    bindOnce(root, "input", ev => {
      const s = S(), t = ev.target;
      if(t.dataset.socCampo){ s.d[t.dataset.socCampo] = t.value; return; }
      if(t.hasAttribute("data-soc-formal")){ s.d.formalidade = parseInt(t.value, 10); const l = document.getElementById("soc-formal-lbl"); if(l) l.textContent = formLabel(s.d.formalidade); return; }
      if(t.dataset.socCorPick){ s.d.cores[t.dataset.socCorPick] = t.value.toUpperCase(); const h = root.querySelector(`[data-soc-cor="${t.dataset.socCorPick}"]`); if(h) h.value = t.value.toUpperCase(); return; }
      if(t.dataset.socCor){ let v = t.value.trim(); if(v && v[0] !== "#") v = "#" + v; if(/^#[0-9a-f]{6}$/i.test(v)){ s.d.cores[t.dataset.socCor] = v.toUpperCase(); const p = root.querySelector(`[data-soc-cor-pick="${t.dataset.socCor}"]`); if(p) p.value = v; } }
    });
    bindOnce(root, "change", ev => {
      const s = S(), t = ev.target;
      if(t.tagName === "SELECT" && t.dataset.socCampo){ s.d[t.dataset.socCampo] = t.value; return; }
      if(t.hasAttribute("data-soc-cor")){ paint(); return; }
      if(t.hasAttribute("data-soc-cor-pick")){ paint(); return; }
      if(t.hasAttribute("data-soc-logo-file")){ enviarLogo(t.files && t.files[0]); return; }
      if(t.hasAttribute("data-soc-ref-file")){ const f = t.files && t.files[0]; t.value = ""; if(!f) return; _refPend = f; s.fidSel = s.d.fidelidade || null; s.modal = "fid"; paint(); }
    });
    bindOnce(root, "keydown", ev => { if(ev.key === "Enter" && ev.target.id === "soc-refinar-txt"){ ev.preventDefault(); gerarEstilo(ev.target.value); } });
  }

  // ─── plug na Central ────────────────────────────────────────────────────────
  window.socialPage = function(opts){
    S().embed = !!(opts && opts.embed);
    if(opts && opts.marcaId) S().abrirId = opts.marcaId;
    setTimeout(() => {
      const root = document.getElementById("soc-root"); if(!root) return;
      bind(root);
      const s = S();
      if(!s.marcas && !s.loading) carregar(); else abrirPedida();
    }, 0);
    return `<div id="soc-root">${page()}</div>`;
  };
  if(state.screen === "ferramenta" && state.toolId === "social-media" && typeof abrirBrandKit === "function") abrirBrandKit(); // endereço antigo: o Brand Kit mora no Agente de Design
})();
