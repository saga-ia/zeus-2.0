// "Quero integrar meus sistemas" (tela Conectores): formulário que chega por e-mail no time do ZEUS.
// Envio pela API do Gmail com o token da conta Google conectada (google.sh token). O texto do formulário
// nunca passa pelo gmail-send do google.sh, que interpola o corpo dentro de um script Python.
// Cada pedido também fica gravado em data/integracao-pedidos.jsonl, para não se perder se o e-mail falhar.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DESTINO = process.env.INTEGRACAO_EMAIL || 'teciasaga@gmail.com';
const GOOGLE = path.join(process.env.WORKER_DIR || '/opt/jeff-worker', 'scripts', 'google.sh');
const LOG = path.join(__dirname, 'data', 'integracao-pedidos.jsonl');

const CAMPOS = [
  ['nome', 'Nome', 120, true],
  ['email', 'E-mail', 160, true],
  ['whatsapp', 'WhatsApp', 40, true],
  ['empresa', 'Empresa', 160, false],
  ['sistemas', 'Sistemas que quer integrar', 1000, true],
  ['objetivo', 'O que espera da integração', 3000, true],
  ['observacoes', 'Observações', 3000, false],
];

function sh(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs || 30000, maxBuffer: 1024 * 1024 }, (err, out, errOut) => {
      if (err) return reject(new Error((errOut || err.message || '').toString().trim().slice(0, 300)));
      resolve(String(out || '').trim());
    });
  });
}
let _conta = null;
async function contaGoogle() {
  if (process.env.GOOGLE_USER_KEY) return process.env.GOOGLE_USER_KEY;
  if (_conta) return _conta;
  const out = await sh(GOOGLE, ['accounts']);
  const linha = out.split('\n').map(l => l.trim()).find(l => /^[^\s@]+@[^\s@]+\.[^\s@]+(\s|$)/.test(l));
  if (!linha) throw new Error('nenhuma conta Google conectada');
  return (_conta = linha.split(/\s+/)[0]);
}

// Cabeçalho e corpo em UTF-8 base64: acentos e qualquer caractere digitado chegam intactos
const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
const cabecalho = s => '=?UTF-8?B?' + b64(s) + '?=';
const semQuebra = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();
const emailValido = s => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(s);

async function enviar({ assunto, texto, responderPara }) {
  const conta = await contaGoogle();
  const token = await sh(GOOGLE, ['token', conta]);
  if (!token || /\s/.test(token)) throw new Error('token Google indisponível');
  const linhas = [
    'To: ' + DESTINO,
    'Subject: ' + cabecalho(assunto),
    responderPara ? 'Reply-To: ' + responderPara : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(texto).replace(/.{76}/g, '$&\r\n'),
  ].filter(l => l !== null);
  const raw = Buffer.from(linhas.join('\r\n'), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }),
  });
  if (!r.ok) throw new Error('Gmail respondeu ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

// Limite simples por pessoa: 5 pedidos por hora
const envios = new Map();
function limite(chave) {
  const agora = Date.now(), lista = (envios.get(chave) || []).filter(t => agora - t < 3600000);
  if (lista.length >= 5) return false;
  lista.push(agora); envios.set(chave, lista); return true;
}

const router = express.Router();
router.post('/', express.json({ limit: '64kb' }), async (req, res) => {
  const b = req.body || {}, v = {};
  for (const [k, rot, max, obrig] of CAMPOS) {
    v[k] = String(b[k] == null ? '' : b[k]).trim().slice(0, max);
    if (obrig && !v[k]) return res.status(400).json({ error: 'Preencha o campo "' + rot + '".' });
  }
  v.email = semQuebra(v.email);
  if (!emailValido(v.email)) return res.status(400).json({ error: 'E-mail inválido.' });
  const u = req.user || {};
  if (!limite(u.email || req.ip)) return res.status(429).json({ error: 'Muitos pedidos em pouco tempo. Tente de novo mais tarde.' });

  const quando = new Date(Date.now() - 3 * 3600000).toISOString().replace('T', ' ').slice(0, 16) + ' (BRT)';
  const pedido = Object.assign({ em: Date.now(), usuario: u.email || null, usuarioNome: u.name || null }, v);
  try { fs.appendFileSync(LOG, JSON.stringify(pedido) + '\n'); } catch (e) { console.error('[integracao] não gravou o pedido:', e.message); }

  const texto = ['Novo pedido de integração pela Central ZEUS (Conectores > Quero integrar meus sistemas).', '']
    .concat(CAMPOS.filter(c => v[c[0]]).map(c => c[1] + ':\n' + v[c[0]] + '\n'))
    .concat(['---', 'Enviado por: ' + (u.name || '?') + (u.email ? ' <' + u.email + '>' : ''), 'Quando: ' + quando]).join('\n');
  try {
    await enviar({ assunto: 'Pedido de integração: ' + semQuebra(v.empresa || v.nome).slice(0, 120), texto, responderPara: v.email });
    console.log('[integracao] pedido enviado para ' + DESTINO + ' por ' + (u.email || '?'));
    res.json({ ok: true });
  } catch (e) {
    console.error('[integracao] falha no envio:', e.message);
    res.status(502).json({ error: 'Não consegui enviar agora. Seu pedido ficou registrado e o time vai ver mesmo assim.' });
  }
});

module.exports = { router };
