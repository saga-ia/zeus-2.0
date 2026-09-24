// PDI: telas Meu PDI, PDI de alguém da equipe, PDIs da equipe (cockpit), Templates e Novo PDI.
// Carregado depois do script principal: substitui os RENDERERS do PDI e reaproveita os helpers globais
// (pdiApi, pdiAcao, pdiModal, pdiLbl, pdiSel, PDI_*, pdiData, pdiRing, pdiBar, pdiHealthBadge...) e os
// eventos data-pdi-* já ligados no attach(). Eventos novos usam data-pdx-* com delegação no documento.
(function(){
  const AMBAR = "#673DE6", VERM = "#C0341C", VERDE = "#0F7A68", AZUL = "#4A6CF7", CINZA = "#66666F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const BTN_PRI = "display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;background:" + AMBAR + ";color:#FFFFFF;font:inherit;font-size:13px;font-weight:700;border:0;cursor:pointer";
  const BTN_SEC = "display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const BTN_MINI = "display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid #DADADF;border-radius:8px;font:inherit;font-size:12px;background:#FFFFFF;color:#17171A;cursor:pointer;white-space:nowrap";
  const FORMATS = { projeto: ["Projeto prático", '<path d="M5 19l4-4M14 4l6 6-8 8H6v-6z"/>'], curso: ["Curso", '<path d="M3 8l9-4 9 4-9 4z"/><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5"/>'], leitura: ["Leitura", '<path d="M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>'], mentoria: ["Mentoria", '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 11a3 3 0 0 0 0-6"/>'], checkin: ["Check-in", '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4"/>'], outro: ["Outro", '<path d="M12 5h.01M12 12h.01M12 19h.01" stroke-width="2.6" stroke-linecap="round"/>'] };
  const AST = { pendente: ["Pendente", CINZA, "#F4F4F6"], em_andamento: ["Em andamento", AZUL, "rgba(74,108,247,0.10)"], validacao: ["Aguardando validação", "#9A6700", "rgba(154,103,0,0.12)"], concluida: ["Concluída", VERDE, "rgba(15,122,104,0.10)"], atrasada: ["Atrasada", VERM, "rgba(192,52,28,0.08)"] };
  const CAD = { semanal: "Check-in semanal", quinzenal: "Check-in quinzenal", mensal: "Check-in mensal" };
  const MESES = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  const dataCurta = d => { if(!d) return ""; const [y, m, dd] = d.split("-"); return `${dd} de ${MESES[+m - 1]}`; };
  const dataHora = ts => { const d = new Date(ts); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
  const hojeIso = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  function px(){ if(!state.pdx) state.pdx = { exp: {}, expAll: null, histOpen: false, tab: "todos" }; return state.pdx; }
  function toast(msg, erro){
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:90;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;color:#FFFFFF;background:${erro ? VERM : "#17171A"};box-shadow:0 10px 30px rgba(23,23,26,0.25)`;
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), erro ? 5000 : 2600);
  }
  const me = () => (state.pdiData && state.pdiData.me) || "";
  // Repinta a tela atual (o render() global só repinta quando os dados do PDI mudam; expandir/recolher é estado local)
  function repaint(){ const slot = document.getElementById("main-slot"); if(slot && RENDERERS[state.screen]){ slot.innerHTML = RENDERERS[state.screen](); if(typeof attach === "function") attach(); } }
  const atual = () => state.pdiDetail && !state.pdiDetail._error ? state.pdiDetail : null;
  const chipFmt = f => { const x = FORMATS[f] || FORMATS.outro; return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#4A4A52;border:1px solid #E6E6EA;padding:2px 8px;border-radius:6px;background:#FFFFFF">${icon(x[1], 11, "currentColor")}${x[0]}</span>`; };
  const chipSt = (st, small) => { const x = AST[st] || AST.pendente; return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:${small ? 10 : 10.5}px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${x[1]};background:${x[2]};padding:3px 9px;border-radius:20px;white-space:nowrap">${st === "concluida" ? icon(ICONS.check, 10, "currentColor") : ""}${x[0]}</span>`; };
  const stBadge = p => p.status === "ativo" ? `<span style="font-size:11px;font-weight:600;color:${VERDE};background:rgba(15,122,104,0.10);padding:3px 9px;border-radius:20px">Ativo</span>` : p.status === "pausado" ? `<span style="font-size:11px;font-weight:600;color:${CINZA};background:#F1F1F3;padding:3px 9px;border-radius:20px">Pausado</span>` : p.status === "concluido" ? `<span style="font-size:11px;font-weight:600;color:${VERDE};background:rgba(15,122,104,0.10);padding:3px 9px;border-radius:20px">Concluído</span>` : p.status === "rascunho" ? `<span style="font-size:11px;font-weight:600;color:${AMBAR};background:rgba(103,61,230,0.10);padding:3px 9px;border-radius:20px">Rascunho</span>` : `<span style="font-size:11px;font-weight:600;color:${AZUL};background:rgba(74,108,247,0.10);padding:3px 9px;border-radius:20px">Solicitado</span>`;
  const tile = (ic, val, rot, cor) => `<div style="${PDI_BOX};padding:16px 18px;display:flex;flex-direction:column;gap:10px;min-width:0"><span style="width:30px;height:30px;border-radius:9px;background:${cor ? cor + "1A" : "rgba(103,61,230,0.12)"};color:${cor || AMBAR};display:flex;align-items:center;justify-content:center">${icon(ic, 15, "currentColor")}</span><div><div style="${HEAD};font-size:24px;font-weight:600;line-height:1.1;color:${cor || "#17171A"}">${val}</div><div style="font-size:10.5px;letter-spacing:.08em;font-weight:700;color:${CINZA};margin-top:5px;text-transform:uppercase">${rot}</div></div></div>`;
  const avatar = (n, s) => `<span style="width:${s}px;height:${s}px;flex:0 0 ${s}px;border-radius:50%;background:rgba(103,61,230,0.14);color:${AMBAR};font-size:${Math.round(s / 2.9)}px;font-weight:700;display:flex;align-items:center;justify-content:center">${e(pdiIniciais(n))}</span>`;

  // ─── Detalhe (Meu PDI e PDI de alguém) ──────────────────────────────────────
  function acaoLinha(a, p, mine){
    const st = a.overdue && a.status !== "concluida" && a.status !== "validacao" ? "atrasada" : a.status;
    const done = a.status === "concluida";
    const gestor = p.isManager && !mine;
    let link = "";
    if(done) link = `<span data-pdx-act="${e(a.id)}" data-st="pendente" style="font-size:12px;color:${CINZA};cursor:pointer">Reabrir</span>`;
    else if(a.status === "validacao") link = gestor || p.isMe && !p.manager ? `<span data-pdx-act="${e(a.id)}" data-st="concluida" style="font-size:12px;font-weight:700;color:${VERDE};cursor:pointer">Validar</span><span data-pdx-act="${e(a.id)}" data-st="em_andamento" style="font-size:12px;color:${CINZA};cursor:pointer">Devolver</span>` : `<span style="font-size:12px;color:#9A9AA3">Esperando ${e(p.manager || "o gestor")}</span>`;
    else link = `${a.status === "pendente" ? `<span data-pdx-act="${e(a.id)}" data-st="em_andamento" style="font-size:12px;color:${CINZA};cursor:pointer">Iniciar</span>` : ""}<span data-pdx-act="${e(a.id)}" data-st="concluida" style="font-size:12px;font-weight:700;color:#17171A;cursor:pointer">Concluir</span>`;
    return `<div style="display:flex;flex-direction:column;gap:6px;padding:11px 14px;border:1px solid ${done ? "#EFEFF1" : "#E6E6EA"};border-radius:12px;background:${done ? "#FAFAFA" : "#FFFFFF"}">
      <div style="display:flex;align-items:center;gap:10px">
        <span data-pdx-act="${e(a.id)}" data-st="${done ? "pendente" : "concluida"}" title="${done ? "Reabrir" : "Concluir"}" style="width:20px;height:20px;flex:0 0 20px;border-radius:50%;border:1.5px solid ${done ? VERDE : a.status === "validacao" ? "#9A6700" : "#B4B4BC"};background:${done ? "rgba(15,122,104,0.10)" : "#FFFFFF"};display:flex;align-items:center;justify-content:center;cursor:pointer;color:${VERDE}">${done ? icon(ICONS.check, 11, "currentColor") : a.status === "validacao" ? `<span style="width:8px;height:8px;border-radius:50%;background:#9A6700"></span>` : ""}</span>
        <span style="flex:1;min-width:0;font-size:13.5px;${done ? "color:#9A9AA3;text-decoration:line-through" : ""}">${e(a.title)}</span>
        ${chipSt(st)}
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-left:30px;font-size:11.5px;color:${CINZA}">
        ${chipFmt(a.format)}<span>${a.dueDate ? "prazo " + dataCurta(a.dueDate) : "sem prazo"}</span><span>· ${e(p.person)}</span>
        <span style="margin-left:auto;display:flex;gap:12px;align-items:center">${link}<span data-pdx-evid-for="${e(a.id)}" title="Anexar evidência" style="cursor:pointer;color:${CINZA};display:flex">${icon(ICONS.attach, 13, "currentColor")}</span><span data-pdi-act-del="${e(a.id)}" title="Excluir ação" style="cursor:pointer;opacity:.45;display:flex">${icon(ICONS.x, 12, "currentColor")}</span></span>
      </div>
      ${a.note ? `<div style="padding-left:30px;font-size:12px;color:#4A4A52">${e(a.note)}</div>` : ""}
    </div>`;
  }
  function metaBloco(g, p, mine, aberto){
    const st = PDI_GOAL_ST[g.status] || PDI_GOAL_ST.nao_iniciada;
    return `<div style="${PDI_BOX};padding:0;overflow:hidden">
      <div data-pdx-exp="${e(g.id)}" style="display:flex;align-items:center;gap:12px;padding:16px 18px;cursor:pointer">
        <span style="width:22px;height:22px;flex:0 0 22px;display:flex;align-items:center;justify-content:center;color:${CINZA};transform:rotate(${aberto ? 90 : 0}deg);transition:transform .2s">${icon(ICONS.chevRight, 13)}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:14.5px;font-weight:600">${e(g.title)}</span>${g.competency ? `<span style="${AG_TAG};text-transform:uppercase;letter-spacing:.06em;font-size:10px">${e(g.competency)}</span>` : ""}${g.status === "atrasada" ? `<span style="font-size:10.5px;font-weight:700;color:${VERM}">ATRASADA</span>` : ""}</div>
          <div style="display:flex;gap:10px;font-size:11.5px;color:${CINZA};margin-top:4px;flex-wrap:wrap"><span style="display:flex;align-items:center;gap:4px">${icon(ICONS.clock, 11, "currentColor")}${g.dueDate ? dataCurta(g.dueDate) : "sem prazo"}</span><span>· ${g.actionsTotal ? `${g.actionsDone} de ${g.actionsTotal} ações concluídas` : "progresso manual"}</span></div>
        </div>
        <span style="width:110px;display:flex;align-items:center;gap:8px"><span style="flex:1">${pdiBar(g.progress)}</span><strong style="font-size:12.5px;width:34px;text-align:right">${g.progress}%</strong></span>
        <span data-pdi-goal-edit="${e(g.id)}" data-hover title="Editar meta" style="width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.edit, 13, CINZA)}</span>
        <span data-pdi-goal-del="${e(g.id)}" data-hover title="Excluir meta" style="width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.trash, 13, CINZA)}</span>
      </div>
      ${aberto ? `<div style="padding:0 18px 16px 18px;border-top:1px solid #F1F1F3">
        ${g.successCriteria ? `<div style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#4A4A52;padding:12px 0 10px">${icon('<path d="M5 4v16M5 4h11l-2 4 2 4H5"/>', 13, AMBAR)}<strong>Indicador de sucesso:</strong> ${e(g.successCriteria)}</div>` : `<div style="height:12px"></div>`}
        ${g.description ? `<div style="font-size:12.5px;color:#4A4A52;margin-bottom:10px;line-height:1.5">${e(g.description)}</div>` : ""}
        ${!g.actions.length ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span style="font-size:12px;color:${CINZA}">Progresso manual</span><input data-pdi-goal-prog="${e(g.id)}" type="range" min="0" max="100" step="5" value="${g.manualProgress}" style="flex:1;accent-color:${AMBAR}"></div>` : ""}
        <div style="display:flex;flex-direction:column;gap:8px">${g.actions.map(a => acaoLinha(a, p, mine)).join("")}</div>
        <form data-pdi-act-add="${e(g.id)}" style="display:flex;gap:8px;margin:10px 0 0;flex-wrap:wrap">
          <input name="title" placeholder="Nova ação (ex: acompanhar 3 reuniões de um sênior)" style="${PDI_IN};flex:1 1 240px;padding:8px 11px;font-size:12.5px">
          <select name="format" style="${PDI_IN};width:auto;padding:8px 10px;font-size:12.5px">${Object.keys(FORMATS).map(k => `<option value="${k}">${FORMATS[k][0]}</option>`).join("")}</select>
          <select name="kind" style="${PDI_IN};width:auto;padding:8px 10px;font-size:12.5px">${Object.keys(PDI_KINDS).map(k => `<option value="${k}">${PDI_KINDS[k][0]}</option>`).join("")}</select>
          <input name="dueDate" type="date" style="${PDI_IN};width:auto;padding:7px 10px;font-size:12.5px">
          <button type="submit" style="${BTN_MINI};padding:8px 13px">Adicionar</button>
        </form>
      </div>` : ""}
    </div>`;
  }
  function evidLinha(x, p, mine){
    const cor = x.status === "validada" ? VERDE : x.status === "recusada" ? VERM : "#9A6700";
    const rot = x.status === "validada" ? "Validada" : x.status === "recusada" ? "Recusada" : "Aguardando validação";
    const podeValidar = (p.isManager && !mine) || (p.isMe && !p.manager);
    return `<div style="display:flex;gap:12px;padding:11px 14px;border:1px solid #E6E6EA;border-radius:12px;align-items:flex-start">
      <span style="width:30px;height:30px;flex:0 0 30px;border-radius:9px;background:${cor}14;color:${cor};display:flex;align-items:center;justify-content:center">${icon(ICONS.file, 14, "currentColor")}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:13.5px;font-weight:600">${x.url ? `<a href="${e(x.url)}" target="_blank" rel="noopener" style="color:#17171A">${e(x.title)}</a>` : e(x.title)}</span><span style="font-size:10.5px;font-weight:700;color:${cor};background:${cor}14;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.04em">${rot}</span></div>
        <div style="font-size:11.5px;color:${CINZA};margin-top:3px">${x.action ? "Ação: " + e(x.action) + " · " : ""}${e(x.author)} · ${dataHora(x.createdAt)}${x.reviewedBy ? ` · revisado por ${e(x.reviewedBy)}` : ""}</div>
        ${x.note ? `<div style="font-size:12.5px;color:#3C3C44;margin-top:5px;line-height:1.5">${e(x.note)}</div>` : ""}
      </div>
      <span style="display:flex;gap:6px;align-items:center">
        ${x.status === "pendente" && podeValidar ? `<span data-pdx-evid="${e(x.id)}" data-st="validada" style="${BTN_MINI};color:${VERDE};border-color:rgba(15,122,104,0.4)">${icon(ICONS.check, 11, "currentColor")}Validar</span><span data-pdx-evid="${e(x.id)}" data-st="recusada" style="${BTN_MINI};color:${VERM}">Recusar</span>` : ""}
        ${x.status !== "pendente" && podeValidar ? `<span data-pdx-evid="${e(x.id)}" data-st="pendente" style="${BTN_MINI}">Reabrir</span>` : ""}
        <span data-pdx-evid-del="${e(x.id)}" title="Excluir" style="cursor:pointer;opacity:.45;display:flex">${icon(ICONS.x, 12, "currentColor")}</span>
      </span>
    </div>`;
  }
  function compBarra(c){
    const seg = i => { const cheio = i < c.levelFrom, meta = i < c.levelTo, ganho = i < Math.round(c.current); return `<span style="flex:1;height:6px;border-radius:3px;background:${cheio ? AMBAR : ganho ? "#A78BFA" : meta ? "rgba(103,61,230,0.22)" : "#EFEFF1"}"></span>`; };
    return `<div data-pdx-comp="${e(c.id)}" style="cursor:pointer" title="Editar competência">
      <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:6px"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(c.name)}</span><span style="font-size:11.5px;color:${CINZA}">nível ${c.levelFrom} → ${c.levelTo}${c.goals ? "" : " · sem meta ligada"}</span></div>
      <div style="display:flex;gap:4px">${[0, 1, 2, 3, 4].map(seg).join("")}</div>
    </div>`;
  }
  function detalhe(p, mine){
    const x = px();
    const goals = p.goals || [];
    const acts = goals.flatMap(g => g.actions);
    const abertoDe = g => x.expAll !== null ? x.expAll : (x.exp[g.id] !== undefined ? x.exp[g.id] : g.status !== "concluida");
    const todosAbertos = goals.every(abertoDe);
    const podeGerir = p.isManager || (p.isMe && !p.manager);
    const kebab = `<div style="position:relative" data-team-card>
      <span data-pdi-kebab data-hover title="Mais opções" style="width:40px;height:40px;border-radius:10px;border:1px solid #DADADF;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#FFFFFF">${icon(ICONS.ellip, 18, CINZA)}</span>
      <div data-team-pop="pdi" hidden style="position:absolute;right:0;top:46px;min-width:230px;padding:6px;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;box-shadow:0 16px 40px rgba(23,23,26,0.16);display:flex;flex-direction:column;gap:2px;z-index:40">
        <div data-pdi-edit data-hover style="${AG_MENU_ITEM}">${icon(ICONS.edit, 15, "currentColor")}<span>Editar dados do PDI</span></div>
        <div data-pdi-zeus data-hover style="${AG_MENU_ITEM}">${icon(ICONS.sparkle, 15, "currentColor")}<span>Analisar com o ZEUS</span></div>
        ${p.status === "rascunho" || p.status === "solicitado" ? `<div data-pdi-status="ativo" data-hover style="${AG_MENU_ITEM}">${icon(ICONS.play, 15, "currentColor")}<span>Ativar PDI</span></div>` : ""}
        ${p.status === "concluido" ? `<div data-pdi-status="ativo" data-hover style="${AG_MENU_ITEM}">${icon(ICONS.refresh, 15, "currentColor")}<span>Reabrir PDI</span></div>` : ""}
        ${p.status === "pausado" ? `<div data-pdi-status="ativo" data-hover style="${AG_MENU_ITEM}">${icon(ICONS.play, 15, "currentColor")}<span>Retomar PDI</span></div>` : ""}
        <div data-pdi-save-tpl data-hover style="${AG_MENU_ITEM}">${icon(ICONS.copy, 15, "currentColor")}<span>Salvar como template</span></div>
        <div style="height:1px;background:#E6E6EA;margin:4px 2px"></div>
        <div data-pdi-del data-hover style="${AG_MENU_ITEM};color:${VERM}">${icon(ICONS.trash, 15, "currentColor")}<span>Excluir PDI</span></div>
      </div></div>`;
    const botoes = mine
      ? `<span data-pdx-progresso style="${BTN_PRI}">${icon(ICONS.spark, 14, "currentColor")}Atualizar progresso</span>
         <span data-pdx-evid-new style="${BTN_SEC}">${icon(ICONS.attach, 14, "currentColor")}Adicionar evidência</span>
         <span data-pdx-feedback style="${BTN_SEC}">${icon(ICONS.chatBubble, 14, "currentColor")}Solicitar feedback</span>${kebab}`
      : `${p.status === "ativo" ? `<span data-pdi-status="pausado" style="${BTN_SEC}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5v14M16 5v14"/></svg>Pausar</span>` : p.status === "pausado" ? `<span data-pdi-status="ativo" style="${BTN_SEC}">${icon(ICONS.play, 14, "currentColor")}Retomar</span>` : ""}
         ${p.status !== "concluido" ? `<span data-pdi-status="concluido" style="${BTN_SEC}">${icon(ICONS.check, 14, "currentColor")}Concluir PDI</span>` : ""}
         <span data-pdi-checkin style="${BTN_PRI}">${icon(ICONS.plus, 14, "currentColor")}Registrar check-in</span>${kebab}`;
    return `<div style="padding:30px 40px 70px;max-width:1240px">
      ${mine ? "" : `<span data-go="pdiEquipe" data-hover-border style="display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;cursor:pointer;margin-bottom:18px">${icon(ICONS.chevLeft, 13)}PDIs da equipe</span>`}
      <div style="${PDI_EYE};margin-bottom:7px">${mine ? "PDI · MEU PDI" : "PDI · PDIS DA EQUIPE"}</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;margin-bottom:20px">
        ${mine ? "" : avatar(p.person, 46)}
        <div style="flex:1;min-width:260px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h1 style="${HEAD};font-size:25px;font-weight:600;margin:0">${e(p.title)}</h1>${stBadge(p)}${p.status === "ativo" ? pdiHealthBadge(p.health) : ""}</div>
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;color:${CINZA};font-size:13px;margin-top:6px">
            ${mine ? (p.summary ? e(p.summary.split("\n")[0]) : `${e(p.role || "")}${p.targetRole ? " → " + e(p.targetRole) : ""}`) : `<span>${e(p.person)}</span>${p.role ? `<span>·</span><span>${e(p.role)}${p.targetRole ? " → " + e(p.targetRole) : ""}</span>` : ""}${p.team ? `<span>·</span><span>${e(p.team)}</span>` : ""}`}
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${botoes}</div>
      </div>
      ${p.status === "solicitado" ? `<div style="display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border:1px solid rgba(74,108,247,0.3);border-radius:14px;background:rgba(74,108,247,0.05);margin-bottom:16px"><span style="color:${AZUL};display:flex;margin-top:1px">${icon(ICONS.chatBubble, 16, "currentColor")}</span><div style="flex:1"><div style="font-size:13.5px;font-weight:600;margin-bottom:3px">${e(p.person)} pediu um PDI${p.manager ? " para " + e(p.manager) : ""}</div><div style="font-size:13px;color:#3C3C44;line-height:1.55;white-space:pre-wrap">${e(p.summary || "Sem mensagem.")}</div><div style="font-size:12px;color:${CINZA};margin-top:6px">Adicione os objetivos abaixo e use o menu ⋮ para ativar o plano.</div></div></div>` : ""}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px">
        ${tile(ICONS.spark, p.progress + "%", "Progresso geral")}
        ${tile(ICONS.chart, p.daysLeft === null ? "—" : p.daysLeft, "Dias restantes", p.daysLeft !== null && p.daysLeft < 15 && p.progress < 100 ? VERM : null)}
        ${tile(ICONS.okrs, p.goalsActive, "Objetivos em curso")}
        ${tile(ICONS.warn, p.overdueActions, "Ações atrasadas", p.overdueActions ? VERM : null)}
        ${tile(ICONS.shield, p.awaitingValidation, "Aguard. validação", p.awaitingValidation ? "#9A6700" : null)}
        ${tile(ICONS.check, p.goalsDone, "Concluídas", VERDE)}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start">
        <div style="flex:1 1 560px;min-width:0;display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <h2 style="${PDI_H3};font-size:16px">Objetivos</h2><span style="font-size:12px;color:${CINZA};background:#F1F1F3;padding:1px 8px;border-radius:10px">${goals.length}</span>
            <span style="flex:1"></span>
            ${goals.length ? `<span data-pdx-expall="${todosAbertos ? 0 : 1}" style="font-size:12px;font-weight:600;color:${AMBAR};cursor:pointer">${todosAbertos ? "Recolher todos" : "Expandir todos"}</span>` : ""}
            <span data-pdi-goal-add style="${BTN_MINI}">${icon(ICONS.plus, 12, "currentColor")}Novo objetivo</span>
          </div>
          ${goals.length ? goals.map(g => metaBloco(g, p, mine, abertoDe(g))).join("") : `<div style="padding:30px;border:1px dashed #DADADF;border-radius:14px;color:${CINZA};font-size:13px;text-align:center">Nenhum objetivo ainda. Adicione o primeiro ou crie o PDI a partir de um template.</div>`}
          <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
            <h2 style="${PDI_H3};font-size:16px">Evidências</h2><span style="font-size:12px;color:${CINZA};background:#F1F1F3;padding:1px 8px;border-radius:10px">${(p.evidences || []).length}</span>
            <span style="flex:1"></span><span data-pdx-evid-new style="${BTN_MINI}">${icon(ICONS.attach, 12, "currentColor")}Adicionar evidência</span>
          </div>
          ${(p.evidences || []).length ? `<div style="display:flex;flex-direction:column;gap:8px">${p.evidences.map(x => evidLinha(x, p, mine)).join("")}</div>` : `<div style="padding:18px;border:1px dashed #DADADF;border-radius:14px;color:${CINZA};font-size:12.5px;text-align:center">Nenhuma evidência. Anexe links, documentos ou entregas para o gestor validar.</div>`}
        </div>
        <div style="flex:1 1 300px;min-width:0;max-width:380px;display:flex;flex-direction:column;gap:14px">
          <div style="${PDI_BOX}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">${stBadge(p)}<span style="flex:1"></span>${p.status === "ativo" ? pdiHealthBadge(p.health) : ""}</div>
            <div style="display:flex;justify-content:center;margin-bottom:12px">${pdiRing(p.progress, 118)}</div>
            ${[["Período", `${dataCurta(p.cycleStart)} – ${dataCurta(p.cycleEnd)}`], ["Dias restantes", p.daysLeft === null ? "—" : p.daysLeft + " dias"], ["Cargo", `${e(p.role || "—")}${p.targetRole ? " → " + e(p.targetRole) : ""}`], [mine ? "Gestor" : "Gestor", e(p.manager || "Sem gestor definido")], ["Cadência", CAD[p.cadence] || "Quinzenal"], ["Próximo check-in", p.nextCheckin ? `<strong style="color:${p.nextCheckin < hojeIso() ? VERM : AMBAR}">${dataCurta(p.nextCheckin)}</strong>` : "—"], p.expected !== null ? ["Esperado pelo tempo", p.expected + "%"] : null].filter(Boolean).map(r => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:5px 0;border-top:1px solid #F4F4F6"><span style="color:${CINZA}">${r[0]}</span><span style="text-align:right">${r[1]}</span></div>`).join("")}
          </div>
          <div style="${PDI_BOX}">
            <div style="display:flex;align-items:center;margin-bottom:12px"><h3 style="${PDI_H3};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${CINZA}">Competências</h3><span data-pdx-comp-new style="margin-left:auto;font-size:12px;font-weight:600;color:${AMBAR};cursor:pointer">+ Adicionar</span></div>
            ${(p.competencies || []).length ? `<div style="display:flex;flex-direction:column;gap:12px">${p.competencies.map(compBarra).join("")}</div>` : `<div style="font-size:12.5px;color:${CINZA}">Sem competências. Elas são criadas a partir das metas ou à mão.</div>`}
          </div>
          <div style="${PDI_BOX}">
            <div style="display:flex;align-items:center;margin-bottom:12px"><h3 style="${PDI_H3};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${CINZA}">Check-ins</h3><span data-pdi-checkin style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:${AMBAR};cursor:pointer">${icon(ICONS.edit, 12, "currentColor")}Registrar</span></div>
            ${(p.checkins || []).length ? `<div style="display:flex;flex-direction:column">${p.checkins.slice(0, 6).map((c, i) => `<div style="display:flex;gap:10px;padding-bottom:12px;position:relative">
              <span style="width:10px;flex:0 0 10px;display:flex;flex-direction:column;align-items:center"><span style="width:9px;height:9px;border-radius:50%;background:${i ? "#DADADF" : AMBAR};margin-top:5px"></span>${i < Math.min(p.checkins.length, 6) - 1 ? `<span style="flex:1;width:2px;background:#EFEFF1;margin-top:4px"></span>` : ""}</span>
              <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><strong style="font-size:12px">${c.author === me() ? "Você" : e(c.author || "—")}</strong><span style="font-size:11.5px;color:#9A9AA3">· ${dataCurta(c.date)}</span>${c.mood ? pdiMoodDots(c.mood) : ""}<span data-pdi-ck-del="${e(c.id)}" title="Excluir check-in" style="margin-left:auto;cursor:pointer;opacity:.4;display:flex">${icon(ICONS.x, 11, "currentColor")}</span></div><div style="font-size:12.5px;color:#3C3C44;line-height:1.5;margin-top:2px;white-space:pre-wrap">${e(c.note)}</div></div></div>`).join("")}</div>` : `<div style="font-size:12.5px;color:${CINZA};line-height:1.5">Nenhum check-in ainda.</div>`}
          </div>
          <div style="${PDI_BOX}">
            <div style="display:flex;align-items:center;margin-bottom:12px"><h3 style="${PDI_H3};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${CINZA}">Feedback</h3><span data-pdx-feedback style="margin-left:auto;font-size:12px;font-weight:600;color:${AMBAR};cursor:pointer">+ Solicitar</span></div>
            ${(p.feedback || []).length ? `<div style="display:flex;flex-direction:column;gap:10px">${p.feedback.slice(0, 5).map(f => `<div style="padding:10px 12px;border:1px solid #E6E6EA;border-radius:10px;font-size:12.5px">
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px"><strong>${f.from === me() ? "Você" : e(f.from)}</strong><span style="color:#9A9AA3;font-size:11.5px">pediu a ${e(f.to || "—")} · ${dataHora(f.createdAt)}</span><span data-pdx-fb-del="${e(f.id)}" style="margin-left:auto;cursor:pointer;opacity:.4;display:flex">${icon(ICONS.x, 11, "currentColor")}</span></div>
              <div style="color:#3C3C44;line-height:1.5;white-space:pre-wrap">${e(f.message)}</div>
              ${f.reply ? `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(103,61,230,0.06);color:#3C3C44;line-height:1.5;white-space:pre-wrap"><strong style="color:${AMBAR}">Resposta</strong> · ${dataHora(f.repliedAt)}<br>${e(f.reply)}</div>` : podeGerir || !mine ? `<span data-pdx-fb-reply="${e(f.id)}" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:600;color:${AMBAR};cursor:pointer">Responder</span>` : `<div style="margin-top:6px;font-size:11.5px;color:#9A9AA3">Aguardando resposta</div>`}
            </div>`).join("")}</div>` : `<div style="font-size:12.5px;color:${CINZA};line-height:1.5">Nenhum pedido de feedback.</div>`}
          </div>
          <div style="${PDI_BOX}">
            <div data-pdx-hist style="display:flex;align-items:center;cursor:pointer"><h3 style="${PDI_H3};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${CINZA}">Histórico</h3><span style="margin-left:auto;color:${CINZA};display:flex;transform:rotate(${x.histOpen ? 90 : 0}deg);transition:transform .2s">${icon(ICONS.chevRight, 13)}</span></div>
            ${x.histOpen ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">${(p.history || []).length ? p.history.map(h => `<div style="font-size:12px;line-height:1.45"><span style="color:#9A9AA3">${dataHora(h.at)} · ${e(h.who)}</span><br>${e(h.detail)}</div>`).join("") : `<div style="font-size:12.5px;color:${CINZA}">Sem registros.</div>`}</div>` : ""}
          </div>
        </div>
      </div>
    </div>`;
  }

  // ─── PDIs da equipe (cockpit) ────────────────────────────────────────────────
  const KIND_ICO = { validacao: [ICONS.shield, "#9A6700"], feedback: [ICONS.chatBubble, AZUL], solicitado: [ICONS.chatBubble, AZUL], rascunho: [ICONS.edit, AMBAR], atraso: [ICONS.warn, VERM], checkin: [ICONS.clock, "#9A6700"], sem_pdi: [ICONS.users, CINZA] };
  function equipe(){
    const d = state.pdiData; if(!d) return `<div style="padding:40px;color:${CINZA}">${state.pdiError ? e(state.pdiError) : "Carregando PDIs..."}</div>`;
    const f = pdiFiltro(); const itens = d.cockpit || [];
    const cont = h => d.pdis.filter(p => p.health === h).length;
    const chip = h => { const x = PDI_HEALTH[h]; const on = f.health === h; return `<span data-pdi-fh="${h}" style="display:flex;align-items:center;gap:8px;padding:8px 13px;border-radius:12px;border:1px solid ${on ? x[1] : "#E6E6EA"};background:${on ? x[2] : "#FFFFFF"};cursor:pointer"><span style="color:${x[1]};display:flex">${icon(x[3], 14, "currentColor")}</span><span style="font-size:12.5px">${x[0]}</span><strong style="${HEAD};font-size:15px">${cont(h)}</strong></span>`; };
    return `<div style="padding:30px 40px 60px;max-width:1240px">
      <div style="${PDI_EYE};margin-bottom:7px">PDI · PDIS DA EQUIPE</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;margin-bottom:20px">
        <div style="flex:1;min-width:260px"><h1 style="${HEAD};font-size:26px;font-weight:600;margin:0 0 6px">PDIs da equipe</h1>
          <p style="margin:0;color:${CINZA}">Cockpit de acompanhamento: saúde da equipe, gargalos de desenvolvimento e o que precisa de você.</p></div>
        <span data-go="pdiNovo" style="${BTN_PRI};padding:11px 16px">${icon(ICONS.plus, 14, "currentColor")}Criar PDI</span>
      </div>
      <div style="${PDI_BOX};padding:0;overflow:hidden;margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:10px;padding:16px 20px"><h2 style="${PDI_H3};font-size:16px">Precisa da sua ação</h2><span style="font-size:12px;font-weight:700;color:${itens.length ? VERM : VERDE};background:${itens.length ? "rgba(192,52,28,0.08)" : "rgba(15,122,104,0.10)"};padding:2px 9px;border-radius:10px">${itens.length}</span></div>
        ${itens.length ? itens.map(it => { const ic = KIND_ICO[it.kind] || KIND_ICO.checkin; const cor = it.kind === "sem_pdi" ? CINZA : it.kind === "validacao" || it.kind === "checkin" ? "#9A6700" : it.kind === "atraso" ? VERM : it.kind === "feedback" || it.kind === "solicitado" ? AZUL : AMBAR;
          return `<div style="display:flex;align-items:center;gap:14px;padding:12px 20px;border-top:1px solid #F1F1F3">
            <span style="width:32px;height:32px;flex:0 0 32px;border-radius:9px;background:${ic[1]}14;color:${ic[1]};display:flex;align-items:center;justify-content:center">${icon(ic[0], 15, "currentColor")}</span>
            <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">${e(it.person)}${it.role ? `<span style="font-weight:400;color:${CINZA}"> · ${e(it.role)}</span>` : ""}</div><div style="font-size:12px;color:${cor};margin-top:2px">${e(it.text)}</div></div>
            ${it.pdiId ? `<span data-pdi-open="${e(it.pdiId)}" style="${BTN_MINI};padding:7px 13px">${e(it.cta)}</span>` : `<span data-pdx-criar="${e(it.person)}" data-role="${e(it.role || "")}" style="${BTN_MINI};padding:7px 13px">${e(it.cta)}</span>`}
          </div>`; }).join("") : `<div style="padding:8px 20px 18px;font-size:12.5px;color:${CINZA}">Nada pendente: validações, feedbacks e prazos estão em dia.</div>`}
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><h2 style="${PDI_H3};font-size:16px">Todos os PDIs</h2><span style="font-size:12px;color:${CINZA}">${d.pdis.length}</span><span style="flex:1"></span><span data-go="pdiEvolucao" style="font-size:12.5px;font-weight:600;color:${AMBAR};cursor:pointer">Analisar evolução →</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">${["em_dia", "atencao", "atrasado", "solicitado", "rascunho", "concluido"].map(chip).join("")}</div>
      <label style="position:relative;display:block;max-width:340px;margin-bottom:12px">
        <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);display:flex">${icon(ICONS.search, 14, "#9A9AA3")}</span>
        <input data-pdi-q value="${e(f.q)}" placeholder="Buscar pessoa ou cargo" style="width:100%;padding:9px 12px 9px 34px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13px;background:#FFFFFF;outline:none">
      </label>
      <div style="border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;overflow-x:auto"><div style="min-width:900px">
        <div style="display:grid;grid-template-columns:minmax(200px,2fr) minmax(150px,1.2fr) minmax(170px,1.6fr) 80px 120px 110px;gap:14px;padding:11px 18px;font-size:11px;letter-spacing:0.08em;font-weight:700;color:${CINZA};background:#FAFAFA">
          <span>PESSOA</span><span>CICLO</span><span title="A marca escura é o progresso esperado pelo tempo do ciclo">PROGRESSO · ESPERADO</span><span>METAS</span><span>ÚLTIMO CHECK-IN</span><span>SAÚDE</span></div>
        <div id="pdi-linhas">${pdiEquipeLinhasHTML()}</div>
      </div></div>
    </div>`;
  }

  // ─── Templates ──────────────────────────────────────────────────────────────
  function templates(){
    const tpls = state.pdiTpls; if(!tpls) return `<div style="padding:40px;color:${CINZA}">Carregando templates...</div>`;
    return `<div style="padding:30px 40px 60px;max-width:1240px">
      <span data-go="pdiEquipe" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:${CINZA};cursor:pointer;margin-bottom:16px">${icon(ICONS.arrowLeft, 13, "currentColor")}PDIs da equipe</span>
      <div style="${PDI_EYE};margin-bottom:7px">PDI · TEMPLATES DE PDI</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;margin-bottom:22px">
        <div style="flex:1;min-width:260px"><h1 style="${HEAD};font-size:26px;font-weight:600;margin:0 0 6px">Templates de PDI</h1>
          <p style="margin:0;color:${CINZA};max-width:560px;line-height:1.5">Moldes por função ou área com competências, ações e trilhas sugeridas. Partem de um ponto pronto, o gestor ajusta pra cada pessoa.</p></div>
        <span data-pdi-tpl-new style="${BTN_PRI};padding:11px 16px">${icon(ICONS.plus, 14, "currentColor")}Novo template</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:16px">
        ${tpls.map(t => `<div class="cat-card" data-team-card style="position:relative;border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:20px;display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span style="width:34px;height:34px;border-radius:10px;background:rgba(103,61,230,0.12);color:${AMBAR};display:flex;align-items:center;justify-content:center">${icon(ICONS.table, 16, "currentColor")}</span>
            <span style="flex:1"></span>
            <span data-pdx-tpl-menu data-hover title="Mais opções" style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.ellip, 16, CINZA)}</span>
            <div data-team-pop="tpl" hidden style="position:absolute;right:16px;top:52px;min-width:200px;padding:6px;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;box-shadow:0 16px 40px rgba(23,23,26,0.16);display:flex;flex-direction:column;gap:2px;z-index:40">
              <div data-pdi-tpl-view="${e(t.id)}" data-hover style="${AG_MENU_ITEM}">${icon(ICONS.search, 14, "currentColor")}<span>Ver metas e ações</span></div>
              <div data-pdi-tpl-dup="${e(t.id)}" data-hover style="${AG_MENU_ITEM}">${icon(ICONS.copy, 14, "currentColor")}<span>Duplicar</span></div>
              ${t.builtin ? "" : `<div data-pdi-tpl-edit="${e(t.id)}" data-hover style="${AG_MENU_ITEM}">${icon(ICONS.edit, 14, "currentColor")}<span>Editar</span></div><div style="height:1px;background:#E6E6EA;margin:4px 2px"></div><div data-pdi-tpl-del="${e(t.id)}" data-hover style="${AG_MENU_ITEM};color:${VERM}">${icon(ICONS.trash, 14, "currentColor")}<span>Excluir</span></div>`}
            </div>
          </div>
          <div style="${HEAD};font-size:16px;font-weight:600;margin-top:4px">${e(t.name)}</div>
          <p style="margin:0;font-size:12.5px;color:${CINZA};line-height:1.5">${e(t.description || "Sem descrição.")}</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${[t.roleHint].concat(t.tags || []).filter(Boolean).map(x => `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#4A4A52;background:#F4F4F6;padding:3px 9px;border-radius:20px">${icon(ICONS.users, 10, "currentColor")}${e(x)}</span>`).join("")}${t.builtin ? `<span style="${AG_KIND};font-size:10.5px">Pronto ZEUS</span>` : ""}</div>
          <div style="border-top:1px solid #F1F1F3;padding-top:10px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#4A4A52;flex:1">
            <span>${t.competencies.length} competência${t.competencies.length === 1 ? "" : "s"} · ${t.actionsCount} açõe${t.actionsCount === 1 ? "" : "s"}</span>
            ${t.trail ? `<span style="display:flex;align-items:center;gap:6px">${icon(ICONS.trilhas, 12, CINZA)}${e(t.trail)}</span>` : ""}
            <span style="color:${CINZA}">Usado em ${t.usedIn} PDI${t.usedIn === 1 ? "" : "s"}</span>
          </div>
          <span data-pdi-tpl-use="${e(t.id)}" style="${BTN_PRI};justify-content:center;padding:10px 14px;font-size:12.5px;margin-top:4px">${icon(ICONS.sparkle, 13, "currentColor")}Usar template</span>
        </div>`).join("")}
      </div>
    </div>`;
  }

  // ─── Novo PDI ───────────────────────────────────────────────────────────────
  function novo(){
    if(!state.pdiData || !state.pdiTpls) return `<div style="padding:40px;color:${CINZA}">Carregando...</div>`;
    const nv = state.pdiNovo || (state.pdiNovo = { person: "", templateId: "" });
    const tplSel = (state.pdiTpls || []).find(t => t.id === nv.templateId);
    const hoje = hojeIso();
    const fim = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    const pessoas = state.pdiData.people || [];
    const membro = (state.pdiData.members || []).find(m => m.name === nv.person);
    const tplCard = (id, nome, desc, meta) => { const on = (nv.templateId || "") === id; return `<label data-pdi-tpl-pick="${e(id)}" style="display:flex;gap:11px;padding:13px 14px;border:1px solid ${on ? "rgba(103,61,230,0.55)" : "#E6E6EA"};background:${on ? "rgba(103,61,230,0.06)" : "#FFFFFF"};border-radius:12px;cursor:pointer">
      <input type="radio" name="templateId" value="${e(id)}" ${on ? "checked" : ""} style="accent-color:${AMBAR};margin-top:2px">
      <span><span style="display:block;font-size:13.5px;font-weight:600">${e(nome)}</span><span style="display:block;font-size:12px;color:${CINZA};margin-top:2px;line-height:1.45">${e(desc)}</span>${meta ? `<span style="display:block;font-size:11.5px;color:${AMBAR};margin-top:5px">${meta}</span>` : ""}</span></label>`; };
    return `<div style="padding:30px 40px 60px;max-width:1000px">
      <span data-go="pdiEquipe" data-hover-border style="display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;cursor:pointer;margin-bottom:18px">${icon(ICONS.chevLeft, 13)}PDIs da equipe</span>
      <div style="${PDI_EYE};margin-bottom:7px">PDI · NOVO</div>
      <h1 style="${HEAD};font-size:26px;font-weight:600;margin:0 0 20px">Novo Plano de Desenvolvimento</h1>
      <form data-pdi-novo-form style="display:flex;flex-direction:column;gap:16px;margin:0">
        <div style="${PDI_BOX};display:flex;flex-direction:column;gap:14px">
          <h3 style="${PDI_H3}">Pessoa e plano</h3>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div style="flex:1 1 240px">${pdiLbl("De quem é o PDI")}<input name="person" required list="pdi-pessoas" value="${e(nv.person)}" placeholder="Nome da pessoa" style="${PDI_IN}"><datalist id="pdi-pessoas">${pessoas.map(n => `<option value="${e(n)}">`).join("")}</datalist></div>
            <div style="flex:1 1 200px">${pdiLbl("Cargo atual")}<input name="role" value="${e(nv.role || (membro ? membro.role : "") || "")}" placeholder="Ex: SDR" style="${PDI_IN}"></div>
            <div style="flex:1 1 200px">${pdiLbl("Cargo alvo", "onde quer chegar")}<input name="targetRole" value="${e(nv.targetRole || "")}" placeholder="Ex: Closer" style="${PDI_IN}"></div>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div style="flex:2 1 260px">${pdiLbl("Nome do plano")}<input name="title" value="${e(nv.title || (tplSel ? tplSel.name : ""))}" placeholder="Ex: Head Comercial de alta performance" style="${PDI_IN}"></div>
            <div style="flex:1 1 200px">${pdiLbl("Gestor")}<input name="manager" list="pdi-pessoas" value="${e(nv.manager || state.pdiData.me)}" style="${PDI_IN}"></div>
            <div style="flex:1 1 160px">${pdiLbl("Time")}<input name="team" value="${e(nv.team || (membro ? membro.area : "") || "")}" placeholder="Ex: Time de Vendas" style="${PDI_IN}"></div>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div style="flex:1 1 160px">${pdiLbl("Início do ciclo")}<input name="cycleStart" type="date" value="${hoje}" style="${PDI_IN}"></div>
            <div style="flex:1 1 160px">${pdiLbl("Fim do ciclo")}<input name="cycleEnd" type="date" value="${fim}" style="${PDI_IN}"></div>
            <div style="flex:1 1 160px">${pdiLbl("Cadência de check-in")}${pdiSel("cadence", "quinzenal", [["semanal", "Semanal"], ["quinzenal", "Quinzenal"], ["mensal", "Mensal"]])}</div>
            <div style="flex:1 1 160px">${pdiLbl("Status")}${pdiSel("status", "ativo", [["ativo", "Ativo"], ["rascunho", "Rascunho"]])}</div>
          </div>
          <div>${pdiLbl("Resumo do plano", "opcional")}<input name="summary" value="${e(nv.summary || "")}" placeholder="Ex: Fortalecer visão estratégica e gestão de pessoas." style="${PDI_IN}"></div>
        </div>
        <div style="${PDI_BOX}">
          <h3 style="${PDI_H3};margin-bottom:4px">Começar a partir de</h3>
          <p style="margin:0 0 14px;font-size:12.5px;color:${CINZA}">O template cria os objetivos, ações e competências já com prazos distribuídos no ciclo. Tudo pode ser editado depois.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
            ${tplCard("", "Em branco", "Comece sem objetivos e monte do zero.", "")}
            ${state.pdiTpls.map(t => tplCard(t.id, t.name, t.description, `${t.goalsCount} objetivos · ${t.actionsCount} ações${t.roleHint ? " · " + e(t.roleHint) : ""}`)).join("")}
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px">
          <span data-go="pdiEquipe" data-hover-border style="padding:11px 16px;border:1px solid #DADADF;border-radius:10px;font-size:13px;cursor:pointer">Cancelar</span>
          <button type="submit" style="${BTN_PRI};padding:11px 18px">${icon(ICONS.check, 14, "currentColor")}Criar PDI</button>
        </div>
      </form>
    </div>`;
  }

  // ─── Modais novos ───────────────────────────────────────────────────────────
  function modalProgresso(p){
    const acts = (p.goals || []).flatMap(g => g.actions.filter(a => a.status !== "concluida").map(a => Object.assign({ goal: g.title }, a)));
    const semAcao = (p.goals || []).filter(g => !g.actions.length && g.status !== "concluida");
    if(!acts.length && !semAcao.length) return toast("Tudo concluído por aqui. Adicione novas ações aos objetivos.");
    const opts = a => ["pendente", "em_andamento", "concluida"].map(s => `<option value="${s}" ${a.status === s ? "selected" : ""}>${s === "concluida" ? (p.isMe && p.manager ? "Concluída (vai para validação)" : "Concluída") : AST[s][0]}</option>`).join("") + (a.status === "validacao" ? `<option value="validacao" selected>Aguardando validação</option>` : "");
    pdiModal({ title: "Atualizar progresso", sub: "Marque o status de cada ação. Concluir uma ação com gestor definido a envia para validação.", width: 640, submit: "Salvar progresso",
      body: `${acts.length ? `<div style="display:flex;flex-direction:column;gap:8px">${acts.map(a => `<div data-pg-act="${e(a.id)}" style="display:grid;grid-template-columns:1fr 200px;gap:10px;align-items:center;padding:10px 12px;border:1px solid #E6E6EA;border-radius:10px"><span style="min-width:0"><span style="display:block;font-size:13px;font-weight:600">${e(a.title)}</span><span style="display:block;font-size:11.5px;color:${CINZA}">${e(a.goal)} · ${FORMATS[a.format] ? FORMATS[a.format][0] : ""}${a.dueDate ? " · prazo " + dataCurta(a.dueDate) : ""}</span></span><select style="${PDI_IN};padding:8px 10px;font-size:12.5px">${opts(a)}</select></div>`).join("")}</div>` : ""}
        ${semAcao.length ? `<div style="font-size:12.5px;font-weight:600;margin-top:4px">Objetivos sem ações (progresso manual)</div><div style="display:flex;flex-direction:column;gap:8px">${semAcao.map(g => `<div data-pg-goal="${e(g.id)}" style="display:grid;grid-template-columns:1fr 160px 40px;gap:10px;align-items:center;padding:10px 12px;border:1px solid #E6E6EA;border-radius:10px"><span style="font-size:13px;font-weight:600">${e(g.title)}</span><input type="range" min="0" max="100" step="5" value="${g.manualProgress}" style="accent-color:${AMBAR}" oninput="this.nextElementSibling.textContent=this.value+'%'"><strong style="font-size:12px;text-align:right">${g.manualProgress}%</strong></div>`).join("")}</div>` : ""}`,
      onSubmit: async (_d, m) => {
        const actions = [...m.querySelectorAll("[data-pg-act]")].map(r => ({ id: r.dataset.pgAct, status: r.querySelector("select").value }));
        const goals = [...m.querySelectorAll("[data-pg-goal]")].map(r => ({ id: r.dataset.pgGoal, progress: r.querySelector("input").value }));
        const j = await pdiAcao("/" + encodeURIComponent(p.id) + "/progress", "POST", { actions, goals, who: me() });
        if(!j) return false; toast(j.updated ? `${j.updated} atualizaç${j.updated === 1 ? "ão" : "ões"} registrada${j.updated === 1 ? "" : "s"}.` : "Nada mudou.");
      } });
  }
  function modalEvidencia(p, actionId){
    const acts = (p.goals || []).flatMap(g => g.actions.map(a => Object.assign({ goal: g.title }, a)));
    pdiModal({ title: "Adicionar evidência", sub: "Link, documento ou descrição do que foi entregue. O gestor valida e a ação ligada é concluída.", submit: "Adicionar",
      body: `<div>${pdiLbl("Título")}<input name="title" required placeholder="Ex: Dashboard executivo publicado" style="${PDI_IN}"></div>
        <div>${pdiLbl("Link", "opcional")}<input name="url" type="url" placeholder="https://" style="${PDI_IN}"></div>
        <div>${pdiLbl("Ação relacionada", "opcional")}${pdiSel("actionId", actionId || "", [["", "Nenhuma"]].concat(acts.map(a => [a.id, (a.status === "concluida" ? "✓ " : "") + a.title + " · " + a.goal])))}</div>
        <div>${pdiLbl("O que foi feito", "opcional")}<textarea name="note" rows="3" style="${PDI_IN};resize:vertical"></textarea></div>`,
      onSubmit: async d => { const j = await pdiAcao("/" + encodeURIComponent(p.id) + "/evidences", "POST", Object.assign({ author: me() }, d)); if(!j) return false; toast("Evidência adicionada."); } });
  }
  function modalFeedback(p){
    pdiModal({ title: "Solicitar feedback", sub: "O pedido aparece no PDI e em \"Precisa da sua ação\" de quem for responder.", submit: "Enviar pedido",
      body: `<div>${pdiLbl("Para quem")}<input name="to" list="pdx-pessoas" value="${e(p.manager || "")}" placeholder="Nome" style="${PDI_IN}"><datalist id="pdx-pessoas">${((state.pdiData && state.pdiData.people) || []).map(n => `<option value="${e(n)}">`).join("")}</datalist></div>
        <div>${pdiLbl("Sobre o quê")}<textarea name="message" required rows="5" placeholder="Ex: como você avalia minha condução das reuniões de liderança neste mês? O que eu deveria ajustar?" style="${PDI_IN};resize:vertical;line-height:1.5"></textarea></div>`,
      onSubmit: async d => { const j = await pdiAcao("/" + encodeURIComponent(p.id) + "/feedback", "POST", Object.assign({ from: me() }, d)); if(!j) return false; toast("Pedido de feedback enviado."); } });
  }
  function modalResposta(p, f){
    pdiModal({ title: "Responder feedback", sub: e(f.message), submit: "Responder",
      body: `<div>${pdiLbl("Sua resposta")}<textarea name="reply" required rows="6" placeholder="Seja específico: o que está indo bem, o que ajustar e um próximo passo." style="${PDI_IN};resize:vertical;line-height:1.5"></textarea></div>`,
      onSubmit: async d => { const j = await pdiAcao("/feedback/" + encodeURIComponent(f.id), "PATCH", Object.assign({ who: me() }, d)); if(!j) return false; toast("Feedback respondido."); } });
  }
  function modalCompetencia(p, c){
    const niv = (name, val) => pdiSel(name, val, [1, 2, 3, 4, 5].map(n => [n, "Nível " + n]));
    pdiModal({ title: c ? "Editar competência" : "Nova competência", sub: "Nível de 1 a 5. O nível atual é estimado pelo progresso dos objetivos com a mesma competência.", submit: c ? "Salvar" : "Adicionar",
      extra: c ? `<span data-pdx-comp-del="${e(c.id)}" style="${BTN_SEC};color:${VERM}">${icon(ICONS.trash, 13, "currentColor")}Excluir</span>` : "",
      body: `<div>${pdiLbl("Competência")}<input name="name" required value="${e(c ? c.name : "")}" placeholder="Ex: Liderança" style="${PDI_IN}"></div>
        <div style="display:flex;gap:12px"><div style="flex:1">${pdiLbl("Nível atual")}${niv("levelFrom", c ? c.levelFrom : 3)}</div><div style="flex:1">${pdiLbl("Nível alvo")}${niv("levelTo", c ? c.levelTo : 5)}</div></div>`,
      onClick: async ev => { const d = ev.target.closest("[data-pdx-comp-del]"); if(d && confirm("Excluir esta competência?")){ pdiModalClose(); await pdiAcao("/competencies/" + encodeURIComponent(d.dataset.pdxCompDel), "DELETE"); } },
      onSubmit: async d => !!(await pdiAcao(c ? "/competencies/" + encodeURIComponent(c.id) : "/" + encodeURIComponent(p.id) + "/competencies", c ? "PATCH" : "POST", d)) || false });
  }

  // ─── Eventos novos (delegação no documento) ─────────────────────────────────
  document.addEventListener("click", async ev => {
    const t = ev.target, q = s => t.closest && t.closest(s); let el;
    if(!q("[data-pdx-exp],[data-pdx-expall],[data-pdx-act],[data-pdx-evid],[data-pdx-evid-del],[data-pdx-evid-new],[data-pdx-evid-for],[data-pdx-progresso],[data-pdx-feedback],[data-pdx-fb-reply],[data-pdx-fb-del],[data-pdx-comp],[data-pdx-comp-new],[data-pdx-hist],[data-pdx-criar],[data-pdx-tpl-menu]")) return;
    const p = atual();
    if((el = q("[data-pdx-tpl-menu]"))){ ev.stopPropagation(); cardMenuToggle(null, el); return; }
    if((el = q("[data-pdx-criar]"))){ ev.stopPropagation(); state.pdiNovo = { person: el.dataset.pdxCriar, role: el.dataset.role || "", templateId: "" }; setState({ screen: "pdiNovo" }); return; }
    if((el = q("[data-pdx-exp]"))){ if(q("[data-pdi-goal-edit],[data-pdi-goal-del]")) return; ev.stopPropagation(); const x = px(); const g = p && p.goals.find(y => y.id === el.dataset.pdxExp); const aberto = x.expAll !== null ? x.expAll : (x.exp[el.dataset.pdxExp] !== undefined ? x.exp[el.dataset.pdxExp] : (g ? g.status !== "concluida" : true)); if(x.expAll !== null){ (p ? p.goals : []).forEach(y => { x.exp[y.id] = x.expAll; }); x.expAll = null; } x.exp[el.dataset.pdxExp] = !aberto; repaint(); return; }
    if((el = q("[data-pdx-expall]"))){ ev.stopPropagation(); px().expAll = el.dataset.pdxExpall === "1"; repaint(); return; }
    if((el = q("[data-pdx-hist]"))){ ev.stopPropagation(); px().histOpen = !px().histOpen; repaint(); return; }
    if(!p) return;
    if((el = q("[data-pdx-act]"))){ ev.stopPropagation(); const j = await pdiAcao("/actions/" + encodeURIComponent(el.dataset.pdxAct), "PATCH", { status: el.dataset.st, who: me() }); if(j && el.dataset.st === "concluida"){ const a = (j.pdi.goals || []).flatMap(g => g.actions).find(y => y.id === el.dataset.pdxAct); toast(a && a.status === "validacao" ? "Ação concluída: aguardando validação do gestor." : "Ação concluída."); } return; }
    if((el = q("[data-pdx-evid]"))){ ev.stopPropagation(); const j = await pdiAcao("/evidences/" + encodeURIComponent(el.dataset.pdxEvid), "PATCH", { status: el.dataset.st, who: me() }); if(j) toast(el.dataset.st === "validada" ? "Evidência validada." : el.dataset.st === "recusada" ? "Evidência recusada." : "Evidência reaberta."); return; }
    if((el = q("[data-pdx-evid-del]"))){ ev.stopPropagation(); if(confirm("Excluir esta evidência?")) pdiAcao("/evidences/" + encodeURIComponent(el.dataset.pdxEvidDel), "DELETE"); return; }
    if((el = q("[data-pdx-evid-for]"))){ ev.stopPropagation(); return modalEvidencia(p, el.dataset.pdxEvidFor); }
    if(q("[data-pdx-evid-new]")){ ev.stopPropagation(); return modalEvidencia(p, ""); }
    if(q("[data-pdx-progresso]")){ ev.stopPropagation(); return modalProgresso(p); }
    if(q("[data-pdx-feedback]")){ ev.stopPropagation(); return modalFeedback(p); }
    if((el = q("[data-pdx-fb-reply]"))){ ev.stopPropagation(); const f = (p.feedback || []).find(y => y.id === el.dataset.pdxFbReply); if(f) modalResposta(p, f); return; }
    if((el = q("[data-pdx-fb-del]"))){ ev.stopPropagation(); if(confirm("Excluir este pedido de feedback?")) pdiAcao("/feedback/" + encodeURIComponent(el.dataset.pdxFbDel), "DELETE"); return; }
    if(q("[data-pdx-comp-new]")){ ev.stopPropagation(); return modalCompetencia(p, null); }
    if((el = q("[data-pdx-comp]"))){ ev.stopPropagation(); const c = (p.competencies || []).find(y => y.id === el.dataset.pdxComp); if(c) modalCompetencia(p, c); return; }
  });

  // ─── plug na Central ────────────────────────────────────────────────────────
  RENDERERS.pdi = function(){
    if(!state.pdiData) return `<div style="padding:40px;color:${CINZA}">${state.pdiError ? e(state.pdiError) : "Carregando seu PDI..."}</div>`;
    const at = pdiMeuAtual();
    if(!at) return pdiVazioHTML(state.pdiData.pdis.find(p => p.isMe && p.status === "solicitado") || null);
    const d = state.pdiDetail;
    if(!d || d.id !== at.id) return `<div style="padding:40px;color:${CINZA}">Carregando seu PDI...</div>`;
    if(d._error) return `<div style="padding:40px;color:${VERM}">${e(d._error)}</div>`;
    return detalhe(d, true);
  };
  RENDERERS.pdiVer = function(){
    const d = state.pdiDetail;
    if(!d || d.id !== state.pdiId) return `<div style="padding:40px;color:${CINZA}">Carregando PDI...</div>`;
    if(d._error) return `<div style="padding:40px"><span data-go="pdiEquipe" data-hover-border style="display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;cursor:pointer;margin-bottom:18px">${icon(ICONS.chevLeft, 13)}PDIs da equipe</span><p style="color:${CINZA}">${e(d._error)}</p></div>`;
    return detalhe(d, d.isMe);
  };
  RENDERERS.pdiEquipe = equipe;
  RENDERERS.pdiTemplates = templates;
  RENDERERS.pdiNovo = novo;
  // Trocou de PDI: volta ao estado padrão de expansão
  let _ultimoId = null;
  const _render = window.render;
  window.render = function(){ const id = state.pdiDetail && state.pdiDetail.id; if(id !== _ultimoId){ _ultimoId = id; if(state.pdx){ state.pdx.exp = {}; state.pdx.expAll = null; state.pdx.histOpen = false; } } return _render.apply(this, arguments); };
  if(["pdi", "pdiVer", "pdiEquipe", "pdiTemplates", "pdiNovo"].indexOf(state.screen) >= 0){ const slot = document.getElementById("main-slot"); if(slot){ slot.innerHTML = RENDERERS[state.screen](); if(typeof attach === "function") attach(); } }
})();
