import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeApp, PASSWORD } from './helpers.mjs';

const valid = { company: 'Shree Engineering', gstin: '27ABCDE1234F1Z5', name: 'Meera Joshi', email: 'Meera@Example.com', phone: '+91 98765 43210', password: PASSWORD, city: 'Pune', state: 'Maharashtra' };

test('register: valid input creates a pending account with credit off and emails the customer', async () => {
  const t = await makeApp();
  await (await t.admin()).put('/api/admin/settings', { email: { notifyTo: ['staff@example.com'] } });
  t.mailer.clear();
  const r = await t.post('/api/auth/register', valid);
  assert.equal(r.status, 201);
  assert.deepEqual(r.json, { ok: true });

  const adm = await t.admin();
  const list = (await adm.get('/api/admin/accounts')).json;
  assert.equal(list.total, 1);
  const a = list.items[0];
  assert.equal(a.status, 'pending');
  assert.equal(a.email, 'meera@example.com', 'emails are stored in lowercase');
  assert.equal(a.stateCode, '27');
  assert.equal(a.credit.status, 'none');
  assert.equal(a.credit.limit, 0);
  assert.equal(a.credit.available, 0);
  assert.equal(a.discountPct, 0);
  assert.equal(a.passwordHash, undefined, 'password hashes are never returned');
  assert.ok(!JSON.stringify(list).includes('scrypt'));

  assert.equal(t.mailer.to('meera@example.com').length, 1, 'acknowledgement to the customer');
  assert.equal(t.mailer.to('staff@example.com').length, 1, 'staff are told');
  assert.doesNotMatch(JSON.stringify(t.mailer.sent), new RegExp(PASSWORD));
  // The password is stored only as a salted hash on disk.
  const file = await readFile(join(t.dataDir, 'accounts.json'), 'utf8');
  assert.doesNotMatch(file, new RegExp(PASSWORD));
  assert.match(file, /scrypt:/);
});

test('register: every field is validated', async () => {
  const t = await makeApp();
  const cases = [
    ['company', '', 'company'], ['company', 'x', 'company'],
    ['gstin', '27ABCDE1234F1Z', 'gstin'], ['gstin', '27abcde1234f1z', 'gstin'], ['gstin', 'AAABCDE1234F1Z5', 'gstin'],
    ['name', '', 'name'], ['email', 'not-an-email', 'email'], ['email', 'a@b', 'email'], ['email', 'a b@c.com', 'email'],
    ['phone', 'abc', 'phone'], ['phone', '12', 'phone'],
    ['password', 'short', 'password'], ['password', 'x'.repeat(201), 'password'], ['password', 12345678901, 'password'],
    ['city', '', 'city'], ['state', '', 'state'],
  ];
  let n = 0;
  for (const [field, value, expected] of cases) {
    const r = await t.post('/api/auth/register', { ...valid, [field]: value }, { ip: `192.0.2.${++n}` });
    assert.equal(r.status, 400, `${field}=${JSON.stringify(value)}`);
    assert.equal(r.json.error, 'invalid_input');
    assert.equal(r.json.field, expected);
    assert.equal(typeof r.json.message, 'string');
  }
  const missing = await t.post('/api/auth/register', {}, { ip: '192.0.2.200' });
  assert.equal(missing.status, 400);
  // a lowercase GSTIN typed by a person is accepted and normalised, only a wrong shape is refused
  const lower = await t.post('/api/auth/register', { ...valid, gstin: '27abcde1234f1z5', email: 'lower@example.com' }, { ip: '192.0.2.201' });
  assert.equal(lower.status, 201);
  const adm = await t.admin();
  assert.equal((await adm.get('/api/admin/accounts?q=lower@')).json.items[0].gstin, '27ABCDE1234F1Z5');
});

test('register: a duplicate email is a 409, whatever the letter case', async () => {
  const t = await makeApp();
  assert.equal((await t.post('/api/auth/register', valid, { ip: '192.0.2.1' })).status, 201);
  const dup = await t.post('/api/auth/register', { ...valid, email: 'MEERA@example.COM', company: 'Other Co' }, { ip: '192.0.2.2' });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error, 'email_exists');
});

test('register: rate limited to 5 per hour per IP', async () => {
  const t = await makeApp();
  for (let i = 0; i < 5; i++) {
    assert.equal((await t.post('/api/auth/register', { ...valid, email: `r${i}@example.com` }, { ip: '192.0.2.50' })).status, 201);
  }
  const sixth = await t.post('/api/auth/register', { ...valid, email: 'r6@example.com' }, { ip: '192.0.2.50' });
  assert.equal(sixth.status, 429);
  t.time.advance(61 * 60 * 1000);
  assert.equal((await t.post('/api/auth/register', { ...valid, email: 'r7@example.com' }, { ip: '192.0.2.50' })).status, 201, 'the window slides');
});

test('login: wrong password and unknown email give the same generic error', async () => {
  const t = await makeApp();
  await t.post('/api/auth/register', valid);
  const wrong = await t.post('/api/auth/login', { email: 'meera@example.com', password: 'not-the-password' });
  const unknown = await t.post('/api/auth/login', { email: 'ghost@example.com', password: 'not-the-password' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.json, unknown.json);
  assert.equal(wrong.json.error, 'invalid_credentials');
  assert.equal((await t.post('/api/auth/login', {})).status, 400);
});

test('login: pending accounts may log in and see their status; the account has no hash and credit is off', async () => {
  const t = await makeApp();
  await t.post('/api/auth/register', valid);
  const r = await t.post('/api/auth/login', { email: ' MEERA@example.com ', password: PASSWORD });
  assert.equal(r.status, 200);
  assert.ok(r.json.token.includes('.'));
  assert.equal(r.json.account.status, 'pending');
  assert.deepEqual(r.json.account.credit, { status: 'none' });
  assert.equal(r.json.account.passwordHash, undefined);
  assert.equal(r.json.account.adminNote, undefined);
  const me = await t.get('/api/me', { token: r.json.token });
  assert.deepEqual(me.json.account, r.json.account);
});

test('login: a suspended account is blocked, even with a token from before', async () => {
  const t = await makeApp();
  const c = await t.customer({ verify: true });
  const adm = await t.admin();
  assert.equal((await t.get('/api/me', c.as)).status, 200);
  await adm.patch(`/api/admin/accounts/${c.id}`, { status: 'suspended' });
  const login = await t.post('/api/auth/login', { email: c.email, password: (await import('./helpers.mjs')).PASSWORD });
  assert.equal(login.status, 403);
  assert.equal(login.json.error, 'account_suspended');
  const old = await t.get('/api/me', c.as);
  assert.equal(old.status, 403, 'a token issued before the suspension stops working');
  // a wrong password on a suspended account must not reveal that it exists or is suspended
  const wrong = await t.post('/api/auth/login', { email: c.email, password: 'wrong-wrong-wrong' });
  assert.equal(wrong.status, 401);
});

test('login: rate limited to 10 attempts per 15 minutes per IP', async () => {
  const t = await makeApp();
  await t.post('/api/auth/register', valid);
  for (let i = 0; i < 10; i++) {
    const r = await t.post('/api/auth/login', { email: 'meera@example.com', password: 'wrong-wrong-wrong' }, { ip: '192.0.2.77' });
    assert.equal(r.status, 401);
  }
  const blocked = await t.post('/api/auth/login', { email: 'meera@example.com', password: PASSWORD }, { ip: '192.0.2.77' });
  assert.equal(blocked.status, 429, 'even the right password is refused while limited');
  assert.equal(blocked.json.error, 'rate_limited');
  assert.equal((await t.post('/api/auth/login', { email: 'meera@example.com', password: PASSWORD }, { ip: '192.0.2.78' })).status, 200, 'other visitors are unaffected');
  t.time.advance(16 * 60 * 1000);
  assert.equal((await t.post('/api/auth/login', { email: 'meera@example.com', password: PASSWORD }, { ip: '192.0.2.77' })).status, 200);
});

test('rate limits use the proxy header only when TRUST_PROXY is set', async () => {
  const plain = await makeApp();
  const trusted = await makeApp({ env: { TRUST_PROXY: '1' } });
  const hit = (t, xff) => t.post('/api/auth/login', { email: 'x@example.com', password: 'wrong-wrong-wrong' }, { ip: '10.0.0.1', headers: { 'x-forwarded-for': xff } });
  for (let i = 0; i < 10; i++) { await hit(plain, `1.1.1.${i}`); await hit(trusted, `1.1.1.${i}`); }
  assert.equal((await hit(plain, '9.9.9.9')).status, 429, 'a spoofed header does not dodge the limit');
  assert.equal((await hit(trusted, '9.9.9.9')).status, 401, 'behind a trusted proxy each visitor has their own limit');
});

test('customers can edit only their own contact details', async () => {
  const t = await makeApp();
  const c = await t.customer({ verify: true });
  const r = await t.patch('/api/me', {
    name: 'New Name', phone: '9000000000', city: 'Mumbai', state: 'Maharashtra',
    shipTo: [{ label: 'Plant', line1: '1 Road', city: 'Pune', state: 'Maharashtra', pin: '411001' }],
    status: 'verified', credit: { status: 'approved', limit: 1e9 }, discountPct: 50, email: 'hacker@example.com', adminNote: 'x', customPrices: { 'skf-6205': 1 },
  }, c.as);
  assert.equal(r.status, 200);
  assert.equal(r.json.account.name, 'New Name');
  assert.equal(r.json.account.shipTo.length, 1);
  assert.deepEqual(r.json.account.credit, { status: 'none' });
  assert.equal(r.json.account.discountPct, 0);
  assert.equal(r.json.account.email, c.email);
  const a = (await (await t.admin()).get(`/api/admin/accounts/${c.id}`)).json.account;
  assert.equal(a.credit.status, 'none');
  assert.equal(a.adminNote, '');
  assert.deepEqual(a.customPrices, {});
  const bad = await t.patch('/api/me', { shipTo: [{ line1: 'x' }] }, c.as);
  assert.equal(bad.status, 400);
});

test('admin account list can be searched and filtered and the detail view needs the admin token', async () => {
  const t = await makeApp();
  const a = await t.customer({ company: 'Alpha Bearings' });
  await t.customer({ company: 'Beta Belts', verify: true });
  const adm = await t.admin();
  assert.equal((await adm.get('/api/admin/accounts')).json.total, 2);
  assert.equal((await adm.get('/api/admin/accounts?status=pending')).json.total, 1);
  assert.equal((await adm.get('/api/admin/accounts?q=beta')).json.items[0].company, 'Beta Belts');
  assert.equal((await adm.get('/api/admin/accounts?q=zzz')).json.total, 0);
  const detail = await adm.get(`/api/admin/accounts/${a.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(Object.keys(detail.json).sort(), ['account', 'audit', 'orders', 'quotes']);
  assert.ok(detail.json.audit.some((e) => e.action === 'account.register'));
  assert.equal((await t.get(`/api/admin/accounts/${a.id}`, a.as)).status, 401);
  assert.equal((await adm.get('/api/admin/accounts/acc_missing')).status, 404);
  assert.equal((await t.get('/api/admin/accounts')).status, 401);
});

test('verifying or suspending an account is audited, notified and emailed', async () => {
  const t = await makeApp();
  const c = await t.customer();
  const adm = await t.admin();
  t.mailer.clear();
  const r = await adm.patch(`/api/admin/accounts/${c.id}`, { status: 'verified', adminNote: 'GSTIN checked on portal', discountPct: 5 });
  assert.equal(r.status, 200);
  assert.equal(r.json.account.status, 'verified');
  assert.equal(r.json.account.discountPct, 5);
  assert.equal(r.json.account.adminNote, 'GSTIN checked on portal');
  assert.equal(t.mailer.find(/verified/i).length, 1);
  const notes = (await t.get('/api/me/notifications', c.as)).json;
  assert.equal(notes.unread, 1);
  assert.match(notes.items[0].title, /verified/i);
  const audit = (await adm.get(`/api/admin/audit?entity=account&entityId=${c.id}`)).json.items;
  assert.ok(audit.some((e) => e.action === 'account.status' && e.before.status === 'pending' && e.after.status === 'verified'));
  // no email when nothing about the status changed
  t.mailer.clear();
  await adm.patch(`/api/admin/accounts/${c.id}`, { adminNote: 'again' });
  assert.equal(t.mailer.sent.length, 0);
  assert.equal((await adm.patch(`/api/admin/accounts/${c.id}`, { discountPct: 51 })).status, 400);
  assert.equal((await adm.patch(`/api/admin/accounts/${c.id}`, { status: 'banana' })).status, 400);
  assert.equal((await adm.patch(`/api/admin/accounts/${c.id}`, { customPrices: { nonsense: 5 } })).status, 400);
  const ok = await adm.patch(`/api/admin/accounts/${c.id}`, { customPrices: { 'skf-6205': 90.5 } });
  assert.deepEqual(ok.json.account.customPrices, { 'skf-6205': 90.5 });
});

test('notifications can be marked read, one by one or all together, and are private', async () => {
  const t = await makeApp();
  const c = await t.customer();
  const other = await t.customer();
  const adm = await t.admin();
  await adm.patch(`/api/admin/accounts/${c.id}`, { status: 'verified' });
  await adm.patch(`/api/admin/accounts/${c.id}`, { status: 'suspended' });
  await adm.patch(`/api/admin/accounts/${c.id}`, { status: 'pending' });
  await adm.patch(`/api/admin/accounts/${c.id}`, { status: 'verified' });
  let list = (await t.get('/api/me/notifications', c.as)).json;
  assert.equal(list.items.length, 4);
  assert.equal(list.unread, 4);
  assert.ok(list.items[0].at >= list.items[3].at, 'newest first');
  assert.deepEqual(Object.keys(list.items[0]).sort(), ['at', 'body', 'id', 'read', 'title']);
  assert.equal((await t.get('/api/me/notifications', other.as)).json.items.length, 0);
  const one = await t.post('/api/me/notifications/read', { ids: [list.items[0].id] }, c.as);
  assert.equal(one.json.unread, 3);
  const foreign = await t.post('/api/me/notifications/read', { ids: list.items.map((i) => i.id) }, other.as);
  assert.equal(foreign.json.unread, 0);
  list = (await t.get('/api/me/notifications', c.as)).json;
  assert.equal(list.unread, 3, "someone else cannot mark my notifications read");
  assert.equal((await t.post('/api/me/notifications/read', {}, c.as)).json.unread, 0);
});
