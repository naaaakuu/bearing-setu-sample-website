import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeApp, contact } from './helpers.mjs';

test('commercial data: every rule on a single product', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  assert.equal((await t.put('/api/admin/commercial/skf-6205', { price: 1 })).status, 401);
  assert.equal((await adm.put('/api/admin/commercial/not-a-product', { price: 1 })).status, 404);
  assert.equal((await adm.put('/api/admin/commercial/__proto__', { price: 1 })).status, 404);
  assert.equal((await adm.put('/api/admin/commercial/constructor', { price: 1 })).status, 404);

  const bad = [{ price: 0 }, { price: -1 }, { price: '100' }, { price: 10.555 }, { price: 1e8 }, { stock: -1 }, { stock: 1.5 }, { leadDays: 400 }, { moq: 0 }, { hidden: 'yes' },
    { price: 100, tiers: [[1, 90]] }, { price: 100, tiers: [[10, 120]] }, { price: 100, tiers: [[10, 90], [10, 80]] }, { price: 100, tiers: [[10]] }, { price: 100, tiers: 'x' },
    { price: 100, tiers: [[10, 90], [50, 95]] }, { tiers: [[10, 90]] }];
  for (const b of bad) assert.equal((await adm.put('/api/admin/commercial/skf-6205', b)).status, 400, JSON.stringify(b));
  assert.deepEqual((await adm.get('/api/admin/commercial')).json.items, {}, 'refused updates change nothing');

  const ok = await adm.put('/api/admin/commercial/skf-6205', { price: 265, tiers: [[50, 241], [10, 254]], stock: 40, leadDays: 2, moq: 1, hidden: false });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.item, { price: 265, tiers: [[10, 254], [50, 241]], stock: 40, leadDays: 2, moq: 1 }, 'tiers are sorted; false hidden is not stored');
  // a missing key keeps the stored value; null clears it
  const part = await adm.put('/api/admin/commercial/skf-6205', { stock: 35 });
  assert.deepEqual(part.json.item, { price: 265, tiers: [[10, 254], [50, 241]], stock: 35, leadDays: 2, moq: 1 });
  const cleared = await adm.put('/api/admin/commercial/skf-6205', { stock: null, tiers: null, hidden: true });
  assert.deepEqual(cleared.json.item, { price: 265, leadDays: 2, moq: 1, hidden: true });
  assert.equal((await adm.put('/api/admin/commercial/skf-6205', { price: 265 })).json.changed, false);

  const audit = (await adm.get('/api/admin/audit?entity=commercial&entityId=skf-6205')).json.items;
  assert.equal(audit.length, 3, 'the no-op was not audited');
  assert.equal(audit.at(-1).before, null);
  assert.equal(audit.at(-1).after.price, 265);
  assert.equal(audit[0].before.stock, 35);

  assert.equal((await adm.put('/api/admin/commercial/skf-6205', { price: null, leadDays: null, moq: null, hidden: false })).json.item, null, 'an empty entry disappears: back to "Quote only"');
  assert.deepEqual((await adm.get('/api/admin/commercial')).json.items, {});
});

test('the admin list shows every catalogue product, including those with no price', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await adm.put('/api/admin/commercial/skf-6206', { price: 500 });
  const r = (await adm.get('/api/admin/commercial')).json;
  assert.equal(r.catalogAvailable, true);
  assert.deepEqual(r.products.map((p) => p.id), ['skf-6205', 'skf-6206', 'nok-tc-25x52x7']);
  assert.equal(r.products[0].brandName, 'SKF');
  assert.deepEqual(Object.keys(r.items), ['skf-6206']);
  assert.ok(r.categories.length && r.brands.length);
  const stats = (await adm.get('/api/admin/stats')).json;
  assert.equal(stats.productsTotal, 3);
  assert.equal(stats.productsWithoutPrice, 2);
});

test('the server copes with a missing catalogue file', async () => {
  const t = await makeApp({ env: { CATALOG_FILE: '/nonexistent/catalog.js' } });
  const adm = await t.admin();
  const r = (await adm.get('/api/admin/commercial')).json;
  assert.equal(r.catalogAvailable, false);
  assert.deepEqual(r.products, []);
  assert.equal((await adm.put('/api/admin/commercial/skf-6205', { price: 1 })).status, 404);
  // admin-added products still work, quotes still accept typed part numbers and ids
  assert.equal((await adm.put('/api/admin/catalog/products/my-part', { pn: 'MP-1', brand: 'x', cat: 'y', title: 'My part' })).status, 201);
  assert.equal((await adm.put('/api/admin/commercial/my-part', { price: 10 })).status, 200);
  const q = await t.post('/api/quotes', { contact, lines: [{ id: 'whatever', pn: 'Typed', qty: 1 }, { id: 'my-part', qty: 2 }] });
  assert.equal(q.status, 201);
  const stored = (await adm.get(`/api/admin/quotes/${q.json.ref}`)).json.quote.lines;
  assert.equal(stored[0].id, 'whatever', 'with no catalogue to check against, the id is kept');
  assert.equal(stored[1].pn, 'MP-1');
  assert.equal((await t.get('/api/health')).status, 200);
});

const EXPORT_HEADER = 'id,pn,brand,title,price,tiers,stock,lead_days,moq,hidden';

test('CSV export lists every product, round-trips through import, and is safe to open in a spreadsheet', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await adm.put('/api/admin/commercial/skf-6205', { price: 265, tiers: [[10, 254], [50, 241]], stock: 40, leadDays: 2, moq: 5 });
  await adm.put('/api/admin/commercial/skf-6206', { price: 300.5, hidden: true });
  await adm.put('/api/admin/catalog/products/evil', { pn: '=HYPERLINK("http://evil")', brand: 'skf', cat: 'seals', title: '@SUM(1)' });

  const csv = await adm.get('/api/admin/commercial/export');
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /^text\/csv/);
  assert.match(csv.headers['content-disposition'], /attachment; filename="bearingsetu-prices-2026-06-15\.csv"/);
  assert.equal(csv.text.charCodeAt(0), 0xfeff, 'a BOM, so Excel reads the file as UTF-8');
  const lines = csv.text.slice(1).split('\r\n');
  assert.equal(lines[0], EXPORT_HEADER);
  assert.equal(lines[1], 'skf-6205,6205,SKF,"Deep groove ball bearing, open",265,10:254|50:241,40,2,5,');
  assert.equal(lines[2], 'skf-6206,6206,SKF,Deep groove ball bearing 6206,300.5,,,,,yes');
  assert.equal(lines[3], 'nok-tc-25x52x7,TC 25x52x7,NOK,Oil seal,,,,,,');
  assert.match(lines[4], /^evil,"'=HYPERLINK\(""http:\/\/evil""\)",SKF,'@SUM\(1\),/, 'formulas are defused');
  assert.equal(lines.length, 6); // 4 products + header + trailing newline
  assert.equal((await t.get('/api/admin/commercial/export')).status, 401);

  // replace import of its own export changes nothing
  const same = await adm.post('/api/admin/commercial/import', { csv: csv.text });
  assert.deepEqual(same.json, { updated: 0, removed: 0, rows: 4, errors: [], dryRun: false });

  // and a fresh shop loaded from that file ends up identical
  const t2 = await makeApp();
  const adm2 = await t2.admin();
  const loaded = await adm2.post('/api/admin/commercial/import', { csv: csv.text.replace(/\r\nevil,.*\r\n/, '\r\n') });
  assert.equal(loaded.json.errors.length, 0);
  assert.equal(loaded.json.updated, 2);
  const a = (await adm.get('/api/admin/commercial')).json.items;
  const b = (await adm2.get('/api/admin/commercial')).json.items;
  assert.deepEqual({ ...a, evil: undefined }, { ...b, evil: undefined });
  assert.deepEqual((await adm2.get('/api/admin/commercial')).json.items['skf-6206'], { price: 300.5, hidden: true });
});

test('CSV import reports problems line by line and still applies the good rows', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await adm.put('/api/admin/commercial/nok-tc-25x52x7', { price: 77, stock: 9 });
  const csv = [
    'id,price,tiers,stock,lead_days,moq,hidden',
    'skf-6205,"1,250.50",10:1200|50:1100,40,2,5,no', // line 2: good, Indian style number
    'skf-6206,abc,,,,,', // line 3: bad price
    'ghost-id,10,,,,,', // line 4: unknown product
    'skf-6205,99,,,,,', // line 5: duplicate
    ',10,,,,,', // line 6: no id
    'nok-tc-25x52x7,5,5:6,,,,', // line 7: tier price above base, so refused
    'skf-6205x,1,,,,,', // line 8: unknown
    '', // blank lines are skipped
  ].join('\n');
  const r = await adm.post('/api/admin/commercial/import', { csv });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.errors.map((e) => e.line), [3, 4, 5, 6, 7, 8]);
  assert.match(r.json.errors[0].message, /Price "abc"/);
  assert.match(r.json.errors[1].message, /Unknown product id "ghost-id"/);
  assert.match(r.json.errors[2].message, /appears twice/);
  assert.match(r.json.errors[3].message, /id is missing/);
  assert.match(r.json.errors[4].message, /cannot be higher/);
  assert.equal(r.json.updated, 1);
  const items = (await adm.get('/api/admin/commercial')).json.items;
  assert.deepEqual(items['skf-6205'], { price: 1250.5, tiers: [[10, 1200], [50, 1100]], stock: 40, leadDays: 2, moq: 5 });
  assert.deepEqual(items['nok-tc-25x52x7'], { price: 77, stock: 9 }, 'a row with an error never wipes the old values');
  assert.equal(items['skf-6206'], undefined);
  const audit = (await adm.get('/api/admin/audit?entity=commercial')).json.items.find((e) => e.action === 'commercial.import');
  assert.equal(audit.after.errors, 6);
});

test('CSV import: replace mode removes products not in the file, merge keeps them, and a check run writes nothing', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await adm.put('/api/admin/commercial/skf-6205', { price: 100, stock: 5 });
  await adm.put('/api/admin/commercial/skf-6206', { price: 200 });
  const file = 'id,price\nskf-6205,111\n';

  const dry = await adm.post('/api/admin/commercial/import', { csv: file, dryRun: true });
  assert.equal(dry.json.dryRun, true);
  assert.equal(dry.json.updated, 1);
  assert.equal(dry.json.removed, 1);
  assert.equal((await adm.get('/api/admin/commercial')).json.items['skf-6205'].price, 100, 'a dry run changes nothing');

  const merged = await adm.post('/api/admin/commercial/import', { csv: file, merge: true });
  assert.equal(merged.json.removed, 0);
  const afterMerge = (await adm.get('/api/admin/commercial')).json.items;
  assert.deepEqual(afterMerge['skf-6205'], { price: 111, stock: 5 }, 'merge only touches the columns in the file');
  assert.equal(afterMerge['skf-6206'].price, 200);

  const replaced = await adm.post('/api/admin/commercial/import', { csv: file });
  assert.equal(replaced.json.removed, 1);
  assert.equal(replaced.json.updated, 1);
  const afterReplace = (await adm.get('/api/admin/commercial')).json.items;
  assert.deepEqual(afterReplace, { 'skf-6205': { price: 111 } }, 'replace builds exactly what the file says');
});

test('CSV import: bad files are refused with a clear message', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const post = (body) => adm.post('/api/admin/commercial/import', body);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ csv: '' })).status, 400);
  assert.equal((await post({ csv: 'price\n10\n' })).json.error, 'invalid_csv', 'no id column');
  assert.equal((await post({ csv: 'id,colour\nskf-6205,red\n' })).json.error, 'invalid_csv', 'no price columns');
  assert.equal((await post({ csv: 'id,price\n' })).json.error, 'invalid_csv', 'header only: replace would wipe everything');
  assert.equal((await post({ csv: 'id,price\n"skf-6205,10\n' })).json.error, 'invalid_csv', 'unterminated quote');
  assert.equal((await post({ csv: 'id,price', merge: 'yes' })).status, 400);
  assert.equal((await t.post('/api/admin/commercial/import', { csv: 'id,price\nskf-6205,1\n' })).status, 401);
  // headers are forgiving: capitals, aliases, a BOM and Windows line ends
  const r = await post({ csv: '﻿Product ID,Price,Lead Days,MOQ,Hidden\r\nskf-6205,10,3,2,YES\r\n' });
  assert.equal(r.json.errors.length, 0);
  assert.deepEqual((await adm.get('/api/admin/commercial')).json.items['skf-6205'], { price: 10, leadDays: 3, moq: 2, hidden: true });
});

test('CSV parser handles quotes, embedded commas and line breaks', async () => {
  const { parseCsv, toCsv } = await import('../lib/csv.mjs');
  const rows = parseCsv('a,"b, c","say ""hi""","line\nbreak"\r\n\r\n1,2,3,4');
  assert.deepEqual(rows.map((r) => r.cells), [['a', 'b, c', 'say "hi"', 'line\nbreak'], ['1', '2', '3', '4']]);
  assert.deepEqual(rows.map((r) => r.line), [1, 4]);
  assert.equal(toCsv([['x', 'a,b', 'q"q', ' pad ']]), 'x,"a,b","q""q"," pad "\r\n');
});

test('products and brands can be added, edited and removed, and the storefront can read them', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const product = { pn: 'NU 205 ECP', brand: 'newco', cat: 'ball-bearings', title: 'Cylindrical roller bearing', d: 25, D: 52, B: 15, hsn: '8482', desc: 'Line one\nLine two', attrs: [['Cage', 'Polyamide']], eq: ['FAG NU205'], gst: 18, bogus: 'dropped', price: 5 };
  assert.equal((await t.put('/api/admin/catalog/products/nu-205', product)).status, 401);
  assert.equal((await adm.put('/api/admin/catalog/products/nu-205', product)).status, 400, 'the brand must exist first');
  assert.equal((await adm.put('/api/admin/catalog/brands/newco', { name: '' })).status, 400);
  assert.equal((await adm.put('/api/admin/catalog/brands/New Co', { name: 'X' })).status, 400, 'ids are plain slugs');
  const brand = await adm.put('/api/admin/catalog/brands/newco', { name: 'NewCo', origin: 'India' });
  assert.deepEqual(brand.json.brand, { id: 'newco', name: 'NewCo', origin: 'India' });

  assert.equal((await adm.put('/api/admin/catalog/products/nu-205', { ...product, cat: 'nonsense' })).status, 400);
  assert.equal((await adm.put('/api/admin/catalog/products/nu-205', { ...product, id: 'other' })).status, 400);
  assert.equal((await adm.put('/api/admin/catalog/products/Bad%20Id', product)).status, 400);
  assert.equal((await adm.put('/api/admin/catalog/products/nu-205', { ...product, hsn: 'abc' })).status, 400);
  assert.equal((await adm.put('/api/admin/catalog/products/nu-205', { ...product, attrs: [['only one']] })).status, 400);
  assert.equal((await adm.put('/api/admin/catalog/products/nu-205', { ...product, title: '' })).status, 400);
  const created = await adm.put('/api/admin/catalog/products/nu-205', product);
  assert.equal(created.status, 201);
  assert.equal(created.json.product.bogus, undefined, 'unknown fields (like a price) are dropped');
  assert.equal(created.json.product.price, undefined);
  assert.equal(created.json.product.family, 'NU 205 ECP');
  assert.equal(created.json.product.unit, 'pc');
  assert.equal((await adm.put('/api/admin/catalog/products/nu-205', { ...product, title: 'Renamed' })).status, 200, 'saving again updates it');

  const pub = (await t.get('/api/catalog')).json;
  assert.equal(pub.products.upsert.length, 1);
  assert.equal(pub.products.upsert[0].title, 'Renamed');
  assert.deepEqual(pub.brands, [{ id: 'newco', name: 'NewCo', origin: 'India' }]);
  assert.ok(pub.updatedAt);
  assert.equal((await adm.get('/api/admin/catalog/products/nu-205')).json.product.desc, 'Line one\nLine two');
  assert.equal((await adm.get('/api/admin/catalog/products/skf-6205')).json.source, 'static');

  // it can be priced, appears in the admin list, and quotes use its name
  assert.equal((await adm.put('/api/admin/commercial/nu-205', { price: 640 })).status, 200);
  assert.ok((await adm.get('/api/admin/commercial')).json.products.some((p) => p.id === 'nu-205' && p.source === 'admin'));
  const q = await t.post('/api/quotes', { contact, lines: [{ id: 'nu-205', qty: 3 }] });
  assert.equal((await adm.get(`/api/admin/quotes/${q.json.ref}`)).json.quote.lines[0].brand, 'NewCo');

  // deleting an added product removes it and its price; deleting a built-in one only hides it
  assert.equal((await adm.del('/api/admin/catalog/products/nu-205')).json.hidden, false);
  assert.equal((await t.get('/api/catalog')).json.products.upsert.length, 0);
  assert.equal((await adm.get('/api/admin/commercial')).json.items['nu-205'], undefined);
  assert.equal((await adm.del('/api/admin/catalog/products/nu-205')).status, 404);
  const hide = await adm.del('/api/admin/catalog/products/skf-6206');
  assert.equal(hide.json.hidden, true);
  assert.deepEqual((await t.get('/api/catalog')).json.products.hide, ['skf-6206']);
  assert.equal((await adm.get('/api/admin/commercial')).json.products.find((p) => p.id === 'skf-6206').removed, true);
  // saving the product again brings it back
  await adm.put('/api/admin/catalog/products/skf-6206', { pn: '6206', brand: 'skf', cat: 'ball-bearings', title: 'Edited 6206' });
  const back = (await t.get('/api/catalog')).json.products;
  assert.deepEqual(back.hide, []);
  assert.equal(back.upsert[0].title, 'Edited 6206');
  assert.ok((await adm.get('/api/admin/audit?entity=catalog')).json.items.length >= 6);
});

test('settings: validated, merged, audited and only the public part is exposed', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const before = (await adm.get('/api/admin/settings')).json;
  assert.deepEqual(Object.keys(before).sort(), ['business', 'catalogue', 'email', 'pricing', 'shipping']);
  assert.equal(before.pricing.mode, 'quote');
  assert.equal(before.shipping.mode, 'quoted');
  assert.equal(before.catalogue.showIndicativePerformance, false);

  const bad = [{ pricing: { mode: 'free' } }, { pricing: { gstRate: 101 } }, { pricing: { gstRate: 'x' } }, { business: { gstin: 'bad' } }, { business: { stateCode: '2' } },
    { business: { email: 'nope' } }, { shipping: { mode: 'flat' } }, { shipping: { flatFee: -1 } }, { email: { notifyTo: ['bad'] } }, { email: { notifyTo: 'a@b.co' } },
    { catalogue: { showIndicativePerformance: 'yes' } }, { business: { addressLines: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } }, [1]];
  for (const b of bad) assert.equal((await adm.put('/api/admin/settings', b)).status, 400, JSON.stringify(b));

  const saved = await adm.put('/api/admin/settings', {
    business: { name: 'Bearingsetu', gstin: '27abcde1234f1z5', stateCode: '27', state: 'Maharashtra', addressLines: ['Shop 4', '', 'Pune'], email: 'Sales@Example.com' },
    pricing: { mode: 'list', gstRate: 18 }, shipping: { mode: 'flat', flatFee: 150, freeOver: 10000, note: 'Dispatch in 24 hours' },
    catalogue: { showIndicativePerformance: true }, email: { notifyTo: ['a@example.com', 'a@example.com', 'b@example.com'] },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.business.gstin, '27ABCDE1234F1Z5');
  assert.deepEqual(saved.json.business.addressLines, ['Shop 4', 'Pune']);
  assert.equal(saved.json.business.email, 'sales@example.com');
  assert.deepEqual(saved.json.email.notifyTo, ['a@example.com', 'b@example.com']);
  assert.equal(saved.json.business.phone, '', 'untouched fields keep their value');

  const pub = (await t.get('/api/config')).json;
  assert.equal(pub.pricing.mode, 'list');
  assert.equal(pub.shipping.flatFee, 150);
  assert.equal(pub.catalogue.showIndicativePerformance, true);
  assert.equal(pub.email.notifyTo, undefined);
  const audit = (await adm.get('/api/admin/audit?entity=settings')).json.items;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].before.pricing.mode, 'quote');
  assert.equal(audit[0].after.pricing.mode, 'list');
  assert.equal((await t.put('/api/admin/settings', {})).status, 401);
});

test('staff notification emails go only to the configured addresses; the email log records failures and skips', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await t.post('/api/auth/register', { company: 'No Staff Co', gstin: '27ABCDE1234F1Z5', name: 'Pat', email: 'pat@example.com', phone: '9876543210', password: 'a-good-password-1', city: 'Pune', state: 'MH' });
  assert.deepEqual(t.mailer.sent.map((m) => m.to), [['pat@example.com']], 'with no staff addresses only the customer is emailed');

  // a failing mailer is recorded, never crashes the request
  t.app.store.get('outbox');
  const { createApp } = await import('../app.mjs');
  const failing = createApp({ dataDir: join(t.dir, 'data2'), env: { SECRET: 's'.repeat(48), ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'long-enough-password' }, mailer: { send: async () => ({ status: 'failed', error: 'SMTP server said 550' }) }, log: { warn() {}, error() {} } });
  const login = await failing.inject({ method: 'POST', url: '/api/admin/login', body: { email: 'a@b.co', password: 'long-enough-password' } });
  const reg = await failing.inject({ method: 'POST', url: '/api/auth/register', body: { company: 'Co Two', gstin: '27ABCDE1234F1Z5', name: 'Pat', email: 'p2@example.com', phone: '9876543210', password: 'a-good-password-1', city: 'Pune', state: 'MH' } });
  assert.equal(reg.status, 201);
  const log = await failing.inject({ url: '/api/admin/outbox', headers: { authorization: `Bearer ${login.json.token}` } });
  assert.equal(log.json.items[0].status, 'failed');
  assert.equal(log.json.items[0].error, 'SMTP server said 550');
  assert.deepEqual(Object.keys(log.json.items[0]).sort(), ['at', 'error', 'event', 'id', 'status', 'subject', 'to']);
  const stats = await failing.inject({ url: '/api/admin/stats', headers: { authorization: `Bearer ${login.json.token}` } });
  assert.equal(stats.json.failedEmails, 1);
  assert.equal((await adm.get('/api/admin/outbox')).json.items.length, 1);
});

test('with no SMTP settings emails are written to the outbox folder and logged as skipped', async () => {
  const { createApp } = await import('../app.mjs');
  const t = await makeApp();
  const dir = join(t.dir, 'data3');
  const app = createApp({ dataDir: dir, env: { SECRET: 's'.repeat(48), ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'long-enough-password', MAIL_FROM: 'Bearingsetu Sales <sales@example.com>' }, log: { warn() {}, error() {} } });
  const reg = await app.inject({ method: 'POST', url: '/api/auth/register', body: { company: 'Café Ünïcode Co', gstin: '27ABCDE1234F1Z5', name: 'Zoë', email: 'zoe@example.com', phone: '9876543210', password: 'a-good-password-1', city: 'Pune', state: 'MH' } });
  assert.equal(reg.status, 201);
  const files = await readdir(join(dir, 'outbox'));
  assert.equal(files.length, 1);
  const eml = await readFile(join(dir, 'outbox', files[0]), 'utf8');
  assert.match(eml, /^From: Bearingsetu Sales <sales@example\.com>\r\n/);
  assert.match(eml, /\r\nTo: zoe@example\.com\r\n/);
  assert.match(eml, /Content-Type: multipart\/alternative; boundary="/);
  assert.match(eml, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(eml, /Content-Type: text\/html; charset=UTF-8/);
  const token = (await app.inject({ method: 'POST', url: '/api/admin/login', body: { email: 'a@b.co', password: 'long-enough-password' } })).json.token;
  const log = (await app.inject({ url: '/api/admin/outbox', headers: { authorization: `Bearer ${token}` } })).json.items;
  assert.equal(log[0].status, 'skipped');
  assert.equal(log[0].to, 'zoe@example.com');
});

test('the dashboard counts what needs attention', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await t.customer();
  const c = await t.customer({ verify: true });
  await t.post('/api/quotes', { contact, lines: [{ pn: 'A', qty: 1 }] });
  await adm.put(`/api/admin/accounts/${c.id}/credit`, { status: 'approved', limit: 1000, termsDays: 30 });
  await adm.put('/api/admin/settings', { business: { stateCode: '27' }, pricing: { mode: 'list' }, shipping: { mode: 'flat', flatFee: 0 } });
  await adm.put('/api/admin/commercial/skf-6205', { price: 100 });
  await t.post('/api/me/orders', { lines: [{ id: 'skf-6205', qty: 2 }], payment: 'credit', shipTo: { line1: 'x', city: 'Pune', state: 'MH', pin: '411001' } }, c.as);
  const s = (await adm.get('/api/admin/stats')).json;
  assert.equal(s.pendingAccounts, 1);
  assert.equal(s.newQuotes, 1);
  assert.equal(s.openOrders, 1);
  assert.equal(s.ordersToConfirm, 1);
  assert.equal(s.creditOutstanding, 236);
  assert.equal(s.creditAccounts, 1);
  assert.equal(s.productsWithoutPrice, 2);
});
