import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeApp, ADMIN, contact, shipTo } from './helpers.mjs';
import { loadAdmin, waitFor, tick } from './dom-shim.mjs';

const ADMIN_DIR = fileURLToPath(new URL('../../admin/', import.meta.url));
const ADMIN_JS = `${ADMIN_DIR}admin.js`;

test('admin.js has valid syntax (node --check)', () => {
  const r = spawnSync(process.execPath, ['--check', ADMIN_JS], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('the admin page loads only its own files and never builds HTML from data', () => {
  const html = readFileSync(`${ADMIN_DIR}index.html`, 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'no inline scripts');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'no inline event handlers');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'no inline styles');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*"https?:/i, 'no third party files');
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /lang="en"/);
  const js = readFileSync(ADMIN_JS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const banned of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'localStorage.setItem(\'bsAdminToken\'']) {
    assert.ok(!js.includes(banned), `admin.js must not use ${banned}`);
  }
  // the token lives in sessionStorage only
  assert.match(js, /session\.set\('bsAdminToken'/);
  assert.doesNotMatch(js, /local\.set\('bsAdminToken'/);
  const css = readFileSync(`${ADMIN_DIR}admin.css`, 'utf8');
  assert.match(css, /#16255c/i);
  assert.match(css, /#1f4fd1/i);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width/);
});

// Helpers to drive the fake page the way a person would.
const btn = (root, text, exact = false) => root.find((e) => e.tagName === 'BUTTON' && (exact ? e.text().trim() === text : e.text().includes(text)));
const needBtn = (root, text, exact) => { const b = btn(root, text, exact); assert.ok(b, `no button "${text}" in: ${root.text().slice(0, 300)}`); return b; };
const labelled = (root, text) => {
  const l = root.find((e) => e.tagName === 'LABEL' && e.text().trim() === text);
  assert.ok(l, `no label "${text}"`);
  const el = root.find((e) => e.id && e.id === l.attrs.for);
  assert.ok(el, `no control for "${text}"`);
  return el;
};
const byAria = (root, text) => { const el = root.find((e) => e.attrs['aria-label'] === text); assert.ok(el, `no control labelled "${text}"`); return el; };
const type = (el, value, ev = 'input') => { el.value = value; el.dispatch(ev); };

test('the admin panel works end to end against the real API (fake browser, no network)', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const evil = '<img src=x onerror=alert(1)>';
  await adm.put('/api/admin/settings', { business: { name: 'Bearingsetu', stateCode: '27' }, pricing: { mode: 'list' }, shipping: { mode: 'flat', flatFee: 100 }, email: { notifyTo: ['staff@example.com'] } });
  const cust = await t.customer({ company: `${evil} Works`, gstin: '27ABCDE1234F1Z5' });
  const q1 = (await t.post('/api/quotes', { contact: { ...contact, company: evil, notes: evil }, lines: [{ id: 'skf-6205', qty: 3 }, { pn: evil, qty: 1 }] }, cust.as)).json.ref;
  await adm.put('/api/admin/commercial/skf-6205', { price: 1000 });

  let inflight = 0;
  const ui = loadAdmin({
    adminJs: ADMIN_JS,
    fetchImpl: async (path, init) => {
      inflight++;
      try { const r = await t.app.inject({ method: init.method, url: path, headers: init.headers, body: init.body }); return { status: r.status, text: r.text }; } finally { inflight--; }
    },
  });
  const { els, body } = ui;
  const settle = async () => { await waitFor(() => inflight === 0, 'requests to finish'); await tick(); await tick(); await waitFor(() => inflight === 0, 'requests to finish'); };
  const main = () => body.find((e) => e.id === 'main');
  const loaded = async (what) => { await settle(); return waitFor(() => main() && !main().text().includes('Loading…') && main(), what); };
  const goTo = async (name) => { needBtn(els.app.find((e) => e.tagName === 'NAV'), name, true).click(); return loaded(name); };
  const noErrors = (where) => assert.equal(body.all((e) => e.hasClass('note') && e.hasClass('bad')).length, 0, `${where}: ${body.all((e) => e.hasClass('bad')).map((e) => e.text()).join(' | ')}`);
  const confirmText = () => els.confirm.text();
  const answerYes = async (label) => { await waitFor(() => els.confirm.open, 'confirm dialog'); const text = confirmText(); needBtn(els.confirm, label).click(); await waitFor(() => !els.confirm.open); return text; };

  // ---- login screen ----
  assert.ok(els.app.find((e) => e.tagName === 'FORM'), 'login form shown');
  assert.equal(labelled(els.app, 'API address').value, 'http://localhost', 'the API address defaults to this page');
  const bad = els.app.find((e) => e.attrs.name === 'password');
  els.app.find((e) => e.attrs.name === 'email').value = ADMIN.email;
  bad.value = 'wrong-password-123';
  els.app.find((e) => e.tagName === 'FORM').dispatch('submit');
  await waitFor(() => els.app.text().includes('Incorrect email or password'), 'login error');
  bad.value = ADMIN.password;
  els.app.find((e) => e.tagName === 'FORM').dispatch('submit');
  await waitFor(() => els.app.find((e) => e.tagName === 'NAV'), 'the main screen after login');
  assert.ok(ui.window.sessionStorage.getItem('bsAdminToken'), 'token kept in sessionStorage');
  assert.equal(ui.window.localStorage.getItem('bsAdminToken'), null, 'never in localStorage');
  assert.equal(ui.window.localStorage.getItem('bsAdminApi'), 'http://localhost', 'the API address is remembered');

  // ---- every section loads without errors ----
  await loaded('dashboard');
  assert.match(main().text(), /Accounts to verify/);
  assert.match(main().text(), /New quote requests/);
  for (const name of ['Accounts', 'Quotes', 'Orders', 'Products & prices', 'Settings', 'Email log', 'Audit log', 'Dashboard']) { await goTo(name); noErrors(name); }
  assert.equal(body.all((e) => e.tagName === 'IMG').length, 0, 'customer supplied markup never becomes elements');

  // ---- accounts: verify, then manage credit ----
  await goTo('Accounts');
  await waitFor(() => body.find((e) => e.hasClass('row-open')), 'account rows');
  assert.ok(main().text().includes(evil), 'hostile text is shown as plain text');
  body.find((e) => e.hasClass('row-open')).click();
  await waitFor(() => els.drawer.open && els.drawer.text().includes('Credit history'), 'account drawer');
  assert.equal(body.all((e) => e.tagName === 'IMG').length, 0);
  assert.match(els.drawer.text(), /not verified yet/);
  needBtn(els.drawer, 'Verify this account').click();
  const said = await answerYes('Yes, update and email');
  assert.match(said, new RegExp(`${cust.email.replace('.', '\\.')}`), 'the confirmation names the customer email');
  assert.match(said, /will email/);
  await waitFor(() => t.app.store.get('accounts').items[0].status === 'verified', 'verified');
  await waitFor(() => !els.drawer.text().includes('not verified yet'), 'drawer refresh');

  type(labelled(els.drawer, 'Credit status'), 'approved', 'change');
  type(labelled(els.drawer, 'Credit limit (₹)'), '500000');
  type(labelled(els.drawer, 'Payment terms (days)'), '45');
  needBtn(els.drawer, 'Save credit settings').click();
  const creditSaid = await answerYes('Yes, save and email the customer');
  assert.match(creditSaid, /This will email .*\(buyer1@example\.com\) and notify them in their account\./);
  assert.match(creditSaid, /Credit status: Not enabled → Approved/);
  assert.match(creditSaid, /Credit limit: ₹0\.00 → ₹5,00,000\.00/);
  assert.match(creditSaid, /Payment terms: 0 days → 45 days/);
  await waitFor(() => t.app.store.get('accounts').items[0].credit.status === 'approved', 'credit approved');
  const acc = t.app.store.get('accounts').items[0];
  assert.deepEqual([acc.credit.limit, acc.credit.termsDays], [500000, 45]);
  assert.ok(t.mailer.sent.some((m) => /credit facility has been approved/i.test(m.subject) && m.text.includes('5,00,000.00')));
  await waitFor(() => els.drawer.text().includes('Credit limit: '), 'history refresh');

  // a credit order, then record a payment through the panel
  const order = await t.post('/api/me/orders', { lines: [{ id: 'skf-6205', qty: 2 }], payment: 'credit', shipTo }, cust.as);
  assert.equal(order.status, 201);
  els.drawer.close();
  body.find((e) => e.hasClass('row-open')).click();
  await waitFor(() => els.drawer.open && els.drawer.text().includes(order.json.order.no), 'drawer with the order');
  type(labelled(els.drawer, 'Amount received (₹)'), '500');
  type(labelled(els.drawer, 'Reference'), 'UTR-123');
  needBtn(els.drawer, 'Record payment').click();
  const paySaid = await answerYes('Yes, record and email');
  assert.match(paySaid, /Record a payment of ₹500\.00/);
  await waitFor(() => t.app.store.get('accounts').items[0].credit.used === order.json.order.total - 500, 'payment recorded');
  await settle(); // the drawer reloads itself after the change
  assert.match(els.drawer.text(), /Payment of \u20b9500\.00 recorded/, 'the credit history shows the payment');
  // asking for a payment bigger than what is owed is stopped before any email is sent
  type(labelled(els.drawer, 'Amount received (₹)'), '99999999');
  type(labelled(els.drawer, 'Reference'), 'TOO-MUCH');
  needBtn(els.drawer, 'Record payment').click();
  await waitFor(() => els.drawer.text().includes('more than the'), 'too-large payment message');
  assert.equal(els.confirm.open, false);
  els.drawer.close();

  // ---- quotes: price and send ----
  await goTo('Quotes');
  await waitFor(() => body.find((e) => e.hasClass('row-open') && e.text() === q1), 'quote rows');
  body.find((e) => e.hasClass('row-open') && e.text() === q1).click();
  await waitFor(() => els.drawer.open && els.drawer.text().includes('Your reply'), 'quote drawer');
  assert.equal(body.all((e) => e.tagName === 'IMG').length, 0);
  needBtn(els.drawer, 'Send quote to customer').click();
  await waitFor(() => els.drawer.text().includes('Enter a price for line 1'), 'missing price message');
  assert.equal(els.confirm.open, false, 'nothing is sent without prices');
  type(byAria(els.drawer, 'Unit price for line 1'), '100.50');
  type(byAria(els.drawer, 'Unit price for line 2'), '200');
  type(labelled(els.drawer, 'Freight / delivery charge (₹)'), '95');
  needBtn(els.drawer, 'Send quote to customer').click();
  const quoteSaid = await answerYes('Yes, send the quote');
  assert.match(quoteSaid, /This will email Guest Buyer \(guest@example\.com\) and notify them in their account\./);
  await waitFor(() => t.app.store.get('quotes').items[0].status === 'responded', 'quote responded');
  const quote = t.app.store.get('quotes').items[0];
  // 3 x 100.50 + 1 x 200 = 501.50, plus 95 freight = 596.50; CGST and SGST are 53.69 each (53.685 rounded)
  assert.deepEqual([quote.pricing.subtotal, quote.pricing.gstAmount, quote.pricing.total], [501.5, 107.38, 703.88]);
  assert.equal(quote.pricing.gstType, 'CGST+SGST');
  els.drawer.close();

  // ---- orders: confirm with tracking ----
  const accepted = await t.post(`/api/me/quotes/${q1}/accept`, { payment: 'bank-transfer', shipTo }, cust.as);
  await goTo('Orders');
  await waitFor(() => body.find((e) => e.hasClass('row-open') && e.text() === accepted.json.order.no), 'order rows');
  body.find((e) => e.hasClass('row-open') && e.text() === accepted.json.order.no).click();
  await waitFor(() => els.drawer.open && els.drawer.text().includes('Update this order'), 'order drawer');
  type(labelled(els.drawer, 'Carrier'), 'VRL');
  type(labelled(els.drawer, 'Tracking reference'), 'VRL777');
  needBtn(els.drawer, 'Confirm this order').click();
  await answerYes('Yes, update and email');
  await waitFor(() => t.app.store.get('orders').items.find((o) => o.no === accepted.json.order.no).status === 'confirmed', 'order confirmed');
  assert.equal(t.app.store.get('orders').items.find((o) => o.no === accepted.json.order.no).tracking.ref, 'VRL777');
  els.drawer.close();

  // ---- products: price, hide, import, add ----
  await goTo('Products & prices');
  await waitFor(() => body.find((e) => e.attrs['aria-label'] === 'Price for 6206'), 'product rows');
  assert.match(main().text(), /Quote only/);
  const price = byAria(main(), 'Price for 6206');
  type(price, '265');
  const row = body.find((e) => e.tagName === 'TR' && e.hasClass('dirty'));
  assert.ok(row, 'an edited row is highlighted');
  needBtn(row, 'Save', true).click();
  await waitFor(() => t.app.store.get('commercial').items['skf-6206']?.price === 265, 'price saved');
  const hide = byAria(main(), 'Hide 6206 from the store');
  hide.checked = true; hide.dispatch('change');
  await waitFor(() => t.app.store.get('commercial').items['skf-6206']?.hidden === true, 'hidden saved');

  needBtn(main(), 'Import CSV').click();
  await waitFor(() => els.dialog.open, 'import dialog');
  type(labelled(els.dialog, 'Or paste the CSV text'), 'id,price\nskf-6206,300\nnope,5\n', 'change');
  needBtn(els.dialog, 'Check the file').click();
  await waitFor(() => els.dialog.text().includes('Nothing has been changed yet'), 'check result');
  assert.match(els.dialog.text(), /Line 3: Unknown product id "nope"/);
  assert.equal(t.app.store.get('commercial').items['skf-6206'].price, 265, 'checking does not import');
  needBtn(els.dialog, 'Import now').click();
  await waitFor(() => t.app.store.get('commercial').items['skf-6206']?.price === 300, 'imported');
  await waitFor(() => !els.dialog.open, 'import dialog closed');

  needBtn(main(), 'Add a product').click();
  await waitFor(() => els.dialog.open && els.dialog.text().includes('Add a product'), 'product form');
  type(labelled(els.dialog, 'Part number'), 'NU 205');
  type(labelled(els.dialog, 'Brand'), 'skf', 'change');
  type(labelled(els.dialog, 'Category'), 'ball-bearings', 'change');
  type(labelled(els.dialog, 'Name shown to customers'), 'Cylindrical roller bearing');
  type(labelled(els.dialog, 'Technical details, one per line as "Name: value"'), 'Cage: Polyamide\nLimiting speed: 11,000 r/min');
  assert.equal(labelled(els.dialog, 'Product id').value, 'skf-nu-205', 'the id is suggested');
  needBtn(els.dialog, 'Add product').click();
  await waitFor(() => t.app.store.get('catalog').products['skf-nu-205'], 'product added');
  assert.deepEqual(t.app.store.get('catalog').products['skf-nu-205'].attrs, [['Cage', 'Polyamide'], ['Limiting speed', '11,000 r/min']]);

  needBtn(main(), 'Add a brand').click();
  await waitFor(() => els.dialog.open && els.dialog.text().includes('Add a brand'), 'brand form');
  type(labelled(els.dialog, 'Brand name'), 'Acme Bearings');
  type(labelled(els.dialog, 'Country of origin (optional)'), 'India');
  needBtn(els.dialog, 'Add brand', true).click();
  await waitFor(() => t.app.store.get('catalog').brands['acme-bearings'], 'brand added');

  // ---- settings ----
  await goTo('Settings');
  type(labelled(main(), 'Shop name'), 'Bearingsetu Test');
  assert.match(main().text(), /Quote only/);
  needBtn(main(), 'Save settings').click();
  await waitFor(() => JSON.parse(JSON.stringify(t.app.store.get('settings'))).business?.name === 'Bearingsetu Test', 'settings saved');

  // ---- logs ----
  await goTo('Email log');
  await waitFor(() => main().text().includes('credit facility'), 'email rows');
  await goTo('Audit log');
  await waitFor(() => main().text().includes('Credit changed'), 'audit rows');
  noErrors('logs');
  assert.equal(body.all((e) => e.tagName === 'IMG').length, 0);

  // ---- log out ----
  needBtn(els.app, 'Log out').click();
  await waitFor(() => els.app.find((e) => e.tagName === 'FORM'), 'login again');
  assert.equal(ui.window.sessionStorage.getItem('bsAdminToken'), null);
  assert.match(els.app.text(), /You are logged out/);
});

test('an expired session sends the person back to the login screen with an explanation', async () => {
  const t = await makeApp();
  const ui = loadAdmin({
    adminJs: ADMIN_JS, session: { bsAdminToken: 'stale.token', bsAdminApi: '' },
    fetchImpl: async (path, init) => { const r = await t.app.inject({ method: init.method, url: path, headers: init.headers, body: init.body }); return { status: r.status, text: r.text }; },
  });
  await waitFor(() => ui.els.app.text().includes('Your session ended'), 'session ended message');
  assert.ok(ui.els.app.find((e) => e.tagName === 'FORM'));
  assert.equal(ui.window.sessionStorage.getItem('bsAdminToken'), null);
});

test('the panel explains when the server cannot be reached', async () => {
  const ui = loadAdmin({ adminJs: ADMIN_JS, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  els_login(ui);
  await waitFor(() => ui.els.app.text().includes('Cannot reach the server'), 'network message');
});
function els_login(ui) {
  ui.els.app.find((e) => e.attrs.name === 'email').value = 'a@b.co';
  ui.els.app.find((e) => e.attrs.name === 'password').value = 'whatever-password';
  ui.els.app.find((e) => e.attrs.name === 'api').value = 'https://api.example.com/';
  ui.els.app.find((e) => e.tagName === 'FORM').dispatch('submit');
}
