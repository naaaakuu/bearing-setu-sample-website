// Admin: prices and stock (commercial data), admin-added products and brands, settings.
import { fail, v, own, SLUG_RE } from '../lib/util.mjs';
import { parseCsv, toCsv } from '../lib/csv.mjs';
import { productIndex } from '../lib/catalog.mjs';
import { applySettings } from '../lib/settings.mjs';
import { pushAudit } from '../lib/domain.mjs';
import { brandName } from './public.mjs';

const auth = { auth: 'admin' };

// ---- commercial data (price, tiers, stock, lead time, MOQ, hidden) ---------
const isEmptyEntry = (e) => e.price === null && e.tiers === undefined && e.stock === undefined && e.leadDays === undefined && e.moq === undefined && !e.hidden;

/**
 * Applies a (partial) update to an existing entry. A missing key keeps the old value; null clears it.
 * Returns the new entry. Throws ApiError(400) on bad input.
 */
export function applyCommercial(existing, input) {
  const e = { price: existing?.price ?? null, ...(existing || {}) };
  const set = (key, value) => { if (value === null || value === undefined) delete e[key]; else e[key] = value; };
  const given = (k) => input[k] !== undefined;

  if (given('price')) e.price = input.price === null ? null : v.num(input.price, 'price', { min: 0.01, max: 1e7 });
  if (given('stock')) set('stock', input.stock === null ? null : v.int(input.stock, 'stock', { min: 0, max: 1e9 }));
  if (given('leadDays')) set('leadDays', input.leadDays === null ? null : v.int(input.leadDays, 'leadDays', { min: 0, max: 365 }));
  if (given('moq')) set('moq', input.moq === null ? null : v.int(input.moq, 'moq', { min: 1, max: 1e6 }));
  if (given('hidden')) set('hidden', v.bool(input.hidden, 'hidden') || null);
  if (given('tiers')) {
    if (input.tiers === null || (Array.isArray(input.tiers) && input.tiers.length === 0)) delete e.tiers;
    else {
      const rows = v.arr(input.tiers, 'tiers', { max: 10 }).map((t, i) => {
        if (!Array.isArray(t) || t.length !== 2) throw fail(400, 'invalid_input', `tiers[${i}] must be [minimum quantity, price].`, { field: 'tiers' });
        return [v.int(t[0], `tiers[${i}] quantity`, { min: 2, max: 1e6 }), v.num(t[1], `tiers[${i}] price`, { min: 0.01, max: 1e7 })];
      }).sort((a, b) => a[0] - b[0]);
      e.tiers = rows;
    }
  }
  if (e.tiers) {
    if (e.price === null) throw fail(400, 'invalid_input', 'Quantity prices need a normal price first.', { field: 'tiers' });
    let prev = e.price;
    let prevQty = 1;
    for (const [qty, price] of e.tiers) {
      if (qty === prevQty) throw fail(400, 'invalid_input', 'Two quantity prices have the same quantity.', { field: 'tiers' });
      if (price > prev) throw fail(400, 'invalid_input', 'A quantity price cannot be higher than the price for fewer pieces.', { field: 'tiers' });
      prev = price;
      prevQty = qty;
    }
  }
  return e;
}

const HEADERS = ['id', 'pn', 'brand', 'title', 'price', 'tiers', 'stock', 'lead_days', 'moq', 'hidden'];
const HEADER_ALIASES = { leaddays: 'leadDays', lead_days: 'leadDays', 'lead days': 'leadDays', 'lead time': 'leadDays', 'part number': 'pn', product_id: 'id', 'product id': 'id' };

const parseCell = {
  price(s) { const t = s.replace(/[₹,\s]|rs\.?/gi, ''); if (!t) return null; if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error(`Price "${s}" is not a number with up to 2 decimals.`); return Number(t); },
  tiers(s) {
    if (!s.trim()) return null;
    return s.split(/[|;]/).map((part) => {
      const m = /^\s*(\d+)\s*[:=@]\s*₹?\s*(\d+(?:\.\d{1,2})?)\s*$/.exec(part);
      if (!m) throw new Error(`Quantity price "${part.trim()}" must look like 10:254 (minimum quantity:price), separated by |.`);
      return [Number(m[1]), Number(m[2])];
    });
  },
  int(label) { return (s) => { const t = s.replace(/[,\s]/g, ''); if (!t) return null; if (!/^\d+$/.test(t)) throw new Error(`${label} "${s}" must be a whole number.`); return Number(t); }; },
  hidden(s) { const t = s.trim().toLowerCase(); if (['yes', 'true', '1', 'y', 'hidden'].includes(t)) return true; if (['', 'no', 'false', '0', 'n'].includes(t)) return false; throw new Error(`Hidden "${s}" must be yes or no.`); },
};
parseCell.stock = parseCell.int('Stock');
parseCell.leadDays = parseCell.int('Lead days');
parseCell.moq = parseCell.int('MOQ');

const tiersToText = (t) => (t || []).map(([q, p]) => `${q}:${p}`).join('|');

// ---- admin-added products ---------------------------------------------
const strList = (value, field, max, len) => v.arr(value, field, { max }).map((x, i) => v.str(x, `${field}[${i}]`, { required: true, max: len }));

function parseProduct(id, body, { categories, brands, defaultGst }) {
  v.obj(body, 'product');
  if (body.id !== undefined && body.id !== id) throw fail(400, 'invalid_input', 'The id in the body must match the id in the address.', { field: 'id' });
  const p = {
    id,
    pn: v.str(body.pn, 'pn', { required: true, max: 80 }),
    brand: v.str(body.brand, 'brand', { required: true, max: 60 }),
    cat: v.str(body.cat, 'cat', { required: true, max: 60 }),
    title: v.str(body.title, 'title', { required: true, max: 200 }),
  };
  p.family = v.str(body.family, 'family', { max: 80 }) || p.pn;
  p.sub = v.str(body.sub, 'sub', { max: 60 }) || '';
  if (brands.length && !brands.includes(p.brand)) throw fail(400, 'invalid_input', `Unknown brand "${p.brand}". Add the brand first.`, { field: 'brand' });
  if (categories.length && !categories.includes(p.cat)) throw fail(400, 'invalid_input', `Unknown category "${p.cat}".`, { field: 'cat' });
  for (const k of ['d', 'D', 'B']) {
    const n = v.num(body[k], k, { min: 0, max: 100000, decimals: 3, required: false });
    if (n !== undefined) p[k] = n;
  }
  for (const [k, max] of [['seal', 60], ['clr', 20], ['spec', 200], ['pack', 40]]) {
    const s = v.str(body[k], k, { max });
    if (s) p[k] = s;
  }
  p.attrs = body.attrs === undefined ? [] : v.arr(body.attrs, 'attrs', { max: 60 }).map((pair, i) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw fail(400, 'invalid_input', `attrs[${i}] must be [name, value].`, { field: 'attrs' });
    return [v.str(pair[0], `attrs[${i}] name`, { required: true, max: 80 }), v.str(pair[1], `attrs[${i}] value`, { required: true, max: 200 })];
  });
  p.desc = v.str(body.desc, 'desc', { max: 4000, multiline: true }) || '';
  p.img = v.str(body.img, 'img', { max: 120 }) || '';
  if (body.eq !== undefined) p.eq = strList(body.eq, 'eq', 50, 80);
  if (body.rel !== undefined) p.rel = strList(body.rel, 'rel', 50, 80);
  p.unit = v.str(body.unit, 'unit', { max: 20 }) || 'pc';
  p.hsn = v.str(body.hsn, 'hsn', { max: 8, pattern: /^\d{4,8}$/ }) || '';
  p.gst = v.num(body.gst ?? defaultGst, 'gst', { min: 0, max: 100 });
  return p;
}

export function adminCatalogRoutes(r, S) {
  const loadIndex = async () => {
    const catalog = await S.catalog.get();
    const adminCat = S.store.get('catalog');
    return { catalog, adminCat, index: productIndex(catalog, adminCat) };
  };
  const allBrands = (catalog, adminCat) => {
    const map = new Map(catalog.brands.map((b) => [b.id, { id: b.id, name: b.name, origin: b.origin || '' }]));
    for (const b of Object.values(adminCat.brands)) map.set(b.id, b);
    return [...map.values()];
  };

  r.get('/api/admin/commercial', auth, async () => {
    const { catalog, adminCat, index } = await loadIndex();
    const c = S.store.get('commercial');
    return {
      body: {
        updatedAt: c.updatedAt, items: c.items, catalogAvailable: catalog.available,
        products: [...index.values()].map((p) => ({ ...p, brandName: brandName(catalog, adminCat, p.brand) })),
        categories: catalog.categories.map((x) => ({ id: x.id, name: x.name, subs: x.subs || [] })),
        brands: allBrands(catalog, adminCat),
      },
    };
  });

  r.put('/api/admin/commercial/:id', auth, async ({ params, body }) => {
    const { index } = await loadIndex();
    const id = params.id;
    if (!index.has(id)) throw fail(404, 'unknown_product', 'That product does not exist in the catalogue.');
    v.obj(body, 'body');
    const result = await S.store.tx(['commercial', 'audit'], (d) => {
      const before = own(d.commercial.items, id) ?? null;
      const next = applyCommercial(before, body);
      const after = isEmptyEntry(next) ? null : next;
      if (JSON.stringify(before) === JSON.stringify(after)) return { item: after, changed: false };
      if (after) d.commercial.items[id] = after; else delete d.commercial.items[id];
      d.commercial.updatedAt = S.iso();
      pushAudit(d, S.nowMs(), { actor: 'admin', action: 'commercial.update', entity: 'commercial', entityId: id, before, after });
      return { item: after, changed: true };
    });
    return { body: { id, item: result.item, changed: result.changed } };
  });

  r.get('/api/admin/commercial/export', auth, async () => {
    const { catalog, adminCat, index } = await loadIndex();
    const items = S.store.get('commercial').items;
    const rows = [HEADERS];
    for (const p of index.values()) {
      const c = own(items, p.id) || {};
      rows.push([p.id, p.pn, brandName(catalog, adminCat, p.brand), p.title, c.price ?? '', tiersToText(c.tiers), c.stock ?? '', c.leadDays ?? '', c.moq ?? '', c.hidden ? 'yes' : '']);
    }
    const day = S.iso().slice(0, 10);
    return {
      text: `\uFEFF${toCsv(rows, [1, 2, 3])}`, contentType: 'text/csv; charset=utf-8',
      headers: { 'Content-Disposition': `attachment; filename="bearingsetu-prices-${day}.csv"` },
    };
  });

  r.post('/api/admin/commercial/import', auth, async ({ body }) => {
    const csv = v.str(body.csv, 'csv', { required: true, max: 262144, multiline: true });
    const merge = v.bool(body.merge, 'merge') ?? false;
    const dryRun = v.bool(body.dryRun, 'dryRun') ?? false;
    let records;
    try { records = parseCsv(csv); } catch (e) { throw fail(400, 'invalid_csv', e.message); }
    if (!records.length) throw fail(400, 'invalid_csv', 'The file is empty.');

    const columns = records[0].cells.map((h) => {
      const key = h.trim().toLowerCase();
      return HEADER_ALIASES[key] || key.replace(/_(.)/g, (_, c) => c.toUpperCase());
    });
    const idCol = columns.indexOf('id');
    if (idCol < 0) throw fail(400, 'invalid_csv', 'The first row must be column names, and one column must be "id".');
    const known = ['price', 'tiers', 'stock', 'leadDays', 'moq', 'hidden'];
    const dataCols = columns.map((name, i) => [name, i]).filter(([name]) => known.includes(name));
    if (!dataCols.length) throw fail(400, 'invalid_csv', 'No price columns found. Expected columns: id, price, tiers, stock, lead_days, moq, hidden.');
    if (records.length < 2) throw fail(400, 'invalid_csv', 'The file has no product rows.');
    const { index } = await loadIndex();

    const plan = (items) => {
      const errors = [];
      const seen = new Set();
      const next = merge ? { ...items } : {};
      const touched = new Set();
      for (const { line, cells } of records.slice(1)) {
        const id = (cells[idCol] || '').trim();
        try {
          if (!id) throw new Error('The product id is missing.');
          if (seen.has(id)) throw new Error(`Product "${id}" appears twice in the file.`);
          seen.add(id);
          if (!index.has(id)) throw new Error(`Unknown product id "${id.slice(0, 60)}".`);
          // In replace mode a row builds the entry from scratch; in merge mode only the listed columns change.
          const input = {};
          if (!merge) for (const k of known) input[k] = null;
          for (const [name, i] of dataCols) input[name] = parseCell[name](cells[i] ?? '');
          const entry = applyCommercial(merge ? own(items, id) : null, input);
          if (isEmptyEntry(entry)) delete next[id]; else next[id] = entry;
          touched.add(id);
        } catch (e) {
          errors.push({ line, message: e.message });
          if (id && !merge && !touched.has(id) && own(items, id)) { next[id] = items[id]; touched.add(id); } // a bad row never wipes the old value
        }
      }
      if (!merge) for (const id of Object.keys(items)) if (!seen.has(id) && !index.has(id)) next[id] = items[id]; // orphans stay put
      const changes = [];
      for (const id of new Set([...Object.keys(items), ...Object.keys(next)])) {
        const a = own(items, id) ?? null;
        const b = own(next, id) ?? null;
        if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ id, before: a, after: b });
      }
      return { errors, next, changes, rows: seen.size };
    };

    const summarise = ({ errors, changes, rows }) => ({
      updated: changes.filter((c) => c.after).length, removed: changes.filter((c) => !c.after).length, rows, errors,
    });

    if (dryRun) return { body: { ...summarise(plan(S.store.get('commercial').items)), dryRun: true } };
    const result = await S.store.tx(['commercial', 'audit'], (d) => {
      const p = plan(d.commercial.items);
      if (p.changes.length) {
        d.commercial.items = p.next;
        d.commercial.updatedAt = S.iso();
        pushAudit(d, S.nowMs(), {
          actor: 'admin', action: 'commercial.import', entity: 'commercial', entityId: 'import',
          after: { mode: merge ? 'merge' : 'replace', changed: p.changes.length, errors: p.errors.length, changes: p.changes.slice(0, 200) },
        });
      }
      return p;
    });
    return { body: { ...summarise(result), dryRun: false } };
  });

  // ---- admin-added products and brands ---------------------------------
  r.get('/api/admin/catalog/products/:id', auth, async ({ params }) => {
    const { catalog, adminCat, index } = await loadIndex();
    const product = own(adminCat.products, params.id) || catalog.byId.get(params.id);
    if (!product) throw fail(404, 'not_found', 'Product not found.');
    return { body: { product, source: index.get(params.id)?.source, removed: !!index.get(params.id)?.removed } };
  });

  r.put('/api/admin/catalog/products/:id', auth, async ({ params, body }) => {
    const { catalog, adminCat, index } = await loadIndex();
    const id = params.id;
    if (!SLUG_RE.test(id) && !catalog.byId.has(id)) {
      throw fail(400, 'invalid_input', 'The product id may only use lowercase letters, numbers, dots, dashes and underscores (max 64).', { field: 'id' });
    }
    const brands = allBrands(catalog, adminCat).map((b) => b.id);
    const categories = catalog.categories.map((c) => c.id);
    const product = parseProduct(id, body, { categories, brands, defaultGst: S.settings().pricing.gstRate });
    const isNew = !index.has(id);
    await S.store.tx(['catalog', 'audit'], (d) => {
      const before = own(d.catalog.products, id);
      d.catalog.products[id] = product;
      d.catalog.hidden = d.catalog.hidden.filter((x) => x !== id); // saving a product makes it visible again
      d.catalog.updatedAt = S.iso();
      pushAudit(d, S.nowMs(), { actor: 'admin', action: 'catalog.product', entity: 'catalog', entityId: id, before: before && { pn: before.pn, title: before.title }, after: { pn: product.pn, title: product.title } });
    });
    return { status: isNew ? 201 : 200, body: { product } };
  });

  r.delete('/api/admin/catalog/products/:id', auth, async ({ params }) => {
    const { catalog, index } = await loadIndex();
    const id = params.id;
    if (!index.has(id)) throw fail(404, 'not_found', 'Product not found.');
    const builtIn = catalog.byId.has(id);
    await S.store.tx(['catalog', 'commercial', 'audit'], (d) => {
      delete d.catalog.products[id];
      if (builtIn) {
        if (!d.catalog.hidden.includes(id)) d.catalog.hidden.push(id);
      } else {
        delete d.commercial.items[id]; // an added product that is deleted leaves no orphan prices
      }
      d.catalog.updatedAt = S.iso();
      pushAudit(d, S.nowMs(), { actor: 'admin', action: builtIn ? 'catalog.hide' : 'catalog.delete', entity: 'catalog', entityId: id });
    });
    return { body: { ok: true, hidden: builtIn } };
  });

  r.put('/api/admin/catalog/brands/:id', auth, async ({ params, body }) => {
    const { catalog } = await loadIndex();
    const id = params.id;
    if (!SLUG_RE.test(id) && !catalog.brands.some((b) => b.id === id)) {
      throw fail(400, 'invalid_input', 'The brand id may only use lowercase letters, numbers, dots, dashes and underscores.', { field: 'id' });
    }
    v.obj(body, 'body');
    const brand = { id, name: v.str(body.name, 'name', { required: true, max: 60 }), origin: v.str(body.origin, 'origin', { max: 60 }) || '' };
    await S.store.tx(['catalog', 'audit'], (d) => {
      const before = own(d.catalog.brands, id);
      d.catalog.brands[id] = brand;
      d.catalog.updatedAt = S.iso();
      pushAudit(d, S.nowMs(), { actor: 'admin', action: 'catalog.brand', entity: 'catalog', entityId: id, before, after: brand });
    });
    return { body: { brand } };
  });

  // ---- settings ----------------------------------------------------------
  r.get('/api/admin/settings', auth, () => ({ body: S.settings() }));

  r.put('/api/admin/settings', auth, async ({ body }) => {
    const next = await S.store.tx(['settings', 'audit'], (d) => {
      const before = S.settings();
      const after = applySettings(before, body);
      if (JSON.stringify(before) === JSON.stringify(after)) return after;
      d.settings = after;
      const changed = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      pushAudit(d, S.nowMs(), { actor: 'admin', action: 'settings.update', entity: 'settings', entityId: 'settings', before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, after[k]])) });
      return after;
    });
    return { body: next };
  });
}
