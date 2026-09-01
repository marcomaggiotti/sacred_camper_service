(function () {
  'use strict';

  var api = Camper.api;
  var state = { user: null, tasks: [], filter: 'all' };

  var el = {
    list: document.getElementById('task-list'),
    empty: document.getElementById('no-tasks'),
    message: document.getElementById('message'),
    title: document.getElementById('title'),
    due: document.getElementById('due'),
    description: document.getElementById('description'),
    assignMe: document.getElementById('assign-me')
  };

  var STATUS_LABEL = { todo: 'Da fare', doing: 'In corso', done: 'Fatta' };

  function notify(text, kind) {
    Camper.notify(el.message, text, kind);
  }

  function matchesFilter(task) {
    switch (state.filter) {
      case 'open': return task.status !== 'done';
      case 'mine': return task.mine;
      case 'free': return task.assigneeId === null && task.status !== 'done';
      case 'done': return task.status === 'done';
      default: return true;
    }
  }

  function button(label, className, handler) {
    var element = document.createElement('button');
    element.className = className + ' btn-small';
    element.textContent = label;
    element.addEventListener('click', handler);
    return element;
  }

  function act(promise) {
    return promise
      .then(function () { return load(); })
      .catch(function (err) { notify(err.message, 'error'); });
  }

  function renderTask(task) {
    var item = document.createElement('li');
    item.className = 'task' + (task.status === 'done' ? ' done' : '');

    var main = document.createElement('div');
    main.className = 'task-main';

    var titleRow = document.createElement('div');
    titleRow.className = 'task-title';
    titleRow.textContent = task.title;

    var badge = document.createElement('span');
    badge.className = 'badge ' + task.status;
    badge.textContent = STATUS_LABEL[task.status];
    titleRow.appendChild(badge);
    main.appendChild(titleRow);

    if (task.description) {
      var description = document.createElement('p');
      description.className = 'task-description';
      description.textContent = task.description;
      main.appendChild(description);
    }

    var meta = document.createElement('p');
    meta.className = 'task-meta';
    var bits = ['creata da ' + task.createdByUsername];
    if (task.assigneeId) {
      bits.push(task.mine ? 'assegnata a te' : 'assegnata a ' + task.assigneeName);
    } else {
      bits.push('non assegnata');
    }
    if (task.dueDate) bits.push('entro il ' + Camper.formatIt(task.dueDate));
    meta.textContent = bits.join(' · ');
    main.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'task-actions';

    if (!task.assigneeId && task.status !== 'done') {
      actions.appendChild(button('Prendo io', 'btn-primary', function () {
        act(api('/api/tasks/' + task.id + '/assignee', { method: 'POST', body: '{}' }));
      }));
    }
    if (task.mine && task.status !== 'done') {
      actions.appendChild(button('Lascia', 'btn-ghost', function () {
        act(api('/api/tasks/' + task.id + '/assignee', {
          method: 'POST',
          body: JSON.stringify({ release: true })
        }));
      }));
    }
    if (task.canEdit && task.status !== 'done') {
      actions.appendChild(button('Fatta', 'btn-ghost', function () {
        act(api('/api/tasks/' + task.id + '/status', {
          method: 'POST',
          body: JSON.stringify({ status: 'done' })
        }));
      }));
    }
    if (task.canEdit && task.status === 'done') {
      actions.appendChild(button('Riapri', 'btn-ghost', function () {
        act(api('/api/tasks/' + task.id + '/status', {
          method: 'POST',
          body: JSON.stringify({ status: task.assigneeId ? 'doing' : 'todo' })
        }));
      }));
    }
    if (task.createdBy === state.user.id || state.user.isAdmin) {
      actions.appendChild(button('Elimina', 'btn-danger', function () {
        if (!window.confirm('Eliminare "' + task.title + '"?')) return;
        act(api('/api/tasks/' + task.id, { method: 'DELETE' }));
      }));
    }

    item.appendChild(main);
    item.appendChild(actions);
    return item;
  }

  function render() {
    el.list.innerHTML = '';
    var visible = state.tasks.filter(matchesFilter);
    el.empty.classList.toggle('hidden', visible.length > 0);
    visible.forEach(function (task) {
      el.list.appendChild(renderTask(task));
    });
  }

  function load() {
    return api('/api/tasks').then(function (data) {
      state.tasks = data.tasks;
      render();
    });
  }

  document.getElementById('add-task').addEventListener('click', function () {
    Camper.clearNotice(el.message);
    api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: el.title.value.trim(),
        description: el.description.value.trim() || null,
        dueDate: el.due.value || null,
        assignToMe: el.assignMe.checked
      })
    })
      .then(function () {
        notify('Aggiunta alla lista.', 'ok');
        el.title.value = '';
        el.description.value = '';
        el.due.value = '';
        el.assignMe.checked = false;
        return load();
      })
      .catch(function (err) { notify(err.message, 'error'); });
  });

  document.getElementById('filters').addEventListener('click', function (event) {
    var chip = event.target.closest('.chip');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    Array.prototype.forEach.call(this.querySelectorAll('.chip'), function (other) {
      other.classList.toggle('active', other === chip);
    });
    render();
  });

  Camper.start('/tasks')
    .then(function (user) {
      state.user = user;
      return load();
    })
    .catch(function (err) {
      if (err.message !== 'unauthenticated') notify(err.message, 'error');
    });
})();
