---
name: PM2 reload obrigatório após editar código de app
description: Quando edito server.js/handler de app sob PM2 e a feature nova não funciona em prod, reload do PM2 antes de qualquer outra investigação
type: feedback
originSessionId: f340431b-5034-495b-b6b6-a7a8a8e7cd44
---
Quando edito código de um app rodando sob PM2 (jeff-onboarding, jeff-asaas-dashboard, jeff-zapsign-webhook, jeff-ads-dashboard, etc) e a feature nova "não funciona em produção" (form abre zerado, endpoint não reconhece slug, bug aparente que o código corrigiu), o problema quase sempre é que o **processo PM2 ainda tá com a versão antiga em memória**. Node não recarrega arquivo automaticamente.

**Why:** Incidente 2026-05-04 com o farias.jefersonhenrike.com — adicionei suporte a slug em `/api/onboarding/start`, subi o código e o DNS, mas o form abria zerado pro Jeff. Perdi ~20min investigando DNS, cache de browser, propagação Cloudflare, gerando PDF/forms.gle de fallback. O bug real: PM2 ainda rodava o build antigo que ignorava `req.body.slug`. `pm2 reload jeff-onboarding` resolveu na hora.

**How to apply:**
1. Sempre que editar código de app sob PM2, rodar `pm2 reload <app-name>` (ou `restart`) **imediatamente após salvar** — não esperar bug aparecer.
2. Se feature nova "não funciona" e o código fonte está claramente correto: **primeiro suspeito é PM2 com build velho**. Comando de diagnóstico: `pm2 describe <app>` mostra `pm_uptime` — se o uptime é maior que o tempo desde a edição, está velho.
3. `pm2 reload` é zero-downtime (cluster mode); `pm2 restart` derruba e sobe (single mode). Default: `reload` quando o app está em cluster.
4. Apps PM2 atuais que precisam dessa atenção: `jeff-onboarding`, `jeff-asaas-dashboard`, `jeff-zapsign-webhook`, `jeff-ads-dashboard`, `jeff-vps-monitor`, `jeff-ebc-crm`, `zeus-contacts`. O worker principal (`whatsapp-worker`) também — mas reiniciar o worker requer ok do Jeff/Vinicius.
5. Se o app servir arquivos estáticos (HTML/CSS/JS em `public/`), arquivos estáticos não precisam reload — só o código Node precisa.
