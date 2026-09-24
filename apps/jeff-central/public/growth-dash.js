// Motor de Growth: dashboard de mídia paga com dados reais (substitui a maquete estática de renderGrowthDash).
// Une o que existia em dois sites separados (ads.propostaebcmkt2026.shop e metadash.jefersonhenrike.com) no desenho da Central.
// Carregado depois do script principal: usa state, render, icon, ICONS, e (escape), bindOnce e RENDERERS de lá.
(function(){
  const VERDE = "#0F7A68", AMBAR = "#673DE6", VERM = "#C0341C", AZUL = "#4A6CF7", CINZA = "#66666F", ROXO2 = "#C25FD6", ROXO_ESC = "#2B1E8C";
  const PERIODOS = [["7d","Últimos 7 dias"],["14d","Últimos 14 dias"],["30d","Últimos 30 dias"],["90d","Últimos 90 dias"],["mes","Este mês"],["mes_passado","Mês passado"]];
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const lsGet = k => { try { return localStorage.getItem(k); } catch(err){ return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(err){} };

  function gw(){ return state.growth || {}; }
  function gwSet(patch){ state.growth = Object.assign({}, gw(), patch); render(); }

  // ─── formatação ────────────────────────────────────────────────────────────
  const moeda = () => (gw().data && gw().data.conta && gw().data.conta.currency) || "BRL";
  const fN = v => Math.round(Number(v) || 0).toLocaleString("pt-BR");
  const fM = v => { try { return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: moeda() }); } catch(err){ return "R$ " + (Number(v) || 0).toFixed(2); } };
  const fMc = v => { v = Number(v) || 0; return v >= 10000 ? fM(Math.round(v)).replace(/,00$/, "") : fM(v); };
  const fP = v => (Number(v) || 0).toFixed(2).replace(".", ",") + "%";
  const fK = v => { v = Number(v) || 0; return v >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + " mi" : v >= 1e4 ? (v / 1e3).toFixed(1).replace(".", ",") + " mil" : fN(v); };
  const dm = s => s.slice(8) + "/" + s.slice(5, 7);
  // variação contra o período anterior; "bomSeSobe" inverte a cor para custos
  function delta(v, bomSeSobe){
    if(v == null) return "";
    if(!isFinite(v) || Math.abs(v) < 0.5) return `<span style="font-size:11.5px;color:${CINZA}">estável</span>`;
    const sobe = v > 0, bom = bomSeSobe === undefined ? null : (sobe === bomSeSobe);
    const cor = bom === null ? CINZA : bom ? VERDE : VERM;
    return `<span style="font-size:11.5px;font-weight:600;color:${cor}">${sobe ? "▲" : "▼"} ${Math.abs(v).toFixed(0)}%</span>`;
  }

  // ─── gráficos SVG (mesmo traço dos da Central) ─────────────────────────────
  let _gid = 0;
  function pathOf(vals, w, h, top, bottom){
    const max = Math.max(1e-9, ...vals), n = vals.length, ih = h - top - bottom;
    return vals.map((v, i) => `${i ? "L" : "M"}${(n === 1 ? w / 2 : i / (n - 1) * w).toFixed(1)} ${(top + ih - v / max * ih).toFixed(1)}`).join(" ");
  }
  const spark = (vals, cor) => `<svg viewBox="0 0 160 34" preserveAspectRatio="none" style="width:100%;height:34px;display:block"><path d="${pathOf(vals.length ? vals : [0,0], 160, 34, 4, 4)}" fill="none" stroke="${cor || VERDE}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  function area(vals, cor){
    const c = cor || AMBAR, id = "gwA" + (++_gid), p = pathOf(vals.length ? vals : [0,0], 420, 90, 8, 4);
    return `<svg viewBox="0 0 420 90" preserveAspectRatio="none" style="width:100%;height:90px;display:block"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c}" stop-opacity="0.22"/><stop offset="100%" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><path d="${p} L420 90 L0 90 Z" fill="url(#${id})"/><path d="${p}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function eixoX(labels, X){
    const n = labels.length; if(!n) return "";
    const idx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n > 1 ? [0, n - 1] : [0];
    return idx.map(i => `<text x="${X(i).toFixed(0)}" y="132" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${e(labels[i])}</text>`).join("");
  }
  function linha(vals, labels, cor, fmt){
    const f = fmt || fK, max = Math.max(1e-9, ...vals), n = vals.length;
    const X = i => 56 + (n <= 1 ? 118 : i / (n - 1) * 236), Y = v => 106 - v / max * 88;
    const p = vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
    const temDado = vals.some(v => v > 0);
    return `<svg viewBox="0 0 300 150" style="width:100%;height:auto;display:block"><g stroke="#F1F1F3" stroke-width="1"><line x1="56" y1="18" x2="292" y2="18"/><line x1="56" y1="62" x2="292" y2="62"/><line x1="56" y1="106" x2="292" y2="106"/></g>
      <g fill="${CINZA}" font-size="9" font-family="DM Sans" text-anchor="end"><text x="50" y="21">${temDado ? e(f(max)) : ""}</text><text x="50" y="65">${temDado ? e(f(max / 2)) : ""}</text><text x="50" y="109">${e(f(0))}</text></g>
      <path d="${temDado ? p : "M56 106 L292 106"}" fill="none" stroke="${cor || AMBAR}" stroke-width="1.8"/>
      <g fill="${CINZA}" font-size="9" font-family="DM Sans">${eixoX(labels, X)}</g></svg>`;
  }
  // barras (eixo esquerdo) + linha (eixo direito): os combinados "Investimento × Resultados" do metadash
  function combo(barras, linhaVals, labels, fB, fL, corB, corL){
    const n = barras.length, maxB = Math.max(1e-9, ...barras), maxL = Math.max(1e-9, ...linhaVals), W = 640, x0 = 58, x1 = 590, y0 = 20, y1 = 168;
    const passo = (x1 - x0) / Math.max(1, n), bw = Math.max(2, Math.min(18, passo * 0.62));
    const X = i => x0 + passo * (i + 0.5), YB = v => y1 - v / maxB * (y1 - y0), YL = v => y1 - v / maxL * (y1 - y0);
    const grade = [0, 0.5, 1].map(t => { const y = y1 - t * (y1 - y0); return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#F1F1F3"/><text x="${x0 - 6}" y="${y + 3}" text-anchor="end" fill="${CINZA}">${e(fB(maxB * t))}</text><text x="${x1 + 6}" y="${y + 3}" text-anchor="start" fill="${CINZA}">${e(fL(maxL * t))}</text>`; }).join("");
    const bars = barras.map((v, i) => `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${YB(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y1 - YB(v)).toFixed(1)}" rx="2" fill="${corB}" opacity="0.28"><title>${e(labels[i])}: ${e(fB(v))} · ${e(fL(linhaVals[i]))}</title></rect>`).join("");
    const pl = linhaVals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${YL(v).toFixed(1)}`).join(" ");
    const idx = n > 6 ? [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1] : labels.map((_, i) => i);
    return `<svg viewBox="0 0 ${W} 200" style="width:100%;height:auto;display:block;font-size:10px;font-family:'DM Sans'">${grade}${bars}<path d="${pl}" fill="none" stroke="${corL}" stroke-width="2"/>${linhaVals.map((v, i) => v > 0 && n <= 35 ? `<circle cx="${X(i).toFixed(1)}" cy="${YL(v).toFixed(1)}" r="2.2" fill="${corL}"/>` : "").join("")}
      <g fill="${CINZA}" text-anchor="middle">${idx.map(i => `<text x="${X(i).toFixed(0)}" y="186">${e(labels[i])}</text>`).join("")}</g></svg>`;
  }
  const legenda = itens => `<span style="display:flex;gap:14px;font-size:12px;color:${CINZA};flex-wrap:wrap">${itens.map(i => `<span style="display:flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:${i[2] ? "50%" : "3px"};background:${i[1]};opacity:${i[2] ? 1 : 0.45};display:block"></i>${e(i[0])}</span>`).join("")}</span>`;
  const card = (titulo, corpo, direita, semPad) => `<div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;overflow:hidden;min-width:0"><div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #E6E6EA"><strong style="font-size:13.5px;font-weight:600;flex:1">${e(titulo)}</strong>${direita || ""}</div><div style="${semPad ? "" : "padding:16px"}">${corpo}</div></div>`;
  const secao = (titulo, sub) => `<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;margin:0 0 16px"><h2 style="${HEAD};font-size:19px;font-weight:600;margin:0">${e(titulo)}</h2><span style="font-size:13px;color:${CINZA}">${e(sub)}</span></div>`;
  function barrasH(rows, cor){
    const max = Math.max(1e-9, ...rows.map(r => r.valor));
    return rows.map(r => `<div style="margin-bottom:14px"><div style="display:flex;gap:10px;align-items:baseline;margin-bottom:6px"><span style="flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${e(r.rotulo)}">${e(r.rotulo)}</span><strong style="font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap">${e(r.texto)}</strong></div>
      <div style="height:6px;border-radius:6px;background:rgba(103,61,230,0.10);overflow:hidden"><i style="display:block;height:100%;width:${Math.max(1.5, r.valor / max * 100).toFixed(1)}%;background:${r.cor || cor || AMBAR};border-radius:6px"></i></div>${r.sub ? `<div style="font-size:11.5px;color:${CINZA};margin-top:5px">${e(r.sub)}</div>` : ""}</div>`).join("") || `<div style="font-size:13px;color:${CINZA}">Sem dados no período.</div>`;
  }

  // ─── dados ─────────────────────────────────────────────────────────────────
  let _carregando = false;
  async function carregarContas(){
    if(_carregando) return; _carregando = true;
    try {
      const r = await fetch("/api/growth/accounts"); const j = await r.json();
      if(!r.ok) throw new Error(j.error || "HTTP " + r.status);
      const salvo = lsGet("gw_conta"), id = (j.accounts.find(a => a.id === salvo) || j.accounts.find(a => a.id === j.default_id) || j.accounts[0] || {}).id || null;
      _carregando = false;
      gwSet({ contas: j.accounts, avisos: j.avisos || [], google: j.google, contaId: id, periodo: lsGet("gw_periodo") || "30d", plat: gw().plat || "meta", erro: null });
      if(id) carregarDash(false);
    } catch(err){ _carregando = false; gwSet({ contas: [], erro: "Não consegui listar as contas de anúncio: " + err.message }); }
  }
  let _req = 0;
  async function carregarDash(forcar){
    const g = gw(); if(!g.contaId) return;
    const meu = ++_req; gwSet({ carregando: true, erro: null });
    try {
      const r = await fetch(`/api/growth/meta?account_id=${encodeURIComponent(g.contaId)}&preset=${encodeURIComponent(g.periodo || "30d")}${forcar ? "&force=1" : ""}`); const j = await r.json();
      if(meu !== _req) return;
      if(!r.ok) throw new Error(j.error || "HTTP " + r.status);
      gwSet({ data: j, carregando: false, objetivo: "" });
    } catch(err){ if(meu === _req) gwSet({ carregando: false, erro: "A Meta não respondeu para esta conta: " + err.message }); }
  }

  // ─── partes da tela ────────────────────────────────────────────────────────
  function barraTopo(){
    const tab = (rot, ic, ativo, attr, extra) => `<span ${attr || ""} style="display:flex;align-items:center;gap:8px;padding:16px 2px;font-size:13.5px;${ativo ? `font-weight:600;color:${AMBAR};box-shadow:inset 0 -2px 0 ${AMBAR}` : `color:#3C3C44;cursor:${attr ? "pointer" : "default"}`}">${icon(ic, 14)}${rot}${extra || ""}</span>`;
    return `<div style="display:flex;align-items:center;gap:20px;padding:0 26px;border-bottom:1px solid #E6E6EA;background:#FFFFFF;flex-wrap:wrap;position:sticky;top:0;z-index:5">
      <span data-go="motores" style="display:flex;align-items:center;padding:16px 0;cursor:pointer">${icon(ICONS.arrowLeft, 17, CINZA)}</span>
      ${tab("Copiloto de Growth", ICONS.briefcase, true)}
      ${tab("Estrategista de Growth IA", ICONS.agentes, false, 'data-gw-estrategista class="mv-tab"', `<span style="font-size:10.5px;font-weight:600;color:${VERDE};border:1px solid rgba(15,122,104,0.3);background:rgba(15,122,104,0.08);padding:2px 7px;border-radius:20px">Ativo</span>`)}
      ${tab("Motor de Design", ICONS.bolt, false)}
    </div>`;
  }
  function barraPlataforma(g){
    const p = (k, rot) => `<span data-gw-plat="${k}" style="padding:7px 16px;border-radius:7px;font-size:13px;cursor:pointer;${g.plat === k ? "font-weight:600;background:#FFFFFF;border:1px solid #E6E6EA" : `color:${CINZA};border:1px solid transparent`}">${rot}</span>`;
    return `<div style="display:flex;align-items:center;gap:16px;padding:14px 26px;border-bottom:1px solid #E6E6EA;flex-wrap:wrap">
      <div style="display:flex;gap:3px;background:rgba(103,61,230,0.06);border:1px solid rgba(103,61,230,0.14);border-radius:10px;padding:3px">${p("meta", "Meta")}${p("google", "Google")}${p("ambos", "Ambos")}</div>
      <div style="width:1px;height:26px;background:#E6E6EA"></div>
      <span style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:9px;font-size:13px;font-weight:600;background:rgba(103,61,230,0.12);color:${AMBAR}">${icon(ICONS.grid, 14)}Dashboard</span>
      <span data-gw-estrategista data-hover style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:9px;font-size:13px;color:#3C3C44;cursor:pointer">${icon(ICONS.agentes, 14)}Perguntar ao Estrategista</span>
    </div>`;
  }
  function seletores(g){
    const grupos = {}; (g.contas || []).forEach(a => { (grupos[a.group] = grupos[a.group] || []).push(a); });
    const opt = a => `<option value="${e(a.id)}" ${a.id === g.contaId ? "selected" : ""}>${e(a.name)}${a.active ? "" : " (inativa)"}</option>`;
    return `<select data-gw-conta class="cat-select" style="max-width:280px">${Object.keys(grupos).map(k => `<optgroup label="${e(k)}">${grupos[k].map(opt).join("")}</optgroup>`).join("")}</select>
      <select data-gw-periodo class="cat-select">${PERIODOS.map(p => `<option value="${p[0]}" ${p[0] === (g.periodo || "30d") ? "selected" : ""}>${p[1]}</option>`).join("")}</select>
      <span data-gw-sync data-hover-dark style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:9px;background:${AMBAR};color:#FFFFFF;font-size:12.5px;font-weight:700;cursor:pointer;opacity:${g.carregando ? 0.6 : 1}">${icon(ICONS.refresh, 13, "currentColor")}${g.carregando ? "Sincronizando..." : "Sincronizar"}</span>`;
  }
  function googleVazio(g, compacto){
    const falta = (g.google && g.google.falta) || [];
    return `<div style="border:1px dashed #DADADF;border-radius:14px;background:#FFFFFF;padding:${compacto ? "18px 20px" : "34px 28px"};${compacto ? "margin-bottom:26px" : "text-align:center;max-width:640px;margin:30px auto"}">
      <div style="display:flex;align-items:center;gap:12px;${compacto ? "" : "justify-content:center;margin-bottom:12px"}"><span style="width:30px;height:30px;border-radius:50%;background:#4285F4;color:#FFF;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 30px">GA</span>
        <strong style="${HEAD};font-size:${compacto ? 15 : 17}px;font-weight:600">Google Ads ainda não está conectado</strong></div>
      <p style="margin:${compacto ? "10px 0 0" : "0 0 14px"};font-size:13px;line-height:1.6;color:${CINZA}">Os dois sites de origem (ads e metadash) só tinham dados da Meta, e o servidor não tem nenhuma credencial do Google Ads. Para ligar, faltam: ${falta.map(f => `<strong style="color:#3C3C44">${e(f)}</strong>`).join(", ") || "as credenciais"}.${compacto ? "" : " Quando essas chaves forem cadastradas, esta aba passa a mostrar os mesmos gráficos com os dados do Google."}</p></div>`;
  }

  function corpoMeta(g){
    const d = g.data, t = d.total, s = d.serie, labels = s.map(x => dm(x.data)), col = k => s.map(x => x[k] || 0);
    // resultado principal da conta no período: o tipo com mais volume
    const tipos = [["leads", "Leads", "cpl", "Custo por lead"], ["conversas", "Conversas", "custo_conversa", "Custo por conversa"], ["compras", "Compras", "cpa", "Custo por compra"]];
    const princ = tipos.slice().sort((a, b) => t[b[0]] - t[a[0]])[0], rk = princ[0], custoDia = s.map(x => x[rk] ? x.spend / x[rk] : 0);
    const metrica = (rot, val, serieVals, dl, bom, cor) => `<div style="min-width:0"><div style="font-size:12.5px;color:${CINZA};margin-bottom:6px">${rot}</div><div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px"><span style="${HEAD};font-size:22px;font-weight:600;font-variant-numeric:tabular-nums">${val}</span>${delta(dl, bom)}</div>${serieVals ? spark(serieVals, cor) : ""}</div>`;
    const scoreCor = d.saude.score >= 80 ? VERDE : d.saude.score >= 60 ? AMBAR : VERM;
    const objetivos = d.por_objetivo.map(o => o.objetivo), camps = d.campanhas.filter(c => !g.objetivo || c.objetivo === g.objetivo);
    const totalIdade = d.idade.reduce((a, b) => a + b.impressions, 0) || 1, totalGen = d.genero.reduce((a, b) => a + b.impressions, 0) || 1;
    const GEN = { female: ["Mulheres", "#C25FD6"], male: ["Homens", AZUL], unknown: ["Não informado", "#9A9AA3"] };
    const STATUS = { ACTIVE: ["Ativa", VERDE], PAUSED: ["Pausada", CINZA], CAMPAIGN_PAUSED: ["Pausada", CINZA], ADSET_PAUSED: ["Pausada", CINZA], ARCHIVED: ["Arquivada", "#9A9AA3"], WITH_ISSUES: ["Com problema", VERM], IN_PROCESS: ["Em análise", AMBAR] };
    const prio = { alta: [VERM, "Alta"], media: [AMBAR, "Média"], ok: [VERDE, "Tudo certo"] };
    const resAd = a => a.leads + a.conversas + a.compras;
    const melhores = d.anuncios.filter(a => resAd(a) > 0).sort((a, b) => a.spend / resAd(a) - b.spend / resAd(b)).slice(0, 6);

    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;flex-wrap:wrap">
        <span style="width:30px;height:30px;border-radius:50%;background:#0866FF;color:#FFF;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">MA</span>
        <strong style="${HEAD};font-size:17px;font-weight:600">Meta Ads</strong>
        <span style="font-size:11.5px;color:#3C3C44;background:#F1F1F3;padding:4px 10px;border-radius:6px">${e(d.conta.name)}</span>
        <span style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:${scoreCor};background:${scoreCor}14;border:1px solid ${scoreCor}4D;padding:3px 10px;border-radius:20px"><span style="width:5px;height:5px;border-radius:50%;background:${scoreCor}"></span>Saúde ${d.saude.score}/100</span>
        <span style="margin-left:auto;font-size:12px;color:${CINZA}">${e(d.periodo.label)} · ${dm(d.periodo.since)} a ${dm(d.periodo.until)}</span>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:26px;align-items:flex-start;padding-bottom:26px;border-bottom:1px solid #E6E6EA;margin-bottom:26px">
        <div style="flex:1 1 320px;min-width:0;padding-right:26px;border-right:1px solid #E6E6EA">
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px"><span style="width:8px;height:8px;border-radius:2px;background:${ROXO2}"></span><span style="font-size:13.5px;color:#3C3C44">Investimento</span><span style="margin-left:auto">${delta(d.delta.spend)}</span></div>
          <div style="${HEAD};font-size:40px;font-weight:600;letter-spacing:-0.01em;margin-bottom:16px;font-variant-numeric:tabular-nums">${fM(t.spend)}</div>
          ${area(col("spend"))}
          <div style="font-size:11.5px;color:#9A9AA3;margin-top:8px">Período anterior: ${fM(d.anterior.spend)}</div>
        </div>
        <div style="flex:1 1 420px;min-width:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:22px">
          ${metrica("Impressões", fN(t.impressions), col("impressions"), d.delta.impressions, true)}
          ${metrica("Alcance", fN(t.reach), col("reach"), d.delta.reach, true)}
          ${metrica("Cliques", fN(t.clicks), col("clicks"), d.delta.clicks, true)}
          ${tipos.filter(x => t[x[0]] > 0 || x[0] === rk).map(x => metrica(x[1], fN(t[x[0]]), col(x[0]), d.delta[x[0]], true, AMBAR)).join("")}
          ${metrica("CTR", fP(t.ctr), null, d.delta.ctr, true)}
          ${metrica("CPC", fM(t.cpc), null, d.delta.cpc, false)}
          ${metrica("CPM", fM(t.cpm), null, d.delta.cpm, false)}
          ${metrica(princ[3], t[rk] ? fM(t[princ[2]]) : "-", null, rk === "leads" ? d.delta.cpl : null, false)}
          ${t.receita > 0 ? metrica("ROAS", t.roas.toFixed(2).replace(".", ",") + "x", null, null) : ""}
        </div>
      </div>

      ${secao("Tendências", "O pulso do funil no período: investimento, resultado e custo por dia.")}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-bottom:16px">
        ${card("Investimento por dia", linha(col("spend"), labels, ROXO2, fMc))}
        ${card(princ[1] + " por dia", linha(col(rk), labels, AMBAR, fN))}
        ${card("Cliques por dia", linha(col("clicks"), labels, ROXO2, fK))}
        ${t.receita > 0 ? card("Receita atribuída", linha(col("receita"), labels, ROXO2, fMc)) : card("CTR por dia", linha(col("ctr"), labels, AZUL, v => v.toFixed(1).replace(".", ",") + "%"))}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;margin-bottom:34px">
        ${card("Investimento × " + princ[1] + " (diário)", combo(col("spend"), col(rk), labels, fMc, fN, ROXO2, AMBAR), legenda([["Investimento", ROXO2], [princ[1], AMBAR, true]]))}
        ${card(princ[1] + " × " + princ[3] + " (diário)", combo(col(rk), custoDia, labels, fN, fMc, AMBAR, ROXO_ESC), legenda([[princ[1], AMBAR], [princ[3], ROXO_ESC, true]]))}
      </div>

      ${secao("Diagnóstico", "De onde vieram os números: campanhas, objetivos e onde o funil perde gente.")}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;margin-bottom:16px">
        ${card("Investimento por campanha", barrasH(d.campanhas.slice(0, 7).map(c => ({ rotulo: c.name, valor: c.spend, texto: fM(c.spend), sub: c.objetivo + " · " + fN(resAd(c)) + " resultado(s)" + (resAd(c) ? " · " + fM(c.spend / resAd(c)) + " cada" : "") }))), `<span style="font-size:12px;color:${CINZA}">${e(d.periodo.label)}</span>`)}
        ${card("Funil de tráfego", (() => { const max = Math.max(1, d.funil[0].valor); return d.funil.map((f, i) => { const ant = i ? d.funil[i - 1].valor : 0; return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:9px"><span style="width:112px;flex:0 0 112px;font-size:12.5px;color:#3C3C44">${e(f.etapa)}</span><div style="flex:1;min-width:0"><div style="height:26px;border-radius:7px;background:${ROXO2};opacity:${(1 - i * 0.13).toFixed(2)};width:${Math.max(3, Math.sqrt(f.valor / max) * 100).toFixed(1)}%;min-width:4px"></div></div><strong style="width:74px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums">${fK(f.valor)}</strong><span style="width:50px;text-align:right;font-size:11.5px;color:${CINZA}">${i && ant && f.valor <= ant ? (f.valor / ant * 100).toFixed(f.valor / ant < 0.1 ? 1 : 0).replace(".", ",") + "%" : ""}</span></div>`; }).join("") + `<div style="font-size:11.5px;color:#9A9AA3;margin-top:10px">A porcentagem é a passagem em relação à etapa anterior (conversas de WhatsApp não passam pela página, por isso ficam sem porcentagem). Largura em escala de raiz.</div>`; })())}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;margin-bottom:16px">
        ${card("Saúde da conta", `<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap"><div style="position:relative;width:104px;height:104px;flex:0 0 104px"><svg viewBox="0 0 36 36" style="width:104px;height:104px;transform:rotate(-90deg)"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(103,61,230,0.12)" stroke-width="3.2"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="${scoreCor}" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="${(d.saude.score / 100 * 97.4).toFixed(1)} 97.4"/></svg><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><span style="${HEAD};font-size:26px;font-weight:600;line-height:1">${d.saude.score}</span><span style="font-size:10.5px;color:${CINZA}">de 100</span></div></div>
          <div style="flex:1;min-width:180px"><div style="font-size:13.5px;font-weight:600;margin-bottom:6px;color:${scoreCor}">${d.saude.score >= 80 ? "Conta saudável" : d.saude.score >= 60 ? "Pede atenção" : "Precisa de ação"}</div>${d.saude.motivos.length ? `<div style="font-size:12.5px;color:#3C3C44;line-height:1.6">Pontos descontados: ${d.saude.motivos.map(e).join("; ")}.</div>` : `<div style="font-size:12.5px;color:${CINZA}">Nenhum ponto descontado no período.</div>`}<div style="font-size:12px;color:${CINZA};margin-top:8px">Frequência ${t.frequency.toFixed(2).replace(".", ",")} · CTR ${fP(t.ctr)}</div></div></div>`)}
        ${card("Recomendações", d.recomendacoes.map(r => { const p = prio[r.p] || prio.media; return `<div style="display:flex;gap:11px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #F1F1F3"><span style="flex:0 0 auto;font-size:10.5px;font-weight:700;color:${p[0]};background:${p[0]}14;border:1px solid ${p[0]}40;padding:2px 8px;border-radius:20px;margin-top:1px;white-space:nowrap">${p[1]}</span><span style="font-size:13px;line-height:1.55;color:#3C3C44">${e(r.t)}</span></div>`; }).join("") + `<div data-gw-estrategista style="display:inline-flex;align-items:center;gap:7px;margin-top:12px;font-size:12.5px;font-weight:600;color:${AMBAR};cursor:pointer">${icon(ICONS.agentes, 13)}Aprofundar com o Estrategista de Growth IA</div>`)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;margin-bottom:34px">
        ${card("Investimento por objetivo", barrasH(d.por_objetivo.map(o => ({ rotulo: o.objetivo, valor: o.spend, texto: fM(o.spend) + " · " + (o.spend / (t.spend || 1) * 100).toFixed(0) + "%", sub: o.campanhas + " campanha(s) · " + fN(o.leads + o.conversas + o.compras) + " resultado(s) · " + fN(o.clicks) + " cliques" })), AMBAR))}
        ${card("Distribuição por tipo de resultado", d.tipos_resultado.length ? barrasH(d.tipos_resultado.map(x => { const tot = d.tipos_resultado.reduce((a, b) => a + b.valor, 0); return { rotulo: x.tipo, valor: x.valor, texto: fN(x.valor) + " · " + (x.valor / tot * 100).toFixed(0) + "%" }; })) : `<div style="font-size:13px;color:${CINZA};line-height:1.6">Nenhum lead, conversa ou compra registrado no período. Se a conta roda campanhas de alcance ou tráfego, isso é esperado.</div>`)}
      </div>

      ${secao("Público", "Para quem os anúncios estão sendo entregues, por impressões.")}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:34px">
        ${card("Faixa etária", barrasH(d.idade.map(x => ({ rotulo: x.chave, valor: x.impressions, texto: (x.impressions / totalIdade * 100).toFixed(0) + "%", sub: fM(x.spend) + " · " + fN(x.clicks) + " cliques" + (x.leads ? " · " + fN(x.leads) + " leads" : "") }))))}
        ${card("Gênero", barrasH(d.genero.map(x => ({ rotulo: (GEN[x.chave] || [x.chave])[0], cor: (GEN[x.chave] || [0, CINZA])[1], valor: x.impressions, texto: (x.impressions / totalGen * 100).toFixed(0) + "%", sub: fM(x.spend) + " · " + fN(x.clicks) + " cliques" }))))}
        ${card("Top regiões por alcance", barrasH(d.regioes.slice(0, 8).map(x => ({ rotulo: x.chave, valor: x.reach, texto: fK(x.reach), sub: fM(x.spend) })), AZUL))}
      </div>

      ${secao("Campanhas", "Todas as campanhas com entrega no período, ordenadas por investimento.")}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${[""].concat(objetivos).map(o => `<span data-gw-obj="${e(o)}" style="padding:6px 13px;border-radius:20px;font-size:12.5px;cursor:pointer;border:1px solid ${g.objetivo === o || (!g.objetivo && !o) ? "rgba(103,61,230,0.4)" : "#DADADF"};${g.objetivo === o || (!g.objetivo && !o) ? `background:rgba(103,61,230,0.10);color:${AMBAR};font-weight:600` : "background:#FFFFFF;color:#3C3C44"}">${o ? e(o) : "Todas"}</span>`).join("")}</div>
      <div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;overflow:hidden;margin-bottom:34px"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:820px">
        <thead><tr>${["Campanha", "Objetivo", "Status", "Investido", "Impressões", "Cliques", "CTR", "CPC", "Result.", "Custo/res."].map((h, i) => `<th style="text-align:${i > 2 ? "right" : "left"};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${CINZA};font-weight:700;padding:11px 9px;border-bottom:1px solid #E6E6EA;white-space:nowrap">${h}</th>`).join("")}</tr></thead>
        <tbody>${camps.map(c => { const st = STATUS[c.status] || [c.status || "-", CINZA], r = resAd(c); return `<tr class="pdi-row"><td style="padding:12px 9px 12px 14px;border-bottom:1px solid #F1F1F3;max-width:250px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500" title="${e(c.name)}">${e(c.name)}</div>${c.orcamento_diario ? `<div style="font-size:11.5px;color:${CINZA}">Orçamento diário ${fM(c.orcamento_diario)}</div>` : ""}</td>
          <td style="padding:12px 14px;border-bottom:1px solid #F1F1F3;color:#3C3C44">${e(c.objetivo)}</td><td style="padding:12px 14px;border-bottom:1px solid #F1F1F3"><span style="font-size:11.5px;font-weight:600;color:${st[1]}">${e(st[0])}</span></td>
          ${[fM(c.spend), fN(c.impressions), fN(c.clicks), fP(c.ctr), fM(c.cpc), fN(r), r ? fM(c.spend / r) : "-"].map(v => `<td style="padding:12px 9px;border-bottom:1px solid #F1F1F3;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap">${v}</td>`).join("")}</tr>`; }).join("") || `<tr><td colspan="10" style="padding:30px;text-align:center;color:${CINZA}">Nenhuma campanha com entrega no período.</td></tr>`}</tbody></table></div></div>

      ${secao("Criativos", "Os anúncios que mais receberam verba e os que entregam resultado mais barato.")}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;margin-bottom:${melhores.length ? 16 : 0}px">${d.top_anuncios.slice(0, 8).map(a => `<div class="cat-card" style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;overflow:hidden">
        <div style="aspect-ratio:1/1;background:#F1F1F3;display:flex;align-items:center;justify-content:center;overflow:hidden">${a.thumb ? `<img src="${e(a.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">` : icon(ICONS.image, 26, "#B4B4BC")}</div>
        <div style="padding:12px 14px"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${e(a.name)}">${e(a.name)}</div><div style="font-size:11.5px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:10px" title="${e(a.campanha)}">${e(a.campanha)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 10px;font-size:12px">${[["Investido", fM(a.spend)], ["CTR", fP(a.ctr)], ["Resultados", fN(resAd(a))], ["Custo", resAd(a) ? fM(a.spend / resAd(a)) : "-"]].map(m => `<div><div style="color:${CINZA};font-size:11px">${m[0]}</div><div style="font-weight:600;font-variant-numeric:tabular-nums">${m[1]}</div></div>`).join("")}</div></div></div>`).join("") || `<div style="font-size:13px;color:${CINZA}">Nenhum anúncio com entrega no período.</div>`}</div>
      ${melhores.length ? card("Melhores anúncios por custo de resultado", barrasH(melhores.map(a => ({ rotulo: a.name, valor: resAd(a), texto: fN(resAd(a)) + " · " + fM(a.spend / resAd(a)) + " cada", sub: a.campanha + " · investido " + fM(a.spend) })), AMBAR)) : ""}
      <div style="font-size:11.5px;color:#9A9AA3;margin-top:22px">Dados da Meta Marketing API, em cache por 10 minutos. Atualizado às ${new Date(d.gerado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Lead usa o total agregado da Meta, sem somar tipos que se sobrepõem.</div>`;
  }

  function gwRenderDash(){
    const g = gw();
    if(!g.contas && !_carregando) setTimeout(carregarContas, 0);
    const carregandoTxt = msg => `<div style="padding:60px 0;text-align:center;color:${CINZA};font-size:13px">${e(msg)}</div>`;
    let corpo;
    if(g.plat === "google") corpo = googleVazio(g, false);
    else if(g.erro && !g.data) corpo = `<div style="border:1px solid rgba(192,52,28,0.3);background:rgba(192,52,28,0.06);color:#96280F;border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.55">${e(g.erro)}</div>`;
    else if(!g.contas) corpo = carregandoTxt("Carregando contas de anúncio...");
    else if(!g.contas.length) corpo = carregandoTxt("Nenhuma conta de anúncio acessível. Verifique os tokens da Meta em Chaves.");
    else if(!g.data) corpo = carregandoTxt("Buscando os números na Meta...");
    else corpo = (g.plat === "ambos" ? googleVazio(g, true) : "") + (g.erro ? `<div style="border:1px solid rgba(192,52,28,0.3);background:rgba(192,52,28,0.06);color:#96280F;border-radius:12px;padding:12px 16px;font-size:13px;margin-bottom:20px">${e(g.erro)}</div>` : "") + `<div style="opacity:${g.carregando ? 0.45 : 1};transition:opacity .2s">${corpoMeta(g)}</div>`;

    return `<div>${barraTopo()}${barraPlataforma(g)}
      <div style="padding:26px 30px 60px;max-width:1240px">
        <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid #E6E6EA;margin-bottom:22px">
          <div style="flex:1;min-width:240px"><h1 style="${HEAD};font-size:22px;font-weight:600;margin:0 0 5px">Visão de performance</h1><p style="margin:0;color:${CINZA};font-size:13px">Entrega, leads e vendas das contas de anúncio conectadas.</p></div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${g.contas && g.contas.length && g.plat !== "google" ? seletores(g) : ""}</div>
        </div>
        ${g.plat !== "google" ? (g.avisos || []).map(a => `<div style="display:flex;gap:10px;border:1px solid rgba(103,61,230,0.35);background:rgba(103,61,230,0.06);color:#4B23B8;border-radius:12px;padding:11px 15px;font-size:12.5px;line-height:1.5;margin-bottom:14px">${icon(ICONS.alerta || ICONS.clock, 15, "currentColor")}<span>${e(a)}</span></div>`).join("") : ""}
        ${corpo}
      </div></div>`;
  }

  // ─── ligações ──────────────────────────────────────────────────────────────
  function gwAttach(){
    if(state.screen !== "growthDash" && state.screen !== "growthAgente") return;
    const root = document;
    root.querySelectorAll("[data-gw-conta]").forEach(el => bindOnce(el, "change", () => { lsSet("gw_conta", el.value); state.growth = Object.assign({}, gw(), { contaId: el.value }); carregarDash(false); }));
    root.querySelectorAll("[data-gw-periodo]").forEach(el => bindOnce(el, "change", () => { lsSet("gw_periodo", el.value); state.growth = Object.assign({}, gw(), { periodo: el.value }); carregarDash(false); }));
    root.querySelectorAll("[data-gw-sync]").forEach(el => bindOnce(el, "click", () => { if(!gw().carregando) carregarDash(true); }));
    root.querySelectorAll("[data-gw-plat]").forEach(el => bindOnce(el, "click", () => gwSet({ plat: el.dataset.gwPlat })));
    root.querySelectorAll("[data-gw-obj]").forEach(el => bindOnce(el, "click", () => gwSet({ objetivo: el.dataset.gwObj })));
    root.querySelectorAll("[data-gw-estrategista]").forEach(el => bindOnce(el, "click", ev => { ev.stopPropagation(); setState({ screen: "agente", agentId: "estrategista-growth", editAgentId: null }); }));
  }
  const _attachBase = attach;
  attach = function(){ _attachBase.apply(this, arguments); gwAttach(); };

  RENDERERS.growthDash = gwRenderDash;
  // a antiga tela "Agente" do Copiloto era uma conversa de maquete: agora leva ao Estrategista de verdade
  RENDERERS.growthAgente = function(){ setTimeout(() => setState({ screen: "agente", agentId: "estrategista-growth", editAgentId: null }), 0); return `<div style="padding:40px;color:${CINZA}">Abrindo o Estrategista de Growth IA...</div>`; };
  // o render() do SPA só repinta quando o estado muda: trocar a referência de state.growth força a tela nova
  if(state.screen === "growthDash" || state.screen === "growthAgente"){ state.growth = {}; render(); }
})();
