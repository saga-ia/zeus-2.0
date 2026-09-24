// Dashboard do Agente Posts. Mesma anatomia do dashboard de Growth da Central:
// cabeçalho com período, número principal com gráfico de área, métricas com sparkline, Tendências e Diagnóstico.
(function () {
  const { api, ui, charts, fmt, e, icon } = ZP;
  const PERIODOS = [[7, 'Últimos 7 dias'], [30, 'Últimos 30 dias'], [90, 'Últimos 90 dias']];
  let filtro = { dias: 30, conta: '' };

  const metric = (label, value, spark, color) => `<div><div style="font-size:12.5px;color:var(--mute);margin-bottom:6px">${e(label)}</div>
    <div class="num" style="font-family:var(--head);font-size:22px;font-weight:600;margin-bottom:8px">${e(value)}</div>${spark ? charts.spark(spark, color) : '<div style="height:34px"></div>'}</div>`;

  const linhaEvento = (ev, contas, extra) => `<div class="li click" data-ev="${e(ev.id)}">${ui.thumb(ev)}
    <div class="grow"><div class="trunc" style="font-size:13.5px;font-weight:500">${e(ev.titulo || (ev.caption || '').replace(/\s+/g, ' ').slice(0, 80) || ev.media_name || 'Sem legenda')}</div>
      <div class="small mute trunc">${fmt.dt(ev.quando)} · ${e(ZP.accName(contas, ev.account_ids))}${ev.origem === 'campanha' ? ' · campanha' : ''}</div>
      ${extra ? `<div class="tiny" style="color:var(--red);margin-top:3px;white-space:normal">${e(extra)}</div>` : ''}</div>
    ${ui.tipo(ev.tipo)}</div>`;

  async function mount(el) {
    const agora = Math.floor(Date.now() / 1000), de = agora - filtro.dias * 86400, ate = agora + 14 * 86400;
    const q = { account_id: filtro.conta };
    const [contas, resumo, agenda, an, worker] = await Promise.all([
      ZP.accounts(), api.get('/summary' + api.qs(Object.assign({ from: de, to: agora + 365 * 86400 }, q))),
      api.get('/schedule' + api.qs(Object.assign({ from: de, to: ate, limit: 5000 }, q))),
      api.get('/analytics').catch(() => null), api.get('/worker/status').catch(() => null),
    ]);
    const evs = agenda.eventos || [];
    const passado = ZP.byDay(de, agora), futuro = ZP.byDay(agora, ate);
    const pub = evs.filter((x) => x.status === 'published'), falhas = evs.filter((x) => x.status === 'failed');
    const agend = evs.filter((x) => x.status === 'scheduled' && x.quando >= agora);
    const sPub = passado.count(pub), sFalha = passado.count(falhas), sAgend = futuro.count(agend);
    const contaSel = contas.find((c) => String(c.id) === String(filtro.conta));
    const periodoTxt = PERIODOS.find((p) => p[0] === filtro.dias)[1];
    const schedOk = resumo.scheduler && resumo.scheduler.ativo;
    const taxa = pub.length + falhas.length ? Math.round((pub.length / (pub.length + falhas.length)) * 100) : null;

    const porConta = contas.map((c) => ({ label: '@' + c.platform_username, value: pub.filter((x) => (x.account_ids || []).includes(c.id)).length })).filter((r) => r.value).sort((a, b) => b.value - a.value);
    const tipos = [['reel', 'Reels'], ['feed', 'Feed (imagem)'], ['carousel', 'Carrossel'], ['story', 'Stories']].map(([k, l]) => ({ label: l, value: pub.filter((x) => x.tipo === k).length })).filter((r) => r.value);
    const totalTipos = tipos.reduce((s, r) => s + r.value, 0) || 1; tipos.forEach((r) => { r.hint = fmt.n(r.value) + ' · ' + Math.round((r.value / totalTipos) * 100) + '%'; });

    const avisos = [];
    if (!schedOk) avisos.push(ui.note('err', `<strong>O publicador está parado.</strong> Nenhum agendamento sai enquanto ele não voltar${resumo.scheduler && resumo.scheduler.segundos_desde_ultimo_tick != null ? ' (último sinal há ' + Math.round(resumo.scheduler.segundos_desde_ultimo_tick / 60) + ' min)' : ''}. Reinicie o processo jeff-automatikinst-worker.`));
    (resumo.contas_reconectar || []).forEach((c) => avisos.push(ui.note('warn', `A conta <strong>@${e(c.username)}</strong> precisa de atenção: ${e(c.motivo)}. <a href="#/contas">Abrir contas</a>`)));

    el.innerHTML = `<div class="page">
      <div class="page-head">
        <div class="ttl"><h1>Visão de publicações</h1><p class="sub">Agenda, entregas e falhas das contas conectadas.</p></div>
        <div class="row">
          <select class="sel" id="d-conta" style="width:auto;min-width:170px">${ui.accOptions(contas, filtro.conta)}</select>
          <select class="sel" id="d-dias" style="width:auto">${PERIODOS.map((p) => `<option value="${p[0]}" ${p[0] === filtro.dias ? 'selected' : ''}>${p[1]}</option>`).join('')}</select>
          <button class="btn" id="d-refresh">${icon('refresh', 13)}Atualizar</button>
          <a class="btn pri" href="#/novo">${icon('plus', 13)}Novo post</a>
        </div>
      </div>
      ${avisos.join('')}

      <div class="row" style="margin-bottom:22px">
        ${contaSel ? ZP.avatar(contaSel, 30) : `<span class="avatar" style="width:30px;height:30px;flex-basis:30px;background:#C13584;color:#fff;font-size:11px">IG</span>`}
        <strong style="font-family:var(--head);font-size:17px;font-weight:600">${contaSel ? '@' + e(contaSel.platform_username) : 'Instagram'}</strong>
        <span class="tag" style="border:0;background:var(--soft);padding:4px 10px">${contaSel ? fmt.compact(contaSel.followers) + ' seguidores' : contas.length + ' contas conectadas'}</span>
        <span class="badge ${schedOk ? 'b-green' : 'b-red'}">${schedOk ? 'Publicador ativo' : 'Publicador parado'}</span>
        <span class="small mute" style="margin-left:auto">${e(periodoTxt)}</span>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:26px;align-items:flex-start;padding-bottom:26px;border-bottom:1px solid var(--line);margin-bottom:26px">
        <div style="flex:1 1 320px;min-width:0;padding-right:26px;border-right:1px solid var(--line)">
          <div class="row" style="gap:9px;margin-bottom:10px"><span style="width:8px;height:8px;border-radius:2px;background:var(--green)"></span><span style="font-size:13.5px;color:var(--ink-2)">Publicações entregues</span></div>
          <div class="num" style="font-family:var(--head);font-size:40px;font-weight:600;letter-spacing:-0.01em;margin-bottom:16px">${fmt.n(pub.length)}</div>
          ${charts.area(sPub)}
        </div>
        <div style="flex:1 1 420px;min-width:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:22px">
          ${metric('Agendadas', fmt.n(resumo.agendadas), sAgend, '#673DE6')}
          ${metric('Falhas', fmt.n(falhas.length), sFalha, '#C0341C')}
          ${metric('Taxa de entrega', taxa == null ? '-' : taxa + '%')}
          ${metric('Campanhas ativas', resumo.campanhas_ativas + ' de ' + resumo.campanhas_total)}
          ${metric('Rascunhos', fmt.n(resumo.rascunhos))}
          ${an && !filtro.conta ? metric('Alcance total', fmt.compact(an.totals.reach)) : metric('Pausadas', fmt.n(resumo.pausadas))}
        </div>
      </div>

      <div class="row" style="align-items:baseline;gap:12px;margin-bottom:16px"><h2>Tendências</h2><span class="small mute">O ritmo da operação: o que saiu, o que falhou e o que está na fila.</span></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(250px,1fr));margin-bottom:34px">
        ${charts.card('Publicações por dia', charts.line(sPub, passado.labels))}
        ${charts.card('Falhas por dia', charts.line(sFalha, passado.labels, '#C0341C'))}
        ${charts.card('Fila dos próximos 14 dias', charts.line(sAgend, futuro.labels, '#673DE6'))}
        ${an && !filtro.conta ? charts.card('Engajamento acumulado', `<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px 12px">${[['Views', an.totals.views], ['Curtidas', an.totals.likes], ['Salvos', an.totals.saves], ['Compart.', an.totals.shares]].map((m) => `<div><div class="tiny mute">${m[0]}</div><div class="num" style="font-family:var(--head);font-size:19px;font-weight:600">${fmt.compact(m[1])}</div></div>`).join('')}</div><a class="small" href="#/analytics" style="display:inline-block;margin-top:14px">Abrir analytics</a>`) : ''}
      </div>

      <div class="row" style="align-items:baseline;gap:12px;margin-bottom:16px"><h2>Diagnóstico</h2><span class="small mute">O que vem pela frente, onde travou e quem está publicando mais.</span></div>
      <div class="cols-2" style="margin-bottom:16px">
        <div class="card" style="overflow:hidden"><div class="card-h"><strong class="grow" style="font-size:13.5px;font-weight:600">Próximas publicações</strong><a class="small" href="#/calendario">Ver calendário</a></div>
          <div class="list">${(resumo.proximas || []).length ? resumo.proximas.map((x) => linhaEvento(x, contas)).join('') : ui.empty('Nada na fila', 'Nenhuma publicação agendada daqui pra frente.', `<a class="btn sm" href="#/novo">Agendar post</a>`)}</div></div>
        <div class="card" style="overflow:hidden"><div class="card-h"><strong class="grow" style="font-size:13.5px;font-weight:600">Falhas recentes</strong>${falhas.length ? `<span class="badge b-red">${falhas.length} no período</span>` : ''}</div>
          <div class="list">${(resumo.falhas_recentes || []).length ? resumo.falhas_recentes.map((x) => linhaEvento(x, contas, x.error_message || 'Sem detalhe do erro. Abra para ver o resultado por conta.')).join('') : ui.empty('Sem falhas', 'Tudo que estava agendado saiu.', '', 'check')}</div></div>
      </div>
      <div class="cols-2">
        ${charts.card('Publicações por conta', porConta.length ? charts.hbars(porConta) : '<div class="small mute">Sem publicações no período.</div>', `<span class="small mute">${e(periodoTxt)}</span>`)}
        ${charts.card('Distribuição por formato', tipos.length ? charts.hbars(tipos, 'var(--amber)') : '<div class="small mute">Sem publicações no período.</div>')}
      </div>
      <div class="card" style="overflow:hidden;margin-top:16px"><div class="card-h"><strong class="grow" style="font-size:13.5px;font-weight:600">Últimas publicadas</strong><a class="small" href="#/analytics">Ver métricas</a></div>
        <div class="list">${(resumo.ultimas || []).length ? resumo.ultimas.map((x) => linhaEvento(x, contas)).join('') : ui.empty('Nada publicado ainda', '')}</div></div>
      <div class="tiny faint" style="margin-top:18px">Atualizado às ${fmt.time(resumo.atualizado_em)}${worker && worker.heartbeat_age_seconds != null ? ' · publicador deu sinal há ' + worker.heartbeat_age_seconds + ' s' : ''}</div>
    </div>`;

    const recarregar = () => mount(el).catch((err) => ui.toast(err.message, 'err'));
    el.querySelector('#d-conta').onchange = (ev) => { filtro.conta = ev.target.value; recarregar(); };
    el.querySelector('#d-dias').onchange = (ev) => { filtro.dias = parseInt(ev.target.value, 10); recarregar(); };
    el.querySelector('#d-refresh').onclick = recarregar;
    const todos = [].concat(resumo.proximas || [], resumo.falhas_recentes || [], resumo.ultimas || []);
    el.querySelectorAll('[data-ev]').forEach((li) => { li.onclick = () => { const ev = todos.find((x) => String(x.id) === li.dataset.ev); if (ev) ZP.openEvento(ev, contas, recarregar); }; });
    ZP.every(60, recarregar);
  }

  ZP.views.dashboard = { mount };
})();
