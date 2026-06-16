const puppeteer = require('puppeteer');

const cards = [
  {
    num: "01",
    title: "SÍNDROME DO OPERADOR",
    subtitle: 'O "Consultor Disfarçado"',
    falha: "O conselheiro iniciante entra na reunião querendo resolver o problema com as próprias mãos. Ele pede planilhas, desenha processos e tenta gerenciar os diretores.",
    ponto: "Conselhos existem para governar, validar estratégia e mitigar riscos, não para executar. Fazer o trabalho da diretoria tira a autonomia dos executivos e destrói o papel de supervisão. O conselheiro direciona por meio de perguntas, não de ordens."
  },
  {
    num: "02",
    title: "NEGLIGÊNCIA ESTRUTURAL",
    subtitle: "Métricas de Vaidade vs. Governança de Valor",
    falha: "Focar a análise em relatórios superficiais de marketing, crescimento de seguidores ou faturamento bruto de curto prazo, sem cruzar com a saúde estrutural da operação.",
    ponto: "A análise precisa cruzar geração de caixa, margem de contribuição, LTV/CAC real, passivos ocultos e retenção de talentos-chave. Avaliar apenas o topo do funil sem olhar o fluxo de caixa é negligência estrutural."
  },
  {
    num: "03",
    title: "ANALFABETISMO DE CAPITAL",
    subtitle: "Mine na Vertical, Erre na Mesa",
    falha: "Acreditar que a experiência em sua área vertical (marketing, vendas ou produto) é suficiente para sentar à mesa de conselho.",
    ponto: "Um conselheiro ineficiente não entende o impacto de uma captação de recursos na diluição societária, na estrutura de dívida ou em cenários de M&A. Se você não sabe ler um balanço sob a ótica de geração de valor para o acionista, você vira um espectador de luxo na mesa."
  },
  {
    num: "04",
    title: "POSTURA DE BOARD",
    subtitle: "Silêncio Político ou Confronto Excessivo",
    falha: "Oscilar entre dois extremos: concordar passivamente com o CEO para evitar atritos ou adotar uma postura inquisitória que trava as decisões da empresa.",
    ponto: "A eficácia de um conselheiro é medida pela capacidade de exercer o confronto construtivo. A arrogância técnica sem inteligência política isola o profissional no colegiado. O board não é arena, é câmara deliberativa."
  },
  {
    num: "05",
    title: "CEGUEIRA DE RISCO",
    subtitle: "Foco Apenas no Upside",
    falha: "Validar estratégias de crescimento acelerado sem exigir o mapeamento dos riscos operacionais, jurídicos e de mercado associados.",
    ponto: "O conselheiro responde pela sustentabilidade do negócio a longo prazo. Aprovar planos de expansão sem avaliar riscos de LGPD, quebras de governança, blindagem patrimonial e contingências trabalhistas é um erro que custa cadeiras e reputações."
  }
];

function makeCardHTML(card) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px;
    height: 1080px;
    background: #06091280;
    font-family: 'Arial Black', Arial, sans-serif;
    overflow: hidden;
    position: relative;
  }
  .bg {
    position: absolute; inset: 0;
    background: linear-gradient(135deg, #060912 0%, #0a1020 40%, #060912 100%);
  }
  .bg-accent {
    position: absolute;
    top: -200px; right: -200px;
    width: 600px; height: 600px;
    background: radial-gradient(circle, rgba(232,184,75,0.06) 0%, transparent 70%);
    border-radius: 50%;
  }
  .bg-accent2 {
    position: absolute;
    bottom: -150px; left: -150px;
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(232,184,75,0.04) 0%, transparent 70%);
    border-radius: 50%;
  }
  .wrap {
    position: relative;
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    padding: 44px 60px 40px;
  }
  .header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 6px;
  }
  .brand {
    font-family: Arial, sans-serif;
    font-size: 11px; letter-spacing: 4px; color: #5a7090;
    font-weight: 700; text-transform: uppercase;
  }
  .brand em { color: #e8b84b; font-style: normal; }
  .sep {
    height: 1px;
    background: linear-gradient(90deg, #e8b84b30, #e8b84b60, #e8b84b30);
    margin-bottom: 44px;
  }
  .num-area {
    display: flex; align-items: flex-end; gap: 28px;
    margin-bottom: 20px;
  }
  .big-num {
    font-size: 110px; font-weight: 900; line-height: 1;
    color: transparent;
    background: linear-gradient(180deg, #e8b84b 0%, #c49030 100%);
    -webkit-background-clip: text; background-clip: text;
    letter-spacing: -6px; min-width: 130px;
  }
  .title-col { padding-bottom: 10px; }
  .card-title {
    font-size: 38px; font-weight: 900; color: #ffffff;
    letter-spacing: -0.5px; line-height: 1.05; text-transform: uppercase;
    font-family: 'Arial Black', Arial, sans-serif;
  }
  .card-sub {
    font-size: 14px; color: #e8b84b; font-weight: 600;
    letter-spacing: 1.5px; margin-top: 10px;
    font-family: Arial, sans-serif;
    text-transform: uppercase;
  }
  .divider {
    width: 52px; height: 3px; background: #e8b84b;
    border-radius: 2px; margin-bottom: 32px;
  }
  .blocks { flex: 1; display: flex; flex-direction: column; gap: 18px; justify-content: flex-start; }
  .block {
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    padding: 26px 30px;
    position: relative;
    overflow: hidden;
  }
  .block::before {
    content: '';
    position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  }
  .block-falha::before { background: linear-gradient(180deg, #e05c5c, #b03030); }
  .block-ponto::before { background: linear-gradient(180deg, #e8b84b, #c49030); }
  .label {
    font-size: 10px; letter-spacing: 4px; font-weight: 700;
    text-transform: uppercase; margin-bottom: 12px;
    font-family: Arial, sans-serif;
  }
  .label-f { color: #e06060; }
  .label-p { color: #e8b84b; }
  .text {
    font-size: 18.5px; color: #c8d8e8; line-height: 1.65;
    font-weight: 400; font-family: Arial, sans-serif;
  }
  .footer {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 24px;
  }
  .dots { display: flex; gap: 7px; }
  .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: rgba(255,255,255,0.12);
  }
  .dot.on { background: #e8b84b; }
  .ftag {
    font-size: 11px; letter-spacing: 3px; color: #3a5070;
    font-family: Arial, sans-serif; text-transform: uppercase;
  }
</style>
</head>
<body>
<div class="bg"></div>
<div class="bg-accent"></div>
<div class="bg-accent2"></div>
<div class="wrap">
  <div class="header">
    <div class="brand">Advisory Report <em>//</em> Os 5 Pontos Cegos</div>
    <div class="brand"><em>${card.num}</em> / 05</div>
  </div>
  <div class="sep"></div>
  <div class="num-area">
    <div class="big-num">${card.num}</div>
    <div class="title-col">
      <div class="card-title">${card.title}</div>
      <div class="card-sub">${card.subtitle}</div>
    </div>
  </div>
  <div class="divider"></div>
  <div class="blocks">
    <div class="block block-falha">
      <div class="label label-f">A Falha</div>
      <div class="text">${card.falha}</div>
    </div>
    <div class="block block-ponto">
      <div class="label label-p">O Ponto Cego</div>
      <div class="text">${card.ponto}</div>
    </div>
  </div>
  <div class="footer">
    <div class="dots">
      ${[1,2,3,4,5].map(i=>`<div class="dot${i===parseInt(card.num)?' on':''}"></div>`).join('')}
    </div>
    <div class="ftag">Conselheiros de Elite</div>
  </div>
</div>
</body>
</html>`;
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: true
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });

  for (const card of cards) {
    await page.setContent(makeCardHTML(card), { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 300));
    const file = `/tmp/cards-board/card_${card.num}.png`;
    await page.screenshot({ path: file });
    console.log(`OK: ${file}`);
  }

  await browser.close();
  console.log('done');
})();
