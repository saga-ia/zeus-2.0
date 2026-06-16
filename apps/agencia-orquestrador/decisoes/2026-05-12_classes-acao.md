---
name: Classes verde/amarelo/vermelho dos agentes
data: 2026-05-12
tipo: design / Fase 5.1
status: DRAFT — aguardando revisao do Jeff
---

# Classes de acao — Fase 5.1

Toda acao de agente cai em uma das tres classes:

- **Verde:** agente executa sozinho, sem avisar. Tipico de leitura/analise/rascunho.
- **Amarelo:** agente executa **e** notifica Jeff via WhatsApp ("ja fiz X"). Tipico de mudanca em sistema interno.
- **Vermelho:** agente **NAO** executa. Insere em `agencia_aprovacoes_pendentes`, dispara DM Jeff. So executa depois que Jeff responder `ok N`.

Regra de ouro: **na duvida, escalar a classe** (verde → amarelo, amarelo → vermelho).

---

## ZEUS (orquestrador + secretaria executiva)

> **Regra mestra do ZEUS (definida por Jeff 2026-05-12):** ZEUS nao tem historico ativo de cliente ainda. Para **qualquer mensagem recebida** — mesmo com historico de conversa anterior — ZEUS deve, antes de responder:
>
> 1. Verificar se o remetente esta cadastrado em `agencia_clientes`.
> 2. **Se sim:** ler quais acessos esse cliente tem e quais informacoes pode receber. Responder dentro desse nivel.
> 3. **Se nao:** tratar como **lead**. Acionar fluxo de atendimento a lead (a definir — ver "Pendencias relacionadas").

### Verde
- Consultar `agencia_clientes` pra identificar se contato eh cliente cadastrado e qual seu nivel de acesso.
- Responder duvida operacional ao Jeff/Vinicius (whitelist).
- Consultar banco, ler tabela, gerar SQL de leitura.
- Agendar lembrete pra si mesmo.
- Ler email/calendar/drive/sheets via `scripts/google.sh`.
- Sumarizar conversa, gerar historico.
- Identificar contato (consultar `contact_aliases`).
- Verificar status de servico (pm2 list, log, health).

### Amarelo
- Responder pessoa **cadastrada em `agencia_clientes`** dentro do nivel de acesso definido pra ela.
- Marcar/desmarcar evento na agenda do Jeff.
- Mudar status de tarefa em `agencia_tarefas` (aberta → em_andamento → concluida).
- Criar tarefa interna nova.
- Notificar parceiro humano (C2) sobre algo ja combinado.
- Atualizar contato em `contact_aliases`.
- Iniciar fluxo de qualificacao de lead (apos confirmar que contato **nao** esta em `agencia_clientes`).

### Vermelho
- Responder pessoa **nao cadastrada em `agencia_clientes`** sem antes ter executado o fluxo de qualificacao de lead.
- Passar informacao de cliente **acima** do nivel de acesso definido pra ele.
- Criar/cancelar evento na agenda envolvendo terceiro.
- Enviar mensagem em nome do Jeff a alguem **fora da whitelist** sem fluxo definido.
- Mudar fase de cliente no funil (`agencia_clientes.fase_funil`).
- Gravar memoria nova (regra atual ja vigente).
- Acessar dados sensiveis de cliente (financeiro, contrato, dados pessoais).
- Cadastrar novo parceiro humano em `jeff_team`.

---

## Sobral (trafego Meta + Google Ads)

### Verde
- Analisar dado de campanha existente.
- Sumarizar relatorio de periodo (dia/semana/mes).
- Comparar com benchmark global / docs Meta+Google.
- Sugerir mudanca (sem aplicar) — vira recomendacao no relatorio.
- Ler doc da Meta/Google em ingles e trazer insight.
- Gerar analise sob demanda no dashboard.

### Amarelo
- Salvar relatorio no Drive da Alpha (pasta correta).
- Gerar criativo de imagem/video como **rascunho** (nao publica).
- Identificar verba mal alocada e marcar como pendencia em `agencia_tarefas`.
- Anexar diagnostico a uma campanha (anotacao, nao mudanca).

### Vermelho (regra ja vigente em CLAUDE.md do worker)
- Subir nova campanha.
- Pausar / reativar campanha existente.
- Editar campanha (criativo, verba, publico, conjunto de anuncios).
- Aprovar criativo pra publicacao.
- Mudar verba diaria acima de 10%.
- Alterar conta de anuncios (BM, CTWA, conversao).

---

## Maicon (estrategista de conteudo)

### Verde
- Pesquisar concorrente na web (WebSearch/WebFetch).
- Sumarizar referencias encontradas.
- Mapear audiencia (perfil, dor, desejo, linguagem).
- Buscar dado em rede social publica.
- Gerar analise arquetipica e psicologica.
- Sugerir tom/cor/forma de conteudo.

### Amarelo
- Publicar mapa de audiencia no Drive da Alpha.
- Compartilhar pesquisa com Icaro (encaminhar arquivo).
- Criar template de conteudo (rascunho, sem publicar).
- Anotar diagnostico em `agencia_entregaveis` (status `em_revisao`).

### Vermelho
- Publicar conteudo em rede social (post, story, reel).
- Enviar mensagem em DM (IG/WPP) em nome da Alpha ou do cliente.
- Comprar ou ativar ferramenta paga (assinatura, API paga).
- Acessar conta de cliente em rede externa.

---

## Icaro (copywriter)

### Verde
- Rascunhar copy.
- Gerar variacoes A/B/C.
- Sugerir headline.
- Ler swipe file / referencia.
- Adaptar copy existente.
- Analisar copy de concorrente.

### Amarelo
- Publicar copy em site **interno** (nao site de cliente).
- Salvar copy em Drive.
- Compartilhar copy com Maicon ou Sobral.
- Anotar copy em `agencia_entregaveis`.

### Vermelho
- Copy que vai ao ar como **anuncio pago** (Meta, Google).
- Copy em pagina de captura/venda **ao vivo**.
- Headline de campanha em producao.
- Copy publicada em conta de cliente (site, email marketing).
- Copy em comunicacao direta com lista de cliente (broadcast).

---

## Smith (engenharia + ciber seguranca)

### Verde
- Ler codigo (todos os apps).
- Gerar relatorio de auditoria/seguranca.
- Sugerir patch (sem aplicar).
- Rodar lint/audit local.
- Identificar bug e documentar.
- Propor refatoracao com prioridade.
- Escrever script de teste/diagnostico.

### Amarelo
- Aplicar patch em **branch de desenvolvimento** (nunca em main/master direto).
- Criar PR ou diff pra Vinicius revisar.
- Adicionar log/telemetria que **nao muda comportamento**.
- Atualizar dependencia minor nao-critica em ambiente de teste.

### Vermelho
- Aplicar patch em **producao** (worker, agent-runner, paineis ativos).
- Rodar migration de banco.
- `pm2 stop/restart` em producao.
- `apt install` global ou `npm install -g`.
- Mexer em `/etc`, nginx, systemd, NPM, Cloudflare DNS.
- Alterar `.env`, segredos, tokens.

---

## Fluxo de aprovacao (referencia rapida pra Fase 5.2)

1. Agente decide que a acao eh vermelha.
2. Chama `scripts/agencia-aprovacao.sh criar "<agente>" "<acao>" '<payload_json>'`.
3. Script insere em `agencia_aprovacoes_pendentes` (status=`pendente`) e dispara DM:
   ```
   Pedido N: <acao>
   Agente: <agente>
   Contexto: <contexto>
   Responda: ok N | nao N <motivo>
   ```
4. Jeff responde.
5. ZEUS (worker CLAUDE.md regra nova) detecta `ok N` ou `nao N`, chama `aprovar N` ou `rejeitar N <motivo>`.
6. Se aprovada: agente executa, depois chama `concluir N "<resultado>"`. ZEUS avisa Jeff.
7. Se rejeitada: ZEUS avisa o agente que pediu.

## Excecoes ja conhecidas

- **Familia do Jeff** (Ritielle, Joao Gabriel, Mayara): mensagem deles eh tratada como prioridade maxima. ZEUS responde curto + DM imediata pro Jeff. Nao passa pelo fluxo de aprovacao (eh emergencia).
- **Auto-resposta nao-whitelist (Fase 2 do worker, ja existente):** continua vigente, nao se confunde com classes daqui.
- **Hard-blocks globais** (`.env`, `rm -rf` fora `/tmp`, etc): nem chegam a virar pedido vermelho. Bloqueio direto.

## Pendencias relacionadas

1. **Procedimento de atendimento a lead** — definir:
   - Que perguntas o ZEUS faz a um lead (qualificacao)
   - Quais respostas o ZEUS pode dar (escopo permitido)
   - Quando lead vira cliente (criterios + acao em `agencia_clientes`)
   - Quando lead eh descartado
   - Quando lead **sempre** escala pro Jeff (ex: pediu reuniao, pediu proposta, pediu preco)
   - Tom e voz (PT-BR, sem em-dashes, sem "bom dia/boa noite", etc — ja em CLAUDE.md global)
   - Status: pendente. Fazer em sessao dedicada antes do ZEUS atender publico real.

2. **Niveis de acesso por cliente** — `agencia_clientes` tem campo `contexto` (texto livre) que pode armazenar o nivel inicialmente. Decidir se precisa campo estruturado dedicado quando dashboard do cliente for ao ar. Ate la, registrar nivel no campo `contexto` em formato livre.

3. **Confirmacao desta tabela** — Jeff aprovou em 2026-05-12 com 4 ajustes (verba 10%, Maicon sempre vermelho, familia excecao, ZEUS sempre verifica `agencia_clientes`). Pode mover pra `ESTRUTURA.md` quando estabilizar.
