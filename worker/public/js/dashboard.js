(function () {
  const stateBadge = document.getElementById('stateBadge');
  const stateBig = document.getElementById('stateBig');
  const stateSince = document.getElementById('stateSince');
  const meNumber = document.getElementById('meNumber');
  const meName = document.getElementById('meName');
  const queuePending = document.getElementById('queuePending');
  const uptime = document.getElementById('uptime');
  const qrCard = document.getElementById('qrCard');
  const qrImg = document.getElementById('qrImg');
  const qrUpdated = document.getElementById('qrUpdated');
  const errorCard = document.getElementById('errorCard');
  const footerUptime = document.getElementById('footerUptime');

  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'include', ...opts });
    if (r.status === 401) {
      window.location.href = '/login';
      throw new Error('unauth');
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = r.headers.get('content-type') || '';
    return ct.includes('application/json') ? r.json() : r.text();
  }

  function fmtDur(sec) {
    if (!sec) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
  }

  function fmtSince(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = Math.round((Date.now() - d.getTime()) / 1000);
    return `há ${fmtDur(diff)}`;
  }

  const STATE_LABELS = {
    initializing: 'Inicializando',
    qr: 'Aguardando QR',
    authenticated: 'Autenticado',
    ready: 'Pronto',
    disconnected: 'Desconectado',
    auth_failure: 'Falha de auth',
  };
  const STATE_COLORS = {
    ready: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    authenticated: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200',
    qr: 'bg-sky-500/20 border-sky-500/40 text-sky-200',
    initializing: 'bg-slate-500/20 border-slate-500/40 text-slate-300',
    disconnected: 'bg-red-500/20 border-red-500/40 text-red-300',
    auth_failure: 'bg-red-700/30 border-red-700/40 text-red-300',
  };

  let lastQrTs = 0;
  let lastSystemOnlineTime = null;

  async function tickStatus() {
    try {
      const s = await api('/status');
      const label = STATE_LABELS[s.state] || s.state;
      stateBadge.textContent = label;
      stateBadge.className =
        'text-xs uppercase tracking-wider px-2.5 py-1 rounded-full border ' +
        (STATE_COLORS[s.state] || 'bg-slate-800 border-slate-700');
      stateBig.textContent = label;
      stateSince.textContent = s.since ? `desde ${new Date(s.since).toLocaleString('pt-BR')}` : '';
      meNumber.textContent = s.meNumber ? `+${s.meNumber}` : '—';
      meName.textContent = s.meName || '';

      // Update WhatsApp status alert
      const waStatusDot = document.getElementById('waStatusDot');
      const waStatusLabel = document.getElementById('waStatusLabel');
      const waStatusTime = document.getElementById('waStatusTime');
      const waStatusCard = document.getElementById('waStatusCard');

      const isConnected = s.state === 'ready' || s.state === 'authenticated';
      waStatusLabel.textContent = isConnected ? 'Conectado' : 'Desconectado';
      waStatusDot.className = `w-4 h-4 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`;
      waStatusCard.className = `bg-slate-900 border-2 ${isConnected ? 'border-emerald-500/40' : 'border-red-500/40'} rounded-2xl p-5`;
      waStatusTime.textContent = s.since ? `desde ${new Date(s.since).toLocaleTimeString('pt-BR')}` : '';

      if (s.state === 'qr') {
        qrCard.classList.remove('hidden');
        if (Date.now() - lastQrTs > 8000) {
          qrImg.src = '/qr?format=png&t=' + Date.now();
          lastQrTs = Date.now();
          qrUpdated.textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR');
        }
      } else {
        qrCard.classList.add('hidden');
      }

      if (s.state === 'auth_failure' || s.state === 'disconnected') {
        errorCard.classList.remove('hidden');
        errorCard.textContent = 'Cliente em estado ' + label + (s.lastError ? ': ' + s.lastError : '');
      } else {
        errorCard.classList.add('hidden');
      }
    } catch (e) {
      if (e.message !== 'unauth') console.error(e);
    }
  }

  async function tickStats() {
    try {
      const stats = await api('/admin/stats');
      queuePending.textContent = stats.queue?.pending ?? 0;
      uptime.textContent = 'Uptime: ' + fmtDur(stats.uptimeSec);
      footerUptime.textContent = `msgs ${stats.totals.messages} · chats ${stats.totals.chats} · webhooks ${stats.totals.webhooksActive}`;

      // Update System status alert
      const sysStatusDot = document.getElementById('sysStatusDot');
      const sysStatusLabel = document.getElementById('sysStatusLabel');
      const sysStatusTime = document.getElementById('sysStatusTime');
      const sysStatusCard = document.getElementById('sysStatusCard');

      const isOnline = stats.uptimeSec > 0;
      if (isOnline) {
        lastSystemOnlineTime = Date.now();
      }
      sysStatusLabel.textContent = isOnline ? 'Ativo' : 'Offline';
      sysStatusDot.className = `w-4 h-4 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`;
      sysStatusCard.className = `bg-slate-900 border-2 ${isOnline ? 'border-emerald-500/40' : 'border-slate-700'} rounded-2xl p-5`;
      sysStatusTime.textContent = isOnline ? `Uptime: ${fmtDur(stats.uptimeSec)}` : (lastSystemOnlineTime ? `Offline há ${fmtDur(Math.floor((Date.now() - lastSystemOnlineTime) / 1000))}` : '');
    } catch {}
  }

  // Tabs
  function activateTab(name) {
    document.querySelectorAll('[data-tabpane]').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.tabpane !== name);
    });
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('tab-active', 'text-white');
      if (b.dataset.tab === name) {
        b.classList.add('tab-active');
      } else {
        b.classList.add('text-slate-400');
      }
    });
    if (name === 'messages') loadMessages();
    if (name === 'queue') loadQueue();
    if (name === 'webhooks') loadWebhooks();
  }
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.addEventListener('click', () => activateTab(b.dataset.tab));
  });

  // Messages tab
  async function loadMessages() {
    try {
      const { messages } = await api('/admin/messages?limit=100');
      const body = document.getElementById('messagesBody');
      body.innerHTML = '';
      for (const m of messages) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="px-4 py-2 text-xs text-slate-400">${new Date(m.timestamp).toLocaleString('pt-BR')}</td>
          <td class="px-4 py-2 font-mono text-xs">${escapeHtml(m.chat_id)}</td>
          <td class="px-4 py-2">${m.direction === 'in' ? '⬇️' : '⬆️'}</td>
          <td class="px-4 py-2 text-slate-300">${escapeHtml(m.author_name || '')}</td>
          <td class="px-4 py-2 text-slate-200">${escapeHtml((m.body || '').slice(0, 180))}</td>
        `;
        body.appendChild(tr);
      }
    } catch (e) {
      console.error(e);
    }
  }
  document.getElementById('refreshMessages').addEventListener('click', loadMessages);

  // Queue tab
  async function loadQueue() {
    try {
      const q = await api('/admin/queue');
      const cBox = document.getElementById('queueCounts');
      const labels = { pending: 'Pendentes', sending: 'Enviando', sent: 'Enviadas', error: 'Erro' };
      cBox.innerHTML = '';
      for (const key of ['pending', 'sending', 'sent', 'error']) {
        const d = document.createElement('div');
        d.className = 'bg-slate-900 border border-slate-800 rounded-xl p-4';
        d.innerHTML = `<div class="text-xs text-slate-400">${labels[key]}</div><div class="text-2xl font-semibold mt-1">${q.counts[key] || 0}</div>`;
        cBox.appendChild(d);
      }
      const body = document.getElementById('queueBody');
      body.innerHTML = '';
      for (const r of q.recent) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="px-4 py-2 text-xs">${r.id}</td>
          <td class="px-4 py-2 font-mono text-xs">${escapeHtml(r.chat_id)}</td>
          <td class="px-4 py-2">${r.kind}</td>
          <td class="px-4 py-2">${statusBadge(r.status)}</td>
          <td class="px-4 py-2">${r.retry_count}</td>
          <td class="px-4 py-2 text-xs text-red-300">${escapeHtml((r.error || '').slice(0, 80))}</td>
          <td class="px-4 py-2 text-xs text-slate-400">${r.created_at}</td>
        `;
        body.appendChild(tr);
      }
    } catch (e) {
      console.error(e);
    }
  }
  document.getElementById('refreshQueue').addEventListener('click', loadQueue);
  document.getElementById('flushQueue').addEventListener('click', async () => {
    if (!confirm('Marcar todos os pendentes como erro?')) return;
    await api('/admin/queue/flush', { method: 'POST' });
    loadQueue();
  });

  function statusBadge(s) {
    const map = {
      pending: 'bg-slate-800 text-slate-300 border-slate-700',
      sending: 'bg-sky-900/40 text-sky-200 border-sky-800',
      sent: 'bg-emerald-900/40 text-emerald-200 border-emerald-800',
      error: 'bg-red-900/40 text-red-200 border-red-800',
    };
    return `<span class="text-xs px-2 py-0.5 rounded border ${map[s] || ''}">${s}</span>`;
  }

  // Webhooks tab
  async function loadWebhooks() {
    const { webhooks } = await api('/webhooks');
    const body = document.getElementById('webhooksBody');
    body.innerHTML = '';
    for (const w of webhooks) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-4 py-2 text-xs">${w.id}</td>
        <td class="px-4 py-2 font-mono text-xs break-all">${escapeHtml(w.url)}</td>
        <td class="px-4 py-2 text-xs">${escapeHtml(w.events)}</td>
        <td class="px-4 py-2 text-xs">${w.active ? 'sim' : 'não'}</td>
        <td class="px-4 py-2"><button data-del="${w.id}" class="text-red-300 hover:text-white text-xs">remover</button></td>
      `;
      body.appendChild(tr);
    }
    body.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        await api('/webhooks/' + b.dataset.del, { method: 'DELETE' });
        loadWebhooks();
      });
    });
  }
  document.getElementById('webhookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    await api('/webhooks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: data.get('url'),
        events: data.get('events') || '*',
        token: data.get('token') || undefined,
      }),
    });
    e.target.reset();
    loadWebhooks();
  });

  // Session tab
  document.getElementById('restartBtn').addEventListener('click', async () => {
    if (!confirm('Reiniciar o cliente WhatsApp?')) return;
    document.getElementById('sessionMsg').textContent = 'Reiniciando...';
    await api('/session/restart', { method: 'POST' });
    document.getElementById('sessionMsg').textContent = 'Reinício solicitado.';
  });
  document.getElementById('logoutSessionBtn').addEventListener('click', async () => {
    if (!confirm('Fazer logout da sessão WhatsApp? Você terá que escanear QR novamente.')) return;
    await api('/session/logout', { method: 'POST' });
    document.getElementById('sessionMsg').textContent = 'Logout solicitado.';
  });

  // Header logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  });

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  // Overview quick-actions
  const overviewMsg = document.getElementById('overviewMsg');
  document.getElementById('newQrBtn').addEventListener('click', async () => {
    if (!confirm('Desconectar o WhatsApp e gerar novo QR para parear?')) return;
    overviewMsg.textContent = 'Desconectando...';
    try {
      await api('/session/logout', { method: 'POST' });
      overviewMsg.textContent = 'Aguarde — o QR aparecerá em instantes.';
      lastQrTs = 0;
      setTimeout(tickStatus, 2000);
    } catch (e) {
      overviewMsg.textContent = 'Erro: ' + e.message;
    }
  });
  document.getElementById('overviewRestartBtn').addEventListener('click', async () => {
    if (!confirm('Reiniciar o cliente WhatsApp?')) return;
    overviewMsg.textContent = 'Reiniciando...';
    try {
      await api('/session/restart', { method: 'POST' });
      overviewMsg.textContent = 'Reinício solicitado.';
    } catch (e) {
      overviewMsg.textContent = 'Erro: ' + e.message;
    }
  });

  // Pairing code (alternativa ao QR)
  const pairToggleBtn = document.getElementById('pairToggleBtn');
  const pairForm = document.getElementById('pairForm');
  const pairPhone = document.getElementById('pairPhone');
  const pairSubmitBtn = document.getElementById('pairSubmitBtn');
  const pairMsg = document.getElementById('pairMsg');
  const pairCodeBox = document.getElementById('pairCodeBox');
  const pairCode = document.getElementById('pairCode');

  if (pairToggleBtn) {
    pairToggleBtn.addEventListener('click', () => {
      pairForm.classList.toggle('hidden');
    });
  }
  if (pairSubmitBtn) {
    pairSubmitBtn.addEventListener('click', async () => {
      const phone = (pairPhone.value || '').replace(/\D+/g, '');
      if (phone.length < 8) {
        pairMsg.textContent = 'Informe o número com DDI (ex: 5511999999999).';
        return;
      }
      pairSubmitBtn.disabled = true;
      pairMsg.textContent = 'Gerando código...';
      pairCodeBox.classList.add('hidden');
      try {
        const r = await fetch('/pair', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        const data = await r.json();
        if (!r.ok) {
          pairMsg.textContent = 'Erro: ' + (data.hint || data.message || data.error || `HTTP ${r.status}`);
          return;
        }
        const c = String(data.code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        pairCode.textContent = c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c;
        pairCodeBox.classList.remove('hidden');
        pairMsg.textContent = 'Código válido por poucos minutos. Se expirar, gere outro.';
      } catch (e) {
        pairMsg.textContent = 'Erro: ' + e.message;
      } finally {
        pairSubmitBtn.disabled = false;
      }
    });
  }

  // Initial + polling
  tickStatus();
  tickStats();
  setInterval(tickStatus, 4000);
  setInterval(tickStats, 8000);
})();
