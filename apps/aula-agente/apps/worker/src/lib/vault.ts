import { getAdminClient } from "@aula-agente/database";
import { getRedisConnection } from "@aula-agente/queue";
import type { LLMProvider } from "@aula-agente/shared";

const keyCache = new Map<string, { key: string; expiresAt: number }>();
// Short TTL bounds the staleness window after a key rotation. Pubsub below
// invalidates eagerly when the dashboard updates a secret.
const CACHE_TTL_MS = 60 * 1000;
const INVALIDATE_CHANNEL = "vault:invalidate";

const ENV_FALLBACKS: Record<LLMProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
};

let subscribed = false;
function ensureInvalidationSubscriber() {
  if (subscribed) return;
  subscribed = true;
  // Use a dedicated subscriber connection — ioredis blocks normal commands
  // on a connection that has subscribed, so we duplicate from the pool.
  const sub = getRedisConnection().duplicate();
  sub.subscribe(INVALIDATE_CHANNEL).catch((err) => {
    console.error("vault: failed to subscribe to invalidation channel", err);
  });
  sub.on("message", (channel, message) => {
    if (channel !== INVALIDATE_CHANNEL) return;
    if (message === "*") {
      keyCache.clear();
      return;
    }
    keyCache.delete(message);
  });
}

export async function resolveApiKey(
  organizationId: string,
  provider: LLMProvider
): Promise<string> {
  ensureInvalidationSubscriber();

  const cacheKey = `${organizationId}:${provider}`;

  const cached = keyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  const db = getAdminClient();
  const { data, error } = await db
    .from("organization_secrets")
    .select("encrypted_key")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();

  if (!error && data?.encrypted_key) {
    keyCache.set(cacheKey, {
      key: data.encrypted_key,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return data.encrypted_key;
  }

  const envKey = process.env[ENV_FALLBACKS[provider]];
  if (!envKey) {
    throw new Error(
      `No API key found for provider "${provider}" in organization "${organizationId}" or environment`
    );
  }

  return envKey;
}

// Publish from the API process when a tenant rotates their key, e.g.:
//   await invalidateApiKey(orgId, "openai")
export async function invalidateApiKey(organizationId: string, provider: LLMProvider) {
  const redis = getRedisConnection();
  await redis.publish(INVALIDATE_CHANNEL, `${organizationId}:${provider}`);
}
