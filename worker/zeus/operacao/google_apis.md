# Operação — Google APIs (Contacts/Drive/Gmail/Calendar/Sheets)

Lazy-load. Carregue quando o pedido envolver: Drive (subir/buscar/compartilhar arquivo), Gmail (ler/enviar/draft), Calendar (eventos/reuniões), Sheets (ler/escrever planilha), Contacts.

OAuth client em `app_settings.google_oauth_client_id` / `google_oauth_client_secret`. Tokens por conta em `google_oauth_tokens` (provider='google', user_key=email). Refresh automático. Helper: `scripts/google.sh`.

**Conexão de novas contas:** abrir `https://google.jefersonhenrike.com` → "Conectar". OAuth: `/oauth/start` → `/oauth/callback`.

## Comandos

```bash
scripts/google.sh accounts                                                       # contas conectadas
scripts/google.sh contacts <user_key> [query]                                    # busca/lista contatos
scripts/google.sh gmail-list <user_key> [q]                                      # threads recentes
scripts/google.sh gmail-send <user_key> <to> <subject> <body> [attachment_path]  # envia email
scripts/google.sh gmail-draft <user_key> <to> <subject> <body>                   # salva draft
scripts/google.sh drive-list <user_key> [q]                                      # arquivos Drive
scripts/google.sh drive-upload <user_key> <file_path> [folder_id] [mime]         # sobe arquivo
scripts/google.sh drive-folder <user_key> <name> [parent_id]                     # cria pasta
scripts/google.sh drive-share <user_key> <file_id> [role] [type] [email]         # compartilha
scripts/google.sh calendar-list <user_key>                                       # próximos 10 eventos
scripts/google.sh calendar-create <user_key> <summary> <start_iso> <end_iso> [desc]
scripts/google.sh sheets-get <user_key> <sheet_id> <range>                       # lê planilha
scripts/google.sh sheets-append <user_key> <sheet_id> <range> <json_values>      # append linhas
scripts/google.sh raw <user_key> <METHOD> <url> [body]                           # chamada crua
scripts/google.sh token <user_key>                                               # imprime access_token
```

## Drive-first storage (default)

Todo arquivo gerado pelo Zeus deve subir no Drive em vez de salvar local.

ID da pasta padrão: `app_settings.jeff_google_drive_default_folder` (atual: `1hXSBUiNBlkbF3TFyFJ1zZRxL92bXX2EU` → pasta "Zeus" na raiz do Drive do Jeff).

Fluxo: `drive-upload <user_key> /tmp/arquivo.pdf <folder_id_do_app_settings>` → pega `webViewLink` da resposta → devolve link pro Jeff.

## Conta principal e scopes

Conta principal: `jefersonhenrike1@gmail.com` (todos os 5 services).

Scopes ativos: `contacts`, `contacts.readonly`, `drive`, `gmail.modify`, `calendar`, `spreadsheets`, `userinfo.profile`, `userinfo.email`, `openid`.

## Postura

- Jeff pergunta "que reuniões tenho?" → `calendar-list` direto (sem pedir info).
- Pede contato → `contacts <user_key> "Nome"` (devolve telefone/email).
- Arquivo novo → **default Drive-first** (cria no Drive, compartilha link).

## Roadmap (não construído)
- Wiring automático no agent-runner pra que tudo gerado vire Drive-link.
- Scope `contacts.other.readonly` pra contatos sugeridos do Gmail.
