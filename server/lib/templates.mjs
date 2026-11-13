// Email content. Every email has a plain text part and a simple HTML part built from the same blocks.
// ALL user supplied text goes through esc() in the HTML part. Emails never contain passwords or tokens.
import { inr } from './money.mjs';
import { cleanText } from './util.mjs';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c]);

const one = (s, max = 200) => cleanText(s ?? '').slice(0, max); // single line, for text and subjects
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
export const fmtDate = (s) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00+05:30`) : new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : dateFmt.format(d);
};
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/.test(u) ? u : '');

export const gstLabel = (p) =>
  p.gstType === 'CGST+SGST' ? `CGST @ ${p.gstRate / 2}% + SGST @ ${p.gstRate / 2}%` : `IGST @ ${p.gstRate}%`;

// ---- block renderer ------------------------------------------------------
const TD = 'padding:6px 8px;border-bottom:1px solid #e3e7f1;font-size:14px;vertical-align:top;';
function renderBlock(b) {
  if (b.h) return { text: `${b.h}\n${'-'.repeat(Math.min(b.h.length, 60))}`, html: `<h2 style="margin:20px 0 8px;font-size:17px;color:#16255c">${esc(b.h)}</h2>` };
  if (b.p !== undefined) return { text: b.p, html: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${esc(b.p).replace(/\n/g, '<br>')}</p>` };
  if (b.kv) {
    return {
      text: b.kv.map(([k, val]) => `${k}: ${val}`).join('\n'),
      html: `<table style="border-collapse:collapse;margin:0 0 14px;width:100%">${b.kv
        .map(([k, val]) => `<tr><td style="${TD}color:#555e80;width:38%">${esc(k)}</td><td style="${TD}">${esc(val)}</td></tr>`).join('')}</table>`,
    };
  }
  if (b.change) {
    return {
      text: b.change.map((c) => `${c.label}: ${c.from} -> ${c.to}`).join('\n'),
      html: `<table style="border-collapse:collapse;margin:0 0 14px;width:100%"><tr><th style="${TD}text-align:left">What</th><th style="${TD}text-align:left">Before</th><th style="${TD}text-align:left">Now</th></tr>${b.change
        .map((c) => `<tr><td style="${TD}">${esc(c.label)}</td><td style="${TD}">${esc(c.from)}</td><td style="${TD}font-weight:bold">${esc(c.to)}</td></tr>`).join('')}</table>`,
    };
  }
  if (b.table) {
    const { head, rows, right = [] } = b.table;
    const align = (i) => (right.includes(i) ? 'text-align:right;' : 'text-align:left;');
    return {
      text: [head.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n'),
      html: `<table style="border-collapse:collapse;margin:0 0 14px;width:100%"><tr>${head.map((c, i) => `<th style="${TD}${align(i)}">${esc(c)}</th>`).join('')}</tr>${rows
        .map((r) => `<tr>${r.map((c, i) => `<td style="${TD}${align(i)}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`,
    };
  }
  if (b.link) {
    const url = safeUrl(b.link.url);
    if (!url) return { text: '', html: '' };
    return { text: `${b.link.label}: ${url}`, html: `<p style="margin:0 0 14px"><a href="${esc(url)}" style="color:#1f4fd1">${esc(b.link.label)}</a></p>` };
  }
  return { text: '', html: '' };
}

function render(S, { subject, greetingName, blocks }) {
  const biz = S.biz;
  const hello = greetingName ? `Hello ${one(greetingName, 80)},` : 'Hello,';
  const all = [{ p: hello }, ...blocks, { p: `Regards,\n${biz}` }];
  const parts = all.map(renderBlock).filter((x) => x.text || x.html);
  const text = `${parts.map((x) => x.text).join('\n\n')}\n`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#16255c">
<div style="max-width:640px;margin:0 auto;padding:24px 12px">
<div style="background:#16255c;color:#ffffff;padding:16px 20px;font-size:18px;font-weight:bold">${esc(biz)}</div>
<div style="background:#ffffff;padding:22px 20px;border:1px solid #e3e7f1;border-top:0;color:#16255c">${parts.map((x) => x.html).join('\n')}</div>
<p style="font-size:12px;color:#6b7390;margin:12px 4px">This is an automated message from ${esc(biz)}. Please do not share it: it may contain details about your account.</p>
</div></body></html>`;
  return { subject: one(subject, 150), text, html };
}

const storefrontLink = (S, label, path = '') => (S.storefrontUrl ? [{ link: { label, url: S.storefrontUrl.replace(/\/$/, '') + path } }] : []);

// ---- accounts ------------------------------------------------------------
export function registrationReceived(S, a) {
  return render(S, {
    subject: `We received your registration`, greetingName: a.name,
    blocks: [
      { p: `Thank you for registering ${one(a.company, 120)} with ${S.biz}. Your business account is waiting for verification.` },
      { p: 'We check the GSTIN and business details, then email you when your account is verified. You can log in meanwhile and see the status.' },
      { kv: [['Company', one(a.company)], ['GSTIN', a.gstin], ['Email', a.email]] },
    ],
  });
}

export function staffNewRegistration(S, a) {
  return render(S, {
    subject: `New registration to verify: ${one(a.company, 60)}`, greetingName: '',
    blocks: [
      { p: 'A new business registered and is waiting for verification in the admin panel.' },
      { kv: [['Company', one(a.company)], ['GSTIN', a.gstin], ['Name', one(a.name)], ['Email', a.email], ['Phone', one(a.phone)], ['City', one(a.city)], ['State', one(a.state)]] },
    ],
  });
}

export function accountStatus(S, a, status) {
  const copy = {
    verified: ['Your account has been verified', 'Your business account is now verified. You can place orders and request quotations.'],
    suspended: ['Your account has been suspended', 'Your account is suspended and you cannot log in or place orders for now. Please contact us if you think this is a mistake.'],
    pending: ['Your account is under review', 'Your account has been moved back to "pending" while we review your details. We will email you when this is done.'],
  }[status];
  const contact = S.contactEmail ? [{ p: `You can reach us at ${S.contactEmail}.` }] : [];
  return render(S, { subject: copy[0], greetingName: a.name, blocks: [{ p: copy[1] }, ...contact, ...storefrontLink(S, 'Open your account', '/account.html')] });
}

// ---- credit --------------------------------------------------------------
const CREDIT_SUBJECT = {
  approved: 'Your credit facility has been approved',
  reinstated: 'Your credit facility has been reinstated',
  limit_changed: 'Your credit limit has changed',
  terms_changed: 'Your credit payment terms have changed',
  limit_terms_changed: 'Your credit limit and payment terms have changed',
  suspended: 'Your credit facility has been suspended',
  withdrawn: 'Your credit facility has been withdrawn',
};
export const creditTitle = (kind) => CREDIT_SUBJECT[kind];

/** change = result of creditChangeInfo(): { kind, rows:[{label, from, to}], after:{status,limit,termsDays} } */
export function creditChanged(S, a, change, { note, outstanding }) {
  const { kind, after } = change;
  const intro = {
    approved: `Good news: a credit facility has been approved for ${one(a.company, 120)}. You can now choose credit at checkout, up to your available limit.`,
    reinstated: 'Your credit facility is active again. You can choose credit at checkout up to your available limit.',
    limit_changed: 'Your credit limit has been changed.',
    terms_changed: 'Your credit payment terms have been changed.',
    limit_terms_changed: 'Your credit limit and payment terms have been changed.',
    suspended: 'Your credit facility is suspended. You cannot place new orders on credit until it is reinstated. Orders already placed are not affected.',
    withdrawn: 'Your credit facility has been withdrawn. New orders must be paid by bank transfer.',
  }[kind];
  const blocks = [{ p: intro }, { change: change.rows }];
  if (after.status === 'approved') blocks.push({ p: `Please pay each credit invoice within ${after.termsDays} days.` });
  if (outstanding > 0) blocks.push({ p: `Your outstanding credit balance is ${inr(outstanding)}. This remains payable.` });
  if (note) blocks.push({ p: `Note from ${S.biz}: ${one(note, 500)}` });
  blocks.push(...storefrontLink(S, 'Open your account', '/account.html'));
  return render(S, { subject: CREDIT_SUBJECT[kind], greetingName: a.name, blocks });
}

export function creditPayment(S, a, { amount, ref, outstanding, orderNo }) {
  return render(S, {
    subject: `Payment received: ${inr(amount)}`, greetingName: a.name,
    blocks: [
      { p: 'We have recorded your payment. Thank you.' },
      { kv: [['Amount', inr(amount)], ['Reference', one(ref, 80)], ...(orderNo ? [['Order', orderNo]] : []), ['Outstanding balance now', inr(outstanding)]] },
    ],
  });
}

// ---- quotes --------------------------------------------------------------
const lineRows = (lines) => lines.map((l, i) => [String(i + 1), one(l.pn, 80), one(l.brand || '', 60), String(l.qty), one(l.note || '', 120)]);

export function quoteReceived(S, q) {
  return render(S, {
    subject: `Quotation request ${q.ref} received`, greetingName: q.contact.name,
    blocks: [
      { p: `Thank you. We received your request ${q.ref} with ${q.lines.length} item${q.lines.length === 1 ? '' : 's'}. We will reply with prices and availability by email${S.accountHint ? ' and in your account' : ''}.` },
      { table: { head: ['#', 'Part number', 'Brand', 'Qty', 'Note'], rows: lineRows(q.lines), right: [3] } },
    ],
  });
}

export function staffNewQuote(S, q) {
  const c = q.contact;
  return render(S, {
    subject: `New ${q.kind === 'bulk' ? 'bulk ' : ''}quotation request ${q.ref} from ${one(c.company, 60)}`, greetingName: '',
    blocks: [
      { p: 'A new quotation request is waiting in the admin panel.' },
      { kv: [['Reference', q.ref], ['Company', one(c.company)], ['Contact', one(c.name)], ['Email', c.email], ['Phone', one(c.phone)], ['GSTIN', c.gstin || '-'], ['PIN code', c.pincode || '-'], ['Notes', one(c.notes || '-', 1000)]] },
      { table: { head: ['#', 'Part number', 'Brand', 'Qty', 'Note'], rows: lineRows(q.lines), right: [3] } },
    ],
  });
}

const availability = (l) => (l.available === false ? 'Not available' : l.leadDays > 0 ? `Ready in ${l.leadDays} days` : 'In stock / ready');

export function quoteResponded(S, q) {
  const p = q.pricing;
  const priced = q.lines.filter((l) => l.available !== false && l.unitPrice != null);
  return render(S, {
    subject: `Your quotation ${q.ref} is ready`, greetingName: q.contact.name,
    blocks: [
      { p: `Here is our quotation for your request ${q.ref}. Prices are in INR, per unit, excluding GST.` },
      { table: { head: ['Part number', 'Qty', 'Unit price', 'Amount', 'Availability'], rows: q.lines.map((l) => [one(l.pn, 80), String(l.qty), l.unitPrice != null && l.available !== false ? inr(l.unitPrice) : '-', l.lineTotal != null && l.available !== false ? inr(l.lineTotal) : '-', availability(l)]), right: [1, 2, 3] } },
      { kv: [['Items subtotal', inr(p.subtotal)], ['Freight', inr(p.freight)], [gstLabel(p), inr(p.gstAmount)], ['Total', inr(p.total)], ['Valid until', fmtDate(p.validUntil)]] },
      ...(priced.length < q.lines.length ? [{ p: 'Items marked "Not available" are not included in the total.' }] : []),
      ...(p.note ? [{ p: `Note: ${one(p.note, 1000)}` }] : []),
      { p: 'To accept, log in to your account, open the quotation and choose how you want to pay.' },
      ...storefrontLink(S, 'Open your quotations', '/account.html'),
    ],
  });
}

export function quoteDeclined(S, q, note) {
  return render(S, {
    subject: `About your quotation request ${q.ref}`, greetingName: q.contact.name,
    blocks: [{ p: `Thank you for your request ${q.ref}. Unfortunately we are not able to quote for it right now.` }, ...(note ? [{ p: `Note: ${one(note, 1000)}` }] : [])],
  });
}

// ---- orders --------------------------------------------------------------
const orderTable = (o) => ({
  table: { head: ['Part number', 'Qty', 'Unit price', 'Amount'], rows: o.lines.map((l) => [one(l.pn, 80), String(l.qty), inr(l.unitPrice), inr(l.lineTotal)]), right: [1, 2, 3] },
});
const orderTotals = (o) => ({ kv: [['Items subtotal', inr(o.subtotal)], ['Freight', inr(o.freight)], [gstLabel(o), inr(o.gstAmount)], ['Total', inr(o.total)]] });
const payLabel = (o) => (o.payment.method === 'credit' ? `On credit (${o.payment.termsDays} days)` : 'Bank transfer');

export function orderPlaced(S, a, o) {
  const addr = [o.shipTo.line1, o.shipTo.line2, `${o.shipTo.city}, ${o.shipTo.state} ${o.shipTo.pin}`].filter(Boolean).map((x) => one(x)).join(', ');
  return render(S, {
    subject: `Order ${o.no} received`, greetingName: a.name,
    blocks: [
      { p: `Thank you for your order ${o.no}. We will confirm it shortly.` },
      orderTable(o), orderTotals(o),
      { kv: [['Payment', payLabel(o)], ['Deliver to', addr], ...(o.poNumber ? [['Your PO number', one(o.poNumber, 40)]] : [])] },
      ...(o.payment.method === 'bank-transfer' ? [{ p: 'We will email our bank details and dispatch once payment is confirmed.' }] : []),
    ],
  });
}

export function staffNewOrder(S, a, o) {
  return render(S, {
    subject: `New order ${o.no} from ${one(a.company, 60)}`, greetingName: '',
    blocks: [
      { p: 'A new order was placed. Please confirm it in the admin panel.' },
      { kv: [['Order', o.no], ['Company', one(a.company)], ['Payment', payLabel(o)], ['Total', inr(o.total)]] },
      orderTable(o),
    ],
  });
}

const ORDER_COPY = {
  confirmed: ['is confirmed', 'We have confirmed your order and are preparing it.'],
  dispatched: ['has been dispatched', 'Your order is on its way.'],
  delivered: ['is marked delivered', 'Your order has been delivered. Thank you for your business.'],
  cancelled: ['has been cancelled', 'Your order has been cancelled.'],
};
export const orderStatusPhrase = (status) => ORDER_COPY[status][0];
export function orderStatus(S, a, o, note) {
  const copy = ORDER_COPY[o.status];
  const t = o.tracking && (o.tracking.carrier || o.tracking.ref) ? [{ kv: [['Carrier', one(o.tracking.carrier, 60) || '-'], ['Tracking reference', one(o.tracking.ref, 80) || '-']] }] : [];
  const credit = o.status === 'cancelled' && o.payment.method === 'credit' && o.payment.releasedAmount > 0
    ? [{ p: `The ${inr(o.payment.releasedAmount)} reserved on your credit for this order has been released.` }] : [];
  return render(S, {
    subject: `Order ${o.no} ${copy[0]}`, greetingName: a.name,
    blocks: [{ p: copy[1] }, { kv: [['Order', o.no], ['Status', o.status], ['Total', inr(o.total)]] }, ...t, ...credit, ...(note ? [{ p: `Note from ${S.biz}: ${one(note, 1000)}` }] : [])],
  });
}

export function orderPaid(S, a, o) {
  return render(S, {
    subject: `Payment received for order ${o.no}`, greetingName: a.name,
    blocks: [{ p: `We have received your payment for order ${o.no}. Thank you.` }, { kv: [['Order', o.no], ['Amount', inr(o.total)]] }],
  });
}
