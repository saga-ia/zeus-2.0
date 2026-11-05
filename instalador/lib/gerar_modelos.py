#!/usr/bin/env python3
"""Gera instalador/modelos/ a partir da produção (roda no servidor do Jeff).

Nenhum valor secreto sai daqui: segredo interno vira {{S:<grupo>:<tam>:<tipo>}}, onde o grupo é
sha256(valor)[:12]. O mesmo valor em dois lugares cai no mesmo grupo, e o instalador do cliente
gera UMA chave nova por grupo, então apps que dividem uma chave continuam se entendendo.
Chave de fornecedor (OpenAI, Meta, Groq...) vai em branco pro cliente preencher.

Uso: python3 -I gerar_modelos.py <raiz_repo> <zona> <hosts_json> <pm2_json>
"""
import glob, hashlib, json, os, re, subprocess, sys

REPO, ZONA, HOSTS_JSON, PM2_JSON = sys.argv[1:5]
OUT = os.path.join(REPO, 'instalador', 'modelos')
os.makedirs(os.path.join(OUT, 'env'), exist_ok=True)

FORNECEDOR = re.compile(r'ANTHROPIC|OPENAI|GROQ|GEMINI|GOOGLE|ELEVEN|META_|^FB_|FACEBOOK|^IG_|INSTAGRAM|ASAAS|CLICKUP|'
                        r'ZAPSIGN|CHATWOOT|CLOUDFLARE|CUSTOM_LLM|STRIPE|HOTMART|TWILIO|RESEND|SMTP|PERPLEXITY|FIRECRAWL')
SEGREDO = re.compile(r'SECRET|TOKEN|KEY|SALT|PASS|HASH|JWT|ENCRYPT|VAULT|SENHA')
ESPECIAL = {
    'ADMIN_PASSWORD_HASH': '{{HASH_ADMIN}}',
    'ADMIN_EMAIL': '{{EMAIL}}',
    'ADMIN_PASSWORD': '{{SENHA}}',
    'AUTH_PASSWORD': '{{SENHA}}',
    'CRM_PASSWORD': '{{SENHA}}',
    'AGENT_WHITELIST': '{{WHITELIST}}',
}

def grupo(v):
    return hashlib.sha256(v.encode()).hexdigest()[:12]

def tipo(v):
    if re.fullmatch(r'[0-9a-f]+', v): return 'hex'
    if re.fullmatch(r'[A-Za-z0-9]+', v): return 'alnum'
    return 'url'

def placeholder(v):
    return '{{S:%s:%d:%s}}' % (grupo(v), len(v), tipo(v))

def limpa(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
        v = v[1:-1]
    return v

def rel_opt(p):
    return os.path.relpath(p, '/opt')

internos = {}  # valor -> placeholder (segredos internos que precisam de chave nova)
resumo = []

# 1) .env de cada app -> modelos/env/<caminho relativo a /opt com / trocado por __>.env
for f in ['/opt/jeff-worker/.env'] + sorted(glob.glob('/opt/jeff-apps/*/.env')):
    linhas = []
    for linha in open(f, encoding='utf-8', errors='ignore'):
        linha = linha.rstrip('\n')
        m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$', linha)
        if not m:
            linhas.append(linha if linha.strip().startswith('#') or not linha.strip() else '')
            continue
        k, bruto = m.group(1), m.group(2)
        v = limpa(bruto)
        if k in ESPECIAL:
            novo, cat = ESPECIAL[k], 'especial'
        elif SEGREDO.search(k) and FORNECEDOR.search(k):
            novo, cat = '', 'fornecedor (preencher)'
        elif SEGREDO.search(k) and len(v) >= 8:
            novo, cat = placeholder(v), 'segredo novo'
            internos[v] = novo
        else:
            novo, cat = bruto.replace(ZONA, '{{DOMINIO}}'), 'copiado'
        linhas.append(f'{k}={novo}')
        resumo.append(f'{rel_opt(f)}\t{k}\t{cat}')
    destino = os.path.join(OUT, 'env', rel_opt(os.path.dirname(f)).replace('/', '__') + '.env')
    open(destino, 'w', encoding='utf-8').write('\n'.join(linhas) + '\n')

# 2) segredos escritos direto em ecosystem.config.js (produção tem o valor real)
ATRIB = re.compile(r"""\b([A-Z][A-Z0-9_]{2,})\s*:\s*(['"`])([^'"`\n]{8,})\2""")
segredos = []
for f in sorted(glob.glob('/opt/jeff-apps/*/ecosystem.config.js') + ['/opt/jeff-worker/ecosystem.config.js']):
    try: s = open(f, encoding='utf-8').read()
    except OSError: continue
    for k, _, v in ATRIB.findall(s):
        if SEGREDO.search(k) and not FORNECEDOR.search(k) and k not in ESPECIAL and 'process.env' not in v:
            ph = internos.setdefault(v, placeholder(v))
            segredos.append(('eco', rel_opt(f), k, ph))
        elif k in ESPECIAL:
            segredos.append(('eco', rel_opt(f), k, ESPECIAL[k]))

# 3) segredo interno escrito literal em outro arquivo do repo (ex: fallback no código)
MAPA = {'worker/': 'jeff-worker/', 'apps/': 'jeff-apps/', 'sites/': 'jeff-sites/', 'projects/': 'jeff-projects/'}
arquivos = subprocess.run(['git', '-C', REPO, 'ls-files', '-z'], capture_output=True).stdout.split(b'\0')
vistos = set()
for a in arquivos:
    a = a.decode()
    pref = next((p for p in MAPA if a.startswith(p)), None)
    if not pref: continue
    try:
        dados = open(os.path.join(REPO, a), 'rb').read()
    except OSError: continue
    if len(dados) > 3_000_000 or b'\0' in dados[:4096]: continue
    for v, ph in internos.items():
        if v.encode() in dados:
            chave = (a, ph)
            if chave not in vistos:
                vistos.add(chave)
                segredos.append(('literal', MAPA[pref] + a[len(pref):], '-', ph))

with open(os.path.join(OUT, 'segredos.tsv'), 'w') as o:
    o.write('# tipo\tarquivo (relativo a /opt)\tchave\tplaceholder\n')
    for r in segredos: o.write('\t'.join(r) + '\n')

# 4) proxy hosts do Nginx Proxy Manager na zona -> subdomínio, destino, porta
hosts = json.load(open(HOSTS_JSON))
linhas = []
for h in hosts:
    for dn in h.get('domain_names', []):
        if dn.endswith('.' + ZONA) and h.get('enabled'):
            linhas.append('\t'.join(map(str, [dn[:-len(ZONA) - 1], h.get('forward_scheme', 'http'), h.get('forward_host'),
                                             h.get('forward_port'), int(bool(h.get('allow_websocket_upgrade'))),
                                             int(bool(h.get('block_exploits')))])))
with open(os.path.join(OUT, 'hosts.tsv'), 'w') as o:
    o.write('# subdominio\tesquema\tdestino\tporta\twebsocket\tblock_exploits\n' + '\n'.join(sorted(linhas)) + '\n')

# 5) processos PM2 (sem env: o env tem segredo)
def eco_que_define(nome, *pastas):
    for p in pastas:
        e = os.path.join(p or '/x', 'ecosystem.config.js')
        try:
            if re.search(r"""name\s*:\s*['"]%s['"]""" % re.escape(nome), open(e).read()):
                return e
        except OSError: pass
    return '-'

with open(os.path.join(OUT, 'pm2.tsv'), 'w') as o:
    o.write('# nome\tstatus\tcwd\tscript\tinterpretador\targs\tecosystem\n')
    for p in json.load(open(PM2_JSON)):
        e = p.get('pm2_env', {})
        nome = p.get('name')
        if nome == 'pm2-logrotate': continue
        args = e.get('args') or []
        args = ' '.join(args) if isinstance(args, list) else str(args)
        script = e.get('pm_exec_path', '')
        eco = eco_que_define(nome, e.get('pm_cwd'), os.path.dirname(script))
        o.write('\t'.join([nome, e.get('status', ''), e.get('pm_cwd', ''), script,
                           e.get('exec_interpreter', 'node'), args.replace('\t', ' ') or '-', eco]) + '\n')

with open(os.path.join(OUT, 'env-classificacao.tsv'), 'w') as o:
    o.write('# arquivo\tchave\to que o instalador faz\n' + '\n'.join(resumo) + '\n')

print(f'modelos: {len(glob.glob(os.path.join(OUT, "env", "*.env")))} .env, {len(linhas)} subdominios, '
      f'{len(segredos)} segredos em arquivo, {len(internos)} grupos de chave nova')
