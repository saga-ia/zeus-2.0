---
name: sobral-tracking
description: Modo TRACKING AVANÇADO do Sobral. 3 pilares (client + server + first-party), EMQ 8+, deduplicação, AEM 8 eventos, setup por plataforma (WordPress, Shopify, ClickFunnels, Cartpanda, Hotmart, Kiwify, Next.js vibe code), Enhanced Conversions Google, Consent Mode v2 LGPD, debug de bugs comuns. Acionar quando Jeff falar "configurar Pixel", "GTM", "CAPI", "Enhanced Conversions", "WordPress tracking", "Cartpanda Pixel", "EMQ baixo", "evento duplicado", "server-side", "Stape".
---

# Sobral — Tracking Avançado

**Princípio:** tracking ruim faz algoritmo aprender errado. Tudo se constrói aqui.

## Diagnóstico
1. Plataforma (WordPress/Shopify/ClickFunnels/Cartpanda/Hotmart/Kiwify/Next.js custom)?
2. Pixel Meta instalado? CAPI ativo?
3. GTM configurado?
4. GA4 + Google Ads conversion?
5. EMQ atual?
6. Eventos duplicados ou matched browser+server?
7. Enhanced Conversions?
8. Consent Mode v2 (LGPD)?

## 3 pilares
- **Client-side:** Pixel + gtag + GTM browser.
- **Server-side:** CAPI + GTM Server + Enhanced Conv.
- **First-party:** Customer Match + CRM.

## EMQ Score (mire 8+)
- Email SHA-256 lowercased trimmed.
- Telefone com DDI SHA-256.
- Nome + sobrenome hash.
- FBP + FBC cookies.
- IP + User Agent (server).
- Nascimento, cidade, estado, CEP (hashes).

## Deduplicação
`event_id` idêntico no Pixel e CAPI. Verificar Events Manager > matched >80%.

## AEM (8 eventos, prioridade)
Purchase → InitiateCheckout → AddPaymentInfo → AddToCart → ViewContent → +3 custom.

## Setup por plataforma

**WordPress:**
- Combo pro: GTM4WP + Stape (GTM Server-Side, ~US$20/mês).
- Simples: PixelYourSite Pro.
- Hook `woocommerce_thankyou` pra disparar CAPI server-side.

**Shopify:** app oficial Facebook & Instagram + customer events. Customer Match upload semanal.

**ClickFunnels 2.0:** Integrations > Pixel + Access Token. Server-side: Cometly ou TripleWhale.

**Cartpanda:** Configurações > Integrações > Pixel + Access Token (CAPI nativa) + GTM.

**Hotmart:** Produtor > Integrações > Pixels + postback nativo.

**Kiwify:** painel Pixels (Meta + GA4 + Google Ads num só lugar).

**Eduzz/Monetizze/Greenn/Perfectpay:** campo Pixel + postback HTTPS pra backend que envia CAPI.

**Next.js / vibe code:**
- GTM no `layout.tsx`.
- `dataLayer.push event:purchase` no thank-you.
- API route `/api/capi` com hash SHA-256, FBP, FBC, IP, User Agent.
- Env vars: `META_PIXEL_ID`, `META_ACCESS_TOKEN`.

## Enhanced Conversions Google
Goals > Conversions > Settings > Enhanced Conversions > modo GTM > "Include user-provided data" > mapear email/phone/name/address > Match Rate >60%.

## Consent Mode v2 (LGPD)
Cookiebot/CookieYes/Iubenda + tags só após consent.

## Debug
- Meta Pixel Helper (Chrome).
- Tag Assistant Companion.
- GTM Preview Mode.
- Events Manager Test Events.
- DataLayer Inspector+.

## Bugs comuns + fix
- **Eventos duplicados** → deduplicação via `event_id`.
- **EMQ baixo** → revisar hashes (SHA-256 lowercased).
- **Eventos não chegando** → CORS, firewall, adblocker.
- **Tag não dispara** → trigger/variável no Preview.
- **Conv Google zero** → Enhanced Conversions desativado.
- **"Attribution unknown" Meta** → EMQ baixo + falta CAPI.

## Checklist saúde final
- [ ] Pixel em todas páginas principais.
- [ ] Eventos com `event_id` único.
- [ ] CAPI ativo EMQ 7+.
- [ ] Dedup ≥80% matched.
- [ ] Domínio verificado.
- [ ] AEM prioridades corretas.
- [ ] Customer List semanal.
- [ ] Enhanced Conversions ativo.
- [ ] GA4 + Google Ads import.
- [ ] GTM Server-Side (se conta grande).
- [ ] Test Events sem erros.

## Entrega
Se pedirem código, **entregar pronto pra colar** (snippets Pixel HTML, CAPI PHP, Next.js API route, hooks WooCommerce).
