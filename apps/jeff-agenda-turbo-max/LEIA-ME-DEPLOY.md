# Zeus Post — instruções de atualização no servidor

## ⚠️ ANTES DE TUDO: não apague a pasta `data/`

No servidor, a pasta `/opt/jeff-apps/jeff-zeus-post/data/` contém:

- `zeus_post.db` — o banco (contas conectadas, campanhas, histórico)
- `.encryption-key` — a chave que abre os tokens criptografados
- `.jwt-secret` — o segredo das sessões de login
- `uploads/` — mídias aguardando publicação

**Este ZIP não contém a pasta `data/`, de propósito.** Se você apagar a pasta antiga
inteira e subir esta no lugar, perde as contas conectadas e o histórico.

O jeito certo é **copiar por cima**, deixando `data/` intacta.

---

## Passo a passo

### 1. Backup (2 minutos, evita dor de cabeça)

```bash
cd /opt/jeff-apps
tar -czf backup-zeus-$(date +%F-%H%M).tar.gz jeff-zeus-post
```

### 2. Suba o ZIP e extraia POR CIMA

```bash
cd /opt/jeff-apps/jeff-zeus-post
unzip -o ~/zeus-post-atualizado.zip
```

O `-o` sobrescreve os arquivos de código sem tocar em `data/`.

### 3. Instale as dependências

Obrigatório — o `multer` mudou de versão (1.x → 2.x) nesta atualização:

```bash
cd /opt/jeff-apps/jeff-zeus-post && npm install
```

### 4. Defina os segredos (recomendado)

Se não fizer isso, o sistema gera e guarda em arquivo dentro de `data/` — funciona,
mas o ideal é fixar por variável de ambiente:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

Coloque as duas linhas no bloco `env` dos dois apps em `ecosystem.config.js`.

**Atenção:** se o sistema já rodou uma vez e criou `data/.encryption-key`, e você
depois definir um `ENCRYPTION_KEY` diferente, os tokens salvos ficam ilegíveis e
todas as contas precisam ser reconectadas. Ou define antes da primeira subida, ou
mantém o arquivo.

### 5. Reinicie

```bash
pm2 restart jeff-zeus-post jeff-zeus-post-worker && pm2 logs --lines 40
```

### 6. Confira o log de subida

Você deve ver:

```
[db] Criptografia em repouso: N registro(s) sensível(is) criptografado(s)
[zeus-post] Rodando na porta 3070
[scheduler] ativo (modo worker dedicado)
```

A linha da criptografia aparece **só na primeira subida** — é a migração dos tokens
que estavam em texto plano. Nas próximas, não aparece mais.

Se aparecer `⚠️ SENHA PADRÃO AINDA EM USO`, troque em Configurações → Alterar senha.

---

## Depois de subir

1. **Conectar Perfis → 🩺 Rodar diagnóstico** — confirma se a conexão com a Meta está
   sadia e, se não estiver, diz exatamente o que corrigir.
2. **Publicação em Massa** — confira o aviso no topo: verde = scheduler rodando.

---

## O que mudou nesta versão

**Agendamento**
- Scheduler embutido no servidor como reserva: se o processo worker cair ou não
  estiver rodando, o próprio site assume o processamento em até 2 minutos
  (era a causa de "só publica quando clico em Debug")
- Espera por vídeo passou de 2 para 10 minutos (Reels grandes davam timeout à toa)
- 3 publicações em paralelo em vez de uma por vez
- Retry automático: até 2 novas tentativas com 10 min de intervalo antes de desistir
- Renovação automática de token do YouTube e TikTok antes de publicar
  (o do YouTube vence em 1h — qualquer agendamento mais longo falhava)

**Stories**
- Aba própria na Publicação em Massa, com botão separado de configurações
- Sequência de N stories por horário, com intervalo configurável
- Story avulso no Novo Post (Feed / Story)
- Espelhamento: cada post do feed sai também como story, na mesma quantidade
- Métricas de story no Analytics (respostas, saídas, avanços, retornos)

**Segurança**
- Tokens, App Secrets e chaves de IA criptografados no banco (AES-256-GCM)
- Corrigido: `/api/settings` devolvia as chaves de IA e o acesso ao Google Drive
  em texto plano
- Corrigido: `/api/posts`, `/api/analytics` e `/api/analytics/post/:id` devolviam
  tokens junto com os dados
- Segredo do JWT deixou de ser fixo no código
- Limite de 10 tentativas de login por IP a cada 15 minutos
- Tokens e segredos apagados automaticamente de logs e mensagens de erro

**Trava de segurança de publicação**
- Bloqueia campanha acima de 25 posts/dia por conta (20 para stories) ou com
  intervalo menor que o mínimo seguro, com explicação do motivo
- Com espelhamento ligado, conta o volume dobrado

**Diagnóstico**
- Botão em Conectar Perfis que pergunta à Meta o estado de cada conta e aponta
  o que está travando, com a correção de cada item
- Guia de 14 passos para conectar o Instagram do zero

**Correções**
- Bloqueio por intervalo de datas errava o dia em posts noturnos (fuso UTC/BRT)
- `multer` atualizado de 1.4.5 (descontinuado, com falhas conhecidas) para 2.x


---

## Novidades desta versão

**Correção — edição de campanha agora funciona**
Antes, editar salvava só a configuração; os itens já agendados continuavam com os horários e a quantidade
antigos, e como são eles que o worker publica, a edição não tinha efeito. Agora os itens pendentes são
recalculados ao salvar, e há campo para reduzir a quantidade de publicações. O que já foi publicado nunca
é alterado nem apagado.

**Calendário e Dashboard passam a enxergar campanhas**
Os agendamentos de campanha só viravam registro de publicação na hora de publicar — por isso uma campanha
de 300 posts aparecia como zero. Agora existe uma agenda unificada (posts + itens de campanha) com filtro
por conta, status e tipo, e o calendário busca o mês que você está navegando.

**Atualização automática** — as telas se atualizam ao voltar o foco na aba, em intervalo fixo e quando
outra aba altera algo. Sem recarregar na mão.

**Confirmação antes de iniciar campanha** — mostra conta vinculada, quantidade, datas e as mídias antes
de publicar, com botões Editar e Iniciar.

**Galeria de mídias** — botão "Ver mídias" em cada campanha, com prévia e opção de tirar um item da
programação sem mexer no resto.

**Responsividade** — o sistema não tinha nenhuma regra responsiva. Agora funciona de 320px a 1440px,
com menu em gaveta no celular. Validado em 42 combinações (7 telas x 6 larguras), sem rolagem lateral.

### Limitações da API da Meta (não implementadas por impossibilidade técnica)

- **Link em Stories:** a Graph API não expõe o adesivo de link. O endpoint de stories aceita apenas a
  mídia. Nenhuma ferramenta publica story com link clicável via API — só pelo aplicativo.
- **Música do catálogo do Instagram:** não é possível anexar via API. A alternativa seria mixar o áudio
  no vídeo com FFmpeg antes de publicar, o que exige FFmpeg instalado na VPS e fila de processamento.
