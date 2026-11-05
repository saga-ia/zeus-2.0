#!/usr/bin/env bash
# Atualiza o snapshot do Zeus 2.0 a partir da produção, mascara segredos e (com --push) envia pro GitHub.
# Uso: docs/atualizar-snapshot.sh [--push]
# Sem --push só sincroniza, mascara e mostra o resumo; nada sai do servidor.
set -euo pipefail
cd "$(dirname "$0")/.."
EXC=docs/rsync-exclude.txt

sync() { mkdir -p "$2"; rsync -a --delete --exclude-from="$EXC" "$1" "$2"; }
sync /opt/jeff-worker/   worker/
sync /opt/jeff-apps/     apps/
sync /opt/jeff-sites/    sites/
sync /opt/jeff-projects/ projects/
sync /opt/jeff-data/     data/jeff-data/
sync /opt/jeff-cigc/     data/jeff-cigc/
sync /opt/jeff-ideias/   data/jeff-ideias/
mkdir -p infra/zeus-backup infra/labastia-docker
cp /opt/zeus-backup/backup.sh infra/zeus-backup/
cp /root/labastia-setup/docker-compose.yml infra/labastia-docker/
rsync -a --delete /root/labastia-setup/postgres-init/ infra/labastia-docker/postgres-init/

# PM2 sem pm2_env (o env de cada processo tem segredos) e crontab
pm2 jlist | python3 -c '
import json,sys
d=json.load(sys.stdin)
out=[{"name":p.get("name"),"pm_id":p.get("pm_id"),"status":(p.get("pm2_env") or {}).get("status"),
      "cwd":(p.get("pm2_env") or {}).get("pm_cwd"),"script":(p.get("pm2_env") or {}).get("pm_exec_path"),
      "exec_mode":(p.get("pm2_env") or {}).get("exec_mode"),"instances":(p.get("pm2_env") or {}).get("instances")} for p in d]
json.dump(out,open("docs/pm2-snapshot.json","w"),ensure_ascii=False,indent=1)'
crontab -l > docs/crontab-snapshot.txt

# Mascara valores literais de variáveis com nome de segredo (TOKEN, SECRET, PASSWORD, API_KEY, JWT...)
python3 - <<'PY'
import os,re
NOME=r'[A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|SENHA|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|JWT|CLIENT_?SECRET|AUTH_?KEY)[A-Za-z0-9_]*'
ATRIB=re.compile(r'''(?i)(\b'''+NOME+r'''['"]?\s*[:=]\s*)(['"])([^'"\n$`{}]{8,})\2''')
SESSAO=re.compile(r'''(\bsecret\s*:\s*)(['"])([^'"\n]{8,})\2''')
EXT=('.js','.cjs','.mjs','.ts','.sh','.py','.yml','.yaml','.json','.conf','.ini','.toml','.env.example')
n=0
for raiz in ('worker','apps','sites','projects','data','infra'):
    for d,dirs,fs in os.walk(raiz):
        dirs[:]=[x for x in dirs if x not in ('.git','node_modules')]
        for f in fs:
            if not f.endswith(EXT): continue
            p=os.path.join(d,f)
            try: s=open(p,encoding='utf-8').read()
            except Exception: continue
            novo=ATRIB.sub(lambda m: m.group(1)+m.group(2)+'<REDACTED>'+m.group(2) if 'process.env' not in m.group(3) else m.group(0), s)
            novo=SESSAO.sub(lambda m: m.group(1)+m.group(2)+'<REDACTED>'+m.group(2), novo)
            if novo!=s:
                open(p,'w',encoding='utf-8').write(novo); n+=1
print(f'segredos mascarados em {n} arquivo(s)')
PY

# Modelos do instalador de cliente (subdomínios, PM2, .env sem valores, agentes e skills)
bash instalador/gerar-modelos.sh

git add -A
# Trava final: padrões de chave conhecidos no que vai ser commitado
if git diff --cached -U0 | grep -E '^\+' | grep -qE '(EAA[A-Za-z0-9]{40,}|IGAA[A-Za-z0-9]{40,}|sk-(proj-|ant-)?[A-Za-z0-9_-]{30,}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{30,}|xox[bp]-[A-Za-z0-9-]{20,}|\$aact_[A-Za-z0-9_]{20,}|WPL_AP1\.[A-Za-z0-9./=]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY)'; then
  echo "ABORTADO: ainda há padrão de chave no que seria commitado. Rode: git diff --cached | grep -nE '<padrão>'" >&2
  git reset -q
  exit 1
fi
git diff --cached --stat | tail -1
if [ "${1:-}" = "--push" ]; then
  git commit -q -m "snapshot $(date +%Y-%m-%d): produção atualizada, segredos mascarados"
  git push -q origin main
  echo "enviado: $(git log -1 --format='%h %s')"
fi
