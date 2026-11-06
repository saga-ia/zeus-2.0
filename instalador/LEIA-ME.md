# Instalador ZEUS no servidor do cliente

Copia o Zeus 2.0 inteiro (worker, todos os apps, sites, agentes e skills) pra VPS do cliente, troca o domínio, gera chaves novas e deixa tudo no ar com HTTPS.

## O que aparece na tela

- **Checagem antes de começar:** sistema, memória, disco (mínimo 25 GB livres), internet (npm, Docker, Google, Cloudflare, Let's Encrypt), portas 80/443 e apt livre. Apache ou Nginx ocupando a porta 80/443 são parados sozinhos.
- **Progresso:** `[5/18] Copiando o Zeus` com barra, tempo decorrido e uso de RAM e disco. Cada comando longo mostra uma linha viva com o tempo e a última coisa que o comando escreveu.
- **Travamento:** 8 minutos sem log e sem CPU, ele interrompe e tenta de novo.
- **Autocorreção:** repete o que falhou por rede (até 3 vezes, com pausa), espera a atualização automática do Ubuntu liberar o apt, conserta o dpkg e limpa o cache do npm.
- **Verificação final:** reinicia os apps que caíram (até 3 rodadas), religa containers parados, testa a Central, o WhatsApp e o HTTPS, e mostra o último erro de qualquer app que não subiu.

## Jeito mais fácil: um comando, sempre o mesmo

No **servidor do cliente**, como root:

```bash
curl -fsSL https://zeus-instalacao.jefersonhenrike.com/instalar | bash
```

Ele pede a **senha do admin do formulário**, mostra os clientes que preencheram o formulário, você escolhe o número e ele instala. Ele baixa:
- o Zeus: a **última versão publicada** com `publicar.sh` (pacote limpo, só o produto; ver "Versões e atualizações");
- a resposta do formulário escolhida;
- o token da Cloudflare.

O servidor do cliente também fica **registrado pras atualizações** (aparece em `/admin/versoes`).

Não precisa de token do GitHub nem de passar pelo servidor do Jeff antes. O instalador abre dentro do `tmux`: se a conexão cair, entre de novo e rode `tmux attach -t zeus`.

Alternativa sem senha: `gerar-link.sh` no servidor do Jeff gera um link de uso único que vale 24 horas.

O jeito manual, passo a passo, está abaixo.

## Antes da chamada

1. **VPS do cliente**: Debian 12 (recomendado) ou Ubuntu 22/24, mínimo 4 vCPU e 8 GB, acesso root por SSH.
2. **DNS**: o domínio do cliente é `<nomecliente>.zeusia.cloud`, e o **instalador cria o DNS sozinho** pela API da Cloudflare: `<nomecliente>.zeusia.cloud` e `*.<nomecliente>.zeusia.cloud`, sem proxy. Ele pede o token escondido e usa só em memória, sem gravar em disco nem no log.
   Crie um token só pra isso: Cloudflare > My Profile > API Tokens > Create Token > *Edit zone DNS*. Em Permissions, deixe **Zone > DNS > Edit** e adicione **Zone > Zone > Read**. Em Zone Resources, escolha **Include > Specific zone > zeusia.cloud**.
   Esse token mexe em todo `*.zeusia.cloud` (inclusive nos outros clientes), então não use o token geral da conta e troque esse se desconfiar de vazamento.
   O token fica salvo em `instalador/cloudflare.token`: o instalador usa sozinho, sem perguntar. Pra trocar, faça *Roll* na Cloudflare e substitua o conteúdo desse arquivo.
   Alternativa sem levar token pro cliente: no servidor do Jeff, `bash /root/zeus-2.0/instalador/dns-cliente.sh <nomecliente> <IP_DO_CLIENTE>`.
   Se o cliente usar um domínio próprio, crie no DNS dele um **A curinga** `*` apontando pro IP da VPS.
3. **Token do GitHub** só de leitura e só deste repo: GitHub > Settings > Developer settings > Fine-grained tokens, repositório `saga-ia/zeus-2.0`, permissão *Contents: Read*, validade de 7 dias.

## Na VPS do cliente (como root)

```bash
read -rsp "Token GitHub: " T; echo
git clone https://x-access-token:$T@github.com/saga-ia/zeus-2.0.git /opt/zeus-2.0; unset T
bash /opt/zeus-2.0/instalador/instalar.sh --formulario /root/resposta.json
```

**Resposta do formulário (recomendado):** copie do seu servidor pro do cliente antes de rodar. O `<id>` aparece no endereço da resposta em `zeus-instalacao.jefersonhenrike.com/admin`.

```bash
scp /opt/jeff-apps/zeus-instalacao/data/respostas/<id>.json root@<IP_DO_CLIENTE>:/root/resposta.json
```

Com o arquivo, o instalador já sugere domínio, empresa, dono, WhatsApp, e-mail e números autorizados (Enter confirma) e grava as chaves que o cliente colou. Sem o arquivo, ele pergunta tudo, inclusive cada chave (Enter pula). Depois roda sozinho, em 20 a 40 minutos.

Se parar no meio ou o DNS ainda não tiver propagado, **é só rodar de novo**: o que já está pronto é pulado. Pra refazer uma etapa: `--refazer <etapa>`. Pra mudar as respostas: `--respostas`.

## O que ele faz

| Etapa | O quê |
|---|---|
| sistema | pacotes, Chromium, swap se tiver pouca memória |
| docker / node | Docker, Node 20.20.2 via nvm (mesmo caminho do servidor original), PM2, Claude Code |
| codigo | copia o repo pro layout `/opt/jeff-*`, igual ao servidor original |
| claude | agentes e skills do Claude Code, e as memórias de regras e procedimentos do Zeus (sem dado seu nem de cliente) |
| personalizar | troca o domínio, gera chaves internas novas (apps que dividem chave continuam se entendendo), escreve os `.env`, marca o cliente como dono no CLAUDE.md |
| dependencias | `npm ci` em cada app e pacotes Python |
| bancos | cria os 24 bancos com a estrutura de produção, vazios, e a configuração padrão do worker |
| chaves | grava as chaves DO CLIENTE (OpenAI, Gemini, Groq, ElevenLabs, Meta, Instagram, Google, Asaas, ClickUp, ZapSign) e gera as internas |
| containers | Nginx Proxy Manager, Postgres, Redis, n8n, Evolution, Omniroute, Presenton, MoneyPrinter |
| firewall | só SSH, 80 e 443 abertos pra fora; painel do proxy só por túnel SSH |
| pm2 | sobe os processos que estão online em produção |
| central | cria o dono como proprietário da Central |
| proxy | cria os subdomínios e um certificado SSL único |
| apis | liga as APIs ao domínio novo: webhook do Instagram, ID da conta, webhook do Asaas e do ClickUp; lista as URLs pra colar na Meta, no Google e na ZapSign |
| crontab | instala o crontab de produção |

No fim ele mostra os acessos, que ficam salvos em `/root/zeus-acessos.txt` (só root lê).

## Na chamada com o cliente

1. `claude` na VPS e depois `/login` com a conta do cliente (assinatura dele).
2. `https://sagazeus.<dominio>`: entrar e ler o QR com o celular do número do Zeus.
3. Colar nos painéis da Meta, do Google e da ZapSign as URLs que a etapa `apis` mostrou.

Chave nova ou trocada depois: `instalar.sh --refazer chaves` e em seguida `instalar.sh --refazer apis`.

O cliente começa **sem os seus dados**: conversas, contatos, CRMs, sessões e as suas chaves ficam só no seu servidor. Banco e chave nunca passam pelo GitHub.

## Quem manda

O dono informado no instalador tem autorização total. Jeferson e Vinicius ficam na whitelist como suporte técnico e recebem os alertas de saúde.

## Manutenção (no servidor do Jeff)

`docs/atualizar-snapshot.sh --push` atualiza o repo e os modelos do instalador (`gerar-modelos.sh`). Os modelos não guardam nenhum valor secreto, só os nomes das chaves e placeholders.

## Versões e atualizações dos clientes

Melhorou alguma coisa no Zeus do servidor do Jeff e quer levar pros clientes:

```bash
bash /root/zeus-2.0/instalador/publicar.sh "o que mudou"
```

1. Copia a produção (`/opt/jeff-*`) pro repositório com os segredos mascarados e faz o commit (`--sem-producao` pula isso).
2. Monta o pacote limpo (`lib/pacote.py`): só o produto. O que é só do Jeff fica de fora pelas regras do `modelos/fora.txt`
   (`app`, `site`, `host`, `cron`... e `arquivo` pra caminhos que nem saem do servidor). Se aparecer nome de cliente do Jeff
   (linhas `sigilo`) fora das pendências conhecidas (`aceito`), **não publica**.
3. Registra a versão. **Nenhum cliente recebe nada** até você aprovar em
   https://zeus-instalacao.jefersonhenrike.com/admin/versoes (por cliente ou pra todos).

No servidor do cliente, `instalador/atualizar.sh` roda a cada 15 minutos. Quando há versão aprovada, ele baixa (confere o
sha256), personaliza numa pasta à parte, copia por cima **sem apagar nada** e guardando o que trocou
(`/opt/zeus-atualizacao/backup-*`), instala dependências e reinicia só os apps que mudaram. Se algum processo não ficar de
pé, desfaz sozinho e o painel mostra "falhou" com o motivo. Nunca toca em `.env`, bancos, `data/`, logs e sessão do WhatsApp.
Arquivo que no repositório ainda tem `<REDACTED>` não substitui o do cliente.

No cliente: `bash /opt/zeus-2.0/instalador/atualizar.sh --status` mostra a situação; `--forcar` tenta de novo uma versão que falhou.
Fica de fora da atualização automática (fazer à mão se mudar): `docker-compose.yml` do proxy e a imagem dos apps em
container (Evolution, MoneyPrinter).
