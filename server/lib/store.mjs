// A tiny JSON-file database.
//
// * Every collection is one file in DATA_DIR (accounts.json, orders.json ...).
// * All data is kept in memory; reads are instant.
// * All changes go through `tx()`, which runs one at a time (a mutex), works on a copy, and only
//   if the function finishes without error writes the changed files (temp file, fsync, rename)
//   and then swaps the copy in. A crash or a thrown error can never leave half-written data.
//
// Moving to a real database later: keep the same `get()` / `tx()` shape and replace the body of this
// file (see "Moving to a database" in server/README.md). The route code does not know about files.
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const COLLECTIONS = {
  accounts: () => ({ items: [] }),
  quotes: () => ({ items: [] }),
  orders: () => ({ items: [] }),
  commercial: () => ({ updatedAt: null, items: {} }),
  catalog: () => ({ updatedAt: null, products: {}, hidden: [], brands: {} }),
  settings: () => ({}),
  notifications: () => ({ items: [] }),
  audit: () => ({ items: [] }),
  outbox: () => ({ items: [] }),
  counters: () => ({ quote: {}, order: {} }),
};

export class Store {
  #dir;
  #data = {};
  #written = {}; // last serialised text per collection, to skip writes that change nothing
  #tail = Promise.resolve();

  constructor(dir) {
    this.dir = dir;
    this.#dir = dir;
  }

  async init() {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
    for (const [name, makeDefault] of Object.entries(COLLECTIONS)) {
      const file = join(this.#dir, `${name}.json`);
      let text;
      try {
        text = await readFile(file, 'utf8');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      if (text === undefined) {
        this.#data[name] = makeDefault();
        const out = JSON.stringify(this.#data[name], null, 2);
        await this.#commit([[name, out]]);
        this.#written[name] = out;
      } else {
        try {
          this.#data[name] = JSON.parse(text);
        } catch {
          // Never overwrite a damaged file: a person must look at it (restore from backup).
          throw new Error(`${file} is not valid JSON. Restore it from a backup, or move it away to start empty.`);
        }
        this.#written[name] = text;
      }
    }
  }

  /** Committed data. Treat as READ ONLY; change data only inside tx(). */
  get(name) {
    return this.#data[name];
  }

  /**
   * Run fn(draft) exclusively. `names` lists the collections the function may change; draft[name]
   * is a private copy. The return value of fn is returned. If fn throws, nothing is saved.
   */
  tx(names, fn) {
    const run = async () => {
      const draft = {};
      for (const n of names) draft[n] = structuredClone(this.#data[n]);
      const result = await fn(draft);
      const changed = [];
      for (const n of names) {
        const text = JSON.stringify(draft[n], null, 2);
        if (text !== this.#written[n]) changed.push([n, text]);
      }
      await this.#commit(changed);
      for (const [n, text] of changed) {
        this.#data[n] = draft[n];
        this.#written[n] = text;
      }
      return result;
    };
    const p = this.#tail.then(run);
    this.#tail = p.catch(() => {});
    return p;
  }

  /** Resolves when every queued change has been written. */
  idle() {
    return this.#tail;
  }

  async #writeFile(name, text) {
    const final = join(this.#dir, `${name}.json`);
    const tmp = `${final}.${randomBytes(4).toString('hex')}.tmp`;
    const fh = await open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(text);
      await fh.sync();
    } finally {
      await fh.close();
    }
    return { tmp, final };
  }

  async #commit(changed) {
    if (!changed.length) return;
    // Phase 1: write every temp file. Phase 2: rename them into place (the quick, near-atomic step).
    const staged = [];
    try {
      for (const [name, text] of changed) staged.push(await this.#writeFile(name, text));
    } catch (e) {
      await Promise.all(staged.map((s) => unlink(s.tmp).catch(() => {})));
      throw e;
    }
    for (const s of staged) await rename(s.tmp, s.final);
  }
}
