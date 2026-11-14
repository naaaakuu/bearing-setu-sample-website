# Bearingsetu audit: what was wrong, what changed, what is open

Audit of the original site (commit `fe5ff27`) and the rebuild. The deployed site and moglix.com could not be opened from the build environment (network policy), so the original was audited from the repository, which is exactly what GitHub Pages serves, rendered locally on desktop (1366 px) and phone (390 px). Moglix was used from general knowledge of its patterns (search-first header, category navigation, spec-rich listing cards, faceted filters), not copied.

## 1. Audit findings

The original was technically clean (no console errors, no horizontal scroll, good accessibility basics). Its problems were commercial and informational, and they were everywhere.

| # | Finding | Impact | Scale in the original |
|---|---|---|---|
| 1 | Same-day dispatch, "order by 4 pm", "ships today" shown as fact | Unfulfillable delivery promise given high logistics cost | 93 mentions in 22 files, including page titles, meta tags and the mega menu |
| 2 | Free dispatch over ₹5,000, flat ₹120 fee, hard-coded in cart maths | Wrong freight on every order | 55 mentions, logic in the cart and checkout |
| 3 | "30-day credit for business" advertised publicly; credit granted by matching a GSTIN of a built-in demo customer | Public promise of credit, no approval control | 90 mentions; `BS.creditOK` |
| 4 | Tier and volume pricing on every product, "Priced for your volumes" | Blanket volume-pricing claim | 37 mentions |
| 5 | Invented commercial data on all 199 parts: prices, MRP and "You save %", stock counts, ship days, 4.x star ratings, 11,418 review counts, 45 named customer testimonials, bestseller / price-drop tags | Fake data presented as real | Every product |
| 6 | Invented seller identity (address, a made-up GSTIN printed on invoices) and 64 invented `@bearingsetu.com` addresses; a demo customer account | Wrong legal details on documents | Checkout, invoices, account |
| 7 | "This is a sample store" notices next to live-looking commerce | Contradictory and untrustworthy | 48 mentions |
| 8 | Load ratings, speeds and weights given per brand, with values that differ slightly between makers of the same standard size and cannot be verified | Possibly inaccurate specifications | 428 values on 159 parts; now kept in the data but hidden until verified |
| 9 | Product photos of one maker's bearing (visible "KINEX" marking) shown as SKF, FAG, NSK parts | Misleading | Most bearing cards |
| 10 | Factory, warehouse, dispatch and "industries we serve" scene photos | Imply capacity and customers that are not verified | 18 images (51 files), none needed by the catalogue |
| 11 | Apple-style hero: 70 px headline, a full-width photo, an announcement strip, three promotional pills | Pushes search and categories below the fold, and carries the claims above | Home page |
| 12 | Search lived in a modal behind an icon; no category-specific filters on the listing | Slow discovery, which is the main business need | Header, shop |
| 13 | No real accounts, credit approval, quotation storage, order records, notifications or admin: everything was `localStorage` on the visitor's own browser | None of the B2B features could work for real | Whole site |
| 14 | Checkout simulated payment and order placement | A visitor could "place an order" that went nowhere | Checkout |

Preserved because they worked: part-number normalisation and size search logic, the equivalents data and the engineering tools (decoder, equivalent finder, belt and grease calculators), the BOM parser idea, the self-hosted fonts and icons, the build script, and the existing URLs (`index`, `shop`, `product?id=`, `cart`, `checkout`, `quick-order`, `business`, `account`, `support`, `tools`, `about`, `policies`, `sitemap`, `404`) and product ids.

## 2. What changed

**Honesty and business rules**
* All 14 findings above removed. A search of the rendered text of every page for same-day, free dispatch, 30-day, tier or volume pricing, bestseller, in stock, ships today, reviews and sample-store wording finds nothing.
* One configuration file (`assets/js/config.js`) and an optional API replace every hard-coded rule. Blank values hide lines instead of showing placeholders.
* Pricing defaults to quotation mode. With real prices entered, price-list mode shows them, with quantity tiers only if entered, and GST inclusive or exclusive.
* Credit is backend-controlled, off by default, approval-only, notified by email and in-app, audited, and enforced at order time. No public page promises it.
* Freight is stated plainly and is configurable (quoted, flat, free over a threshold).

**Discovery (the priority)**
* Search is in the header on every page with suggestions (parts, categories, brands, size shortcut), keyboard support and recent searches. Part numbers match regardless of spaces, hyphens, slashes, underscores and case; brand prefixes ("SKF 6205 2RS1"); size queries ("25x52x15", "25 52 15", "25 x 52 x 15 mm"); equivalents ("NSK 6205DDU" finds the SKF 2RS1 equivalent group); synonyms ("v belt", "oil seal").
* Listing filters are category-specific: bearings get bore, outside diameter, width, seal and clearance; V-belts get section, length and profile; oil seals get shaft, bore, width, type and material; greases get NLGI grade; chains get pitch. Counts update live, filters sit in the URL, and phones get a filter sheet.
* Home page is search first (with one optional, owner-controlled text notice instead of promotional banners), then categories, a size finder for bearings, seals and belts, shortcuts, ways to buy and brands. No banners, no sliders, no oversized headings.
* Product cards lead with brand, part number, size and key specifications; the product page adds a dimension drawing generated from the real sizes, a specification table, equivalent designations and related parts. Performance ratings are hidden until verified.

**B2B commerce**
* A single quote list and quotation request (with GSTIN validation) replace cart and checkout. Quick order parses pasted lists and CSV or Excel files, tolerates unmatched lines and sends them as written.
* Business accounts: registration, verification, quotations, orders, reorder, notifications, ship-to details, all through the API. Direct ordering is offered only when prices are published and freight is not quote-only.

**Administration** (`server/`, `admin/`; see `server/README.md`)
* Accounts (verify, suspend, discount, note), a separate Credit panel with confirmation, quotations (price, availability, freight, validity), orders (status, carrier, tracking, payment), products and prices (inline edit, CSV import and export, add parts and brands), settings (business, shipping, pricing mode, GST, notification emails), email log and audit log.

**Engineering**
* About 60 percent less CSS and JavaScript to download (1.24 MB to 0.49 MB, including the catalogue), no framework, no runtime dependencies. Duplicated header and footer markup is generated from the partials, and menus are built from the catalogue instead of 400 lines of copy.
* 54 unused image files and 4 unused stylesheets deleted. Passwords are hashed with scrypt, tokens are signed, every user-supplied string is escaped, requests are rate limited.

## 3. How it was tested

Browser tests drive the real pages with Playwright in desktop and phone sizes: no console errors or horizontal scroll on any page, forbidden-claim scan on rendered text, 17 part-number search variants, suggestions and keyboard navigation, filters and URL state, pagination, no-result state, quote list and drawer (stepper, undo, Escape), CSV download, quotation validation and the static send options, quick order, and static mode hiding account features. A second run configures price-list mode, contact details and a flat freight rule and checks prices, tiers, GST toggle, availability from entered data only, price sorting, and the email and WhatsApp send links. The server's 97 tests run with `node --test "test/*.test.mjs"` from `server/`; they cover credit rules, accounts, quotes, orders, GST maths, CSV import, SMTP and escaping. A further browser run drives the real admin panel against the real server (login, credit approval with its confirmation, prices, logs) and checks that hostile input is shown as text and never runs.

## 4. Open items for the business

These cannot be decided from the repository. Each has a place to be set, and the site behaves honestly until then.

1. **Real contact details**: phone, WhatsApp, email, hours, address, GSTIN and legal name (`config.js` or admin Settings). Until entered, quotation requests in static mode can only be downloaded, copied or printed, which the page says plainly.
2. **Host the API** (Node 22 or newer) and set `apiBase`. Without it there are no accounts, no stored quotations and no credit.
3. **Prices, stock and lead times**: enter real ones in the admin panel or `commercial.js`, then switch `pricing.mode` to `"list"` if you want them shown.
4. **Confirm the catalogue is your range.** It holds 199 standard parts across nine categories, including lubrication, chains, linear motion and mounting tools beyond the three core lines. Remove or hide what you do not sell. The brand list does not imply any distributorship, and the page says so.
5. **Confirm GST and HSN.** The catalogue carries HSN 8482 for bearings, 4010 for belts and 4016 for seals at 18 percent GST. Have your accountant confirm before invoicing.
6. **Replace the representative photos** with your own, and complete the shipping, returns and terms wording with your real policies (`policies.html` is deliberately generic).
7. **Shipping rule.** Decide whether freight is always quoted, flat, or free above a threshold.
8. **Not built**: password reset, online payment, and editing category structure in the admin panel. Moglix itself could not be opened from this environment, so comparison is from general knowledge.
