(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var error = document.getElementById('error');
  var submit = document.getElementById('submit');

  function showError(message) {
    error.textContent = message;
    error.classList.remove('hidden');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    error.classList.add('hidden');
    submit.disabled = true;

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          showError(result.data.error || 'Accesso non riuscito.');
          submit.disabled = false;
          return;
        }
        window.location.href = '/dashboard';
      })
      .catch(function () {
        showError('Impossibile contattare il server.');
        submit.disabled = false;
      });
  });
})();
