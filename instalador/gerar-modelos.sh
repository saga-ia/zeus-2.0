#!/usr/bin/env bash
# Atualiza instalador/modelos/ e instalador/claude/ a partir da produção (servidor do Jeff).
# Não grava nenhum valor secreto: só nomes de chave, placeholders e a lista de subdomínios.
# Chamado por docs/atualizar-snapshot.sh antes do commit. Pode rodar sozinho também.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"
ZONA="jefersonhenrike.com"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

/opt/jeff-worker/scripts/npm.sh hosts > "$TMP/hosts.json"
pm2 jlist > "$TMP/pm2.json"
python3 -I instalador/lib/gerar_modelos.py "$REPO" "$ZONA" "$TMP/hosts.json" "$TMP/pm2.json"

# Agentes e skills do Claude Code (sem memória, sem credenciais, sem histórico)
mkdir -p instalador/claude
rsync -a --delete --exclude='*.bak*' --exclude='* *' /root/.claude/agents/ instalador/claude/agents/
rsync -a --delete --exclude='node_modules/' --exclude='*.bak*' /root/.claude/skills/ instalador/claude/skills/
cp /root/.claude/CLAUDE.md instalador/claude/CLAUDE.md
echo "claude: $(ls instalador/claude/agents | wc -l) agentes, $(ls instalador/claude/skills | wc -l) skills"
