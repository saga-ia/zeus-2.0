// Execução Comercial › Auditoria de Vendas: chat de análise. A pessoa pergunta em português e o analista de vendas
// (vendas-ia.js, isolado, só com a ferramenta de consulta) apura nos dados de WhatsApp, leads e CRM e responde.
// Substitui o chat genérico "Execução Comercial" e a auditoria por formulário. Usa state, icon, ICONS, e, mdToHtml,
// vendasTabsHTML, zConfirm, cfgToast, setState e RENDERERS do script principal.
(function(){
  const AMBAR = "#673DE6", VERDE = "#0F7A68", CINZA = "#66666F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const TEMAS = [
    ["🔥", "Para agir hoje", "A janela de ouro é de 24 a 48h: depois disso o lead esfria.", ["Quem está esperando resposta agora e há quanto tempo?", "Quais leads das últimas 48h ainda não tiveram retorno?", "Quem pediu preço ou proposta e sumiu nos últimos 7 dias?", "Quais conversas de ontem terminaram sem próximo passo?"]],
    ["👥", "Desempenho dos vendedores", "Quem responde rápido e conduz ao próximo passo fecha mais.", ["Quem responde mais rápido e quem mais demora?", "Qual vendedor leva mais conversas até a proposta?", "Quantas conversas cada vendedor atendeu neste mês?", "Quem deixa mais clientes sem resposta?"]],
    ["📈", "Funil", "Perder antes da proposta é qualificação; perder depois é follow-up.", ["Em que ponto da conversa a gente mais perde venda?", "Quantas conversas chegam à proposta e quantas fecham?", "Quanto tempo leva do primeiro contato ao fechamento?", "Quais etapas do CRM têm mais negócios parados?"]],
    ["🗺️", "Mercado", "O que o cliente pede e não encontra é oportunidade.", ["O que os clientes mais pedem nas conversas?", "Qual produto ou serviço mais cresceu nos últimos 3 meses?", "De onde vêm os leads que mais fecham?", "Quais perguntas se repetem e poderiam virar conteúdo?"]],
    ["🎓", "Para treinar a equipe", "Caso real da nossa base ensina mais que qualquer treinamento teórico.", ["Mostre 3 conversas que viraram venda: o que o vendedor disse que funcionou?", "Mostre 3 conversas que morreram depois da proposta: o que faltou fazer?", "Qual frase do vendedor aparece logo antes de o cliente parar de responder?", "Quando o cliente diz \"vou pensar\", qual vendedor consegue retomar, e como?"]],
    ["💰", "Dinheiro", "Previsibilidade: saber hoje se a meta do mês está de pé.", ["Quanto há em propostas abertas agora?", "Qual o ticket médio dos negócios fechados neste mês?", "Se o ritmo continuar, quanto fechamos até o fim do mês?", "Quais negócios de maior valor estão parados?"]],
    ["✍️", "Para montar scripts", "O que todo cliente pergunta no começo define o roteiro.", ["Quais são as 5 perguntas mais comuns no primeiro contato?", "Quais objeções aparecem mais e como responder a cada uma?", "Monte um roteiro de primeira resposta com base nas conversas que fecharam", "Monte uma mensagem de retomada para quem disse \"vou pensar\""]],
  ];
  // Animações das sugestões: cards entram em sequência e sobem no hover; perguntas descem em cascata ao abrir o tema
  if(!document.getElementById("an-css")){ const st = document.createElement("style"); st.id = "an-css"; st.textContent = `
    @keyframes anRise{from{opacity:0;transform:translate3d(0,16px,0)}to{opacity:1;transform:none}}
    @keyframes anDrop{from{opacity:0;transform:translate3d(0,-6px,0)}to{opacity:1;transform:none}}
    @keyframes anWave{0%,100%{transform:rotate(0) scale(1)}30%{transform:rotate(-12deg) scale(1.18)}60%{transform:rotate(8deg) scale(1.1)}}
    .an-card{transition:transform .22s cubic-bezier(.2,.8,.2,1),box-shadow .22s,border-color .22s}
    .an-card.an-entra{animation:anRise .5s cubic-bezier(.2,.8,.2,1) both}
    .an-card:hover{transform:translateY(-3px);box-shadow:0 14px 32px rgba(103,61,230,0.12);border-color:rgba(103,61,230,0.4)!important}
    .an-card:hover .an-ico{animation:anWave .6s ease}
    .an-ico{display:inline-block}
    .an-q{animation:anDrop .32s cubic-bezier(.2,.8,.2,1) both;transition:transform .16s,border-color .16s,color .16s,background .16s}
    .an-q:hover{transform:translateX(4px);border-color:#673DE6!important;color:#673DE6;background:#FBFAFF!important}
    .an-titulo{animation:anRise .5s cubic-bezier(.2,.8,.2,1) both}
    #an-sug{transition:opacity .35s ease,transform .35s ease}
    #an-sug.an-sai{opacity:0;transform:translate3d(0,6px,0)}
    .an-sug-card{transition:border-color .16s,transform .16s,box-shadow .16s}
    .an-sug-card:hover{border-color:rgba(103,61,230,0.45)!important;transform:translateY(-2px);box-shadow:0 8px 20px rgba(103,61,230,0.08)}
    @media (prefers-reduced-motion: reduce){.an-card.an-entra,.an-q,.an-titulo{animation:none}.an-card:hover{transform:none}}`; document.head.appendChild(st); }
  function an(){ if(!state.analise) state.analise = { conversa: null, msgs: [], aberto: -1, job: null, hist: null, verHist: false }; return state.analise; }
  async function api(url, opts){ const r = await fetch("/api/vendas" + url, opts); const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; }
  const pintar = (rolar) => { const el = document.getElementById("an-root"); if(!el) return;
    // o que está sendo digitado no campo sobrevive à repintura (a resposta chega aos poucos e repinta a tela)
    const at = document.getElementById("an-input"), dig = at ? { v: at.value, f: document.activeElement === at, a: at.selectionStart, b: at.selectionEnd } : null;
    el.innerHTML = corpo();
    const n = document.getElementById("an-input"); if(n && dig && dig.v){ n.value = dig.v; n.style.height = "auto"; n.style.height = Math.min(160, n.scrollHeight) + "px"; } if(n && dig && dig.f){ n.focus(); try { n.setSelectionRange(dig.a, dig.b); } catch(err){} } if(rolar){ const b = document.getElementById("an-fim"); if(b) b.scrollIntoView({ block: "end" }); } };
  const md = t => typeof mdToHtml === "function" ? mdToHtml(t || "") : e(t || "").replace(/\n/g, "<br>");

  async function perguntar(texto){
    const s = an(); texto = String(texto || "").trim(); if(!texto || s.job) return;
    const m = { pergunta: texto, resposta: "", consultas: [], status: "rodando" };
    s.msgs.push(m); pintar(true);
    try {
      const j = await api("/analise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta: texto, conversa: s.conversa }) });
      s.conversa = j.conversa; s.job = j.job; s.hist = null;
      const ver = async () => {
        try {
          const st = await api("/analise/job/" + j.job);
          m.consultas = st.consultas || []; m.parcial = st.texto || ""; m.fase = st.status;
          if(st.status === "pronto"){ m.resposta = st.texto; m.status = "pronto"; s.job = null; pintar(true); return; }
          if(st.status === "erro"){ m.resposta = st.erro; m.status = "erro"; s.job = null; pintar(true); return; }
          pintar(); setTimeout(ver, 2000);
        } catch(err){ m.resposta = err.message; m.status = "erro"; s.job = null; pintar(); }
      };
      setTimeout(ver, 1500);
    } catch(err){ m.resposta = err.message; m.status = "erro"; pintar(); }
  }
  async function abrirConversa(id){
    const s = an(); if(s.job) return;
    try { const j = await api("/analise/conversa/" + encodeURIComponent(id)); Object.assign(s, { conversa: id, msgs: j.mensagens, verHist: false }); pintar(true); } catch(err){ cfgToast(err.message, true); }
  }
  async function carregarHist(){ const s = an(); try { s.hist = (await api("/analise/conversas")).conversas; } catch(err){ s.hist = []; } pintar(); }

  // Sugestões: todas as perguntas dos temas, 4 por vez, alternando sozinhas
  const POOL = TEMAS.flatMap(t => t[3].map(q => [t[0], q]));
  let _sugIdx = 0;
  const sugAtuais = () => [0, 1, 2, 3].map(k => POOL[(_sugIdx + k * 7) % POOL.length]);
  const sugHTML = () => sugAtuais().map(([ic, q]) => `<div data-an-q="${e(q)}" class="an-sug-card" style="border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;padding:13px 15px;font-size:12.5px;color:#3C3C44;line-height:1.5;cursor:pointer;text-align:left">${e(q)}</div>`).join("");
  function composer(hero){
    const s = an();
    return `<form data-an-form style="margin:0 auto;width:100%;max-width:${hero ? "660px" : "860px"}">
      <div class="home-chat" style="border:1px solid #DADADF;border-radius:16px;background:#FFFFFF;padding:14px 16px 12px;box-shadow:${hero ? "0 10px 30px rgba(23,23,26,0.07)" : "0 10px 30px rgba(23,23,26,0.08)"};text-align:left">
        <textarea id="an-input" data-autogrow data-an-input rows="${hero ? 3 : 2}" placeholder="Pergunte sobre as vendas, o atendimento ou o funil..." style="width:100%;border:0;outline:none;font-size:14px;background:transparent;font-family:inherit;padding:0 0 8px;color:#17171A;resize:none;max-height:200px;line-height:1.5"></textarea>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:11px;color:#9A9AA3">Enter envia · Shift+Enter quebra linha</span>
          <span style="flex:1"></span>
          <span data-an-mic data-hover title="Gravar áudio e transcrever" style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${CINZA}">${icon(ICONS.mic, 17, "currentColor")}</span>
          <button type="submit" title="Enviar" ${s.job ? "disabled" : ""} style="width:34px;height:34px;border-radius:50%;background:${AMBAR};display:flex;align-items:center;justify-content:center;cursor:${s.job ? "default" : "pointer"};border:0;padding:0;opacity:${s.job ? .5 : 1}">${icon(ICONS.arrowUp, 16, "#FFFFFF")}</button>
        </div>
      </div>
    </form>`;
  }
  function vazio(){
    const entra = !an()._animou; an()._animou = true;
    return `<div class="${entra ? "an-titulo" : ""}" style="width:100%;display:flex;flex-direction:column;align-items:center;text-align:center;padding:40px 10px 30px">
      <div style="font-size:12.5px;color:${CINZA};margin-bottom:8px">Auditoria de Vendas</div>
      <h2 style="${HEAD};font-size:28px;font-weight:600;margin:0 0 10px">Pergunte qualquer coisa sobre as vendas</h2>
      <p style="margin:0 auto 24px;max-width:540px;color:${CINZA};font-size:13.5px;line-height:1.6">Eu consulto na hora as conversas de WhatsApp do time, os leads e os dados do CRM, apuro os números e respondo com a leitura do que eles significam.</p>
      ${composer(true)}
      <div style="margin:26px 0 12px;font-size:12px;color:${CINZA}">O ZEUS escolhe o melhor modelo para cada pedido</div>
      <div style="width:100%;max-width:660px;margin-bottom:18px">${typeof zeusLogoMarquee === "function" ? zeusLogoMarquee() : ""}</div>
      <div id="an-sug" style="width:100%;max-width:660px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">${sugHTML()}</div>
    </div>`;
  }
  // a cada 7 s troca as 4 sugestões (pausa com o mouse em cima ou com a pessoa digitando)
  setInterval(() => {
    const g = document.getElementById("an-sug");
    if(!g || state.screen !== "motorAuditor" || document.hidden || g.matches(":hover")) return;
    const inp = document.getElementById("an-input"); if(inp && inp.value.trim()) return;
    g.classList.add("an-sai");
    setTimeout(() => { _sugIdx = (_sugIdx + 1) % POOL.length; g.innerHTML = sugHTML(); g.classList.remove("an-sai"); }, 350);
  }, 7000);
  function vazioAntigo(){
    const s = an(), entra = !s._animou; s._animou = true;
    return `<div style="max-width:720px;margin:10px auto 0;text-align:center">
      <h2 class="${entra ? "an-titulo" : ""}" style="${HEAD};font-size:24px;font-weight:600;margin:0 0 8px">Pergunte qualquer coisa sobre as vendas</h2>
      <p style="margin:0 0 24px;color:${CINZA};font-size:13.5px;line-height:1.6">Eu consulto na hora as conversas de WhatsApp do time, os leads e os dados do CRM, apuro os números e respondo com a leitura do que eles significam.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;text-align:left">${TEMAS.map((t, i) => { const on = s.aberto === i; return `<div class="an-card${entra ? " an-entra" : ""}" style="${entra ? `animation-delay:${80 + i * 70}ms;` : ""}border:1px solid ${on ? "rgba(103,61,230,0.45)" : "#E6E6EA"};border-radius:14px;background:#FFFFFF;${on ? "box-shadow:0 8px 24px rgba(103,61,230,0.08);" : ""}align-self:start">
        <div data-an-tema="${i}" style="display:flex;gap:8px;padding:14px 16px;cursor:pointer"><div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600;margin-bottom:4px"><span class="an-ico">${t[0]}</span> ${e(t[1])}</div><div style="font-size:12px;color:${CINZA};line-height:1.5">${e(t[2])}</div></div><span style="color:${on ? AMBAR : "#9A9AA3"};display:flex;margin-top:2px">${icon(on ? ICONS.chevUp : ICONS.chevDown, 13, "currentColor")}</span></div>
        ${on ? `<div style="display:flex;flex-direction:column;gap:7px;padding:0 14px 14px">${t[3].map((q, k) => `<span data-an-q="${e(q)}" class="an-q" style="animation-delay:${k * 60}ms;padding:10px 13px;border:1px solid #E6E6EA;border-radius:18px;font-size:12.5px;line-height:1.45;cursor:pointer;background:#FCFCFD">${e(q)}</span>`).join("")}</div>` : ""}
      </div>`; }).join("")}</div></div>`;
  }
  function mensagens(){
    return an().msgs.map(m => {
      const consultas = (m.consultas || []).length ? `<details style="margin-top:10px;font-size:12px;color:${CINZA}" ${m.status === "rodando" ? "open" : ""}><summary style="cursor:pointer">${m.status === "rodando" ? "Apurando" : "O que foi apurado"} (${m.consultas.length} consulta${m.consultas.length === 1 ? "" : "s"})</summary><div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${m.consultas.map(c => `<div style="display:flex;gap:7px">${icon(ICONS.check, 12, VERDE)}<span>${e(c)}</span></div>`).join("")}</div></details>` : "";
      let resp;
      if(m.status === "rodando") resp = `<div style="display:flex;align-items:center;gap:9px;font-size:13px;color:${CINZA}"><span class="tm-pulse" style="width:7px;height:7px;border-radius:50%;background:${AMBAR}"></span>${m.fase === "contexto" ? "Preparando o contexto do seu mercado..." : (m.consultas || []).length ? "Consultando os dados..." : "Entendendo a pergunta..."}</div>${m.parcial ? `<div style="margin-top:8px;font-size:13px;line-height:1.65;color:#3C3C44">${md(m.parcial)}</div>` : ""}`;
      else if(m.status === "erro") resp = `<div style="font-size:13px;color:#C0341C">${e(m.resposta)}</div>`;
      else resp = `<div class="an-md" style="font-size:13.5px;line-height:1.7;word-wrap:break-word">${md(m.resposta)}</div>`;
      return `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><div style="max-width:75%;padding:11px 15px;border-radius:14px 14px 4px 14px;background:rgba(103,61,230,0.12);border:1px solid rgba(103,61,230,0.22);font-size:13.5px;line-height:1.55;white-space:pre-wrap">${e(m.pergunta)}</div></div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:22px"><span style="width:30px;height:30px;flex:0 0 30px;border-radius:9px;background:rgba(103,61,230,0.12);display:flex;align-items:center;justify-content:center">${icon(ICONS.bolt, 14, "none", AMBAR)}</span>
          <div style="flex:1;min-width:0;padding:14px 18px;border:1px solid #E6E6EA;border-radius:4px 14px 14px 14px;background:#FFFFFF">${resp}${consultas}</div></div>`;
    }).join("") + `<div id="an-fim"></div>`;
  }
  function historico(){
    const s = an();
    if(!s.verHist) return "";
    const h = s.hist;
    return `<div style="position:absolute;right:0;top:40px;z-index:6;width:340px;max-height:420px;overflow-y:auto;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;box-shadow:0 14px 40px rgba(23,23,26,0.14);padding:6px">
      ${h === null ? `<div style="padding:12px;font-size:12.5px;color:${CINZA}">Carregando...</div>` : !h.length ? `<div style="padding:12px;font-size:12.5px;color:${CINZA}">Nenhuma conversa ainda.</div>`
        : h.map(c => `<div style="display:flex;align-items:center;gap:6px;border-radius:9px" data-hover><div data-an-abrir="${e(c.conversa)}" style="flex:1;min-width:0;padding:9px 10px;cursor:pointer"><div style="font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(c.titulo)}</div><div style="font-size:11px;color:#9A9AA3">${c.n} pergunta${c.n === 1 ? "" : "s"} · ${new Date(c.ultima).toLocaleDateString("pt-BR")}</div></div><span data-an-apagar="${e(c.conversa)}" title="Apagar" style="padding:6px;cursor:pointer;opacity:.5">${icon(ICONS.x, 12, "currentColor")}</span></div>`).join("")}
    </div>`;
  }
  function corpo(){
    const s = an(), tem = s.msgs.length > 0;
    const topo = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:${tem ? 18 : 0}px;position:relative">
        <span style="flex:1"></span>
        ${tem ? `<span data-an-nova data-hover-border style="display:flex;align-items:center;gap:7px;padding:8px 13px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;cursor:pointer;background:#FFFFFF">${icon(ICONS.plus, 13, "currentColor")}Nova conversa</span>` : ""}
        <span data-an-hist data-hover-border style="display:flex;align-items:center;gap:7px;padding:8px 13px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;cursor:pointer;background:#FFFFFF">${icon(ICONS.clock, 13, "currentColor")}Conversas</span>
        ${historico()}
      </div>`;
    if(!tem) return topo + vazio();
    return topo + `<div style="min-height:calc(100vh - 360px);padding-bottom:28px">${mensagens()}</div>
      <div style="position:sticky;bottom:0;padding:14px 0 10px;background:linear-gradient(to top,#F6F6F7 70%,rgba(246,246,247,0))">
        ${composer(false)}
        <div style="text-align:center;font-size:11px;color:#9A9AA3;margin-top:7px">As respostas vêm de consultas feitas aos dados no momento da pergunta. Confira os números antes de decisões grandes.</div>
      </div>`;
  }

  RENDERERS.motorAuditor = function(){
    return `<div>${vendasTabsHTML("motorAuditor")}<div style="padding:24px 30px 0;max-width:1180px;margin:0 auto"><div id="an-root">${corpo()}</div></div></div>`;
  };
  // o antigo chat "Execução Comercial" deu lugar à Auditoria de Vendas
  RENDERERS.motorExec = function(){ setTimeout(() => setState({ screen: "motorAuditor" }), 0); return ""; };

  document.addEventListener("click", async ev => {
    if(state.screen !== "motorAuditor") return;
    const t = ev.target, s = an(), q = sel => t.closest && t.closest(sel);
    let el;
    if((el = q("[data-an-tema]"))){ const i = +el.dataset.anTema; s.aberto = s.aberto === i ? -1 : i; pintar(); return; }
    if((el = q("[data-an-q]"))){ perguntar(el.dataset.anQ); return; }
    if((el = q("[data-an-mic]"))){ if(typeof micGravar === "function") micGravar(el, "an-input"); return; }
    if(q("[data-an-nova]")){ if(s.job) return; Object.assign(s, { conversa: null, msgs: [] }); pintar(); return; }
    if(q("[data-an-hist]")){ s.verHist = !s.verHist; if(s.verHist && s.hist === null) carregarHist(); else pintar(); return; }
    if((el = q("[data-an-abrir]"))){ abrirConversa(el.dataset.anAbrir); return; }
    if((el = q("[data-an-apagar]"))){ ev.stopPropagation(); if(!await zConfirm("Apagar esta conversa de análise?")) return; try { await api("/analise/conversa/" + encodeURIComponent(el.dataset.anApagar), { method: "DELETE" }); if(s.conversa === el.dataset.anApagar) Object.assign(s, { conversa: null, msgs: [] }); carregarHist(); } catch(err){ cfgToast(err.message, true); } return; }
    if(s.verHist && !q("[data-an-hist]")){ s.verHist = false; pintar(); }
  });
  document.addEventListener("keydown", ev => {
    if(state.screen !== "motorAuditor" || !ev.target.matches || !ev.target.matches("[data-an-input]")) return;
    if(ev.key === "Enter" && !ev.shiftKey && !ev.isComposing){ ev.preventDefault(); const v = ev.target.value; ev.target.value = ""; perguntar(v); }
  });
  document.addEventListener("input", ev => {
    if(state.screen !== "motorAuditor" || !ev.target.matches || !ev.target.matches("[data-an-input]")) return;
    ev.target.style.height = "auto"; ev.target.style.height = Math.min(160, ev.target.scrollHeight) + "px";
  });
  document.addEventListener("submit", ev => {
    if(state.screen !== "motorAuditor" || !ev.target.matches || !ev.target.matches("[data-an-form]")) return;
    ev.preventDefault(); const i = document.getElementById("an-input"); const v = i ? i.value : "";
    if(an().job){ if(v.trim() && typeof cfgToast === "function") cfgToast("Ainda estou respondendo. Seu texto fica no campo: envie quando eu terminar."); return; }
    if(i) i.value = ""; perguntar(v);
  });

  if(state.screen === "motorExec") setState({ screen: "motorAuditor" });
  else if(state.screen === "motorAuditor"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = RENDERERS.motorAuditor(); }
})();
