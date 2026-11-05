#!/usr/bin/env node
// Teste de minisite do Eduardo (links ou diagnóstico) num Chromium de celular (390x844). Só leitura.
// Links: confere cada botão (href vazio, "XXXX" de exemplo, wa.me sem número), alvo de toque >= 44 px, rolagem lateral.
// Diagnóstico: percorre o funil como visitante (capa → perguntas → contato → resultado), tira print de CADA tela,
//   confere rolagem lateral, texto < 14 px, botão final com wa.me e as respostas na mensagem, e sobra de "✎"/"XXXX".
// Uso: node minisite-check.js <index.html | URL> [pasta_prints=/tmp/minisite-check]
// Saída: OK/REPROVADO + motivos; prints tela-01.png... pra abrir com Read.
const puppeteer = require('/opt/jeff-worker/node_modules/puppeteer');
const path = require('path'), fs = require('fs');
const alvo = process.argv[2], dir = process.argv[3] || '/tmp/minisite-check';
if (!alvo) { console.error('uso: minisite-check.js <index.html|URL> [pasta]'); process.exit(2); }
fs.mkdirSync(dir, { recursive: true });
const url = /^https?:/.test(alvo) ? alvo : 'file://' + path.resolve(alvo);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const erros = [], avisos = []; let n = 0;
  p.on('pageerror', e => erros.push('erro de JavaScript: ' + e.message.slice(0, 120)));
  await p.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });
  await p.evaluate(() => document.fonts.ready);
  const tela = async (nome) => {
    n++; const f = `${dir}/tela-${String(n).padStart(2, '0')}-${nome}.png`; await p.screenshot({ path: f, fullPage: true });
    const r = await p.evaluate(() => {
      const o = { lateral: document.documentElement.scrollWidth > innerWidth + 1, pequeno: [], sobra: [] };
      for (const el of document.querySelectorAll('body *')) {
        if (!el.offsetParent || ![...el.childNodes].some(x => x.nodeType === 3 && x.textContent.trim())) continue;
        if (parseFloat(getComputedStyle(el).fontSize) < 14) o.pequeno.push(el.innerText.trim().slice(0, 30));
      }
      const t = document.body.innerText; if (/✎|XXXX|lorem/i.test(t)) o.sobra.push((t.match(/.{0,20}(✎|XXXX|lorem).{0,20}/i) || [''])[0]);
      return o;
    });
    if (r.lateral) erros.push(`${nome}: rolagem lateral no celular`);
    if (r.pequeno.length) avisos.push(`${nome}: texto menor que 14 px: ${[...new Set(r.pequeno)].slice(0, 3).join(' | ')}`);
    if (r.sobra.length) erros.push(`${nome}: texto de exemplo esquecido: ${r.sobra[0]}`);
    return f;
  };
  const diag = await p.$('#config');
  if (!diag) {
    await tela('links');
    const links = await p.evaluate(() => [...document.querySelectorAll('a')].map(a => ({ t: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 40), h: a.getAttribute('href') || '', alt: a.getBoundingClientRect().height, larg: a.getBoundingClientRect().width })));
    for (const l of links) {
      if (!l.h || l.h === '#') erros.push(`link sem destino: "${l.t}"`);
      if (/XXXX/.test(l.h)) erros.push(`link com número/endereço de exemplo: "${l.t}" → ${l.h.slice(0, 50)}`);
      if (/wa\.me\/?(\?|$)/.test(l.h)) erros.push(`WhatsApp sem número: "${l.t}"`);
      if (l.alt < 44 || l.larg < 44) avisos.push(`alvo de toque pequeno (${Math.round(l.larg)}x${Math.round(l.alt)}): "${l.t}"`);
    }
    console.log(`${links.length} links conferidos`);
  } else {
    const C = await p.evaluate(() => JSON.parse(document.getElementById('config').textContent));
    await tela('capa');
    await p.click('#ir'); await new Promise(r => setTimeout(r, 400));
    for (const [k, q] of C.perguntas.entries()) {
      if (q.tipo === 'texto') { await p.type('#txt', 'Encontro de empresários em São Paulo'); await tela(`pergunta${k + 1}`); await p.click('#seg'); }
      else { await tela(`pergunta${k + 1}`); const ops = await p.$$('.opcao'); await ops[ops.length - 1].click(); }
      await new Promise(r => setTimeout(r, 450));
    }
    await p.click('#seg'); await new Promise(r => setTimeout(r, 200));
    const msg = await p.$eval('#erro', e => e.textContent).catch(() => '');
    if (!msg) erros.push('contato: deixou avançar sem nome e WhatsApp');
    await p.type('#nome', 'Maria Teste'); await p.type('#whats', '11912345678'); await tela('contato');
    await p.click('#seg'); await new Promise(r => setTimeout(r, 500));
    await tela('resultado');
    const cta = await p.$eval('#cta', a => a.href).catch(() => '');
    if (!/^https:\/\/wa\.me\/\d{12,13}\?text=/.test(cta)) erros.push('resultado: botão final sem wa.me com número válido: ' + (cta.slice(0, 60) || 'sem botão'));
    else { const t = decodeURIComponent(cta.split('text=')[1]); if (!/Maria Teste/.test(t) || !/Resultado:/.test(t)) erros.push('resultado: mensagem do WhatsApp sem nome/resultado'); else console.log('mensagem do WhatsApp:\n  ' + t.split('\n').join('\n  ')); }
    if (C.webhook && !/^https:\/\//.test(C.webhook)) erros.push('webhook precisa ser https');
  }
  await b.close();
  console.log((erros.length ? 'REPROVADO' : 'OK') + ` · ${n} tela(s) em ${dir}` + (erros.length ? '\n  - ' + erros.join('\n  - ') : '') + (avisos.length ? '\n  atenção: ' + avisos.join('\n  atenção: ') : ''));
  process.exit(erros.length ? 1 : 0);
})().catch(e => { console.error('falhou:', e.message); process.exit(2); });
