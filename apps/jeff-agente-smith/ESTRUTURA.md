┌─────────────────────────────────────────────────────────┐
│  AGENTE SMITH — EDIÇÃO DE VÍDEOS VIRAIS                 │
│  Status: pausado, aguardando retomada                   │
│  Última decisão (Jeff, 2026-05-06):                     │
│  Trocar stack SaaS (Opus/Submagic/Captions/Eddie/Descript) │
│  → CapCut OU Adobe Premier                              │
└─────────────────────────────────────────────────────────┘

# NOME
Agente Smith.

# MISSÃO
Pegar vídeos longos do Jeff (palestras, lives, podcasts, gravações
internas) → cortar trechos com hook forte → legendar automático
estilo viral → exportar 9:16 → publicar como Reel/Short/TikTok.

# DECISÃO ATUAL DE STACK
- NÃO usar mais: Opus.pro, Submagic, Captions, Eddie AI, Descript.
- Usar: CapCut ou Adobe Premier (Jeff vai conversar com ZEUS noutro
  momento sobre qual dos dois e como integrar).

# CRITÉRIOS QUE A STACK PRECISA ATENDER
1. Qualidade do corte automático (detectar hook, frase de impacto).
2. Legenda animada estilo viral (palavra-em-destaque, ritmo).
3. Exportação 9:16 nativa (Reels/Shorts/TikTok).
4. Automação acessível (API/CLI/template) ou pipeline humano enxuto.
5. Custo controlado.
6. Aceitação no Meta sem flag de IA.

# ARQUITETURA PRETENDIDA
- Smith roda como cron diário no worker principal (2 vídeos/dia
  como meta inicial).
- Input: Drive watch folder com vídeos longos do Jeff.
- Output: /Smith/Output/<data>/ no Drive (cortes prontos).
- Notificação: WhatsApp pro Jeff + forward pra lista de 15 contatos
  (lista pendente do Jeff).
- KPI: views por vídeo + custo por 1k views.

# PRÓXIMOS PASSOS QUANDO RETOMAR
1. Jeff define: CapCut ou Premier.
2. Mapear como automatizar (CapCut tem API limitada; Premier roda
   via ExtendScript/UXP, melhor pra batch local).
3. Pegar 1 vídeo longo do Jeff como benchmark.
4. Rodar pipeline manual primeiro, validar qualidade dos cortes.
5. Automatizar etapa por etapa (download Drive → corte → legenda
   → export → upload).
6. Conectar publicação (Instagram Graph API + YouTube Shorts API).

# OBSERVAÇÕES
- Jeff pediu (2026-05-06) pra guardar essa estrutura nessa pasta
  pra dar sequência depois. NÃO está em execução agora.
- Quando Jeff falar "vamos retomar o Smith", abrir esse arquivo,
  confirmar stack (CapCut vs Premier) e seguir do passo 2.
