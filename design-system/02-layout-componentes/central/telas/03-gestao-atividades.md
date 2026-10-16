# Telas: Gestão Inteligente e Atividades

Documentação de leitura do código da Central (`/opt/jeff-apps/jeff-central/public/`). Estado do código em 16/10/2026. Valores de cor e medida estão em `../componentes-e-telas.md` e `../../../01-identidade/tokens/zeus-central.css`; aqui as constantes são citadas pelo nome.

## Notas gerais (valem para todas as telas deste arquivo)

**Como as telas são montadas.** Não há classes CSS por componente: cada tela devolve uma string HTML com estilos inline. O `RENDERERS` do `index.html` (linha 7504) traz uma versão inicial de várias telas, e scripts carregados depois (ordem no fim do `index.html`, linhas ~10690 a 10714) **substituem** `RENDERERS.<tela>`. A versão que vale é sempre a do script, não a do `index.html`:

| Tela | Versão em vigor | Versão antiga (morta ou stub) |
|---|---|---|
| `motorVendas` | `vendas-demo.js` linha 567 | `renderMotorVendas` em `index.html` linha 2730 |
| `motorQualidade` | `vendas-demo.js` linha 576 | `motorEmBreveHTML` (index.html 2639) |
| `motorLeads` | `vendas-demo.js` linha 585 (redireciona) | `motorEmBreveHTML` |
| `motorAuditor` | `analise.js` linha 155 | `renderMotorAuditor` (index.html 2656) |
| `motorExec` | `analise.js` linha 159 (redireciona) | `renderMotorExec` (index.html 2847, chat antigo) |
| `motorDiagnostico` | `diagnostico.js` linha 154 | `motorEmBreveHTML` |
| `growthDash` / `growthAgente` | `growth-dash.js` linhas 400 e 429 (abrem o agente) | `renderGrowthDash` (2909), `renderGrowthAgente` (3205) |
| `okrs` | `okrs.js` linha 737 | stub `renderOkrs` (index.html 3268) |
| `pdi`, `pdiVer`, `pdiEquipe`, `pdiTemplates`, `pdiNovo` | `pdi.js` linhas 403 a 420 | `renderPdi*` em `index.html` linhas 1756 a 1861 |
| `pdiEvolucao`, `pdiIA` | `index.html` (1982 e 2083), sem override | |
| `acoes` | `acoes.js` linha 826 | `renderAcoes` (index.html 4400, maquete) |

`public/auditoria.js` existe mas **não é carregado** (não consta nos `<script src>` do `index.html`): a "Auditoria de Vendas" por formulário (aba Time e aba Conversa) está fora do ar; a tela ativa é o chat de `analise.js`.

**Layout do shell (todas as telas).** Menu lateral de 236px (recolhido: 64px só ícones), `<main id="main-slot">` ocupa o resto. `function sidebar()` em `index.html` linha 904. Item "Gestão Inteligente" na linha 1071 (grupo OPERAR E AUTOMATIZAR, depois de Rotinas e Agentes) e "Atividades" na linha 1074 (grupo EXECUTAR E COMUNICAR, primeiro item). O item "Gestão Inteligente" fica ativo (fundo `rgba(103,61,230,0.14)`) para as telas `motores, motorVendas, motorExec, motorAuditor, motorLeads, motorQualidade, motorDiagnostico, growthAgente, growthDash` (variável `isMt`, linha 907). **PDI e OKRs não têm item de menu** (ver cada seção).

**Celular (até 820px)**, regras globais do CSS do `index.html` linhas 71 a 110, valem para todas as telas abaixo:
- A sidebar vira gaveta (largura `min(300px,86vw)`), aberta pelo botão de menu da barra fixa de 56px no topo (`#mob-top`); `#main-slot` ganha `padding-top:56px`.
- Margem lateral de 40px (ou 30px) vira 16px no primeiro nível (`#main-slot>*` e filhos com `max-width`).
- Grades com `minmax(23x` até `minmax(6xx` (colunas mínimas de 230px ou mais) viram **uma coluna**; grades de 3 ou 4 colunas fixas viram 2.
- Tabelas montadas com `<table>` viram bloco com rolagem horizontal; as "tabelas" feitas com `display:grid` e `min-width` (760px, 900px, 920px, 1000px) ficam dentro de um contêiner `overflow-x:auto` e rolam para o lado.
- Painel lateral fixo com `flex:0 0 2xx` e `border-right` (caso do menu de Atividades) vira uma faixa horizontal rolável no topo.
- Telas de altura cheia (`height:100vh`) passam a `100dvh - 56px`.

**Estados comuns.** Carregando: texto cinza `#66666F` 13px centralizado ("Carregando ..."). Erro: caixa vermelha (texto `#C0341C` ou `#96280F`, fundo `rgba(192,52,28,0.06)`, borda `rgba(192,52,28,0.3)`). Vazio: caixa tracejada `1px dashed #DADADF` com texto cinza. Selos de estado seguem a tabela "Cores de estado" do `componentes-e-telas.md`. Toasts: faixa escura `#17171A` (ou `#C0341C` para erro) fixa embaixo no centro, 2,6s (5s no erro). Confirmações usam `zConfirm` (modal, botão perigoso em `#C0341C`). Não há tela de "sem permissão" dedicada nestas telas: a restrição aparece como erro de API, ou escondendo o botão (ex.: "Criar anúncio" só com `souAdmin()`, `index.html` linha 10653).

---

## Gestão Inteligente (hub de motores)

- **Rota e menu:** `/motores` (também `/motor`), item "Gestão Inteligente" (ícone `ICONS.motores`).
- **Objetivo:** escolher entre o Motor de Vendas e o Motor de Growth e ver as habilidades de IA de cada um.
- **Origem:** `renderMotores()` em `index.html` linha 2569; dados em `DATA.engines` (linha 576); rotas dos motores em `MOTOR_ROTAS` (linha 320).
- **Layout:** contêiner `padding:34px 40px 60px; max-width:1240px`. Eyebrow "MOTORES" (10.5px, `letter-spacing:0.16em`, `#673DE6`, 700), título "Escolha um motor" (Space Grotesk 27px/600), parágrafo cinza. Grade `repeat(auto-fit,minmax(340px,1fr))` com gap 20px, um cartão por motor (2 motores = 2 colunas no desktop; no celular uma coluna, regra do `minmax(3`).
- **Cartão de motor** (não usa constante; `border:1px solid #E6E6EA;border-radius:18px;background:#FFFFFF;padding:26px`):
  - Cabeçalho: nome (Space Grotesk 21px/600) e selo "Liberado" (verde `#0F7A68`, contorno `rgba(15,122,104,0.4)`, 11px, pílula).
  - Descrição 13.5px cinza.
  - Botão "Abrir motor" (fundo `#673DE6`, texto branco, `data-hover-dark` escurece para `#5429C9`, ícone seta).
  - Bloco "INTEGRA COM": rótulo 10.5px com tracking, e logos redondos de 34px (`connectorLogoHTML`): Vendas mostra 11 CRMs (HubSpot, Pipedrive, RD Station CRM, Ploomes, Kommo, Nectar, Moskit, Zendesk Sell, Bitrix24, ActiveCampaign, Freshsales); Growth mostra Meta Ads, Google Ads, GA4.
  - Bloco "HABILIDADES DO MOTOR": cartões clicáveis (`border:1px solid rgba(103,61,230,0.14);border-radius:13px;background:rgba(103,61,230,0.04);padding:16px`, `data-hover-border`). Cada um tem nome, selo (RECOMENDADO em roxo ou ATIVO em verde, 9.5px, borda 1px, raio 6px), descrição, três bullets com check roxo, e rodapé cinza.
  - Rodapé: texto "2 de 2 liberadas" e link "Abrir →".
- **Habilidades:** Vendas: "Dashboard" (RECOMENDADO, abre `motorVendas`) e "Auditoria de Vendas" (ATIVO, abre `motorAuditor`, rodapé "Requer Dashboard"). Growth: "Dashboard" (RECOMENDADO, abre `growthDash`) e "Estrategista de Growth IA" (ATIVO, abre `growthAgente`, rodapé "Dados reais de Meta Ads").
- **Interações:** clique em qualquer `data-go` navega (`setState({screen})`). Sem API própria.
- **Estados:** estático, sem carregando nem erro.
- **Observação:** a tela de motores não mostra PDI nem OKRs (não são usados; ver "PDI e OKRs").

---

## Motor de Vendas: barra de abas (componente compartilhado)

Aparece no topo das telas `motorVendas`, `motorAuditor`, `motorQualidade`, `motorDiagnostico`.

- **Origem:** `vendasTabsHTML(ativa, direita)` em `index.html` linha 2616 (sticky, `top:0; z-index:5; fundo #FFFFFF`).
- **Linha 1 (cabeçalho):** botão voltar 32px (`data-go="motores"`, tooltip "Voltar para Gestão Inteligente"), ícone de maleta em quadrado 36px `rgba(103,61,230,0.12)`, título "Execução Comercial" (Space Grotesk 15px/600) e subtítulo "Gestão Inteligente" (12px cinza). Padding `12px 22px`, `flex-wrap:wrap`, borda inferior `#E6E6EA`.
- **Linha 2 (abas em pílula, rolagem horizontal no celular):** "Auditoria de Vendas" (`motorAuditor`), separador vertical 1px, "Gestão Comercial" (`motorVendas`), "Qualidade" (`motorQualidade`), "Diagnóstico" (`motorDiagnostico`). Aba ativa: `font-weight:600; background:rgba(103,61,230,0.12); color:#673DE6`; inativa: `#3C3C44` com `data-hover`. Padding `8px 14px`, raio 9px, 13px.
- Não existe aba para "Execução" nem "Leads": essas rotas redirecionam (ver seção "Rotas redirecionadas").

## Motor de Vendas: Gestão Comercial (Dashboard)

- **Rota e menu:** `/motor/vendas`; entra pelo hub ("Dashboard" do Motor de Vendas ou "Abrir motor"); aba "Gestão Comercial".
- **Objetivo:** painel de indicadores do funil comercial com filtros e ficha de negócio.
- **Origem:** `RENDERERS.motorVendas` em `vendas-demo.js` linha 567; cálculo `calcVendas()` linha 228; `topoV()` 279; `corpoV()` 297; `abrirNegocio()` 389. Reaproveita `mvKpiHTML`, `mvFunilHTML`, `mvMiniHTML`, `mvCard` do `index.html` (linhas 2678 a 2723). Bloco "Leads por canal" em `vendas-canais.js`.
- **Importante (dados):** o painel usa uma **base ilustrativa gerada no navegador** (~1.500 negócios fictícios, semente fixa, 4 vendedores, 3 funis, 6 canais; `vendas-demo.js` linhas 1 a 6 e 64). Só o bloco "Leads por canal" é real. O botão "Sincronizar" é simulado (espera 1,3s e mostra toast); a faixa "Conexão direta com o CRM" é cenográfica. (a confirmar se há plano de ligar ao CRM real)
- **Layout:** `padding:26px 30px 60px; max-width:1240px`. Ordem vertical: faixa CRM, cabeçalho com filtros, aviso "Onde agir", bloco "Leads por canal", grade de 5 KPIs, "Funil de vendas", "Do lead à venda", par "Velocidade e esforço" + "Por que não fecha", tabela "Desempenho por canal", "Oportunidades em risco", tabela "Maior valor em aberto".
- **Faixa "Conexão direta com o CRM"** (`crmHTML`, linha 207): caixa verde (`border:1px solid rgba(15,122,104,0.32);background:rgba(15,122,104,0.06);border-radius:12px`), ícone de conectores, selo verde com ponto pulsante, resumo "N negócios, 3 funis, 4 vendedores, 6 canais", "Última sincronização: há N min" (atualiza a cada 30s) e botão "Sincronizar" (ícone gira enquanto roda).
- **Cabeçalho + filtros:** título "Dashboard" (24px/600), texto "Visão geral dos seus indicadores comerciais · N negócios no recorte". À direita, 5 chips de filtro (`chipsHTML`): Funil, Período (7, 30, 90 dias, 3 meses e ano), Status (todos, em aberto, ganhos, perdidos), Vendedor, Etapa. Chip: pílula 20px de raio, `padding:9px 13px`, borda `#DADADF`; quando diferente do padrão fica com borda `rgba(103,61,230,0.45)`, fundo `rgba(103,61,230,0.06)` e texto roxo. Menu suspenso: `min-width:220px; max-height:340px`, sombra `0 14px 34px rgba(23,23,26,0.16)`, cada opção com check roxo e contagem de itens à direita. Abaixo, quando há filtro ativo, chip "Canal: X" com `x` e link "Limpar filtros".
- **Aviso "Onde agir":** caixa `border:1px solid rgba(103,61,230,0.24);background:rgba(103,61,230,0.05);border-radius:12px` com ícone de raio e texto calculado (maior vazamento do funil, valor parado, motivo de perda nº 1).
- **Bloco "Leads por canal"** (`vendas-canais.js`, `vendasCanaisHTML`): cabeçalho com rótulo "LEADS POR CANAL", selo verde "DADOS REAIS · CRM" e botão "Atualizar". Dois cartões lado a lado (grade `minmax(340px,1fr)`): **WhatsApp** (cor `#1E9E52`, selo "SDRs + CRM"; 4 números: Conversas, Ativas em 7 dias, Aguardando resposta, Leads no CRM; chips por SDR; barras "LEADS POR ETAPA · CRM" com 6 etapas coloridas) e **Instagram** (cor `#E1306C`, selo "Direct"; Conversas no Direct, Ativas em 7 dias, Aguardando resposta, Com agente de IA; lista "ÚLTIMOS LEADS" com ponto laranja ou verde). Rodapé "Fonte: ... atualizado dd/mm hh:mm" (horário de São Paulo). Cartão: `border:1px solid <cor>40; border-radius:14px; background:linear-gradient(180deg,<cor>0D,#FFFFFF 45%)`. Recarrega sozinho se o dado tem mais de 60s. Estados: "Carregando conversas e leads do CRM...", "Não consegui ler o WhatsApp dos SDRs agora. Tente atualizar em instantes.", "Nenhum lead no CRM ainda."
- **KPIs** (`mvKpiHTML`): grade `repeat(auto-fit,minmax(290px,1fr))`, cartão `border:1px solid #E6E6EA;border-radius:14px;padding:16px 18px`. Rótulo 10.5px caixa alta; valor Space Grotesk 26px/600; variação com seta (verde `#0F7A68` se sobe, vermelho `#C0341C` se cai) e nota. Cinco: Novos leads, Taxa de conversão, Faturamento, Ticket médio vendido, Nota do atendimento.
- **"Funil de vendas"** (`mvCard` + `mvFunilHTML`): à esquerda funil SVG de 5 faixas (cores `#DCD3F9`, `#B9A6F2`, `#9377EB`, `#673DE6`, `#3E22A8`), à direita lista das etapas (Leads, Contatados, Qualificados, Orçados, Fechados) com contagem, valor e %. Hover numa faixa mostra dica flutuante (`min-width:190px`, sombra `0 12px 32px`) com conversas, valor em orçamento, % do topo e quantos ficaram pelo caminho. Ao lado, grade de 6 mini-cartões (`mvMiniHTML`: fundo `rgba(103,61,230,0.06)`, borda `rgba(103,61,230,0.12)`, rótulo `#7A64C2`).
- **"Do lead à venda":** degraus horizontais com rolagem; entre eles a % de passagem (vermelho se abaixo de 40%); degrau normal com borda esquerda 3px `#673DE6`, o último (ganho) em verde `#0F7A68`.
- **"Velocidade e esforço"** (2 mini-cartões) e **"Por que não fecha"** (mini-cartão "taxa de perda" em vermelho + barras de motivos, trilho `rgba(103,61,230,0.10)` e preenchimento `#C2378F`).
- **Tabela "Desempenho por canal":** colunas `1.8fr 0.8fr 1fr 1fr 1.1fr 1.1fr`, `min-width:760px`, cabeçalho 10.5px com tracking. Linha clicável filtra o painel todo pelo canal (selecionada: fundo `rgba(103,61,230,0.07)`, nome roxo com check).
- **"Oportunidades em risco":** grade `minmax(330px,1fr)` de linhas clicáveis (negócio sem movimento há 5 dias ou mais, "parado N dias", valor).
- **Tabela "Maior valor em aberto":** colunas `2fr 1fr 1fr 1fr 1fr`, até 8 linhas, vendedor sublinhado pontilhado (clicar filtra), valor roxo.
- **Modal "Ficha do negócio"** (`abrirNegocio`): overlay `rgba(23,23,26,0.45)`, caixa de 560px, raio 16px, sombra `0 24px 60px rgba(23,23,26,0.3)`. Cabeçalho "Negócio #id · CRM", nome, selo (Ganho verde, Perdido vermelho, Em aberto roxo), 6 campos (valor, etapa, vendedor, canal, nota do atendimento, previsão), "LINHA DO TEMPO" com pontos, caixa "Próximo passo sugerido", botões "Ver só negócios de <nome>" e "Fechar". Fecha com Esc ou clique fora.
- **Estados:** filtros sem resultado: caixa tracejada "Nenhum negócio do CRM bate com esses filtros. Limpar filtros". Listas vazias têm mensagem própria ("Nenhum negócio parado neste recorte.", "Nenhum negócio em aberto neste recorte.", "Nenhum orçamento perdido neste recorte.").
- **Celular:** KPIs, funil+estatísticas, pares de cartões viram uma coluna; as duas tabelas rolam no horizontal; faixa CRM quebra linha; chips de filtro quebram linha.
- **APIs:** a base do painel é local (sem API). Bloco de canais chama `GET /api/whatsapp/p/conversations?limit=300`, `GET /api/whatsapp/crm/leads`, `GET /api/instagram/p/threads`.

## Motor de Vendas: Auditoria de Vendas (chat de análise)

- **Rota e menu:** `/motor/vendas/auditor`; aba "Auditoria de Vendas" (primeira da barra); também aberta pela habilidade do hub.
- **Objetivo:** chat em português que consulta conversas de WhatsApp, leads e CRM e responde com números.
- **Origem:** `RENDERERS.motorAuditor` em `analise.js` linha 155; `corpo()` 139; `vazio()` 88; `mensagens()` 118; `perguntar()` 44; `historico()` 130.
- **Layout:** barra de abas do motor + contêiner `padding:24px 30px 0; max-width:1180px; margin:0 auto`. Topo com botões "Nova conversa" (só com mensagens) e "Conversas" (histórico), ambos `border:1px solid #DADADF;border-radius:9px;padding:8px 13px`.
- **Estado vazio (hero):** rótulo "Auditoria de Vendas", título "Pergunte qualquer coisa sobre as vendas" (28px/600), parágrafo, campo de mensagem (caixa `border:1px solid #DADADF;border-radius:16px;padding:14px 16px 12px`, textarea de 3 linhas, dica "Enter envia · Shift+Enter quebra linha", botão de microfone e botão de enviar redondo 34px roxo), texto "O ZEUS escolhe o melhor modelo para cada pedido", carrossel de logos (`zeusLogoMarquee`) e 4 sugestões em cartões (`border:1px solid #E6E6EA;border-radius:12px`, `minmax(260px,1fr)`) que trocam a cada 7s (pausam com mouse em cima ou texto digitado). O pool vem de 7 temas (Para agir hoje, Desempenho dos vendedores, Funil, Mercado, Para treinar a equipe, Dinheiro, Para montar scripts) em `TEMAS` (linha 8).
- **Conversa:** pergunta do usuário alinhada à direita (bolha `rgba(103,61,230,0.12)`, borda `rgba(103,61,230,0.22)`, raio `14px 14px 4px 14px`, máx. 75%); resposta à esquerda com ícone de raio em quadrado 30px, cartão branco `border:1px solid #E6E6EA`, texto Markdown (`mdToHtml`, 13.5px/1.7). Bloco `<details>` "Apurando / O que foi apurado (N consultas)". Campo de mensagem fica fixo no rodapé com gradiente, e aviso "As respostas vêm de consultas feitas aos dados no momento da pergunta. Confira os números antes de decisões grandes."
- **Histórico:** popover à direita (340px, máx. 420px de altura) com conversas salvas e botão de apagar.
- **Interações:** clicar numa sugestão envia a pergunta; Enter envia (bloqueado enquanto há resposta em andamento, com toast "Ainda estou respondendo..."); microfone usa `micGravar`; apagar conversa pede `zConfirm`.
- **Estados:** resposta em andamento (ponto pulsante `tm-pulse` + "Preparando o contexto do seu mercado..." / "Consultando os dados..." / "Entendendo..."); erro mostra a mensagem em `#C0341C`; histórico "Carregando..." / "Nenhuma conversa ainda."
- **Celular:** sugestões em uma coluna; campo de mensagem em largura total.
- **APIs (base `/api/vendas`):** `POST /analise` (pergunta, devolve job e id da conversa), `GET /analise/job/<id>` (polling a cada 2s), `GET /analise/conversas`, `GET /analise/conversa/<id>`, `DELETE /analise/conversa/<id>`.
- **Código morto:** `renderMotorAuditor` do `index.html` (linha 2656; cartão "Auditar atendimento comercial") e `auditoria.js` (auditoria por vendedor e conversa) não aparecem na interface.

## Motor de Vendas: Qualidade

- **Rota e menu:** `/motor/vendas/qualidade`; aba "Qualidade".
- **Objetivo:** nota do atendimento (0 a 10, 7 critérios de venda consultiva) por conversa e por vendedor.
- **Origem:** `RENDERERS.motorQualidade` em `vendas-demo.js` linha 576; `calcQ()` 441; `topoQ()` 452; `corpoQ()` 488; `conversaHTML()` 462.
- **Dados:** mesma base ilustrativa da Gestão Comercial (ver aviso lá).
- **Layout:** igual à Gestão Comercial (faixa CRM + cabeçalho "Qualidade do atendimento" com filtros Período, Vendedor, Canal (WhatsApp, Instagram)).
- **Componentes:**
  - 5 KPIs (`mvKpiHTML`, grade `minmax(200px,1fr)`): Nota média, Conversas avaliadas, 1ª resposta (mediana), Com próximo passo (%), Alertas (nota abaixo de 5).
  - "Nota por critério" (`mvCard` com ícone de estrela): barras de 8px por critério (Velocidade de resposta, Abertura e conexão, Diagnóstico, Apresentação de valor, Tratamento de objeção, Pedido de fechamento, Follow-up); cor da barra por `notaCor`. "Erros mais comuns": barras `#C2378F`.
  - Tabela "Ranking do time": colunas `1.6fr 0.7fr 0.8fr 0.9fr 1.4fr 1.4fr`, `min-width:760px`, avatar de iniciais 30px (`rgba(103,61,230,0.12)`), nota em Space Grotesk 15px, 1ª resposta em vermelho se passa de 60 min, ponto forte em verde e ponto a melhorar em vermelho; troféu no 1º. Clicar filtra por vendedor.
  - "Conversas avaliadas": seletor segmentado (fundo `#F2F2F4`, raio 10px) "Todas / Notas baixas (menor que 6) / Notas altas (8 ou mais)"; cada linha tem selo quadrado 44px com a nota, nome do negócio, vendedor · canal · data · 1ª resposta, até 2 selos vermelhos de erro (`rgba(192,52,28,0.07)`) ou selo verde, e seta. Linha expandida mostra trecho do chat (bolhas: vendedor `#E6DEFC`, lead branco) à esquerda e à direita grade de notas por critério, três caixas coloridas "O que foi bem" (verde), "O que faltou" (vermelho), "Como melhorar" (roxo). Paginação "Ver mais N de M restantes" (10 por vez).
- **Estados:** sem conversas: caixa tracejada "Nenhuma conversa avaliada com esses filtros. Limpar filtros"; lista vazia "Nenhuma conversa nesta lista."; "Nenhum erro grave neste recorte."
- **Celular:** KPIs e pares de cartões em coluna; ranking rola no horizontal.
- **APIs:** nenhuma (dados locais).

## Motor de Vendas: Diagnóstico

- **Rota e menu:** `/motor/vendas/diagnostico`; aba "Diagnóstico".
- **Objetivo:** leitura analítica escrita pela IA (conversas de WhatsApp e leads do CRM), por tipo e período, guardada para reabrir.
- **Origem:** `RENDERERS.motorDiagnostico` em `diagnostico.js` linha 154; `leitura()` 97; `cartoes()` 84; `jaGerados()` 133; `cabecalhoFontes()` 69; `modalContexto()` 144. Constante local `BOX` (igual a `CFG_BOX` com `margin-bottom:16px`).
- **Layout:** barra de abas + `padding:26px 30px 60px; max-width:1240px`; título "Diagnóstico" (24px/600) e parágrafo. Corpo em `#dg-root` com três caixas empilhadas.
- **Caixa 1, faixa de fontes:** `border:1px solid #E6E6EA;border-radius:12px;padding:12px 16px`, mostra "N números de WhatsApp · N conversas · N leads importados" com link "configurar em Conectores" (vai para `waConnector`) e a linha do contexto do mercado ("Contexto do seu mercado gerado do Radar ZEUS em dd/mm/aaaa · ver", ou aviso âmbar `#B7791F` para preencher o Radar ZEUS).
- **Caixa 2, "Leitura analítica das conversas e dos leads":** pílulas de tipo (ativa: fundo `#673DE6`, texto branco; inativa: borda `#DADADF`; o tipo "sob_medida" tem ícone de lápis), seletor de período "7 / 30 / 90 dias" (segmentado, ativo `rgba(103,61,230,0.12)`) e campos de data "de" e "até"; para "sob medida" aparece um textarea de pedido. Faixa lilás `#F4F2FC` com "<tipo> · período", contagem de mensagens e leads, estado ("gerado em ...", "ainda não gerado", "procurando...") e botão "Gerar diagnóstico" / "Refazer" / "Gerando...". Resultado: caixa "RESUMO" (`border:1px solid rgba(103,61,230,0.22);background:rgba(103,61,230,0.04)`), grade `minmax(340px,1fr)` de blocos coloridos por tipo (Alerta `#C0341C`, Atenção `#B7791F`, Oportunidade `#0F7A68`, Diagnóstico `#673DE6`), cada um com título, texto, bullets e itens "Ação:" destacados em caixa branca com ícone de raio; `<details>` "O que foi apurado (N consultas)".
- **Caixa 3, "Diagnósticos já gerados":** lista clicável (nome, período, pedido, data) que reabre sem gerar de novo.
- **Interações:** trocar tipo, período ou datas recarrega o recorte; "Gerar" cria job e consulta a cada 2,5s; "ver" abre modal "Contexto do seu mercado" (`pdiModal`, 760px, textarea de 18 linhas, link "Gerar de novo do Radar ZEUS" com `zConfirm`; só administradores salvam); link "Radar ZEUS" abre a ferramenta `radar-zeus`.
- **Estados:** gerando (caixa tracejada com fases "Preparando a leitura...", "Escrevendo o contexto do seu mercado a partir do Radar ZEUS...", "A IA está apurando os números...", lista de consultas com check verde, texto parcial e aviso "Leva de 1 a 5 minutos. Pode sair da tela..."); procurando ("Procurando esta leitura..."); vazio ("Ainda não existe esta leitura de dd/mm a dd/mm. Clique em Gerar diagnóstico..."); erro por toast; lista "Nenhum diagnóstico gerado ainda."
- **Celular:** pílulas e datas quebram linha; blocos em uma coluna.
- **APIs (base `/api/vendas`):** `GET /diagnostico/tipos`, `GET /diagnostico/lista`, `GET /fontes`, `GET /contexto`, `GET /diagnostico?tipo=&de=&ate=[&pedido=]`, `GET /diagnostico?chave=`, `POST /diagnostico`, `GET /diagnostico/job/<id>`, `PUT /contexto`, `POST /contexto/gerar`.

## Motor de Vendas: rotas redirecionadas

- `/motor/vendas/execucao` (`motorExec`): `analise.js` troca por `motorAuditor` (setState logo após renderizar). O chat "Copiloto ZEUS" antigo (`renderMotorExec`, `index.html` 2847) não é mais exibido. A tela fica sem aba própria na barra.
- `/motor/vendas/leads` (`motorLeads`): `vendas-demo.js` linha 585 redireciona para `motorVendas` ("Engenharia de Leads fica oculta").
- As telas "EM BREVE" de `motorEmBreveHTML` (index.html 2639: ícone de relógio em quadrado 52px, eyebrow "EM BREVE") só aparecem se o script de override não carregar.

---

## Motor de Growth: Dashboard (Meta Ads)

- **Rota e menu:** `/motor/growth`; hub, habilidade "Dashboard" do Motor de Growth.
- **Comportamento de rota:** `RENDERERS.growthDash` não desenha a tela: chama `abrirEstrategista()` (`growth-dash.js` linha 396), que faz `setState({screen:"agente", agentId:"estrategista-growth"})` com a aba `dash` (ou `ia`). A URL passa a ser `/agente/estrategista-growth`. Por isso o item "Gestão Inteligente" do menu deixa de ficar ativo nessa tela (a variável `isMt` só vê `growthDash`). (a confirmar se o destaque do menu é corrigido em outro ponto)
- **Moldura:** página de agente (`index.html` linhas 6844 a 6900): barra `#ag-tabs` (`padding:10px 22px`, borda inferior, fundo branco) com abas "Agente", separador, "Dashboard" e "Análise dos Anúncios IA" (`agPanelTabsInner`); aba ativa em pílula `rgba(103,61,230,0.12)`/`#673DE6`. Painel nativo `#ag-native` (`height:100%; overflow-y:auto; background:#F6F6F7`). Definição das abas em `agents-seed.js` linhas 313 a 316 ("Copiloto de Growth", aba padrão `chat`).
- **Origem:** `gwRenderDash(embed)` em `growth-dash.js` linha 336; `corpoMeta(g)` 141; seletor Meta | Google | Ambos via `window.agNativeTabsExtra` (linha ~403), colado à aba Dashboard.
- **Layout:** `padding:26px 30px 60px; max-width:1240px`. Cabeçalho "Visão de performance" (22px/600) + texto e à direita: seletor de conta (`select.cat-select`, agrupado por `optgroup`, máx. 280px), seletor de período (7d, 14d, 30d, 90d, este mês, mês passado) e botão roxo "Sincronizar" (ícone, 0,6 de opacidade ao carregar). Avisos da API em faixas roxas (`border:1px solid rgba(103,61,230,0.35);background:rgba(103,61,230,0.06);color:#4B23B8`).
- **Corpo (Meta):** linha de identidade (logo Meta Ads 30px, "Meta Ads", chip cinza com a conta, selo "Saúde N/100" verde se 80 ou mais, roxo se 60 ou mais, vermelho abaixo; período à direita). Faixa de métricas: coluna "Investimento" (40px, gráfico de área com gradiente) e grade `minmax(150px,1fr)` de métricas com sparkline e variação (▲ ▼ verde/vermelho, invertida para custos): Impressões, Alcance, Cliques, Leads/Conversas/Compras (os que existirem), CTR, CPC, CPM, custo por resultado, ROAS (se houver receita). Seções com título `h2` 19px e subtítulo: **Tendências** (4 gráficos de linha SVG `minmax(250px,1fr)` e 2 gráficos combinados barra+linha `minmax(380px,1fr)`), **Diagnóstico** (cartões "Investimento por campanha", "Funil de tráfego", "Saúde da conta" com anel SVG, "Recomendações" com selos Alta/Média/Tudo certo, "Investimento por objetivo", "Distribuição por tipo de resultado"), **Público** (Faixa etária, Gênero, Top regiões por alcance), **Campanhas** (chips de filtro por objetivo + tabela `min-width:820px` com colunas Campanha, Objetivo, Status, Investido, Impressões, Cliques, CTR, CPC, Result., Custo/res.; status Ativa verde, Pausada cinza, Com problema vermelho, Em análise roxo), **Criativos** (cartões `minmax(210px,1fr)` com miniatura quadrada, métricas 2x2, mais "Melhores anúncios por custo de resultado"). Rodapé 11.5px: "Dados da Meta Marketing API, em cache por 10 minutos...".
- **Cartão de gráfico:** função local `card(titulo, corpo, direita)`: `border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF`, cabeçalho 14px 16px com borda inferior, título 13.5px/600 (padrão próximo de `HC_BOX`, sem usar a constante).
- **Barra de plataforma:** `barraPlataforma` (linha 114) com seletor segmentado Meta/Google/Ambos (fundo `rgba(103,61,230,0.06)`), vista Dashboard/Análise e botão "Perguntar ao Estrategista"; usada só quando a tela não está embutida (`embed=false`). Botão "Criar anúncio" (roxo) só para admin e fora da aba Google.
- **Google:** aviso `googleVazio` (caixa tracejada, logo Google Ads, "Google Ads ainda não está conectado", lista das credenciais que faltam); em "Ambos" aparece compacto acima dos dados da Meta. Sem credenciais do Google no servidor.
- **Estados:** "Carregando contas de anúncio...", "Nenhuma conta de anúncio acessível. Verifique os tokens da Meta em Chaves.", "Buscando os números na Meta...", erro em caixa vermelha ("A Meta não respondeu para esta conta: ..."); durante recarga o corpo fica com 0,45 de opacidade. Lembra conta e período em `localStorage` (`gw_conta`, `gw_periodo`).
- **Celular:** grades `minmax(250px` a `minmax(380px` viram uma coluna; tabela de campanhas rola no horizontal; barra de abas rola.
- **APIs:** `GET /api/growth/accounts`, `GET /api/growth/meta?account_id=&preset=[&force=1]`.

## Motor de Growth: Análise dos Anúncios IA

- **Rota e menu:** mesma moldura de `/agente/estrategista-growth`, aba "Análise dos Anúncios IA" (`view:"ia"`).
- **Objetivo:** IA lê a conta Meta, dá diagnóstico e sugere ações aplicáveis na conta.
- **Origem:** `iaVista(g)` em `growth-dash.js` linha 277; `iaAnalisar()` 244; `iaAplicar()` 265.
- **Layout:** `padding:26px 30px 60px; max-width:1240px`. Título "Análise dos Anúncios IA" (22px/600). Caixa de filtros (`border:1px solid #E6E6EA;border-radius:14px;padding:18px 20px`): conta, período (7d, 14d, 30d, este mês, mês passado), checkbox "Incluir campanhas e anúncios inativos"; rótulos 10.5px caixa alta. Caixa "Pergunte para a IA" (textarea de 3 linhas, atalhos em pílulas "Top criativos", "Campanhas problemáticas", "Onde escalar", "Ângulos vencedores", botão "Gravar" com microfone e botão roxo "Analisar").
- **Resultado:** caixa de resumo roxa (headline 19px/600 + texto), grade de KPIs `minmax(150px,1fr)`, seção "Ações recomendadas" (cada ação: selo de tipo Pausar vermelho, Ativar verde, Orçamento roxo, Manual cinza; prioridade Alta/Média/Baixa; alvo; motivo; impacto esperado; botão roxo "Aplicar", ou "Aplicado" verde, ou "Fazer no Gerenciador" para manual), cartões "O que está funcionando" e "O que não está funcionando".
- **Interações:** "Aplicar" abre `zConfirm` ("Isso altera a conta X na Meta agora."), chama a API e marca como aplicado; erro aparece em vermelho na própria linha.
- **Estados:** analisando (caixa roxa com ponto pulsante e fase "coletando", etc.), erro (caixa vermelha), vazio "A IA não sugeriu ações para este período." Em Google mostra o aviso de conexão.
- **APIs:** `POST /api/growth/analyze` (devolve job), `GET /api/growth/analyze/<job>` (polling a cada 3s), `POST /api/growth/apply`.

## Motor de Growth: Estrategista de Growth IA (chat)

- **Rota e menu:** `/motor/growth/agente` (`growthAgente`), habilidade "Estrategista de Growth IA".
- **Comportamento:** `RENDERERS.growthAgente` também só chama `abrirEstrategista("chat")` (`growth-dash.js` linha 429) e abre `/agente/estrategista-growth` na aba "Agente" (chat). A tela de chat é a do agente (`renderAgenteChat`, `index.html`), documentada na seção de Agentes; o agente consulta Meta Ads por `tools/growth` (`agents-seed.js` linha 125). A antiga maquete `renderGrowthAgente` (index.html 3205) não aparece.
- **Particularidade:** a barra de abas do agente mostra o seletor Meta | Google | Ambos mesmo na aba chat; clicar numa plataforma leva ao Dashboard (`growth-dash.js` linhas ~412 a 422).

## Motor de Growth: modal "Criar anúncio na Meta"

- **Entrada:** botão "Criar anúncio" (roxo, ícone +) da barra de plataforma, só para administrador (`souAdmin()`), chama `gcAbrir()`.
- **Origem:** `growth-criar.js`; `formHTML()` linha 110, `desenhar()` 158, `previaHTML()` 100. Constantes locais `IN`, `BTN`, `BTN_PRI`, `LBL`, `HELP`, `SEC` (parecidas com `CFG_IN` e `LI_BTN`/`LI_BTN_PRI`).
- **Layout:** overlay `rgba(23,23,26,0.45)` (z-index 80), caixa de 920px, raio 18px, sombra `0 24px 70px`, rolagem interna. Seções empilhadas (`SEC`: `padding:16px 22px; border-top:1px solid #F1F1F3`): Conta e nome, Objetivo (3 cartões: Tráfego para o site, Mensagens, Alcance; para Mensagens, chips de destino WhatsApp, Direct do Instagram, Messenger), Quem assina (página, checkbox de Instagram), Público (busca de locais com raio, idade, gênero, Advantage+), Orçamento e datas, Anúncio (upload de imagem ou vídeo, texto, título, link e botão; prévia aproximada de 340px ao lado, em uma coluna abaixo de 760px). Rodapé fixo com Cancelar, "Validar" e "Criar pausado".
- **Fluxo:** "Validar" confere na Meta sem criar; "Criar pausado" (`zConfirm`) cria campanha, conjunto e anúncio pausados; tela final "Anúncio criado e pausado" com "Ativar agora", "Abrir no Gerenciador de Anúncios" e "Criar outro". Erros em caixa vermelha no rodapé, avisos de validação em verde; aviso quando o token só tem leitura.
- **APIs:** `GET /api/growth/criar/contexto?account_id=`, busca de locais e upload de mídia (rotas em `/api/growth/criar`, nomes exatos a confirmar no backend), `POST /api/growth/criar/validar`, `POST /api/growth/criar`, `POST /api/growth/apply` (ativar).

---

## PDI e OKRs

Fora do design system: as telas existem no código (`pdi.js`, `okrs.js`), mas não são usadas (decisão do Jeff em 16/10/2026).

## Atividades (Gestão de atividades)

- **Rota e menu:** `/acoes`; item "Atividades" (grupo EXECUTAR E COMUNICAR, ícone `ICONS.acoes`).
- **Objetivo:** gerenciar as tarefas do ClickUp (ver, filtrar, criar, concluir, comentar) e acompanhar entregas da equipe.
- **Origem:** `acoes.js`: `RENDERERS.acoes` linha 826; `page()` 397; `sidebar()` 404; `cabecalho()` 458; `filtros()` 467; `lista()` 486; `linha()` 506; `painel()` 383; `abrirNova()` 684; `abrirDetalhe()` 728. Constantes locais `IN`, `SEL`, `BTN_PRI`, `BTN_SEC`, `BOXP` (igual a `PDI_BOX` sem padding), `GRID` (colunas da lista). A maquete antiga é `renderAcoes` (`index.html` 4400).
- **Escopo real:** a tela cobre tarefas ("ações") do ClickUp. **Não há** abas de chamados ou suporte, e **prioridade não é uma tela**: é um campo e um filtro (Urgente, Alta, Normal, Baixa). (a confirmar se "chamados" vive em outro módulo)
- **Layout:** duas colunas, `display:flex; min-height:100vh`. Esquerda `#acoes-side` (236px, `flex:0 0 236px`, borda direita `#E6E6EA`, padding `24px 16px 40px`); direita `#acoes-main` (`flex:1; padding:26px 30px 60px`). No celular a coluna esquerda vira faixa horizontal rolável no topo (regra `[style*="flex:0 0 2"][style*="border-right"]`).
- **Menu interno (esquerda):** título "Gestão de atividades" (Space Grotesk 14px/600); botão primário "Nova ação" (com atalho `C`); linha "Atualizado há N" + botão atualizar; "Painel de entregas"; "Todas as ações" e "Concluídas" com contagem; seção RESPONSÁVEL (cada membro com avatar 18px e contagem; "Sem responsável"); seção PRAZO (Atrasadas em destaque de alerta, Para hoje, Esta semana); seção PROJETOS (Spaces com bolinha colorida (paleta de 6 cores), pastas e listas recuadas, com contagem de abertas). Item ativo: texto roxo `#673DE6`, negrito, fundo roxo claro. Títulos de seção 10px, tracking `0.14em`, `#66666F`.
- **Cabeçalho da lista:** título e subtítulo mudam por visão (ex.: "Todas as ações", "Atrasadas", "Ações de <nome>", nome do space ou lista); no Painel aparece o seletor Hoje / Semana / Mês.
- **Barra de filtros** (não aparece no Painel): busca (ícone de lupa, atalho `/`, por título, tag ou lista), selects Responsável (inclui "Sem responsável"), Prioridade, Status, "Agrupar: status / lista", checkbox "Mostrar concluídas". Selects com `appearance:auto`, borda `#DADADF`, raio 9px.
- **Lista agrupada** (`border:1px solid #E6E6EA;border-radius:14px;overflow-x:auto`): cabeçalho de colunas (10.5px, tracking) TÍTULO, LISTA, RESPONSÁVEL, PRIORIDADE, PRAZO; grade `30px minmax(240px,2.4fr) 1.15fr 1fr 0.8fr 0.9fr 34px`, `min-width:920px`. Cabeçalho de grupo recolhível (fundo `#F7F7F8`, seta, bolinha na cor do status do ClickUp, nome, contagem). Linha: círculo de 17px para concluir/reabrir (verde quando concluída), ícone de subtarefa, título (riscado e com opacidade 0,6 se concluída), tags (borda `#DADADF`, raio 6px), chip da lista com pasta, avatares 22px e primeiro nome, ponto de prioridade (Urgente `#C0341C`, Alta `#673DE6`, Normal `#2459C9`, Baixa cinza) e prazo (vermelho se atrasado, roxo se hoje, cinza se sem prazo, em negrito quando importa), link para abrir no ClickUp. Ordenação: atrasadas primeiro, depois prazo, prioridade, última atualização.
- **Painel de entregas** (visão `painel`): abas internas em pílula (Visão geral, Por pessoa, Ciclos, Carga semanal). Visão geral: 4 KPIs (`kpiG`: Criadas, Concluídas, Entregues no prazo com barra verde ou âmbar `#B7791F` ou vermelha, Tempo registrado; com variação contra o período anterior), chips (atrasadas, aguardando validação, abertas no total, pontos de complexidade), gráfico "Criadas vs concluídas", cartão "Ritmo" e "Quem mais entregou". Por pessoa: tabela (`min-width:640px`) Pessoa, Concluídas, No prazo, Criadas, Abertas, Atrasadas, Tempo. Ciclos: ciclo médio e mediano, faixas de tempo e ciclo médio por lista. Carga: barras empilhadas por pessoa (atrasadas, vencem esta semana, depois, sem prazo).
- **Modal "Nova ação"** (`abrirNova`): título, lista, status (carrega os status da lista escolhida), responsáveis (checkboxes), prioridade, prazo com hora, descrição; botões "Cancelar" e "Criar ação". Lista e responsável vêm pré-preenchidos conforme a visão aberta.
- **Modal de detalhe** (`abrirDetalhe`, id `acoes-modal`): edita título, status, prioridade, prazo, responsáveis, descrição; subtarefas; datas de criação, atualização e conclusão; comentários com campo (Ctrl+Enter envia); rodapé com "Abrir tarefa" (ClickUp), "Excluir" (vermelho, `zConfirm`), "Fechar" e "Salvar". Também aberto por outras telas via `data-abrir-tarefa` (ex.: "Seu dia" da Home).
- **Interações:** clique no círculo alterna concluída/aberta com atualização otimista (reverte em caso de erro); atalhos `C` (nova) e `/` (busca); atualiza sozinho a cada 2 minutos (silencioso, sem repintar se há campo em uso) e o texto "Atualizado há N" a cada 30s; repinta só o bloco afetado (lista, menu, cabeçalho ou filtros) para manter foco e rolagem.
- **Estados:** carregando ("Carregando ações…"), erro (caixa vermelha "Não foi possível carregar as ações." com botão "Tentar de novo"; se for HTTP 404, mensagem de que a rota `/api/clickup` ainda não está ativa no servidor), vazio ("Nenhuma ação aqui." com link para limpar filtros), menu de projetos "Carregando…" / "Nenhum space". Não há estado de sem permissão; falhas de gravação viram toast vermelho "Falhou: ...".
- **Celular:** menu interno vira faixa horizontal; filtros quebram linha; lista rola no horizontal (`min-width:920px`); KPIs `minmax(210px` em uma coluna.
- **APIs (base `/api/clickup`):** `GET /overview[?force=1]`, `GET /tasks/<id>`, `POST /tasks`, `PUT /tasks/<id>`, `DELETE /tasks/<id>`, `POST /tasks/<id>/comments`.

---

## Fora do escopo deste arquivo

- **SWOT** fica no menu **Ferramentas** (`ferramentas`, `swot`, `ferramenta`, `aplicacao` marcam o item "Ferramentas" como ativo, `index.html` linha 922), `renderSwot` na linha 4273; não está em Gestão Inteligente nem em Atividades e não foi documentado aqui.
- A tela de chat do agente (aba "Agente" do Estrategista de Growth) e o chat da Home (`startChatFromHome`) pertencem às seções de Agentes e Home.
