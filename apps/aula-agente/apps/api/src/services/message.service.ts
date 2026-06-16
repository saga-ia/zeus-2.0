import {
  getAdminClient,
  createMessage,
  messageExistsByEvolutionId,
  updateConversation,
} from "@aula-agente/database";
import type { MessageRole, MediaType } from "@aula-agente/shared";

interface SaveMessageParams {
  conversationId: string;
  organizationId: string;
  evolutionMessageId: string | null;
  role: MessageRole;
  content: string;
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  metadata?: Record<string, unknown> | null;
}

export async function saveMessage(params: SaveMessageParams) {
  const db = getAdminClient();

  if (params.evolutionMessageId) {
    const exists = await messageExistsByEvolutionId(db, params.evolutionMessageId);
    if (exists) {
      return null;
    }
  }

  let message;
  try {
    message = await createMessage(db, {
      conversation_id: params.conversationId,
      organization_id: params.organizationId,
      evolution_message_id: params.evolutionMessageId,
      role: params.role,
      content: params.content,
      media_url: params.mediaUrl || null,
      media_type: params.mediaType || null,
      metadata: params.metadata || null,
    });
  } catch (err) {
    // Postgres 23505 = unique_violation. The pre-check passed but a concurrent
    // webhook inserted the same evolution_message_id first. Treat as duplicate.
    const code = (err as { code?: string } | null)?.code;
    if (params.evolutionMessageId && code === "23505") {
      return null;
    }
    throw err;
  }

  await updateConversation(db, params.conversationId, {
    last_message_at: new Date().toISOString(),
  });

  return message;
}
