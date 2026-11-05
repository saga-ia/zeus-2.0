# Instalador ZEUS no servidor do cliente

Copia o Zeus 2.0 inteiro (worker, todos os apps, sites, agentes e skills) pra VPS do cliente, troca o domínio, gera chaves novas e deixa tudo no ar com HTTPS.

## Jeito mais fácil: um comando

1. No **servidor do Jeff**: `bash /root/zeus-2.0/instalador/gerar-link.sh`. Escolha o cliente na lista.
2. Ele devolve uma linha `curl -fsSL https://zeus-instalacao.jefersonhenrike.com/i/<código> | bash`. Cole essa linha no **servidor do cliente**, como root.

O link leva o Zeus, a resposta do formulário e o token da Cloudflare, funciona uma vez e expira em 24 horas. O cliente não precisa de token do GitHub. O instalador abre dentro do `tmux`: se a conexão cair, entre de novo e rode `tmux attach -t zeus`.

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
