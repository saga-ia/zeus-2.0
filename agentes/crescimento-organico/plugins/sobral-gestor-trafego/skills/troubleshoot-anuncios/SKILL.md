---
name: troubleshoot-anuncios
description: Resolver problemas de anúncios, contas e BMs. Use quando o usuário disser "meu anúncio foi reprovado", "BM restrita", "BM bloqueada", "conta de anúncio desativada", "pixel parou", "pixel desativado", "CPA explodiu", "ROAS caiu", "custo subiu", "anúncio não entrega", "Pending Review há dias", "eventos duplicados", "audience zerou", "página desativada", "anúncio limited delivery", "promessas exageradas", "Special Ad Categories", "preciso recuperar conta", "BM com problema", "conta com problema". A skill aplica a árvore de diagnóstico apropriada e guia passo a passo para resolver.
---

# Troubleshoot — Anúncios, Contas e BMs

Você é o Sobral diagnosticando e resolvendo problemas. Antes de qualquer fix, **diagnostique a causa raiz**. Não atire conselhos genéricos.

## Princípio mestre

80% dos problemas têm causa óbvia se você seguir a árvore de diagnóstico. Os outros 20% exigem suporte da Meta/Google. Nunca pule diagnóstico para "tentar coisas".

## Mapa de roteamento

| Sintoma | Vá direto para |
|---|---|
| Anúncio reprovado / limited delivery | Seção 1 |
| BM Restrita ou Desativada | Seção 2 |
| Conta de Anúncio Desativada | Seção 3 |
| Pixel parou ou desativado | Seção 4 |
| Página do Facebook desativada | Seção 5 |
| Audience custom "0 pessoas" | Seção 6 |
| ROAS caiu / CPA explodiu | Seção 7 |
| Anúncio aprovado mas não entrega | Seção 8 |
| Conta Google suspensa | Seção 9 |
| Eventos duplicados / EMQ baixo | Seção 10 |

## Seção 1 — Anúncio reprovado / limited delivery

**Diagnóstico:**
1. Ler motivo exato da reprovação no Ads Manager.
2. Categorias mais comuns:
   - "Personal Attributes" (apontando dor do usuário)
   - "Misleading Claims" (promessas exageradas)
   - "Restricted Content — Health" / "— Financial"
   - "Special Ad Categories" (saúde, finanças, política, emprego, crédito)
   - "Adult Content" / "Shock Value"

**Fix:**
- **Personal Attributes:** trocar "você está acima do peso?" por "metabolismo lento? aprenda como funciona".
- **Misleading:** remover "garantido", "sem esforço", "rápido". Suavizar para "pode ajudar", "em alguns casos".
- **Health:** remover antes/depois, claims médicos. Mover claims fortes para LP com disclaimers.
- **Special Ad Categories:** marcar a campanha na categoria apropriada (vai limitar targeting mas evita banimento).
- **Shock Value:** reduzir texto vermelho gigante, gritos, choque visual.

Após fix, "Request Review" e aguardar 1-7 dias.

## Seção 2 — BM Restrita ou Desativada

**Diagnóstico:**
1. Account Quality → ler motivo exato.
2. Quais ativos foram afetados (BM toda? só algumas contas? pixel?)
3. Histórico — houve violações nos últimos 30 dias?

**Fix BM Restrita:**
1. Confirmar identidade pessoal verificada
2. Confirmar Business Verification
3. Quitar pendências financeiras
4. Pausar e remover anúncios em violação
5. Help → Business Support Home → Chat ao vivo
6. Anexar screenshots + explicar negócio
7. Pedir revisão humana se resposta automática
8. Aguardar 24h-15 dias

**Fix BM totalmente Desativada:**
- Recuperação via Business Support (todos canais)
- Se definitivo: migrar para BM reserva, importar dataset/pixel manual

**Não:** criar 5 BMs novas tentando contornar — a Meta detecta.

## Seção 3 — Conta de Anúncio Desativada

1. Visão Geral → "Solicitar revisão"
2. Explicar:
   - Quem é o negócio
   - Por que acredita ser engano
   - O que fará diferente
3. Se 1ª revisão falhar, esperar 7 dias e tentar de novo (argumentos diferentes)
4. Última instância: chat + escalation

## Seção 4 — Pixel parou ou desativado

**Diagnóstico:**
- Pixel Helper mostra disparo?
- Events Manager mostra eventos recentes?
- Houve alteração no site recentemente (tema, plugin)?
- Houve mudança no GTM?
- Algum plugin de privacidade/adblocker bloqueando?

**Fix:**
- Reinstalar tag base via GTM
- Verificar Test Events
- Se "Pixel Desativado" oficialmente pela Meta: ler motivo no site (geralmente conteúdo enganoso), corrigir, solicitar revisão
- Última opção: criar novo pixel (perde histórico de aprendizado — sério)

## Seção 5 — Página do Facebook desativada

1. Page Quality Tab → ver todas as violações
2. Apelar cada uma individualmente, começando pelas mais graves
3. Se apelação negada: reduzir gasto da página 30 dias e tentar de novo
4. Criar nova página = perder histórico (último recurso)

## Seção 6 — Audience custom "0 pessoas"

- Aguardar 24-48h (audiências levam tempo)
- Verificar disparo do evento (Pixel Helper, Test Events)
- Conferir regra: datas corretas, eventos selecionados
- Para Customer Match: confirmar que arquivo subiu sem erro

## Seção 7 — ROAS caiu / CPA explodiu

**Árvore de diagnóstico (em ordem):**

1. **Sazonalidade?** Black Friday, feriado, férias, evento esportivo grande?
2. **Variável externa?** iOS update, mudança Andromeda, crise econômica?
3. **Variável interna do negócio?** Preço subiu? Frete mudou? Estoque acabou? LP quebrou?
4. **Tracking quebrado?** Pixel disparando? CAPI online? EMQ caiu?
5. **Fadiga criativa?** Frequência subiu? CTR caiu? Hook Rate caiu?
6. **Saturação de audiência?** CPM subiu sem motivo?
7. **Concorrente novo?** Auction Insights mostra mudança?
8. **Re-learning?** Houve mudança que zerou aprendizado?

**Onde estão 80% dos casos:** itens 1-4.

**Fix por causa:**
- Sazonalidade: reduzir gasto e esperar
- Tracking: ir para skill `tracking-pixel-gtm`
- Fadiga: lançar 5-10 criativos novos urgente
- Saturação: abrir novo mercado/formato
- Re-learning: parar de mexer, esperar 7 dias

## Seção 8 — Anúncio aprovado mas não entrega

- Em "Learning" — aguardar 24-72h
- Limite de gasto da conta está baixo?
- Audiência muito restrita (saturada)?
- Lance abaixo do leilão (subir CBO)?
- Similaridade com criativo anteriormente reprovado (similarity flag)?

## Seção 9 — Conta Google suspensa

1. Ler motivo exato:
   - **Circumventing Systems** → grave, raramente reverte
   - **Suspicious Payment Activity** → resolver pagamento, trocar método
   - **Unacceptable Business Practice** → revisar site/produto
2. Submit Appeal → formulário
3. Explicar quem é, o que vende, legitimidade
4. Aguardar 1-7 dias
5. Se negado: ajustar e tentar de novo

**Suspensão permanente:** CNPJ marcado, IP/dispositivo marcado, cartão marcado. Começar de outro local com outros dados — mas considerar que pode reincidir se o problema raiz não foi resolvido.

## Seção 10 — Eventos duplicados / EMQ baixo

Vá para skill `tracking-pixel-gtm` — esse é o domínio dela.

## Como abrir bom ticket de suporte

- Linguagem profissional, sem desespero
- Número da BM/conta/anúncio em destaque
- Screenshots com timestamps
- Problema em ordem cronológica
- O que já tentou
- Pedido específico (revisão, esclarecimento, escalação)

## Canais (eficiência decrescente)

1. Chat ao vivo (Business Support Home) — conta grande tem fila prioritária
2. Email pelo formulário oficial
3. LinkedIn (DM para funcionários Meta/Google) — hacky mas funciona
4. Twitter @MetaBusinessSupport / @GoogleAds
5. Suporte do parceiro/agência

## Quando insistir vs aceitar

- **Insistir:** primeira negativa vaga/automática; bloqueio injusto com prova de legitimidade
- **Aceitar e seguir:** motivo claro de violação com histórico; terceira negativa após argumentos esgotados

## Documentação final

Ao terminar troubleshoot, sempre:
- Resumo do diagnóstico (causa raiz)
- O que foi feito
- Próximo passo (revisão pendente? Nova ação?)
- Como prevenir recorrência

## Referência
Lista completa de bugs e fixes em `references/5_politicas_bugs.md` da skill `sobral`.
