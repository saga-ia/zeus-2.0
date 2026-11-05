#!/usr/bin/env node
// Revisão técnica de lâminas HTML ANTES de gerar a arte (zero erro). Reprova:
//  - texto ou elemento vazando pra fora da lâmina; texto cortado (overflow escondido); textos sobrepostos entre si
//  - fonte declarada que não carregou (cai em fonte do sistema); imagem quebrada (foto, emoji Twemoji, avatar)
//  - travessão (— ou –) em qualquer texto; texto pequeno demais pra Instagram (< 20 px numa lâmina de 1080)
//  - caractere de emoji solto no texto (o servidor não tem fonte de emoji: usar Twemoji <img>)
//  - texto COBERTO por outro elemento (faixa, rodapé, foto por cima) e arte POLUÍDA (palavras e blocos de texto demais)
//    Limites (feed 4:5): até 35 palavras e 6 blocos; acima de 50 palavras ou 8 blocos reprova. Story: mesmos limites.
//    Carrossel de conteúdo (lâmina de miolo com texto corrido) pode passar com --texto-longo.
// Uso: node check-html-arte.js s1.html [s2.html ...] [--largura 1080 --altura 1350]
// Saída: OK / REPROVADO por arquivo + motivos; código 1 se algum reprovar. Tira prévia <arquivo>.check.png.
const puppeteer = require('/opt/jeff-worker/node_modules/puppeteer');
const path = require('path');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args.splice(i, 2)[1] : d; };
const W = opt('--largura', 1080), H = opt('--altura', 1350);
const TEXTO_LONGO = args.includes('--texto-longo'); if (TEXTO_LONGO) args.splice(args.indexOf('--texto-longo'), 1);
const arquivos = args;
if (!arquivos.length) { console.error('uso: check-html-arte.js s1.html [s2.html...]'); process.exit(2); }

(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  let ruim = false;
  for (const f of arquivos) {
    const p = await b.newPage(); await p.setViewport({ width: W, height: H });
    const falhas = [];
    p.on('requestfailed', r => falhas.push(r.url().slice(0, 90)));
    p.on('response', r => { if (r.status() >= 400) falhas.push(`${r.status()} ${r.url().slice(0, 90)}`); });
    await p.goto('file://' + path.resolve(f), { waitUntil: 'networkidle0', timeout: 45000 }).catch(e => falhas.push('carregar: ' + e.message));
    await p.evaluate(() => document.fonts.ready);
    const r = await p.evaluate((W, H) => {
      const vis = el => { const s = getComputedStyle(el), q = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && q.width > 0 && q.height > 0; };
      const curto = el => (el.innerText || el.alt || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
      const out = { vazando: [], cortado: [], sobrepostos: [], coberto: [], espremido: [], pequeno: [], travessao: [], emojiSolto: [], imgQuebrada: [], fonteNaoCarregou: [] };
      const textos = [...document.querySelectorAll('body *')].filter(el => vis(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
      // linhas reais de texto (rects) pra checar sobreposição e vazamento
      const linhas = [];
      for (const el of textos) {
        const rg = document.createRange(); rg.selectNodeContents(el);
        const fs = parseFloat(getComputedStyle(el).fontSize);
        for (const r0 of rg.getClientRects()) if (r0.width > 2 && r0.height > 2) {
          // caixa da letra (sem a sobra do line-height): evita falso alarme em título grande com entrelinha apertada
          const cy = (r0.top + r0.bottom) / 2, h = Math.min(r0.height, fs * 0.78);
          linhas.push({ el, q: { left: r0.left, right: r0.right, width: r0.width, top: cy - h / 2, bottom: cy + h / 2, height: h } });
        }
        const q = el.getBoundingClientRect();
        if (q.right > W + 1 || q.left < -1 || q.bottom > H + 1 || q.top < -1) out.vazando.push(curto(el));
        const s = getComputedStyle(el);
        if ((el.scrollWidth > el.clientWidth + 2 && /hidden|clip/.test(s.overflowX)) || (el.scrollHeight > el.clientHeight + 2 && /hidden|clip/.test(s.overflowY) && el.clientHeight > 0)) out.cortado.push(curto(el));
        if (parseFloat(s.fontSize) < 20 * W / 1080) out.pequeno.push(`${curto(el)} (${parseFloat(s.fontSize)}px)`);
        if (/[—–]/.test(el.innerText)) out.travessao.push(curto(el));
        if (/\p{Extended_Pictographic}/u.test([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))) out.emojiSolto.push(curto(el));
      }
      for (const q of linhas) { const r = q.q; if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1) out.vazando.push(curto(q.el)); }
      for (let i = 0; i < linhas.length; i++) for (let j = i + 1; j < linhas.length; j++) {
        const a = linhas[i], c = linhas[j]; if (a.el === c.el || a.el.contains(c.el) || c.el.contains(a.el)) continue;
        const ix = Math.min(a.q.right, c.q.right) - Math.max(a.q.left, c.q.left), iy = Math.min(a.q.bottom, c.q.bottom) - Math.max(a.q.top, c.q.top);
        if (ix > 6 && iy > Math.min(a.q.height, c.q.height) * 0.3) out.sobrepostos.push(`"${curto(a.el)}" x "${curto(c.el)}"`);
      }
      // texto coberto: o ponto central de cada linha precisa mostrar o próprio texto (não uma faixa, rodapé ou imagem por cima)
      const temFundo = (n) => { const c = getComputedStyle(n); return c.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor); };
      const solto = (n) => { for (let p = n; p && p !== document.body; p = p.parentElement) if (/absolute|fixed/.test(getComputedStyle(p).position)) return true; return false; };
      for (const { el, q } of linhas) {
        if (el.closest('svg')) continue;  // texto de gráfico SVG: checado pela sobreposição
        const pts = [[q.left + q.width * 0.2, q.top + q.height / 2], [q.left + q.width / 2, q.top + q.height / 2], [q.left + q.width * 0.8, q.top + q.height / 2]];
        for (const [x, y] of pts) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const topo = document.elementFromPoint(x, y);
          if (!topo || topo === el || el.contains(topo) || topo.contains(el)) continue;
          // só conta o que esconde de verdade: imagem ou bloco com fundo (camada transparente/SVG de enfeite não)
          let esconde = /^(IMG|VIDEO|CANVAS)$/.test(topo.tagName);
          for (let p = topo; !esconde && p && p !== document.body && !p.contains(el); p = p.parentElement) if (temFundo(p)) esconde = true;
          if (esconde) { out.coberto.push(curto(el)); break; }
        }
      }
      // espremido: logo abaixo da linha (12 px) começa uma faixa/rodapé/caixa sobreposta (position absolute/fixed) que não é dela
      for (const { el, q } of linhas) {
        if (el.closest('svg') || solto(el)) continue;  // texto posicionado de propósito sobre foto/faixa (capa) não entra
        const y = q.bottom + 12; if (y >= H) continue;
        const b = document.elementFromPoint(q.left + q.width / 2, y);
        if (!b || b === el || b.contains(el) || el.contains(b)) continue;
        let p = b, sobre = false; while (p && p !== document.body) { if (/absolute|fixed/.test(getComputedStyle(p).position) && !p.contains(el) && temFundo(p)) { sobre = true; break; } p = p.parentElement; }
        if (sobre) out.espremido.push(curto(el));
      }
      // densidade: palavras visíveis e blocos de texto separados
      const blocos = textos.filter(el => !textos.some(o => o !== el && o.contains(el)));
      out._palavras = (document.body.innerText || '').split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length;
      out._blocos = blocos.length;
      for (const img of document.images) if (vis(img) && (!img.complete || img.naturalWidth === 0)) out.imgQuebrada.push(img.src.slice(0, 90));
      // fonte declarada (CSS) que não foi carregada: confere cada família usada nos textos
      const usadas = new Set(textos.map(el => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()));
      const carregadas = new Set([...document.fonts].filter(x => x.status === 'loaded').map(x => x.family.replace(/["']/g, '')));
      const sistema = /^(serif|sans-serif|monospace|system-ui|arial|helvetica|georgia)$/i;
      for (const u of usadas) if (!sistema.test(u) && !carregadas.has(u)) out.fonteNaoCarregou.push(u);
      for (const k in out) if (Array.isArray(out[k])) out[k] = [...new Set(out[k])].slice(0, 4);
      return out;
    }, W, H);
    await p.screenshot({ path: f.replace(/\.html?$/i, '') + '.check.png' });
    const pal = r._palavras, blo = r._blocos; delete r._palavras; delete r._blocos;
    const avisoDens = [];
    if (!TEXTO_LONGO) {
      if (pal > 50 || blo > 8) r.poluida = [`${pal} palavras em ${blo} blocos de texto (máximo 50 palavras e 8 blocos; o ideal é até 35 e 6). Corte texto: 1 mensagem por peça`];
      else if (pal > 35 || blo > 6) avisoDens.push(`ATENÇÃO densidade: ${pal} palavras em ${blo} blocos (ideal até 35 e 6). Compare com a referência`);
    }
    const nomes = { poluida: 'arte poluída', coberto: 'texto coberto por outro elemento', espremido: 'texto espremido contra faixa/rodapé (sem respiro)', vazando: 'saindo da lâmina', cortado: 'texto cortado', sobrepostos: 'textos sobrepostos', pequeno: 'texto pequeno demais', travessao: 'travessão', emojiSolto: 'emoji como caractere (use Twemoji)', imgQuebrada: 'imagem quebrada', fonteNaoCarregou: 'fonte não carregou' };
    const motivos = Object.entries(r).filter(([, v]) => v.length).map(([k, v]) => `${nomes[k]}: ${v.join(' | ')}`);
    if (falhas.length) motivos.push('recurso que não carregou: ' + [...new Set(falhas)].slice(0, 3).join(' | '));
    console.log((motivos.length ? 'REPROVADO ' : 'OK ') + f + ` (${pal} palavras, ${blo} blocos)` + (motivos.length ? '\n  - ' + motivos.join('\n  - ') : '') + (avisoDens.length ? '\n  ' + avisoDens.join('\n  ') : ''));
    if (motivos.length) ruim = true;
    await p.close();
  }
  await b.close(); process.exit(ruim ? 1 : 0);
})().catch(e => { console.error('falhou:', e.message); process.exit(2); });
