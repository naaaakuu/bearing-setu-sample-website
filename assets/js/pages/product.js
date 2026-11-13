/* Product page: facts first, then how to buy. Shows only data the business has entered. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, icon = BS.icon, doc = document;
  var id = BS.params().get("id");
  var host = $("[data-product]");
  var view = "photo";

  /* --------------------------------------------- dimension drawing from real sizes */
  function drawing(p) {
    var ok = p.cat === "ball-bearings" || p.cat === "roller-bearings" || p.sub === "oil-seals";
    if (!ok || p.d == null || p.D == null || !(p.D > p.d)) return "";
    var R = 84, cx = 104, cy = 126, r = R * p.d / p.D, B = p.B;
    var w = B ? Math.max(18, Math.min(120, B * (R * 2 / p.D))) : 0, x0 = 262;
    var lab = p.sub === "oil-seals" ? ["Shaft d", "Bore D", "Width B"] : ["d", "D", "B"];
    var t = function (x, y, s, a) { return '<text x="' + x + '" y="' + y + '" text-anchor="' + (a || "middle") + '" class="dt">' + s + "</text>"; };
    var arrowH = function (xa, xb, y) { return '<line x1="' + xa + '" y1="' + y + '" x2="' + xb + '" y2="' + y + '" class="dl"/><path d="M' + xa + " " + y + "l7 -3.5v7z M" + xb + " " + y + 'l-7 -3.5v7z" class="da"/>'; };
    var s = '<svg class="draw" viewBox="0 0 400 252" role="img" aria-label="Outline drawing with dimensions ' + esc(BS.dims(p)) + '"><title>Outline drawing, ' + esc(BS.dims(p)) + "</title>" +
      '<style>.dl{stroke:#16255c;stroke-width:1.2}.da{fill:#16255c}.dt{font:600 12px Geist,Arial,sans-serif;fill:#16202f}.ol{stroke:#16255c;stroke-width:2;fill:#fff}.fl{fill:#e9edf3}</style>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" class="ol fl"/><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" class="ol"/>' +
      arrowH(cx - r, cx + r, cy) + t(cx, cy - 8, lab[0] + " " + p.d) +
      arrowH(cx - R, cx + R, cy + R + 22) + t(cx, cy + R + 40, lab[1] + " " + p.D) +
      (B ? '<rect x="' + x0 + '" y="' + (cy - R) + '" width="' + w + '" height="' + 2 * R + '" class="ol fl"/><line x1="' + x0 + '" y1="' + (cy - r) + '" x2="' + (x0 + w) + '" y2="' + (cy - r) + '" stroke="#16255c" stroke-dasharray="4 3"/><line x1="' + x0 + '" y1="' + (cy + r) + '" x2="' + (x0 + w) + '" y2="' + (cy + r) + '" stroke="#16255c" stroke-dasharray="4 3"/>' + arrowH(x0, x0 + w, cy - R - 16) + t(x0 + w / 2, cy - R - 24, lab[2] + " " + B) : "") +
      '<text x="200" y="246" text-anchor="middle" class="dt" style="font-weight:500;fill:#5a6678">All dimensions in mm</text></svg>';
    return s;
  }

  /* ------------------------------------------------------------------ pieces */
  function dimRows(p) {
    var seal = p.sub === "oil-seals", rows = [];
    if (p.d != null) rows.push([seal ? "Shaft diameter (d)" : p.cat === "housed-units" || p.cat === "linear-motion" ? "Shaft or bore (d)" : "Bore (d)", p.d + " mm"]);
    if (p.D != null) rows.push([seal ? "Housing bore (D)" : "Outside diameter (D)", p.D + " mm"]);
    if (p.B != null) rows.push([seal ? "Width (B)" : p.sub === "tapered" ? "Total width (T)" : "Width (B)", p.B + " mm"]);
    return rows;
  }
  function table(rows) { return '<table class="specs"><tbody>' + rows.map(function (r) { return "<tr><th scope=\"row\">" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table>"; }
  function group(title, rows) { return rows.length ? '<div class="specs-group"><h3>' + esc(title) + "</h3>" + table(rows) + "</div>" : ""; }

  function ident(p) {
    var cat = BS.cat(p.cat), sub = BS.sub(p.cat, p.sub);
    var r = [["Brand", BS.brand(p.brand).name], ["Part number", p.pn]];
    if (p.family && p.family !== p.pn) r.push(["Series", p.family]);
    r.push(["Category", (cat ? cat.name : "") + (sub ? ", " + sub.name : "")]);
    if (p.hsn) r.push(["HSN code", p.hsn]);
    r.push(["GST rate", (p.gst != null ? p.gst : BS.gstRate()) + "%"]);
    if (p.pack) r.push(["Pack", p.pack]);
    return r;
  }

  function buyHTML(p) {
    var min = BS.moq(p), c = BS.com(p), priced = BS.hasPrice(p), av = BS.availability(p), acct = BS.account && BS.account();
    var h = '<div class="buybox" data-buybox>';
    if (priced) {
      h += '<div class="buybox__price" data-price>' + BS.priceHTML(p, min) + "</div>" + (BS.gstToggleHTML() ? "<div>" + BS.gstToggleHTML() + "</div>" : "");
      if (c && c.tiers && c.tiers.length) {
        var inc = BS.gstInc();
        h += '<div class="tiers" aria-label="Quantity prices">' + [[1, BS.unitPrice(p, 1)]].concat(c.tiers.map(function (t) { return [t[0], BS.unitPrice(p, t[0])]; })).map(function (t, i, a) { return "<div><span>" + t[0] + (i < a.length - 1 ? "–" + (a[i + 1][0] - 1) : "+") + " " + esc(p.unit || "pc") + '</span><strong class="num">' + BS.inr(inc ? BS.withGst(t[1]) : t[1]) + "</strong></div>"; }).join("") + "</div>";
      }
      if (acct && acct.status === "verified" && acct.discountPct > 0) h += '<p class="small muted">Your account price is shown.</p>';
    } else {
      h += '<div class="buybox__quote">' + icon("clipboard-text") + "<div><strong>Price on quotation</strong><span class=\"small muted\">We confirm price, availability and freight in your quotation.</span></div></div>";
    }
    if (av) h += '<div><span class="' + av.cls + '">' + esc(av.text) + "</span></div>";
    h += '<div class="buybox__row" data-add-wrap><label class="sr-only" for="pdp-qty">Quantity</label>' + qtyStepper(min) + '<button class="btn" type="button" data-pdp-add>Add to quote list</button></div>';
    h += '<div class="buybox__row"><button class="btn btn--ghost" type="button" data-pdp-rfq>Request quotation for this part</button></div>';
    if (BS.cfg.shipping.note) h += '<p class="pdp__ship">' + icon("truck") + "<span>" + esc(BS.cfg.shipping.note) + (BS.cfg.shipping.leadTimeNote ? " " + esc(BS.cfg.shipping.leadTimeNote) : "") + "</span></p>";
    if (c && c.moq > 1) h += '<p class="small muted">Minimum order quantity: ' + c.moq + " " + esc(p.unit || "pc") + ".</p>";
    if (BS.creditApproved()) {
      var cr = acct.credit;
      h += '<div class="credit-box"><strong>Credit is enabled on your account.</strong> ' + (cr.available != null ? "Available " + BS.inr(cr.available) + (cr.termsDays ? " on " + cr.termsDays + "-day terms" : "") + ". " : "") + "Choose it when you place an order.</div>";
    }
    var q = "Enquiry about " + BS.name(p) + " (" + p.title + ")", links = [];
    if (BS.waLink(q)) links.push('<a href="' + esc(BS.waLink(q)) + '" rel="noopener">' + icon("whatsapp-logo") + " Ask on WhatsApp</a>");
    if (BS.mailto(q, "")) links.push('<a href="' + esc(BS.mailto(q, "")) + '">' + icon("envelope-simple") + " Email us</a>");
    if (BS.contact().phoneHref) links.push('<a href="' + esc(BS.contact().phoneHref) + '">' + icon("phone") + " " + esc(BS.contact().phone) + "</a>");
    if (links.length) h += '<div class="buybox__links">' + links.join("") + "</div>";
    return h + "</div>";
  }
  function qtyStepper(min) {
    return '<div class="stepper" data-pdp-stepper><button type="button" data-pdp-step="-1" aria-label="Decrease quantity">' + icon("minus") + '</button><input id="pdp-qty" type="number" inputmode="numeric" min="' + min + '" max="999999" value="' + min + '" aria-label="Quantity"><button type="button" data-pdp-step="1" aria-label="Increase quantity">' + icon("plus") + "</button></div>";
  }

  function setMeta(p) {
    var b = BS.brand(p.brand).name, name = b + " " + p.pn;
    document.title = name + " " + p.title.toLowerCase() + " · Bearingsetu";
    var d = (p.desc || p.title) + " Request a quotation from Bearingsetu.";
    function meta(sel, attr, val) { var m = $(sel); if (m) m.setAttribute(attr, val); }
    meta('meta[name="description"]', "content", d.slice(0, 300));
    meta('meta[property="og:title"]', "content", name + " · Bearingsetu");
    var base = location.origin && location.origin !== "null" ? "https://naaaakuu.github.io/bearing-setu-sample-website/" : "";
    meta('link[rel="canonical"]', "href", base + "product.html?id=" + encodeURIComponent(p.id));
    var ld = { "@context": "https://schema.org", "@type": "Product", name: name + " " + p.title, sku: p.id, mpn: p.pn, brand: { "@type": "Brand", name: b }, description: p.desc || p.title, image: base + BS.img(p.img).src, category: (BS.cat(p.cat) || {}).name };
    if (BS.hasPrice(p)) ld.offers = { "@type": "Offer", priceCurrency: "INR", price: String(BS.unitPrice(p, 1)), url: base + "product.html?id=" + encodeURIComponent(p.id) };
    var s = $("#ld-product") || doc.createElement("script"); s.type = "application/ld+json"; s.id = "ld-product"; s.textContent = JSON.stringify(ld); doc.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ render */
  function render() {
    var p = BS.byId(id);
    if (!p) {
      host.innerHTML = '<div class="notfound"><h1 class="h1">We could not find that part</h1><p class="lede" style="margin:10px 0 18px">The link may be old, or the part was removed from the catalogue. Search by part number or size, or ask us to source it.</p><p><a class="btn" href="shop.html">Browse all parts</a> <a class="btn btn--quiet" href="checkout.html' + (id ? "?custom=" + encodeURIComponent(id) : "") + '">Ask us to source it</a></p></div>';
      $("[data-crumbs]").innerHTML = "";
      document.title = "Part not found · Bearingsetu";
      return;
    }
    BS.rememberViewed && BS.rememberViewed(p.id);
    var cat = BS.cat(p.cat), sub = BS.sub(p.cat, p.sub), b = BS.brand(p.brand), dr = drawing(p);
    $("[data-crumbs]").innerHTML = "<ol><li><a href=\"index.html\">Home</a></li><li><a href=\"shop.html\">Products</a></li><li><a href=\"shop.html?cat=" + esc(p.cat) + '">' + esc(cat ? cat.name : "") + "</a></li>" + (sub ? '<li><a href="shop.html?cat=' + esc(p.cat) + "&amp;sub=" + esc(p.sub) + '">' + esc(sub.name) + "</a></li>" : "") + '<li aria-current="page">' + esc(p.pn) + "</li></ol>";
    var chips = BS.chips(p).map(function (c) { return '<span class="chip' + (c === BS.dims(p) ? " is-size" : "") + '">' + esc(c) + "</span>"; }).join("");
    var rows = dimRows(p), spec = (p.attrs || []).filter(function (a) { return !/^Shaft x bore x width$/i.test(a[0]); });
    var perf = BS.cfg.catalogue.showIndicativePerformance && p.perf && p.perf.length ? '<div class="specs-group"><h3>Indicative performance</h3>' + table(p.perf) + '<p class="hint" style="margin-top:8px">Indicative values. Check the manufacturer’s datasheet before critical use.</p></div>' : "";
    var eq = (p.eq || []).length ? '<section class="pdp-block" style="margin-top:0"><h2>Equivalent designations</h2><div class="eqlist">' + p.eq.map(function (e) { return '<a href="shop.html?q=' + encodeURIComponent(e) + '">' + esc(e) + "</a>"; }).join("") + '</div><p class="hint" style="margin-top:10px">Nearest standard equivalents by designation. Confirm suitability for your application before substituting.</p></section>' : "";
    var siblings = BS.products.filter(function (x) { return x.family && x.family === p.family && x.id !== p.id && x.cat === p.cat; });
    var rel = (p.rel || []).map(BS.byId).filter(Boolean);
    host.innerHTML =
      '<article class="pdp"><div class="pdp__media"><div class="pdp__stage" data-stage></div>' +
      (dr ? '<div class="pdp__thumbs" role="group" aria-label="Image or drawing"><button type="button" data-view="photo" aria-pressed="true">Photo</button><button type="button" data-view="drawing" aria-pressed="false">Dimensions</button></div>' : "") +
      '<p class="pdp__cap" data-cap></p></div>' +
      '<div><p class="pdp__brand">' + esc(b.name) + "</p><h1>" + esc(p.pn) + '</h1><p class="pdp__title">' + esc(p.title) + '</p><div class="pdp__chips">' + chips + "</div>" + buyHTML(p) + "</div></article>" +
      '<div class="pdp-sections"><div><h2>Specification</h2>' + group("Dimensions", rows) + group("Construction and type", spec) + perf + group("Identification", ident(p)) + "</div>" +
      "<div>" + (p.desc ? '<section style="margin-bottom:30px"><h2>About this part</h2><p>' + esc(p.desc) + "</p></section>" : "") + eq + "</div></div>" +
      (siblings.length ? '<section class="pdp-block"><h2>Other options in the ' + esc(p.family) + " series</h2><div class=\"pgrid\">" + siblings.slice(0, 8).map(function (x) { return BS.card(x); }).join("") + "</div></section>" : "") +
      (rel.length ? '<section class="pdp-block"><h2>Related parts</h2><div class="pgrid">' + rel.slice(0, 4).map(function (x) { return BS.card(x); }).join("") + "</div></section>" : "");
    paintStage(p, dr);
    setMeta(p);
  }
  function paintStage(p, dr) {
    var st = $("[data-stage]"), cap = $("[data-cap]");
    if (!st) return;
    if (view !== "drawing") st.setAttribute("data-photo", ""); else st.removeAttribute("data-photo");
    if (view === "drawing" && dr) { st.innerHTML = dr; cap.textContent = "Outline drawing from the catalogue dimensions. Not to scale for the cross-section."; }
    else { st.innerHTML = BS.imgTag(p.img, { alt: BS.name(p) + " " + p.title, eager: true, sizes: "(max-width: 980px) 90vw, 520px" }); cap.textContent = "Representative image of this type of part. Brand markings and packaging of the part supplied may differ."; }
    $$("[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === view); });
  }

  doc.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement; if (!t || !t.closest) return;
    var v = t.closest("[data-view]"); if (v) { view = v.getAttribute("data-view"); var p = BS.byId(id); paintStage(p, drawing(p)); return; }
    var st = t.closest("[data-pdp-step]");
    if (st) { var i = $("#pdp-qty"), min = BS.moq(BS.byId(id)); i.value = Math.max(min, (parseInt(i.value, 10) || min) + parseInt(st.getAttribute("data-pdp-step"), 10)); return; }
    if (t.closest("[data-pdp-add]")) { BS.addToList(id, $("#pdp-qty").value); return; }
    if (t.closest("[data-pdp-rfq]")) { BS.list.add(id, $("#pdp-qty").value); location.href = "checkout.html"; }
  });
  BS.on("overlay", render); BS.on("prefs", render); BS.on("session", render);
  render();
})();
