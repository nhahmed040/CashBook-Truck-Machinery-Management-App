/* Pure data logic for TruckBook: no DOM access, so it can be unit-tested in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBLogic = factory();
})(this, function () {
  'use strict';

  var LANGS = ['en', 'om', 'am'];
  var CURRENCIES = ['ETB', 'USD', 'EUR', 'GBP', 'KES', 'SAR', 'AED', 'none'];
  var THEMES = ['system', 'light', 'dark'];
  var CALENDARS = ['gregorian', 'ethiopian'];
  var MODES = ['cash', 'bank', 'mobile', 'cheque', 'other'];
  var KINDS = ['customer', 'supplier', 'other'];
  var STAFF_ROLES = ['manager', 'accountant', 'cashier', 'viewer'];
  var CODES = ['fuel', 'spares', 'tyres', 'repairs', 'driver', 'insurance', 'permits', 'overhead', 'other'];
  /* Cost types of older versions are mapped to the nearest truck cost type. */
  var LEGACY_CODES = { materials: 'spares', labour: 'driver', equipment: 'repairs', subcontract: 'other', transport: 'other' };
  function fixCode(c, dflt) {
    if (CODES.indexOf(c) >= 0) return c;
    if (LEGACY_CODES[c]) return LEGACY_CODES[c];
    return dflt;
  }

  var idCounter = 0;
  function newId() {
    idCounter += 1;
    return Date.now() * 1000 + (idCounter % 1000);
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
  function num(v, min, max) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    if (n < min) n = min;
    if (max != null && n > max) n = max;
    return round2(n);
  }
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function validId(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function round6(n) { return Math.round(n * 1e6) / 1e6; }
  /* Quantities and unit rates keep up to 6 decimals so totals are not shifted by rounding. */
  function num6(v, min) { var n = Number(v); if (!isFinite(n) || n < min) n = min; return round6(n); }
  /* A rate as text: at least 2 and at most 6 decimals, no trailing zeros beyond 2. */
  function rateStr(n) {
    var x = round6(Number(n) || 0), t = x.toFixed(6).replace(/0+$/, '');
    var d = t.split('.'); if (d[1].length < 2) d[1] = (d[1] + '00').slice(0, 2);
    return d[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + d[1];
  }
  function num3(v, min) {
    var n = Number(v);
    if (!isFinite(n) || n < min) n = min;
    return round3(n);
  }
  /* List of photo ids: valid, unique, at most 12. */
  function photoIds(list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (v) {
      if (validId(v) && !seen[v] && out.length < 12) { seen[v] = true; out.push(v); }
    });
    return out;
  }

  /* Keep the first item for each id; give duplicates a fresh id. */
  function mapList(list, fn, max) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).slice(0, max || 5000).forEach(function (raw) {
      var x = fn(raw);
      if (!x) return;
      while (seen[x.id]) x.id = newId();
      seen[x.id] = true;
      out.push(x);
    });
    return out;
  }

  /* ---------- entries ---------- */
  function sanitizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    var amt = Number(e.amount);
    if (!isFinite(amt) || amt <= 0) return null;
    return {
      id: validId(e.id) ? e.id : newId(),
      type: e.type === 'out' ? 'out' : 'in',
      amount: round2(amt),
      date: isDate(e.date) ? e.date : todayStr(),
      category: str(e.category, 40),
      note: str(e.note, 80),
      code: fixCode(e.code, ''),
      party: str(e.party, 60),
      billId: validId(e.billId) ? e.billId : 0,
      invoiceId: validId(e.invoiceId) ? e.invoiceId : 0,
      truck: validId(e.truck) ? e.truck : 0,
      photos: photoIds(e.photos),
      mode: MODES.indexOf(e.mode) >= 0 ? e.mode : '',
      by: str(e.by, 40),
      contactId: validId(e.contactId) ? e.contactId : 0,
      moveId: validId(e.moveId) ? e.moveId : 0
    };
  }
  function uniqueEntries(list) { return mapList(list, sanitizeEntry); }

  /* ---------- contacts and businesses ---------- */
  function sanitizeContact(c) {
    if (!c || typeof c !== 'object') return null;
    var name = str(c.name, 60);
    if (!name) return null;
    return {
      id: validId(c.id) ? c.id : newId(),
      name: name,
      phone: str(c.phone, 30),
      email: str(c.email, 60),
      address: str(c.address, 80),
      kind: KINDS.indexOf(c.kind) >= 0 ? c.kind : 'other',
      note: str(c.note, 80)
    };
  }
  function sanitizeStaff(m) {
    if (!m || typeof m !== 'object') return null;
    var name = str(m.name, 60);
    if (!name) return null;
    return { id: validId(m.id) ? m.id : newId(), name: name, phone: str(m.phone, 30), role: STAFF_ROLES.indexOf(m.role) >= 0 ? m.role : 'cashier' };
  }
  function sanitizeBusiness(b) {
    if (!b || typeof b !== 'object') return null;
    var name = str(b.name, 40);
    if (!name) return null;
    return { id: str(b.id, 40) || ('biz' + newId()), name: name, staff: mapList(b.staff, sanitizeStaff, 200) };
  }

  /* ---------- truck fleet parts ---------- */
  function sanitizePayment(p) {
    if (!p || typeof p !== 'object') return null;
    var a = Number(p.amount);
    if (!isFinite(a) || a <= 0) return null;
    return {
      id: validId(p.id) ? p.id : newId(),
      date: isDate(p.date) ? p.date : todayStr(),
      amount: round2(a),
      entryId: validId(p.entryId) ? p.entryId : 0,
      bookId: str(p.bookId, 40),
      driver: validId(p.driver) ? p.driver : 0 // customer money collected by this driver (the driver holds it until handed over)
    };
  }

  /* Supplier bill: fuel, spare parts, tyres, repairs ... bought on credit or paid at once. Optionally tied to one truck. */
  function sanitizeBill(b) {
    if (!b || typeof b !== 'object') return null;
    var a = Number(b.amount);
    if (!isFinite(a) || a <= 0) return null;
    return {
      id: validId(b.id) ? b.id : newId(),
      date: isDate(b.date) ? b.date : todayStr(),
      supplier: str(b.supplier, 60),
      code: fixCode(b.code, 'other'),
      desc: str(b.desc, 80),
      due: isDate(b.due) ? b.due : '',
      truck: validId(b.truck) ? b.truck : 0,
      litres: num3(b.litres, 0),
      odo: Math.round(num(b.odo, 0, 99999999)),
      amount: round2(a),
      payments: mapList(b.payments, sanitizePayment, 500),
      photos: photoIds(b.photos)
    };
  }

  var UNITS = ['trip', 'load', 'm3', 'ton', 'day', 'hour', 'month'];
  /* Kinds of work. The unit decides the kind, so older entries need no migration. */
  var WORK_TYPES = ['trip', 'load_m3', 'load_ton', 'rent_hour', 'rent_day', 'rent_month'];
  var WORK_UNIT = { trip: 'trip', load_m3: 'm3', load_ton: 'ton', rent_hour: 'hour', rent_day: 'day', rent_month: 'month' };
  function workType(x) { return x.unit === 'm3' ? 'load_m3' : x.unit === 'ton' ? 'load_ton' : x.unit === 'hour' ? 'rent_hour' : x.unit === 'day' ? 'rent_day' : x.unit === 'month' ? 'rent_month' : 'trip'; }

  /* A truck of the fleet. The three dates drive the "expires / due" reminders. */
  function sanitizeTruck(x) {
    if (!x || typeof x !== 'object') return null;
    var plate = str(x.plate, 30);
    if (!plate) return null;
    return {
      id: validId(x.id) ? x.id : newId(),
      plate: plate,
      model: str(x.model, 40),
      capacity: str(x.capacity, 20),
      driverId: validId(x.driverId) ? x.driverId : 0,
      insuranceDate: isDate(x.insuranceDate) ? x.insuranceDate : '',
      inspectionDate: isDate(x.inspectionDate) ? x.inspectionDate : '',
      serviceDate: isDate(x.serviceDate) ? x.serviceDate : '',
      active: x.active !== false,
      note: str(x.note, 80),
      photos: photoIds(x.photos)
    };
  }

  /* One haul: qty x rate (qty 1 and the price as rate for a flat price per trip). */
  function sanitizeTrip(x) {
    if (!x || typeof x !== 'object') return null;
    var qty = num3(x.qty == null || x.qty === '' ? 1 : x.qty, 0), rate = num6(x.rate, 0);
    var amount = round2(qty * rate);
    if (!(amount > 0)) return null;
    return {
      id: validId(x.id) ? x.id : newId(),
      date: isDate(x.date) ? x.date : todayStr(),
      truck: validId(x.truck) ? x.truck : 0,
      driver: validId(x.driver) ? x.driver : 0,
      customer: str(x.customer, 60),
      from: str(x.from, 40),
      to: str(x.to, 40),
      material: str(x.material, 30),
      ticket: str(x.ticket, 20),
      qty: qty,
      unit: UNITS.indexOf(x.unit) >= 0 ? x.unit : 'trip',
      rate: rate,
      amount: amount,
      invoiceId: validId(x.invoiceId) ? x.invoiceId : 0,
      note: str(x.note, 80),
      loads: num3(x.loads, 0),                         // number of loads (load work, optional)
      start: isDate(x.start) ? x.start : '',           // rent: first and last day
      end: isDate(x.end) ? x.end : '',
      meterStart: num3(x.meterStart, 0),               // rent by the hour: hour-meter readings
      meterEnd: num3(x.meterEnd, 0),
      fuelByCustomer: x.fuelByCustomer === true || x.fuelByCustomer === 'yes'
    };
  }

  /* Customer invoice: its trips are the trips whose invoiceId points here. */
  var INVOICE_STATUSES = ['draft', 'sent', 'paid'];
  var INVOICE_PAY_DAYS = 30;
  function sanitizeInvoice(c) {
    if (!c || typeof c !== 'object') return null;
    return {
      id: validId(c.id) ? c.id : newId(),
      no: str(c.no, 20),
      date: isDate(c.date) ? c.date : todayStr(),
      due: isDate(c.due) ? c.due : '',
      customer: str(c.customer, 60),
      whtReceipt: str(c.whtReceipt, 30),
      receipts: mapList(c.receipts, sanitizePayment, 500),
      status: INVOICE_STATUSES.indexOf(c.status) >= 0 ? c.status : '',
      sentDate: isDate(c.sentDate) ? c.sentDate : '',
      note: str(c.note, 80)
    };
  }
  function daysSince(date, today) {
    return Math.floor((new Date(today + 'T00:00:00Z').getTime() - new Date(date + 'T00:00:00Z').getTime()) / 86400000);
  }

  /* Drivers and helpers; truck = the truck they usually drive. */
  function sanitizeWorker(w) {
    if (!w || typeof w !== 'object') return null;
    var name = str(w.name, 60);
    if (!name) return null;
    return { id: validId(w.id) ? w.id : newId(), name: name, role: str(w.role, 40), rate: num(w.rate, 0), truck: validId(w.truck) ? w.truck : 0 };
  }

  function sanitizeAttendance(a) {
    if (!a || typeof a !== 'object' || !isDate(a.date) || !validId(a.workerId)) return null;
    return {
      id: validId(a.id) ? a.id : newId(),
      date: a.date,
      workerId: a.workerId,
      days: num(a.days, 0, 3),
      rate: num(a.rate, 0),
      paid: !!a.paid
    };
  }


  /* Cash movements of trucks and drivers.
     advance = trip money given to a driver, spent = what the driver spent from it (a truck cost), return = change given back,
     salary = wage earned (adds to what is owed to the driver), pay = wage paid, deduct = fine or loan taken off,
     in / out = any other cash in or out of a truck. */
  var CASH_KINDS = ['advance', 'spent', 'return', 'handover', 'salary', 'pay', 'deduct', 'in', 'out'];
  var CASH_MOVES = { advance: 'out', return: 'in', handover: 'in', pay: 'out', 'in': 'in', out: 'out' }; // kinds that move money in/out of the cash box
  function sanitizeCash(c) {
    if (!c || typeof c !== 'object' || CASH_KINDS.indexOf(c.kind) < 0) return null;
    var a = Number(c.amount);
    if (!isFinite(a) || a <= 0) return null;
    return {
      id: validId(c.id) ? c.id : newId(),
      date: isDate(c.date) ? c.date : todayStr(),
      kind: c.kind,
      truck: validId(c.truck) ? c.truck : 0,
      driver: validId(c.driver) ? c.driver : 0,
      amount: round2(a),
      code: c.kind === 'pay' ? 'driver' : (c.kind === 'spent' || c.kind === 'out') ? fixCode(c.code, 'other') : '',
      note: str(c.note, 80),
      entryId: validId(c.entryId) ? c.entryId : 0,
      bookId: str(c.bookId, 40)
    };
  }

  /* A "project" is one fleet / hauling business: its trucks, trips, drivers, costs and customer invoices. */
  function sanitizeProject(p, n) {
    p = p && typeof p === 'object' ? p : {};
    var workers = mapList(p.workers, sanitizeWorker, 500);
    var wIds = {};
    workers.forEach(function (w) { wIds[w.id] = true; });
    var trucks = mapList(p.trucks, sanitizeTruck, 500);
    var tIds = {};
    trucks.forEach(function (x) { tIds[x.id] = true; });
    workers.forEach(function (w) { if (w.truck && !tIds[w.truck]) w.truck = 0; });
    // one attendance row per worker per day (the last one wins)
    var attMap = {};
    mapList(p.attendance, sanitizeAttendance, 50000).forEach(function (a) {
      if (wIds[a.workerId]) attMap[a.date + '|' + a.workerId] = a;
    });
    var invoices = mapList(p.invoices, sanitizeInvoice, 3000);
    var iIds = {};
    invoices.forEach(function (c) { iIds[c.id] = true; });
    var trips = mapList(p.trips, sanitizeTrip, 50000);
    trips.forEach(function (x) { if (x.invoiceId && !iIds[x.invoiceId]) x.invoiceId = 0; });
    var out = {
      id: str(p.id, 40) || ('p' + newId()),
      name: str(p.name, 60) || ('Fleet ' + n),
      owner: str(p.owner, 60),
      location: str(p.location, 60),
      vat: 0,
      wht: 0, // tax is not part of TruckBook invoices; kept at 0 so old data stays valid
      payDays: p.payDays == null || p.payDays === '' ? INVOICE_PAY_DAYS : Math.round(num(p.payDays, 1, 365)),
      trucks: trucks,
      trips: trips,
      invoices: invoices,
      bills: mapList(p.bills, sanitizeBill, 5000),
      workers: workers,
      attendance: Object.keys(attMap).map(function (k) { return attMap[k]; }),
      cash: mapList(p.cash, sanitizeCash, 20000),
      photos: photoIds(p.photos)
    };
    var psy = sanitizeProjSync(p.sync);
    if (psy) out.sync = psy;
    return out;
  }

  /* ---------- shared fleets: the fleet as separate records ---------- */
  function sanitizeProjSync(x) {
    if (!x || typeof x !== 'object' || !/^[a-z0-9]{6,20}$/.test(String(x.id || ''))) return undefined;
    function map(m, isNum) {
      var out = {}, n = 0;
      if (m && typeof m === 'object') Object.keys(m).forEach(function (k) {
        if (n < 60000 && /^(info|[trilwac]\d{1,20})$/.test(k) && (isNum ? typeof m[k] === 'number' && isFinite(m[k]) : typeof m[k] === 'string' && m[k].length < 20)) { out[k] = m[k]; n++; }
      });
      return out;
    }
    return {
      id: x.id, role: x.role === 'owner' || x.role === 'edit' ? x.role : 'view',
      S: map(x.S, false), U: map(x.U, true),
      last: typeof x.last === 'number' && isFinite(x.last) ? x.last : 0,
      ix: x.ix === true, fresh: x.fresh === true,
      st: typeof x.st === 'number' && isFinite(x.st) ? x.st : 0
    };
  }
  var REC_LISTS = { t: 'trucks', r: 'trips', i: 'invoices', l: 'bills', w: 'workers', a: 'attendance', c: 'cash' };
  /* key -> record. Photos stay on the phone (they are not shared). */
  function projectRecords(p) {
    var recs = {}, info = {};
    Object.keys(p).forEach(function (k) {
      if (k === 'id' || k === 'sync' || k === 'photos' || Array.isArray(p[k])) return;
      info[k] = p[k];
    });
    recs.info = JSON.parse(JSON.stringify(info));
    Object.keys(REC_LISTS).forEach(function (pre) {
      (p[REC_LISTS[pre]] || []).forEach(function (x) {
        var c = JSON.parse(JSON.stringify(x));
        delete c.photos;
        recs[pre + x.id] = c;
      });
    });
    return recs;
  }
  /* put merged records back into p (in place). Returns p. */
  function applyProjectRecords(p, merged) {
    var lists = { trucks: [], trips: [], invoices: [], bills: [], workers: [], attendance: [], cash: [] };
    var localBills = {}, localTrucks = {};
    p.bills.forEach(function (b) { localBills[b.id] = b; });
    p.trucks.forEach(function (x) { localTrucks[x.id] = x; });
    Object.keys(merged).forEach(function (k) {
      var pre = k.charAt(0), list = REC_LISTS[pre];
      if (!list || k === 'info' || !/^[trilwac]\d+$/.test(k)) return;
      var rec = JSON.parse(JSON.stringify(merged[k]));
      if (pre === 'l' && localBills[rec.id]) rec.photos = localBills[rec.id].photos;
      if (pre === 't' && localTrucks[rec.id]) rec.photos = localTrucks[rec.id].photos;
      lists[list].push(rec);
    });
    Object.keys(lists).forEach(function (l) { lists[l].sort(function (x, y) { return x.id - y.id; }); });
    var raw = Object.assign({}, merged.info || {}, lists, { id: p.id, photos: p.photos, sync: p.sync });
    var clean = sanitizeProject(raw, 1);
    Object.keys(p).forEach(function (k) { delete p[k]; });
    Object.assign(p, clean);
    return p;
  }


  /* ---------- whole state ---------- */
  function defaultState() {
    return {
      v: 3,
      current: 'main',
      settings: { lang: 'en', currency: 'ETB', theme: 'system', calendar: 'gregorian', pinHash: '', pinSalt: '' },
      books: [{ id: 'main', name: 'Main', projectId: '', businessId: '', entries: [] }],
      projects: [],
      contacts: [],
      businesses: [],
      business: '',
      trash: []
    };
  }

  /* ---------- Recently deleted: removed items stay recoverable for 30 days ---------- */
  var TRASH_DAYS = 30, TRASH_MAX = 200;
  var TRASH_KINDS = ['entry', 'trip', 'truck', 'bill', 'invoice', 'contact', 'project', 'book'];
  function sanitizeTrash(list, now) {
    var out = [], seen = {};
    now = now || Date.now();
    (Array.isArray(list) ? list : []).forEach(function (r) {
      if (!r || typeof r !== 'object' || TRASH_KINDS.indexOf(r.kind) < 0) return;
      if (!r.payload || typeof r.payload !== 'object') return;
      var at = Number(r.deletedAt);
      if (!isFinite(at) || at <= 0 || now - at > TRASH_DAYS * 86400000) return;
      var id = validId(r.id) ? r.id : newId();
      if (seen[id]) return;
      seen[id] = true;
      out.push({
        id: id, kind: r.kind, label: str(r.label, 120), deletedAt: at, payload: r.payload,
        ctx: r.ctx && typeof r.ctx === 'object' ? r.ctx : {},
        photos: (Array.isArray(r.photos) ? r.photos : []).filter(validId).slice(0, 2000)
      });
    });
    out.sort(function (a, b) { return b.deletedAt - a.deletedAt; });
    return out.slice(0, TRASH_MAX);
  }
  /* Photos still needed by items in the trash (so they are not removed early). */
  function trashPhotoIds(trash) {
    var ids = [];
    (trash || []).forEach(function (r) { ids = ids.concat(r.photos || []); });
    return ids;
  }
  /* Clean copy of a trashed payload, ready to be put back (null if unusable). */
  function trashRestoreItem(rec) {
    var x = rec.payload;
    switch (rec.kind) {
      case 'entry': return sanitizeEntry(x);
      case 'trip': return sanitizeTrip(x);
      case 'truck': return sanitizeTruck(x);
      case 'bill': return sanitizeBill(x);
      case 'cash': return sanitizeCash(x);
      case 'invoice': return sanitizeInvoice(x);
      case 'contact': return sanitizeContact(x);
      case 'project': return sanitizeProject(x, 1);
      case 'book':
        var b = sanitizeState({ books: [x], projects: [], contacts: [] }, {}).books[0];
        if (b && !(x && Array.isArray(x.entries) && x.entries.length) && b.entries.length === 0) b.name = str(x && x.name, 40) || b.name;
        return b;
    }
    return null;
  }

  /* opts.keepPin: carry pinHash/pinSalt from raw (true for local storage, false for imports) */
  /* Link between a local book and its shared online copy. */
  function sanitizeSync(x) {
    if (!x || typeof x !== 'object' || !/^[a-z0-9]{6,20}$/.test(String(x.id || ''))) return null;
    function map(m, isNum) {
      var out = {}, n = 0;
      if (m && typeof m === 'object') Object.keys(m).forEach(function (k) {
        if (n < 20000 && /^\d{1,20}$/.test(k) && (isNum ? typeof m[k] === 'number' && isFinite(m[k]) : typeof m[k] === 'string' && m[k].length < 20)) { out[k] = m[k]; n++; }
      });
      return out;
    }
    return {
      id: x.id,
      role: x.role === 'owner' || x.role === 'edit' ? x.role : 'view',
      S: map(x.S, false), U: map(x.U, true),
      last: typeof x.last === 'number' && isFinite(x.last) ? x.last : 0,
      ix: x.ix === true,
      nm: typeof x.nm === 'string' ? x.nm.slice(0, 40) : ''
    };
  }

  function sanitizeState(raw, opts) {
    var keepPin = !!(opts && opts.keepPin);
    var s = defaultState();
    if (!raw || typeof raw !== 'object') return s;

    var rs = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    if (LANGS.indexOf(rs.lang) >= 0) s.settings.lang = rs.lang;
    if (CURRENCIES.indexOf(rs.currency) >= 0) s.settings.currency = rs.currency;
    if (THEMES.indexOf(rs.theme) >= 0) s.settings.theme = rs.theme;
    if (CALENDARS.indexOf(rs.calendar) >= 0) s.settings.calendar = rs.calendar;
    if (keepPin && typeof rs.pinHash === 'string' && typeof rs.pinSalt === 'string' && rs.pinHash && rs.pinSalt) {
      s.settings.pinHash = rs.pinHash.slice(0, 64);
      s.settings.pinSalt = rs.pinSalt.slice(0, 64);
    }

    var projects = [], pIds = {};
    (Array.isArray(raw.projects) ? raw.projects : []).slice(0, 100).forEach(function (rp) {
      var p = sanitizeProject(rp, projects.length + 1);
      while (pIds[p.id]) p.id = p.id + '_';
      pIds[p.id] = true;
      projects.push(p);
    });
    s.projects = projects;
    s.contacts = mapList(raw.contacts, sanitizeContact, 2000);
    var biz = [], bSeen = {};
    (Array.isArray(raw.businesses) ? raw.businesses : []).slice(0, 20).forEach(function (rb) {
      var b = sanitizeBusiness(rb);
      if (!b) return;
      while (bSeen[b.id]) b.id = b.id + '_';
      bSeen[b.id] = true; biz.push(b);
    });
    s.businesses = biz;
    s.business = typeof raw.business === 'string' && bSeen[raw.business] ? raw.business : '';
    var cIds = {};
    s.contacts.forEach(function (c) { cIds[c.id] = true; });

    if (Array.isArray(raw.books)) {
      var books = [], seenIds = {};
      raw.books.slice(0, 50).forEach(function (b, i) {
        if (!b || typeof b !== 'object') return;
        var id = str(b.id, 40) || ('b' + (i + 1));
        while (seenIds[id]) id = id + '_';
        seenIds[id] = true;
        var nb = {
          id: id,
          name: str(b.name, 40) || ('Book ' + (books.length + 1)),
          projectId: pIds[b.projectId] ? b.projectId : '',
          businessId: bSeen[b.businessId] ? b.businessId : '',
          updated: isDate(b.updated) ? b.updated : '',
          entries: uniqueEntries(b.entries).map(function (e) { if (e.contactId && !cIds[e.contactId]) e.contactId = 0; return e; })
        };
        var sy = sanitizeSync(b.sync);
        if (sy) nb.sync = sy;
        else if (b.nolink === true) nb.nolink = true;
        books.push(nb);
      });
      if (books.length) {
        s.books = books;
        s.current = typeof raw.current === 'string' && seenIds[raw.current] ? raw.current : books[0].id;
      }
    }
    s.trash = sanitizeTrash(raw.trash);
    return s;
  }

  /* Data saved by the first version: a bare array of entries. */
  function migrateOld(arr) {
    var s = defaultState();
    s.books[0].entries = uniqueEntries(arr);
    return s;
  }

  /* ---------- PIN hashing (casual lock, not strong crypto) ---------- */
  function cyrb53(text, seed) {
    var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (var i = 0, ch; i < text.length; i++) {
      ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }
  function hashPin(pin, salt) {
    var h = salt + ':' + pin;
    for (var i = 0; i < 3000; i++) h = cyrb53(h + ':' + pin, i);
    return h;
  }
  function newSalt() {
    var s = '';
    for (var i = 0; i < 4; i++) s += Math.floor(Math.random() * 0xffffffff).toString(16);
    return s.slice(0, 32);
  }
  function validPin(pin) { return /^\d{4,8}$/.test(pin); }

  /* ---------- CSV ---------- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function sortedForExport(entries) {
    return entries.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id;
    });
  }

  function rowsToCsv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  function buildCsv(entries) {
    var rows = [['Date', 'Type', 'Amount', 'Category', 'Remark', 'Cost code', 'Payee']];
    sortedForExport(entries).forEach(function (e) {
      rows.push([e.date, e.type === 'in' ? 'Cash in' : 'Cash out', e.amount.toFixed(2), e.category, e.note, e.code, e.party]);
    });
    return rowsToCsv(rows);
  }

  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], cell = '', inQ = false, i = 0, c;
    while (i < text.length) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { row.push(cell); cell = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += c; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
  }

  function unquoteFormula(s) {
    return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
  }

  /* Returns { entries: [...], skipped: n } */
  function entriesFromCsv(text) {
    var rows = parseCsv(text);
    var idx = { date: 0, type: 1, amount: 2, category: 3, remark: 4, code: 5, payee: 6 };
    if (rows.length && /^date$/i.test(rows[0][0].trim())) {
      var head = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
      var names = { date: 'date', type: 'type', amount: 'amount', category: 'category', remark: 'remark', code: 'cost code', payee: 'payee' };
      Object.keys(names).forEach(function (k) {
        var p = head.indexOf(names[k]);
        idx[k] = p; // -1 when the column is absent
      });
    }
    var out = [], skipped = 0;
    function cellAt(r, k) { return idx[k] >= 0 && r[idx[k]] != null ? r[idx[k]] : ''; }
    rows.forEach(function (r) {
      var e = sanitizeEntry({
        type: /out/i.test(cellAt(r, 'type')) ? 'out' : 'in',
        amount: parseFloat(String(cellAt(r, 'amount')).replace(/,/g, '')),
        date: cellAt(r, 'date').trim(),
        category: unquoteFormula(cellAt(r, 'category')),
        note: unquoteFormula(cellAt(r, 'remark')),
        code: cellAt(r, 'code').trim().toLowerCase(),
        party: unquoteFormula(cellAt(r, 'payee'))
      });
      if (e) out.push(e); else skipped++;
    });
    return { entries: uniqueEntries(out), skipped: skipped };
  }

  /* ---------- totals, filters, reports ---------- */
  function totals(entries) {
    var i = 0, o = 0;
    entries.forEach(function (e) { if (e.type === 'in') i += e.amount; else o += e.amount; });
    i = round2(i); o = round2(o);
    return { cashIn: i, cashOut: o, balance: round2(i - o) };
  }

  function filterEntries(entries, f) {
    var q = String((f && f.q) || '').trim().toLowerCase();
    return entries.filter(function (e) {
      if (f && f.type && f.type !== 'all' && e.type !== f.type) return false;
      if (f && f.from && e.date < f.from) return false;
      if (f && f.to && e.date > f.to) return false;
      if (f && f.mode && e.mode !== f.mode) return false;
      if (f && f.by && e.by !== f.by) return false;
      if (f && f.category && e.category !== f.category) return false;
      if (f && f.contactId && e.contactId !== f.contactId) return false;
      if (q) {
        var hay = (e.category + ' ' + e.note + ' ' + e.party + ' ' + e.by + ' ' + (e.mode || '')).toLowerCase();
        if (f && f.contactText) hay += ' ' + f.contactText(e);
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /* Running totals per contact over every book: money received from / paid to them. */
  function contactBalances(state) {
    var map = {};
    state.contacts.forEach(function (c) { map[c.id] = { cashIn: 0, cashOut: 0, net: 0, count: 0, last: '' }; });
    state.books.forEach(function (b) {
      b.entries.forEach(function (e) {
        var m = e.contactId && map[e.contactId];
        if (!m) return;
        if (e.type === 'in') m.cashIn = round2(m.cashIn + e.amount); else m.cashOut = round2(m.cashOut + e.amount);
        m.net = round2(m.cashIn - m.cashOut);
        m.count++;
        if (e.date > m.last) m.last = e.date;
      });
    });
    return map;
  }

  /* All entries of the given books (or all books) inside a date range, newest last, with the book name. */
  function rangeEntries(state, from, to, bookIds) {
    var out = [];
    state.books.forEach(function (b) {
      if (bookIds && bookIds.indexOf(b.id) < 0) return;
      filterEntries(b.entries, { from: from, to: to }).forEach(function (e) {
        var c = {}; Object.keys(e).forEach(function (k) { c[k] = e[k]; });
        c.bookId = b.id; c.book = b.name; out.push(c);
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
  }

  /* Unpaid supplier bills, unpaid customer invoices, unpaid wages and truck papers that expire, most urgent first.
     due: bill.due when set. level: overdue | soon (within `days`) | later | none. */
  var TRUCK_DOCS = [['insuranceDate', 'insurance'], ['inspectionDate', 'inspection'], ['serviceDate', 'service']];
  function reminders(state, today, days) {
    var out = [];
    var soon = new Date(today + 'T00:00:00Z').getTime() + (days == null ? 7 : days) * 86400000;
    var docSoon = new Date(today + 'T00:00:00Z').getTime() + 30 * 86400000;
    state.projects.forEach(function (p) {
      p.bills.forEach(function (b) {
        var bal = billBalance(b);
        if (bal <= 0) return;
        var level = 'none';
        if (b.due) {
          var t = new Date(b.due + 'T00:00:00Z').getTime();
          level = b.due < today ? 'overdue' : t <= soon ? 'soon' : 'later';
        }
        out.push({ kind: 'bill', projectId: p.id, project: p.name, id: b.id, who: b.supplier, desc: b.desc, due: b.due, amount: bal, level: level });
      });
      p.invoices.forEach(function (c) {
        var cc = invoiceCalc(p, c), st = invoiceStatus(c, cc);
        if (cc.balance > 0 && st !== 'paid') {
          var level = 'none', note = '', d, exp = invoiceExpected(p, c);
          if (exp) {
            var et = new Date(exp + 'T00:00:00Z').getTime();
            level = exp < today ? 'overdue' : et <= soon ? 'soon' : 'later';
            if (level === 'overdue') note = 'invoice_late:' + daysSince(exp, today);
          } else if (st === 'draft' && (d = daysSince(c.date, today)) >= 7) { level = 'later'; note = 'draft:' + d; }
          out.push({ kind: 'invoice', projectId: p.id, project: p.name, id: c.id, who: [c.customer, c.no].filter(Boolean).join(' · '), desc: '', note: note, status: st, due: exp, amount: cc.balance, level: level });
        }
      });
      var un = p.attendance.filter(function (a) { return !a.paid; });
      if (un.length) {
        var oldest = un.reduce(function (m, a) { return a.date < m ? a.date : m; }, un[0].date), dw = daysSince(oldest, today);
        out.push({ kind: 'wages', projectId: p.id, project: p.name, id: 0, who: '', desc: '', note: 'wages:' + dw, due: '', amount: round2(sum(un, function (a) { return a.days * a.rate; })), level: dw >= 7 ? 'overdue' : 'later' });
      }
      p.trucks.forEach(function (x) {
        if (!x.active) return;
        TRUCK_DOCS.forEach(function (d) {
          var date = x[d[0]];
          if (!date) return;
          var tm = new Date(date + 'T00:00:00Z').getTime();
          if (date >= today && tm > docSoon) return;
          out.push({ kind: 'truck', projectId: p.id, project: p.name, id: x.id, who: x.plate, desc: d[1], note: '', due: date, amount: 0, level: date < today ? 'overdue' : 'soon' });
        });
      });
    });
    var rank = { overdue: 0, soon: 1, later: 2, none: 3 };
    return out.sort(function (a, b) {
      return rank[a.level] - rank[b.level] || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || b.amount - a.amount;
    });
  }

  function monthOf(date) { return date.slice(0, 7); }

  /* The month functions take an optional calendar (see calendar.js); months are keys like "2026-11". */
  function keyFn(cal) { return cal ? cal.monthKey : monthOf; }

  function monthTotals(entries, month, cal) {
    var key = keyFn(cal);
    return totals(entries.filter(function (e) { return key(e.date) === month; }));
  }

  function categoryTotals(entries, month, type, cal) {
    var map = {};
    var key = keyFn(cal);
    entries.forEach(function (e) {
      if (e.type !== type || key(e.date) !== month) return;
      map[e.category] = round2((map[e.category] || 0) + e.amount);
    });
    return Object.keys(map).map(function (k) { return { name: k, total: map[k] }; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  function shiftMonth(month, delta) {
    var y = parseInt(month.slice(0, 4), 10), m = parseInt(month.slice(5, 7), 10) - 1 + delta;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }

  function lastMonths(entries, endMonth, n, cal) {
    var out = [];
    var shift = cal ? cal.shiftMonth : shiftMonth;
    for (var k = n - 1; k >= 0; k--) {
      var m = shift(endMonth, -k);
      var t = monthTotals(entries, m, cal);
      out.push({ month: m, cashIn: t.cashIn, cashOut: t.cashOut });
    }
    return out;
  }

  /* ---------- truck fleet: money ---------- */
  function sum(list, fn) {
    var t = 0;
    list.forEach(function (x) { t += fn(x); });
    return round2(t);
  }

  function billPaid(bill) { return sum(bill.payments, function (p) { return p.amount; }); }
  function billBalance(bill) { return round2(bill.amount - billPaid(bill)); }
  function invoiceReceived(inv) { return sum(inv.receipts, function (p) { return p.amount; }); }

  function tripsOfInvoice(project, invoiceId) {
    return project.trips.filter(function (x) { return x.invoiceId === invoiceId; });
  }
  /* Invoice arithmetic:  total = trips amount;  balance = total - money received. (No VAT / withholding.) */
  function invoiceCalc(project, inv) {
    var gross = sum(tripsOfInvoice(project, inv.id), function (x) { return x.amount; });
    var vat = round2(gross * project.vat / 100);
    var total = round2(gross + vat);
    var wht = round2(gross * project.wht / 100);
    var taxSettled = inv.whtReceipt ? wht : 0;
    var received = invoiceReceived(inv);
    return {
      gross: gross, vat: vat, total: total, wht: wht, cashDue: round2(total - wht),
      taxSettled: taxSettled, received: received, balance: round2(total - taxSettled - received),
      trips: tripsOfInvoice(project, inv.id).length
    };
  }
  /* Draft -> Sent -> Paid. Paid is worked out from the money received. */
  function invoiceStatus(inv, calc) {
    if (calc && calc.gross > 0 && calc.balance <= 0.004) return 'paid';
    return inv.status === 'sent' ? 'sent' : 'draft';
  }
  /* Date the money is expected: the due date, else sent date (or invoice date) + the customer's payment days. */
  function invoiceExpected(project, inv) {
    if (inv.due) return inv.due;
    var base = inv.sentDate || (inv.status === 'sent' ? inv.date : '');
    return base ? addDaysStr(base, project.payDays || INVOICE_PAY_DAYS) : '';
  }
  function nextInvoiceNo(project) {
    var max = 0;
    project.invoices.forEach(function (c) { var m = /(\d+)\s*$/.exec(c.no || ''); if (m) max = Math.max(max, Number(m[1])); });
    return String(Math.max(max, project.invoices.length) + 1);
  }
  function unbilledTrips(project, customer) {
    return project.trips.filter(function (x) { return !x.invoiceId && (customer == null || x.customer === customer); });
  }

  function projectBooks(state, projectId) {
    return state.books.filter(function (b) { return b.projectId === projectId; });
  }

  /* Costs = all supplier bills + cash-out entries in linked books that do not pay a bill.
     Each cost can be tagged with a truck (bill.truck / entry.truck). */
  function costItems(state, p) {
    var items = [];
    p.bills.forEach(function (b) { items.push({ code: b.code, truck: b.truck, amount: b.amount, litres: b.litres, date: b.date }); });
    projectBooks(state, p.id).forEach(function (b) {
      b.entries.forEach(function (e) {
        if (e.type !== 'out' || e.billId || e.moveId) return;
        items.push({ code: e.code || 'other', truck: e.truck, amount: e.amount, litres: 0, date: e.date });
      });
    });
    // driver spending, wages paid and other cash out of a truck (advances are not a cost until the driver spends them)
    (p.cash || []).forEach(function (c) {
      if (c.kind === 'spent' || c.kind === 'pay' || c.kind === 'out') items.push({ code: c.code || 'other', truck: c.truck, amount: c.amount, litres: 0, date: c.date });
    });
    return items;
  }


  /* A driver's cash account. held = trip money with the driver; owed = wages the owner owes (salary + unpaid attendance - paid - deductions).
     net > 0: the owner owes the driver;  net < 0: the driver owes the owner. */
  function driverAccount(p, workerId) {
    var a = { advance: 0, spent: 0, returned: 0, handed: 0, collected: 0, salary: 0, pay: 0, deduct: 0, attendance: 0, entries: [] };
    (p.cash || []).forEach(function (c) {
      if (c.driver !== workerId) return;
      a.entries.push(c);
      if (c.kind === 'advance') a.advance += c.amount;
      else if (c.kind === 'spent') a.spent += c.amount;
      else if (c.kind === 'return') a.returned += c.amount;
      else if (c.kind === 'handover') a.handed += c.amount;
      else if (c.kind === 'salary') a.salary += c.amount;
      else if (c.kind === 'pay') a.pay += c.amount;
      else if (c.kind === 'deduct') a.deduct += c.amount;
    });
    p.invoices.forEach(function (inv) { inv.receipts.forEach(function (r) { if (r.driver === workerId) a.collected += r.amount; }); });
    a.collected = round2(a.collected);
    a.attendance = sum(p.attendance.filter(function (x) { return x.workerId === workerId && !x.paid; }), function (x) { return x.days * x.rate; });
    a.held = round2(a.advance + a.collected - a.spent - a.returned - a.handed);
    a.owed = round2(a.salary + a.attendance - a.pay - a.deduct);
    a.net = round2(a.owed - a.held);
    a.entries.sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : y.id - x.id; });
    return a;
  }
  /* Every cash movement of the fleet as in/out lines (date range optional).
     in: customer receipts (shared over the trucks of the invoice by trip value), other cash in, returned trip money.
     out: supplier payments, trip money and wages given, other cash out. Driver spending is not a line: that money left when the advance was given. */
  function cashLines(state, p, from, to) {
    var lines = [];
    function add(date, dir, amount, truck, driver, label, kind, ref) {
      if (!(amount > 0) || (from && date < from) || (to && date > to)) return;
      lines.push({ date: date, dir: dir, amount: round2(amount), truck: truck || 0, driver: driver || 0, label: label, kind: kind, ref: ref || null });
    }
    p.invoices.forEach(function (inv) {
      var trips = tripsOfInvoice(p, inv.id), tot = sum(trips, function (x) { return x.amount; });
      inv.receipts.forEach(function (r) {
        if (r.driver) return; // collected by a driver: it is cash in the box only when handed over
        if (!trips.length || !(tot > 0)) { add(r.date, 'in', r.amount, 0, 0, (inv.customer || '') + ' ' + (inv.no || ''), 'receipt'); return; }
        var byTruck = {}, order = [], used = 0;
        trips.forEach(function (x) { if (!(x.truck in byTruck)) { byTruck[x.truck] = 0; order.push(x.truck); } byTruck[x.truck] += x.amount; });
        order.forEach(function (tid, i) {
          var share = i === order.length - 1 ? round2(r.amount - used) : round2(r.amount * byTruck[tid] / tot);
          used = round2(used + share);
          add(r.date, 'in', share, tid, 0, (inv.customer || '') + ' ' + (inv.no || ''), 'receipt');
        });
      });
    });
    p.bills.forEach(function (b) {
      b.payments.forEach(function (x) { add(x.date, 'out', x.amount, b.truck, 0, [b.supplier, b.desc].filter(Boolean).join(' · '), 'bill'); });
    });
    projectBooks(state, p.id).forEach(function (bk) {
      bk.entries.forEach(function (e) {
        if (e.moveId || e.billId || e.invoiceId) return;
        add(e.date, e.type, e.amount, e.truck, 0, [e.category, e.party].filter(Boolean).join(' · '), 'book');
      });
    });
    (p.cash || []).forEach(function (c) {
      var dir = CASH_MOVES[c.kind];
      if (dir) add(c.date, dir, c.amount, c.truck, c.driver, c.note, c.kind, c);
    });
    lines.sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
    return lines;
  }
  /* in / out / net per truck (plus truck 0 for lines without a truck) for a date range. */
  function truckCash(state, p, from, to) {
    var rows = {}, order = [];
    function row(id) { return rows[id] || (rows[id] = { truck: id, inn: 0, out: 0, net: 0 }); }
    p.trucks.forEach(function (x) { row(x.id); order.push(x.id); });
    var lines = cashLines(state, p, from, to);
    lines.forEach(function (l) {
      var tid = rows[l.truck] ? l.truck : 0, r = row(tid);
      if (l.dir === 'in') r.inn = round2(r.inn + l.amount); else r.out = round2(r.out + l.amount);
    });
    if (rows[0]) order.push(0);
    order.forEach(function (id) { rows[id].net = round2(rows[id].inn - rows[id].out); });
    return order.map(function (id) { return rows[id]; });
  }
  /* cash balance of the linked cash books up to a date */
  function cashOnHand(state, p, upTo) {
    var bal = 0;
    projectBooks(state, p.id).forEach(function (bk) {
      bk.entries.forEach(function (e) { if (!upTo || e.date <= upTo) bal += e.type === 'in' ? e.amount : -e.amount; });
    });
    return round2(bal);
  }
  function cashCsv(state, p) {
    var rows = [['Date', 'In/Out', 'Amount', 'Truck', 'Driver', 'Type', 'Details']];
    cashLines(state, p).forEach(function (l) {
      rows.push([l.date, l.dir, l.amount.toFixed(2), truckName(p, l.truck), (p.workers.filter(function (w) { return w.id === l.driver; })[0] || {}).name || '', l.kind, l.label]);
    });
    return '﻿' + rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
  }


  /* ---------- financial statements ---------- */
  function dayDiff(a, b) { // whole days from a to b (YYYY-MM-DD)
    var x = a.split('-'), y = b.split('-');
    return Math.round((Date.UTC(+y[0], +y[1] - 1, +y[2]) - Date.UTC(+x[0], +x[1] - 1, +x[2])) / 86400000);
  }
  function inRange(d, from, to) { return (!from || d >= from) && (!to || d <= to); }
  /* what the owner owes one driver in wages at a date: salary earned + unpaid work days - wages paid - deductions (never below 0) */
  function wagesOwedAt(p, workerId, asOf) {
    var o = 0;
    (p.cash || []).forEach(function (c) {
      if (c.driver !== workerId || c.date > asOf) return;
      if (c.kind === 'salary') o += c.amount; else if (c.kind === 'pay' || c.kind === 'deduct') o -= c.amount;
    });
    p.attendance.forEach(function (x) { if (x.workerId === workerId && !x.paid && x.date <= asOf) o += x.days * x.rate; });
    return Math.max(0, round2(o));
  }
  function allWagesOwedAt(p, asOf) { return round2(sum(p.workers, function (w) { return wagesOwedAt(p, w.id, asOf); })); }
  /* Profit and loss for a period: trips by trip date, costs by bill / payment date. */
  function incomeStatement(state, p, from, to) {
    var trips = p.trips.filter(function (x) { return inRange(x.date, from, to); });
    var items = costItems(state, p).filter(function (c) { return inRange(c.date, from, to); });
    var byCode = {}, byTruck = {}, revenue = 0, cost = 0;
    function tr(id) { id = p.trucks.some(function (x) { return x.id === id; }) ? id : 0; return byTruck[id] || (byTruck[id] = { truck: id, trips: 0, revenue: 0, cost: 0, profit: 0 }); }
    var byType = {};
    trips.forEach(function (x) { revenue += x.amount; var r = tr(x.truck); r.revenue += x.amount; r.trips++; var wt = workType(x), b = byType[wt] || (byType[wt] = { type: wt, count: 0, qty: 0, amount: 0 }); b.count++; b.qty += x.qty; b.amount += x.amount; });
    items.forEach(function (c) { cost += c.amount; byCode[c.code] = (byCode[c.code] || 0) + c.amount; tr(c.truck).cost += c.amount; });
    var rows;
    // wages earned in the period but not yet paid (wages that are paid already count as costs above)
    var accrual = round2(allWagesOwedAt(p, to || '9999-12-31') - (from ? allWagesOwedAt(p, addDaysStr(from, -1)) : 0));
    if (accrual) { cost += accrual; byCode.wages_accrued = accrual; tr(0).cost += accrual; }
    rows = Object.keys(byTruck).map(function (k) { var r = byTruck[k]; r.revenue = round2(r.revenue); r.cost = round2(r.cost); r.profit = round2(r.revenue - r.cost); return r; })
      .sort(function (a, b) { return (a.truck === 0) - (b.truck === 0) || b.profit - a.profit; });
    revenue = round2(revenue); cost = round2(cost);
    var typeRows = WORK_TYPES.filter(function (k) { return byType[k]; }).map(function (k) { var b = byType[k]; return { type: k, count: b.count, qty: round3(b.qty), amount: round2(b.amount) }; });
    return { from: from, to: to, trips: trips.length, revenue: revenue, byType: typeRows, byCode: Object.keys(byCode).map(function (k) { return { code: k, amount: round2(byCode[k]) }; }).sort(function (a, b) { return b.amount - a.amount; }),
      cost: cost, profit: round2(revenue - cost), margin: revenue > 0 ? round2((revenue - cost) / revenue * 100) : 0, byTruck: rows };
  }
  /* Cash flow: money that moved in or out of the owner's cash box (driver-collected money counts when handed over). */
  function cashFlowStatement(state, p, from, to) {
    var all = cashLines(state, p), opening = 0, ins = {}, outs = {}, collected = 0;
    all.forEach(function (l) { if (from && l.date < from) opening += l.dir === 'in' ? l.amount : -l.amount; });
    all.forEach(function (l) {
      if (!inRange(l.date, from, to)) return;
      var key = l.kind === 'book' ? (l.dir === 'in' ? 'in' : 'out') : l.kind;
      var tgt = l.dir === 'in' ? ins : outs;
      tgt[key] = (tgt[key] || 0) + l.amount;
    });
    p.invoices.forEach(function (inv) { inv.receipts.forEach(function (r) { if (r.driver && inRange(r.date, from, to)) collected += r.amount; }); });
    function list(m, order) { return order.filter(function (k) { return m[k] > 0; }).map(function (k) { return { kind: k, amount: round2(m[k]) }; }); }
    var inRows = list(ins, ['receipt', 'handover', 'return', 'in']), outRows = list(outs, ['bill', 'advance', 'pay', 'out']);
    var tin = round2(sum(inRows, function (r) { return r.amount; })), tout = round2(sum(outRows, function (r) { return r.amount; }));
    opening = round2(opening);
    return { from: from, to: to, opening: opening, inRows: inRows, outRows: outRows, totalIn: tin, totalOut: tout, net: round2(tin - tout), closing: round2(opening + tin - tout),
      collectedByDrivers: round2(collected), booksBalance: cashOnHand(state, p, to) };
  }
  /* Balance sheet at a date. Equity = assets - liabilities (no opening capital is recorded). */
  function balanceSheet(state, p, asOf) {
    var cash = 0;
    cashLines(state, p).forEach(function (l) { if (l.date <= asOf) cash += l.dir === 'in' ? l.amount : -l.amount; });
    var held = 0, reimburse = 0, wagesOwed = 0, drivers = [];
    p.workers.forEach(function (w) {
      var h = 0;
      (p.cash || []).forEach(function (c) {
        if (c.driver !== w.id || c.date > asOf) return;
        if (c.kind === 'advance') h += c.amount;
        else if (c.kind === 'return' || c.kind === 'spent' || c.kind === 'handover') h -= c.amount;
      });
      p.invoices.forEach(function (inv) { inv.receipts.forEach(function (r) { if (r.driver === w.id && r.date <= asOf) h += r.amount; }); });
      h = round2(h);
      var owed = wagesOwedAt(p, w.id, asOf);
      if (h > 0) held += h; else reimburse -= h;
      wagesOwed += owed;
      if (h || owed) drivers.push({ id: w.id, name: w.name, held: h, owed: owed });
    });
    var receivables = 0, unbilled = 0, payables = 0, invDate = {};
    p.invoices.forEach(function (inv) {
      invDate[inv.id] = inv.date;
      if (inv.date > asOf) return;
      var gross = sum(tripsOfInvoice(p, inv.id), function (x) { return x.amount; });
      var got = sum(inv.receipts.filter(function (r) { return r.date <= asOf; }), function (r) { return r.amount; });
      receivables += Math.max(0, gross - got);
    });
    p.trips.forEach(function (x) { if (x.date <= asOf && (!x.invoiceId || !invDate[x.invoiceId] || invDate[x.invoiceId] > asOf)) unbilled += x.amount; });
    p.bills.forEach(function (b) {
      if (b.date > asOf) return;
      var paid = sum(b.payments.filter(function (x) { return x.date <= asOf; }), function (x) { return x.amount; });
      payables += Math.max(0, b.amount - paid);
    });
    var A = [['cash', cash], ['held', held], ['receivables', receivables], ['unbilled', unbilled]].map(function (x) { return { key: x[0], amount: round2(x[1]) }; });
    var Lb = [['payables', payables], ['wagesOwed', wagesOwed], ['reimburse', reimburse]].map(function (x) { return { key: x[0], amount: round2(x[1]) }; });
    var ta = round2(sum(A, function (x) { return x.amount; })), tl = round2(sum(Lb, function (x) { return x.amount; }));
    return { asOf: asOf, assets: A, liabilities: Lb, totalAssets: ta, totalLiabilities: tl, equity: round2(ta - tl), drivers: drivers };
  }
  /* Ageing of what customers owe you and what you owe suppliers, by days past the due date. */
  var AGE_BUCKETS = ['notdue', 'd30', 'd60', 'd90', 'd90p'];
  function ageBucket(days) { return days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4; }
  function agingReport(p, asOf) {
    function build(items) {
      var map = {}, order = [], tot = [0, 0, 0, 0, 0];
      items.forEach(function (it) {
        if (!(it.amount > 0.004)) return;
        var k = it.name || '—';
        if (!map[k]) { map[k] = { name: k, b: [0, 0, 0, 0, 0], total: 0 }; order.push(k); }
        var i = ageBucket(dayDiff(it.due, asOf));
        map[k].b[i] += it.amount; map[k].total += it.amount; tot[i] += it.amount;
      });
      var rows = order.map(function (k) { var r = map[k]; r.b = r.b.map(round2); r.total = round2(r.total); return r; }).sort(function (a, b) { return b.total - a.total; });
      return { rows: rows, totals: tot.map(round2), total: round2(sum(tot, function (x) { return x; })) };
    }
    var rec = [], pay = [];
    p.invoices.forEach(function (inv) {
      var bal = invoiceCalc(p, inv).balance;
      rec.push({ name: inv.customer, amount: bal, due: inv.due || addDaysStr(inv.date, p.payDays || 30) });
    });
    p.bills.forEach(function (b) {
      var left = round2(b.amount - sum(b.payments, function (x) { return x.amount; }));
      pay.push({ name: b.supplier, amount: left, due: b.due || b.date });
    });
    return { asOf: asOf, receivables: build(rec), payables: build(pay) };
  }

  function projectSummary(state, projectId) {
    var p = null;
    state.projects.forEach(function (x) { if (x.id === projectId) p = x; });
    if (!p) return null;

    var costByCode = {};
    CODES.forEach(function (c) { costByCode[c] = 0; });
    costItems(state, p).forEach(function (c) { costByCode[c.code] = round2(costByCode[c.code] + c.amount); });
    var costTotal = sum(CODES, function (c) { return costByCode[c]; });
    var billsTotal = sum(p.bills, function (b) { return b.amount; });
    var billsPaid = sum(p.bills, function (b) { return billPaid(b); });
    var calcs = p.invoices.map(function (c) { return invoiceCalc(p, c); });
    var income = sum(p.trips, function (x) { return x.amount; });
    var unbilled = unbilledTrips(p);
    var wagesUnpaid = sum(p.attendance, function (a) { return a.paid ? 0 : a.days * a.rate; });
    var invoiced = sum(calcs, function (c) { return c.gross; });
    var outstanding = sum(calcs, function (c) { return c.balance; });

    return {
      trucks: p.trucks.length, activeTrucks: p.trucks.filter(function (x) { return x.active; }).length,
      trips: p.trips.length,
      income: income,
      invoiced: invoiced, invoicedTotal: sum(calcs, function (c) { return c.total; }),
      unbilled: sum(unbilled, function (x) { return x.amount; }), unbilledCount: unbilled.length,
      vatTotal: sum(calcs, function (c) { return c.vat; }), whtTotal: sum(calcs, function (c) { return c.wht; }),
      received: sum(calcs, function (c) { return c.received; }),
      customerOutstanding: outstanding,
      costByCode: costByCode, costTotal: costTotal,
      billsTotal: billsTotal, billsPaid: billsPaid, billsOutstanding: round2(billsTotal - billsPaid),
      wagesUnpaid: wagesUnpaid,
      owed: round2(billsTotal - billsPaid + wagesUnpaid),
      profit: round2(income - costTotal),
      margin: income > 0 ? Math.round((income - costTotal) / income * 1000) / 10 : 0
    };
  }

  /* Per truck: trips, income, costs (bills and cash-outs tagged with the truck), profit. Costs with no truck are
     returned as `shared`. */

  /* The capacity text of a truck ("30 t", "12 m3") as a number, but only when it is in the same unit as the load (ton or m3), else 0. */
  function capacityFor(truck, unit) {
    if (!truck || !truck.capacity) return 0;
    var txt = String(truck.capacity).toLowerCase().replace(',', '.'), m = txt.match(/(\d+(\.\d+)?)/);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    if (unit === 'm3' && /m\s*[3³]|cubic|cbm/.test(txt)) return n;
    if (unit === 'ton' && /(^|[\d\s])(t|ton|tons|tonne|tonnes|qt|quintal)\b/.test(txt) && !/m\s*[3³]/.test(txt)) return /qt|quintal/.test(txt) ? n / 10 : n;
    return 0;
  }
  /* Fuel fills of one truck, oldest first, with price per litre and (when odometer readings exist) litres per 100 km. */
  function fuelReport(state, p, truckId) {
    var fills = p.bills.filter(function (b) { return b.code === 'fuel' && b.truck === truckId && b.litres > 0; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
    var prev = null, litres = 0, amount = 0, km = 0, litresKm = 0;
    var rows = fills.map(function (b) {
      var r = { date: b.date, litres: b.litres, amount: b.amount, price: round2(b.amount / b.litres), odo: b.odo, km: 0, per100: 0 };
      litres += b.litres; amount += b.amount;
      if (prev && b.odo > 0 && prev.odo > 0 && b.odo > prev.odo) {
        r.km = b.odo - prev.odo; r.per100 = round2(b.litres / r.km * 100); // this fill refills what the last stretch used
        km += r.km; litresKm += b.litres;
      }
      if (b.odo > 0) prev = b;
      return r;
    });
    return { rows: rows, litres: round3(litres), amount: round2(amount), avgPrice: litres > 0 ? round2(amount / litres) : 0,
      lastPrice: rows.length ? rows[rows.length - 1].price : 0, firstPrice: rows.length ? rows[0].price : 0,
      per100: km > 0 ? round2(litresKm / km * 100) : 0, km: km, costPerKm: km > 0 ? round2(sum(rows.filter(function (r) { return r.km > 0; }), function (r) { return r.amount; }) / km) : 0 };
  }
  function truckStats(state, projectId) {
    var p = null;
    state.projects.forEach(function (x) { if (x.id === projectId) p = x; });
    if (!p) return { rows: [], shared: 0 };
    var rows = {}, order = [];
    p.trucks.forEach(function (x) {
      rows[x.id] = { truck: x, trips: 0, qty: 0, income: 0, cost: 0, fuel: 0, litres: 0, repairs: 0, profit: 0, unbilled: 0 };
      order.push(x.id);
    });
    p.trips.forEach(function (x) {
      var r = rows[x.truck];
      if (!r) return;
      r.trips++; r.income = round2(r.income + x.amount);
      if (!x.invoiceId) r.unbilled = round2(r.unbilled + x.amount);
    });
    var shared = 0;
    costItems(state, p).forEach(function (c) {
      var r = rows[c.truck];
      if (!r) { shared = round2(shared + c.amount); return; }
      r.cost = round2(r.cost + c.amount);
      if (c.code === 'fuel') { r.fuel = round2(r.fuel + c.amount); r.litres = round3(r.litres + (c.litres || 0)); }
      if (c.code === 'repairs' || c.code === 'spares' || c.code === 'tyres') r.repairs = round2(r.repairs + c.amount);
    });
    var out = order.map(function (id) { var r = rows[id]; r.profit = round2(r.income - r.cost); return r; });
    return { rows: out, shared: shared };
  }

  /* Customers: billed, received and still owed, plus work not yet on an invoice (largest balance first). */
  function customerBalances(project) {
    var map = {};
    function get(k) { return map[k] || (map[k] = { customer: k, invoiced: 0, received: 0, balance: 0, unbilled: 0, trips: 0 }); }
    project.invoices.forEach(function (c) {
      var cc = invoiceCalc(project, c), r = get(c.customer || '');
      r.invoiced = round2(r.invoiced + cc.total);
      r.received = round2(r.received + cc.received + cc.taxSettled);
      r.balance = round2(r.balance + cc.balance);
    });
    project.trips.forEach(function (x) {
      var r = get(x.customer || '');
      r.trips++;
      if (!x.invoiceId) r.unbilled = round2(r.unbilled + x.amount);
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (r) { return r.balance > 0 || r.unbilled > 0; })
      .sort(function (a, b) { return b.balance + b.unbilled - (a.balance + a.unbilled); });
  }
  function customerNames(project) {
    var seen = {}, out = [];
    project.trips.forEach(function (x) { if (x.customer && !seen[x.customer]) { seen[x.customer] = 1; out.push(x.customer); } });
    project.invoices.forEach(function (c) { if (c.customer && !seen[c.customer]) { seen[c.customer] = 1; out.push(c.customer); } });
    return out.sort();
  }
  /* Invoices and receipts of one customer, oldest first, with a running balance (what they owe you). */
  function customerStatement(project, customer) {
    var ev = [];
    project.invoices.forEach(function (c) {
      if ((c.customer || '') !== (customer || '')) return;
      var cc = invoiceCalc(project, c);
      ev.push({ date: c.date, kind: 'invoice', text: c.no || '', amount: cc.total, order: c.id });
      c.receipts.forEach(function (p) { ev.push({ date: p.date, kind: 'pay', text: c.no || '', amount: p.amount, order: p.id }); });
      if (cc.taxSettled > 0) ev.push({ date: c.date, kind: 'tax', text: c.no || '', amount: cc.taxSettled, order: c.id + 0.5 });
    });
    ev.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'invoice' ? -1 : 1) - (b.kind === 'invoice' ? -1 : 1) || a.order - b.order; });
    var bal = 0, billed = 0, paid = 0;
    ev.forEach(function (e) {
      if (e.kind === 'invoice') { bal = round2(bal + e.amount); billed = round2(billed + e.amount); } else { bal = round2(bal - e.amount); paid = round2(paid + e.amount); }
      e.balance = bal;
    });
    return { rows: ev, billed: billed, paid: paid, balance: bal, unbilled: sum(unbilledTrips(project, customer || ''), function (x) { return x.amount; }) };
  }

  /* Outstanding amount per supplier across a fleet's bills (largest first). */
  function supplierBalances(project) {
    var map = {};
    project.bills.forEach(function (b) {
      var key = b.supplier || '';
      map[key] = round2((map[key] || 0) + billBalance(b));
    });
    return Object.keys(map).map(function (k) { return { supplier: k, balance: map[k] }; })
      .filter(function (x) { return x.balance > 0; })
      .sort(function (a, b) { return b.balance - a.balance; });
  }

  /* Unpaid attendance in [from, to], grouped by worker. */
  function payroll(project, from, to) {
    var byWorker = {};
    project.attendance.forEach(function (a) {
      if (a.paid || a.days <= 0 || a.date < from || a.date > to) return;
      var r = byWorker[a.workerId] || (byWorker[a.workerId] = { workerId: a.workerId, days: 0, amount: 0 });
      r.days = round2(r.days + a.days);
      r.amount = round2(r.amount + a.days * a.rate);
    });
    var rows = [];
    project.workers.forEach(function (w) {
      var r = byWorker[w.id];
      if (r) rows.push({ workerId: w.id, name: w.name, days: r.days, amount: r.amount });
    });
    return { rows: rows, total: sum(rows, function (r) { return r.amount; }) };
  }

  function markPaid(project, from, to) {
    var n = 0;
    project.attendance.forEach(function (a) {
      if (!a.paid && a.days > 0 && a.date >= from && a.date <= to) { a.paid = true; n++; }
    });
    return n;
  }

  /* Monday..Sunday week containing the given date. */
  function weekRange(dateStr) {
    var d = new Date(dateStr + 'T00:00:00Z');
    var dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    var start = new Date(d.getTime() - dow * 86400000);
    var end = new Date(start.getTime() + 6 * 86400000);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }

  /* Trips filtered by truck / customer / dates / billed state, oldest first. */
  function filterTrips(project, f) {
    f = f || {};
    return project.trips.filter(function (x) {
      if (f.truck && x.truck !== f.truck) return false;
      if (f.customer != null && f.customer !== '' && x.customer !== f.customer) return false;
      if (f.from && x.date < f.from) return false;
      if (f.to && x.date > f.to) return false;
      if (f.billed === 'no' && x.invoiceId) return false;
      if (f.billed === 'yes' && !x.invoiceId) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
  }
  function truckName(project, id) {
    var r = project.trucks.filter(function (x) { return x.id === id; })[0];
    return r ? r.plate : '';
  }
  function tripsCsv(project) {
    var rows = [['Date', 'Truck', 'Driver', 'Customer', 'From', 'To', 'Material', 'Ticket', 'Qty', 'Unit', 'Rate', 'Amount', 'Invoice']];
    var dn = {};
    project.workers.forEach(function (w) { dn[w.id] = w.name; });
    var inv = {};
    project.invoices.forEach(function (c) { inv[c.id] = c.no || ''; });
    filterTrips(project, {}).forEach(function (x) {
      rows.push([x.date, truckName(project, x.truck), dn[x.driver] || '', x.customer, x.from, x.to, x.material, x.ticket, String(x.qty), x.unit, x.rate.toFixed(2), x.amount.toFixed(2), x.invoiceId ? inv[x.invoiceId] || '#' : '']);
    });
    return rowsToCsv(rows);
  }

  function projectReportCsv(state, projectId) {
    var p = null;
    state.projects.forEach(function (x) { if (x.id === projectId) p = x; });
    var s = projectSummary(state, projectId);
    if (!p || !s) return '';
    var rows = [['Cost type', 'Amount']];
    CODES.forEach(function (c) { rows.push([c, s.costByCode[c].toFixed(2)]); });
    rows.push(['TOTAL COST', s.costTotal.toFixed(2)]);
    rows.push([]);
    rows.push(['Truck', 'Trips', 'Income', 'Cost', 'Profit']);
    var ts = truckStats(state, projectId);
    ts.rows.forEach(function (r) { rows.push([r.truck.plate, String(r.trips), r.income.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2)]); });
    if (ts.shared > 0) rows.push(['(costs not tagged to a truck)', '', '', ts.shared.toFixed(2), (-ts.shared).toFixed(2)]);
    rows.push([]);
    rows.push(['Income from trips', s.income.toFixed(2)]);
    rows.push(['Invoiced (before VAT)', s.invoiced.toFixed(2)]);
    rows.push(['Not yet invoiced', s.unbilled.toFixed(2)]);
    rows.push(['Received from customers', s.received.toFixed(2)]);
    rows.push(['Due from customers', s.customerOutstanding.toFixed(2)]);
    rows.push(['Owed to suppliers and drivers', s.owed.toFixed(2)]);
    rows.push(['Income minus cost', s.profit.toFixed(2)]);
    return rowsToCsv(rows);
  }


  /* Calculator: + - * / (also x, ×, ÷, −), brackets, decimals, unary minus, and "%" after a number. NaN when it does not make sense. */
  function calcEval(text) {
    var src = String(text == null ? '' : text).replace(/×|x|X/g, '*').replace(/÷/g, '/').replace(/−|–/g, '-').replace(/,/g, '').replace(/\s+/g, '');
    var i = 0;
    if (!src || src.length > 200 || /[^0-9+\-*\/().%]/.test(src)) return NaN;
    function num() {
      var m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) return NaN;
      i += m[1].length;
      var v = parseFloat(m[1]);
      while (src.charAt(i) === '%') { v = v / 100; i++; }
      return v;
    }
    function factor() {
      var c = src.charAt(i);
      if (c === '-') { i++; return -factor(); }
      if (c === '+') { i++; return factor(); }
      if (c === '(') {
        i++;
        var v = expr();
        if (src.charAt(i) !== ')') return NaN;
        i++;
        while (src.charAt(i) === '%') { v = v / 100; i++; }
        return v;
      }
      return num();
    }
    function term() {
      var v = factor();
      while (i < src.length && (src.charAt(i) === '*' || src.charAt(i) === '/')) {
        var op = src.charAt(i++), r = factor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      var v = term();
      while (i < src.length && (src.charAt(i) === '+' || src.charAt(i) === '-')) {
        var op = src.charAt(i++), r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    var out = expr();
    if (i !== src.length || !isFinite(out)) return NaN;
    return Math.round(out * 1e8) / 1e8;
  }

  /* ---------- statements ---------- */
  /* All bills and payments of one supplier, oldest first, with a running balance (what you owe). */
  function supplierStatement(project, supplier) {
    var ev = [];
    project.bills.forEach(function (b) {
      if ((b.supplier || '') !== (supplier || '')) return;
      ev.push({ date: b.date, kind: 'bill', text: b.desc || '', amount: b.amount, order: b.id });
      b.payments.forEach(function (p) { ev.push({ date: p.date, kind: 'pay', text: b.desc || '', amount: p.amount, order: p.id }); });
    });
    ev.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'bill' ? -1 : 1) - (b.kind === 'bill' ? -1 : 1) || a.order - b.order; });
    var bal = 0, billed = 0, paid = 0;
    ev.forEach(function (e) {
      if (e.kind === 'bill') { bal = round2(bal + e.amount); billed = round2(billed + e.amount); } else { bal = round2(bal - e.amount); paid = round2(paid + e.amount); }
      e.balance = bal;
    });
    return { rows: ev, billed: billed, paid: paid, balance: bal };
  }
  function supplierNames(project) {
    var seen = {}, out = [];
    project.bills.forEach(function (b) { var k = b.supplier || ''; if (!seen[k]) { seen[k] = 1; out.push(k); } });
    return out.sort();
  }
  /* A worker's days and wages between two dates (all dates when empty). */
  function workerStatement(project, workerId, from, to) {
    var rows = project.attendance.filter(function (a) {
      return a.workerId === workerId && (!from || a.date >= from) && (!to || a.date <= to);
    }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; }).map(function (a) {
      return { date: a.date, days: a.days, rate: a.rate, amount: round2(a.days * a.rate), paid: a.paid };
    });
    return { rows: rows, days: sum(rows, function (r) { return r.days; }), earned: round2(sum(rows, function (r) { return r.amount; })),
      paid: round2(sum(rows, function (r) { return r.paid ? r.amount : 0; })), unpaid: round2(sum(rows, function (r) { return r.paid ? 0 : r.amount; })) };
  }
  /* ---------- search ---------- */
  function searchAll(state, query, limit) {
    var q = String(query || '').trim().toLowerCase(), max = limit || 8, out = { entries: [], bills: [], invoices: [], contacts: [], trips: [], trucks: [] };
    if (q.length < 2) return out;
    function has() { for (var i = 0; i < arguments.length; i++) if (String(arguments[i] == null ? '' : arguments[i]).toLowerCase().indexOf(q) >= 0) return true; return false; }
    state.books.forEach(function (b) {
      b.entries.forEach(function (e) {
        if (out.entries.length < max * 3 && has(e.note, e.category, e.party, e.amount, e.date)) out.entries.push({ bookId: b.id, book: b.name, entry: e });
      });
    });
    state.projects.forEach(function (p) {
      p.bills.forEach(function (b) { if (out.bills.length < max && has(b.supplier, b.desc, b.amount)) out.bills.push({ projectId: p.id, project: p.name, bill: b }); });
      p.invoices.forEach(function (c) { if (out.invoices.length < max && has(c.no, c.customer, c.date)) out.invoices.push({ projectId: p.id, project: p.name, invoice: c }); });
      p.trips.forEach(function (x) { if (out.trips.length < max && has(x.customer, x.from, x.to, x.material, x.ticket, x.date, x.note, truckName(p, x.truck))) out.trips.push({ projectId: p.id, project: p.name, trip: x, plate: truckName(p, x.truck) }); });
      p.trucks.forEach(function (x) { if (out.trucks.length < max && has(x.plate, x.model, x.note)) out.trucks.push({ projectId: p.id, project: p.name, truck: x }); });
    });
    state.contacts.forEach(function (c) { if (out.contacts.length < max && has(c.name, c.phone, c.email, c.company, c.note)) out.contacts.push(c); });
    out.entries = out.entries.slice(0, max * 3);
    return out;
  }

  function addDaysStr(date, n) {
    var d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  /* Money expected in and owed out. Invoices: the due date, else sent date + the customer's payment days.
     Bills: the due date. Drivers' unpaid wages are owed now. `horizon` = days ahead that count as "coming". */
  function cashForecast(state, today, horizon) {
    horizon = horizon || 30;
    var end = addDaysStr(today, horizon), inc = [], out = [];
    state.projects.forEach(function (p) {
      p.invoices.forEach(function (c) {
        var cc = invoiceCalc(p, c), st = invoiceStatus(c, cc);
        if (cc.balance <= 0 || st === 'paid') return;
        var exp = invoiceExpected(p, c);
        inc.push({ projectId: p.id, project: p.name, id: c.id, who: [c.customer, c.no].filter(Boolean).join(' · '), status: st, amount: cc.balance, date: exp, overdue: !!exp && exp < today, soon: !!exp && exp >= today && exp <= end });
      });
      p.bills.forEach(function (b) {
        var bal = billBalance(b);
        if (bal <= 0) return;
        out.push({ projectId: p.id, project: p.name, id: b.id, who: b.supplier, desc: b.desc, amount: bal, date: b.due || '', overdue: !!b.due && b.due < today, soon: !!b.due && b.due >= today && b.due <= end });
      });
      var wages = sum(p.attendance, function (a) { return a.paid ? 0 : a.days * a.rate; });
      if (wages > 0) out.push({ projectId: p.id, project: p.name, id: 0, who: '', desc: 'wages', wages: true, amount: round2(wages), date: today, overdue: false, soon: true });
    });
    function by(a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : b.amount - a.amount; }
    inc.sort(by); out.sort(by);
    function tot(list, f) { return round2(sum(list.filter(f), function (x) { return x.amount; })); }
    var t = {
      inOverdue: tot(inc, function (x) { return x.overdue; }), inSoon: tot(inc, function (x) { return x.soon; }),
      inLater: tot(inc, function (x) { return !x.overdue && !x.soon && x.date; }), inUnknown: tot(inc, function (x) { return !x.date; }),
      outOverdue: tot(out, function (x) { return x.overdue; }), outSoon: tot(out, function (x) { return x.soon; }),
      outLater: tot(out, function (x) { return !x.overdue && !x.soon && x.date; }), outUnknown: tot(out, function (x) { return !x.date; })
    };
    t.inAll = round2(t.inOverdue + t.inSoon + t.inLater + t.inUnknown);
    t.outAll = round2(t.outOverdue + t.outSoon + t.outLater + t.outUnknown);
    t.net = round2(t.inOverdue + t.inSoon - t.outOverdue - t.outSoon);
    return { incoming: inc, outgoing: out, totals: t, horizon: horizon };
  }

  return {
    rowsToCsv: rowsToCsv, supplierStatement: supplierStatement, supplierNames: supplierNames, workerStatement: workerStatement, searchAll: searchAll,
    cashForecast: cashForecast,
    calcEval: calcEval,
    MODES: MODES, KINDS: KINDS, STAFF_ROLES: STAFF_ROLES,
    sanitizeContact: sanitizeContact, sanitizeBusiness: sanitizeBusiness, contactBalances: contactBalances,
    rangeEntries: rangeEntries, reminders: reminders,
    LANGS: LANGS, CURRENCIES: CURRENCIES, THEMES: THEMES, CALENDARS: CALENDARS, CODES: CODES, UNITS: UNITS, WORK_TYPES: WORK_TYPES, WORK_UNIT: WORK_UNIT, workType: workType,
    newId: newId, todayStr: todayStr, isDate: isDate, round2: round2, round3: round3, round6: round6,
    sanitizeEntry: sanitizeEntry, sanitizeState: sanitizeState, defaultState: defaultState, migrateOld: migrateOld,
    sanitizeProject: sanitizeProject, sanitizeBill: sanitizeBill, sanitizeInvoice: sanitizeInvoice, sanitizeTruck: sanitizeTruck, sanitizeTrip: sanitizeTrip,
    sanitizeWorker: sanitizeWorker, sanitizeAttendance: sanitizeAttendance, sanitizePayment: sanitizePayment,
    incomeStatement: incomeStatement, cashFlowStatement: cashFlowStatement, balanceSheet: balanceSheet, agingReport: agingReport, AGE_BUCKETS: AGE_BUCKETS, dayDiff: dayDiff,
    capacityFor: capacityFor, fuelReport: fuelReport,
    sanitizeCash: sanitizeCash, CASH_KINDS: CASH_KINDS, CASH_MOVES: CASH_MOVES, driverAccount: driverAccount, cashLines: cashLines, truckCash: truckCash, cashOnHand: cashOnHand, cashCsv: cashCsv,
    hashPin: hashPin, newSalt: newSalt, validPin: validPin,
    buildCsv: buildCsv, parseCsv: parseCsv, entriesFromCsv: entriesFromCsv,
    totals: totals, filterEntries: filterEntries, monthOf: monthOf,
    monthTotals: monthTotals, categoryTotals: categoryTotals, shiftMonth: shiftMonth, lastMonths: lastMonths,
    billPaid: billPaid, billBalance: billBalance, invoiceReceived: invoiceReceived, invoiceCalc: invoiceCalc, invoiceStatus: invoiceStatus, invoiceExpected: invoiceExpected,
    nextInvoiceNo: nextInvoiceNo, unbilledTrips: unbilledTrips, tripsOfInvoice: tripsOfInvoice,
    projectBooks: projectBooks, projectSummary: projectSummary, truckStats: truckStats, supplierBalances: supplierBalances,
    customerBalances: customerBalances, customerNames: customerNames, customerStatement: customerStatement,
    filterTrips: filterTrips, truckName: truckName, tripsCsv: tripsCsv, rateStr: rateStr,
    payroll: payroll, markPaid: markPaid, weekRange: weekRange, projectReportCsv: projectReportCsv,
    projectRecords: projectRecords, applyProjectRecords: applyProjectRecords, sanitizeProjSync: sanitizeProjSync, INVOICE_STATUSES: INVOICE_STATUSES, photoIds: photoIds,
    TRASH_DAYS: TRASH_DAYS, sanitizeTrash: sanitizeTrash, trashPhotoIds: trashPhotoIds, trashRestoreItem: trashRestoreItem
  };
});
