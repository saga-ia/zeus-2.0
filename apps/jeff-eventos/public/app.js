// ---------- utils ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const view = $('#view');
const modal = $('#modal');
const modalBody = $('#modalBody');
let CONFIG = null;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function toast(msg, kind = 'ok') { const t = $('#toast'); t.textContent = msg; t.className = 'toast on ' + kind; setTimeout(() => t.className = 'toast', 3000); }
function openModal(html) { modalBody.innerHTML = html; modal.classList.add('on'); }
function closeModal() { modal.classList.remove('on'); modalBody.innerHTML = ''; }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || 'erro');
  return j;
}
async function apiForm(path, form, method = 'POST') {
  const res = await fetch(path, { method, body: form });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || 'erro');
  return j;
}
function fmtTs(ts) { if (!ts) return '-'; const d = new Date(ts * 1000); return d.toLocaleString('pt-BR'); }

// ---------- power switch ----------
async function loadConfig() {
  CONFIG = (await api('/api/config'));
  const sw = $('#powerSwitch'); sw.classList.toggle('on', !!CONFIG.sistema_ligado);
  $('#powerLabel').textContent = CONFIG.sistema_ligado ? 'Ligado' : 'Desligado';
}
$('#powerSwitch').addEventListener('click', async () => {
  try { const r = await api('/api/toggle', { method: 'POST' }); CONFIG.sistema_ligado = r.sistema_ligado; $('#powerSwitch').classList.toggle('on', r.sistema_ligado); $('#powerLabel').textContent = r.sistema_ligado ? 'Ligado' : 'Desligado'; toast('Sistema ' + (r.sistema_ligado ? 'ligado' : 'desligado')); } catch (e) { toast(e.message, 'err'); }
});

// ---------- router ----------
async function route() {
  await loadConfig();
  const h = location.hash || '#/';
  $$('.topbar nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === h.split('/').slice(0, 2).join('/')));
  if (h.startsWith('#/eventos/')) return viewEvento(h.split('/')[2]);
  if (h.startsWith('#/eventos')) return viewEventos();
  if (h.startsWith('#/config')) return viewConfigPage();
  if (h.startsWith('#/whatsapp')) return viewWhatsapp();
  if (h.startsWith('#/logs')) return viewLogs();
  return viewDashboard();
}
window.addEventListener('hashchange', route);

// ---------- dashboard ----------
async function viewDashboard() {
  const { eventos } = await api('/api/eventos');
  const totalPart = eventos.reduce((a, e) => a + e.total_participantes, 0);
  const totalChk = eventos.reduce((a, e) => a + e.checkin_ok, 0);
  const ativos = eventos.filter(e => e.ativo).length;
  view.innerHTML = `
    <div class="title"><div><h1>Dashboard</h1><div class="sub">Visao geral dos seus eventos</div></div>
      <a class="btn primary" href="#/eventos">Ver todos eventos</a></div>
    <div class="grid cols-3">
      <div class="card"><div class="k">Eventos</div><div class="v">${eventos.length}</div><div class="hint">${ativos} ativos</div></div>
      <div class="card"><div class="k">Participantes</div><div class="v">${totalPart}</div></div>
      <div class="card"><div class="k">Check-ins</div><div class="v">${totalChk}</div><div class="hint">${totalPart ? Math.round(totalChk/totalPart*100) : 0}% presenca</div></div>
    </div>
    <div style="margin-top:24px">
      <h3 style="margin-bottom:8px">Proximos eventos</h3>
      ${eventos.length === 0 ? '<div class="card">Nenhum evento ainda. <a class="btn primary" href="#/eventos" style="margin-left:8px">Criar primeiro evento</a></div>' : `
        <div class="card"><table class="table"><thead><tr><th>Evento</th><th>Data</th><th>Local</th><th>Participantes</th><th>Check-in</th><th>Status</th><th></th></tr></thead><tbody>
        ${eventos.map(e => `<tr>
          <td><b>${esc(e.nome)}</b></td>
          <td>${esc(e.data)} ${esc(e.inicio_hora)}</td>
          <td>${esc(e.local || '-')}</td>
          <td>${e.total_participantes}</td>
          <td>${e.checkin_ok}/${e.total_participantes}</td>
          <td><span class="tag ${e.ativo ? 'on' : 'off'}">${e.ativo ? 'ativo' : 'pausado'}</span></td>
          <td><a class="btn small" href="#/eventos/${e.id}">Abrir</a></td>
        </tr>`).join('')}
        </tbody></table></div>
      `}
    </div>
  `;
}

// ---------- eventos list ----------
async function viewEventos() {
  const { eventos } = await api('/api/eventos');
  view.innerHTML = `
    <div class="title"><div><h1>Eventos</h1><div class="sub">Todos os eventos configurados</div></div>
      <button class="btn primary" onclick="novoEvento()">+ Novo evento</button></div>
    <div class="card">${eventos.length === 0 ? '<p style="color:var(--muted)">Nenhum evento criado.</p>' : `
    <table class="table"><thead><tr><th>Nome</th><th>Data</th><th>Local</th><th>Participantes</th><th>Status</th><th></th></tr></thead><tbody>
    ${eventos.map(e => `<tr>
      <td><b>${esc(e.nome)}</b></td>
      <td>${esc(e.data)}<br/><span style="color:var(--muted);font-size:12px">${esc(e.checkin_hora)} - ${esc(e.final_hora)}</span></td>
      <td>${esc(e.local || '-')}</td>
      <td>${e.total_participantes}</td>
      <td><span class="tag ${e.ativo ? 'on' : 'off'}">${e.ativo ? 'ativo' : 'pausado'}</span></td>
      <td><a class="btn small" href="#/eventos/${e.id}">Abrir</a></td>
    </tr>`).join('')}
    </tbody></table>`}</div>
  `;
}

function novoEvento() {
  openModal(`
    <h2>Novo evento</h2>
    <form onsubmit="salvarEvento(event)">
      <label>Nome do evento</label><input required name="nome" placeholder="Ex: Congresso Alpha 2026"/>
      <label>Descricao</label><textarea name="descricao" placeholder="Descricao curta"></textarea>
      <label>Local</label><input name="local" placeholder="Endereco / plataforma"/>
      <div class="form-row cols-2">
        <div><label>Data</label><input required type="date" name="data"/></div>
        <div><label>Horario check-in</label><input required type="time" name="checkin_hora"/></div>
      </div>
      <div class="form-row cols-3">
        <div><label>Inicio</label><input required type="time" name="inicio_hora"/></div>
        <div><label>Almoco</label><input type="time" name="almoco_hora"/></div>
        <div><label>Intervalo</label><input type="time" name="intervalo_hora"/></div>
      </div>
      <label>Termino</label><input required type="time" name="final_hora"/>
      <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">Criar evento</button>
      </div>
    </form>
  `);
}
async function salvarEvento(e) {
  e.preventDefault();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f).entries());
  try { const r = await api('/api/eventos', { method: 'POST', body: JSON.stringify(data) }); toast('Evento criado'); closeModal(); location.hash = '#/eventos/' + r.id; } catch (err) { toast(err.message, 'err'); }
}

// ---------- evento detail ----------
async function viewEvento(id) {
  const { evento } = await api('/api/eventos/' + id);
  const cadPre = evento.cadencias.filter(c => c.fase === 'pre');
  const cadEv = evento.cadencias.filter(c => c.fase === 'evento');
  const cadPos = evento.cadencias.filter(c => c.fase === 'pos');
  view.innerHTML = `
    <div class="title">
      <div>
        <div class="hint"><a href="#/eventos" style="color:var(--muted)">&larr; Eventos</a></div>
        <h1>${esc(evento.nome)}</h1>
        <div class="sub">${esc(evento.data)} • ${esc(evento.local || '-')} • <span class="tag ${evento.ativo ? 'on' : 'off'}">${evento.ativo ? 'ativo' : 'pausado'}</span></div>
      </div>
      <div>
        <button class="btn" onclick="editarEvento(${evento.id})">Editar</button>
        <button class="btn danger" onclick="excluirEvento(${evento.id})">Excluir</button>
      </div>
    </div>

    <div class="grid cols-3">
      <div class="card"><div class="k">Participantes</div><div class="v">${evento.participantes.length}</div></div>
      <div class="card"><div class="k">Check-in</div><div class="v">${evento.participantes.filter(p=>p.checkin_status==='ok').length}</div></div>
      <div class="card"><div class="k">Mensagens agendadas</div><div class="v">${evento.envios.filter(e=>e.status==='pendente').length}</div></div>
    </div>

    <div class="grid cols-2" style="margin-top:24px">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0">Cadencias</h3>
          <button class="btn primary small" onclick="novaCadencia(${evento.id})">+ Nova mensagem</button>
        </div>
        <div class="fase-block"><h4>Pre-evento</h4>${cadPre.map(renderCad).join('') || '<p class="hint">Nenhuma mensagem.</p>'}</div>
        <div class="fase-block"><h4>Durante o evento</h4>${cadEv.map(renderCad).join('') || '<p class="hint">Nenhuma mensagem.</p>'}</div>
        <div class="fase-block"><h4>Pos-evento</h4>${cadPos.map(renderCad).join('') || '<p class="hint">Nenhuma mensagem.</p>'}</div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0">Participantes</h3>
          <div>
            <button class="btn small" onclick="uploadPlanilha(${evento.id})">Upload planilha</button>
            <button class="btn primary small" onclick="novoParticipante(${evento.id})">+ Novo</button>
          </div>
        </div>
        <p class="hint">Formato CSV: colunas nome,telefone (opcional email). Link do formulario publico: <a target="_blank" href="/inscricao/${evento.id}">/inscricao/${evento.id}</a> • <a target="_blank" href="/api/eventos/${evento.id}/qrs.html">imprimir QRs</a></p>
        ${evento.participantes.length === 0 ? '<p class="hint">Nenhum participante.</p>' : `
        <table class="table"><thead><tr><th>Nome</th><th>Telefone</th><th>Check-in</th><th>Almoco</th><th></th></tr></thead><tbody>
        ${evento.participantes.map(p => `<tr>
          <td><b>${esc(p.nome)}</b><br/><span class="hint">${esc(p.origem)}</span></td>
          <td>${esc(p.telefone)}</td>
          <td>${p.checkin_status === 'ok' ? '<span class="tag on">ok</span><br/><span class="hint">'+fmtTs(p.checkin_at)+'</span>' : '<span class="tag off">pendente</span>'}</td>
          <td>${p.checkin_almoco_status === 'ok' ? '<span class="tag on">ok</span>' : '<span class="tag off">-</span>'}</td>
          <td>
            <a class="btn small" target="_blank" href="/api/participantes/${p.id}/qrcode.png">QR</a>
            <button class="btn small danger" onclick="excluirParticipante(${p.id})">x</button>
          </td>
        </tr>`).join('')}
        </tbody></table>`}
      </div>
    </div>

    <div class="card" style="margin-top:24px">
      <h3>Historico de envios</h3>
      ${evento.envios.length === 0 ? '<p class="hint">Nenhum envio agendado.</p>' : `
      <table class="table"><thead><tr><th>Quando</th><th>Cadencia</th><th>Participante</th><th>Status</th><th>Erro</th></tr></thead><tbody>
      ${evento.envios.slice(0, 100).map(e => `<tr>
        <td>${fmtTs(e.enviar_em)}</td>
        <td>${esc(e.cadencia_nome)}</td>
        <td>${esc(e.participante_nome)}<br/><span class="hint">${esc(e.telefone)}</span></td>
        <td><span class="tag ${e.status==='enviado'?'on':(e.status==='erro'?'off':'')}">${esc(e.status)}</span></td>
        <td><span class="hint">${esc(e.erro || '-')}</span></td>
      </tr>`).join('')}
      </tbody></table>`}
    </div>
  `;
}

function renderCad(c) {
  const quando = c.quando_tipo === 'datetime' ? c.quando_valor.replace('T', ' ') :
                 c.quando_tipo === 'evento_offset' ? (Number(c.quando_valor) >= 0 ? '+' : '') + c.quando_valor + ' min do inicio' :
                 'trigger: ' + c.quando_valor;
  return `<div class="cad-item">
    <div class="head">
      <div>
        <span class="tag ${c.fase}">${c.fase}</span>
        <b style="margin-left:6px">${esc(c.nome)}</b>
        <div class="meta">${esc(quando)} ${c.media_path?' • '+esc(c.media_tipo):''} ${c.ativo?'':' • <span style=\"color:var(--warn)\">pausada</span>'}</div>
      </div>
      <div>
        <button class="btn small" onclick="editarCadencia(${c.id})">Editar</button>
        <button class="btn small danger" onclick="excluirCadencia(${c.id})">x</button>
      </div>
    </div>
    <div class="msg">${esc(c.mensagem)}</div>
  </div>`;
}

async function editarEvento(id) {
  const { evento } = await api('/api/eventos/' + id);
  openModal(`
    <h2>Editar evento</h2>
    <form onsubmit="salvarEdicaoEvento(event, ${id})">
      <label>Nome</label><input required name="nome" value="${esc(evento.nome)}"/>
      <label>Descricao</label><textarea name="descricao">${esc(evento.descricao)}</textarea>
      <label>Local</label><input name="local" value="${esc(evento.local)}"/>
      <div class="form-row cols-2">
        <div><label>Data</label><input required type="date" name="data" value="${esc(evento.data)}"/></div>
        <div><label>Check-in</label><input required type="time" name="checkin_hora" value="${esc(evento.checkin_hora)}"/></div>
      </div>
      <div class="form-row cols-3">
        <div><label>Inicio</label><input required type="time" name="inicio_hora" value="${esc(evento.inicio_hora)}"/></div>
        <div><label>Almoco</label><input type="time" name="almoco_hora" value="${esc(evento.almoco_hora)}"/></div>
        <div><label>Intervalo</label><input type="time" name="intervalo_hora" value="${esc(evento.intervalo_hora)}"/></div>
      </div>
      <label>Termino</label><input required type="time" name="final_hora" value="${esc(evento.final_hora)}"/>
      <label><input type="checkbox" name="ativo" ${evento.ativo?'checked':''}/> Evento ativo (mensagens ligadas)</label>
      <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>
  `);
}
async function salvarEdicaoEvento(e, id) {
  e.preventDefault();
  const f = new FormData(e.target);
  const data = Object.fromEntries(f.entries());
  data.ativo = f.get('ativo') ? 1 : 0;
  try { await api('/api/eventos/'+id, { method: 'PUT', body: JSON.stringify(data) }); toast('Salvo'); closeModal(); route(); } catch (err) { toast(err.message, 'err'); }
}
async function excluirEvento(id) {
  if (!confirm('Excluir este evento e tudo dele?')) return;
  try { await api('/api/eventos/' + id, { method: 'DELETE' }); toast('Excluido'); location.hash = '#/eventos'; } catch (e) { toast(e.message, 'err'); }
}

function novaCadencia(eventoId, cad = null) {
  const isEdit = !!cad;
  openModal(`
    <h2>${isEdit ? 'Editar mensagem' : 'Nova mensagem de cadencia'}</h2>
    <form onsubmit="salvarCadencia(event, ${eventoId}, ${cad?cad.id:'null'})" enctype="multipart/form-data">
      <label>Nome interno</label><input required name="nome" value="${esc(cad?.nome||'')}" placeholder="Ex: boas vindas pos inscricao"/>
      <div class="form-row cols-2">
        <div>
          <label>Fase</label>
          <select name="fase">
            <option value="pre" ${cad?.fase==='pre'?'selected':''}>Pre-evento</option>
            <option value="evento" ${cad?.fase==='evento'?'selected':''}>Durante o evento</option>
            <option value="pos" ${cad?.fase==='pos'?'selected':''}>Pos-evento</option>
          </select>
        </div>
        <div>
          <label>Ativo</label>
          <select name="ativo"><option value="1" ${cad&&!cad.ativo?'':'selected'}>Sim</option><option value="0" ${cad&&!cad.ativo?'selected':''}>Nao</option></select>
        </div>
      </div>

      <div class="form-row cols-2">
        <div>
          <label>Tipo de envio</label>
          <select name="quando_tipo" id="qtipo" onchange="toggleQTipo()">
            <option value="datetime" ${cad?.quando_tipo==='datetime'?'selected':''}>Data e hora fixa</option>
            <option value="evento_offset" ${cad?.quando_tipo==='evento_offset'?'selected':''}>Minutos antes/depois do inicio</option>
            <option value="trigger" ${cad?.quando_tipo==='trigger'?'selected':''}>Trigger (acao do participante)</option>
          </select>
        </div>
        <div>
          <label id="qvalorlbl">Quando enviar</label>
          <div id="qvalorwrap"></div>
        </div>
      </div>

      <label>Mensagem <span class="hint">(use {{nome}}, {{evento}}, {{link_checkin}})</span></label>
      <textarea name="mensagem" placeholder="Ola {{nome}}, ...">${esc(cad?.mensagem||'')}</textarea>

      <label>Anexo (imagem, audio ou video — opcional)</label>
      <input type="file" name="media" accept="image/*,audio/*,video/*"/>
      ${cad?.media_path ? '<p class="hint">Anexo atual: '+esc(cad.media_tipo)+' <label><input type="checkbox" name="remove_media" value="1"/> remover</label></p>' : ''}

      <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">${isEdit?'Salvar':'Criar cadencia'}</button>
      </div>
    </form>
    <script>window.__editingCad=${JSON.stringify(cad||{})};toggleQTipo();</script>
  `);
}

window.toggleQTipo = function () {
  const tipo = $('#qtipo').value;
  const wrap = $('#qvalorwrap');
  const lbl = $('#qvalorlbl');
  const cad = window.__editingCad || {};
  if (tipo === 'datetime') {
    lbl.textContent = 'Data e hora (BRT)';
    const val = cad.quando_tipo==='datetime' ? cad.quando_valor : '';
    wrap.innerHTML = `<input required type="datetime-local" name="quando_valor" value="${esc(val)}"/>`;
  } else if (tipo === 'evento_offset') {
    lbl.textContent = 'Minutos relativos ao inicio (negativo = antes)';
    const val = cad.quando_tipo==='evento_offset' ? cad.quando_valor : '-60';
    wrap.innerHTML = `<input required type="number" name="quando_valor" value="${esc(val)}" placeholder="-60"/>`;
  } else {
    lbl.textContent = 'Trigger';
    const val = cad.quando_tipo==='trigger' ? cad.quando_valor : 'checkin';
    wrap.innerHTML = `<select name="quando_valor">
      <option value="boas_vindas" ${val==='boas_vindas'?'selected':''}>ao se inscrever</option>
      <option value="checkin" ${val==='checkin'?'selected':''}>ao fazer check-in de entrada</option>
      <option value="no_checkin" ${val==='no_checkin'?'selected':''}>lembrete quando faltar check-in</option>
      <option value="apos_almoco" ${val==='apos_almoco'?'selected':''}>ao fazer check-in pos almoco</option>
      <option value="no_checkin_almoco" ${val==='no_checkin_almoco'?'selected':''}>lembrete quando faltar check-in almoco</option>
    </select>`;
  }
};

async function salvarCadencia(e, eventoId, cadId) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    if (cadId) await apiForm('/api/cadencias/' + cadId, form, 'PUT');
    else await apiForm('/api/eventos/' + eventoId + '/cadencias', form, 'POST');
    toast('Salvo'); closeModal(); route();
  } catch (err) { toast(err.message, 'err'); }
}

async function editarCadencia(id) {
  const { evento } = await api('/api/eventos/' + location.hash.split('/')[2]);
  const cad = evento.cadencias.find(c => c.id === id);
  novaCadencia(evento.id, cad);
}
async function excluirCadencia(id) {
  if (!confirm('Excluir cadencia?')) return;
  try { await api('/api/cadencias/'+id, { method: 'DELETE' }); toast('Excluida'); route(); } catch (e) { toast(e.message, 'err'); }
}

function novoParticipante(eventoId) {
  openModal(`
    <h2>Novo participante</h2>
    <form onsubmit="salvarParticipante(event, ${eventoId})">
      <label>Nome</label><input required name="nome"/>
      <label>Telefone (com DDD)</label><input required name="telefone" placeholder="11987654321"/>
      <label>E-mail (opcional)</label><input name="email"/>
      <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">Adicionar</button>
      </div>
    </form>
  `);
}
async function salvarParticipante(e, eventoId) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try { await api('/api/eventos/'+eventoId+'/participantes', { method: 'POST', body: JSON.stringify(data) }); toast('Adicionado'); closeModal(); route(); } catch (err) { toast(err.message, 'err'); }
}
async function excluirParticipante(id) {
  if (!confirm('Excluir participante?')) return;
  try { await api('/api/participantes/'+id, { method: 'DELETE' }); toast('Excluido'); route(); } catch (e) { toast(e.message, 'err'); }
}
function uploadPlanilha(eventoId) {
  openModal(`
    <h2>Upload de planilha (CSV)</h2>
    <p class="hint">Arquivo CSV com cabecalho contendo colunas nome, telefone (opcional email). Aceita separador virgula ou ponto e virgula.</p>
    <form onsubmit="enviarPlanilha(event, ${eventoId})" enctype="multipart/form-data">
      <label>Arquivo</label><input required type="file" name="arquivo" accept=".csv,text/csv"/>
      <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">Subir</button>
      </div>
    </form>
  `);
}
async function enviarPlanilha(e, eventoId) {
  e.preventDefault();
  try { const r = await apiForm('/api/eventos/'+eventoId+'/participantes/upload', new FormData(e.target)); toast(`${r.inseridos} inseridos, ${r.duplicados} duplicados`); closeModal(); route(); } catch (err) { toast(err.message, 'err'); }
}

// ---------- config ----------
async function viewConfigPage() {
  view.innerHTML = `
    <div class="title"><div><h1>Configuracoes</h1><div class="sub">Ajustes gerais do sistema</div></div></div>
    <div class="card">
      <form onsubmit="salvarConfig(event)">
        <div class="form-row cols-2">
          <div>
            <label>Estilo padrao das mensagens</label>
            <select name="estilo_msg">
              <option value="amigavel" ${CONFIG.estilo_msg==='amigavel'?'selected':''}>Amigavel</option>
              <option value="formal" ${CONFIG.estilo_msg==='formal'?'selected':''}>Formal</option>
              <option value="direto" ${CONFIG.estilo_msg==='direto'?'selected':''}>Direto</option>
            </select>
          </div>
          <div>
            <label>URL publica (base_url)</label>
            <input name="base_url" value="${esc(CONFIG.base_url)}"/>
            <p class="hint">Usada nos links de check-in enviados no WhatsApp</p>
          </div>
        </div>
        <label>Assinatura padrao</label>
        <textarea name="assinatura" placeholder="Ex: - Time Alpha Digital">${esc(CONFIG.assinatura)}</textarea>
        <label style="margin-top:20px"><input type="checkbox" name="sistema_ligado" ${CONFIG.sistema_ligado?'checked':''}/> Sistema ligado (dispara mensagens)</label>
        <div style="margin-top:20px"><button class="btn primary">Salvar</button></div>
      </form>
    </div>
  `;
}
async function salvarConfig(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const data = { estilo_msg: f.get('estilo_msg'), base_url: f.get('base_url'), assinatura: f.get('assinatura'), sistema_ligado: !!f.get('sistema_ligado') };
  try { await api('/api/config', { method: 'POST', body: JSON.stringify(data) }); toast('Salvo'); loadConfig(); } catch (err) { toast(err.message, 'err'); }
}

// ---------- whatsapp ----------
async function viewWhatsapp() {
  const s = CONFIG.wa;
  view.innerHTML = `
    <div class="title"><div><h1>Conexao WhatsApp</h1><div class="sub">Escolha como o sistema envia mensagens</div></div></div>
    <div class="grid cols-2">
      <div class="card">
        <h3>Modo Token (worker existente)</h3>
        <p class="hint">Usa o worker Jeff ja conectado. Recomendado.</p>
        <form onsubmit="salvarWa(event, 'token')">
          <label>URL do worker</label><input name="worker_url" value="${esc(s.worker_url)}"/>
          <label>Token Bearer (opcional)</label><input name="worker_token" placeholder="${s.worker_token==='***'?'ja salvo, digite para trocar':''}"/>
          <button class="btn primary" style="margin-top:14px">Usar modo Token</button>
          <span class="chip" style="margin-left:8px">modo atual: ${esc(s.modo)}</span>
        </form>
        <hr style="border:0;border-top:1px solid var(--border);margin:20px 0"/>
        <h3>Envio de teste</h3>
        <form onsubmit="testeWa(event)">
          <label>Telefone (com DDD)</label><input required name="telefone" placeholder="5511987654321"/>
          <label>Mensagem</label><textarea required name="mensagem">teste jeff-eventos ${new Date().toLocaleTimeString('pt-BR')}</textarea>
          <button class="btn" style="margin-top:14px">Enviar</button>
        </form>
      </div>
      <div class="card">
        <h3>Modo QR Code (sessao propria)</h3>
        <p class="hint">Escaneie o QR do WhatsApp Business ou pessoal.</p>
        <form onsubmit="salvarWa(event, 'qr')">
          <button class="btn primary">Usar modo QR</button>
        </form>
        <div style="margin-top:14px;display:flex;gap:8px">
          <button class="btn ok" onclick="iniciarQR()">Iniciar / gerar QR</button>
          <button class="btn danger" onclick="pararQR()">Desconectar</button>
          <button class="btn" onclick="atualizarQR()">Atualizar</button>
        </div>
        <div class="qr-preview" id="qrbox">${s.qr_payload ? `<img src="${s.qr_payload}"/><p style="color:#000">Escaneie no seu WhatsApp</p>` : `<p style="color:#000">${esc(s.qr_status||'desconectado')}</p>`}</div>
      </div>
    </div>
  `;
}
async function salvarWa(e, modo) {
  e.preventDefault();
  const f = e.target ? new FormData(e.target) : new FormData();
  const wa = { modo };
  if (modo === 'token') { wa.worker_url = f.get('worker_url'); const t = f.get('worker_token'); if (t) wa.worker_token = t; }
  try { await api('/api/config', { method: 'POST', body: JSON.stringify({ wa }) }); toast('Modo salvo: ' + modo); loadConfig().then(route); } catch (err) { toast(err.message, 'err'); }
}
async function iniciarQR() { try { await api('/api/wa/qr/iniciar', { method: 'POST' }); toast('Gerando QR...'); setTimeout(atualizarQR, 3000); } catch (e) { toast(e.message, 'err'); } }
async function pararQR() { try { await api('/api/wa/qr/parar', { method: 'POST' }); toast('Desconectado'); atualizarQR(); } catch (e) { toast(e.message, 'err'); } }
async function atualizarQR() { const s = await api('/api/wa/qr'); const box = $('#qrbox'); if (!box) return; box.innerHTML = s.qr_payload ? `<img src="${s.qr_payload}"/><p style="color:#000">Escaneie no seu WhatsApp</p>` : `<p style="color:#000">${esc(s.qr_status||'desconectado')}</p>`; }
async function testeWa(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try { await api('/api/wa/teste', { method: 'POST', body: JSON.stringify(data) }); toast('Enviado'); } catch (err) { toast(err.message, 'err'); }
}

// ---------- logs ----------
async function viewLogs() {
  const { logs } = await api('/api/logs');
  view.innerHTML = `
    <div class="title"><div><h1>Logs</h1><div class="sub">Ultimos 200 eventos do sistema</div></div><button class="btn" onclick="viewLogs()">Atualizar</button></div>
    <div class="card"><table class="table"><thead><tr><th>Quando</th><th>Nivel</th><th>Origem</th><th>Mensagem</th></tr></thead><tbody>
    ${logs.map(l => `<tr><td>${fmtTs(l.ts)}</td><td><span class="tag ${l.nivel==='erro'?'off':(l.nivel==='warn'?'':'on')}">${esc(l.nivel)}</span></td><td>${esc(l.origem)}</td><td><span class="hint">${esc(l.mensagem)}</span></td></tr>`).join('')}
    </tbody></table></div>
  `;
}

// ---------- go ----------
route();
