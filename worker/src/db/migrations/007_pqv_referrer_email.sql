-- Adiciona coluna pra guardar email do participante (referrer) do PQV.
-- Lucas pediu em 2026-04-21 pra capturar email junto com nome/sobrenome
-- do participante pra tracking/CRM posterior.

ALTER TABLE pqv_referrals ADD COLUMN referrer_email TEXT;

-- Atualiza o label da campanha pra refletir a turma específica.
UPDATE app_settings SET value = 'PQV — turma 20-21 de abril 2026', updated_at = datetime('now')
  WHERE key = 'pqv_campaign_label';
