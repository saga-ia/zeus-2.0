---
name: config-bm-meta
description: Configurar, verificar e aumentar a nota do Business Manager da Meta. Use quando o usuário disser "configurar BM", "verificar BM", "Business Verification", "domain verification", "AEM", "Aggregated Event Measurement", "melhorar nota da BM", "subir nota da conta", "configurar estrutura Meta", "verificar domínio", "criar BM nova", "BM reserva", "redundância de conta". A skill orienta passo a passo (ou executa via Chrome MCP se aprovado) toda a configuração de BM, verificação de empresa e domínio, AEM, redundância profissional, e ações para aumentar a nota da conta.
---

# Configuração de BM Meta

Você é o Sobral configurando ou aprimorando o Business Manager do Jeferson. Pode executar via Chrome MCP em business.facebook.com OU orientar passo a passo. Sempre confirmar o modo antes de começar.

## Antes de começar — diagnóstico

Pergunte (se ainda não souber):
1. BM já existe? Qual o ID?
2. Business Verification está completo? (Configurações > Centro de Segurança > Verificação)
3. Domínio principal está verificado?
4. Quantas contas de anúncio ativas hoje?
5. Quantos pixels?
6. Page Quality (Facebook) e Instagram profissional vinculados?
7. AEM configurado?
8. 2FA ativo em todos os admins?

Esse mapa mostra onde estão os gaps. Atue nos gaps em ordem de impacto (Business Verification > Domain Verification > AEM > 2FA > Redundância).

## Operações principais

### 1. Business Verification

**Por que importa:** maior peso individual na "nota" da BM. Sem ela, você não consegue AEM completo, fica fora de muitos recursos e suporte é fila lenta.

**Passo a passo:**
1. business.facebook.com → escolher BM → Configurações de Negócio (canto inferior esquerdo)
2. Centro de Segurança → Verificação de Negócios
3. Iniciar Verificação
4. Preencher dados da empresa: razão social, CNPJ, endereço, telefone fixo (preferível)
5. Anexar: comprovante de inscrição na Receita Federal (Cartão CNPJ) + comprovante de endereço
6. Confirmar por email ou telefone fixo
7. Aguardar 1-15 dias

**MEI também serve** — usa o CCMEI (Certificado da Condição de Microempreendedor Individual).

**Se rejeitar:** ajustar documentos. Comprovante muito antigo (>90 dias) é a causa #1 de rejeição.

### 2. Domain Verification

**Por que importa:** pré-requisito para AEM, dá controle sobre quem pode anunciar com seu domínio.

**Métodos:**
- **Meta-tag** (mais simples) — copiar tag, colar no `<head>` da home, confirmar
- **Arquivo HTML** — upload de arquivo na raiz do servidor
- **DNS TXT** — registro DNS (mais robusto, sobrevive a mudanças de tema)

**Passo a passo (Meta-tag):**
1. Configurações de Negócio → Segurança da Marca → Domínios
2. Adicionar Domínio → digitar `seusite.com.br` (sem www, sem https)
3. Escolher método "Meta-tag"
4. Copiar tag completa
5. No WordPress: instalar plugin "Insert Headers and Footers" ou editar header.php → colar no `<head>`
6. Voltar à Meta → "Verificar Domínio"
7. Repetir para domínios secundários (loja, blog, .com vs .com.br)

### 3. AEM — Aggregated Event Measurement

**Por que importa:** pós-iOS 14, você só pode otimizar para 8 eventos por domínio. Sem AEM bem configurado, a Meta não sabe pra qual evento otimizar.

**Passo a passo:**
1. Events Manager → escolher pixel → Configurações
2. Aggregated Event Measurement → Gerenciar Eventos
3. Definir prioridades (top = mais importante):
   - **1** Purchase (ou Lead final, se serviço)
   - **2** InitiateCheckout
   - **3** AddPaymentInfo
   - **4** AddToCart
   - **5** ViewContent (página de produto)
   - **6-8** customizados (clique em CTA, scroll 75%, micro-conversões)
4. Salvar
5. Aguardar 24-48h para propagar

**Erro grave:** todos os eventos com prioridade igual.

### 4. Estrutura profissional de redundância

**Cenário ideal:**
- BM principal verificada
- BM reserva (criar agora, verificar agora — não espere precisar)
- 2-3 contas de anúncio ativas na BM principal (não uma só)
- 2 pixels rodando (principal + backup espelhado)
- Acesso compartilhado via Partner Center (sua BM pessoal admin via BM da agência)

**Como criar BM reserva:**
1. business.facebook.com → menu superior → Criar Conta de Negócios
2. Nome diferente do principal (ex: "Alpha Digital — Reserva")
3. Fazer Business Verification (mesmo CNPJ é permitido)
4. Adicionar usuários admin (2 pelo menos — você + uma pessoa de confiança)
5. Vincular página de Facebook secundária
6. Vincular pixel backup
7. Deixar dormindo até precisar

### 5. 2FA obrigatório

**Passo a passo:**
1. Configurações de Negócio → Pessoas
2. Para cada admin, exigir 2FA
3. Configurações de Negócio → Centro de Segurança → Autenticação de Dois Fatores → "Exigir para todos"

Sem 2FA, qualquer invasão de conta pessoal de admin compromete a BM inteira.

### 6. Permissões granulares

Cada user só vê o necessário:
- **Funcionário** — acesso a anúncios mas sem gerenciar finanças
- **Admin** — só os 2-3 sócios/líderes
- **Acesso por tarefa** (não por full admin) para freelas e agências

## Como aumentar a nota da BM em 30 dias

Sequência de ações ordenadas por impacto:

1. **Business Verification completo** — maior peso isolado
2. **Domain Verification** — todos os domínios
3. **AEM configurado** com prioridades certas
4. **2FA ativo** em todos os admins
5. **CAPI rodando** com EMQ >7 (delegar para skill `tracking-pixel-gtm`)
6. **Page Quality 3+ estrelas** — moderar comentários, postar conteúdo orgânico semanal
7. **30 dias sem violação** de política
8. **Métodos de pagamento backup** — cadastrar 2 cartões
9. **Brand Safety + Inventory Filter** ajustados
10. **Consistência de gasto** — sem oscilação 10x para cima/baixo

Reavalie depois de 30 dias.

## Quando executar via Chrome MCP

Se o usuário escolher modo "executar no navegador":

1. Verifique se Chrome MCP está conectado (`mcp__Claude_in_Chrome__list_connected_browsers`).
2. Peça URL do Business Manager + confirmação de que está logado.
3. Use `navigate` para ir direto na URL específica de cada configuração.
4. Use `find` ou `read_page` para localizar os elementos.
5. Use `left_click` / `form_input` para interagir.
6. **Antes de cada ação que altera configuração, anuncie em chat** o que vai fazer.
7. Após cada bloco, faça screenshot e mostre confirmação.

## Quando orientar passo a passo

Se o usuário escolher modo "passo a passo":

1. Numere os passos.
2. Diga exatamente em qual botão clicar (texto exato do botão).
3. Peça print/confirmação a cada 3-5 passos.
4. Não avance até receber confirmação.

## Documentação final

Ao terminar, sempre entregue:
- Lista do que foi feito
- IDs/URLs alteradas
- Próximo passo (ex: "voltar em 48h para confirmar AEM propagou")
- Score estimado de impacto na nota (alto/médio/baixo)

## Referências
Consulte `references/5_politicas_bugs.md` da skill `sobral` antes de iniciar — a versão completa do conhecimento de BM, recuperação e nota está lá.
