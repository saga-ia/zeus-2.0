// Jarvis (tela /jarvis): conversa por voz com o ZEUS. Você fala, ele transcreve (Whisper, /api/chat/transcribe), pensa no
// chat do ZEUS (sessão context 'jarvis': resposta curta e falada) e responde com a voz "Zeus" (/api/jarvis/falar).
// A tela mostra o que acontece de verdade: o evento 'acao' do chat diz quem está trabalhando (skill/subagente do time ou
// fonte de dados) e acende o cartão e a linha até ele; números da resposta (blocos zeus-kpi/zeus-grafico) viram painéis.
// Carregado depois do script principal: usa state, RENDERERS, icon, ICONS, e, cfgToast, meFoto, mePrimeiroNome, vizKpi, vizChart.
(function(){
  const EQUIPE = [
    ["nina", "Nina", "Social media"], ["sobral", "Sobral", "Gestor de tráfego"], ["icaro", "Ícaro", "Copywriter"], ["gustavo", "Gustavo", "Designer"],
    ["maicom", "Maicom", "Estrategista"], ["otavio", "Otávio", "Comercial"], ["smith", "Smith", "Engenharia e segurança"], ["tome", "Tomé", "Qualidade"],
    ["talles", "Talles", "Vídeo"], ["eduardo", "Eduardo", "Minisites"],
  ];
  const FONTES = [["meta", "Meta Ads"], ["instagram", "Instagram"], ["linkedin", "LinkedIn"], ["whatsapp", "WhatsApp"], ["clickup", "ClickUp"],
    ["financeiro", "Financeiro"], ["google", "Google"], ["web", "Web"], ["dados", "Banco de dados"], ["servidor", "Servidor"]];
  const FASE = { ocioso: "Toque em conversar e fale",  ouvindo: "Ouvindo...", transcrevendo: "Entendendo o que você disse...", pensando: "Pensando...", falando: "Falando" };

  const SDK = "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm";
  // modo padrão: tempo real (ElevenLabs, responde em < 1 s). O modo por botão (link na tela) fala com a voz grátis do
  // jeff-voz, mas leva ~10 s por resposta; testado e descartado como padrão pelo Jeff em 29/10/2026.
  const J = { modo: "tempo-real", conv: null, conectando: false, pendente: null, zeusOcupado: false, sid: null, es: null, fase: "ocioso", continuo: false, status: "", legenda: "", voce: "", resposta: "", trabalho: {}, fontes: {}, paineis: [],
    historico: [], verHistorico: false, rec: null, stream: null, ctx: null, analyser: null, audio: null, raf: null, particulas: null, vadT: null };
  const set = (k, v) => { J[k] = v; pintar(); };

  // ─── áudio: analisador para o anel reagir à voz (microfone ou resposta) ─────
  function ctxAudio(){ if(!J.ctx){ const C = window.AudioContext || window.webkitAudioContext; J.ctx = new C(); } if(J.ctx.state === "suspended") J.ctx.resume(); return J.ctx; }
  function novoAnalisador(fonte){ const a = ctxAudio().createAnalyser(); a.fftSize = 128; a.smoothingTimeConstant = 0.75; fonte.connect(a); J.analyser = a; return a; }
  function nivel(){ if(!J.analyser) return 0; const d = new Uint8Array(J.analyser.frequencyBinCount); J.analyser.getByteFrequencyData(d); let s = 0; for(const v of d) s += v; return s / d.length / 255; }

  // ─── multitarefa: o ZEUS faz até 3 pedidos AO MESMO TEMPO ────────────────────────
  // Cada pedido vira uma tarefa e roda numa "mesa": uma conversa do chat reaproveitada (são 3 mesas por tela; criar uma
  // conversa por pedido estouraria o limite de 50 conversas por pessoa e apagaria as conversas antigas do chat).
  // Pedido que demora: a voz avisa na hora o que está fazendo e libera para o próximo pedido; o resultado é falado quando sai.
  const MESAS = 3, AVISO_MS = 7000;
  J.mesas = []; J.tarefas = []; J.falas = [];
  let _tid = 0;
  const curto = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); n = n || 70; return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t; };
  const meuNome = () => (typeof mePrimeiroNome === "function" && mePrimeiroNome() !== "você") ? mePrimeiroNome() : "";
  const ativas = () => J.tarefas.filter(t => t.estado === "trabalhando" || t.estado === "na fila");
  function atualizarOcupado(){ J.zeusOcupado = J.tarefas.some(t => t.estado === "trabalhando"); }
  // Contexto da conversa por voz (as mesas não sabem o que foi dito nas outras)
  function contextoRecente(){
    const h = J.historico.filter(m => !/^(→ Zeus:|✓ )/.test(m.texto)).slice(-6);
    return h.length ? "[Conversa por voz até aqui, para contexto (não responda a isto, só ao pedido abaixo):\n" + h.map(m => (m.eu ? "Pessoa: " : "ZEUS: ") + curto(m.texto, 300)).join("\n") + "]\n\n" : "";
  }
  function novaTarefa(texto, origem){
    const t = { id: ++_tid, texto, origem, estado: "na fila", criada: Date.now(), resposta: "", status: "", agentes: [], contexto: contextoRecente() };
    J.tarefas.push(t);
    J.tarefas = J.tarefas.filter(x => ativas().includes(x) || Date.now() - (x.fim || 0) < 60000).slice(-12);
    iniciarTarefas();
    return t;
  }
  function iniciarTarefas(){
    for(const t of J.tarefas){
      if(t.estado !== "na fila") continue;
      let m = J.mesas.find(x => !x.tarefa);
      if(!m && J.mesas.length < MESAS){ m = { sid: null, es: null, tarefa: null }; J.mesas.push(m); }
      if(!m) break;
      m.tarefa = t; t.mesa = m; t.estado = "trabalhando"; t.inicio = Date.now();
      rodar(t, m);
    }
    atualizarOcupado(); pintarTarefas(); pintarStatus();
  }
  async function rodar(t, m){
    try {
      if(!m.sid){
        const r = await fetch("/api/chat/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Jarvis · mesa " + (J.mesas.indexOf(m) + 1), context: "jarvis" }) });
        const j = await r.json(); if(!r.ok) throw new Error(j.error || "HTTP " + r.status);
        m.sid = j.id; await abrirMesa(m);
      }
      const fd = new FormData(); fd.append("text", t.contexto + t.texto);
      const r = await fetch("/api/chat/sessions/" + encodeURIComponent(m.sid) + "/send", { method: "POST", body: fd });
      if(!r.ok){ const j = await r.json().catch(() => ({})); throw new Error(j.error || "HTTP " + r.status); }
    } catch(err){ concluir(t, "[erro] " + err.message); }
  }
  // Abre o stream da mesa e só resolve quando conectou (mandar antes perde os eventos); os eventos vão para a tarefa da vez
  function abrirMesa(m){
    return new Promise(pronto => {
      const es = new EventSource("/api/chat/sessions/" + encodeURIComponent(m.sid) + "/stream"); m.es = es;
      setTimeout(pronto, 3000); es.addEventListener("open", () => pronto());
      const t = () => m.tarefa;
      es.addEventListener("zeus_start", () => { if(t()) t().resposta = ""; });
      es.addEventListener("status", ev => { try { if(t()){ t().status = JSON.parse(ev.data).text || ""; pintarStatus(); pintarTarefas(); } } catch(err){} });
      es.addEventListener("acao", ev => { try { const a = JSON.parse(ev.data); acender(a); if(t() && a.tipo === "agente" && !t().agentes.includes(a.quem)){ t().agentes.push(a.quem); pintarTarefas(); } } catch(err){} });
      es.addEventListener("entrega", ev => { try { receberEntrega(JSON.parse(ev.data)); } catch(err){} });
      es.addEventListener("reset", () => { if(t()) t().resposta = ""; });
      es.addEventListener("token", ev => { try { if(t()) t().resposta += JSON.parse(ev.data).text || ""; } catch(err){} });
      es.addEventListener("done", ev => { const x = t(); if(!x) return; let c = x.resposta; try { c = JSON.parse(ev.data).content || c; } catch(err){} concluir(x, c); });
    });
  }
  // Tarefa terminou: painéis na tela, cartões do time em "pronto", libera a mesa e entrega o resultado (voz ou fila de falas)
  function concluir(t, txt){
    if(t.estado === "pronta" || t.estado === "erro" || t.estado === "cancelada") return;
    clearTimeout(t.avisoT);
    const erro = /^\[erro\]/.test(txt || "");
    t.estado = erro ? "erro" : "pronta"; t.fim = Date.now(); t.resposta = txt || "";
    if(t.mesa){ t.mesa.tarefa = null; t.mesa = null; }
    const agora = Date.now();
    t.agentes.forEach(k => { if(J.trabalho[k]) J.trabalho[k] = Object.assign({}, J.trabalho[k], { estado: "pronto", label: "Pronto", em: agora }); });
    if(!ativas().length) Object.keys(J.trabalho).forEach(k => { J.trabalho[k] = Object.assign({}, J.trabalho[k], { estado: "pronto", label: "Pronto", em: agora }); });
    const quem = t.agentes.length && EQUIPE.find(x => x[0] === t.agentes[t.agentes.length - 1]);
    if(!erro) blocos(txt).forEach(b => addBloco(b, quem ? quem[1] + " · " + quem[2] : "ZEUS"));
    J.historico.push({ eu: false, texto: String(txt || "").replace(/```[\s\S]*?```/g, "").trim() });
    iniciarTarefas(); pintar();
    if(t.aoTerminar) t.aoTerminar(txt, erro);
  }
  function cancelarTarefa(id){
    const t = J.tarefas.find(x => x.id === +id); if(!t || (t.estado !== "trabalhando" && t.estado !== "na fila")) return;
    if(t.mesa && t.mesa.sid) fetch("/api/chat/sessions/" + encodeURIComponent(t.mesa.sid) + "/stop", { method: "POST" }).catch(() => {});
    clearTimeout(t.avisoT); t.estado = "cancelada"; t.fim = Date.now();
    if(t.mesa){ t.mesa.tarefa = null; t.mesa = null; }
    if(J.fase === "pensando" && t.esperando){ J.legenda = ""; J.fase = "ocioso"; }
    iniciarTarefas(); pintar();
  }
  // Fala de resultado espera a vez: nunca por cima de você falando, da gravação ou de outra fala
  function anunciar(t){ J.falas.push(t); proximaFala(); }
  function proximaFala(){
    if(!J.falas.length || J.falaT) return;
    if(J.conv || J.fase !== "ocioso" || J.audio){ J.falaT = setTimeout(() => { J.falaT = null; proximaFala(); }, 1200); return; }
    const t = J.falas.shift(), nome = meuNome();
    const abertura = t.estado === "erro" ? `${nome ? nome + ", " : ""}não consegui terminar "${curto(t.texto, 60)}". Pede de novo ou de outro jeito?`
      : `${nome ? "Pronto, " + nome + ". " : "Pronto. "}Sobre "${curto(t.texto, 60)}": `;
    falar(t.estado === "erro" ? abertura : abertura + t.resposta);
  }
  function acender(a){
    if(a.tipo === "agente" && EQUIPE.some(x => x[0] === a.quem)) J.trabalho[a.quem] = { estado: "trabalhando", label: a.label || "Trabalhando", em: Date.now() };
    else J.fontes[a.quem] = Date.now();
    J.ultimoAgente = a.tipo === "agente" ? a.quem : J.ultimoAgente;
    pintarCena();
  }

  // ─── ouvir ────────────────────────────────────────────────────────────────────
  async function ouvir(){
    if(J.fase === "ouvindo"){ pararGravacao(); return; }
    if(J.fase !== "ocioso") return;
    pararFala();
    try { J.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch(err){ cfgToast("O navegador não liberou o microfone.", true); return; }
    novoAnalisador(ctxAudio().createMediaStreamSource(J.stream));
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
    const rec = new MediaRecorder(J.stream, tipo ? { mimeType: tipo } : undefined), partes = []; J.rec = rec;
    rec.ondataavailable = ev => { if(ev.data && ev.data.size) partes.push(ev.data); };
    rec.onstop = () => { J.stream.getTracks().forEach(t => t.stop()); J.stream = null; J.analyser = null; clearInterval(J.vadT);
      const blob = new Blob(partes, { type: (rec.mimeType || "audio/webm").split(";")[0] }); if(blob.size > 2000) transcrever(blob); else set("fase", "ocioso"); };
    rec.start(250); J.voce = ""; J.legenda = ""; set("fase", "ouvindo");
    // conversa contínua: para sozinho depois de 1,3 s de silêncio (só depois que você começou a falar); limite de 60 s
    let falou = false, silencio = 0; const ini = Date.now();
    J.vadT = setInterval(() => { const n = nivel(); if(n > 0.09) { falou = true; silencio = 0; } else if(falou) silencio += 100;
      if((J.continuo && falou && silencio > 1300) || Date.now() - ini > 60000) pararGravacao(); }, 100);
  }
  function pararGravacao(){ if(J.rec && J.rec.state !== "inactive") J.rec.stop(); }
  async function transcrever(blob){
    set("fase", "transcrevendo");
    try {
      const fd = new FormData(); fd.append("audio", blob, "voz." + (blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"));
      const r = await fetch("/api/chat/transcribe", { method: "POST", body: fd }); const j = await r.json();
      if(!r.ok) throw new Error(j.error || "HTTP " + r.status);
      const t = String(j.text || "").trim(); if(!t){ set("fase", "ocioso"); cfgToast("Não entendi o áudio. Tenta de novo?", true); return; }
      enviar(t);
    } catch(err){ set("fase", "ocioso"); cfgToast("Não consegui transcrever: " + err.message, true); }
  }

  // ─── pensar ───────────────────────────────────────────────────────────────────
  // Modo por botão: espera a resposta por até 7 s; se o ZEUS ainda estiver trabalhando, diz o que está fazendo e libera
  // a tela para o próximo pedido (a tarefa continua; o resultado é falado quando sair).
  async function enviar(texto, _tempoReal, rotulo){
    texto = String(texto || "").trim(); if(!texto) return;
    const t = novaTarefa(texto, "botao");
    J.voce = rotulo || texto; J.historico.push({ eu: true, texto });
    Object.keys(J.trabalho).forEach(k => { if(J.trabalho[k].estado === "pronto") delete J.trabalho[k]; });
    t.esperando = true; set("fase", "pensando");
    t.aoTerminar = (txt, erro) => {
      if(t.esperando){ // respondeu rápido: fala direto, como antes
        t.esperando = false;
        if(erro){ set("fase", "ocioso"); cfgToast("O ZEUS teve um erro nessa resposta.", true); return; }
        falar(txt); return;
      }
      anunciar(t);
    };
    t.avisoT = setTimeout(() => {
      if(!t.esperando || (t.estado !== "trabalhando" && t.estado !== "na fila")) return;
      t.esperando = false;
      const nome = meuNome(), outras = ativas().length - 1, quem = t.agentes.map(k => (EQUIPE.find(x => x[0] === k) || [])[1]).filter(Boolean);
      const aviso = (nome ? nome + ", j" : "J") + `á estou fazendo isso: ${curto(texto, 80)}.` + (quem.length ? ` ${quem.join(" e ")} ${quem.length > 1 ? "estão" : "está"} trabalhando nisso.` : "")
        + (outras > 0 ? ` Agora são ${outras + 1} tarefas em andamento.` : "") + " Assim que terminar eu te falo. Enquanto isso, me diz o que mais você precisa.";
      J.historico.push({ eu: false, texto: aviso });
      falar(aviso);
    }, AVISO_MS);
  }

  // ─── conversa em tempo real (ElevenLabs): a voz chama pedir_ao_zeus para dados e tarefas ─
  // A ferramenta responde NA HORA (a ElevenLabs abandona a espera se a pessoa fala por cima e o resultado se perdia).
  // Cada pedido vira uma tarefa em paralelo (até 3); quando termina, o resultado volta para a conversa como "RESULTADO DO ZEUS".
  function zeusTarefa(tarefa){
    tarefa = String(tarefa || "").trim(); if(!tarefa) return "Pedido vazio.";
    quadroLevado(tarefa);
    J.historico.push({ eu: true, texto: "→ Zeus: " + tarefa });
    const t = novaTarefa(tarefa, "voz"), n = ativas().length, nome = meuNome() || "a pessoa";
    t.aoTerminar = (txt, erro) => entregar(tarefa, erro ? "O Zeus teve um erro ao fazer isso. Peça de novo ou de outro jeito." : paraVoz(txt));
    return `Pedido enviado e o Zeus já começou a fazer${n > 1 ? ` (agora são ${n} tarefas em andamento ao mesmo tempo)` : ""}${t.estado === "na fila" ? "; as 3 mesas estão ocupadas, então este começa assim que uma liberar" : ""}. `
      + `Diga a ${nome}, em uma frase curta, que já está fazendo isso e pergunte o que mais precisa enquanto isso. Você é multitarefa: continue conversando e recebendo outros pedidos. O resultado chega numa mensagem RESULTADO DO ZEUS.`;
  }
  function entregar(tarefa, r){
    if(J.conv){ try { J.conv.sendUserMessage("RESULTADO DO ZEUS para o pedido \"" + tarefa.slice(0, 200) + "\": " + r); return; } catch(err){} }
    J.legenda = String(r || "").slice(0, 400); pintarLegenda(); // conversa já encerrada: fica na tela e no histórico
  }
  async function conversar(){
    if(J.conv){ try { await J.conv.endSession(); } catch(err){} return; }
    if(J.conectando) return;
    J.conectando = true; pintar();
    try {
      const pedir = async tipo => { const r = await fetch("/api/jarvis/voz/sessao" + (tipo ? "?tipo=" + tipo : ""), { method: "POST" }); const j = await r.json(); if(!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; };
      const [{ Conversation }, s] = await Promise.all([import(SDK), pedir()]);
      const opcoes = { dynamicVariables: { nome: s.nome, empresa: s.empresa },
        clientTools: { pedir_ao_zeus: p => zeusTarefa((p && p.tarefa) || ""), mostrar_quadro: p => quadro(p || {}) },
        onConnect: () => { J.conectando = false; J.fase = "ouvindo"; pintar(); },
        onDisconnect: () => { J.conv = null; J.conectando = false; J.fase = "ocioso"; J.legenda = ""; pintar(); },
        onError: m => { cfgToast("Conversa: " + m, true); },
        onModeChange: ({ mode }) => { J.fase = mode === "speaking" ? "falando" : "ouvindo"; if(mode !== "speaking") setTimeout(() => { if(J.fase === "ouvindo"){ J.legenda = ""; pintarLegenda(); } }, 2500); pintar(); },
        onMessage: m => { const eu = (m.role || m.source) === "user"; const t = String(m.message || "").trim(); if(!t || (eu && /^RESULTADO DO ZEUS/.test(t))) return; /* o resultado injetado não é fala sua */ J.historico.push({ eu, texto: t }); if(eu) J.voce = t; else J.legenda = t; pintarLegenda(); const h = porId("jv-hist-box"); if(h && J.verHistorico) h.innerHTML = historicoHTML(); } };
      try { J.conv = await Conversation.startSession(Object.assign({ conversationToken: s.conversationToken, connectionType: "webrtc" }, opcoes)); }
      catch(err){ const w = await pedir("ws"); J.conv = await Conversation.startSession(Object.assign({ signedUrl: w.signedUrl, connectionType: "websocket" }, opcoes)); } // rede que bloqueia WebRTC
    } catch(err){ J.conv = null; J.conectando = false; J.fase = "ocioso"; pintar(); cfgToast("Não consegui abrir a conversa: " + err.message, true); }
  }

  // ─── responder: painéis, legenda e voz ───────────────────────────────────────
  // Blocos da resposta: números (zeus-kpi/zeus-grafico), site publicado (zeus-site), artes (zeus-imagens), ação feita (zeus-feito)
  // e briefing (zeus-quadro). Imagem markdown de arte e link de página publicada viram tela mesmo sem bloco.
  const RE_BLOCO = /```(zeus-kpi|zeus-grafico|zeus-chart|zeus-site|zeus-imagens|zeus-feito|zeus-quadro)\s*([\s\S]*?)```/g;
  function blocos(txt){
    const out = [], s = String(txt || "");
    s.replace(RE_BLOCO, (_m, tipo, corpo) => { try { out.push({ tipo, d: JSON.parse(corpo) }); } catch(err){} return ""; });
    if(!out.some(b => b.tipo === "zeus-imagens")){
      const imgs = []; s.replace(/!\[([^\]]*)\]\(((?:https?:\/\/[^)\s]*)?\/api\/(?:design\/arquivo|chat\/file)\/[^)\s]+)\)/g, (_m, legenda, url) => { imgs.push({ url, legenda }); return ""; });
      if(imgs.length) out.push({ tipo: "zeus-imagens", d: { titulo: imgs.length > 1 ? "Criações" : "Criação", imagens: imgs } });
    }
    if(!out.some(b => b.tipo === "zeus-site")){
      const m = /(https?:\/\/[^\s)"'`]*\/site\/[a-z0-9-]+\/?)/.exec(s);
      if(m) out.push({ tipo: "zeus-site", d: { titulo: m[1].replace(/^.*\/site\/([^/]+).*$/, "$1"), url: m[1] } });
    }
    return out;
  }
  // O que a voz em tempo real recebe no lugar dos blocos (a tela já mostra)
  function paraVoz(txt){
    return String(txt || "").replace(RE_BLOCO, (_m, tipo, c) => { let d = {}; try { d = JSON.parse(c); } catch(err){}
      if(tipo === "zeus-site") return " Na tela: prévia do site " + (d.titulo || "") + ". ";
      if(tipo === "zeus-imagens") return " Na tela: " + (d.imagens || []).length + " imagem(ns), " + (d.titulo || "criação") + ". ";
      if(tipo === "zeus-feito") return " Na tela: comprovante, " + (d.titulo || "feito") + ". ";
      if(tipo === "zeus-quadro") return " Quadro atualizado na tela. ";
      return " Dados mostrados na tela: " + c.replace(/\s+/g, " ").slice(0, 1200) + " "; }).replace(/!\[[^\]]*\]\([^)]*\)/g, " (imagem na tela) ").trim().slice(0, 4000);
  }
  function pararFala(){ if(J.audio){ try { J.audio.pause(); } catch(err){} J.audio = null; } clearTimeout(J.legT); }
  async function falar(txt){
    try {
      const r = await fetch("/api/jarvis/falar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: txt }) });
      if(!r.ok){ const j = await r.json().catch(() => ({})); throw new Error(j.error || "HTTP " + r.status); }
      const falado = decodeURIComponent(r.headers.get("x-jarvis-texto") || ""), url = URL.createObjectURL(await r.blob());
      const a = new Audio(url); J.audio = a; a.crossOrigin = "anonymous";
      try { novoAnalisador(ctxAudio().createMediaElementSource(a)); J.analyser.connect(ctxAudio().destination); } catch(err){}
      set("fase", "falando");
      a.onloadedmetadata = () => legendar(falado, a.duration);
      a.onended = () => { URL.revokeObjectURL(url); J.audio = null; J.analyser = null; J.legenda = ""; set("fase", "ocioso");
        if(J.falas.length) setTimeout(proximaFala, 300); // resultado pronto esperando: fala antes de voltar a ouvir
        else if(J.continuo && document.getElementById("jv-root")) setTimeout(ouvir, 400); };
      await a.play();
    } catch(err){ set("fase", "ocioso"); J.legenda = String(txt || "").replace(/```[\s\S]*?```/g, "").slice(0, 300); pintarLegenda(); cfgToast("Sem voz agora (" + err.message + "). A resposta está na legenda.", true); }
  }
  // Legenda frase a frase, no ritmo da fala (tempo proporcional ao tamanho de cada frase)
  function legendar(texto, dur){
    const frases = (texto.match(/[^.!?]+[.!?]*/g) || [texto]).map(s => s.trim()).filter(Boolean), total = frases.reduce((a, f) => a + f.length, 0) || 1;
    let i = 0; const prox = () => { if(!J.audio || i >= frases.length) return; J.legenda = frases[i]; pintarLegenda(); const ms = Math.max(900, (dur || 4) * 1000 * frases[i].length / total); i++; J.legT = setTimeout(prox, ms); };
    prox();
  }

  // ─── desenho (identidade do ZEUS: branco, cinza e roxo; tema escuro da Central via html.tema-escuro) ─────
  const destaque = t => e(t).replace(/(R\$\s?[\d.,]+|\d+[\d.,]*\s?%|\d+[\d.,]*)/g, `<span style="color:var(--jv-roxo)">$1</span>`);
  // Estado do cartão: trabalhando (Zeus -> agente), entregando (agente -> Zeus, 3,5 s depois do fim) e pronto
  function estadoDe(id){ const t = J.trabalho[id]; if(!t) return null; if(t.estado === "trabalhando") return "trabalhando"; return Date.now() - t.em < 3500 ? "entregando" : "pronto"; }
  // Mini-ilustração do trabalho de cada agente (CSS puro, só aparece enquanto ele trabalha)
  function ilustracao(id){
    const r = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("");
    const tela = (corpo, extra) => `<div class="jv-il" style="${extra || ""}">${corpo}</div>`;
    switch(id){
      case "nina": return tela(`<div class="jv-cel"><div class="jv-feed">${r(4, i => `<div class="jv-post" style="opacity:${1 - i * 0.18}"><span></span><i></i></div>`)}</div></div>${r(3, i => `<span class="jv-cora" style="left:${58 + i * 12}%;animation-delay:${i * 0.5}s">♥</span>`)}`);
      case "sobral": return tela(`<div class="jv-barras">${r(6, i => `<span style="animation-delay:${i * 0.15}s"></span>`)}</div><svg class="jv-seta" viewBox="0 0 40 20"><path d="M2 18 L14 10 L22 13 L38 2" /><path d="M31 2 H38 V9" /></svg>`);
      case "icaro": return tela(`<div class="jv-texto">${r(3, i => `<span style="animation-delay:${i * 0.9}s;max-width:${[92, 78, 60][i]}%"></span>`)}<i class="jv-cursor"></i></div>`);
      case "gustavo": return tela(`<div class="jv-formas"><span class="jv-f1"></span><span class="jv-f2"></span><span class="jv-f3"></span></div><svg class="jv-pincel" viewBox="0 0 100 30"><path d="M4 24 C 25 4, 45 28, 65 12 S 90 8, 96 20" /></svg>`);
      case "maicom": return tela(`<div class="jv-alvo"><span></span><span></span><span></span><i class="jv-flecha"></i></div>`);
      case "otavio": return tela(`<div class="jv-funil"></div>${r(4, i => `<span class="jv-gota" style="animation-delay:${i * 0.35}s;left:${44 + (i % 2) * 8}%"></span>`)}<span class="jv-moeda">R$</span>`);
      case "smith": return tela(`<div class="jv-codigo">${r(6, i => `<span style="width:${[70, 45, 85, 55, 75, 40][i]}%;margin-left:${[0, 12, 12, 24, 12, 0][i]}%"></span>`)}</div>`);
      case "tome": return tela(`<div class="jv-check">${r(3, i => `<div><b style="animation-delay:${i * 0.7}s">✓</b><span></span></div>`)}</div>`);
      case "talles": return tela(`<div class="jv-filme">${r(8, () => `<span></span>`)}</div><div class="jv-play">▶</div><div class="jv-barra"><i></i></div>`);
      case "eduardo": return tela(`<div class="jv-site"><span class="jv-s1"></span><div><span class="jv-s2"></span><span class="jv-s3"></span></div><span class="jv-s4"></span></div>`);
    }
    return "";
  }
  function cartao(a, x, y){
    const [id, nome, papel] = a, est = estadoDe(id), t = J.trabalho[id], on = est === "trabalhando", ent = est === "entregando", ok = est === "pronto";
    const balao = on ? e(t.label || "Trabalhando") : ent ? "Entregando ao Zeus..." : ok ? "Pronto, passei pro Zeus" : "";
    return `<div data-jv-card="${id}" class="jv-card ${on ? "jv-on" : ent ? "jv-ent" : ok ? "jv-ok" : ""}" style="left:${x}%;top:${y}%">
      ${balao ? `<div class="jv-balao ${ok ? "jv-balao-ok" : ""}">${balao}</div>` : ""}
      <div style="display:flex;align-items:center;gap:9px">
        <span class="jv-av ${on ? "jv-av-on" : ""}"><span>${e(nome[0])}</span></span>
        <span style="min-width:0"><span class="jv-nome">${e(nome)}</span><span class="jv-papel">${e(papel)}</span></span></div>
      ${on || ent ? ilustracao(id) : ""}
      <div class="jv-sep"></div>
      <div class="jv-est"><span class="jv-dot"></span>${on ? "Trabalhando" : ent ? "Entregando" : ok ? "Pronto" : "De prontidão"}</div>
    </div>`;
  }
  function posicoes(n, rx, ry, a0){ return Array.from({ length: n }, (_, i) => { const a = a0 + i * 2 * Math.PI / n; return [50 + rx * Math.cos(a), 50 + ry * Math.sin(a)]; }); }
  function cenaHTML(){
    const pos = posicoes(EQUIPE.length, 38, 36, -Math.PI / 2 - Math.PI / EQUIPE.length), fpos = posicoes(12, 21, 23, -Math.PI / 2).filter((_, i) => i !== 0 && i !== 6); // 12 lugares sem o de cima e o de baixo (embaixo fica o status)
    const agora = Date.now();
    const linhas = EQUIPE.map((a, i) => { const est = estadoDe(a[0]), x2 = pos[i][0], y2 = pos[i][1];
      if(est === "trabalhando") return `<line x1="50" y1="50" x2="${x2}" y2="${y2}" class="jv-l-on"/>`;
      if(est === "entregando") return `<line x1="${x2}" y1="${y2}" x2="50" y2="50" class="jv-l-ent"/>`; // pacotes do agente para o Zeus
      if(est === "pronto") return `<line x1="50" y1="50" x2="${x2}" y2="${y2}" class="jv-l-ok"/>`;
      return `<line x1="50" y1="50" x2="${x2}" y2="${y2}" class="jv-l"/>`; }).join("");
    const fontes = FONTES.map((f, i) => { const on = J.fontes[f[0]] && agora - J.fontes[f[0]] < 9000;
      return `<span class="jv-fonte ${on ? "jv-fonte-on" : ""}" style="left:${fpos[i][0]}%;top:${fpos[i][1]}%">${e(f[1])}</span>`; }).join("");
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;max-width:none;z-index:1">${linhas}</svg>${fontes}${EQUIPE.map((a, i) => cartao(a, pos[i][0], pos[i][1])).join("")}`;
  }
  function orbHTML(){
    const foto = typeof meFoto === "function" && meFoto();
    return `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:300px;height:300px;z-index:4;pointer-events:none">
      <canvas id="jv-anel" width="600" height="600" style="position:absolute;inset:0;width:100%;height:100%;max-width:none"></canvas>
      <div style="position:absolute;inset:58px;border-radius:50%;border:2px dashed var(--jv-roxo-30);animation:jv-gira 18s linear infinite"></div>
      <div class="jv-orbe">${foto ? `<img src="${e(foto)}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<span style="color:var(--jv-roxo)">${icon(ICONS.bolt, 60, "currentColor")}</span>`}</div></div>`;
  }
  // Cartão de resultado: desenho próprio do Jarvis (o componente do chat ficava apertado e com cara de tabela)
  const deltaHTML = (d, peq) => { if(!d) return ""; const t = String(d).trim(), cai = /^[-−▼↓]/.test(t) || /\bqueda\b/i.test(t), sobe = /^[+▲↑]/.test(t);
    const cor = cai ? "#C0341C" : sobe ? "#0F7A68" : "var(--jv-sub)", bg = cai ? "rgba(192,52,28,0.09)" : sobe ? "rgba(15,122,104,0.1)" : "var(--jv-lilas)";
    return `<span class="jv-delta${peq ? " jv-delta-p" : ""}" style="color:${cor};background:${bg}">${cai ? "▼ " : sobe ? "▲ " : ""}${e(t.replace(/^[+\-−▲▼↑↓]\s*/, ""))}</span>`; };
  function kpiHTML(d){
    const itens = (d.itens || d.items || []).slice(0, 9), [hero, ...resto] = itens;
    if(!hero) return "";
    return `<div class="jv-hero"><div class="jv-rot">${e(hero.rotulo || hero.label || "")}</div><div class="jv-hero-v" data-jv-num>${e(hero.valor || hero.value || "")}</div>${deltaHTML(hero.delta)}</div>
      ${resto.length ? `<div class="jv-grade">${resto.map(i => `<div class="jv-tile"><div class="jv-rot">${e(i.rotulo || i.label || "")}</div><div class="jv-tile-v" data-jv-num>${e(i.valor || i.value || "")}</div>${deltaHTML(i.delta, true)}</div>`).join("")}</div>` : ""}`;
  }
  // ─── telas de entrega: cada tipo de resultado tem o seu desenho ──────────────
  // Painéis são atualizados no lugar (p.v muda): o WhatsApp ganha os tiques quando o envio confirma, o quadro se preenche
  // enquanto você fala, o site volta como "Versão 2" depois dos ajustes. A ordem muda por CSS (order) para o iframe não recarregar.
  const LARGOS = { "zeus-site": 1, "zeus-imagens": 1 }, MAX_PAINEIS = 5;
  const quemDe = id => { const a = EQUIPE.find(x => x[0] === id); return a ? a[1] + " · " + a[2] : "ZEUS"; };
  const mexeu = p => { p.v = (p.v || 0) + 1; };
  const topo = p => { J.paineis = [p].concat(J.paineis.filter(x => x !== p)); };
  function novoPainel(b, quem, extra){
    const p = Object.assign({ id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), b, quem: quem || "ZEUS", em: Date.now(), v: 0 }, extra || {});
    J.paineis.unshift(p); J.paineis = J.paineis.slice(0, MAX_PAINEIS); return p;
  }
  function addBloco(b, quem){
    if(b.tipo === "zeus-quadro"){ quadro(b.d || {}); return; }
    const d = b.d || {}, chave = b.tipo === "zeus-site" ? "site:" + String(d.url || "").replace(/[?#].*$/, "").replace(/\/+$/, "") : b.tipo === "zeus-imagens" ? "img:" + (d.titulo || "") : null;
    const velho = chave && J.paineis.find(x => x.chave === chave);
    if(velho){ Object.assign(velho, { b, quem, versao: (velho.versao || 1) + 1, ajustes: 0, aprovado: false, idx: 0, bust: Date.now() }); mexeu(velho); topo(velho); return; } // nova versão do mesmo site/arte
    novoPainel(b, quem, { chave, versao: 1 });
  }
  const checkSVG = (n) => `<svg viewBox="0 0 24 24" width="${n || 14}" height="${n || 14}" style="max-width:none"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" class="jv-traco-ok"/></svg>`;
  const horaBRT = ms => new Date(ms || Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const fone = j => { const n = String(j || "").replace(/@.*/, "").replace(/\D/g, ""), m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(n); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n ? "+" + n : "Contato"; };
  const comBust = (url, bust) => bust ? url + (url.includes("?") ? "&" : "?") + "jv=" + bust : url;
  const mesmaOrigem = url => { try { return new URL(url, location.href).origin === location.origin; } catch(err){ return false; } };

  // Botões de retorno: aprovar, pedir ajuste (abre a revisão com marcação) e abrir
  function acoesHTML(p, url, podeRevisar){
    if(p.aprovado) return `<div class="jv-aprovado"><span class="jv-okc">${checkSVG(12)}</span>Aprovado por você</div>`;
    return `${p.ajustes ? `<div class="jv-ajustes-env"><span class="jv-spin"></span>${p.ajustes} ajuste${p.ajustes > 1 ? "s" : ""} com o Zeus. A nova versão aparece aqui.</div>` : ""}
      <div class="jv-acoes"><button class="jv-b jv-b-ok" data-jv-aprovar="${p.id}">${checkSVG(13)} Aprovar</button>${podeRevisar ? `<button class="jv-b" data-jv-revisar="${p.id}">${icon(ICONS.edit, 13, "currentColor")} Pedir ajuste</button>` : ""}${url ? `<a class="jv-b jv-b-ic" href="${e(url)}" target="_blank" rel="noopener" title="Abrir em outra aba">${icon(ICONS.extLink, 14, "currentColor")}</a>` : ""}</div>`;
  }
  // Site: navegador desenhado com a página ao vivo (computador ou celular)
  function siteHTML(p){
    const d = p.b.d || {}, url = String(d.url || ""), cel = p.dev === "cel", src = comBust(url, p.bust);
    let host = url; try { const u = new URL(url, location.href); host = u.host + u.pathname.replace(/\/$/, ""); } catch(err){}
    const quadroIf = (w, h) => `<div class="jv-escala" data-jv-escala="${w}" data-jv-alt="${h}"><div class="jv-carrega"></div><iframe data-jv-if src="${e(src)}" loading="lazy" ${mesmaOrigem(url) ? "" : 'sandbox="allow-scripts allow-forms allow-popups"'} tabindex="-1" style="width:${w}px;height:${h}px;max-width:none !important"></iframe></div>`;
    return `${d.descricao ? `<div class="jv-desc">${e(d.descricao)}</div>` : ""}
      <div class="jv-nav"><div class="jv-nav-topo"><i></i><i></i><i></i><span class="jv-url">${icon(ICONS.lock, 10, "currentColor")}${e(host)}</span>
        <span class="jv-dev"><b data-jv-dev="${p.id}:pc" class="${cel ? "" : "on"}" title="Computador">${icon(ICONS.screen, 13, "currentColor")}</b><b data-jv-dev="${p.id}:cel" class="${cel ? "on" : ""}" title="Celular"><svg viewBox="0 0 24 24" width="13" height="13"><rect x="7" y="3" width="10" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg></b></span></div>
        <div class="jv-nav-tela${cel ? " jv-tela-cel" : ""}">${cel ? `<div class="jv-fone">${quadroIf(390, 760)}</div>` : quadroIf(1280, 800)}
          <div class="jv-nav-capa" data-jv-revisar="${p.id}"><span>${icon(ICONS.edit, 13, "currentColor")} Revisar e marcar ajustes</span></div></div></div>
      ${acoesHTML(p, url, true)}`;
  }
  // Artes: galeria com miniaturas (vídeo toca no lugar)
  const ehVideo = u => /\.(mp4|webm|mov)(\?|$)/i.test(u || "");
  function imagensHTML(p){
    const im = (p.b.d || {}).imagens || [], i = Math.max(0, Math.min(p.idx || 0, im.length - 1)), x = im[i] || {}, src = comBust(String(x.url || ""), p.bust);
    return `<div class="jv-galeria">${ehVideo(x.url) ? `<video src="${e(src)}" controls playsinline muted autoplay loop></video>` : `<img src="${e(src)}" alt="" data-jv-revisar="${p.id}" title="Clique para revisar e marcar ajustes">`}
        ${im.length > 1 ? `<b class="jv-gal jv-gal-ant" data-jv-gal="${p.id}:-1">‹</b><b class="jv-gal jv-gal-prox" data-jv-gal="${p.id}:1">›</b><div class="jv-pontos">${im.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>` : ""}</div>
      ${x.legenda || im.length > 1 ? `<div class="jv-desc">${e(x.legenda || "")}${im.length > 1 ? `${x.legenda ? " · " : ""}${i + 1} de ${im.length}` : ""}</div>` : ""}
      ${im.length > 1 ? `<div class="jv-miniaturas">${im.map((y, k) => ehVideo(y.url) ? `<span data-jv-galir="${p.id}:${k}" class="jv-mini-v ${k === i ? "on" : ""}">${icon(ICONS.play, 14, "currentColor")}</span>` : `<img src="${e(comBust(String(y.url || ""), p.bust))}" alt="" data-jv-galir="${p.id}:${k}" class="${k === i ? "on" : ""}">`).join("")}</div>` : ""}
      ${acoesHTML(p, x.url, true)}`;
  }
  // WhatsApp: a conversa desenhada, com os tiques do envio de verdade
  function zapHTML(d){
    const nome = d.nome || fone(d.para), msgs = d.msgs || [], ok = msgs.length && msgs.every(m => m.estado === "ok"), erro = msgs.some(m => m.estado === "erro");
    const tique = m => m.estado === "ok" ? `<span class="jv-tq jv-tq-ok">✓✓</span>` : m.estado === "erro" ? `<span class="jv-tq" style="color:#C0341C;letter-spacing:0">!</span>` : `<span class="jv-tq" style="letter-spacing:0">${icon(ICONS.clock, 11, "currentColor")}</span>`;
    const corpo = m => (m.voz ? `<span class="jv-zap-audio">${icon(ICONS.play, 12, "currentColor")}<i></i>áudio na voz do Zeus</span>` : "")
      + (m.texto ? `<div>${e(m.texto).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</div>` : m.voz ? "" : `<div style="color:#667781">${m.midia ? "📎 Arquivo" : "Mensagem"}</div>`);
    return `<div class="jv-zap">
      <div class="jv-zap-topo"><span class="jv-zap-av">${d.grupo ? icon(ICONS.users, 16, "currentColor") : e((nome.replace(/[^\p{L}\d]/gu, "")[0] || "?").toUpperCase())}</span>
        <span style="min-width:0;flex:1"><b>${e(nome)}</b><small>${d.nome && !d.grupo ? e(fone(d.para)) + " · " : ""}pelo WhatsApp do Zeus</small></span><span style="color:#25D366">${icon(ICONS.whatsapp, 18, "currentColor")}</span></div>
      <div class="jv-zap-chat">${msgs.map(m => `<div class="jv-bolha${m.estado === "erro" ? " jv-bolha-erro" : ""}">${corpo(m)}<span class="jv-bolha-h">${horaBRT(m.em)} ${tique(m)}</span></div>`).join("")}</div>
      <div class="jv-zap-st${erro ? " jv-zap-erro" : ok ? " jv-zap-ok" : ""}">${erro ? "Não foi enviada. O Zeus vai dizer o motivo." : ok ? `<span class="jv-okc">${checkSVG(12)}</span>${msgs.length > 1 ? msgs.length + " mensagens enviadas" : "Mensagem enviada"} com sucesso` : `<span class="jv-spin"></span>Enviando...`}</div></div>`;
  }
  // Comprovante de ação feita fora (e-mail, agenda, tarefa, post, cobrança, contrato, anúncio)
  const FEITO = { email: ["E-mail enviado", "M3 6h18v12H3z M3 7l9 6 9-6"], agenda: ["Na agenda", "M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4"], tarefa: ["Tarefa criada", "M10 6h10 M10 12h10 M10 18h10 M4 6l1.2 1.2L7.5 5 M4 12l1.2 1.2 2.3-2.2 M4 18l1.2 1.2 2.3-2.2"],
    post: ["Publicado", "M4 4h16v16H4z M4 15l5-5 4 4 3-3 4 4"], cobranca: ["Cobrança gerada", "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6"], contrato: ["Contrato enviado", "M6 3h9l4 4v14H6z M9 12h7 M9 16h4 M14 3v5h5"],
    anuncio: ["Anúncio criado", "M3 10v4h4l6 4V6l-6 4z M17 9a4 4 0 0 1 0 6"], outro: ["Feito", "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M8 12.5l3 3 5-6"] };
  function feitoHTML(p){
    const d = p.b.d || {}, t = FEITO[d.tipo] || FEITO.outro, det = (d.detalhes || d.itens || []).slice(0, 6);
    return `<div class="jv-feito"><div class="jv-feito-ic"><svg viewBox="0 0 24 24" width="28" height="28" style="max-width:none"><path class="jv-desenha" d="${t[1]}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="jv-feito-ok">${checkSVG(11)}</span></div>
        <div><div class="jv-feito-tag">${e(t[0])}</div><div class="jv-feito-h">Feito às ${horaBRT(p.em)}</div></div></div>
      ${det.length ? `<div class="jv-det">${det.map(x => `<div><span>${e(x.rotulo || x.label || "")}</span><b>${e(x.valor || x.value || "")}</b></div>`).join("")}</div>` : ""}
      ${d.link ? `<div class="jv-acoes"><a class="jv-b" href="${e(d.link)}" target="_blank" rel="noopener">${icon(ICONS.extLink, 13, "currentColor")} Abrir</a></div>` : ""}`;
  }
  // Quadro: o briefing se monta enquanto você fala (ferramenta mostrar_quadro da voz ou bloco zeus-quadro)
  function camposDe(x){
    if(Array.isArray(x)) return x.map(c => ({ rotulo: String(c.rotulo || c.label || "").trim(), valor: String(c.valor || c.value || "").trim() })).filter(c => c.rotulo);
    return String(x || "").split(/\s*\|\s*|\n/).map(t => { const i = t.indexOf(":"); return i < 0 ? { rotulo: t.trim(), valor: "" } : { rotulo: t.slice(0, i).trim(), valor: t.slice(i + 1).trim() }; })
      .filter(c => c.rotulo).map(c => ({ rotulo: c.rotulo, valor: /^(-|—|\?|a definir|falta|pendente|vazio)$/i.test(c.valor) ? "" : c.valor }));
  }
  function quadro(d){
    const agente = String(d.agente || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
    let p = J.paineis.find(x => x.b.tipo === "zeus-quadro" && !x.enviado);
    const antes = p ? p.b.d.campos : [], agora = Date.now(), campos = camposDe(d.campos).slice(0, 10);
    campos.forEach(c => { const a = antes.find(x => x.rotulo.toLowerCase() === c.rotulo.toLowerCase()); c.novo = c.valor && (!a || a.valor !== c.valor) ? agora : (a && a.novo) || 0; });
    const dd = { titulo: d.titulo || (p && p.b.d.titulo) || "Briefing", agente: agente || (p && p.b.d.agente) || "", campos: campos.length ? campos : antes };
    if(p){ p.b = { tipo: "zeus-quadro", d: dd }; mexeu(p); topo(p); } else p = novoPainel({ tipo: "zeus-quadro", d: dd });
    p.quem = quemDe(dd.agente);
    if(EQUIPE.some(x => x[0] === dd.agente) && !J.zeusOcupado){ acender({ quem: dd.agente, tipo: "agente", label: "Anotando o briefing" });
      setTimeout(() => { const t = J.trabalho[dd.agente]; if(t && t.label === "Anotando o briefing" && Date.now() - t.em > 7000){ delete J.trabalho[dd.agente]; pintarCena(); } }, 7500); }
    pintar();
    return "Quadro atualizado na tela.";
  }
  function quadroTexto(p){ const d = p.b.d, a = EQUIPE.find(x => x[0] === d.agente);
    return `Briefing${a ? " para " + a[1] + " (" + a[2].toLowerCase() + ")" : ""}: ${d.titulo}. ` + d.campos.filter(c => c.valor).map(c => c.rotulo + ": " + c.valor).join("; ") + ". Pode criar e me mostrar na tela."; }
  function quadroLevado(tarefa){ // pedido da voz que leva o briefing aberto: o quadro passa para "com o time"
    const p = J.paineis.find(x => x.b.tipo === "zeus-quadro" && !x.enviado); if(!p) return;
    const t = tarefa.toLowerCase(), bate = p.b.d.campos.filter(c => c.valor && t.includes(c.valor.toLowerCase().slice(0, 18))).length;
    if(bate >= 2 || t.includes(String(p.b.d.titulo || "").toLowerCase())){ p.enviado = true; mexeu(p); pintar(); }
  }
  function quadroHTML(p){
    const d = p.b.d, campos = d.campos || [], ok = campos.filter(c => c.valor).length, a = EQUIPE.find(x => x[0] === d.agente), agora = Date.now();
    return `<div class="jv-q-prog"><span style="width:${campos.length ? Math.round(ok / campos.length * 100) : 0}%"></span></div>
      <div class="jv-q-info">${ok} de ${campos.length} definidos${p.enviado ? "" : ok < campos.length ? " · vai preenchendo enquanto você fala" : " · pronto para mandar"}</div>
      <div class="jv-q-lista">${campos.map(c => `<div class="jv-q-item${c.valor ? " jv-q-cheio" : ""}${c.novo && agora - c.novo < 2500 ? " jv-q-novo" : ""}"><span class="jv-q-ic">${c.valor ? checkSVG(11) : ""}</span><div style="min-width:0"><small>${e(c.rotulo)}</small><div>${c.valor ? e(c.valor) : "<i>aguardando...</i>"}</div></div></div>`).join("")}</div>
      ${p.enviado ? `<div class="jv-aprovado"><span class="jv-spin" style="border-color:rgba(15,122,104,0.25);border-top-color:var(--jv-ok)"></span>Com ${a ? e(a[1]) : "o time"}, em produção</div>`
        : `<div class="jv-acoes"><button class="jv-b jv-b-pri" data-jv-q-enviar="${p.id}" ${ok ? "" : "disabled"}>${icon(ICONS.arrowRight, 14, "currentColor")} Mandar para ${a ? e(a[1]) : "o time"}</button></div>`}`;
  }
  function receberEntrega(d){
    if(!d || d.tipo !== "whatsapp") return;
    acender({ quem: "whatsapp", tipo: "fonte" });
    const msg = { chave: d.chave, texto: d.texto, estado: d.estado, em: d.em || Date.now(), voz: d.voz, midia: d.midia };
    let p = J.paineis.find(x => x.b.tipo === "zap" && x.b.d.msgs.some(m => m.chave === d.chave)) || J.paineis.find(x => x.b.tipo === "zap" && x.b.d.para === d.para && Date.now() - x.em < 180000);
    if(p){ const m = p.b.d.msgs.find(x => x.chave === d.chave); if(m) m.estado = d.estado; else p.b.d.msgs.push(msg); mexeu(p); topo(p); }
    else p = novoPainel({ tipo: "zap", d: { para: d.para, nome: d.nome, grupo: d.grupo, msgs: [msg] } }, "ZEUS · WhatsApp");
    pintar();
  }
  function painelHTML(p){
    const d = p.b.d || {}, t = p.b.tipo, [quem, papel] = p.quem.split(" · ");
    const corpo = t === "zeus-kpi" ? kpiHTML(d) : t === "zeus-site" ? siteHTML(p) : t === "zeus-imagens" ? imagensHTML(p) : t === "zeus-feito" ? feitoHTML(p) : t === "zeus-quadro" ? quadroHTML(p) : t === "zap" ? zapHTML(d)
      : `<div class="jv-grafico">${typeof vizChart === "function" ? vizChart(Object.assign({}, d, { titulo: "", periodo: "" })) : ""}</div>`;
    const titulo = String(t === "zap" ? "Mensagem no WhatsApp" : d.titulo || d.title || "Resultado").split(/\s+[·•|]\s+/);
    return `<div class="jv-painel jv-t-${t.replace("zeus-", "")}${LARGOS[t] ? " jv-painel-largo" : ""}" data-jv-painel="${p.id}" data-jv-abrir="${p.id}">
      <div class="jv-painel-topo"><span class="jv-quem"><span class="jv-quem-av">${e((quem || "Z")[0])}</span>${e(quem || "ZEUS")}${papel ? `<span style="color:var(--jv-sub);font-weight:500"> · ${e(papel)}</span>` : ""}</span>
        ${p.versao > 1 ? `<span class="jv-chip">Versão ${p.versao}</span>` : ""}<span data-jv-fechar="${p.id}" class="jv-fechar" title="Fechar">${icon(ICONS.x, 13, "currentColor")}</span></div>
      <div class="jv-titulo">${e(titulo[0])}</div>
      ${titulo.length > 1 || d.periodo ? `<div class="jv-periodo">${e([titulo.slice(1).join(" · "), d.periodo].filter(Boolean).join(" · "))}</div>` : ""}
      <div class="jv-corpo">${corpo}</div></div>`;
  }
  // A prévia do site é a página de verdade (1280 px ou 390 px) reduzida para caber no cartão
  function ajustarEscala(raiz){
    (raiz || document).querySelectorAll("[data-jv-escala]").forEach(b => { const f = b.querySelector("iframe"), w = +b.dataset.jvEscala, k = b.clientWidth / w; if(!f || !k) return;
      f.style.transform = `scale(${k})`; b.style.height = Math.round(+b.dataset.jvAlt * k) + "px"; });
  }
  function pintarPaineis(){
    const box = porId("jv-paineis"); if(!box) return;
    const ids = new Set(J.paineis.map(p => p.id));
    box.querySelectorAll("[data-jv-painel]").forEach(el => { if(!ids.has(el.dataset.jvPainel)) el.remove(); });
    J.paineis.forEach((p, i) => {
      let el = box.querySelector(`[data-jv-painel="${p.id}"]`); const ver = String(p.v || 0);
      if(!el || el.dataset.ver !== ver){ const t = document.createElement("div"); t.innerHTML = painelHTML(p).trim(); const novo = t.firstElementChild; novo.dataset.ver = ver;
        if(el){ novo.style.animation = "none"; el.replaceWith(novo); } else box.appendChild(novo); el = novo; contarNumeros(el); }
      el.classList.toggle("jv-painel-min", i > 0); el.style.order = i;
      if(i === 0) ajustarEscala(el);
    });
    const palco = porId("jv-palco"); if(palco) palco.classList.toggle("jv-estreito", J.paineis.length > 0);
    let mais = box.querySelector(".jv-mais"); const n = J.paineis.length - 1;
    if(n > 0){ if(!mais){ mais = document.createElement("div"); mais.className = "jv-mais"; mais.addEventListener("click", () => { box.classList.toggle("jv-todos"); pintarPaineis(); }); box.appendChild(mais); }
      mais.textContent = box.classList.contains("jv-todos") ? "Esconder anteriores" : `Ver ${n} resultado${n > 1 ? "s" : ""} anterior${n > 1 ? "es" : ""}`; }
    else if(mais) mais.remove();
  }
  // Retorno para o Zeus: vira uma tarefa em paralelo; na conversa em tempo real a voz fica sabendo, no modo botão vai como pedido
  function avisarVoz(t){ if(J.conv){ try { J.conv.sendContextualUpdate("NA TELA: " + t); } catch(err){} } }
  function enviarAoZeus(texto, rotulo){
    if(J.conv){ zeusTarefa(texto); avisarVoz("a pessoa mandou isto para o Zeus pela tela (ele já começou, em paralelo com o que estiver fazendo; o resultado chega como RESULTADO DO ZEUS): " + texto.slice(0, 600)); return true; }
    if(J.fase === "ouvindo" || J.fase === "transcrevendo" || J.fase === "pensando"){ cfgToast("Termine de falar ou espere um instante e mande de novo.", true); return false; }
    enviar(texto, false, rotulo); return true;
  }
  function aprovar(pid){
    const p = J.paineis.find(x => x.id === pid); if(!p) return;
    p.aprovado = true; p.ajustes = 0; mexeu(p);
    const nome = (p.b.d && p.b.d.titulo) || "a entrega";
    J.historico.push({ eu: true, texto: "✓ Aprovado na tela: " + nome });
    avisarVoz("a pessoa aprovou \"" + nome + "\" clicando em Aprovar. Confirme em uma frase e pergunte se quer o próximo passo; não execute nada sem ela pedir.");
    pintar();
  }
  // Os números "contam" até o valor quando o cartão aparece (mantém R$, %, separadores pt-BR)
  function contarNumeros(raiz){
    (raiz || document).querySelectorAll("[data-jv-num]:not([data-jv-contou])").forEach(el => {
      el.setAttribute("data-jv-contou", "1");
      const txt = el.textContent, m = /-?\d[\d.]*(,\d+)?/.exec(txt); if(!m) return;
      const bruto = m[0], dec = (m[1] || "").length ? m[1].length - 1 : 0, alvo = parseFloat(bruto.replace(/\./g, "").replace(",", "."));
      if(!isFinite(alvo) || alvo === 0) return;
      const ini = performance.now(), dur = 900;
      const passo = agora => { const k = Math.min(1, (agora - ini) / dur), v = alvo * (1 - Math.pow(1 - k, 3));
        el.textContent = txt.slice(0, m.index) + v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + txt.slice(m.index + bruto.length);
        if(k < 1) requestAnimationFrame(passo); else el.textContent = txt; };
      requestAnimationFrame(passo);
    });
  }
  // ─── revisão em tela grande: clicar no ponto e dizer o que mudar ─────────────
  // Site: a página de verdade (computador ou celular). Em página da própria Central dá para saber o elemento clicado
  // ("título principal 'Comece hoje'") e o ponto acompanha a rolagem. Arte: o ponto vai em % da imagem; vídeo leva o segundo.
  function abrirRevisao(pid){
    const p = J.paineis.find(x => x.id === pid); if(!p) return;
    const site = p.b.tipo === "zeus-site", im = (p.b.d || {}).imagens || [], idx = Math.max(0, Math.min(p.idx || 0, im.length - 1));
    const url = site ? p.b.d.url : (im[idx] || {}).url; if(!url) return;
    J.rev = { pid, site, video: !site && ehVideo(url), url, src: comBust(String(url), p.bust), titulo: (p.b.d && p.b.d.titulo) || "", idx, total: im.length, dev: p.dev || "pc", marcando: true, pins: [], geral: "", edit: null };
    pintarRevisao();
  }
  function fecharRevisao(){ if(J.ditando) J.ditando.stop(); J.rev = null; pintarRevisao(); }
  const regiao = (px, py) => (py < 0.33 ? "topo" : py < 0.66 ? "meio" : "base") + (px < 0.33 ? " à esquerda" : px < 0.66 ? " no centro" : " à direita");
  function descrever(el){
    if(!el || !el.tagName) return null;
    const NOME = { H1: "título principal", H2: "título", H3: "subtítulo", H4: "subtítulo", P: "texto", A: "link/botão", BUTTON: "botão", IMG: "imagem", LI: "item de lista", INPUT: "campo", TEXTAREA: "campo", FORM: "formulário", HEADER: "topo", FOOTER: "rodapé", NAV: "menu", SECTION: "seção", VIDEO: "vídeo", SPAN: "texto", STRONG: "texto" };
    let a = el; for(let i = 0; i < 3 && a && !NOME[a.tagName] && a.parentElement; i++) a = a.parentElement;
    const limpo = t => String(t || "").replace(/\s+/g, " ").trim(), CAIXA = /^(SECTION|HEADER|FOOTER|NAV|FORM|DIV|MAIN|ARTICLE|BODY)$/;
    if(CAIXA.test(a.tagName) && limpo(a.innerText).length > 90){ // clicou num espaço de um bloco grande: diz que bloco é pelo título dele
      const tit = a.querySelector && a.querySelector("h1,h2,h3"), sec = el.closest && el.closest("section,header,footer,nav,form");
      return (NOME[(sec || a).tagName] || "área") + (tit ? ` que começa com "${limpo(tit.innerText).slice(0, 70)}"` : "") + (sec && sec.id ? ` (#${sec.id})` : "") + ", num espaço vazio";
    }
    const txt = (a.tagName === "IMG" ? (a.alt || (a.getAttribute("src") || "").split("/").pop()) : a.innerText).replace(/\s+/g, " ").trim().slice(0, 90);
    const sec = el.closest && el.closest("section[id],[id]");
    return (NOME[a.tagName] || "área") + (txt ? ` "${txt}"` : "") + (sec && sec.id ? ` (seção #${sec.id})` : "");
  }
  function revisaoHTML(){
    const R = J.rev, cel = R.site && R.dev === "cel", com = R.pins.filter(q => q.texto.trim()).length + (R.geral.trim() ? 1 : 0);
    const midia = R.site ? `<iframe id="jv-rev-if" src="${e(R.src)}" ${mesmaOrigem(R.url) ? "" : 'sandbox="allow-scripts allow-forms allow-popups"'}></iframe>`
      : R.video ? `<video id="jv-rev-midia" src="${e(R.src)}" controls playsinline></video>` : `<img id="jv-rev-midia" src="${e(R.src)}" alt="">`;
    return `<div class="jv-rev-fundo"><div class="jv-rev">
      <div class="jv-rev-topo">
        <span class="jv-rev-tit"><b>${e(R.titulo || "Revisão")}</b><small>${R.site ? "Clique no ponto da página e diga o que mudar. Para rolar, use a roda do mouse." : R.video ? "Pause no momento, clique no ponto e diga o que mudar." : "Clique no ponto da arte e diga o que mudar."}${R.total > 1 ? ` · imagem ${R.idx + 1} de ${R.total}` : ""}</small></span>
        ${R.site ? `<span class="jv-dev jv-dev-g"><b data-jv-rev-dev="pc" class="${cel ? "" : "on"}">${icon(ICONS.screen, 14, "currentColor")} Computador</b><b data-jv-rev-dev="cel" class="${cel ? "on" : ""}"><svg viewBox="0 0 24 24" width="14" height="14"><rect x="7" y="3" width="10" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg> Celular</b></span>` : ""}
        <label class="jv-rev-marcar"><input type="checkbox" data-jv-rev-marcar ${R.marcando ? "checked" : ""}> Marcar ajustes</label>
        <span class="jv-fechar" data-jv-rev-fechar title="Fechar (Esc)">${icon(ICONS.x, 15, "currentColor")}</span></div>
      <div class="jv-rev-corpo">
        <div class="jv-rev-palco${cel ? " cel" : ""}${R.site ? "" : " midia"}"><div class="jv-rev-quadro">${midia}<div id="jv-rev-camada" class="jv-rev-camada${R.marcando ? "" : " off"}"></div></div></div>
        <div class="jv-rev-lado">
          <div class="jv-rev-lt">Ajustes marcados</div>
          <div id="jv-rev-lista" class="jv-rev-lista"></div>
          <textarea data-jv-rev-geral placeholder="Comentário geral (opcional)">${e(R.geral)}</textarea>
          <div class="jv-rev-botoes"><button class="jv-b jv-b-ok" data-jv-rev-aprovar>${checkSVG(13)} Aprovar como está</button>
            <button class="jv-b jv-b-pri" data-jv-rev-enviar ${com ? "" : "disabled"}>${icon(ICONS.arrowRight, 14, "currentColor")} ${com ? `Enviar ${com} ajuste${com > 1 ? "s" : ""} ao Zeus` : "Enviar ajustes ao Zeus"}</button></div>
        </div></div></div></div>`;
  }
  function pintarRevisao(){
    const box = porId("jv-rev"); if(!box) return;
    if(!J.rev){ box.innerHTML = ""; return; }
    box.innerHTML = revisaoHTML();
    const R = J.rev, cam = porId("jv-rev-camada"), f = porId("jv-rev-if");
    if(f) f.addEventListener("load", () => { try { f.contentWindow.addEventListener("scroll", posicionarPins); } catch(err){} posicionarPins(); });
    const m = porId("jv-rev-midia"); if(m) m.addEventListener(R.video ? "loadedmetadata" : "load", posicionarPins);
    cam.addEventListener("click", marcar);
    // roda do mouse: deixa a página rolar por baixo da camada de marcação
    cam.addEventListener("wheel", ev => { if(!R.site) return; try { f.contentWindow.scrollBy(0, ev.deltaY); ev.preventDefault(); return; } catch(err){}
      cam.style.pointerEvents = "none"; clearTimeout(R.wt); R.wt = setTimeout(() => { if(J.rev && J.rev.marcando) cam.style.pointerEvents = ""; }, 700); }, { passive: false });
    box.querySelector("[data-jv-rev-fechar]").addEventListener("click", fecharRevisao);
    box.querySelector(".jv-rev-fundo").addEventListener("click", ev => { if(ev.target.classList.contains("jv-rev-fundo")) fecharRevisao(); });
    box.querySelector("[data-jv-rev-marcar]").addEventListener("change", ev => { R.marcando = ev.target.checked; cam.classList.toggle("off", !R.marcando); });
    box.querySelectorAll("[data-jv-rev-dev]").forEach(b => b.addEventListener("click", () => { const d = b.dataset.jvRevDev; if(d === R.dev) return;
      if(R.pins.length && !confirm("Os pontos marcados são da outra tela e serão apagados. Trocar?")) return; R.pins = []; R.edit = null; R.dev = d; pintarRevisao(); }));
    box.querySelector("[data-jv-rev-geral]").addEventListener("input", ev => { R.geral = ev.target.value; pintarBotaoEnviar(); });
    box.querySelector("[data-jv-rev-aprovar]").addEventListener("click", () => { const pid = R.pid; fecharRevisao(); aprovar(pid); });
    box.querySelector("[data-jv-rev-enviar]").addEventListener("click", enviarRevisao);
    pintarPins(); pintarLista();
  }
  function pintarBotaoEnviar(){ const b = document.querySelector("[data-jv-rev-enviar]"); if(!b || !J.rev) return; const n = J.rev.pins.filter(q => q.texto.trim()).length + (J.rev.geral.trim() ? 1 : 0);
    b.disabled = !n; b.innerHTML = icon(ICONS.arrowRight, 14, "currentColor") + " " + (n ? `Enviar ${n} ajuste${n > 1 ? "s" : ""} ao Zeus` : "Enviar ajustes ao Zeus"); }
  function marcar(ev){
    const R = J.rev; if(!R || !R.marcando || ev.target.closest(".jv-pin,.jv-pop")) return;
    const cam = ev.currentTarget, b = cam.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
    if(R.edit != null){ const q = R.pins.find(q => q.n === R.edit); if(q && !q.texto.trim()) R.pins = R.pins.filter(z => z !== q); } // ponto sem comentário some ao marcar outro
    const pin = { n: R.pins.reduce((m, q) => Math.max(m, q.n), 0) + 1, px: x / b.width, py: y / b.height, texto: "" };
    if(R.site){ try { const w = porId("jv-rev-if").contentWindow, doc = w.document; pin.docX = x + w.scrollX; pin.docY = y + w.scrollY; pin.alvo = descrever(doc.elementFromPoint(x, y)); } catch(err){} }
    if(R.video){ const v = porId("jv-rev-midia"); if(v){ pin.t = v.currentTime; v.pause(); } }
    R.pins.push(pin); R.edit = pin.n; pintarPins(); pintarLista();
  }
  function posPin(q){
    const cam = porId("jv-rev-camada"); if(!cam) return [0, 0];
    if(J.rev.site && q.docY != null){ try { const w = porId("jv-rev-if").contentWindow; return [q.docX - w.scrollX, q.docY - w.scrollY]; } catch(err){} }
    return [q.px * cam.clientWidth, q.py * cam.clientHeight];
  }
  function pintarPins(){
    const cam = porId("jv-rev-camada"); if(!cam || !J.rev) return; const R = J.rev, ed = R.pins.find(q => q.n === R.edit);
    cam.innerHTML = R.pins.map(q => `<span class="jv-pin${q.n === R.edit ? " on" : ""}" data-jv-pin="${q.n}"><b>${q.n}</b></span>`).join("")
      + (ed ? `<div class="jv-pop"><div class="jv-pop-t">Ponto ${ed.n}${ed.alvo ? ` · <span>${e(ed.alvo.slice(0, 60))}</span>` : ""}</div>
        <textarea data-jv-pop-txt placeholder="O que mudar aqui? Escreva ou toque no microfone">${e(ed.texto)}</textarea>
        <div class="jv-pop-b"><button class="jv-b jv-b-ic" data-jv-pop-mic title="Falar o ajuste">${icon(ICONS.mic, 15, "currentColor")}</button><button class="jv-b" data-jv-pop-del>Remover</button><button class="jv-b jv-b-pri" data-jv-pop-ok>Salvar</button></div></div>` : "");
    cam.querySelectorAll("[data-jv-pin]").forEach(el => el.addEventListener("click", ev => { ev.stopPropagation(); R.edit = +el.dataset.jvPin; pintarPins(); pintarLista(); }));
    if(ed){ const pop = cam.querySelector(".jv-pop"), ta = pop.querySelector("textarea");
      pop.addEventListener("click", ev => ev.stopPropagation());
      ta.addEventListener("input", () => { ed.texto = ta.value; pintarBotaoEnviar(); });
      ta.addEventListener("keydown", ev => { if(ev.key === "Enter" && !ev.shiftKey){ ev.preventDefault(); salvarPin(); } });
      pop.querySelector("[data-jv-pop-ok]").addEventListener("click", salvarPin);
      pop.querySelector("[data-jv-pop-del]").addEventListener("click", () => { R.pins = R.pins.filter(q => q !== ed); R.edit = null; pintarPins(); pintarLista(); });
      pop.querySelector("[data-jv-pop-mic]").addEventListener("click", ev => ditar(ta, ev.currentTarget));
      setTimeout(() => ta.focus(), 30); }
    posicionarPins();
  }
  function salvarPin(){ const R = J.rev; if(!R) return; const q = R.pins.find(z => z.n === R.edit); if(q && !q.texto.trim()) R.pins = R.pins.filter(z => z !== q); R.edit = null; pintarPins(); pintarLista(); }
  function posicionarPins(){
    const cam = porId("jv-rev-camada"); if(!cam || !J.rev) return; const W = cam.clientWidth, H = cam.clientHeight;
    cam.querySelectorAll("[data-jv-pin]").forEach(el => { const q = J.rev.pins.find(z => z.n === +el.dataset.jvPin); if(!q) return; const [x, y] = posPin(q);
      el.style.left = x + "px"; el.style.top = y + "px"; el.style.display = y < -4 || y > H + 30 ? "none" : ""; });
    const pop = cam.querySelector(".jv-pop"), ed = J.rev.pins.find(q => q.n === J.rev.edit);
    if(pop && ed){ const [x, y] = posPin(ed); pop.style.left = Math.max(8, Math.min(W - 290, x + 20)) + "px"; pop.style.top = Math.max(8, Math.min(H - 190, y - 20)) + "px"; }
  }
  function pintarLista(){
    const l = porId("jv-rev-lista"); if(!l || !J.rev) return; const R = J.rev;
    l.innerHTML = R.pins.length ? R.pins.map(q => `<div class="jv-rev-item${q.n === R.edit ? " on" : ""}" data-jv-item="${q.n}"><b>${q.n}</b><div style="min-width:0;flex:1"><small>${e(q.alvo || "Região: " + regiao(q.px, q.py))}${q.t != null ? " · aos " + Math.round(q.t) + "s" : ""}</small><div>${q.texto.trim() ? e(q.texto) : "<i>sem comentário ainda</i>"}</div></div></div>`).join("")
      : `<div class="jv-rev-vazio"><div class="jv-rev-vazio-ic"><span class="jv-pin" style="position:relative;margin:0;animation:none"><b>1</b></span></div>Clique em qualquer ponto da ${R.site ? "página" : R.video ? "cena" : "arte"} para marcar um ajuste. Dá para marcar quantos quiser e mandar tudo de uma vez.</div>`;
    l.querySelectorAll("[data-jv-item]").forEach(el => el.addEventListener("click", () => { R.edit = +el.dataset.jvItem; pintarPins(); pintarLista(); }));
    pintarBotaoEnviar();
  }
  // Ditar o ajuste: grava, transcreve (Whisper) e escreve no ponto. Na conversa em tempo real o microfone da voz fica mudo enquanto isso
  async function ditar(ta, botao){
    if(J.ditando){ J.ditando.stop(); return; }
    let st; try { st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch(err){ cfgToast("O navegador não liberou o microfone.", true); return; }
    if(J.conv){ try { J.conv.setMicMuted(true); } catch(err){} }
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
    const rec = new MediaRecorder(st, tipo ? { mimeType: tipo } : undefined), partes = []; J.ditando = rec; botao.classList.add("jv-gravando-b");
    rec.ondataavailable = ev => { if(ev.data && ev.data.size) partes.push(ev.data); };
    rec.onstop = async () => {
      st.getTracks().forEach(t => t.stop()); J.ditando = null; botao.classList.remove("jv-gravando-b"); if(J.conv){ try { J.conv.setMicMuted(!!J.mudo); } catch(err){} }
      const blob = new Blob(partes, { type: (rec.mimeType || "audio/webm").split(";")[0] }); if(blob.size < 2000) return;
      botao.disabled = true;
      try { const fd = new FormData(); fd.append("audio", blob, "voz." + (blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"));
        const r = await fetch("/api/chat/transcribe", { method: "POST", body: fd }), j = await r.json(); if(!r.ok) throw new Error(j.error || "HTTP " + r.status);
        const t = String(j.text || "").trim(); if(t && ta.isConnected){ ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + t; ta.dispatchEvent(new Event("input")); ta.focus(); } }
      catch(err){ cfgToast("Não consegui transcrever: " + err.message, true); }
      botao.disabled = false;
    };
    rec.start(250);
  }
  function enviarRevisao(){
    const R = J.rev; if(!R) return; const p = J.paineis.find(x => x.id === R.pid), pins = R.pins.filter(q => q.texto.trim()), geral = R.geral.trim();
    if(!pins.length && !geral){ cfgToast("Marque um ponto e diga o que mudar.", true); return; }
    const onde = q => (R.site ? (q.alvo ? "no elemento " + q.alvo : "na região " + regiao(q.px, q.py)) + (q.docY != null ? `, a ${Math.round(q.docY)} px do topo da página` : "")
      : "na região " + regiao(q.px, q.py) + ` (${Math.round(q.px * 100)}% da largura, ${Math.round(q.py * 100)}% da altura)` + (q.t != null ? `, aos ${Math.round(q.t)} segundos` : ""));
    const oque = R.site ? `no site "${R.titulo}" (${R.url}), olhando no ${R.dev === "cel" ? "celular" : "computador"}` : `${R.video ? "no vídeo" : "na arte"} "${R.titulo}"${R.total > 1 ? ` (${R.idx + 1}ª de ${R.total})` : ""} (${R.url})`;
    const msg = `Ajustes ${oque}, marcados na tela do Jarvis:\n` + pins.map((q, i) => `${i + 1}. ${onde(q)}: ${q.texto.trim()}`).join("\n") + (geral ? `\nGeral: ${geral}` : "")
      + `\nFaça os ajustes, ${R.site ? "publique de novo no mesmo endereço e me mostre a nova versão" : "gere a nova versão e me mostre"}.`;
    if(!enviarAoZeus(msg, `${pins.length + (geral ? 1 : 0)} ajuste${pins.length + (geral ? 1 : 0) > 1 ? "s" : ""} marcado${pins.length + (geral ? 1 : 0) > 1 ? "s" : ""} na tela: ${R.titulo || (R.site ? "site" : "arte")}`)) return;
    if(p){ p.ajustes = pins.length + (geral ? 1 : 0); p.aprovado = false; mexeu(p); }
    fecharRevisao(); pintar(); cfgToast("Ajustes enviados ao Zeus.");
  }
  const caixaLegenda = t => `<div class="jv-legenda-box">${destaque(t)}</div>`;
  const vozDisse = t => `<div style="font-size:12.5px;color:var(--jv-sub);margin-bottom:6px">Você disse</div><div style="font-size:18px;color:var(--jv-texto)">${e(t)}</div>`;
  function legendaHTML(){
    if(J.conv){ if(J.fase === "falando" && J.legenda) return caixaLegenda(J.legenda); return J.voce ? vozDisse(J.voce) : ""; }
    if(J.fase === "ouvindo" || J.fase === "transcrevendo" || (J.fase === "pensando" && J.voce)) return J.voce ? vozDisse(J.voce) : "";
    return J.legenda ? caixaLegenda(J.legenda) : "";
  }
  function statusTxt(){
    if(J.modo === "tempo-real"){
      if(J.conectando) return "Conectando...";
      if(J.zeusOcupado){ const n = J.tarefas.filter(t => t.estado === "trabalhando").length; return n > 1 ? `Zeus em ${n} tarefas ao mesmo tempo` : "Zeus trabalhando" + ((J.tarefas.find(t => t.estado === "trabalhando") || {}).status ? ": " + J.tarefas.find(t => t.estado === "trabalhando").status : "..."); }
      if(J.conv) return J.fase === "falando" ? "Falando" : "Ouvindo, pode falar";
      return FASE.ocioso;
    }
    const esp = J.tarefas.find(t => t.esperando), n = ativas().length;
    if(J.fase === "pensando") return esp && esp.status ? esp.status + "..." : FASE.pensando;
    if(J.fase === "ocioso" && n) return `Trabalhando em ${n} tarefa${n > 1 ? "s" : ""} · pode pedir outra`;
    return FASE[J.fase] === FASE.ocioso ? "Toque no microfone e fale" : FASE[J.fase];
  }
  // Quadro "Tarefas em andamento": o que o ZEUS está fazendo agora (multitarefa), com tempo, quem do time e cancelar
  const relogio = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function tarefasHTML(){
    const agora = Date.now(), vivas = ativas();
    const lista = J.tarefas.filter(t => vivas.includes(t) || (t.fim && agora - t.fim < 20000 && t.estado !== "cancelada")).slice(-5);
    if(!lista.length) return "";
    const nomeDe = k => (EQUIPE.find(x => x[0] === k) || [])[1];
    return `<div class="jv-tarefas"><div class="jv-tar-tit">${vivas.length ? "Tarefas em andamento · " + vivas.length : "Tarefas"}</div>${lista.map(t => {
      const viva = vivas.includes(t), quem = t.agentes.map(nomeDe).filter(Boolean).join(", ");
      const ico = t.estado === "trabalhando" ? '<span class="jv-spin"></span>' : t.estado === "na fila" ? '<span class="jv-tar-fila"></span>'
        : t.estado === "erro" ? '<span class="jv-tar-ico" style="color:#C0341C">✕</span>' : '<span class="jv-tar-ico" style="color:var(--jv-ok)">✓</span>';
      const meta = t.estado === "trabalhando" ? relogio(agora - t.inicio) + (quem ? " · " + quem : "") + (t.status ? " · " + curto(t.status, 34) : "")
        : t.estado === "na fila" ? "esperando uma mesa livre" : t.estado === "erro" ? "não terminou" : "pronto" + (quem ? " · " + quem : "");
      return `<div class="jv-tar${viva ? "" : " jv-tar-fim"}">${ico}<div style="flex:1;min-width:0"><div class="jv-tar-txt">${e(curto(t.texto, 64))}</div><div class="jv-tar-meta">${e(meta)}</div></div>${viva ? `<span data-jv-cancelar="${t.id}" title="Cancelar esta tarefa" class="jv-tar-x">×</span>` : ""}</div>`;
    }).join("")}</div>`;
  }
  function pintarTarefas(){ const b = porId("jv-tarefas"); if(b){ b.innerHTML = tarefasHTML(); ligar(); } }
  const LINK = "font-size:12px;color:var(--jv-sub);cursor:pointer;text-decoration:underline";
  const SEC = "padding:8px 14px;border-radius:9px;border:1px solid var(--jv-borda);background:var(--jv-card);color:var(--jv-texto);font:inherit;font-size:12.5px;cursor:pointer";
  function controlesHTML(){
    if(J.modo === "tempo-real"){
      const on = !!J.conv;
      return `<div style="display:flex;align-items:center;gap:14px;justify-content:center;flex-wrap:wrap">
        <button data-jv-conversar ${J.conectando ? "disabled" : ""} class="jv-btn ${on ? "jv-btn-fim" : ""}" style="opacity:${J.conectando ? 0.6 : 1}">${on ? '<span class="jv-gravando"></span>' : icon(ICONS.mic, 20, "currentColor")}${J.conectando ? "Conectando..." : on ? "Encerrar conversa" : "Conversar com o Zeus"}</button>
        ${on ? `<button data-jv-mudo style="${SEC}">${J.mudo ? "Ativar microfone" : "Silenciar microfone"}</button>` : ""}
        <span data-jv-hist style="${LINK}">${J.verHistorico ? "Esconder conversa" : "Ver conversa"}</span>
        ${on ? "" : `<span data-jv-modo style="${LINK}">Usar modo por botão</span>`}</div>`;
    }
    const gravando = J.fase === "ouvindo", ocupado = J.fase === "transcrevendo" || J.fase === "pensando" || J.fase === "falando";
    return `<div style="display:flex;align-items:center;gap:12px;justify-content:center;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--jv-sub);cursor:pointer"><input type="checkbox" data-jv-continuo ${J.continuo ? "checked" : ""} style="accent-color:var(--jv-roxo)">Conversa contínua</label>
      <button data-jv-mic title="${gravando ? "Enviar" : "Falar"}" ${ocupado ? "disabled" : ""} class="jv-mic ${gravando ? "jv-mic-rec" : ""}" style="opacity:${ocupado ? 0.45 : 1}">${gravando ? '<span style="width:18px;height:18px;border-radius:4px;background:#FFFFFF"></span>' : icon(ICONS.mic, 26, "currentColor")}</button>
      ${ocupado ? `<button data-jv-parar style="${SEC}">Parar</button>` : ""}
      <form data-jv-form style="display:flex;gap:6px"><input data-jv-texto placeholder="ou escreva aqui..." style="width:230px;padding:9px 12px;border-radius:9px;border:1px solid var(--jv-borda);background:var(--jv-card);color:var(--jv-texto);font:inherit;font-size:13px;outline:none"></form>
      <span data-jv-hist style="${LINK}">${J.verHistorico ? "Esconder conversa" : "Ver conversa"}</span>
      <span data-jv-modo style="${LINK}">Conversa em tempo real</span></div>`;
  }
  function historicoHTML(){
    if(!J.verHistorico) return "";
    return `<div class="jv-hist">${J.historico.length ? J.historico.slice(-20).map(m => `<div style="align-self:${m.eu ? "flex-end" : "flex-start"};max-width:88%;padding:8px 11px;border-radius:10px;font-size:12.5px;line-height:1.45;white-space:pre-wrap;background:${m.eu ? "var(--jv-roxo)" : "var(--jv-lilas)"};color:${m.eu ? "#FFFFFF" : "var(--jv-texto)"}">${e(m.texto)}</div>`).join("") : `<div style="font-size:12.5px;color:var(--jv-sub)">Nada ainda.</div>`}</div>`;
  }
  const CSS = `
    /* tema escuro: a Central inverte a área principal (invert + hue-rotate), então só existe a versão clara aqui */
    #jv-root{--jv-roxo:#673DE6;--jv-roxo2:#8B6CF0;--jv-roxo-30:rgba(103,61,230,0.3);--jv-lilas:#F0ECFD;--jv-card:#FFFFFF;--jv-borda:#E6E6EA;--jv-texto:#17171A;--jv-sub:#66666F;--jv-linha:rgba(103,61,230,0.16);--jv-ok:#0F7A68;
      --jv-fundo:radial-gradient(ellipse at 50% 45%,#FFFFFF 0%,#F8F6FF 50%,#EFEBFC 100%);--jv-particula:103,61,230;--jv-sombra:0 6px 18px rgba(23,23,26,0.07)}
    @keyframes jv-gira{to{transform:rotate(360deg)}}@keyframes jv-flui{to{stroke-dashoffset:-4}}@keyframes jv-pisca{50%{opacity:.25}}@keyframes jv-pulsa{50%{transform:scale(1.06)}}
    @keyframes jv-entra{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}@keyframes jv-sobe{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
    .jv-card{position:absolute;transform:translate(-50%,-50%);width:196px;padding:10px 12px;border-radius:14px;background:var(--jv-card);border:1px solid var(--jv-borda);box-shadow:var(--jv-sombra);transition:transform .35s,box-shadow .35s,border-color .35s;z-index:3}
    .jv-card.jv-on{transform:translate(-50%,-50%) scale(1.07);border:2px solid var(--jv-roxo);box-shadow:0 10px 34px rgba(103,61,230,0.28);z-index:5}
    .jv-card.jv-ent{border:2px solid var(--jv-roxo2);box-shadow:0 8px 26px rgba(103,61,230,0.2);z-index:5}
    .jv-card.jv-ok{border-color:var(--jv-ok)}
    .jv-av{position:relative;width:36px;height:36px;flex:0 0 36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--jv-lilas)}
    .jv-av>span{position:relative;z-index:1;font-weight:700;font-size:14px;color:var(--jv-roxo)}
    .jv-av-on::before{content:"";position:absolute;inset:-3px;border-radius:50%;background:conic-gradient(var(--jv-roxo),transparent 70%,var(--jv-roxo));animation:jv-gira 1.2s linear infinite}
    .jv-av-on::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--jv-lilas)}
    .jv-nome{display:block;font-size:13.5px;font-weight:700;color:var(--jv-texto)}.jv-papel{display:block;font-size:11px;color:var(--jv-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .jv-sep{border-top:1px dashed var(--jv-borda);margin:8px 0 6px}
    .jv-est{font-size:11.5px;display:flex;align-items:center;gap:6px;color:var(--jv-sub)}.jv-dot{width:7px;height:7px;border-radius:50%;background:#9AD8B4}
    .jv-on .jv-est{color:var(--jv-roxo);font-weight:600}.jv-on .jv-dot{background:var(--jv-roxo);animation:jv-pisca 1s infinite}.jv-ent .jv-dot{background:var(--jv-roxo2)}.jv-ok .jv-est{color:var(--jv-ok)}.jv-ok .jv-dot{background:var(--jv-ok)}
    .jv-balao{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;padding:5px 10px;border-radius:8px;font-size:11.5px;font-weight:600;color:#FFFFFF;background:var(--jv-roxo);box-shadow:0 4px 14px rgba(103,61,230,0.35);animation:jv-sobe .3s ease-out}
    .jv-balao::after{content:"";position:absolute;left:50%;top:100%;margin-left:-5px;border:5px solid transparent;border-top-color:var(--jv-roxo)}
    .jv-balao-ok{background:var(--jv-ok);box-shadow:none}.jv-balao-ok::after{border-top-color:var(--jv-ok)}
    line.jv-l{stroke:var(--jv-linha);stroke-width:.18;stroke-dasharray:.5 1}
    line.jv-l-on{stroke:var(--jv-roxo);stroke-width:.4;stroke-dasharray:1.2 .8;animation:jv-flui .7s linear infinite}
    line.jv-l-ent{stroke:var(--jv-roxo2);stroke-width:.9;stroke-linecap:round;stroke-dasharray:.01 2.2;animation:jv-flui .45s linear infinite}
    line.jv-l-ok{stroke:var(--jv-ok);stroke-width:.22;stroke-dasharray:.5 1;opacity:.6}
    .jv-fonte{position:absolute;transform:translate(-50%,-50%);padding:4px 10px;border-radius:20px;font-size:11px;white-space:nowrap;z-index:2;transition:all .3s;color:var(--jv-sub);background:var(--jv-card);border:1px solid var(--jv-borda)}
    .jv-fonte-on{color:#FFFFFF;background:var(--jv-roxo);border-color:var(--jv-roxo);box-shadow:0 0 18px rgba(103,61,230,0.45)}
    .jv-orbe{position:absolute;inset:80px;border-radius:50%;overflow:hidden;border:3px solid var(--jv-roxo);box-shadow:0 0 0 8px rgba(103,61,230,0.08),0 12px 40px rgba(103,61,230,0.35);background:var(--jv-card);display:flex;align-items:center;justify-content:center}
    #jv-palco{position:absolute;left:0;top:0;bottom:0;right:0;transition:right .55s cubic-bezier(.2,.8,.2,1)}
    #jv-palco.jv-estreito{right:400px}#jv-palco.jv-estreito .jv-card{width:172px}
    .jv-painel{position:relative;width:360px;border-radius:20px;background:var(--jv-card);border:1px solid var(--jv-borda);box-shadow:0 24px 60px rgba(46,26,120,0.16),0 2px 6px rgba(23,23,26,0.05);padding:18px 18px 16px;overflow:hidden;animation:jv-desliza .55s cubic-bezier(.2,.8,.2,1)}
    .jv-grafico .zviz{border:0 !important;margin:0 !important;background:transparent !important}.jv-grafico .zviz > div{padding-left:0 !important;padding-right:0 !important}
    .jv-painel-min{padding:12px 16px;cursor:pointer;box-shadow:0 8px 24px rgba(46,26,120,0.08);animation:none;transition:transform .2s}.jv-painel-min:hover{transform:translateX(-4px)}
    .jv-painel-min .jv-corpo{display:none}.jv-painel-min .jv-painel-topo{margin-bottom:4px}.jv-painel-min .jv-titulo{font-size:14.5px}.jv-painel-min .jv-periodo{font-size:11.5px}.jv-painel-min::before{width:4px;height:auto;bottom:0;right:auto}
    .jv-painel::before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,var(--jv-roxo),var(--jv-roxo2),#C4B5FD)}
    @keyframes jv-desliza{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}
    .jv-painel-topo{display:flex;align-items:center;gap:8px;margin-bottom:12px}
    .jv-quem{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--jv-roxo);flex:1;min-width:0}
    .jv-quem-av{width:22px;height:22px;border-radius:50%;background:var(--jv-lilas);display:inline-flex;align-items:center;justify-content:center;font-size:11px}
    .jv-fechar{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--jv-sub)}.jv-fechar:hover{background:var(--jv-lilas)}
    .jv-titulo{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:600;line-height:1.25;color:var(--jv-texto)}
    .jv-periodo{font-size:12px;color:var(--jv-sub);margin-top:3px}
    .jv-hero{margin-top:14px;padding:14px 16px;border-radius:14px;background:linear-gradient(135deg,rgba(103,61,230,0.09),rgba(139,108,240,0.04));border:1px solid rgba(103,61,230,0.14)}
    .jv-hero-v{font-family:'Space Grotesk',sans-serif;font-size:34px;font-weight:700;letter-spacing:-.01em;color:var(--jv-texto);margin:2px 0 6px;font-variant-numeric:tabular-nums}
    .jv-rot{font-size:11.5px;color:var(--jv-sub);font-weight:500}
    .jv-grade{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
    .jv-tile{padding:11px 12px;border-radius:12px;background:var(--jv-lilas);min-width:0;display:flex;flex-direction:column;align-items:flex-start}.jv-tile:last-child:nth-child(odd){grid-column:1/-1}
    .jv-tile-v{font-family:'Space Grotesk',sans-serif;font-size:19px;font-weight:700;color:var(--jv-texto);margin:2px 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
    .jv-delta{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11.5px;font-weight:600}.jv-delta-p{font-size:10.5px;padding:1px 7px}
    .jv-grafico{margin-top:14px;border-radius:14px;padding:8px 12px 4px;background:var(--jv-lilas)}
    .jv-legenda-box{display:inline-block;padding:10px 18px;border-radius:12px;background:var(--jv-card);border:1px solid var(--jv-borda);box-shadow:0 10px 30px rgba(23,23,26,0.08);font-family:'Space Grotesk',sans-serif;font-size:21px;font-weight:700;color:var(--jv-texto);text-transform:uppercase;line-height:1.3}
    .jv-hist{position:absolute;left:16px;bottom:120px;width:min(380px,calc(100% - 32px));max-height:45vh;overflow-y:auto;z-index:8;padding:12px;border-radius:14px;background:var(--jv-card);border:1px solid var(--jv-borda);box-shadow:0 14px 40px rgba(23,23,26,0.12);display:flex;flex-direction:column;gap:8px}
    .jv-btn{display:flex;align-items:center;gap:10px;padding:0 26px;height:58px;border-radius:29px;border:0;cursor:pointer;font:inherit;font-size:15px;font-weight:700;color:#FFFFFF;background:var(--jv-roxo);box-shadow:0 10px 28px rgba(103,61,230,0.4)}
    .jv-btn-fim{background:var(--jv-card);color:#C0341C;border:1.5px solid rgba(192,52,28,0.45);box-shadow:var(--jv-sombra)}
    .jv-gravando{width:10px;height:10px;border-radius:50%;background:#C0341C;animation:jv-pisca 1s infinite}
    .jv-mic{width:66px;height:66px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#FFFFFF;background:var(--jv-roxo);box-shadow:0 10px 28px rgba(103,61,230,0.4)}
    .jv-mic-rec{background:#C0341C;box-shadow:0 0 30px rgba(192,52,28,0.5);animation:jv-pulsa 1.2s infinite}
    /* mini-ilustrações do trabalho */
    .jv-il{position:relative;height:56px;margin-top:9px;border-radius:9px;background:var(--jv-lilas);overflow:hidden}
    .jv-cel{position:absolute;left:12px;top:5px;width:30px;height:46px;border-radius:6px;border:2px solid var(--jv-roxo);overflow:hidden;background:var(--jv-card)}
    .jv-feed{animation:jv-rola 2.4s linear infinite}@keyframes jv-rola{to{transform:translateY(-50%)}}
    .jv-post{height:22px;padding:2px}.jv-post span{display:block;height:11px;border-radius:2px;background:var(--jv-roxo2)}.jv-post i{display:block;height:3px;margin-top:2px;width:70%;background:var(--jv-roxo-30)}
    .jv-cora{position:absolute;bottom:4px;color:#E0457B;font-size:13px;animation:jv-coracao 1.5s ease-out infinite}@keyframes jv-coracao{from{transform:translateY(0) scale(.6);opacity:0}30%{opacity:1}to{transform:translateY(-40px) scale(1.2);opacity:0}}
    .jv-barras{position:absolute;left:12px;right:52px;bottom:8px;height:40px;display:flex;align-items:flex-end;gap:5px}.jv-barras span{flex:1;height:100%;background:linear-gradient(var(--jv-roxo2),var(--jv-roxo));border-radius:3px 3px 0 0;transform-origin:bottom;animation:jv-cresce 1.4s ease-in-out infinite alternate}
    @keyframes jv-cresce{from{transform:scaleY(.25)}to{transform:scaleY(1)}}
    .jv-seta{position:absolute;right:8px;top:10px;width:40px;height:22px;fill:none;stroke:var(--jv-ok);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;animation:jv-traco 1.8s ease-in-out infinite}@keyframes jv-traco{from{stroke-dashoffset:60}60%,to{stroke-dashoffset:0}}
    .jv-texto{position:absolute;inset:10px 12px}.jv-texto span{display:block;height:6px;margin-bottom:8px;border-radius:3px;background:var(--jv-roxo);width:0;animation:jv-digita 2.7s steps(14) infinite}
    @keyframes jv-digita{0%{width:0}33%,100%{width:100%}}.jv-cursor{position:absolute;right:0;top:0;width:2px;height:14px;background:var(--jv-roxo);animation:jv-pisca .7s infinite}
    .jv-formas span{position:absolute;opacity:0;animation:jv-pinta 2.4s ease-out infinite}.jv-f1{left:12px;top:10px;width:22px;height:22px;border-radius:50%;background:var(--jv-roxo)}
    .jv-f2{left:44px;top:18px;width:20px;height:20px;background:#E0457B;animation-delay:.6s !important}.jv-f3{left:74px;top:8px;width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-bottom:22px solid var(--jv-roxo2);animation-delay:1.2s !important}
    @keyframes jv-pinta{0%{opacity:0;transform:scale(.3) rotate(-30deg)}25%,80%{opacity:1;transform:none}100%{opacity:0}}
    .jv-pincel{position:absolute;left:8px;right:8px;bottom:2px;height:22px;width:calc(100% - 16px);fill:none;stroke:var(--jv-roxo);stroke-width:3;stroke-linecap:round;stroke-dasharray:140;animation:jv-traco2 2.4s ease-in-out infinite}@keyframes jv-traco2{from{stroke-dashoffset:140}70%,to{stroke-dashoffset:0}}
    .jv-alvo{position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}.jv-alvo span{position:absolute;border-radius:50%;border:3px solid var(--jv-roxo)}
    .jv-alvo span:nth-child(1){inset:0;opacity:.35}.jv-alvo span:nth-child(2){inset:9px;opacity:.65}.jv-alvo span:nth-child(3){inset:17px;background:var(--jv-roxo)}
    .jv-flecha{position:absolute;top:50%;left:-70px;width:40px;height:3px;background:var(--jv-ok);transform-origin:right;animation:jv-voa 1.8s ease-in infinite}.jv-flecha::after{content:"";position:absolute;right:-2px;top:-4px;border:5px solid transparent;border-left:7px solid var(--jv-ok)}
    @keyframes jv-voa{from{transform:translateX(-30px);opacity:0}20%{opacity:1}70%,100%{transform:translateX(62px);opacity:1}}
    .jv-funil{position:absolute;left:50%;top:6px;width:50px;height:40px;margin-left:-25px;background:linear-gradient(var(--jv-roxo2),var(--jv-roxo));clip-path:polygon(0 0,100% 0,62% 60%,62% 100%,38% 100%,38% 60%);opacity:.85}
    .jv-gota{position:absolute;top:0;width:6px;height:6px;border-radius:50%;background:var(--jv-card);border:1.5px solid var(--jv-roxo);animation:jv-cai 1.4s ease-in infinite}@keyframes jv-cai{from{transform:translateY(0);opacity:1}to{transform:translateY(46px);opacity:0}}
    .jv-moeda{position:absolute;right:12px;bottom:8px;font-size:11px;font-weight:700;color:var(--jv-ok);animation:jv-pulsa 1s infinite}
    .jv-codigo{position:absolute;inset:6px 12px;animation:jv-rola 3s linear infinite}.jv-codigo span{display:block;height:5px;margin-bottom:5px;border-radius:2px;background:var(--jv-roxo)}.jv-codigo span:nth-child(3n){background:var(--jv-ok)}.jv-codigo span:nth-child(4n){background:var(--jv-roxo2)}
    .jv-check{position:absolute;inset:6px 12px}.jv-check div{display:flex;align-items:center;gap:7px;height:15px}.jv-check span{height:5px;flex:1;border-radius:3px;background:var(--jv-roxo-30)}
    .jv-check b{width:12px;height:12px;border-radius:3px;border:1.5px solid var(--jv-roxo);font-size:9px;line-height:10px;text-align:center;color:transparent;animation:jv-marca 2.1s infinite}@keyframes jv-marca{0%,30%{color:transparent;background:transparent}35%,100%{color:#FFFFFF;background:var(--jv-ok);border-color:var(--jv-ok)}}
    .jv-filme{position:absolute;top:8px;left:0;display:flex;gap:4px;animation:jv-corre 1.6s linear infinite}.jv-filme span{width:22px;height:26px;border-radius:3px;background:var(--jv-roxo2);border:2px dashed var(--jv-card)}@keyframes jv-corre{to{transform:translateX(-52px)}}
    .jv-play{position:absolute;left:50%;top:14px;margin-left:-9px;color:#FFFFFF;font-size:14px;text-shadow:0 0 6px var(--jv-roxo)}.jv-barra{position:absolute;left:10px;right:10px;bottom:7px;height:4px;border-radius:2px;background:var(--jv-roxo-30)}.jv-barra i{display:block;height:100%;border-radius:2px;background:var(--jv-roxo);animation:jv-progresso 2.5s linear infinite}
    @keyframes jv-progresso{from{width:0}to{width:100%}}
    .jv-site{position:absolute;inset:6px 12px}.jv-site span{display:block;border-radius:3px;background:var(--jv-roxo);opacity:0;animation:jv-monta 2.6s infinite}.jv-site>div{display:flex;gap:4px;margin:4px 0}
    .jv-s1{height:8px}.jv-s2{flex:1;height:18px;background:var(--jv-roxo2) !important;animation-delay:.4s !important}.jv-s3{flex:1;height:18px;animation-delay:.8s !important}.jv-s4{height:6px;width:60%;animation-delay:1.2s !important;background:var(--jv-ok) !important}
    @keyframes jv-monta{0%{opacity:0;transform:translateY(5px)}20%,85%{opacity:1;transform:none}100%{opacity:0}}
    /* telas de entrega */
    .jv-painel{width:420px;flex-shrink:0}#jv-palco.jv-estreito{right:460px}
    .jv-mais{display:none;order:999;align-self:center;padding:7px 14px;border-radius:20px;background:var(--jv-card);border:1px solid var(--jv-borda);font-size:12px;font-weight:600;color:var(--jv-roxo);cursor:pointer;box-shadow:var(--jv-sombra)}
    .jv-chip{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:20px;background:var(--jv-lilas);color:var(--jv-roxo);white-space:nowrap}
    .jv-desc{font-size:12.5px;color:var(--jv-sub);margin-top:8px;line-height:1.45}
    .jv-acoes{display:flex;gap:8px;margin-top:12px}
    .jv-b{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--jv-borda);background:var(--jv-card);color:var(--jv-texto);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .15s,transform .1s}
    .jv-b:hover{background:var(--jv-lilas)}.jv-b:active{transform:scale(.97)}.jv-b[disabled]{opacity:.45;cursor:default;transform:none}
    .jv-b-ok{color:var(--jv-ok);border-color:rgba(15,122,104,0.35)}.jv-b-ok:hover{background:rgba(15,122,104,0.07)}
    .jv-b-pri{background:var(--jv-roxo);color:#FFFFFF;border-color:var(--jv-roxo)}.jv-b-pri:hover{background:#5A33D1}
    .jv-b-ic{flex:0 0 36px;padding:0}
    .jv-gravando-b{background:#C0341C !important;color:#FFFFFF !important;border-color:#C0341C !important;animation:jv-pulsa 1.2s infinite}
    .jv-aprovado{margin-top:12px;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:rgba(15,122,104,0.08);color:var(--jv-ok);font-size:12.5px;font-weight:600}
    .jv-ajustes-env{margin-top:10px;display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:10px;background:var(--jv-lilas);font-size:12px;color:var(--jv-roxo);font-weight:600}
    .jv-spin{width:12px;height:12px;flex:0 0 12px;border-radius:50%;border:2px solid var(--jv-roxo-30);border-top-color:var(--jv-roxo);animation:jv-gira .8s linear infinite;display:inline-block}
    .jv-okc{width:20px;height:20px;flex:0 0 20px;border-radius:50%;background:var(--jv-ok);color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;animation:jv-pop .45s cubic-bezier(.2,.9,.3,1.5)}
    @keyframes jv-pop{from{transform:scale(0)}to{transform:scale(1)}}
    .jv-traco-ok{stroke-dasharray:24;stroke-dashoffset:24;animation:jv-risca .45s .2s forwards}@keyframes jv-risca{to{stroke-dashoffset:0}}
    /* site */
    .jv-nav{margin-top:12px;border-radius:12px;border:1px solid var(--jv-borda);overflow:hidden;background:#F7F6FB}
    .jv-nav-topo{display:flex;align-items:center;gap:5px;padding:7px 9px;background:#F1EFF7;border-bottom:1px solid var(--jv-borda)}
    .jv-nav-topo>i{width:9px;height:9px;border-radius:50%;background:#FF5F57}.jv-nav-topo>i:nth-child(2){background:#FEBC2E}.jv-nav-topo>i:nth-child(3){background:#28C840}
    .jv-url{flex:1;min-width:0;margin-left:6px;height:22px;border-radius:6px;background:var(--jv-card);font-size:10.5px;color:var(--jv-sub);display:flex;align-items:center;gap:5px;padding:0 8px;white-space:nowrap;overflow:hidden}
    .jv-dev{display:flex;gap:2px;padding:2px;border-radius:8px;background:#E8E5F2}.jv-dev b{min-width:24px;height:20px;padding:0 5px;border-radius:6px;display:flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;color:var(--jv-sub);font-size:12px;font-weight:600}
    .jv-dev b.on{background:var(--jv-card);color:var(--jv-roxo);box-shadow:0 1px 3px rgba(23,23,26,0.1)}.jv-dev-g b{height:30px;padding:0 12px}
    .jv-nav-tela{position:relative;overflow:hidden;background:#FFFFFF}
    .jv-tela-cel{display:flex;justify-content:center;padding:14px 0;background:linear-gradient(160deg,#F4F1FD,#E9E4FA)}
    .jv-fone{position:relative;width:176px;border-radius:22px;border:6px solid #17171A;overflow:hidden;background:#FFFFFF;box-shadow:0 12px 30px rgba(23,23,26,0.25)}
    .jv-escala{position:relative;overflow:hidden;width:100%;height:240px}
    .jv-escala iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;pointer-events:none;max-width:none;background:#FFFFFF}
    .jv-carrega{position:absolute;inset:0;z-index:1;background:linear-gradient(100deg,#F4F2FA 30%,#FFFFFF 50%,#F4F2FA 70%);background-size:200% 100%;animation:jv-brilho 1.2s linear infinite;transition:opacity .4s}
    .jv-carrega.ok{opacity:0;pointer-events:none}@keyframes jv-brilho{to{background-position:-200% 0}}
    .jv-nav-capa{position:absolute;inset:0;z-index:2;display:flex;align-items:flex-end;justify-content:center;padding:12px;opacity:0;transition:opacity .2s;background:linear-gradient(transparent 45%,rgba(23,23,26,0.4));cursor:pointer}
    .jv-nav-tela:hover .jv-nav-capa{opacity:1}
    .jv-nav-capa span{display:inline-flex;gap:6px;align-items:center;padding:8px 14px;border-radius:20px;background:var(--jv-card);color:var(--jv-roxo);font-size:12px;font-weight:700;box-shadow:0 6px 18px rgba(23,23,26,0.2)}
    /* artes */
    .jv-galeria{position:relative;margin-top:12px;border-radius:14px;overflow:hidden;background:#F4F2FA;display:flex;align-items:center;justify-content:center;min-height:160px}
    .jv-galeria img,.jv-galeria video{display:block;width:100%;max-height:440px;object-fit:contain;cursor:zoom-in}
    .jv-gal{position:absolute;top:50%;margin-top:-17px;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.94);display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 2px 10px rgba(23,23,26,0.18);color:var(--jv-texto);font-weight:400}
    .jv-gal-ant{left:10px}.jv-gal-prox{right:10px}
    .jv-pontos{position:absolute;bottom:10px;left:0;right:0;display:flex;justify-content:center;gap:5px;pointer-events:none}.jv-pontos i{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,0.65);box-shadow:0 0 3px rgba(0,0,0,0.3);transition:width .2s}.jv-pontos i.on{background:#FFFFFF;width:16px}
    .jv-miniaturas{display:flex;gap:6px;margin-top:8px;overflow-x:auto;scrollbar-width:none}.jv-miniaturas>*{width:44px;height:44px;flex:0 0 44px;object-fit:cover;border-radius:8px;cursor:pointer;opacity:.5;border:2px solid transparent;transition:opacity .15s}
    .jv-miniaturas>.on{opacity:1;border-color:var(--jv-roxo)}.jv-mini-v{display:flex;align-items:center;justify-content:center;background:var(--jv-lilas);color:var(--jv-roxo)}
    /* WhatsApp */
    .jv-zap{margin-top:12px;border-radius:14px;overflow:hidden;border:1px solid var(--jv-borda)}
    .jv-zap-topo{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#F0F2F5;color:#54656F}
    .jv-zap-topo b{display:block;font-size:13.5px;color:#111B21;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jv-zap-topo small{display:block;font-size:11px;color:#667781;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .jv-zap-av{width:36px;height:36px;flex:0 0 36px;border-radius:50%;background:#DFE5E7;color:#54656F;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px}
    .jv-zap-chat{padding:16px 14px;background-color:#EFEAE2;background-image:radial-gradient(rgba(84,101,111,0.07) 1.2px,transparent 1.2px);background-size:16px 16px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-height:280px;overflow-y:auto}
    .jv-bolha{position:relative;max-width:86%;padding:7px 9px 6px;border-radius:9px 0 9px 9px;background:#D9FDD3;color:#111B21;font-size:13px;line-height:1.42;box-shadow:0 1px 1px rgba(11,20,26,0.13);animation:jv-bolha .5s cubic-bezier(.2,.9,.3,1.25);word-wrap:break-word}
    .jv-bolha::after{content:"";position:absolute;right:-7px;top:0;border-top:8px solid #D9FDD3;border-right:8px solid transparent}
    .jv-bolha-erro{background:#FDE2DD}.jv-bolha-erro::after{border-top-color:#FDE2DD}
    @keyframes jv-bolha{from{opacity:0;transform:translateY(16px) scale(.92);transform-origin:right bottom}to{opacity:1;transform:none}}
    .jv-bolha-h{float:right;margin:6px 0 -3px 12px;font-size:10.5px;color:#667781;display:inline-flex;align-items:center;gap:3px}
    .jv-tq{font-size:11.5px;letter-spacing:-4px;padding-right:4px;color:#8696A0;display:inline-flex}.jv-tq-ok{animation:jv-azul 1.4s forwards}@keyframes jv-azul{0%,55%{color:#8696A0}100%{color:#53BDEB}}
    .jv-zap-audio{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#54656F;margin-bottom:4px}.jv-zap-audio i{width:70px;height:3px;border-radius:2px;background:#8696A0}
    .jv-zap-st{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;font-size:12.5px;font-weight:600;color:var(--jv-sub);background:var(--jv-card);border-top:1px solid var(--jv-borda)}
    .jv-zap-ok{color:var(--jv-ok)}.jv-zap-erro{color:#C0341C}
    /* comprovante */
    .jv-feito{display:flex;align-items:center;gap:14px;margin-top:14px;padding:14px;border-radius:14px;background:linear-gradient(135deg,rgba(103,61,230,0.09),rgba(139,108,240,0.03));border:1px solid rgba(103,61,230,0.14)}
    .jv-feito-ic{position:relative;width:54px;height:54px;flex:0 0 54px;border-radius:16px;background:var(--jv-card);color:var(--jv-roxo);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(103,61,230,0.18);animation:jv-pop .45s cubic-bezier(.2,.9,.3,1.4)}
    .jv-desenha{stroke-dasharray:140;stroke-dashoffset:140;animation:jv-desenho 1.1s .2s ease-out forwards}@keyframes jv-desenho{to{stroke-dashoffset:0}}
    .jv-feito-ok{position:absolute;right:-6px;bottom:-6px;width:22px;height:22px;border-radius:50%;background:var(--jv-ok);color:#FFFFFF;display:flex;align-items:center;justify-content:center;border:2px solid var(--jv-card);animation:jv-pop .4s .8s both cubic-bezier(.2,.9,.3,1.5)}
    .jv-feito-tag{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:700;color:var(--jv-texto)}.jv-feito-h{font-size:12px;color:var(--jv-sub);margin-top:2px}
    .jv-det{margin-top:10px;border-radius:12px;overflow:hidden;border:1px solid var(--jv-borda)}
    .jv-det>div{display:flex;gap:12px;padding:9px 12px;font-size:12.5px;border-top:1px solid var(--jv-borda);animation:jv-entra .4s both}.jv-det>div:first-child{border-top:0}
    .jv-det>div:nth-child(2){animation-delay:.08s}.jv-det>div:nth-child(3){animation-delay:.16s}.jv-det>div:nth-child(4){animation-delay:.24s}.jv-det>div:nth-child(5){animation-delay:.32s}
    .jv-det span{color:var(--jv-sub);flex:0 0 86px}.jv-det b{font-weight:600;color:var(--jv-texto);min-width:0;word-break:break-word}
    /* quadro (briefing ao vivo) */
    .jv-q-prog{margin-top:12px;height:6px;border-radius:3px;background:var(--jv-lilas);overflow:hidden}.jv-q-prog span{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,var(--jv-roxo),var(--jv-roxo2));transition:width .6s cubic-bezier(.2,.8,.2,1)}
    .jv-q-info{font-size:11.5px;color:var(--jv-sub);margin:6px 0 10px}
    .jv-q-lista{display:flex;flex-direction:column;gap:6px}
    .jv-q-item{display:flex;gap:10px;align-items:flex-start;padding:9px 11px;border-radius:11px;border:1.5px dashed var(--jv-borda);transition:background .3s}
    .jv-q-item small{display:block;font-size:10.5px;color:var(--jv-sub);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .jv-q-item div div{font-size:13.5px;color:var(--jv-texto);margin-top:2px;line-height:1.35}.jv-q-item i{color:#A9A6B8;font-style:normal}
    .jv-q-cheio{border:1.5px solid transparent;background:var(--jv-lilas)}
    .jv-q-ic{width:18px;height:18px;flex:0 0 18px;margin-top:3px;border-radius:50%;border:1.5px dashed #C9C5D8;display:flex;align-items:center;justify-content:center;color:#FFFFFF}
    .jv-q-cheio .jv-q-ic{background:var(--jv-roxo);border:0}
    .jv-q-novo{animation:jv-novo 1.8s ease-out}@keyframes jv-novo{0%{background:rgba(103,61,230,0.3);transform:translateX(-8px)}25%{transform:none}100%{background:var(--jv-lilas)}}
    /* revisão em tela grande */
    #jv-rev:empty{display:none}
    .jv-rev-fundo{position:absolute;inset:0;z-index:30;background:rgba(23,23,26,0.42);backdrop-filter:blur(6px);display:flex;padding:18px;animation:jv-aparece .25s ease-out}@keyframes jv-aparece{from{opacity:0}to{opacity:1}}
    .jv-rev{flex:1;display:flex;flex-direction:column;min-height:0;border-radius:20px;background:var(--jv-card);box-shadow:0 30px 80px rgba(23,23,26,0.3);overflow:hidden;animation:jv-entra .3s ease-out}
    .jv-rev-topo{display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid var(--jv-borda)}
    .jv-rev-tit{flex:1;min-width:0}.jv-rev-tit b{display:block;font-family:'Space Grotesk',sans-serif;font-size:16px;color:var(--jv-texto)}.jv-rev-tit small{display:block;font-size:12px;color:var(--jv-sub);margin-top:2px}
    .jv-rev-marcar{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--jv-texto);cursor:pointer;white-space:nowrap}.jv-rev-marcar input{accent-color:var(--jv-roxo);width:16px;height:16px}
    .jv-rev-corpo{flex:1;display:flex;min-height:0}
    .jv-rev-palco{flex:1;min-width:0;position:relative;display:flex;align-items:center;justify-content:center;padding:18px;overflow:hidden;background:linear-gradient(160deg,#F7F5FE,#ECE7FB)}
    .jv-rev-quadro{position:relative;width:100%;height:100%;border-radius:12px;overflow:hidden;background:#FFFFFF;box-shadow:0 10px 34px rgba(23,23,26,0.14)}
    .jv-rev-palco.cel .jv-rev-quadro{width:390px;height:min(780px,100%);border-radius:30px;border:9px solid #17171A}
    .jv-rev-palco.midia .jv-rev-quadro{width:auto;height:auto;max-width:100%;border-radius:10px;background:transparent}
    .jv-rev-quadro iframe{width:100%;height:100%;border:0;display:block;max-width:none}
    .jv-rev-quadro img,.jv-rev-quadro video{display:block;max-width:100%;max-height:calc(100vh - 150px)}
    .jv-rev-camada{position:absolute;inset:0;cursor:crosshair;z-index:2}.jv-rev-camada.off{pointer-events:none;cursor:default}.jv-rev-camada.off .jv-pin,.jv-rev-camada.off .jv-pop{pointer-events:auto}
    .jv-pin{position:absolute;width:28px;height:28px;margin:-30px 0 0 -14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--jv-roxo);color:#FFFFFF;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(103,61,230,0.5);border:2px solid #FFFFFF;cursor:pointer;animation:jv-pino .35s cubic-bezier(.2,.9,.3,1.5)}
    .jv-pin b{transform:rotate(45deg);font-size:12px}.jv-pin.on{background:#17171A}@keyframes jv-pino{from{transform:rotate(-45deg) translate(0,-14px) scale(.4);opacity:0}to{transform:rotate(-45deg);opacity:1}}
    .jv-pop{position:absolute;width:280px;padding:12px;border-radius:14px;background:var(--jv-card);border:1px solid var(--jv-borda);box-shadow:0 16px 44px rgba(23,23,26,0.24);cursor:default;z-index:3;animation:jv-entra .2s ease-out}
    .jv-pop-t{font-size:12px;font-weight:700;color:var(--jv-texto);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jv-pop-t span{font-weight:500;color:var(--jv-sub)}
    .jv-pop textarea,.jv-rev-lado textarea{width:100%;box-sizing:border-box;min-height:70px;resize:vertical;padding:9px 11px;border-radius:10px;border:1px solid var(--jv-borda);font:inherit;font-size:13px;line-height:1.4;outline:none;color:var(--jv-texto);background:var(--jv-card)}
    .jv-pop textarea:focus,.jv-rev-lado textarea:focus{border-color:var(--jv-roxo);box-shadow:0 0 0 3px rgba(103,61,230,0.12)}
    .jv-pop-b{display:flex;gap:6px;margin-top:8px}.jv-pop-b .jv-b{height:32px}
    .jv-rev-lado{width:340px;flex:0 0 340px;border-left:1px solid var(--jv-borda);display:flex;flex-direction:column;padding:16px;gap:10px;min-height:0}
    .jv-rev-lt{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--jv-sub)}
    .jv-rev-lista{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;min-height:0}
    .jv-rev-item{display:flex;gap:10px;padding:10px 11px;border-radius:12px;background:var(--jv-lilas);cursor:pointer;border:1.5px solid transparent;animation:jv-entra .25s}.jv-rev-item.on{border-color:var(--jv-roxo);background:var(--jv-card)}
    .jv-rev-item>b{width:22px;height:22px;flex:0 0 22px;border-radius:50%;background:var(--jv-roxo);color:#FFFFFF;font-size:11.5px;display:flex;align-items:center;justify-content:center}
    .jv-rev-item small{display:block;font-size:11px;color:var(--jv-sub);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jv-rev-item div div{font-size:13px;color:var(--jv-texto);line-height:1.4}.jv-rev-item i{color:#A9A6B8;font-style:normal}
    .jv-rev-vazio{margin:auto 0;text-align:center;font-size:12.5px;line-height:1.5;color:var(--jv-sub);padding:10px}.jv-rev-vazio-ic{display:flex;justify-content:center;margin-bottom:14px}
    .jv-rev-botoes{display:flex;flex-direction:column;gap:8px}.jv-rev-botoes .jv-b{height:40px;flex:none}
    @media (max-width: 1100px){ #jv-palco.jv-estreito{ right:0 } #jv-paineis{ top:auto !important; bottom:110px; right:0 !important; padding:8px 12px 12px !important; max-height:calc(100vh - 240px) !important } .jv-painel{ width:min(400px,calc(100vw - 24px)) } #jv-paineis:not(.jv-todos) .jv-painel-min{ display:none } .jv-mais{ display:block } #jv-palco.jv-estreito #jv-legenda{ display:none } .jv-galeria img,.jv-galeria video{ max-height:42vh } }
    @media (max-width: 860px){ .jv-rev-fundo{ padding:0 } .jv-rev{ border-radius:0 } .jv-rev-corpo{ flex-direction:column } .jv-rev-lado{ width:auto; flex:0 0 auto; max-height:42%; border-left:0; border-top:1px solid var(--jv-borda) } .jv-rev-palco{ padding:8px } .jv-rev-palco.cel .jv-rev-quadro{ width:100%; border-width:0; border-radius:8px } .jv-dev-g b{ padding:0 8px } .jv-rev-tit small{ display:none } }
    .jv-tarefas{width:290px;display:flex;flex-direction:column;gap:6px}
    .jv-tar-tit{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--jv-roxo);padding-left:2px}
    .jv-tar{display:flex;align-items:flex-start;gap:9px;padding:9px 10px 9px 11px;border-radius:12px;background:var(--jv-card);border:1px solid var(--jv-borda);box-shadow:var(--jv-sombra);animation:jv-entra .35s ease-out}
    .jv-tar .jv-spin{margin-top:2px}
    .jv-tar-fim{opacity:.75}
    .jv-tar-fila{width:10px;height:10px;flex:0 0 10px;margin-top:3px;border-radius:50%;border:2px dashed var(--jv-sub)}
    .jv-tar-ico{width:12px;flex:0 0 12px;font-size:12px;font-weight:700;line-height:16px;text-align:center}
    .jv-tar-txt{font-size:12.5px;line-height:1.35;color:var(--jv-texto);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .jv-tar-meta{margin-top:2px;font-size:11px;color:var(--jv-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .jv-tar-x{flex:0 0 auto;margin:-2px -2px 0 0;width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--jv-sub);cursor:pointer}
    .jv-tar-x:hover{background:var(--jv-lilas);color:var(--jv-roxo)}
    @media (max-width: 860px){ .jv-tarefas{ width:200px } .jv-tar-meta{ display:none } }
    @media (max-width: 860px){ .jv-card{ width:136px; padding:7px 8px } .jv-papel,.jv-il{ display:none } .jv-fonte{ display:none } .jv-balao{ max-width:150px } }
  `;
  function pagina(){
    const nome = typeof mePrimeiroNome === "function" ? mePrimeiroNome() : "";
    return `<div id="jv-root" style="position:relative;height:100vh;min-height:560px;overflow:hidden;background:var(--jv-fundo);color:var(--jv-texto);font-family:Inter,sans-serif">
      <style>${CSS}</style>
      <canvas id="jv-fundo" style="position:absolute;inset:0;width:100%;height:100%;max-width:none"></canvas>
      <div style="position:absolute;left:24px;top:20px;z-index:5"><div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;letter-spacing:.08em;color:var(--jv-roxo)">ZEUS</div><div style="font-size:12px;color:var(--jv-sub)">${nome ? "Olá, " + e(nome) + ". " : ""}O ZEUS e o time, por voz.</div></div>
      <div id="jv-palco" class="${J.paineis.length ? "jv-estreito" : ""}">
      <div id="jv-cena" style="position:absolute;left:0;right:0;top:0;bottom:120px">${cenaHTML()}</div>
      <div style="position:absolute;left:0;right:0;top:0;bottom:120px;pointer-events:none;z-index:4">${orbHTML()}</div>
      <div id="jv-status" style="position:absolute;left:50%;top:calc(50% + 112px);transform:translateX(-50%);z-index:5;font-size:11.5px;font-weight:700;letter-spacing:.08em;color:var(--jv-roxo);text-transform:uppercase;white-space:nowrap;padding:5px 14px;border-radius:20px;background:var(--jv-card);border:1px solid var(--jv-borda);box-shadow:var(--jv-sombra)">${e(statusTxt())}</div>
      <div id="jv-legenda" style="position:absolute;left:50%;bottom:132px;transform:translateX(-50%);z-index:6;text-align:center;width:min(820px,calc(100% - 32px))">${legendaHTML()}</div>
      </div>
      <div id="jv-paineis" style="position:absolute;right:0;top:4px;z-index:6;display:flex;flex-direction:column;gap:12px;max-height:calc(100vh - 110px);overflow-y:auto;padding:20px 20px 64px 48px;scrollbar-width:none"></div>
      <div id="jv-tarefas" style="position:absolute;left:24px;bottom:96px;z-index:6">${tarefasHTML()}</div>
      <div id="jv-hist-box">${historicoHTML()}</div>
      <div id="jv-controles" style="position:absolute;left:0;right:0;bottom:22px;z-index:7">${controlesHTML()}</div>
      <div id="jv-rev"></div>
    </div>`;
  }
  // pinturas parciais (não recriar o canvas nem a cena inteira a cada evento)
  const porId = id => document.getElementById(id);
  function pintarCena(){ const c = porId("jv-cena"); if(c) c.innerHTML = cenaHTML(); } // o orbe fica fora: a foto e o anel não piscam
  function pintarStatus(){ const s = porId("jv-status"); if(s) s.textContent = statusTxt(); }
  function pintarLegenda(){ const l = porId("jv-legenda"); if(l) l.innerHTML = legendaHTML(); }
  function pintar(){
    if(!porId("jv-root")) return;
    pintarStatus(); pintarLegenda(); pintarCena(); const tb = porId("jv-tarefas"); if(tb) tb.innerHTML = tarefasHTML();
    pintarPaineis(); // só redesenha o painel que mudou (senão os números recomeçam a contar e o site recarrega)
    const h = porId("jv-hist-box"); if(h) h.innerHTML = historicoHTML();
    const k = porId("jv-controles"); if(k){ const foco = document.activeElement && document.activeElement.dataset && "jvTexto" in document.activeElement.dataset; const v = foco ? document.activeElement.value : null; k.innerHTML = controlesHTML(); if(foco){ const i = k.querySelector("[data-jv-texto]"); i.value = v; i.focus(); } }
    ligar();
  }
  function ligar(){
    const r = porId("jv-root"); if(!r) return;
    const um = (sel, ev, fn) => r.querySelectorAll(sel).forEach(el => { if(!el["_jv" + ev]){ el["_jv" + ev] = 1; el.addEventListener(ev, fn); } });
    um("[data-jv-mic]", "click", () => ouvir());
    um("[data-jv-parar]", "click", () => { pararFala(); pararGravacao(); const t = J.tarefas.find(x => x.esperando); if(t && J.fase === "pensando") cancelarTarefa(t.id); J.legenda = ""; set("fase", "ocioso"); });
    um("[data-jv-cancelar]", "click", ev => { ev.stopPropagation(); cancelarTarefa(ev.currentTarget.dataset.jvCancelar); });
    um("[data-jv-continuo]", "change", ev => { J.continuo = ev.target.checked; });
    um("[data-jv-form]", "submit", ev => { ev.preventDefault(); const i = ev.target.querySelector("[data-jv-texto]"); const t = i.value; i.value = ""; if(J.fase === "ocioso") enviar(t); });
    um("[data-jv-hist]", "click", () => set("verHistorico", !J.verHistorico));
    um("[data-jv-conversar]", "click", () => conversar());
    um("[data-jv-mudo]", "click", () => { J.mudo = !J.mudo; try { J.conv.setMicMuted(J.mudo); } catch(err){} pintar(); });
    um("[data-jv-modo]", "click", () => { if(J.conv) return; J.modo = J.modo === "tempo-real" ? "botao" : "tempo-real"; J.fase = "ocioso"; pintar(); });
    um("[data-jv-fechar]", "click", ev => { ev.stopPropagation(); const id = ev.currentTarget.dataset.jvFechar; J.paineis = J.paineis.filter(p => p.id !== id); pintar(); });
    um("[data-jv-abrir]", "click", ev => { if(!ev.currentTarget.classList.contains("jv-painel-min")) return; const p = J.paineis.find(x => x.id === ev.currentTarget.dataset.jvAbrir); if(!p) return; topo(p); pintar(); });
    um("[data-jv-dev]", "click", ev => { ev.stopPropagation(); const [id, d] = ev.currentTarget.dataset.jvDev.split(":"), p = J.paineis.find(x => x.id === id); if(!p || p.dev === d) return; p.dev = d; mexeu(p); pintarPaineis(); ligar(); });
    um("[data-jv-revisar]", "click", ev => { if(ev.currentTarget.closest(".jv-painel-min")) return; ev.stopPropagation(); abrirRevisao(ev.currentTarget.dataset.jvRevisar); });
    um("[data-jv-aprovar]", "click", ev => { ev.stopPropagation(); aprovar(ev.currentTarget.dataset.jvAprovar); });
    um("[data-jv-gal]", "click", ev => { ev.stopPropagation(); const [id, d] = ev.currentTarget.dataset.jvGal.split(":"), p = J.paineis.find(x => x.id === id); if(!p) return; const n = (p.b.d.imagens || []).length; p.idx = ((p.idx || 0) + +d + n) % n; mexeu(p); pintarPaineis(); ligar(); });
    um("[data-jv-galir]", "click", ev => { ev.stopPropagation(); const [id, k] = ev.currentTarget.dataset.jvGalir.split(":"), p = J.paineis.find(x => x.id === id); if(!p) return; p.idx = +k; mexeu(p); pintarPaineis(); ligar(); });
    um("[data-jv-q-enviar]", "click", ev => { ev.stopPropagation(); const p = J.paineis.find(x => x.id === ev.currentTarget.dataset.jvQEnviar); if(!p) return; if(enviarAoZeus(quadroTexto(p), "Briefing \"" + (p.b.d.titulo || "") + "\" enviado pela tela")){ p.enviado = true; mexeu(p); pintar(); } });
    um("iframe[data-jv-if]", "load", ev => { const c = ev.currentTarget.previousElementSibling; if(c) c.classList.add("ok"); });
  }

  // ─── animação: partículas e anel que reage ao áudio ──────────────────────────
  function animar(){
    const fundo = porId("jv-fundo"); if(!fundo){ cancelAnimationFrame(J.raf); J.raf = null; if(J.conv){ try { J.conv.endSession(); } catch(err){} } return; }
    const W = fundo.clientWidth, H = fundo.clientHeight; if(fundo.width !== W) fundo.width = W; if(fundo.height !== H) fundo.height = H;
    const g = fundo.getContext("2d"); g.clearRect(0, 0, W, H);
    if(!J.particulas) J.particulas = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: 0.0002 + Math.random() * 0.0006, r: Math.random() * 1.6 + 0.3, a: Math.random() * 0.6 + 0.2 }));
    const cor = (getComputedStyle(porId("jv-root")).getPropertyValue("--jv-particula") || "103,61,230").trim();
    J.particulas.forEach(p => { p.y -= p.v; if(p.y < 0) { p.y = 1; p.x = Math.random(); } g.fillStyle = `rgba(${cor},${p.a * 0.45})`; g.beginPath(); g.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2); g.fill(); });
    const anel = porId("jv-anel");
    if(anel){
      const c = anel.getContext("2d"), S = anel.width, R = S * 0.36; c.clearRect(0, 0, S, S); c.save(); c.translate(S / 2, S / 2);
      let dados = null;
      if(J.conv){ try { dados = J.fase === "falando" ? J.conv.getOutputByteFrequencyData() : J.conv.getInputByteFrequencyData(); } catch(err){} }
      else if(J.analyser){ dados = new Uint8Array(J.analyser.frequencyBinCount); J.analyser.getByteFrequencyData(dados); }
      const n = 72, t = Date.now() / 1000;
      for(let i = 0; i < n; i++){
        const v = dados ? dados[Math.floor(i % (n / 2) * dados.length / (n / 2))] / 255 : (J.fase === "pensando" ? 0.25 + 0.2 * Math.sin(t * 4 + i * 0.5) : 0.08 + 0.05 * Math.sin(t * 1.5 + i * 0.3));
        const ang = i / n * Math.PI * 2 - Math.PI / 2, len = 8 + v * 70;
        c.strokeStyle = `rgba(${Math.round(103 + v * 60)},${Math.round(61 + v * 60)},${Math.round(230 + v * 25)},${0.35 + v * 0.65})`; c.lineWidth = 5; c.lineCap = "round";
        c.beginPath(); c.moveTo(Math.cos(ang) * R, Math.sin(ang) * R); c.lineTo(Math.cos(ang) * (R + len), Math.sin(ang) * (R + len)); c.stroke();
      }
      c.restore();
    }
    // apaga o "trabalhando/pronto" depois de um tempo e as fontes que já esfriaram
    const agora = Date.now(); let mudou = false;
    Object.keys(J.trabalho).forEach(k => { const w = J.trabalho[k]; if(w.estado === "pronto" && agora - w.em > 25000){ delete J.trabalho[k]; mudou = true; }
      else if(w.estado === "pronto" && !w.entregue && agora - w.em > 3500){ w.entregue = true; mudou = true; } });
    Object.keys(J.fontes).forEach(k => { if(agora - J.fontes[k] > 9000){ delete J.fontes[k]; mudou = true; } });
    if(mudou) pintarCena();
    if(J.tarefas.length && agora - (J.tarT || 0) > 1000){ J.tarT = agora; const tb = porId("jv-tarefas"); if(tb){ const h = tarefasHTML(); if(tb.innerHTML !== h){ tb.innerHTML = h; ligar(); } } }
    J.raf = requestAnimationFrame(animar);
  }

  // Para testes e demonstração: simula os mesmos eventos do chat (acao/done) sem rodar o ZEUS
  window.__jarvisSimular = function(quem, tipo, label){ if(tipo === "painel"){ addBloco(label, quem || "ZEUS"); pintar(); return; } if(tipo === "entrega"){ receberEntrega(label); return; } if(tipo === "quadro"){ quadro(label); return; } if(tipo === "resposta"){ blocos(label).forEach(b => addBloco(b, quem || "ZEUS")); pintar(); return; } if(tipo === "fim"){ const agora = Date.now(); Object.keys(J.trabalho).forEach(k => { J.trabalho[k] = Object.assign({}, J.trabalho[k], { estado: "pronto", em: agora, entregue: false }); }); pintarCena(); return; } acender({ quem, tipo: tipo || "agente", label }); };
  document.addEventListener("keydown", ev => { if(ev.key !== "Escape" || !J.rev || !porId("jv-rev")) return; if(J.rev.edit != null) salvarPin(); else fecharRevisao(); });
  window.addEventListener("resize", () => { const b = porId("jv-paineis"); if(b) ajustarEscala(b); });
  RENDERERS.jarvis = function(){
    setTimeout(() => { pintarPaineis(); ligar(); if(J.rev) pintarRevisao(); if(!J.raf) J.raf = requestAnimationFrame(animar); }, 0);
    return pagina();
  };
  if(state.screen === "jarvis"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = RENDERERS.jarvis(); }
})();
