/* Shop listing: search results and browsing with category-specific filters.
   State lives in the URL, so every search and filter combination can be shared or bookmarked. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, icon = BS.icon;
  var PAGE = 24;
  var SEAL = { Open: "Open", ZZ: "Shielded (ZZ)", "2RS": "Sealed (2RS)" };

  /* ---------------------------------------------------------- filter schema */
  var FACETS = {
    brand:    { label: "Brand", param: "brand", get: function (p) { return p.brand; }, name: function (v) { return BS.brand(v).name; } },
    seal:     { label: "Seal or shield", param: "seal", get: function (p) { return p.seal; }, name: function (v) { return SEAL[v] || v; } },
    clr:      { label: "Internal clearance", param: "clr", get: function (p) { return p.clr; }, name: function (v) { return v === "CN" ? "Normal (CN)" : v === "C3" ? "C3 (greater than normal)" : v; } },
    section:  { label: "Belt section", param: "section", get: function (p) { return p.spec && p.spec.section; } },
    profile:  { label: "Profile", param: "profile", get: function (p) { return p.spec && p.spec.profile; } },
    stype:    { label: "Seal type", param: "stype", get: function (p) { return p.spec && p.spec.sealType; } },
    material: { label: "Material", param: "material", get: function (p) { return p.spec && p.spec.material; } },
    nlgi:     { label: "NLGI grade", param: "nlgi", get: function (p) { return p.spec && p.spec.nlgi; } },
    vg:       { label: "ISO viscosity grade", param: "vg", get: function (p) { return p.spec && p.spec.isoVg; }, name: function (v) { return "ISO VG " + v; } },
    pitch:    { label: "Chain pitch", param: "pitch", get: function (p) { return p.spec && p.spec.pitchMm != null ? String(p.spec.pitchMm) : null; }, name: function (v) { return v + " mm"; } }
  };
  var RANGES = {
    d:   { param: "d", min: "dmin", max: "dmax", get: function (p) { return p.d; } },
    D:   { param: "D", min: "Dmin", max: "Dmax", get: function (p) { return p.D; } },
    B:   { param: "B", min: "Bmin", max: "Bmax", get: function (p) { return p.B; } },
    len: { param: "len", min: "lmin", max: "lmax", get: function (p) { return p.spec && p.spec.lengthMm; } }
  };
  var SCHEMAS = {
    bearings: { ranges: [["d", "Bore d (mm)"], ["D", "Outside diameter D (mm)"], ["B", "Width B (mm)"]], facets: ["seal", "clr", "brand"] },
    "housed-units": { ranges: [["d", "Shaft size (mm)"]], facets: ["brand"] },
    "belts-pulleys": { ranges: [["len", "Length (mm)"]], facets: ["section", "profile", "brand"] },
    seals: { ranges: [["d", "Shaft or inside diameter (mm)"], ["D", "Housing bore (mm)"], ["B", "Width (mm)"]], facets: ["stype", "material", "brand"] },
    lubrication: { ranges: [], facets: ["nlgi", "vg", "brand"] },
    "power-transmission": { ranges: [], facets: ["pitch", "brand"] },
    "linear-motion": { ranges: [["d", "Shaft size (mm)"]], facets: ["brand"] },
    "mounting-tools": { ranges: [], facets: ["brand"] },
    generic: { ranges: [], facets: ["brand"] }
  };
  function schemaFor(cats) {
    if (!cats.length) return SCHEMAS.generic;
    if (cats.every(function (c) { return c === "ball-bearings" || c === "roller-bearings"; })) return SCHEMAS.bearings;
    if (cats.length === 1) return SCHEMAS[cats[0]] || SCHEMAS.generic;
    if (cats.every(function (c) { return c === "ball-bearings" || c === "roller-bearings" || c === "housed-units"; })) return SCHEMAS.bearings;
    return SCHEMAS.generic;
  }

  /* ------------------------------------------------------------------ state */
  var S;
  function list(v) { return v ? String(v).split(",").map(function (x) { return x.trim(); }).filter(Boolean) : []; }
  function numP(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function parse() {
    var P = BS.params();
    S = { q: (P.get("q") || "").trim().slice(0, 120), cat: list(P.get("cat")), sub: list(P.get("sub")), f: {}, r: {}, sort: P.get("sort") || "", view: P.get("view") || BS.store.get("view", "grid"), page: Math.max(1, parseInt(P.get("page"), 10) || 1) };
    Object.keys(FACETS).forEach(function (k) { S.f[k] = list(P.get(FACETS[k].param)); });
    Object.keys(RANGES).forEach(function (k) {
      var R = RANGES[k], ex = numP(P.get(R.param)), mn = numP(P.get(R.min)), mx = numP(P.get(R.max));
      if (ex != null) { mn = ex - 0.6; mx = ex + 0.6; if (k === "len") { mn = ex - Math.max(2, ex * 0.01); mx = ex + Math.max(2, ex * 0.01); } }
      S.r[k] = { min: mn, max: mx, exact: ex };
    });
  }
  function cats() { var out = []; S.cat.forEach(function (c) { BS.resolveCats(c).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); }); }); return out; }
  function hrefWith(over) {
    var P = new URLSearchParams();
    var o = Object.assign({ q: S.q, cat: S.cat.join(","), sub: S.sub.join(","), sort: S.sort }, over || {});
    ["q", "cat", "sub", "sort"].forEach(function (k) { if (o[k]) P.set(k, o[k]); });
    Object.keys(FACETS).forEach(function (k) { var v = over && over["f_" + k] !== undefined ? over["f_" + k] : S.f[k].join(","); if (v) P.set(FACETS[k].param, v); });
    Object.keys(RANGES).forEach(function (k) {
      var R = RANGES[k], r = S.r[k];
      if (over && over["r_" + k] === null) return;
      if (r.exact != null) P.set(R.param, r.exact); else { if (r.min != null) P.set(R.min, r.min); if (r.max != null) P.set(R.max, r.max); }
    });
    if (o.view && o.view !== "grid") P.set("view", o.view);
    if (o.page > 1) P.set("page", o.page);
    var s = P.toString();
    return "shop.html" + (s ? "?" + s : "");
  }
  function writeUrl() {
    var u = hrefWith({ view: S.view, page: S.page });
    try { history.replaceState(null, "", u); } catch (e) { /* file:// or sandbox */ }
  }

  /* -------------------------------------------------------------- matching */
  function inRange(p, k) {
    var r = S.r[k]; if (r.min == null && r.max == null) return true;
    var v = RANGES[k].get(p); if (v == null) return false;
    return (r.min == null || v >= r.min - 1e-9) && (r.max == null || v <= r.max + 1e-9);
  }
  function passes(p, skipFacet, skipSub) {
    var c = cats();
    if (c.length && c.indexOf(p.cat) < 0) return false;
    if (!skipSub && S.sub.length && S.sub.indexOf(p.sub) < 0) return false;
    for (var k in FACETS) {
      if (k === skipFacet || !S.f[k].length) continue;
      var v = FACETS[k].get(p);
      if (v == null || S.f[k].indexOf(String(v)) < 0) return false;
    }
    for (var r in RANGES) if (!inRange(p, r)) return false;
    return true;
  }
  var pool = [];
  function items() { return S.q ? BS.search(S.q) : BS.products.map(function (p) { return { p: p, via: null }; }); }
  function sizeKey(p) { return [p.d == null ? 1e9 : p.d, p.D == null ? 1e9 : p.D, p.B == null ? 1e9 : p.B]; }
  function sorter(sort) {
    var by = {
      pn: function (a, b) { return a.p.pn.localeCompare(b.p.pn, undefined, { numeric: true }); },
      size: function (a, b) { var x = sizeKey(a.p), y = sizeKey(b.p); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.p.pn.localeCompare(b.p.pn, undefined, { numeric: true }); },
      brand: function (a, b) { return BS.brand(a.p.brand).name.localeCompare(BS.brand(b.p.brand).name) || a.p.pn.localeCompare(b.p.pn, undefined, { numeric: true }); },
      "price-asc": function (a, b) { var x = BS.unitPrice(a.p, 1), y = BS.unitPrice(b.p, 1); return (x == null) - (y == null) || x - y; },
      "price-desc": function (a, b) { var x = BS.unitPrice(a.p, 1), y = BS.unitPrice(b.p, 1); return (x == null) - (y == null) || y - x; }
    };
    return by[sort] || null;
  }

  /* --------------------------------------------------------------- rendering */
  function title() {
    var c = cats(), one = c.length === 1 ? BS.cat(c[0]) : null, sub = one && S.sub.length === 1 ? BS.sub(one.id, S.sub[0]) : null;
    var t = "All products", intro = "Bearings, V-belts, oil seals and related parts. Search above or filter by size, type and brand.";
    var crumbs = [["Home", "index.html"], ["Products", "shop.html"]];
    if (S.q) { t = "Results for “" + S.q + "”"; intro = ""; }
    else if (sub) { t = sub.name; intro = one.name + ". " + one.blurb; }
    else if (one) { t = one.name; intro = one.blurb; }
    else if (S.cat.length === 1 && BS.catAlias[S.cat[0]]) { var g = BS.GROUPS.filter(function (x) { return x.id === S.cat[0]; })[0]; t = g ? g.name : S.cat[0].charAt(0).toUpperCase() + S.cat[0].slice(1); intro = ""; }
    else if (S.f.brand.length === 1) { t = BS.brand(S.f.brand[0]).name + " products"; intro = ""; }
    if (one) crumbs.push([one.name, sub ? "shop.html?cat=" + one.id : null]);
    if (sub) crumbs.push([sub.name, null]);
    else if (!one && S.q) crumbs.push(["Search", null]);
    $("[data-title]").textContent = t;
    $("[data-intro]").textContent = intro;
    $("[data-crumbs]").innerHTML = "<ol>" + crumbs.map(function (c, i) { return "<li" + (i === crumbs.length - 1 ? ' aria-current="page"' : "") + ">" + (c[1] ? '<a href="' + esc(c[1]) + '">' + esc(c[0]) + "</a>" : esc(c[0])) + "</li>"; }).join("") + "</ol>";
    document.title = (S.q ? "Search: " + S.q : t) + " · Bearingsetu";
    var md = $('meta[name="description"]'); if (md && one) md.setAttribute("content", one.blurb + " Filter by size and brand, or request a quotation.");
  }

  function renderChips(base) {
    var el = $("[data-subchips]"), c = cats(), one = c.length === 1 ? BS.cat(c[0]) : null, html = "";
    if (one && one.subs) {
      var counts = {};
      base.forEach(function (it) { if (passes(it.p, null, true)) counts[it.p.sub] = (counts[it.p.sub] || 0) + 1; });
      html = '<a href="' + esc(hrefWith({ sub: "" })) + '"' + (!S.sub.length ? ' aria-current="true"' : "") + ">All " + esc(one.name.toLowerCase()) + "</a>" +
        one.subs.filter(function (s) { return counts[s.id] || S.sub.indexOf(s.id) >= 0; }).map(function (s) { return '<a href="' + esc(hrefWith({ sub: s.id })) + '"' + (S.sub.length === 1 && S.sub[0] === s.id ? ' aria-current="true"' : "") + ">" + esc(s.name) + " <small>" + (counts[s.id] || 0) + "</small></a>"; }).join("");
    } else if (c.length > 1) {
      var mc = {};
      base.forEach(function (it) { if (passes(it.p, null, true)) mc[it.p.cat] = (mc[it.p.cat] || 0) + 1; });
      html = '<a href="shop.html?cat=' + esc(S.cat.join(",")) + '" aria-current="true">All</a>' + c.filter(function (id) { return mc[id]; }).map(function (id) { return '<a href="' + esc(hrefWith({ cat: id, sub: "" })) + '">' + esc(BS.cat(id).name) + " <small>" + mc[id] + "</small></a>"; }).join("");
    } else if (!c.length && S.q) {
      var cc = {};
      base.forEach(function (it) { if (passes(it.p)) cc[it.p.cat] = (cc[it.p.cat] || 0) + 1; });
      html = Object.keys(cc).map(function (id) { var ct = BS.cat(id); return ct ? '<a href="' + esc(hrefWith({ cat: id })) + '">' + esc(ct.name) + " <small>" + cc[id] + "</small></a>" : ""; }).join("");
    } else if (!c.length && !S.f.brand.length) {
      html = BS.catalog.categories.map(function (ct) { return '<a href="shop.html?cat=' + esc(ct.id) + '">' + esc(ct.name) + "</a>"; }).join("");
    }
    el.innerHTML = html; el.hidden = !html;
  }

  function optList(key, base, schemaOk) {
    var F = FACETS[key], counts = {}, order = [];
    base.forEach(function (it) {
      if (!passes(it.p, key)) return;
      var v = F.get(it.p); if (v == null) return; v = String(v);
      if (!(v in counts)) { counts[v] = 0; order.push(v); }
      counts[v]++;
    });
    S.f[key].forEach(function (v) { if (!(v in counts)) { counts[v] = 0; order.push(v); } });
    if (key === "brand") order.sort(function (a, b) { return counts[b] - counts[a] || F.name(a).localeCompare(F.name(b)); });
    else order.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
    return { counts: counts, order: order };
  }
  var expanded = {};
  function renderFacets(base) {
    var schema = schemaFor(cats()), keys = schema.facets.slice();
    Object.keys(FACETS).forEach(function (k) { if (S.f[k].length && keys.indexOf(k) < 0) keys.push(k); });
    var html = "";
    keys.forEach(function (k) {
      var F = FACETS[k], o = optList(k, base);
      if (o.order.length < 2 && !S.f[k].length) return;
      var show = expanded[k] ? o.order : o.order.slice(0, 7);
      S.f[k].forEach(function (v) { if (show.indexOf(v) < 0) show.push(v); });
      html += '<details class="fgroup" open><summary>' + esc(F.label) + "</summary><ul>" + show.map(function (v) {
        var on = S.f[k].indexOf(v) >= 0, n = o.counts[v];
        return '<li><label class="fopt' + (n ? "" : " is-zero") + '"><input type="checkbox" data-f="' + k + '" value="' + esc(v) + '"' + (on ? " checked" : "") + ' data-fid="' + k + ":" + esc(v) + '"><span>' + esc(F.name ? F.name(v) : v) + '</span><span class="count">' + n + "</span></label></li>";
      }).join("") + "</ul>" + (o.order.length > 7 ? '<button class="textlink fmore" type="button" data-more="' + k + '">' + (expanded[k] ? "Show fewer" : "Show all " + o.order.length) + "</button>" : "") + "</details>";
    });
    $("[data-facets]").innerHTML = html || '<p class="filters__empty">No more filters for this selection.</p>';
  }
  var rangesFor = "";
  function renderRanges() {
    var schema = schemaFor(cats()), sig = schema.ranges.map(function (r) { return r[0]; }).join("|") + "#" + cats().join(",");
    var host = $("[data-ranges]");
    if (sig === rangesFor && host.children.length) { // keep inputs (and their caret) while typing; just sync values from state
      $$("[data-r]", host).forEach(function (i) { var r = S.r[i.getAttribute("data-r")], v = r[i.getAttribute("data-b")]; if (doc.activeElement !== i) i.value = v == null ? "" : fmt(r, i.getAttribute("data-b"), v); });
      return;
    }
    rangesFor = sig;
    host.innerHTML = schema.ranges.map(function (r) {
      var k = r[0], s = S.r[k];
      return '<details class="fgroup" open><summary>' + esc(r[1]) + '</summary><div class="frange"><label class="sr-only" for="r-' + k + '-min">' + esc(r[1]) + ' minimum</label><input class="input" id="r-' + k + '-min" data-r="' + k + '" data-b="min" inputmode="decimal" placeholder="Min" value="' + (s.min == null ? "" : fmt(s, "min", s.min)) + '"><span>to</span><label class="sr-only" for="r-' + k + '-max">' + esc(r[1]) + ' maximum</label><input class="input" id="r-' + k + '-max" data-r="' + k + '" data-b="max" inputmode="decimal" placeholder="Max" value="' + (s.max == null ? "" : fmt(s, "max", s.max)) + '"></div></details>';
    }).join("");
  }
  var doc = document;
  function fmt(r, b, v) { return r.exact != null ? String(r.exact) : String(Math.round(v * 100) / 100); }

  function activeFilters() {
    var out = [];
    Object.keys(FACETS).forEach(function (k) { S.f[k].forEach(function (v) { out.push({ label: FACETS[k].label + ": " + (FACETS[k].name ? FACETS[k].name(v) : v), kind: "f", k: k, v: v }); }); });
    var names = { d: "d", D: "D", B: "B", len: "Length" };
    Object.keys(RANGES).forEach(function (k) {
      var r = S.r[k]; if (r.min == null && r.max == null) return;
      var t = r.exact != null ? names[k] + " " + r.exact + " mm" : names[k] + " " + (r.min != null ? r.min : "") + (r.min != null && r.max != null ? "–" : r.min != null ? "+" : "up to ") + (r.max != null ? r.max : "") + " mm";
      out.push({ label: t, kind: "r", k: k });
    });
    return out;
  }
  function renderActive() {
    var a = activeFilters(), el = $("[data-active]");
    el.innerHTML = a.map(function (x, i) { return '<span class="chip">' + esc(x.label) + '<button class="chip__x" type="button" data-rm="' + i + '" aria-label="Remove filter ' + esc(x.label) + '">' + icon("x") + "</button></span>"; }).join("") + (a.length ? '<button class="textlink" type="button" data-clear-all>Clear all</button>' : "");
    el._a = a;
    var n = $("[data-filter-n]"); if (n) n.textContent = a.length ? " (" + a.length + ")" : "";
  }

  function render() {
    var base = items().filter(function (it) { return cats().length ? cats().indexOf(it.p.cat) >= 0 : true; });
    var all = items(); pool = base;
    // Chips and facets count against the full text-search pool, then the current filters.
    var res = all.filter(function (it) { return passes(it.p); });
    var sortSel = $("[data-sort]"), hasPrices = BS.priceMode() === "list" && BS.products.some(function (p) { return BS.hasPrice(p); });
    var opts = [["", S.q ? "Best match" : "Recommended order"], ["pn", "Part number"], ["size", "Size, small to large"], ["brand", "Brand"]];
    if (hasPrices) opts.push(["price-asc", "Price, low to high"], ["price-desc", "Price, high to low"]);
    sortSel.innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '"' + (S.sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
    var sf = sorter(S.sort); if (sf) res = res.slice().sort(sf);
    title(); renderChips(all.filter(function (it) { return cats().length ? cats().indexOf(it.p.cat) >= 0 : true; }));
    renderRanges(); renderFacets(all.filter(function (it) { return cats().length ? cats().indexOf(it.p.cat) >= 0 && (!S.sub.length || S.sub.indexOf(it.p.sub) >= 0) : true; }));
    renderActive();
    $("[data-gst]").innerHTML = BS.gstToggleHTML();
    $$("[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === S.view); });
    var pages = Math.max(1, Math.ceil(res.length / PAGE)); if (S.page > pages) S.page = pages;
    var slice = res.slice((S.page - 1) * PAGE, S.page * PAGE);
    $("[data-count]").textContent = res.length ? BS.plural(res.length, "part") + (S.q ? " for “" + S.q + "”" : "") : "";
    var out = $("[data-results]");
    if (!res.length) {
      var ask = S.q || (activeFilters().map(function (a) { return a.label; }).join(", "));
      out.innerHTML = '<div class="noresults"><h2>No parts match' + (S.q ? " “" + esc(S.q) + "”" : "") + '</h2><p class="muted">Our online catalogue is not the whole range. We can still quote it.</p>' +
        '<ul><li>' + icon("check") + ' Check the number: spaces, hyphens and slashes do not matter, for example <em>6205 2RS</em>.</li><li>' + icon("check") + ' Search by size, for example <em>25x52x15</em>.</li>' + (activeFilters().length ? "<li>" + icon("check") + " Remove some filters.</li>" : "") + "</ul>" +
        '<div class="btns">' + (activeFilters().length ? '<button class="btn btn--quiet" type="button" data-clear-all>Clear filters</button>' : "") + '<a class="btn" href="checkout.html?custom=' + encodeURIComponent(ask || "") + '">Ask us to source it</a><a class="btn btn--quiet" href="tools.html#decoder">Decode a part number</a></div></div>';
    } else {
      out.innerHTML = '<div class="' + (S.view === "list" ? "" : "pgrid") + '" id="results-list">' + slice.map(function (it) { return BS.card(it.p, { row: S.view === "list", via: it.via }); }).join("") + "</div>";
    }
    // pager
    var pg = $("[data-pager]"), h = "";
    if (pages > 1) {
      var link = function (n, lab, cur) { return cur ? '<span aria-current="page">' + n + "</span>" : '<a href="' + esc(hrefWith({ view: S.view, page: n })) + '" data-page="' + n + '"' + (lab ? ' aria-label="' + lab + '"' : "") + ">" + (lab === "Previous page" ? icon("caret-left") : lab === "Next page" ? icon("caret-right") : n) + "</a>"; };
      if (S.page > 1) h += link(S.page - 1, "Previous page");
      var shown = [1, pages, S.page - 1, S.page, S.page + 1].filter(function (n) { return n >= 1 && n <= pages; }).filter(function (n, i, a) { return a.indexOf(n) === i; }).sort(function (a, b) { return a - b; });
      shown.forEach(function (n, i) { if (i && n - shown[i - 1] > 1) h += '<span class="is-gap">…</span>'; h += link(n, "", n === S.page); });
      if (S.page < pages) h += link(S.page + 1, "Next page");
    }
    pg.innerHTML = h;
    var help = $("[data-help]");
    $("[data-quote-note]").hidden = BS.priceMode() === "list";
    help.innerHTML = "<strong>Cannot find what you need?</strong> The catalogue lists common sizes only. <a href=\"checkout.html" + (S.q ? "?custom=" + encodeURIComponent(S.q) : "") + "\">Ask us to source a part</a> or <a href=\"quick-order.html\">paste a whole list</a>.";
    writeUrl();
  }

  /* ------------------------------------------------------------------ events */
  function resetPage() { S.page = 1; }
  doc.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches && t.matches("[data-f]")) {
      var k = t.getAttribute("data-f"), v = t.value, a = S.f[k], i = a.indexOf(v);
      if (t.checked && i < 0) a.push(v); else if (!t.checked && i >= 0) a.splice(i, 1);
      resetPage(); render();
      var again = $('[data-fid="' + k + ":" + (window.CSS && CSS.escape ? CSS.escape(v) : v) + '"]'); if (again) again.focus();
    } else if (t.matches && t.matches("[data-sort]")) { S.sort = t.value; resetPage(); render(); }
  });
  // One timer per range so quickly filling "min" then "max" (or two different ranges) never drops a value.
  var rangeTimers = {};
  function applyRange(k) {
    var r = S.r[k], mn = $("#r-" + k + "-min"), mx = $("#r-" + k + "-max");
    if (!mn || !mx) return;
    r.exact = null; r.min = numP(String(mn.value).replace(",", ".")); r.max = numP(String(mx.value).replace(",", "."));
    resetPage(); render();
  }
  doc.addEventListener("input", function (e) {
    if (!(e.target.matches && e.target.matches("[data-r]"))) return;
    var k = e.target.getAttribute("data-r");
    clearTimeout(rangeTimers[k]); rangeTimers[k] = setTimeout(function () { applyRange(k); }, 350);
  });
  doc.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement; if (!t || !t.closest) return;
    var v = t.closest("[data-view]"); if (v) { S.view = v.getAttribute("data-view"); BS.store.set("view", S.view); render(); return; }
    var m = t.closest("[data-more]"); if (m) { var k = m.getAttribute("data-more"); expanded[k] = !expanded[k]; render(); return; }
    var rm = t.closest("[data-rm]");
    if (rm) {
      var x = $("[data-active]")._a[parseInt(rm.getAttribute("data-rm"), 10)];
      if (x.kind === "f") S.f[x.k] = S.f[x.k].filter(function (y) { return y !== x.v; }); else S.r[x.k] = { min: null, max: null, exact: null };
      resetPage(); render(); return;
    }
    if (t.closest("[data-clear-all]")) { Object.keys(S.f).forEach(function (k) { S.f[k] = []; }); Object.keys(S.r).forEach(function (k) { S.r[k] = { min: null, max: null, exact: null }; }); resetPage(); render(); return; }
    var pg = t.closest("[data-page]"); if (pg) { e.preventDefault(); S.page = parseInt(pg.getAttribute("data-page"), 10); render(); window.scrollTo(0, 0); return; }
    if (t.closest("[data-open-filters]")) { $("#filters").classList.add("is-open"); BS.lock(true, "filters"); return; }
    if (t.closest("[data-close-filters]")) { $("#filters").classList.remove("is-open"); BS.lock(false, "filters"); return; }
  });
  doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("#filters").classList.contains("is-open")) { $("#filters").classList.remove("is-open"); BS.lock(false, "filters"); } });
  BS.on("overlay", render); BS.on("prefs", render);

  parse(); render();
  // keep the header search box showing the current query
  var hq = $("#hq"); if (hq && S.q) hq.value = S.q;
})();
