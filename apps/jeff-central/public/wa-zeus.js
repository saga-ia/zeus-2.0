// Zeus bot em Conectores › WhatsApp: o número principal do ZEUS (Zeus Worker) aparece no topo do conector, com o estado
// da sessão e o pareamento por QR ou código, sem sair da Central. Os outros números da tela continuam sendo da Evolution.
// Carregado depois do script principal: usa state, icon, ICONS, e (escape), zAlert, zConfirm e cfgToast de lá. O index
// chama waZeusHTML() dentro de renderWaConnector. Backend: /api/wa/zeus (zeus-bot.js).
// O estado fica em state.waZeus (state.wa é do conector e state.waSdr é da tela WhatsApp).
(function(){
  const ROXO = "#673DE6", ROXO_E = "#5429C9", CINZA = "#66666F", MUTE = "#9A9AA3", VERM = "#C0341C";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const BTN = "display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid #DADADF;border-radius:8px;font-size:12px;cursor:pointer;background:#FFFFFF;color:#17171A;white-space:nowrap";
  const BTN_PRI = "display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border-radius:8px;background:" + ROXO + ";color:#FFFFFF;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap";
  const IN = "width:100%;padding:10px 12px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none;box-sizing:border-box";
  const SEG = on => `padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;${on ? "background:#FFFFFF;font-weight:600;box-shadow:0 1px 3px rgba(23,23,26,0.12)" : "color:#66666F"}`;
  const ESTADOS = {
    ready: ["Conectado", "#0F7A68", "rgba(15,122,104,0.08)", "rgba(15,122,104,0.35)"],
    qr: ["Aguardando QR", ROXO, "rgba(103,61,230,0.08)", "rgba(103,61,230,0.35)"],
    authenticated: ["Conectando...", "#9A6700", "rgba(154,103,0,0.08)", "rgba(154,103,0,0.35)"],
    initializing: ["Iniciando...", "#9A6700", "rgba(154,103,0,0.08)", "rgba(154,103,0,0.35)"],
    disconnected: ["Desconectado", VERM, "rgba(192,52,28,0.08)", "rgba(192,52,28,0.35)"],
    auth_failure: ["Falha de autenticação", VERM, "rgba(192,52,28,0.08)", "rgba(192,52,28,0.35)"]
  };
  const estadoDe = s => ESTADOS[s] || ["Sem resposta", VERM, "rgba(192,52,28,0.08)", "rgba(192,52,28,0.35)"];
  const fmtFone = p => { const d = String(p || "").replace(/\D/g, ""); if(!d) return ""; if(d.length === 13 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`; if(d.length === 12 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`; return "+" + d; };

  function Z(){ if(!state.waZeus) state.waZeus = { st: null, erro: null, oculto: false, carregando: false, modal: null }; return state.waZeus; }
  async function api(p, opts){
    opts = opts || {};
    const init = { method: opts.method || "GET" };
    if(opts.body !== undefined){ init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(opts.body); }
    const r = await fetch("/api/wa/zeus" + p, init);
    const j = await r.json().catch(() => ({}));
    if(!r.ok){ const err = new Error(j.error || ("HTTP " + r.status)); err.status = r.status; err.dados = j; throw err; }
    return j;
  }
  async function carregar(){
    const z = Z(); if(z.carregando) return; z.carregando = true;
    const antes = z.st && z.st.state;
    try { z.st = await api(""); z.erro = null; z.oculto = false; }
    catch(err){ if(err.status === 404) z.oculto = true; else z.erro = err.message; } // 404: a Central ainda não tem a ponte (servidor antigo no ar)
    z.carregando = false;
    if(z.modal && z.st && z.st.state === "ready"){ fecharModal(); cfgToast("Zeus bot conectado" + (z.st.number ? " em " + fmtFone(z.st.number) : "") + "."); }
    else if(z.modal && antes !== (z.st && z.st.state)) modalPinta();
    pintar();
  }

  // ─── cartão no topo do conector ──────────────────────────────────────────────
  function corpo(){
    const z = Z(), s = z.st;
    if(z.oculto) return "";
    const rotulo = t => `<div style="font-size:10.5px;letter-spacing:0.14em;font-weight:700;color:${CINZA};margin:0 0 10px">${t}</div>`;
    if(!s) return `${rotulo("ZEUS BOT · NÚMERO PRINCIPAL")}<div style="padding:18px;border:1px ${z.erro ? "solid rgba(192,52,28,0.3)" : "dashed #DADADF"};border-radius:14px;background:#FFFFFF;font-size:13px;color:${z.erro ? VERM : CINZA};margin-bottom:22px">${z.erro ? e(z.erro) : "Consultando o Zeus bot..."}</div>${rotulo("OUTROS NÚMEROS · EQUIPE")}`;
    const es = estadoDe(s.state), on = s.state === "ready", esperando = s.state === "authenticated" || s.state === "initializing";
    const botoes = !s.admin ? "" : on
      ? `<span data-wz="sair" data-hover-border style="${BTN}">${icon(ICONS.logout, 12, "currentColor")}Desconectar</span>`
      : `<span data-wz="conectar" data-hover-dark style="${BTN_PRI}${esperando ? ";opacity:.6;pointer-events:none" : ""}">${icon(ICONS.play, 12, "none", "currentColor")}Conectar / QR</span><span data-wz="novo-qr" data-hover-border title="Recria a sessão do Zeus Worker e gera um QR novo" style="${BTN}">${icon(ICONS.refresh, 12, "currentColor")}Reiniciar sessão</span>`;
    return `${rotulo("ZEUS BOT · NÚMERO PRINCIPAL")}
      <div style="border:1px solid ${on ? "rgba(15,122,104,0.35)" : "#E6E6EA"};border-radius:14px;background:#FFFFFF;padding:16px;display:flex;flex-direction:column;gap:12px;margin-bottom:${on ? 22 : 10}px;max-width:560px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="width:38px;height:38px;flex:0 0 38px;border-radius:11px;background:#17171A;display:flex;align-items:center;justify-content:center">${icon(ICONS.bolt, 18, "none", "#FFFFFF")}</span>
          <div style="flex:1;min-width:0">
            <div style="${HEAD};font-size:14.5px;font-weight:600">Zeus bot</div>
            <div style="font-size:11.5px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.number ? e(fmtFone(s.number)) + (s.name ? " · " + e(s.name) : "") : "sem número conectado"}</div>
          </div>
          <span style="font-size:10.5px;font-weight:600;color:${es[1]};border:1px solid ${es[3]};background:${es[2]};padding:3px 9px;border-radius:20px;white-space:nowrap">${es[0]}</span>
        </div>
        <div style="font-size:11px;color:${CINZA};padding-top:11px;border-top:1px solid #E6E6EA;line-height:1.6">
          <div>Motor: <code style="font-size:11px;color:#3C3C44">Zeus Worker</code> · responde as mensagens do ZEUS no WhatsApp</div>
          ${s.fila != null ? `<div>${s.fila} ${s.fila === 1 ? "mensagem" : "mensagens"} na fila de envio${!on && s.fila ? ", esperando o número voltar" : ""}</div>` : ""}
        </div>
        ${botoes ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${botoes}</div>` : ""}
      </div>
      ${on ? "" : `<div style="display:flex;gap:10px;align-items:flex-start;max-width:560px;padding:11px 14px;border:1px solid rgba(192,52,28,0.3);border-radius:11px;background:rgba(192,52,28,0.05);font-size:12.5px;color:#3C3C44;line-height:1.5;margin-bottom:22px">${icon(ICONS.warn, 15, VERM)}<span>O Zeus bot está sem sessão do WhatsApp: não recebe nem responde mensagens até o número ser pareado de novo.${s.admin ? " Clique em <strong>Conectar / QR</strong> e leia o código com o celular do número do Zeus." : " Peça a um administrador para conectar."}</span></div>`}
      ${z.erro ? `<div style="max-width:560px;font-size:12px;color:${VERM};margin:-12px 0 22px">${e(z.erro)}</div>` : ""}
      ${(() => { const dup = s.number ? ((state.wa && state.wa.instances) || []).find(i => i.number && String(i.number) === String(s.number)) : null; return dup ? `<div style="display:flex;gap:10px;align-items:flex-start;max-width:560px;padding:11px 14px;border:1px solid rgba(154,103,0,0.35);border-radius:11px;background:rgba(154,103,0,0.06);font-size:12.5px;color:#3C3C44;line-height:1.5;margin:-12px 0 22px">${icon(ICONS.warn, 15, "#9A6700")}<span>O número principal também está conectado em Outros números ("${e(dup.friendly || dup.name)}"). Ele deve ficar só aqui, no Zeus bot: remova de lá. Outros números é para os números da equipe.</span></div>` : ""; })()}
      ${rotulo("OUTROS NÚMEROS · EQUIPE")}`;
  }
  // o index chama isto dentro de renderWaConnector
  window.waZeusHTML = function(){
    const z = Z();
    if(!z.st && !z.erro && !z.oculto) setTimeout(carregar, 0);
    return `<div id="wz-root">${corpo()}</div>`;
  };
  function pintar(){ const el = document.getElementById("wz-root"); if(el && state.screen === "waConnector") el.innerHTML = corpo(); }

  // ─── modal de pareamento (QR ou código de 8 dígitos) ─────────────────────────
  function abrirModal(){ Z().modal = { aba: "qr", qr: null, aviso: "Buscando o QR code...", fone: "", codigo: null }; modalPinta(); qrBuscar(); }
  function fecharModal(){ Z().modal = null; modalPinta(); }
  function modalPinta(){
    let host = document.getElementById("wz-modal-host");
    const m = Z().modal;
    if(!m || state.screen !== "waConnector"){ if(host) host.remove(); return; }
    if(!host){ host = document.createElement("div"); host.id = "wz-modal-host"; document.body.appendChild(host); }
    const foco = document.activeElement && document.activeElement.id === "wz-fone" ? { v: document.activeElement.value, s: document.activeElement.selectionStart } : null;
    host.innerHTML = modalHTML(m);
    if(foco){ const el = document.getElementById("wz-fone"); if(el){ el.value = foco.v; el.focus(); try { el.setSelectionRange(foco.s, foco.s); } catch(err){} } }
  }
  function vivoPinta(){ const el = document.getElementById("wz-vivo"); if(el) el.innerHTML = vivoHTML(Z().modal); }
  function vivoHTML(m){
    if(m.aba === "qr") return `<div style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <div style="width:256px;height:256px;border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:8px">${m.qr ? `<img src="${m.qr}" alt="QR code" data-no-invert style="width:240px;height:240px;display:block">` : `<span class="tm-pulse" style="font-size:12.5px;color:${CINZA};text-align:center;padding:20px">${e(m.aviso || "Aguardando...")}</span>`}</div>
        ${m.qr && m.aviso ? `<div style="font-size:12.5px;color:${VERM};text-align:center">${e(m.aviso)}</div>` : ""}
        <div style="font-size:11.5px;color:${MUTE}">O QR troca sozinho a cada poucos segundos.</div></div>`;
    return `<div style="display:flex;flex-direction:column;gap:12px">
        <div style="padding:22px;border:1px solid #E6E6EA;border-radius:16px;background:#FAFAFA;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:8px;font-weight:700;color:${m.codigo ? "#17171A" : "#B4B4BC"}">${m.codigo ? e(String(m.codigo).replace(/^(.{4})(.{4})$/, "$1-$2")) : "––––––––"}</div>
        ${m.aviso ? `<div class="${/aguarde/i.test(m.aviso) ? "tm-pulse" : ""}" style="font-size:12.5px;color:${/aguarde|informe/i.test(m.aviso) ? CINZA : VERM};text-align:center">${e(m.aviso)}</div>` : ""}</div>`;
  }
  function modalHTML(m){
    const passos = m.aba === "qr" ? ["Abra o WhatsApp no celular do número do Zeus", "Toque em <strong>Configurações › Aparelhos conectados</strong>", "Toque em <strong>Conectar aparelho</strong> e aponte a câmera para a tela"] : ["Abra o WhatsApp no celular do número do Zeus", "Toque em <strong>Aparelhos conectados › Conectar aparelho</strong>", "Toque em <strong>Conectar com número de telefone</strong>", "Digite o código acima"];
    return `<div data-wz="fundo" style="position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(23,23,26,0.4)">
      <div style="width:100%;max-width:520px;max-height:calc(100vh - 40px);overflow-y:auto;background:#FFFFFF;border-radius:16px;padding:24px;box-shadow:0 30px 60px rgba(0,0,0,0.25);display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:flex-start;gap:12px"><div style="flex:1"><div style="${HEAD};font-size:18px;font-weight:600">Conectar o Zeus bot</div><div style="font-size:12.5px;color:${CINZA};margin-top:4px;line-height:1.5">Pareie o número principal do ZEUS. Assim que conectar, ele volta a receber e responder.</div></div><span data-wz="fechar" data-hover title="Fechar" style="width:32px;height:32px;flex:0 0 32px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.x, 16, CINZA)}</span></div>
        <div style="display:inline-flex;gap:3px;padding:4px;border:1px solid #E6E6EA;border-radius:11px;background:#F1F1F3;align-self:flex-start"><span data-wz="aba-qr" style="${SEG(m.aba === "qr")}">QR code</span><span data-wz="aba-codigo" style="${SEG(m.aba === "codigo")}">Código de 8 dígitos</span></div>
        ${m.aba === "codigo" ? `<div><div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${CINZA};margin-bottom:6px">Número do Zeus (DDI + DDD + número, só dígitos)</div><div style="display:flex;gap:8px"><input id="wz-fone" type="tel" inputmode="numeric" value="${e(m.fone || "")}" placeholder="5511999999999" style="${IN}"><span data-wz="gerar-codigo" data-hover-dark style="${BTN_PRI};padding:10px 16px">Gerar código</span></div></div>` : ""}
        <div id="wz-vivo">${vivoHTML(m)}</div>
        <ol style="margin:0;padding-left:20px;font-size:12.5px;color:#3C3C44;line-height:1.8">${passos.map(p => `<li>${p}</li>`).join("")}</ol>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span data-wz="novo-qr" data-hover-border title="Recria a sessão do Zeus Worker e gera um QR novo" style="${BTN}">${icon(ICONS.refresh, 12, "currentColor")}Reiniciar sessão</span><span style="flex:1"></span><span data-wz="fechar" data-hover-border style="${BTN};padding:9px 16px;font-size:13px">Fechar</span></div>
      </div></div>`;
  }
  async function qrBuscar(){
    const m = Z().modal; if(!m || m.aba !== "qr") return;
    try { const j = await api("/qr"); if(Z().modal !== m) return; m.qr = j.qr; m.aviso = ""; }
    catch(err){ if(Z().modal !== m) return; if(err.status === 409){ m.qr = null; const st = (err.dados && err.dados.state) || (Z().st && Z().st.state); m.aviso = st === "ready" ? "O número já está conectado." : "O worker ainda está preparando o QR. Aguarde alguns segundos..."; } else m.aviso = err.message; }
    vivoPinta();
  }
  async function gerarCodigo(){
    const m = Z().modal; if(!m) return;
    const inp = document.getElementById("wz-fone"), fone = String((inp && inp.value) || "").replace(/\D/g, ""); m.fone = fone;
    if(fone.length < 10 || fone.length > 15) return zAlert("Número inválido. Use DDI + DDD + número, só dígitos (ex.: 5511999999999).");
    m.codigo = null; m.aviso = "Gerando o código, aguarde até 30 segundos..."; vivoPinta();
    try { const j = await api("/pair", { method: "POST", body: { phone: fone } }); if(Z().modal !== m) return; m.codigo = j.code; m.aviso = ""; }
    catch(err){ if(Z().modal !== m) return; m.aviso = err.message; }
    vivoPinta();
  }

  // ─── eventos (delegados: o cartão é repintado sem recarregar a tela) ─────────
  document.addEventListener("click", async ev => {
    if(state.screen !== "waConnector") return;
    const el = ev.target.closest && ev.target.closest("[data-wz]"); if(!el) return;
    const acao = el.dataset.wz, z = Z();
    if(acao === "fundo"){ if(ev.target === el) fecharModal(); return; }
    ev.stopPropagation();
    if(acao === "fechar") return fecharModal();
    if(acao === "conectar") return abrirModal();
    if(acao === "aba-qr" || acao === "aba-codigo"){ const m = z.modal; if(!m) return; const inp = document.getElementById("wz-fone"); if(inp) m.fone = inp.value; m.aba = acao === "aba-qr" ? "qr" : "codigo"; m.aviso = m.aba === "qr" ? (m.qr ? "" : "Buscando o QR code...") : (m.codigo ? "" : "Informe o número do Zeus e clique em Gerar código."); modalPinta(); if(m.aba === "qr") qrBuscar(); return; }
    if(acao === "gerar-codigo") return gerarCodigo();
    if(acao === "novo-qr"){
      if(!await zConfirm("Reiniciar a sessão do Zeus Worker? Ele recria a conexão com o WhatsApp e gera um QR novo. Use quando o QR não aparece ou o pareamento travou.", { ok: "Reiniciar sessão" })) return;
      try { await api("/restart", { method: "POST", body: {} }); cfgToast("Sessão reiniciada. O QR novo aparece em alguns segundos."); if(z.modal){ z.modal.qr = null; z.modal.codigo = null; z.modal.aviso = "Reiniciando a sessão e gerando um QR code novo..."; vivoPinta(); } setTimeout(carregar, 4000); }
      catch(err){ zAlert("Não consegui reiniciar a sessão: " + err.message); }
      return;
    }
    if(acao === "sair"){
      if(!await zConfirm("Desconectar o número do Zeus bot? Ele para de receber e responder mensagens no WhatsApp até ser pareado de novo com o celular.", { ok: "Desconectar", danger: true })) return;
      try { await api("/logout", { method: "POST", body: {} }); cfgToast("Zeus bot desconectado."); setTimeout(carregar, 2500); }
      catch(err){ zAlert("Não consegui desconectar: " + err.message); }
    }
  });
  document.addEventListener("keydown", ev => { if(state.screen !== "waConnector" || !Z().modal) return; if(ev.key === "Escape") fecharModal(); else if(ev.key === "Enter" && ev.target && ev.target.id === "wz-fone"){ ev.preventDefault(); gerarCodigo(); } });
  // enquanto a tela do conector está aberta: estado a cada 5 s (3 s com o modal aberto) e QR novo a cada 9 s
  let _n = 0;
  setInterval(() => {
    const z = Z(); _n++;
    if(state.screen !== "waConnector"){ if(z.modal){ z.modal = null; modalPinta(); } return; }
    if(document.visibilityState === "hidden" || z.oculto) return;
    if(z.modal){ carregar(); if(z.modal && z.modal.aba === "qr" && _n % 3 === 0) qrBuscar(); }
    else if(_n % 2 === 0 && !(z.st && z.st.state === "ready" && _n % 6 !== 0)) carregar();
  }, 3000);
})();
