'use strict';
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'clientes.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS form_sections (
  id INTEGER PRIMARY KEY,
  ordem INTEGER NOT NULL,
  tag TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS form_questions (
  id INTEGER PRIMARY KEY,
  section_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  qkey TEXT NOT NULL,
  label TEXT NOT NULL,
  hint TEXT,
  qtype TEXT NOT NULL DEFAULT 'text',
  required INTEGER NOT NULL DEFAULT 0,
  min_length INTEGER NOT NULL DEFAULT 0,
  big INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (section_id) REFERENCES form_sections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS form_sessions (
  id TEXT PRIMARY KEY,
  slug TEXT,
  client_id INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  last_section INTEGER NOT NULL DEFAULT 0,
  photo_path TEXT,
  user_agent TEXT,
  ip TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS form_responses (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  section INTEGER NOT NULL,
  question_key TEXT NOT NULL,
  question_label TEXT,
  value TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES form_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_form_questions_section ON form_questions(section_id, ordem);
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_sessions_slug ON form_sessions(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_responses_session ON form_responses(session_id, question_key, version);
`);

const clientCols = db.prepare("PRAGMA table_info(clients)").all().map(c => c.name);
if (!clientCols.includes('onboarding_slug')) {
  db.exec("ALTER TABLE clients ADD COLUMN onboarding_slug TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_onboarding_slug ON clients(onboarding_slug) WHERE onboarding_slug IS NOT NULL");
}
if (!clientCols.includes('onboarding_session_id')) {
  db.exec("ALTER TABLE clients ADD COLUMN onboarding_session_id TEXT");
}

const SEED = [
  { tag: 'Identificação', title: '1. Início', subtitle: null, fields: [
    { key: 'nome', label: 'Nome completo', type: 'text', required: 1 },
    { key: 'telefone', label: 'Telefone com DDD', type: 'tel', required: 1, hint: '(ex: 11 91234-5678)' },
    { key: 'email', label: 'Melhor e-mail', type: 'email', required: 1 },
    { key: 'foto', label: 'Foto para cadastro', type: 'photo' },
  ]},
  { tag: 'Sobre você', title: '2. Conhecendo o especialista', subtitle: null, fields: [
    { key: 'instagram', label: 'Qual o @ do seu Instagram', type: 'text', required: 1 },
    { key: 'historia_pessoal', label: 'História pessoal/profissional', hint: 'Uma breve descrição de sua trajetória até aqui.', type: 'textarea', required: 1 },
    { key: 'produtos_servicos_brief', label: 'Me fala sobre seus produtos ou serviços', hint: 'Quais são, e como são entregues aos clientes.', type: 'textarea', required: 1 },
    { key: 'cargo', label: 'Cargo ou profissão principal', type: 'text', required: 1 },
    { key: 'empresa', label: 'Empresa (se houver)', type: 'text' },
    { key: 'redes', label: 'Website e redes sociais', hint: 'LinkedIn, Instagram, Facebook, etc.', type: 'textarea' },
    { key: 'valores_pessoais', label: 'Valores pessoais que você gostaria de transmitir', type: 'textarea', required: 1 },
    { key: 'valores_profissionais', label: 'Valores profissionais que você gostaria de transmitir', type: 'textarea', required: 1 },
    { key: 'proposito_pessoal', label: 'Qual o seu propósito pessoal?', hint: 'O que te move a fazer o que faz?', type: 'textarea', required: 1 },
    { key: 'proposito_profissional', label: 'Qual o seu propósito profissional?', hint: 'O que te move a fazer o que faz?', type: 'textarea', required: 1 },
    { key: 'descricao_publico', label: 'Como gostaria que o público descrevesse você em uma frase?', type: 'textarea', required: 1 },
  ]},
  { tag: 'Oferta', title: '3. Produtos e Serviços', subtitle: null, fields: [
    { key: 'principais_produtos', label: 'Quais são os principais produtos ou serviços que você oferece?', type: 'textarea', required: 1 },
    { key: 'descricao_produtos', label: 'Descreva brevemente cada um deles', hint: 'Quais problemas resolvem, quais benefícios oferecem.', type: 'textarea', required: 1 },
    { key: 'diferencial', label: 'Qual o principal diferencial em comparação com a concorrência?', type: 'textarea', required: 1 },
    { key: 'produto_novo', label: 'Há algum produto ou serviço novo que você gostaria de destacar?', type: 'textarea' },
    { key: 'objecoes', label: 'Principais objeções que seus clientes costumam ter ao comprar?', type: 'textarea', required: 1 },
  ]},
  { tag: 'Cliente ideal', title: '4. Público-Alvo', subtitle: null, fields: [
    { key: 'publico_principal', label: 'Quem é o seu público-alvo principal?', type: 'textarea', required: 1 },
    { key: 'faixa_etaria', label: 'Qual a faixa etária do seu público-alvo?', type: 'text', required: 1 },
    { key: 'interesses', label: 'Interesses principais do seu público', hint: 'O que gostam, fazem no tempo livre, preocupações, aspirações.', type: 'textarea', required: 1 },
    { key: 'ocupacao', label: 'Qual a ocupação ou status profissional do público?', hint: 'Empresários, autônomos, profissionais liberais, etc.', type: 'textarea', required: 1 },
    { key: 'escolaridade', label: 'Nível de escolaridade e conhecimento', hint: 'Cursos/áreas de formação mais comuns.', type: 'textarea' },
    { key: 'dores', label: 'Principais "dores" do público e como você resolve', type: 'textarea', required: 1 },
    { key: 'consciencia', label: 'Nível de consciência do público', hint: 'Desconhece o problema? Sabe do problema mas não da solução? Conhece soluções mas não você? Pronto pra comprar?', type: 'textarea', required: 1 },
    { key: 'percepcao', label: 'Como você acha que seu público te enxerga atualmente?', type: 'textarea', required: 1 },
    { key: 'desafios', label: 'Quais os desafios que você enfrenta?', type: 'textarea', required: 1 },
    { key: 'medos', label: 'Quais os medos que você tem?', type: 'textarea', required: 1 },
  ]},
  { tag: 'Mercado', title: '5. Concorrência e Mercado', subtitle: null, fields: [
    { key: 'concorrentes', label: 'Quem são seus principais concorrentes (nomes ou marcas)?', type: 'textarea', required: 1 },
    { key: 'diferenciacao', label: 'Como você se diferencia deles?', type: 'textarea', required: 1 },
    { key: 'ameacas', label: 'Quais são as maiores ameaças ou desafios no seu setor atualmente?', type: 'textarea', required: 1 },
    { key: 'mercado_nao_entendeu', label: 'O que o mercado ainda não entendeu sobre você ou seu produto?', type: 'textarea' },
    { key: 'concorrentes_ruins', label: 'Concorrentes que não fazem um bom trabalho?', type: 'textarea' },
  ]},
  { tag: 'Direção', title: '6. Objetivos e Metas', subtitle: null, fields: [
    { key: 'objetivo_principal', label: 'Qual o principal objetivo deste trabalho de posicionamento?', type: 'textarea', required: 1 },
    { key: 'objetivo_outros', label: 'Se a resposta foi "outros", explique', type: 'textarea' },
    { key: 'metas_6m', label: 'Metas principais para os próximos 6 meses', hint: 'Aumentar seguidores, fechar mais vendas, expandir mercados, etc.', type: 'textarea', required: 1 },
    { key: 'autoridade', label: 'Em que você gostaria de ser reconhecido(a) como autoridade?', type: 'textarea', required: 1 },
  ]},
  { tag: 'Voz', title: '7. Estilo de Comunicação e Branding', subtitle: null, fields: [
    { key: 'tom', label: 'Como você gostaria que fosse o tom da sua comunicação?', type: 'textarea', required: 1 },
    { key: 'sentimento', label: 'Sentimento ou emoção principal a transmitir', hint: 'Alegria, inspiração, confiança, seriedade.', type: 'textarea', required: 1 },
    { key: 'palavras', label: 'Palavras ou termos específicos que gostaria de usar com frequência', type: 'textarea' },
    { key: 'referencias_perfis', label: 'Referências (perfis @ que gostaria de modelar)', type: 'textarea' },
    { key: 'referencias_links', label: 'Referências (links pra eu poder ver)', type: 'textarea' },
  ]},
  { tag: 'Track record', title: '8. Histórico e Resultados', subtitle: null, fields: [
    { key: 'investiu_antes', label: 'Já investiu em posicionamento digital antes?', hint: 'O que funcionou? O que não deu certo?', type: 'textarea', required: 1 },
    { key: 'presenca_atual', label: 'Sua presença atual nas redes', hint: 'Número de seguidores, engajamento, etc.', type: 'textarea', required: 1 },
    { key: 'cases', label: 'Algum case de sucesso (cliente satisfeito, resultado marcante)?', type: 'textarea' },
  ]},
  { tag: 'Trabalho', title: '9. Expectativas e Preferências', subtitle: null, fields: [
    { key: 'expectativas', label: 'Quais são suas expectativas para este trabalho?', type: 'textarea', required: 1 },
    { key: 'referencias_estudo', label: 'Referências de estudo / material de apoio', type: 'textarea' },
    { key: 'ferramentas', label: 'Ferramentas/plataformas que já utiliza', hint: 'Instagram, YouTube, Blog, E-mail marketing, etc.', type: 'textarea', required: 1 },
    { key: 'equipe_suporte', label: 'Tem equipe de suporte ou faz tudo independente?', type: 'textarea', required: 1 },
    { key: 'envolvimento', label: 'Prefere participar ativamente da criação de conteúdo ou prefere delegar?', type: 'textarea', required: 1 },
  ]},
  { tag: 'Jornada', title: '10. Sua História',
    subtitle: 'Me conte com detalhes quem você é, como foi sua infância, adolescência. O que você fazia, como foi sua vida nessa época. Me diga quais eram seus sonhos.',
    fields: [
      { key: 'historia_completa', label: 'Sua história — sem filtro, como se contasse pra alguém de confiança', hint: 'Mínimo 500 caracteres. Não precisa ficar bonito.', type: 'textarea', required: 1, minLength: 500, big: 1 },
      { key: 'info_essencial', label: 'Existe alguma informação essencial que ainda não abordamos?', type: 'textarea' },
    ]},
];

const haveAny = db.prepare('SELECT COUNT(*) AS n FROM form_sections').get().n;
if (!haveAny) {
  const insSec = db.prepare('INSERT INTO form_sections (ordem, tag, title, subtitle) VALUES (?, ?, ?, ?)');
  const insQ = db.prepare(
    'INSERT INTO form_questions (section_id, ordem, qkey, label, hint, qtype, required, min_length, big) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    SEED.forEach((sec, i) => {
      const r = insSec.run(i + 1, sec.tag, sec.title, sec.subtitle);
      sec.fields.forEach((f, j) => {
        insQ.run(r.lastInsertRowid, j + 1, f.key, f.label, f.hint || null, f.type || 'text', f.required ? 1 : 0, f.minLength || 0, f.big ? 1 : 0);
      });
    });
  });
  tx();
  console.log('[seed] form_sections=' + SEED.length);
} else {
  console.log('[seed] já populado, skip');
}

console.log('Schema do form OK em', dbPath);
db.close();
