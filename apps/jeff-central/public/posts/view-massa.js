// Tela "Publicação em massa" (campanhas) do painel do Agente Posts.
// Reescrita do antigo bulk.html do Automatik Inst no design system claro da Central.
// Backend: jeff-automatikinst/routes/bulk.js (via proxy /zeuspost/api da Central).
(function () {
  const { api, ui, fmt, e, icon } = ZP;

  const API_BASE = '/zeuspost/api';
  // URI de retorno do OAuth do Drive: é a que o server.js do Automatik usa de fato
  // (fixa no código, em /oauth/drive/start e /oauth/drive/callback; PUBLIC_BASE_URL não entra nela).
  const DRIVE_CALLBACK = 'https://zeus-post.jefersonhenrike.com/oauth/drive/callback';
  const OAUTH_START = '/zeuspost/oauth/drive/start';

  const FORMATOS = {
    video: { curto: 'Reels', nome: 'Vídeo (Reels)', ic: 'video', desc: 'Cada vídeo vira um Reels.', accept: 'video/*' },
    image: { curto: 'Imagem', nome: 'Imagem única', ic: 'image', desc: 'Cada imagem vira um post no feed.', accept: 'image/*' },
    carousel: { curto: 'Carrossel', nome: 'Carrossel', ic: 'layers', desc: 'Grupos de 2 a 10 lâminas por post.', accept: 'image/*,video/*' },
    story: { curto: 'Stories', nome: 'Stories', ic: 'story', desc: 'Imagem ou vídeo de até 60s, sem legenda.', accept: 'image/*,video/*' },
  };
  const CAMP_STATUS = { draft: ['Rascunho', ''], scheduled: ['Programada', 'b-amber'], active: ['Ativa', 'b-green'], paused: ['Pausada', ''], completed: ['Concluída', 'b-blue'] };
  const ITEM_STATUS = { pending: ['Agendado', 'b-amber'], processing: ['Publicando', 'b-blue'], published: ['Publicado', 'b-green'], failed: ['Falhou', 'b-red'] };
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  // espelho de lib/limits.js (a validação de verdade continua no servidor)
  const LIMITES = { feed: { max: 25, minInt: 0 }, story: { max: 20, minInt: 0 } };
  const PASSOS = ['Formato', 'Mídias', 'Contas', 'Agenda', 'Legendas', 'Revisão'];

  // ─── CSS mínimo que o posts.css não cobre ──────────────────────────────────
  function injectCss() {
    if (document.getElementById('mz-css')) return;
    const st = document.createElement('style'); st.id = 'mz-css';
    st.textContent = `
.mz-steps{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}
.mz-step{display:flex;align-items:center;gap:8px;padding:6px 13px 6px 7px;border:1px solid var(--line);border-radius:20px;background:#fff;font-size:12.5px;color:var(--mute);cursor:pointer}
.mz-step b{width:21px;height:21px;border-radius:50%;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.mz-step.on{border-color:var(--amber-line);color:var(--ink);font-weight:600}.mz-step.on b{background:var(--amber);color:#fff}
.mz-step.done b{background:var(--green-bg);color:var(--green)}
.mz-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.mz-opt{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff;cursor:pointer;transition:border-color .15s,background .15s}
.mz-opt:hover{border-color:#CFCFD6}.mz-opt.on{border-color:var(--amber-line);background:rgba(103,61,230,0.05)}
.mz-opt .i{width:36px;height:36px;flex:0 0 36px;border-radius:10px;background:var(--soft);display:flex;align-items:center;justify-content:center;color:var(--ink-2)}
.mz-opt.on .i{background:var(--amber-bg);color:var(--amber)}
.mz-opt strong{display:block;font-size:13.5px;font-weight:600;margin-bottom:2px}.mz-opt span{font-size:12px;color:var(--mute);line-height:1.4}
.mz-chips{display:flex;flex-wrap:wrap;gap:8px}
.mz-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line-2);border-radius:10px;padding:4px 5px 4px 10px;background:#fff;font-size:12.5px;color:var(--mute)}
.mz-chip input{border:0;outline:0;font:inherit;font-size:13px;color:var(--ink);background:transparent;padding:3px 0}
.mz-chip button{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--mute)}.mz-chip button:hover{background:var(--soft);color:var(--red)}
.mz-day{padding:6px 13px;border:1px solid var(--line-2);border-radius:8px;font-size:12.5px;font-weight:500;cursor:pointer;background:#fff;color:var(--ink-2);user-select:none}
.mz-day.on{border-color:rgba(192,52,28,0.4);background:var(--red-bg);color:var(--red);font-weight:600}
.mz-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.mz-g{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff;display:flex;flex-direction:column;min-width:0}
.mz-ph{position:relative;aspect-ratio:1;background:var(--soft);display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;color:var(--mute);font-size:10.5px;overflow:hidden}
.mz-ph[data-play]{cursor:pointer}
.mz-ph img,.mz-ph video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mz-ph .n{position:absolute;top:6px;left:6px;z-index:1;width:20px;height:20px;border-radius:50%;background:#fff;color:var(--ink);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.mz-g .b{padding:8px 10px;flex:1;font-size:11.5px;min-width:0}
.mz-g .f{border-top:1px solid var(--soft);padding:6px;display:flex;justify-content:center;gap:4px;font-size:11px;color:var(--mute)}
.mz-menu{position:relative}
.mz-pop{position:absolute;right:0;top:36px;z-index:20;min-width:230px;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 34px rgba(23,23,26,0.14);padding:6px}
.mz-pop button{display:flex;gap:9px;align-items:center;width:100%;padding:8px 10px;border-radius:8px;font-size:13px;text-align:left;color:var(--ink-2)}
.mz-pop button:hover{background:var(--soft)}.mz-pop button.d{color:var(--red)}
.mz-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--softer);margin-bottom:16px}
.mz-stats .l{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--mute);font-weight:700;margin-bottom:4px}
.mz-stats .v{font-family:var(--head);font-size:17px;font-weight:600}
.mz-log{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.6;background:var(--softer);border:1px solid var(--line);border-radius:10px;padding:10px 12px;max-height:300px;overflow:auto;white-space:pre-wrap;word-break:break-word}
.mz-sec{margin:22px 0 10px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:700}
.mz-camp{margin-bottom:14px}
.mz-files{max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff}
.mz-guide ol{margin:8px 0 0;padding-left:20px;line-height:1.65;font-size:13px;color:var(--ink-2)}
.mz-guide code{background:var(--soft);padding:1px 6px;border-radius:5px;font-size:12px}
details.mz-d>summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--ink-2);padding:6px 0}`;
    document.head.appendChild(st);
  }

  // ─── utilitários ───────────────────────────────────────────────────────────
  const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : (d || 0); };
  const parseJson = (v, d) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v || ''); } catch (_) { return d; } };
  const normHM = (t) => { const s = String(t || '').trim(); if (/^\d{1,2}$/.test(s)) return s.padStart(2, '0') + ':00'; const m = s.match(/^(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };
  const hmMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const mb = (b) => ((Number(b) || 0) / 1048576).toFixed(1).replace('.', ',') + ' MB';
  const isVideo = (m) => String((m && (m.mimeType || m.mimetype)) || '').startsWith('video') || /\.(mp4|mov|m4v|webm)(\?|$)/i.test((m && m.url) || '');
  const ymdBr = (s) => { const p = String(s || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : (s || '-'); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const pendentes = (c) => Math.max(0, (c.total_items || 0) - (c.published_count || 0) - (c.failed_count || 0));
  const statusDe = (c) => (c.status === 'active' && c.total_items > 0 && pendentes(c) === 0) ? 'completed' : c.status;
  const campBadge = (s) => { const x = CAMP_STATUS[s] || [s || '-', '']; return `<span class="badge ${x[1]}">${e(x[0])}</span>`; };
  const itemBadge = (s) => { const x = ITEM_STATUS[s] || [s || '-', '']; return `<span class="badge ${x[1]}">${e(x[0])}</span>`; };
  const fmtTag = (f) => { const x = FORMATOS[f] || { curto: f, ic: 'image' }; return `<span class="tag">${icon(x.ic, 12)}${e(x.curto)}</span>`; };
  const err = (ex) => ui.toast((ex && ex.message) || 'Algo deu errado', 'err');

  function copiar(texto, inputEl) {
    const ok = () => ui.toast('Copiado', 'ok');
    const viaInput = () => { try { inputEl.select(); document.execCommand('copy'); ok(); } catch (_) { ui.toast('Selecione e copie manualmente', 'err'); } };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(ok, viaInput); else viaInput();
  }

  // Bloqueios: mesma regra de lib/bulk.js isSuspended (data e hora locais)
  function bloqueado(dt, s) {
    if (!s) return false;
    if ((s.excluded_weekdays || []).includes(dt.getDay())) return true;
    const ymd = fmt.ymd(dt);
    for (const r of s.date_ranges || []) if (r && r.from && r.to && ymd >= r.from && ymd <= r.to) return true;
    const now = dt.getHours() * 60 + dt.getMinutes();
    for (const w of s.time_windows || []) {
      if (!w || !w.from || !w.to) continue;
      const a = hmMin(w.from), b = hmMin(w.to); if (a === b) continue;
      if (a < b ? (now >= a && now < b) : (now >= a || now < b)) return true;
    }
    return false;
  }
  // Grade de horários igual à de lib/bulk.js buildSlots, sem a variação aleatória (que só o servidor sorteia)
  function montarGrade(cfg) {
    const slots = [], times = cfg.times || [];
    if (!times.length || !cfg.start_date) return slots;
    const burst = cfg.format === 'story' ? Math.max(1, int(cfg.story.stories_per_burst, 1)) : 1;
    const gap = (int(cfg.story.burst_interval_minutes, 3) || 3) * 60;
    for (let d = 0; d < cfg.total_days; d++) for (let t = 0; t < cfg.posts_per_day; t++) {
      const [hh, mm] = times[t % times.length].split(':').map(Number);
      const dt = new Date(cfg.start_date + 'T00:00:00'); dt.setDate(dt.getDate() + d); dt.setHours(hh, mm || 0, 0, 0);
      if (bloqueado(dt, cfg.suspensions)) continue;
      for (let b = 0; b < burst; b++) slots.push(Math.floor(dt.getTime() / 1000) + b * gap);
    }
    return slots.sort((a, b) => a - b);
  }
  // Trava de volume: espelha validateCampaignLimits. Devolve HTML pronto (só texto fixo e números).
  function checarLimites(cfg) {
    const story = cfg.format === 'story', L = story ? LIMITES.story : LIMITES.feed, v = [];
    const pd = int(cfg.posts_per_day), burst = story ? Math.max(1, int(cfg.story.stories_per_burst, 1)) : 1;
    const gapSeq = story ? int(cfg.story.burst_interval_minutes, 3) : 0, mirror = !story && !!cfg.story.mirror_to_story;
    const total = pd * burst * (mirror ? 2 : 1), times = cfg.times || [];
    if (total > L.max) {
      const conta = mirror ? `${pd} no feed + ${pd} em stories = ${total}` : (burst > 1 ? `${pd} x ${burst} = ${total}` : String(total));
      v.push(`O Instagram aceita com segurança no máximo <strong>${L.max} ${story ? 'stories' : 'publicações'} por dia</strong> por conta via API (você configurou <strong>${conta}</strong>). Acima disso a Meta bloqueia a publicação ou marca a conta como spam.${mirror ? ' O espelhamento nos Stories dobra o volume: reduza os posts por dia pela metade.' : ''}`);
    }
    if (pd > times.length) v.push(`Você configurou <strong>${pd} ${story ? 'sequências' : 'posts'} por dia</strong> mas só definiu <strong>${times.length} horário(s)</strong>. Adicione um horário para cada publicação do dia: horários repetidos caem no mesmo minuto.`);
    const span = story ? (burst - 1) * gapSeq : 0, need = L.minInt + span;
    const mins = times.map(hmMin).sort((a, b) => a - b);
    for (let i = 1; i < mins.length; i++) if (mins[i] - mins[i - 1] < need) {
      v.push(`Intervalo mínimo entre horários: <strong>${need} minutos</strong>${span ? ` (a sequência de ${burst} stories ocupa ${span} min)` : ''}. Há horários com apenas <strong>${mins[i] - mins[i - 1]} min</strong> de diferença, e a variação de ±${int(cfg.jitter_minutes, 5)} min pode aproximar ainda mais.`);
      break;
    }
    return v;
  }
  function modalLimites(v) {
    ui.modal({ title: 'Limite de segurança da plataforma', body: `<p class="sub" style="margin-bottom:14px">Nada foi enviado. Ajuste a configuração: estes limites protegem as contas contra bloqueio e marcação de spam pela API do Instagram.</p>${v.map((x) => ui.note('err', x, 'shield')).join('')}`, actions: [{ label: 'Entendi, vou ajustar', kind: 'pri' }] });
  }

  // carrega miniaturas só quando aparecem na tela (uma galeria pode ter mais de 100 vídeos)
  function lazyMedia(root) {
    const els = root.querySelectorAll('.mz-ph[data-src]'); if (!els.length) return;
    const load = (ph) => {
      const src = ph.dataset.src; ph.removeAttribute('data-src');
      const m = document.createElement(ph.dataset.vid === '1' ? 'video' : 'img');
      if (m.tagName === 'VIDEO') { m.muted = true; m.preload = 'metadata'; m.playsInline = true; } else m.loading = 'lazy';
      m.onerror = () => m.remove(); m.src = src; ph.appendChild(m);
    };
    if (!('IntersectionObserver' in window)) { els.forEach(load); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); load(en.target); } }), { rootMargin: '200px' });
    els.forEach((x) => io.observe(x));
  }
  function thumbHtml(m, formato, comPrevia, extra) {
    const vid = isVideo(m), url = comPrevia && m.url ? ZP.safeUrl(m.url) : '';
    return `<div class="mz-ph" ${url ? `data-src="${url}" data-vid="${vid ? 1 : 0}" data-play="${url}"` : ''}>${icon(vid ? 'video' : formato === 'carousel' ? 'layers' : 'image', 22)}${!m.url && m.source === 'drive' ? '<span>no Google Drive</span>' : ''}${extra || ''}</div>`;
  }
  function abrirPlayer(url, vid) {
    const u = ZP.safeUrl(url); if (!u) return;
    ui.modal({ title: 'Prévia da mídia', wide: true, body: `<div class="preview">${vid ? `<video src="${u}" controls autoplay playsinline></video>` : `<img src="${u}" alt="">`}</div>` });
  }
  function ligarPlayer(root) {
    root.addEventListener('click', (ev) => { const ph = ev.target.closest('.mz-ph[data-play]'); if (ph) abrirPlayer(ph.dataset.play, ph.dataset.vid === '1'); });
  }

  // envio em lote com progresso (ZP.api.form não informa progresso, por isso XHR)
  function enviarArquivos(files, onPct) {
    const xhr = new XMLHttpRequest(), fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    const promise = new Promise((res, rej) => {
      xhr.open('POST', API_BASE + '/bulk/upload-batch');
      xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) onPct(Math.round(ev.loaded / ev.total * 100)); };
      xhr.onload = () => {
        let j = null; try { j = JSON.parse(xhr.responseText); } catch (_) {}
        if (!j) return rej(new Error(xhr.status === 413 ? 'Arquivo grande demais para o servidor.' : 'Resposta inesperada do servidor (erro ' + xhr.status + '). Se a sessão expirou, entre de novo na Central.'));
        if (xhr.status >= 200 && xhr.status < 300 && j.ok) res(j); else rej(new Error(j.error || 'Erro no envio'));
      };
      xhr.onerror = () => rej(new Error('Erro de rede durante o envio'));
      xhr.onabort = () => rej(new Error('Envio cancelado'));
      xhr.send(fd);
    });
    return { promise, abort: () => xhr.abort() };
  }

  // ─── editores reaproveitados no assistente e na edição ─────────────────────
  // Horários do dia
  function editorHorarios(inicial, opts) {
    const el = document.createElement('div'); let times = (inicial || []).map(normHM).filter(Boolean);
    const changed = () => opts && opts.onChange && opts.onChange();
    function render() {
      el.innerHTML = `<div class="mz-chips">${times.map((t, i) => `<span class="mz-chip"><input type="time" value="${e(t)}" data-i="${i}"><button type="button" data-rm="${i}" title="Remover horário">${icon('x', 12)}</button></span>`).join('') || '<span class="hint" style="margin:0">Nenhum horário ainda.</span>'}</div>
        <div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-add>${icon('plus', 13)}Adicionar horário</button><button type="button" class="btn sm ghost" data-dist>${icon('clock', 13)}Distribuir pelo dia</button><button type="button" class="btn sm ghost" data-sort>Ordenar</button></div>`;
    }
    el.addEventListener('input', (ev) => { const i = ev.target.dataset.i; if (i != null) { times[i] = ev.target.value; changed(); } });
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.rm != null) times.splice(int(b.dataset.rm), 1);
      else if ('add' in b.dataset) { const last = times.length ? hmMin(times[times.length - 1]) + 60 : 9 * 60; const m = Math.min(last, 23 * 60 + 30); times.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')); }
      else if ('sort' in b.dataset) times = times.filter(Boolean).sort();
      else if ('dist' in b.dataset) {
        // espalha N horários entre 08:00 e 22:00, um para cada publicação do dia
        const n = Math.max(1, Math.min(50, (opts && opts.getCount && opts.getCount()) || times.length || 1)), a = 8 * 60, z = 22 * 60;
        times = Array.from({ length: n }, (_, i) => { const m = n === 1 ? 12 * 60 : Math.round((a + (z - a) * i / (n - 1)) / 5) * 5; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); });
      } else return;
      render(); changed();
    });
    render();
    return { el, get: () => times.map(normHM).filter(Boolean) };
  }

  // Bloqueios: dias da semana, intervalos de datas e janelas de horário
  function editorBloqueios(inicial) {
    const s = parseJson(inicial, {}) || {}, el = document.createElement('div');
    const st = { wd: new Set(s.excluded_weekdays || []), dr: (s.date_ranges || []).map((r) => ({ from: r.from || '', to: r.to || '' })), tw: (s.time_windows || []).map((w) => ({ from: w.from || '', to: w.to || '' })) };
    function render() {
      el.innerHTML = `<div class="field"><label class="f">Não publicar nestes dias da semana</label><div class="mz-chips">${DIAS.map((d, i) => `<span class="mz-day ${st.wd.has(i) ? 'on' : ''}" data-wd="${i}">${d}</span>`).join('')}</div></div>
        <div class="field"><label class="f">Intervalos de datas bloqueadas (feriados, férias)</label><div class="mz-chips">${st.dr.map((r, i) => `<span class="mz-chip">De <input type="date" value="${e(r.from)}" data-k="dr" data-i="${i}" data-f="from"> até <input type="date" value="${e(r.to)}" data-k="dr" data-i="${i}" data-f="to"><button type="button" data-rm="dr" data-i="${i}">${icon('x', 12)}</button></span>`).join('')}</div><button type="button" class="btn sm" data-add="dr" style="margin-top:8px">${icon('plus', 13)}Adicionar intervalo de datas</button></div>
        <div class="field" style="margin-bottom:0"><label class="f">Janelas de horário bloqueadas (ex.: 22:00 às 06:00)</label><div class="mz-chips">${st.tw.map((w, i) => `<span class="mz-chip">Das <input type="time" value="${e(w.from)}" data-k="tw" data-i="${i}" data-f="from"> às <input type="time" value="${e(w.to)}" data-k="tw" data-i="${i}" data-f="to"><button type="button" data-rm="tw" data-i="${i}">${icon('x', 12)}</button></span>`).join('')}</div><button type="button" class="btn sm" data-add="tw" style="margin-top:8px">${icon('plus', 13)}Adicionar janela de horário</button></div>`;
    }
    el.addEventListener('input', (ev) => { const d = ev.target.dataset; if (d.k) st[d.k][int(d.i)][d.f] = ev.target.value; });
    el.addEventListener('click', (ev) => {
      const day = ev.target.closest('[data-wd]'); if (day) { const i = int(day.dataset.wd); st.wd.has(i) ? st.wd.delete(i) : st.wd.add(i); render(); return; }
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.add === 'dr') st.dr.push({ from: '', to: '' }); else if (b.dataset.add === 'tw') st.tw.push({ from: '22:00', to: '06:00' });
      else if (b.dataset.rm) st[b.dataset.rm].splice(int(b.dataset.i), 1); else return;
      render();
    });
    render();
    return { el, get: () => ({ excluded_weekdays: Array.from(st.wd).sort(), date_ranges: st.dr.filter((r) => r.from && r.to), time_windows: st.tw.filter((w) => w.from && w.to) }) };
  }

  // Motor de legendas: fixa, IA ou embaralhar estrofes (lib/captions.js)
  function editorLegenda(modo, cfg) {
    const el = document.createElement('div'); cfg = cfg || {};
    const st = { mode: ['fixed', 'ai', 'shuffle'].includes(modo) ? modo : 'fixed', fixed: modo === 'fixed' ? (cfg.text || '') : '', shuffle: modo === 'shuffle' ? (cfg.text || '') : '', n: cfg.stanzas_per_post || 2, provider: cfg.provider || 'claude', prompt: cfg.prompt || '' };
    el.innerHTML = `<div class="seg" style="margin-bottom:16px"><button type="button" data-m="fixed">${icon('edit', 13)}Legenda padrão</button><button type="button" data-m="ai">${icon('bolt', 13)}Legenda com IA</button><button type="button" data-m="shuffle">${icon('refresh', 13)}Embaralhar estrofes</button></div>
      <div data-p="fixed"><label class="f">Texto usado em todas as publicações</label><textarea class="txa" data-f="fixed" placeholder="Sua legenda aqui. Será a mesma em todos os posts."></textarea></div>
      <div data-p="ai"><div class="cols-2"><div class="field"><label class="f">Provedor de IA</label><select class="sel" data-f="provider"><option value="claude">Claude (Anthropic)</option><option value="openai">OpenAI (GPT)</option><option value="gemini">Google Gemini</option></select></div>
        <div class="field"><label class="f">Chave de API <span data-key-st></span></label><div class="row" style="flex-wrap:nowrap"><input class="inp" type="password" data-key autocomplete="off" placeholder="Cole a chave e salve"><button type="button" class="btn" data-key-save>${icon('key', 14)}Salvar</button></div></div></div>
        <label class="f">Instrução para a IA gerar cada legenda</label><textarea class="txa" data-f="prompt" placeholder="Ex.: Escreva uma legenda de Instagram sobre empreendedorismo, motivacional, com 3 hashtags no final."></textarea><div class="hint">A IA é chamada na hora de cada publicação, então cada post sai com uma legenda diferente. A chave fica guardada criptografada no servidor.</div></div>
      <div data-p="shuffle"><label class="f">Texto base (estrofes separadas por uma linha em branco)</label><textarea class="txa" data-f="shuffle" style="min-height:170px" placeholder="Estrofe 1: texto...&#10;&#10;Estrofe 2: outro texto...&#10;&#10;Estrofe 3: mais texto..."></textarea>
        <div class="field" style="margin-top:14px;max-width:220px;margin-bottom:0"><label class="f">Estrofes por post</label><input class="inp" type="number" min="1" max="10" data-f="n"></div><div class="hint">A cada publicação o sistema sorteia essa quantidade de estrofes e monta a legenda.</div></div>`;
    const q = (s) => el.querySelector(s);
    q('[data-f=fixed]').value = st.fixed; q('[data-f=shuffle]').value = st.shuffle; q('[data-f=prompt]').value = st.prompt; q('[data-f=n]').value = st.n; q('[data-f=provider]').value = st.provider;
    async function keyStatus() {
      const b = q('[data-key-st]'); b.innerHTML = '';
      try { const r = await api.get('/settings/ai'); const ok = !!r['ai_' + st.provider + '_key_set']; b.innerHTML = `<span class="badge ${ok ? 'b-green' : 'b-red'}" style="margin-left:6px">${ok ? 'Configurada' : 'Não configurada'}</span>`; } catch (_) {}
    }
    function show() {
      el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === st.mode));
      el.querySelectorAll('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== st.mode; });
      if (st.mode === 'ai') keyStatus();
    }
    el.addEventListener('input', (ev) => { const f = ev.target.dataset.f; if (f) { st[f] = ev.target.value; if (f === 'provider') keyStatus(); } });
    el.addEventListener('change', (ev) => { if (ev.target.dataset.f === 'provider') { st.provider = ev.target.value; keyStatus(); } });
    el.addEventListener('click', async (ev) => {
      const m = ev.target.closest('[data-m]'); if (m) { st.mode = m.dataset.m; show(); return; }
      const sv = ev.target.closest('[data-key-save]'); if (!sv) return;
      const key = q('[data-key]').value.trim(); if (!key) return ui.toast('Cole a chave de API primeiro', 'err');
      ui.busy(sv, true, 'Salvando');
      try { await api.post('/settings/ai', { ['ai_' + st.provider + '_key']: key }); q('[data-key]').value = ''; ui.toast('Chave de API salva', 'ok'); keyStatus(); } catch (ex) { err(ex); } finally { ui.busy(sv, false); }
    });
    show();
    return { el, get: () => ({ mode: st.mode, config: st.mode === 'fixed' ? { text: st.fixed } : st.mode === 'shuffle' ? { text: st.shuffle, stanzas_per_post: Math.max(1, int(st.n, 1)) } : { provider: st.provider, prompt: st.prompt } }) };
  }

  // Contas de destino (só Instagram: campanhas em massa publicam no Instagram)
  function seletorContas(lista, selecionadas) {
    const el = document.createElement('div'), sel = new Set((selecionadas || []).map(Number));
    const igs = (lista || []).filter((a) => a.platform === 'instagram');
    function render() {
      el.innerHTML = igs.length ? `<div class="cols-2">${igs.map((a) => `<div class="acc ${sel.has(a.id) ? 'on' : ''}" data-id="${a.id}"><span class="ck">${icon('check', 12)}</span>${ZP.avatar(a)}<div class="grow"><div class="trunc" style="font-weight:600;font-size:13.5px">@${e(a.platform_username)}</div><div class="tiny mute trunc">${e(a.platform_name || '')} · ${fmt.compact(a.followers)} seguidores${a.status === 'expiring' ? ' · token expirando' : ''}</div></div></div>`).join('')}</div>`
        : ui.empty('Nenhum Instagram conectado', 'Conecte uma conta antes de criar a campanha.', '<a class="btn" href="#/contas">Abrir contas</a>', 'users');
    }
    el.addEventListener('click', (ev) => { const a = ev.target.closest('.acc'); if (!a) return; const id = int(a.dataset.id); sel.has(id) ? sel.delete(id) : sel.add(id); a.classList.toggle('on'); });
    render();
    return { el, get: () => igs.filter((a) => sel.has(a.id)).map((a) => a.id) };
  }

  // Configurações de Stories: sequência (formato Stories) ou espelhamento (formatos de feed)
  function editorStories(cfg, getFormato, onChange) {
    const el = document.createElement('div');
    const st = { stories_per_burst: Math.max(1, int(cfg && cfg.stories_per_burst, 1)), burst_interval_minutes: cfg && cfg.burst_interval_minutes != null ? int(cfg.burst_interval_minutes, 3) : 3, mirror_to_story: !!(cfg && cfg.mirror_to_story) };
    const apiNote = ui.note('info', '<strong>O que a API oficial do Instagram aceita em Stories:</strong> imagem ou vídeo de até 60s. Legenda, figurinha, enquete, música, marcação e link não podem ser enviados por API, em nenhuma ferramenta. Se precisar disso, o story tem que ser postado pelo app.');
    function render() {
      const story = getFormato() === 'story';
      el.innerHTML = story
        ? `<div class="cols-2"><div class="field"><label class="f">Stories em sequência por horário</label><input class="inp" type="number" min="1" max="10" data-f="stories_per_burst" value="${st.stories_per_burst}"><div class="hint">Ex.: 3 = a cada horário saem 3 stories seguidos.</div></div>
           <div class="field"><label class="f">Intervalo entre os stories da sequência (min)</label><input class="inp" type="number" min="0" max="60" data-f="burst_interval_minutes" value="${st.burst_interval_minutes}"><div class="hint">Sem mínimo obrigatório.</div></div></div>${apiNote}`
        : `<label class="check"><input type="checkbox" data-f="mirror_to_story" ${st.mirror_to_story ? 'checked' : ''}><span><strong>Publicar também nos Stories</strong><div class="hint" style="margin-top:3px">A mesma mídia que for para o feed sai também como story logo em seguida, na mesma quantidade. Em carrossel, o story recebe a primeira lâmina. Atenção: isso dobra o volume diário contado pela Meta.</div></span></label>`;
    }
    el.addEventListener('input', (ev) => { const f = ev.target.dataset.f; if (!f) return; st[f] = ev.target.type === 'checkbox' ? ev.target.checked : int(ev.target.value, 0); onChange && onChange(); });
    render();
    return { el, render, get: () => { const story = getFormato() === 'story'; return { stories_per_burst: story ? Math.max(1, st.stories_per_burst) : 1, burst_interval_minutes: Math.max(0, st.burst_interval_minutes), mirror_to_story: story ? false : st.mirror_to_story }; } };
  }

  // ─── view ──────────────────────────────────────────────────────────────────
  ZP.views.massa = {
    async mount(el, params) {
      injectCss();
      const S = { contas: [], camps: [], det: {}, worker: null, filtro: 'todas', modo: 'lista', upload: null, vivo: true };

      // ===== LISTA =====
      function shell() {
        el.innerHTML = `<div class="page">
          <div class="page-head"><div class="ttl"><h1>Publicação em massa</h1><p class="sub">Campanhas que publicam dezenas ou centenas de mídias sozinhas, nos horários que você definir.</p></div>
            <div class="row"><button class="btn" data-act="recarregar">${icon('refresh', 14)}Atualizar</button><button class="btn pri" data-act="nova">${icon('plus', 14)}Nova campanha</button></div></div>
          <div id="mz-worker"></div><div id="mz-kpis"></div>
          <div class="row" style="margin-bottom:14px"><div class="seg" id="mz-filtro">${[['todas', 'Todas'], ['ativas', 'Em andamento'], ['paradas', 'Paradas'], ['concluidas', 'Concluídas']].map(([k, l]) => `<button data-f="${k}" class="${S.filtro === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <div id="mz-list">${ui.loading('Carregando campanhas...')}</div></div>`;
      }

      function renderWorker() {
        const box = el.querySelector('#mz-worker'); if (!box) return; const w = S.worker;
        box.innerHTML = !w ? '' : w.dedicated_worker_alive
          ? ui.note('ok', `<strong>Scheduler ativo.</strong> As publicações agendadas disparam sozinhas a cada minuto${w.heartbeat_age_seconds != null ? ` (último sinal há ${fmt.n(w.heartbeat_age_seconds)} s)` : ''}.`)
          : ui.note('warn', '<strong>Worker dedicado parado.</strong> O scheduler embutido do servidor assumiu, então as publicações continuam saindo, mas vale avisar o suporte técnico para verificar o processo do worker.');
      }

      function proximos(c) {
        const d = S.det[c.id]; if (!d) return [];
        return (d.items || []).filter((i) => i.status === 'pending').map((i) => i.scheduled_at).sort((a, b) => a - b).slice(0, 3);
      }

      function cardCampanha(c) {
        const stt = statusDe(c), pend = pendentes(c), sc = c.story_config || {};
        const pct = c.total_items ? Math.round(c.published_count / c.total_items * 100) : 0;
        const prox = proximos(c), parada = ['draft', 'paused'].includes(c.status);
        let acoes = '';
        if (c.status === 'active' && stt !== 'completed') acoes += `<button class="btn sm" data-act="pausar" data-id="${c.id}">${icon('pause', 13)}Pausar</button>`;
        if (c.status === 'scheduled') acoes += `<button class="btn sm pri" data-act="ativar" data-id="${c.id}">${icon('play', 13)}Iniciar agora</button><button class="btn sm" data-act="pausar" data-id="${c.id}">${icon('pause', 13)}Pausar</button>`;
        if (parada) acoes += `<button class="btn sm pri" data-act="ativar" data-id="${c.id}">${icon('play', 13)}${c.status === 'paused' ? 'Retomar' : 'Iniciar agora'}</button><button class="btn sm" data-act="agendar" data-id="${c.id}">${icon('calendar', 13)}Agendar início</button>`;
        return `<div class="card mz-camp"><div class="card-b">
          <div class="row" style="align-items:flex-start">
            <div class="grow" style="min-width:220px"><div class="row" style="gap:8px;margin-bottom:6px"><h3>${e(c.name)}</h3>${campBadge(stt)}${fmtTag(c.post_format)}${sc.mirror_to_story ? `<span class="tag">${icon('story', 12)}Espelha nos Stories</span>` : ''}${c.post_format === 'story' && sc.stories_per_burst > 1 ? `<span class="tag">Sequência de ${int(sc.stories_per_burst)} · ${int(sc.burst_interval_minutes)} min</span>` : ''}<span class="tag">${icon(c.source_type === 'drive' ? 'folder' : 'upload', 12)}${c.source_type === 'drive' ? 'Drive' : 'Upload'}</span></div>
              <div class="small mute">${e(ZP.accName(S.contas, c.account_ids))} · ${fmt.n(c.posts_per_day)} por dia x ${fmt.n(c.total_days)} dias · ${e((c.times || []).join(', ') || 'sem horários')} · início ${e(ymdBr(c.start_date))}${c.status === 'scheduled' && c.scheduled_start_at ? ` · começa ${e(fmt.dt(c.scheduled_start_at))}` : ''}</div></div>
            <div class="row" style="gap:6px">${acoes}<button class="btn sm" data-act="detalhes" data-id="${c.id}">${icon('eye', 13)}Detalhes</button><button class="btn sm" data-act="midias" data-id="${c.id}">${icon('image', 13)}Mídias</button><button class="btn sm" data-act="editar" data-id="${c.id}">${icon('edit', 13)}Editar</button>
              <span class="mz-menu"><span class="icon-btn" data-act="menu" data-id="${c.id}" title="Mais ações">${icon('dots', 16)}</span></span></div>
          </div>
          <div style="margin-top:14px"><div class="row small" style="margin-bottom:6px"><span class="grow"><strong class="num">${fmt.n(c.published_count)}</strong> de <strong class="num">${fmt.n(c.total_items)}</strong> publicados · ${fmt.n(pend)} pendente(s)${c.failed_count ? ` · <span style="color:var(--red);font-weight:600">${fmt.n(c.failed_count)} falha(s)</span>` : ''}</span><span class="num mute">${pct}%</span></div>
            <div class="bar"><i style="width:${pct}%"></i></div></div>
          ${prox.length ? `<div class="row small" style="margin-top:12px;gap:6px"><span class="mute">${icon('clock', 13)}</span><span class="mute">Próximos:</span>${prox.map((ts) => `<span class="tag num">${e(fmt.dt(ts))}</span>`).join('')}${c.status !== 'active' ? '<span class="tiny faint">(só saem com a campanha ativa)</span>' : ''}</div>` : ''}
        </div></div>`;
      }

      function renderLista() {
        const box = el.querySelector('#mz-list'); if (!box || S.modo !== 'lista') return;
        const k = el.querySelector('#mz-kpis');
        const ativas = S.camps.filter((c) => statusDe(c) === 'active').length;
        const sum = (f) => S.camps.reduce((n, c) => n + f(c), 0);
        k.innerHTML = S.camps.length ? `<div class="kpis">${ui.kpi('Campanhas ativas', fmt.n(ativas), S.camps.length + ' no total', 'var(--green)')}${ui.kpi('Na fila', fmt.n(sum(pendentes)), 'publicações pendentes', 'var(--amber)')}${ui.kpi('Publicadas', fmt.n(sum((c) => c.published_count || 0)), 'por campanhas', 'var(--blue)')}${ui.kpi('Falhas', fmt.n(sum((c) => c.failed_count || 0)), 'após 3 tentativas', 'var(--red)')}</div>` : '';
        const f = S.filtro, lista = S.camps.filter((c) => { const s = statusDe(c); return f === 'todas' || (f === 'ativas' && (s === 'active' || s === 'scheduled')) || (f === 'paradas' && (s === 'paused' || s === 'draft')) || (f === 'concluidas' && s === 'completed'); });
        if (!S.camps.length) box.innerHTML = `<div class="card">${ui.empty('Nenhuma campanha ainda', 'Crie a primeira para publicar em lote a partir do Drive ou de um upload.', `<button class="btn pri" data-act="nova">${icon('plus', 14)}Nova campanha</button>`, 'rocket')}</div>`;
        else if (!lista.length) box.innerHTML = `<div class="card">${ui.empty('Nada neste filtro', 'Troque o filtro acima para ver as outras campanhas.', '', 'layers')}</div>`;
        else box.innerHTML = lista.map(cardCampanha).join('');
      }

      async function recarregar(silencioso) {
        if (S.modo !== 'lista' || !S.vivo) return;
        if (el.querySelector('.mz-pop')) return; // menu aberto: não redesenha por baixo
        try {
          const [camps, contas, worker] = await Promise.all([api.get('/bulk/campaigns'), ZP.accounts().catch(() => S.contas), api.get('/worker/status').catch(() => null)]);
          if (!S.vivo || S.modo !== 'lista') return;
          S.camps = Array.isArray(camps) ? camps : []; S.contas = contas || []; S.worker = worker;
          renderWorker(); renderLista();
          // detalhes só de quem ainda tem fila: é de onde saem os próximos horários
          const alvo = S.camps.filter((c) => pendentes(c) > 0);
          const dets = await Promise.all(alvo.map((c) => api.get('/bulk/campaigns/' + c.id).catch(() => null)));
          if (!S.vivo || S.modo !== 'lista') return;
          alvo.forEach((c, i) => { if (dets[i]) S.det[c.id] = dets[i]; });
          if (!el.querySelector('.mz-pop')) renderLista();
        } catch (ex) {
          const box = el.querySelector('#mz-list');
          if (!silencioso || !S.camps.length) { if (box) box.innerHTML = ui.error('Não consegui carregar as campanhas: ' + ex.message); }
          if (silencioso) return; err(ex);
        }
      }

      const camp = (id) => S.camps.find((c) => c.id === int(id));
      function fecharMenus() { el.querySelectorAll('.mz-pop').forEach((p) => p.remove()); }
      function abrirMenu(anchor, id) {
        const aberto = anchor.parentElement.querySelector('.mz-pop'); fecharMenus(); if (aberto) return;
        const p = document.createElement('div'); p.className = 'mz-pop';
        p.innerHTML = `<button data-act="recalcular" data-id="${id}">${icon('refresh', 15)}Recalcular horários</button><button data-act="debug" data-id="${id}">${icon('bolt', 15)}Testar publicação agora</button><button class="d" data-act="excluir" data-id="${id}">${icon('trash', 15)}Excluir campanha</button>`;
        anchor.parentElement.appendChild(p);
      }

      // ----- ações simples -----
      async function pausar(id, btn) {
        ui.busy(btn, true, 'Pausando');
        try { await api.post('/bulk/campaigns/' + id + '/pause'); ui.toast('Campanha pausada. Nada sai até você retomar.', 'ok'); await recarregar(); } catch (ex) { err(ex); ui.busy(btn, false); }
      }
      async function excluir(id) {
        const c = camp(id); if (!c) return;
        const ok = await ui.confirm({ title: 'Excluir campanha', danger: true, ok: 'Excluir campanha', html: `Excluir <strong>${e(c.name)}</strong>? As <strong>${fmt.n(pendentes(c))}</strong> publicações ainda não realizadas serão perdidas. O que já foi publicado no Instagram continua no ar. Não dá para desfazer.` });
        if (!ok) return;
        try { await api.del('/bulk/campaigns/' + id); delete S.det[id]; ui.toast('Campanha excluída', 'ok'); await recarregar(); } catch (ex) { err(ex); }
      }
      function agendarExistente(id) {
        const c = camp(id); if (!c) return;
        ui.modal({ title: 'Agendar início da campanha', body: `<p class="sub" style="margin-bottom:16px">A campanha fica como Programada e só começa a publicar a partir do momento escolhido.</p><label class="f">Data e hora de início</label><input class="inp" type="datetime-local" id="mz-ag" value="${fmt.local(Math.floor(Date.now() / 1000) + 3600)}">`,
          actions: [{ label: 'Cancelar' }, { label: 'Confirmar agendamento', kind: 'pri', icon: 'calendar', onClick: async (close, btn) => {
            const v = document.getElementById('mz-ag').value; if (!v) return ui.toast('Escolha data e hora', 'err');
            ui.busy(btn, true, 'Agendando');
            try { const r = await api.post('/bulk/campaigns/' + id + '/activate', { start_at: v }); close(); ui.toast('Campanha programada' + (r.agendada_para ? ' para ' + r.agendada_para : ''), 'ok'); recarregar(); } catch (ex) { err(ex); ui.busy(btn, false); }
          } }] });
      }
      function recalcular(id) {
        const c = camp(id); if (!c) return;
        ui.modal({ title: 'Recalcular horários', body: `${ui.note('info', 'Refaz os horários das publicações <strong>pendentes</strong> de ' + e(c.name) + ' seguindo a grade da campanha. O que já foi publicado não muda.')}<label class="f">Nova data de início (opcional)</label><input class="inp" type="date" id="mz-rs" value=""><div class="hint">Deixe vazio para manter ${e(ymdBr(c.start_date))}. Para mudar horários ou quantidade, use Editar.</div>`,
          actions: [{ label: 'Cancelar' }, { label: 'Recalcular', kind: 'pri', icon: 'refresh', onClick: async (close, btn) => {
            const v = document.getElementById('mz-rs').value, body = {}; if (v) body.start_date = v;
            ui.busy(btn, true, 'Recalculando');
            try { const r = await api.post('/bulk/campaigns/' + id + '/rebuild-slots', body); close(); ui.toast(r.message || `${fmt.n(r.updated)} horário(s) recalculado(s). Primeiro: ${r.first_slot_brt || '-'}`, 'ok'); recarregar(); } catch (ex) { err(ex); ui.busy(btn, false); }
          } }] });
      }
      // Teste manual: o endpoint publica DE VERDADE 1 item pendente e devolve o log passo a passo
      async function debug(id) {
        const c = camp(id); if (!c) return;
        const ok = await ui.confirm({ title: 'Testar publicação agora', danger: true, ok: 'Publicar 1 item agora', html: `Isto <strong>publica de verdade</strong>, neste momento, o próximo item pendente de <strong>${e(c.name)}</strong> na primeira conta da campanha, e mostra o log de cada etapa. Serve para diagnosticar falhas. Pode levar de 30 s a 2 min em vídeo.` });
        if (!ok) return;
        let corpo = null;
        ui.modal({ title: 'Teste de publicação', wide: true, body: ui.loading('Publicando 1 item e registrando cada etapa...'), onOpen: (b) => { corpo = b; }, onClose: () => recarregar(true) });
        try {
          const r = await fetch(API_BASE + '/debug/run-campaign/' + id, { credentials: 'same-origin' }); const j = await r.json().catch(() => ({ ok: false, error: 'Resposta inesperada (erro ' + r.status + ')' }));
          if (!corpo || !corpo.isConnected) return;
          corpo.innerHTML = `${j.ok ? ui.note('ok', j.published_id ? 'Publicado com sucesso. ID do post: <strong>' + e(j.published_id) + '</strong>' : e(j.message || 'Concluído')) : ui.error('Falhou: ' + (j.error || 'erro desconhecido'))}<div class="mz-sec" style="margin-top:4px">Log de execução (${(j.logs || []).length} linhas)</div><div class="mz-log">${(j.logs || []).map((l) => e(l)).join('\n') || 'Sem log.'}</div>${j.full ? `<div class="mz-sec">Resposta bruta da API</div><div class="mz-log">${e(JSON.stringify(j.full, null, 2))}</div>` : ''}`;
        } catch (ex) { if (corpo && corpo.isConnected) corpo.innerHTML = ui.error('Erro na chamada: ' + ex.message); }
      }

      // ----- detalhes e itens -----
      async function detalhes(id) {
        let d; try { d = await api.get('/bulk/campaigns/' + id); } catch (ex) { return err(ex); }
        const c = d.campaign, items = d.items || [], n = (s) => items.filter((i) => i.status === s).length, sc = c.story_config || {}, sus = parseJson(c.suspensions, {}) || {};
        const cap = c.post_format === 'story' ? 'Stories não têm legenda' : c.caption_mode === 'fixed' ? 'Legenda padrão' : c.caption_mode === 'shuffle' ? `Embaralhar estrofes (${int(c.caption_config.stanzas_per_post, 1)} por post)` : `IA (${c.caption_config.provider || '-'})`;
        const bloq = [(sus.excluded_weekdays || []).length ? 'não publica em ' + sus.excluded_weekdays.map((i) => DIAS[i]).join(', ') : '', (sus.date_ranges || []).map((r) => ymdBr(r.from) + ' a ' + ymdBr(r.to)).join('; '), (sus.time_windows || []).map((w) => w.from + ' às ' + w.to).join('; ')].filter(Boolean).join(' · ') || 'nenhum';
        const texto = c.caption_mode === 'ai' ? c.caption_config.prompt : c.caption_config.text;
        ui.modal({ title: c.name, wide: true, body: `
          <div class="row" style="margin-bottom:14px;gap:8px">${campBadge(statusDe(c))}${fmtTag(c.post_format)}<span class="tag">${icon(c.source_type === 'drive' ? 'folder' : 'upload', 12)}${c.source_type === 'drive' ? 'Google Drive' : 'Upload direto'}</span>${sc.mirror_to_story ? `<span class="tag">${icon('story', 12)}Espelha nos Stories</span>` : ''}</div>
          <div class="mz-stats"><div><div class="l">Publicados</div><div class="v" style="color:var(--green)">${n('published')}</div></div><div><div class="l">Pendentes</div><div class="v">${n('pending')}</div></div><div><div class="l">Publicando</div><div class="v">${n('processing')}</div></div><div><div class="l">Falharam</div><div class="v" style="color:var(--red)">${n('failed')}</div></div><div><div class="l">Total</div><div class="v">${items.length}</div></div></div>
          <table class="tb" style="margin-bottom:6px"><tbody>
            <tr><td class="mute" style="width:170px">Contas</td><td>${e(ZP.accName(S.contas, c.account_ids))}</td></tr>
            <tr><td class="mute">Volume</td><td>${fmt.n(c.posts_per_day)} por dia x ${fmt.n(c.total_days)} dias, a partir de ${e(ymdBr(c.start_date))}</td></tr>
            <tr><td class="mute">Horários</td><td>${e((c.times || []).join(', ') || '-')} <span class="mute">(variação de ±${int(c.jitter_minutes)} min)</span></td></tr>
            ${c.post_format === 'story' ? `<tr><td class="mute">Sequência</td><td>${int(sc.stories_per_burst, 1)} story(s) por horário, ${int(sc.burst_interval_minutes, 3)} min entre eles</td></tr>` : ''}
            <tr><td class="mute">Bloqueios</td><td>${e(bloq)}</td></tr>
            <tr><td class="mute">Legendas</td><td>${e(cap)}${texto ? `<div class="small mute" style="margin-top:4px;white-space:pre-wrap;max-height:90px;overflow:auto">${e(texto)}</div>` : ''}</td></tr>
            ${c.drive_url ? `<tr><td class="mute">Pasta do Drive</td><td><a href="${ZP.safeUrl(c.drive_url)}" target="_blank" rel="noopener">Abrir pasta ${icon('ext', 12)}</a></td></tr>` : ''}
            ${c.scheduled_start_at ? `<tr><td class="mute">Início programado</td><td>${e(fmt.dt(c.scheduled_start_at))}</td></tr>` : ''}
          </tbody></table>
          <div class="mz-sec">Itens da campanha (${items.length})</div>
          ${items.length ? `<div class="scroll-x" style="max-height:340px;overflow-y:auto;border:1px solid var(--line);border-radius:12px"><table class="tb"><thead><tr><th>#</th><th>Quando</th><th>Mídia</th><th>Status</th><th>Observação</th></tr></thead><tbody>${items.map((it) => `<tr><td class="num mute">${it.slot_index + 1}</td><td class="num" style="white-space:nowrap">${e(fmt.dt(it.scheduled_at))}</td><td><div class="trunc" style="max-width:220px" title="${e(it.media && it.media.name)}">${e((it.media && it.media.name) || 'sem nome')}${it.media && it.media.count > 1 ? ` <span class="mute">(${it.media.count} lâminas)</span>` : ''}</div></td><td>${itemBadge(it.status)}</td><td class="small">${it.error_message ? `<span style="color:var(--red)">${e(it.error_message)}</span>` : it.processed_at ? `<span class="mute">processado ${e(fmt.dt(it.processed_at))}</span>` : ''}${it.retry_count ? ` <span class="mute">(${it.retry_count} nova(s) tentativa(s))</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ui.empty('Sem itens', 'Esta campanha não tem publicações na fila.', '', 'layers')}`,
          actions: [{ label: 'Ver mídias', icon: 'image', onClick: (close) => { close(); galeria(id); } }, { label: 'Editar', icon: 'edit', onClick: (close) => { close(); editar(id); } }, { label: 'Fechar', kind: 'pri' }] });
      }

      // ----- galeria de mídias com remoção de item -----
      function galeria(id) {
        let corpo = null, mudou = false;
        async function desenhar() {
          let d; try { d = await api.get('/bulk/campaigns/' + id); } catch (ex) { if (corpo) corpo.innerHTML = ui.error(ex.message); return; }
          if (!corpo || !corpo.isConnected) return;
          const c = d.campaign, items = d.items || [], n = (s) => items.filter((i) => i.status === s).length;
          corpo.innerHTML = `<div class="row" style="margin-bottom:12px;gap:8px"><h3 class="grow">${e(c.name)}</h3>${fmtTag(c.post_format)}<span class="small mute">${items.length} item(ns) · ${n('pending')} agendado(s) · ${n('published')} publicado(s)</span></div>
            ${ui.note('info', 'Clique na miniatura para ver a mídia. "Tirar da programação" remove só aquele item: o resto da campanha segue igual, nos mesmos horários.' + (c.source_type === 'drive' ? ' Nesta campanha as mídias vêm do Google Drive e só são baixadas na hora de publicar, por isso não há miniatura, mas o nome do arquivo aparece em cada card.' : ' Depois de publicado, o arquivo é apagado do servidor, então só os itens pendentes têm prévia.'))}
            ${items.length ? `<div class="mz-gal">${items.map((it) => { const m = it.media || {}, pode = it.status === 'pending' || it.status === 'failed';
              return `<div class="mz-g">${thumbHtml(m, c.post_format, it.status !== 'published', m.count > 1 ? `<span class="n" style="left:auto;right:6px;width:auto;padding:0 7px;border-radius:10px">${int(m.count)}</span>` : '')}
                <div class="b"><div class="trunc" style="font-weight:600" title="${e(m.name)}">${e(m.name || 'sem nome')}</div><div class="mute num" style="margin:3px 0 6px">${e(fmt.dt(it.scheduled_at))}</div>${itemBadge(it.status)}${it.error_message ? `<div class="tiny" style="color:var(--red);margin-top:5px;max-height:30px;overflow:hidden" title="${e(it.error_message)}">${e(it.error_message.slice(0, 70))}</div>` : ''}</div>
                ${pode ? `<button class="btn sm ghost danger" style="border-radius:0;border-top:1px solid var(--soft)" data-rm-item="${it.id}">${icon('trash', 13)}Tirar da programação</button>` : `<div class="f">${it.status === 'published' ? 'já publicado' : 'publicando agora'}</div>`}</div>`; }).join('')}</div>` : ui.empty('Nenhum item nesta campanha', '', '', 'image')}`;
          lazyMedia(corpo);
        }
        ui.modal({ title: 'Mídias da campanha', wide: true, body: ui.loading('Carregando mídias...'), actions: [{ label: 'Fechar', kind: 'pri' }], onClose: () => { if (mudou) recarregar(true); },
          onOpen: (b) => {
            corpo = b; ligarPlayer(b); desenhar();
            b.addEventListener('click', async (ev) => {
              const bt = ev.target.closest('[data-rm-item]'); if (!bt) return;
              const ok = await ui.confirm({ title: 'Tirar da programação', danger: true, ok: 'Tirar item', text: 'Este item não será publicado e, se veio de upload, o arquivo é apagado do servidor. O restante da campanha continua igual.' });
              if (!ok) return; ui.busy(bt, true, 'Removendo');
              try { await api.del('/bulk/campaigns/' + id + '/items/' + bt.dataset.rmItem); mudou = true; ui.toast('Item removido da programação', 'ok'); await desenhar(); } catch (ex) { err(ex); ui.busy(bt, false); }
            });
          } });
      }

      // ----- confirmação antes de iniciar ou retomar -----
      async function ativar(id) {
        let d, contas; try { [d, contas] = await Promise.all([api.get('/bulk/campaigns/' + id), ZP.accounts(true)]); } catch (ex) { return err(ex); }
        const c = d.campaign, itens = (d.items || []).filter((i) => i.status === 'pending').sort((a, b) => a.scheduled_at - b.scheduled_at);
        const vinc = (contas || []).filter((a) => (c.account_ids || []).includes(a.id)), agora = Date.now() / 1000;
        const bloqueios = [], avisos = [];
        if (!vinc.length) bloqueios.push('Nenhuma conta do Instagram vinculada a esta campanha.');
        if (!itens.length) bloqueios.push('Não há publicação pendente: tudo já foi publicado ou removido.');
        const exp = vinc.filter((a) => a.status === 'expiring');
        if (exp.length) avisos.push('Token expirando em ' + exp.map((a) => '@' + e(a.platform_username)).join(', ') + '. Reconecte para a campanha não falhar no meio.');
        const atras = itens.filter((i) => i.scheduled_at < agora).length;
        if (atras) avisos.push(`${atras} horário(s) já passaram. Ao iniciar, essas publicações são remarcadas para os próximos horários livres da grade, em vez de saírem todas de uma vez.`);
        const futuros = itens.filter((i) => i.scheduled_at >= agora), pri = futuros[0] || itens[0], ult = itens[itens.length - 1];
        const retomar = c.status === 'paused';
        ui.modal({ title: retomar ? 'Confirmar retomada da campanha' : 'Confirmar início da campanha', wide: true,
          body: `<p class="sub" style="margin-bottom:16px">Revise antes de publicar. Nada vai ao ar até você confirmar.</p>
            <div class="row" style="margin-bottom:10px;gap:8px"><h3>${e(c.name)}</h3>${fmtTag(c.post_format)}${c.story_config && c.story_config.mirror_to_story ? `<span class="tag">${icon('story', 12)}Espelha nos Stories</span>` : ''}</div>
            <div class="mz-stats"><div><div class="l">Publicações</div><div class="v">${itens.length}</div></div><div><div class="l">Primeira</div><div class="v" style="font-size:14px">${e(pri ? fmt.dt(pri.scheduled_at) : '-')}</div></div><div><div class="l">Última</div><div class="v" style="font-size:14px">${e(ult ? fmt.dt(ult.scheduled_at) : '-')}</div></div><div><div class="l">Ritmo</div><div class="v" style="font-size:14px">${fmt.n(c.posts_per_day)} por dia · ${e((c.times || []).join(', '))}</div></div></div>
            <div class="mz-sec" style="margin-top:0">Vai publicar em</div>
            <div class="row" style="margin-bottom:16px">${vinc.length ? vinc.map((a) => `<div class="acc on" style="cursor:default">${ZP.avatar(a, 30)}<div><div style="font-weight:600;font-size:13px">@${e(a.platform_username)}</div><div class="tiny mute">${fmt.compact(a.followers)} seguidores</div></div></div>`).join('') : '<span style="color:var(--red)">Nenhuma conta vinculada</span>'}</div>
            ${bloqueios.map((b) => ui.note('err', e(b))).join('')}${avisos.map((a) => ui.note('warn', a)).join('')}
            <div class="mz-sec">Mídias que vão ao ar (${itens.length})</div>
            <div style="max-height:280px;overflow-y:auto;padding:2px"><div class="mz-gal" style="grid-template-columns:repeat(auto-fill,minmax(112px,1fr))">${itens.map((it) => `<div class="mz-g">${thumbHtml(it.media || {}, c.post_format, true)}<div class="b"><div class="trunc" title="${e(it.media && it.media.name)}">${e((it.media && it.media.name) || 'mídia')}</div><div class="mute num">${e(fmt.dt(it.scheduled_at))}</div></div></div>`).join('')}</div></div>`,
          onOpen: (b) => { ligarPlayer(b); lazyMedia(b); if (bloqueios.length) { const bt = b.parentElement.querySelector('.modal-f .btn.pri'); if (bt) bt.disabled = true; } },
          actions: [{ label: 'Cancelar' }, { label: 'Editar campanha', icon: 'edit', onClick: (close) => { close(); editar(id); } },
            { label: retomar ? 'Retomar campanha' : 'Iniciar campanha', kind: 'pri', icon: 'play', onClick: async (close, btn) => {
              if (bloqueios.length || btn.disabled) return;
              ui.busy(btn, true, 'Iniciando'); // trava clique duplo
              try {
                const r = await api.post('/bulk/campaigns/' + id + '/activate'); close();
                ui.toast('Campanha ativa.' + (r.remarcados ? ` ${r.remarcados} item(ns) atrasado(s) remarcado(s).` : '') + (r.proxima_publicacao ? ' Próxima publicação: ' + r.proxima_publicacao : ''), 'ok'); recarregar();
              } catch (ex) { err(ex); ui.busy(btn, false); }
            } }] });
      }

      // ----- edição -----
      async function editar(id) {
        let d; try { d = await api.get('/bulk/campaigns/' + id); } catch (ex) { return err(ex); }
        const c = d.campaign, items = d.items || [], n = (s) => items.filter((i) => i.status === s).length;
        const intoc = n('published') + n('processing'), story = c.post_format === 'story';
        let ed = null;
        ui.modal({ title: 'Editar campanha', wide: true, body: '<div id="mz-ed"></div>',
          onOpen: (b) => {
            const root = b.querySelector('#mz-ed');
            root.innerHTML = `<div class="mz-stats"><div><div class="l">Publicados</div><div class="v" style="color:var(--green)">${n('published')}</div></div><div><div class="l">Pendentes</div><div class="v">${n('pending')}</div></div><div><div class="l">Falharam</div><div class="v" style="color:var(--red)">${n('failed')}</div></div><div><div class="l">Total</div><div class="v">${items.length}</div></div></div>
              ${ui.note('info', 'Ao salvar, os horários das publicações <strong>ainda não realizadas</strong> são recalculados com a nova configuração. O que já foi publicado nunca muda. Formato e fonte das mídias não podem ser trocados: para isso, crie outra campanha.')}
              <div class="field"><label class="f">Nome da campanha</label><input class="inp" id="mz-e-name" value="${e(c.name)}"></div>
              <div class="cols-3"><div class="field"><label class="f">${story ? 'Sequências' : 'Posts'} por dia</label><input class="inp" type="number" min="1" max="25" id="mz-e-ppd" value="${int(c.posts_per_day)}"></div><div class="field"><label class="f">Dias de duração</label><input class="inp" type="number" min="1" max="365" id="mz-e-days" value="${int(c.total_days)}"></div><div class="field"><label class="f">Data de início</label><input class="inp" type="date" id="mz-e-start" value="${e(c.start_date)}"></div></div>
              <div class="field"><label class="f">Horários de publicação</label><div id="mz-e-times"></div></div>
              <div class="field"><label class="f">Quantidade de publicações desta campanha</label><input class="inp" type="number" id="mz-e-target" style="max-width:200px" min="${intoc}" max="${items.length}" value="${items.length}"><div class="hint">Hoje são <strong>${items.length}</strong>. Você pode <strong>reduzir</strong>: os agendamentos mais distantes são removidos primeiro.${intoc ? ` As ${intoc} já publicadas (ou saindo agora) nunca são apagadas, então o mínimo é ${intoc}.` : ''} Para aumentar, envie as novas mídias criando outra campanha.</div></div>
              <div class="field"><label class="f">Contas de destino</label><div id="mz-e-acc"></div></div>
              <div class="field"><label class="f">${story ? 'Sequência de Stories' : 'Stories'}</label><div id="mz-e-story"></div></div>
              <details class="mz-d field"><summary>Bloqueios de dias, datas e horários</summary><div id="mz-e-sus" style="padding-top:10px"></div></details>
              ${story ? '' : '<div class="field"><label class="f">Legendas</label><div id="mz-e-cap"></div></div>'}
              <div class="mz-sec">Últimas tentativas</div><div class="mz-log" style="max-height:200px">${items.slice(-15).reverse().map((it) => `[${e((ITEM_STATUS[it.status] || [it.status])[0])}] item ${it.slot_index + 1} · ${e(fmt.dt(it.scheduled_at))}${it.error_message ? '\n    ' + e(it.error_message.slice(0, 160)) : ''}`).join('\n') || 'Sem tentativas ainda.'}</div>`;
            ed = { times: editorHorarios(c.times, { getCount: () => int(root.querySelector('#mz-e-ppd').value, 1) }), acc: seletorContas(S.contas, c.account_ids), story: editorStories(c.story_config, () => c.post_format), sus: editorBloqueios(c.suspensions), cap: story ? null : editorLegenda(c.caption_mode, c.caption_config) };
            root.querySelector('#mz-e-times').appendChild(ed.times.el); root.querySelector('#mz-e-acc').appendChild(ed.acc.el); root.querySelector('#mz-e-story').appendChild(ed.story.el); root.querySelector('#mz-e-sus').appendChild(ed.sus.el);
            if (ed.cap) root.querySelector('#mz-e-cap').appendChild(ed.cap.el);
            // fotografia do estado inicial, tirada pelos mesmos editores, para só enviar o que mudou de verdade
            ed.orig = { times: ed.times.get(), acc: ed.acc.get(), story: ed.story.get(), sus: ed.sus.get(), cap: ed.cap ? ed.cap.get() : null };
          },
          actions: [{ label: 'Cancelar' }, { label: 'Salvar alterações', kind: 'pri', icon: 'check', onClick: async (close, btn) => {
            const g = (s) => document.querySelector(s).value, p = {};
            const name = g('#mz-e-name').trim(), ppd = int(g('#mz-e-ppd')), days = int(g('#mz-e-days')), start = g('#mz-e-start'), alvo = int(g('#mz-e-target'), items.length);
            const times = ed.times.get(), acc = ed.acc.get(), st = ed.story.get(), sus = ed.sus.get(), cap = ed.cap ? ed.cap.get() : null;
            if (!name) return ui.toast('Dê um nome para a campanha', 'err');
            if (ppd < 1 || days < 1 || !start) return ui.toast('Confira posts por dia, dias e data de início', 'err');
            if (!times.length) return ui.toast('Adicione pelo menos 1 horário', 'err');
            if (!acc.length) return ui.toast('Selecione ao menos 1 conta', 'err');
            if (alvo < intoc) return ui.toast(`O mínimo possível é ${intoc}: essas publicações já saíram.`, 'err');
            if (alvo > items.length) return ui.toast('Não dá para aumentar por aqui. Crie outra campanha com as novas mídias.', 'err');
            const v = checarLimites({ format: c.post_format, posts_per_day: ppd, times, story: st, jitter_minutes: c.jitter_minutes }); if (v.length) return modalLimites(v);
            // só vai no corpo o que mudou: o servidor recalcula a agenda quando um campo de agenda chega diferente
            if (name !== c.name) p.name = name;
            if (ppd !== c.posts_per_day) p.posts_per_day = ppd;
            if (days !== c.total_days) p.total_days = days;
            if (start !== c.start_date) p.start_date = start;
            if (!same(times, ed.orig.times)) p.times = times;
            if (!same(acc, ed.orig.acc)) p.account_ids = acc;
            if (!same(st, ed.orig.story)) p.story_config = Object.assign({}, c.story_config, st);
            if (!same(sus, ed.orig.sus)) p.suspensions = sus;
            if (cap && !same(cap, ed.orig.cap)) { p.caption_mode = cap.mode; p.caption_config = cap.config; }
            if (alvo < items.length) p.target_count = alvo;
            if (!Object.keys(p).length) return ui.toast('Nada foi alterado');
            if (p.target_count != null) {
              const ok = await ui.confirm({ title: 'Reduzir a campanha', danger: true, ok: 'Remover publicações', html: `Serão removidas <strong>${items.length - alvo}</strong> publicação(ões) pendentes, começando pelas mais distantes. Arquivos de upload desses itens são apagados do servidor. Não dá para desfazer.` });
              if (!ok) return;
            }
            ui.busy(btn, true, 'Salvando');
            try {
              const r = await api.put('/bulk/campaigns/' + id, p);
              const partes = []; if (r.horarios_recalculados) partes.push(r.horarios_recalculados + ' horário(s) recalculado(s)'); if (r.itens_removidos) partes.push(r.itens_removidos + ' publicação(ões) removida(s)'); partes.push('total agora: ' + r.total_items); if (r.primeiro_horario) partes.push('próxima em ' + r.primeiro_horario);
              close(); ui.toast('Campanha atualizada · ' + partes.join(' · '), 'ok');
              if (r.aviso) ui.modal({ title: 'Atenção', body: ui.note('warn', e(r.aviso)), actions: [{ label: 'Entendi', kind: 'pri' }], onClose: () => recarregar(true) });
              recarregar();
            } catch (ex) { err(ex); ui.busy(btn, false); }
          } }] });
      }

      // ===== GUIA DE CONEXÃO DO DRIVE =====
      async function guiaDrive(aoConectar) {
        let cfg = {}; try { cfg = await api.get('/settings'); } catch (_) {}
        const temCred = !!cfg.google_client_id;
        ui.modal({ title: 'Conectar o Google Drive', wide: true, body: `<div class="mz-guide">
          <p class="sub" style="margin-bottom:14px">Você faz isso uma vez só, leva uns 10 minutos, no computador. Cada link abre o Google em outra aba: faça o que está descrito, volte aqui e siga para o próximo.</p>
          <details class="mz-d" ${temCred ? '' : 'open'}><summary>1. Criar o app no Google Cloud ${temCred ? '<span class="badge b-green" style="margin-left:6px">credenciais já salvas</span>' : ''}</summary>
            <ol><li><a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Criar um projeto</a> chamado <code>Zeus Post</code> e deixar ele selecionado no topo da página.</li>
            <li><a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Abrir a Google Drive API</a> e clicar em <strong>Ativar</strong>.</li>
            <li><a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener">Tela de consentimento</a>: escolher <strong>Externo</strong>, nome do app <code>Zeus Post</code>, seu e-mail nos dois campos de e-mail, e <strong>Salvar e continuar</strong>. Na tela de Escopos, só <strong>Salvar e continuar</strong>.</li>
            <li>Em <strong>Usuários de teste</strong>, adicionar o e-mail da conta Google dona do Drive. <strong>Obrigatório</strong>: sem isso o Google mostra "Acesso bloqueado".</li>
            <li><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credenciais</a>, <strong>Criar credenciais</strong>, <strong>ID do cliente OAuth</strong>, tipo <strong>Aplicativo da Web</strong>, nome <code>Zeus Post</code>.</li>
            <li>Em <strong>URIs de redirecionamento autorizados</strong>, adicionar exatamente esta URL (sem espaço nem barra no final) e clicar em <strong>Criar</strong>:</li></ol>
            <div class="row" style="margin:10px 0 4px;flex-wrap:nowrap"><input class="inp" id="mz-cb" readonly value="${e(DRIVE_CALLBACK)}"><button class="btn" data-copy>${icon('copy', 14)}Copiar</button></div>
          </details>
          <details class="mz-d" ${temCred ? '' : 'open'}><summary>2. Colar o Client ID e o Client Secret</summary>
            <div class="cols-2" style="margin-top:8px"><div class="field"><label class="f">Client ID (termina em .apps.googleusercontent.com)</label><input class="inp" id="mz-cid" value="${e(cfg.google_client_id || '')}" autocomplete="off"></div><div class="field"><label class="f">Client Secret (começa com GOCSPX-)</label><input class="inp" type="password" id="mz-cs" autocomplete="off" placeholder="${cfg.google_client_secret_set ? 'já salvo, cole só para trocar' : ''}"></div></div>
            <button class="btn" data-save-cred>${icon('key', 14)}Salvar credenciais</button>
          </details>
          <details class="mz-d" open><summary>3. Autorizar o acesso ao Drive</summary>
            <p class="small" style="color:var(--ink-2);line-height:1.6;margin:8px 0 12px">O login do Google abre em outra aba. Escolha a conta do Drive. Na tela "O Google não verificou este app", clique em <strong>Avançado</strong> e depois em <strong>Acessar Zeus Post</strong> (é o seu próprio app), e em <strong>Continuar</strong>. No fim, o Google devolve para o endereço antigo do painel: pode fechar aquela aba e voltar aqui.</p>
            <div class="row"><a class="btn pri" id="mz-auth" href="${OAUTH_START}" target="_blank" rel="noopener" ${temCred ? '' : 'style="pointer-events:none;opacity:.5"'}>${icon('ext', 14)}Abrir login do Google</a><button class="btn" data-check>${icon('refresh', 14)}Já autorizei, verificar conexão</button><span id="mz-dst"></span></div>
          </details></div>`,
          onOpen: (b, close) => {
            b.addEventListener('click', async (ev) => {
              const t = ev.target.closest('button'); if (!t) return;
              if ('copy' in t.dataset) return copiar(DRIVE_CALLBACK, b.querySelector('#mz-cb'));
              if ('saveCred' in t.dataset) {
                const cid = b.querySelector('#mz-cid').value.trim(), cs = b.querySelector('#mz-cs').value.trim();
                if (!cid || !cs) return ui.toast('Preencha o Client ID e o Client Secret', 'err');
                ui.busy(t, true, 'Salvando');
                try { await api.post('/settings', { google_client_id: cid, google_client_secret: cs }); ui.toast('Credenciais salvas. Agora autorize no passo 3.', 'ok'); b.querySelector('#mz-cs').value = ''; const a = b.querySelector('#mz-auth'); a.style.pointerEvents = ''; a.style.opacity = ''; } catch (ex) { err(ex); } finally { ui.busy(t, false); }
              }
              if ('check' in t.dataset) {
                ui.busy(t, true, 'Verificando');
                try { const r = await api.get('/drive/status'); ui.busy(t, false); if (r.connected) { ui.toast('Google Drive conectado', 'ok'); close(); aoConectar && aoConectar(); } else b.querySelector('#mz-dst').innerHTML = '<span class="badge b-red">Ainda não conectado</span>'; } catch (ex) { ui.busy(t, false); err(ex); }
              }
            });
          }, actions: [{ label: 'Fechar' }] });
      }

      // ===== ASSISTENTE "NOVA CAMPANHA" =====
      function assistente() {
        S.modo = 'wizard'; fecharMenus(); window.scrollTo(0, 0);
        const hoje = fmt.ymd(new Date());
        const W = { passo: 0, visto: 0, format: 'video', source: 'upload', drive: null, driveTest: null, files: [], groups: [], previa: null };
        el.innerHTML = `<div class="page">
          <div class="page-head"><div class="ttl"><h1>Nova campanha</h1><p class="sub">Monte a campanha em ${PASSOS.length} passos. Nada é publicado antes de você revisar e confirmar.</p></div><div class="row"><button class="btn" data-w="sair">${icon('chevL', 14)}Voltar para as campanhas</button></div></div>
          <div class="mz-steps" id="mz-steps"></div>
          <div class="card"><div class="card-b">
            <section data-p="0"><h2 style="margin-bottom:4px">Formato da publicação</h2><p class="sub" style="margin-bottom:16px">Todas as publicações da campanha usam o mesmo formato.</p><div class="mz-opts" id="mz-fmt"></div><div class="mz-sec" id="mz-story-t"></div><div id="mz-story"></div></section>
            <section data-p="1" hidden><h2 style="margin-bottom:4px">Fonte das mídias</h2><p class="sub" style="margin-bottom:16px">De onde vêm os arquivos desta campanha.</p><div class="mz-opts" id="mz-src" style="margin-bottom:18px"></div><div id="mz-src-body"></div></section>
            <section data-p="2" hidden><h2 style="margin-bottom:4px">Contas de destino</h2><p class="sub" style="margin-bottom:16px">Os Instagrams que vão receber a campanha. Cada item sai em todas as contas marcadas.</p><div id="mz-acc"></div></section>
            <section data-p="3" hidden><h2 style="margin-bottom:4px">Volume e horários</h2><p class="sub" style="margin-bottom:16px">Quantas publicações por dia, por quantos dias e em quais horários (fuso de Brasília).</p>
              <div class="cols-3"><div class="field"><label class="f" id="mz-ppd-l">Publicações por dia</label><input class="inp" type="number" min="1" max="25" id="mz-ppd" value="3"></div><div class="field"><label class="f">Quantidade de dias</label><input class="inp" type="number" min="1" max="365" id="mz-days" value="30"></div><div class="field"><label class="f">Data de início</label><input class="inp" type="date" id="mz-start" value="${hoje}"></div></div>
              <div class="note" id="mz-total" style="margin-bottom:16px"></div>
              <div class="field"><label class="f">Horários do dia</label><div id="mz-times"></div><div class="hint">Defina um horário para cada publicação do dia. Se houver menos horários que publicações, eles se repetem e a trava de segurança barra a campanha.</div></div>
              <div class="cols-2"><div class="field"><label class="f">Variação aleatória de cada horário (± minutos)</label><input class="inp" type="number" min="0" max="30" id="mz-jit" value="5"><div class="hint">Evita publicar sempre no mesmo minuto exato, o que parece robô. Use 0 para horário cravado.</div></div>
                <div class="field"><label class="f">Ordem das mídias</label><label class="check" style="padding-top:8px"><input type="checkbox" id="mz-shuf"><span>Embaralhar a ordem<div class="hint" style="margin-top:3px">Os arquivos entram na grade em ordem aleatória, em vez da ordem de envio.</div></span></label></div></div>
              <details class="mz-d"><summary>Bloqueios (opcional): dias, datas ou horários em que a campanha não publica</summary><div id="mz-sus" style="padding-top:10px"></div></details></section>
            <section data-p="4" hidden><h2 style="margin-bottom:4px">Legendas</h2><p class="sub" style="margin-bottom:16px">Como a legenda de cada post é gerada.</p><div id="mz-cap"></div><div id="mz-cap-story" hidden>${ui.note('info', 'Stories não aceitam legenda pela API do Instagram. Este passo não se aplica a esta campanha.')}</div></section>
            <section data-p="5" hidden><h2 style="margin-bottom:4px">Revisão e prévia</h2><p class="sub" style="margin-bottom:16px">Confira a grade gerada e os avisos antes de criar.</p><div class="field" style="max-width:520px"><label class="f">Nome da campanha (opcional)</label><input class="inp" id="mz-name" placeholder="Ex.: DNA Empreendedor, julho"></div><div id="mz-rev"></div></section>
          </div></div>
          <div class="row" style="margin-top:16px"><button class="btn" data-w="voltar">${icon('chevL', 14)}Voltar</button><span class="grow"></span><span id="mz-fim" class="row" hidden><button class="btn" data-w="criar" data-modo="draft">Salvar rascunho</button><button class="btn" data-w="criar" data-modo="scheduled">${icon('calendar', 14)}Agendar início</button><button class="btn pri" data-w="criar" data-modo="active">${icon('rocket', 14)}Iniciar agora</button></span><button class="btn pri" data-w="avancar">Continuar${icon('chevR', 14)}</button></div></div>`;
        const $ = (s) => el.querySelector(s);

        const edStory = editorStories({}, () => W.format, () => total());
        const edTimes = editorHorarios(['09:00', '12:00', '18:00'], { getCount: () => int($('#mz-ppd').value, 1), onChange: () => total() });
        const edSus = editorBloqueios({}); const edCap = editorLegenda('fixed', {}); const edAcc = seletorContas(S.contas, []);
        $('#mz-story').appendChild(edStory.el); $('#mz-times').appendChild(edTimes.el); $('#mz-sus').appendChild(edSus.el); $('#mz-cap').appendChild(edCap.el); $('#mz-acc').appendChild(edAcc.el);

        const cfgAtual = () => ({ format: W.format, posts_per_day: int($('#mz-ppd').value), total_days: int($('#mz-days').value), start_date: $('#mz-start').value, times: edTimes.get(), jitter_minutes: Math.max(0, Math.min(30, int($('#mz-jit').value, 5))), story: edStory.get(), suspensions: edSus.get() });
        const nMidias = () => W.source === 'drive' ? null : W.format === 'carousel' ? W.groups.filter((g) => g.files.length >= 2).length : W.files.length;

        function total() {
          const c = cfgAtual(), base = c.posts_per_day * c.total_days, burst = c.format === 'story' ? c.story.stories_per_burst : 1, mirror = c.format !== 'story' && c.story.mirror_to_story;
          const box = $('#mz-total'); if (!box) return;
          box.innerHTML = `${icon('chart', 17)}<div>Total a gerar: <strong class="num">${fmt.n(base * burst * (mirror ? 2 : 1))}</strong> publicações${mirror ? ` (${fmt.n(base)} no feed + ${fmt.n(base)} em stories)` : burst > 1 ? ` (${fmt.n(base)} horários x ${burst} stories)` : ''}${nMidias() != null ? ` · você tem <strong class="num">${fmt.n(nMidias())}</strong> ${W.format === 'carousel' ? 'carrossel(éis)' : 'mídia(s)'} enviada(s)` : ''}</div>`;
        }

        function passos() {
          $('#mz-steps').innerHTML = PASSOS.map((p, i) => `<span class="mz-step ${i === W.passo ? 'on' : i < W.visto ? 'done' : ''}" data-ir="${i}"><b>${i < W.visto && i !== W.passo ? icon('check', 11) : i + 1}</b>${p}</span>`).join('');
          el.querySelectorAll('section[data-p]').forEach((s) => { s.hidden = int(s.dataset.p) !== W.passo; });
          const fim = W.passo === PASSOS.length - 1;
          $('#mz-fim').hidden = !fim; $('[data-w=avancar]').hidden = fim; $('[data-w=voltar]').style.visibility = W.passo ? '' : 'hidden';
        }
        function formato() {
          $('#mz-fmt').innerHTML = Object.entries(FORMATOS).map(([k, f]) => `<div class="mz-opt ${W.format === k ? 'on' : ''}" data-fmt="${k}"><span class="i">${icon(f.ic, 18)}</span><div><strong>${f.nome}</strong><span>${f.desc}</span></div></div>`).join('');
          $('#mz-story-t').textContent = W.format === 'story' ? 'Configurações de Stories' : 'Stories';
          edStory.render();
          $('#mz-ppd-l').textContent = W.format === 'story' ? 'Sequências de stories por dia' : 'Publicações por dia';
          $('#mz-cap').hidden = W.format === 'story'; $('#mz-cap-story').hidden = W.format !== 'story';
          fonte(); total();
        }

        // ----- passo 2: fonte -----
        function fonte() {
          $('#mz-src').innerHTML = `<div class="mz-opt ${W.source === 'upload' ? 'on' : ''}" data-src="upload"><span class="i">${icon('upload', 18)}</span><div><strong>Upload direto</strong><span>Envie os arquivos do seu computador, vários de uma vez.</span></div></div>
            <div class="mz-opt ${W.source === 'drive' ? 'on' : ''}" data-src="drive"><span class="i">${icon('folder', 18)}</span><div><strong>Google Drive</strong><span>Puxa de uma pasta. ${W.drive == null ? '' : W.drive ? 'Conectado.' : 'Ainda não conectado.'}</span></div></div>`;
          const box = $('#mz-src-body');
          if (W.source === 'drive') {
            box.innerHTML = `<div class="row" style="margin-bottom:12px"><strong style="font-size:13.5px">Google Drive</strong>${W.drive == null ? '<span class="spin" style="width:14px;height:14px"></span>' : W.drive ? '<span class="badge b-green">Conectado</span>' : '<span class="badge b-red">Desconectado</span>'}<span class="grow"></span><button class="btn sm" data-w="guia">${icon('link', 13)}${W.drive ? 'Reconectar ou trocar conta' : 'Conectar agora'}</button></div>
              ${W.drive === false ? ui.note('warn', 'O Google Drive não está conectado. Conecte para usar uma pasta como fonte, ou escolha Upload direto.') : ''}
              <div class="field"><label class="f">Link da pasta (compartilhada como "qualquer pessoa com o link")</label><div class="row" style="flex-wrap:nowrap"><input class="inp" id="mz-durl" placeholder="https://drive.google.com/drive/folders/..." value="${e(W.driveUrl || '')}"><button class="btn" data-w="testar">${icon('eye', 14)}Testar pasta</button></div>
              <div class="hint">${W.format === 'carousel' ? 'Carrossel: cada subpasta dentro da pasta principal vira 1 carrossel (2 a 10 arquivos), na ordem do nome da subpasta (1, 2, 3...).' : W.format === 'video' ? 'Só os vídeos da pasta entram, em ordem de nome.' : W.format === 'image' ? 'Só as imagens da pasta entram, em ordem de nome.' : 'Imagens e vídeos da pasta entram, em ordem de nome.'} Os arquivos só são baixados na hora de cada publicação.</div></div><div id="mz-dres"></div>`;
            if (W.driveTest) resultadoDrive();
          } else if (W.format === 'carousel') {
            if (!W.groups.length) W.groups.push({ name: 'Carrossel 1', files: [] });
            box.innerHTML = `<div id="mz-groups"></div><div class="row" style="margin-top:4px"><button class="btn" data-w="add-grupo">${icon('plus', 14)}Novo carrossel</button></div><div id="mz-prog" style="margin-top:14px" hidden></div>${ui.note('info', 'Os arquivos ficam guardados no servidor até a publicação ser confirmada. Só depois são apagados.', 'shield').replace('class="note', 'style="margin:16px 0 0" class="note')}`;
            grupos();
          } else {
            box.innerHTML = `<div class="drop" id="mz-drop">${icon('upload', 22)}<div style="margin-top:8px"><strong>Clique aqui</strong> ou arraste os arquivos</div><div class="tiny" style="margin-top:4px">${W.format === 'video' ? 'Vídeos' : W.format === 'image' ? 'Imagens' : 'Imagens e vídeos'} · até 500 arquivos por envio, 500 MB cada</div><input type="file" id="mz-file" multiple hidden accept="${FORMATOS[W.format].accept}"></div>
              <div id="mz-prog" style="margin-top:14px" hidden></div><div id="mz-files" style="margin-top:14px"></div>${ui.note('info', 'Os arquivos ficam guardados no servidor até a publicação ser confirmada. Só depois são apagados.', 'shield').replace('class="note', 'style="margin:16px 0 0" class="note')}`;
            const dz = $('#mz-drop');
            dz.addEventListener('dragover', (ev) => { ev.preventDefault(); dz.classList.add('over'); });
            dz.addEventListener('dragleave', () => dz.classList.remove('over'));
            dz.addEventListener('drop', (ev) => { ev.preventDefault(); dz.classList.remove('over'); if (ev.dataTransfer.files.length) subir(ev.dataTransfer.files, null); });
            dz.addEventListener('click', (ev) => { if (ev.target.id !== 'mz-file') $('#mz-file').click(); });
            $('#mz-file').addEventListener('change', (ev) => { subir(ev.target.files, null); ev.target.value = ''; });
            arquivos();
          }
        }
        function arquivos() {
          const box = $('#mz-files'); if (!box) return;
          box.innerHTML = W.files.length ? `<div class="row" style="margin-bottom:8px"><strong class="grow" style="font-size:13px">${W.files.length} arquivo(s) prontos para a campanha</strong><button class="btn sm ghost danger" data-w="limpar">${icon('trash', 13)}Limpar tudo</button></div><div class="mz-files list">${W.files.map((f, i) => `<div class="li" style="padding:8px 12px"><span class="thumb" style="width:32px;height:32px;flex-basis:32px">${icon(isVideo(f) ? 'video' : 'image', 15)}</span><span class="grow trunc small">${e(f.original_name)}</span><span class="tiny mute num">${mb(f.size)}</span><span class="icon-btn" data-rm-file="${i}" title="Remover da lista">${icon('x', 14)}</span></div>`).join('')}</div>` : '';
          total();
        }
        function grupos() {
          const box = $('#mz-groups'); if (!box) return;
          box.innerHTML = W.groups.map((g, gi) => `<div class="card" style="margin-bottom:12px"><div class="card-h"><input class="inp" style="max-width:240px;padding:6px 10px" data-g-name="${gi}" value="${e(g.name)}"><span class="small mute grow">${g.files.length} de 10 lâminas${g.files.length < 2 ? ' · precisa de pelo menos 2' : ''}</span><button class="btn sm" data-g-add="${gi}">${icon('plus', 13)}Adicionar lâminas</button><span class="icon-btn" data-g-rm="${gi}" title="Remover carrossel">${icon('trash', 15)}</span><input type="file" multiple hidden accept="image/*,video/*" data-g-file="${gi}"></div>
            <div class="card-b">${g.files.length ? `<div class="mz-gal" style="grid-template-columns:repeat(auto-fill,minmax(104px,1fr))">${g.files.map((f, fi) => `<div class="mz-g">${thumbHtml({ url: f.url, mimeType: f.mimetype }, 'carousel', true, `<span class="n">${fi + 1}</span>`)}<div class="f"><span class="icon-btn" style="width:26px;height:26px" data-s-mv="${gi}:${fi}:-1" title="Mover para a esquerda">${icon('chevL', 13)}</span><span class="icon-btn" style="width:26px;height:26px;color:var(--red)" data-s-rm="${gi}:${fi}" title="Remover lâmina">${icon('x', 13)}</span><span class="icon-btn" style="width:26px;height:26px" data-s-mv="${gi}:${fi}:1" title="Mover para a direita">${icon('chevR', 13)}</span></div></div>`).join('')}</div>` : '<div class="small mute" style="text-align:center;padding:10px">Nenhuma lâmina ainda. Clique em "Adicionar lâminas".</div>'}</div></div>`).join('');
          lazyMedia(box); total();
        }
        async function subir(fileList, gi) {
          if (!fileList || !fileList.length) return;
          if (S.upload) return ui.toast('Aguarde o envio atual terminar', 'err');
          const g = gi != null ? W.groups[gi] : null;
          if (g && g.files.length + fileList.length > 10) return ui.toast('Cada carrossel pode ter no máximo 10 lâminas', 'err');
          const prog = $('#mz-prog'); prog.hidden = false;
          prog.innerHTML = `<div class="bar" style="height:8px"><i style="width:0%;background:var(--amber)"></i></div><div class="row small" style="margin-top:8px"><span class="grow mute" data-t>Enviando ${fileList.length} arquivo(s)${g ? ' para ' + e(g.name) : ''}...</span><button class="btn sm ghost danger" data-w="cancelar-envio">${icon('x', 13)}Cancelar envio</button></div>`;
          const bar = prog.querySelector('i'), txt = prog.querySelector('[data-t]');
          S.upload = enviarArquivos(fileList, (p) => { bar.style.width = p + '%'; txt.textContent = p < 100 ? `Enviando... ${p}%` : 'Processando no servidor...'; });
          try {
            const r = await S.upload.promise;
            if (g) g.files.push(...r.files); else W.files = W.files.concat(r.files);
            prog.innerHTML = `<div class="small" style="color:var(--green);font-weight:600">${fmt.n(r.count)} arquivo(s) enviado(s)${g ? ' para ' + e(g.name) : '. Total na campanha: ' + W.files.length}</div>`;
            g ? grupos() : arquivos();
          } catch (ex) { prog.innerHTML = `<div class="small" style="color:var(--red);font-weight:600">${e(ex.message)}</div>`; }
          finally { S.upload = null; }
        }
        function resultadoDrive() {
          const box = $('#mz-dres'), d = W.driveTest; if (!box || !d) return;
          box.innerHTML = d.error ? ui.error(d.error) : ui.note('ok', `<strong>Pasta acessível.</strong> ${fmt.n(d.total_files)} arquivo(s) · ${fmt.n(d.media_files)} mídia(s) · ${fmt.n(d.subfolders)} subpasta(s).${W.format === 'carousel' ? ' Para carrossel, contam as subpastas.' : ''}${d.test_download ? `<br>Amostra baixada com sucesso: ${e(d.test_download.name)} (${mb(d.test_download.size)})` : ''}`);
        }
        async function testarDrive(btn) {
          W.driveUrl = $('#mz-durl').value.trim(); if (!W.driveUrl) return ui.toast('Cole o link da pasta primeiro', 'err');
          ui.busy(btn, true, 'Testando');
          try { W.driveTest = await api.post('/drive/test', { drive_url: W.driveUrl }); } catch (ex) { W.driveTest = { error: ex.message }; }
          ui.busy(btn, false); resultadoDrive();
        }
        async function statusDrive() { try { W.drive = !!(await api.get('/drive/status')).connected; } catch (_) { W.drive = false; } if (S.modo === 'wizard' && $('#mz-src')) { if ($('#mz-durl')) W.driveUrl = $('#mz-durl').value; fonte(); } }

        // ----- validação por passo -----
        function validar(p) {
          if (p === 1) {
            if (S.upload) return 'Aguarde o envio dos arquivos terminar.';
            if (W.source === 'drive') { W.driveUrl = ($('#mz-durl') ? $('#mz-durl').value : W.driveUrl || '').trim(); if (!W.driveUrl) return 'Cole o link da pasta do Google Drive.'; if (W.drive === false) return 'Conecte o Google Drive ou escolha Upload direto.'; }
            else if (W.format === 'carousel') { if (!W.groups.some((g) => g.files.length >= 2)) return 'Monte ao menos 1 carrossel com 2 a 10 lâminas.'; }
            else if (!W.files.length) return 'Envie pelo menos 1 arquivo.';
          }
          if (p === 2 && !edAcc.get().length) return 'Selecione ao menos 1 conta.';
          if (p === 3) { const c = cfgAtual(); if (c.posts_per_day < 1 || c.total_days < 1) return 'Informe publicações por dia e quantidade de dias.'; if (!c.start_date) return 'Escolha a data de início.'; if (!c.times.length) return 'Adicione pelo menos 1 horário.'; }
          return '';
        }
        function ir(p) {
          p = Math.max(0, Math.min(PASSOS.length - 1, p));
          for (let i = W.passo; i < p; i++) { const m = validar(i); if (m) { W.passo = i; passos(); return ui.toast(m, 'err'); } }
          W.passo = p; W.visto = Math.max(W.visto, p); passos(); window.scrollTo(0, 0);
          if (p === PASSOS.length - 1) revisar();
        }

        // ----- passo 6: prévia -----
        async function revisar() {
          const box = $('#mz-rev'), c = cfgAtual(), grade = montarGrade(c), viol = checarLimites(c), contas = S.contas.filter((a) => edAcc.get().includes(a.id));
          const cap = edCap.get(), agora = Date.now() / 1000;
          W.previa = { bloqueado: true };
          box.innerHTML = ui.loading('Montando a prévia...');
          let pv = null, pvErr = '';
          try { pv = await api.post('/bulk/preview', { drive_url: W.source === 'drive' ? W.driveUrl : null, post_format: W.format, posts_per_day: c.posts_per_day, total_days: c.total_days }); } catch (ex) { pvErr = ex.message; }
          if (S.modo !== 'wizard' || W.passo !== PASSOS.length - 1) return;
          const midias = W.source === 'drive' ? (pv && pv.drive_items != null ? pv.drive_items : null) : nMidias();
          const problemas = []; [1, 2, 3].forEach((p) => { const m = validar(p); if (m) problemas.push(m); });
          if (cap.mode === 'ai' && W.format !== 'story' && !String(cap.config.prompt || '').trim()) problemas.push('Escreva a instrução para a IA gerar as legendas.');
          if (!grade.length && !problemas.length) problemas.push('A grade ficou vazia: os bloqueios cobrem todos os horários do período.');
          if (W.source === 'drive' && pvErr) problemas.push('Não consegui ler a pasta do Drive: ' + pvErr);
          if (midias === 0) problemas.push(W.format === 'carousel' ? 'Nenhum carrossel válido encontrado (cada um precisa de 2 a 10 arquivos).' : 'Nenhuma mídia compatível com o formato foi encontrada.');
          const avisos = [];
          const usados = midias != null ? Math.min(midias, grade.length) : grade.length;
          if (midias != null && midias > grade.length && grade.length) avisos.push(`Você tem <strong>${fmt.n(midias)}</strong> mídias, mas a grade comporta <strong>${fmt.n(grade.length)}</strong>. <strong>${fmt.n(midias - grade.length)}</strong> ficariam de fora e não seriam publicadas. Para usar todas, aumente para ${Math.ceil(midias / Math.max(1, c.posts_per_day * (c.format === 'story' ? c.story.stories_per_burst : 1)))} dias ou acrescente horários.`);
          if (midias != null && midias > 0 && midias < grade.length) avisos.push(`A grade tem ${fmt.n(grade.length)} horários, mas há ${fmt.n(midias)} mídia(s). A campanha termina antes, com ${fmt.n(midias)} publicações.`);
          const passados = grade.slice(0, usados).filter((t) => t < agora - 1800).length;
          if (passados) avisos.push(`${passados} horário(s) da grade já passaram (data de início ou horários anteriores a agora). Com a campanha ativa, o sistema remarca esses itens para os próximos horários livres.`);
          if (c.story.mirror_to_story && c.format !== 'story') avisos.push('Espelhamento ligado: cada post do feed sai também como story, o que dobra o volume diário contado pela Meta.');
          if (cap.mode === 'fixed' && W.format !== 'story' && !String(cap.config.text || '').trim()) avisos.push('A legenda padrão está vazia: os posts vão sair sem legenda.');
          if (cap.mode === 'shuffle' && W.format !== 'story' && !String(cap.config.text || '').trim()) avisos.push('O texto base das estrofes está vazio: os posts vão sair sem legenda.');
          contas.filter((a) => a.status === 'expiring').forEach((a) => avisos.push('Token expirando em @' + e(a.platform_username) + '. Reconecte para a campanha não falhar no meio.'));
          W.previa = { bloqueado: !!(problemas.length || viol.length), usados, grade, contas, c };
          // grade agrupada por dia (só os horários que de fato recebem mídia)
          const porDia = {}; grade.slice(0, usados).forEach((ts) => { const k = fmt.ymd(new Date(ts * 1000)); (porDia[k] = porDia[k] || []).push(ts); });
          const dias = Object.keys(porDia), MAXD = 14;
          const capTxt = W.format === 'story' ? 'Sem legenda (Stories)' : cap.mode === 'fixed' ? 'Legenda padrão' : cap.mode === 'ai' ? 'IA (' + cap.config.provider + ')' : `Embaralhar estrofes (${cap.config.stanzas_per_post} por post)`;
          box.innerHTML = `${problemas.map((p) => ui.note('err', e(p))).join('')}
            ${viol.length ? `<div class="mz-sec" style="margin-top:0">Trava de segurança de volume</div>${viol.map((v) => ui.note('err', v, 'shield')).join('')}` : (!problemas.length ? ui.note('ok', 'Volume dentro do limite seguro do Instagram para publicação por API.', 'shield') : '')}
            ${avisos.map((a) => ui.note('warn', a)).join('')}
            <div class="mz-stats"><div><div class="l">Publicações</div><div class="v">${fmt.n(usados)}${c.story.mirror_to_story && c.format !== 'story' ? ' <span class="small mute">+ ' + fmt.n(usados) + ' stories</span>' : ''}</div></div><div><div class="l">Formato</div><div class="v" style="font-size:14px">${e(FORMATOS[W.format].nome)}</div></div><div><div class="l">Mídias disponíveis</div><div class="v">${midias == null ? '-' : fmt.n(midias)}</div></div><div><div class="l">Primeira</div><div class="v" style="font-size:14px">${usados ? e(fmt.dt(grade[0])) : '-'}</div></div><div><div class="l">Última</div><div class="v" style="font-size:14px">${usados ? e(fmt.dt(grade[usados - 1])) : '-'}</div></div></div>
            <table class="tb" style="margin-bottom:8px"><tbody>
              <tr><td class="mute" style="width:170px">Contas</td><td>${contas.map((a) => '@' + e(a.platform_username)).join(', ') || '-'}</td></tr>
              <tr><td class="mute">Fonte</td><td>${W.source === 'drive' ? 'Google Drive' : 'Upload direto'}${pv ? ` <span class="mute">· o servidor calculou ${fmt.n(pv.total_slots)} horário(s) base (${fmt.n(c.posts_per_day)} por dia x ${fmt.n(c.total_days)} dias)</span>` : ''}</td></tr>
              <tr><td class="mute">Horários</td><td>${e(c.times.join(', ') || '-')} <span class="mute">(±${c.jitter_minutes} min${$('#mz-shuf').checked ? ', ordem embaralhada' : ''})</span></td></tr>
              <tr><td class="mute">Legendas</td><td>${e(capTxt)}</td></tr></tbody></table>
            <div class="mz-sec">Grade gerada${dias.length > MAXD ? ` (primeiros ${MAXD} de ${dias.length} dias)` : ''}</div>
            ${dias.length ? `<div class="scroll-x" style="border:1px solid var(--line);border-radius:12px"><table class="tb"><thead><tr><th>Dia</th><th>Qtd</th><th>Horários</th></tr></thead><tbody>${dias.slice(0, MAXD).map((k) => `<tr><td style="white-space:nowrap">${e(new Date(k + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }))}</td><td class="num">${porDia[k].length}</td><td><div class="mz-chips" style="gap:5px">${porDia[k].map((ts) => `<span class="tag num">${e(fmt.time(ts))}</span>`).join('')}</div></td></tr>`).join('')}</tbody></table></div><div class="hint">Os minutos exatos variam até ±${c.jitter_minutes} min, sorteados pelo servidor na criação. Dias bloqueados não aparecem.</div>` : '<div class="small mute">Sem horários para mostrar.</div>'}`;
          el.querySelectorAll('[data-w=criar]').forEach((b) => { b.disabled = W.previa.bloqueado; });
        }

        // ----- criar -----
        async function criar(modo, btn) {
          const pv = W.previa; if (!pv || pv.bloqueado) return ui.toast('Resolva os pontos em vermelho antes de criar', 'err');
          const c = cfgAtual(), viol = checarLimites(c); if (viol.length) return modalLimites(viol);
          let inicio = null;
          if (modo === 'scheduled') {
            inicio = await new Promise((res) => { let ok = false; ui.modal({ title: 'Agendar início da campanha', body: `<p class="sub" style="margin-bottom:16px">A campanha fica como Programada e só começa a publicar a partir do momento escolhido.</p><label class="f">Data e hora de início</label><input class="inp" type="datetime-local" id="mz-ag2" value="${fmt.local(Math.floor(Date.now() / 1000) + 3600)}">`, onClose: () => { if (!ok) res(null); }, actions: [{ label: 'Cancelar' }, { label: 'Confirmar', kind: 'pri', onClick: (close) => { const v = document.getElementById('mz-ag2').value; if (!v) return ui.toast('Escolha data e hora', 'err'); ok = true; res(v); close(); } }] }); });
            if (!inicio) return;
          }
          if (modo === 'active') {
            const ok = await ui.confirm({ title: 'Iniciar campanha agora', ok: 'Criar e iniciar', html: `A campanha começa a valer imediatamente: <strong>${fmt.n(pv.usados)}</strong> publicação(ões) em <strong>${pv.contas.map((a) => '@' + e(a.platform_username)).join(', ')}</strong>, de <strong>${e(fmt.dt(pv.grade[0]))}</strong> até <strong>${e(fmt.dt(pv.grade[pv.usados - 1]))}</strong>. Se preferir conferir as mídias antes, salve como rascunho e inicie pela lista.` });
            if (!ok) return;
          }
          const cap = edCap.get();
          const body = { name: $('#mz-name').value.trim() || null, save_mode: modo, scheduled_start_at: inicio, source_type: W.source,
            drive_url: W.source === 'drive' ? W.driveUrl : null,
            uploaded_files: W.source === 'upload' && W.format !== 'carousel' ? W.files : null,
            uploaded_carousel_groups: W.source === 'upload' && W.format === 'carousel' ? W.groups.filter((g) => g.files.length >= 2).map((g) => ({ name: g.name, files: g.files })) : null,
            post_format: W.format, account_ids: edAcc.get(), posts_per_day: c.posts_per_day, total_days: c.total_days, times: c.times, start_date: c.start_date, jitter_minutes: c.jitter_minutes,
            caption_mode: W.format === 'story' ? 'fixed' : cap.mode, caption_config: W.format === 'story' ? { text: '' } : cap.config, story_config: c.story, suspensions: c.suspensions, shuffle_order: $('#mz-shuf').checked };
          ui.busy(btn, true, modo === 'draft' ? 'Salvando' : modo === 'scheduled' ? 'Programando' : 'Iniciando');
          try {
            const r = await api.post('/bulk/campaigns', body);
            const msg = (modo === 'draft' ? 'Rascunho salvo' : modo === 'scheduled' ? 'Campanha programada' : 'Campanha ativa') + `. ${fmt.n(r.total_scheduled)} publicação(ões) agendada(s).`;
            W.files = []; W.groups = []; voltarLista();
            ui.toast(msg, 'ok');
            if (r.aviso) ui.modal({ title: 'Atenção ao volume', body: ui.note('warn', e(r.aviso)), actions: [{ label: 'Entendi', kind: 'pri' }] });
          } catch (ex) { ui.busy(btn, false); /^Limite de segurança/.test(ex.message) ? modalLimites(ex.message.replace(/^Limite de segurança da plataforma:\s*/, '').split(' | ').map(e)) : err(ex); }
        }

        async function sair() {
          const temEnvio = W.files.length || W.groups.some((g) => g.files.length) || S.upload;
          if (temEnvio && !(await ui.confirm({ title: 'Sair do assistente', danger: true, ok: 'Sair e descartar', text: 'Os arquivos já enviados deixam de estar ligados a uma campanha e a configuração feita até aqui é descartada.' }))) return;
          if (S.upload) S.upload.abort();
          voltarLista();
        }

        // eventos do assistente (delegados no #app; removidos ao voltar para a lista)
        W.onClick = (ev) => {
          const t = ev.target;
          const f = t.closest('[data-fmt]'); if (f) {
            if (S.upload) return ui.toast('Aguarde o envio terminar', 'err');
            const novo = f.dataset.fmt; if (novo === W.format) return;
            // trocar de formato muda o tipo de arquivo aceito: a lista enviada deixa de valer
            if ((W.files.length || W.groups.some((g) => g.files.length)) && (novo === 'carousel') !== (W.format === 'carousel')) { W.files = []; W.groups = []; ui.toast('Formato trocado: a lista de arquivos enviados foi limpa'); }
            W.format = novo; W.driveTest = null; formato(); return;
          }
          const s = t.closest('[data-src]'); if (s) { if ($('#mz-durl')) W.driveUrl = $('#mz-durl').value; W.source = s.dataset.src; fonte(); total(); return; }
          const st = t.closest('[data-ir]'); if (st) return ir(int(st.dataset.ir));
          const rf = t.closest('[data-rm-file]'); if (rf) { W.files.splice(int(rf.dataset.rmFile), 1); return arquivos(); }
          const ga = t.closest('[data-g-add]'); if (ga) return el.querySelector(`[data-g-file="${ga.dataset.gAdd}"]`).click();
          const gr = t.closest('[data-g-rm]'); if (gr) { W.groups.splice(int(gr.dataset.gRm), 1); return grupos(); }
          const mv = t.closest('[data-s-mv]'); if (mv) { const [gi, fi, d] = mv.dataset.sMv.split(':').map(Number), fs = W.groups[gi].files, j = fi + d; if (j >= 0 && j < fs.length) { [fs[fi], fs[j]] = [fs[j], fs[fi]]; grupos(); } return; }
          const sr = t.closest('[data-s-rm]'); if (sr) { const [gi, fi] = sr.dataset.sRm.split(':').map(Number); W.groups[gi].files.splice(fi, 1); return grupos(); }
          const b = t.closest('[data-w]'); if (!b) return;
          const a = b.dataset.w;
          if (a === 'sair') sair(); else if (a === 'voltar') ir(W.passo - 1); else if (a === 'avancar') ir(W.passo + 1);
          else if (a === 'guia') guiaDrive(statusDrive); else if (a === 'testar') testarDrive(b);
          else if (a === 'limpar') { W.files = []; arquivos(); }
          else if (a === 'add-grupo') { W.groups.push({ name: 'Carrossel ' + (W.groups.length + 1), files: [] }); grupos(); }
          else if (a === 'cancelar-envio') { if (S.upload) S.upload.abort(); }
          else if (a === 'criar') criar(b.dataset.modo, b);
        };
        W.onInput = (ev) => {
          const t = ev.target;
          if (t.dataset.gName != null) { W.groups[int(t.dataset.gName)].name = t.value; return; }
          if (['mz-ppd', 'mz-days'].includes(t.id)) total();
        };
        W.onChange = (ev) => { const t = ev.target; if (t.dataset.gFile != null) { subir(t.files, int(t.dataset.gFile)); t.value = ''; } };
        el.addEventListener('click', W.onClick); el.addEventListener('input', W.onInput); el.addEventListener('change', W.onChange);
        S.wizard = W;

        passos(); formato(); statusDrive();
      }

      function voltarLista() {
        const W = S.wizard;
        if (W) { el.removeEventListener('click', W.onClick); el.removeEventListener('input', W.onInput); el.removeEventListener('change', W.onChange); S.wizard = null; }
        S.modo = 'lista'; shell(); renderWorker(); renderLista(); recarregar(); window.scrollTo(0, 0);
      }

      // ===== eventos da lista =====
      const onClick = (ev) => {
        if (S.modo !== 'lista') return;
        const f = ev.target.closest('#mz-filtro [data-f]'); if (f) { S.filtro = f.dataset.f; el.querySelectorAll('#mz-filtro [data-f]').forEach((b) => b.classList.toggle('on', b === f)); fecharMenus(); return renderLista(); }
        const b = ev.target.closest('[data-act]');
        if (!b) return fecharMenus();
        const a = b.dataset.act, id = int(b.dataset.id);
        if (a === 'menu') return abrirMenu(b, id);
        fecharMenus();
        if (a === 'nova') assistente(); else if (a === 'recarregar') { ui.busy(b, true, 'Atualizando'); recarregar().finally(() => ui.busy(b, false)); }
        else if (a === 'detalhes') detalhes(id); else if (a === 'midias') galeria(id); else if (a === 'editar') editar(id);
        else if (a === 'pausar') pausar(id, b); else if (a === 'ativar') ativar(id); else if (a === 'agendar') agendarExistente(id);
        else if (a === 'recalcular') recalcular(id); else if (a === 'debug') debug(id); else if (a === 'excluir') excluir(id);
      };
      el.addEventListener('click', onClick);

      shell();
      await recarregar();
      ZP.every(30, () => recarregar(true));
      if (params && params.nova) assistente(); else if (params && params.id && camp(params.id)) detalhes(int(params.id));

      // limpeza ao sair da tela: corta envio em andamento e solta os ouvintes do #app
      return () => { S.vivo = false; if (S.upload) S.upload.abort(); el.removeEventListener('click', onClick); if (S.wizard) { el.removeEventListener('click', S.wizard.onClick); el.removeEventListener('input', S.wizard.onInput); el.removeEventListener('change', S.wizard.onChange); } };
    },
  };
})();
