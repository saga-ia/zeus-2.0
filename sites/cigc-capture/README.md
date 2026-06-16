# CIGC 2026 - Landing de Captura de Leads

## Status
✓ Desenvolvida e rodando em localhost:3003

## Funcionalidades
- Formulário de captura com 7 campos (nome, email, telefone, cidade, clínica, instagram, interesse)
- Design premium e responsivo (mobile-ready)
- Integração com Meta Pixel (aguardando ID)
- Notificação automática ao Gustavo via WhatsApp
- Banco de dados SQLite (/opt/jeff-worker/data/worker.db)

## Próximos passos
1. **Meta Pixel ID** — inserir o ID real do pixel CIGC
2. **Subdomain** — criar cigc-leads.jefersonhenrike.com (ou escolher outro)
3. **Deployment** — subir via Cloudflare + PM2
4. **Tests** — validar fluxo completo (form → WhatsApp → banco)

## Endpoints
- **GET /** — Página de captura
- **POST /api/leads** — Recebe novo lead (JSON)
- **GET /api/leads** — Lista todos os leads (admin)

## Estrutura de banco
```sql
CREATE TABLE cigc_leads (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    city TEXT,
    clinic TEXT,
    instagram TEXT,
    interest TEXT,
    created_at TEXT,
    notified INTEGER
)
```

## Servidor
- Porta: 3003
- Dependências: Node.js 16+, npm, sqlite3
- Iniciar: `npm start` ou `node server.js`
