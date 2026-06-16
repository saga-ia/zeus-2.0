# Meta Ads — gestão de campanhas

Helper: `scripts/meta-ads.sh`. Token salvo em `app_settings` (`jeff_meta_user_token` primário, 9 contas; `jeff_meta_system_token` fallback, 1 conta).

## Contas (9)

| account_id | nome | BM |
|---|---|---|
| 1497376450838041 | METODO RECOMEÇO | Metodo API |
| 899061818255857 | Jeferson Santos | (pessoal) |
| 417275072185928 | Fernando Seabra - CA 01 | Fernando Seabra |
| 736349936838232 | Fernando Seabra - CA 02 | Fernando Seabra |
| 518864424106548 | ze comercio | zecomercio |
| 9436918016336954 | Lancamentos | Lancamentos |
| 1411872099799974 | dnaempreendedor | dnaempreendedor |
| 1163083102221800 | CA2 - LABASTIE 2025 | Lucas Labastie |
| 1289500712654032 | YF-02-Agency-Brazil | Bluefocus (BM da EBC) |
| 591739264281958 | CA - CIGC | Congresso CIGC (1053781491439560) |
| 1180414197299732 | Marketing & Branding - Board Academy | BM - Board Academy (2935751139800401) |

## Comandos
```bash
scripts/meta-ads.sh accounts                              # listar contas
scripts/meta-ads.sh campaigns <account_id>
scripts/meta-ads.sh insights <account_id> last_7d         # date_preset: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month, maximum
scripts/meta-ads.sh insights-campaign <campaign_id> last_30d
scripts/meta-ads.sh adsets <campaign_id>
scripts/meta-ads.sh ads <adset_id>
scripts/meta-ads.sh raw <path> "<query>"                  # GET cru
```

## Regras
- **Mutations (criar/pausar/editar/budget): SEMPRE confirmar com Jeff antes.** Helper só faz GET por padrão; pra POST/DELETE use `raw` com `method=POST` ou curl direto.
- **Métrica principal CTWA = conversas iniciadas**, não cliques. Cliques só sob pedido específico.
- Resumo curto pro Jeff em PT-BR sem jargão: "spend": R$X. "actions": destacar só o que importa (link_click, lead, purchase, conversation_started).
- User token expira em ~60d — quando der erro de auth, peço Jeff regerar via Graph API Explorer.
- BM da EBC é BM9 (account 1289500712654032) — não alterar nome no painel.

## Exemplos
- *"Quanto gastei no Recomeço esse mês?"* → `insights 1497376450838041 this_month`, reporto `spend`.
- *"Lista campanhas ativas"* → `campaigns <id>` + filtro `status=ACTIVE`.
- *"Pausa a ENG-NOVA-ERA"* → confirma com Jeff → `raw <campaign_id> "method=POST&status=PAUSED"`.
