/* Bag page, plus the bag maths shared with checkout.
   cart.html and checkout.html both load this file. The first half defines
   BS.bag (coupon, totals with dispatch and GST split, dispatch dates,
   print-ready documents); the second half runs only on cart.html. */
(function () {
  "use strict";
  var BS = window.BS;
  if (!BS) return; // site.js did not load: leave the static page as it is
  var $ = BS.$, $$ = BS.$$, esc = BS.esc, inr = BS.inr, icon = BS.icon;
  var doc = document;
  var bag = (BS.bag = {});

  function r2(n) { return Math.round(n * 100) / 100; }
  function pad(n, l) { n = String(n); while (n.length < (l || 2)) n = "0" + n; return n; }
  function rand4() { return pad(Math.floor(1000 + Math.random() * 9000), 4); }
  // Always an array, whatever is in storage.
  function arr(key) { var v = BS.store.get(key, []); return Array.isArray(v) ? v : []; }
  bag.arr = arr;
  bag.r2 = r2;
  // With site storage blocked, the bag lives only until the page changes. The bag and checkout
  // empty states say so, since that is where a buyer lands after the bag was lost.
  bag.storageNote = function () {
    return '<p class="notice notice--warm bag-storage" role="status">' + icon("warning-circle") + "<span>Your browser is blocking storage for this site, so the bag empties each time you change page. Allow site data for this site in your browser settings to keep your bag.</span></p>";
  };

  /* Heal storage written by older versions or edited by hand, before the shared
     cart code reads it: non-arrays, nulls, unknown ids, string or negative
     quantities and duplicate lines would otherwise throw or miscount. */
  (function heal() {
    function fix(key, clean) {
      var raw = BS.store.get(key, undefined);
      if (raw === undefined || raw === null) return;
      var out = clean(Array.isArray(raw) ? raw : []);
      if (!Array.isArray(raw) || JSON.stringify(out) !== JSON.stringify(raw)) BS.store.set(key, out);
    }
    function lines(list, dflt) {
      var seen = {}, out = [];
      list.forEach(function (l) {
        if (!l || typeof l !== "object" || !BS.byId(l.id) || seen[l.id]) return;
        var q = Math.min(99999, parseInt(l.qty, 10) || dflt || 0);
        if (q <= 0) return;
        seen[l.id] = 1;
        var c = { id: l.id, qty: q };
        if (l.at) c.at = l.at;
        out.push(c);
      });
      return out;
    }
    function ids(list) { return list.filter(function (id) { return typeof id === "string" && BS.byId(id); }); }
    function objs(list) { return list.filter(function (o) { return o && typeof o === "object"; }); }
    fix("cart", lines);
    fix("saved", function (l) { return lines(l, 1); });
    fix("wish", ids);
    fix("recent", ids);
    fix("recentQ", function (l) { return l.filter(function (q) { return typeof q === "string"; }); });
    fix("orders", objs);
    fix("couponsUsed", objs);
    fix("quotations", objs);
    var pr = BS.store.get("prefs", undefined);
    if (pr !== undefined && (!pr || typeof pr !== "object" || Array.isArray(pr))) BS.store.set("prefs", { gst: "ex" });
    var cp = BS.store.get("coupon", undefined);
    if (cp !== undefined && cp !== null && typeof cp !== "object" && typeof cp !== "string") BS.store.set("coupon", null);
  })();
  bag.yymm = function (d) { return pad(d.getFullYear() % 100) + pad(d.getMonth() + 1); };
  bag.rand4 = rand4;

  /* ------------------------------------------------------------ coupons */
  var COUPONS = { SETU5: { code: "SETU5", pct: 5, cap: 500, label: "5% off, up to ₹500" } };
  bag.coupon = function () {
    var c = BS.store.get("coupon", null);
    var code = c && (c.code || c);
    return (code && COUPONS[String(code).toUpperCase()]) || null;
  };
  bag.applyCoupon = function (raw) {
    var code = String(raw || "").replace(/\s+/g, "").toUpperCase();
    if (!code) return { error: "Enter a coupon code." };
    var c = COUPONS[code];
    if (!c) return { error: "We don’t recognise “" + String(raw).trim().slice(0, 24) + "”. Check the spelling and try again." };
    var cur = bag.coupon();
    if (cur && cur.code === code) return { error: code + " is already applied to this bag." };
    var used = arr("couponsUsed").filter(function (u) { return u && u.code === code; })[0];
    if (used) return { error: code + " was used on order " + used.order + ". It works once per account." };
    BS.store.set("coupon", { code: code });
    BS.emit("coupon", { code: code });
    return { ok: true, coupon: c };
  };
  bag.removeCoupon = function () {
    BS.store.set("coupon", null);
    BS.emit("coupon", { code: null });
  };

  /* ------------------------------------------------------------- totals */
  var SHIP = {
    standard: { label: "Standard delivery", fee: function (sub) { return sub >= BS.FREE_SHIP ? 0 : BS.SHIP_FEE; } },
    express: { label: "Express delivery", fee: function () { return 350; } },
    pickup: { label: "Pick up in Pune", fee: function () { return 0; } }
  };
  bag.SHIP = SHIP;
  // opts.delivery: standard | express | pickup. opts.state: delivery state name, or "" if not chosen yet.
  bag.totals = function (opts) {
    opts = opts || {};
    var t = BS.cart.totals();
    var has = t.lines.length > 0;
    var c = has ? bag.coupon() : null;
    var discount = c ? r2(Math.min(c.cap, t.sub * c.pct / 100)) : 0;
    var method = SHIP[opts.delivery] ? opts.delivery : "standard";
    var ship = has ? SHIP[method].fee(t.sub) : 0;
    var taxable = r2(t.sub - discount + ship);
    var gst = r2(taxable * BS.GST);
    var intra = opts.state ? opts.state === "Maharashtra" : null;
    var cgst = intra ? r2(gst / 2) : 0;
    return {
      lines: t.lines, count: t.count, sub: t.sub, list: r2(t.sub + t.savings), savings: t.savings, gap: t.gap,
      coupon: c, discount: discount, method: method, ship: ship, taxable: taxable, gst: gst,
      intra: intra, cgst: cgst, sgst: intra ? r2(gst - cgst) : 0, igst: intra === false ? gst : 0,
      total: r2(taxable + gst)
    };
  };

  /* -------------------------------------------------------------- dates */
  var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAYL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function startOf(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function sameDay(a, b) { return startOf(a).getTime() === startOf(b).getTime(); }
  // Working-day maths and the dispatch schedule live in site.js (BS.addWorking, BS.schedule).
  bag.addWorking = BS.addWorking;
  bag.day = function (d) { return DAY[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()]; };
  bag.dayLong = function (d) { return DAYL[d.getDay()] + ", " + d.getDate() + " " + MON[d.getMonth()]; };
  bag.date = function (d) { return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear(); };
  bag.time = function (d) {
    var h = d.getHours(), m = d.getMinutes();
    return (h % 12 || 12) + (m ? ":" + pad(m) : "") + " " + (h < 12 ? "am" : "pm");
  };
  // "today", "tomorrow" or the weekday and date, relative to now.
  bag.when = function (d, now) {
    now = now || new Date();
    if (sameDay(d, now)) return "today";
    var t = new Date(now); t.setDate(t.getDate() + 1);
    if (sameDay(d, t)) return "tomorrow, " + bag.day(d);
    return bag.dayLong(d);
  };
  // Dispatch and delivery dates for a set of cart lines: bag.schedule(lines, now, pincode).
  bag.schedule = BS.schedule;
  // One line about when the order leaves the warehouse.
  bag.promise = function (s) {
    if (s.lead) {
      return "Ships complete on " + bag.dayLong(s.dispatch) + ", once every part is ready.";
    }
    if (s.beforeCutoff) {
      var mins = Math.max(1, Math.round((s.cutoff - s.now) / 60000));
      // A countdown only helps when the cutoff is close; earlier in the day, name the time.
      if (mins > 180) return "Order by 4 pm and it leaves our Pune warehouse today.";
      var left = mins >= 60 ? Math.floor(mins / 60) + " h " + (mins % 60 ? (mins % 60) + " min" : "") : mins + " min";
      return "Order in the next " + left.trim() + " and it leaves our Pune warehouse today.";
    }
    return "Order now and it leaves our Pune warehouse " + bag.when(s.dispatch, s.now) + ". Orders placed by 4 pm go the same day.";
  };

  /* ------------------------------------------------------- amount in words */
  bag.inWords = BS.inWords; // shared with account.html, in site.js

  /* ------------------------------------------------------------ documents */
  bag.SELLER = BS.SELLER; // one seller identity for every document, in site.js
  var LOGO = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="#16255c" stroke-width="10" stroke-dasharray="9 8.28"/><circle cx="50" cy="50" r="38" fill="#16255c"/><circle cx="50" cy="50" r="29" fill="#fff"/><g fill="#16255c"><circle cx="71" cy="50" r="5"/><circle cx="64.85" cy="64.85" r="5"/><circle cx="50" cy="71" r="5"/><circle cx="35.15" cy="64.85" r="5"/><circle cx="29" cy="50" r="5"/><circle cx="35.15" cy="35.15" r="5"/><circle cx="50" cy="29" r="5"/><circle cx="64.85" cy="35.15" r="5"/></g><circle cx="50" cy="50" r="11" fill="#16255c"/><path d="M6 74 Q50 50 98 60" fill="none" stroke="#f29a0e" stroke-width="7" stroke-linecap="round"/></svg>';

  function money(n) { return inr(n, 2); }
  function docRow(label, value, cls) { return '<div class="' + (cls || "") + '"><dt>' + label + "</dt><dd>" + value + "</dd></div>"; }

  /* The one template for every quotation and tax invoice. account.js fills it for invoices
     (BSA.invoiceHTML), so checkout and the account always print the same document.
     data: { kind: "quote"|"invoice", no, date, meta: [[label, value]], parties: [{h, html}],
             lines: [{name, desc, hsn, qty, unit, rate, amount, batch?}], totals, terms: [], note }
     totals may carry roundOff (whole-rupee invoices) and coupon.code. */
  bag.docHTML = function (d) {
    var t = d.totals;
    var batched = d.lines.some(function (l) { return l.batch; });
    var rows = d.lines.map(function (l, i) {
      return "<tr><td>" + (i + 1) + '</td><td><strong>' + esc(l.name) + "</strong><span>" + esc(l.desc) + "</span>" + (l.batch ? '<span class="doc__batch">Batch ' + esc(l.batch) + "</span>" : "") + '</td><td class="mono">' + esc(l.hsn) + '</td><td class="r">' + l.qty + " " + esc(l.unit) + '</td><td class="r">' + money(l.rate) + '</td><td class="r">' + money(l.amount) + "</td></tr>";
    }).join("");
    if (t.ship) rows += '<tr><td></td><td><strong>Dispatch charges</strong><span>' + esc(t.shipLabel || "Standard delivery") + '</span></td><td class="mono">9965</td><td class="r">1</td><td class="r">' + money(t.ship) + '</td><td class="r">' + money(t.ship) + "</td></tr>";
    var tax = t.intra ? docRow("CGST 9%", money(t.cgst)) + docRow("SGST 9%", money(t.sgst)) :
      t.intra === false ? docRow("IGST 18%", money(t.igst)) : docRow("GST 18%", money(t.gst));
    var round = t.roundOff ? Math.round(t.roundOff * 100) / 100 : 0;
    var tot =
      docRow("Total of items", money(t.sub)) +
      (t.discount ? docRow(t.coupon && t.coupon.code ? "Less coupon " + esc(t.coupon.code) : "Less discount", "−" + money(t.discount)) : "") +
      (t.ship ? docRow("Dispatch charges", money(t.ship)) : docRow("Dispatch charges", "Free")) +
      docRow("Taxable value", money(t.taxable), "doc__strong") + tax +
      (round ? docRow("Round off", (round < 0 ? "−" : "") + money(Math.abs(round))) : "") +
      docRow(d.kind === "invoice" ? "Invoice total" : "Total including GST", money(t.total), "doc__grand");
    return '<article class="doc">' +
      '<header class="doc__head"><div class="doc__brand">' + LOGO + "<span>Bearing<b>setu</b></span></div>" +
        '<div class="doc__title"><h2>' + (d.kind === "invoice" ? "Tax invoice" : "Quotation") + '</h2><p class="mono">' + esc(d.no) + "</p>" + (d.kind === "invoice" ? "<small>Original for recipient</small>" : "") + "</div></header>" +
      '<div class="doc__parties">' +
        '<section><h3>From</h3><p><strong>' + esc(bag.SELLER.name) + "</strong><br>" + bag.SELLER.lines.map(esc).join("<br>") + "<br>GSTIN " + esc(bag.SELLER.gstin) + "<br>State code " + esc(bag.SELLER.code) + "<br>" + esc(bag.SELLER.email) + "</p></section>" +
        d.parties.map(function (p) { return "<section><h3>" + p.h + "</h3><p>" + p.html + "</p></section>"; }).join("") +
      "</div>" +
      '<dl class="doc__meta">' + d.meta.map(function (m) { return docRow(m[0], m[1]); }).join("") + "</dl>" +
      '<table class="doc__table"><thead><tr><th>#</th><th>' + (batched ? "Item and batch" : "Item") + '</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<div class="doc__sum"><p class="doc__words"><span>Amount in words</span>' + bag.inWords(t.total) + '</p><dl class="doc__totals">' + tot + "</dl></div>" +
      '<section class="doc__terms"><h3>' + (d.kind === "invoice" ? "Notes" : "Terms") + "</h3><ol>" + d.terms.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol></section>" +
      '<footer class="doc__foot">' + (d.note || "") + "</footer>" +
    "</article>";
  };
  // Lines from the bag ({p, qty, unit, total}), a stored order or account.js ({..., amount}).
  bag.docLines = function (lines) {
    return lines.map(function (l) {
      var p = l.p || BS.byId(l.id) || {};
      var dims = p.id ? BS.dims(p) : "";
      var title = p.title || l.title || "";
      return {
        name: (l.brand || BS.brand(p.brand).name) + " " + (l.pn || p.pn),
        desc: title + (dims && !/\d\s*(x\s*\d|mm\b)/i.test(title) ? ", " + dims : ""),
        hsn: p.hsn || l.hsn || "8482", qty: l.qty, unit: BS.unitLabel(p), rate: l.unit, amount: l.total != null ? l.total : l.amount
      };
    });
  };

  /* Preview dialog with a print button. Only the document prints. */
  var dlg, lastTrigger, savedTitle;
  function printRoot() {
    var root = $("[data-print-root]");
    if (!root) {
      root = doc.createElement("div");
      root.className = "print-root";
      root.setAttribute("data-print-root", "");
      root.setAttribute("aria-hidden", "true");
      doc.body.appendChild(root);
    }
    return root;
  }
  function fitPaper() {
    if (!dlg || !dlg.open) return;
    var body = $(".docdlg__body", dlg), paper = $(".doc", dlg);
    if (!paper) return;
    var avail = body.clientWidth - 32;
    paper.style.zoom = avail < 794 ? String(Math.max(0.38, avail / 794)) : "";
  }
  bag.openDoc = function (o) {
    if (!dlg) {
      dlg = doc.createElement("dialog");
      dlg.className = "docdlg";
      dlg.setAttribute("aria-labelledby", "docdlg-title");
      dlg.innerHTML = '<div class="docdlg__bar"><div class="docdlg__name"><p class="docdlg__k" data-doc-kicker></p><h2 class="docdlg__t" id="docdlg-title" data-doc-title></h2></div>' +
        '<button class="btn btn--sm" type="button" data-doc-print>' + icon("printer") + '<span class="docdlg__long">Save as PDF or print</span><span class="docdlg__short">Save PDF</span></button>' +
        '<button class="icon-btn" type="button" data-doc-close aria-label="Close preview">' + icon("x") + "</button></div>" +
        '<div class="docdlg__body" data-doc-body></div>';
      doc.body.appendChild(dlg);
      dlg.addEventListener("click", function (e) {
        if (e.target === dlg || e.target.closest("[data-doc-close]")) dlg.close();
        else if (e.target.closest("[data-doc-print]")) window.print();
      });
      // Keep Tab and Shift+Tab inside the preview while it is open.
      dlg.addEventListener("keydown", function (e) { BS.trap(dlg, e); });
      dlg.addEventListener("close", function () {
        doc.documentElement.classList.remove("is-printing");
        doc.body.classList.remove("is-locked");
        printRoot().innerHTML = "";
        if (savedTitle) doc.title = savedTitle;
        if (lastTrigger && doc.contains(lastTrigger)) lastTrigger.focus();
      });
      window.addEventListener("resize", BS.debounce(fitPaper, 100));
    }
    lastTrigger = o.trigger || doc.activeElement;
    $("[data-doc-kicker]", dlg).textContent = o.kicker;
    $("[data-doc-title]", dlg).textContent = o.title;
    $("[data-doc-body]", dlg).innerHTML = o.html;
    printRoot().innerHTML = o.html;
    doc.documentElement.classList.add("is-printing");
    savedTitle = doc.title;
    doc.title = (o.file || o.title) + " · Bearingsetu";
    doc.body.classList.add("is-locked");
    dlg.showModal();
    $("[data-doc-body]", dlg).scrollTop = 0;
    fitPaper();
    $("[data-doc-print]", dlg).focus();
  };

  /* =================================================================== */
  /*                              Cart page                               */
  /* =================================================================== */
  var page = $("[data-bag-page]");
  if (!page) return;

  var els = {
    title: $("[data-bag-title]"), sub: $("[data-bag-sub]"), cta: $("[data-bag-cta]"), promise: $("[data-bag-promise]"),
    grid: $("[data-bag]"), lines: $("[data-lines]"), linesTitle: $("[data-lines-title]"),
    rows: $("[data-sum-rows]"), coupon: $("[data-coupon]"), rfq: $("[data-rfq]"),
    empty: $("[data-empty]"), savedSec: $("[data-saved-sec]"), saved: $("[data-saved]"), savedCount: $("[data-saved-count]"),
    alsoSec: $("[data-also-sec]"), also: $("[data-also]"), alsoTitle: $("[data-also-title]"), live: $("[data-bag-live]")
  };
  var renderedIds = null, shelfKey = null, shelfTimer = null;
  var notes = {};            // one-off messages per line, e.g. minimum order corrections
  var coupon = { value: "", error: "" };
  var lastTotal = null;

  function nameOf(p) { return BS.brand(p.brand).name + " " + p.pn; }
  function inc() { return BS.prefs().gst === "inc"; }
  function show(n) { return inc() ? BS.withGst(n) : n; }
  function taxNote() { return inc() ? "incl. GST" : "+ GST"; }
  function units(u) { return u === "pc" ? "pcs" : u === "box" ? "boxes" : u + "s"; }
  function rawCart() { return arr("cart").filter(function (l) { return l && BS.byId(l.id) && l.qty > 0; }); }
  function savedList() { return arr("saved").filter(function (s) { return s && BS.byId(s.id); }); }

  /* ---------- line rows ---------- */
  function specLine(p) {
    var dims = BS.dims(p);
    return esc(p.title) + (dims && !/\d\s*(x\s*\d|mm\b)/i.test(p.title) ? ' · <span class="nowrap">' + esc(dims) + "</span>" : "");
  }
  function appliedTier(p, qty) {
    var hit = null;
    (p.tiers || []).forEach(function (t) { if (qty >= t[0]) hit = t; });
    return hit;
  }
  function priceHTML(l) {
    var p = l.p, unit = BS.unitLabel(p), tier = appliedTier(p, l.qty);
    var out = "<span>" + BS.priceHTML(l.unit, p) + "</span>";
    if (tier) out = "<span>" + BS.priceHTML(l.unit, p) + ' <s class="num">' + inr(show(p.price)) + '</s></span><span class="bl__tier">' + icon("tag") + "Tier price for " + tier[0] + "+ " + esc(units(unit)) + " applied</span>";
    return out;
  }
  function noteHTML(l) {
    var p = l.p, out = [];
    if (notes[l.id]) out.push('<span class="bl__warn">' + icon("info") + esc(notes[l.id]) + "</span>");
    if (p.stock > 0 && l.qty > p.stock) out.push('<span class="bl__warn">' + icon("clock") + "Only " + p.stock + " in stock. The full quantity ships in 7 working days.</span>");
    var nt = BS.nextTier(p, l.qty);
    if (nt) {
      var more = nt.qty - l.qty;
      var unitPrice = inr(show(nt.price));
      out.push('<button class="bl__nudge" type="button" data-tier="' + esc(l.id) + '" data-qty="' + nt.qty + '">Add ' + more + " more to pay " + unitPrice + " / " + esc(BS.unitLabel(p)) + "</button>");
    }
    return out.join("");
  }
  function totalHTML(l) {
    var v = show(l.total);
    return '<strong class="num">' + inr(v) + '</strong><small><span class="nowrap">' + l.qty + " × " + inr(show(l.unit)) + '</span> <span class="nowrap">' + taxNote() + "</span></small>";
  }
  function stepper(l) {
    return BS.stepperHTML(l.id, l.qty, null, Math.max(1, l.p.moq || 1), nameOf(l.p));
  }
  function lineHTML(l) {
    var p = l.p, st = BS.stock(p), name = nameOf(p), url = BS.url(p);
    return '<li class="bl" data-line="' + esc(l.id) + '">' +
      '<a class="bl__img" href="' + url + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(p.img, { alt: "", sizes: "128px" }) + "</a>" +
      '<div class="bl__info">' +
        '<h3 class="bl__t"><a href="' + url + '">' + esc(name) + "</a></h3>" +
        '<p class="bl__s">' + specLine(p) + (p.moq > 1 ? " · Minimum " + p.moq : "") + "</p>" +
        '<p class="' + st.cls + ' bl__stock">' + esc(st.text) + "</p>" +
        '<p class="bl__price" data-l-price>' + priceHTML(l) + "</p>" +
        '<p class="bl__note" data-l-note>' + noteHTML(l) + "</p>" +
      "</div>" +
      '<div class="bl__qty">' + stepper(l) + "</div>" +
      '<p class="bl__total" data-l-total>' + totalHTML(l) + "</p>" +
      '<div class="bl__acts">' +
        '<button class="bl__act" type="button" data-save="' + esc(l.id) + '" aria-label="Save ' + esc(name) + ' for later">' + icon("heart") + "Save for later</button>" +
        '<button class="bl__act" type="button" data-del="' + esc(l.id) + '" aria-label="Remove ' + esc(name) + ' from your bag">' + icon("trash") + "Remove</button>" +
      "</div>" +
    "</li>";
  }
  function renderLines(t) {
    var ids = t.lines.map(function (l) { return l.id; }).join("|");
    els.lines.removeAttribute("aria-busy");
    if (ids !== renderedIds) {
      els.lines.innerHTML = t.lines.map(lineHTML).join("");
      renderedIds = ids;
    } else {
      t.lines.forEach(function (l) {
        var row = els.lines.querySelector('[data-line="' + CSS.escape(l.id) + '"]');
        if (!row) return;
        $("[data-l-price]", row).innerHTML = priceHTML(l);
        $("[data-l-note]", row).innerHTML = noteHTML(l);
        $("[data-l-total]", row).innerHTML = totalHTML(l);
        var input = $("[data-stepper] input", row);
        if (input && String(input.value) !== String(l.qty)) input.value = l.qty;
        var minus = $('[data-step="-1"]', row);
        if (minus) minus.disabled = l.qty <= Math.max(1, l.p.moq || 1);
      });
    }
    els.linesTitle.textContent = BS.plural(t.lines.length, "part") + ", " + BS.plural(t.count, "item") + " in total";
  }

  /* ---------- summary ---------- */
  function row(label, value, cls) { return '<div class="sumrow' + (cls ? " " + cls : "") + '"><dt>' + label + '</dt><dd class="num">' + value + "</dd></div>"; }
  function renderSummary(t) {
    els.rows.innerHTML =
      '<dl class="sum__rows">' +
        row("Subtotal <small>" + BS.plural(t.count, "item") + "</small>", inr(t.sub)) +
        (t.savings > 0 ? row("Volume savings included", inr(t.savings), "is-save") : "") +
        (t.coupon ? row("Coupon " + esc(t.coupon.code), "−" + inr(t.discount), "is-save") : "") +
        row("Dispatch", t.ship ? inr(t.ship) : "Free") +
      "</dl>" +
      '<div class="sum__meter">' + BS.shipMeter(t) + "</div>" +
      '<dl class="sum__rows">' +
        row("GST 18%", inr(t.gst)) +
        row("Total", inr(t.total), "is-total") +
      "</dl>" +
      '<p class="sum__note">' + (inc() ? "Line prices include GST. The summary shows it separately, as your invoice will." : "Prices exclude GST.") + " Your invoice shows CGST and SGST for Maharashtra, or IGST for other states.</p>";
    // Product ids, not bare part numbers: several brands share a number, and the quote must keep the brand.
    els.rfq.href = "quick-order.html?lines=" + encodeURIComponent(t.lines.map(function (l) { return l.id + ":" + l.qty; }).join(",")) + "#rfq";
  }
  function renderCoupon() {
    var c = bag.coupon();
    if (c) {
      els.coupon.innerHTML = '<div class="cpn-on">' + icon("tag") + '<span><strong>' + esc(c.code) + "</strong> applied · " + esc(c.label) + '</span><button class="textlink small" type="button" data-coupon-remove aria-label="Remove coupon ' + esc(c.code) + '">Remove</button></div>';
      return;
    }
    var err = coupon.error;
    els.coupon.innerHTML = '<form class="cpn" novalidate data-coupon-form>' +
      '<label class="cpn__label" for="cpn-code">Coupon code</label>' +
      '<div class="cpn__row"><input class="input cpn__input mono" id="cpn-code" name="code" autocomplete="off" spellcheck="false" autocapitalize="characters" maxlength="24" value="' + esc(coupon.value) + '" aria-describedby="cpn-hint' + (err ? " cpn-err" : "") + '"' + (err ? ' aria-invalid="true"' : "") + '>' +
      '<button class="btn btn--dark cpn__btn" type="submit">Apply</button></div>' +
      '<p class="error" id="cpn-err" role="alert">' + esc(err) + "</p>" +
      '<p class="hint" id="cpn-hint">Sample store: try SETU5 for 5% off, up to ₹500.</p></form>';
  }

  /* ---------- saved for later ---------- */
  function renderSaved() {
    var s = savedList();
    els.savedSec.hidden = !s.length;
    if (!s.length) { els.saved.innerHTML = ""; return; }
    els.savedCount.textContent = BS.plural(s.length, "part") + " waiting. Prices update to today’s rates when you move them back.";
    els.saved.innerHTML = s.map(function (it) {
      var p = BS.byId(it.id), name = nameOf(p), st = BS.stock(p);
      var unit = BS.unitPrice(p, it.qty);
      return '<li class="sv" data-saved-id="' + esc(it.id) + '">' +
        '<a class="sv__img" href="' + BS.url(p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(p.img, { alt: "", sizes: "96px" }) + "</a>" +
        '<div class="sv__info">' +
          '<h3 class="sv__t"><a href="' + BS.url(p) + '">' + esc(name) + "</a></h3>" +
          '<p class="sv__s">' + esc(p.title) + "</p>" +
          '<p class="sv__p"><span class="num">' + it.qty + " × " + inr(show(unit)) + "</span> " + taxNote() + ' · <span class="' + st.cls + '">' + esc(st.short) + "</span></p>" +
          '<div class="sv__acts"><button class="btn btn--sm" type="button" data-move="' + esc(it.id) + '">Move to bag</button>' +
          '<button class="bl__act" type="button" data-saved-del="' + esc(it.id) + '" aria-label="Remove ' + esc(name) + ' from saved items">Remove</button></div>' +
        "</div></li>";
    }).join("");
  }

  /* ---------- shelf ---------- */
  function shelfItems(t) {
    if (t.lines.length) {
      var inBag = {}, seen = {}, out = [];
      t.lines.forEach(function (l) { inBag[l.id] = 1; });
      t.lines.forEach(function (l) {
        (l.p.rel || []).forEach(function (id) {
          if (!inBag[id] && !seen[id] && BS.byId(id)) { seen[id] = 1; out.push(BS.byId(id)); }
        });
      });
      return { title: 'You may also need. <span class="tone">Matched to your parts.</span>', items: out.slice(0, 12) };
    }
    var rec = BS.recent.all().map(BS.byId).filter(Boolean);
    if (rec.length >= 2) return { title: 'Recently viewed. <span class="tone">Pick up where you left off.</span>', items: rec.slice(0, 12) };
    var best = BS.products.filter(function (p) { return (p.tags || []).indexOf("bestseller") !== -1 && p.stock > 0; });
    return { title: 'Popular right now. <span class="tone">In stock in Pune.</span>', items: best.slice(0, 12) };
  }
  function renderShelf(t) {
    var s = shelfItems(t);
    var key = s.items.map(function (p) { return p.id; }).join("|") + (inc() ? "+" : "");
    if (key === shelfKey) return;
    shelfKey = key;
    els.alsoSec.hidden = !s.items.length;
    if (!s.items.length) return;
    els.alsoTitle.innerHTML = s.title;
    // Keep the reader's place: an item added from the shelf drops out of it, so focus moves
    // to the card that takes its slot and the shelf keeps its scroll position.
    var act = doc.activeElement, items = $$("[role=listitem]", els.also);
    var focusIdx = act && els.also.contains(act) ? items.indexOf(act.closest("[role=listitem]")) : -1;
    var left = els.also.scrollLeft;
    els.also.innerHTML = s.items.map(function (p) { return '<div role="listitem">' + BS.card(p, { sizes: "(max-width: 640px) 70vw, 300px" }) + "</div>"; }).join("");
    els.also.scrollLeft = left;
    if (focusIdx > -1) {
      var cards = $$("[role=listitem]", els.also);
      var target = cards[Math.min(focusIdx, cards.length - 1)];
      var btn = target && $("[data-add]", target);
      if (btn) btn.focus({ preventScroll: true });
    }
    BS.shelf(els.alsoSec);
    els.also.dispatchEvent(new Event("scroll"));
  }

  /* ---------- empty state ---------- */
  function renderEmpty() {
    var s = savedList().length, w = BS.wish.all().length;
    var links = [];
    if (s) links.push('<a class="more" href="#saved">' + BS.plural(s, "part") + " saved for later</a>");
    if (w) links.push('<a class="more" href="account.html#lists">Your saved list (' + w + ")</a>");
    els.empty.innerHTML = (BS.storageOK ? "" : bag.storageNote()) + '<div class="empty bag-empty__box">' + icon("handbag") +
      '<h2 class="h3">Find the part you need.</h2>' +
      "<p>Search by part number or size, or paste a whole list into Quick order. We match every line and price it at your volume.</p>" +
      '<div class="bag-empty__ctas"><a class="btn" href="shop.html">Shop parts</a><a class="btn btn--quiet" href="quick-order.html">Quick order</a></div>' +
      (links.length ? '<div class="bag-empty__links">' + links.join("") + "</div>" : "") +
    "</div>";
  }

  /* ---------- hero ---------- */
  function renderHero(t) {
    if (!t.lines.length) {
      els.title.textContent = "Your bag is empty.";
      els.sub.textContent = "Parts you add appear here, with tier prices worked out for your quantities.";
      els.promise.hidden = true;
      return;
    }
    els.title.textContent = "Your bag total is " + inr(t.total) + ".";
    els.sub.innerHTML = "Includes " + inr(t.gst) + " GST" + (t.ship ? " and " + inr(t.ship) + " dispatch. Add " + inr(Math.ceil(t.gap)) + " more for free dispatch." : ". Dispatch is free on this order.");
    var s = bag.schedule(t.lines);
    els.promise.innerHTML = icon("truck") + "<span>" + esc(bag.promise(s)) + "</span>";
    els.promise.hidden = false;
  }

  /* ---------- render ---------- */
  function render(opts) {
    opts = opts || {};
    var t = bag.totals();
    var has = t.lines.length > 0;
    page.classList.toggle("is-empty", !has);
    els.grid.hidden = !has;
    els.cta.hidden = !has;
    els.empty.hidden = has;
    renderHero(t);
    if (has) {
      renderLines(t);
      renderSummary(t);
    } else {
      renderedIds = null;
      renderEmpty();
    }
    renderSaved();
    if (opts.shelf !== false) renderShelf(t);
    $$("[data-gst]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-gst") === (inc() ? "inc" : "ex"))); });
    doc.title = has ? "Bag (" + t.count + ") · Bearingsetu" : "Your bag · Bearingsetu";
    if (lastTotal !== null && lastTotal !== t.total) els.live.textContent = has ? "Bag updated. Total " + inr(t.total) + " including GST." : "Your bag is empty.";
    lastTotal = t.total;
  }

  /* ---------- actions ---------- */
  function focusAfterRemoval(id) {
    var rowEl = els.lines.querySelector('[data-line="' + CSS.escape(id) + '"]');
    var next = rowEl && (rowEl.nextElementSibling || rowEl.previousElementSibling);
    var nextId = next && next.getAttribute("data-line");
    return function () {
      var target = nextId && els.lines.querySelector('[data-line="' + CSS.escape(nextId) + '"] .bl__t a');
      (target || els.title).focus();
    };
  }
  function restoreLine(line, idx) {
    var lines = arr("cart").filter(function (x) { return x && x.id !== line.id; });
    lines.splice(Math.min(idx, lines.length), 0, { id: line.id, qty: line.qty });
    BS.store.set("cart", lines);
    BS.emit("cart", { type: "set", id: line.id, qty: line.qty });
  }
  function removeLine(id) {
    var lines = rawCart();
    var idx = lines.map(function (l) { return l.id; }).indexOf(id);
    if (idx < 0) return;
    var gone = lines[idx], p = BS.byId(id);
    var refocus = focusAfterRemoval(id);
    BS.cart.remove(id);
    refocus();
    BS.toast("Removed <strong>" + esc(nameOf(p)) + "</strong>.", { label: "Undo", icon: "trash", ms: 6000, onAction: function () { restoreLine(gone, idx); } });
  }
  function saveForLater(id) {
    var lines = rawCart();
    var idx = lines.map(function (l) { return l.id; }).indexOf(id);
    if (idx < 0) return;
    var line = lines[idx], p = BS.byId(id);
    var s = savedList().filter(function (x) { return x.id !== id; });
    s.unshift({ id: id, qty: line.qty, at: new Date().toISOString() });
    BS.store.set("saved", s);
    var refocus = focusAfterRemoval(id);
    BS.cart.remove(id);
    refocus();
    BS.toast("Saved <strong>" + esc(nameOf(p)) + "</strong> for later.", { label: "Undo", icon: "heart", ms: 6000, onAction: function () {
      BS.store.set("saved", savedList().filter(function (x) { return x.id !== id; }));
      restoreLine(line, idx);
    } });
  }
  function moveToBag(id) {
    var s = savedList(), it = s.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    var p = BS.byId(id);
    BS.store.set("saved", s.filter(function (x) { return x.id !== id; }));
    BS.cart.set(id, BS.cart.qtyOf(id) + Math.max(it.qty, p.moq || 1));
    BS.toast("Moved <strong>" + esc(nameOf(p)) + "</strong> to your bag.", { icon: "handbag" });
    var moved = els.lines.querySelector('[data-line="' + CSS.escape(id) + '"] .bl__t a');
    (moved || els.title).focus();
  }
  function deleteSaved(id) {
    var s = savedList(), idx = s.map(function (x) { return x.id; }).indexOf(id);
    if (idx < 0) return;
    var it = s[idx], p = BS.byId(id);
    s.splice(idx, 1);
    BS.store.set("saved", s);
    render();
    (($(".sv__t a", els.saved)) || els.title).focus();
    BS.toast("Removed <strong>" + esc(nameOf(p)) + "</strong> from saved items.", { label: "Undo", icon: "trash", onAction: function () {
      var cur = savedList().filter(function (x) { return x.id !== id; });
      cur.splice(Math.min(idx, cur.length), 0, it);
      BS.store.set("saved", cur);
      render();
    } });
  }

  function openQuote(trigger) {
    var t = bag.totals();
    if (!t.lines.length) return;
    var now = new Date(), valid = new Date(now); valid.setDate(valid.getDate() + 7);
    var no = "QT-" + bag.yymm(now) + "-" + rand4();
    var draft = BS.store.get("checkoutDraft", {});
    if (!draft || typeof draft !== "object") draft = {};
    // A known delivery state from checkout lets the quote split GST the way the invoice will.
    t = bag.totals({ state: draft.state || "" });
    var who = (draft.business && draft.company) || draft.name;
    var to = who ? "<strong>" + esc(who) + "</strong>" + (draft.business && draft.gstin ? "<br>GSTIN " + esc(draft.gstin) : "") + (draft.city ? "<br>" + esc(draft.city) + (draft.state ? ", " + esc(draft.state) : "") : "") + (draft.email ? "<br>" + esc(draft.email) : "") :
      '<span class="doc__blank">Company name</span><span class="doc__blank">GSTIN</span><span class="doc__blank">Delivery city and state</span>';
    var html = bag.docHTML({
      kind: "quote", no: no,
      meta: [["Quotation date", bag.date(now)], ["Valid until", bag.date(valid)], ["Prices", "INR, excluding GST"], draft.state ? ["Place of supply", esc(draft.state)] : ["Dispatch", "From Pune, Maharashtra"]],
      parties: [{ h: "Prepared for", html: to }],
      lines: bag.docLines(t.lines),
      totals: Object.assign({}, t, { shipLabel: "Standard delivery" }),
      terms: [
        "Prices are per unit in Indian rupees and exclude GST. GST at 18% is charged as CGST 9% and SGST 9% for delivery within Maharashtra, or IGST 18% elsewhere.",
        "This quotation is valid for 7 days, until " + bag.date(valid) + ". Tier prices apply to the quantities shown.",
        "Dispatch is free on orders of ₹5,000 or more before GST, otherwise ₹120. In-stock parts ordered by 4 pm, Monday to Saturday, leave the same day.",
        "Payment in advance by UPI, card, netbanking or bank transfer. Verified business accounts can pay on 30-day credit.",
        "Unused parts in their original packing can be returned within 7 days of delivery."
      ],
      note: "Sample document from the Bearingsetu demo store. Not a valid offer. Questions: orders@bearingsetu.com"
    });
    var q = arr("quotations");
    q.unshift({ id: no, date: now.toISOString(), validUntil: valid.toISOString(), lines: t.lines.map(function (l) { return { id: l.id, pn: l.p.pn, brand: BS.brand(l.p.brand).name, qty: l.qty, unit: l.unit, total: l.total }; }), total: t.total });
    BS.store.set("quotations", q.slice(0, 20));
    bag.openDoc({ kicker: "Quotation", title: no, html: html, trigger: trigger });
  }

  page.addEventListener("click", function (e) {
    var el;
    // Rows move up when one leaves the bag, so the second click of a double-click would
    // land on the next row's button. Only the first click of a burst acts on a row.
    if (e.detail > 1 && e.target.closest("[data-del], [data-save], [data-tier], [data-move], [data-saved-del]")) return;
    if ((el = e.target.closest("[data-del]"))) { removeLine(el.getAttribute("data-del")); return; }
    if ((el = e.target.closest("[data-save]"))) { saveForLater(el.getAttribute("data-save")); return; }
    if ((el = e.target.closest("[data-tier]"))) {
      var id = el.getAttribute("data-tier");
      BS.cart.set(id, parseInt(el.getAttribute("data-qty"), 10));
      var input = els.lines.querySelector('[data-line="' + CSS.escape(id) + '"] [data-stepper] input');
      if (input) input.focus();
      return;
    }
    if ((el = e.target.closest("[data-move]"))) { moveToBag(el.getAttribute("data-move")); return; }
    if ((el = e.target.closest("[data-saved-del]"))) { deleteSaved(el.getAttribute("data-saved-del")); return; }
    if (e.target.closest("[data-coupon-remove]")) {
      coupon.value = ""; coupon.error = "";
      bag.removeCoupon();
      BS.toast("Coupon removed.", { icon: "tag" });
      var inp = $("#cpn-code");
      if (inp) inp.focus();
      return;
    }
    if ((el = e.target.closest("[data-quote]"))) { openQuote(el); return; }
    if ((el = e.target.closest("[data-gst]"))) { BS.setPref("gst", el.getAttribute("data-gst")); return; }
  });

  page.addEventListener("submit", function (e) {
    var form = e.target.closest("[data-coupon-form]");
    if (!form) return;
    e.preventDefault();
    var input = $("#cpn-code");
    coupon.value = input.value;
    var res = bag.applyCoupon(input.value);
    if (res.error) {
      coupon.error = res.error;
      renderCoupon();
      var again = $("#cpn-code");
      again.focus();
      again.select();
      return;
    }
    coupon.value = ""; coupon.error = "";
    BS.toast("<strong>" + esc(res.coupon.code) + "</strong> applied. " + esc(res.coupon.label) + ".", { icon: "tag" });
    var rm = $("[data-coupon-remove]");
    if (rm) rm.focus();
  });
  page.addEventListener("input", function (e) {
    if (e.target.id === "cpn-code") {
      coupon.value = e.target.value;
      if (coupon.error) {
        coupon.error = "";
        e.target.removeAttribute("aria-invalid");
        var err = $("#cpn-err");
        if (err) err.textContent = "";
      }
    }
  });

  // The shared stepper keeps minimum order quantities and tells us when it corrected a typed value.
  BS.on("moq", function (d) {
    var p = d && BS.byId(d.id);
    if (!p || !$('[data-line="' + CSS.escape(d.id) + '"]')) return;
    notes[d.id] = BS.brand(p.brand).name + " " + p.pn + " sells in a minimum of " + d.min + ", so we kept " + d.min + ".";
    setTimeout(function () { delete notes[d.id]; render(); }, 5000);
    render();
  });
  // Keep minimum order quantities for any other path that sets a smaller quantity.
  BS.on("cart", function (d) {
    if (d && d.type === "set" && d.qty > 0) {
      var p = BS.byId(d.id);
      if (p && p.moq > 1 && d.qty < p.moq) {
        notes[d.id] = BS.brand(p.brand).name + " " + p.pn + " sells in a minimum of " + p.moq + ", so we kept " + p.moq + ".";
        setTimeout(function () { delete notes[d.id]; render(); }, 5000);
        BS.cart.set(d.id, p.moq);
        return;
      }
    }
    if (d && d.type === "add") {
      // Let the fly-to-bag animation and the "Added" state finish before the shelf drops the card.
      clearTimeout(shelfTimer);
      render({ shelf: false });
      shelfTimer = setTimeout(render, 1700);
      return;
    }
    render();
  });
  BS.on("prefs", function () { renderedIds = null; shelfKey = null; render(); });
  BS.on("coupon", function () { renderCoupon(); render(); });
  window.addEventListener("storage", function (e) {
    if (/^bs\.(cart|saved|coupon|prefs)$/.test(e.key || "")) { renderedIds = null; renderCoupon(); render(); }
  });

  renderCoupon();
  render();
  if (location.hash === "#saved" && !els.savedSec.hidden) els.savedSec.scrollIntoView();
  // Keep the dispatch promise current while the page stays open.
  setInterval(function () {
    var t = bag.totals();
    if (t.lines.length) renderHero(t);
  }, 60000);
})();
