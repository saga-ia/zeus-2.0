# ZapSign — assinatura digital

Helper: `scripts/zapsign.sh`. Token em `app_settings.zapsign_api_token`. Endpoint: `https://api.zapsign.com.br/api/v1` (header `Authorization: Bearer <token>`).

## Comandos
```bash
scripts/zapsign.sh docs [page]                    # lista documentos
scripts/zapsign.sh doc <doc_token>                # detalhe (signers, urls, status)
scripts/zapsign.sh templates
scripts/zapsign.sh signers <doc_token>
scripts/zapsign.sh events [limit]                 # últimos eventos webhook (worker.db)
scripts/zapsign.sh raw GET /docs/?status=pending  # cru
```

## Webhook receiver
- URL: `POST https://zapsign.jefersonhenrike.com/webhook`
- App: `/opt/jeff-apps/jeff-zapsign-webhook/` (Express, porta 3014, PM2: `jeff-zapsign-webhook`).
- Persiste em `zapsign_events`, ack 200. URL configurada manualmente no painel ZapSign pelo Jeff.
- Painel de eventos: `https://zapsign.jefersonhenrike.com` (lista 100 últimos, atualiza 30s).

## Tabela `zapsign_events` (worker.db)

| coluna | conteúdo |
|---|---|
| `event` | `doc.signed`, `doc.refused`, `signer.signed`, etc. |
| `doc_id` | ID/token do documento |
| `doc_token` | token alternativo |
| `signer_email` | email de quem assinou |
| `status` | `signed` / `pending` / `refused` |
| `raw_json` | payload bruto inteiro |
| `received_at` | UTC |
| `crm_matched_lead_id` | lead casado no CRM EBC (trace) |

## Integração CRM EBC (ativa)
Webhook recebe `doc_signed` / `doc.signed` / `doc_finalized` → casa signatários com `leads` por **telefone** (normalizado, com/sem 55) ou **email**. Se casar e lead não estiver em `fechado`/`perdido` → `status='fechado'` + grava em `lead_events` (event `contract_signed`, payload com `doc_id`, `doc_token`, `matched_by`, `signer`, `previous_status`).

CRM DB: `/opt/jeff-apps/jeff-ebc-crm/data/crm.db`.

## Postura
- "Tem contrato pendente?" → `docs` filtra `status=pending`.
- "Quem assinou X?" → `signers <token>`.

## Roadmap
- Disparo automático WhatsApp pro signatário em `doc.created` (link de assinatura).
- Confirmação em `doc.signed` ("recebemos seu contrato, obrigado").
