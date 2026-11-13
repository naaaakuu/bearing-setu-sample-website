/* Product page: product.html?id=<product id>
   Everything inside <main> is rendered here from the catalogue: gallery with a drawn
   section view, buy box (tier prices, variants, delivery date by pincode), overview,
   specifications, equivalents, fits-with bundle, reviews, questions and recently viewed.
   Variant changes re-render in place and update the URL with history.replaceState. */
(function () {
  "use strict";

  var main = document.querySelector("[data-pdp]");
  if (!main) return;
  var BS = window.BS;
  if (!BS || !BS.byId) { main.innerHTML = loadErrorHTML(); return; }

  var $ = BS.$, $$ = BS.$$, esc = BS.esc, inr = BS.inr, icon = BS.icon;
  var doc = document;
  var BEARING = { "ball-bearings": 1, "roller-bearings": 1 };
  var NAV_H = 52;
  var uid = 0;
  var S = { p: null, qty: 1, slide: 0, slides: [], pinTried: false, rvTried: false, lb: null, spy: "", recent: [] };

  /* ================================================================ helpers */
  function loadErrorHTML() {
    return '<div class="wrap pdp-top"><div class="empty pdp-error" role="alert">' +
      '<svg class="i" aria-hidden="true"><use href="assets/icons.svg#i-warning-circle"/></svg>' +
      '<h1 class="h3">This page did not load properly</h1>' +
      "<p>The product catalogue could not be read. Refresh the page to try again. If it keeps happening, write to support@bearingsetu.com.</p>" +
      '<div class="pdp-error__ctas"><button class="btn" type="button" onclick="location.reload()">Refresh</button><a class="btn btn--quiet" href="shop.html">Browse the store</a></div></div></div>';
  }
  function brandShort(p) { return BS.brand(p.brand).name.replace(/\s*\(.*\)$/, ""); }
  function fullName(p) { return brandShort(p) + " " + p.pn; }
  // Escaped text where each hyphenated token stays on one line ("6205-2RS1/C3" never splits at the hyphen).
  function keepTogether(s) { return esc(s).split(" ").map(function (w) { return /[-/]/.test(w) ? '<span class="nobr">' + w + "</span>" : w; }).join(" "); }
  function titleMain(p) { return String(p.title || "").split(",")[0]; }
  // Storage can hold anything (old versions, other tabs, manual edits). Reads that feed the page never throw.
  function safe(fn, fb) { try { var v = fn(); return v == null ? fb : v; } catch (e) { return fb; } }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function prefs() { return obj(safe(BS.prefs, {})); }
  function isInc() { return prefs().gst === "inc"; }
  function gstOf(n) { return isInc() ? BS.withGst(n) : n; }
  function money(n) { return inr(Math.round(gstOf(n) * 100) / 100); }
  function gstWord() { return isInc() ? "incl. GST" : "+ GST"; }
  function unitOf(p) { return BS.unitLabel(p); }
  var PLURAL = { pc: "pcs", box: "boxes" };
  function unitsOf(p, n) { var u = unitOf(p); return n === 1 ? u : PLURAL[u] || u + "s"; }
  function attr(p, name) { var a = (p.attrs || []).filter(function (x) { return x[0] === name; })[0]; return a ? a[1] : null; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function fmtNum(n) { return String(Math.round(n * 1000) / 1000); }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function minQty(p) { return Math.max(1, p.moq || 1); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function smooth() { return BS.reduceMotion ? "auto" : "smooth"; }
  function subOf(p) { return BS.sub(p.cat, p.sub); }
  function isDesk() { return window.innerWidth > 834; }
  // "Deep groove" -> "deep groove", but "O-rings" and "V-belts" keep their capitals.
  function lcFirst(s) { s = String(s || ""); return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  /* ================================================================ dates and delivery */
  // Dates come from BS.schedule, the engine checkout and order tracking use: order by 4 pm,
  // Monday to Saturday, for same-day dispatch from Pune, then the pincode's standard transit days.
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayLabel(d) { return DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()]; }
  function longDate(d) { return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
  function isoToDate(s) { var m = String(s).split("-"); return new Date(+m[0], +m[1] - 1, +m[2]); }
  function shipDays(p) { return p.stock > 0 ? p.ship || 0 : p.ship || 7; }
  // Dispatch and delivery for the quantity on screen (a quantity above the stock waits for sourcing).
  function plan(p, pin) { return BS.schedule([{ p: p, qty: S.qty }], null, pin); }
  var CITY = {
    "411": "Pune", "412": "Pune", "410": "Raigad", "413": "Solapur", "414": "Ahilyanagar", "415": "Satara", "416": "Kolhapur",
    "400": "Mumbai", "401": "Thane", "403": "Goa", "422": "Nashik", "431": "Chhatrapati Sambhajinagar", "440": "Nagpur",
    "110": "Delhi", "122": "Gurugram", "201": "Noida", "560": "Bengaluru", "600": "Chennai", "500": "Hyderabad",
    "700": "Kolkata", "380": "Ahmedabad", "382": "Gandhinagar", "395": "Surat", "390": "Vadodara", "360": "Rajkot",
    "641": "Coimbatore", "302": "Jaipur", "452": "Indore", "160": "Chandigarh", "141": "Ludhiana", "226": "Lucknow",
    "208": "Kanpur", "751": "Bhubaneswar", "682": "Kochi", "530": "Visakhapatnam", "831": "Jamshedpur"
  };
  function cityOf(pin) { var z = BS.transitDays(pin); return CITY[pin.slice(0, 3)] || (z && z.city) || ""; }
  function savedPin() { var v = String(prefs().pin || safe(function () { return BS.store.get("pin", ""); }, "")); return /^[1-9]\d{5}$/.test(v) ? v : ""; }
  function savePin(v) {
    var pr = prefs();
    pr.pin = v;
    BS.store.set("prefs", pr); // stored without emitting bs:prefs, which would re-price the page
    BS.store.set("pin", v);
  }
  function cutoffText(p) {
    var sch = plan(p);
    if (sch.lead) return "";
    if (sch.beforeCutoff) {
      var now = sch.now;
      var mins = Math.max(1, 16 * 60 - (now.getHours() * 60 + now.getMinutes()));
      var h = Math.floor(mins / 60), m = mins % 60;
      return "Order within " + (h ? h + " h " : "") + (m || !h ? m + " min " : "") + "for dispatch today.";
    }
    return "Order now for dispatch on " + dayLabel(sch.dispatch) + ".";
  }

  /* ================================================================ prices */
  function tierRows(p) {
    var tiers = p.tiers || [], min = minQty(p), rows = [];
    rows.push({ from: min, to: tiers.length ? tiers[0][0] - 1 : null, price: p.price });
    tiers.forEach(function (t, i) { rows.push({ from: t[0], to: tiers[i + 1] ? tiers[i + 1][0] - 1 : null, price: t[1] }); });
    return rows.filter(function (r) { return r.to == null || r.to >= r.from; });
  }
  function rangeLabel(r) { return r.to == null ? r.from + "+" : r.from === r.to ? String(r.from) : r.from + "–" + r.to; }
  function pctOff(a, b) { return Math.round((1 - a / b) * 100); }

  /* ================================================================ variants */
  var AXES = [["brand", "Brand"], ["seal", "Seal"], ["clr", "Clearance"]];
  var SEAL_ORDER = ["Open", "ZZ", "2RS"], CLR_ORDER = ["CN", "C2", "C3", "C4", "C5"];
  var SEAL_DESC = { Open: "Open, no seals or shields", ZZ: "Metal shields both sides", "2RS": "Rubber seals both sides" };
  var CLR_DESC = { CN: "Normal clearance", C3: "Greater than normal, for shafts that run warm", C4: "Greater than C3, for hot running", C2: "Less than normal" };
  var BRAND_ORDER = BS.catalog.brands.map(function (b) { return b.id; });
  var WEIGHT = { brand: 8, seal: 4, clr: 2, opt: 1 };

  function axisVal(x, key) { return key === "opt" ? x.pack || x.pn : x[key]; }
  function sortAxis(key, vals) {
    var ord = key === "brand" ? BRAND_ORDER : key === "seal" ? SEAL_ORDER : key === "clr" ? CLR_ORDER : null;
    return vals.slice().sort(function (a, b) {
      if (!ord) return 0;
      var ia = ord.indexOf(a), ib = ord.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }
  function variantModel(p) {
    var fam = BS.products.filter(function (x) { return x.family && x.family === p.family; });
    if (fam.length < 2) return null;
    var axes = [];
    AXES.forEach(function (a) {
      var vals = uniq(fam.map(function (x) { return axisVal(x, a[0]); }).filter(function (v) { return v != null; }));
      if (vals.length > 1) axes.push({ key: a[0], label: a[1], vals: sortAxis(a[0], vals) });
    });
    // Parts the axes above cannot tell apart (a 1 kg tin and an 18 kg pail) get one more axis.
    var groups = {};
    fam.forEach(function (x) { var k = axes.map(function (a) { return axisVal(x, a.key); }).join("|"); (groups[k] = groups[k] || []).push(x); });
    if (Object.keys(groups).some(function (k) { return groups[k].length > 1; })) {
      var allPack = fam.every(function (x) { return x.pack; });
      axes.push({ key: "opt", label: allPack ? "Pack" : "Model", vals: uniq(fam.map(function (x) { return axisVal(x, "opt"); })) });
    }
    return axes.length ? { fam: fam, axes: axes } : null;
  }
  function pickBest(list) {
    return list.slice().sort(function (a, b) { return (b.stock > 0) - (a.stock > 0) || a.price - b.price; })[0];
  }
  // What happens if the buyer picks `val` on axis `key`: the exact match, or the closest part.
  function chipTarget(model, p, key, val) {
    var cur = {};
    model.axes.forEach(function (a) { cur[a.key] = axisVal(p, a.key); });
    if (cur[key] === val) return { on: true, exact: true, target: p, changes: [] };
    var exact = model.fam.filter(function (x) {
      return model.axes.every(function (a) { return axisVal(x, a.key) === (a.key === key ? val : cur[a.key]); });
    });
    if (exact.length) return { on: false, exact: true, target: pickBest(exact), changes: [] };
    var cands = model.fam.filter(function (x) { return axisVal(x, key) === val; });
    function score(x) { var s = 0; model.axes.forEach(function (a) { if (a.key !== key && axisVal(x, a.key) === cur[a.key]) s += WEIGHT[a.key]; }); return s; }
    cands.sort(function (a, b) { return score(b) - score(a) || (b.stock > 0) - (a.stock > 0) || a.price - b.price; });
    var t = cands[0];
    var changes = model.axes.filter(function (a) { return a.key !== key && axisVal(t, a.key) !== cur[a.key]; }).map(function (a) {
      return { label: a.label, from: cur[a.key], to: axisVal(t, a.key), key: a.key };
    });
    return { on: false, exact: false, target: t, changes: changes };
  }
  function valLabel(key, v) { return key === "brand" ? BS.brand(v).name.replace(/\s*\(.*\)$/, "") : String(v); }

  /* ================================================================ specifications */
  var UNIT_RE = /^(mm|kN|N|kg|g|r\/min|°C|°|in|m|L|ml|kVA|V|bar|mm²\/s|Nm|N·m|%|kW|W|min)$/;
  function splitVal(v) {
    v = String(v);
    var m = v.match(/^([-+−]?\d[\d.,]*(?:\s*(?:to|x|×)\s*[-+−]?\d[\d.,]*)?)\s*(.*)$/);
    if (!m) return { v: v, u: "", more: "", text: true };
    var rest = m[2], um = rest.match(/^(\S+)\s*(.*)$/);
    var u = um ? um[1] : "", more = um ? um[2] : "";
    if (u && !UNIT_RE.test(u)) return { v: v, u: "", more: "", text: true };
    return { v: m[1].replace(/\s+x\s+/g, " × ").replace(/^-/, "−").replace(/ to -/, " to −"), u: u, more: more.replace(/^\((.*)\)$/, "$1"), text: false };
  }
  var STAT_FIRST = ["Section", "Profile", "NLGI grade", "ISO viscosity grade", "Belt section"];
  function dimStats(p) {
    var seal = p.cat === "seals";
    var lab = seal ? (p.sub === "o-rings" ? ["Inside diameter", "Outside diameter", "Cross-section"] : ["Shaft", "Housing bore", "Width"]) :
      ["Bore", "Outside diameter", p.sub === "tapered" ? "Total width" : p.sub === "thrust-ball" ? "Height" : "Width"];
    return [{ v: fmtNum(p.d), u: "mm", l: lab[0] }, { v: fmtNum(p.D), u: "mm", l: lab[1] }, { v: fmtNum(p.B), u: "mm", l: lab[2] }];
  }
  function statOf(name, val) { var s = splitVal(val); s.l = name; return s; }
  // Big numbers for the overview: bore, OD, width and load rating, or the attributes that matter most.
  function keyStats(p) {
    if (p.d && p.D && p.B && (BEARING[p.cat] || p.cat === "seals")) {
      var out = dimStats(p);
      var extra = ["Dynamic load rating (C)", "Temperature range", "Lip material", "Compound", "Material"];
      for (var i = 0; i < extra.length; i++) { var v = attr(p, extra[i]); if (v) { out.push(statOf(extra[i].replace(/ \(C\)$/, ""), v)); break; } }
      return out;
    }
    var picked = [];
    function has(a) { return picked.indexOf(a) !== -1; }
    STAT_FIRST.forEach(function (n) { var a = (p.attrs || []).filter(function (x) { return x[0] === n; })[0]; if (a && a[1].length <= 10) picked.push(a); });
    (p.attrs || []).forEach(function (a) {
      if (picked.length >= 4 || has(a) || /^(Weight|Pack|Mounting bolts|Bolt holes)$/.test(a[0])) return;
      if (!splitVal(a[1]).text && a[1].length <= 26) picked.push(a);
    });
    if (picked.length < 3) (p.attrs || []).forEach(function (a) { if (picked.length < 4 && !has(a) && a[1].length <= 18) picked.push(a); });
    if (picked.length < 3 && p.pack) picked.push(["Pack", p.pack]);
    return picked.slice(0, 4).map(function (a) { return statOf(a[0], a[1]); });
  }
  // Values for the "Key specifications" gallery slide (complements the drawing).
  function cardStats(p) {
    var names = BEARING[p.cat] ? ["Dynamic load rating (C)", "Static load rating (C0)", "Limiting speed", "Weight"] :
      p.cat === "seals" ? ["Lip material", "Compound", "Temperature range", "Spring", "Type"] : null;
    if (names) {
      var out = names.filter(function (n) { return attr(p, n); }).slice(0, 4).map(function (n) { return statOf(n.replace(/ \((C|C0)\)$/, " ($1)"), attr(p, n)); });
      if (out.length >= 2) return out;
    }
    return keyStats(p);
  }

  var G_DIM = /^(bore|shaft diameter|centre height|bolt hole centres|overall length|top width x height|inside length|pitch length|effective length|length|width|height|diameter|rail width|block width|rail height|hole pitch|size|sizes|inside diameter|cross-sections?|pitch diameter|pitch circle diameter|outside diameter|maximum bore|maximum bore of size|bore range|raceway diameter.*|shaft range|gripping width|effective arm length|sleeve width|minimum bore|bearing bore range|bearing od range|thread|for bearing bore|roller diameter|inner width|pitch|rib pitch|belt width|weight|total width.*|flange size|ribs|teeth|cone|cup|bush size)$/i;
  var G_PERF = /(load rating|limiting speed|breaking load|maximum speed|torque|withdrawal force|workpiece weight|^power$|maximum pressure|output per stroke|temperature range|viscosity|nlgi grade|misalignment|contact angle|capacity|dispensing period|preload)/i;
  var G_ORDER = /^(pack|supplied in|supplied with|includes|sold as|pieces|fits|suits bearings|fits locknuts|fits nut|case)$/i;
  function specGroups(p) {
    var dims = [], perf = [], design = [], order = [];
    var drawn = p.d && p.D && p.B && (BEARING[p.cat] || p.cat === "seals");
    if (drawn) {
      var ds = dimStats(p), sym = p.sub === "tapered" ? "T" : "B";
      if (!attr(p, "Total width (T)")) dims.push([ds[0].l + " (d)", mm(p.d)], [ds[1].l + " (D)", mm(p.D)], [ds[2].l + " (" + sym + ")", mm(p.B)]);
      else dims.push([ds[0].l + " (d)", mm(p.d)], [ds[1].l + " (D)", mm(p.D)]);
    }
    (p.attrs || []).forEach(function (a) {
      if (drawn && /^shaft x bore x width$|^size$/i.test(a[0])) return;
      if (G_ORDER.test(a[0])) order.push(a);
      else if (G_PERF.test(a[0])) perf.push(a);
      else if (G_DIM.test(a[0])) dims.push(a);
      else design.push(a);
    });
    var b = BS.brand(p.brand);
    var head = [["Part number", '<span class="mono">' + esc(p.pn) + "</span>", true], ["Brand", b.name + (b.origin ? " · " + b.origin : "")]];
    if (p.pack && !order.some(function (a) { return a[0] === "Pack"; })) head.push(["Pack", p.pack]);
    order = head.concat(order).concat([
      ["Sold per", unitOf(p)],
      ["Minimum order", minQty(p) + " " + unitsOf(p, minQty(p))],
      ["HSN code", '<span class="mono">' + esc(p.hsn || "") + "</span>", true],
      ["GST", (p.gst || 18) + "%"]
    ]);
    var dimsName = dims.some(function (a) { return /^weight$/i.test(a[0]); }) ? "Dimensions and weight" : "Dimensions";
    return [[dimsName, dims, "ruler"], ["Performance", perf, "gauge"], ["Design", design, "gear-six"], ["Ordering", order, "package"]].filter(function (g) { return g[1].length; });
  }
  function mm(n) { return fmtNum(n) + " mm"; }

  /* ================================================================ equivalents */
  // A listed equivalent has the same size, sealing and internal clearance as this part: a C3
  // bearing is never offered for a normal-clearance one, even when its number starts the same.
  function sameVal(a, b) { return a == null ? b == null : b != null && Math.abs(a - b) < 0.01; }
  function sameSpec(a, b) {
    if ((a.d != null || b.d != null) && !(sameVal(a.d, b.d) && sameVal(a.D, b.D) && sameVal(a.B, b.B))) return false;
    if ((a.seal || b.seal) && a.seal !== b.seal) return false;
    if ((BEARING[a.cat] || BEARING[b.cat] || a.clr || b.clr) && (a.clr || "CN") !== (b.clr || "CN")) return false;
    return true;
  }
  function brandIs(x, word) { return !!word && BS.brand(x.brand).name.toUpperCase().indexOf(word.toUpperCase()) === 0; }
  var eqCache = { id: null, rows: null };
  function eqRows(p) {
    if (eqCache.id === p.id) return eqCache.rows;
    var used = [p.id];
    // 1. The cross-references in the catalogue, matched to a stocked part when one fits exactly.
    var rows = (p.eq || []).map(function (e) {
      var m = String(e).match(/^(\S+)\s+(.+)$/);
      var bw = m ? m[1] : "", pn = m ? m[2] : String(e);
      var hit = null;
      BS.search(pn, 10).some(function (r) {
        if (used.indexOf(r.p.id) !== -1 || !brandIs(r.p, bw) || !sameSpec(r.p, p)) return false;
        if (BS.norm(r.p.pn) === BS.norm(pn) || r.score >= 84) { hit = r.p; return true; }
        return false;
      });
      if (hit) used.push(hit.id);
      return { brand: bw, pn: pn, p: hit };
    });
    // 2. Other brands' bearings of the same type, size, sealing and clearance, as the interchange finder lists them.
    if (BEARING[p.cat] && p.d != null) {
      BS.products.forEach(function (x) {
        if (used.indexOf(x.id) !== -1 || x.brand === p.brand || x.cat !== p.cat || x.sub !== p.sub || !sameSpec(x, p)) return;
        used.push(x.id);
        var open = rows.filter(function (r) { return !r.p && brandIs(x, r.brand); })[0];
        if (open) open.p = x;
        else rows.push({ brand: brandShort(x), pn: x.pn, p: x });
      });
    }
    eqCache = { id: p.id, rows: rows };
    return rows;
  }

  /* ================================================================ reviews */
  function catReviews(p) {
    var list = ((BS.catalog.reviews || {})[p.cat] || []).slice();
    list.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return list.slice(0, Math.min(list.length, p.reviews || 0));
  }
  // 5-to-1 star counts that average to p.rating, from a discretised bell curve. Same input, same bars.
  function distribution(rating, n) {
    if (!n) return [0, 0, 0, 0, 0];
    var sigma = 0.85;
    function weights(mu) { var w = []; for (var s = 1; s <= 5; s++) w.push(Math.exp(-Math.pow(s - mu, 2) / (2 * sigma * sigma))); return w; }
    function mean(w) { var t = 0, m = 0; w.forEach(function (x, i) { t += x; m += x * (i + 1); }); return m / t; }
    var lo = -6, hi = 14;
    for (var k = 0; k < 50; k++) { var mid = (lo + hi) / 2; if (mean(weights(mid)) < rating) lo = mid; else hi = mid; }
    var w = weights((lo + hi) / 2), tot = w.reduce(function (a, b) { return a + b; }, 0);
    var raw = w.map(function (x) { return x / tot * n; });
    var c = raw.map(Math.floor), left = n - c.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (x, i) { return [x - Math.floor(x), i]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, left).forEach(function (f) { c[f[1]]++; });
    return c; // index 0 = 1 star
  }
  function myReviews() { return obj(BS.store.get("myReviews", {})); }
  function helpfulMap() { return obj(BS.store.get("helpful", {})); }
  function initials(name) { return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(""); }

  /* ================================================================ questions */
  var FAQ = {
    "ball-bearings": [
      ["Should I choose C3 or normal (CN) clearance?", "C3 has more internal clearance than CN. Choose C3 for electric motors, fans and shafts that run warm or have a tight fit, because the inner ring grows more than the outer ring as it heats up. For gearboxes, pumps and general machines at normal temperature, CN is the default. If the old bearing is marked C3, replace it with C3."],
      ["What is the difference between 2RS and ZZ?", "2RS bearings have rubber contact seals on both sides. They keep out dust and water better and suit dirty or wet places. ZZ (also written 2Z) bearings have metal shields with a small gap, so they run with less friction and suit higher speeds in clean places. Both come greased for life."],
      ["How much grease is inside a sealed bearing?", "Sealed and shielded bearings are filled to about 25 to 35 percent of the free space with a general purpose lithium grease. Do not add more. Open bearings come lightly oiled against rust and must be greased or oiled when they are fitted."],
      ["Can I fit an FAG or NSK bearing in place of SKF?", "Yes, when the basic number and the suffixes match. An SKF 6205-2RS1, an FAG 6205-2RSR and an NSK 6205DDU share the same dimensions and sealing. Check the clearance (C3) and cage suffixes as well. The equivalents table on this page lists matching parts."]
    ],
    "roller-bearings": [
      ["Do tapered roller bearings come as a set?", "Yes. A metric tapered roller bearing such as a 30205 is sold as a cone (inner ring with rollers) and cup (outer ring) together. The two parts separate for fitting. Mount them in pairs and set the end play to the figure in your machine manual."],
      ["What do suffixes like E, ECP or J2/Q mean?", "They are the maker’s codes for internal design and cage. E and EC usually mean a higher capacity design, P a polyamide cage, M a brass cage and J a pressed steel cage. Our part number decoder on the tools page reads any number for you."],
      ["Can I replace a roller bearing with another brand?", "Yes, if the size, series and design match, for example 22210 E (SKF) and 22210-E1 (FAG). Match the clearance (C3 or C4) and the bore type, cylindrical or tapered (K suffix), before you swap."],
      ["Do roller bearings come greased?", "No. Open roller bearings are supplied with a light preservative oil. Grease or oil them when you fit them. The grease calculator on the tools page gives the quantity for your size."]
    ],
    "housed-units": [
      ["Can I replace only the bearing insert?", "Yes. The UC insert in a pillow block is sold separately and slides into the existing housing. Order the same insert number, for example UC 205 for a UCP 205, and check the housing for cracks before you refit."],
      ["How often should I regrease it?", "For normal speeds and clean conditions, add a few strokes of NLGI 2 grease every one to three months. Dusty or wet places need it more often. Stop when fresh grease shows at the seal; overfilling makes the bearing run hot."],
      ["Set screw or adapter sleeve locking?", "Set screws are quick to fit and suit shafts that turn in one direction. Adapter sleeve units hold better on long shafts and drives that reverse, and they do not mark the shaft."],
      ["Does the unit arrive ready to fit?", "Yes. It arrives assembled and greased, with the insert in the housing and a grease nipple fitted. Mounting bolts are not included."]
    ],
    "belts-pulleys": [
      ["How do I measure a V-belt?", "Read the code printed on the belt, for example B43. If it has worn off, measure the top width to find the section (A is 13 mm, B is 17 mm, C is 22 mm), then measure the inside length with a tape. The belt calculator on the tools page works it out from your pulley sizes."],
      ["Do I need a matched set?", "On drives with two or more belts, yes. Belts that differ slightly in length share the load unevenly and wear out early. Order all the belts for one drive together and we send them from the same batch."],
      ["What is the difference between inside length and pitch length?", "Inside length is measured along the bottom of the belt. Pitch length is measured at the cord line and is the length drive calculations use. For a B section belt the pitch length is about 43 mm more than the inside length."],
      ["Can I replace classical belts with wedge belts?", "Only if you change the pulleys too. Wedge belts carry more power in less width, but the groove sizes differ. Send us the motor power and pulley sizes and we will size the drive for you."]
    ],
    "seals": [
      ["How do I measure an oil seal?", "Measure the shaft diameter, the housing bore and the seal width in millimetres. A 25 x 52 x 7 seal fits a 25 mm shaft in a 52 mm bore and is 7 mm wide. If the old seal is worn, measure the shaft and the housing, not the seal."],
      ["What do TC and SC mean?", "TC is a double lip seal with a rubber covered outside diameter; the extra lip keeps dust out. SC has a single lip. Both have a garter spring that keeps the lip pressed on the shaft."],
      ["NBR or Viton (FKM)?", "NBR (nitrile) suits mineral oils and greases up to about 100 °C and covers most gearboxes and pumps. Choose FKM for temperatures up to about 200 °C, or for synthetic oils and chemicals."],
      ["Which way should the lip face?", "The spring side faces the oil or grease you want to keep in. The dust lip, if there is one, faces the outside."]
    ],
    "lubrication": [
      ["What is the shelf life?", "Unopened greases keep for about five years and oils for about three years from the date of manufacture when stored indoors, away from heat and sunlight. The date is printed on every pack. Close opened packs and keep the lids clean."],
      ["Can I mix two different greases?", "Avoid it. Greases with different thickeners, for example lithium and polyurea, can soften or harden when mixed. When you change grease, clean out the old grease first or purge it with plenty of the new one."],
      ["How much grease does a bearing need?", "A common rule is grams = 0.005 x outside diameter x width, both in mm. A 6205 bearing (52 x 15 mm) needs about 4 g at each regreasing. The grease calculator on the tools page does the sum for any size."],
      ["How are greases and oils shipped?", "By road, in sealed packs inside an outer carton. Aerosols are not sent by air. Pails and drums can take one extra day to reach you."]
    ],
    "power-transmission": [
      ["How do I find my chain size?", "Measure the pitch from the centre of one pin to the next: 9.525 mm is 06B, 12.7 mm is 08B and 15.875 mm is 10B. Then count the rows of rollers for simplex (1), duplex (2) or triplex (3)."],
      ["Can I cut the chain to length?", "Yes. Our chains come in 5 m boxes with one connecting link. Use a chain breaker to remove pins. For an odd number of links you also need an offset (cranked) link."],
      ["How do I choose a jaw coupling spider?", "NBR spiders suit most motors and pumps and absorb shock well. Choose Hytrel for higher torque or urethane for a stiffer drive. The hub size, for example L-095, must be the same on both sides."],
      ["Do sprockets come with a bore?", "Most of our sprockets have a pilot bore so you can bore and keyway them to suit your shaft. Taper bore versions take a taper-lock bush."]
    ],
    "linear-motion": [
      ["Can I buy the block and the rail separately?", "Yes, within the same series and size. An HGH20 block fits any HGR20 rail. Interchangeable blocks and rails of the same accuracy class can be mixed."],
      ["Which preload should I choose?", "Light preload (Z0) suits most CNC routers and handling systems. Medium preload gives more rigidity for milling and heavy loads, at slightly higher friction."],
      ["How do I lubricate linear guides?", "Add grease through the block’s grease nipple about every 100 km of travel, or every three months in normal use. Use a lithium NLGI 2 grease unless the machine maker asks for something else."],
      ["Can shafts be cut to length?", "Shafts are sold in standard lengths. For custom lengths and end machining, request a quote and attach a sketch."]
    ],
    "mounting-tools": [
      ["Why use an induction heater instead of an oil bath?", "A heater warms the bearing evenly to about 110 °C in minutes, without oil smoke or dirt, and stops at the set temperature. It also demagnetises the bearing when it is done."],
      ["Which puller size do I need?", "Check two figures. The part’s outside diameter must fit inside the gripping width, and the puller force should be more than the force needed to remove the part. For motor bearings up to about 6310, a 60 kN puller is enough."],
      ["Do tools come with a warranty?", "Tools carry the manufacturer’s warranty against defects, with your GST invoice as proof of purchase. Keep the invoice and contact support if you need to make a claim."],
      ["Can someone help us choose the right size?", "Yes. Request a call back and a parts specialist will go through your bearing sizes and plant setup with you, Monday to Saturday, 9:30 am to 7 pm."]
    ]
  };

  /* ================================================================ technical drawing */
  function canDraw(p) { return !!(p.d && p.D && p.B && p.D > p.d && (BEARING[p.cat] || p.sub === "oil-seals" || p.sub === "o-rings")); }
  function drawKind(p) {
    if (p.sub === "o-rings") return "oring";
    if (p.cat === "seals") return "seal";
    switch (p.sub) {
      case "tapered": return "taper";
      case "cylindrical": return "cyl";
      case "needle": return /without inner ring|drawn cup/i.test(p.title) || /^H?K/.test(p.pn) ? "needle" : "needle-ir";
      case "spherical": return "sph";
      case "thrust-ball": return "thrust";
      case "self-aligning": return "ball2";
      default: return "ball";
    }
  }
  function f1(n) { return Math.round(n * 10) / 10; }
  function annulus(cx, cy, ro, ri) {
    function c(r) { return "M" + f1(cx - r) + " " + f1(cy) + "a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(2 * r) + " 0a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(-2 * r) + " 0Z"; }
    return c(ro) + (ri > 0 ? c(ri) : "");
  }
  function rect(x, y, w, h) { return "M" + f1(x) + " " + f1(y) + "h" + f1(w) + "v" + f1(h) + "h" + f1(-w) + "Z"; }

  // Front view and section view of the part, to the catalogue d / D / B.
  function drawingSVG(p, opts) {
    opts = opts || {};
    var k = ++uid, gS = "dws" + k, gB = "dwb" + k, gR = "dwr" + k, gH = "dwh" + k;
    var kind = drawKind(p);
    var d = p.d, D = p.D, B = p.B;
    var cy = 236, fx = 205, sx = 560;
    var s = 300 / D, R = D / 2 * s, r = d / 2 * s, gap = R - r;
    var w = Math.max(44, Math.min(176, B * s)), x0 = sx - w / 2, x1 = sx + w / 2;
    var steel = 'fill="url(#' + gS + ')"', hatch = 'fill="url(#' + gH + ')"', rubber = 'fill="#2d3038"';
    var front = "", half = "";
    var ringT = gap * 0.24;
    var pr = (R + r) / 2;

    /* ---- front view */
    var cl = '<path class="dw-cl" d="M' + f1(fx - R - 20) + " " + cy + "H" + f1(fx + R + 20) + "M" + fx + " " + f1(cy - R - 20) + "V" + f1(cy + R + 20) + '"/>';
    if (kind === "seal") {
      front += '<path d="' + annulus(fx, cy, R, r) + '" fill-rule="evenodd" ' + rubber + ' class="dw-o"/>' +
        '<circle cx="' + fx + '" cy="' + cy + '" r="' + f1(R - gap * 0.18) + '" class="dw-hid"/>' +
        '<circle cx="' + fx + '" cy="' + cy + '" r="' + f1(r + gap * 0.34) + '" class="dw-hid"/>' +
        '<circle cx="' + fx + '" cy="' + cy + '" r="' + f1(r + 1.5) + '" fill="none" stroke="#6b7079" stroke-width="1"/>';
    } else if (kind === "oring") {
      front += '<path d="' + annulus(fx, cy, R, r) + '" fill-rule="evenodd" ' + rubber + ' class="dw-o"/>' +
        '<circle cx="' + fx + '" cy="' + cy + '" r="' + f1(pr) + '" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="' + f1(gap * 0.32) + '"/>';
    } else if (kind === "thrust") {
      front += '<path d="' + annulus(fx, cy, R, r) + '" fill-rule="evenodd" ' + steel + ' class="dw-o"/>' +
        '<circle cx="' + fx + '" cy="' + cy + '" r="' + f1(R - gap * 0.1) + '" fill="none" class="dw-o"/>' +
        '<circle cx="' + fx + '" cy="' + cy + '" r="' + f1(r + gap * 0.1) + '" fill="none" class="dw-o"/>';
    } else {
      var noInner = kind === "needle";
      var rings = '<path d="' + annulus(fx, cy, R, R - ringT) + '" fill-rule="evenodd" ' + steel + ' class="dw-o"/>' +
        (noInner ? "" : '<path d="' + annulus(fx, cy, r + ringT, r) + '" fill-rule="evenodd" ' + steel + ' class="dw-o"/>');
      var inner = noInner ? r : r + ringT;
      if (p.seal === "2RS") {
        front += rings;
        front += '<path d="' + annulus(fx, cy, R - ringT, inner) + '" fill-rule="evenodd" ' + rubber + ' class="dw-o"/>' +
          '<circle cx="' + fx + '" cy="' + cy + '" r="' + f1((R - ringT + inner) / 2) + '" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.5"/>';
      } else if (p.seal === "ZZ") {
        front += rings + '<path d="' + annulus(fx, cy, R - ringT, inner) + '" fill-rule="evenodd" fill="#d5d9df" class="dw-o"/>' +
          '<circle cx="' + fx + '" cy="' + cy + '" r="' + f1(inner + (R - ringT - inner) * 0.22) + '" fill="none" stroke="#9aa1ab" stroke-width="1"/>';
      } else {
        // Rolling elements sit in the raceways, so the ring faces overlap them slightly (drawn on top).
        var space = (R - ringT) - inner, mid = inner + space / 2;
        var er = noInner ? space / 2 * 0.86 : Math.min(gap * 0.29, space / 2 * 1.12);
        var n = Math.max(6, Math.round(2 * Math.PI * mid / (er * 2 * (noInner ? 1.35 : 1.55))));
        front += '<circle cx="' + fx + '" cy="' + cy + '" r="' + f1(mid) + '" fill="none" stroke="#b9bec6" stroke-width="' + f1(er * 0.7) + '" opacity=".35"/>';
        for (var i = 0; i < n; i++) {
          var a = (i / n) * Math.PI * 2 - Math.PI / 2;
          front += '<circle cx="' + f1(fx + Math.cos(a) * mid) + '" cy="' + f1(cy + Math.sin(a) * mid) + '" r="' + f1(er) + '" fill="url(#' + gB + ')" stroke="#59606b" stroke-width=".8"/>';
        }
        front += rings;
      }
    }

    /* ---- section view, upper half (mirrored for the lower half) */
    var yO = cy - R, yI = cy - r, yF = yO + ringT, yF2 = yI - ringT, by = cy - pr;
    function ring(path) { return '<path d="' + path + '" ' + steel + ' class="dw-o"/><path d="' + path + '" ' + hatch + ' opacity=".55"/>'; }
    if (kind === "ball") {
      var ballR = Math.min((gap - 2 * ringT) / 2 * 1.12, w / 2 - 3);
      var gr = ballR * 1.04, dy = by - yF, hc = gr > dy ? Math.sqrt(gr * gr - dy * dy) : 0;
      var outer = "M" + f1(x0) + " " + f1(yO) + "H" + f1(x1) + "V" + f1(yF) + (hc ? "H" + f1(sx + hc) + "A" + f1(gr) + " " + f1(gr) + " 0 0 0 " + f1(sx - hc) + " " + f1(yF) : "") + "H" + f1(x0) + "Z";
      var innerP = "M" + f1(x0) + " " + f1(yI) + "H" + f1(x1) + "V" + f1(yF2) + (hc ? "H" + f1(sx + hc) + "A" + f1(gr) + " " + f1(gr) + " 0 0 1 " + f1(sx - hc) + " " + f1(yF2) : "") + "H" + f1(x0) + "Z";
      half += ring(outer) + ring(innerP) + '<circle cx="' + sx + '" cy="' + f1(by) + '" r="' + f1(ballR) + '" fill="url(#' + gB + ')" stroke="#59606b" stroke-width=".9"/>';
      var sw = Math.max(3, w * 0.075);
      if (p.seal === "2RS") {
        var seal = "M" + f1(x0 + 1.2) + " " + f1(yF - 0.5) + "h" + f1(sw) + "V" + f1(yF2 - 4) + "l3 3.5H" + f1(x0 + 1.2) + "Z";
        half += '<path d="' + seal + '" ' + rubber + '/><path d="' + seal + '" ' + rubber + ' transform="matrix(-1 0 0 1 ' + f1(2 * sx) + ' 0)"/>';
      } else if (p.seal === "ZZ") {
        var sh = rect(x0 + 1.5, yF, Math.max(2, w * 0.035), (yF2 - gap * 0.07) - yF);
        half += '<path d="' + sh + '" fill="#c3c8d1" stroke="#59606b" stroke-width=".6"/><path d="' + sh + '" fill="#c3c8d1" stroke="#59606b" stroke-width=".6" transform="matrix(-1 0 0 1 ' + f1(2 * sx) + ' 0)"/>';
      }
    } else if (kind === "ball2" || kind === "sph") {
      var Rs = R - ringT;
      function yArc(x) { return cy - Math.sqrt(Rs * Rs - (x - sx) * (x - sx)); }
      var outerS = "M" + f1(x0) + " " + f1(yO) + "H" + f1(x1) + "V" + f1(yArc(x1)) + "A" + f1(Rs) + " " + f1(Rs) + " 0 0 0 " + f1(x0) + " " + f1(yArc(x0)) + "Z";
      var ribH = kind === "sph" ? (gap - 2 * ringT) * 0.24 : 0;
      var innerS = "M" + f1(x0) + " " + f1(yI) + "H" + f1(x1) + "V" + f1(yF2) + (ribH ? "H" + f1(sx + w * 0.045) + "V" + f1(yF2 - ribH) + "H" + f1(sx - w * 0.045) + "V" + f1(yF2) : "") + "H" + f1(x0) + "Z";
      half += ring(outerS) + ring(innerS);
      var off = w * 0.24;
      if (kind === "sph") {
        var rx = w * 0.215, ry = (gap - 2 * ringT) / 2 * 0.84, ey = by - gap * 0.01;
        half += '<ellipse cx="' + f1(sx - off) + '" cy="' + f1(ey) + '" rx="' + f1(rx) + '" ry="' + f1(ry) + '" transform="rotate(12 ' + f1(sx - off) + " " + f1(ey) + ')" fill="url(#' + gR + ')" stroke="#59606b" stroke-width=".9"/>' +
          '<ellipse cx="' + f1(sx + off) + '" cy="' + f1(ey) + '" rx="' + f1(rx) + '" ry="' + f1(ry) + '" transform="rotate(-12 ' + f1(sx + off) + " " + f1(ey) + ')" fill="url(#' + gR + ')" stroke="#59606b" stroke-width=".9"/>';
      } else {
        var br2 = Math.min((gap - 2 * ringT) / 2 * 1.02, w * 0.22);
        half += '<circle cx="' + f1(sx - off) + '" cy="' + f1(by) + '" r="' + f1(br2) + '" fill="url(#' + gB + ')" stroke="#59606b" stroke-width=".9"/>' +
          '<circle cx="' + f1(sx + off) + '" cy="' + f1(by) + '" r="' + f1(br2) + '" fill="url(#' + gB + ')" stroke="#59606b" stroke-width=".9"/>';
      }
    } else if (kind === "cyl" || kind === "needle" || kind === "needle-ir") {
      var rollTop = yF, rollBot = kind === "needle" ? yI : yF2;
      var ribW = w * 0.12, ribHh = (rollBot - rollTop) * 0.34;
      var outerC = "M" + f1(x0) + " " + f1(yO) + "H" + f1(x1) + "V" + f1(yF + ribHh) + "H" + f1(x1 - ribW) + "V" + f1(yF) + "H" + f1(x0 + ribW) + "V" + f1(yF + ribHh) + "H" + f1(x0) + "Z";
      half += ring(outerC);
      if (kind !== "needle") half += ring(rect(x0, yF2, w, ringT));
      var rw = w - 2 * ribW - 4;
      half += '<rect x="' + f1(sx - rw / 2) + '" y="' + f1(rollTop + 0.6) + '" width="' + f1(rw) + '" height="' + f1(rollBot - rollTop - 1.2) + '" rx="2.5" fill="url(#' + gR + ')" stroke="#59606b" stroke-width=".9"/>';
    } else if (kind === "taper") {
      var t1 = ringT * 0.55, t2 = ringT * 1.25, c1 = ringT * 1.0, c2 = ringT * 0.95;
      function cupY(u) { return yO + t1 + (t2 - t1) * u; }
      function coneY(u) { return yI - c1 + (c1 - c2) * u; }
      var cup = "M" + f1(x0) + " " + f1(yO) + "H" + f1(x1) + "V" + f1(cupY(1)) + "L" + f1(x0) + " " + f1(cupY(0)) + "Z";
      var ribL = (coneY(0) - cupY(0)) * 0.32;
      var cone = "M" + f1(x0) + " " + f1(yI) + "H" + f1(x1) + "V" + f1(coneY(1)) + "L" + f1(x0 + w * 0.13) + " " + f1(coneY(0.13)) + "V" + f1(coneY(0.13) - ribL) + "H" + f1(x0) + "Z";
      half += ring(cup) + ring(cone);
      var u0 = 0.155, u1 = 0.93;
      half += '<path d="M' + f1(x0 + u0 * w) + " " + f1(cupY(u0) + 0.8) + "L" + f1(x0 + u1 * w) + " " + f1(cupY(u1) + 0.8) + "L" + f1(x0 + u1 * w) + " " + f1(coneY(u1) - 0.8) + "L" + f1(x0 + u0 * w) + " " + f1(coneY(u0) - 0.8) + 'Z" fill="url(#' + gR + ')" stroke="#59606b" stroke-width=".9" stroke-linejoin="round"/>';
    } else if (kind === "thrust") {
      var tw = w * 0.3, brT = Math.min((w - 2 * tw) / 2 * 1.16, gap * 0.3);
      half += ring(rect(x0, yO + gap * 0.12, tw, yI - (yO + gap * 0.12))) + ring(rect(x1 - tw, yO, tw, (yI - gap * 0.12) - yO)) +
        '<circle cx="' + sx + '" cy="' + f1(by) + '" r="' + f1(brT) + '" fill="url(#' + gB + ')" stroke="#59606b" stroke-width=".9"/>';
    } else if (kind === "seal") {
      var H = gap;
      var body = "M" + f1(x0) + " " + f1(yO) + "H" + f1(x1) + "V" + f1(yO + 0.26 * H) + "H" + f1(x0 + 0.3 * w) + "V" + f1(yO + 0.42 * H) +
        "L" + f1(x0 + 0.9 * w) + " " + f1(yI - 0.22 * H) + "L" + f1(x0 + 0.7 * w) + " " + f1(yI) + "L" + f1(x0 + 0.42 * w) + " " + f1(yI - 0.16 * H) +
        "L" + f1(x0 + 0.2 * w) + " " + f1(yI - 0.24 * H) + "L" + f1(x0 + 0.07 * w) + " " + f1(yI - 0.01 * H) + "L" + f1(x0) + " " + f1(yI - 0.12 * H) + "Z";
      var kase = "M" + f1(x0 + 0.08 * w) + " " + f1(yO + 0.07 * H) + "H" + f1(x0 + 0.92 * w) + "V" + f1(yO + 0.15 * H) + "H" + f1(x0 + 0.19 * w) + "V" + f1(yO + 0.52 * H) + "H" + f1(x0 + 0.08 * w) + "Z";
      var spr = Math.min(0.075 * H, 0.11 * w);
      half += '<path d="' + body + '" ' + rubber + ' class="dw-o" stroke-linejoin="round"/>' +
        '<path d="' + kase + '" ' + steel + ' stroke="#59606b" stroke-width=".7"/>' +
        '<circle cx="' + f1(x0 + 0.7 * w) + '" cy="' + f1(yI - 0.34 * H - spr * 0.75) + '" r="' + f1(spr) + '" fill="#e9ecf0" stroke="#59606b" stroke-width="1" stroke-dasharray="1.6 1.2"/>';
    } else if (kind === "oring") {
      var csr = Math.min(w, gap) / 2;
      half += '<circle cx="' + sx + '" cy="' + f1(by) + '" r="' + f1(csr) + '" ' + rubber + ' class="dw-o"/><circle cx="' + sx + '" cy="' + f1(by) + '" r="' + f1(csr) + '" ' + hatch + ' opacity=".18"/>';
      w = csr * 2; x0 = sx - csr; x1 = sx + csr;
    }
    var mirror = '<g transform="matrix(1 0 0 -1 0 ' + 2 * cy + ')">' + half + "</g>";
    var axis = '<path class="dw-cl" d="M' + f1(x0 - 30) + " " + cy + "H" + f1(x1 + 30) + '"/>';
    var hidden = kind === "oring" ? "" : '<path class="dw-hid" d="M' + f1(x0) + " " + f1(cy - r) + "H" + f1(x1) + "M" + f1(x0) + " " + f1(cy + r) + "H" + f1(x1) + '"/>';

    var defs = '<defs><linearGradient id="' + gS + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f9"/><stop offset=".45" stop-color="#c3c8d1"/><stop offset=".75" stop-color="#e6e9ee"/><stop offset="1" stop-color="#9aa1ab"/></linearGradient>' +
      '<radialGradient id="' + gB + '" cx=".35" cy=".32" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#cfd4db"/><stop offset="1" stop-color="#59606b"/></radialGradient>' +
      '<linearGradient id="' + gR + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef0f3"/><stop offset=".5" stop-color="#b6bcc6"/><stop offset="1" stop-color="#7d848f"/></linearGradient>' +
      '<pattern id="' + gH + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#8a919c" stroke-width="1"/></pattern></defs>';

    if (opts.mini) {
      return '<svg class="dw dw--mini" viewBox="' + f1(fx - R - 14) + " " + f1(cy - R - 14) + " " + f1(2 * R + 28) + " " + f1(2 * R + 28) + '" aria-hidden="true" focusable="false">' + defs + front + cl + "</svg>";
    }

    /* ---- dimension lines */
    function arrowV(x, ya, yb) { return '<line x1="' + f1(x) + '" y1="' + f1(ya) + '" x2="' + f1(x) + '" y2="' + f1(yb) + '"/><path d="M' + f1(x - 4) + " " + f1(ya + 8) + "L" + f1(x) + " " + f1(ya) + "L" + f1(x + 4) + " " + f1(ya + 8) + '"/><path d="M' + f1(x - 4) + " " + f1(yb - 8) + "L" + f1(x) + " " + f1(yb) + "L" + f1(x + 4) + " " + f1(yb - 8) + '"/>'; }
    function arrowH(y, xa, xb) { return '<line x1="' + f1(xa) + '" y1="' + f1(y) + '" x2="' + f1(xb) + '" y2="' + f1(y) + '"/><path d="M' + f1(xa + 8) + " " + f1(y - 4) + "L" + f1(xa) + " " + f1(y) + "L" + f1(xa + 8) + " " + f1(y + 4) + '"/><path d="M' + f1(xb - 8) + " " + f1(y - 4) + "L" + f1(xb) + " " + f1(y) + "L" + f1(xb - 8) + " " + f1(y + 4) + '"/>'; }
    function ext(xa, ya, xb, yb) { return '<line class="dw-ext" x1="' + f1(xa) + '" y1="' + f1(ya) + '" x2="' + f1(xb) + '" y2="' + f1(yb) + '"/>'; }
    function txt(x, y, label, val, anchor) { return '<text x="' + f1(x) + '" y="' + f1(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : "") + '><tspan class="dw-l">' + label + " </tspan>" + val + "</text>"; }
    var dim = "";
    // front view: D below, d across the bore
    var yD = cy + R + 34;
    dim += ext(fx - R, cy + 6, fx - R, yD + 8) + ext(fx + R, cy + 6, fx + R, yD + 8) + arrowH(yD, fx - R, fx + R) + txt(fx, yD + 22, "D", "Ø" + fmtNum(D), "middle");
    var yd = cy + r * 0.5, ch = r * Math.sqrt(1 - 0.25);
    dim += arrowH(yd, fx - ch, fx + ch) + txt(fx + 8, yd - 9, "d", "Ø" + fmtNum(d));
    // section view: B on top, D on the right, d on the left
    var yt = cy - R - 30, xr = x1 + 40, xl = x0 - 40, bLab = p.sub === "tapered" ? "T" : "B";
    dim += ext(x0, cy - R - 4, x0, yt - 8) + ext(x1, cy - R - 4, x1, yt - 8) + arrowH(yt, x0, x1) + txt(sx, yt - 11, bLab, fmtNum(B), "middle");
    dim += ext(x1 + 4, cy - R, xr + 8, cy - R) + ext(x1 + 4, cy + R, xr + 8, cy + R) + arrowV(xr, cy - R, cy + R) +
      '<text x="' + f1(xr + 12) + '" y="' + f1(cy - 5) + '" class="dw-l">D</text><text x="' + f1(xr + 12) + '" y="' + f1(cy + 14) + '">' + fmtNum(D) + "</text>";
    dim += ext(x0 - 4, cy - r, xl - 8, cy - r) + ext(x0 - 4, cy + r, xl - 8, cy + r) + arrowV(xl, cy - r, cy + r) +
      '<text x="' + f1(xl - 12) + '" y="' + f1(cy - 5) + '" class="dw-l" text-anchor="end">d</text><text x="' + f1(xl - 12) + '" y="' + f1(cy + 14) + '" text-anchor="end">' + fmtNum(d) + "</text>";

    var title = "Technical drawing of the " + fullName(p) + ": bore " + fmtNum(d) + " mm, outside diameter " + fmtNum(D) + " mm, " + (bLab === "T" ? "total width " : "width ") + fmtNum(B) + " mm";
    var tid = "dwt" + k;
    return '<svg class="dw" viewBox="0 0 760 480" role="img" aria-labelledby="' + tid + '"><title id="' + tid + '">' + esc(title) + "</title>" + defs +
      '<text class="dw-head" x="24" y="34">' + esc(fullName(p)) + '</text><text class="dw-cap" x="24" y="54">Dimensions in mm</text>' +
      front + cl + axis + hidden + half + mirror +
      '<g class="dw-dim">' + dim + "</g>" +
      '<text class="dw-cap" x="' + fx + '" y="470" text-anchor="middle">Front view</text><text class="dw-cap" x="' + sx + '" y="470" text-anchor="middle">Section</text></svg>';
  }

  /* ================================================================ HTML: top of page */
  function crumbsHTML(p) {
    var c = BS.cat(p.cat), sub = subOf(p);
    return '<nav class="pdp-crumbs" aria-label="Breadcrumb"><ol class="crumbs">' +
      '<li><a href="shop.html">Store</a></li>' +
      (c ? '<li><a href="shop.html?cat=' + encodeURIComponent(c.id) + '">' + esc(c.name) + "</a></li>" : "") +
      (sub ? '<li><a href="shop.html?cat=' + encodeURIComponent(c.id) + "&amp;sub=" + encodeURIComponent(sub.id) + '">' + esc(sub.name) + "</a></li>" : "") +
      '<li aria-current="page">' + esc(p.pn) + "</li></ol></nav>";
  }
  function slidesFor(p) {
    var list = [{ kind: "photo", label: "Photo" }];
    if (canDraw(p)) list.push({ kind: "drawing", label: "Technical drawing" });
    list.push({ kind: "specs", label: "Key specifications" });
    return list;
  }
  function specCardHTML(p) {
    var st = cardStats(p);
    return '<div class="speccard"><p class="speccard__k">Key specifications</p><p class="speccard__pn">' + esc(fullName(p)) + "</p>" +
      '<dl class="speccard__grid">' + st.map(function (x) {
        // the qualifier ("at 40 °C") goes under the value so labels and values line up across the row
        return '<div class="' + (x.text ? "is-text" : x.v.length > 6 ? "is-long" : "") + '"><dt>' + esc(x.l) + "</dt><dd>" + esc(x.v) + (x.u ? "<small>" + esc(x.u) + "</small>" : "") + "</dd>" +
          (x.more ? '<dd class="speccard__more">' + esc(x.more) + "</dd>" : "") + "</div>";
      }).join("") + "</dl>" +
      '<p class="speccard__foot">' + (p.d && p.D && p.B ? esc(BS.dims(p)) + " · " : "") + "HSN " + esc(p.hsn || "") + " · GST " + (p.gst || 18) + "%</p></div>";
  }
  // A stand-in photo (images.js marks it with alias or standin) shows a related part, not this one.
  function photo(p) { return BS.img(p.img) || {}; }
  function isStandin(p) { var m = photo(p); return !!(m.alias || m.standin); }
  function photoAlt(p) { return isStandin(p) ? titleMain(p) + ", illustrative photo. The part looks different." : photo(p).alt || titleMain(p); }
  function photoNote(p) { return isStandin(p) ? "Illustrative photo. The part looks different." : "Photo shows the part type. Brand markings can differ."; }
  function slideInner(p, sl, large) {
    // Photos on white are fitted whole (the white melts into the mist tile); photos with their own
    // background fill the tile instead, so no lighter rectangle shows on a non-square stage.
    if (sl.kind === "photo") return BS.imgTag(p.img, { large: true, eager: true, cls: "gal__img" + (photo(p).bg === "white" ? " gal__img--fit" : ""), sizes: large ? "100vw" : "(max-width: 834px) 92vw, 720px", alt: photoAlt(p) });
    if (sl.kind === "drawing") return '<div class="gal__dw">' + drawingSVG(p) + "</div>";
    return specCardHTML(p);
  }
  function galleryHTML(p) {
    S.slides = slidesFor(p);
    var n = S.slides.length;
    var slides = S.slides.map(function (sl, i) {
      return '<div class="gal__slide gal__slide--' + sl.kind + '" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + " of " + n + ": " + sl.label + '" data-slide="' + i + '">' +
        '<button class="gal__open" type="button" data-act="lb-open" data-i="' + i + '" tabindex="' + (i === 0 ? "0" : "-1") + '" aria-label="' + esc(sl.label) + ", open full screen" + '">' + slideInner(p, sl) + "</button></div>";
    }).join("");
    var thumbs = S.slides.map(function (sl, i) {
      var inner = sl.kind === "photo" ? BS.imgTag(p.img, { alt: "", sizes: "80px" }) :
        sl.kind === "drawing" ? drawingSVG(p, { mini: true }) :
        '<span class="gal__tlabel">' + icon("list-checks") + "<span>Specs</span></span>";
      return '<button class="gal__thumb gal__thumb--' + sl.kind + '" type="button" data-act="slide" data-i="' + i + '" aria-pressed="' + (i === 0) + '" aria-label="Show ' + esc(sl.label.toLowerCase()) + '">' + inner + "</button>";
    }).join("");
    var dots = S.slides.map(function (sl, i) {
      return '<button type="button" data-act="slide" data-i="' + i + '" aria-pressed="' + (i === 0) + '" aria-label="Show ' + esc(sl.label.toLowerCase()) + '"><span></span></button>';
    }).join("");
    return '<section class="gal" aria-label="Images of the ' + esc(fullName(p)) + '">' +
      '<div class="gal__stage">' +
        '<div class="gal__track" data-gal-track>' + slides + "</div>" +
        '<button class="gal__arrow gal__arrow--prev" type="button" data-act="prev" aria-label="Previous image" disabled>' + icon("caret-left") + "</button>" +
        '<button class="gal__arrow gal__arrow--next" type="button" data-act="next" aria-label="Next image"' + (n < 2 ? " disabled" : "") + ">" + icon("caret-right") + "</button>" +
        '<span class="gal__zoom" aria-hidden="true">' + icon("magnifying-glass-plus") + "</span>" +
      "</div>" +
      '<div class="gal__dots" role="group" aria-label="Choose image">' + dots + "</div>" +
      '<div class="gal__thumbs" role="group" aria-label="Choose image" data-gal-thumbs>' + thumbs + "</div>" +
      '<p class="gal__cap' + (isStandin(p) ? " is-standin" : "") + '">' + photoNote(p) + "</p>" +
      "</section>";
  }

  function headHTML(p) {
    var dims = BS.dims(p);
    var meta = [];
    if (dims) meta.push('<span class="buy__dims num">' + esc(dims) + "</span>");
    else if (p.pack) meta.push('<span class="buy__dims">' + esc(p.pack) + "</span>");
    meta.push(p.reviews ? '<a class="buy__rating" href="#reviews">' + BS.starsHTML(p.rating) + '<span><span class="num">' + p.rating.toFixed(1) + "</span> · " + BS.plural(p.reviews, "review") + "</span></a>" :
      '<a class="buy__rating" href="#reviews">' + BS.starsHTML(0) + "<span>No reviews yet</span></a>");
    return '<div class="pdp__head">' + BS.flag(p) +
      '<p class="buy__brand"><a href="shop.html?brand=' + encodeURIComponent(p.brand) + '">' + esc(BS.brand(p.brand).name) + "</a></p>" +
      '<h1 class="buy__pn" id="pdp-title"><span class="sr-only">' + esc(brandShort(p)) + " </span>" + keepTogether(p.pn) + "</h1>" +
      '<p class="buy__title">' + esc(p.title) + "</p>" +
      '<div class="buy__meta">' + meta.join("") + "</div></div>";
  }

  function priceNowHTML(p, qty) {
    var u = BS.unitPrice(p, qty);
    return '<strong class="num">' + money(u) + '</strong><span class="price__unit">' + gstWord() + " / " + esc(unitOf(p)) + "</span>";
  }
  function priceWasHTML(p, qty) {
    var u = BS.unitPrice(p, qty);
    if (isInc() || !p.mrp || p.mrp <= u) return "";
    return '<s>MRP ' + inr(p.mrp) + '</s><span class="price__save">You save ' + pctOff(u, p.mrp) + "%</span>";
  }
  function priceNoteHTML(p, qty) {
    var u = BS.unitPrice(p, qty);
    var row = tierRows(p).filter(function (r) { return qty >= r.from && (r.to == null || qty <= r.to); })[0];
    var vol = u < p.price && row ? "Volume price for " + rangeLabel(row) + " " + unitsOf(p, 2) + ". " : "";
    return vol + (isInc() ? inr(u) + " per " + esc(unitOf(p)) + " before GST." : inr(BS.withGst(u)) + " per " + esc(unitOf(p)) + " with 18% GST.");
  }
  function tiersBodyHTML(p, qty) {
    return tierRows(p).map(function (r) {
      var on = qty >= r.from && (r.to == null || qty <= r.to);
      var save = r.price < p.price ? pctOff(r.price, p.price) + "%" : '<span class="muted">List price</span>';
      return "<tr" + (on ? ' class="is-on"' : "") + '><th scope="row"><button type="button" data-act="tier" data-q="' + r.from + '" aria-label="Set quantity to ' + r.from + '">' + rangeLabel(r) + "</button></th>" +
        '<td class="num">' + money(r.price) + (on ? '<span class="sr-only"> (your price)</span>' : "") + '</td><td class="r num">' + save + "</td></tr>";
    }).join("");
  }
  function variantsHTML(p) {
    var model = variantModel(p);
    if (!model) return "";
    return '<div class="variants" data-variants>' + model.axes.map(function (a) {
      var cur = axisVal(p, a.key);
      var desc = a.key === "seal" ? SEAL_DESC[cur] : a.key === "clr" ? CLR_DESC[cur] : "";
      var gid = "vg-" + a.key;
      return '<div class="vrow" role="group" aria-labelledby="' + gid + '"><p class="vrow__label" id="' + gid + '">' + esc(a.label) + ' <span class="vrow__val">' + esc(valLabel(a.key, cur)) + (desc ? " · " + esc(desc) : "") + "</span></p>" +
        '<div class="vrow__chips">' + a.vals.map(function (v) {
          var t = chipTarget(model, p, a.key, v);
          var tip = t.on ? "Selected" : t.exact ? fullName(t.target) + " · " + inr(t.target.price) + " + GST" :
            "Not listed with " + t.changes.map(function (c) { return c.label.toLowerCase() + " " + valLabel(c.key, c.from); }).join(" and ") + ". Choose it to see the closest part, " + fullName(t.target) + ".";
          return '<button class="vchip' + (t.exact ? "" : " is-na") + '" type="button" data-act="variant" data-axis="' + a.key + '" data-v="' + esc(v) + '" data-to="' + esc(t.target.id) + '" aria-pressed="' + t.on + '" title="' + esc(tip) + '"' +
            (t.exact ? "" : ' aria-describedby="vna-note"') + ">" + esc(valLabel(a.key, v)) + "</button>";
        }).join("") + "</div></div>";
    }).join("") +
      '<p class="sr-only" id="vna-note">Not available with your other choices. Choosing it switches to the closest part.</p>' +
      '<p class="variants__msg" data-variant-msg aria-live="polite"></p></div>';
  }
  function qtyInfoHTML(p, qty) {
    var u = BS.unitPrice(p, qty), total = round2(u * qty);
    var nt = BS.nextTier(p, qty);
    var nudge = nt ? "Add " + (nt.qty - qty) + " more to pay " + money(nt.price) + " / " + esc(unitOf(p)) + "." :
      (p.tiers || []).length ? "Best volume price applied." : "";
    var stockNote = p.stock > 0 && qty > p.stock ? '<p class="qty__warn">' + icon("info") + "<span>Only " + p.stock + " in stock. We will source the other " + (qty - p.stock) + " and confirm a dispatch date within 2 working hours.</span></p>" : "";
    return '<p class="qty__total"><span class="muted">Total</span> <strong class="num">' + money(total) + "</strong> <small>" + gstWord() + "</small>" +
      (qty > 1 ? ' <small class="num">· ' + qty + " × " + money(u) + "</small>" : "") + "</p>" +
      (nudge ? '<p class="qty__nudge' + (nt ? "" : " is-best") + '">' + (nt ? icon("tag") : icon("check-circle")) + "<span>" + nudge + "</span></p>" : "") + stockNote;
  }
  // The standard delivery window for the saved pincode, as checkout prices it (Express is a checkout option).
  function deliveryWhen(p, pin) {
    var st = plan(p, pin).standard;
    function day(d) { return '<strong class="nobr">' + dayLabel(d) + "</strong>"; }
    return BS.sameDay(st.from, st.to) ? "arrives " + day(st.from) : "arrives between " + day(st.from) + " and " + day(st.to);
  }
  function deliveryHTML(p) {
    var pin = savedPin();
    if (pin) {
      var city = cityOf(pin), when = deliveryWhen(p, pin);
      return '<div class="del__res" data-del-res data-when="' + esc(when) + '">' + icon("truck") + "<p>Standard delivery to <strong>" + (city ? esc(city) + " " : "") + pin + "</strong> " + when + '. <button class="textlink" type="button" data-act="pin-edit" aria-label="Change delivery pincode">Change</button></p></div>';
    }
    return pinFormHTML("");
  }
  function pinFormHTML(val) {
    return '<form class="pin" data-pin-form novalidate>' +
      '<label class="label" for="pin-input">Check the delivery date</label>' +
      '<div class="pin__row"><input class="input num" id="pin-input" name="pin" inputmode="numeric" autocomplete="postal-code" maxlength="6" placeholder="6-digit pincode" value="' + esc(val) + '" aria-describedby="pin-err">' +
      '<button class="btn btn--quiet" type="submit">Check</button></div>' +
      '<p class="error" id="pin-err" aria-live="polite"></p></form>';
  }
  function shipHTML(p) {
    var st = BS.stock(p);
    var cut = cutoffText(p);
    var out = !(p.stock > 0);
    // Point to the equivalents only when one of them can ship sooner.
    var hasEq = eqRows(p).some(function (r) { return r.p && r.p.stock > 0; });
    return '<div class="ship">' +
      '<p class="ship__stock"><span class="' + st.cls + '">' + esc(out ? "Not in stock · Ships in " + shipDays(p) + " working days" : st.text) + "</span></p>" +
      '<p class="ship__cut" data-cut-row' + (cut ? "" : " hidden") + ">" + icon("clock") + "<span data-cutoff>" + esc(cut) + "</span></p>" +
      (out ? '<div class="notice notice--warm ship__out">' + icon("info") + "<p>We order this part in for you and dispatch it in about " + shipDays(p) + " working days. Need it sooner? " + (hasEq ? "Check the in-stock equivalents below or " : "") + '<a href="' + quoteHref(p) + '" data-quote-link>' + (hasEq ? "request a quote" : "Request a quote") + "</a> and we will confirm the fastest date.</p></div>" : "") +
      '<div class="del" data-del aria-live="polite">' + deliveryHTML(p) + "</div>" +
      '<p class="ship__policy">Free dispatch on orders of ₹5,000 or more before GST, otherwise ₹120.</p></div>';
  }
  function inBagHTML(p) {
    var n = safe(function () { return BS.cart.qtyOf(p.id); }, 0);
    return n ? icon("handbag") + "<span>" + n + " " + esc(unitsOf(p, n)) + ' in your bag. <button class="textlink" type="button" data-open-cart>View bag</button></span>' : "";
  }
  // The product id keeps the brand: quick-order turns it into "Brand PN" (a bare 6205-2RS fits several brands).
  function quoteHref(p) { return "quick-order.html?pn=" + encodeURIComponent(p.id) + "&qty=" + S.qty + "#rfq"; }
  function buyHTML(p) {
    var fav = safe(function () { return BS.wish.has(p.id); }, false);
    var stepper = BS.stepperHTML(p.id, S.qty, "").replace('data-stepper="', 'data-local data-qty-stepper data-stepper="').replace('aria-label="Quantity"', 'id="qty-input" aria-describedby="qty-hint"');
    return '<section class="buy pdp__buy" aria-labelledby="pdp-title">' +
      '<div class="price">' +
        '<div class="price__row"><p class="price__now" data-price-now>' + priceNowHTML(p, S.qty) + "</p>" +
        '<div class="seg price__seg" role="group" aria-label="Show prices"><button type="button" data-act="gst" data-v="ex" aria-pressed="' + !isInc() + '">+ GST</button><button type="button" data-act="gst" data-v="inc" aria-pressed="' + isInc() + '">Incl. GST</button></div></div>' +
        '<p class="price__was" data-price-was>' + priceWasHTML(p, S.qty) + "</p>" +
        '<p class="price__note" data-price-note>' + priceNoteHTML(p, S.qty) + "</p>" +
      "</div>" +
      variantsHTML(p) +
      '<div class="tiers"><table class="tiers__t"><caption class="sr-only">Volume prices. Choose a row to set the quantity.</caption><thead><tr><th scope="col">Quantity</th><th scope="col">Price per ' + esc(unitOf(p)) + '</th><th scope="col" class="r">You save</th></tr></thead><tbody data-tiers>' + tiersBodyHTML(p, S.qty) + "</tbody></table></div>" +
      '<div class="qty"><div class="qty__row"><label class="label" for="qty-input">Quantity</label>' + stepper +
      '<span class="qty__hint" id="qty-hint">' + (minQty(p) > 1 ? "Minimum " + minQty(p) + " " + esc(unitsOf(p, 2)) : "Sold per " + esc(unitOf(p))) + "</span></div>" +
      '<div class="qty__info" data-qty-info aria-live="polite">' + qtyInfoHTML(p, S.qty) + "</div></div>" +
      shipHTML(p) +
      '<div class="buy__actions" data-buy-actions>' +
        '<button class="btn btn--lg buy__add" type="button" data-act="add">' + icon("handbag") + "<span>Add to bag</span></button>" +
        '<button class="btn btn--lg btn--quiet" type="button" data-act="buynow">Buy now</button></div>' +
      '<p class="buy__inbag" data-inbag aria-live="polite">' + inBagHTML(p) + "</p>" +
      '<ul class="buy__more">' +
        '<li><button class="tool" type="button" data-fav="' + esc(p.id) + '" aria-pressed="' + fav + '">' + icon(fav ? "heart-fill" : "heart") + '<span data-fav-label>' + (fav ? "Saved to list" : "Save to list") + "</span></button></li>" +
        '<li><a class="tool" href="' + quoteHref(p) + '" data-quote-link>' + icon("paper-plane-tilt") + "<span>Request a bulk quote</span></a></li>" +
        '<li><button class="tool" type="button" data-act="share">' + icon("share-network") + "<span>Share</span></button></li>" +
        '<li><button class="tool" type="button" data-act="datasheet">' + icon("printer") + "<span>Datasheet</span></button></li></ul>" +
      '<ul class="trust" aria-label="Buying with Bearingsetu">' +
        "<li>" + icon("receipt") + "<span><strong>GST invoice</strong>Claim input tax credit</span></li>" +
        "<li>" + icon("seal-check") + "<span><strong>Genuine parts</strong>Sourced through brand channels</span></li>" +
        "<li>" + icon("arrow-counter-clockwise") + "<span><strong>7-day returns</strong>Unused, in original packing</span></li>" +
        "<li>" + icon("truck") + "<span><strong>Order by 4 pm</strong>Same-day dispatch, Mon to Sat</span></li></ul>" +
      "</section>";
  }

  /* ================================================================ HTML: sections */
  function sectionList(p) {
    var list = [{ id: "overview", label: "Overview" }, { id: "specs", label: "Specifications" }];
    if (eqRows(p).length) list.push({ id: "equivalents", label: "Equivalents" });
    if ((p.rel || []).some(function (id) { return BS.byId(id); })) list.push({ id: "fits", label: "Fits with" });
    list.push({ id: "reviews", label: "Reviews" }, { id: "questions", label: "Questions" });
    return list;
  }
  function secLinks(list) {
    return list.map(function (s) { return '<li><a href="#' + s.id + '" data-sec-link="' + s.id + '">' + esc(s.label) + "</a></li>"; }).join("");
  }
  function overviewHTML(p, cls) {
    var stats = keyStats(p), sub = subOf(p), c = BS.cat(p.cat);
    return '<section class="section ' + cls + ' ov" id="overview" data-sec aria-labelledby="ov-title"><div class="wrap">' +
      '<div class="ov__grid"><h2 class="h2 ov__title reveal" id="ov-title">' + keepTogether(fullName(p)) + '. <span class="tone">' + esc(titleMain(p)) + ".</span></h2>" +
      '<div class="ov__copy reveal" style="--i:1"><p class="lede">' + esc(p.desc || p.title) + "</p>" +
      '<p class="ov__links">' + (sub ? '<a class="more" href="shop.html?cat=' + encodeURIComponent(p.cat) + "&amp;sub=" + encodeURIComponent(p.sub) + '">More ' + esc(lcFirst(sub.name)) + (c && /bearings/.test(c.id) && !/bearing/i.test(sub.name) ? " bearings" : "") + "</a>" : "") +
      '<a class="more" href="shop.html?brand=' + encodeURIComponent(p.brand) + '">More from ' + esc(brandShort(p)) + "</a></p></div></div>" +
      (stats.length ? '<dl class="stats stats--' + stats.length + ' reveal" style="--i:2">' + stats.map(function (x) {
        return '<div class="stat' + (x.text ? " is-text" : x.v.length > 6 ? " is-long" : "") + '"><dt>' + esc(x.l) + (x.more ? ' <span class="stat__more">' + esc(x.more) + "</span>" : "") + '</dt><dd><span class="num">' + esc(x.v) + "</span>" + (x.u ? "<small>" + esc(x.u) + "</small>" : "") + "</dd></div>";
      }).join("") + "</dl>" : "") +
      "</div></section>";
  }
  function specsHTML(p, cls) {
    var groups = specGroups(p);
    return '<section class="section ' + cls + '" id="specs" data-sec aria-labelledby="specs-title"><div class="wrap">' +
      '<div class="row-head"><h2 class="h2 reveal" id="specs-title">Specifications</h2>' +
      '<button class="btn btn--sm btn--quiet specs__print" type="button" data-act="datasheet">' + icon("printer") + "Print datasheet</button></div>" +
      '<div class="sgroups">' + groups.map(function (g, i) {
        return '<div class="sgroup reveal" style="--i:' + i + '"><h3 class="sgroup__t">' + icon(g[2]) + esc(g[0]) + '</h3><dl class="sgroup__dl">' + g[1].map(function (a) {
          return "<div><dt>" + esc(a[0]) + "</dt><dd>" + (a[2] ? a[1] : esc(a[1])) + "</dd></div>";
        }).join("") + "</dl></div>";
      }).join("") + "</div>" +
      '<p class="specs__note">' + icon("info") + "<span>Load ratings and speeds are typical catalogue values. Check the manufacturer’s datasheet for your application.</span></p>" +
      "</div></section>";
  }
  function eqHTML(p, cls) {
    var rows = eqRows(p);
    var me = '<tr class="is-self"><td>' + esc(brandShort(p)) + '</td><td class="mono">' + esc(p.pn) + '</td><td class="num">' + money(p.price) + '</td><td><span class="' + BS.stock(p).cls + '">' + esc(BS.stock(p).short) + '</span></td><td class="r"><span class="badge">This part</span></td></tr>';
    var body = rows.map(function (r) {
      if (r.p) {
        var st = BS.stock(r.p);
        return "<tr><td>" + esc(r.brand) + '</td><td class="mono">' + esc(r.p.pn) + '</td><td class="num">' + money(r.p.price) + '</td><td><span class="' + st.cls + '">' + esc(st.short) + '</span></td><td class="r"><a class="more" href="' + BS.url(r.p) + '" aria-label="View ' + esc(BS.brand(r.p.brand).name.replace(/\s*\(.*\)$/, "") + " " + r.p.pn) + '">View</a></td></tr>';
      }
      return "<tr><td>" + esc(r.brand) + '</td><td class="mono">' + esc(r.pn) + '</td><td class="muted">Not listed</td><td class="muted">On request</td><td class="r"><a class="more" href="quick-order.html?pn=' + encodeURIComponent(r.brand + " " + r.pn) + "&amp;qty=" + S.qty + '#rfq" aria-label="Ask for a price on ' + esc(r.brand + " " + r.pn) + '">Ask</a></td></tr>';
    }).join("");
    return '<section class="section ' + cls + '" id="equivalents" data-sec aria-labelledby="eq-title"><div class="wrap eq">' +
      '<div class="eq__copy reveal"><h2 class="h2" id="eq-title">Equivalents</h2>' +
      '<p class="sub">' + (BEARING[p.cat] ? "Listed parts match this bearing’s size, sealing and internal clearance. Check the cage suffix before you swap." :
        "Listed parts match the shaft size and housing type. Check the centre height and bolt holes before you swap.") + "</p>" +
      '<a class="more" href="tools.html#interchange">Open the interchange finder</a></div>' +
      '<div class="table-wrap eq__table reveal" style="--i:1"><table class="table"><caption class="sr-only">Equivalent part numbers from other brands</caption><thead><tr><th scope="col">Brand</th><th scope="col">Part number</th><th scope="col">Price ' + (isInc() ? "incl. GST" : "+ GST") + '</th><th scope="col">Stock</th><th scope="col" class="r"><span class="sr-only">Action</span></th></tr></thead><tbody data-eq-body>' + me + body + "</tbody></table></div>" +
      "</div></section>";
  }
  function relOf(p) { return (p.rel || []).map(BS.byId).filter(Boolean); }
  function bundleItems(p) {
    var rel = relOf(p);
    var pick = rel.filter(function (x) { return x.stock > 0; }).concat(rel.filter(function (x) { return !(x.stock > 0); })).slice(0, 2);
    return [p].concat(pick);
  }
  function bundleHTML(p) {
    var items = bundleItems(p);
    var sel = S.bundleSel || {};
    var picks = items.map(function (x, i) {
      var on = sel[x.id] !== false;
      return (i ? '<span class="bundle__plus" aria-hidden="true">' + icon("plus") + "</span>" : "") +
        '<a class="bundle__pic' + (on ? "" : " is-off") + '" href="' + BS.url(x) + '" tabindex="-1" aria-hidden="true" data-bundle-pic="' + esc(x.id) + '">' + BS.imgTag(x.img, { alt: "", sizes: "140px" }) + "</a>";
    }).join("");
    var lines = items.map(function (x, i) {
      var q = minQty(x), u = BS.unitPrice(x, q), on = sel[x.id] !== false;
      return '<li><label class="bundle__line"><input type="checkbox" data-bundle="' + esc(x.id) + '"' + (on ? " checked" : "") + ">" +
        '<span class="bundle__name">' + (i ? "" : '<span class="bundle__this">This part</span>') + '<strong><a href="' + BS.url(x) + '">' + esc(fullName(x)) + "</a></strong>" +
        "<small>" + esc(titleMain(x)) + (q > 1 ? " · " + q + " " + esc(unitsOf(x, q)) : "") + "</small></span>" +
        '<span class="bundle__price num">' + money(round2(u * q)) + "</span></label></li>";
    }).join("");
    return '<div class="bundle reveal" data-bundle-box><div class="bundle__pics">' + picks + "</div>" +
      '<div class="bundle__body"><h3 class="h4">Bought together</h3><p class="bundle__sub">Buyers who order the ' + esc(p.pn) + " usually add these.</p>" +
      '<ul class="bundle__list">' + lines + "</ul>" +
      '<div class="bundle__foot" data-bundle-foot>' + bundleFootHTML(p) + "</div></div></div>";
  }
  function bundleOn(p) { var sel = S.bundleSel || {}; return bundleItems(p).filter(function (x) { return sel[x.id] !== false; }); }
  function bundleTotalHTML(p) {
    var on = bundleOn(p);
    var total = on.reduce(function (s, x) { return s + round2(BS.unitPrice(x, minQty(x)) * minQty(x)); }, 0);
    return on.length ? "Total for " + BS.plural(on.length, "part") + ' <strong class="num">' + money(total) + "</strong> <small>" + gstWord() + "</small>" : "Choose at least one part.";
  }
  function bundleBtnLabel(n) { return n > 1 ? "Add " + n + " to bag" : n ? "Add to bag" : "Add selected to bag"; }
  function bundleFootHTML(p) {
    var n = bundleOn(p).length;
    // The total stays in the page (only its text changes) so screen readers announce each change.
    return '<p class="bundle__total" aria-live="polite" data-bundle-total>' + bundleTotalHTML(p) + "</p>" +
      '<button class="btn" type="button" data-act="bundle-add"' + (n ? "" : " disabled") + ">" + bundleBtnLabel(n) + "</button>";
  }
  function updateBundleFoot() {
    var tot = $("[data-bundle-total]", main), btn = $("[data-act=bundle-add]", main);
    if (!S.p || !tot || !btn) return;
    var n = bundleOn(S.p).length;
    tot.innerHTML = bundleTotalHTML(S.p);
    clearTimeout(btn._t);
    btn.disabled = !n;
    btn.textContent = bundleBtnLabel(n);
  }
  function shelfCards(list) {
    return list.map(function (x) { var c = safe(function () { return BS.card(x, { sizes: "(max-width: 640px) 70vw, 300px" }); }, ""); return c ? '<div role="listitem">' + c + "</div>" : ""; }).join("");
  }
  // Related parts that are not already in the "Bought together" box, so nothing shows twice.
  function fitsShelf(p) {
    var inBundle = bundleItems(p).slice(1);
    return relOf(p).filter(function (x) { return inBundle.indexOf(x) === -1; });
  }
  function fitsHTML(p, cls) {
    var shelf = fitsShelf(p), n = shelf.length;
    // One or two extra parts sit beside the bundle on wide screens; more get a scrolling shelf below it.
    return '<section class="section ' + cls + '" id="fits" data-sec aria-labelledby="fits-title"><div class="wrap" data-shelf>' +
      '<div class="row-head"><h2 class="h2 reveal" id="fits-title">Fits with. <span class="tone">Parts often fitted alongside.</span></h2>' +
      (n > 4 ? '<div class="shelf-nav"><button type="button" data-shelf-prev aria-label="Previous parts">' + icon("caret-left") + '</button><button type="button" data-shelf-next aria-label="Next parts">' + icon("caret-right") + "</button></div>" : "") + "</div>" +
      '<div class="fits fits--' + (n > 2 ? "many" : "n" + n) + '">' + bundleHTML(p) +
      (n ? '<div class="shelf fits__shelf" role="list" aria-label="More parts that fit" data-fits-shelf>' + shelfCards(shelf) + "</div>" : "") +
      "</div></div></section>";
  }
  function reviewCardHTML(r, opts) {
    opts = opts || {};
    var key = opts.key || "";
    var hm = helpfulMap(), mine = !!hm[key];
    var base = opts.pending ? 0 : (hash(key) % 11) + 1;
    var who = [r.role, [r.company_type, r.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    return '<article class="rv' + (opts.pending ? " rv--mine" : "") + '">' +
      '<header class="rv__head"><span class="rv__av" aria-hidden="true">' + esc(initials(r.name)) + "</span>" +
      '<div class="rv__who"><p class="rv__name">' + esc(r.name) + "</p>" + (who ? '<p class="rv__role">' + esc(who) + "</p>" : "") + "</div>" +
      '<time class="rv__date" datetime="' + esc(r.date) + '">' + longDate(isoToDate(r.date)) + "</time></header>" +
      '<div class="rv__rate">' + BS.starsHTML(r.rating) + (opts.pending ? '<span class="badge badge--blue">Your review, pending moderation</span>' : '<span class="rv__ver">' + icon("seal-check") + "Verified purchase</span>") + "</div>" +
      '<h3 class="rv__title">' + esc(r.title) + "</h3><p class=\"rv__body\">" + esc(r.body) + "</p>" +
      '<footer class="rv__foot">' + (opts.pending ?
        '<button class="textlink small" type="button" data-act="rv-remove">Remove my review</button>' :
        '<button class="helpful" type="button" data-act="helpful" data-key="' + esc(key) + '" data-base="' + base + '" aria-pressed="' + mine + '">' + icon("thumbs-up") + "<span>Helpful</span> <span class=\"num\" data-count>(" + (base + (mine ? 1 : 0)) + ")</span></button>") +
      "</footer></article>";
  }
  function reviewsListHTML(p) {
    var mine = myReviews()[p.id];
    var list = catReviews(p);
    var out = mine ? reviewCardHTML(mine, { pending: true }) : "";
    if (!list.length && !mine) {
      return '<div class="empty rv-empty">' + icon("chat-circle-dots") + "<h3>No reviews yet</h3><p>Be the first to review the " + esc(fullName(p)) + ". Tell other buyers how it ran on your machine and how it arrived.</p>" +
        '<button class="btn" type="button" data-act="rv-open" aria-expanded="false" aria-controls="rv-form-wrap">Write the first review</button></div>';
    }
    out += list.map(function (r) { return reviewCardHTML(r, { key: p.cat + ":" + r.name + ":" + r.date }); }).join("");
    if (list.length) out += '<p class="rv__more">Showing the ' + BS.plural(list.length, "most recent review") + (p.reviews > list.length ? " of " + p.reviews : "") + ". Reviews are from verified Bearingsetu orders for " + esc(lcFirst((BS.cat(p.cat) || { name: "this range" }).name)) + ".</p>";
    return out;
  }
  function reviewFormHTML() {
    var words = ["Poor", "Fair", "Good", "Very good", "Excellent"];
    return '<form class="rvform" data-rv-form novalidate hidden>' +
      '<h3 class="h4">Write a review</h3>' +
      '<fieldset class="rate" aria-describedby="rv-rating-err"><legend class="label">Your rating</legend><div class="rate__stars" data-rate>' +
      words.map(function (w, i) {
        var n = i + 1;
        return '<input class="rate__in" type="radio" name="rvRating" id="rv-r' + n + '" value="' + n + '"><label for="rv-r' + n + '" title="' + w + '">' + icon("star-fill") + '<span class="sr-only">' + n + " star" + (n > 1 ? "s" : "") + ", " + w.toLowerCase() + "</span></label>";
      }).join("") + '<span class="rate__word" data-rate-word aria-hidden="true">Choose 1 to 5 stars</span></div><p class="error" id="rv-rating-err"></p></fieldset>' +
      field("rv-title", "rvTitle", "Title", '<input class="input" id="rv-title" name="rvTitle" maxlength="80" autocomplete="off" placeholder="Quiet running on our pump motors"', "") +
      field("rv-body", "rvBody", "Your review", '<textarea class="textarea" id="rv-body" name="rvBody" rows="5" maxlength="1200" placeholder="How did it fit, run and arrive?"', "At least 20 characters.") +
      '<div class="rvform__two">' +
      field("rv-name", "rvName", "Name", '<input class="input" id="rv-name" name="rvName" maxlength="60" autocomplete="name" placeholder="Priya Kulkarni"', "") +
      field("rv-city", "rvCity", 'City <small>optional</small>', '<input class="input" id="rv-city" name="rvCity" maxlength="40" autocomplete="address-level2" placeholder="Nashik"', "") + "</div>" +
      '<div class="rvform__foot"><button class="btn" type="submit" data-rv-submit>Submit review</button><button class="btn btn--quiet" type="button" data-act="rv-cancel">Cancel</button></div>' +
      '<p class="rvform__note">Reviews are checked before they appear, usually within one working day. Do not include phone numbers or order details.</p></form>';
    function field(id, name, label, open, hint) {
      var close = open.indexOf("<textarea") === 0 ? "></textarea>" : ">";
      return '<div class="field"><label for="' + id + '">' + label + "</label>" + open + ' aria-describedby="' + id + "-err" + (hint ? " " + id + "-hint" : "") + '"' + close +
        (hint ? '<p class="hint" id="' + id + '-hint">' + hint + "</p>" : "") + '<p class="error" id="' + id + '-err"></p></div>';
    }
  }
  function reviewsHTML(p, cls) {
    var dist = distribution(p.rating, p.reviews || 0);
    var max = Math.max.apply(null, dist.concat([1]));
    var mine = myReviews()[p.id];
    var summary = p.reviews ?
      '<div class="rsum"><p class="rsum__avg num">' + p.rating.toFixed(1) + '</p><div>' + BS.starsHTML(p.rating) + '<p class="rsum__count">' + BS.plural(p.reviews, "rating") + "</p></div></div>" +
      '<ol class="rsum__bars" aria-label="Rating breakdown">' + [5, 4, 3, 2, 1].map(function (s) {
        var n = dist[s - 1];
        return '<li><span class="rsum__s">' + s + icon("star-fill") + '</span><span class="rsum__bar" aria-hidden="true"><span style="width:' + Math.round(n / max * 100) + '%"></span></span><span class="rsum__n num">' + n + '</span><span class="sr-only">' + BS.plural(n, "review") + " with " + s + " star" + (s > 1 ? "s" : "") + "</span></li>";
      }).join("") + "</ol>" :
      '<div class="rsum rsum--none">' + BS.starsHTML(0) + '<p class="rsum__count">No ratings yet</p></div>';
    // With no reviews the empty state on the right carries the one "Write the first review" button.
    var empty = !p.reviews && !mine && !catReviews(p).length;
    return '<section class="section ' + cls + '" id="reviews" data-sec aria-labelledby="rv-title-h"><div class="wrap rvs">' +
      '<div class="rvs__side reveal"><h2 class="h2" id="rv-title-h">Reviews</h2>' + summary +
      '<div class="rvs__write' + (empty ? " rvs__write--empty" : "") + '" data-rv-write>' + (mine ? '<p class="rvs__thanks">' + icon("check-circle") + "<span>Thanks for your review. It will appear for everyone once it is checked.</span></p>" :
        empty ? "" : '<p class="rvs__ask">Bought this part? Help other maintenance teams choose.</p><button class="btn btn--ghost" type="button" data-act="rv-open" aria-expanded="false" aria-controls="rv-form-wrap">Write a review</button>') +
      '<div id="rv-form-wrap">' + (mine ? "" : reviewFormHTML()) + "</div></div></div>" +
      '<div class="rvs__list" data-rv-list>' + reviewsListHTML(p) + "</div>" +
      "</div></section>";
  }
  function faqHTML(p, cls) {
    var list = FAQ[p.cat] || FAQ["ball-bearings"];
    var c = BS.cat(p.cat);
    return '<section class="section ' + cls + '" id="questions" data-sec aria-labelledby="qa-title"><div class="wrap qa">' +
      '<div class="qa__head reveal"><h2 class="h2" id="qa-title">Questions</h2><p class="sub">About ' + esc(c ? lcFirst(c.name) : "this part") + ", answered by our parts team.</p>" +
      '<a class="btn btn--quiet" href="support.html#contact">' + icon("chat-circle-dots") + "Ask a question</a></div>" +
      '<div class="qa__list reveal" style="--i:1">' + list.map(function (q, i) {
        return '<div class="faq"><h3 class="faq__h"><button class="faq__q" type="button" id="faq-q' + i + '" data-act="faq" aria-expanded="false" aria-controls="faq-a' + i + '"><span>' + esc(q[0]) + '</span><span class="faq__ic" aria-hidden="true">' + icon("plus", "faq__plus") + icon("minus", "faq__minus") + "</span></button></h3>" +
          '<div class="faq__a" id="faq-a' + i + '" role="region" aria-labelledby="faq-q' + i + '"><div class="faq__in"><p>' + esc(q[1]) + '</p><p class="faq__by">Answered by the Bearingsetu parts team</p></div></div></div>';
      }).join("") + "</div></div></section>";
  }
  function recentHTML() {
    if (!S.recent.length) return "";
    return '<section class="section section--tight pdp-recent" aria-labelledby="recent-title"><div class="wrap" data-shelf>' +
      '<div class="row-head"><h2 class="h3" id="recent-title">Recently viewed</h2>' +
      (S.recent.length > 4 ? '<div class="shelf-nav"><button type="button" data-shelf-prev aria-label="Previous">' + icon("caret-left") + '</button><button type="button" data-shelf-next aria-label="Next">' + icon("caret-right") + "</button></div>" : "") +
      '</div><div class="shelf" role="list" data-recent-shelf>' + shelfCards(S.recent) + "</div></div></section>";
  }
  function minibarHTML(p, secs) {
    return '<div class="minibar" data-minibar role="region" aria-label="Quick buy">' +
      '<div class="wrap minibar__in">' +
        '<a class="minibar__id" href="#main">' + '<span class="minibar__img">' + BS.imgTag(p.img, { alt: "", sizes: "40px" }) + "</span>" +
        "<span><strong>" + esc(fullName(p)) + "</strong><small>" + esc(titleMain(p)) + "</small></span></a>" +
        '<nav class="minibar__nav" aria-label="Jump to section"><ul>' + secLinks(secs) + "</ul></nav>" +
        '<p class="minibar__price" data-mini-price>' + priceNowHTML(p, S.qty) + "</p>" +
        '<button class="btn btn--sm" type="button" data-act="mini-add">Add to bag</button>' +
      "</div></div>";
  }
  function bbarHTML(p) {
    return '<div class="bbar" data-bbar role="region" aria-label="Quick buy">' +
      '<p class="bbar__price" data-bbar-price>' + bbarPriceHTML(p) + "</p>" +
      '<button class="btn" type="button" data-act="mini-add">Add to bag</button></div>';
  }
  function bbarPriceHTML(p) {
    var u = BS.unitPrice(p, S.qty);
    return '<strong class="num">' + money(u) + "</strong><small>" + gstWord() + " / " + esc(unitOf(p)) + " · Qty " + S.qty + "</small>";
  }

  /* ================================================================ datasheet (print) */
  var LOGO = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="#16255c" stroke-width="10" stroke-dasharray="9 8.28"/><circle cx="50" cy="50" r="38" fill="#16255c"/><circle cx="50" cy="50" r="29" fill="#fff"/><g fill="#16255c"><circle cx="71" cy="50" r="5"/><circle cx="64.85" cy="64.85" r="5"/><circle cx="50" cy="71" r="5"/><circle cx="35.15" cy="64.85" r="5"/><circle cx="29" cy="50" r="5"/><circle cx="35.15" cy="35.15" r="5"/><circle cx="50" cy="29" r="5"/><circle cx="64.85" cy="35.15" r="5"/></g><circle cx="50" cy="50" r="11" fill="#16255c"/><path d="M6 74 Q50 50 98 60" fill="none" stroke="#f29a0e" stroke-width="7" stroke-linecap="round"/></svg>';
  function datasheetHTML(p) {
    var groups = specGroups(p);
    var eqs = eqRows(p);
    var eq = eqs.length ? '<div class="ds__box"><h2>Equivalents</h2><p>' + eqs.map(function (r) { return esc(r.brand + " " + (r.p ? r.p.pn : r.pn)); }).join(" · ") + '</p><p class="ds__small">' +
      (BEARING[p.cat] ? "Same size, sealing and internal clearance. Check the cage suffix." : "Same shaft size and housing type. Check the centre height and bolt holes.") + "</p></div>" : "";
    var tiers = '<div class="ds__box"><h2>Prices per ' + esc(unitOf(p)) + ' (before GST)</h2><table><thead><tr><th>Quantity</th><th>Price</th><th>Saving</th></tr></thead><tbody>' +
      tierRows(p).map(function (r) { return "<tr><td>" + rangeLabel(r) + "</td><td>" + inr(r.price) + "</td><td>" + (r.price < p.price ? pctOff(r.price, p.price) + "%" : "List price") + "</td></tr>"; }).join("") +
      '</tbody></table><p class="ds__small">GST ' + (p.gst || 18) + "% extra. Prices on " + longDate(new Date()) + ", sample data.</p></div>";
    return '<header class="ds__head"><div class="ds__logo">' + LOGO + "<span>Bearing<b>setu</b></span></div><p>Product datasheet<br>" + longDate(new Date()) + "</p></header>" +
      '<div class="ds__hero"><div><p class="ds__brand">' + esc(BS.brand(p.brand).name) + '</p><p class="ds__pn">' + esc(p.pn) + '</p><p class="ds__title">' + esc(p.title) + "</p>" +
      (BS.dims(p) ? '<p class="ds__dims">' + esc(BS.dims(p)) + "</p>" : "") + '<p class="ds__desc">' + esc(p.desc || "") + "</p></div>" +
      '<div class="ds__img">' + BS.imgTag(p.img, { large: true, eager: true, alt: "" }) + "</div></div>" +
      (canDraw(p) ? '<div class="ds__dw">' + drawingSVG(p) + "</div>" : "") +
      '<div class="ds__cols">' + groups.map(function (g) {
        return '<div class="ds__box"><h2>' + esc(g[0]) + "</h2><table><tbody>" + g[1].map(function (a) { return "<tr><th>" + esc(a[0]) + "</th><td>" + (a[2] ? a[1] : esc(a[1])) + "</td></tr>"; }).join("") + "</tbody></table></div>";
      }).join("") + tiers + eq + "</div>" +
      '<footer class="ds__foot"><p>Load ratings and speeds are typical catalogue values. Check the manufacturer’s datasheet for your application. ' + photoNote(p) + "</p>" +
      "<p>Bearingsetu · Pune, Maharashtra · orders@bearingsetu.com · " + esc(location.href.split("#")[0]) + "</p><p>Sample store. Prices, stock and data are sample content.</p></footer>";
  }
  function renderDatasheet() {
    if (!S.p) return;
    var ds = $(".ds");
    if (!ds) { ds = doc.createElement("section"); ds.className = "ds"; ds.setAttribute("aria-hidden", "true"); doc.body.appendChild(ds); }
    ds.innerHTML = datasheetHTML(S.p);
  }

  /* ================================================================ render */
  function render(p) {
    S.p = p;
    S.qty = Math.max(minQty(p), S.qty || 1);
    S.slide = 0;
    S.bundleSel = {};
    S.rvTried = false;
    S.pinTried = false;
    S.recent = safe(BS.recent.all, []).filter(function (x) { return x !== p.id; }).map(BS.byId).filter(Boolean).slice(0, 12);
    var secs = sectionList(p);
    var parts = [], n = 0;
    function cls() { return n++ % 2 ? "section--mist" : ""; }
    secs.forEach(function (s) {
      if (s.id === "overview") parts.push(overviewHTML(p, cls()));
      else if (s.id === "specs") parts.push(specsHTML(p, cls()));
      else if (s.id === "equivalents") parts.push(eqHTML(p, cls()));
      else if (s.id === "fits") parts.push(fitsHTML(p, cls()));
      else if (s.id === "reviews") parts.push(reviewsHTML(p, cls()));
      else if (s.id === "questions") parts.push(faqHTML(p, cls()));
    });
    main.innerHTML =
      '<div class="wrap pdp-top">' + crumbsHTML(p) +
        // DOM order (head, gallery, buy box) is the phone reading and Tab order; desktop places them with grid areas.
        '<div class="pdp">' + headHTML(p) + '<div class="pdp__gal">' + galleryHTML(p) + "</div>" + buyHTML(p) + "</div></div>" +
      '<nav class="secnav" aria-label="Product sections" data-secnav><div class="wrap"><ul class="secnav__list">' + secLinks(secs) + "</ul></div></nav>" +
      parts.join("") + recentHTML() + minibarHTML(p, secs) + bbarHTML(p) +
      '<p class="sr-only" aria-live="polite" data-announce></p>';
    document.title = fullName(p) + " · " + titleMain(p) + " · Bearingsetu";
    setMeta("description", fullName(p) + ": " + p.title + (BS.dims(p) ? " (" + BS.dims(p) + ")" : "") +
      " at " + inr(p.price) + " + GST. " + BS.stock(p).text + ". Tier prices, delivery date by pincode and a GST invoice on every order.");
    setMeta("og:title", fullName(p) + " · Bearingsetu", true);
    setMeta("og:description", p.desc || p.title, true);
    // A list that cannot be read is started again rather than stopping the page.
    try { BS.recent.add(p.id); } catch (e) { BS.store.set("recent", [p.id]); }
    // Header: highlight the section this part belongs to (Bearings, Seals and so on).
    if (BS.setNav && BS.navKey) BS.setNav(BS.navKey(p.cat));
    updateBuy();
    wireGallery();
    BS.reveal(main);
    BS.shelf(main);
    S.spy = "";
    onScroll();
  }
  function setMeta(name, content, prop) {
    var sel = prop ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    var m = doc.head.querySelector(sel);
    if (!m) { m = doc.createElement("meta"); m.setAttribute(prop ? "property" : "name", name); doc.head.appendChild(m); }
    m.setAttribute("content", content);
  }

  // Parts close to a code that did not match: try the whole code, then shorter forms of it,
  // then trimmed numbers ("62055" -> "6205"). The brand in the code, if any, ranks first.
  function closeMatches(id) {
    var tokens = String(id).toLowerCase().split(/[-_\s/]+/).filter(Boolean);
    if (!tokens.length) return [];
    var brandTok = BS.catalog.brands.some(function (b) { return b.id === tokens[0]; }) ? tokens[0] : null;
    var qs = [tokens.join(" ")];
    for (var k = tokens.length - 1; k >= 1; k--) qs.push(tokens.slice(0, k).join(" "));
    if (brandTok && tokens.length > 1) qs.push(tokens.slice(1).join(" "));
    tokens.forEach(function (t) { if (/\d/.test(t)) for (var n = t.length - 1; n >= 3; n--) qs.push(t.slice(0, n)); });
    for (var i = 0; i < qs.length; i++) {
      if (!qs[i] || qs[i] === brandTok) continue;
      // Only part number, equivalent or size hits (score 50+); loose word matches on a garbled code mislead.
      var res = BS.search(qs[i], 24).filter(function (r) { return r.score >= 50; });
      if (!res.length) continue;
      var list = res.map(function (r) { return r.p; });
      if (brandTok) list.sort(function (a, b) { return (b.brand === brandTok) - (a.brand === brandTok); });
      return list.slice(0, 8);
    }
    return [];
  }
  function renderNotFound(id) {
    S.p = null;
    var close = id ? closeMatches(id) : [];
    var best = BS.products.filter(function (p) { return (p.tags || []).indexOf("bestseller") !== -1; });
    if (best.length < 8) best = best.concat(BS.products.filter(function (p) { return best.indexOf(p) === -1 && p.stock > 0; }).sort(function (a, b) { return b.reviews - a.reviews; }).slice(0, 8 - best.length));
    best = best.filter(function (p) { return close.indexOf(p) === -1; }).slice(0, 8);
    function shelf(title, list, tid) {
      return '<section class="section section--tight" aria-labelledby="' + tid + '"><div class="wrap" data-shelf><div class="row-head"><h2 class="h3" id="' + tid + '">' + title + "</h2>" +
        (list.length > 4 ? '<div class="shelf-nav"><button type="button" data-shelf-prev aria-label="Previous">' + icon("caret-left") + '</button><button type="button" data-shelf-next aria-label="Next">' + icon("caret-right") + "</button></div>" : "") +
        '</div><div class="shelf" role="list">' + shelfCards(list) + "</div></div></section>";
    }
    main.innerHTML = '<div class="wrap pdp-top"><nav class="pdp-crumbs" aria-label="Breadcrumb"><ol class="crumbs"><li><a href="shop.html">Store</a></li><li aria-current="page">Part not found</li></ol></nav>' +
      '<div class="nf reveal">' + '<span class="nf__ic" aria-hidden="true">' + icon("magnifying-glass") + "</span>" +
      '<h1 class="h1 nf__title">We couldn’t find that part.</h1>' +
      '<p class="sub nf__sub">' + (id ? "There is no product with the code <span class=\"mono nf__code\">" + esc(id) + "</span>. The link may be old, or the part number may have a typing error." : "This link does not include a part number.") +
      " Search the catalogue by part number, size or name.</p>" +
      '<form class="nf__form" data-nf-form role="search"><label class="sr-only" for="nf-q">Search by part number, size or name</label>' + icon("magnifying-glass") +
      '<input class="nf__input" id="nf-q" name="q" type="search" autocomplete="off" spellcheck="false" value="' + esc(id || "") + '" placeholder="6205 2RS, 25x52x15, V-belt B48">' +
      '<button class="btn" type="submit">Search</button></form>' +
      '<p class="nf__alt">Have a number from another brand? <a href="tools.html#interchange">Find the equivalent</a> or <a href="quick-order.html#rfq">ask us to source it</a>.</p></div></div>' +
      (close.length ? shelf("Close matches", close.slice(0, 8), "nf-close") : "") +
      shelf(close.length ? "Popular parts" : "Popular parts. <span class=\"tone\">Ready to ship today.</span>", best, "nf-pop");
    document.title = "Part not found · Bearingsetu";
    setMeta("description", "We couldn’t find that part. Search Bearingsetu by part number, size or name.");
    BS.reveal(main);
    BS.shelf(main);
  }

  /* ================================================================ live updates */
  function announce(msg) { var a = $("[data-announce]", main); if (a) { a.textContent = ""; setTimeout(function () { a.textContent = msg; }, 60); } }
  function updateBuy() {
    var p = S.p;
    if (!p) return;
    var set = function (sel, html) { var el = $(sel, main); if (el) el.innerHTML = html; };
    set("[data-price-now]", priceNowHTML(p, S.qty));
    set("[data-price-was]", priceWasHTML(p, S.qty));
    set("[data-price-note]", priceNoteHTML(p, S.qty));
    set("[data-tiers]", tiersBodyHTML(p, S.qty));
    set("[data-qty-info]", qtyInfoHTML(p, S.qty));
    set("[data-mini-price]", priceNowHTML(p, S.qty));
    set("[data-bbar-price]", bbarPriceHTML(p));
    $$("[data-quote-link]", main).forEach(function (a) { a.setAttribute("href", quoteHref(p)); });
    updateDelivery();
    var st = $("[data-qty-stepper]", main);
    if (st) {
      var inp = $("input", st);
      if (doc.activeElement !== inp) inp.value = S.qty;
      var minus = $('[data-step="-1"]', st);
      if (minus) minus.disabled = S.qty <= minQty(p);
    }
  }
  // The cut-off line and the delivery window follow the quantity (more than the stock waits for sourcing)
  // and the clock. Each changes only when its text does, so the live region is not repeated.
  function updateDelivery() {
    var p = S.p;
    if (!p) return;
    var row = $("[data-cut-row]", main), cut = cutoffText(p);
    if (row) {
      row.hidden = !cut;
      var c = $("[data-cutoff]", row);
      if (c.textContent !== cut) c.textContent = cut;
    }
    var res = $("[data-del-res]", main), pin = savedPin();
    if (res && pin && res.getAttribute("data-when") !== deliveryWhen(p, pin)) $("[data-del]", main).innerHTML = deliveryHTML(p);
  }
  function setQty(v, opts) {
    opts = opts || {};
    var p = S.p;
    var n = parseInt(v, 10);
    if (!isFinite(n)) n = minQty(p);
    n = Math.max(minQty(p), Math.min(99999, n));
    S.qty = n;
    var inp = $("[data-qty-stepper] input", main);
    if (inp && (opts.force || doc.activeElement !== inp)) inp.value = n;
    updateBuy();
  }
  function refreshPrices() {
    if (!S.p) return;
    $$("[data-act=gst]", main).forEach(function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-v") === "inc") === isInc())); });
    updateBuy();
    var foot = $("[data-bundle-foot]", main);
    if (foot) {
      var box = $("[data-bundle-box]", main);
      bundleItems(S.p).forEach(function (x) {
        var line = box && $('[data-bundle="' + x.id + '"]', box);
        if (line) $(".bundle__price", line.closest("label")).textContent = money(round2(BS.unitPrice(x, minQty(x)) * minQty(x)));
      });
      updateBundleFoot();
    }
    var eqb = $("[data-eq-body]", main);
    if (eqb) {
      var sec = eqb.closest("section");
      var fresh = doc.createElement("div");
      fresh.innerHTML = eqHTML(S.p, "");
      var nb = $("[data-eq-body]", fresh);
      eqb.innerHTML = nb.innerHTML;
      var th = $("thead th:nth-child(3)", sec);
      if (th) th.textContent = "Price " + (isInc() ? "incl. GST" : "+ GST");
    }
    [["[data-fits-shelf]", fitsShelf(S.p)], ["[data-recent-shelf]", S.recent]].forEach(function (x) {
      var el = $(x[0], main);
      if (el) { var left = el.scrollLeft; el.innerHTML = shelfCards(x[1]); el.scrollLeft = left; }
    });
  }
  function updateInBag() {
    var el = $("[data-inbag]", main);
    if (el && S.p) el.innerHTML = inBagHTML(S.p);
  }

  /* ================================================================ gallery */
  var galTick = false;
  function wireGallery() {
    var track = $("[data-gal-track]", main);
    if (!track) return;
    track.addEventListener("scroll", function () {
      if (galTick) return;
      galTick = true;
      requestAnimationFrame(function () {
        galTick = false;
        var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        if (i !== S.slide) setSlideUI(i);
      });
    }, { passive: true });
  }
  function setSlideUI(i) {
    var n = S.slides.length;
    i = Math.max(0, Math.min(n - 1, i));
    S.slide = i;
    $$("[data-act=slide]", main).forEach(function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-i") === i)); });
    $$(".gal__open", main).forEach(function (b) { b.setAttribute("tabindex", +b.getAttribute("data-i") === i ? "0" : "-1"); });
    var prev = $("[data-act=prev]", main), next = $("[data-act=next]", main);
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === n - 1;
  }
  function goSlide(i, focus) {
    var track = $("[data-gal-track]", main);
    if (!track) return;
    i = Math.max(0, Math.min(S.slides.length - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: smooth() });
    setSlideUI(i);
    if (focus) { var b = $('.gal__open[data-i="' + i + '"]', main); if (b) b.focus({ preventScroll: true }); }
  }
  function flyImg() {
    if (S.slide === 0) { var im = $('.gal__slide[data-slide="0"] img', main); if (im && im.getBoundingClientRect().bottom > NAV_H) return im; }
    return $(".gal__thumb--photo img", main) || $(".minibar__img img", main);
  }

  /* ================================================================ lightbox */
  function lbEl() {
    var lb = $("[data-lb]");
    if (lb) return lb;
    lb = doc.createElement("div");
    lb.className = "lb";
    lb.setAttribute("data-lb", "");
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-labelledby", "lb-title");
    lb.hidden = true;
    lb.innerHTML = '<div class="lb__bar"><p class="lb__title" id="lb-title"><strong data-lb-name></strong><span data-lb-count></span></p>' +
      '<button class="icon-btn lb__close" type="button" data-lb-close aria-label="Close full screen view">' + icon("x") + "</button></div>" +
      '<div class="lb__stage" data-lb-stage></div>' +
      '<button class="lb__nav lb__nav--prev" type="button" data-lb-prev aria-label="Previous image">' + icon("caret-left") + "</button>" +
      '<button class="lb__nav lb__nav--next" type="button" data-lb-next aria-label="Next image">' + icon("caret-right") + "</button>" +
      '<div class="lb__thumbs" role="group" aria-label="Choose image" data-lb-thumbs></div>';
    doc.body.appendChild(lb);
    lb.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-lb-close]")) return closeLb();
      if (t.closest("[data-lb-prev]")) return lbGo(S.lbI - 1);
      if (t.closest("[data-lb-next]")) return lbGo(S.lbI + 1);
      var th = t.closest("[data-lb-i]");
      if (th) return lbGo(+th.getAttribute("data-lb-i"));
      if (t.classList.contains("lb__stage") || t.classList.contains("lb__slide")) closeLb();
    });
    // Keys are taken at the document (capture phase) while the lightbox is open, so they work even when
    // a click on the picture has left focus on <body>, and the site's own shortcuts (search, Escape) stay out.
    doc.addEventListener("keydown", function (e) {
      if (!S.lbOpen) return;
      var k = e.key;
      if (k === "Escape") { e.preventDefault(); e.stopPropagation(); closeLb(); return; }
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "Home" || k === "End") {
        e.preventDefault(); e.stopPropagation();
        lbGo(k === "Home" ? 0 : k === "End" ? S.slides.length - 1 : S.lbI + (k === "ArrowRight" ? 1 : -1));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && String(k).toLowerCase() === "k") { e.preventDefault(); e.stopPropagation(); return; }
      if (k === "Tab") {
        var f = $$("button:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])", lb).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1], a = doc.activeElement;
        if (!lb.contains(a)) { (e.shiftKey ? last : first).focus(); e.preventDefault(); }
        else if (e.shiftKey && a === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && a === last) { first.focus(); e.preventDefault(); }
      }
    }, true);
    var x0 = null;
    lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) lbGo(S.lbI + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    return lb;
  }
  function openLb(i) {
    var p = S.p, lb = lbEl();
    S.lbLast = doc.activeElement;
    $("[data-lb-thumbs]", lb).innerHTML = S.slides.map(function (sl, k) {
      var inner = sl.kind === "photo" ? BS.imgTag(p.img, { alt: "", sizes: "64px" }) : sl.kind === "drawing" ? drawingSVG(p, { mini: true }) : '<span class="gal__tlabel">' + icon("list-checks") + "<span>Specs</span></span>";
      return '<button class="gal__thumb gal__thumb--' + sl.kind + '" type="button" data-lb-i="' + k + '" aria-label="Show ' + esc(sl.label.toLowerCase()) + '" aria-pressed="false">' + inner + "</button>";
    }).join("");
    lb.hidden = false;
    S.lbOpen = true;
    doc.body.classList.add("is-locked");
    requestAnimationFrame(function () { lb.classList.add("is-open"); });
    lbGo(i, true);
    $("[data-lb-close]", lb).focus();
  }
  function lbGo(i, first) {
    var p = S.p, lb = lbEl(), n = S.slides.length;
    i = Math.max(0, Math.min(n - 1, i));
    if (i === S.lbI && !first) return;
    S.lbI = i;
    var sl = S.slides[i];
    $("[data-lb-stage]", lb).innerHTML = '<div class="lb__slide lb__slide--' + sl.kind + '">' + slideInner(p, sl, true) + "</div>";
    $("[data-lb-name]", lb).textContent = fullName(p) + " · " + sl.label;
    $("[data-lb-count]", lb).textContent = (i + 1) + " of " + n;
    $("[data-lb-prev]", lb).disabled = i === 0;
    $("[data-lb-next]", lb).disabled = i === n - 1;
    $$("[data-lb-i]", lb).forEach(function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-lb-i") === i)); });
    goSlide(i);
  }
  function closeLb() {
    var lb = $("[data-lb]");
    if (!lb || lb.hidden) return;
    S.lbOpen = false;
    lb.classList.remove("is-open");
    doc.body.classList.remove("is-locked");
    setTimeout(function () { if (!lb.classList.contains("is-open")) { lb.hidden = true; $("[data-lb-stage]", lb).innerHTML = ""; } }, 260);
    var back = $('.gal__open[data-i="' + S.slide + '"]', main) || S.lbLast;
    if (back && back.focus) back.focus({ preventScroll: true });
  }

  /* ================================================================ forms */
  function setErr(input, errEl, msg) {
    if (!errEl) return;
    errEl.textContent = msg || "";
    if (input) { if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
  }
  function pinMsg(v) {
    if (!v) return "Enter a pincode to see the delivery date.";
    if (!/^\d{6}$/.test(v)) return "Enter a 6-digit pincode, for example 411019.";
    if (v.charAt(0) === "0") return "Pincodes in India do not start with 0. Check the first digit.";
    return "";
  }
  function submitPin(form) {
    var inp = $("#pin-input", form), err = $("#pin-err", form);
    var v = inp.value.replace(/\D/g, "");
    S.pinTried = true;
    var msg = pinMsg(v);
    setErr(inp, err, msg);
    if (msg) { inp.focus(); return; }
    savePin(v);
    $("[data-del]", main).innerHTML = deliveryHTML(S.p);
    var btn = $("[data-act=pin-edit]", main);
    if (btn) btn.focus();
  }
  var RV_FIELDS = ["rvTitle", "rvBody", "rvName"];
  function rvCheck(form, only) {
    var el = form.elements;
    var vals = { rvRating: (form.querySelector("[name=rvRating]:checked") || {}).value || "", rvTitle: el.rvTitle.value.trim(), rvBody: el.rvBody.value.trim(), rvName: el.rvName.value.trim() };
    var errs = {};
    if (!vals.rvRating) errs.rvRating = "Choose a rating from 1 to 5 stars.";
    if (vals.rvTitle.length < 4) errs.rvTitle = vals.rvTitle ? "Make the title a little longer, at least 4 characters." : "Add a short title for your review.";
    if (vals.rvBody.length < 20) errs.rvBody = vals.rvBody ? "Tell other buyers a bit more. Use at least 20 characters (" + vals.rvBody.length + " so far)." : "Write a few lines about how the part fitted and ran.";
    if (vals.rvName.length < 2) errs.rvName = "Enter the name to show with your review.";
    var map = { rvTitle: "rv-title", rvBody: "rv-body", rvName: "rv-name" };
    if (!only || only === "rvRating") {
      $("#rv-rating-err", form).textContent = errs.rvRating || "";
      var fs = $(".rate", form);
      if (errs.rvRating) fs.classList.add("is-invalid"); else fs.classList.remove("is-invalid");
    }
    RV_FIELDS.forEach(function (k) { if (!only || only === k) setErr(el[k], $("#" + map[k] + "-err", form), errs[k]); });
    return { ok: !Object.keys(errs).length, errs: errs, vals: vals };
  }
  function submitReview(form) {
    S.rvTried = true;
    var res = rvCheck(form);
    if (!res.ok) {
      var first = res.errs.rvRating ? form.querySelector("[name=rvRating]") : form.elements[["rvTitle", "rvBody", "rvName"].filter(function (k) { return res.errs[k]; })[0]];
      if (first) first.focus();
      announce("Please fix " + BS.plural(Object.keys(res.errs).length, "field") + " in the review form.");
      return;
    }
    var btn = $("[data-rv-submit]", form);
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
    var p = S.p;
    setTimeout(function () {
      var now = new Date();
      var iso = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      var city = form.elements.rvCity.value.trim();
      var r = { rating: +res.vals.rvRating, title: res.vals.rvTitle, body: res.vals.rvBody, name: res.vals.rvName, city: city, role: "", company_type: "", date: iso };
      var all = myReviews();
      all[p.id] = r;
      BS.store.set("myReviews", all);
      $("[data-rv-list]", main).innerHTML = reviewsListHTML(p);
      var w = $("[data-rv-write]", main);
      w.innerHTML = '<div class="notice notice--green rvs__ok" tabindex="-1">' + icon("check-circle") + "<p><strong>Thanks, " + esc(r.name.split(" ")[0]) + ".</strong> Your review is saved and pending moderation. It shows at the top of the list for you now, and for everyone once it is checked.</p></div>";
      $(".rvs__ok", w).focus();
      BS.toast("Review submitted for moderation.", { icon: "check-circle" });
    }, 650);
  }

  /* ================================================================ actions */
  function share() {
    var p = S.p, url = location.href.split("#")[0];
    if (navigator.share) {
      navigator.share({ title: document.title, text: fullName(p) + " · " + titleMain(p) + " · Bearingsetu", url: url }).catch(function () {});
      return;
    }
    copyText(url).then(function (ok) {
      if (ok) BS.toast("Link copied. Paste it into an email or chat.", { icon: "copy" });
      else BS.toast("Copy this link: " + esc(url), { icon: "info", ms: 8000 });
    });
  }
  function copyText(s) {
    function fallback() {
      try {
        var ta = doc.createElement("textarea");
        ta.value = s; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0";
        doc.body.appendChild(ta); ta.select();
        var ok = doc.execCommand("copy");
        ta.remove();
        return ok;
      } catch (e) { return false; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return fallback(); });
    return Promise.resolve(fallback());
  }
  function addMain(btn, fly) {
    var p = S.p;
    BS.addToBag(p.id, S.qty, fly);
    if (btn && btn.classList.contains("buy__add")) {
      btn.classList.add("is-done");
      btn.innerHTML = icon("check") + "<span>Added to bag</span>";
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { btn.classList.remove("is-done"); btn.innerHTML = icon("handbag") + "<span>Add to bag</span>"; }, 1800);
    } else if (btn) {
      var label = btn.textContent;
      btn.textContent = "Added";
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { btn.textContent = label === "Added" ? "Add to bag" : label; }, 1500);
    }
  }
  function switchVariant(id, axis, btn) {
    var to = BS.byId(id);
    if (!to || to === S.p) return;
    var from = S.p;
    var model = variantModel(from);
    var info = model ? chipTarget(model, from, axis, axisVal(to, axis)) : { changes: [] };
    var y = window.scrollY;
    history.replaceState(null, "", BS.url(to));
    render(to);
    window.scrollTo({ top: y, behavior: "instant" });
    var chip = $('[data-act=variant][data-axis="' + axis + '"][data-v="' + CSS.escape(String(axisVal(to, axis))) + '"]', main);
    if (chip) chip.focus({ preventScroll: true });
    var msg = info.changes && info.changes.length ?
      "Switched to the " + fullName(to) + ". " + info.changes.map(function (c) { return c.label + " changed to " + valLabel(c.key, c.to); }).join(", ") + ", the closest match." : "";
    var m = $("[data-variant-msg]", main);
    if (m) m.innerHTML = msg ? icon("info") + "<span>" + esc(msg) + "</span>" : "";
    announce("Now showing the " + fullName(to) + ", " + money(to.price) + " " + gstWord() + ". " + (msg ? msg : ""));
  }

  /* ================================================================ events */
  main.addEventListener("click", function (e) {
    var t = e.target, el = t.closest("[data-act]");
    if (!el || !main.contains(el)) return;
    var act = el.getAttribute("data-act");
    switch (act) {
      case "slide": goSlide(+el.getAttribute("data-i")); break;
      case "prev": goSlide(S.slide - 1); break;
      case "next": goSlide(S.slide + 1); break;
      case "lb-open": openLb(+el.getAttribute("data-i")); break;
      case "gst": BS.setPref("gst", el.getAttribute("data-v")); break;
      case "tier": setQty(+el.getAttribute("data-q"), { force: true }); announce("Quantity set to " + S.qty + ". " + money(BS.unitPrice(S.p, S.qty)) + " per " + unitOf(S.p) + "."); break;
      case "variant": if (el.getAttribute("aria-pressed") !== "true") switchVariant(el.getAttribute("data-to"), el.getAttribute("data-axis"), el); break;
      case "add": addMain(el, flyImg()); break;
      case "mini-add": addMain(el, isDesk() ? $(".minibar__img img", main) : null); break;
      case "buynow":
        if (el.classList.contains("is-loading")) break;
        // Checkout gets the quantity chosen here, whatever was already in the bag for this part.
        BS.cart.set(S.p.id, Math.max(S.qty, minQty(S.p)));
        el.classList.add("is-loading");
        el.setAttribute("aria-busy", "true");
        location.href = "checkout.html";
        break;
      case "share": share(); break;
      case "datasheet": renderDatasheet(); window.print(); break;
      case "pin-edit": {
        var del = $("[data-del]", main);
        del.innerHTML = pinFormHTML(savedPin());
        var pi = $("#pin-input", del);
        pi.focus(); pi.select();
        break;
      }
      case "rv-open": {
        var form = $("[data-rv-form]", main);
        if (!form) break;
        form.hidden = false;
        var rvs = form.closest(".rvs"); if (rvs) rvs.classList.add("is-writing");
        $$("[data-act=rv-open]", main).forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
        var opener = $(".rvs__write [data-act=rv-open]", main);
        if (opener) opener.hidden = true;
        var ask = $(".rvs__ask", main); if (ask) ask.hidden = true;
        var r1 = $("#rv-r1", form);
        if (r1) r1.focus();
        break;
      }
      case "rv-cancel": {
        var f2 = $("[data-rv-form]", main);
        f2.hidden = true;
        var rvs2 = f2.closest(".rvs"); if (rvs2) rvs2.classList.remove("is-writing");
        $$("[data-act=rv-open]", main).forEach(function (b) { b.hidden = false; b.setAttribute("aria-expanded", "false"); });
        var op = $(".rvs__write [data-act=rv-open]", main) || $(".rv-empty [data-act=rv-open]", main);
        if (op) op.focus();
        var ask2 = $(".rvs__ask", main); if (ask2) ask2.hidden = false;
        break;
      }
      case "rv-remove": {
        var all = myReviews();
        delete all[S.p.id];
        BS.store.set("myReviews", all);
        var sec = $("#reviews", main);
        var tmp = doc.createElement("div");
        tmp.innerHTML = reviewsHTML(S.p, sec.classList.contains("section--mist") ? "section--mist" : "");
        var fresh = tmp.firstChild;
        $$(".reveal", fresh).forEach(function (x) { x.classList.add("is-in"); });
        sec.replaceWith(fresh);
        BS.toast("Your review was removed.", { icon: "trash" });
        var opn = $(".rvs__write [data-act=rv-open]", main) || $(".rv-empty [data-act=rv-open]", main); if (opn) opn.focus();
        break;
      }
      case "helpful": {
        var key = el.getAttribute("data-key"), hm = helpfulMap();
        var on = !hm[key];
        if (on) hm[key] = 1; else delete hm[key];
        BS.store.set("helpful", hm);
        el.setAttribute("aria-pressed", String(on));
        $("[data-count]", el).textContent = "(" + (+el.getAttribute("data-base") + (on ? 1 : 0)) + ")";
        break;
      }
      case "faq": {
        var open = el.getAttribute("aria-expanded") !== "true";
        el.setAttribute("aria-expanded", String(open));
        el.closest(".faq").classList.toggle("is-open", open);
        break;
      }
      case "bundle-add": {
        var items = bundleItems(S.p).filter(function (x) { return (S.bundleSel || {})[x.id] !== false; });
        if (!items.length) break;
        items.forEach(function (x) { BS.cart.add(x.id, minQty(x)); });
        BS.flyToBag($(".bundle__pic:not(.is-off) img", main));
        BS.toast(items.length > 1 ? "<strong>" + BS.plural(items.length, "part") + "</strong> added to your bag." : "<strong>" + esc(fullName(items[0])) + "</strong> added to your bag.", { label: "View bag", onAction: BS.openCart });
        el.innerHTML = icon("check") + "Added";
        clearTimeout(el._t);
        el._t = setTimeout(updateBundleFoot, 1600);
        break;
      }
    }
  });

  // Runs after the shared stepper handler in site.js (registered later on the same node).
  doc.addEventListener("change", function (e) {
    var t = e.target;
    if (!main.contains(t)) return;
    if (t.closest("[data-qty-stepper]")) { setQty(t.value, { force: true }); return; }
    if (t.matches("[data-bundle]")) {
      S.bundleSel = S.bundleSel || {};
      S.bundleSel[t.getAttribute("data-bundle")] = t.checked;
      var pic = $('[data-bundle-pic="' + t.getAttribute("data-bundle") + '"]', main);
      if (pic) pic.classList.toggle("is-off", !t.checked);
      updateBundleFoot();
      return;
    }
    if (t.name === "rvRating") {
      var box = t.closest("[data-rate]");
      box.setAttribute("data-v", t.value);
      var words = ["Poor", "Fair", "Good", "Very good", "Excellent"];
      $("[data-rate-word]", box).textContent = words[t.value - 1];
      if (S.rvTried) rvCheck(t.form, "rvRating");
    }
  });
  main.addEventListener("input", function (e) {
    var t = e.target;
    if (t.closest("[data-qty-stepper]")) {
      var n = parseInt(t.value, 10);
      if (isFinite(n) && n >= minQty(S.p)) { S.qty = Math.min(99999, n); updateBuy(); }
      return;
    }
    if (t.id === "pin-input") {
      var clean = t.value.replace(/\D/g, "").slice(0, 6);
      if (clean !== t.value) t.value = clean;
      if (S.pinTried && t.getAttribute("aria-invalid") === "true" && !pinMsg(clean)) setErr(t, $("#pin-err", main), "");
      return;
    }
    if (S.rvTried && t.form && t.form.hasAttribute("data-rv-form") && t.getAttribute("aria-invalid") === "true") rvCheck(t.form, t.name);
  });
  main.addEventListener("focusout", function (e) {
    var t = e.target;
    if (t.closest && t.closest("[data-qty-stepper]") && t.tagName === "INPUT") { setQty(t.value, { force: true }); return; }
    if (t.id === "pin-input" && S.pinTried) { setErr(t, $("#pin-err", main), pinMsg(t.value.replace(/\D/g, ""))); return; }
    if (S.rvTried && t.form && t.form.hasAttribute("data-rv-form") && t.name && t.name !== "rvCity") rvCheck(t.form, t.name);
  });
  main.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.hasAttribute("data-pin-form")) { e.preventDefault(); submitPin(f); }
    else if (f.hasAttribute("data-rv-form")) { e.preventDefault(); submitReview(f); }
    else if (f.hasAttribute("data-nf-form")) { e.preventDefault(); BS.openSearch($("#nf-q", f).value.trim()); }
  });
  main.addEventListener("keydown", function (e) {
    var t = e.target;
    // gallery: arrow keys move between slides and between thumbnails
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && t.closest && (t.closest(".gal__open") || t.closest("[data-gal-thumbs]") || t.closest(".gal__dots"))) {
      e.preventDefault();
      var i = S.slide + (e.key === "ArrowRight" ? 1 : -1);
      goSlide(i, !!t.closest(".gal__open"));
      if (!t.closest(".gal__open")) {
        var grp = t.closest("[data-gal-thumbs]") || t.closest(".gal__dots");
        var b = $('[data-i="' + S.slide + '"]', grp);
        if (b) b.focus();
      }
    }
    if (t.closest && t.closest(".rate") && (e.key === "Enter")) e.preventDefault();
    // Escape while changing the pincode puts back the date for the saved one.
    if (e.key === "Escape" && t.id === "pin-input" && savedPin() && S.p) {
      e.preventDefault();
      $("[data-del]", main).innerHTML = deliveryHTML(S.p);
      var ch = $("[data-act=pin-edit]", main);
      if (ch) ch.focus();
    }
  });
  main.addEventListener("mouseover", function (e) {
    var l = e.target.closest && e.target.closest(".rate__stars label");
    if (!l) return;
    var box = l.closest("[data-rate]");
    box.setAttribute("data-h", l.getAttribute("for").slice(-1));
  });
  main.addEventListener("mouseout", function (e) {
    var box = e.target.closest && e.target.closest("[data-rate]");
    if (box && !box.contains(e.relatedTarget)) box.removeAttribute("data-h");
  });
  // The phone bottom bar steps aside while the keyboard is up.
  main.addEventListener("focusin", function (e) { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) doc.body.classList.add("pdp-typing"); });
  main.addEventListener("focusout", function () { setTimeout(function () { if (!/^(INPUT|TEXTAREA|SELECT)$/.test((doc.activeElement || {}).tagName || "")) doc.body.classList.remove("pdp-typing"); }, 0); });

  /* scroll: mini bar (desktop), bottom bar (phones) and the section highlight */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; updateBars(); spy(); });
  }
  function updateBars() {
    if (!S.p) return;
    var pdp = $(".pdp", main), act = $("[data-buy-actions]", main), mini = $("[data-minibar]", main), bbar = $("[data-bbar]", main);
    if (!pdp || !act) return;
    var desk = isDesk();
    var showMini = desk && pdp.getBoundingClientRect().bottom < NAV_H + 8;
    var showB = !desk && act.getBoundingClientRect().bottom < NAV_H + 4;
    var wasB = doc.body.classList.contains("pdp-bbar-on");
    if (mini) mini.classList.toggle("is-on", showMini);
    if (bbar) bbar.classList.toggle("is-on", showB);
    doc.body.classList.toggle("pdp-mini-on", showMini);
    doc.body.classList.toggle("pdp-bbar-on", showB);
    if (showB && !wasB && bbar) clearOfBar(bbar);
  }
  // The bottom bar can rise over the control that keyboard focus has just scrolled to the
  // bottom edge (the scroll itself brings the bar in). Lift that control above the bar.
  function clearOfBar(bar) {
    var a = doc.activeElement;
    if (!a || a === doc.body || bar.contains(a) || doc.body.classList.contains("pdp-typing")) return;
    if (!safe(function () { return a.matches(":focus-visible"); }, false)) return;
    var r = a.getBoundingClientRect(), limit = window.innerHeight - (bar.offsetHeight || 72) - 16;
    if (r.bottom > limit && r.top < window.innerHeight) window.scrollBy({ top: r.bottom - limit, behavior: smooth() });
  }
  function spy() {
    if (!S.p) return;
    var secs = $$("[data-sec]", main);
    var line = NAV_H + (isDesk() ? 64 : 56) + 24;
    var cur = "";
    secs.forEach(function (s) { if (s.getBoundingClientRect().top <= line) cur = s.id; });
    if (cur === S.spy) return;
    S.spy = cur;
    $$("[data-sec-link]", main).forEach(function (a) {
      if (a.getAttribute("data-sec-link") === cur) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    // keep the highlighted link visible in the horizontally scrolling lists
    $$(".secnav__list, .minibar__nav ul", main).forEach(function (list) {
      var a = cur && $('[data-sec-link="' + cur + '"]', list);
      if (!a || list.scrollWidth <= list.clientWidth) return;
      var li = a.parentNode;
      list.scrollTo({ left: Math.max(0, li.offsetLeft - list.clientWidth / 2 + li.offsetWidth / 2), behavior: smooth() });
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", BS.debounce(function () { onScroll(); var tr = $("[data-gal-track]", main); if (tr) tr.scrollLeft = S.slide * tr.clientWidth; }, 120));
  window.addEventListener("beforeprint", renderDatasheet);
  // The 4 pm cut-off line counts down while the page stays open, and the delivery window moves on after it.
  setInterval(updateDelivery, 30000);
  // Coming back from checkout with the Back button shows the page as it was left: clear busy buttons.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) $$(".is-loading", main).forEach(function (b) { b.classList.remove("is-loading"); b.removeAttribute("aria-busy"); });
  });

  BS.on("prefs", refreshPrices);
  BS.on("cart", updateInBag);
  BS.on("wish", function (d) {
    if (!S.p || !d || d.id !== S.p.id) return;
    var l = $("[data-fav-label]", main);
    if (l) l.textContent = d.on ? "Saved to list" : "Save to list";
  });

  /* ================================================================ start */
  try {
    var id = (BS.params().get("id") || "").trim();
    var p = id ? BS.byId(id) : null;
    if (!p && id) {
      // Forgive case and spacing differences in shared links.
      var lid = id.toLowerCase().replace(/\s+/g, "-");
      p = BS.byId(lid) || null;
    }
    if (!p) { renderNotFound(id); return; }
    S.qty = minQty(p);
    if (p.id !== id) history.replaceState(null, "", BS.url(p) + location.hash);
    render(p);
    if (location.hash && location.hash.length > 1) {
      var target = doc.getElementById(location.hash.slice(1));
      if (target) setTimeout(function () { target.scrollIntoView(); }, 30);
    }
  } catch (err) {
    main.innerHTML = loadErrorHTML();
    if (window.console) console.warn("Product page could not render", err);
  }
})();
