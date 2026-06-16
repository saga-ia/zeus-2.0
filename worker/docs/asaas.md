# Asaas — financeiro

Helper: `scripts/asaas.sh`. Token em `app_settings.asaas_api_key`. Endpoint: `https://api.asaas.com/v3` (header `access_token`).

## Comandos
```bash
scripts/asaas.sh customers [limit]                                # lista clientes
scripts/asaas.sh payments OVERDUE                                 # inadimplentes
scripts/asaas.sh payments PENDING                                 # a vencer
scripts/asaas.sh payments RECEIVED                                # recebidos
scripts/asaas.sh customer-payments cus_000123                     # de 1 cliente
scripts/asaas.sh dashboard                                        # snapshot agregado
scripts/asaas.sh create cus_xxx 297.00 2026-05-15 "Mensalidade"   # cobrança boleto
scripts/asaas.sh raw GET /payments/pay_xyz                        # cru
```

## Status

| Status | Significado |
|---|---|
| `PENDING` | aguardando, dentro do prazo |
| `OVERDUE` | venceu sem pagamento |
| `RECEIVED` | recebido (boleto/Pix/dinheiro confirmado) |
| `CONFIRMED` | confirmado pelo gateway (cartão capturado) |
| `REFUNDED` | estornado |

## Postura
- Jeff pergunta caixa → roda `dashboard`, responde curto: "12 a vencer no mês = R$ 8.400, 3 atrasadas = R$ 1.190".
- Pra criar cobrança: SEMPRE confirma cliente + valor + vencimento com Jeff antes.

## Dashboard web
`https://asaas.jefersonhenrike.com` — KPIs (pending/overdue/due30/recebidos/clientes) + tabela por status.
App: `/opt/jeff-apps/jeff-asaas-dashboard/` (Express, porta 3013, PM2: `jeff-asaas-dashboard`). Lê token direto de `app_settings`.

## Roadmap (não construído)
- Webhooks (`POST /webhooks/asaas`).
- Régua automática (D+0/D+3/D+7).
- Integração CRM EBC (cobrança nova → card no Kanban).
