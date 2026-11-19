# Skill Mestra: o seu fluxo de edição com o Claude Code

Uma skill gratuita que te conduz, etapa por etapa, a montar o **seu** fluxo de edição de vídeo com o Claude Code: cortes, animações, movimentos de câmera e efeitos sonoros, no seu estilo.

Ela não é um prompt milagroso e não te entrega um fluxo pronto. Ela conversa com você, pergunta o que você quer, analisa as referências de que você gosta e escreve as skills de cada etapa para o seu jeito de trabalhar: YouTube, reels, vídeo narrado, com ou sem programa de edição.

O ponto de partida é um fluxo de 8 etapas que eu uso nos meus vídeos, com os bons costumes de animação e de fluxo que aprendi testando: curvas, ritmo, câmera, sincronia de som, as armadilhas do HyperFrames e do XML do Premiere. Sem a minha identidade visual: o estilo é o seu.

## O que você precisa
- Assinatura do Claude (Pro ou superior).
- [Claude Code](https://claude.com/claude-code) instalado no computador.
- O resto (Python, FFmpeg, transcrição, HyperFrames…) a própria skill confere e instala com você, explicando cada passo.

## Como instalar
Abra o Claude Code e cole:

```
Instala esta skill para mim: https://github.com/davixavier-coder/skill-mestra
```

Ou, pelo terminal:

```bash
git clone https://github.com/davixavier-coder/skill-mestra ~/.claude/skills/skill-mestra
```

## Como usar
No Claude Code, digite:

```
/skill-mestra
```

Ela começa a te guiar:

1. **Ambiente:** confere o que já está instalado.
2. **Entrevista:** tipo de vídeo, formato, programa de edição (ou nenhum), transcrição, animação, câmera e som.
3. **Referências:** você junta trechos de vídeos de que gosta, e ela analisa e cria o seu perfil de estilo.
4. **Plano do fluxo:** as etapas, adaptadas para você.
5. **As skills:** ela escreve uma por etapa, mais uma skill central que te guia pelo fluxo e um caderno de aprendizados.
6. **Teste:** um vídeo curto, do começo ao fim.

Dá para parar e continuar depois: ela anota onde parou.

## Depois de montar: como editar um vídeo
O `/skill-mestra` não edita vídeo: ele monta o seu fluxo. Durante a montagem, você escolhe o nome da sua **skill central** (por exemplo, `/editar`). É ela que você usa no dia a dia:

1. Abra o Claude Code na pasta do vídeo.
2. Digite a sua skill central (ex.: `/editar`).
3. Ela vê em que etapa o vídeo está e te guia, uma etapa por vez.

Esqueceu o nome? Digite `/` para ver a lista de skills, ou pergunte ao Claude qual é a sua skill central. Para continuar a montagem ou mudar o fluxo depois, use `/skill-mestra` de novo.

## O que tem aqui
| Pasta | O que tem |
|---|---|
| `SKILL.md` | O roteiro da conversa |
| `guias/` | O conhecimento: princípios do fluxo, decisões, análise de referências, ofício de animação, HyperFrames, entrega no programa de edição e o ofício de cada etapa |
| `modelos/` | Os esqueletos das skills, do perfil e do estado do vídeo |

Tudo em texto. Leia, mude, adapte.

## Licença
MIT. Use, mude e compartilhe à vontade.

Adaptado por Davi Xavier a partir do [fluxo-de-edicao](https://github.com/LeiteZ/fluxo-de-edicao), de Lucas Leite (licença MIT).
