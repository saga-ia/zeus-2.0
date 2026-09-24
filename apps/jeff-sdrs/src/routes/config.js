'use strict';
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const crmSync = require('../services/crmSync');
const { normalizePhoneStrict, normalizePhoneExplain } = require('../utils/phone');

// Helper: registra ate 10 amostras do que foi rejeitado no upload, com motivo.
// Retorna funcoes para chamar em cada branch de skip; a UI usa isso pra explicar
// exatamente por que N contatos nao entraram (Fix Smith 2026-07-21).
function makeRejectedSampler(cap) {
  const samples = [];
  return {
    push(phoneRaw, reason) {
      if (samples.length >= (cap || 10)) return;
      samples.push({ phone: String(phoneRaw == null ? '' : phoneRaw).slice(0, 40), reason });
    },
    list() { return samples; },
  };
}

// Statement reutilizavel: checa se ja existe job ativo (pending ou sent) pro mesmo slot+phone.
// Isso evita disparar 2x pro mesmo numero e evita "furar" o mesmo lote de novo.
const stmtCheckDup = db.prepare(
  `SELECT 1 FROM slot_upload_job WHERE slot = ? AND target_phone = ? AND status IN ('pending','sent') LIMIT 1`
);

const router = express.Router();
router.use(requireAuth);

// Uploads em memoria: xlsx sao pequenos, midia idem (5MB p/ contatos, 20MB p/ midia).
const uploadContacts = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Fix Smith 2026-07-21 (upload de midia PDF/audio/video/imagem):
// - Limite subiu de 20MB pra 64MB (video curto cabe).
// - fileFilter explicito aceita as familias que o SDR usa em conversa: PDF, docs comuns,
//   audio (mpeg/mp4/ogg/wav/webm), video (mp4/quicktime/webm) e imagem.
// - Antes: sem fileFilter, dependia so do check de mime no handler (que so validava imagem).
//   Isso na pratica aceitava tudo, mas nao dava sinal claro ao usuario do que era suportado.
const MEDIA_ALLOWED_RE = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats|application\/vnd\.ms-|application\/zip|application\/octet-stream|text\/plain|audio\/|video\/|image\/)/i;
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mt = String(file.mimetype || '').toLowerCase();
    if (MEDIA_ALLOWED_RE.test(mt)) return cb(null, true);
    // Alguns browsers mandam mimetype vazio pra PDF/DOC. Cai no octet-stream ja permitido.
    if (!mt) return cb(null, true);
    return cb(new Error('mime_nao_permitido:' + mt));
  }
});

const MEDIA_ROOT = path.join(__dirname, '..', '..', 'media');
fs.mkdirSync(MEDIA_ROOT, { recursive: true });

function normKeyword(s) {
  return String(s || '').trim().toLowerCase();
}

function normPhone(s) {
  return String(s || '').replace(/\D/g, '');
}

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

router.get('/:slot/config', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare(`SELECT slot, name, role_label, welcome_message, ai_active, master_slot, trigger_mode,
                          sdr_mode, personality_level, reference_url, conversation_instructions,
                          dispatch_min_delay, dispatch_max_delay, dispatch_pause_every, dispatch_pause_seconds,
                          instructions,
                          ai_provider, ai_model, ai_key_id, ai_daily_limit, ai_paused_until,
                          send_link_enabled, send_link_url, send_link_trigger,
                          send_file_enabled, send_file_path, send_file_trigger,
                          send_image_enabled, send_image_path, send_image_trigger
                          FROM sdrs WHERE slot = ?`).get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const triggers = db.prepare('SELECT keyword FROM slot_triggers WHERE slot = ? ORDER BY id').all(slot).map(r => r.keyword);
  const dispatch_messages = db.prepare('SELECT id, body FROM slot_dispatch_messages WHERE slot = ? ORDER BY position, id').all(slot);
  const available_keys = db.prepare('SELECT id, label, provider, key_last4 FROM api_keys ORDER BY id DESC').all();
  res.json({ sdr, triggers, dispatch_messages, available_keys });
});

router.put('/:slot/config', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const {
    welcome_message, ai_active, master_slot, trigger_mode, triggers,
    sdr_mode, personality_level, reference_url, conversation_instructions,
    dispatch_min_delay, dispatch_max_delay, dispatch_pause_every, dispatch_pause_seconds,
    dispatch_messages, instructions,
    ai_provider, ai_model, ai_key_id, ai_daily_limit,
    send_link_enabled, send_link_url, send_link_trigger,
    send_file_enabled, send_file_trigger,
    send_image_enabled, send_image_trigger,
  } = req.body || {};

  const now = new Date().toISOString();
  const mode = trigger_mode === 'any' || trigger_mode === 'strict' ? trigger_mode : 'any';
  const master = master_slot == null || master_slot === '' ? null : parseInt(master_slot, 10);
  if (master != null && (isNaN(master) || master === slot)) return res.status(400).json({ error: 'master_slot_invalido' });
  const sdrMode = sdr_mode === 'ativo' ? 'ativo' : 'receptivo';
  const personality = clampInt(personality_level, 0, 10, 5);
  const minDelay = clampInt(dispatch_min_delay, 3, 3600, 30);
  const maxDelayRaw = clampInt(dispatch_max_delay, 3, 3600, 60);
  const maxDelay = maxDelayRaw < minDelay ? minDelay : maxDelayRaw;
  const pauseEvery = clampInt(dispatch_pause_every, 1, 1000, 10);
  const pauseSecs = clampInt(dispatch_pause_seconds, 0, 86400, 300);

  // Campos IA
  const aiDailyLimit = clampInt(ai_daily_limit, 0, 10000, 20);
  const validProviders = new Set(['anthropic', 'openai', 'gemini']);
  const aiProvider = ai_provider && validProviders.has(String(ai_provider).toLowerCase()) ? String(ai_provider).toLowerCase() : null;
  const aiModel = ai_model == null || ai_model === '' ? null : String(ai_model).slice(0, 100);
  let aiKeyId = null;
  if (ai_key_id != null && ai_key_id !== '') {
    const n = parseInt(ai_key_id, 10);
    if (!isNaN(n)) {
      const exists = db.prepare('SELECT 1 FROM api_keys WHERE id = ?').get(n);
      if (exists) aiKeyId = n;
    }
  }

  // Toggles/config de midia
  const linkEnabled = send_link_enabled ? 1 : 0;
  const linkUrl = send_link_url == null ? null : String(send_link_url).slice(0, 1000);
  const linkTrig = send_link_trigger == null ? null : String(send_link_trigger).slice(0, 500);
  const fileEnabled = send_file_enabled ? 1 : 0;
  const fileTrig = send_file_trigger == null ? null : String(send_file_trigger).slice(0, 500);
  const imgEnabled = send_image_enabled ? 1 : 0;
  const imgTrig = send_image_trigger == null ? null : String(send_image_trigger).slice(0, 500);

  db.prepare(`UPDATE sdrs SET
    welcome_message = ?,
    ai_active = ?,
    master_slot = ?,
    trigger_mode = ?,
    sdr_mode = ?,
    personality_level = ?,
    reference_url = ?,
    conversation_instructions = ?,
    dispatch_min_delay = ?,
    dispatch_max_delay = ?,
    dispatch_pause_every = ?,
    dispatch_pause_seconds = ?,
    instructions = COALESCE(?, instructions),
    ai_provider = ?,
    ai_model = ?,
    ai_key_id = ?,
    ai_daily_limit = ?,
    send_link_enabled = ?,
    send_link_url = ?,
    send_link_trigger = ?,
    send_file_enabled = ?,
    send_file_trigger = ?,
    send_image_enabled = ?,
    send_image_trigger = ?,
    updated_at = ?
    WHERE slot = ?`).run(
      welcome_message == null ? null : String(welcome_message).slice(0, 2000),
      ai_active ? 1 : 0,
      master,
      mode,
      sdrMode,
      personality,
      reference_url == null ? null : String(reference_url).slice(0, 500),
      conversation_instructions == null ? null : String(conversation_instructions).slice(0, 8000),
      minDelay,
      maxDelay,
      pauseEvery,
      pauseSecs,
      instructions == null ? null : String(instructions).slice(0, 8000),
      aiProvider,
      aiModel,
      aiKeyId,
      aiDailyLimit,
      linkEnabled,
      linkUrl,
      linkTrig,
      fileEnabled,
      fileTrig,
      imgEnabled,
      imgTrig,
      now,
      slot
    );

  if (Array.isArray(triggers)) {
    const dedup = new Map();
    for (const t of triggers) {
      const k = normKeyword(t);
      if (k && k.length <= 200) dedup.set(k, true);
    }
    db.prepare('DELETE FROM slot_triggers WHERE slot = ?').run(slot);
    const ins = db.prepare('INSERT OR IGNORE INTO slot_triggers (slot, keyword) VALUES (?, ?)');
    const tx = db.transaction((rows) => { for (const k of rows) ins.run(slot, k); });
    tx([...dedup.keys()]);
  }

  if (Array.isArray(dispatch_messages)) {
    db.prepare('DELETE FROM slot_dispatch_messages WHERE slot = ?').run(slot);
    const ins = db.prepare('INSERT INTO slot_dispatch_messages (slot, position, body) VALUES (?, ?, ?)');
    const tx = db.transaction((rows) => {
      let pos = 0;
      for (const m of rows) {
        const body = String((m && (m.body || m)) || '').trim();
        if (!body) continue;
        ins.run(slot, pos++, body.slice(0, 2000));
      }
    });
    tx(dispatch_messages);
    db.prepare(`UPDATE slot_dispatch_state SET next_message_index = 0 WHERE slot = ?`).run(slot);
  }

  res.json({ ok: true });
});

router.post('/:slot/upload-contacts', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const { contacts } = req.body || {};
  if (!Array.isArray(contacts) || !contacts.length) return res.status(400).json({ error: 'lista_vazia' });
  const ins = db.prepare('INSERT INTO slot_upload_job (slot, target_phone, target_name, status) VALUES (?, ?, ?, ?)');
  const enrolled = [];
  let added = 0, skipped = 0, duplicated = 0;
  const seenInBatch = new Set(); // dedupe dentro do proprio payload
  const rej = makeRejectedSampler(10);
  const tx = db.transaction((rows) => {
    for (const c of rows) {
      const rawPhone = c.phone || c.telefone || c;
      const { phone, reason } = normalizePhoneExplain(rawPhone);
      if (!phone || phone.length < 12) { skipped++; rej.push(rawPhone, reason || 'invalid_format'); continue; }
      if (seenInBatch.has(phone)) { duplicated++; rej.push(rawPhone, 'dedupe_batch'); continue; }
      if (stmtCheckDup.get(slot, phone)) { duplicated++; seenInBatch.add(phone); rej.push(rawPhone, 'dedupe_pending_or_sent'); continue; }
      const name = c.name || c.nome || null;
      ins.run(slot, phone, name ? String(name).slice(0, 120) : null, 'pending');
      seenInBatch.add(phone);
      enrolled.push({ phone, name });
      added++;
    }
  });
  tx(contacts);
  // Auto-sync com CRM: cada contato entra na coluna "Disparado" antes do envio.
  for (const e of enrolled) crmSync.markSent(e.phone, e.name, slot).catch(() => {});
  res.json({ ok: true, added, skipped, duplicated, total: contacts.length, rejected_samples: rej.list() });
});

async function fetchSheetCsv(url) {
  const clean = String(url || '').trim();
  if (!clean) throw new Error('url_vazia');
  let csvUrl = clean;
  const m = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) {
    const id = m[1];
    const gidMatch = clean.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }
  // Anti-SSRF: so aceita host do Google Sheets/Docs. Bloqueia URL arbitraria/IP interno.
  let parsed;
  try { parsed = new URL(csvUrl); } catch { throw new Error('url_invalida'); }
  const allowedHosts = new Set(['docs.google.com', 'sheets.googleapis.com']);
  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
    throw new Error('host_nao_permitido');
  }
  const r = await fetch(csvUrl, { redirect: 'follow' });
  if (!r.ok) throw new Error('fetch_falhou_' + r.status);
  return await r.text();
}

// Parser resiliente: aceita separador `,` `;` `\t` `|`, coluna telefone em qualquer posicao,
// nome vindo antes ou depois, valores entre aspas, e header opcional.
// Regra: em cada linha, a coluna com maior contagem de digitos (>=8) vira o telefone;
// a primeira coluna nao-numerica vira o nome. Isso cobre CSV/TXT em ambas as ordens.
function parseCsvContacts(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  const HEADER_HINTS = ['telefone', 'phone', 'numero', 'número', 'celular', 'whatsapp', 'nome', 'name'];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(/[,;\t|]/).map(p => p.trim().replace(/^"|"$/g, '')).filter(Boolean);
    if (!parts.length) continue;

    // Ignora header: se primeira linha tem termo tipico de header e nao tem digito longo, pula.
    const lower = parts.map(p => p.toLowerCase());
    const looksLikeHeader = lower.some(v => HEADER_HINTS.includes(v)) && !parts.some(p => p.replace(/\D/g, '').length >= 8);
    if (looksLikeHeader) continue;

    // Encontra coluna com mais digitos (min 8 pra evitar CEP/idade)
    let phone = '';
    let phoneIdx = -1;
    let maxDigits = 0;
    for (let i = 0; i < parts.length; i++) {
      const digits = parts[i].replace(/\D/g, '');
      if (digits.length >= 8 && digits.length > maxDigits) {
        maxDigits = digits.length;
        phone = digits;
        phoneIdx = i;
      }
    }
    if (!phone) continue;

    // Nome: primeira coluna nao-telefone que tenha letras
    let name = null;
    for (let i = 0; i < parts.length; i++) {
      if (i === phoneIdx) continue;
      const hasLetter = /[a-zA-ZáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/.test(parts[i]);
      if (hasLetter) { name = parts[i]; break; }
    }
    out.push({ phone, name });
  }
  return out;
}

// Detecta coluna telefone/nome em array de objetos (linhas do XLSX).
function extractContactsFromRows(rows) {
  if (!rows || !rows.length) return [];
  const PHONE_KEYS = ['telefone', 'phone', 'numero', 'número', 'celular', 'whatsapp', 'fone', 'tel', 'contato'];
  const NAME_KEYS = ['nome', 'name', 'cliente', 'lead', 'contact_name'];
  const firstKeys = Object.keys(rows[0]).map(k => String(k).toLowerCase().trim());

  // Tenta bater por header primeiro
  let phoneKey = null, nameKey = null, metaKeys = [];
  const originalKeys = Object.keys(rows[0]);
  for (let i = 0; i < originalKeys.length; i++) {
    const k = firstKeys[i];
    if (!phoneKey && PHONE_KEYS.some(p => k.includes(p))) phoneKey = originalKeys[i];
    else if (!nameKey && NAME_KEYS.some(p => k.includes(p))) nameKey = originalKeys[i];
    else metaKeys.push(originalKeys[i]);
  }

  // Se nao achou header claro, heuristica: coluna com mais digitos por linha vira telefone.
  if (!phoneKey) {
    const scores = {};
    for (const k of originalKeys) scores[k] = 0;
    for (const r of rows.slice(0, 20)) {
      for (const k of originalKeys) {
        const digits = String(r[k] == null ? '' : r[k]).replace(/\D/g, '');
        if (digits.length >= 8) scores[k]++;
      }
    }
    let best = null, bestScore = 0;
    for (const k of originalKeys) if (scores[k] > bestScore) { bestScore = scores[k]; best = k; }
    if (best && bestScore > 0) {
      phoneKey = best;
      // nome = primeira coluna diferente com letras
      for (const k of originalKeys) {
        if (k === phoneKey) continue;
        const hasLetter = rows.slice(0, 5).some(r => /[a-zA-Z]/.test(String(r[k] == null ? '' : r[k])));
        if (hasLetter) { nameKey = k; break; }
      }
      metaKeys = originalKeys.filter(k => k !== phoneKey && k !== nameKey);
    }
  } else {
    metaKeys = originalKeys.filter(k => k !== phoneKey && k !== nameKey);
  }
  if (!phoneKey) return [];

  const out = [];
  for (const r of rows) {
    const phoneRaw = r[phoneKey];
    const phone = String(phoneRaw == null ? '' : phoneRaw).replace(/\D/g, '');
    if (!phone || phone.length < 8) continue;
    const name = nameKey && r[nameKey] != null ? String(r[nameKey]).trim() : null;
    const meta = {};
    for (const k of metaKeys) if (r[k] != null && String(r[k]).trim()) meta[k] = r[k];
    out.push({ phone, name: name || null, meta: Object.keys(meta).length ? meta : null });
  }
  return out;
}

router.post('/:slot/upload-sheet', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const { url } = req.body || {};
  try {
    const csv = await fetchSheetCsv(url);
    const contacts = parseCsvContacts(csv);
    if (!contacts.length) return res.status(400).json({ error: 'sem_contatos' });
    const ins = db.prepare('INSERT INTO slot_upload_job (slot, target_phone, target_name, status) VALUES (?, ?, ?, ?)');
    const enrolled = [];
    let added = 0, skipped = 0, duplicated = 0;
    const seenInBatch = new Set();
    const rej = makeRejectedSampler(10);
    const tx = db.transaction((rows) => {
      for (const c of rows) {
        const { phone, reason } = normalizePhoneExplain(c.phone);
        if (!phone || phone.length < 12) { skipped++; rej.push(c.phone, reason || 'invalid_format'); continue; }
        if (seenInBatch.has(phone)) { duplicated++; rej.push(c.phone, 'dedupe_batch'); continue; }
        if (stmtCheckDup.get(slot, phone)) { duplicated++; seenInBatch.add(phone); rej.push(c.phone, 'dedupe_pending_or_sent'); continue; }
        ins.run(slot, phone, c.name ? String(c.name).slice(0, 120) : null, 'pending');
        seenInBatch.add(phone);
        enrolled.push({ phone, name: c.name });
        added++;
      }
    });
    tx(contacts);
    for (const e of enrolled) crmSync.markSent(e.phone, e.name, slot).catch(() => {});
    res.json({ ok: true, added, skipped, duplicated, total: contacts.length, rejected_samples: rej.list() });
  } catch (e) {
    res.status(400).json({ error: 'sheet_read_failed', detail: String(e.message || e) });
  }
});

router.get('/:slot/upload-jobs', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const rows = db.prepare(`SELECT id, target_phone, target_name, status, error, created_at, sent_at
                           FROM slot_upload_job WHERE slot = ? ORDER BY id DESC LIMIT 500`).all(slot);
  const counts = db.prepare(`SELECT status, COUNT(*) as n FROM slot_upload_job WHERE slot = ? GROUP BY status`).all(slot);
  res.json({ jobs: rows, counts });
});

router.delete('/:slot/upload-jobs', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  db.prepare("DELETE FROM slot_upload_job WHERE slot = ? AND status = 'pending'").run(slot);
  res.json({ ok: true });
});

router.delete('/:slot/upload-jobs/:id', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id FROM slot_upload_job WHERE id = ? AND slot = ?').get(id, slot);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM slot_upload_job WHERE id = ? AND slot = ?').run(id, slot);
  res.json({ ok: true });
});

router.post('/:slot/ai-pause', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const minutes = clampInt(req.body && req.body.minutes, 1, 1440, 10);
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  db.prepare('UPDATE sdrs SET ai_paused_until = ? WHERE slot = ?').run(until, slot);
  res.json({ ok: true, paused_until: until });
});

router.post('/:slot/ai-resume', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  db.prepare('UPDATE sdrs SET ai_paused_until = NULL WHERE slot = ?').run(slot);
  res.json({ ok: true });
});

router.get('/:slot/ai-stats', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const usedToday = db.prepare(`
    SELECT COUNT(*) as n FROM ai_interactions
    WHERE slot = ? AND status = 'ok'
      AND datetime(created_at, '-3 hours') >= datetime(?, 'start of day')
      AND datetime(created_at, '-3 hours') <  datetime(?, 'start of day', '+1 day')
  `).get(slot, today, today);
  const last = db.prepare(`SELECT provider, model, status, tokens_in, tokens_out, latency_ms, created_at, error
                           FROM ai_interactions WHERE slot = ? ORDER BY id DESC LIMIT 10`).all(slot);
  res.json({ used_today: (usedToday && usedToday.n) || 0, last });
});

router.get('/:slot/bindings', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const rows = db.prepare(`SELECT phone, chat_id, matched_keyword, created_at
                           FROM contact_slot_binding WHERE slot = ? ORDER BY created_at DESC LIMIT 200`).all(slot);
  res.json({ bindings: rows });
});

// ===== Upload XLSX / XLS =====
router.post('/:slot/upload-xlsx', uploadContacts.single('file'), async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'arquivo_ausente' });
  const nameLower = (req.file.originalname || '').toLowerCase();
  if (!/\.(xlsx|xls)$/i.test(nameLower)) return res.status(400).json({ error: 'extensao_invalida' });

  let contacts;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return res.status(400).json({ error: 'planilha_vazia' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
    contacts = extractContactsFromRows(rows);
  } catch (e) {
    return res.status(400).json({ error: 'xlsx_parse_fail', detail: String(e.message || e) });
  }
  if (!contacts.length) return res.status(400).json({ error: 'sem_contatos' });

  const ins = db.prepare('INSERT INTO slot_upload_job (slot, target_phone, target_name, status) VALUES (?, ?, ?, ?)');
  const enrolled = [];
  let added = 0, skipped = 0, duplicated = 0;
  const seenInBatch = new Set();
  const rej = makeRejectedSampler(10);
  const tx = db.transaction((rows) => {
    for (const c of rows) {
      const { phone, reason } = normalizePhoneExplain(c.phone);
      if (!phone || phone.length < 12) { skipped++; rej.push(c.phone, reason || 'invalid_format'); continue; }
      if (seenInBatch.has(phone)) { duplicated++; rej.push(c.phone, 'dedupe_batch'); continue; }
      if (stmtCheckDup.get(slot, phone)) { duplicated++; seenInBatch.add(phone); rej.push(c.phone, 'dedupe_pending_or_sent'); continue; }
      ins.run(slot, phone, c.name ? String(c.name).slice(0, 120) : null, 'pending');
      seenInBatch.add(phone);
      enrolled.push({ phone, name: c.name });
      added++;
    }
  });
  tx(contacts);
  for (const e of enrolled) crmSync.markSent(e.phone, e.name, slot).catch(() => {});
  res.json({ ok: true, added, skipped, duplicated, total: contacts.length, rejected_samples: rej.list() });
});

// ===== Upload de midia (arquivo/audio/video/imagem) por slot =====
// Fix Smith 2026-07-21: aceita PDF/audio/video/imagem no mesmo endpoint. Auto-liga
// send_{kind}_enabled ao subir (evita bug de "subi mas nao ativei"). Retorna mime
// pra UI mostrar o tipo detectado. Erro do multer chega aqui com codigo especifico.
router.post('/:slot/media-upload',
  (req, res, next) => {
    uploadMedia.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'arquivo_muito_grande', detail: 'Limite: 64MB' });
      }
      const msg = String(err.message || err);
      if (msg.startsWith('mime_nao_permitido')) {
        return res.status(415).json({ error: 'tipo_nao_suportado', detail: msg });
      }
      return res.status(400).json({ error: 'upload_falhou', detail: msg });
    });
  },
  (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'arquivo_ausente' });

  // kind: 'file' ou 'image'. PDFs/docs/audio/video caem em 'file'.
  const kind = String(req.body.kind || '').toLowerCase();
  if (kind !== 'file' && kind !== 'image') return res.status(400).json({ error: 'kind_invalido' });

  const mime = String(req.file.mimetype || '').toLowerCase();
  // Se marcou como 'image' mas mandou nao-imagem, rejeita. Se marcou 'file', aceita tudo.
  if (kind === 'image' && !/^image\//.test(mime)) {
    return res.status(415).json({ error: 'mime_nao_imagem', mime });
  }

  const slotDir = path.join(MEDIA_ROOT, `slot-${slot}`);
  fs.mkdirSync(slotDir, { recursive: true });

  // Sanitiza nome: mantem extensao, remove path traversal
  const originalName = String(req.file.originalname || 'upload.bin').replace(/[/\\]/g, '_').slice(0, 120);
  const safeName = `${kind}-${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fullPath = path.join(slotDir, safeName);

  try {
    fs.writeFileSync(fullPath, req.file.buffer);
  } catch (e) {
    return res.status(500).json({ error: 'write_fail', detail: String(e.message || e) });
  }

  // Remove path antigo se existir (pra nao acumular lixo). So APOS o novo ter escrito com sucesso.
  const col = kind === 'image' ? 'send_image_path' : 'send_file_path';
  const enCol = kind === 'image' ? 'send_image_enabled' : 'send_file_enabled';
  try {
    const prev = db.prepare(`SELECT ${col} AS p FROM sdrs WHERE slot = ?`).get(slot);
    if (prev && prev.p && prev.p !== fullPath && fs.existsSync(prev.p)) {
      // apenas se estiver dentro do MEDIA_ROOT (guardrail)
      if (path.resolve(prev.p).startsWith(path.resolve(MEDIA_ROOT))) {
        try { fs.unlinkSync(prev.p); } catch {}
      }
    }
  } catch {}

  // Auto-liga o toggle. Fix pro bug de "subiu mas nao ativou" (Jeff, 2026-07-21).
  // Se o usuario subiu algo, a intencao esta clara: quer usar. Se depois quiser desligar,
  // desmarca o checkbox e salva.
  db.prepare(`UPDATE sdrs SET ${col} = ?, ${enCol} = 1, updated_at = ? WHERE slot = ?`)
    .run(fullPath, new Date().toISOString(), slot);

  res.json({ ok: true, path: fullPath, name: safeName, size: req.file.size, mime, kind, auto_enabled: true });
});

module.exports = router;
