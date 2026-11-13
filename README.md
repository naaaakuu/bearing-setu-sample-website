# Bearingsetu

Online storefront for Bearingsetu, a B2B supplier of bearings, V-belts, oil seals and related industrial parts. It is built around finding the right part quickly (part number, size, brand, equivalents) and buying by quotation.

**Live site:** https://naaaakuu.github.io/bearing-setu-sample-website/

The site has two layers:

| Layer | What it is | Needs hosting |
|---|---|---|
| **Storefront** (this folder) | Plain HTML, CSS and JavaScript. Search, catalogue, filters, product pages, quote list, quotation request, quick order, tools. | GitHub Pages is enough. |
| **API and admin panel** (`server/`, `admin/`) | Business accounts, admin-approved credit, quotations, orders, email notifications, price and stock entry. | Any host that runs Node 22 or newer. See `server/README.md`. |

Without the API the storefront still works fully as a catalogue and enquiry site. Accounts, credit and order tracking are simply not shown.

## The rules this site follows

* **Nothing invented.** There are no prices, stock levels, ratings, reviews, sales tags, delivery promises or credit offers in the code. A part with no price shows "Quote on request". Availability is shown only if someone entered it.
* **Credit is not for everyone.** It is off for every account by default, only an administrator can switch it on (per account, with a limit and terms), the customer is told by email and in their account, and nobody else ever sees it. See "Credit" below.
* **Freight is explicit and configurable.** The default is "freight is charged separately and confirmed in your quotation". Change it in `assets/js/config.js` or the admin panel.
* **No banners.** The home page has no promotional strip. Search, categories and size finding come first.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Search-first home page, categories, size finder for bearings, oil seals and V-belts, ways to buy |
| `shop.html` | Catalogue: search results and browsing with category-specific filters, sort, grid and list views. All state is in the URL |
| `product.html?id=…` | Facts first: dimensions, specification, dimension drawing, equivalent designations, quote actions |
| `cart.html` | The quote list (kept at the old URL) |
| `checkout.html` | Request a quotation (kept at the old URL). Signed-in verified accounts can also order when prices and freight rules are published |
| `quick-order.html` | Paste a list or upload CSV or Excel, review the matches, add to the quote list |
| `business.html`, `account.html` | How businesses buy; registration, sign-in, quotations, orders and credit (API only) |
| `tools.html` | Part number decoder, equivalent finder, belt length and grease calculators, inch and mm converter |
| `support.html`, `about.html`, `policies.html`, `sitemap.html`, `404.html` | Help and contact, company, shipping, payments, terms, privacy, image credits |

## Configure it (no coding)

Everything about the business lives in **`assets/js/config.js`**. Leave a value empty and the site hides that line. When the API is connected, the same settings are edited in the admin panel instead.

* `business`: name, GSTIN, address, phone, WhatsApp, email, hours. Phone and WhatsApp appear in the top bar, footer and product pages. Email and WhatsApp receive quotation requests when there is no API.
* `pricing.mode`: `"quote"` (default, no prices shown) or `"list"` (prices you entered are shown; parts without a price still say Quote on request).
* `shipping`: `mode` (`quoted`, `flat`, `free-over`), `flatFee`, `freeOver`, and the sentence shown to buyers.
* `catalogue.showIndicativePerformance`: load ratings, limiting speeds and weights are kept in the data but hidden until you have checked them against datasheets.

Prices, stock and lead times live in **`assets/js/commercial.js`** (empty by default) or, with the API, in the admin panel's *Products and prices* with CSV import and export.

## Catalogue data

`assets/js/catalog.js` is the technical catalogue: categories, brands and 199 parts with sizes, construction, equivalent designations and descriptions. It contains no commercial data. To add or change parts, edit this file, or use *Products and prices* in the admin panel when the API is on. Search, filters, suggestions, tools and quick order all read from it.

Replace the representative photos in `assets/img/p` with your own product photography when you can (`policies.html#credits` lists the current photo credits).

## Credit

1. A customer registers a business account (company, GSTIN, contact). Credit status is `none`.
2. An administrator verifies the account in the admin panel.
3. The administrator opens the account's Credit panel and approves a limit and payment terms. The panel asks for confirmation because it emails the customer.
4. The customer receives an email and an in-app notification. Only now does the account see credit, and *Credit* appears as a payment option on its orders, enforced against the available limit.
5. Changing the limit, suspending or withdrawing credit repeats the notification. Every change is in the audit log.

## Build and preview

The header, footer and `<head>` basics are shared partials. Never edit the copies inside the pages. Edit `partials/*.html`, then run:

```bash
node tools/build.mjs                 # all pages
node tools/build.mjs shop.html       # or only the pages you name
```

After changing the catalogue, regenerate the sitemap and robots rules:

```bash
node tools/build-sitemap.mjs                     # uses the GitHub Pages address
node tools/build-sitemap.mjs https://example.com/  # or your own domain
```

Preview by serving the folder that contains the site, so paths match the live site (`/bearing-setu-sample-website/`):

```bash
cd ..
python3 -m http.server 4173
# http://localhost:4173/bearing-setu-sample-website/
```

## Structure

```
assets/js/config.js       Business settings (the one file the owner edits)
assets/js/catalog.js      Technical catalogue
assets/js/commercial.js   Prices, stock, lead times (empty by default)
assets/js/site.js         Core: config, catalogue, price rules, search, quote list
assets/js/api.js          Optional API client, sign-in session, live settings
assets/js/ui.js           Header search and suggestions, menus, drawer, product card
assets/js/pages/*.js      One script per page
assets/css/site.css       Design system; one stylesheet per page group
server/                   API (Node, no dependencies) and its tests
admin/                    Admin panel for the business owner
docs/API.md               The API contract
docs/AUDIT.md             What was wrong, what changed, what is still open
tools/build.mjs           Copies the partials into every page
tools/build-sitemap.mjs   Writes sitemap.xml and robots.txt
tools/fixtures/           Test-only sample prices, never published
```

## Deploying

The storefront deploys from `main` on GitHub Pages. The API runs anywhere Node 22 runs (see `server/README.md`). To connect them, set `apiBase` in `assets/js/config.js` to the API's address and add the storefront's address to `CORS_ORIGINS` on the server.
