// Admin editor: add, move and remove items, grow text boxes, count names, and warn before leaving with unsaved changes.
(function () {
  var form = document.getElementById('editor');

  function grow(el) {
    if (el.tagName !== 'TEXTAREA' || el.classList.contains('mono')) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 640) + 'px';
  }
  document.querySelectorAll('textarea').forEach(grow);

  // Number the fields of each list in their on-screen order before the form is sent.
  function renumber() {
    document.querySelectorAll('.rows').forEach(function (box) {
      var group = box.getAttribute('data-group');
      var items = box.querySelectorAll(':scope > .item');
      items.forEach(function (item, i) {
        item.querySelectorAll('[name]').forEach(function (el) {
          var rest = el.name.slice(group.length + 1).replace(/^[^.]+/, '');
          el.name = group + '.' + i + rest;
        });
      });
    });
  }

  var dirty = false;
  var saving = false;
  if (form) {
    form.addEventListener('input', function (e) {
      dirty = true;
      grow(e.target);
      var counter = document.querySelector('[data-count-for="' + e.target.name + '"]');
      if (counter) counter.textContent = e.target.value.split('\n').filter(function (s) { return s.trim(); }).length;
    });
    form.addEventListener('submit', function (e) {
      renumber();
      var submitter = e.submitter;
      var isPreview = submitter && submitter.getAttribute('formaction') === '/admin/preview';
      if (!isPreview) saving = true;
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var box = btn.closest('.rows');
    var act = btn.getAttribute('data-act');
    if (act === 'add') {
      var tpl = box.querySelector(':scope > template');
      var node = tpl.content.firstElementChild.cloneNode(true);
      box.insertBefore(node, tpl);
      var first = node.querySelector('input, textarea');
      if (first) first.focus();
    } else {
      var item = btn.closest('.item');
      if (act === 'remove') {
        var filled = Array.prototype.some.call(item.querySelectorAll('input, textarea'), function (el) { return el.value.trim(); });
        if (filled && !window.confirm('Remove this item? It disappears from the site when you save.')) return;
        item.remove();
      }
      if (act === 'up' && item.previousElementSibling && item.previousElementSibling.classList.contains('item')) box.insertBefore(item, item.previousElementSibling);
      if (act === 'down' && item.nextElementSibling && item.nextElementSibling.classList.contains('item')) box.insertBefore(item.nextElementSibling, item);
    }
    dirty = true;
  });

  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (dirty && !window.confirm('You have unsaved changes in the editor. They will be lost. Continue?')) { e.preventDefault(); return; }
      if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
      else saving = true;
    });
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty && !saving) { e.preventDefault(); e.returnValue = ''; }
  });
})();
