#!/bin/bash
cd /opt/jeff-worker
scripts/wapi.sh POST /messages/private '{"to":"5511910075450","body":"Ótima tarde! Lembrete: hoje às 17h você tem reunião com a Viviane Zanoni sobre o programa de conselho (conselheiro do dono do Farias). Falta 1h. Se quiser, me manda o e-mail dela que eu já preparo o que precisar."}'
# Remove este cron após disparar
crontab -l | grep -v "remind-viviane-1600" | crontab -
