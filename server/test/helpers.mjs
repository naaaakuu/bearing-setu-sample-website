// Shared test helpers. Nothing here opens a network socket: requests go through app.inject().
import { mkdtemp, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.mjs';

const tempDirs = [];
process.on('exit', () => { for (const d of tempDirs) rmSync(d, { recursive: true, force: true }); });

export const PASSWORD = 'a-good-password-1';
export const ADMIN = { email: 'owner@bearingsetu.test', password: 'owner-password-123' };

const CATALOG_JS = `window.BS_CATALOG = ${JSON.stringify({
  categories: [{ id: 'ball-bearings', name: 'Ball bearings', subs: [{ id: 'deep-groove', name: 'Deep groove' }] }, { id: 'seals', name: 'Seals', subs: [] }],
  brands: [{ id: 'skf', name: 'SKF', origin: 'Sweden' }, { id: 'nok', name: 'NOK', origin: 'Japan' }],
  products: [
    { id: 'skf-6205', pn: '6205', brand: 'skf', title: 'Deep groove ball bearing, open', cat: 'ball-bearings', price: 999, stock: 5 },
    { id: 'skf-6206', pn: '6206', brand: 'skf', title: 'Deep groove ball bearing 6206', cat: 'ball-bearings' },
    { id: 'nok-tc-25x52x7', pn: 'TC 25x52x7', brand: 'nok', title: 'Oil seal', cat: 'seals' },
  ],
})};\n`;

export function fakeMailer() {
  const sent = [];
  return {
    sent,
    async send(msg) { sent.push(msg); return { status: 'sent' }; },
    to: (addr) => sent.filter((m) => m.to.includes(addr)),
    find: (re) => sent.filter((m) => re.test(m.subject)),
    clear: () => { sent.length = 0; },
  };
}

export function clock(startIso = '2026-06-15T10:00:00Z') {
  let t = Date.parse(startIso);
  return { now: () => t, advance: (ms) => { t += ms; }, set: (iso) => { t = Date.parse(iso); } };
}

/** Creates a fresh app on a temp data folder with a tiny fake catalogue. */
export async function makeApp({ env = {}, withAdmin = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'bs-test-'));
  tempDirs.push(dir);
  const catalogFile = join(dir, 'catalog.js');
  await writeFile(catalogFile, CATALOG_JS);
  const mailer = fakeMailer();
  const time = clock();
  const logs = { errors: [], warnings: [] };
  const app = createApp({
    dataDir: join(dir, 'data'),
    env: {
      SECRET: 's'.repeat(48), CORS_ORIGINS: 'https://shop.example.com, https://other.example.com/',
      CATALOG_FILE: catalogFile, ...(withAdmin ? { ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password } : {}), ...env,
    },
    mailer, now: time.now,
    log: { warn: (m) => logs.warnings.push(m), error: (m) => logs.errors.push(m), log() {} },
  });
  const t = {
    app, mailer, time, logs, dir, dataDir: join(dir, 'data'),
    /** req('POST', '/api/x', { body, token, headers, ip }) */
    req: (method, url, { body, token, headers = {}, ip } = {}) =>
      app.inject({ method, url, body, ip, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } }),
    get: (url, o) => t.req('GET', url, o),
    post: (url, body, o) => t.req('POST', url, { ...o, body }),
    put: (url, body, o) => t.req('PUT', url, { ...o, body }),
    patch: (url, body, o) => t.req('PATCH', url, { ...o, body }),
    del: (url, o) => t.req('DELETE', url, o),
  };
  t.adminToken = async () => {
    const r = await t.post('/api/admin/login', ADMIN);
    if (r.status !== 200) throw new Error(`admin login failed: ${r.status} ${r.text}`);
    return r.json.token;
  };
  t.admin = async () => {
    const token = await t.adminToken();
    const a = { token };
    return {
      token,
      get: (u) => t.get(u, a), post: (u, b) => t.post(u, b, a), put: (u, b) => t.put(u, b, a),
      patch: (u, b) => t.patch(u, b, a), del: (u) => t.del(u, a),
    };
  };
  let n = 0;
  /** Registers and logs in a customer. Pass { verify: true } to also verify the account. Returns { id, token, email, account, as } */
  t.customer = async ({ verify = false, gstin = '27ABCDE1234F1Z5', email, company = 'Test Works Pvt Ltd', admin } = {}) => {
    n += 1;
    email ??= `buyer${n}@example.com`;
    const reg = await t.post('/api/auth/register', {
      company, gstin, name: 'Asha Rao', email, phone: '+91 98765 43210', password: PASSWORD, city: 'Pune', state: 'Maharashtra',
    }, { ip: `198.51.100.${n}` });
    if (reg.status !== 201) throw new Error(`register failed ${reg.status} ${reg.text}`);
    let login = await t.post('/api/auth/login', { email, password: PASSWORD }, { ip: `198.51.100.${n}` });
    const id = login.json.account.id;
    if (verify) {
      const adm = admin || (await t.admin());
      const r = await adm.patch(`/api/admin/accounts/${id}`, { status: 'verified' });
      if (r.status !== 200) throw new Error(`verify failed ${r.status} ${r.text}`);
    }
    const token = login.json.token;
    return { id, email, token, as: { token } };
  };
  return t;
}

export const shipTo = { label: 'Plant', line1: '12 MIDC Road', city: 'Pune', state: 'Maharashtra', pin: '411019' };
export const contact = { name: 'Guest Buyer', company: 'Guest Co', email: 'guest@example.com', phone: '9876543210' };
