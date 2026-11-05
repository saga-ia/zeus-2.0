#!/usr/bin/env python3
"""Gera, a partir da produção, o que o cliente recebe além do código (roda no servidor do Jeff):

  modelos/bancos/*.sql         estrutura de cada banco SQLite (tabelas, índices, gatilhos), SEM dados.
                               Única exceção: as linhas das tabelas de migração, pra o app não tentar
                               recriar o que já existe.
  claude/memoria/              memórias de regras e procedimentos do Zeus, sem dado do Jeff nem de cliente
  modelos/app_settings.tsv     configurações de comportamento do worker (não secretas)

Uso: python3 -I gerar_extras.py <raiz_repo>
"""
import glob, os, re, sqlite3, sys

REPO = sys.argv[1]
INST = os.path.join(REPO, 'instalador')

# ---------------- bancos ----------------
OUT_B = os.path.join(INST, 'modelos', 'bancos')
os.makedirs(OUT_B, exist_ok=True)
for f in glob.glob(os.path.join(OUT_B, '*.sql')):
    os.remove(f)

candidatos = glob.glob('/opt/jeff-worker/data/*.db') + glob.glob('/opt/jeff-apps/*/data/*.db') + \
             glob.glob('/opt/jeff-apps/*/*.db') + glob.glob('/opt/jeff-apps/*/data/*.sqlite')
FORA = re.compile(r'session|wwebjs|app_data|backup|\.bak|/jeff-sistemas/data/npm\.db$')
ORDEM = {'table': 0, 'view': 1, 'index': 2, 'trigger': 3}
total = 0
for db in sorted(set(candidatos)):
    if FORA.search(db) or os.path.islink(db):
        continue
    try:
        con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
        objs = con.execute("select type, name, sql from sqlite_master where sql is not null "
                           "and name not like 'sqlite_%'").fetchall()
    except sqlite3.Error:
        continue
    if not any(t == 'table' for t, _, _ in objs):
        continue
    objs.sort(key=lambda o: ORDEM.get(o[0], 9))
    # valida num banco em memória: descarta tabela-sombra de FTS e o que não aplicar sozinho
    teste = sqlite3.connect(':memory:')
    validos = []
    for t, n, sql in objs:
        try:
            teste.execute(sql)
            validos.append(sql)
        except sqlite3.Error:
            pass
    linhas = [f'-- estrutura de {db} (sem dados)', 'PRAGMA foreign_keys=OFF;', 'BEGIN;']
    linhas += [s.strip().rstrip(';') + ';' for s in validos]
    for t, n, _ in objs:
        if t == 'table' and re.search('migrat', n, re.I) and not n.endswith('_lock'):
            cols = [c[1] for c in con.execute(f'pragma table_info("{n}")')]
            for row in con.execute(f'select * from "{n}"'):
                vals = ', '.join('NULL' if v is None else str(v) if isinstance(v, (int, float))
                                 else "'" + str(v).replace("'", "''") + "'" for v in row)
                linhas.append(f'INSERT OR IGNORE INTO "{n}" ({", ".join(chr(34) + c + chr(34) for c in cols)}) VALUES ({vals});')
    linhas.append('COMMIT;')
    nome = os.path.relpath(db, '/opt').replace('/', '__') + '.sql'
    open(os.path.join(OUT_B, nome), 'w').write('\n'.join(linhas) + '\n')
    total += 1
print(f'bancos: estrutura de {total} banco(s)')

# ---------------- memórias de regras e procedimentos ----------------
MEM = '/root/.claude/projects/-opt-jeff-worker/memory'
INCLUIR = '''feedback_campaign_data_verification feedback_dedupe_before_presenting feedback_groups_admin_rule
feedback_ig_image_upload_drive_lh3 feedback_jeff_metric_conversas feedback_jeff_naming_pastas feedback_jeff_pasta_por_projeto
feedback_jeff_protocolo_erro_cliente feedback_meta_campaign_checklist feedback_mobile_first_rule feedback_model_routing
feedback_monitoramento_sistemas feedback_nao_responder_nao_autorizado
feedback_nunca_sobrescrever_subdominio_ativo feedback_pm2_reload_after_code_change feedback_response_speed
feedback_review_before_presenting feedback_short_action_over_explanation feedback_stack_preferences
feedback_team_auth_protocol feedback_team_priority_response feedback_testar_caminho_antes_de_indicar feedback_think_10x
feedback_wpp_lid_resolution reference_worker_architecture project_phase2_api_reply'''.split()
SUPORTE = {'5511910075450', '5585991143501'}
OUT_M = os.path.join(INST, 'claude', 'memoria')
os.makedirs(OUT_M, exist_ok=True)
for f in glob.glob(os.path.join(OUT_M, '*.md')):
    os.remove(f)
indice = []
for nome in INCLUIR:
    p = os.path.join(MEM, nome + '.md')
    if not os.path.exists(p):
        continue
    s = open(p, encoding='utf-8').read()
    s = re.sub(r'(?m)^Autorizados hoje.*$', 'Autorizados: o dono deste Zeus, o suporte técnico (Jeferson e Vinicius) e quem '
               'estiver na AGENT_WHITELIST do .env do worker ou cadastrado como equipe.', s)
    s = re.sub(r'\b55\d{10,11}\b', lambda m: m.group(0) if m.group(0) in SUPORTE else '<número>', s)
    s = re.sub(r'[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo)\.com', '<e-mail>', s)
    for antes, depois in [(r'incidente Glauco/CIGC', 'incidente com um cliente'), (r'\s*\(CIGC, Storydoing, etc\)', ''),
                          (r'CRM CIGC', 'CRM de um cliente'),
                          (r'\(Jeff, Claudinha, Eliana, Andréia, e futuros membros autorizados\)', '(equipe cadastrada)')]:
        s = re.sub(antes, depois, s)
    s = re.sub(r'(?m)^.*project_central_storydoing.*\n?', '', s)
    s = s.replace('persona Labastie', 'persona antiga').replace('CA2 Labastie 2025', 'campanha de referência')
    s = re.sub(r'\b(Claudinha|Janaína|Jeff Santos|Eliana|Andréia|Ritielle|Glauco)\b', 'pessoa da equipe', s)
    open(os.path.join(OUT_M, nome + '.md'), 'w', encoding='utf-8').write(s)
    m = re.search(r'(?m)^description:\s*(.+)$', s)
    t = re.search(r'(?m)^name:\s*(.+)$', s)
    indice.append(f'- [{(t.group(1) if t else nome).strip()}]({nome}.md) — {(m.group(1) if m else "").strip()[:140]}')
open(os.path.join(OUT_M, 'MEMORY.md'), 'w', encoding='utf-8').write('\n'.join(indice) + '\n')
print(f'memoria: {len(indice)} memória(s) de regras e procedimentos')

# ---------------- configurações de comportamento do worker ----------------
CONFIG = ['api_replies_panic', 'api_reply_debounce_ms', 'api_reply_history_limit', 'api_reply_max_tokens',
          'api_reply_model', 'linkedin_api_version']
con = sqlite3.connect('file:/opt/jeff-worker/data/worker.db?mode=ro', uri=True)
with open(os.path.join(INST, 'modelos', 'app_settings.tsv'), 'w') as o:
    o.write('# chave\tvalor (configuração de comportamento, sem segredo)\n')
    for k in CONFIG:
        r = con.execute('select value from app_settings where key=?', (k,)).fetchone()
        if r:
            o.write(f'{k}\t{r[0]}\n')
