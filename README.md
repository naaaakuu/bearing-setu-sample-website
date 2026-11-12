# Bearingsetu · Online store (Precision design)

A complete sample e-commerce website for Bearingsetu: bearings, belts and pulleys, seals, lubrication, power transmission, linear motion and mounting tools for Indian industry. Apple-style "Precision" design: calm white space, real photography, one blue action colour.

**Live site:** https://naaaakuu.github.io/bearing-setu-sample-website/

> Sample store. Products, prices, stock, reviews, orders and account data are sample content. No payment is taken and no order is placed. Cart, orders, saved lists and quotes are stored in the visitor's browser (localStorage) only.

## Pages

| Page | What it does |
|------|--------------|
| `index.html` | Home: hero, category strip, live size finder with a drawn section view, bestsellers, category tiles, live quick-order demo, industries, brands |
| `shop.html` | Catalogue with search, filters (type, brand, bore/OD/width, seal, clearance, stock, price), sort, grid/list and compare |
| `product.html?id=…` | Product page: gallery with technical drawing, tier prices, variant picker (brand, seal, clearance), delivery estimate by pincode, equivalents, bought-together, reviews |
| `cart.html` | Bag with tier pricing, save for later, coupon, free-dispatch meter, printable quotation |
| `checkout.html` | Contact, delivery and payment steps, GSTIN check, CGST/SGST vs IGST, confirmation and printable invoice |
| `quick-order.html` | Paste a parts list, upload a BOM (CSV or Excel), or request a quote |
| `business.html` | Business account: tier pricing, 30-day credit, application form |
| `account.html` | Sample business dashboard: orders and reorder, invoices, saved lists, quotes, team |
| `support.html` | Order tracking, returns, FAQs, genuine-parts guide, call-back request |
| `tools.html` | Part number decoder, interchange finder, belt length and grease calculators, inch/mm converter |
| `about.html`, `policies.html`, `sitemap.html`, `404.html` | Company, policies and image credits, site map, not-found page |

## How it is built

Plain HTML, CSS and JavaScript. No framework and no runtime dependencies (SheetJS loads from cdnjs only when someone uploads an Excel file).

```
assets/css/site.css        Design system: tokens, components, header, footer
assets/css/<page>.css      Page styles
assets/js/catalog.js       Product catalogue (categories, brands, products, reviews)
assets/js/images.js        Photo manifest with credits
assets/js/site.js          Shared logic: search, cart, saved list, mega menu, drawer, toasts
assets/js/pages/<page>.js  Page logic
assets/img/p, assets/img/s Product and scene photos (WebP)
assets/fonts               Geist and Geist Mono (SIL Open Font License)
assets/icons.svg           Phosphor icons (MIT)
partials/                  Shared head, header and footer
tools/build.mjs            Copies the partials into every page
```

The header, footer and `<head>` basics live in `partials/`. After editing a partial, run:

```bash
node tools/build.mjs
```

It fills the `<!-- @header -->` style markers in every page. Pages stay plain HTML that GitHub Pages serves as they are.

To preview locally:

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173.

## Editing products

Products live in `assets/js/catalog.js`. Each product has a part number, brand, category, dimensions, price (ex-GST), tier prices, stock, dispatch days and an image key from `assets/js/images.js`. The shop, search, product pages, quick order and tools all read from this one file.

## Before going live

- Replace sample prices, stock and reviews with real data.
- Add real contact details (phone, WhatsApp) to the support page and footer.
- Connect checkout to a payment gateway and order system.
- Photos are openly licensed (see `policies.html#credits`); swap in your own product photography when ready.

## Deploying

GitHub Pages deploys from the `main` branch. Every push to `main` redeploys the site.
