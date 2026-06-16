---
name: Fase 2 aplicada — 7 tabelas agencia_* no worker.db
data: 2026-05-12
tipo: implementacao
---

# Decisao: Fase 2 aplicada em producao

## Contexto

Plano da Fase 2 (banco da agencia) aprovado por Jeff. Adicionar 7 tabelas com prefixo `agencia_` ao `worker.db` existente, sem alterar nada.

## Execucao

1. Backup: `worker.db.bak-20260512-fase2` (113 MB) em `/opt/jeff-worker/data/`.
2. Draft do SQL revisado por Jeff em `decisoes/2026-05-12_schema-fase2-DRAFT.sql`.
3. Copiado pra `/opt/jeff-worker/src/db/migrations/012_agencia.sql`.
4. Tentativa via `npm run migrate` falhou por bug pre-existente de circular require (ver pendencia abaixo).
5. Aplicado via `pm2 stop whatsapp-worker agent-runner` + `node -e "require('./src/db')"` (caminho normal que o worker usa quando sobe) + `pm2 start`.
6. Validado: 7 tabelas existem, `schema_migrations` linha 12 presente, worker voltou online.

## Tabelas criadas

- agencia_clientes (cadastro vivo de cliente)
- agencia_interacoes (msgs in/out por cliente)
- agencia_tarefas (o que esta aberto)
- agencia_entregaveis (pecas que a Alpha entrega)
- agencia_eventos_externos (webhooks Asaas/ZapSign/IG)
- agencia_aprovacoes_pendentes (fila vermelha da Fase 5)
- agencia_acoes_log (auditoria pra Fase 6)

14 indices criados pra acesso rapido.

## Pendencia tecnica — pra Smith resolver

**Bug:** `npm run migrate` quebra com `TypeError: require(...).run is not a function` em `src/db/index.js:29`.

**Causa:** circular require. Quando migrate.js eh entry point, ele carrega `migrations.js` primeiro, que requer `index.js`, que ainda tenta carregar `migrations` (linha 29) que esta em loading e retorna module.exports vazio.

**Workaround atual:** rodar `node -e "require('./src/db')"` (carrega index.js primeiro, ciclo se resolve).

**Fix sugerido pra Smith:** em `src/db/index.js`, mover a chamada `require('./migrations').run()` pra fora do flow de import; e/ou em `src/db/migrations.js`, lazy-require `db` dentro da funcao `run()` em vez de no topo do arquivo.

## Impacto

- Fase 2 concluida sem perda de dados.
- Liberou Fases 3, 4, 5, 6 que dependem dessas tabelas.
- worker.db cresceu de 113 MB pra ~113 MB (tabelas vazias, indices vazios — overhead minimo).
- Tempo fora do ar: ~30 segundos.

## Proximo passo

Conforme plano:
- Fase 3 vai preenchendo tools/classes/modelo dos agentes C1 conforme dor real (on-demand).
- Fase 4 (triggers externos) pode comecar — primeiro candidato: webhook Asaas escrevendo em `agencia_eventos_externos`.
