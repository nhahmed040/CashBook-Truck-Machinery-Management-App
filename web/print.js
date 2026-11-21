/* Builds printable HTML for customer invoices and fleet statements.
   Pure functions: no DOM access. Every dynamic value is escaped. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBPrint = factory();
})(this, function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var CSS = [
    '@page { size: A4; margin: 14mm; }',
    '* { box-sizing: border-box; }',
    'body { font-family: "Noto Sans Ethiopic", "Segoe UI", Roboto, Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.35; margin: 0; }',
    'h1 { font-size: 17pt; margin: 0 0 2pt; }',
    'h2 { font-size: 12pt; margin: 14pt 0 4pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }',
    '.sub { color: #444; margin: 0 0 8pt; }',
    'table { width: 100%; border-collapse: collapse; margin: 4pt 0; }',
    'tr { page-break-inside: avoid; }',
    'thead { display: table-header-group; }',
    'th, td { padding: 3pt 5pt; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }',
    'th { background: #f0f0f0; font-size: 10pt; }',
    'td.n, th.n { text-align: right; white-space: nowrap; }',
    'tr.total td { font-weight: bold; border-top: 2px solid #111; border-bottom: 2px solid #111; }',
    'tr.head td { font-weight: bold; background: #f7f7f7; }',
        'tr.note td { font-style: italic; color: #555; }',
    '.meta td { border: 0; padding: 1pt 5pt 1pt 0; }',
    '.meta td:first-child { color: #444; width: 32%; }',
    '.sign { display: flex; gap: 24pt; margin-top: 36pt; }',
    '.sign div { flex: 1; border-top: 1px solid #111; padding-top: 3pt; font-size: 10pt; }',
    '.note { color: #555; font-size: 9pt; margin-top: 8pt; }',
    '.pb { page-break-before: always; }'
  ].join('\n');

  function page(title, lang, body) {
    return '<!doctype html><html lang="' + esc(lang || 'en') + '"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + '</title>' +
      '<style>' + CSS + '</style></head><body>' + body + '</body></html>';
  }

  function metaRows(pairs) {
    var h = '<table class="meta">';
    pairs.forEach(function (p) {
      if (p[1] == null || p[1] === '') return;
      h += '<tr><td>' + esc(p[0]) + '</td><td>' + esc(p[1]) + '</td></tr>';
    });
    return h + '</table>';
  }

  function row(label, value, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(label) + '</td><td class="n">' + esc(value) + '</td></tr>';
  }

  function signatures(d) {
    var on = d.project && d.project.owner ? ' – ' + d.project.owner : '';
    return '<div class="sign"><div>' + esc(d.t('prepared_by') + on) + '<br>' + esc(d.t('signature')) +
      '</div><div>' + esc(d.t('customer_sign')) + '<br>' + esc(d.t('signature')) + '</div></div>';
  }

  /* d: { t, money, lang, project, invoice, calc, trips:[{trip, plate}], date, fmt, rateStr } */
  function invoiceHtml(d) {
    var p = d.project, c = d.invoice, k = d.calc, t = d.t, m = d.money;
    var fd = d.fmt || function (x) { return x; };
    var title = t('invoice_title') + ' ' + (c.no || '');
    var h = '<h1>' + esc(title) + '</h1><p class="sub">' + esc(p.name) + '</p>';
    h += metaRows([
      [t('owner_name'), p.owner], [t('location'), p.location], [t('customer'), c.customer], [t('date'), fd(c.date)],
      [t('inv_due'), c.due ? fd(c.due) : ''], [t('prepared'), fd(d.date)]
    ]);

    h += '<h2>' + esc(t('trips')) + '</h2><table><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('truck')) + '</th><th>' + esc(t('route')) +
      '</th><th>' + esc(t('material')) + '</th><th class="n">' + esc(t('qty')) + '</th><th>' + esc(t('unit')) + '</th><th class="n">' + esc(t('rate')) +
      '</th><th class="n">' + esc(t('amount')) + '</th></tr></thead><tbody>';
    if (!d.trips.length) h += '<tr><td colspan="8">' + esc(t('no_data')) + '</td></tr>';
    d.trips.forEach(function (x) {
      var r = x.trip;
      var route = [r.from, r.to].filter(Boolean).join(' → ') + (r.ticket ? ' (#' + r.ticket + ')' : '');
      h += '<tr><td>' + esc(fd(r.date)) + '</td><td>' + esc(x.plate) + '</td><td>' + esc(route) + '</td><td>' + esc(r.material) + '</td><td class="n">' + esc(r.qty) +
        '</td><td>' + esc(t('unit_' + r.unit)) + '</td><td class="n">' + esc(d.rateStr ? d.rateStr(r.rate) : m(r.rate)) + '</td><td class="n">' + esc(m(r.amount)) + '</td></tr>';
    });
    h += '</tbody></table>';

    h += '<table>';
    h += row(t('work_amount'), m(k.gross));
    h += row(t('inv_total'), m(k.total), 'head');
    if (k.received > 0) h += row('− ' + t('received'), m(k.received));
    h += row(t('balance_due'), m(k.balance), 'total');
    h += '</table>';
    if (c.note) h += '<p class="note">' + esc(c.note) + '</p>';
    h += signatures(d);
    return page(title, d.lang, h);
  }

  /* d: { t, money, lang, project, summary, trucks:[{truck,trips,income,cost,profit}], shared, codes, codeLabel, suppliers, invoices:[{invoice,calc}], date, fmt } */
  function statementHtml(d) {
    var p = d.project, s = d.summary, t = d.t, m = d.money;
    var fd = d.fmt || function (x) { return x; };
    var title = t('statement_title') + ' – ' + p.name;
    var h = '<h1>' + esc(t('statement_title')) + '</h1><p class="sub">' + esc(p.name) + '</p>';
    h += metaRows([[t('owner_name'), p.owner], [t('location'), p.location], [t('prepared'), fd(d.date)]]);

    h += '<h2>' + esc(t('customers_section')) + '</h2><table>';
    h += row(t('trips_income'), m(s.income) + ' (' + s.trips + ')');
    h += row(t('invoiced'), m(s.invoiced));
    h += row(t('not_invoiced'), m(s.unbilled));
    h += row(t('received'), m(s.received));
    h += row(t('due_from_customers'), m(s.customerOutstanding), 'total');
    h += '</table>';

    if (d.trucks.length) {
      h += '<h2>' + esc(t('trucks')) + '</h2><table><tr><th>' + esc(t('truck')) + '</th><th class="n">' + esc(t('trips')) + '</th><th class="n">' + esc(t('income')) +
        '</th><th class="n">' + esc(t('actual_cost')) + '</th><th class="n">' + esc(t('profit')) + '</th></tr>';
      d.trucks.forEach(function (r) {
        h += '<tr><td>' + esc(r.truck.plate) + '</td><td class="n">' + esc(r.trips) + '</td><td class="n">' + esc(m(r.income)) + '</td><td class="n">' + esc(m(r.cost)) +
          '</td><td class="n">' + esc(m(r.profit)) + '</td></tr>';
      });
      if (d.shared > 0) h += '<tr class="note"><td>' + esc(t('shared_costs')) + '</td><td></td><td></td><td class="n">' + esc(m(d.shared)) + '</td><td></td></tr>';
      h += '</table>';
    }

    if (d.invoices.length) {
      h += '<h2>' + esc(t('invoices')) + '</h2><table><tr><th>' + esc(t('inv_no')) + '</th><th>' + esc(t('customer')) + '</th><th>' + esc(t('date')) +
        '</th><th class="n">' + esc(t('inv_total')) + '</th><th class="n">' + esc(t('received')) + '</th><th class="n">' + esc(t('balance_due')) + '</th></tr>';
      d.invoices.forEach(function (x) {
        h += '<tr><td>' + esc(x.invoice.no) + '</td><td>' + esc(x.invoice.customer) + '</td><td>' + esc(fd(x.invoice.date)) + '</td><td class="n">' + esc(m(x.calc.total)) + '</td><td class="n">' +
          esc(m(x.calc.received)) + '</td><td class="n">' + esc(m(x.calc.balance)) + '</td></tr>';
      });
      h += '</table>';
    }

    h += '<h2>' + esc(t('cost_section')) + '</h2><table><tr><th>' + esc(t('cost_code')) + '</th><th class="n">' + esc(t('actual_cost')) + '</th></tr>';
    d.codes.forEach(function (c) {
      var a = s.costByCode[c];
      if (!a) return;
      h += '<tr><td>' + esc(d.codeLabel(c)) + '</td><td class="n">' + esc(m(a)) + '</td></tr>';
    });
    h += '<tr class="total"><td>' + esc(t('actual_cost')) + '</td><td class="n">' + esc(m(s.costTotal)) + '</td></tr></table>';

    h += '<h2>' + esc(t('owed')) + '</h2><table>';
    if (!d.suppliers.length && !(s.wagesUnpaid > 0)) h += '<tr><td>' + esc(t('no_data')) + '</td><td></td></tr>';
    d.suppliers.forEach(function (x) { h += row(x.supplier || t('uncategorized'), m(x.balance)); });
    if (s.wagesUnpaid > 0) h += row(t('unpaid_wages'), m(s.wagesUnpaid));
    h += row(t('owed'), m(s.owed), 'total');
    h += '</table>';
    h += '<p class="note">' + esc(t('margin')) + ': ' + esc(m(s.profit)) + '</p>';
    h += signatures(d);
    return page(title, d.lang, h);
  }

  /* Cash report for a date range: totals, groups and the entry list. */
  function reportHtml(d) {
    var h = '<h1>' + esc(d.title) + '</h1><p class="sub">' + esc(d.periodLabel) + '</p>';
    h += metaRows([[d.t('prepared'), d.date], [d.t('books'), d.scopeLabel]]);
    h += '<table><tr class="total"><td>' + esc(d.t('cash_in')) + '</td><td class="n">' + esc(d.money(d.totals.cashIn)) + '</td></tr>' +
      '<tr class="total"><td>' + esc(d.t('cash_out')) + '</td><td class="n">' + esc(d.money(d.totals.cashOut)) + '</td></tr>' +
      '<tr class="total"><td>' + esc(d.t('balance')) + '</td><td class="n">' + esc(d.money(d.totals.balance)) + '</td></tr></table>';
    d.groups.forEach(function (g) {
      if (!g.rows.length) return;
      h += '<h2>' + esc(g.title) + '</h2><table><thead><tr><th></th><th class="n">' + esc(d.t('cash_in')) + '</th><th class="n">' + esc(d.t('cash_out')) + '</th><th class="n">' + esc(d.t('net')) + '</th></tr></thead><tbody>';
      g.rows.forEach(function (r) {
        h += '<tr><td>' + esc(r[0]) + '</td><td class="n">' + esc(d.money(r[1])) + '</td><td class="n">' + esc(d.money(r[2])) + '</td><td class="n">' + esc(d.money(r[3])) + '</td></tr>';
      });
      h += '</tbody></table>';
    });
    h += '<h2>' + esc(d.t('entries')) + '</h2><table><thead><tr><th>' + esc(d.t('date')) + '</th><th>' + esc(d.t('category')) + ' / ' + esc(d.t('contact')) + '</th><th class="n">' + esc(d.t('cash_in')) + '</th><th class="n">' + esc(d.t('cash_out')) + '</th></tr></thead><tbody>';
    d.entries.forEach(function (e) {
      var sub = [e.party, e.mode ? d.t('mode_' + e.mode) : '', e.by, e.note].filter(Boolean).join(' · ');
      h += '<tr><td>' + esc(d.fmt(e.date)) + '</td><td>' + esc(e.category || '') + (sub ? '<br><span class="note">' + esc(sub) + '</span>' : '') + '</td>' +
        '<td class="n">' + (e.type === 'in' ? esc(d.money(e.amount)) : '') + '</td><td class="n">' + (e.type === 'out' ? esc(d.money(e.amount)) : '') + '</td></tr>';
    });
    h += '</tbody></table>';
    return page(d.title, d.lang, h);
  }

  /* generic printable table: statements and diary reports */
  function tableHtml(d) {
    var h = '<h1>' + esc(d.title) + '</h1>';
    if (d.sub) h += '<p class="sub">' + esc(d.sub) + '</p>';
    if (d.meta) h += metaRows(d.meta);
    (d.blocks || []).forEach(function (b) {
      if (b.title) h += '<h2>' + esc(b.title) + '</h2>';
      h += '<table><thead><tr>' + b.head.map(function (c) { return '<th' + (c.n ? ' class="n"' : '') + '>' + esc(c.h) + '</th>'; }).join('') + '</tr></thead><tbody>';
      b.rows.forEach(function (r) {
        h += '<tr>' + r.map(function (v, i) { return '<td' + (b.head[i] && b.head[i].n ? ' class="n"' : '') + '>' + esc(v) + '</td>'; }).join('') + '</tr>';
      });
      h += '</tbody></table>';
      if (b.totals) { h += '<table>'; b.totals.forEach(function (r) { h += row(r[0], r[1], r[2] || ''); }); h += '</table>'; }
    });
    if (d.note) h += '<p class="note">' + esc(d.note) + '</p>';
    return page(d.title, d.lang, h);
  }

  return { esc: esc, invoiceHtml: invoiceHtml, statementHtml: statementHtml, reportHtml: reportHtml, tableHtml: tableHtml };
});
