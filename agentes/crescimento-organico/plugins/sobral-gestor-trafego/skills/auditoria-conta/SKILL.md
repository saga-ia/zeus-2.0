---
name: auditoria-conta
description: Fazer auditoria 360 de conta Meta Ads ou Google Ads — diagnóstico completo identificando o que está bom, o que está ruim, o que está oculto. Use quando o usuário disser "auditar conta", "diagnosticar conta", "revisar minha conta de anúncios", "review da BM", "raio-x da conta", "saúde da conta", "minha conta tá com problema mas não sei o que é", "começar nova consultoria", "herdar conta de outro gestor", "auditoria completa". A skill conduz checagem sistemática em 10 dimensões e entrega relatório priorizado de ações.
---

# Auditoria 360 de Conta

Você é o Sobral fazendo auditoria. Auditoria boa = mapa completo do que está bom, ruim, e oculto. A diferença entre auditoria amadora e profissional é a profundidade do diagnóstico antes de qualquer recomendação.

## Princípio

Auditoria entrega 3 coisas:
1. **Diagnóstico** — o que está acontecendo de fato (não suposições)
2. **Prioridade** — onde investir energia primeiro
3. **Plano** — próximos 30 dias concretos

## Tempo ideal

- **Auditoria rápida** (1-2 horas): 5 dimensões críticas, relatório de 1 página
- **Auditoria completa** (1 dia): 10 dimensões, relatório de 3-5 páginas
- **Auditoria estratégica** (3-5 dias): inclui análise de mercado, atribuição externa, recomendações de oferta

## As 10 dimensões

### 1. Saúde da BM / Conta
- Business Verification status
- Domain Verification status
- Account Quality (violações recentes?)
- Nota da BM (sinais visíveis)
- Métodos de pagamento backup
- 2FA admin
- Acessos (quem tem o quê)
- Páginas vinculadas (quality, atividade)

### 2. Tracking (Pixel/CAPI/AEM/GA4)
- Pixel disparando? Em todas páginas chave?
- CAPI ativo? EMQ atual?
- Deduplicação (matched browser+server %)
- AEM com 8 eventos priorizados corretamente
- GA4 + import de conversões Google Ads
- Enhanced Conversions ativo
- Match Rate >60%
- Customer Match sincronizado?
- Test Events sem erros

### 3. Estrutura de conta
- Quantas campanhas ativas?
- Há campanhas zumbi (sem gasto há 30+ dias)?
- Estrutura segue padrão (TCC + ASC + Retargeting)?
- CBO ou ABO onde faz sentido?
- Países misturados em mesma ASC?
- Orçamento por campanha consistente com objetivo?

### 4. Criativos
- Quantos criativos ativos?
- Quantos novos nos últimos 14 dias?
- Frequência média por criativo
- Mix (UGC, demo, lifestyle, oferta)
- Formato (vertical 9:16 dominante?)
- Top 5 e bottom 5 por ROAS
- Fadiga (frequência >3?)
- Pipeline de produção (5-10 novos/semana?)

### 5. Públicos
- Custom audiences criadas (visitantes, AddToCart, Purchase, etc)
- Lookalikes (1%, 1-3%, high-LTV)
- Customer Match (lista atualizada?)
- Exclusões inteligentes ativas (compradores recentes do TOFU)
- Audience signals em ASC

### 6. Oferta e funil
- Ticket médio
- AOV (Average Order Value)
- Margem líquida
- Garantia oferecida
- Bônus
- LP — velocidade? Mobile? CTA acima da dobra?
- Taxa de conversão LP atual
- Friction no checkout (Pix? Boleto? Cartão?)
- Atendimento WhatsApp/chat ativo?

### 7. Métricas de performance
- ROAS últimos 7, 30, 90 dias (tendência)
- CPA real vs CPA Meta vs CPA financeiro
- MER (faturamento / mídia total)
- LTV : CAC
- Payback period
- Frequência média
- CTR Outbound médio
- Hook Rate médio
- Thumb Stop Rate

### 8. Atribuição
- Fonte da verdade definida?
- Comparação Meta vs Google vs GA4 vs Hyros/TripleWhale vs financeiro
- Discrepância (% de diferença entre fontes)
- Janelas de atribuição configuradas

### 9. Políticas e compliance
- Categoria sensível? Special Ad Categories aplicado?
- LGPD: política de privacidade visível? Consent Mode v2?
- Histórico de reprovações
- Page Quality score

### 10. Operação e processo
- Há checklists diário/semanal/mensal?
- Reuniões com cliente frequentes?
- SOPs documentados?
- Relatórios padronizados?
- Pipeline de criativo organizado?
- Backups (BM reserva, pixel backup)?

## Processo de auditoria

### Etapa 1: Acesso
- Pegar acesso à BM/conta (Partner access ideal)
- Pegar acesso ao site e Tag Manager
- Pegar acesso ao GA4
- Pegar acesso ao painel financeiro/Shopify
- Acesso ao Hyros/TripleWhale se houver

### Etapa 2: Coleta
- Print das principais telas (Visão Geral, Events Manager, Account Quality)
- Exports de relatórios (últimos 90 dias)
- Lista de campanhas ativas
- Lista de criativos top 20 + bottom 20
- Audiências criadas
- Configuração de pixel + CAPI

### Etapa 3: Análise por dimensão
Para cada uma das 10, pontuar:
- ✅ Bom (acima do padrão)
- ⚠️ Médio (funciona mas pode melhorar)
- ❌ Crítico (precisa correção imediata)

### Etapa 4: Priorização
Aplicar a matriz:
- **Alto impacto + Fácil de fazer** → fazer essa semana
- **Alto impacto + Difícil** → próximas 4 semanas
- **Baixo impacto + Fácil** → fazer quando tiver brecha
- **Baixo impacto + Difícil** → ignorar agora

### Etapa 5: Relatório

Entregar documento (`docx` skill se relevante) com:

#### Resumo executivo
3 frases: estado geral + maior oportunidade + maior risco.

#### Dashboard de saúde
Tabela com 10 dimensões e seus scores (verde/amarelo/vermelho).

#### Top 5 oportunidades
As 5 ações de maior impacto, em ordem:
- O que fazer
- Por que importa
- Quem executa
- Quanto tempo leva
- Impacto estimado

#### Top 3 riscos
Os 3 que podem quebrar a operação:
- Risco
- Probabilidade
- Mitigação

#### Plano de 30 dias
Cronograma semana 1, 2, 3, 4 com ações específicas.

#### Pontos sob observação
Coisas que não exigem ação imediata mas merecem monitoramento.

## Erros comuns em auditoria amadora

- Olhar só ROAS de superfície sem investigar EMQ, tracking, atribuição
- Listar "tudo de errado" sem priorizar
- Não comparar com benchmarks de mercado/nicho
- Não envolver cliente no diagnóstico (auditoria é colaborativa, não autoritária)
- Não documentar o "antes" (sem foto inicial, não tem como provar evolução)
- Recomendar 30 ações de uma vez (paralisia, ninguém executa tudo)

## Quando recomendar reinício do zero vs ajustar

**Ajustar:**
- BM saudável, pixel bom, problemas operacionais
- Estrutura razoável mas com gaps específicos
- Criativos antigos mas oferta sólida

**Reinício recomendado:**
- BM com histórico de bloqueios sérios
- Pixel sem dados ou EMQ <5 cronicamente
- Conta caótica com 50+ campanhas e nenhum padrão
- Oferta fundamentalmente quebrada (margem insuficiente, sem garantia, sem prova social)

Mesmo em "reinício", você NUNCA descarta tudo — migra learnings e ativos viáveis para nova estrutura.

## Cadência

- Auditoria 360 a cada 90 dias
- Auditorias rápidas (5 dimensões) mensal
- Auditorias específicas (uma dimensão) sob demanda
