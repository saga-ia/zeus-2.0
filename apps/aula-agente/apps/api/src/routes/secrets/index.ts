import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LLM_PROVIDERS } from "@aula-agente/shared";
import { authMiddleware } from "../../middleware/auth";
import { publishVaultInvalidate } from "../../lib/vault";

const invalidateBodySchema = z.object({
  provider: z.enum(LLM_PROVIDERS),
});

export default async function secretsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Dashboard chama esta rota quando salva/remove uma API key em settings;
  // o pubsub propaga para os workers que limpam o cache local.
  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/secrets/invalidate",
    async (request, reply) => {
      const { organizationId } = request.params;

      const membership = request.user.memberships.find(
        (m) => m.organization_id === organizationId && m.role !== "agent"
      );
      if (!membership) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const parseResult = invalidateBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.issues });
      }

      await publishVaultInvalidate(organizationId, parseResult.data.provider);
      return { ok: true };
    }
  );
}
