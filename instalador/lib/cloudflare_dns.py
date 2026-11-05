#!/usr/bin/env python3
"""Cria (ou corrige) o DNS do cliente na Cloudflare: <dominio> e *.<dominio> -> IP, sem proxy.

O token vem da variável de ambiente CF_API_TOKEN e não é gravado em lugar nenhum.
Permissões do token: Zone > Zone > Read  e  Zone > DNS > Edit, só na zona do domínio base.

Uso: CF_API_TOKEN=... python3 -I cloudflare_dns.py <dominio_do_cliente> <ip>
"""
import json, os, sys, urllib.error, urllib.parse, urllib.request

DOM, IP = sys.argv[1], sys.argv[2]
TOKEN = os.environ.get('CF_API_TOKEN', '').strip()
API = 'https://api.cloudflare.com/client/v4'
if not TOKEN:
    sys.exit('sem token da Cloudflare')

def cf(metodo, caminho, corpo=None):
    r = urllib.request.Request(API + caminho, method=metodo,
                               data=json.dumps(corpo).encode() if corpo is not None else None)
    r.add_header('Authorization', 'Bearer ' + TOKEN)
    r.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        d = json.loads(e.read().decode() or '{}')
        msgs = '; '.join(x.get('message', '') for x in d.get('errors', [])) or f'HTTP {e.code}'
        raise SystemExit(f'Cloudflare recusou ({metodo} {caminho.split("?")[0]}): {msgs}')

# zona = o maior sufixo do domínio que existir na conta (ex: cliente.zeusia.cloud -> zeusia.cloud)
partes = DOM.split('.')
zona = None
for i in range(1, len(partes) - 1):
    nome = '.'.join(partes[i:])
    res = cf('GET', '/zones?' + urllib.parse.urlencode({'name': nome}))['result']
    if res:
        zona = res[0]
        break
if not zona:
    sys.exit(f'nenhuma zona da Cloudflare encontrada pra {DOM} (o token precisa de Zone:Read nessa zona)')

for nome in (DOM, '*.' + DOM):
    atuais = cf('GET', f"/zones/{zona['id']}/dns_records?" + urllib.parse.urlencode({'type': 'A', 'name': nome}))['result']
    corpo = {'type': 'A', 'name': nome, 'content': IP, 'ttl': 1, 'proxied': False}
    if not atuais:
        cf('POST', f"/zones/{zona['id']}/dns_records", corpo)
        print(f'  ok  {nome} -> {IP} (criado)')
    elif atuais[0]['content'] != IP or atuais[0].get('proxied'):
        cf('PUT', f"/zones/{zona['id']}/dns_records/{atuais[0]['id']}", corpo)
        print(f"  ok  {nome} -> {IP} (corrigido, antes {atuais[0]['content']})")
    else:
        print(f'  ok  {nome} -> {IP} (já estava certo)')
