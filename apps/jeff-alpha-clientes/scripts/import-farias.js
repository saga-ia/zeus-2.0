'use strict';
const path = require('path');
const Database = require('better-sqlite3');

const SRC = '/opt/jeff-apps/jeff-onboarding/data/onboarding.db';
const DST = path.join(__dirname, '..', 'data', 'clientes.db');
const SRC_SESSION = 'ea2eb4267c434b32';
const SLUG = 'farias';

const src = new Database(SRC, { readonly: true });
const dst = new Database(DST);
dst.pragma('foreign_keys = ON');

const client = dst.prepare("SELECT id FROM clients WHERE onboarding_slug = ?").get(SLUG);
if (!client) { console.error('cliente farias nao encontrado em clients'); process.exit(1); }

const srcSession = src.prepare('SELECT * FROM sessions WHERE id = ?').get(SRC_SESSION);
if (!srcSession) { console.error('sessao origem nao encontrada'); process.exit(1); }

const lastResponseAt = src.prepare("SELECT MAX(created_at) as t FROM responses WHERE session_id = ?").get(SRC_SESSION).t;
const completedAt = srcSession.completed_at || lastResponseAt;

const exists = dst.prepare('SELECT id FROM form_sessions WHERE id = ?').get(SRC_SESSION);
if (exists) {
  console.log('sessao ja existe, removendo respostas antigas pra reimportar');
  dst.prepare('DELETE FROM form_responses WHERE session_id = ?').run(SRC_SESSION);
  dst.prepare("UPDATE form_sessions SET slug = ?, client_id = ?, started_at = ?, completed_at = ?, last_section = ?, photo_path = ? WHERE id = ?")
    .run(SLUG, client.id, srcSession.started_at, completedAt, srcSession.last_section || 0, srcSession.photo_path, SRC_SESSION);
} else {
  // se já tem outra session com slug=farias, derruba ela primeiro
  dst.prepare('DELETE FROM form_sessions WHERE slug = ?').run(SLUG);
  dst.prepare(`INSERT INTO form_sessions (id, slug, client_id, started_at, completed_at, last_section, photo_path, user_agent, ip)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(SRC_SESSION, SLUG, client.id, srcSession.started_at, completedAt, srcSession.last_section || 0, srcSession.photo_path, srcSession.user_agent || '', srcSession.ip || '');
}

dst.prepare('UPDATE clients SET onboarding_session_id = ? WHERE id = ?').run(SRC_SESSION, client.id);

const sectionByKey = new Map();
const secs = dst.prepare('SELECT id, ordem FROM form_sections ORDER BY ordem').all();
const qStmt = dst.prepare('SELECT qkey, ordem FROM form_questions WHERE section_id = ?');
for (const s of secs) for (const q of qStmt.all(s.id)) sectionByKey.set(q.qkey, s.ordem);

const rows = src.prepare(`
  SELECT r.section, r.question_key, r.question_label, r.value, r.version, r.created_at
  FROM responses r
  JOIN (SELECT question_key, MAX(version) AS v FROM responses WHERE session_id = ? GROUP BY question_key) m
    ON m.question_key = r.question_key AND m.v = r.version
  WHERE r.session_id = ?
`).all(SRC_SESSION, SRC_SESSION);

const ins = dst.prepare(`INSERT INTO form_responses (session_id, section, question_key, question_label, value, version, created_at)
                          VALUES (?, ?, ?, ?, ?, 1, ?)`);
const tx = dst.transaction((items) => {
  for (const r of items) {
    const sec = sectionByKey.get(r.question_key) || r.section || 0;
    ins.run(SRC_SESSION, sec, r.question_key, r.question_label, r.value || '', r.created_at);
  }
});
tx(rows);

const nome = (rows.find(r => r.question_key === 'nome') || {}).value;
const tel = (rows.find(r => r.question_key === 'telefone') || {}).value;
const email = (rows.find(r => r.question_key === 'email') || {}).value;
if (nome) dst.prepare('UPDATE clients SET name = ?, contact_name = ? WHERE id = ?').run(nome, nome, client.id);
if (tel) dst.prepare('UPDATE clients SET contact_phone = ? WHERE id = ?').run(tel.replace(/\D/g, ''), client.id);
if (email) dst.prepare('UPDATE clients SET contact_email = ? WHERE id = ?').run(email, client.id);

console.log(`importado: ${rows.length} respostas, completed_at=${completedAt}`);
src.close();
dst.close();
