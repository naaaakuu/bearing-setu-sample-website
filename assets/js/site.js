/* Bearingsetu · shared site script
   Catalogue helpers, cart and saved-list store, search, mega menu, cart drawer,
   toasts and scroll reveals. Every page loads catalog.js, images.js and this file.
   Page scripts use window.BS. */
(function () {
  "use strict";

  var CAT = window.BS_CATALOG || { categories: [], brands: [], products: [], reviews: {} };
  var IMGS = window.BS_IMAGES || {};
  var BS = (window.BS = window.BS || {});
  var doc = document;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ utils */
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function inr(n, dec) {
    var v = Number(n) || 0;
    var d = dec === undefined ? (Math.round(v) === v ? 0 : 2) : dec;
    return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function icon(name, cls) {
    return '<svg class="i' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="assets/icons.svg#i-' + name + '"/></svg>';
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }
  function params() { return new URLSearchParams(location.search); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }

  BS.$ = $; BS.$$ = $$; BS.esc = esc; BS.inr = inr; BS.icon = icon; BS.debounce = debounce; BS.params = params; BS.plural = plural;
  BS.reduceMotion = reduceMotion;
  BS.GST = 0.18;
  BS.FREE_SHIP = 5000;
  BS.SHIP_FEE = 120;

  /* ------------------------------------------------------------------ store */
  var store = {
    get: function (k, fb) {
      try {
        var v = localStorage.getItem("bs." + k);
        return v == null ? fb : JSON.parse(v);
      } catch (e) { return fb; }
    },
    set: function (k, v) {
      try { localStorage.setItem("bs." + k, JSON.stringify(v)); } catch (e) { /* storage blocked: keep going in memory */ }
      mem[k] = v;
    }
  };
  var mem = {};
  var _get = store.get;
  store.get = function (k, fb) { var v = _get(k, undefined); if (v === undefined) return mem[k] !== undefined ? mem[k] : fb; return v; };
  store.remove = function (k) { try { localStorage.removeItem("bs." + k); } catch (e) { /* blocked */ } delete mem[k]; };
  // Lists read from storage are always arrays, whatever an old or edited value holds.
  store.list = function (k) { var v = store.get(k, []); return Array.isArray(v) ? v.filter(function (x) { return x != null; }) : []; };
  BS.store = store;

  function emit(name, detail) { doc.dispatchEvent(new CustomEvent("bs:" + name, { detail: detail })); }
  BS.emit = emit;
  BS.on = function (name, fn) { doc.addEventListener("bs:" + name, function (e) { fn(e.detail); }); };

  /* --------------------------------------------------------------- catalogue */
  var byId = {};
  CAT.products.forEach(function (p) { byId[p.id] = p; });
  var brandById = {};
  CAT.brands.forEach(function (b) { brandById[b.id] = b; });
  var catById = {};
  CAT.categories.forEach(function (c) { catById[c.id] = c; });

  BS.catalog = CAT;
  BS.products = CAT.products;
  BS.byId = function (id) { return byId[id]; };
  BS.brand = function (id) { return brandById[id] || { id: id, name: String(id || "").toUpperCase() }; };
  BS.cat = function (id) { return catById[id]; };
  BS.sub = function (catId, subId) {
    var c = catById[catId];
    if (!c) return null;
    for (var i = 0; i < c.subs.length; i++) if (c.subs[i].id === subId) return c.subs[i];
    return null;
  };

  BS.img = function (key) {
    var m = IMGS[key];
    if (m && !m.missing) return m;
    var fb = IMGS["dgbb-open"] || IMGS["dgbb-sealed"];
    if (fb) return Object.assign({}, fb, { alt: "" });
    return { src: "assets/img/p/dgbb-open.webp", sm: "assets/img/p/dgbb-open-sm.webp", w: 1000, h: 1000, alt: "", bg: "white" };
  };
  BS.imgTag = function (key, opts) {
    opts = opts || {};
    var m = BS.img(key);
    var alt = opts.alt != null ? opts.alt : m.alt || "";
    var sizes = opts.sizes || "(max-width: 640px) 80vw, 300px";
    var srcset = m.sm ? m.sm + " 480w, " + m.src + " " + (m.w || 1000) + "w" : "";
    var cls = (opts.cls || "") + (m.fit === "contain" ? " is-contain" : "") + (m.bg === "dark" || m.bg === "scene" ? " no-blend" : "");
    return '<img src="' + esc(opts.large ? m.src : m.sm || m.src) + '"' +
      (srcset ? ' srcset="' + esc(srcset) + '" sizes="' + esc(sizes) + '"' : "") +
      ' alt="' + esc(alt) + '" width="' + (m.w || 1000) + '" height="' + (m.h || 1000) + '"' +
      (opts.eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async"' + (cls.trim() ? ' class="' + cls.trim() + '"' : "") + ">";
  };

  BS.dims = function (p) {
    if (p.d == null) return "";
    var parts = [p.d, p.D, p.B].filter(function (x) { return x != null; });
    return parts.join(" × ") + " mm";
  };
  BS.unitPrice = function (p, qty) {
    var price = p.price;
    (p.tiers || []).forEach(function (t) { if (qty >= t[0]) price = t[1]; });
    return price;
  };
  BS.nextTier = function (p, qty) {
    var tiers = p.tiers || [];
    for (var i = 0; i < tiers.length; i++) if (qty < tiers[i][0]) return { qty: tiers[i][0], price: tiers[i][1] };
    return null;
  };
  BS.bestTier = function (p) { var t = p.tiers || []; return t.length ? { qty: t[t.length - 1][0], price: t[t.length - 1][1] } : null; };
  BS.unitLabel = function (p) { return p.unit || "pc"; };

  BS.prefs = function () {
    var p = store.get("prefs", null);
    return p && typeof p === "object" && !Array.isArray(p) ? p : { gst: "ex" };
  };
  // opts.silent stores the value without telling pages to re-render (used for the delivery pincode).
  BS.setPref = function (k, v, opts) { var p = BS.prefs(); p[k] = v; store.set("prefs", p); if (!(opts && opts.silent)) emit("prefs", p); };
  BS.withGst = function (n) { return Math.round(n * (1 + BS.GST) * 100) / 100; };
  // Price markup that follows the GST preference.
  BS.priceHTML = function (amount, p, opts) {
    opts = opts || {};
    var inc = BS.prefs().gst === "inc";
    var v = inc ? BS.withGst(amount) : amount;
    var unit = opts.noUnit ? "" : " / " + esc(BS.unitLabel(p));
    return '<strong class="num">' + inr(v, Math.round(v) === v ? 0 : 2) + "</strong><small>" + unit + (inc ? " incl. GST" : " + GST") + "</small>";
  };

  BS.stock = function (p) {
    if (!p.stock) return { cls: "stock stock--out", text: "Ships in " + (p.ship || 7) + " days", short: "Made to order" };
    var when = p.ship === 0 ? "Ships today" : p.ship === 1 ? "Ships tomorrow" : "Ships in " + p.ship + " days";
    if (p.stock < 20) return { cls: "stock stock--low", text: "Only " + p.stock + " left · " + when, short: "Only " + p.stock + " left" };
    return { cls: "stock", text: "In stock · " + when, short: "In stock" };
  };

  var FLAG = { bestseller: ["Bestseller", ""], "new": ["New", ""], "price-drop": ["Lower price", "flag--blue"], bulk: ["Bulk favourite", "flag--green"] };
  BS.flag = function (p) {
    var t = (p.tags || [])[0];
    if (!t || !FLAG[t]) return "";
    return '<p class="flag ' + FLAG[t][1] + '">' + FLAG[t][0] + "</p>";
  };
  BS.subtitle = function (p) {
    var d = BS.dims(p);
    // Titles such as "Oil seal 25 x 52 x 7 mm" or "UCP 205, 25 mm shaft" already carry the size.
    if (d && (/\d\s*[x×]\s*\d/i.test(p.title) || new RegExp("\\b" + p.d + "\\s*mm\\b").test(p.title))) d = "";
    return esc(p.title) + (d ? " · " + d : !BS.dims(p) && p.pack ? " · " + esc(p.pack) : "");
  };
  BS.url = function (p) { return "product.html?id=" + encodeURIComponent(p.id); };
  BS.starsHTML = function (rating, count) {
    var out = '<span class="stars"><span class="stars__row" aria-hidden="true">';
    for (var i = 1; i <= 5; i++) {
      if (rating >= i - 0.25) out += icon("star-fill");
      else if (rating >= i - 0.75) out += icon("star-half-fill");
      else out += icon("star-fill", "is-empty");
    }
    out += '</span><span class="sr-only">Rated ' + rating + " out of 5</span>";
    if (count != null) out += "<span>" + rating.toFixed(1) + (count ? " (" + count + ")" : "") + "</span>";
    return out + "</span>";
  };

  /* --------------------------------------------------------------- search */
  function norm(s) { return String(s || "").toUpperCase().replace(/[\s\-\/\.\(\)_,]+/g, ""); }
  BS.norm = norm;
  var index = CAT.products.map(function (p) {
    var b = BS.brand(p.brand).name;
    var c = catById[p.cat];
    var sub = BS.sub(p.cat, p.sub);
    return {
      p: p,
      pn: norm(p.pn),
      eq: (p.eq || []).map(function (e) { return { raw: e, n: norm(e.replace(/^\S+\s+/, "")), full: norm(e) }; }),
      text: (b + " " + p.pn + " " + p.title + " " + (c ? c.name : "") + " " + (sub ? sub.name : "") + " " + (p.pack || "") + " " + (p.attrs || []).map(function (a) { return a[1]; }).join(" ")).toLowerCase()
    };
  });
  var SIZE_RE = /(\d+(?:\.\d+)?)\s*(?:mm)?\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*(?:mm)?\s*[x×*]\s*(\d+(?:\.\d+)?))?/i;
  BS.parseSize = function (q) {
    var m = String(q || "").match(SIZE_RE);
    if (!m) return null;
    return { d: parseFloat(m[1]), D: parseFloat(m[2]), B: m[3] != null ? parseFloat(m[3]) : null };
  };
  function near(a, b) { return a != null && b != null && Math.abs(a - b) < 0.6; }
  BS.search = function (q, limit) {
    q = String(q || "").trim();
    if (!q) return [];
    var size = BS.parseSize(q);
    var nq = norm(q);
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    var out = [];
    index.forEach(function (it) {
      var p = it.p, score = 0, via = null;
      if (size) {
        if (near(p.d, size.d) && near(p.D, size.D) && (size.B == null || near(p.B, size.B))) score = 90;
        else if (p.cat === "seals" && near(p.d, size.d) && near(p.D, size.D)) score = 80;
      }
      if (nq.length >= 2) {
        if (it.pn === nq) score = Math.max(score, 100);
        else if (it.pn.indexOf(nq) === 0) score = Math.max(score, 86 - Math.min(20, it.pn.length - nq.length));
        else if (nq.length >= 3 && it.pn.indexOf(nq) > 0) score = Math.max(score, 55);
        it.eq.forEach(function (e) {
          if (e.n === nq || e.full === nq) { score = Math.max(score, 84); via = e.raw; }
          else if (nq.length >= 4 && (e.n.indexOf(nq) === 0 || e.full.indexOf(nq) === 0)) { if (score < 60) { score = 60; via = e.raw; } }
        });
      }
      if (score < 40 && words.length) {
        var hits = 0;
        words.forEach(function (w) { if (it.text.indexOf(w) !== -1) hits++; });
        if (hits === words.length) score = Math.max(score, 30 + Math.min(20, hits * 5));
      }
      if (score > 0) {
        if (p.tags && p.tags.indexOf("bestseller") !== -1) score += 2;
        if (p.stock > 0) score += 1;
        out.push({ p: p, score: score, via: via });
      }
    });
    out.sort(function (a, b) { return b.score - a.score || a.p.price - b.p.price; });
    return limit ? out.slice(0, limit) : out;
  };

  /* Quick-order parser: one part per line, quantity at the end.
     "6205-2RS1 x 200", "UCP205, 40", "B48 75", "22210 E 6 pcs" */
  var BRAND_WORDS = { skf: "skf", fag: "fag", schaeffler: "fag", ina: "ina", nsk: "nsk", ntn: "ntn", koyo: "koyo", jtekt: "koyo", timken: "timken", nbc: "nbc", zkl: "zkl", hiwin: "hiwin", samick: "samick", fenner: "fenner", gates: "gates", rolon: "rolon", lovejoy: "lovejoy", nok: "nok", parker: "parker", shell: "shell", servo: "servo" };
  var BRAND_LEAD = new RegExp("^(" + Object.keys(BRAND_WORDS).join("|") + ")\\b[\\s:\\-]*", "i");
  // Search that understands a leading brand word: "SKF 6205 2RS1" prefers SKF's 6205-2RS1.
  BS.searchPart = function (part, limit) {
    var res = BS.search(part, limit || 10);
    var m = String(part).match(BRAND_LEAD);
    if (!m || part.length <= m[0].length) return res;
    var brand = BRAND_WORDS[m[1].toLowerCase()];
    var alt = BS.search(part.slice(m[0].length), 12);
    if (!alt.length) return res;
    var same = alt.filter(function (r) { return r.p.brand === brand; });
    var best = same.length && same[0].score >= 50 ? same.concat(alt.filter(function (r) { return r.p.brand !== brand; })) : alt;
    return (!res.length || best[0].score >= res[0].score || res[0].p.brand !== brand ? best : res).slice(0, limit || 10);
  };
  function topScore(q) { var r = BS.searchPart(q, 1)[0]; return r ? r.score : 0; }
  BS.parseLines = function (text) {
    return String(text || "").split(/\r?\n/).map(function (raw) { return raw.trim(); }).filter(Boolean).slice(0, 200).map(function (raw) {
      var line = raw.replace(/\s+/g, " ");
      var part = line, qty = 1;
      var m = line.match(/^(.*?)(?:\s*[,;:\t×xX\*=]\s*|\s+-\s+|\s+qty\s*|\s+)(\d{1,6})\s*(?:pcs?|nos?|units?|sets?|kits?)?\.?$/i);
      // Keep the whole line when the trailing number belongs to the part:
      // "UCP 205" is one part, and "TC 25x52x7" is a seal size, not 'TC 25x52' times 7.
      if (m && /\d(?:\.\d+)?[x×]\d+(?:\.\d+)?[x×]$/i.test(line.slice(0, line.length - m[2].length))) m = null;
      if (m) { var whole = topScore(line); if (whole >= 84 && whole >= topScore(m[1]) + 3) m = null; }
      if (m && m[1] && /[a-z0-9]/i.test(m[1])) { part = m[1].trim(); qty = parseInt(m[2], 10); }
      var res = BS.searchPart(part, 4);
      var top = res[0];
      var status = !top ? "missing" : top.score >= 84 ? "found" : top.score >= 50 ? "check" : "missing";
      if (status === "found" && res[1] && res[1].score >= top.score && BS.norm(res[1].p.pn) === BS.norm(top.p.pn) && res[1].p.id !== top.p.id) status = "found";
      return { raw: raw, part: part, qty: Math.max(1, qty), status: status, p: top && status !== "missing" ? top.p : null, alts: res.slice(1, 4).map(function (r) { return r.p; }), via: top ? top.via : null };
    });
  };

  /* ------------------------------------------------------------------ cart */
  function readCart() {
    return store.list("cart").filter(function (l) { return typeof l === "object" && byId[l.id] && (parseInt(l.qty, 10) || 0) > 0; })
      .map(function (l) { return { id: l.id, qty: Math.min(99999, parseInt(l.qty, 10)) }; });
  }
  var cart = {
    lines: function () {
      return readCart().map(function (l) {
        var p = byId[l.id];
        var unit = BS.unitPrice(p, l.qty);
        return { id: l.id, p: p, qty: l.qty, unit: unit, total: Math.round(unit * l.qty * 100) / 100, base: p.price * l.qty };
      });
    },
    count: function () { return readCart().reduce(function (s, l) { return s + l.qty; }, 0); },
    qtyOf: function (id) { var l = readCart().filter(function (x) { return x.id === id; })[0]; return l ? l.qty : 0; },
    add: function (id, qty) {
      qty = Math.max(1, parseInt(qty, 10) || 1);
      var p = byId[id];
      if (!p) return;
      var lines = readCart();
      var l = lines.filter(function (x) { return x.id === id; })[0];
      if (l) l.qty += qty;
      else lines.push({ id: id, qty: Math.max(qty, p.moq || 1) });
      store.set("cart", lines);
      emit("cart", { type: "add", id: id, qty: qty });
    },
    set: function (id, qty) {
      qty = parseInt(qty, 10) || 0;
      var lines = readCart();
      if (qty <= 0) lines = lines.filter(function (x) { return x.id !== id; });
      else {
        var l = lines.filter(function (x) { return x.id === id; })[0];
        if (l) l.qty = qty; else lines.push({ id: id, qty: qty });
      }
      store.set("cart", lines);
      emit("cart", { type: "set", id: id, qty: qty });
    },
    remove: function (id) {
      var before = readCart();
      var gone = before.filter(function (x) { return x.id === id; })[0];
      store.set("cart", before.filter(function (x) { return x.id !== id; }));
      emit("cart", { type: "remove", id: id, line: gone });
      return gone;
    },
    clear: function () { store.set("cart", []); emit("cart", { type: "clear" }); },
    totals: function () {
      var lines = cart.lines();
      var sub = 0, base = 0;
      lines.forEach(function (l) { sub += l.total; base += l.base; });
      sub = Math.round(sub * 100) / 100;
      var ship = lines.length && sub < BS.FREE_SHIP ? BS.SHIP_FEE : 0;
      var gst = Math.round((sub + ship) * BS.GST * 100) / 100;
      return { lines: lines, sub: sub, savings: Math.round((base - sub) * 100) / 100, ship: ship, gst: gst, total: Math.round((sub + ship + gst) * 100) / 100, gap: Math.max(0, BS.FREE_SHIP - sub), count: cart.count() };
    }
  };
  BS.cart = cart;

  /* saved list (heart) */
  BS.wish = {
    all: function () { return store.list("wish").filter(function (id) { return byId[id]; }); },
    has: function (id) { return BS.wish.all().indexOf(id) !== -1; },
    toggle: function (id) {
      var w = BS.wish.all();
      var i = w.indexOf(id);
      if (i === -1) w.unshift(id); else w.splice(i, 1);
      store.set("wish", w);
      emit("wish", { id: id, on: i === -1 });
      return i === -1;
    }
  };
  /* recently viewed */
  BS.recent = {
    all: function () { return store.list("recent").filter(function (id) { return byId[id]; }); },
    add: function (id) {
      var r = BS.recent.all().filter(function (x) { return x !== id; });
      r.unshift(id);
      store.set("recent", r.slice(0, 12));
    }
  };

  /* ------------------------------------------------------------- product card */
  BS.card = function (p, opts) {
    opts = opts || {};
    var b = BS.brand(p.brand);
    var st = BS.stock(p);
    var best = BS.bestTier(p);
    var fav = BS.wish.has(p.id);
    var inc = BS.prefs().gst === "inc";
    var showMrp = p.mrp && p.mrp > p.price && !inc;
    return '<article class="pcard' + (opts.row ? " pcard--row" : "") + (opts.reveal ? " reveal" : "") + '" data-pid="' + esc(p.id) + '"' + (opts.i != null ? ' style="--i:' + opts.i + '"' : "") + ">" +
      '<a class="pcard__media" href="' + BS.url(p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(p.img, { alt: "", sizes: opts.sizes }) + "</a>" +
      '<button class="pcard__fav" type="button" data-fav="' + esc(p.id) + '" aria-pressed="' + fav + '" aria-label="Save ' + esc(b.name + " " + p.pn) + ' to your list">' + icon(fav ? "heart-fill" : "heart") + "</button>" +
      '<div class="pcard__body">' +
        BS.flag(p) +
        '<p class="pcard__brand">' + esc(b.name) + "</p>" +
        '<h3 class="pcard__title"><a href="' + BS.url(p) + '">' + esc(p.pn) + "</a></h3>" +
        '<p class="pcard__spec">' + BS.subtitle(p) + "</p>" +
        '<div class="pcard__meta"><span class="' + st.cls + '">' + esc(st.text) + "</span></div>" +
        '<p class="pcard__price">' + BS.priceHTML(p.price, p) + (showMrp ? " <s>" + inr(p.mrp) + "</s>" : "") + "</p>" +
        (best ? '<p class="pcard__tier">' + inr(inc ? BS.withGst(best.price) : best.price) + " / " + esc(BS.unitLabel(p)) + " at " + best.qty + "+</p>" : "") +
        '<div class="pcard__actions"><button class="btn btn--sm btn--add" type="button" data-add="' + esc(p.id) + '" aria-label="Add ' + esc(b.name + " " + p.pn) + ' to bag">Add to bag</button></div>' +
      "</div></article>";
  };

  /* ------------------------------------------------------------------ toast */
  BS.toast = function (msg, opts) {
    opts = opts || {};
    var box = $("[data-toasts]");
    if (!box) return;
    var t = doc.createElement("div");
    // opts.cls "toast--info" gives notices and limits a neutral icon instead of the green tick.
    t.className = "toast" + (opts.cls ? " " + opts.cls : "");
    t.setAttribute("role", "status");
    var act = "";
    if (opts.href) act = '<a class="toast__act" href="' + esc(opts.href) + '">' + esc(opts.label || "View") + "</a>";
    else if (opts.onAction) act = '<button class="toast__act" type="button">' + esc(opts.label || "Undo") + "</button>";
    t.innerHTML = icon(opts.icon || "check-circle") + '<span class="toast__msg">' + msg + "</span>" + act;
    box.appendChild(t);
    if (opts.onAction) $(".toast__act", t).addEventListener("click", function () { opts.onAction(); leave(); });
    var timer = setTimeout(leave, opts.ms || 4200);
    function leave() {
      clearTimeout(timer);
      t.classList.add("is-leaving");
      setTimeout(function () { t.remove(); }, 320);
    }
    return { close: leave };
  };

  /* --------------------------------------------------------------- overlays */
  var lastFocus = null;
  function trap(container, e) {
    if (e.key !== "Tab") return;
    var f = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', container).filter(function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && doc.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && doc.activeElement === last) { first.focus(); e.preventDefault(); }
  }
  BS.trap = trap;
  // Shared overlays (search, bag, menu) count their locks on their own class, so closing one
  // never unlocks scrolling under a page dialog that set .is-locked itself.
  var locks = {};
  function lock(on, key) {
    key = key || "page";
    if (on) locks[key] = true; else delete locks[key];
    doc.body.classList.toggle("bs-locked", Object.keys(locks).length > 0);
  }
  BS.lock = lock;

  /* cart drawer */
  var drawer, scrim;
  function openCart() {
    drawer = drawer || $("#cart-drawer");
    scrim = scrim || $("[data-cart-scrim]");
    if (!drawer) { location.href = "cart.html"; return; }
    closeSearch(); closeMega(); closeMenu();
    lastFocus = doc.activeElement;
    renderDrawer();
    drawer.hidden = false;
    requestAnimationFrame(function () {
      drawer.classList.add("is-open");
      scrim.classList.add("is-on");
      lock(true, "cart");
      var btn = $("[data-close-cart]", drawer);
      if (btn) btn.focus();
    });
  }
  function closeCart() {
    if (!drawer || !drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open");
    scrim.classList.remove("is-on");
    lock(false, "cart");
    setTimeout(function () { if (!drawer.classList.contains("is-open")) drawer.hidden = true; }, 500);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  BS.openCart = openCart;
  BS.closeCart = closeCart;

  function shipMeter(t) {
    if (!t.lines.length) return "";
    var pct = Math.min(100, Math.round((t.sub / BS.FREE_SHIP) * 100));
    var msg = t.gap > 0 ? "Add " + inr(Math.ceil(t.gap)) + " more for free dispatch." : "Your order ships free.";
    return '<div class="stack" style="--stack:8px"><p class="small">' + msg + '</p><div class="progress' + (t.gap > 0 ? "" : " is-done") + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progress to free dispatch"><span style="width:' + pct + '%"></span></div></div>';
  }
  BS.shipMeter = shipMeter;

  function renderDrawer() {
    var body = $("[data-cart-lines]"), foot = $("[data-cart-foot]");
    if (!body) return;
    var t = cart.totals();
    var title = $("#cart-drawer-title");
    if (title) title.textContent = t.count ? "Your bag (" + t.count + ")" : "Your bag";
    if (!t.lines.length) {
      body.innerHTML = '<div class="empty" style="margin:16px 0">' + icon("handbag") + "<h3>Your bag is empty</h3><p>Search by part number or size, or paste a whole list into Quick order.</p>" +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn btn--sm" href="shop.html">Shop parts</a><a class="btn btn--sm btn--quiet" href="quick-order.html">Quick order</a></div></div>';
      foot.innerHTML = "";
      foot.hidden = true;
      return;
    }
    foot.hidden = false;
    body.innerHTML = t.lines.map(function (l) {
      var b = BS.brand(l.p.brand);
      var nt = BS.nextTier(l.p, l.qty);
      var tierMsg = l.unit < l.p.price ? "Tier price " + inr(l.unit) + " / " + esc(BS.unitLabel(l.p)) + " applied" :
        nt ? "Buy " + nt.qty + "+ for " + inr(nt.price) + " / " + esc(BS.unitLabel(l.p)) : "";
      return '<div class="line" data-line="' + esc(l.id) + '">' +
        '<a class="line__img" href="' + BS.url(l.p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(l.p.img, { alt: "" }) + "</a>" +
        "<div>" +
          '<div class="line__top"><div><a class="line__t" href="' + BS.url(l.p) + '">' + esc(b.name + " " + l.p.pn) + '</a><p class="line__s">' + esc(l.p.title) + "</p></div>" +
          '<p class="line__p num">' + inr(l.total) + "<small>" + inr(l.unit) + " × " + l.qty + "</small></p></div>" +
          (tierMsg ? '<p class="line__tier">' + tierMsg + "</p>" : "") +
          '<div class="line__row">' + stepperHTML(l.id, l.qty, "sm") +
          '<button class="textlink small" type="button" data-remove="' + esc(l.id) + '">Remove</button></div>' +
        "</div></div>";
    }).join("");
    foot.innerHTML = shipMeter(t) +
      '<div class="sumrow"><span>Subtotal</span><span class="num">' + inr(t.sub) + "</span></div>" +
      (t.savings > 0 ? '<div class="sumrow small" style="color:var(--green)"><span>Volume savings included</span><span class="num">' + inr(t.savings) + "</span></div>" : "") +
      '<div class="sumrow small muted"><span>GST (18%) and dispatch are added at checkout</span></div>' +
      '<a class="btn btn--block" href="checkout.html">Check out</a>' +
      '<a class="btn btn--block btn--quiet" href="cart.html">View bag and get a quote</a>';
  }
  BS.renderDrawer = renderDrawer;

  function minQty(st) {
    var m = parseInt(st.getAttribute("data-min"), 10);
    if (m > 0) return m;
    var p = byId[st.getAttribute("data-stepper")];
    return Math.max(1, (p && p.moq) || 1);
  }
  // min defaults to the part's minimum order quantity (belts come in pairs, seals in fives).
  function stepperHTML(id, qty, size, min) {
    var p = byId[id];
    min = Math.max(1, min || (p && p.moq) || 1);
    return '<div class="stepper' + (size ? " stepper--" + size : "") + '" data-stepper="' + esc(id) + '"' + (min > 1 ? ' data-min="' + min + '"' : "") + ">" +
      '<button type="button" data-step="-1" aria-label="Decrease quantity"' + (qty <= min ? " disabled" : "") + ">" + icon("minus") + "</button>" +
      '<input type="number" inputmode="numeric" min="' + min + '" max="99999" value="' + qty + '" aria-label="Quantity">' +
      '<button type="button" data-step="1" aria-label="Increase quantity">' + icon("plus") + "</button></div>";
  }
  BS.stepperHTML = stepperHTML;

  /* search overlay */
  var searchEl, searchInput, searchBody, activeIdx = -1, searchResults = [];
  var POPULAR = ["6205-2RS", "6305 ZZ", "UCP 205", "22210 E", "30205", "B60", "SPB 2240", "LGMT 2", "25x52x15"];
  function openSearch(prefill) {
    searchEl = searchEl || $("#search");
    if (!searchEl) { location.href = "shop.html"; return; }
    searchInput = $("#search-input");
    searchBody = $("[data-search-body]");
    closeCart(); closeMega(); closeMenu();
    lastFocus = doc.activeElement;
    searchEl.hidden = false;
    lock(true, "search");
    if (prefill != null) searchInput.value = prefill;
    renderSearch();
    requestAnimationFrame(function () {
      searchEl.classList.add("is-open");
      searchInput.focus();
      searchInput.select();
    });
  }
  function closeSearch() {
    if (!searchEl || !searchEl.classList.contains("is-open")) return;
    searchEl.classList.remove("is-open");
    lock(false, "search");
    setTimeout(function () { if (!searchEl.classList.contains("is-open")) searchEl.hidden = true; }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  BS.openSearch = openSearch;
  BS.closeSearch = closeSearch;

  function renderSearch() {
    var q = searchInput.value.trim();
    activeIdx = -1;
    searchInput.setAttribute("aria-expanded", q ? "true" : "false");
    searchInput.removeAttribute("aria-activedescendant");
    if (!q) {
      var recentQ = store.list("recentQ").filter(function (x) { return typeof x === "string"; });
      searchBody.innerHTML =
        (recentQ.length ? '<div class="search__group"><p class="search__label">Recent searches</p><div class="search__quick">' + recentQ.map(function (r) { return '<button class="chip chip--outline" type="button" data-q="' + esc(r) + '">' + icon("clock") + esc(r) + "</button>"; }).join("") + "</div></div>" : "") +
        '<div class="search__group"><p class="search__label">Popular part numbers</p><div class="search__quick">' + POPULAR.map(function (r) { return '<button class="chip" type="button" data-q="' + esc(r) + '">' + esc(r) + "</button>"; }).join("") + "</div></div>" +
        '<div class="search__group"><p class="search__label">Quick links</p><ul class="search__results">' +
          qlink("ruler", "Find a bearing by size", "index.html#finder") +
          qlink("arrows-left-right", "Find an equivalent from another brand", "tools.html#interchange") +
          qlink("list-checks", "Quick order: paste a list of part numbers", "quick-order.html") +
          qlink("truck", "Track an order", "support.html#track") +
        "</ul></div>";
      searchResults = [];
      return;
    }
    searchResults = BS.search(q, 8);
    var size = BS.parseSize(q);
    var head = size ? '<p class="search__label">Parts sized ' + esc([size.d, size.D, size.B].filter(function (x) { return x != null; }).join(" × ")) + " mm</p>" : '<p class="search__label">Products</p>';
    if (!searchResults.length) {
      searchBody.innerHTML = '<div class="search__group"><p class="search__empty">No exact match for “' + esc(q) + '”. Check the number, try the size as bore × outer × width, or ask us to source it.</p>' +
        '<div class="search__quick"><a class="chip chip--outline" href="tools.html?q=' + encodeURIComponent(q) + '#interchange">' + icon("arrows-left-right") + 'Find an equivalent</a><a class="chip chip--outline" href="quick-order.html?q=' + encodeURIComponent(q) + '#rfq">' + icon("paper-plane-tilt") + "Request a quote</a></div></div>";
      return;
    }
    searchBody.innerHTML = '<div class="search__group">' + head + '<ul class="search__results" id="search-results" role="listbox" aria-label="Search results">' +
      searchResults.map(function (r, i) {
        var p = r.p, b = BS.brand(p.brand), st = BS.stock(p);
        return '<li role="presentation"><a class="sres" id="sres-' + i + '" role="option" aria-selected="false" href="' + BS.url(p) + '" data-sres>' +
          '<span class="sres__img">' + BS.imgTag(p.img, { alt: "" }) + "</span>" +
          '<span style="min-width:0"><span class="sres__t">' + esc(b.name + " " + p.pn) + '</span><span class="sres__s">' + (r.via ? "Equivalent of " + esc(r.via) + " · " : "") + BS.subtitle(p) + "</span></span>" +
          '<span class="sres__p num">' + inr(p.price) + "<small>" + esc(st.short) + "</small></span></a></li>";
      }).join("") + "</ul>" +
      '<a class="more search__all" href="shop.html?q=' + encodeURIComponent(q) + '">See all results for “' + esc(q) + "”</a></div>";
  }
  function qlink(ic, label, href) {
    return '<li><a class="sres" href="' + href + '" style="grid-template-columns:40px 1fr"><span class="sres__img" style="width:40px;height:40px;background:var(--mist)">' + icon(ic) + '</span><span class="sres__t" style="font-weight:500">' + label + "</span></a></li>";
  }
  function moveActive(dir) {
    var opts = $$("[data-sres]", searchBody);
    if (!opts.length) return;
    activeIdx = (activeIdx + dir + opts.length) % opts.length;
    opts.forEach(function (o, i) { o.setAttribute("aria-selected", i === activeIdx ? "true" : "false"); });
    searchInput.setAttribute("aria-activedescendant", opts[activeIdx].id);
    opts[activeIdx].scrollIntoView({ block: "nearest" });
  }
  function rememberQuery(q) {
    q = q.trim();
    if (!q) return;
    var r = store.list("recentQ").filter(function (x) { return typeof x === "string" && x.toLowerCase() !== q.toLowerCase(); });
    r.unshift(q);
    store.set("recentQ", r.slice(0, 6));
  }
  BS.rememberQuery = rememberQuery;

  /* mega menu */
  var megaOpen = null, megaTimer;
  function openMega(id, link) {
    clearTimeout(megaTimer);
    if (megaOpen && megaOpen.id === id) return;
    closeMega(true);
    var panel = doc.getElementById(id);
    if (!panel) return;
    panel.classList.add("is-open");
    $("#gnav").classList.add("is-open");
    $("[data-page-dim]").classList.add("is-on");
    link.setAttribute("aria-expanded", "true");
    megaOpen = { id: id, panel: panel, link: link };
  }
  function closeMega(instant) {
    if (!megaOpen) return;
    megaOpen.panel.classList.remove("is-open");
    megaOpen.link.setAttribute("aria-expanded", "false");
    if (!instant) {
      $("#gnav").classList.remove("is-open");
      $("[data-page-dim]").classList.remove("is-on");
    }
    megaOpen = null;
  }
  BS.closeMega = closeMega;

  /* mobile menu */
  var menuOpen = false;
  function toggleMenu(force) {
    var m = $("#mmenu"), btn = $("[data-open-menu]");
    if (!m) return;
    menuOpen = force != null ? force : !menuOpen;
    if (menuOpen) {
      closeCart(); closeSearch();
      m.hidden = false;
      requestAnimationFrame(function () { m.classList.add("is-open"); });
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "Close menu");
      btn.innerHTML = icon("x");
      lock(true, "menu");
    } else {
      m.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Open menu");
      btn.innerHTML = icon("list");
      lock(false, "menu");
      setTimeout(function () { if (!menuOpen) m.hidden = true; }, 260);
    }
  }
  function closeMenu() { if (menuOpen) toggleMenu(false); }

  /* --------------------------------------------------------- cart badge + fly */
  function updateBadge(bump) {
    var n = cart.count();
    $$("[data-cart-count]").forEach(function (el) {
      el.textContent = n > 99 ? "99+" : String(n);
      el.classList.toggle("is-on", n > 0);
    });
    $$("[data-open-cart]").forEach(function (b) {
      b.setAttribute("aria-label", "Cart, " + plural(n, "item"));
      if (bump) { b.classList.remove("is-bump"); void b.offsetWidth; b.classList.add("is-bump"); }
    });
  }
  function flyToBag(fromEl) {
    if (reduceMotion || !fromEl || !fromEl.getBoundingClientRect || !Element.prototype.animate) return;
    var target = $(".cart-btn");
    if (!target) return;
    var a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (!a.width) return;
    var ghost = fromEl.cloneNode(true);
    ghost.removeAttribute("srcset");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.cssText = "position:fixed;z-index:95;pointer-events:none;border-radius:16px;object-fit:cover;background:#f5f5f7;left:" + a.left + "px;top:" + a.top + "px;width:" + a.width + "px;height:" + a.height + "px;mix-blend-mode:multiply";
    doc.body.appendChild(ghost);
    var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    ghost.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: "translate(" + dx * 0.6 + "px," + (dy * 0.6 - 60) + "px) scale(.45)", opacity: 0.9, offset: 0.6 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(.08)", opacity: 0.2 }
    ], { duration: 720, easing: "cubic-bezier(.5,0,.2,1)" }).onfinish = function () { ghost.remove(); };
  }
  BS.flyToBag = flyToBag;

  BS.addToBag = function (id, qty, srcEl, opts) {
    opts = opts || {};
    var p = byId[id];
    if (!p) return;
    cart.add(id, qty);
    if (srcEl) flyToBag(srcEl);
    var b = BS.brand(p.brand);
    var onBag = /(^|\/)cart\.html$/.test(location.pathname);
    if (!opts.silent) BS.toast("<strong>" + esc(b.name + " " + p.pn) + "</strong> added to your bag.", onBag ? {} : { label: "View bag", onAction: openCart });
  };

  /* ------------------------------------------------------------ scroll reveal */
  var io = "IntersectionObserver" in window && !reduceMotion ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }) : null;
  BS.reveal = function (root) {
    $$(".reveal:not(.is-in)", root).forEach(function (el) {
      if (io) io.observe(el); else el.classList.add("is-in");
    });
  };

  /* shelves (horizontal scrollers with arrow buttons) */
  var shelfUpdaters = [];
  window.addEventListener("resize", debounce(function () {
    shelfUpdaters = shelfUpdaters.filter(function (s) { return s.el.isConnected; });
    shelfUpdaters.forEach(function (s) { s.upd(); });
  }, 120));
  BS.shelf = function (root) {
    $$("[data-shelf]", root).forEach(function (wrap) {
      if (wrap._shelf) return;
      wrap._shelf = true;
      var track = $(".shelf", wrap), prev = $("[data-shelf-prev]", wrap), next = $("[data-shelf-next]", wrap);
      if (!track) return;
      function upd() {
        if (prev) prev.disabled = track.scrollLeft < 8;
        if (next) next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
      }
      function go(dir) { track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: reduceMotion ? "auto" : "smooth" }); }
      if (prev) prev.addEventListener("click", function () { go(-1); });
      if (next) next.addEventListener("click", function () { go(1); });
      track.addEventListener("scroll", debounce(upd, 60), { passive: true });
      shelfUpdaters.push({ el: wrap, upd: upd });
      upd();
    });
  };

  /* --------------------------------------------------------------- wiring */
  doc.addEventListener("click", function (e) {
    var t = e.target;
    var el;
    if ((el = t.closest("[data-open-search]"))) { e.preventDefault(); openSearch(el.getAttribute("data-search-prefill")); return; }
    if (t.closest("[data-close-search]")) { closeSearch(); return; }
    if ((el = t.closest("[data-q]")) && searchEl && searchEl.contains(el)) { searchInput.value = el.getAttribute("data-q"); renderSearch(); searchInput.focus(); return; }
    if (t.closest("[data-sres]")) { rememberQuery(searchInput.value); return; }
    if (t.closest("[data-open-cart]")) { e.preventDefault(); openCart(); return; }
    if (t.closest("[data-close-cart]") || t.closest("[data-cart-scrim]")) { closeCart(); return; }
    if (t.closest("[data-open-menu]")) { toggleMenu(); return; }
    if ((el = t.closest("[data-add]"))) {
      e.preventDefault();
      var id = el.getAttribute("data-add");
      var qty = el.getAttribute("data-qty") || 1;
      var card = el.closest("[data-pid]");
      var img = card ? $(".pcard__media img, [data-fly]", card) : null;
      BS.addToBag(id, qty, img);
      var label = el.textContent;
      if (el.classList.contains("btn--add")) {
        el.innerHTML = icon("check") + "Added";
        if (card) card.classList.add("is-added");
        setTimeout(function () { el.textContent = label === "Added" ? "Add to bag" : label; if (card) card.classList.remove("is-added"); }, 1600);
      }
      return;
    }
    if ((el = t.closest("[data-fav]"))) {
      e.preventDefault();
      var fid = el.getAttribute("data-fav");
      var on = BS.wish.toggle(fid);
      var p = byId[fid];
      $$('[data-fav="' + fid + '"]').forEach(function (b) {
        b.setAttribute("aria-pressed", String(on));
        var u = b.querySelector("use");
        if (u) u.setAttribute("href", "assets/icons.svg#i-" + (on ? "heart-fill" : "heart"));
      });
      BS.toast(on ? "Saved <strong>" + esc(BS.brand(p.brand).name + " " + p.pn) + "</strong> to your list." : "Removed from your list.", on ? { label: "View list", href: "account.html#lists", icon: "heart-fill" } : { icon: "heart" });
      return;
    }
    if ((el = t.closest("[data-remove]")) && drawer && drawer.contains(el)) {
      var rid = el.getAttribute("data-remove");
      var gone = cart.remove(rid);
      if (gone) BS.toast("Removed " + esc(BS.brand(byId[rid].brand).name + " " + byId[rid].pn) + ".", { label: "Undo", icon: "trash", onAction: function () { cart.set(rid, gone.qty); } });
      return;
    }
    if ((el = t.closest("[data-step]"))) {
      var st = el.closest("[data-stepper]");
      var input = $("input", st);
      var v = Math.max(minQty(st), (parseInt(input.value, 10) || 1) + parseInt(el.getAttribute("data-step"), 10));
      input.value = v;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if ((el = t.closest(".gfoot__acc"))) {
      var ul = el.closest("div").querySelector("ul");
      var open = el.getAttribute("aria-expanded") !== "true";
      el.setAttribute("aria-expanded", String(open));
      ul.classList.toggle("is-collapsed", !open);
      return;
    }
    if ((el = t.closest(".mmenu__row[aria-controls]"))) {
      var sub = doc.getElementById(el.getAttribute("aria-controls"));
      var o = el.getAttribute("aria-expanded") !== "true";
      el.setAttribute("aria-expanded", String(o));
      sub.hidden = !o;
      return;
    }
    if (megaOpen && !t.closest(".gnav")) closeMega();
  });

  // Steppers bound to a cart line update the cart; others are handled by page scripts.
  doc.addEventListener("change", function (e) {
    var st = e.target.closest && e.target.closest("[data-stepper]");
    if (!st) return;
    var input = $("input", st);
    var min = minQty(st);
    var asked = parseInt(input.value, 10) || 0;
    var v = Math.max(min, Math.min(99999, asked || min));
    if (asked > 0 && asked < min) emit("moq", { id: st.getAttribute("data-stepper"), min: min, asked: asked });
    input.value = v;
    var minus = $('[data-step="-1"]', st);
    if (minus) minus.disabled = v <= min;
    var id = st.getAttribute("data-stepper");
    if (id && byId[id] && !st.hasAttribute("data-local")) cart.set(id, v);
  });

  doc.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === "Escape") {
      if (searchEl && searchEl.classList.contains("is-open")) closeSearch();
      else if (drawer && drawer.classList.contains("is-open")) closeCart();
      else if (megaOpen) { var l = megaOpen.link; closeMega(); l.focus(); }
      else if (menuOpen) toggleMenu(false);
      return;
    }
    if (searchEl && searchEl.classList.contains("is-open")) {
      if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
      else if (e.key === "Enter" && activeIdx > -1 && e.target === searchInput) {
        e.preventDefault();
        var opt = $$("[data-sres]", searchBody)[activeIdx];
        rememberQuery(searchInput.value);
        if (opt) location.href = opt.getAttribute("href");
      }
      trap($(".search__panel"), e);
    } else if (drawer && drawer.classList.contains("is-open")) trap(drawer, e);
  });

  function initHeader() {
    $$(".gnav__link[data-mega]").forEach(function (link) {
      var id = link.getAttribute("data-mega");
      link.setAttribute("aria-expanded", "false");
      link.setAttribute("aria-controls", id);
      link.addEventListener("mouseenter", function () {
        clearTimeout(megaTimer);
        megaTimer = setTimeout(function () { openMega(id, link); }, megaOpen ? 0 : 140);
      });
      link.addEventListener("mouseleave", function () { clearTimeout(megaTimer); });
      link.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown" || (e.key === " " && !megaOpen)) {
          e.preventDefault();
          openMega(id, link);
          var first = $("a", doc.getElementById(id));
          if (first) first.focus();
        }
      });
    });
    var gnav = $("#gnav");
    if (gnav) {
      gnav.addEventListener("mouseleave", function () { clearTimeout(megaTimer); megaTimer = setTimeout(closeMega, 180); });
      gnav.addEventListener("mouseenter", function () { if (megaOpen) clearTimeout(megaTimer); });
      gnav.addEventListener("focusout", function (e) {
        if (megaOpen && e.relatedTarget && !gnav.contains(e.relatedTarget)) closeMega();
      });
      $$(".gnav__link:not([data-mega]), .brand, .gnav__icons a, .gnav__icons button").forEach(function (el) {
        el.addEventListener("mouseenter", function () { clearTimeout(megaTimer); megaTimer = setTimeout(closeMega, 120); });
        el.addEventListener("focus", function () { if (megaOpen) closeMega(); });
      });
    }
    var form = $("[data-search-form]");
    if (form) {
      var inp = $("#search-input");
      inp.addEventListener("input", debounce(renderSearch, 60));
      form.addEventListener("submit", function (e) {
        var q = inp.value.trim();
        if (!q) { e.preventDefault(); return; }
        rememberQuery(q);
        if (activeIdx > -1) e.preventDefault();
      });
    }
    // Footer accordions start closed on phones.
    if (window.matchMedia("(max-width: 640px)").matches) $$(".gfoot__grid ul").forEach(function (ul) { ul.classList.add("is-collapsed"); });
  }

  BS.on("cart", function (d) {
    updateBadge(d && d.type === "add");
    if (drawer && drawer.classList.contains("is-open")) renderDrawer();
  });
  window.addEventListener("storage", function (e) { if (e.key === "bs.cart") { updateBadge(); if (drawer && !drawer.hidden) renderDrawer(); } });

  // Phones: tuck the help button away near the top of the page and while scrolling down,
  // bring it back when the visitor scrolls up (where they look for help).
  function initHelpFloat() {
    var fl = $("[data-help-float]");
    if (!fl) return;
    var mq = window.matchMedia("(max-width: 640px)"), lastY = window.scrollY, ticking = false;
    function upd() {
      ticking = false;
      var y = window.scrollY, tuck = false;
      if (mq.matches) tuck = y < 480 || (y > lastY + 4);
      if (Math.abs(y - lastY) > 4 || y < 480) lastY = y;
      fl.classList.toggle("is-tucked", tuck);
    }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    if (mq.addEventListener) mq.addEventListener("change", upd);
    upd();
  }

  function init() {
    doc.documentElement.classList.remove("no-js");
    initHelpFloat();
    initHeader();
    updateBadge();
    BS.reveal();
    BS.shelf();
    if (params().get("search") === "1") openSearch();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
