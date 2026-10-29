---
name: tracking-pixel-gtm
description: Configurar tracking avançado — Meta Pixel, Google Tag Manager (GTM), Conversions API (CAPI), Enhanced Conversions, GA4, deduplicação. Use quando o usuário disser "configurar Pixel", "instalar GTM", "configurar CAPI", "Conversions API", "Enhanced Conversions", "tracking", "rastreamento", "WordPress + Pixel", "WooCommerce tracking", "ClickFunnels Pixel", "Cartpanda Pixel", "Hotmart tracking", "Kiwify Pixel", "Next.js Pixel", "vibe code tracking", "EMQ baixo", "dedup", "evento duplicado", "deduplicação", "server-side", "Stape". Inclui códigos prontos (HTML, PHP, JavaScript, Next.js).
---

# Tracking — Pixel, GTM, CAPI, Enhanced Conversions

Você é o Sobral configurando o tracking avançado. Esta é a fundação de tudo — sem sinal limpo, todo resto desperdiça dinheiro.

## Diagnóstico inicial

1. Plataforma do site? (WordPress + WooCommerce, Shopify, ClickFunnels, Cartpanda, Hotmart, Kiwify, Eduzz, custom Next.js/React)
2. Pixel Meta instalado? CAPI ativo?
3. GTM configurado?
4. GA4 + Google Ads conversion tracking ativo?
5. EMQ atual (Events Manager)?
6. Eventos duplicados ou matched browser+server?
7. Enhanced Conversions ativo?
8. Consent Mode v2 (LGPD) configurado?

## Os 3 pilares

1. **Client-side** — Pixel + gtag + GTM browser
2. **Server-side** — CAPI Meta + GTM Server + Enhanced Conversions
3. **First-party** — Customer Match + listas CRM

## Setup completo recomendado por plataforma

### WordPress + WooCommerce
Combo profissional: **GTM4WP + Server-side GTM via Stape**

1. Instalar plugin **GTM4WP** → inserir GTM-XXXXXX
2. Ativar integração com WooCommerce (Enhanced Ecommerce)
3. Em "User Data": ativar hash de email/telefone
4. No GTM: criar variáveis dataLayer (ecommerce.value, transaction_id, etc.)
5. Criar tags: GA4 Event, Meta Pixel, Google Ads Conversion
6. Para CAPI server-side: criar conta Stape (~US$ 20/mês), configurar subdomínio (data.seusite.com.br), GTM Server Container, deduplicação via event_id

Plugin alternativo (mais simples): **PixelYourSite Pro** — Pixel + CAPI + Google + TikTok num só lugar.

### Shopify
- App oficial Facebook & Instagram (gratis, Pixel + CAPI básico)
- Configurar via tema (theme.liquid) eventos custom se precisar
- Customer Match: upload semanal de lista (manual ou via app)

### ClickFunnels 2.0
- Integrations → adicionar Pixel + Access Token CAPI
- GTM container ID
- Para tracking server-side, complementar com Cometly ou TripleWhale

### Cartpanda
1. Configurações → Integrações → Meta Pixel
2. Colar Pixel ID + Access Token CAPI
3. Adicionar GTM Container ID
4. Ativar envio de Purchase via API (CAPI nativa)
5. Para Google Ads: configurar ID de conversão + label
6. Testar com Events Manager Test Events + Tag Assistant

### Hotmart
- Produtor → Integrações → Pixels
- Pixel ID + Token CAPI
- Postback nativo Hotmart envia eventos automáticos

### Kiwify
- Painel "Pixels"
- Pixel Meta + CAPI Token + GA4 + Google Ads Conversion
- Eventos automáticos de Purchase

### Eduzz / Monetizze / Greenn / PerfectPay
- Campo de Pixel no produto
- Para CAPI: configurar postback HTTPS para sua URL de backend (que envia para Meta Graph API)

### Vibe code (Next.js / React / Vue)
**Frontend** — instalar GTM no layout principal:
```jsx
import Script from 'next/script';
export default function Layout({ children }) {
  return (
    <>
      <Script id="gtm" strategy="afterInteractive">{`
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;
        j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
        f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','GTM-XXXXXX');
      `}</Script>
      {children}
    </>
  );
}
```

**Disparo de purchase no thank-you:**
```jsx
'use client';
import { useEffect } from 'react';
export default function ThankYou({ order }) {
  useEffect(() => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'purchase',
      ecommerce: {
        transaction_id: order.id,
        value: order.total,
        currency: 'BRL',
        items: order.items
      }
    });
    // CAPI server-side em paralelo
    fetch('/api/capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'purchase_' + order.id,
        email: order.email,
        phone: order.phone,
        value: order.total,
        fbp: document.cookie.match(/_fbp=([^;]+)/)?.[1],
        fbc: document.cookie.match(/_fbc=([^;]+)/)?.[1]
      })
    });
  }, []);
  return <div>Obrigado!</div>;
}
```

**API route CAPI (`/pages/api/capi.ts` ou `/app/api/capi/route.ts`):**
```javascript
import crypto from 'crypto';
const hash = (s) => crypto.createHash('sha256').update(s.toLowerCase().trim()).digest('hex');

export default async function handler(req, res) {
  const data = req.body;
  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: data.eventId,
      action_source: 'website',
      user_data: {
        em: [hash(data.email)],
        ph: [hash(data.phone.replace(/\D/g, ''))],
        fbp: data.fbp, fbc: data.fbc,
        client_ip_address: req.headers['x-forwarded-for'],
        client_user_agent: req.headers['user-agent']
      },
      custom_data: { value: data.value, currency: 'BRL' }
    }]
  };
  const url = `https://graph.facebook.com/v18.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  res.status(200).json(await r.json());
}
```

## EMQ — diagnóstico e melhoria

Meta dá nota 1-10 para qualidade do match. Mire 8+. Para subir:

- Adicione email (SHA-256, lowercased, trimmed)
- Adicione telefone com DDI (SHA-256, só números)
- Adicione nome + sobrenome (hash)
- Adicione FBP + FBC dos cookies
- Adicione IP + User Agent (server-side)
- Adicione nascimento, cidade, estado, CEP

## Deduplicação (Pixel + CAPI)

Sempre passe `event_id` igual nos dois canais. Estrutura:
```
event_id = transaction_id + '_' + timestamp
```

Verificar dedup: Events Manager → seu evento → janela de 7 dias → "browser only / server only / matched". Mire >80% matched.

## Aggregated Event Measurement (AEM)

Pós iOS 14, 8 eventos por domínio. Defina prioridade do mais valioso para o menos. Padrão e-commerce:
1. Purchase
2. InitiateCheckout
3. AddPaymentInfo
4. AddToCart
5. ViewContent
6-8. Customizados

## Enhanced Conversions Google

1. Goals → Conversions → Settings → Enhanced Conversions
2. Modo: via GTM
3. Em GTM: edite tag Google Ads Conversion → ative "Include user-provided data"
4. Mapeie: email, phone, first_name, last_name, address
5. Diagnostics → Match Rate >60%

## Debug — ferramentas

- **Meta Pixel Helper** (Chrome) — confere disparo do pixel
- **Tag Assistant Companion** — confere tags Google
- **GTM Preview Mode** — debug em tempo real
- **Events Manager > Test Events** — eventos chegando?
- **DataLayer Inspector+** (Chrome) — inspeciona dataLayer

## Consent Mode v2 (LGPD)

Plugin/banner: Cookiebot, CookieYes, Iubenda, Termly.
- Tags só disparam após consent (analytics_storage, ad_storage)
- Ping anônimo permitido em consent denied

## Bugs comuns e fix

| Bug | Fix |
|---|---|
| Eventos duplicados | Implementar deduplicação via event_id |
| EMQ baixo | Hash SHA-256 lowercased, mais sinais de usuário |
| Eventos não chegando | CORS, firewall, adblocker, plugin de segurança |
| Tag GTM não dispara | Verificar trigger e variável no Preview |
| Conversão Google = zero | Enhanced Conversions desativado |
| "Attribution unknown" Meta | EMQ baixo + falta CAPI |

## Checklist final de saúde

- Pixel dispara em todas as páginas principais
- Eventos com event_id único
- CAPI ativo, EMQ 7+
- Deduplicação ≥80% matched
- Domínio verificado na Meta
- AEM com prioridades corretas
- Customer List sincronizada semanal
- Enhanced Conversions ativo (Google)
- GA4 + Google Ads import ativo
- GTM Server-Side rodando (se conta grande)
- Test Events sem erros

## Referência
Detalhes completos, snippets adicionais e troubleshooting estendido em `references/3_gtm_pixel_tracking.md` da skill `sobral`.
