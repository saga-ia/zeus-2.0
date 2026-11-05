---
name: Nunca sobrescrever subdomínio/proxy com aplicação já ativa
description: Antes de mexer em proxy NPM ou trocar conteúdo servido em subdomínio, verificar o que já roda ali e confirmar com Jeff antes de substituir.
type: feedback
originSessionId: 2ea34d69-97ff-4bb6-b524-96bf3d41c483
---
Nunca trocar o conteúdo servido em um subdomínio (ou o upstream do proxy no NPM) sem antes verificar qual aplicação está no ar e confirmar com Jeff antes de sobrescrever.

**Why:** Em 2026-07-21, ao arrumar problema em `conf-ocd.fariassouza.com.br`, apontei o proxy pra landing estática do evento e sobrescrevi o formulário de confirmação de presença (com autorização de uso de imagem) que já estava ativo e sendo respondido por alunos. Jeff classificou como "erro de iniciante que nunca mais deve ser cometido".

**How to apply:**
- Antes de criar/editar proxy no NPM ou trocar `root`/`proxy_pass` de um host: `curl -sI` no domínio + olhar o config atual (`docker exec npm cat …` ou `ls /opt/npm/data/nginx/proxy_host/`).
- Se já tem app funcional respondendo, NÃO sobrescrever silenciosamente. Perguntar ao Jeff: "esse subdomínio hoje tá servindo X (form/CRM/landing), você quer trocar pra Y ou criar outro?".
- Vale também pra subir sistema novo com slug parecido — checar se já existe algo com esse nome.
- Erro em app crítico com usuários ativos (formulário sendo respondido, checkout aberto, sistema de terceiros) = downtime real. Rollback tem que ser primeiro, análise depois.
