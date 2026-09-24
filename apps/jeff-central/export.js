// Exporta uma resposta do chat em PDF.
// Usa o chromium do sistema em modo headless, então não entra dependência nova no package.json.
const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const CHROMIUM = process.env.CHROMIUM_BIN || '/usr/bin/chromium';
const LIMITE_HTML = 2 * 1024 * 1024;
const TIMEOUT_MS = 30000;

// Tira do HTML tudo que poderia executar ou buscar rede dentro do chromium.
// O conteúdo vem da própria tela do usuário, mas o navegador headless roda como root.
function limpar(html) {
  let s = String(html || '').slice(0, LIMITE_HTML);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<\/?(iframe|object|embed|link|meta|base|form|input|button)\b[^>]*>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript:/gi, '');
  return s;
}

const escapar = (v) => String(v == null ? '' : v)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function nomeArquivo(titulo) {
  const base = String(titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return base || 'resposta-zeus';
}

function pagina(titulo, corpo) {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(titulo)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin:0; color:#17171A; font-size:11pt; line-height:1.6;
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; }
  .cabeca { border-bottom:1px solid #E6E6EA; padding-bottom:10px; margin-bottom:18px;
    display:flex; align-items:baseline; gap:10px; }
  .marca { font-size:13pt; font-weight:700; color:#673DE6; letter-spacing:.01em; }
  .tit { font-size:10.5pt; color:#3C3C44; flex:1; }
  .data { font-size:8.5pt; color:#9A9AA3; white-space:nowrap; }
  table { border-collapse:collapse; width:100%; font-size:9.5pt; page-break-inside:avoid; }
  th, td { border:1px solid #E6E6EA; padding:6px 9px; text-align:left; vertical-align:top; }
  th { background:#F7F7F8; font-weight:600; }
  pre { background:#F4F4F6; color:#17171A; border:1px solid #E6E6EA; border-radius:8px;
    padding:10px 12px; font-size:9pt; white-space:pre-wrap; word-wrap:break-word; page-break-inside:avoid; }
  code { background:#F1F1F3; border-radius:4px; padding:1px 4px; font-size:9.5pt; }
  pre code { background:transparent; padding:0; }
  blockquote { margin:0 0 10px; padding:8px 13px; border-left:3px solid rgba(103,61,230,.5);
    background:rgba(103,61,230,.05); border-radius:0 6px 6px 0; }
  a { color:#673DE6; text-decoration:none; }
  img, svg { max-width:100%; }
  hr { border:0; border-top:1px solid #E6E6EA; margin:14px 0; }
  ul, ol { padding-left:20px; margin:0 0 10px; }
  li { margin:0 0 4px; }
  .rodape { margin-top:22px; padding-top:9px; border-top:1px solid #E6E6EA; font-size:8pt; color:#9A9AA3; }
</style></head><body>
<div class="cabeca"><span class="marca">ZEUS</span><span class="tit">${escapar(titulo)}</span><span class="data">${escapar(agora)}</span></div>
${corpo}
<div class="rodape">Gerado pela Central ZEUS em ${escapar(agora)} (horário de Brasília).</div>
</body></html>`;
}

function gerar(arquivoHtml, arquivoPdf) {
  return new Promise((ok, erro) => {
    execFile(CHROMIUM, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-pdf-header-footer', '--virtual-time-budget=5000',
      '--print-to-pdf=' + arquivoPdf, 'file://' + arquivoHtml,
    ], { timeout: TIMEOUT_MS }, (e) => (e ? erro(e) : ok()));
  });
}

const router = express.Router();

router.post('/pdf', async (req, res) => {
  const b = req.body || {};
  const corpo = limpar(b.html).trim();
  if (!corpo) return res.status(400).json({ error: 'Nada para exportar.' });
  const titulo = String(b.title || 'Resposta do ZEUS').slice(0, 140);

  let dir = null;
  try {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-pdf-'));
    const entrada = path.join(dir, 'doc.html');
    const saida = path.join(dir, 'doc.pdf');
    await fs.writeFile(entrada, pagina(titulo, corpo), 'utf8');
    await gerar(entrada, saida);
    const buf = await fs.readFile(saida);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Length', String(buf.length));
    res.set('Content-Disposition', `attachment; filename="${nomeArquivo(titulo)}.pdf"`);
    res.send(buf);
  } catch (err) {
    console.error('[export] pdf:', err.message);
    res.status(500).json({ error: 'Não consegui gerar o PDF agora.' });
  } finally {
    if (dir) fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

module.exports = { router };
