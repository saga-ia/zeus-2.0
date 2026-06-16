import { getRedisConnection } from "@aula-agente/queue";
import type { LLMProvider } from "@aula-agente/shared";

const INVALIDATE_CHANNEL = "vault:invalidate";

// Disparado pelas rotas de settings sempre que um tenant cria/atualiza/remove
// uma chave em organization_secrets. O worker está subscrito neste canal e
// limpa a entrada correspondente do cache imediatamente, evitando a janela
// de até 60s do TTL.
export async function publishVaultInvalidate(organizationId: string, provider: LLMProvider) {
  const redis = getRedisConnection();
  await redis.publish(INVALIDATE_CHANNEL, `${organizationId}:${provider}`);
}
