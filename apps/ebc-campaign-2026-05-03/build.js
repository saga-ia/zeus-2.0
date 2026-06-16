#!/usr/bin/env node
// Build EBC Lead campaign on YF-02-Agency-Brazil, all PAUSED.
const fs = require('fs');
const { execSync } = require('child_process');
const https = require('https');

const ACT = '1289500712654032';
const PAGE = '513212888551965';
const API = 'https://graph.facebook.com/v19.0';
const TOKEN = execSync(`sqlite3 /opt/jeff-worker/data/worker.db "SELECT value FROM app_settings WHERE key='jeff_meta_user_token';"`).toString().trim();
const SYS = execSync(`sqlite3 /opt/jeff-worker/data/worker.db "SELECT value FROM app_settings WHERE key='jeff_meta_system_token';"`).toString().trim();

if (!TOKEN) { console.error('No token'); process.exit(2); }

const hashes = JSON.parse(fs.readFileSync('/opt/jeff-apps/ebc-campaign-2026-05-03/image-hashes.json', 'utf8'));

// 14 copies focused on forex trading with EBC. Curtas, varied hooks.
const COPIES = [
  { primary: "Voce ja perdeu dinheiro em corretora que somem com seu saque? A EBC Financial Group e regulada na FCA UK, mais de 25 anos no mercado global. Forex, indices, commodities, ouro. Spread baixo, execucao rapida. Abre conta gratis em 3 minutos.", headline: "Forex com corretora regulada FCA UK", description: "EBC Financial Group" },
  { primary: "Trader que opera ouro, indices e moedas: a EBC oferece spread de mercado, plataforma MT5 e atendimento em portugues. Sediada em Londres, regulada FCA. Saques rapidos.", headline: "MT5 com spread de mercado", description: "Conta a partir de USD 100" },
  { primary: "Voce sabia que a maioria dos traders perde por escolher corretora errada? EBC Financial Group: regulada FCA UK, premiada globalmente, suporte em portugues. Comece com simulador antes de operar real.", headline: "Comece pela conta demo", description: "Sem risco, sem cartao" },
  { primary: "Forex no Brasil esta cheio de corretora duvidosa. EBC e diferente: licenca FCA UK, conta segregada, auditoria internacional. Pra quem leva trading a serio.", headline: "EBC: regulacao FCA UK", description: "Forex serio, sem enrolacao" },
  { primary: "Quer operar ouro, dolar e indices americanos? Plataforma MT5 da EBC tem execucao em milisegundos, spread baixo e voce abre conta sem mandar mil documentos.", headline: "MT5 + spread baixo + execucao rapida", description: "Forex profissional" },
  { primary: "Cansado de slippage e corretora travando no momento da operacao? EBC Financial Group opera com servidores de baixa latencia, FCA regulada. Teste a plataforma sem custo.", headline: "Sem slippage, sem trava", description: "Servidores de baixa latencia" },
  { primary: "Trader iniciante: comece certo. EBC oferece curso gratuito de fundamentos, simulador real, e atendimento em portugues. Plataforma MT5 com tutorial pra primeiros passos.", headline: "Aprenda forex do zero", description: "Material gratuito + demo" },
  { primary: "Trader experiente: spread de mercado, comissao competitiva, MT5 com expert advisors permitidos. EBC FCA regulada, 25 anos no mercado, atendimento institucional.", headline: "EAs liberados, comissao baixa", description: "Pra trader que ja sabe" },
  { primary: "Por que mover sua conta pra EBC? Regulacao FCA UK, conta segregada, saques em ate 24h, suporte em portugues, MT5 com indicadores premium. Mais de 100 paises atendidos.", headline: "Migre sua conta com seguranca", description: "FCA + segregacao + 24h saque" },
  { primary: "Forex e oportunidade real, mas exige corretora seria. EBC Financial Group e regulada FCA UK desde 2003. Plataforma MT5 estavel, spread justo. Cadastro em 3 minutos.", headline: "Forex serio com EBC", description: "FCA UK desde 2003" },
  { primary: "Voce pode operar ouro, prata, petroleo e mais de 100 ativos pela EBC. Plataforma MT5, spread de mercado, alavancagem ajustavel. Conta a partir de USD 100.", headline: "100+ ativos numa unica plataforma", description: "MT5 + USD 100 minimo" },
  { primary: "Estrategia de scalping e day trade exige execucao rapida. EBC tem latencia abaixo de 50ms nos principais centros. MT5 com VPS opcional pra automacao 24/7.", headline: "Scalping e day trade sem trava", description: "Latencia <50ms + VPS opcional" },
  { primary: "Antes de depositar em qualquer corretora, confira a regulacao. EBC Financial Group e licenciada FCA (UK), CIMA (Cayman), ASIC (Australia). Tres reguladores top, conta segregada em banco tier 1.", headline: "Tres reguladores tier 1", description: "FCA + CIMA + ASIC" },
  { primary: "Forex nao e jogo. EBC oferece educacao gratuita, conta demo ilimitada e plataforma MT5 profissional. Comece estudando, depois opera com confianca.", headline: "Educacao + demo + MT5 pro", description: "Estude antes, opera depois" }
];

if (COPIES.length !== 14) { console.error('Need 14 copies'); process.exit(2); }

function postGraph(path, body, useToken = TOKEN) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ ...body, access_token: useToken });
    const data = params.toString();
    const url = new URL(`${API}/${path}`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(chunks);
          if (j.error) {
            // try fallback
            if (useToken === TOKEN && SYS) {
              postGraph(path, body, SYS).then(resolve, reject);
            } else {
              reject(new Error(JSON.stringify(j.error)));
            }
          } else resolve(j);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

async function main() {
  const out = { created_at: new Date().toISOString(), account_id: ACT };

  // 1) Lead Form on the page
  console.log('Creating lead form...');
  const formQs = [
    { type: 'FULL_NAME' },
    { type: 'PHONE' },
    { type: 'EMAIL' },
    { type: 'CUSTOM', label: 'Qual seu volume mensal de trade hoje?', key: 'volume_mensal_trade', options: [
        { value: 'Ate USD 1.000', key: 'a' },
        { value: 'USD 1.001 a 10.000', key: 'b' },
        { value: 'USD 10.001 a 50.000', key: 'c' },
        { value: 'Acima de USD 50.000', key: 'd' },
        { value: 'Ainda nao opero', key: 'e' }
    ] }
  ];
  let form;
  try {
    form = await postGraph(`${PAGE}/leadgen_forms`, {
      name: 'EBC-Forex-Leads-2026-05-03',
      privacy_policy: JSON.stringify({ url: 'https://storage.googleapis.com/ebc-files/ebcfin.co.uk/2024/EBC%20Financial%20Group%20(UK)%20Ltd%20Privacy%20Policy.pdf', link_text: 'Politica de Privacidade EBC' }),
      questions: JSON.stringify(formQs),
      follow_up_action_url: 'https://www.ebc.com/pt/about-us/',
      locale: 'pt_BR',
      context_card: JSON.stringify({ title: 'Abra sua conta na EBC Financial Group', content: ['Corretora regulada FCA UK', 'Plataforma MT5 com spread de mercado', 'Suporte em portugues, saque em 24h'], button_text: 'Quero abrir conta', style: 'PARAGRAPH_STYLE' }),
      thank_you_page: JSON.stringify({ title: 'Recebemos seu cadastro', body: 'Em breve nosso time entra em contato.', button_text: 'Visitar site', button_type: 'VIEW_WEBSITE', website_url: 'https://www.ebc.com/pt/about-us/' })
    });
    out.lead_form_id = form.id;
    console.log('Form OK:', form.id);
  } catch (e) {
    console.error('Lead form failed:', e.message);
    out.lead_form_error = e.message;
    fs.writeFileSync('/opt/jeff-apps/ebc-campaign-2026-05-03/build-result.json', JSON.stringify(out, null, 2));
    process.exit(3);
  }

  // 2) Campaign — OUTCOME_LEADS, CBO daily 50 (2 adsets * 25)
  console.log('Creating campaign...');
  const camp = await postGraph(`act_${ACT}/campaigns`, {
    name: 'EBC-Leads-2026-05-03-CBO',
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED',
    special_ad_categories: JSON.stringify([]),
    buying_type: 'AUCTION',
    daily_budget: '5000', // R$ 50 / dia, dividido pelo CBO
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
  });
  out.campaign_id = camp.id;
  console.log('Campaign OK:', camp.id);

  // 3) Two adsets — Advantage+ targeting (Brazil, 25-65)
  const adsets = [];
  const targeting = {
    geo_locations: { countries: ['BR'] },
    age_min: 25,
    age_max: 65,
    targeting_automation: { advantage_audience: 1 }
  };
  for (let i = 1; i <= 2; i++) {
    console.log(`Creating adset ${i}...`);
    const as = await postGraph(`act_${ACT}/adsets`, {
      name: `EBC-Leads-AdvantagePlus-${i}`,
      campaign_id: camp.id,
      status: 'PAUSED',
      destination_type: 'ON_AD',
      optimization_goal: 'LEAD_GENERATION',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      promoted_object: JSON.stringify({ page_id: PAGE }),
      targeting: JSON.stringify(targeting),
      start_time: new Date(Date.now() + 60_000).toISOString()
    });
    adsets.push(as.id);
    console.log(`Adset ${i} OK:`, as.id);
  }
  out.adset_ids = adsets;

  // 4) 14 creatives + 28 ads (one creative per copy/image, two ads per creative — one per adset)
  out.ads = [];
  for (let i = 0; i < 14; i++) {
    const c = COPIES[i];
    const h = hashes[i].hash;
    console.log(`Creating creative ${i+1}/14...`);
    const creative = await postGraph(`act_${ACT}/adcreatives`, {
      name: `EBC-Leads-Creative-${String(i+1).padStart(2,'0')}`,
      object_story_spec: JSON.stringify({
        page_id: PAGE,
        link_data: {
          message: c.primary,
          link: `https://fb.me/form/${out.lead_form_id || '0'}`,
          name: c.headline,
          description: c.description,
          image_hash: h,
          call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: out.lead_form_id } }
        }
      }),
      degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_IN' } } })
    });
    console.log(`Creative ${i+1} OK:`, creative.id);

    for (let aidx = 0; aidx < adsets.length; aidx++) {
      const ad = await postGraph(`act_${ACT}/ads`, {
        name: `EBC-Lead-AS${aidx+1}-Ad${String(i+1).padStart(2,'0')}`,
        adset_id: adsets[aidx],
        creative: JSON.stringify({ creative_id: creative.id }),
        status: 'PAUSED'
      });
      out.ads.push({ adset: aidx+1, idx: i+1, ad_id: ad.id, creative_id: creative.id });
      console.log(`  Ad ${aidx+1}-${i+1} OK:`, ad.id);
    }
  }

  fs.writeFileSync('/opt/jeff-apps/ebc-campaign-2026-05-03/build-result.json', JSON.stringify(out, null, 2));
  console.log('\nDONE. Result saved.');
  console.log('Campaign:', out.campaign_id);
  console.log(`Manage: https://business.facebook.com/adsmanager/manage/campaigns?act=${ACT}&selected_campaign_ids=${out.campaign_id}`);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
