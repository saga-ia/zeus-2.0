const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = '/opt/jeff-worker/data/worker.db';
const PORT = 3010;

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma('journal_mode = WAL');

const app = express();

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatPhone = (p) => {
  if (!p) return '';
  const m = String(p).match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return p;
  return `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}`;
};

const relativeTime = (iso) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d atrás`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} mes${mo > 1 ? 'es' : ''} atrás`;
  return `${Math.floor(d / 365)}a atrás`;
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
};

const truncate = (s, n) => {
  if (!s) return '';
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean;
};

const getContacts = () => {
  return db.prepare(`
    SELECT
      m.contact_phone AS phone,
      ca.name AS name,
      COUNT(*) AS total_msgs,
      SUM(CASE WHEN m.from_me = 0 THEN 1 ELSE 0 END) AS msgs_in,
      SUM(CASE WHEN m.from_me = 1 THEN 1 ELSE 0 END) AS msgs_out,
      MAX(m.timestamp) AS last_ts,
      MIN(m.timestamp) AS first_ts
    FROM messages m
    LEFT JOIN contact_aliases ca ON ca.phone = m.contact_phone
    WHERE m.contact_phone IS NOT NULL
      AND m.contact_phone != ''
      AND m.is_group = 0
    GROUP BY m.contact_phone
    ORDER BY last_ts DESC
  `).all();
};

const getLastMessage = (phone) => {
  return db.prepare(`
    SELECT type, body, transcription, timestamp, from_me, has_media
    FROM messages
    WHERE contact_phone = ? AND is_group = 0
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(phone);
};

const lastMsgPreview = (m) => {
  if (!m) return '';
  const txt = m.body || m.transcription || '';
  if (txt) return truncate(txt, 90);
  const labels = {
    image: '[imagem]', ptt: '[áudio]', audio: '[áudio]',
    document: '[documento]', pdf: '[PDF]', video: '[vídeo]', sticker: '[sticker]'
  };
  return labels[m.type] || '[mídia]';
};

app.get('/', (req, res) => {
  const contacts = getContacts();
  const enriched = contacts.map((c) => {
    const last = getLastMessage(c.phone);
    return {
      ...c,
      preview: lastMsgPreview(last),
      preview_from: last ? (last.from_me ? 'zeus' : 'eles') : null,
    };
  });

  const totals = {
    contacts: enriched.length,
    msgs: enriched.reduce((s, c) => s + c.total_msgs, 0),
    msgs_in: enriched.reduce((s, c) => s + c.msgs_in, 0),
    msgs_out: enriched.reduce((s, c) => s + c.msgs_out, 0),
  };

  const rows = enriched.map((c, i) => {
    const initial = (c.name || c.phone || '?').trim().charAt(0).toUpperCase();
    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td>
          <div class="contact">
            <div class="avatar">${escapeHtml(initial)}</div>
            <div>
              <div class="name">${escapeHtml(c.name || 'Sem nome')}</div>
              <div class="phone">${escapeHtml(formatPhone(c.phone))}</div>
            </div>
          </div>
        </td>
        <td class="num">${c.total_msgs}</td>
        <td class="num"><span class="pill in">${c.msgs_in}</span></td>
        <td class="num"><span class="pill out">${c.msgs_out}</span></td>
        <td>
          <div class="preview">
            ${c.preview_from === 'zeus' ? '<span class="from-zeus">Zeus:</span> ' : ''}
            ${escapeHtml(c.preview)}
          </div>
        </td>
        <td>
          <div class="ts">${escapeHtml(relativeTime(c.last_ts))}</div>
          <div class="ts-abs">${escapeHtml(fmtDate(c.last_ts))}</div>
        </td>
      </tr>
    `;
  }).join('');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Zeus — Contatos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after { box-sizing: border-box; }
  :root {
    --bg: #0a0a0b;
    --panel: #131316;
    --panel-2: #1a1a1f;
    --border: #26262d;
    --text: #f4f4f5;
    --muted: #8a8a93;
    --accent: #d4af37;
    --in: #22c55e;
    --out: #d4af37;
  }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 1280px; margin: 0 auto; padding: clamp(20px, 4vw, 48px); }
  header { margin-bottom: 32px; }
  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
  .logo { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, var(--accent), #b8941d); display: grid; place-items: center; font-weight: 700; color: #0a0a0b; font-size: 18px; }
  h1 { margin: 0; font-size: clamp(22px, 3vw, 28px); font-weight: 600; letter-spacing: -0.02em; }
  .subtitle { color: var(--muted); font-size: 14px; margin-top: 4px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 24px 0 32px; }
  .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  .stat .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .val { font-size: 24px; font-weight: 600; margin-top: 4px; letter-spacing: -0.02em; }
  .table-wrap { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
  .search-bar { padding: 16px; border-bottom: 1px solid var(--border); }
  .search-bar input { width: 100%; background: var(--panel-2); border: 1px solid var(--border); color: var(--text); padding: 10px 14px; border-radius: 8px; font: inherit; font-size: 14px; outline: none; transition: border-color .15s; }
  .search-bar input:focus { border-color: var(--accent); }
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; min-width: 900px; }
  th, td { padding: 14px 16px; text-align: left; vertical-align: middle; border-bottom: 1px solid var(--border); }
  th { background: var(--panel-2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,0.02); }
  td.num { color: var(--muted); font-variant-numeric: tabular-nums; }
  .contact { display: flex; align-items: center; gap: 12px; }
  .avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #2a2a32, #1a1a20); display: grid; place-items: center; font-weight: 600; font-size: 14px; color: var(--accent); flex-shrink: 0; }
  .name { font-weight: 500; font-size: 14px; }
  .phone { color: var(--muted); font-size: 12px; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .pill.in { background: rgba(34, 197, 94, 0.12); color: var(--in); }
  .pill.out { background: rgba(212, 175, 55, 0.12); color: var(--out); }
  .preview { font-size: 13px; color: #cfcfd4; max-width: 380px; }
  .from-zeus { color: var(--accent); font-weight: 600; font-size: 12px; }
  .ts { font-size: 13px; color: var(--text); }
  .ts-abs { font-size: 11px; color: var(--muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
  footer { margin-top: 24px; text-align: center; color: var(--muted); font-size: 12px; }
  @media (max-width: 640px) {
    .preview { max-width: 200px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <div class="logo">Z</div>
      <div>
        <h1>Pessoas que falaram com o Zeus</h1>
        <div class="subtitle">Contatos individuais · ordenados pela última interação</div>
      </div>
    </div>
  </header>

  <div class="stats">
    <div class="stat"><div class="label">Contatos</div><div class="val">${totals.contacts}</div></div>
    <div class="stat"><div class="label">Mensagens totais</div><div class="val">${totals.msgs.toLocaleString('pt-BR')}</div></div>
    <div class="stat"><div class="label">Recebidas</div><div class="val">${totals.msgs_in.toLocaleString('pt-BR')}</div></div>
    <div class="stat"><div class="label">Enviadas pelo Zeus</div><div class="val">${totals.msgs_out.toLocaleString('pt-BR')}</div></div>
  </div>

  <div class="table-wrap">
    <div class="search-bar">
      <input id="q" type="search" placeholder="Buscar por nome ou telefone..." autocomplete="off" />
    </div>
    <div class="table-scroll">
      <table id="tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Contato</th>
            <th>Total</th>
            <th>Recebidas</th>
            <th>Enviadas</th>
            <th>Última mensagem</th>
            <th>Quando</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>

  <footer>Atualizado em ${escapeHtml(fmtDate(new Date().toISOString()))} · auto-refresh a cada 60s</footer>
</div>

<script>
  const q = document.getElementById('q');
  const tbody = document.querySelector('#tbl tbody');
  q.addEventListener('input', () => {
    const term = q.value.toLowerCase().trim();
    [...tbody.rows].forEach(r => {
      r.style.display = !term || r.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  });
  setTimeout(() => location.reload(), 60000);
</script>
</body>
</html>`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`zeus-contacts listening on 127.0.0.1:${PORT}`);
});
