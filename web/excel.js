/* Excel (.xlsx) exports: a customer invoice (its trips, receipts and balance) and a trips sheet,
   both with live formulas that carry cached values. Also a date-range cash report workbook.
   Pure functions: no DOM access. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'), require('./xlsx.js'));
  else root.CBExcel = factory(root.CBLogic, root.CBXlsx);
})(this, function (L, X) {
  'use strict';

  var r2 = L.round2;
  var MONEY = '#,##0.00';
  var QTY = '#,##0.00#';

  /* ---------- styles ---------- */
    function st(o, base) { var r = {}; Object.keys(base || {}).forEach(function (k) { r[k] = base[k]; }); Object.keys(o || {}).forEach(function (k) { r[k] = o[k]; }); return r; }
  var HEAD_FILL = 'D9D9D9', SEC_FILL = 'F2F2F2';


  /* ---------- trips table shared by the invoice and trips sheets ---------- */
  var HS = { b: true, border: 'thin', fill: HEAD_FILL, h: 'center' };
  var CELL = { border: 'thin' }, NUM = { border: 'thin', fmt: MONEY, h: 'right' }, QNUM = { border: 'thin', fmt: QTY, h: 'right' };
  var BOLD_NUM = st({ b: true }, NUM);

  /* Header row + one row per trip (Amount = Qty x Rate as a live formula). Returns { rows, first, last }. */
  function tripRows(p, trips, startRow, withInvoice) {
    var rows = [];
    var heads = ['Date', 'Truck', 'Driver', 'Customer', 'From', 'To', 'Material', 'Ticket', 'Qty', 'Unit', 'Rate', 'Amount'];
    if (withInvoice) heads.push('Invoice');
    rows.push(heads.map(function (h) { return { v: h, s: HS }; }));
    var dn = {}, inv = {};
    p.workers.forEach(function (w) { dn[w.id] = w.name; });
    p.invoices.forEach(function (c) { inv[c.id] = c.no || ''; });
    trips.forEach(function (x, k) {
      var r = startRow + 1 + k;
      var line = [
        { v: x.date, s: CELL }, { v: L.truckName(p, x.truck), s: CELL }, { v: dn[x.driver] || '', s: CELL }, { v: x.customer, s: CELL },
        { v: x.from, s: CELL }, { v: x.to, s: CELL }, { v: x.material, s: CELL }, { v: x.ticket, s: CELL },
        { v: x.qty, s: QNUM }, { v: x.unit, s: CELL }, { v: x.rate, s: NUM },
        { f: 'I' + r + '*K' + r, v: x.amount, s: NUM }
      ];
      if (withInvoice) line.push({ v: x.invoiceId ? inv[x.invoiceId] || '#' : '', s: CELL });
      rows.push(line);
    });
    return { rows: rows, first: startRow + 1, last: startRow + trips.length };
  }
  var TRIP_COLS = [12, 12, 16, 22, 16, 16, 14, 9, 9, 8, 12, 14, 10];

  function prep(p) {
    // normalise a fleet so the builders can rely on every field being present
    return L.sanitizeProject(JSON.parse(JSON.stringify(p)), 1);
  }

  /* One customer invoice: its trips, receipts and the balance, with live formulas. */
  function invoiceWorkbook(project, invoiceId) {
    var p = prep(project), inv = null;
    p.invoices.forEach(function (c) { if (c.id === invoiceId) inv = c; });
    if (!inv) return null;
    var k = L.invoiceCalc(p, inv), trips = L.tripsOfInvoice(p, inv.id).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
    var rows = [];
    rows.push([{ v: 'INVOICE ' + (inv.no || ''), s: { b: true, sz: 16 } }]);
    rows.push([{ v: p.name, s: { b: true } }]);
    rows.push([{ v: 'Owner :' }, { v: p.owner }]);
    rows.push([{ v: 'Customer :' }, { v: inv.customer }]);
    rows.push([{ v: 'Date :' }, { v: inv.date }]);
    rows.push([{ v: 'Due :' }, { v: inv.due || '' }]);
    rows.push([]);
    var tr = tripRows(p, trips, rows.length + 1, false);
    tr.rows.forEach(function (r) { rows.push(r); });
    var first = tr.first, last = Math.max(tr.last, tr.first);
    function lab(text, bold) { return { v: text, s: { b: !!bold, h: 'right' } }; }
    function blanks(n) { var a = []; for (var i = 0; i < n; i++) a.push({}); return a; }
    var r0 = rows.length + 1, work = r0, total = r0 + 1, rec = r0 + 2, bal = r0 + 3;
    rows.push(blanks(10).concat([lab('Work amount'), { f: 'SUM(L' + first + ':L' + last + ')', v: k.gross, s: NUM }]));
    rows.push(blanks(10).concat([lab('Total', true), { f: 'L' + work, v: k.total, s: BOLD_NUM }]));
    rows.push(blanks(10).concat([lab('Received'), { v: k.received, s: NUM }]));
    rows.push(blanks(10).concat([lab('Balance due', true), { f: 'L' + total + '-L' + rec, v: k.balance, s: BOLD_NUM }]));
    return { sheets: [{ name: 'Invoice', cols: TRIP_COLS, rows: rows, landscape: true }] };
  }

  /* Every trip (optionally filtered), with a total row. */
  function tripsWorkbook(project, filter) {
    var p = prep(project);
    var trips = L.filterTrips(p, filter || {});
    var tr = tripRows(p, trips, 1, true);
    var rows = tr.rows.slice();
    var tot = L.round2(trips.reduce(function (a, x) { return a + x.amount; }, 0));
    rows.push([{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { v: 'TOTAL', s: { b: true, border: 'thin', h: 'right' } },
      { f: 'SUM(L2:L' + Math.max(trips.length + 1, 2) + ')', v: tot, s: BOLD_NUM }]);
    return { sheets: [{ name: 'Trips', cols: TRIP_COLS, rows: rows, landscape: true }] };
  }

  /* ---------- date-range report ---------- */
  /* opts: { state, from, to, bookIds, title, labels: {...} } */
  function reportWorkbook(opts) {
    var state = opts.state, list = L.rangeEntries(state, opts.from, opts.to, opts.bookIds);
    var contactName = {};
    state.contacts.forEach(function (c) { contactName[c.id] = c.name; });
    var tot = L.totals(list);
    var hs = { b: true, border: 'thin', fill: HEAD_FILL, h: 'center' };
    var cell = { border: 'thin' }, num = { border: 'thin', fmt: MONEY, h: 'right' };

    var rows = [];
    rows.push([{ v: opts.title || 'TruckBook report', s: { b: true, sz: 16 } }]);
    rows.push([{ v: 'Period: ' + (opts.from || '…') + ' to ' + (opts.to || '…') }]);
    rows.push([]);
    rows.push([{ v: 'Cash in', s: hs }, { v: 'Cash out', s: hs }, { v: 'Balance', s: hs }]);
    rows.push([{ v: tot.cashIn, s: num }, { v: tot.cashOut, s: num }, { v: tot.balance, s: num }]);
    rows.push([]);
    function group(title, keyFn) {
      var m = {};
      list.forEach(function (e) {
        var k = keyFn(e) || '-';
        m[k] = m[k] || { i: 0, o: 0 };
        if (e.type === 'in') m[k].i += e.amount; else m[k].o += e.amount;
      });
      rows.push([{ v: title, s: hs }, { v: 'Cash in', s: hs }, { v: 'Cash out', s: hs }, { v: 'Net', s: hs }]);
      Object.keys(m).sort().forEach(function (k) {
        rows.push([{ v: k, s: cell }, { v: r2(m[k].i), s: num }, { v: r2(m[k].o), s: num }, { v: r2(m[k].i - m[k].o), s: num }]);
      });
      rows.push([]);
    }
    group('Category', function (e) { return e.category; });
    group('Payment mode', function (e) { return e.mode; });
    group('Member', function (e) { return e.by; });
    group('Contact', function (e) { return e.contactId ? contactName[e.contactId] : e.party; });
    group('Book', function (e) { return e.book; });
    var summary = { name: 'Summary', cols: [34, 16, 16, 16], rows: rows };

    var er = [[['Date', 'Book', 'Type', 'Category', 'Contact', 'Mode', 'Member', 'Remark', 'Cash in', 'Cash out', 'Balance']
      .map(function (h) { return { v: h, s: hs }; })][0]];
    var bal = 0;
    list.forEach(function (e, k) {
      bal = r2(bal + (e.type === 'in' ? e.amount : -e.amount));
      var rr = k + 2;
      er.push([
        { v: e.date, s: cell }, { v: e.book, s: cell }, { v: e.type === 'in' ? 'Cash in' : 'Cash out', s: cell },
        { v: e.category, s: cell }, { v: e.contactId ? contactName[e.contactId] || e.party : e.party, s: cell },
        { v: e.mode, s: cell }, { v: e.by, s: cell }, { v: e.note, s: cell },
        e.type === 'in' ? { v: e.amount, s: num } : { s: num },
        e.type === 'out' ? { v: e.amount, s: num } : { s: num },
        { f: 'SUM(I$2:I' + rr + ')-SUM(J$2:J' + rr + ')', v: bal, s: num }
      ]);
    });
    er.push([{ s: cell }, { s: cell }, { s: cell }, { s: cell }, { s: cell }, { s: cell }, { s: cell }, { v: 'TOTAL', s: { b: true, border: 'thin', h: 'right' } },
      { f: 'SUM(I2:I' + (list.length + 1) + ')', v: tot.cashIn, s: st({ b: true }, num) },
      { f: 'SUM(J2:J' + (list.length + 1) + ')', v: tot.cashOut, s: st({ b: true }, num) },
      { f: 'I' + (list.length + 2) + '-J' + (list.length + 2), v: tot.balance, s: st({ b: true }, num) }]);
    return { sheets: [summary, { name: 'Entries', cols: [12, 16, 10, 18, 22, 10, 16, 26, 14, 14, 14], rows: er, landscape: true }] };
  }

  function toBytes(wb) { return X.build(wb); }

  return {
    invoiceWorkbook: invoiceWorkbook, tripsWorkbook: tripsWorkbook, reportWorkbook: reportWorkbook, toBytes: toBytes
  };
});
