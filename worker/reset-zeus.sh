#!/bin/bash
# reset-zeus.sh — limpa lastro da era Diretor/Lucas, mantém inteligência do Zeus
set -e

MEM=/root/.claude/projects/-opt-labastia-whatsapp-worker/memory
DB=/opt/labastia/whatsapp-worker/data/worker.db

echo ""
echo "=========================================="
echo "  ZEUS — RESET ERA LABASTIE/LUCAS"
echo "=========================================="
echo ""

# ─── ETAPA 1: BACKUP DO BANCO ───────────────────────────────────────────────
echo "ETAPA 1/6 — Backup do banco"
BACKUP="$DB.backup-$(date +%Y%m%d-%H%M%S)"
cp "$DB" "$BACKUP"
echo "  OK: $BACKUP"
echo ""

# ─── ETAPA 2: MEMORIAS DO LUCAS/OUTLIER/DIRETOR ─────────────────────────────
echo "ETAPA 2/6 — Apagando memorias da era Lucas/Outlier/Diretor"
FILES=(
  user_lucas_profile.md
  project_lucas_coaching_nichos.md
  project_lucas_holding.md
  project_lucas_roadmap.md
  project_outlier_coach_playbook.md
  project_outlier_lembretes.md
  project_mentoria_outlier_product.md
  project_pqv_campaign.md
  project_pqv_6_tipos_compradores.md
  project_pqv_15_perguntas_sim.md
  project_sales_method_sessao_zero.md
  project_sdr_mayara_playbook.md
  project_diretor_relacionamento_livros.md
  project_central_storydoing.md
  project_storydoing_operacao.md
  project_carta_credito_alavancagem.md
  project_comprovantes_unificado.md
  project_ig_publication_schedule.md
  project_agente_smith_editor.md
  project_secretaria_executiva.md
  project_active_followups.md
  reference_cnpj_pix_silcoaching.md
  reference_google_reviews.md
  feedback_lucas_greetings.md
  feedback_lucas_referral_links.md
  feedback_outlier_agendamento_1x1.md
  feedback_outlier_atendimento_mentor.md
  feedback_outlier_first_contact.md
  feedback_outlier_vitimistas.md
  feedback_naming_diretor_lucas.md
  feedback_worker_lucas_pairing.md
  feedback_seo_aeo_postura.md
  feedback_abertura_natural_pnl.md
  "feedback_short_action_over_explanation.md.tmp"
)
COUNT=0
for F in "${FILES[@]}"; do
  if [ -f "$MEM/$F" ]; then
    rm "$MEM/$F"
    echo "  removido: $F"
    ((COUNT++)) || true
  fi
done
echo "  OK: $COUNT arquivos removidos"
echo ""

# ─── ETAPA 3: ATUALIZAR INDICE DE MEMORIAS (MEMORY.md) ──────────────────────
echo "ETAPA 3/6 — Atualizando indice MEMORY.md"
KEYWORDS=(
  "lucas_profile" "lucas_coaching" "lucas_holding" "lucas_roadmap"
  "outlier_coach" "outlier_lembretes" "mentoria_outlier"
  "pqv_campaign" "pqv_6_tipos" "pqv_15_perguntas"
  "sales_method_sessao" "sdr_mayara" "diretor_relacionamento"
  "central_storydoing" "storydoing_operacao" "carta_credito"
  "comprovantes_unificado" "ig_publication" "agente_smith"
  "secretaria_executiva" "active_followups"
  "cnpj_pix_silcoaching" "google_reviews"
  "lucas_greetings" "lucas_referral" "outlier_agendamento"
  "outlier_atendimento" "outlier_first_contact" "outlier_vitimistas"
  "naming_diretor" "worker_lucas_pairing" "seo_aeo_postura"
  "abertura_natural_pnl" "short_action_over_explanation.md.tmp"
)
for KW in "${KEYWORDS[@]}"; do
  sed -i "/$KW/d" "$MEM/MEMORY.md" 2>/dev/null || true
done
echo "  OK: entradas obsoletas removidas do indice"
echo ""

# ─── ETAPA 4: BACKUP DO CLAUDE.md ANTIGO ────────────────────────────────────
echo "ETAPA 4/6 — Apagando backup do CLAUDE.md do Diretor"
OLD_CLAUDE=/opt/labastia/whatsapp-worker/docs/CLAUDE.md.backup-2026-05-07
if [ -f "$OLD_CLAUDE" ]; then
  rm "$OLD_CLAUDE"
  echo "  OK: $OLD_CLAUDE removido"
else
  echo "  OK: arquivo ja nao existe"
fi
echo ""

# ─── ETAPA 5: CONTACT_ALIASES (REVISAO SEM APAGAR) ──────────────────────────
echo "ETAPA 5/6 — Contatos no banco (apenas revisao — nada apagado)"
echo ""
echo "  Copie essa lista e me manda no WhatsApp quais quer apagar:"
echo ""
sqlite3 "$DB" \
  "SELECT printf('  %-30s | %s', name, phone) FROM contact_aliases ORDER BY name;"
echo ""
echo "  (Nenhum contato foi apagado — aguardando sua aprovacao)"
echo ""

# ─── ETAPA 6: RENOMEAR PASTA RAIZ ───────────────────────────────────────────
echo "ETAPA 6/6 — Renomear /opt/labastia/ → /opt/jeff-apps/"
echo ""
echo "  Esta etapa requer atencao. NAO e executada automaticamente."
echo ""
echo "  Quando quiser fazer, me chama no WhatsApp que te guio passo a passo."
echo "  O que envolve:"
echo "    1. pm2 stop all"
echo "    2. mv /opt/labastia/whatsapp-worker /opt/jeff-apps/whatsapp-worker"
echo "    3. Atualizar caminhos em .env, pm2 ecosystem, nginx e scripts"
echo "    4. pm2 start + verificar health"
echo ""

# ─── RESUMO FINAL ────────────────────────────────────────────────────────────
echo "=========================================="
echo "  RESUMO"
echo "=========================================="
echo "  [OK] Backup do banco:    $BACKUP"
echo "  [OK] Memorias limpas:    $COUNT arquivos apagados"
echo "  [OK] MEMORY.md:          indice atualizado"
echo "  [OK] Backup CLAUDE.md:   removido"
echo "  [->] Contact aliases:    aguardando aprovacao"
echo "  [--] Meta Ads:           mantido (Jeff gerencia campanhas do Lucas)"
echo "  [->] Renomear pasta:     pendente — me chama no WhatsApp"
echo "=========================================="
echo ""
