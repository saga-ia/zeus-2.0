---
name: criativo-anuncio
description: Cria CRIATIVO DE ANÚNCIO pago (Meta Ads, Instagram/Facebook feed, stories e reels; Google display) - diferente de post orgânico. Aplica o padrão "PRO, não NOOB" das referências do Jeff (prova real em vez de promessa solta, gancho de contraste com emoção e tela realista, CTA com preço e garantia antes do clique), gera 3 variações de ângulo pra teste A/B nos tamanhos certos (1080x1350, 1080x1920 com zonas seguras, 1080x1080), checa política do Meta e passa pela revisão de zero erro. Acionar com "criativo", "criativo de anúncio", "anúncio", "ad", "peça pra campanha", "criativo pro tráfego", "variação de criativo", "teste A/B de criativo".
---

# Criativo de anúncio (não é post orgânico)

**Post orgânico** (carrossel, card de tweet, conteúdo) segue `arte-por-referencia`. **Criativo de anúncio** é peça pra rodar com verba: precisa parar o dedo de quem NÃO segue a marca e levar a uma ação (clique, mensagem, compra). Se o pedido não deixar claro, pergunte em 1 linha: "é post do perfil ou criativo pra anúncio?".

Referências do Jeff (abrir com Read antes do primeiro criativo): `/opt/jeff-worker/projetos/design-modelos/referencias-anuncio/` (`prova-noob-vs-pro.png`, `criativo-ruim-vs-pro.png`, `cta-noob-vs-pro.png`).

## Antes de criar
1. Brief mínimo (pergunte só o que faltar, numa mensagem): produto/oferta, **preço e garantia**, público, objetivo da campanha (mensagem no WhatsApp/Direct, lead, venda), destino do clique, prova real disponível (print, número, depoimento com nome).
2. Contexto da marca: `/opt/jeff-worker/projetos/clientes/<slug>/contexto.md` (§2 público e emoções, §6 oferta, §7 provas com fonte, §10 restrições). Emoção do antes/depois: `/opt/jeff-worker/docs/roda-das-emocoes.md`.
3. Copy do criativo e do texto do anúncio: siga o Ícaro (`/root/.claude/agents/icaro-copywriter.md`). Estrutura de campanha, público e teste: Sobral (`/root/.claude/agents/sobral-trafego.md`).
4. Feedback anterior: `/opt/jeff-worker/scripts/feedback-arte.sh <marca>`.

## Padrão PRO (o que as referências ensinam)
| Elemento | NOOB (não fazer) | PRO (fazer) |
|---|---|---|
| **Prova** | "Mais de 5.000 satisfeitos" sobre foto de banco | **Print real** na tela (planilha, dashboard, conversa, extrato) com o ponto importante **circulado**; número específico |
| **Gancho** | Produto + lista de benefícios + rosto sorrindo genérico | **Contraste com emoção**: frase de choque curta ("Faturei R$ 38 mil. Conta zerada.") + rosto com a reação certa + **tela realista** (saldo, notificação, planilha) que prova a frase |
| **CTA** | "Clique em saiba mais e garanta a sua" | **Preço antes do clique** + o que recebe + garantia: "R$ 47, acesso na hora, 7 dias de garantia" + botão com verbo concreto ("Baixar agora") |
| **Mensagem** | 3 promessas na mesma peça | **1 ideia por criativo**, legível em 1 segundo no celular |
| **Pessoa** | Modelo de banco de imagem | **Pessoa real da marca** (foto enviada ou cena criada a partir dela com `editar-imagem.sh google`, rosto mantido) |

## Como montar (híbrido)
- **IA (imagem):** pessoa/cena com a emoção do gancho (`editar-imagem.sh google` a partir da foto real; `ilustra.sh` se não tiver pessoa).
- **HTML (tudo que é texto e "tela"):** headline, preço, garantia, botão de CTA, e os **prints realistas** (planilha, saldo bancário, notificação, conversa) montados em HTML com o número exato. Círculo/seta de destaque em SVG.
- Formatos (gere os que a campanha usa):
  - **Feed 4:5** 1080x1350.
  - **Stories/Reels 9:16** 1080x1920: deixe livres os **14% de cima e os 20% de baixo** (UI do Instagram). Texto e CTA no miolo.
  - **Quadrado 1:1** 1080x1080 (catálogo, Audience Network).
- **3 variações por pedido**, uma por ângulo, pra teste A/B: (A) **prova** (print real circulado), (B) **dor/contraste** (gancho de emoção + tela), (C) **oferta** (preço + garantia + o que recebe). Mesmo produto, mesma marca, ideias diferentes.

## Política do Meta (checar antes de entregar)
- Nada de **botão falso** na imagem que pareça clicável do sistema (play, fechar, "curtir"). Botão de CTA desenhado é ok se for claramente parte da arte.
- **Promessa de ganho financeiro** ("faturei", "ganhe R$ X") só com prova real e sem garantir resultado ao público; prefira o resultado do próprio negócio/caso com fonte. Evite "você vai ganhar".
- Sem **atributos pessoais** ("Você que está endividado...", "Você que tem ansiedade..."): fale do problema, não acuse a pessoa.
- **Antes/depois** de corpo, saúde ou estética: evitar. Números de depoimento só com fonte (contexto §7).
- Texto na imagem: curto. Meta não proíbe mais 20%, mas criativo com muito texto entrega pior.
- Saúde, finanças, crédito, emprego e moradia têm regras próprias (categoria especial): avise o Sobral.

## Qualidade (zero erro)
Mesma sequência da seção 6 de `/root/.claude/skills/arte-por-referencia/SKILL.md`: `check-html-arte.js` (use `--largura 1080 --altura 1920` pros stories) → `check-arte.py` → olhar cada prévia com Read lado a lado com as referências de anúncio → gerar no `design html` → entregar pedindo avaliação 👍/👎/💬 por peça.

## Entrega
Para cada variação: o criativo nos formatos pedidos, **headline e texto do anúncio** (primário até 125 caracteres visíveis, título até 40), **CTA do botão do Meta** (Saiba mais / Comprar agora / Enviar mensagem), o ângulo (A/B/C) e a métrica que vai julgar (CTR, custo por conversa, CPA). Subir na conta de anúncios é com o Sobral e só com ok do Jeff.
