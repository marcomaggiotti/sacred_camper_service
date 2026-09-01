(function () {
  'use strict';

  var api = Camper.api;
  var state = { user: null, destinations: [], open: {} };

  var el = {
    list: document.getElementById('destination-list'),
    empty: document.getElementById('no-destinations'),
    message: document.getElementById('message')
  };

  function notify(text, kind) {
    Camper.notify(el.message, text, kind);
  }

  function button(label, className, handler) {
    var element = document.createElement('button');
    element.className = className + ' btn-small';
    element.textContent = label;
    element.addEventListener('click', handler);
    return element;
  }

  function travelWindow(destination) {
    if (destination.travelFrom && destination.travelTo) {
      return 'dal ' + Camper.formatIt(destination.travelFrom) +
        ' al ' + Camper.formatIt(destination.travelTo);
    }
    if (destination.travelFrom) return 'dal ' + Camper.formatIt(destination.travelFrom);
    if (destination.travelTo) return 'entro il ' + Camper.formatIt(destination.travelTo);
    return 'date da decidere';
  }

  // ---------------------------------------------------------------- wishlist

  function renderWishlistItem(item, refresh) {
    var row = document.createElement('li');
    row.className = 'wish' + (item.isFulfilled ? ' fulfilled' : '');

    var text = document.createElement('div');
    var name = document.createElement('span');
    name.className = 'wish-product';
    name.textContent = item.product + (item.quantity > 1 ? ' ×' + item.quantity : '');
    text.appendChild(name);

    var meta = document.createElement('span');
    meta.className = 'wish-meta';
    var bits = [item.mine ? 'tu' : item.requestedBy];
    if (item.note) bits.push(item.note);
    if (item.isFulfilled) {
      bits.push('preso' + (item.fulfilledByUsername ? ' da ' + item.fulfilledByUsername : ''));
    }
    meta.textContent = bits.join(' · ');
    text.appendChild(meta);
    row.appendChild(text);

    var actions = document.createElement('div');
    actions.className = 'wish-actions';
    actions.appendChild(button(
      item.isFulfilled ? 'Annulla' : 'Preso',
      item.isFulfilled ? 'btn-ghost' : 'btn-primary',
      function () {
        api('/api/wishlist/' + item.id + '/fulfilled', {
          method: 'POST',
          body: JSON.stringify({ isFulfilled: !item.isFulfilled })
        }).then(refresh).catch(function (err) { notify(err.message, 'error'); });
      }
    ));
    if (item.mine || state.user.isAdmin) {
      actions.appendChild(button('Elimina', 'btn-danger', function () {
        api('/api/wishlist/' + item.id, { method: 'DELETE' })
          .then(refresh)
          .catch(function (err) { notify(err.message, 'error'); });
      }));
    }
    row.appendChild(actions);
    return row;
  }

  // A full reload redraws every card and re-renders the wishlists left open,
  // which also refreshes the counters in each header.
  function renderWishlist(destination, container) {
    var refresh = function () { return load(); };

    var list = document.createElement('ul');
    list.className = 'wish-list';
    container.innerHTML = '';
    container.appendChild(list);

    var form = document.createElement('div');
    form.className = 'wish-form';

    var product = document.createElement('input');
    product.placeholder = 'Cosa vorresti da ' + destination.name + '?';
    product.maxLength = 160;

    var quantity = document.createElement('input');
    quantity.type = 'number';
    quantity.min = '1';
    quantity.max = '999';
    quantity.value = '1';
    quantity.className = 'quantity';

    var note = document.createElement('input');
    note.placeholder = 'Nota (facoltativa)';
    note.maxLength = 500;

    var add = button('Aggiungi ai desideri', 'btn-primary', function () {
      api('/api/destinations/' + destination.id + '/wishlist', {
        method: 'POST',
        body: JSON.stringify({
          product: product.value.trim(),
          quantity: Number(quantity.value || 1),
          note: note.value.trim() || null
        })
      })
        .then(function () {
          product.value = '';
          note.value = '';
          quantity.value = '1';
          Camper.clearNotice(el.message);
          return refresh();
        })
        .catch(function (err) { notify(err.message, 'error'); });
    });

    [product, quantity, note, add].forEach(function (node) { form.appendChild(node); });
    container.appendChild(form);

    return api('/api/destinations/' + destination.id + '/wishlist').then(function (data) {
      list.innerHTML = '';
      if (data.items.length === 0) {
        var empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'Ancora nessun desiderio per questa tappa.';
        list.appendChild(empty);
      }
      data.items.forEach(function (item) {
        list.appendChild(renderWishlistItem(item, refresh));
      });
    });
  }

  // ------------------------------------------------------------ destinations

  function renderDestination(destination) {
    var card = document.createElement('article');
    card.className = 'destination';

    var head = document.createElement('div');
    head.className = 'destination-head';

    var heading = document.createElement('div');
    var title = document.createElement('h3');
    title.textContent = destination.name + (destination.country ? ' · ' + destination.country : '');
    heading.appendChild(title);

    var meta = document.createElement('p');
    meta.className = 'destination-meta';
    meta.textContent = travelWindow(destination) +
      ' · proposta da ' + destination.createdByUsername +
      ' · ' + destination.wishlistCount + ' desideri' +
      (destination.myWishlistCount ? ' (' + destination.myWishlistCount + ' tuoi)' : '');
    heading.appendChild(meta);
    head.appendChild(heading);

    var actions = document.createElement('div');
    actions.className = 'destination-actions';

    var body = document.createElement('div');
    body.className = 'wishlist-panel';
    var isOpen = Boolean(state.open[destination.id]);
    body.classList.toggle('hidden', !isOpen);

    var toggle = button(isOpen ? 'Chiudi lista' : 'Lista dei desideri', 'btn-ghost', function () {
      var nowOpen = body.classList.contains('hidden');
      state.open[destination.id] = nowOpen;
      body.classList.toggle('hidden', !nowOpen);
      toggle.textContent = nowOpen ? 'Chiudi lista' : 'Lista dei desideri';
      if (nowOpen) renderWishlist(destination, body);
    });
    actions.appendChild(toggle);

    if (destination.canEdit || state.user.isAdmin) {
      actions.appendChild(button('Elimina', 'btn-danger', function () {
        if (!window.confirm('Eliminare "' + destination.name + '" e la sua lista dei desideri?')) return;
        api('/api/destinations/' + destination.id, { method: 'DELETE' })
          .then(function () {
            delete state.open[destination.id];
            return load();
          })
          .catch(function (err) { notify(err.message, 'error'); });
      }));
    }

    head.appendChild(actions);
    card.appendChild(head);

    if (destination.description) {
      var description = document.createElement('p');
      description.className = 'destination-description';
      description.textContent = destination.description;
      card.appendChild(description);
    }

    card.appendChild(body);
    if (isOpen) renderWishlist(destination, body);
    return card;
  }

  function render() {
    el.list.innerHTML = '';
    el.empty.classList.toggle('hidden', state.destinations.length > 0);
    state.destinations.forEach(function (destination) {
      el.list.appendChild(renderDestination(destination));
    });
  }

  function load() {
    return api('/api/destinations').then(function (data) {
      state.destinations = data.destinations;
      render();
    });
  }

  document.getElementById('add-destination').addEventListener('click', function () {
    Camper.clearNotice(el.message);
    api('/api/destinations', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('name').value.trim(),
        country: document.getElementById('country').value.trim() || null,
        description: document.getElementById('description').value.trim() || null,
        travelFrom: document.getElementById('travel-from').value || null,
        travelTo: document.getElementById('travel-to').value || null
      })
    })
      .then(function (data) {
        notify('Tappa "' + data.destination.name + '" aggiunta.', 'ok');
        ['name', 'country', 'description', 'travel-from', 'travel-to'].forEach(function (id) {
          document.getElementById(id).value = '';
        });
        return load();
      })
      .catch(function (err) { notify(err.message, 'error'); });
  });

  Camper.start('/destinations')
    .then(function (user) {
      state.user = user;
      return load();
    })
    .catch(function (err) {
      if (err.message !== 'unauthenticated') notify(err.message, 'error');
    });
})();
