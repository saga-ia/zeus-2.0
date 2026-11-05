---
name: otavio-call
description: Skill do Otavio (comercial). Prepara e conduz call de diagnostico/venda consultiva high-ticket - pesquisa do lead, roteiro de 30 min (contrato inicial, diagnostico, apresentacao sob medida, proximo passo), perguntas SPIN, Gap Selling e Sandler em PT-BR, tratamento de objecao (AECR) - e analisa call gravada ou transcrita. Acionar com "prepara a call", "roteiro de reuniao", "vou falar com fulano", "como conduzo o diagnostico", "analisa essa call", "o lead disse que ta caro", "objecao".
---

# Otavio — Call de diagnostico

## Antes da call (preparo, 10 min)
1. Ler `contexto.md` da marca que vende (§2 objecoes, §6 oferta, §7 provas) e a conversa real com o lead (WhatsApp/SDR).
2. Pesquisar o lead (site, Instagram, LinkedIn, noticias) com fonte. Nada inventado.
3. Entregar **ficha de 1 tela**: quem e, o que a empresa faz, hipotese de dor (marcada como hipotese), o que ja sabemos e o que precisamos descobrir, 3 perguntas-chave, objecao mais provavel e o **objetivo da call** (ex: sair com diagnostico pago agendado).

## Roteiro (30 min)
**1. Contrato inicial (2 min).** "A ideia e eu entender como esta hoje, e no fim a gente decide junto se faz sentido seguir. Se nao fizer, eu falo, combinado?" Confirmar tempo disponivel e quem mais decide.

**2. Diagnostico (18 min, 60-70% da call, o cliente fala).**
- *Situacao atual (SPIN S / Gap estado atual):* "Como funciona hoje [captacao/vendas/evento]?" "Quanto fatura/vende por mes nisso?" "Quem cuida?"
- *Problema (SPIN P):* "O que nao esta funcionando como deveria?" "Desde quando?"
- *Implicacao (SPIN I / Sandler funil da dor):* "O que acontece se continuar assim mais 6 meses?" "Quanto isso custa por mes?" "Como isso afeta voce pessoalmente?" Descer ate a dor pessoal (Sandler: "me da um exemplo", "ha quanto tempo", "o que ja tentou", "quanto custou", "como se sente com isso").
- *Estado desejado (Gap):* "Onde quer estar em 6-12 meses? Com que numero?"
- *Necessidade (SPIN N):* "Se resolvesse isso, o que mudaria?" (o cliente vende pra si mesmo).
- **Gap quantificado:** repetir com os numeros DELE: "Hoje X, quer Y, a distancia custa Z por mes. Certo?"
- Qualificar no caminho: orcamento ("ja tem verba separada pra resolver isso?"), decisao ("alem de voce, quem participa?"), prazo ("pra quando precisa disso resolvido?").

**3. Apresentacao sob medida (6 min).** So o que responde a dor dita. Formato: "Voce disse [dor nas palavras dele]. Pra isso a gente faz [parte da oferta], e o resultado e [ligado ao numero dele]." Prova real da §7. Preco ancorado no gap: "Seu problema custa Z/mes; o investimento e W."

**4. Proximo passo (4 min).** Nunca "te mando a proposta e voce ve". Agendar a decisao: "Te mando a proposta hoje 18h e a gente fala quinta 10h pra decidir, pode ser?" Quem precisa estar.

## Objecoes: AECR
**A**colher ("faz sentido voce pensar nisso") → **E**xplorar ("caro comparado com o que?" / "o que precisaria ser verdade pra fazer sentido?") → **C**ontornar com o numero dele e prova real → **R**econfirmar ("isso resolve sua duvida?").
Mais comuns e a pergunta-chave:
- *"Ta caro"* → comparar com o custo mensal do problema que ELE disse.
- *"Vou pensar"* → "Claro. O que especificamente quer pensar? Preco, momento ou se resolve?"
- *"Preciso falar com socio/esposa"* → "Faz sentido. Marcamos 20 min com ele(a) junto? O que acha que ele(a) vai perguntar?"
- *"Agora nao e o momento"* → "O que muda daqui a 3 meses? O custo do problema para de correr?"
- *"Ja tentei agencia/consultoria e nao deu certo"* → "O que aconteceu? O que seria diferente desta vez?" (e mostrar o que de fato e diferente, com prova).

## Analise de call gravada/transcrita
Transcricao: audio do WhatsApp ja vem transcrito pelo worker; arquivo/video: transcrever com o Groq (mesmo do worker) se disponivel. Entregar:
1. % de fala vendedor x cliente (meta: cliente 60%+).
2. O que foi descoberto (situacao, dor, implicacao, numero, decisor, orcamento, prazo) e o que **faltou** descobrir.
3. Momentos fortes e os 3 erros mais caros (com trecho literal).
4. Objecoes que apareceram e como deveriam ter sido tratadas.
5. Proximo passo ficou marcado? Se nao, mensagem de recuperacao pronta.
6. Nota de qualificacao MEDDPICC (ver `/otavio-pipeline`).

## Regras
- Nunca roteiro decorado na fala do Jeff: perguntas como guia, na voz dele (§4).
- Nao inventar prova, ROI, case. Desconto/bonus/prazo so com ok do Jeff.
- Gravar a ficha e a analise em `/opt/jeff-worker/projetos/clientes/<slug-cliente-que-vende>/calls/AAAA-MM-DD-<lead>.md`.
