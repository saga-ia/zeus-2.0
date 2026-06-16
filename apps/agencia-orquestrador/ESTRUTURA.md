# Alpha Digital Consultoria Estrategica — estrutura

Fonte da verdade da agencia. Atualizar aqui quando algo mudar.
Briefing original: conversa 2026-05-12 com Jeff.

## A agencia

**Alpha Digital Consultoria Estrategica.** Especialistas em **posicionamento arquetipico** e **lancamento**.

**O que fazemos:** pegamos players de mercado e fazemos reestruturacao, reposicionamento, esteira de produtos e estrutura operacional completa. Trabalho em **ciclos**, **individualizado**, com **poucos clientes selecionados** (nao trabalhamos com muitos clientes).

**Diferencial vs agencias comuns:** cuidamos do cliente de maneira individualizada; criamos para cada cliente:
- posicionamento arquetipico
- identidade visual e branding
- esteira de produtos completa baseada em dados de mercado
- estrutura operacional inteira pra o cliente ter sucesso

## ZEUS — orquestrador

ZEUS eh **o gestor (orquestrador) da agencia**. Cuida de todos os agentes que prestam servico. Tambem atua como **secretaria executiva do Jeff**:

- acesso ao banco de dados do worker
- acesso a Google (Drive/Gmail/Calendar/Sheets/Contacts)
- acesso a Instagram e Facebook
- acesso a agenda do Jeff
- marca, confirma, contata cliente
- manda informacoes pro cliente quando Jeff pede

Identidade tecnica completa: `/opt/jeff-worker/CLAUDE.md`.

## Tres camadas

### Camada 1 — Linha de frente (orbita o ZEUS)

| Quem | Tipo | Papel |
|------|------|-------|
| **Jefferson Henrike** | humano | dono da Alpha, voz ativa e final em todo projeto |
| **Vinicius** | humano | programador, resolve problemas de sistema que ninguem mais resolve |
| **Sobral** | agente | gestor de trafego Meta + Google Ads |
| **Maicon** | agente | estrategista de conteudo |
| **Icaro** | agente | copywriter |
| **Smith** | agente | engenharia de software + cyber seguranca |

Detalhes dos agentes em `/root/.claude/agents/`:
- `sobral-trafego.md`
- `maicon-estrategista.md`
- `icaro-copywriter.md`
- `smith-engenharia.md`

Quando o ZEUS precisa de uma capacidade especifica, ele chama o agente da C1 correspondente via subagent.

### Camada 2 — Parceiros humanos

Pessoas humanas com acesso ao sistema. Cadastro:

1. Pessoa envia mensagem ao ZEUS: "faça parte da equipe da Alpha".
2. ZEUS chama Jeff no WhatsApp avisando do pedido.
3. Jeff autoriza com **nivel de acesso especifico** (Jeff define caso a caso).
4. ZEUS cadastra na tabela `jeff_team` (ja existe no worker.db, 4 linhas atuais) e/ou nas tabelas novas da agencia.

Acesso eh **granular por pessoa**; Jeff define o que cada um pode pedir.

### Camada 3 — Clientes

Cliente da Alpha. Fluxo de entrada:

1. Cliente se cadastra na **area de membros**.
2. Responde **formulario** com dados do projeto.
3. Dados entram no sistema e atualizam **dashboard do cliente**.
4. Cliente acessa o dashboard pra acompanhar projeto.
5. Jeff manda contexto pro ZEUS sobre quem eh aquele cliente e qual nivel de atendimento.

#### Clientes ativos hoje (2026-05-12)

| Cliente | Setor | App/Dashboard | Status |
|---------|-------|---------------|--------|
| **CIGC** — Congresso Internacional de Clinicas Multidisciplinares | eventos/saude | `jeff-cigc-clientarea` (cliente) + `jeff-cigc-comercial` (interno) | ativo, ja com dados |
| **Farias** | conselho (empresa grande) | `jeff-farias-clientarea` | cadastro em curso |
| **EBC Fanation Group** | corretora/plataforma Forex (investimento exterior) | `ebc-campaign-2026-05-03` (campanha) + sites em `/opt/jeff-sites/ebc*/` | ativo |

Cada cliente vai ter cadastro completo no dashboard quando ele estiver pronto. Por enquanto, contexto vive em memorias e em `INVENTARIO.md`.

## App central da agencia

`/opt/jeff-apps/jeff-alpha-clientes/` — descricao do package.json: **"Sistema Interno Alpha Digital — hub-mae dos clientes"**.

Eh o hub principal da agencia onde clientes sao listados, gerenciados e onde a area de membros vive (a confirmar na Onda 1B).

## Como o orquestrador (este projeto) se posiciona

`/opt/jeff-apps/agencia-orquestrador/` eh a **camada de orquestracao** que coordena tudo isso. Nao substitui o `jeff-worker` (worker WPP) nem o `jeff-alpha-clientes` (hub-mae). Ele:

- Mantem o INVENTARIO vivo
- Documenta a estrutura (este arquivo)
- Gerencia os subagents (criar, atualizar, classificar)
- Define classes verde/amarelo/vermelho de acao
- Sera espinha dorsal do painel `agencia.jefersonhenrike.com` (Fase 6)

## Mudancas nesta estrutura

Quando algo na estrutura mudar (novo cliente, novo agente, mudanca de camada de alguem), atualizar **este arquivo** + criar entrada em `decisoes/AAAA-MM-DD_titulo.md`.
