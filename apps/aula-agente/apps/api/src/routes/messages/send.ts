import type { FastifyInstance } from "fastify";
import { sendMessageSchema } from "@aula-agente/shared";
import { getAdminClient, getConversationById, getInstanceById } from "@aula-agente/database";
import { authMiddleware } from "../../middleware/auth";
import { saveMessage } from "../../services/message.service";
import { enqueueSendMessage } from "../../lib/queue";

export default async function messageSendRoutes(app: FastifyInstance) {
  app.post("/messages/send", {
    preHandler: [authMiddleware],
    handler: async (request, reply) => {
      const parseResult = sendMessageSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.issues });
      }

      const { conversation_id, content } = parseResult.data;
      const db = getAdminClient();

      const conversation = await getConversationById(db, conversation_id);
      if (!conversation) {
        return reply.status(404).send({ error: "Conversation not found" });
      }

      const membership = request.user.memberships.find(
        (m) => m.organization_id === conversation.organization_id
      );
      if (!membership) {
        return reply.status(403).send({ error: "Access denied" });
      }

      const message = await saveMessage({
        conversationId: conversation_id,
        organizationId: conversation.organization_id,
        evolutionMessageId: null,
        role: "human_agent",
        content,
      });

      if (!message) {
        return reply.status(500).send({ error: "Failed to save message" });
      }

      const instance = await getInstanceById(db, conversation.evolution_instance_id);
      const contact = conversation.contacts;

      await enqueueSendMessage({
        conversationId: conversation_id,
        messageId: message.id,
        instanceId: instance.id,
        phone: contact.phone,
        content,
        organizationId: conversation.organization_id,
      });

      return reply.status(200).send({ ok: true, messageId: message.id });
    },
  });
}
