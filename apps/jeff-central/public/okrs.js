// OKRs: tela /okrs com Cockpit, Árvore, Cards e Tabela, ciclos, objetivos, resultados-chave, check-ins e criação com IA.
// Carregado depois do script principal: usa state, setState, render, icon, ICONS, e (escape), bindOnce, RENDERERS e homeCardsRefresh de lá.
// Backend: /api/okrs (okrs.js).
(function(){
  const AMBAR = "#673DE6", VERM = "#C0341C", VERDE = "#0F7A68", LARANJA = "#C2378F", CINZA = "#66666F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:10px 12px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none";
  const BOX = "border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:20px";
  const BTN_PRI = "display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:9px;background:" + AMBAR + ";color:#FFFFFF;font:inherit;font-size:12.5px;font-weight:700;border:0;cursor:pointer";
  const BTN_SEC = "display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const BTN_MINI = "display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #DADADF;border-radius:8px;font:inherit;font-size:12px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const ST = {
    nao_iniciado: ["Não iniciado", CINZA, "#F7F7F8", "#E6E6EA"],
    em_andamento: ["Em andamento", AMBAR, "rgba(103,61,230,0.08)", "rgba(103,61,230,0.3)"],
    em_risco: ["Em risco", LARANJA, "rgba(194,55,143,0.10)", "rgba(194,55,143,0.35)"],
    atrasado: ["Atrasado", VERM, "rgba(192,52,28,0.08)", "rgba(192,52,28,0.3)"],
    concluido: ["Concluído", VERDE, "rgba(15,122,104,0.08)", "rgba(15,122,104,0.3)"]
  };
  const PERIODOS = { mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };
  const MESES = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  const MESES_CAP = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  function ok(){ if(!state.okr) state.okr = { data: null, loading: false, error: null, view: "cockpit", q: "", f: { status: "", area: "", owner: "", atencao: false }, sort: "risco", cycleId: null, tree: { x: 0, y: 0, s: 1, fitted: false }, expanded: {}, openCheckin: false }; return state.okr; }
  async function apiJ(url, method, body){
    const r = await fetch("/api/okrs" + url, { method: method || "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  let _loading = false, _detalhe = null;
  async function load(cycleId){
    if(_loading) return; _loading = true;
    const o = ok(); o.loading = true;
    if(cycleId !== undefined) o.cycleId = cycleId;
    try { o.data = await apiJ(o.cycleId ? "?cycle=" + encodeURIComponent(o.cycleId) : ""); o.error = null; }
    catch(err){ o.error = err.message; }
    o.loading = false; _loading = false;
    state.okrHome = null;
    paint();
    if(_detalhe) refazerDetalhe();
    if(o.openCheckin && o.data){ o.openCheckin = false; abrirCheckin(); }
  }
  function aplicar(j){ const o = ok(); o.data = j; o.error = null; state.okrHome = null; paint(); if(_detalhe) refazerDetalhe(); if(typeof homeCardsRefresh === "function" && state.screen === "home") homeCardsRefresh(); }
  async function acao(url, method, body){
    try { const j = await apiJ(url, method, body); if(j.objectives) aplicar(j); return j; }
    catch(err){ toast("Erro: " + err.message, true); return null; }
  }

  // ─── helpers ────────────────────────────────────────────────────────────────
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const dataBr = d => { if(!d) return "—"; const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
  const dataCurta = d => { if(!d) return ""; const [, m, dd] = d.split("-"); return `${dd} de ${MESES[+m - 1]}`; };
  const hojeIso = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const fmtN = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  function fmtVal(v, unit){
    if(v === null || v === undefined || isNaN(v)) return "—";
    let s;
    if(Math.abs(v) >= 1000000) s = fmtN.format(Math.round(v / 10000) / 100) + " mi";
    else if(Math.abs(v) >= 10000) s = fmtN.format(Math.round(v / 100) / 10) + " mil";
    else s = fmtN.format(v);
    if(unit === "R$") return "R$ " + s;
    if(unit === "%") return s + "%";
    if(unit === "pp") return s + " pp";
    if(unit === "dias") return s + " dias";
    if(unit === "pontos") return s + " pts";
    return s;
  }
  const ini = n => { const w = String(n || "?").split(/\s+/).filter(Boolean); return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase(); };
  const corProg = p => p >= 80 ? VERDE : p >= 45 ? AMBAR : VERM;
  function badge(st, small){
    const x = ST[st] || ST.em_andamento;
    return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:${small ? 10.5 : 11.5}px;font-weight:600;color:${x[1]};background:${x[2]};border:1px solid ${x[3]};padding:${small ? "2px 7px" : "3px 9px"};border-radius:20px;white-space:nowrap"><span style="width:5px;height:5px;border-radius:50%;background:${x[1]}"></span>${x[0]}</span>`;
  }
  function gapTxt(o){
    if(o.gap === null || o.gap === undefined) return "";
    if(o.status === "concluido") return `<span style="font-weight:700;color:${VERDE}">concluído</span>`;
    if(o.gap >= 0) return `<span style="font-weight:700;color:${VERDE}">${o.gap === 0 ? "no alvo" : "+" + o.gap + "pp"}</span>`;
    return `<span style="font-weight:700;color:${VERM}">${-o.gap}pp atrás</span>`;
  }
  const atualizadoTxt = o => o.lastUpdate ? (o.daysSinceUpdate === 0 ? "Atualizado hoje" : `Atualizado há ${o.daysSinceUpdate}d`) : "Nunca atualizado";
  function ring(pct, size, cor){
    size = size || 46; const r = size / 2 - 4, c = 2 * Math.PI * r;
    return `<span style="position:relative;width:${size}px;height:${size}px;flex:0 0 ${size}px;display:inline-block">
      <svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;transform:rotate(-90deg)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#F1F1F3" stroke-width="4"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${cor || corProg(pct)}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}"/></svg>
      <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size / 3.7)}px;font-weight:700">${pct}</span></span>`;
  }
  function bar(pct, cor, expected, h){
    return `<span style="position:relative;display:block;height:${h || 6}px;border-radius:6px;background:rgba(103,61,230,0.10);overflow:visible"><span style="position:absolute;left:0;top:0;bottom:0;width:${Math.max(0, Math.min(100, pct))}%;border-radius:6px;background:${cor || corProg(pct)}"></span>${expected !== null && expected !== undefined ? `<span title="Esperado pelo tempo do ciclo: ${expected}%" style="position:absolute;top:-3px;bottom:-3px;left:calc(${expected}% - 1px);width:2px;border-radius:2px;background:#17171A;opacity:.5"></span>` : ""}</span>`;
  }
  const lbl = (t, sub) => `<div style="font-size:12.5px;font-weight:500;margin-bottom:6px">${t}${sub ? `<span style="font-weight:400;color:#9A9AA3"> · ${sub}</span>` : ""}</div>`;
  const sel = (name, val, opts, extra) => `<select name="${name}" ${extra || ""} style="${IN}">${opts.map(o => `<option value="${e(o[0])}" ${String(val) === String(o[0]) ? "selected" : ""}>${e(o[1])}</option>`).join("")}</select>`;
  function toast(msg, erro){
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:90;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;color:#FFFFFF;background:${erro ? VERM : "#17171A"};box-shadow:0 10px 30px rgba(23,23,26,0.25)`;
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), erro ? 5000 : 2600);
  }
  const D = () => ok().data;
  const objs = () => (D() && D().objectives) || [];
  const objById = id => objs().find(o => o.id === id) || null;
  const areaNome = id => { const a = D() && D().areas.find(x => x.id === id); return a ? a.name : ""; };
  const teamNome = id => { const t = D() && D().teams.find(x => x.id === id); return t ? t.name : ""; };
  function descendentes(id){ const out = new Set(); const walk = x => objs().filter(o => o.parentId === x).forEach(c => { if(!out.has(c.id)){ out.add(c.id); walk(c.id); } }); walk(id); return out; }

  // ─── Modal genérico ─────────────────────────────────────────────────────────
  function fecharModal(){ const m = document.getElementById("okr-modal"); if(m) m.remove(); _detalhe = null; }
  function modal(o){
    fecharModal();
    const m = document.createElement("div");
    m.id = "okr-modal";
    m.style.cssText = "position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(23,23,26,0.32)";
    m.innerHTML = `<form data-okr-form class="pop-down" style="width:100%;max-width:${o.width || 600}px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;border-radius:18px;background:#FFFFFF;box-shadow:0 24px 60px rgba(23,23,26,0.25);overflow:hidden;margin:0">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:20px 22px 14px;border-bottom:1px solid #E6E6EA">
        <div style="flex:1;min-width:0"><div data-okr-modal-title style="${HEAD};font-size:18px;font-weight:600">${o.title}</div>${o.sub ? `<div style="font-size:12.5px;color:${CINZA};margin-top:4px;line-height:1.5">${o.sub}</div>` : ""}</div>
        <span data-okr-close data-hover title="Fechar" style="width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.x, 16, CINZA)}</span>
      </div>
      <div data-okr-body style="padding:18px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:14px">${o.body}</div>
      <div data-okr-foot style="display:flex;align-items:center;gap:10px;padding:14px 22px;border-top:1px solid #E6E6EA;flex-wrap:wrap">
        ${o.extra || ""}<span style="flex:1"></span>
        <span data-okr-close style="${BTN_SEC};padding:10px 16px;border-radius:10px;font-size:13px">${o.cancel || "Cancelar"}</span>
        ${o.submit === false ? "" : `<button type="submit" style="${BTN_PRI};padding:10px 18px;border-radius:10px;font-size:13px">${o.submit || "Salvar"}</button>`}
      </div>
    </form>`;
    document.body.appendChild(m);
    m.addEventListener("click", ev => {
      if(ev.target === m || ev.target.closest("[data-okr-close]")){ ev.stopPropagation(); fecharModal(); return; }
      if(o.onClick) o.onClick(ev, m);
    });
    if(o.onInput) m.addEventListener("input", ev => o.onInput(ev, m));
    if(o.onChange) m.addEventListener("change", ev => o.onChange(ev, m));
    m.querySelector("form").addEventListener("submit", async ev => {
      ev.preventDefault();
      if(!o.onSubmit) return;
      const btn = m.querySelector("button[type=submit]");
      if(btn){ btn.disabled = true; btn.style.opacity = ".6"; }
      const r = await o.onSubmit(m);
      if(r !== false) fecharModal(); else if(btn){ btn.disabled = false; btn.style.opacity = ""; }
    });
    const primeiro = m.querySelector("input:not([type=hidden]),textarea,select"); if(primeiro && !o.noFocus) primeiro.focus();
    return m;
  }
  document.addEventListener("keydown", ev => { if(ev.key === "Escape") fecharModal(); });

  // ─── Cabeçalho, barra do ciclo e abas ───────────────────────────────────────
  function cicloBarra(){
    const d = D(), c = d.cycle;
    const stCor = c ? (c.status === "ativo" ? VERDE : c.status === "planejado" ? AMBAR : CINZA) : CINZA;
    const stTxt = c ? (c.status === "ativo" ? "Ativo" : c.status === "planejado" ? "Planejado" : "Encerrado") : "";
    const selCiclo = d.cycles.length > 1 ? `<select data-okr-cycle class="cat-select" style="font-size:12.5px;padding:7px 30px 7px 10px">${d.cycles.map(x => `<option value="${e(x.id)}" ${c && c.id === x.id ? "selected" : ""}>${e(x.name)}${x.status !== "ativo" ? " · " + (x.status === "planejado" ? "planejado" : "encerrado") : ""}</option>`).join("")}</select>` : "";
    return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 18px;border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;margin-bottom:16px">
      ${icon(ICONS.chart, 16, CINZA)}
      ${c ? `<strong style="font-size:13.5px;font-weight:600">${e(c.name)}</strong>
      <span style="font-size:12.5px;color:${CINZA}">${dataCurta(c.startDate)} a ${dataCurta(c.endDate)}</span>
      <span style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:${stCor};background:${stCor}14;border:1px solid ${stCor}55;padding:4px 10px;border-radius:20px"><span style="width:5px;height:5px;border-radius:50%;background:${stCor}"></span>${stTxt}</span>
      ${c.status === "ativo" ? `<span style="font-size:12px;color:${CINZA}">${c.daysLeft === 0 ? "último dia" : c.daysLeft + (c.daysLeft === 1 ? " dia restante" : " dias restantes")} · ${c.expected}% do tempo</span>` : ""}`
      : `<strong style="font-size:13.5px;font-weight:600">Sem ciclo ativo</strong><span style="font-size:12.5px;color:${CINZA}">Crie um ciclo para organizar os objetivos por período.</span>`}
      <span style="margin-left:auto;display:flex;flex-wrap:wrap;gap:9px;align-items:center">
        ${selCiclo}
        <span data-okr-novo-ciclo data-hover-border style="${BTN_SEC}">${icon(ICONS.plus, 13, "currentColor")}Novo ciclo</span>
        ${c ? (c.status === "ativo" ? `<span data-okr-encerrar data-hover-border style="${BTN_SEC}">${icon(ICONS.check, 13, "currentColor")}Encerrar ciclo</span>` : `<span data-okr-reabrir data-hover-border style="${BTN_SEC}">${icon(ICONS.refresh, 13, "currentColor")}Reativar ciclo</span>`) : ""}
      </span>
    </div>`;
  }
  function abas(){
    const v = ok().view;
    const tab = (id, ic, nome) => `<span data-okr-view="${id}" style="display:flex;align-items:center;gap:7px;padding:7px 13px;border-radius:7px;font-size:12.5px;cursor:pointer;${v === id ? "font-weight:600;background:#FFFFFF;border:1px solid #E6E6EA;color:#17171A" : "color:#3C3C44"}">${icon(ic, 13)}${nome}</span>`;
    return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:16px">
      <div style="display:flex;gap:4px;background:#F2F2F4;border:1px solid #E6E6EA;border-radius:10px;padding:3px">
        ${tab("cockpit", ICONS.grid, "Cockpit")}${tab("arvore", ICONS.align, "Árvore")}${tab("cards", ICONS.grid, "Cards")}${tab("tabela", ICONS.table, "Tabela")}
      </div>
      <span data-okr-ia data-hover-border style="margin-left:auto;${BTN_SEC};padding:10px 15px;font-weight:600">${icon(ICONS.sparkle, 13, "none", AMBAR)}Criar com IA</span>
      <span data-okr-novo data-hover-dark style="${BTN_PRI}">${icon(ICONS.plus, 13, "currentColor")}Novo objetivo</span>
    </div>`;
  }

  // ─── Cockpit ────────────────────────────────────────────────────────────────
  function grafico(){
    const d = D(), c = d.cycle;
    if(!c) return "";
    const W = 760, H = 230, L = 42, R = 26, T = 18, B = 34;
    const t0 = Date.parse(c.startDate), t1 = Date.parse(c.endDate), tn = Date.parse(d.today);
    const x = iso => L + (W - L - R) * Math.max(0, Math.min(1, (Date.parse(iso) - t0) / (t1 - t0)));
    const y = p => T + (H - T - B) * (1 - p / 100);
    const pts = d.timeline.length ? d.timeline : [{ date: c.startDate, real: 0 }];
    const ultimo = pts[pts.length - 1];
    const linha = pts.map(p => `${x(p.date).toFixed(1)},${y(p.real).toFixed(1)}`).join(" ");
    const area = `M${x(pts[0].date).toFixed(1)},${y(0)} L${linha.replace(/ /g, " L")} L${x(ultimo.date).toFixed(1)},${y(0)} Z`;
    // marcas de mês
    const meses = []; const dm = new Date(t0); dm.setUTCDate(1); dm.setUTCMonth(dm.getUTCMonth() + 1);
    while(dm.getTime() < t1){ meses.push(dm.toISOString().slice(0, 10)); dm.setUTCMonth(dm.getUTCMonth() + 1); }
    const hojeDentro = tn >= t0 && tn <= t1;
    const xh = x(d.today);
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Progresso real contra o esperado no ciclo">
      ${[0, 25, 50, 75, 100].map(p => `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" stroke="#EEEEF1"/><text x="${L - 8}" y="${y(p) + 4}" text-anchor="end" font-size="10.5" fill="#9A9AA3">${p}%</text>`).join("")}
      ${meses.map(m => `<line x1="${x(m)}" x2="${x(m)}" y1="${T}" y2="${H - B}" stroke="#F1F1F3"/><text x="${x(m)}" y="${H - B + 16}" text-anchor="middle" font-size="10.5" fill="#9A9AA3">${MESES_CAP[+m.slice(5, 7) - 1]}</text>`).join("")}
      <text x="${L}" y="${H - B + 16}" text-anchor="start" font-size="10.5" fill="#9A9AA3">${dataCurta(c.startDate)}</text>
      <text x="${W - R}" y="${H - B + 16}" text-anchor="end" font-size="10.5" fill="#9A9AA3">${dataCurta(c.endDate)}</text>
      <line x1="${x(c.startDate)}" y1="${y(0)}" x2="${x(c.endDate)}" y2="${y(100)}" stroke="#17171A" stroke-width="1.4" stroke-dasharray="5 4" opacity=".55"/>
      <path d="${area}" fill="rgba(103,61,230,0.10)"/>
      <polyline points="${linha}" fill="none" stroke="${AMBAR}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.slice(1).map(p => `<circle cx="${x(p.date)}" cy="${y(p.real)}" r="3" fill="#FFFFFF" stroke="${AMBAR}" stroke-width="2"/>`).join("")}
      ${hojeDentro ? `<line x1="${xh}" x2="${xh}" y1="${T}" y2="${H - B}" stroke="${VERM}" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/><text x="${xh + 4}" y="${T + 10}" font-size="10.5" fill="${VERM}">hoje</text>` : ""}
      <text x="${Math.min(x(ultimo.date) + 8, W - R - 30)}" y="${y(ultimo.real) - 8}" font-size="12" font-weight="700" fill="${AMBAR}">${ultimo.real}%</text>
      <text x="${(L + W - R) / 2 + 6}" y="${y(50) - 8}" font-size="10.5" fill="#66666F" transform="rotate(${-Math.round(Math.atan2(y(0) - y(100), W - R - L) * 180 / Math.PI)} ${(L + W - R) / 2} ${y(50)})">esperado pelo tempo</text>
    </svg>`;
  }
  function cockpit(){
    const d = D(), s = d.summary;
    const tile = (n, t, sub, cor) => `<div style="${BOX};padding:18px 20px"><div style="${HEAD};font-size:26px;font-weight:600;color:${cor || "#17171A"};line-height:1.1">${n}</div><div style="font-size:12px;color:${CINZA};margin-top:6px">${t}</div>${sub ? `<div style="font-size:11.5px;color:#9A9AA3;margin-top:3px">${sub}</div>` : ""}</div>`;
    const atencao = d.attention;
    const pend = d.pendingCheckins;
    const porArea = {};
    objs().forEach(o => { const k = o.areaId || "_"; (porArea[k] = porArea[k] || { nome: areaNome(o.areaId) || "Sem área", n: 0, soma: 0 }); porArea[k].n++; porArea[k].soma += o.progress; });
    const areas = Object.values(porArea).sort((a, b) => a.soma / a.n - b.soma / b.n);
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:16px">
      ${tile(s.ativos, "Objetivos ativos", s.concluidos ? s.concluidos + " concluído" + (s.concluidos > 1 ? "s" : "") : "")}
      ${tile(s.mediaReal + "%", "% médio real", s.esperado !== null ? "esperado pelo tempo: " + s.esperado + "%" : "", s.esperado !== null && s.esperado - s.mediaReal > 10 ? VERM : "#17171A")}
      ${tile(s.emRisco + s.atrasados, "Em risco e atrasados", s.atrasados + " atrasado" + (s.atrasados === 1 ? "" : "s") + " · " + s.emRisco + " em risco", s.emRisco + s.atrasados ? VERM : VERDE)}
      ${tile(s.krsStale, "KRs sem update há mais de " + d.staleDays + " dias", "de " + s.krsTotal + " resultados-chave", s.krsStale ? AMBAR : VERDE)}
    </div>
    <div style="${BOX};margin-bottom:16px;${atencao.length ? "border-color:rgba(192,52,28,0.3);background:#FFFCFB" : ""}">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:${atencao.length ? 14 : 4}px">${icon(ICONS.warn, 15, atencao.length ? VERM : VERDE)}<h3 style="${HEAD};font-size:14.5px;font-weight:600;margin:0">${atencao.length ? "Precisa da sua atenção" : "Tudo em dia"}</h3>${atencao.length ? `<span style="font-size:12px;color:${CINZA}">${atencao.length} objetivo${atencao.length > 1 ? "s" : ""} abaixo do ritmo do ciclo</span>` : ""}</div>
      ${atencao.length ? atencao.map(a => `<div data-okr-open="${e(a.id)}" data-hover style="display:flex;align-items:center;gap:12px;padding:10px 8px;border-radius:9px;cursor:pointer">
        <span style="flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(a.title)}</span>
        <span style="font-size:11.5px;color:${CINZA};white-space:nowrap">${e(a.owner || "Sem responsável")}</span>
        <span style="width:90px">${bar(a.progress, null, a.expected, 5)}</span>
        <span style="font-size:12px;font-weight:700;width:36px;text-align:right">${a.progress}%</span>
        <span style="font-size:11.5px;width:70px;text-align:right">${gapTxt(a)}</span>
        ${badge(a.status, true)}
      </div>`).join("") : `<div style="font-size:12.5px;color:${CINZA};padding:6px 0 2px">Nenhum objetivo em risco ou atrasado no ciclo.</div>`}
    </div>
    <div style="${BOX};margin-bottom:16px;display:flex;flex-wrap:wrap;align-items:center;gap:14px">
      <div style="flex:1;min-width:240px">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">${icon(ICONS.clock, 15, AMBAR)}<h3 style="${HEAD};font-size:14.5px;font-weight:600;margin:0">Fazer check-in</h3></div>
        <div style="font-size:12.5px;color:#3C3C44;line-height:1.5">${pend.length ? `${pend.length} resultado${pend.length > 1 ? "s" : ""}-chave está${pend.length > 1 ? "o" : ""} sem atualização há mais de ${d.staleDays} dias e pode${pend.length > 1 ? "m" : ""} receber um check-in agora.` : "Todos os resultados-chave foram atualizados recentemente. Você pode registrar um check-in mesmo assim."}</div>
      </div>
      <span data-okr-checkin data-hover-dark style="${BTN_PRI}">${icon(ICONS.check, 13, "currentColor")}Fazer check-in</span>
    </div>
    <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:16px">
      <div style="${BOX}">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px"><h3 style="${HEAD};font-size:14.5px;font-weight:600;margin:0">Progresso do ciclo</h3><span style="font-size:12px;color:${CINZA}">média real dos objetivos do topo contra a linha esperada</span></div>
        ${d.cycle ? grafico() : `<div style="font-size:12.5px;color:${CINZA}">Crie um ciclo para acompanhar o ritmo.</div>`}
      </div>
      <div style="${BOX}">
        <h3 style="${HEAD};font-size:14.5px;font-weight:600;margin:0 0 14px">Por área</h3>
        ${areas.length ? `<div style="display:flex;flex-direction:column;gap:12px">${areas.map(a => { const p = Math.round(a.soma / a.n); return `<div><div style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:5px"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(a.nome)}</span><span style="font-size:11.5px;color:${CINZA}">${a.n} obj.</span><strong>${p}%</strong></div>${bar(p, null, null, 6)}</div>`; }).join("")}</div>` : `<div style="font-size:12.5px;color:${CINZA}">Sem objetivos ainda.</div>`}
        <div style="margin-top:18px;padding-top:14px;border-top:1px solid #E6E6EA;display:flex;flex-wrap:wrap;gap:8px">${s.porStatus.filter(x => x.n).map(x => { const y = ST[x.status]; return `<span data-okr-filtro-status="${x.status}" title="Ver nos cards" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:${y[1]};background:${y[2]};border:1px solid ${y[3]};padding:3px 9px;border-radius:20px;cursor:pointer"><span style="width:5px;height:5px;border-radius:50%;background:${y[1]}"></span>${y[0]} · ${x.n}</span>`; }).join("")}</div>
      </div>
    </div>`;
  }

  // ─── Árvore ─────────────────────────────────────────────────────────────────
  const NW = 200, NH = 108, HG = 22, VG = 66;
  function layoutTree(lista){
    const byId = {}; lista.forEach(o => { byId[o.id] = o; });
    const roots = lista.filter(o => !o.parentId || !byId[o.parentId]);
    const kids = id => lista.filter(o => o.parentId === id);
    const width = {}, pos = {}; let maxDepth = 0;
    const seen = new Set();
    function w(o){ if(seen.has(o.id)) return NW; seen.add(o.id); const c = kids(o.id); if(!c.length) return width[o.id] = NW; const s = c.reduce((a, x) => a + w(x), 0) + HG * (c.length - 1); return width[o.id] = Math.max(NW, s); }
    roots.forEach(w);
    const seen2 = new Set();
    function place(o, x0, depth){
      if(seen2.has(o.id)) return; seen2.add(o.id);
      const W = width[o.id] || NW, c = kids(o.id);
      pos[o.id] = { x: x0 + (W - NW) / 2, y: depth * (NH + VG) }; maxDepth = Math.max(maxDepth, depth);
      let x = x0 + (W - (c.reduce((a, k) => a + (width[k.id] || NW), 0) + HG * (c.length - 1))) / 2;
      c.forEach(k => { place(k, x, depth + 1); x += (width[k.id] || NW) + HG; });
    }
    let x = 0; roots.forEach(r => { place(r, x, 0); x += (width[r.id] || NW) + HG * 2; });
    return { pos, w: Math.max(NW, x - HG * 2), h: (maxDepth + 1) * NH + maxDepth * VG, roots: roots.length };
  }
  function arvore(){
    const o = ok(), lista = objs(), q = norm(o.q);
    const lay = layoutTree(lista);
    const hit = x => !q || norm(x.title + " " + x.owner + " " + areaNome(x.areaId)).indexOf(q) >= 0;
    const linhas = lista.filter(c => c.parentId && lay.pos[c.parentId] && lay.pos[c.id]).map(c => {
      const p = lay.pos[c.parentId], k = lay.pos[c.id];
      const px = p.x + NW / 2, py = p.y + NH, kx = k.x + NW / 2, ky = k.y, my = py + VG / 2;
      return `<path d="M${px},${py} V${my} H${kx} V${ky}" fill="none" stroke="#B4B4BC" stroke-width="1.3" stroke-dasharray="4 3"/>`;
    }).join("");
    const contadores = lista.filter(p => lay.pos[p.id] && lista.some(c => c.parentId === p.id)).map(p => { const n = lista.filter(c => c.parentId === p.id).length; const x = lay.pos[p.id].x + NW / 2, y = lay.pos[p.id].y + NH + VG / 2; return `<g><rect x="${x - 13}" y="${y - 9}" width="26" height="18" rx="9" fill="#FFFFFF" stroke="#DADADF"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#3C3C44">${n}</text></g>`; }).join("");
    const nos = lista.filter(x => lay.pos[x.id]).map(x => { const p = lay.pos[x.id]; const st = ST[x.status] || ST.em_andamento; const dim = q && !hit(x);
      return `<div data-okr-node="${e(x.id)}" style="position:absolute;left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px;box-sizing:border-box;padding:10px 12px;border:1px solid ${q && hit(x) ? AMBAR : "#E6E6EA"};border-radius:12px;background:#FFFFFF;box-shadow:0 4px 14px rgba(23,23,26,0.05);cursor:pointer;display:flex;flex-direction:column;gap:6px;opacity:${dim ? .3 : 1};transition:opacity .2s,box-shadow .2s">
        <div style="display:flex;align-items:flex-start;gap:6px"><span style="width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:${st[1]};margin-top:5px"></span><span style="flex:1;min-width:0;font-size:12px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${e(x.title)}</span>${x.status === "atrasado" || x.status === "em_risco" ? icon(ICONS.warn, 12, st[1]) : ""}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:10.5px;color:${CINZA}">${x.areaId ? `<span style="background:#F7F7F8;border:1px solid #E6E6EA;padding:1px 6px;border-radius:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px">${e(areaNome(x.areaId))}</span>` : `<span style="background:rgba(103,61,230,0.10);color:${AMBAR};padding:1px 6px;border-radius:5px">Empresa</span>`}<span style="margin-left:auto;white-space:nowrap">${x.krsTotal} KR${x.krsTotal === 1 ? "" : "s"}</span></div>
        <div style="margin-top:auto;display:flex;align-items:center;gap:8px;font-size:10.5px;color:${CINZA}"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(x.owner || "Sem responsável")}</span><strong style="color:#17171A;font-size:11px">${x.progress}%</strong></div>
        ${bar(x.progress, st[1], null, 4)}
      </div>`; }).join("");
    const t = o.tree;
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><strong style="font-size:13px">Objetivos da empresa</strong><span style="font-size:12px;color:${CINZA}">${lay.roots} objetivo${lay.roots === 1 ? "" : "s"} no topo · ${lista.length} no total</span><span style="margin-left:auto;font-size:11.5px;color:#9A9AA3">arraste para mover · role para dar zoom</span></div>
    <div id="okr-tree" data-w="${lay.w}" data-h="${lay.h}" style="position:relative;height:600px;border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF radial-gradient(#DADADF 1px, transparent 1px) 0 0/18px 18px;overflow:hidden;cursor:grab;user-select:none">
      <div id="okr-tree-layer" style="position:absolute;left:0;top:0;transform:translate(${t.x}px,${t.y}px) scale(${t.s});transform-origin:0 0;width:${lay.w}px;height:${lay.h}px">
        <svg width="${lay.w}" height="${lay.h}" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none">${linhas}${contadores}</svg>
        ${nos || `<div style="position:absolute;left:0;top:0;width:${NW}px;font-size:12.5px;color:${CINZA}">Nenhum objetivo no ciclo. Crie o primeiro em "Novo objetivo".</div>`}
      </div>
      <label data-okr-tree-ui style="position:absolute;left:14px;top:14px;display:block;width:220px;cursor:text"><span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);display:flex">${icon(ICONS.search, 13, "#9A9AA3")}</span><input data-okr-q value="${e(o.q)}" placeholder="Buscar objetivo" style="width:100%;padding:8px 10px 8px 32px;border:1px solid #DADADF;border-radius:20px;font:inherit;font-size:12.5px;background:#FFFFFF;outline:none;box-shadow:0 4px 12px rgba(23,23,26,0.06)"></label>
      <div data-okr-tree-ui style="position:absolute;right:14px;top:14px;display:flex;gap:12px;padding:7px 12px;border:1px solid #E6E6EA;border-radius:20px;background:#FFFFFF;font-size:11px;color:#3C3C44;box-shadow:0 4px 12px rgba(23,23,26,0.06)">${["em_andamento", "em_risco", "atrasado", "concluido"].map(s => `<span style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:50%;background:${ST[s][1]}"></span>${ST[s][0]}</span>`).join("")}</div>
      <div data-okr-tree-ui style="position:absolute;left:14px;bottom:14px;display:flex;flex-direction:column;gap:4px;border:1px solid #E6E6EA;border-radius:10px;background:#FFFFFF;padding:3px;box-shadow:0 4px 12px rgba(23,23,26,0.06)">
        <span data-okr-zoom="in" data-hover title="Aproximar" style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.plus, 13)}</span>
        <span data-okr-zoom="out" data-hover title="Afastar" style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/></svg></span>
        <span data-okr-zoom="fit" data-hover title="Ajustar à tela" style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></span>
      </div>
    </div>`;
  }
  function treeApply(){ const t = ok().tree, l = document.getElementById("okr-tree-layer"); if(l) l.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.s})`; }
  function treeFit(){
    const c = document.getElementById("okr-tree"); if(!c) return;
    const w = +c.dataset.w || NW, h = +c.dataset.h || NH, cw = c.clientWidth, ch = c.clientHeight;
    const s = Math.max(0.3, Math.min(1, (cw - 60) / w, (ch - 120) / h));
    const t = ok().tree; t.s = s; t.x = Math.round((cw - w * s) / 2); t.y = Math.round(Math.max(64, (ch - h * s) / 2)); t.fitted = true;
    treeApply();
  }
  function treeZoom(fator, cx, cy){
    const c = document.getElementById("okr-tree"); if(!c) return;
    const t = ok().tree; const s2 = Math.max(0.3, Math.min(2.2, t.s * fator));
    if(cx === undefined){ cx = c.clientWidth / 2; cy = c.clientHeight / 2; }
    t.x = cx - (cx - t.x) * s2 / t.s; t.y = cy - (cy - t.y) * s2 / t.s; t.s = s2;
    treeApply();
  }
  // Arrastar: um único par de listeners na janela (a tela é repintada várias vezes)
  let _drag = null;
  window.addEventListener("mousemove", ev => { if(!_drag) return; const dx = ev.clientX - _drag.x, dy = ev.clientY - _drag.y; if(Math.abs(dx) + Math.abs(dy) > 4) _drag.moved = true; const t = ok().tree; t.x = _drag.tx + dx; t.y = _drag.ty + dy; treeApply(); });
  window.addEventListener("mouseup", () => { if(!_drag) return; const d = _drag; _drag = null; d.el.style.cursor = "grab"; if(d.moved){ d.el.dataset.moved = "1"; setTimeout(() => { delete d.el.dataset.moved; }, 50); } });
  function bindTree(root){
    const c = root.querySelector("#okr-tree"); if(!c || c.dataset.bound) return;
    c.dataset.bound = "1";
    if(!ok().tree.fitted) treeFit();
    c.addEventListener("mousedown", ev => { if(ev.button !== 0 || ev.target.closest("[data-okr-tree-ui]")) return; _drag = { el: c, x: ev.clientX, y: ev.clientY, tx: ok().tree.x, ty: ok().tree.y, moved: false }; c.style.cursor = "grabbing"; ev.preventDefault(); });
    c.addEventListener("wheel", ev => { ev.preventDefault(); const r = c.getBoundingClientRect(); treeZoom(ev.deltaY < 0 ? 1.1 : 0.9, ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });
    c.addEventListener("click", ev => {
      if(c.dataset.moved) return;
      const z = ev.target.closest("[data-okr-zoom]"); if(z){ ev.stopPropagation(); const k = z.dataset.okrZoom; if(k === "fit") treeFit(); else treeZoom(k === "in" ? 1.2 : 0.83); return; }
      const n = ev.target.closest("[data-okr-node]"); if(n){ ev.stopPropagation(); abrirDetalhe(n.dataset.okrNode); }
    });
  }

  // ─── Cards e Tabela (com filtros) ───────────────────────────────────────────
  function filtrados(){
    const o = ok(), f = o.f, q = norm(o.q);
    let l = objs().filter(x => (!f.status || x.status === f.status) && (!f.area || x.areaId === f.area) && (!f.owner || x.owner === f.owner) && (!f.atencao || x.status === "atrasado" || x.status === "em_risco")
      && (!q || norm(x.title + " " + x.owner + " " + areaNome(x.areaId) + " " + x.krs.map(k => k.title).join(" ")).indexOf(q) >= 0));
    const ordem = { atrasado: 0, em_risco: 1, em_andamento: 2, nao_iniciado: 3, concluido: 4 };
    if(o.sort === "risco") l.sort((a, b) => (ordem[a.status] - ordem[b.status]) || ((a.gap ?? 0) - (b.gap ?? 0)));
    else if(o.sort === "progresso") l.sort((a, b) => a.progress - b.progress);
    else if(o.sort === "titulo") l.sort((a, b) => a.title.localeCompare(b.title));
    else if(o.sort === "atualizacao") l.sort((a, b) => (b.daysSinceUpdate ?? 999) - (a.daysSinceUpdate ?? 999));
    return l;
  }
  function filtros(){
    const o = ok(), f = o.f, d = D();
    const cs = "cat-select";
    const chip = (attr, on, txt, ic) => `<span ${attr} style="display:flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid ${on ? "rgba(103,61,230,0.55)" : "#DADADF"};background:${on ? "rgba(103,61,230,0.06)" : "#FFFFFF"};border-radius:10px;font-size:12.5px;color:${on ? AMBAR : "#3C3C44"};cursor:pointer">${ic || ""}${txt}</span>`;
    const donos = [...new Set(objs().map(x => x.owner).filter(Boolean))].sort();
    return `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;align-items:center">
      <label style="position:relative;display:block;width:220px"><span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);display:flex">${icon(ICONS.search, 13, "#9A9AA3")}</span><input data-okr-q value="${e(o.q)}" placeholder="Buscar objetivo ou KR" style="width:100%;padding:9px 10px 9px 32px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:12.5px;background:#FFFFFF;outline:none"></label>
      <select data-okr-f="status" class="${cs}"><option value="">Todos os status</option>${Object.keys(ST).map(s => `<option value="${s}" ${f.status === s ? "selected" : ""}>${ST[s][0]}</option>`).join("")}</select>
      <select data-okr-f="area" class="${cs}"><option value="">Todas as áreas</option>${d.areas.map(a => `<option value="${e(a.id)}" ${f.area === a.id ? "selected" : ""}>${e(a.name)}</option>`).join("")}</select>
      <select data-okr-f="owner" class="${cs}"><option value="">Todos os donos</option>${donos.map(n => `<option value="${e(n)}" ${f.owner === n ? "selected" : ""}>${e(n)}</option>`).join("")}</select>
      ${chip('data-okr-atencao', f.atencao, "Precisa de atenção", icon(ICONS.warn, 13, f.atencao ? AMBAR : AMBAR))}
      <select data-okr-sort class="${cs}" style="margin-left:auto">${[["risco", "Ordenar por risco"], ["progresso", "Menor progresso"], ["atualizacao", "Mais tempo sem update"], ["titulo", "Título A–Z"]].map(x => `<option value="${x[0]}" ${o.sort === x[0] ? "selected" : ""}>${x[1]}</option>`).join("")}</select>
    </div>`;
  }
  function cardHTML(o){
    const pai = o.parentId ? objById(o.parentId) : null;
    const st = ST[o.status] || ST.em_andamento;
    return `<div data-okr-open="${e(o.id)}" class="cat-card" style="border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:18px;display:flex;flex-direction:column;gap:12px;cursor:pointer">
      ${pai ? `<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:${CINZA}"><span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">sob ${e(pai.title)}</span></div>` : `<div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:${AMBAR}">EMPRESA</div>`}
      <div style="display:flex;align-items:flex-start;gap:14px">
        ${ring(o.progress, 46, st[1])}
        <div style="flex:1;min-width:0">
          <div style="${HEAD};font-size:15px;font-weight:600;line-height:1.3;margin-bottom:9px">${e(o.title)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${badge(o.status)}${o.areaId ? `<span style="display:inline-block;font-size:11px;color:#3C3C44;background:#F7F7F8;border:1px solid #E6E6EA;padding:3px 9px;border-radius:6px">${e(areaNome(o.areaId))}</span>` : ""}</div>
        </div>
      </div>
      <div style="border-top:1px solid #E6E6EA;padding-top:13px;flex:1">
        ${o.krs.length ? `<div style="display:flex;flex-direction:column;gap:8px">${o.krs.map(k => `<div style="display:flex;gap:9px;align-items:center;font-size:12.5px;color:#3C3C44;line-height:1.4"><span style="width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:${ST[k.status][1]}"></span><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(k.title)}</span><span style="font-size:11.5px;color:${CINZA};white-space:nowrap">${fmtVal(k.current, k.unit)} / ${fmtVal(k.to, k.unit)}</span><strong style="font-size:11.5px;width:34px;text-align:right">${k.progress}%</strong></div>`).join("")}</div>`
        : o.children.length ? `<div style="font-size:12.5px;color:${CINZA}">Desdobrado em ${o.children.length} objetivo${o.children.length > 1 ? "s" : ""}: progresso é a média deles.</div>` : `<div style="font-size:12.5px;color:${CINZA}">Sem resultados-chave.</div>`}
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding-top:12px;border-top:1px solid #E6E6EA;font-size:11.5px;color:${CINZA}">
        <span style="width:22px;height:22px;flex:0 0 22px;border-radius:50%;background:rgba(103,61,230,0.14);color:${AMBAR};font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center">${e(ini(o.owner))}</span>
        <span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(o.owner || "Sem responsável")}</span>
        <span style="margin-left:auto;white-space:nowrap">${atualizadoTxt(o)}</span>
        ${gapTxt(o)}
      </div>
    </div>`;
  }
  function cards(){
    const l = filtrados();
    return filtros() + (l.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px">${l.map(cardHTML).join("")}</div>`
      : `<div style="padding:40px;border:1px dashed #DADADF;border-radius:14px;color:${CINZA};font-size:13px;text-align:center">${objs().length ? "Nenhum objetivo com esses filtros." : "Nenhum objetivo neste ciclo. Crie o primeiro em <strong>Novo objetivo</strong> ou use <strong>Criar com IA</strong>."}</div>`);
  }
  function tabela(){
    const o = ok(), l = filtrados();
    const cols = "minmax(260px,2.4fr) minmax(110px,1fr) minmax(130px,1.1fr) minmax(150px,1.4fr) 70px 110px 110px";
    const linha = x => { const ab = !!o.expanded[x.id]; const pai = x.parentId ? objById(x.parentId) : null;
      return `<div data-okr-open="${e(x.id)}" class="pdi-row" style="display:grid;grid-template-columns:${cols};gap:14px;align-items:center;padding:12px 18px;border-top:1px solid #F1F1F3;cursor:pointer">
        <span style="display:flex;align-items:center;gap:8px;min-width:0">
          <span data-okr-expand="${e(x.id)}" title="${ab ? "Recolher" : "Ver resultados-chave"}" style="width:22px;height:22px;flex:0 0 22px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:${x.krs.length ? "#3C3C44" : "#D3D3D8"};transform:rotate(${ab ? 90 : 0}deg);transition:transform .2s">${icon(ICONS.chevRight, 12)}</span>
          <span style="min-width:0"><span style="display:block;font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(x.title)}</span>${pai ? `<span style="display:block;font-size:11.5px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">sob ${e(pai.title)}</span>` : `<span style="display:block;font-size:11px;color:${AMBAR};font-weight:700;letter-spacing:.06em">EMPRESA</span>`}</span>
        </span>
        <span style="font-size:12.5px;color:#4A4A52">${e(areaNome(x.areaId) || "—")}</span>
        <span style="font-size:12.5px;color:#4A4A52;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(x.owner || "—")}</span>
        <span style="display:flex;align-items:center;gap:10px"><span style="flex:1">${bar(x.progress, null, x.expected)}</span><strong style="font-size:12.5px;width:36px;text-align:right">${x.progress}%</strong></span>
        <span style="font-size:12.5px;color:#4A4A52">${x.krsDone}/${x.krsTotal}</span>
        <span style="font-size:12px;color:${x.krsStale ? VERM : "#4A4A52"}">${x.lastUpdate ? (x.daysSinceUpdate === 0 ? "hoje" : "há " + x.daysSinceUpdate + "d") : "nunca"}${x.krsStale ? ` <span title="${x.krsStale} KR(s) sem update">·${x.krsStale}</span>` : ""}</span>
        <span>${badge(x.status, true)}</span>
      </div>
      ${ab && x.krs.length ? x.krs.map(k => `<div style="display:grid;grid-template-columns:${cols};gap:14px;align-items:center;padding:8px 18px 8px 48px;background:#FAFAFA;border-top:1px solid #F1F1F3">
        <span style="display:flex;align-items:center;gap:8px;min-width:0;font-size:12.5px"><span style="width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:${ST[k.status][1]}"></span><span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(k.title)}</span></span>
        <span style="font-size:12px;color:${CINZA}">${fmtVal(k.from, k.unit)} → ${fmtVal(k.to, k.unit)}</span>
        <span style="font-size:12px;color:#4A4A52">atual <strong>${fmtVal(k.current, k.unit)}</strong></span>
        <span style="display:flex;align-items:center;gap:10px"><span style="flex:1">${bar(k.progress, ST[k.status][1], null, 5)}</span><strong style="font-size:12px;width:36px;text-align:right">${k.progress}%</strong></span>
        <span></span>
        <span style="font-size:12px;color:${k.stale ? VERM : CINZA}">${k.lastUpdate ? (k.daysSinceUpdate === 0 ? "hoje" : "há " + k.daysSinceUpdate + "d") : "nunca"}</span>
        <span><span data-okr-kr-quick="${e(k.id)}" style="${BTN_MINI}">Atualizar</span></span>
      </div>`).join("") : ""}`; };
    return filtros() + `<div style="border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;overflow-x:auto"><div style="min-width:1000px">
      <div style="display:grid;grid-template-columns:${cols};gap:14px;padding:11px 18px;font-size:11px;letter-spacing:0.08em;font-weight:700;color:${CINZA};background:#FAFAFA"><span>OBJETIVO</span><span>ÁREA</span><span>RESPONSÁVEL</span><span title="A marca escura é o esperado pelo tempo do ciclo">PROGRESSO · ESPERADO</span><span>KRS</span><span>ÚLTIMO UPDATE</span><span>STATUS</span></div>
      ${l.length ? l.map(linha).join("") : `<div style="padding:30px;color:${CINZA};font-size:13px;text-align:center">Nenhum objetivo com esses filtros.</div>`}
    </div></div>`;
  }

  // ─── Página ─────────────────────────────────────────────────────────────────
  function page(){
    const o = ok();
    const topo = `<h1 style="${HEAD};font-size:25px;font-weight:600;margin:0 0 6px">OKRs</h1><p style="margin:0 0 22px;color:${CINZA}">Objetivos e resultados-chave da empresa, desdobrados por área, equipe e colaborador.</p>`;
    if(!o.data) return `<div style="padding:34px 40px 60px;max-width:1240px">${topo}<div style="padding:40px;color:${CINZA}">${o.error ? "Não consegui carregar os OKRs: " + e(o.error) : "Carregando OKRs..."}</div></div>`;
    const corpo = o.view === "arvore" ? arvore() : o.view === "cards" ? cards() : o.view === "tabela" ? tabela() : cockpit();
    return `<div style="padding:34px 40px 60px;max-width:1240px">${topo}${cicloBarra()}${abas()}<div id="okr-view">${corpo}</div></div>`;
  }
  function paint(){ const root = document.getElementById("okr-root"); if(!root) return; root.innerHTML = page(); bindTree(root); if(typeof attach === "function") attach(); }
  function paintView(){ const v = document.getElementById("okr-view"); if(!v) return paint(); const o = ok(); v.innerHTML = o.view === "arvore" ? arvore() : o.view === "cards" ? cards() : o.view === "tabela" ? tabela() : cockpit(); bindTree(v); }

  // ─── Detalhe do objetivo ────────────────────────────────────────────────────
  function krItemHTML(k){
    const st = ST[k.status];
    return `<div data-kr-item="${e(k.id)}" style="border:1px solid #E6E6EA;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;align-items:center;gap:10px"><span style="flex:1;min-width:0;font-size:13.5px;font-weight:600">${e(k.title)}</span>${badge(k.status, true)}<strong style="font-size:13px;width:40px;text-align:right">${k.progress}%</strong></div>
      ${bar(k.progress, st[1], k.expected, 6)}
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:${CINZA}"><span>De <strong style="color:#3C3C44">${fmtVal(k.from, k.unit)}</strong> para <strong style="color:#3C3C44">${fmtVal(k.to, k.unit)}</strong></span><span>Atual <strong style="color:${AMBAR}">${fmtVal(k.current, k.unit)}</strong></span>${k.dueDate ? `<span>Prazo ${dataBr(k.dueDate)}</span>` : ""}${k.owner ? `<span>${e(k.owner)}</span>` : ""}<span style="color:${k.stale ? VERM : CINZA}">${k.lastUpdate ? (k.daysSinceUpdate === 0 ? "atualizado hoje" : "atualizado há " + k.daysSinceUpdate + " dia" + (k.daysSinceUpdate === 1 ? "" : "s")) : "nunca atualizado"}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px"><span data-kr-ci="${e(k.id)}" style="${BTN_MINI};border-color:rgba(103,61,230,0.45);color:${AMBAR}">${icon(ICONS.check, 12, "currentColor")}Check-in</span><span data-kr-hist="${e(k.id)}" style="${BTN_MINI}">${icon(ICONS.history, 12)}Histórico</span><span data-kr-edit="${e(k.id)}" style="${BTN_MINI}">${icon(ICONS.edit, 12)}Editar</span><span data-kr-del="${e(k.id)}" style="${BTN_MINI};color:${VERM}">${icon(ICONS.trash, 12)}</span></div>
      <div data-kr-ci-box="${e(k.id)}" hidden style="display:grid;grid-template-columns:150px 1fr auto;gap:8px;align-items:end;padding:10px;border-radius:10px;background:#FAFAFA;border:1px solid #E6E6EA">
        <div>${lbl("Valor atual (" + e(k.unit) + ")")}<input data-kr-ci-val value="${e(String(k.current).replace(".", ","))}" inputmode="decimal" style="${IN};padding:8px 10px"></div>
        <div>${lbl("Observação", "opcional")}<input data-kr-ci-note placeholder="O que mudou desde o último check-in?" style="${IN};padding:8px 10px"></div>
        <button type="button" data-kr-ci-save="${e(k.id)}" style="${BTN_PRI};padding:9px 14px">Registrar</button>
      </div>
      <div data-kr-hist-box="${e(k.id)}" hidden style="font-size:12.5px"></div>
    </div>`;
  }
  function detalheHTML(o){
    const pai = o.parentId ? objById(o.parentId) : null;
    const filhos = o.children.map(objById).filter(Boolean);
    const st = ST[o.status];
    return `<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      ${ring(o.progress, 74, st[1])}
      <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${badge(o.status)}${o.areaId ? `<span style="font-size:11px;color:#3C3C44;background:#F7F7F8;border:1px solid #E6E6EA;padding:3px 9px;border-radius:6px">${e(areaNome(o.areaId))}</span>` : `<span style="font-size:11px;color:${AMBAR};background:rgba(103,61,230,0.10);padding:3px 9px;border-radius:6px">Empresa</span>`}${o.teamId ? `<span style="font-size:11px;color:#3C3C44;background:#F7F7F8;border:1px solid #E6E6EA;padding:3px 9px;border-radius:6px">${e(teamNome(o.teamId))}</span>` : ""}<span style="font-size:11px;color:${CINZA}">${PERIODOS[o.period] || o.period}</span></div>
        <div style="font-size:12.5px;color:#3C3C44;display:flex;flex-wrap:wrap;gap:6px 14px"><span>Responsável: <strong>${e(o.owner || "—")}</strong></span><span>${dataBr(o.startDate)} a ${dataBr(o.endDate)}</span>${o.expected !== null ? `<span>Esperado hoje: <strong>${o.expected}%</strong> · ${gapTxt(o)}</span>` : ""}<span>${atualizadoTxt(o)}</span></div>
        ${pai ? `<div style="font-size:12.5px;color:${CINZA}">Desdobra <span data-okr-nav="${e(pai.id)}" style="color:${AMBAR};cursor:pointer;font-weight:600">${e(pai.title)}</span></div>` : ""}
        ${o.description ? `<div style="font-size:13px;color:#3C3C44;line-height:1.55">${e(o.description)}</div>` : ""}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:4px"><h4 style="${HEAD};font-size:14px;font-weight:600;margin:0">Resultados-chave</h4><span style="font-size:12px;color:${CINZA}">${o.krsDone}/${o.krsTotal} concluídos</span><span data-okr-add-kr style="margin-left:auto;${BTN_MINI}">${icon(ICONS.plus, 12)}Adicionar KR</span></div>
    ${o.krs.length ? `<div style="display:flex;flex-direction:column;gap:10px">${o.krs.map(krItemHTML).join("")}</div>` : `<div style="font-size:12.5px;color:${CINZA};padding:10px;border:1px dashed #DADADF;border-radius:10px">${filhos.length ? "Sem KRs próprios: o progresso vem dos objetivos desdobrados abaixo." : "Nenhum resultado-chave. Adicione ao menos um para medir o objetivo."}</div>`}
    ${filhos.length ? `<h4 style="${HEAD};font-size:14px;font-weight:600;margin:6px 0 0">Objetivos desdobrados (${filhos.length})</h4><div style="display:flex;flex-direction:column;gap:6px">${filhos.map(f => `<div data-okr-nav="${e(f.id)}" data-hover style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid #E6E6EA;border-radius:10px;cursor:pointer"><span style="width:8px;height:8px;border-radius:50%;background:${ST[f.status][1]}"></span><span style="flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(f.title)}</span><span style="font-size:11.5px;color:${CINZA}">${e(f.owner)}</span><span style="width:80px">${bar(f.progress, null, null, 5)}</span><strong style="font-size:12px;width:34px;text-align:right">${f.progress}%</strong></div>`).join("")}</div>` : ""}`;
  }
  function refazerDetalhe(){
    const m = document.getElementById("okr-modal"); if(!m || !_detalhe) return;
    const o = objById(_detalhe); if(!o){ fecharModal(); return; }
    const abertos = [...m.querySelectorAll("[data-kr-ci-box]:not([hidden])")].map(x => x.dataset.krCiBox);
    m.querySelector("[data-okr-modal-title]").textContent = o.title;
    m.querySelector("[data-okr-body]").innerHTML = detalheHTML(o);
    abertos.forEach(id => { const b = m.querySelector(`[data-kr-ci-box="${id}"]`); if(b) b.hidden = false; });
  }
  function abrirDetalhe(id){
    const o = objById(id); if(!o) return;
    modal({ title: e(o.title), sub: "Objetivo" + (o.parentId ? " desdobrado" : " da empresa"), width: 720, body: detalheHTML(o), submit: false, cancel: "Fechar", noFocus: true,
      extra: `<span data-okr-del-obj style="${BTN_SEC};color:${VERM}">${icon(ICONS.trash, 13, "currentColor")}Excluir</span><span data-okr-edit-obj style="${BTN_SEC}">${icon(ICONS.edit, 13, "currentColor")}Editar objetivo</span>`,
      onClick: async (ev, m) => {
        const t = ev.target, q = s => t.closest && t.closest(s); let el;
        const cur = () => objById(_detalhe);
        if(q("[data-okr-edit-obj]")) return abrirForm(cur());
        if(q("[data-okr-del-obj]")){ const x = cur(); if(!x) return; if(!confirm(`Excluir "${x.title}"? Os resultados-chave e check-ins dele somem; objetivos desdobrados sobem um nível.`)) return; _detalhe = null; const r = await acao("/objectives/" + encodeURIComponent(x.id), "DELETE"); if(r){ fecharModal(); toast("Objetivo excluído."); } return; }
        if(q("[data-okr-add-kr]")) return abrirKrForm(null, cur());
        if((el = q("[data-okr-nav]"))){ _detalhe = el.dataset.okrNav; return abrirDetalhe(el.dataset.okrNav); }
        if((el = q("[data-kr-ci]"))){ const b = m.querySelector(`[data-kr-ci-box="${el.dataset.krCi}"]`); if(b){ b.hidden = !b.hidden; if(!b.hidden) b.querySelector("[data-kr-ci-val]").focus(); } return; }
        if((el = q("[data-kr-ci-save]"))){ const b = m.querySelector(`[data-kr-ci-box="${el.dataset.krCiSave}"]`); const v = b.querySelector("[data-kr-ci-val]").value.trim(); if(!v) return toast("Informe o valor atual.", true); el.disabled = true; const r = await acao("/krs/" + encodeURIComponent(el.dataset.krCiSave), "PATCH", { current: v, note: b.querySelector("[data-kr-ci-note]").value }); if(r) toast("Check-in registrado."); else el.disabled = false; return; }
        if((el = q("[data-kr-hist]"))){ const b = m.querySelector(`[data-kr-hist-box="${el.dataset.krHist}"]`); if(!b) return; if(!b.hidden){ b.hidden = true; return; } b.hidden = false; b.innerHTML = `<span style="color:${CINZA}">Carregando...</span>`; try { const j = await apiJ("/krs/" + encodeURIComponent(el.dataset.krHist) + "/checkins"); const k = (cur() || { krs: [] }).krs.find(x => x.id === el.dataset.krHist) || { unit: "" }; b.innerHTML = j.checkins.length ? `<div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:10px;background:#FAFAFA;border:1px solid #E6E6EA">${j.checkins.map(c => `<div style="display:flex;gap:10px;align-items:center"><span style="color:${CINZA};width:80px">${dataBr(c.date)}</span><strong style="width:90px">${fmtVal(c.value, k.unit)}</strong><span style="flex:1;min-width:0;color:#3C3C44;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(c.note || "")}</span><span style="color:#9A9AA3;font-size:11px">${e(c.author || "")}</span><span data-ci-del="${e(c.id)}" title="Apagar" style="cursor:pointer;color:#9A9AA3">${icon(ICONS.x, 11, "currentColor")}</span></div>`).join("")}</div>` : `<span style="color:${CINZA}">Nenhum check-in registrado.</span>`; } catch(err){ b.innerHTML = `<span style="color:${VERM}">${e(err.message)}</span>`; } return; }
        if((el = q("[data-ci-del]"))){ if(!confirm("Apagar este check-in? O valor atual volta para o anterior.")) return; const r = await acao("/checkins/" + encodeURIComponent(el.dataset.ciDel), "DELETE"); if(r) toast("Check-in apagado."); return; }
        if((el = q("[data-kr-edit]"))){ const k = (cur() || { krs: [] }).krs.find(x => x.id === el.dataset.krEdit); if(k) abrirKrForm(k, cur()); return; }
        if((el = q("[data-kr-del]"))){ if(!confirm("Excluir este resultado-chave e o histórico dele?")) return; const r = await acao("/krs/" + encodeURIComponent(el.dataset.krDel), "DELETE"); if(r) toast("Resultado-chave excluído."); return; }
      } });
    _detalhe = id;
    const m = document.getElementById("okr-modal"); if(m) m.querySelector("form").addEventListener("keydown", ev => { if(ev.key === "Enter" && ev.target.matches("[data-kr-ci-val],[data-kr-ci-note]")){ ev.preventDefault(); const box = ev.target.closest("[data-kr-ci-box]"); const b = box && box.querySelector("[data-kr-ci-save]"); if(b) b.click(); } });
  }

  // ─── Formulário de objetivo (novo / editar) ─────────────────────────────────
  function krRowHTML(k){
    k = k || {};
    const d = D();
    return `<div data-kr-row style="border:1px solid #E6E6EA;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;background:#FAFAFA">
      <div>${lbl("Resultado-chave")}<input data-kr-title value="${e(k.title || "")}" placeholder="Ex.: Reduzir churn" style="${IN};padding:9px 11px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 112px 1fr 30px;gap:8px;align-items:end">
        <div>${lbl("De")}<input data-kr-from value="${e(k.from !== undefined ? String(k.from).replace(".", ",") : "")}" inputmode="decimal" placeholder="0" style="${IN};padding:9px 11px"></div>
        <div>${lbl("Para")}<input data-kr-to value="${e(k.to !== undefined ? String(k.to).replace(".", ",") : "")}" inputmode="decimal" placeholder="100" style="${IN};padding:9px 11px"></div>
        <div>${lbl("Unidade")}<select data-kr-unit style="${IN};padding:9px 8px">${d.units.map(u => `<option value="${e(u)}" ${(k.unit || "%") === u ? "selected" : ""}>${e(u)}</option>`).join("")}</select></div>
        <div>${lbl("Prazo")}<input data-kr-due type="date" value="${e(k.dueDate || "")}" style="${IN};padding:8px 10px"></div>
        <span data-kr-row-del title="Remover" style="width:30px;height:38px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${CINZA}">${icon(ICONS.trash, 14, "currentColor")}</span>
      </div>
    </div>`;
  }
  function coletarKrs(m){
    return [...m.querySelectorAll("[data-kr-row]")].map(r => ({ title: r.querySelector("[data-kr-title]").value.trim(), from: r.querySelector("[data-kr-from]").value.trim() || "0", to: r.querySelector("[data-kr-to]").value.trim() || "100", unit: r.querySelector("[data-kr-unit]").value, dueDate: r.querySelector("[data-kr-due]").value || null })).filter(k => k.title);
  }
  function abrirForm(o, preset){
    const d = D(); o = o || null; preset = preset || {};
    const c = d.cycle;
    const excl = o ? descendentes(o.id) : new Set(); if(o) excl.add(o.id);
    const pais = objs().filter(x => !excl.has(x.id));
    const people = d.people;
    const body = `
      <div>${lbl("Objetivo")}<input name="title" required value="${e(o ? o.title : preset.title || "")}" placeholder="Ex.: Crescer receita recorrente" style="${IN}"></div>
      <div>${lbl("Descrição", "opcional")}<textarea name="description" rows="2" placeholder="Contexto do objetivo" style="${IN};resize:vertical">${e(o ? o.description : preset.description || "")}</textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>${lbl("Área")}${sel("areaId", o ? o.areaId || "" : preset.areaId || "", [["", "Sem área"]].concat(d.areas.map(a => [a.id, a.name])))}</div>
        <div>${lbl("Equipe")}${sel("teamId", o ? o.teamId || "" : "", [["", "Sem equipe"]].concat(d.teams.map(t => [t.id, t.name])))}</div>
        <div>${lbl("Responsável*")}<input name="owner" required list="okr-pessoas" value="${e(o ? o.owner : preset.owner || "")}" placeholder="Selecione um responsável" style="${IN}" autocomplete="off"><datalist id="okr-pessoas">${people.map(n => `<option value="${e(n)}">`).join("")}</datalist></div>
        <div>${lbl("Periodicidade")}${sel("period", o ? o.period : "trimestral", Object.entries(PERIODOS))}</div>
        <div>${lbl("Ciclo")}${sel("cycleId", o ? o.cycleId || "" : (c ? c.id : ""), [["", "Sem ciclo"]].concat(d.cycles.map(x => [x.id, x.name])))}</div>
        <div>${lbl("Desdobra o objetivo", "opcional")}${sel("parentId", o ? o.parentId || "" : preset.parentId || "", [["", "Nenhum (objetivo da empresa)"]].concat(pais.map(x => [x.id, x.title])))}</div>
        <div>${lbl("Início")}<input name="startDate" type="date" value="${e(o ? o.startDate || "" : (c ? c.startDate : ""))}" style="${IN}"></div>
        <div>${lbl("Fim")}<input name="endDate" type="date" value="${e(o ? o.endDate || "" : (c ? c.endDate : ""))}" style="${IN}"></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:4px"><strong style="font-size:13px">${o ? "Novos resultados-chave" : "Resultados-chave"}</strong>${o && o.krs.length ? `<span style="font-size:12px;color:${CINZA}">os ${o.krs.length} existentes você edita no detalhe</span>` : ""}<span data-okr-gerar-krs style="margin-left:auto;${BTN_MINI}">${icon(ICONS.sparkle, 12, "none", AMBAR)}Gerar com IA</span></div>
      <div data-kr-list style="display:flex;flex-direction:column;gap:10px">${o ? "" : krRowHTML(preset.krs && preset.krs[0]) + (preset.krs && preset.krs.length > 1 ? preset.krs.slice(1).map(krRowHTML).join("") : "")}</div>
      <span data-kr-add style="align-self:flex-start;${BTN_MINI}">${icon(ICONS.plus, 12)}Adicionar resultado-chave</span>`;
    modal({ title: o ? "Editar objetivo" : "Novo objetivo", sub: "Defina o objetivo, os resultados-chave e o responsável. O progresso é calculado a partir dos valores dos KRs.", width: 640, body, submit: o ? "Salvar alterações" : "Salvar objetivo",
      onClick: async (ev, m) => {
        const t = ev.target, q = s => t.closest && t.closest(s); let el;
        if(q("[data-kr-add]")){ const l = m.querySelector("[data-kr-list]"); l.insertAdjacentHTML("beforeend", krRowHTML()); l.lastElementChild.querySelector("[data-kr-title]").focus(); return; }
        if((el = q("[data-kr-row-del]"))){ el.closest("[data-kr-row]").remove(); return; }
        if((el = q("[data-okr-gerar-krs]"))){
          const title = m.querySelector("[name=title]").value.trim(); if(!title) return toast("Escreva o objetivo antes de gerar os KRs.", true);
          el.innerHTML = `<span class="zeus-pensando"><i></i><i></i><i></i></span>Gerando...`; el.style.pointerEvents = "none";
          try { const j = await apiJ("/generate-krs", "POST", { title, description: m.querySelector("[name=description]").value, area: areaNome(m.querySelector("[name=areaId]").value) }); const l = m.querySelector("[data-kr-list]"); [...l.querySelectorAll("[data-kr-row]")].forEach(r => { if(!r.querySelector("[data-kr-title]").value.trim()) r.remove(); }); j.krs.forEach(k => l.insertAdjacentHTML("beforeend", krRowHTML(k))); toast(j.krs.length + " resultados-chave sugeridos. Ajuste os números se precisar."); }
          catch(err){ toast("Erro: " + err.message, true); }
          el.innerHTML = `${icon(ICONS.sparkle, 12, "none", AMBAR)}Gerar com IA`; el.style.pointerEvents = "";
        }
      },
      onSubmit: async m => {
        const g = n => m.querySelector(`[name=${n}]`).value.trim();
        const dados = { title: g("title"), description: g("description"), areaId: g("areaId"), teamId: g("teamId"), owner: g("owner"), period: g("period"), cycleId: g("cycleId"), parentId: g("parentId"), startDate: g("startDate"), endDate: g("endDate"), krs: coletarKrs(m) };
        if(!dados.title){ toast("Dê um nome ao objetivo.", true); return false; }
        if(!dados.owner){ toast("Escolha um responsável.", true); m.querySelector("[name=owner]").focus(); return false; }
        if(dados.startDate && dados.endDate && dados.endDate <= dados.startDate){ toast("O fim precisa ser depois do início.", true); return false; }
        const r = await acao(o ? "/objectives/" + encodeURIComponent(o.id) : "/objectives", o ? "PATCH" : "POST", dados);
        if(!r) return false;
        if(dados.cycleId && ok().cycleId && dados.cycleId !== ok().cycleId){ ok().cycleId = dados.cycleId; load(); }
        toast(o ? "Objetivo atualizado." : "Objetivo criado.");
        if(o){ setTimeout(() => abrirDetalhe(o.id), 0); }
        else if(r.createdId){ setTimeout(() => abrirDetalhe(r.createdId), 0); }
      } });
  }
  function abrirKrForm(k, o){
    const d = D();
    const body = `<div>${lbl("Resultado-chave")}<input name="title" required value="${e(k ? k.title : "")}" placeholder="Ex.: Ticket médio" style="${IN}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div>${lbl("De")}<input name="from" value="${e(k ? String(k.from).replace(".", ",") : "0")}" inputmode="decimal" style="${IN}"></div>
        <div>${lbl("Para")}<input name="to" value="${e(k ? String(k.to).replace(".", ",") : "100")}" inputmode="decimal" style="${IN}"></div>
        <div>${lbl("Unidade")}${sel("unit", k ? k.unit : "%", d.units.map(u => [u, u]))}</div>
        <div>${lbl("Prazo")}<input name="dueDate" type="date" value="${e(k ? k.dueDate || "" : (o && o.endDate) || "")}" style="${IN}"></div>
        <div style="grid-column:span 2">${lbl("Responsável do KR", "opcional")}<input name="owner" list="okr-pessoas2" value="${e(k ? k.owner : (o ? o.owner : ""))}" style="${IN}" autocomplete="off"><datalist id="okr-pessoas2">${d.people.map(n => `<option value="${e(n)}">`).join("")}</datalist></div>
      </div>
      ${k ? `<div style="padding:12px;border-radius:10px;background:#FAFAFA;border:1px solid #E6E6EA">${lbl("Valor atual (" + e(k.unit) + ")", "alterar registra um check-in")}<input name="current" value="${e(String(k.current).replace(".", ","))}" inputmode="decimal" style="${IN}"></div>` : ""}`;
    modal({ title: k ? "Editar resultado-chave" : "Novo resultado-chave", sub: o ? e(o.title) : "", width: 560, body, submit: k ? "Salvar" : "Adicionar",
      onSubmit: async m => {
        const g = n => { const x = m.querySelector(`[name=${n}]`); return x ? x.value.trim() : undefined; };
        const dados = { title: g("title"), from: g("from"), to: g("to"), unit: g("unit"), dueDate: g("dueDate") || null, owner: g("owner") };
        if(!dados.title){ toast("Descreva o resultado-chave.", true); return false; }
        if(k){ const cur = g("current"); if(cur !== undefined && cur !== "") dados.current = cur; }
        const r = await acao(k ? "/krs/" + encodeURIComponent(k.id) : "/objectives/" + encodeURIComponent(o.id) + "/krs", k ? "PATCH" : "POST", dados);
        if(!r) return false;
        toast(k ? "Resultado-chave atualizado." : "Resultado-chave adicionado.");
        setTimeout(() => abrirDetalhe(o.id), 0);
      } });
  }

  // ─── Check-in em lote ───────────────────────────────────────────────────────
  function abrirCheckin(preKr){
    const d = D();
    const todos = objs().flatMap(o => o.krs.filter(k => k.status !== "concluido").map(k => Object.assign({ objTitle: o.title }, k)));
    const pend = todos.filter(k => k.stale);
    let mostrarTodos = !pend.length || !!preKr;
    const linhas = lista => lista.length ? lista.map(k => `<div data-ci-row="${e(k.id)}" style="border:1px solid #E6E6EA;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;${preKr === k.id ? "border-color:rgba(103,61,230,0.55);background:rgba(103,61,230,0.04)" : ""}">
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer"><input type="checkbox" data-ci-on ${!preKr || preKr === k.id ? "checked" : ""} style="accent-color:${AMBAR};margin-top:3px"><span style="flex:1;min-width:0"><span style="display:block;font-size:13px;font-weight:600">${e(k.title)}</span><span style="display:block;font-size:11.5px;color:${CINZA}">${e(k.objTitle)} · ${k.lastUpdate ? "atualizado há " + k.daysSinceUpdate + "d" : "nunca atualizado"} · meta ${fmtVal(k.to, k.unit)}</span></span><strong style="font-size:12px">${k.progress}%</strong></label>
        <div style="display:grid;grid-template-columns:150px 1fr;gap:8px;padding-left:26px"><input data-ci-val value="${e(String(k.current).replace(".", ","))}" inputmode="decimal" title="Valor atual (${e(k.unit)})" style="${IN};padding:8px 10px"><input data-ci-note placeholder="Observação (opcional)" style="${IN};padding:8px 10px"></div>
      </div>`).join("") : `<div style="font-size:12.5px;color:${CINZA};padding:10px">Nenhum resultado-chave pendente.</div>`;
    const body = () => `<div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:#3C3C44"><span>${mostrarTodos ? `${todos.length} resultado${todos.length === 1 ? "" : "s"}-chave em aberto` : `${pend.length} sem atualização há mais de ${d.staleDays} dias`}</span>${pend.length && pend.length !== todos.length ? `<span data-ci-toggle style="margin-left:auto;${BTN_MINI}">${mostrarTodos ? "Só os parados" : "Mostrar todos"}</span>` : ""}</div>
      <div data-ci-list style="display:flex;flex-direction:column;gap:10px">${linhas(mostrarTodos ? todos : pend)}</div>`;
    modal({ title: "Fazer check-in", sub: "Confirme ou atualize o valor atual de cada resultado-chave marcado. Cada linha registrada entra no histórico.", width: 640, body: body(), submit: "Registrar check-ins", noFocus: true,
      onClick: (ev, m) => { if(ev.target.closest("[data-ci-toggle]")){ mostrarTodos = !mostrarTodos; m.querySelector("[data-okr-body]").innerHTML = body(); } },
      onSubmit: async m => {
        const items = [...m.querySelectorAll("[data-ci-row]")].filter(r => r.querySelector("[data-ci-on]").checked).map(r => ({ krId: r.dataset.ciRow, value: r.querySelector("[data-ci-val]").value.trim(), note: r.querySelector("[data-ci-note]").value.trim() })).filter(x => x.value);
        if(!items.length){ toast("Marque ao menos um resultado-chave com valor.", true); return false; }
        const r = await acao("/checkins", "POST", { items });
        if(!r) return false;
        toast(`${r.registered} check-in${r.registered === 1 ? "" : "s"} registrado${r.registered === 1 ? "" : "s"}.`);
      } });
    if(preKr){ const m = document.getElementById("okr-modal"); const r = m && m.querySelector(`[data-ci-row="${preKr}"]`); if(r){ r.scrollIntoView({ block: "center" }); r.querySelector("[data-ci-val]").focus(); } }
  }

  // ─── Ciclos ─────────────────────────────────────────────────────────────────
  function sugerirCiclo(){
    const d = D(); const base = d.cycle ? new Date(d.cycle.endDate + "T12:00:00Z") : new Date(hojeIso() + "T12:00:00Z");
    if(d.cycle) base.setUTCDate(base.getUTCDate() + 1);
    const ano = base.getUTCFullYear(), tri = Math.floor(base.getUTCMonth() / 3);
    const ini = `${ano}-${String(tri * 3 + 1).padStart(2, "0")}-01`;
    const fim = `${ano}-${String(tri * 3 + 3).padStart(2, "0")}-${new Date(Date.UTC(ano, tri * 3 + 3, 0)).getUTCDate()}`;
    return { name: `${tri + 1}º Ciclo ${ano} (${MESES_CAP[tri * 3]}–${MESES_CAP[tri * 3 + 2]})`, ini, fim };
  }
  function abrirNovoCiclo(){
    const d = D(), s = sugerirCiclo();
    const body = `<div>${lbl("Nome do ciclo")}<input name="name" required value="${e(s.name)}" style="${IN}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div>${lbl("Início")}<input name="startDate" type="date" required value="${s.ini}" style="${IN}"></div><div>${lbl("Fim")}<input name="endDate" type="date" required value="${s.fim}" style="${IN}"></div></div>
      <label style="display:flex;gap:10px;align-items:flex-start;font-size:13px;cursor:pointer"><input type="checkbox" name="activate" checked style="accent-color:${AMBAR};margin-top:2px"><span>Ativar agora${d.cycle && d.cycle.status === "ativo" ? ` <span style="color:${CINZA}">(encerra "${e(d.cycle.name)}")</span>` : ""}</span></label>
      ${d.cycle ? `<label style="display:flex;gap:10px;align-items:flex-start;font-size:13px;cursor:pointer"><input type="checkbox" name="carry" style="accent-color:${AMBAR};margin-top:2px"><span>Levar os objetivos não concluídos de "${e(d.cycle.name)}" para o novo ciclo <span style="color:${CINZA}">(os KRs recomeçam do valor atual)</span></span></label>` : ""}`;
    modal({ title: "Novo ciclo", sub: "Um ciclo agrupa os objetivos de um período. Só um ciclo fica ativo por vez.", width: 520, body, submit: "Criar ciclo",
      onSubmit: async m => {
        const g = n => m.querySelector(`[name=${n}]`);
        const dados = { name: g("name").value.trim(), startDate: g("startDate").value, endDate: g("endDate").value, activate: g("activate").checked, carryFrom: g("carry") && g("carry").checked && d.cycle ? d.cycle.id : null };
        if(!dados.name){ toast("Dê um nome ao ciclo.", true); return false; }
        if(!dados.startDate || !dados.endDate || dados.endDate <= dados.startDate){ toast("Informe início e fim (fim depois do início).", true); return false; }
        const r = await acao("/cycles", "POST", dados);
        if(!r) return false;
        ok().cycleId = r.cycle ? r.cycle.id : null; ok().tree.fitted = false; paint();
        toast("Ciclo criado" + (dados.activate ? " e ativado." : "."));
      } });
  }
  function abrirEncerrar(){
    const d = D(), c = d.cycle, s = d.summary; if(!c) return;
    modal({ title: "Encerrar ciclo", sub: e(c.name), width: 500, submit: "Encerrar ciclo",
      body: `<div style="font-size:13px;line-height:1.6;color:#3C3C44">O ciclo fica como <strong>encerrado</strong> e os objetivos continuam visíveis para consulta. Você pode criar o próximo ciclo em seguida e levar os objetivos não concluídos.</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">${[[s.total, "objetivos"], [s.concluidos, "concluídos"], [s.mediaReal + "%", "média real"]].map(x => `<div style="${BOX};padding:12px 14px;text-align:center"><div style="${HEAD};font-size:20px;font-weight:600">${x[0]}</div><div style="font-size:11.5px;color:${CINZA}">${x[1]}</div></div>`).join("")}</div>`,
      onSubmit: async () => { const r = await acao("/cycles/" + encodeURIComponent(c.id), "PATCH", { status: "encerrado" }); if(!r) return false; toast("Ciclo encerrado."); } });
  }

  // ─── Criar com IA ───────────────────────────────────────────────────────────
  function abrirIA(){
    const d = D();
    let gerados = null, ultimoCtx = null;
    const form = () => `<div>${lbl("O que a empresa quer alcançar neste ciclo?")}<textarea name="context" rows="4" placeholder="Ex.: Crescer 30% em receita nova, reduzir o churn e estruturar o time de vendas. Somos uma agência de marketing com 12 pessoas..." style="${IN};resize:vertical">${e(ultimoCtx ? ultimoCtx.context : "")}</textarea></div>
      <div style="display:grid;grid-template-columns:1fr 130px;gap:12px"><div>${lbl("Foco ou área prioritária", "opcional")}<input name="focus" value="${e(ultimoCtx ? ultimoCtx.focus : "")}" placeholder="Ex.: Comercial e Customer Success" style="${IN}"></div><div>${lbl("Objetivos")}${sel("count", ultimoCtx ? ultimoCtx.count : "3", [["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]])}</div></div>
      ${gerados ? `<div>${lbl("Quer ajustar?", "opcional")}<input name="adjust" placeholder="Ex.: KRs mais agressivos, foque em retenção" style="${IN}"></div>` : ""}`;
    const resultado = () => !gerados ? "" : `<div style="display:flex;align-items:center;gap:10px;margin-top:4px"><strong style="font-size:13px">Sugestões</strong><span style="font-size:12px;color:${CINZA}">desmarque o que não quiser salvar</span><span style="margin-left:auto;font-size:12.5px">Responsável padrão</span><input name="owner" list="okr-pessoas3" value="${e(d.me)}" style="${IN};width:180px;padding:7px 10px" autocomplete="off"><datalist id="okr-pessoas3">${d.people.map(n => `<option value="${e(n)}">`).join("")}</datalist></div>
      <div style="display:flex;flex-direction:column;gap:10px">${gerados.map((o, i) => `<label data-ia-obj="${i}" style="display:flex;gap:12px;padding:14px;border:1px solid #E6E6EA;border-radius:12px;cursor:pointer;background:#FFFFFF"><input type="checkbox" data-ia-on checked style="accent-color:${AMBAR};margin-top:3px"><span style="flex:1;min-width:0"><span style="display:block;${HEAD};font-size:14px;font-weight:600">${e(o.title)}</span>${o.description ? `<span style="display:block;font-size:12.5px;color:#3C3C44;margin-top:3px;line-height:1.5">${e(o.description)}</span>` : ""}<span style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${o.area ? `<span style="font-size:11px;color:#3C3C44;background:#F7F7F8;border:1px solid #E6E6EA;padding:2px 8px;border-radius:6px">${e(o.area)}</span>` : ""}<span style="font-size:11px;color:${CINZA}">${PERIODOS[o.period] || "Trimestral"}</span></span><span style="display:flex;flex-direction:column;gap:4px;margin-top:8px">${o.krs.map(k => `<span style="display:flex;gap:8px;font-size:12.5px;color:#3C3C44"><span style="color:${AMBAR}">•</span><span style="flex:1">${e(k.title)}</span><span style="color:${CINZA};white-space:nowrap">${fmtVal(k.from, k.unit)} → ${fmtVal(k.to, k.unit)}</span></span>`).join("")}</span></span></label>`).join("")}</div>`;
    const m = modal({ title: "Criar OKRs com IA", sub: "O ZEUS monta objetivos com resultados-chave mensuráveis a partir do contexto. Você revisa antes de salvar.", width: 680, body: form(), submit: "Gerar objetivos",
      onSubmit: async mm => {
        const g = n => { const x = mm.querySelector(`[name=${n}]`); return x ? x.value.trim() : ""; };
        if(!gerados || g("adjust") || g("context") !== ultimoCtx.context){
          const ctx = { context: g("context"), focus: g("focus"), count: g("count"), adjust: g("adjust") };
          if(!ctx.context){ toast("Conte o que a empresa quer alcançar.", true); return false; }
          const anterior = ultimoCtx; ultimoCtx = ctx;
          const body = mm.querySelector("[data-okr-body]");
          body.innerHTML = form() + `<div style="padding:26px;text-align:center"><span class="zeus-pensando"><i></i><i></i><i></i></span><div style="font-size:12.5px;color:${CINZA};margin-top:10px">Montando objetivos e resultados-chave... leva de 15 a 40 segundos.</div></div>`;
          try { const j = await apiJ("/generate", "POST", ctx); gerados = j.objectives; }
          catch(err){ toast("Erro: " + err.message, true); ultimoCtx = gerados ? anterior : ctx; body.innerHTML = form() + resultado(); return false; }
          body.innerHTML = form() + resultado();
          mm.querySelector("button[type=submit]").textContent = "Salvar objetivos marcados";
          return false;
        }
        const marcados = [...mm.querySelectorAll("[data-ia-obj]")].filter(l => l.querySelector("[data-ia-on]").checked).map(l => gerados[+l.dataset.iaObj]);
        if(!marcados.length){ toast("Marque ao menos um objetivo.", true); return false; }
        const owner = g("owner") || d.me;
        const r = await acao("/objectives/bulk", "POST", { cycleId: d.cycle ? d.cycle.id : null, objectives: marcados.map(o => ({ title: o.title, description: o.description, areaId: o.areaId, period: o.period, owner, krs: o.krs })) });
        if(!r) return false;
        ok().tree.fitted = false; paint();
        toast(`${marcados.length} objetivo${marcados.length === 1 ? "" : "s"} criado${marcados.length === 1 ? "" : "s"}.`);
      } });
    m.querySelector("form").addEventListener("keydown", ev => { if(ev.key === "Enter" && ev.target.tagName !== "TEXTAREA"){ ev.preventDefault(); } });
  }

  // ─── Eventos da tela ────────────────────────────────────────────────────────
  function bind(root){
    bindOnce(root, "click", ev => {
      const t = ev.target, q = s => t.closest && t.closest(s); let el;
      if((el = q("[data-okr-view]"))){ ok().view = el.dataset.okrView; if(ok().view === "arvore") ok().tree.fitted = false; paint(); return; }
      if(q("[data-okr-novo]")) return abrirForm(null);
      if(q("[data-okr-ia]")) return abrirIA();
      if(q("[data-okr-checkin]")) return abrirCheckin();
      if(q("[data-okr-novo-ciclo]")) return abrirNovoCiclo();
      if(q("[data-okr-encerrar]")) return abrirEncerrar();
      if(q("[data-okr-reabrir]")){ const c = D().cycle; if(c && confirm(`Reativar "${c.name}"? O ciclo ativo atual será encerrado.`)) acao("/cycles/" + encodeURIComponent(c.id), "PATCH", { status: "ativo" }).then(r => { if(r) toast("Ciclo reativado."); }); return; }
      if(q("[data-okr-atencao]")){ ok().f.atencao = !ok().f.atencao; paintView(); return; }
      if((el = q("[data-okr-filtro-status]"))){ ok().f = { status: el.dataset.okrFiltroStatus, area: "", owner: "", atencao: false }; ok().view = "cards"; paint(); return; }
      if((el = q("[data-okr-expand]"))){ ev.stopPropagation(); ok().expanded[el.dataset.okrExpand] = !ok().expanded[el.dataset.okrExpand]; paintView(); return; }
      if((el = q("[data-okr-kr-quick]"))){ ev.stopPropagation(); return abrirCheckin(el.dataset.okrKrQuick); }
      if((el = q("[data-okr-open]"))) return abrirDetalhe(el.dataset.okrOpen);
    });
    bindOnce(root, "input", ev => {
      if(ev.target.matches("[data-okr-q]")){ const v = ev.target.value; ok().q = v; if(ok().view === "arvore"){ const layer = document.getElementById("okr-tree-layer"); if(layer){ const lista = objs(); const qn = norm(v); layer.querySelectorAll("[data-okr-node]").forEach(n => { const o = lista.find(x => x.id === n.dataset.okrNode); const hit = !qn || (o && norm(o.title + " " + o.owner + " " + areaNome(o.areaId)).indexOf(qn) >= 0); n.style.opacity = qn && !hit ? .3 : 1; n.style.borderColor = qn && hit ? AMBAR : "#E6E6EA"; }); } }
        else { clearTimeout(bind._t); bind._t = setTimeout(() => { const inp = document.querySelector("[data-okr-q]"); const pos = inp ? inp.selectionStart : null; paintView(); const inp2 = document.querySelector("[data-okr-q]"); if(inp2){ inp2.focus(); if(pos !== null) inp2.setSelectionRange(pos, pos); } }, 180); } }
    });
    bindOnce(root, "change", ev => {
      const t = ev.target;
      if(t.matches("[data-okr-f]")){ ok().f[t.dataset.okrF] = t.value; paintView(); return; }
      if(t.matches("[data-okr-sort]")){ ok().sort = t.value; paintView(); return; }
      if(t.matches("[data-okr-cycle]")){ ok().tree.fitted = false; load(t.value); return; }
    });
  }

  // ─── Card da home ───────────────────────────────────────────────────────────
  let _homeLoading = false;
  window.okrHomeLoad = async function(){
    if(_homeLoading) return; _homeLoading = true;
    try { state.okrHome = await apiJ("/resumo"); } catch(err){ state.okrHome = { _error: err.message }; }
    _homeLoading = false;
    if(state.screen === "home" && typeof homeCardsRefresh === "function") homeCardsRefresh();
  };
  window.okrHomeCardHTML = function(){
    const o = state.okrHome;
    if(!o) return `<div style="font-size:12.5px;color:${CINZA};padding:10px 0">Carregando OKRs...</div>`;
    if(o._error) return `<div style="font-size:12.5px;color:${CINZA};padding:10px 0">Não consegui carregar os OKRs agora.</div>`;
    if(!o.destaque.length) return `<div style="font-size:12.5px;color:${CINZA};padding:10px 0">Nenhum objetivo no ciclo. <span data-go="okrs" style="color:${AMBAR};cursor:pointer;font-weight:600">Criar o primeiro</span></div>`;
    const alerta = (o.summary.atrasados + o.summary.emRisco) ? `${o.summary.atrasados + o.summary.emRisco} objetivo${o.summary.atrasados + o.summary.emRisco > 1 ? "s" : ""} abaixo do ritmo` : "Objetivos no ritmo do ciclo";
    return `<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:14px">${o.destaque.map(x => `<div data-go="okrs" style="display:flex;align-items:center;gap:12px;cursor:pointer"><span style="flex:1;min-width:0;font-size:13px;color:#3C3C44;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(x.title)}</span><span style="width:110px">${bar(x.progress, ST[x.status][1], null, 6)}</span><span style="font-size:12.5px;font-weight:700;width:36px;text-align:right">${x.progress}%</span></div>`).join("")}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;margin-bottom:14px"><span style="font-weight:700;color:${(o.summary.atrasados + o.summary.emRisco) ? VERM : VERDE}">${alerta}</span><span style="color:${o.krsStale ? AMBAR : CINZA}">${o.krsStale ? o.krsStale + " KR" + (o.krsStale > 1 ? "s" : "") + " sem update" : "KRs atualizados"}</span>${o.cycle ? `<span style="color:${CINZA}">${o.summary.mediaReal}% real · ${o.cycle.expected}% do tempo</span>` : ""}</div>`;
  };
  document.addEventListener("click", ev => {
    const el = ev.target && ev.target.closest && ev.target.closest("[data-okr-home-checkin]");
    if(!el) return;
    ev.stopPropagation(); ok().openCheckin = true;
    setState({ screen: "okrs", wsMenuOpen: false, userMenuOpen: false });
    if(D()){ ok().openCheckin = false; setTimeout(abrirCheckin, 50); }
  });

  // ─── plug na Central ────────────────────────────────────────────────────────
  RENDERERS.okrs = function(){
    setTimeout(() => {
      const root = document.getElementById("okr-root"); if(!root) return;
      bind(root);
      const o = ok();
      if(!o.data && !o.loading) load();
      else if(o.data){ bindTree(root); }
    }, 0);
    return `<div id="okr-root">${page()}</div>`;
  };
  if(state.screen === "okrs"){ const slot = document.getElementById("main-slot"); if(slot){ slot.innerHTML = RENDERERS.okrs(); } }
  // A home pode ter sido pintada antes deste script existir: carrega o card agora
  if(state.screen === "home" && !state.okrHome) window.okrHomeLoad();
})();
