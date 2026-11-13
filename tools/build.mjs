#!/usr/bin/env node
// Bearingsetu static build.
// Every top-level .html page carries marker comments, for example
//   <!-- @header --> ... <!-- /@header -->
// This script replaces whatever sits between a pair of markers with the matching
// file from partials/ (header.html, footer.html, head.html). Pages stay plain HTML
// that GitHub Pages can serve as-is; run `node tools/build.mjs` after editing a partial.
//
// Header highlight: the link whose data-nav matches the page's <body data-nav="..."> gets
// aria-current. It is "page" only when the link's href is this page's file (shop.html on
// shop.html); otherwise it is "true", meaning "the section you are in" (Store on product.html).
// Use <body data-nav="none"> for pages that belong to no header section.

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
    // Match each opening tag that carries data-nav, so the tag's own href can be compared with the page.
    const body = html.replace(/<a\b[^>]*\sdata-nav="([^"]+)"[^>]*>/g, (tag, key) => {
      if (key !== nav) return tag;
      const href = (tag.match(/\shref="([^"]*)"/) || [])[1] || "";
      const current = href.replace(/&amp;/g, "&") === page ? "page" : "true";
      return tag.replace(/(\sdata-nav="[^"]+")/, `$1 aria-current="${current}"`);
    });
    out = out.replace(re, `$1\n${body}\n$2`);
  }
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`build: ${pages.length} pages checked, ${changed} updated`);
