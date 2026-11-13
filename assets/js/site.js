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
  // Own-property lookup, so ids such as "constructor" or "__proto__" never match Object.prototype.
  function own(o, k) { return o != null && k != null && Object.prototype.hasOwnProperty.call(o, k); }
  // Keyboard-focusable, visible elements inside a container.
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function focusables(container) {
    return container ? $$(FOCUSABLE, container).filter(function (el) { return el.offsetParent !== null || getComputedStyle(el).position === "fixed"; }) : [];
  }

  BS.$ = $; BS.$$ = $$; BS.esc = esc; BS.inr = inr; BS.icon = icon; BS.debounce = debounce; BS.params = params; BS.plural = plural;
  BS.own = own; BS.focusables = focusables;
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
  // false when the browser blocks site storage: the bag and saved data then last only until the page changes.
  BS.storageOK = (function () {
    try { localStorage.setItem("bs.__t", "1"); localStorage.removeItem("bs.__t"); return true; } catch (e) { return false; }
  })();

  function emit(name, detail) { doc.dispatchEvent(new CustomEvent("bs:" + name, { detail: detail })); }
  BS.emit = emit;
  BS.on = function (name, fn) { doc.addEventListener("bs:" + name, function (e) { fn(e.detail); }); };

  /* --------------------------------------------------------------- catalogue */
  // Null-prototype maps: a URL id such as "toString" or "__proto__" finds nothing.
  var byId = Object.create(null);
  CAT.products.forEach(function (p) { byId[p.id] = p; });
  var brandById = Object.create(null);
  CAT.brands.forEach(function (b) { brandById[b.id] = b; });
  var catById = Object.create(null);
  CAT.categories.forEach(function (c) { catById[c.id] = c; });

  BS.catalog = CAT;
  BS.products = CAT.products;
  BS.byId = function (id) { return id == null ? undefined : byId[id]; };
  BS.brand = function (id) { return (id != null && brandById[id]) || { id: id, name: String(id || "").toUpperCase() }; };
  BS.cat = function (id) { return id == null ? undefined : catById[id]; };

  /* Header sections. A category (or a group view such as shop.html?cat=bearings) maps to the
     data-nav key of the header link that should be highlighted. */
  BS.GROUPS = {
    bearings: { name: "Bearings", cats: ["ball-bearings", "roller-bearings", "housed-units"] },
    transmission: { name: "Transmission", cats: ["belts-pulleys", "power-transmission", "linear-motion"] }
  };
  var NAV_KEY = Object.create(null);
  [["bearings", BS.GROUPS.bearings.cats], ["transmission", BS.GROUPS.transmission.cats], ["seals", ["seals"]], ["lubrication", ["lubrication"]], ["tools", ["mounting-tools"]]].forEach(function (g) {
    NAV_KEY[g[0]] = g[0];
    g[1].forEach(function (c) { NAV_KEY[c] = g[0]; });
  });
  BS.navKey = function (cat) { return (cat != null && NAV_KEY[cat]) || "store"; };
  // Moves the header highlight. aria-current="page" only when the link points at this exact URL,
  // otherwise "true" (the section you are in). A falsy or unknown key clears it.
  BS.setNav = function (key) {
    var here = location.pathname.replace(/^.*\//, "") + location.search;
    $$("#gnav [data-nav]").forEach(function (a) {
      if (key && a.getAttribute("data-nav") === key) {
        var href = a.getAttribute("href") || "";
        a.setAttribute("aria-current", href === here || (href === "index.html" && here === "") ? "page" : "true");
      } else a.removeAttribute("aria-current");
    });
  };
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
  // An ex-GST amount as the visitor prefers to see it, and the matching label.
  BS.prefPrice = function (n) { return BS.prefs().gst === "inc" ? BS.withGst(n) : n; };
  BS.taxNote = function () { return BS.prefs().gst === "inc" ? "incl. GST" : "+ GST"; };
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
    if (!t || !own(FLAG, t)) return "";
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

  /* --------------------------------------------------------- business rules */
  // One seller identity for every quotation and invoice, wherever it is opened.
  BS.SELLER = {
    name: "Bearingsetu",
    lines: ["Bhosari MIDC", "Pune 411026, Maharashtra"],
    city: "Pune", pin: "411026",
    gstin: "27AAACB0000A1Z5",
    state: "Maharashtra", code: "27", stateLabel: "Maharashtra (27)",
    email: "orders@bearingsetu.com", support: "support@bearingsetu.com"
  };
  // The sample verified business account shown on account.html and used for 30-day credit.
  BS.ACCOUNT = {
    company: "Kaveri Spinning Mills Pvt Ltd", short: "Kaveri Spinning Mills", city: "Coimbatore", state: "Tamil Nadu", code: "33",
    gstin: "33AAFCK4821M1Z7", buyer: "Lakshmi Narayanan", first: "Lakshmi", role: "Maintenance Purchase",
    verified: true, limit: 200000, used: 53680, avail: 146320
  };
  function cleanGstin(g) { return String(g == null ? "" : g).replace(/\s+/g, "").toUpperCase(); }
  // 30-day credit is for verified business accounts only: the sample account, or an application
  // saved on this device whose status is "Verified" for the same GSTIN.
  BS.creditOK = function (gstin) {
    var g = cleanGstin(gstin);
    if (!g) return false;
    if (g === BS.ACCOUNT.gstin) return true;
    var app = store.get("bizApplication", null);
    return !!(app && typeof app === "object" && typeof app.status === "string" && app.status.trim().toLowerCase() === "verified" && cleanGstin(app.gstin) === g);
  };

  /* Amount in words, Indian system: "Rupees Eight hundred ninety-two and eight paise only". */
  var ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  var TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  function w99(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""); }
  function w999(n) { var h = Math.floor(n / 100), r = n % 100; return (h ? ONES[h] + " hundred" + (r ? " " : "") : "") + (r ? w99(r) : ""); }
  function words(n) {
    if (!n) return "zero";
    var out = [], cr = Math.floor(n / 1e7); n %= 1e7;
    var lk = Math.floor(n / 1e5); n %= 1e5;
    var th = Math.floor(n / 1000); n %= 1000;
    if (cr) out.push(words(cr) + " crore");
    if (lk) out.push(w99(lk) + " lakh");
    if (th) out.push(w99(th) + " thousand");
    if (n) out.push(w999(n));
    return out.join(" ");
  }
  BS.inWords = function (x) {
    x = Math.abs(Number(x) || 0);
    if (!isFinite(x) || x > 1e12) x = 0;
    var rs = Math.floor(x + 1e-9), ps = Math.round((x - rs) * 100);
    if (ps >= 100) { rs += 1; ps = 0; }
    var s = words(rs);
    return "Rupees " + s.charAt(0).toUpperCase() + s.slice(1) + (ps ? " and " + words(ps) + " paise" : "") + " only";
  };

  /* Dispatch and delivery dates. Working days are Monday to Saturday; every order ships from Pune.
     Delivery zones follow the table on policies.html#shipping. */
  function isWorking(d) { return d.getDay() !== 0; }
  function startOf(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function sameDay(a, b) { return startOf(a).getTime() === startOf(b).getTime(); }
  function at(d, h, m) { var x = new Date(d); x.setHours(h, m || 0, 0, 0); return x; }
  function addWorking(d, n) {
    var x = startOf(d);
    while (n > 0) { x.setDate(x.getDate() + 1); if (isWorking(x)) n--; }
    return x;
  }
  BS.isWorking = isWorking;
  BS.addWorking = addWorking;
  BS.sameDay = sameDay;

  var METRO = { "11": "Delhi", "56": "Bengaluru", "60": "Chennai", "50": "Hyderabad", "70": "Kolkata" };
  BS.transitDays = function (pin) {
    var s = String(pin == null ? "" : pin).replace(/\s+/g, "");
    if (!/^[1-9]\d{5}$/.test(s)) return null;
    var t = s.slice(0, 2);
    if (t === "41") return { days: 1, max: 1, zone: "pune", label: "Pune region" };
    if (t === "40" || t === "42" || t === "43" || t === "44") return { days: 2, max: 2, zone: "maharashtra", label: "Mumbai and the rest of Maharashtra" };
    if (own(METRO, t)) return { days: 2, max: 2, zone: "metro", label: METRO[t], city: METRO[t] };
    return { days: 4, max: 5, zone: "india", label: "Rest of India" };
  };

  // Dispatch and delivery dates for a set of lines ({p, qty} or {id, qty}). Order by 4 pm on a
  // working day and in-stock parts leave the same day. With a pincode, standard delivery uses
  // the zone's transit days; without one it spans every zone (1 to 5 working days).
  BS.schedule = function (lines, now, pin) {
    now = now ? new Date(now) : new Date();
    if (isNaN(now.getTime())) now = new Date();
    var cutoff = at(now, 16, 0);
    var beforeCutoff = isWorking(now) && now < cutoff;
    var base = beforeCutoff ? startOf(now) : addWorking(now, 1);
    var lead = 0, waiting = 0;
    (lines || []).forEach(function (l) {
      var p = l && (l.p || byId[l.id]);
      if (!p) return;
      var qty = parseInt(l.qty, 10) || 1;
      var days = p.stock >= qty ? (p.ship || 0) : Math.max(p.ship || 0, 7);
      if (days > 0) waiting++;
      lead = Math.max(lead, days);
    });
    var dispatch = lead ? addWorking(base, lead) : base;
    var open = at(now, 9, 30), close = at(now, 19, 0);
    var ready;
    if (!lead && isWorking(now) && now < open) ready = new Date(open.getTime() + 4 * 3600e3);
    else if (!lead && isWorking(now) && now.getTime() + 4 * 3600e3 <= close.getTime()) {
      ready = new Date(now.getTime() + 4 * 3600e3);
      ready.setMinutes(Math.ceil(ready.getMinutes() / 30) * 30, 0, 0);
    } else { ready = lead ? new Date(dispatch) : addWorking(now, 1); ready.setHours(13, 30, 0, 0); }
    var zone = BS.transitDays(pin);
    var from = zone ? zone.days : 1, to = zone ? zone.max : 5;
    return {
      now: now, cutoff: cutoff, beforeCutoff: beforeCutoff, lead: lead, waiting: waiting, dispatch: dispatch,
      sameDay: sameDay(dispatch, now),
      packedBy: at(dispatch, 16, 0),
      dispatchBy: at(dispatch, 18, 0),
      pin: zone ? String(pin).replace(/\s+/g, "") : "",
      zone: zone,
      standard: { from: addWorking(dispatch, from), to: addWorking(dispatch, to), days: from, max: to, known: !!zone },
      express: { on: addWorking(dispatch, 1), useful: !zone || zone.days > 1 },
      pickup: { ready: ready }
    };
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
          // Name the equivalent only when it is what matched, not when the part's own number did.
          if (e.n === nq || e.full === nq) { if (score < 84) { score = 84; via = e.raw; } }
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
    // pos: optional position for a line that is not in the bag yet (used by Undo).
    set: function (id, qty, pos) {
      qty = parseInt(qty, 10) || 0;
      var lines = readCart();
      if (qty <= 0) lines = lines.filter(function (x) { return x.id !== id; });
      else {
        var l = lines.filter(function (x) { return x.id === id; })[0];
        if (l) l.qty = qty;
        else if (pos >= 0 && pos < lines.length) lines.splice(pos, 0, { id: id, qty: qty });
        else lines.push({ id: id, qty: qty });
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
    if (!box) return { close: function () {}, el: null };
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
    // A toast with an action stays at least 10 seconds, and waits while it is pointed at or focused.
    var ms = Math.max(opts.ms || 4200, act ? 10000 : 0);
    var remaining = ms, started = Date.now(), hovered = false, focused = false, done = false;
    var timer = setTimeout(leave, ms);
    function pause() { if (timer) { clearTimeout(timer); timer = 0; remaining -= Date.now() - started; } }
    function resume() {
      if (done || hovered || focused || timer) return;
      started = Date.now();
      timer = setTimeout(leave, Math.max(remaining, 3000));
    }
    t.addEventListener("mouseenter", function () { hovered = true; pause(); });
    t.addEventListener("mouseleave", function () { hovered = false; resume(); });
    t.addEventListener("focusin", function () { focused = true; pause(); });
    t.addEventListener("focusout", function (e) { if (!t.contains(e.relatedTarget)) { focused = false; resume(); } });
    function leave() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      t.classList.add("is-leaving");
      setTimeout(function () { t.remove(); }, 320);
    }
    t._bsLeave = leave;
    return { close: leave, el: t };
  };
  // Dismiss every toast on screen (the bag drawer does this when it opens).
  BS.closeToasts = function () {
    $$("[data-toasts] .toast").forEach(function (t) { if (t._bsLeave) t._bsLeave(); else t.remove(); });
  };

  /* --------------------------------------------------------------- overlays */
  var lastFocus = null;
  // extra: focusable elements outside the container that belong to the same stop list (a toggle button).
  function trap(container, e, extra) {
    if (e.key !== "Tab") return;
    var f = (extra || []).concat(focusables(container));
    if (!f.length) return;
    // Focus that has slipped outside (or to <body>) comes back to the first or last stop.
    if (f.indexOf(doc.activeElement) === -1) { (e.shiftKey ? f[f.length - 1] : f[0]).focus(); e.preventDefault(); return; }
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
    // An "added to your bag" toast would sit over the drawer's buttons on phones.
    BS.closeToasts();
    lastFocus = doc.activeElement && doc.activeElement.closest && doc.activeElement.closest("#mmenu") ? $("[data-open-menu]") : doc.activeElement;
    undo = null;
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
    undo = null;
    setTimeout(function () { if (!drawer.classList.contains("is-open")) drawer.hidden = true; }, 500);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  BS.openCart = openCart;
  BS.closeCart = closeCart;

  // Progress to free dispatch. The threshold is before GST, so say so when prices show GST.
  function shipMeter(t) {
    if (!t.lines.length) return "";
    var pct = Math.min(100, Math.round((t.sub / BS.FREE_SHIP) * 100));
    var msg = t.gap > 0 ? "Add " + inr(Math.ceil(t.gap)) + " more" + (BS.prefs().gst === "inc" ? " (before GST)" : "") + " for free dispatch." : "Your order ships free.";
    return '<div class="stack" style="--stack:8px"><p class="small">' + msg + '</p><div class="progress' + (t.gap > 0 ? "" : " is-done") + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progress to free dispatch"><span style="width:' + pct + '%"></span></div></div>';
  }
  BS.shipMeter = shipMeter;

  /* The drawer follows the GST preference. When only quantities or prices change it updates the
     lines in place, so keyboard focus stays on the control that was used. After Remove it shows
     an inline Undo row inside the dialog, where keyboard and screen-reader users can reach it. */
  var undo = null, undone = null, focusUndo = false;
  function nameOf(p) { return BS.brand(p.brand).name + " " + p.pn; }
  function lineEl(root, id) { return $$("[data-line]", root).filter(function (el) { return el.getAttribute("data-line") === id; })[0] || null; }
  function linePrice(l, inc) {
    var g = inc ? BS.withGst : Number;
    return inr(g(l.total)) + "<small>" + l.qty + " × " + inr(g(l.unit)) + (inc ? " incl. GST" : " + GST") + "</small>";
  }
  function lineTier(l, inc) {
    var g = inc ? BS.withGst : Number, u = esc(BS.unitLabel(l.p)), nt = BS.nextTier(l.p, l.qty);
    return l.unit < l.p.price ? "Tier price " + inr(g(l.unit)) + " / " + u + " applied" : nt ? "Buy " + nt.qty + "+ for " + inr(g(nt.price)) + " / " + u : "";
  }
  function drawerLineHTML(l, inc) {
    var name = nameOf(l.p), tier = lineTier(l, inc);
    return '<div class="line" data-line="' + esc(l.id) + '">' +
      '<a class="line__img" href="' + BS.url(l.p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(l.p.img, { alt: "" }) + "</a>" +
      "<div>" +
        '<div class="line__top"><div><a class="line__t" href="' + BS.url(l.p) + '">' + esc(name) + '</a><p class="line__s">' + esc(l.p.title) + "</p></div>" +
        '<p class="line__p num" data-line-price>' + linePrice(l, inc) + "</p></div>" +
        '<p class="line__tier" data-line-tier' + (tier ? "" : " hidden") + ">" + tier + "</p>" +
        '<div class="line__row">' + stepperHTML(l.id, l.qty, "sm", null, name) +
        '<button class="textlink small line__rm" type="button" data-remove="' + esc(l.id) + '" aria-label="Remove ' + esc(name) + '">Remove</button></div>' +
      "</div></div>";
  }
  function undoHTML() {
    return '<div class="line line--undo" data-undo-row><p class="small">Removed <strong>' + esc(undo.name) + "</strong>.</p>" +
      '<button class="textlink small" type="button" data-undo aria-label="Undo removing ' + esc(undo.name) + '">Undo</button></div>';
  }
  function drawerFootHTML(t, inc) {
    var g = inc ? BS.withGst : Number;
    return shipMeter(t) +
      '<div class="sumrow"><span>' + (inc ? "Subtotal incl. GST" : "Subtotal before GST") + '</span><span class="num">' + inr(g(t.sub)) + "</span></div>" +
      (t.savings > 0 ? '<div class="sumrow small" style="color:var(--green)"><span>Volume savings included</span><span class="num">' + inr(g(t.savings)) + "</span></div>" : "") +
      '<div class="sumrow small muted"><span>' + (inc ? "Includes GST (18%). Dispatch is added at checkout." : "GST (18%) and dispatch are added at checkout.") + "</span></div>" +
      '<a class="btn btn--block" href="checkout.html">Check out</a>' +
      '<a class="btn btn--block btn--quiet" href="cart.html">View bag and get a quote</a>';
  }
  function setFoot(foot, html) {
    if (foot._html === html) return;
    var ae = doc.activeElement, href = ae && foot.contains(ae) ? ae.getAttribute("href") : null;
    foot.innerHTML = html;
    foot._html = html;
    if (href) { var a = $$("a", foot).filter(function (x) { return x.getAttribute("href") === href; })[0]; if (a) a.focus(); }
  }
  var KINDS = ['[data-step="1"]', '[data-step="-1"]', "input", "[data-remove]", ".line__t"];
  function renderDrawer() {
    var body = $("[data-cart-lines]"), foot = $("[data-cart-foot]");
    if (!body) return;
    var dr = drawer || $("#cart-drawer");
    var t = cart.totals(), inc = BS.prefs().gst === "inc";
    var title = $("#cart-drawer-title");
    if (title) title.textContent = t.count ? "Your bag (" + t.count + ")" : "Your bag";
    var ids = t.lines.map(function (l) { return l.id; }).join("|") + (undo ? "|undo:" + undo.id : "");
    if (t.lines.length && body.getAttribute("data-ids") === ids) {
      t.lines.forEach(function (l) {
        var row = lineEl(body, l.id);
        if (!row) return;
        $("[data-line-price]", row).innerHTML = linePrice(l, inc);
        var tier = lineTier(l, inc), te = $("[data-line-tier]", row);
        te.innerHTML = tier;
        te.hidden = !tier;
        var st = $("[data-stepper]", row), input = $("input", st), minus = $('[data-step="-1"]', st);
        if (String(input.value) !== String(l.qty)) input.value = l.qty;
        if (minus) setMinus(minus, input, l.qty <= minQty(st));
      });
      setFoot(foot, drawerFootHTML(t, inc));
      return;
    }
    // Lines were added or removed: rebuild, then put focus back on the equivalent control.
    var ae = doc.activeElement, keep = null;
    if (ae && ae !== body && body.contains(ae)) {
      var ln = ae.closest("[data-line]");
      keep = { id: ln ? ln.getAttribute("data-line") : null, kind: KINDS.filter(function (k) { return ae.matches(k); })[0] || null, undo: ae.matches("[data-undo]") };
    }
    var rows = t.lines.map(function (l) { return drawerLineHTML(l, inc); });
    if (undo) rows.splice(Math.min(undo.pos, rows.length), 0, undoHTML());
    if (!t.lines.length) {
      body.innerHTML = rows.join("") + '<div class="empty" style="margin:16px 0">' + icon("handbag") + "<h3>Your bag is empty</h3><p>Search by part number or size, or paste a whole list into Quick order.</p>" +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn btn--sm" href="shop.html">Shop parts</a><a class="btn btn--sm btn--quiet" href="quick-order.html">Quick order</a></div></div>';
      foot.innerHTML = "";
      foot._html = "";
      foot.hidden = true;
    } else {
      foot.hidden = false;
      body.innerHTML = rows.join("");
      setFoot(foot, drawerFootHTML(t, inc));
    }
    body.setAttribute("data-ids", t.lines.length ? ids : "");
    var target = null;
    if (focusUndo) target = $("[data-undo]", body);
    else if (keep) {
      var row = lineEl(body, keep.undo && undone ? undone : keep.id);
      if (row) {
        target = keep.undo ? $(".line__t", row) : keep.kind ? $(keep.kind, row) : null;
        if (!target || target.disabled) target = $("input", row);
      }
      if (!target) target = $(".line__t", body) || (dr && $("[data-close-cart]", dr));
    }
    focusUndo = false;
    undone = null;
    if (target) target.focus();
  }
  BS.renderDrawer = renderDrawer;

  function minQty(st) {
    var m = parseInt(st.getAttribute("data-min"), 10);
    if (m > 0) return m;
    var p = byId[st.getAttribute("data-stepper")];
    return Math.max(1, (p && p.moq) || 1);
  }
  // Disabling a focused minus button would drop keyboard focus to <body>, so focus moves to the input.
  function setMinus(minus, input, off) {
    var kb = off && doc.activeElement === minus && minus.matches(":focus-visible");
    minus.disabled = off;
    if (kb) input.focus();
  }
  // min defaults to the part's minimum order quantity (belts come in pairs, seals in fives).
  // name (optional) makes the labels specific: "Increase quantity of SKF 6205-2RS1".
  function stepperHTML(id, qty, size, min, name) {
    var p = byId[id];
    min = Math.max(1, min || (p && p.moq) || 1);
    var of = name ? " of " + esc(name) : "";
    return '<div class="stepper' + (size ? " stepper--" + esc(size) : "") + '" data-stepper="' + esc(id) + '"' + (min > 1 ? ' data-min="' + min + '"' : "") + ">" +
      '<button type="button" data-step="-1" aria-label="Decrease quantity' + of + '"' + (qty <= min ? " disabled" : "") + ">" + icon("minus") + "</button>" +
      '<input type="number" inputmode="numeric" min="' + min + '" max="99999" value="' + qty + '" aria-label="Quantity' + of + '">' +
      '<button type="button" data-step="1" aria-label="Increase quantity' + of + '">' + icon("plus") + "</button></div>";
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
    lastFocus = doc.activeElement && doc.activeElement.closest && doc.activeElement.closest("#mmenu") ? $("[data-open-menu]") : doc.activeElement;
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

  // The combobox points at the listbox only while one is on screen.
  function setListbox(on) {
    searchInput.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) searchInput.setAttribute("aria-controls", "search-results");
    else searchInput.removeAttribute("aria-controls");
  }
  function renderSearch() {
    var q = searchInput.value.trim();
    activeIdx = -1;
    searchInput.removeAttribute("aria-activedescendant");
    if (!q) {
      setListbox(false);
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
    setListbox(searchResults.length > 0);
    if (!searchResults.length) {
      searchBody.innerHTML = '<div class="search__group"><p class="search__empty">No exact match for “' + esc(q) + '”. Check the number, try the size as bore × outer × width, or ask us to source it.</p>' +
        '<div class="search__quick"><a class="chip chip--outline" href="tools.html?q=' + encodeURIComponent(q) + '#interchange">' + icon("arrows-left-right") + 'Find an equivalent</a><a class="chip chip--outline" href="quick-order.html?q=' + encodeURIComponent(q) + '#rfq">' + icon("paper-plane-tilt") + "Request a quote</a></div></div>";
      return;
    }
    var inc = BS.prefs().gst === "inc";
    searchBody.innerHTML = '<div class="search__group">' + head + '<ul class="search__results" id="search-results" role="listbox" aria-label="Search results">' +
      searchResults.map(function (r, i) {
        var p = r.p, b = BS.brand(p.brand), st = BS.stock(p);
        return '<li role="presentation"><a class="sres" id="sres-' + i + '" role="option" aria-selected="false" href="' + BS.url(p) + '" data-sres>' +
          '<span class="sres__img">' + BS.imgTag(p.img, { alt: "" }) + "</span>" +
          '<span class="sres__txt"><span class="sres__t">' + esc(b.name + " " + p.pn) + '</span><span class="sres__s">' + (r.via ? "Equivalent of " + esc(r.via) + " · " : "") + BS.subtitle(p) + "</span></span>" +
          '<span class="sres__p num">' + inr(inc ? BS.withGst(p.price) : p.price) + '<small class="sres__tax"> ' + (inc ? "incl. GST" : "+ GST") + '</small><small class="' + (p.stock ? (p.stock < 20 ? "is-low" : "") : "is-out") + '">' + esc(st.short) + "</small></span></a></li>";
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
  // Panel photos carry data-src and load on first intent (hover or focus on the trigger), not on every page.
  function loadMegaImgs(panel) {
    if (!panel) return;
    $$("img[data-src]", panel).forEach(function (img) {
      img.src = img.getAttribute("data-src");
      img.removeAttribute("data-src");
    });
  }
  function openMega(id, link) {
    clearTimeout(megaTimer);
    if (megaOpen && megaOpen.id === id) return;
    closeMega(true);
    var panel = doc.getElementById(id);
    if (!panel) return;
    loadMegaImgs(panel);
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
  /* The phone menu covers the page, so the page behind it is made inert while it is open and Tab
     cycles through the header and the menu only. */
  var menuOpen = false;
  var BEHIND_MENU = "main, [data-ribbon], #footer, [data-help-float]";
  function toggleMenu(force) {
    var m = $("#mmenu"), btn = $("[data-open-menu]");
    if (!m) return;
    menuOpen = force != null ? force : !menuOpen;
    $$(BEHIND_MENU).forEach(function (el) { if (menuOpen) el.setAttribute("inert", ""); else el.removeAttribute("inert"); });
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
  function trapMenu(e) {
    var gnav = $("#gnav");
    trap($("#mmenu"), e, focusables($(".gnav__in", gnav)));
  }

  /* --------------------------------------------------------- cart badge + fly */
  function updateBadge(bump) {
    var n = cart.count();
    $$("[data-cart-count]").forEach(function (el) {
      el.textContent = n > 99 ? "99+" : String(n);
      el.classList.toggle("is-on", n > 0);
    });
    $$("[data-open-cart]").forEach(function (b) {
      b.setAttribute("aria-label", "Bag, " + plural(n, "item"));
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
    // No "View bag" action on the bag page itself, or while the drawer is already open.
    var onBag = /(^|\/)cart\.html$/.test(location.pathname) || !!$("#cart-drawer.is-open");
    var note = BS.storageOK ? "" : " Your browser is blocking site storage, so the bag empties when you change page.";
    if (!opts.silent) BS.toast("<strong>" + esc(b.name + " " + p.pn) + "</strong> added to your bag." + note, onBag ? (note ? { ms: 10000 } : {}) : { label: "View bag", onAction: openCart });
  };

  /* ------------------------------------------------------------ scroll reveal */
  var io = "IntersectionObserver" in window && !reduceMotion ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        io.unobserve(e.target);
        // The block is nearly in place a moment later: check whether the help button now covers it.
        setTimeout(function () { BS.updateHelpFloat(); }, 350);
      }
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
      var before = readCart().map(function (x) { return x.id; });
      var pos = before.indexOf(rid);
      if (pos === -1 || !byId[rid]) return;
      undo = { id: rid, qty: readCart()[pos].qty, pos: pos, name: nameOf(byId[rid]) };
      focusUndo = true;
      cart.remove(rid);
      return;
    }
    if (t.closest("[data-undo]") && undo) {
      var u = undo;
      undo = null;
      undone = u.id;
      cart.set(u.id, u.qty, u.pos);
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
    if (minus) setMinus(minus, input, v <= min);
    var id = st.getAttribute("data-stepper");
    if (id && byId[id] && !st.hasAttribute("data-local")) cart.set(id, v);
  });

  doc.addEventListener("keydown", function (e) {
    // Cmd+K or Ctrl+K opens search. There is no single-key shortcut (WCAG 2.1.4).
    if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key || "").toLowerCase() === "k") {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === "Escape") {
      if (searchEl && searchEl.classList.contains("is-open")) closeSearch();
      else if (drawer && drawer.classList.contains("is-open")) closeCart();
      else if (megaOpen) { var l = megaOpen.link; closeMega(); l.focus(); }
      else if (menuOpen) {
        var mbtn = $("[data-open-menu]");
        toggleMenu(false);
        if (mbtn) mbtn.focus();
      }
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
    else if (menuOpen) trapMenu(e);
  });

  function initHeader() {
    var triggers = $$(".gnav__link[data-mega]");
    triggers.forEach(function (link) {
      var id = link.getAttribute("data-mega");
      var panel = doc.getElementById(id);
      link.setAttribute("aria-expanded", "false");
      link.setAttribute("aria-controls", id);
      link.addEventListener("mouseenter", function () {
        loadMegaImgs(panel);
        clearTimeout(megaTimer);
        megaTimer = setTimeout(function () { openMega(id, link); }, megaOpen ? 0 : 140);
      });
      link.addEventListener("mouseleave", function () { clearTimeout(megaTimer); });
      link.addEventListener("focus", function () {
        loadMegaImgs(panel);
        if (megaOpen && megaOpen.link !== link) closeMega();
      });
      link.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown" || (e.key === " " && !megaOpen)) {
          e.preventDefault();
          openMega(id, link);
          var first = $("a", panel);
          if (first) first.focus();
        } else if (e.key === "Tab" && !e.shiftKey && megaOpen && megaOpen.link === link) {
          // The panels sit after the header icons in the page, so step into the open panel here.
          var f = focusables(panel);
          if (f.length) { e.preventDefault(); f[0].focus(); }
        }
      });
      if (!panel) return;
      // Leaving the panel by keyboard continues along the main nav, not into the page.
      panel.addEventListener("keydown", function (e) {
        if (e.key !== "Tab" || !megaOpen || megaOpen.panel !== panel) return;
        var f = focusables(panel);
        if (!f.length) return;
        if (!e.shiftKey && doc.activeElement === f[f.length - 1]) {
          e.preventDefault();
          closeMega();
          var li = link.closest("li"), nextLi = li && li.nextElementSibling;
          var next = nextLi ? $("a, button", nextLi) : focusables($(".gnav__icons"))[0];
          (next || link).focus();
        } else if (e.shiftKey && doc.activeElement === f[0]) {
          e.preventDefault();
          link.focus();
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
    // The phone menu (and the inert page behind it) must not outlive a resize to the desktop header.
    var desk = window.matchMedia("(min-width: 1069px)");
    if (desk.addEventListener) desk.addEventListener("change", function () { if (desk.matches) closeMenu(); });
    // Footer accordions start closed on phones.
    if (window.matchMedia("(max-width: 640px)").matches) $$(".gfoot__grid ul").forEach(function (ul) { ul.classList.add("is-collapsed"); });
  }

  BS.on("cart", function (d) {
    // The inline Undo row lasts until the bag changes again.
    if (undo && !(d && d.type === "remove" && d.id === undo.id)) undo = null;
    updateBadge(d && d.type === "add");
    if (drawer && drawer.classList.contains("is-open")) renderDrawer();
  });
  // Prices in the drawer and in search follow the "+ GST / Incl. GST" preference.
  BS.on("prefs", function () {
    if (drawer && drawer.classList.contains("is-open")) renderDrawer();
    if (searchEl && searchEl.classList.contains("is-open") && searchInput) renderSearch();
  });
  window.addEventListener("storage", function (e) {
    if (e.key === "bs.cart") { undo = null; updateBadge(); if (drawer && drawer.classList.contains("is-open")) renderDrawer(); }
  });

  /* "Talk to a specialist" float. At every width it steps aside while it would cover a control or a
     price (anything matching FLOAT_AVOID; pages can mark more with data-float-avoid). On phones it
     also stays tucked near the top of the page, while reading down and after landing on a #section,
     and comes back when the visitor scrolls up. */
  var FLOAT_AVOID = "a, button, input, select, textarea, label, summary, [role=button], .seg, .pcard__price, .num, [class*='__price'], [class*='__total'], [data-float-avoid]";
  function initHelpFloat() {
    var fl = $("[data-help-float]");
    if (!fl) return;
    var mq = window.matchMedia("(max-width: 640px)");
    var lastY = window.scrollY, down = false, queued = false;
    var landed = location.hash.length > 1;
    function covers() {
      var r = fl.getBoundingClientRect();
      if (!r.width) return false;
      // Measure where the button rests, without the tuck or hover offset.
      var ty = 0;
      try { var tf = getComputedStyle(fl).transform; if (tf && tf !== "none") ty = new DOMMatrixReadOnly(tf).m42; } catch (e) { ty = 0; }
      // Sample a grid over the button plus a 3px rim, dense enough (about every 22px) that a narrow
      // button or link that slips between samples is still seen.
      var pad = 3, left = r.left - pad, right = r.right + pad, top = r.top - ty - pad, bottom = r.bottom - ty + pad;
      var cols = Math.max(3, Math.ceil((right - left) / 22) + 1), xs = [], ys = [top, (top + bottom) / 2, bottom];
      for (var c = 0; c < cols; c++) xs.push(left + ((right - left) * c) / (cols - 1));
      for (var i = 0; i < xs.length; i++) {
        for (var j = 0; j < ys.length; j++) {
          var x = xs[i], y = ys[j];
          if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
          var stack = doc.elementsFromPoint(x, y);
          for (var k = 0; k < stack.length; k++) {
            var el = stack[k];
            if (el === fl || fl.contains(el)) continue;
            if (el.closest(FLOAT_AVOID)) return true;
            break;
          }
        }
      }
      return false;
    }
    function upd() {
      queued = false;
      var y = window.scrollY, dy = y - lastY;
      if (Math.abs(dy) > 4) { down = dy > 0; if (!down) landed = false; lastY = y; }
      else if (y < 480) lastY = y;
      var tuck = (mq.matches && (landed || y < 480 || down)) || covers();
      fl.classList.toggle("is-tucked", tuck);
    }
    function queue() { if (!queued) { queued = true; requestAnimationFrame(upd); } }
    // While scrolling, check about eight times a second and once more when scrolling stops.
    var lastRun = 0, trail;
    function onScroll() {
      var now = Date.now();
      clearTimeout(trail);
      trail = setTimeout(queue, 140);
      if (now - lastRun > 120) { lastRun = now; queue(); }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", queue);
    if (mq.addEventListener) mq.addEventListener("change", queue);
    // Content that opens or closes under the button (accordions, tabs, results) without a scroll.
    doc.addEventListener("click", function () { setTimeout(queue, 0); setTimeout(queue, 450); });
    doc.addEventListener("keyup", function () { setTimeout(queue, 0); });
    // Blocks that slide into place (.reveal) or expand with a transition settle without a scroll.
    doc.addEventListener("transitionend", function (e) { if (e.target !== fl) queue(); }, true);
    window.addEventListener("load", queue);
    BS.updateHelpFloat = queue;
    upd();
  }
  BS.updateHelpFloat = function () {};

  function init() {
    var root = doc.documentElement;
    // If this script arrived late, the CSS failsafe has already shown every .reveal block: keep them shown.
    if (window.performance && performance.now() > 2500) $$(".reveal").forEach(function (el) { el.classList.add("is-in"); });
    root.classList.remove("no-js");
    root.classList.add("bs-ready");
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
