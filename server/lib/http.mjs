// HTTP plumbing: reading bodies, CORS, rate limits, client IP, responses.
import { fail } from './util.mjs';

export const BODY_LIMIT = 256 * 1024;

/** Reads a request body up to `limit` bytes. Rejects with 413 as soon as the limit is passed. */
export function readBody(req, limit = BODY_LIMIT) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) return Promise.reject(fail(413, 'payload_too_large', 'The request is too large (limit 256 KB).'));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('close', onClose);
      fn(value);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.pause?.(); // stop reading; the 413 response closes the connection
        finish(reject, fail(413, 'payload_too_large', 'The request is too large (limit 256 KB).'));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => finish(resolve, Buffer.concat(chunks));
    const onError = (e) => finish(reject, e);
    const onClose = () => finish(reject, fail(400, 'aborted', 'The request was interrupted.'));
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('close', onClose);
  });
}

export function parseJsonBody(buffer) {
  if (!buffer.length) return {};
  let value;
  try {
    value = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw fail(400, 'invalid_json', 'The request body is not valid JSON.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw fail(400, 'invalid_json', 'The request body must be a JSON object.');
  }
  return value;
}

// ---- CORS ----------------------------------------------------------------
export function parseOrigins(value) {
  return new Set(
    String(value || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter((s) => s && s !== '*'),
  );
}

export function corsHeaders(origin, allowed) {
  const headers = { Vary: 'Origin' };
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

// ---- client address and rate limits -------------------------------------
function normaliseIp(ip) {
  ip = String(ip || '').trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (ip.includes(':')) {
    // IPv6: one visitor can use a whole /64, so limit by the /64 prefix.
    const [head, tail = ''] = ip.split('::');
    const a = head ? head.split(':') : [];
    const b = tail ? tail.split(':') : [];
    const groups = ip.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
    return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
  }
  return ip || 'unknown';
}

/** trustProxy = number of reverse proxies in front of this server (0 = none). */
export function clientIp(req, trustProxy = 0, override) {
  if (override) return normaliseIp(override);
  if (trustProxy > 0) {
    const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const hit = parts[parts.length - trustProxy];
    if (hit) return normaliseIp(hit);
  }
  return normaliseIp(req.socket?.remoteAddress);
}

export function createRateLimiter(nowMs) {
  const hits = new Map(); // key -> [timestamps]
  return {
    /** Records an attempt. Returns { ok:true } or { ok:false, retryAfter } (seconds). */
    hit(key, limit, windowMs) {
      const now = nowMs();
      const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfter: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10000) {
        for (const [k, arr] of hits) if (now - arr[arr.length - 1] > 3600000) hits.delete(k);
      }
      return { ok: true };
    },
  };
}
