# Visual "roxo + magenta" da Central

Visual oficial da Central desde 17/10/2026, implementado a partir do handoff em [`../../novo-visual/design_handoff_zeus_central_magenta/`](../../novo-visual/design_handoff_zeus_central_magenta/). Última conferência com a produção: 23/10/2026. Prints em [`telas/prints/`](telas/prints/) (arquivos `novo-*`, gerados com dados de exemplo).

## Como está montado

O visual novo é uma **camada por cima** das telas antigas. As telas continuam montando o HTML com estilos inline (as constantes de [`componentes-e-telas.md`](componentes-e-telas.md)), e dois arquivos carregados por último trocam a moldura:

| Arquivo | O que faz |
|---|---|
| [`zeus-visual.css`](zeus-visual.css) | Tokens `--z-*`, fundo aurora, card tingido (sobrepõe todo card `background:#FFFFFF` + borda `#E6E6EA`), menu flutuante, faixa de cabeçalho, abas, busca ⌘K, barra do celular, telas de trabalho em vidro, ajustes por tela (`html[data-zv-tela="<tela>"]`) e tema escuro. |
| [`zeus-visual.js`](zeus-visual.js) | Redesenha o menu (`window.sidebar`), embrulha `window.render`, monta a faixa e as abas de cada tela, busca ⌘K, barra e gaveta do celular, cabeçalho escuro dos motores e fotos dos agentes na tela de voz. |

Em produção: `jeff-central/public/zeus-visual.css` e `zeus-visual.js`, ligados no fim do `index.html` (`?v=` sobe a cada mudança). Para voltar ao visual antigo basta tirar o `<link>` e o `<script>`.

**A faixa reaproveita os elementos da própria tela.** O `zeus-visual.js` acha o `h1` (ou o topo indicado em `origem`), lê título e descrição, **move os botões e as abas originais** para dentro da faixa (os cliques continuam funcionando) e esconde o cabeçalho antigo. Um `MutationObserver` em `#main-slot` reaplica quando a tela se redesenha sozinha (dados chegando).

## Componentes

### Fundo e cards
- Fundo da área de trabalho: aurora `--z-main` (três brilhos radiais roxo, rosa e rosa claro sobre `#F1E8F8`).
- Card: `--z-card` (branco tingido 155°) com borda `rgba(103,61,230,0.13)`.
- Telas de trabalho (Conversas, Edição de Vídeo, WhatsApp, Instagram): lista e área principal viram cards de vidro com raio 18 px e `backdrop-filter:blur(14px)`, ocupando a altura que sobra abaixo da faixa (`--zv-faixa-h`).

### Menu lateral flutuante (`.zsb`)
- 252 px, margem 12 px, raio 18 px, fundo `--z-sb` (noite em degradê com brilho rosa e lilás), sombra `0 18px 44px rgba(52,26,134,0.35)`.
- Ordem: logo raio + "ZEUS" e botão de recolher · empresa (selo branco + nome) · busca "Buscar ou ir para…" com `Ctrl K` / `⌘K` · Início, Jarvis · **OPERAR** (Rotinas, Agentes, Gestão Inteligente, Atividades) · **CANAIS** (WhatsApp, Instagram, LinkedIn, TikTok com ponto âmbar, Edição de Vídeo) · **ORGANIZAR** (Organograma, Ferramentas, Formações 🔒, Trilhas 🔒) · **CONTEXTO** (Biblioteca, Conectores) · rodapé com usuário, sino e Configurações.
- Rótulo de seção: ponto colorido da seção + texto 10 px MAIÚSCULO com linha fina. Item: 13.5 px, branco 82%; ativo em pílula branca translúcida que desliza (`.zsb-pilula`).
- Não tem mais o cartão "Falar com o ZEUS" (retirado a pedido do Jeff em 17/10/2026); a voz abre pelo item Jarvis e, no menu recolhido, pela esfera.
- Recolhido: trilho só de ícones com dica ao passar o mouse.

### Faixa de cabeçalho (`.zbn`)
- Largura toda da área (margem 12 px), raio 22 px, degradê da seção (tabela abaixo), pontos no canto superior direito e brilho rosa.
- Dentro: caminho "Conta <empresa> › <Seção> · <Tela>" (12 px), ícone em quadrado branco 52 px na cor da seção, título Space Grotesk 28 px/600 branco, descrição 13.5 px branco 82%, botões à direita.
- Botões na faixa: o principal vira **branco com texto `#4B26C2`**; o secundário vira vidro (`rgba(255,255,255,0.12)`, borda branca 35%).
- Conteúdo da página fica alinhado à esquerda, com o texto da faixa; página com largura máxima centralizada encosta à esquerda.

| Seção | Telas | Faixa (120°) | Cor |
|---|---|---|---|
| Operar | Rotinas, Agentes, Gestão Inteligente, Atividades | `#230C3F → #4B26C2 → #7C5CF0` | `#673DE6` |
| Canais | WhatsApp, Instagram, LinkedIn, TikTok, Edição de Vídeo | `#230C3F → #7E1D6E → #BE185D → #EC4899` | `#BE185D` |
| Organizar | Organograma, Ferramentas | `#230C3F → #5B21B6 → #8B5CF6` | `#7C3AED` |
| Contexto | Biblioteca, Conectores | `#230C3F → #134E4A → #4B26C2` | `#0F7A68` |
| Base | Configurações, Memória | `#230C3F → #4B26C2 → #673DE6` | `#673DE6` |

Início, Jarvis e Conversas não têm faixa.

### Abas (`.zbn-abas`)
- Faixa fixa no topo ao rolar, logo abaixo do cabeçalho; caixa em branco tingido com raio 13 px e indicador lilás que desliza até a aba ativa; aba ativa na cor da seção.
- Abas por tela: Agentes (Meus agentes, Agentes ZEUS, Equipes, Habilidades, Conhecimento) · Gestão (Visão geral, Motor de Vendas, Motor de Growth) · Atividades (Todas as ações, Concluídas, Painel de entregas) · Biblioteca (Início, Recentes, Favoritos, Todos os arquivos) · LinkedIn (Posts, Estratégia) · Configurações (um grupo do menu de configurações por aba) · WhatsApp e Instagram (as abas da própria tela).
- Título interno que só repete a faixa ou a aba ativa some.

### Conversas
- Lista: "← CONVERSAS" com o total, botão "Nova conversa", busca que filtra enquanto digita e grupos HOJE, ONTEM, ESTA SEMANA, ANTERIORES.
- Topo do chat: esfera do ZEUS 36 px, nome da conversa (Space Grotesk 16 px), "Chat geral com o ZEUS · Pronto" (vira "ZEUS pensando..." em roxo) e selo ZEUS 2.3 MAX. A Edição de Vídeo usa a mesma tela com ícone de vídeo e "Agente editor de vídeo".

### Início
- Sem faixa: fundo aurora direto, saudação Space Grotesk 700 até 58 px, caixa de pergunta em card tingido (raio 22 px) com 960 px, atalhos Pesquisar/Executar/Criar/Gestão e "Seu dia" na mesma largura. Botão "Conversas" em pílula branca no canto.

### Gestão Inteligente
- Cada motor ganha cabeçalho escuro em degradê (Vendas no degradê Operar, Growth no degradê Canais) com ícone em vidro 44 px, selo "Liberado" em vidro, título 24 px e descrição branca.

### Rotinas
- Pedido resumido em 2 linhas (abre inteiro com um clique), chave liga/desliga "Ativa", lixeira discreta, "Modelos prontos" em card recolhível com ícone de brilho e grade de 4 colunas.

### Tela de voz (Jarvis)
- Fundo `--z-jv`, esfera `--z-orb` com halo rosa, agente trabalhando com anel `conic-gradient(#673DE6,#D16BE0)`, fonte consultada em degradê roxo → magenta, painel de resultado com fio `--zeus-mg-fio` no topo. Foto real do agente em `public/fotos-agentes/<id>.jpg` quando existir.

### Celular (até 820 px)
- Sem barra de topo: barra inferior flutuante escura (raio 26 px) com Início, Agentes, esfera elevada no centro (Jarvis), Conversas e Menu. "Menu" abre gaveta de baixo para cima com usuário, busca e todas as telas em grade de 4 por seção.

### Tema escuro
- Continua sendo `html.tema-escuro` com inversão; faixa, cabeçalho dos motores, menu e barra do celular são desinvertidos para manter as cores.

## Regras para tela nova

1. Monte a tela com as constantes de `componentes-e-telas.md` (card `background:#FFFFFF` + borda `#E6E6EA` vira card tingido sozinho).
2. Registre a tela em `TELAS` no `zeus-visual.js` com seção, caminho e ícone; use `h1` + parágrafo + botões numa linha flex para a faixa achar tudo.
3. Se tiver abas próprias, passe em `abasDe` (ou `origem`/`abasDe` quando a tela monta o próprio topo).
4. Confira em 1440 px, 1900 px e 390 px, e com o tema escuro.

## Diferenças conhecidas para o protótipo

- Atividades mantém a coluna de filtros da esquerda (responsável, prazo, projetos), que o protótipo não tem.
- "Adicionar" da Biblioteca e "Nova ação" de Atividades ficam dentro da página, não na faixa (os menus deles abrem a partir do botão).
- Os logos de integração são os oficiais, não as siglas coloridas do protótipo.
