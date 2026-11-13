// Passwords (scrypt) and signed tokens (HMAC-SHA256). Only node:crypto, no dependencies.
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const scryptAsync = (password, salt, keylen, opts) =>
  new Promise((resolve, reject) => scrypt(password, salt, keylen, opts, (e, key) => (e ? reject(e) : resolve(key))));

/** Stored format: scrypt:N:r:p:salt:hash (colons, so it can be pasted into .env without shell expansion). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 256 * N * R });
  return `scrypt:${N}:${R}:${P}:${b64u(salt)}:${b64u(key)}`;
}

export const isPasswordHash = (s) => typeof s === 'string' && s.startsWith('scrypt:') && s.split(':').length === 6;

// A throwaway hash used so unknown accounts cost the same time as known ones.
let dummyPromise = null;
export const dummyHash = () => (dummyPromise ??= hashPassword(randomBytes(12).toString('hex')));

/** Constant-time check. Malformed stored values simply return false (after doing equivalent work). */
export async function verifyPassword(password, stored) {
  let parts = isPasswordHash(stored) ? stored.split(':') : null;
  if (parts) {
    const [, n, r, p] = parts;
    if (Number(n) > 1 << 17 || Number(r) > 16 || Number(p) > 4) parts = null;
  }
  if (!parts) {
    await hashPassword(String(password)); // keep the timing similar
    return false;
  }
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scryptAsync(String(password), Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 256 * Number(n) * Number(r),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const compareKey = randomBytes(32);
/** Compare two strings without leaking their length or content through timing. */
export function safeEqual(a, b) {
  const ha = createHmac('sha256', compareKey).update(String(a)).digest();
  const hb = createHmac('sha256', compareKey).update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

// ---- tokens: base64url(payload).base64url(hmac) ---------------------------
const sign = (secret, payloadB64) => createHmac('sha256', secret).update(payloadB64).digest();

export function signToken(secret, claims, ttlSeconds, nowMs) {
  const iat = Math.floor(nowMs / 1000);
  const payload = b64u(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  return `${payload}.${b64u(sign(secret, payload))}`;
}

/** Returns the claims if the token is genuine, unexpired and issued for `aud`; otherwise null. */
export function verifyToken(secret, token, aud, nowMs) {
  if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [payload, sig] = token.split('.');
  const given = Buffer.from(sig, 'base64url');
  const expected = sign(secret, payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || claims.aud !== aud || typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) return null;
  return claims;
}
