// Tela "Config": credenciais dos apps (Meta, Google/YouTube, TikTok), chaves de IA, status do Google Drive
// e a senha do acesso direto ao site antigo. Substitui o antigo public/settings.html do Automatik Inst.
(function () {
  const { api, ui, e, icon } = ZP;

  // domínio fixo que o backend usa nos redirect_uri do OAuth (server.js do Automatik)
  const SITE_ANTIGO = 'https://automatikinst.jefersonhenrike.com'; // acesso direto desta instância (a senha é a do login de lá)

  // Semântica dos campos (a mesma do backend):
  //   - campo comum: o valor volta pela API; só é enviado se o usuário mudou (evita apagar sem querer)
  //   - campo secreto: a API NUNCA devolve o valor, só <chave>_set; em branco = manter o atual, só envia se digitar um novo
  const GRUPOS = [
    { id: 'meta', titulo: 'Meta / Instagram', ic: 'image', desc: 'Credenciais do app da Meta usadas para conectar e publicar nas contas do Instagram.', campos: [
      { k: 'meta_app_id', rotulo: 'App ID', ph: 'Ex: 839304975897478', valida: (v) => (v && !/^\d+$/.test(v) ? 'O App ID tem só números. Parece que você colou outra coisa.' : '') },
      { k: 'meta_app_secret', rotulo: 'App Secret', secreto: true },
      { k: 'meta_login_config_id', rotulo: 'ID da configuração do Login para Empresas (opcional)', ph: "Só se o app usar 'Login do Facebook para Empresas'",
        hint: 'Deixe em branco se o app usa o Login do Facebook clássico. Se usa o <strong>para Empresas</strong> (o painel mostra "Modelos" / "Configurações" no menu do Login), cole aqui o ID da configuração. Sem ele o Facebook autoriza mas devolve o retorno sem o código, e a conexão falha.' },
    ] },
    { id: 'google', titulo: 'Google / YouTube', ic: 'play', desc: 'Credenciais OAuth do Google Cloud Console. Servem para conectar o YouTube e o Google Drive.', campos: [
      { k: 'google_client_id', rotulo: 'Client ID', ph: 'Ex: xxxx.apps.googleusercontent.com' },
      { k: 'google_client_secret', rotulo: 'Client Secret', secreto: true },
    ] },
    { id: 'tiktok', titulo: 'TikTok', ic: 'video', desc: 'Credenciais do app no TikTok Developer Portal.', campos: [
      { k: 'tiktok_client_key', rotulo: 'Client Key', ph: 'Ex: awxxxxxxxxxxxx' },
      { k: 'tiktok_client_secret', rotulo: 'Client Secret', secreto: true },
    ] },
  ];
  const IA = [
    { k: 'ai_claude_key', rotulo: 'Claude (Anthropic)' },
    { k: 'ai_openai_key', rotulo: 'OpenAI (ChatGPT)' },
    { k: 'ai_gemini_key', rotulo: 'Gemini (Google)' },
  ];

  const CSS = `
  .cf-wrap{max-width:860px}
  .cf-card{margin-bottom:18px}
  .cf-lab{display:flex;align-items:center;gap:8px;margin:0 0 6px} .cf-lab label.f{margin:0}
  .cf-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:4px}
  .cf-sep{margin:34px 0 14px;padding-top:24px;border-top:1px solid var(--line)}
  .cf-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:1px 6px;word-break:break-all}
  `;

  const seloSegredo = (set) => (set ? `<span class="badge b-green">Configurado</span>` : `<span class="badge">Não configurado</span>`);
  const phSegredo = (set) => (set ? 'Configurado. Deixe em branco para manter o atual' : 'Cole aqui para configurar');

  function htmlCampo(c, cfg) {
    if (c.secreto) {
      const set = !!cfg[c.k + '_set'];
      return `<div class="field"><div class="cf-lab"><label class="f" for="cf_${c.k}">${e(c.rotulo)}</label><span data-selo="${c.k}">${seloSegredo(set)}</span></div>
        <input class="inp" type="password" id="cf_${c.k}" autocomplete="new-password" spellcheck="false" placeholder="${e(phSegredo(set))}">
        <div class="hint">Guardado criptografado no servidor. O valor nunca é mostrado de volta.</div></div>`;
    }
    return `<div class="field"><label class="f" for="cf_${c.k}">${e(c.rotulo)}</label>
      <input class="inp" type="text" id="cf_${c.k}" autocomplete="off" spellcheck="false" placeholder="${e(c.ph || '')}" value="${e(cfg[c.k] || '')}">
      ${c.hint ? `<div class="hint">${c.hint}</div>` : ''}</div>`;
  }

  ZP.views.config = {
    async mount(el) {
      const [rs, ra, rd] = await Promise.allSettled([api.get('/settings'), api.get('/settings/ai'), api.get('/drive/status')]);
      // sem /settings não dá para saber o que já está salvo: melhor não mostrar formulário do que arriscar sobrescrever
      if (rs.status === 'rejected') throw rs.reason;
      const cfg = rs.value || {};
      const ia = ra.status === 'fulfilled' ? ra.value || {} : null;
      let drive = rd.status === 'fulfilled' ? rd.value : null;

      el.innerHTML = `<style>${CSS}</style><div class="page"><div class="cf-wrap">
        <div class="page-head"><div class="ttl"><h1>Configurações</h1><p class="sub">Credenciais dos apps de cada plataforma, chaves de IA e integrações do Agente Posts.</p></div>
          <div class="row"><a class="btn" href="#/contas">${icon('link', 15)}Ir para Contas</a></div></div>

        ${ui.note('info', 'Campos secretos (App Secret, Client Secret e chaves de IA) ficam criptografados e <strong>nunca voltam para a tela</strong>. Para manter o valor atual, deixe o campo em branco. Para trocar, digite o novo valor e salve.', 'shield')}

        ${GRUPOS.map((g) => `<div class="card cf-card" data-grupo="${g.id}"><div class="card-h">${icon(g.ic, 17)}<div class="grow"><h3>${e(g.titulo)}</h3><div class="small mute" style="margin-top:2px">${e(g.desc)}</div></div></div>
          <div class="card-b">${g.campos.map((c) => htmlCampo(c, cfg)).join('')}
            <div class="cf-foot"><button class="btn pri" data-salvar="${g.id}">${icon('check', 14)}Salvar ${e(g.titulo.split(' / ')[0])}</button><span class="small mute" data-msg="${g.id}"></span></div></div></div>`).join('')}

        <div class="card cf-card"><div class="card-h">${icon('bolt', 17)}<div class="grow"><h3>Inteligência artificial</h3><div class="small mute" style="margin-top:2px">Chaves usadas para gerar legendas na Publicação em Massa. Configure só os provedores que for usar.</div></div></div>
          <div class="card-b">${ia ? `<div class="cols-3">${IA.map((c) => `<div class="field" style="margin-bottom:6px"><div class="cf-lab"><label class="f" for="cf_${c.k}">${e(c.rotulo)}</label><span data-selo="${c.k}">${seloSegredo(ia[c.k + '_set'])}</span></div>
              <input class="inp" type="password" id="cf_${c.k}" autocomplete="new-password" spellcheck="false" placeholder="${e(ia[c.k + '_set'] ? 'Em branco mantém a atual' : 'Cole a API Key')}"></div>`).join('')}</div>
            <div class="hint" style="margin:4px 0 14px">Só as chaves preenchidas são enviadas. Não existe opção de apagar uma chave por aqui: para trocar, salve uma nova por cima.</div>
            <div class="cf-foot"><button class="btn pri" id="cfIa">${icon('check', 14)}Salvar chaves de IA</button></div>` : ui.error('Não consegui ler o status das chaves de IA. Recarregue a tela.')}</div></div>

        <div class="card cf-card"><div class="card-h">${icon('folder', 17)}<div class="grow"><h3>Google Drive</h3><div class="small mute" style="margin-top:2px">Usado na Publicação em Massa para ler as mídias direto de uma pasta do Drive.</div></div><span id="cfDriveSelo"></span></div>
          <div class="card-b"><div id="cfDriveTxt" class="small" style="line-height:1.55;color:var(--ink-2);margin-bottom:14px"></div>
            <div class="cf-foot"><span id="cfDriveBtn"></span><button class="btn" id="cfDriveAtualizar">${icon('refresh', 14)}Atualizar status</button></div></div></div>

        <div class="cf-sep"><h2>Senha do acesso direto (site antigo)</h2>
          <p class="sub" style="margin-top:6px;line-height:1.55">Esta senha vale <strong>só para quem entra direto no site antigo</strong> (<span class="cf-code">${e(SITE_ANTIGO.replace('https://', ''))}</span>). Aqui dentro da Central o login é o da própria Central e não muda com esta senha.</p></div>
        <div class="card cf-card"><div class="card-b"><div class="cols-2">
            <div class="field"><label class="f" for="cfSenhaAtual">Senha atual do site antigo</label><input class="inp" type="password" id="cfSenhaAtual" autocomplete="current-password"></div>
            <div class="field"><label class="f" for="cfSenhaNova">Nova senha</label><input class="inp" type="password" id="cfSenhaNova" autocomplete="new-password"><div class="hint">Mínimo de 8 caracteres.</div></div></div>
          <div class="cf-foot"><button class="btn" id="cfSenha">${icon('key', 14)}Alterar senha do site antigo</button><span class="small mute">Quem estiver logado no site antigo continua até a sessão expirar. O próximo login já usa a senha nova.</span></div></div></div>
      </div></div>`;

      const $ = (s) => el.querySelector(s);
      const campo = (k) => el.querySelector('#cf_' + k);

      // ─── credenciais dos apps ────────────────────────────────────────────
      async function salvarGrupo(g, btn) {
        const payload = {}, limpando = [];
        for (const c of g.campos) {
          const v = campo(c.k).value.trim();
          if (c.secreto) { if (v) payload[c.k] = v; continue; }            // segredo em branco = manter
          const erro = c.valida ? c.valida(v) : ''; if (erro) { ui.toast(erro, 'err'); campo(c.k).focus(); return; }
          if (v !== String(cfg[c.k] || '')) { payload[c.k] = v; if (!v) limpando.push(c.rotulo); } // só o que mudou
        }
        if (!Object.keys(payload).length) { ui.toast('Nada mudou em ' + g.titulo + '.'); return; }
        if (limpando.length) {
          const ok = await ui.confirm({ title: 'Apagar campo salvo', danger: true, ok: 'Apagar e salvar',
            html: `Você deixou em branco: <strong>${e(limpando.join(', '))}</strong>. Isso apaga o valor salvo e pode parar a conexão com ${e(g.titulo)}. Continuar?` });
          if (!ok) return;
        }
        ui.busy(btn, true, 'Salvando...');
        try {
          await api.post('/settings', payload);
          g.campos.forEach((c) => {
            if (!(c.k in payload)) return;
            if (c.secreto) { cfg[c.k + '_set'] = true; campo(c.k).value = ''; campo(c.k).placeholder = phSegredo(true); el.querySelector(`[data-selo="${c.k}"]`).innerHTML = seloSegredo(true); }
            else cfg[c.k] = payload[c.k];
          });
          ui.busy(btn, false); ui.toast('Credenciais de ' + g.titulo + ' salvas.', 'ok');
          const m = el.querySelector(`[data-msg="${g.id}"]`); if (m) m.textContent = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          if (g.id === 'google') desenharDrive();
        } catch (err) { ui.busy(btn, false); ui.toast('Não consegui salvar: ' + err.message, 'err'); }
      }
      el.querySelectorAll('[data-salvar]').forEach((b) => { b.onclick = () => salvarGrupo(GRUPOS.find((g) => g.id === b.dataset.salvar), b); });

      // ─── chaves de IA ────────────────────────────────────────────────────
      if (ia) $('#cfIa').onclick = async () => {
        const payload = {}; IA.forEach((c) => { const v = campo(c.k).value.trim(); if (v) payload[c.k] = v; });
        if (!Object.keys(payload).length) { ui.toast('Cole pelo menos uma API Key para salvar.'); return; }
        const btn = $('#cfIa'); ui.busy(btn, true, 'Salvando...');
        try {
          await api.post('/settings/ai', payload);
          IA.forEach((c) => { if (!(c.k in payload)) return; campo(c.k).value = ''; campo(c.k).placeholder = 'Em branco mantém a atual'; el.querySelector(`[data-selo="${c.k}"]`).innerHTML = seloSegredo(true); });
          ui.busy(btn, false); ui.toast('Chaves de IA salvas.', 'ok');
        } catch (err) { ui.busy(btn, false); ui.toast('Não consegui salvar: ' + err.message, 'err'); }
      };

      // ─── Google Drive ────────────────────────────────────────────────────
      function desenharDrive() {
        const temApp = !!cfg.google_client_id && !!cfg.google_client_secret_set, on = !!(drive && drive.connected);
        $('#cfDriveSelo').innerHTML = !drive ? `<span class="badge">Status indisponível</span>` : on ? `<span class="badge b-green">Conectado</span>` : `<span class="badge b-amber">Não conectado</span>`;
        $('#cfDriveTxt').innerHTML = !temApp
          ? 'Para conectar o Drive, salve primeiro o <strong>Client ID</strong> e o <strong>Client Secret</strong> do Google no cartão "Google / YouTube" acima.'
          : `A autorização abre <strong>em outra aba</strong> (o Google não funciona dentro de painel embutido) e o retorno cai no site antigo. Depois volte aqui e clique em <strong>Atualizar status</strong>. No Google Cloud Console, a URI de redirecionamento cadastrada precisa ser <span class="cf-code">${e(SITE_ANTIGO)}/oauth/drive/callback</span>.`;
        $('#cfDriveBtn').hidden = !temApp; // vazio não pode ocupar espaço na linha de botões
        $('#cfDriveBtn').innerHTML = temApp ? `<a class="btn ${on ? '' : 'pri'}" href="/zeuspost/oauth/drive/start" target="_blank" rel="noopener">${icon('ext', 14)}${on ? 'Reconectar Google Drive' : 'Conectar Google Drive'}</a>` : '';
      }
      $('#cfDriveAtualizar').onclick = async () => {
        const btn = $('#cfDriveAtualizar'); ui.busy(btn, true, 'Consultando...');
        try { drive = await api.get('/drive/status'); ui.toast(drive.connected ? 'Google Drive conectado.' : 'Google Drive ainda não conectado.', drive.connected ? 'ok' : ''); }
        catch (err) { ui.toast('Não consegui consultar o Drive: ' + err.message, 'err'); }
        finally { ui.busy(btn, false); desenharDrive(); }
      };
      desenharDrive();

      // ─── senha do site antigo ────────────────────────────────────────────
      $('#cfSenha').onclick = async () => {
        const atual = $('#cfSenhaAtual').value, nova = $('#cfSenhaNova').value;
        if (!atual || !nova) { ui.toast('Preencha a senha atual e a nova.', 'err'); return; }
        if (nova.length < 8) { ui.toast('A nova senha precisa ter no mínimo 8 caracteres.', 'err'); return; }
        if (atual === nova) { ui.toast('A nova senha precisa ser diferente da atual.', 'err'); return; }
        const ok = await ui.confirm({ title: 'Alterar senha do site antigo', ok: 'Alterar senha',
          html: 'Isso troca a senha de quem entra direto no site antigo. O acesso pela Central <strong>não muda</strong>. Confirmar?' });
        if (!ok) return;
        const btn = $('#cfSenha'); ui.busy(btn, true, 'Alterando...');
        try {
          await api.post('/auth/change-password', { current: atual, newPass: nova });
          $('#cfSenhaAtual').value = ''; $('#cfSenhaNova').value = '';
          ui.toast('Senha do site antigo alterada.', 'ok');
        } catch (err) { ui.toast(err.message || 'Erro ao alterar a senha.', 'err'); }
        finally { ui.busy(btn, false); }
      };
    },
  };
})();
