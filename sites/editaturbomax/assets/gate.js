// EDITA TURBO MAX — GATE VSL
// Vídeo travado, barra de progresso custom, libera página faltando 2min pro fim.
// Jeff: substituir os PLACEHOLDER abaixo quando os links chegarem.

const GATE_CONFIG = {
  youtubeId:        'XsVATMbnkQA',                           // https://youtu.be/XsVATMbnkQA
  whatsappGroupUrl: 'https://chat.whatsapp.com/GF5q3TlqJJiGjvw2zeO06U?s=sh&p=i&mlu=4&amv=2', // link do grupo
  ctaLabel:         'Entrar no grupo agora',
  unlockBeforeEndSec: 120,                                    // 2 minutos
  unlockAfterSec: 600,                                        // libera aos 10 min de vídeo (mesmo acelerado)
  fastPhaseVideoRatio: 0.2,   // até 20% do vídeo real, barra vai a 50%
  storageKey: 'etm_gate_state_v1'
};

(function(){
  const $ = (id) => document.getElementById(id);
  const gate       = $('gate');
  const btnPlay    = $('btnPlay');
  const shield     = $('gateShield');
  const resume     = $('gateResume');
  const btnCont    = $('btnContinue');
  const btnRestart = $('btnRestart');
  const fallback   = $('gateFallback');
  const progWrap   = $('gateProgress');
  const progFill   = $('gateProgressFill');
  const cta        = $('gateCta');
  const ctaLink    = $('gateCtaLink');
  const pageContent= $('pageContent');
  const topbar     = $('topbar');
  const controls   = $('gateControls');
  const btnPause   = $('btnPause');
  const icoPause   = btnPause ? btnPause.querySelector('.ico-pause') : null;
  const icoPlay    = btnPause ? btnPause.querySelector('.ico-play') : null;
  const lblPause   = btnPause ? btnPause.querySelector('.lbl-pause') : null;
  const lblPlay    = btnPause ? btnPause.querySelector('.lbl-play') : null;
  const speedBtns  = document.querySelectorAll('.gate-speed-btn');

  // Configurar CTA
  ctaLink.href = GATE_CONFIG.whatsappGroupUrl;
  ctaLink.innerHTML = GATE_CONFIG.ctaLabel + ' <span class="arrow">→</span>';

  // Se placeholders ainda não trocados: libera a página normalmente e some com o gate.
  const hasVideo = GATE_CONFIG.youtubeId && GATE_CONFIG.youtubeId !== 'PLACEHOLDER_YT_ID';
  if(!hasVideo){
    gate.style.display = 'none';
    pageContent.classList.add('page-open');
    return;
  }

  // Modo teste: ?test=unlock na URL destrava direto (pra Jeff testar)
  const params = new URLSearchParams(window.location.search);
  if(params.has('test') && params.get('test') === 'unlock'){
    gate.style.display = 'none';
    pageContent.classList.add('page-open');
    if(topbar){
      topbar.classList.remove('topbar-hidden');
      topbar.classList.add('topbar-visible');
    }
    return;
  }

  let player = null;
  let duration = 0;
  let unlocked = false;
  let ticker = null;

  // === State (localStorage) ===
  function loadState(){
    try { return JSON.parse(localStorage.getItem(GATE_CONFIG.storageKey) || '{}'); }
    catch(_){ return {}; }
  }
  function saveState(patch){
    const cur = loadState();
    const next = Object.assign(cur, patch);
    try { localStorage.setItem(GATE_CONFIG.storageKey, JSON.stringify(next)); } catch(_){}
  }
  function clearState(){
    try { localStorage.removeItem(GATE_CONFIG.storageKey); } catch(_){}
  }

  // === Carrega YouTube IFrame API ===
  (function loadYT(){
    if(window.YT && window.YT.Player){ initPlayer(); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
  })();

  function initPlayer(){
    player = new YT.Player('ytplayer', {
      videoId: GATE_CONFIG.youtubeId,
      playerVars: {
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        showinfo: 0,
        cc_load_policy: 0,
        origin: window.location.origin
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange
      }
    });
  }

  function onPlayerReady(){
    duration = player.getDuration() || 0;
    const saved = loadState();

    // Se já foi liberado antes, libera direto
    if(saved.unlocked){
      unlockPage(true);
    }

    // Se tem posição salva > 5s, mostrar tela de resume
    if(saved.time && saved.time > 5 && duration && saved.time < duration - 3){
      btnPlay.hidden = true;
      resume.hidden = false;
    }
  }

  function onPlayerStateChange(ev){
    // 1 = playing, 2 = paused, 0 = ended
    if(ev.data === YT.PlayerState.PLAYING){
      btnPlay.hidden = true;
      resume.hidden = true;
      if(!duration) duration = player.getDuration() || 0;
      progWrap.hidden = false;
      if(controls) controls.hidden = false;
      if(shield) shield.style.cursor = 'pointer';
      setPauseUI(false);
      startTicker();
    } else if(ev.data === YT.PlayerState.ENDED){
      stopTicker();
      unlockPage(true);
      setProgressPct(1);
      setPauseUI(false);
      if(shield) shield.style.cursor = 'default';
    } else if(ev.data === YT.PlayerState.PAUSED){
      setPauseUI(true);
    }
  }

  function startTicker(){
    if(ticker) return;
    ticker = setInterval(tick, 400);
  }
  function stopTicker(){
    if(ticker){ clearInterval(ticker); ticker = null; }
  }

  function tick(){
    if(!player || !duration) return;
    const t = player.getCurrentTime() || 0;
    const real = Math.max(0, Math.min(1, t / duration));

    // Salva posição pra retomar
    saveState({ time: t });

    // Mapeamento fast→slow
    const knee = GATE_CONFIG.fastPhaseVideoRatio; // ex 0.2
    let disp;
    if(real < knee){
      disp = (real / knee) * 0.5;
    } else {
      disp = 0.5 + ((real - knee) / (1 - knee)) * 0.5;
    }
    setProgressPct(disp);

    // Libera página faltando N segundos OU após N segundos assistidos
    const remaining = duration - t;
    if(!unlocked && (remaining <= GATE_CONFIG.unlockBeforeEndSec || t >= GATE_CONFIG.unlockAfterSec)){
      unlockPage(true);
    }
  }

  function setPauseUI(isPaused){
    if(!btnPause) return;
    if(isPaused){
      if(icoPause) icoPause.hidden = true;
      if(icoPlay)  icoPlay.hidden  = false;
      if(lblPause) lblPause.hidden = true;
      if(lblPlay)  lblPlay.hidden  = false;
      btnPause.setAttribute('aria-label','Continuar vídeo');
    } else {
      if(icoPause) icoPause.hidden = false;
      if(icoPlay)  icoPlay.hidden  = true;
      if(lblPause) lblPause.hidden = false;
      if(lblPlay)  lblPlay.hidden  = true;
      btnPause.setAttribute('aria-label','Pausar vídeo');
    }
  }

  function setProgressPct(p){
    progFill.style.width = (p * 100).toFixed(2) + '%';
  }

  function unlockPage(persist){
    if(unlocked) return;
    unlocked = true;
    if(persist) saveState({ unlocked: true });
    // Libera scroll da página
    pageContent.classList.add('page-open');
    // CTA aparece
    cta.hidden = false;
    // Topbar aparece (remove classe hidden e adiciona fade-in)
    if(topbar){
      topbar.classList.remove('topbar-hidden');
      topbar.classList.add('topbar-visible');
    }
    // Gate deixa de ser fixed pra virar seção normal no topo
    gate.classList.add('gate-unlocked');
    // Rola pro topo (opcional) — comentado pra não atropelar quem tá vendo o vídeo
  }

  function togglePause(){
    if(!player) return;
    try {
      const st = player.getPlayerState();
      if(st === YT.PlayerState.PLAYING){
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    } catch(_){}
  }

  // === Botão play (proxy) ===
  btnPlay.addEventListener('click', () => {
    if(!player) return;
    try { player.playVideo(); } catch(_){}
  });

  // === Clicar no vídeo pausa/retoma (shield intercepta cliques) ===
  if(shield){
    shield.addEventListener('click', () => {
      if(!player) return;
      const st = player.getPlayerState ? player.getPlayerState() : -1;
      if(st === YT.PlayerState.PLAYING || st === YT.PlayerState.PAUSED){
        togglePause();
      }
    });
  }

  // === Pause / Continue ===
  if(btnPause){
    btnPause.addEventListener('click', togglePause);
  }

  // === Velocidade (1x / 1.5x / 2x) ===
  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const rate = parseFloat(btn.dataset.rate);
      if(!player || !rate) return;
      try { player.setPlaybackRate(rate); } catch(_){}
      speedBtns.forEach(b => b.classList.toggle('is-active', b === btn));
    });
  });

  // === Resume ===
  btnCont.addEventListener('click', () => {
    if(!player) return;
    const saved = loadState();
    resume.hidden = true;
    try {
      if(saved.time) player.seekTo(saved.time, true);
      player.playVideo();
    } catch(_){}
  });
  btnRestart.addEventListener('click', () => {
    if(!player) return;
    resume.hidden = true;
    clearState();
    try {
      player.seekTo(0, true);
      player.playVideo();
    } catch(_){}
  });

  // Ao sair da aba/página, garantir posição salva
  document.addEventListener('visibilitychange', () => {
    if(document.hidden && player && player.getCurrentTime){
      try { saveState({ time: player.getCurrentTime() }); } catch(_){}
    }
  });
  window.addEventListener('beforeunload', () => {
    if(player && player.getCurrentTime){
      try { saveState({ time: player.getCurrentTime() }); } catch(_){}
    }
  });
})();
