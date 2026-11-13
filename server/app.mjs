// The whole application, with no network socket: createApp() returns { handle, inject }.
// server/index.mjs is the only file that calls listen(). Tests use inject().
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ApiError, fail, isEmail, newId } from './lib/util.mjs';
import { Store } from './lib/store.mjs';
import { createCatalogLoader } from './lib/catalog.mjs';
import { createMailer, createMailQueue } from './lib/mail.mjs';
import { mergeSettings, businessName, staffRecipients } from './lib/settings.mjs';
import { hashPassword, isPasswordHash, verifyToken, dummyHash } from './lib/auth.mjs';
import { BODY_LIMIT, readBody, parseJsonBody, parseOrigins, corsHeaders, clientIp, createRateLimiter } from './lib/http.mjs';
import { publicRoutes } from './routes/public.mjs';
import { customerRoutes } from './routes/customer.mjs';
import { adminAccountRoutes } from './routes/admin-accounts.mjs';
import { adminSalesRoutes } from './routes/admin-sales.mjs';
import { adminCatalogRoutes } from './routes/admin-catalog.mjs';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};
const ADMIN_CSP = [
  "default-src 'self'", // everything from this server only ...
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*", // ... except the API address typed on the login screen
  "img-src 'self' data:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
const ADMIN_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

class Router {
  routes = [];
  add(method, pattern, opts, handler) {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
    this.routes.push({ method, re, keys, opts: opts || {}, handler });
  }
  get = (p, o, h) => this.add('GET', p, o, h);
  post = (p, o, h) => this.add('POST', p, o, h);
  put = (p, o, h) => this.add('PUT', p, o, h);
  patch = (p, o, h) => this.add('PATCH', p, o, h);
  delete = (p, o, h) => this.add('DELETE', p, o, h);
  /** Returns { route, params } | { methods } (path known, wrong method) | null */
  match(method, pathname) {
    const methods = [];
    for (const route of this.routes) {
      const m = route.re.exec(pathname);
      if (!m) continue;
      if (route.method !== method) { methods.push(route.method); continue; }
      const params = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route, params };
    }
    return methods.length ? { methods } : null;
  }
}

export function createApp({ dataDir, env = process.env, mailer, now = () => Date.now(), adminDir, log = console } = {}) {
  const nowMs = () => { const t = now(); return t instanceof Date ? t.getTime() : Number(t); };
  const production = env.NODE_ENV === 'production';

  // ---- configuration -----------------------------------------------------
  let secret = env.SECRET || '';
  if (!secret) {
    if (production) throw new Error('SECRET is required when NODE_ENV=production. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"');
    log.warn('[warning] SECRET is not set. Using a temporary secret: everyone is logged out whenever the server restarts. Set SECRET in server/.env.');
    secret = randomBytes(32).toString('hex');
  } else if (production && secret.length < 32) {
    throw new Error('SECRET is too short. Use at least 32 random characters.');
  }

  const resolveFromServer = (p) => path.resolve(SERVER_DIR, p);
  const dir = dataDir ? path.resolve(dataDir) : resolveFromServer(env.DATA_DIR || './data');
  const catalog = createCatalogLoader(env.CATALOG_FILE ? resolveFromServer(env.CATALOG_FILE) : resolveFromServer('../assets/js/catalog.js'), log);
  const corsOrigins = parseOrigins(env.CORS_ORIGINS);
  const trustProxy = Math.max(0, Math.min(5, Number(env.TRUST_PROXY) || 0));
  const adminFiles = adminDir || resolveFromServer('../admin');

  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = env.ADMIN_PASSWORD || '';
  let adminEnabled = Boolean(adminEmail && adminPassword);
  if (adminEnabled && !isPasswordHash(adminPassword) && adminPassword.length < 10) {
    log.error('[admin] ADMIN_PASSWORD is shorter than 10 characters, so the admin panel is switched off. Choose a longer password.');
    adminEnabled = false;
  }
  let adminHash = null;
  const admin = {
    enabled: adminEnabled,
    email: adminEmail,
    hash: () => (adminHash ??= isPasswordHash(adminPassword) ? Promise.resolve(adminPassword) : hashPassword(adminPassword)),
  };

  // ---- services shared by the routes --------------------------------------
  const store = new Store(dir);
  const settings = () => mergeSettings(store.get('settings'));
  const limiter = createRateLimiter(nowMs);

  const realMailer = mailer || createMailer({ env, dataDir: dir, now: nowMs });
  const mailQueue = createMailQueue({
    mailer: realMailer, now: nowMs,
    log: (entry) => store.tx(['outbox'], (d) => {
      d.outbox.items.push({ id: newId('eml'), ...entry });
      if (d.outbox.items.length > 2000) d.outbox.items.splice(0, d.outbox.items.length - 2000);
    }),
  });

  const S = {
    env, store, catalog, limiter, secret, admin, nowMs, production, settings, log,
    iso: () => new Date(nowMs()).toISOString(),
    /** Context for email templates. */
    mailCtx(extra = {}) {
      const s = settings();
      const url = (env.STOREFRONT_URL || '').trim();
      return { biz: businessName(s), storefrontUrl: /^https?:\/\//.test(url) ? url : '', contactEmail: s.business.supportEmail || s.business.email || '', ...extra };
    },
    /** Queue an email. Fire and forget: failures are written to the email log, never thrown. */
    mail(event, to, tpl) {
      const s = settings();
      const recipients = (Array.isArray(to) ? to : [to]).filter(isEmail);
      if (!recipients.length) return;
      const replyTo = [s.business.supportEmail, s.business.email].find(isEmail);
      mailQueue.enqueue({ event, to: recipients, subject: tpl.subject, text: tpl.text, html: tpl.html, replyTo, fromName: s.email.fromName || businessName(s) });
    },
    /** Email the staff addresses configured in settings. */
    staffMail(event, tpl) {
      this.mail(event, staffRecipients(settings()), tpl);
    },
    /** Resolves a customer token to the account. Throws 401 / 403. */
    customerFromRequest(req) {
      const header = String(req.headers.authorization || '');
      const m = /^Bearer (\S+)$/.exec(header);
      const claims = m && verifyToken(secret, m[1], 'customer', nowMs());
      if (!claims) throw fail(401, 'unauthorized', 'Please log in again.');
      const account = store.get('accounts').items.find((a) => a.id === claims.sub);
      if (!account) throw fail(401, 'unauthorized', 'Please log in again.');
      if (account.status === 'suspended') throw fail(403, 'account_suspended', 'This account is suspended. Please contact us.');
      return account;
    },
    adminFromRequest(req) {
      if (!admin.enabled) throw fail(503, 'admin_disabled', 'The admin API is switched off. Set ADMIN_EMAIL and ADMIN_PASSWORD on the server.');
      const m = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''));
      const claims = m && verifyToken(secret, m[1], 'admin', nowMs());
      if (!claims || claims.sub !== 'admin') throw fail(401, 'unauthorized', 'Please log in again.');
      return 'admin';
    },
  };

  const router = new Router();
  publicRoutes(router, S);
  customerRoutes(router, S);
  adminAccountRoutes(router, S);
  adminSalesRoutes(router, S);
  adminCatalogRoutes(router, S);

  let readyPromise = null;
  const ready = () => (readyPromise ??= store.init().then(async () => {
    await dummyHash(); // warm up, so the first unknown-email login takes as long as any other
    await catalog.get();
  }));

  // ---- response helpers ---------------------------------------------------
  function respond(res, status, headers, body, head = false) {
    const buf = body === undefined || body === null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body);
    res.writeHead(status, status === 204 ? headers : { ...headers, 'Content-Length': buf.length });
    res.end(head ? undefined : buf);
  }
  const json = (res, status, headers, obj, head) =>
    respond(res, status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }, JSON.stringify(obj), head);

  async function serveAdmin(res, pathname, method, baseHeaders) {
    const head = method === 'HEAD';
    if (method !== 'GET' && method !== 'HEAD') return json(res, 405, { ...baseHeaders, Allow: 'GET, HEAD' }, { error: 'method_not_allowed', message: 'Use GET.' });
    let name = pathname.replace(/^\/admin\/?/, '');
    if (name === '') name = 'index.html';
    const ext = path.extname(name).toLowerCase();
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.') || !ADMIN_TYPES[ext]) {
      return json(res, 404, baseHeaders, { error: 'not_found', message: 'Not found.' }, head);
    }
    let body;
    try {
      body = await readFile(path.join(adminFiles, name));
    } catch {
      return json(res, 404, baseHeaders, { error: 'not_found', message: 'Not found.' }, head);
    }
    // /admin (no slash) is served as the page too; a <base> makes its relative links work.
    if (name === 'index.html' && pathname === '/admin') body = Buffer.from(body.toString('utf8').replace(/<head>/i, '<head><base href="/admin/">'));
    return respond(res, 200, {
      ...baseHeaders, 'Content-Type': ADMIN_TYPES[ext], 'Content-Security-Policy': ADMIN_CSP, 'Cache-Control': 'no-cache',
    }, body, head);
  }

  // ---- the request handler -------------------------------------------------
  async function handle(req, res) {
    const origin = req.headers.origin;
    const base = { ...SECURITY_HEADERS, ...corsHeaders(origin, corsOrigins) };
    try {
      await ready();
      const raw = String(req.url || '/');
      if (!raw.startsWith('/')) throw fail(400, 'bad_request', 'Bad request.');
      const q = raw.indexOf('?');
      const pathname = q < 0 ? raw : raw.slice(0, q);
      const query = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1));
      const method = String(req.method || 'GET').toUpperCase();
      const head = method === 'HEAD';

      if (pathname === '/admin' || pathname.startsWith('/admin/')) return await serveAdmin(res, pathname, method, base);

      const apiBase = { ...base, 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
      if (!pathname.startsWith('/api/')) {
        if (pathname === '/') return json(res, 200, { ...apiBase, 'Cache-Control': 'no-store' }, { ok: true, service: 'bearingsetu-api', admin: '/admin/' }, head);
        return json(res, 404, { ...apiBase, 'Cache-Control': 'no-store' }, { error: 'not_found', message: 'Not found.' }, head);
      }
      if (method === 'OPTIONS') return respond(res, 204, { ...apiBase, 'Cache-Control': 'no-store' }, '');

      const found = router.match(head ? 'GET' : method, pathname);
      if (!found) throw fail(404, 'not_found', 'Unknown API path.');
      if (found.methods) {
        return json(res, 405, { ...apiBase, Allow: [...new Set(found.methods)].join(', ') }, { error: 'method_not_allowed', message: 'This path does not accept that method.' });
      }
      const { route, params } = found;
      const ctx = { req, method, pathname, query, params, body: {}, ip: clientIp(req, trustProxy), account: null, actor: null };

      if (route.opts.limit) {
        const [bucket, max, windowMs] = route.opts.limit;
        const r = limiter.hit(`${bucket}:${ctx.ip}`, max, windowMs);
        if (!r.ok) throw fail(429, 'rate_limited', 'Too many attempts. Please wait a while and try again.', { retryAfter: r.retryAfter });
      }
      if (route.opts.auth === 'admin') ctx.actor = S.adminFromRequest(req);
      else if (route.opts.auth === 'customer') ctx.account = S.customerFromRequest(req);
      else if (route.opts.auth === 'optional' && req.headers.authorization) ctx.account = S.customerFromRequest(req);

      if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
        const length = Number(req.headers['content-length']);
        const hasBody = req.headers['transfer-encoding'] || (Number.isFinite(length) && length > 0);
        if (hasBody) {
          if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
            throw fail(415, 'unsupported_media_type', 'Send the body as application/json.');
          }
          ctx.body = parseJsonBody(await readBody(req, BODY_LIMIT));
        }
      }

      const out = await route.handler(ctx);
      const headers = { ...apiBase };
      headers['Cache-Control'] = route.opts.cache ? `public, max-age=${route.opts.cache}` : 'no-store';
      if (out.headers) Object.assign(headers, out.headers);
      if (out.text !== undefined) return respond(res, out.status || 200, { ...headers, 'Content-Type': out.contentType || 'text/plain; charset=utf-8' }, out.text, head);
      return json(res, out.status || 200, headers, out.body ?? {}, head);
    } catch (err) {
      if (err instanceof ApiError || err?.status) {
        const headers = { ...base, 'Cache-Control': 'no-store' };
        const body = { error: err.error, message: err.message, ...(err.extra || {}) };
        if (err.status === 429 && err.extra?.retryAfter) headers['Retry-After'] = String(err.extra.retryAfter);
        if (err.status === 413) headers.Connection = 'close';
        delete body.retryAfter;
        return json(res, err.status, headers, body);
      }
      if (err instanceof URIError) return json(res, 400, base, { error: 'bad_request', message: 'Bad request.' });
      const id = randomBytes(4).toString('hex');
      log.error(`[error ${id}] ${req.method} ${String(req.url).split('?')[0]}: ${err?.stack || err}`);
      return json(res, 500, { ...base, 'Cache-Control': 'no-store' }, { error: 'server_error', message: `Something went wrong on the server (reference ${id}).` });
    }
  }

  /** Runs a request without any socket. Used by the tests. */
  async function inject({ method = 'GET', url = '/', headers = {}, body, ip = '203.0.113.7' } = {}) {
    const h = Object.fromEntries(Object.entries(headers).map(([k, val]) => [k.toLowerCase(), val]));
    let payload = Buffer.alloc(0);
    if (body !== undefined && body !== null) {
      if (Buffer.isBuffer(body)) payload = body;
      else if (typeof body === 'string') payload = Buffer.from(body);
      else { payload = Buffer.from(JSON.stringify(body)); h['content-type'] ??= 'application/json'; }
      h['content-length'] ??= String(payload.length);
    }
    const req = Object.assign(Readable.from(payload.length ? [payload] : []), { method, url, headers: h, socket: { remoteAddress: ip } });
    const out = await new Promise((resolve) => {
      const res = {
        statusCode: 200, headers: {}, chunks: [],
        writeHead(status, hdrs) { this.statusCode = status; for (const [k, val] of Object.entries(hdrs || {})) this.headers[k.toLowerCase()] = val; return this; },
        setHeader(k, val) { this.headers[k.toLowerCase()] = val; },
        end(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); resolve(this); },
      };
      handle(req, res);
    });
    await idle(); // let queued emails finish so tests can look at them
    const text = Buffer.concat(out.chunks).toString('utf8');
    let parsed = null;
    if (/json/.test(out.headers['content-type'] || '')) { try { parsed = JSON.parse(text); } catch { parsed = null; } }
    return { status: out.statusCode, headers: out.headers, json: parsed, text };
  }

  /** Resolves when pending data writes and queued emails are finished. */
  const idle = async () => { await mailQueue.idle(); await store.idle(); };

  return { handle, inject, idle, store, ready };
}
