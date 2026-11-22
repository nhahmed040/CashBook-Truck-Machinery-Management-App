(function () {
  'use strict';

  var L = window.CBLogic;
  var STORAGE_KEY = 'truckbook.data.v1';
  var SECTIONS = ['overview', 'trucks', 'trips', 'costs', 'customers', 'drivers', 'cash', 'books'];

  var $ = function (id) { return document.getElementById(id); };
  var CAL = window.CBCal;

  /* ---------- state ---------- */
  var state = loadState();
  var ui = {
    view: 'entries', bookOpen: false, bookQ: '', bookSort: 'updated',
    q: '', type: 'all', from: '', to: '', mode: '', by: '', category: '', contactId: 0, cq: '', ckind: 'all', rFrom: '', rTo: '', rScope: 'book',
    month: CAL.get(state.settings.calendar).monthKey(L.todayStr()),
    editingId: null,
    projectId: '', section: 'overview',
    labourDate: L.todayStr()
  };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return L.sanitizeState(JSON.parse(raw), { keepPin: true });
    } catch (e) { /* fall through to a fresh state */ }
    return L.sanitizeState(null, { keepPin: true });
  }

  /* small "pop" animation when a number changes */
  function setVal(node, text) {
    if (node.textContent === text) return;
    var had = node.textContent !== '';
    node.textContent = text;
    if (had) { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); }
  }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* ignore */ } }
  var rev = 0;                       // bumps on every local change (sync checks it)
  /* a failed save must never be silent: show a red banner until a save works again */
  var saveFailed = false;
  function showSaveError(on) {
    var b = document.getElementById('saveErrBanner');
    if (!on) { if (b) b.hidden = true; return; }
    if (!b) {
      b = el('div', 'bkbanner saveerr');
      b.id = 'saveErrBanner';
      b.setAttribute('role', 'alert');
      b.appendChild(el('span', 'bktext', t('save_failed')));
      b.appendChild(btn(t('backup_now'), 'primary', function () { doBackup(); }));
      document.body.insertBefore(b, document.body.firstChild);
    }
    b.hidden = false;
  }
  function saveRaw() {
    var ok = true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { ok = false; }
    if (ok === saveFailed) { saveFailed = !ok; showSaveError(!ok); }
  }
  /* each book remembers the day it last changed: a cheap fingerprint of its name and entries is compared on every save */
  var bookFp = {};
  function fingerprint(b) {
    var s = JSON.stringify([b.name, b.entries]), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h + ':' + s.length;
  }
  function touchBooks() {
    state.books.forEach(function (b) {
      var f = fingerprint(b);
      if (bookFp[b.id] !== undefined && bookFp[b.id] !== f) b.updated = L.todayStr();
      bookFp[b.id] = f;
    });
  }
  function save() {
    rev++;
    touchBooks();
    saveRaw();
    if (window.__scheduleSync) window.__scheduleSync();
  }
  function canEdit(b) { return !b.sync || b.sync.role !== 'view'; }

  function book() {
    for (var i = 0; i < state.books.length; i++) if (state.books[i].id === state.current) return state.books[i];
    state.current = state.books[0].id;
    return state.books[0];
  }
  function bookById(id) {
    for (var i = 0; i < state.books.length; i++) if (state.books[i].id === id) return state.books[i];
    return null;
  }
  function projectById(id) {
    for (var i = 0; i < state.projects.length; i++) if (state.projects[i].id === id) return state.projects[i];
    return null;
  }
  function currentProject() { return projectById(ui.projectId); }
  function projectOfBook(b) { return b && b.projectId ? projectById(b.projectId) : null; }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- i18n / formatting ---------- */
  function t(key, vars) {
    var dict = window.CB_I18N[state.settings.lang] || {};
    var s = dict[key] != null ? dict[key] : (window.CB_I18N.en[key] != null ? window.CB_I18N.en[key] : key);
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function codeLabel(c) { return t('code_' + c); }

  function money(n) {
    var cur = state.settings.currency;
    if (cur !== 'none') {
      try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(n); } catch (e) { /* fall back */ }
    }
    return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) { return (Math.round(n * 10) / 10) + '%'; }

  function applyStaticText() {
    document.documentElement.lang = state.settings.lang === 'om' ? 'om' : state.settings.lang === 'am' ? 'am' : 'en';
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria]'), function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    $('fab').setAttribute('aria-label', t('add_entry'));
  }

  /* ---------- theme ---------- */
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    var th = state.settings.theme;
    var dark = th === 'dark' || (th === 'system' && darkQuery && darkQuery.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

  /* ---------- calendar ---------- */
  function cal() { return CAL.get(state.settings.calendar); }
  /* Dates are stored as Gregorian ISO strings; this only changes how they are shown.
     suffix = true adds "E.C." (printed documents). */
  function fmtDate(iso, suffix) {
    if (!iso) return '';
    return cal().formatDate(iso, state.settings.lang, suffix ? { suffix: true } : undefined);
  }

  var nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  function dropDate(input) {
    if (input._ethW) {
      if (input._ethW.parentNode) input._ethW.parentNode.removeChild(input._ethW);
      input._ethW = null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'value')) delete input.value; // back to the native property
    input.classList.remove('vh');
  }

  /* In Ethiopian mode a date input is kept (hidden) as the data holder and three selects
     (day, month, year) are shown instead. Setting input.value from code keeps them in step. */
  function makeDate(input, optional) {
    dropDate(input);
    var C = cal();
    if (C.id !== 'ethiopian') return;
    var lang = state.settings.lang;
    var wrap = el('div', 'ethdate');
    var dSel = document.createElement('select'), mSel = document.createElement('select'), ySel = document.createElement('select');
    dSel.setAttribute('aria-label', t('day'));
    mSel.setAttribute('aria-label', t('month'));
    ySel.setAttribute('aria-label', t('year'));
    wrap.appendChild(dSel); wrap.appendChild(mSel); wrap.appendChild(ySel);
    input.parentNode.insertBefore(wrap, input.nextSibling);
    input._ethW = wrap;
    input.classList.add('vh');
    var thisYear = C.parts(L.todayStr()).y;

    function fillDays(y, m) {
      var keep = dSel.value;
      dSel.textContent = '';
      if (optional) dSel.appendChild(option('', '—'));
      var n = y && m ? C.daysInMonth(y, m) : (m === 13 ? 5 : 30);
      for (var d = 1; d <= n; d++) dSel.appendChild(option(String(d), String(d)));
      if (keep && +keep > n) keep = String(n); // e.g. Pagume 6 -> 5 in a non-leap year
      dSel.value = keep || (optional ? '' : '1');
    }

    function sync() {
      var p = C.parts(nativeValue.get.call(input));
      var yearFrom = Math.min(thisYear - 12, p ? p.y : thisYear), yearTo = Math.max(thisYear + 8, p ? p.y : thisYear);
      mSel.textContent = ''; ySel.textContent = '';
      if (optional) { mSel.appendChild(option('', '—')); ySel.appendChild(option('', '—')); }
      for (var m = 1; m <= 13; m++) mSel.appendChild(option(String(m), C.monthName(m, lang)));
      for (var y = yearFrom; y <= yearTo; y++) ySel.appendChild(option(String(y), String(y)));
      if (p) {
        mSel.value = String(p.m); ySel.value = String(p.y);
        dSel.textContent = '';
        fillDays(p.y, p.m);
        dSel.value = String(p.d);
      } else if (optional) {
        mSel.value = ''; ySel.value = '';
        dSel.textContent = '';
        fillDays(0, 0);
      } else {
        // a required date is never left empty: start from today
        nativeValue.set.call(input, L.todayStr());
        sync();
      }
    }

    function write() {
      var y = +ySel.value, m = +mSel.value, d = +dSel.value;
      nativeValue.set.call(input, y && m && d ? C.fromParts(y, m, d) : '');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    mSel.addEventListener('change', function () { fillDays(+ySel.value, +mSel.value); write(); });
    ySel.addEventListener('change', function () { fillDays(+ySel.value, +mSel.value); write(); });
    dSel.addEventListener('change', write);

    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return nativeValue.get.call(input); },
      set: function (v) { nativeValue.set.call(input, v); sync(); }
    });
    sync();
  }

  function enhanceStaticDates() {
    makeDate($('date'), false);
    makeDate($('fromDate'), true);
    makeDate($('toDate'), true);
    makeDate($('rFrom'), true);
    makeDate($('rTo'), true);
  }

  /* ---------- small helpers ---------- */
  var toastTimer = null;
  function toast(msg, action) {
    var e = $('toast');
    e.textContent = msg;
    e.classList.toggle('hasact', !!action);
    if (action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'toastact';
      b.textContent = action.label;
      b.addEventListener('click', function () { e.classList.remove('show'); clearTimeout(toastTimer); action.run(); });
      e.appendChild(b);
    }
    e.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { e.classList.remove('show'); }, action ? 7000 : 2600);
  }

  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls, onClick) {
    var b = el('button', cls || '', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function option(value, label) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }
  function kv(label, value, cls, total) {
    var r = el('div', 'kvrow' + (total || cls === 'total' ? ' total' : ''));
    r.appendChild(el('span', null, label));
    var b = el('b', cls === 'pos' || cls === 'neg' ? cls : '', value);
    r.appendChild(b);
    return r;
  }
  function addDays(s, n) {
    var d = new Date(s + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function safeName(s) { return String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'book'; }

  /* ---------- photos ---------- */
  var photoCache = {};
  function photoData(id) {
    if (photoCache[id]) return Promise.resolve(photoCache[id]);
    return window.CBPhotos.get(id).then(function (d) { if (d) photoCache[id] = d; return d; });
  }
  function newPhotoState(ids) { return { ids: (ids || []).slice(), added: [], removed: [] }; }
  function deletePhotoIds(ids) {
    (ids || []).forEach(function (id) { window.CBPhotos.del(id); delete photoCache[id]; });
  }
  function commitPhotos(st) { deletePhotoIds(st.removed); st.removed = []; st.added = []; }
  function rollbackPhotos(st) { deletePhotoIds(st.added); st.added = []; st.removed = []; }
  function entryPhotoIds(entries) {
    var ids = [];
    entries.forEach(function (e) { ids = ids.concat(e.photos || []); });
    return ids;
  }
  function allPhotoIds() {
    var ids = [];
    state.books.forEach(function (b) { ids = ids.concat(entryPhotoIds(b.entries)); });
    state.projects.forEach(function (p) {
      ids = ids.concat(p.photos);
      p.bills.forEach(function (b) { ids = ids.concat(b.photos); });
      p.trucks.forEach(function (x) { ids = ids.concat(x.photos); });
    });
    ids = ids.concat(L.trashPhotoIds(state.trash));
    return ids.filter(function (id, i) { return ids.indexOf(id) === i; });
  }

  /* ---------- Recently deleted (30 days) ---------- */
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  /* Put a removed item in the trash. Its photos stay on the phone until it is deleted for good. */
  function trashPut(kind, label, payload, ctx, photos, noUndo) {
    var rec = { id: L.newId(), kind: kind, label: String(label || '').slice(0, 120), deletedAt: Date.now(), payload: clone(payload), ctx: ctx || {}, photos: (photos || []).slice() };
    state.trash = [rec].concat(state.trash || []).slice(0, 200);
    if (!noUndo) pendingUndo = rec;
    return rec;
  }
  var pendingUndo = null;
  /* shows the "Deleted · Undo" message after save(); call once the screen is redrawn */
  function undoToast() {
    var rec = pendingUndo;
    pendingUndo = null;
    if (!rec) return;
    toast(t('deleted_toast', { n: rec.label }), { label: t('undo'), run: function () { if (trashRestore(rec)) { save(); renderAll(); toast(t('restored_item')); } } });
  }
  function trashDrop(rec) {
    state.trash = state.trash.filter(function (r) { return r.id !== rec.id; });
    var keep = {};
    L.trashPhotoIds(state.trash).concat(allPhotoIdsNoTrash()).forEach(function (id) { keep[id] = 1; });
    deletePhotoIds((rec.photos || []).filter(function (id) { return !keep[id]; }));
  }
  function allPhotoIdsNoTrash() {
    var ids = [];
    state.books.forEach(function (b) { ids = ids.concat(entryPhotoIds(b.entries)); });
    state.projects.forEach(function (p) { ids = ids.concat(p.photos); p.bills.forEach(function (b) { ids = ids.concat(b.photos); }); p.trucks.forEach(function (x) { ids = ids.concat(x.photos); }); });
    return ids;
  }
  /* returns true when the item is back; the caller saves and redraws */
  function trashRestore(rec) {
    var x = L.trashRestoreItem(rec), c = rec.ctx || {}, pr, i;
    if (!x) { toast(t('restore_fail')); return false; }
    function proj() { return state.projects.filter(function (q) { return q.id === c.projectId; })[0]; }
    function freshId(list) { while (list.some(function (q) { return q.id === x.id; })) x.id = L.newId(); }
    switch (rec.kind) {
      case 'entry':
        var bk = state.books.filter(function (b) { return b.id === c.bookId; })[0] || book();
        freshId(bk.entries); bk.entries.push(x); break;
      case 'trip':
        pr = proj(); if (!pr) { toast(t('trash_no_parent')); return false; }
        freshId(pr.trips); if (x.invoiceId && !pr.invoices.some(function (q) { return q.id === x.invoiceId; })) x.invoiceId = 0; pr.trips.push(x); break;
      case 'truck':
        pr = proj(); if (!pr) { toast(t('trash_no_parent')); return false; }
        freshId(pr.trucks); pr.trucks.push(x); break;
      case 'cash':
        pr = proj(); if (!pr) { toast(t('trash_no_parent')); return false; }
        freshId(pr.cash); x.entryId = 0; x.bookId = ''; pr.cash.push(x); break;
      case 'bill':
        pr = proj(); if (!pr) { toast(t('trash_no_parent')); return false; }
        freshId(pr.bills); pr.bills.push(x); break;
      case 'invoice':
        pr = proj(); if (!pr) { toast(t('trash_no_parent')); return false; }
        freshId(pr.invoices); pr.invoices.push(x);
        (c.tripIds || []).forEach(function (tid) { pr.trips.forEach(function (tr) { if (tr.id === tid && !tr.invoiceId) tr.invoiceId = x.id; }); });
        break;
      case 'contact':
        freshId(state.contacts); state.contacts.push(x); break;
      case 'project':
        while (state.projects.some(function (q) { return q.id === x.id; })) x.id = x.id + '_';
        delete x.sync;
        state.projects.push(x); break;
      case 'book':
        while (state.books.some(function (b) { return b.id === x.id; })) x.id = x.id + '_';
        delete x.sync; delete x.nolink;
        if (!state.projects.some(function (q) { return q.id === x.projectId; })) x.projectId = '';
        if (!state.businesses.some(function (q) { return q.id === x.businessId; })) x.businessId = '';
        state.books.push(x); break;
    }
    state.trash = state.trash.filter(function (r) { return r.id !== rec.id; });
    return true;
  }
  /* photos of trash items that expired while the app was closed */
  function purgeExpiredTrashPhotos() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || !Array.isArray(raw.trash)) return;
      var gone = {};
      raw.trash.forEach(function (r) { if (r && Array.isArray(r.photos) && Date.now() - Number(r.deletedAt) > L.TRASH_DAYS * 86400000) r.photos.forEach(function (id) { gone[id] = 1; }); });
      var keep = {};
      allPhotoIds().forEach(function (id) { keep[id] = 1; });
      deletePhotoIds(Object.keys(gone).map(Number).filter(function (id) { return !keep[id]; }));
    } catch (e) { /* ignore */ }
  }

  function viewPhoto(id, onRemove) {
    var img = $('photoImg');
    img.removeAttribute('src');
    $('photoMeta').textContent = '';
    $('photoRemove').hidden = !onRemove;
    $('photoRemove').onclick = function () { closeModal('photoView'); if (onRemove) onRemove(); };
    photoData(id).then(function (d) {
      if (d) img.src = d; else $('photoMeta').textContent = t('photo_missing');
    });
    openModal('photoView');
  }
  $('photoClose').addEventListener('click', function () { closeModal('photoView'); });
  $('photoView').addEventListener('click', function (ev) { if (ev.target === this) closeModal('photoView'); });

  function thumbButton(id, onClick) {
    var b = el('button', 'thumb', '🖼️');
    b.type = 'button';
    b.setAttribute('aria-label', t('photos'));
    photoData(id).then(function (d) {
      if (!d) return;
      var img = document.createElement('img');
      img.alt = '';
      img.src = d;
      b.textContent = '';
      b.appendChild(img);
    });
    b.addEventListener('click', onClick);
    return b;
  }

  /* Read-only strip of thumbnails; tapping one opens the viewer. */
  function thumbsOnly(container, ids) {
    if (!ids || !ids.length) return;
    var strip = el('div', 'photostrip');
    ids.forEach(function (id) { strip.appendChild(thumbButton(id, function () { viewPhoto(id, null); })); });
    container.appendChild(strip);
  }

  /* Editable strip. st = { ids, added, removed }. With a `live` callback, changes apply at once
     (and the callback receives the new id list); otherwise the owner commits or rolls back. */
  function photoWidget(container, st, live, withLabel) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    var camInput = document.createElement('input');
    camInput.type = 'file';
    camInput.accept = 'image/*';
    camInput.setAttribute('capture', 'environment');
    camInput.hidden = true;

    function removePhoto(id) {
      if (!window.confirm(t('confirm_remove_photo'))) return;
      st.ids = st.ids.filter(function (x) { return x !== id; });
      var wasAdded = st.added.indexOf(id) >= 0;
      if (wasAdded) {
        st.added = st.added.filter(function (x) { return x !== id; });
        deletePhotoIds([id]);
      } else if (live) {
        deletePhotoIds([id]);
      } else {
        st.removed.push(id);
      }
      if (live) live(st.ids);
      render();
    }

    function render() {
      container.textContent = '';
      if (withLabel) container.appendChild(el('span', 'photolabel', t('photos')));
      var strip = el('div', 'photostrip');
      st.ids.forEach(function (id) {
        strip.appendChild(thumbButton(id, function () { viewPhoto(id, function () { removePhoto(id); }); }));
      });
      if (st.ids.length < 12) strip.appendChild(btn('📷 ' + t('add_photo'), 'addphoto', function () {
        actionSheet(t('add_photo'), [
          { label: '📷 ' + t('take_photo'), run: function () { camInput.click(); } },
          { label: '🖼 ' + t('choose_photo'), run: function () { input.click(); } }
        ]);
      }));
      container.appendChild(strip);
      container.appendChild(input);
      container.appendChild(camInput);
    }

    function addFrom(inp) {
      var files = Array.prototype.slice.call(inp.files || [], 0, 12 - st.ids.length);
      inp.value = '';
      var failed = false;
      files.reduce(function (chain, file) {
        return chain.then(function () {
          return window.CBPhotos.fileToDataUrl(file).then(function (url) {
            var id = L.newId();
            return window.CBPhotos.put(id, url).then(function () {
              photoCache[id] = url;
              st.ids.push(id);
              st.added.push(id);
            });
          }).catch(function () { failed = true; });
        });
      }, Promise.resolve()).then(function () {
        if (failed) toast(t('photo_fail'));
        if (live) live(st.ids);
        render();
      });
    }
    input.addEventListener('change', function () { addFrom(input); });
    camInput.addEventListener('change', function () { addFrom(camInput); });

    render();
  }

  /* ---------- printing ---------- */
  function printDoc(title, html) {
    if (window.AndroidBridge && typeof window.AndroidBridge.printHtml === 'function') {
      window.AndroidBridge.printHtml(title, html);
      return;
    }
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.onload = function () {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast(t('print_failed')); }
      setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 60000);
    };
    f.srcdoc = html;
    document.body.appendChild(f);
  }

  function printInvoice(p, inv) {
    var title = (t('invoice_title') + ' ' + (inv.no || '')).trim();
    var trips = L.tripsOfInvoice(p, inv.id).sort(function (a, c) { return a.date < c.date ? -1 : a.date > c.date ? 1 : a.id - c.id; })
      .map(function (x) { return { trip: x, plate: L.truckName(p, x.truck) }; });
    printDoc(title, window.CBPrint.invoiceHtml({
      t: t, money: money, lang: state.settings.lang, project: p, invoice: inv, calc: L.invoiceCalc(p, inv), trips: trips, date: L.todayStr(),
      fmt: function (d) { return fmtDate(d, true); }, rateStr: L.rateStr
    }));
  }

  function printStatement(p) {
    var invs = p.invoices.slice().sort(function (a, c) { return a.date < c.date ? -1 : a.date > c.date ? 1 : a.id - c.id; });
    var ts = L.truckStats(state, p.id);
    printDoc(t('statement_title') + ' – ' + p.name, window.CBPrint.statementHtml({
      t: t, money: money, lang: state.settings.lang, project: p, summary: L.projectSummary(state, p.id), trucks: ts.rows, shared: ts.shared,
      codes: L.CODES, codeLabel: codeLabel, suppliers: L.supplierBalances(p), date: L.todayStr(),
      fmt: function (d) { return fmtDate(d, true); },
      invoices: invs.map(function (c) { return { invoice: c, calc: L.invoiceCalc(p, c) }; })
    }));
  }

  /* ---------- generic form dialog ---------- */
  var formStates = [];
  function rollbackForm() { formStates.forEach(rollbackPhotos); formStates = []; }

  /* opts: { title, fields:[{key,label,type,value,options,required,min,max,step,ph,text}], submitLabel,
             onSubmit(values) -> error string | null, onDelete() } */
  function openForm(opts) {
    rollbackForm();
    $('formTitle').textContent = opts.title;
    $('formErr').textContent = '';
    $('formSubmit').textContent = opts.submitLabel || t('save');
    var body = $('formBody');
    body.textContent = '';
    var inputs = {}, toggles = [];
    (opts.fields || []).forEach(function (f) {
      if (f.type === 'note') { var np = el('p', 'note', f.text); body.appendChild(np); if (f.showFor) toggles.push({ node: np, f: f }); return; }
      if (f.type === 'photos') {
        var holder = el('div');
        photoWidget(holder, f.state, null, true);
        body.appendChild(holder);
        formStates.push(f.state);
        return;
      }
      var label = el('label', 'field');
      label.appendChild(el('span', null, f.label));
      var input;
      if (f.type === 'select') {
        input = document.createElement('select');
        f.options.forEach(function (o) { input.appendChild(option(o.value, o.label)); });
        input.value = f.value != null ? String(f.value) : (f.options.length ? f.options[0].value : '');
      } else {
        input = document.createElement('input');
        input.type = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
        if (f.type === 'number') {
          input.step = f.step || 'any';
          input.inputMode = 'decimal';
          if (f.min != null) input.min = f.min;
          if (f.max != null) input.max = f.max;
        } else if (f.type !== 'date') {
          input.maxLength = f.max || 60;
        }
        if (f.ph) input.placeholder = f.ph;
        input.value = f.value != null ? f.value : '';
      }
      inputs[f.key] = { input: input, field: f, label: label };
      if (f.showFor) toggles.push({ node: label, f: f });
      if (f.type === 'number' && !f.noCalc) {
        var arow = el('div', 'amtrow');
        arow.appendChild(input);
        arow.appendChild(btn('🧮', 'calcbtn', function () { openCalculator(input.value, function (v) { input.value = v; input.dispatchEvent(new Event('input')); }); }));
        label.appendChild(arow);
      } else {
        label.appendChild(input);
      }
      if (f.type === 'date') makeDate(input, !f.required);
      body.appendChild(label);
    });
    function applyShow() {
      toggles.forEach(function (x) {
        var src = inputs[x.f.showFor.key];
        x.node.hidden = !src || x.f.showFor.values.indexOf(src.input.value) < 0;
      });
    }
    Object.keys(inputs).forEach(function (k) { if (inputs[k].field.type === 'select') inputs[k].input.addEventListener('change', applyShow); });
    applyShow();
    $('formDelete').hidden = !opts.onDelete;
    $('formForm').onsubmit = function (ev) {
      ev.preventDefault();
      var values = {};
      var missing = false;
      Object.keys(inputs).forEach(function (k) {
        var f = inputs[k].field, v = inputs[k].input.value;
        if (f.type === 'number') {
          var n = parseFloat(v);
          if (!isFinite(n)) n = NaN;
          if (f.required && !(n > 0) && !inputs[k].label.hidden) missing = true;
          values[k] = isFinite(n) ? n : 0;
        } else {
          v = v.trim();
          if (f.required && !v && !inputs[k].label.hidden) missing = true;
          values[k] = v;
        }
      });
      if (missing) { $('formErr').textContent = t('required'); return; }
      var err = opts.onSubmit(values);
      if (err) { $('formErr').textContent = err; return; }
      formStates.forEach(commitPhotos);
      formStates = [];
      closeModal('formModal');
    };
    $('formDelete').onclick = function () {
      if (opts.onDelete && opts.onDelete() !== false) { rollbackForm(); closeModal('formModal'); }
    };
    openModal('formModal');
    var first = body.querySelector('input,select');
    if (first && opts.focus !== false) setTimeout(function () { first.focus(); }, 60);
  }
  $('formCancel').addEventListener('click', function () { rollbackForm(); closeModal('formModal'); });
  $('formModal').addEventListener('click', function (ev) { if (ev.target === this) { rollbackForm(); closeModal('formModal'); } });

  /* ---------- linking helpers (bill payments / invoice receipts <-> cash entries) ---------- */
  function unlinkEntryEverywhere(entryId) {
    state.projects.forEach(function (p) {
      p.bills.forEach(function (b) { b.payments = b.payments.filter(function (x) { return x.entryId !== entryId; }); });
      p.invoices.forEach(function (c) { c.receipts = c.receipts.filter(function (x) { return x.entryId !== entryId; }); });
    });
  }

  function removeEntryFromBook(bookId, entryId) {
    var b = bookById(bookId);
    if (!b) return;
    b.entries.forEach(function (e) { if (e.id === entryId) deletePhotoIds(e.photos); });
    b.entries = b.entries.filter(function (e) { return e.id !== entryId; });
  }

  function dropPaymentsOfBook(bookId) {
    state.projects.forEach(function (p) {
      p.bills.forEach(function (b) { b.payments = b.payments.filter(function (x) { return x.bookId !== bookId; }); });
      p.invoices.forEach(function (c) { c.receipts = c.receipts.filter(function (x) { return x.bookId !== bookId; }); });
    });
  }

  function clearEntryLinks(kind, id) { // kind: 'billId' | 'invoiceId'
    state.books.forEach(function (b) {
      b.entries.forEach(function (e) { if (e[kind] === id) e[kind] = 0; });
    });
  }

  function linkedBookOptions(project, withNone) {
    var opts = [];
    if (withNone) opts.push({ value: '', label: t('dont_record') });
    L.projectBooks(state, project.id).forEach(function (b) { opts.push({ value: b.id, label: b.name }); });
    return opts;
  }

  /* ---------- rendering: books / entries ---------- */
  function visibleBooks() {
    if (!state.business) return state.books;
    var list = state.books.filter(function (b) { return b.businessId === state.business; });
    return list.length ? list : state.books;
  }

  function renderBooks() {
    var sel = $('bookSelect');
    sel.textContent = '';
    var bs = $('bizSelect');
    bs.textContent = '';
    bs.hidden = !state.businesses.length;
    if (state.businesses.length) {
      bs.appendChild(option('', t('all_businesses')));
      state.businesses.forEach(function (x) { bs.appendChild(option(x.id, x.name)); });
      if (!byId(state.businesses, state.business)) state.business = '';
      bs.value = state.business;
    }
    var shown = visibleBooks();
    if (!shown.some(function (b) { return b.id === state.current; })) state.current = shown[0].id;
    shown.forEach(function (b) { sel.appendChild(option(b.id, (window.__bookIcon ? window.__bookIcon(b) : '') + b.name)); });
    sel.value = book().id;
  }

  function fillSelect(sel, first, items, current) {
    sel.textContent = '';
    sel.appendChild(option('', first));
    items.forEach(function (i) { sel.appendChild(option(i[0], i[1])); });
    sel.value = current != null && current !== 0 && sel.querySelector('option[value="' + String(current).replace(/"/g, '') + '"]') ? String(current) : '';
  }

  function fillFilters(b) {
    var ids = {}, cats = {}, bys = {};
    b.entries.forEach(function (e) {
      if (e.contactId) ids[e.contactId] = true;
      if (e.category) cats[e.category] = true;
      if (e.by) bys[e.by] = true;
    });
    var cs = state.contacts.filter(function (c) { return ids[c.id]; }).map(function (c) { return [String(c.id), c.name]; });
    fillSelect($('contactFilter'), t('all_contacts'), cs, ui.contactId);
    ui.contactId = Number($('contactFilter').value) || 0;
    fillSelect($('modeFilter'), t('all_modes'), L.MODES.map(function (m) { return [m, t('mode_' + m)]; }), ui.mode);
    ui.mode = $('modeFilter').value;
    fillSelect($('byFilter'), t('all_members'), Object.keys(bys).sort().map(function (x) { return [x, x]; }), ui.by);
    ui.by = $('byFilter').value;
    fillSelect($('catFilter'), t('all_categories'), Object.keys(cats).sort().map(function (x) { return [x, x]; }), ui.category);
    ui.category = $('catFilter').value;
  }

  function renderEntries() {
    var b = book();
    $('fab').classList.toggle('vo', !canEdit(b));
    var tot = L.totals(b.entries);
    setVal($('balance'), money(tot.balance));
    setVal($('totalIn'), money(tot.cashIn));
    setVal($('totalOut'), money(tot.cashOut));

    fillFilters(b);
    var filters = {
      q: ui.q, type: ui.type, from: ui.from, to: ui.to, mode: ui.mode, by: ui.by, category: ui.category, contactId: ui.contactId,
      contactText: function (e) { var c = e.contactId ? byId(state.contacts, e.contactId) : null; return c ? (c.name + ' ' + c.phone + ' ' + c.email).toLowerCase() : ''; }
    };
    var shown = L.filterEntries(b.entries, filters).sort(function (a, c) {
      return a.date < c.date ? 1 : a.date > c.date ? -1 : c.id - a.id;
    });

    var active = !!(ui.q || ui.type !== 'all' || ui.from || ui.to || ui.mode || ui.by || ui.category || ui.contactId);
    if (ui.mode || ui.by || ui.category || ui.contactId) $('moreFilters').open = true;
    var ft = $('filterTotals');
    if (active) {
      var s = L.totals(shown);
      ft.textContent = t('filtered') + ': +' + money(s.cashIn) + '  −' + money(s.cashOut) + '  = ' + money(s.balance);
      ft.hidden = false;
    } else {
      ft.hidden = true;
    }

    var list = $('list');
    list.textContent = '';
    var dayNet = {}, lastDay = null, today = L.todayStr();
    shown.forEach(function (e) { dayNet[e.date] = (dayNet[e.date] || 0) + (e.type === 'in' ? e.amount : -e.amount); });
    shown.forEach(function (e) {
      if (e.date !== lastDay) {
        lastDay = e.date;
        var dh = el('li', 'dayhead');
        var dl = el('span', null, fmtDate(e.date));
        if (e.date === today) dl.appendChild(el('span', 'chip', t('today')));
        dh.appendChild(dl);
        var dn = dayNet[e.date];
        dh.appendChild(el('span', 'dnet', (dn < 0 ? '\u2212' : '+') + money(Math.abs(dn))));
        list.appendChild(dh);
      }
      var li = el('li', 'item');
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.appendChild(el('span', 'ico ' + e.type, e.type === 'in' ? '\u2193' : '\u2191'));
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', e.category || (e.type === 'in' ? t('cash_in') : t('cash_out'))));
      var bits = [fmtDate(e.date)];
      if (e.code) bits.push(codeLabel(e.code));
      if (e.party) bits.push(e.party);
      if (e.mode) bits.push(t('mode_' + e.mode));
      if (e.by) bits.push('👤 ' + e.by);
      if (e.note) bits.push(e.note);
      if (e.photos && e.photos.length) bits.push('📷' + e.photos.length);
      meta.appendChild(el('div', 'detail', bits.join(' · ')));
      li.appendChild(meta);
      li.appendChild(el('span', 'amt ' + e.type, (e.type === 'in' ? '+' : '−') + money(e.amount)));
      var open = function () { openEntry(e.id); };
      li.addEventListener('click', open);
      li.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
      list.appendChild(li);
    });

    var emptyEl = $('empty');
    emptyEl.hidden = shown.length > 0;
    emptyEl.textContent = b.entries.length ? t('no_match') : t('no_entries');

    var cl = $('catList');
    cl.textContent = '';
    var seen = {};
    b.entries.forEach(function (e) {
      if (e.category && !seen[e.category]) { seen[e.category] = true; cl.appendChild(option(e.category, '')); }
    });
  }

  function renderBars(container, rows, cls) {
    container.textContent = '';
    if (!rows.length) { container.appendChild(el('p', 'muted small', t('no_data'))); return; }
    var max = rows[0].total || 1;
    rows.forEach(function (r) {
      var row = el('div', 'bar-row');
      var top = el('div', 'bar-top');
      top.appendChild(el('span', null, r.name || t('uncategorized')));
      top.appendChild(el('span', null, money(r.total)));
      var bar = el('div', 'bar ' + cls);
      var fill = document.createElement('i');
      fill.style.width = Math.max(2, Math.round((r.total / max) * 100)) + '%';
      bar.appendChild(fill);
      row.appendChild(top);
      row.appendChild(bar);
      container.appendChild(row);
    });
  }

  function renderReports() {
    var entries = book().entries;
    $('monthLabel').textContent = cal().monthLabel(ui.month, state.settings.lang);
    var m = L.monthTotals(entries, ui.month, cal());
    setVal($('mIn'), money(m.cashIn));
    setVal($('mOut'), money(m.cashOut));
    setVal($('mNet'), money(m.balance));
    initExportPanel();
    renderBars($('catOut'), L.categoryTotals(entries, ui.month, 'out', cal()), 'out');
    renderBars($('catIn'), L.categoryTotals(entries, ui.month, 'in', cal()), 'in');

    var months = L.lastMonths(entries, ui.month, 6, cal());
    var max = 0;
    months.forEach(function (x) { max = Math.max(max, x.cashIn, x.cashOut); });
    var chart = $('chart');
    chart.textContent = '';
    months.forEach(function (x) {
      var col = el('div', 'col');
      var pair = el('div', 'pair');
      [['in', x.cashIn], ['out', x.cashOut]].forEach(function (p) {
        var bar = el('i', p[0]);
        bar.style.height = max ? Math.round((p[1] / max) * 100) + '%' : '0%';
        bar.title = (p[0] === 'in' ? t('cash_in') : t('cash_out')) + ': ' + money(p[1]);
        pair.appendChild(bar);
      });
      col.appendChild(pair);
      col.appendChild(el('small', null, cal().shortLabel(x.month)));
      chart.appendChild(col);
    });
  }

  function renderSettings() {
    $('langSel').value = state.settings.lang;
    $('themeSel').value = state.settings.theme;
    $('calSel').value = state.settings.calendar;
    var cs = $('curSel');
    cs.textContent = '';
    L.CURRENCIES.forEach(function (c) { cs.appendChild(option(c, c === 'none' ? '—' : c)); });
    cs.value = state.settings.currency;

    var hasPin = !!state.settings.pinHash;
    $('pinStatus').textContent = hasPin ? t('pin_on') : t('pin_off');
    $('setPinBtn').textContent = hasPin ? t('change_pin') : t('set_pin');
    $('removePinBtn').hidden = !hasPin;
  }

  /* ---------- rendering: fleets ---------- */
  function renderProjects() {
    var list = $('projList'), detail = $('projDetail');
    if (ui.projectId && !currentProject()) ui.projectId = '';
    list.hidden = !!ui.projectId;
    detail.hidden = !ui.projectId;
    document.body.classList.toggle('proj-detail', !!ui.projectId);
    if (ui.projectId) { renderProjectDetail(detail); return; }

    list.textContent = '';
    if (!state.projects.length) { list.appendChild(el('p', 'empty', t('no_projects'))); return; }
    list.appendChild(btn('💰 ' + t('forecast'), 'block', openForecast));
    state.projects.forEach(function (p) {
      var s = L.projectSummary(state, p.id);
      var card = el('div', 'pcard');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.appendChild(el('h3', null, (window.__projIcon ? window.__projIcon(p) : '') + p.name));
      if (p.owner || p.location) card.appendChild(el('div', 'muted small', [p.owner, p.location].filter(Boolean).join(' · ')));
      card.appendChild(kv(t('trucks'), String(s.activeTrucks)));
      card.appendChild(kv(t('trips_income'), money(s.income) + ' (' + s.trips + ')'));
      card.appendChild(kv(t('actual_cost'), money(s.costTotal)));
      card.appendChild(kv(t('due_from_customers'), money(s.customerOutstanding)));
      if (s.owed > 0) card.appendChild(kv(t('owed'), money(s.owed), 'neg'));
      if (s.income > 0 || s.costTotal > 0) card.appendChild(kv(t('profit'), money(s.profit), s.profit < 0 ? 'neg' : 'pos'));
      var open = function () { ui.projectId = p.id; ui.section = 'overview'; renderProjects(); window.scrollTo(0, 0); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
      list.appendChild(card);
    });
  }


  /* Cash forecast: what should come in and what must go out */
  function openForecast() {
    var f = L.cashForecast(state, L.todayStr(), 30), T = f.totals;
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal importmodal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, t('forecast')));
    var net = panel(null);
    net.appendChild(kv(t('fc_in_30'), money(L.round2(T.inOverdue + T.inSoon)), 'pos'));
    net.appendChild(kv(t('fc_out_30'), money(L.round2(T.outOverdue + T.outSoon)), 'neg'));
    net.appendChild(kv(t('fc_net'), money(T.net), T.net < 0 ? 'neg' : 'pos'));
    m.appendChild(net);
    function section(title, list, isIn) {
      var P = panel(title);
      if (!list.length) P.appendChild(el('p', 'muted small', t('no_data')));
      list.forEach(function (x) {
        var row = el('div', 'improw');
        var tx = el('span', 'stext');
        var name = isIn ? (x.project + ' · ' + x.who) : (x.wages ? x.project + ' · ' + t('fc_wages') : x.project + ' · ' + (x.who || t('uncategorized')) + (x.desc ? ' – ' + x.desc : ''));
        tx.appendChild(el('b', null, name));
        var sub = x.date ? (x.overdue ? t('fc_overdue') + ' ' : '') + fmtDate(x.date) : (isIn ? t('fc_no_date_in') : t('fc_no_date_out'));
        if (isIn) sub += ' · ' + t('cs_' + x.status);
        tx.appendChild(el('small', x.overdue ? 'neg' : 'muted', sub));
        row.appendChild(tx);
        row.appendChild(el('span', isIn ? 'pos' : 'neg', money(x.amount)));
        P.appendChild(row);
      });
      P.appendChild(kv(t('fc_total'), money(isIn ? T.inAll : T.outAll)));
      m.appendChild(P);
    }
    section(t('fc_money_in'), f.incoming, true);
    section(t('fc_money_out'), f.outgoing, false);
    m.appendChild(el('p', 'muted small', t('fc_note')));
    m.appendChild(btn(t('close'), 'block', close));
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }


  /* --- financial statements: income statement, cash flow, balance sheet, ageing --- */
  function finBlocks(p, tab, from, to) {
    var M = money, hd = function (h, n) { return { h: h, n: n }; };
    if (tab === 'income') {
      var is = L.incomeStatement(state, p, from, to);
      var rows = [[t('fin_trip_income') + ' (' + is.trips + ' ' + t('trips_short') + ')', M(is.revenue)]];
      is.byCode.forEach(function (c) { rows.push(['− ' + (c.code === 'wages_accrued' ? t('fin_wages_accrued') : codeLabel(c.code)), M(c.amount)]); });
      var tk = is.byTruck.map(function (r) { return [r.truck ? L.truckName(p, r.truck) : t('no_truck_cash'), String(r.trips), M(r.revenue), M(r.cost), M(r.profit)]; });
      return [
        { title: t('fin_income'), head: [hd(t('description')), hd(t('amount'), 1)], rows: rows, totals: [[t('fin_total_costs'), M(is.cost)], [t('fin_net_profit') + (is.revenue > 0 ? ' (' + is.margin + '%)' : ''), M(is.profit), is.profit < 0 ? 'neg' : 'pos']] },
        { title: t('fin_per_truck'), head: [hd(t('truck')), hd(t('trips_short'), 1), hd(t('fin_trip_income'), 1), hd(t('fin_total_costs'), 1), hd(t('fin_net_profit'), 1)], rows: tk }
      ];
    }
    if (tab === 'cash') {
      var cf = L.cashFlowStatement(state, p, from, to);
      var inR = cf.inRows.map(function (r) { return [t('fk_' + r.kind), M(r.amount)]; });
      var outR = cf.outRows.map(function (r) { return ['− ' + t('fk_' + r.kind), M(r.amount)]; });
      var blocks = [
        { title: t('fin_cashflow'), head: [hd(t('description')), hd(t('amount'), 1)], rows: [[t('fin_opening_cash'), M(cf.opening)]].concat(inR.length ? inR : [[t('fk_none'), M(0)]]), totals: [[t('fin_total_in'), M(cf.totalIn), 'pos']] },
        { head: [hd(t('description')), hd(t('amount'), 1)], rows: outR.length ? outR : [[t('fk_none'), M(0)]], totals: [[t('fin_total_out'), M(cf.totalOut), 'neg'], [t('cash_net'), M(cf.net), cf.net < 0 ? 'neg' : 'pos'], [t('fin_closing_cash'), M(cf.closing)]] }
      ];
      if (cf.collectedByDrivers > 0) blocks.push({ head: [hd(t('description')), hd(t('amount'), 1)], rows: [[t('fin_collected_memo'), M(cf.collectedByDrivers)]] });
      return blocks;
    }
    if (tab === 'balance') {
      var bs = L.balanceSheet(state, p, to);
      var A = bs.assets.map(function (a) { return [t('bs_' + a.key), M(a.amount)]; });
      var Lb = bs.liabilities.map(function (a) { return [t('bs_' + a.key), M(a.amount)]; });
      var out = [
        { title: t('fin_assets'), head: [hd(t('description')), hd(t('amount'), 1)], rows: A, totals: [[t('fin_total_assets'), M(bs.totalAssets)]] },
        { title: t('fin_liabilities'), head: [hd(t('description')), hd(t('amount'), 1)], rows: Lb, totals: [[t('fin_total_liabilities'), M(bs.totalLiabilities)], [t('fin_equity'), M(bs.equity), bs.equity < 0 ? 'neg' : 'pos']] }
      ];
      if (bs.drivers.length) out.push({ title: t('fin_drivers'), head: [hd(t('driver')), hd(t('held_by_driver'), 1), hd(t('wages_owed'), 1)], rows: bs.drivers.map(function (d) { return [d.name, M(d.held), M(d.owed)]; }) });
      return out;
    }
    var ag = L.agingReport(p, to);
    var heads = [hd(t('fin_party'))].concat(L.AGE_BUCKETS.map(function (b) { return hd(t('age_' + b), 1); })).concat([hd(t('fin_total'), 1)]);
    function agBlock(title, g) {
      return { title: title, head: heads, rows: g.rows.map(function (r) { return [r.name].concat(r.b.map(function (x) { return x ? M(x) : '–'; })).concat([M(r.total)]); }), totals: [[t('fin_total'), M(g.total)]] };
    }
    return [agBlock(t('fin_receivables'), ag.receivables), agBlock(t('fin_payables'), ag.payables)];
  }
  function openFinancials(p) {
    var today = L.todayStr(), st = { tab: 'income', from: today.slice(0, 8) + '01', to: today };
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal importmodal finmodal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    var tabs = [['income', 'fin_income'], ['cash', 'fin_cashflow'], ['balance', 'fin_balance'], ['aging', 'fin_aging']];
    function titleOf() { return t(tabs.filter(function (x) { return x[0] === st.tab; })[0][1]); }
    function isRange() { return st.tab === 'income' || st.tab === 'cash'; }
    function subOf() { return p.name + ' · ' + (isRange() ? fmtDate(st.from) + ' – ' + fmtDate(st.to) : t('fin_as_at') + ' ' + fmtDate(st.to)); }
    function draw() {
      m.textContent = '';
      m.appendChild(el('h2', null, t('fin_title')));
      var seg = el('div', 'seg');
      tabs.forEach(function (x) { seg.appendChild(btn(t(x[1]), st.tab === x[0] ? 'active' : '', function () { st.tab = x[0]; draw(); })); });
      m.appendChild(seg);
      var pn = panel(null);
      (isRange() ? [['cash_from', 'from'], ['cash_to', 'to']] : [['fin_as_at', 'to']]).forEach(function (x) {
        var lab = el('label', 'field'), di = document.createElement('input');
        lab.appendChild(el('span', null, t(x[0])));
        di.type = 'date'; di.value = st[x[1]];
        di.addEventListener('change', function () { if (L.isDate(di.value)) { st[x[1]] = di.value; draw(); } });
        lab.appendChild(di); makeDate(di, false); pn.appendChild(lab);
      });
      m.appendChild(pn);
      var blocks = finBlocks(p, st.tab, st.from, st.to);
      blocks.forEach(function (b) {
        var box = el('div', 'finbox');
        if (b.title) box.appendChild(el('h3', null, b.title));
        var wrap = el('div', 'fintblwrap'), tb = el('table', 'fintbl'), th = el('thead'), tr = el('tr');
        b.head.forEach(function (c) { tr.appendChild(el('th', c.n ? 'n' : '', c.h)); });
        th.appendChild(tr); tb.appendChild(th);
        var tbd = el('tbody');
        if (!b.rows.length) { var er = el('tr'), ec = el('td', 'muted', t('no_data')); ec.colSpan = b.head.length; er.appendChild(ec); tbd.appendChild(er); }
        b.rows.forEach(function (r) { var rr = el('tr'); r.forEach(function (v, i) { rr.appendChild(el('td', b.head[i] && b.head[i].n ? 'n' : '', v)); }); tbd.appendChild(rr); });
        tb.appendChild(tbd); wrap.appendChild(tb); box.appendChild(wrap);
        (b.totals || []).forEach(function (x) { box.appendChild(kv(x[0], x[1], x[2] || '', true)); });
        m.appendChild(box);
      });
      m.appendChild(el('p', 'muted small', t('fin_note_' + st.tab)));
      var br = el('div', 'btnrow');
      br.appendChild(btn(t('stmt_print'), 'primary', function () {
        printDoc(titleOf() + ' – ' + p.name, window.CBPrint.tableHtml({ title: titleOf(), lang: state.settings.lang, sub: subOf(), blocks: blocks, note: t('fin_note_' + st.tab) }));
      }));
      br.appendChild(btn(t('stmt_csv'), '', function () {
        var rows = [[titleOf()], [subOf()]];
        blocks.forEach(function (b) {
          rows.push([]); if (b.title) rows.push([b.title]);
          rows.push(b.head.map(function (c) { return c.h; }));
          b.rows.forEach(function (r) { rows.push(r); });
          (b.totals || []).forEach(function (x) { rows.push([x[0], x[1]]); });
        });
        saveFile('truckbook-' + st.tab + '-' + safeName(p.name) + '-' + today + '.csv', 'text/csv', L.rowsToCsv(rows));
      }));
      m.appendChild(br);
      m.appendChild(btn(t('close'), 'block', close));
    }
    draw();
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  /* ---------- statements ---------- */
  function statementModal(o) {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal importmodal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, o.title));
    m.appendChild(el('p', 'muted small', o.sub));
    var pn = panel(null);
    o.rows.forEach(function (r) {
      var row = el('div', 'improw'), tx = el('span', 'stext');
      tx.appendChild(el('b', null, r.a)); tx.appendChild(el('small', 'muted', r.b));
      row.appendChild(tx); row.appendChild(el('span', r.cls || '', r.c));
      pn.appendChild(row);
    });
    if (!o.rows.length) pn.appendChild(el('p', 'muted small', t('no_data')));
    o.totals.forEach(function (x) { pn.appendChild(kv(x[0], x[1], x[2])); });
    m.appendChild(pn);
    var br = el('div', 'btnrow');
    br.appendChild(btn(t('stmt_print'), 'primary', function () {
      printDoc(o.title, window.CBPrint.tableHtml({ title: o.title, lang: state.settings.lang, sub: o.sub, meta: o.meta, blocks: o.blocks, note: '' }));
    }));
    br.appendChild(btn(t('stmt_csv'), '', function () { saveFile(o.file + '-' + L.todayStr() + '.csv', 'text/csv', L.rowsToCsv(o.csv)); }));
    m.appendChild(br);
    m.appendChild(btn(t('close'), 'block', close));
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  function pickSupplierStatement(p) {
    var names = L.supplierNames(p);
    if (!names.length) { toast(t('no_bills')); return; }
    function show(name) {
      var s = L.supplierStatement(p, name), label = name || t('uncategorized');
      var head = [{ h: t('date') }, { h: t('description') }, { h: t('stmt_billed'), n: 1 }, { h: t('paid'), n: 1 }, { h: t('balance_due'), n: 1 }];
      var rows = s.rows.map(function (r) { return [fmtDate(r.date), r.text, r.kind === 'bill' ? money(r.amount) : '', r.kind === 'pay' ? money(r.amount) : '', money(r.balance)]; });
      statementModal({
        title: t('supplier_stmt') + ': ' + label, sub: p.name + ' · ' + fmtDate(L.todayStr()),
        rows: s.rows.map(function (r) { return { a: (r.kind === 'pay' ? t('paid') + ' · ' : '') + (r.text || label), b: fmtDate(r.date) + ' · ' + t('balance_due') + ' ' + money(r.balance), c: money(r.amount), cls: r.kind === 'pay' ? 'pos' : 'neg' }; }),
        totals: [[t('stmt_billed'), money(s.billed)], [t('paid'), money(s.paid)], [t('balance_due'), money(s.balance), s.balance > 0 ? 'neg' : 'pos']],
        meta: [[t('project'), p.name], [t('supplier'), label]],
        blocks: [{ head: head, rows: rows, totals: [[t('stmt_billed'), money(s.billed)], [t('paid'), money(s.paid)], [t('balance_due'), money(s.balance), 'total']] }],
        csv: [head.map(function (h) { return h.h; })].concat(rows), file: 'statement-' + safeName(label)
      });
    }
    if (names.length === 1) return show(names[0]);
    actionSheet(t('supplier_stmt'), names.map(function (n) { return { label: n || t('uncategorized'), run: function () { show(n); } }; }));
  }

  function pickCustomerStatement(p) {
    var names = L.customerNames(p);
    if (!names.length) { toast(t('no_data')); return; }
    function show(name) {
      var s = L.customerStatement(p, name), label = name || t('uncategorized');
      var head = [{ h: t('date') }, { h: t('description') }, { h: t('stmt_billed'), n: 1 }, { h: t('paid'), n: 1 }, { h: t('balance_due'), n: 1 }];
      var kindText = function (r) { return (r.kind === 'invoice' ? t('invoice_title') : r.kind === 'tax' ? t('wht_amt') : t('received')) + (r.text ? ' ' + r.text : ''); };
      var rows = s.rows.map(function (r) { return [fmtDate(r.date), kindText(r), r.kind === 'invoice' ? money(r.amount) : '', r.kind !== 'invoice' ? money(r.amount) : '', money(r.balance)]; });
      var totals = [[t('stmt_billed'), money(s.billed)], [t('paid'), money(s.paid)], [t('balance_due'), money(s.balance), s.balance > 0 ? 'neg' : 'pos']];
      if (s.unbilled > 0) totals.push([t('not_invoiced'), money(s.unbilled)]);
      statementModal({
        title: t('customer_stmt') + ': ' + label, sub: p.name + ' · ' + fmtDate(L.todayStr()),
        rows: s.rows.map(function (r) { return { a: kindText(r), b: fmtDate(r.date) + ' · ' + t('balance_due') + ' ' + money(r.balance), c: money(r.amount), cls: r.kind === 'invoice' ? 'neg' : 'pos' }; }),
        totals: totals,
        meta: [[t('project'), p.name], [t('customer'), label]],
        blocks: [{ head: head, rows: rows, totals: totals.map(function (x, i) { return i === 2 ? [x[0], x[1], 'total'] : x; }) }],
        csv: [head.map(function (h) { return h.h; })].concat(rows), file: 'customer-' + safeName(label)
      });
    }
    if (names.length === 1) return show(names[0]);
    actionSheet(t('customer_stmt'), names.map(function (n) { return { label: n || t('uncategorized'), run: function () { show(n); } }; }));
  }

  function pickWorkerStatement(p, wk) {
    function show(w, from, to) {
      var s = L.workerStatement(p, w.id, from, to);
      var head = [{ h: t('date') }, { h: t('days'), n: 1 }, { h: t('rate'), n: 1 }, { h: t('amount'), n: 1 }, { h: t('paid') }];
      var rows = s.rows.map(function (r) { return [fmtDate(r.date), String(r.days), money(r.rate), money(r.amount), r.paid ? '✓' : '']; });
      statementModal({
        title: t('worker_stmt') + ': ' + w.name, sub: p.name + (from ? ' · ' + fmtDate(from) + ' – ' + fmtDate(to) : ''),
        rows: s.rows.map(function (r) { return { a: fmtDate(r.date) + ' · ' + r.days + ' ' + t('days'), b: money(r.rate) + (r.paid ? ' · ✓ ' + t('paid') : ''), c: money(r.amount), cls: r.paid ? 'pos' : 'neg' }; }),
        totals: [[t('days'), String(s.days)], [t('stmt_earned'), money(s.earned)], [t('paid'), money(s.paid)], [t('stmt_unpaid'), money(s.unpaid), s.unpaid > 0 ? 'neg' : 'pos']],
        meta: [[t('project'), p.name], [t('worker'), w.name + (w.role ? ' (' + w.role + ')' : '')]],
        blocks: [{ head: head, rows: rows, totals: [[t('days'), String(s.days)], [t('stmt_earned'), money(s.earned)], [t('paid'), money(s.paid)], [t('stmt_unpaid'), money(s.unpaid), 'total']] }],
        csv: [head.map(function (h) { return h.h; })].concat(rows), file: 'worker-' + safeName(w.name)
      });
    }
    function pickRange(w) {
      actionSheet(w.name, [
        { label: t('stmt_this_week'), run: function () { show(w, wk.from, wk.to); } },
        { label: t('stmt_this_month'), run: function () { var d = L.todayStr(); show(w, d.slice(0, 8) + '01', d.slice(0, 8) + '31'); } },
        { label: t('stmt_all'), run: function () { show(w, '', ''); } }
      ]);
    }
    if (p.workers.length === 1) return pickRange(p.workers[0]);
    actionSheet(t('worker_stmt'), p.workers.map(function (w) { return { label: w.name, run: function () { pickRange(w); } }; }));
  }

  /* ---------- search ---------- */
  function openSearch() {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal importmodal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, t('search')));
    var inp = document.createElement('input');
    inp.type = 'search'; inp.className = 'srchinp'; inp.placeholder = t('search_ph'); inp.maxLength = 60;
    m.appendChild(inp);
    var out = el('div'); m.appendChild(out);
    m.appendChild(btn(t('close'), 'block', close));
    function goProject(id, sec) { close(); ui.projectId = id; ui.section = sec; showView('projects'); renderProjects(); window.scrollTo(0, 0); }
    function line(a, b, c, run) {
      var row = el('div', 'improw'), tx = el('span', 'stext');
      tx.appendChild(el('b', null, a)); tx.appendChild(el('small', 'muted', b));
      row.appendChild(tx); if (c) row.appendChild(el('span', null, c));
      row.addEventListener('click', run); out.appendChild(row);
    }
    function group(title, n) { if (n) out.appendChild(el('div', 'srchgrp', title + ' (' + n + ')')); }
    function render() {
      out.textContent = '';
      var r = L.searchAll(state, inp.value, 8);
      var total = r.entries.length + r.bills.length + r.invoices.length + r.contacts.length + r.trips.length + r.trucks.length;
      if (inp.value.trim().length >= 2 && !total) out.appendChild(el('p', 'muted small', t('search_none')));
      group(t('entries'), r.entries.length);
      r.entries.forEach(function (x) {
        var e = x.entry;
        line((e.category || e.note || e.party || (e.type === 'in' ? t('cash_in') : t('cash_out'))), x.book + ' · ' + fmtDate(e.date) + (e.note && e.category ? ' · ' + e.note : ''), (e.type === 'out' ? '−' : '+') + money(e.amount),
          function () { close(); state.current = x.bookId; ui.bookOpen = true; save(); showView('entries'); renderAll(); openEntry(e.id); });
      });
      group(t('bills'), r.bills.length);
      r.bills.forEach(function (x) { line((x.bill.supplier || '') + (x.bill.desc ? ' – ' + x.bill.desc : ''), x.project + ' · ' + fmtDate(x.bill.date), money(x.bill.amount), function () { goProject(x.projectId, 'costs'); }); });
      group(t('invoices'), r.invoices.length);
      r.invoices.forEach(function (x) { line((x.invoice.no || '') + ' ' + (x.invoice.customer || ''), x.project + ' · ' + fmtDate(x.invoice.date), '', function () { goProject(x.projectId, 'customers'); }); });
      group(t('trips'), r.trips.length);
      r.trips.forEach(function (x) { line(fmtDate(x.trip.date) + ' · ' + (x.plate || '') + (x.trip.customer ? ' · ' + x.trip.customer : ''), x.project + ' · ' + [x.trip.from, x.trip.to].filter(Boolean).join(' → '), money(x.trip.amount), function () { goProject(x.projectId, 'trips'); }); });
      group(t('trucks'), r.trucks.length);
      r.trucks.forEach(function (x) { line(x.truck.plate, x.project + (x.truck.model ? ' · ' + x.truck.model : ''), '', function () { goProject(x.projectId, 'trucks'); }); });
      group(t('contacts'), r.contacts.length);
      r.contacts.forEach(function (c) { line(c.name, [c.phone, c.email].filter(Boolean).join(' · '), '', function () { close(); showView('contacts'); renderAll(); }); });
    }
    inp.addEventListener('input', render);
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    inp.focus();
  }
  $('searchBtn').addEventListener('click', openSearch);

  /* ---------- quick add: tap a recent category ---------- */
  function renderCatChips() {
    var box = $('catChips'), type = $('entryForm').elements.type.value, cnt = {};
    box.textContent = '';
    state.books.forEach(function (b) { b.entries.forEach(function (e) { if (e.type === type && e.category) cnt[e.category] = (cnt[e.category] || 0) + 1; }); });
    Object.keys(cnt).sort(function (a, c) { return cnt[c] - cnt[a] || (a < c ? -1 : 1); }).slice(0, 6).forEach(function (c) {
      box.appendChild(btn(c, '', function () { $('category').value = c; }));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#entryForm input[name=type]'), function (r) { r.addEventListener('change', renderCatChips); });

  function renderProjectDetail(root) {
    var p = currentProject();
    root.textContent = '';
    root.appendChild(btn(t('back'), 'backlink', function () { ui.projectId = ''; renderProjects(); }));
    root.appendChild(el('h2', null, (window.__projIcon ? window.__projIcon(p) : '') + p.name));
    var seg = el('div', 'seg');
    SECTIONS.forEach(function (sec) {
      var label = sec === 'books' ? t('books_sec') : t('sec_' + sec);
      var b = btn(label, ui.section === sec ? 'active' : '', function () { ui.section = sec; renderProjects(); });
      seg.appendChild(b);
    });
    root.appendChild(seg);
    var body = el('div', 'stack');
    root.appendChild(body);
    ({ overview: secOverview, trucks: secTrucks, trips: secTrips, costs: secCosts, customers: secCustomers, drivers: secLabour, cash: secCash, books: secBooks })[ui.section](body, p);
  }

  /* projects shared "view only": block every edit action, keep reading, printing and exporting */
  document.addEventListener('click', function (ev) {
    var p = currentProject();
    if (!p || !p.sync || p.sync.role !== 'view' || !$('projDetail').contains(ev.target)) return;
    var tg = ev.target.closest && ev.target.closest('button, .pay, input, select, textarea, label, [role=button]');
    if (!tg) return;
    var safe = ['print_statement', 'export_report', 'export_trips', 'export_trips_csv', 'print', 'export_invoice_xlsx', 'stmt_print', 'stmt_csv', 'fin_title', 'supplier_stmt', 'worker_stmt', 'customer_stmt'].map(function (k) { return t(k); });
    if (tg.closest('.seg') || tg.classList.contains('backlink') || tg.closest('[data-ro]') || safe.indexOf((tg.textContent || '').trim()) >= 0) return;
    ev.stopPropagation(); ev.preventDefault();
    toast(t('proj_view_only'));
  }, true);

  function panel(title) {
    var p = el('div', 'panel');
    if (title) p.appendChild(el('h2', null, title));
    return p;
  }

  /* --- overview --- */
  function goSection(sec) { ui.section = sec; renderProjects(); window.scrollTo(0, 0); }

  function secOverview(body, p) {
    var s = L.projectSummary(state, p.id), ts = L.truckStats(state, p.id), today = L.todayStr();

    var attn = L.reminders(state, today, 7).filter(function (r) { return r.projectId === p.id && (r.level === 'overdue' || r.level === 'soon'); });
    if (attn.length) {
      var ap = panel(t('attention'));
      attn.slice(0, 8).forEach(function (r) {
        var row = el('button', 'remrow ' + r.level);
        row.type = 'button';
        var tx = el('span', 'stext');
        tx.appendChild(el('b', null, r.kind === 'truck' ? t('doc_' + r.desc) + ': ' + r.who : r.kind === 'wages' ? t('fc_wages') : (r.kind === 'invoice' ? t('unpaid_invoice') + ': ' : '') + (r.who || '—')));
        var cnote = r.note ? t('cn_' + r.note.split(':')[0], { n: r.note.split(':')[1] }) : '';
        tx.appendChild(el('small', 'muted', [r.kind === 'bill' ? r.desc : '', cnote, r.due ? t('due_label') + ' ' + fmtDate(r.due) : ''].filter(Boolean).join(' · ')));
        row.appendChild(tx);
        if (r.amount > 0) row.appendChild(el('span', 'amt ' + (r.level === 'overdue' ? 'out' : ''), money(r.amount)));
        row.addEventListener('click', function () { goSection(r.kind === 'truck' ? 'trucks' : r.kind === 'invoice' ? 'customers' : r.kind === 'wages' ? 'drivers' : 'costs'); });
        ap.appendChild(row);
      });
      body.appendChild(ap);
    }

    var c = panel(t('income_section'));
    if (p.owner) c.appendChild(kv(t('owner_name'), p.owner));
    if (p.location) c.appendChild(kv(t('location'), p.location));
    c.appendChild(kv(t('trucks'), String(s.activeTrucks) + (s.trucks > s.activeTrucks ? ' (+' + (s.trucks - s.activeTrucks) + ' ' + t('inactive') + ')' : '')));
    c.appendChild(kv(t('trips_income'), money(s.income) + ' (' + s.trips + ' ' + t('trips_short') + ')'));
    c.appendChild(kv(t('invoiced'), money(s.invoiced)));
    c.appendChild(kv(t('not_invoiced'), money(s.unbilled) + (s.unbilledCount ? ' (' + s.unbilledCount + ')' : ''), s.unbilled > 0 ? 'neg' : ''));
    c.appendChild(kv(t('received_incl'), money(s.received)));
    c.appendChild(kv(t('due_from_customers'), money(s.customerOutstanding), s.customerOutstanding > 0 ? 'pos' : '', 'total'));
    if (s.unbilledCount) c.appendChild(btn(t('create_invoice'), 'block', function () { newInvoiceFlow(p); }));
    body.appendChild(c);

    var mFrom = today.slice(0, 8) + '01', mt = L.truckCash(state, p, mFrom, today);
    var mIn = L.round2(mt.reduce(function (a, r) { return a + r.inn; }, 0)), mOut = L.round2(mt.reduce(function (a, r) { return a + r.out; }, 0));
    var held = 0, owedW = 0;
    p.workers.forEach(function (w) { var ac = L.driverAccount(p, w.id); held += ac.held; owedW += ac.owed; });
    var cp = panel(t('sec_cash') + ' · ' + t('cash_month'));
    cp.appendChild(kv(t('cash_in'), money(mIn), 'pos'));
    cp.appendChild(kv(t('cash_out'), money(mOut), mOut > 0 ? 'neg' : ''));
    cp.appendChild(kv(t('cash_net'), money(L.round2(mIn - mOut)), mIn - mOut < 0 ? 'neg' : 'pos', 'total'));
    cp.appendChild(kv(t('held_by_drivers'), money(L.round2(held))));
    cp.appendChild(kv(t('wages_owed_all'), money(L.round2(owedW))));
    cp.appendChild(btn(t('open_cash'), 'block', function () { goSection('cash'); }));
    body.appendChild(cp);

    var k = panel(t('cost_section'));
    k.appendChild(kv(t('actual_cost'), money(s.costTotal)));
    L.CODES.forEach(function (code) {
      if (s.costByCode[code] > 0) k.appendChild(kv('   ' + codeLabel(code) + (s.costTotal > 0 ? ' (' + pct(s.costByCode[code] / s.costTotal * 100) + ')' : ''), money(s.costByCode[code])));
    });
    k.appendChild(kv(t('owed'), money(s.owed), s.owed > 0 ? 'neg' : ''));
    k.appendChild(kv(t('profit'), money(s.profit) + (s.income > 0 ? ' (' + pct(s.margin) + ')' : ''), s.profit < 0 ? 'neg' : 'pos', 'total'));
    k.appendChild(el('p', 'note', t('cost_note')));
    body.appendChild(k);

    var tp = panel(t('truck_profit'));
    if (!ts.rows.length) tp.appendChild(el('p', 'muted small', t('no_trucks')));
    ts.rows.forEach(function (r) {
      var row = el('button', 'remrow');
      row.type = 'button';
      var tx = el('span', 'stext');
      tx.appendChild(el('b', null, r.truck.plate + (r.truck.active ? '' : ' (' + t('inactive') + ')')));
      tx.appendChild(el('small', 'muted', r.trips + ' ' + t('trips_short') + ' · ' + t('income') + ' ' + money(r.income) + ' · ' + t('actual_cost') + ' ' + money(r.cost) +
        (r.litres > 0 ? ' · ' + r.litres + ' L' : '')));
      row.appendChild(tx);
      row.appendChild(el('span', 'amt ' + (r.profit < 0 ? 'out' : ''), money(r.profit)));
      row.addEventListener('click', function () { ui.tripF = { truck: r.truck.id, customer: '', billed: '' }; goSection('trips'); });
      tp.appendChild(row);
    });
    if (ts.shared > 0) tp.appendChild(kv(t('shared_costs'), money(ts.shared)));
    if (ts.rows.length) tp.appendChild(el('p', 'note', t('shared_note')));
    body.appendChild(tp);

    var ph = panel(t('fleet_photos'));
    var holder = el('div');
    photoWidget(holder, newPhotoState(p.photos), function (ids) { p.photos = L.photoIds(ids); save(); }, false);
    ph.appendChild(holder);
    body.appendChild(ph);

    var row = el('div', 'btnrow');
    row.appendChild(btn(t('print_statement'), '', function () { printStatement(p); }));
    row.appendChild(btn('📑 ' + t('fin_title'), 'primary', function () { openFinancials(p); }));
    row.appendChild(btn(t('edit_project'), '', function () { editProject(p); }));
    row.appendChild(btn(t('export_report'), '', function () {
      saveFile('truckbook-fleet-' + safeName(p.name) + '-' + L.todayStr() + '.csv', 'text/csv', L.projectReportCsv(state, p.id));
    }));
    body.appendChild(row);
    if (window.__projectSharePanel) body.appendChild(window.__projectSharePanel(p));
    body.appendChild(btn(t('delete'), 'danger block', function () {
      function proceed() {
        state.books.forEach(function (b) { if (b.projectId === p.id) b.projectId = ''; });
        var pph = p.photos.slice();
        p.bills.forEach(function (b) { pph = pph.concat(b.photos); });
        p.trucks.forEach(function (x) { pph = pph.concat(x.photos); });
        var rec = trashPut('project', p.name, p, {}, pph);
        delete rec.payload.sync;
        state.projects = state.projects.filter(function (x) { return x.id !== p.id; });
        ui.projectId = '';
        save(); renderAll(); undoToast();
      }
      if (p.sync && window.__projectRelease) { window.__projectRelease(p).then(function (ok) { if (ok) proceed(); }); return; }
      if (!window.confirm(t('confirm_delete_project'))) return;
      proceed();
    }));
  }

  /* --- fleet details --- */
  function projectFields(p) {
    return [
      { key: 'name', label: t('proj_name'), type: 'text', value: p.name, required: true },
      { key: 'owner', label: t('owner_name'), type: 'text', value: p.owner },
      { key: 'location', label: t('location'), type: 'text', value: p.location },
      { key: 'payDays', label: t('pay_days'), type: 'number', min: 1, max: 365, value: p.payDays, noCalc: true }
    ];
  }
  function applyProjectValues(p, v) {
    p.name = v.name.slice(0, 60); p.owner = v.owner.slice(0, 60); p.location = v.location.slice(0, 60);
    p.payDays = Math.min(365, Math.max(1, Math.round(v.payDays) || 30));
  }
  function editProject(p) {
    openForm({
      title: t('edit_project'),
      fields: projectFields(p),
      onSubmit: function (v) { applyProjectValues(p, v); save(); renderAll(); return null; },
      focus: false
    });
  }
  function newProject() {
    var p = L.sanitizeProject({ name: '', vat: 0, wht: 0, payDays: 30 }, state.projects.length + 1);
    p.name = '';
    openForm({
      title: t('new_project'),
      fields: projectFields(p),
      onSubmit: function (v) {
        applyProjectValues(p, v);
        state.projects.push(p);
        ui.projectId = p.id; ui.section = 'trucks';
        save(); renderAll();
        return null;
      }
    });
  }

  /* --- small helpers for the truck screens --- */
  function truckOptions(p, withNone, current) {
    var o = withNone ? [{ value: '', label: '—' }] : [];
    p.trucks.forEach(function (x) { if (x.active || x.id === current) o.push({ value: String(x.id), label: x.plate }); });
    return o;
  }
  function workerOptions(p) {
    return [{ value: '', label: '—' }].concat(p.workers.map(function (w) { return { value: String(w.id), label: w.name }; }));
  }
  function dateRow(label, date) {
    var today = L.todayStr();
    var late = date < today, soon = !late && date <= addDays(today, 30);
    return kv(label, fmtDate(date) + (late ? ' ⚠' : soon ? ' ⏰' : ''), late ? 'neg' : '');
  }
  function newestFirst(a, c) { return a.date < c.date ? 1 : a.date > c.date ? -1 : c.id - a.id; }
  function recordBillPayment(p, bill, date, amount, bookId) {
    var pay = { id: L.newId(), date: date, amount: amount, entryId: 0, bookId: '' };
    var target = bookId ? bookById(bookId) : null;
    if (target) {
      var e = L.sanitizeEntry({
        id: L.newId(), type: 'out', amount: amount, date: date,
        category: bill.desc || codeLabel(bill.code), note: '', code: bill.code, truck: bill.truck, party: bill.supplier, billId: bill.id
      });
      target.entries.push(e);
      pay.entryId = e.id; pay.bookId = target.id;
    }
    bill.payments.push(L.sanitizePayment(pay));
  }
  function recordReceipt(p, inv, date, amount, bookId, driverId) {
    var rc = { id: L.newId(), date: date, amount: amount, entryId: 0, bookId: '', driver: driverId || 0 };
    var target = !driverId && bookId ? bookById(bookId) : null; // money collected by a driver goes into a book only when he hands it over
    if (target) {
      var e = L.sanitizeEntry({
        id: L.newId(), type: 'in', amount: amount, date: date,
        category: (t('invoice_title') + ' ' + (inv.no || '')).trim(), note: '', party: inv.customer, invoiceId: inv.id
      });
      target.entries.push(e);
      rc.entryId = e.id; rc.bookId = target.id;
    }
    inv.receipts.push(L.sanitizePayment(rc));
  }

  /* --- trucks --- */
  function secTrucks(body, p) {
    var pn = panel(t('trucks'));
    pn.appendChild(btn(t('add_truck'), 'primary block', function () { editTruck(p, null); }));
    body.appendChild(pn);
    if (!p.trucks.length) { body.appendChild(el('p', 'empty', t('no_trucks'))); return; }
    var stats = {};
    L.truckStats(state, p.id).rows.forEach(function (r) { stats[r.truck.id] = r; });
    p.trucks.forEach(function (x) {
      var st = stats[x.id], card = panel(null);
      var dr = byId(p.workers, x.driverId);
      card.appendChild(el('h3', null, '🚚 ' + x.plate + (x.active ? '' : ' (' + t('inactive') + ')')));
      card.appendChild(el('div', 'muted small', [x.model, x.capacity, dr ? t('driver') + ': ' + dr.name : ''].filter(Boolean).join(' · ')));
      if (x.note) card.appendChild(el('div', 'muted small', x.note));
      if (x.insuranceDate) card.appendChild(dateRow(t('doc_insurance'), x.insuranceDate));
      if (x.inspectionDate) card.appendChild(dateRow(t('doc_inspection'), x.inspectionDate));
      if (x.serviceDate) card.appendChild(dateRow(t('doc_service'), x.serviceDate));
      thumbsOnly(card, x.photos);
      if (st) {
        card.appendChild(kv(t('trips'), String(st.trips)));
        card.appendChild(kv(t('income'), money(st.income)));
        card.appendChild(kv(t('actual_cost'), money(st.cost) + (st.fuel > 0 ? ' (' + t('code_fuel') + ' ' + money(st.fuel) + ')' : '')));
        card.appendChild(kv(t('profit'), money(st.profit), st.profit < 0 ? 'neg' : 'pos', 'total'));
      }
      var row = el('div', 'btnrow');
      row.appendChild(btn(t('add_trip'), 'primary', function () { editTrip(p, null, { truck: x.id }); }));
      row.appendChild(btn(t('trips'), '', function () { ui.tripF = { truck: x.id, customer: '', billed: '' }; goSection('trips'); }));
      row.appendChild(btn(t('edit_truck'), '', function () { editTruck(p, x); }));
      card.appendChild(row);
      body.appendChild(card);
    });
  }

  function editTruck(p, x) {
    var isNew = !x;
    var v0 = x || { plate: '', model: '', capacity: '', driverId: 0, insuranceDate: '', inspectionDate: '', serviceDate: '', active: true, note: '' };
    var pst = newPhotoState(x ? x.photos : []);
    openForm({
      title: isNew ? t('add_truck') : t('edit_truck'),
      fields: [
        { key: 'plate', label: t('plate'), type: 'text', value: v0.plate, max: 30, required: true },
        { key: 'model', label: t('truck_model'), type: 'text', value: v0.model, max: 40 },
        { key: 'capacity', label: t('capacity'), type: 'text', value: v0.capacity, max: 20, ph: '12 m³' },
        { key: 'driver', label: t('driver'), type: 'select', options: workerOptions(p), value: v0.driverId ? String(v0.driverId) : '' },
        { key: 'insuranceDate', label: t('doc_insurance'), type: 'date', value: v0.insuranceDate },
        { key: 'inspectionDate', label: t('doc_inspection'), type: 'date', value: v0.inspectionDate },
        { key: 'serviceDate', label: t('doc_service'), type: 'date', value: v0.serviceDate },
        { key: 'active', label: t('status'), type: 'select', options: [{ value: 'yes', label: t('active') }, { value: 'no', label: t('inactive') }], value: v0.active ? 'yes' : 'no' },
        { key: 'note', label: t('remark'), type: 'text', value: v0.note, max: 80 },
        { type: 'note', text: t('truck_docs_note') },
        { key: 'photos', type: 'photos', state: pst }
      ],
      onSubmit: function (v) {
        var nt = L.sanitizeTruck({ id: x ? x.id : 0, plate: v.plate, model: v.model, capacity: v.capacity, driverId: Number(v.driver) || 0,
          insuranceDate: v.insuranceDate, inspectionDate: v.inspectionDate, serviceDate: v.serviceDate, active: v.active !== 'no', note: v.note, photos: pst.ids });
        if (!nt) return t('required');
        if (isNew) p.trucks.push(nt); else p.trucks[p.trucks.indexOf(x)] = nt;
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_truck'))) return false;
        trashPut('truck', x.plate, x, { projectId: p.id }, x.photos);
        p.trucks = p.trucks.filter(function (a) { return a.id !== x.id; });
        p.workers.forEach(function (w) { if (w.truck === x.id) w.truck = 0; });
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }

  /* --- trips --- */
  function tripFilter() { if (!ui.tripF) ui.tripF = { truck: 0, customer: '', billed: '' }; return ui.tripF; }

  function secTrips(body, p) {
    var F = tripFilter();
    if (F.truck && !byId(p.trucks, F.truck)) F.truck = 0;
    var pn = panel(t('trips'));
    pn.appendChild(btn(t('add_trip'), 'primary block', function () { editTrip(p, null, F.truck ? { truck: F.truck } : null); }));
    function sel(label, opts, val, on) {
      var lab = el('label', 'field'), s = document.createElement('select');
      lab.appendChild(el('span', null, label));
      opts.forEach(function (o) { s.appendChild(option(o.value, o.label)); });
      s.value = val;
      s.addEventListener('change', function () { on(s.value); renderProjects(); });
      lab.appendChild(s);
      pn.appendChild(lab);
    }
    sel(t('truck'), [{ value: '', label: t('all') }].concat(truckOptions(p, false, F.truck)), F.truck ? String(F.truck) : '', function (v) { F.truck = Number(v) || 0; });
    sel(t('customer'), [{ value: '', label: t('all') }].concat(L.customerNames(p).map(function (n) { return { value: n, label: n }; })), F.customer || '', function (v) { F.customer = v; });
    sel(t('invoice_state'), [{ value: '', label: t('all') }, { value: 'no', label: t('not_invoiced') }, { value: 'yes', label: t('invoiced') }], F.billed || '', function (v) { F.billed = v; });
    var list = L.filterTrips(p, { truck: F.truck, customer: F.customer, billed: F.billed }).reverse();
    var total = L.round2(list.reduce(function (a, x) { return a + x.amount; }, 0));
    pn.appendChild(kv(t('trips') + ' (' + list.length + ')', money(total), '', 'total'));
    var row = el('div', 'btnrow');
    row.appendChild(btn(t('create_invoice'), '', function () { newInvoiceFlow(p, F.customer); }));
    row.appendChild(btn(t('export_trips'), '', function () {
      saveWorkbook('Trips-' + safeName(p.name) + '-' + L.todayStr(), window.CBExcel.tripsWorkbook(p, { truck: F.truck, customer: F.customer, billed: F.billed }));
    }));
    row.appendChild(btn(t('export_trips_csv'), '', function () {
      saveFile('truckbook-trips-' + safeName(p.name) + '-' + L.todayStr() + '.csv', 'text/csv', L.tripsCsv(p));
    }));
    pn.appendChild(row);
    body.appendChild(pn);

    if (!list.length) { body.appendChild(el('p', 'empty', t('no_trips'))); return; }
    var inv = {};
    p.invoices.forEach(function (c) { inv[c.id] = c; });
    var shown = ui.tripAll ? list : list.slice(0, 60);
    shown.forEach(function (x) {
      var card = el('button', 'remrow');
      card.type = 'button';
      var tx = el('span', 'stext');
      tx.appendChild(el('b', null, fmtDate(x.date) + ' · ' + (L.truckName(p, x.truck) || '—') + (x.customer ? ' · ' + x.customer : '')));
      var route = [x.from, x.to].filter(Boolean).join(' → ');
      var drv = byId(p.workers, x.driver);
      tx.appendChild(el('small', 'muted', [route, x.material, x.qty + ' ' + t('unit_' + x.unit) + ' × ' + money(x.rate), drv ? drv.name : '', x.ticket ? '#' + x.ticket : ''].filter(Boolean).join(' · ')));
      tx.appendChild(el('small', x.invoiceId ? 'muted' : 'neg', x.invoiceId && inv[x.invoiceId] ? t('invoice_title') + ' ' + (inv[x.invoiceId].no || '') : t('not_invoiced')));
      card.appendChild(tx);
      card.appendChild(el('span', 'amt', money(x.amount)));
      card.addEventListener('click', function () { editTrip(p, x); });
      body.appendChild(card);
    });
    if (list.length > shown.length) body.appendChild(btn(t('show_all', { n: list.length }), 'block', function () { ui.tripAll = true; renderProjects(); }));
  }

  function editTrip(p, x, preset) {
    var isNew = !x;
    if (isNew && !p.trucks.length) { toast(t('add_truck_first')); goSection('trucks'); return; }
    var last = p.trips.slice().sort(newestFirst)[0] || {};
    var v0 = x;
    if (!v0) {
      var tr = preset && preset.truck ? byId(p.trucks, preset.truck) : (byId(p.trucks, last.truck) || p.trucks[0]);
      v0 = { date: L.todayStr(), truck: tr ? tr.id : 0, driver: tr ? tr.driverId : 0, customer: last.customer || '', from: last.from || '', to: last.to || '', material: last.material || '',
        ticket: '', qty: 1, unit: last.unit || 'trip', rate: last.rate || '', note: '', invoiceId: 0 };
    }
    var invOpts = [{ value: '', label: t('not_invoiced') }].concat(p.invoices.map(function (c) { return { value: String(c.id), label: (c.no || '') + (c.customer ? ' · ' + c.customer : '') }; }));
    var books = linkedBookOptions(p, true);
    var fields = [
      { key: 'date', label: t('date'), type: 'date', value: v0.date, required: true },
      { key: 'truck', label: t('truck'), type: 'select', options: truckOptions(p, false, v0.truck), value: String(v0.truck) },
      { key: 'driver', label: t('driver'), type: 'select', options: workerOptions(p), value: v0.driver ? String(v0.driver) : '' },
      { key: 'customer', label: t('customer'), type: 'text', value: v0.customer, max: 60 },
      { key: 'from', label: t('from_place'), type: 'text', value: v0.from, max: 40 },
      { key: 'to', label: t('to_place'), type: 'text', value: v0.to, max: 40 },
      { key: 'material', label: t('material'), type: 'text', value: v0.material, max: 30 },
      { key: 'qty', label: t('qty'), type: 'number', min: 0.001, value: v0.qty, required: true },
      { key: 'unit', label: t('unit'), type: 'select', options: L.UNITS.map(function (u) { return { value: u, label: t('unit_' + u) }; }), value: v0.unit },
      { key: 'rate', label: t('rate_per_unit'), type: 'number', min: 0.01, value: v0.rate, required: true },
      { key: 'ticket', label: t('ticket'), type: 'text', value: v0.ticket, max: 20 },
      { key: 'note', label: t('remark'), type: 'text', value: v0.note, max: 80 },
      { key: 'invoice', label: t('invoice_title'), type: 'select', options: invOpts, value: v0.invoiceId ? String(v0.invoiceId) : '' }
    ];
    if (isNew) {
      fields.push({ key: 'payNow', label: t('paid_on_spot'), type: 'select', options: [{ value: 'no', label: t('no') }, { value: 'yes', label: t('yes_cash') }].concat(p.workers.length ? [{ value: 'driver', label: t('yes_driver') }] : []), value: 'no' });
      fields.push({ key: 'bookId', label: t('record_in_book'), type: 'select', options: books, value: books.length > 1 ? books[1].value : '', showFor: { key: 'payNow', values: ['yes'] } });
    }
    openForm({
      title: isNew ? t('add_trip') : t('edit_trip'),
      fields: fields,
      onSubmit: function (v) {
        var truckId = Number(v.truck) || 0, tk = byId(p.trucks, truckId);
        var nt = L.sanitizeTrip({ id: x ? x.id : 0, date: L.isDate(v.date) ? v.date : L.todayStr(), truck: truckId, driver: Number(v.driver) || (tk ? tk.driverId : 0), customer: v.customer,
          from: v.from, to: v.to, material: v.material, ticket: v.ticket, qty: v.qty, unit: v.unit, rate: v.rate, note: v.note, invoiceId: Number(v.invoice) || 0 });
        if (!nt) return t('required');
        if (isNew && v.payNow === 'driver' && !nt.driver) return t('pick_driver');
        if (isNew) p.trips.push(nt); else p.trips[p.trips.indexOf(x)] = nt;
        if (isNew && (v.payNow === 'yes' || v.payNow === 'driver')) {
          // paid in cash on the spot: an invoice for this trip, sent and received today
          var inv = L.sanitizeInvoice({ no: L.nextInvoiceNo(p), date: nt.date, customer: nt.customer, status: 'sent', sentDate: nt.date });
          p.invoices.push(inv);
          nt.invoiceId = inv.id;
          var bal = L.invoiceCalc(p, inv).balance;
          if (bal > 0) recordReceipt(p, inv, nt.date, bal, v.bookId, v.payNow === 'driver' ? nt.driver : 0);
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_trip'))) return false;
        trashPut('trip', fmtDate(x.date) + ' ' + (L.truckName(p, x.truck) || '') + ' ' + money(x.amount), x, { projectId: p.id });
        p.trips = p.trips.filter(function (a) { return a.id !== x.id; });
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }

  /* --- customers: invoices and payments --- */
  function secCustomers(body, p) {
    var cb = L.customerBalances(p);
    var pn = panel(t('customers_section'));
    if (!cb.length) pn.appendChild(el('p', 'muted small', t('no_data')));
    cb.forEach(function (x) {
      pn.appendChild(kv(x.customer || t('uncategorized'), money(x.balance) + (x.unbilled > 0 ? ' + ' + money(x.unbilled) + ' ' + t('not_invoiced') : ''), x.balance > 0 ? 'pos' : ''));
    });
    var s = L.projectSummary(state, p.id);
    pn.appendChild(kv(t('due_from_customers'), money(s.customerOutstanding), s.customerOutstanding > 0 ? 'pos' : '', 'total'));
    pn.appendChild(btn(t('create_invoice'), 'primary block', function () { newInvoiceFlow(p); }));
    if (L.customerNames(p).length) pn.appendChild(btn(t('customer_stmt'), 'block', function () { pickCustomerStatement(p); }));
    pn.appendChild(el('p', 'note', t('invoice_formula')));
    body.appendChild(pn);

    if (!p.invoices.length) body.appendChild(el('p', 'empty', t('no_invoices')));
    p.invoices.slice().sort(newestFirst).forEach(function (inv) {
      var c = L.invoiceCalc(p, inv);
      var card = panel(null);
      card.appendChild(el('h3', null, (t('invoice_title') + ' ' + (inv.no || '')).trim() + (inv.customer ? ' · ' + inv.customer : '')));
      card.appendChild(el('div', 'muted small', fmtDate(inv.date) + (inv.due ? ' · ' + t('inv_due') + ' ' + fmtDate(inv.due) : '') + (inv.note ? ' · ' + inv.note : '')));
      var stKey = L.invoiceStatus(inv, c);
      var stRow = el('div', 'statusrow');
      stRow.appendChild(el('span', 'statuschip st-' + stKey, t('cs_' + stKey)));
      if (stKey === 'sent' && inv.sentDate) stRow.appendChild(el('small', 'muted', fmtDate(inv.sentDate)));
      if (stKey !== 'paid') stRow.appendChild(btn(stKey === 'sent' ? t('back_to_draft') : t('mark_sent'), '', function () { toggleSent(inv, stKey); }));
      card.appendChild(stRow);
      card.appendChild(kv(t('work_amount') + ' (' + c.trips + ' ' + t('trips_short') + ')', money(c.gross)));
      card.appendChild(kv(t('inv_total'), money(c.total), 'total'));
      card.appendChild(kv(t('cash_received'), money(c.received)));
      card.appendChild(kv(t('balance_due'), money(c.balance), c.balance > 0 ? 'pos' : ''));
      inv.receipts.forEach(function (rc) {
        var r = el('div', 'pay');
        r.appendChild(el('span', null, fmtDate(rc.date) + ' · ' + money(rc.amount)));
        r.appendChild(btn('✕', '', function () {
          if (!window.confirm(t('confirm_remove_payment'))) return;
          if (rc.entryId && rc.bookId) removeEntryFromBook(rc.bookId, rc.entryId);
          inv.receipts = inv.receipts.filter(function (a) { return a.id !== rc.id; });
          save(); renderAll();
        }));
        card.appendChild(r);
      });
      var row = el('div', 'btnrow');
      if (c.balance > 0) row.appendChild(btn(t('receive'), 'primary', function () { receiveInvoice(p, inv); }));
      row.appendChild(btn(t('print'), '', function () { printInvoice(p, inv); }));
      row.appendChild(btn(t('export_invoice_xlsx'), '', function () {
        saveWorkbook('Invoice-' + safeName(p.name) + '-' + safeName(inv.no || inv.date), window.CBExcel.invoiceWorkbook(p, inv.id));
      }));
      row.appendChild(btn(t('edit_invoice'), '', function () { editInvoice(p, inv); }));
      card.appendChild(row);
      body.appendChild(card);
    });
  }

  function toggleSent(inv, stKey) {
    if (stKey === 'sent') { inv.status = 'draft'; inv.sentDate = ''; save(); renderAll(); return; }
    openForm({
      title: t('mark_sent') + ' – ' + (inv.no || ''),
      fields: [{ key: 'date', label: t('sent_date'), type: 'date', value: inv.sentDate || L.todayStr(), required: true }],
      onSubmit: function (v) { inv.status = 'sent'; inv.sentDate = L.isDate(v.date) ? v.date : L.todayStr(); save(); renderAll(); return null; }
    });
  }

  /* Pick the customer, then make an invoice of their trips that are not invoiced yet. */
  function newInvoiceFlow(p, customer) {
    var names = [];
    L.customerBalances(p).forEach(function (x) { if (x.unbilled > 0) names.push(x); });
    if (customer != null && customer !== '') { editInvoice(p, null, { customer: customer }); return; }
    if (!names.length) { toast(t('no_trips_to_invoice')); return; }
    if (names.length === 1) { editInvoice(p, null, { customer: names[0].customer }); return; }
    actionSheet(t('create_invoice'), names.map(function (x) {
      return { label: (x.customer || t('uncategorized')) + ' · ' + money(x.unbilled), run: function () { editInvoice(p, null, { customer: x.customer }); } };
    }));
  }

  function editInvoice(p, inv, preset) {
    var isNew = !inv;
    var v0 = inv || { no: L.nextInvoiceNo(p), date: L.todayStr(), due: '', customer: preset ? preset.customer : '', note: '' };
    var fields = [
      { key: 'no', label: t('inv_no'), type: 'text', value: v0.no, max: 20 },
      { key: 'customer', label: t('customer'), type: 'text', value: v0.customer, max: 60, required: true },
      { key: 'date', label: t('date'), type: 'date', value: v0.date, required: true },
      { key: 'due', label: t('due_date'), type: 'date', value: v0.due || '' },
      { key: 'note', label: t('remark'), type: 'text', value: v0.note, max: 80 }
    ];
    if (isNew) {
      fields.push({ key: 'upto', label: t('trips_up_to'), type: 'date', value: L.todayStr(), required: true });
      fields.push({ type: 'note', text: t('invoice_trips_note') });
    }
    openForm({
      title: isNew ? t('add_invoice') : t('edit_invoice'),
      fields: fields,
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        if (isNew) {
          var ni = L.sanitizeInvoice({ no: v.no, date: date, due: v.due, customer: v.customer, note: v.note });
          var trips = L.unbilledTrips(p, v.customer).filter(function (x) { return x.date <= (L.isDate(v.upto) ? v.upto : L.todayStr()); });
          if (!trips.length) return t('no_trips_to_invoice');
          p.invoices.push(ni);
          trips.forEach(function (x) { x.invoiceId = ni.id; });
        } else {
          var oldName = inv.customer;
          inv.no = v.no.slice(0, 20); inv.customer = v.customer.slice(0, 60); inv.date = date; inv.due = L.isDate(v.due) ? v.due : ''; inv.note = v.note.slice(0, 80);
          if (oldName !== inv.customer) { /* trips keep their own customer name */ }
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_invoice'))) return false;
        var ids = L.tripsOfInvoice(p, inv.id).map(function (x) { return x.id; });
        trashPut('invoice', (inv.no || '') + ' ' + (inv.customer || ''), inv, { projectId: p.id, tripIds: ids });
        clearEntryLinks('invoiceId', inv.id);
        p.trips.forEach(function (x) { if (x.invoiceId === inv.id) x.invoiceId = 0; });
        p.invoices = p.invoices.filter(function (x) { return x.id !== inv.id; });
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }

  function receiveInvoice(p, inv) {
    var c = L.invoiceCalc(p, inv);
    var books = linkedBookOptions(p, true);
    openForm({
      title: t('receive') + ': ' + (inv.no || ''),
      fields: [
        { key: 'date', label: t('payment_date'), type: 'date', value: L.todayStr(), required: true },
        { key: 'amount', label: t('pay_amount'), type: 'number', min: 0.01, value: c.balance, required: true },
        { key: 'by', label: t('received_by'), type: 'select', options: [{ value: '', label: t('received_by_me') }].concat(p.workers.map(function (w) { return { value: String(w.id), label: w.name + ' (' + t('driver_holds') + ')' }; })), value: '' },
        { key: 'bookId', label: t('record_in_book'), type: 'select', options: books, value: books.length > 1 ? books[1].value : '', showFor: { key: 'by', values: [''] } }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        var amount = L.round2(v.amount);
        if (!window.confirm(t('cf_receive', { amount: money(amount), name: inv.customer || inv.no || t('customer') }))) return ' ';
        recordReceipt(p, inv, date, amount, v.bookId, Number(v.by) || 0);
        save(); renderAll();
        return null;
      }
    });
  }

  /* --- fuel, repairs and supplier bills --- */
  function costFilter() { if (!ui.costF) ui.costF = { truck: 0, code: '' }; return ui.costF; }

  function secCosts(body, p) {
    var F = costFilter();
    if (F.truck && !byId(p.trucks, F.truck)) F.truck = 0;
    var top = panel(t('costs_title'));
    var qrow = el('div', 'btnrow');
    qrow.appendChild(btn('⛽ ' + t('add_fuel'), 'primary', function () { editBill(p, null, { code: 'fuel' }); }));
    qrow.appendChild(btn('🔧 ' + t('add_repair'), 'primary', function () { editBill(p, null, { code: 'repairs' }); }));
    top.appendChild(qrow);
    top.appendChild(btn(t('add_bill'), 'block', function () { editBill(p, null); }));
    function sel(label, opts, val, on) {
      var lab = el('label', 'field'), s = document.createElement('select');
      lab.appendChild(el('span', null, label));
      opts.forEach(function (o) { s.appendChild(option(o.value, o.label)); });
      s.value = val;
      s.addEventListener('change', function () { on(s.value); renderProjects(); });
      lab.appendChild(s);
      top.appendChild(lab);
    }
    sel(t('truck'), [{ value: '', label: t('all') }].concat(truckOptions(p, false, F.truck)), F.truck ? String(F.truck) : '', function (v) { F.truck = Number(v) || 0; });
    sel(t('cost_code'), [{ value: '', label: t('all') }].concat(codeOptions()), F.code || '', function (v) { F.code = v; });
    body.appendChild(top);

    var sb = L.supplierBalances(p);
    var pn = panel(t('unpaid_suppliers'));
    if (!sb.length) pn.appendChild(el('p', 'muted small', t('no_data')));
    sb.forEach(function (x) { pn.appendChild(kv(x.supplier || t('uncategorized'), money(x.balance), 'neg')); });
    if (sb.length || p.bills.length) pn.appendChild(btn(t('supplier_stmt'), 'block', function () { pickSupplierStatement(p); }));
    body.appendChild(pn);

    var bills = p.bills.filter(function (b) { return (!F.truck || b.truck === F.truck) && (!F.code || b.code === F.code); }).sort(newestFirst);
    var litres = L.round3(bills.reduce(function (a, b) { return a + (b.code === 'fuel' ? b.litres : 0); }, 0));
    if (bills.length) body.appendChild(kv(t('bills') + ' (' + bills.length + ')', money(L.round2(bills.reduce(function (a, b) { return a + b.amount; }, 0))) + (litres > 0 ? ' · ' + litres + ' L' : ''), '', 'total'));
    if (!bills.length) body.appendChild(el('p', 'empty', t('no_bills')));
    bills.forEach(function (bill) {
      var card = panel(null);
      card.appendChild(el('h3', null, (bill.supplier || t('uncategorized')) + (bill.desc ? ' – ' + bill.desc : '')));
      card.appendChild(el('div', 'muted small', [fmtDate(bill.date), codeLabel(bill.code), L.truckName(p, bill.truck) ? '🚚 ' + L.truckName(p, bill.truck) : '',
        bill.litres > 0 ? bill.litres + ' L' : '', bill.odo > 0 ? bill.odo + ' km' : ''].filter(Boolean).join(' · ')));
      card.appendChild(kv(t('bill_amount'), money(bill.amount)));
      thumbsOnly(card, bill.photos);
      card.appendChild(kv(t('paid'), money(L.billPaid(bill))));
      var bal = L.billBalance(bill);
      card.appendChild(kv(t('balance_due'), money(bal), bal > 0 ? 'neg' : 'pos'));
      bill.payments.forEach(function (pay) {
        var r = el('div', 'pay');
        r.appendChild(el('span', null, fmtDate(pay.date) + ' · ' + money(pay.amount)));
        r.appendChild(btn('✕', '', function () {
          if (!window.confirm(t('confirm_remove_payment'))) return;
          if (pay.entryId && pay.bookId) removeEntryFromBook(pay.bookId, pay.entryId);
          bill.payments = bill.payments.filter(function (x) { return x.id !== pay.id; });
          save(); renderAll();
        }));
        card.appendChild(r);
      });
      var row = el('div', 'btnrow');
      if (bal > 0) row.appendChild(btn(t('pay'), 'primary', function () { payBill(p, bill); }));
      row.appendChild(btn(t('edit_bill'), '', function () { editBill(p, bill); }));
      card.appendChild(row);
      body.appendChild(card);
    });
  }

  function codeOptions() {
    return L.CODES.map(function (c) { return { value: c, label: codeLabel(c) }; });
  }

  function editBill(p, bill, preset) {
    var isNew = !bill;
    var b = bill || { date: L.todayStr(), supplier: '', code: preset && preset.code ? preset.code : 'fuel', desc: '', amount: '', due: '', truck: ui.costF && ui.costF.truck || 0, litres: '', odo: '' };
    var pst = newPhotoState(bill ? bill.photos : []);
    var books = linkedBookOptions(p, true);
    var fields = [
      { key: 'date', label: t('date'), type: 'date', value: b.date, required: true },
      { key: 'supplier', label: t('supplier_station'), type: 'text', value: b.supplier, required: true },
      { key: 'truck', label: t('truck'), type: 'select', options: truckOptions(p, true, b.truck), value: b.truck ? String(b.truck) : '' },
      { key: 'code', label: t('cost_code'), type: 'select', options: codeOptions(), value: b.code },
      { key: 'desc', label: t('description'), type: 'text', value: b.desc, max: 80 },
      { key: 'litres', label: t('litres'), type: 'number', min: 0, noCalc: true, value: b.litres || '', showFor: { key: 'code', values: ['fuel'] } },
      { key: 'odo', label: t('odometer'), type: 'number', min: 0, noCalc: true, value: b.odo || '' },
      { key: 'amount', label: t('bill_amount'), type: 'number', min: 0.01, value: b.amount, required: true }
    ];
    if (isNew) {
      fields.push({ key: 'pay', label: t('payment'), type: 'select', options: [{ value: 'paid', label: t('paid_now') }, { value: 'credit', label: t('on_credit') }], value: 'paid' });
      fields.push({ key: 'bookId', label: t('record_in_book'), type: 'select', options: books, value: books.length > 1 ? books[1].value : '', showFor: { key: 'pay', values: ['paid'] } });
      fields.push({ key: 'due', label: t('due_date'), type: 'date', value: '', showFor: { key: 'pay', values: ['credit'] } });
    } else {
      fields.push({ key: 'due', label: t('due_date'), type: 'date', value: b.due || '' });
    }
    fields.push({ key: 'photos', type: 'photos', state: pst });
    openForm({
      title: isNew ? t('add_bill') : t('edit_bill'),
      fields: fields,
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        var truckId = Number(v.truck) || 0;
        if (isNew) {
          var nb = L.sanitizeBill({ date: date, supplier: v.supplier, truck: truckId, code: v.code, desc: v.desc, litres: v.code === 'fuel' ? v.litres : 0, odo: v.odo, amount: v.amount, due: v.pay === 'credit' ? v.due : '', photos: pst.ids });
          if (!nb) return t('required');
          p.bills.push(nb);
          if (v.pay === 'paid') recordBillPayment(p, nb, date, nb.amount, v.bookId);
        } else {
          bill.date = date; bill.supplier = v.supplier.slice(0, 60); bill.code = v.code; bill.truck = truckId; bill.desc = v.desc.slice(0, 80);
          bill.litres = v.code === 'fuel' ? L.round3(Math.max(0, v.litres)) : 0; bill.odo = Math.round(Math.max(0, v.odo));
          bill.amount = L.round2(v.amount);
          bill.due = L.isDate(v.due) ? v.due : '';
          bill.photos = L.photoIds(pst.ids);
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_bill'))) return false;
        trashPut('bill', (bill.supplier || '') + ' ' + (bill.desc || ''), bill, { projectId: p.id }, bill.photos);
        clearEntryLinks('billId', bill.id);
        p.bills = p.bills.filter(function (x) { return x.id !== bill.id; });
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }

  function payBill(p, bill) {
    var bal = L.billBalance(bill);
    var books = linkedBookOptions(p, true);
    openForm({
      title: t('pay') + ': ' + (bill.supplier || ''),
      fields: [
        { key: 'date', label: t('payment_date'), type: 'date', value: L.todayStr(), required: true },
        { key: 'amount', label: t('pay_amount'), type: 'number', min: 0.01, value: bal, required: true },
        { key: 'bookId', label: t('record_in_book'), type: 'select', options: books, value: books.length > 1 ? books[1].value : '' }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        var amount = L.round2(v.amount);
        if (!window.confirm(t('cf_pay_bill', { amount: money(amount), name: bill.supplier || bill.desc || '' }))) return ' ';
        recordBillPayment(p, bill, date, amount, v.bookId);
        save(); renderAll();
        return null;
      }
    });
  }

  /* --- drivers and helpers --- */
  function secLabour(body, p) {
    var wk = L.weekRange(ui.labourDate);
    var nav = el('div', 'monthnav');
    nav.appendChild(btn('‹', 'icon', function () { ui.labourDate = addDays(ui.labourDate, -7); renderProjects(); }));
    nav.appendChild(el('strong', null, t('week') + ' ' + fmtDate(wk.from) + ' – ' + fmtDate(wk.to)));
    nav.appendChild(btn('›', 'icon', function () { ui.labourDate = addDays(ui.labourDate, 7); renderProjects(); }));
    body.appendChild(nav);

    var pn = panel(t('attendance'));
    var dateRow = el('label', 'field');
    dateRow.appendChild(el('span', null, t('date')));
    var di = document.createElement('input');
    di.type = 'date';
    di.value = ui.labourDate;
    di.addEventListener('change', function () { if (L.isDate(di.value)) { ui.labourDate = di.value; renderProjects(); } });
    dateRow.appendChild(di);
    makeDate(di, false);
    pn.appendChild(dateRow);

    if (!p.workers.length) pn.appendChild(el('p', 'muted small', t('no_workers')));
    else pn.appendChild(btn(t('worker_stmt'), 'block', function () { pickWorkerStatement(p, wk); }));
    p.workers.forEach(function (w) {
      var row = p.attendance.filter(function (a) { return a.workerId === w.id && a.date === ui.labourDate; })[0] || null;
      var line = el('div', 'attrow');
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', w.name));
      meta.appendChild(el('div', 'detail', [w.role, w.truck ? '🚚 ' + L.truckName(p, w.truck) : '', money(row ? row.rate : w.rate)].filter(Boolean).join(' · ')));
      meta.style.cursor = 'pointer';
      meta.addEventListener('click', function () { editWorker(p, w); });
      line.appendChild(meta);
      var inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = '3'; inp.step = '0.5'; inp.inputMode = 'decimal';
      inp.placeholder = '0';
      inp.value = row ? row.days : '';
      inp.setAttribute('aria-label', w.name + ' – ' + t('days'));
      if (row && row.paid) { inp.disabled = true; line.appendChild(el('span', 'paidmark', '✓')); }
      inp.addEventListener('change', function () {
        var days = Math.min(3, Math.max(0, parseFloat(inp.value) || 0));
        days = Math.round(days * 2) / 2;
        p.attendance = p.attendance.filter(function (a) { return !(a.workerId === w.id && a.date === ui.labourDate); });
        if (days > 0) {
          var a = L.sanitizeAttendance({ id: L.newId(), date: ui.labourDate, workerId: w.id, days: days, rate: w.rate, paid: false });
          if (a) p.attendance.push(a);
        }
        save(); renderProjects();
      });
      line.appendChild(inp);
      pn.appendChild(line);
    });
    body.appendChild(pn);

    var pr = L.payroll(p, wk.from, wk.to);
    var sum = panel(t('unpaid_wages'));
    if (!pr.rows.length) sum.appendChild(el('p', 'muted small', t('no_unpaid')));
    pr.rows.forEach(function (r) { sum.appendChild(kv(r.name + ' · ' + r.days + ' ' + t('days'), money(r.amount))); });
    if (pr.rows.length) {
      sum.appendChild(kv(t('unpaid_wages'), money(pr.total), 'total'));
      sum.appendChild(btn(t('mark_week_paid'), 'primary block', function () { payWeek(p, wk, pr); }));
    }
    body.appendChild(sum);
  }

  function editWorker(p, w) {
    var isNew = !w;
    var x = w || { name: '', role: t('driver'), rate: '', truck: 0 };
    openForm({
      title: isNew ? t('add_worker') : t('edit_worker'),
      fields: [
        { key: 'name', label: t('worker_name'), type: 'text', value: x.name, required: true },
        { key: 'role', label: t('role'), type: 'text', value: x.role, max: 40 },
        { key: 'truck', label: t('usual_truck'), type: 'select', options: truckOptions(p, true, x.truck), value: x.truck ? String(x.truck) : '' },
        { key: 'rate', label: t('daily_rate'), type: 'number', min: 0, value: x.rate }
      ],
      onSubmit: function (v) {
        var tid = Number(v.truck) || 0;
        if (isNew) {
          var nw = L.sanitizeWorker({ name: v.name, role: v.role, rate: v.rate, truck: tid });
          if (!nw) return t('required');
          p.workers.push(nw);
        } else {
          w.name = v.name.slice(0, 60); w.role = v.role.slice(0, 40); w.rate = Math.max(0, L.round2(v.rate)); w.truck = tid;
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_worker'))) return false;
        p.workers = p.workers.filter(function (a) { return a.id !== w.id; });
        p.attendance = p.attendance.filter(function (a) { return a.workerId !== w.id; });
        p.trucks.forEach(function (tk) { if (tk.driverId === w.id) tk.driverId = 0; });
        p.trips.forEach(function (tr) { if (tr.driver === w.id) tr.driver = 0; });
        save(); renderAll();
        return true;
      }
    });
  }

  function payWeek(p, wk, pr) {
    var books = linkedBookOptions(p, true);
    openForm({
      title: t('mark_week_paid'),
      fields: [
        { type: 'note', text: t('pay_wages_note', { from: fmtDate(wk.from), to: fmtDate(wk.to), total: money(pr.total) }) },
        { key: 'date', label: t('payment_date'), type: 'date', value: L.todayStr(), required: true },
        { key: 'bookId', label: t('record_in_book'), type: 'select', options: books, value: books.length > 1 ? books[1].value : '' }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        if (!window.confirm(t('cf_wages', { total: money(pr.total), from: fmtDate(wk.from), to: fmtDate(wk.to) }))) return ' ';
        var target = v.bookId ? bookById(v.bookId) : null;
        if (target) {
          // one cash-out entry per truck (drivers' usual truck), so each truck's profit carries its drivers' pay
          var groups = {}, order = [];
          pr.rows.forEach(function (r) {
            var w = byId(p.workers, r.workerId), tid = w && byId(p.trucks, w.truck) ? w.truck : 0;
            if (!(tid in groups)) { groups[tid] = 0; order.push(tid); }
            groups[tid] = L.round2(groups[tid] + r.amount);
          });
          order.forEach(function (tid) {
            if (!(groups[tid] > 0)) return;
            target.entries.push(L.sanitizeEntry({
              id: L.newId(), type: 'out', amount: groups[tid], date: date,
              category: codeLabel('driver'), note: t('wages_for', { from: fmtDate(wk.from), to: fmtDate(wk.to) }), code: 'driver', truck: tid, party: ''
            }));
          });
        }
        L.markPaid(p, wk.from, wk.to);
        save(); renderAll();
        return null;
      }
    });
  }


  /* --- cash in / cash out of trucks and drivers --- */
  var DRIVER_KINDS = ['advance', 'spent', 'return', 'handover', 'salary', 'pay', 'deduct'];
  function cashLabel(k) { return t('ck_' + k); }
  function driverName(p, id) { var w = byId(p.workers, id); return w ? w.name : '—'; }
  function secCash(body, p) {
    if (!ui.cashTab) ui.cashTab = 'day';
    if (!ui.cashDate) ui.cashDate = L.todayStr();
    if (!ui.cashFrom) ui.cashFrom = L.todayStr().slice(0, 8) + '01';
    if (!ui.cashTo) ui.cashTo = L.todayStr();
    var tabs = el('div', 'seg');
    tabs.setAttribute('data-ro', '1');
    [['day', 'cash_day'], ['trucks', 'cash_trucks'], ['drivers', 'cash_drivers']].forEach(function (x) {
      tabs.appendChild(btn(t(x[1]), ui.cashTab === x[0] ? 'active' : '', function () { ui.cashTab = x[0]; renderProjects(); }));
    });
    body.appendChild(tabs);
    var top = panel(null);
    top.appendChild(btn(t('add_cash'), 'primary block', function () { editCash(p, null, {}); }));
    body.appendChild(top);
    if (ui.cashTab === 'trucks') cashTrucksTab(body, p);
    else if (ui.cashTab === 'drivers') cashDriversTab(body, p);
    else cashDayTab(body, p);
    var ex = panel(null);
    ex.appendChild(btn(t('export_cash_csv'), 'block', function () {
      saveFile('truckbook-cash-' + safeName(p.name) + '-' + L.todayStr() + '.csv', 'text/csv', L.cashCsv(state, p));
    }));
    ex.appendChild(el('p', 'note', t('cash_note')));
    body.appendChild(ex);
  }
  function cashLineRow(p, l, showTruck) {
    var row = el('button', 'remrow');
    row.type = 'button';
    var tx = el('span', 'stext');
    tx.appendChild(el('b', null, fmtDate(l.date) + ' · ' + (l.ref ? cashLabel(l.kind) : t('cl_' + l.kind))));
    tx.appendChild(el('small', 'muted', [showTruck ? (L.truckName(p, l.truck) || '') : '', l.driver ? driverName(p, l.driver) : '', l.label].filter(Boolean).join(' · ')));
    row.appendChild(tx);
    row.appendChild(el('span', 'amt ' + (l.dir === 'out' ? 'out' : ''), (l.dir === 'out' ? '−' : '+') + money(l.amount)));
    if (l.ref) row.addEventListener('click', function () { editCash(p, l.ref, {}); });
    return row;
  }
  function cashDayTab(body, p) {
    var nav = el('div', 'monthnav');
    nav.setAttribute('data-ro', '1');
    nav.appendChild(btn('‹', 'icon', function () { ui.cashDate = addDays(ui.cashDate, -1); renderProjects(); }));
    nav.appendChild(el('strong', null, fmtDate(ui.cashDate)));
    nav.appendChild(btn('›', 'icon', function () { ui.cashDate = addDays(ui.cashDate, 1); renderProjects(); }));
    nav.appendChild(btn(t('today'), '', function () { ui.cashDate = L.todayStr(); renderProjects(); }));
    body.appendChild(nav);
    var lines = L.cashLines(state, p, ui.cashDate, ui.cashDate);
    var inn = 0, out = 0;
    lines.forEach(function (l) { if (l.dir === 'in') inn += l.amount; else out += l.amount; });
    inn = L.round2(inn); out = L.round2(out);
    var pn = panel(t('cash_day'));
    pn.appendChild(kv(t('cash_in'), money(inn), 'pos'));
    pn.appendChild(kv(t('cash_out'), money(out), out > 0 ? 'neg' : ''));
    pn.appendChild(kv(t('cash_net'), money(L.round2(inn - out)), inn - out < 0 ? 'neg' : 'pos', 'total'));
    if (L.projectBooks(state, p.id).length) pn.appendChild(kv(t('cash_on_hand'), money(L.cashOnHand(state, p, ui.cashDate))));
    body.appendChild(pn);
    if (!lines.length) { body.appendChild(el('p', 'empty', t('cash_none_day'))); return; }
    lines.forEach(function (l) { body.appendChild(cashLineRow(p, l, true)); });
  }
  function cashTrucksTab(body, p) {
    var pn = panel(t('cash_trucks'));
    [['cash_from', 'cashFrom'], ['cash_to', 'cashTo']].forEach(function (x) {
      var lab = el('label', 'field'), di = document.createElement('input');
      lab.appendChild(el('span', null, t(x[0])));
      di.type = 'date'; di.value = ui[x[1]];
      di.addEventListener('change', function () { if (L.isDate(di.value)) { ui[x[1]] = di.value; renderProjects(); } });
      lab.appendChild(di);
      makeDate(di, false);
      pn.appendChild(lab);
    });
    body.appendChild(pn);
    var rows = L.truckCash(state, p, ui.cashFrom, ui.cashTo), tin = 0, tout = 0;
    rows.forEach(function (r) {
      tin += r.inn; tout += r.out;
      var card = el('button', 'remrow');
      card.type = 'button';
      var tx = el('span', 'stext');
      tx.appendChild(el('b', null, r.truck ? L.truckName(p, r.truck) : t('no_truck_cash')));
      tx.appendChild(el('small', 'muted', t('cash_in') + ' ' + money(r.inn) + ' · ' + t('cash_out') + ' ' + money(r.out)));
      card.appendChild(tx);
      card.appendChild(el('span', 'amt ' + (r.net < 0 ? 'out' : ''), money(r.net)));
      card.addEventListener('click', function () { ui.cashTruck = ui.cashTruck === r.truck ? -1 : r.truck; renderProjects(); });
      body.appendChild(card);
      if (ui.cashTruck === r.truck) {
        L.cashLines(state, p, ui.cashFrom, ui.cashTo).filter(function (l) { return (rows.some(function (q) { return q.truck === l.truck; }) ? l.truck : 0) === r.truck; })
          .forEach(function (l) { body.appendChild(cashLineRow(p, l, false)); });
      }
    });
    var tot = panel(null);
    tot.appendChild(kv(t('cash_in'), money(L.round2(tin)), 'pos'));
    tot.appendChild(kv(t('cash_out'), money(L.round2(tout)), tout > 0 ? 'neg' : ''));
    tot.appendChild(kv(t('cash_net'), money(L.round2(tin - tout)), tin - tout < 0 ? 'neg' : 'pos', 'total'));
    body.appendChild(tot);
  }
  function cashDriversTab(body, p) {
    if (!p.workers.length) { body.appendChild(el('p', 'empty', t('no_drivers_cash'))); return; }
    p.workers.forEach(function (w) {
      var ac = L.driverAccount(p, w.id), card = panel(null);
      card.appendChild(el('h3', null, '👤 ' + w.name + (w.truck ? ' · ' + L.truckName(p, w.truck) : '')));
      if (ac.collected > 0) card.appendChild(kv(t('collected_from_customers'), money(ac.collected)));
      card.appendChild(kv(t('held_by_driver'), money(ac.held), ac.held < 0 ? 'neg' : ''));
      card.appendChild(kv(t('wages_owed'), money(ac.owed)));
      if (ac.attendance > 0) card.appendChild(el('div', 'muted small', t('incl_attendance', { n: money(L.round2(ac.attendance)) })));
      card.appendChild(kv(ac.net >= 0 ? t('owner_owes') : t('driver_owes'), money(Math.abs(ac.net)), ac.net > 0 ? 'neg' : ac.net < 0 ? 'pos' : '', 'total'));
      var row = el('div', 'btnrow');
      row.appendChild(btn(t('ck_advance_short'), 'primary', function () { editCash(p, null, { kind: 'advance', driver: w.id, truck: w.truck }); }));
      row.appendChild(btn(t('ck_spent_short'), '', function () { editCash(p, null, { kind: 'spent', driver: w.id, truck: w.truck }); }));
      row.appendChild(btn(t('ck_return_short'), '', function () { editCash(p, null, { kind: 'return', driver: w.id, truck: w.truck }); }));
      row.appendChild(btn(t('ck_handover_short'), ac.collected > 0 ? 'primary' : '', function () { editCash(p, null, { kind: 'handover', driver: w.id, truck: w.truck, amount: ac.held > 0 ? ac.held : '' }); }));
      row.appendChild(btn(t('ck_pay_short'), '', function () { editCash(p, null, { kind: 'pay', driver: w.id, truck: w.truck }); }));
      row.appendChild(btn(t('ck_deduct_short'), '', function () { editCash(p, null, { kind: 'deduct', driver: w.id, truck: w.truck }); }));
      row.appendChild(btn(t('ck_salary_short'), '', function () { editCash(p, null, { kind: 'salary', driver: w.id, truck: w.truck }); }));
      card.appendChild(row);
      var open = ui.cashDriver === w.id;
      card.appendChild(btn(open ? t('hide_ledger') : t('show_ledger') + ' (' + ac.entries.length + ')', 'block', function () { ui.cashDriver = open ? 0 : w.id; renderProjects(); }));
      body.appendChild(card);
      if (open) ac.entries.forEach(function (c) {
        var r = el('button', 'remrow');
        r.type = 'button';
        var tx = el('span', 'stext');
        tx.appendChild(el('b', null, fmtDate(c.date) + ' · ' + cashLabel(c.kind)));
        tx.appendChild(el('small', 'muted', [c.truck ? L.truckName(p, c.truck) : '', c.code && c.kind === 'spent' ? codeLabel(c.code) : '', c.note].filter(Boolean).join(' · ')));
        r.appendChild(tx);
        r.appendChild(el('span', 'amt', money(c.amount)));
        r.addEventListener('click', function () { editCash(p, c, {}); });
        body.appendChild(r);
      });
    });
  }

  function editCash(p, c, preset) {
    var isNew = !c;
    preset = preset || {};
    var x = c || { date: L.todayStr(), kind: preset.kind || 'advance', truck: preset.truck || 0, driver: preset.driver || 0, amount: preset.amount || '', code: 'fuel', note: '' };
    var books = linkedBookOptions(p, true);
    var codeOpts = L.CODES.filter(function (k) { return k !== 'driver'; }).map(function (k) { return { value: k, label: codeLabel(k) }; });
    var moveKinds = ['advance', 'return', 'handover', 'pay', 'in', 'out'];
    openForm({
      title: isNew ? t('add_cash') : t('edit_cash'),
      fields: [
        { key: 'date', label: t('date'), type: 'date', value: x.date, required: true },
        { key: 'kind', label: t('cash_type'), type: 'select', options: L.CASH_KINDS.map(function (k) { return { value: k, label: cashLabel(k) }; }), value: x.kind },
        { key: 'driver', label: t('driver'), type: 'select', options: workerOptions(p), value: x.driver ? String(x.driver) : '', showFor: { key: 'kind', values: DRIVER_KINDS } },
        { key: 'truck', label: t('truck'), type: 'select', options: truckOptions(p, true, x.truck), value: x.truck ? String(x.truck) : '' },
        { key: 'amount', label: t('amount'), type: 'number', min: 0.01, value: x.amount, required: true },
        { key: 'code', label: t('expense_type'), type: 'select', options: codeOpts, value: x.code && x.code !== 'driver' ? x.code : 'fuel', showFor: { key: 'kind', values: ['spent', 'out'] } },
        { key: 'note', label: t('remark'), type: 'text', value: x.note, max: 80 },
        { key: 'bookId', label: t('record_in_book'), type: 'select', options: books, value: c ? (c.bookId || '') : (books.length > 1 ? books[1].value : ''), showFor: { key: 'kind', values: moveKinds } }
      ],
      onSubmit: function (v) {
        var kind = v.kind, did = Number(v.driver) || 0;
        if (DRIVER_KINDS.indexOf(kind) >= 0 && !did) return t('pick_driver');
        var nc = L.sanitizeCash({ id: c ? c.id : 0, date: L.isDate(v.date) ? v.date : L.todayStr(), kind: kind, truck: Number(v.truck) || 0, driver: DRIVER_KINDS.indexOf(kind) >= 0 ? did : 0,
          amount: v.amount, code: v.code, note: v.note });
        if (!nc) return t('required');
        if (c && c.entryId && c.bookId) removeEntryFromBook(c.bookId, c.entryId);
        var target = moveKinds.indexOf(kind) >= 0 && v.bookId ? bookById(v.bookId) : null;
        if (target) {
          var e = L.sanitizeEntry({ id: L.newId(), type: L.CASH_MOVES[kind], amount: nc.amount, date: nc.date, category: cashLabel(kind).slice(0, 40), note: nc.note,
            code: kind === 'pay' || kind === 'out' ? nc.code : '', truck: nc.truck, party: nc.driver ? driverName(p, nc.driver) : '', moveId: nc.id });
          target.entries.push(e);
          nc.entryId = e.id; nc.bookId = target.id;
        }
        if (c) p.cash[p.cash.indexOf(c)] = nc; else p.cash.push(nc);
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_cash'))) return false;
        if (c.entryId && c.bookId) removeEntryFromBook(c.bookId, c.entryId);
        trashPut('cash', fmtDate(c.date) + ' ' + cashLabel(c.kind) + ' ' + money(c.amount), c, { projectId: p.id });
        p.cash = p.cash.filter(function (a) { return a.id !== c.id; });
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }


  /* --- linked books --- */
  function secBooks(body, p) {
    var pn = panel(t('linked_books'));
    var linked = L.projectBooks(state, p.id);
    if (!linked.length) pn.appendChild(el('p', 'muted small', t('no_linked_books')));
    linked.forEach(function (b) {
      var tot = L.totals(b.entries);
      var card = el('div', 'sub');
      card.appendChild(el('h3', null, b.name));
      card.appendChild(kv(t('balance'), money(tot.balance), tot.balance < 0 ? 'neg' : 'pos'));
      card.appendChild(kv(t('cash_in'), money(tot.cashIn)));
      card.appendChild(kv(t('cash_out'), money(tot.cashOut)));
      var row = el('div', 'btnrow');
      row.appendChild(btn(t('open'), 'primary', function () { state.current = b.id; ui.bookOpen = true; save(); showView('entries'); renderAll(); }));
      row.appendChild(btn(t('unlink'), '', function () { b.projectId = ''; save(); renderAll(); }));
      card.appendChild(row);
      pn.appendChild(card);
    });
    body.appendChild(pn);
    body.appendChild(btn(t('link_book'), 'primary block', function () { linkBookForm(p); }));
  }

  function linkBookForm(p) {
    var free = state.books.filter(function (b) { return b.projectId !== p.id; });
    var opts = [{ value: '', label: t('none_opt') }].concat(free.map(function (b) { return { value: b.id, label: b.name }; }));
    openForm({
      title: t('link_book'),
      fields: [
        { key: 'existing', label: t('existing_book'), type: 'select', options: opts, value: '' },
        { key: 'name', label: t('or_new_book'), type: 'text', value: '', max: 40 }
      ],
      onSubmit: function (v) {
        if (v.name) {
          var id = 'b' + L.newId();
          state.books.push({ id: id, name: v.name.slice(0, 40), projectId: p.id, entries: [] });
        } else if (v.existing) {
          var b = bookById(v.existing);
          if (b) b.projectId = p.id;
        } else {
          return t('pick_book');
        }
        save(); renderAll();
        return null;
      }
    });
  }

  /* ---------- render all / views ---------- */
  function renderAll() {
    applyTheme();
    applyStaticText();
    enhanceStaticDates();
    renderBooks();
    renderBookList();
    applyEntriesScreen();
    renderEntries();
    renderProjects();
    renderContacts();
    renderReports();
    renderSettings();
    renderBiz();
    renderReminders();
    renderBackupState();
    if (window.__renderCloud) window.__renderCloud();
  }

  var VIEWS = ['entries', 'contacts', 'projects', 'reports', 'settings'];
  function showView(name) {
    ui.view = name;
    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    document.body.classList.remove('view-entries', 'view-contacts', 'view-projects', 'view-reports', 'view-settings');
    document.body.classList.add('view-' + name);
    applyEntriesScreen();
    window.scrollTo(0, 0);
  }

  /* ---------- entry add / edit ---------- */
  var editingEntry = null;
  var entryPhotoSt = newPhotoState([]);

  function entryLinkOptions(project, type, current) {
    var opts = [option('', t('none_opt'))];
    if (type === 'out') {
      project.bills.forEach(function (b) {
        var bal = L.billBalance(b);
        if (bal > 0 || (current && current.billId === b.id)) {
          opts.push(option(String(b.id), (b.supplier || t('uncategorized')) + (b.desc ? ' – ' + b.desc : '') + ' (' + money(bal) + ')'));
        }
      });
    } else {
      project.invoices.forEach(function (c) {
        var bal = L.invoiceCalc(project, c).balance;
        if (bal > 0 || (current && current.invoiceId === c.id)) {
          opts.push(option(String(c.id), [c.no, c.customer].filter(Boolean).join(' · ') + ' (' + money(bal) + ')'));
        }
      });
    }
    return opts;
  }

  function refreshEntryLinks() {
    var proj = projectOfBook(book());
    var box = $('entryProject');
    box.hidden = !proj;
    if (!proj) return;
    var type = $('entryForm').elements.type.value === 'out' ? 'out' : 'in';
    $('linkLabel').textContent = type === 'out' ? t('pays_bill') : t('customer_invoice');
    var sel = $('linkSel');
    var keep = sel.value;
    sel.textContent = '';
    entryLinkOptions(proj, type, editingEntry).forEach(function (o) { sel.appendChild(o); });
    sel.value = keep && sel.querySelector('option[value="' + keep + '"]') ? keep : '';
    $('codeSel').parentNode.hidden = type !== 'out';
    $('secField').hidden = type !== 'out' || $('secSel').options.length < 2;
  }

  function openEntry(id) {
    if (!canEdit(book())) { toast(t('view_only_note')); return; }
    ui.editingId = id || null;
    var e = null;
    if (id) {
      book().entries.forEach(function (x) { if (x.id === id) e = x; });
      if (!e) return;
    }
    editingEntry = e;
    entryPhotoSt = newPhotoState(e ? e.photos : []);
    photoWidget($('entryPhotos'), entryPhotoSt, null, true);
    $('entryTitle').textContent = e ? t('edit_entry') : t('add_entry');
    $('entryForm').elements.type.value = e ? e.type : 'in';
    $('amount').value = e ? e.amount : '';
    $('date').value = e ? e.date : L.todayStr();
    $('category').value = e ? e.category : '';
    $('note').value = e ? e.note : '';
    renderCatChips();
    $('deleteEntry').hidden = !e;
    fillContactSel(e ? e.contactId : 0);
    var ms = $('modeSel');
    ms.textContent = '';
    ms.appendChild(option('', t('mode_none')));
    L.MODES.forEach(function (m) { ms.appendChild(option(m, t('mode_' + m))); });
    ms.value = e ? e.mode : '';
    $('by').value = e ? e.by : myName();
    var bl = $('byList');
    bl.textContent = '';
    var bySeen = {};
    var biz = byId(state.businesses, book().businessId);
    var byNames = [myName()].concat(biz ? biz.staff.map(function (m) { return m.name; }) : [], book().entries.map(function (x) { return x.by; }));
    byNames.forEach(function (n) { if (n && !bySeen[n]) { bySeen[n] = true; bl.appendChild(option(n, '')); } });

    var proj = projectOfBook(book());
    if (proj) {
      var cs = $('codeSel');
      cs.textContent = '';
      cs.appendChild(option('', t('none_opt')));
      L.CODES.forEach(function (c) { cs.appendChild(option(c, codeLabel(c))); });
      cs.value = e ? e.code : '';
      var ss = $('secSel');
      ss.textContent = '';
      ss.appendChild(option('', t('none_opt')));
      proj.trucks.forEach(function (x) { if (x.active || (e && e.truck === x.id)) ss.appendChild(option(String(x.id), x.plate)); });
      ss.value = e && e.truck ? String(e.truck) : '';
      $('party').value = e ? e.party : '';
      var pl = $('partyList');
      pl.textContent = '';
      var seen = {};
      var names = [];
      book().entries.forEach(function (x) { if (x.party) names.push(x.party); });
      proj.bills.forEach(function (b) { if (b.supplier) names.push(b.supplier); });
      proj.workers.forEach(function (w) { names.push(w.name); });
      proj.trips.forEach(function (x) { if (x.customer) names.push(x.customer); });
      state.contacts.forEach(function (c) { names.push(c.name); });
      names.forEach(function (n) { if (!seen[n]) { seen[n] = true; pl.appendChild(option(n, '')); } });
      refreshEntryLinks();
      var cur = e ? (e.type === 'out' ? e.billId : e.invoiceId) : 0;
      $('linkSel').value = cur ? String(cur) : '';
    } else {
      refreshEntryLinks();
    }
    openModal('entryModal');
    if (!e) setTimeout(function () { $('amount').focus(); }, 50);
  }

  $('fab').addEventListener('click', buzz);
  $('fab').addEventListener('click', function () {
    if (ui.view === 'projects') {
      var p = currentProject();
      if (!p) { newProject(); return; }
      ({ overview: function () { editTrip(p, null); }, trucks: function () { editTruck(p, null); }, trips: function () { editTrip(p, null, tripFilter().truck ? { truck: tripFilter().truck } : null); }, costs: function () { editBill(p, null); },
         customers: function () { newInvoiceFlow(p); }, drivers: function () { editWorker(p, null); }, cash: function () { editCash(p, null, {}); }, books: function () { linkBookForm(p); } })[ui.section]();
      return;
    }
    openEntry(null);
  });
  $('cancelEntry').addEventListener('click', function () { rollbackPhotos(entryPhotoSt); closeModal('entryModal'); });
  $('entryModal').addEventListener('click', function (ev) { if (ev.target === this) { rollbackPhotos(entryPhotoSt); closeModal('entryModal'); } });
  Array.prototype.forEach.call(document.querySelectorAll('#entryForm input[name=type]'), function (r) {
    r.addEventListener('change', refreshEntryLinks);
  });

  $('linkSel').addEventListener('change', function () {
    var proj = projectOfBook(book());
    if (!proj || !this.value) return;
    var id = Number(this.value);
    var type = $('entryForm').elements.type.value;
    if (type === 'out') {
      var bill = byId(proj.bills, id);
      if (!bill) return;
      $('codeSel').value = bill.code;
      if (bill.truck && $('secSel').querySelector('option[value="' + bill.truck + '"]')) $('secSel').value = String(bill.truck);
      $('party').value = bill.supplier;
      if (!$('amount').value) $('amount').value = Math.max(0, L.billBalance(bill));
      if (!$('category').value) $('category').value = bill.desc || codeLabel(bill.code);
    } else {
      var inv = byId(proj.invoices, id);
      if (!inv) return;
      $('party').value = inv.customer;
      if (!$('amount').value) $('amount').value = Math.max(0, L.invoiceCalc(proj, inv).balance);
      if (!$('category').value) $('category').value = (t('invoice_title') + ' ' + (inv.no || '')).trim();
    }
  });

  $('entryForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = $('entryForm');
    var b = book();
    var proj = projectOfBook(b);
    var type = f.elements.type.value === 'out' ? 'out' : 'in';
    var prev = editingEntry;

    var code = prev ? prev.code : '', party = prev ? prev.party : '';
    var billId = prev ? prev.billId : 0, invoiceId = prev ? prev.invoiceId : 0, truck = prev ? prev.truck : 0;
    if (proj) {
      code = type === 'out' ? $('codeSel').value : '';
      truck = type === 'out' ? Number($('secSel').value) || 0 : 0;
      party = $('party').value;
      var linkVal = Number($('linkSel').value) || 0;
      billId = type === 'out' ? linkVal : 0;
      invoiceId = type === 'in' ? linkVal : 0;
    } else if (prev && prev.type !== type) {
      code = ''; billId = 0; invoiceId = 0; truck = 0;
    }

    var contactId = Number($('contactSel').value) || 0;
    var contact = contactId ? byId(state.contacts, contactId) : null;
    if (contact) party = contact.name; else contactId = 0;
    var draft = L.sanitizeEntry({
      mode: $('modeSel').value, by: $('by').value, contactId: contactId,
      id: ui.editingId || L.newId(),
      type: type,
      amount: parseFloat($('amount').value),
      date: $('date').value,
      category: $('category').value,
      note: $('note').value,
      code: code, truck: truck, party: party, billId: billId, invoiceId: invoiceId, photos: entryPhotoSt.ids
    });
    if (!draft) return;

    var entries = b.entries;
    if (ui.editingId) {
      for (var i = 0; i < entries.length; i++) if (entries[i].id === ui.editingId) entries[i] = draft;
    } else {
      entries.push(draft);
    }
    // keep bill payments / invoice receipts in step with the cash entry
    unlinkEntryEverywhere(draft.id);
    if (proj && (draft.billId || draft.invoiceId)) {
      var pay = L.sanitizePayment({ id: L.newId(), date: draft.date, amount: draft.amount, entryId: draft.id, bookId: b.id });
      var bill = draft.billId ? byId(proj.bills, draft.billId) : null;
      var invc = draft.invoiceId ? byId(proj.invoices, draft.invoiceId) : null;
      if (bill && pay) bill.payments.push(pay);
      else if (invc && pay) invc.receipts.push(pay);
      else { draft.billId = 0; draft.invoiceId = 0; }
    }
    commitPhotos(entryPhotoSt);
    save();
    closeModal('entryModal');
    renderAll();
  });

  $('deleteEntry').addEventListener('click', function () {
    if (!ui.editingId || !window.confirm(t('confirm_delete'))) return;
    var b = book();
    var ent = b.entries.filter(function (x) { return x.id === ui.editingId; })[0];
    unlinkEntryEverywhere(ui.editingId);
    deletePhotoIds(entryPhotoSt.removed);
    if (ent) trashPut('entry', (ent.category || ent.note || ent.party || '') + ' ' + money(ent.amount), ent, { bookId: b.id }, entryPhotoSt.ids);
    entryPhotoSt = newPhotoState([]);
    b.entries = b.entries.filter(function (x) { return x.id !== ui.editingId; });
    save();
    closeModal('entryModal');
    renderAll();
    undoToast();
  });

  /* ---------- filters ---------- */
  $('q').addEventListener('input', function () { ui.q = this.value; renderEntries(); });
  $('typeFilter').addEventListener('change', function () { ui.type = this.value; renderEntries(); });
  $('fromDate').addEventListener('change', function () { ui.from = this.value; renderEntries(); });
  $('toDate').addEventListener('change', function () { ui.to = this.value; renderEntries(); });
  $('contactFilter').addEventListener('change', function () { ui.contactId = Number(this.value) || 0; renderEntries(); });
  $('modeFilter').addEventListener('change', function () { ui.mode = this.value; renderEntries(); });
  $('byFilter').addEventListener('change', function () { ui.by = this.value; renderEntries(); });
  $('catFilter').addEventListener('change', function () { ui.category = this.value; renderEntries(); });
  $('clearFilters').addEventListener('click', function () {
    ui.mode = ''; ui.by = ''; ui.category = ''; ui.contactId = 0;
    ui.q = ''; ui.type = 'all'; ui.from = ''; ui.to = '';
    $('q').value = ''; $('typeFilter').value = 'all'; $('fromDate').value = ''; $('toDate').value = '';
    renderEntries();
  });

  /* ---------- contacts ---------- */
  function myName() { try { return window.__myName ? window.__myName() : ''; } catch (e) { return ''; } }

  function fillContactSel(current) {
    var sel = $('contactSel');
    sel.textContent = '';
    sel.appendChild(option('', t('no_contact_opt')));
    state.contacts.slice().sort(function (a, c) { return a.name.localeCompare(c.name); }).forEach(function (c) {
      sel.appendChild(option(String(c.id), c.name + (c.phone ? ' · ' + c.phone : '')));
    });
    if (hasPhoneBook) sel.appendChild(option('__phone', t('phonebook_opt')));
    sel.appendChild(option('__new', t('new_contact_opt')));
    sel.value = current && byId(state.contacts, current) ? String(current) : '';
    sel._prev = sel.value;
  }

  /* ---- phone book (Android contact picker; there is none in a plain browser) ---- */
  var hasPhoneBook = !!(window.AndroidBridge && typeof window.AndroidBridge.pickContact === 'function');
  var phonePick = null;
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function pickFromPhone(done) { phonePick = done; window.AndroidBridge.pickContact(); }
  window.__onPhoneContact = function (name, phone) {
    var cb = phonePick; phonePick = null;
    if (!cb || !name) return;
    var d = digits(phone), found = null;
    if (d.length >= 7) state.contacts.forEach(function (c) { if (!found && digits(c.phone).slice(-9) === d.slice(-9)) found = c; });
    if (!found) {
      found = L.sanitizeContact({ id: L.newId(), name: name, phone: phone, kind: 'other' });
      if (!found) return;
      state.contacts.push(found);
      save(); renderAll();
    }
    cb(found);
  };

  $('contactSel').addEventListener('change', function () {
    var sel = this;
    if (sel.value === '__phone') {
      sel.value = sel._prev || '';
      pickFromPhone(function (c) { fillContactSel(c.id); applyContactToParty(c); });
      return;
    }
    if (sel.value === '__new') {
      sel.value = sel._prev || '';
      editContact(null, function (c) { fillContactSel(c.id); applyContactToParty(c); });
      return;
    }
    sel._prev = sel.value;
    var c = byId(state.contacts, Number(sel.value));
    if (c) applyContactToParty(c);
  });
  function applyContactToParty(c) { if (c && !$('entryProject').hidden) $('party').value = c.name; }

  function kindOptions(withAll) {
    var o = withAll ? [option('all', t('all_kinds'))] : [];
    L.KINDS.forEach(function (k) { o.push(option(k, t('kind_' + k))); });
    return o;
  }

  function editContact(contact, done) {
    var isNew = !contact;
    var c = contact || { name: '', phone: '', email: '', address: '', kind: 'customer', note: '' };
    openForm({
      title: isNew ? t('add_contact') : t('edit_contact'),
      fields: [
        { key: 'name', label: t('contact_name'), type: 'text', value: c.name, required: true },
        { key: 'kind', label: t('contact_kind'), type: 'select', options: L.KINDS.map(function (k) { return { value: k, label: t('kind_' + k) }; }), value: c.kind },
        { key: 'phone', label: t('contact_phone'), type: 'text', value: c.phone, max: 30 },
        { key: 'email', label: t('contact_email'), type: 'text', value: c.email },
        { key: 'address', label: t('contact_address'), type: 'text', value: c.address, max: 80 },
        { key: 'note', label: t('contact_note'), type: 'text', value: c.note, max: 80 }
      ],
      onSubmit: function (v) {
        var nc = L.sanitizeContact({ id: contact ? contact.id : L.newId(), name: v.name, kind: v.kind, phone: v.phone, email: v.email, address: v.address, note: v.note });
        if (!nc) return t('required');
        if (isNew) state.contacts.push(nc); else Object.keys(nc).forEach(function (k) { contact[k] = nc[k]; });
        var saved = isNew ? nc : contact;
        // entries keep the contact's name in their payee text so searches and exports match
        if (!isNew) state.books.forEach(function (b) { b.entries.forEach(function (e) { if (e.contactId === saved.id) e.party = saved.name; }); });
        save(); renderAll();
        if (done) done(saved);
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_contact'))) return false;
        trashPut('contact', contact.name, contact, {});
        state.books.forEach(function (b) { b.entries.forEach(function (e) { if (e.contactId === contact.id) e.contactId = 0; }); });
        state.contacts = state.contacts.filter(function (x) { return x.id !== contact.id; });
        if (ui.contactId === contact.id) ui.contactId = 0;
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }

  function renderContacts() {
    var sel = $('ckind');
    var keep = ui.ckind;
    sel.textContent = '';
    kindOptions(true).forEach(function (o) { sel.appendChild(o); });
    sel.value = keep;
    var bal = L.contactBalances(state);
    var q = ui.cq.trim().toLowerCase();
    var list = state.contacts.filter(function (c) {
      if (ui.ckind !== 'all' && c.kind !== ui.ckind) return false;
      return !q || (c.name + ' ' + c.phone + ' ' + c.email + ' ' + c.address).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, c) { return a.name.localeCompare(c.name); });
    var ul = $('contactList');
    ul.textContent = '';
    var tin = 0, tout = 0;
    list.forEach(function (c) {
      var b = bal[c.id];
      tin += b.cashIn; tout += b.cashOut;
      var li = el('li', 'item contact');
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.appendChild(el('span', 'avatar', c.name.charAt(0).toUpperCase()));
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', c.name));
      meta.appendChild(el('div', 'detail', [t('kind_' + c.kind), c.phone, b.count ? t('entries_n', { n: b.count }) : ''].filter(Boolean).join(' · ')));
      if (b.count) meta.appendChild(el('div', 'detail', t('received_total') + ' ' + money(b.cashIn) + ' · ' + t('paid_total') + ' ' + money(b.cashOut)));
      li.appendChild(meta);
      var side = el('div', 'cside');
      if (b.count) side.appendChild(el('span', 'amt ' + (b.net >= 0 ? 'in' : 'out'), (b.net >= 0 ? '+' : '−') + money(Math.abs(b.net))));
      var acts = el('div', 'cacts');
      if (c.phone) { var a1 = el('a', null, '📞'); a1.href = 'tel:' + c.phone.replace(/[^0-9+]/g, ''); a1.addEventListener('click', function (ev) { ev.stopPropagation(); }); acts.appendChild(a1); }
      if (c.email) { var a2 = el('a', null, '✉️'); a2.href = 'mailto:' + c.email; a2.addEventListener('click', function (ev) { ev.stopPropagation(); }); acts.appendChild(a2); }
      if (b.count) {
        var a3 = el('a', null, '🔎');
        a3.href = '#';
        a3.addEventListener('click', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          ui.contactId = c.id; ui.q = ''; $('q').value = '';
          showView('entries'); renderEntries();
        });
        acts.appendChild(a3);
      }
      side.appendChild(acts);
      li.appendChild(side);
      var open = function () { editContact(c); };
      li.addEventListener('click', open);
      li.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
      ul.appendChild(li);
    });
    $('contactEmpty').hidden = list.length > 0;
    $('contactEmpty').textContent = state.contacts.length ? t('no_match') : t('no_contacts');
    $('contactTotals').textContent = list.length ? t('contacts_summary', { n: list.length, i: money(tin), o: money(tout) }) : '';
  }
  $('cq').addEventListener('input', function () { ui.cq = this.value; renderContacts(); });
  $('ckind').addEventListener('change', function () { ui.ckind = this.value; renderContacts(); });
  $('addContact').addEventListener('click', function () { editContact(null); });
  $('pickContact').hidden = !hasPhoneBook;
  $('pickContact').addEventListener('click', function () {
    pickFromPhone(function (c) { toast(c.name); editContact(c); });
  });

  /* ---------- businesses and staff ---------- */
  function renderBiz() {
    var P = $('bizPanel');
    P.textContent = '';
    P.appendChild(el('h2', null, t('businesses')));
    state.businesses.forEach(function (bz) {
      var card = el('div', 'bizcard');
      card.appendChild(el('h3', null, bz.name));
      var nb = state.books.filter(function (b) { return b.businessId === bz.id; }).length;
      card.appendChild(el('div', 'muted small', t('books') + ': ' + nb));
      if (!bz.staff.length) card.appendChild(el('p', 'muted small', t('no_staff')));
      bz.staff.forEach(function (m) {
        var r = el('button', 'staffrow');
        r.type = 'button';
        r.appendChild(el('span', 'avatar', m.name.charAt(0).toUpperCase()));
        var tx = el('span', 'stext');
        tx.appendChild(el('b', null, m.name));
        tx.appendChild(el('small', 'muted', [t('role_' + m.role), m.phone].filter(Boolean).join(' · ')));
        r.appendChild(tx);
        r.addEventListener('click', function () { editStaff(bz, m); });
        card.appendChild(r);
      });
      var row = el('div', 'btnrow');
      row.appendChild(btn(t('add_staff'), '', function () { editStaff(bz, null); }));
      row.appendChild(btn(t('rename_business'), '', function () { editBusiness(bz); }));
      card.appendChild(row);
      P.appendChild(card);
    });
    P.appendChild(btn(t('add_business'), 'block', function () { editBusiness(null); }));
    P.appendChild(el('p', 'muted small', t('staff_note')));
  }

  function editBusiness(bz) {
    openForm({
      title: bz ? t('rename_business') : t('add_business'),
      fields: [{ key: 'name', label: t('business_name'), type: 'text', value: bz ? bz.name : '', required: true, max: 40 }],
      onSubmit: function (v) {
        if (bz) bz.name = v.name.slice(0, 40);
        else {
          var nb = L.sanitizeBusiness({ id: 'biz' + L.newId(), name: v.name, staff: [] });
          state.businesses.push(nb);
          state.business = nb.id;
          var id = 'b' + L.newId();
          state.books.push({ id: id, name: nb.name, projectId: '', businessId: nb.id, entries: [] });
          state.current = id;
        }
        save(); renderAll();
        return null;
      },
      onDelete: bz ? function () {
        if (!window.confirm(t('confirm_delete_business'))) return false;
        state.books.forEach(function (b) { if (b.businessId === bz.id) b.businessId = ''; });
        state.businesses = state.businesses.filter(function (x) { return x.id !== bz.id; });
        if (state.business === bz.id) state.business = '';
        save(); renderAll();
        return true;
      } : null
    });
  }

  function editStaff(bz, m) {
    openForm({
      title: m ? t('edit_staff') : t('add_staff'),
      fields: [
        { key: 'name', label: t('staff_name'), type: 'text', value: m ? m.name : '', required: true },
        { key: 'phone', label: t('staff_phone'), type: 'text', value: m ? m.phone : '', max: 30 },
        { key: 'role', label: t('staff_role'), type: 'select', options: L.STAFF_ROLES.map(function (r) { return { value: r, label: t('role_' + r) }; }), value: m ? m.role : 'cashier' }
      ],
      onSubmit: function (v) {
        var ns = L.sanitizeBusiness({ id: bz.id, name: bz.name, staff: [{ id: m ? m.id : L.newId(), name: v.name, phone: v.phone, role: v.role }] }).staff[0];
        if (!ns) return t('required');
        if (m) Object.keys(ns).forEach(function (k) { m[k] = ns[k]; }); else bz.staff.push(ns);
        save(); renderAll();
        return null;
      },
      onDelete: m ? function () {
        bz.staff = bz.staff.filter(function (x) { return x.id !== m.id; });
        save(); renderAll();
        return true;
      } : null
    });
  }

  /* ---------- reminders: unpaid bills and invoices, wages, truck papers ---------- */
  function renderReminders() {
    var list = L.reminders(state, L.todayStr(), 7);
    var urgent = list.filter(function (r) { return r.level === 'overdue' || r.level === 'soon'; });
    var ban = $('remindBanner');
    ban.hidden = !urgent.length;
    ban.textContent = urgent.length ? t('bills_due_banner', { n: urgent.length }) : '';
    var box = $('remindBox');
    box.textContent = '';
    if (ui.projectId || !list.length) return;
    var pn = panel(t('reminders'));
    list.slice(0, 8).forEach(function (r) {
      var row = el('button', 'remrow ' + r.level);
      row.type = 'button';
      var tx = el('span', 'stext');
      tx.appendChild(el('b', null, r.kind === 'wages' ? t('fc_wages') : r.kind === 'truck' ? t('doc_' + r.desc) + ': ' + r.who : (r.kind === 'invoice' ? t('unpaid_invoice') + ': ' : '') + (r.who || '—')));
      var cnote = r.note ? t('cn_' + r.note.split(':')[0], { n: r.note.split(':')[1] }) : '';
      tx.appendChild(el('small', 'muted', [r.project, r.kind === 'bill' ? r.desc : '', cnote, r.due ? t('due_label') + ' ' + fmtDate(r.due) : ''].filter(Boolean).join(' · ')));
      row.appendChild(tx);
      if (r.amount > 0) row.appendChild(el('span', 'amt ' + (r.level === 'overdue' ? 'out' : ''), money(r.amount)));
      row.addEventListener('click', function () { ui.projectId = r.projectId; ui.section = r.kind === 'invoice' ? 'customers' : r.kind === 'wages' ? 'drivers' : r.kind === 'truck' ? 'trucks' : 'costs'; renderProjects(); window.scrollTo(0, 0); });
      pn.appendChild(row);
    });
    box.appendChild(pn);
  }
  $('remindBanner').addEventListener('click', function () { showView('projects'); renderProjects(); });

  /* ---------- report export (Excel / PDF) for a date range ---------- */
  function exportRange() {
    var from = L.isDate($('rFrom').value) ? $('rFrom').value : '', to = L.isDate($('rTo').value) ? $('rTo').value : '';
    ui.rFrom = from; ui.rTo = to; ui.rScope = $('rScope').value;
    var ids = ui.rScope === 'all' ? null : [book().id];
    return { from: from, to: to, ids: ids };
  }
  function initExportPanel() {
    var sel = $('rScope');
    sel.textContent = '';
    sel.appendChild(option('book', t('this_book') + ': ' + book().name));
    sel.appendChild(option('all', t('all_books_opt')));
    sel.value = ui.rScope;
    if (!ui.rFrom && !ui.rTo) {
      var today = L.todayStr(), pp = cal().parts(today);
      ui.rFrom = pp ? cal().fromParts(pp.y, pp.m, 1) : today;
      ui.rTo = today;
    }
    $('rFrom').value = ui.rFrom; $('rTo').value = ui.rTo;
  }
  $('rXlsx').addEventListener('click', function () {
    var r = exportRange();
    saveWorkbook('Cash-report', window.CBExcel.reportWorkbook({ state: state, from: r.from, to: r.to, bookIds: r.ids, title: t('report_title') }));
  });
  $('rPdf').addEventListener('click', function () {
    var r = exportRange();
    var list = L.rangeEntries(state, r.from, r.to, r.ids);
    var cn = {};
    state.contacts.forEach(function (c) { cn[c.id] = c.name; });
    function group(title, fn) {
      var m = {};
      list.forEach(function (e) {
        var k = fn(e) || '-';
        m[k] = m[k] || { i: 0, o: 0 };
        if (e.type === 'in') m[k].i += e.amount; else m[k].o += e.amount;
      });
      return { title: title, rows: Object.keys(m).sort().map(function (k) { return [k, L.round2(m[k].i), L.round2(m[k].o), L.round2(m[k].i - m[k].o)]; }) };
    }
    printDoc(t('report_title'), window.CBPrint.reportHtml({
      t: t, money: money, lang: state.settings.lang, title: t('report_title'), date: L.todayStr(),
      periodLabel: t('period') + ': ' + (r.from ? fmtDate(r.from) : '…') + ' – ' + (r.to ? fmtDate(r.to) : '…'),
      scopeLabel: r.ids ? book().name : t('all_books_opt'),
      totals: L.totals(list),
      groups: [group(t('by_category'), function (e) { return e.category; }), group(t('by_mode'), function (e) { return e.mode ? t('mode_' + e.mode) : ''; }),
        group(t('by_member'), function (e) { return e.by; }), group(t('by_contact'), function (e) { return e.contactId ? cn[e.contactId] : e.party; })],
      entries: list, fmt: function (d) { return fmtDate(d); }
    }));
  });

  /* ---------- reports nav ---------- */
  $('prevMonth').addEventListener('click', function () { ui.month = cal().shiftMonth(ui.month, -1); renderReports(); });
  $('nextMonth').addEventListener('click', function () { ui.month = cal().shiftMonth(ui.month, 1); renderReports(); });

  /* ---------- tabs ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-view');
      buzz();
      if (v === 'entries' && ui.view === 'entries') ui.bookOpen = false;   // tapping Entries again goes back to the list of books
      showView(v);
      if (v === 'reports') renderReports();
      if (v === 'projects') renderProjects();
      if (v === 'contacts') renderContacts();
    });
  });

  /* ---------- books ---------- */
  $('bookSelect').addEventListener('change', function () {
    state.current = this.value;
    save();
    renderAll();
  });
  function fillBookProject() {
    var sel = $('bookProject');
    sel.textContent = '';
    sel.appendChild(option('', t('no_project')));
    state.projects.forEach(function (p) { sel.appendChild(option(p.id, p.name)); });
    sel.value = book().projectId || '';
    $('bookProject').parentNode.hidden = !state.projects.length;
  }
  $('bookBtn').addEventListener('click', function () {
    $('bookName').value = '';
    $('deleteBook').hidden = state.books.length < 2;
    fillBookProject();
    fillBookBiz();
    openModal('bookModal');
  });
  function fillBookBiz() {
    var sel = $('bookBiz');
    sel.textContent = '';
    sel.appendChild(option('', t('no_business')));
    state.businesses.forEach(function (x) { sel.appendChild(option(x.id, x.name)); });
    sel.value = book().businessId || state.business || '';
    $('bookBizField').hidden = !state.businesses.length;
  }
  $('bookBiz').addEventListener('change', function () {
    book().businessId = this.value;
    save();
    renderAll();
  });
  $('bizSelect').addEventListener('change', function () {
    state.business = this.value;
    save();
    renderAll();
  });
  $('bookProject').addEventListener('change', function () {
    book().projectId = this.value;
    save();
    renderAll();
  });
  $('closeBook').addEventListener('click', function () { closeModal('bookModal'); });

  /* About */
  var APP_VERSION = '1.2.1', APP_BUILD = 4;
  $('aboutBtn').addEventListener('click', function () { $('aboutVersion').textContent = APP_VERSION + ' (build ' + APP_BUILD + ')'; openModal('aboutModal'); });
  $('aboutBackup').addEventListener('click', function () { closeModal('aboutModal'); var b = $('backupBtn'); b.scrollIntoView({ block: 'center' }); b.click(); });
  $('closeAbout').addEventListener('click', function () { closeModal('aboutModal'); });
  $('aboutModal').addEventListener('click', function (e) { if (e.target === this) closeModal('aboutModal'); });
  $('bookModal').addEventListener('click', function (ev) { if (ev.target === this) closeModal('bookModal'); });

  $('newBook').addEventListener('click', function () {
    var name = $('bookName').value.trim().slice(0, 40);
    if (!name) { $('bookName').focus(); return; }
    var id = 'b' + L.newId();
    state.books.push({ id: id, name: name, projectId: $('bookProject').value || '', businessId: $('bookBiz').value || state.business || '', updated: L.todayStr(), entries: [] });
    state.current = id;
    ui.bookOpen = true;
    save();
    closeModal('bookModal');
    renderAll();
  });
  $('renameBook').addEventListener('click', function () {
    var name = $('bookName').value.trim().slice(0, 40);
    if (!name) { $('bookName').focus(); return; }
    book().name = name;
    save();
    closeModal('bookModal');
    renderAll();
  });
  $('deleteBook').addEventListener('click', function () {
    if (state.books.length < 2) { toast(t('last_book')); return; }
    function proceed() {
      var cur = book().id;
      dropPaymentsOfBook(cur);
      trashPut('book', book().name, book(), {}, entryPhotoIds(book().entries));
      state.books = state.books.filter(function (b) { return b.id !== cur; });
      state.current = state.books[0].id;
      ui.bookOpen = false;
      save();
      closeModal('bookModal');
      renderAll();
      undoToast();
    }
    if (book().sync && window.__cloudRelease) {          // also removes / leaves the online copy first
      window.__cloudRelease(book()).then(function (ok) { if (ok) proceed(); });
      return;
    }
    if (!window.confirm(t('confirm_delete_book'))) return;
    proceed();
  });

  /* ---------- settings ---------- */
  $('langSel').addEventListener('change', function () { state.settings.lang = this.value; save(); renderAll(); });
  $('curSel').addEventListener('change', function () { state.settings.currency = this.value; save(); renderAll(); });
  $('themeSel').addEventListener('change', function () { state.settings.theme = this.value; save(); applyTheme(); });
  $('calSel').addEventListener('change', function () {
    state.settings.calendar = L.CALENDARS.indexOf(this.value) >= 0 ? this.value : 'gregorian';
    ui.month = cal().monthKey(L.todayStr());
    save();
    renderAll();
  });

  $('clearBtn').addEventListener('click', function () {
    if (!canEdit(book())) { toast(t('view_only_note')); return; }
    if (!window.confirm(t('confirm_clear'))) return;
    dropPaymentsOfBook(book().id);
    if (book().entries.length) trashPut('book', book().name + ' (' + t('cleared') + ')', book(), {}, entryPhotoIds(book().entries));
    book().entries = [];
    save();
    renderAll();
    undoToast();
  });

  /* ---------- PIN ---------- */
  function showLock() {
    if (!state.settings.pinHash) return;
    $('pinInput').value = '';
    $('lockMsg').textContent = '';
    $('lock').classList.add('open');
    setTimeout(function () { $('pinInput').focus(); }, 50);
  }

  $('lockForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var pin = $('pinInput').value;
    if (L.hashPin(pin, state.settings.pinSalt) === state.settings.pinHash) {
      $('lock').classList.remove('open');
      $('pinInput').value = '';
    } else {
      $('lockMsg').textContent = t('wrong_pin');
      $('pinInput').value = '';
    }
  });

  document.addEventListener('visibilitychange', function () { if (document.hidden) showLock(); });

  $('setPinBtn').addEventListener('click', function () {
    $('pin1').value = ''; $('pin2').value = ''; $('pinErr').textContent = '';
    openModal('pinModal');
    setTimeout(function () { $('pin1').focus(); }, 50);
  });
  $('cancelPin').addEventListener('click', function () { closeModal('pinModal'); });
  $('pinForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var a = $('pin1').value, b = $('pin2').value;
    if (!L.validPin(a)) { $('pinErr').textContent = t('pin_invalid'); return; }
    if (a !== b) { $('pinErr').textContent = t('pin_mismatch'); return; }
    var salt = L.newSalt();
    state.settings.pinSalt = salt;
    state.settings.pinHash = L.hashPin(a, salt);
    save();
    closeModal('pinModal');
    renderSettings();
  });
  $('removePinBtn').addEventListener('click', function () {
    if (!window.confirm(t('cf_remove_pin'))) return;
    state.settings.pinHash = '';
    state.settings.pinSalt = '';
    save();
    renderSettings();
  });

  /* ---------- files: export, backup, restore ---------- */
  function saveFile(name, mime, content) {
    if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') {
      var where = window.AndroidBridge.saveFile(name, mime, content);
      toast(where ? t('saved') + ' ' + where : t('save_failed'));
      return !!where;
    }
    var blob = new Blob([content], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }

  /* binary files (.xlsx): Android gets base64, the browser a normal download */
  function saveBinary(name, mime, bytes) {
    if (window.AndroidBridge && typeof window.AndroidBridge.saveFileB64 === 'function') {
      var bin = '';
      for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      var where = window.AndroidBridge.saveFileB64(name, mime, btoa(bin));
      toast(where ? t('saved') + ' ' + where : t('save_failed'));
      return;
    }
    var blob = new Blob([bytes], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast(t('xlsx_saved'));
  }
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  function saveWorkbook(base, wb) {
    if (!wb) return;
    saveBinary(base + '-' + L.todayStr() + '.xlsx', XLSX_MIME, window.CBExcel.toBytes(wb));
  }

  $('exportBtn').addEventListener('click', function () {
    saveFile('truckbook-' + safeName(book().name) + '-' + L.todayStr() + '.csv', 'text/csv', L.buildCsv(book().entries));
  });

  /* ---------- backup: one file with all data and photos ---------- */
  var BACKUP_KEY = 'truckbook.backup.v1';   // when the last backup file was saved; never part of a backup
  var PREREST_KEY = 'truckbook.prerestore.v1'; // the data that was on the phone before the last restore
  function backupInfo() { try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function setBackupInfo(o) { try { localStorage.setItem(BACKUP_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
  function dataCount() {
    var n = 0;
    state.books.forEach(function (b) { n += b.entries.length; });
    return { entries: n, projects: state.projects.length, contacts: state.contacts.length };
  }
  function hasData() { var c = dataCount(); return c.entries + c.projects + c.contacts > 0; }

  function buildBackup() {
    var copy = JSON.parse(JSON.stringify(state));
    copy.settings.pinHash = '';
    copy.settings.pinSalt = '';
    copy.backupVersion = 2;
    copy.savedAt = new Date().toISOString();
    copy.photos = {};
    var ids = allPhotoIds();
    return Promise.all(ids.map(function (id) {
      return photoData(id).then(function (d) { return [id, d]; }, function () { return [id, null]; });
    })).then(function (pairs) {
      var n = 0;
      pairs.forEach(function (x) { if (x[1]) { copy.photos[x[0]] = x[1]; n++; } });
      return { text: JSON.stringify(copy), photos: n };
    });
  }
  function doBackup() {
    return buildBackup().then(function (r) {
      var ok = saveFile('truckbook-backup-' + L.todayStr() + '.json', 'application/json', r.text);
      if (ok) {
        var c = dataCount();
        setBackupInfo({ last: Date.now(), entries: c.entries, projects: c.projects, photos: r.photos, snooze: 0 });
        renderBackupState();
      }
      return ok;
    });
  }
  $('backupBtn').addEventListener('click', function () { doBackup(); });

  function renderBackupState() {
    var info = backupInfo(), box = $('backupState');
    if (box) {
      if (info.last) {
        box.textContent = t('last_backup', { d: fmtDate(new Date(info.last).toISOString().slice(0, 10)), e: info.entries || 0, p: info.projects || 0 });
        box.className = 'muted small';
      } else {
        box.textContent = t('no_backup_yet');
        box.className = 'small bkwarn';
      }
    }
    var ban = $('backupBanner');
    if (ban) {
      var age = info.last ? (Date.now() - info.last) / 86400000 : 99;
      var show = hasData() && age >= 7 && !(info.snooze && Date.now() < info.snooze);
      ban.hidden = !show;
      if (show) {
        ban.textContent = '';
        ban.appendChild(el('span', 'bktext', info.last ? t('backup_overdue', { n: Math.floor(age) }) : t('backup_never')));
        var row = el('span', 'bkbtns');
        row.appendChild(btn(t('backup_now'), 'primary', function () { doBackup(); }));
        row.appendChild(btn(t('bk_later'), '', function () { var i = backupInfo(); i.snooze = Date.now() + 86400000; setBackupInfo(i); renderBackupState(); }));
        ban.appendChild(row);
      }
    }
    var pr = $('prerestoreBtn');
    if (pr) { var has = false; try { has = !!localStorage.getItem(PREREST_KEY); } catch (e) { /* ignore */ } pr.hidden = !has; }
    var tb = $('trashBtn');
    if (tb) tb.textContent = t('recently_deleted') + ' (' + (state.trash || []).length + ')';
  }

  /* put photos from a backup on the phone */
  function putPhotos(parsed) {
    var ids = Object.keys(parsed.photos || {}).filter(function (id) {
      var d = parsed.photos[id];
      return /^\d{1,16}$/.test(id) && typeof d === 'string' && d.indexOf('data:image/') === 0 && d.length < 4000000;
    });
    var n = 0;
    return ids.reduce(function (chain, id) {
      return chain.then(function () {
        return window.CBPhotos.put(id, parsed.photos[id]).then(function () { photoCache[Number(id)] = parsed.photos[id]; n++; }).catch(function () { /* skip */ });
      });
    }, Promise.resolve()).then(function () { return n; });
  }
  function restorePhotos(parsed) {
    putPhotos(parsed).then(function (n) {
      renderAll();
      toast(n ? t('photos_restored', { n: n }) : t('restore_fail'));
    });
  }

  /* Recently deleted */
  function openTrash() {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    function draw() {
      m.textContent = '';
      m.appendChild(el('h2', null, t('recently_deleted')));
      m.appendChild(el('p', 'muted small', t('trash_note')));
      if (!state.trash.length) m.appendChild(el('p', 'muted', t('trash_empty')));
      state.trash.forEach(function (rec) {
        var left = Math.max(0, L.TRASH_DAYS - Math.floor((Date.now() - rec.deletedAt) / 86400000));
        var row = el('div', 'trashrow');
        var tx = el('span', 'stext');
        tx.appendChild(el('b', null, rec.label || '—'));
        tx.appendChild(el('small', 'muted', t('trash_kind_' + rec.kind) + ' · ' + t('trash_days_left', { n: left })));
        row.appendChild(tx);
        row.appendChild(btn(t('restore_item'), 'primary', function () {
          if (trashRestore(rec)) { save(); renderAll(); toast(t('restored_item')); draw(); }
        }));
        row.appendChild(btn('✕', 'danger', function () {
          if (!window.confirm(t('trash_forever', { name: rec.label || '—' }))) return;
          trashDrop(rec); save(); renderBackupState(); draw();
        }));
        m.appendChild(row);
      });
      m.appendChild(btn(t('close'), 'block', close));
    }
    draw();
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }
  $('trashBtn').addEventListener('click', openTrash);

  /* undo a restore: the previous data was kept on the phone */
  $('prerestoreBtn').addEventListener('click', function () {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(PREREST_KEY) || 'null'); } catch (e) { /* ignore */ }
    if (!raw || !Array.isArray(raw.books)) { toast(t('restore_fail')); return; }
    if (!window.confirm(t('prerestore_confirm'))) return;
    var next = L.sanitizeState(raw, { keepPin: false });
    next.settings.pinHash = state.settings.pinHash;
    next.settings.pinSalt = state.settings.pinSalt;
    state = next;
    ui.projectId = '';
    try { localStorage.removeItem(PREREST_KEY); } catch (e) { /* ignore */ }
    save(); renderAll();
    toast(t('restored'));
  });

  $('restoreBtn').addEventListener('click', function () { $('restoreFile').click(); });

  $('restoreFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    var input = this;
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { toast(t('restore_fail')); input.value = ''; };
    reader.onload = function () {
      input.value = '';
      var text = String(reader.result || '');
      try {
        if (/^\s*\{/.test(text.replace(/^﻿/, ''))) {
          var parsed = JSON.parse(text);
          if (parsed && parsed.truckbookPhotos) { restorePhotos(parsed); return; }
          if (!parsed || !Array.isArray(parsed.books)) throw new Error('not a backup');
          if (!window.confirm(t('restore_confirm'))) return;
          try { localStorage.setItem(PREREST_KEY, JSON.stringify(state)); } catch (e2) { /* too big: restore still works */ }
          var next = L.sanitizeState(parsed, { keepPin: false });
          next.settings.pinHash = state.settings.pinHash;
          next.settings.pinSalt = state.settings.pinSalt;
          state = next;
          ui.projectId = '';
          ui.month = cal().monthKey(L.todayStr());
          save();
          renderAll();
          toast(t('restored'));
          if (parsed.photos && typeof parsed.photos === 'object') putPhotos(parsed).then(function () { renderAll(); });
        } else {
          var res = L.entriesFromCsv(text);
          if (!res.entries.length) throw new Error('no rows');
          if (!window.confirm(t('import_confirm', { n: res.entries.length }))) return;
          if (!canEdit(book())) { toast(t('view_only_note')); return; }
          var entries = book().entries;
          res.entries.forEach(function (e) { e.id = L.newId(); entries.push(e); });
          save();
          renderAll();
          toast(t('restored') + (res.skipped ? ' (' + res.skipped + ' ' + t('skipped') + ')' : ''));
        }
      } catch (e) {
        toast(t('restore_fail'));
      }
    };
    reader.readAsText(file);
  });

  /* ---------- online sync (all books) and backup ---------- */
  (function () {
    var CS = window.CBSync;
    var CLOUD_KEY = 'truckbook.cloud.v1';   // sign-in and connection settings; never part of backups
    var cloud = CS.createCloud({
      fetch: function () { return window.fetch.apply(window, arguments); },
      store: {
        get: function () { try { return JSON.parse(localStorage.getItem(CLOUD_KEY) || '{}') || {}; } catch (e) { return {}; } },
        set: function (o) { try { localStorage.setItem(CLOUD_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
      },
      now: function () { return Date.now(); },
      defaults: window.CB_CLOUD_DEFAULTS || {}
    });
    var info = {};            // online book id -> { meta, members } from the last sync
    var invite = '';          // last invite text shown
    var busy = false, again = false, timer = 0, advanced = false;
    var inviteRole = 'view', status = '', authMode = 'signin', profileOpen = false;
    var draft = { name: '', phone: '', company: '', role: '' };

    function errText(e) {
      var c = (e && e.code) || 'x';
      var m = { network: 'err_network', permission: 'err_permission', EMAIL_EXISTS: 'err_exists', INVALID_LOGIN_CREDENTIALS: 'err_login',
        INVALID_PASSWORD: 'err_login', EMAIL_NOT_FOUND: 'err_login', WEAK_PASSWORD: 'err_weak', INVALID_EMAIL: 'err_email',
        OPERATION_NOT_ALLOWED: 'err_provider', TOO_MANY_ATTEMPTS_TRY_LATER: 'err_many', API_KEY_INVALID: 'err_key',
        'not-configured': 'need_config', 'not-signed-in': 'need_signin' }[c];
      return m ? t(m) : t('err_generic', { c: c });
    }
    function fail(e) { toast(errText(e)); status = errText(e); renderCloud(); }
    function ready() { return cloud.signedIn(); }
    function linkedBooks() { return state.books.filter(function (b) { return !!b.sync; }); }
    function stamp(ms) { return ms ? new Date(ms).toLocaleString() : t('never'); }
    function roleName(r) { return t(r === 'owner' ? 'role_owner' : r === 'edit' ? 'role_edit' : 'view' === r ? 'role_view' : 'role_view'); }
    function roleOf(data) {
      var me = cloud.cfg().uid;
      if (!data || !data.meta) return null;
      return data.meta.owner === me ? 'owner' : (data.members && data.members[me] && data.members[me].role) || null;
    }
    function others(id) { var i = info[id]; return i ? Object.keys(i.members || {}).length : 0; }

    /* icon in front of the book name: cloud = only mine, people = shared, eye = view only, phone = not synced */
    window.__myName = function () { var c = cloud.cfg(); return (c && c.profile && c.profile.name) || ''; };

    window.__bookIcon = function (b) {
      if (!b.sync) return b.nolink ? '📱 ' : '';
      if (b.sync.role === 'view') return '👁 ';
      if (b.sync.role === 'edit') return '👥 ';
      return others(b.sync.id) ? '👥 ' : '☁️ ';
    };

    /* ----- linking books to the online copy ----- */
    function linkBook(b) {
      var id = CS.newBookId();
      return cloud.createBook(id, b.name).then(function () {
        delete b.nolink;
        b.sync = { id: id, role: 'owner', S: {}, U: {}, last: 0, ix: false };
        saveRaw();
      });
    }
    function ensureLinked() {
      var chain = Promise.resolve(false);
      state.books.slice().forEach(function (b) {
        if (b.sync || b.nolink || !b.entries.length) return;       // empty books are linked when they get their first entry
        chain = chain.then(function (ch) { return linkBook(b).then(function () { return true; }); });
      });
      return chain;
    }
    /* books of mine (and ones shared with me) that this phone does not have yet */
    function pullIndex() {
      return cloud.indexGet().then(function (idx) {
        idx = idx || {};
        var have = {}, added = false;
        state.books.forEach(function (b) { if (b.sync) have[b.sync.id] = 1; });
        var chain = Promise.resolve();
        Object.keys(idx).filter(function (id) { return !have[id]; }).forEach(function (id) {
          chain = chain.then(function () {
            return cloud.getBook(id).catch(function (e) { if (e && e.code === 'permission') return null; throw e; }).then(function (data) {
              var role = roleOf(data);
              if (!role) return cloud.indexDelete(id);
              info[id] = { meta: data.meta, members: data.members || {} };
              var nb = { id: 'b' + L.newId(), name: String(data.meta.name || 'Book').slice(0, 40), projectId: '', entries: [],
                         sync: { id: id, role: role, S: {}, U: {}, last: 0, ix: true } };
              state.books.push(nb); added = true;
            });
          });
        });
        return chain.then(function () {
          if (added && state.books.length > 1) {
            // a brand-new phone starts with one empty "Main" book: drop it once real books arrived
            var empties = state.books.filter(function (b) { return !b.sync && !b.nolink && !b.entries.length && !b.projectId; });
            if (empties.length === 1 && state.books.filter(function (b) { return !b.sync; }).length === 1) {
              state.books = state.books.filter(function (b) { return b !== empties[0]; });
              if (!state.books.some(function (b) { return b.id === state.current; })) state.current = state.books[0].id;
            }
          }
          if (added) saveRaw();
          return added;
        });
      });
    }

    /* ----- sync ----- */
    function syncBook(b) {
      var sy = b.sync, startRev = rev;
      return cloud.getBook(sy.id).catch(function (e) {
        if (e && e.code === 'permission') return null;      // removed from the book, or it was deleted online
        throw e;
      }).then(function (data) {
        var role = roleOf(data);
        if (!role) return { gone: true };
        info[sy.id] = { meta: data.meta, members: data.members || {} };
        var r = CS.merge({ local: b.entries, S: sy.S, U: sy.U, remote: data.entries || null, role: role, now: Date.now(), sanitize: L.sanitizeEntry });
        var chain = cloud.pushEntries(sy.id, r.push);
        var nameOnline = data.meta.name, renamed = false, adopt = '';
        if (role === 'owner') {
          if (b.name !== sy.nm && nameOnline !== b.name) { chain = chain.then(function () { return cloud.setBookName(sy.id, b.name); }); renamed = true; }   // renamed on this phone
          else if (b.name === sy.nm && nameOnline && nameOnline !== b.name) adopt = nameOnline;                                                        // renamed on my other phone
        } else if (nameOnline && nameOnline !== b.name) adopt = nameOnline;
        if (!sy.ix || renamed) chain = chain.then(function () { return cloud.indexPut(sy.id, renamed ? b.name : (adopt || b.name), role); });
        return chain.then(function () {
          if (rev !== startRev) { again = true; return { changed: false }; }   // edited meanwhile: merge again next round
          var changed = r.changed || sy.role !== role;
          b.entries = r.entries; sy.S = r.S; sy.U = r.U; sy.role = role; sy.last = Date.now(); sy.ix = true;
          if (adopt) { b.name = adopt; changed = true; }
          sy.nm = b.name;
          return { changed: changed };
        });
      });
    }
    /* ----- shared projects ----- */
    var pinfo = {};           // online project id -> { meta, members }
    var pRoleOpen = 'view', pInvite = '';
    function linkedProjects() { return state.projects.filter(function (p) { return !!p.sync; }); }
    function projectRoleOf(data) {
      var me = cloud.cfg().uid;
      if (!data || !data.meta) return null;
      return data.meta.owner === me ? 'owner' : (data.members && data.members[me] && data.members[me].role) || null;
    }
    function linkProject(p) {
      var id = CS.newProjectId();
      return cloud.createProject(id, p.name).then(function () {
        p.sync = { id: id, role: 'owner', S: {}, U: {}, last: 0, ix: false, fresh: false, st: 0 };
        saveRaw();
      });
    }
    function pullProjectIndex() {
      return cloud.pIndexGet().then(function (idx) {
        idx = idx || {};
        var have = {}, added = false;
        state.projects.forEach(function (p) { if (p.sync) have[p.sync.id] = 1; });
        var chain = Promise.resolve();
        Object.keys(idx).filter(function (id) { return !have[id]; }).forEach(function (id) {
          chain = chain.then(function () {
            return cloud.getProject(id).catch(function (e) { if (e && e.code === 'permission') return null; throw e; }).then(function (data) {
              var role = projectRoleOf(data);
              if (!role) return cloud.pIndexDelete(id);
              pinfo[id] = { meta: data.meta, members: data.members || {} };
              var np = L.sanitizeProject({ id: 'p' + L.newId(), name: String(data.meta.name || 'Fleet').slice(0, 60) }, 1);
              np.sync = { id: id, role: role, S: {}, U: {}, last: 0, ix: true, fresh: true, st: 0 };
              state.projects.push(np); added = true;
            });
          });
        });
        return chain.then(function () { if (added) saveRaw(); return added; });
      });
    }
    function syncProject(p) {
      var sy = p.sync, startRev = rev;
      var recs = sy.fresh ? {} : L.projectRecords(p);
      var dirty = Object.keys(recs).some(function (k) { return sy.S[k] !== CS.rsig(recs[k]); }) ||
        Object.keys(sy.S).some(function (k) { return sy.S[k] !== '-' && !(k in recs); });
      if (sy.fresh) dirty = true;
      return cloud.getProjectStamp(sy.id).catch(function (e) {
        if (e && e.code === 'permission') return null;
        throw e;
      }).then(function (stamp) {
        if (stamp === null) {
          // either no stamp yet (nothing pushed) or no access: ask for the whole project to find out
          if (!sy.ix && !dirty) return { changed: false };
        }
        if (stamp != null && !dirty && sy.ix && stamp === sy.st) return { changed: false };
        return cloud.getProject(sy.id).catch(function (e) { if (e && e.code === 'permission') return null; throw e; }).then(function (data) {
          var role = projectRoleOf(data);
          if (!role) return { gone: true };
          pinfo[sy.id] = { meta: data.meta, members: data.members || {} };
          var r = CS.mergeRecs({ local: recs, S: sy.S, U: sy.U, remote: data.rec || null, canWrite: role !== 'view', now: Date.now() });
          var chain = cloud.pushRecs(sy.id, r.push), pushed = Object.keys(r.push).length > 0;
          if (!sy.ix) chain = chain.then(function () { return cloud.pIndexPut(sy.id, p.name, role); });
          return chain.then(function () {
            if (rev !== startRev) { again = true; return { changed: false }; }
            if (r.changed || sy.fresh) L.applyProjectRecords(p, r.merged);
            var after = L.projectRecords(p), S = {};
            Object.keys(after).forEach(function (k) { S[k] = CS.rsig(after[k]); });
            Object.keys(r.U).forEach(function (k) { if (!(k in after)) S[k] = '-'; });
            var sy2 = p.sync;
            sy2.S = S; sy2.U = r.U; sy2.role = role; sy2.last = Date.now(); sy2.ix = true; sy2.fresh = false;
            sy2.st = pushed ? 0 : (Number(data.stamp) || 0);
            if (r.conflicts) toast(t('proj_conflicts', { n: r.conflicts }));
            return { changed: r.changed || role !== sy.role };
          });
        });
      });
    }
    function syncAll(manual) {
      if (!ready()) { if (manual) toast(t('need_signin')); return Promise.resolve(); }
      if (busy) { again = true; return Promise.resolve(); }
      busy = true; again = false; dot('busy');
      var changed = false, projFail = '';
      return pullIndex().then(function (added) {
        if (added) changed = true;
        return ensureLinked();
      }).then(function (linked) {
        if (linked) changed = true;
        var chain = Promise.resolve();
        linkedBooks().forEach(function (b) {
          chain = chain.then(function () { return syncBook(b); }).then(function (r) {
            if (r.gone) {
              toast(t('sync_gone', { n: b.name }));
              var gid = b.sync.id; delete b.sync; b.nolink = true; changed = true;
              cloud.indexDelete(gid).catch(function () { /* ignore */ });
            } else if (r.changed) changed = true;
          });
        });
        return chain;
      }).then(function () {
        return pullProjectIndex().then(function (added) { if (added) changed = true; });
      }).then(function () {
        var chain = Promise.resolve();
        linkedProjects().forEach(function (p) {
          chain = chain.then(function () { return syncProject(p); }).then(function (r) {
            if (r.gone) {
              toast(t('sync_gone', { n: p.name }));
              var gid = p.sync.id; delete p.sync; changed = true;
              cloud.pIndexDelete(gid).catch(function () { /* ignore */ });
            } else if (r.changed) changed = true;
          }, function (e) { if (e && e.code === 'network') throw e; projFail = errText(e); });
        });
        return chain;
      }).then(function () {
        busy = false; status = projFail || t('synced'); dot(projFail ? 'err' : 'ok');
        saveRaw();
        if (changed) renderAll(); else renderCloud();
        if (manual) toast(t('synced'));
        if (again) { again = false; schedule(300); }
      }, function (e) { busy = false; if (manual) fail(e); else { status = errText(e); renderCloud(); } dot('err'); });
    }
    function schedule(ms) {
      if (!ready()) return;
      clearTimeout(timer);
      timer = setTimeout(function () { syncAll(false); }, ms == null ? 2500 : ms);
    }
    window.__scheduleSync = function () { schedule(); };
    window.__syncNow = function () { return syncAll(true); };

    /* deleting a synced book also removes (owner) or leaves (member) the online copy, otherwise it would come back */
    window.__cloudRelease = function (b) {
      var owner = b.sync.role === 'owner';
      if (!window.confirm(t(owner ? 'confirm_delete_book_online' : 'confirm_leave_delete'))) return Promise.resolve(false);
      if (!ready()) { toast(t('need_signin')); return Promise.resolve(false); }
      var id = b.sync.id, me = cloud.cfg().uid;
      return (owner ? cloud.deleteBook(id) : cloud.removeMember(id, me)).then(function () {
        return cloud.indexDelete(id);
      }).then(function () { return true; }, function (e) { fail(e); return false; });
    };

    /* ----- backup of everything (also projects) ----- */
    function backupText() {
      var copy = JSON.parse(JSON.stringify(state));
      delete copy.settings.pinHash; delete copy.settings.pinSalt;
      copy.books.forEach(function (b) { delete b.sync; delete b.nolink; });
      copy.projects.forEach(function (p) { delete p.sync; });
      return JSON.stringify(copy);
    }
    function backupNow(quiet) {
      return cloud.backupPut(backupText()).then(function () {
        cloud.patchCfg({ lastBackup: Date.now() });
        if (!quiet) toast(t('cloud_backup_done'));
        renderCloud();
      }, function (e) { if (!quiet) fail(e); });
    }
    function restoreNow() {
      cloud.backupGet().then(function (b) {
        if (!b || typeof b.data !== 'string') { toast(t('cloud_no_backup')); return; }
        if (!window.confirm(t('cloud_restore_confirm'))) return;
        var parsed = JSON.parse(b.data);
        var next = L.sanitizeState(parsed, { keepPin: false });
        next.settings.pinHash = state.settings.pinHash;
        next.settings.pinSalt = state.settings.pinSalt;
        next.books.forEach(function (nb) { nb.nolink = true; });      // restored copies stay on this phone until you sync them again
        state = next; ui.projectId = ''; ui.month = cal().monthKey(L.todayStr());
        save(); renderAll(); toast(t('restored'));
      }).catch(fail);
    }

    /* ----- sharing ----- */
    function makeInvite() {
      var b = book();
      cloud.createInvite(b.sync.id, inviteRole).then(function (code) { invite = b.sync.id + '.' + code; renderCloud(); }).catch(fail);
    }
    function joinBook(text) {
      var p = CS.parseShare(text);
      if (!p) { toast(t('bad_code')); return; }
      if (!ready()) { toast(t('need_signin')); return; }
      if (p.bookId.indexOf('sp') === 0) { joinProjectCode(p); return; }
      if (state.books.some(function (b) { return b.sync && b.sync.id === p.bookId; })) { toast(t('already_joined')); return; }
      cloud.join(p.bookId, p.code, p.role).then(function () { return cloud.getBook(p.bookId); }).then(function (data) {
        if (!data || !data.meta) throw { code: 'permission' };
        var nb = { id: 'b' + L.newId(), name: String(data.meta.name || 'Shared').slice(0, 40), projectId: '', entries: [],
                   sync: { id: p.bookId, role: p.role, S: {}, U: {}, last: 0, ix: false } };
        state.books.push(nb); state.current = nb.id;
        save(); toast(t('joined', { n: nb.name }));
        return syncAll(false);
      }).then(function () { renderAll(); }).catch(function (e) { fail(e && e.code ? e : { code: 'permission' }); });
    }
    function joinProjectCode(p) {
      if (state.projects.some(function (x) { return x.sync && x.sync.id === p.bookId; })) { toast(t('already_joined')); return; }
      cloud.joinProject(p.bookId, p.code, p.role).then(function () { return cloud.getProject(p.bookId); }).then(function (data) {
        if (!data || !data.meta) throw { code: 'permission' };
        var np = L.sanitizeProject({ id: 'p' + L.newId(), name: String(data.meta.name || 'Fleet').slice(0, 60) }, 1);
        np.sync = { id: p.bookId, role: p.role, S: {}, U: {}, last: 0, ix: false, fresh: true, st: 0 };
        state.projects.push(np);
        save(); toast(t('joined', { n: np.name }));
        return syncAll(false);
      }).then(function () { renderAll(); }).catch(function (e) { fail(e && e.code ? e : { code: 'permission' }); });
    }
    /* deleting a shared project: the owner removes the online copy, a member just leaves */
    window.__projectRelease = function (p) {
      var owner = p.sync.role === 'owner';
      if (!window.confirm(t(owner ? 'confirm_delete_proj_online' : 'confirm_leave_proj_delete'))) return Promise.resolve(false);
      if (!ready()) { toast(t('need_signin')); return Promise.resolve(false); }
      var id = p.sync.id, me = cloud.cfg().uid;
      return (owner ? cloud.deleteProject(id) : cloud.removePMember(id, me, false)).then(function () { return cloud.pIndexDelete(id); }).then(function () { return true; }, function (e) { fail(e); return false; });
    };
    function leaveProject(p) {
      if (!window.confirm(t('confirm_leave_proj'))) return;
      var id = p.sync.id, me = cloud.cfg().uid;
      cloud.removePMember(id, me, false).then(function () { return cloud.pIndexDelete(id); }).then(function () {
        delete p.sync; save(); renderAll();
      }, fail);
    }
    window.__projIcon = function (p) {
      if (!p.sync) return '';
      if (p.sync.role === 'view') return '👁 ';
      if (p.sync.role === 'edit') return '👥 ';
      var i = pinfo[p.sync.id];
      return i && Object.keys(i.members || {}).length ? '👥 ' : '☁️ ';
    };
    /* the "share this project" panel shown on the project overview */
    window.__projectSharePanel = function (p) {
      var P = panel(t('proj_share_title'));
      P.setAttribute('data-ro', '1');
      if (!ready()) { P.appendChild(el('p', 'muted small', t('proj_share_signin'))); return P; }
      if (!p.sync) {
        P.appendChild(el('p', 'muted small', t('proj_share_intro')));
        P.appendChild(btn(t('proj_share_btn'), 'block', function () {
          linkProject(p).then(function () { return syncAll(true); }).then(function () { renderAll(); }, fail);
        }));
        return P;
      }
      var sy = p.sync, inf = pinfo[sy.id];
      P.appendChild(el('p', 'muted small', t('sharing_on', { r: roleName(sy.role) }) + ' · ' + t('last_sync', { t: stamp(sy.last) })));
      P.appendChild(btn(t('sync_now'), 'block', function () { syncAll(true); }));
      if (sy.role === 'view') {
        P.appendChild(el('p', 'muted small', t('proj_view_only')));
        P.appendChild(btn(t('leave_proj'), 'block danger', function () { leaveProject(p); }));
      } else if (sy.role === 'edit') {
        P.appendChild(el('p', 'muted small', t('proj_edit_note')));
        P.appendChild(btn(t('leave_proj'), 'block danger', function () { leaveProject(p); }));
      }
      if (sy.role === 'owner') {
        P.appendChild(el('p', 'muted small', t('proj_edit_note')));
        var ir = el('label', 'field'); ir.appendChild(el('span', null, t('invite_as')));
        var rs = document.createElement('select');
        rs.appendChild(option('view', t('role_view'))); rs.appendChild(option('edit', t('role_edit')));
        rs.value = pRoleOpen; rs.addEventListener('change', function () { pRoleOpen = this.value; });
        ir.appendChild(rs); P.appendChild(ir);
        function rerender() { renderProjects(); }
        P.appendChild(btn(t('make_invite'), 'block', function () {
          cloud.createPInvite(sy.id, pRoleOpen).then(function (code) { pInvite = sy.id + '.' + code; rerender(); }).catch(fail);
        }));
        if (pInvite && pInvite.indexOf(sy.id) === 0) {
          P.appendChild(el('p', 'muted small', t('invite_text')));
          var box = document.createElement('input'); box.type = 'text'; box.readOnly = true; box.value = pInvite; box.className = 'code';
          P.appendChild(box);
          P.appendChild(btn(t('copy'), 'block', function () {
            box.select();
            try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pInvite); else document.execCommand('copy'); toast(t('copied')); } catch (e) { /* by hand */ }
          }));
        }
        P.appendChild(btn(t('revoke_invites'), 'block', function () {
          if (!window.confirm(t('cf_revoke', { name: p.name }))) return;
          cloud.revokePInvites(sy.id).then(function () { pInvite = ''; toast(t('invites_revoked')); rerender(); }, fail);
        }));
        if (inf) {
          var uids = Object.keys(inf.members || {});
          if (uids.length) P.appendChild(el('h3', null, t('members')));
          uids.forEach(function (uid) {
            var m = inf.members[uid], r2 = el('div', 'member');
            r2.appendChild(el('span', 'mname', m.name ? m.name + ' (' + (m.email || '') + ')' : (m.email || uid)));
            var acts = el('div', 'acts');
            var sel = document.createElement('select');
            sel.appendChild(option('view', t('role_view'))); sel.appendChild(option('edit', t('role_edit'))); sel.value = m.role;
            sel.addEventListener('change', function () { cloud.setPRole(sy.id, uid, this.value).then(function () { m.role = sel.value; }, fail); });
            acts.appendChild(sel);
            acts.appendChild(btn(t('remove'), 'danger', function () {
              if (!window.confirm(t('cf_remove_member', { name: m.name || m.email || uid, book: p.name }))) return;
              cloud.removePMember(sy.id, uid, true).then(function () { delete inf.members[uid]; rerender(); }, fail);
            }));
            r2.appendChild(acts);
            P.appendChild(r2);
          });
        }
      }
      return P;
    };

    function leaveBook(b) {
      if (!window.confirm(t('confirm_leave'))) return;
      var id = b.sync.id, me = cloud.cfg().uid;
      cloud.removeMember(id, me).then(function () { return cloud.indexDelete(id); }).then(function () {
        delete b.sync; b.nolink = true; save(); renderAll();
      }, fail);
    }

    /* ----- panel ----- */
    function field(label, type, value, id, ph) {
      var l = el('label', 'field'); l.appendChild(el('span', null, label));
      var i = document.createElement('input'); i.type = type; i.id = id; i.value = value || ''; i.autocomplete = 'off';
      i.setAttribute('autocapitalize', type === 'text' && /Name|Co|Job/.test(id) ? 'words' : 'off'); i.spellcheck = false;
      if (ph) i.placeholder = ph;
      l.appendChild(i); return l;
    }
    function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
    function profileFields(P, p) {
      P.appendChild(field(t('full_name'), 'text', p.name, 'pName'));
      P.appendChild(field(t('phone'), 'tel', p.phone, 'pPhone'));
      P.appendChild(field(t('company'), 'text', p.company, 'pCompany'));
      P.appendChild(field(t('job_role'), 'text', p.role, 'pRole'));
    }
    function readProfile() { return { name: val('pName'), phone: val('pPhone'), company: val('pCompany'), role: val('pRole') }; }

    function submitAuth() {
      var c = cloud.cfg();
      var db = CS.cleanDbUrl($('cDb') ? val('cDb') : c.dbUrl);
      if (!db) { toast(t('bad_db_url')); return; }
      var key = ($('cKey') ? val('cKey') : c.apiKey || '').replace(/["'\s,]/g, '');
      var mail = val('cMail'), pw = $('cPass').value;
      if (!key || !mail || !pw) { toast(t('need_config')); return; }
      var prof = null;
      if (authMode === 'signup') {
        prof = readProfile(); draft = prof;
        if (!prof.name) { toast(t('need_name')); $('pName').focus(); return; }
        if (pw !== $('cPass2').value) { toast(t('pw_mismatch')); return; }
      }
      cloud.patchCfg({ dbUrl: db, apiKey: key, email: mail });
      var p = authMode === 'signup'
        ? cloud.signUp(mail, pw).then(function () { return cloud.profilePut(prof); })
        : cloud.signIn(mail, pw).then(function () { return cloud.profileGet().catch(function () { return null; }); });
      p.then(function () { status = ''; renderAll(); syncAll(false); backupNow(true); }, fail);
    }

    function renderCloud() {
      var P = $('cloudPanel');
      if (!P) return;
      if (P.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // do not disturb typing
      var c = cloud.cfg(), b = book();
      P.textContent = '';
      P.appendChild(el('h2', null, '☁️ ' + t('cloud_title')));
      P.appendChild(el('p', 'muted small', t('cloud_intro')));
      if (!c.dbUrl || !c.apiKey) P.appendChild(el('p', 'note', t('cloud_setup_needed')));

      if (!ready()) {
        var D = window.CB_CLOUD_DEFAULTS || {};
        if (window.AndroidBridge && window.AndroidBridge.googleSignIn && D.googleClientId) {
          var gb = btn('', 'block google', function () { window.AndroidBridge.googleSignIn(D.googleClientId); });
          gb.appendChild(el('b', 'gmark', 'G')); gb.appendChild(document.createTextNode(' ' + t('continue_google')));
          P.appendChild(gb);
          P.appendChild(el('p', 'muted small center', t('or_email')));
        }
        var tabs = el('div', 'seg');
        [['signin', t('sign_in')], ['signup', t('sign_up')]].forEach(function (x) {
          var bt = btn(x[1], authMode === x[0] ? 'on' : '', function () {
            if ($('cMail')) cloud.patchCfg({ email: val('cMail') });
            if ($('pName')) draft = readProfile();
            authMode = x[0]; renderCloud();
          });
          tabs.appendChild(bt);
        });
        P.appendChild(tabs);
        P.appendChild(field(t('email'), 'email', c.email, 'cMail'));
        P.appendChild(field(t('password'), 'password', '', 'cPass'));
        if (authMode === 'signup') {
          P.appendChild(field(t('confirm_password'), 'password', '', 'cPass2'));
          P.appendChild(el('p', 'muted small', t('about_you')));
          profileFields(P, draft);
        }
        P.appendChild(btn(authMode === 'signup' ? t('sign_up') : t('sign_in'), 'primary block', submitAuth));
        P.appendChild(btn(t('advanced'), 'block', function () { advanced = !advanced; renderCloud(); }));
        if (advanced) {
          P.appendChild(field(t('db_url'), 'url', c.dbUrl, 'cDb'));
          P.appendChild(field(t('api_key'), 'text', c.apiKey, 'cKey'));
        }
      } else {
        var pr = c.profile || {};
        var who = el('div', 'who');
        who.appendChild(el('div', 'avatar', (pr.name || c.email || '?').trim().charAt(0).toUpperCase()));
        var wt = el('div', 'whotext');
        wt.appendChild(el('strong', null, pr.name || c.email || ''));
        wt.appendChild(el('span', 'muted small', [pr.role, pr.company].filter(Boolean).join(' · ') || c.email || ''));
        who.appendChild(wt);
        P.appendChild(who);
        if (!pr.name) { profileOpen = true; P.appendChild(el('p', 'muted small', t('complete_profile'))); }
        P.appendChild(btn(t('my_profile'), 'block', function () { profileOpen = !profileOpen; renderCloud(); }));
        if (profileOpen) {
          profileFields(P, pr.name ? pr : draft);
          P.appendChild(btn(t('save'), 'primary block', function () {
            var p2 = readProfile();
            if (!p2.name) { toast(t('need_name')); return; }
            cloud.profilePut(p2).then(function () { toast(t('profile_saved')); profileOpen = false; renderCloud(); }, fail);
          }));
        }

        P.appendChild(el('p', 'muted small', t('all_books_synced', { n: linkedBooks().length })));
        P.appendChild(btn(t('sync_now'), 'primary block', function () { syncAll(true); }));
        P.appendChild(btn(t('cloud_backup_now'), 'block', function () { backupNow(false); }));
        P.appendChild(btn(t('cloud_restore'), 'block', restoreNow));
        P.appendChild(el('p', 'muted small', t('cloud_last_backup', { t: stamp(c.lastBackup) })));

        P.appendChild(el('h2', null, window.__bookIcon(b) + b.name));
        if (!b.sync) {
          P.appendChild(el('p', 'muted small', t(b.nolink ? 'book_local_only' : 'book_syncs_later')));
          P.appendChild(btn(t('sync_this_book'), 'block', function () {
            linkBook(b).then(function () { return syncAll(true); }).then(function () { renderAll(); }, fail);
          }));
        } else {
          var sy = b.sync, inf = info[sy.id];
          P.appendChild(el('p', 'muted small', t('sharing_on', { r: roleName(sy.role) }) + ' · ' + t('last_sync', { t: stamp(sy.last) })));
          if (sy.role === 'view') P.appendChild(el('p', 'muted small', t('view_only_note')));
          if (sy.role === 'owner') {
            P.appendChild(el('h2', null, t('share_with')));
            var ir = el('label', 'field'); ir.appendChild(el('span', null, t('invite_as')));
            var rs = document.createElement('select');
            rs.appendChild(option('view', t('role_view'))); rs.appendChild(option('edit', t('role_edit')));
            rs.value = inviteRole; rs.addEventListener('change', function () { inviteRole = this.value; });
            ir.appendChild(rs); P.appendChild(ir);
            P.appendChild(btn(t('make_invite'), 'block', makeInvite));
            if (invite) {
              P.appendChild(el('p', 'muted small', t('invite_text')));
              var box = document.createElement('input'); box.type = 'text'; box.readOnly = true; box.value = invite; box.className = 'code'; box.id = 'inviteBox';
              P.appendChild(box);
              P.appendChild(btn(t('copy'), 'block', function () {
                box.select();
                try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(invite); else document.execCommand('copy'); toast(t('copied')); } catch (e) { /* user can copy by hand */ }
              }));
            }
            P.appendChild(btn(t('revoke_invites'), 'block', function () {
              if (!window.confirm(t('cf_revoke', { name: b.name }))) return;
              cloud.revokeInvites(sy.id).then(function () { invite = ''; toast(t('invites_revoked')); renderCloud(); }, fail);
            }));
            if (inf) {
              var uids = Object.keys(inf.members);
              if (uids.length) P.appendChild(el('h2', null, t('members')));
              uids.forEach(function (uid) {
                var m = inf.members[uid], r2 = el('div', 'member');
                r2.appendChild(el('span', 'mname', m.name ? m.name + ' (' + (m.email || '') + ')' : (m.email || uid)));
                var acts = el('div', 'acts');
                var sel = document.createElement('select');
                sel.appendChild(option('view', t('role_view'))); sel.appendChild(option('edit', t('role_edit'))); sel.value = m.role;
                sel.addEventListener('change', function () { cloud.setRole(sy.id, uid, this.value).then(function () { m.role = sel.value; }, fail); });
                acts.appendChild(sel);
                acts.appendChild(btn(t('remove'), 'danger', function () {
                  if (!window.confirm(t('cf_remove_member', { name: m.name || m.email || uid, book: b.name }))) return;
                  cloud.removeMember(sy.id, uid).then(function () { delete inf.members[uid]; renderCloud(); renderBooks(); }, fail);
                }));
                r2.appendChild(acts);
                P.appendChild(r2);
              });
            }
          } else {
            P.appendChild(btn(t('leave_book'), 'block danger', function () { leaveBook(b); }));
          }
        }

        P.appendChild(el('h2', null, t('join_title')));
        P.appendChild(field(t('join_ph'), 'text', '', 'cJoin'));
        P.appendChild(btn(t('join'), 'block primary', function () { joinBook(val('cJoin')); }));
        if (status) P.appendChild(el('p', 'muted small', status));
        P.appendChild(btn(t('sign_out'), 'block', function () { if (!window.confirm(t('cf_signout'))) return; cloud.signOut(); invite = ''; status = ''; renderAll(); }));
      }

    }
    /* result of the Android Google account chooser */
    window.__onGoogle = function (token, err) {
      if (err || !token) {
        if (/Cancellation/.test(err || '')) return;
        toast(/NoCredential/.test(err || '') ? t('google_no_account') : t('google_failed', { c: err || '?' }));
        return;
      }
      cloud.signInGoogle(token).then(function (b) {
        return cloud.profileGet().catch(function () { return null; }).then(function (p) {
          if (!p) { draft = { name: b.displayName || '', phone: '', company: '', role: '' }; profileOpen = true; }
          status = ''; renderAll(); syncAll(false); backupNow(true);
        });
      }, fail);
    };
    window.__renderCloud = function () { renderCloud(); dot(); };

    /* small status light in the header: green = synced, spinning = working, red = last attempt failed */
    function dot(cls) {
      var d = $('syncDot');
      if (!d) return;
      d.hidden = !ready();
      if (cls) { d.className = 'sync ' + cls; d.setAttribute('title', cls === 'err' ? status : t('synced')); }
      else if (!d.className || d.className === 'sync') d.className = 'sync ok';
    }
    $('syncDot').addEventListener('click', function () { syncAll(true); });

    /* ----- start: sync when the app opens / returns, then every 30 s ----- */
    function auto() { if (!document.hidden) syncAll(false); }
    document.addEventListener('visibilitychange', auto);
    setInterval(auto, 30000);
    setTimeout(function () {
      auto();
      var c = cloud.cfg();
      if (ready() && (!c.lastBackup || Date.now() - c.lastBackup > 86400000)) backupNow(true);
    }, 1500);
  })();

  /* ---------- the list of books (home of the Entries tab) ---------- */
  function lastEntryDate(b) {
    var d = '';
    b.entries.forEach(function (e) { if (e.date > d) d = e.date; });
    return d;
  }
  function applyEntriesScreen() {
    $('booksHome').hidden = ui.bookOpen;
    $('bookScreen').hidden = !ui.bookOpen;
    document.body.classList.toggle('books-home', !ui.bookOpen);
    if (ui.bookOpen) {
      var b = book(), bz = b.businessId ? byId(state.businesses, b.businessId) : null;
      $('bookTitle').textContent = b.name;
      $('bookSub').textContent = (window.__bookIcon ? window.__bookIcon(b) : '') + (bz ? bz.name : '');
    }
  }

  /* Calculator: type or tap an expression such as 12*350+1500; "Use result" puts the answer in the field. */
  function openCalculator(initial, onUse) {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal calcmodal');
    var expr = initial && isFinite(parseFloat(initial)) ? String(parseFloat(initial)) : '';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, t('calculator')));
    var disp = document.createElement('input');
    disp.type = 'text'; disp.className = 'calcdisp'; disp.inputMode = 'none'; disp.value = expr; disp.setAttribute('autocomplete', 'off');
    var res = el('div', 'calcres');
    function show() {
      var v = L.calcEval(expr);
      res.textContent = expr ? (isNaN(v) ? '…' : '= ' + money(v).replace(/^[^\d-]*/, '')) : '';
      res.className = 'calcres' + (isNaN(v) && expr ? ' muted' : '');
    }
    disp.addEventListener('input', function () { expr = disp.value; show(); });
    m.appendChild(disp); m.appendChild(res);
    var keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '%', '⌫'];
    var grid = el('div', 'calcgrid');
    keys.forEach(function (k) {
      grid.appendChild(btn(k, 'calckey' + ('÷×−+'.indexOf(k) >= 0 ? ' op' : ''), function () {
        if (k === 'C') expr = '';
        else if (k === '⌫') expr = expr.slice(0, -1);
        else expr += k;
        disp.value = expr; show();
      }));
    });
    m.appendChild(grid);
    var eq = btn('=', 'block', function () {
      var v = L.calcEval(expr);
      if (!isNaN(v)) { expr = String(v); disp.value = expr; show(); }
    });
    m.appendChild(eq);
    m.appendChild(btn(t('use_result'), 'block primary', function () {
      var v = L.calcEval(expr);
      if (isNaN(v)) { toast(t('calc_bad')); return; }
      close(); onUse(String(v));
    }));
    m.appendChild(btn(t('cancel'), 'block', close));
    ov.appendChild(m);
    document.body.appendChild(ov);
    show();
  }
  $('calcBtn').addEventListener('click', function () { openCalculator($('amount').value, function (v) { $('amount').value = v; }); });

  function actionSheet(title, items) {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, title));
    items.forEach(function (it) {
      m.appendChild(btn(it.label, 'block' + (it.danger ? ' danger' : ''), function () { close(); it.run(); }));
    });
    m.appendChild(btn(t('cancel'), 'block', close));
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  function openBookById(id) {
    state.current = id;
    ui.bookOpen = true;
    save();
    renderAll();
    window.scrollTo(0, 0);
  }

  function bookMenu(b) {
    var items = [
      { label: t('m_rename'), run: function () {
        openForm({ title: t('m_rename'), fields: [{ key: 'name', label: t('book_name'), type: 'text', value: b.name, required: true, max: 40 }],
          onSubmit: function (v) { b.name = v.name.slice(0, 40); save(); renderAll(); return null; } });
      } },
      { label: t('m_export'), run: function () {
        saveFile('truckbook-' + safeName(b.name) + '-' + L.todayStr() + '.csv', 'text/csv', L.buildCsv(b.entries));
      } },
      { label: t('m_share'), run: function () {
        state.current = b.id; ui.bookOpen = false; save(); showView('settings'); renderAll();
        var cp = $('cloudPanel'); if (cp && cp.scrollIntoView) cp.scrollIntoView();
      } }
    ];
    if (state.projects.length) items.push({ label: t('m_project'), run: function () {
      var opts = [{ value: '', label: t('no_project') }].concat(state.projects.map(function (p) { return { value: p.id, label: p.name }; }));
      openForm({ title: t('m_project'), fields: [{ key: 'p', label: t('project'), type: 'select', options: opts, value: b.projectId || '' }],
        onSubmit: function (v) { b.projectId = v.p; save(); renderAll(); return null; } });
    } });
    if (state.businesses.length) items.push({ label: t('m_business'), run: function () {
      var opts = [{ value: '', label: t('no_business') }].concat(state.businesses.map(function (x) { return { value: x.id, label: x.name }; }));
      openForm({ title: t('m_business'), fields: [{ key: 'b', label: t('business'), type: 'select', options: opts, value: b.businessId || '' }],
        onSubmit: function (v) { b.businessId = v.b; save(); renderAll(); return null; } });
    } });
    items.push({ label: t('m_delete'), danger: true, run: function () {
      if (state.books.length < 2) { toast(t('last_book')); return; }
      function proceed() {
        dropPaymentsOfBook(b.id);
        trashPut('book', b.name, b, {}, entryPhotoIds(b.entries));
        state.books = state.books.filter(function (x) { return x.id !== b.id; });
        if (state.current === b.id) state.current = state.books[0].id;
        save(); renderAll(); undoToast();
      }
      if (b.sync && window.__cloudRelease) { window.__cloudRelease(b).then(function (ok) { if (ok) proceed(); }); return; }
      if (window.confirm(t('confirm_delete_book'))) proceed();
    } });
    actionSheet(b.name, items);
  }

  function renderBookList() {
    var bz = state.business ? byId(state.businesses, state.business) : null;
    $('bizName').textContent = bz ? bz.name : (state.businesses.length ? t('all_businesses') : t('my_books'));
    var sortSel = $('bookSort');
    if (!sortSel.options.length) {
      [['updated', t('sort_updated')], ['name', t('sort_name')], ['balance', t('sort_balance')]].forEach(function (o) { sortSel.appendChild(option(o[0], o[1])); });
    }
    sortSel.value = ui.bookSort;
    var q = ui.bookQ.trim().toLowerCase();
    var rows = visibleBooks().filter(function (b) { return !q || b.name.toLowerCase().indexOf(q) >= 0; }).map(function (b) {
      return { b: b, bal: L.totals(b.entries).balance, upd: b.updated || lastEntryDate(b) };
    });
    rows.sort(function (x, y) {
      if (ui.bookSort === 'name') return x.b.name.localeCompare(y.b.name);
      if (ui.bookSort === 'balance') return y.bal - x.bal;
      return (y.upd || '').localeCompare(x.upd || '') || x.b.name.localeCompare(y.b.name);
    });
    var ul = $('bookList');
    ul.textContent = '';
    rows.forEach(function (r) {
      var li = el('li', 'bookrow');
      li.tabIndex = 0;
      li.appendChild(el('span', 'bicon', '📘'));
      var mid = el('div', 'bmid');
      mid.appendChild(el('b', 'bname', (window.__bookIcon ? window.__bookIcon(r.b) : '') + r.b.name));
      mid.appendChild(el('small', 'bupd', r.upd ? t('updated_on') + ' ' + fmtDate(r.upd) : t('no_entries_short')));
      li.appendChild(mid);
      li.appendChild(el('span', 'bbal ' + (r.bal < 0 ? 'neg' : 'pos'), money(r.bal)));
      var mb = btn('⋮', 'bmenu', function (ev) { ev.stopPropagation(); bookMenu(r.b); });
      mb.setAttribute('aria-label', t('books'));
      li.appendChild(mb);
      li.addEventListener('click', function () { openBookById(r.b.id); });
      li.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') openBookById(r.b.id); });
      ul.appendChild(li);
    });
    $('noBooks').hidden = rows.length > 0;
  }

  $('backBooks').addEventListener('click', function () { ui.bookOpen = false; renderAll(); window.scrollTo(0, 0); });
  $('bookSort').addEventListener('change', function () { ui.bookSort = this.value; renderBookList(); });
  $('bookSearchBtn').addEventListener('click', function () {
    var inp = $('bookSearch');
    inp.hidden = !inp.hidden;
    if (inp.hidden) { inp.value = ''; ui.bookQ = ''; renderBookList(); } else inp.focus();
  });
  $('bookSearch').addEventListener('input', function () { ui.bookQ = this.value; renderBookList(); });
  $('addBookCard').addEventListener('click', function () {
    var fields = [{ key: 'name', label: t('book_name'), type: 'text', value: '', required: true, max: 40 }];
    if (state.projects.length) fields.push({ key: 'p', label: t('project'), type: 'select', options: [{ value: '', label: t('no_project') }].concat(state.projects.map(function (p) { return { value: p.id, label: p.name }; })), value: '' });
    openForm({ title: t('add_new_book'), fields: fields, onSubmit: function (v) {
      var id = 'b' + L.newId();
      state.books.push({ id: id, name: v.name.slice(0, 40), projectId: v.p || '', businessId: state.business || '', updated: L.todayStr(), entries: [] });
      state.current = id; ui.bookOpen = true;
      save(); renderAll();
      return null;
    } });
  });
  $('bizBar').addEventListener('click', function () {
    if (!state.businesses.length) { editBusiness(null); return; }
    var items = [{ label: t('all_businesses'), run: function () { state.business = ''; save(); renderAll(); } }];
    state.businesses.forEach(function (x) { items.push({ label: x.name, run: function () { state.business = x.id; save(); renderAll(); } }); });
    items.push({ label: '+ ' + t('add_business'), run: function () { editBusiness(null); } });
    actionSheet(t('switch_business'), items);
  });
  $('staffBtn').addEventListener('click', function () {
    var bz = state.business ? byId(state.businesses, state.business) : null;
    if (!bz) { if (!state.businesses.length) editBusiness(null); else toast(t('pick_business_first')); return; }
    editStaff(bz, null);
  });

  /* ---------- first-time guide ---------- */
  function showGuide() {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal');
    function close() {
      try { localStorage.setItem('truckbook.guide.v1', '1'); } catch (e) { /* ignore */ }
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
    m.appendChild(el('h2', null, t('guide_title')));
    [1, 2, 3, 4].forEach(function (i) { m.appendChild(el('p', null, t('guide_' + i))); });
    m.appendChild(btn(t('guide_ok'), 'primary block', close));
    ov.appendChild(m);
    document.body.appendChild(ov);
  }
  (function () {
    var seen = false;
    try { seen = !!localStorage.getItem('truckbook.guide.v1'); } catch (e) { seen = true; }
    var empty = !state.projects.length && state.books.every(function (b) { return !b.entries.length; });
    if (!seen && empty && !navigator.webdriver) setTimeout(showGuide, 400);
  })();
  var gb = document.createElement('button');
  gb.type = 'button'; gb.className = 'block'; gb.textContent = t('guide_show');
  gb.addEventListener('click', function () { $('closeAbout').click(); showGuide(); });
  $('aboutBackup').parentNode.insertBefore(gb, $('aboutBackup'));

  /* ---------- start ---------- */
  touchBooks();                      // remember how each book looks now, so only later changes count as an update
  showView('entries');
  purgeExpiredTrashPhotos();
  renderAll();
  showLock();
})();
