// Novo post / edição: conteúdo, mídia, contas de destino e quando publicar, com prévia ao lado.
(function () {
  const { api, ui, fmt, e, icon } = ZP;
  const CAPTION_MAX = 2200, HASHTAG_MAX = 30; // limites do Instagram

  async function mount(el, params) {
    const contas = await ZP.accounts();
    let post = null;
    if (params.id) { post = (await api.get('/posts')).find((p) => String(p.id) === String(params.id)); if (!post) throw new Error('Post #' + params.id + ' não encontrado.'); }
    const editavel = !post || ['draft', 'scheduled', 'failed'].includes(post.status);
    const f = {
      title: post ? post.title || '' : '', caption: post ? post.caption || '' : '',
      media_path: post ? post.media_path || '' : '', media_type: post ? (String(post.media_type || '').startsWith('video') ? 'video' : 'image') : '',
      destino: post && post.post_type === 'story' ? 'story' : 'feed', contas: post ? post.account_ids.slice() : [],
      modo: post ? (post.scheduled_at ? 'agendar' : 'rascunho') : (params.date ? 'agendar' : 'agora'),
      quando: post && post.scheduled_at ? fmt.local(post.scheduled_at) : (params.date ? params.date + 'T18:00' : ''),
    };

    el.innerHTML = `<div class="page">
      <div class="page-head">
        <div class="ttl"><h1>${post ? 'Editar post #' + post.id : 'Novo post'}</h1><p class="sub">${post ? 'Ajuste o conteúdo, as contas ou o horário.' : 'Publique agora, agende um horário ou guarde como rascunho.'}</p></div>
        <div class="row"><a class="btn" href="#/calendario">${icon('chevL', 13)}Calendário</a>${post ? ui.badge(post.status) : ''}</div>
      </div>
      ${!editavel ? ui.note('info', 'Este post já foi publicado (ou está publicando) e não pode mais ser alterado. Você pode usar o conteúdo dele como base: mude o que quiser e salve como um post novo.') : ''}
      <div class="two">
        <div>
          <div class="card" style="margin-bottom:16px"><div class="card-h"><h3 class="grow">Formato</h3></div><div class="card-b">
            <span class="seg" id="n-destino"><span data-v="feed">${icon('image', 13)}Feed ou Reels</span><span data-v="story">${icon('story', 13)}Story</span></span>
            <div class="hint" id="n-destino-hint"></div></div></div>

          <div class="card" style="margin-bottom:16px"><div class="card-h"><h3 class="grow">Conteúdo</h3></div><div class="card-b">
            <div class="field"><label class="f">Título interno (opcional)</label><input class="inp" id="n-title" maxlength="120" placeholder="Só para você achar o post depois. Ex.: Dica de gestão 12" value="${e(f.title)}"></div>
            <div class="field" id="n-cap-box"><label class="f">Legenda</label><textarea class="txa" id="n-caption" placeholder="Escreva a legenda...">${e(f.caption)}</textarea>
              <div class="row tiny mute" style="margin-top:6px"><span id="n-count"></span><span class="grow"></span><span>Dica: peça no Chat do agente para escrever ou melhorar a legenda.</span></div></div>
            <div class="field" style="margin-bottom:0"><label class="f">Mídia</label>
              <div id="n-media"></div><input type="file" id="n-file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" hidden>
              <div class="hint">Imagem (JPG, PNG, WebP) ou vídeo (MP4, MOV) de até 100 MB. Vídeo no feed sai como Reels.</div></div>
          </div></div>

          <div class="card" style="margin-bottom:16px"><div class="card-h"><h3 class="grow">Onde publicar</h3><span class="small mute" id="n-acc-count"></span></div><div class="card-b">
            ${contas.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px" id="n-accs">${contas.map((a) => `<div class="acc" data-id="${a.id}"><span class="ck">${icon('check', 12)}</span>${ZP.avatar(a)}<div class="grow"><div class="trunc" style="font-size:13.5px;font-weight:500">@${e(a.platform_username)}</div><div class="tiny mute trunc">${e(a.platform_name || a.platform)} · ${fmt.compact(a.followers)} seg.</div></div>${a.status !== 'active' ? ui.badge(a.status === 'expiring' ? 'paused' : a.status).replace('Pausado', 'Reconectar') : ''}</div>`).join('')}</div>`
              : ui.empty('Nenhuma conta conectada', 'Conecte um perfil para poder publicar.', `<a class="btn sm" href="#/contas">Conectar perfil</a>`, 'link')}
          </div></div>

          <div class="card"><div class="card-h"><h3 class="grow">Quando publicar</h3></div><div class="card-b">
            <span class="seg" id="n-modo"><span data-v="agora">${icon('bolt', 13)}Agora</span><span data-v="agendar">${icon('clock', 13)}Agendar</span><span data-v="rascunho">${icon('edit', 13)}Rascunho</span></span>
            <div id="n-quando-box" style="margin-top:14px;max-width:280px"><label class="f">Data e hora (horário de Brasília)</label><input class="inp" type="datetime-local" id="n-quando" value="${e(f.quando)}"></div>
            <div class="hint" id="n-modo-hint"></div>
          </div></div>
        </div>

        <div style="position:sticky;top:16px">
          <div class="card" style="overflow:hidden"><div class="card-h"><h3 class="grow">Prévia</h3><span class="small mute" id="n-prev-tipo"></span></div>
            <div id="n-prev"></div></div>
          <div class="row" style="margin-top:16px;justify-content:flex-end">
            ${post && editavel ? `<button class="btn danger" id="n-del">${icon('trash', 13)}Excluir</button>` : ''}
            <span class="grow"></span><button class="btn pri" id="n-save" style="padding:11px 22px"></button></div>
        </div>
      </div></div>`;

    const $ = (s) => el.querySelector(s);
    const ehVideo = () => f.media_type === 'video';

    function pintar() {
      el.querySelectorAll('#n-destino [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === f.destino));
      el.querySelectorAll('#n-modo [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === f.modo));
      el.querySelectorAll('#n-accs .acc').forEach((a) => a.classList.toggle('on', f.contas.includes(parseInt(a.dataset.id, 10))));
      $('#n-acc-count').textContent = f.contas.length ? f.contas.length + (f.contas.length === 1 ? ' conta selecionada' : ' contas selecionadas') : 'Selecione ao menos uma';
      $('#n-cap-box').hidden = f.destino === 'story';
      $('#n-destino-hint').textContent = f.destino === 'story' ? 'Story exige imagem ou vídeo (até 60 s) e não aceita legenda, link nem enquete pela API da Meta.' : 'Imagem vai para o feed. Vídeo é publicado como Reels.';
      $('#n-quando-box').hidden = f.modo !== 'agendar';
      $('#n-modo-hint').textContent = f.modo === 'agora' ? 'Vai ao ar assim que você confirmar. Vídeos podem levar alguns minutos para a Meta processar.' : f.modo === 'agendar' ? 'O publicador verifica a fila a cada minuto e posta no horário.' : 'Fica guardado sem data. Você agenda depois pelo calendário.';
      $('#n-save').innerHTML = f.modo === 'agora' ? icon('bolt', 14) + 'Publicar agora' : f.modo === 'agendar' ? icon('clock', 14) + (post && editavel ? 'Salvar agendamento' : 'Agendar post') : icon('check', 14) + 'Salvar rascunho';
      const tags = (f.caption.match(/#[\wÀ-ú]+/g) || []).length;
      $('#n-count').innerHTML = `<span style="color:${f.caption.length > CAPTION_MAX ? 'var(--red)' : 'inherit'}">${fmt.n(f.caption.length)} / ${fmt.n(CAPTION_MAX)} caracteres</span> · <span style="color:${tags > HASHTAG_MAX ? 'var(--red)' : 'inherit'}">${tags} / ${HASHTAG_MAX} hashtags</span>`;

      const url = ZP.safeUrl(f.media_path);
      $('#n-media').innerHTML = url
        ? `<div class="row" style="flex-wrap:nowrap;border:1px solid var(--line);border-radius:12px;padding:10px"><span class="thumb" style="width:56px;height:56px;flex-basis:56px">${ehVideo() ? icon('video', 22) : `<img src="${url}" alt="">`}</span><div class="grow"><div class="trunc" style="font-size:13px;font-weight:500">${e(f.media_path.split('/').pop())}</div><div class="tiny mute">${ehVideo() ? 'Vídeo' : 'Imagem'} enviada</div></div><button class="btn sm" id="n-troca">Trocar</button><button class="btn sm danger" id="n-tira">Remover</button></div>`
        : `<div class="drop" id="n-drop"><div style="display:flex;justify-content:center;margin-bottom:8px;color:var(--faint)">${icon('upload', 24)}</div><strong>Clique para escolher</strong> ou arraste o arquivo aqui</div>`;
      const drop = $('#n-drop');
      if (drop) { drop.onclick = () => $('#n-file').click(); drop.ondragover = (x) => { x.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over'); drop.ondrop = (x) => { x.preventDefault(); drop.classList.remove('over'); if (x.dataTransfer.files[0]) enviar(x.dataTransfer.files[0]); }; }
      if ($('#n-troca')) $('#n-troca').onclick = () => $('#n-file').click();
      if ($('#n-tira')) $('#n-tira').onclick = () => { f.media_path = ''; f.media_type = ''; pintar(); };

      // prévia no formato do Instagram
      const c0 = contas.find((a) => f.contas.includes(a.id));
      const story = f.destino === 'story';
      $('#n-prev-tipo').textContent = story ? 'Story' : ehVideo() ? 'Reels' : 'Feed';
      $('#n-prev').innerHTML = `<div style="padding:12px 14px" class="row">${c0 ? ZP.avatar(c0, 30) : ''}<strong style="font-size:13px" class="grow trunc">${c0 ? e(c0.platform_username) : 'sua_conta'}</strong>${f.contas.length > 1 ? `<span class="tag">+${f.contas.length - 1} ${f.contas.length === 2 ? 'conta' : 'contas'}</span>` : ''}</div>
        <div style="background:${url ? '#0F0F12' : 'var(--soft)'};aspect-ratio:${story || ehVideo() ? '9/16' : '1/1'};max-height:440px;width:100%;display:flex;align-items:center;justify-content:center;color:var(--faint);overflow:hidden">
          ${url ? (ehVideo() ? `<video src="${url}" controls muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:contain"></video>` : `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:${story ? 'contain' : 'cover'}">`) : `<div style="text-align:center;font-size:12.5px">${icon('image', 28)}<div style="margin-top:8px">A mídia aparece aqui</div></div>`}</div>
        ${story ? '' : `<div style="padding:12px 14px;font-size:13px;line-height:1.5;white-space:pre-wrap;max-height:150px;overflow:auto">${f.caption ? `<strong>${c0 ? e(c0.platform_username) : 'sua_conta'}</strong> ${e(f.caption)}` : '<span class="faint">A legenda aparece aqui.</span>'}</div>`}`;
    }

    async function enviar(file) {
      if (file.size > 100 * 1024 * 1024) return ui.toast('Arquivo acima de 100 MB.', 'err');
      $('#n-media').innerHTML = `<div class="drop" style="cursor:default"><span class="spin"></span><div style="margin-top:10px">Enviando ${e(file.name)} (${(file.size / 1048576).toFixed(1)} MB)...</div></div>`;
      try { const fd = new FormData(); fd.append('file', file); const r = await api.form('/upload', fd); f.media_path = r.path; f.media_type = String(r.mimetype || file.type).startsWith('video') ? 'video' : 'image'; ui.toast('Mídia enviada', 'ok'); }
      catch (err) { ui.toast('Falha no envio: ' + err.message, 'err'); }
      pintar();
    }
    $('#n-file').onchange = (x) => { if (x.target.files[0]) enviar(x.target.files[0]); x.target.value = ''; };
    $('#n-title').oninput = (x) => { f.title = x.target.value; };
    $('#n-caption').oninput = (x) => { f.caption = x.target.value; pintar(); };
    $('#n-quando').onchange = (x) => { f.quando = x.target.value; };
    el.querySelectorAll('#n-destino [data-v]').forEach((b) => { b.onclick = () => { f.destino = b.dataset.v; pintar(); }; });
    el.querySelectorAll('#n-modo [data-v]').forEach((b) => { b.onclick = () => { f.modo = b.dataset.v; pintar(); }; });
    el.querySelectorAll('#n-accs .acc').forEach((a) => { a.onclick = () => { const id = parseInt(a.dataset.id, 10); f.contas = f.contas.includes(id) ? f.contas.filter((x) => x !== id) : f.contas.concat(id); pintar(); }; });
    if ($('#n-del')) $('#n-del').onclick = async () => { if (!(await ui.confirm({ title: 'Excluir post', text: 'O post sai da agenda e não será publicado.', ok: 'Excluir', danger: true }))) return; try { await api.del('/posts/' + post.id); ui.toast('Post excluído', 'ok'); ZP.go('calendario'); } catch (err) { ui.toast(err.message, 'err'); } };

    $('#n-save').onclick = async () => {
      const story = f.destino === 'story';
      if (story && !f.media_path) return ui.toast('Story precisa de uma imagem ou vídeo.', 'err');
      if (!story && !f.caption.trim()) return ui.toast('Escreva a legenda.', 'err');
      if (!story && f.caption.length > CAPTION_MAX) return ui.toast('A legenda passou de 2.200 caracteres.', 'err');
      if (f.modo !== 'rascunho' && !f.contas.length) return ui.toast('Selecione ao menos uma conta.', 'err');
      if (f.modo !== 'rascunho' && !story && !f.media_path) return ui.toast('O Instagram exige imagem ou vídeo para publicar.', 'err');
      if (f.modo === 'agendar') { if (!f.quando) return ui.toast('Escolha a data e a hora.', 'err'); if (new Date(f.quando) < new Date()) return ui.toast('Esse horário já passou.', 'err'); }
      const nomes = ZP.accName(contas, f.contas);
      if (f.modo === 'agora' && !(await ui.confirm({ title: 'Publicar agora', html: `Vai ao ar <strong>imediatamente</strong> em ${e(nomes)}. Confirma?`, ok: 'Publicar' }))) return;

      const corpo = { title: f.title, caption: story ? '' : f.caption, media_path: f.media_path, media_type: f.media_type || 'image',
        post_type: story ? 'story' : (ehVideo() ? 'video' : 'image'), platforms: [...new Set(contas.filter((a) => f.contas.includes(a.id)).map((a) => a.platform))],
        account_ids: f.contas, scheduled_at: f.modo === 'agendar' ? f.quando : null, status: f.modo === 'agendar' ? 'scheduled' : 'draft' };
      const btn = $('#n-save'); ui.busy(btn, true, f.modo === 'agora' ? 'Publicando...' : 'Salvando...');
      try {
        let id = post && editavel ? post.id : null;
        if (id) await api.put('/posts/' + id, corpo); else id = (await api.post('/posts', corpo)).id;
        if (f.modo === 'agora') {
          const r = await api.post('/posts/' + id + '/publish');
          const falhou = (r.results || []).filter((x) => x.status === 'failed' || x.error);
          if (falhou.length) { ui.toast('A Meta recusou: ' + (falhou[0].error || falhou[0].error_message || 'erro desconhecido') + '. O post ficou salvo para você corrigir.', 'err'); return ZP.go('novo', { id }); }
          ui.toast('Publicado em ' + nomes, 'ok');
        } else ui.toast(f.modo === 'agendar' ? 'Agendado para ' + new Date(f.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Rascunho salvo', 'ok');
        ZP.go('calendario');
      } catch (err) { ui.busy(btn, false); ui.toast(err.message, 'err'); }
    };
    pintar();
  }

  ZP.views.novo = { mount };
})();
