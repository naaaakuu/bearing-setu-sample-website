// Endpoints for a logged-in customer. Everything here is scoped to the token's own account.
import { fail, v, own, endOfIstDay } from '../lib/util.mjs';
import { toPaise, computeTotals, gstTypeFor } from '../lib/money.mjs';
import { productIndex } from '../lib/catalog.mjs';
import {
  accountView, notificationView, quoteView, pushAudit, pushNotification, createOrder, unitPriceFor, buyerStateCode,
} from '../lib/domain.mjs';
import { brandName } from './public.mjs';
import * as tpl from '../lib/templates.mjs';

export function parseShipTo(raw, field) {
  const a = v.obj(raw, field);
  const out = {
    label: v.str(a.label, `${field}.label`, { max: 60 }) || '',
    line1: v.str(a.line1, `${field}.line1`, { required: true, max: 120 }),
    city: v.str(a.city, `${field}.city`, { required: true, max: 80 }),
    state: v.str(a.state, `${field}.state`, { required: true, max: 80 }),
    pin: v.pin(a.pin, `${field}.pin`),
  };
  const line2 = v.str(a.line2, `${field}.line2`, { max: 120 });
  if (line2) out.line2 = line2;
  return out;
}

const newestFirst = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

export function customerRoutes(r, S) {
  const auth = { auth: 'customer' };

  r.get('/api/me', auth, ({ account }) => ({ body: { account: accountView(account) } }));

  r.patch('/api/me', auth, async ({ account, body }) => {
    // Only these fields can be edited by the customer. Status, credit and discount are never read from the body.
    const patch = {
      name: v.str(body.name, 'name', { min: 2, max: 80 }),
      phone: v.phone(body.phone, 'phone', { required: false }),
      city: v.str(body.city, 'city', { max: 80 }),
      state: v.str(body.state, 'state', { max: 80 }),
    };
    const shipTo = body.shipTo === undefined ? undefined : v.arr(body.shipTo, 'shipTo', { max: 20 }).map((x, i) => parseShipTo(x, `shipTo[${i}]`));
    const updated = await S.store.tx(['accounts'], (d) => {
      const acc = d.accounts.items.find((a) => a.id === account.id);
      for (const [k, val] of Object.entries(patch)) if (val) acc[k] = val;
      if (shipTo) acc.shipTo = shipTo;
      return acc;
    });
    return { body: { account: accountView(updated) } };
  });

  // ---- notifications -----------------------------------------------------
  r.get('/api/me/notifications', auth, ({ account }) => {
    const mine = S.store.get('notifications').items.filter((n) => n.accountId === account.id).reverse();
    return { body: { items: mine.slice(0, 100).map(notificationView), unread: mine.filter((n) => !n.read).length } };
  });

  r.post('/api/me/notifications/read', auth, async ({ account, body }) => {
    const ids = body.ids === undefined ? null : new Set(v.arr(body.ids, 'ids', { max: 500 }).map((x, i) => v.str(x, `ids[${i}]`, { required: true, max: 40 })));
    const unread = await S.store.tx(['notifications'], (d) => {
      for (const n of d.notifications.items) if (n.accountId === account.id && (!ids || ids.has(n.id))) n.read = true;
      return d.notifications.items.filter((n) => n.accountId === account.id && !n.read).length;
    });
    return { body: { ok: true, unread } };
  });

  // ---- quotes ------------------------------------------------------------
  r.get('/api/me/quotes', auth, ({ account }) => {
    const items = S.store.get('quotes').items.filter((q) => q.accountId === account.id).map((q) => quoteView(q, S.nowMs())).sort(newestFirst);
    return { body: { items } };
  });

  r.get('/api/me/quotes/:ref', auth, ({ account, params }) => {
    const q = S.store.get('quotes').items.find((x) => x.ref === params.ref && x.accountId === account.id);
    if (!q) throw fail(404, 'not_found', 'Quotation not found.');
    return { body: { quote: quoteView(q, S.nowMs()) } };
  });

  r.post('/api/me/quotes/:ref/accept', auth, async ({ account, params, body }) => {
    const method = v.enum(body.payment, 'payment', ['bank-transfer', 'credit']);
    const shipTo = parseShipTo(body.shipTo, 'shipTo');
    const poNumber = v.str(body.poNumber, 'poNumber', { max: 40 });

    const result = await S.store.tx(['accounts', 'quotes', 'orders', 'counters', 'audit', 'notifications'], (d) => {
      const q = d.quotes.items.find((x) => x.ref === params.ref && x.accountId === account.id);
      if (!q) throw fail(404, 'not_found', 'Quotation not found.');
      const acc = d.accounts.items.find((a) => a.id === account.id);
      if (acc.status === 'suspended') throw fail(403, 'account_suspended', 'This account is suspended. Please contact us.');
      if (q.status === 'accepted') throw fail(409, 'quote_already_accepted', 'This quotation was already accepted.', { orderNo: q.orderNo });
      if (q.status !== 'responded') throw fail(409, 'quote_not_open', 'This quotation cannot be accepted.');
      if (S.nowMs() > endOfIstDay(q.pricing.validUntil)) throw fail(409, 'quote_expired', 'This quotation has expired. Please request a new one.');

      const lines = q.lines.filter((l) => l.available !== false && l.unitPrice != null).map((l) => {
        const line = { pn: l.pn, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal };
        for (const k of ['id', 'brand', 'title', 'note', 'leadDays']) if (l[k] !== undefined && l[k] !== null) line[k] = l[k];
        return line;
      });
      const { subtotal, freight, gstType, gstRate, gstAmount, cgst, sgst, total } = q.pricing;
      const totals = { subtotal, freight, gstType, gstRate, gstAmount, ...(cgst !== undefined ? { cgst, sgst } : {}), total };
      const order = createOrder(d, S.nowMs(), { account: acc, lines, totals, method, shipTo, poNumber, quoteRef: q.ref, actor: `customer:${acc.id}` });
      q.status = 'accepted';
      q.orderNo = order.no;
      q.history.push({ at: S.iso(), status: 'accepted', note: `Order ${order.no}` });
      pushAudit(d, S.nowMs(), { actor: `customer:${acc.id}`, action: 'quote.accept', entity: 'quote', entityId: q.ref, accountId: acc.id, after: { orderNo: order.no } });
      pushNotification(d, S.nowMs(), acc.id, `Order ${order.no} placed`, `Your order ${order.no} was created from quotation ${q.ref}. Total ${total.toFixed(2)} INR.`);
      return { order, account: acc };
    });
    const ctx = S.mailCtx();
    S.mail('order.placed', result.account.email, tpl.orderPlaced(ctx, result.account, result.order));
    S.staffMail('order.staff', tpl.staffNewOrder(ctx, result.account, result.order));
    return { status: 201, body: { order: result.order, account: accountView(result.account) } };
  });

  // ---- orders ------------------------------------------------------------
  r.get('/api/me/orders', auth, ({ account }) => ({
    body: { items: S.store.get('orders').items.filter((o) => o.accountId === account.id).sort(newestFirst) },
  }));

  r.get('/api/me/orders/:no', auth, ({ account, params }) => {
    const o = S.store.get('orders').items.find((x) => x.no === params.no && x.accountId === account.id);
    if (!o) throw fail(404, 'not_found', 'Order not found.');
    return { body: { order: o } };
  });

  r.post('/api/me/orders/:no/reorder-lines', auth, ({ account, params }) => {
    const o = S.store.get('orders').items.find((x) => x.no === params.no && x.accountId === account.id);
    if (!o) throw fail(404, 'not_found', 'Order not found.');
    return { body: { lines: o.lines.filter((l) => l.id).map((l) => ({ id: l.id, qty: l.qty })) } };
  });

  // Direct order: only in "list" pricing mode, only for products with an administrator-entered price.
  r.post('/api/me/orders', auth, async ({ account, body }) => {
    const method = v.enum(body.payment, 'payment', ['bank-transfer', 'credit']);
    const shipTo = parseShipTo(body.shipTo, 'shipTo');
    const poNumber = v.str(body.poNumber, 'poNumber', { max: 40 });
    const wanted = new Map();
    v.arr(body.lines, 'lines', { min: 1, max: 200 }).forEach((raw, i) => {
      const l = v.obj(raw, `lines[${i}]`);
      const id = v.str(l.id, `lines[${i}].id`, { required: true, max: 80 });
      const qty = v.int(l.qty, `lines[${i}].qty`, { min: 1, max: 1_000_000 });
      wanted.set(id, (wanted.get(id) || 0) + qty);
    });
    const cat = await S.catalog.get();

    const result = await S.store.tx(['accounts', 'orders', 'counters', 'audit', 'notifications'], (d) => {
      const settings = S.settings();
      if (settings.pricing.mode !== 'list') {
        throw fail(409, 'direct_order_disabled', 'Direct ordering is not available. Please request a quotation.');
      }
      const ship = settings.shipping;
      if (ship.mode !== 'flat' || ship.flatFee === null) {
        throw fail(409, 'freight_needs_quote', 'Freight is quoted for each order. Please request a quotation.');
      }
      const acc = d.accounts.items.find((a) => a.id === account.id);
      if (acc.status === 'suspended') throw fail(403, 'account_suspended', 'This account is suspended. Please contact us.');

      const adminCat = S.store.get('catalog');
      const index = productIndex(cat, adminCat);
      const commercial = S.store.get('commercial').items;
      const missing = [];
      const lines = [];
      for (const [id, qty] of wanted) {
        const product = index.get(id);
        const c = own(commercial, id);
        if (!product || product.removed || !c || c.hidden || typeof c.price !== 'number') { missing.push(id); continue; }
        if (c.moq && qty < c.moq) throw fail(409, 'below_moq', `The minimum order quantity for ${product.pn} is ${c.moq}.`, { id, moq: c.moq });
        if (typeof c.stock === 'number' && qty > c.stock) throw fail(409, 'insufficient_stock', `Only ${c.stock} of ${product.pn} are available. Please request a quotation for more.`, { id, stock: c.stock });
        const unitPaise = unitPriceFor(c, acc, id, qty);
        lines.push({ id, pn: product.pn, brand: brandName(cat, adminCat, product.brand), title: product.title, qty, unitPaise, ...(typeof c.leadDays === 'number' ? { leadDays: c.leadDays } : {}) });
      }
      if (missing.length) throw fail(409, 'price_not_available', 'Some items have no price yet. Please request a quotation for them.', { ids: missing });

      const subtotalP = lines.reduce((s, l) => s + l.unitPaise * l.qty, 0);
      const freightP = ship.freeOver !== null && subtotalP >= toPaise(ship.freeOver) ? 0 : toPaise(ship.flatFee);
      let totals;
      try {
        totals = computeTotals({ lines, freightPaise: freightP, gstRate: settings.pricing.gstRate, gstType: gstTypeFor(buyerStateCode(acc), settings.business.stateCode) });
      } catch {
        throw fail(400, 'invalid_input', 'The order total is too large.', { field: 'lines' });
      }
      const orderLines = lines.map(({ unitPaise, ...l }) => ({ ...l, unitPrice: unitPaise / 100, lineTotal: (unitPaise * l.qty) / 100 }));
      const order = createOrder(d, S.nowMs(), { account: acc, lines: orderLines, totals, method, shipTo, poNumber, actor: `customer:${acc.id}` });
      pushNotification(d, S.nowMs(), acc.id, `Order ${order.no} placed`, `We received your order ${order.no}. Total ${totals.total.toFixed(2)} INR.`);
      return { order, account: acc };
    });
    const ctx = S.mailCtx();
    S.mail('order.placed', result.account.email, tpl.orderPlaced(ctx, result.account, result.order));
    S.staffMail('order.staff', tpl.staffNewOrder(ctx, result.account, result.order));
    return { status: 201, body: { order: result.order, account: accountView(result.account) } };
  });
}
