# Active Processes — 16/06/2026

Snapshot de tudo que estava rodando no momento do commit.

## PM2 (24 processos online)

### Worker core
| Nome | Função |
|---|---|
| `whatsapp-worker` | servidor principal do Zeus (Express + WhatsApp Web client + agente IA + rotas API) |
| `agent-runner` | daemon que escuta mensagens novas e dispara o agente IA (Claude Opus) |
| `farias-monitor` | monitor dedicado ao projeto Farias Souza (mensagens, alertas) |

### CRM e Área do Cliente
| Nome | Função |
|---|---|
| `jeff-cigc-crm` | CRM principal do CIGC (gestão de leads, pipeline comercial) |
| `jeff-cigc-clientarea` | painel do cliente CIGC pós-compra |
| `jeff-alpha-clientes` | área de membros da Alpha Digital (onboarding clientes nova agência) |
| `jeff-farias-clientarea` | área do cliente Farias Souza |
| `jeff-onboarding` | fluxo de onboarding (formulário + cadastro inicial) |

### Forms e Captação
| Nome | Função |
|---|---|
| `jeff-cigc-forms` | formulários de captura do CIGC |
| `jeff-farias-forms` | formulários do Farias Souza |
| `jeff-cigc-congresso` | inscrição do IV Congresso CIGC |

### Comercial / Disparo
| Nome | Função |
|---|---|
| `jeff-cigc-comercial` | painel/automação comercial CIGC |
| `jeff-disparador` | disparador de mensagens em massa (lotes via WhatsApp) |

### Webhooks
| Nome | Função |
|---|---|
| `jeff-clickup-webhook` | recebe eventos do ClickUp (tarefas criadas/atualizadas) |
| `jeff-zapsign-webhook` | recebe eventos ZapSign (contratos assinados) → tabela `zapsign_events` |
| `jeff-instagram-webhook` | recebe webhooks Graph API do Instagram (@jeffhenrike) |

### Dashboards e Monitoramento
| Nome | Função |
|---|---|
| `jeff-meta-dashboard` | dashboard Meta Ads (campanhas Facebook/Instagram) |
| `jeff-ads-dashboard` | dashboard consolidado de ads (multi-plataforma) |
| `jeff-asaas-dashboard` | dashboard financeiro Asaas |
| `jeff-vps-monitor` | monitor de saúde do servidor (CPU/RAM/disco) |

### Plataforma e Integrações
| Nome | Função |
|---|---|
| `jeff-sistemas` | hub central de sistemas/admin |
| `jeff-google-oauth` | painel OAuth Google (Contacts/Drive/Gmail/Calendar/Sheets) |
| `zeus-contacts` | gestão de contatos do Zeus |
| `zeus-platform` | plataforma Zeus (front interno) |

### Apps presentes na pasta mas inativos no PM2 (7)
| Nome | Estado |
|---|---|
| `agencia-orquestrador` | inativo — orquestrador de agentes (em desenvolvimento) |
| `aula-agente` | inativo — projeto pendente de deploy (gatilho "ativar" do Jeff) |
| `ebc-campaign-2026-05-03` | inativo — campanha pontual (ebook EBC) |
| `jeff-agente-smith` | inativo — agente Smith (engenharia/segurança) |
| `jeff-ebc-crm` | inativo — CRM EBC (descontinuado?) |
| `jeff-financeiro` | inativo — painel financeiro consolidado |
| `jeff-wpp-mirror` | inativo — espelho/mirror WhatsApp |

## Cron jobs (12 ativos)

| Schedule | Script | Função |
|---|---|---|
| `*/5 * * * *` | `ig-comment-poller.sh` | poller de comentários novos no Instagram (auto-DM) |
| `*/5 * * * *` | `clickup-sync.py` | sincroniza ClickUp ↔ banco local |
| `*/5 * * * *` | `cigc-crm-health.sh` | healthcheck do CRM CIGC |
| `*/2 * * * *` | `clickup-asaas-bridge.py` | bridge ClickUp ↔ Asaas (cobrança automática) |
| `0 1 * * *` | `board-campaign-schedule.sh pause` | pausa campanhas Board Academy 1h BRT |
| `0 3 * * *` | `/opt/zeus-backup/backup.sh` | backup diário cifrado pro Google Drive |
| `0 8 * * *` | `board-campaign-schedule.sh activate` | ativa campanhas Board Academy 8h BRT |
| `0 8 * * 0` | `backup-zeus-to-drive.sh` | backup semanal Zeus → Drive (domingo) |
| `0 9 * * *` | `asaas-dunning.sh` | régua de cobrança Asaas (inadimplentes) |
| `0 10 * * *` | `morning-brief.sh` | briefing matinal no WhatsApp |
| `0 12 * * *` | `daily-chase.sh` | chase diário (follow-up leads) |
| `0 11,14,17,21 * * *` | `clickup-cobranca.py` | cobrança ClickUp 4x/dia (11h/14h/17h/21h BRT) WhatsApp Jeff+Vinicius |

## Docker (labastia-setup)

| Container | Função |
|---|---|
| `labastia-setup-nginx-proxy-manager-1` | Nginx Proxy Manager (SSL Let's Encrypt + roteamento) |
| `labastia-setup-postgres-1` | Postgres do n8n |
| `labastia-setup-redis-1` | Redis (cache/queue) |
| `labastia-setup-n8n-1` | n8n (automações visuais) |
| `labastia-setup-evolution-1` | Evolution API (WhatsApp alternativo, paralelo ao Zeus) |
| `jeff-sites-nginx` | nginx que serve `/opt/jeff-sites` |

## Sites estáticos servidos (11)

`alpha`, `carrossel`, `cigc`, `cigc-capture`, `deniseapresentacao`, `ebc-ebook1`, `ebc-ebook2`, `farias-souza`, `proximo-ciclo`, `teste`, `treinamento-claude`
