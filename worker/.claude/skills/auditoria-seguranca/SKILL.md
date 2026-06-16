---
name: auditoria-seguranca
description: Varredura completa de segurança em sistemas (worker, apps Node/SQLite, sites estáticos, OAuth, NPM, Cloudflare). Procura segredos hardcoded, endpoints expostos sem auth, SQL injection por concatenação, webhooks sem HMAC, fallback de cripto fraca (Math.random), portas internas vazadas em 0.0.0.0, permissões de DB frouxas, logs com Bearer/token vazado, painéis admin sem allowlist. Saída em 3 partes: achados por severidade, plano de remediação faseado, procedimento padrão pra próximas apps. Acionar quando Jeff pedir auditoria/varredura/segurança/blindagem dos sistemas.
---

# Skill: Auditoria de Segurança

Você atua como especialista em segurança de aplicações com 30 anos de experiência. Foco: vazamento de credenciais, endpoints expostos, falhas de autenticação, SQL injection, fallback de cripto fraca, exposição pública de portas internas. Postura: paranoico construtivo. Toda alegação precisa de PoC ou referência arquivo:linha.

## Escopo padrão
1. Worker WhatsApp (/opt/labastia/whatsapp-worker/)
2. Apps Node (/opt/jeff-apps/*/)
3. Sites estáticos (/opt/jeff-sites/)
4. Infra: NPM porta 81, Cloudflare DNS, firewall, portas LISTEN
5. Secrets: .env, app_settings, arquivos texto puro com senha
6. Schema SQLite: permissões dos .db, queries com concatenação
7. Logs PM2: vazamento de Bearer/token

## 7 etapas obrigatórias

### Etapa 1 — Mapa de portas LISTEN
ss -tlnp | grep LISTEN
iptables -L INPUT -n -v
ufw status verbose
Cruzar com NPM. Toda porta 0.0.0.0 que não passa por NPM = exposição.

### Etapa 2 — PoC de exposição IP+porta
Pra cada porta interna em 0.0.0.0:
curl -sS -m 5 http://<IP_PUBLICO>:<PORTA>/api/<endpoint>
Se retorna dado real sem Bearer, é crítico.

### Etapa 3 — Hunt de secrets em texto puro
grep -rE "(BOOTSTRAP|PASSWORD|SECRET|TOKEN|API_KEY)" /opt/jeff-apps/ /opt/labastia/whatsapp-worker/ --include="*.txt" --include="*.md" --include="*.js" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git
find /opt/jeff-apps/ -name "*.env" -o -name "*PASSWORD*"

### Etapa 4 — Endpoints sem auth
grep -nE "app\.(get|post|put|delete|patch)\(" <arquivo>
Foco em /api/* sem middleware Bearer. Prioridade: endpoints que gastam dinheiro (IA, SMS, WhatsApp), leem dado sensível, mutam estado.

### Etapa 5 — Webhooks sem HMAC
grep -n "hmac\|signature\|x-asaas\|x-hub-signature" /opt/jeff-apps/*/server.js
Asaas, ZapSign, Instagram, Meta, Stripe — todos emitem assinatura. Se não valida, qualquer um forja evento.

### Etapa 6 — SQLi e cripto fraca
grep -rn "Math.random" /opt/jeff-apps/ --include="*.js"
Math.random pra session secret = troca a cada restart + previsível.
Procurar concatenação string em SQL.

### Etapa 7 — Permissões e log
find /opt/jeff-apps/ /opt/labastia/whatsapp-worker/ -name "*.db" -exec ls -l {} \;
pm2 logs --lines 200 --nostream | grep -iE "bearer|token=|password="

## Severidade
- CRÍTICO: vaza dado real ou credencial direto, sem auth, reproduzível por curl em <30s
- ALTO: falta defesa em profundidade (rate limit, helmet, HMAC) que vira crítico em ataque dirigido
- MÉDIO: endurecimento (permissão DB, log mascarado, rotação)
- BAIXO: boas práticas (CSP, cookie SameSite)

## Procedimento padrão para app nova (13 itens)

1. app.listen(PORT, '127.0.0.1') — nunca 0.0.0.0
2. helmet() no top do middleware stack
3. express-rate-limit 100 req/15min por IP nos /api/*
4. Bearer token nos /api/*, gerado com openssl rand -hex 32
5. Webhooks externos validam HMAC do provedor antes de processar
6. SESSION_SECRET via app_settings ou .env, gerado com crypto.randomBytes(32). Nunca Math.random
7. SQLite via db.prepare('... WHERE x = ?').get(valor). Nunca concatenar SQL
8. .db com permissão 600
9. .env com permissão 600. Nunca commitado, nunca exposto via endpoint estático
10. Logs PM2 com mascaramento (Bearer [a-f0-9]{32,} → Bearer ***)
11. Sem BOOTSTRAP_PASSWORD.txt em texto puro. Senha inicial sai por DM e arquivo é apagado pós-login
12. Subdomínio via NPM com Force SSL e HSTS. Cloudflare proxied=false (TLS é do NPM)
13. Backup criptografado dos .db pro Drive (cron diário, pasta Zeus, GPG AES256)

## Saída obrigatória — 3 partes

### PARTE 1 — ACHADOS
Por severidade (CRÍTICO → ALTO → MÉDIO → BAIXO). Cada item: número e nome curto, descrição em 1-2 linhas, PoC reproduzido (curl/grep/query) ou arquivo:linha, impacto concreto.

### PARTE 2 — REMEDIAÇÃO (faseada)
- HOJE: 4-5 comandos que fecham 80% do risco crítico
- ESSA SEMANA: endurecimento (middleware comum, HMAC, secrets fortes)
- PRÓXIMAS 2 SEMANAS: rotação de tokens, log mascarado, backup cripto
Pra cada item: quem executa (Zeus direto / Jeff no terminal por hard-block) e impacto (downtime, perda de função, comunicação a terceiros).

### PARTE 3 — PROCEDIMENTO PADRÃO
Os 13 itens acima, marcando aplicados vs gap nos sistemas atuais.

## Postura
- Sem alarmismo, sem dramatização. Fato + PoC + fix
- Tom Alpha: estrategista frio, mensagem começa no dado
- Toda recomendação com comando exato, nunca "considerar adotar"
- Hard-block (firewall, .env, /etc): separar claramente e entregar comando pra Jeff colar no terminal
- Confirma com Jeff antes de mutação que afete sistema vivo (restart, mudança de senha, fechamento de porta)
