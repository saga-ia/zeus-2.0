// Conectores: faixa de destaque no topo com os canais (WhatsApp, Instagram e Facebook), em cartões maiores e com o
// estado real de cada um. O index chama conectoresDestaqueHTML() dentro de renderConectores e tira da grade de baixo os
// nomes listados em CONECTORES_DESTAQUE. Carregado depois do script principal: usa state, icon, ICONS, e (escape) e
// connectorLogoHTML de lá.
//   WhatsApp  -> /api/wa/zeus (Zeus bot) + /api/wa/instances (outros números) -> abre Conectores › WhatsApp
//   Instagram -> /zeuspost/api/accounts (contas conectadas)                   -> abre Instagram › Configuração › Contas
//   Facebook  -> páginas da Meta ligadas às contas                             -> abre a conexão com a Meta
(function(){
  const CINZA = "#66666F", HEAD = "font-family:'Space Grotesk',sans-serif";
  const OK = ["#0F7A68", "rgba(15,122,104,0.35)", "rgba(15,122,104,0.08)"], RUIM = ["#C0341C", "rgba(192,52,28,0.35)", "rgba(192,52,28,0.08)"], NEUTRO = ["#66666F", "#E6E6EA", "#F7F7F8"];
  window.CONECTORES_DESTAQUE = ["WhatsApp Business"]; // já aparecem aqui em cima; saem da grade geral

  function D(){ if(!state.conDestaque) state.conDestaque = { zeus: null, inst: null, contas: null, em: 0, carregando: false }; return state.conDestaque; }
  const pega = async url => { try { const r = await fetch(url, { credentials: "same-origin" }); if(!r.ok || r.redirected) return null; return await r.json(); } catch(err){ return null; } };
  async function carregar(){
    const d = D(); if(d.carregando) return; d.carregando = true;
    const [zeus, inst, contas] = await Promise.all([pega("/api/wa/zeus"), pega("/api/wa/instances"), pega("/zeuspost/api/accounts")]);
    d.zeus = zeus; d.inst = inst && inst.instances ? inst.instances : (inst ? [] : null);
    d.contas = Array.isArray(contas) ? contas : (contas && contas.accounts) || (contas ? [] : null);
    d.em = Date.now(); d.carregando = false;
    const el = document.getElementById("cd-root"); if(el && state.screen === "conectores"){ el.innerHTML = corpo(); if(typeof attach === "function") attach(); } // attach: religa o data-go dos cartões repintados
  }
  const pl = (n, um, varios) => n + " " + (n === 1 ? um : varios);

  // estado de cada canal: [selo, cores do selo, linha de status, cor do ponto]
  function estadoWa(){
    const d = D(); if(!d.em) return ["Verificando", NEUTRO, "Consultando os números...", "#B8B8C0"];
    const zeusOn = d.zeus && d.zeus.state === "ready", outros = (d.inst || []).filter(i => i.status === "open").length, n = (zeusOn ? 1 : 0) + outros;
    if(n) return ["Ativo", OK, pl(n, "número conectado", "números conectados") + (zeusOn ? " · Zeus bot no ar" : ""), "#1E8E5A"];
    if(d.zeus && d.zeus.state === "qr") return ["Sem número", RUIM, "Zeus bot aguardando a leitura do QR", "#C2342B"];
    if(d.zeus || d.inst) return ["Sem número", RUIM, "Nenhum número conectado", "#C2342B"];
    return ["Disponível", NEUTRO, "Abra para conectar um número", "#B8B8C0"];
  }
  function estadoIg(){
    const d = D(); if(!d.em) return ["Verificando", NEUTRO, "Consultando as contas...", "#B8B8C0"];
    if(!d.contas) return ["Disponível", NEUTRO, "Abra para ver as contas", "#B8B8C0"];
    const ig = d.contas.filter(a => !a.platform || a.platform === "instagram"), fora = ig.filter(a => a.status && a.status !== "active").length;
    if(!ig.length) return ["Sem conta", NEUTRO, "Nenhuma conta conectada", "#B8B8C0"];
    return ["Ativo", OK, pl(ig.length, "conta conectada", "contas conectadas") + (fora ? " · " + fora + " para reconectar" : ""), fora ? "#C2760A" : "#1E8E5A"];
  }
  function estadoFb(){
    const d = D(); if(!d.em) return ["Verificando", NEUTRO, "Consultando as páginas...", "#B8B8C0"];
    if(!d.contas) return ["Disponível", NEUTRO, "Abra para ver a conexão com a Meta", "#B8B8C0"];
    const fb = d.contas.filter(a => a.platform === "facebook"), paginas = new Set(d.contas.map(a => a.page_id).filter(Boolean)).size;
    if(fb.length) return ["Ativo", OK, pl(fb.length, "página conectada", "páginas conectadas"), "#1E8E5A"];
    if(paginas) return ["Via Instagram", OK, pl(paginas, "página ligada às contas do Instagram", "páginas ligadas às contas do Instagram"), "#1E8E5A"];
    return ["Disponível", NEUTRO, "Nenhuma página conectada", "#B8B8C0"];
  }
  const logoIg = s => `<span title="Instagram" style="width:${s}px;height:${s}px;flex:0 0 ${s}px;border-radius:${Math.round(s * 0.28)}px;display:flex;align-items:center;justify-content:center;background:linear-gradient(45deg,#F9CE34 5%,#EE2A7B 50%,#6228D7 95%)">${icon(ICONS.instagram, Math.round(s * 0.56), "#FFFFFF")}</span>`;
  const logoFb = s => `<span title="Facebook" style="width:${s}px;height:${s}px;flex:0 0 ${s}px;border-radius:${Math.round(s * 0.28)}px;display:flex;align-items:center;justify-content:center;background:#1877F2"><svg width="${Math.round(s * 0.6)}" height="${Math.round(s * 0.6)}" viewBox="0 0 24 24" fill="#FFFFFF" aria-label="Facebook"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.3c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.4H7.6V14h2.7v8z"/></svg></span>`;

  function cartao(o){
    const es = o.estado;
    return `<div ${o.attrs} data-hover-border style="border:1px solid ${o.cor}59;border-radius:16px;background:linear-gradient(180deg,${o.cor}14 0%,#FFFFFF 62%);padding:18px;display:flex;flex-direction:column;gap:12px;cursor:pointer;box-shadow:0 6px 22px rgba(23,23,26,0.06)">
      <div style="display:flex;align-items:center;gap:12px">
        ${o.logo}
        <div style="flex:1;min-width:0"><div style="${HEAD};font-size:16.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.nome}</div><div style="font-size:11.5px;color:${CINZA}">${o.tipo}</div></div>
        <span style="font-size:10.5px;font-weight:600;color:${es[1][0]};border:1px solid ${es[1][1]};background:${es[1][2]};padding:3px 9px;border-radius:20px;white-space:nowrap">${es[0]}</span>
      </div>
      <p style="margin:0;font-size:12.5px;color:${CINZA};line-height:1.5;flex:1">${o.desc}</p>
      <div style="display:flex;align-items:center;gap:10px;padding-top:12px;border-top:1px solid #E6E6EA">
        <span style="display:flex;align-items:center;gap:7px;flex:1;min-width:0;font-size:12px;color:#3C3C44"><span style="width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:${es[3]}"></span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(es[2])}</span></span>
        <span style="display:flex;align-items:center;gap:6px;padding:7px 13px;border-radius:9px;background:#673DE6;color:#FFFFFF;font-size:12px;font-weight:700;white-space:nowrap">${o.cta} ${icon(ICONS.extLink, 11, "currentColor")}</span>
      </div>
    </div>`;
  }
  function corpo(){
    const rotulo = t => `<div style="font-size:10.5px;letter-spacing:0.14em;font-weight:700;color:${CINZA};margin:0 0 10px">${t}</div>`;
    return `${rotulo("CANAIS EM DESTAQUE")}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:26px">
        ${cartao({ attrs: 'data-go="waConnector"', cor: "#25D366", logo: connectorLogoHTML({ name: "WhatsApp Business", label: "WA", bg: "#25D366" }, 48), nome: "WhatsApp Business", tipo: "Nativo ZEUS", desc: "Número do Zeus bot e outros números de WhatsApp. Lê o QR, dá nome amigável e organiza.", estado: estadoWa(), cta: "Abrir" })}
        ${cartao({ attrs: 'data-go="instagram" data-cd-abrir="contas"', cor: "#EE2A7B", logo: logoIg(48), nome: "Instagram", tipo: "Nativo ZEUS", desc: "Contas conectadas para responder o Direct com agentes de IA e publicar posts, Reels e Stories.", estado: estadoIg(), cta: "Abrir" })}
        ${cartao({ attrs: 'data-go="instagram" data-cd-abrir="conexao"', cor: "#1877F2", logo: logoFb(48), nome: "Facebook", tipo: "Meta · páginas", desc: "Páginas do Facebook e a conexão com a Meta que liga as contas do Instagram ao ZEUS.", estado: estadoFb(), cta: "Gerenciar" })}
      </div>
      ${rotulo("TODOS OS CONECTORES")}`;
  }
  // o index chama isto dentro de renderConectores
  window.conectoresDestaqueHTML = function(){
    const d = D();
    if(Date.now() - d.em > 30000 && !d.carregando) setTimeout(carregar, 0);
    return `<div id="cd-root">${corpo()}</div>`;
  };
  // Instagram e Facebook abrem a tela do Instagram direto nas contas: o aviso vai antes da troca de tela (fase de captura)
  document.addEventListener("click", ev => { if(state.screen !== "conectores") return; const el = ev.target.closest && ev.target.closest("[data-cd-abrir]"); if(el) state.igAbrir = el.dataset.cdAbrir; }, true);
})();
