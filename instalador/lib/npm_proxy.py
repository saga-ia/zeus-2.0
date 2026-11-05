#!/usr/bin/env python3
"""Cria os subdomínios no Nginx Proxy Manager do cliente e o certificado SSL (Let's Encrypt).

Um certificado só, com todos os subdomínios que já apontam pro servidor (até 100 por certificado),
pra não estourar o limite do Let's Encrypt (50 certificados por domínio por semana).
Pode rodar várias vezes: o que já existe é reaproveitado.

Uso: python3 -I npm_proxy.py <respostas.json> <hosts.tsv> <ip_publico>
"""
import json, socket, subprocess, sys, time, urllib.error, urllib.request

R = json.load(open(sys.argv[1]))
HOSTS_TSV, IP = sys.argv[2], sys.argv[3]
API = 'http://127.0.0.1:81/api'
DOM = R['dominio']

def req(metodo, caminho, corpo=None, token=None, timeout=60):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    r = urllib.request.Request(API + caminho, data=dados, method=metodo)
    r.add_header('Content-Type', 'application/json')
    if token:
        r.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            txt = resp.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{metodo} {caminho}: HTTP {e.code} {e.read().decode()[:300]}')

# login (espera o NPM subir)
token = None
for _ in range(60):
    try:
        token = req('POST', '/tokens', {'identity': R['email'], 'secret': R['senha']})['token']
        break
    except Exception:
        time.sleep(5)
if not token:
    sys.exit('NPM: não consegui entrar com o e-mail/senha do instalador (porta 81)')

# hosts do modelo + extras
linhas = [l.rstrip('\n').split('\t') for l in open(HOSTS_TSV) if l.strip() and not l.startswith('#')]
linhas.append(['n8n', 'http', 'n8n', '5678', '1', '1'])

existentes = {d: h for h in req('GET', '/nginx/proxy-hosts', token=token) for d in h['domain_names']}
criados, pulados = 0, []
for sub, esquema, destino, porta, ws, be in linhas:
    nome = f'{sub}.{DOM}'
    # IP fixo de container (172.18.0.N, N>1) não se repete em servidor novo
    if destino.startswith('172.18.0.') and destino != '172.18.0.1':
        pulados.append(nome)
        continue
    if destino == '127.0.0.1':
        destino = '172.17.0.1'
    if nome in existentes:
        continue
    req('POST', '/nginx/proxy-hosts', {
        'domain_names': [nome], 'forward_scheme': esquema, 'forward_host': destino, 'forward_port': int(porta),
        'allow_websocket_upgrade': ws == '1', 'block_exploits': be == '1', 'access_list_id': 0,
        'certificate_id': 0, 'ssl_forced': False, 'http2_support': False, 'meta': {}, 'advanced_config': '',
        'locations': [], 'caching_enabled': False, 'hsts_enabled': False, 'hsts_subdomains': False}, token=token)
    criados += 1
print(f'proxy: {criados} subdomínio(s) criado(s), {len(existentes)} já existiam')
if pulados:
    print('proxy: pulados (container com IP fixo, configurar à mão se precisar): ' + ', '.join(pulados))

# DNS: quais já apontam pro servidor
def resolve(nome):
    try:
        out = subprocess.run(['dig', '+short', 'A', nome, '@1.1.1.1'], capture_output=True, text=True, timeout=10).stdout
        return [x for x in out.split() if x[0].isdigit()]
    except Exception:
        try: return [socket.gethostbyname(nome)]
        except Exception: return []

hosts = req('GET', '/nginx/proxy-hosts', token=token)
prontos = [h for h in hosts if h['domain_names'][0].endswith('.' + DOM)]
sem_ssl = [h for h in prontos if not h.get('certificate_id')]
ok = [h for h in sem_ssl if IP in resolve(h['domain_names'][0])]
faltando = [h['domain_names'][0] for h in sem_ssl if h not in ok]

if ok:
    for i in range(0, len(ok), 100):
        lote = ok[i:i + 100]
        nomes = [h['domain_names'][0] for h in lote]
        print(f'ssl: pedindo certificado pra {len(nomes)} subdomínio(s), pode levar alguns minutos...')
        cert = req('POST', '/nginx/certificates', {'provider': 'letsencrypt', 'nice_name': f'{DOM} ({i // 100 + 1})',
                                                   'domain_names': nomes, 'meta': {'dns_challenge': False}},
                   token=token, timeout=600)
        for h in lote:
            req('PUT', f"/nginx/proxy-hosts/{h['id']}", {'certificate_id': cert['id'], 'ssl_forced': True,
                                                        'http2_support': True}, token=token)
    print(f'ssl: {len(ok)} subdomínio(s) com HTTPS')
if faltando:
    print(f'ssl: {len(faltando)} subdomínio(s) ainda não apontam pra {IP}: ' + ', '.join(sorted(faltando)[:8]) +
          (' ...' if len(faltando) > 8 else ''))
    sys.exit(3)
