/* Shop: catalogue listing.
   URL-driven state, faceted filters (sidebar on desktop, sheet below 1068px),
   grid and list views, show more, compare tray and comparison dialog. */
(function () {
  "use strict";
  var BS = window.BS;
  var doc = document;

  /* The catalogue failed to load: say so where the products would be. */
  if (!BS || !BS.products || !BS.products.length) {
    var g = doc.querySelector("[data-grid]");
    var cnt = doc.querySelector("[data-count]");
    if (cnt) cnt.textContent = "Catalogue unavailable";
    ["[data-body]", "[data-bar]", "[data-chapters-nav]"].forEach(function (sel) { var n = doc.querySelector(sel); if (n) n.classList.add("is-error"); });
    if (g) {
      g.removeAttribute("aria-busy");
      g.outerHTML = '<div class="empty shop-error" role="alert"><svg class="i" aria-hidden="true"><use href="assets/icons.svg#i-warning-circle"/></svg>' +
        "<h3>The catalogue did not load</h3><p>Check your connection and reload the page. If it keeps happening, email orders@bearingsetu.com with the parts you need.</p>" +
        '<div class="shop-error__acts"><button class="btn btn--sm" type="button" onclick="location.reload()">Reload</button><a class="btn btn--sm btn--light" href="quick-order.html#rfq">Request a quote</a></div></div>';
    }
    return;
  }

  // Storage written by an older build or by hand can break the shared helpers (they expect arrays and a
  // prefs object). Reset only values of the wrong type; this runs before site.js initialises the header.
  ["cart", "wish", "recent", "recentQ", "compare"].forEach(function (k) { if (!Array.isArray(BS.store.get(k, []))) BS.store.set(k, []); });
  (function () { var pf = BS.store.get("prefs", null); if (pf !== null && (typeof pf !== "object" || Array.isArray(pf))) BS.store.set("prefs", { gst: "ex" }); })();

  var $ = BS.$, $$ = BS.$$, esc = BS.esc, inr = BS.inr, icon = BS.icon, plural = BS.plural;
  var P = BS.products;
  var CATS = BS.catalog.categories;
  var ORDER = {};
  P.forEach(function (p, i) { ORDER[p.id] = i; });

  var BEARING_CATS = { "ball-bearings": 1, "roller-bearings": 1 };
  var NAV_KEY = {
    "ball-bearings": "bearings", "roller-bearings": "bearings", "housed-units": "bearings",
    "belts-pulleys": "transmission", "power-transmission": "transmission", "linear-motion": "transmission",
    "seals": "seals", "lubrication": "lubrication", "mounting-tools": "tools"
  };
  var TAGS = { bestseller: "Bestsellers", "new": "New in stock", "price-drop": "Lower prices", bulk: "Bulk favourites" };
  var TAG_LINE = {
    bestseller: "The parts maintenance teams reorder most, on the shelf in Pune.",
    "new": "Recently added to the catalogue and in stock now.",
    "price-drop": "Parts with a lower price than last month.",
    bulk: "Parts our business buyers order by the box."
  };
  var SORTS = ["relevance", "price-asc", "price-desc", "dispatch", "rating", "pn"];
  var SEALS = [["Open", "Open"], ["ZZ", "Shielded (ZZ)"], ["2RS", "Sealed (2RS)"]];
  var CLRS = [["CN", "Normal (CN)"], ["C3", "C3, larger"], ["C4", "C4, larger still"]];
  var PAGE = 24;
  var MAX_CMP = 4;
  var BRAND_TOP = 6;

  var collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  var mqSheet = window.matchMedia("(max-width: 1067px)");

  /* ------------------------------------------------------------- elements */
  var el = {
    crumbs: $("[data-crumbs]"), title: $("[data-title]"), line: $("[data-line]"),
    chapters: $("[data-chapters]"), chaptersNav: $("[data-chapters-nav]"),
    bar: $("[data-bar]"), count: $("[data-count]"), sort: $("[data-sort]"), fcount: $("[data-fcount]"),
    openFilters: $("[data-open-filters]"),
    filters: $("[data-filters]"), fbody: $("[data-filters-body]"), fscrim: $("[data-fscrim]"),
    qInput: $("[data-q-input]"),
    fCat: $("[data-f-cat]"), fSub: $("[data-f-sub]"), fBrand: $("[data-f-brand]"), brandMore: $("[data-brand-more]"),
    fSeal: $("[data-f-seal]"), fClr: $("[data-f-clr]"), fAvail: $("[data-f-avail]"),
    sizeIn: $$("[data-size]"), sizeErr: $("[data-size-err]"), bores: $("[data-bores]"), boresRow: $("[data-bores-row]"),
    priceIn: $$("[data-price]"), priceErr: $("[data-price-err]"), priceHint: $("[data-price-hint]"),
    sheetDone: $("[data-sheet-done]"),
    results: $("[data-results]"), active: $("[data-active]"), grid: $("[data-grid]"),
    more: $("[data-more]"), moreMeta: $("[data-more-meta]"), moreBar: $("[data-more-bar]"), moreBtn: $("[data-more-btn]"),
    empty: $("[data-empty]"),
    rfq: $$("[data-rfq-link]"),
    tray: $("[data-tray]"), traySlots: $("[data-tray-slots]"), trayTitle: $("[data-tray-title]"), trayHint: $("[data-tray-hint]"), cmpOpen: $("[data-cmp-open]"),
    cmp: $("[data-cmp-dialog]"), cmpBody: $("[data-cmp-body]"), cmpTitle: $("[data-cmp-title]"), cmpDiff: $("[data-cmp-diff]")
  };
  function group(name) { return $('[data-group="' + name + '"]', el.filters); }

  /* ---------------------------------------------------------------- state */
  function list(v) { return v ? String(v).split(",").map(function (s) { return s.trim(); }).filter(Boolean) : []; }
  function pos(v) {
    if (v == null || v === "") return null;
    var n = parseFloat(String(v).replace(",", "."));
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  function pick(values, allowed) {
    var out = [];
    values.forEach(function (v) {
      for (var i = 0; i < allowed.length; i++) {
        if (allowed[i][0].toLowerCase() === v.toLowerCase() && out.indexOf(allowed[i][0]) === -1) out.push(allowed[i][0]);
      }
    });
    return out;
  }
  function catOfSub(subId) {
    for (var i = 0; i < CATS.length; i++) if (BS.sub(CATS[i].id, subId)) return CATS[i].id;
    return "";
  }
  function storedView() { return BS.store.get("shopView", "grid") === "list" ? "list" : "grid"; }

  function readState() {
    var u = BS.params();
    var s = {
      cat: BS.cat(u.get("cat")) ? u.get("cat") : "",
      sub: list(u.get("sub")),
      q: (u.get("q") || "").replace(/\uFFFD/g, "").trim().slice(0, 80),
      d: pos(u.get("d")), D: pos(u.get("D")), B: pos(u.get("B")),
      brand: list(u.get("brand")).map(function (b) { return b.toLowerCase(); }).filter(function (b) { return BS.catalog.brands.some(function (x) { return x.id === b; }); }),
      seal: pick(list(u.get("seal")), SEALS),
      clr: pick(list(u.get("clr")), CLRS),
      tag: TAGS[u.get("tag")] ? u.get("tag") : "",
      stock: u.get("stock") === "1",
      ship: u.get("ship") === "0",
      min: pos(u.get("min")), max: pos(u.get("max")),
      sort: SORTS.indexOf(u.get("sort")) !== -1 ? u.get("sort") : "relevance",
      view: u.get("view") === "list" || u.get("view") === "grid" ? u.get("view") : storedView()
    };
    if (!s.cat && s.sub.length) s.cat = catOfSub(s.sub[0]);
    // Swapped ranges from hand-edited links: read them the way they were meant.
    var t;
    if (s.min != null && s.max != null && s.min > s.max) { t = s.min; s.min = s.max; s.max = t; }
    if (s.d != null && s.D != null && s.D <= s.d) { if (s.D === s.d) s.D = null; else { t = s.d; s.d = s.D; s.D = t; } }
    s.sub = s.cat ? s.sub.filter(function (id) { return BS.sub(s.cat, id); }) : [];
    return s;
  }
  function fmtNum(n) { return String(Math.round(n * 100) / 100); }
  function enc(v) { return encodeURIComponent(v).replace(/%2C/gi, ","); }
  function toUrl(s) {
    var parts = [];
    function add(k, v) { parts.push(k + "=" + enc(v)); }
    if (s.cat) add("cat", s.cat);
    if (s.sub.length) add("sub", s.sub.join(","));
    if (s.q) add("q", s.q);
    if (s.d != null) add("d", fmtNum(s.d));
    if (s.D != null) add("D", fmtNum(s.D));
    if (s.B != null) add("B", fmtNum(s.B));
    if (s.brand.length) add("brand", s.brand.join(","));
    if (s.seal.length) add("seal", s.seal.join(","));
    if (s.clr.length) add("clr", s.clr.join(","));
    if (s.tag) add("tag", s.tag);
    if (s.stock) add("stock", "1");
    if (s.ship) add("ship", "0");
    if (s.min != null) add("min", fmtNum(s.min));
    if (s.max != null) add("max", fmtNum(s.max));
    if (s.sort !== "relevance") add("sort", s.sort);
    if (s.view === "list") add("view", "list");
    return "shop.html" + (parts.length ? "?" + parts.join("&") : "");
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  var state = readState();
  var shown = PAGE;
  var current = [];
  var brandsOpen = false;

  /* ------------------------------------------------------------ filtering */
  var searchCache = { q: null, map: null };
  function searchMap(q) {
    if (searchCache.q !== q) {
      var m = {};
      BS.search(q).forEach(function (r) { m[r.p.id] = r; });
      searchCache = { q: q, map: m };
    }
    return searchCache.map;
  }
  function near(a, b) { return a != null && Math.abs(a - b) < 0.6; }
  var TESTS = {
    q: function (p, s) { return !s.q || !!searchMap(s.q)[p.id]; },
    cat: function (p, s) { return !s.cat || p.cat === s.cat; },
    sub: function (p, s) { return !s.sub.length || s.sub.indexOf(p.sub) !== -1; },
    size: function (p, s) { return (s.d == null || near(p.d, s.d)) && (s.D == null || near(p.D, s.D)) && (s.B == null || near(p.B, s.B)); },
    brand: function (p, s) { return !s.brand.length || s.brand.indexOf(p.brand) !== -1; },
    seal: function (p, s) { return !s.seal.length || s.seal.indexOf(p.seal) !== -1; },
    clr: function (p, s) { return !s.clr.length || s.clr.indexOf(p.clr) !== -1; },
    tag: function (p, s) { return !s.tag || (p.tags || []).indexOf(s.tag) !== -1; },
    stock: function (p, s) { return !s.stock || p.stock > 0; },
    ship: function (p, s) { return !s.ship || (p.stock > 0 && p.ship === 0); },
    price: function (p, s) { return (s.min == null || p.price >= s.min) && (s.max == null || p.price <= s.max); }
  };
  var KEYS = Object.keys(TESTS);
  function pool(s, except) {
    except = except || [];
    var keys = KEYS.filter(function (k) { return except.indexOf(k) === -1; });
    return P.filter(function (p) {
      for (var i = 0; i < keys.length; i++) if (!TESTS[keys[i]](p, s)) return false;
      return true;
    });
  }
  function feat(p) {
    var t = p.tags || [];
    return (t.indexOf("bestseller") !== -1 ? 2 : t.length ? 1 : 0);
  }
  function eta(p) { return p.stock > 0 ? p.ship : 10 + (p.ship || 7); }
  function sortList(arr, s) {
    var a = arr.slice();
    var sm = s.q ? searchMap(s.q) : null;
    var cmp = {
      relevance: sm ? function (x, y) { return sm[y.id].score - sm[x.id].score || x.price - y.price; }
        : function (x, y) { return feat(y) - feat(x) || ORDER[x.id] - ORDER[y.id]; },
      "price-asc": function (x, y) { return x.price - y.price || ORDER[x.id] - ORDER[y.id]; },
      "price-desc": function (x, y) { return y.price - x.price || ORDER[x.id] - ORDER[y.id]; },
      dispatch: function (x, y) { return eta(x) - eta(y) || y.stock - x.stock; },
      rating: function (x, y) { return y.rating - x.rating || y.reviews - x.reviews; },
      pn: function (x, y) { return collator.compare(x.pn, y.pn) || ORDER[x.id] - ORDER[y.id]; }
    }[s.sort];
    return a.sort(cmp);
  }
  function hasSize(s) { return s.d != null || s.D != null || s.B != null; }
  function activeCount(s) {
    return (s.q ? 1 : 0) + s.sub.length + (hasSize(s) ? 1 : 0) + s.brand.length + s.seal.length + s.clr.length +
      (s.tag ? 1 : 0) + (s.stock ? 1 : 0) + (s.ship ? 1 : 0) + (s.min != null || s.max != null ? 1 : 0);
  }

  /* ---------------------------------------------------------------- labels */
  function subLabel(catId, subId) {
    var sb = BS.sub(catId, subId);
    if (!sb) return "";
    var n = sb.name;
    if (catId === "ball-bearings") return (/ball/i.test(n) ? n : n + " ball") + " bearings";
    if (catId === "roller-bearings") return n + " bearings";
    return n;
  }
  function sizeText(s) {
    if (s.d != null && s.D != null) return fmtNum(s.d) + " × " + fmtNum(s.D) + (s.B != null ? " × " + fmtNum(s.B) : "") + " mm";
    var bits = [];
    if (s.d != null) bits.push(fmtNum(s.d) + " mm bore");
    if (s.D != null) bits.push(fmtNum(s.D) + " mm outer");
    if (s.B != null) bits.push(fmtNum(s.B) + " mm wide");
    return bits.join(", ");
  }
  function allBearings(items, s) {
    if (BEARING_CATS[s.cat]) return true;
    return items.length > 0 && items.every(function (p) { return BEARING_CATS[p.cat]; });
  }
  function headline(s, items) {
    if (s.q) return "Results for “" + s.q + "”";
    if (hasSize(s)) {
      var noun = allBearings(items, s) ? "Bearings" : "Parts";
      if (s.d != null && s.D != null) return noun + " sized " + sizeText(s);
      return noun + " with a " + sizeText(s).replace(" mm wide", " mm width");
    }
    if (s.cat && s.sub.length === 1) return subLabel(s.cat, s.sub[0]);
    if (s.cat) return BS.cat(s.cat).name;
    if (s.tag) return TAGS[s.tag];
    if (s.ship) return "Ready to ship today";
    return "All products";
  }
  function gstWord() { return BS.prefs().gst === "inc" ? "incl. GST" : "+ GST"; }
  function priceNum(v) { return BS.prefs().gst === "inc" ? BS.withGst(v) : v; }
  function summary(s, items) {
    var onlyCat = s.cat && !s.q && !hasSize(s) && activeCount(s) === 0;
    if (!items.length) {
      if (s.q && activeCount(s) === 1) return "Nothing in the catalogue matches this yet. We can source it for you.";
      return "Nothing matches all of these at once. Remove a filter or two to see more.";
    }
    if (onlyCat) return BS.cat(s.cat).blurb;
    if (!s.cat && activeCount(s) === 0) return "Bearings, belts, seals, lubricants and tools from " + BS.catalog.brands.length + " brands. Tier prices for volume, GST invoice on every order.";
    if (s.tag && activeCount(s) === 1 && !s.cat) return TAG_LINE[s.tag];
    var brands = {};
    var min = Infinity, today = 0;
    items.forEach(function (p) { brands[p.brand] = 1; if (p.price < min) min = p.price; if (p.stock > 0 && p.ship === 0) today++; });
    var nb = Object.keys(brands).length;
    var out = plural(items.length, "part") + " from " + plural(nb, "brand") + ", starting at " + inr(priceNum(min)) + " " + gstWord() + ".";
    if (today) out += " " + (today === items.length ? (items.length === 1 ? "It ships" : "All ship") : today + " ship") + " today.";
    if (s.q) {
      var sm = searchMap(s.q), via = items.filter(function (p) { return sm[p.id] && sm[p.id].via; }).length;
      if (via) out += " Includes " + plural(via, "equivalent") + " from other brands.";
    }
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  /* -------------------------------------------------------------- history */
  function commit(next, opts) {
    opts = opts || {};
    var prev = state;
    state = next;
    var url = toUrl(state);
    var here = location.pathname.replace(/^.*\//, "") + location.search;
    if (url !== here && url !== "shop.html" + location.search) {
      try { history[opts.push ? "pushState" : "replaceState"](null, "", url); } catch (e) { /* file:// or sandbox: state still applies */ }
    }
    if (!opts.keepShown) shown = PAGE;
    render({ prev: prev, scroll: opts.scroll !== false && !opts.keepShown });
  }
  window.addEventListener("popstate", function () {
    state = readState();
    shown = PAGE;
    render({ scroll: false });
  });

  /* ---------------------------------------------------------------- render */
  function render(opts) {
    opts = opts || {};
    var fk = focusKey();
    current = sortList(pool(state), state);
    renderHead();
    renderChapters();
    renderFacets();
    renderBar();
    renderChips();
    renderResults(opts);
    restoreFocus(fk);
    if (opts.scroll) scrollToResults();
  }

  function focusKey() {
    var a = doc.activeElement;
    return a && a.getAttribute ? a.getAttribute("data-fkey") : null;
  }
  function restoreFocus(fk) {
    if (!fk) return;
    var a = doc.activeElement;
    if (a && a.getAttribute && a.getAttribute("data-fkey") === fk) return;
    var t = $('[data-fkey="' + fk.replace(/"/g, '\\"') + '"]');
    if (t && !t.disabled) t.focus({ preventScroll: true });
  }

  function scrollToResults() {
    if (mqSheet.matches && el.filters.classList.contains("is-open")) return;
    var top = el.results.getBoundingClientRect().top;
    var offset = navH() + barH() + 12;
    if (top < offset) window.scrollTo({ top: window.pageYOffset + top - offset, behavior: BS.reduceMotion ? "auto" : "smooth" });
  }
  function navH() { var n = $("#gnav"); return n ? n.offsetHeight : 52; }
  // Below 768 only the controls row of the toolbar stays on screen.
  function barH() { return window.innerWidth <= 767 ? el.sort.offsetHeight + 16 : el.bar.offsetHeight; }

  function renderHead() {
    var s = state;
    var h = headline(s, current);
    el.title.textContent = h;
    el.line.textContent = summary(s, current);
    doc.title = h + " · Bearingsetu";
    var crumbs = ['<li><a href="shop.html">Store</a></li>'];
    if (s.cat) {
      var c = BS.cat(s.cat);
      if (s.sub.length === 1) {
        crumbs.push('<li><a href="shop.html?cat=' + esc(s.cat) + '">' + esc(c.name) + "</a></li>");
        crumbs.push('<li><span aria-current="page">' + esc(BS.sub(s.cat, s.sub[0]).name) + "</span></li>");
      } else crumbs.push('<li><span aria-current="page">' + esc(c.name) + "</span></li>");
    } else if (s.q) crumbs.push('<li><span aria-current="page">Search</span></li>');
    else if (hasSize(s)) crumbs.push('<li><span aria-current="page">Find by size</span></li>');
    else crumbs.push('<li><span aria-current="page">' + esc(h) + "</span></li>");
    el.crumbs.innerHTML = crumbs.join("");
    // Global nav: mark the section this category lives in.
    var key = s.cat ? NAV_KEY[s.cat] : "store";
    $$(".gnav__link[data-nav]").forEach(function (a) {
      if (a.getAttribute("data-nav") === key) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    el.rfq.forEach(function (a) { a.href = "quick-order.html" + (s.q ? "?q=" + encodeURIComponent(s.q) : "") + "#rfq"; });
  }

  /* chapter nav: sub-categories of the current category, or every category */
  var subImgCache = {};
  function subImg(catId, subId) {
    var k = catId + "/" + subId;
    if (subImgCache[k]) return subImgCache[k];
    var f = {}, catImg = BS.cat(catId).img;
    P.forEach(function (p) { if (p.cat === catId && p.sub === subId) f[p.img] = (f[p.img] || 0) + 1; });
    // Most common photo in the sub-category, avoiding the one the "All" chapter already uses.
    var keys = Object.keys(f).sort(function (a, b) { return (a === catImg) - (b === catImg) || f[b] - f[a]; });
    return (subImgCache[k] = keys[0] || catImg);
  }
  function lcFirst(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
  function chapterHTML(href, img, label, n, current, key, off) {
    return '<li class="chapters__item"><a class="chapter' + (off ? " is-off" : "") + '" href="' + esc(href) + '"' + (current ? ' aria-current="page"' : "") + ' data-chapter="' + esc(key) + '">' +
      '<span class="chapter__img">' + BS.imgTag(img, { alt: "", sizes: "88px" }) + "</span>" +
      '<span class="chapter__lbl">' + esc(label).replace(/(\S+-\S+)/g, '<span class="nw">$1</span>') + '<span class="chapter__n">' + n + "</span></span></a></li>";
  }
  function withSub(s, subs) { var n = clone(s); n.sub = subs; return n; }
  function blank(s) {
    return { cat: "", sub: [], q: "", d: null, D: null, B: null, brand: [], seal: [], clr: [], tag: "", stock: false, ship: false, min: null, max: null, sort: s.sort === "relevance" ? "relevance" : s.sort, view: s.view };
  }
  function renderChapters() {
    var s = state, html = "";
    if (s.cat) {
      // Sub-categories, counted against the other active filters.
      var c = BS.cat(s.cat);
      var sp = pool(s, ["sub"]);
      html += chapterHTML(toUrl(withSub(s, [])), c.img, "All " + lcFirst(c.name), plural(sp.length, "part"), !s.sub.length, "sub:", !sp.length);
      c.subs.forEach(function (sb) {
        var n = sp.filter(function (p) { return p.sub === sb.id; }).length;
        html += chapterHTML(toUrl(withSub(s, [sb.id])), subImg(c.id, sb.id), sb.name, plural(n, "part"), s.sub.length === 1 && s.sub[0] === sb.id, "sub:" + sb.id, !n);
      });
    } else {
      // Categories that hold results for the current search or size. With none, offer a fresh start.
      var cp = pool(s, ["cat", "sub", "brand", "seal", "clr"]);
      var cc = countBy(cp, function (p) { return p.cat; });
      var cats = CATS.filter(function (c) { return cc[c.id]; });
      var fresh = !cats.length;
      if (cats.length === 1) {
        // Every result sits in one category: a lone chapter says nothing, so offer its types instead.
        var only = cats[0];
        var tc = countBy(cp.filter(function (p) { return p.cat === only.id; }), function (p) { return p.sub; });
        only.subs.forEach(function (sb) {
          if (!tc[sb.id]) return;
          var ns = withCat(s, only.id);
          ns.sub = [sb.id];
          html += chapterHTML(toUrl(ns), subImg(only.id, sb.id), sb.name, plural(tc[sb.id], "part"), false, "csub:" + only.id + ":" + sb.id, false);
        });
      } else {
        (fresh ? CATS : cats).forEach(function (c) {
          var n = fresh ? P.filter(function (p) { return p.cat === c.id; }).length : cc[c.id];
          html += chapterHTML(fresh ? "shop.html?cat=" + c.id : toUrl(withCat(s, c.id)), c.img, c.name, plural(n, "part"), false, (fresh ? "fresh:" : "cat:") + c.id, false);
        });
      }
    }
    // One chapter on its own is not a choice; hide the row.
    el.chaptersNav.hidden = (html.match(/class="chapters__item"/g) || []).length < 2;
    el.chaptersNav.setAttribute("aria-label", s.cat || html.indexOf('data-chapter="csub:') !== -1 ? "Browse by type" : "Browse by category");
    var row = el.chapters, keep = row.scrollLeft;
    row.innerHTML = html;
    row.scrollLeft = keep;
    // Keep the active chapter on screen when the row scrolls sideways (phones).
    var cur = $('[aria-current="page"]', row);
    if (cur && row.scrollWidth > row.clientWidth) {
      var li = cur.parentNode, l = li.offsetLeft, r = l + li.offsetWidth;
      if (l < row.scrollLeft || r > row.scrollLeft + row.clientWidth) row.scrollLeft = Math.max(0, l - 16);
    }
  }

  /* facets */
  function countBy(items, fn) {
    var m = {};
    items.forEach(function (p) { var k = fn(p); if (k != null) m[k] = (m[k] || 0) + 1; });
    return m;
  }
  function optHTML(kind, value, label, n, checked) {
    var dis = !n && !checked;
    return '<label class="fopt' + (dis ? " is-off" : "") + '"><input type="checkbox" data-f="' + kind + '" value="' + esc(value) + '" data-fkey="' + kind + ":" + esc(value) + '"' + (checked ? " checked" : "") + (dis ? " disabled" : "") + ">" +
      '<span class="fopt__name">' + esc(label) + '</span><span class="fopt__n num">' + n + "</span></label>";
  }
  function renderFacets() {
    var s = state;

    // Category: counts ignore the category-specific filters that a switch clears.
    var cp = pool(s, ["cat", "sub", "brand", "seal", "clr"]);
    var cc = countBy(cp, function (p) { return p.cat; });
    var catHTML = '<li><a class="flink" href="' + esc(toUrl(withCat(s, ""))) + '" data-cat="" data-fkey="cat:"' + (!s.cat ? ' aria-current="true"' : "") + '><span class="flink__dot" aria-hidden="true"></span><span class="flink__name">All categories</span><span class="flink__n num">' + cp.length + "</span></a></li>";
    CATS.forEach(function (c) {
      var n = cc[c.id] || 0;
      catHTML += '<li><a class="flink' + (!n ? " is-off" : "") + '" href="' + esc(toUrl(withCat(s, c.id))) + '" data-cat="' + c.id + '" data-fkey="cat:' + c.id + '"' + (s.cat === c.id ? ' aria-current="true"' : "") + '><span class="flink__dot" aria-hidden="true"></span><span class="flink__name">' + esc(c.name) + '</span><span class="flink__n num">' + n + "</span></a></li>";
    });
    el.fCat.innerHTML = catHTML;

    // Type, within the category.
    var gSub = group("sub");
    gSub.hidden = !s.cat;
    if (s.cat) {
      var sp = pool(s, ["sub"]);
      var sc = countBy(sp, function (p) { return p.sub; });
      el.fSub.innerHTML = BS.cat(s.cat).subs.map(function (sb) { return optHTML("sub", sb.id, sb.name, sc[sb.id] || 0, s.sub.indexOf(sb.id) !== -1); }).join("");
    }

    // Brand: top 6 by count, then show all.
    var bp = pool(s, ["brand"]);
    var bc = countBy(bp, function (p) { return p.brand; });
    var brands = BS.catalog.brands.filter(function (b) { return bc[b.id] || s.brand.indexOf(b.id) !== -1; })
      .sort(function (a, b) { return (bc[b.id] || 0) - (bc[a.id] || 0) || collator.compare(a.name, b.name); });
    var visible = brandsOpen ? brands : brands.filter(function (b, i) { return i < BRAND_TOP || s.brand.indexOf(b.id) !== -1; });
    el.fBrand.innerHTML = visible.length ? visible.map(function (b) { return optHTML("brand", b.id, b.name.replace(/\s*\(.*\)$/, ""), bc[b.id] || 0, s.brand.indexOf(b.id) !== -1); }).join("")
      : '<p class="hint">No brands in these results.</p>';
    el.brandMore.hidden = brands.length <= BRAND_TOP;
    el.brandMore.textContent = brandsOpen ? "Show fewer brands" : "Show all " + brands.length + " brands";
    el.brandMore.setAttribute("aria-expanded", String(brandsOpen));

    // Size: only when the results carry dimensions.
    var zp = pool(s, ["size"]);
    var withDims = zp.filter(function (p) { return p.d != null; });
    group("size").hidden = !withDims.length && !hasSize(s);
    el.sizeIn.forEach(function (inp) {
      if (doc.activeElement === inp) return;
      var v = s[inp.getAttribute("data-size")];
      inp.value = v != null ? fmtNum(v) : "";
      inp.removeAttribute("aria-invalid");
    });
    if (doc.activeElement && el.sizeIn.indexOf(doc.activeElement) === -1) el.sizeErr.textContent = "";
    var bf = countBy(withDims, function (p) { return p.d; });
    var bores = Object.keys(bf).map(Number).sort(function (a, b) { return bf[b] - bf[a] || a - b; }).slice(0, 6).sort(function (a, b) { return a - b; });
    el.bores.hidden = bores.length < 2;
    el.boresRow.innerHTML = bores.map(function (b) {
      var on = s.d != null && near(b, s.d);
      return '<button class="chip fbore" type="button" data-bore="' + b + '" data-fkey="bore:' + b + '" aria-pressed="' + on + '" aria-label="' + fmtNum(b) + ' mm bore, ' + plural(bf[b], "part") + '">' + fmtNum(b) + "</button>";
    }).join("");

    // Seal and clearance only when bearings are in play.
    var sealP = pool(s, ["seal"]);
    var showSeal = sealP.some(function (p) { return p.seal; }) || s.seal.length;
    group("seal").hidden = !showSeal;
    if (showSeal) {
      var sl = countBy(sealP, function (p) { return p.seal; });
      el.fSeal.innerHTML = SEALS.map(function (o) { return optHTML("seal", o[0], o[1], sl[o[0]] || 0, s.seal.indexOf(o[0]) !== -1); }).join("");
    }
    var clrP = pool(s, ["clr"]);
    var showClr = clrP.some(function (p) { return p.clr; }) || s.clr.length;
    group("clr").hidden = !showClr;
    if (showClr) {
      var cl = countBy(clrP, function (p) { return p.clr; });
      el.fClr.innerHTML = CLRS.map(function (o) { return optHTML("clr", o[0], o[1], cl[o[0]] || 0, s.clr.indexOf(o[0]) !== -1); }).join("");
    }

    // Availability.
    var ap = pool(s, ["stock", "ship"]);
    var inStock = ap.filter(function (p) { return p.stock > 0; }).length;
    var today = pool(s, ["ship"]).filter(function (p) { return p.stock > 0 && p.ship === 0; }).length;
    el.fAvail.innerHTML = optHTML("stock", "1", "In stock", inStock, s.stock) + optHTML("ship", "0", "Ships today", today, s.ship);

    // Price.
    var pp = pool(s, ["price"]);
    el.priceIn.forEach(function (inp) {
      if (doc.activeElement === inp) return;
      var v = s[inp.getAttribute("data-price")];
      inp.value = v != null ? fmtNum(v) : "";
    });
    if (pp.length) {
      var lo = Infinity, hi = 0;
      pp.forEach(function (p) { if (p.price < lo) lo = p.price; if (p.price > hi) hi = p.price; });
      el.priceHint.textContent = "Before GST. These results run from " + inr(lo) + " to " + inr(hi) + ".";
    } else el.priceHint.textContent = "Before GST.";

    // Search box mirrors q unless someone is typing in it.
    if (doc.activeElement !== el.qInput) el.qInput.value = s.q;
  }
  function withCat(s, catId) {
    var n = clone(s);
    n.cat = catId;
    n.sub = []; n.brand = []; n.seal = []; n.clr = [];
    return n;
  }

  function renderBar() {
    var n = current.length;
    var countTxt = plural(n, state.q ? "result" : "product");
    if (el.count.textContent !== countTxt) el.count.textContent = countTxt;
    var rel = $("[data-rel]", el.sort);
    rel.textContent = state.q ? "Best match" : "Featured";
    el.sort.value = state.sort;
    var inc = BS.prefs().gst === "inc";
    $$("[data-gst]").forEach(function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-gst") === "inc") === inc)); });
    $$("[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === state.view)); });
    var ac = activeCount(state);
    el.fcount.hidden = !ac;
    el.fcount.textContent = ac;
    el.openFilters.setAttribute("aria-label", "Filters" + (ac ? ", " + ac + " on" : ""));
    el.sheetDone.textContent = n ? "Show " + plural(n, state.q ? "result" : "product") : "No matches yet";
    $$("[data-clear-all]", el.filters).forEach(function (b) { b.disabled = !ac; });
  }

  function renderChips() {
    var s = state, chips = [];
    if (s.q) chips.push(["q", "“" + s.q + "”"]);
    s.sub.forEach(function (id) { chips.push(["sub:" + id, BS.sub(s.cat, id).name]); });
    if (hasSize(s)) chips.push(["size", sizeText(s)]);
    s.brand.forEach(function (id) { chips.push(["brand:" + id, BS.brand(id).name.replace(/\s*\(.*\)$/, "")]); });
    s.seal.forEach(function (v) { chips.push(["seal:" + v, SEALS.filter(function (o) { return o[0] === v; })[0][1]]); });
    s.clr.forEach(function (v) { chips.push(["clr:" + v, "Clearance " + v]); });
    if (s.tag) chips.push(["tag", TAGS[s.tag]]);
    if (s.stock) chips.push(["stock", "In stock"]);
    if (s.ship) chips.push(["ship", "Ships today"]);
    if (s.min != null || s.max != null) {
      chips.push(["price", s.min != null && s.max != null ? inr(s.min) + " to " + inr(s.max) : s.min != null ? "From " + inr(s.min) : "Up to " + inr(s.max)]);
    }
    el.active.hidden = !chips.length;
    if (!chips.length) { el.active.innerHTML = ""; return; }
    el.active.innerHTML = '<ul class="active__list" aria-label="Active filters">' + chips.map(function (c) {
      return '<li><button class="chip chip--outline achip" type="button" data-chip="' + esc(c[0]) + '" data-fkey="chip:' + esc(c[0]) + '" aria-label="Remove filter: ' + esc(c[1]) + '">' + esc(c[1]) + icon("x", "chip__x") + "</button></li>";
    }).join("") + '</ul><button class="textlink active__clear" type="button" data-clear-all data-fkey="clear-all">Clear all</button>';
  }

  /* results */
  function cardSizes() { return state.view === "list" ? "(max-width: 640px) 96px, 180px" : "(max-width: 833px) 46vw, (max-width: 1068px) 31vw, 300px"; }
  function cardHTML(p, i) {
    return '<li class="rgrid__item">' + BS.card(p, { row: state.view === "list", reveal: true, i: i, sizes: cardSizes() }) + "</li>";
  }
  function specLine(p) {
    var bits = [];
    if (p.d != null && BEARING_CATS[p.cat]) {
      bits.push(["Size", BS.dims(p)]);
      var so = SEALS.filter(function (o) { return o[0] === p.seal; })[0];
      if (p.seal) bits.push(["Seal", so ? so[1] : p.seal]);
      if (p.clr) bits.push(["Clearance", p.clr]);
      var cdyn = (p.attrs || []).filter(function (a) { return a[0] === "Dynamic load rating (C)"; })[0];
      if (cdyn) bits.push(["Load C", cdyn[1]]);
    } else {
      if (p.d != null) bits.push(["Size", BS.dims(p)]);
      var dims = p.d != null ? squash(BS.dims(p)) : "";
      var title = squash(p.title);
      // Up to three facts, skipping any that repeat the size, the title or an earlier label.
      (p.attrs || []).forEach(function (a) {
        if (bits.length >= 3) return;
        if (dims && squash(a[1]) === dims) return;
        if (squash(a[1]).length > 3 && title.indexOf(squash(a[1])) !== -1) return;
        if (bits.some(function (b) { return b[0] === a[0]; })) return;
        bits.push([a[0], a[1]]);
      });
    }
    // The size is tagged so phones, where the card subtitle already shows it, can drop it.
    return '<dl class="pcard__specs">' + bits.map(function (b) { return "<div" + (b[0] === "Size" ? ' class="is-size"' : "") + "><dt>" + esc(b[0]) + "</dt><dd>" + esc(b[1]) + "</dd></div>"; }).join("") + "</dl>";
  }
  // Stored compare list, tolerant of anything another version or tab may have written.
  function readCompare() {
    var v = BS.store.get("compare", []);
    if (!Array.isArray(v)) return [];
    return v.filter(function (id, i) { return typeof id === "string" && BS.byId(id) && v.indexOf(id) === i; }).slice(0, MAX_CMP);
  }
  var cmpIds = readCompare();
  function decorate(root) {
    $$(".pcard:not([data-dec])", root).forEach(function (card) {
      card.setAttribute("data-dec", "");
      var id = card.getAttribute("data-pid");
      var p = BS.byId(id);
      var b = BS.brand(p.brand);
      var on = cmpIds.indexOf(id) !== -1;
      var cmp = '<label class="pcard__cmp"><input type="checkbox" data-cmp="' + esc(id) + '" data-fkey="cmp:' + esc(id) + '"' + (on ? " checked" : "") + '><span>Compare<span class="sr-only"> ' + esc(b.name + " " + p.pn) + "</span></span></label>";
      var body = $(".pcard__body", card);
      dedupeSpec(card, p);
      if (state.view === "list") {
        var spec = $(".pcard__spec", card);
        if (spec) spec.insertAdjacentHTML("afterend", specLine(p));
        var buy = doc.createElement("div");
        buy.className = "pcard__buy";
        [".pcard__price", ".pcard__tier", ".pcard__actions"].forEach(function (sel) { var x = $(sel, card); if (x) buy.appendChild(x); });
        buy.insertAdjacentHTML("beforeend", cmp);
        card.appendChild(buy);
      } else body.insertAdjacentHTML("beforeend", cmp);
    });
  }

  function renderResults(opts) {
    opts = opts || {};
    var n = current.length;
    el.grid.removeAttribute("aria-busy");
    el.grid.classList.toggle("is-list", state.view === "list");
    el.grid.classList.toggle("pgrid--3", state.view !== "list");
    if (!n) {
      el.grid.innerHTML = "";
      el.grid.hidden = true;
      el.more.hidden = true;
      el.empty.hidden = false;
      el.empty.innerHTML = emptyHTML();
      $$(".pcard", el.empty).forEach(function (c) { dedupeSpec(c, BS.byId(c.getAttribute("data-pid"))); });
      if (opts.instant) showNow(el.empty);
      BS.reveal(el.empty);
      return;
    }
    el.grid.hidden = false;
    el.empty.hidden = true;
    el.empty.innerHTML = "";
    shown = Math.min(Math.max(shown, PAGE), n);
    el.grid.innerHTML = current.slice(0, shown).map(function (p, i) { return cardHTML(p, Math.min(i, 5)); }).join("");
    decorate(el.grid);
    if (opts.instant) showNow(el.grid);
    BS.reveal(el.grid);
    renderMore();
  }
  // Re-rendering only to change prices: keep cards still instead of replaying the entrance.
  function showNow(root) { $$(".reveal", root).forEach(function (r) { r.classList.add("is-in"); }); }
  function renderMore() {
    var n = current.length, left = n - shown;
    el.more.hidden = left <= 0;
    if (left <= 0) return;
    el.moreMeta.textContent = "Showing " + shown + " of " + n;
    el.moreBar.style.width = Math.round((shown / n) * 100) + "%";
    el.moreBtn.textContent = "Show " + Math.min(PAGE, left) + " more";
    el.moreBtn.setAttribute("aria-label", "Show " + Math.min(PAGE, left) + " more, " + left + " not shown yet");
  }
  function showMore() {
    var from = shown;
    shown = Math.min(current.length, shown + PAGE);
    el.grid.insertAdjacentHTML("beforeend", current.slice(from, shown).map(function (p, i) { return cardHTML(p, Math.min(i, 5)); }).join(""));
    decorate(el.grid);
    BS.reveal(el.grid);
    renderMore();
    var first = el.grid.children[from];
    var link = first && $(".pcard__title a", first);
    if (link) link.focus({ preventScroll: true });
    if (first && !el.more.hidden) { /* keep the button reachable; nothing else to do */ }
    if (first) first.scrollIntoView({ block: "nearest", behavior: BS.reduceMotion ? "auto" : "smooth" });
  }

  // Many titles already carry the size ("..., 25 x 52 x 7 mm"); do not print it twice on the card.
  function squash(v) { return String(v).toLowerCase().replace(/\s+/g, "").replace(/×/g, "x"); }
  function dedupeSpec(root, p) {
    var d = BS.dims(p);
    if (!d || squash(p.title).indexOf(squash(d)) === -1) return;
    $$(".pcard__spec", root).forEach(function (sp) { sp.textContent = p.title; });
  }

  // "SKF 6205-2RS1/C3" -> "6205", when that shorter search would find something.
  function baseNumber(q) {
    var m = String(q).match(/[A-Za-z]{0,3}\d{3,6}/);
    if (!m) return "";
    var b = m[0].toUpperCase();
    if (BS.norm(b) === BS.norm(q)) return "";
    return BS.search(b, 1).length ? b : "";
  }
  function popular() {
    return P.filter(function (p) { return (p.tags || []).indexOf("bestseller") !== -1 && p.stock > 0; })
      .sort(function (a, b) { return b.reviews - a.reviews; }).slice(0, 4);
  }
  function emptyHTML() {
    var s = state, ac = activeCount(s);
    var q = s.q;
    var title = q ? "No exact match for “" + esc(q) + "”" : "No products match these filters";
    var lead = q ? "Part numbers are written many ways. A few things to try:" : "Nothing in the catalogue fits all of these at once. A few things to try:";
    var tries = [];
    var others = ac - (q ? 1 : 0);
    if (others) {
      tries.push(["arrow-counter-clockwise", "Remove some filters", "You have " + plural(others, "filter") + " on" + (q ? " as well as the search" : "") + "." + (s.cat ? " The category stays as it is." : ""),
        '<button class="btn btn--sm" type="button" ' + (q ? "data-clear-filters" : "data-clear-all") + ">" + (q ? "Clear filters, keep search" : "Clear all filters") + "</button>"]);
    }
    if (q) {
      var base = baseNumber(q);
      tries.push(["hash", "Check the part number", "Brand prefixes and suffixes vary. Try the base number, for example 6205 instead of SKF 6205-2RS1/C3.",
        base ? '<button class="btn btn--sm btn--quiet" type="button" data-try-q="' + esc(base) + '">Search ' + esc(base) + "</button>" : ""]);
    }
    tries.push(["ruler", "Check the size", "Sizes go bore × outer × width in mm, for example 25x52x15. Drop the width to see near sizes.", '<a class="more" href="index.html#finder">Find by size</a>']);
    tries.push(["arrows-left-right", "Find an equivalent", "Match a part number from another brand to one we stock.", '<a class="more" href="tools.html' + (q ? "?q=" + encodeURIComponent(q) : "") + '#interchange">Interchange finder</a>']);
    tries.push(["paper-plane-tilt", "Ask us to source it", "Send the number and quantity. A specialist replies within 2 working hours.", '<a class="more" href="quick-order.html' + (q ? "?q=" + encodeURIComponent(q) : "") + '#rfq">Request a quote</a>']);
    var pop = popular();
    return '<div class="empty shop-empty reveal">' + icon("magnifying-glass") +
      "<h3>" + title + "</h3><p>" + lead + "</p>" +
      '<ul class="tries">' + tries.map(function (t) {
        return '<li class="try">' + icon(t[0]) + '<div class="try__txt"><p class="try__h">' + t[1] + '</p><p class="try__p">' + t[2] + "</p></div>" + t[3] + "</li>";
      }).join("") + "</ul></div>" +
      (pop.length ? '<div class="shop-pop"><h3 class="h4 shop-pop__h">Popular right now</h3><ul class="shop-pop__grid" role="list">' +
        pop.map(function (p, i) { return '<li class="rgrid__item">' + BS.card(p, { reveal: true, i: i, sizes: "(max-width: 834px) 46vw, 240px" }) + "</li>"; }).join("") + "</ul></div>" : "");
  }

  /* ------------------------------------------------------------ interactions */
  function update(fn, opts) {
    var n = clone(state);
    fn(n);
    commit(n, opts);
  }
  function toggleIn(arr, v) { var i = arr.indexOf(v); if (i === -1) arr.push(v); else arr.splice(i, 1); }

  el.filters.addEventListener("change", function (e) {
    var t = e.target;
    var kind = t.getAttribute("data-f");
    if (!kind) return;
    update(function (s) {
      if (kind === "stock") s.stock = t.checked;
      else if (kind === "ship") s.ship = t.checked;
      else toggleIn(s[kind], t.value);
    });
  });

  doc.addEventListener("click", function (e) {
    var t = e.target, x;
    if ((x = t.closest("[data-cat]")) && el.filters.contains(x)) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      var id = x.getAttribute("data-cat");
      if (id === state.cat) return;
      commit(withCat(state, id), { push: true });
      return;
    }
    if ((x = t.closest("[data-chapter]"))) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      var key = x.getAttribute("data-chapter").split(":");
      if (key[0] === "fresh") commit(withCat(blank(state), key[1]), { push: true });
      else if (key[0] === "cat") commit(withCat(state, key[1]), { push: true });
      else if (key[0] === "csub") { var cs = withCat(state, key[1]); cs.sub = [key[2]]; commit(cs, { push: true }); }
      else update(function (s) { s.sub = key[1] ? [key[1]] : []; }, { push: true });
      return;
    }
    if ((x = t.closest("[data-bore]"))) {
      var bore = parseFloat(x.getAttribute("data-bore"));
      update(function (s) { s.d = s.d != null && near(bore, s.d) ? null : bore; });
      return;
    }
    if ((x = t.closest("[data-chip]"))) {
      var chips = $$("[data-chip]", el.active);
      var idx = chips.indexOf(x);
      removeChip(x.getAttribute("data-chip"));
      var after = $$("[data-chip]", el.active);
      var next = after[Math.min(idx, after.length - 1)] || el.title;
      if (next === el.title) { el.title.setAttribute("tabindex", "-1"); }
      next.focus({ preventScroll: true });
      return;
    }
    if (t.closest("[data-clear-all]")) { clearAll(false); return; }
    if (t.closest("[data-clear-filters]")) { clearAll(true); return; }
    if ((x = t.closest("[data-try-q]"))) {
      var tq = x.getAttribute("data-try-q");
      update(function (s) { s.q = tq; }, { push: true });
      el.title.setAttribute("tabindex", "-1");
      el.title.focus({ preventScroll: true });
      return;
    }
    if ((x = t.closest("[data-gst]"))) { BS.setPref("gst", x.getAttribute("data-gst")); return; }
    if ((x = t.closest("[data-view]"))) {
      var v = x.getAttribute("data-view");
      if (v === state.view) return;
      BS.store.set("shopView", v);
      update(function (s) { s.view = v; }, { keepShown: true });
      return;
    }
    if (t.closest("[data-more-btn]")) { showMore(); return; }
    if (t.closest("[data-brand-more]")) {
      brandsOpen = !brandsOpen;
      renderFacets();
      el.brandMore.focus();
      return;
    }
    if ((x = t.closest(".fgroup__btn"))) {
      var open = x.getAttribute("aria-expanded") !== "true";
      x.setAttribute("aria-expanded", String(open));
      doc.getElementById(x.getAttribute("aria-controls")).hidden = !open;
      return;
    }
    if (t.closest("[data-open-filters]")) { openFilters(); return; }
    if (t.closest("[data-close-filters]") || t.closest("[data-fscrim]")) { closeFilters(true); return; }
    if ((x = t.closest("[data-cmp-remove]"))) { setCompare(x.getAttribute("data-cmp-remove"), false); return; }
    if (t.closest("[data-cmp-clear]")) { clearCompare(); return; }
    if (t.closest("[data-cmp-open]")) { openCompare(); return; }
    if (t.closest("[data-cmp-close]")) { closeCompare(); return; }
  });

  function removeChip(key) {
    var k = key.split(":");
    update(function (s) {
      if (k[0] === "q") s.q = "";
      else if (k[0] === "size") { s.d = s.D = s.B = null; }
      else if (k[0] === "tag") s.tag = "";
      else if (k[0] === "stock") s.stock = false;
      else if (k[0] === "ship") s.ship = false;
      else if (k[0] === "price") { s.min = s.max = null; }
      else toggleIn(s[k[0]], k.slice(1).join(":"));
    });
  }
  function clearAll(keepQ) {
    update(function (s) {
      if (!keepQ) s.q = "";
      s.sub = []; s.d = s.D = s.B = null; s.brand = []; s.seal = []; s.clr = [];
      s.tag = ""; s.stock = false; s.ship = false; s.min = s.max = null;
    }, { push: true });
    el.sizeErr.textContent = ""; el.priceErr.textContent = "";
    el.sizeIn.concat(el.priceIn).forEach(function (i) { i.removeAttribute("aria-invalid"); });
    var a = doc.activeElement;
    // The sheet's own Clear all is now disabled: hand focus to the sheet's main button instead of leaving it on a dead control.
    if (a && a.disabled && el.filters.classList.contains("is-open")) { el.sheetDone.focus(); return; }
    if (!el.filters.contains(a) || !a.offsetParent || a.disabled) {
      el.title.setAttribute("tabindex", "-1");
      el.title.focus({ preventScroll: true });
    }
  }

  el.sort.addEventListener("change", function () {
    var v = el.sort.value;
    update(function (s) { s.sort = v; });
  });

  /* search inside the listing */
  var qTimer;
  el.qInput.addEventListener("input", function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () {
      var v = el.qInput.value.trim().slice(0, 80);
      if (v === state.q) return;
      update(function (s) { s.q = v; if (v && s.sort !== "relevance") { /* keep the chosen sort */ } }, { scroll: false });
    }, 280);
  });
  el.qInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(qTimer);
      var v = el.qInput.value.trim().slice(0, 80);
      if (v) BS.rememberQuery(v);
      if (v !== state.q) update(function (s) { s.q = v; });
      else scrollToResults();
    }
  });

  /* size inputs: numeric, live, with an inline error */
  function readNum(inp) {
    var raw = inp.value.trim().replace(",", ".");
    if (!raw) return { ok: true, v: null };
    var v = parseFloat(raw);
    if (!/^\d*\.?\d+$/.test(raw) || !isFinite(v) || v <= 0) return { ok: false };
    return { ok: true, v: Math.round(v * 100) / 100 };
  }
  function applySize() {
    var vals = {}, bad = [];
    el.sizeIn.forEach(function (inp) {
      var r = readNum(inp);
      inp.setAttribute("aria-invalid", r.ok && !(r.v > 2000) ? "false" : "true");
      if (!r.ok || r.v > 2000) bad.push(inp.previousElementSibling.textContent);
      else vals[inp.getAttribute("data-size")] = r.v;
    });
    if (!bad.length && vals.d != null && vals.D != null && vals.D <= vals.d) {
      el.sizeErr.textContent = "Outer D must be larger than bore d.";
      $('[data-size="D"]').setAttribute("aria-invalid", "true");
      return;
    }
    if (bad.length) {
      el.sizeErr.textContent = bad.join(" and ") + ": enter millimetres as a number, like 25 or 19.05.";
      return;
    }
    el.sizeErr.textContent = "";
    el.sizeIn.forEach(function (inp) { inp.removeAttribute("aria-invalid"); });
    if (vals.d == state.d && vals.D == state.D && vals.B == state.B) return; // eslint-disable-line eqeqeq
    update(function (s) { s.d = vals.d; s.D = vals.D; s.B = vals.B; }, { scroll: false });
  }
  var sizeDeb = BS.debounce(applySize, 450);
  el.sizeIn.forEach(function (inp) {
    inp.addEventListener("input", sizeDeb);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applySize(); scrollToResults(); } });
    inp.addEventListener("blur", function () { if (inp.value !== (state[inp.getAttribute("data-size")] != null ? fmtNum(state[inp.getAttribute("data-size")]) : "")) applySize(); });
  });

  function applyPrice() {
    var minI = $('[data-price="min"]'), maxI = $('[data-price="max"]');
    var a = readNum(minI), b = readNum(maxI);
    minI.setAttribute("aria-invalid", String(!a.ok));
    maxI.setAttribute("aria-invalid", String(!b.ok));
    if (!a.ok || !b.ok) { el.priceErr.textContent = "Enter whole rupees, like 500. Leave a box empty for no limit."; return; }
    if (a.v != null && b.v != null && a.v > b.v) {
      el.priceErr.textContent = "The minimum is more than the maximum.";
      minI.setAttribute("aria-invalid", "true");
      maxI.setAttribute("aria-invalid", "true");
      return;
    }
    el.priceErr.textContent = "";
    minI.removeAttribute("aria-invalid"); maxI.removeAttribute("aria-invalid");
    if (a.v == state.min && b.v == state.max) return; // eslint-disable-line eqeqeq
    update(function (s) { s.min = a.v; s.max = b.v; }, { scroll: false });
  }
  var priceDeb = BS.debounce(applyPrice, 650);
  el.priceIn.forEach(function (inp) {
    inp.addEventListener("input", priceDeb);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyPrice(); scrollToResults(); } });
    inp.addEventListener("blur", function () { applyPrice(); });
  });

  /* ----------------------------------------------------------- filter sheet */
  var sheetLastFocus = null, sheetUrl = "";
  function openFilters() {
    if (!mqSheet.matches) { var first = $("input, a, button", el.fbody); if (first) first.focus(); return; }
    sheetLastFocus = doc.activeElement;
    sheetUrl = toUrl(state);
    el.filters.setAttribute("role", "dialog");
    el.filters.setAttribute("aria-modal", "true");
    el.filters.classList.add("is-open");
    el.fscrim.classList.add("is-on");
    el.openFilters.setAttribute("aria-expanded", "true");
    doc.body.classList.add("is-locked");
    requestAnimationFrame(function () { var c = $(".filters__close", el.filters); if (c) c.focus(); });
  }
  function closeFilters(restore) {
    if (!el.filters.classList.contains("is-open")) {
      if (!mqSheet.matches && restore) scrollToResults();
      return;
    }
    el.filters.classList.remove("is-open");
    el.fscrim.classList.remove("is-on");
    el.filters.removeAttribute("role");
    el.filters.removeAttribute("aria-modal");
    el.openFilters.setAttribute("aria-expanded", "false");
    doc.body.classList.remove("is-locked");
    if (restore && sheetLastFocus && sheetLastFocus.focus) sheetLastFocus.focus({ preventScroll: true });
    // Only bring the results into view when the filters changed while the sheet was open.
    if (toUrl(state) !== sheetUrl) scrollToResults();
  }
  function onSheetMQ() { if (!mqSheet.matches) closeFilters(false); }
  if (mqSheet.addEventListener) mqSheet.addEventListener("change", onSheetMQ); else mqSheet.addListener(onSheetMQ);

  function trap(container, e) {
    var f = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', container)
      .filter(function (x) { return x.offsetParent !== null || x === doc.activeElement; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (!container.contains(doc.activeElement)) { first.focus(); e.preventDefault(); return; }
    if (e.shiftKey && doc.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && doc.activeElement === last) { first.focus(); e.preventDefault(); }
  }
  function overlayBusy() {
    var d = $("#cart-drawer"), s = $("#search");
    return (d && d.classList.contains("is-open")) || (s && s.classList.contains("is-open"));
  }
  // Capture phase so the cart drawer and search overlay keep their own Escape.
  window.addEventListener("keydown", function (e) {
    if (overlayBusy()) return;
    var cmpOpen = !el.cmp.hidden && el.cmp.classList.contains("is-open");
    var sheetOpen = el.filters.classList.contains("is-open");
    if (e.key === "Escape") {
      if (cmpOpen) { e.stopPropagation(); closeCompare(); }
      else if (sheetOpen) { e.stopPropagation(); closeFilters(true); }
      return;
    }
    if (e.key === "Tab") {
      if (cmpOpen) trap($(".cmp__panel", el.cmp), e);
      else if (sheetOpen) trap(el.filters, e);
    }
  }, true);

  /* --------------------------------------------------------------- compare */
  function saveCompare() { BS.store.set("compare", cmpIds); }
  function setCompare(id, on) {
    var i = cmpIds.indexOf(id);
    if (on && i === -1) {
      if (cmpIds.length >= MAX_CMP) {
        $$('[data-cmp="' + id + '"]').forEach(function (c) { c.checked = false; });
        BS.toast("You can compare up to 4 products. Remove one to add another.", { icon: "scales", label: "Compare now", onAction: openCompare });
        return;
      }
      cmpIds.push(id);
    } else if (!on && i !== -1) cmpIds.splice(i, 1);
    saveCompare();
    $$('[data-cmp="' + id + '"]').forEach(function (c) { c.checked = cmpIds.indexOf(id) !== -1; });
    renderTray();
    if (!el.cmp.hidden) {
      if (cmpIds.length) renderCompare(); else closeCompare();
    }
  }
  function clearCompare() {
    var gone = cmpIds.slice();
    cmpIds = [];
    saveCompare();
    $$("[data-cmp]").forEach(function (c) { c.checked = false; });
    renderTray();
    if (!el.cmp.hidden) closeCompare();
    if (gone.length) BS.toast("Compare list cleared.", { icon: "scales", label: "Undo", onAction: function () { cmpIds = gone; saveCompare(); $$("[data-cmp]").forEach(function (c) { c.checked = cmpIds.indexOf(c.getAttribute("data-cmp")) !== -1; }); renderTray(); } });
  }
  doc.addEventListener("change", function (e) {
    var c = e.target.closest && e.target.closest("[data-cmp]");
    if (c) setCompare(c.getAttribute("data-cmp"), c.checked);
  });

  var trayWasOn = false;
  function renderTray() {
    var n = cmpIds.length;
    var on = n > 0;
    var slots = "";
    for (var i = 0; i < MAX_CMP; i++) {
      var p = BS.byId(cmpIds[i]);
      if (p) {
        var b = BS.brand(p.brand);
        slots += '<li class="tslot"><span class="tslot__img" title="' + esc(b.name + " " + p.pn) + '">' + BS.imgTag(p.img, { alt: b.name + " " + p.pn, sizes: "56px" }) + "</span>" +
          '<button class="tslot__x" type="button" data-cmp-remove="' + esc(p.id) + '" aria-label="Remove ' + esc(b.name + " " + p.pn) + ' from compare">' + icon("x") + "</button></li>";
      } else slots += '<li class="tslot tslot--empty" aria-hidden="true"></li>';
    }
    el.traySlots.innerHTML = slots;
    el.trayTitle.textContent = plural(n, "product") + " selected";
    el.trayHint.textContent = n < 2 ? "Add one more to compare" : n < MAX_CMP ? "Add up to " + MAX_CMP : "That is the maximum";
    el.cmpOpen.disabled = n < 2;
    el.cmpOpen.textContent = "Compare (" + n + ")";
    if (on && !trayWasOn) {
      el.tray.hidden = false;
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.tray.classList.add("is-on"); }); });
    } else if (!on && trayWasOn) {
      el.tray.classList.remove("is-on");
      setTimeout(function () { if (!cmpIds.length) el.tray.hidden = true; }, 420);
    }
    doc.body.classList.toggle("has-cmp", on);
    trayWasOn = on;
  }

  var cmpLastFocus = null;
  function openCompare() {
    if (cmpIds.length < 1) return;
    cmpLastFocus = doc.activeElement;
    renderCompare();
    el.cmp.hidden = false;
    doc.body.classList.add("is-locked");
    requestAnimationFrame(function () {
      el.cmp.classList.add("is-open");
      var c = $(".cmp__close", el.cmp);
      if (c) c.focus();
    });
  }
  function closeCompare() {
    if (el.cmp.hidden) return;
    el.cmp.classList.remove("is-open");
    if (!el.filters.classList.contains("is-open")) doc.body.classList.remove("is-locked");
    setTimeout(function () { if (!el.cmp.classList.contains("is-open")) el.cmp.hidden = true; }, 360);
    var back = cmpLastFocus && doc.contains(cmpLastFocus) && cmpLastFocus.offsetParent ? cmpLastFocus : el.cmpOpen.offsetParent ? el.cmpOpen : el.title;
    if (back === el.title) el.title.setAttribute("tabindex", "-1");
    if (back && back.focus) back.focus({ preventScroll: true });
  }
  function attr(p, name) {
    var a = (p.attrs || []).filter(function (x) { return x[0] === name; })[0];
    return a ? a[1] : "";
  }
  function renderCompare() {
    var items = cmpIds.map(BS.byId).filter(Boolean);
    var inc = BS.prefs().gst === "inc";
    el.cmpTitle.textContent = "Compare " + plural(items.length, "product");
    var names = [];
    items.forEach(function (p) { (p.attrs || []).forEach(function (a) { if (names.indexOf(a[0]) === -1) names.push(a[0]); }); });
    var rows = [];
    rows.push({ label: "Price", raw: items.map(function (p) { return p.price; }), html: items.map(function (p) {
      return '<span class="cmp-price">' + BS.priceHTML(p.price, p) + "</span>" + (p.mrp && p.mrp > p.price && !inc ? '<s class="small muted">' + inr(p.mrp) + "</s>" : "");
    }) });
    rows.push({ label: "Best volume price", raw: items.map(function (p) { var t = BS.bestTier(p); return t ? t.price + "@" + t.qty : ""; }), html: items.map(function (p) {
      var t = BS.bestTier(p);
      return t ? '<span class="num">' + inr(inc ? BS.withGst(t.price) : t.price) + "</span> / " + esc(BS.unitLabel(p)) + " at " + t.qty + "+" : "";
    }) });
    rows.push({ label: "Type", raw: items.map(function (p) { return p.cat + "/" + p.sub; }), html: items.map(function (p) { var sb = BS.sub(p.cat, p.sub); return esc(sb ? sb.name : BS.cat(p.cat).name); }) });
    rows.push({ label: "Dimensions", raw: items.map(function (p) { return BS.dims(p); }), html: items.map(function (p) { return BS.dims(p) ? '<span class="num">' + esc(BS.dims(p)) + "</span>" : ""; }) });
    names.forEach(function (n) {
      rows.push({ label: n, raw: items.map(function (p) { return attr(p, n); }), html: items.map(function (p) { return esc(attr(p, n)); }) });
    });
    rows.push({ label: "Availability", raw: items.map(function (p) { return BS.stock(p).text; }), html: items.map(function (p) { var st = BS.stock(p); return '<span class="' + st.cls + '">' + esc(st.text) + "</span>"; }) });
    rows.push({ label: "Rating", raw: items.map(function (p) { return p.rating + "/" + p.reviews; }), html: items.map(function (p) { return BS.starsHTML(p.rating, p.reviews); }) });

    var head = '<tr><th scope="col" class="cmp-t__corner"><span class="sr-only">Detail</span></th>' + items.map(function (p) {
      var b = BS.brand(p.brand);
      return '<th scope="col" class="cmp-t__prod"><a class="cmp-t__img" href="' + BS.url(p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(p.img, { alt: "", sizes: "160px" }) + "</a>" +
        '<p class="pcard__brand">' + esc(b.name) + '</p><a class="cmp-t__pn" href="' + BS.url(p) + '">' + esc(p.pn) + '</a><p class="cmp-t__sub">' + esc(p.title) + "</p>" +
        '<button class="textlink small cmp-t__rm" type="button" data-cmp-remove="' + esc(p.id) + '" aria-label="Remove ' + esc(b.name + " " + p.pn) + ' from compare">Remove</button></th>';
    }).join("") + (items.length < 2 ? '<th scope="col" class="cmp-t__prod cmp-t__ghost"><p class="small muted">Tick Compare on another product to see it here.</p></th>' : "") + "</tr>";
    var body = rows.map(function (r) {
      var vals = r.raw.map(function (v) { return String(v == null ? "" : v).trim().toLowerCase(); });
      var differ = items.length > 1 && vals.some(function (v) { return v !== vals[0]; });
      return '<tr class="' + (differ ? "is-diff" : "is-same") + '"><th scope="row">' + esc(r.label) + "</th>" +
        r.html.map(function (h) { return "<td>" + (h || '<span class="cmp-t__na" aria-label="Not listed">–</span>') + "</td>"; }).join("") +
        (items.length < 2 ? "<td></td>" : "") + "</tr>";
    }).join("");
    var buy = '<tr class="cmp-t__buy"><th scope="row"><span class="sr-only">Buy</span></th>' + items.map(function (p) {
      var b = BS.brand(p.brand);
      return '<td><button class="btn btn--sm btn--add" type="button" data-add="' + esc(p.id) + '" aria-label="Add ' + esc(b.name + " " + p.pn) + ' to bag">Add to bag</button></td>';
    }).join("") + (items.length < 2 ? "<td></td>" : "") + "</tr>";
    var diffCount = (body.match(/class="is-diff"/g) || []).length;
    el.cmpBody.innerHTML = '<p class="cmp__note small muted">' + (items.length > 1 ? plural(diffCount, "row") + " differ" + (diffCount === 1 ? "s" : "") + ", highlighted in blue. Prices " + (inc ? "include" : "exclude") + " GST." : "Add another product to see the differences.") + "</p>" +
      '<div class="cmp-t__wrap"><table class="cmp-t' + (el.cmpDiff.checked ? " is-diffonly" : "") + '" style="--cols:' + Math.max(2, items.length) + '"><caption class="sr-only">Side-by-side comparison</caption><thead>' + head + "</thead><tbody>" + body + buy + "</tbody></table></div>";
  }
  el.cmpDiff.addEventListener("change", function () {
    var t = $(".cmp-t", el.cmpBody);
    if (t) t.classList.toggle("is-diffonly", el.cmpDiff.checked);
  });

  /* ---------------------------------------------------------------- events */
  BS.on("prefs", function () {
    render({ scroll: false, instant: true });
    if (!el.cmp.hidden) renderCompare();
  });
  window.addEventListener("storage", function (e) {
    if (e.key === "bs.compare") {
      cmpIds = readCompare();
      $$("[data-cmp]").forEach(function (c) { c.checked = cmpIds.indexOf(c.getAttribute("data-cmp")) !== -1; });
      renderTray();
      if (!el.cmp.hidden) { if (cmpIds.length) renderCompare(); else closeCompare(); }
    }
  });

  /* ------------------------------------------------------------------ init */
  // Normalise the URL (for example sub without cat) without adding history.
  try {
    var canon = toUrl(state);
    if (canon !== "shop.html" + location.search) history.replaceState(null, "", canon);
  } catch (e) { /* ignore */ }
  render({ scroll: false });
  renderTray();
  BS.reveal();
})();
