# Operação — Sites, dashboards e DNS (Cloudflare + NPM)

Lazy-load. Carregue quando o pedido for: criar landing/dashboard/sistema/ferramenta interna, mexer em DNS/subdomínio, configurar proxy/SSL.

Estética visual obrigatória → carregar `zeus/06_estetica_voz.md` antes de produzir qualquer artefato visual.

## Stack
- **HTML/CSS/JS puro** pra landings (sem framework, sem build).
- **Node + SQLite (better-sqlite3 + Express)** pra apps/dashboards/sistemas.

## Domínio padrão: `jefersonhenrike.com`

Usar **subdomínios** (ex: `lp.`, `crm.`, `app.`, `<slug>.`). Pode substituir subdomínios antigos do `propostaebcmkt2026.shop` quando for versão nova/melhor — confirmar com Jeff se for migração óbvia.

**HARD: NÃO mexer no apex (`@`), `www`, ou MX de `jefersonhenrike.com` sem ordem explícita.** O apex e www apontam pra hospedagem antiga (`216.198.79.1` proxied via CF) e o domínio tem MX/email ativo. Mexer = quebra email + site existente.

`propostaebcmkt2026.shop` continua como **secundário** (legado, projetos internos com a marca antiga). Use só se o pedido for explicitamente daquele projeto.

## Fluxo turnkey "pedido → URL no ar" (estático)

```bash
SLUG=lp                                          # subdomínio + nome da pasta

# 1) HTML em /opt/jeff-sites/<slug>/index.html
mkdir -p /opt/jeff-sites/$SLUG
cat > /opt/jeff-sites/$SLUG/index.html <<'HTML'
<!doctype html><html>...
HTML

# 2) DNS A record (proxied=false — TLS é do NPM)
scripts/cloudflare.sh add jefersonhenrike.com $SLUG 80.241.214.10

# 3) Proxy host no NPM com SSL automático
scripts/npm.sh add-static $SLUG

# 4) Aguarda SSL (~5-30s) e curl https://$SLUG.jefersonhenrike.com pra confirmar 200
echo "https://$SLUG.jefersonhenrike.com"
```

Pra usar `propostaebcmkt2026.shop` (legado), passe a zona explícita:
```bash
scripts/cloudflare.sh add propostaebcmkt2026.shop $SLUG 80.241.214.10
scripts/npm.sh add-static $SLUG propostaebcmkt2026.shop
```

## Apps Node+SQLite (não-estático)

```bash
# 1) /opt/jeff-apps/<slug>/, código Node+SQLite (porta dedicada, ex: 3010)
# 2) Sobe via PM2: pm2 start ecosystem.config.js
# 3) DNS:
scripts/cloudflare.sh add jefersonhenrike.com $SLUG 80.241.214.10
# 4) Proxy host apontando pra porta via gateway docker:
scripts/npm.sh add-proxy $SLUG 172.17.0.1 3010
```

## Arquitetura

| Camada | Onde | Como |
|---|---|---|
| Docroot | `/opt/jeff-sites/<slug>/` | uma pasta por slug |
| Servidor estático | container `jeff-sites-nginx` (rede `labastia-setup_labastia`) | nginx:alpine, mapeia Host → `/sites/<sub>/` |
| Proxy + SSL | NPM (`http://127.0.0.1:81`) | proxy host por subdomínio → `jeff-sites-nginx:80` |
| DNS | Cloudflare | A record `<slug>.<zona>` → `80.241.214.10` |

`jeff-sites-nginx` reconhece subdomínios das **duas** zonas via map em `/opt/jeff-sites/_nginx/default.conf`. Adicionar zona nova: edita `map`, valida com `docker exec jeff-sites-nginx nginx -t`, recarrega com `docker exec jeff-sites-nginx nginx -s reload`.

## Régua de design (obrigatória)

- Simplicidade Disney (Lei 7) — mínimo de elementos, máximo de clareza.
- Tipografia system-ui (Inter / Apple / Segoe) sem fonte custom.
- Mobile-first, responsivo nativo (clamp, grid auto-fit).
- Paleta dark layered + accent lima neon `#C4FF0E` (SAGA) ou `#C8FA4D` (VPS).
- Microinterações sutis (pulse, fade), glow lima nos itens ativos.
- Régua premium: "isso pode ir pra cliente que paga R$ 60.000 de entrada?" — se não, refaz.
- **Sempre** testar a página final com `curl` e confirmar status 200 antes de mandar URL.

## Cloudflare DNS

Conta: `jeferson.inteligenciaemocional@gmail.com`. Token e zonas em `app_settings`. Helper: `scripts/cloudflare.sh`.

Zonas ativas (token tem acesso às duas):
| Zona | Zone ID | Uso |
|---|---|---|
| `jefersonhenrike.com` | `79312419b3dbc8d1b3916b153e030043` | Default novo |
| `propostaebcmkt2026.shop` | `fbf67f60590ebaa315801bddf42ab86e` | Legado |

Subdomínios já configurados em `propostaebcmkt2026.shop` (server `80.241.214.10`):
- `agente` (worker WhatsApp), `manager` (NPM), `lp` (landings legado), `diretor` (livre), `chatbot` (livre).
- CNAMEs apontando pro `manager`: `evolution`, `portainer`, `webhook`, `workflow`.

Comandos:
```bash
scripts/cloudflare.sh records jefersonhenrike.com
scripts/cloudflare.sh add jefersonhenrike.com <subdominio> 80.241.214.10
scripts/cloudflare.sh add-cname jefersonhenrike.com <name> <target>
scripts/cloudflare.sh del jefersonhenrike.com <record_id>
```

Convenção:
- Default: criar em `jefersonhenrike.com`.
- `propostaebcmkt2026.shop`: só pedido explícito do projeto legado.
- Migração: pode criar novo em `jefersonhenrike.com` e apontar/deletar antigo do shop — confirmar antes.
- Sempre `proxied=false` quando destino é nosso server.

## Helpers
| Helper | Função |
|---|---|
| `scripts/cloudflare.sh` | DNS records (read/add/del) |
| `scripts/npm.sh` | Proxy hosts + SSL automático |
