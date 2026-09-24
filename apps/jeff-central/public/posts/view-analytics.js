// Analytics do Agente Posts: métricas reais coletadas do Instagram, melhores horários e desempenho por post.
(function () {
  const { api, ui, charts, fmt, e, icon } = ZP;
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let ordem = 'recentes';

  function heatmapHTML(hm) {
    const max = Math.max(1, ...hm.flat());
    const cel = (v, d, h) => `<i title="${DIAS[d]} ${h}h: alcance médio ${fmt.n(Math.round(v))}" style="display:block;aspect-ratio:1;border-radius:4px;background:${v ? `rgba(15,122,104,${(0.12 + 0.88 * (v / max)).toFixed(2)})` : 'var(--soft)'}"></i>`;
    return `<div class="scroll-x"><div style="min-width:520px">
      <div style="display:grid;grid-template-columns:34px repeat(24,minmax(0,1fr));gap:2px;margin-bottom:5px"><span></span>${Array.from({ length: 24 }, (_, h) => `<span class="tiny mute" style="text-align:center;font-size:10px">${h}</span>`).join('')}</div>
      ${hm.map((linha, d) => `<div style="display:grid;grid-template-columns:34px repeat(24,minmax(0,1fr));gap:2px;margin-bottom:3px;align-items:center"><span class="tiny mute">${DIAS[d]}</span>${linha.map((v, h) => cel(v, d, h)).join('')}</div>`).join('')}
      <div class="row tiny mute" style="margin-top:12px;gap:6px"><span>Menor alcance</span>${[0.15, 0.4, 0.65, 1].map((o) => `<i style="width:14px;height:14px;border-radius:4px;background:rgba(15,122,104,${o})"></i>`).join('')}<span>Maior alcance</span></div>
    </div></div>`;
  }

  async function abrirPost(id) {
    ui.modal({ title: 'Desempenho do post', wide: true, body: ui.loading(), onOpen: async (b) => {
      try {
        const p = await api.get('/analytics/post/' + id);
        const url = ZP.safeUrl(p.media_path), video = p.post_type === 'video' || String(p.media_type || '').startsWith('video');
        b.innerHTML = `<div class="two" style="grid-template-columns:minmax(0,220px) minmax(0,1fr)">
          <div>${url ? `<div class="preview" style="max-height:340px">${video ? `<video src="${url}" controls preload="metadata" style="max-height:340px"></video>` : `<img src="${url}" alt="" style="max-height:340px">`}</div>` : ''}</div>
          <div><div class="row" style="margin-bottom:10px">${ui.badge(p.status)}<span class="small mute">${fmt.dt(p.published_at || p.scheduled_at)}</span></div>
            ${p.caption ? `<div style="font-size:13px;line-height:1.55;white-space:pre-wrap;max-height:120px;overflow:auto;margin-bottom:16px;color:var(--ink-2)">${e(p.caption)}</div>` : ''}
            ${(p.results || []).map((r) => { const a = r.analytics || {}; const story = p.post_type === 'story';
              const ms = story ? [['Alcance', a.reach], ['Views', a.views], ['Respostas', a.replies], ['Saídas', a.exits], ['Avanços', a.taps_forward], ['Retornos', a.taps_back]] : [['Alcance', a.reach], ['Views', a.views], ['Curtidas', a.likes], ['Comentários', a.comments], ['Salvos', a.saves], ['Compart.', a.shares]];
              return `<div class="card" style="margin-bottom:12px"><div class="card-h" style="padding:11px 14px"><strong class="grow" style="font-size:13px">@${e(r.platform_username || '')}</strong>${ui.badge(r.status)}${a.permalink ? `<a class="btn sm" href="${ZP.safeUrl(a.permalink)}" target="_blank" rel="noopener">${icon('ext', 12)}Abrir no Instagram</a>` : ''}</div>
                <div class="card-b" style="padding:14px">${r.error_message ? `<div class="small" style="color:var(--red)">${e(r.error_message)}</div>` : `<div class="grid" style="grid-template-columns:repeat(3,1fr);gap:14px 10px">${ms.map((m) => `<div><div class="tiny mute">${m[0]}</div><div class="num" style="font-family:var(--head);font-size:18px;font-weight:600">${fmt.n(m[1])}</div></div>`).join('')}</div>
                  <div class="tiny faint" style="margin-top:12px">${a.collected_at ? 'Métricas coletadas ' + fmt.rel(a.collected_at) : 'Métricas ainda não coletadas.'}</div>`}</div></div>`; }).join('') || '<div class="small mute">Sem resultado de publicação.</div>'}
          </div></div>`;
      } catch (err) { b.innerHTML = ui.error(err.message); }
    } });
  }

  async function mount(el) {
    const d = await api.get('/analytics');
    const t = d.totals || {}, posts = (d.recentPosts || []).slice(), hm = (d.heatmap && d.heatmap.heatmap) || [], top = (d.heatmap && d.heatmap.top_hours) || [];
    const eng = (p) => (p.likes || 0) + (p.comments || 0) + (p.saves || 0) + (p.shares || 0);
    if (ordem === 'alcance') posts.sort((a, b) => (b.reach || 0) - (a.reach || 0)); else if (ordem === 'engajamento') posts.sort((a, b) => eng(b) - eng(a));
    const cron = (d.recentPosts || []).slice().reverse();
    const taxa = t.reach ? (((t.likes || 0) + (t.comments || 0) + (t.saves || 0) + (t.shares || 0)) / t.reach * 100).toFixed(1).replace('.', ',') + '%' : '-';
    const contas = (d.accounts || []).slice().sort((a, b) => (b.followers || 0) - (a.followers || 0));
    const metric = (l, v, s, c) => `<div><div style="font-size:12.5px;color:var(--mute);margin-bottom:6px">${l}</div><div class="num" style="font-family:var(--head);font-size:22px;font-weight:600;margin-bottom:8px">${v}</div>${s ? charts.spark(s, c) : ''}</div>`;

    el.innerHTML = `<div class="page">
      <div class="page-head"><div class="ttl"><h1>Analytics</h1><p class="sub">Métricas reais coletadas do Instagram, atualizadas a cada 30 minutos.</p></div>
        <div class="row"><button class="btn pri" id="a-coletar">${icon('refresh', 13)}Atualizar métricas</button></div></div>

      <div style="display:flex;flex-wrap:wrap;gap:26px;align-items:flex-start;padding-bottom:26px;border-bottom:1px solid var(--line);margin-bottom:26px">
        <div style="flex:1 1 320px;min-width:0;padding-right:26px;border-right:1px solid var(--line)">
          <div class="row" style="gap:9px;margin-bottom:10px"><span style="width:8px;height:8px;border-radius:2px;background:var(--green)"></span><span style="font-size:13.5px;color:var(--ink-2)">Alcance total</span></div>
          <div class="num" style="font-family:var(--head);font-size:40px;font-weight:600;letter-spacing:-0.01em;margin-bottom:16px">${fmt.n(t.reach)}</div>
          ${charts.area(cron.map((p) => p.reach || 0))}<div class="tiny faint" style="margin-top:6px">Alcance dos últimos ${cron.length} posts, do mais antigo ao mais novo</div>
        </div>
        <div style="flex:1 1 420px;min-width:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:22px">
          ${metric('Posts publicados', fmt.n(d.totalPosts))}${metric('Views', fmt.n(t.views), cron.map((p) => p.views || 0))}${metric('Curtidas', fmt.n(t.likes), cron.map((p) => p.likes || 0))}
          ${metric('Comentários', fmt.n(t.comments))}${metric('Salvos', fmt.n(t.saves), cron.map((p) => p.saves || 0))}${metric('Engajamento sobre alcance', taxa)}
        </div>
      </div>

      <div class="row" style="align-items:baseline;gap:12px;margin-bottom:16px"><h2>Melhores horários</h2><span class="small mute">Alcance médio dos posts por dia da semana e hora. Quanto mais forte o verde, melhor o horário.</span></div>
      <div class="two" style="margin-bottom:34px">
        ${charts.card('Mapa de calor', hm.length ? heatmapHTML(hm) : '<div class="small mute">Ainda sem amostras suficientes.</div>', `<span class="small mute">${fmt.n((d.heatmap && d.heatmap.total_samples) || 0)} posts analisados</span>`)}
        <div class="card" style="overflow:hidden"><div class="card-h"><strong class="grow" style="font-size:13.5px;font-weight:600">Janelas de pico</strong></div>
          <div class="list">${top.length ? top.map((h, i) => `<div class="li"><span class="avatar" style="width:28px;height:28px;flex-basis:28px">${i + 1}</span><div class="grow"><div style="font-size:13.5px;font-weight:500">${DIAS[h.dow]} às ${String(h.hour).padStart(2, '0')}h</div><div class="tiny mute">${h.samples} ${h.samples === 1 ? 'post' : 'posts'} na amostra</div></div><strong class="num">${fmt.n(Math.round(h.avg_reach))}</strong></div>`).join('') : ui.empty('Sem dados ainda', '')}</div></div>
      </div>

      <div class="row" style="align-items:baseline;gap:12px;margin-bottom:16px"><h2>Contas</h2></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr));margin-bottom:34px">${contas.map((a) => `<div class="card"><div class="card-b row" style="flex-wrap:nowrap">${ZP.avatar(a, 40)}<div class="grow"><div class="trunc" style="font-weight:500">@${e(a.platform_username)}</div><div class="tiny mute trunc">${e(a.platform_name || '')}</div></div><div style="text-align:right"><div class="num" style="font-family:var(--head);font-size:17px;font-weight:600">${fmt.compact(a.followers)}</div><div class="tiny mute">seguidores</div></div></div></div>`).join('')}</div>

      <div class="row" style="margin-bottom:16px"><h2 class="grow">Publicações recentes</h2><span class="seg" id="a-ordem">${[['recentes', 'Mais recentes'], ['alcance', 'Maior alcance'], ['engajamento', 'Mais engajamento']].map((o) => `<span data-v="${o[0]}" class="${ordem === o[0] ? 'on' : ''}">${o[1]}</span>`).join('')}</span></div>
      <div class="card" style="overflow:hidden"><div class="scroll-x"><table class="tb"><thead><tr><th>Post</th><th>Conta</th><th>Publicado</th><th style="text-align:right">Alcance</th><th style="text-align:right">Views</th><th style="text-align:right">Curtidas</th><th style="text-align:right">Coment.</th><th style="text-align:right">Salvos</th><th></th></tr></thead>
        <tbody>${posts.length ? posts.map((p) => `<tr class="click" data-post="${p.post_id}"><td><div class="row" style="flex-wrap:nowrap;min-width:220px">${ui.thumb({ media_path: p.media_path, media_type: p.media_type, tipo: p.post_type === 'video' ? 'reel' : p.post_type === 'story' ? 'story' : 'feed' })}<span class="trunc" style="max-width:280px">${e((p.caption || '').replace(/\s+/g, ' ').replace(/^⸻$/, '').slice(0, 70) || p.title || 'Sem legenda')}</span></div></td>
          <td class="mute">@${e(p.platform_username || '')}</td><td class="mute num" style="white-space:nowrap">${fmt.dt(p.published_at)}</td>
          ${[p.reach, p.views, p.likes, p.comments, p.saves].map((v) => `<td class="num" style="text-align:right">${fmt.n(v)}</td>`).join('')}
          <td>${p.permalink ? `<a class="icon-btn" href="${ZP.safeUrl(p.permalink)}" target="_blank" rel="noopener" title="Abrir no Instagram" data-stop>${icon('ext', 14)}</a>` : ''}</td></tr>`).join('') : `<tr><td colspan="9">${ui.empty('Nenhum post publicado ainda', '')}</td></tr>`}</tbody></table></div></div>
    </div>`;

    el.querySelectorAll('[data-stop]').forEach((a) => a.addEventListener('click', (x) => x.stopPropagation()));
    el.querySelectorAll('[data-post]').forEach((tr) => { tr.onclick = () => abrirPost(tr.dataset.post); });
    el.querySelectorAll('#a-ordem [data-v]').forEach((b) => { b.onclick = () => { ordem = b.dataset.v; mount(el); }; });
    el.querySelector('#a-coletar').onclick = async (x) => { const btn = x.currentTarget; ui.busy(btn, true, 'Coletando na Meta...'); try { await api.post('/analytics/collect'); ui.toast('Métricas atualizadas', 'ok'); await mount(el); } catch (err) { ui.busy(btn, false); ui.toast(err.message, 'err'); } };
  }

  ZP.views.analytics = { mount };
})();
