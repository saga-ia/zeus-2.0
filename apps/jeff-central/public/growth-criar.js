// Criar anúncio na Meta (Copiloto de Growth > botão "Criar anúncio"). Modal de uma página: conta, objetivo, página e
// Instagram, público, orçamento, criativo e prévia. "Validar" confere na Meta sem criar; "Criar pausado" cria campanha
// pausada + conjunto + anúncio (se algo falhar, nada fica na conta). Depois, "Ativar agora" liga a campanha pelo
// /api/growth/apply. Backend: /api/growth/criar (growth-criar.js), só administradores.
// Carregado depois do growth-dash.js: usa state, icon, ICONS, e, zConfirm, cfgToast e souAdmin da Central.
(function(){
  const API = "/api/growth/criar";
  const ROXO = "#673DE6", VERDE = "#0F7A68", VERM = "#C0341C", CINZA = "#66666F", MUTE = "#9A9AA3", BORDA = "#E6E6EA";
  const IN = "width:100%;padding:9px 11px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:13px;color:#17171A;background:#FFFFFF;outline:none;box-sizing:border-box";
  const BTN = "display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 14px;border:1px solid #DADADF;border-radius:9px;font:inherit;font-size:12.5px;background:#FFFFFF;color:#17171A;cursor:pointer;white-space:nowrap";
  const BTN_PRI = "display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 16px;border:0;border-radius:9px;font:inherit;font-size:12.5px;font-weight:700;background:" + ROXO + ";color:#FFFFFF;cursor:pointer;white-space:nowrap";
  const LBL = "display:block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#66666F;margin:0 0 6px";
  const HELP = "margin:6px 0 0;font-size:11.5px;color:#66666F;line-height:1.5";
  const SEC = "padding:16px 22px;border-top:1px solid #F1F1F3";
  const OBJ = [["trafego", "Tráfego para o site", "Leva pessoas para um link"], ["mensagens", "Mensagens", "Abre conversa no WhatsApp, Direct ou Messenger"], ["alcance", "Alcance", "Mostra para o máximo de pessoas"]];
  const DEST = [["whatsapp", "WhatsApp"], ["instagram", "Direct do Instagram"], ["messenger", "Messenger"]];
  let C = null; // estado do modal

  async function api(p, metodo, corpo, bruto){
    const init = { method: metodo || "GET" };
    if(bruto){ init.headers = { "Content-Type": bruto.type }; init.body = bruto; }
    else if(corpo !== undefined){ init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(corpo); }
    const r = await fetch(API + p, init); const j = await r.json().catch(() => ({}));
    if(!r.ok){ const err = new Error(j.error || "HTTP " + r.status); err.erros = j.erros; throw err; }
    return j;
  }
  const hojeLocal = () => { const d = new Date(Date.now() + 10 * 60000), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  function novoPlano(){ return { objetivo: "mensagens", destino: "whatsapp", nome: "", pageId: "", usarInstagram: true, orcamentoDiario: 30, inicio: hojeLocal(), fim: "",
    publico: { locais: [], idadeMin: 18, idadeMax: 65, genero: "todos", advantage: true }, criativo: { midia: null, texto: "", titulo: "", descricao: "", link: "", cta: "LEARN_MORE" } }; }

  window.gcAbrir = function(contaId){
    const g = state.growth || {};
    C = { contaId: contaId || g.contaId, contas: (g.contas || []), ctx: null, carregando: true, plano: novoPlano(), busca: { q: "", lista: [] }, erros: null, avisos: null, ocupado: null, criado: null };
    desenhar(); carregarCtx();
  };
  async function carregarCtx(){
    C.carregando = true; C.ctx = null; desenhar();
    try { C.ctx = await api("/contexto?account_id=" + encodeURIComponent(C.contaId)); const pag = C.ctx.paginas.find(p => p.usadaNestaConta && !p.semLeitura) || C.ctx.paginas[0]; C.plano.pageId = pag ? pag.id : ""; }
    catch(err){ C.erros = [err.message]; }
    C.carregando = false; desenhar();
  }
  function fechar(){ C = null; const h = document.getElementById("gc-host"); if(h) h.remove(); }
  const P = () => C.plano, pagina = () => C.ctx && C.ctx.paginas.find(p => p.id === P().pageId);
  // campos sem redesenhar enquanto digita
  window.gcCampo = function(caminho, el){ const partes = caminho.split("."); let o = P(); partes.slice(0, -1).forEach(k => { o = o[k]; }); o[partes[partes.length - 1]] = el.type === "checkbox" ? el.checked : el.value; C.erros = null; C.avisos = null; if(el.dataset.redesenha) desenhar(); else pintarPrevia(); };
  window.gcEscolher = function(caminho, v){ const partes = caminho.split("."); let o = P(); partes.slice(0, -1).forEach(k => { o = o[k]; }); o[partes[partes.length - 1]] = v; C.erros = null; desenhar(); };

  // ─── locais ──────────────────────────────────────────────────────────────────
  let _buscaT = null;
  window.gcBuscar = function(el){ C.busca.q = el.value; clearTimeout(_buscaT); if(el.value.trim().length < 2){ C.busca.lista = []; pintarBusca(); return; }
    _buscaT = setTimeout(async () => { try { C.busca.lista = (await api("/local?account_id=" + encodeURIComponent(C.contaId) + "&q=" + encodeURIComponent(el.value))).locais; } catch(err){ C.busca.lista = []; } pintarBusca(); }, 350); };
  window.gcLocalAdd = function(i){ const l = C.busca.lista[i]; if(!l) return; const ls = P().publico.locais; if(!ls.some(x => x.key === l.key)) ls.push(Object.assign({ raio: 25 }, l)); C.busca = { q: "", lista: [] }; desenhar(); };
  window.gcLocalDel = function(i){ P().publico.locais.splice(i, 1); desenhar(); };
  window.gcRaio = function(i, el){ P().publico.locais[i].raio = parseInt(el.value, 10) || 25; };
  const tipoLocal = { country: "País", region: "Estado", city: "Cidade" };
  function buscaHTML(){ return C.busca.lista.length ? `<div style="border:1px solid ${BORDA};border-radius:10px;margin-top:6px;max-height:220px;overflow-y:auto;background:#FFFFFF">${C.busca.lista.map((l, i) => `<div onclick="gcLocalAdd(${i})" data-hover style="padding:8px 12px;cursor:pointer;font-size:13px;display:flex;gap:8px"><span style="flex:1">${e(l.nome)}${l.regiao ? `<span style="color:${MUTE}"> · ${e(l.regiao)}</span>` : ""}</span><span style="font-size:11px;color:${MUTE}">${tipoLocal[l.tipo] || l.tipo} ${e(l.pais)}</span></div>`).join("")}</div>` : ""; }
  function pintarBusca(){ const b = document.getElementById("gc-busca-res"); if(b) b.innerHTML = buscaHTML(); }

  // ─── mídia ───────────────────────────────────────────────────────────────────
  window.gcMidia = async function(el){
    const f = el.files && el.files[0]; if(!f) return;
    const video = /^video\//.test(f.type);
    if(!/^(image\/(png|jpeg)|video\/(mp4|quicktime))$/.test(f.type)){ cfgToast("Use imagem JPG ou PNG, ou vídeo MP4 ou MOV.", true); return; }
    C.ocupado = video ? "Enviando o vídeo para a Meta (pode levar alguns minutos)..." : "Enviando a imagem para a Meta..."; desenhar();
    const local = URL.createObjectURL(f);
    try { const m = await api("/midia?account_id=" + encodeURIComponent(C.contaId) + "&nome=" + encodeURIComponent(f.name), "POST", undefined, f);
      P().criativo.midia = Object.assign(m, { previa: local, video }); if(m.aviso) cfgToast(m.aviso, true); }
    catch(err){ cfgToast("Não enviei: " + err.message, true); }
    C.ocupado = null; desenhar();
  };

  // ─── validar, criar, ativar ──────────────────────────────────────────────────
  function corpo(){ const p = JSON.parse(JSON.stringify(P())); p.inicio = p.inicio ? new Date(p.inicio).toISOString() : null; p.fim = p.fim ? new Date(p.fim).toISOString() : null; p.orcamentoDiario = Number(String(p.orcamentoDiario).replace(",", ".")); if(p.criativo.midia){ delete p.criativo.midia.previa; } return p; }
  window.gcValidar = async function(){
    C.ocupado = "Conferindo com a Meta..."; C.erros = null; C.avisos = null; desenhar();
    try { const r = await api("/validar", "POST", { account_id: C.contaId, plano: corpo() }); if(r.ok) C.avisos = r.avisos; else C.erros = r.erros; }
    catch(err){ C.erros = err.erros || [err.message]; }
    C.ocupado = null; desenhar();
  };
  window.gcCriar = async function(){
    const p = P(), orc = Number(String(p.orcamentoDiario).replace(",", "."));
    if(!await zConfirm(`Criar "${p.nome || "campanha"}" na conta ${C.ctx.conta.nome} com orçamento de R$ ${orc.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por dia? Ela nasce PAUSADA: só gasta depois que você ativar.`, { ok: "Criar pausado", danger: false })) return;
    C.ocupado = "Criando campanha, conjunto e anúncio..."; C.erros = null; desenhar();
    try { C.criado = await api("", "POST", { account_id: C.contaId, plano: corpo() }); cfgToast("Anúncio criado e pausado."); }
    catch(err){ C.erros = err.erros || [err.message]; }
    C.ocupado = null; desenhar();
  };
  window.gcAtivar = async function(){
    const c = C.criado, orc = Number(String(P().orcamentoDiario).replace(",", "."));
    if(!await zConfirm(`Ativar agora? A campanha começa a gastar até R$ ${orc.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por dia assim que a Meta aprovar o anúncio.`, { ok: "Ativar", danger: false })) return;
    C.ocupado = "Ativando..."; desenhar();
    try { const r = await fetch("/api/growth/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: C.contaId, action: { tipo: "ativar", nivel: "campaign", id: c.campanhaId, nome: c.nome, motivo: "Ativado depois de criar pela Central" } }) });
      const j = await r.json(); if(!r.ok) throw new Error(j.error || "HTTP " + r.status); c.ativa = true; cfgToast("Campanha ativada. A Meta revisa o anúncio antes de veicular."); }
    catch(err){ cfgToast("Não ativei: " + err.message, true); }
    C.ocupado = null; desenhar();
  };

  // ─── tela ────────────────────────────────────────────────────────────────────
  const chip = (on, txt, acao) => `<span onclick="${acao}" style="display:inline-flex;align-items:center;padding:7px 13px;border-radius:20px;font-size:12.5px;cursor:pointer;border:1px solid ${on ? ROXO : "#DADADF"};background:${on ? "rgba(103,61,230,0.08)" : "#FFFFFF"};color:${on ? "#5429C9" : "#3C3C44"};font-weight:${on ? 600 : 400}">${txt}</span>`;
  function previaHTML(){
    const p = P(), c = p.criativo, pag = pagina(), m = c.midia;
    const ctaTxt = p.objetivo === "mensagens" ? { whatsapp: "Enviar mensagem", instagram: "Enviar mensagem", messenger: "Enviar mensagem" }[p.destino] : (C.ctx && C.ctx.ctas[c.cta]) || "";
    return `<div style="border:1px solid ${BORDA};border-radius:12px;overflow:hidden;background:#FFFFFF;max-width:340px">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px">${pag && pag.foto ? `<img src="${e(pag.foto)}" style="width:30px;height:30px;border-radius:50%">` : `<span style="width:30px;height:30px;border-radius:50%;background:#E6E6EA"></span>`}<span><span style="display:block;font-size:12.5px;font-weight:600">${e(pag ? pag.nome : "Página")}</span><span style="font-size:10.5px;color:${MUTE}">Patrocinado</span></span></div>
      <div id="gc-prev-texto" style="padding:0 12px 10px;font-size:12.5px;line-height:1.45;white-space:pre-wrap;max-height:110px;overflow:hidden">${e(c.texto) || `<span style="color:${MUTE}">Texto do anúncio</span>`}</div>
      ${m ? (m.video ? `<video src="${e(m.previa || "")}" muted controls style="width:100%;display:block;background:#000;max-height:300px"></video>` : `<img src="${e(m.previa || m.url || "")}" style="width:100%;display:block">`) : `<div style="height:180px;background:#F1F1F3;display:flex;align-items:center;justify-content:center;font-size:12px;color:${MUTE}">Imagem ou vídeo</div>`}
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#F7F7F8"><span style="flex:1;min-width:0"><span id="gc-prev-titulo" style="display:block;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(c.titulo) || ""}</span></span>${ctaTxt ? `<span style="padding:6px 10px;border-radius:6px;background:#E4E6EB;font-size:12px;font-weight:600;white-space:nowrap">${e(ctaTxt)}</span>` : ""}</div></div>`;
  }
  function pintarPrevia(){ const b = document.getElementById("gc-previa"); if(b && C && C.ctx) b.innerHTML = previaHTML(); }
  function formHTML(){
    const p = P(), pub = p.publico, c = p.criativo, ctx = C.ctx, pag = pagina();
    const contas = C.contas.length ? `<select onchange="gcConta(this)" style="${IN}">${C.contas.map(a => `<option value="${e(a.id)}" ${a.id === C.contaId ? "selected" : ""}>${e(a.name)}</option>`).join("")}</select>` : "";
    const obj = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">${OBJ.map(([k, n, d]) => `<div onclick="gcEscolher('objetivo','${k}')" style="padding:11px 13px;border-radius:11px;cursor:pointer;border:1px solid ${p.objetivo === k ? ROXO : BORDA};background:${p.objetivo === k ? "rgba(103,61,230,0.05)" : "#FFFFFF"}"><div style="font-size:13px;font-weight:600">${n}</div><div style="font-size:11.5px;color:${CINZA};margin-top:2px">${d}</div></div>`).join("")}</div>
      ${p.objetivo === "mensagens" ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${DEST.map(([k, n]) => chip(p.destino === k, n, `gcEscolher('destino','${k}')`)).join("")}</div><p style="${HELP}">A página precisa ter o canal conectado (WhatsApp Business, Instagram ou Messenger). Se não tiver, a Meta avisa na hora de criar.</p>` : ""}`;
    const pags = ctx.paginas;
    const identidade = `<label style="${LBL}">Página que assina o anúncio</label>
      <select onchange="gcCampo('pageId', this)" data-redesenha="1" style="${IN}">${pags.length ? "" : `<option value="">Nenhuma página acessível</option>`}${pags.map(x => `<option value="${e(x.id)}" ${x.id === p.pageId ? "selected" : ""}>${x.usadaNestaConta ? "★ " : ""}${e(x.nome)}${x.instagram ? " · IG @" + e(x.instagram.usuario || x.instagram.id) : ""}</option>`).join("")}</select>
      <p style="${HELP}">★ = página já usada em anúncios desta conta.${pag && pag.semLeitura ? ` <span style="color:#9A6700">O token não consegue ler essa página: se a Meta recusar, escolha outra.</span>` : ""}</p>
      ${pag && pag.instagram ? `<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;cursor:pointer"><input type="checkbox" ${p.usarInstagram ? "checked" : ""} onchange="gcCampo('usarInstagram', this)" data-redesenha="1" style="accent-color:${ROXO}">Aparecer como @${e(pag.instagram.usuario || pag.instagram.id)} no Instagram</label><p style="${HELP}">Desligue se a Meta disser que a conta de anúncios não tem acesso a esse Instagram.</p>` : ""}`;
    const publico = `<label style="${LBL}">Locais</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${pub.locais.length ? 8 : 0}px">${pub.locais.map((l, i) => `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 8px 5px 11px;border-radius:18px;background:#F0ECFD;font-size:12.5px">${e(l.nome)}${l.tipo === "city" ? ` <select onchange="gcRaio(${i}, this)" title="Raio" style="border:0;background:transparent;font:inherit;font-size:12px">${[17, 25, 40, 60, 80].map(r => `<option value="${r}" ${+l.raio === r ? "selected" : ""}>+${r} km</option>`).join("")}</select>` : ""}<span onclick="gcLocalDel(${i})" style="cursor:pointer;color:${CINZA}">${icon(ICONS.x, 11)}</span></span>`).join("")}</div>
      <input id="gc-busca" value="${e(C.busca.q)}" oninput="gcBuscar(this)" placeholder="Busque cidade, estado ou país" style="${IN}"><div id="gc-busca-res">${buscaHTML()}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;align-items:flex-end">
        <div><label style="${LBL}">Idade</label><div style="display:flex;align-items:center;gap:6px"><input type="number" min="18" max="65" value="${pub.idadeMin}" oninput="gcCampo('publico.idadeMin', this)" style="${IN};width:70px"> a <input type="number" min="18" max="65" value="${pub.idadeMax}" oninput="gcCampo('publico.idadeMax', this)" style="${IN};width:70px"></div></div>
        <div><label style="${LBL}">Gênero</label><div style="display:flex;gap:6px">${[["todos", "Todos"], ["mulheres", "Mulheres"], ["homens", "Homens"]].map(([k, n]) => chip(pub.genero === k, n, `gcEscolher('publico.genero','${k}')`)).join("")}</div></div></div>
      <label style="display:flex;align-items:flex-start;gap:8px;margin-top:12px;font-size:13px;cursor:pointer"><input type="checkbox" ${pub.advantage ? "checked" : ""} onchange="gcCampo('publico.advantage', this)" data-redesenha="1" style="accent-color:${ROXO};margin-top:2px"><span>Público Advantage+ <span style="color:${CINZA}">(recomendado pela Meta: ela pode ir além da idade escolhida quando achar gente com mais chance de responder)</span></span></label>`;
    const orc = `<div style="display:flex;gap:12px;flex-wrap:wrap">
      <div><label style="${LBL}">Orçamento por dia (R$)</label><input type="number" min="1" step="1" value="${e(p.orcamentoDiario)}" oninput="gcCampo('orcamentoDiario', this)" style="${IN};width:140px"></div>
      <div><label style="${LBL}">Início</label><input type="datetime-local" value="${e(p.inicio)}" onchange="gcCampo('inicio', this)" style="${IN};width:210px"></div>
      <div><label style="${LBL}">Fim (opcional)</label><input type="datetime-local" value="${e(p.fim)}" onchange="gcCampo('fim', this)" style="${IN};width:210px"></div></div>`;
    const m = c.midia;
    const criativo = `<div style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px" class="gc-cri">
      <div><label style="${LBL}">Imagem ou vídeo</label>
        <label style="${BTN};width:100%;box-sizing:border-box">${icon(ICONS.image, 13, "currentColor")} ${m ? "Trocar" : "Enviar"} imagem ou vídeo<input type="file" accept="image/png,image/jpeg,video/mp4,video/quicktime" onchange="gcMidia(this)" hidden></label>
        <p style="${HELP}">${m ? (m.video ? "Vídeo enviado para a biblioteca da conta." : "Imagem enviada para a biblioteca da conta.") : "Imagem 1080x1080 ou 1080x1350 funciona em quase todos os lugares. Vídeo até 200 MB."}</p>
        <label style="${LBL};margin-top:12px">Texto principal</label><textarea rows="5" oninput="gcCampo('criativo.texto', this)" maxlength="2200" placeholder="O que aparece acima da imagem" style="${IN};resize:vertical;line-height:1.5">${e(c.texto)}</textarea>
        <label style="${LBL};margin-top:12px">Título</label><input value="${e(c.titulo)}" maxlength="255" oninput="gcCampo('criativo.titulo', this)" placeholder="Frase curta embaixo da imagem" style="${IN}">
        ${p.objetivo !== "mensagens" ? `<label style="${LBL};margin-top:12px">Link ${p.objetivo === "alcance" ? "(opcional)" : ""}</label><input value="${e(c.link)}" oninput="gcCampo('criativo.link', this)" placeholder="https://" style="${IN}">
          <label style="${LBL};margin-top:12px">Botão</label><select onchange="gcCampo('criativo.cta', this)" style="${IN}">${Object.entries(ctx.ctas).map(([k, n]) => `<option value="${k}" ${c.cta === k ? "selected" : ""}>${n}</option>`).join("")}</select>` : `<p style="${HELP};margin-top:12px">O botão é "Enviar mensagem" e abre a conversa no ${DEST.find(d => d[0] === p.destino)[1]}.</p>`}
      </div>
      <div><label style="${LBL}">Prévia (aproximada)</label><div id="gc-previa">${previaHTML()}</div></div></div>`;
    const sec = (t, corpo) => `<div style="${SEC}"><div style="font-size:14px;font-weight:600;margin-bottom:12px">${t}</div>${corpo}</div>`;
    return `${!ctx.podeCriar ? `<div style="margin:0 22px 14px;padding:11px 14px;border-radius:10px;background:rgba(192,52,28,0.07);font-size:12.5px;color:${VERM}">O token só tem leitura nesta conta: a Meta não deixa criar anúncio aqui. Escolha outra conta ou peça acesso de anunciante na BM.</div>` : ""}
      ${sec("Conta e nome", `${contas}<input value="${e(p.nome)}" maxlength="100" oninput="gcCampo('nome', this)" placeholder="Nome da campanha (ex.: Diagnóstico gratuito · out/26)" style="${IN};margin-top:8px">`)}
      ${sec("Objetivo", obj)}${sec("Quem assina", identidade)}${sec("Público", publico)}${sec("Orçamento e datas", orc)}${sec("Anúncio", criativo)}
      <style>@media (max-width: 760px){ .gc-cri{ grid-template-columns:1fr !important } }</style>`;
  }
  window.gcConta = function(el){ C.contaId = el.value; C.plano.pageId = ""; C.plano.criativo.midia = null; carregarCtx(); };
  function criadoHTML(){
    const c = C.criado;
    return `<div style="padding:26px 22px;text-align:center">
      <div style="width:52px;height:52px;border-radius:50%;background:${c.ativa ? "#E8F5EE" : "#F0ECFD"};color:${c.ativa ? VERDE : ROXO};display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:24px">${c.ativa ? "✓" : "⏸"}</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:600">${c.ativa ? "Campanha ativada" : "Anúncio criado e pausado"}</div>
      <p style="font-size:13px;color:${CINZA};line-height:1.6;max-width:460px;margin:8px auto 18px">${c.ativa ? "A Meta revisa o anúncio (costuma levar de minutos a algumas horas) e começa a veicular." : "Campanha, conjunto e anúncio estão na conta. Nada é gasto enquanto a campanha estiver pausada."}</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${c.ativa ? "" : `<button onclick="gcAtivar()" style="${BTN_PRI}">Ativar agora</button>`}<a href="${e(c.gerenciador)}" target="_blank" rel="noopener" style="${BTN};text-decoration:none">Abrir no Gerenciador de Anúncios</a><button onclick="gcNovo()" style="${BTN}">Criar outro</button></div></div>`;
  }
  window.gcNovo = function(){ C.criado = null; C.plano = novoPlano(); carregarCtx(); };
  function desenhar(){
    let host = document.getElementById("gc-host");
    if(!C){ if(host) host.remove(); return; }
    if(!host){ host = document.createElement("div"); host.id = "gc-host"; document.body.appendChild(host); }
    const corpo = C.criado ? criadoHTML() : C.carregando ? `<div style="padding:30px 22px;font-size:13px;color:${CINZA}">Carregando páginas e permissões da conta...</div>` : C.ctx ? formHTML() : `<div style="padding:22px;color:${VERM};font-size:13px">${e((C.erros || []).join(" · "))}</div>`;
    const rodape = C.criado || !C.ctx ? "" : `<div style="position:sticky;bottom:0;background:#FFFFFF;border-top:1px solid ${BORDA};padding:12px 22px">
      ${C.erros ? `<div style="margin-bottom:10px;padding:10px 12px;border-radius:10px;background:rgba(192,52,28,0.07);font-size:12.5px;color:${VERM};line-height:1.55">${C.erros.map(e).join("<br>")}</div>` : ""}
      ${C.avisos ? `<div style="margin-bottom:10px;padding:10px 12px;border-radius:10px;background:#E8F5EE;font-size:12.5px;color:#1E7A4D;line-height:1.55">✓ ${C.avisos.map(e).join("<br>")}</div>` : ""}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${C.ocupado ? `<span style="font-size:12.5px;color:${ROXO};font-weight:600">${e(C.ocupado)}</span>` : ""}<span style="flex:1"></span><button onclick="gcFechar()" style="${BTN}">Cancelar</button><button onclick="gcValidar()" ${C.ocupado || !C.ctx.podeCriar ? "disabled" : ""} style="${BTN}">Validar na Meta</button><button onclick="gcCriar()" ${C.ocupado || !C.ctx.podeCriar ? "disabled" : ""} style="${BTN_PRI};${C.ocupado || !C.ctx.podeCriar ? "opacity:.5" : ""}">Criar pausado</button></div></div>`;
    host.innerHTML = `<div data-gc-bg style="position:fixed;inset:0;background:rgba(23,23,26,0.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px">
      <div data-gc-modal style="width:100%;max-width:920px;max-height:calc(100vh - 32px);overflow-y:auto;background:#FFFFFF;border-radius:18px;box-shadow:0 24px 70px rgba(23,23,26,0.25)">
        <div style="display:flex;align-items:center;gap:10px;padding:18px 22px"><div style="flex:1"><div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:600">Criar anúncio na Meta</div><div style="font-size:12px;color:${CINZA};margin-top:2px">Tudo nasce pausado. Nada é gasto até você ativar.</div></div><span onclick="gcFechar()" style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${CINZA}">${icon(ICONS.x, 16, "currentColor")}</span></div>
        ${corpo}${rodape}</div></div>`;
    host.querySelector("[data-gc-bg]").addEventListener("mousedown", ev => { if(ev.target === ev.currentTarget && !C.ocupado) fechar(); });
  }
  window.gcFechar = function(){ if(C && C.ocupado) return; fechar(); };
})();
