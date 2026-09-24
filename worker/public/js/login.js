(function () {
  const form = document.getElementById('loginForm');
  const btn = document.getElementById('submitBtn');
  const err = document.getElementById('errorBox');

  function showError(msg) {
    err.textContent = msg;
    err.classList.remove('hidden');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    const data = new FormData(form);
    try {
      const resp = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: data.get('username'),
          password: data.get('password'),
        }),
      });
      if (resp.status === 401) {
        showError('Usuário ou senha incorretos.');
        return;
      }
      if (!resp.ok) {
        showError(`Erro ${resp.status} ao autenticar.`);
        return;
      }
      window.location.href = '/';
    } catch (e) {
      showError('Falha de rede.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  const modal = document.getElementById('changePwModal');
  const openBtn = document.getElementById('openChangePw');
  const closeBtn = document.getElementById('closeChangePw');
  const cpForm = document.getElementById('changePwForm');
  const cpBtn = document.getElementById('cpSubmitBtn');
  const cpErr = document.getElementById('cpErrorBox');
  const cpOk = document.getElementById('cpOkBox');

  function openModal() {
    cpErr.classList.add('hidden');
    cpOk.classList.add('hidden');
    cpForm.reset();
    const currentUser = document.getElementById('username').value;
    if (currentUser) document.getElementById('cp_username').value = currentUser;
    modal.classList.remove('hidden');
  }
  function closeModal() { modal.classList.add('hidden'); }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  cpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    cpErr.classList.add('hidden');
    cpOk.classList.add('hidden');
    cpBtn.disabled = true;
    cpBtn.textContent = 'Salvando...';
    const data = new FormData(cpForm);
    try {
      const resp = await fetch('/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: data.get('username'),
          currentPassword: data.get('currentPassword'),
          newPassword: data.get('newPassword'),
        }),
      });
      if (resp.status === 401) {
        cpErr.textContent = 'Usuário ou senha atual incorretos.';
        cpErr.classList.remove('hidden');
        return;
      }
      if (resp.status === 400) {
        cpErr.textContent = 'Nova senha inválida (mínimo 8 caracteres).';
        cpErr.classList.remove('hidden');
        return;
      }
      if (!resp.ok) {
        cpErr.textContent = `Erro ${resp.status} ao alterar senha.`;
        cpErr.classList.remove('hidden');
        return;
      }
      cpOk.classList.remove('hidden');
      cpForm.reset();
    } catch (e) {
      cpErr.textContent = 'Falha de rede.';
      cpErr.classList.remove('hidden');
    } finally {
      cpBtn.disabled = false;
      cpBtn.textContent = 'Salvar';
    }
  });
})();
