'use strict';
// DEPRECATED 2026-07-21 (Smith).
//
// Este script foi retirado. Ele bypassava o splitter [[BREAK]] e a dedupe
// de saida, gerando resposta DUPLICADA para o mesmo lead (caso Renata,
// 21/07/2026). O caminho correto agora eh:
//
//   - Deixar o pipeline natural rodar (on('message') do waManager) OU
//   - Chamar POST /api/conversations/reply (que agora passa por sendText()
//     publico com splitter + dedupe janela 5 min).
//
// O arquivo original foi preservado em:
//   scripts/smith_force_renata_reply.js.DEPRECATED_20260721
//
// Se precisar reforcar envio manual sem duplicar, use a UI de Conversas
// ou chame POST /api/conversations/reply direto.

console.error('[smith] script DEPRECATED — ver comentario no topo. Abortando.');
process.exit(2);
