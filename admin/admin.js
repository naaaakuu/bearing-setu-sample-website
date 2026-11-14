/* Bearingsetu admin panel. Plain JavaScript, no build step, no libraries.
   SAFETY RULE: nothing from the server or from customers is ever put into the page as HTML.
   Every value goes through textContent / createTextNode (see h() below). Never use innerHTML here. */
(() => {
  'use strict';

  /* ================= small helpers ================= */
  const safeStore = (area) => ({
    get(k) { try { return window[area].getItem(k); } catch { return null; } },
    set(k, v) { try { window[area].setItem(k, v); } catch { /* storage may be blocked: the panel still works */ } },
    remove(k) { try { window[area].removeItem(k); } catch { /* ignore */ } },
  });
  const local = safeStore('localStorage');
  const session = safeStore('sessionStorage');

  /** Builds an element. Strings become text nodes (never HTML). */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    const later = [];
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'on' && typeof v === 'object') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'value' || k === 'checked' || k === 'selected') later.push([k, v]);
      else if (k === 'disabled') el.disabled = true;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    append(el, kids);
    for (const [k, v] of later) el[k] = v;
    return el;
  }
  function append(el, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
  }
  const clear = (el) => { el.replaceChildren(); return el; };
  /** Replaces the content of el. Always use this (or h()) instead of el.append(): a raw append(null) would show the word "null". */
  const fill = (el, ...kids) => { el.replaceChildren(); append(el, kids); return el; };
  const byId = (id) => document.getElementById(id);

  let uid = 0;
  const nextId = (p = 'f') => `${p}${++uid}`;

  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rupees = (n) => (n === null || n === undefined || n === '' ? '-' : inr.format(Number(n)));
  const dateTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); };
  const dateOnly = (s) => { const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s); return Number.isNaN(d.getTime()) ? String(s || '') : d.toLocaleDateString('en-IN', { dateStyle: 'medium' }); };
  const todayPlus = (days) => { const d = new Date(Date.now() + days * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  const LABELS = {
    account: { pending: ['Waiting for verification', 'warn'], verified: ['Verified', 'ok'], suspended: ['Suspended', 'bad'] },
    credit: { none: ['Not enabled', ''], approved: ['Approved', 'ok'], suspended: ['Suspended', 'bad'] },
    quote: { new: ['New', 'warn'], responded: ['Answered', 'info'], accepted: ['Accepted', 'ok'], declined: ['Declined', ''], closed: ['Closed', ''], expired: ['Expired', 'bad'] },
    order: { placed: ['New order', 'warn'], confirmed: ['Confirmed', 'info'], dispatched: ['Dispatched', 'info'], delivered: ['Delivered', 'ok'], cancelled: ['Cancelled', 'bad'] },
    mail: { sent: ['Sent', 'ok'], failed: ['Failed', 'bad'], skipped: ['Not sent (no email server set up)', 'warn'], queued: ['Waiting', ''] },
  };
  const badge = (kind, value) => { const [text, tone] = LABELS[kind][value] || [value, '']; return h('span', { class: `badge ${tone}`.trim() }, text); };
  const label = (kind, value) => (LABELS[kind][value] || [value])[0];

  /* ================= state ================= */
  const S = { api: '', token: '', view: 'dashboard', params: {}, rid: 0, reload: null };

  /* ================= server calls ================= */
  class ApiError extends Error {
    constructor(status, code, message, data) { super(message); this.status = status; this.code = code; this.data = data; }
  }

  async function api(method, path, body, { text = false } = {}) {
    let res;
    try {
      res = await fetch(S.api + path, {
        method, cache: 'no-store',
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'network', `Cannot reach the server${S.api ? ` at ${S.api}` : ''}. Check the API address, your internet connection, and that the server is running.`);
    }
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* not JSON */ }
    if (!res.ok) {
      if (res.status === 401 && S.token && !path.endsWith('/login')) logout('Your session ended. Please log in again.');
      if (res.status === 429) throw new ApiError(429, 'rate_limited', 'Too many attempts. Please wait a few minutes and try again.', data);
      throw new ApiError(res.status, data && data.error, (data && data.message) || `The server answered with an error (${res.status}).`, data);
    }
    return text ? raw : data;
  }
  const get = (p) => api('GET', p);
  const put = (p, b) => api('PUT', p, b);
  const post = (p, b) => api('POST', p, b);
  const patch = (p, b) => api('PATCH', p, b);
  const del = (p) => api('DELETE', p);
  const enc = encodeURIComponent;

  /* ================= dialogs, toasts, confirmation ================= */
  const dialogs = { confirm: byId('confirm'), drawer: byId('drawer'), dialog: byId('dialog') };
  const toastAreas = { confirm: 'confirm-toasts', drawer: 'drawer-toasts', dialog: 'dialog-toasts' };
  const stack = [];

  function openModal(name) {
    const el = dialogs[name];
    if (!el.open) { el.showModal(); stack.push(name); }
  }
  for (const [name, el] of Object.entries(dialogs)) {
    el.addEventListener('close', () => { const i = stack.lastIndexOf(name); if (i >= 0) stack.splice(i, 1); });
    el.addEventListener('click', (e) => { if (e.target === el) el.close(); }); // click on the dark area
  }

  function toast(message, kind = 'ok') {
    const top = stack[stack.length - 1];
    const area = byId(top ? toastAreas[top] : 'toasts');
    const item = h('div', { class: `toast ${kind === 'error' ? 'error' : ''}`.trim(), role: kind === 'error' ? 'alert' : 'status' },
      h('span', null, message),
      h('button', { type: 'button', 'aria-label': 'Dismiss this message', on: { click: () => item.remove() } }, '×'));
    area.append(item);
    setTimeout(() => item.remove(), kind === 'error' ? 14000 : 6000);
  }
  const failure = (e) => toast(e && e.message ? e.message : 'Something went wrong.', 'error');

  /** Runs fn while disabling the button; shows errors as messages. */
  async function act(button, fn) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Working…';
    try { return await fn(); } catch (e) { failure(e); return undefined; } finally { button.disabled = false; button.textContent = original; }
  }

  /**
   * Asks before doing anything that emails a customer or cannot be undone.
   * opts: { title, message, details:[text], confirmLabel, danger }  ->  Promise<boolean>
   */
  function confirmAction({ title, message, details = [], confirmLabel = 'Yes, go ahead', danger = false }) {
    return new Promise((resolve) => {
      const dlg = dialogs.confirm;
      let answer = false;
      const finish = (v) => { answer = v; dlg.close(); };
      const cancel = h('button', { type: 'button', class: 'btn secondary', on: { click: () => finish(false) } }, 'No, go back');
      const ok = h('button', { type: 'button', class: danger ? 'btn danger' : 'btn', on: { click: () => finish(true) } }, confirmLabel);
      fill(byId('confirm-body'),
        h('h2', { id: 'confirm-title' }, title),
        message ? h('p', null, message) : null,
        details.length ? h('ul', { class: 'confirm-list' }, details.map((d) => h('li', null, d))) : null,
        h('div', { class: 'actions' }, danger ? [cancel, ok] : [ok, cancel]),
      );
      dlg.addEventListener('close', () => resolve(answer), { once: true });
      openModal('confirm');
      (danger ? cancel : ok).focus();
    });
  }
  const emailNotice = (a) => `This will email ${a.name || a.company} (${a.email}) and notify them in their account.`;

  /* ---- drawer and dialog content ---- */
  function showDrawer(...content) {
    const body = clear(byId('drawer-body'));
    append(body, content);
    openModal('drawer');
  }
  const closeDrawer = () => dialogs.drawer.close();
  function drawerHead(title, ...subtitle) {
    return h('div', { class: 'drawer-head' },
      h('div', null, h('h2', { id: 'drawer-title' }, title), h('div', { class: 'row-badges' }, subtitle)),
      h('button', { type: 'button', class: 'btn secondary small', on: { click: closeDrawer } }, 'Close'));
  }
  function showDialog(title, ...content) {
    const body = clear(byId('dialog-body'));
    append(body, [h('h2', { id: 'dialog-title' }, title), content]);
    openModal('dialog');
  }
  const closeDialog = () => dialogs.dialog.close();

  /* ================= form building blocks ================= */
  function field(labelText, input, hint) {
    if (!input.id) input.id = nextId();
    if (hint) input.setAttribute('aria-describedby', `${input.id}-hint`);
    return h('div', { class: 'field' }, h('label', { for: input.id }, labelText), input, hint ? h('p', { class: 'hint', id: `${input.id}-hint` }, hint) : null);
  }
  const textInput = (value = '', attrs = {}) => h('input', { type: 'text', value, autocomplete: 'off', ...attrs });
  const numInput = (value, attrs = {}) => h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: value ?? '', ...attrs });
  const intInput = (value, attrs = {}) => h('input', { type: 'number', inputmode: 'numeric', step: '1', min: '0', value: value ?? '', ...attrs });
  const area = (value = '', attrs = {}) => h('textarea', { rows: 3, value, ...attrs });
  function select(options, value, attrs = {}) {
    return h('select', attrs, options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)));
  }
  const button = (text, onClick, kind = '', attrs = {}) => h('button', { type: 'button', class: `btn ${kind}`.trim(), on: { click: (e) => onClick(e.currentTarget, e) }, ...attrs }, text);

  /** "12.50" -> 12.5, "" -> null, anything else -> an Error the person can read. */
  function numberOrNull(raw, what, { integer = false } = {}) {
    const s = String(raw ?? '').trim();
    if (s === '') return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) throw new Error(`${what} must be ${integer ? 'a whole number' : 'a number'} (0 or more).`);
    return n;
  }
  const emptyToUndef = (s) => (String(s ?? '').trim() === '' ? undefined : String(s).trim());

  function dataTable(columns, rows, emptyText) {
    if (!rows.length) return h('div', { class: 'table-wrap' }, h('p', { class: 'empty' }, emptyText));
    return h('div', { class: 'table-wrap' }, h('table', { class: 'stackable' },
      h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col', class: c.cls }, c.label)))),
      h('tbody', null, rows.map((r) => h('tr', { class: r._class }, columns.map((c) => h('td', { 'data-label': c.label, class: c.cls }, c.cell(r))))))));
  }
  const openLink = (text, fn) => h('button', { type: 'button', class: 'row-open', on: { click: fn } }, text);
  const facts = (pairs) => h('dl', { class: 'facts' }, pairs.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ================= login / logout / shell ================= */
  const app = byId('app');
  const navButtons = new Map();
  const NAV = [
    ['dashboard', 'Dashboard'], ['accounts', 'Accounts'], ['quotes', 'Quotes'], ['orders', 'Orders'],
    ['products', 'Products & prices'], ['settings', 'Settings'], ['emails', 'Email log'], ['audit', 'Audit log'],
  ];

  function normaliseApi(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    let url;
    try { url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { throw new Error('That API address does not look right. Example: https://api.example.com'); }
    const base = url.origin + url.pathname.replace(/\/+$/, '');
    return base === location.origin ? '' : base;
  }

  function showLogin(message) {
    stack.length = 0;
    for (const d of Object.values(dialogs)) if (d.open) d.close();
    const remembered = local.get('bsAdminApi');
    const sameOrigin = /^https?:$/.test(location.protocol);
    const apiInput = textInput(remembered ?? (sameOrigin ? location.origin : ''), { inputmode: 'url', placeholder: 'https://api.example.com', name: 'api' });
    const email = h('input', { type: 'email', autocomplete: 'username', name: 'email', required: true });
    const password = h('input', { type: 'password', autocomplete: 'current-password', name: 'password', required: true });
    const error = h('div', { role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'btn' }, 'Log in');
    const form = h('form', { novalidate: true, on: { submit: async (e) => {
      e.preventDefault();
      clear(error);
      submit.disabled = true;
      try {
        S.api = normaliseApi(apiInput.value);
        const r = await post('/api/admin/login', { email: email.value, password: password.value });
        S.token = r.token;
        session.set('bsAdminToken', S.token);
        session.set('bsAdminApi', S.api);
        local.set('bsAdminApi', apiInput.value.trim());
        password.value = '';
        showShell();
      } catch (err) {
        error.append(h('div', { class: 'note bad' }, err.message));
      } finally { submit.disabled = false; }
    } } },
    field('Email', email),
    field('Password', password),
    field('API address', apiInput, 'Leave this as it is when this page is served by your Bearingsetu server. Use another address only when the server runs somewhere else.'),
    error, h('div', { class: 'actions' }, submit));
    fill(app, h('main', { id: 'main', class: 'login' },
      h('div', { class: 'card' },
        h('h1', null, 'Bearingsetu admin'),
        message ? h('div', { class: 'note warn', role: 'alert' }, message) : null,
        h('p', { class: 'muted' }, 'Log in to manage accounts, quotes, orders and prices.'),
        form,
        h('p', { class: 'hint' }, 'Cannot log in? Ask whoever set up the server to check ADMIN_EMAIL and ADMIN_PASSWORD (see server/README.md).'))));
    email.focus();
  }

  function logout(message) {
    S.token = '';
    session.remove('bsAdminToken');
    showLogin(typeof message === 'string' ? message : '');
  }

  function showShell() {
    navButtons.clear();
    const nav = h('nav', { class: 'nav', 'aria-label': 'Main sections' }, NAV.map(([id, text]) => {
      const b = h('button', { type: 'button', on: { click: () => go(id) } }, text);
      navButtons.set(id, b);
      return b;
    }));
    fill(app, 
      h('header', { class: 'shell-header' },
        h('div', { class: 'shell-top' }, h('span', { class: 'brand' }, 'Bearingsetu admin'),
          h('button', { type: 'button', class: 'btn secondary small', on: { click: () => logout('You are logged out.') } }, 'Log out')),
        nav),
      h('main', { id: 'main', tabindex: '-1' }));
    go(S.view || 'dashboard', S.params);
  }

  function go(view, params = {}) {
    S.view = view;
    S.params = params;
    S.reload = null;
    for (const [id, b] of navButtons) {
      if (id === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    const main = byId('main');
    fill(main, h('p', { class: 'muted' }, 'Loading…'));
    const rid = ++S.rid;
    VIEWS[view](main, rid, params).catch((e) => { if (rid === S.rid) fill(main, h('div', { class: 'note bad', role: 'alert' }, e.message || 'Something went wrong.')); });
  }
  const stale = (rid) => rid !== S.rid;

  /* ================= Dashboard ================= */
  async function viewDashboard(main, rid) {
    const [stats, settings] = await Promise.all([get('/api/admin/stats'), get('/api/admin/settings')]);
    if (stale(rid)) return;
    const tile = (num, what, why, target, attention) => h('button', { type: 'button', class: `tile ${attention && num > 0 ? 'attention' : ''}`.trim(), on: { click: () => go(...target) } },
      h('div', { class: 'num' }, String(num)), h('div', { class: 'what' }, what), h('div', { class: 'why' }, why));
    const todo = [];
    if (!settings.business.name) todo.push('Fill in your business name and address in Settings.');
    if (!settings.business.stateCode) todo.push('Add your GST state code in Settings, so invoices use the right tax (IGST or CGST + SGST).');
    if (!settings.email.notifyTo.length) todo.push('Add the email addresses that should be told about new registrations, quotes and orders (Settings).');
    if (stats.productsWithoutPrice === stats.productsTotal && stats.productsTotal > 0) todo.push('No product has a price yet. Customers will see "Quote only" everywhere until you add prices (Products & prices).');
    fill(main, 
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Dashboard'), h('p', { class: 'muted' }, 'What needs your attention today.'))),
      h('div', { class: 'grid' },
        tile(stats.pendingAccounts, 'Accounts to verify', 'Businesses waiting for you to check their GSTIN.', ['accounts', { status: 'pending' }], true),
        tile(stats.newQuotes, 'New quote requests', 'Customers waiting for your prices.', ['quotes', { status: 'new' }], true),
        tile(stats.ordersToConfirm, 'Orders to confirm', 'New orders you have not confirmed yet.', ['orders', { status: 'placed' }], true),
        tile(stats.openOrders, 'Open orders', 'Placed, confirmed or on the way.', ['orders', {}], false),
        h('div', { class: 'tile static' }, h('div', { class: 'num' }, rupees(stats.creditOutstanding)), h('div', { class: 'what' }, 'Credit outstanding'), h('div', { class: 'why' }, `${stats.creditAccounts} customer${stats.creditAccounts === 1 ? '' : 's'} with approved credit.`)),
        tile(stats.productsWithoutPrice, 'Products with no price', `Shown as "Quote only". ${stats.productsTotal} products in total.`, ['products', { filter: 'quote-only' }], false),
        tile(stats.failedEmails, 'Emails that failed (7 days)', 'Customers may not have received these.', ['emails', { status: 'failed' }], true)),
      todo.length ? h('div', { class: 'card' }, h('h2', null, 'Good next steps'), h('ol', { class: 'steps' }, todo.map((t) => h('li', null, t)))) : null);
  }

  /* ================= Accounts ================= */
  async function viewAccounts(main, rid, params) {
    const status = select([['', 'All accounts'], ['pending', 'Waiting for verification'], ['verified', 'Verified'], ['suspended', 'Suspended']], params.status || '');
    const q = h('input', { type: 'search', placeholder: 'Company, name, email, GSTIN or phone', value: params.q || '' });
    const holder = h('div');
    const load = async () => {
      const qs = new URLSearchParams({ limit: '1000' });
      if (status.value) qs.set('status', status.value);
      if (q.value.trim()) qs.set('q', q.value.trim());
      const r = await get(`/api/admin/accounts?${qs}`);
      if (stale(rid)) return;
      fill(holder, dataTable([
        { label: 'Company', cell: (a) => [openLink(a.company, () => openAccount(a.id)), h('div', { class: 'sub' }, `${a.city || ''} ${a.gstin}`.trim())] },
        { label: 'Contact', cell: (a) => [a.name, h('div', { class: 'sub' }, a.email)] },
        { label: 'Status', cell: (a) => badge('account', a.status) },
        { label: 'Credit', cell: (a) => [badge('credit', a.credit.status), a.credit.status === 'approved' ? h('div', { class: 'sub' }, `Limit ${rupees(a.credit.limit)}, owes ${rupees(a.credit.used)}`) : (a.credit.used > 0 ? h('div', { class: 'sub' }, `Owes ${rupees(a.credit.used)}`) : null)] },
        { label: 'Registered', cell: (a) => dateOnly(a.createdAt), cls: 'nowrap' },
      ], r.items, 'No accounts match. Try clearing the search.'));
    };
    S.reload = () => load().catch(failure);
    status.addEventListener('change', S.reload);
    q.addEventListener('input', debounce(S.reload));
    fill(main, 
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Accounts'), h('p', { class: 'muted' }, 'Business customers. Open one to verify it, set a discount or manage credit.'))),
      h('div', { class: 'toolbar' }, field('Search', q), field('Show', status), button('Refresh', S.reload, 'secondary')), holder);
    await load();
  }

  async function openAccount(id) {
    const data = await get(`/api/admin/accounts/${enc(id)}`).catch((e) => { failure(e); return null; });
    if (data) renderAccount(data);
  }
  async function refreshAccount(id) {
    const data = await get(`/api/admin/accounts/${enc(id)}`);
    renderAccount(data);
    if (S.reload) S.reload();
  }

  function renderAccount({ account: a, quotes, orders, audit }) {
    const statusActions = {
      pending: [['Verify this account', 'verified', ''], ['Suspend this account', 'suspended', 'danger']],
      verified: [['Suspend this account', 'suspended', 'danger'], ['Move back to "waiting for verification"', 'pending', 'secondary']],
      suspended: [['Reinstate and verify', 'verified', '']],
    }[a.status];
    const told = { verified: 'They will be told their account is verified and they can order.', suspended: 'They will be told their account is suspended and they can no longer log in or order.', pending: 'They will be told their account is back under review.' };

    const statusCard = h('div', { class: 'card' }, h('h3', null, 'Account status'),
      h('p', { class: 'muted' }, a.status === 'pending' ? 'Check the GSTIN on the GST portal, then verify the account. Customers cannot use credit until their account is verified.' : 'Changing the status emails the customer.'),
      h('div', { class: 'actions' }, statusActions.map(([text, to, kind]) => button(text, (btn) => act(btn, async () => {
        const ok = await confirmAction({ title: `${text}?`, message: emailNotice(a), details: [told[to]], confirmLabel: 'Yes, update and email', danger: to === 'suspended' });
        if (!ok) return;
        await patch(`/api/admin/accounts/${enc(a.id)}`, { status: to });
        toast('Account updated and the customer was emailed.');
        await refreshAccount(a.id);
      }), kind))));

    const discount = numInput(a.discountPct, { max: '50', step: '0.5' });
    const special = area(Object.entries(a.customPrices || {}).map(([k, v]) => `${k} = ${v}`).join('\n'), { rows: 4, placeholder: 'skf-6205 = 240' });
    const pricingCard = h('div', { class: 'card' }, h('h3', null, 'Pricing for this customer'),
      field('Discount on list prices (%)', discount, 'Between 0 and 50. Applied when this customer orders at list prices. Does not email the customer.'),
      h('details', null, h('summary', null, 'Special prices for single products (advanced)'),
        field('One per line: product id = price per unit (excluding GST)', special, 'A special price replaces the discount for that product.')),
      h('div', { class: 'actions' }, button('Save pricing', (btn) => act(btn, async () => {
        const customPrices = {};
        for (const line of special.value.split('\n').map((l) => l.trim()).filter(Boolean)) {
          const m = /^(\S+?)\s*[=,\s]\s*([\d.]+)$/.exec(line);
          if (!m) throw new Error(`Cannot read the special price line: "${line}". Use: product-id = 240`);
          customPrices[m[1]] = Number(m[2]);
        }
        await patch(`/api/admin/accounts/${enc(a.id)}`, { discountPct: numberOrNull(discount.value, 'The discount') ?? 0, customPrices });
        toast('Pricing saved.');
        await refreshAccount(a.id);
      }))));

    const note = area(a.adminNote || '', { rows: 3 });
    const noteCard = h('div', { class: 'card' }, h('h3', null, 'Internal note'),
      field('Only you can see this. It is never shown to the customer.', note),
      h('div', { class: 'actions' }, button('Save note', (btn) => act(btn, async () => {
        await patch(`/api/admin/accounts/${enc(a.id)}`, { adminNote: note.value });
        toast('Note saved.');
      }), 'secondary')));

    const recent = h('div', { class: 'card' }, h('h3', null, 'Quotes and orders'),
      !quotes.length && !orders.length ? h('p', { class: 'muted' }, 'Nothing yet.') : null,
      orders.length ? h('p', null, h('strong', null, 'Orders: '), orders.slice(0, 10).map((o, i) => [i ? ', ' : '', openLink(o.no, () => openOrder(o.no))])) : null,
      quotes.length ? h('p', null, h('strong', null, 'Quotes: '), quotes.slice(0, 10).map((q, i) => [i ? ', ' : '', openLink(q.ref, () => openQuote(q.ref))])) : null);

    showDrawer(
      drawerHead(a.company, badge('account', a.status), ' ', h('span', { class: 'muted small' }, `Registered ${dateOnly(a.createdAt)}`)),
      h('div', { class: 'card' }, h('h3', null, 'Business details'), facts([
        ['GSTIN', a.gstin], ['Contact', a.name], ['Email', h('a', { href: `mailto:${a.email}` }, a.email)], ['Phone', a.phone],
        ['Location', [a.city, a.state].filter(Boolean).join(', ')], ['State code', a.stateCode]])),
      statusCard, creditCard(a, orders, audit), pricingCard, noteCard, recent);
  }

  /* ---- the CREDIT panel: deliberately separate, with its own confirmation ---- */
  function creditChanges(before, after) {
    const rows = [];
    if (before.status !== after.status) rows.push(`Credit status: ${label('credit', before.status)} → ${label('credit', after.status)}`);
    if (before.limit !== after.limit) rows.push(`Credit limit: ${rupees(before.limit)} → ${rupees(after.limit)}`);
    if (before.termsDays !== after.termsDays) rows.push(`Payment terms: ${before.termsDays} days → ${after.termsDays} days`);
    return rows;
  }

  function creditCard(a, orders, audit) {
    const c = a.credit;
    const verified = a.status === 'verified';
    const statusSel = select([['none', 'Not enabled (no credit)'], ['approved', 'Approved'], ['suspended', 'Suspended (paused)']], c.status);
    const limit = numInput(c.status === 'none' ? '' : c.limit, { placeholder: 'e.g. 500000' });
    const terms = intInput(c.status === 'none' ? '' : c.termsDays, { max: '180', min: '1', placeholder: '30' });
    const credNote = area('', { rows: 2 });

    const saveCredit = button('Save credit settings…', (btn) => act(btn, async () => {
      const status = statusSel.value;
      let limitV = 0;
      let termsV = 0;
      if (status === 'approved') {
        limitV = numberOrNull(limit.value, 'The credit limit') ?? 0;
        termsV = numberOrNull(terms.value, 'The payment terms', { integer: true }) ?? 0;
        if (!(limitV > 0)) throw new Error('Enter a credit limit above 0.');
        if (termsV < 1 || termsV > 180) throw new Error('Payment terms must be between 1 and 180 days.');
        if (!verified) throw new Error('Verify this account first. Credit can only be approved for verified accounts.');
      } else if (status === 'suspended') {
        if (c.status === 'none') throw new Error('Credit has not been approved for this account, so there is nothing to suspend.');
        limitV = c.limit; termsV = c.termsDays;
      }
      const changes = creditChanges(c, { status, limit: limitV, termsDays: termsV });
      if (!changes.length) { toast('Nothing to change: these are already the credit settings.'); return; }
      const warn = status === 'none' && c.used > 0 ? [`The customer still owes ${rupees(c.used)}. That stays payable.`] : [];
      const ok = await confirmAction({
        title: 'Change this customer’s credit?',
        message: emailNotice(a),
        details: [...changes, ...warn, 'The email lists exactly these changes (old and new values).'],
        confirmLabel: 'Yes, save and email the customer',
      });
      if (!ok) return;
      await put(`/api/admin/accounts/${enc(a.id)}/credit`, { status, limit: limitV, termsDays: termsV, note: emptyToUndef(credNote.value) });
      toast('Credit saved. The customer has been emailed and notified.');
      await refreshAccount(a.id);
    }));

    // payments
    const unpaid = orders.filter((o) => o.payment.method === 'credit' && o.status !== 'cancelled' && o.payment.status === 'on-credit');
    const amount = numInput('', { min: '0.01', placeholder: '0.00' });
    const ref = textInput('', { maxlength: '80', placeholder: 'Bank reference / UTR / cheque no.' });
    const forOrder = select([['', 'Not for a particular order'], ...unpaid.map((o) => [o.no, `${o.no} (unpaid ${rupees(o.total - (o.payment.paidAmount || 0))})`])], '');
    const payNote = textInput('', { maxlength: '200' });
    const recordPayment = button('Record payment…', (btn) => act(btn, async () => {
      const amt = numberOrNull(amount.value, 'The amount');
      if (!(amt > 0)) throw new Error('Enter the amount you received.');
      if (!ref.value.trim()) throw new Error('Enter a payment reference so you can find it later.');
      if (amt > c.used) throw new Error(`The amount is more than the ${rupees(c.used)} this customer owes.`);
      const ok = await confirmAction({
        title: `Record a payment of ${rupees(amt)}?`, message: emailNotice(a),
        details: [`Reference: ${ref.value.trim()}`, `Outstanding falls from ${rupees(c.used)} to ${rupees(c.used - amt)}.`],
        confirmLabel: 'Yes, record and email',
      });
      if (!ok) return;
      await post(`/api/admin/accounts/${enc(a.id)}/credit/payments`, { amount: amt, ref: ref.value.trim(), orderNo: emptyToUndef(forOrder.value), note: emptyToUndef(payNote.value) });
      toast('Payment recorded. The customer has been emailed.');
      await refreshAccount(a.id);
    }), 'secondary');
    if (c.used <= 0) recordPayment.disabled = true;

    const history = audit.filter((e) => e.entity === 'credit');

    return h('div', { class: 'card credit' },
      h('h2', null, 'Credit'),
      h('p', { class: 'muted' }, 'Credit is off for every new account. Only you can switch it on. Customers who are not approved never see anything about credit.'),
      facts([['Status', badge('credit', c.status)], ['Limit', c.status === 'none' ? undefined : rupees(c.limit)], ['Owes now', rupees(c.used)], ['Still available', c.status === 'approved' ? rupees(c.available) : undefined], ['Payment terms', c.status === 'none' ? undefined : `${c.termsDays} days`]]),
      !verified ? h('div', { class: 'note warn' }, 'This account is not verified yet. Verify it first (above) before approving credit.') : null,
      h('h3', null, 'Change credit'),
      h('div', { class: 'row' }, field('Credit status', statusSel), field('Credit limit (₹)', limit, 'Total the customer may owe at one time.'), field('Payment terms (days)', terms, '1 to 180.')),
      field('Message to the customer (optional)', credNote, 'Included in the email.'),
      h('div', { class: 'actions' }, saveCredit),
      h('h3', null, 'Record a payment received'),
      c.used > 0 ? null : h('p', { class: 'muted' }, 'Nothing is owed, so there is no payment to record.'),
      h('div', { class: 'row' }, field('Amount received (₹)', amount), field('Reference', ref)),
      h('div', { class: 'row' }, field('For which order?', forOrder), field('Note (optional)', payNote)),
      h('div', { class: 'actions' }, recordPayment),
      h('h3', null, 'Credit history'),
      history.length ? h('ul', { class: 'confirm-list' }, history.slice(0, 40).map((e) => h('li', null, h('strong', null, dateTime(e.at)), ' – ', describeAudit(e)))) : h('p', { class: 'muted' }, 'No credit activity yet.'));
  }

  /* ================= Quotes ================= */
  async function viewQuotes(main, rid, params) {
    const status = select([['', 'All quotes'], ['new', 'New (need a reply)'], ['responded', 'Answered'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['closed', 'Closed'], ['expired', 'Expired']], params.status || '');
    const q = h('input', { type: 'search', placeholder: 'Reference, company, email or part number' });
    const holder = h('div');
    const load = async () => {
      const qs = new URLSearchParams({ limit: '1000' });
      if (status.value) qs.set('status', status.value);
      if (q.value.trim()) qs.set('q', q.value.trim());
      const r = await get(`/api/admin/quotes?${qs}`);
      if (stale(rid)) return;
      fill(holder, dataTable([
        { label: 'Reference', cell: (x) => openLink(x.ref, () => openQuote(x.ref)) },
        { label: 'Received', cell: (x) => dateTime(x.at), cls: 'nowrap' },
        { label: 'From', cell: (x) => [x.contact.company, h('div', { class: 'sub' }, x.contact.name)] },
        { label: 'Items', cell: (x) => `${x.lines.length}${x.kind === 'bulk' ? ' (bulk list)' : ''}` },
        { label: 'Status', cell: (x) => badge('quote', x.status) },
      ], r.items, 'No quotes match.'));
    };
    S.reload = () => load().catch(failure);
    status.addEventListener('change', S.reload);
    q.addEventListener('input', debounce(S.reload));
    fill(main, 
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Quotes'), h('p', { class: 'muted' }, 'Requests from customers. Open one, enter your prices and send your reply.'))),
      h('div', { class: 'toolbar' }, field('Search', q), field('Show', status), button('Refresh', S.reload, 'secondary')), holder);
    await load();
  }

  async function openQuote(ref) {
    const data = await get(`/api/admin/quotes/${enc(ref)}`).catch((e) => { failure(e); return null; });
    if (data) renderQuote(data);
  }
  async function refreshQuote(ref) {
    renderQuote(await get(`/api/admin/quotes/${enc(ref)}`));
    if (S.reload) S.reload();
  }

  function renderQuote({ quote: q, account }) {
    const c = q.contact;
    const locked = q.status === 'accepted' || q.status === 'declined' || q.status === 'closed';
    const p = q.pricing;
    const rows = q.lines.map((l, i) => ({
      l, i,
      price: numInput(l.unitPrice ?? '', { min: '0.01', 'aria-label': `Unit price for line ${i + 1}`, disabled: locked }),
      avail: h('input', { type: 'checkbox', checked: l.available !== false, 'aria-label': `We can supply line ${i + 1}`, disabled: locked }),
      lead: intInput(l.leadDays ?? '', { max: '365', 'aria-label': `Lead days for line ${i + 1}`, disabled: locked }),
      total: h('span'),
    }));
    const freight = numInput(p ? p.freight : '', { disabled: locked });
    const valid = h('input', { type: 'date', value: p && p.validUntil >= todayPlus(0) ? p.validUntil : todayPlus(14), disabled: locked });
    const note = area(p ? p.note : '', { rows: 3, disabled: locked });
    const sub = h('strong');
    const recompute = () => {
      let subtotal = 0;
      for (const r of rows) {
        const on = r.avail.checked;
        r.price.disabled = locked || !on;
        r.lead.disabled = locked || !on;
        const unit = Number(r.price.value);
        const line = on && unit > 0 ? Math.round(unit * 100) * r.l.qty / 100 : 0;
        r.total.textContent = on ? (line ? rupees(line) : '-') : 'Not available';
        subtotal += line;
      }
      sub.textContent = rupees(subtotal);
    };
    for (const r of rows) { r.price.addEventListener('input', recompute); r.avail.addEventListener('change', recompute); }
    recompute();

    const lineTable = dataTable([
      { label: '#', cell: (r) => String(r.i + 1) },
      { label: 'Item', cell: (r) => [h('strong', null, r.l.pn), h('div', { class: 'sub' }, [r.l.brand, r.l.title].filter(Boolean).join(' - ')), r.l.note ? h('div', { class: 'sub' }, `Note: ${r.l.note}`) : null] },
      { label: 'Qty', cell: (r) => String(r.l.qty), cls: 'right' },
      { label: 'We can supply', cell: (r) => r.avail },
      { label: 'Unit price ₹ (excl. GST)', cell: (r) => r.price },
      { label: 'Ready in (days)', cell: (r) => r.lead },
      { label: 'Amount', cell: (r) => r.total, cls: 'right nowrap' },
    ], rows, 'No lines.');

    const collect = () => {
      const lines = rows.map((r) => {
        if (!r.avail.checked) return { index: r.i, available: false };
        const unitPrice = numberOrNull(r.price.value, `The price on line ${r.i + 1}`);
        if (!(unitPrice > 0)) throw new Error(`Enter a price for line ${r.i + 1}, or untick "We can supply".`);
        const leadDays = numberOrNull(r.lead.value, `Ready in days on line ${r.i + 1}`, { integer: true });
        return { index: r.i, unitPrice, available: true, ...(leadDays !== null ? { leadDays } : {}) };
      });
      if (!lines.some((l) => l.available)) throw new Error('At least one line needs a price. To say you cannot supply any of it, use "Decline this request".');
      if (!valid.value) throw new Error('Choose how long this quote is valid for.');
      return { lines, freight: numberOrNull(freight.value, 'Freight') ?? 0, validUntil: valid.value, note: note.value.trim() };
    };

    const send = button(q.status === 'responded' || q.status === 'expired' ? 'Send updated quote…' : 'Send quote to customer…', (btn) => act(btn, async () => {
      const body = collect();
      const ok = await confirmAction({
        title: 'Send this quote?', message: `This will email ${c.name} (${c.email})${account ? ' and notify them in their account' : ''}.`,
        details: [`Items subtotal: ${sub.textContent}, freight ${rupees(body.freight)}. GST is added automatically.`, `Valid until ${dateOnly(body.validUntil)}.`],
        confirmLabel: 'Yes, send the quote',
      });
      if (!ok) return;
      await put(`/api/admin/quotes/${enc(q.ref)}`, { status: 'responded', ...body });
      toast('Quote sent to the customer.');
      await refreshQuote(q.ref);
    }));
    const declineNote = textInput('', { maxlength: '300', placeholder: 'Reason (optional, included in the email)' });
    const decline = button('Decline this request…', (btn) => act(btn, async () => {
      const ok = await confirmAction({ title: 'Decline this request?', message: `This will email ${c.name} (${c.email}) to say you cannot quote.`, details: declineNote.value.trim() ? [`Your note: ${declineNote.value.trim()}`] : [], confirmLabel: 'Yes, decline and email', danger: true });
      if (!ok) return;
      await put(`/api/admin/quotes/${enc(q.ref)}`, { status: 'declined', note: declineNote.value.trim() });
      toast('Request declined. The customer was emailed.');
      await refreshQuote(q.ref);
    }), 'danger');
    const close = button('Close without replying…', (btn) => act(btn, async () => {
      const ok = await confirmAction({ title: 'Close this request?', message: 'It will move out of your "New" list. The customer is not emailed.', confirmLabel: 'Yes, close it' });
      if (!ok) return;
      await put(`/api/admin/quotes/${enc(q.ref)}`, { status: 'closed' });
      toast('Request closed.');
      await refreshQuote(q.ref);
    }), 'secondary');

    showDrawer(
      drawerHead(q.ref, badge('quote', q.status), ' ', h('span', { class: 'muted small' }, `Received ${dateTime(q.at)}${q.kind === 'bulk' ? ' - bulk list' : ''}`)),
      h('div', { class: 'card' }, h('h3', null, 'Customer'), facts([
        ['Company', c.company], ['Contact', c.name], ['Email', h('a', { href: `mailto:${c.email}` }, c.email)], ['Phone', c.phone], ['GSTIN', c.gstin], ['PIN code', c.pincode], ['Notes', c.notes],
        ['Account', account ? openLink(`${account.company} (${label('account', account.status)})`, () => openAccount(account.id)) : 'Guest: not a registered customer'],
        ['Order', q.orderNo ? openLink(q.orderNo, () => openOrder(q.orderNo)) : undefined]])),
      h('div', { class: 'card' }, h('h3', null, 'Your reply'),
        locked ? h('div', { class: 'note' }, q.status === 'accepted' ? 'The customer accepted this quote. It is now an order and can no longer be changed.' : 'This request is finished. It cannot be changed.') : h('p', { class: 'muted' }, 'Enter a unit price for each line (excluding GST), or untick "We can supply" if you cannot. Nothing is sent until you confirm.'),
        lineTable,
        h('div', { class: 'row' }, field('Freight / delivery charge (₹)', freight, 'Leave empty for none. GST is also charged on freight.'), field('Quote valid until', valid)),
        field('Note to the customer (optional)', note, 'For example delivery terms. Included in the email.'),
        h('p', null, 'Items subtotal: ', sub, ' (GST is added when you send)'),
        p ? h('div', { class: 'note ok' }, `Last sent: total ${rupees(p.total)} including ${p.gstType} ${p.gstRate}% (${rupees(p.gstAmount)}), valid until ${dateOnly(p.validUntil)}.`) : null,
        locked ? null : h('div', { class: 'actions' }, send)),
      q.status === 'new' || q.status === 'responded' ? h('div', { class: 'card' }, h('h3', null, 'Cannot help with this?'), field('Reason', declineNote), h('div', { class: 'actions' }, decline, close)) : null,
      h('div', { class: 'card' }, h('h3', null, 'History'), h('ul', { class: 'confirm-list' }, q.history.map((x) => h('li', null, `${dateTime(x.at)} - ${label('quote', x.status)}${x.note ? `: ${x.note}` : ''}`)))));
  }

  /* ================= Orders ================= */
  async function viewOrders(main, rid, params) {
    const status = select([['', 'All orders'], ['placed', 'New (to confirm)'], ['confirmed', 'Confirmed'], ['dispatched', 'Dispatched'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']], params.status || '');
    const q = h('input', { type: 'search', placeholder: 'Order number, company, email or PO' });
    const holder = h('div');
    const load = async () => {
      const qs = new URLSearchParams({ limit: '1000' });
      if (status.value) qs.set('status', status.value);
      if (q.value.trim()) qs.set('q', q.value.trim());
      const r = await get(`/api/admin/orders?${qs}`);
      if (stale(rid)) return;
      fill(holder, dataTable([
        { label: 'Order', cell: (o) => openLink(o.no, () => openOrder(o.no)) },
        { label: 'Placed', cell: (o) => dateTime(o.at), cls: 'nowrap' },
        { label: 'Customer', cell: (o) => [o.company, h('div', { class: 'sub' }, o.customerEmail)] },
        { label: 'Total', cell: (o) => rupees(o.total), cls: 'right nowrap' },
        { label: 'Status', cell: (o) => badge('order', o.status) },
        { label: 'Payment', cell: (o) => paymentLabel(o) },
      ], r.items, 'No orders match.'));
    };
    S.reload = () => load().catch(failure);
    status.addEventListener('change', S.reload);
    q.addEventListener('input', debounce(S.reload));
    fill(main, 
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Orders'), h('p', { class: 'muted' }, 'Confirm orders, add tracking and keep customers updated.'))),
      h('div', { class: 'toolbar' }, field('Search', q), field('Show', status), button('Refresh', S.reload, 'secondary')), holder);
    await load();
  }
  const paymentLabel = (o) => (o.payment.method === 'credit'
    ? (o.payment.status === 'paid' ? 'Credit: paid' : `On credit (${o.payment.termsDays} days)`)
    : `Bank transfer: ${o.payment.status === 'paid' ? 'paid' : 'waiting for payment'}`);

  async function openOrder(no) {
    const data = await get(`/api/admin/orders/${enc(no)}`).catch((e) => { failure(e); return null; });
    if (data) renderOrder(data);
  }
  async function refreshOrder(no) {
    renderOrder(await get(`/api/admin/orders/${enc(no)}`));
    if (S.reload) S.reload();
  }

  const NEXT = {
    placed: [['confirmed', 'Confirm this order', ''], ['cancelled', 'Cancel this order', 'danger']],
    confirmed: [['dispatched', 'Mark as dispatched', ''], ['cancelled', 'Cancel this order', 'danger']],
    dispatched: [['delivered', 'Mark as delivered', '']],
    delivered: [], cancelled: [],
  };

  function renderOrder({ order: o, account }) {
    const who = account || { name: 'the customer', email: '' };
    const carrier = textInput(o.tracking ? o.tracking.carrier : '', { maxlength: '60', placeholder: 'e.g. VRL Logistics' });
    const trackRef = textInput(o.tracking ? o.tracking.ref : '', { maxlength: '80', placeholder: 'LR / docket / AWB number' });
    const msg = area('', { rows: 2, placeholder: 'Optional message, included in the email' });
    const trackingBody = () => (carrier.value.trim() || trackRef.value.trim() ? { tracking: { carrier: carrier.value.trim(), ref: trackRef.value.trim() } } : {});

    const statusButtons = NEXT[o.status].map(([to, text, kind]) => button(text, (btn) => act(btn, async () => {
      const details = [];
      if (to === 'dispatched') details.push(trackingBody().tracking ? `Tracking: ${carrier.value.trim()} ${trackRef.value.trim()}` : 'No tracking details entered. You can add them below first.');
      if (to === 'cancelled' && o.payment.method === 'credit') details.push(`The ${rupees(o.total - (o.payment.paidAmount || 0))} reserved on the customer’s credit will be released.`);
      if (msg.value.trim()) details.push(`Your message: ${msg.value.trim()}`);
      const ok = await confirmAction({ title: `${text}?`, message: account ? emailNotice(account) : 'The customer will be emailed.', details, confirmLabel: 'Yes, update and email', danger: to === 'cancelled' });
      if (!ok) return;
      await patch(`/api/admin/orders/${enc(o.no)}`, { status: to, ...trackingBody(), note: msg.value.trim() });
      toast('Order updated and the customer was emailed.');
      await refreshOrder(o.no);
    }), kind));
    const saveTracking = button('Save tracking only (no email)', (btn) => act(btn, async () => {
      const t = trackingBody();
      if (!t.tracking) throw new Error('Enter a carrier or a tracking reference first.');
      await patch(`/api/admin/orders/${enc(o.no)}`, t);
      toast('Tracking saved.');
      await refreshOrder(o.no);
    }), 'secondary');

    let paymentBlock;
    if (o.payment.method === 'credit') {
      paymentBlock = h('div', null, h('p', null, `Paid on credit terms (${o.payment.termsDays} days). Status: ${o.payment.status === 'paid' ? 'paid' : 'not yet paid'}.`),
        h('p', { class: 'muted' }, 'To record a payment for a credit order, use "Record a payment received" in the customer’s Credit panel. That also keeps their credit balance right.'),
        account ? h('div', { class: 'actions' }, button('Open customer account', () => openAccount(account.id), 'secondary')) : null);
    } else {
      const paySel = select([['pending', 'Waiting for payment'], ['paid', 'Paid']], o.payment.status);
      paymentBlock = h('div', null, field('Payment status', paySel),
        h('div', { class: 'actions' }, button('Save payment status…', (btn) => act(btn, async () => {
          if (paySel.value === o.payment.status) { toast('Nothing to change.'); return; }
          const ok = await confirmAction({ title: 'Change the payment status?', message: paySel.value === 'paid' ? (account ? emailNotice(account) : 'The customer will be emailed.') : 'The customer is not emailed for this change.', confirmLabel: 'Yes, save', details: [`Now: ${paySel.value === 'paid' ? 'Paid' : 'Waiting for payment'}`] });
          if (!ok) return;
          await patch(`/api/admin/orders/${enc(o.no)}`, { paymentStatus: paySel.value });
          toast('Payment status saved.');
          await refreshOrder(o.no);
        }), 'secondary')));
    }

    const ship = o.shipTo || {};
    showDrawer(
      drawerHead(o.no, badge('order', o.status), ' ', h('span', { class: 'muted small' }, `Placed ${dateTime(o.at)}`)),
      h('div', { class: 'card' }, h('h3', null, 'Order'), facts([
        ['Customer', account ? openLink(`${account.company}`, () => openAccount(account.id)) : undefined], ['Contact', account ? `${account.name} (${account.email})` : undefined],
        ['Payment', paymentLabel(o)], ['PO number', o.poNumber], ['Quotation', o.quoteRef ? openLink(o.quoteRef, () => openQuote(o.quoteRef)) : 'Direct order'],
        ['Deliver to', [ship.label, ship.line1, ship.line2, [ship.city, ship.state, ship.pin].filter(Boolean).join(' ')].filter(Boolean).join(', ')]]),
      dataTable([
        { label: 'Item', cell: (l) => [h('strong', null, l.pn), h('div', { class: 'sub' }, [l.brand, l.title].filter(Boolean).join(' - '))] },
        { label: 'Qty', cell: (l) => String(l.qty), cls: 'right' },
        { label: 'Unit price', cell: (l) => rupees(l.unitPrice), cls: 'right nowrap' },
        { label: 'Amount', cell: (l) => rupees(l.lineTotal), cls: 'right nowrap' },
      ], o.lines, 'No lines.'),
      facts([['Items subtotal', rupees(o.subtotal)], ['Freight', rupees(o.freight)], [`${o.gstType} ${o.gstRate}%`, rupees(o.gstAmount)], ['Total', h('strong', null, rupees(o.total))]])),
      o.status === 'cancelled' ? h('div', { class: 'note' }, 'This order is cancelled and cannot be changed.') : h('div', { class: 'card' }, h('h3', null, 'Update this order'),
        h('div', { class: 'row' }, field('Carrier', carrier), field('Tracking reference', trackRef)),
        field('Message to the customer (optional)', msg),
        h('div', { class: 'actions' }, statusButtons, saveTracking)),
      h('div', { class: 'card' }, h('h3', null, 'Payment'), paymentBlock),
      h('div', { class: 'card' }, h('h3', null, 'History'), h('ul', { class: 'confirm-list' }, o.history.map((x) => h('li', null, `${dateTime(x.at)} - ${label('order', x.status)}${x.note ? `: ${x.note}` : ''}`)))));
  }

  /* ================= Products & prices ================= */
  async function viewProducts(main, rid, params) {
    let data = await get('/api/admin/commercial');
    if (stale(rid)) return;
    const search = h('input', { type: 'search', placeholder: 'Part number, brand or name' });
    const filter = select([['', 'All products'], ['quote-only', 'Quote only (no price yet)'], ['priced', 'With a price'], ['hidden', 'Hidden from the store']], params.filter || '');
    const holder = h('div');
    const more = h('div', { class: 'actions' });
    let limit = 100;
    const dirtyRows = new Map(); // id -> save function

    const matches = () => {
      const needle = search.value.trim().toLowerCase();
      return data.products.filter((p) => {
        const c = data.items[p.id] || {};
        if (filter.value === 'quote-only' && typeof c.price === 'number') return false;
        if (filter.value === 'priced' && typeof c.price !== 'number') return false;
        if (filter.value === 'hidden' && !c.hidden) return false;
        return !needle || [p.pn, p.brandName, p.title, p.id].some((x) => String(x || '').toLowerCase().includes(needle));
      });
    };

    function row(p) {
      const c = data.items[p.id] || {};
      const price = numInput(c.price ?? '', { 'aria-label': `Price for ${p.pn}`, min: '0.01' });
      const tiers = textInput((c.tiers || []).map(([q, pr]) => `${q}:${pr}`).join('|'), { 'aria-label': `Quantity prices for ${p.pn}`, class: 'wide', placeholder: '10:254|50:241' });
      const stock = intInput(c.stock ?? '', { 'aria-label': `Stock for ${p.pn}` });
      const lead = intInput(c.leadDays ?? '', { 'aria-label': `Lead days for ${p.pn}`, max: '365' });
      const moq = intInput(c.moq ?? '', { 'aria-label': `Minimum order quantity for ${p.pn}`, min: '1' });
      const hidden = h('input', { type: 'checkbox', checked: !!c.hidden, 'aria-label': `Hide ${p.pn} from the store` });
      const state = h('span');
      const tr = h('tr', { class: p.removed ? 'removed' : '' });
      const saveBtn = button('Save', (btn) => act(btn, save), 'small', { disabled: true });
      const paintState = () => {
        const cur = data.items[p.id] || {};
        fill(state, 
          typeof cur.price === 'number' ? h('span', { class: 'badge ok' }, 'Has price') : h('span', { class: 'badge warn' }, 'Quote only'),
          p.removed ? [' ', h('span', { class: 'badge bad' }, 'Removed')] : null,
          p.source === 'admin' ? [' ', h('span', { class: 'badge info' }, 'Added by you')] : null);
      };

      const parseTiers = () => {
        const t = tiers.value.trim();
        if (!t) return null;
        return t.split(/[|;]/).map((part) => {
          const m = /^\s*(\d+)\s*[:=@]\s*(\d+(?:\.\d{1,2})?)\s*$/.exec(part);
          if (!m) throw new Error(`Quantity prices for ${p.pn} must look like 10:254|50:241.`);
          return [Number(m[1]), Number(m[2])];
        });
      };
      const body = () => ({
        price: numberOrNull(price.value, `Price for ${p.pn}`), tiers: parseTiers(), stock: numberOrNull(stock.value, `Stock for ${p.pn}`, { integer: true }),
        leadDays: numberOrNull(lead.value, `Lead days for ${p.pn}`, { integer: true }), moq: numberOrNull(moq.value, `MOQ for ${p.pn}`, { integer: true }),
      });
      const snapshot = () => JSON.stringify([price.value, tiers.value, stock.value, lead.value, moq.value]);
      let saved = snapshot();
      const markDirty = () => {
        const dirty = snapshot() !== saved;
        tr.className = `${p.removed ? 'removed ' : ''}${dirty ? 'dirty' : ''}`.trim();
        saveBtn.disabled = !dirty;
        if (dirty) dirtyRows.set(p.id, save); else dirtyRows.delete(p.id);
        saveAll.disabled = dirtyRows.size === 0;
      };
      async function save() {
        const r = await put(`/api/admin/commercial/${enc(p.id)}`, body());
        if (r.item) data.items[p.id] = r.item; else delete data.items[p.id];
        saved = snapshot();
        markDirty();
        paintState();
        toast(`Saved ${p.pn}.`);
      }
      for (const el of [price, tiers, stock, lead, moq]) el.addEventListener('input', markDirty);
      hidden.addEventListener('change', async () => {
        try {
          const r = await put(`/api/admin/commercial/${enc(p.id)}`, { hidden: hidden.checked });
          if (r.item) data.items[p.id] = r.item; else delete data.items[p.id];
          toast(hidden.checked ? `${p.pn} is now hidden from the store.` : `${p.pn} is visible in the store again.`);
        } catch (e) { hidden.checked = !hidden.checked; failure(e); }
      });
      paintState();
      append(tr, [
        h('td', { 'data-label': 'Product' }, openLink(p.pn, () => openProductForm(p.id)), h('div', { class: 'sub' }, [p.brandName, p.title].filter(Boolean).join(' - '))),
        h('td', { 'data-label': 'Price ₹ (excl. GST)' }, price), h('td', { 'data-label': 'Quantity prices' }, tiers), h('td', { 'data-label': 'Stock' }, stock),
        h('td', { 'data-label': 'Ready in (days)' }, lead), h('td', { 'data-label': 'Min. order' }, moq),
        h('td', { 'data-label': 'Hidden' }, h('label', { class: 'check' }, hidden, h('span', { class: 'small' }, 'Hide'))),
        h('td', { 'data-label': 'Status' }, state), h('td', null, saveBtn)]);
      return tr;
    }

    const saveAll = button('Save all changes', (btn) => act(btn, async () => {
      const fns = [...dirtyRows.values()];
      for (const fn of fns) await fn();
      toast(`Saved ${fns.length} product${fns.length === 1 ? '' : 's'}.`);
    }), '', { disabled: true });

    const paint = () => {
      const list = matches();
      dirtyRows.clear(); saveAll.disabled = true;
      clear(holder);
      if (!list.length) holder.append(h('div', { class: 'table-wrap' }, h('p', { class: 'empty' }, data.products.length ? 'No products match.' : 'No products found. The product catalogue file was not found on the server, or you have not added any products yet.')));
      else {
        holder.append(h('div', { class: 'table-wrap' }, h('table', { class: 'stackable' },
          h('thead', null, h('tr', null, ['Product', 'Price ₹ (excl. GST)', 'Quantity prices', 'Stock', 'Ready in (days)', 'Min. order', 'Hidden', 'Status', ''].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, list.slice(0, limit).map(row)))));
      }
      clear(more);
      if (list.length > limit) more.append(button(`Show more (${list.length - limit} more)`, () => { limit += 100; paint(); }, 'secondary'));
      count.textContent = `${list.length} product${list.length === 1 ? '' : 's'}${list.length > limit ? `, showing ${limit}` : ''}`;
    };
    const count = h('p', { class: 'muted small' });
    S.reload = () => get('/api/admin/commercial').then((fresh) => { data = fresh; paint(); }).catch(failure);
    search.addEventListener('input', debounce(() => { limit = 100; paint(); }));
    filter.addEventListener('change', () => { limit = 100; paint(); });

    fill(main, 
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Products & prices'),
        h('p', { class: 'muted' }, 'A product with no price shows "Quote only" in the store: nothing is ever made up. Type a price and press Save. Prices exclude GST.'))),
      h('div', { class: 'toolbar' }, field('Search', search), field('Show', filter),
        button('Add a product', () => openProductForm(null), 'secondary'), button('Add a brand', () => openBrandForm(), 'secondary'),
        button('Download CSV', (btn) => act(btn, downloadCsv), 'secondary'), button('Import CSV', () => openImport(), 'secondary'), saveAll),
      count, holder, more);
    paint();
  }

  async function downloadCsv() {
    const text = await api('GET', '/api/admin/commercial/export', undefined, { text: true });
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `bearingsetu-prices-${todayPlus(0)}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Downloaded. Open it in Excel, fill in the prices, save as CSV and use "Import CSV".');
  }

  function openImport() {
    const file = h('input', { type: 'file', accept: '.csv,text/csv' });
    const paste = area('', { rows: 5, placeholder: 'Or paste the CSV text here' });
    const merge = h('input', { type: 'radio', name: 'mode', value: 'merge', checked: true });
    const replace = h('input', { type: 'radio', name: 'mode', value: 'replace' });
    const result = h('div', { 'aria-live': 'polite' });
    let checked = null;
    const importBtn = button('Import now', (btn) => act(btn, async () => {
      if (!checked) return;
      if (replace.checked) {
        const ok = await confirmAction({ title: 'Replace all prices with this file?', message: 'Any product that is not in your file loses its price, stock and lead time.', confirmLabel: 'Yes, replace', danger: true });
        if (!ok) return;
      }
      const r = await post('/api/admin/commercial/import', { csv: checked, merge: merge.checked });
      toast(`Imported. ${r.updated} product${r.updated === 1 ? '' : 's'} updated${r.removed ? `, ${r.removed} cleared` : ''}${r.errors.length ? `, ${r.errors.length} row${r.errors.length === 1 ? '' : 's'} skipped` : ''}.`);
      closeDialog();
      if (S.reload) S.reload();
    }), '', { disabled: true });
    const showResult = (r) => {
      fill(result, 
        h('div', { class: `note ${r.errors.length ? 'warn' : 'ok'}` }, `Checked ${r.rows} row${r.rows === 1 ? '' : 's'}: ${r.updated} to update${r.removed ? `, ${r.removed} to clear` : ''}, ${r.errors.length} with problems. Nothing has been changed yet.`),
        r.errors.length ? h('ul', { class: 'confirm-list' }, r.errors.slice(0, 50).map((e) => h('li', null, `Line ${e.line}: ${e.message}`))) : null,
        r.errors.length ? h('p', { class: 'hint' }, 'Rows with problems are skipped; their existing values stay as they are.') : null);
    };
    const check = button('Check the file', (btn) => act(btn, async () => {
      const text = file.files && file.files[0] ? await file.files[0].text() : paste.value;
      if (!text.trim()) throw new Error('Choose a CSV file or paste its text first.');
      checked = text;
      showResult(await post('/api/admin/commercial/import', { csv: text, merge: merge.checked, dryRun: true }));
      importBtn.disabled = false;
    }), 'secondary');
    for (const el of [file, paste, merge, replace]) el.addEventListener('change', () => { importBtn.disabled = true; checked = null; });
    showDialog('Import prices from a CSV file',
      h('p', null, 'Tip: use "Download CSV" first, fill in the price columns in Excel, save as CSV, then import it here. We check the file first and only change things when you press "Import now".'),
      field('CSV file', file), field('Or paste the CSV text', paste),
      h('fieldset', null, h('legend', null, 'What should happen to products that are not in your file?'),
        h('div', { class: 'choice' }, h('label', { class: 'check' }, merge, h('span', null, h('strong', null, 'Leave them alone'), ' (recommended). Only the products in your file are updated.'))),
        h('div', { class: 'choice' }, h('label', { class: 'check' }, replace, h('span', null, h('strong', null, 'Clear them'), '. Your file becomes the complete price list.')))),
      result, h('div', { class: 'actions' }, check, importBtn, button('Cancel', closeDialog, 'secondary')));
  }

  /* ---- add / edit a product's technical details ---- */
  async function openProductForm(id) {
    const meta = await get('/api/admin/commercial');
    let existing = null;
    let source = 'new';
    if (id) {
      const r = await get(`/api/admin/catalog/products/${enc(id)}`).catch((e) => { failure(e); return null; });
      if (!r) return;
      existing = r.product; source = r.source;
    }
    const p = existing || {};
    const pn = textInput(p.pn || '', { maxlength: '80' });
    const idInput = textInput(id || '', { maxlength: '64', disabled: !!id });
    const brandSel = select([['', 'Choose a brand…'], ...meta.brands.map((b) => [b.id, b.name])], p.brand || '');
    const catSel = select([['', 'Choose a category…'], ...meta.categories.map((c) => [c.id, c.name])], p.cat || '');
    const titleIn = textInput(p.title || '', { maxlength: '200' });
    const family = textInput(p.family || '', { maxlength: '80' });
    const sub = textInput(p.sub || '', { maxlength: '60', list: 'sub-list' });
    const subList = h('datalist', { id: 'sub-list' });
    const fillSubs = () => { fill(subList, (meta.categories.find((c) => c.id === catSel.value)?.subs || []).map((s) => h('option', { value: s.id }, s.name))); };
    catSel.addEventListener('change', fillSubs); fillSubs();
    const dim = (k) => numInput(p[k] ?? '', { step: '0.001' });
    const d = dim('d'); const D = dim('D'); const B = dim('B');
    const seal = textInput(p.seal || '', { maxlength: '60' });
    const clr = textInput(p.clr || '', { maxlength: '20' });
    const spec = textInput(p.spec || '', { maxlength: '200' });
    const unit = textInput(p.unit || 'pc', { maxlength: '20' });
    const pack = textInput(p.pack || '', { maxlength: '40' });
    const hsn = textInput(p.hsn || '', { maxlength: '8', inputmode: 'numeric' });
    const gst = numInput(p.gst ?? '', { max: '100' });
    const imgIn = textInput(p.img || '', { maxlength: '120' });
    const desc = area(p.desc || '', { rows: 4 });
    const attrs = area((p.attrs || []).map(([k, v]) => `${k}: ${v}`).join('\n'), { rows: 5, placeholder: 'Dynamic load rating (C): 14.8 kN' });
    const eq = area((p.eq || []).join('\n'), { rows: 2 });
    const rel = area((p.rel || []).join('\n'), { rows: 2 });
    if (!id) {
      let idTouched = false;
      const autoId = () => { if (!idTouched) idInput.value = slug(`${brandSel.value} ${pn.value}`); };
      pn.addEventListener('input', autoId);
      brandSel.addEventListener('change', autoId);
      idInput.addEventListener('input', () => { idTouched = true; });
    }

    const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    const saveBtn = button(id ? 'Save changes' : 'Add product', (btn) => act(btn, async () => {
      const pid = (id || idInput.value.trim()).toLowerCase();
      if (!pid) throw new Error('Enter a product id (letters, numbers and dashes), for example skf-6205.');
      const pairs = lines(attrs.value).map((l) => { const i = l.indexOf(':'); if (i < 1) throw new Error(`Details line "${l}" must look like: Name: value`); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
      const product = {
        id: pid, pn: pn.value.trim(), brand: brandSel.value, cat: catSel.value, title: titleIn.value.trim(), family: emptyToUndef(family.value), sub: sub.value.trim(),
        d: numberOrNull(d.value, 'Inside diameter (d)') ?? undefined, D: numberOrNull(D.value, 'Outside diameter (D)') ?? undefined, B: numberOrNull(B.value, 'Width (B)') ?? undefined,
        seal: emptyToUndef(seal.value), clr: emptyToUndef(clr.value), spec: emptyToUndef(spec.value), unit: unit.value.trim() || 'pc', pack: emptyToUndef(pack.value),
        hsn: hsn.value.trim(), gst: numberOrNull(gst.value, 'GST rate') ?? undefined, img: imgIn.value.trim(), desc: desc.value.trim(), attrs: pairs, eq: lines(eq.value), rel: lines(rel.value),
      };
      if (!product.brand) throw new Error('Choose a brand. Use "Add a brand" if it is not in the list.');
      if (!product.cat) throw new Error('Choose a category.');
      await put(`/api/admin/catalog/products/${enc(pid)}`, product);
      toast(id ? 'Product saved.' : 'Product added. You can now enter its price in the table.');
      closeDialog();
      if (S.reload) S.reload();
    }));
    const delBtn = id && source === 'admin' ? button('Delete this product…', (btn) => act(btn, async () => {
      const ok = await confirmAction({ title: 'Delete this product?', message: 'It disappears from the store, together with its price and stock. This cannot be undone.', confirmLabel: 'Yes, delete', danger: true });
      if (!ok) return;
      await del(`/api/admin/catalog/products/${enc(id)}`);
      toast('Product deleted.');
      closeDialog();
      if (S.reload) S.reload();
    }), 'danger') : null;

    showDialog(id ? `Edit ${p.pn || id}` : 'Add a product',
      id && source === 'static' ? h('div', { class: 'note' }, 'This product comes from the built-in catalogue. Saving here stores your version, which replaces the built-in details in the store. Prices and stock are edited in the table.') : null,
      h('div', { class: 'row' }, field('Part number', pn), field('Product id', idInput, id ? 'Cannot be changed.' : 'Letters, numbers and dashes. Filled in for you.')),
      h('div', { class: 'row' }, field('Brand', brandSel), field('Category', catSel), field('Sub-category', sub)), subList,
      field('Name shown to customers', titleIn), field('Family / series (optional)', family),
      h('div', { class: 'row' }, field('Inside diameter d (mm)', d), field('Outside diameter D (mm)', D), field('Width B (mm)', B)),
      h('div', { class: 'row' }, field('Seal', seal), field('Clearance', clr), field('Spec', spec)),
      h('div', { class: 'row' }, field('Unit', unit), field('Pack size', pack), field('HSN code', hsn, '4 to 8 digits'), field('GST rate (%)', gst, 'Empty = your default rate')),
      field('Description', desc), field('Technical details, one per line as "Name: value"', attrs),
      h('div', { class: 'row' }, field('Equivalent part numbers (one per line)', eq), field('Related product ids (one per line)', rel)),
      field('Image name', imgIn, 'Name of an image already on the website.'),
      h('div', { class: 'actions' }, saveBtn, delBtn, button('Cancel', closeDialog, 'secondary')));
  }

  function openBrandForm() {
    const name = textInput('', { maxlength: '60' });
    const origin = textInput('', { maxlength: '60', placeholder: 'e.g. Sweden' });
    const idInput = textInput('', { maxlength: '64' });
    let idTouched = false;
    name.addEventListener('input', () => { if (!idTouched) idInput.value = slug(name.value); });
    idInput.addEventListener('input', () => { idTouched = true; });
    showDialog('Add a brand',
      field('Brand name', name), field('Country of origin (optional)', origin), field('Brand id', idInput, 'Letters, numbers and dashes. Filled in for you.'),
      h('div', { class: 'actions' }, button('Add brand', (btn) => act(btn, async () => {
        const id = idInput.value.trim().toLowerCase();
        if (!name.value.trim() || !id) throw new Error('Enter the brand name.');
        await put(`/api/admin/catalog/brands/${enc(id)}`, { name: name.value.trim(), origin: origin.value.trim() });
        toast('Brand added.');
        closeDialog();
      })), button('Cancel', closeDialog, 'secondary')));
  }

  /* ================= Settings ================= */
  async function viewSettings(main, rid) {
    const s = await get('/api/admin/settings');
    if (stale(rid)) return;
    const b = s.business;
    const t = (v, attrs) => textInput(v, { maxlength: '120', ...attrs });
    const f = {
      name: t(b.name), legalName: t(b.legalName), gstin: t(b.gstin, { maxlength: '15' }), stateCode: t(b.stateCode, { maxlength: '2', inputmode: 'numeric' }),
      address: area(b.addressLines.join('\n'), { rows: 3 }), city: t(b.city), state: t(b.state), pin: t(b.pin, { maxlength: '6', inputmode: 'numeric' }),
      phone: t(b.phone), whatsapp: t(b.whatsapp), email: t(b.email, { type: 'email' }), supportEmail: t(b.supportEmail, { type: 'email' }), hours: t(b.hours),
      gstRate: numInput(s.pricing.gstRate, { max: '100', step: '0.01' }), showGst: h('input', { type: 'checkbox', checked: s.pricing.showGstToggle }),
      flatFee: numInput(s.shipping.flatFee ?? '', {}), freeOver: numInput(s.shipping.freeOver ?? '', {}), shipNote: area(s.shipping.note, { rows: 2 }), leadNote: area(s.shipping.leadTimeNote, { rows: 2 }),
      notify: area(s.email.notifyTo.join('\n'), { rows: 3, placeholder: 'sales@example.com' }), fromName: t(s.email.fromName),
      indicative: h('input', { type: 'checkbox', checked: s.catalogue.showIndicativePerformance }),
      bannerOn: h('input', { type: 'checkbox', checked: s.banner.enabled }), bannerText: t(s.banner.text, { maxlength: '160' }), bannerLinkText: t(s.banner.linkText, { maxlength: '40' }),
      bannerUrl: t(s.banner.linkUrl, { maxlength: '300', placeholder: 'quick-order.html#rfq' }), bannerEnds: textInput(s.banner.endsOn, { type: 'date' }),
    };
    const pricingMode = (value, checked) => h('input', { type: 'radio', name: 'pricing-mode', value, checked });
    const pQuote = pricingMode('quote', s.pricing.mode === 'quote');
    const pList = pricingMode('list', s.pricing.mode === 'list');
    const shipMode = (value, checked) => h('input', { type: 'radio', name: 'ship-mode', value, checked });
    const sQuoted = shipMode('quoted', s.shipping.mode === 'quoted');
    const sFlat = shipMode('flat', s.shipping.mode === 'flat');

    const save = button('Save settings', (btn) => act(btn, async () => {
      const mode = pList.checked ? 'list' : 'quote';
      const shipping = sFlat.checked ? 'flat' : 'quoted';
      if (shipping === 'flat' && numberOrNull(f.flatFee.value, 'The flat shipping fee') === null) throw new Error('Enter the flat shipping fee (0 for free shipping), or choose "I quote freight for each order".');
      const body = {
        business: { name: f.name.value.trim(), legalName: f.legalName.value.trim(), gstin: f.gstin.value.trim().toUpperCase(), stateCode: f.stateCode.value.trim(), addressLines: f.address.value.split('\n').map((x) => x.trim()).filter(Boolean),
          city: f.city.value.trim(), state: f.state.value.trim(), pin: f.pin.value.trim(), phone: f.phone.value.trim(), whatsapp: f.whatsapp.value.trim(), email: f.email.value.trim(), supportEmail: f.supportEmail.value.trim(), hours: f.hours.value.trim() },
        pricing: { mode, gstRate: numberOrNull(f.gstRate.value, 'The GST rate') ?? 18, showGstToggle: f.showGst.checked },
        shipping: { mode: shipping, flatFee: numberOrNull(f.flatFee.value, 'The flat fee'), freeOver: numberOrNull(f.freeOver.value, 'Free shipping above'), note: f.shipNote.value.trim(), leadTimeNote: f.leadNote.value.trim() },
        catalogue: { showIndicativePerformance: f.indicative.checked },
        banner: { enabled: f.bannerOn.checked, text: f.bannerText.value.trim(), linkText: f.bannerLinkText.value.trim(), linkUrl: f.bannerUrl.value.trim(), endsOn: f.bannerEnds.value.trim() },
        email: { notifyTo: f.notify.value.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean), fromName: f.fromName.value.trim() },
      };
      await put('/api/admin/settings', body);
      toast('Settings saved.');
    }));

    fill(main, 
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Settings'), h('p', { class: 'muted' }, 'Leave a box empty if it does not apply: the store then simply hides that line.'))),
      h('div', { class: 'card' }, h('h2', null, 'Business details'),
        h('div', { class: 'row' }, field('Shop name', f.name), field('Legal name', f.legalName)),
        h('div', { class: 'row' }, field('GSTIN', f.gstin), field('GST state code', f.stateCode, 'First two digits of your GSTIN (27 = Maharashtra). Decides IGST or CGST + SGST on quotes and orders.')),
        field('Address lines (one per line)', f.address),
        h('div', { class: 'row' }, field('City', f.city), field('State', f.state), field('PIN code', f.pin)),
        h('div', { class: 'row' }, field('Phone', f.phone), field('WhatsApp number', f.whatsapp)),
        h('div', { class: 'row' }, field('Sales email', f.email), field('Support email', f.supportEmail)),
        field('Opening hours', f.hours, 'For example: Mon to Sat, 9:30 to 18:30')),
      h('div', { class: 'card' }, h('h2', null, 'How prices work'),
        h('fieldset', null, h('legend', null, 'Pricing mode'),
          h('div', { class: 'choice' }, h('label', { class: 'check' }, pQuote, h('span', null, h('strong', null, 'Quote only'), ' (safe to start with). Prices are never shown. Customers send you a list and you reply with prices and availability.'))),
          h('div', { class: 'choice' }, h('label', { class: 'check' }, pList, h('span', null, h('strong', null, 'Show my prices'), '. Customers see the prices you typed in "Products & prices" and can order directly (needs a flat shipping fee below). Products without a price still say "Quote only".')))),
        h('div', { class: 'row' }, field('GST rate (%)', f.gstRate, 'Added to quotes and orders.')),
        h('label', { class: 'check' }, f.showGst, h('span', null, 'Let visitors switch between prices with and without GST'))),
      h('div', { class: 'card' }, h('h2', null, 'Shipping'),
        h('fieldset', null, h('legend', null, 'Freight'),
          h('div', { class: 'choice' }, h('label', { class: 'check' }, sQuoted, h('span', null, h('strong', null, 'I quote freight for each order'), '. Customers must ask for a quote; direct ordering is switched off.'))),
          h('div', { class: 'choice' }, h('label', { class: 'check' }, sFlat, h('span', null, h('strong', null, 'Flat fee'), ' per order, optionally free above an order value.')))),
        h('div', { class: 'row' }, field('Flat fee (₹)', f.flatFee, 'Used only with "Flat fee". 0 = free shipping.'), field('Free shipping above (₹)', f.freeOver, 'Empty = never free.')),
        field('Shipping note shown to customers', f.shipNote), field('Lead time note shown to customers', f.leadNote)),
      h('div', { class: 'card' }, h('h2', null, 'Home page banner'),
        h('p', { class: 'muted' }, 'A slim one-line notice at the top of the home page. Keep it short and true. Do not promise delivery times, discounts or credit unless they are real.'),
        h('label', { class: 'check' }, f.bannerOn, h('span', null, 'Show the banner')),
        field('Message (up to 160 characters)', f.bannerText),
        h('div', { class: 'row' }, field('Link text', f.bannerLinkText, 'For example "Request a quotation".'), field('Link address', f.bannerUrl, 'A page of this site such as quick-order.html#rfq, or a full https:// address. Leave empty for no link.')),
        field('Stop showing after (optional)', f.bannerEnds, 'The banner disappears after this date.')),
      h('div', { class: 'card' }, h('h2', null, 'Emails'),
        field('Tell these people about new registrations, quotes and orders (one email per line)', f.notify),
        field('Sender name on emails', f.fromName, 'For example "Bearingsetu Sales".')),
      h('div', { class: 'card' }, h('h2', null, 'Catalogue'),
        h('label', { class: 'check' }, f.indicative, h('span', null, 'Show indicative performance data (load ratings and similar catalogue values) on product pages'))),
      h('div', { class: 'actions' }, save));
  }

  /* ================= Email log ================= */
  async function viewEmails(main, rid, params) {
    const status = select([['', 'All emails'], ['failed', 'Failed'], ['skipped', 'Not sent (no email server)'], ['sent', 'Sent']], params.status || '');
    const holder = h('div');
    const load = async () => {
      const r = await get(`/api/admin/outbox?limit=500${status.value ? `&status=${status.value}` : ''}`);
      if (stale(rid)) return;
      fill(holder, dataTable([
        { label: 'When', cell: (e) => dateTime(e.at), cls: 'nowrap' }, { label: 'To', cell: (e) => e.to }, { label: 'Subject', cell: (e) => e.subject },
        { label: 'Result', cell: (e) => badge('mail', e.status) }, { label: 'Details', cell: (e) => e.error || '' },
      ], r.items, 'No emails yet.'));
    };
    S.reload = () => load().catch(failure);
    status.addEventListener('change', S.reload);
    fill(main, 
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Email log'), h('p', { class: 'muted' }, 'Every email the system tried to send. If emails show "Not sent", the email server (SMTP) is not set up: see server/README.md.'))),
      h('div', { class: 'toolbar' }, field('Show', status), button('Refresh', S.reload, 'secondary')), holder);
    await load();
  }

  /* ================= Audit log ================= */
  const ACTIONS = {
    'account.register': 'Registered', 'account.status': 'Account status changed', 'account.discount': 'Discount changed', 'account.customPrices': 'Special prices changed', 'account.note': 'Internal note edited',
    'credit.change': 'Credit changed', 'credit.payment': 'Credit payment recorded', 'credit.charge': 'Credit used by an order', 'credit.release': 'Credit released',
    'quote.submit': 'Quote requested', 'quote.responded': 'Quote sent', 'quote.declined': 'Quote declined', 'quote.closed': 'Quote closed', 'quote.accept': 'Quote accepted',
    'order.place': 'Order placed', 'order.status': 'Order status changed', 'order.update': 'Order updated',
    'commercial.update': 'Price or stock changed', 'commercial.import': 'Prices imported', 'catalog.product': 'Product saved', 'catalog.hide': 'Product hidden', 'catalog.delete': 'Product deleted', 'catalog.brand': 'Brand saved', 'settings.update': 'Settings changed',
  };
  function describeAudit(e) {
    const b = e.before || {}; const a = e.after || {};
    switch (e.action) {
      case 'credit.change': return creditChanges({ status: b.status, limit: b.limit, termsDays: b.termsDays }, { status: a.status, limit: a.limit, termsDays: a.termsDays }).join('; ') + (e.note ? ` (note: ${e.note})` : '');
      case 'credit.payment': return `Payment of ${rupees(b.used - a.used)} recorded. Owed: ${rupees(b.used)} → ${rupees(a.used)}. ${e.note || ''}`.trim();
      case 'credit.charge': return `Order used ${rupees(a.used - b.used)} of credit. Owed: ${rupees(b.used)} → ${rupees(a.used)}. ${e.note || ''}`.trim();
      case 'credit.release': return `${rupees(b.used - a.used)} of credit released. Owed: ${rupees(b.used)} → ${rupees(a.used)}. ${e.note || ''}`.trim();
      default: return ACTIONS[e.action] || e.action;
    }
  }
  async function viewAudit(main, rid) {
    const entity = select([['', 'Everything'], ['account', 'Accounts'], ['credit', 'Credit'], ['quote', 'Quotes'], ['order', 'Orders'], ['commercial', 'Prices'], ['catalog', 'Products'], ['settings', 'Settings']], '');
    const holder = h('div');
    const load = async () => {
      const r = await get(`/api/admin/audit?limit=500${entity.value ? `&entity=${entity.value}` : ''}`);
      if (stale(rid)) return;
      fill(holder, dataTable([
        { label: 'When', cell: (e) => dateTime(e.at), cls: 'nowrap' },
        { label: 'Who', cell: (e) => (e.actor === 'admin' ? 'You (admin)' : e.actor) },
        { label: 'What', cell: (e) => ACTIONS[e.action] || e.action },
        { label: 'Item', cell: (e) => e.entityId },
        { label: 'Details', cell: (e) => h('details', null, h('summary', null, describeAudit(e).slice(0, 90) || 'Show'), h('pre', { class: 'small' }, JSON.stringify({ before: e.before, after: e.after, note: e.note }, null, 2))) },
      ], r.items, 'Nothing recorded yet.'));
    };
    S.reload = () => load().catch(failure);
    entity.addEventListener('change', S.reload);
    fill(main, 
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Audit log'), h('p', { class: 'muted' }, 'A permanent record of every change to accounts, credit, prices, orders and settings: who, when, before and after.'))),
      h('div', { class: 'toolbar' }, field('Show', entity), button('Refresh', S.reload, 'secondary')), holder);
    await load();
  }

  const VIEWS = { dashboard: viewDashboard, accounts: viewAccounts, quotes: viewQuotes, orders: viewOrders, products: viewProducts, settings: viewSettings, emails: viewEmails, audit: viewAudit };

  /* ================= start ================= */
  const savedToken = session.get('bsAdminToken');
  if (savedToken) {
    S.token = savedToken;
    S.api = session.get('bsAdminApi') || '';
    showShell();
  } else {
    showLogin();
  }
})();
