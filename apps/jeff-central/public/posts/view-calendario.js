// Calendário do Agente Posts: agenda unificada (posts avulsos + itens de campanha), em mês ou lista.
(function () {
  const { api, ui, fmt, e, icon } = ZP;
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const st = { y: new Date().getFullYear(), m: new Date().getMonth(), modo: 'mes', conta: '', status: '', tipo: '' };

  // ─── detalhes de um evento (usado também pelo dashboard) ───────────────────
  ZP.openEvento = async function (ev, contas, aoMudar) {
    const midia = ZP.safeUrl(ev.media_url || ev.media_path || '');
    const ehVideo = ev.tipo === 'reel' || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(midia);
    const corpo = (resultados) => `
      ${midia ? `<div class="preview" style="margin-bottom:16px;max-height:300px">${ehVideo ? `<video src="${midia}" controls preload="metadata" style="max-height:300px"></video>` : `<img src="${midia}" alt="" style="max-height:300px">`}</div>` : ''}
      <div class="row" style="margin-bottom:14px">${ui.badge(ev.status)}${ui.tipo(ev.tipo)}${ev.origem === 'campanha' ? `<span class="tag">${icon('rocket', 12)}Campanha: ${e(ev.titulo || '#' + ev.campaign_id)}</span>` : ''}</div>
      <div class="cols-2" style="gap:12px;margin-bottom:14px">
        <div><div class="tiny mute" style="margin-bottom:3px">Quando</div><div style="font-size:13.5px">${e(fmt.full(ev.quando))}</div><div class="tiny mute">${fmt.rel(ev.quando)}</div></div>
        <div><div class="tiny mute" style="margin-bottom:3px">Contas</div><div style="font-size:13.5px">${e(ZP.accName(contas, ev.account_ids))}</div></div>
      </div>
      ${ev.caption ? `<div class="tiny mute" style="margin-bottom:4px">Legenda</div><div style="font-size:13.5px;line-height:1.55;white-space:pre-wrap;background:var(--softer);border:1px solid var(--line);border-radius:10px;padding:12px;max-height:180px;overflow:auto">${e(ev.caption)}</div>` : ''}
      ${ev.media_name ? `<div class="small mute" style="margin-top:10px">Arquivo: ${e(ev.media_name)}</div>` : ''}
      ${ev.error_message ? ui.note('err', e(ev.error_message)).replace('margin-bottom:18px', '') : ''}
      ${resultados && resultados.length ? `<div class="tiny mute" style="margin:16px 0 6px">Resultado por conta</div><div class="card"><div class="list">${resultados.map((r) => `<div class="li" style="padding:10px 14px"><div class="grow"><div style="font-size:13px">${e(ZP.accName(contas, [r.account_id]))}</div>${r.error_message ? `<div class="tiny" style="color:var(--red);white-space:normal">${e(r.error_message)}</div>` : ''}</div>${ui.badge(r.status)}</div>`).join('')}</div></div>` : ''}`;

    const acoes = [];
    if (ev.origem === 'campanha') acoes.push({ label: 'Abrir campanha', icon: 'rocket', onClick: (c) => { c(); ZP.go('massa', { id: ev.campaign_id }); } });
    else {
      acoes.push({ label: 'Excluir', kind: 'danger', icon: 'trash', onClick: async (c) => {
        if (!(await ui.confirm({ title: 'Excluir post', text: ev.status === 'published' ? 'Isso apaga o registro aqui no painel. O post já publicado continua no Instagram.' : 'O post sai da agenda e não será publicado.', ok: 'Excluir', danger: true }))) return;
        try { await api.del('/posts/' + ev.post_id); ui.toast('Post excluído', 'ok'); c(); aoMudar && aoMudar(); } catch (err) { ui.toast(err.message, 'err'); }
      } });
      if (['draft', 'scheduled', 'failed'].includes(ev.status)) {
        acoes.push({ label: ev.status === 'failed' ? 'Tentar publicar agora' : 'Publicar agora', icon: 'bolt', onClick: async (c, btn) => {
          if (!(await ui.confirm({ title: 'Publicar agora', html: `O post vai ao ar <strong>imediatamente</strong> em ${e(ZP.accName(contas, ev.account_ids))}. Não dá pra desfazer por aqui.`, ok: 'Publicar' }))) return;
          ui.busy(btn, true, 'Publicando...');
          try { const r = await api.post('/posts/' + ev.post_id + '/publish'); const falhou = (r.results || []).filter((x) => x.status === 'failed' || x.error); falhou.length ? ui.toast('Falhou: ' + (falhou[0].error || falhou[0].error_message || 'erro da Meta'), 'err') : ui.toast('Publicado', 'ok'); c(); aoMudar && aoMudar(); }
          catch (err) { ui.busy(btn, false); ui.toast(err.message, 'err'); }
        } });
        acoes.push({ label: 'Editar', kind: 'pri', icon: 'edit', onClick: (c) => { c(); ZP.go('novo', { id: ev.post_id }); } });
      }
    }
    ui.modal({ title: ev.titulo || (ev.origem === 'campanha' ? 'Item de campanha' : 'Post #' + ev.post_id), body: corpo(null), actions: acoes,
      onOpen: async (b) => { if (ev.origem !== 'post') return; try { const p = (await api.get('/posts')).find((x) => x.id === ev.post_id); if (p && p.results && p.results.length) b.innerHTML = corpo(p.results); } catch (_) {} } });
  };

  let _contas = [];
  // no mês, com várias contas, o que diferencia um evento do outro é a conta
  const rotulo = (ev) => { const a = _contas.find((c) => (ev.account_ids || []).includes(c.id)); return (a ? '@' + a.platform_username : '') + (ev.account_ids && ev.account_ids.length > 1 ? ' +' + (ev.account_ids.length - 1) : ''); };
  const chip = (ev) => `<div class="ev s-${e(ev.status)}" data-ev="${e(ev.id)}" title="${e(fmt.time(ev.quando) + ' · ' + ui.statusLabel(ev.status) + ' · ' + (ev.titulo || ev.media_name || ev.caption || '').slice(0, 80))}">${icon(ui.tipoIcon(ev.tipo), 11)}<b>${fmt.time(ev.quando)}</b><span>${e(rotulo(ev) || ev.media_name || ev.titulo || '')}</span></div>`;

  async function mount(el, params) {
    if (params && params.conta) st.conta = params.conta;
    const ini = new Date(st.y, st.m, 1), fim = new Date(st.y, st.m + 1, 0, 23, 59, 59);
    const [contas, ag] = await Promise.all([ZP.accounts(), api.get('/schedule' + api.qs({ from: Math.floor(ini / 1000), to: Math.floor(fim / 1000), account_id: st.conta, status: st.status, type: st.tipo, limit: 5000 }))]);
    const evs = ag.eventos || []; _contas = contas;
    const porDia = {}; evs.forEach((ev) => { const k = fmt.ymd(new Date(ev.quando * 1000)); (porDia[k] = porDia[k] || []).push(ev); });
    const hoje = fmt.ymd(new Date());
    const conta = (s) => evs.filter((x) => x.status === s).length;

    let grade = '';
    if (st.modo === 'mes') {
      const celulas = []; const offset = ini.getDay(), dias = fim.getDate();
      for (let i = 0; i < offset; i++) celulas.push(`<div class="cal-cell out"><div class="dn">${new Date(st.y, st.m, i - offset + 1).getDate()}</div></div>`);
      for (let d = 1; d <= dias; d++) {
        const k = fmt.ymd(new Date(st.y, st.m, d)), lista = porDia[k] || [];
        celulas.push(`<div class="cal-cell ${k === hoje ? 'today' : ''}" data-dia="${k}"><div class="dn">${d}</div>${lista.slice(0, 3).map(chip).join('')}${lista.length > 3 ? `<div class="more" data-mais="${k}">+${lista.length - 3} no dia</div>` : ''}</div>`);
      }
      while (celulas.length % 7) celulas.push(`<div class="cal-cell out"><div class="dn">${celulas.length - offset - dias + 1}</div></div>`);
      grade = `<div class="cal"><div class="cal-dow">${['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((d) => `<span>${d}</span>`).join('')}</div><div class="cal-grid">${celulas.join('')}</div></div>`;
    } else {
      const dias = Object.keys(porDia).sort();
      grade = dias.length ? dias.map((k) => `<div class="card" style="overflow:hidden;margin-bottom:14px"><div class="card-h"><strong class="grow" style="font-size:13.5px;font-weight:600;text-transform:capitalize">${e(new Date(k + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</strong><span class="small mute">${porDia[k].length} ${porDia[k].length === 1 ? 'publicação' : 'publicações'}</span></div>
        <div class="list">${porDia[k].map((ev) => `<div class="li click" data-ev="${e(ev.id)}">${ui.thumb(ev)}<strong class="num" style="width:46px;font-size:13.5px">${fmt.time(ev.quando)}</strong>
          <div class="grow"><div class="trunc" style="font-size:13.5px">${e(ev.titulo || (ev.caption || '').replace(/\s+/g, ' ').slice(0, 90) || ev.media_name || 'Sem legenda')}</div><div class="small mute trunc">${e(ZP.accName(contas, ev.account_ids))}${ev.origem === 'campanha' ? ' · campanha' + (ev.media_name ? ' · ' + e(ev.media_name) : '') : ''}</div></div>
          ${ui.tipo(ev.tipo)}${ui.badge(ev.status)}</div>`).join('')}</div></div>`).join('')
        : `<div class="card">${ui.empty('Nada neste mês', 'Nenhuma publicação com os filtros escolhidos.', `<a class="btn sm" href="#/novo">Agendar post</a>`)}</div>`;
    }

    el.innerHTML = `<div class="page">
      <div class="page-head">
        <div class="ttl"><h1>Calendário</h1><p class="sub">Tudo que está agendado, publicado ou falhou, incluindo os itens das campanhas em massa.</p></div>
        <div class="row"><span class="seg"><span data-modo="mes" class="${st.modo === 'mes' ? 'on' : ''}">${icon('calendar', 13)}Mês</span><span data-modo="lista" class="${st.modo === 'lista' ? 'on' : ''}">${icon('layers', 13)}Lista</span></span>
          <a class="btn pri" href="#/novo">${icon('plus', 13)}Novo post</a></div>
      </div>
      <div class="row" style="margin-bottom:18px">
        <button class="btn sm" data-nav="-1" title="Mês anterior">${icon('chevL', 14)}</button>
        <h2 style="min-width:190px;text-align:center">${MESES[st.m]} ${st.y}</h2>
        <button class="btn sm" data-nav="1" title="Próximo mês">${icon('chevR', 14)}</button>
        <button class="btn sm ghost" data-nav="0">Hoje</button>
        <span class="grow"></span>
        <select class="sel" id="c-conta" style="width:auto;min-width:170px">${ui.accOptions(contas, st.conta)}</select>
        <select class="sel" id="c-status" style="width:auto">${[['', 'Todos os status'], ['scheduled', 'Agendados'], ['published', 'Publicados'], ['failed', 'Falhas'], ['draft', 'Rascunhos'], ['paused', 'Pausados']].map((o) => `<option value="${o[0]}" ${st.status === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
        <select class="sel" id="c-tipo" style="width:auto">${[['', 'Todos os formatos'], ['feed', 'Feed'], ['reel', 'Reels'], ['carousel', 'Carrossel'], ['story', 'Stories']].map((o) => `<option value="${o[0]}" ${st.tipo === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
      </div>
      <div class="row" style="margin-bottom:14px"><div class="legend grow">
        <span><i style="background:var(--amber)"></i>Agendado (${conta('scheduled')})</span><span><i style="background:var(--green)"></i>Publicado (${conta('published')})</span>
        <span><i style="background:var(--red)"></i>Falhou (${conta('failed')})</span><span><i style="background:#B4B4BC"></i>Rascunho ou pausado (${conta('draft') + conta('paused')})</span></div>
        <span class="tiny faint">${evs.length} no mês · clique num dia para criar um post</span></div>
      ${grade}</div>`;

    const recarregar = () => mount(el).catch((err) => ui.toast(err.message, 'err'));
    el.querySelectorAll('[data-modo]').forEach((b) => { b.onclick = () => { st.modo = b.dataset.modo; recarregar(); }; });
    el.querySelectorAll('[data-nav]').forEach((b) => { b.onclick = () => { const n = parseInt(b.dataset.nav, 10); const d = n === 0 ? new Date() : new Date(st.y, st.m + n, 1); st.y = d.getFullYear(); st.m = d.getMonth(); recarregar(); }; });
    el.querySelector('#c-conta').onchange = (ev) => { st.conta = ev.target.value; recarregar(); };
    el.querySelector('#c-status').onchange = (ev) => { st.status = ev.target.value; recarregar(); };
    el.querySelector('#c-tipo').onchange = (ev) => { st.tipo = ev.target.value; recarregar(); };
    el.querySelectorAll('[data-ev]').forEach((c) => { c.onclick = (x) => { x.stopPropagation(); const ev = evs.find((v) => String(v.id) === c.dataset.ev); if (ev) ZP.openEvento(ev, contas, recarregar); }; });
    el.querySelectorAll('[data-mais]').forEach((m) => { m.onclick = (x) => { x.stopPropagation(); const k = m.dataset.mais, lista = porDia[k];
      ui.modal({ title: new Date(k + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }), body: `<div style="display:flex;flex-direction:column;gap:2px">${lista.map(chip).join('')}</div>`,
        actions: [{ label: 'Novo post neste dia', kind: 'pri', icon: 'plus', onClick: (c) => { c(); ZP.go('novo', { date: k }); } }],
        onOpen: (b, close) => b.querySelectorAll('[data-ev]').forEach((c) => { c.style.padding = '7px 9px'; c.onclick = () => { close(); ZP.openEvento(lista.find((v) => String(v.id) === c.dataset.ev), contas, recarregar); }; }) }); }; });
    el.querySelectorAll('[data-dia]').forEach((c) => { c.onclick = () => ZP.go('novo', { date: c.dataset.dia }); });
    ZP.every(45, recarregar);
  }

  ZP.views.calendario = { mount };
})();
