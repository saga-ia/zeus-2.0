# Cartão de passagem entre agentes

Todo agente (Zeus, Maicom, Ícaro, Nina, Gustavo, Talles, Sobral, Smith, Otávio, Tomé) termina toda entrega que vai pra outro agente, ou pro Jeff aprovar, com este bloco. Evita "telefone sem fio" e entrega sem prova.

```
OBJETIVO: o que esta etapa precisava resolver (1 linha)
ENTRADA: o que recebi (arquivos, briefing, contexto.md, dados) com caminho
SAÍDA: o que criei ou alterei, com caminho
PROVA: comando, print, número ou fonte que confirma (não "testei", e sim O QUE e ONDE)
PENDÊNCIAS: o que ainda impede aprovar e o que depende do cliente/Jeff
PRÓXIMO: quem recebe e por quê (agente, ou "Jeff aprovar")
```

Regras:
- **PROVA vazia = entrega não terminada.** Copy: fonte de cada número (§7 do contexto). Site/app: caminho dos prints do `site-check` ou relatório do Tomé. Análise: comando/script que gerou o número.
- **PENDÊNCIAS honestas:** o que foi inferido e não confirmado entra aqui.
- O próximo agente **lê o cartão antes de começar** e devolve se a PROVA não se sustenta.
- No WhatsApp pro Jeff: versão curta em lista (sem travessão), só OBJETIVO, SAÍDA, PROVA (link/print) e PENDÊNCIAS.

Fluxos comuns:
- Site/landing: briefing → `site-premium` → **Tomé** → Jeff.
- App novo/alterado: build → **Smith** (`smith-auditoria-ia`) → **Tomé** → Jeff.
- Conteúdo: Nina → Gustavo/CarrosseIA → Nina (pacote) → Jeff ("vai").
- Comercial: Otávio (proposta) → Ícaro (copy, se precisar) → Tomé (se for página) → Jeff.
