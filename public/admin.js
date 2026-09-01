(function () {
  'use strict';

  var el = {
    who: document.getElementById('who'),
    userRows: document.getElementById('user-rows'),
    vehicleRows: document.getElementById('vehicle-rows'),
    userMessage: document.getElementById('user-message'),
    vehicleMessage: document.getElementById('vehicle-message')
  };

  var currentUser = null;

  function api(path, options) {
    var opts = options || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) {
        window.location.href = '/login';
        throw new Error('unauthenticated');
      }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Richiesta non riuscita.');
        return data;
      });
    });
  }

  function notify(target, text, kind) {
    target.textContent = text;
    target.className = 'message ' + (kind || 'ok');
  }

  function cell(row, text) {
    var td = document.createElement('td');
    td.textContent = text;
    row.appendChild(td);
    return td;
  }

  function loadUsers() {
    return api('/api/admin/users').then(function (data) {
      el.userRows.innerHTML = '';
      data.users.forEach(function (user) {
        var tr = document.createElement('tr');
        cell(tr, user.username);
        cell(tr, user.full_name || '—');
        cell(tr, user.is_admin ? 'Amministratore' : 'Utente');
        cell(tr, user.is_active ? 'Attivo' : 'Disattivato');
        cell(tr, String(user.reservation_count));

        var actions = document.createElement('td');
        if (currentUser && user.id !== currentUser.id) {
          var toggle = document.createElement('button');
          toggle.className = 'btn-ghost btn-small';
          toggle.textContent = user.is_active ? 'Disattiva' : 'Riattiva';
          toggle.addEventListener('click', function () {
            api('/api/admin/users/' + user.id + '/active', {
              method: 'POST',
              body: JSON.stringify({ isActive: !user.is_active })
            })
              .then(loadUsers)
              .catch(function (err) { notify(el.userMessage, err.message, 'error'); });
          });
          actions.appendChild(toggle);
        }

        var reset = document.createElement('button');
        reset.className = 'btn-ghost btn-small';
        reset.style.marginLeft = '0.4rem';
        reset.textContent = 'Nuova password';
        reset.addEventListener('click', function () {
          var password = window.prompt('Nuova password per ' + user.username + ' (min. 8 caratteri):');
          if (!password) return;
          api('/api/admin/users/' + user.id + '/password', {
            method: 'POST',
            body: JSON.stringify({ password: password })
          })
            .then(function () { notify(el.userMessage, 'Password aggiornata.', 'ok'); })
            .catch(function (err) { notify(el.userMessage, err.message, 'error'); });
        });
        actions.appendChild(reset);

        tr.appendChild(actions);
        el.userRows.appendChild(tr);
      });
    });
  }

  function loadVehicles() {
    return api('/api/admin/vehicles').then(function (data) {
      el.vehicleRows.innerHTML = '';
      data.vehicles.forEach(function (vehicle) {
        var tr = document.createElement('tr');
        cell(tr, vehicle.name);
        cell(tr, vehicle.plate || '—');
        cell(tr, String(vehicle.seats));
        cell(tr, vehicle.is_active ? 'Sì' : 'No');
        el.vehicleRows.appendChild(tr);
      });
    });
  }

  document.getElementById('create-user').addEventListener('click', function () {
    api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
        fullName: document.getElementById('fullName').value.trim() || null,
        isAdmin: document.getElementById('isAdmin').checked
      })
    })
      .then(function (data) {
        notify(el.userMessage, 'Utente "' + data.user.username + '" creato.', 'ok');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('fullName').value = '';
        document.getElementById('isAdmin').checked = false;
        return loadUsers();
      })
      .catch(function (err) { notify(el.userMessage, err.message, 'error'); });
  });

  document.getElementById('create-vehicle').addEventListener('click', function () {
    api('/api/admin/vehicles', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('camper-name').value.trim(),
        plate: document.getElementById('camper-plate').value.trim() || null,
        seats: Number(document.getElementById('camper-seats').value),
        description: document.getElementById('camper-description').value.trim() || null
      })
    })
      .then(function (data) {
        notify(el.vehicleMessage, 'Camper "' + data.vehicle.name + '" aggiunto.', 'ok');
        document.getElementById('camper-name').value = '';
        document.getElementById('camper-plate').value = '';
        document.getElementById('camper-description').value = '';
        return loadVehicles();
      })
      .catch(function (err) { notify(el.vehicleMessage, err.message, 'error'); });
  });

  document.getElementById('logout').addEventListener('click', function () {
    api('/api/auth/logout', { method: 'POST' }).then(function () {
      window.location.href = '/';
    });
  });

  api('/api/auth/me')
    .then(function (data) {
      currentUser = data.user;
      if (!currentUser.isAdmin) {
        window.location.href = '/dashboard';
        return null;
      }
      el.who.textContent = 'Ciao, ' + (currentUser.fullName || currentUser.username);
      return Promise.all([loadUsers(), loadVehicles()]);
    })
    .catch(function (err) {
      if (err.message !== 'unauthenticated') notify(el.userMessage, err.message, 'error');
    });
})();
