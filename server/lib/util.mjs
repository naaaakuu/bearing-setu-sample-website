// Small shared helpers: errors, input validation, ids, dates.
import { randomBytes } from 'node:crypto';

/** An error that is safe to show to the caller. Becomes { error, message } JSON. */
export class ApiError extends Error {
  constructor(status, error, message, extra = null) {
    super(message);
    this.status = status;
    this.error = error;
    this.extra = extra;
  }
}
export const fail = (status, error, message, extra) => new ApiError(status, error, message, extra);
export const invalid = (field, message) => new ApiError(400, 'invalid_input', message, { field });

/** Own-property read, so ids like "constructor" or "__proto__" can never reach Object.prototype. */
export const own = (obj, key) => (obj && Object.hasOwn(obj, key) ? obj[key] : undefined);

export const newId = (prefix) => `${prefix}_${randomBytes(8).toString('hex')}`;

// ---- text cleaning -------------------------------------------------------
// Control characters are removed. Single-line fields also lose line breaks so they
// can never forge log lines or email headers.
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g;
const CTRL_LINE = /[\u0000-\u001F\u007F\u2028\u2029]/g;
export function cleanText(s, { multiline = false } = {}) {
  s = String(s).normalize('NFC');
  if (multiline) return s.replace(/\r\n?/g, '\n').replace(CTRL, '').trim();
  return s.replace(CTRL_LINE, ' ').replace(/\s+/g, ' ').trim();
}

// ---- validators ----------------------------------------------------------
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const PIN_RE = /^[1-9]\d{5}$/;
export const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const isEmail = (s) => typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s);

export const v = {
  str(value, field, { min = 0, max = 200, required = false, multiline = false, pattern = null, transform = null } = {}) {
    if (value === undefined || value === null) {
      if (required) throw invalid(field, `${field} is required.`);
      return undefined;
    }
    if (typeof value !== 'string') throw invalid(field, `${field} must be text.`);
    let s = cleanText(value, { multiline });
    if (transform) s = transform(s);
    if (s === '' && required) throw invalid(field, `${field} is required.`);
    if (s !== '' && s.length < min) throw invalid(field, `${field} must be at least ${min} characters.`);
    if (s.length > max) throw invalid(field, `${field} must be at most ${max} characters.`);
    if (s !== '' && pattern && !pattern.test(s)) throw invalid(field, `${field} is not in the expected format.`);
    return s;
  },
  email(value, field, { required = true } = {}) {
    const s = v.str(value, field, { required, max: 254, transform: (x) => x.toLowerCase() });
    if (s === undefined || s === '') return s;
    if (!isEmail(s)) throw invalid(field, `${field} is not a valid email address.`);
    return s;
  },
  phone(value, field, { required = true } = {}) {
    const s = v.str(value, field, { required, max: 24 });
    if (s === undefined || s === '') return s;
    const digits = s.replace(/\D/g, '');
    if (!/^\+?[0-9][0-9 ()-]*$/.test(s) || digits.length < 7 || digits.length > 15) {
      throw invalid(field, `${field} is not a valid phone number.`);
    }
    return s;
  },
  gstin(value, field, { required = true } = {}) {
    const s = v.str(value, field, { required, max: 15, transform: (x) => x.toUpperCase().replace(/\s/g, '') });
    if (s === undefined || s === '') return s;
    if (!GSTIN_RE.test(s)) throw invalid(field, `${field} must be a 15 character GSTIN such as 27ABCDE1234F1Z5.`);
    return s;
  },
  pin(value, field, { required = true } = {}) {
    const s = v.str(value, field, { required, max: 6, transform: (x) => x.replace(/\s/g, '') });
    if (s === undefined || s === '') return s;
    if (!PIN_RE.test(s)) throw invalid(field, `${field} must be a 6 digit PIN code.`);
    return s;
  },
  int(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, required = true } = {}) {
    if (value === undefined || value === null) {
      if (required) throw invalid(field, `${field} is required.`);
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw invalid(field, `${field} must be a whole number between ${min} and ${max}.`);
    }
    return value;
  },
  /** A number with at most `decimals` decimal places. */
  num(value, field, { min = 0, max = 1e9, decimals = 2, required = true } = {}) {
    if (value === undefined || value === null) {
      if (required) throw invalid(field, `${field} is required.`);
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw invalid(field, `${field} must be a number between ${min} and ${max}.`);
    }
    const scale = 10 ** decimals;
    if (Math.abs(value * scale - Math.round(value * scale)) > 1e-6) {
      throw invalid(field, `${field} can have at most ${decimals} decimal places.`);
    }
    return value;
  },
  bool(value, field, { required = false } = {}) {
    if (value === undefined || value === null) {
      if (required) throw invalid(field, `${field} is required.`);
      return undefined;
    }
    if (typeof value !== 'boolean') throw invalid(field, `${field} must be true or false.`);
    return value;
  },
  enum(value, field, values, { required = true } = {}) {
    if (value === undefined || value === null) {
      if (required) throw invalid(field, `${field} is required.`);
      return undefined;
    }
    if (typeof value !== 'string' || !values.includes(value)) {
      throw invalid(field, `${field} must be one of: ${values.join(', ')}.`);
    }
    return value;
  },
  obj(value, field, { required = true } = {}) {
    if (value === undefined || value === null) {
      if (required) throw invalid(field, `${field} is required.`);
      return undefined;
    }
    if (typeof value !== 'object' || Array.isArray(value)) throw invalid(field, `${field} must be an object.`);
    return value;
  },
  arr(value, field, { min = 0, max = 200, required = true } = {}) {
    if (value === undefined || value === null) {
      if (required) throw invalid(field, `${field} is required.`);
      return undefined;
    }
    if (!Array.isArray(value) || value.length < min || value.length > max) {
      throw invalid(field, `${field} must be a list of ${min} to ${max} items.`);
    }
    return value;
  },
  /** YYYY-MM-DD that is a real calendar date. */
  date(value, field, { required = true } = {}) {
    const s = v.str(value, field, { required, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    if (s === undefined || s === '') return s;
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw invalid(field, `${field} is not a real date.`);
    return s;
  },
};

// ---- dates (the business runs on Indian time, UTC+5:30) -------------------
const IST_OFFSET_MS = 330 * 60 * 1000;
export const istDate = (ms) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
export const istYear = (ms) => new Date(ms + IST_OFFSET_MS).getUTCFullYear();
/** A quote valid until D is usable through the end of D, Indian time. */
export const endOfIstDay = (dateStr) => Date.parse(`${dateStr}T23:59:59.999+05:30`);

export const clone = (x) => structuredClone(x);
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
