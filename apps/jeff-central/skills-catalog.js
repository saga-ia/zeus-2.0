// Skills do Claude Code instaladas neste servidor, expostas como habilidades dos agentes.
// Varre os diretórios de skills do usuário (root) na subida do processo. Cada entrada vira
// { id, group, name, desc, slug, kind:'skill', instruction } e é somada às regras de prompt
// do agents-seed.js. Nomes e descrições em PT-BR vêm do mapa CURADO abaixo; skill nova sem
// entrada no mapa entra mesmo assim, com o nome do diretório e a primeira frase do SKILL.md.
const fs = require('fs');
const path = require('path');

const HOME = process.env.CLAUDE_HOME || '/root/.claude';

// ─── Nomes e descrições curtas por slug ───────────────────────────────────────
const CURADO = {
  // Maicom (skills em ~/.claude/skills)
  'maicom-diagnostico': ['Estratégia de marca (Maicom)', 'Diagnóstico do cliente', 'Lê formulário, briefing e redes e entrega diagnóstico em 6 blocos: identidade, presença digital, produtos, público, concorrência e as 3 tensões, alavancas e bloqueios.'],
  'maicom-mercado': ['Estratégia de marca (Maicom)', 'Pesquisa de mercado e concorrência', 'Panorama do mercado, análise da concorrência digital, benchmarking de referências, conteúdo do nicho e mapa de oportunidades.'],
  'maicom-personas': ['Estratégia de marca (Maicom)', 'Criação de personas', 'De 2 a 4 fichas de persona em 7 blocos, com mapa emocional, comportamento digital e como se comunicar, mais mapa comparativo.'],
  'maicom-posicionamento': ['Estratégia de marca (Maicom)', 'Posicionamento e big idea', 'Declaração de posicionamento, território de autoridade e big idea, com mapa de reposicionamento de 6 meses. Bússola das demais etapas.'],
  'maicom-tom-de-voz': ['Estratégia de marca (Maicom)', 'Tom de voz e identidade narrativa', 'Guia de voz em 7 blocos: perfil, como escrever, vocabulário, fazer e evitar, tom por plataforma, exemplos e guia de revisão.'],
  'maicom-esteira': ['Estratégia de marca (Maicom)', 'Esteira de produtos', 'Diagnóstico da esteira atual, estrutura ideal em 4 a 5 níveis, jornada do cliente, conteúdo por nível e funil de conversão.'],
  'maicom-visual': ['Estratégia de marca (Maicom)', 'Identidade visual e paleta', 'Brief visual em 8 blocos: diagnóstico, direcionamento, paleta com hex, tipografia, estética, aplicação por plataforma e referências.'],
  'maicom-conteudo': ['Estratégia de marca (Maicom)', 'Estrutura de conteúdo e treinamento', 'Calendário editorial de 30 dias, templates por formato, 30 ganchos, banco de CTAs, fluxo de produção, checklist e material de treinamento.'],

  // Maestro (plugin maestro-posicionamento)
  'maestro-posicionamento:maestro': ['Posicionamento de marca (Maestro)', 'Maestro: estratégia de posicionamento', 'Conduz a descoberta, varre marca e concorrência, classifica objetivo e momento e entrega estratégia de posicionamento por fases.'],
  'maestro-posicionamento:varredura-marca': ['Posicionamento de marca (Maestro)', 'Varredura da marca', 'Visita site e redes, compara o que a marca diz ser com o que parece ser e devolve o Retrato Real da Marca.'],
  'maestro-posicionamento:analise-concorrencia': ['Posicionamento de marca (Maestro)', 'Análise de concorrência', 'Audita 3 a 5 concorrentes (posicionamento, oferta, ângulos de anúncio, tom) e aponta a brecha que a marca pode ocupar.'],
  'maestro-posicionamento:roteamento-cerebro': ['Posicionamento de marca (Maestro)', 'Roteamento pelo CÉREBRO', 'Cruza objetivo e momento e escolhe 1 método por camada (Alma, Voz, Caixa) entre 24 métodos, justificando cada escolha.'],
  'maestro-posicionamento:inteligencia-conteudo': ['Posicionamento de marca (Maestro)', 'Inteligência de conteúdo', 'Traduz o método de voz em pautas concretas com ganchos, títulos e formatos que performam no nicho, usando os sistemas de pesquisa.'],
  'maestro-posicionamento:montagem-plano': ['Posicionamento de marca (Maestro)', 'Montagem do plano', 'Transforma a combinação de métodos em plano executável por fases, com entregáveis, KPIs e os primeiros 7 dias.'],

  // Sobral (skills em ~/.claude/skills, usadas pelo subagente sobral-trafego)
  'sobral-consultoria': ['Tráfego pago (Sobral)', 'Consultoria estratégica de tráfego', 'Entrevista de descoberta em 5 blocos e documento de 1 página com diagnóstico, estratégia, briefing de criativo, campanha, métricas e plano de 14 dias.'],
  'sobral-auditoria': ['Tráfego pago (Sobral)', 'Auditoria 360 da conta', 'Pontua 10 dimensões (BM, tracking, estrutura, criativos, públicos, oferta, performance, atribuição, compliance, operação) e entrega top 5 oportunidades, top 3 riscos e plano de 30 dias.'],
  'sobral-bm-meta': ['Tráfego pago (Sobral)', 'Configurar BM Meta', 'Business e Domain Verification, AEM, 2FA e redundância em ordem de impacto, com plano para subir a nota da BM em 30 dias.'],
  'sobral-google-ads': ['Tráfego pago (Sobral)', 'Configurar Google Ads', 'Estrutura Branded, Non-Branded, PMax, YouTube e Demand Gen, Smart Bidding, Enhanced Conversions, Customer Match e sequência das semanas 1 a 4.'],
  'sobral-publicos': ['Tráfego pago (Sobral)', 'Públicos e segmentação', 'Avatar psicográfico, públicos personalizados, lookalikes, exclusões, Customer Match e audience signals em PMax.'],
  'sobral-tracking': ['Tráfego pago (Sobral)', 'Tracking avançado', 'Pixel, GTM, CAPI e first-party com EMQ 8+, deduplicação, AEM, setup por plataforma, Consent Mode v2 e debug de bugs comuns.'],
  'sobral-troubleshoot': ['Tráfego pago (Sobral)', 'Troubleshoot de anúncios', 'Árvore de diagnóstico por sintoma: anúncio reprovado, BM restrita, conta desativada, Pixel parou, ROAS caiu, anúncio não entrega.'],
  'sobral-lancamento': ['Tráfego pago (Sobral)', 'Lançamentos', 'Tipos de lançamento, cronograma de 21 dias, cálculo de captação, CPL alvo, estrutura Meta e Google por fase e erros que matam lançamento.'],
  'sobral-mercado': ['Tráfego pago (Sobral)', 'Análise de mercado', 'Inteligência competitiva via Meta Ad Library, Google Ads Transparency, SimilarWeb e web: padrões vencedores, oportunidades e riscos.'],
  'sobral-instagram': ['Tráfego pago (Sobral)', 'Crescimento no Instagram', 'Bio, highlights, pacote semanal, hooks de Reels, estratégia paga no IG e plano de 90 dias de 10k a 50k seguidores.'],

  // Sobral (plugin sobral-gestor-trafego)
  'sobral-gestor-trafego:sobral': ['Tráfego pago (plugin Sobral)', 'Sobral: gestor de tráfego', 'Assume a conversa como gestor de tráfego sênior, faz a entrevista de descoberta e roteia para a skill especializada.'],
  'sobral-gestor-trafego:consultoria-estrategica': ['Tráfego pago (plugin Sobral)', 'Consultoria estratégica', 'Entrevista de descoberta em blocos, briefing, pesquisa de mercado e plano de campanha completo: estrutura, criativo, orçamento e métricas.'],
  'sobral-gestor-trafego:auditoria-conta': ['Tráfego pago (plugin Sobral)', 'Auditoria de conta', 'Checagem sistemática em 10 dimensões de conta Meta ou Google Ads com relatório priorizado de ações.'],
  'sobral-gestor-trafego:config-bm-meta': ['Tráfego pago (plugin Sobral)', 'Configurar BM Meta', 'Passo a passo (ou execução via Chrome) de verificação de empresa e domínio, AEM, redundância e ações para subir a nota da conta.'],
  'sobral-gestor-trafego:config-google-ads': ['Tráfego pago (plugin Sobral)', 'Configurar Google Ads', 'Configuração completa de Search, Performance Max, YouTube, Demand Gen, Shopping e estruturas de conta.'],
  'sobral-gestor-trafego:publicos-segmentacao': ['Tráfego pago (plugin Sobral)', 'Públicos e segmentação', 'Avatar, públicos personalizados, lookalikes, exclusões e Customer Match na Meta e no Google.'],
  'sobral-gestor-trafego:tracking-pixel-gtm': ['Tráfego pago (plugin Sobral)', 'Tracking: Pixel, GTM e CAPI', 'Pixel, GTM, CAPI, Enhanced Conversions, GA4 e deduplicação, com códigos prontos em HTML, PHP, JavaScript e Next.js.'],
  'sobral-gestor-trafego:troubleshoot-anuncios': ['Tráfego pago (plugin Sobral)', 'Troubleshoot de anúncios', 'Diagnóstico e resolução de anúncio reprovado, BM restrita, conta desativada, Pixel parado, CPA alto e entrega limitada.'],
  'sobral-gestor-trafego:lancamentos': ['Tráfego pago (plugin Sobral)', 'Lançamentos', 'Estrutura de tráfego para lançamento de infoproduto, serviço ou evento, do calendário de captação ao retargeting de carrinho.'],
  'sobral-gestor-trafego:analise-mercado': ['Tráfego pago (plugin Sobral)', 'Análise de mercado', 'Pesquisa de concorrência via Meta Ad Library, Google Ads Transparency, SimilarWeb e web, sintetizada em relatório acionável.'],
  'sobral-gestor-trafego:crescimento-instagram': ['Tráfego pago (plugin Sobral)', 'Crescimento no Instagram', 'Orgânico e pago integrados: conteúdo, perfil profissional, Reels, Stories e ads de seguidor que viram leads.'],

  // Documentos (skills sincronizadas da Anthropic)
  'anthropic-skills:docs': ['Documentos e arquivos', 'Documento colaborativo (Claude Docs)', 'Cria documentos vivos para compartilhar, comentar e editar: memo, spec, runbook, write-up.'],
  'anthropic-skills:docx': ['Documentos e arquivos', 'Word (.docx)', 'Cria, lê e edita documentos Word com sumário, numeração de página, papel timbrado, imagens e controle de alterações.'],
  'anthropic-skills:pdf': ['Documentos e arquivos', 'PDF', 'Lê, extrai texto e tabelas, junta, divide, gira, aplica marca d\'água, preenche formulários e faz OCR em PDFs.'],
  'anthropic-skills:pptx': ['Documentos e arquivos', 'PowerPoint (.pptx)', 'Cria e edita apresentações e pitch decks em PowerPoint, lê e extrai conteúdo de slides.'],
  'anthropic-skills:xlsx': ['Documentos e arquivos', 'Planilhas (.xlsx e CSV)', 'Abre, cria, corrige e converte planilhas: fórmulas, formatação, gráficos e limpeza de dados.'],
  'anthropic-skills:notebooklm': ['Documentos e arquivos', 'NotebookLM', 'Controla o NotebookLM pelo navegador: lê notebooks, adiciona fontes e gera resumos, slides, áudio e mapas mentais.'],

  // Sistema
  'anthropic-skills:morning': ['Sistema e produtividade', 'Resumo da manhã', 'Monta o briefing matinal como página HTML ou agenda como tarefa recorrente nos dias úteis.'],
  'anthropic-skills:import-memory': ['Sistema e produtividade', 'Importar memória', 'Importa exportação de memória de outro assistente de IA para a memória do Claude, de forma aditiva.'],
  'anthropic-skills:skill-creator': ['Sistema e produtividade', 'Criador de skills', 'Cria, edita, testa e otimiza skills, com avaliações e benchmark de desempenho.'],
  'cowork-plugin-management:create-cowork-plugin': ['Sistema e produtividade', 'Criar plugin', 'Guia a criação de um plugin do zero, do esboço ao arquivo .plugin final.'],
  'cowork-plugin-management:cowork-plugin-customizer': ['Sistema e produtividade', 'Personalizar plugin', 'Adapta um plugin às ferramentas e fluxos da empresa: conectores, configurações e skills.'],
};

// Ordem dos grupos na tela e no seletor do agente (grupos não listados vão pro fim)
const GROUP_ORDER = ['Estratégia de marca (Maicom)', 'Posicionamento de marca (Maestro)', 'Tráfego pago (Sobral)', 'Tráfego pago (plugin Sobral)', 'Documentos e arquivos', 'Sistema e produtividade'];

// ─── Leitura do SKILL.md ──────────────────────────────────────────────────────
function frontmatter(file) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(txt);
  if (!m) return { name: '', description: '' };
  const fm = m[1];
  const get = (key) => {
    const r = new RegExp('^' + key + ':[ \\t]*(.*)$', 'm').exec(fm);
    if (!r) return '';
    let v = r[1].trim();
    if (/^[>|]-?$/.test(v)) { // bloco multilinha
      const b = new RegExp('^' + key + ':[ \\t]*[>|]-?\\r?\\n((?:[ \\t]+.*(?:\\r?\\n|$))+)', 'm').exec(fm);
      return b ? b[1].split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' ') : '';
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'");
    return v;
  };
  return { name: get('name'), description: get('description') };
}

function primeiraFrase(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = /^(.{20,220}?[.!?])(\s|$)/.exec(t);
  return (m ? m[1] : t.slice(0, 220)).trim();
}

function titulo(slug) {
  const base = slug.split(':').pop();
  return base.split(/[-_]/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

function subdirs(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch (_) { return []; }
}

// ─── Fontes ───────────────────────────────────────────────────────────────────
// Retorna [{ slug, file, origem }]
function fontes() {
  const out = [];
  const seen = new Set();
  const add = (slug, file, origem) => {
    if (seen.has(slug) || !fs.existsSync(file)) return;
    seen.add(slug); out.push({ slug, file, origem });
  };

  // 1. Skills soltas do usuário: ~/.claude/skills/<slug>/SKILL.md
  const skillsDir = path.join(HOME, 'skills');
  subdirs(skillsDir).filter(d => d !== 'synced').forEach(d => add(d, path.join(skillsDir, d, 'SKILL.md'), 'usuário'));

  // 2. Skills sincronizadas da conta (claude.ai): ~/.claude/skills/synced/<conta>/<nome>/SKILL.md → anthropic-skills:<nome>
  subdirs(path.join(skillsDir, 'synced')).forEach(acct => {
    const base = path.join(skillsDir, 'synced', acct);
    subdirs(base).forEach(d => add('anthropic-skills:' + d, path.join(base, d, 'SKILL.md'), 'sincronizada'));
  });

  // 3. Plugins sincronizados da conta: ~/.claude/plugins/synced/<conta>/<plugin>/skills/<nome>/SKILL.md → <plugin>:<nome>
  subdirs(path.join(HOME, 'plugins', 'synced')).forEach(acct => {
    const base = path.join(HOME, 'plugins', 'synced', acct);
    subdirs(base).forEach(plugin => {
      const sk = path.join(base, plugin, 'skills');
      subdirs(sk).forEach(d => add(plugin + ':' + d, path.join(sk, d, 'SKILL.md'), 'plugin ' + plugin));
    });
  });

  // 4. Plugins instalados via marketplace (escopo usuário e habilitados no settings.json)
  let installed = {}, enabled = {};
  try { installed = JSON.parse(fs.readFileSync(path.join(HOME, 'plugins', 'installed_plugins.json'), 'utf8')).plugins || {}; } catch (_) {}
  try { enabled = JSON.parse(fs.readFileSync(path.join(HOME, 'settings.json'), 'utf8')).enabledPlugins || {}; } catch (_) {}
  Object.keys(installed).forEach(key => {
    if (enabled[key] === false) return;
    const plugin = key.split('@')[0];
    (installed[key] || []).filter(i => i.scope === 'user' && i.installPath).forEach(i => {
      const sk = path.join(i.installPath, 'skills');
      subdirs(sk).forEach(d => add(plugin + ':' + d, path.join(sk, d, 'SKILL.md'), 'plugin ' + plugin));
    });
  });

  return out;
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────
function instrucao(slug, name, desc) {
  return `Esta habilidade é a skill "${slug}" instalada neste servidor. Sempre que o pedido se encaixar (${String(desc).replace(/[.\s]+$/, '')}), acione-a pela ferramenta Skill com esse nome exato (se não encontrar, procure na lista de skills pelo nome curto "${slug.split(':').pop()}") e siga o procedimento dela até o fim antes de responder.`;
}

let _cache = null;
function load(force) {
  if (_cache && !force) return _cache;
  const items = fontes().map(({ slug, file, origem }) => {
    const fm = frontmatter(file) || { name: '', description: '' };
    const cur = CURADO[slug];
    const group = cur ? cur[0] : 'Outras skills do servidor';
    const name = cur ? cur[1] : titulo(fm.name || slug);
    const desc = cur ? cur[2] : (primeiraFrase(fm.description) || 'Skill instalada neste servidor.');
    return { id: slug, slug, kind: 'skill', group, name, desc, origem, file, instruction: instrucao(slug, name, desc) };
  });
  const rank = g => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; };
  const rankSlug = s => { const i = Object.keys(CURADO).indexOf(s); return i < 0 ? 9999 : i; };
  items.sort((a, b) => rank(a.group) - rank(b.group) || rankSlug(a.slug) - rankSlug(b.slug) || a.name.localeCompare(b.name, 'pt-BR'));
  _cache = items;
  return items;
}

module.exports = { load, instrucao, GROUP_ORDER, CURADO };

if (require.main === module) {
  const items = load(true);
  let g = '';
  items.forEach(s => { if (s.group !== g) { g = s.group; console.log('\n## ' + g); } console.log(`- ${s.slug}  →  ${s.name}  [${s.origem}]`); });
  console.log(`\n${items.length} skills`);
}
