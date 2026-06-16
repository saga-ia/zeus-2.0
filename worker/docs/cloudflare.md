# Cloudflare DNS

Token e zonas em `app_settings`. Conta: `jeferson.inteligenciaemocional@gmail.com`. Helper: `scripts/cloudflare.sh`.

## Zonas
| Zona | Zone ID | Uso |
|---|---|---|
| `jefersonhenrike.com` | `79312419b3dbc8d1b3916b153e030043` | **default novo** — sites/apps pessoais |
| `propostaebcmkt2026.shop` | `fbf67f60590ebaa315801bddf42ab86e` | legado / projetos internos |

## Caveat `jefersonhenrike.com`
Apex `@`, `www` e `MX` apontam pra hospedagem antiga (`216.198.79.1` proxied) + email ativo. **Mexer nesses 3 records quebra email e site atual.** Confirma com Jeff antes. Subdomínios novos (`lp.`, `crm.`, etc.) não conflitam.

## Subdomínios já em `propostaebcmkt2026.shop` (server `80.241.214.10`)
| Subdomínio | Função |
|---|---|
| `agente` | worker WhatsApp |
| `manager` | Nginx Proxy Manager (admin) |
| `lp` | landing pages legado |
| `diretor` | livre (bom pra dashboard) |
| `chatbot` | livre |
| `evolution`, `portainer`, `webhook`, `workflow` | CNAME → manager |

## Comandos
```bash
scripts/cloudflare.sh records jefersonhenrike.com
scripts/cloudflare.sh add jefersonhenrike.com <sub> 80.241.214.10
scripts/cloudflare.sh add-cname jefersonhenrike.com <name> <target>
scripts/cloudflare.sh del jefersonhenrike.com <record_id>
```

## Convenção
- Default: criar em `jefersonhenrike.com` (subdomínios novos).
- Legado: usar `propostaebcmkt2026.shop` só quando explícito.
- Migração: novo em `jefersonhenrike.com`, apontar/deletar antigo — confirmar antes.
- Apex/www/MX `jefersonhenrike.com`: **não mexer** sem ordem explícita.
- Sempre `proxied=false` quando o destino é nosso server (TLS via NPM).

Após DNS, configurar Nginx Proxy Manager (`manager.propostaebcmkt2026.shop`): proxy host → porta interna do app, Force SSL ON.
