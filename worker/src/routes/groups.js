const express = require('express');
const { z } = require('zod');
const { asyncRoute, HttpError } = require('../utils/errors');
const { toPrivateJid, toGroupJid } = require('../utils/jid');

const router = express.Router();

function ensureReady(req) {
  const wa = req.app.locals.wa;
  if (!wa?.getClient() || wa.state.current !== 'ready') {
    throw new HttpError(409, 'not_ready');
  }
  return wa.getClient();
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const client = ensureReady(req);
    const chats = await client.getChats();
    const meId = client.info?.wid?._serialized || null;
    const groups = chats
      .filter((c) => c.isGroup)
      .map((g) => {
        const md = g.groupMetadata || {};
        const parent = md.parentGroup?._serialized || md.parentGroup || null;
        const meAdmin = meId
          ? !!(g.participants || []).find(
              (p) => (p.id?._serialized === meId) && (p.isAdmin || p.isSuperAdmin)
            )
          : null;
        return {
          id: g.id._serialized,
          name: g.name,
          participants: g.participants?.length ?? null,
          unread: g.unreadCount,
          last_message_ts: g.timestamp ? new Date(g.timestamp * 1000).toISOString() : null,
          parent_group: parent,
          is_parent: !!md.isParentGroup,
          me_is_admin: meAdmin,
        };
      });
    res.json({ groups });
  })
);

router.get(
  '/:id/participants',
  asyncRoute(async (req, res) => {
    const client = ensureReady(req);
    const jid = toGroupJid(req.params.id);
    if (!jid) throw new HttpError(400, 'invalid_group');
    const g = await client.getChatById(jid);
    if (!g.isGroup) throw new HttpError(400, 'not_a_group');
    const participants = (g.participants || []).map((p) => ({
      id: p.id?._serialized,
      number: p.id?.user,
      isAdmin: !!p.isAdmin,
      isSuperAdmin: !!p.isSuperAdmin,
    }));
    res.json({ group: { id: g.id._serialized, name: g.name }, participants });
  })
);

router.patch(
  '/:id/name',
  asyncRoute(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
    const jid = toGroupJid(req.params.id);
    if (!jid) throw new HttpError(400, 'invalid_group');
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({
      chat_id: jid,
      kind: 'group_action',
      payload: { op: 'setSubject', args: { name } },
    });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ ok: true, queued_id: r.id });
  })
);

router.patch(
  '/:id/description',
  asyncRoute(async (req, res) => {
    const { description } = z.object({ description: z.string().max(512) }).parse(req.body);
    const jid = toGroupJid(req.params.id);
    if (!jid) throw new HttpError(400, 'invalid_group');
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({
      chat_id: jid,
      kind: 'group_action',
      payload: { op: 'setDescription', args: { description } },
    });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ ok: true, queued_id: r.id });
  })
);

// Accept invite link (community or single group)
router.post(
  '/join',
  asyncRoute(async (req, res) => {
    const { invite } = z.object({ invite: z.string().min(8) }).parse(req.body);
    const code = invite.replace(/^https?:\/\/(chat\.)?whatsapp\.com\/(invite\/)?/i, '').trim();
    const client = ensureReady(req);
    try {
      const result = await client.acceptInvite(code);
      res.json({ ok: true, code, result });
    } catch (err) {
      throw new HttpError(400, `accept_invite_failed: ${String(err).slice(0, 200)}`);
    }
  })
);

// Create group (Fase 6)
router.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(100),
        participants: z.array(z.string()).min(1),
      })
      .parse(req.body);
    const client = ensureReady(req);
    const jids = body.participants.map((p) => toPrivateJid(p)).filter(Boolean);
    if (!jids.length) throw new HttpError(400, 'no_valid_participants');
    const result = await client.createGroup(body.name, jids);
    res.json({ ok: true, group: result });
  })
);

router.post(
  '/:id/participants',
  asyncRoute(async (req, res) => {
    const body = z.object({ participants: z.array(z.string()).min(1) }).parse(req.body);
    const jid = toGroupJid(req.params.id);
    if (!jid) throw new HttpError(400, 'invalid_group');
    const parts = body.participants.map(toPrivateJid).filter(Boolean);
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({
      chat_id: jid,
      kind: 'group_action',
      payload: { op: 'addParticipants', args: { participants: parts } },
    });
    res.json({ ok: true, queued_id: r.id });
  })
);

router.delete(
  '/:id/participants/:jid',
  asyncRoute(async (req, res) => {
    const groupJid = toGroupJid(req.params.id);
    const partJid = toPrivateJid(req.params.jid);
    if (!groupJid || !partJid) throw new HttpError(400, 'invalid_jid');
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({
      chat_id: groupJid,
      kind: 'group_action',
      payload: { op: 'removeParticipants', args: { participants: [partJid] } },
    });
    res.json({ ok: true, queued_id: r.id });
  })
);

router.post(
  '/:id/participants/:jid/promote',
  asyncRoute(async (req, res) => {
    const groupJid = toGroupJid(req.params.id);
    const partJid = toPrivateJid(req.params.jid);
    if (!groupJid || !partJid) throw new HttpError(400, 'invalid_jid');
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({
      chat_id: groupJid,
      kind: 'group_action',
      payload: { op: 'promoteParticipants', args: { participants: [partJid] } },
    });
    res.json({ ok: true, queued_id: r.id });
  })
);

router.post(
  '/:id/participants/:jid/demote',
  asyncRoute(async (req, res) => {
    const groupJid = toGroupJid(req.params.id);
    const partJid = toPrivateJid(req.params.jid);
    if (!groupJid || !partJid) throw new HttpError(400, 'invalid_jid');
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({
      chat_id: groupJid,
      kind: 'group_action',
      payload: { op: 'demoteParticipants', args: { participants: [partJid] } },
    });
    res.json({ ok: true, queued_id: r.id });
  })
);

module.exports = router;
