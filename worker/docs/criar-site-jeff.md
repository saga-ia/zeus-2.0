# Pipeline "pedido → URL no ar" (sites e apps Jeff)

Stack:
- **HTML/CSS/JS puro** pra landings (sem framework, sem build) — visual premium, postura UI/UX especialista.
- **Node + SQLite** pra apps/dashboards (better-sqlite3 + Express).

## Domínio default: `jefersonhenrike.com`
Use **subdomínios**. Pode substituir/sobrescrever subdomínios antigos do `propostaebcmkt2026.shop` quando for versão nova/melhor — confirme com Jeff em casos óbvios.

**NÃO mexer**: apex `jefersonhenrike.com`, `www`, MX (hospedagem antiga + email ativo). Quebra email e site existente.

`propostaebcmkt2026.shop`: secundário/legado. Usar só quando o pedido for explicitamente daquele projeto.

## Site/landing estático

```bash
SLUG=lp

mkdir -p /opt/jeff-sites/$SLUG
cat > /opt/jeff-sites/$SLUG/index.html <<'HTML'
<!doctype html><html>...
HTML

# DNS (A record proxied=false — TLS é do NPM)
scripts/cloudflare.sh add jefersonhenrike.com $SLUG 80.241.214.10

# Proxy host com SSL Let's Encrypt automático
scripts/npm.sh add-static $SLUG

echo "https://$SLUG.jefersonhenrike.com"
```

Pra zona legado:
```bash
scripts/cloudflare.sh add propostaebcmkt2026.shop $SLUG 80.241.214.10
scripts/npm.sh add-static $SLUG propostaebcmkt2026.shop
```

## App Node + SQLite

```bash
# 1) Pasta /opt/jeff-apps/<slug>/, código com porta dedicada (ex: 3010)
# 2) PM2: pm2 start ecosystem.config.js
# 3) DNS:
scripts/cloudflare.sh add jefersonhenrike.com $SLUG 80.241.214.10
# 4) Proxy host via gateway docker:
scripts/npm.sh add-proxy $SLUG 172.17.0.1 3010
```

## Arquitetura por trás

| Camada | Onde | Como |
|---|---|---|
| Docroot | `/opt/jeff-sites/<slug>/` | uma pasta por slug, `index.html` + assets |
| Servidor estático | container `jeff-sites-nginx` (rede `labastia-setup_labastia`) | nginx:alpine, mapeia Host → `/sites/<sub>/` |
| Proxy + SSL | NPM (`http://127.0.0.1:81`) | proxy host por subdomínio → `jeff-sites-nginx:80` |
| DNS | Cloudflare | A record → `80.241.214.10` |

Adicionar zona nova: editar `map` em `/opt/jeff-sites/_nginx/default.conf`, validar `docker exec jeff-sites-nginx nginx -t`, recarregar `docker exec jeff-sites-nginx nginx -s reload`.

## Regra de design
- Simples, mínimo de elementos, máximo de clareza.
- Tipografia Inter/system-ui, espaçamento generoso, hierarquia clara.
- Mobile-first, responsivo nativo (`clamp`, `grid auto-fit`).
- Paleta limitada (preto/branco + 1 cor de destaque). Dourado/verde defaults bons pro Jeff.
- Microinterações sutis (pulse, fade), sem dataviz pesada se não for dashboard.
- Sem emoji, sem clichê. CTA único e inequívoco.
- **Sempre** `curl https://<slug>.jefersonhenrike.com` e confirmar status 200 antes de mandar URL.

## Helpers
| | |
|---|---|
| `scripts/cloudflare.sh` | DNS records |
| `scripts/npm.sh` | proxy hosts + SSL |
| `scripts/meta-ads.sh` | Meta Ads |
| `scripts/asaas.sh` | financeiro Asaas |
| `scripts/zapsign.sh` | contratos ZapSign |
