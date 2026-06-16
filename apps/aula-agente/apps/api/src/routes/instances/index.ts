import type { FastifyInstance } from "fastify";
import { createInstanceSchema, updateInstanceSchema } from "@aula-agente/shared";
import {
  getAdminClient,
  getInstancesByOrganization,
  getInstanceById,
  createInstance as createInstanceRecord,
  updateInstance,
  deleteInstance as deleteInstanceRecord,
} from "@aula-agente/database";
import {
  createInstance as createEvolutionInstance,
  getInstanceStatus,
  getInstanceQrCode,
  deleteInstance as deleteEvolutionInstance,
  logoutInstance,
} from "../../services/evolution.service";
import { authMiddleware } from "../../middleware/auth";

export default async function instanceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/instances",
    async (request, reply) => {
      const { organizationId } = request.params;
      const membership = request.user.memberships.find(
        (m) => m.organization_id === organizationId
      );
      if (!membership) return reply.status(403).send({ error: "Access denied" });

      const db = getAdminClient();
      const instances = await getInstancesByOrganization(db, organizationId);
      return instances;
    }
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/instances",
    async (request, reply) => {
      const { organizationId } = request.params;
      const membership = request.user.memberships.find(
        (m) => m.organization_id === organizationId && m.role !== "agent"
      );
      if (!membership) return reply.status(403).send({ error: "Admin access required" });

      const parseResult = createInstanceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.issues });
      }

      const { instance_name } = parseResult.data;
      const publicUrl = process.env.PUBLIC_API_URL;
      if (!publicUrl) {
        return reply.status(500).send({
          error: "PUBLIC_API_URL is not configured — Evolution would not be able to reach the webhook",
        });
      }
      const webhookUrl = `${publicUrl.replace(/\/$/, "")}/webhooks/evolution`;

      const evolutionResult: { instance?: { instanceName?: string } } = await createEvolutionInstance(instance_name, webhookUrl);

      const db = getAdminClient();
      const instance = await createInstanceRecord(db, {
        organization_id: organizationId,
        instance_name,
        instance_id: evolutionResult.instance?.instanceName || instance_name,
        webhook_url: webhookUrl,
      });

      return reply.status(201).send(instance);
    }
  );

  app.get<{ Params: { instanceId: string } }>(
    "/instances/:instanceId/status",
    async (request, reply) => {
      const db = getAdminClient();
      const instance = await getInstanceById(db, request.params.instanceId);

      const membership = request.user.memberships.find(
        (m) => m.organization_id === instance.organization_id
      );
      if (!membership) return reply.status(403).send({ error: "Access denied" });

      const status: { instance?: { state?: string; phoneNumber?: string } } = await getInstanceStatus(instance.instance_name);

      const newStatus = status?.instance?.state === "open" ? "connected" : "disconnected";
      if (newStatus !== instance.status) {
        await updateInstance(db, instance.id, {
          status: newStatus,
          phone_number: status?.instance?.phoneNumber || instance.phone_number,
        });
      }

      return { ...instance, status: newStatus, live: status };
    }
  );

  app.get<{ Params: { instanceId: string } }>(
    "/instances/:instanceId/qrcode",
    async (request, reply) => {
      const db = getAdminClient();
      const instance = await getInstanceById(db, request.params.instanceId);

      const membership = request.user.memberships.find(
        (m) => m.organization_id === instance.organization_id
      );
      if (!membership) return reply.status(403).send({ error: "Access denied" });

      const qrData = await getInstanceQrCode(instance.instance_name);
      return qrData;
    }
  );

  app.patch<{ Params: { instanceId: string } }>(
    "/instances/:instanceId",
    async (request, reply) => {
      const db = getAdminClient();
      const instance = await getInstanceById(db, request.params.instanceId);

      const membership = request.user.memberships.find(
        (m) => m.organization_id === instance.organization_id && m.role !== "agent"
      );
      if (!membership) return reply.status(403).send({ error: "Admin access required" });

      const parseResult = updateInstanceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.issues });
      }

      const updated = await updateInstance(db, instance.id, parseResult.data);
      return updated;
    }
  );

  app.delete<{ Params: { instanceId: string } }>(
    "/instances/:instanceId",
    async (request, reply) => {
      const db = getAdminClient();
      const instance = await getInstanceById(db, request.params.instanceId);

      const membership = request.user.memberships.find(
        (m) => m.organization_id === instance.organization_id && m.role === "owner"
      );
      if (!membership) return reply.status(403).send({ error: "Owner access required" });

      try {
        await deleteEvolutionInstance(instance.instance_name);
      } catch (err) {
        request.log.warn({ err }, "Failed to delete instance from Evolution API");
      }

      await deleteInstanceRecord(db, instance.id);
      return reply.status(204).send();
    }
  );

  app.post<{ Params: { instanceId: string } }>(
    "/instances/:instanceId/logout",
    async (request, reply) => {
      const db = getAdminClient();
      const instance = await getInstanceById(db, request.params.instanceId);

      const membership = request.user.memberships.find(
        (m) => m.organization_id === instance.organization_id && m.role !== "agent"
      );
      if (!membership) return reply.status(403).send({ error: "Admin access required" });

      await logoutInstance(instance.instance_name);
      await updateInstance(db, instance.id, { status: "disconnected" });

      return { ok: true };
    }
  );
}
