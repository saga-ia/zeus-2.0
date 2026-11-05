#!/usr/bin/env node
// Olho do Zeus pra sites: abre a página num Chromium real, tira print (desktop + celular)
// e aponta os sinais de "cara de IA" e defeitos técnicos. Só leitura.
//
// Uso: node scripts/site-check.js <url | caminho/index.html> [pasta_saida] [--og /opt/jeff-sites/<slug>/og.png]
//   --og: salva a primeira dobra em 1200x630 pra usar como og:image (sem foto, sem ferramenta extra)
// Saída: <pasta>/desktop.png, desktop-full.png, mobile.png, mobile-full.png, report.json
//        + resumo no stdout (bloqueantes / avisos / ok).
// Depois: abrir os PNGs com Read e OLHAR antes de entregar.

const fs = require('fs');
const path = require('path');
const puppeteer = require('/opt/jeff-worker/node_modules/puppeteer');

const argv = process.argv.slice(2);
const ogIdx = argv.indexOf('--og'); const ogOut = ogIdx >= 0 ? argv.splice(ogIdx, 2)[1] : null;
const target = argv[0];
if (!target) { console.error('uso: site-check.js <url|arquivo.html> [pasta_saida]'); process.exit(1); }
const url = /^https?:\/\//.test(target) ? target : 'file://' + path.resolve(target);
const slug = url.replace(/^\w+:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
const out = argv[1] || `/tmp/site-check/${slug}`;
fs.mkdirSync(out, { recursive: true });

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

// Roda dentro da página. Devolve achados brutos.
function inspect(vw) {
  const vis = el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0 && r.width > 0 && r.height > 0; };
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundImage && s.backgroundImage !== 'none') return null; const c = parse(s.backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const hue = ({ r, g, b }) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return { h: 0, s: 0 }; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; const l = (mx + mn) / 2; return { h, s: d / (1 - Math.abs(2 * l - 1)) }; };
  const short = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 60);
  const txt = el => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 70);

  const all = [...document.querySelectorAll('body *')].filter(vis);
  const textEls = all.filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1));
  const R = { vw };

  // Tipografia
  const fam = el => el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null;
  R.fonts = { body: fam(document.body), h1: fam(document.querySelector('h1')), h2: fam(document.querySelector('h2')), botao: fam(document.querySelector('button, .btn, a[class*=btn], a[class*=button]')) };
  R.familias_usadas = [...new Set(textEls.map(el => fam(el)))].slice(0, 8);
  R.fontes_web = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
  const sistema = /^(serif|sans-serif|monospace|system-ui|-apple-system|blinkmacsystemfont|arial|helvetica|georgia|times new roman|verdana|segoe ui)$/i;
  R.fontes_nao_carregadas = R.familias_usadas.filter(f => f && !sistema.test(f) && !R.fontes_web.some(w => w.toLowerCase() === f.toLowerCase())).slice(0, 4);
  R.h1_count = document.querySelectorAll('h1').length;
  const h1 = document.querySelector('h1');
  R.h1_px = h1 ? parseFloat(getComputedStyle(h1).fontSize) : null;
  R.h1_linhas = h1 ? Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight || getComputedStyle(h1).fontSize * 1.2)) : null;

  // Texto visível
  const body = document.body.innerText || '';
  R.travessoes = (body.match(/[—–]/g) || []).length;
  R.travessao_exemplos = (body.match(/.{0,30}[—–].{0,30}/g) || []).slice(0, 3);
  const banned = ['lorem ipsum', 'john doe', 'jane doe', 'acme', 'seamless', 'elevate', 'unleash', 'next-gen', 'incrível', 'revolucionári', 'alavancar', 'potencializ', 'transformador', 'disruptiv', 'game-changer', 'sua jornada', 'eleve seu', 'eleve sua', 'de outro nível', 'próximo nível'];
  R.palavras_proibidas = banned.filter(w => body.toLowerCase().includes(w));
  R.placeholders = (body.match(/\[[^\]]{2,40}\]|\{\{[^}]+\}\}|XXX+|TODO:|FIXME/g) || []).slice(0, 5);
  R.setas_em_botao = [...document.querySelectorAll('a, button')].filter(el => vis(el) && /[→➜➔›»]\s*$/.test(el.innerText.trim())).length;
  R.ponto_medio = (body.match(/ · /g) || []).length;

  // Eyebrows: texto pequeno em caixa alta com tracking acima de título
  const eyebrows = textEls.filter(el => { const s = getComputedStyle(el); const fs = parseFloat(s.fontSize); const ls = parseFloat(s.letterSpacing) || 0; return (s.textTransform === 'uppercase' || (el.innerText === el.innerText.toUpperCase() && /[A-Z]{3}/.test(el.innerText))) && fs <= 15 && ls / fs >= 0.05 && el.innerText.trim().length < 40; });
  R.eyebrows = eyebrows.length; R.eyebrow_exemplos = eyebrows.slice(0, 4).map(txt);
  R.secoes = Math.max(document.querySelectorAll('section').length, document.querySelectorAll('h2').length);
  R.numeracao_secao = textEls.filter(el => /^(0\d|\d{2,3})(\s*[\/·.\-]|$)/.test(el.innerText.trim()) && el.innerText.trim().length < 25).length;

  R.titulo_apertado = [...document.querySelectorAll('h1, h2, h3')].filter(el => { if (!vis(el)) return false; const s = getComputedStyle(el); const lh = parseFloat(s.lineHeight) / parseFloat(s.fontSize); const clip = [el, el.parentElement, ...el.querySelectorAll('*')].some(e => e && /hidden|clip/.test(getComputedStyle(e).overflow + getComputedStyle(e).overflowY)); return (lh < 0.95 || (clip && lh < 1.05)) && /[ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúçgjpqy]/.test(el.innerText); }).slice(0, 4).map(el => `"${txt(el)}" lh=${(parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize)).toFixed(2)}`);

  // Texto colado: irmaos inline sem espaco entre eles, em pai que nao e flex/grid
  const colados = [];
  for (const p of all) { const d = getComputedStyle(p).display; if (/flex|grid/.test(d)) continue; const nodes = [...p.childNodes].filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.length)); for (let i = 1; i < nodes.length; i++) { const a = nodes[i - 1], b = nodes[i]; if (a.nodeType !== 1 || b.nodeType !== 1) continue; if (!/inline/.test(getComputedStyle(a).display) || !/inline/.test(getComputedStyle(b).display)) continue; const ta = (a.innerText || '').trimEnd(), tb = (b.innerText || '').trimStart(); if (/[\p{L}\d]$/u.test(a.innerText || '') && /^[\p{L}\d]/u.test(b.innerText || '') && ta && tb && parseFloat(getComputedStyle(b).marginLeft) < 2 && parseFloat(getComputedStyle(a).marginRight) < 2 && parseFloat(getComputedStyle(b).paddingLeft) < 2) colados.push(ta.slice(-15) + '|' + tb.slice(0, 15)); } }
  R.texto_colado = colados.slice(0, 4);

  // Cor
  const grads = all.map(el => getComputedStyle(el).backgroundImage).filter(b => b && b.includes('gradient'));
  R.gradientes = grads.length;
  R.gradiente_roxo = grads.filter(g => (g.match(/rgba?\([^)]+\)/g) || []).some(c => { const p = parse(c); if (!p) return false; const { h, s } = hue(p); return h >= 245 && h <= 295 && s > 0.35; })).length;
  R.texto_gradiente = all.filter(el => { const s = getComputedStyle(el); return (s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text') && s.backgroundImage.includes('gradient'); }).length;
  R.preto_puro = all.filter(el => { const s = getComputedStyle(el); return s.backgroundColor === 'rgb(0, 0, 0)' || s.color === 'rgb(0, 0, 0)'; }).length;
  R.cinza_puro = all.filter(el => { const c = parse(getComputedStyle(el).color); return c && c.r === c.g && c.g === c.b && c.r > 60 && c.r < 200; }).length;

  // Contraste
  const low = [];
  for (const el of textEls) {
    const s = getComputedStyle(el); const fg = parse(s.color); const bg = bgOf(el); if (!fg || !bg) continue;
    const fs = parseFloat(s.fontSize), big = fs >= 24 || (fs >= 18.66 && +s.fontWeight >= 700);
    const r = ratio(fg, bg); if (r < (big ? 3 : 4.5)) low.push({ el: short(el), texto: txt(el), contraste: +r.toFixed(2) });
  }
  R.contraste_baixo = low.length; R.contraste_exemplos = low.slice(0, 5);

  // Cards: grupos de 3+ irmãos iguais com raio + sombra/borda; card dentro de card
  const isCard = el => { const s = getComputedStyle(el); return parseFloat(s.borderRadius) >= 6 && (s.boxShadow !== 'none' || parseFloat(s.borderTopWidth) > 0 || (parse(s.backgroundColor) || { a: 0 }).a > 0.5) && el.getBoundingClientRect().height > 80; };
  let grupos = 0; const gEx = [];
  for (const p of all) { const k = [...p.children].filter(vis); if (k.length < 3 || k.length > 6) continue; if (!k.every(isCard)) continue; const w = k.map(c => Math.round(c.getBoundingClientRect().width)); if (Math.max(...w) - Math.min(...w) <= 4 && new Set(k.map(c => c.children.length)).size === 1) { grupos++; gEx.push(short(p) + ` (${k.length} cards)`); } }
  R.grade_cards_iguais = grupos; R.grade_exemplos = gEx.slice(0, 3);
  R.card_dentro_de_card = all.filter(el => isCard(el) && el.parentElement && el.parentElement.closest && (() => { let e = el.parentElement; while (e && e !== document.body) { if (isCard(e)) return true; e = e.parentElement; } return false; })()).length;
  R.borda_lateral_colorida = all.filter(el => { const s = getComputedStyle(el); return parseFloat(s.borderLeftWidth) > 1 && parseFloat(s.borderRightWidth) === 0 && parseFloat(s.borderTopWidth) === 0; }).length;

  // Layout / mobile
  R.overflow_horizontal = document.documentElement.scrollWidth > window.innerWidth + 1;
  R.elementos_vazando = all.filter(el => el.getBoundingClientRect().right > window.innerWidth + 2).slice(0, 5).map(short);
  const inlineNoTexto = el => el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /^(P|LI|SPAN|EM|STRONG|SMALL|FIGCAPTION|BLOCKQUOTE)$/.test(el.parentElement.tagName) && (el.parentElement.innerText || '').trim().length > (el.innerText || '').trim().length + 15;
  const pequenos = [...document.querySelectorAll('a, button, input, select')].filter(el => { if (!vis(el) || inlineNoTexto(el)) return false; const r = el.getBoundingClientRect(); return r.height < 40 || r.width < 40; });
  R.alvos_pequenos = pequenos.length; R.alvos_exemplos = pequenos.slice(0, 4).map(el => `"${txt(el) || short(el)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
  const firstCta = [...document.querySelectorAll('a, button')].find(el => vis(el) && /btn|button|cta/i.test(el.className + el.tagName));
  R.cta_na_primeira_dobra = firstCta ? firstCta.getBoundingClientRect().top < window.innerHeight : null;
  R.ctas = [...new Set([...document.querySelectorAll('a, button')].filter(el => vis(el) && /btn|button|cta/i.test(el.className + el.tagName)).map(el => el.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 10);

  // Imagens e acessibilidade
  R.imagens_quebradas = [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(0, 80));
  R.imagens_sem_alt = [...document.images].filter(i => !i.hasAttribute('alt')).length;
  R.imagens_total = document.images.length;
  const css = [...document.styleSheets].map(ss => { try { return [...ss.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n') + [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  R.reduced_motion = /prefers-reduced-motion/.test(css);
  R.focus_visible = /:focus-visible|:focus\b/.test(css);
  R.selection_tematizada = /::selection/.test(css);
  R.animacoes_bounce = /cubic-bezier\([^)]*(1\.[2-9]|-0\.[3-9])/.test(css);
  R.keyframes = (css.match(/@keyframes/g) || []).length;

  // Sobreposicao: algo nao relacionado cobrindo titulo/paragrafo/botao (ignora header fixo/sticky)
  R.sobreposicoes = [];
  const alvos = [...document.querySelectorAll('h1, h2, h3, p, a, button, li')].filter(vis);
  const H = document.documentElement.scrollHeight; const seen = new Set(); window.scrollTo({ top: 0, behavior: 'instant' });
  for (let y = 0; y < H && R.sobreposicoes.length < 6; y += window.innerHeight) {
    window.scrollTo({ top: y, behavior: 'instant' });
    for (const el of alvos) {
      if (seen.has(el)) continue; { let fx = false; for (let e = el; e; e = e.parentElement) { if (/fixed|sticky/.test(getComputedStyle(e).position)) { fx = true; break; } } if (fx) { seen.add(el); continue; } } const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight || r.width < 8) continue; seen.add(el);
      // pontos sobre as linhas reais do texto (não a caixa inteira, que pode ser mais larga que o texto)
      const rg = document.createRange(); rg.selectNodeContents(el);
      const linhas = [...rg.getClientRects()].filter(q => q.width > 4 && q.height > 4).slice(0, 6);
      const pts = linhas.flatMap(q => [0.15, 0.5, 0.85].map(f => [q.left + q.width * f, q.top + q.height / 2])).filter(([x, yy]) => x >= 0 && x < window.innerWidth && yy >= 0 && yy < window.innerHeight);
      let hits = 0, by = null;
      for (const [x, yy] of pts) { const top = document.elementFromPoint(x, yy); if (!top || el.contains(top) || top.contains(el)) continue; let fixed = false; for (let e = top; e; e = e.parentElement) { if (/fixed|sticky/.test(getComputedStyle(e).position)) { fixed = true; break; } } if (fixed) continue; if (getComputedStyle(top).pointerEvents === 'none' && +getComputedStyle(top).opacity < 0.2) continue; hits++; by = top; }
      if (hits >= 1 && hits >= pts.length * 0.15) R.sobreposicoes.push(`"${txt(el)}" coberto por ${short(by)} (some atrás ou não recebe clique)`);
    }
  }
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Links, botões e formulários (o teste de fluxo roda depois, fora da página)
  R.links = [...document.querySelectorAll('a[href]')].filter(vis).map(a => ({ texto: txt(a) || short(a), href: a.getAttribute('href'), alvo: a.target || '' })).slice(0, 80);
  R.ancoras_quebradas = R.links.filter(l => l.href.startsWith('#') && l.href.length > 1 && !document.getElementById(decodeURIComponent(l.href.slice(1)))).map(l => `${l.texto} -> ${l.href}`);
  R.links_vazios = R.links.filter(l => l.href === '#' || l.href === '' || /^javascript:/i.test(l.href)).map(l => l.texto).slice(0, 5);
  R.botoes_sem_acao = [...document.querySelectorAll('button')].filter(b => vis(b) && !b.form && !b.onclick && !b.getAttribute('onclick') && !b.getAttribute('aria-controls') && !b.getAttribute('aria-expanded') && b.type !== 'submit').map(b => txt(b)).slice(0, 5);
  R.whatsapp = R.links.filter(l => /wa\.me|whatsapp\.com|api\.whatsapp/i.test(l.href)).map(l => l.href);
  R.forms = [...document.forms].filter(vis).map(f => ({ action: f.getAttribute('action') || '(js)', metodo: (f.method || 'get').toUpperCase(), campos: [...f.elements].filter(e => /INPUT|SELECT|TEXTAREA/.test(e.tagName) && e.type !== 'hidden').length, obrigatorios: [...f.elements].filter(e => e.required).length, sem_label: [...f.elements].filter(e => /INPUT|SELECT|TEXTAREA/.test(e.tagName) && e.type !== 'hidden' && e.type !== 'submit' && !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.closest('label') && !e.getAttribute('aria-label')).length }));

  // SEO / head
  const m = n => (document.querySelector(`meta[name="${n}"], meta[property="${n}"]`) || {}).content || null;
  R.head = { lang: document.documentElement.lang || null, title: document.title || null, description: m('description'), og_image: m('og:image'), viewport: m('viewport'), favicon: !!document.querySelector('link[rel*=icon]') };
  return R;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
  const report = { url, quando: new Date().toISOString(), saida: out };
  try {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage();
      const errors = [], failed = []; let bytes = 0;
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 150)); });
      page.on('pageerror', e => errors.push(String(e).slice(0, 150)));
      page.on('requestfailed', r => failed.push(r.url().slice(0, 100)));
      page.on('response', async r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 100)}`); try { const h = r.headers()['content-length']; if (h) bytes += +h; } catch (e) {} });
      await page.setViewport(vp);
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(e => errors.push('goto: ' + e.message));
      const loadMs = Date.now() - t0;
      await page.evaluate(async () => { document.documentElement.style.scrollBehavior = 'auto'; document.body.style.scrollBehavior = 'auto'; await document.fonts.ready; for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo({ top: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 900)); });
      await page.screenshot({ path: `${out}/${name}.png` });
      await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true, captureBeyondViewport: true });
      // Recortes tela a tela (o -full fica minusculo quando aberto inteiro): <name>-01.png, -02.png ...
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let i = 0, y = 0; y < total && i < 10; i++, y += vp.height) { await page.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y); await new Promise(r => setTimeout(r, 250)); await page.screenshot({ path: `${out}/${name}-${String(i + 1).padStart(2, '0')}.png` }); }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      if (name === 'desktop' && ogOut) { await page.setViewport({ width: 1200, height: 630 }); await new Promise(r => setTimeout(r, 400)); await page.screenshot({ path: ogOut }); await page.setViewport(vp); report.og_gerada = ogOut; }
      const r = await page.evaluate(inspect, name);
      if (name === 'mobile') {
        r.menu_mobile = await page.evaluate(async () => {
          const b = [...document.querySelectorAll('button, [role=button], .hamburger, .menu-toggle, [aria-label*=menu i]')].find(e => { const s = getComputedStyle(e), q = e.getBoundingClientRect(); return s.display !== 'none' && q.width > 0 && /menu|nav|hamb|toggle/i.test((e.className || '') + (e.getAttribute('aria-label') || '') + (e.getAttribute('aria-controls') || '') + e.innerText); });
          if (!b) return { existe: false };
          const visiveisAntes = [...document.querySelectorAll('nav a, header a')].filter(a => a.getBoundingClientRect().width > 0 && getComputedStyle(a).visibility !== 'hidden').length;
          b.click(); await new Promise(r => setTimeout(r, 600));
          const visiveisDepois = [...document.querySelectorAll('nav a, header a')].filter(a => { const q = a.getBoundingClientRect(); return q.width > 0 && q.top < innerHeight && getComputedStyle(a).visibility !== 'hidden' && +getComputedStyle(a).opacity > 0.1; }).length;
          // menu aberto sem fundo: embaixo do link do menu ha texto de outra parte da pagina
          const sobrepostos = [...document.querySelectorAll('nav a, header a')].filter(a => { const q = a.getBoundingClientRect(); return q.width > 0 && q.top > 40 && q.top < innerHeight; }).filter(a => { const q = a.getBoundingClientRect(); const pilha = document.elementsFromPoint(q.left + Math.min(q.width / 2, 40), q.top + q.height / 2); const i = pilha.indexOf(a); return pilha.slice(i + 1).some(e => !e.contains(a) && /^(H1|H2|H3|P|LI|SPAN|STRONG|EM)$/.test(e.tagName) && (e.innerText || '').trim().length > 3 && !a.closest('nav,header').contains(e)); }).map(a => a.innerText.trim()).slice(0, 4);
          window.__menuAberto = true;
          return { existe: true, abriu: visiveisDepois > visiveisAntes, antes: visiveisAntes, depois: visiveisDepois, sobrepostos };
        }).catch(e => ({ erro: e.message }));
        if (r.menu_mobile && r.menu_mobile.existe) { await page.screenshot({ path: `${out}/mobile-menu-aberto.png` }); await page.evaluate(() => { const b = [...document.querySelectorAll('button, [role=button], .hamburger, .menu-toggle, [aria-label*=menu i]')].find(e => /menu|nav|hamb|toggle/i.test((e.className || '') + (e.getAttribute('aria-label') || ''))); if (b) b.click(); }); }
      }
      report[name] = { ...r, load_ms: loadMs, peso_kb: Math.round(bytes / 1024), erros_console: errors.slice(0, 5), requests_falhos: failed.slice(0, 5) };
      await page.close();
    }
  } finally { await browser.close(); }

  // og:image aponta pra arquivo que existe?
  const og = report.desktop.head.og_image;
  if (og) { try { const u = new URL(og, url); if (u.protocol === 'file:') report.og_ok = fs.existsSync(decodeURIComponent(u.pathname)); else { const r = await fetch(u, { method: 'HEAD' }); report.og_ok = r.ok; } } catch (e) { report.og_ok = false; } }

  // Links: externos e internos respondem? (HEAD, cai pra GET; max 25)
  const vistos = new Set(), quebrados = [];
  for (const l of report.desktop.links) {
    if (/^(#|mailto:|tel:|javascript:)/i.test(l.href) || !l.href) continue;
    let u; try { u = new URL(l.href, url); } catch (e) { quebrados.push(`${l.texto} -> ${l.href} (URL inválida)`); continue; }
    if (u.protocol === 'file:') { if (!fs.existsSync(decodeURIComponent(u.pathname))) quebrados.push(`${l.texto} -> ${l.href} (arquivo não existe)`); continue; }
    const k = u.href.split('#')[0]; if (vistos.has(k) || vistos.size >= 25) continue; vistos.add(k);
    if (/instagram\.com|facebook\.com|linkedin\.com/.test(u.host)) continue; // bloqueiam robô: checar na mão
    try { let r = await fetch(k, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) }); if (r.status === 405 || r.status === 403) r = await fetch(k, { redirect: 'follow', signal: AbortSignal.timeout(10000) }); if (r.status >= 400) quebrados.push(`${l.texto} -> ${k} (${r.status})`); }
    catch (e) { quebrados.push(`${l.texto} -> ${k} (sem resposta)`); }
  }
  report.links_quebrados = quebrados;
  report.whatsapp_invalidos = report.desktop.whatsapp.filter(w => { const m = w.match(/wa\.me\/(\d+)/) || w.match(/phone=(\d+)/); return !m || m[1].length < 12 || m[1].length > 13 || !m[1].startsWith('55'); });

  // Veredito
  const d = report.desktop, mo = report.mobile, B = [], A = [];
  const generic = /^(inter|arial|helvetica|roboto|system-ui|-apple-system|segoe ui|times new roman|open sans|montserrat|poppins)$/i;
  const llmSerif = /^(fraunces|instrument serif)$/i;
  for (const [k, f] of Object.entries(d.fonts)) if (f && generic.test(f)) A.push(`fonte genérica no ${k}: ${f}`);
  for (const f of d.familias_usadas) if (llmSerif.test(f)) A.push(`serifa "favorita de IA": ${f}`);
  if (d.fontes_nao_carregadas.length) B.push(`fonte declarada mas NÃO carregada (o visitante vê fonte do sistema): ${d.fontes_nao_carregadas.join(', ')}`);
  if (d.travessoes) B.push(`${d.travessoes} travessão(ões) no texto: ${d.travessao_exemplos.join(' | ')}`);
  if (d.palavras_proibidas.length) B.push(`palavras proibidas/clichê: ${d.palavras_proibidas.join(', ')}`);
  if (d.placeholders.length) B.push(`placeholder esquecido: ${d.placeholders.join(', ')}`);
  if (d.imagens_quebradas.length) B.push(`${d.imagens_quebradas.length} imagem(ns) quebrada(s)`);
  if (mo.overflow_horizontal) B.push(`rolagem horizontal no celular (vazando: ${mo.elementos_vazando.join(', ')})`);
  if (d.h1_count !== 1) A.push(`${d.h1_count} H1 na página (ideal 1)`);
  if (d.eyebrows > Math.ceil(Math.max(d.secoes, 1) / 3)) A.push(`${d.eyebrows} eyebrows (rótulo caixa-alta acima de título) pra ${d.secoes} seções: ${d.eyebrow_exemplos.join(' | ')}`);
  if (d.numeracao_secao > 1) A.push(`${d.numeracao_secao} numerações tipo 01/02/03 (só se for sequência de verdade)`);
  if (d.gradiente_roxo) A.push(`${d.gradiente_roxo} gradiente roxo/violeta (assinatura de IA)`);
  if (d.texto_gradiente) A.push(`${d.texto_gradiente} texto com gradiente`);
  if (d.grade_cards_iguais) A.push(`grade de cards idênticos: ${d.grade_exemplos.join(', ')}`);
  if (d.card_dentro_de_card) A.push(`${d.card_dentro_de_card} card dentro de card`);
  if (d.borda_lateral_colorida) A.push(`${d.borda_lateral_colorida} bloco com borda lateral colorida`);
  if (d.preto_puro) A.push(`${d.preto_puro} elementos com preto puro #000`);
  if (d.contraste_baixo + mo.contraste_baixo) B.push(`contraste baixo: ${d.contraste_baixo} desktop / ${mo.contraste_baixo} celular, ex: ${d.contraste_exemplos.concat(mo.contraste_exemplos).slice(0, 3).map(x => `"${x.texto}" ${x.contraste}:1`).join(' | ')}`);
  if (d.setas_em_botao) A.push(`${d.setas_em_botao} botão/link terminando em seta →`);
  if (d.ponto_medio > 2) A.push(`${d.ponto_medio} separadores " · "`);
  if (d.animacoes_bounce) A.push('easing com quique/elástico');
  if (!d.reduced_motion && d.keyframes) A.push('tem animação mas não respeita prefers-reduced-motion');
  if (!d.focus_visible) A.push('sem estilo de foco pra teclado');
  if (!d.selection_tematizada) A.push('seleção de texto com cor padrão do navegador (::selection)');
  if (d.cta_na_primeira_dobra === false) A.push('CTA principal fora da primeira dobra no desktop');
  if (mo.cta_na_primeira_dobra === false) A.push('CTA principal fora da primeira dobra no celular');
  if (mo.alvos_pequenos > 2) A.push(`${mo.alvos_pequenos} alvos de toque < 40px no celular: ${mo.alvos_exemplos.join(' | ')}`);
  if (d.imagens_sem_alt) A.push(`${d.imagens_sem_alt} imagem(ns) sem alt`);
  if (d.erros_console.length) A.push(`erros no console: ${d.erros_console.join(' | ')}`);
  if (d.requests_falhos.length) A.push(`requests falhos: ${d.requests_falhos.join(' | ')}`);
  for (const [k, v] of Object.entries(d.head)) if (!v) A.push(`head sem ${k}`);
  if (d.h1_linhas > 2) A.push(`H1 ocupa ${d.h1_linhas} linhas no desktop (máx 2)`);
  if (d.sobreposicoes.length + mo.sobreposicoes.length) B.push(`elemento cobrindo texto: ${d.sobreposicoes.concat(mo.sobreposicoes.map(x => x + ' (celular)')).slice(0, 4).join(' | ')}`);
  if (d.titulo_apertado.length) A.push(`título com entrelinha apertada e acento/descendente (pode cortar ou encostar): ${d.titulo_apertado.join(' | ')}`);
  if (d.texto_colado.length + mo.texto_colado.length) A.push(`texto colado sem espaço: ${d.texto_colado.concat(mo.texto_colado).slice(0, 3).join(' | ')}`);
  if (report.links_quebrados.length) B.push(`link quebrado: ${report.links_quebrados.slice(0, 4).join(' | ')}`);
  if (d.ancoras_quebradas.length) B.push(`âncora sem destino (#id não existe): ${d.ancoras_quebradas.slice(0, 4).join(' | ')}`);
  if (report.whatsapp_invalidos.length) B.push(`link de WhatsApp com número estranho (esperado 55+DDD+número): ${report.whatsapp_invalidos.join(' | ')}`);
  if (mo.menu_mobile && mo.menu_mobile.existe && mo.menu_mobile.sobrepostos && mo.menu_mobile.sobrepostos.length) B.push(`menu do celular abre SEM FUNDO, links por cima do conteúdo (${mo.menu_mobile.sobrepostos.join(', ')}): ver mobile-menu-aberto.png`);
  else if (mo.menu_mobile && mo.menu_mobile.existe && !mo.menu_mobile.abriu) A.push('menu do celular: nenhum link novo apareceu ao tocar. Conferir mobile-menu-aberto.png');
  if (d.links_vazios.length) A.push(`link sem destino (# ou vazio): ${d.links_vazios.join(' | ')}`);
  if (d.botoes_sem_acao.length) A.push(`botão sem ação aparente: ${d.botoes_sem_acao.join(' | ')}`);
  for (const f of d.forms) { if (f.sem_label) A.push(`formulário (${f.action}) com ${f.sem_label} campo(s) sem label`); }
  if (report.og_ok === false) B.push(`og:image aponta pra arquivo que não existe: ${d.head.og_image}`);
  report.bloqueantes = B; report.avisos = A;
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));

  console.log(`SITE-CHECK ${url}`);
  console.log(`prints: ${out}/desktop-NN.png e mobile-NN.png (tela a tela, ABRA ESTES), desktop.png, mobile.png, *-full.png  |  relatório: ${out}/report.json${report.og_gerada ? '  |  og:image gerada: ' + report.og_gerada : ''}`);
  console.log(`fontes: ${d.familias_usadas.join(', ')}  |  CTAs: ${d.ctas.join(' / ') || '(nenhum detectado)'}`);
  console.log(`carga: ${d.load_ms}ms desktop, ${mo.load_ms}ms celular`);
  console.log(`fluxo: ${d.links.length} links (${report.links_quebrados.length} quebrados), ${d.forms.length} formulário(s) [NÃO enviados: testar envio só com ok], menu celular: ${mo.menu_mobile ? (mo.menu_mobile.existe ? (mo.menu_mobile.sobrepostos && mo.menu_mobile.sobrepostos.length ? 'abre SEM FUNDO' : mo.menu_mobile.abriu ? 'abre' : 'conferir print') : 'não tem') : '-'}`);
  console.log(`\nBLOQUEANTES (${B.length}):`); B.forEach(x => console.log(' - ' + x));
  console.log(`\nAVISOS (${A.length}):`); A.forEach(x => console.log(' - ' + x));
  console.log('\nAgora ABRA os PNGs (Read) e olhe: hierarquia, respiro, ritmo entre seções, o que parece template.');
  process.exit(0);
})().catch(e => { console.error('site-check falhou:', e.message); process.exit(2); });
