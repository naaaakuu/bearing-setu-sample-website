// A very small fake browser, just enough to run admin/admin.js in tests with no real browser.
// It deliberately THROWS if the page ever sets innerHTML, which proves the panel only builds text nodes.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

export class FNode {}
export class FText extends FNode {
  constructor(data) { super(); this.data = String(data); this.parent = null; }
  get textContent() { return this.data; }
}

export class FElement extends FNode {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attrs = {};
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.className = '';
    this.disabled = false;
    this.checked = false;
    this.selected = false;
    this.open = false;
    this.files = null;
    this._value = undefined;
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...kids) {
    for (const k of kids) {
      const node = typeof k === 'string' ? new FText(k) : k;
      if (!(node instanceof FNode)) throw new Error(`append() got a non-node: ${typeof node}`);
      if (node.parent) node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...kids) { for (const c of this.children) c.parent = null; this.children = []; this.append(...kids); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
  addEventListener(ev, fn, opts) { (this.listeners[ev] ||= []).push({ fn, once: !!(opts && opts.once) }); }
  removeEventListener(ev, fn) { this.listeners[ev] = (this.listeners[ev] || []).filter((l) => l.fn !== fn); }
  dispatch(ev, extra = {}) {
    const event = { type: ev, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const l of [...(this.listeners[ev] || [])]) {
      if (l.once) this.removeEventListener(ev, l.fn);
      l.fn(event);
    }
  }
  click() { this.dispatch('click'); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.dispatch('close'); } }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'SELECT') {
      const opts = this.children.filter((c) => c.tagName === 'OPTION');
      const sel = opts.find((o) => o.selected) || opts[0];
      return sel ? (sel._value ?? sel.attrs.value ?? sel.textContent) : '';
    }
    return this.attrs.value ?? '';
  }
  set value(v) { this._value = String(v); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
  get innerHTML() { throw new Error('innerHTML must never be used'); }
  set innerHTML(v) { throw new Error(`innerHTML must never be used (got ${String(v).slice(0, 40)})`); }
  get outerHTML() { throw new Error('outerHTML must never be used'); }
  // ---- helpers for tests ----
  all(pred = () => true, out = []) { for (const c of this.children) if (c instanceof FElement) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  find(pred) { return this.all(pred)[0] || null; }
  text() { return this.textContent; }
  hasClass(c) { return this.className.split(/\s+/).includes(c); }
}

/** Builds the sandbox and runs admin.js. fetchImpl(path, init) -> { status, text } */
export function loadAdmin({ adminJs, fetchImpl, origin = 'http://localhost', session = {}, local = {} }) {
  const body = new FElement('body');
  const make = (tag, id, cls = '') => { const el = new FElement(tag); el.id = id; el.className = cls; body.append(el); return el; };
  const els = {
    app: make('div', 'app'), toasts: make('div', 'toasts', 'toast-area'),
    confirm: make('dialog', 'confirm'), drawer: make('dialog', 'drawer'), dialog: make('dialog', 'dialog'),
  };
  for (const name of ['confirm', 'drawer', 'dialog']) {
    const dlg = els[name];
    const inner = new FElement('div'); inner.id = `${name}-body`; dlg.append(inner);
    const toasts = new FElement('div'); toasts.id = `${name}-toasts`; dlg.append(toasts);
  }
  const document = {
    body,
    createElement: (t) => new FElement(t),
    createTextNode: (t) => new FText(t),
    getElementById: (id) => body.find((e) => e.id === id),
  };
  const storage = (init) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
  const window = { localStorage: storage(local), sessionStorage: storage(session) };
  class FURL extends URL { static createObjectURL() { return 'blob:fake'; } static revokeObjectURL() {} }
  const sandbox = {
    window, document, Node: FNode, location: new URL(origin), URL: FURL, URLSearchParams, Intl, Blob, console,
    setTimeout, clearTimeout, fetch: async (path, init) => { const r = await fetchImpl(path, init); return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.text }; },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(adminJs, 'utf8'), sandbox, { filename: 'admin.js' });
  return { document, window, els, body };
}

export const tick = () => new Promise((r) => setTimeout(r, 2));
export async function waitFor(cond, what = 'condition', tries = 1500) {
  for (let i = 0; i < tries; i++) {
    const v = cond();
    if (v) return v;
    await tick();
  }
  throw new Error(`Timed out waiting for ${what}`);
}
