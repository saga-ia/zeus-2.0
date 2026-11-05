// Conectores › WhatsApp: fontes de dados de vendas (números nas análises e planilha/CRM).
// É daqui que o Diagnóstico e a Auditoria de Vendas (Execução Comercial) tiram os números reais.
// Carregado depois do script principal: usa state, icon, ICONS, e (escape), vendasTabsHTML, zConfirm, cfgToast e RENDERERS de lá.
(function(){
  const AMBAR = "#673DE6", VERDE = "#0F7A68", VERM = "#C0341C", CINZA = "#66666F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:9px 11px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:13px;background:#FFFFFF;outline:none;color:#17171A";
  const BOX = "border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:20px 22px;margin-bottom:16px";
  const vd = () => { if(!state.vendasDados) state.vendasDados = { fontes: null, erro: null, prev: null, enviando: false }; return state.vendasDados; };
  const fN = n => (Number(n) || 0).toLocaleString("pt-BR");

  async function api(url, opts){
    const r = await fetch("/api/vendas" + url, opts);
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }
  async function carregar(){
    vd().carregadoEm = Date.now();
    try { vd().fontes = await api("/fontes"); vd().erro = null; } catch(err){ vd().erro = err.message; }
    pintar();
  }
  function pintar(){ const el = document.getElementById("vd-root"); if(el) el.innerHTML = state.screen === "planilhaConnector" ? corpoPlanilha() : corpo(); }

  function whatsapp(f){
    const lista = (f.instancias || []);
    if(!lista.length) return "";
    const linha = i => `<div data-vd-inst="${e(i.nome)}" style="display:grid;grid-template-columns:minmax(150px,1.2fr) 1fr 1fr auto auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #F1F1F3">
        <div style="min-width:0;display:flex;align-items:center;gap:8px"><span style="width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:${i.status === "open" ? VERDE : "#B4B4BC"}"></span><span style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(i.perfil || i.nome)}</span><span style="font-size:11.5px;color:${CINZA};white-space:nowrap">${fN(i.mensagens)} msgs</span></div>
        <input data-vd-campo="vendedor" value="${e(i.vendedor || "")}" placeholder="Vendedor" style="${IN}">
        <input data-vd-campo="setor" value="${e(i.setor || "")}" placeholder="Setor (opcional)" style="${IN}">
        <label title="Entra no Diagnóstico e na Auditoria de Vendas" style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#3C3C44;cursor:pointer;white-space:nowrap"><input data-vd-campo="ativo" type="checkbox" ${i.ativo ? "checked" : ""} style="accent-color:${AMBAR};width:15px;height:15px">Nas análises</label>
        <span data-vd-salvar data-hover-border style="padding:8px 13px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer;background:#FFFFFF">Salvar</span>
      </div>`;
    return `<div style="${BOX}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px"><span style="display:flex">${icon(ICONS.briefcase, 16, AMBAR)}</span><strong style="${HEAD};font-size:15px;font-weight:600;flex:1">Nas análises de vendas</strong></div>
      <p style="margin:0 0 4px;font-size:12.5px;color:${CINZA};line-height:1.55">Todo número conectado entra sozinho no Diagnóstico e na Auditoria de Vendas, e os áudios são transcritos. Ajuste o vendedor ou o setor, ou tire um número das análises, se quiser.</p>
      ${lista.map(linha).join("")}
    </div>`;
  }

  function planilha(f){
    const s = vd(), p = s.prev;
    let prevHTML = "";
    if(p){
      const opts = sel => `<option value="">Não usar</option>` + p.cabecalho.map((h, i) => `<option value="${i}" ${sel === i ? "selected" : ""}>${e(h)}</option>`).join("");
      prevHTML = `<div style="margin-top:14px;padding:16px;border:1px solid rgba(103,61,230,0.25);border-radius:12px;background:rgba(103,61,230,0.03)">
        <div style="font-size:13px;font-weight:600;margin-bottom:3px">${e(p.arquivo)} · ${fN(p.total)} linhas</div>
        <div style="font-size:12px;color:${CINZA};margin-bottom:12px">Confira qual coluna da planilha é cada informação. Já sugerimos pelo nome das colunas; o que ficar em "Não usar" é guardado como informação extra.</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px 14px">${p.campos.map(c => `<label style="display:block"><span style="display:block;font-size:11.5px;color:${CINZA};margin-bottom:4px">${e(c.rotulo)}</span><select data-vd-map="${c.id}" style="${IN};appearance:auto">${opts(p.mapa[c.id])}</select></label>`).join("")}</div>
        <div style="overflow-x:auto;margin-top:14px;border:1px solid #E6E6EA;border-radius:10px;background:#FFFFFF"><table style="border-collapse:collapse;font-size:11.5px;min-width:100%"><thead><tr>${p.cabecalho.map(h => `<th style="text-align:left;padding:7px 9px;border-bottom:1px solid #E6E6EA;color:${CINZA};white-space:nowrap">${e(h)}</th>`).join("")}</tr></thead><tbody>${p.amostra.map(r => `<tr>${p.cabecalho.map((_, i) => `<td style="padding:7px 9px;border-bottom:1px solid #F4F4F6;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis">${e(r[i] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px">
          <input data-vd-fonte value="${e(p.fonte || "")}" placeholder="Nome da fonte (ex.: RD Station, planilha de setembro)" style="${IN};max-width:340px">
          <span style="flex:1"></span>
          <span data-vd-cancelar data-hover-border style="padding:9px 14px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;cursor:pointer">Cancelar</span>
          <span data-vd-importar data-hover-dark style="padding:9px 16px;border-radius:9px;background:${AMBAR};color:#FFFFFF;font-size:12.5px;font-weight:700;cursor:pointer;opacity:${s.enviando ? .6 : 1}">${s.enviando ? "Importando..." : "Importar " + fN(p.total) + " linhas"}</span>
        </div></div>`;
    }
    const lotes = f.lotes || [];
    return `<div style="${BOX}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px"><span style="display:flex">${icon(ICONS.file, 17, AMBAR)}</span><strong style="${HEAD};font-size:15.5px;font-weight:600;flex:1">Importar planilha</strong></div>
      <p style="margin:0 0 12px;font-size:12.5px;color:${CINZA};line-height:1.55">Suba a exportação do seu CRM ou a planilha de leads e vendas (CSV ou Excel). Cada importação vira um lote que pode ser apagado depois.</p>
      <label data-hover-border style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border:1px dashed #C9C3E8;border-radius:10px;font-size:13px;font-weight:600;color:${AMBAR};cursor:pointer;background:#FBFAFF">${icon(ICONS.plus, 14, AMBAR)}${s.enviando && !p ? "Lendo o arquivo..." : "Enviar planilha"}<input data-vd-arquivo type="file" accept=".csv,.txt,.tsv,.xlsx,.xlsm" style="display:none"></label>
      ${prevHTML}
      ${lotes.length ? `<div style="margin-top:16px">${lotes.map(l => `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #F1F1F3;font-size:13px"><span style="flex:1;min-width:0"><strong style="font-weight:600">${e(l.fonte)}</strong><span style="color:${CINZA}"> · ${fN(l.linhas)} linhas · importado em ${e((l.importado_em || "").split(" ")[0].split("-").reverse().join("/"))}</span></span><span data-vd-apagar="${e(l.lote)}" style="font-size:12px;color:${VERM};cursor:pointer;font-weight:600">Apagar</span></div>`).join("")}</div>` : ""}
    </div>`;
  }

  function erroOuCarregando(){
    const s = vd();
    if(s.erro && !s.fontes) return `<div style="${BOX};color:${VERM};font-size:13px">${e(s.erro)}</div>`;
    if(!s.fontes) return `<div style="padding:20px 0;color:${CINZA};font-size:13px">Carregando...</div>`;
    return null;
  }
  function corpo(){ return erroOuCarregando() || whatsapp(vd().fontes); }
  function corpoPlanilha(){
    const x = erroOuCarregando(); if(x) return x;
    const f = vd().fontes;
    return `<div style="display:flex;gap:12px;margin-bottom:16px"><div style="border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;padding:12px 16px;min-width:170px"><div style="font-size:11.5px;color:${CINZA}">Leads importados</div><div style="${HEAD};font-size:22px;font-weight:600">${fN(f.totais.leads)}</div></div></div>
      ${planilha(f)}
      <div style="font-size:12.5px;color:${CINZA}">${icon(ICONS.bolt, 13, AMBAR)} Os leads importados entram no <span data-go="motorDiagnostico" style="color:${AMBAR};font-weight:600;cursor:pointer">Diagnóstico</span> e na <span data-go="motorAuditor" style="color:${AMBAR};font-weight:600;cursor:pointer">Auditoria de Vendas</span>, cruzados com as conversas de WhatsApp.</div>`;
  }
  const recarregar = () => { const s = vd(); if((!s.fontes && !s.erro) || Date.now() - (s.carregadoEm || 0) > 15000) setTimeout(carregar, 0); };

  // Conectores › WhatsApp ganha, embaixo da lista de números, o uso deles nas análises de vendas e a importação de planilha
  const _waBase = RENDERERS.waConnector;
  RENDERERS.waConnector = function(){
    recarregar();
    return _waBase.apply(this, arguments) + `<div style="padding:0 40px 60px;max-width:1180px"><div id="vd-root">${corpo()}</div></div>`;
  };
  // Conectores › Planilha ou CRM
  RENDERERS.planilhaConnector = function(){
    recarregar();
    return `<div style="padding:26px 40px 60px;max-width:1180px">
      <span data-go="conectores" data-hover-border style="display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;cursor:pointer;margin-bottom:20px;background:#FFFFFF">${icon(ICONS.chevLeft, 13)}Conectores</span>
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:22px">
        <span style="width:46px;height:46px;border-radius:13px;background:rgba(15,157,88,0.12);display:flex;align-items:center;justify-content:center;flex:0 0 46px">${icon(ICONS.file, 22, "#0F9D58")}</span>
        <div><div style="font-size:10.5px;letter-spacing:0.16em;color:${AMBAR};font-weight:700;margin-bottom:5px">NATIVO ZEUS · PLANILHA</div>
          <h1 style="${HEAD};font-size:25px;font-weight:600;margin:0 0 6px">Planilha ou CRM</h1>
          <p style="margin:0;color:${CINZA};font-size:13.5px">Importe a exportação do seu CRM ou a planilha de leads e vendas para a IA cruzar com as conversas.</p></div>
      </div>
      <div id="vd-root">${corpoPlanilha()}</div></div>`;
  };

  // ─── eventos (delegados: o bloco é repintado sem recarregar a tela) ─────────
  document.addEventListener("click", async ev => {
    if(state.screen !== "waConnector" && state.screen !== "planilhaConnector") return;
    const t = ev.target, s = vd();
    const salvar = t.closest && t.closest("[data-vd-salvar]");
    if(salvar){
      const row = salvar.closest("[data-vd-inst]"), nome = row.dataset.vdInst;
      const val = k => row.querySelector(`[data-vd-campo="${k}"]`);
      salvar.textContent = "Salvando...";
      try { await api("/instancias/" + encodeURIComponent(nome), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendedor: val("vendedor").value, setor: val("setor").value, ativo: val("ativo").checked }) }); cfgToast("Número atualizado"); await carregar(); }
      catch(err){ salvar.textContent = "Salvar"; cfgToast(err.message, true); }
      return;
    }
    if(t.closest && t.closest("[data-vd-cancelar]")){ s.prev = null; pintar(); return; }
    if(t.closest && t.closest("[data-vd-importar]")){
      if(s.enviando || !s.prev) return;
      document.querySelectorAll("[data-vd-map]").forEach(x => { s.prev.mapa[x.dataset.vdMap] = x.value === "" ? undefined : Number(x.value); });
      const fonte = (document.querySelector("[data-vd-fonte]") || {}).value || s.prev.arquivo;
      s.enviando = true; pintar();
      try {
        const mapeamento = {}; Object.entries(s.prev.mapa).forEach(([k, v]) => { if(Number.isInteger(v)) mapeamento[k] = v; });
        const r = await api("/importar/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: s.prev.token, mapeamento, fonte }) });
        s.prev = null; cfgToast(fN(r.linhas) + " linhas importadas");
      } catch(err){ cfgToast(err.message, true); }
      s.enviando = false; await carregar();
      return;
    }
    const ap = t.closest && t.closest("[data-vd-apagar]");
    if(ap){
      if(!await zConfirm(`Apagar o lote "${ap.dataset.vdApagar}"? As linhas saem do diagnóstico.`)) return;
      try { await api("/lotes?lote=" + encodeURIComponent(ap.dataset.vdApagar), { method: "DELETE" }); await carregar(); } catch(err){ cfgToast(err.message, true); }
    }
  });
  document.addEventListener("change", async ev => {
    if(state.screen !== "planilhaConnector" || !ev.target.matches || !ev.target.matches("[data-vd-arquivo]")) return;
    const f = ev.target.files && ev.target.files[0]; if(!f) return;
    const s = vd(); s.enviando = true; pintar();
    try {
      const fd = new FormData(); fd.append("arquivo", f, f.name);
      const r = await api("/importar/preview", { method: "POST", body: fd });
      s.prev = Object.assign(r, { mapa: Object.assign({}, r.sugestao), fonte: f.name.replace(/\.[^.]+$/, "") });
    } catch(err){ cfgToast(err.message, true); }
    s.enviando = false; pintar();
  });
  // a tela pode ter sido pintada antes deste arquivo carregar (URL aberta direto): repinta
  if(state.screen === "waConnector" || state.screen === "planilhaConnector"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = RENDERERS[state.screen](); }
})();
