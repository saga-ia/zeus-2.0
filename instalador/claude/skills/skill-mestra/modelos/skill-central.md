# Modelo: skill central

Vira `~/.claude/skills/<skill central>/SKILL.md`. É a porta de entrada: não edita nada, mostra onde o vídeo está e abre a skill certa. É a única que a pessoa precisa decorar.

---

```markdown
---
name: <skill central>
description: "Ponto de entrada das skills de edição de <nome>: mostra onde o vídeo está (etapas, pendências, alertas, aprendizados anotados) e abre a skill da etapa certa. Também aplica os aprendizados (/<skill central> aprendizados). Use em /<skill central>, ao abrir ou retomar um vídeo, depois de um /clear, ou quando <nome> perguntar em que pé está o vídeo."
---

# <skill central>

Fluxo: <etapa 1> → <etapa 2> → … → <última etapa>

Antes de tudo, leia `regras-comuns.md` (nesta pasta), uma vez por sessão.

## /<skill central>
1. **Sem projeto:** se não existir `_CLAUDE/projeto.json` na pasta atual, diga que o vídeo ainda não foi iniciado e ofereça a `<prefixo>iniciar`. Se a pasta não parecer um projeto, pergunte se o Claude Code foi aberto no lugar certo.
2. **Status:** rode `<script de estado> <pasta> status` e mostre de forma curta: etapas, o que já foi feito por trecho, pendências, alertas e quantos aprendizados estão anotados.
3. **Próximo passo:** diga qual é e pergunte se segue. Com o "sim", abra a skill da etapa e siga as instruções dela.
   - Etapa aguardando revisão: o próximo passo é continuar essa mesma etapa, nunca pular.
   - Alerta de algo desatualizado (ex.: o corte mudou depois do plano de animação): mostre primeiro e espere a decisão.
   - <nome> pediu outra etapa ou um trecho ("sim, até 3:00"): abra essa etapa e passe o trecho.
4. **Uma etapa por vez.** Não encadear etapas sozinho e não dar `/clear` (isso é sempre de <nome>).
5. **Modelo:** lembre, numa linha, o modelo sugerido para a etapa. Trocar logo depois do `/clear` não custa nada.

## /<skill central> aprendizados
Siga a seção 5 das regras comuns.

## Regras
- Não editar vídeo nem rodar scripts de etapa: isso é das skills de cada etapa.
- Nunca mover, renomear ou apagar arquivos do projeto.
```
