---
name: Estrutura Alpha Digital + ZEUS + 3 camadas
data: 2026-05-12
tipo: design
---

# Decisao: estrutura inicial da Alpha Digital

## Contexto

Jeff descreveu em audio/texto (briefing 2026-05-12) a estrutura completa da agencia Alpha Digital Consultoria Estrategica, com:
- ZEUS como orquestrador
- 3 camadas (linha de frente, parceiros humanos, clientes)
- 4 agentes pre-definidos na Camada 1 (Sobral, Maicon, Icaro, Smith)
- 3 clientes ativos (CIGC, Farias, EBC Fanation Group)

## Decisao

1. Criar `ESTRUTURA.md` como fonte da verdade da agencia, separado de `INVENTARIO.md` (operacao) e `PLANO.md` (fases).
2. Criar esqueleto dos 4 agentes da C1 em `/root/.claude/agents/` com nomes em slug (sobral-trafego, maicon-estrategista, icaro-copywriter, smith-engenharia).
3. Renomear arquivo vazio "Maicon estrategista" pra `maicon-estrategista.md` mantendo continuidade historica.
4. Modelo inicial sugerido: Smith=opus, demais=sonnet (Jeff revisa).
5. Cada agente tem secao TODO marcando o que ainda precisa ser definido (tools, classes verde/amarelo/vermelho, formato de saida).

## Impacto

- Ajusta entendimento da Fase 3: C1 ja tem 4 agentes pre-definidos; futuros agentes (C1 expandida ou novos papeis) sao on-demand.
- CLAUDE.md do orquestrador foi reescrito pra refletir identidade Alpha Digital (substituiu versao inicial "agencia Jefferson Henrike").
- Sinaliza que `/opt/jeff-apps/jeff-agente-smith/` eh backend/dashboard do agente Smith (nao o agente em si).

## Pendencias

- Preencher tools, classes e formato de saida de cada agente (junto com Jeff, on-demand quando primeira tarefa real aparecer).
- Confirmar modelos (sonnet vs opus vs haiku) com Jeff.
- Casos de teste por agente (Fase 7).
