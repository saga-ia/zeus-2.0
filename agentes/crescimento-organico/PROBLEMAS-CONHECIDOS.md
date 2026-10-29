# Problemas conhecidos (levantados em 29/10/2026)

Estado real do módulo de crescimento orgânico no ZEUS. Nada aqui foi corrigido: o pacote é uma cópia do processo como está.

## 1. Análise de perfil parada por falta de crédito na Apify

- **Sintoma:** `creator-lab.sh analyze` e `social-posts.sh` falham; análises de 08/10/2026 (pedrosobral, luizenderle, leandroferrari) ficaram `failed` e lucureau `partial`.
- **Causa 1, crédito:** plano gratuito da Apify com teto de US$ 5 por mês. Uso no ciclo atual: US$ 5,93 (acima do teto). O ciclo renova em 02/11/2026.
- **Causa 2, memória:** em 08/10 várias análises rodaram ao mesmo tempo e a Apify recusou com HTTP 402: limite de 16 GB de memória somando todos os actors do plano gratuito.
- **Contorno:** rodar uma análise por vez; esperar a renovação ou contratar plano pago da Apify. Análise que travou: `creator-lab.sh resume <run_id>` (não cobra a coleta de novo).

## 2. Não existe processo para analisar um vídeo avulso por link

- **O que se quer:** mandar o link de um vídeo de rede social e receber transcrição, análise e sugestão de roteiro.
- **Hoje:** as skills analisam o perfil inteiro (`social-perfil-pesquisa`). Não há skill nem script para um link só.
- **Download direto bloqueado:** `yt-dlp` no servidor recebe "login required / rate-limit" do Instagram e "Sign in to confirm you're not a bot" do YouTube (IP de datacenter).
- **Caminhos possíveis (não implementados):** buscar o post pela Apify (`coletar-post.sh` já baixa post por link, custa centavos e depende do crédito do item 1) ou receber o arquivo do vídeo pelo WhatsApp e transcrever com Groq + quadros como no `reels-visual.py`.

## 3. `creator-lab.sh check` demora ou não termina

- Em 29/10 o `check` passou de 60 s sem resposta, mesmo com o app no ar (`127.0.0.1:5190` respondendo) e as 3 chaves gravadas. O `runs` funciona normalmente.
- Para conferir rápido: ver se as chaves existem no `app_settings` e se `/api/bootstrap` responde.

## 4. Links dos vídeos expiram

- Os vídeos coletados pela Apify vêm com link temporário (expira em dias). `reels-visual.py` precisa rodar logo depois do `analyze`; depois disso a análise visual do vídeo não é mais possível sem nova coleta.

## 5. Tokens do Instagram vencem

- Token do Instagram Login vence em 14/12/2026; o `ig-token-refresh.sh` renova todo dia 15 (cron). Se a renovação falhar, métricas, comentários e DMs param.
- O app da Meta precisava de ajuste de permissões do Instagram (pendente com o Jeff em outubro/2026).

## 6. Métricas automáticas só do próprio perfil

- `social-metrics.sh ig` só lê o @jeffhenrike (token próprio). Perfil de cliente entra por CSV colado à mão (`social-metrics.sh csv`). A revisão semanal automática vale só para o perfil do dono.

## 7. Caminhos fixos

- Skills e scripts apontam para `/opt/jeff-worker/...` e `/opt/jeff-apps/jeff-creator-lab`, e o `nina-weekly.sh` usa o envio de WhatsApp do worker (`scripts/wapi.sh`, não incluído) e o Claude CLI em `/root/.nvm/versions/node/v20.20.2/bin/claude`. Em outro sistema, recriar a mesma estrutura ou trocar os caminhos.
