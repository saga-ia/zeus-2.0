# Referência rápida — `scripts/wapi.sh`

Wrapper HTTP do worker em `127.0.0.1:3002`. Sempre via wapi.sh (não chamar wweb.js direto — trava sem aviso).

## Envio
```bash
# Texto
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /send-message \
  '{"chatId":"<CHAT_ID>","message":"<texto>"}'

# Áudio TTS Edge (pt-BR-AntonioNeural — só whitelist)
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /agent/speak \
  '{"chatId":"<CHAT_ID>","text":"<texto>"}'

# Resposta com quote
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /messages/<MESSAGE_ID>/reply \
  '{"chatId":"<CHAT_ID>","body":"<texto>"}'

# Reaction emoji
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /messages/<MESSAGE_ID>/react \
  '{"chatId":"<CHAT_ID>","emoji":"👍"}'

# Mídia base64
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /send-media \
  '{"chatId":"<CHAT_ID>","base64":"<B64>","mimetype":"image/jpeg","caption":"opcional"}'

# Áudio bruto
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /send-audio \
  '{"chatId":"<CHAT_ID>","base64":"<B64>","asPtt":true}'

# DM por phone
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /messages/private \
  '{"to":"55XXXXXXXXXXX","body":"texto"}'

# Mensagem em grupo
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /messages/group \
  '{"groupId":"<GROUP_JID>","body":"texto"}'
```

## Regras de TTS humanizado
- Sem emojis, sem markdown, sem URLs (mando link em texto separado).
- Siglas que não viram palavra: soletrar ou reformular ("a interface" em vez de "A P I").
- ≤30s (~75 palavras). Conteúdo longo = áudio curto + texto detalhado.
- Tom natural. "Então, olha só, fiz aquilo que você pediu..." em vez de "Tarefa executada com sucesso."
- Não dizer "olá tudo bem" toda hora — entrar direto.

## Histórico
```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET "/history?chatId=<CHAT_ID>&limit=50"
```

## Webhooks
```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /webhooks | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /webhooks \
  '{"url":"https://endpoint.com/wh","events":"*","token":"opcional"}'
/opt/labastia/whatsapp-worker/scripts/wapi.sh DELETE /webhooks/<ID>
```
Eventos: `message.received`, `message.sent`, `message.ack`, `message.edit`.

## Contatos
```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /contacts | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /contacts/check '{"number":"55XXXXXXXXXXX"}'
```
