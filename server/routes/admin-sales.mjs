// Admin: quotations and orders.
import { fail, v, istDate } from '../lib/util.mjs';
import { toPaise, fromPaise } from '../lib/money.mjs';
import {
  adminAccountView, quoteView, pushAudit, pushNotification, orderTotals, releaseCredit, ORDER_TRANSITIONS,
} from '../lib/domain.mjs';
import { paging, contains } from './admin-accounts.mjs';
import * as tpl from '../lib/templates.mjs';

const auth = { auth: 'admin' };
const newest = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

export function adminSalesRoutes(r, S) {
  const accountOf = (id) => S.store.get('accounts').items.find((a) => a.id === id);

  // ---- quotations --------------------------------------------------------
  r.get('/api/admin/quotes', auth, ({ query }) => {
    const status = query.get('status');
    const { limit, offset } = paging(query);
    const all = S.store.get('quotes').items.map((q) => quoteView(q, S.nowMs()))
      .filter((q) => (!status || q.status === status) && contains(query.get('q'), q.ref, q.contact.company, q.contact.name, q.contact.email, q.contact.phone, ...q.lines.map((l) => l.pn)))
      .sort(newest);
    return { body: { total: all.length, items: all.slice(offset, offset + limit) } };
  });

  r.get('/api/admin/quotes/:ref', auth, ({ params }) => {
    const q = S.store.get('quotes').items.find((x) => x.ref === params.ref);
    if (!q) throw fail(404, 'not_found', 'Quotation not found.');
    const acc = q.accountId && accountOf(q.accountId);
    return { body: { quote: quoteView(q, S.nowMs()), account: acc ? adminAccountView(acc) : null } };
  });

  r.put('/api/admin/quotes/:ref', auth, async ({ params, body }) => {
    const status = v.enum(body.status, 'status', ['responded', 'declined', 'closed']);
    const note = v.str(body.note, 'note', { max: 1000, multiline: true }) || '';
    let freight = 0;
    let validUntil;
    let given;
    if (status === 'responded') {
      freight = v.num(body.freight ?? 0, 'freight', { min: 0, max: 1e7 });
      validUntil = v.date(body.validUntil, 'validUntil');
      const today = istDate(S.nowMs());
      if (validUntil < today) throw fail(400, 'invalid_input', 'The valid-until date cannot be in the past.', { field: 'validUntil' });
      if (validUntil > istDate(S.nowMs() + 400 * 86400000)) throw fail(400, 'invalid_input', 'The valid-until date is too far away.', { field: 'validUntil' });
      given = new Map();
      v.arr(body.lines, 'lines', { min: 1, max: 200 }).forEach((raw, i) => {
        const l = v.obj(raw, `lines[${i}]`);
        const index = v.int(l.index, `lines[${i}].index`, { min: 0, max: 199 });
        if (given.has(index)) throw fail(400, 'invalid_input', `Line ${index} is listed twice.`, { field: 'lines' });
        const available = v.bool(l.available, `lines[${i}].available`) ?? true;
        given.set(index, {
          available,
          unitPrice: available ? v.num(l.unitPrice, `lines[${i}].unitPrice`, { min: 0.01, max: 1e7 }) : undefined,
          leadDays: v.int(l.leadDays, `lines[${i}].leadDays`, { min: 0, max: 365, required: false }),
        });
      });
    }

    const out = await S.store.tx(['quotes', 'accounts', 'audit', 'notifications'], (d) => {
      const q = d.quotes.items.find((x) => x.ref === params.ref);
      if (!q) throw fail(404, 'not_found', 'Quotation not found.');
      if (q.status === 'accepted') throw fail(409, 'quote_locked', 'This quotation was accepted and became an order. It can no longer be changed.');
      const allowedFrom = { responded: ['new', 'responded'], declined: ['new', 'responded'], closed: ['new', 'responded', 'declined'] }[status];
      if (!allowedFrom.includes(q.status)) throw fail(409, 'invalid_transition', `A quotation that is "${q.status}" cannot be set to "${status}".`);
      const acc = q.accountId ? d.accounts.items.find((a) => a.id === q.accountId) : null;
      const before = { status: q.status, total: q.pricing?.total };

      if (status === 'responded') {
        if (given.size !== q.lines.length || [...given.keys()].some((i) => i >= q.lines.length)) {
          throw fail(400, 'invalid_input', 'Give a price (or mark "not available") for every line of the quotation.', { field: 'lines' });
        }
        const priced = [];
        q.lines.forEach((line, i) => {
          const g = given.get(i);
          line.available = g.available;
          if (g.leadDays !== undefined) line.leadDays = g.leadDays; else delete line.leadDays;
          if (g.available) {
            line.unitPrice = g.unitPrice;
            line.lineTotal = fromPaise(toPaise(g.unitPrice) * line.qty);
            priced.push({ unitPaise: toPaise(g.unitPrice), qty: line.qty });
          } else {
            delete line.unitPrice;
            delete line.lineTotal;
          }
        });
        if (!priced.length) throw fail(400, 'no_priced_lines', 'At least one line needs a price. To say you cannot supply anything, choose "Decline".');
        const stateCode = acc ? acc.stateCode : (q.contact.gstin || '').slice(0, 2);
        let totals;
        try { totals = orderTotals(S.settings(), stateCode, priced, toPaise(freight)); } catch { throw fail(400, 'invalid_input', 'The quotation total is too large.', { field: 'lines' }); }
        q.pricing = { ...totals, validUntil, note };
      }
      q.status = status;
      q.history.push({ at: S.iso(), status, note });
      const now = S.nowMs();
      pushAudit(d, now, {
        actor: 'admin', action: `quote.${status}`, entity: 'quote', entityId: q.ref, accountId: q.accountId,
        before, after: { status, total: q.pricing?.total }, note,
      });
      if (acc && status === 'responded') pushNotification(d, now, acc.id, `Quotation ${q.ref} is ready`, `Total ${q.pricing.total.toFixed(2)} INR including GST, valid until ${validUntil}. Open it in your account to accept.`);
      if (acc && status === 'declined') pushNotification(d, now, acc.id, `About quotation ${q.ref}`, 'We are not able to quote for this request right now.');
      return { quote: q, account: acc };
    });
    const ctx = S.mailCtx({ accountHint: !!out.account });
    if (status === 'responded') S.mail('quote.responded', out.quote.contact.email, tpl.quoteResponded(ctx, out.quote));
    if (status === 'declined') S.mail('quote.declined', out.quote.contact.email, tpl.quoteDeclined(ctx, out.quote, note));
    return { body: { quote: quoteView(out.quote, S.nowMs()), emailed: status !== 'closed' } };
  });

  // ---- orders ------------------------------------------------------------
  const orderRow = (o) => {
    const a = accountOf(o.accountId);
    return { ...o, company: a?.company || '', customerEmail: a?.email || '' };
  };

  r.get('/api/admin/orders', auth, ({ query }) => {
    const status = query.get('status');
    const { limit, offset } = paging(query);
    const all = S.store.get('orders').items.map(orderRow)
      .filter((o) => (!status || o.status === status) && contains(query.get('q'), o.no, o.company, o.customerEmail, o.poNumber, o.quoteRef, o.tracking?.ref))
      .sort(newest);
    return { body: { total: all.length, items: all.slice(offset, offset + limit) } };
  });

  r.get('/api/admin/orders/:no', auth, ({ params }) => {
    const o = S.store.get('orders').items.find((x) => x.no === params.no);
    if (!o) throw fail(404, 'not_found', 'Order not found.');
    const a = accountOf(o.accountId);
    return { body: { order: o, account: a ? adminAccountView(a) : null } };
  });

  r.patch('/api/admin/orders/:no', auth, async ({ params, body }) => {
    const status = v.enum(body.status, 'status', ['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled'], { required: false });
    const paymentStatus = v.enum(body.paymentStatus, 'paymentStatus', ['pending', 'paid', 'on-credit'], { required: false });
    const note = v.str(body.note, 'note', { max: 1000, multiline: true }) || '';
    let tracking;
    if (body.tracking !== undefined && body.tracking !== null) {
      const t = v.obj(body.tracking, 'tracking');
      tracking = { carrier: v.str(t.carrier, 'tracking.carrier', { max: 60 }) || '', ref: v.str(t.ref, 'tracking.ref', { max: 80 }) || '' };
    }

    const out = await S.store.tx(['orders', 'accounts', 'audit', 'notifications'], (d) => {
      const o = d.orders.items.find((x) => x.no === params.no);
      if (!o) throw fail(404, 'not_found', 'Order not found.');
      const acc = d.accounts.items.find((a) => a.id === o.accountId);
      const now = S.nowMs();
      const before = { status: o.status, paymentStatus: o.payment.status };
      const wantsChange = (status !== undefined && status !== o.status) || tracking !== undefined || (paymentStatus !== undefined && paymentStatus !== o.payment.status) || note;
      if (o.status === 'cancelled' && wantsChange) throw fail(409, 'order_cancelled', 'This order is cancelled and can no longer be changed.');

      let statusChanged = false;
      if (status !== undefined && status !== o.status) {
        if (!ORDER_TRANSITIONS[o.status].includes(status)) {
          throw fail(409, 'invalid_transition', `An order that is "${o.status}" cannot be set to "${status}".`, { allowed: ORDER_TRANSITIONS[o.status] });
        }
        statusChanged = true;
      }
      if (paymentStatus !== undefined && paymentStatus !== o.payment.status) {
        if (o.payment.method === 'credit') throw fail(409, 'use_credit_payment', "Record payments for credit orders in the customer's credit panel (Record a payment).");
        if (paymentStatus === 'on-credit') throw fail(400, 'invalid_input', 'Bank transfer orders are "pending" or "paid".', { field: 'paymentStatus' });
      }

      if (tracking) o.tracking = { carrier: tracking.carrier, ref: tracking.ref, dispatchedAt: o.tracking?.dispatchedAt ?? null };
      if (statusChanged) {
        o.status = status;
        if (status === 'dispatched') o.tracking = { carrier: o.tracking?.carrier || '', ref: o.tracking?.ref || '', dispatchedAt: S.iso() };
        if (status === 'cancelled' && o.payment.method === 'credit' && o.payment.status === 'on-credit') releaseCredit(d, now, o, 'admin');
      }
      let paidNow = false;
      let paymentChanged = false;
      if (paymentStatus !== undefined && paymentStatus !== o.payment.status) {
        paymentChanged = true;
        paidNow = paymentStatus === 'paid';
        o.payment.status = paymentStatus;
      }
      if (statusChanged || note) o.history.push({ at: S.iso(), status: o.status, note });
      if (!statusChanged && !paymentChanged && tracking === undefined && !note) return { order: o, account: acc, statusChanged, paidNow };

      pushAudit(d, now, {
        actor: 'admin', action: statusChanged ? 'order.status' : 'order.update', entity: 'order', entityId: o.no, accountId: o.accountId,
        before, after: { status: o.status, paymentStatus: o.payment.status, ...(o.tracking ? { tracking: { carrier: o.tracking.carrier, ref: o.tracking.ref } } : {}) }, note,
      });
      if (statusChanged) pushNotification(d, now, o.accountId, `Order ${o.no} ${tpl.orderStatusPhrase(o.status)}`, note || `Status: ${o.status}.`);
      if (paidNow) pushNotification(d, now, o.accountId, `Payment received for order ${o.no}`, 'Thank you. We have recorded your payment.');
      return { order: o, account: acc, statusChanged, paidNow };
    });
    const ctx = S.mailCtx();
    if (out.statusChanged) S.mail('order.status', out.account.email, tpl.orderStatus(ctx, out.account, out.order, note));
    if (out.paidNow) S.mail('order.payment', out.account.email, tpl.orderPaid(ctx, out.account, out.order));
    return { body: { order: out.order, emailed: out.statusChanged || out.paidNow } };
  });
}
