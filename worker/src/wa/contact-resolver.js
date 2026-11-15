const { db } = require('../db');
const logger = require('../logger');
const { digits, last9 } = require('../utils/jid');

const RESOLVE_TIMEOUT_MS = 10_000;

// Cache in-memory: jid → phone (string só dígitos). Null = já tentei e falhou.
const phoneCache = new Map();

const upsertAlias = db.prepare(`
  INSERT INTO contact_aliases (phone, lid, c_us, name, updated_at)
  VALUES (@phone, @lid, @c_us, @name, datetime('now'))
  ON CONFLICT(phone) DO UPDATE SET
    lid = COALESCE(excluded.lid, contact_aliases.lid),
    c_us = COALESCE(excluded.c_us, contact_aliases.c_us),
    name = COALESCE(excluded.name, contact_aliases.name),
    updated_at = datetime('now')
`);

const selectPhoneByLid = db.prepare(`SELECT phone, c_us FROM contact_aliases WHERE lid = ? LIMIT 1`);
const selectPhoneByCus = db.prepare(`SELECT phone FROM contact_aliases WHERE c_us = ? LIMIT 1`);

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

// Celular brasileiro sem o 9 (o WhatsApp ainda entrega assim para números antigos): 55 + DDD + 8 dígitos
// começando em 6-9 vira 55 + DDD + 9 + 8 dígitos. Fixo (começa em 2-5) e outros países ficam como estão.
function normBR(d) {
  if (!d) return d;
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) return d.slice(0, 4) + '9' + d.slice(4);
  return d;
}

function phoneFromCus(jid) {
  if (typeof jid !== 'string' || !jid.endsWith('@c.us')) return null;
  const d = digits(jid.split('@')[0]);
  return d ? normBR(d) : null;
}

function phoneFromAliasTable(jid) {
  if (typeof jid !== 'string') return null;
  try {
    if (jid.endsWith('@lid')) {
      const row = selectPhoneByLid.get(jid);
      if (!row) return null;
      // Registros antigos gravaram o próprio LID como telefone: nesse caso usa o @c.us (ou não sabe).
      if (row.phone === digits(jid.split('@')[0])) return row.c_us ? phoneFromCus(row.c_us) : null;
      return row.phone || null;
    }
    if (jid.endsWith('@c.us')) return selectPhoneByCus.get(jid)?.phone || null;
  } catch (err) {
    logger.warn({ err, jid }, 'alias table lookup failed');
  }
  return null;
}

async function resolvePhone(client, jid) {
  if (!jid || typeof jid !== 'string') return null;
  if (jid.endsWith('@g.us')) return null; // grupos não têm phone único

  if (phoneCache.has(jid)) return phoneCache.get(jid);

  // Atalho: @c.us → phone direto no JID.
  const direct = phoneFromCus(jid);
  if (direct) {
    phoneCache.set(jid, direct);
    upsertAlias.run({ phone: direct, lid: null, c_us: jid, name: null });
    return direct;
  }

  // Atalho: tabela de aliases já conhecido.
  const cached = phoneFromAliasTable(jid);
  if (cached) {
    phoneCache.set(jid, cached);
    return cached;
  }

  // Último recurso: perguntar ao wweb.js.
  if (!client || typeof client.getContactById !== 'function') {
    phoneCache.set(jid, null);
    return null;
  }

  try {
    const contact = await withTimeout(client.getContactById(jid), RESOLVE_TIMEOUT_MS, `getContactById(${jid})`);
    const idSer = contact?.id?._serialized || contact?.id?.$1 || '';
    const cUs = idSer.endsWith('@c.us') ? idSer : null;
    const lid = jid.endsWith('@lid') ? jid : null;
    const lidDigits = lid ? digits(lid.split('@')[0]) : null;
    // Para @lid, contact.number costuma ser o próprio LID (não é telefone): prefere o @c.us e descarta número igual ao LID.
    let phone = cUs ? phoneFromCus(cUs) : null;
    if (!phone) {
      const cand = contact?.number ? digits(contact.number) : (!lid && contact?.id?.user ? digits(contact.id.user) : null);
      if (cand && cand !== lidDigits) phone = normBR(cand);
    }
    const name = contact?.name || contact?.pushname || null;

    if (phone) {
      upsertAlias.run({ phone, lid, c_us: cUs, name });
      phoneCache.set(jid, phone);
      // também cacheia a outra forma se conhecida
      if (cUs) phoneCache.set(cUs, phone);
      if (lid) phoneCache.set(lid, phone);
      return phone;
    }
    phoneCache.set(jid, null);
    return null;
  } catch (err) {
    logger.warn({ err: String(err.message || err), jid }, 'resolvePhone failed');
    phoneCache.set(jid, null);
    return null;
  }
}

function phoneFromJidSync(jid) {
  if (!jid || typeof jid !== 'string') return null;
  if (jid.endsWith('@g.us')) return null;
  const direct = phoneFromCus(jid);
  if (direct) return direct;
  if (phoneCache.has(jid)) return phoneCache.get(jid);
  return phoneFromAliasTable(jid);
}

module.exports = { resolvePhone, phoneFromJidSync, phoneFromAliasTable, normBR };
