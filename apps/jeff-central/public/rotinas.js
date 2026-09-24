// Rotinas: tela /rotinas. Pedidos agendados que o ZEUS executa sozinho e entrega em Conversas, WhatsApp ou e-mail.
// Carregado depois do script principal: usa state, setState, icon, ICONS, e (escape), bindOnce, RENDERERS, mdToHtml,
// homeAgentsEnsure e as funções do chat (chatReloadMessages, chatOpenStream) de lá. Backend: /api/rotinas (rotinas.js).
(function(){
  const ROXO = "#673DE6", VERM = "#C0341C", VERDE = "#0F7A68", CINZA = "#66666F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:10px 12px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none;box-sizing:border-box";
  const LBL = "display:block;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#66666F;margin:0 0 6px";
  const BTN_PRI = "display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:9px;background:" + ROXO + ";color:#FFFFFF;font:inherit;font-size:12.5px;font-weight:700;border:0;cursor:pointer";
  const BTN_SEC = "display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const BTN_MINI = "display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #DADADF;border-radius:8px;font:inherit;font-size:12px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const CHIP = "display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:20px;font-size:11.5px;font-weight:600";
  const FREQS = [["diaria", "Todo dia"], ["semanal", "Dias da semana"], ["mensal", "Todo mês"], ["horas", "A cada X horas"], ["unica", "Uma vez"]];
  const DIAS = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [7, "Dom"]];
  const DIAS_LONGO = { 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado", 7: "domingo" };
  const ENTREGAS = [["chat", "Conversas", "Fica salva em Conversas, como qualquer resposta do ZEUS"], ["whatsapp", "WhatsApp", "Envia pelo número do ZEUS pro WhatsApp que você indicar"], ["email", "E-mail", "Envia pela conta Google conectada"]];
  // Modelos prontos: só o que roda de verdade com as ferramentas conectadas (atividades, financeiro, agenda e e-mail, mídia paga, Instagram, WhatsApp, internet)
  const MODELOS = [
    { cat: "Operação", name: "Resumo do meu dia", tools: ["atividades", "google_agenda", "financeiro"], freq: "diaria", hora: "07:30", entrega: "whatsapp", desc: "Tarefas de hoje, agenda e cobranças em atraso, antes de começar o dia.", prompt: "Monte meu resumo do dia: tarefas das Atividades que vencem hoje (Jeff e Vinicius), compromissos da agenda Google e cobranças em atraso no Asaas. Curto, em tópicos, com o que exige ação primeiro." },
    { cat: "Operação", name: "Agenda de amanhã", tools: ["google_agenda"], freq: "diaria", hora: "20:00", entrega: "whatsapp", skill_id: "agenda-google", desc: "Compromissos do dia seguinte com horário e o que preparar.", prompt: "Liste meus compromissos de amanhã na agenda Google, com horário em Brasília, participantes e o que eu preciso preparar pra cada um. Se não houver nada, diga que o dia está livre." },
    { cat: "Operação", name: "Triagem de e-mails", tools: ["gmail"], freq: "semanal", dias: [1,2,3,4,5], hora: "08:00", entrega: "chat", skill_id: "enviar-email", desc: "O que chegou na caixa que pede resposta, com sugestão de resposta.", prompt: "Leia os e-mails não lidos das últimas 24 h na conta Google conectada. Separe: exige resposta hoje, pode esperar, ignorar. Para os que exigem resposta, sugira o texto da resposta em 3 linhas. Não envie nada." },
    { cat: "Operação", name: "Recap semanal do time", tools: ["atividades"], freq: "semanal", dias: [5], hora: "17:00", entrega: "email", desc: "O que foi concluído e o que ficou pendente na semana, nas Atividades.", prompt: "Faça o recap da semana com base nas Atividades (tarefas do time): tarefas concluídas, tarefas que venceram sem concluir e o que está previsto pra semana que vem, por pessoa (Jeff e Vinicius). Fechamento com 3 prioridades pra segunda." },
    { cat: "Financeiro", name: "Cobranças em atraso", tools: ["financeiro"], freq: "semanal", dias: [1,2,3,4,5], hora: "09:00", entrega: "whatsapp", desc: "Quem está devendo no Asaas, quanto e há quantos dias.", prompt: "Consulte no Asaas as cobranças vencidas e não pagas. Liste cliente, valor, dias de atraso e o total em aberto, do maior pro menor. Sugira quem cobrar hoje." },
    { cat: "Financeiro", name: "Fechamento do mês", tools: ["financeiro"], freq: "mensal", dia_mes: 1, hora: "08:00", entrega: "email", desc: "Receita recebida, a receber e inadimplência do mês que fechou.", prompt: "Monte o fechamento financeiro do mês que acabou de terminar usando o Asaas: total recebido, total a receber, inadimplência (valor e %), comparação com o mês anterior e os 5 maiores clientes por receita." },
    { cat: "Marketing", name: "Saúde do funil de mídia", tools: ["meta_ads"], freq: "diaria", hora: "18:00", entrega: "chat", desc: "Investimento, CPL e leads do dia na Meta Ads, com o que pausar ou escalar.", prompt: "Analise as campanhas ativas da Meta Ads hoje (ferramenta growth): investimento, CPL e leads em relação a ontem. Aponte o que pausar, o que escalar e um alerta se algum custo subiu mais de 30%." },
    { cat: "Marketing", name: "Radar de tendências", tools: ["internet"], freq: "semanal", dias: [1], hora: "08:00", entrega: "email", skill_id: "pesquisa-web", desc: "As 5 tendências da semana no seu mercado, com fonte.", prompt: "Pesquise na internet as 5 principais tendências da semana em marketing digital e IA aplicada a negócios no Brasil. Para cada uma: o que é, fonte com link e o que fazer com isso na nossa operação." },
    { cat: "Marketing", name: "Monitor de concorrentes", tools: ["internet", "instagram"], freq: "semanal", dias: [3], hora: "09:00", entrega: "chat", skill_id: "pesquisa-web", desc: "O que os concorrentes publicaram, lançaram ou mudaram na semana.", prompt: "Pesquise na internet o que os concorrentes [ESCREVA OS NOMES AQUI] fizeram nos últimos 7 dias: lançamentos, ofertas, campanhas, conteúdo que viralizou e mudanças de posicionamento. Traga fontes e o que isso muda pra gente." },
    { cat: "Marketing", name: "Pauta de conteúdo da semana", tools: ["internet", "instagram"], freq: "semanal", dias: [1], hora: "10:00", entrega: "chat", skill_id: "pesquisa-web", desc: "5 ideias de conteúdo com gancho, baseadas no que está em alta.", prompt: "Pesquise o que está em alta esta semana no nicho de marketing digital e negócios no Instagram e no YouTube. Entregue 5 ideias de conteúdo pro @jeffhenrike, cada uma com gancho de 3 segundos, formato (reels, carrossel, story) e CTA." },
    { cat: "Marketing", name: "Desempenho do Instagram", tools: ["instagram"], freq: "semanal", dias: [7], hora: "19:00", entrega: "whatsapp", desc: "Seguidores, alcance e os posts que mais renderam na semana.", prompt: "Puxe os dados do Instagram (instagram.sh): seguidores ganhos, alcance e engajamento dos últimos 7 dias, e os 3 posts com melhor desempenho. Diga o que repetir e o que evitar." },
    { cat: "Pessoas e metas", name: "Check-in de OKRs", tools: ["central"], freq: "semanal", dias: [1], hora: "09:00", entrega: "chat", desc: "Objetivos em risco e KRs sem atualização há dias.", prompt: "Revise os OKRs do ciclo ativo: quais objetivos estão atrasados ou em risco em relação ao tempo decorrido, quais resultados-chave não recebem atualização há mais de 7 dias e quem é o dono de cada um. Termine com as 3 ações da semana." },
  ];
  const SUGESTOES = MODELOS.slice(0, 3);

  const FERRAMENTAS_PADRAO = [["atividades", "Atividades (tarefas)"], ["financeiro", "Financeiro"], ["google_agenda", "Google Agenda"], ["gmail", "Gmail"], ["drive", "Drive e Planilhas"], ["meta_ads", "Meta Ads"], ["instagram", "Instagram"], ["whatsapp", "WhatsApp (conversas)"], ["internet", "Internet"], ["contratos", "Contratos"], ["central", "Dados da Central"]].map(x => ({ id: x[0], label: x[1] }));
  function R(){ if(!state.rot) state.rot = { data: null, loading: false, error: null, modal: null, runs: {}, aberto: {}, saida: {}, busy: {}, ferramentas: FERRAMENTAS_PADRAO }; return state.rot; }
  function ferrLabel(id){ const f = (R().ferramentas || FERRAMENTAS_PADRAO).find(x => x.id === id); return f ? f.label : id; }
  async function api(p, opts){
    const r = await fetch("/api/rotinas" + p, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }
  async function load(){
    const s = R(); s.loading = true; s.error = null; repaint();
    try { const j = await api(""); s.data = j.rotinas; s.agora = j.agora; if(j.ferramentas) s.ferramentas = j.ferramentas; }
    catch(err){ s.error = err.message; }
    s.loading = false; repaint();
  }
  function repaint(){
    const root = document.getElementById("rot-root");
    if(root){ root.innerHTML = page(); bind(root); }
    modalHost();
  }
  // O modal mora direto no <body>: dentro do conteúdo da tela ele ficava preso à área animada e era cortado ao rolar
  function modalHost(){
    let host = document.getElementById("rot-modal-host");
    const f = R().modal;
    if(!f || state.screen !== "rotinas" || !document.getElementById("rot-root")){ if(host) host.remove(); document.body.style.overflow = ""; return; }
    if(!host){ host = document.createElement("div"); host.id = "rot-modal-host"; document.body.appendChild(host); }
    host.innerHTML = modal(f); bind(host);
    document.body.style.overflow = "hidden";
  }
  const _slotObs = new MutationObserver(() => { if(!document.getElementById("rot-root") && document.getElementById("rot-modal-host")){ R().modal = null; modalHost(); } });
  setTimeout(() => { const slot = document.getElementById("main-slot"); if(slot) _slotObs.observe(slot, { childList: true }); }, 0);

  // ─── Formatação ─────────────────────────────────────────────────────────────
  const p2 = n => String(n).padStart(2, "0");
  function fmtData(ms){ if(!ms) return ""; return new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às"); }
  function relativo(ms){
    if(!ms) return "";
    const d = ms - Date.now(), abs = Math.abs(d), fut = d > 0;
    const m = Math.round(abs / 60000), h = Math.round(abs / 3600000), dd = Math.round(abs / 86400000);
    const t = m < 1 ? "agora" : m < 60 ? m + " min" : h < 24 ? h + " h" : dd + (dd === 1 ? " dia" : " dias");
    return t === "agora" ? t : (fut ? "em " + t : "há " + t);
  }
  function quandoRoda(r){
    if(r.freq === "diaria") return "Todo dia às " + r.hora;
    if(r.freq === "semanal"){
      const ds = (r.dias || []).slice().sort();
      const txt = ds.length === 7 ? "Todo dia" : ds.join(",") === "1,2,3,4,5" ? "Seg a sex" : ds.length === 2 && ds.includes(6) && ds.includes(7) ? "Sáb e dom" : ds.map(x => DIAS_LONGO[x]).join(", ").replace(/, ([^,]*)$/, " e $1");
      return txt + " às " + r.hora;
    }
    if(r.freq === "mensal") return "Todo dia " + r.dia_mes + " às " + r.hora;
    if(r.freq === "horas") return "A cada " + r.cada_horas + (r.cada_horas === 1 ? " hora" : " horas");
    if(r.freq === "unica"){ const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(r.quando || ""); return m ? `Uma vez, ${m[3]}/${m[2]} às ${m[4]}:${m[5]}` : "Uma vez"; }
    return "";
  }
  function agenteNome(id){ const d = state.agentsData; const a = d && (d.agents || []).find(x => x.id === id); return a ? a.name : (id || "ZEUS"); }
  function skillNome(id){ const d = state.agentsData; const s = d && (d.skills || []).find(x => x.id === id); return s ? s.name : id; }
  function entregaTxt(r){ const en = ENTREGAS.find(x => x[0] === r.entrega) || ENTREGAS[0]; return en[1] + (r.destino ? " · " + r.destino : ""); }

  // ─── Tela ────────────────────────────────────────────────────────────────────
  function page(){
    const s = R();
    return `<div style="padding:34px 40px 60px;max-width:1240px">
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;margin-bottom:22px">
        <div style="flex:1;min-width:260px">
          <div style="font-size:10.5px;letter-spacing:0.16em;color:${ROXO};font-weight:700;margin-bottom:8px">OPERAR E AUTOMATIZAR</div>
          <h1 style="${HEAD};font-size:25px;font-weight:600;margin:0 0 6px">Rotinas</h1>
          <p style="margin:0;color:${CINZA};max-width:720px;line-height:1.55">Pedidos que o ZEUS executa sozinho no horário que você marcar: todo dia, em dias da semana, todo mês, a cada X horas ou uma vez só. O resultado chega em Conversas, no seu WhatsApp ou por e-mail.</p>
        </div>
        <button data-rot-new style="${BTN_PRI}">${icon(ICONS.plus, 14, "currentColor")}Nova rotina</button>
      </div>
      ${s.error ? `<div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid rgba(192,52,28,0.3);border-radius:12px;background:rgba(192,52,28,0.05);margin-bottom:16px;font-size:13px">${icon(ICONS.warn, 14, VERM)}<span style="flex:1">Não consegui falar com o servidor das rotinas (${e(s.error)}). Se a central acabou de ser atualizada, o serviço precisa ser reiniciado.</span><span data-rot-reload style="${BTN_MINI}">Tentar de novo</span></div>` : ""}
      ${s.loading && !s.data ? `<div style="padding:30px 0;color:${CINZA};font-size:13px">Carregando rotinas...</div>` : ""}
      ${s.data && !s.data.length ? vazio() : ""}
      ${s.data && s.data.length ? `<div style="display:flex;flex-direction:column;gap:12px">${s.data.map(card).join("")}</div>` : ""}
      ${s.data ? modelos(!s.data.length) : ""}
    </div>`;
  }
  function vazio(){
    return `<div style="border:1px dashed #DADADF;border-radius:16px;background:#FFFFFF;padding:26px 28px;margin-bottom:22px">
      <div style="${HEAD};font-size:17px;font-weight:600;margin-bottom:6px">Nenhuma rotina ainda</div>
      <p style="margin:0;color:${CINZA};font-size:13.5px;line-height:1.55">Escolha um modelo abaixo, clique em "Nova rotina" e escreva com suas palavras, ou peça no chat: <em>"todo dia às 8h me manda no WhatsApp as tarefas que vencem hoje"</em>. O ZEUS cria a rotina pra você.</p>
    </div>`;
  }
  // Galeria de modelos, agrupada por categoria. Aberta por padrão quando ainda não há rotina.
  function modelos(abrir){
    const s = R();
    const aberto = s.modelosAberto === undefined ? abrir : s.modelosAberto;
    const cats = []; MODELOS.forEach(m => { if(!cats.includes(m.cat)) cats.push(m.cat); });
    return `<div style="margin-top:${abrir ? 0 : 26}px">
      <div data-rot-modelos style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;margin-bottom:${aberto ? 14 : 0}px">
        <span style="${HEAD};font-size:15px;font-weight:600">Modelos prontos</span>
        <span style="font-size:12px;color:${CINZA}">${MODELOS.length} rotinas que já funcionam com o que está conectado</span>
        <span style="flex:1"></span>
        <span style="color:${CINZA};transform:rotate(${aberto ? 180 : 0}deg);display:flex">${icon(ICONS.chevDown, 14, "currentColor")}</span>
      </div>
      ${aberto ? cats.map(c => `
        <div style="font-size:10.5px;letter-spacing:0.14em;color:${CINZA};font-weight:700;margin:14px 0 8px">${e(c).toUpperCase()}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px">
          ${MODELOS.map((m, i) => m.cat !== c ? "" : `<div data-rot-sug="${i}" data-hover-border style="border:1px solid #E6E6EA;border-radius:13px;background:#FFFFFF;padding:13px 15px;cursor:pointer;display:flex;flex-direction:column;gap:5px">
            <div style="display:flex;align-items:center;gap:8px">${icon(ICONS.rotinas, 14, ROXO)}<strong style="font-size:13.5px;flex:1">${e(m.name)}</strong><span style="font-size:11px;color:${ROXO};font-weight:700">Usar</span></div>
            <div style="font-size:12px;color:${CINZA}">${e(quandoRoda(Object.assign({ dias: [1,2,3,4,5] }, m)))} · ${e((ENTREGAS.find(x => x[0] === m.entrega) || ENTREGAS[0])[1])}${m.skill_id ? " · /" + e(skillNome(m.skill_id)) : ""}</div>
            <div style="font-size:12.5px;color:#3C3C44;line-height:1.5">${e(m.desc)}</div>
          </div>`).join("")}
        </div>`).join("") : ""}
    </div>`;
  }
  function card(r){
    const s = R();
    const stCor = r.rodando ? ROXO : r.last_status === "erro" ? VERM : r.last_status === "ok" ? VERDE : CINZA;
    const stTxt = r.rodando ? "Executando agora..." : r.last_run_at ? (r.last_status === "erro" ? "Falhou " : "Rodou ") + relativo(r.last_run_at) : "Nunca rodou";
    const prox = r.enabled ? (r.next_run_at ? `Próxima ${relativo(r.next_run_at)} (${fmtData(r.next_run_at)})` : "Sem próxima execução") : "Pausada";
    const aberto = !!s.aberto[r.id];
    return `<div style="border:1px solid ${r.enabled ? "#E6E6EA" : "#EFEFF1"};border-radius:16px;background:#FFFFFF;padding:18px 20px;${r.enabled ? "" : "opacity:.75"}">
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">
        <span style="width:38px;height:38px;border-radius:11px;background:rgba(103,61,230,0.12);display:flex;align-items:center;justify-content:center;flex:0 0 auto">${icon(ICONS.rotinas, 17, ROXO)}</span>
        <div style="flex:1;min-width:240px">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px">
            <strong style="${HEAD};font-size:15px;font-weight:600">${e(r.name)}</strong>
            <span style="${CHIP};background:rgba(103,61,230,0.1);color:${ROXO}">${e(quandoRoda(r))}</span>
            <span style="${CHIP};background:#F1F1F3;color:#3C3C44">${e(entregaTxt(r))}</span>
            ${r.agent_id ? `<span style="${CHIP};background:#F1F1F3;color:#3C3C44">@${e(agenteNome(r.agent_id))}</span>` : ""}
            ${r.skill_id ? `<span style="${CHIP};background:#F1F1F3;color:#3C3C44">/${e(skillNome(r.skill_id))}</span>` : ""}
            ${(r.tools || []).map(t => `<span style="${CHIP};background:#FFFFFF;border:1px solid #E6E6EA;color:${CINZA};font-weight:500">${e(ferrLabel(t))}</span>`).join("")}
          </div>
          <div style="font-size:13px;color:#3C3C44;line-height:1.55;white-space:pre-wrap">${e(r.prompt)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:12px;color:${CINZA}">
            <span style="display:inline-flex;align-items:center;gap:6px;color:${stCor};font-weight:600"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>${stTxt}</span>
            <span>${prox}</span>
            ${r.runs ? `<span>${r.runs} execuç${r.runs === 1 ? "ão" : "ões"}${r.erros ? ", " + r.erros + " com erro" : ""}</span>` : ""}
          </div>
          ${r.last_status === "erro" && r.last_error ? `<div style="margin-top:8px;font-size:12px;color:${VERM}">${e(r.last_error)}</div>` : ""}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <span data-rot-run="${e(r.id)}" style="${BTN_MINI};${r.rodando ? "opacity:.5;cursor:default" : ""}" title="Executar agora, fora do horário">${icon(ICONS.play, 12, "currentColor")}Executar agora</span>
          <span data-rot-hist="${e(r.id)}" style="${BTN_MINI}" title="Ver execuções">${icon(ICONS.history, 12, "currentColor")}Histórico</span>
          <span data-rot-edit="${e(r.id)}" style="${BTN_MINI}">${icon(ICONS.edit, 12, "currentColor")}Editar</span>
          <label title="${r.enabled ? "Pausar" : "Ativar"}" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#3C3C44;cursor:pointer;margin-left:4px"><input type="checkbox" data-rot-toggle="${e(r.id)}" ${r.enabled ? "checked" : ""} style="accent-color:${ROXO};width:16px;height:16px">${r.enabled ? "Ativa" : "Pausada"}</label>
          <span data-rot-del="${e(r.id)}" title="Excluir" style="${BTN_MINI};color:${VERM};border-color:rgba(192,52,28,0.3)">${icon(ICONS.trash, 12, "currentColor")}</span>
        </div>
      </div>
      ${aberto ? historico(r) : ""}
    </div>`;
  }
  function historico(r){
    const s = R(), runs = s.runs[r.id];
    if(!runs) return `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #F1F1F3;font-size:12.5px;color:${CINZA}">Carregando execuções...</div>`;
    if(!runs.length) return `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #F1F1F3;font-size:12.5px;color:${CINZA}">Ainda não rodou nenhuma vez.</div>`;
    return `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #F1F1F3;display:flex;flex-direction:column;gap:8px">
      ${runs.map(x => {
        const cor = x.status === "erro" ? VERM : x.status === "ok" ? VERDE : ROXO;
        const dur = x.finished_at ? Math.round((x.finished_at - x.started_at) / 1000) : null;
        const saida = s.saida[x.id];
        return `<div style="border:1px solid #F1F1F3;border-radius:11px;padding:10px 12px;background:#FAFAFA">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;font-size:12.5px">
            <span style="display:inline-flex;align-items:center;gap:6px;color:${cor};font-weight:600"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>${x.status === "erro" ? "Erro" : x.status === "ok" ? "OK" : "Rodando"}</span>
            <span style="color:#3C3C44">${fmtData(x.started_at)}</span>
            ${dur !== null ? `<span style="color:${CINZA}">${dur < 60 ? dur + "s" : Math.round(dur / 60) + " min"}</span>` : ""}
            <span style="color:${CINZA}">${x.trigger === "manual" ? "manual" : "agenda"}</span>
            <span style="flex:1"></span>
            ${x.output_len ? `<span data-rot-saida="${e(r.id)}:${e(x.id)}" style="${BTN_MINI}">${saida ? "Esconder resposta" : "Ver resposta"}</span>` : ""}
            ${x.session_id ? `<span data-rot-chat="${e(r.id)}:${e(x.session_id)}" style="${BTN_MINI}">${icon(ICONS.chatBubble, 12, "currentColor")}Abrir conversa</span>` : ""}
          </div>
          ${x.error ? `<div style="margin-top:6px;font-size:12px;color:${VERM}">${e(x.error)}</div>` : ""}
          ${saida ? `<div style="margin-top:10px;padding:12px 14px;border-radius:10px;background:#FFFFFF;border:1px solid #E6E6EA;font-size:13px;line-height:1.6">${mdToHtml(saida)}</div>` : (x.preview && !saida ? `<div style="margin-top:6px;font-size:12px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(x.preview.replace(/\s+/g, " "))}</div>` : "")}
        </div>`;
      }).join("")}
    </div>`;
  }

  // ─── Formulário ──────────────────────────────────────────────────────────────
  function formVazio(){ return { id: null, name: "", prompt: "", agent_id: "", skill_id: "", freq: "diaria", hora: "08:00", dias: [1,2,3,4,5], dia_mes: 1, cada_horas: 6, quando: "", entrega: "chat", destino: "", tools: [], enabled: true, error: null, saving: false }; }
  function modal(f){
    const d = state.agentsData || {};
    const agentes = (d.agents || []).slice().sort((a, b) => (b.inWorkspace - a.inWorkspace) || a.name.localeCompare(b.name));
    const skills = (d.skills || []).slice().sort((a, b) => (a.group || "").localeCompare(b.group || "") || a.name.localeCompare(b.name));
    const grupos = {}; skills.forEach(s => { (grupos[s.group || "Outras"] = grupos[s.group || "Outras"] || []).push(s); });
    const en = ENTREGAS.find(x => x[0] === f.entrega) || ENTREGAS[0];
    return `<div data-rot-modal-bg style="position:fixed;inset:0;background:rgba(23,23,26,0.45);z-index:80;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto">
      <div data-rot-modal style="width:100%;max-width:720px;background:#FFFFFF;border-radius:18px;box-shadow:0 24px 70px rgba(23,23,26,0.25);padding:26px 28px 22px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
          <h2 style="${HEAD};font-size:19px;font-weight:600;margin:0;flex:1">${f.id ? "Editar rotina" : "Nova rotina"}</h2>
          <span data-rot-cancel style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${CINZA}">${icon(ICONS.x, 16, "currentColor")}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div><label style="${LBL}">Nome</label><input data-rf="name" value="${e(f.name)}" placeholder="Ex.: Resumo do meu dia" style="${IN}"></div>
          <div><label style="${LBL}">O que o ZEUS deve fazer</label><textarea data-rf="prompt" rows="4" placeholder="Escreva como se estivesse pedindo no chat. Ex.: Pesquise na internet as notícias da semana sobre ... e me traga um resumo com fontes." style="${IN};resize:vertical;line-height:1.5">${e(f.prompt)}</textarea>
            <div style="font-size:11.5px;color:${CINZA};margin-top:5px">Ninguém estará online na hora: escreva tudo que ele precisa saber. Ele tem acesso ao que está conectado: atividades, financeiro, agenda e e-mail, mídia paga, WhatsApp e internet.</div></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
            <div><label style="${LBL}">Agente</label><select data-rf="agent_id" style="${IN}"><option value="">ZEUS (padrão)</option>${agentes.map(a => `<option value="${e(a.id)}" ${a.id === f.agent_id ? "selected" : ""}>${e(a.name)}${a.inWorkspace ? "" : " (catálogo)"}</option>`).join("")}</select></div>
            <div><label style="${LBL}">Habilidade (opcional)</label><select data-rf="skill_id" style="${IN}"><option value="">Nenhuma</option>${Object.keys(grupos).map(g => `<optgroup label="${e(g)}">${grupos[g].map(s => `<option value="${e(s.id)}" ${s.id === f.skill_id ? "selected" : ""}>${e(s.name)}</option>`).join("")}</optgroup>`).join("")}</select></div>
          </div>
          <div>
            <label style="${LBL}">Ferramentas que ele pode usar</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px">${(R().ferramentas || FERRAMENTAS_PADRAO).map(t => { const on = (f.tools || []).includes(t.id); return `<span data-rot-tool="${e(t.id)}" style="${BTN_MINI};${on ? `background:rgba(103,61,230,0.1);border-color:${ROXO};color:${ROXO};font-weight:700` : ""}">${on ? icon(ICONS.check, 11, "currentColor") : ""}${e(t.label)}</span>`; }).join("")}</div>
            <div style="font-size:11.5px;color:${CINZA};margin-top:6px">${(f.tools || []).length ? "Ele vai buscar dados reais nessas ferramentas antes de responder." : "Sem seleção, ele decide sozinho o que usar com base no pedido."}</div>
          </div>
          <div>
            <label style="${LBL}">Quando</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${FREQS.map(x => `<span data-rot-freq="${x[0]}" style="${BTN_MINI};${x[0] === f.freq ? `background:rgba(103,61,230,0.1);border-color:${ROXO};color:${ROXO};font-weight:700` : ""}">${x[1]}</span>`).join("")}</div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
              ${f.freq === "semanal" ? `<div><div style="display:flex;gap:5px">${DIAS.map(dw => `<span data-rot-dia="${dw[0]}" style="${BTN_MINI};padding:6px 9px;${(f.dias || []).includes(dw[0]) ? `background:${ROXO};border-color:${ROXO};color:#FFFFFF;font-weight:700` : ""}">${dw[1]}</span>`).join("")}</div></div>` : ""}
              ${f.freq === "mensal" ? `<div style="width:120px"><label style="${LBL}">Dia do mês</label><input data-rf="dia_mes" type="number" min="1" max="28" value="${e(f.dia_mes)}" style="${IN}"></div>` : ""}
              ${f.freq === "horas" ? `<div style="width:150px"><label style="${LBL}">A cada (horas)</label><input data-rf="cada_horas" type="number" min="1" max="168" value="${e(f.cada_horas)}" style="${IN}"></div>` : ""}
              ${f.freq === "unica" ? `<div style="width:230px"><label style="${LBL}">Data e hora (Brasília)</label><input data-rf="quando" type="datetime-local" value="${e(f.quando)}" style="${IN}"></div>` : ""}
              ${f.freq !== "horas" && f.freq !== "unica" ? `<div style="width:130px"><label style="${LBL}">Hora (Brasília)</label><input data-rf="hora" type="time" value="${e(f.hora)}" style="${IN}"></div>` : ""}
            </div>
          </div>
          <div>
            <label style="${LBL}">Entregar em</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${ENTREGAS.map(x => `<span data-rot-entrega="${x[0]}" style="${BTN_MINI};${x[0] === f.entrega ? `background:rgba(103,61,230,0.1);border-color:${ROXO};color:${ROXO};font-weight:700` : ""}">${x[1]}</span>`).join("")}</div>
            <div style="font-size:11.5px;color:${CINZA};margin-bottom:${f.entrega === "chat" ? 0 : 8}px">${e(en[2])}${f.entrega !== "chat" ? ". A resposta também fica salva em Conversas." : ""}</div>
            ${f.entrega === "whatsapp" ? `<input data-rf="destino" value="${e(f.destino)}" placeholder="Número com DDD, ex.: 81999998888" style="${IN};max-width:320px">` : ""}
            ${f.entrega === "email" ? `<input data-rf="destino" type="email" value="${e(f.destino)}" placeholder="destino@empresa.com" style="${IN};max-width:360px">` : ""}
          </div>
          ${f.error ? `<div style="font-size:12.5px;color:${VERM}">${e(f.error)}</div>` : ""}
          <div style="display:flex;align-items:center;gap:10px;padding-top:6px;border-top:1px solid #F1F1F3">
            <label style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:#3C3C44;cursor:pointer"><input type="checkbox" data-rf="enabled" ${f.enabled ? "checked" : ""} style="accent-color:${ROXO};width:15px;height:15px">Ativa</label>
            <span style="flex:1"></span>
            <span data-rot-cancel style="${BTN_SEC}">Cancelar</span>
            <button data-rot-save style="${BTN_PRI};${f.saving ? "opacity:.6" : ""}" ${f.saving ? "disabled" : ""}>${f.saving ? "Salvando..." : (f.id ? "Salvar" : "Criar rotina")}</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  // Lê o que está digitado antes de repintar o modal (troca de frequência ou canal não pode apagar o texto)
  function syncForm(){
    const f = R().modal; if(!f) return f;
    document.querySelectorAll("[data-rot-modal] [data-rf]").forEach(el => {
      const k = el.dataset.rf;
      if(el.type === "checkbox") f[k] = el.checked; else f[k] = el.value;
    });
    return f;
  }
  function abrirForm(base){
    const f = Object.assign(formVazio(), base || {});
    f.error = null; f.saving = false;
    R().modal = f; repaint();
    setTimeout(() => { const i = document.querySelector("[data-rot-modal] [data-rf='name']"); if(i && !f.name) i.focus(); }, 30);
  }
  async function salvar(){
    const f = syncForm(); if(!f || f.saving) return;
    f.saving = true; f.error = null; repaint();
    const body = { name: f.name, prompt: f.prompt, agent_id: f.agent_id || null, skill_id: f.skill_id || null, freq: f.freq, hora: f.hora, dias: f.dias, dia_mes: +f.dia_mes || 1, cada_horas: +f.cada_horas || 6, quando: f.quando || null, entrega: f.entrega, destino: f.destino, tools: f.tools || [], enabled: !!f.enabled };
    try {
      await api(f.id ? "/" + encodeURIComponent(f.id) : "", { method: f.id ? "PUT" : "POST", body: JSON.stringify(body) });
      R().modal = null;
      await load();
    } catch(err){ f.saving = false; f.error = err.message; repaint(); }
  }
  async function rodar(id){
    const s = R(); if(s.busy[id]) return;
    s.busy[id] = true;
    try {
      await api("/" + encodeURIComponent(id) + "/rodar", { method: "POST", body: "{}" });
      s.aberto[id] = true; delete s.runs[id];
      await load(); carregarRuns(id);
      // Repinta enquanto roda, pra mostrar quando terminar
      let n = 0; const t = setInterval(async () => {
        n++; const r = (R().data || []).find(x => x.id === id);
        if(!r || !r.rodando || n > 80 || state.screen !== "rotinas"){ clearInterval(t); if(r && state.screen === "rotinas"){ delete R().runs[id]; await load(); carregarRuns(id); } return; }
        try { const j = await api(""); R().data = j.rotinas; repaint(); } catch(_){}
      }, 15000);
    } catch(err){ alert("Erro: " + err.message); }
    delete s.busy[id];
  }
  async function carregarRuns(id){
    try { const j = await api("/" + encodeURIComponent(id) + "/runs"); R().runs[id] = j.runs; }
    catch(err){ R().runs[id] = []; }
    repaint();
  }
  function abrirConversa(r, sid){
    try {
      if(typeof chatCloseStream === "function") chatCloseStream();
      state.chat = Object.assign({}, state.chat || {}, { sid, agentId: r.agent_id || null, messages: [], sessions: [], streaming: false, _loaded: true });
      setState({ screen: r.agent_id ? "agente" : "chat", agentId: r.agent_id || state.agentId, editAgentId: null, chatOverlay: false });
      if(typeof chatReloadMessages === "function") chatReloadMessages(sid);
      if(typeof chatOpenStream === "function") chatOpenStream(sid);
      if(typeof chatLoadSessions === "function") chatLoadSessions();
    } catch(err){ alert("Não consegui abrir a conversa: " + err.message); }
  }

  // ─── Eventos ─────────────────────────────────────────────────────────────────
  function bind(root){
    root.querySelectorAll("[data-rot-new]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); abrirForm(); }));
    root.querySelectorAll("[data-rot-reload]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); load(); }));
    root.querySelectorAll("[data-rot-sug]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const m = Object.assign({}, MODELOS[+el.dataset.rotSug]); delete m.cat; delete m.desc; abrirForm(m); }));
    root.querySelectorAll("[data-rot-modelos]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const s = R(); s.modelosAberto = !(s.modelosAberto === undefined ? !(s.data && s.data.length) : s.modelosAberto); repaint(); }));
    root.querySelectorAll("[data-rot-run]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); rodar(el.dataset.rotRun); }));
    root.querySelectorAll("[data-rot-hist]").forEach(el => bindOnce(el, "click", ev => {
      ev.stopPropagation(); const id = el.dataset.rotHist, s = R();
      s.aberto[id] = !s.aberto[id]; repaint();
      if(s.aberto[id] && !s.runs[id]) carregarRuns(id);
    }));
    root.querySelectorAll("[data-rot-saida]").forEach(el => bindOnce(el, "click", async ev => {
      ev.stopPropagation(); const [id, rid] = el.dataset.rotSaida.split(":"), s = R();
      if(s.saida[rid]){ delete s.saida[rid]; repaint(); return; }
      try { const j = await api("/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(rid)); s.saida[rid] = j.run.output || "(sem texto)"; }
      catch(err){ s.saida[rid] = "Erro ao carregar: " + err.message; }
      repaint();
    }));
    root.querySelectorAll("[data-rot-chat]").forEach(el => bindOnce(el, "click", ev => {
      ev.stopPropagation(); const [id, sid] = el.dataset.rotChat.split(":");
      const r = (R().data || []).find(x => x.id === id); if(r) abrirConversa(r, sid);
    }));
    root.querySelectorAll("[data-rot-edit]").forEach(el => bindOnce(el, "click", ev => {
      ev.stopPropagation(); const r = (R().data || []).find(x => x.id === el.dataset.rotEdit); if(!r) return;
      abrirForm({ id: r.id, name: r.name, prompt: r.prompt, agent_id: r.agent_id || "", skill_id: r.skill_id || "", freq: r.freq, hora: r.hora, dias: r.dias || [1,2,3,4,5], dia_mes: r.dia_mes, cada_horas: r.cada_horas, quando: r.quando || "", entrega: r.entrega, destino: r.destino || "", tools: r.tools || [], enabled: r.enabled });
    }));
    root.querySelectorAll("[data-rot-toggle]").forEach(el => bindOnce(el, "change", async () => {
      try { await api("/" + encodeURIComponent(el.dataset.rotToggle) + "/ativar", { method: "POST", body: JSON.stringify({ enabled: el.checked }) }); }
      catch(err){ alert("Erro: " + err.message); }
      load();
    }));
    root.querySelectorAll("[data-rot-del]").forEach(el => bindOnce(el, "click", async ev => {
      ev.stopPropagation(); const r = (R().data || []).find(x => x.id === el.dataset.rotDel); if(!r) return;
      if(!confirm(`Excluir a rotina "${r.name}"? O histórico de execuções some junto (as conversas em Conversas ficam).`)) return;
      try { await api("/" + encodeURIComponent(r.id), { method: "DELETE" }); } catch(err){ alert("Erro: " + err.message); }
      load();
    }));
    // Modal
    root.querySelectorAll("[data-rot-modal-bg]").forEach(el => bindOnce(el, "mousedown", ev => { if(ev.target === el){ R().modal = null; repaint(); } }));
    root.querySelectorAll("[data-rot-modal]").forEach(el => bindOnce(el, "click", ev => ev.stopPropagation()));
    root.querySelectorAll("[data-rot-cancel]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); R().modal = null; repaint(); }));
    root.querySelectorAll("[data-rot-save]").forEach(el => bindOnce(el, "click", ev => { ev.preventDefault(); ev.stopPropagation(); salvar(); }));
    root.querySelectorAll("[data-rot-freq]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const f = syncForm(); if(!f) return; f.freq = el.dataset.rotFreq; repaint(); }));
    root.querySelectorAll("[data-rot-entrega]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); const f = syncForm(); if(!f) return; f.entrega = el.dataset.rotEntrega; if(f.entrega === "chat") f.destino = ""; repaint(); }));
    root.querySelectorAll("[data-rot-tool]").forEach(el => bindOnce(el, "click", ev => {
      ev.stopPropagation(); const f = syncForm(); if(!f) return; const t = el.dataset.rotTool;
      f.tools = (f.tools || []).includes(t) ? f.tools.filter(x => x !== t) : (f.tools || []).concat([t]);
      repaint();
    }));
    root.querySelectorAll("[data-rot-dia]").forEach(el => bindOnce(el, "click", ev => {
      ev.stopPropagation(); const f = syncForm(); if(!f) return; const d = +el.dataset.rotDia;
      f.dias = (f.dias || []).includes(d) ? f.dias.filter(x => x !== d) : f.dias.concat([d]).sort();
      repaint();
    }));
    root.querySelectorAll("[data-rot-modal] [data-rf='prompt']").forEach(el => bindOnce(el, "keydown", ev => { if(ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)){ ev.preventDefault(); salvar(); } }));
  }
  document.addEventListener("keydown", ev => { if(ev.key === "Escape" && R().modal && state.screen === "rotinas"){ R().modal = null; repaint(); } });

  // ─── plug na Central ────────────────────────────────────────────────────────
  window.rotinaAbrirCom = function(base){
    R().abrirCom = base || {};
    if(state.screen === "rotinas"){ const b = R().abrirCom; R().abrirCom = null; abrirForm(b); }
    else setState({ screen: "rotinas", wsMenuOpen: false, userMenuOpen: false });
  };
  RENDERERS.rotinas = function(){
    setTimeout(() => {
      const root = document.getElementById("rot-root"); if(!root) return;
      bind(root);
      const s = R();
      if(s.abrirCom){ const b = s.abrirCom; s.abrirCom = null; abrirForm(b); }
      if(!s.data && !s.loading) load();
      if(!state.agentsData && typeof homeAgentsEnsure === "function") homeAgentsEnsure().then(() => { if(state.screen === "rotinas") repaint(); });
    }, 0);
    return `<div id="rot-root">${page()}</div>`;
  };
  if(state.screen === "rotinas"){ const slot = document.getElementById("main-slot"); if(slot){ slot.innerHTML = RENDERERS.rotinas(); } }
})();
