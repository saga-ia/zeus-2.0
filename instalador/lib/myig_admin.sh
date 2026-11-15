#!/bin/bash
# Cria o admin 1 do myIG (zeuschatig) se ainda não existe. A aba Instagram da Central entra no myIG como esse
# usuário (instagram-myig.js cria o token direto no banco), então sem ele a aba não abre e os agentes de DM não ligam.
# A senha é aleatória e não é guardada: o acesso é sempre pela Central. Idempotente.
# Uso: bash myig_admin.sh <respostas.json>
set -u
MYIG=/opt/jeff-apps/zeuschatig
DB="$MYIG/data/zeuschatig.db"
[ -f "$MYIG/scripts/seed-admin.js" ] || { echo "myIG não instalado: nada a fazer"; exit 0; }
[ -d "$MYIG/node_modules" ] || { echo "myIG sem node_modules"; exit 1; }
if [ -f "$DB" ] && [ -n "$(sqlite3 "$DB" 'SELECT id FROM admin_users LIMIT 1' 2>/dev/null)" ]; then echo "myIG: admin já existe"; exit 0; fi
EMAIL="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("email", ""))' "${1:-/dev/null}" 2>/dev/null)"
[ -n "$EMAIL" ] || EMAIL="admin@localhost"
mkdir -p "$MYIG/data"
cd "$MYIG" && node scripts/seed-admin.js "$EMAIL" "$(openssl rand -hex 16)" >/dev/null && echo "myIG: admin criado ($EMAIL)"
