#!/usr/bin/env node
// Writes sitemap.xml and robots.txt from the pages and the catalogue.
// Run after changing the catalogue:  node tools/build-sitemap.mjs [https://your-site/base/]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] || "https://naaaakuu.github.io/bearing-setu-sample-website/").replace(/\/?$/, "/");
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(root, "assets/js/catalog.js"), "utf8"), sandbox);
const C = sandbox.window.BS_CATALOG;

const urls = ["", "shop.html", "quick-order.html", "business.html", "tools.html", "support.html", "about.html", "policies.html", "sitemap.html"];
for (const c of C.categories) { urls.push(`shop.html?cat=${c.id}`); for (const s of c.subs || []) urls.push(`shop.html?cat=${c.id}&sub=${s.id}`); }
for (const p of C.products) urls.push(`product.html?id=${encodeURIComponent(p.id)}`);

const esc = (s) => s.replace(/&/g, "&amp;");
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(base + u)}</loc></url>`).join("\n")}\n</urlset>\n`;
writeFileSync(join(root, "sitemap.xml"), xml);
writeFileSync(join(root, "robots.txt"), `User-agent: *\nDisallow: /admin/\nDisallow: /server/\nDisallow: /cart.html\nDisallow: /checkout.html\nDisallow: /account.html\nSitemap: ${base}sitemap.xml\n`);
console.log(`sitemap.xml: ${urls.length} URLs`);
