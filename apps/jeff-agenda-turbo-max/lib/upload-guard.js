// Proteções de upload e de entrega de mídia.
//
// Problema que isto resolve: o multer aceitava qualquer arquivo e derivava a
// extensão do NOME ORIGINAL enviado pelo cliente. Como /uploads é servido
// estaticamente e sem autenticação (a Meta precisa baixar a mídia de lá),
// era possível subir um .html ou .svg com script e abri-lo no próprio domínio
// da aplicação — executando JavaScript com acesso ao token de login.
const path = require('path');

// Só mídia que o Instagram/YouTube/TikTok de fato aceitam
const MIME_PERMITIDOS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-m4v': '.m4v'
};

// Extensões que podem sair de /uploads. Qualquer outra é bloqueada na entrega,
// mesmo que algo tenha escapado da validação de upload.
const EXT_PERMITIDAS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.m4v']);

// Rejeita no ato do upload o que não for mídia reconhecida.
function fileFilter(req, file, cb) {
  const mime = String(file.mimetype || '').toLowerCase();
  if (!MIME_PERMITIDOS[mime]) {
    return cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype || 'desconhecido'}. ` +
      `Envie apenas imagem (JPG, PNG, WEBP) ou vídeo (MP4, MOV).`));
  }
  cb(null, true);
}

// Nome de arquivo seguro: extensão derivada do MIME validado, nunca do nome
// que o cliente mandou. Assim "foto.html" não vira um .html no servidor.
function nomeSeguro(file, prefixo = '') {
  const ext = MIME_PERMITIDOS[String(file.mimetype || '').toLowerCase()] || '.bin';
  const aleatorio = require('crypto').randomBytes(8).toString('hex');
  return `${prefixo}${Date.now()}-${aleatorio}${ext}`;
}

// Middleware da rota estática /uploads: bloqueia extensão fora da lista e
// impede que o navegador interprete o arquivo como HTML/script.
function servirMidiaComSeguranca(req, res, next) {
  const ext = path.extname(req.path).toLowerCase();
  if (!EXT_PERMITIDAS.has(ext)) {
    return res.status(403).type('text/plain').send('Tipo de arquivo não disponível.');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');   // sem adivinhação de MIME
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Disposition', 'inline');
  next();
}

// Mensagem amigável para erros do multer (limite de tamanho, tipo recusado)
function tratarErroUpload(err, req, res, next) {
  if (!err) return next();
  const msg = err.code === 'LIMIT_FILE_SIZE'
    ? 'Arquivo muito grande para o limite configurado.'
    : err.message || 'Falha no upload.';
  console.warn('[upload] recusado:', msg);
  return res.status(400).json({ error: msg });
}

module.exports = { fileFilter, nomeSeguro, servirMidiaComSeguranca, tratarErroUpload,
                   MIME_PERMITIDOS, EXT_PERMITIDAS };
