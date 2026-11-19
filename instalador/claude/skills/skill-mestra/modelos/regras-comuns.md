# Modelo: regras comuns

Vira o arquivo `regras-comuns.md`, dentro da pasta da skill central. Todas as skills de etapa leem esse arquivo uma vez por sessão. O que vale para todas fica nele; o que é de uma etapa só fica na skill dela. Troque os `<…>` pelas escolhas da pessoa.

---

```markdown
# Regras comuns das skills <prefixo>*

Lidas uma vez por sessão por todas as skills de edição. Mudou uma regra geral? Mude aqui, não em cada skill.

Ferramentas: `<pasta de ferramentas>` (scripts em `scripts/`, Python do ambiente em `<caminho do python>`).
Perfil: `<pasta de ferramentas>/perfis/<nome>/`. O nome do perfil vem do estado do vídeo.

## 1. Conversa e segurança
- Falar com <nome> em português, de forma curta.
- Nunca mover, renomear ou apagar arquivos do projeto. Tudo o que o Claude gera fica em `_CLAUDE/`.
- Nunca sobrescrever um arquivo já entregue: versão nova.

## 2. Estado do vídeo sem ler inteiro
O `_CLAUDE/projeto.json` cresce muito. Ler e mudar sempre pelo script de estado:
- `<script de estado> <pasta> status` mostra onde o vídeo está;
- `<script de estado> <pasta> <bloco>` mostra o resumo de um bloco;
- `--set <caminho> <valor>` muda um campo solto;
- `--etapa <etapa>=<status>` muda o status de uma etapa;
- `--pendencia <etapa> "<texto>"` anota uma pendência, e `--resolver <id>` a resolve.

Os blocos inteiros são gravados pelos scripts de cada etapa.

## 3. Caderno de aprendizados (`_CLAUDE/aprendizados.md`)
Anotar na hora, durante a revisão de qualquer etapa, toda correção, elogio ou preferência que vale para outros vídeos:
- "zoom mais sutil", "esse som ficou ótimo": **anota**;
- "tira essa frase": **não anota** (é só deste vídeo);
- na dúvida, anota com "(talvez só deste vídeo)".

Formato: `- [ ] <etapa> · <o que foi pedido, com contexto> · <dd/mm>`. Depois de aplicado: `- [x] … → <onde entrou>`; só daquele vídeo: `- [-] …`. Nunca apagar linhas. Anotar não é mudar: as skills só mudam quando <nome> pedir (seção 5).

## 4. Trechos, ponto salvo e fechar uma etapa
- Cortes e plano de animação olham o vídeo inteiro. Render, câmera e som podem ir por trecho, escolhido na hora ("até 3:00", "o gancho"). Um item pertence ao trecho em que começa. Cada trecho lê o que os anteriores fizeram.
- **Ponto salvo:** trecho ou etapa terminado, revisões aplicadas, entrega gerada. Só aí sugerir `/clear` e `/<skill central>`.
- **Pendência:** pedido ainda não aplicado é anotado na hora pelo script de estado e aparece no status.
- **Fechar a etapa** (aprovada inteira): marcar `concluido`, dizer quantos aprendizados ficaram anotados, sugerir `/clear` e `/<skill central>`.

## 5. Aplicar os aprendizados (quando <nome> pedir)
1. Ler as linhas `- [ ]` do caderno.
2. Propor onde cada uma entra: gosto vai para o perfil (`estilo-*.md`, `identidade.md`, catálogo); ofício (vale para qualquer vídeo) vai para a skill da etapa; o que vale para todas as etapas vai para este arquivo.
3. <nome> filtra. Gravar só o aprovado, mostrando antes o texto das mudanças maiores. Marcar cada linha.
```
