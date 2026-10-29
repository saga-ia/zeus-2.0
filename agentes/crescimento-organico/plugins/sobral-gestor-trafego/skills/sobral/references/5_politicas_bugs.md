# Políticas, Bugs e Configurações — Referência Técnica

## Hierarquia das políticas Meta
- Community Standards (geral)
- Advertising Standards (anúncios)
- Restricted Content (com restrições)
- Prohibited Content (proibido)
- Specific Restrictions (saúde, financeiro, política, jogos)

## Proibido (Meta)
Drogas, armas, documentos falsos, discriminação, sexual explícito, animais vivos (exceto ONG), produtos perigosos, doping, pirâmide/Ponzi, hacking/malware.

## Restrito (anunciar com regras)
Saúde/medicina (sem cura prometida, sem antes/depois), suplementos (18+), emagrecimento (18+, sem kg explícitos), financeiros (APRs/riscos), imóveis/emprego/crédito (Special Ad Categories, targeting limitado), política (autorização), álcool (idade legal), cripto (certificado), jogos (permissão).

## Mudanças 2026 da Meta
- 47 atualizações de política (maior ciclo desde 2019)
- Restrições maiores em saúde mental, finança pessoal, perda de peso
- Enforcement quase totalmente automatizado por IA
- Apelações humanas demoram 5-15 dias úteis
- Mais peso no histórico de página/conta
- Restrição em criativos com "shock value"

## Como escrever criativo dentro das políticas
- Não prometer o que não pode entregar
- Evitar "você/seu" apontando dor pessoal ("você está acima do peso?")
- Sem antes/depois em saúde/estética/emagrecimento
- Sem promessa financeira específica ("ganhe R$ 10.000 em 30 dias")
- Sem apelo à insegurança
- Linguagem inclusiva, evitar generalizações
- Cuidado com excesso de texto em imagem

## Google — proibições principais
Contrafação, substâncias perigosas, armas (com exceções), facilitação de desonestidade, política não autorizada, surrogacy comercial.

## Google — restrições que mais pegam
Saúde (medicamentos, telemedicina, suplementos), financeiros (empréstimos, cripto, investimentos), apostas, conteúdo adulto, imóveis (Equal Housing), empregos.

## Google — editorial (reprovação comum)
Pontuação excessiva (!!!), caps lock, caracteres especiais (★ ♥), linguagem coloquial, discrepância anúncio/LP, LP lenta ou com erro, falta de páginas de contato/sobre/privacidade, superlativos ("o melhor", "n°1").

## BM — hierarquia
Meta Business Account (BM) → Ad Accounts → Pages → IG Accounts → Pixels & Datasets → Catalogs → Users → System Users → Domains → Partners.

## Nota da BM — sinais que aumentam
- BM verificada (Business Verification)
- Domínio verificado
- Pixel rodando com EMQ 7+ há 30+ dias
- Sem violações recentes
- Pagamentos em dia, sem chargeback
- Page Quality >3 estrelas
- 2FA em admins
- Atividade consistente (sem spikes suspeitos)

## Business Verification — passo a passo
1. Configurações do Negócio > Centro de Segurança > Verificação
2. CNPJ + comprovante endereço + conta bancária empresarial
3. Telefone fixo (preferível)
4. Aguarda 1-15 dias
5. Se rejeitado: ajusta documentos e reenvia

MEI também consegue (precisa apenas de inscrição MEI).

## Estrutura profissional (redundância)
- BM principal verificada
- BM secundária reserva
- 2-3 contas de anúncio ativas
- 2 pixels (principal + backup)
- Domain verification em todos os domínios
- Acesso via BM, não Facebook pessoal

## BM Restrita — passo a passo
1. Account Quality → ler motivo
2. Identidade pessoal verificada? Se não, verificar
3. BM verificada? Se não, submeter
4. Pendências financeiras? Quitar
5. Pausar anúncios em violação
6. Help → Business Support Home → Chat ao vivo
7. Anexar screenshots + explicar negócio em detalhes
8. Se resposta automática, pedir revisão humana
9. Paciência (24h a 15 dias)

**Nunca** crie 5 BMs novas para contornar — a Meta detecta padrão.

## Conta de Anúncio Desativada
1. Visão Geral → "Solicitar revisão"
2. Explicar: 1) negócio, 2) por que acha que foi engano, 3) o que fará diferente
3. Se 1ª revisão falhar, esperar 7 dias e tentar de novo
4. Última instância: chat + escalation

## Pixel Desativado
1. Verificar o que apontaram no site
2. Corrigir (textos enganosos, falta de política, claims médicos)
3. Solicitar revisão
4. Se negada, criar novo pixel (perde aprendizado)

## Caso extremo: BM totalmente bloqueada
- Tentar recuperação via Business Support
- Migrar para BM reserva
- Importar dataset/pixel manual
- Cadastrar domínios novamente
- Começar com gasto baixo, escalonado

## Como subir a nota em 30 dias
1. Completar Business Verification (peso enorme)
2. Verificar domínio principal
3. 2FA em todos os admins
4. Configurar CAPI com EMQ >7
5. AEM com prioridades corretas
6. Page Quality 3+ estrelas
7. 30 dias com zero violações
8. Consistência de gasto
9. Métodos de pagamento backup
10. Brand Safety + Inventory Filter

## Google — tipos de suspensão
- Account Suspension
- Policy Strike (3 strikes = definitivo)
- Disapproved Ad
- Limited Ad
- Site Suspended

## Google — conta suspensa
1. Ver motivo na notificação
2. "Circumventing Systems" — grave, difícil reverter
3. "Suspicious Payment" — resolver pagamento, trocar método
4. "Unacceptable Business Practice" — pode ser site/produto
5. Submit Appeal → formulário
6. Explicar quem é, o que vende, legitimidade
7. Aguarda 1-7 dias
8. Se negado, ajustar e tentar

## Bugs comuns

### Anúncio "pending" >24h
- Pagamento OK?
- Página/perfil com restrição?
- Pausar e duplicar
- Contactar Suporte

### ROAS reportado errado
- Deduplicação Pixel + CAPI
- Janela de atribuição mudada?
- Comparar com fonte da verdade (Shopify/GA4)
- Diferença >20% → ticket

### Audience Custom mostra "0 pessoas"
- Aguardar 24-48h
- Verificar disparo do evento
- Conferir regra (datas, eventos)

### Criativo aprovado não entrega
- Learning (24-72h)
- Limite de gasto baixo
- Audiência saturada
- Lance abaixo do leilão
- Similaridade com reprovado anterior

### Pixel evento duplicado
- 2 implementações (plugin + GTM)?
- Deduplicação via event_id
- Test Events para isolar

### "Promessas Exageradas"
- Remover claims absolutos ("garantido", "sem esforço")
- Suavizar: "pode ajudar", "em alguns casos"
- Mover claims fortes para LP (com disclaimers)

### Custo subiu 3x do dia para a noite
- Auction Insights (concorrente novo)
- Sazonalidade
- Mudanças em conta
- Tracking perdeu sinal
- Limited delivery?

### Eventos do Pixel sumiram
- Pixel Helper ainda dispara?
- Adblocker/plugin de privacidade
- Pixel retirado do dataset?
- Recriar (perde histórico)

## Como NÃO tomar bloqueio
1. Nunca clicar nos próprios anúncios
2. Não usar VPN/proxy
3. Não acessar várias contas do mesmo IP em sequência
4. Não criar múltiplas contas do mesmo dispositivo
5. Não mudar método de pagamento várias vezes
6. CNPJ sem pendências
7. Não usar imagens sem direito
8. Não copiar criativos sem adaptar
9. Não usar shortlinks suspeitos em massa
10. Não pop-up agressivo de saída
11. Sem cloaking
12. Não prometer "grátis" se não for

## Como abrir bom ticket
- Linguagem profissional, sem desespero
- Número da BM/conta em destaque
- Screenshots com timestamps
- Problema em ordem cronológica
- O que já tentou
- Pedido específico (revisão, esclarecimento, escalação)

## Canais ordenados por eficiência
1. Chat ao Vivo (Business Support Home) — mais rápido se conta grande
2. Email pelo formulário — 24-72h
3. LinkedIn (DM funcionários Meta/Google) — hacky mas funciona
4. Twitter @MetaBusinessSupport / @GoogleAds
5. Suporte do parceiro/agência

## Quando insistir vs aceitar
**Insistir** — primeira negativa com motivo vago/automático; bloqueio injusto com prova de legitimidade.
**Aceitar e seguir** — motivo claro de violação com histórico de avisos; terceira negativa após argumentos apresentados.
