---
name: sobral-bm-meta
description: Modo CONFIGURAR BM META do Sobral. Diagnóstico de saúde da BM e operações em ordem de impacto (Business Verification, Domain Verification, AEM, 2FA, redundância). Passo a passo de cada operação. Plano de subir nota da BM em 30 dias. Acionar quando Jeff falar "configurar BM", "Business Verification", "domain verification", "AEM", "melhorar nota da BM", "redundância de conta".
---

# Sobral — Configurar BM Meta

## Diagnóstico inicial
1. BM já existe? ID?
2. Business Verification completo?
3. Domain Verification?
4. Quantas contas de anúncio ativas?
5. Quantos pixels?
6. Page Quality?
7. AEM configurado?
8. 2FA ativo em todos os admins?

Atuar nos gaps em **ordem de impacto**: Business Verification → Domain Verification → AEM → 2FA → Redundância.

Antes de cada ação que altera configuração, **anunciar** o que vai fazer e por quê.

## Operações

### 1. Business Verification
Configurações de Negócio > Centro de Segurança > Verificação > Iniciar. Anexar CNPJ + comprovante endereço + bancária empresarial (MEI = CCMEI). Aguarda 1-15d.

### 2. Domain Verification
Segurança da Marca > Domínios > Adicionar. Métodos: Meta-tag (mais fácil), Arquivo HTML, DNS TXT.

### 3. AEM (8 eventos por domínio, prioridades)
1. Purchase / Lead final
2. InitiateCheckout
3. AddPaymentInfo
4. AddToCart
5. ViewContent
6-8. Customizados

### 4. Redundância profissional
- BM principal verificada + BM reserva verificada
- 2-3 contas de anúncio ativas
- 2 pixels (principal + backup)
- Domain Verification em todos os domínios

### 5. 2FA
Configurações > Centro de Segurança > Exigir 2FA pra todos.

### 6. Permissões granulares
Cada user só vê o necessário.

## Plano 30 dias pra subir nota da BM (em ordem de impacto)
1. Business Verification completo.
2. Domain Verification em todos domínios.
3. AEM com prioridades corretas.
4. 2FA em todos os admins.
5. CAPI rodando EMQ 7+.
6. Page Quality 3+ estrelas.
7. 30 dias zero violação.
8. Métodos de pagamento backup.
9. Brand Safety + Inventory Filter.
10. Consistência de gasto.

## Entrega final
- Lista do que foi feito.
- IDs/URLs alteradas.
- Próximo passo.
- Score de impacto estimado na nota.

## Classes de ação Alpha
Operações de configuração de BM caem em **Vermelho** (alteram conta de anúncios) — pedir OK ao Jeff via fila de aprovação antes de executar.
