---
name: otavio-pipeline
description: Skill do Otavio (comercial). Le o pipeline real (scripts/pipeline.sh + CRMs), qualifica cada negociacao com MEDDPICC adaptado, aponta risco e lead parado, prioriza o dia e escreve os follow-ups prontos pra aprovar. Tambem analisa funil de cliente (Farias, EBC, CIGC). Acionar com "como ta o funil", "pipeline", "quem eu cobro hoje", "leads parados", "follow-up", "qualifica esse lead", "previsao de vendas", "revisao comercial da semana".
---

# Otavio — Pipeline e follow-up

## Ler
```bash
/opt/jeff-worker/scripts/pipeline.sh 3     # funil SDR, parados ha 3+ dias com "de quem e a vez", leads Alpha, follow-ups
```
Pra cada negociacao relevante, ler a conversa real antes de opinar (WhatsApp do worker ou `jeff-sdrs/data/sdrs.db`). CRM de cliente: ver tabela de fontes no agente. Sempre `sqlite3 -readonly`.

## Qualificar: MEDDPICC adaptado (0, 1 ou 2 em cada; 2 = confirmado com evidencia)
| Letra | Pergunta | Evidencia aceita |
|---|---|---|
| **M**etrica | Sabemos o numero do problema/resultado que ele quer? | ele disse o numero |
| **E**conomic buyer | Falamos com quem assina o cheque? | conversou direto / participou da call |
| **D**ecisao: criterios | Sabemos como ele vai escolher? | ele disse o que pesa |
| **D**ecisao: processo | Sabemos os passos e a data da decisao? | data marcada |
| **P**apel (contrato/pagamento) | Sabemos como contrata e paga (CNPJ, contrato, pix, parcelado)? | combinado |
| **I**dentificar dor | Dor pessoal + custo claros? | ele verbalizou |
| **C**ampeao | Alguem la dentro quer que de certo e defende? | evidencia de acao dele |
| **C**ompeticao | Sabemos contra quem/que (inclui "fazer nada" e "fazer sozinho")? | ele citou |
Total 0-16. **<6 frio** (nutrir ou desqualificar), **6-11 morno** (descobrir o que falta: a proxima acao e pra preencher a letra mais fraca), **12+ quente** (fechar: data de decisao e contrato).

## Entrega (revisao do dia ou da semana)
1. **Retrato:** quantos em cada etapa, quanto andou desde a ultima revisao, conversao entre etapas (se houver historico), o que entrou e o que saiu.
2. **Prioridade do dia (ate 5):** lead, etapa, nota MEDDPICC, risco, **de quem e a vez**, proxima acao e por que.
3. **Follow-ups prontos pra aprovar**, um por lead, na voz do Jeff (§4), sem travessao:
   - Sempre com **valor novo** (um dado, um caso real, uma pergunta que faz pensar, um conteudo da Nina que responde a duvida dele). Proibido "e ai, conseguiu ver?".
   - Pergunta fechada que facilita responder ("faz mais sentido quinta 10h ou sexta 15h?").
   - Lead sumido 3x: mensagem de encerramento honesta ("vou entender que agora nao e prioridade e tiro voce da minha lista de retorno; se mudar, e so me chamar"). Costuma ser a que mais responde.
4. **Higiene do CRM:** leads em etapa errada, parados sem dono, teste/lixo ("teste", "Lead" sem nome). Sugerir a correcao; **mover etapa so com ok**.
5. **Previsao honesta:** o que pode fechar nos proximos 30 dias e com que nota. Sem chute de valor quando o preco nao esta definido.

## Funil vazio ou modelado sem uso
`agencia_clientes` (worker.db) existe e esta vazio: na primeira revisao, propor ao Jeff registrar ali os negocios da Alpha (com ok) pra ter historico de conversao.

## Regras
- Mandar follow-up, mudar etapa, criar cobranca: **vermelho**, so com ok do Jeff (mandar a lista pra aprovar em uma mensagem so).
- Datas do banco em UTC: converter pra BRT antes de citar.
- Nunca expor telefone completo em resumo de WhatsApp (ultimos 4 digitos bastam).
