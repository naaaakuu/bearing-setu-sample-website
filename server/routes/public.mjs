// Public endpoints: health, config, catalogue extras, commercial data, register, login, quotes, order tracking.
import { fail, v, newId, own } from '../lib/util.mjs';
import { publicSettings } from '../lib/settings.mjs';
import { hashPassword, verifyPassword, dummyHash, signToken, MIN_PASSWORD, MAX_PASSWORD } from '../lib/auth.mjs';
import { productIndex } from '../lib/catalog.mjs';
import { accountView, nextRef, pushAudit } from '../lib/domain.mjs';
import * as tpl from '../lib/templates.mjs';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const CUSTOMER_TOKEN_SECONDS = 7 * 24 * 3600;

/** Display name for a brand id, from the static catalogue and admin-added brands. */
export function brandName(catalog, adminCatalog, id) {
  const admin = own(adminCatalog.brands, id);
  if (admin) return admin.name;
  return catalog.brands.find((b) => b.id === id)?.name || id;
}

export function publicRoutes(r, S) {
  r.get('/api/health', {}, () => ({ body: { ok: true, time: S.iso() } }));

  r.get('/api/config', { cache: 30 }, () => ({ body: publicSettings(S.settings()) }));

  r.get('/api/catalog', { cache: 30 }, () => {
    const c = S.store.get('catalog');
    return { body: { products: { upsert: Object.values(c.products), hide: c.hidden }, brands: Object.values(c.brands), updatedAt: c.updatedAt } };
  });

  // In "quote" pricing mode prices are never shown, so they are withheld here too.
  r.get('/api/commercial', { cache: 30 }, () => {
    const c = S.store.get('commercial');
    const showPrices = S.settings().pricing.mode === 'list';
    const items = {};
    for (const [id, item] of Object.entries(c.items)) {
      const copy = { ...item };
      if (!showPrices) { copy.price = null; delete copy.tiers; }
      items[id] = copy;
    }
    return { body: { updatedAt: c.updatedAt, items } };
  });

  // ---- registration ------------------------------------------------------
  r.post('/api/auth/register', { limit: ['register', 5, HOUR] }, async ({ body }) => {
    const company = v.str(body.company, 'company', { required: true, min: 2, max: 120 });
    const gstin = v.gstin(body.gstin, 'gstin');
    const name = v.str(body.name, 'name', { required: true, min: 2, max: 80 });
    const email = v.email(body.email, 'email');
    const phone = v.phone(body.phone, 'phone');
    const city = v.str(body.city, 'city', { required: true, max: 80 });
    const state = v.str(body.state, 'state', { required: true, max: 80 });
    if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD || body.password.length > MAX_PASSWORD) {
      throw fail(400, 'invalid_input', `Password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`, { field: 'password' });
    }
    const passwordHash = await hashPassword(body.password); // before the lock; also keeps timing the same for duplicates

    const account = await S.store.tx(['accounts', 'audit'], (d) => {
      if (d.accounts.items.some((a) => a.email === email)) throw fail(409, 'email_exists', 'An account with this email already exists. Please log in.');
      const at = S.iso();
      const acc = {
        id: newId('acc'), company, gstin, name, email, phone, city, state, stateCode: gstin.slice(0, 2),
        status: 'pending', passwordHash,
        credit: { status: 'none', limit: 0, used: 0, termsDays: 0, updatedAt: at },
        discountPct: 0, customPrices: {}, adminNote: '', shipTo: [], createdAt: at,
      };
      d.accounts.items.push(acc);
      pushAudit(d, S.nowMs(), { actor: 'guest', action: 'account.register', entity: 'account', entityId: acc.id, accountId: acc.id });
      return acc;
    });
    const ctx = S.mailCtx();
    S.mail('register.customer', account.email, tpl.registrationReceived(ctx, account));
    S.staffMail('register.staff', tpl.staffNewRegistration(ctx, account));
    return { status: 201, body: { ok: true } };
  });

  // ---- login -------------------------------------------------------------
  r.post('/api/auth/login', { limit: ['login', 10, 15 * MIN] }, async ({ body }) => {
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.password.length > MAX_PASSWORD) {
      throw fail(400, 'invalid_input', 'Email and password are required.');
    }
    const email = body.email.trim().toLowerCase();
    const account = S.store.get('accounts').items.find((a) => a.email === email);
    // Always do one scrypt check, even for unknown emails, so timing does not reveal which emails exist.
    const ok = await verifyPassword(body.password, account ? account.passwordHash : await dummyHash());
    if (!account || !ok) throw fail(401, 'invalid_credentials', 'Incorrect email or password.');
    if (account.status === 'suspended') throw fail(403, 'account_suspended', 'This account is suspended. Please contact us.');
    const token = signToken(S.secret, { aud: 'customer', sub: account.id }, CUSTOMER_TOKEN_SECONDS, S.nowMs());
    return { body: { token, account: accountView(account) } };
  });

  // ---- quotation requests (guests and customers) -------------------------
  r.post('/api/quotes', { limit: ['quotes', 10, HOUR], auth: 'optional' }, async ({ body, account }) => {
    const c = v.obj(body.contact, 'contact');
    const contact = {
      name: v.str(c.name, 'contact.name', { required: true, min: 2, max: 80 }),
      company: v.str(c.company, 'contact.company', { required: true, min: 2, max: 120 }),
      email: v.email(c.email, 'contact.email'),
      phone: v.phone(c.phone, 'contact.phone'),
    };
    const gstin = v.gstin(c.gstin, 'contact.gstin', { required: false });
    if (gstin) contact.gstin = gstin;
    const pincode = v.pin(c.pincode, 'contact.pincode', { required: false });
    if (pincode) contact.pincode = pincode;
    const notes = v.str(c.notes, 'contact.notes', { max: 2000, multiline: true });
    if (notes) contact.notes = notes;
    const kind = v.enum(body.kind ?? 'quote', 'kind', ['quote', 'bulk']);
    const rawLines = v.arr(body.lines, 'lines', { min: 1, max: 200 });

    const cat = await S.catalog.get();
    const adminCat = S.store.get('catalog');
    const index = productIndex(cat, adminCat);
    const lines = rawLines.map((raw, i) => {
      const f = `lines[${i}]`;
      const l = v.obj(raw, f);
      let id = v.str(l.id, `${f}.id`, { max: 80 }) || undefined;
      const line = { qty: v.int(l.qty, `${f}.qty`, { min: 1, max: 1_000_000 }) };
      const known = id && index.get(id);
      if (known) {
        // The catalogue is the source of truth for names; the browser cannot rename a product.
        Object.assign(line, { id, pn: known.pn, brand: brandName(cat, adminCat, known.brand), title: known.title });
      } else {
        if (id && cat.available) id = undefined; // an id we have never heard of: keep it as a typed-in part number
        Object.assign(line, {
          ...(id ? { id } : {}), pn: v.str(l.pn, `${f}.pn`, { required: true, max: 80 }),
        });
        const brand = v.str(l.brand, `${f}.brand`, { max: 80 });
        const title = v.str(l.title, `${f}.title`, { max: 200 });
        if (brand) line.brand = brand;
        if (title) line.title = title;
      }
      const note = v.str(l.note, `${f}.note`, { max: 300 });
      if (note) line.note = note;
      return line;
    });

    const quote = await S.store.tx(['quotes', 'counters', 'audit'], (d) => {
      const at = S.iso();
      const q = {
        ref: nextRef(d, 'quote', S.nowMs()), at, status: 'new', kind, ...(account ? { accountId: account.id } : {}),
        contact, lines, history: [{ at, status: 'new', note: '' }],
      };
      d.quotes.items.push(q);
      pushAudit(d, S.nowMs(), { actor: account ? `customer:${account.id}` : 'guest', action: 'quote.submit', entity: 'quote', entityId: q.ref, accountId: account?.id });
      return q;
    });
    const ctx = S.mailCtx({ accountHint: !!account });
    S.mail('quote.received', contact.email, tpl.quoteReceived(ctx, quote));
    S.staffMail('quote.staff', tpl.staffNewQuote(ctx, quote));
    return { status: 201, body: { ref: quote.ref } };
  });

  // ---- order tracking ----------------------------------------------------
  r.get('/api/track', { limit: ['track', 60, HOUR] }, ({ query }) => {
    const no = String(query.get('no') || '').trim().toUpperCase();
    const email = String(query.get('email') || '').trim().toLowerCase();
    const notFound = fail(404, 'not_found', 'We could not find an order with those details.');
    if (!/^BS-\d{4}-\d{5}$/.test(no) || !email) throw notFound;
    const order = S.store.get('orders').items.find((o) => o.no === no);
    if (!order) throw notFound;
    const account = S.store.get('accounts').items.find((a) => a.id === order.accountId);
    const quote = order.quoteRef && S.store.get('quotes').items.find((q) => q.ref === order.quoteRef);
    const allowed = [account?.email, quote?.contact?.email].filter(Boolean);
    if (!allowed.includes(email)) throw notFound;
    // Staff notes stay private here: only the status and time of each step.
    return { body: { no: order.no, status: order.status, history: order.history.map((h) => ({ at: h.at, status: h.status })), tracking: order.tracking } };
  });
}
