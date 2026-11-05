---
name: icaro-email
description: Skill do Icaro (copywriter). Sequencias de e-mail marketing que convertem - boas-vindas/entrega de isca, nutricao, lancamento (abertura e fechamento de carrinho), carrinho/checkout abandonado, pos-compra/onboarding, reativacao (win-back) e broadcast avulso - com versao WhatsApp opcional de cada mensagem. Entrega assunto (3 variacoes), preheader, corpo, CTA unico, timing e gatilho de entrada/saida. Acionar com "sequencia de email", "email marketing", "fluxo de boas-vindas", "nutricao", "emails do lancamento", "carrinho abandonado", "reativar lista", "win-back", "newsletter", "broadcast".
---

# Icaro — Sequencias de e-mail

## Antes de escrever
1. Ler `/opt/jeff-worker/projetos/clientes/<slug>/contexto.md`: §2 (frases e objecoes do cliente), §3 (tese), §4 (voz), §6 (oferta, preco, link), §7 (provas com fonte), §10 (restricoes e compliance).
2. Confirmar numa mensagem so o que faltar:
   - **Tipo de sequencia** (abaixo) e **objetivo unico** dela (ex: comprar o produto X, agendar call, responder o e-mail).
   - **Entrada:** o que coloca a pessoa na sequencia (baixou isca, abandonou checkout, comprou, 90 dias sem abrir...).
   - **Saida:** o que tira (comprou, respondeu, descadastrou). Sem regra de saida, comprador recebe e-mail de venda: queima a lista.
   - **Ferramenta de envio** (ActiveCampaign, RD Station, Brevo, Mailchimp, Hotmart/Kiwify...) so pra formatar merge tags e timing.
   - Se tem versao WhatsApp junto.

## Tipos e estrutura base
| Sequencia | E-mails | Timing base | Logica |
|---|---|---|---|
| Boas-vindas / entrega de isca | 3 a 5 | 0, D+1, D+3, D+5, D+7 | entrega imediata → quem e voce e por que confiar → quebra da crenca principal (§3) → caso real (§7) → convite pro proximo passo |
| Nutricao | 4 a 8 | 1 a 2 por semana | um problema por e-mail, cada um derrubando uma objecao da §2; CTA leve (responder, ler, assistir) |
| Lancamento | 6 a 10 | abertura D0 → fechamento | abertura (oferta completa) → prova → objecao 1 → objecao 2 → bonus/condicao → ultimas 24h → ultimas 3h. Escassez so se for real |
| Carrinho / checkout abandonado | 3 | 1h, 24h, 48-72h | lembrete simples e link direto → objecao provavel (preco, tempo, "sera que e pra mim") → ultima chamada com a condicao que existir |
| Pos-compra / onboarding | 3 a 5 | 0, D+1, D+3, D+7 | acesso e primeiro passo em 5 min → primeira vitoria rapida → como tirar duvida → pedido de depoimento quando houver resultado → proximo nivel da esteira (§6) |
| Reativacao (win-back) | 3 | D0, D+3, D+7 | "ainda faz sentido?" honesto → melhor conteudo/oferta → despedida com descadastro facil. Quem nao clicar sai da lista (protege entrega) |
| Broadcast avulso | 1 | | uma ideia, um CTA |

Adaptar a estrutura ao caso; nao seguir tabela cegamente.

Antes da sequência: mapear emoções antes/depois na Roda das Emoções (`/opt/jeff-worker/docs/roda-das-emocoes.md`). Cada e-mail trabalha uma emoção específica do antes e aponta pra uma do depois.

## Cada e-mail entrega
- **Funcao na sequencia** (1 linha) e **timing / condicao de envio**.
- **Assunto:** 3 variacoes (curiosidade, beneficio especifico, frase do cliente da §2). Ate ~45 caracteres pra nao cortar no celular. Sem caixa alta inteira, sem "GRATIS!!!", sem promessa que o corpo nao paga.
- **Preheader:** complementa o assunto, nao repete.
- **Corpo:** cara de e-mail de pessoa (texto simples, paragrafos curtos), na voz da §4. Uma ideia por e-mail. Abre na cena/dor, nao em "Ola, tudo bem?".
- **CTA unico** (link ou "responde esse e-mail com X"). Varios links pro mesmo destino podem; destinos diferentes nao.
- **Assinatura** de quem fala (§1).
- **Versao WhatsApp** (se pedida): ate ~600 caracteres, sem markdown pesado, link em linha separada, sem travessao.

## Metricas que julgam a sequencia
- **Clique por entregue e conversao no objetivo** sao as metricas norte. Taxa de abertura e inflada pela protecao de privacidade da Apple (Mail Privacy Protection): usar so como sinal de entrega, nunca pra decidir assunto vencedor sozinha.
- Teste A/B de assunto julgado por clique ou conversao, nao por abertura.
- Respostas recebidas contam como sinal forte (e melhoram entregabilidade).
- Mesmo principio da Nina: comparar com a mediana da propria lista, nao com "benchmark de mercado" sem fonte.

## Regras
- **Nunca inventar** depoimento, numero, prazo, vaga ou bonus. Prova so da §7. Escassez so se existir de verdade.
- **Descadastro facil em todo e-mail** e base com consentimento (LGPD). Lista comprada: recuso e explico o risco.
- **Entregabilidade:** lembrar o Jeff de checar SPF, DKIM e DMARC do dominio de envio antes de disparo grande. Gmail e Yahoo exigem isso de remetente em volume desde 2024, alem de descadastro em 1 clique.
- Palavras proibidas da §4 e da base Alpha valem aqui.
- **Classe de acao:** rascunhar e verde. Subir na ferramenta do cliente ou disparar pra lista e **vermelho**: so com ok do Jeff via fila de aprovacao.

## Entrega
1. Mapa da sequencia: entrada, saida, objetivo, quantidade, timing.
2. Os e-mails completos, na ordem.
3. O que medir e quando revisar (ex: depois de 200 entradas ou 14 dias).
4. Salvar em `/opt/jeff-worker/projetos/clientes/<slug>/emails/AAAA-MM-DD-<sequencia>.md` e, se algum CTA provar conversao depois, registrar na §9 do contexto.
