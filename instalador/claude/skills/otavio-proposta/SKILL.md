---
name: otavio-proposta
description: Skill do Otavio (comercial). Escreve proposta comercial que vence (consultoria, servico, patrocinio, evento) - tema central do cliente, narrativa em 3 atos, resumo executivo de 1 pagina, escopo, investimento ancorado no custo do problema, opcoes, proximo passo com data. Formatos: documento, pagina web ou versao WhatsApp. Acionar com "monta a proposta", "proposta pro fulano", "orcamento", "proposta de patrocinio", "manda a proposta".
---

# Otavio — Proposta que vence

## Entrada obrigatoria
- Diagnostico da call (`calls/…md`) ou as respostas: situacao, dor com numero, estado desejado, decisor, prazo, orcamento.
- `contexto.md` da marca: §6 oferta e preco, §7 provas com fonte, §4 voz, §10 restricoes.
Faltou o numero da dor ou o decisor? **Perguntar antes de escrever**: proposta sem isso vira tabela de preco.

## Estrutura
1. **Resumo executivo (1 pagina, o decisor pode ler so isso):** a situacao dele em 2 linhas com as palavras dele; o que custa nao resolver (numero dele); o que vamos fazer em 3 linhas; resultado esperado (sem prometer o que nao controlamos); investimento; proximo passo com data.
2. **Tema central:** 1 frase que liga a dor dele ao nosso diferencial (ex: "Evento que se paga antes de abrir a porta"). Se o tema serve pra qualquer cliente, reescrever.
3. **Narrativa em 3 atos:**
   - *Onde voce esta* (diagnostico, com os numeros dele; mostrar que entendemos melhor que os concorrentes)
   - *Onde quer chegar* (estado desejado e o que muda pra ele pessoalmente)
   - *Como chegamos la* (metodo em etapas com prazo, entregas concretas, quem faz o que, o que depende dele)
4. **Prova:** so §7 com fonte (case, numero, depoimento com nome). Sem prova pra esse caso, nao inventar: usar a logica do metodo.
5. **Investimento:** ancorado no custo do problema ("o problema custa Z/mes; o investimento e W em N meses"). Se fizer sentido, 2-3 opcoes (essencial / recomendada / completa) com a recomendada marcada; nunca mais de 3. Condicao e forma de pagamento.
6. **O que nao esta incluso** (evita atrito depois) e **o que precisamos de voce**.
7. **Proximo passo:** data e hora (BRT) da decisao, validade da proposta (so se real), como aceitar (ZapSign / pix Asaas, com ok do Jeff).

## Formatos
- **Documento** (padrao): markdown em `/opt/jeff-worker/projetos/clientes/<slug-quem-vende>/propostas/AAAA-MM-DD-<lead>.md`; se pedirem PDF, gerar a partir do markdown.
- **Pagina web:** passar pra skill `site-premium` (proposta como pagina privada; Tome revisa antes de enviar).
- **WhatsApp:** versao curta (ate ~800 caracteres) com resumo + link do documento/pagina; sem travessao.

## Checklist antes de entregar ao Jeff
- [ ] O resumo executivo se sustenta sozinho?
- [ ] Os numeros sao dele (ditos na call), nao meus?
- [ ] Alguma prova sem fonte? Algum desconto/bonus/prazo sem ok?
- [ ] Tem data de decisao marcada?
- [ ] Voz da §4, palavras proibidas fora?

Envio ao lead, contrato e cobranca: **vermelho**, so com ok do Jeff.
