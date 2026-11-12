#!/usr/bin/env node
// Bearingsetu static build.
// Every top-level .html page carries marker comments, for example
//   <!-- @header --> ... <!-- /@header -->
// This script replaces whatever sits between a pair of markers with the matching
// file from partials/ (header.html, footer.html, head.html). Pages stay plain HTML
// that GitHub Pages can serve as-is; run `node tools/build.mjs` after editing a partial.
//
// Per-page values inside partials: {{nav:<key>}} becomes aria-current="page" on the
// link whose data-nav matches the page's <body data-nav="...">.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const partials = {};
for (const f of readdirSync(join(root, "partials"))) {
  if (f.endsWith(".html")) partials[f.replace(/\.html$/, "")] = readFileSync(join(root, "partials", f), "utf8").trim();
}

// Optional: node tools/build.mjs shop.html product.html  (only those pages)
const only = process.argv.slice(2).map((f) => f.replace(/^.*\//, ""));
const pages = readdirSync(root).filter((f) => f.endsWith(".html") && (!only.length || only.includes(f)));
let changed = 0;
for (const page of pages) {
  const file = join(root, page);
  const src = readFileSync(file, "utf8");
  const nav = (src.match(/<body[^>]*data-nav="([^"]+)"/) || [])[1] || "";
  let out = src;
  for (const [name, html] of Object.entries(partials)) {
    const re = new RegExp(`(<!-- @${name} -->)[\\s\\S]*?(<!-- /@${name} -->)`, "g");
    const body = html.replace(/\s*data-nav="([^"]+)"/g, (m, key) => (key === nav ? `${m} aria-current="page"` : m));
    out = out.replace(re, `$1\n${body}\n$2`);
  }
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`build: ${pages.length} pages checked, ${changed} updated`);
