// Agente de Design: cria posts de imagem com IA a partir do Brand Kit (aba Brand Kit do próprio agente).
// Etapas: Formato → Modo (objetivo, abordagem, como criar) → Criar (prompt adaptado à marca) → Editor (imagem, ajustes por chat, versões).
// Carregado depois do script principal: usa state, setState, icon, ICONS, e (escape), bindOnce e attach de lá.
// Abre em /ferramentas/agente-design. Backend: /api/design (design.js) e /api/social (marcas).
(function(){
  const ROXO = "#673DE6", AZUL = "#1A6CE8", CINZA = "#66666F", VERM = "#C0341C", VERDE = "#0F7A68";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:11px 13px;border:1px solid #E6E6EA;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none;box-sizing:border-box";
  const CARD = "border:1px solid #ECECEF;border-radius:16px;background:#FFFFFF";
  const BTN = "display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 22px;border-radius:22px;background:" + AZUL + ";color:#FFFFFF;font:inherit;font-size:13.5px;font-weight:700;border:0;cursor:pointer";
  const BTN_SEC = "display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:12.5px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const P = {
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>',
    facebook: '<circle cx="12" cy="12" r="9"/><path d="M13.5 8H15V5.5h-1.8C11.4 5.5 10.5 6.6 10.5 8.4V10H9v2.5h1.5V19h2.6v-6.5H15l.4-2.5h-2.3V8.7c0-.5.2-.7.4-.7z"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
    whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>',
    tiktok: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.5 2.5 2.3 4 5 4"/>',
    youtube: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M10.5 9.5v5l4-2.5z"/>',
    twitter: '<path d="M4 4l16 16M20 4L4 20"/>',
    todas: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    coracao: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    dolar: '<path d="M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.6 4 3 4 1.4 4 3.2-1.8 3-4 3-4-1.3-4-3"/>',
    brilho: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    lampada: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    varinha: '<path d="M4 20l11-11M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3M18 3l1 1"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    camadas: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    enviar: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    galeria: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    refazer: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>'
  };
  const GRAD = { instagram: "linear-gradient(135deg,#F0366E 0%,#C613C9 55%,#8A2BE2 100%)", facebook: "linear-gradient(135deg,#3A5BE0 0%,#4C8DF6 60%,#5AB3F7 100%)",
    linkedin: "linear-gradient(135deg,#0A5DB8 0%,#1C7CD6 60%,#39A0E8 100%)", whatsapp: "linear-gradient(135deg,#1FA855 0%,#2FC06A 55%,#43D39B 100%)" };
  const GRAD_ALT = ["linear-gradient(135deg,#B83DF0 0%,#E03FB4 100%)", "linear-gradient(135deg,#E0406E 0%,#F1784A 100%)", "linear-gradient(135deg,#9B3BEA 0%,#E4498C 100%)"];
  const EM_BREVE = [["tiktok", "TikTok"], ["youtube", "YouTube"], ["twitter", "Twitter/X"]];

  function Z(){ if(!state.dz) state.dz = { cat: null, marcas: null, marcaId: null, aba: "criar", passo: "formato", plat: "todas", formato: null, objetivo: null, abordagem: null, verMais: false, modo: null, ideia: "", link: "", fonte: "", fonteTitulo: "", slides: 5, prompt: "", legenda: "", anexos: [], logo: true, refs: true, provider: "auto", qualidade: null, cria: null, criacoes: null, busy: null, msg: null, insp: null, refinar: false, slideSel: 0, chat: "" }; return state.dz; }
  async function api(base, url, method, body){
    const r = await fetch(base + url, { method: method || "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  const dz = (u, m, b) => api("/api/design", u, m, b);
  async function carregar(){
    const s = Z();
    try {
      const [cat, ms] = await Promise.all([dz("/catalogo"), api("/api/social", "")]);
      s.cat = cat; s.marcas = ms.marcas;
      if(!s.marcaId || !s.marcas.find(m => m.id === s.marcaId)) s.marcaId = (s.marcas.find(m => m.completo) || s.marcas[0] || {}).id || null;
    } catch(err){ s.msg = ["Não consegui carregar: " + err.message, true]; }
    paint();
  }
  function paint(){ const root = document.getElementById("dz-root"); if(!root) return; const y = window.scrollY; const foco = document.activeElement && document.activeElement.id; root.innerHTML = page(); if(typeof attach === "function") attach(); window.scrollTo(0, y); if(foco){ const f = document.getElementById(foco); if(f) f.focus(); } }
  function aviso(t, erro){ Z().msg = t ? [t, !!erro] : null; paint(); }
  function msgHTML(){ const m = Z().msg; return m ? `<div style="margin:0 auto 16px;max-width:980px;padding:10px 13px;border-radius:10px;font-size:12.5px;border:1px solid ${m[1] ? "rgba(192,52,28,0.3)" : "rgba(15,122,104,0.3)"};background:${m[1] ? "rgba(192,52,28,0.06)" : "rgba(15,122,104,0.06)"};color:${m[1] ? VERM : VERDE};display:flex;gap:10px"><span style="flex:1">${e(m[0])}</span><span data-dz-msg-x style="cursor:pointer">${icon(ICONS.x, 12, "currentColor")}</span></div>` : ""; }
  const marca = () => (Z().marcas || []).find(m => m.id === Z().marcaId) || null;
  const fmt = () => ((Z().cat || {}).formatos || []).find(f => f.id === Z().formato) || null;

  // ─── Barra de topo: marca, motor, abas ──────────────────────────────────────
  function topo(){
    const s = Z(), cat = s.cat || {}, mot = cat.motores || {};
    const provs = [["auto", "Automático"], ["gemini", "Nano Banana" + (mot.gemini ? "" : " (sem chave)")], ["openai", "GPT Image" + (mot.openai ? "" : " (sem chave)")]];
    if(s.embed) return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 24px;border-bottom:1px solid #ECECEF;background:#FFFFFF">
      <div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:${CINZA}">Marca
          <select data-dz-marca style="padding:7px 10px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF;max-width:190px">${(s.marcas || []).map(m => `<option value="${e(m.id)}" ${m.id === s.marcaId ? "selected" : ""}>${e(m.nome)}${m.completo ? "" : " (incompleta)"}</option>`).join("")}</select></label><span data-dz-editar-marca title="Abrir o Brand Kit desta marca: cores, logo, tom e estilo" style="display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border-radius:9px;font-size:12px;font-weight:700;color:${ROXO};background:rgba(103,61,230,0.08);cursor:pointer;white-space:nowrap">${icon(ICONS.edit, 12, ROXO)}Editar marca</span>
        <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:${CINZA}">Motor
          <select data-dz-provider style="padding:7px 10px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF">${provs.map(p => `<option value="${p[0]}" ${s.provider === p[0] ? "selected" : ""}>${p[1]}</option>`).join("")}</select></label>
        <label title="Rápida: GPT Image 2.5 Flare, cerca de 30 segundos por arte. Máxima: GPT Image 2.5 Sunburst, cerca de 1 minuto, mais detalhe e texto pequeno legível." style="display:flex;align-items:center;gap:7px;font-size:12px;color:${CINZA}">Qualidade
          <select data-dz-qualidade style="padding:7px 10px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF">${[["medium", "Rápida (~30s)"], ["high", "Máxima (~1 min)"]].map(q => `<option value="${q[0]}" ${(s.qualidade || cat.qualidadePadrao || "medium") === q[0] ? "selected" : ""}>${q[1]}</option>`).join("")}</select></label>
      </div></div>`;
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 32px;border-bottom:1px solid #ECECEF;background:#FFFFFF">
      <span data-dz-voltar-cat style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:${CINZA};cursor:pointer">${icon(ICONS.arrowLeft, 14, "currentColor")}Ferramentas</span>
      <div style="margin-left:12px;padding-left:12px;border-left:1px solid #ECECEF;display:flex;align-items:center;gap:10px"><span style="width:30px;height:30px;border-radius:9px;background:rgba(103,61,230,0.10);display:flex;align-items:center;justify-content:center">${icon(P.brilho, 15, ROXO)}</span><span style="${HEAD};font-size:15px;font-weight:700">Agente de Design</span></div>
      <div style="display:flex;gap:4px;margin-left:14px;background:#F4F4F6;padding:3px;border-radius:10px">${[["criar", "Criar post"], ["criacoes", "Criações"], ["estilos", "Estilos"], ["marcas", "Brand Kit"]].map(a => `<span data-dz-aba="${a[0]}" style="padding:6px 13px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;${s.aba === a[0] ? "background:#FFFFFF;box-shadow:0 1px 3px rgba(23,23,26,0.12);color:#17171A" : "color:" + CINZA}">${a[1]}</span>`).join("")}</div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:${CINZA}">Marca
          <select data-dz-marca style="padding:7px 10px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF;max-width:190px">${(s.marcas || []).map(m => `<option value="${e(m.id)}" ${m.id === s.marcaId ? "selected" : ""}>${e(m.nome)}${m.completo ? "" : " (incompleta)"}</option>`).join("")}</select></label><span data-dz-editar-marca title="Abrir o Brand Kit desta marca: cores, logo, tom e estilo" style="display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border-radius:9px;font-size:12px;font-weight:700;color:${ROXO};background:rgba(103,61,230,0.08);cursor:pointer;white-space:nowrap">${icon(ICONS.edit, 12, ROXO)}Editar marca</span>
        <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:${CINZA}">Motor
          <select data-dz-provider style="padding:7px 10px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF">${provs.map(p => `<option value="${p[0]}" ${s.provider === p[0] ? "selected" : ""}>${p[1]}</option>`).join("")}</select></label>
        <label title="Rápida: GPT Image 2.5 Flare, cerca de 30 segundos por arte. Máxima: GPT Image 2.5 Sunburst, cerca de 1 minuto, mais detalhe e texto pequeno legível." style="display:flex;align-items:center;gap:7px;font-size:12px;color:${CINZA}">Qualidade
          <select data-dz-qualidade style="padding:7px 10px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF">${[["medium", "Rápida (~30s)"], ["high", "Máxima (~1 min)"]].map(q => `<option value="${q[0]}" ${(s.qualidade || cat.qualidadePadrao || "medium") === q[0] ? "selected" : ""}>${q[1]}</option>`).join("")}</select></label>
      </div></div>`;
  }
  function stepper(){
    const s = Z(), ordem = ["formato", "modo", "criar"], at = ordem.indexOf(s.passo);
    return `<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:22px 0 26px;font-size:12.5px">${[["formato", "Formato"], ["modo", "Modo"], ["criar", "Criar"]].map((p, i) => `${i ? `<span style="width:56px;height:1px;background:#DADADF"></span>` : ""}<span ${i < at ? `data-dz-passo="${p[0]}"` : ""} style="display:flex;align-items:center;gap:7px;${i < at ? "cursor:pointer" : ""};color:${i === at ? "#17171A" : i < at ? "#3C3C44" : "#9A9AA3"};font-weight:${i === at ? 700 : 500}"><span style="width:7px;height:7px;border-radius:50%;background:${i === at ? "#17171A" : i < at ? "#9A9AA3" : "#DADADF"}"></span>${p[1]}</span>`).join("")}</div>`;
  }
  function titulo(t, sub){ return `<div style="text-align:center;margin-bottom:22px"><h1 style="${HEAD};font-size:26px;font-weight:700;margin:0 0 8px">${t}</h1><p style="margin:0 auto;color:${CINZA};font-size:13.5px;max-width:460px;line-height:1.55">${sub}</p></div>`; }

  // ─── Formato ────────────────────────────────────────────────────────────────
  function passoFormato(){
    const s = Z(), cat = s.cat;
    const tabs = [["todas", "Todas"]].concat(Object.entries(cat.plataformas));
    const lista = cat.formatos.filter(f => s.plat === "todas" || f.plat === s.plat);
    const chip = (id, nome, on, breve) => `<span ${breve ? "" : `data-dz-plat="${id}"`} style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:20px;font-size:12.5px;font-weight:600;cursor:${breve ? "default" : "pointer"};${on ? (id === "todas" ? "background:#17171A;color:#FFFFFF" : `background:${GRAD[id]};color:#FFFFFF`) : "background:#F1F1F3;color:" + (breve ? "#B4B4BC" : "#3C3C44")}">${icon(P[id], 13, "currentColor")}${nome}${breve ? ` <span style="font-size:9.5px;font-weight:700;color:#66666F">Em breve</span>` : ""}</span>`;
    const card = (f, i) => { const on = s.formato === f.id, alto = f.h / f.w;
      const bg = f.plat === "instagram" ? (i % 2 ? GRAD_ALT[i % 3] : GRAD.instagram) : GRAD[f.plat];
      const tw = alto > 1.5 ? 26 : alto > 1.1 ? 32 : alto < 0.7 ? 46 : 34, th = Math.round(tw * alto);
      return `<div data-dz-formato="${f.id}" style="position:relative;height:150px;border-radius:18px;background:${bg};padding:12px;cursor:pointer;color:#FFFFFF;box-shadow:${on ? "0 0 0 3px #FFFFFF,0 0 0 5px " + AZUL : "0 6px 16px rgba(23,23,26,0.10)"};transition:transform .15s" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        <div style="display:flex;align-items:center">${icon(P[f.plat], 15, "#FFFFFF")}${f.top ? `<span style="margin-left:auto;font-size:9px;font-weight:800;background:rgba(255,255,255,0.9);color:#C2378F;padding:2px 7px;border-radius:10px">⚡ TOP</span>` : ""}</div>
        <div style="position:absolute;right:12px;top:32px;opacity:.85">${icon(f.carrossel ? P.camadas : '<rect x="6" y="3" width="12" height="18" rx="2"/>', 12, "#FFFFFF")}</div>
        <div style="position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);width:${tw}px;height:${th}px;border:1.5px solid rgba(255,255,255,0.7);border-radius:8px;background:rgba(255,255,255,0.18)"></div>
        <div style="position:absolute;left:12px;bottom:11px"><div style="font-size:12.5px;font-weight:700">${e(f.nome)}</div><div style="font-size:10.5px;opacity:.85">${f.w} × ${f.h}px</div></div>
        ${on ? `<span style="position:absolute;right:10px;bottom:10px;width:22px;height:22px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center">${icon(ICONS.check, 12, AZUL)}</span>` : ""}</div>`; };
    return `${titulo("Escolha o Formato da Imagem", "Escolha o formato da arte que será criada do zero pela IA com a identidade da sua marca.")}
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:24px">${tabs.map(t => chip(t[0], t[1], s.plat === t[0])).join("")}${EM_BREVE.map(t => chip(t[0], t[1], false, true)).join("")}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:16px;max-width:980px;margin:0 auto">${lista.map(card).join("")}</div>
      ${rodape(false, "Continuar", !!s.formato, "data-dz-ir-modo")}`;
  }
  function rodape(voltar, rot, ok, attr, icone){
    return `<div style="display:flex;align-items:center;max-width:980px;margin:30px auto 0">
      ${voltar ? `<span data-dz-passo="${voltar}" style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:${AZUL};cursor:pointer;font-weight:600">${icon(ICONS.arrowLeft, 14, "currentColor")}Voltar</span>` : ""}
      <span ${attr} style="${BTN};margin-left:auto;${ok ? "" : "opacity:.45;pointer-events:none"}">${rot}${icon(icone || ICONS.arrowRight, 14, "currentColor")}</span></div>`;
  }

  // ─── Modo ───────────────────────────────────────────────────────────────────
  function passoModo(){
    const s = Z(), cat = s.cat, f = fmt();
    const obj = (id, nome, sub, ic) => { const on = s.objetivo === id;
      return `<div data-dz-obj="${id}" style="${CARD};padding:18px;cursor:pointer;${on ? "border-color:#9DB4F0;box-shadow:0 0 0 1px #9DB4F0" : ""}"><span style="width:34px;height:34px;border-radius:50%;background:#F4F4F6;display:flex;align-items:center;justify-content:center;margin-bottom:14px">${icon(ic, 16, "#3C3C44")}</span><div style="font-size:14px;font-weight:700;margin-bottom:3px">${nome}</div><div style="font-size:12.5px;color:${CINZA}">${sub}</div></div>`; };
    const abs = cat.abordagens, vis = s.verMais ? abs : abs.slice(0, 3);
    const abCard = a => { const on = s.abordagem === a.id;
      return `<div data-dz-ab="${a.id}" style="position:relative;${CARD};padding:12px 8px;text-align:center;cursor:pointer;${on ? "background:#E6ECFB;border-color:#9DB4F0" : ""}"><div style="font-size:17px">${a.emoji}</div><div style="font-size:12px;font-weight:600;margin-top:3px;color:${on ? "#2B4DB0" : "#17171A"}">${e(a.nome)}</div>${on ? `<span style="position:absolute;top:-7px;right:-7px;width:18px;height:18px;border-radius:50%;background:${AZUL};display:flex;align-items:center;justify-content:center">${icon(ICONS.check, 10, "#FFFFFF")}</span>` : ""}</div>`; };
    const sel = abs.find(a => a.id === s.abordagem);
    const regrasF = f ? [`Aproveitar a ${f.h > f.w ? "altura extra" : f.h === f.w ? "área quadrada" : "largura"} para criar hierarquia visual`, "Título ou hook no terço superior do design", "Conteúdo principal centralizado com respiro visual", "CTA posicionado no terço inferior"] : [];
    const modo = (id, nome, sub, ic) => { const on = s.modo === id;
      return `<div data-dz-modo="${id}" style="${CARD};padding:18px;cursor:pointer;${on ? "border-color:#9DB4F0;box-shadow:0 0 0 1px #9DB4F0" : ""}"><span style="width:34px;height:34px;border-radius:50%;background:#F4F4F6;display:flex;align-items:center;justify-content:center;margin-bottom:16px">${icon(ic, 16, "#3C3C44")}</span><div style="font-size:14.5px;font-weight:700;margin-bottom:3px">${nome}</div><div style="font-size:12.5px;color:${CINZA}">${sub}</div></div>`; };
    let entrada = "";
    if(s.modo === "zero" || s.modo === "inspiracao") entrada = `<div style="margin-top:14px"><div style="font-size:12.5px;font-weight:600;margin-bottom:7px">${s.modo === "inspiracao" ? "Tema escolhido (pode editar)" : "Descreva sua ideia"}</div><textarea id="dz-ideia" data-dz-campo="ideia" rows="3" placeholder="Ex: Saúde mental: como criar boas relações" style="${IN};resize:vertical;line-height:1.5">${e(s.ideia)}</textarea></div>`;
    if(s.modo === "link") entrada = `<div style="margin-top:14px"><div style="font-size:12.5px;font-weight:600;margin-bottom:7px">Cole o link</div><div style="display:flex;gap:8px"><input id="dz-link" data-dz-campo="link" value="${e(s.link)}" placeholder="https://..." style="${IN}"><span data-dz-ler-link style="${BTN_SEC};white-space:nowrap">${s.busy === "link" ? "Lendo..." : "Ler link"}</span></div>
      ${s.fonte ? `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:#F4F4F6;font-size:12px;color:#3C3C44"><strong>${e(s.fonteTitulo || "Conteúdo lido")}</strong><div style="margin-top:4px;color:${CINZA};display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${e(s.fonte.slice(0, 400))}</div></div>` : ""}
      <div style="font-size:12.5px;font-weight:600;margin:12px 0 7px">Orientação extra (opcional)</div><textarea id="dz-ideia" data-dz-campo="ideia" rows="2" placeholder="Ex: foque na parte de preços" style="${IN};resize:vertical">${e(s.ideia)}</textarea></div>`;
    const pronto = s.objetivo && s.modo && ((s.modo === "link" && s.fonte) || (s.modo !== "link" && s.ideia.trim()));
    return `${titulo("Defina o Conteúdo da Imagem", "Esse conteúdo será expandido em um prompt visual para gerar a arte completa com IA.")}
      <div style="max-width:980px;margin:0 auto">
        <div style="font-size:12.5px;color:${CINZA};margin-bottom:9px">Qual o objetivo deste post?</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${obj("engajar", "Engajar", "Aumentar interação e comunidade", P.coracao)}${obj("vender", "Vender", "Converter seguidores em clientes", P.dolar)}</div>
        ${s.objetivo ? `<div style="margin-top:14px"><div style="font-size:11.5px;color:${CINZA}">Abordagem <span style="color:#9A9AA3">(opcional)</span></div><div style="font-size:11px;color:#9A9AA3;margin-bottom:8px">Define a estratégia do conteúdo interno das artes (textos, layout, tom)</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${vis.map(abCard).join("")}${s.verMais ? "" : `<div data-dz-vermais style="${CARD};padding:12px 8px;text-align:center;cursor:pointer"><div style="font-size:15px;color:${CINZA}">···</div><div style="font-size:12px;color:${CINZA};margin-top:3px">Ver mais</div></div>`}</div>
          ${sel ? `<div style="margin-top:12px;padding:14px 16px;border-radius:12px;background:#EEF2FB;border:1px solid #D5DEF5;position:relative"><div style="font-size:13px;font-weight:700;margin-bottom:8px">${sel.emoji} ${e(sel.nome)}</div><span data-dz-ab="${sel.id}" style="position:absolute;top:12px;right:14px;cursor:pointer">${icon(ICONS.x, 12, CINZA)}</span>
            ${sel.regras.concat(regrasF).map(r => `<div style="display:flex;gap:8px;font-size:12px;color:#4A4A52;line-height:1.5;margin-bottom:3px"><span style="width:4px;height:4px;border-radius:50%;background:#7A8BB8;margin-top:7px;flex:0 0 4px"></span>${e(r)}</div>`).join("")}</div>` : ""}</div>` : ""}
        ${f && f.carrossel ? `<div style="margin-top:18px;display:flex;align-items:center;gap:12px;font-size:12.5px"><span style="color:${CINZA}">Quantos slides?</span><select data-dz-slides style="padding:7px 10px;border:1px solid #DADADF;border-radius:9px;font:inherit">${[2, 3, 4, 5, 6, 7, 8, 10].map(n => `<option ${s.slides === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>` : ""}
        <div style="font-size:12.5px;color:${CINZA};margin:20px 0 9px">Como você quer criar?</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">${modo("zero", "Criar do Zero", "Descreva sua ideia e deixe a IA criar todo o conteúdo", P.brilho)}${modo("link", "A partir de Link", "Cole um link e a IA extrai e adapta o conteúdo", P.link)}${modo("inspiracao", "Inspirações", "Escolha um tema pronto da biblioteca", P.lampada)}</div>
        ${entrada}
      </div>
      ${rodape("formato", s.busy === "prompt" ? "Montando prompt..." : "Gerar prompt", pronto && s.busy !== "prompt", "data-dz-gerar-prompt", P.brilho)}
      ${s.insp ? modalInsp() : ""}`;
  }
  function modalInsp(){
    const s = Z(), q = s.insp, tabs = ["Todas", "Datas", "Oportunidades", "Trends"];
    const lista = (q.lista || []).filter(x => q.tab === "Todas" || x.tipo === q.tab);
    const COR = { Datas: "#C2378F", Oportunidades: VERDE, Trends: "#C9771B" };
    return `<div data-dz-insp-bg style="position:fixed;inset:0;background:rgba(23,23,26,0.45);z-index:900;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="background:#FFFFFF;border-radius:20px;width:100%;max-width:760px;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,0.25)">
        <div style="background:linear-gradient(135deg,#F59E0B,#EA7A1A);padding:18px 20px 14px;color:#FFFFFF;position:relative">
          <div style="display:flex;align-items:center;gap:10px"><span style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center">${icon(P.lampada, 16, "#FFFFFF")}</span><div><div style="${HEAD};font-size:16px;font-weight:700">Biblioteca de Inspirações</div><div style="font-size:12px;opacity:.9">Escolha um tema pronto para criar seu post</div></div></div>
          <span data-dz-insp-x style="position:absolute;top:16px;right:16px;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.x, 12, "#FFFFFF")}</span>
          <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap">${tabs.map(t => `<span data-dz-insp-tab="${t}" style="padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;cursor:pointer;${q.tab === t ? "background:#FFFFFF;color:#C2410C" : "background:rgba(255,255,255,0.22);color:#FFFFFF"}">${t}</span>`).join("")}<span data-dz-insp-mais style="margin-left:auto;padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;cursor:pointer;background:rgba(255,255,255,0.22)">${icon(P.refazer, 11, "currentColor")} Outras ideias</span></div></div>
        <div style="padding:16px;overflow:auto;flex:1">${q.loading ? `<div style="padding:50px;text-align:center;color:${CINZA};font-size:13px">A IA está buscando temas para ${e((marca() || {}).nome || "a marca")}... (uns 20 segundos)</div>`
          : q.erro ? `<div style="padding:30px;color:${VERM};font-size:13px">${e(q.erro)}</div>`
          : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">${lista.map((x, i) => `<div style="${CARD};padding:14px;display:flex;flex-direction:column;gap:8px">
              <span style="align-self:flex-start;font-size:10.5px;font-weight:700;color:${COR[x.tipo] || CINZA};border:1px solid #ECECEF;padding:2px 8px;border-radius:10px">● ${e(x.tipo)}</span>
              <div style="font-size:13.5px;font-weight:700;line-height:1.35">${e(x.titulo)}</div>
              <div style="font-size:12px;color:${CINZA};line-height:1.45">${e(x.resumo)}</div>
              <div style="font-size:11.5px;color:#4A4A52;background:#F7F7F8;border-radius:9px;padding:8px 10px;line-height:1.45">${icon(P.brilho, 11, CINZA)} ${e(x.sugestao)}</div>
              <span data-dz-insp-usar="${(q.lista || []).indexOf(x)}" style="${BTN};border-radius:10px;padding:9px;font-size:12.5px;margin-top:auto">Usar sugestão</span></div>`).join("")}</div>`}</div>
        <div style="padding:10px 16px;border-top:1px solid #ECECEF;font-size:12px;color:${CINZA}">${(q.lista || []).length} inspirações disponíveis</div></div></div>`;
  }

  // ─── Criar (prompt) ─────────────────────────────────────────────────────────
  function passoCriar(){
    const s = Z(), f = fmt(), m = marca(), cat = s.cat;
    const ab = cat.abordagens.find(a => a.id === s.abordagem);
    const resumo = (rot, tit, sub, ic) => `<div style="${CARD};background:#F7F7F8;border-color:#F1F1F3;padding:12px 14px;display:flex;gap:11px;align-items:center;min-width:0"><span style="width:34px;height:34px;border-radius:9px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;flex:0 0 34px">${icon(ic, 15, "#3C3C44")}</span><div style="min-width:0"><div style="font-size:9.5px;letter-spacing:0.1em;font-weight:700;color:#9A9AA3">${rot}</div><div style="font-size:13px;font-weight:700">${e(tit)}</div><div style="font-size:11.5px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(sub)}</div></div></div>`;
    const nSlides = f.carrossel ? (s.prompt.match(/^#{1,3}\s*slide\s*\d+/gim) || []).length || s.slides : 1;
    const gerando = s.busy === "prompt";
    return `${titulo("Sua Ideia", "Vamos transformar sua ideia em conteúdo profissional")}
      <div style="max-width:980px;margin:0 auto">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
          ${resumo("FORMATO", f.nome, cat.plataformas[f.plat] + " · " + f.w + " × " + f.h + "px", P[f.plat])}
          ${resumo("MODO", cat.modos[s.modo] ? { zero: "Criar do Zero", link: "A partir de Link", inspiracao: "Inspiração" }[s.modo] : "", ab ? "Abordagem " + ab.nome : "Criação livre", s.modo === "link" ? P.link : s.modo === "inspiracao" ? P.lampada : P.brilho)}
          ${resumo("OBJETIVO", s.objetivo === "vender" ? "Vender" : "Engajar", cat.objetivos[s.objetivo] || "", s.objetivo === "vender" ? P.dolar : P.coracao)}
        </div>
        <div style="text-align:center;margin:14px 0"><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#3C3C44;background:#F1F1F3;padding:5px 12px;border-radius:14px">${icon(P.camadas, 12, "currentColor")}${nSlides} slide${nSlides > 1 ? "s" : ""} · ${e(m ? m.nome : "")}</span></div>
        <div style="${CARD};padding:18px;display:flex;gap:14px;align-items:flex-start">
          <span style="width:52px;height:52px;border-radius:12px;background:#F4F4F6;display:flex;align-items:center;justify-content:center;flex:0 0 52px">${icon(P.brilho, 20, "#3C3C44")}</span>
          <div style="flex:1;min-width:0"><span style="font-size:11px;color:${CINZA};background:#F1F1F3;padding:2px 8px;border-radius:6px">Ideia original</span><div style="font-size:13.5px;margin-top:8px;line-height:1.5">${e(s.modo === "link" ? (s.fonteTitulo || s.link) + (s.ideia ? " · " + s.ideia : "") : s.ideia)}</div></div>
          <span data-dz-passo="modo" style="font-size:12.5px;color:#3C3C44;cursor:pointer;display:flex;align-items:center;gap:6px;align-self:flex-end">${icon(ICONS.edit, 13, "currentColor")}Editar</span></div>
        <div style="text-align:center;font-size:12px;color:${CINZA};margin:14px 0">→ Prompt melhorado</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600">${icon(P.brilho, 14, ROXO)}Prompt adaptado para ${e(m ? m.nome : "a marca")}</span>
          <span data-dz-refinar style="${BTN_SEC};margin-left:auto;${gerando ? "opacity:.5;pointer-events:none" : ""}">${icon(P.varinha, 13, "currentColor")}Refinar com IA</span></div>
        ${s.refinar ? `<div style="display:flex;gap:8px;margin-bottom:8px"><input id="dz-refinar" placeholder="O que ajustar? Ex: mais provocativo, trocar a foto por ilustração" style="${IN}"><span data-dz-refinar-go style="${BTN};border-radius:10px;padding:9px 16px">Refinar</span></div>` : ""}
        <div style="${CARD};padding:4px">
          <textarea id="dz-prompt" data-dz-campo="prompt" rows="16" ${gerando ? "disabled" : ""} style="width:100%;border:0;outline:none;resize:vertical;padding:14px;font:inherit;font-size:13px;line-height:1.6;color:#17171A;box-sizing:border-box;background:transparent;${gerando ? "opacity:.5" : ""}">${e(gerando ? "Montando o prompt com a identidade da marca..." : s.prompt)}</textarea>
          ${s.anexos.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;padding:6px 14px 10px">${s.anexos.map((a, i) => `<div style="display:flex;flex-direction:column;gap:4px;width:110px"><span style="position:relative;width:110px;height:110px;border-radius:10px;overflow:hidden;border:1px solid #ECECEF"><img src="${a.url}" style="width:100%;height:100%;object-fit:cover"><span data-dz-anexo-rm="${i}" style="position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(23,23,26,0.7);display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.x, 10, "#FFFFFF")}</span></span><input data-dz-anexo-nota="${i}" value="${e(a.nota)}" placeholder="O que é? (produto...)" style="${IN};padding:6px 8px;font-size:11.5px"></div>`).join("")}</div>` : ""}
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 14px;border-top:1px solid #F1F1F3;font-size:12.5px;color:#3C3C44">
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer;${s.anexos.length >= 4 ? "opacity:.4;pointer-events:none" : ""}">${icon(P.img, 14, "currentColor")}${s.busy === "anexo" ? "Enviando..." : "Adicionar imagem"}<input data-dz-anexo type="file" accept="image/png,image/jpeg,image/webp" multiple style="display:none"></label>
            <span style="width:1px;height:16px;background:#E6E6EA"></span>
            ${toggle("logo", s.logo && !!(m && m.logo), "Enviar logo", !(m && m.logo))}
            ${toggle("refs", s.refs && !!(m && m.refs.length), "Usar referências da marca", !(m && m.refs.length))}
          </div></div>
        <div style="font-size:11.5px;color:#9A9AA3;margin-top:8px">${icon(P.lampada, 11, "currentColor")} Edite o prompt para ajustar o tom, adicionar detalhes ou mudar o foco${f.carrossel ? '. Cada "## Slide N" vira uma arte do carrossel' : ""}.</div>
        <details style="margin-top:16px" ${s.legenda ? "" : ""}><summary style="cursor:pointer;font-size:13px;font-weight:600">Legenda do post</summary><textarea id="dz-legenda" data-dz-campo="legenda" rows="5" style="${IN};margin-top:8px;resize:vertical;line-height:1.5">${e(s.legenda)}</textarea></details>
      </div>
      ${rodape("modo", "Criar arte", !!s.prompt.trim() && !gerando && s.busy !== "criar", "data-dz-criar", P.brilho)}`;
  }
  function toggle(id, on, rot, off){
    return `<span ${off ? `title="A marca não tem ${id === "logo" ? "logo" : "referências"} no Brand Kit"` : `data-dz-tog="${id}"`} style="display:flex;align-items:center;gap:8px;cursor:${off ? "not-allowed" : "pointer"};${off ? "opacity:.45" : ""}"><span style="width:34px;height:19px;border-radius:12px;background:${on ? "#22C55E" : "#DADADF"};position:relative"><span style="position:absolute;top:2px;left:${on ? 17 : 2}px;width:15px;height:15px;border-radius:50%;background:#FFFFFF;box-shadow:0 1px 2px rgba(0,0,0,0.2)"></span></span>${rot}</span>`;
  }

  // ─── Seleção de área (arrastar sobre a arte + comentar o que mudar só ali) ────
  // s.area = { x, y, w, h } em frações da arte, slide = lâmina; o texto fica em s.areaTxt (sobrevive ao repaint)
  function areaCaixa(ok, sel){
    const a = Z().area; if(!ok || !a || a.slide !== sel) return "";
    const pc = v => (v * 100).toFixed(2) + "%";
    return `<div style="position:absolute;left:${pc(a.x)};top:${pc(a.y)};width:${pc(a.w)};height:${pc(a.h)};border:2px solid #FFFFFF;outline:2px solid ${ROXO};border-radius:4px;box-shadow:0 0 0 9999px rgba(23,23,26,0.35);pointer-events:none"></div>`;
  }
  function areaPopover(ok, sel){
    const s = Z(), a = s.area; if(!ok || !a || a.slide !== sel) return "";
    const direita = a.x + a.w <= 0.62;
    const pos = direita ? `left:calc(${(a.x + a.w) * 100}% + 12px);top:${a.y * 100}%` : `left:${Math.max(0, a.x * 100)}%;top:calc(${(a.y + a.h) * 100}% + 12px)`;
    return `<div style="position:absolute;${pos};z-index:5;width:270px;padding:10px;border-radius:14px;background:#FFFFFF;box-shadow:0 14px 36px rgba(23,23,26,0.22);border:1px solid #ECECEF">
      <div style="font-size:11.5px;font-weight:700;color:#3C3C44;margin-bottom:6px">O que mudar nesta área?</div>
      <textarea id="dz-area-in" data-dz-campo="areaTxt" rows="3" placeholder="Ex: troque por um homem e uma mulher se abraçando" style="${IN};resize:none;font-size:12.5px">${e(s.areaTxt || "")}</textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
        <span data-dz-area-cancel style="padding:7px 12px;border-radius:9px;font-size:12px;color:${CINZA};cursor:pointer">Cancelar</span>
        <span data-dz-area-ok style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:9px;background:${AZUL};color:#FFFFFF;font-size:12px;font-weight:700;cursor:pointer">${icon(P.varinha, 12, "#FFFFFF")}Editar</span>
      </div></div>`;
  }
  async function ajustarArea(){
    const s = Z(), c = s.cria, a = s.area; if(!c || !a) return;
    const pedido = String(s.areaTxt || "").trim(); if(!pedido){ const i = document.getElementById("dz-area-in"); if(i) i.focus(); return; }
    try {
      s.cria = await dz("/criacoes/" + c.id + "/ajustar", "POST", { pedido, slide: a.slide, area: { x: a.x, y: a.y, w: a.w, h: a.h }, provider: s.provider, qualidade: s.qualidade || undefined });
      s.area = null; s.areaTxt = "";
      vigiar();
    } catch(err){ s.msg = [err.message, true]; }
    paint(); rolarChat();
  }
  // Arrastar sobre a arte: desenha o retângulo na hora; ao soltar, guarda em s.area e abre a caixa do pedido
  function areaArrastar(ev, tela){
    if(ev.button !== undefined && ev.button !== 0) return;
    const s = Z(), r = tela.getBoundingClientRect(); if(!r.width) return;
    ev.preventDefault();
    const p0 = { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    const caixa = document.createElement("div");
    caixa.style.cssText = "position:absolute;border:2px dashed #FFFFFF;outline:2px solid " + ROXO + ";border-radius:4px;background:rgba(103,61,230,0.12);pointer-events:none";
    tela.appendChild(caixa);
    let atual = null;
    const lim = v => Math.min(1, Math.max(0, v));
    const mover = e2 => {
      const p = { x: lim((e2.clientX - r.left) / r.width), y: lim((e2.clientY - r.top) / r.height) };
      atual = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
      Object.assign(caixa.style, { left: atual.x * 100 + "%", top: atual.y * 100 + "%", width: atual.w * 100 + "%", height: atual.h * 100 + "%" });
    };
    const soltar = () => {
      document.removeEventListener("pointermove", mover); document.removeEventListener("pointerup", soltar); document.removeEventListener("pointercancel", soltar);
      caixa.remove();
      if(!atual || atual.w < 0.03 || atual.h < 0.03) return; // clique sem arrastar: ignora
      s.area = Object.assign(atual, { slide: Math.min(s.slideSel, Math.max(0, ((s.cria.versoes[s.cria.versoes.length - 1] || {}).urls || []).length - 1)) });
      paint();
      const i = document.getElementById("dz-area-in"); if(i) i.focus();
    };
    document.addEventListener("pointermove", mover); document.addEventListener("pointerup", soltar); document.addEventListener("pointercancel", soltar);
  }

  // Custo de IA de uma criação, separado por versão. HTML do Claude não custa (assinatura).
  function custoCriacao(c){
    const s = Z(), g = s.gastos, gc = g && g.porCriacao && g.porCriacao[c.id];
    const chave = c.id + ":" + c.versoes.length + ":" + c.status;
    if(s.gastosChave !== chave && c.status !== "gerando"){ s.gastosChave = chave; carregarGastos(); }
    const porVer = c.versoes.map(() => ({ n: 0, usd: 0, est: false }));
    if(gc) (gc.itens || []).forEach(([em, usd, est]) => { let i = c.versoes.findIndex(x => (x.em || 0) + 15000 >= em); if(i < 0) i = c.versoes.length - 1; if(porVer[i]){ porVer[i].n++; porVer[i].usd += usd; porVer[i].est = porVer[i].est || !!est; } });
    return { total: gc ? { n: gc.n, usd: gc.usd } : null, porVer, brl: (g && g.cotacao) || 5.5, pronto: !!(g && !g.erro) };
  }
  const usdTxt = (v, brl) => `US$ ${v.toFixed(3).replace(".", ",")} (R$ ${(v * brl).toFixed(2).replace(".", ",")})`;

  // ─── Editor ─────────────────────────────────────────────────────────────────
  function editor(){
    const s = Z(), c = s.cria; if(!c) return "";
    const cu = custoCriacao(c);
    const f = c.formato, vi = s.verIdx !== null && s.verIdx !== undefined && s.verIdx < c.versoes.length ? s.verIdx : c.versoes.length - 1, v = c.versoes[vi], ger = c.status === "gerando";
    const urls = v ? v.urls : [], sel = Math.min(s.slideSel, Math.max(0, urls.length - 1));
    const ratio = f.w / f.h, W = ratio >= 1 ? 560 : Math.round(560 * ratio * 1.05);
    // Seleção de área: só na versão atual, sem geração em andamento
    const selecionavel = urls.length && !ger && vi === c.versoes.length - 1;
    const tela = urls.length
      ? `<div style="position:relative;width:${W}px;max-width:100%">${areaPopover(selecionavel, sel)}<div ${selecionavel ? 'data-dz-tela title="Arraste para selecionar uma área e pedir uma mudança só nela"' : ""} style="position:relative;width:100%;aspect-ratio:${f.w}/${f.h};border-radius:6px;overflow:hidden;box-shadow:0 18px 44px rgba(23,23,26,0.18);background:#FFFFFF;${selecionavel ? "cursor:crosshair;touch-action:none;user-select:none" : ""}"><img src="${e(urls[sel])}" draggable="false" style="width:100%;height:100%;object-fit:cover;display:block">${areaCaixa(selecionavel, sel)}${ger ? `<div style="position:absolute;inset:0;background:rgba(255,255,255,0.65);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600">${e(c.etapa || "Gerando...")}</div>` : ""}</div></div>`
      : `<div style="width:${W}px;max-width:100%;aspect-ratio:${f.w}/${f.h};border-radius:10px;background:linear-gradient(110deg,#F1F1F3 30%,#FAFAFB 50%,#F1F1F3 70%);background-size:200% 100%;animation:dzsh 1.4s linear infinite;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:${CINZA};font-size:13px">${ger ? `${icon(P.brilho, 22, ROXO)}<strong style="color:#17171A">${e(c.etapa || "Criando a arte")}</strong><span>${(s.qualidade || (s.cat && s.cat.qualidadePadrao)) === "high" ? "Qualidade máxima: cerca de 1 minuto por arte" : "Cerca de 30 segundos por arte"}</span>` : `<span style="color:${VERM};padding:20px;text-align:center">${e(c.erro || "Sem imagem")}</span>`}</div>`;
    const msgs = [];
    c.versoes.forEach(x => {
      if(x.pedido) msgs.push(["eu", (x.area ? "Área selecionada: " : "") + x.pedido + (x.slide !== null && urls.length > 1 ? ` (slide ${x.slide + 1})` : "")]);
      const mot = x.modelo || (x.provider === "gemini" ? "Nano Banana" : "GPT Image");
      const pv = cu.porVer[c.versoes.indexOf(x)], gasto = !cu.pronto ? "" : pv && pv.n ? ` Custo de IA: ${usdTxt(pv.usd, cu.brl)}${pv.n > 1 ? " em " + pv.n + " imagens" : ""}${pv.est ? ", estimado" : ""}.` : x.provider === "claude" ? " Sem custo de IA (HTML do Claude)." : "";
      msgs.push(["ia", (x.v === 1 ? `Pronto! Criei sua arte${x.imagens.length > 1 ? " com " + x.imagens.length + " slides" : ""} com ${mot}. Posso ajustar o que quiser: é só pedir aqui.` : `Versão ${x.v} pronta (${mot}).`) + gasto]);
      if(x.aviso) msgs.push(["aviso", "Usei o motor reserva. " + x.aviso + "."]);
    });
    if(ger) msgs.push(["ia", (c.etapa || "Gerando") + "..."]);
    if(c.erro) msgs.push(["erro", c.erro]);
    return `<div style="display:flex;min-height:calc(100vh - 60px);background:#F4F4F6">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;gap:10px;padding:12px 20px;background:#FFFFFF;border-bottom:1px solid #ECECEF;flex-wrap:wrap">
          <span data-dz-novo style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:${CINZA};cursor:pointer">${icon(ICONS.arrowLeft, 14, "currentColor")}Novo post</span>
          <span style="font-size:12.5px;color:#3C3C44;margin-left:8px"><strong>${e(c.marca)}</strong> · ${e((s.cat.plataformas || {})[f.plat] || "")} ${e(f.nome)} · ${f.w}×${f.h}</span>
          ${(() => { if(!cu.pronto || !v) return ""; const pv = cu.porVer[vi], tot = cu.total;
            const txt = pv && pv.n ? `Esta versão: <b>${usdTxt(pv.usd, cu.brl)}</b>${pv.n > 1 ? ` · ${pv.n} imagens, US$ ${(pv.usd / pv.n).toFixed(3).replace(".", ",")} cada` : ""}${pv.est ? " ~" : ""}` : v.provider === "claude" ? "Esta versão: <b>sem custo de IA</b> (HTML)" : "Esta versão: sem custo registrado";
            return `<span title="Custo das imagens geradas com IA (Nano Banana / GPT Image). ~ = estimado pela tabela de preço." style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:9px;background:#F4F4F6;font-size:12px;color:#3C3C44">${icon(P.dolar, 12, ROXO)}${txt}${tot && c.versoes.length > 1 ? `<span style="color:${CINZA}">· criação inteira US$ ${tot.usd.toFixed(2).replace(".", ",")} em ${tot.n} img</span>` : ""}</span>`; })()}
          <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
            ${c.versoes.length > 1 ? `<select data-dz-versao style="padding:7px 10px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12px">${c.versoes.map((x, i) => `<option value="${i}" ${i === vi ? "selected" : ""}>Versão ${x.v}${i === c.versoes.length - 1 ? " (atual)" : ""}</option>`).join("")}</select>` : ""}
            <span data-dz-refazer style="${BTN_SEC};${ger ? "opacity:.45;pointer-events:none" : ""}">${icon(P.refazer, 13, "currentColor")}Refazer${urls.length > 1 ? " slide" : ""}</span>
            ${urls.length ? `<a href="${e(urls[sel])}?baixar=1" style="${BTN_SEC};text-decoration:none">${icon(ICONS.download, 13, "currentColor")}Baixar${urls.length > 1 ? " slide" : ""}</a>` : ""}
            ${urls.length ? `<a href="/api/design/zip/${e(c.id)}?v=${e(String((c.versoes[vi] || {}).v || ""))}" style="${BTN_SEC};text-decoration:none" title="Todas as artes desta versão e a legenda num .zip">${icon(ICONS.download, 13, "currentColor")}Baixar .zip</a>` : ""}
          </span></div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px;gap:16px">${tela}
          ${selecionavel && !s.area ? `<div style="display:flex;align-items:center;gap:7px;font-size:12px;color:${CINZA}">${icon(P.varinha, 13, ROXO)}Dica: arraste sobre a arte para selecionar uma área e pedir uma mudança só nela.</div>` : ""}
          ${urls.length > 1 ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${urls.map((u, i) => `<span data-dz-slide="${i}" style="width:54px;aspect-ratio:${f.w}/${f.h};border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid ${i === sel ? AZUL : "transparent"};opacity:${i === sel ? 1 : .7}"><img src="${e(u)}?mini=1" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></span>`).join("")}</div>` : ""}
        </div>
        ${c.dados.legenda ? `<div style="margin:0 20px 20px;${CARD};padding:14px 16px"><div style="display:flex;align-items:center;margin-bottom:6px"><span style="font-size:12.5px;font-weight:700">Legenda</span><span data-dz-copiar style="margin-left:auto;font-size:12px;color:${ROXO};cursor:pointer;display:flex;align-items:center;gap:5px">${icon(ICONS.copy, 12, "currentColor")}Copiar</span></div><div style="font-size:12.5px;color:#3C3C44;white-space:pre-wrap;line-height:1.5">${e(c.dados.legenda)}</div></div>` : ""}
      </div>
      <div style="width:330px;flex:0 0 330px;background:#FFFFFF;border-left:1px solid #ECECEF;display:flex;flex-direction:column;max-height:calc(100vh - 60px);position:sticky;top:0">
        <div style="padding:14px 16px;border-bottom:1px solid #ECECEF;display:flex;align-items:center;gap:10px"><span style="width:32px;height:32px;border-radius:50%;background:rgba(103,61,230,0.10);display:flex;align-items:center;justify-content:center">${icon(P.varinha, 15, ROXO)}</span><div><div style="font-size:13.5px;font-weight:700">Editor IA</div><div style="font-size:11.5px;color:${CINZA}">Peça ajustes na arte</div></div></div>
        <div id="dz-chat" style="flex:1;overflow:auto;padding:14px 14px;display:flex;flex-direction:column;gap:10px">${msgs.map(mm => `<div style="align-self:${mm[0] === "eu" ? "flex-end" : "flex-start"};max-width:88%;padding:9px 12px;border-radius:12px;font-size:12.5px;line-height:1.45;${mm[0] === "eu" ? "background:" + AZUL + ";color:#FFFFFF" : mm[0] === "erro" ? "background:rgba(192,52,28,0.07);color:" + VERM : mm[0] === "aviso" ? "background:#FDF6EC;color:#9A5B00" : "background:#F4F4F6;color:#17171A"}">${e(mm[1])}</div>`).join("")}</div>
        <div style="padding:12px;border-top:1px solid #ECECEF">
          ${urls.length > 1 ? `<div style="font-size:11.5px;color:${CINZA};margin-bottom:6px">Ajustar: <select data-dz-alvo style="font:inherit;font-size:11.5px;border:1px solid #DADADF;border-radius:6px;padding:2px 4px"><option value="">todos os slides</option>${urls.map((u, i) => `<option value="${i}" ${String(s.alvo) === String(i) ? "selected" : ""}>slide ${i + 1}</option>`).join("")}</select></div>` : ""}
          <div style="display:flex;gap:8px;align-items:flex-end"><textarea id="dz-chat-in" data-autogrow data-dz-campo="chat" rows="2" placeholder="${ger ? "Aguarde a geração terminar..." : "Ex: troque o fundo por azul, aumente o título"}" ${ger ? "disabled" : ""} style="${IN};resize:none;font-size:12.5px">${e(s.chat)}</textarea>
          <span data-dz-ajustar style="width:38px;height:38px;flex:0 0 38px;border-radius:10px;background:${AZUL};display:flex;align-items:center;justify-content:center;cursor:pointer;${ger ? "opacity:.4;pointer-events:none" : ""}">${icon(P.enviar, 15, "#FFFFFF")}</span></div></div>
      </div></div>`;
  }


  // ─── Gasto com IA de imagem (Nano Banana / GPT Image); HTML do Claude não custa (assinatura) ──────────
  function gastosHTML(){
    const s = Z(), g = s.gastos;
    if(!g || g.erro || !g.total) return "";
    const brl = g.cotacao || 5.5, fx = (v) => v.toFixed(2).replace(".", ","), fx3 = (v) => v.toFixed(3).replace(".", ",");
    const media = (x) => x.n ? (x.usd || 0) / x.n : 0;
    const val = (usd) => `<b style="font-size:17px;color:#17171A">US$ ${fx(usd)}</b><span style="font-size:11.5px;color:${CINZA};margin-left:5px">R$ ${fx(usd * brl)}</span>`;
    const box = (t, x) => `<div style="flex:1;min-width:150px;padding:12px 14px;border:1px solid #ECECEF;border-radius:12px;background:#FFFFFF"><div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${CINZA};margin-bottom:5px">${t}</div>${val(x.usd)}<div style="font-size:11.5px;color:${CINZA};margin-top:2px">${x.n} ${x.n === 1 ? "imagem" : "imagens"}${x.n ? ` · média US$ ${fx3(media(x))} por imagem` : ""}</div></div>`;
    const nomeMod = { "gemini-3-pro-image": "Nano Banana Pro (Google)", "gpt-image-2.5-flare": "GPT Image 2.5 Flare", "gpt-image-2.5-sunburst": "GPT Image 2.5 Sunburst", "gpt-image-2": "GPT Image 2" };
    const nomeOri = { design: "Agente de Design", ilustra: "Zeus: ilustração (híbrido)", "editar-imagem": "Zeus: edição de foto", historico: "Antes do registro (estimado)" };
    const linhas = (l, nome, porImg) => l.map(x => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #F1F1F3;font-size:12.5px"><span>${e(nome(x))}${porImg && x.n ? `<span style="display:block;font-size:11px;color:${CINZA}">US$ ${fx3(media(x))} por imagem (R$ ${fx(media(x) * brl)})</span>` : ""}</span><span style="white-space:nowrap"><b>US$ ${fx(x.usd || 0)}</b> <span style="color:${CINZA}">· ${x.n}</span></span></div>`).join("");
    // imagem por imagem (últimas 60): quando, modelo, de onde veio, custo; clicar abre a criação se ela estiver no Estúdio
    const quando = (ms) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
    const temCria = (id) => id && (s.criacoes || []).some(c => c.id === id);
    const deOnde = (x) => (nomeOri[x.origem] || x.origem) + (x.operacao === "editar" ? " · edição" : "") + (x.origem === "design" && x.detalhe ? " · " + x.detalhe : x.origem !== "historico" && x.detalhe ? " · " + String(x.detalhe).split("/").pop() : "");
    const porImagem = (g.ultimos || []).map(x => `<div ${temCria(x.criacao_id) ? `data-dz-abrir="${e(x.criacao_id)}" title="Abrir a criação"` : ""} style="display:grid;grid-template-columns:92px 1fr auto;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid #F1F1F3;font-size:12.5px;${temCria(x.criacao_id) ? "cursor:pointer" : ""}">
        <span style="color:${CINZA};white-space:nowrap">${e(quando(x.em))}</span>
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e(nomeMod[x.modelo] || x.modelo || x.motor)} <span style="color:${CINZA}">· ${e(deOnde(x))}</span></span>
        <span style="white-space:nowrap;text-align:right"><b>US$ ${fx3(x.custo_usd || 0)}</b> <span style="color:${CINZA}">R$ ${fx((x.custo_usd || 0) * brl)}</span>${x.estimado ? `<span title="Estimado pela tabela de preço" style="color:${CINZA}"> ~</span>` : ""}</span></div>`).join("");
    const det = s.gastosAberto ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:12px;padding:14px;border:1px solid #ECECEF;border-radius:12px;background:#FFFFFF">
        <div><div style="font-size:12px;font-weight:700;margin-bottom:4px">Por modelo</div>${linhas(g.porModelo, x => nomeMod[x.modelo] || x.modelo || x.motor, true)}</div>
        <div><div style="font-size:12px;font-weight:700;margin-bottom:4px">Por origem</div>${linhas(g.porOrigem, x => nomeOri[x.origem] || x.origem, true)}</div>
        <div><div style="font-size:12px;font-weight:700;margin-bottom:4px">Por mês</div>${linhas(g.porMes, x => x.mes.split("-").reverse().join("/"))}</div>
      </div>
      ${porImagem ? `<div style="margin-top:12px;padding:14px;border:1px solid #ECECEF;border-radius:12px;background:#FFFFFF"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px"><span style="font-size:12px;font-weight:700">Imagem por imagem</span><span style="font-size:11.5px;color:${CINZA}">últimas ${(g.ultimos || []).length}, hora de Brasília · ~ = estimado</span></div><div style="max-height:340px;overflow:auto">${porImagem}</div></div>` : ""}
      <div style="font-size:11.5px;color:${CINZA};margin-top:8px;line-height:1.5">Google: custo exato pelos tokens que a API devolve. OpenAI e o que veio antes do registro: estimado pela tabela de preço (US$ ${fx(g.estimadoUsd || 0)} do total). Arte em HTML do Claude não entra: é da assinatura. Dólar a R$ ${fx(brl)} (${e(g.cotacaoFonte || "")}).</div>` : "";
    return `<div style="max-width:1100px;margin:22px auto 0;padding:0 24px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="${HEAD};font-size:14px;font-weight:700">Gasto com IA de imagem</span><span data-dz-gastos style="margin-left:auto;font-size:12px;font-weight:700;color:${ROXO};cursor:pointer">${s.gastosAberto ? "Fechar detalhes" : "Ver detalhes"}</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${box("Total", g.total)}${box("Este mês", g.mes)}${box("Hoje", g.hoje)}</div>${det}</div>`;
  }

  // Selo de custo dentro do card: quanto a IA de imagem custou nesta criação (soma das imagens), ou "sem custo" se é só HTML
  function custoCard(c, v){
    const s = Z(), g = s.gastos; if(!g || g.erro || !v) return "";
    const gc = g.porCriacao && g.porCriacao[c.id], brl = g.cotacao || 5.5, f2 = (x) => x.toFixed(2).replace(".", ",");
    const chip = (bg, cor, html, dica) => `<div title="${e(dica)}" style="display:inline-flex;align-items:center;gap:5px;max-width:100%;margin-top:6px;padding:3px 8px;border-radius:7px;background:${bg};font-size:11.5px;color:${cor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${icon(P.dolar, 11, cor)}${html}</div>`;
    if(gc) return chip("rgba(103,61,230,0.08)", "#17171A", `<b>US$ ${f2(gc.usd || 0)}</b><span style="color:${CINZA}">R$ ${f2((gc.usd || 0) * brl)} · ${gc.n} img</span>`, `${gc.n} ${gc.n === 1 ? "imagem gerada" : "imagens geradas ou editadas"} com IA nesta criação`);
    if(c.versoes.every(x => x.provider === "claude")) return chip("#F4F4F6", CINZA, "Sem custo novo (HTML)", "Arte montada em HTML pelo Claude, sem gerar imagem nova. Se usa foto feita por IA, o custo dela já aparece no card onde ela foi gerada.");
    return "";
  }

  // ─── Estilos salvos da marca (até 7; cada um com várias referências, receita, artes aprovadas e correções) ──
  // Backend: /api/design/estilos (estilos.js). O Zeus e o Agente de Design usam o mesmo acervo pelo tools/estilo.
  async function carregarEstilos(){
    const s = Z(), m = marca(); if(!m){ s.estilos = { estilos: [], max: 7 }; paint(); return; }
    try { s.estilos = await api("/api/design/estilos", "?marca=" + encodeURIComponent(m.id)); } catch(err){ s.estilos = { estilos: [], max: 7, erro: err.message }; }
    paint();
  }
  async function enviarEstilo(url, campos, arquivos){
    const fd = new FormData(); Object.entries(campos).forEach(([k, v]) => fd.append(k, v)); [...(arquivos || [])].forEach(f => fd.append("files", f));
    const r = await fetch(url, { method: "POST", body: fd }); const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || "HTTP " + r.status); return j;
  }
  function usarEstilo(nome){
    const m = marca(), texto = `Quero uma arte no estilo "${nome}"${m ? " da marca " + m.nome : ""}: `;
    const a = state.agentDetail;
    if(state.screen === "agente" && a && a.id === "agente-design" && typeof agPanelApply === "function"){ _agPanelTab[a.id] = "chat"; agPanelApply(a); }
    else setState({ screen: "agente", agentId: "agente-design" });
    let n = 0; const por = () => { const i = document.querySelector("[data-ac-input]"); if(i){ i.value = texto; i.focus(); i.setSelectionRange(texto.length, texto.length); if(window.autoGrow) window.autoGrow(i); } else if(n++ < 20) setTimeout(por, 150); }; setTimeout(por, 150);
  }
  // Galeria de imagens que já estão no servidor: prints anexados no chat e artes já criadas. Abre por cima do
  // formulário sem redesenhar a tela (o nome e os links digitados ficam). Escolhidas vão como "escolhidas" (chaves).
  const _galSel = {}; // pref -> [{chave, mini}]
  function galSelHTML(pref){
    const l = _galSel[pref] || [];
    return l.map(x => `<span style="position:relative;display:inline-block"><img src="${e(x.mini)}" style="width:56px;height:70px;object-fit:cover;border-radius:7px;border:1px solid #E6E6EA;display:block"><span data-dz-est-desel="${e(pref)}|${e(x.chave)}" title="Tirar" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#17171A;color:#FFF;font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer">×</span></span>`).join("")
      + (l.length ? `<span style="align-self:center;font-size:12px;color:${CINZA}">${l.length} escolhida(s)</span>` : "");
  }
  function galSelPintar(pref){ const el = document.getElementById(pref + "-sel"); if(el) el.innerHTML = galSelHTML(pref); }
  async function galeriaAbrir(pref){
    const MAX = 25, sel = new Map((_galSel[pref] || []).map(x => [x.chave, x]));
    const mAtual = (marca() || {}).id || "";
    let tipo = "chat", lista = [], busca = "", soMarca = true, mostrar = 240;
    const cache = {};
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(17,17,20,0.55);display:flex;align-items:center;justify-content:center;padding:24px";
    document.body.appendChild(ov);
    const fechar = () => ov.remove();
    const dia = (ms) => new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    const filtrada = () => { const b = busca.trim().toLowerCase();
      return lista.filter(x => (tipo !== "artes" || !soMarca || !mAtual || x.marcaId === mAtual) && (!b || (x.nome + " " + (x.conversa || "") + " " + (x.marca || "") + " " + dia(x.em)).toLowerCase().includes(b))); };
    const rodape = () => { const r = ov.querySelector("[data-g-rodape]"); if(r) r.innerHTML = `<span style="font-size:12.5px;color:${CINZA}">${sel.size} de até ${MAX} escolhida(s)</span><span data-g-x style="margin-left:auto;${BTN_SEC}">Cancelar</span><span data-g-ok style="${BTN};padding:9px 18px;${sel.size ? "" : "opacity:.45;pointer-events:none"}">Usar ${sel.size || ""} escolhida(s)</span>`; };
    const marcar = (el, on) => { el.style.borderColor = on ? ROXO : "transparent"; const c = el.querySelector("[data-g-check]"); if(c){ c.style.background = on ? ROXO : "rgba(0,0,0,0.35)"; c.textContent = on ? "✓" : ""; } };
    const grade = (carregando) => {
      if(carregando) return `<div style="color:${CINZA};font-size:13px">Carregando...</div>`;
      const l = filtrada(); if(!l.length) return `<div style="color:${CINZA};font-size:13px">Nada encontrado${busca ? " para essa busca" : ""}.</div>`;
      const grupos = []; let atual = null;
      // artes: um bloco por dia (a maioria das criações tem 1 imagem; bloco por criação ficava comprido demais), título embaixo da miniatura
      const porDia = {}; l.forEach(x => { const d = dia(x.em); porDia[d] = (porDia[d] || 0) + 1; });
      l.slice(0, mostrar).forEach(x => { const g = tipo === "artes" ? dia(x.em) : (x.conversa || "") + dia(x.em); if(!atual || atual.k !== g){ atual = { k: g, t: tipo === "artes" ? `${dia(x.em)} · ${porDia[dia(x.em)]} arte(s)` : `${x.conversa || "Conversa"} · ${dia(x.em)}`, itens: [] }; grupos.push(atual); } atual.itens.push(x); });
      return grupos.map(g => `<div style="font-size:12px;font-weight:700;color:#3C3C44;margin:12px 0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(g.t)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px">${g.itens.map(x => { const on = sel.has(x.chave); return `<div data-g-item="${e(x.chave)}" title="${e(x.nome)}" style="position:relative;cursor:pointer;border-radius:9px;overflow:hidden;border:2px solid ${on ? ROXO : "transparent"};background:#F4F4F6"><img src="${e(x.mini)}" loading="lazy" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block">${tipo === "artes" ? `<div style="padding:4px 6px;font-size:10.5px;line-height:1.3;color:#3C3C44;background:#FFFFFF;height:28px;overflow:hidden">${e(x.nome)}${soMarca ? "" : `<span style="color:${CINZA}"> · ${e(x.marca)}</span>`}</div>` : ""}<span data-g-check style="position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;border:2px solid #FFF;background:${on ? ROXO : "rgba(0,0,0,0.35)"};color:#FFF;font-size:13px;display:flex;align-items:center;justify-content:center">${on ? "✓" : ""}</span></div>`; }).join("")}</div>`).join("")
        + (l.length > mostrar ? `<div style="text-align:center;margin:16px 0 4px"><span data-g-mais style="${BTN_SEC}">Mostrar mais (${l.length - mostrar} restantes)</span></div>` : "");
    };
    const pintarGrade = (carregando) => { const g = ov.querySelector("[data-g-grade]"); if(g) g.innerHTML = grade(carregando); };
    const desenhar = (carregando) => {
      ov.innerHTML = `<div style="width:min(1020px,100%);max-height:90vh;background:#FFFFFF;border-radius:16px;display:flex;flex-direction:column;overflow:hidden">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid #ECECEF"><span style="${HEAD};font-size:16px;font-weight:600">Escolher referências</span>
          <span style="display:flex;gap:4px;background:#F4F4F6;padding:3px;border-radius:9px">${[["chat", "Prints enviados no chat"], ["artes", "Artes já criadas"]].map(t => `<span data-g-tipo="${t[0]}" style="padding:6px 12px;border-radius:7px;font-size:12.5px;cursor:pointer;${tipo === t[0] ? "background:#FFFFFF;font-weight:700;box-shadow:0 1px 2px rgba(0,0,0,0.08)" : "color:" + CINZA}">${t[1]}</span>`).join("")}</span>
          <input data-g-busca value="${e(busca)}" placeholder="${tipo === "artes" ? "Buscar por título, marca ou data (ex: 06/10)" : "Buscar por conversa ou data"}" style="flex:1;min-width:200px;padding:8px 11px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;outline:none">
          ${tipo === "artes" && mAtual ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:${CINZA};cursor:pointer"><input data-g-somarca type="checkbox" ${soMarca ? "checked" : ""}>Só ${e((marca() || {}).nome || "esta marca")}</label>` : ""}
          <span data-g-x style="cursor:pointer;font-size:20px;color:${CINZA}">×</span></div>
        <div data-g-grade style="flex:1;overflow:auto;padding:6px 18px 14px">${grade(carregando)}</div>
        <div data-g-rodape style="display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid #ECECEF"></div></div>`;
      rodape();
    };
    const carregar = async () => {
      if(cache[tipo]){ lista = cache[tipo]; desenhar(false); return; }
      desenhar(true);
      try { lista = cache[tipo] = (await api("/api/design/estilos/imagens", "?tipo=" + tipo)).imagens || []; } catch(err){ lista = []; }
      pintarGrade(false);
    };
    let tBusca = null;
    ov.addEventListener("input", ev => { if(ev.target.matches("[data-g-busca]")){ busca = ev.target.value; mostrar = 240; clearTimeout(tBusca); tBusca = setTimeout(() => pintarGrade(false), 200); } });
    ov.addEventListener("change", ev => { if(ev.target.matches("[data-g-somarca]")){ soMarca = ev.target.checked; mostrar = 240; pintarGrade(false); } });
    ov.addEventListener("click", ev => {
      const q = sel_ => ev.target.closest(sel_); let el;
      if(ev.target === ov || q("[data-g-x]")) return fechar();
      if((el = q("[data-g-tipo]"))){ if(el.dataset.gTipo !== tipo){ tipo = el.dataset.gTipo; busca = ""; mostrar = 240; carregar(); } return; }
      if(q("[data-g-mais]")){ mostrar += 240; pintarGrade(false); return; }
      if((el = q("[data-g-item]"))){ const k = el.dataset.gItem, x = lista.find(y => y.chave === k);
        if(sel.has(k)){ sel.delete(k); marcar(el, false); } else if(sel.size < MAX && x){ sel.set(k, { chave: k, mini: x.mini }); marcar(el, true); }
        rodape(); return; }
      if(q("[data-g-ok]")){ _galSel[pref] = [...sel.values()]; galSelPintar(pref); fechar(); }
    });
    carregar();
  }

  function estilosHTML(){
    const s = Z(), m = marca(), d = s.estilos;
    const caixa = (x) => `<div style="max-width:1100px;margin:22px auto 60px;padding:0 24px">${x}</div>`;
    if(!m) return caixa(`<div style="color:${CINZA};font-size:13px">Escolha uma marca no topo.</div>`);
    if(!d){ if(!s._estPedido){ s._estPedido = true; setTimeout(() => carregarEstilos().finally(() => { s._estPedido = false; }), 0); } return caixa(`<div style="color:${CINZA};font-size:13px">Carregando estilos...</div>`); }
    const busy = s.estBusy ? `<div style="margin:10px 0;padding:10px 13px;border-radius:10px;background:#F4F4F6;font-size:12.5px;color:#3C3C44">${e(s.estBusy)}</div>` : "";
    const erro = d.erro || s.estErro ? `<div style="margin:10px 0;padding:10px 13px;border-radius:10px;font-size:12.5px;background:rgba(192,52,28,0.07);color:${VERM}">${e(s.estErro || d.erro)}</div>` : "";
    const lista = d.estilos || [], cheio = lista.length >= (d.max || 7);
    const camposRefs = (pref) => `<div style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span data-dz-est-galeria="${pref}" style="${BTN_SEC};border-color:${ROXO};color:${ROXO}">${icon(P.galeria, 13, "currentColor")}Escolher prints que já mandei</span><span style="font-size:12px;color:${CINZA}">prints das conversas ou artes já criadas</span></div>
      <div id="${pref}-sel" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${galSelHTML(pref)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
        <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:${CINZA}">Ou envie prints novos<input id="${pref}-files" type="file" accept="image/*" multiple style="font-size:12px"></label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:${CINZA}">Links de posts do Instagram (um por linha)<textarea id="${pref}-links" rows="2" placeholder="https://www.instagram.com/p/..." style="${IN};font-size:12.5px;resize:vertical"></textarea></label></div>`;
    // Página de um estilo
    const ab = s.estAberto && lista.find(x => x.slug === s.estAberto);
    if(ab){
      return caixa(`<span data-dz-est-voltar style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:${CINZA};cursor:pointer">${icon(ICONS.arrowLeft, 14, "currentColor")}Estilos de ${e(m.nome)}</span>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 4px"><span style="${HEAD};font-size:22px;font-weight:600">${e(ab.nome)}</span>
          <span style="font-size:12px;color:${CINZA}">${ab.referencias.length} referência(s) · ${ab.exemplos.length} arte(s) aprovada(s) · usado ${ab.usos}x${ab.ultimoUso ? " · último " + e(ab.ultimoUso) : ""}</span>
          <span style="margin-left:auto;display:flex;gap:8px"><span data-dz-est-usar="${e(ab.nome)}" style="${BTN};padding:9px 18px">Usar este estilo</span><span data-dz-est-renomear="${e(ab.slug)}" style="${BTN_SEC}">Renomear</span><span data-dz-est-excluir="${e(ab.slug)}" style="${BTN_SEC};color:${VERM}">Excluir</span></span></div>
        ${busy}${erro}
        <div style="font-size:13px;font-weight:700;margin:20px 0 10px">Referências</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px">${ab.referencias.map((r, i) => `<div style="${CARD};overflow:hidden;position:relative"><a href="${e(r.url)}" target="_blank" rel="noopener"><img src="${e(r.url)}" loading="lazy" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block;background:#F4F4F6"></a>
          <div style="padding:7px 10px;font-size:11.5px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.tipo === "link" ? (r.perfil ? "@" + e(r.perfil) : "post") + " · " + r.laminas + " lâmina(s)" : "print"}</div>
          ${ab.referencias.length > 1 ? `<span data-dz-est-rmref="${i + 1}" title="Tirar esta referência" style="position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.55);color:#FFF;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px">×</span>` : ""}</div>`).join("")}</div>
        <div style="${CARD};padding:14px 16px;margin-top:12px"><div style="font-size:12.5px;font-weight:700">Adicionar referências</div>${camposRefs("dz-est-add")}<div style="margin-top:10px"><span data-dz-est-add="${e(ab.slug)}" style="${BTN_SEC}">Adicionar</span></div></div>
        <div style="font-size:13px;font-weight:700;margin:24px 0 8px">Receita <span style="font-weight:400;color:${CINZA};font-size:12px">o que o Zeus entendeu do estilo e como montar</span></div>
        <textarea id="dz-est-receita" data-autogrow rows="4" style="${IN};font-size:12.5px;line-height:1.5">${e(ab.receita || "")}</textarea>
        <div style="margin-top:8px"><span data-dz-est-receita="${e(ab.slug)}" style="${BTN_SEC}">Salvar receita</span></div>
        <div style="font-size:13px;font-weight:700;margin:24px 0 10px">Artes aprovadas nesse estilo</div>
        ${ab.exemplos.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">${ab.exemplos.map(x => `<a href="${e(x.url)}" target="_blank" rel="noopener" style="${CARD};overflow:hidden;display:block"><img src="${e(x.url)}?mini=1" loading="lazy" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block"></a>`).join("")}</div>` : `<div style="font-size:12.5px;color:${CINZA}">Nenhuma ainda. Quando você aprovar uma arte feita nesse estilo (👍 ou elogio no chat), ela aparece aqui.</div>`}
        <div style="font-size:13px;font-weight:700;margin:24px 0 8px">Correções que você fez</div>
        ${ab.correcoes.length ? ab.correcoes.map(c => `<div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid #F1F1F3"><span style="color:${CINZA}">${e(c.em)}</span> · ${e(c.texto)}</div>`).join("") : `<div style="font-size:12.5px;color:${CINZA}">Nenhuma.</div>`}`);
    }
    // Grade de estilos
    return caixa(`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px"><span style="${HEAD};font-size:18px;font-weight:600">Estilos de ${e(m.nome)}</span><span style="font-size:12.5px;color:${CINZA}">${lista.length} de ${d.max || 7}</span>
        <span style="margin-left:auto">${cheio ? `<span style="font-size:12px;color:${CINZA}">Limite de ${d.max || 7} estilos: exclua um para criar outro.</span>` : `<span data-dz-est-novo style="${BTN};padding:9px 18px">${icon(ICONS.plus, 13, "currentColor")}Novo estilo</span>`}</span></div>
      <div style="font-size:12.5px;color:${CINZA};line-height:1.55;margin-bottom:14px">Cada estilo guarda os prints e links que você usou de inspiração, o que o Zeus entendeu deles e as artes que você aprovou. No chat, é só pedir “no estilo” e o nome: não precisa mandar os prints de novo.</div>
      ${busy}${erro}
      ${s.estNovo && !cheio ? `<div style="${CARD};padding:16px 18px;margin-bottom:16px"><div style="font-size:13px;font-weight:700;margin-bottom:8px">Novo estilo</div>
        <input id="dz-est-nome" placeholder="Nome do estilo (ex: Charge fundo vermelho)" style="${IN}">${camposRefs("dz-est")}
        <div style="margin-top:12px;display:flex;gap:8px"><span data-dz-est-salvar style="${BTN};padding:9px 18px">Salvar estilo</span><span data-dz-est-cancelar style="${BTN_SEC}">Cancelar</span></div></div>` : ""}
      ${lista.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px">${lista.map(x => `<div style="${CARD};overflow:hidden">
          <div data-dz-est-abrir="${e(x.slug)}" style="cursor:pointer;background:#F4F4F6;aspect-ratio:3/1.4;overflow:hidden"><img src="${e(x.capa)}?v=${encodeURIComponent(x.atualizado || "")}" loading="lazy" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block"></div>
          <div style="padding:11px 13px"><div data-dz-est-abrir="${e(x.slug)}" style="font-size:13.5px;font-weight:700;cursor:pointer">${e(x.nome)}</div>
            <div style="font-size:11.5px;color:${CINZA};margin:3px 0 10px">${x.referencias.length} referência(s) · ${x.exemplos.length} aprovada(s) · usado ${x.usos}x</div>
            <div style="display:flex;gap:8px"><span data-dz-est-usar="${e(x.nome)}" style="${BTN_SEC};background:${ROXO};color:#FFFFFF;border-color:${ROXO}">Usar</span><span data-dz-est-abrir="${e(x.slug)}" style="${BTN_SEC}">Abrir</span></div></div></div>`).join("")}</div>`
        : (s.estNovo ? "" : `<div style="text-align:center;padding:40px 24px;border:1px dashed #DADADF;border-radius:16px;font-size:13px;color:${CINZA};line-height:1.6">Nenhum estilo salvo ainda.<br>Mande prints de referência no chat do agente: quando você aprovar a arte, ele pergunta se salva o estilo.<br>Ou crie aqui em "Novo estilo".</div>`)}`);
  }

  // ─── Criações ───────────────────────────────────────────────────────────────
  function criacoes(){
    const s = Z(), l = s.criacoes;
    if(!l) return `<div style="padding:40px;color:${CINZA};font-size:13px;text-align:center">Carregando criações...</div>`;
    if(!l.length) return `<div style="max-width:520px;margin:50px auto;text-align:center;padding:40px 24px;border:1px dashed #DADADF;border-radius:16px"><div style="${HEAD};font-size:17px;font-weight:600;margin-bottom:6px">Nenhuma criação ainda</div><p style="margin:0 0 14px;color:${CINZA};font-size:13px">Os posts que você criar aparecem aqui.</p><span data-dz-aba="criar" style="${BTN}">Criar post</span></div>`;
    return `<div style="max-width:1100px;margin:26px auto;padding:0 24px"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">${l.map(c => { const v = c.versoes[c.versoes.length - 1];
      return `<div data-dz-abrir="${e(c.id)}" style="${CARD};overflow:hidden;cursor:pointer"><div style="aspect-ratio:${c.formato.w || 4}/${c.formato.h || 5};background:#F4F4F6;display:flex;align-items:center;justify-content:center;max-height:260px;overflow:hidden">${v ? `<img src="${e(v.urls[0])}?mini=1" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">` : `<span style="font-size:12px;color:${c.status === "erro" ? VERM : CINZA}">${c.status === "gerando" ? "Gerando..." : "Falhou"}</span>`}</div>
        <div style="padding:10px 12px;display:flex;align-items:center;gap:8px"><div style="min-width:0;flex:1"><div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e((c.dados.ideia || c.dados.prompt || "").replace(/\*|#/g, "").slice(0, 60))}</div><div style="font-size:11px;color:${CINZA}">${e(c.marca)} · ${e(c.formato.nome || "")}${v && v.imagens.length > 1 ? " · " + v.imagens.length + " slides" : ""}</div>${custoCard(c, v)}</div>
        <span data-dz-excluir="${e(c.id)}" title="Excluir" style="padding:4px;cursor:pointer">${icon(ICONS.trash, 13, CINZA)}</span></div></div>`; }).join("")}</div></div>`;
  }

  function page(){
    const s = Z();
    if(!s.cat) return `${s.msg ? msgHTML() : `<div style="padding:40px;color:${CINZA};font-size:13px">Carregando o Agente de Design...</div>`}`;
    const cab = topo();
    if(!s.marcas.length) return cab + `<div style="max-width:520px;margin:60px auto;text-align:center;padding:40px 24px;border:1px dashed #DADADF;border-radius:16px"><div style="${HEAD};font-size:18px;font-weight:600;margin-bottom:6px">Cadastre uma marca primeiro</div><p style="margin:0 0 16px;color:${CINZA};font-size:13px;line-height:1.55">O Agente de Design cria os posts com a identidade da marca: cores, logo, tom de voz e estilo visual. Monte o Brand Kit em 5 passos.</p><span data-dz-brandkit style="${BTN}">Montar Brand Kit</span></div>`;
    const mot = s.cat.motores;
    const semMotor = !mot.gemini && !mot.openai ? `<div style="max-width:980px;margin:16px auto 0;padding:10px 13px;border-radius:10px;font-size:12.5px;border:1px solid rgba(201,119,27,0.4);background:#FDF6EC;color:#9A5B00">Nenhum motor de imagem configurado. Peça a um admin para gravar a chave do Nano Banana (gemini_api_key) ou do GPT Image (openai_api_key).</div>` : "";
    const m = marca();
    const inc = m && !m.completo ? `<div style="max-width:980px;margin:16px auto 0;padding:10px 13px;border-radius:10px;font-size:12.5px;border:1px solid rgba(201,119,27,0.4);background:#FDF6EC;color:#9A5B00">O Brand Kit de ${e(m.nome)} está incompleto: as artes saem melhores com ele completo. <span data-dz-brandkit style="font-weight:700;cursor:pointer;text-decoration:underline">Completar</span></div>` : "";
    if(s.aba === "criacoes") return cab + `<div style="padding-top:14px">${msgHTML()}</div>` + gastosHTML() + criacoes();
    if(s.aba === "estilos") return cab + estilosHTML();
    if(s.aba === "marcas") return cab + (typeof window.socialPage === "function" ? window.socialPage({ embed: true, marcaId: s.abrirMarca || null }) : "") + ((s.abrirMarca = null) || "");
    if(s.passo === "editor") return cab + editor();
    const corpo = s.passo === "modo" ? passoModo() : s.passo === "criar" ? passoCriar() : passoFormato();
    return cab + semMotor + inc + `<div style="padding:0 24px 60px">${stepper()}${msgHTML()}${corpo}</div>`;
  }

  // ─── Ações ──────────────────────────────────────────────────────────────────
  async function gerarPrompt(pedido){
    const s = Z();
    s.busy = "prompt"; s.msg = null; if(!pedido) s.passo = "criar"; paint();
    try {
      const j = await dz("/prompt", "POST", { marcaId: s.marcaId, formato: s.formato, slides: s.slides, objetivo: s.objetivo, abordagem: s.abordagem, modo: s.modo, ideia: s.ideia, fonte: s.modo === "link" ? (s.fonteTitulo + "\n" + s.fonte) : "", atual: pedido ? s.prompt : "", pedido: pedido || "" });
      s.prompt = j.prompt; if(j.legenda) s.legenda = j.legenda; s.refinar = false;
    } catch(err){ s.msg = [err.message, true]; if(!s.prompt) s.passo = "modo"; }
    s.busy = null; paint();
  }
  async function lerLink(){
    const s = Z(); if(!s.link.trim()) return;
    s.busy = "link"; s.msg = null; paint();
    try { const j = await dz("/link", "POST", { url: s.link.trim() }); s.fonte = j.texto; s.fonteTitulo = j.titulo; if(!s.fonte) s.msg = ["A página não tem texto legível.", true]; }
    catch(err){ s.msg = [err.message, true]; }
    s.busy = null; paint();
  }
  async function inspiracoes(){
    const s = Z();
    s.insp = { loading: true, tab: (s.insp && s.insp.tab) || "Todas", lista: [] }; paint();
    try { const j = await dz("/inspiracoes", "POST", { marcaId: s.marcaId, objetivo: s.objetivo }); s.insp.lista = j.ideias; }
    catch(err){ s.insp.erro = err.message; }
    s.insp.loading = false; paint();
  }
  async function criar(){
    const s = Z();
    s.busy = "criar"; s.msg = null; paint();
    try {
      const m = marca();
      const c = await dz("/criacoes", "POST", { marcaId: s.marcaId, formato: s.formato, objetivo: s.objetivo, abordagem: s.abordagem, modo: s.modo, ideia: s.ideia, link: s.link, prompt: s.prompt, legenda: s.legenda,
        provider: s.provider, qualidade: s.qualidade || undefined, logo: s.logo && !!(m && m.logo), usarRefs: s.refs && !!(m && m.refs.length), anexos: s.anexos.map(a => a.url), anexosNotas: s.anexos.map(a => a.nota || "") });
      s.cria = c; s.passo = "editor"; s.slideSel = 0; s.verIdx = null; s.chat = ""; s.alvo = ""; s.criacoes = null;
      vigiar();
    } catch(err){ s.msg = [err.message, true]; }
    s.busy = null; paint(); window.scrollTo(0, 0);
  }
  let _timer = null;
  function vigiar(){
    clearTimeout(_timer);
    const s = Z(); if(!s.cria || s.cria.status !== "gerando") return;
    _timer = setTimeout(async () => {
      const at = Z(); if(!at.cria || !document.getElementById("dz-root")) return;
      try { const c = await dz("/criacoes/" + at.cria.id); const antes = at.cria.versoes.length; at.cria = c; if(c.versoes.length !== antes) at.verIdx = null; if(c.versoes.length !== antes) at.slideSel = Math.min(at.slideSel, (c.versoes[c.versoes.length - 1].imagens.length || 1) - 1); } catch(_){}
      if(at.passo === "editor") { paint(); rolarChat(); }
      vigiar();
    }, 3500);
  }
  function rolarChat(){ const c = document.getElementById("dz-chat"); if(c) c.scrollTop = c.scrollHeight; }
  async function ajustar(refazer){
    const s = Z(), c = s.cria; if(!c) return;
    const pedido = s.chat.trim(); if(!refazer && !pedido) return;
    const multi = c.versoes.length && c.versoes[c.versoes.length - 1].imagens.length > 1;
    try {
      s.cria = await dz("/criacoes/" + c.id + "/ajustar", "POST", { pedido, refazer, provider: s.provider, qualidade: s.qualidade || undefined, slide: refazer ? (multi ? s.slideSel : null) : (s.alvo === "" || s.alvo === undefined ? null : s.alvo) });
      if(!refazer) s.chat = "";
      vigiar();
    } catch(err){ s.msg = [err.message, true]; }
    paint(); rolarChat();
  }
  function lerArq(file){ return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error("não consegui ler o arquivo")); r.readAsDataURL(file); }); }
  async function reduzir(url){
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("imagem inválida")); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    if(k === 1 && url.length < 2800000) return url;
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return /^data:image\/png/.test(url) && url.length < 5000000 ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.9);
  }
  async function anexar(files){
    const s = Z(); s.busy = "anexo"; paint();
    try { for(const f of Array.from(files).slice(0, 4 - s.anexos.length)) s.anexos.push({ url: await reduzir(await lerArq(f)), nota: "" }); }
    catch(err){ s.msg = [err.message, true]; }
    s.busy = null; paint();
  }
  async function carregarCriacoes(){ const s = Z(); try { s.criacoes = (await dz("/criacoes")).criacoes; } catch(err){ s.criacoes = []; s.msg = [err.message, true]; } paint(); }
  async function carregarGastos(){ const s = Z(); try { s.gastos = await api("/api/design/gastos", ""); } catch(_){ s.gastos = { erro: true }; } paint(); }
  function novo(){ const s = Z(); Object.assign(s, { passo: "formato", formato: s.formato, objetivo: null, abordagem: null, verMais: false, modo: null, ideia: "", link: "", fonte: "", fonteTitulo: "", prompt: "", legenda: "", anexos: [], cria: null, msg: null, refinar: false, chat: "", insp: null }); clearTimeout(_timer); paint(); }

  function bind(root){
    bindOnce(root, "click", async ev => {
      const s = Z(), q = sel => ev.target.closest(sel); let el;
      if((el = q("[data-dz-msg-x]"))){ aviso(null); return; }
      if((el = q("[data-dz-voltar-cat]"))){ setState({ screen: "ferramentas" }); return; }
      if((el = q("[data-dz-editar-marca]"))){ s.abrirMarca = s.marcaId || null; if(s.embed){ if(typeof window.socialPage === "function") window.socialPage({ marcaId: s.abrirMarca, embed: true }); if(abaAgente("marcas")) return; } s.aba = "marcas"; s.msg = null; paint(); return; }
      if((el = q("[data-dz-brandkit]"))){ if(s.embed && abaAgente("marcas")) return; s.aba = "marcas"; s.msg = null; paint(); return; }
      if((el = q("[data-dz-gastos]"))){ s.gastosAberto = !s.gastosAberto; paint(); return; }
      if((el = q("[data-dz-aba]"))){ if(s.embed && abaAgente(el.dataset.dzAba)) return; s.aba = el.dataset.dzAba; s.msg = null; if(s.aba === "criacoes") { s.criacoes = null; carregarCriacoes(); carregarGastos(); } if(s.aba === "estilos"){ s.estilos = null; s.estAberto = null; } paint(); return; }
      // Estilos
      const est = async (rotulo, fn) => { s.estErro = null; s.estBusy = rotulo; paint(); try { await fn(); s.estBusy = null; await carregarEstilos(); } catch(err){ s.estBusy = null; s.estErro = err.message; paint(); } };
      const mId = () => (marca() || {}).id || "";
      if((el = q("[data-dz-est-galeria]"))){ galeriaAbrir(el.dataset.dzEstGaleria); return; }
      if((el = q("[data-dz-est-desel]"))){ const [pref, chave] = el.dataset.dzEstDesel.split("|"); _galSel[pref] = (_galSel[pref] || []).filter(x => x.chave !== chave); galSelPintar(pref); return; }
      if((el = q("[data-dz-est-novo]"))){ s.estNovo = true; s.estErro = null; paint(); return; }
      if((el = q("[data-dz-est-cancelar]"))){ s.estNovo = false; paint(); return; }
      if((el = q("[data-dz-est-voltar]"))){ s.estAberto = null; s.estErro = null; paint(); return; }
      if((el = q("[data-dz-est-abrir]"))){ s.estAberto = el.dataset.dzEstAbrir; s.estErro = null; paint(); window.scrollTo(0, 0); return; }
      if((el = q("[data-dz-est-usar]"))){ usarEstilo(el.dataset.dzEstUsar); return; }
      if((el = q("[data-dz-est-salvar]"))){
        const nome = (document.getElementById("dz-est-nome") || {}).value || "", files = (document.getElementById("dz-est-files") || {}).files || [], links = (document.getElementById("dz-est-links") || {}).value || "";
        if(!nome.trim()){ s.estErro = "Dê um nome ao estilo."; paint(); return; }
        const esc = (_galSel["dz-est"] || []).map(x => x.chave);
        if(!files.length && !links.trim() && !esc.length){ s.estErro = "Escolha prints que já mandou, envie um print novo ou cole um link."; paint(); return; }
        await est(links.trim() ? "Salvando o estilo (link do Instagram leva até 1 minuto para baixar)..." : "Salvando o estilo...", async () => { await enviarEstilo("/api/design/estilos", { marca: mId(), nome, links, escolhidas: JSON.stringify(esc) }, files); s.estNovo = false; _galSel["dz-est"] = []; });
        return;
      }
      if((el = q("[data-dz-est-add]"))){
        const files = (document.getElementById("dz-est-add-files") || {}).files || [], links = (document.getElementById("dz-est-add-links") || {}).value || "";
        const esc = (_galSel["dz-est-add"] || []).map(x => x.chave);
        if(!files.length && !links.trim() && !esc.length){ s.estErro = "Escolha prints que já mandou, envie um print novo ou cole um link."; paint(); return; }
        let aviso = null;
        await est("Adicionando referências...", async () => { const j = await enviarEstilo("/api/design/estilos/" + encodeURIComponent(el.dataset.dzEstAdd) + "/refs", { marca: mId(), links, escolhidas: JSON.stringify(esc) }, files); aviso = j.aviso; _galSel["dz-est-add"] = []; });
        if(aviso){ s.estErro = aviso; paint(); } return;
      }
      if((el = q("[data-dz-est-rmref]"))){ if(!await zConfirm("Tirar esta referência do estilo?")) return; await est("Tirando a referência...", () => api("/api/design/estilos/" + encodeURIComponent(s.estAberto) + "/refs/" + el.dataset.dzEstRmref, "?marca=" + encodeURIComponent(mId()), "DELETE")); return; }
      if((el = q("[data-dz-est-receita]"))){ const t = (document.getElementById("dz-est-receita") || {}).value || ""; await est("Salvando a receita...", () => api("/api/design/estilos/" + encodeURIComponent(el.dataset.dzEstReceita), "", "PUT", { marca: mId(), receita: t })); return; }
      if((el = q("[data-dz-est-renomear]"))){ const atual = (s.estilos.estilos.find(x => x.slug === el.dataset.dzEstRenomear) || {}).nome || ""; const novo = await zPrompt("Novo nome do estilo", atual); if(!novo || !novo.trim() || novo.trim() === atual) return;
        await est("Renomeando...", async () => { const j = await api("/api/design/estilos/" + encodeURIComponent(el.dataset.dzEstRenomear), "", "PUT", { marca: mId(), nome: novo.trim() }); s.estAberto = j.slug; }); return; }
      if((el = q("[data-dz-est-excluir]"))){ if(!await zConfirm("Excluir este estilo? Os prints ficam guardados na lixeira do servidor.")) return; await est("Excluindo...", async () => { await api("/api/design/estilos/" + encodeURIComponent(el.dataset.dzEstExcluir), "?marca=" + encodeURIComponent(mId()), "DELETE"); s.estAberto = null; }); return; }
      if((el = q("[data-dz-plat]"))){ s.plat = el.dataset.dzPlat; paint(); return; }
      if((el = q("[data-dz-formato]"))){ s.formato = el.dataset.dzFormato; paint(); return; }
      if((el = q("[data-dz-ir-modo]"))){ s.passo = "modo"; s.msg = null; paint(); window.scrollTo(0, 0); return; }
      if((el = q("[data-dz-passo]"))){ s.passo = el.dataset.dzPasso; s.msg = null; paint(); window.scrollTo(0, 0); return; }
      if((el = q("[data-dz-obj]"))){ s.objetivo = el.dataset.dzObj; paint(); return; }
      if((el = q("[data-dz-ab]"))){ s.abordagem = s.abordagem === el.dataset.dzAb ? null : el.dataset.dzAb; paint(); return; }
      if((el = q("[data-dz-vermais]"))){ s.verMais = true; paint(); return; }
      if((el = q("[data-dz-modo]"))){ s.modo = el.dataset.dzModo; paint(); if(s.modo === "inspiracao" && !(s.insp && s.insp.lista && s.insp.lista.length)) inspiracoes(); else if(s.modo === "inspiracao") { s.insp = Object.assign(s.insp || {}, { aberto: true }); paint(); } return; }
      if((el = q("[data-dz-insp-x]")) || ev.target.matches("[data-dz-insp-bg]")){ s.insp = null; paint(); return; }
      if((el = q("[data-dz-insp-tab]"))){ s.insp.tab = el.dataset.dzInspTab; paint(); return; }
      if((el = q("[data-dz-insp-mais]"))){ inspiracoes(); return; }
      if((el = q("[data-dz-insp-usar]"))){ const x = s.insp.lista[parseInt(el.dataset.dzInspUsar, 10)]; if(x){ s.ideia = x.titulo + ". " + x.resumo + " " + x.sugestao; if(x.objetivo && !s.objetivo) s.objetivo = x.objetivo; if(x.abordagem) s.abordagem = x.abordagem; if(s.abordagem && !s.cat.abordagens.slice(0, 3).find(a => a.id === s.abordagem)) s.verMais = true; } s.insp = null; s.modo = "inspiracao"; paint(); return; }
      if((el = q("[data-dz-ler-link]"))){ lerLink(); return; }
      if((el = q("[data-dz-gerar-prompt]"))){ gerarPrompt(""); return; }
      if((el = q("[data-dz-refinar-go]"))){ const i = document.getElementById("dz-refinar"); gerarPrompt((i && i.value) || "melhore o prompt"); return; }
      if((el = q("[data-dz-refinar]"))){ s.refinar = !s.refinar; paint(); const i = document.getElementById("dz-refinar"); if(i) i.focus(); return; }
      if((el = q("[data-dz-tog]"))){ const k = el.dataset.dzTog; s[k] = !s[k]; paint(); return; }
      if((el = q("[data-dz-anexo-rm]"))){ s.anexos.splice(parseInt(el.dataset.dzAnexoRm, 10), 1); paint(); return; }
      if((el = q("[data-dz-criar]"))){ criar(); return; }
      if((el = q("[data-dz-novo]"))){ novo(); return; }
      if((el = q("[data-dz-slide]"))){ s.slideSel = parseInt(el.dataset.dzSlide, 10); s.area = null; paint(); return; }
      if((el = q("[data-dz-ajustar]"))){ ajustar(false); return; }
      if((el = q("[data-dz-area-ok]"))){ ajustarArea(); return; }
      if((el = q("[data-dz-area-cancel]"))){ s.area = null; s.areaTxt = ""; paint(); return; }
      if((el = q("[data-dz-refazer]"))){ if(confirm("Refazer do zero com o mesmo prompt? A versão atual continua no histórico.")) ajustar(true); return; }
      if((el = q("[data-dz-copiar]"))){ try { await navigator.clipboard.writeText(s.cria.dados.legenda); aviso("Legenda copiada."); } catch(_){ aviso("Não consegui copiar.", true); } return; }
      if((el = q("[data-dz-baixar-todos]"))){ const v = s.cria.versoes[s.cria.versoes.length - 1]; v.urls.forEach((u, i) => setTimeout(() => { const a = document.createElement("a"); a.href = u + "?baixar=1"; a.download = ""; document.body.appendChild(a); a.click(); a.remove(); }, i * 400)); return; }
      if((el = q("[data-dz-excluir]"))){ ev.stopPropagation(); if(!confirm("Excluir esta criação do Estúdio? As imagens continuam na Biblioteca e nas conversas do agente.")) return; try { await dz("/criacoes/" + el.dataset.dzExcluir, "DELETE"); s.criacoes = s.criacoes.filter(c => c.id !== el.dataset.dzExcluir); } catch(err){ s.msg = [err.message, true]; } paint(); return; }
      if((el = q("[data-dz-abrir]"))){ const c = s.criacoes.find(x => x.id === el.dataset.dzAbrir); if(c){ s.cria = c; s.aba = "criar"; s.passo = "editor"; s.slideSel = 0; s.verIdx = null; s.chat = ""; s.alvo = ""; paint(); rolarChat(); vigiar(); window.scrollTo(0, 0); } return; }
    });
    bindOnce(root, "input", ev => {
      const s = Z(), t = ev.target;
      if(t.dataset.dzCampo){ s[t.dataset.dzCampo] = t.value; if(t.dataset.dzCampo === "ideia" || t.dataset.dzCampo === "link"){ const b = root.querySelector("[data-dz-gerar-prompt]"); if(b){ const ok = s.objetivo && s.modo && ((s.modo === "link" && s.fonte) || (s.modo !== "link" && s.ideia.trim())); b.style.opacity = ok ? "" : ".45"; b.style.pointerEvents = ok ? "" : "none"; } } if(t.dataset.dzCampo === "prompt"){ const b = root.querySelector("[data-dz-criar]"); if(b){ b.style.opacity = s.prompt.trim() ? "" : ".45"; b.style.pointerEvents = s.prompt.trim() ? "" : "none"; } } return; }
      if(t.dataset.dzAnexoNota !== undefined){ const a = s.anexos[parseInt(t.dataset.dzAnexoNota, 10)]; if(a) a.nota = t.value; }
    });
    bindOnce(root, "change", ev => {
      const s = Z(), t = ev.target;
      if(t.hasAttribute("data-dz-marca")){ s.marcaId = t.value; s.insp = null; if(s.aba === "estilos"){ s.estilos = null; s.estAberto = null; } paint(); return; }
      if(t.hasAttribute("data-dz-provider")){ s.provider = t.value; return; }
      if(t.hasAttribute("data-dz-qualidade")){ s.qualidade = t.value; return; }
      if(t.hasAttribute("data-dz-slides")){ s.slides = parseInt(t.value, 10); return; }
      if(t.hasAttribute("data-dz-alvo")){ s.alvo = t.value === "" ? "" : parseInt(t.value, 10); return; }
      if(t.hasAttribute("data-dz-anexo")){ anexar(t.files || []); t.value = ""; return; }
      if(t.hasAttribute("data-dz-versao")){ s.verIdx = parseInt(t.value, 10); s.slideSel = 0; paint(); return; }
    });
    bindOnce(root, "pointerdown", ev => {
      const tela = ev.target.closest && ev.target.closest("[data-dz-tela]");
      if(tela) areaArrastar(ev, tela);
    });
    bindOnce(root, "keydown", ev => {
      if(ev.target.id === "dz-area-in" && ev.key === "Escape"){ const s = Z(); s.area = null; s.areaTxt = ""; paint(); return; }
      if(ev.target.id === "dz-area-in" && ev.key === "Enter" && !ev.shiftKey){ ev.preventDefault(); ajustarArea(); return; }
      if(ev.key !== "Enter" || ev.shiftKey) return;
      if(ev.target.id === "dz-chat-in"){ ev.preventDefault(); ajustar(false); }
      else if(ev.target.id === "dz-refinar"){ ev.preventDefault(); gerarPrompt(ev.target.value || "melhore o prompt"); }
      else if(ev.target.id === "dz-link"){ ev.preventDefault(); lerLink(); }
    });
  }

  // ─── plug na Central ────────────────────────────────────────────────────────
  if(!document.getElementById("dz-css")){ const st = document.createElement("style"); st.id = "dz-css"; st.textContent = "@keyframes dzsh{0%{background-position:200% 0}100%{background-position:-200% 0}}"; document.head.appendChild(st); }
  // opts.embed: dentro da página do Agente de Design (abas do agente no lugar da barra própria); opts.aba: criar | criacoes
  window.designPage = function(opts){
    opts = opts || {};
    const s = Z(); s.embed = !!opts.embed;
    if(opts.aba && opts.aba !== s.aba){ s.aba = opts.aba; if(s.aba === "criacoes") s.criacoes = null; if(s.aba === "estilos"){ s.estilos = null; s.estAberto = null; } }
    // Link direto pro editor: /ferramentas/agente-design?c=<id> (o agente manda no chat; o # é das rotas da Central)
    const hc = /[?&]c=([\w-]+)/.exec(location.search || "");
    if(hc){ try { history.replaceState(null, "", location.pathname); } catch(_){} abrirCriacao(hc[1]); }
    setTimeout(() => { const root = document.getElementById("dz-root"); if(!root) return; bind(root); if(!s.cat) carregar(); else { api("/api/social", "").then(j => { s.marcas = j.marcas; paint(); }).catch(() => {}); vigiar(); } if(s.aba === "criacoes" && !s.criacoes) { carregarCriacoes(); carregarGastos(); } }, 0);
    return `<div id="dz-root">${page()}</div>`;
  };
  async function abrirCriacao(id){
    const s = Z();
    try { const c = await dz("/criacoes/" + id); s.cria = c; s.aba = "criar"; s.passo = "editor"; s.slideSel = 0; s.verIdx = null; s.chat = ""; s.alvo = ""; paint(); rolarChat(); vigiar(); }
    catch(err){ s.msg = ["Não consegui abrir a criação: " + err.message, true]; paint(); }
  }
  // Dentro do agente: troca a aba da página do agente (Criar post, Criações, Brand Kit)
  function abaAgente(id){
    const a = state.agentDetail;
    if(state.screen !== "agente" || !a || !a.panel || typeof agPanelApply !== "function" || !a.panel.tabs.some(x => x.id === id)) return false;
    _agPanelTab[a.id] = id; agPanelApply(a); return true;
  }
  // Brand Kit → "Criar post com esta marca"
  window.designAbrirMarca = function(id){ const s = Z(); s.marcaId = id; s.aba = "criar"; if(s.passo === "editor") s.passo = "formato"; if(abaAgente("criar")) return; if(state.screen === "ferramenta" && state.toolId === "agente-design"){ paint(); window.scrollTo(0, 0); return; } setState({ screen: "ferramenta", toolId: "agente-design", toolView: "brief" }); };
  // Abas nativas da página do agente: encadeia com o painel que já existia (Copiloto de Growth)
  const _agNativeAntes = window.agNativePanel;
  window.agNativePanel = function(tab){
    if(tab.screen === "design") return window.designPage({ embed: true, aba: tab.view || "criar" });
    if(tab.screen === "social") return typeof window.socialPage === "function" ? window.socialPage({ embed: true }) : "";
    return typeof _agNativeAntes === "function" ? _agNativeAntes(tab) : "";
  };
  if(state.screen === "ferramenta" && state.toolId === "agente-design"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = window.designPage(); }
})();
