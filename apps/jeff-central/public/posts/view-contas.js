// Tela "Contas": contas conectadas, conectar Instagram/YouTube/TikTok, diagnóstico da Meta,
// permissões dos tokens, importação via BM / token do Explorador e os guias de configuração.
// Substitui o antigo public/connect.html do Automatik Inst.
(function () {
  const { api, ui, fmt, e, icon } = ZP;

  // O backend (server.js do Automatik) usa este domínio FIXO nos redirect_uri do OAuth.
  // É ele que precisa estar cadastrado nos painéis da Meta, do Google e do TikTok.
  const SITE_ANTIGO = 'https://zeus-post.jefersonhenrike.com';
  const DOMINIO_ANTIGO = 'zeus-post.jefersonhenrike.com';
  const CALLBACK = (p) => `${SITE_ANTIGO}/oauth/${p}/callback`;
  // Início do OAuth: passa pelo proxy da Central (que injeta o Authorization), por isso não leva ?token=
  const OAUTH = (p, extra) => `/zeuspost/oauth/${p}/start${extra || ''}`;

  const PLATAFORMAS = {
    instagram: { nome: 'Instagram', ic: 'image', desc: 'Publique fotos, Reels, Stories e carrosséis direto na conta Business ou Creator.' },
    youtube: { nome: 'YouTube', ic: 'play', desc: 'Envie vídeos e Shorts para o seu canal automaticamente.', cfg: 'google_client_id', cfgNome: 'Client ID do Google' },
    tiktok: { nome: 'TikTok', ic: 'video', desc: 'Publique vídeos no TikTok com horário agendado.', cfg: 'tiktok_client_key', cfgNome: 'Client Key do TikTok' },
  };

  const CSS = `
  .ct-plat{display:flex;flex-direction:column;gap:12px;padding:18px}
  .ct-plat .ct-ico{width:40px;height:40px;border-radius:11px;background:var(--amber-bg);color:var(--amber);display:flex;align-items:center;justify-content:center}
  .ct-plat p{margin:0;color:var(--mute);font-size:13px;line-height:1.5;flex:1}
  .ct-sec{margin:28px 0 12px}
  .ct-diag{display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--soft)}
  .ct-diag:last-child{border-bottom:0}
  .ct-diag .ct-st{width:22px;height:22px;flex:0 0 22px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-top:1px}
  .ct-diag .ct-st.ok{background:var(--green-bg);color:var(--green)} .ct-diag .ct-st.no{background:var(--red-bg);color:var(--red)}
  .ct-fix{margin-top:8px;padding:8px 12px;border-left:3px solid var(--amber);background:var(--amber-bg);border-radius:6px;font-size:12.5px;line-height:1.55;color:#4B23B8}
  .ct-grp{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:18px 0 2px}
  .ct-grp:first-child{margin-top:0}
  .ct-det{border:1px solid var(--line);border-radius:14px;background:var(--card);margin-bottom:12px}
  .ct-det>summary{padding:14px 18px;cursor:pointer;font-weight:600;font-size:13.5px;list-style:none;display:flex;align-items:center;gap:10px}
  .ct-det>summary::-webkit-details-marker{display:none}
  .ct-det>summary .ct-chev{margin-left:auto;color:var(--mute);transition:transform .15s}
  .ct-det[open]>summary .ct-chev{transform:rotate(90deg)}
  .ct-det[open]>summary{border-bottom:1px solid var(--line)}
  .ct-det>div{padding:16px 18px;font-size:13.5px;line-height:1.6;color:var(--ink-2)}
  .ct-txt ol,.ct-txt ul{padding-left:20px;margin:8px 0 14px} .ct-txt li{margin-bottom:6px}
  .ct-txt p{margin:0 0 12px;line-height:1.6} .ct-txt{font-size:13.5px;line-height:1.6;color:var(--ink-2)}
  .ct-txt code,.ct-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:1px 6px;word-break:break-all}
  .ct-copy{display:flex;gap:8px;margin-bottom:14px} .ct-copy .inp{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;background:var(--softer)}
  .ct-prog{height:5px;border-radius:5px;background:var(--soft);overflow:hidden;margin-bottom:6px} .ct-prog>i{display:block;height:100%;background:var(--amber);transition:width .25s}
  .ct-perm{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
  @media (max-width:700px){.ct-li{flex-wrap:wrap}}
  `;

  // ─── helpers ───────────────────────────────────────────────────────────────
  const dataCompleta = (ts) => new Date(ts * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const campoCopia = (rotulo, valor) => `<label class="f">${e(rotulo)}</label><div class="ct-copy"><input class="inp" readonly value="${e(valor)}"><button class="btn sm" data-copy="${e(valor)}">${icon('copy', 14)}Copiar</button></div>`;
  const lista = (itens, tag) => `<${tag || 'ol'}>${itens.map((i) => `<li>${i}</li>`).join('')}</${tag || 'ol'}>`;
  const dica = (html) => ui.note('info', html);
  const alerta = (html) => ui.note('warn', html);

  async function copiar(txt, btn) {
    try { await navigator.clipboard.writeText(txt); }
    catch (_) { // dentro de iframe o clipboard pode ser bloqueado: cai no método antigo
      const t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (__) {} t.remove();
    }
    if (btn) { const h = btn.innerHTML; btn.innerHTML = icon('check', 14) + 'Copiado'; setTimeout(() => { btn.innerHTML = h; }, 1600); }
  }
  // delegação única para todos os botões [data-copy] (tela e modais)
  function ligarCopia(root) { root.addEventListener('click', (ev) => { const b = ev.target.closest('[data-copy]'); if (b) { ev.preventDefault(); copiar(b.dataset.copy, b); } }); }

  // validade do token → { html, alerta }
  function validade(a) {
    const agora = Date.now() / 1000, exp = Number(a.token_expires_at) || 0;
    if (!exp) return { html: `<span class="faint">sem data de validade</span>`, alerta: a.status === 'expiring' };
    const dias = Math.floor((exp - agora) / 86400);
    if (exp <= agora) return { html: `<span style="color:var(--red);font-weight:600">token vencido em ${dataCompleta(exp)}</span>`, alerta: true };
    if (dias < 7 || a.status === 'expiring') return { html: `<span style="color:var(--amber);font-weight:600">token vence em ${dias <= 0 ? 'menos de 1 dia' : dias + (dias === 1 ? ' dia' : ' dias')} (${dataCompleta(exp)})</span>`, alerta: true };
    return { html: `token válido até ${dataCompleta(exp)}`, alerta: false };
  }
  function seloStatus(a) {
    if (a.status === 'expiring') return `<span class="badge b-amber">Token expirando</span>`;
    if (a.status === 'active') return `<span class="badge b-green">Ativa</span>`;
    if (a.status === 'expired' || a.status === 'error' || a.status === 'revoked') return `<span class="badge b-red">${e(a.status === 'expired' ? 'Expirada' : a.status === 'revoked' ? 'Revogada' : 'Com erro')}</span>`;
    return `<span class="badge">${e(a.status || '-')}</span>`;
  }

  // ─── guia de 14 passos (conteúdo portado do connect.html) ──────────────────
  function passosGuia() {
    return [
      { t: 'Conectar o Instagram: guia completo', h: `<p>Do zero até publicando, em 14 passos. Faça na ordem, sem pular: cada um depende do anterior.</p>
        <strong>Você vai precisar de:</strong>${lista(['A conta do <strong>Instagram</strong> que vai receber as publicações', 'Uma <strong>Página do Facebook</strong> (criamos no passo 3, se não tiver)', 'Seu login do Facebook', 'Uns <strong>15 a 20 minutos</strong> na primeira vez'], 'ul')}
        ${dica('<strong>Por que tanto passo?</strong> A Meta não deixa nenhum sistema publicar no Instagram só com login e senha. Ela exige um "app" registrado que recebe uma autorização sua. É feito <strong>uma vez só</strong>: depois você conecta quantas contas quiser em 2 cliques.')}
        ${alerta('<strong>Não faça com pressa no celular.</strong> O painel da Meta é ruim em tela pequena. Use o computador.')}` },
      { t: 'Deixar o Instagram como conta profissional', h: `<p>A API só publica em conta <strong>Business</strong> ou <strong>Creator</strong>. Conta pessoal não funciona em nenhuma ferramenta.</p>
        <strong>No aplicativo do Instagram (celular):</strong>${lista(['Vá no seu perfil e toque nas <strong>3 barrinhas</strong> (canto superior direito)', 'Toque em <strong>Configurações e privacidade</strong>', 'Role até o final e toque em <strong>Tipo de conta e ferramentas</strong>', 'Toque em <strong>Mudar para conta profissional</strong>', 'Escolha uma categoria (qualquer uma serve, ex: "Empreendedor")', 'Escolha <strong>Empresa</strong> ou <strong>Criador de conteúdo</strong>: os dois funcionam'])}
        ${dica('<strong>Já é profissional?</strong> Pode ir pro próximo passo. Para conferir: se em Configurações aparece "Mudar para conta pessoal", já está profissional.')}` },
      { t: 'Vincular o Instagram a uma Página do Facebook', h: `<p>É o passo que mais trava. A Meta exige que a conta do Instagram esteja <strong>amarrada a uma Página do Facebook</strong> (não ao seu perfil pessoal).</p>
        <strong>Se você ainda não tem uma Página:</strong>${lista(['Acesse <a href="https://www.facebook.com/pages/create" target="_blank" rel="noopener">facebook.com/pages/create</a>', 'Dê um nome (pode ser o mesmo do Instagram) e escolha uma categoria', 'Clique em <strong>Criar Página</strong>. Pode pular foto, descrição, tudo'])}
        <strong>Agora vincule (no app do Instagram):</strong>${lista(['Perfil → <strong>Editar perfil</strong>', 'Toque em <strong>Página</strong> (ou "Central de contas" → Contas conectadas)', 'Escolha a Página do Facebook que você criou', 'Confirme'])}
        ${alerta('<strong>Sem esse vínculo, nada funciona.</strong> Se pular, lá na frente o diagnóstico acusa "conta não retornada pela Graph API" e você vai ter que voltar aqui.')}` },
      { t: 'Entrar no painel de desenvolvedor da Meta', h: `<p>Agora vamos criar o "app": é o crachá que o sistema usa para falar com o Instagram.</p>
        <p><a class="btn pri" href="https://developers.facebook.com" target="_blank" rel="noopener">${icon('ext', 14)}Abrir developers.facebook.com</a></p>
        <strong>Na página que abriu:</strong>${lista(['Clique em <strong>Entrar</strong> (canto superior direito) e faça login com seu Facebook', 'Se for a primeira vez, aparece <strong>"Começar"</strong> ou "Registrar-se como desenvolvedor"', 'Aceite os termos, confirme seu e-mail e escolha a ocupação <strong>"Desenvolvedor"</strong>'])}
        ${dica('Use a <strong>mesma conta do Facebook</strong> que administra a Página do passo 3. Se usar outra, as contas não vão aparecer depois.')}` },
      { t: 'Criar o app', h: lista(['No topo da página, clique em <strong>Meus Apps</strong>', 'Clique no botão verde <strong>Criar aplicativo</strong>', 'Em "O que você quer que seu app faça?", marque <strong>Outro</strong> e clique em Avançar', 'Em tipo, escolha <strong>Empresa</strong> (Business) e clique em Avançar', 'Em <strong>Nome do app</strong>, digite: <code>Zeus Post</code>', 'Confira o e-mail de contato e clique em <strong>Criar aplicativo</strong>', 'Ele vai pedir sua <strong>senha do Facebook</strong> para confirmar'])
        + dica('Se aparecer "Você tem um Portfólio empresarial?", pode escolher <strong>"Não vincular agora"</strong>. Não é obrigatório.') },
      { t: 'Adicionar o produto "Login do Facebook"', h: `<p>Você caiu no painel do app. Precisamos adicionar duas peças. Esta é a primeira.</p>
        ${lista(['No menu da esquerda, clique em <strong>Adicionar produto</strong> (ou role até "Adicionar produtos ao app")', 'Ache o card <strong>Login do Facebook</strong>', 'Clique em <strong>Configurar</strong>', 'Se perguntar a plataforma, escolha <strong>Web</strong>', 'Se pedir "URL do site", cole a URL abaixo e salve'])}
        ${campoCopia('URL do site', SITE_ANTIGO)}` },
      { t: 'Cadastrar a URL de retorno (atenção)', h: `<p>Aqui <strong>1 caractere errado quebra tudo</strong>. Use o botão de copiar, não digite na mão.</p>
        ${lista(['No menu da esquerda: <strong>Login do Facebook</strong> → <strong>Configurações</strong>', 'Ache o campo <strong>URIs de redirecionamento do OAuth válidos</strong>', 'Cole a URL abaixo nesse campo', 'Confirme que <strong>Login do OAuth do cliente</strong> e <strong>Login do OAuth da Web</strong> estão <strong>ligados</strong> (Sim)', 'Clique em <strong>Salvar alterações</strong> no rodapé'])}
        ${campoCopia('URL de retorno: copie exatamente assim', CALLBACK('instagram'))}
        ${alerta('<strong>Sem barra no final. Sem espaço. Com https.</strong> Se ficar diferente, o Facebook devolve você sem autorizar e sem explicar o motivo: o erro clássico de "cliquei em conectar e não aconteceu nada".')}
        <strong>Falta o domínio do app:</strong>${lista(['Menu da esquerda → <strong>Configurações do app</strong> → <strong>Básico</strong>', 'Ache o campo <strong>Domínios do app</strong>', 'Digite o domínio abaixo e aperte <strong>Enter</strong> (ele vira uma etiqueta)', `Role até o fim: se não houver plataforma, clique em <strong>+ Adicionar plataforma → Site</strong> e informe <code>${e(SITE_ANTIGO)}/</code>`, '<strong>Salvar alterações</strong>'])}
        ${campoCopia('Domínio do app: sem https, sem barra', DOMINIO_ANTIGO)}
        ${alerta('Sem isso, na hora de autorizar aparece <strong>"Não é possível carregar a URL: o domínio dessa URL não está incluído nos domínios do app"</strong>. São dois campos diferentes: a URL de retorno fica no Login do Facebook, o domínio fica nas Configurações Básicas. Os dois são obrigatórios.')}` },
      { t: 'Adicionar a API do Instagram', h: `<p>Segunda peça. Sem ela o app até autoriza, mas não consegue publicar.</p>
        ${lista(['Menu da esquerda → <strong>Adicionar produto</strong>', 'Ache o card <strong>Instagram</strong> (pode aparecer como "Instagram Graph API" ou "API do Instagram")', 'Clique em <strong>Configurar</strong>'])}
        ${dica('Se aparecerem duas opções ("Instagram API com login do Facebook" e "Instagram API com login do Instagram"), escolha a primeira, <strong>com login do Facebook</strong>. É a que funciona com Página vinculada, o caminho deste guia.')}` },
      { t: 'Pegar o App ID e o App Secret', h: lista(['Menu da esquerda → <strong>Configurações do app</strong> → <strong>Básico</strong>', 'No topo aparece a <strong>Identificação do aplicativo</strong> (App ID), um número longo. Copie', 'Do lado, <strong>Chave Secreta do Aplicativo</strong> (App Secret): clique em <strong>Mostrar</strong>', 'Ele pede sua senha do Facebook de novo. Digite e copie o código que aparece'])
        + alerta('<strong>O App Secret é uma senha.</strong> Não mande por WhatsApp, não mostre print para ninguém. Ele fica guardado criptografado no sistema.') },
      { t: 'Salvar as credenciais em Config', h: `<p>Cole o <strong>App ID</strong> e o <strong>App Secret</strong> na tela de Config, no cartão "Meta / Instagram", e salve.</p>
        <p><a class="btn pri" href="#/config" target="_blank" rel="noopener">${icon('settings', 14)}Abrir Config em outra aba</a></p>
        ${dica('O App ID tem só números. Se o app usa o <strong>Login do Facebook para Empresas</strong>, preencha também o "ID da configuração do Login" lá em Config.')}` },
      { t: 'Adicionar você como Testador (atenção)', h: `<p>O app nasce em <strong>Modo de Desenvolvimento</strong>. Nesse modo ele só funciona para quem está na lista de testadores. <strong>É o passo mais esquecido de todos.</strong></p>
        ${lista(['Menu da esquerda → <strong>Funções do app</strong> (App Roles) → <strong>Funções</strong>', 'Ache a seção <strong>Testadores do Instagram</strong>', 'Clique em <strong>Adicionar pessoas</strong>', 'Digite o <strong>@ do seu Instagram</strong> (sem o @) e confirme', 'Abra o <strong>Instagram</strong> no celular: Configurações → <strong>Aplicativos e sites</strong> → <strong>Convites de testador</strong>', 'Toque em <strong>Aceitar</strong>'])}
        ${alerta('<strong>Repita para CADA conta do Instagram</strong> que for usar. Se a conta não aceitou o convite, ela não aparece na hora de autorizar, e parece que o sistema está quebrado.')}
        ${dica('Em Modo de Desenvolvimento o app funciona <strong>perfeitamente</strong> para as contas testadoras. Você <strong>não precisa</strong> passar por revisão da Meta para usar com as suas contas e as dos seus clientes.')}` },
      { t: 'Autorizar o acesso', h: `<p>Clique no botão abaixo: ele abre o Facebook <strong>em outra aba</strong> pedindo sua autorização.</p>
        <p><a class="btn pri" href="${OAUTH('instagram')}" target="_blank" rel="noopener">${icon('ext', 14)}Autorizar agora</a></p>
        <strong>Na tela do Facebook:</strong>${lista(['Escolha sua conta, se ele perguntar', 'Em <strong>"Quais Páginas você quer usar?"</strong>, marque <strong>TODAS</strong>', 'Em <strong>"Quais contas do Instagram?"</strong>, marque <strong>TODAS</strong> também', 'Na lista de permissões, deixe <strong>tudo ligado</strong> e clique em <strong>Concluído</strong> / <strong>Continuar</strong>', 'O retorno abre o site antigo com a mensagem de sucesso. Feche aquela aba, volte aqui e clique em <strong>Atualizar contas</strong>'])}
        ${alerta('<strong>Marque TODAS as contas mesmo que só vá usar uma.</strong> É o erro número 1: as contas não marcadas ficam com token válido mas sem permissão de publicar, e a publicação falha depois, na hora do agendamento, sem aviso.')}` },
      { t: 'Conferir se ficou tudo certo', h: `<p>Não confie no "parece que deu certo". Rode o diagnóstico: ele pergunta para a própria Meta o estado de cada conta.</p>
        <p><button class="btn pri" data-guia-diag>${icon('shield', 14)}Rodar diagnóstico agora</button></p>
        <strong>O que você quer ver em verde:</strong>${lista(['App Secret confere', 'Token válido', 'Permissões concedidas', '<strong>Autorizada a publicar</strong>, em cada conta', 'Conta Business/Creator'], 'ul')}
        ${dica('Se algum item vier vermelho, o próprio diagnóstico diz o que fazer e em qual passo deste guia voltar.')}` },
      { t: 'Pronto: Instagram conectado', h: `<p>A partir de agora é só usar. Você não precisa repetir nada disso.</p>
        <strong>Para conectar mais contas depois:</strong>${lista(['Adicione a conta como testadora (passo 11) e aceite o convite no Instagram dela', 'Clique em <strong>Conectar Instagram</strong> e marque a nova conta', 'Ou use <strong>Importar via BM</strong>, se a conta estiver no seu Business Manager'])}
        ${dica('<strong>Sobre a validade:</strong> o acesso dura 60 dias e o sistema renova sozinho todo dia de madrugada. Se alguma conta não puder ser renovada, ela aparece como <strong>"Token expirando"</strong> nesta tela: aí é só conectar de novo.')}` },
    ];
  }

  function abrirGuia(aoDiagnosticar) {
    const passos = passosGuia(), total = passos.length; let n = 0, corpo = null, fechar = null;
    const desenhar = () => {
      const p = passos[n];
      corpo.innerHTML = `<div class="ct-prog"><i style="width:${(((n + 1) / total) * 100).toFixed(0)}%"></i></div>
        <div class="tiny mute" style="text-align:right;font-weight:600;margin-bottom:14px">Passo ${n + 1} de ${total}</div>
        <h2 style="margin-bottom:12px">${n === 0 || n === total - 1 ? '' : 'Passo ' + (n + 1) + ': '}${e(p.t)}</h2>
        <div class="ct-txt">${p.h}</div>
        <div class="row" style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
          <button class="btn" data-ant ${n === 0 ? 'style="visibility:hidden"' : ''}>${icon('chevL', 14)}Voltar</button><span class="grow"></span>
          ${n === total - 1 ? `<button class="btn pri" data-fim>Fechar guia</button>` : `<button class="btn pri" data-prox>${n === 0 ? 'Começar' : 'Já fiz, próximo passo'}${icon('chevR', 14)}</button>`}
        </div>`;
      corpo.scrollTop = 0;
    };
    fechar = ui.modal({ title: 'Guia: conectar o Instagram do zero', wide: true, body: '', onOpen: (b) => {
      corpo = b; ligarCopia(b); desenhar();
      b.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-prox]')) { n = Math.min(total - 1, n + 1); desenhar(); }
        else if (ev.target.closest('[data-ant]')) { n = Math.max(0, n - 1); desenhar(); }
        else if (ev.target.closest('[data-fim]')) fechar();
        else if (ev.target.closest('[data-guia-diag]')) { fechar(); aoDiagnosticar(); }
      });
    } });
  }

  // ─── diagnóstico ───────────────────────────────────────────────────────────
  // title/detail/fix vêm do backend como texto: sempre escapados
  const linhaDiag = (c) => `<div class="ct-diag"><span class="ct-st ${c.ok ? 'ok' : 'no'}">${icon(c.ok ? 'check' : 'x', 13)}</span><div class="grow">
      <div style="font-weight:600;font-size:13.5px">${e(c.title)}</div><div class="small mute" style="margin-top:2px;line-height:1.5">${e(c.detail)}</div>
      ${c.fix ? `<div class="ct-fix"><strong>Como corrigir:</strong> ${e(c.fix)}</div>` : ''}</div></div>`;
  function htmlDiag(d) {
    let h = ui.note(d.ok ? 'ok' : 'err', d.ok ? '<strong>Conexão saudável.</strong> Todos os pontos verificados estão corretos: a publicação via API deve funcionar.' : '<strong>Encontrei o que está travando.</strong> Corrija os itens em vermelho na ordem em que aparecem.');
    h += `<div class="ct-grp">Configuração do app</div>${(d.steps || []).map(linhaDiag).join('')}`;
    (d.accounts || []).forEach((a) => { h += `<div class="ct-grp">Conta @${e(a.username || a.id)}${a.ok ? '' : ' · com problema'}</div>${(a.checks || []).map(linhaDiag).join('')}`; });
    return h;
  }

  // ─── guias de configuração dos apps (recolhíveis) ──────────────────────────
  const det = (ic, titulo, html) => `<details class="ct-det"><summary>${icon(ic, 16)}${e(titulo)}<span class="ct-chev">${icon('chevR', 14)}</span></summary><div class="ct-txt">${html}</div></details>`;
  function htmlAjuda() {
    return det('image', 'Configurar o app da Meta (Instagram): resumo', `
        <p>Resumo para quem já conhece o painel da Meta. O passo a passo completo está no botão <strong>Guia passo a passo</strong>.</p>
        ${lista(['Em <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a>, crie um app do tipo <strong>Empresa</strong>', 'Adicione os produtos <strong>Login do Facebook</strong> e <strong>Instagram</strong> (com login do Facebook)', 'Em Login do Facebook → Configurações, cadastre a URL de retorno abaixo em <strong>URIs de redirecionamento do OAuth válidos</strong>', 'Em Configurações do app → Básico, cadastre o domínio abaixo em <strong>Domínios do app</strong>', 'Copie App ID e App Secret para <a href="#/config">Config</a>', 'Em Funções do app, adicione cada Instagram como <strong>Testador</strong> e aceite o convite no celular'])}
        ${campoCopia('URL de retorno (redirect URI)', CALLBACK('instagram'))}${campoCopia('Domínio do app', DOMINIO_ANTIGO)}
        <p class="small mute">Permissões pedidas na autorização: <span class="ct-code">instagram_basic</span> <span class="ct-code">instagram_content_publish</span> <span class="ct-code">instagram_manage_insights</span> <span class="ct-code">instagram_manage_comments</span> <span class="ct-code">pages_show_list</span> <span class="ct-code">pages_read_engagement</span> <span class="ct-code">business_management</span>. Se o app usa o <strong>Login do Facebook para Empresas</strong>, as permissões vêm da "configuração" criada no painel: informe o ID dela em Config, senão o Facebook autoriza mas volta sem o código.</p>`)
      + det('play', 'Configurar o app do Google (YouTube)', `
        ${lista(['No <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>, crie um projeto e ative a <strong>YouTube Data API v3</strong>', 'Em Credenciais, crie um <strong>ID do cliente OAuth</strong> do tipo Aplicativo da Web', 'Em <strong>Authorized redirect URIs</strong>, cadastre a URL abaixo', 'Copie Client ID e Client Secret para <a href="#/config">Config</a>, no cartão "Google / YouTube"', 'Se aparecer "app não verificado": em OAuth consent screen, adicione seu e-mail em <strong>Test users</strong> (ou publique o app)'])}
        ${campoCopia('Redirect URI do YouTube', CALLBACK('youtube'))}
        <p class="small mute">Entre com a conta Google que é <strong>dona do canal</strong>. Se a conta autorizada não tiver canal, a conexão é recusada.</p>`)
      + det('video', 'Configurar o app do TikTok', `
        ${lista(['No <a href="https://developers.tiktok.com/apps" target="_blank" rel="noopener">TikTok Developer Portal</a>, crie um app e adicione os produtos <strong>Login Kit</strong> e <strong>Content Posting API</strong>', 'Cadastre a Redirect URI abaixo', 'Copie Client Key e Client Secret para <a href="#/config">Config</a>, no cartão "TikTok"', 'Se o app ainda não passou pelo audit, adicione sua conta como <strong>Target User</strong> em Sandbox'])}
        ${campoCopia('Redirect URI do TikTok', CALLBACK('tiktok'))}`)
      + det('alert', 'Erros comuns ao conectar', `
        <p>Depois de autorizar, o retorno abre o site antigo. Se ele mostrar um erro, este é o significado:</p>
        ${lista(['<strong>App ID não configurado:</strong> salve o App ID da Meta em <a href="#/config">Config</a> primeiro.', '<strong>Facebook não autorizou:</strong> (1) app em <strong>Modo de Desenvolvimento</strong> e seu usuário não está em Funções do app → Testadores; (2) a URI de redirecionamento não está cadastrada literal em Login do Facebook → Configurações; (3) a janela foi fechada antes de concluir.', '<strong>Erro ao trocar o código por token:</strong> confira App ID e App Secret em Config e se o Instagram é <strong>Business/Creator vinculado a uma Página do Facebook</strong>.', '<strong>YouTube bloqueado / app não verificado:</strong> adicione seu e-mail em Test users no Google Cloud Console.', '<strong>Conta Google sem canal:</strong> entre com a conta dona do canal do YouTube.', '<strong>TikTok bloqueado:</strong> adicione sua conta como Target User no Sandbox do Developer Portal e confira a Redirect URI.'], 'ul')}`);
  }

  // ─── tela ──────────────────────────────────────────────────────────────────
  ZP.views.contas = {
    async mount(el) {
      let contas = [], cfg = null;
      const [rc, rs] = await Promise.allSettled([ZP.accounts(true), api.get('/settings')]);
      if (rc.status === 'rejected') throw rc.reason;
      contas = rc.value || []; cfg = rs.status === 'fulfilled' ? rs.value : null; // sem /settings a tela funciona igual, só não sabe se YouTube/TikTok têm app

      el.innerHTML = `<style>${CSS}</style><div class="page">
        <div class="page-head"><div class="ttl"><h1>Contas</h1><p class="sub">Perfis conectados para publicação, saúde dos tokens e conexão com a Meta.</p></div>
          <div class="row"><button class="btn" id="ctGuia">${icon('info', 15)}Guia passo a passo</button><button class="btn pri" id="ctAtualizar">${icon('refresh', 15)}Atualizar contas</button></div></div>
        <div id="ctPermAviso"></div>
        <div id="ctKpis"></div>

        <h2 class="ct-sec" style="margin-top:0">Conectar nova conta</h2>
        ${ui.note('info', `A autorização abre <strong>em outra aba</strong>, porque Facebook, Google e TikTok não funcionam dentro de um painel embutido. Ao terminar, o retorno cai no site antigo (<span class="ct-code">${e(DOMINIO_ANTIGO)}</span>): feche aquela aba, volte aqui e clique em <strong>Atualizar contas</strong>.`)}
        <div class="cols-3" id="ctPlats"></div>

        <h2 class="ct-sec">Contas conectadas</h2>
        <div class="card"><div class="card-h"><strong class="grow" style="font-size:13.5px;font-weight:600" id="ctTotal"></strong>
          <button class="btn sm" id="ctPerm">${icon('key', 14)}Verificar permissões</button>
          <button class="btn sm" id="ctBm">${icon('refresh', 14)}Importar via BM (Meta)</button></div>
          <div id="ctBmRes" style="padding:0 18px"></div>
          <div class="list" id="ctLista"></div></div>

        <h2 class="ct-sec">Diagnóstico da conexão com a Meta</h2>
        <div class="card"><div class="card-h"><div class="grow"><strong style="font-size:13.5px;font-weight:600">A conexão não está funcionando?</strong>
          <div class="small mute" style="margin-top:2px">Pergunta direto para a Meta o que está travando e mostra como corrigir cada item. Limite de 12 consultas por minuto.</div></div>
          <button class="btn" id="ctDiag">${icon('shield', 15)}Rodar diagnóstico</button></div>
          <div class="card-b" id="ctDiagRes" hidden></div></div>

        <h2 class="ct-sec">Importar contas com token do Explorador da Graph API</h2>
        <div class="card"><div class="card-b ct-txt">
          <p>Caminho alternativo, para quando o botão "Conectar Instagram" não retorna nada. Em <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener">developers.facebook.com/tools/explorer</a>, selecione seu app, adicione as permissões
            <span class="ct-code">instagram_basic</span>, <span class="ct-code">instagram_content_publish</span>, <span class="ct-code">instagram_manage_insights</span>, <span class="ct-code">pages_show_list</span>, <span class="ct-code">pages_read_engagement</span> e <span class="ct-code">business_management</span>,
            clique em <strong>Generate Access Token</strong>, marque TODAS as contas e cole o token aqui.</p>
          <div class="row" style="align-items:stretch"><input type="password" class="inp grow" id="ctToken" autocomplete="off" placeholder="Cole aqui o token gerado (começa com EAA...)" style="min-width:220px">
            <button class="btn pri" id="ctTokenBtn">${icon('key', 15)}Importar contas com este token</button></div>
          <div class="hint">O token do Explorador vale cerca de 1 hora. Ao importar, o sistema converte para um de 60 dias. Por isso o App ID e o App Secret precisam estar salvos em <a href="#/config">Config</a> antes.</div>
          <div id="ctTokenRes" style="margin-top:14px"></div></div></div>

        <h2 class="ct-sec">Ajuda para configurar os apps</h2>
        ${htmlAjuda()}
      </div>`;

      const $ = (s) => el.querySelector(s);
      ligarCopia(el);

      // cartões das plataformas: YouTube/TikTok sem app configurado mandam para Config em vez de cair no erro do site antigo
      $('#ctPlats').innerHTML = Object.entries(PLATAFORMAS).map(([id, p]) => {
        const semApp = p.cfg && cfg && !cfg[p.cfg];
        const qtd = contas.filter((a) => a.platform === id).length;
        return `<div class="card ct-plat"><div class="row"><span class="ct-ico">${icon(p.ic, 19)}</span><h3 class="grow">${e(p.nome)}</h3>${qtd ? `<span class="badge b-green">${qtd} conectada${qtd > 1 ? 's' : ''}</span>` : semApp ? `<span class="badge b-amber">App não configurado</span>` : ''}</div>
          <p>${e(p.desc)}</p>
          ${semApp ? `<a class="btn" href="#/config">${icon('settings', 14)}Configurar ${e(p.cfgNome)}</a>`
            : `<a class="btn pri" href="${OAUTH(id)}" target="_blank" rel="noopener">${icon('ext', 14)}Conectar ${e(p.nome)}</a>`}</div>`;
      }).join('');

      function desenharLista() {
        const vencendo = contas.filter((a) => validade(a).alerta).length;
        $('#ctKpis').innerHTML = `<div class="kpis">${ui.kpi('Contas conectadas', fmt.n(contas.length), [...new Set(contas.map((a) => (PLATAFORMAS[a.platform] || {}).nome || a.platform))].join(', ') || 'nenhuma ainda', 'var(--green)')}
          ${ui.kpi('Seguidores somados', fmt.compact(contas.reduce((s, a) => s + (Number(a.followers) || 0), 0)), 'em todas as contas', 'var(--blue)')}
          ${ui.kpi('Tokens pedindo atenção', fmt.n(vencendo), vencendo ? 'vencem em menos de 7 dias ou já venceram' : 'nenhum vence nos próximos 7 dias', vencendo ? 'var(--amber)' : 'var(--mute)')}</div>`;
        $('#ctTotal').textContent = contas.length + (contas.length === 1 ? ' conta' : ' contas');
        $('#ctPerm').hidden = !contas.some((a) => a.platform === 'instagram');
        if (!contas.length) { $('#ctLista').innerHTML = ui.empty('Nenhuma conta conectada ainda', 'Use um dos botões acima para conectar o primeiro perfil.', '', 'link'); return; }
        $('#ctLista').innerHTML = contas.map((a) => {
          const v = validade(a), p = PLATAFORMAS[a.platform] || { nome: a.platform, ic: 'link' };
          return `<div class="li ct-li">${ZP.avatar(a, 42)}
            <div class="grow"><div class="row" style="gap:8px"><strong class="trunc" style="font-size:14px">@${e(a.platform_username || '-')}</strong><span class="tag">${icon(p.ic, 12)}${e(p.nome)}</span>${seloStatus(a)}</div>
              <div class="small mute trunc" style="margin-top:2px">${e(a.platform_name || 'Sem nome')}</div>
              <div class="small mute" style="margin-top:3px"><span class="num">${fmt.n(a.followers)}</span> seguidores · ${v.html}${a.connected_at ? ` · conectada em ${dataCompleta(a.connected_at)}` : ''}</div>
              <div class="ct-perm" data-perm="${Number(a.id)}"></div></div>
            ${v.alerta && PLATAFORMAS[a.platform] ? `<a class="btn sm" href="${OAUTH(a.platform)}" target="_blank" rel="noopener">${icon('refresh', 13)}Reautorizar</a>` : ''}
            <button class="btn sm danger" data-del="${Number(a.id)}">${icon('trash', 13)}Desconectar</button></div>`;
        }).join('');
      }

      // permissões reais do token de cada conta (debug_token na Meta)
      async function verificarPermissoes(manual) {
        if (!contas.some((a) => a.platform === 'instagram')) return;
        const btn = $('#ctPerm'); if (manual) ui.busy(btn, true, 'Verificando...');
        el.querySelectorAll('[data-perm]').forEach((x) => { const c = contas.find((a) => a.id === Number(x.dataset.perm)); if (c && c.platform === 'instagram') x.innerHTML = `<span class="tiny faint">verificando permissões...</span>`; });
        try {
          const r = await api.get('/accounts/permissions'); const semPub = [];
          el.querySelectorAll('[data-perm]').forEach((x) => { x.innerHTML = ''; });
          (r.accounts || []).forEach((p) => {
            const box = el.querySelector(`[data-perm="${Number(p.id)}"]`); if (!box) return;
            if (p.error) { box.innerHTML = `<span class="small" style="color:var(--amber)">${e(p.error)}</span>`; return; }
            if (!p.can_publish) semPub.push('@' + p.username);
            box.innerHTML = (p.can_publish ? `<span class="badge b-green">Pode publicar</span>` : `<span class="badge b-red">Sem permissão para publicar</span>`)
              + (p.can_read_insights ? `<span class="badge b-green">Analytics liberado</span>` : `<span class="badge b-amber">Sem analytics</span>`);
          });
          $('#ctPermAviso').innerHTML = semPub.length ? `<div class="note err">${icon('alert', 17)}<div><strong>Uma ou mais contas sem permissão para publicar no Instagram.</strong><br>Contas bloqueadas: <strong>${e(semPub.join(', '))}</strong>. É preciso reautorizar o app no Facebook incluindo essas contas.
              <div style="margin:10px 0 8px"><a class="btn sm danger" href="${OAUTH('instagram', '?rerequest=1')}" target="_blank" rel="noopener">${icon('ext', 13)}Corrigir permissões (reautorizar Instagram)</a></div>
              <span class="small">Abre o Facebook em outra aba. Marque <strong>TODAS as contas do Instagram</strong> que você quer usar e clique em "Continuar". Depois volte aqui e clique em "Importar via BM (Meta)".</span></div></div>` : '';
          if (r.error && !(r.accounts || []).length) $('#ctPermAviso').innerHTML = ui.note('warn', e(r.error === 'Meta app não configurado' ? 'Não dá para verificar as permissões: o app da Meta não está configurado em Config.' : r.error));
          if (manual) ui.toast(semPub.length ? 'Há contas sem permissão para publicar.' : 'Permissões verificadas.', semPub.length ? 'err' : 'ok');
        } catch (err) {
          el.querySelectorAll('[data-perm]').forEach((x) => { x.innerHTML = ''; });
          if (manual) ui.toast('Não consegui verificar as permissões: ' + err.message, 'err');
        } finally { if (manual) ui.busy(btn, false); }
      }

      async function recarregar(avisar) {
        const btn = $('#ctAtualizar'); ui.busy(btn, true, 'Atualizando...');
        try { contas = await ZP.accounts(true); desenharLista(); if (avisar) ui.toast('Lista de contas atualizada.', 'ok'); verificarPermissoes(false); }
        catch (err) { ui.toast('Não consegui atualizar: ' + err.message, 'err'); }
        finally { ui.busy(btn, false); }
      }

      async function diagnosticar() {
        const btn = $('#ctDiag'), box = $('#ctDiagRes'); box.hidden = false;
        ui.busy(btn, true, 'Consultando a Meta...'); box.innerHTML = ui.loading('Perguntando para a Graph API o estado de cada conta...');
        try { box.innerHTML = htmlDiag(await api.get('/diagnostics/meta')); }
        catch (err) { box.innerHTML = ui.error('Falha ao diagnosticar: ' + err.message); }
        finally { ui.busy(btn, false); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      }

      // ─── eventos ─────────────────────────────────────────────────────────
      $('#ctAtualizar').onclick = () => recarregar(true);
      $('#ctGuia').onclick = () => abrirGuia(diagnosticar);
      $('#ctDiag').onclick = diagnosticar;
      $('#ctPerm').onclick = () => verificarPermissoes(true);

      $('#ctLista').addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-del]'); if (!b) return;
        const a = contas.find((x) => x.id === Number(b.dataset.del)); if (!a) return;
        const ok = await ui.confirm({ title: 'Desconectar conta', danger: true, ok: 'Desconectar',
          html: `Desconectar <strong>@${e(a.platform_username)}</strong>? O sistema para de publicar nessa conta e os agendamentos dela vão falhar. Para voltar, será preciso conectar de novo.` });
        if (!ok) return;
        ui.busy(b, true, 'Removendo...');
        try { await api.del('/accounts/' + encodeURIComponent(a.id)); ui.toast('Conta @' + a.platform_username + ' desconectada.', 'ok'); await recarregar(false); }
        catch (err) { ui.busy(b, false); ui.toast('Não consegui desconectar: ' + err.message, 'err'); }
      });

      // importar via BM: sem token no corpo, o backend usa o token Meta já guardado no servidor
      $('#ctBm').onclick = async () => {
        const ok = await ui.confirm({ title: 'Importar via BM (Meta)', ok: 'Importar',
          html: 'Busca todas as Páginas do Business Manager com Instagram vinculado, usando o token da Meta já guardado no servidor. Contas novas são adicionadas e as existentes têm o token renovado.' });
        if (!ok) return;
        const btn = $('#ctBm'); ui.busy(btn, true, 'Importando...');
        try {
          const r = await api.post('/accounts/import-bm', {});
          $('#ctBmRes').innerHTML = `<div style="padding-top:14px">${ui.note('ok', `Importadas <strong>${fmt.n(r.added)}</strong> novas e <strong>${fmt.n(r.updated)}</strong> atualizadas, de ${fmt.n(r.total_pages)} Página(s) da Meta.${r.aviso ? '<br>' + e(r.aviso) : ''}`)}</div>`;
          await recarregar(false);
        } catch (err) { $('#ctBmRes').innerHTML = `<div style="padding-top:14px">${ui.error('Erro ao importar: ' + err.message)}</div>`; }
        finally { ui.busy(btn, false); }
      };

      // importar colando um token do Explorador
      $('#ctTokenBtn').onclick = async () => {
        const inp = $('#ctToken'), box = $('#ctTokenRes'), token = inp.value.trim();
        if (!token) { box.innerHTML = ui.error('Cole o token gerado no Explorador primeiro.'); return; }
        if (!token.startsWith('EAA')) { box.innerHTML = ui.note('err', 'Isso não parece um token da Meta: ele começa com <strong>EAA</strong>. Copie de novo pelo ícone ao lado do campo "Token de acesso".'); return; }
        const btn = $('#ctTokenBtn'); ui.busy(btn, true, 'Importando...'); box.innerHTML = ui.note('info', 'Convertendo o token e buscando suas contas...');
        try {
          const r = await api.post('/accounts/import-bm', { access_token: token });
          inp.value = ''; // não deixa o token na tela
          if (!r.added && !r.updated) {
            box.innerHTML = ui.note('err', `Nenhuma conta do Instagram foi encontrada nas ${fmt.n(r.total_pages)} Página(s) desse token.<br><br>Causas mais comuns:<br>· a conta do Instagram não está <strong>vinculada a uma Página do Facebook</strong>;<br>· a conta não é <strong>Business/Creator</strong>;<br>· ao gerar o token você não marcou todas as Páginas e contas.`);
          } else {
            box.innerHTML = ui.note('ok', `<strong>${fmt.n(r.added)}</strong> conta(s) nova(s) e <strong>${fmt.n(r.updated)}</strong> atualizada(s), de ${fmt.n(r.total_pages)} Página(s) encontrada(s).`)
              + (r.long_lived ? ui.note('ok', 'Token convertido para longa duração (60 dias) e guardado criptografado.', 'shield') : ui.note('warn', e(r.aviso || 'O token não pôde ser convertido para longa duração.')));
          }
          await recarregar(false);
        } catch (err) { box.innerHTML = ui.error('Falha ao importar: ' + err.message); }
        finally { ui.busy(btn, false); }
      };

      desenharLista();
      verificarPermissoes(false); // igual à tela antiga: confere as permissões ao abrir, sem travar a lista
    },
  };
})();
