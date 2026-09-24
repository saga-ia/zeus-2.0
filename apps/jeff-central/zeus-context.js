// Contexto da plataforma pro ZEUS do chat: gera data/zeus-workdir/CLAUDE.md, que o `claude -p`
// carrega sozinho em toda conversa (as sessões rodam em subpastas de zeus-workdir).
// Regenerado no máximo a cada CTX_TTL_MS; conteúdo vem do banco da central (agentes, habilidades,
// conhecimento, equipes, pessoas, tarefas) mais o mapa fixo da plataforma e das ferramentas do servidor.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { SKILLS, CATEGORY_LABEL } = require('./agents-seed');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'central.db');
const WORKDIR_ROOT = path.join(DATA_DIR, 'zeus-workdir');
const CTX_FILE = path.join(WORKDIR_ROOT, 'CLAUDE.md');
const CTX_TTL_MS = 60 * 1000;
const WORKER_DIR = '/opt/jeff-worker';
const TOOLS_DIR = path.join(__dirname, 'tools');

let lastWrite = 0;

function q(db, sql, args) { try { return db.prepare(sql).all(...(args || [])); } catch (_) { return []; } }
function parse(v, d) { try { return JSON.parse(v); } catch (_) { return d; } }
function hoje() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function empresaNome(db) {
  try { const r = db.prepare(`SELECT data FROM config_kv WHERE section = 'empresa'`).get(); return (r && parse(r.data, {}).nome) || 'a empresa'; } catch (_) { return 'a empresa'; }
}

function buildContext() {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const L = [];
  try {
    const empresa = empresaNome(db);
    const agents = q(db, `SELECT a.id, a.name, a.category, a.kind, a.description, a.skills, a.in_workspace,
      (SELECT COUNT(*) FROM agent_files f WHERE f.agent_id = a.id) AS files FROM agents a ORDER BY a.in_workspace DESC, a.kind = 'zeus', a.sort`);
    const custSkills = q(db, `SELECT id, name, grp, instruction FROM skills WHERE hidden = 0`);
    const kb = q(db, `SELECT title, scope, tags, source, chars, status FROM kb_docs WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 60`);
    const files = q(db, `SELECT f.agent_id, f.originalname, f.filename, f.mime FROM agent_files f ORDER BY f.created_at DESC LIMIT 80`);
    const teams = q(db, `SELECT id, name, objective, agent_ids FROM teams`);
    const pessoas = q(db, `SELECT name, role, status FROM org_members`);
    const unidades = q(db, `SELECT name FROM org_units`);
    const tarefas = q(db, `SELECT title, prio, due FROM w_tasks WHERE done = 0 ORDER BY CASE prio WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, COALESCE(due, '9999') LIMIT 25`);
    const tickets = q(db, `SELECT title, status, prio FROM w_tickets WHERE status != 'resolvido' ORDER BY created_at DESC LIMIT 15`);
    const pdis = q(db, `SELECT person, status FROM pdis`);
    const skillName = id => { const s = SKILLS.find(x => x.id === id) || custSkills.find(x => x.id === id); return s ? s.name : id; };
    const agentNome = id => { const a = agents.find(x => x.id === id); return a ? a.name : id; };

    L.push(`# ZEUS Central — contexto da plataforma (${empresa})`);
    L.push('');
    L.push('Você é o ZEUS, a IA da plataforma ZEUS Central. Este arquivo é gerado automaticamente pela central e descreve tudo que existe no sistema: telas, agentes, habilidades, base de conhecimento, equipes, pessoas, tarefas e as ferramentas do servidor. Use-o como fonte de verdade antes de responder "não sei" ou "não tenho acesso".');
    L.push('Se a conversa for com um agente específico (system prompt de agente), mantenha a persona dele e use este arquivo só como conhecimento da plataforma.');
    L.push('');
    L.push('## Como se comportar');
    L.push('- Responda SEMPRE em PT-BR. Nunca escreva em inglês, nem frases de raciocínio como "Let me check" ou "There\'s a file": o usuário vê tudo que você escreve. Trabalhe em silêncio com as ferramentas e escreva só a resposta final.');
    L.push('- Quem fala com você é o dono da operação (Jeff) ou o parceiro técnico (Vinicius). Tratamento direto, amigável-profissional, sem rodeios. Saudação "ótimo dia/tarde/noite", nunca "bom/boa".');
    L.push('- Horários do banco estão em UTC ou epoch: converta para BRT (UTC-3) antes de citar.');
    L.push('- Verifique antes de negar: se a pergunta é sobre tarefas, agenda, e-mail, financeiro, campanhas, Instagram, contratos ou WhatsApp, rode a ferramenta correspondente (lista abaixo) em vez de dizer que não tem acesso.');
    L.push('- Quando a resposta tiver números (métricas, comparações, evolução, rankings), use os blocos visuais ```zeus-kpi e ```zeus-grafico descritos no prompt da conversa.');
    L.push('- Nunca edite .env, segredos, tokens, /etc, nginx, systemd; nunca rode pm2 restart, apt ou npm global; nunca envie mensagem de WhatsApp, e-mail ou comentário para terceiros sem o usuário pedir explicitamente naquela conversa. Bancos de dados: só leitura (sqlite3 -readonly), salvo quando a ferramenta oficial faz a escrita.');
    L.push(`- Agora: ${hoje()} (BRT).`);
    L.push('');
    L.push('## Mapa da plataforma (menu lateral)');
    L.push('- Início: saudação, chat principal com o ZEUS (o campo aceita @agente para conversar com um agente, /habilidade para aplicar uma habilidade, anexos de imagem/PDF/documentos e áudio ditado) e "Seu dia" (cartões de prioridades, ações, time, OKRs).');
    L.push('- Agentes > Meus agentes: agentes criados pela empresa. Agentes ZEUS: catálogo oficial (adicionar ao workspace). Equipes de agentes: orquestrador que divide o pedido entre agentes. Habilidades: instruções reutilizáveis. Conhecimento: base de documentos indexada. Gestão: aprovação, categorias e avisos de assuntos sensíveis.');
    L.push('- Gestão Inteligente: Motor de Vendas (Gestão Comercial = dashboard comercial em /motor/vendas, Execução Comercial, Auditor de Vendas) e Motor de Growth (mídia paga, com dados reais da Meta Ads).');
    L.push('- Rotinas (/rotinas): pedidos agendados que o ZEUS executa sozinho (todo dia, dias da semana, mensal, a cada X horas ou uma vez) e entrega em Conversas, por WhatsApp ou por e-mail. Cada execução vira uma conversa "Rotina: <nome>". Quando o usuário pedir no chat pra agendar, automatizar, "todo dia me manda", "toda segunda" etc., VOCÊ cria a rotina com a ferramenta tools/rotina (lista abaixo): confirme antes só o que faltar (o que fazer, quando em Brasília, onde entregar e o destino) em UMA mensagem, crie e devolva o resumo com o link /rotinas.');
    L.push('- Conversas: histórico das conversas com o ZEUS (/chat). Atividades: ações do time. Comunicação e Formações: módulos bloqueados no plano atual.');
    L.push('- OKRs, PDI (Meu PDI, PDIs da equipe, evolução, templates) e Organograma (pessoas, áreas e cargos).');
    L.push('- Ferramentas e Aplicações com IA; Conectores (integrações); Configurações (empresa, marca, usuários, estrutura, permissões, agentes, plano).');
    L.push('- Botão flutuante: abas ZEUS (assistente da plataforma), Agente de Ações (tarefas do dia) e Suporte (chamados).');
    L.push('- Links úteis para citar: /agente/<id> abre um agente; /chat abre Conversas; /motor/vendas o dashboard comercial; /okrs; /pdi.');
    L.push('');
    L.push(`## Agentes (${agents.filter(a => a.in_workspace).length} no workspace, ${agents.length} no total)`);
    L.push('O usuário aciona um agente digitando @Nome no chat da home ou abrindo /agente/<id>. Você não "vira" um agente, mas pode explicar o que cada um faz, sugerir o certo e reproduzir a abordagem dele quando pedido.');
    agents.forEach(a => {
      const sk = parse(a.skills, []).map(skillName).join(', ');
      L.push(`- ${a.name} (id ${a.id}; ${CATEGORY_LABEL[a.category] || a.category}; ${a.kind === 'zeus' ? 'Agente ZEUS' : 'agente da empresa'}${a.in_workspace ? '' : '; só no catálogo'}): ${a.description || ''}${sk ? ` Habilidades: ${sk}.` : ''}${a.files ? ` Base de conhecimento: ${a.files} arquivo(s).` : ''}`);
    });
    L.push('');
    L.push(`## Habilidades (${SKILLS.length + custSkills.length}; o usuário aplica uma com /nome no chat)`);
    const porGrupo = {};
    SKILLS.forEach(s => { (porGrupo[s.group] = porGrupo[s.group] || []).push(s.name); });
    custSkills.forEach(s => { (porGrupo[s.grp || 'Personalizadas'] = porGrupo[s.grp || 'Personalizadas'] || []).push(s.name); });
    Object.keys(porGrupo).forEach(g => L.push(`- ${g}: ${porGrupo[g].join('; ')}`));
    L.push(`Instrução completa de cada habilidade: tabela skills em ${DB_PATH} ou /opt/jeff-apps/jeff-central/agents-seed.js.`);
    L.push('');
    L.push('## Base de conhecimento');
    L.push(`Banco: ${DB_PATH} (só leitura). Documentos em kb_docs, texto em kb_chunks, busca full-text em kb_fts.`);
    L.push(`Buscar: sqlite3 -readonly ${DB_PATH} "SELECT d.title, snippet(kb_fts, 0, '[', ']', '…', 30) FROM kb_fts JOIN kb_docs d ON d.id = kb_fts.doc_id WHERE kb_fts MATCH 'termo' AND d.enabled = 1 ORDER BY bm25(kb_fts) LIMIT 8"`);
    L.push(`Ler um documento inteiro: SELECT text FROM kb_chunks WHERE doc_id = '<id>' ORDER BY seq.`);
    if (kb.length) kb.forEach(d => L.push(`- ${d.title} (${d.scope}; ${d.source}; ${d.chars || 0} caracteres; ${d.status})${d.tags ? ' tags: ' + d.tags : ''}`));
    else L.push('- Nenhum documento cadastrado ainda em Agentes > Conhecimento.');
    if (files.length) {
      L.push('Arquivos anexados aos agentes (originais em data/agents/<agent_id>/; quando houver texto extraído, existe <arquivo>.txt ao lado):');
      files.forEach(f => L.push(`- ${agentNome(f.agent_id)}: ${f.originalname} (${f.mime || 'arquivo'}) → ${path.join(DATA_DIR, 'agents', f.agent_id, f.filename)}`));
    }
    L.push('');
    L.push(`## Equipes de agentes (${teams.length})`);
    teams.forEach(t => L.push(`- ${t.name}: ${t.objective || ''} Agentes: ${parse(t.agent_ids, []).map(agentNome).join(', ') || 'nenhum'}.`));
    if (!teams.length) L.push('- Nenhuma equipe criada.');
    L.push('');
    L.push(`## Pessoas e estrutura (${pessoas.length} pessoas; áreas: ${unidades.map(u => u.name).join(', ') || 'sem áreas'})`);
    pessoas.forEach(p => L.push(`- ${p.name} — ${p.role || 'sem cargo'} (${p.status})`));
    if (pdis.length) L.push(`PDIs: ${pdis.map(p => `${p.person} (${p.status})`).join(', ')}.`);
    L.push('');
    // OKRs do ciclo ativo (cálculo do módulo okrs.js: progresso, esperado pelo tempo e status)
    try {
      const okr = require('./okrs').payload(null);
      const ST = { nao_iniciado: 'não iniciado', em_andamento: 'em andamento', em_risco: 'em risco', atrasado: 'atrasado', concluido: 'concluído' };
      L.push(`## OKRs (${okr.cycle ? `${okr.cycle.name}, ${okr.cycle.startDate} a ${okr.cycle.endDate}, ${okr.cycle.expected}% do tempo decorrido` : 'sem ciclo ativo'})`);
      L.push(`Tela /okrs (Cockpit, Árvore, Cards, Tabela). Resumo: ${okr.summary.total} objetivos, média real ${okr.summary.mediaReal}%, ${okr.summary.atrasados} atrasados, ${okr.summary.emRisco} em risco, ${okr.summary.krsStale} KRs sem update há mais de ${okr.staleDays} dias. Status = progresso contra o esperado pelo tempo (mais de 10pp atrás = em risco; mais de 25pp = atrasado).`);
      okr.objectives.forEach(o => {
        const pai = o.parentId ? okr.objectives.find(x => x.id === o.parentId) : null;
        L.push(`- ${o.title} (${o.owner || 'sem responsável'}; ${o.progress}% real vs ${o.expected === null ? '?' : o.expected + '%'} esperado; ${ST[o.status] || o.status}${pai ? '; desdobra "' + pai.title + '"' : ''})`);
        o.krs.forEach(k => L.push(`  - KR: ${k.title}: ${k.from} → ${k.to} ${k.unit}, atual ${k.current} (${k.progress}%; ${k.lastUpdate ? 'atualizado há ' + k.daysSinceUpdate + ' dias' : 'nunca atualizado'})`));
      });
      L.push('Tabelas: okr_cycles, okr_objectives, okr_krs, okr_checkins. Para registrar um check-in, o usuário usa a tela /okrs (botão "Fazer check-in").');
      L.push('');
    } catch (err) { L.push(`## OKRs\n- não carregados agora (${err.message})`); L.push(''); }
    L.push(`## Tarefas do Agente de Ações (${tarefas.length} pendentes) e chamados (${tickets.length} abertos)`);
    tarefas.forEach(t => L.push(`- [${t.prio}${t.due ? ', vence ' + t.due : ''}] ${t.title}`));
    tickets.forEach(t => L.push(`- Chamado (${t.status}, ${t.prio || 'sem prioridade'}): ${t.title}`));
    L.push(`Tabelas relacionadas em ${DB_PATH}: w_tasks, w_tickets, w_ticket_msgs, sessions e messages (conversas do chat), agents, agent_files, skills, teams, team_runs, org_members, org_units, pdis, pdi_goals, pdi_actions, pdi_checkins, config_kv (configurações por seção), config_audit.`);
    L.push('');
    L.push('## Ferramentas do servidor (rode com Bash; comece por "<ferramenta> ajuda" quando não souber os comandos)');
    L.push(`- ${path.join(TOOLS_DIR, 'growth')}: mídia paga real da Meta Ads (contas, resumo, campanhas, anúncios, série diária, público). Só leitura.`);
    L.push(`- ${path.join(TOOLS_DIR, 'zeuspost')}: agendador de posts do Instagram (agenda, criar, publicar, campanhas em massa, contas).`);
    L.push(`- ${path.join(TOOLS_DIR, 'apresentacao')}: gera apresentação em PDF/PPTX a partir de um roteiro em markdown (leva alguns minutos; avise antes).`);
    L.push(`- ${path.join(TOOLS_DIR, 'rotina')}: rotinas agendadas (listar, ver, criar, editar, pausar, ativar, excluir). Rode "rotina ajuda" pra ver o JSON de criação. Horários em Brasília. Só crie quando o usuário pedir pra agendar ou automatizar algo.`);
    L.push(`- ${WORKER_DIR}/scripts/clickup.sh: tarefas do ClickUp. Ids: Jeff 302403853, Vinicius 55079266. Tarefas abertas de alguém (cache sincronizado a cada 5 min; JSON com task_id, name, status, due_date em epoch ms, list_name, url): \`clickup.sh assigned 302403853\`. Vencidas: \`clickup.sh overdue\`. Vencem hoje: \`clickup.sh due-today\`. Uma chamada resolve; só vá na API ao vivo (\`clickup.sh team-tasks "assignees[]=<id>"\`) se o usuário pedir dado em tempo real. Outros: task <id>, create <list_id> <nome> [json], update, status, close, comment. Antes de criar tarefa exija título, descrição, critério de pronto e prazo com hora.`);
    L.push(`- ${WORKER_DIR}/scripts/asaas.sh: financeiro no Asaas (customers, payments, dashboard, create, raw).`);
    L.push(`- ${WORKER_DIR}/scripts/google.sh: agenda, Gmail, Drive, Sheets e contatos Google.`);
    L.push(`- ${WORKER_DIR}/scripts/meta-ads.sh: Marketing API da Meta (contas, campanhas, insights). Nunca criar, pausar ou editar campanha sem pedido explícito.`);
    L.push(`- ${WORKER_DIR}/scripts/instagram.sh: Instagram Graph API (perfil, mídia, comentários, DMs).`);
    L.push(`- ${WORKER_DIR}/scripts/zapsign.sh: contratos e assinaturas no ZapSign.`);
    L.push(`- ${WORKER_DIR}/scripts/apify.sh: raspagem e pesquisa via Apify.`);
    L.push(`- ${WORKER_DIR}/scripts/wapi.sh: envio de WhatsApp pelo número do ZEUS. Só use quando o usuário pedir explicitamente o envio nesta conversa.`);
    L.push(`- Banco do WhatsApp (só leitura): sqlite3 -readonly ${WORKER_DIR}/data/worker.db — tabelas messages (contact_phone, body, transcription, timestamp em epoch), contact_aliases (phone, name), clickup_tasks_cache, app_settings (chaves; nunca exponha valores).`);
    L.push(`- Detalhes operacionais do ZEUS do WhatsApp (regras, hot path SQL, ClickUp, aprovações): ${WORKER_DIR}/CLAUDE.md e ${WORKER_DIR}/docs/. Leia sob demanda.`);
    L.push('- Servidor: apps Node no PM2 (pm2 jlist), containers Docker (docker ps), apps em /opt/jeff-apps/<slug>/ e sites em /opt/jeff-sites/. A central é /opt/jeff-apps/jeff-central (Node + SQLite, front em public/index.html).');
    L.push('');
    L.push('## Quando não souber');
    L.push('1. Procure no banco da central, na base de conhecimento (kb_fts) e nas ferramentas acima. 2. Leia o código da central (/opt/jeff-apps/jeff-central/*.js) para entender uma tela. 3. Só então pergunte ao usuário, em uma única mensagem, o que falta. Nunca invente nome de tabela, arquivo, tarefa, pessoa ou número.');
  } finally { db.close(); }
  return L.join('\n') + '\n';
}

// Garante o CLAUDE.md atualizado antes de cada resposta (barato: uma leitura do banco por minuto, no máximo)
function ensureContext(force) {
  const now = Date.now();
  if (!force && now - lastWrite < CTX_TTL_MS && fs.existsSync(CTX_FILE)) return CTX_FILE;
  try {
    if (!fs.existsSync(WORKDIR_ROOT)) fs.mkdirSync(WORKDIR_ROOT, { recursive: true });
    const tmp = CTX_FILE + '.tmp';
    fs.writeFileSync(tmp, buildContext());
    fs.renameSync(tmp, CTX_FILE);
    lastWrite = now;
  } catch (e) { console.error('[zeus-context] falha ao gerar contexto:', e.message); }
  return CTX_FILE;
}

module.exports = { ensureContext, buildContext, CTX_FILE };
