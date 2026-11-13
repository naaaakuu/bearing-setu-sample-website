import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, shipTo } from './helpers.mjs';

/** A shop in list pricing mode with flat freight, one priced product, and a verified customer. */
async function listShop(t) {
  const adm = await t.admin();
  await adm.put('/api/admin/settings', {
    business: { name: 'Bearingsetu', stateCode: '27' }, pricing: { mode: 'list', gstRate: 18 }, shipping: { mode: 'flat', flatFee: 100, freeOver: null },
  });
  await adm.put('/api/admin/commercial/skf-6205', { price: 1000 });
  await adm.put('/api/admin/commercial/skf-6206', { price: 500 });
  return adm;
}
const creditBody = (over = {}) => ({ status: 'approved', limit: 500000, termsDays: 30, ...over });
const order = (t, c, qty, payment = 'credit', id = 'skf-6205') => t.post('/api/me/orders', { lines: [{ id, qty }], payment, shipTo }, c.as);

test('every new account starts with credit off, and customers cannot see any credit details', async () => {
  const t = await makeApp();
  const c = await t.customer();
  const me = (await t.get('/api/me', c.as)).json.account;
  assert.deepEqual(me.credit, { status: 'none' });
  assert.equal('limit' in me.credit, false);
  assert.equal('used' in me.credit, false);
  assert.equal('termsDays' in me.credit, false);
  assert.equal(JSON.stringify(me).includes('termsDays'), false);
});

test('only the administrator can change credit', async () => {
  const t = await makeApp();
  const c = await t.customer({ verify: true });
  const url = `/api/admin/accounts/${c.id}/credit`;
  assert.equal((await t.put(url, creditBody())).status, 401, 'no token');
  assert.equal((await t.put(url, creditBody(), c.as)).status, 401, 'customer token');
  assert.equal((await t.post(`${url}/payments`, { amount: 1, ref: 'x' }, c.as)).status, 401);
  // sneaking credit into the customer endpoints does nothing
  await t.patch('/api/me', { credit: { status: 'approved', limit: 1e6, termsDays: 30 } }, c.as);
  await t.post('/api/auth/register', { credit: { status: 'approved' } });
  const adm = await t.admin();
  assert.equal((await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.status, 'none');
  assert.equal((await adm.put(url, creditBody())).status, 200);
});

test('approval preconditions: verified account, limit above 0, terms 1 to 180 days', async () => {
  const t = await makeApp();
  const pending = await t.customer();
  const verified = await t.customer({ verify: true });
  const adm = await t.admin();
  const notVerified = await adm.put(`/api/admin/accounts/${pending.id}/credit`, creditBody());
  assert.equal(notVerified.status, 409);
  assert.equal(notVerified.json.error, 'account_not_verified');

  const url = `/api/admin/accounts/${verified.id}/credit`;
  for (const bad of [{ limit: 0 }, { limit: -5 }, { limit: 'lots' }, { limit: 10.555 }, { termsDays: 0 }, { termsDays: 181 }, { termsDays: 30.5 }, { limit: undefined }, { termsDays: undefined }, { status: 'maybe' }]) {
    const r = await adm.put(url, creditBody(bad));
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.json.error, 'invalid_input');
  }
  assert.equal((await adm.get(`/api/admin/accounts/${verified.id}`)).json.account.credit.status, 'none', 'nothing changed after refusals');
  for (const edge of [{ termsDays: 1 }, { termsDays: 180 }]) assert.equal((await adm.put(url, creditBody(edge))).status, 200);
  // suspending credit that was never approved is refused, so no customer ever hears about credit they never had
  const never = await t.customer({ verify: true });
  const s = await adm.put(`/api/admin/accounts/${never.id}/credit`, { status: 'suspended' });
  assert.equal(s.status, 409);
  assert.equal(s.json.error, 'invalid_credit_transition');
  assert.equal(t.mailer.to(never.email).filter((m) => /credit/i.test(m.subject)).length, 0);
});

test('approving credit audits, notifies and emails the customer with exact values', async () => {
  const t = await makeApp();
  const c = await t.customer({ verify: true });
  const adm = await t.admin();
  t.mailer.clear();
  const r = await adm.put(`/api/admin/accounts/${c.id}/credit`, creditBody({ limit: 500000, termsDays: 45, note: 'Welcome aboard' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.changed, true);
  assert.equal(r.json.account.credit.available, 500000);

  const mails = t.mailer.to(c.email);
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /credit facility has been approved/i);
  assert.match(mails[0].text, /5,00,000\.00/);
  assert.match(mails[0].text, /45 days/);
  assert.match(mails[0].text, /Not enabled -> Approved/);
  assert.match(mails[0].text, /Welcome aboard/);
  assert.match(mails[0].html, /5,00,000\.00/);

  const notes = (await t.get('/api/me/notifications', c.as)).json.items;
  assert.match(notes[0].title, /approved/i);
  assert.match(notes[0].body, /500,000|5,00,000/);
  const audit = (await adm.get(`/api/admin/audit?entity=credit&accountId=${c.id}`)).json.items;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'credit.change');
  assert.deepEqual(audit[0].before, { status: 'none', limit: 0, termsDays: 0 });
  assert.deepEqual(audit[0].after, { status: 'approved', limit: 500000, termsDays: 45 });
  assert.equal(audit[0].actor, 'admin');

  // the customer now sees the facility, the only audience that ever can
  const me = (await t.get('/api/me', c.as)).json.account.credit;
  assert.deepEqual({ ...me, updatedAt: undefined }, { status: 'approved', limit: 500000, used: 0, available: 500000, termsDays: 45, updatedAt: undefined });
});

test('limit, terms, suspension, reinstatement and withdrawal each email old and new values', async () => {
  const t = await makeApp();
  const c = await t.customer({ verify: true });
  const adm = await t.admin();
  const url = `/api/admin/accounts/${c.id}/credit`;
  await adm.put(url, creditBody({ limit: 100000, termsDays: 30 }));
  const last = () => t.mailer.to(c.email).at(-1);

  await adm.put(url, creditBody({ limit: 250000, termsDays: 30 }));
  assert.match(last().subject, /limit has changed/i);
  assert.match(last().text, /1,00,000\.00 -> .*2,50,000\.00/);
  assert.doesNotMatch(last().text, /Payment terms/);

  await adm.put(url, creditBody({ limit: 250000, termsDays: 60 }));
  assert.match(last().subject, /payment terms have changed/i);
  assert.match(last().text, /30 days -> 60 days/);

  await adm.put(url, creditBody({ limit: 300000, termsDays: 15 }));
  assert.match(last().subject, /limit and payment terms/i);
  assert.match(last().text, /2,50,000\.00 -> .*3,00,000\.00/);
  assert.match(last().text, /60 days -> 15 days/);

  await adm.put(url, { status: 'suspended' });
  assert.match(last().subject, /suspended/i);
  assert.match(last().text, /Approved -> Suspended/);
  assert.match(last().text, /cannot place new orders on credit/i);
  assert.equal((await t.get('/api/me', c.as)).json.account.credit.status, 'none', 'a suspended facility shows no credit details');

  await adm.put(url, creditBody({ limit: 300000, termsDays: 15 }));
  assert.match(last().subject, /reinstated/i);

  await adm.put(url, { status: 'none' });
  assert.match(last().subject, /withdrawn/i);
  assert.match(last().text, /Approved -> Not enabled/);
  assert.match(last().text, /3,00,000\.00 -> .*0\.00/);

  const audit = (await adm.get(`/api/admin/audit?entity=credit&accountId=${c.id}`)).json.items;
  assert.equal(audit.length, 7);
  const notes = (await t.get('/api/me/notifications', c.as)).json.items;
  assert.equal(notes.filter((n) => /credit/i.test(n.title)).length, 7);
  assert.equal(t.mailer.to(c.email).filter((m) => /credit/i.test(m.subject)).length, 7);
});

test('saving the same credit settings again changes nothing and sends nothing', async () => {
  const t = await makeApp();
  const c = await t.customer({ verify: true });
  const adm = await t.admin();
  await adm.put(`/api/admin/accounts/${c.id}/credit`, creditBody());
  t.mailer.clear();
  const again = await adm.put(`/api/admin/accounts/${c.id}/credit`, creditBody());
  assert.equal(again.status, 200);
  assert.equal(again.json.changed, false);
  assert.equal(t.mailer.sent.length, 0);
  assert.equal((await adm.get(`/api/admin/audit?entity=credit&accountId=${c.id}`)).json.items.length, 1);
});

test('credit orders: not enabled, not verified, limit exceeded, success and the available figure', async () => {
  const t = await makeApp();
  const adm = await listShop(t);
  const c = await t.customer({ verify: true });

  const off = await order(t, c, 1);
  assert.equal(off.status, 403);
  assert.equal(off.json.error, 'credit_not_enabled');

  await adm.put(`/api/admin/accounts/${c.id}/credit`, creditBody({ limit: 5000, termsDays: 30 }));
  // 4 x 1000 + 100 freight = 4100, + 18% GST = 4838
  const ok = await order(t, c, 4);
  assert.equal(ok.status, 201);
  assert.equal(ok.json.order.total, 4838);
  assert.equal(ok.json.order.payment.method, 'credit');
  assert.equal(ok.json.order.payment.status, 'on-credit');
  assert.equal(ok.json.order.payment.termsDays, 30);
  assert.equal(ok.json.account.credit.used, 4838);
  assert.equal(ok.json.account.credit.available, 162);
  assert.equal((await t.get('/api/me', c.as)).json.account.credit.used, 4838);

  const tooMuch = await order(t, c, 1); // 1000 + 100 + 18% = 1298 > 162
  assert.equal(tooMuch.status, 409);
  assert.equal(tooMuch.json.error, 'credit_limit_exceeded');
  assert.equal((await t.get('/api/me', c.as)).json.account.credit.used, 4838, 'a refused order changes nothing');
  assert.equal((await t.get('/api/me/orders', c.as)).json.items.length, 1);

  // an order exactly equal to the available credit is allowed
  await adm.put(`/api/admin/accounts/${c.id}/credit`, creditBody({ limit: 4838 + 1298, termsDays: 30 }));
  assert.equal((await order(t, c, 1)).status, 201);
  assert.equal((await t.get('/api/me', c.as)).json.account.credit.available, 0);

  // pending (unverified) accounts can never use credit even if approval is somehow on file
  const pending = await t.customer();
  assert.equal((await order(t, pending, 1)).json.error, 'credit_not_enabled');
  await adm.patch(`/api/admin/accounts/${c.id}`, { status: 'pending' });
  assert.equal((await order(t, c, 1)).json.error, 'credit_not_enabled', 'credit needs a verified account');
  assert.deepEqual((await t.get('/api/me', c.as)).json.account.credit, { status: 'none' }, 'and its details are hidden again');
  // suspended credit also blocks
  await adm.patch(`/api/admin/accounts/${c.id}`, { status: 'verified' });
  await adm.put(`/api/admin/accounts/${c.id}/credit`, { status: 'suspended' });
  assert.equal((await order(t, c, 1)).json.error, 'credit_not_enabled');
  // and paying by bank transfer is never blocked by credit rules
  assert.equal((await order(t, c, 1, 'bank-transfer')).status, 201);
});

test('concurrent credit orders can never exceed the limit', async () => {
  const t = await makeApp();
  const adm = await listShop(t);
  const c = await t.customer({ verify: true });
  await adm.put(`/api/admin/accounts/${c.id}/credit`, creditBody({ limit: 3000, termsDays: 30 }));
  // each order is 1298; only two fit in 3000
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => order(t, c, 1)));
  assert.equal(results.filter((r) => r.status === 201).length, 2);
  assert.equal(results.filter((r) => r.status === 409).length, 3);
  const acc = (await adm.get(`/api/admin/accounts/${c.id}`)).json.account;
  assert.equal(acc.credit.used, 2596);
  assert.equal(acc.credit.available, 404);
});

test('cancelling an unpaid credit order releases its credit, once', async () => {
  const t = await makeApp();
  const adm = await listShop(t);
  const c = await t.customer({ verify: true });
  await adm.put(`/api/admin/accounts/${c.id}/credit`, creditBody({ limit: 10000, termsDays: 30 }));
  const a = (await order(t, c, 2)).json.order; // 2000+100 -> 2478
  const b = (await order(t, c, 1)).json.order; // 1298
  assert.equal((await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.used, 2478 + 1298);

  t.mailer.clear();
  const cancelled = await adm.patch(`/api/admin/orders/${a.no}`, { status: 'cancelled', note: 'Customer asked' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.order.status, 'cancelled');
  assert.equal(cancelled.json.order.payment.releasedAmount, 2478);
  assert.equal((await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.used, 1298);
  assert.match(t.mailer.to(c.email)[0].text, /has been released/);
  const again = await adm.patch(`/api/admin/orders/${a.no}`, { status: 'cancelled' });
  assert.equal(again.status, 200);
  assert.equal((await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.used, 1298, 'releasing twice is impossible');
  assert.equal((await adm.patch(`/api/admin/orders/${a.no}`, { status: 'confirmed' })).status, 409);

  // a credit order that was paid is not released when cancelled later
  await adm.patch(`/api/admin/orders/${b.no}`, { status: 'confirmed' });
  await adm.post(`/api/admin/accounts/${c.id}/credit/payments`, { amount: 1298, ref: 'UTR-1', orderNo: b.no });
  assert.equal((await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.used, 0);
  const paidOrder = (await adm.get(`/api/admin/orders/${b.no}`)).json.order;
  assert.equal(paidOrder.payment.status, 'paid');
});

test('recording a payment reduces what is owed, is audited, notified and emailed, and cannot go below zero', async () => {
  const t = await makeApp();
  const adm = await listShop(t);
  const c = await t.customer({ verify: true });
  await adm.put(`/api/admin/accounts/${c.id}/credit`, creditBody({ limit: 20000, termsDays: 30 }));
  await order(t, c, 5); // 5000+100 = 5100 + 918 = 6018
  const url = `/api/admin/accounts/${c.id}/credit/payments`;
  assert.equal((await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.used, 6018);

  t.mailer.clear();
  const p = await adm.post(url, { amount: 2000, ref: 'NEFT-778', note: 'part payment' });
  assert.equal(p.status, 200);
  assert.equal(p.json.account.credit.used, 4018);
  assert.equal(p.json.available, 15982);
  assert.match(t.mailer.to(c.email)[0].subject, /Payment received/);
  assert.match(t.mailer.to(c.email)[0].text, /NEFT-778/);
  assert.match(t.mailer.to(c.email)[0].text, /40,18\.00|4,018\.00/);
  const audit = (await adm.get(`/api/admin/audit?entity=credit&accountId=${c.id}`)).json.items;
  assert.equal(audit[0].action, 'credit.payment');
  assert.deepEqual([audit[0].before.used, audit[0].after.used], [6018, 4018]);
  assert.match((await t.get('/api/me/notifications', c.as)).json.items[0].title, /Payment received/);
  assert.equal(t.mailer.sent.length, 1);

  const over = await adm.post(url, { amount: 5000, ref: 'TOO-MUCH' });
  assert.equal(over.status, 409);
  assert.equal(over.json.error, 'payment_exceeds_outstanding');
  assert.equal((await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.used, 4018);
  for (const bad of [{ amount: 0, ref: 'x' }, { amount: -5, ref: 'x' }, { amount: 'ten', ref: 'x' }, { amount: 10 }, { amount: 10, ref: '' }]) {
    assert.equal((await adm.post(url, bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await adm.post(url, { amount: 4018, ref: 'FINAL' })).json.account.credit.used, 0);
  assert.equal((await adm.post('/api/admin/accounts/acc_nope/credit/payments', { amount: 1, ref: 'x' })).status, 404);
});

test('credit amounts stay exact to the paisa (no floating point drift)', async () => {
  const t = await makeApp();
  const adm = await listShop(t);
  await adm.put('/api/admin/commercial/skf-6205', { price: 0.1 });
  const c = await t.customer({ verify: true });
  await adm.put(`/api/admin/accounts/${c.id}/credit`, creditBody({ limit: 1000, termsDays: 30 }));
  for (let i = 0; i < 3; i++) assert.equal((await order(t, c, 3)).status, 201);
  const used = (await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.used;
  const per = (await t.get('/api/me/orders', c.as)).json.items[0].total;
  assert.equal(used, Math.round(per * 3 * 100) / 100);
  assert.ok((String(used).split('.')[1]?.length ?? 0) <= 2);
  await adm.post(`/api/admin/accounts/${c.id}/credit/payments`, { amount: used, ref: 'ALL' });
  assert.equal((await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.used, 0);
});
