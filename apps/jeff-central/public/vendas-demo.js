// Execução Comercial › Gestão Comercial e Qualidade: base ILUSTRATIVA de negócios do CRM para demonstração.
// Gera ~1.500 negócios fictícios (semente fixa: os números não mudam entre recarregamentos) e todos os cartões
// do dashboard são calculados a partir dela, então os filtros (funil, período, status, vendedor, etapa e canal) funcionam de verdade.
// O bloco "Leads por canal" (vendas-canais.js) continua com os dados reais e não é afetado.
// Carregado depois do script principal: usa state, icon, ICONS, e (escape), vendasTabsHTML, mvKpiHTML, mvFunilHTML,
// mvMiniHTML, mvCard, funilTipHTML, vendasCanaisHTML, cfgToast, setState, DATA e RENDERERS de lá.
(function(){
  const ROXO = "#673DE6", VERDE = "#0F7A68", VERM = "#C0341C", AMBAR = "#B7791F", CINZA = "#66666F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const DIA = 86400000, HORA = 3600000;
  const AGORA = Date.now();

  // ─── Base fictícia ───────────────────────────────────────────────────────────
  function rng(seed){ return function(){ seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const VENDEDORES = [
    { nome: "Ana Ribeiro", hab: 1.25, resp: 0.25, crit: { resp: 9.1, abertura: 8.8, diag: 8.9, valor: 8.4, objecao: 8.1, fechamento: 8.6, follow: 8.2 } },
    { nome: "Bruno Lima", hab: 1.0, resp: 0.4, crit: { resp: 8.7, abertura: 7.6, diag: 5.2, valor: 6.4, objecao: 6.1, fechamento: 7.2, follow: 6.8 } },
    { nome: "Carla Souza", hab: 1.1, resp: 0.9, crit: { resp: 7.4, abertura: 8.5, diag: 7.8, valor: 8.6, objecao: 7.3, fechamento: 6.9, follow: 5.1 } },
    { nome: "Diego Martins", hab: 0.7, resp: 3.2, crit: { resp: 3.9, abertura: 6.2, diag: 5.6, valor: 5.9, objecao: 4.4, fechamento: 4.6, follow: 5.4 } }
  ];
  const FUNIS = [["Funil de vendas", 0.68, 1.0, 1900], ["Funil de renovação", 0.2, 1.6, 1300], ["Funil de parcerias", 0.12, 0.9, 5200]];
  const CANAIS = [["Site", 0.28, 1.0], ["Instagram", 0.2, 0.75], ["Anúncio Meta", 0.16, 0.8], ["Google", 0.14, 0.9], ["Indicação", 0.12, 1.5], ["Contato direto", 0.1, 1.3]];
  const ETAPAS = ["Novo lead", "Em contato", "Qualificado", "Proposta", "Negociação", "Fechado"];
  const PASSOS = ["Leads", "Contatados", "Qualificados", "Orçados", "Fechados"];
  const MOTIVOS = [["Preço acima do esperado", 0.36], ["Sumiu depois do orçamento", 0.28], ["Fechou com concorrente", 0.2], ["Sem urgência agora", 0.16]];
  const NOMES = ["Igor", "Mariane", "Alan", "Flávia", "Guilherme", "Edvânia", "Gabriel", "Renata", "Lucas", "Camila", "Rafael", "Juliana", "Thiago", "Patrícia", "Felipe", "Larissa", "Rodrigo", "Aline", "Marcelo", "Bianca", "Fernanda", "Leandro", "Natália", "Caio", "Priscila", "André", "Tatiane", "Eduardo", "Sabrina", "Henrique", "Débora", "Murilo", "Letícia", "Paulo", "Vanessa"];
  const SOBRENOMES = ["Paulino", "Mourão", "Mendes", "Poncio", "Araújo", "Barbosa", "Cardoso", "Duarte", "Esteves", "Gomes", "Holanda", "Lacerda", "Moreira", "Nogueira", "Pacheco", "Queiroz", "Rezende", "Siqueira", "Teixeira", "Vasconcelos", "Xavier"];
  const EMPRESAS = ["Urbis", "GN Digital", "Jocross", "Vértice Imóveis", "Clínica Sorrir", "Nexo Contabilidade", "Bella Estética", "Pratik Engenharia", "Rota Sul Logística", "Studio Lumi", "Casa Verde Paisagismo", "Prime Odonto", "Atlas Seguros", "Fit Center", "Doce Ateliê", "Movva Educação", "Lótus Spa", "Grão Café", "Orbe Tecnologia", "Veloz Auto Center"];
  const CRITERIOS = [
    ["resp", "Velocidade de resposta", "Respondeu em até 15 min no horário comercial"],
    ["abertura", "Abertura e conexão", "Se apresentou, chamou pelo nome e criou conexão"],
    ["diag", "Diagnóstico", "Perguntou dor, prazo e orçamento antes de falar de preço"],
    ["valor", "Apresentação de valor", "Ligou a solução à dor que o lead contou"],
    ["objecao", "Tratamento de objeção", "Acolheu e perguntou antes de responder, sem desconto automático"],
    ["fechamento", "Pedido de fechamento", "Propôs o próximo passo com dia e hora"],
    ["follow", "Follow-up", "Voltou a falar no prazo combinado"]
  ];
  const ERROS = { resp: "Demorou mais de 2h para responder", abertura: "Não se apresentou nem chamou pelo nome", diag: "Mandou preço antes de entender a necessidade", valor: "Listou o que entrega sem ligar à dor do cliente", objecao: "Deu desconto sem o cliente pedir", fechamento: "Não marcou próximo passo", follow: "Sumiu depois da proposta" };
  const DICAS = {
    resp: "Ative o aviso de lead novo e responda nos primeiros 15 minutos. Depois de 1 hora a chance de conversa cai pela metade.",
    abertura: "Abra com nome e contexto: \"Oi, {lead}! Aqui é {vend}. Vi que você chegou pelo {canal}. Posso te fazer 2 perguntas rápidas?\"",
    diag: "Antes do preço, pergunte: \"O que te fez procurar isso agora?\" e \"Pra quando você precisa resolver?\"",
    valor: "Repita a dor com as palavras do cliente antes de apresentar: \"Você disse que perde lead por demora, então o que resolve isso é...\"",
    objecao: "Na objeção de preço, pergunte \"comparado com o quê?\" antes de pensar em desconto.",
    fechamento: "Feche com data: \"Te mando o contrato hoje e começamos na segunda, pode ser?\"",
    follow: "Combine o retorno na própria conversa e volte no dia: \"Te chamo quinta às 10h, combinado?\""
  };
  const CONVERSAS = {
    bom: [
      [["l", "Oi, vi vocês no {canal}. Queria entender como funciona.", 0], ["v", "Oi, {lead}! Aqui é {vend}, tudo bem? Que bom que chamou. Antes de te explicar, me conta: o que te fez procurar isso agora?", 6], ["l", "Meu time não dá conta dos leads, muita gente fica sem resposta.", 9], ["v", "Entendi. Quantos leads chegam por semana, mais ou menos? E quem responde hoje?", 10], ["l", "Uns 80. Sou eu e mais uma pessoa.", 14], ["v", "Então o gargalo é tempo de resposta, e é exatamente isso que o acompanhamento resolve. Pra esse volume o investimento fica em {valor}. Marcamos 20 min amanhã às 10h pra eu te mostrar funcionando?", 16], ["l", "Pode ser, amanhã às 10h.", 21]],
      [["l", "Achei o valor um pouco alto.", 0], ["v", "Entendo, {lead}. Alto comparado com o quê? Me ajuda a entender o que você tem em mente.", 4], ["l", "Outra empresa me passou mais barato.", 11], ["v", "Faz sentido comparar. A diferença é que aqui o acompanhamento é semanal e a resposta sai em até 15 min. Você comentou que perde venda por demora, certo?", 13], ["l", "Sim, é o principal.", 18], ["v", "Então começamos pelo plano de 3 meses, sem fidelidade depois. Te mando o contrato hoje e começamos na segunda?", 19], ["l", "Fechado, pode mandar.", 25]]
    ],
    medio: [
      [["l", "Boa tarde, quanto custa?", 0], ["v", "Boa tarde, {lead}! O plano começa em {valor} por mês.", 22], ["l", "E o que inclui?", 31], ["v", "Inclui o acompanhamento, relatórios e suporte. Quer que eu mande a proposta?", 40], ["l", "Manda sim.", 44], ["v", "Enviado! Qualquer dúvida estou por aqui.", 47]],
      [["l", "Oi, recebi a proposta. Vou ver com meu sócio.", 0], ["v", "Perfeito, {lead}! Fico no aguardo.", 35], ["v", "Oi {lead}, conseguiu ver com seu sócio?", 4320], ["l", "Ainda não, semana corrida.", 4400], ["v", "Tranquilo, fico à disposição.", 4410]]
    ],
    ruim: [
      [["l", "Olá, gostaria de um orçamento.", 0], ["v", "Oi, desculpa a demora! Ainda tem interesse?", 455], ["l", "Já fechei com outra empresa, obrigado.", 470], ["v", "Ok, qualquer coisa estamos aqui.", 520]],
      [["l", "Oi, vi no {canal}. Como funciona?", 0], ["v", "Oi! Segue a tabela: plano básico {valor}, o completo é um pouco mais. Se fechar hoje faço 20% de desconto.", 95], ["l", "Hmm, vou pensar.", 130], ["v", "Consigo fazer 30% se fechar até amanhã.", 132], ["l", "Ok, te aviso.", 300]]
    ]
  };

  let _base = null;
  function base(){
    if(_base) return _base;
    const r = rng(20261015);
    const peso = lista => { let x = r(), acc = 0; for(const it of lista){ acc += it[1]; if(x < acc) return it; } return lista[lista.length - 1]; };
    const sorteia = lista => lista[Math.floor(r() * lista.length)];
    const normal = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    const lim = (x, a, b) => Math.max(a, Math.min(b, x));
    const L = [];
    let id = 0;
    for(let d = 0; d < 300; d++){
      const n = 3 + Math.floor(r() * 3) + (d < 30 ? 2 : d < 90 ? 1 : 0);
      for(let k = 0; k < n; k++){
        const criado = AGORA - (d + r()) * DIA, idade = (AGORA - criado) / DIA;
        const funil = peso(FUNIS), canal = peso(CANAIS), vend = VENDEDORES[Math.floor(r() * VENDEDORES.length)];
        const horasOrc = lim(1 + r() * 10 * (0.5 + vend.resp), 0.5, 48), ciclo = Math.max(1, Math.round((1 + r() * 5) / vend.hab)), respMin = Math.round(lim(vend.resp * 60 * (0.25 + r() * 1.5), 2, 600));
        let nivel = 0;
        if(r() < 0.96) nivel = 1;
        if(nivel === 1 && r() < 0.84) nivel = 2;
        if(nivel === 2 && r() < 0.24 * funil[2]) nivel = 3;
        if(nivel === 3 && r() < Math.min(0.9, 0.38 * vend.hab * canal[2] * (funil[2] > 1 ? 1.3 : 1))) nivel = 4;
        if(nivel >= 3 && idade * 24 < horasOrc) nivel = 2;
        if(nivel === 4 && idade < ciclo) nivel = 3;
        let status = "aberto", motivo = "";
        if(nivel === 4) status = "ganho";
        else if(nivel === 3 && idade > 7 && r() < Math.min(0.85, idade / 20)){ status = "perdido"; motivo = peso(MOTIVOS)[0]; }
        else if(nivel < 3 && idade > 18 && r() < 0.9){ status = "perdido"; motivo = r() < 0.7 ? "Sem retorno do lead" : "Fora do perfil"; }
        const etapa = nivel === 4 ? "Fechado" : nivel === 3 ? (r() < 0.55 ? "Proposta" : "Negociação") : ETAPAS[nivel];
        const pessoa = sorteia(NOMES) + " " + sorteia(SOBRENOMES);
        const crit = {}; CRITERIOS.forEach(([c]) => { crit[c] = Math.round(lim(vend.crit[c] + normal() * 1.3, 0.5, 10) * 10) / 10; });
        L.push({
          id: ++id, criado, idade, funil: funil[0], canal: canal[0], vendedor: vend.nome, nivel, status, motivo, etapa,
          nome: r() < 0.55 ? sorteia(EMPRESAS) + " | " + pessoa : pessoa, pessoa,
          valor: Math.max(390, Math.round(funil[3] * Math.exp(normal() * 0.55) / 10) * 10),
          horasOrc, ciclo, respMin, followups: nivel >= 3 ? Math.round(3 + r() * 12 / vend.hab) : 0,
          parado: status === "aberto" ? Math.min(Math.floor(idade), Math.floor(r() * r() * 22)) : 0,
          previsao: status === "aberto" && nivel >= 2 ? AGORA + (3 + Math.floor(r() * 25)) * DIA : 0,
          crit, nota: Math.round(CRITERIOS.reduce((s, [c]) => s + crit[c], 0) / CRITERIOS.length * 10) / 10,
          conversa: Math.floor(r() * 2)
        });
      }
    }
    return (_base = L);
  }

  // ─── Formatação ───────────────────────────────────────────────────────────
  const virg = x => String(x).replace(".", ",");
  const d1 = x => virg((Math.round(x * 10) / 10).toFixed(1)).replace(/,0$/, "");
  const brl = v => "R$ " + Math.round(v).toLocaleString("pt-BR");
  const mil = v => v >= 1000 ? ["R$ " + virg((v / 1000).toFixed(1)), "mil"] : [brl(v), ""];
  const milTxt = v => mil(v).join(" ").trim();
  const soma = L => L.reduce((s, n) => s + n.valor, 0);
  const media = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const quantil = (a, q) => { if(!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const pctNum = (a, b) => b ? a / b * 100 : 0;
  const delta = (a, b) => { if(b == null || !b) return ""; const x = (a - b) / b * 100; return (x >= 0 ? "+" : "-") + d1(Math.abs(x)) + "%"; };
  const dataBr = ms => new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const dataCurta = ms => new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "short" }).replace(".", "").replace(" de ", " ");
  const horaBr = ms => new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const minTxt = m => m < 60 ? Math.round(m) + " min" : d1(m / 60) + " h";
  const notaCor = n => n >= 8 ? VERDE : n >= 6 ? AMBAR : VERM;
  const iniciais = s => s.split(" ").map(x => x[0]).slice(0, 2).join("");

  // ─── Períodos e filtros ───────────────────────────────────────────────────────
  function periodos(){
    const h = new Date(AGORA);
    const meses = [0, 1, 2].map(k => { const d = new Date(h.getFullYear(), h.getMonth() - k, 1); const m = d.toLocaleDateString("pt-BR", { month: "long" }); return ["m" + k, m[0].toUpperCase() + m.slice(1) + " " + d.getFullYear()]; });
    return [["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"], ["90d", "Últimos 90 dias"]].concat(meses, [["ano", "Ano " + h.getFullYear()]]);
  }
  function faixa(p){
    const h = new Date(AGORA), Y = h.getFullYear(), M = h.getMonth();
    let ini, fim = AGORA + 1;
    if(/^\d+d$/.test(p)) ini = AGORA - parseInt(p, 10) * DIA;
    else if(p[0] === "m"){ const k = +p.slice(1); ini = new Date(Y, M - k, 1).getTime(); fim = Math.min(new Date(Y, M - k + 1, 1).getTime(), fim); }
    else ini = new Date(Y, 0, 1).getTime();
    return { ini, fim, prev: p === "ano" ? null : [ini - (fim - ini), ini] };
  }
  const S = {
    v: { funil: "Funil de vendas", periodo: "30d", status: "", vendedor: "", etapa: "", canal: "" },
    q: { periodo: "30d", vendedor: "", canal: "", lista: "todas", limite: 10, aberta: 0 },
    menu: "", sync: { em: AGORA - 2 * 60000, rodando: false }, steps: null
  };
  const PADRAO = { v: { funil: "Funil de vendas", periodo: "30d", status: "", vendedor: "", etapa: "", canal: "" }, q: { periodo: "30d", vendedor: "", canal: "" } };
  const STATUS = [["", "Todos"], ["aberto", "Em aberto"], ["ganho", "Ganhos"], ["perdido", "Perdidos"]];
  const nomeDe = (ops, v) => (ops.find(o => o[0] === v) || ["", v])[1];

  function filtra(F, ini, fim, ignora){
    return base().filter(n => n.criado >= ini && n.criado < fim
      && (ignora === "funil" || !F.funil || n.funil === F.funil)
      && (ignora === "status" || !F.status || n.status === F.status)
      && (ignora === "vendedor" || !F.vendedor || n.vendedor === F.vendedor)
      && (ignora === "etapa" || !F.etapa || n.etapa === F.etapa)
      && (ignora === "canal" || !F.canal || n.canal === F.canal));
  }
  // conversas avaliadas (Qualidade): todo negócio que teve pelo menos um contato do time
  const canalConversa = n => n.canal === "Instagram" ? "Instagram" : "WhatsApp";
  function filtraQ(F, ini, fim, ignora){
    return base().filter(n => n.nivel >= 1 && n.criado >= ini && n.criado < fim
      && (ignora === "vendedor" || !F.vendedor || n.vendedor === F.vendedor)
      && (ignora === "canal" || !F.canal || canalConversa(n) === F.canal));
  }
  function defsV(){
    return [
      { k: "funil", rot: v => v || "Todos os funis", ops: [["", "Todos os funis"]].concat(FUNIS.map(f => [f[0], f[0]])) },
      { k: "periodo", rot: v => nomeDe(periodos(), v), ops: periodos() },
      { k: "status", rot: v => "Status: " + (v ? nomeDe(STATUS, v).toLowerCase() : "todos"), ops: STATUS },
      { k: "vendedor", rot: v => "Vendedor: " + (v || "todos"), ops: [["", "Todos"]].concat(VENDEDORES.map(x => [x.nome, x.nome])) },
      { k: "etapa", rot: v => "Etapa: " + (v ? v.toLowerCase() : "todas"), ops: [["", "Todas"]].concat(ETAPAS.map(x => [x, x])) }
    ];
  }
  function defsQ(){
    return [
      { k: "periodo", rot: v => nomeDe(periodos(), v), ops: periodos() },
      { k: "vendedor", rot: v => "Vendedor: " + (v || "todos"), ops: [["", "Todos"]].concat(VENDEDORES.map(x => [x.nome, x.nome])) },
      { k: "canal", rot: v => "Canal: " + (v || "todos"), ops: [["", "Todos"], ["WhatsApp", "WhatsApp"], ["Instagram", "Instagram"]] }
    ];
  }
  // quantos itens cada opção do filtro traria, mantendo os outros filtros
  function contagem(escopo, k, val){
    const F = Object.assign({}, S[escopo], { [k]: val }), p = faixa(k === "periodo" ? val : F.periodo);
    return escopo === "v" ? filtra(F, p.ini, p.fim).length : filtraQ(F, p.ini, p.fim).length;
  }
  function chipsHTML(escopo){
    const F = S[escopo], defs = escopo === "v" ? defsV() : defsQ(), pad = PADRAO[escopo];
    const chips = defs.map(d => {
      const aberto = S.menu === escopo + ":" + d.k, mudou = F[d.k] !== pad[d.k];
      const menu = aberto ? `<div data-mvd-menu style="position:absolute;top:calc(100% + 6px);right:0;z-index:30;min-width:220px;max-height:340px;overflow-y:auto;padding:6px;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;box-shadow:0 14px 34px rgba(23,23,26,0.16)">
          ${d.ops.map(([val, rot]) => { const sel = F[d.k] === val; return `<div data-mvd-op="${e(d.k)}" data-mvd-val="${e(val)}" data-mvd-escopo="${escopo}" data-hover style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:8px;font-size:12.5px;cursor:pointer;${sel ? `background:rgba(103,61,230,0.10);color:${ROXO};font-weight:600` : "color:#3C3C44"}">
            <span style="width:14px;display:flex">${sel ? icon(ICONS.check, 13, ROXO) : ""}</span><span style="flex:1;white-space:nowrap">${e(rot)}</span><span style="font-size:11px;color:#9A9AA3">${contagem(escopo, d.k, val)}</span></div>`; }).join("")}
        </div>` : "";
      return `<span style="position:relative">
        <span data-mvd-chip="${e(d.k)}" data-mvd-escopo="${escopo}" style="display:flex;align-items:center;gap:8px;padding:9px 13px;border:1px solid ${mudou || aberto ? "rgba(103,61,230,0.45)" : "#DADADF"};border-radius:20px;font-size:12.5px;color:${mudou ? ROXO : "#3C3C44"};background:${mudou ? "rgba(103,61,230,0.06)" : "#FFFFFF"};cursor:pointer;white-space:nowrap;${mudou ? "font-weight:600" : ""}">${e(d.rot(F[d.k]))} ${icon(aberto ? ICONS.chevUp : ICONS.chevDown, 11, "currentColor")}</span>${menu}</span>`;
    }).join("");
    return `<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">${chips}</div>`;
  }
  function filtrosAtivosHTML(escopo){
    const F = S[escopo], pad = PADRAO[escopo], extra = [];
    if(escopo === "v" && F.canal) extra.push(`<span data-mvd-tira="canal" data-mvd-escopo="v" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:20px;background:rgba(103,61,230,0.10);color:${ROXO};font-size:12px;font-weight:600;cursor:pointer">Canal: ${e(F.canal)} ${icon(ICONS.x, 11, "currentColor")}</span>`);
    const mudou = Object.keys(pad).some(k => F[k] !== pad[k]);
    if(!mudou) return "";
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-8px 0 18px">${extra.join("")}<span data-mvd-limpar="${escopo}" style="font-size:12px;color:${ROXO};cursor:pointer;text-decoration:underline">Limpar filtros</span></div>`;
  }

  // ─── Faixa "Conexão direta com o CRM" (topo das abas) ─────────────────────────────
  function crmHTML(){
    const s = S.sync, B = base(), seg = Math.round((Date.now() - s.em) / 1000);
    const quando = s.rodando ? "sincronizando..." : seg < 60 ? "agora há pouco" : "há " + Math.round(seg / 60) + " min";
    return `<div data-mvd-crm style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 18px;border:1px solid rgba(15,122,104,0.32);border-radius:12px;background:rgba(15,122,104,0.06);margin-bottom:22px">
      <span style="width:38px;height:38px;flex:0 0 38px;border-radius:10px;background:rgba(15,122,104,0.14);display:flex;align-items:center;justify-content:center">${icon(ICONS.connectors, 18, VERDE)}</span>
      <div style="flex:1 1 320px;min-width:0">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
          <strong style="${HEAD};font-size:14.5px;font-weight:600">Conexão direta com o CRM</strong>
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:0.06em;color:${VERDE};border:1px solid rgba(15,122,104,0.35);background:#FFFFFF;padding:2px 9px;border-radius:20px"><span class="mvd-pulso" style="width:6px;height:6px;border-radius:50%;background:${VERDE}"></span>CONECTADO</span>
        </div>
        <div style="font-size:12.5px;color:#3C3C44;line-height:1.55;margin-top:4px">Os dados desta aba vêm do CRM: negócios, etapas, valores, vendedores, canais e motivos de perda são lidos direto da base, e os filtros recortam esses dados na hora.</div>
        <div style="font-size:11.5px;color:${CINZA};margin-top:5px">${B.length.toLocaleString("pt-BR")} negócios · ${FUNIS.length} funis · ${VENDEDORES.length} vendedores · ${CANAIS.length} canais de origem</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-left:auto">
        <div style="text-align:right"><div style="font-size:11px;color:${CINZA}">Última sincronização</div><div style="font-size:12.5px;font-weight:600;color:#17171A">${quando}</div></div>
        <button data-mvd-sync ${s.rodando ? "disabled" : ""} style="display:flex;align-items:center;gap:7px;padding:8px 13px;border:1px solid rgba(15,122,104,0.4);border-radius:9px;background:#FFFFFF;color:${VERDE};font-size:12.5px;font-weight:600;cursor:pointer"><span class="${s.rodando ? "mvd-gira" : ""}" style="display:flex">${icon(ICONS.refresh, 13, "currentColor")}</span>${s.rodando ? "Sincronizando" : "Sincronizar"}</button>
      </div>
    </div>`;
  }

  // ─── Gestão Comercial: cálculo ───────────────────────────────────────────────
  function calcVendas(){
    const F = S.v, p = faixa(F.periodo), L = filtra(F, p.ini, p.fim), P = p.prev ? filtra(F, p.prev[0], p.prev[1]) : null;
    const ganhos = L.filter(n => n.status === "ganho"), orc = L.filter(n => n.nivel >= 3);
    const gP = P && P.filter(n => n.status === "ganho");
    const steps = PASSOS.map((nome, i) => { const q = L.filter(n => n.nivel >= i); return { name: nome, count: q.length, value: milTxt(soma(q)), win: i === 4 }; });
    let pior = 1;
    for(let j = 1; j < steps.length - 1; j++){ if(steps[j + 1].count / (steps[j].count || 1) < steps[pior + 1].count / (steps[pior].count || 1)) pior = j; }
    const vazou = steps[pior].count - steps[pior + 1].count;
    const paradoOrc = orc.filter(n => n.status === "aberto");
    const valoresOrc = orc.map(n => n.valor), valoresG = ganhos.map(n => n.valor);
    const perdOrc = orc.filter(n => n.status === "perdido");
    const motivos = MOTIVOS.map(([m]) => { const c = perdOrc.filter(n => n.motivo === m).length; return { name: m, count: c, pct: Math.round(pctNum(c, perdOrc.length)) }; }).filter(x => x.count).sort((a, b) => b.count - a.count);
    const notas = L.filter(n => n.nivel >= 1).map(n => n.nota), notasP = P ? P.filter(n => n.nivel >= 1).map(n => n.nota) : [];
    const abertos = L.filter(n => n.status === "aberto" && n.nivel >= 2).sort((a, b) => b.valor - a.valor);
    const conv = pctNum(ganhos.length, L.length), convP = P ? pctNum(gP.length, P.length) : null;
    const canais = CANAIS.map(([c]) => { const q = L.filter(n => n.canal === c), g = q.filter(n => n.status === "ganho"), o = q.filter(n => n.nivel >= 3); return { name: c, leads: q.length, quoted: o.length, closed: g.length, sold: g.length ? brl(soma(g)) : "", quotedValue: o.length ? brl(soma(o)) : "" }; }).sort((a, b) => b.leads - a.leads);
    return {
      L, ganhos, orc, steps, pior, vazou, paradoOrc, motivos, abertos, canais,
      kpis: [
        { label: "Novos leads", value: L.length.toLocaleString("pt-BR"), delta: P ? delta(L.length, P.length) : "", note: P ? "vs. período anterior" : "no período" },
        { label: "Taxa de conversão", value: d1(conv), unit: "%", delta: P ? delta(conv, convP) : "", note: `${ganhos.length} ${ganhos.length === 1 ? "venda" : "vendas"} entre os ${L.length} leads que entraram` },
        { label: "Faturamento", value: brl(soma(ganhos)), delta: P ? delta(soma(ganhos), soma(gP)) : "", note: "somando a proposta de cada venda confirmada" },
        { label: "Ticket médio vendido", value: brl(media(valoresG)), delta: P && gP.length ? delta(media(valoresG), media(gP.map(n => n.valor))) : "", note: "mediana " + brl(quantil(valoresG, 0.5)) },
        { label: "Nota do atendimento", value: d1(media(notas)), unit: "/10", delta: P && notasP.length ? delta(media(notas), media(notasP)) : "", note: `média de ${notas.length} conversas avaliadas, de 0 a 10` }
      ],
      stats: [
        { label: "Parado sem fechar", value: mil(soma(paradoOrc))[0], unit: mil(soma(paradoOrc))[1], note: "receberam preço e não sinalizaram fechar" },
        { label: "Ticket mediano", value: brl(quantil(valoresOrc, 0.5)), note: "10% passam de " + brl(quantil(valoresOrc, 0.9)) },
        { label: "Até o orçamento", value: d1(media(orc.map(n => n.horasOrc))), unit: "h", note: "do 1º contato até sair um valor" },
        { label: "Até o fechamento", value: d1(media(ganhos.map(n => n.ciclo))), unit: "d", note: "do 1º contato ao sinal do cliente" },
        { label: "Maior gargalo", value: String(vazou), unit: "conversas", note: `saem entre ${steps[pior].name} e ${steps[pior + 1].name}` },
        { label: "Fecha do topo", value: d1(conv), unit: "%", note: `${orc.length} orçamentos para ${ganhos.length} clientes` }
      ],
      speed: [
        { value: d1(quantil(ganhos.map(n => n.ciclo), 0.5)), unit: "d", label: "ciclo de venda", note: "média " + d1(media(ganhos.map(n => n.ciclo))) + " d" },
        { value: d1(media(orc.map(n => n.followups))), unit: "", label: "follow-ups por orçamento", note: "falas depois da proposta" }
      ],
      loss: { rate: Math.round(pctNum(perdOrc.length, orc.length)) + "%", rateNote: `${perdOrc.length} de ${orc.length} orçamentos` },
      risco: abertos.filter(n => n.nivel >= 3 && n.parado >= 5).slice(0, 6)
    };
  }
  // Mantém o resto da Central (ex.: "Sinais dos motores" na Home) coerente com o recorte padrão
  function sincronizaDATA(){
    if(typeof DATA === "undefined") return;
    const salva = S.v; S.v = Object.assign({}, PADRAO.v);
    const c = calcVendas(); S.v = salva;
    DATA.salesSteps = c.steps; DATA.salesFunnelStats = c.stats; DATA.salesKpis = c.kpis;
    DATA.salesLoss = Object.assign({}, DATA.salesLoss, { reasons: c.motivos.length ? c.motivos : DATA.salesLoss.reasons });
  }

  // ─── Gestão Comercial: telas ─────────────────────────────────────────────────
  function topoV(){
    const c = calcVendas(); S.steps = c.steps;
    const pct = Math.round(pctNum(c.vazou, c.steps[c.pior].count));
    const onde = c.L.length ? `<strong style="color:#17171A">Onde agir:</strong> maior vazamento do funil entre <strong>${e(c.steps[c.pior].name)} → ${e(c.steps[c.pior + 1].name)}</strong> (${pct}% saem). <strong>${e(milTxt(soma(c.paradoOrc)))}</strong> parados sem fechar.${c.motivos.length ? ` Motivo de perda nº 1: <strong>${e(c.motivos[0].name)}</strong>.` : ""}`
      : `<strong style="color:#17171A">Nenhum negócio</strong> com esses filtros no CRM. Mude o período ou limpe os filtros.`;
    return `<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;margin-bottom:20px">
        <div style="flex:1;min-width:220px">
          <h1 style="${HEAD};font-size:24px;font-weight:600;margin:0 0 5px">Dashboard</h1>
          <p style="margin:0;color:${CINZA};font-size:13px">Visão geral dos seus indicadores comerciais · ${c.L.length.toLocaleString("pt-BR")} negócios no recorte</p>
        </div>
        ${chipsHTML("v")}
      </div>
      ${filtrosAtivosHTML("v")}
      <div style="display:flex;gap:12px;align-items:flex-start;padding:15px 18px;border:1px solid rgba(103,61,230,0.24);border-radius:12px;background:rgba(103,61,230,0.05);margin-bottom:20px">
        ${icon(ICONS.bolt, 15, "none", ROXO)}
        <span style="font-size:13.5px;color:#3C3C44;line-height:1.6">${onde}</span>
      </div>`;
  }
  function corpoV(){
    const c = calcVendas();
    if(!c.L.length) return `<div style="padding:50px 20px;text-align:center;border:1px dashed #DADADF;border-radius:14px;color:${CINZA};font-size:13.5px">Nenhum negócio do CRM bate com esses filtros. <span data-mvd-limpar="v" style="color:${ROXO};cursor:pointer;text-decoration:underline">Limpar filtros</span></div>`;
    const linhaNeg = (n, cols) => `<div data-mvd-negocio="${n.id}" data-hover style="display:grid;grid-template-columns:${cols};gap:12px;min-width:760px;padding:13px 20px;border-bottom:1px solid #F1F1F3;align-items:center;font-size:13px;cursor:pointer">`;
    const pipeAbertos = c.abertos;
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;margin-bottom:18px">${c.kpis.map(mvKpiHTML).join("")}</div>

      ${mvCard(null, "Funil de vendas", "O caminho do lead que entrou no período. Cada faixa mostra <strong>quantas conversas</strong>, <strong>quanto há em orçamento</strong> nelas e quanto sobrou do topo. Passe o mouse para ver o que ficou pelo caminho de uma etapa para a outra.", `
        <div style="display:flex;flex-wrap:wrap;gap:0">
          <div style="flex:1 1 440px;min-width:0;padding-right:24px">${mvFunilHTML(c.steps).replace("data-mv-funil", "data-mvd-funil")}</div>
          <div style="flex:1 1 440px;min-width:0;padding-left:24px;border-left:1px solid #E6E6EA;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-content:start">${c.stats.map(mvMiniHTML).join("")}</div>
        </div>`)}

      ${mvCard(null, "Do lead à venda", "Os leads que entraram no período, degrau por degrau. A porcentagem entre os degraus é quanto passou do anterior: é ali que a venda vaza.", `
        <div style="display:flex;align-items:stretch;gap:0;overflow-x:auto;padding-bottom:4px">
          ${c.steps.map((st, i, arr) => {
            const total = arr[0].count || 1, prev = i ? arr[i - 1].count : null, passo = prev ? Math.round(st.count / (prev || 1) * 1000) / 10 : null;
            return `${i ? `<span style="flex:0 0 auto;display:flex;align-items:center;gap:4px;padding:0 10px;font-size:12px;font-weight:600;color:${passo < 40 ? VERM : CINZA}">${virg(passo)}% ${icon(ICONS.chevRight, 11, "currentColor")}</span>` : ""}
            <div style="flex:1;min-width:150px;padding:16px 18px;border-radius:12px;border-left:3px solid ${st.win ? VERDE : ROXO};background:${st.win ? "rgba(15,122,104,0.08)" : "rgba(103,61,230,0.06)"}">
              <div style="${HEAD};font-size:24px;font-weight:600;color:${st.win ? VERDE : "#4B23B8"};line-height:1.1">${st.count}</div>
              <div style="font-size:12.5px;font-weight:600;margin-top:4px">${e(st.name)}</div>
              ${i ? `<div style="font-size:11.5px;color:${CINZA};margin-top:3px">${virg(Math.round(st.count / total * 1000) / 10)}% do total</div>` : ""}
            </div>`;
          }).join("")}
        </div>`)}

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-bottom:18px">
        ${mvCard(null, "Velocidade e esforço", "Quanto tempo leva para fechar e quantas vezes o time precisa voltar.", `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">${c.speed.map(x => mvMiniHTML(Object.assign({ big: true }, x))).join("")}</div>`, true)}
        ${mvCard(null, "Por que não fecha", "Orçamento que esfriou ou cliente que sumiu depois do preço. O motivo vem do campo de perda do CRM.", `
          <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start">
            <div style="flex:0 0 170px">${mvMiniHTML({ label: "taxa de perda", value: c.loss.rate, note: c.loss.rateNote, big: true, tone: "bad" })}</div>
            <div style="flex:1 1 240px;display:flex;flex-direction:column;gap:10px">
              ${c.motivos.length ? c.motivos.map(r => `<div>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px"><span style="flex:1;font-size:13px">${e(r.name)}</span><span style="font-size:12px;color:${CINZA}">${r.count} (${r.pct}%)</span></div>
                <span style="display:block;height:6px;border-radius:6px;background:rgba(103,61,230,0.10);overflow:hidden"><span style="display:block;height:100%;width:${r.pct}%;background:#C2378F;border-radius:6px"></span></span>
              </div>`).join("") : `<div style="font-size:12.5px;color:${CINZA}">Nenhum orçamento perdido neste recorte.</div>`}
            </div>
          </div>`, true)}
      </div>

      <div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;margin-bottom:18px;overflow-x:auto">
        <div style="padding:16px 20px 4px;min-width:760px">
          <div style="display:flex;align-items:center;gap:10px">${icon(ICONS.bars, 15, ROXO)}<strong style="${HEAD};font-size:14.5px;font-weight:600">Desempenho por canal</strong></div>
          <p style="margin:4px 0 10px;font-size:12px;color:${CINZA}">Do lead até a venda, por origem. Clique num canal para filtrar o painel inteiro por ele.</p>
        </div>
        <div style="display:grid;grid-template-columns:1.8fr 0.8fr 1fr 1fr 1.1fr 1.1fr;gap:12px;min-width:760px;padding:10px 20px;border-bottom:1px solid #E6E6EA;font-size:10.5px;letter-spacing:0.1em;color:${CINZA};font-weight:700">
          <span>CANAL</span><span style="text-align:right">LEADS</span><span style="text-align:right">ORÇADOS</span><span style="text-align:right">FECHADOS</span><span style="text-align:right">VALOR VENDIDO</span><span style="text-align:right">VALOR ORÇADO</span>
        </div>
        ${c.canais.filter(x => x.leads).map(x => {
          const pq = x.leads ? Math.round(x.quoted / x.leads * 1000) / 10 : 0, pf = x.quoted ? Math.round(x.closed / x.quoted * 100) : 0, sel = S.v.canal === x.name;
          return `<div data-mvd-canal="${e(x.name)}" data-hover title="${sel ? "Clique para tirar o filtro" : "Filtrar por " + e(x.name)}" style="display:grid;grid-template-columns:1.8fr 0.8fr 1fr 1fr 1.1fr 1.1fr;gap:12px;min-width:760px;padding:13px 20px;border-bottom:1px solid #F1F1F3;align-items:center;font-size:13px;cursor:pointer;${sel ? "background:rgba(103,61,230,0.07)" : ""}">
            <span style="display:flex;align-items:center;gap:8px;${sel ? `color:${ROXO};font-weight:600` : ""}">${sel ? icon(ICONS.check, 13, ROXO) : ""}${e(x.name)}</span>
            <span style="text-align:right">${x.leads}</span>
            <span style="text-align:right">${x.quoted} <span style="color:${CINZA};font-size:12px">(${virg(pq)}%)</span></span>
            <span style="text-align:right">${x.closed} <span style="color:${CINZA};font-size:12px">(${pf}%)</span></span>
            <span style="text-align:right;${x.sold ? "font-weight:600" : "color:#B4B4BC"}">${x.sold || "—"}</span>
            <span style="text-align:right;${x.quotedValue ? "" : "color:#B4B4BC"}">${x.quotedValue || "—"}</span>
          </div>`;
        }).join("")}
      </div>

      ${mvCard(ICONS.warn, "Oportunidades em risco", "Negócios com valor na mesa e sem movimento há 5 dias ou mais. Clique para ver o negócio.", c.risco.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:10px">
          ${c.risco.map(r => `
            <div data-mvd-negocio="${r.id}" data-hover-border style="display:flex;align-items:center;gap:12px;padding:11px 13px;border:1px solid rgba(103,61,230,0.16);border-radius:10px;background:rgba(103,61,230,0.04);cursor:pointer">
              <span style="flex:1;min-width:0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(r.nome)}</span>
              <span style="font-size:11.5px;color:${ROXO}">parado ${r.parado} dias</span>
              <span style="font-size:12px;font-weight:600">${brl(r.valor)}</span>
            </div>`).join("")}
        </div>` : `<div style="font-size:12.5px;color:${CINZA}">Nenhum negócio parado neste recorte.</div>`)}

      <div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;overflow-x:auto">
        <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #E6E6EA;min-width:760px">
          ${icon(ICONS.bars, 15, ROXO)}
          <strong style="${HEAD};font-size:14.5px;font-weight:600">Maior valor em aberto</strong>
          <span style="margin-left:auto;font-size:12.5px;color:${CINZA}"><strong style="color:#17171A;${HEAD};font-size:15px">${brl(soma(pipeAbertos))}</strong> em ${pipeAbertos.length} negócios de pé</span>
        </div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:12px;min-width:760px;padding:12px 20px;border-bottom:1px solid #E6E6EA;font-size:11.5px;color:${CINZA}">
          <span>Oportunidade</span><span>Vendedor</span><span>Etapa</span><span style="text-align:right">Valor</span><span style="text-align:right">Previsão</span>
        </div>
        ${pipeAbertos.length ? pipeAbertos.slice(0, 8).map(o => `${linhaNeg(o, "2fr 1fr 1fr 1fr 1fr")}
            <span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(o.nome)}</span>
            <span data-mvd-vend="${e(o.vendedor)}" title="Filtrar por ${e(o.vendedor)}" style="color:${CINZA};text-decoration:underline dotted;text-underline-offset:3px">${e(o.vendedor)}</span>
            <span style="color:#3C3C44">${e(o.etapa)}</span>
            <span style="text-align:right;font-weight:600;color:${ROXO}">${brl(o.valor)}</span>
            <span style="text-align:right;color:${CINZA}">${o.previsao ? dataCurta(o.previsao) : "—"}</span>
          </div>`).join("") : `<div style="padding:16px 20px;font-size:12.5px;color:${CINZA}">Nenhum negócio em aberto neste recorte.</div>`}
      </div>`;
  }

  // Ficha do negócio (abre ao clicar numa oportunidade)
  function abrirNegocio(id){
    const n = base().find(x => x.id === +id); if(!n) return;
    fecharNegocio();
    const st = { ganho: ["Ganho", VERDE], perdido: ["Perdido", VERM], aberto: ["Em aberto", ROXO] }[n.status];
    const ev = [[n.criado, "Lead entrou", `Origem: ${n.canal} · ${n.funil}`]];
    if(n.nivel >= 1) ev.push([n.criado + n.respMin * 60000, "Primeiro contato", `${n.vendedor.split(" ")[0]} respondeu em ${minTxt(n.respMin)}`]);
    if(n.nivel >= 2) ev.push([n.criado + Math.min(n.horasOrc * 0.5, 6) * HORA, "Qualificado", "Dor, prazo e orçamento registrados no CRM"]);
    if(n.nivel >= 3) ev.push([n.criado + n.horasOrc * HORA, "Proposta enviada", `${brl(n.valor)} · ${n.followups} follow-ups depois`]);
    if(n.status === "ganho") ev.push([n.criado + n.ciclo * DIA, "Venda fechada", `Ciclo de ${n.ciclo} ${n.ciclo === 1 ? "dia" : "dias"}`]);
    if(n.status === "perdido") ev.push([Math.min(AGORA, n.criado + 18 * DIA), "Marcado como perdido", n.motivo]);
    const proximo = n.status === "ganho" ? "Venda fechada. Próximo passo: onboarding e pedido de indicação em 30 dias."
      : n.status === "perdido" ? `Perdido por "${n.motivo.toLowerCase()}". Entra na lista de reativação em 60 dias.`
      : n.parado >= 5 ? `Parado há ${n.parado} dias. Retomar hoje com uma pergunta direta: "Ficou alguma dúvida sobre a proposta que eu possa resolver agora?"`
      : n.nivel >= 3 ? "Proposta quente. Combinar data de decisão e mandar o contrato assim que o cliente sinalizar."
      : "Ainda sem proposta. Completar o diagnóstico (dor, prazo e orçamento) e enviar valor em até 24h.";
    const campo = (k, v) => `<div style="padding:10px 12px;border-radius:10px;background:#F7F7F8;border:1px solid #EEEEF1"><div style="font-size:10.5px;letter-spacing:0.1em;font-weight:700;color:${CINZA}">${k}</div><div style="font-size:13px;font-weight:600;margin-top:3px">${v}</div></div>`;
    const m = document.createElement("div");
    m.setAttribute("data-mvd-modal", "");
    m.style.cssText = "position:fixed;inset:0;z-index:1000;background:rgba(23,23,26,0.45);display:flex;align-items:center;justify-content:center;padding:16px";
    m.innerHTML = `<div data-mvd-modal-box style="width:100%;max-width:560px;max-height:calc(100vh - 32px);overflow-y:auto;background:#FFFFFF;border-radius:16px;box-shadow:0 24px 60px rgba(23,23,26,0.3);padding:22px 24px;color:#17171A;font-family:inherit">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:${CINZA};margin-bottom:4px">Negócio #${n.id} · CRM</div>
          <div style="${HEAD};font-size:18px;font-weight:600;line-height:1.3">${e(n.nome)}</div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${st[1]};border:1px solid ${st[1]}55;background:${st[1]}12;padding:3px 10px;border-radius:20px;white-space:nowrap">${st[0]}</span>
        <span data-mvd-fechar style="cursor:pointer;padding:2px;display:flex">${icon(ICONS.x, 18, CINZA)}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:18px">
        ${campo("VALOR", brl(n.valor))}${campo("ETAPA", e(n.etapa))}${campo("VENDEDOR", e(n.vendedor))}
        ${campo("CANAL", e(n.canal))}${campo("NOTA DO ATENDIMENTO", `<span style="color:${notaCor(n.nota)}">${d1(n.nota)}/10</span>`)}${campo(n.previsao ? "PREVISÃO" : "ENTROU EM", n.previsao ? dataCurta(n.previsao) : dataBr(n.criado))}
      </div>
      <div style="font-size:10.5px;letter-spacing:0.12em;font-weight:700;color:${CINZA};margin-bottom:10px">LINHA DO TEMPO</div>
      <div style="display:flex;flex-direction:column;gap:0;margin-bottom:16px">
        ${ev.map((x, i) => `<div style="display:flex;gap:12px">
          <div style="display:flex;flex-direction:column;align-items:center"><span style="width:10px;height:10px;border-radius:50%;margin-top:4px;background:${i === ev.length - 1 ? ROXO : "#C9BCF5"}"></span>${i < ev.length - 1 ? `<span style="flex:1;width:2px;background:#E6E1FA;margin:3px 0"></span>` : ""}</div>
          <div style="padding-bottom:12px"><div style="font-size:13px;font-weight:600">${x[1]} <span style="font-weight:400;color:${CINZA};font-size:12px">· ${dataBr(x[0])} ${horaBr(x[0])}</span></div><div style="font-size:12px;color:#3C3C44;margin-top:2px">${e(x[2])}</div></div>
        </div>`).join("")}
      </div>
      <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:11px;background:rgba(103,61,230,0.06);border:1px solid rgba(103,61,230,0.18);margin-bottom:16px">
        ${icon(ICONS.sparkle, 15, ROXO)}<div style="font-size:12.5px;line-height:1.55;color:#3C3C44"><strong style="color:#17171A">Próximo passo sugerido:</strong> ${e(proximo)}</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
        <span data-mvd-vend="${e(n.vendedor)}" data-mvd-fechar style="padding:9px 14px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;cursor:pointer">Ver só negócios de ${e(n.vendedor.split(" ")[0])}</span>
        <span data-mvd-fechar data-hover-dark style="padding:9px 16px;border-radius:9px;background:${ROXO};color:#FFFFFF;font-size:12.5px;font-weight:700;cursor:pointer">Fechar</span>
      </div>
    </div>`;
    document.body.appendChild(m);
  }
  function fecharNegocio(){ document.querySelectorAll("[data-mvd-modal]").forEach(x => x.remove()); }

  // ─── Qualidade ────────────────────────────────────────────────────────────
  function calcQ(){
    const F = S.q, p = faixa(F.periodo), L = filtraQ(F, p.ini, p.fim), P = p.prev ? filtraQ(F, p.prev[0], p.prev[1]) : null;
    const crit = CRITERIOS.map(([k, nome, desc]) => ({ k, nome, desc, nota: media(L.map(n => n.crit[k])) }));
    const erros = Object.keys(ERROS).map(k => ({ k, nome: ERROS[k], q: L.filter(n => n.crit[k] < 5).length })).filter(x => x.q).sort((a, b) => b.q - a.q);
    const time = VENDEDORES.map(v => {
      const q = L.filter(n => n.vendedor === v.nome); if(!q.length) return null;
      const cs = CRITERIOS.map(([k, nome]) => [nome, media(q.map(n => n.crit[k]))]).sort((a, b) => b[1] - a[1]);
      return { nome: v.nome, nota: media(q.map(n => n.nota)), q: q.length, resp: quantil(q.map(n => n.respMin), 0.5), forte: cs[0][0], fraco: cs[cs.length - 1][0] };
    }).filter(Boolean).sort((a, b) => b.nota - a.nota);
    return { L, P, crit, erros, time };
  }
  function topoQ(){
    return `<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;margin-bottom:20px">
        <div style="flex:1;min-width:240px">
          <h1 style="${HEAD};font-size:24px;font-weight:600;margin:0 0 5px">Qualidade do atendimento</h1>
          <p style="margin:0;color:${CINZA};font-size:13px;max-width:620px;line-height:1.55">O ZEUS lê as conversas ligadas a cada negócio do CRM e dá nota de 0 a 10 em 7 critérios de venda consultiva. Clique num vendedor ou numa conversa para ver os detalhes.</p>
        </div>
        ${chipsHTML("q")}
      </div>
      ${filtrosAtivosHTML("q")}`;
  }
  function conversaHTML(n){
    const tom = n.nota >= 8 ? "bom" : n.nota >= 6 ? "medio" : "ruim";
    const msgs = CONVERSAS[tom][n.conversa % CONVERSAS[tom].length];
    const vend = n.vendedor.split(" ")[0], lead = n.pessoa.split(" ")[0];
    const sub = s => s.replace(/\{lead\}/g, lead).replace(/\{vend\}/g, vend).replace(/\{canal\}/g, n.canal).replace(/\{valor\}/g, brl(n.valor));
    const ini = n.criado;
    const cs = CRITERIOS.map(([k, nome]) => [k, nome, n.crit[k]]).sort((a, b) => b[2] - a[2]);
    const bem = cs.slice(0, 2), falta = cs.slice(-2).reverse();
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;padding:4px 20px 18px">
      <div style="border:1px solid #EEEEF1;border-radius:12px;background:#F7F7F8;padding:14px;display:flex;flex-direction:column;gap:8px">
        <div style="font-size:10.5px;letter-spacing:0.12em;font-weight:700;color:${CINZA};margin-bottom:2px">TRECHO DA CONVERSA · ${e(canalConversa(n).toUpperCase())}</div>
        ${msgs.map(([q, t, min]) => `<div style="display:flex;${q === "v" ? "justify-content:flex-end" : ""}">
          <div style="max-width:85%;padding:8px 11px;border-radius:12px;font-size:12.5px;line-height:1.45;${q === "v" ? "background:#E6DEFC;border-bottom-right-radius:4px" : "background:#FFFFFF;border:1px solid #E6E6EA;border-bottom-left-radius:4px"}">
            <div style="font-size:10.5px;font-weight:700;color:${q === "v" ? ROXO : CINZA};margin-bottom:2px">${q === "v" ? e(vend) : e(lead)} · ${horaBr(ini + min * 60000)}${min >= 1440 ? " (" + Math.floor(min / 1440) + "d depois)" : ""}</div>${e(sub(t))}</div>
        </div>`).join("")}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px">
          ${cs.map(([k, nome, v]) => `<div title="${e(nome)}" style="padding:7px 9px;border-radius:9px;border:1px solid #EEEEF1"><div style="font-size:10.5px;color:${CINZA};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(nome)}</div><div style="${HEAD};font-size:15px;font-weight:600;color:${notaCor(v)}">${d1(v)}</div></div>`).join("")}
        </div>
        <div style="padding:11px 13px;border-radius:11px;background:rgba(15,122,104,0.06);border:1px solid rgba(15,122,104,0.22);font-size:12.5px;line-height:1.5"><strong style="color:${VERDE}">O que foi bem:</strong> ${bem.map(x => e(x[1].toLowerCase())).join(" e ")}.</div>
        <div style="padding:11px 13px;border-radius:11px;background:rgba(192,52,28,0.05);border:1px solid rgba(192,52,28,0.22);font-size:12.5px;line-height:1.5"><strong style="color:${VERM}">O que faltou:</strong> ${falta.map(x => e(x[1].toLowerCase())).join(" e ")}.</div>
        <div style="padding:11px 13px;border-radius:11px;background:rgba(103,61,230,0.06);border:1px solid rgba(103,61,230,0.2);font-size:12.5px;line-height:1.5"><strong style="color:${ROXO}">Como melhorar:</strong> ${e(sub(DICAS[falta[0][0]]))}</div>
      </div>
    </div>`;
  }
  function corpoQ(){
    const c = calcQ(), F = S.q;
    if(!c.L.length) return `<div style="padding:50px 20px;text-align:center;border:1px dashed #DADADF;border-radius:14px;color:${CINZA};font-size:13.5px">Nenhuma conversa avaliada com esses filtros. <span data-mvd-limpar="q" style="color:${ROXO};cursor:pointer;text-decoration:underline">Limpar filtros</span></div>`;
    const nota = media(c.L.map(n => n.nota)), notaP = c.P && c.P.length ? media(c.P.map(n => n.nota)) : null;
    const comPasso = c.L.filter(n => n.crit.fechamento >= 6).length, criticas = c.L.filter(n => n.nota < 5).length;
    const kpis = [
      { label: "Nota média", value: d1(nota), unit: "/10", delta: notaP ? delta(nota, notaP) : "", note: "vs. período anterior" },
      { label: "Conversas avaliadas", value: c.L.length.toLocaleString("pt-BR"), delta: c.P ? delta(c.L.length, c.P.length) : "", note: "lidas pelo ZEUS" },
      { label: "1ª resposta", value: minTxt(quantil(c.L.map(n => n.respMin), 0.5)), note: "mediana do tempo até o time responder" },
      { label: "Com próximo passo", value: String(Math.round(pctNum(comPasso, c.L.length))), unit: "%", note: "conversas que terminaram com data marcada" },
      { label: "Alertas", value: String(criticas), tone: criticas ? "warn" : "", note: "conversas com nota abaixo de 5" }
    ];
    const barra = (v, max, cor) => `<span style="flex:1;height:8px;border-radius:6px;background:#F0F0F3;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(2, v / max * 100)}%;background:${cor};border-radius:6px"></span></span>`;
    const maxErro = Math.max(1, ...c.erros.map(x => x.q));
    let lista = c.L.slice().sort((a, b) => b.criado - a.criado);
    if(F.lista === "baixas") lista = lista.filter(n => n.nota < 6);
    if(F.lista === "altas") lista = lista.filter(n => n.nota >= 8);
    const aba = (k, rot, q) => `<span data-mvq-lista="${k}" style="padding:7px 13px;border-radius:8px;font-size:12.5px;cursor:pointer;${F.lista === k ? `background:#FFFFFF;border:1px solid #E6E6EA;font-weight:600;color:#17171A` : `color:${CINZA};border:1px solid transparent`}">${rot} <span style="color:#9A9AA3;font-weight:400">${q}</span></span>`;
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:18px">${kpis.map(mvKpiHTML).join("")}</div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px;margin-bottom:18px">
        ${mvCard(ICONS.star, "Nota por critério", "Média do recorte em cada etapa da conversa de venda. Abaixo de 6 é onde o time mais perde venda.", `
          <div style="display:flex;flex-direction:column;gap:11px">
            ${c.crit.map(x => `<div title="${e(x.desc)}" style="display:flex;align-items:center;gap:12px;font-size:12.5px">
              <span style="width:170px;flex:0 0 170px;color:#3C3C44">${e(x.nome)}</span>${barra(x.nota, 10, notaCor(x.nota))}
              <strong style="width:30px;text-align:right;${HEAD};color:${notaCor(x.nota)}">${d1(x.nota)}</strong></div>`).join("")}
          </div>`, true)}
        ${mvCard(ICONS.warn, "Erros mais comuns", "Quantas conversas do recorte tiveram cada erro (critério com nota abaixo de 5).", c.erros.length ? `
          <div style="display:flex;flex-direction:column;gap:11px">
            ${c.erros.map(x => `<div style="display:flex;align-items:center;gap:12px;font-size:12.5px">
              <span style="width:220px;flex:0 0 220px;color:#3C3C44">${e(x.nome)}</span>${barra(x.q, maxErro, "#C2378F")}
              <strong style="width:30px;text-align:right;${HEAD}">${x.q}</strong></div>`).join("")}
          </div>` : `<div style="font-size:12.5px;color:${CINZA}">Nenhum erro grave neste recorte.</div>`, true)}
      </div>

      <div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;margin-bottom:18px;overflow-x:auto">
        <div style="padding:16px 20px 4px;min-width:760px">
          <div style="display:flex;align-items:center;gap:10px">${icon(ICONS.users, 15, ROXO)}<strong style="${HEAD};font-size:14.5px;font-weight:600">Ranking do time</strong></div>
          <p style="margin:4px 0 10px;font-size:12px;color:${CINZA}">Clique num vendedor para ver só as conversas dele.</p>
        </div>
        <div style="display:grid;grid-template-columns:1.6fr 0.7fr 0.8fr 0.9fr 1.4fr 1.4fr;gap:12px;min-width:760px;padding:10px 20px;border-bottom:1px solid #E6E6EA;font-size:10.5px;letter-spacing:0.1em;color:${CINZA};font-weight:700">
          <span>VENDEDOR</span><span style="text-align:right">NOTA</span><span style="text-align:right">CONVERSAS</span><span style="text-align:right">1ª RESPOSTA</span><span>PONTO FORTE</span><span>PONTO A MELHORAR</span>
        </div>
        ${c.time.map((t, i) => { const sel = F.vendedor === t.nome; return `<div data-mvq-vend="${e(t.nome)}" data-hover style="display:grid;grid-template-columns:1.6fr 0.7fr 0.8fr 0.9fr 1.4fr 1.4fr;gap:12px;min-width:760px;padding:12px 20px;border-bottom:1px solid #F1F1F3;align-items:center;font-size:13px;cursor:pointer;${sel ? "background:rgba(103,61,230,0.07)" : ""}">
          <span style="display:flex;align-items:center;gap:10px"><span style="width:30px;height:30px;border-radius:50%;background:rgba(103,61,230,0.12);color:${ROXO};font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${e(iniciais(t.nome))}</span><span style="${sel ? `color:${ROXO};font-weight:600` : ""}">${i === 0 && c.time.length > 1 ? "🏆 " : ""}${e(t.nome)}</span></span>
          <strong style="text-align:right;${HEAD};font-size:15px;color:${notaCor(t.nota)}">${d1(t.nota)}</strong>
          <span style="text-align:right">${t.q}</span>
          <span style="text-align:right;color:${t.resp > 60 ? VERM : "#3C3C44"}">${minTxt(t.resp)}</span>
          <span style="color:${VERDE};font-size:12.5px">${e(t.forte)}</span>
          <span style="color:${VERM};font-size:12.5px">${e(t.fraco)}</span>
        </div>`; }).join("")}
      </div>

      <div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 20px;border-bottom:1px solid #E6E6EA">
          ${icon(ICONS.chatBubble, 15, ROXO)}<strong style="${HEAD};font-size:14.5px;font-weight:600">Conversas avaliadas</strong>
          <span style="flex:1"></span>
          <div style="display:flex;gap:3px;background:#F2F2F4;border-radius:10px;padding:3px">
            ${aba("todas", "Todas", c.L.length)}${aba("baixas", "Notas baixas", c.L.filter(n => n.nota < 6).length)}${aba("altas", "Notas altas", c.L.filter(n => n.nota >= 8).length)}
          </div>
        </div>
        ${lista.slice(0, F.limite).map(n => { const ab = F.aberta === n.id; return `<div style="border-bottom:1px solid #F1F1F3;${ab ? "background:#FCFBFF" : ""}">
          <div data-mvq-abrir="${n.id}" data-hover style="display:flex;align-items:center;gap:14px;padding:13px 20px;cursor:pointer;flex-wrap:wrap">
            <span style="width:44px;height:44px;flex:0 0 44px;border-radius:12px;display:flex;align-items:center;justify-content:center;${HEAD};font-size:16px;font-weight:600;color:${notaCor(n.nota)};background:${notaCor(n.nota)}14;border:1px solid ${notaCor(n.nota)}40">${d1(n.nota)}</span>
            <div style="flex:1 1 260px;min-width:0">
              <div style="font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(n.nome)}</div>
              <div style="font-size:12px;color:${CINZA};margin-top:2px">${e(n.vendedor)} · ${e(canalConversa(n))} · ${dataBr(n.criado)} · 1ª resposta em ${minTxt(n.respMin)}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${CRITERIOS.filter(([k]) => n.crit[k] < 5).slice(0, 2).map(([k]) => `<span style="font-size:11px;padding:3px 9px;border-radius:20px;background:rgba(192,52,28,0.07);color:${VERM}">${e(ERROS[k])}</span>`).join("") || `<span style="font-size:11px;padding:3px 9px;border-radius:20px;background:rgba(15,122,104,0.08);color:${VERDE}">Sem erros graves</span>`}</div>
            ${icon(ab ? ICONS.chevUp : ICONS.chevDown, 14, CINZA)}
          </div>
          ${ab ? conversaHTML(n) : ""}
        </div>`; }).join("") || `<div style="padding:18px 20px;font-size:12.5px;color:${CINZA}">Nenhuma conversa nesta lista.</div>`}
        ${lista.length > F.limite ? `<div style="padding:12px 20px;text-align:center"><span data-mvq-mais style="font-size:12.5px;color:${ROXO};font-weight:600;cursor:pointer">Ver mais ${Math.min(10, lista.length - F.limite)} de ${lista.length - F.limite} restantes</span></div>` : ""}
      </div>`;
  }

  // ─── Encaixe nas telas ─────────────────────────────────────────────────────
  const CSS = `<style>@keyframes mvdPulso{0%,100%{opacity:1}50%{opacity:.35}}@keyframes mvdGira{to{transform:rotate(360deg)}}.mvd-pulso{animation:mvdPulso 1.8s ease-in-out infinite}.mvd-gira{animation:mvdGira .9s linear infinite}</style>`;
  RENDERERS.motorVendas = function(){
    return `<div>${vendasTabsHTML("motorVendas")}${CSS}
      <div style="padding:26px 30px 60px;max-width:1240px">
        <div data-mvd-crm-slot>${crmHTML()}</div>
        <div id="mvd-topo">${topoV()}</div>
        ${typeof vendasCanaisHTML === "function" ? vendasCanaisHTML() : ""}
        <div id="mvd-corpo">${corpoV()}</div>
      </div></div>`;
  };
  RENDERERS.motorQualidade = function(){
    return `<div>${vendasTabsHTML("motorQualidade")}${CSS}
      <div style="padding:26px 30px 60px;max-width:1240px">
        <div data-mvd-crm-slot>${crmHTML()}</div>
        <div id="mvq-topo">${topoQ()}</div>
        <div id="mvq-corpo">${corpoQ()}</div>
      </div></div>`;
  };
  // Engenharia de Leads fica oculta: quem cair no link antigo vai para a Gestão Comercial
  RENDERERS.motorLeads = function(){ setTimeout(() => { if(state.screen === "motorLeads") setState({ screen: "motorVendas" }); }, 0); return RENDERERS.motorVendas(); };

  function pintar(parte){
    const put = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
    if(state.screen === "motorVendas"){ if(parte !== "corpo") put("mvd-topo", topoV()); if(parte !== "topo") put("mvd-corpo", corpoV()); }
    if(state.screen === "motorQualidade"){ if(parte !== "corpo") put("mvq-topo", topoQ()); if(parte !== "topo") put("mvq-corpo", corpoQ()); }
  }
  const pintaCrm = () => document.querySelectorAll("[data-mvd-crm-slot]").forEach(el => { el.innerHTML = crmHTML(); });
  const telaMvd = () => state.screen === "motorVendas" || state.screen === "motorQualidade";

  document.addEventListener("click", ev => {
    const t = ev.target, q = sel => t.closest && t.closest(sel);
    let el;
    if(document.querySelector("[data-mvd-modal]")){
      if(q("[data-mvd-modal-box]") && !q("[data-mvd-fechar]")) return;
      const v = q("[data-mvd-vend]"); fecharNegocio();
      if(v){ S.v.vendedor = v.dataset.mvdVend; pintar(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      return;
    }
    if(!telaMvd()) return;
    if((el = q("[data-mvd-op]"))){ const s = S[el.dataset.mvdEscopo]; s[el.dataset.mvdOp] = el.dataset.mvdVal; if(el.dataset.mvdEscopo === "q"){ s.aberta = 0; s.limite = 10; } S.menu = ""; pintar(); return; }
    if((el = q("[data-mvd-chip]"))){ const k = el.dataset.mvdEscopo + ":" + el.dataset.mvdChip; S.menu = S.menu === k ? "" : k; pintar("topo"); return; }
    if(S.menu && !q("[data-mvd-menu]")){ S.menu = ""; pintar("topo"); }
    if(q("[data-mvd-sync]")){ S.sync.rodando = true; pintaCrm(); setTimeout(() => { S.sync = { em: Date.now(), rodando: false }; pintaCrm(); if(typeof cfgToast === "function") cfgToast("CRM sincronizado. Painel atualizado com os dados mais recentes."); }, 1300); return; }
    if((el = q("[data-mvd-limpar]"))){ const k = el.dataset.mvdLimpar; Object.assign(S[k], PADRAO[k]); if(k === "q"){ S.q.aberta = 0; S.q.limite = 10; } pintar(); return; }
    if((el = q("[data-mvd-tira]"))){ S[el.dataset.mvdEscopo][el.dataset.mvdTira] = ""; pintar(); return; }
    if((el = q("[data-mvd-vend]"))){ ev.stopPropagation(); S.v.vendedor = S.v.vendedor === el.dataset.mvdVend ? "" : el.dataset.mvdVend; pintar(); return; }
    if((el = q("[data-mvd-canal]"))){ S.v.canal = S.v.canal === el.dataset.mvdCanal ? "" : el.dataset.mvdCanal; pintar(); return; }
    if((el = q("[data-mvd-negocio]"))){ abrirNegocio(el.dataset.mvdNegocio); return; }
    if((el = q("[data-mvq-vend]"))){ S.q.vendedor = S.q.vendedor === el.dataset.mvqVend ? "" : el.dataset.mvqVend; S.q.aberta = 0; pintar(); return; }
    if((el = q("[data-mvq-lista]"))){ S.q.lista = el.dataset.mvqLista; S.q.limite = 10; S.q.aberta = 0; pintar("corpo"); return; }
    if((el = q("[data-mvq-abrir]"))){ const id = +el.dataset.mvqAbrir; S.q.aberta = S.q.aberta === id ? 0 : id; pintar("corpo"); return; }
    if(q("[data-mvq-mais]")){ S.q.limite += 10; pintar("corpo"); return; }
  }, true);
  document.addEventListener("keydown", ev => { if(ev.key === "Escape"){ if(document.querySelector("[data-mvd-modal]")) fecharNegocio(); else if(S.menu && telaMvd()){ S.menu = ""; pintar("topo"); } } });

  // Dica do funil desenhado (mesmo visual do original, com os números do recorte atual)
  document.addEventListener("mousemove", ev => {
    if(state.screen !== "motorVendas" || !S.steps) return;
    const box = ev.target.closest && ev.target.closest("[data-mvd-funil]");
    document.querySelectorAll("[data-mvd-funil]").forEach(b => { if(b !== box){ const tp = b.querySelector("[data-funil-tip]"); if(tp && !tp.hidden){ tp.hidden = true; b.querySelectorAll("[data-funil-faixa]").forEach(f => { f.style.opacity = "1"; }); } } });
    if(!box) return;
    const tip = box.querySelector("[data-funil-tip]"), faixas = box.querySelectorAll("[data-funil-faixa]");
    const alvo = ev.target.closest("[data-funil-faixa],[data-funil-item]");
    if(!alvo){ tip.hidden = true; faixas.forEach(f => { f.style.opacity = "1"; }); return; }
    const i = +(alvo.dataset.funilFaixa !== undefined ? alvo.dataset.funilFaixa : alvo.dataset.funilItem);
    faixas.forEach((f, k) => { f.style.opacity = k === i ? "1" : ".55"; });
    tip.innerHTML = funilTipHTML(S.steps[i], S.steps[0].count || 1, faixas[i].dataset.saiu);
    tip.hidden = false;
    const r = box.getBoundingClientRect();
    tip.style.left = Math.max(0, Math.min(ev.clientX - r.left + 14, r.width - tip.offsetWidth - 4)) + "px";
    tip.style.top = Math.max(0, ev.clientY - r.top - tip.offsetHeight - 12) + "px";
  });
  // "Última sincronização: há N min" anda sozinho
  setInterval(() => { if(telaMvd() && !S.sync.rodando) pintaCrm(); }, 30000);

  sincronizaDATA();
  if(telaMvd() || state.screen === "motorLeads"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = RENDERERS[state.screen](); }
})();
