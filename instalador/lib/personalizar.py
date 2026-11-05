#!/usr/bin/env python3
"""Personaliza a cópia do Zeus pro cliente (roda no servidor do cliente).

- troca o domínio do Jeff pelo do cliente em todo arquivo de texto
- gera chave nova pra cada segredo interno (mesmo grupo = mesma chave), guardadas em chaves.json
- escreve os .env a partir dos modelos (não sobrescreve .env que já existe)
- aplica as chaves novas nos ecosystem.config.js e nos literais listados em segredos.tsv
- marca o cliente como dono no CLAUDE.md, com Jeff e Vinicius como suporte

Uso: python3 -I personalizar.py <arquivo_respostas.json>
"""
import hashlib, json, os, re, secrets, string, sys

R = json.load(open(sys.argv[1]))
OPT = R.get('raiz_opt', '/opt')
ROOT = R.get('raiz_root', '/root')
MODELOS = R['modelos']
ESTADO = R['estado']
ZONA_ANTIGA = 'jefersonhenrike.com'
DOM = R['dominio']

PASTAS_TEXTO = [os.path.join(OPT, p) for p in ('jeff-worker', 'jeff-apps', 'jeff-sites', 'jeff-projects', 'jeff-data',
                                                'jeff-cigc', 'jeff-ideias', 'zeus-backup')]
PASTAS_TEXTO += [os.path.join(ROOT, 'labastia-setup'), os.path.join(ROOT, '.claude', 'agents'),
                 os.path.join(ROOT, '.claude', 'skills'), os.path.join(ROOT, '.claude', 'CLAUDE.md')]
PULAR = {'node_modules', '.git', '.next', 'venv', '.venv', '__pycache__'}

# ---------- chaves novas (persistidas: rodar de novo reaproveita as mesmas) ----------
arq_chaves = os.path.join(ESTADO, 'chaves.json')
chaves = json.load(open(arq_chaves)) if os.path.exists(arq_chaves) else {}

def nova(tam, tipo):
    tam = max(int(tam), 16)
    if tipo == 'hex':
        return secrets.token_hex(tam)[:tam]
    if tipo == 'alnum':
        alf = string.ascii_letters + string.digits
        return ''.join(secrets.choice(alf) for _ in range(tam))
    return secrets.token_urlsafe(tam)[:tam]

def chave(grp, tam, tipo):
    if grp not in chaves:
        chaves[grp] = nova(tam, tipo)
    return chaves[grp]

FIXOS = {'DOMINIO': DOM, 'EMAIL': R['email'], 'SENHA': R['senha'], 'HASH_ADMIN': R.get('hash_admin', ''),
         'WHITELIST': R['whitelist']}
PH = re.compile(r'\{\{(?:S:([0-9a-f]{12}):(\d+):(\w+)|([A-Z_]+))\}\}')

def resolve(m):
    if m.group(1):
        return chave(m.group(1), m.group(2), m.group(3))
    return FIXOS.get(m.group(4), m.group(0))

def salva_chaves():
    os.makedirs(ESTADO, exist_ok=True)
    with open(arq_chaves, 'w') as f:
        json.dump(chaves, f)
    os.chmod(arq_chaves, 0o600)

# ---------- 1) domínio ----------
def arquivos_texto():
    for base in PASTAS_TEXTO:
        if os.path.isfile(base):
            yield base
            continue
        for d, dirs, fs in os.walk(base):
            dirs[:] = [x for x in dirs if x not in PULAR]
            for f in fs:
                yield os.path.join(d, f)

trocados = 0
for p in arquivos_texto():
    try:
        if os.path.islink(p) or os.path.getsize(p) > 5_000_000:
            continue
        b = open(p, 'rb').read()
    except OSError:
        continue
    if b'\0' in b[:8192] or ZONA_ANTIGA.encode() not in b:
        continue
    open(p, 'wb').write(b.replace(ZONA_ANTIGA.encode(), DOM.encode()))
    trocados += 1
print(f'dominio: {ZONA_ANTIGA} -> {DOM} em {trocados} arquivo(s)')

# ---------- 2) .env a partir dos modelos ----------
escritos = 0
for f in sorted(os.listdir(os.path.join(MODELOS, 'env'))):
    pasta = os.path.join(OPT, f[:-4].replace('__', '/'))
    destino = os.path.join(pasta, '.env')
    if not os.path.isdir(pasta) or os.path.exists(destino):
        continue
    txt = PH.sub(resolve, open(os.path.join(MODELOS, 'env', f)).read())
    with open(destino, 'w') as o:
        o.write(txt)
    os.chmod(destino, 0o600)
    escritos += 1
print(f'.env: {escritos} escrito(s) (os que já existiam ficaram como estavam)')

# ---------- 3) segredos dentro de arquivos ----------
TOKEN = re.compile(rb'[A-Za-z0-9_\-+/=.]{8,}')
aplicados = 0
for linha in open(os.path.join(MODELOS, 'segredos.tsv')):
    if linha.startswith('#') or not linha.strip():
        continue
    tipo, rel, k, ph = linha.rstrip('\n').split('\t')
    p = os.path.join(OPT, rel)
    if not os.path.isfile(p):
        continue
    valor = PH.sub(resolve, ph)
    s = open(p, 'rb').read()
    if tipo == 'eco':
        novo = re.sub(rb'(\b' + re.escape(k.encode()) + rb"""\s*:\s*)(['"`])[^'"`\n]*\2""",
                      lambda m: m.group(1) + m.group(2) + valor.encode() + m.group(2), s)
    else:
        m = re.match(r'\{\{S:([0-9a-f]{12}):(\d+):', ph)
        grp, tam = m.group(1), int(m.group(2))
        novo = TOKEN.sub(lambda t: valor.encode() if len(t.group(0)) == tam and
                         hashlib.sha256(t.group(0)).hexdigest()[:12] == grp else t.group(0), s)
    if novo != s:
        open(p, 'wb').write(novo)
        aplicados += 1
print(f'segredos: {aplicados} troca(s) em arquivos, {len(chaves)} chave(s) nova(s)')
salva_chaves()

# ---------- 4) dono no CLAUDE.md ----------
MARCA = '<!-- zeus-instalador:dono -->'
bloco = f"""{MARCA}
## Neste servidor (instalação do cliente)

- Este ZEUS pertence a **{R['cliente']}**. Dono com autorização total: **{R['dono_nome']} ({R['dono_whats']})**.
- Onde este arquivo, os agentes ou as memórias disserem "Jeff", "Jeferson" ou "o dono" no sentido de quem manda no negócio, leia **{R['dono_nome']}**.
- **Jeferson (5511910075450) e Vinicius (5585991143501)** são o suporte técnico da Alpha Digital: acesso total para manutenção e recebem os alertas de saúde do sistema.
- Domínio deste servidor: **{DOM}**. Acesso à Central: {R['email']}.
<!-- /zeus-instalador:dono -->
"""
for p in (os.path.join(OPT, 'jeff-worker', 'CLAUDE.md'), os.path.join(ROOT, '.claude', 'CLAUDE.md')):
    if not os.path.isfile(p):
        continue
    s = open(p, encoding='utf-8').read()
    if MARCA in s:
        continue
    linhas = s.split('\n')
    i = 1 if linhas and linhas[0].startswith('#') else 0
    linhas.insert(i, '\n' + bloco)
    open(p, 'w', encoding='utf-8').write('\n'.join(linhas))
    print(f'dono marcado em {p}')
