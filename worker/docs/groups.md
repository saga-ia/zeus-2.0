# Gestão de grupos WhatsApp

## Listar e inspecionar
```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /groups | jq '.groups[] | {id, name, participants}'
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /groups/<GROUP_JID>/participants | jq
```

## Participantes
```bash
# Adicionar
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /groups/<GROUP_JID>/participants \
  '{"participants":["55XXXXXXXXXXX"]}'

# Remover
/opt/labastia/whatsapp-worker/scripts/wapi.sh DELETE \
  /groups/<GROUP_JID>/participants/55XXXXXXXXXXX@c.us

# Promover admin
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST \
  /groups/<GROUP_JID>/participants/55XXXXXXXXXXX@c.us/promote

# Rebaixar
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST \
  /groups/<GROUP_JID>/participants/55XXXXXXXXXXX@c.us/demote
```

## Criar / editar
```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /groups \
  '{"name":"Nome","participants":["55XXXXXXXXXXX","55YYYYYYYYYYY"]}'

/opt/labastia/whatsapp-worker/scripts/wapi.sh PATCH /groups/<GROUP_JID>/name \
  '{"name":"Novo nome"}'

/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /groups/join \
  '{"invite":"https://chat.whatsapp.com/CODIGO"}'
```

## Grupo oficial da equipe
- JID em `app_settings.internal_team_group_jid`.
- Quando entro em grupo novo → Jeff recebe DM. Se Jeff confirma "esse é o grupo da equipe", o JID é salvo e quem entrar fica auto-autorizado (Fase 2 congela).
- Sair do grupo revoga autorização automaticamente.
- Registro manual: `UPDATE app_settings SET value='<JID>' WHERE key='internal_team_group_jid';`
