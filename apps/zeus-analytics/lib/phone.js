// Normaliza JID do whatsapp-web.js pra E.164 sem '+'.
// Ex: "5511999999999@c.us" -> "5511999999999"
function jidToPhone(jid) {
  if (!jid) return null;
  const m = String(jid).match(/^(\d+)@/);
  return m ? m[1] : null;
}

function phoneToJid(phone) {
  return `${String(phone).replace(/\D/g, '')}@c.us`;
}

function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

module.exports = { jidToPhone, phoneToJid, isGroupJid };
