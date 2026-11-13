// Admin: login, dashboard counts, customer accounts, credit, email log and audit log.
import { fail, v, own } from '../lib/util.mjs';
import { toPaise, fromPaise } from '../lib/money.mjs';
import { verifyPassword, signToken, safeEqual } from '../lib/auth.mjs';
import { productIndex } from '../lib/catalog.mjs';
import { adminAccountView, creditChangeInfo, pushAudit, pushNotification, availableCredit } from '../lib/domain.mjs';
import * as tpl from '../lib/templates.mjs';

const MIN = 60 * 1000;
const ADMIN_TOKEN_SECONDS = 12 * 3600;
const auth = { auth: 'admin' };

/** limit/offset from the query string, with sane bounds. */
export function paging(query, def = 200) {
  const limit = Math.min(1000, Math.max(1, Number.parseInt(query.get('limit'), 10) || def));
  const offset = Math.max(0, Number.parseInt(query.get('offset'), 10) || 0);
  return { limit, offset };
}
export const contains = (q, ...fields) => {
  const needle = String(q || '').trim().toLowerCase();
  return !needle || fields.some((f) => String(f ?? '').toLowerCase().includes(needle));
};

export function adminAccountRoutes(r, S) {
  r.post('/api/admin/login', { limit: ['adminlogin', 10, 15 * MIN] }, async ({ body }) => {
    if (!S.admin.enabled) throw fail(503, 'admin_disabled', 'The admin API is switched off. Set ADMIN_EMAIL and ADMIN_PASSWORD on the server.');
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.password.length > 200) {
      throw fail(400, 'invalid_input', 'Email and password are required.');
    }
    // Both checks always run, so timing does not show which part was wrong.
    const emailOk = safeEqual(body.email.trim().toLowerCase(), S.admin.email);
    const passwordOk = await verifyPassword(body.password, await S.admin.hash());
    if (!emailOk || !passwordOk) throw fail(401, 'invalid_credentials', 'Incorrect email or password.');
    const token = signToken(S.secret, { aud: 'admin', sub: 'admin' }, ADMIN_TOKEN_SECONDS, S.nowMs());
    return { body: { token, expiresAt: new Date(S.nowMs() + ADMIN_TOKEN_SECONDS * 1000).toISOString() } };
  });

  r.get('/api/admin/stats', auth, async () => {
    const accounts = S.store.get('accounts').items;
    const orders = S.store.get('orders').items;
    const week = S.nowMs() - 7 * 24 * 3600 * 1000;
    const index = productIndex(await S.catalog.get(), S.store.get('catalog'));
    const commercial = S.store.get('commercial').items;
    const live = [...index.values()].filter((p) => !p.removed);
    return {
      body: {
        pendingAccounts: accounts.filter((a) => a.status === 'pending').length,
        newQuotes: S.store.get('quotes').items.filter((q) => q.status === 'new').length,
        openOrders: orders.filter((o) => ['placed', 'confirmed', 'dispatched'].includes(o.status)).length,
        ordersToConfirm: orders.filter((o) => o.status === 'placed').length,
        creditOutstanding: fromPaise(accounts.reduce((s, a) => s + toPaise(a.credit.used), 0)),
        creditAccounts: accounts.filter((a) => a.credit.status === 'approved').length,
        productsTotal: live.length,
        productsWithoutPrice: live.filter((p) => typeof own(commercial, p.id)?.price !== 'number').length,
        failedEmails: S.store.get('outbox').items.filter((e) => e.status === 'failed' && Date.parse(e.at) >= week).length,
      },
    };
  });

  // ---- accounts ----------------------------------------------------------
  r.get('/api/admin/accounts', auth, ({ query }) => {
    const status = query.get('status');
    const { limit, offset } = paging(query);
    const all = S.store.get('accounts').items
      .filter((a) => (!status || a.status === status) && contains(query.get('q'), a.company, a.name, a.email, a.gstin, a.phone, a.id, a.city))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { body: { total: all.length, items: all.slice(offset, offset + limit).map(adminAccountView) } };
  });

  r.get('/api/admin/accounts/:id', auth, ({ params }) => {
    const a = S.store.get('accounts').items.find((x) => x.id === params.id);
    if (!a) throw fail(404, 'not_found', 'Account not found.');
    const newest = (x, y) => (x.at < y.at ? 1 : -1);
    return {
      body: {
        account: adminAccountView(a),
        quotes: S.store.get('quotes').items.filter((q) => q.accountId === a.id).sort(newest),
        orders: S.store.get('orders').items.filter((o) => o.accountId === a.id).sort(newest),
        audit: S.store.get('audit').items.filter((e) => e.accountId === a.id || (e.entity === 'account' && e.entityId === a.id)).sort(newest).slice(0, 300),
      },
    };
  });

  r.patch('/api/admin/accounts/:id', auth, async ({ params, body }) => {
    const status = v.enum(body.status, 'status', ['pending', 'verified', 'suspended'], { required: false });
    const discountPct = v.num(body.discountPct, 'discountPct', { min: 0, max: 50, required: false });
    const adminNote = v.str(body.adminNote, 'adminNote', { max: 2000, multiline: true });
    let customPrices;
    if (body.customPrices !== undefined) {
      const index = productIndex(await S.catalog.get(), S.store.get('catalog'));
      const raw = v.obj(body.customPrices, 'customPrices');
      const entries = Object.entries(raw);
      if (entries.length > 2000) throw fail(400, 'invalid_input', 'Too many special prices.', { field: 'customPrices' });
      customPrices = {};
      for (const [id, price] of entries) {
        if (!index.has(id)) throw fail(400, 'invalid_input', `Unknown product id "${id.slice(0, 60)}" in customPrices.`, { field: 'customPrices' });
        customPrices[id] = v.num(price, `customPrices.${id}`, { min: 0.01, max: 1e7 });
      }
    }

    const out = await S.store.tx(['accounts', 'audit', 'notifications'], (d) => {
      const a = d.accounts.items.find((x) => x.id === params.id);
      if (!a) throw fail(404, 'not_found', 'Account not found.');
      const now = S.nowMs();
      const actor = 'admin';
      let statusChange = null;
      if (status !== undefined && status !== a.status) {
        statusChange = { from: a.status, to: status };
        pushAudit(d, now, { actor, action: 'account.status', entity: 'account', entityId: a.id, accountId: a.id, before: { status: a.status }, after: { status } });
        a.status = status;
        if (status === 'verified') a.verifiedAt = S.iso();
        const title = { verified: 'Your account is verified', suspended: 'Your account is suspended', pending: 'Your account is under review' }[status];
        pushNotification(d, now, a.id, title, { verified: 'You can now place orders and request quotations.', suspended: 'Please contact us for help.', pending: 'We will let you know when the review is done.' }[status]);
      }
      if (discountPct !== undefined && discountPct !== a.discountPct) {
        pushAudit(d, now, { actor, action: 'account.discount', entity: 'account', entityId: a.id, accountId: a.id, before: { discountPct: a.discountPct }, after: { discountPct } });
        a.discountPct = discountPct;
      }
      if (customPrices !== undefined && JSON.stringify(customPrices) !== JSON.stringify(a.customPrices || {})) {
        pushAudit(d, now, { actor, action: 'account.customPrices', entity: 'account', entityId: a.id, accountId: a.id, before: a.customPrices || {}, after: customPrices });
        a.customPrices = customPrices;
      }
      if (adminNote !== undefined && adminNote !== (a.adminNote || '')) {
        pushAudit(d, now, { actor, action: 'account.note', entity: 'account', entityId: a.id, accountId: a.id });
        a.adminNote = adminNote;
      }
      return { account: a, statusChange };
    });
    if (out.statusChange) S.mail('account.status', out.account.email, tpl.accountStatus(S.mailCtx(), out.account, out.statusChange.to));
    return { body: { account: adminAccountView(out.account), emailed: !!out.statusChange } };
  });

  // ---- credit: the only way credit can ever change ----------------------
  r.put('/api/admin/accounts/:id/credit', auth, async ({ params, body }) => {
    const status = v.enum(body.status, 'status', ['none', 'approved', 'suspended']);
    const limitIn = v.num(body.limit, 'limit', { min: 0, max: 1e9, required: status === 'approved' });
    const termsIn = v.int(body.termsDays, 'termsDays', { min: 0, max: 180, required: status === 'approved' });
    const note = v.str(body.note, 'note', { max: 500 });
    if (status === 'approved') {
      if (!(limitIn > 0)) throw fail(400, 'invalid_input', 'The credit limit must be more than 0.', { field: 'limit' });
      if (termsIn < 1 || termsIn > 180) throw fail(400, 'invalid_input', 'Payment terms must be 1 to 180 days.', { field: 'termsDays' });
    }

    const out = await S.store.tx(['accounts', 'audit', 'notifications'], (d) => {
      const a = d.accounts.items.find((x) => x.id === params.id);
      if (!a) throw fail(404, 'not_found', 'Account not found.');
      const before = { ...a.credit };
      if (status === 'approved' && a.status !== 'verified') {
        throw fail(409, 'account_not_verified', 'Verify the account before approving credit.');
      }
      if (status === 'suspended' && before.status === 'none') {
        throw fail(409, 'invalid_credit_transition', 'Credit was never approved for this account, so it cannot be suspended.');
      }
      const after = {
        status,
        limit: status === 'none' ? 0 : limitIn ?? before.limit,
        termsDays: status === 'none' ? 0 : termsIn ?? before.termsDays,
        used: before.used,
        updatedAt: S.iso(),
      };
      const change = creditChangeInfo(before, after);
      if (!change) return { account: a, change: null };
      a.credit = after;
      const now = S.nowMs();
      pushAudit(d, now, {
        actor: 'admin', action: 'credit.change', entity: 'credit', entityId: a.id, accountId: a.id,
        before: { status: before.status, limit: before.limit, termsDays: before.termsDays },
        after: { status: after.status, limit: after.limit, termsDays: after.termsDays }, note,
      });
      pushNotification(d, now, a.id, tpl.creditTitle(change.kind), change.summary + (note ? `. Note: ${note}` : ''));
      return { account: a, change };
    });
    if (out.change) {
      S.mail('credit.change', out.account.email, tpl.creditChanged(S.mailCtx(), out.account, out.change, { note, outstanding: out.account.credit.used }));
    }
    return { body: { account: adminAccountView(out.account), changed: !!out.change } };
  });

  r.post('/api/admin/accounts/:id/credit/payments', auth, async ({ params, body }) => {
    const amount = v.num(body.amount, 'amount', { min: 0.01, max: 1e9 });
    const ref = v.str(body.ref, 'ref', { required: true, max: 80 });
    const note = v.str(body.note, 'note', { max: 500 });
    const orderNo = v.str(body.orderNo, 'orderNo', { max: 20 }) || undefined;

    const out = await S.store.tx(['accounts', 'orders', 'audit', 'notifications'], (d) => {
      const a = d.accounts.items.find((x) => x.id === params.id);
      if (!a) throw fail(404, 'not_found', 'Account not found.');
      const amountP = toPaise(amount);
      const usedP = toPaise(a.credit.used);
      if (amountP > usedP) {
        throw fail(409, 'payment_exceeds_outstanding', `The payment is more than the outstanding credit balance (${fromPaise(usedP).toFixed(2)}). Check the amount.`, { outstanding: fromPaise(usedP) });
      }
      const now = S.nowMs();
      if (orderNo) {
        const o = d.orders.items.find((x) => x.no === orderNo && x.accountId === a.id);
        if (!o || o.payment.method !== 'credit' || o.status === 'cancelled') throw fail(404, 'not_found', 'That is not an open credit order for this customer.');
        const paidP = toPaise(o.payment.paidAmount || 0);
        if (amountP > toPaise(o.total) - paidP) throw fail(409, 'payment_exceeds_order', 'The payment is more than what is still unpaid on that order.');
        o.payment.paidAmount = fromPaise(paidP + amountP);
        if (paidP + amountP >= toPaise(o.total)) o.payment.status = 'paid';
        o.history.push({ at: S.iso(), status: o.status, note: `Payment of ${amount.toFixed(2)} received (${ref})` });
      }
      const before = a.credit.used;
      a.credit.used = fromPaise(usedP - amountP);
      pushAudit(d, now, {
        actor: 'admin', action: 'credit.payment', entity: 'credit', entityId: a.id, accountId: a.id,
        before: { used: before }, after: { used: a.credit.used }, note: `${ref}${orderNo ? ` (order ${orderNo})` : ''}${note ? `: ${note}` : ''}`,
      });
      pushNotification(d, now, a.id, 'Payment received', `We recorded your payment of ${amount.toFixed(2)} INR (reference ${ref}).`);
      return { account: a };
    });
    S.mail('credit.payment', out.account.email, tpl.creditPayment(S.mailCtx(), out.account, { amount, ref, outstanding: out.account.credit.used, orderNo }));
    return { body: { account: adminAccountView(out.account), available: availableCredit(out.account.credit) } };
  });

  // ---- logs --------------------------------------------------------------
  r.get('/api/admin/outbox', auth, ({ query }) => {
    const { limit, offset } = paging(query);
    const status = query.get('status');
    const items = S.store.get('outbox').items.filter((e) => !status || e.status === status).slice().reverse();
    return { body: { total: items.length, items: items.slice(offset, offset + limit) } };
  });

  r.get('/api/admin/audit', auth, ({ query }) => {
    const { limit, offset } = paging(query);
    const entity = query.get('entity');
    const entityId = query.get('entityId');
    const accountId = query.get('accountId');
    const items = S.store.get('audit').items
      .filter((e) => (!entity || e.entity === entity) && (!entityId || e.entityId === entityId) && (!accountId || e.accountId === accountId))
      .slice().reverse();
    return { body: { total: items.length, items: items.slice(offset, offset + limit) } };
  });
}
