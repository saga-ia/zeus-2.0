// Execução Comercial › Diagnóstico: leitura analítica das conversas e dos leads, escrita pela IA (vendas-ia.js).
// Mesmo desenho do painel da imobiliária: tipos de leitura, período, "Gerar diagnóstico", cartões e a lista do que já foi gerado.
// Carregado depois do script principal: usa state, icon, ICONS, e (escape), vendasTabsHTML, zConfirm, cfgToast e RENDERERS de lá.
(function(){
  const AMBAR = "#673DE6", VERDE = "#0F7A68", VERM = "#C0341C", CINZA = "#66666F", LARANJA = "#B7791F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const BOX = "border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:22px 24px;margin-bottom:16px";
  const COR = { alerta: [VERM, "rgba(192,52,28,0.05)", "rgba(192,52,28,0.28)", "Alerta"], atencao: [LARANJA, "rgba(183,121,31,0.06)", "rgba(183,121,31,0.3)", "Atenção"],
    oportunidade: [VERDE, "rgba(15,122,104,0.05)", "rgba(15,122,104,0.28)", "Oportunidade"], diagnostico: [AMBAR, "rgba(103,61,230,0.05)", "rgba(103,61,230,0.25)", "Diagnóstico"] };
  const hoje = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const br = s => String(s || "").split("-").reverse().join("/");
  const fN = n => (Number(n) || 0).toLocaleString("pt-BR");
  function dg(){
    if(!state.diag){ const h = hoje(), ini = new Date(h); ini.setDate(ini.getDate() - 29); state.diag = { tipo: "geral", de: ymd(ini), ate: ymd(h), pedido: "", tipos: null, atual: undefined, stats: null, job: null, lista: null, fontes: null, contexto: null }; }
    return state.diag;
  }
  async function api(url, opts){ const r = await fetch("/api/vendas" + url, opts); const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; }
  const pintar = () => { const el = document.getElementById("dg-root"); if(el) el.innerHTML = corpo(); };

  async function carregarBase(){
    const s = dg();
    try {
      const [t, l, f, c] = await Promise.all([api("/diagnostico/tipos"), api("/diagnostico/lista"), api("/fontes").catch(() => null), api("/contexto").catch(() => null)]);
      Object.assign(s, { tipos: t.tipos, lista: l.diagnosticos, fontes: f, contexto: c });
    } catch(err){ s.erro = err.message; }
    pintar(); carregarRecorte();
  }
  let _rq = 0;
  async function carregarRecorte(){
    const s = dg(), meu = ++_rq; s.atual = undefined; s.stats = null; pintar();
    try {
      const q = `?tipo=${encodeURIComponent(s.tipo)}&de=${s.de}&ate=${s.ate}${s.tipo === "sob_medida" ? "&pedido=" + encodeURIComponent(s.pedido) : ""}`;
      const j = await api("/diagnostico" + q);
      if(meu !== _rq) return;
      s.atual = j.diagnostico; s.stats = j.stats;
    } catch(err){ if(meu === _rq){ s.atual = null; s.erro = err.message; } }
    pintar();
  }
  async function abrir(chave){
    const s = dg();
    try { const j = await api("/diagnostico?chave=" + encodeURIComponent(chave)); const d = j.diagnostico; if(!d) return;
      Object.assign(s, { tipo: d.tipo, de: d.de, ate: d.ate, pedido: d.pedido || "", atual: d, job: null }); pintar();
      const r = await api(`/diagnostico?tipo=${d.tipo}&de=${d.de}&ate=${d.ate}`).catch(() => null); if(r){ s.stats = r.stats; pintar(); }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch(err){ cfgToast(err.message, true); }
  }
  let _poll = null;
  async function gerar(){
    const s = dg(); if(s.job) return;
    if(s.tipo === "sob_medida" && !s.pedido.trim()){ cfgToast("Escreva o que você quer saber.", true); return; }
    try {
      const j = await api("/diagnostico", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: s.tipo, de: s.de, ate: s.ate, pedido: s.pedido }) });
      s.job = { id: j.job, status: "preparando", consultas: [], texto: "" }; pintar();
      clearTimeout(_poll);
      const ver = async () => {
        try {
          const st = await api("/diagnostico/job/" + s.job.id);
          Object.assign(s.job, st);
          if(st.status === "pronto"){ s.job = null; const d = await api("/diagnostico?chave=" + encodeURIComponent(st.chave)); s.atual = d.diagnostico; const l = await api("/diagnostico/lista"); s.lista = l.diagnosticos; pintar(); return; }
          if(st.status === "erro"){ const e2 = st.erro; s.job = null; pintar(); cfgToast(e2, true); return; }
          pintar(); _poll = setTimeout(ver, 2500);
        } catch(err){ s.job = null; pintar(); cfgToast(err.message, true); }
      };
      _poll = setTimeout(ver, 2000);
    } catch(err){ cfgToast(err.message, true); }
  }

  function cabecalhoFontes(){
    const s = dg(), f = s.fontes, c = s.contexto;
    const nums = f ? f.instancias.filter(i => i.ativo).length : 0;
    const fontes = f ? `${nums} número${nums === 1 ? "" : "s"} de WhatsApp · ${fN(f.totais.conversas)} conversas · ${fN(f.totais.leads)} leads importados` : "carregando fontes...";
    let ctx;
    if(!c) ctx = "";
    else if(c.contexto) ctx = `Contexto do seu mercado ${c.contexto.editado ? "editado" : "gerado do Radar ZEUS"} em ${new Date(c.contexto.editado_em || c.contexto.gerado_em).toLocaleDateString("pt-BR")}${c.desatualizado ? " · o Perfil do Negócio mudou e ele será refeito na próxima geração" : ""} · <span data-dg-ctx style="color:${AMBAR};font-weight:600;cursor:pointer">ver</span>`;
    else if(c.perfil_preenchido) ctx = `O contexto do seu mercado é gerado do Radar ZEUS na primeira leitura.`;
    else ctx = `<span style="color:${LARANJA}">Preencha o <span data-go="ferramenta" data-dg-radar style="font-weight:700;cursor:pointer;text-decoration:underline">Radar ZEUS</span> para as leituras falarem a língua do seu mercado.</span>`;
    return `<div style="display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;padding:12px 16px;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;margin-bottom:16px;font-size:12.5px;color:${CINZA}">
      <span style="display:flex;align-items:center;gap:7px">${icon(ICONS.file, 13, CINZA)}${fontes} · <span data-go="waConnector" style="color:${AMBAR};font-weight:600;cursor:pointer">configurar em Conectores</span></span>
      ${ctx ? `<span style="display:flex;align-items:center;gap:7px">${icon(ICONS.bolt, 13, AMBAR)}${ctx}</span>` : ""}
    </div>`;
  }

  function cartoes(d){
    return `<div style="border:1px solid rgba(103,61,230,0.22);border-radius:14px;background:rgba(103,61,230,0.04);padding:16px 18px;margin-bottom:14px">
        <div style="font-size:10.5px;letter-spacing:0.14em;font-weight:700;color:${AMBAR};margin-bottom:6px">RESUMO</div>
        <div style="font-size:14px;line-height:1.65;color:#17171A">${e(d.resumo)}</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px">${d.blocos.map(b => { const c = COR[b.tipo] || COR.diagnostico; return `<div style="border:1px solid ${c[2]};border-radius:14px;background:${c[1]};padding:16px 18px">
          <div style="font-size:10.5px;letter-spacing:0.12em;font-weight:700;color:${c[0]};margin-bottom:6px">${c[3].toUpperCase()}</div>
          <div style="${HEAD};font-size:15px;font-weight:600;line-height:1.35;margin-bottom:8px">${e(b.titulo)}</div>
          <div style="font-size:13px;line-height:1.6;color:#3C3C44;margin-bottom:10px">${e(b.texto)}</div>
          <div style="display:flex;flex-direction:column;gap:6px">${b.itens.map(i => { const acao = /^A[çc][ãa]o:/i.test(i); return `<div style="display:flex;gap:8px;font-size:12.5px;line-height:1.5;${acao ? `padding:9px 11px;border-radius:9px;background:#FFFFFF;border:1px solid ${c[2]};font-weight:600;color:#17171A` : "color:#3C3C44"}">${acao ? icon(ICONS.bolt, 12, c[0]) : `<span style="color:${c[0]}">•</span>`}<span>${e(i)}</span></div>`; }).join("")}</div>
        </div>`; }).join("")}</div>
      ${d.consultas && d.consultas.length ? `<details style="margin-top:14px;font-size:12px;color:${CINZA}"><summary style="cursor:pointer">O que foi apurado (${d.consultas.length} consultas)</summary><ul style="margin:8px 0 0;padding-left:18px;line-height:1.7">${d.consultas.map(x => `<li>${e(x)}</li>`).join("")}</ul></details>` : ""}`;
  }

  function leitura(){
    const s = dg(), tipos = s.tipos || [];
    const nomeTipo = (tipos.find(t => t.id === s.tipo) || {}).nome || "Geral";
    const pill = t => { const on = s.tipo === t.id; return `<span data-dg-tipo="${t.id}" ${on ? "" : "data-hover-border"} style="display:inline-flex;align-items:center;gap:6px;padding:8px 15px;border-radius:20px;font-size:12.5px;cursor:pointer;${on ? `background:${AMBAR};color:#FFFFFF;font-weight:600;border:1px solid ${AMBAR}` : "border:1px solid #DADADF;color:#3C3C44;background:#FFFFFF"}">${t.id === "sob_medida" ? icon(ICONS.edit, 12, "currentColor") : ""}${e(t.nome)}</span>`; };
    const periodos = [["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"]];
    const diasSel = Math.round((new Date(s.ate) - new Date(s.de)) / 86400000) + 1, ehHoje = s.ate === ymd(hoje());
    const estado = s.job ? "gerando agora" : s.atual ? "gerado em " + new Date(s.atual.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : s.atual === undefined ? "procurando..." : "ainda não gerado";
    let corpoRes;
    if(s.job){
      const fase = { preparando: "Preparando a leitura...", contexto: "Escrevendo o contexto do seu mercado a partir do Radar ZEUS...", analisando: "A IA está apurando os números..." }[s.job.status] || "Gerando...";
      corpoRes = `<div style="padding:22px;border:1px dashed rgba(103,61,230,0.35);border-radius:14px;background:rgba(103,61,230,0.03)">
        <div style="display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:600;margin-bottom:10px"><span class="tm-pulse" style="width:8px;height:8px;border-radius:50%;background:${AMBAR}"></span>${fase}</div>
        ${s.job.consultas && s.job.consultas.length ? `<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px">${s.job.consultas.map((c, i) => `<div style="display:flex;gap:8px;font-size:12.5px;color:#3C3C44">${icon(ICONS.check, 12, VERDE)}<span>${e(c)}</span></div>`).join("")}</div>` : ""}
        ${s.job.texto ? `<div style="font-size:12.5px;color:${CINZA};line-height:1.6;white-space:pre-wrap;max-height:160px;overflow:hidden">${e(s.job.texto.slice(-700))}</div>` : ""}
        <div style="font-size:11.5px;color:#9A9AA3;margin-top:8px">Leva de 1 a 5 minutos. Pode sair da tela: quando voltar, o resultado estará guardado.</div></div>`;
    } else if(s.atual) corpoRes = cartoes(s.atual);
    else if(s.atual === undefined) corpoRes = `<div style="padding:34px 0;text-align:center;color:${CINZA};font-size:13px">Procurando esta leitura...</div>`;
    else corpoRes = `<div style="padding:34px 0;text-align:center;color:#9A9AA3;font-size:13px;line-height:1.7">Ainda não existe esta leitura de ${br(s.de)} a ${br(s.ate)}.<br>Clique em "Gerar diagnóstico": leva alguns minutos e depois fica guardado.</div>`;
    return `<div style="${BOX}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px"><span style="width:8px;height:8px;border-radius:50%;background:${AMBAR}"></span><strong style="${HEAD};font-size:15.5px;font-weight:600">Leitura analítica das conversas e dos leads</strong></div>
      <div style="font-size:12.5px;color:${CINZA};margin-bottom:14px">Escolha o tipo de leitura e o período. Cada recorte é escrito uma vez e fica guardado.</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">${tipos.map(pill).join("") || `<span style="font-size:12.5px;color:${CINZA}">Carregando...</span>`}</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px">
        <div style="display:inline-flex;gap:3px;padding:3px;border:1px solid #E6E6EA;border-radius:10px;background:#FFFFFF">${periodos.map(([n, r]) => { const on = ehHoje && diasSel === +n; return `<span data-dg-dias="${n}" style="padding:6px 12px;border-radius:7px;font-size:12.5px;cursor:pointer;${on ? `font-weight:600;background:rgba(103,61,230,0.12);color:${AMBAR}` : "color:#3C3C44"}">${r}</span>`; }).join("")}</div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${CINZA}">de <input data-dg-de type="date" value="${s.de}" max="${s.ate}" style="padding:7px 9px;border:1px solid #DADADF;border-radius:8px;font:inherit;font-size:12.5px"></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${CINZA}">até <input data-dg-ate type="date" value="${s.ate}" min="${s.de}" max="${ymd(hoje())}" style="padding:7px 9px;border:1px solid #DADADF;border-radius:8px;font:inherit;font-size:12.5px"></label>
      </div>
      ${s.tipo === "sob_medida" ? `<textarea data-dg-pedido rows="3" placeholder="O que você quer saber? Ex.: por que os leads do Instagram fecham menos que os de indicação?" style="width:100%;padding:11px 13px;border:1px solid #DADADF;border-radius:11px;font:inherit;font-size:13px;resize:vertical;outline:none;margin-bottom:14px">${e(s.pedido)}</textarea>` : ""}
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;background:#F4F2FC;margin-bottom:16px">
        <div style="flex:1;min-width:220px"><div style="font-size:13.5px"><strong>${e(nomeTipo)}</strong> · ${br(s.de)} a ${br(s.ate)}</div>
          <div style="font-size:12px;color:${CINZA};margin-top:2px">${s.stats ? `${fN(s.stats.mensagens)} mensagens e ${fN(s.stats.leads)} leads neste período · ` : ""}${estado}</div></div>
        <span data-dg-gerar ${s.job ? "" : "data-hover-dark"} style="padding:10px 18px;border-radius:10px;background:${AMBAR};color:#FFFFFF;font-size:13px;font-weight:700;cursor:${s.job ? "default" : "pointer"};opacity:${s.job ? .6 : 1}">${s.job ? "Gerando..." : s.atual ? "Refazer" : "Gerar diagnóstico"}</span>
      </div>
      ${corpoRes}
    </div>`;
  }
  function jaGerados(){
    const l = dg().lista || [];
    return `<div style="${BOX}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px"><span style="width:8px;height:8px;border-radius:50%;background:${AMBAR}"></span><strong style="${HEAD};font-size:15.5px;font-weight:600">Diagnósticos já gerados</strong></div>
      <div style="font-size:12.5px;color:${CINZA};margin-bottom:8px">Clique para reabrir na hora, sem gerar de novo.</div>
      ${l.length ? l.map(d => `<div data-dg-abrir="${e(d.chave)}" data-hover style="display:flex;align-items:center;gap:12px;padding:11px 10px;border-radius:9px;cursor:pointer"><strong style="font-size:13.5px;font-weight:600">${e(d.nome)}</strong><span style="font-size:13px;color:${CINZA};flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${br(d.de)} a ${br(d.ate)}${d.pedido ? " · " + e(d.pedido) : ""}</span><span style="font-size:11.5px;color:#9A9AA3;white-space:nowrap">${new Date(d.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às")}</span></div>`).join("")
        : `<div style="padding:12px 10px;font-size:13px;color:#9A9AA3">Nenhum diagnóstico gerado ainda.</div>`}
    </div>`;
  }
  function corpo(){ return cabecalhoFontes() + leitura() + jaGerados(); }

  function modalContexto(){
    const c = (dg().contexto || {}).contexto; if(!c) return;
    pdiModal({ title: "Contexto do seu mercado", width: 760, submit: "Salvar",
      sub: "É o que a IA sabe sobre o seu negócio ao escrever as leituras: gerado do Radar ZEUS. Pode editar (só administradores salvam).",
      body: `<textarea name="texto" rows="18" style="width:100%;padding:12px 14px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:12.5px;line-height:1.6;resize:vertical">${e(c.texto)}</textarea>`,
      extra: `<span data-dg-ctx-refazer style="font-size:12.5px;font-weight:600;color:${AMBAR};cursor:pointer">Gerar de novo do Radar ZEUS</span>`,
      onClick: async ev => { if(!ev.target.closest("[data-dg-ctx-refazer]")) return; if(!await zConfirm("Gerar o contexto de novo a partir do Radar ZEUS? Edições manuais serão substituídas.", { ok: "Gerar de novo", danger: false })) return; ev.target.textContent = "Gerando..."; try { await api("/contexto/gerar", { method: "POST" }); pdiModalClose(); cfgToast("Contexto gerado de novo"); carregarBase(); } catch(err){ ev.target.textContent = "Gerar de novo do Radar ZEUS"; cfgToast(err.message, true); } },
      onSubmit: async d => { try { await api("/contexto", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: d.texto }) }); cfgToast("Contexto salvo"); carregarBase(); return true; } catch(err){ cfgToast(err.message, true); return false; } } });
  }

  RENDERERS.motorDiagnostico = function(){
    if(!dg().tipos) setTimeout(carregarBase, 0);
    return `<div>${vendasTabsHTML("motorDiagnostico")}
      <div style="padding:26px 30px 60px;max-width:1240px">
        <h1 style="${HEAD};font-size:24px;font-weight:600;margin:0 0 6px">Diagnóstico</h1>
        <p style="margin:0 0 18px;color:${CINZA};font-size:13.5px;max-width:780px;line-height:1.55">A IA lê as conversas de WhatsApp do time e os leads do CRM, apura os números e escreve o diagnóstico na língua do seu mercado.</p>
        <div id="dg-root">${corpo()}</div>
      </div></div>`;
  };

  document.addEventListener("click", ev => {
    if(state.screen !== "motorDiagnostico") return;
    const t = ev.target, s = dg(), q = sel => t.closest && t.closest(sel);
    let el;
    if((el = q("[data-dg-tipo]"))){ if(s.job) return; s.tipo = el.dataset.dgTipo; pintar(); carregarRecorte(); return; }
    if((el = q("[data-dg-dias]"))){ if(s.job) return; const h = hoje(), ini = new Date(h); ini.setDate(ini.getDate() - (+el.dataset.dgDias - 1)); s.de = ymd(ini); s.ate = ymd(h); carregarRecorte(); return; }
    if(q("[data-dg-gerar]")){ const p = document.querySelector("[data-dg-pedido]"); if(p) s.pedido = p.value; gerar(); return; }
    if((el = q("[data-dg-abrir]"))){ if(s.job) return; abrir(el.dataset.dgAbrir); return; }
    if(q("[data-dg-ctx]")){ modalContexto(); return; }
    if(q("[data-dg-radar]")){ ev.stopPropagation(); setState({ screen: "ferramenta", toolId: "radar-zeus", toolView: "brief" }); }
  }, true);
  document.addEventListener("change", ev => {
    if(state.screen !== "motorDiagnostico" || !ev.target.matches) return;
    const s = dg();
    if(ev.target.matches("[data-dg-de]") && ev.target.value){ s.de = ev.target.value; carregarRecorte(); }
    if(ev.target.matches("[data-dg-ate]") && ev.target.value){ s.ate = ev.target.value; carregarRecorte(); }
    if(ev.target.matches("[data-dg-pedido]")) s.pedido = ev.target.value;
  });
  document.addEventListener("input", ev => { if(state.screen === "motorDiagnostico" && ev.target.matches && ev.target.matches("[data-dg-pedido]")) dg().pedido = ev.target.value; });

  if(state.screen === "motorDiagnostico"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = RENDERERS.motorDiagnostico(); }
})();
