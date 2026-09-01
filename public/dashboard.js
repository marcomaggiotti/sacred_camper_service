(function () {
  'use strict';

  var MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  var DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  var state = {
    user: null,
    vehicles: [],
    vehicleId: null,
    reservations: [],
    cursor: startOfMonth(new Date()),
    selection: { start: null, end: null }
  };

  var api = Camper.api;

  var el = {
    vehicle: document.getElementById('vehicle'),
    calendar: document.getElementById('calendar'),
    monthLabel: document.getElementById('month-label'),
    start: document.getElementById('start'),
    end: document.getElementById('end'),
    note: document.getElementById('note'),
    message: document.getElementById('message'),
    rows: document.getElementById('reservation-rows'),
    noRows: document.getElementById('no-reservations')
  };

  // ------------------------------------------------------------ date helpers

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  // Local-time ISO day, so the calendar never shifts across the UTC boundary.
  function iso(date) {
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  var todayIso = Camper.todayIso;
  var formatIt = Camper.formatIt;

  // ---------------------------------------------------------------- requests

  function notify(text, kind) {
    Camper.notify(el.message, text, kind);
  }

  function clearNotice() {
    Camper.clearNotice(el.message);
  }

  // ---------------------------------------------------------------- calendar

  function reservationOn(isoDay) {
    for (var i = 0; i < state.reservations.length; i++) {
      var r = state.reservations[i];
      if (r.vehicleId === state.vehicleId && r.startDate <= isoDay && r.endDate >= isoDay) {
        return r;
      }
    }
    return null;
  }

  function inSelection(isoDay) {
    var sel = state.selection;
    if (!sel.start) return false;
    var end = sel.end || sel.start;
    return isoDay >= sel.start && isoDay <= end;
  }

  function renderCalendar() {
    var year = state.cursor.getFullYear();
    var month = state.cursor.getMonth();
    el.monthLabel.textContent = MONTHS[month] + ' ' + year;
    el.calendar.innerHTML = '';

    DOW.forEach(function (name) {
      var head = document.createElement('div');
      head.className = 'dow';
      head.textContent = name;
      el.calendar.appendChild(head);
    });

    // getDay() is Sunday-based; the grid starts on Monday.
    var first = new Date(year, month, 1);
    var lead = (first.getDay() + 6) % 7;
    for (var b = 0; b < lead; b++) {
      var blank = document.createElement('div');
      blank.className = 'day blank';
      el.calendar.appendChild(blank);
    }

    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = todayIso();

    for (var d = 1; d <= daysInMonth; d++) {
      var isoDay = iso(new Date(year, month, d));
      var booking = reservationOn(isoDay);

      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'day';
      cell.dataset.day = isoDay;

      if (isoDay === today) cell.classList.add('today');
      if (isoDay < today) { cell.classList.add('past'); cell.disabled = true; }
      if (booking) {
        cell.classList.add('booked');
        if (booking.mine) cell.classList.add('mine');
        cell.disabled = true;
      }
      if (inSelection(isoDay)) cell.classList.add('selected');

      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(d);
      cell.appendChild(num);

      if (booking) {
        var who = document.createElement('span');
        who.className = 'who';
        who.textContent = booking.mine ? 'tu' : booking.username;
        cell.appendChild(who);
      }

      cell.addEventListener('click', onDayClick);
      el.calendar.appendChild(cell);
    }
  }

  function onDayClick(event) {
    var day = event.currentTarget.dataset.day;
    var sel = state.selection;

    if (!sel.start || sel.end || day < sel.start) {
      // Start a fresh range.
      sel.start = day;
      sel.end = null;
    } else {
      sel.end = day;
    }

    el.start.value = sel.start;
    el.end.value = sel.end || sel.start;
    clearNotice();
    renderCalendar();
  }

  function syncSelectionFromInputs() {
    state.selection.start = el.start.value || null;
    state.selection.end = el.end.value || null;
    renderCalendar();
  }

  // ------------------------------------------------------------------- lists

  function renderReservations() {
    el.rows.innerHTML = '';
    var upcoming = state.reservations.filter(function (r) {
      return r.endDate >= todayIso();
    });

    el.noRows.classList.toggle('hidden', upcoming.length > 0);

    upcoming.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.vehicleName, formatIt(r.startDate), formatIt(r.endDate),
        r.mine ? 'Tu' : (r.fullName || r.username), r.note || '—'
      ].forEach(function (value) {
        var td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });

      var actions = document.createElement('td');
      if (r.mine || (state.user && state.user.isAdmin)) {
        var button = document.createElement('button');
        button.className = 'btn-danger btn-small';
        button.textContent = 'Annulla';
        button.addEventListener('click', function () {
          if (!window.confirm('Annullare questa prenotazione?')) return;
          api('/api/reservations/' + r.id, { method: 'DELETE' })
            .then(function () {
              notify('Prenotazione annullata.', 'ok');
              return loadReservations();
            })
            .catch(function (err) { notify(err.message, 'error'); });
        });
        actions.appendChild(button);
      }
      tr.appendChild(actions);
      el.rows.appendChild(tr);
    });
  }

  function loadReservations() {
    return api('/api/reservations').then(function (data) {
      state.reservations = data.reservations;
      renderCalendar();
      renderReservations();
    });
  }

  // ------------------------------------------------------------------- setup

  function reserve() {
    clearNotice();
    var start = el.start.value;
    var end = el.end.value || start;
    if (!start) {
      notify('Scegli almeno un giorno sul calendario.', 'error');
      return;
    }
    api('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({
        vehicleId: state.vehicleId,
        startDate: start,
        endDate: end,
        note: el.note.value || null
      })
    })
      .then(function () {
        notify('Camper prenotato dal ' + formatIt(start) + ' al ' + formatIt(end) + '. Buon viaggio!', 'ok');
        el.note.value = '';
        state.selection = { start: null, end: null };
        el.start.value = '';
        el.end.value = '';
        return loadReservations();
      })
      .catch(function (err) { notify(err.message, 'error'); });
  }

  function bind() {
    document.getElementById('prev').addEventListener('click', function () {
      state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
      renderCalendar();
    });
    document.getElementById('next').addEventListener('click', function () {
      state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
      renderCalendar();
    });
    document.getElementById('reserve').addEventListener('click', reserve);
    document.getElementById('clear').addEventListener('click', function () {
      state.selection = { start: null, end: null };
      el.start.value = '';
      el.end.value = '';
      clearNotice();
      renderCalendar();
    });
    el.start.addEventListener('change', syncSelectionFromInputs);
    el.end.addEventListener('change', syncSelectionFromInputs);
    el.vehicle.addEventListener('change', function () {
      state.vehicleId = Number(el.vehicle.value);
      renderCalendar();
    });
  }

  Camper.start('/dashboard')
    .then(function (user) {
      state.user = user;
      el.start.min = todayIso();
      el.end.min = todayIso();
      return api('/api/vehicles');
    })
    .then(function (data) {
      state.vehicles = data.vehicles;
      if (state.vehicles.length === 0) {
        notify('Nessun camper disponibile: chiedi all\'amministratore di aggiungerne uno.', 'error');
        return null;
      }
      state.vehicleId = state.vehicles[0].id;
      state.vehicles.forEach(function (v) {
        var option = document.createElement('option');
        option.value = v.id;
        option.textContent = v.name + (v.plate ? ' (' + v.plate + ')' : '');
        el.vehicle.appendChild(option);
      });
      return loadReservations();
    })
    .then(bind)
    .catch(function (err) {
      if (err.message !== 'unauthenticated') notify(err.message, 'error');
    });
})();
