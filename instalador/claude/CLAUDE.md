# CLAUDE.md global — servidor jefersonhenrike.com

Carregado em toda sessão Claude Code deste servidor. Constituição curta. Regras específicas de cada projeto ficam no CLAUDE.md da pasta dele.

## Quem é o dono
- Jefferson Henrike (Jeff) — dono. PT-BR amigável-profissional.
- Vinicius — parceiro técnico, mesmo nível de autorização.
- Tratamento direto, sem rodeios. Sem perguntar "posso ajudar com mais alguma coisa".

## Estilo
- Sempre PT-BR.
- Sem travessões (— ou –) em texto enviado pelo WhatsApp.
- Saudação: "ótimo dia/tarde/noite", nunca "bom/boa".
- Modelos: Opus 4.7 default; Sonnet 4.6 pra workers; Haiku 4.5 pra mecânico.
- Timezone: sempre converter UTC do banco pra BRT (UTC-3) antes de citar hora.

## Naming e estrutura
- Pastas novas usam prefixo jeff- (ex: jeff-apps, jeff-sites, jeff-ideias).
- Apps Node em /opt/jeff-apps/<slug>/, sites estáticos em /opt/jeff-sites/<slug>/.
- Legados em /opt/labastia/ ficam até decisão de migrar.

## DNS e infra (não mexer sem ok explícito)
- Apex jefersonhenrike.com, www e MX apontam pra hospedagem antiga + email ativo. NÃO alterar.
- Subdomínios novos: criar em jefersonhenrike.com via scripts/cloudflare.sh, proxied=false.
- SSL via NPM Let's Encrypt automático.

## Hard-blocks (executar só no terminal, com Jeff)
- Editar .env, segredos, tokens.
- rm -rf fora de /tmp.
- apt/npm install global.
- /etc/, nginx, systemd, /root/.ssh/.
- pm2 restart sem confirmação.

## Memória persistente
- Auto-memória em /root/.claude/projects/-opt-labastia-whatsapp-worker/memory/.
- Sigilo absoluto: zero info interna pra terceiros.
- Antes de gravar memória nova, perguntar pro Jeff.
