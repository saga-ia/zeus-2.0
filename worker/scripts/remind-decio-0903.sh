#!/bin/bash
cd /opt/jeff-worker
scripts/wapi.sh POST /messages/private '{"to":"5511910075450","body":"Ótimo dia! Lembrete: hoje às 9h você tem reunião com o Décio (aluno do Farias - Plano do Dono). Bora se preparar!"}'
# Remove este cron após disparar
crontab -l | grep -v "remind-decio-0903" | crontab -
