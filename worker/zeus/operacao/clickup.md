# ClickUp — operação no Zeus

Workspace **ZEUS** (`90171241301`). Você (Jeff, `302403853`, owner) e Vinicius (`55079266`, member). Vinicius é responsável padrão quando o Jeff cria task sem citar quem.

## Estrutura
3 spaces:
- **Alpha Clientes** (`90175700186`) — 1 folder por cliente, listas: Diagnóstico, Conteúdo, Tráfego, Criativos, Entregas. Statuses: pendente → em progresso → aguardando cliente → concluído.
- **Operação Zeus** (`90175700542`) — folders Desenvolvimento (Backlog, Sprint Atual, Bugs, Melhorias, Ideias) e Infra (Servidor, Integrações, Backups & Memória).
- **Jeff Pessoal** (`90175700543`) — listas folderless: Hoje, Semana, Aguardando terceiros, Recorrentes.

IDs de spaces, folders e users ficam em `app_settings` chaves `clickup_*`.

## Helper
`/opt/jeff-worker/scripts/clickup.sh` — comandos: `whoami`, `teams`, `spaces`, `folders <space>`, `lists <folder>`, `lists-folderless <space>`, `tasks <list>`, `task <id>`, `team-tasks`, `create <list> <name> [json]`, `update <id> <json>`, `status <id> <name>`, `close <id>`, `comment <id> <texto>`, `due-today`, `overdue`, `assigned <user_id>`, `create-space|folder|list|list-folderless`, `archive-list|folder`, `rename-space`, `raw <method> <path> [body]`. Helper já adiciona `due_date_time:true` automático em `create` quando passa `due_date`.

## Sincronização
`/opt/jeff-worker/scripts/clickup-sync.py` roda a cada 5min (cron). Usa `/team/{id}/task?date_updated_gt=...` paginado. Popula `clickup_tasks_cache`, detecta mudanças de status/due_date e grava em `clickup_events`. State (`last_sync_ms`) em `clickup_state`.

## Cobrança automática
`/opt/jeff-worker/scripts/clickup-cobranca.py` roda 4x/dia em BRT (8h, 11h, 14h, 18h = 11/14/17/21 UTC). Lê cache local, classifica por urgência (vencida grave/recente, vence hoje, vence 24h), monta digest WhatsApp e envia via `wapi.sh POST /messages/private`:
- **Pro Vinicius** (`5585991143501`): só tasks atribuídas a ele.
- **Pro Jeff** (`5585996170559`): tudo + resumo por responsável.
Loga em `clickup_chase_log`.

## Antes de criar tarefa — checklist obrigatório

Antes de rodar `clickup.sh create`, o Zeus precisa ter os campos abaixo. Se faltar algo dos **bloqueantes (1, 2, 3, 5)**, NÃO cria a task. Pergunta no WhatsApp pro Jeff (ou Vini, quem pediu) e só dispara o `create` depois que voltar a resposta. Se faltar **não-bloqueante (6, 7, 8, 9)**, cria com default e avisa no retorno o que faltou.

1. **Título claro** (bloqueante) — verbo + objeto + contexto. Ex: "Configurar AEM da BM Alpha Cliente X", não "AEM".
2. **Descrição detalhada** (bloqueante) — o que precisa ser feito, passo a passo ou resultado esperado. Sem isso vira "configurar X" e a pessoa não sabe por onde começar.
3. **Critério de "feita"** (bloqueante) — como saber que tá pronto. Ex: "evento Purchase chegando no Events Manager com EMQ ≥7".
4. **Responsável** — Jeff, Vini ou outro. Se quem pediu não citar, default Vini, mas confirma na resposta ("vou pôr no Vini, ok?").
5. **Prazo com data E hora** (bloqueante) — usar `due_date_time:true`. Se falar só "sexta", perguntar "sexta que horas?". Se falar "amanhã", confirmar a hora.
6. **Prioridade** — urgent(1)/high(2)/normal(3)/low(4). Default normal se não citar.
7. **Contexto/cliente** — se é de cliente Alpha, qual? Define folder e lista no space Alpha Clientes.
8. **Links/refs** — print, doc, conversa, painel envolvido. Se foi mencionado algo na conversa do WhatsApp, COLA o link/print na descrição.
9. **Dependências** — depende de outra task? cita o id no campo de descrição ou via `linked_tasks`.

Forma de perguntar (1 msg só, agrupando o que falta): "Pra criar essa task preciso de: (a) descrição do que exatamente fazer, (b) como saber que tá pronto, (c) prazo com hora. Manda que já crio."

NUNCA criar task com descrição vazia ou só repetindo o título.

## Comandos no WhatsApp (o agente Zeus deve interpretar)
Quando o Jeff falar:
- "cria tarefa pro Vinicius: X até sexta" → `clickup.sh create <list_id_apropriado> "X" '{"assignees":[55079266],"due_date":<ms>}'`. Default list = Operação Zeus / Backlog (id `901713809668`) se não citar contexto. Se citar "bug", vai pra Bugs (`901713809670`). Se citar "melhoria", Melhorias (`901713809671`). Se citar cliente, criar folder/lista em Alpha Clientes.
- "cria tarefa minha: X" → atribui a Jeff (302403853), default list = Jeff Pessoal / Hoje (`901713809676`).
- "como tá a lista do Vini?" → `clickup.sh assigned 55079266`
- "o que vence hoje?" → `clickup.sh due-today`
- "o que tá atrasado?" → `clickup.sh overdue`
- "marca X como feita" → buscar task por nome no cache (LIKE), pegar id, `clickup.sh close <id>`
- "comenta na X: Y" → buscar id, `clickup.sh comment <id> "Y"`

## IDs úteis
- Workspace: 90171241301
- Spaces: Alpha Clientes 90175700186 | Operação Zeus 90175700542 | Jeff Pessoal 90175700543
- Folders Op Zeus: Desenvolvimento 90178832992 | Infra 90178832993
- Listas Op Zeus: Backlog 901713809668, Sprint 901713809669, Bugs 901713809670, Melhorias 901713809671, Ideias 901713809672, Servidor 901713809673, Integrações 901713809674, Backups & Memória 901713809675
- Listas Jeff Pessoal: Hoje 901713809676, Semana 901713809677, Aguardando terceiros 901713809678, Recorrentes 901713809679
- Users: Jeff 302403853 | Vinicius 55079266

## Tabelas SQLite
- `clickup_tasks_cache` — cache full de tasks (raw_json + colunas indexadas)
- `clickup_events` — log de mudanças (status_changed, due_changed) detectadas pelo poll
- `clickup_chase_log` — histórico de cobranças enviadas
- `clickup_state` — last_sync_ms

## Tratamento da resposta do Vinicius (Fase 2 — ATIVA)

Vinicius (5585991143501) **já está no AGENT_WHITELIST**, então toda mensagem dele dispara o agent-runner. Quando msg do Vini chegar, o Zeus DEVE:

1. Rodar `clickup.sh recent-chase 55079266 24` — lista as tasks que cobramos dele nas últimas 24h.
2. Comparar a resposta do Vini com essa lista usando heurística (nome de task mencionado, palavra-chave do contexto, ordinal "a primeira/segunda", etc).
3. Pra cada task identificada na resposta, postar comentário via `clickup.sh comment <task_id> "Resposta WhatsApp Vinicius: <fala_dele>" 55079266`.
4. Se ele indicar nova data ("entrego sexta", "amanhã 18h"), usar `clickup.sh update <task_id> '{"due_date":<ms>,"due_date_time":true}'` pra remarcar.
5. Se ele disser "tá pronto", "entreguei", "concluído", usar `clickup.sh close <task_id>`.
6. SEMPRE notificar o Jeff (5511910075450) com resumo do que foi atualizado, via `wapi.sh POST /messages/private '{"to":"5511910075450","body":"Vini respondeu sobre <task>: <ação tomada>"}'`.
7. Se a resposta do Vini for ambígua (não bater com nenhuma task), não atualiza nada e avisa Jeff perguntando o que fazer.

Comando útil de busca por texto: `clickup.sh search "palavra"` retorna tasks abertas com nome contendo "palavra".

## Webhook real-time (Fase 3)
Endpoint em `https://clickup.jefersonhenrike.com/webhook`. Eventos `taskCreated`, `taskUpdated`, `taskStatusUpdated`, `taskCommentPosted`, `taskAssigneeUpdated` caem na tabela `clickup_events` e podem disparar notificação imediata.

## Bridge ClickUp → Asaas (Fase 4)
Quando task com tag `asaas-cobranca` (ou nome contendo "cobrar", "cobrança", "pagamento") muda pra status `concluído` E tem custom fields `asaas_customer_id`/`asaas_value`/`asaas_due_date`, o `clickup-asaas-bridge.py` cria cobrança no Asaas via `asaas.sh create`. Se faltar dado, manda WhatsApp pro Jeff perguntando os detalhes.
