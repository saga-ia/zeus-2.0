// Link de instalação de uso único: /i/<código>
// Criado por /root/zeus-2.0/instalador/gerar-link.sh em data/links/<código>/ (meta.json, resposta.json, cloudflare.token).
// O servidor do cliente roda  curl -fsSL https://.../i/<código> | bash  e recebe, numa ida só: o script de
// bootstrap, o pacote do Zeus (tar.gz do repo), a resposta do formulário e o token da Cloudflare.
// O link vale 24h e é apagado quando o bootstrap termina de baixar (POST /i/<código>/fim).
const fs = require('fs');
const path = require('path');

const LINKS = path.join(__dirname, 'data', 'links');
const COD_OK = /^[A-Za-z0-9_-]{40,64}$/;
const erros = new Map();

function apaga(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ } }

setInterval(() => {
  let nomes = [];
  try { nomes = fs.readdirSync(LINKS); } catch (e) { return; }
  for (const n of nomes) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(LINKS, n, 'meta.json'), 'utf8'));
      if (Date.parse(m.expira) < Date.now()) apaga(path.join(LINKS, n));
    } catch (e) { /* ignora */ }
  }
  erros.clear();
}, 30 * 60 * 1000).unref();

function bootstrap(base, temForm) {
  return `#!/usr/bin/env bash
# Instalador ZEUS: bootstrap de uso único
principal() {
  set -euo pipefail
  local B="${base}"
  [ "$(id -u)" = 0 ] || { echo "Rode como root (sudo -i)."; exit 1; }
  command -v curl >/dev/null && command -v tar >/dev/null || { apt-get update -qq </dev/null; apt-get install -y -qq curl tar </dev/null; }
  echo "==> Baixando o Zeus (alguns minutos)..."
  mkdir -p /opt
  curl -fSL --progress-bar "$B/pacote" | { rm -rf /opt/zeus-2.0.novo && mkdir -p /opt/zeus-2.0.novo && tar -xz -C /opt/zeus-2.0.novo; }
  if [ -d /opt/zeus-2.0 ]; then rm -rf /opt/zeus-2.0.antigo; mv /opt/zeus-2.0 /opt/zeus-2.0.antigo; fi
  mv /opt/zeus-2.0.novo/zeus-2.0 /opt/zeus-2.0 && rmdir /opt/zeus-2.0.novo
  local FORM=""
  ${temForm ? 'curl -fsS -o /root/resposta.json "$B/resposta" && chmod 600 /root/resposta.json && FORM="--formulario /root/resposta.json"' : ':'}
  curl -fsS -o /root/cloudflare.token "$B/cloudflare" 2>/dev/null && chmod 600 /root/cloudflare.token || rm -f /root/cloudflare.token
  # registro pras atualizações (token deste servidor; a versão só chega quando o Jeff aprova no painel)
  local REG TOKEN_ZEUS VER_ZEUS; REG="$(curl -fsS -X POST "$B/registrar" 2>/dev/null)" || REG=""
  if [ -n "$REG" ]; then
    mkdir -p /root/.zeus-instalador && chmod 700 /root/.zeus-instalador
    TOKEN_ZEUS="$(printf '%s' "$REG" | cut -f1)"; VER_ZEUS="$(printf '%s' "$REG" | cut -f2 | tr -cd '0-9')"
    ( umask 077; printf '{"url": "%s", "token": "%s", "versao_instalada": "%s"}\\n' "${base.replace(/\/i\/.*$/, '')}" "$TOKEN_ZEUS" "$VER_ZEUS" > /root/.zeus-instalador/atualizacao.json )
  else echo "atenção: o servidor não foi registrado pras atualizações"; fi
  curl -fsS -X POST "$B/fim" >/dev/null 2>&1 || true
  command -v tmux >/dev/null || { apt-get update -qq </dev/null; apt-get install -y -qq tmux </dev/null; }
  echo "==> Abrindo o instalador. Se a conexão cair, entre de novo e rode:  tmux attach -t zeus"
  sleep 2
  # tmux recusa stdin vindo de /dev/tty: usa o terminal real (o mesmo do stderr); já dentro de um tmux, roda direto
  if [ -t 2 ] && ! printenv TMUX >/dev/null; then exec tmux new-session -A -s zeus "bash /opt/zeus-2.0/instalador/instalar.sh $FORM; exec bash" 0<&2
  else exec bash /opt/zeus-2.0/instalador/instalar.sh $FORM </dev/tty; fi
}
principal "$@"
`;
}

function tratar(req, res, rota, ip, enviar) {
  const m = /^\/i\/([^/]+)(?:\/(pacote|resposta|cloudflare|registrar|fim))?$/.exec(rota);
  const cod = m && m[1];
  const dir = cod && COD_OK.test(cod) ? path.join(LINKS, cod) : null;
  let meta = null;
  try { meta = dir && JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch (e) { meta = null; }
  if (!meta || Date.parse(meta.expira) < Date.now()) {
    if (meta) apaga(dir);
    const n = (erros.get(ip) || 0) + 1; erros.set(ip, n);
    if (n > 30) return enviar(res, 429, 'text/plain; charset=utf-8', 'muitas tentativas\n');
    return enviar(res, 404, 'text/plain; charset=utf-8', 'echo "Link de instalação inválido ou expirado. Gere outro com gerar-link.sh."; exit 1\n');
  }
  const parte = m[2];
  const arq = n => path.join(dir, n);
  if (!parte && req.method === 'GET') {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const base = `${proto}://${req.headers.host}/i/${cod}`;
    console.log(`[zeus-instalacao] link ${cod.slice(0, 6)}… aberto por ${ip}`);
    return enviar(res, 200, 'text/x-shellscript; charset=utf-8', bootstrap(base, fs.existsSync(arq('resposta.json'))));
  }
  if (parte === 'pacote' && req.method === 'GET') {
    let st;
    try { st = fs.statSync(meta.pacote); } catch (e) { return enviar(res, 410, 'text/plain; charset=utf-8', 'pacote não encontrado\n'); }
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    return fs.createReadStream(meta.pacote).pipe(res);
  }
  if ((parte === 'resposta' || parte === 'cloudflare') && req.method === 'GET') {
    const f = arq(parte === 'resposta' ? 'resposta.json' : 'cloudflare.token');
    if (!fs.existsSync(f)) return enviar(res, 404, 'text/plain; charset=utf-8', '');
    return enviar(res, 200, 'application/octet-stream', fs.readFileSync(f));
  }
  if (parte === 'registrar' && req.method === 'POST') {
    const r = require('./versoes').registrar(meta.nome || 'cliente (link)', meta.form_id || null);
    console.log(`[zeus-instalacao] link ${cod.slice(0, 6)}… registrou o servidor ${r.id} (${ip})`);
    return enviar(res, 200, 'text/plain; charset=utf-8', `${r.token}\t${r.versao || ''}\n`);
  }
  if (parte === 'fim' && req.method === 'POST') {
    apaga(dir);
    console.log(`[zeus-instalacao] link ${cod.slice(0, 6)}… usado e apagado (${ip})`);
    return enviar(res, 200, 'text/plain; charset=utf-8', 'ok\n');
  }
  return enviar(res, 405, 'text/plain; charset=utf-8', '');
}

// ─── Comando fixo:  curl -fsSL https://zeus-instalacao.jefersonhenrike.com/instalar | bash ───────────────
// Pede a senha do admin do formulário, lista os clientes do formulário, baixa o Zeus (a última versão publicada
// com publicar.sh: pacote limpo, só o produto), a resposta escolhida e o token da Cloudflare, registra o servidor
// pras atualizações e abre o instalador.
const REPO = '/root/zeus-2.0';
const RESP = path.join(__dirname, 'data', 'respostas');
const ID_RESP = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{6}$/;
const sessoesInst = new Map();

function bootstrapFixo(base) {
  return `#!/usr/bin/env bash
# Instalador ZEUS (comando fixo). Pede a senha do admin do formulário.
principal() {
  set -euo pipefail
  local B="${base}"
  [ "$(id -u)" = 0 ] || { echo "Rode como root (sudo -i)."; exit 1; }
  command -v curl >/dev/null && command -v tar >/dev/null || { apt-get update -qq </dev/null; apt-get install -y -qq curl tar </dev/null; }
  local S TK N ID=""
  read -rsp "Senha de instalação (a do admin do formulário): " S </dev/tty; echo
  TK="$(printf '%s' "$S" | curl -fsS -X POST --data-urlencode "senha@-" "$B/sessao")" || { echo "Senha incorreta (ou muitas tentativas)."; exit 1; }
  unset S
  local H="Authorization: Bearer $TK"
  mapfile -t LISTA < <(curl -fsS -H "$H" "$B/clientes")
  echo; echo "Clientes do formulário:"
  local i=1; for l in "\${LISTA[@]}"; do echo "  $i) \${l#*$'\\t'}"; i=$((i+1)); done
  echo "  0) sem formulário (o instalador pergunta tudo)"
  read -rp "Número do cliente: " N </dev/tty
  if [[ "$N" =~ ^[0-9]+$ ]] && [ "$N" -ge 1 ] && [ "$N" -le \${#LISTA[@]} ]; then ID="\${LISTA[$((N-1))]%%$'\\t'*}"; fi
  echo "==> Baixando o Zeus (alguns minutos)..."
  mkdir -p /opt
  curl -fSL --progress-bar -H "$H" "$B/pacote" | { rm -rf /opt/zeus-2.0.novo && mkdir -p /opt/zeus-2.0.novo && tar -xz -C /opt/zeus-2.0.novo; }
  if [ -d /opt/zeus-2.0 ]; then rm -rf /opt/zeus-2.0.antigo; mv /opt/zeus-2.0 /opt/zeus-2.0.antigo; fi
  mv /opt/zeus-2.0.novo/zeus-2.0 /opt/zeus-2.0 && rmdir /opt/zeus-2.0.novo
  local FORM=""
  if [ -n "$ID" ]; then curl -fsS -H "$H" -o /root/resposta.json "$B/resposta/$ID" && chmod 600 /root/resposta.json && FORM="--formulario /root/resposta.json"; fi
  curl -fsS -H "$H" -o /root/cloudflare.token "$B/cloudflare" 2>/dev/null && chmod 600 /root/cloudflare.token || rm -f /root/cloudflare.token
  # registro pras atualizações (token deste servidor; a versão só chega quando o Jeff aprova no painel)
  local REG TOKEN_ZEUS VER_ZEUS; REG="$(curl -fsS -X POST -H "$H" --data-urlencode "id=$ID" "$B/registrar" 2>/dev/null)" || REG=""
  if [ -n "$REG" ]; then
    mkdir -p /root/.zeus-instalador && chmod 700 /root/.zeus-instalador
    TOKEN_ZEUS="$(printf '%s' "$REG" | cut -f1)"; VER_ZEUS="$(printf '%s' "$REG" | cut -f2 | tr -cd '0-9')"
    ( umask 077; printf '{"url": "%s", "token": "%s", "versao_instalada": "%s"}\\n' "${base.replace(/\/instalar$/, '')}" "$TOKEN_ZEUS" "$VER_ZEUS" > /root/.zeus-instalador/atualizacao.json )
  else echo "atenção: o servidor não foi registrado pras atualizações"; fi
  command -v tmux >/dev/null || { apt-get update -qq </dev/null; apt-get install -y -qq tmux </dev/null; }
  echo "==> Abrindo o instalador. Se a conexão cair, entre de novo e rode:  tmux attach -t zeus"
  sleep 2
  # tmux recusa stdin vindo de /dev/tty: usa o terminal real (o mesmo do stderr); já dentro de um tmux, roda direto
  if [ -t 2 ] && ! printenv TMUX >/dev/null; then exec tmux new-session -A -s zeus "bash /opt/zeus-2.0/instalador/instalar.sh $FORM; exec bash" 0<&2
  else exec bash /opt/zeus-2.0/instalador/instalar.sh $FORM </dev/tty; fi
}
principal "$@"
`;
}

async function instalar(req, res, rota, ip, h) {
  const txt = (st, s) => h.enviar(res, st, 'text/plain; charset=utf-8', s);
  if (rota === '/instalar' && req.method === 'GET') {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    return h.enviar(res, 200, 'text/x-shellscript; charset=utf-8', bootstrapFixo(`${proto}://${req.headers.host}/instalar`));
  }
  if (rota === '/instalar/sessao' && req.method === 'POST') {
    if (h.limite('instalar:' + ip, 10, 15 * 60 * 1000)) return txt(429, 'muitas tentativas\n');
    const senha = new URLSearchParams(await h.lerCorpo(req)).get('senha');
    if (!h.senhaOk(senha)) { console.log(`[zeus-instalacao] /instalar senha errada (${ip})`); return txt(401, 'senha incorreta\n'); }
    const tk = require('crypto').randomBytes(32).toString('hex');
    sessoesInst.set(tk, Date.now() + 2 * 3600 * 1000);
    console.log(`[zeus-instalacao] /instalar sessão aberta (${ip})`);
    return txt(200, tk);
  }
  const tk = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const exp = sessoesInst.get(tk);
  if (!exp || exp < Date.now()) { sessoesInst.delete(tk); return txt(401, 'sessão inválida\n'); }

  if (rota === '/instalar/clientes' && req.method === 'GET') {
    let arqs = [];
    try { arqs = fs.readdirSync(RESP).filter(f => f.endsWith('.json')); } catch (e) { /* vazio */ }
    const linhas = arqs.map(f => { try { const d = JSON.parse(fs.readFileSync(path.join(RESP, f), 'utf8')); return d; } catch (e) { return null; } })
      .filter(Boolean).sort((a, b) => String(b.recebido_em).localeCompare(String(a.recebido_em))).slice(0, 20)
      .map(d => `${d.id}\t${String((d.dados || {}).empresa || '?').replace(/\s+/g, ' ')} (${String((d.dados || {}).nome || '').replace(/\s+/g, ' ')}, ${String(d.recebido_em || '').slice(0, 10)})`);
    return txt(200, linhas.join('\n') + (linhas.length ? '\n' : ''));
  }
  const mr = /^\/instalar\/resposta\/([^/]+)$/.exec(rota);
  if (mr && req.method === 'GET') {
    if (!ID_RESP.test(mr[1]) || !fs.existsSync(path.join(RESP, mr[1] + '.json'))) return txt(404, '');
    console.log(`[zeus-instalacao] /instalar resposta ${mr[1]} baixada (${ip})`);
    return h.enviar(res, 200, 'application/json', fs.readFileSync(path.join(RESP, mr[1] + '.json')));
  }
  if (rota === '/instalar/cloudflare' && req.method === 'GET') {
    const f = path.join(REPO, 'instalador', 'cloudflare.token');
    if (!fs.existsSync(f)) return txt(404, '');
    return h.enviar(res, 200, 'application/octet-stream', fs.readFileSync(f));
  }
  if (rota === '/instalar/pacote' && req.method === 'GET') {
    // nunca o repositório inteiro: só a versão publicada (lib/pacote.py tirou o que é só do Jeff)
    const u = require('./versoes').ultima();
    if (!u) return txt(503, 'nenhuma versão publicada: rode publicar.sh no servidor do Jeff\n');
    console.log(`[zeus-instalacao] /instalar pacote v${u.v} baixado (${ip})`);
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': fs.statSync(u.arquivo).size, 'Cache-Control': 'no-store' });
    return fs.createReadStream(u.arquivo).pipe(res);
  }
  if (rota === '/instalar/registrar' && req.method === 'POST') {
    const id = new URLSearchParams(await h.lerCorpo(req)).get('id') || '';
    let nome = 'cliente sem formulário';
    if (ID_RESP.test(id)) { try { nome = JSON.parse(fs.readFileSync(path.join(RESP, id + '.json'), 'utf8')).dados.empresa || nome; } catch (e) { /* fica o padrão */ } }
    const r = require('./versoes').registrar(nome, ID_RESP.test(id) ? id : null);
    console.log(`[zeus-instalacao] /instalar registrou o servidor de ${nome} (${r.id}, ${ip})`);
    return txt(200, `${r.token}\t${r.versao || ''}\n`);
  }
  return txt(404, '');
}

module.exports = { tratar, instalar };
