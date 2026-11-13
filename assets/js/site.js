/* Bearingsetu storefront core: configuration, catalogue, price rules, search, quote list.
   No framework. UI wiring (header, drawer, toasts) is in ui.js; the API client is in api.js.
   Rule of the house: nothing is shown that the business has not entered. No price means "Quote". */
(function () {
  "use strict";
  var BS = (window.BS = window.BS || {});
  var doc = document;

  /* ---------------------------------------------------------------- utilities */
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }
  function own(o, k) { return o != null && k != null && Object.prototype.hasOwnProperty.call(o, k); }
  function inr(n, dec) {
    var v = Number(n) || 0;
    var d = dec === undefined ? (Math.round(v) === v ? 0 : 2) : dec;
    return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }
  function icon(name, cls) { return '<svg class="i' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="assets/icons.svg#i-' + name + '"/></svg>'; }
  function params() { return new URLSearchParams(location.search); }
  function deepMerge(a, b) {
    var out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    Object.keys(b || {}).forEach(function (k) {
      var v = b[k];
      if (v && typeof v === "object" && !Array.isArray(v) && a && typeof a[k] === "object" && !Array.isArray(a[k])) out[k] = deepMerge(a[k], v);
      else if (v !== undefined) out[k] = v;
    });
    return out;
  }
  BS.$ = $; BS.$$ = $$; BS.esc = esc; BS.inr = inr; BS.icon = icon; BS.debounce = debounce; BS.params = params; BS.plural = plural; BS.own = own; BS.deepMerge = deepMerge;
  BS.reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  BS.FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  BS.focusables = function (c) { return $$(BS.FOCUSABLE, c).filter(function (el) { return !el.hidden && el.offsetParent !== null; }); };
  BS.emit = function (name, detail) { doc.dispatchEvent(new CustomEvent("bs:" + name, { detail: detail })); };
  BS.on = function (name, fn) { doc.addEventListener("bs:" + name, function (e) { fn(e.detail); }); };

  /* ------------------------------------------------------------------ storage */
  var mem = {};
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem("bs." + k); return v == null ? (own(mem, k) ? mem[k] : d) : JSON.parse(v); } catch (e) { return own(mem, k) ? mem[k] : d; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { localStorage.setItem("bs." + k, JSON.stringify(v)); } catch (e) { /* private mode: memory only */ }
    },
    del: function (k) { delete mem[k]; try { localStorage.removeItem("bs." + k); } catch (e) { /* ignore */ } },
    list: function (k) { var v = store.get(k, []); return Array.isArray(v) ? v : []; }
  };
  BS.store = store;

  /* ------------------------------------------------------------ configuration */
  var DEFAULTS = {
    apiBase: "",
    business: { name: "Bearingsetu", legalName: "", gstin: "", addressLines: [], city: "", state: "", stateCode: "", pin: "", phone: "", whatsapp: "", email: "", supportEmail: "", hours: "" },
    pricing: { mode: "quote", gstRate: 18, showGstToggle: true },
    shipping: { mode: "quoted", flatFee: null, freeOver: null, note: "", leadTimeNote: "" },
    catalogue: { showIndicativePerformance: false }
  };
  BS.cfg = deepMerge(DEFAULTS, window.BS_CONFIG || {});
  BS.setConfig = function (remote) {
    // The admin panel's settings win over the static file, but never change where the API lives.
    var keep = BS.cfg.apiBase;
    BS.cfg = deepMerge(BS.cfg, remote || {});
    BS.cfg.apiBase = keep;
  };
  BS.biz = function () { return BS.cfg.business; };
  BS.gstRate = function () { return Number(BS.cfg.pricing.gstRate) || 18; };
  BS.contact = function () {
    var b = BS.cfg.business, digits = String(b.phone || "").replace(/[^\d+]/g, "");
    return {
      phone: b.phone || "", phoneHref: digits ? "tel:" + digits : "",
      whatsapp: String(b.whatsapp || "").replace(/\D/g, ""), email: b.email || b.supportEmail || "", hours: b.hours || ""
    };
  };
  BS.waLink = function (text) { var c = BS.contact(); return c.whatsapp ? "https://wa.me/" + c.whatsapp + "?text=" + encodeURIComponent(text || "") : ""; };
  BS.mailto = function (subject, body) { var c = BS.contact(); return c.email ? "mailto:" + c.email + "?subject=" + encodeURIComponent(subject || "") + "&body=" + encodeURIComponent(body || "") : ""; };
  // Which ways can a buyer reach the business right now? Used to explain what will happen to an enquiry.
  BS.hasDirectContact = function () { var c = BS.contact(); return !!(c.phone || c.whatsapp || c.email); };

  /* ---------------------------------------------------------------- catalogue */
  var CAT = window.BS_CATALOG || { categories: [], brands: [], products: [] };
  var byId, brandById, catById, hidden = {};
  BS.catalog = CAT;
  BS.products = CAT.products.slice();
  function indexCatalogue() {
    byId = Object.create(null); brandById = Object.create(null); catById = Object.create(null);
    CAT.categories.forEach(function (c) { catById[c.id] = c; });
    CAT.brands.forEach(function (b) { brandById[b.id] = b; });
    BS.products = CAT.products.filter(function (p) { return !hidden[p.id]; });
    BS.products.forEach(function (p) { byId[p.id] = p; });
  }
  indexCatalogue();
  BS.byId = function (id) { return id == null ? undefined : byId[id]; };
  BS.brand = function (id) { return (id != null && brandById[id]) || { id: id, name: String(id || "").toUpperCase() }; };
  BS.cat = function (id) { return id == null ? undefined : catById[id]; };
  BS.sub = function (catId, subId) { var c = catById[catId]; return c && c.subs ? c.subs.filter(function (s) { return s.id === subId; })[0] : undefined; };
  BS.brandsInUse = function () { var u = {}; BS.products.forEach(function (p) { u[p.brand] = (u[p.brand] || 0) + 1; }); return CAT.brands.filter(function (b) { return u[b.id]; }).map(function (b) { return Object.assign({ count: u[b.id] }, b); }); };
  // Navigation groups. The first three are the core range; the rest are supporting supplies.
  BS.GROUPS = [
    { id: "bearings", name: "Bearings", cats: ["ball-bearings", "roller-bearings", "housed-units"] },
    { id: "belts", name: "V-belts & pulleys", cats: ["belts-pulleys"] },
    { id: "seals", name: "Oil seals & O-rings", cats: ["seals"] },
    { id: "more", name: "Other industrial supplies", cats: ["lubrication", "power-transmission", "linear-motion", "mounting-tools"] }
  ];
  // Old links used group names as ?cat= values; keep them working.
  BS.catAlias = { bearings: ["ball-bearings", "roller-bearings", "housed-units"], transmission: ["belts-pulleys", "power-transmission"], lubrication: ["lubrication"], seals: ["seals"], belts: ["belts-pulleys"] };
  BS.resolveCats = function (v) {
    if (!v) return [];
    if (own(BS.catAlias, v) && !catById[v]) return BS.catAlias[v];
    return catById[v] ? [v] : [];
  };
  // The admin panel can add, change and hide products and brands. Static products keep working if the API is down.
  BS.applyCatalogOverlay = function (o) {
    if (!o) return;
    var up = (o.products && o.products.upsert) || [];
    var ids = {};
    up.forEach(function (p) { if (p && p.id) ids[p.id] = p; });
    CAT.products = (window.BS_CATALOG.products || []).filter(function (p) { return !own(ids, p.id); }).concat(up.filter(function (p) { return p && p.id && p.pn && p.cat; }));
    hidden = {};
    ((o.products && o.products.hide) || []).forEach(function (id) { hidden[id] = true; });
    (o.brands || []).forEach(function (b) {
      var i = CAT.brands.findIndex(function (x) { return x.id === b.id; });
      if (i >= 0) CAT.brands[i] = b; else CAT.brands.push(b);
    });
    indexCatalogue();
    buildIndex();
  };

  /* --------------------------------------------------------------- commercial */
  var commercial = Object.assign({}, window.BS_COMMERCIAL || {});
  BS.setCommercial = function (items) { commercial = Object.assign({}, window.BS_COMMERCIAL || {}, items || {}); };
  BS.com = function (p) { var c = p && commercial[p.id]; return c && !c.hidden ? c : null; };
  BS.priceMode = function () { return BS.cfg.pricing.mode === "list" ? "list" : "quote"; };
  function r2(n) { return Math.round(n * 100) / 100; }
  // Unit price ex GST for a quantity, or null when the business has not published one.
  BS.unitPrice = function (p, qty) {
    if (BS.priceMode() !== "list") return null;
    var c = BS.com(p);
    if (!c || c.price == null || !(c.price > 0)) return null;
    var price = c.price;
    (c.tiers || []).forEach(function (t) { if (qty >= t[0]) price = t[1]; });
    var a = BS.account && BS.account();
    if (a && a.status === "verified" && a.discountPct > 0) price = r2(price * (1 - a.discountPct / 100));
    return price;
  };
  BS.hasPrice = function (p) { return BS.unitPrice(p, 1) != null; };
  BS.withGst = function (n) { return r2(n * (1 + BS.gstRate() / 100)); };
  BS.gstInc = function () { return BS.cfg.pricing.showGstToggle && (store.get("prefs", {}) || {}).gst === "inc"; };
  BS.setGstInc = function (on) { var pr = store.get("prefs", {}) || {}; pr.gst = on ? "inc" : "ex"; store.set("prefs", pr); BS.emit("prefs", pr); };
  BS.moq = function (p) { var c = BS.com(p); return Math.max(1, (c && c.moq) || 1); };
  // Price markup, or a quiet "Quote" when there is no price. Never an invented number.
  BS.priceHTML = function (p, qty) {
    var u = BS.unitPrice(p, qty || 1);
    if (u == null) return '<span class="price price--quote">Quote on request</span>';
    var inc = BS.gstInc(), v = inc ? BS.withGst(u) : u;
    return '<span class="price"><strong class="num">' + inr(v, Math.round(v) === v ? 0 : 2) + "</strong><small> / " + esc(p.unit || "pc") + (inc ? " incl. GST" : " + GST") + "</small></span>";
  };
  // Availability only from entered data. null means "say nothing".
  BS.availability = function (p) {
    var c = BS.com(p);
    if (!c) return null;
    if (c.stock != null) {
      if (c.stock > 0) return { cls: "stock", text: "In stock" };
      return { cls: "stock stock--out", text: c.leadDays != null ? "Lead time " + c.leadDays + " working days" : "Out of stock, ask for lead time" };
    }
    if (c.leadDays != null) return { cls: "stock", text: "Lead time " + c.leadDays + " working days" };
    return null;
  };

  /* -------------------------------------------------------------- product facts */
  BS.name = function (p) { return BS.brand(p.brand).name + " " + p.pn; };
  BS.url = function (p) { return "product.html?id=" + encodeURIComponent(p.id); };
  BS.dims = function (p) {
    if (p.d == null) return "";
    return [p.d, p.D, p.B].filter(function (x) { return x != null; }).join(" × ") + " mm";
  };
  var SEAL = { Open: "Open", ZZ: "Shielded (ZZ)", "2RS": "Sealed (2RS)" };
  function plain(v) { return String(v == null ? "" : v).replace(/\s*\(.*?\)\s*/g, " ").trim(); }
  function attr(p, k) { var a = (p.attrs || []).filter(function (x) { return x[0] === k; })[0]; return a ? a[1] : ""; }
  // The few facts a buyer needs on a card, by product family.
  BS.chips = function (p) {
    var s = p.spec || {}, out = [], d = BS.dims(p);
    switch (p.sub) {
      case "classical-v": out.push("Section " + s.section, s.lengthMm ? "Inside length " + s.lengthMm + " mm" : ""); break;
      case "wedge-v": out.push("Section " + s.section, s.lengthMm ? s.lengthMm + " mm" : ""); break;
      case "timing": out.push(s.profile, s.lengthMm ? s.lengthMm + " mm" : "", s.widthMm ? s.widthMm + " mm wide" : ""); break;
      case "poly-v": out.push(s.profile, s.ribs ? s.ribs + " ribs" : "", s.lengthMm ? s.lengthMm + " mm" : ""); break;
      case "pulleys": out.push(s.section ? s.section + " section" : "", s.grooves ? s.grooves + " grooves" : "", s.pitchDiaMm ? "Ø" + s.pitchDiaMm + " mm" : ""); break;
      case "oil-seals": out.push(d, s.sealType, s.material); break;
      case "o-rings": out.push(plain(s.material)); break;
      case "pillow-block": case "flange": case "take-up": case "plummer-block": out.push(p.d ? p.d + " mm shaft" : "", plain(attr(p, "Locking"))); break;
      default:
        if (p.cat === "ball-bearings" || p.cat === "roller-bearings") {
          out.push(d);
          if (p.seal && SEAL[p.seal] && (p.cat === "ball-bearings")) out.push(SEAL[p.seal]);
          if (p.clr && p.clr !== "CN") out.push(p.clr + " clearance");
          if (s.contactAngle) out.push(s.contactAngle + "° contact");
        } else {
          if (d) out.push(d);
          if (p.pack) out.push(p.pack);
          else (p.attrs || []).slice(0, 2).forEach(function (a) { out.push(plain(a[1])); });
        }
    }
    return out.filter(Boolean).slice(0, 4);
  };

  /* ------------------------------------------------------------------- search */
  function norm(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, ""); }
  BS.norm = norm;
  var SYN = [
    [/\bv[\s-]?belts?\b/g, "v belt"], [/\bvbelts?\b/g, "v belt"], [/\bfan belts?\b/g, "v belt"],
    [/\b(oil|shaft|rotary)[\s-]?seals?\b/g, "oil seal"], [/\boilseals?\b/g, "oil seal"],
    [/\bdgbb\b/g, "deep groove"], [/\bo[\s-]?rings?\b/g, "o ring"], [/\bplummer\b/g, "plummer block"],
    [/\bpillowblocks?\b/g, "pillow block"], [/\btaper(ed)?[\s-]?roller\b/g, "tapered"], [/\btimingbelt\b/g, "timing belt"]
  ];
  function expand(q) { var s = String(q || "").toLowerCase(); SYN.forEach(function (r) { s = s.replace(r[0], r[1]); }); return s; }
  var SIZE_RE = /(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:[x×*]|\bby\b)\s*(\d+(?:\.\d+)?)(?:\s*(?:mm)?\s*(?:[x×*]|\bby\b)\s*(\d+(?:\.\d+)?))?/i;
  BS.parseSize = function (q) {
    var s = String(q || ""), m = s.match(SIZE_RE);
    if (!m) { var t = s.trim().match(/^(\d{1,3}(?:\.\d+)?)[\s,]+(\d{1,3}(?:\.\d+)?)(?:[\s,]+(\d{1,3}(?:\.\d+)?))?$/); if (t) m = t; }
    if (!m) return null;
    return { d: parseFloat(m[1]), D: parseFloat(m[2]), B: m[3] != null ? parseFloat(m[3]) : null };
  };
  function near(a, b) { return a != null && b != null && Math.abs(a - b) < 0.6; }
  var index = [];
  function buildIndex() {
    index = BS.products.map(function (p) {
      var b = BS.brand(p.brand).name, c = catById[p.cat], sub = BS.sub(p.cat, p.sub);
      return {
        p: p, pn: norm(p.pn), fam: norm(p.family || ""), brand: b.toLowerCase(), ord: CAT.categories.findIndex(function (x) { return x.id === p.cat; }) * 100 + (c && c.subs ? c.subs.findIndex(function (x) { return x.id === p.sub; }) : 0),
        eq: (p.eq || []).map(function (e) { return { raw: e, n: norm(e.replace(/^\S+\s+/, "")), full: norm(e) }; }),
        text: (b + " " + p.pn + " " + p.title + " " + (c ? c.name : "") + " " + (sub ? sub.name : "") + " " + (p.pack || "") + " " + (p.attrs || []).map(function (a) { return a[1]; }).join(" ")).toLowerCase()
          .replace(/\bv-belt/g, "v belt").replace(/o-ring/g, "o ring")
      };
    });
  }
  buildIndex();
  var BRAND_ALIAS = { schaeffler: "fag", jtekt: "koyo", indianoil: "servo" };
  function brandLead(words) {
    for (var i = 0; i < words.length; i++) {
      var w = BRAND_ALIAS[words[i]] || words[i];
      var hit = CAT.brands.filter(function (b) { return b.id === w || b.name.toLowerCase().split(/[\s(]/)[0] === w; })[0];
      if (hit) return { id: hit.id, at: i };
    }
    return null;
  }
  // Score every part against a query. Forgiving of spaces, hyphens, slashes and case in part numbers.
  BS.search = function (q, limit, opts) {
    q = String(q || "").trim();
    if (!q) return [];
    opts = opts || {};
    var size = BS.parseSize(q), nq = norm(q), ex = expand(q);
    var words = ex.split(/[^a-z0-9.]+/).filter(Boolean);
    var bl = brandLead(words);
    var restWords = bl ? words.filter(function (_, i) { return i !== bl.at; }) : words;
    var nRest = norm(restWords.join(""));
    var out = [];
    index.forEach(function (it) {
      var p = it.p, score = 0, via = null;
      if (opts.cat && p.cat !== opts.cat) return;
      if (size) {
        if (near(p.d, size.d) && near(p.D, size.D) && (size.B == null || near(p.B, size.B))) score = 90;
        else if ((p.cat === "seals" || p.sub === "oil-seals") && near(p.d, size.d) && near(p.D, size.D)) score = 80;
      }
      var tryNs = [nq]; if (bl && nRest.length >= 2) tryNs.push(nRest);
      tryNs.forEach(function (n) {
        if (n.length < 2) return;
        if (it.pn === n) score = Math.max(score, 100);
        else if (it.fam === n) score = Math.max(score, 88);
        else if (it.pn.indexOf(n) === 0) score = Math.max(score, 86 - Math.min(20, it.pn.length - n.length));
        else if (n.length >= 3 && it.pn.indexOf(n) > 0) score = Math.max(score, 55);
        it.eq.forEach(function (e) {
          if (e.n === n || e.full === n) { if (score < 84) { score = 84; via = e.raw; } }
          else if (n.length >= 4 && (e.n.indexOf(n) === 0 || e.full.indexOf(n) === 0)) { if (score < 60) { score = 60; via = e.raw; } }
        });
      });
      if (score < 40 && words.length) {
        var hits = 0;
        words.forEach(function (w) { if (it.text.indexOf(w) !== -1 || (w.length > 3 && it.text.replace(/[\s\-\/]/g, "").indexOf(w) !== -1)) hits++; });
        if (hits === words.length) score = Math.max(score, 30 + Math.min(20, hits * 5));
      }
      if (score > 0 && bl) score += p.brand === bl.id ? 4 : -6;
      if (score > 0) out.push({ p: p, score: score, via: via, ord: it.ord });
    });
    // Ties go to the more common part type first (ball before roller, deep groove first), then by part number.
    out.sort(function (a, b) { return b.score - a.score || a.ord - b.ord || (a.p.pn < b.p.pn ? -1 : a.p.pn > b.p.pn ? 1 : 0); });
    return limit ? out.slice(0, limit) : out;
  };
  // Autocomplete: products, categories, brands and a size shortcut.
  BS.suggest = function (q) {
    q = String(q || "").trim();
    var res = { products: [], cats: [], brands: [], size: null, total: 0 };
    if (!q) return res;
    var all = BS.search(q);
    res.total = all.length; res.products = all.slice(0, 6);
    var lq = expand(q).trim();
    CAT.categories.forEach(function (c) {
      if (c.name.toLowerCase().indexOf(lq) !== -1) res.cats.push({ name: c.name, href: "shop.html?cat=" + c.id });
      (c.subs || []).forEach(function (s) { if (lq.length >= 3 && s.name.toLowerCase().indexOf(lq) !== -1) res.cats.push({ name: s.name, parent: c.name, href: "shop.html?cat=" + c.id + "&sub=" + s.id }); });
    });
    res.cats = res.cats.slice(0, 4);
    if (lq.length >= 2) res.brands = BS.brandsInUse().filter(function (b) { return b.name.toLowerCase().indexOf(lq) !== -1; }).slice(0, 3);
    var sz = BS.parseSize(q);
    if (sz) {
      var n = all.filter(function (r) { return r.score >= 80; }).length;
      if (n) res.size = { label: sz.d + " × " + sz.D + (sz.B != null ? " × " + sz.B : "") + " mm", count: n, href: "shop.html?q=" + encodeURIComponent(q) };
    }
    return res;
  };

  /* Quick-order parser: one part per line, quantity at the end. "6205-2RS1 x 200", "B48 75", "22210 E 6 pcs" */
  BS.searchPart = function (part, limit) { return BS.search(part, limit || 10); };
  BS.parseLines = function (text) {
    return String(text || "").split(/\r?\n/).map(function (raw) { return raw.trim(); }).filter(Boolean).map(function (raw) {
      var line = raw.replace(/\s+/g, " "), part = line, qty = 1;
      var m = line.match(/^(.*?)(?:\s*[,;:\t×xX*=]\s*|\s+-\s+|\s+qty\s*|\s+)(\d{1,6})\s*(?:pcs?|nos?|units?|sets?|kits?)?\.?$/i);
      if (m && m[1] && /[A-Za-z0-9]/.test(m[1]) && (m[1].length > 2 || /\D/.test(m[1]))) { part = m[1].trim(); qty = parseInt(m[2], 10) || 1; }
      var res = BS.searchPart(part, 4), top = res[0];
      var status = !top ? "missing" : top.score >= 84 ? "found" : top.score >= 50 ? "check" : "missing";
      return { raw: raw, part: part, qty: qty, status: status, top: top ? top.p : null, via: top ? top.via : null, options: res.map(function (r) { return r.p; }) };
    });
  };

  /* --------------------------------------------------------------- quote list */
  // Lines are {key, id, qty} for catalogue parts, or {key, text, qty} for a part that is not listed.
  function readList() {
    return store.list("quote").filter(function (l) { return l && l.key && (l.text || byId[l.id]); }).map(function (l) {
      return { key: l.key, id: l.id || null, text: l.text || "", qty: Math.max(1, parseInt(l.qty, 10) || 1), p: l.id ? byId[l.id] : null };
    });
  }
  var list = {
    lines: readList,
    count: function () { return readList().length; },
    units: function () { return readList().reduce(function (n, l) { return n + l.qty; }, 0); },
    add: function (id, qty) {
      var p = byId[id]; if (!p) return null;
      qty = Math.max(BS.moq(p), parseInt(qty, 10) || 1);
      var lines = store.list("quote"), l = lines.filter(function (x) { return x.id === id; })[0];
      if (l) l.qty = Math.min(999999, (parseInt(l.qty, 10) || 0) + qty); else lines.push({ key: id, id: id, qty: qty });
      store.set("quote", lines); BS.emit("list", { type: "add", id: id }); return p;
    },
    addCustom: function (text, qty) {
      text = String(text || "").trim().slice(0, 200); if (!text) return null;
      var lines = store.list("quote"); lines.push({ key: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: text, qty: Math.max(1, parseInt(qty, 10) || 1) });
      store.set("quote", lines); BS.emit("list", { type: "add" }); return text;
    },
    set: function (key, qty) {
      var lines = store.list("quote"), l = lines.filter(function (x) { return x.key === key; })[0];
      if (!l) return;
      var p = l.id ? byId[l.id] : null;
      l.qty = Math.min(999999, Math.max(p ? BS.moq(p) : 1, parseInt(qty, 10) || 1));
      store.set("quote", lines); BS.emit("list", { type: "set", key: key });
    },
    remove: function (key) {
      var lines = store.list("quote"), i = lines.findIndex(function (x) { return x.key === key; });
      if (i < 0) return null;
      var gone = lines.splice(i, 1)[0]; store.set("quote", lines); BS.emit("list", { type: "remove", key: key }); return gone;
    },
    restore: function (line, pos) { var lines = store.list("quote"); lines.splice(Math.min(pos, lines.length), 0, line); store.set("quote", lines); BS.emit("list", { type: "add" }); },
    clear: function () { store.set("quote", []); BS.emit("list", { type: "clear" }); },
    // Priced subtotal (ex GST) only when the business publishes prices for every catalogue line.
    totals: function () {
      var lines = readList(), sub = 0, priced = 0;
      lines.forEach(function (l) { var u = l.p ? BS.unitPrice(l.p, l.qty) : null; if (u != null) { sub += u * l.qty; priced++; } });
      return { lines: lines, count: lines.length, units: lines.reduce(function (n, l) { return n + l.qty; }, 0), sub: r2(sub), priced: priced, allPriced: lines.length > 0 && priced === lines.length };
    }
  };
  BS.list = list;
  // Plain text version of the list for email, WhatsApp, copy and print.
  BS.listText = function (lines, contact) {
    var out = ["Quotation request"];
    if (contact) {
      [["Name", contact.name], ["Company", contact.company], ["GSTIN", contact.gstin], ["Phone", contact.phone], ["Email", contact.email], ["Delivery pincode", contact.pincode]].forEach(function (r) { if (r[1]) out.push(r[0] + ": " + r[1]); });
      if (contact.notes) out.push("Notes: " + contact.notes);
    }
    out.push("");
    lines.forEach(function (l, i) { out.push((i + 1) + ". " + (l.p ? BS.name(l.p) + " (" + l.p.title + ")" : l.text) + "  x " + l.qty); });
    return out.join("\n");
  };

  // Session account is provided by api.js; this stub keeps price rules working without it.
  BS.account = BS.account || function () { return null; };
  BS.creditApproved = function () { var a = BS.account(); return !!(a && a.status === "verified" && a.credit && a.credit.status === "approved"); };
})();
