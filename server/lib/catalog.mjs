// Reads the storefront's static catalogue (assets/js/catalog.js). READ ONLY: this server never writes it.
// The file assigns window.BS_CATALOG = {...}; we run it in an empty sandbox (node:vm) and copy the result.
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';

const EMPTY = Object.freeze({ available: false, categories: [], brands: [], products: [], byId: new Map() });

export function createCatalogLoader(file, log = console) {
  let cache = null;
  return {
    file,
    /** Returns { available, categories, brands, products, byId }. Never throws; a missing file means "empty". */
    async get() {
      let st;
      try {
        st = await stat(file);
      } catch {
        return EMPTY;
      }
      if (cache && cache.mtimeMs === st.mtimeMs && cache.size === st.size) return cache.data;
      let data = EMPTY;
      try {
        const sandbox = { window: {} };
        vm.createContext(sandbox);
        vm.runInContext(await readFile(file, 'utf8'), sandbox, { timeout: 2000 });
        const raw = sandbox.window.BS_CATALOG ?? sandbox.BS_CATALOG;
        // Round trip through JSON so we hold plain objects from this realm, with no functions.
        const c = JSON.parse(JSON.stringify(raw));
        const products = Array.isArray(c.products) ? c.products.filter((p) => p && typeof p.id === 'string') : [];
        data = {
          available: products.length > 0,
          categories: Array.isArray(c.categories) ? c.categories : [],
          brands: Array.isArray(c.brands) ? c.brands : [],
          products,
          byId: new Map(products.map((p) => [p.id, p])),
        };
      } catch (e) {
        log.warn(`[catalog] could not read ${file}: ${e.message}. Continuing without the static catalogue.`);
      }
      cache = { mtimeMs: st.mtimeMs, size: st.size, data };
      return data;
    },
  };
}

/**
 * Everything the admin can price: the static products plus products the admin added, with the
 * admin's edits applied. Returns Map id -> { id, pn, brand, title, cat, source, removed }.
 */
export function productIndex(catalog, adminCatalog) {
  const index = new Map();
  const hidden = new Set(adminCatalog.hidden || []);
  for (const p of catalog.products) {
    index.set(p.id, { id: p.id, pn: p.pn, brand: p.brand, title: p.title, cat: p.cat, source: 'static', removed: hidden.has(p.id) });
  }
  for (const p of Object.values(adminCatalog.products || {})) {
    index.set(p.id, {
      id: p.id, pn: p.pn, brand: p.brand, title: p.title, cat: p.cat,
      source: catalog.byId.has(p.id) ? 'static' : 'admin', edited: true, removed: hidden.has(p.id),
    });
  }
  return index;
}
