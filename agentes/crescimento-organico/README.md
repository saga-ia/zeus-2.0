# Crescimento orgânico e produção de conteúdo (Nina + Sobral)

Pacote com **tudo o que o ZEUS usa hoje** para produzir conteúdo e crescer nas redes sociais (Instagram), copiado do servidor em 29/10/2026 **sem alterações no processo**. Serve para levar esse módulo para outro sistema que ainda não faz produção de conteúdo nem crescimento orgânico.

Problemas e limitações conhecidos: [`PROBLEMAS-CONHECIDOS.md`](PROBLEMAS-CONHECIDOS.md).

## O que este módulo faz

| Pedido | Quem faz | Como |
|---|---|---|
| "Analisa o perfil de @fulano" (concorrente, referência ou o próprio) | Nina · `social-perfil-pesquisa` | Baixa os últimos 30 posts e 20 Reels, transcreve as falas, classifica gancho/estrutura/CTA/tema (Jev), assiste os vídeos (quadros do gancho, cortes, cenário), lê imagens e carrosséis e cruza tudo com o desempenho (mediana). Entrega o que funciona naquele perfil, peças exemplares e estruturas para o swipe file. |
| "Diagnostica meu perfil" | Nina · `social-diagnostico` | Gargalo em 1 frase, o que parar de postar, padrão dos posts que funcionam, avatar. |
| "O que eu posto?" / pauta | Nina · `social-pesquisa` + `social-ideias-gancho` | Tendências do nicho com fonte, posts fora da curva de concorrentes, banco de 30 ideias com gancho e nota. |
| Roteiro de Reels ou carrossel | Nina · `social-peca` | Ideia + gancho viram peça pronta (carrossel de 10 cards ou roteiro de Reels) com legenda. |
| Pacote para postar | Nina · `social-pacote` | Legenda revisada, arte, horário em BRT, comentário fixado, checklist. |
| Funil de conteúdo | Nina · `social-funil` | Classifica os últimos 12 posts em atração, preparação ou conversão e mostra o buraco. |
| Revisão semanal (automática) | Nina · `social-revisao-semanal` + cron | Toda segunda 9h BRT: PARAR / MANTER / DOBRAR / TESTAR com mediana por mil alcançados e os próximos 7 dias, enviada por WhatsApp. |
| Estratégia de crescimento (orgânico + pago) | Sobral · `sobral-instagram` | Bio, destaques, ganchos de Reels, algoritmo, tráfego pago para o perfil, plano 90 dias. |
| Concorrência, públicos, auditoria, lançamento | Sobral · `sobral-*` | Meta Ad Library, públicos, auditoria 360 da conta, lançamento, tracking. |
| Posicionamento e pautas a partir do método | plugin `maestro-posicionamento` | Varredura da marca, concorrência, roteamento por método, plano por fases e inteligência de conteúdo. |

## Fluxo da semana

```
Maicom (estratégia: posicionamento, personas, tom)  →  contexto.md da marca
        │
        ▼
Nina: pesquisa → ideias/ganchos → peça → aprovação do dono → pacote → publica
        │                                                        │
        └──── revisão semanal (segunda 9h BRT, cron) ◄───────────┘
                 métricas do Instagram (mediana por mil alcançados)
Sobral: crescimento pago + orgânico, concorrência e anúncios quando o conteúdo precisa de alcance
```

O dono (Jeff ou Vinicius) é o editor-chefe: a Nina coordena, ele aprova. Nada é publicado sem "vai".

## Conteúdo do pacote

| Pasta | O que tem | Origem no servidor |
|---|---|---|
| `agentes/` | `nina-social-media.md`, `sobral-trafego.md` (definição dos agentes) | `/root/.claude/agents/` |
| `skills/nina/` | `social-diagnostico`, `social-pesquisa`, `social-ideias-gancho`, `social-peca`, `social-pacote`, `social-funil`, `social-revisao-semanal`, `social-perfil-pesquisa`, `time-nina` | `/root/.claude/skills/` |
| `skills/sobral/` | `sobral-instagram`, `sobral-mercado`, `sobral-publicos`, `sobral-auditoria`, `sobral-consultoria`, `sobral-lancamento`, `sobral-bm-meta`, `sobral-google-ads`, `sobral-tracking`, `sobral-troubleshoot`, `time-sobral` | `/root/.claude/skills/` |
| `plugins/` | `sobral-gestor-trafego` (versão plugin do Sobral, com referências) e `maestro-posicionamento` (estrategista de posicionamento) | plugins sincronizados do Claude |
| `scripts/` | ferramentas que as skills chamam (tabela abaixo) | `/opt/jeff-worker/scripts/` |
| `creator-lab/` | app local que coleta Reels, transcreve e classifica com o Jev (sem `data/`, `node_modules/` e `.env`) | `/opt/jeff-apps/jeff-creator-lab/` |
| `memoria/nina-modelo/` | pasta modelo de um perfil novo na Nina | `/opt/jeff-worker/projetos/nina/_modelo/` |
| `memoria/contexto-modelo/` | modelo do `contexto.md` da marca (lido por Nina, Sobral, Ícaro, Gustavo, Talles) | `/opt/jeff-worker/projetos/clientes/_modelo/` |
| `memoria/exemplo-jeffhenrike/` | exemplo real: memória da Nina do @jeffhenrike (referências, ideias, calendário, desempenho, roteiros, pacotes) e o contexto da marca | `projetos/nina/jeffhenrike/`, `projetos/clientes/jeffhenrike/` |
| `docs/` | `roda-das-emocoes.md` (gatilhos de gancho) e `cartao-passagem.md` (passagem entre agentes) | `/opt/jeff-worker/docs/` |

### Scripts

| Script | Para quê | Usa |
|---|---|---|
| `creator-lab.sh` | liga o Creator Lab, `check` das chaves, `analyze <perfil> [reels] [idioma] [teto_usd] [paralelo]`, `runs`, `show`, `resume`, `metrics`, `export` | Creator Lab em `127.0.0.1:5190` |
| `reels-visual.py` | "assiste" os Reels de uma análise: 4 quadros do gancho + 6 do miolo, cortes por minuto, primeiro corte, fala por minuto | ffmpeg, vídeos da análise |
| `social-posts.sh` | coleta posts de imagem e carrossel de um perfil (legenda, números, até 3 lâminas baixadas para leitura) | Apify (`apify.sh`) |
| `coletar-post.sh` | coleta posts avulsos por link (todas as lâminas + folha de contato) | Apify |
| `apify.sh` | chamadas à Apify (actor `apify~instagram-scraper`) | chave Apify |
| `instagram.sh` | próprio perfil pela API oficial: perfil, posts, insights, comentários, resposta, DMs e publicação | tokens Meta/Instagram |
| `social-metrics.sh` | salvos/mil e compartilhamentos/mil por post + mediana (`ig [n]` do próprio perfil ou `csv` de cliente) | `instagram.sh` |
| `nina-weekly.sh` | revisão semanal automática (segunda 9h BRT) enviada por WhatsApp | `social-metrics.sh`, Claude CLI, envio de WhatsApp do worker |
| `ig-comment-poller.sh` | a cada 5 min varre os últimos posts, acha comentários com palavra-chave, responde e manda DM | tokens Meta |
| `ig-token-refresh.sh` | renova o token do Instagram Login todo dia 15 | token Instagram Login |
| `feedback-arte.sh` | lê o que o dono aprovou ou reprovou nas artes (👍/👎 no chat da Central) antes de criar a próxima | banco da Central |

Os números de WhatsApp de destino em `nina-weekly.sh` foram trocados por `<WHATSAPP_DONO>` e `<WHATSAPP_SOCIO>`.

## O que precisa para rodar em outro sistema

**Chaves** (no ZEUS ficam na tabela `app_settings` do `worker.db`, nunca em `.env`; aqui só os nomes):

| Chave | Serviço | Para quê |
|---|---|---|
| `apify_api_token` (ou `apify_api_key`) | Apify | baixar posts e Reels de perfis públicos |
| `groq_api_key` | Groq (Whisper) | transcrever as falas dos Reels |
| `typesafe_api_key` | Jev (TypeSafe) | classificar gancho, estrutura, CTA e tema |
| `jeff_meta_ig_user_token`, `jeff_meta_ig_account_id` | Meta Graph API | métricas e comentários do próprio perfil |
| `jeff_instagram_login_token` (+ `_expires_at`) | Instagram Login API | DMs e renovação de token |

**Programas:** Claude Code (agentes e skills em `~/.claude/agents` e `~/.claude/skills`), Node 20+ (o Creator Lab pede 22.9+ no `package.json`, aqui roda com 20.20.2), Python 3 com Pillow, `ffmpeg`, `jq`, `sqlite3`, `curl`.

**Pastas esperadas pelos caminhos das skills:** `/opt/jeff-worker/scripts/`, `/opt/jeff-worker/projetos/nina/<perfil>/`, `/opt/jeff-worker/projetos/clientes/<perfil>/contexto.md`, `/opt/jeff-apps/jeff-creator-lab/`. Em outro sistema, ou se cria a mesma estrutura ou se troca os caminhos nas skills.

**Cron** (servidor em Europe/Berlin):

```
*/5 * * * *  scripts/ig-comment-poller.sh
0 3 15 * *   scripts/ig-token-refresh.sh
0 13,14 * * 1 scripts/nina-weekly.sh      # o script só segue se for 9h em São Paulo
```

## Instalação resumida

1. Copiar `agentes/*.md` para `~/.claude/agents/` e cada pasta de `skills/nina` e `skills/sobral` para `~/.claude/skills/`. Plugins: instalar pela interface de plugins do Claude ou copiar as skills deles.
2. Copiar `scripts/` para a pasta de scripts do sistema e ajustar os caminhos (`/opt/jeff-worker/...`) se forem outros.
3. Creator Lab: copiar `creator-lab/`, rodar `npm install` e subir com `creator-lab.sh start` (só em `127.0.0.1`). `creator-lab.sh check` confere as 3 chaves.
4. Gravar as chaves no `app_settings` (ou adaptar a leitura das chaves dos scripts para o cofre do outro sistema).
5. Criar a memória de cada perfil: copiar `memoria/nina-modelo/` para `projetos/nina/<perfil>/` e `memoria/contexto-modelo/` para `projetos/clientes/<perfil>/`, e preencher o `contexto.md`.
6. Agendar o cron da revisão semanal e trocar `<WHATSAPP_DONO>` / `<WHATSAPP_SOCIO>`.

## Regras do processo (valem em qualquer sistema)

- Métrica sempre por **mediana** e **por mil alcançados** (salvos, compartilhamentos, seguidores), nunca média nem número absoluto.
- Comparar posts só dentro da mesma intenção (conteúdo, autoridade, prova social, relacionamento, oferta).
- Primeira análise de perfil: 30 posts + piloto de 20 Reels, teto de US$ 1 na Apify. Lote maior só com ok do dono.
- Análise travou: `resume`, nunca `analyze` de novo (cobra a coleta outra vez).
- Rodar `reels-visual.py` logo depois da análise: os links dos vídeos expiram em dias.
- Nada é publicado sem aprovação explícita; teste de publicação nunca na conta real.
