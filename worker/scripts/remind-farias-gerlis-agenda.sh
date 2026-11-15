#!/bin/bash
cd /opt/jeff-worker
scripts/wapi.sh POST /messages/private '{"to":"5511910075450","body":"lembrete que você pediu: hora de mandar o invite de agenda pro Farias e pro Gerlis bloqueando a agenda do Farias no dia 27"}'
crontab -l | grep -v "remind-farias-gerlis-agenda" | crontab -
