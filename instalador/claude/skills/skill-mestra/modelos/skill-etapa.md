# Modelo: skill de uma etapa

Vira `~/.claude/skills/<prefixo><etapa>/SKILL.md`. O ofício vem do guia da etapa (`guias/etapa-*.md`), adaptado às escolhas da pessoa. O gosto não entra aqui: a skill só aponta para o perfil.

Mantenha cada skill curta e direta: o que a etapa lê, o que escreve, o passo a passo, como entrega, como revisa e as regras. Se ficar longa, mova as partes de consulta para arquivos ao lado do `SKILL.md`, que só são abertos quando precisa.

---

```markdown
---
name: <prefixo><etapa>
description: "<O que a etapa faz, em uma frase, com as palavras que a pessoa usaria.> Use em /<prefixo><etapa>, após a <etapa anterior>."
---

# <prefixo><etapa>

<Duas ou três frases: o que esta etapa entrega e o que ela não faz.>

- **Lê:** <blocos do estado do vídeo, briefing, perfil (quais arquivos), saídas da etapa anterior>
- **Escreve:** <bloco no estado, arquivos em `_CLAUDE/<pasta>/`, entrega em `_CLAUDE/<entrega>/`>
- **Próximo passo:** `/<prefixo><próxima etapa>`

Se a etapa anterior não estiver `concluido`, pare e sugira terminá-la.

## Ofício
<Os princípios da etapa (do guia), já adaptados às escolhas da pessoa. "Tendência, não regra" nas decisões criativas.>

## Perfil
<Quais arquivos do perfil ler antes de começar, e o que cada um decide nesta etapa.>

## Scripts
<Tabela: script · o que faz · as armadilhas que ele precisa evitar (do guia).> Na primeira vez que a etapa rodar num vídeo, escreva os scripts que faltam na pasta de ferramentas, teste e anote aqui o uso. Nos próximos vídeos, reaproveite.

## Passo a passo
1. Status e pendências desta etapa (`<script de estado> <pasta> status`).
2. <…>
3. Entrega conforme o caminho escolhido (programa ou vídeo pronto). **Primeira vez de todas:** arquivo de teste curto, <nome> confere, anotar no arquivo de validação, e só então seguir.

## Resumo no chat
Curto: o que foi feito, o que precisa da atenção de <nome>, o caminho da entrega. Marque a etapa como `aguardando_aprovacao`.

## Revisão
<Como <nome> devolve: por número (`<id>NN mais …`), por tempo ou pela volta do programa. Ajustar só o que foi citado, gerar versão nova, anotar aprendizados no caderno.>

## Aprovação
Marque `concluido`, diga quantos aprendizados ficaram anotados e sugira `/clear` e `/<skill central>`.

## Regras comuns
Antes de começar, leia `~/.claude/skills/<skill central>/regras-comuns.md` (uma vez por sessão).

## Regras
- Nunca mover, renomear ou apagar arquivos do projeto.
- Falar com <nome> em português, de forma curta.
```
