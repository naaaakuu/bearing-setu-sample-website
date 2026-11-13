// Business settings: defaults, validation and the public view.
import { v, invalid, isEmail, cleanText } from './util.mjs';

export const DEFAULT_SETTINGS = Object.freeze({
  business: {
    name: '', legalName: '', gstin: '', addressLines: [], city: '', state: '', stateCode: '', pin: '',
    phone: '', whatsapp: '', email: '', supportEmail: '', hours: '',
  },
  pricing: { mode: 'quote', gstRate: 18, showGstToggle: true },
  shipping: { mode: 'quoted', flatFee: null, freeOver: null, note: '', leadTimeNote: '' },
  catalogue: { showIndicativePerformance: false },
  email: { notifyTo: [], fromName: '' },
});

/** Stored settings are sparse; fill gaps from the defaults so new options appear automatically. */
export function mergeSettings(stored) {
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const [section, fields] of Object.entries(out)) {
    const s = stored && typeof stored[section] === 'object' && stored[section] ? stored[section] : {};
    for (const key of Object.keys(fields)) if (s[key] !== undefined) fields[key] = s[key];
  }
  return out;
}

/** What GET /api/config returns: everything except private fields. */
export function publicSettings(settings) {
  const s = structuredClone(settings);
  delete s.email.notifyTo;
  return s;
}

const text = (max, multiline = false) => (val, f) => v.str(val, f, { max, multiline });
const optEmail = (val, f) => v.email(val, f, { required: false });
const optNum = (max) => (val, f) => (val === null ? null : v.num(val, f, { min: 0, max }));

const SPEC = {
  business: {
    name: text(120), legalName: text(160),
    gstin: (val, f) => v.gstin(val, f, { required: false }),
    addressLines: (val, f) => v.arr(val, f, { max: 6 }).map((x, i) => v.str(x, `${f}[${i}]`, { max: 120 })).filter(Boolean),
    city: text(80), state: text(80),
    stateCode: (val, f) => v.str(val, f, { max: 2, pattern: /^\d{2}$/ }),
    pin: (val, f) => v.pin(val, f, { required: false }),
    phone: text(30), whatsapp: text(30), email: optEmail, supportEmail: optEmail, hours: text(120),
  },
  pricing: {
    mode: (val, f) => v.enum(val, f, ['quote', 'list']),
    gstRate: (val, f) => v.num(val, f, { min: 0, max: 100 }),
    showGstToggle: (val, f) => v.bool(val, f),
  },
  shipping: {
    mode: (val, f) => v.enum(val, f, ['quoted', 'flat']),
    flatFee: optNum(1e7), freeOver: optNum(1e9),
    note: text(600, true), leadTimeNote: text(600, true),
  },
  catalogue: { showIndicativePerformance: (val, f) => v.bool(val, f) },
  email: {
    notifyTo: (val, f) => v.arr(val, f, { max: 10 }).map((x, i) => v.email(x, `${f}[${i}]`)),
    fromName: text(80),
  },
};

/** Validates a (possibly partial) settings object and returns the merged result. Unknown keys are ignored. */
export function applySettings(current, body) {
  v.obj(body, 'settings');
  const next = structuredClone(current);
  for (const [section, fields] of Object.entries(SPEC)) {
    if (body[section] === undefined) continue;
    const patch = v.obj(body[section], section);
    for (const [key, check] of Object.entries(fields)) {
      if (patch[key] === undefined) continue;
      const value = check(patch[key], `${section}.${key}`);
      if (value !== undefined) next[section][key] = value;
    }
  }
  if (next.shipping.mode === 'flat' && next.shipping.flatFee === null) {
    throw invalid('shipping.flatFee', 'Enter a flat shipping fee (use 0 for free shipping) or choose "I quote freight for each order".');
  }
  next.email.notifyTo = [...new Set(next.email.notifyTo)];
  return next;
}

export const staffRecipients = (settings) => settings.email.notifyTo.filter(isEmail);
export const businessName = (settings) => cleanText(settings.business.name || '') || 'Bearingsetu';
