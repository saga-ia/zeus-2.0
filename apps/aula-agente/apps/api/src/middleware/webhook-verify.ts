import type { FastifyRequest, FastifyReply } from "fastify";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (IS_PRODUCTION && !WEBHOOK_SECRET) {
  throw new Error(
    "WEBHOOK_SECRET must be set in production — refusing to start with an open webhook endpoint"
  );
}

export async function webhookVerifyMiddleware(request: FastifyRequest, reply: FastifyReply) {
  if (!WEBHOOK_SECRET) {
    request.log.warn("WEBHOOK_SECRET not set — skipping webhook verification (dev only)");
    return;
  }

  const apiKey = request.headers["apikey"] as string
    || request.headers["x-api-key"] as string;

  if (!apiKey || apiKey !== WEBHOOK_SECRET) {
    return reply.status(401).send({ error: "Invalid webhook secret" });
  }
}
