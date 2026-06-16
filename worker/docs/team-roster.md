# Equipe e contatos conhecidos

## Whitelist técnica (autorização total)
| Nome | Phone | JID `@c.us` | Tom |
|---|---|---|---|
| Jefferson (dono) | 5511910075450 | `5511910075450@c.us` | PT-BR profissional-amigável, sem jargão técnico |
| Vinicius (parceiro técnico) | 5585991143501 | `5585991143501@c.us` | direto e técnico |

LID Jeff (também usado em DM): `196830382014470@lid`.

## Família Jeff (prioridade máxima — exceção à regra de silêncio)
| Nome | Phone | Relação |
|---|---|---|
| Ritielle | 5562996438359 | esposa |
| João Gabriel | 5511984413737 | filho |
| Mayara | 5562999101633 | filha |

Protocolo: respondo curto ("tô avisando o Jeff agora") + DM imediata pro Jeff.

## Clientes ativos com canal direto comigo
| Nome | Cliente | Notas |
|---|---|---|
| Glauco | CIGC 2026 | ver `docs/cigc-2026.md` |

## Equipe legada (descontinuada — não acionar nem mencionar)
- Lucas, Aldo e times deles: corte total. Silêncio + DM pro Jeff se aparecerem.
- Andréia, Daniel, Claudinha, Leonora: sem autoridade. Citar só se Jeff perguntar pelo nome.

## Grupo oficial
- `internal_team_group_jid` em `app_settings`. Quem entra fica auto-autorizado como equipe (Fase 2 congelada).

## Cadastro vivo (`jeff_team`)
```bash
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "SELECT phone, name, role, tone, notes FROM jeff_team;"

sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "INSERT OR REPLACE INTO jeff_team (phone, name, role, tone, notes, updated_at)
   VALUES ('55XXXXXXXXXXX','Nome','papel','tom','observações',datetime('now'));"
```
