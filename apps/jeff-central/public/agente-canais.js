// Canais do agente: liga o agente para responder sozinho no WhatsApp (números de SDR) e nas DMs do Instagram.
// Modal no body, aberto pelo botão "Canais" do agente e pelo menu do card. Só administradores (o backend também trava).
// Carregado depois do script principal: usa state, icon, ICONS, e (escape), zConfirm, cfgToast, agentsList e render.
// Backend: /api/canais (canais.js).
(function(){
  const ROXO = "#673DE6", VERDE = "#0F7A68", VERM = "#C0341C", CINZA = "#66666F";
  const BTN = "display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid #DADADF;border-radius:8px;font:inherit;font-size:12px;cursor:pointer;background:#FFFFFF;color:#17171A;white-space:nowrap";
  const BTN_PRI = "display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border:0;border-radius:8px;background:" + ROXO + ";color:#FFFFFF;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap";
  const PILL = (cor) => `display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:${cor};border:1px solid ${cor}55;background:${cor}12;padding:2px 8px;border-radius:999px;white-space:nowrap`;
  const BOX = "border:1px solid #E6E6EA;border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap";
  const STATUS = { ready: ["Conectado", VERDE], connected: ["Conectado", VERDE], qr: ["Aguardando QR", ROXO], connecting: ["Conectando", "#9A6700"], disconnected: ["Desconectado", VERM], idle: ["Sem número conectado", CINZA] };
  const MODOS = { receptivo: "todas as conversas", ativo: "só quem recebeu disparo" };

  let F = null; // { id, dados, carregando, erro, ocupado, modo }

  async function api(metodo, caminho, corpo){
    const init = { method: metodo };
    if(corpo !== undefined){ init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(corpo); }
    const r = await fetch("/api/canais" + caminho, init);
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  function agente(){ return agentsList().find(x => x.id === F.id) || (state.agentDetail && state.agentDetail.id === F.id ? state.agentDetail : null); }
  async function carregar(){
    F.carregando = true; desenhar();
    try { F.dados = await api("GET", ""); F.erro = null; } catch(err){ F.erro = err.message; }
    if(F) { F.carregando = false; desenhar(); }
  }
  function fechar(){ F = null; const h = document.getElementById("ag-canais-host"); if(h) h.remove(); }
  // Depois de ligar/desligar: recarrega o modal e a lista de agentes (selos dos cards)
  async function executar(fn, sucesso){
    if(F.ocupado) return;
    F.ocupado = true; F.erro = null; desenhar();
    try {
      await fn(); cfgToast(sucesso); state.agentsData = null; await carregar();
      // Agente aberto na tela: atualiza o contador do botão "Canais" sem recarregar a conversa
      const d = F && F.dados, ad = state.agentDetail;
      if(d && ad && ad.id === F.id){
        ad.canais = d.whatsapp.numeros.filter(n => n.ligado && n.ligado.agentId === F.id).map(n => ({ canal: "whatsapp", alvo: String(n.slot), erro: n.ligado.erro }))
          .concat(d.instagram.ligado && d.instagram.ligado.agentId === F.id ? [{ canal: "instagram", alvo: "ig", erro: d.instagram.ligado.erro }] : []);
      }
      render();
    }
    catch(err){ if(F){ F.erro = err.message; } }
    if(F){ F.ocupado = false; desenhar(); }
  }

  function linhaNumero(n){
    const st = STATUS[n.status] || [n.status || "Sem status", CINZA];
    const meu = n.ligado && n.ligado.agentId === F.id;
    const outro = n.ligado && !meu;
    let acao;
    if(meu) acao = `<span style="${PILL(VERDE)}">Ligado · ${e(MODOS[n.ligado.opcoes.modo] || "todas as conversas")}</span><button data-cn-wa-off="${n.slot}" style="${BTN}">Desligar</button>`;
    else if(!n.temChave) acao = `<span style="font-size:11.5px;color:${CINZA}">Sem chave de IA. Configure na aba WhatsApp.</span>`;
    else acao = `<button data-cn-wa-on="${n.slot}" style="${BTN_PRI}">${outro ? "Trocar para este" : "Ligar"}</button>`;
    return `<div style="${BOX}">
      <span style="width:34px;height:34px;border-radius:9px;background:rgba(37,211,102,0.12);display:flex;align-items:center;justify-content:center;flex:0 0 34px">${icon(ICONS.whatsapp, 17, "#128C4A")}</span>
      <span style="flex:1;min-width:160px;display:flex;flex-direction:column;gap:3px">
        <span style="font-size:13.5px;font-weight:600">${e(n.nome || "Número " + n.slot)}${n.fone ? `<span style="font-weight:400;color:${CINZA};margin-left:6px">${e(n.fone)}</span>` : ""}</span>
        <span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span style="${PILL(st[1])}">${e(st[0])}</span>${outro ? `<span style="font-size:11.5px;color:${CINZA}">Atende hoje: <b style="color:#17171A">${e(n.ligado.agentName)}</b></span>` : ""}</span>
        ${meu && n.ligado.erro ? `<span style="font-size:11.5px;color:${VERM}">Última atualização falhou: ${e(n.ligado.erro)}</span>` : ""}
        ${meu && n.ligado.opcoes.truncado ? `<span style="font-size:11.5px;color:#9A6700">A base de conhecimento não coube inteira no número (limite de 20 mil caracteres).</span>` : ""}
      </span>
      <span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${acao}</span>
    </div>`;
  }

  function secaoWhatsapp(){
    const w = F.dados.whatsapp;
    if(w.erro) return `<div style="font-size:12.5px;color:${VERM}">${e(w.erro)}</div>`;
    const lista = w.numeros.length ? w.numeros.map(linhaNumero).join("") : `<div style="font-size:12.5px;color:${CINZA};padding:6px 0">Nenhum número de SDR configurado. Conecte um na aba WhatsApp.</div>`;
    const opc = (m, t) => `<label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer"><input type="radio" name="cn-modo" value="${m}" ${F.modo === m ? "checked" : ""} style="accent-color:${ROXO}">${t}</label>`;
    return `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:12.5px;color:#3C3C44"><span style="font-weight:600">Ao ligar, responder:</span>${opc("receptivo", "Todas as conversas")}${opc("ativo", "Só quem recebeu disparo")}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${lista}</div>
      <p style="margin:8px 0 0;font-size:11.5px;color:#9A9AA3;line-height:1.5">Um agente por número. As instruções que o número tinha antes ficam guardadas e voltam quando você desliga.</p>`;
  }

  function secaoInstagram(){
    const g = F.dados.instagram;
    if(g.erro) return `<div style="font-size:12.5px;color:${VERM}">${e(g.erro)}</div>`;
    const meu = g.ligado && g.ligado.agentId === F.id;
    const outro = g.ligado && !meu ? g.ligado.agentName : (g.outros[0] || null);
    let acao;
    if(meu) acao = `<span style="${PILL(VERDE)}">Respondendo as DMs</span><button data-cn-ig-off style="${BTN}">Desligar</button>`;
    else acao = `<button data-cn-ig-on style="${BTN_PRI}">${outro ? "Trocar para este" : "Ligar"}</button>`;
    return `<div style="${BOX}">
      <span style="width:34px;height:34px;border-radius:9px;background:rgba(225,48,108,0.10);display:flex;align-items:center;justify-content:center;flex:0 0 34px">${icon(ICONS.instagram, 17, "#C13584")}</span>
      <span style="flex:1;min-width:160px;display:flex;flex-direction:column;gap:3px">
        <span style="font-size:13.5px;font-weight:600">DMs de ${e(g.conta || "Instagram")}</span>
        <span style="font-size:11.5px;color:${CINZA}">${meu ? "Este agente responde todas as DMs." : outro ? `Responde hoje: <b style="color:#17171A">${e(outro)}</b>` : "Nenhum agente respondendo agora."}</span>
        ${meu && g.ligado.erro ? `<span style="font-size:11.5px;color:${VERM}">Última atualização falhou: ${e(g.ligado.erro)}</span>` : ""}
      </span>
      <span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${acao}</span>
    </div>
    <p style="margin:8px 0 0;font-size:11.5px;color:#9A9AA3;line-height:1.5">Um agente por vez. Ligar este desliga o que estiver respondendo agora.</p>`;
  }

  function desenhar(){
    let host = document.getElementById("ag-canais-host");
    if(!F){ if(host) host.remove(); return; }
    if(!host){ host = document.createElement("div"); host.id = "ag-canais-host"; document.body.appendChild(host); }
    const a = agente();
    const titulo = (t) => `<div style="font-size:10.5px;letter-spacing:0.14em;font-weight:700;color:${CINZA};margin:18px 0 10px">${t}</div>`;
    const corpo = F.carregando && !F.dados ? `<div style="font-size:12.5px;color:${CINZA};padding:14px 0">Carregando canais...</div>`
      : !F.dados ? "" : titulo("WHATSAPP") + secaoWhatsapp() + titulo("INSTAGRAM") + secaoInstagram();
    host.innerHTML = `<div data-cn-bg style="position:fixed;inset:0;background:rgba(23,23,26,0.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px">
      <div data-cn-modal style="width:100%;max-width:620px;max-height:calc(100vh - 32px);overflow-y:auto;background:#FFFFFF;border-radius:18px;box-shadow:0 24px 70px rgba(23,23,26,0.25);padding:22px 22px 18px;${F.ocupado ? "opacity:.75;pointer-events:none" : ""}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><h2 style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:600;margin:0;flex:1">Canais ${a ? "de " + e(a.name) : "do agente"}</h2><span data-cn-close style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${CINZA}">${icon(ICONS.x, 16, "currentColor")}</span></div>
        <p style="margin:0;font-size:12.5px;color:${CINZA};line-height:1.5">Onde este agente responde sozinho. Quem escreve nesses canais é cliente: o agente responde só com o prompt e a base de conhecimento, sem habilidades nem ferramentas. Editar o agente atualiza os canais na hora.</p>
        ${F.erro ? `<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(192,52,28,0.08);font-size:12.5px;color:${VERM}">${e(F.erro)}</div>` : ""}
        ${F.ocupado ? `<div style="margin-top:12px;font-size:12.5px;color:${ROXO};font-weight:600">Aplicando...</div>` : ""}
        ${corpo}
        <div style="display:flex;justify-content:flex-end;margin-top:18px;padding-top:12px;border-top:1px solid #F1F1F3"><span data-cn-close style="${BTN};padding:9px 14px;font-size:12.5px">Fechar</span></div>
      </div></div>`;

    host.querySelectorAll("[data-cn-close]").forEach(el => el.addEventListener("click", ev => { ev.stopPropagation(); fechar(); }));
    host.querySelector("[data-cn-bg]").addEventListener("mousedown", ev => { if(ev.target === ev.currentTarget) fechar(); });
    host.querySelector("[data-cn-modal]").addEventListener("click", ev => ev.stopPropagation());
    host.querySelectorAll("input[name=cn-modo]").forEach(el => el.addEventListener("change", () => { F.modo = el.value; }));
    const nome = a ? `"${a.name}"` : "este agente";
    host.querySelectorAll("[data-cn-wa-on]").forEach(el => el.addEventListener("click", async () => {
      const slot = +el.dataset.cnWaOn, n = F.dados.whatsapp.numeros.find(x => x.slot === slot) || {};
      const quem = n.nome || "Número " + slot;
      const msg = `Ligar ${nome} no WhatsApp ${quem}? Ele passa a responder ${MODOS[F.modo]} desse número.` + (n.ligado ? ` Hoje quem atende é "${n.ligado.agentName}", que sai do número.` : "");
      if(!await zConfirm(msg, { ok: "Ligar", danger: false })) return;
      executar(() => api("POST", "/whatsapp", { agentId: F.id, slot, modo: F.modo }), "Agente ligado no WhatsApp " + quem + ".");
    }));
    host.querySelectorAll("[data-cn-wa-off]").forEach(el => el.addEventListener("click", async () => {
      if(!await zConfirm(`Desligar ${nome} deste número? As instruções e a IA voltam a ser como eram antes.`, { ok: "Desligar", danger: true })) return;
      executar(() => api("DELETE", "/whatsapp/" + el.dataset.cnWaOff), "Agente desligado do WhatsApp.");
    }));
    const igOn = host.querySelector("[data-cn-ig-on]");
    if(igOn) igOn.addEventListener("click", async () => {
      const g = F.dados.instagram;
      const sai = g.ligado ? [g.ligado.agentName] : g.outros;
      const msg = `Ligar ${nome} nas DMs de ${g.conta || "Instagram"}? Ele passa a responder todas as mensagens diretas.` + (sai.length ? ` Sai do Instagram: ${sai.join(", ")}.` : "");
      if(!await zConfirm(msg, { ok: "Ligar", danger: false })) return;
      executar(() => api("POST", "/instagram", { agentId: F.id }), "Agente ligado no Instagram.");
    });
    const igOff = host.querySelector("[data-cn-ig-off]");
    if(igOff) igOff.addEventListener("click", async () => {
      if(!await zConfirm(`Desligar ${nome} das DMs do Instagram? As DMs deixam de ser respondidas por ele.`, { ok: "Desligar", danger: true })) return;
      executar(() => api("DELETE", "/instagram"), "Agente desligado do Instagram.");
    });
  }

  // Abre o modal (botão "Canais" do agente e item do menu do card)
  window.agentCanais = function(id){ F = { id, dados: null, carregando: true, erro: null, ocupado: false, modo: "receptivo" }; desenhar(); carregar(); };
  // Selos dos canais ligados, nos cards de Meus agentes
  window.agentCanaisSelos = function(a){
    const cs = (a && a.canais) || [];
    if(!cs.length) return "";
    const wa = cs.filter(c => c.canal === "whatsapp").length, ig = cs.some(c => c.canal === "instagram");
    const erro = cs.some(c => c.erro);
    const selo = (ic, cor, txt) => `<span style="${PILL(cor)}">${icon(ic, 11, "currentColor")}${txt}</span>`;
    return `<div title="${erro ? "Uma atualização de canal falhou: abra Canais" : "Canais em que este agente responde sozinho"}" style="display:flex;gap:6px;flex-wrap:wrap">${wa ? selo(ICONS.whatsapp, erro ? VERM : "#128C4A", wa > 1 ? "WhatsApp · " + wa : "WhatsApp") : ""}${ig ? selo(ICONS.instagram, erro ? VERM : "#C13584", "Instagram") : ""}</div>`;
  };
})();
