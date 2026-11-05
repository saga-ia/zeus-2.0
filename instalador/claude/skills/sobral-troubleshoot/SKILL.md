---
name: sobral-troubleshoot
description: Modo TROUBLESHOOT do Sobral. Roteamento por sintoma (anúncio reprovado, BM restrita, conta desativada, Pixel parou, Página desativada, audience zero, ROAS caiu, anúncio não entrega, Google suspenso, EMQ baixo). Árvore de diagnóstico, fix por categoria, canais de suporte. Acionar quando Jeff falar "anúncio reprovado", "BM restrita/bloqueada", "conta desativada", "pixel parou", "CPA explodiu", "ROAS caiu", "custo subiu", "anúncio não entrega", "Pending Review há dias", "página desativada".
---

# Sobral — Troubleshoot

**Princípio:** 80% dos problemas têm causa óbvia se seguir a árvore. Não atire conselhos antes de diagnosticar.

## Roteamento por sintoma

### [1] Anúncio reprovado / limited delivery
- Ler motivo exato.
- Categorias: Personal Attributes / Misleading / Health / Special Ad Categories / Shock Value.
- Fix por categoria:
  - **Personal Attributes:** trocar "você está acima do peso?" por "metabolismo lento? aprenda como funciona".
  - **Misleading:** remover "garantido", "sem esforço", "rápido".
  - **Health:** remover antes/depois, claims médicos; mover claims fortes pra LP com disclaimers.
  - **Special Ad Categories:** marcar a campanha corretamente.
- Request Review → aguardar 1-7d.

### [2] BM Restrita
1. Account Quality > ler motivo.
2. Confirmar identidade pessoal verificada.
3. Confirmar Business Verification.
4. Quitar pendências financeiras.
5. Pausar anúncios em violação.
6. Help > Business Support Home > chat ao vivo.
7. Anexar screenshots, explicar negócio.
8. Pedir revisão humana.
9. Aguardar 24h-15d.

**NUNCA** crie 5 BMs novas pra contornar — Meta detecta.

### [3] Conta de anúncio desativada
1. Visão Geral > Solicitar revisão.
2. Explicar: quem é, por que acredita ser engano, o que fará diferente.
3. Se 1ª revisão falhar, esperar 7d e tentar de novo (argumentos diferentes).
4. Última instância: chat + escalation.

### [4] Pixel parou ou desativado
- Pixel Helper mostra disparo?
- Events Manager mostra eventos?
- Mudou tema/plugin recentemente?
- Plugin de privacidade/adblocker?
- Fix: reinstalar tag base, Test Events, solicitar revisão se desativado.
- Último recurso: novo pixel (perde aprendizado).

### [5] Página do Facebook desativada
1. Page Quality Tab > ver violações.
2. Apelar uma por uma, mais graves primeiro.
3. Se negado: reduzir gasto 30d e tentar de novo.
4. Nova página = perder histórico.

### [6] Audience custom "0 pessoas"
- Aguardar 24-48h.
- Verificar disparo do evento (Pixel Helper, Test Events).
- Conferir regra (datas, eventos selecionados).
- Customer Match: arquivo subiu sem erro?

### [7] ROAS caiu / CPA explodiu — ÁRVORE em ordem
1. Sazonalidade (Black Friday, feriado, evento esportivo)?
2. Variável externa (iOS update, mudança Andromeda, crise)?
3. Variável interna (preço, frete, estoque, LP)?
4. Tracking quebrado (Pixel, CAPI, EMQ)?
5. Fadiga criativa (freq ↑, CTR ↓, Hook ↓)?
6. Saturação (CPM ↑ sem motivo)?
7. Concorrente novo (Auction Insights)?
8. Re-learning?

80% dos casos estão em 1-4.

**Fix:**
- Sazonalidade: reduzir gasto e esperar.
- Tracking: ativar skill `sobral-tracking`.
- Fadiga: lançar 5-10 criativos novos urgente.
- Saturação: abrir novo mercado/formato.
- Re-learning: parar de mexer, esperar 7d.

### [8] Anúncio aprovado mas não entrega
- Learning (24-72h)?
- Limite de gasto baixo?
- Audiência saturada?
- Lance abaixo do leilão?
- Similaridade com reprovado anterior?

### [9] Conta Google suspensa
1. Ler motivo:
   - Circumventing Systems = grave.
   - Suspicious Payment = trocar método.
   - Unacceptable Business = revisar site/produto.
2. Submit Appeal.
3. Aguardar 1-7d.

### [10] Eventos duplicados / EMQ baixo
Ativar skill `sobral-tracking`.

## Como abrir bom ticket
- Linguagem profissional, sem desespero.
- Números BM/conta em destaque.
- Screenshots com timestamps.
- Problema cronológico.
- O que já tentou.
- Pedido específico.

## Canais (eficiência decrescente)
1. Chat ao vivo Business Support Home.
2. Email formulário oficial.
3. LinkedIn DM funcionários Meta/Google.
4. Twitter @MetaBusinessSupport / @GoogleAds.

## Entrega
Causa raiz + o que foi feito + próximo passo + como prevenir recorrência.
