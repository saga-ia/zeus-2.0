const express = require('express');
const { z } = require('zod');
const { asyncRoute, HttpError } = require('../utils/errors');
const { synthesize } = require('../audio/tts');
const { isWhitelistedPhone } = require('../agent/notify');
const { resolvePhone } = require('../wa/contact-resolver');
const { toPrivateJid, last9 } = require('../utils/jid');
const { db } = require('../db');

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}


const router = express.Router();

const speakSchema = z.object({
  chatId: z.string().min(1),
  text: z.string().min(1).max(2000),
  priority: z.number().int().min(1).max(9).optional(),
});

router.post(
  '/speak',
  asyncRoute(async (req, res) => {
    const { chatId, text, priority } = speakSchema.parse(req.body);
    const jid = chatId.endsWith('@c.us') || chatId.endsWith('@g.us') || chatId.endsWith('@lid')
      ? chatId
      : toPrivateJid(chatId);
    if (!jid) throw new HttpError(400, 'invalid_chatId');
    if (jid.endsWith('@g.us')) throw new HttpError(403, 'audio_response_only_for_whitelisted');

    // Resolve phone canônico (aceita @c.us, @lid, phone puro). Cache + alias table.
    const client = req.app.locals.wa?.getClient?.();
    const phone = await resolvePhone(client, jid);
    if (!isWhitelistedPhone(phone)) throw new HttpError(403, 'audio_response_only_for_whitelisted');

    // Uma voz só para todo mundo (Jeff, clientes e terceiros): a clonada "Jefferson ZEUS" (elevenlabs_voice_id).
    // Antes o Jeff recebia a elevenlabs_voice_zeus (Brian, em inglês) e o ZEUS parecia trocar de voz.
    const voiceId = getSetting('elevenlabs_voice_id');

    let audio;
    try { audio = await synthesize(text, voiceId); }
    catch (err) {
      // sem ElevenLabs não manda áudio em outra voz: manda o mesmo conteúdo em texto
      const rt = await req.app.locals.queue.enqueue({ chat_id: jid, kind: 'text', payload: { body: text }, priority: priority ?? 5 });
      if (!rt.ok) throw new HttpError(409, 'duplicate');
      return res.json({ status: 'queued_text', queued_id: rt.id, chars: text.length, motivo: 'tts_indisponivel' });
    }
    const { base64, mimetype } = audio;
    const r = await req.app.locals.queue.enqueue({
      chat_id: jid,
      kind: 'audio',
      payload: { base64, mimetype, filename: 'voice.ogg', asPtt: true, fallbackText: text },
      priority: priority ?? 5,
    });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ status: 'queued', queued_id: r.id, chars: text.length });
  })
);

module.exports = router;
