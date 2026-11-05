// Gestão Comercial: bloco "Leads por canal" com os números REAIS do WhatsApp e do Instagram, complementando o dashboard
// (os números fixos do painel continuam como estão). O index chama vendasCanaisHTML() dentro de renderMotorVendas.
// Carregado depois do script principal: usa state, icon, ICONS e e (escape) de lá.
//   WhatsApp  -> /api/whatsapp/p/conversations (conversas dos SDRs) + /api/whatsapp/crm/leads (CRM de leads)
//   Instagram -> /api/instagram/p/threads (Direct atendido pelo myIG)
(function(){
  const CINZA = "#66666F", HEAD = "font-family:'Space Grotesk',sans-serif", VERDE = "#0F7A68", ROSA = "#C1306B";
  const ETAPAS = [["disparado", "Disparado", "#9A9AA3"], ["conversa_iniciada", "Conversa iniciada", "#2563EB"], ["novo_lead", "Novo lead", "#673DE6"], ["em_negociacao", "Em negociação", "#B7791F"], ["chamar_novamente", "Chamar novamente", "#C2410C"], ["iniciou_compra", "Iniciou compra", "#0E7490"], ["finalizou_compra", "Finalizou compra", "#0F7A68"], ["perdido", "Não vai / Perdido", "#C0341C"]];
  const DIA = 86400000;

  function V(){ if(!state.vendasCanais) state.vendasCanais = { wa: null, crm: null, ig: null, em: 0, carregando: false }; return state.vendasCanais; }
  const pega = async url => { try { const r = await fetch(url, { credentials: "same-origin" }); if(!r.ok || r.redirected) return null; return await r.json(); } catch(err){ return null; } };
  async function carregar(){
    const v = V(); if(v.carregando) return; v.carregando = true; pintar();
    const [wa, crm, ig] = await Promise.all([pega("/api/whatsapp/p/conversations?limit=300"), pega("/api/whatsapp/crm/leads"), pega("/api/instagram/p/threads")]);
    v.wa = wa && Array.isArray(wa.conversations) ? wa.conversations : null;
    v.crm = crm && Array.isArray(crm.leads) ? crm.leads : null;
    v.ig = ig && Array.isArray(ig.threads) ? ig.threads : null;
    v.em = Date.now(); v.carregando = false; pintar();
  }
  function pintar(){ const el = document.getElementById("vc-root"); if(el && state.screen === "motorVendas") el.innerHTML = corpo(); }

  const n = x => Number(x || 0).toLocaleString("pt-BR");
  const pct = (a, b) => b ? (Math.round(a / b * 1000) / 10 + "").replace(".", ",") + "%" : "0%";
  // myIG grava "AAAA-MM-DD HH:MM:SS" em UTC
  const msUtc = s => { if(!s) return 0; const t = Date.parse(String(s).replace(" ", "T") + "Z"); return isNaN(t) ? 0 : t; };
  const hora = ms => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const num = (valor, rotulo, nota, cor) => `<div style="padding:12px 14px;border-radius:11px;background:#F7F7F8;border:1px solid #EEEEF1;min-width:0">
      <div style="${HEAD};font-size:22px;font-weight:600;line-height:1.1;color:${cor || "#17171A"}">${valor}</div>
      <div style="font-size:12px;font-weight:600;margin-top:4px;color:#17171A">${rotulo}</div>
      ${nota ? `<div style="font-size:11px;color:${CINZA};margin-top:2px;line-height:1.4">${nota}</div>` : ""}
    </div>`;
  const fonte = (txt, quando) => `<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid #E6E6EA;font-size:11.5px;color:${CINZA}">
      ${icon(ICONS.refresh, 11, "currentColor")}<span>Fonte: <strong style="color:#3C3C44">${txt}</strong></span>${quando ? `<span>· atualizado ${quando}</span>` : ""}
    </div>`;
  const vazio = txt => `<div style="padding:18px 4px;font-size:12.5px;color:${CINZA}">${txt}</div>`;

  function cartao(cor, logo, titulo, selo, conteudo){
    return `<div style="border:1px solid ${cor}40;border-radius:14px;background:linear-gradient(180deg,${cor}0D 0%,#FFFFFF 45%);padding:20px 22px;min-width:0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        ${logo}
        <strong style="${HEAD};font-size:15px;font-weight:600;flex:1;min-width:0">${titulo}</strong>
        <span style="font-size:10.5px;font-weight:700;color:${cor};border:1px solid ${cor}59;background:${cor}12;padding:3px 9px;border-radius:20px;white-space:nowrap">${selo}</span>
      </div>
      ${conteudo}
    </div>`;
  }

  function blocoWa(){
    const v = V();
    if(!v.em) return vazio("Carregando conversas e leads do CRM...");
    if(!v.wa && !v.crm) return vazio("Não consegui ler o WhatsApp dos SDRs agora. Tente atualizar em instantes.");
    const agora = Date.now(), conv = (v.wa || []).filter(c => c.chat_id !== "status@broadcast" && !/@g\.us$/.test(c.chat_id || ""));
    const ativas7 = conv.filter(c => c.last_ts && agora - c.last_ts * 1000 < 7 * DIA).length;
    const esperando = conv.filter(c => c.last_from_me === 0 || c.last_from_me === false).length;
    const sdrs = {}; conv.forEach(c => { const k = (c.sdr_name || "SDR " + (c.slot || "?")).trim(); sdrs[k] = (sdrs[k] || 0) + 1; });
    const L = v.crm || [], resp = L.filter(l => (l._timeline && l._timeline.replied_at) || (l._stage && l._stage !== "disparado")).length; // respondeu ou já andou no funil
    const porEtapa = ETAPAS.map(([k, nome, cor]) => [nome, cor, L.filter(l => l._stage === k).length]).filter(x => x[2]);
    const max = Math.max(1, ...porEtapa.map(x => x[2]));
    const nums = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
        ${num(v.wa ? n(conv.length) : "-", "Conversas", "nos SDRs conectados")}
        ${num(v.wa ? n(ativas7) : "-", "Ativas em 7 dias", "com mensagem recente")}
        ${num(v.wa ? n(esperando) : "-", "Aguardando resposta", "última mensagem do lead", esperando ? "#C2410C" : null)}
        ${num(v.crm ? n(L.length) : "-", "Leads no CRM", v.crm ? n(resp) + " avançaram além do disparo" : "", VERDE)}
      </div>`;
    const etapas = v.crm ? (porEtapa.length ? `<div style="margin-top:16px">
        <div style="font-size:10.5px;letter-spacing:0.12em;font-weight:700;color:${CINZA};margin-bottom:8px">LEADS POR ETAPA · CRM</div>
        ${porEtapa.map(([nome, cor, q]) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:12px">
          <span style="width:130px;flex:0 0 130px;color:#3C3C44;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</span>
          <span style="flex:1;height:8px;border-radius:5px;background:#F0F0F3;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(3, q / max * 100)}%;background:${cor};border-radius:5px"></span></span>
          <strong style="width:34px;text-align:right;${HEAD}">${q}</strong>
        </div>`).join("")}
      </div>` : vazio("Nenhum lead no CRM ainda.")) : "";
    const porSdr = Object.keys(sdrs).length > 1 ? `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px">${Object.entries(sdrs).sort((a, b) => b[1] - a[1]).map(([s, q]) => `<span style="font-size:11.5px;padding:4px 10px;border-radius:20px;background:#F2F2F5;color:#3C3C44">${e(s)} · <strong>${q}</strong></span>`).join("")}</div>` : "";
    return nums + porSdr + etapas + fonte("CRM de leads + WhatsApp dos SDRs", hora(v.em));
  }

  function blocoIg(){
    const v = V();
    if(!v.em) return vazio("Carregando conversas do Direct...");
    if(!v.ig) return vazio("Não consegui ler o Direct do Instagram agora. Tente atualizar em instantes.");
    const agora = Date.now(), T = v.ig;
    const ativas7 = T.filter(t => agora - msUtc(t.last_message_at) < 7 * DIA).length;
    const hoje = T.filter(t => agora - msUtc(t.last_message_at) < DIA).length;
    const esperando = T.filter(t => t.last_direction === "in").length;
    const comAgente = T.filter(t => t.current_agent_id && !t.paused).length;
    const recentes = T.slice().sort((a, b) => msUtc(b.last_message_at) - msUtc(a.last_message_at)).slice(0, 4);
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
        ${num(n(T.length), "Conversas no Direct", "leads que chamaram")}
        ${num(n(ativas7), "Ativas em 7 dias", n(hoje) + " nas últimas 24h")}
        ${num(n(esperando), "Aguardando resposta", "última mensagem do lead", esperando ? "#C2410C" : null)}
        ${num(n(comAgente), "Com agente de IA", "respondidas pelo ZEUS", ROSA)}
      </div>
      ${recentes.length ? `<div style="margin-top:16px">
        <div style="font-size:10.5px;letter-spacing:0.12em;font-weight:700;color:${CINZA};margin-bottom:8px">ÚLTIMOS LEADS</div>
        ${recentes.map(t => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #F0F0F3;font-size:12px">
          <span style="width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:${t.last_direction === "in" ? "#C2410C" : "#1E8E5A"}"></span>
          <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><strong>${e(t.ig_username ? "@" + t.ig_username : (t.ig_name || "Contato"))}</strong>${t.last_text ? ` <span style="color:${CINZA}">· ${e(String(t.last_text).slice(0, 60))}</span>` : ""}</span>
          <span style="color:${CINZA};white-space:nowrap">${t.last_message_at ? hora(msUtc(t.last_message_at)) : ""}</span>
        </div>`).join("")}
      </div>` : ""}
      ${fonte("Instagram Direct (myIG)", hora(v.em))}`;
  }

  const logoWa = `<span style="width:30px;height:30px;flex:0 0 30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#25D366">${icon(ICONS.whatsapp, 16, "#FFFFFF")}</span>`;
  const logoIg = `<span style="width:30px;height:30px;flex:0 0 30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:linear-gradient(45deg,#F9CE34 5%,#EE2A7B 50%,#6228D7 95%)">${icon(ICONS.instagram, 16, "#FFFFFF")}</span>`;

  function corpo(){
    const v = V();
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 10px">
        <span style="font-size:10.5px;letter-spacing:0.14em;font-weight:700;color:${CINZA}">LEADS POR CANAL</span>
        <span style="font-size:10.5px;font-weight:700;color:${VERDE};border:1px solid rgba(15,122,104,0.35);background:rgba(15,122,104,0.08);padding:2px 8px;border-radius:20px">DADOS REAIS · CRM</span>
        <span style="flex:1"></span>
        <button data-vc-atualizar ${v.carregando ? "disabled" : ""} style="display:flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid #DADADF;border-radius:9px;background:#FFFFFF;font-size:12px;color:#3C3C44;cursor:pointer">${icon(ICONS.refresh, 12, "currentColor")} ${v.carregando ? "Atualizando..." : "Atualizar"}</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;margin-bottom:22px">
        ${cartao("#1E9E52", logoWa, "WhatsApp", "SDRs + CRM", blocoWa())}
        ${cartao("#E1306C", logoIg, "Instagram", "Direct", blocoIg())}
      </div>`;
  }

  // o index chama isto dentro de renderMotorVendas
  window.vendasCanaisHTML = function(){
    const v = V();
    if(Date.now() - v.em > 60000 && !v.carregando) setTimeout(carregar, 0);
    return `<div id="vc-root">${corpo()}</div>`;
  };
  document.addEventListener("click", ev => { if(state.screen !== "motorVendas") return; const b = ev.target.closest && ev.target.closest("[data-vc-atualizar]"); if(b){ V().em = 0; carregar(); } });
})();
