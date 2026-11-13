import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, contact, shipTo } from './helpers.mjs';

const quoteBody = (over = {}) => ({ contact, lines: [{ id: 'skf-6205', qty: 10 }, { pn: 'Custom part 77', brand: 'Acme', qty: 5, note: 'urgent' }], kind: 'quote', ...over });
const respondBody = (over = {}) => ({
  status: 'responded', freight: 95, validUntil: '2026-07-15', note: 'Ex works Pune',
  lines: [{ index: 0, unitPrice: 100.5, leadDays: 2 }, { index: 1, unitPrice: 200, available: true }], ...over,
});

test('a guest can submit a quotation request; names come from the catalogue and staff are told', async () => {
  const t = await makeApp();
  await (await t.admin()).put('/api/admin/settings', { email: { notifyTo: ['staff@example.com', 'boss@example.com'] } });
  t.mailer.clear();
  const r = await t.post('/api/quotes', quoteBody({ lines: [{ id: 'skf-6205', pn: 'FAKE NAME', brand: 'Fake', qty: 10 }, { id: 'unknown-id', pn: 'Typed 123', qty: 2 }, { pn: 'Free text', qty: 1 }] }));
  assert.equal(r.status, 201);
  assert.equal(r.json.ref, 'Q-2026-00001');
  const q = (await (await t.admin()).get('/api/admin/quotes/Q-2026-00001')).json.quote;
  assert.equal(q.status, 'new');
  assert.equal(q.accountId, undefined);
  assert.deepEqual(q.lines[0], { id: 'skf-6205', pn: '6205', brand: 'SKF', title: 'Deep groove ball bearing, open', qty: 10 });
  assert.deepEqual(q.lines[1], { pn: 'Typed 123', qty: 2 }, 'an id the catalogue does not know is dropped, the typed part number is kept');
  assert.equal(q.history[0].status, 'new');
  assert.equal(t.mailer.to('guest@example.com').length, 1);
  assert.match(t.mailer.to('guest@example.com')[0].subject, /Q-2026-00001/);
  assert.equal(t.mailer.sent.filter((m) => m.to.includes('staff@example.com') && m.to.includes('boss@example.com')).length, 1, 'one email to all staff');
});

test('quotation validation: lines 1 to 200, quantity 1 to 1,000,000, contact details', async () => {
  const t = await makeApp();
  let n = 0;
  const post = (body) => t.post('/api/quotes', body, { ip: `192.0.2.${++n}` });
  const bad = async (body, field) => {
    const r = await post(body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 120));
    assert.equal(r.json.error, 'invalid_input');
    if (field) assert.equal(r.json.field, field);
  };
  await bad(quoteBody({ lines: [] }), 'lines');
  await bad(quoteBody({ lines: undefined }), 'lines');
  await bad(quoteBody({ lines: Array.from({ length: 201 }, (_, i) => ({ pn: `P${i}`, qty: 1 })) }), 'lines');
  await bad(quoteBody({ lines: [{ pn: 'A', qty: 0 }] }), 'lines[0].qty');
  await bad(quoteBody({ lines: [{ pn: 'A', qty: 1000001 }] }), 'lines[0].qty');
  await bad(quoteBody({ lines: [{ pn: 'A', qty: 1.5 }] }), 'lines[0].qty');
  await bad(quoteBody({ lines: [{ pn: 'A', qty: '5' }] }), 'lines[0].qty');
  await bad(quoteBody({ lines: [{ qty: 5 }] }), 'lines[0].pn');
  await bad(quoteBody({ lines: ['x'] }));
  await bad(quoteBody({ kind: 'weird' }), 'kind');
  await bad(quoteBody({ contact: { ...contact, email: 'nope' } }), 'contact.email');
  await bad(quoteBody({ contact: { ...contact, phone: '' } }), 'contact.phone');
  await bad(quoteBody({ contact: { ...contact, company: '' } }), 'contact.company');
  await bad(quoteBody({ contact: { ...contact, gstin: 'BAD' } }), 'contact.gstin');
  await bad(quoteBody({ contact: { ...contact, pincode: '12' } }), 'contact.pincode');
  await bad(quoteBody({ contact: undefined }), 'contact');
  assert.equal((await post(quoteBody({ lines: Array.from({ length: 200 }, (_, i) => ({ pn: `P${i}`, qty: 1000000 })) }))).status, 201, 'the limits themselves are allowed');
  assert.equal((await post(quoteBody({ kind: 'bulk', contact: { ...contact, gstin: '27ABCDE1234F1Z5', pincode: '411001', notes: 'Call me' } }))).status, 201);
  assert.equal((await post({ contact, lines: [{ pn: 'A', qty: 1 }] })).status, 201, 'kind defaults to quote');
});

test('quotation requests are limited to 10 per hour per IP', async () => {
  const t = await makeApp();
  for (let i = 0; i < 10; i++) assert.equal((await t.post('/api/quotes', quoteBody(), { ip: '192.0.2.9' })).status, 201);
  const r = await t.post('/api/quotes', quoteBody(), { ip: '192.0.2.9' });
  assert.equal(r.status, 429);
  assert.equal((await t.post('/api/quotes', quoteBody(), { ip: '192.0.2.10' })).status, 201);
});

test('a logged in customer links the quote to their account; bad tokens are refused', async () => {
  const t = await makeApp();
  const c = await t.customer();
  const other = await t.customer();
  const mine = await t.post('/api/quotes', quoteBody(), c.as);
  const guest = await t.post('/api/quotes', quoteBody());
  assert.equal(mine.status, 201);
  const list = (await t.get('/api/me/quotes', c.as)).json.items;
  assert.deepEqual(list.map((q) => q.ref), [mine.json.ref]);
  assert.equal((await t.get(`/api/me/quotes/${mine.json.ref}`, c.as)).json.quote.accountId, c.id);
  assert.equal((await t.get(`/api/me/quotes/${mine.json.ref}`, other.as)).status, 404, 'quotes are private');
  assert.equal((await t.get(`/api/me/quotes/${guest.json.ref}`, c.as)).status, 404);
  assert.equal((await t.post('/api/quotes', quoteBody(), { token: 'rubbish' })).status, 401);
  const adm = await t.admin();
  assert.equal((await t.post('/api/quotes', quoteBody(), { token: adm.token })).status, 401, 'an admin token is not a customer token');
});

test('user supplied text is escaped in every HTML email', async () => {
  const t = await makeApp();
  await (await t.admin()).put('/api/admin/settings', { email: { notifyTo: ['staff@example.com'] } });
  t.mailer.clear();
  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)> & "quotes"';
  const r = await t.post('/api/quotes', {
    contact: { name: evil, company: evil, email: 'guest@example.com', phone: '9876543210', notes: evil },
    lines: [{ pn: evil, brand: evil, title: evil, qty: 1, note: evil }],
  });
  assert.equal(r.status, 201);
  assert.ok(t.mailer.sent.length >= 2);
  for (const m of t.mailer.sent) {
    assert.doesNotMatch(m.html, /<script>/i, m.subject);
    assert.doesNotMatch(m.html, /<img src=x/i, m.subject);
    assert.doesNotMatch(m.html, /onerror=alert\(2\)>/, m.subject);
  }
  const staff = t.mailer.to('staff@example.com')[0];
  assert.match(staff.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(staff.html, /&amp; &quot;quotes&quot;/);
  assert.match(staff.text, /<script>/, 'the plain text part is not HTML, so it keeps the raw characters');
});

test('responding to a quote computes IGST for another state and CGST+SGST for the same state', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await adm.put('/api/admin/settings', { business: { name: 'Bearingsetu', stateCode: '27' }, pricing: { gstRate: 18 } });
  const same = await t.customer({ verify: true, gstin: '27ABCDE1234F1Z5' });
  const other = await t.customer({ verify: true, gstin: '29ABCDE1234F1Z5' });
  const q1 = (await t.post('/api/quotes', quoteBody(), same.as)).json.ref;
  const q2 = (await t.post('/api/quotes', quoteBody(), other.as)).json.ref;
  const guest = (await t.post('/api/quotes', quoteBody({ contact: { ...contact, gstin: '07ABCDE1234F1Z5' } }))).json.ref;

  t.mailer.clear();
  const r1 = await adm.put(`/api/admin/quotes/${q1}`, respondBody());
  assert.equal(r1.status, 200);
  const p1 = r1.json.quote.pricing;
  assert.deepEqual(p1, { subtotal: 2005, freight: 95, gstType: 'CGST+SGST', gstRate: 18, gstAmount: 378, cgst: 189, sgst: 189, total: 2478, validUntil: '2026-07-15', note: 'Ex works Pune' });
  assert.equal(r1.json.quote.status, 'responded');
  assert.equal(r1.json.quote.lines[0].unitPrice, 100.5);
  assert.equal(r1.json.quote.lines[0].lineTotal, 1005);
  assert.equal(r1.json.quote.lines[0].leadDays, 2);

  const p2 = (await adm.put(`/api/admin/quotes/${q2}`, respondBody())).json.quote.pricing;
  assert.deepEqual(p2, { subtotal: 2005, freight: 95, gstType: 'IGST', gstRate: 18, gstAmount: 378, total: 2478, validUntil: '2026-07-15', note: 'Ex works Pune' });
  const p3 = (await adm.put(`/api/admin/quotes/${guest}`, respondBody())).json.quote.pricing;
  assert.equal(p3.gstType, 'IGST', 'a guest GSTIN from another state');

  // the customer is told in the app and by email, with the right figures
  const mail = t.mailer.to(contact.email).find((m) => m.subject.includes(q1)) || t.mailer.sent.find((m) => m.subject.includes(q1));
  assert.match(mail.subject, /is ready/);
  assert.match(mail.text, /2,478\.00/);
  assert.match(mail.text, /CGST @ 9% \+ SGST @ 9%/);
  assert.match(mail.text, /15 Jul 2026/);
  assert.equal((await t.get('/api/me/notifications', same.as)).json.items.some((n) => n.title.includes(q1)), true);
  assert.equal((await t.get(`/api/me/quotes/${q1}`, same.as)).json.quote.pricing.total, 2478);
});

test('GST: blank business state code means IGST, and rounding is exact to the paisa', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const c = await t.customer({ verify: true });
  const ref = (await t.post('/api/quotes', { contact, lines: [{ pn: 'A', qty: 3 }, { pn: 'B', qty: 1 }] }, c.as)).json.ref;
  const lines = [{ index: 0, unitPrice: 33.33 }, { index: 1, unitPrice: 0.1 }];
  const noState = (await adm.put(`/api/admin/quotes/${ref}`, { status: 'responded', freight: 0.01, validUntil: '2026-12-31', lines })).json.quote.pricing;
  assert.equal(noState.gstType, 'IGST');
  assert.equal(noState.subtotal, 100.09); // 3 x 33.33 + 0.10: no 100.08999999 drift
  assert.equal(noState.gstAmount, 18.02); // 18% of 100.10 = 18.018
  assert.equal(noState.total, 118.12);
  await adm.put('/api/admin/settings', { business: { stateCode: '27' }, pricing: { gstRate: 12.5 } });
  const half = (await adm.put(`/api/admin/quotes/${ref}`, { status: 'responded', freight: 0.01, validUntil: '2026-12-31', lines })).json.quote.pricing;
  assert.equal(half.gstType, 'CGST+SGST');
  assert.equal(half.gstRate, 12.5);
  assert.equal(half.cgst, 6.26); // 6.25625 rounds to 6.26
  assert.equal(half.sgst, 6.26);
  assert.equal(half.gstAmount, 12.52);
  assert.equal(half.total, 112.62);
});

test('responding: every line must be priced or marked unavailable, and the dates must make sense', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const ref = (await t.post('/api/quotes', quoteBody())).json.ref;
  const put = (body) => adm.put(`/api/admin/quotes/${ref}`, body);
  assert.equal((await put(respondBody({ lines: [{ index: 0, unitPrice: 100 }] }))).status, 400, 'a line is missing');
  assert.equal((await put(respondBody({ lines: [{ index: 0, unitPrice: 100 }, { index: 0, unitPrice: 100 }] }))).status, 400, 'duplicate line');
  assert.equal((await put(respondBody({ lines: [{ index: 0, unitPrice: 100 }, { index: 5, unitPrice: 100 }] }))).status, 400, 'no such line');
  assert.equal((await put(respondBody({ lines: [{ index: 0, unitPrice: 100 }, { index: 1 }] }))).status, 400, 'price missing');
  assert.equal((await put(respondBody({ lines: [{ index: 0, unitPrice: -1 }, { index: 1, unitPrice: 1 }] }))).status, 400);
  assert.equal((await put(respondBody({ lines: [{ index: 0, unitPrice: 'free' }, { index: 1, unitPrice: 1 }] }))).status, 400);
  assert.equal((await put(respondBody({ validUntil: '2026-06-14' }))).status, 400, 'in the past');
  assert.equal((await put(respondBody({ validUntil: '2026-02-30' }))).status, 400, 'not a real date');
  assert.equal((await put(respondBody({ validUntil: undefined }))).status, 400);
  assert.equal((await put(respondBody({ freight: -5 }))).status, 400);
  assert.equal((await put(respondBody({ status: 'maybe' }))).status, 400);
  const none = await put(respondBody({ lines: [{ index: 0, available: false }, { index: 1, available: false }] }));
  assert.equal(none.status, 400);
  assert.equal(none.json.error, 'no_priced_lines');
  assert.equal((await adm.get(`/api/admin/quotes/${ref}`)).json.quote.status, 'new', 'nothing changed after the refusals');
  const part = await put(respondBody({ freight: 0, lines: [{ index: 0, unitPrice: 100 }, { index: 1, available: false }] }));
  assert.equal(part.status, 200);
  assert.equal(part.json.quote.pricing.subtotal, 1000, 'unavailable lines are left out of the total');
  assert.equal(part.json.quote.lines[1].available, false);
  assert.equal(part.json.quote.lines[1].unitPrice, undefined);
  assert.equal((await adm.put('/api/admin/quotes/Q-2026-09999', respondBody())).status, 404);
});

test('quote status flow: revise while open, decline emails the customer, closed is quiet, accepted is locked', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const c = await t.customer({ verify: true });
  const mk = async () => (await t.post('/api/quotes', quoteBody(), c.as)).json.ref;
  const a = await mk();
  assert.equal((await adm.put(`/api/admin/quotes/${a}`, respondBody())).status, 200);
  assert.equal((await adm.put(`/api/admin/quotes/${a}`, respondBody({ freight: 10 }))).json.quote.pricing.freight, 10, 'a responded quote can be revised');

  const b = await mk();
  t.mailer.clear();
  const declined = await adm.put(`/api/admin/quotes/${b}`, { status: 'declined', note: 'Out of range' });
  assert.equal(declined.status, 200);
  assert.equal(declined.json.quote.status, 'declined');
  assert.equal(t.mailer.sent.length, 1);
  assert.match(t.mailer.sent[0].text, /Out of range/);
  assert.equal((await adm.put(`/api/admin/quotes/${b}`, respondBody())).status, 409, 'a declined request stays declined');

  const d = await mk();
  t.mailer.clear();
  assert.equal((await adm.put(`/api/admin/quotes/${d}`, { status: 'closed' })).status, 200);
  assert.equal(t.mailer.sent.length, 0, 'closing is internal');

  assert.equal((await t.post(`/api/me/quotes/${a}/accept`, { payment: 'bank-transfer', shipTo }, c.as)).status, 201);
  const locked = await adm.put(`/api/admin/quotes/${a}`, respondBody());
  assert.equal(locked.status, 409);
  assert.equal(locked.json.error, 'quote_locked');
  assert.equal((await adm.get('/api/admin/quotes?status=accepted')).json.total, 1);
  assert.equal((await adm.get('/api/admin/quotes?q=Custom part')).json.total, 3);
});

test('a customer can accept a responded quote and an order is created from it', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await adm.put('/api/admin/settings', { business: { name: 'Bearingsetu', stateCode: '27' }, email: { notifyTo: ['staff@example.com'] } });
  const c = await t.customer({ verify: true });
  const ref = (await t.post('/api/quotes', quoteBody(), c.as)).json.ref;

  const early = await t.post(`/api/me/quotes/${ref}/accept`, { payment: 'bank-transfer', shipTo }, c.as);
  assert.equal(early.status, 409, 'not responded yet');
  assert.equal(early.json.error, 'quote_not_open');

  await adm.put(`/api/admin/quotes/${ref}`, respondBody());
  const bad = await t.post(`/api/me/quotes/${ref}/accept`, { payment: 'cash', shipTo }, c.as);
  assert.equal(bad.status, 400);
  assert.equal((await t.post(`/api/me/quotes/${ref}/accept`, { payment: 'bank-transfer' }, c.as)).status, 400, 'needs a delivery address');

  t.mailer.clear();
  const ok = await t.post(`/api/me/quotes/${ref}/accept`, { payment: 'bank-transfer', shipTo, poNumber: 'PO-77' }, c.as);
  assert.equal(ok.status, 201);
  const o = ok.json.order;
  assert.equal(o.no, 'BS-2026-00001');
  assert.equal(o.quoteRef, ref);
  assert.equal(o.status, 'placed');
  assert.equal(o.total, 2478);
  assert.equal(o.gstType, 'CGST+SGST');
  assert.equal(o.poNumber, 'PO-77');
  assert.deepEqual(o.payment, { method: 'bank-transfer', status: 'pending' });
  assert.equal(o.tracking, null);
  assert.deepEqual(o.shipTo, { ...shipTo });
  assert.equal(o.lines.length, 2);
  assert.deepEqual(o.lines[0], { id: 'skf-6205', pn: '6205', brand: 'SKF', title: 'Deep groove ball bearing, open', qty: 10, unitPrice: 100.5, lineTotal: 1005, leadDays: 2 });
  assert.equal(o.history[0].status, 'placed');
  assert.equal((await t.get(`/api/me/quotes/${ref}`, c.as)).json.quote.status, 'accepted');
  assert.equal((await t.get(`/api/me/quotes/${ref}`, c.as)).json.quote.orderNo, o.no);
  assert.equal(t.mailer.to(c.email).length, 1, 'order confirmation');
  assert.equal(t.mailer.to('staff@example.com').length, 1, 'staff notified of the order');

  const again = await t.post(`/api/me/quotes/${ref}/accept`, { payment: 'bank-transfer', shipTo }, c.as);
  assert.equal(again.status, 409, 'the same quotation cannot create two orders');
  assert.equal(again.json.error, 'quote_already_accepted');
  assert.equal((await t.get('/api/me/orders', c.as)).json.items.length, 1);
  assert.equal((await t.get(`/api/me/orders/${o.no}`, c.as)).json.order.no, o.no);
  assert.equal((await t.get(`/api/me/orders/${o.no}`, (await t.customer()).as)).status, 404, 'orders are private');
});

test('an expired quotation cannot be accepted and is shown as expired', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const c = await t.customer({ verify: true });
  const ref = (await t.post('/api/quotes', quoteBody(), c.as)).json.ref;
  await adm.put(`/api/admin/quotes/${ref}`, respondBody({ validUntil: '2026-06-20' }));
  t.time.set('2026-06-20T18:00:00Z'); // 23:30 in India: still valid on the last day
  assert.equal((await t.get(`/api/me/quotes/${ref}`, c.as)).json.quote.status, 'responded');
  t.time.set('2026-06-20T19:00:00Z'); // 00:30 on the 21st in India
  const adm2 = await t.admin(); // the old admin token has expired by now
  assert.equal((await t.get(`/api/me/quotes/${ref}`, c.as)).json.quote.status, 'expired');
  assert.equal((await adm2.get('/api/admin/quotes?status=expired')).json.total, 1);
  const r = await t.post(`/api/me/quotes/${ref}/accept`, { payment: 'bank-transfer', shipTo }, c.as);
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'quote_expired');
  assert.equal((await adm2.put(`/api/admin/quotes/${ref}`, respondBody({ validUntil: '2026-07-30' }))).status, 200, 'an expired quote can be re-issued');
  assert.equal((await t.post(`/api/me/quotes/${ref}/accept`, { payment: 'bank-transfer', shipTo }, c.as)).status, 201);
});

test('accepting a quote on credit follows the credit rules', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const c = await t.customer({ verify: true });
  const mk = async () => { const ref = (await t.post('/api/quotes', quoteBody(), c.as)).json.ref; await adm.put(`/api/admin/quotes/${ref}`, respondBody()); return ref; };
  const r1 = await mk();
  const off = await t.post(`/api/me/quotes/${r1}/accept`, { payment: 'credit', shipTo }, c.as);
  assert.equal(off.status, 403);
  assert.equal(off.json.error, 'credit_not_enabled');
  assert.equal((await t.get(`/api/me/quotes/${r1}`, c.as)).json.quote.status, 'responded', 'the quote stays open');

  await adm.put(`/api/admin/accounts/${c.id}/credit`, { status: 'approved', limit: 3000, termsDays: 30 });
  const ok = await t.post(`/api/me/quotes/${r1}/accept`, { payment: 'credit', shipTo }, c.as);
  assert.equal(ok.status, 201);
  assert.equal(ok.json.order.payment.status, 'on-credit');
  assert.equal(ok.json.account.credit.used, 2478);
  const r2 = await mk();
  const over = await t.post(`/api/me/quotes/${r2}/accept`, { payment: 'credit', shipTo }, c.as);
  assert.equal(over.status, 409);
  assert.equal(over.json.error, 'credit_limit_exceeded');
  assert.equal((await t.get(`/api/me/quotes/${r2}`, c.as)).json.quote.status, 'responded');
  assert.equal((await t.post(`/api/me/quotes/${r2}/accept`, { payment: 'bank-transfer', shipTo }, c.as)).status, 201);
});

test('order status moves only along valid transitions, and customers are told about each change', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const c = await t.customer({ verify: true });
  const ref = (await t.post('/api/quotes', quoteBody(), c.as)).json.ref;
  await adm.put(`/api/admin/quotes/${ref}`, respondBody());
  const no = (await t.post(`/api/me/quotes/${ref}/accept`, { payment: 'bank-transfer', shipTo }, c.as)).json.order.no;
  const patch = (b) => adm.patch(`/api/admin/orders/${no}`, b);
  const status = async () => (await adm.get(`/api/admin/orders/${no}`)).json.order.status;

  for (const bad of ['delivered', 'dispatched']) {
    const r = await patch({ status: bad });
    assert.equal(r.status, 409, `placed -> ${bad}`);
    assert.equal(r.json.error, 'invalid_transition');
  }
  assert.equal((await patch({ status: 'flying' })).status, 400);
  assert.equal(await status(), 'placed');
  t.mailer.clear();
  assert.equal((await patch({ status: 'placed' })).status, 200, 'asking for the status it already has is a harmless no-op');
  assert.equal(t.mailer.sent.length, 0, '... and sends nothing');

  t.mailer.clear();
  assert.equal((await patch({ status: 'confirmed', note: 'We have stock' })).status, 200);
  assert.equal((await patch({ status: 'delivered' })).status, 409, 'cannot skip dispatch');
  assert.match(t.mailer.to(c.email)[0].subject, /is confirmed/);
  assert.match(t.mailer.to(c.email)[0].text, /We have stock/);

  const dispatched = await patch({ status: 'dispatched', tracking: { carrier: 'VRL Logistics', ref: 'VRL12345' } });
  assert.equal(dispatched.status, 200);
  const tr = dispatched.json.order.tracking;
  assert.deepEqual([tr.carrier, tr.ref], ['VRL Logistics', 'VRL12345']);
  assert.ok(!Number.isNaN(Date.parse(tr.dispatchedAt)));
  assert.match(t.mailer.to(c.email).at(-1).text, /VRL12345/);
  assert.equal((await patch({ status: 'cancelled' })).status, 409, 'dispatched orders cannot be cancelled');
  assert.equal((await patch({ status: 'confirmed' })).status, 409, 'no going back');
  assert.equal((await patch({ tracking: { carrier: 'VRL Logistics', ref: 'VRL99999' } })).json.order.tracking.ref, 'VRL99999', 'tracking can be corrected');
  assert.equal((await patch({ status: 'delivered' })).status, 200);
  assert.equal((await patch({ status: 'cancelled' })).status, 409);
  assert.equal(await status(), 'delivered');

  const history = (await t.get(`/api/me/orders/${no}`, c.as)).json.order.history.map((h) => h.status);
  assert.deepEqual(history.filter((s, i) => s !== history[i - 1]), ['placed', 'confirmed', 'dispatched', 'delivered']);
  const notes = (await t.get('/api/me/notifications', c.as)).json.items;
  assert.ok(notes.some((n) => n.title.includes(no) && /delivered/.test(n.title)));
  const audit = (await adm.get(`/api/admin/audit?entity=order&entityId=${no}`)).json.items.filter((e) => e.action === 'order.status');
  assert.equal(audit.length, 3);

  // placed and confirmed orders can be cancelled
  const ref2 = (await t.post('/api/quotes', quoteBody(), c.as)).json.ref;
  await adm.put(`/api/admin/quotes/${ref2}`, respondBody());
  const no2 = (await t.post(`/api/me/quotes/${ref2}/accept`, { payment: 'bank-transfer', shipTo }, c.as)).json.order.no;
  assert.equal((await adm.patch(`/api/admin/orders/${no2}`, { status: 'cancelled' })).status, 200);
  assert.equal((await adm.patch(`/api/admin/orders/${no2}`, { note: 'x' })).status, 409, 'a cancelled order is frozen');
  assert.equal((await adm.get('/api/admin/orders?status=cancelled')).json.total, 1);
  assert.equal((await adm.get('/api/admin/orders/BS-2026-09999')).status, 404);
});

test('bank transfer payment status can be marked paid; credit orders must use the credit panel', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const c = await t.customer({ verify: true });
  await adm.put(`/api/admin/accounts/${c.id}/credit`, { status: 'approved', limit: 10000, termsDays: 30 });
  const mk = async (payment) => {
    const ref = (await t.post('/api/quotes', quoteBody(), c.as)).json.ref;
    await adm.put(`/api/admin/quotes/${ref}`, respondBody());
    return (await t.post(`/api/me/quotes/${ref}/accept`, { payment, shipTo }, c.as)).json.order.no;
  };
  const bank = await mk('bank-transfer');
  t.mailer.clear();
  const paid = await adm.patch(`/api/admin/orders/${bank}`, { paymentStatus: 'paid' });
  assert.equal(paid.json.order.payment.status, 'paid');
  assert.match(t.mailer.to(c.email)[0].subject, /Payment received/);
  assert.equal((await adm.patch(`/api/admin/orders/${bank}`, { paymentStatus: 'on-credit' })).status, 400);
  const credit = await mk('credit');
  const r = await adm.patch(`/api/admin/orders/${credit}`, { paymentStatus: 'paid' });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'use_credit_payment');
  assert.equal((await adm.get(`/api/admin/accounts/${c.id}`)).json.account.credit.used, 2478, 'marking paid never touches the credit balance by itself');
});

test('reference numbers are sequential per year', async () => {
  const t = await makeApp();
  const r1 = await t.post('/api/quotes', quoteBody(), { ip: '192.0.2.1' });
  const r2 = await t.post('/api/quotes', quoteBody(), { ip: '192.0.2.1' });
  assert.deepEqual([r1.json.ref, r2.json.ref], ['Q-2026-00001', 'Q-2026-00002']);
  t.time.set('2026-12-31T19:00:00Z'); // already 1 January in India
  const r3 = await t.post('/api/quotes', quoteBody(), { ip: '192.0.2.1' });
  assert.equal(r3.json.ref, 'Q-2027-00001');
  assert.match((await t.post('/api/quotes', quoteBody(), { ip: '192.0.2.1' })).json.ref, /^Q-2027-00002$/);
});

test('order tracking needs the matching email and shows no private notes', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  const c = await t.customer({ verify: true });
  const ref = (await t.post('/api/quotes', quoteBody(), c.as)).json.ref;
  await adm.put(`/api/admin/quotes/${ref}`, respondBody());
  const no = (await t.post(`/api/me/quotes/${ref}/accept`, { payment: 'bank-transfer', shipTo }, c.as)).json.order.no;
  await adm.patch(`/api/admin/orders/${no}`, { status: 'confirmed', note: 'Internal-ish remark' });
  const ok = await t.get(`/api/track?no=${no}&email=${encodeURIComponent(c.email.toUpperCase())}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.json).sort(), ['history', 'no', 'status', 'tracking']);
  assert.equal(ok.json.status, 'confirmed');
  assert.ok(!JSON.stringify(ok.json).includes('Internal-ish'));
  assert.equal((await t.get(`/api/track?no=${no}&email=someone@else.com`)).status, 404);
  assert.equal((await t.get(`/api/track?no=${no}`)).status, 404);
  assert.equal((await t.get(`/api/track?no=BS-2026-09999&email=${c.email}`)).status, 404);
  assert.equal((await t.get(`/api/track?no=garbage&email=${c.email}`)).status, 404);
  // the contact email on the originating quotation also works
  assert.equal((await t.get(`/api/track?no=${no}&email=${contact.email}`)).status, 200);
  const reorder = await t.post(`/api/me/orders/${no}/reorder-lines`, {}, c.as);
  assert.deepEqual(reorder.json, { lines: [{ id: 'skf-6205', qty: 10 }] }, 'only catalogue lines can be reordered');
});

// ---- direct orders ---------------------------------------------------------
const directOrder = (t, c, body) => t.post('/api/me/orders', { lines: [{ id: 'skf-6205', qty: 1 }], payment: 'bank-transfer', shipTo, ...body }, c.as);

test('direct orders are refused in quote pricing mode', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await adm.put('/api/admin/commercial/skf-6205', { price: 1000 });
  await adm.put('/api/admin/settings', { shipping: { mode: 'flat', flatFee: 100 } });
  const c = await t.customer({ verify: true });
  const r = await directOrder(t, c);
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'direct_order_disabled');
  assert.equal((await t.get('/api/me/orders', c.as)).json.items.length, 0);
});

test('direct orders are refused when freight is quoted, and prices are withheld publicly in quote mode', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await adm.put('/api/admin/commercial/skf-6205', { price: 1000, tiers: [[10, 900]], stock: 50, leadDays: 3, moq: 2 });
  await adm.put('/api/admin/settings', { pricing: { mode: 'list' } });
  const c = await t.customer({ verify: true });
  const r = await directOrder(t, c, { lines: [{ id: 'skf-6205', qty: 5 }] });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'freight_needs_quote');
  assert.equal((await t.get('/api/commercial')).json.items['skf-6205'].price, 1000, 'list mode shows prices');
  assert.deepEqual((await t.get('/api/commercial')).json.items['skf-6205'].tiers, [[10, 900]]);
  await adm.put('/api/admin/settings', { pricing: { mode: 'quote' } });
  const hidden = (await t.get('/api/commercial')).json.items['skf-6205'];
  assert.equal(hidden.price, null, 'quote mode never publishes prices');
  assert.equal(hidden.tiers, undefined);
  assert.equal(hidden.stock, 50);
  assert.equal((await adm.get('/api/admin/commercial')).json.items['skf-6205'].price, 1000, 'the admin still sees them');
});

test('direct orders in list mode: price checks, tiers, discounts, freight and GST', async () => {
  const t = await makeApp();
  const adm = await t.admin();
  await adm.put('/api/admin/settings', { business: { stateCode: '27' }, pricing: { mode: 'list', gstRate: 18 }, shipping: { mode: 'flat', flatFee: 100, freeOver: 5000 } });
  await adm.put('/api/admin/commercial/skf-6205', { price: 1000, tiers: [[10, 950]], stock: 20, moq: 2, leadDays: 4 });
  const c = await t.customer({ verify: true });

  const noPrice = await directOrder(t, c, { lines: [{ id: 'skf-6206', qty: 1 }, { id: 'nok-tc-25x52x7', qty: 1 }] });
  assert.equal(noPrice.status, 409);
  assert.equal(noPrice.json.error, 'price_not_available');
  assert.deepEqual(noPrice.json.ids.sort(), ['nok-tc-25x52x7', 'skf-6206']);
  assert.equal((await directOrder(t, c, { lines: [{ id: 'nope', qty: 1 }] })).json.error, 'price_not_available');
  assert.equal((await directOrder(t, c, { lines: [{ id: 'skf-6205', qty: 1 }] })).json.error, 'below_moq');
  assert.equal((await directOrder(t, c, { lines: [{ id: 'skf-6205', qty: 21 }] })).json.error, 'insufficient_stock');
  assert.equal((await directOrder(t, c, { lines: [{ id: 'skf-6205', qty: 0 }] })).status, 400);
  assert.equal((await directOrder(t, c, { lines: [] })).status, 400);
  assert.equal((await directOrder(t, c, { payment: 'barter' })).status, 400);
  assert.equal((await directOrder(t, c, { shipTo: undefined })).status, 400);

  // 3 x 1000 = 3000 + 100 freight = 3100, GST 558 (CGST 279 + SGST 279)
  const small = await directOrder(t, c, { lines: [{ id: 'skf-6205', qty: 3 }], poNumber: 'PO-1' });
  assert.equal(small.status, 201);
  assert.deepEqual([small.json.order.subtotal, small.json.order.freight, small.json.order.gstAmount, small.json.order.total], [3000, 100, 558, 3658]);
  assert.equal(small.json.order.gstType, 'CGST+SGST');
  assert.equal(small.json.order.lines[0].leadDays, 4);
  assert.equal(small.json.order.payment.status, 'pending');
  assert.equal(small.json.order.no, 'BS-2026-00001');

  // 10 x 950 (tier) = 9500, over 5000 so freight is free; GST 1710
  const tier = await directOrder(t, c, { lines: [{ id: 'skf-6205', qty: 10 }] });
  assert.deepEqual([tier.json.order.subtotal, tier.json.order.freight, tier.json.order.total], [9500, 0, 11210]);
  assert.equal(tier.json.order.no, 'BS-2026-00002');

  // the customer's own discount and special prices
  await adm.patch(`/api/admin/accounts/${c.id}`, { discountPct: 10, customPrices: { 'skf-6206': 400 } });
  await adm.put('/api/admin/commercial/skf-6206', { price: 500 });
  const disc = await directOrder(t, c, { lines: [{ id: 'skf-6205', qty: 2 }, { id: 'skf-6206', qty: 2 }] });
  assert.equal(disc.json.order.lines[0].unitPrice, 900);
  assert.equal(disc.json.order.lines[1].unitPrice, 400, 'a special price replaces the discount');
  assert.equal(disc.json.order.subtotal, 2600);

  // a different state means IGST; duplicates of one product are merged
  const other = await t.customer({ verify: true, gstin: '29ABCDE1234F1Z5' });
  const igst = await directOrder(t, other, { lines: [{ id: 'skf-6205', qty: 2 }, { id: 'skf-6205', qty: 1 }] });
  assert.equal(igst.json.order.gstType, 'IGST');
  assert.equal(igst.json.order.lines.length, 1);
  assert.equal(igst.json.order.lines[0].qty, 3);
  assert.equal(igst.json.order.cgst, undefined);

  // hidden products cannot be ordered
  await adm.put('/api/admin/commercial/skf-6205', { hidden: true });
  assert.equal((await directOrder(t, c, { lines: [{ id: 'skf-6205', qty: 2 }] })).json.error, 'price_not_available');
});

test('GST and totals stay exact in integer paise (unit tests)', async () => {
  const { computeTotals, gstTypeFor, mulDivRound } = await import('../lib/money.mjs');
  const r = computeTotals({ lines: [{ unitPaise: 10, qty: 3 }], gstRate: 18, gstType: 'IGST' });
  assert.equal(r.subtotal, 0.3, '0.1 x 3 has no float drift');
  assert.equal(r.gstAmount, 0.05);
  assert.equal(computeTotals({ lines: [{ unitPaise: 99999999, qty: 1000 }], gstRate: 28, gstType: 'IGST' }).total > 0, true, 'big numbers do not overflow');
  assert.throws(() => computeTotals({ lines: [{ unitPaise: 1e11, qty: 1e6 }], gstRate: 18, gstType: 'IGST' }), /too large/);
  assert.equal(mulDivRound(5, 1, 2), 3, 'half rounds up');
  assert.equal(gstTypeFor('27', '27'), 'CGST+SGST');
  assert.equal(gstTypeFor('29', '27'), 'IGST');
  assert.equal(gstTypeFor('29', ''), 'IGST');
  assert.equal(gstTypeFor('', '27'), 'IGST');
});
