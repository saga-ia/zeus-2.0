// Execução Comercial › Auditoria de Vendas: a IA audita o time (nota por vendedor e critério) e cada conversa
// (critérios, objeções, próximo passo e mensagem pronta), lendo a mesma base do Diagnóstico (vendas-ia.js).
// Carregado depois do script principal: usa state, icon, ICONS, e (escape), vendasTabsHTML, cfgToast e RENDERERS de lá.
(function(){
  const AMBAR = "#673DE6", VERDE = "#0F7A68", VERM = "#C0341C", CINZA = "#66666F", LARANJA = "#B7791F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const BOX = "border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:22px 24px;margin-bottom:16px";
  const hoje = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const br = s => String(s || "").split("-").reverse().join("/");
  const quando = ms => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
  const corNota = n => n == null ? CINZA : n >= 8 ? VERDE : n >= 6 ? LARANJA : VERM;
  function au(){
    if(!state.aud){ const h = hoje(), ini = new Date(h); ini.setDate(ini.getDate() - 29);
      state.aud = { aba: "time", de: ymd(ini), ate: ymd(h), vendedor: "", vendedores: null, time: undefined, conversas: null, filtro: "", conv: null, convRes: undefined, job: null, lista: null }; }
    return state.aud;
  }
  async function api(url, opts){ const r = await fetch("/api/vendas" + url, opts); const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; }
  const pintar = () => { const el = document.getElementById("au-root"); if(el) el.innerHTML = corpo(); };

  async function carregarBase(){
    const s = au();
    const [v, l] = await Promise.all([api("/auditoria/vendedores").catch(() => ({ vendedores: [] })), api("/auditoria/lista").catch(() => ({ auditorias: [] }))]);
    s.vendedores = v.vendedores; s.lista = l.auditorias; pintar(); carregarTime(); carregarConversas();
  }
  async function carregarTime(){ const s = au(); s.time = undefined; pintar(); try { s.time = (await api(`/auditoria?modo=time&de=${s.de}&ate=${s.ate}&vendedor=${encodeURIComponent(s.vendedor)}`)).auditoria; } catch(err){ s.time = null; } pintar(); }
  async function carregarConversas(){ const s = au(); s.conversas = null; pintar(); try { s.conversas = (await api(`/auditoria/conversas?de=${s.de}&ate=${s.ate}&vendedor=${encodeURIComponent(s.vendedor)}&filtro=${s.filtro}`)).conversas; } catch(err){ s.conversas = []; s.convErro = err.message; } pintar(); }
  async function abrirConversa(c){ const s = au(); s.conv = c; s.convRes = undefined; pintar(); try { s.convRes = (await api(`/auditoria?modo=conversa&instancia=${encodeURIComponent(c.instancia)}&jid=${encodeURIComponent(c.jid)}`)).auditoria; } catch(err){ s.convRes = null; } pintar(); }
  let _poll = null;
  async function gerar(corpoReq){
    const s = au(); if(s.job) return;
    try {
      const j = await api("/auditoria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoReq) });
      s.job = { id: j.job, modo: corpoReq.modo, status: "preparando", consultas: [], texto: "" }; pintar();
      clearTimeout(_poll);
      const ver = async () => {
        try {
          const st = await api("/auditoria/job/" + s.job.id); Object.assign(s.job, st);
          if(st.status === "pronto"){ const modo = s.job.modo; s.job = null; const r = (await api("/auditoria?chave=" + encodeURIComponent(st.chave))).auditoria; if(modo === "time") s.time = r; else { s.convRes = r; if(s.conversas) s.conversas.forEach(c => { if(s.conv && c.jid === s.conv.jid && c.instancia === s.conv.instancia) c.auditada = true; }); } s.lista = (await api("/auditoria/lista")).auditorias; pintar(); return; }
          if(st.status === "erro"){ const er = st.erro; s.job = null; pintar(); cfgToast(er, true); return; }
          pintar(); _poll = setTimeout(ver, 2500);
        } catch(err){ s.job = null; pintar(); cfgToast(err.message, true); }
      };
      _poll = setTimeout(ver, 2000);
    } catch(err){ cfgToast(err.message, true); }
  }

  const progresso = () => { const j = au().job; const fase = { preparando: "Preparando...", contexto: "Escrevendo o contexto do seu mercado a partir do Radar ZEUS...", analisando: "A IA está lendo as conversas e apurando os números..." }[j.status] || "Gerando...";
    return `<div style="padding:20px;border:1px dashed rgba(103,61,230,0.35);border-radius:14px;background:rgba(103,61,230,0.03)"><div style="display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:600;margin-bottom:8px"><span class="tm-pulse" style="width:8px;height:8px;border-radius:50%;background:${AMBAR}"></span>${fase}</div>${(j.consultas || []).map(c => `<div style="display:flex;gap:8px;font-size:12.5px;color:#3C3C44;margin-top:4px">${icon(ICONS.check, 12, VERDE)}<span>${e(c)}</span></div>`).join("")}<div style="font-size:11.5px;color:#9A9AA3;margin-top:8px">Leva de 1 a 5 minutos. O resultado fica guardado.</div></div>`; };
  const selo = n => `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:44px;padding:5px 9px;border-radius:9px;font-size:15px;font-weight:700;color:${corNota(n)};background:${corNota(n)}14;border:1px solid ${corNota(n)}40;${HEAD}">${n == null ? "-" : String(n).replace(".", ",")}</span>`;
  const criterios = cs => `<div style="display:flex;flex-direction:column;gap:8px">${cs.map(c => `<div><div style="display:flex;align-items:center;gap:10px;font-size:12.5px"><span style="flex:1;min-width:0;font-weight:600">${e(c.nome)}</span><strong style="color:${corNota(c.nota)}">${c.nota == null ? "-" : String(c.nota).replace(".", ",")}</strong></div><div style="height:5px;border-radius:5px;background:#F1F1F3;margin:4px 0"><i style="display:block;height:100%;width:${(c.nota || 0) * 10}%;background:${corNota(c.nota)};border-radius:5px"></i></div>${c.evidencia ? `<div style="font-size:11.5px;color:${CINZA};line-height:1.5">${e(c.evidencia)}</div>` : ""}</div>`).join("")}</div>`;
  const lista = (tit, itens, cor) => itens && itens.length ? `<div><div style="font-size:10.5px;letter-spacing:0.12em;font-weight:700;color:${cor};margin-bottom:6px">${tit}</div>${itens.map(i => `<div style="display:flex;gap:7px;font-size:12.5px;line-height:1.5;margin-bottom:4px"><span style="color:${cor}">•</span><span>${e(i)}</span></div>`).join("")}</div>` : "";

  function filtros(){
    const s = au();
    return `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px">
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${CINZA}">de <input data-au-de type="date" value="${s.de}" max="${s.ate}" style="padding:7px 9px;border:1px solid #DADADF;border-radius:8px;font:inherit;font-size:12.5px"></label>
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${CINZA}">até <input data-au-ate type="date" value="${s.ate}" min="${s.de}" max="${ymd(hoje())}" style="padding:7px 9px;border:1px solid #DADADF;border-radius:8px;font:inherit;font-size:12.5px"></label>
      <select data-au-vendedor class="cat-select"><option value="">Todos os vendedores</option>${(s.vendedores || []).map(v => `<option ${s.vendedor === v ? "selected" : ""}>${e(v)}</option>`).join("")}</select>
    </div>`;
  }
  function abaTime(){
    const s = au(), t = s.time, rodando = s.job && s.job.modo === "time";
    let res;
    if(rodando) res = progresso();
    else if(t === undefined) res = `<div style="padding:24px 0;text-align:center;color:${CINZA};font-size:13px">Procurando auditoria...</div>`;
    else if(!t) res = `<div style="padding:28px 0;text-align:center;color:#9A9AA3;font-size:13px;line-height:1.7">Ainda não existe auditoria do ${s.vendedor ? "vendedor " + e(s.vendedor) : "time"} de ${br(s.de)} a ${br(s.ate)}.<br>Clique em "Auditar o time": a IA dá nota por vendedor em cada critério, com evidências.</div>`;
    else { const r = t.resultado;
      res = `<div style="border:1px solid rgba(103,61,230,0.22);border-radius:14px;background:rgba(103,61,230,0.04);padding:14px 16px;margin-bottom:14px;font-size:13.5px;line-height:1.6">${e(r.resumo)}${r.padroes && r.padroes.length ? `<div style="margin-top:10px">${lista("PADRÕES DO TIME", r.padroes, AMBAR)}</div>` : ""}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">${r.vendedores.map(v => `<div style="border:1px solid #E6E6EA;border-radius:14px;padding:16px 18px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><div style="flex:1;min-width:0"><div style="${HEAD};font-size:15.5px;font-weight:600">${e(v.nome)}</div>${v.conversas ? `<div style="font-size:11.5px;color:${CINZA}">${v.conversas} conversas no período</div>` : ""}</div>${selo(v.nota)}</div>
          ${criterios(v.criterios)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">${lista("PONTOS FORTES", v.pontos_fortes, VERDE)}${lista("A MELHORAR", v.melhorar, VERM)}</div>
          ${v.treino ? `<div style="display:flex;gap:8px;margin-top:12px;padding:10px 12px;border-radius:10px;background:#F4F2FC;font-size:12.5px;line-height:1.5"><span style="display:flex;margin-top:2px">${icon(ICONS.bolt, 12, AMBAR)}</span><span><strong>Treino da semana:</strong> ${e(v.treino)}</span></div>` : ""}
        </div>`).join("")}</div>
        <div style="font-size:11.5px;color:#9A9AA3;margin-top:12px">Gerada em ${quando(t.gerado_em)}.</div>`; }
    return `${filtros()}
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;background:#F4F2FC;margin-bottom:16px">
        <div style="flex:1;min-width:220px;font-size:13.5px"><strong>${s.vendedor ? e(s.vendedor) : "Todo o time"}</strong> · ${br(s.de)} a ${br(s.ate)}<div style="font-size:12px;color:${CINZA};margin-top:2px">Nota de 0 a 10 por vendedor em velocidade, qualificação, valor, objeções, condução e retomada</div></div>
        <span data-au-gerar-time ${s.job ? "" : "data-hover-dark"} style="padding:10px 18px;border-radius:10px;background:${AMBAR};color:#FFFFFF;font-size:13px;font-weight:700;cursor:${s.job ? "default" : "pointer"};opacity:${s.job ? .6 : 1}">${rodando ? "Auditando..." : t ? "Refazer" : "Auditar o time"}</span>
      </div>${res}`;
  }
  function abaConversa(){
    const s = au(), cs = s.conversas;
    const fl = [["", "Todas"], ["aguardando", "Aguardando resposta"], ["sem_resposta", "Nunca respondidas"]];
    const listaHTML = cs === null ? `<div style="padding:20px;color:${CINZA};font-size:13px">Carregando conversas...</div>`
      : !cs.length ? `<div style="padding:20px;color:#9A9AA3;font-size:13px;line-height:1.6">${s.convErro ? e(s.convErro) : "Nenhuma conversa no período. Conecte os WhatsApps do time e marque \"Analisar\" em Conectores."}</div>`
      : cs.map(c => { const on = s.conv && s.conv.jid === c.jid && s.conv.instancia === c.instancia; return `<div data-au-conv="${e(c.instancia)}|${e(c.jid)}" ${on ? "" : "data-hover"} style="padding:10px 12px;border-radius:9px;cursor:pointer;${on ? "background:rgba(103,61,230,0.10)" : ""}"><div style="display:flex;align-items:center;gap:8px"><strong style="flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(c.nome || c.jid.split("@")[0])}</strong>${c.auditada ? `<span title="Já auditada" style="display:flex">${icon(ICONS.check, 12, VERDE)}</span>` : ""}${c.aguardando ? `<span style="font-size:10px;font-weight:700;color:${LARANJA}">AGUARDA</span>` : ""}</div><div style="font-size:11.5px;color:${CINZA}">${e(c.vendedor || c.instancia)} · ${c.total} msgs · ${e(br((c.ultima || "").split(" ")[0]))}</div></div>`; }).join("");
    let det;
    if(!s.conv) det = `<div style="padding:40px 20px;text-align:center;color:#9A9AA3;font-size:13px">Escolha uma conversa na lista para auditar.</div>`;
    else {
      const rodando = s.job && s.job.modo === "conversa", r = s.convRes && s.convRes.resultado;
      const cab = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:14px"><div style="flex:1;min-width:200px"><div style="${HEAD};font-size:16px;font-weight:600">${e(s.conv.nome || s.conv.jid.split("@")[0])}</div><div style="font-size:12px;color:${CINZA}">${e(s.conv.vendedor || s.conv.instancia)} · ${s.conv.total} mensagens${r && r.etapa ? " · etapa: " + e(r.etapa) : ""}</div></div>${r ? selo(r.nota) : ""}<span data-au-gerar-conv ${s.job ? "" : "data-hover-dark"} style="padding:9px 16px;border-radius:10px;background:${AMBAR};color:#FFFFFF;font-size:12.5px;font-weight:700;cursor:${s.job ? "default" : "pointer"};opacity:${s.job ? .6 : 1}">${rodando ? "Auditando..." : r ? "Refazer" : "Auditar conversa"}</span></div>`;
      if(rodando) det = cab + progresso();
      else if(s.convRes === undefined) det = cab + `<div style="padding:20px;color:${CINZA};font-size:13px">Procurando auditoria...</div>`;
      else if(!r) det = cab + `<div style="padding:20px;color:#9A9AA3;font-size:13px">Esta conversa ainda não foi auditada.</div>`;
      else det = cab + `<div style="font-size:13.5px;line-height:1.6;margin-bottom:14px">${e(r.resumo)}</div>
        ${criterios(r.criterios)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">${lista("ACERTOS", r.acertos, VERDE)}${lista("ERROS", r.erros, VERM)}</div>
        ${r.objecoes.length ? `<div style="margin-top:16px"><div style="font-size:10.5px;letter-spacing:0.12em;font-weight:700;color:${LARANJA};margin-bottom:8px">OBJEÇÕES</div>${r.objecoes.map(o => `<div style="border:1px solid #E6E6EA;border-radius:11px;padding:11px 13px;margin-bottom:8px;font-size:12.5px;line-height:1.55"><div><strong>Cliente:</strong> ${e(o.objecao)}</div><div style="color:${CINZA}"><strong>Como foi tratada:</strong> ${e(o.como_tratou)}</div><div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:rgba(15,122,104,0.06)"><strong style="color:${VERDE}">Melhor resposta:</strong> ${e(o.melhor_resposta)}</div></div>`).join("")}</div>` : ""}
        ${r.proximo_passo ? `<div style="margin-top:14px;display:flex;gap:8px;padding:11px 13px;border-radius:10px;background:#F4F2FC;font-size:13px;line-height:1.5"><span style="display:flex;margin-top:2px">${icon(ICONS.bolt, 13, AMBAR)}</span><span><strong>Próximo passo:</strong> ${e(r.proximo_passo)}</span></div>` : ""}
        ${r.mensagem_sugerida ? `<div style="margin-top:12px;border:1px solid rgba(15,122,104,0.3);border-radius:12px;padding:12px 14px;background:rgba(15,122,104,0.04)"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><strong style="flex:1;font-size:12px;color:${VERDE}">MENSAGEM SUGERIDA PARA O CLIENTE</strong><span data-au-copiar data-hover style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;font-size:12px;cursor:pointer">${icon(ICONS.copy, 12, "currentColor")}Copiar</span></div><div data-au-msg style="font-size:13px;line-height:1.6;white-space:pre-wrap">${e(r.mensagem_sugerida)}</div></div>` : ""}
        <div style="font-size:11.5px;color:#9A9AA3;margin-top:12px">Auditada em ${quando(s.convRes.gerado_em)}.</div>`;
    }
    return `${filtros()}
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
        <div style="flex:0 0 300px;max-width:100%;border:1px solid #E6E6EA;border-radius:14px;overflow:hidden">
          <div style="display:flex;gap:4px;padding:8px;border-bottom:1px solid #F1F1F3;flex-wrap:wrap">${fl.map(([k, r]) => `<span data-au-filtro="${k}" style="padding:5px 10px;border-radius:7px;font-size:11.5px;cursor:pointer;${s.filtro === k ? `font-weight:600;background:rgba(103,61,230,0.12);color:${AMBAR}` : "color:#3C3C44"}">${r}</span>`).join("")}</div>
          <div style="max-height:620px;overflow-y:auto;padding:6px">${listaHTML}</div></div>
        <div style="flex:1 1 420px;min-width:0;border:1px solid #E6E6EA;border-radius:14px;padding:18px 20px">${det}</div>
      </div>`;
  }
  function corpo(){
    const s = au();
    const aba = (k, rot) => `<span data-au-aba="${k}" style="padding:8px 16px;border-radius:9px;font-size:13px;cursor:pointer;${s.aba === k ? `font-weight:600;background:rgba(103,61,230,0.12);color:${AMBAR}` : "color:#3C3C44"}">${rot}</span>`;
    const hist = (s.lista || []).slice(0, 12);
    return `<div style="${BOX}">
        <div style="display:inline-flex;gap:4px;padding:4px;border:1px solid #E6E6EA;border-radius:11px;margin-bottom:18px">${aba("time", "Auditoria do time")}${aba("conversa", "Auditar uma conversa")}</div>
        ${s.aba === "time" ? abaTime() : abaConversa()}
      </div>
      ${hist.length ? `<div style="${BOX}"><strong style="${HEAD};font-size:15.5px;font-weight:600">Auditorias já feitas</strong><div style="font-size:12.5px;color:${CINZA};margin:2px 0 8px">Clique para reabrir, sem gerar de novo.</div>${hist.map(a => `<div data-au-abrir="${e(a.chave)}" data-hover style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:9px;cursor:pointer"><strong style="font-size:13px;font-weight:600">${a.modo === "time" ? "Time" : "Conversa"}</strong><span style="flex:1;min-width:0;font-size:13px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(a.rotulo)}${a.de ? " · " + br(a.de) + " a " + br(a.ate) : ""}</span><span style="font-size:11.5px;color:#9A9AA3">${quando(a.gerado_em)}</span></div>`).join("")}</div>` : ""}
      <div style="${BOX}"><div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px"><span style="width:38px;height:38px;border-radius:11px;background:rgba(103,61,230,0.12);display:flex;align-items:center;justify-content:center">${icon(ICONS.chatBubble, 18, AMBAR)}</span><div style="flex:1;min-width:220px"><div style="${HEAD};font-size:15px;font-weight:600">Auditoria manual</div><div style="font-size:12.5px;color:${CINZA}">Envie prints ou o histórico de conversas de WhatsApp, e-mail ou chat que não estão nos números conectados.</div></div><span data-agent-open="analista-atendimento" data-hover-border style="padding:9px 15px;border:1px solid #DADADF;border-radius:10px;font-size:12.5px;font-weight:600;cursor:pointer">Abrir o Analista de Atendimento</span></div></div>`;
  }

  RENDERERS.motorAuditor = function(){
    if(!au().vendedores) setTimeout(carregarBase, 0);
    return `<div>${vendasTabsHTML("motorAuditor")}
      <div style="padding:26px 30px 60px;max-width:1240px">
        <h1 style="${HEAD};font-size:24px;font-weight:600;margin:0 0 6px">Auditoria de Vendas</h1>
        <p style="margin:0 0 18px;color:${CINZA};font-size:13.5px;max-width:780px;line-height:1.55">A IA lê as conversas do time e avalia cada vendedor e cada conversa nos critérios do seu processo comercial, com evidências, objeções e o próximo passo.</p>
        <div id="au-root">${corpo()}</div>
      </div></div>`;
  };

  document.addEventListener("click", async ev => {
    if(state.screen !== "motorAuditor") return;
    const t = ev.target, s = au(), q = sel => t.closest && t.closest(sel);
    let el;
    if((el = q("[data-agent-open]")) && el.closest("#au-root")){ ev.stopPropagation(); setState({ screen: "agente", agentId: el.dataset.agentOpen, editAgentId: null }); return; }
    if((el = q("[data-au-aba]"))){ s.aba = el.dataset.auAba; pintar(); return; }
    if(q("[data-au-gerar-time]")){ gerar({ modo: "time", de: s.de, ate: s.ate, vendedor: s.vendedor }); return; }
    if(q("[data-au-gerar-conv]")){ if(s.conv) gerar({ modo: "conversa", instancia: s.conv.instancia, jid: s.conv.jid, nome: s.conv.nome }); return; }
    if((el = q("[data-au-filtro]"))){ s.filtro = el.dataset.auFiltro; carregarConversas(); return; }
    if((el = q("[data-au-conv]"))){ if(s.job) return; const [inst, ...j] = el.dataset.auConv.split("|"); const c = (s.conversas || []).find(x => x.instancia === inst && x.jid === j.join("|")); if(c) abrirConversa(c); return; }
    if(q("[data-au-copiar]")){ const m = document.querySelector("[data-au-msg]"); if(m){ try { await navigator.clipboard.writeText(m.textContent); cfgToast("Mensagem copiada"); } catch(err){ cfgToast("Não consegui copiar", true); } } return; }
    if((el = q("[data-au-abrir]"))){
      if(s.job) return;
      try { const a = (await api("/auditoria?chave=" + encodeURIComponent(el.dataset.auAbrir))).auditoria; if(!a) return;
        if(a.modo === "time"){ Object.assign(s, { aba: "time", de: a.de, ate: a.ate, vendedor: a.alvo || "", time: a }); pintar(); carregarConversas(); }
        else { const [inst, ...j] = a.alvo.split("|"); Object.assign(s, { aba: "conversa", conv: { instancia: inst, jid: j.join("|"), nome: a.rotulo, vendedor: "", total: "-" }, convRes: a }); pintar(); }
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch(err){ cfgToast(err.message, true); }
    }
  });
  document.addEventListener("change", ev => {
    if(state.screen !== "motorAuditor" || !ev.target.matches) return;
    const s = au();
    if(ev.target.matches("[data-au-de]") && ev.target.value){ s.de = ev.target.value; carregarTime(); carregarConversas(); }
    if(ev.target.matches("[data-au-ate]") && ev.target.value){ s.ate = ev.target.value; carregarTime(); carregarConversas(); }
    if(ev.target.matches("[data-au-vendedor]")){ s.vendedor = ev.target.value; carregarTime(); carregarConversas(); }
  });

  if(state.screen === "motorAuditor"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = RENDERERS.motorAuditor(); }
})();
