# Instalador ZEUS no servidor do cliente

Copia o Zeus 2.0 inteiro (worker, todos os apps, sites, agentes e skills) pra VPS do cliente, troca o domínio, gera chaves novas e deixa tudo no ar com HTTPS.

## Antes da chamada

1. **VPS do cliente**: Debian 12 (recomendado) ou Ubuntu 22/24, mínimo 4 vCPU e 8 GB, acesso root por SSH.
2. **DNS do domínio do cliente**: um registro **A curinga** `*` apontando pro IP da VPS. Se o painel não aceitar curinga, crie um A por subdomínio. A lista está em `instalador/modelos/hosts.tsv`, e o principal é `central`.
3. **Token do GitHub** só de leitura e só deste repo: GitHub > Settings > Developer settings > Fine-grained tokens, repositório `saga-ia/zeus-2.0`, permissão *Contents: Read*, validade de 7 dias.

## Na VPS do cliente (como root)

```bash
read -rsp "Token GitHub: " T; echo
git clone https://x-access-token:$T@github.com/saga-ia/zeus-2.0.git /opt/zeus-2.0; unset T
bash /opt/zeus-2.0/instalador/instalar.sh
```

O instalador pergunta: domínio, nome da empresa, nome do dono, WhatsApp do dono, e-mail e senha de acesso. Depois roda sozinho, em 20 a 40 minutos.

Se parar no meio ou o DNS ainda não tiver propagado, **é só rodar de novo**: o que já está pronto é pulado. Pra refazer uma etapa: `--refazer <etapa>`. Pra mudar as respostas: `--respostas`.

## O que ele faz

| Etapa | O quê |
|---|---|
| sistema | pacotes, Chromium, swap se tiver pouca memória |
| docker / node | Docker, Node 20.20.2 via nvm (mesmo caminho do servidor original), PM2, Claude Code |
| codigo | copia o repo pro layout `/opt/jeff-*`, igual ao servidor original |
| claude | agentes e skills do Claude Code em `/root/.claude` (sem memórias) |
| personalizar | troca o domínio, gera chaves internas novas (apps que dividem chave continuam se entendendo), escreve os `.env`, marca o cliente como dono no CLAUDE.md |
| dependencias | `npm ci` em cada app e pacotes Python |
| containers | Nginx Proxy Manager, Postgres, Redis, n8n, Evolution, Omniroute, Presenton, MoneyPrinter |
| firewall | só SSH, 80 e 443 abertos pra fora; painel do proxy só por túnel SSH |
| pm2 | sobe os processos que estão online em produção |
| central | cria o dono como proprietário da Central |
| proxy | cria os subdomínios e um certificado SSL único |
| crontab | instala o crontab de produção |

No fim ele mostra os acessos, que ficam salvos em `/root/zeus-acessos.txt` (só root lê).

## Na chamada com o cliente

1. `claude` na VPS e depois `/login` com a conta do cliente (assinatura dele).
2. `https://sagazeus.<dominio>`: entrar e ler o QR com o celular do número do Zeus.
3. Colar as chaves do formulário de instalação (OpenAI, Gemini, Groq, ElevenLabs, Meta).

## Quem manda

O dono informado no instalador tem autorização total. Jeferson e Vinicius ficam na whitelist como suporte técnico e recebem os alertas de saúde.

## Manutenção (no servidor do Jeff)

`docs/atualizar-snapshot.sh --push` atualiza o repo e os modelos do instalador (`gerar-modelos.sh`). Os modelos não guardam nenhum valor secreto, só os nomes das chaves e placeholders.
