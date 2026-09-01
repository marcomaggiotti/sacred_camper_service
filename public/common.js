/* Shared helpers for the signed in views. */
window.Camper = (function () {
  'use strict';

  // Wraps fetch with JSON defaults, sends anonymous visitors to the login page
  // and turns an error payload into a rejected promise.
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
    if (!target) return;
    target.textContent = text;
    target.className = 'message ' + (kind || 'ok');
  }

  function clearNotice(target) {
    if (target) target.className = 'message hidden';
  }

  var LINKS = [
    { href: '/dashboard', label: 'Calendario' },
    { href: '/tasks', label: 'Cose da fare' },
    { href: '/destinations', label: 'Destinazioni' },
    { href: '/admin', label: 'Amministrazione', adminOnly: true }
  ];

  // Builds the header navigation, marking the page you are on.
  function mountNav(container, user, activeHref) {
    container.innerHTML = '';

    var greeting = document.createElement('span');
    greeting.className = 'greeting';
    greeting.textContent = 'Ciao, ' + (user.fullName || user.username);
    container.appendChild(greeting);

    LINKS.forEach(function (link) {
      if (link.adminOnly && !user.isAdmin) return;
      var anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.label;
      if (link.href === activeHref) anchor.className = 'active';
      container.appendChild(anchor);
    });

    var logout = document.createElement('button');
    logout.className = 'btn-ghost btn-small logout';
    logout.textContent = 'Esci';
    logout.addEventListener('click', function () {
      api('/api/auth/logout', { method: 'POST' }).then(function () {
        window.location.href = '/';
      });
    });
    container.appendChild(logout);
  }

  // Resolves with the signed in user once the header is in place.
  function start(activeHref) {
    return api('/api/auth/me').then(function (data) {
      var nav = document.getElementById('nav');
      if (nav) mountNav(nav, data.user, activeHref);
      return data.user;
    });
  }

  function formatIt(isoDay) {
    if (!isoDay) return '';
    var parts = isoDay.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function todayIso() {
    var now = new Date();
    return now.getFullYear() +
      '-' + String(now.getMonth() + 1).padStart(2, '0') +
      '-' + String(now.getDate()).padStart(2, '0');
  }

  return {
    api: api,
    notify: notify,
    clearNotice: clearNotice,
    start: start,
    formatIt: formatIt,
    todayIso: todayIso
  };
})();
