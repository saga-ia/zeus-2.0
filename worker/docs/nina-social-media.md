# Nina — social media (conteúdo orgânico do Instagram)

Agente: `/root/.claude/agents/nina-social-media.md` (invocar com `subagent_type: nina-social-media`).
Papel: gestora do fluxo de conteúdo. O Maicom faz a estratégia (posicionamento, personas, tom de voz), a Nina roda o dia a dia. Jeff/Vinicius são o editor-chefe.

## Quando acionar
"o que eu posto", "pesquisa pauta", "ideia de post", "gancho", "carrossel", "legenda", "roteiro de reels", "prepara pra postar", "como foram os posts", "revisão da semana", "calendário do mês", "funil de conteúdo", "o que parar de postar". Também quando Jeff responder "vai" a um pacote da Nina.

## Fluxo (2 paradas obrigatórias)
Pesquisa/ideias → **PARADA 1 (Jeff escolhe)** → gancho + peça + briefing visual → **PARADA 2 (Jeff aprova)** → pacote → **"vai" do Jeff/Vini** → publica → revisão semanal → nova pauta.
No WhatsApp: uma etapa por rodada (agent-runner corta em 10 min). Nunca publicar sem "vai" dado sobre aquele pacote.

## Skills
1. `social-diagnostico`: gargalo, o que parar, padrão vencedor, objetivo 30d, 2 métricas, avatar, completa a Voz do contexto com legendas reais.
2. `social-pesquisa`: pauta com fonte verificável + swipe file (estrutura, nunca cópia).
3. `social-ideias-gancho`: 30 ideias / top 10, 10 ganchos em 6 famílias.
4. `social-peca`: carrossel de 10 cards ou roteiro de Reels + briefing visual. Arte via CarrosseIA ou Gustavo.
5. `social-pacote`: pacote final (legenda, arte, horário BRT, comentário fixado, alt text, checklist). Publica só com "vai".
6. `social-funil`: últimos 12 posts por função (atração/preparação/conversão) + 30 dias.
7. `social-revisao-semanal`: PARAR / MANTER / DOBRAR / TESTAR + placar da semana passada + 7 dias.
8. `social-perfil-pesquisa`: perfil completo. Posts/carrosséis: `scripts/social-posts.sh <perfil> [30] [pasta] [lâminas]` (Apify + baixa lâminas pra Nina ler; ~1 min). Reels: Creator Lab (`scripts/creator-lab.sh`, app em `/opt/jeff-apps/jeff-creator-lab`, só 127.0.0.1:5190). Apify coleta, Groq transcreve, Jev (TypeSafe) classifica gancho/estrutura/CTA/tema; mediana de plays por rótulo. Chaves no `app_settings`: `apify_api_token`, `groq_api_key`, `typesafe_api_key`. Piloto 20 Reels / teto US$ 1; retomar com `resume`, nunca coletar de novo.

## Memória por perfil
Contexto da marca (público, voz, oferta, provas): `projetos/clientes/<perfil>/contexto.md`, compartilhado com todos os agentes. Operacional da Nina: `projetos/nina/<perfil>/`: ideias, calendario, desempenho, `roteiros/`, `pacotes/`. Cliente novo: copiar `projetos/nina/_modelo/`. Mapa em `projetos/nina/README.md`.

## Dados
- `scripts/social-metrics.sh ig [12]`: últimos N posts do @jeffhenrike (alcance, salvos, compart., seguidores; /mil; mediana; `vs_mediana`; `rank`; `avisos`). Só leitura, ~20s pra 12 posts.
- `scripts/social-metrics.sh csv <arquivo>`: mesmo cálculo pra cliente. Cabeçalho: `data,tipo,tema,alcance,salvos,compartilhamentos,seguidores`.
- Mediana zero (perfil com pouca interação): usar `rank`/`score_mil`.
- `follows` por post veio 0 em todo o feed em 06/10/2026 e não existe pra Reels: não usar como métrica até confirmar.

## Cron
`scripts/nina-weekly.sh`: segunda 9h BRT, revisão semanal do @jeffhenrike por WhatsApp pro Jeff e pro Vinicius. Log em `logs/nina-weekly.log`.

## Limites
- Escopo: @jeffhenrike automático; clientes da Alpha com número colado (sem token deles).
- `instagram.sh` não publica carrossel: pacote de carrossel sai pra postar manual.
- Publicar, responder comentário ou mandar DM: só com "vai" explícito do Jeff/Vinicius.
