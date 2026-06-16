const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = '/opt/jeff-worker/data/worker.db';
const CRM_DB_PATH = '/opt/jeff-apps/jeff-ebc-crm/data/crm.db';
const PORT = process.env.PORT || 3014;
const WAPI_BASE = 'http://127.0.0.1:3002';
const WAPI_TOKEN = (() => {
  try {
    const env = fs.readFileSync('/opt/jeff-worker/.env', 'utf8');
    const m = env.match(/^API_TOKEN=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
})();

const db = new Database(DB_PATH, { fileMustExist: true });
db.pragma('journal_mode = WAL');

const crmDb = new Database(CRM_DB_PATH, { fileMustExist: true });
crmDb.pragma('journal_mode = WAL');

const insertEvent = db.prepare(`
  INSERT INTO zapsign_events (event, doc_id, doc_token, signer_id, signer_email, status, raw_json, crm_matched_lead_id)
  VALUES (@event, @doc_id, @doc_token, @signer_id, @signer_email, @status, @raw_json, @crm_matched_lead_id)
`);

const listEvents = db.prepare(`
  SELECT id, event, doc_id, doc_token, signer_id, signer_email, status, raw_json, received_at, crm_matched_lead_id
  FROM zapsign_events
  ORDER BY received_at DESC
  LIMIT ? OFFSET ?
`);
const countEvents = db.prepare(`SELECT COUNT(*) AS n FROM zapsign_events`);

const findLeadByPhone = crmDb.prepare(`
  SELECT id, name, phone, email, status FROM leads
  WHERE replace(replace(replace(replace(phone,'+',''),' ',''),'-',''),'(','') = ?
     OR replace(replace(replace(replace(phone,'+',''),' ',''),'-',''),'(','') = ?
  LIMIT 1
`);
const findLeadByEmail = crmDb.prepare(`
  SELECT id, name, phone, email, status FROM leads
  WHERE lower(email) = lower(?)
  LIMIT 1
`);
const updateLeadStatus = crmDb.prepare(`
  UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?
`);
const insertLeadEvent = crmDb.prepare(`
  INSERT INTO lead_events (lead_id, user_id, event, payload) VALUES (?, NULL, ?, ?)
`);

const pick = (obj, ...keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((a, p) => (a == null ? a : a[p]), obj);
    if (v != null && v !== '') return String(v);
  }
  return null;
};

const onlyDigits = (s) => (s || '').replace(/\D/g, '');
const phoneVariants = (raw) => {
  const d = onlyDigits(raw);
  if (!d) return [];
  const noCountry = d.startsWith('55') ? d.slice(2) : d;
  const withCountry = d.startsWith('55') ? d : '55' + d;
  return [withCountry, noCountry, d];
};

const normEvent = (event) => String(event || '').toLowerCase().replace(/[._-]/g, '');
const isDocSignedEvent = (event) => {
  const e = normEvent(event);
  return e === 'docsigned' || e === 'documentsigned' || e === 'docfinalized';
};
const isDocCreatedEvent = (event) => {
  const e = normEvent(event);
  return e === 'doccreated' || e === 'documentcreated';
};

async function sendWhatsApp(phone, message) {
  if (!WAPI_TOKEN) { console.warn('[wpp] no API_TOKEN'); return false; }
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return false;
  const phoneFull = digits.startsWith('55') ? digits : '55' + digits;
  try {
    const r = await fetch(`${WAPI_BASE}/messages/private`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WAPI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to: phoneFull, body: message })
    });
    if (!r.ok) {
      console.warn(`[wpp] send failed ${r.status} to=${phoneFull}: ${await r.text().catch(()=> '')}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[wpp] send error:', e.message);
    return false;
  }
}

const extractSigners = (body) => {
  const signers = [];
  const pushIf = (s) => {
    if (!s) return;
    const phone = pick(s, 'phone', 'phone_number', 'cel_phone', 'telefone') || '';
    const phoneCountry = pick(s, 'phone_country', 'country_code') || '';
    const fullPhone = (phoneCountry || '') + (phone || '');
    signers.push({
      email: pick(s, 'email'),
      phone: fullPhone || phone,
      name: pick(s, 'name'),
      status: pick(s, 'status'),
      token: pick(s, 'token', 'id'),
      raw: s
    });
  };
  // shapes: top-level signers, doc.signers, signer (singular)
  (body.signers || body?.doc?.signers || []).forEach(pushIf);
  if (body.signer && typeof body.signer === 'object') pushIf(body.signer);
  return signers;
};

const matchLead = (signers) => {
  for (const s of signers) {
    if (s.phone) {
      for (const v of phoneVariants(s.phone)) {
        const lead = findLeadByPhone.get(v, '55' + v.replace(/^55/, ''));
        if (lead) return { lead, matchedBy: 'phone', signer: s };
      }
    }
    if (s.email) {
      const lead = findLeadByEmail.get(s.email);
      if (lead) return { lead, matchedBy: 'email', signer: s };
    }
  }
  return null;
};

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: 'connected', crm: 'connected', count: countEvents.get().n });
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const event = pick(body, 'event_type', 'event', 'type') || 'unknown';
    const doc_id = pick(body, 'doc_id', 'open_id', 'document.open_id', 'document.id', 'doc.open_id', 'doc.id', 'id');
    const doc_token = pick(body, 'doc_token', 'token', 'document.token', 'doc.token');
    const doc_name = pick(body, 'name', 'doc.name', 'document.name') || 'Documento';
    const signer_id = pick(body, 'signer_id', 'signer.token', 'signer.id');
    const signer_email = pick(body, 'signer_email', 'signer.email', 'email');
    const status = pick(body, 'status', 'document.status', 'doc.status');

    let matchedLeadId = null;
    let crmAction = null;
    const wppActions = [];

    // 1) doc.created → manda link de assinatura pro celular de cada signer com phone
    if (isDocCreatedEvent(event)) {
      const signers = extractSigners(body);
      for (const s of signers) {
        const signUrl = pick(s.raw || {}, 'sign_url') || pick(body, 'sign_url') || null;
        if (s.phone) {
          const firstName = (s.name || '').split(' ')[0] || '';
          const msg = `Olá${firstName ? ' ' + firstName : ''}! Seu documento *${doc_name}* está pronto para assinatura.\n\n` +
                     (signUrl ? `Link: ${signUrl}\n\n` : '') +
                     `Qualquer dúvida, é só responder aqui.`;
          const ok = await sendWhatsApp(s.phone, msg);
          wppActions.push(`created→${s.phone}: ${ok ? 'sent' : 'fail'}`);
        }
      }
    }

    // 2) doc.signed (final) → confirmação + match com CRM
    if (isDocSignedEvent(event)) {
      const signers = extractSigners(body);

      // confirma recebimento pra cada signer
      for (const s of signers) {
        if (s.phone) {
          const firstName = (s.name || '').split(' ')[0] || '';
          const msg = `Recebemos seu contrato *${doc_name}* assinado${firstName ? ', ' + firstName : ''}. Obrigado!`;
          const ok = await sendWhatsApp(s.phone, msg);
          wppActions.push(`signed→${s.phone}: ${ok ? 'sent' : 'fail'}`);
        }
      }

      // CRM linkage
      const match = matchLead(signers);
      if (match) {
        matchedLeadId = match.lead.id;
        if (match.lead.status !== 'fechado' && match.lead.status !== 'perdido') {
          updateLeadStatus.run('fechado', match.lead.id);
          insertLeadEvent.run(match.lead.id, 'contract_signed', JSON.stringify({
            source: 'zapsign',
            doc_id, doc_token,
            matched_by: match.matchedBy,
            signer: match.signer,
            previous_status: match.lead.status
          }));
          crmAction = `lead ${match.lead.id} (${match.lead.name}) → fechado [${match.matchedBy}]`;
        } else {
          crmAction = `lead ${match.lead.id} já estava em ${match.lead.status} (no-op)`;
        }
      } else {
        crmAction = `nenhum lead casou com ${signers.length} signer(s)`;
      }
    }

    insertEvent.run({
      event, doc_id, doc_token, signer_id, signer_email, status,
      raw_json: JSON.stringify(body),
      crm_matched_lead_id: matchedLeadId
    });

    console.log(`[zapsign-webhook] ${event} doc=${doc_id || '?'} signer=${signer_email || '?'}${crmAction ? ' | CRM: ' + crmAction : ''}${wppActions.length ? ' | WPP: ' + wppActions.join(', ') : ''}`);
    res.json({ ok: true, crm: crmAction, wpp: wppActions });
  } catch (e) {
    console.error('[zapsign-webhook] ERROR', e.stack);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const rows = listEvents.all(limit, offset).map(r => ({
    ...r,
    raw: (() => { try { return JSON.parse(r.raw_json); } catch { return null; } })()
  }));
  res.json({ ok: true, total: countEvents.get().n, items: rows });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[zapsign-webhook] listening on 0.0.0.0:${PORT}`);
});
