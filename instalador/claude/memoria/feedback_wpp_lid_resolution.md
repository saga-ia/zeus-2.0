---
name: WhatsApp @lid migration — sempre resolver JID via getNumberId antes de enviar
description: WhatsApp tá migrando contatos pro formato @lid (Local ID). Envio direto pra @c.us de contato novo falha com "No LID for user". Solução: resolver via client.getNumberId(phone) antes de cada envio.
type: feedback
originSessionId: 7c9aaecc-d849-4c43-b9ef-71d94b9d9d1b
---
**Bug observado em 2026-04-26**: ao tentar enviar mensagem da Mayara (worker SDR) pra um lead novo no DDD 62 (Goiás), erro silencioso *"No LID for user"* — vindo direto do whatsapp-web.js. Mesma falha pode acontecer com qualquer phone que nunca foi resolvido pelo cliente.

**Causa**: WhatsApp tá migrando contatos pro novo identificador `@lid` (Local ID, hash interno). O `@c.us` clássico (jid baseado no número) está sendo deprecado pra contatos não-cadastrados. Quando você tenta `client.sendMessage('<número>@c.us', ...)` pra um contato que o servidor já mapeou pra @lid, o sendMessage falha.

**Solução implementada** em `/opt/labastia/sdr-imersao/src/queue/send-queue.js` (mesma técnica deve ir pro worker principal se aparecer lá):

```js
if (chatId.endsWith('@c.us')) {
  const phone = chatId.replace('@c.us', '');
  const numId = await client.getNumberId(phone); // resolve via WhatsApp servers
  if (numId?._serialized && numId._serialized !== chatId) {
    chatId = numId._serialized; // usa @lid se necessário
  }
}
```

**Caso confirmado** (2026-04-26 18:41):
- input: `<número>@c.us` (Vinícios, Anápolis)
- resolved: `42700783001711@lid`
- status: enviado

**Quando aplicar**:
- Em qualquer fluxo onde o phone vem de fora do WhatsApp (formulário, importação CSV, indicação manual) e o contato pode não estar cacheado.
- NÃO precisa pra responder mensagem que JÁ chegou — o JID original do `from` da inbound já tá resolvido.

**Custo**: 1 chamada extra de `getNumberId` por envio inicial (50-200ms). Aceitável dado a confiabilidade que ganha.
