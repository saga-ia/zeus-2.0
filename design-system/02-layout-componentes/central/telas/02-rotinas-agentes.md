# Telas: Rotinas e Agentes

Documentação de leitura do front da Central (`/opt/jeff-apps/jeff-central/public`). Constantes e paleta: ver `../componentes-e-telas.md` e `tokens/zeus-central.css`. Números de linha são aproximados e referem-se ao estado de 16/10/2026. Abreviações: `index.html` = `public/index.html`.

## Regras comuns a todas as telas deste arquivo

- **Casca**: item do menu lateral em `sidebar()` (index.html ~904 e ~1060). Grupo "OPERAR E AUTOMATIZAR" contém `Rotinas` (navItem) e `Agentes` (navItem com chevron). O submenu de Agentes (`subItem`) tem 5 itens: Meus agentes, Agentes ZEUS, Equipes de agentes, Habilidades, Conhecimento. Tudo fica recuado 17px com borda esquerda `#E6E6EA`.
- **Roteamento**: `rotaFor()` (index.html ~337) monta a URL; `VALID_SCREENS` (~375) lista as telas; `RENDERERS` (~7504) liga cada tela à função.
- **Contêiner de página** (padrão): `padding:34px 40px 60px; max-width:1240px` (Conhecimento usa 1100px; telas de edição usam `26px 40px 60px`). Título `h1` em Space Grotesk 25 a 27px, peso 600, subtítulo em `#66666F`.
- **Celular (abaixo de 820px)**, regras globais do CSS em index.html ~71 a 110: barra superior fixa `#mob-top` (56px), menu lateral vira gaveta (`translateX`), margens de 40px viram 16px, grades com `minmax(23x a 28x px)` viram 1 coluna, grades de 3 e 4 colunas viram 2, tabelas ganham rolagem horizontal, painéis laterais com `flex:0 0 2xx` + `border-right` viram faixa horizontal rolável, e telas com `height:100vh` passam a `100dvh - 56px`. Em 1180px some `.ag-side`; em 760px some `.ag-sess` (index.html ~113).
- **Permissões**: `pode(id)` (index.html ~10661): dono/admin passa em tudo; senão vale o nível `total`, `equipe` (ou `leitura` quando pedido). `souAdmin()` libera Canais. Ids usados aqui: `criar-agente`, `criar-equipe-agentes`, `editar-equipe-agentes`, `excluir-equipe-agentes`, `compartilhar-agente`, `editar-zeus`. Não há tela de "sem permissão" dedicada: o botão simplesmente não é renderizado. A tela de Rotinas não consulta `pode()` (a confirmar se o backend bloqueia).
- **Selos de estado reutilizados**: `AG_TAG` (neutro), `AG_KIND` (marca), `TM_STATUS` (Na fila / Trabalhando / Concluído / Falhou / Cancelado, cores do quadro de estados do `componentes-e-telas.md`), `KB_STATUS`.
- **Confirmações destrutivas** usam `zConfirm(...)`; avisos simples usam `alert(...)`; toasts de Habilidades e Canais têm função própria (`toast` em habilidades.js, `cfgToast` nos canais).

---

## 1. Rotinas

- **Rota e menu**: `/rotinas`; "OPERAR E AUTOMATIZAR > Rotinas" (item de primeiro nível, ícone `ICONS.rotinas`).
- **Objetivo**: agendar pedidos que o ZEUS executa sozinho (diário, semanal, mensal, a cada X horas, uma vez) e entrega em Conversas, WhatsApp ou e-mail.
- **Origem**: `public/rotinas.js` (404 linhas), IIFE que sobrescreve `RENDERERS.rotinas` (~392). Em index.html há só um placeholder "Carregando rotinas..." (~7507). Funções: `page()` ~102, `vazio()` ~121, `modelos()` ~128, `card()` ~150, `historico()` ~187, `modal()` ~215, `salvar()` ~284, `rodar()` ~294, `abrirConversa()` ~315, `bind()` ~327. Constantes próprias (não usa `CFG_*`): `IN`, `LBL` (rótulo em caixa alta 11.5px), `BTN_PRI`, `BTN_SEC`, `BTN_MINI`, `CHIP`; cores locais ROXO, VERM, VERDE, CINZA.

### Layout
- Contêiner `padding:34px 40px 60px; max-width:1240px`, `id="rot-root"`.
- Cabeçalho em flex com quebra: coluna esquerda (eyebrow "OPERAR E AUTOMATIZAR" em roxo, `h1` "Rotinas" 25px, parágrafo de até 720px) e botão `BTN_PRI` "Nova rotina" (ícone plus) à direita.
- Corpo: aviso de erro (se houver), aviso de WhatsApp desconectado (se houver), lista vertical de cards (gap 12px), depois a galeria "Modelos prontos".
- Celular: regras globais; o cabeçalho quebra linha (`flex-wrap`), cards quebram em duas faixas (texto e ações) por `flex-wrap` e `min-width:240px`; modal vira coluna única porque as grades usam `minmax(220px,1fr)`.

### Abas e sub-abas
Não há abas. Seções: lista de rotinas, "Modelos prontos" (recolhível) e, dentro de cada card, "Histórico" (expansível).

### Componentes
- **Card da rotina** (`card()`): borda `#E6E6EA`, raio 16, fundo branco, padding 18x20; pausada fica com borda `#EFEFF1` e `opacity:.75`. Ícone 38px em quadrado roxo translúcido. Linha de chips (`CHIP`): quando roda (roxo translúcido), entrega (cinza `#F1F1F3`), `@agente`, `/habilidade`, e uma chip por ferramenta (contorno `#E6E6EA`, peso 500). Prompt completo em `pre-wrap` 13px. Linha de status com bolinha: roxo "Executando agora...", verde "Rodou há X", vermelho "Falhou há X", cinza "Nunca rodou"; depois "Próxima em X (data)" ou "Pausada"; contagem "N execuções, M com erro". Se último status = erro, mensagem em vermelho abaixo.
- **Ações do card**: `BTN_MINI` "Executar agora" (fica `opacity:.5` enquanto roda), "Histórico", "Editar", checkbox "Ativa/Pausada" (accent roxo), botão de lixeira em vermelho com borda `rgba(192,52,28,0.3)`.
- **Histórico** (`historico()`): lista de execuções em caixas `#FAFAFA` com borda `#F1F1F3`, raio 11. Cada uma: selo de status (Erro vermelho, OK verde, Rodando roxo), data/hora BRT (`fmtData`, fuso America/Sao_Paulo), duração (s ou min), origem ("manual" ou "agenda"), botões "Ver resposta/Esconder resposta" (se há saída; renderiza markdown via `mdToHtml` numa caixa branca) e "Abrir conversa" (se há sessão). Erro em vermelho; prévia de uma linha com reticências quando a resposta está fechada.
- **Galeria de modelos** (`modelos()`): cabeçalho clicável com chevron que gira 180 graus; 12 modelos em 4 categorias (Operação, Financeiro, Marketing, Pessoas e metas), cada categoria com rótulo em caixa alta 10.5px e grade `repeat(auto-fit,minmax(280px,1fr))`. Card do modelo: borda `#E6E6EA`, raio 13, ícone, nome, "Usar" em roxo, linha "quando · entrega · /habilidade", descrição. Aberta por padrão quando não há rotinas.
- **Modal Nova/Editar rotina** (`modal()`): ancorado no `<body>` (`#rot-modal-host`), fundo `rgba(23,23,26,0.45)`, z-index 80, caixa de 720px, raio 18, padding 26x28. Campos: Nome (input `IN`), "O que o ZEUS deve fazer" (textarea 4 linhas), Agente (select, padrão "ZEUS (padrão)", agentes fora do workspace marcados "(catálogo)"), Habilidade opcional (select com `optgroup` por grupo), Ferramentas (chips alternáveis; ativas ganham fundo roxo translúcido, borda roxa e check), Quando (chips: Todo dia, Dias da semana, Todo mês, A cada X horas, Uma vez; campos condicionais: botões Seg a Dom, dia do mês 1 a 28, horas 1 a 168, datetime-local, hora em Brasília), Entregar em (chips Conversas, WhatsApp, E-mail com texto de ajuda; WhatsApp pede número com DDD; e-mail pede endereço), checkbox "Ativa", Cancelar e "Criar rotina"/"Salvar".
- **Ferramentas disponíveis** (fallback `FERRAMENTAS_PADRAO`, a lista real vem de `GET /api/rotinas`): Atividades, Financeiro, Google Agenda, Gmail, Drive e Planilhas, Meta Ads, Instagram, WhatsApp, Internet, Contratos (lista cortada no arquivo, demais itens a confirmar).

### Estados
- Carregando: texto "Carregando rotinas..." (cinza 13px) enquanto `loading` e sem dados.
- Vazio: caixa tracejada (`border:1px dashed #DADADF`, raio 16) "Nenhuma rotina ainda" com orientação (modelo, Nova rotina ou pedir no chat); a galeria abre sozinha.
- Erro de API: faixa vermelha (`border rgba(192,52,28,0.3)`, fundo `rgba(192,52,28,0.05)`, ícone de alerta) "Não consegui falar com o servidor das rotinas (...)" com ação de recarregar (`data-rot-reload`, texto do botão a confirmar).
- WhatsApp do ZEUS desconectado: faixa vermelha `zapAviso` quando existe rotina com entrega WhatsApp e `GET /api/wa/zeus` não retorna `ready`; também aparece dentro do modal ao escolher WhatsApp; leva a Conectores (tela `waConnector`).
- Executando: rotina com `rodando` mostra "Executando agora..."; a tela consulta de novo a cada 15 s (até 80 vezes) e recarrega histórico ao terminar.
- Erro ao salvar: texto vermelho 12.5px acima do rodapé do modal; botão vira "Salvando..." desabilitado.
- Sem permissão: não tratado na tela (a confirmar).

### Interações e API (`/api/rotinas`, helper `api()` ~34)
- Abrir tela: `GET /api/rotinas` (retorna `rotinas`, `agora`, `ferramentas`); depois `GET /api/wa/zeus`; agentes/habilidades vêm de `homeAgentsEnsure()` (catálogo `/api/agents`).
- Nova rotina / "Usar" em modelo: abre modal (modelo pré-preenche campos, sem `cat` e `desc`). Também existe `window.rotinaAbrirCom(base)` para outras telas abrirem o modal pré-preenchido (a Home tem atalho `data-go="rotinas"`).
- Criar: `POST /api/rotinas`; editar: `PUT /api/rotinas/<id>`. Corpo: name, prompt, agent_id, skill_id, freq, hora, dias, dia_mes, cada_horas, quando, entrega, destino, tools, enabled. Ctrl/Cmd+Enter no prompt salva; Esc e clique no fundo fecham.
- Executar agora: `POST /api/rotinas/<id>/rodar`, abre o histórico.
- Histórico: `GET /api/rotinas/<id>/runs`; resposta completa: `GET /api/rotinas/<id>/runs/<runId>`.
- Pausar/ativar: `POST /api/rotinas/<id>/ativar` com `{enabled}`.
- Excluir: `zConfirm` e `DELETE /api/rotinas/<id>` (histórico some, conversas ficam).
- Abrir conversa: preenche `state.chat`, vai para `agente` (se a rotina tem agente) ou `chat`, abre stream da sessão.

---

## 2. Meus agentes

- **Rota e menu**: `/agentes`; Agentes > "Meus agentes". Ativo também em `/criarAgente` e `/agente/<id>`.
- **Objetivo**: listar e gerenciar os agentes do usuário e do workspace, com atalho para equipes.
- **Origem**: `renderAgentes()` index.html ~6018; `agentCardHTML()` ~5999; `agentMenuHTML()` ~5985; ações em `agentMenuAction()` ~7200.

### Layout
- Contêiner padrão 1240px. Cabeçalho: `h1` "Meus agentes" 27px + subtítulo; à direita dois botões: "Explorar Agentes ZEUS" (contorno `#DADADF`, vai a `catalogo`) e "Criar agente" (roxo, só com `pode("criar-agente")`, vai a `criarAgente`).
- Abas (texto com sublinhado roxo `inset 0 -2px 0 #673DE6`, rolagem horizontal): **Meu workspace** (`inWorkspace`), **Meus agentes** (`kind==="custom"`), **Da empresa** (`kind==="zeus"`), **Compartilhados** (filtro fixo `false`, sempre vazio hoje: a confirmar se é intencional), **Todos**. Aba padrão "ws".
- Seção do agente: `h2` com contagem; grade `repeat(auto-fill,minmax(250px,1fr))` gap 14.
- Rodapé: nota "Remover do workspace não exclui o agente." (só na aba ws). Depois seção "Equipes de agentes" com contagem, link "Ver todas" (se mais de 3), botão roxo "Criar equipe" (`data-team-new`) e grade `minmax(280px,1fr)` com até 3 `teamCardHTML`.
- Celular: grades de 250/280px caem para 1 coluna; abas rolam na horizontal.

### Componentes
- **Card do agente**: borda `#E6E6EA`, raio 14, padding 16, hover de borda. Topo: `AG_TAG` (categoria), `AG_KIND` ("Criado por mim" ou rótulo do tipo), kebab (28px) à direita. Nome em Space Grotesk 15px, descrição 12.5px cinza (ou "Sem descrição."), selos de canais (`agentCanaisSelos`, pílulas WhatsApp/Instagram verdes, vermelhas se erro), linha "N arquivos de conhecimento" com ícone roxo, botão `AG_BTN` cinza `#F1F1F3` "Usar agente".
- **Menu kebab** (popover 196px, raio 12, sombra `0 16px 40px rgba(23,23,26,0.16)`, itens `AG_MENU_ITEM`): Editar, Compartilhar, Canais (WhatsApp e Instagram) só admin, Duplicar, separador, Adicionar/Remover do workspace, Excluir agente (vermelho, só `custom`).
- **Card da equipe**: ver tela 6.

### Estados
Carregando: "Carregando agentes..." (ou `agentsError`). Vazio por aba: caixa tracejada com mensagem própria (`VAZIO`). Equipes: "Carregando equipes..." e vazio "Nenhuma equipe ainda. Junte agentes em torno de um objetivo...".

### Interações e API
- Carga: `GET /api/agents` (`agentsLoad` ~7048) e `GET /api/teams` (`teamsLoad` ~5659).
- Card ou "Usar agente": vai a `/agente/<id>`. Editar: `/agente/<id>/editar`.
- Adicionar/remover do workspace: `PATCH /api/agents/<id>` `{inWorkspace}`.
- Duplicar: `GET /api/agents/<id>`, `POST /api/agents` (nome copiado), `PATCH` para pôr no workspace, e copia cada arquivo de conhecimento (baixa e sobe de novo); alerta se a cópia de arquivos falhar.
- Excluir: `zConfirm` + `DELETE /api/agents/<id>`.
- Compartilhar: modal (ver tela 9). Canais: modal de `agente-canais.js` (ver tela 10).

---

## 3. Agentes ZEUS (catálogo)

- **Rota e menu**: `/catalogo`; Agentes > "Agentes ZEUS".
- **Objetivo**: explorar agentes oficiais, filtrar e adicionar ao workspace.
- **Origem**: `renderCatalogo()` ~6139, `catListHTML()` ~6109, `catCardHTML()` ~6082, `catRefresh()` ~6130, filtros `catFiltro()` ~6075.

### Layout
Contêiner 1240px; `h1` "Agentes ZEUS" 25px, subtítulo; barra de filtros em flex com quebra: busca (ícone de lupa, `flex:1 1 260px`, máx. 340px, raio 10), três selects (classe `cat-select`): "Todas as categorias", "Todas as habilidades" (só habilidades usadas por algum agente ZEUS), "Qualquer status" (No workspace / Fora do workspace); link roxo "Limpar filtros" visível só com filtro ativo. Lista agrupada por categoria: `h2` + contagem e grade `repeat(auto-fill,minmax(290px,1fr))` gap 12. No celular vira 1 coluna.

### Componentes
Card (`cat-card`, raio 14, padding 16/16/14): `AG_TAG` categoria, `AG_KIND` tipo, ícone de alerta roxo (`warn`, com tooltip) à direita; nome 14.5px; descrição limitada a 2 linhas; rodapé com botão largo: "Adicionar ao workspace" (contorno `#DADADF`) ou "No workspace" (verde `#0F7A68`, fundo `rgba(15,122,104,0.06)`, vira "Remover" ao passar o mouse) e link "Usar" em roxo com ícone sparkle.

### Estados
Carregando: "Carregando catálogo..." (ou erro). Filtro sem resultado: caixa tracejada "Nenhum agente encontrado com esses filtros. Limpar filtros". Busca e filtros atualizam só `#cat-list` (não perdem foco).

### Interações e API
`GET /api/agents`. Card ou "Usar": abre `/agente/<id>` (chat). Botão de workspace: `PATCH /api/agents/<id>` `{inWorkspace}`.

---

## 4. Equipes de agentes (lista)

- **Rota e menu**: `/equipes`; Agentes > "Equipes de agentes".
- **Objetivo**: listar equipes (orquestrador + 2 a 8 agentes) e abrir ou criar.
- **Origem**: `renderEquipes()` index.html ~5169; `teamCardHTML()` ~5147; `teamMenuHTML()` ~5136.

### Layout
Contêiner 1240px. Eyebrow "MEU WORKSPACE" (roxo, 10.5px), `h1` "Equipes de agentes" 27px, texto com limites (`teamLimits()`, padrão 2 a 8, vindos de `GET /api/teams`), botão roxo "Criar equipe de agentes" (`pode("criar-equipe-agentes")`). Grade `repeat(auto-fill,minmax(280px,1fr))` gap 14. Abaixo, caixa "COMO A ORQUESTRAÇÃO FUNCIONA" (`TM_EYEBROW`) com 3 passos numerados (Planeja, Executa, Consolida), cada um com quadrado roxo translúcido 26px.

### Componentes
Card: nome (Space Grotesk 14.5px, reticências), selo de visibilidade ("Da empresa" `AG_KIND` ou "Privada" `AG_TAG`), kebab; objetivo (2 linhas); avatares sobrepostos `TM_AVATAR` (até 4, "+N"); contagem de agentes com ícone de usuários; "Orquestrador: Orquestrador de <nome>"; botão roxo `AG_BTN` "Usar equipe" e ícone de compartilhar. Menu: Editar, Compartilhar, Duplicar, Excluir equipe (vermelho).

### Estados
Carregando "Carregando equipes..." (ou erro); vazio: caixa tracejada "Nenhuma equipe ainda. Clique em Criar equipe de agentes...".

### Interações e API
`GET /api/teams`. Card ou "Usar equipe": `/equipe/<id>`. Criar: `/criarEquipe`. Editar: `/criarEquipe/<id>`. Duplicar: `POST /api/teams/<id>/duplicate`. Excluir: `DELETE /api/teams/<id>`. Compartilhar: `GET/PUT /api/teams/<id>/share` (modal da tela 9).

---

## 5. Equipe (execução com o orquestrador)

- **Rota e menu**: `/equipe/<id>`; mantém o item "Equipes de agentes" ativo. Link antigo `/equipe` sem id cai em `/equipes`.
- **Objetivo**: conversar com o orquestrador, acompanhar etapas dos agentes e aprovar a entrega por partes.
- **Origem**: `renderEquipe()` ~5554; `teamTimelineHTML_()` ~5428; `teamStepHTML()` ~5210; `teamPartsHTML()` ~5294; `teamPlanOpen()` ~5363; `teamRunsHTML()` ~5457; `teamComposerHTML()` ~5517; `teamHeroHTML()` ~5539; `syncTeam()` ~5620.

### Layout
Coluna cheia `height:100vh` (no celular `100dvh - 56px`), padding `26px 36px 24px`, máx. 1240px.
- Cabeçalho: eyebrow roxo "ORQUESTRADOR" (clicável, volta a Equipes), `h1` com o nome, "Converse com o orquestrador da equipe."; à direita botões "Editar" (`pode("editar-equipe-agentes")`), "Compartilhar" roxo (`pode("compartilhar-agente")`) e lixeira (`pode("excluir-equipe-agentes")`).
- Cartão central (`border #E6E6EA`, raio 16, `min-height:460px`) com três faixas: (1) barra "ELENCO" com chips dos agentes e seu status na rodada, indicador "Equipe trabalhando..."/"Pronta", botão "Conversas" (relógio) e "+" para nova conversa; (2) área rolável (`#team-scroll`, fundo `#F7F7F8` quando há conversa, branco no estado inicial); (3) compositor fixo embaixo (some no estado inicial, onde o compositor fica no centro).
- Popover "CONVERSAS COM O ORQUESTRADOR" (320px, máx. 420px de altura) lista as execuções, cada uma com bolinha pulsante se rodando e "x" para excluir.

### Etapas e componentes da linha do tempo
- Mensagem do usuário: balão roxo translúcido alinhado à direita.
- **Plano do orquestrador** (`kind:"plan"`): cartão com `TM_EYEBROW` "PLANO DO ORQUESTRADOR", resumo, e uma linha por etapa ("ETAPA n" em roxo + chips arredondados com os agentes + "em paralelo" quando há mais de um). Enquanto roda: "Orquestrador analisando o pedido e montando o plano..." com ponto `tm-pulse`.
- **Passo do agente** (`kind:"agent"`, recuado 40px): cabeçalho com `TM_AVATAR` (iniciais), nome, "Etapa n", tarefa, selo `teamStatusBadge` (Na fila / Trabalhando / Concluído / Falhou / Cancelado com cores de `TM_STATUS`), chevron. Expande (automático enquanto roda; manual depois) mostrando markdown em fundo `#FCFCFD`; borda roxa translúcida quando rodando.
- **Entrega consolidada** (`kind:"final"`): cartão com borda `rgba(103,61,230,0.35)`, cabeçalho roxo 6% com check, "Entrega consolidada", ações Copiar e baixar markdown. Respostas curtas (`perguntar`/`responder`) viram balão branco do orquestrador.
- **Aprovação por partes** (`teamPartsHTML`): o markdown é dividido em seções `## `; cada parte é um cartão com cor por revisão: "Para revisar" (neutro), "Aprovada" (verde `#0F7A68`, fundo `rgba(15,122,104,0.06)`), "Descartada" (cinza, `opacity:.55`); rodapé com botões Aprovar, Ajustar e Descartar (desabilitados enquanto a equipe roda). "Ajustar" abre textarea "O que mudar nesta parte?" com Cancelar e "Refazer esta parte". Rodapé geral: "N de M partes aprovadas" + botão roxo "Transformar em plano" (esmaecido `#C9C3E8` sem parte aprovada); depois de criado vira faixa verde "Plano criado: <objetivo> e N atividades" com links "Ver OKR" e "Ver atividades".
- **Modal "Transformar em plano"** (`pdiModal`, 680px): Objetivo, Por quê, Responsável, Resultados-chave (título, de, para, unidade em `%`, `R$`, número, pp, dias, pontos, un), Atividades (checkbox, nome, prazo em dias, descrição) e Lista do ClickUp; botão "Criar plano".
- Erros: faixa vermelha com alerta; limite de uso da conta Claude atingido (mensagem dedicada); "Execução interrompida antes de terminar" em âmbar (`#FFF8EA`, borda `#F0D9A8`).
- Estado inicial (`teamHeroHTML`): "Orquestrador da equipe", nome 28px, texto, compositor grande (máx. 660px), faixa animada de logos de modelos (`zeusLogoMarquee`) e 4 sugestões (quebra-gelos da equipe ou `TM_SUGESTOES_PADRAO`).
- Compositor: textarea "Descreva o objetivo ou responda ao orquestrador...", Enter envia, Shift+Enter quebra linha, microfone (ditado do navegador), botão redondo roxo de enviar que vira "Parar" vermelho enquanto roda.

### Estados
Carregando "Carregando equipe..."; "Carregando execução..."; equipe inexistente: botão voltar + "Equipe não encontrada. Ela pode ter sido excluída."; sem permissão: botões ocultos.

### API
`GET /api/teams/<id>/runs`; `POST /api/teams/<id>/runs` (cria execução); `GET /api/teams/runs/<rid>`; `EventSource /api/teams/runs/<rid>/stream`; `POST .../runs/<rid>/send` `{text}`; `POST .../runs/<rid>/cancel`; `DELETE .../runs/<rid>`; `POST .../steps/<id>/review` `{idx,status}`; `POST .../steps/<id>/adjust` `{idx,note}`; `POST .../steps/<id>/plan-draft`; `POST .../steps/<id>/plan-link`; `POST /api/okrs/objectives`; `GET /api/clickup/overview`; `POST /api/clickup/tasks`. Aprovação em cartões internos: `POST .../steps/<id>/aprovacao`.

---

## 6. Criar / editar equipe

- **Rota e menu**: `/criarEquipe` (nova) e `/criarEquipe/<id>` (editar); item "Equipes de agentes" ativo.
- **Objetivo**: definir identidade, elenco (2 a 8 agentes), orquestrador e sugestões de pedido.
- **Origem**: `renderCriarEquipe()` ~5841; `tfSave()` ~5947; `tfBlank()/tfFrom()` ~5821.

### Layout
Contêiner `26px 40px 60px`, 1240px. Botão "Voltar" (contorno) , eyebrow ("EQUIPES DE AGENTES · NOVA" ou "EQUIPE · CONFIGURAÇÃO"), `h1` "Criar equipe de agentes"/"Configurar equipe", botões "Excluir equipe" (vermelho, só edição) e "Criar equipe"/"Salvar alterações" (roxo, `Salvando...` cinza `#B4B4BC`). Duas colunas por `grid repeat(auto-fit,minmax(340px,1fr))` gap 16 (uma coluna no celular).
- Coluna esquerda: card "Identidade da equipe" (Nome, Objetivo, Descrição curta, Visibilidade com dois botões Privada / Da empresa) e card "Agentes da equipe" (chips dos selecionados removíveis, busca, lista agrupada por categoria com caixas de seleção, máx. 460px de altura com rolagem; contador "n de 8 selecionados" verde ou vermelho; itens bloqueados quando cheio).
- Coluna direita: card "Orquestrador" (modelo: Padrão / Opus / Sonnet / Haiku; instruções opcionais) e card "Sugestões de pedido" (até 6 inputs removíveis e botão tracejado "Adicionar sugestão").
- Cards: raio 16, padding 22, ícone 28px roxo translúcido, título Space Grotesk 15px. Campos usam `AG_INPUT`.

### Estados e API
Carregando "Carregando..." até `agentsData` e `teamsData`. Validações por `alert`: nome obrigatório; quantidade de agentes entre min e max. Salvar: `POST /api/teams` ou `PATCH /api/teams/<id>`; depois vai a `/equipe/<id>`. Excluir: `DELETE /api/teams/<id>`.

---

## 7. Habilidades

- **Rota e menu**: `/habilidades`; Agentes > "Habilidades".
- **Objetivo**: catálogo de skills do servidor e regras de prompt, com criar, editar, ocultar, restaurar.
- **Origem**: `public/habilidades.js` (237 linhas) sobrescreve `RENDERERS.habilidades` (~226); versão só leitura antiga em index.html `renderHabilidades()` ~3484 (substituída). `page()` ~50, `modal()` ~118, `abrirNova()` ~162, `abrirEditar()` ~180, `excluir()` ~200, `restaurar()` ~209. Constantes próprias `IN`, `MONO`, `BTN_PRI`, `BTN_SEC`.

### Layout
Contêiner 1240px (`id="hab-root"`). Cabeçalho: `h1` "Habilidades" + texto; botões "Atualizar" (contorno) e "Nova habilidade" (roxo). Faixa de 5 KPIs em `repeat(auto-fit,minmax(180px,1fr))`: Habilidades no catálogo, Skills do servidor (verde), Regras de prompt, Criadas por você (roxo), Agentes com habilidades. Busca (máx. 420px). Grupos por `group`: `h2` + contagem e grade `repeat(auto-fill,minmax(270px,1fr))`. No fim, caixa tracejada "Regras padrão ocultas (n)" com chips e link "Restaurar".

### Componentes
Card: ícone 28px (verde p/ skill, roxo p/ regra), nome (clicável abre edição), selo **SKILL** (verde `#0F7A68`) ou **REGRA** (roxo `#673DE6`), descrição, rodapé com `/slug` ou "regra · id" em fonte mono, "· editada" em roxo, contagem de agentes que usam (ícone maleta), e ícones de ação: editar, restaurar padrão (se editada), excluir/ocultar (se `deletable`). Aviso roxo quando existem skills mas nenhum agente usa. Modal (`#hab-modal`, form, raio 18, `max-width` 680px): Nome, Identificador (slug automático, travado na edição), Grupo (datalist), "Quando acionar", e "Instruções (SKILL.md)" em textarea mono de 14 linhas; regras têm só Nome, Grupo e Instrução. Skills de origem externa editam apenas nome, grupo e descrição.

### Estados
Carregando "Carregando habilidades..."; vazio "Nenhuma habilidade encontrada."; erro em faixa vermelha (404 mostra "A rota /api/skills ainda não está ativa no servidor"). Toast preto (erro vermelho) no rodapé central.

### API (`/api/skills`)
`GET /api/skills` e `GET /api/skills/_hidden/list`; `GET /api/skills/<id>`; `POST /api/skills` (kind "skill"); `PUT /api/skills/<id>`; `DELETE /api/skills/<id>` (zConfirm; apaga pasta no servidor se for skill do usuário); `POST /api/skills/<id>/restore`. Após mudar, recarrega `/api/agents`.

---

## 8. Conhecimento

- **Rota e menu**: `/conhecimento`; Agentes > "Conhecimento".
- **Objetivo**: base RAG compartilhada que o ZEUS e os agentes consultam; documentos viram trechos pesquisáveis.
- **Origem**: `renderConhecimento()` ~3570; `kbFiltrados()` ~3563; `kbLoad()` ~7332; `kbSearch()` ~7353; `kbUpload()` ~7365; `kbNew()` ~7411; `kbEdit()` ~7443; `kbReindex()` ~7380; `kbDelete()` ~7388.
- Observação: **não há pastas**. A organização é por "Escopo" (texto livre, padrão "Geral", criado no próprio select com "__novo") e tags.

### Layout
Contêiner 1100px. Cabeçalho: `h1` "Conhecimento", texto; botões "Reindexar", "Novo conhecimento" (contorno) e "Enviar arquivo" (roxo, clipe). Faixa de status (borda verde translúcida, ou vermelha se há erros): "Índice atualizado"/"Indexando", "N documentos · N trechos · N na fila · N com erro", "última indexação há X". Barra de busca (Enter busca nos trechos; digitar filtra a lista) e 3 selects `cat-select`: origem (Upload, Texto, Link), escopo, status (Indexado, Na fila, Indexando, Sem texto, Erro). Tabela em caixa branca raio 14 com rolagem horizontal (`min-width:860px`), colunas DOCUMENTO, ORIGEM, ESCOPO, TRECHOS, STATUS, ações. Zona de soltar arquivos tracejada embaixo.
Celular: tabela mantém largura mínima e rola na horizontal.

### Componentes
Linha: ícone de arquivo (roxo, cinza se desativado, título riscado), nome e subtítulo (arquivo e tamanho, URL ou nº de caracteres), origem, `AG_TAG` do escopo, nº de trechos, status com bolinha (`KB_STATUS`: Indexado verde, Indexando roxo, Na fila e Sem texto cinza, Erro vermelho; tooltip com o erro), ações editar, baixar, excluir. Resultado de busca: cabeçalho "RESULTADOS DA BUSCA" e itens com título, `AG_TAG` escopo, "trecho n" e trecho com `<mark>` roxo translúcido. Modais (`pdiModal`): "Novo conhecimento" (título, escopo, tags, conteúdo, arquivo opcional, link, observações internas, "Salvar e indexar") e "Editar conhecimento" (mesmos campos, checkbox "Ativo na busca dos agentes", "Reindexar", troca ou remoção de arquivo).

### Estados
Carregando "Carregando base de conhecimento…"; erro em vermelho centralizado; base vazia "A base está vazia. Envie um arquivo ou crie um conhecimento em texto."; filtro sem resultado "Nenhum documento bate com os filtros."; busca sem resultado `Nada encontrado na base para "..."`; enviando "Enviando e indexando…". Enquanto houver itens na fila, recarrega a cada 2,5 s.

### API
`GET /api/knowledge`; `GET /api/knowledge/search?q=&limit=20`; `POST /api/knowledge` (multipart para upload, JSON para texto/link); `GET /api/knowledge/<id>`; `PATCH /api/knowledge/<id>`; `POST/DELETE /api/knowledge/<id>/file`; `GET /api/knowledge/<id>/file`; `POST /api/knowledge/reindex` e `/api/knowledge/<id>/reindex`; `DELETE /api/knowledge/<id>`. Formatos: PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, TSV, JSON, HTML, XML, YAML, até 50 MB.

---

## 9. Criar / editar agente

- **Rota e menu**: `/criarAgente` (novo) e `/agente/<id>/editar` (editar); item "Meus agentes" ativo.
- **Objetivo**: montar um agente conversando com o ZEUS ou preenchendo o formulário.
- **Origem**: `renderCriarAgente()` ~6295; `afModeToggleHTML()` ~6172; `afIaHTML()` ~6219; `afIaSend()` ~6247; `afEnrich()` ~6275; `afPreviewCardHTML()` ~6201; `afSave()` ~7258; `afBlank()/afFrom()` ~7209.

### Layout
Contêiner `26px 40px 60px`. Botão voltar ("Meus agentes" ou "Voltar para o chat do agente"), eyebrow ("AGENTES DA EMPRESA · NOVO", "MEU AGENTE · CONFIGURAÇÃO", "AGENTE ZEUS · CONFIGURAÇÃO"), `h1` "Criar agente"/"Configurar agente", botão "Excluir agente" (só edição e não ZEUS), texto de pendência (`#af-falta`, ex. "Falta nome e prompt") e botão roxo salvar. Alternador segmentado (fundo `#F1F1F3`, raio 12) entre **Criar com ZEUS** e **Criação manual** (novo agente abre em "ia"; edição abre em "manual").

### Abas (modos)
- **Criar com ZEUS** (`afIaHTML`): duas colunas por flex-wrap (`flex:1 1 480px` e `flex:1 1 300px`; empilham no celular). Esquerda: chat com cabeçalho "Criar com o ZEUS", mensagens (usuário em balão roxo translúcido; ZEUS com avatar gradiente `#673DE6` para `#5429C9`), 4 sugestões iniciais (`AF_IA_SUGESTOES`), compositor com microfone e botão enviar. Direita: **cartão de prévia** sticky (ícone, selo "PRÉVIA · categoria", nome, descrição, habilidades, quebra-gelos, "PROMPT GERADO" e link "Revisar na criação manual").
- **Criação manual**: coluna de cards + prévia. Cards: **Identidade** (Nome, Categoria, Descritivo, Modelo: Padrão ZEUS / Opus / Sonnet / Haiku, Prompt com botões "Enriquecer com o ZEUS" e "Desfazer"), **Conhecimento** (lista de arquivos do agente com "x", arquivos pendentes "sobe ao salvar", zona tracejada "Clique ou arraste arquivos aqui"; PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, JSON, HTML, imagens, até 50 MB), **Habilidades** (chips alternáveis por grupo; ativa = borda roxa e check), **Quebra-gelos** (até 8 inputs).

### Estados
Carregando "Carregando..." (ou erro). Salvando: botão cinza "Salvando...". ZEUS pensando: indicador no chat; falha mostra mensagem "Não consegui montar agora (...)". Validações por `alert`: nome obrigatório; prompt ou descritivo (exceto tipo ZEUS); enriquecer exige rascunho.

### API
`GET /api/agents/<id>` (edição); `POST /api/agents/assist` com `mode:"build"` (chat) ou `mode:"enrich"`; `POST /api/agents` / `PATCH /api/agents/<id>`; `POST /api/agents/<id>/files` (multipart) e `DELETE /api/agents/<id>/files/<fid>`; `DELETE /api/agents/<id>`. Após salvar vai a `/agente/<id>`.

---

## 9b. Modal Compartilhar (agente e equipe)

- **Origem**: `agentShare()`/`agentShareRender()` index.html ~7090 a 7155, host `#ag-share-host`.
- Modal 560px, raio 18, fundo de overlay `rgba(23,23,26,0.45)` z-index 80. Mostra o link (`/agente/<id>` ou `/equipe/<id>`) com botão copiar; três opções em rádio: **Todos da conta**, **Quem tiver o link**, **Pessoas específicas** (lista de pessoas com checkbox; vazio: "Nenhuma pessoa cadastrada. Convide em Configurações > Usuários."). Administradores sempre veem tudo.
- API: `GET/PUT /api/agents/<id>/share` ou `/api/teams/<id>/share` com `{mode, users}`.

---

## 10. Conversa com um agente

- **Rota e menu**: `/agente/<id>`; item "Meus agentes" ativo. Menu lateral principal fica recolhido nesta tela (lista `hide` em index.html ~53).
- **Objetivo**: chat com um agente, com histórico de conversas e, em alguns agentes, abas de painel.
- **Origem**: `renderAgenteChat()` ~6956; `agentMainHTML()` ~6930; `agentMsgsHTML()` ~6799; `agentSessHTML()` ~6829; `agentComposerHTML()` ~6910; `agPanelTabsHTML()` ~6868; `syncAgentChat()` ~7000; `agentePodeEditar()` ~10655; canais em `public/agente-canais.js` (159 linhas, `window.agentCanais`).

### Layout
`display:flex;height:100vh`. Coluna esquerda `#ag-sess` (250px, `border-right`, fundo `#FAFAFA`): botão voltar (para `a.home` ou "Meus agentes"), título "CONVERSAS" com "+" de nova conversa e lista de sessões (ativa em roxo translúcido, "x" para excluir). Coluna direita: barra superior (botão alterna painel de conversas, ícone 36px, nome 15px e subtítulo "Agente da empresa"/rótulo do tipo, status "Pronto" verde ou "Pensando..." roxo, botões "Editar" (`agentePodeEditar`), "Canais" (só admin) e "Compartilhar" roxo (`pode("compartilhar-agente")`)); barra de abas do painel (se o agente tem `panel`); área principal. Celular: painel de conversas vira faixa horizontal rolável (regra global de `flex:0 0 2xx`) e some abaixo de 760px (`.ag-sess`); altura desconta a barra do topo.

### Abas
Só em agentes com `a.panel`: aba "Agente" (chat) + abas do painel (cada uma com ícone de `AG_TAB_ICONS`: bolt, grid, plus, users, chart, calendar, layers, paleta, settings). Aba ativa roxa translúcida. Conteúdo do painel: tela nativa (`agNativePanel`) ou `iframe`. Painel esconde o painel de conversas.

### Componentes
- Estado vazio: nome 24 a 32px, descrição, aviso `warn` (caixa roxa translúcida com ícone), compositor grande (máx. 700px), faixa de logos `zeusLogoMarquee`, quebra-gelos em grade `minmax(280px,1fr)`.
- Mensagens: classes `chat-row`/`chat-bubble`; usuário com anexos (imagens linkadas, arquivos em chip); assistente com markdown (`mdToHtml`), indicador "Pensando" (`zeusPensandoHTML`), metadados (`zeusMetaHTML`) e barra de ações (`chatAcoesHTML`, estilo `CHAT_ACT`/`CHAT_ICO_BTN`).
- Compositor (`.home-chat`, raio 18): anexos, marcadores @ de agente e / de habilidade, textarea, selo roxo "ZEUS 2.3" (tooltip do modelo), clipe, dica de menção, microfone, botão enviar/parar (`chatBotaoEnviar`).
- **Modal Canais** (`agente-canais.js`, `#ag-canais-host`, 620px): seção WHATSAPP com escolha "Ao ligar, responder: Todas as conversas / Só quem recebeu disparo" e uma linha por número (pílula de status Conectado verde, Aguardando QR roxo, Conectando âmbar, Desconectado vermelho, Sem número cinza; botões Ligar / Trocar para este / Desligar; avisos de erro e de base truncada em 20 mil caracteres); seção INSTAGRAM com a conta e Ligar/Trocar/Desligar. Um agente por número e um por conta de IG. Confirmações por `zConfirm`; toast `cfgToast`.

### Estados
Carregando "Carregando agente..."; erro/inexistente: botão "Meus agentes" + mensagem do servidor; vazio: tela de boas-vindas; streaming: status "Pensando...", botão vira parar, texto digitado é preservado se enviar durante a resposta (toast "O ZEUS ainda está respondendo..."). Sem permissão de editar/compartilhar: botões ocultos. Canais: "Carregando canais...", erro em faixa vermelha, "Aplicando..." roxo, sem chave de IA e sem número (mensagens dedicadas).

### API
`GET /api/agents/<id>`; `GET /api/chat/sessions?agent=<id>`; `POST /api/chat/sessions` (`agent_id`); `GET /api/chat/sessions/<sid>/messages`; `POST /api/chat/sessions/<sid>/send` (multipart com texto e arquivos); `EventSource /api/chat/sessions/<sid>/stream`; `POST .../stop`; `DELETE /api/chat/sessions/<sid>`; `POST .../messages/<mid>/edit`, `/feedback`, `/aprovacao`; `POST /api/chat/transcribe` (ditado); arquivos em `/api/chat/file/<sid>/<arquivo>`. Canais: `GET /api/canais`, `POST /api/canais/whatsapp` `{agentId,slot,modo}`, `DELETE /api/canais/whatsapp/<slot>`, `POST /api/canais/instagram` `{agentId}`, `DELETE /api/canais/instagram`.

---

## Pontos a confirmar (resumo)
- Texto exato do botão de recarregar no erro de Rotinas (`data-rot-reload`, linha truncada).
- Lista completa de ferramentas de Rotinas (final de `FERRAMENTAS_PADRAO` truncado; a lista real vem do servidor).
- Se o backend bloqueia Rotinas por permissão (o front não consulta `pode()`).
- Aba "Compartilhados" em Meus agentes está com filtro fixo `false` (sempre vazia): intencional ou pendente.
- Telas 5 e 10 usam markup e estilos de bolhas de chat em CSS global (`chat-row`, `chat-bubble`, `tm-pulse`) cujos valores não foram documentados aqui.
