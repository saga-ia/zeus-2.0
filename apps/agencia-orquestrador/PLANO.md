# Plano: agencia Jefferson Henrike orquestrada por agentes

Plano apresentado e aprovado por Jeff em 2026-05-12. Detalhamento longo na conversa original; aqui fica o sumario executivo + decisoes confirmadas.

## Principios

- Cada fase entrega valor sozinha. Parar em qualquer fase deixa a operacao melhor.
- Confirmacao a cada fase antes de seguir.
- Backup antes de mudanca destrutiva (marco zero: `versao 10`).
- Subagents construidos on-demand, nao especulativamente.

## Fases

### Fase 0 — Inventario (CONCLUIDA 2026-05-12)
Saida: `INVENTARIO.md` neste diretorio. Captura PM2 (18), crons (5), /opt (9 pastas), SQLite (28 tabelas), integracoes, bugs.

### Fase 1 — CLAUDE.md por projeto (EM ANDAMENTO)
Cada pasta ativa em `/opt/` ganha CLAUDE.md proprio (max 200 linhas, denso).

**Ondas:**
- 1A — worker (ja existia, marcado como fonte da verdade) + agencia-orquestrador + template global
- 1B — apps de cliente: alpha, cigc-clientarea, cigc-comercial, farias-clientarea, ebc-campaign, onboarding
- 1C — apps internos: asaas-dashboard, ads-dashboard, meta-dashboard, vps-monitor, sistemas, google-oauth, financeiro
- 1D — apps de canal: instagram-webhook, zapsign-webhook, disparador, zeus-contacts, agente-smith, aula-agente
- 1E — sites e zeus-backup

Criterio: abrir Claude Code em qualquer pasta e em 30 segundos saber o suficiente pra ser util.

### Fase 2 — Banco da agencia
Tabelas novas no mesmo `worker.db`, prefixo `agencia_`:

- `agencia_clientes` (id, nome, fase_funil, canal_origem, dono, created_at, updated_at)
- `agencia_interacoes` (id, cliente_id, direcao, canal, mensagem, autor, ts)
- `agencia_tarefas` (id, cliente_id, titulo, status, dono, vencimento, created_at)
- `agencia_entregaveis` (id, cliente_id, tipo, status, link_drive, prazo)
- `agencia_eventos_externos` (id, fonte, tipo, payload_json, processado, ts)
- `agencia_aprovacoes_pendentes` (id, agente, acao, payload_json, status, ts) — usada na Fase 5
- `agencia_acoes_log` (id, agente, acao, motivo, resultado, ts) — usada na Fase 6

Migration versionada em `src/db/migrations/`. Backup do db antes.

### Fase 3 — Subagents on-demand
Nao listar agentes antecipadamente. Cada subagent so existe quando Jeff descrever uma dor concreta. Arquivo em `/root/.claude/agents/<slug>.md`. Cada criacao gera entrada em `decisoes/`.

### Fase 4 — Triggers externos
Webhooks ja existentes (Asaas, ZapSign, IG) passam a gravar em `agencia_eventos_externos` e disparam agente correspondente. Crons novos (resumo matinal 7h BRT, varredura horaria de tarefas) adicionados via `crontab -e` com OK do Jeff.

Pre-requisito: `jeff-zapsign-webhook` so religar quando houver contrato real pra assinar.

### Fase 5 — Classes verde/amarelo/vermelho
Cada acao de cada subagent classificada. Fila `agencia_aprovacoes_pendentes` ja prevista na Fase 2. Aprovacao via "ok N" no WhatsApp.

### Fase 6 — Painel
Subdominio `agencia.jefersonhenrike.com`. App Node em `/opt/jeff-apps/agencia-painel/`. Mostra:

- Ultimas 50 acoes (agencia_acoes_log)
- Tarefas em aberto
- Aprovacoes pendentes
- Kanban de leads por fase do funil

### Fase 7 — Casos de teste (continuo)
`tests/` neste projeto. Cada erro corrigido vira caso. Toda mudanca de prompt de agente roda os casos antes de subir.

## Cronograma

| Semana | Fase |
|--------|------|
| 1 (atual) | 0 concluida + 1A |
| 2 | 1B + 1C |
| 3 | 1D + 1E + 2 (migrations) |
| 4 | 3 (primeiros subagents conforme dor aparecer) |
| 5 | 4 + 5 |
| 6 | 6 (painel) |
| 7+ | 7 (continuo) |

Nao e compromisso, e parametro. Acelera o que for trivial, pausa o que nao fizer sentido.

## Decisoes confirmadas (Jeff em 2026-05-12)

- Pasta do projeto: `/opt/jeff-apps/agencia-orquestrador/`
- Banco: SQLite mesmo arquivo `worker.db`, tabelas com prefixo `agencia_`
- zapsign-webhook: religar so quando houver contrato real
- Limpeza CIGC: tarefa manual fora da Fase 1
- Subagents: on-demand, sem pre-listagem
- Backup v10 como marco zero (gatilho `versao 10`)
