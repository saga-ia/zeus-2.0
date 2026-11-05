#!/usr/bin/env python3
"""Grava as chaves DO CLIENTE no Zeus (app_settings do worker e .env dos apps).

Lê do arquivo de resposta do formulário de instalação, quando existe; o que faltar é perguntado
(Enter pula). Também gera as chaves internas das integrações (verify token do Instagram, token do
webhook do Asaas, acesso ao proxy) e grava o IP do servidor.

Uso: python3 -I chaves.py <respostas.json> <chaves.tsv> <formulario.json|-> <ip> [--sem-perguntas]
"""
import getpass, json, os, re, secrets, sqlite3, sys

R = json.load(open(sys.argv[1]))
TSV, FORM, IP = sys.argv[2], sys.argv[3], sys.argv[4]
PERGUNTAR = '--sem-perguntas' not in sys.argv and sys.stdin.isatty()
OPT = R.get('raiz_opt', '/opt')
form = {}
if FORM != '-' and os.path.exists(FORM):
    d = json.load(open(FORM))
    form = d.get('dados', d)

con = sqlite3.connect(os.path.join(OPT, 'jeff-worker', 'data', 'worker.db'))
def atual(k):
    r = con.execute('SELECT value FROM app_settings WHERE key=?', (k,)).fetchone()
    return r[0] if r and r[0] else ''
def grava(k, v):
    con.execute("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", (k, v))

def grava_env(alvo, valor):
    pasta, chave = alvo.split(':')
    p = os.path.join(OPT, pasta, '.env')
    if not os.path.exists(p):
        return
    s = open(p).read()
    if re.search(rf'(?m)^{chave}=.+$', s) and not re.search(rf'(?m)^{chave}=\s*$', s):
        return  # já tem valor: não sobrescreve
    s = re.sub(rf'(?m)^{chave}=.*$', f'{chave}={valor}', s) if re.search(rf'(?m)^{chave}=', s) else s + f'\n{chave}={valor}\n'
    open(p, 'w').write(s)

if PERGUNTAR:
    print('  Chaves do cliente (Enter pula; dá pra preencher depois rodando --refazer chaves)')
gravadas, puladas = [], []
for linha in open(TSV):
    if linha.startswith('#') or not linha.strip():
        continue
    rotulo, campo, keys, envs = linha.rstrip('\n').split('\t')
    keys = [] if keys == '-' else keys.split(',')
    envs = [] if envs == '-' else envs.split(',')
    v = str(form.get(campo, '') or '').strip() if campo != '-' else ''
    origem = 'formulário'
    ja_tem = bool(keys and atual(keys[0]))
    if not v and PERGUNTAR:
        v = getpass.getpass(f'  {rotulo}' + (' [já configurada, Enter mantém]' if ja_tem else '') + ': ').strip()
        origem = 'digitada'
    if not v:
        if not ja_tem:
            puladas.append(rotulo)
        continue
    for k in keys:
        grava(k, v)
    for e in envs:
        grava_env(e, v)
    gravadas.append(f'{rotulo} ({origem})')

# internas das integrações (geradas uma vez)
for k, gerar in [('jeff_meta_ig_webhook_verify_token', lambda: secrets.token_hex(16)),
                 ('asaas_webhook_auth_token', lambda: secrets.token_hex(20)),
                 ('mirror_token', lambda: secrets.token_hex(24))]:
    if not atual(k):
        grava(k, gerar())
for k, v in [('jeff_npm_email', R['email']), ('jeff_npm_password', R['senha']), ('jeff_npm_url', 'http://127.0.0.1:81'),
             ('jeff_server_ipv4', IP), ('jeff_zeus_vps_ip', IP)]:
    grava(k, v)
con.commit()

print(f'  chaves gravadas: {len(gravadas)}' + (': ' + ', '.join(gravadas) if gravadas else ''))
if puladas:
    print('  sem chave (a integração fica desligada até preencher): ' + ', '.join(puladas))
