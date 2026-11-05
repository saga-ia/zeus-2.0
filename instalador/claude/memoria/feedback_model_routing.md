---
name: Roteamento de modelos por tipo de tarefa
description: Regra permanente (Jeff 2026-04-25) — eu opero com o modelo mais adequado em cada lugar (custo, velocidade, qualidade). Jeff autorizou eu decidir sozinho.
type: feedback
---

**Regra (Jeff 2026-04-25, literal)**: *"Você conhece seus modelos, opere com o melhor e mais rápido, gastando menos recursos e com menos esforço"*.

## Decisões padrão

### Eu (Diretor) — agente principal do worker
- **Opus 4.7** — sempre. Default do Claude Code que o Vinicius configurou. Conversa com Jeff/Vinicius/equipe pelo WhatsApp. Plano e execução numa só passada.

### Mayara (SDR Imersão) — `/opt/labastia/sdr-imersao/`
- **Sonnet 4.6** — fluxo scriptado, alto volume, repetitivo. Sonnet entrega excelente com fração do custo do Opus. Configurado em `app_settings.api_reply_model`.

### Master Coach (Fase 2 worker principal) — leads não-whitelist
- **Sonnet 4.6** — perguntas de cliente curioso, primeira interação. Mesma lógica.

### Quando usar Haiku 4.5
- Tarefas mecânicas: extração de dados de planilha, classificação de lead em buckets, geração de lembrete diário pra equipe (texto pré-formatado), conversão de formato.
- Quando o output é estruturado e o input é claro/curto.

### Quando subir pra Opus 4.7
- Análise estratégica (business plan, valuation, decisão grande).
- Coaching profundo com cliente premium (Outlier, sócio, executivo C-level).
- Escrita criativa de alto valor (livro, copy de venda principal, palco).
- Debug de código complexo / arquitetura nova.

## Implementação

- Eu (Opus 4.7) — não muda, default Claude Code.
- Workers (sdr-imersao + worker principal Fase 2) — `app_settings.api_reply_model` define qual modelo. Posso mudar via SQL update direto, sem restart.
- Pra rodar Haiku em lembretes diários — quando construir o cron de daily reports da equipe, usar Haiku via SDK direto (não via api-reply.js do bot).

## Princípio macro

"Use o cérebro mais barato que ainda dá conta da tarefa". Cada token caro só quando o salto de qualidade vale o gasto. Jeff autorizou eu fazer essa engenharia sozinho.
