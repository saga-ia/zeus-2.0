#!/usr/bin/env python3
"""Cria os bancos SQLite do Zeus com a estrutura de produção (vazios) e a configuração padrão do worker.
Banco que já existe não é tocado. Uso: python3 -I bancos.py <pasta_modelos> [raiz_opt]"""
import glob, os, sqlite3, sys

MODELOS = sys.argv[1]
OPT = sys.argv[2] if len(sys.argv) > 2 else '/opt'
criados = 0
for sql in sorted(glob.glob(os.path.join(MODELOS, 'bancos', '*.sql'))):
    destino = os.path.join(OPT, os.path.basename(sql)[:-4].replace('__', '/'))
    if os.path.exists(destino):
        continue
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    con = sqlite3.connect(destino)
    con.executescript(open(sql).read())
    con.close()
    criados += 1
print(f'bancos: {criados} criado(s) com a estrutura completa (os que já existiam ficaram como estavam)')

worker = os.path.join(OPT, 'jeff-worker', 'data', 'worker.db')
con = sqlite3.connect(worker)
n = 0
for linha in open(os.path.join(MODELOS, 'app_settings.tsv')):
    if linha.startswith('#') or '\t' not in linha:
        continue
    k, v = linha.rstrip('\n').split('\t', 1)
    n += con.execute('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)', (k, v)).rowcount
con.commit()
print(f'configuração padrão do worker: {n} item(ns)')
