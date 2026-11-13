// Business rules shared by several routes: views (what each audience may see), credit, order numbers, orders.
import { fail, newId, istYear, endOfIstDay, own } from './util.mjs';
import { toPaise, fromPaise, computeTotals, gstTypeFor, inr } from './money.mjs';

// ---- views ---------------------------------------------------------------
export const availableCredit = (c) => fromPaise(Math.max(0, toPaise(c.limit) - toPaise(c.used)));

/**
 * What a CUSTOMER may see of an account. Credit details are only shown while credit is approved
 * AND the account is verified. Everyone else sees exactly { status: "none" }: nothing about limits or terms.
 */
export function accountView(a) {
  const showCredit = a.credit.status === 'approved' && a.status === 'verified';
  return {
    id: a.id, company: a.company, gstin: a.gstin, name: a.name, email: a.email, phone: a.phone,
    city: a.city, state: a.state, stateCode: a.stateCode, status: a.status,
    credit: showCredit
      ? { status: 'approved', limit: a.credit.limit, used: a.credit.used, available: availableCredit(a.credit), termsDays: a.credit.termsDays, updatedAt: a.credit.updatedAt }
      : { status: 'none' },
    discountPct: a.discountPct, customPrices: a.customPrices || {}, shipTo: a.shipTo, createdAt: a.createdAt,
  };
}

/** What the ADMIN sees: everything except the password hash. */
export function adminAccountView(a) {
  const { passwordHash, ...rest } = a; // eslint-disable-line no-unused-vars
  return { ...rest, credit: { ...a.credit, available: availableCredit(a.credit) } };
}

export const notificationView = (n) => ({ id: n.id, at: n.at, title: n.title, body: n.body, read: n.read });

/** A responded quote past its valid-until date is reported as expired (computed, so no timer is needed). */
export function quoteView(q, nowMs) {
  if (q.status === 'responded' && q.pricing?.validUntil && nowMs > endOfIstDay(q.pricing.validUntil)) return { ...q, status: 'expired' };
  return q;
}

// ---- audit, notifications, numbering (all called inside store.tx drafts) ---
export function pushAudit(d, now, { actor, action, entity, entityId, accountId, before, after, note }) {
  const e = { id: newId('aud'), at: new Date(now).toISOString(), actor, action, entity, entityId };
  if (accountId) e.accountId = accountId;
  if (before !== undefined) e.before = before;
  if (after !== undefined) e.after = after;
  if (note) e.note = note;
  d.audit.items.push(e);
  return e;
}

const MAX_NOTIFICATIONS_PER_ACCOUNT = 200;
export function pushNotification(d, now, accountId, title, body) {
  d.notifications.items.push({ id: newId('ntf'), accountId, at: new Date(now).toISOString(), title, body, read: false });
  const mine = d.notifications.items.filter((n) => n.accountId === accountId);
  if (mine.length > MAX_NOTIFICATIONS_PER_ACCOUNT) {
    const drop = new Set(mine.slice(0, mine.length - MAX_NOTIFICATIONS_PER_ACCOUNT).map((n) => n.id));
    d.notifications.items = d.notifications.items.filter((n) => !drop.has(n.id));
  }
}

/** Next sequential reference for the year: Q-2026-00001 / BS-2026-00001. The store mutex makes this collision safe. */
export function nextRef(d, kind, now) {
  const year = istYear(now);
  const counters = d.counters[kind];
  counters[year] = (counters[year] || 0) + 1;
  return `${kind === 'quote' ? 'Q' : 'BS'}-${year}-${String(counters[year]).padStart(5, '0')}`;
}

// ---- credit --------------------------------------------------------------
const CREDIT_LABEL = { none: 'Not enabled', approved: 'Approved', suspended: 'Suspended' };

/**
 * Describes exactly what changed between two credit states. `kind` picks the email and notification wording.
 * Returns null when nothing changed.
 */
export function creditChangeInfo(before, after) {
  const rows = [];
  if (before.status !== after.status) rows.push({ label: 'Credit status', from: CREDIT_LABEL[before.status], to: CREDIT_LABEL[after.status] });
  const limitChanged = before.limit !== after.limit;
  const termsChanged = before.termsDays !== after.termsDays;
  if (limitChanged) rows.push({ label: 'Credit limit', from: inr(before.limit), to: inr(after.limit) });
  if (termsChanged) rows.push({ label: 'Payment terms', from: `${before.termsDays} days`, to: `${after.termsDays} days` });
  if (!rows.length) return null;

  let kind;
  if (before.status !== 'approved' && after.status === 'approved') kind = before.status === 'suspended' ? 'reinstated' : 'approved';
  else if (before.status !== after.status && after.status === 'suspended') kind = 'suspended';
  else if (before.status !== after.status && after.status === 'none') kind = 'withdrawn';
  else kind = limitChanged && termsChanged ? 'limit_terms_changed' : limitChanged ? 'limit_changed' : 'terms_changed';

  const summary = rows.map((r) => `${r.label}: ${r.from} to ${r.to}`).join('. ');
  return { kind, rows, summary, after: { status: after.status, limit: after.limit, termsDays: after.termsDays } };
}

/** Applies an order's credit charge inside a draft. Throws the contract's errors. */
export function chargeCredit(d, now, accountId, totalRupees, orderNo) {
  const acc = d.accounts.items.find((a) => a.id === accountId);
  if (!acc || acc.credit.status !== 'approved' || acc.status !== 'verified') {
    throw fail(403, 'credit_not_enabled', 'Credit is not enabled for this account.');
  }
  const limitP = toPaise(acc.credit.limit);
  const usedP = toPaise(acc.credit.used);
  const totalP = toPaise(totalRupees);
  if (totalP > limitP - usedP) {
    throw fail(409, 'credit_limit_exceeded', `This order is more than your available credit (${inr(fromPaise(Math.max(0, limitP - usedP)))}).`,
      { available: fromPaise(Math.max(0, limitP - usedP)) });
  }
  const before = acc.credit.used;
  acc.credit.used = fromPaise(usedP + totalP);
  pushAudit(d, now, { actor: `customer:${accountId}`, action: 'credit.charge', entity: 'credit', entityId: accountId, accountId, before: { used: before }, after: { used: acc.credit.used }, note: `Order ${orderNo}` });
  return acc.credit.termsDays;
}

/** Gives the unpaid part of a credit order back to the customer's available credit (never below zero). */
export function releaseCredit(d, now, order, actor) {
  const acc = d.accounts.items.find((a) => a.id === order.accountId);
  const unpaidP = toPaise(order.total) - toPaise(order.payment.paidAmount || 0);
  if (!acc || unpaidP <= 0) return 0;
  const before = acc.credit.used;
  acc.credit.used = fromPaise(Math.max(0, toPaise(before) - unpaidP));
  order.payment.releasedAmount = fromPaise(unpaidP);
  pushAudit(d, now, { actor, action: 'credit.release', entity: 'credit', entityId: acc.id, accountId: acc.id, before: { used: before }, after: { used: acc.credit.used }, note: `Order ${order.no} cancelled` });
  return fromPaise(unpaidP);
}

// ---- orders --------------------------------------------------------------
export const ORDER_TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['dispatched', 'cancelled'],
  dispatched: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** Price of one unit for this buyer: tier price for the quantity, then the customer's own price or discount. */
export function unitPriceFor(commercial, account, id, qty) {
  let price = commercial.price;
  for (const [minQty, tierPrice] of commercial.tiers || []) if (qty >= minQty) price = tierPrice;
  const custom = own(account.customPrices, id);
  if (custom !== undefined) return toPaise(custom);
  const base = toPaise(price);
  return account.discountPct > 0 ? Math.round((base * (100 - account.discountPct)) / 100) : base;
}

export const buyerStateCode = (account) => account.stateCode || (account.gstin || '').slice(0, 2);

/** Totals for lines that already have unit prices in paise. */
export function orderTotals(settings, stateCode, lines, freightPaise) {
  return computeTotals({
    lines, freightPaise, gstRate: settings.pricing.gstRate,
    gstType: gstTypeFor(stateCode, settings.business.stateCode),
  });
}

/**
 * Creates the order record inside a draft, applying the credit rules for payment:"credit".
 * `lines` are final order lines ({ id?, pn, brand?, title?, qty, unitPrice, lineTotal, leadDays? }).
 */
export function createOrder(d, now, { account, lines, totals, method, shipTo, poNumber, quoteRef, actor }) {
  const no = nextRef(d, 'order', now);
  let payment;
  if (method === 'credit') {
    const termsDays = chargeCredit(d, now, account.id, totals.total, no);
    payment = { method: 'credit', status: 'on-credit', termsDays, paidAmount: 0 };
  } else {
    payment = { method: 'bank-transfer', status: 'pending' };
  }
  const at = new Date(now).toISOString();
  const order = {
    no, at, accountId: account.id, status: 'placed', ...(quoteRef ? { quoteRef } : {}), lines,
    ...totals, payment, shipTo, ...(poNumber ? { poNumber } : {}), tracking: null,
    history: [{ at, status: 'placed', note: quoteRef ? `Accepted from quotation ${quoteRef}` : '' }],
  };
  d.orders.items.push(order);
  pushAudit(d, now, { actor, action: 'order.place', entity: 'order', entityId: no, accountId: account.id, after: { total: totals.total, payment: method, quoteRef } });
  return order;
}
