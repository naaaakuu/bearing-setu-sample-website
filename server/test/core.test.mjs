import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeApp, ADMIN, contact } from './helpers.mjs';

test('health, config and public data need no login and never expose private settings', async () => {
  const t = await makeApp();
  const health = await t.get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  assert.ok(!Number.isNaN(Date.parse(health.json.time)));

  const adm = await t.admin();
  await adm.put('/api/admin/settings', { email: { notifyTo: ['staff@example.com'], fromName: 'Bearingsetu Sales' }, business: { name: 'Bearingsetu' } });
  const cfg = await t.get('/api/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.json.business.name, 'Bearingsetu');
  assert.equal(cfg.json.email.notifyTo, undefined, 'notifyTo is private');
  assert.equal(cfg.json.email.fromName, 'Bearingsetu Sales');
  assert.equal(cfg.json.pricing.mode, 'quote');

  const cat = await t.get('/api/catalog');
  assert.deepEqual(Object.keys(cat.json).sort(), ['brands', 'products', 'updatedAt']);
  assert.deepEqual(cat.json.products, { upsert: [], hide: [] });
  const com = await t.get('/api/commercial');
  assert.deepEqual(com.json.items, {});
});

test('unknown paths give 404 JSON and wrong methods give 405', async () => {
  const t = await makeApp();
  const nf = await t.get('/api/nope');
  assert.equal(nf.status, 404);
  assert.equal(nf.json.error, 'not_found');
  assert.equal(typeof nf.json.message, 'string');
  const bad = await t.req('DELETE', '/api/health');
  assert.equal(bad.status, 405);
  assert.match(bad.headers.allow, /GET/);
});

test('request bodies over 256 KB are refused with 413', async () => {
  const t = await makeApp();
  const big = JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(300 * 1024) });
  const r = await t.req('POST', '/api/auth/login', { body: big, headers: { 'content-type': 'application/json' } });
  assert.equal(r.status, 413);
  assert.equal(r.json.error, 'payload_too_large');
  // A lying Content-Length is caught while reading, too.
  const sneaky = await t.req('POST', '/api/auth/login', { body: big, headers: { 'content-type': 'application/json', 'content-length': '100' } });
  assert.equal(sneaky.status, 413);
  // Just under the limit is not refused for size.
  const ok = await t.req('POST', '/api/auth/login', { body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(100 * 1024) }), headers: { 'content-type': 'application/json' } });
  assert.notEqual(ok.status, 413);
});

test('bad JSON and wrong content types are rejected', async () => {
  const t = await makeApp();
  const bad = await t.req('POST', '/api/auth/login', { body: '{not json', headers: { 'content-type': 'application/json' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'invalid_json');
  const arr = await t.req('POST', '/api/auth/login', { body: '[1,2]', headers: { 'content-type': 'application/json' } });
  assert.equal(arr.status, 400);
  const text = await t.req('POST', '/api/auth/login', { body: 'email=a', headers: { 'content-type': 'text/plain' } });
  assert.equal(text.status, 415);
});

test('CORS: only origins listed in CORS_ORIGINS are allowed, and Vary: Origin is always set', async () => {
  const t = await makeApp();
  const ok = await t.get('/api/config', { headers: { origin: 'https://shop.example.com' } });
  assert.equal(ok.headers['access-control-allow-origin'], 'https://shop.example.com');
  assert.match(ok.headers.vary, /Origin/);
  const trailing = await t.get('/api/config', { headers: { origin: 'https://other.example.com' } });
  assert.equal(trailing.headers['access-control-allow-origin'], 'https://other.example.com', 'trailing slash in the env list is ignored');
  const evil = await t.get('/api/config', { headers: { origin: 'https://evil.example.net' } });
  assert.equal(evil.headers['access-control-allow-origin'], undefined);
  assert.match(evil.headers.vary, /Origin/);
  const none = await t.get('/api/config');
  assert.equal(none.headers['access-control-allow-origin'], undefined);

  const pre = await t.req('OPTIONS', '/api/auth/login', { headers: { origin: 'https://shop.example.com', 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], 'https://shop.example.com');
  assert.match(pre.headers['access-control-allow-headers'], /Authorization/);
  const preEvil = await t.req('OPTIONS', '/api/auth/login', { headers: { origin: 'https://evil.example.net' } });
  assert.equal(preEvil.headers['access-control-allow-origin'], undefined);

  const star = await makeApp({ env: { CORS_ORIGINS: '*' } });
  const r = await star.get('/api/config', { headers: { origin: 'https://anything.example' } });
  assert.equal(r.headers['access-control-allow-origin'], undefined, 'a wildcard is not honoured');
});

test('authenticated responses are never cached and all responses carry security headers', async () => {
  const t = await makeApp();
  const c = await t.customer();
  const me = await t.get('/api/me', c.as);
  assert.equal(me.headers['cache-control'], 'no-store');
  assert.equal(me.headers['x-content-type-options'], 'nosniff');
  const adm = await t.admin();
  const stats = await adm.get('/api/admin/stats');
  assert.equal(stats.headers['cache-control'], 'no-store');
  const err = await t.get('/api/me');
  assert.equal(err.status, 401);
  assert.equal(err.headers['cache-control'], 'no-store');
  assert.equal(err.json.error, 'unauthorized');
});

test('tokens work only for their own audience', async () => {
  const t = await makeApp();
  const c = await t.customer({ verify: true });
  const adminToken = await t.adminToken();
  assert.equal((await t.get('/api/me', c.as)).status, 200);
  assert.equal((await t.get('/api/admin/stats', c.as)).status, 401, 'customer token must not open admin endpoints');
  assert.equal((await t.get('/api/me', { token: adminToken })).status, 401, 'admin token must not open customer endpoints');
  assert.equal((await t.get('/api/admin/stats', { token: adminToken })).status, 200);

  // A token signed with another secret, a mangled token and an expired one are all refused.
  const other = await makeApp({ env: { SECRET: 'z'.repeat(48) } });
  const foreign = await other.customer();
  assert.equal((await t.get('/api/me', foreign.as)).status, 401);
  assert.equal((await t.get('/api/me', { token: `${c.token.slice(0, -2)}xx` })).status, 401);
  assert.equal((await t.get('/api/me', { token: 'garbage' })).status, 401);
  t.time.advance(8 * 24 * 3600 * 1000);
  assert.equal((await t.get('/api/me', c.as)).status, 401, 'customer tokens last 7 days');
  const fresh = await t.adminToken();
  t.time.advance(13 * 3600 * 1000);
  assert.equal((await t.get('/api/admin/stats', { token: fresh })).status, 401, 'admin tokens last 12 hours');
});

test('the admin API is disabled until ADMIN_EMAIL and ADMIN_PASSWORD are set', async () => {
  const t = await makeApp({ withAdmin: false });
  const login = await t.post('/api/admin/login', ADMIN);
  assert.equal(login.status, 503);
  assert.equal(login.json.error, 'admin_disabled');
  const stats = await t.get('/api/admin/stats', { token: 'anything' });
  assert.equal(stats.status, 503);
  const weak = await makeApp({ env: { ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'short' } });
  assert.equal((await weak.post('/api/admin/login', { email: 'a@b.co', password: 'short' })).status, 503, 'a short admin password switches the admin off');
  assert.ok(weak.logs.errors.length > 0);
});

test('admin login: generic errors and a per-IP rate limit', async () => {
  const t = await makeApp();
  const wrongPw = await t.post('/api/admin/login', { email: ADMIN.email, password: 'wrong-password-x' });
  const wrongEmail = await t.post('/api/admin/login', { email: 'nobody@example.com', password: ADMIN.password });
  assert.equal(wrongPw.status, 401);
  assert.equal(wrongEmail.status, 401);
  assert.deepEqual(wrongPw.json, wrongEmail.json, 'same message whichever part was wrong');
  for (let i = 0; i < 8; i++) await t.post('/api/admin/login', { email: ADMIN.email, password: 'nope-nope-nope' });
  const limited = await t.post('/api/admin/login', ADMIN);
  assert.equal(limited.status, 429);
  assert.equal(limited.json.error, 'rate_limited');
  assert.ok(Number(limited.headers['retry-after']) > 0);
  const otherIp = await t.post('/api/admin/login', ADMIN, { ip: '192.0.2.99' });
  assert.equal(otherIp.status, 200);
});

test('the admin password can be given as a scrypt hash', async () => {
  const { hashPassword } = await import('../lib/auth.mjs');
  const hash = await hashPassword('my-long-admin-password');
  const t = await makeApp({ env: { ADMIN_PASSWORD: hash } });
  assert.equal((await t.post('/api/admin/login', { email: ADMIN.email, password: 'my-long-admin-password' })).status, 200);
  assert.equal((await t.post('/api/admin/login', { email: ADMIN.email, password: hash })).status, 401, 'the hash itself is not a password');
});

test('a missing SECRET is fatal in production and ephemeral (with a warning) otherwise', async () => {
  const { createApp } = await import('../app.mjs');
  assert.throws(() => createApp({ dataDir: '/nonexistent', env: { NODE_ENV: 'production' } }), /SECRET is required/);
  assert.throws(() => createApp({ dataDir: '/nonexistent', env: { NODE_ENV: 'production', SECRET: 'short' } }), /too short/);
  const warnings = [];
  createApp({ dataDir: '/nonexistent', env: {}, log: { warn: (m) => warnings.push(m), error() {} } });
  assert.match(warnings[0], /SECRET is not set/);
});

test('admin pages are served with the right types and security headers', async () => {
  const t = await makeApp();
  for (const url of ['/admin/', '/admin', '/admin/index.html']) {
    const r = await t.get(url);
    assert.equal(r.status, 200, url);
    assert.match(r.headers['content-type'], /text\/html/);
    assert.match(r.headers['content-security-policy'], /default-src 'self'/);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-frame-options'], 'DENY');
  }
  assert.match((await t.get('/admin')).text, /<base href="\/admin\/">/, '/admin without a slash still loads its assets');
  assert.match((await t.get('/admin/admin.js')).headers['content-type'], /javascript/);
  assert.match((await t.get('/admin/admin.css')).headers['content-type'], /text\/css/);
  assert.equal((await t.get('/admin/../server/app.mjs')).status, 404);
  assert.equal((await t.get('/admin/.env')).status, 404);
  assert.equal((await t.get('/admin/admin.mjs')).status, 404);
  assert.equal((await t.req('POST', '/admin/', { body: {} })).status, 405);
});

test('concurrent registrations with the same email create exactly one account', async () => {
  const t = await makeApp();
  const body = { company: 'Race Co', gstin: '27ABCDE1234F1Z5', name: 'Racer', email: 'race@example.com', phone: '9876543210', password: 'a-good-password-1', city: 'Pune', state: 'Maharashtra' };
  const results = await Promise.all([1, 2, 3, 4].map((i) => t.post('/api/auth/register', body, { ip: `192.0.2.${i}` })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409]);
  const adm = await t.admin();
  assert.equal((await adm.get('/api/admin/accounts')).json.total, 1);
});

test('concurrent quote requests get unique sequential references and the files stay valid JSON', async () => {
  const t = await makeApp();
  const make = (i) => t.post('/api/quotes', { contact, lines: [{ pn: `P${i}`, qty: 1 }], kind: 'quote' }, { ip: `192.0.2.${i + 1}` });
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => make(i)));
  assert.ok(results.every((r) => r.status === 201));
  const refs = results.map((r) => r.json.ref).sort();
  assert.equal(new Set(refs).size, 12);
  assert.equal(refs[0], 'Q-2026-00001');
  assert.equal(refs[11], 'Q-2026-00012');
  const stored = JSON.parse(await readFile(join(t.dataDir, 'quotes.json'), 'utf8'));
  assert.equal(stored.items.length, 12);
  assert.ok(!(await readdir(t.dataDir)).some((f) => f.endsWith('.tmp')), 'no temp files left behind');
});

test('a failed change leaves the data untouched', async () => {
  const t = await makeApp();
  await t.app.ready();
  const before = await readFile(join(t.dataDir, 'accounts.json'), 'utf8');
  await assert.rejects(() => t.app.store.tx(['accounts'], (d) => { d.accounts.items.push({ id: 'x' }); throw new Error('boom'); }), /boom/);
  assert.equal(t.app.store.get('accounts').items.length, 0);
  assert.equal(await readFile(join(t.dataDir, 'accounts.json'), 'utf8'), before);
});

test('a damaged data file stops the server instead of being overwritten', async () => {
  const t = await makeApp();
  await t.get('/api/health');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(t.dataDir, 'orders.json'), '{ not json');
  const { createApp } = await import('../app.mjs');
  const again = createApp({ dataDir: t.dataDir, env: { SECRET: 's'.repeat(48) }, mailer: t.mailer, log: { warn() {}, error() {} } });
  await assert.rejects(() => again.ready(), /orders\.json is not valid JSON/);
  assert.equal(await readFile(join(t.dataDir, 'orders.json'), 'utf8'), '{ not json');
});
