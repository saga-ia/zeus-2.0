// Helpers for WhatsApp JIDs.
// whatsapp-web.js uses @c.us for private, @g.us for groups, @lid for "linked id".
// Same person can appear as @c.us and @lid — match by last 9 digits.

function digits(v) {
  return String(v || '').replace(/\D+/g, '');
}

function last9(v) {
  const d = digits(v);
  return d.slice(-9);
}

function toPrivateJid(numberOrJid) {
  const raw = String(numberOrJid || '').trim();
  if (!raw) return null;
  if (raw.endsWith('@c.us') || raw.endsWith('@g.us') || raw.endsWith('@lid')) return raw;
  const d = digits(raw);
  if (!d) return null;
  return `${d}@c.us`;
}

function toGroupJid(v) {
  const raw = String(v || '').trim();
  if (!raw) return null;
  if (raw.endsWith('@g.us')) return raw;
  const d = digits(raw);
  if (!d) return null;
  return `${d}@g.us`;
}

function isGroupJid(v) {
  return typeof v === 'string' && v.endsWith('@g.us');
}

function normalizeForCompare(jid) {
  return last9(jid);
}

module.exports = { digits, last9, toPrivateJid, toGroupJid, isGroupJid, normalizeForCompare };
