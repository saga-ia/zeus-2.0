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
})();
