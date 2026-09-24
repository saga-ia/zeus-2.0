// Ações: tela /acoes ligada ao ClickUp de verdade (substitui a maquete estática de renderAcoes).
// Carregado depois do script principal: usa state, render, icon, ICONS, e (escape), bindOnce e RENDERERS de lá.
// Backend: /api/clickup (clickup.js), que lê o token do app_settings do worker.
(function(){
  const AMBAR = "#673DE6", VERM = "#C0341C", VERDE = "#0F7A68", CINZA = "#66666F", AZUL = "#2459C9";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:10px 12px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none";
  const SEL = IN + ";appearance:auto";
  const BTN_PRI = "padding:10px 18px;border-radius:10px;background:" + AMBAR + ";color:#FFFFFF;font:inherit;font-size:13px;font-weight:700;border:0;cursor:pointer";
  const BTN_SEC = "padding:10px 16px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const PRIOS = [["", "Sem prioridade"], ["1", "Urgente"], ["2", "Alta"], ["3", "Normal"], ["4", "Baixa"]];
  const PRIO_COLOR = { 1: VERM, 2: AMBAR, 3: AZUL, 4: CINZA };
  const PALETA = ["#673DE6", "#C25FD6", "#4A6CF7", "#2B1E8C", "#A78BFA", "#8B5CF6"];
  const ICO_LINK = '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>';
  const ICO_SUB = '<path d="M6 4v10a2 2 0 0 0 2 2h10"/><path d="M14 12l4 4-4 4"/>';
  const ICO_MSG = '<path d="M4 5h16v11H8l-4 4z"/>';
  const GRID = "grid-template-columns:30px minmax(240px,2.4fr) 1.15fr 1fr 0.8fr 0.9fr 34px";

  // ─── estado ─────────────────────────────────────────────────────────────────
  function ac(){
    if(!state.acoes) state.acoes = { view: { type: "all" }, q: "", fAssignee: "", fPrio: "", fStatus: "", showClosed: false, groupBy: "status", collapsed: {}, data: null, loading: false, error: null };
    return state.acoes;
  }
  // Repintar a tela inteira a cada clique perdia foco, scroll e piscava tudo.
  // Agora cada mudança repinta só o pedaço que ela realmente afeta.
  const CHAVES_FILTRO = ["q", "fAssignee", "fPrio", "fStatus", "groupBy", "showClosed"];
  function acSet(patch){
    const mudouView = patch.view !== undefined;
    const mudouFiltro = CHAVES_FILTRO.some(k => patch[k] !== undefined);
    Object.assign(ac(), patch);
    if(mudouView){ paintSide(); paintHead(); paintFiltros(); }
    if(mudouView || mudouFiltro) paintLista();
    if(!mudouView && !mudouFiltro) paint();
  }

  async function apiJ(url, method, body){
    const r = await fetch("/api/clickup" + url, { method: method || "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }

  let _loading = false;
  // Impressão digital dos dados: numa atualização automática só repinta se algo mudou de verdade.
  function assinatura(d){
    if(!d) return "";
    return d.tasks.map(t => [t.id, t.status, t.due_date, t.priority, t.date_updated, t.name, t.assignees.map(u => u.id).join(",")].join("|")).join(";")
      + "#" + d.members.length + "#" + d.spaces.length;
  }
  async function load(force, silent){
    if(_loading) return;
    _loading = true;
    const a = ac();
    const antes = assinatura(a.data);
    if(!silent){ a.loading = true; paintSync(); paintLista(); }
    try { a.data = await apiJ("/overview" + (force ? "?force=1" : "")); a.error = null; }
    catch(err){ a.error = err.message; }
    a.loading = false; _loading = false;
    if(!document.getElementById("acoes-root")) return;
    if(silent && assinatura(a.data) === antes) paintSync();
    else paint();
  }

  // ─── helpers ────────────────────────────────────────────────────────────────
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  const firstName = u => cap((u.username || "").trim().split(/\s+/)[0] || "?");
  const isOpen = t => t.status_type !== "closed";
  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const DIA = 86400000;
  function fimSemana(){ const d = new Date(); d.setHours(0, 0, 0, 0); const dow = (d.getDay() + 6) % 7; return d.getTime() + (7 - dow) * DIA; }
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  function fmtDue(ms, comHora){
    if(!ms) return "";
    const d = new Date(ms), agora = new Date();
    let s = d.getDate() + " " + MESES[d.getMonth()];
    if(d.getFullYear() !== agora.getFullYear()) s += " " + d.getFullYear();
    if(comHora) s += " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    return s;
  }
  function dueInfo(t){
    if(!t.due_date) return { label: "Sem prazo", color: "#9A9AA3", peso: 0 };
    const h0 = hoje0();
    if(!isOpen(t)) return { label: fmtDue(t.due_date, t.due_date_time), color: "#9A9AA3", peso: 0 };
    const ref = t.due_date_time ? Date.now() : h0;
    if(t.due_date < ref) return { label: fmtDue(t.due_date, t.due_date_time), color: VERM, peso: 2, tag: "atrasada" };
    if(t.due_date < h0 + DIA) return { label: "Hoje" + (t.due_date_time ? " " + fmtDue(t.due_date, true).split(" ").pop() : ""), color: AMBAR, peso: 1 };
    if(t.due_date < h0 + 2 * DIA) return { label: "Amanhã" + (t.due_date_time ? " " + fmtDue(t.due_date, true).split(" ").pop() : ""), color: "#3C3C44", peso: 0 };
    return { label: fmtDue(t.due_date, t.due_date_time), color: "#3C3C44", peso: 0 };
  }
  function fmtRel(ms){
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if(s < 5) return "agora";
    if(s < 60) return "há " + s + "s";
    if(s < 3600) return "há " + Math.round(s / 60) + " min";
    if(s < 86400) return "há " + Math.round(s / 3600) + " h";
    return "há " + Math.round(s / 86400) + " d";
  }
  function fmtData(ms){ if(!ms) return ""; const d = new Date(ms); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function toLocalInput(ms){ if(!ms) return ""; const d = new Date(ms); const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); }
  function fromLocalInput(s){ if(!s) return null; const ms = new Date(s).getTime(); return isFinite(ms) ? ms : null; }
  const corDe = u => u.color || PALETA[Number(u.id || 0) % PALETA.length];
  function avatar(u, size){
    size = size || 22;
    const tit = e(u.username || "");
    if(u.avatar) return `<img src="${e(u.avatar)}" title="${tit}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex:0 0 ${size}px">`;
    return `<span title="${tit}" style="width:${size}px;height:${size}px;flex:0 0 ${size}px;border-radius:50%;background:${corDe(u)};font-size:${Math.round(size * 0.4)}px;font-weight:700;color:#FFFFFF;display:flex;align-items:center;justify-content:center">${e(u.initials || "?")}</span>`;
  }

  // Estrutura: listas achatadas e status disponíveis por lista/space
  function listas(){
    const d = ac().data; if(!d) return [];
    const out = [];
    d.spaces.forEach(sp => {
      sp.folders.forEach(f => f.lists.forEach(l => out.push(Object.assign({ space_name: sp.name }, l))));
      sp.lists.forEach(l => out.push(Object.assign({ space_name: sp.name }, l)));
    });
    return out;
  }
  function statusesDe(t){
    const d = ac().data; if(!d) return [];
    const l = t.list && listas().find(x => x.id === t.list.id);
    if(l && l.statuses && l.statuses.length) return l.statuses;
    const sp = t.space && d.spaces.find(s => s.id === t.space.id);
    if(sp && sp.statuses.length) return sp.statuses;
    return t.status ? [{ status: t.status, type: t.status_type, color: t.status_color }] : [];
  }
  function statusesDaLista(listId){
    const d = ac().data; if(!d) return [];
    const l = listas().find(x => x.id === listId);
    if(!l) return [];
    if(l.statuses && l.statuses.length) return l.statuses;
    const sp = d.spaces.find(s => s.id === l.space_id);
    return sp ? sp.statuses : [];
  }
  const tipoPeso = tp => tp === "closed" ? 3 : tp === "done" ? 2 : tp === "open" ? 0 : 1;
  // Ordem global de status: abertos, personalizados, concluídos
  function ordemStatus(){
    const d = ac().data, m = {}; if(!d) return m;
    let i = 0;
    d.spaces.forEach(sp => sp.statuses.forEach(st => { const k = norm(st.status); if(!m[k]) m[k] = { name: st.status, color: st.color, type: st.type, ord: tipoPeso(st.type) * 1000 + (i++) }; }));
    listas().forEach(l => (l.statuses || []).forEach(st => { const k = norm(st.status); if(!m[k]) m[k] = { name: st.status, color: st.color, type: st.type, ord: tipoPeso(st.type) * 1000 + (i++) }; }));
    return m;
  }

  // ─── filtro ─────────────────────────────────────────────────────────────────
  function filtrar(){
    const a = ac(), d = a.data; if(!d) return [];
    const v = a.view, h0 = hoje0(), fs = fimSemana(), agora = Date.now();
    return d.tasks.filter(t => {
      if(v.type === "space" && !(t.space && t.space.id === v.id)) return false;
      if(v.type === "folder" && !(t.folder && t.folder.id === v.id)) return false;
      if(v.type === "list" && !(t.list && t.list.id === v.id)) return false;
      if(v.type === "assignee" && !t.assignees.some(u => String(u.id) === String(v.id))) return false;
      if(v.type === "unassigned" && t.assignees.length) return false;
      if(v.type === "overdue" && !(isOpen(t) && t.due_date && t.due_date < (t.due_date_time ? agora : h0))) return false;
      if(v.type === "today" && !(isOpen(t) && t.due_date && t.due_date < h0 + DIA)) return false;
      if(v.type === "week" && !(isOpen(t) && t.due_date && t.due_date < fs)) return false;
      if(v.type === "closed"){ if(isOpen(t)) return false; }
      else if(!a.showClosed && !isOpen(t)) return false;
      if(a.fAssignee === "none" ? t.assignees.length : (a.fAssignee && !t.assignees.some(u => String(u.id) === a.fAssignee))) return false;
      if(a.fPrio && String(t.priority || "") !== a.fPrio) return false;
      if(a.fStatus && norm(t.status) !== a.fStatus) return false;
      if(a.q){ const q = norm(a.q); if(!norm(t.name).includes(q) && !t.tags.some(g => norm(g.name).includes(q)) && !(t.list && norm(t.list.name).includes(q))) return false; }
      return true;
    });
  }
  function ordenar(ts){
    return ts.slice().sort((x, y) => {
      const dx = dueInfo(x).peso, dy = dueInfo(y).peso;
      if(dx !== dy) return dy - dx;
      const ax = x.due_date || Infinity, ay = y.due_date || Infinity;
      if(ax !== ay) return ax - ay;
      const px = x.priority || 9, py = y.priority || 9;
      if(px !== py) return px - py;
      return (y.date_updated || 0) - (x.date_updated || 0);
    });
  }
  function agrupar(ts){
    const a = ac(), grupos = {};
    if(a.groupBy === "list"){
      ts.forEach(t => {
        const k = (t.list && t.list.id) || "_";
        if(!grupos[k]) grupos[k] = { key: k, name: [t.space && t.space.name, t.folder && t.folder.name, t.list && t.list.name].filter(Boolean).join(" › ") || "Sem lista", color: AMBAR, items: [], ord: 0 };
        grupos[k].items.push(t);
      });
      return Object.values(grupos).sort((x, y) => x.name.localeCompare(y.name));
    }
    const ord = ordemStatus();
    ts.forEach(t => {
      const k = norm(t.status || "sem status");
      if(!grupos[k]) grupos[k] = { key: k, name: cap(t.status || "Sem status"), color: t.status_color || "#87909e", items: [], ord: ord[k] ? ord[k].ord : (tipoPeso(t.status_type) * 1000 + 999) };
      grupos[k].items.push(t);
    });
    return Object.values(grupos).sort((x, y) => x.ord - y.ord);
  }
  function tituloView(){
    const a = ac(), d = a.data, v = a.view;
    if(v.type === "painel") return ["Painel de entregas", "Qualidade e produtividade das entregas da equipe."];
    if(v.type === "all") return ["Todas as ações", "Todas as ações da equipe, agrupadas por " + (a.groupBy === "list" ? "lista" : "status") + "."];
    if(v.type === "assignee"){ const u = d && d.members.find(m => String(m.id) === String(v.id)); return ["Ações de " + (u ? firstName(u) : "?"), "Ações abertas atribuídas a " + (u ? u.username : "?") + "."]; }
    if(v.type === "unassigned") return ["Sem responsável", "Ações abertas que ainda não têm ninguém atribuído."];
    if(v.type === "overdue") return ["Atrasadas", "Ações abertas com prazo vencido."];
    if(v.type === "today") return ["Para hoje", "Ações abertas com prazo até o fim de hoje (inclui atrasadas)."];
    if(v.type === "week") return ["Esta semana", "Ações abertas com prazo até domingo (inclui atrasadas)."];
    if(v.type === "closed") return ["Concluídas", "Ações já finalizadas."];
    if(v.type === "space"){ const sp = d && d.spaces.find(s => s.id === v.id); return [sp ? sp.name : "Space", "Todas as ações deste space."]; }
    if(v.type === "folder"){ let f = null, sp = null; d && d.spaces.forEach(s => s.folders.forEach(x => { if(x.id === v.id){ f = x; sp = s; } })); return [f ? f.name : "Pasta", sp ? sp.name + " › " + f.name : ""]; }
    if(v.type === "list"){ const l = listas().find(x => x.id === v.id); return [l ? l.name : "Lista", l ? [l.space_name, l.folder_name, l.name].filter(Boolean).join(" › ") : ""]; }
    return ["Ações", ""];
  }

  // ─── Painel de entregas: qualidade e produtividade das entregas da equipe ──────
  const PER = [["hoje", "Hoje"], ["semana", "Semana"], ["mes", "Mês"]];
  const PTABS = [["geral", "Visão geral", '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'],
    ["pessoa", "Por pessoa", '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2.2.2 3.8 1.8 4.5 4.5"/>'],
    ["ciclos", "Ciclos", '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>'],
    ["carga", "Carga semanal", '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>']];
  const VALIDACAO = /valid|aprova|revis|review|homolog|confer|qa\b/;
  const fechouEm = t => t.date_done || t.date_closed || 0;
  function iniPeriodo(p){
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if(p === "semana") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if(p === "mes") d.setDate(1);
    return d.getTime();
  }
  // prazo "no dia" (sem hora) vale até o fim do dia
  const limitePrazo = t => t.due_date ? (t.due_date_time ? t.due_date : (() => { const d = new Date(t.due_date); d.setHours(23, 59, 59, 999); return d.getTime(); })()) : 0;
  function fmtDur(ms){ const m = Math.round((ms || 0) / 60000); if(!m) return "0m"; const h = Math.floor(m / 60); return h ? h + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + "m"; }
  function fmtDias(ms){ const d = ms / DIA; return d < 1 ? Math.max(1, Math.round(ms / 3600000)) + "h" : d.toFixed(d < 10 ? 1 : 0).replace(".", ",") + " d"; }
  function stats(ts, ini){
    const criadas = ts.filter(t => t.date_created >= ini);
    const concl = ts.filter(t => !isOpen(t) && fechouEm(t) >= ini);
    const comPrazo = concl.filter(t => t.due_date);
    const noPrazo = comPrazo.filter(t => fechouEm(t) <= limitePrazo(t));
    const temPontos = ts.some(t => t.points != null);
    return { criadas, concl, comPrazo, noPrazo, temPontos,
      pontos: concl.reduce((s, t) => s + (t.points || 0), 0),
      validacao: ts.filter(t => isOpen(t) && VALIDACAO.test(norm(t.status))),
      tempo: concl.reduce((s, t) => s + (t.time_spent || 0), 0) };
  }
  const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
  const kpi = (rot, val, sub, cor) => `<div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;padding:16px 18px;min-width:0"><div style="font-size:12.5px;color:${CINZA};margin-bottom:8px">${rot}</div><div style="${HEAD};font-size:26px;font-weight:600;color:${cor || "#17171A"}">${val}</div>${sub ? `<div style="font-size:11.5px;color:#9A9AA3;margin-top:5px">${sub}</div>` : ""}</div>`;
  const cardP = (tit, corpo, dir) => `<div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;overflow:hidden;margin-top:16px"><div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #F1F1F3"><strong style="font-size:13.5px;font-weight:600;flex:1">${tit}</strong>${dir || ""}</div><div style="padding:16px 18px">${corpo}</div></div>`;
  function graficoDias(ts, ini, per){
    const dias = []; const d0 = new Date(ini); const hoje = hoje0();
    const inicio = per === "hoje" ? hoje - 6 * DIA : ini; // "Hoje" mostra a última semana para dar contexto
    for(let t = new Date(inicio).setHours(0, 0, 0, 0); t <= hoje; t += DIA) dias.push(t);
    const cri = dias.map(t => ts.filter(x => x.date_created >= t && x.date_created < t + DIA).length);
    const con = dias.map(t => ts.filter(x => !isOpen(x) && fechouEm(x) >= t && fechouEm(x) < t + DIA).length);
    const max = Math.max(1, ...cri, ...con), W = 720, H = 190, x0 = 30, y1 = 160, passo = (W - x0 - 10) / dias.length, bw = Math.max(3, Math.min(16, passo * 0.34));
    const Y = v => y1 - v / max * 140;
    const bars = dias.map((t, i) => { const cx = x0 + passo * (i + 0.5); const dt = new Date(t); const rot = String(dt.getDate()).padStart(2, "0") + "/" + String(dt.getMonth() + 1).padStart(2, "0");
      return `<rect x="${(cx - bw - 1).toFixed(1)}" y="${Y(cri[i]).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y1 - Y(cri[i])).toFixed(1)}" rx="2" fill="${AMBAR}" opacity="0.35"><title>${rot}: ${cri[i]} criada(s)</title></rect><rect x="${(cx + 1).toFixed(1)}" y="${Y(con[i]).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y1 - Y(con[i])).toFixed(1)}" rx="2" fill="${VERDE}"><title>${rot}: ${con[i]} concluída(s)</title></rect>${dias.length <= 14 || i % Math.ceil(dias.length / 10) === 0 ? `<text x="${cx.toFixed(1)}" y="178" text-anchor="middle" fill="${CINZA}">${rot}</text>` : ""}`; }).join("");
    const grade = [0, 0.5, 1].map(f => `<line x1="${x0}" x2="${W - 10}" y1="${Y(max * f)}" y2="${Y(max * f)}" stroke="#F1F1F3"/><text x="${x0 - 6}" y="${Y(max * f) + 3}" text-anchor="end" fill="${CINZA}">${Math.round(max * f)}</text>`).join("");
    return `<div style="display:flex;gap:14px;font-size:12px;color:${CINZA};margin-bottom:8px"><span style="display:flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:3px;background:${AMBAR};opacity:.35;display:block"></i>Criadas</span><span style="display:flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:3px;background:${VERDE};display:block"></i>Concluídas</span></div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;font-size:10px;font-family:'DM Sans'">${grade}${bars}</svg>`;
  }
  function painelGeral(ts, ini, per){
    const s = stats(ts, ini);
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
        ${kpi("Criadas no período", s.criadas.length)}
        ${kpi("Concluídas no período", s.concl.length)}
        ${kpi("No prazo", pct(s.noPrazo.length, s.comPrazo.length), "das concluídas com prazo" + (s.comPrazo.length ? " (" + s.noPrazo.length + " de " + s.comPrazo.length + ")" : ""), s.comPrazo.length && s.noPrazo.length / s.comPrazo.length < 0.6 ? VERM : null)}
        ${kpi("Complexidade entregue", s.temPontos ? s.pontos : "—", s.temPontos ? "pts das concluídas" : "ative Sprint Points no ClickUp para medir")}
        ${kpi("Reabertura", "—", "o ClickUp não informa reaberturas pela API")}
        ${kpi("Aguardando validação", s.validacao.length, "agora")}
        ${kpi("Tempo registrado", fmtDur(s.tempo), "lançado nas concluídas do período")}
      </div>
      ${cardP("Criadas vs concluídas", graficoDias(ts, ini, per), `<span style="font-size:12px;color:${CINZA}">${per === "hoje" ? "últimos 7 dias" : per === "semana" ? "esta semana" : "este mês"}</span>`)}`;
  }
  function painelPessoa(ts, ini){
    const d = ac().data, agora = Date.now();
    const linhas = d.members.map(u => {
      const meu = ts.filter(t => t.assignees.some(x => String(x.id) === String(u.id)));
      const s = stats(meu, ini);
      return { u, s, abertas: meu.filter(isOpen).length, atrasadas: meu.filter(t => isOpen(t) && t.due_date && limitePrazo(t) < agora).length };
    }).filter(l => l.abertas || l.s.concl.length || l.s.criadas.length).sort((a, b) => b.s.concl.length - a.s.concl.length);
    const th = ["Pessoa", "Concluídas", "No prazo", "Criadas", "Abertas", "Atrasadas", "Tempo"].map((h, i) => `<th style="text-align:${i ? "right" : "left"};font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:${CINZA};font-weight:700;padding:10px 12px;border-bottom:1px solid #E6E6EA;white-space:nowrap">${h}</th>`).join("");
    const td = (v, cor) => `<td style="padding:11px 12px;border-bottom:1px solid #F1F1F3;text-align:right;font-variant-numeric:tabular-nums;${cor ? "color:" + cor + ";font-weight:600" : ""}">${v}</td>`;
    return cardP("Entregas por pessoa", linhas.length ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:640px"><thead><tr>${th}</tr></thead><tbody>${linhas.map(l => `<tr><td style="padding:10px 12px;border-bottom:1px solid #F1F1F3"><span style="display:flex;align-items:center;gap:9px">${avatar(l.u, 24)}${e(l.u.username || "?")}</span></td>${td(l.s.concl.length)}${td(pct(l.s.noPrazo.length, l.s.comPrazo.length))}${td(l.s.criadas.length)}${td(l.abertas)}${td(l.atrasadas, l.atrasadas ? VERM : null)}${td(fmtDur(l.s.tempo))}</tr>`).join("")}</tbody></table></div>` : `<div style="font-size:13px;color:${CINZA}">Ninguém com entregas no período.</div>`);
  }
  function painelCiclos(ts, ini){
    const concl = ts.filter(t => !isOpen(t) && fechouEm(t) >= ini && t.date_created);
    const ciclo = t => Math.max(0, fechouEm(t) - t.date_created);
    const media = concl.length ? concl.reduce((s, t) => s + ciclo(t), 0) / concl.length : 0;
    const ord = concl.map(ciclo).sort((a, b) => a - b), mediana = ord.length ? ord[Math.floor(ord.length / 2)] : 0;
    const faixas = [["Até 1 dia", 0, DIA], ["1 a 3 dias", DIA, 3 * DIA], ["3 a 7 dias", 3 * DIA, 7 * DIA], ["Mais de 7 dias", 7 * DIA, Infinity]].map(f => ({ rot: f[0], n: concl.filter(t => ciclo(t) >= f[1] && ciclo(t) < f[2]).length }));
    const maxF = Math.max(1, ...faixas.map(f => f.n));
    const porLista = Object.values(concl.reduce((o, t) => { const k = t.list ? t.list.name : "Sem lista"; (o[k] = o[k] || { nome: k, n: 0, soma: 0 }); o[k].n++; o[k].soma += ciclo(t); return o; }, {})).sort((a, b) => b.soma / b.n - a.soma / a.n).slice(0, 8);
    const barra = (rot, v, max, txt, cor) => `<div style="margin-bottom:12px"><div style="display:flex;gap:10px;font-size:13px;margin-bottom:5px"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(rot)}</span><strong>${txt}</strong></div><div style="height:7px;border-radius:6px;background:rgba(103,61,230,0.10)"><i style="display:block;height:100%;width:${Math.max(2, v / max * 100).toFixed(1)}%;background:${cor || AMBAR};border-radius:6px"></i></div></div>`;
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
        ${kpi("Ciclo médio", concl.length ? fmtDias(media) : "—", "da criação à conclusão")}
        ${kpi("Ciclo mediano", concl.length ? fmtDias(mediana) : "—", "metade das entregas sai antes disso")}
        ${kpi("Entregas medidas", concl.length, "concluídas no período")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:0 16px">
        ${cardP("Tempo até concluir", faixas.map(f => barra(f.rot, f.n, maxF, f.n + " entrega" + (f.n === 1 ? "" : "s"))).join(""))}
        ${cardP("Ciclo médio por lista", porLista.length ? porLista.map(l => barra(l.nome, l.soma / l.n, porLista[0].soma / porLista[0].n, fmtDias(l.soma / l.n) + " · " + l.n, "#C25FD6")).join("") : `<div style="font-size:13px;color:${CINZA}">Sem entregas no período.</div>`)}
      </div>`;
  }
  function painelCarga(ts){
    const d = ac().data, agora = Date.now(), fs = fimSemana();
    const linhas = d.members.map(u => {
      const ab = ts.filter(t => isOpen(t) && t.assignees.some(x => String(x.id) === String(u.id)));
      return { u, atrasadas: ab.filter(t => t.due_date && limitePrazo(t) < agora).length, semana: ab.filter(t => t.due_date && limitePrazo(t) >= agora && t.due_date < fs).length, depois: ab.filter(t => t.due_date && t.due_date >= fs).length, semPrazo: ab.filter(t => !t.due_date).length };
    }).map(l => Object.assign(l, { total: l.atrasadas + l.semana + l.depois + l.semPrazo })).filter(l => l.total).sort((a, b) => (b.atrasadas + b.semana) - (a.atrasadas + a.semana));
    const max = Math.max(1, ...linhas.map(l => l.total));
    const seg = (n, cor, rot) => n ? `<i title="${n} ${rot}" style="display:block;height:100%;width:${(n / max * 100).toFixed(2)}%;background:${cor}"></i>` : "";
    return cardP("Carga por pessoa", (linhas.length ? `<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:${CINZA};margin-bottom:14px">${[["Atrasadas", VERM], ["Vencem esta semana", AMBAR], ["Depois", "#A78BFA"], ["Sem prazo", "#D0D0D6"]].map(x => `<span style="display:flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:3px;background:${x[1]};display:block"></i>${x[0]}</span>`).join("")}</div>` + linhas.map(l => `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><span style="width:150px;flex:0 0 150px;display:flex;align-items:center;gap:8px;font-size:13px;min-width:0">${avatar(l.u, 22)}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(firstName(l.u))}</span></span><div style="flex:1;height:16px;border-radius:6px;background:#F4F4F6;display:flex;overflow:hidden">${seg(l.atrasadas, VERM, "atrasadas")}${seg(l.semana, AMBAR, "esta semana")}${seg(l.depois, "#A78BFA", "depois")}${seg(l.semPrazo, "#D0D0D6", "sem prazo")}</div><span style="width:120px;text-align:right;font-size:12px;color:#3C3C44;white-space:nowrap">${l.atrasadas + l.semana} p/ semana · ${l.total} ab.</span></div>`).join("") : `<div style="font-size:13px;color:${CINZA}">Nenhuma ação aberta com responsável.</div>`), `<span style="font-size:12px;color:${CINZA}">ações abertas</span>`);
  }
  function painel(){
    const a = ac(), d = a.data;
    const per = a.pPer || "semana", tab = a.pTab || "geral", ini = iniPeriodo(per);
    const ts = d.tasks;
    const tabs = `<div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;margin-bottom:16px">${PTABS.map(x => { const on = tab === x[0]; return `<span data-ac-ptab="${x[0]}" ${on ? "" : "data-hover"} style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:9px;font-size:13px;cursor:pointer;${on ? "font-weight:600;background:rgba(103,61,230,0.12);color:" + AMBAR : "color:#3C3C44"}">${icon(x[2], 14, "currentColor")}${x[1]}</span>`; }).join("")}</div>`;
    const corpo = tab === "pessoa" ? painelPessoa(ts, ini) : tab === "ciclos" ? painelCiclos(ts, ini) : tab === "carga" ? painelCarga(ts) : painelGeral(ts, ini, per);
    return tabs + corpo;
  }
  function seletorPeriodo(){
    const per = ac().pPer || "semana";
    return `<div style="display:inline-flex;gap:2px;padding:3px;border:1px solid #E6E6EA;border-radius:10px;background:#FFFFFF">${PER.map(x => { const on = per === x[0]; return `<span data-ac-per="${x[0]}" style="padding:6px 12px;border-radius:7px;font-size:12.5px;cursor:pointer;${on ? "font-weight:600;background:rgba(103,61,230,0.12);color:" + AMBAR : "color:#3C3C44"}">${x[1]}</span>`; }).join("")}</div>`;
  }

  // ─── render ─────────────────────────────────────────────────────────────────
  function page(){
    return `<div style="display:flex;align-items:stretch;min-height:100vh">
      <div id="acoes-side" style="width:236px;flex:0 0 236px;border-right:1px solid #E6E6EA;padding:24px 16px 40px;display:flex;flex-direction:column;gap:3px">${sidebar()}</div>
      <div id="acoes-main" style="flex:1;min-width:0;padding:26px 30px 60px">${main()}</div>
    </div>`;
  }

  function sidebar(){
    const a = ac(), d = a.data, v = a.view;
    const abertas = d ? d.tasks.filter(isOpen) : [];
    const h0 = hoje0(), fs = fimSemana(), agora = Date.now();
    const nOver = abertas.filter(t => t.due_date && t.due_date < (t.due_date_time ? agora : h0)).length;
    const nHoje = abertas.filter(t => t.due_date && t.due_date < h0 + DIA).length;
    const nSem = abertas.filter(t => t.due_date && t.due_date < fs).length;
    const nFech = d ? d.tasks.length - abertas.length : 0;
    const ativo = (type, id) => v.type === type && (id == null || String(v.id) === String(id));
    const item = (type, id, label, count, opts) => {
      opts = opts || {};
      const on = ativo(type, id);
      return `<div data-ac-view="${type}" data-ac-id="${e(id == null ? "" : id)}" ${on ? "" : "data-hover"} style="display:flex;align-items:center;gap:9px;padding:${opts.sub ? "7px 12px 7px 26px" : "9px 12px"};border-radius:9px;font-size:${opts.sub ? "12.5px" : "13px"};cursor:pointer;${on ? "font-weight:600;color:" + AMBAR + ";background:rgba(103,61,230,0.14)" : "color:" + (opts.sub ? CINZA : "#3C3C44")}">${opts.dot ? `<span style="width:6px;height:6px;border-radius:50%;background:${opts.dot};flex:0 0 6px"></span>` : ""}${opts.ico || ""}<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(label)}</span>${count == null ? "" : `<span style="font-size:11.5px;color:${count && opts.alerta ? VERM : CINZA};font-weight:${count && opts.alerta ? 700 : 400}">${count}</span>`}</div>`;
    };
    const secao = t => `<div style="padding:20px 12px 8px;font-size:10px;letter-spacing:0.14em;color:${CINZA};font-weight:700">${t}</div>`;
    const contaList = id => abertas.filter(t => t.list && t.list.id === id).length;
    const contaFolder = id => abertas.filter(t => t.folder && t.folder.id === id).length;
    const contaSpace = id => abertas.filter(t => t.space && t.space.id === id).length;

    let proj = "";
    if(d) d.spaces.forEach((sp, i) => {
      const cor = sp.color || PALETA[i % PALETA.length];
      proj += item("space", sp.id, sp.name, contaSpace(sp.id), { dot: cor });
      sp.folders.forEach(f => {
        proj += item("folder", f.id, f.name, contaFolder(f.id), { sub: true });
        f.lists.forEach(l => proj += `<div style="padding-left:12px">${item("list", l.id, l.name, contaList(l.id), { sub: true })}</div>`);
      });
      sp.lists.forEach(l => proj += item("list", l.id, l.name, contaList(l.id), { sub: true }));
    });

    return `<div style="${HEAD};font-size:14px;font-weight:600;padding:0 10px 14px">Gestão de atividades</div>
      <div data-ac-new data-hover-dark style="display:flex;align-items:center;gap:9px;padding:10px 13px;border-radius:9px;background:${AMBAR};color:#FFFFFF;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:6px">
        ${icon(ICONS.plus, 14, "currentColor")}<span style="flex:1">Nova ação</span>
        <span style="font-size:10px;background:rgba(23,18,4,0.18);padding:2px 6px;border-radius:5px">C</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:4px 12px 8px;font-size:11.5px;color:${CINZA}">
        <span id="acoes-sync" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(syncTexto())}</span>
        <span data-ac-refresh data-hover title="Atualizar agora" style="width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.refresh, 13, CINZA)}</span>
      </div>
      ${item("painel", null, "Painel de entregas", null, { ico: icon(PTABS[0][2], 14, v.type === "painel" ? AMBAR : "#3C3C44") })}
      <div style="height:8px"></div>
      ${item("all", null, "Todas as ações", abertas.length)}
      ${item("closed", null, "Concluídas", nFech)}
      ${secao("RESPONSÁVEL")}
      ${d ? d.members.map(u => item("assignee", u.id, firstName(u), abertas.filter(t => t.assignees.some(x => String(x.id) === String(u.id))).length, { ico: avatar(u, 18) })).join("") : ""}
      ${item("unassigned", null, "Sem responsável", d ? abertas.filter(t => !t.assignees.length).length : null)}
      ${secao("PRAZO")}
      ${item("overdue", null, "Atrasadas", nOver, { alerta: true })}
      ${item("today", null, "Para hoje", nHoje)}
      ${item("week", null, "Esta semana", nSem)}
      ${secao("PROJETOS")}
      ${proj || `<div style="padding:6px 12px;font-size:12px;color:#9A9AA3">${a.loading ? "Carregando…" : "Nenhum space"}</div>`}`;
  }

  function cabecalho(){
    const [tit, sub] = tituloView();
    return `<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:6px">
        <div style="flex:1;min-width:0"><h1 style="${HEAD};font-size:23px;font-weight:600;margin:0 0 6px">${e(tit)}</h1>
        <p style="margin:0 0 18px;color:${CINZA};font-size:13.5px">${e(sub)}</p></div>
        ${ac().view.type === "painel" ? seletorPeriodo() : ""}
              </div>`;
  }

  function filtros(){
    const a = ac(), d = a.data;
    if(a.view.type === "painel") return "";
    const statusOpts = Object.values(ordemStatus()).sort((x, y) => x.ord - y.ord);
    const selS = (name, val, opts, largura) => `<select data-ac-filter="${name}" style="padding:9px 30px 9px 12px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;color:${val ? "#17171A" : "#3C3C44"};background:#FFFFFF;cursor:pointer;appearance:auto;${largura ? "min-width:" + largura + "px" : ""}">${opts.map(o => `<option value="${e(o[0])}" ${String(val) === String(o[0]) ? "selected" : ""}>${e(o[1])}</option>`).join("")}</select>`;
    return `<div style="display:flex;align-items:center;gap:9px;flex:1;min-width:220px;padding:0 13px;border:1px solid #DADADF;border-radius:9px;background:#FFFFFF">${icon(ICONS.search, 13, CINZA)}<input id="acoes-q" value="${e(a.q)}" placeholder="Buscar por título, tag ou lista ( / )" style="flex:1;border:0;outline:0;padding:9px 0;font:inherit;font-size:12.5px;background:transparent;color:#17171A"></div>
        ${selS("fAssignee", a.fAssignee, [["", "Responsável"]].concat(d ? d.members.map(u => [String(u.id), firstName(u)]) : []).concat([["none", "Sem responsável"]]))}
        ${selS("fPrio", a.fPrio, [["", "Prioridade"]].concat(PRIOS.slice(1)))}
        ${selS("fStatus", a.fStatus, [["", "Status"]].concat(statusOpts.map(s => [norm(s.name), cap(s.name)])))}
        ${selS("groupBy", a.groupBy, [["status", "Agrupar: status"], ["list", "Agrupar: lista"]])}
        <label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#3C3C44;cursor:pointer;padding:9px 4px"><input type="checkbox" data-ac-filter="showClosed" ${a.showClosed ? "checked" : ""} style="accent-color:${AMBAR}">Mostrar concluídas</label>`;
  }

  function main(){
    return `<div id="acoes-head">${cabecalho()}</div>
      <div id="acoes-filtros" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;align-items:center">${filtros()}</div>
      <div id="acoes-list">${lista()}</div>`;
  }

  function lista(){
    const a = ac(), d = a.data;
    if(a.error && !d) return `<div style="border:1px solid rgba(192,52,28,0.35);background:rgba(192,52,28,0.06);border-radius:14px;padding:22px;font-size:13.5px;color:${VERM}"><strong>Não foi possível carregar as ações.</strong><div style="margin-top:6px;color:#3C3C44">${/HTTP 404/.test(a.error) ? "A rota /api/clickup ainda não está ativa no servidor (falta reiniciar o jeff-central)." : e(a.error)}</div><div data-ac-refresh style="display:inline-block;margin-top:12px;${BTN_SEC}">Tentar de novo</div></div>`;
    if(!d) return `<div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;padding:40px;text-align:center;color:${CINZA};font-size:13.5px">Carregando ações…</div>`;
    if(a.view.type === "painel") return painel();
    const ts = ordenar(filtrar());
    const grupos = agrupar(ts);
    const head = `<div style="display:grid;${GRID};gap:12px;min-width:920px;padding:13px 20px;border-bottom:1px solid #E6E6EA;font-size:10.5px;letter-spacing:0.1em;font-weight:700;color:${CINZA}"><span></span><span>TÍTULO</span><span>LISTA</span><span>RESPONSÁVEL</span><span>PRIORIDADE</span><span>PRAZO</span><span></span></div>`;
    if(!ts.length) return `<div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;overflow-x:auto">${head}<div style="padding:36px 20px;text-align:center;color:${CINZA};font-size:13.5px">Nenhuma ação aqui.${a.q || a.fAssignee || a.fPrio || a.fStatus ? ` <span data-ac-clear style="color:${AMBAR};cursor:pointer;font-weight:600">Limpar filtros</span>` : ""}</div></div>`;
    return `<div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;overflow-x:auto">${head}${grupos.map(g => {
      const fechado = !!a.collapsed[g.key];
      return `<div data-ac-collapse="${e(g.key)}" style="display:flex;align-items:center;gap:10px;min-width:920px;padding:12px 20px;background:#F7F7F8;border-bottom:1px solid #E6E6EA;cursor:pointer;user-select:none">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7A7A85" stroke-width="2.2" style="transition:transform .15s;transform:rotate(${fechado ? "-90deg" : "0"})">${ICONS.chevDown}</svg>
          <span style="width:12px;height:12px;border-radius:50%;border:1.6px solid ${g.color};background:${a.groupBy === "status" ? g.color + "33" : "transparent"}"></span>
          <strong style="font-size:13px;font-weight:600">${e(g.name)}</strong>
          <span style="font-size:11.5px;color:${CINZA}">${g.items.length}</span>
        </div>${fechado ? "" : g.items.map(linha).join("")}`;
    }).join("")}</div>`;
  }

  function linha(t){
    const due = dueInfo(t), aberta = isOpen(t);
    const cor = t.status_color || "#87909e";
    return `<div data-ac-row="${e(t.id)}" style="display:grid;${GRID};gap:12px;min-width:920px;padding:11px 20px;border-bottom:1px solid #F1F1F3;align-items:center;${aberta ? "" : "opacity:.6"}">
      <span data-ac-toggle="${e(t.id)}" title="${aberta ? "Marcar como concluída" : "Reabrir"}" style="width:17px;height:17px;border-radius:50%;border:1.6px solid ${aberta ? cor : VERDE};background:${aberta ? "transparent" : VERDE};display:flex;align-items:center;justify-content:center;cursor:pointer;margin-left:4px">${aberta ? "" : icon(ICONS.check, 10, "#FFFFFF")}</span>
      <span data-ac-open="${e(t.id)}" style="display:flex;align-items:center;gap:9px;min-width:0;cursor:pointer">
        ${t.parent ? `<span title="Subtarefa" style="flex:0 0 auto;display:flex">${icon(ICO_SUB, 12, "#9A9AA3")}</span>` : ""}
        <span style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${aberta ? "" : "text-decoration:line-through"}">${e(t.name)}</span>
        ${t.tags.map(g => `<span style="flex:0 0 auto;font-size:10.5px;color:${CINZA};border:1px solid #DADADF;padding:1px 7px;border-radius:6px">${e(g.name)}</span>`).join("")}
      </span>
      <span style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;min-width:0">
        ${t.folder ? `<span style="font-size:10.5px;color:${CINZA};white-space:nowrap">${e(t.folder.name)} ›</span>` : ""}
        <span style="font-size:11px;color:#3C3C44;border:1px solid #DADADF;padding:2px 8px;border-radius:6px;white-space:nowrap">${e(t.list ? t.list.name : "—")}</span>
      </span>
      <span style="display:flex;align-items:center;gap:6px;min-width:0">
        ${t.assignees.length ? t.assignees.map(u => avatar(u, 22)).join("") + `<span style="font-size:11.5px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(t.assignees.map(firstName).join(", "))}</span>` : `<span style="font-size:11.5px;color:#9A9AA3">—</span>`}
      </span>
      <span style="display:flex;align-items:center;gap:7px;font-size:12px;color:#3C3C44"><span style="width:6px;height:6px;border-radius:50%;background:${t.priority ? PRIO_COLOR[t.priority] : "#D0D0D6"}"></span>${e(t.priority_label || "—")}</span>
      <span style="font-size:12px;font-weight:${due.peso ? 600 : 400};color:${due.color};white-space:nowrap">${e(due.label)}</span>
      <a href="${e(t.url)}" target="_blank" rel="noopener" title="Abrir tarefa" data-hover style="width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center">${icon(ICO_LINK, 13, "#9A9AA3")}</a>
    </div>`;
  }

  // ─── pintura ────────────────────────────────────────────────────────────────
  // Nada aqui troca o innerHTML do root: cada bloco se atualiza sozinho, então o
  // scroll, o foco do campo e os avatares já carregados continuam onde estavam.
  function syncTexto(){
    const a = ac();
    return a.loading ? "Sincronizando…" : a.data ? "Atualizado " + fmtRel(a.data.fetched_at) : a.error ? "Sem conexão" : "—";
  }
  function paintSync(){ const el = document.getElementById("acoes-sync"); if(el) el.textContent = syncTexto(); }
  function paintLista(){ const l = document.getElementById("acoes-list"); if(l) l.innerHTML = lista(); }
  function paintSide(){ const s = document.getElementById("acoes-side"); if(s) s.innerHTML = sidebar(); }
  function paintHead(){ const h = document.getElementById("acoes-head"); if(h) h.innerHTML = cabecalho(); }
  function paintFiltros(){
    const f = document.getElementById("acoes-filtros");
    if(!f || f.contains(document.activeElement)) return; // não mexe no campo que a pessoa está usando
    f.innerHTML = filtros();
  }
  function paint(){
    const root = document.getElementById("acoes-root");
    if(!root) return;
    if(!document.getElementById("acoes-list")){ root.innerHTML = page(); return; } // primeira pintura
    paintSide(); paintHead(); paintFiltros(); paintLista();
  }

  // ─── eventos ────────────────────────────────────────────────────────────────
  function bind(root){
    bindOnce(root, "click", ev => {
      const t = ev.target;
      const q = sel => t.closest && t.closest(sel);
      let el;
      if(q("[data-ac-new]")) return abrirNova();
      if(q("[data-ac-refresh]")) return load(true);
      if(q("[data-ac-clear]")){ Object.assign(ac(), { q: "", fAssignee: "", fPrio: "", fStatus: "" }); paintFiltros(); paintLista(); return; }
      if((el = q("[data-ac-view]"))){ const type = el.getAttribute("data-ac-view"), id = el.getAttribute("data-ac-id"); return acSet({ view: id ? { type, id } : { type } }); }
      if((el = q("[data-ac-ptab]"))){ ac().pTab = el.getAttribute("data-ac-ptab"); return paintLista(); }
      if((el = q("[data-ac-per]"))){ ac().pPer = el.getAttribute("data-ac-per"); paintHead(); return paintLista(); }
      if((el = q("[data-ac-toggle]"))) return alternarStatus(el.getAttribute("data-ac-toggle"));
      if((el = q("[data-ac-open]"))) return abrirDetalhe(el.getAttribute("data-ac-open"));
      if((el = q("[data-ac-collapse]"))){ const k = el.getAttribute("data-ac-collapse"), a = ac(); a.collapsed[k] = !a.collapsed[k]; return paintLista(); }
    });
    bindOnce(root, "input", ev => {
      if(ev.target && ev.target.id === "acoes-q"){ ac().q = ev.target.value; paintLista(); }
    });
    bindOnce(root, "change", ev => {
      const el = ev.target;
      if(!el || !el.getAttribute) return;
      const f = el.getAttribute("data-ac-filter");
      if(!f) return;
      const p = {}; p[f] = el.type === "checkbox" ? el.checked : el.value;
      acSet(p);
    });
  }

  document.addEventListener("keydown", ev => {
    if(state.screen !== "acoes" || document.getElementById("acoes-modal")) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if(["INPUT", "TEXTAREA", "SELECT"].includes(tag) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if(ev.key === "/"){ ev.preventDefault(); const q = document.getElementById("acoes-q"); if(q) q.focus(); }
    if(ev.key === "c" || ev.key === "C"){ ev.preventDefault(); abrirNova(); }
  });

  // Atualiza sozinho a cada 2 min enquanto a tela está aberta e visível.
  // Sem force: o servidor devolve o cache na hora e se atualiza por trás, então a
  // varredura do ClickUp nunca trava a tela. Não repinta com um campo em uso.
  setInterval(() => {
    if(state.screen !== "acoes" || document.hidden) return;
    if(!ac().data || document.getElementById("acoes-modal")) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if(["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
    load(false, true);
  }, 120000);
  // Só o "Atualizado há X": texto, sem repintar nada
  setInterval(() => { if(state.screen === "acoes" && !document.hidden) paintSync(); }, 30000);

  // ─── ações ──────────────────────────────────────────────────────────────────
  function toast(msg, erro){
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:80;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;color:#FFFFFF;background:${erro ? VERM : "#17171A"};box-shadow:0 10px 30px rgba(23,23,26,0.25);max-width:min(560px,90vw)`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), erro ? 5000 : 2600);
  }
  function taskLocal(id){ const d = ac().data; return d && d.tasks.find(t => t.id === id); }
  function aplicarLocal(task){
    const d = ac().data; if(!d || !task) return;
    const i = d.tasks.findIndex(t => t.id === task.id);
    const base = i >= 0 ? d.tasks[i] : {};
    const novo = Object.assign({}, base, task);
    if(!task.space || !task.space.name) novo.space = base.space || task.space;
    if(i >= 0) d.tasks[i] = novo; else d.tasks.unshift(novo);
  }

  async function alternarStatus(id){
    const t = taskLocal(id); if(!t) return;
    const sts = statusesDe(t);
    const alvo = isOpen(t) ? sts.find(s => s.type === "closed") : (sts.find(s => s.type === "open") || sts[0]);
    if(!alvo) return toast("Não achei um status de " + (isOpen(t) ? "conclusão" : "reabertura") + " pra essa lista.", true);
    const antes = { status: t.status, status_type: t.status_type, status_color: t.status_color };
    Object.assign(t, { status: alvo.status, status_type: alvo.type, status_color: alvo.color });
    paintLista(); paintSide();
    try {
      const r = await apiJ("/tasks/" + encodeURIComponent(id), "PUT", { status: alvo.status });
      aplicarLocal(r.task);
      toast(alvo.type === "closed" ? "Concluída: " + t.name : "Reaberta: " + t.name);
    } catch(err){ Object.assign(t, antes); toast("Falhou: " + err.message, true); }
    paint();
  }

  // Modal genérico da tela
  function modal(opts){
    fecharModal();
    const m = document.createElement("div");
    m.id = "acoes-modal";
    m.style.cssText = "position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(23,23,26,0.32)";
    m.innerHTML = `<div class="pop-down" style="width:100%;max-width:${opts.width || 640}px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;border-radius:18px;background:#FFFFFF;box-shadow:0 24px 60px rgba(23,23,26,0.25);overflow:hidden">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:20px 22px 14px;border-bottom:1px solid #E6E6EA">
        <div style="flex:1;min-width:0"><div style="${HEAD};font-size:18px;font-weight:600">${opts.title}</div>${opts.sub ? `<div style="font-size:12.5px;color:${CINZA};margin-top:4px;line-height:1.5">${opts.sub}</div>` : ""}</div>
        ${opts.head || ""}
        <span data-ac-close data-hover title="Fechar" style="width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 32px">${icon(ICONS.x, 16, CINZA)}</span>
      </div>
      <div id="acoes-modal-body" style="padding:18px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:14px">${opts.body}</div>
      <div style="display:flex;align-items:center;gap:10px;padding:14px 22px;border-top:1px solid #E6E6EA">${opts.footer || ""}</div>
    </div>`;
    m.addEventListener("click", ev => { if(ev.target === m || (ev.target.closest && ev.target.closest("[data-ac-close]"))) fecharModal(); });
    document.body.appendChild(m);
    const first = m.querySelector("input[name=name]"); if(first) setTimeout(() => first.focus(), 30);
    return m;
  }
  function fecharModal(){ const m = document.getElementById("acoes-modal"); if(m) m.remove(); }
  document.addEventListener("keydown", ev => { if(ev.key === "Escape") fecharModal(); });

  const lbl = (t, sub) => `<div style="font-size:12.5px;font-weight:500;margin-bottom:6px">${t}${sub ? `<span style="font-weight:400;color:#9A9AA3"> · ${sub}</span>` : ""}</div>`;
  const opt = (v, l, on) => `<option value="${e(v)}" ${on ? "selected" : ""}>${e(l)}</option>`;
  function selListas(atual){
    const d = ac().data; if(!d) return "";
    let h = `<select name="list_id" required style="${SEL}"><option value="">Escolha a lista…</option>`;
    d.spaces.forEach(sp => {
      sp.folders.forEach(f => { h += `<optgroup label="${e(sp.name + " › " + f.name)}">` + f.lists.map(l => opt(l.id, l.name, l.id === atual)).join("") + `</optgroup>`; });
      if(sp.lists.length) h += `<optgroup label="${e(sp.name)}">` + sp.lists.map(l => opt(l.id, l.name, l.id === atual)).join("") + `</optgroup>`;
    });
    return h + `</select>`;
  }
  function chkMembros(ids){
    const d = ac().data; if(!d) return "";
    return `<div style="display:flex;flex-wrap:wrap;gap:8px">${d.members.map(u => { const on = ids.some(x => String(x) === String(u.id)); return `<label data-hover-border style="display:flex;align-items:center;gap:8px;padding:7px 12px 7px 8px;border:1px solid ${on ? AMBAR : "#DADADF"};border-radius:9px;font-size:12.5px;cursor:pointer;background:${on ? "rgba(103,61,230,0.06)" : "#FFFFFF"}"><input type="checkbox" name="assignees" value="${e(u.id)}" ${on ? "checked" : ""} style="accent-color:${AMBAR}">${avatar(u, 20)}${e(firstName(u))}</label>`; }).join("")}</div>`;
  }
  const selPrio = v => `<select name="priority" style="${SEL}">${PRIOS.map(p => opt(p[0], p[1], String(v || "") === p[0])).join("")}</select>`;
  const selStatus = (sts, v) => `<select name="status" style="${SEL}">${sts.map(s => opt(s.status, cap(s.status), norm(s.status) === norm(v || ""))).join("")}</select>`;

  function lerForm(form){
    const f = new FormData(form), o = {};
    f.forEach((v, k) => { if(k === "assignees"){ (o.assignees = o.assignees || []).push(Number(v)); } else o[k] = v; });
    o.assignees = o.assignees || [];
    return o;
  }

  function abrirNova(){
    const a = ac(), d = a.data;
    if(!d) return toast("Ainda carregando as ações…", true);
    const v = a.view;
    const listaPadrao = v.type === "list" ? v.id : (v.type === "folder" ? ((listas().find(l => l.folder_id === v.id) || {}).id) : null);
    const respPadrao = v.type === "assignee" ? [v.id] : [];
    const statusesIni = listaPadrao ? statusesDaLista(listaPadrao) : [];
    const m = modal({
      title: "Nova ação", sub: "Cria a tarefa e avisa o responsável.",
      body: `<form id="acoes-form-nova" style="display:flex;flex-direction:column;gap:14px;margin:0">
        <div>${lbl("Título")}<input name="name" required maxlength="500" placeholder="Ex: Revisar proposta da Alpha" style="${IN}"></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="flex:2 1 240px">${lbl("Lista")}${selListas(listaPadrao)}</div>
          <div style="flex:1 1 150px">${lbl("Status")}<span id="acoes-nova-status">${statusesIni.length ? selStatus(statusesIni, statusesIni[0].status) : `<select name="status" style="${SEL}" disabled><option value="">Padrão da lista</option></select>`}</span></div>
        </div>
        <div>${lbl("Responsável")}${chkMembros(respPadrao)}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="flex:1 1 160px">${lbl("Prioridade")}${selPrio("")}</div>
          <div style="flex:1 1 200px">${lbl("Prazo", "com hora")}<input name="due" type="datetime-local" style="${IN}"></div>
        </div>
        <div>${lbl("Descrição", "opcional")}<textarea name="description" rows="4" placeholder="Contexto, critério de pronto, links…" style="${IN};resize:vertical"></textarea></div>
      </form>`,
      footer: `<span style="flex:1"></span><span data-ac-close style="${BTN_SEC}">Cancelar</span><button type="submit" form="acoes-form-nova" style="${BTN_PRI}">Criar ação</button>`
    });
    const form = m.querySelector("#acoes-form-nova");
    form.querySelector("select[name=list_id]").addEventListener("change", ev => {
      const sts = statusesDaLista(ev.target.value);
      m.querySelector("#acoes-nova-status").innerHTML = sts.length ? selStatus(sts, sts[0].status) : `<select name="status" style="${SEL}" disabled><option value="">Padrão da lista</option></select>`;
    });
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const o = lerForm(form);
      const body = { list_id: o.list_id, name: o.name, description: o.description || "", assignees: o.assignees, priority: o.priority ? Number(o.priority) : null };
      if(o.status) body.status = o.status;
      const due = fromLocalInput(o.due); if(due) { body.due_date = due; body.due_date_time = true; }
      const btn = m.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Criando…";
      try {
        const r = await apiJ("/tasks", "POST", body);
        fecharModal(); toast("Criada: " + r.task.name);
        load(true, true);
      } catch(err){ btn.disabled = false; btn.textContent = "Criar ação"; toast("Falhou: " + err.message, true); }
    });
  }

  async function abrirDetalhe(id){
    const local = taskLocal(id);
    const m = modal({ title: e(local ? local.name : "Ação"), sub: local ? e([local.space && local.space.name, local.folder && local.folder.name, local.list && local.list.name].filter(Boolean).join(" › ")) : "", body: `<div style="padding:30px;text-align:center;color:${CINZA};font-size:13px">Carregando…</div>` });
    let det;
    try { det = await apiJ("/tasks/" + encodeURIComponent(id)); }
    catch(err){ const b = m.querySelector("#acoes-modal-body"); if(b) b.innerHTML = `<div style="color:${VERM};font-size:13px">${e(err.message)}</div>`; return; }
    if(!document.getElementById("acoes-modal")) return;
    const t = det.task, sts = statusesDe(local || t);
    aplicarLocal(t);
    const body = m.querySelector("#acoes-modal-body");
    body.innerHTML = `<form id="acoes-form-det" style="display:flex;flex-direction:column;gap:14px;margin:0">
        <div>${lbl("Título")}<input name="name" required maxlength="500" value="${e(t.name)}" style="${IN}"></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="flex:1 1 160px">${lbl("Status")}${sts.length ? selStatus(sts, t.status) : `<input value="${e(t.status || "")}" disabled style="${IN}">`}</div>
          <div style="flex:1 1 140px">${lbl("Prioridade")}${selPrio(t.priority)}</div>
          <div style="flex:1 1 200px">${lbl("Prazo")}<input name="due" type="datetime-local" value="${e(toLocalInput(t.due_date))}" style="${IN}"></div>
        </div>
        <div>${lbl("Responsável")}${chkMembros(t.assignees.map(u => u.id))}</div>
        <div>${lbl("Descrição")}<textarea name="description" rows="5" style="${IN};resize:vertical">${e(t.description || "")}</textarea></div>
        ${t.subtasks && t.subtasks.length ? `<div>${lbl("Subtarefas", t.subtasks.length)}<div style="display:flex;flex-direction:column;gap:6px">${t.subtasks.map(s => `<div style="display:flex;align-items:center;gap:9px;font-size:12.5px;padding:7px 10px;border:1px solid #E6E6EA;border-radius:8px"><span style="width:8px;height:8px;border-radius:50%;background:${s.status_color || "#87909e"}"></span><span style="flex:1;${isOpen(s) ? "" : "text-decoration:line-through;color:" + CINZA}">${e(s.name)}</span><span style="font-size:11px;color:${CINZA}">${e(cap(s.status || ""))}</span></div>`).join("")}</div></div>` : ""}
        <div style="font-size:11.5px;color:#9A9AA3">Criada ${e(fmtData(t.date_created))}${t.date_updated ? " · atualizada " + e(fmtData(t.date_updated)) : ""}${t.date_closed ? " · concluída " + e(fmtData(t.date_closed)) : ""}</div>
      </form>
      <div style="border-top:1px solid #E6E6EA;padding-top:14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">${icon(ICO_MSG, 14, CINZA)}<span style="font-size:13px;font-weight:600">Comentários</span><span style="font-size:11.5px;color:${CINZA}">${det.comments.length}</span></div>
        <div id="acoes-comments" style="display:flex;flex-direction:column;gap:10px">${comentariosHTML(det.comments)}</div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-top:12px">
          <textarea id="acoes-comment-text" rows="2" placeholder="Escreva um comentário… (Ctrl+Enter envia)" style="${IN};resize:vertical;flex:1"></textarea>
          <button type="button" id="acoes-comment-send" style="${BTN_SEC};white-space:nowrap">Comentar</button>
        </div>
      </div>`;
    const foot = m.querySelector("#acoes-modal-body").nextElementSibling;
    foot.innerHTML = `<a href="${e(t.url)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:${CINZA};text-decoration:none">${icon(ICO_LINK, 13, CINZA)}Abrir tarefa</a>
      <span data-ac-del style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${VERM};cursor:pointer;margin-left:14px">${icon(ICONS.trash, 13, VERM)}Excluir</span>
      <span style="flex:1"></span><span data-ac-close style="${BTN_SEC}">Fechar</span><button type="submit" form="acoes-form-det" style="${BTN_PRI}">Salvar</button>`;

    const form = m.querySelector("#acoes-form-det");
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const o = lerForm(form), body = {};
      if(o.name.trim() !== t.name) body.name = o.name.trim();
      if(o.status !== undefined && o.status && norm(o.status) !== norm(t.status || "")) body.status = o.status;
      const pr = o.priority ? Number(o.priority) : null; if(pr !== (t.priority || null)) body.priority = pr;
      if((o.description || "") !== (t.description || "")) body.description = o.description || "";
      const due = fromLocalInput(o.due);
      if((due || null) !== (t.due_date || null)) { body.due_date = due; if(due) body.due_date_time = true; }
      const antes = t.assignees.map(u => String(u.id)), depois = o.assignees.map(String);
      const add = depois.filter(x => !antes.includes(x)).map(Number), rem = antes.filter(x => !depois.includes(x)).map(Number);
      if(add.length || rem.length) body.assignees = { add, rem };
      if(!Object.keys(body).length){ fecharModal(); return; }
      const btn = foot.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const r = await apiJ("/tasks/" + encodeURIComponent(t.id), "PUT", body);
        aplicarLocal(r.task); fecharModal(); paint(); toast("Salvo.");
        load(true, true);
      } catch(err){ btn.disabled = false; btn.textContent = "Salvar"; toast("Falhou: " + err.message, true); }
    });
    foot.querySelector("[data-ac-del]").addEventListener("click", async () => {
      if(!confirm("Excluir \"" + t.name + "\"? Isso não tem volta.")) return;
      try {
        await apiJ("/tasks/" + encodeURIComponent(t.id), "DELETE");
        const d = ac().data; if(d) d.tasks = d.tasks.filter(x => x.id !== t.id);
        fecharModal(); paint(); toast("Excluída.");
      } catch(err){ toast("Falhou: " + err.message, true); }
    });
    const ta = m.querySelector("#acoes-comment-text"), send = m.querySelector("#acoes-comment-send");
    async function comentar(){
      const text = ta.value.trim(); if(!text) return;
      send.disabled = true; send.textContent = "Enviando…";
      try {
        await apiJ("/tasks/" + encodeURIComponent(t.id) + "/comments", "POST", { text });
        ta.value = "";
        const d2 = await apiJ("/tasks/" + encodeURIComponent(t.id));
        const box = m.querySelector("#acoes-comments"); if(box) box.innerHTML = comentariosHTML(d2.comments);
        toast("Comentário enviado.");
      } catch(err){ toast("Falhou: " + err.message, true); }
      send.disabled = false; send.textContent = "Comentar";
    }
    send.addEventListener("click", comentar);
    ta.addEventListener("keydown", ev => { if((ev.ctrlKey || ev.metaKey) && ev.key === "Enter"){ ev.preventDefault(); comentar(); } });
  }
  function comentariosHTML(cs){
    if(!cs.length) return `<div style="font-size:12.5px;color:#9A9AA3">Nenhum comentário ainda.</div>`;
    return cs.map(c => `<div style="display:flex;gap:10px;align-items:flex-start">${c.user ? avatar(c.user, 24) : ""}<div style="flex:1;min-width:0"><div style="display:flex;gap:8px;align-items:baseline"><span style="font-size:12.5px;font-weight:600">${e(c.user ? firstName(c.user) : "?")}</span><span style="font-size:11px;color:#9A9AA3">${e(fmtData(c.date))}</span></div><div style="font-size:13px;color:#3C3C44;white-space:pre-wrap;line-height:1.5;margin-top:2px">${e(c.text)}</div></div></div>`).join("");
  }

  // ─── plug na Central ────────────────────────────────────────────────────────
  RENDERERS.acoes = function(){
    setTimeout(() => {
      const root = document.getElementById("acoes-root");
      if(!root) return;
      bind(root);
      const a = ac();
      if(!a.data && !a.loading) load(false);
      else if(a.data && Date.now() - a.data.fetched_at > 60000) load(false, true);
    }, 0);
    return `<div id="acoes-root">${page()}</div>`;
  };
  // Se a página abriu direto em /acoes, o render() inicial já pintou a maquete antiga: repinta com a tela real
  if(state.screen === "acoes"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = RENDERERS.acoes(); }
})();
