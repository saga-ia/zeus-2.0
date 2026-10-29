# GTM, Pixel e Rastreamento — Referência Técnica

## Princípio
Tracking ruim faz o algoritmo aprender errado. Algoritmo aprendendo errado é sentença de morte de qualquer campanha.

## 3 pilares do tracking moderno
1. **Client-side (browser)** — Pixel Meta, gtag.js Google, GTM no navegador
2. **Server-side** — CAPI Meta, GTM Server, Enhanced Conversions
3. **First-party data** — Customer Match, listas CRM, hashes SHA-256

## EMQ Score (Event Match Quality)
Nota 1-10 da qualidade dos eventos enviados. >7 bom, >8 excelente. Sinais que aumentam:
- Email (SHA-256, lowercased, trimmed)
- Telefone com DDI (SHA-256, só números)
- Nome + sobrenome (hash)
- FBP + FBC do cookie
- IP + User Agent (server-side)
- Nascimento, cidade, estado, CEP (hashes)

## GTM — instalação
Snippet no `<head>`:
```html
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXX');</script>
```
+ `<noscript>` logo após `<body>`.

## dataLayer — padrão de compra
```javascript
dataLayer.push({
  event: 'purchase',
  ecommerce: {
    transaction_id: 'T_12345',
    value: 199.90,
    currency: 'BRL',
    items: [{ item_id: 'SKU_123', item_name: 'Tênis X', price: 199.90, quantity: 1 }]
  },
  user_data: {
    email_hash: 'sha256_email',
    phone_hash: 'sha256_phone'
  }
});
```

## Pixel base via GTM (tag Custom HTML)
```html
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','SEU_PIXEL_ID');
fbq('track','PageView');
</script>
```

## Purchase deduplicado (Pixel + CAPI)
```javascript
var eventID = '{{DLV - transaction_id}}_' + Date.now();
fbq('track','Purchase',{
  value:{{DLV - value}}, currency:'{{DLV - currency}}',
  content_ids:[{{DLV - item_id}}], content_type:'product'
},{eventID: eventID});
fetch('/api/capi/purchase',{
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({eventID, ...purchaseData})
});
```

## CAPI server-side PHP (WordPress)
```php
function send_capi_purchase($data) {
  $pixel_id='SEU_PIXEL_ID';
  $token='SEU_ACCESS_TOKEN';
  $url='https://graph.facebook.com/v18.0/'.$pixel_id.'/events?access_token='.$token;
  $payload=['data'=>[[
    'event_name'=>'Purchase',
    'event_time'=>time(),
    'event_id'=>$data['event_id'],
    'event_source_url'=>$data['url'],
    'action_source'=>'website',
    'user_data'=>[
      'em'=>[hash('sha256',strtolower(trim($data['email'])))],
      'ph'=>[hash('sha256',preg_replace('/[^0-9]/','',$data['phone']))],
      'fbp'=>$data['fbp'], 'fbc'=>$data['fbc'],
      'client_ip_address'=>$_SERVER['REMOTE_ADDR'],
      'client_user_agent'=>$_SERVER['HTTP_USER_AGENT']
    ],
    'custom_data'=>['currency'=>$data['currency'],'value'=>$data['value']]
  ]]];
  $ch=curl_init($url);
  curl_setopt($ch,CURLOPT_POST,1);
  curl_setopt($ch,CURLOPT_HTTPHEADER,['Content-Type: application/json']);
  curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($payload));
  curl_setopt($ch,CURLOPT_RETURNTRANSFER,true);
  $r=curl_exec($ch);
  curl_close($ch);
  return $r;
}
```

## Hook WooCommerce automático
```php
add_action('woocommerce_thankyou','fire_capi_on_purchase',10,1);
function fire_capi_on_purchase($order_id) {
  $order=wc_get_order($order_id);
  send_capi_purchase([
    'event_id'=>'purchase_'.$order_id,
    'url'=>$order->get_checkout_order_received_url(),
    'email'=>$order->get_billing_email(),
    'phone'=>$order->get_billing_phone(),
    'value'=>$order->get_total(),
    'currency'=>$order->get_currency(),
    'fbp'=>$_COOKIE['_fbp']??'',
    'fbc'=>$_COOKIE['_fbc']??''
  ]);
}
```

## WordPress — plugins recomendados
- **PixelYourSite Pro** — solução completa (Pixel + CAPI + Google + TikTok + Pinterest)
- **GTM4WP** — integra GTM + dataLayer WooCommerce automático
- **Site Kit by Google** — Analytics + Ads + Search Console
- **WP Conversion Tracking by Stape** — híbrido browser + server

Setup pro: GTM4WP + GTM Server Container em Stape (~US$ 20/mês).

## Vibe code (Next.js / React / Vue) — server-side CAPI
```javascript
// /api/capi.ts
export default async function handler(req,res) {
  const data=req.body;
  const crypto=require('crypto');
  const hash=s=>crypto.createHash('sha256').update(s.toLowerCase().trim()).digest('hex');
  const payload={data:[{
    event_name:'Purchase',
    event_time:Math.floor(Date.now()/1000),
    event_id:data.eventId,
    action_source:'website',
    user_data:{
      em:[hash(data.email)],
      ph:[hash(data.phone.replace(/\D/g,''))],
      fbp:data.fbp, fbc:data.fbc,
      client_ip_address:req.headers['x-forwarded-for'],
      client_user_agent:req.headers['user-agent']
    },
    custom_data:{value:data.value,currency:'BRL'}
  }]};
  const url=`https://graph.facebook.com/v18.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`;
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  res.status(200).json(await r.json());
}
```

## Plataformas brasileiras
- **Cartpanda** — Configurações > Integrações > Meta Pixel com Access Token (CAPI nativa)
- **Hotmart** — Produtor > Integrações > Pixels + postback nativo
- **Kiwify** — painel "Pixels" com Pixel + CAPI + GA4 + Google Ads
- **Eduzz/Monetizze/Greenn/PerfectPay** — campo de Pixel + postback HTTPS para backend que envia CAPI

## Google Ads — Enhanced Conversions
1. Goals > Conversions > Settings > Enhanced Conversions
2. Modo: via Google tag / via GTM / via API
3. Em GTM: edite a tag de Conversion + ative "Include user-provided data"
4. Mapeie: email_address, phone_number, first_name, last_name, address
5. Match Rate >60% (verificar em Diagnostics)

## Eventos GA4 importantes
page_view, view_item, view_item_list, add_to_cart, remove_from_cart, begin_checkout, add_payment_info, add_shipping_info, purchase, generate_lead, sign_up.

## Aggregated Event Measurement (AEM) — Meta pós-iOS 14
8 eventos por domínio. Prioridade:
1. Purchase / Lead (a principal)
2. InitiateCheckout / AddPaymentInfo
3. AddToCart
4. ViewContent
5-8: customizados, micro-conversões

Erro grave: tudo com mesma prioridade.

## Consent Mode v2 (LGPD)
- Plugin/banner: Cookiebot, CookieYes, Iubenda, Termly
- GTM recebe sinais de consentimento
- Tags só disparam após consent (analytics_storage, ad_storage)
- Eventos básicos podem rodar "consent denied" como ping anônimo

## Ferramentas de debug
- Meta Pixel Helper (extensão Chrome)
- Tag Assistant Companion (Google)
- GTM Preview Mode
- Events Manager > Test Events
- DataLayer Inspector+ (Chrome)

## Bugs mais comuns
1. Eventos duplicados → ative deduplicação via event_id
2. EMQ baixo → revise hashes (SHA-256, lowercased, trimmed)
3. Eventos não chegando → CORS, firewall, plugin de segurança
4. Tag GTM não disparando → trigger/variável no Preview
5. Conversão Google reportando zero → Enhanced Conversions desativado
6. "Attribution unknown" na Meta → melhorar EMQ e CAPI

## Checklist de saúde
- Pixel disparando em todas as páginas principais
- Eventos com event_id
- CAPI ativo com EMQ 7+
- Deduplicação OK (matched browser + server)
- Domínio verificado
- AEM configurado com prioridades
- Customer List sincronizada (semanal)
- Enhanced Conversions ativo
- GA4 + GTM Server-Side rodando
- Test Events sem erros
