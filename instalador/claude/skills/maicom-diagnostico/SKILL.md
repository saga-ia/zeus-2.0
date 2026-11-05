---
name: maicom-diagnostico
description: Skill 01 do Maicom — Diagnóstico Completo do Cliente. Primeira skill do ciclo (Fase 1, Análise). Lê formulário/briefing/redes do cliente e entrega documento estruturado em 6 blocos: identidade do player, presença digital atual, produtos/serviços, público-alvo, concorrência/mercado, diagnóstico estratégico final (3 tensões, 3 alavancas, 3 bloqueios). Acionar no primeiro contato com cliente novo ou em revisão completa após 6 meses. Frases-gatilho "vamos começar", "analisa esse cliente", "lê o formulário", "faz o diagnóstico".
---

# Maicom — Skill 01: Diagnóstico Completo do Cliente

**Fase 1 (Análise) — primeira skill do ciclo. Pré-requisito de todas as outras.**

## Ativar quando
- Primeiro contato com cliente novo.
- Briefing/formulário chegou pela primeira vez.
- Frases-gatilho: "vamos começar", "analisa esse cliente", "lê o formulário", "faz o diagnóstico", "primeiro contato com [nome]".
- Revisão completa após 6 meses de trabalho.

## Não ativar quando
- Diagnóstico já foi feito neste ciclo e pergunta é sobre outro tema.
- Pergunta é especificamente sobre mercado (`/maicom-mercado`) ou público (`/maicom-personas`).

## Pré-execução: Protocolo de leitura

Antes de começar, executar internamente o protocolo de leitura (seção 3 do agente principal):
- Extração estruturada nas 14 camadas.
- Identificação de tensões internas.
- Calibração de linguagem da sessão.
- Critérios de qualidade: cliente em uma frase, problema central, tensão principal, lacunas.

## Entrega: documento em 6 blocos

### Bloco 1 — Identidade do player
- Nome, empresa, cargo, segmento.
- Trajetória (pontos de virada, experiências que viram autoridade).
- Narrativa de origem.
- Valores explícitos e implícitos.
- Diferencial real (o que de fato o separa, não o que ele acha).

### Bloco 2 — Presença digital atual
- Mapa de canais (Instagram, LinkedIn, YouTube, site, etc).
- Tamanho de audiência por canal.
- O que está funcionando (formatos, conteúdos, posts vencedores).
- O que não está funcionando (sintoma + causa provável).
- **Gap entre nível do player e nível da presença atual.**

### Bloco 3 — Produtos e serviços
- Mapa completo de ofertas.
- Produto âncora (qual carrega o faturamento).
- Tickets e margens (quando disponível).
- Papel de cada produto na jornada do cliente.
- Lacunas (níveis da esteira que faltam).

### Bloco 4 — Público-alvo
- Demografia básica.
- Psicografia (valores, estilo de vida, identidade).
- Nível de consciência predominante (inconsciente do problema / consciente do problema / consciente da solução / consciente do produto / mais consciente).
- Dores reais (o que está por baixo do que dizem sentir).
- Objeções declaradas + não ditas.

### Bloco 5 — Concorrência e mercado
- Top 3-5 concorrentes diretos.
- Como cada um se posiciona.
- Onde cada um falha (oportunidade pra esse cliente).
- Tendências do segmento (sinalizar se é padrão observado vs dado verificado).
- Ameaças (novos entrantes, mudanças regulatórias, comportamento de consumo).

### Bloco 6 — Diagnóstico estratégico final
- **Posicionamento atual** (como o cliente é percebido hoje, em uma frase).
- **Posicionamento desejado** (onde quer chegar, em uma frase).
- **Distância entre os dois.**
- **3 tensões estratégicas** (conflitos internos do posicionamento).
- **3 alavancas** (o que pode acelerar o reposicionamento).
- **3 bloqueios** (o que está travando hoje).
- **Lacunas pendentes** (informação que faltou no briefing e precisa ser coletada).

## Regra crítica

Se houver **lacunas críticas** no formulário (margem, ticket médio, taxa de conversão, dor real do público, posicionamento desejado), **sinalizo no início e travo avanço pras próximas skills até serem coletadas**. Trabalho em base fraca gera retrabalho.

## Saída padrão

Segue o formato padrão do agente principal:
- Skill ativada + por que agora.
- Contexto processado.
- Lacunas identificadas.
- Entrega da skill (6 blocos acima).
- Próximo passo: tipicamente `/maicom-mercado` (Skill 02).

## Próximas skills habilitadas
- `/maicom-mercado` (Skill 02).
- `/maicom-personas` (Skill 03).

## Gravar no contexto unico (obrigatorio ao fim)
Atualizar `/opt/jeff-worker/projetos/clientes/<slug>/contexto.md`, §1 Identidade, §5 Diferenciais, §10 Restricoes. So o resumo escaneavel + link do documento completo. Marcar `(observado)`/`(pendente)` conforme `/opt/jeff-worker/projetos/clientes/README.md` e registrar na §11. Sem isso, Icaro, Nina, Sobral, Gustavo e Talles nao enxergam a entrega.
