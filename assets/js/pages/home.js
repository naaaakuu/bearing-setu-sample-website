/* Home page */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, inr = BS.inr, icon = BS.icon;
  var P = BS.products;

  /* hero: the stage rises in with CSS alone (no script needed to show it), then the photo settles from 1.12x to 1x as it scrolls into view */
  var stage = $("[data-hero-stage]"), himg = $("[data-hero-img]");
  if (stage && himg) {
    if (BS.reduceMotion) himg.style.setProperty("--zoom", "1");
    else {
      var ticking = false;
      var onScroll = function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var r = stage.getBoundingClientRect(), vh = window.innerHeight;
          var p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.9)));
          himg.style.setProperty("--zoom", (1.12 - 0.12 * p).toFixed(4));
          ticking = false;
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      onScroll();
    }
  }

  /* category strip */
  var strip = $("[data-cat-strip]");
  strip.innerHTML = BS.catalog.categories.map(function (c, i) {
    var n = P.filter(function (p) { return p.cat === c.id; }).length;
    return '<li class="cats__item reveal" style="--i:' + i + '"><a href="shop.html?cat=' + c.id + '">' +
      '<span class="cats__img">' + BS.imgTag(c.img, { alt: "", sizes: "96px" }) + "</span>" +
      "<span>" + esc(c.short || c.name) + '<span class="cats__count">' + n + " parts</span></span></a></li>";
  }).join("");

  /* size finder */
  var form = $("[data-finder]");
  var fd = $("#f-d"), fD = $("#f-D"), fB = $("#f-B"), ft = $("#f-t");
  var countEl = $("[data-finder-count]"), btn = $("[data-finder-btn]");
  var shape = $("[data-shape]"), dims = $("[data-dims]");
  var BEARING_CATS = { "ball-bearings": 1, "roller-bearings": 1 };
  function num(el) { var v = parseFloat(String(el.value).replace(",", ".")); return isFinite(v) && v > 0 ? v : null; }
  function near(a, b) { return Math.abs(a - b) < 0.6; }
  function matches(d, D, B, sub) {
    return P.filter(function (p) {
      if (!BEARING_CATS[p.cat] || p.d == null) return false;
      if (sub && p.sub !== sub) return false;
      if (d != null && !near(p.d, d)) return false;
      if (D != null && !near(p.D, D)) return false;
      if (B != null && !near(p.B, B)) return false;
      return true;
    });
  }
  function draw(d, D, B, ghost) {
    var cx = 196, cy = 170, H = 236;
    var s = H / D;
    var w = Math.max(18, Math.min(150, B * s));
    var x0 = cx - w / 2;
    var ro = D / 2 * s, ri = d / 2 * s;
    var gap = ro - ri;
    var ring = gap * 0.3;
    var ball = gap * 0.42;
    function sect(sign) {
      var y = function (r) { return cy - sign * r; };
      var outerTop = Math.min(y(ro), y(ro - ring)), innerTop = Math.min(y(ri + ring), y(ri));
      var midR = (ro + ri) / 2;
      return '<rect x="' + x0 + '" y="' + outerTop + '" width="' + w + '" height="' + ring + '" rx="2" fill="url(#steel)" stroke="#59606b" stroke-width="1"/>' +
        '<rect x="' + x0 + '" y="' + outerTop + '" width="' + w + '" height="' + ring + '" rx="2" fill="url(#hatch)" opacity=".5"/>' +
        '<rect x="' + x0 + '" y="' + innerTop + '" width="' + w + '" height="' + ring + '" rx="2" fill="url(#steel)" stroke="#59606b" stroke-width="1"/>' +
        '<rect x="' + x0 + '" y="' + innerTop + '" width="' + w + '" height="' + ring + '" rx="2" fill="url(#hatch)" opacity=".5"/>' +
        '<circle cx="' + cx + '" cy="' + y(midR) + '" r="' + Math.min(ball / 2, w / 2 - 2) + '" fill="url(#ballg)" stroke="#59606b" stroke-width=".8"/>';
    }
    shape.style.opacity = ghost ? ".45" : "1";
    shape.innerHTML =
      '<line x1="' + (x0 - 40) + '" y1="' + cy + '" x2="' + (x0 + w + 40) + '" y2="' + cy + '" stroke="#9aa1ab" stroke-width="1" stroke-dasharray="10 4 2 4"/>' +
      '<line x1="' + x0 + '" y1="' + (cy - ri) + '" x2="' + (x0 + w) + '" y2="' + (cy - ri) + '" stroke="#b9bec6" stroke-dasharray="4 4"/>' +
      '<line x1="' + x0 + '" y1="' + (cy + ri) + '" x2="' + (x0 + w) + '" y2="' + (cy + ri) + '" stroke="#b9bec6" stroke-dasharray="4 4"/>' +
      sect(1) + sect(-1);
    var xr = x0 + w + 44, xl = x0 - 44, yt = cy - ro - 30;
    function fmt(v) { return (Math.round(v * 100) / 100).toString(); }
    function arrowV(x, y1, y2) { return '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '"/><path d="M' + (x - 4) + " " + (y1 + 8) + "L" + x + " " + y1 + "L" + (x + 4) + " " + (y1 + 8) + '"/><path d="M' + (x - 4) + " " + (y2 - 8) + "L" + x + " " + y2 + "L" + (x + 4) + " " + (y2 - 8) + '"/>'; }
    dims.innerHTML =
      '<line x1="' + (x0 + w) + '" y1="' + (cy - ro) + '" x2="' + (xr + 8) + '" y2="' + (cy - ro) + '" opacity=".4"/><line x1="' + (x0 + w) + '" y1="' + (cy + ro) + '" x2="' + (xr + 8) + '" y2="' + (cy + ro) + '" opacity=".4"/>' +
      arrowV(xr, cy - ro, cy + ro) +
      '<text x="' + (xr + 12) + '" y="' + (cy - 6) + '" class="lbl">D</text><text x="' + (xr + 12) + '" y="' + (cy + 12) + '">' + fmt(D) + "</text>" +
      '<line x1="' + x0 + '" y1="' + (cy - ri) + '" x2="' + (xl - 8) + '" y2="' + (cy - ri) + '" opacity=".4"/><line x1="' + x0 + '" y1="' + (cy + ri) + '" x2="' + (xl - 8) + '" y2="' + (cy + ri) + '" opacity=".4"/>' +
      arrowV(xl, cy - ri, cy + ri) +
      '<text x="' + (xl - 12) + '" y="' + (cy - 6) + '" class="lbl" text-anchor="end">d</text><text x="' + (xl - 12) + '" y="' + (cy + 12) + '" text-anchor="end">' + fmt(d) + "</text>" +
      '<line x1="' + x0 + '" y1="' + (cy - ro) + '" x2="' + x0 + '" y2="' + (yt - 8) + '" opacity=".4"/><line x1="' + (x0 + w) + '" y1="' + (cy - ro) + '" x2="' + (x0 + w) + '" y2="' + (yt - 8) + '" opacity=".4"/>' +
      '<line x1="' + x0 + '" y1="' + yt + '" x2="' + (x0 + w) + '" y2="' + yt + '"/>' +
      '<path d="M' + (x0 + 8) + " " + (yt - 4) + "L" + x0 + " " + yt + "L" + (x0 + 8) + " " + (yt + 4) + '"/><path d="M' + (x0 + w - 8) + " " + (yt - 4) + "L" + (x0 + w) + " " + yt + "L" + (x0 + w - 8) + " " + (yt + 4) + '"/>' +
      '<text x="' + cx + '" y="' + (yt - 12) + '" text-anchor="middle"><tspan class="lbl">B </tspan>' + fmt(B) + "</text>";
  }
  function updateFinder() {
    var d = num(fd), D = num(fD), B = num(fB), sub = ft.value;
    var any = d != null || D != null || B != null;
    var dd = d || 25, DD = D || (d ? Math.round(d * 2.08) : 52), BB = B || (any ? Math.round((DD - dd) * 0.55) : 15);
    if (DD <= dd) DD = dd * 1.6;
    draw(dd, DD, BB, !any);
    if (!any) {
      countEl.innerHTML = "Try 25 × 52 × 15, the size of a 6205.";
      btn.textContent = "Find bearings";
      return;
    }
    var m = matches(d, D, B, sub);
    if (!m.length) {
      countEl.innerHTML = "No stocked bearing matches yet. We can source it for you.";
      btn.textContent = "Request this size";
      return;
    }
    var min = Math.min.apply(null, m.map(function (p) { return p.price; }));
    var today = m.filter(function (p) { return p.stock > 0 && p.ship === 0; }).length;
    countEl.innerHTML = "<strong>" + BS.plural(m.length, "bearing") + "</strong> match, from " + inr(min) + (today ? " · " + today + " ship today" : "");
    btn.textContent = "Show " + BS.plural(m.length, "bearing");
  }
  [fd, fD, fB].forEach(function (el) { el.addEventListener("input", BS.debounce(updateFinder, 80)); });
  ft.addEventListener("change", updateFinder);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = num(fd), D = num(fD), B = num(fB), sub = ft.value;
    var q = new URLSearchParams();
    if (!d && !D && !B) { fd.focus(); fd.setAttribute("aria-invalid", "true"); countEl.innerHTML = "Enter at least one size, for example a 25 mm bore."; return; }
    fd.removeAttribute("aria-invalid");
    if (!matches(d, D, B, sub).length) {
      location.href = "quick-order.html?size=" + encodeURIComponent([d, D, B].filter(Boolean).join("x")) + "#rfq";
      return;
    }
    if (d) q.set("d", d);
    if (D) q.set("D", D);
    if (B) q.set("B", B);
    if (sub) { q.set("cat", sub === "deep-groove" || sub === "angular-contact" ? "ball-bearings" : "roller-bearings"); q.set("sub", sub); }
    location.href = "shop.html?" + q.toString();
  });
  updateFinder();

  /* bestsellers shelf */
  var best = P.filter(function (p) { return (p.tags || []).indexOf("bestseller") !== -1; });
  if (best.length < 8) best = best.concat(P.filter(function (p) { return best.indexOf(p) === -1 && p.stock > 0; }).sort(function (a, b) { return b.reviews - a.reviews; }).slice(0, 8 - best.length));
  $("[data-best]").innerHTML = best.slice(0, 12).map(function (p, i) { return '<div role="listitem">' + BS.card(p, { reveal: i < 4, i: i, sizes: "(max-width: 640px) 70vw, 300px" }) + "</div>"; }).join("");

  /* category tiles */
  var TILES = [
    { cat: "ball-bearings", sub: "deep-groove", cls: "tile--dark", title: "Deep groove ball bearings", line: "Sealed. Shielded. Open. Always in stock.", img: "dgbb-sealed", links: [["Shop", "shop.html?cat=ball-bearings&sub=deep-groove"], ["Find by size", "#finder"]] },
    { cat: "housed-units", cls: "", title: "Housed units", line: "Pillow blocks and flanges, ready to bolt down.", img: "pillow-block", links: [["Shop", "shop.html?cat=housed-units"], ["Plummer blocks", "shop.html?cat=housed-units&sub=plummer-block"]] },
    { cat: "roller-bearings", cls: "tile--photo tile--wide", title: "Roller bearings for the heaviest loads.", line: "Spherical, tapered and cylindrical rollers for crushers, gearboxes and rolling mills.", scene: "gears", links: [["Shop roller bearings", "shop.html?cat=roller-bearings"], ["Spherical rollers", "shop.html?cat=roller-bearings&sub=spherical"]] },
    { cat: "belts-pulleys", cls: "", title: "Belts & pulleys", line: "Classical, wedge and timing belts. Power, transmitted.", img: "v-belt", links: [["Shop", "shop.html?cat=belts-pulleys"], ["Belt calculator", "tools.html#belt"]] },
    { cat: "seals", cls: "tile--warm", title: "Oil seals", line: "Keep the grease in. Keep the grit out.", img: "oil-seal", links: [["Shop", "shop.html?cat=seals"], ["O-ring kits", "shop.html?cat=seals&sub=o-rings"]] }
  ];
  $("[data-tiles]").innerHTML = TILES.map(function (t) {
    var links = '<div class="tile__links">' + t.links.map(function (l) { return '<a class="more' + (t.cls.indexOf("photo") !== -1 ? " more--light" : "") + '" href="' + l[1] + '">' + esc(l[0]) + "</a>"; }).join("") + "</div>";
    if (t.scene) {
      return '<div class="tile tile--cat ' + t.cls + ' reveal"><div class="tile__media"><img src="assets/img/s/' + t.scene + '.webp" srcset="assets/img/s/' + t.scene + "-sm.webp 900w, assets/img/s/" + t.scene + '.webp 1800w" sizes="100vw" alt="" loading="lazy" width="1800" height="1000"></div><div class="tile__shade"></div>' +
        "<h3>" + esc(t.title) + "</h3><p>" + esc(t.line) + "</p>" + links + "</div>";
    }
    return '<div class="tile tile--cat ' + t.cls + ' reveal"><h3>' + esc(t.title) + "</h3><p>" + esc(t.line) + "</p>" + links +
      BS.imgTag(t.img, { alt: "", cls: "tile__img", large: true, sizes: "(max-width: 834px) 78vw, 420px" }) + "</div>";
  }).join("");

  /* quick order demo */
  var qoText = $("[data-qo-text]"), qoOut = $("[data-qo-out]"), qoAdd = $("[data-qo-add]");
  var parsed = [];
  function renderQO() {
    parsed = BS.parseLines(qoText.value).slice(0, 8);
    if (!parsed.length) {
      qoOut.innerHTML = '<p class="muted small" style="padding:14px 0">Type a part number and quantity on each line, for example <span class="mono">6205-2RS1 x 200</span>.</p>';
      qoAdd.disabled = true;
      return;
    }
    var total = 0, ok = 0;
    var rows = parsed.map(function (l) {
      if (!l.p) return '<div class="qo__line is-missing">' + icon("x-circle") + '<span class="qo__name">' + esc(l.part) + "<small>Not found. We can source it.</small></span><span></span></div>";
      var unit = BS.unitPrice(l.p, l.qty), amt = unit * l.qty;
      total += amt; ok++;
      var b = BS.brand(l.p.brand);
      return '<div class="qo__line ' + (l.status === "found" ? "is-found" : "is-check") + '">' + icon(l.status === "found" ? "check-circle" : "warning-circle") +
        '<span class="qo__name">' + esc(b.name + " " + l.p.pn) + "<small>" + (l.status === "check" ? "Closest match · " : "") + l.qty + " × " + inr(unit) + "</small></span>" +
        '<span class="qo__amt num">' + inr(amt) + "</span></div>";
    }).join("");
    qoOut.innerHTML = rows + '<div class="qo__total"><span>' + ok + " of " + parsed.length + ' lines priced</span><span class="num">' + inr(Math.round(total)) + " <small>+ GST</small></span></div>";
    qoAdd.disabled = !ok;
  }
  qoText.addEventListener("input", BS.debounce(renderQO, 120));
  qoAdd.addEventListener("click", function () {
    var n = 0;
    parsed.forEach(function (l) { if (l.p) { BS.cart.add(l.p.id, l.qty); n++; } });
    if (n) BS.toast(BS.plural(n, "line") + " added to your bag.", { label: "View bag", onAction: BS.openCart });
  });
  renderQO();

  /* industries */
  var INDS = [
    ["ind-textile", "Textile mills", "Spindle and loom bearings, timing belts, lithium grease.", "shop.html?cat=ball-bearings&sub=deep-groove"],
    ["ind-cement", "Cement and mining", "Spherical rollers, plummer blocks and adapter sleeves.", "shop.html?cat=roller-bearings&sub=spherical"],
    ["ind-automotive", "Automotive and tractors", "Tapered rollers, needle bearings and oil seals.", "shop.html?cat=roller-bearings&sub=tapered"],
    ["ind-agriculture", "Agriculture", "Pillow blocks, flange units and V-belts for farm machines.", "shop.html?cat=housed-units"],
    ["ind-pumps", "Pumps and motors", "C3 deep groove bearings and couplings.", "shop.html?q=C3"],
    ["ind-steel", "Steel and rolling mills", "Cylindrical rollers and high-temperature greases.", "shop.html?cat=roller-bearings&sub=cylindrical"],
    ["ind-food", "Food processing", "Chains, linear motion parts and lubricants.", "shop.html?cat=power-transmission"],
    ["ind-paper", "Sugar and paper", "Chains, sprockets, couplings and heavy greases.", "shop.html?cat=power-transmission&sub=roller-chains"]
  ];
  $("[data-inds]").innerHTML = INDS.map(function (d, i) {
    return '<li class="reveal" style="--i:' + (i % 4) + '"><a class="ind" href="' + d[3] + '"><img src="assets/img/s/' + d[0] + '-sm.webp" alt="" loading="lazy" width="900" height="600">' +
      '<span class="ind__in"><h3>' + esc(d[1]) + "</h3><p>" + esc(d[2]) + '</p><span class="ind__go">Shop parts' + icon("arrow-right") + "</span></span></a></li>";
  }).join("");

  /* brands marquee (second copy is decorative) */
  var bl = BS.catalog.brands.map(function (b) { return "<li>" + esc(b.name.replace(/\s*\(.*\)$/, "")) + "</li>"; }).join("");
  var track = $("[data-brands]");
  track.innerHTML = bl + bl.replace(/<li>/g, '<li aria-hidden="true">');
  // The list moves on its own, so offer a way to stop it (it also pauses on hover). With reduced motion it does not move at all.
  var marquee = $("[data-marquee]"), mToggle = $("[data-marquee-toggle]");
  if (marquee && mToggle && !BS.reduceMotion) {
    mToggle.hidden = false;
    mToggle.addEventListener("click", function () {
      var paused = marquee.classList.toggle("is-paused");
      var word = paused ? "Play" : "Pause";
      mToggle.textContent = word;
      mToggle.setAttribute("aria-label", word + " the moving brand list");
    });
  }

  /* testimonials */
  var R = BS.catalog.reviews || {};
  var pool = [];
  Object.keys(R).forEach(function (k) { (R[k] || []).forEach(function (r) { if (r.rating >= 4 && r.body) pool.push(r); }); });
  pool.sort(function (a, b) { return b.body.length - a.body.length; });
  var picks = [pool[0], pool[Math.floor(pool.length / 3)], pool[Math.floor(pool.length * 2 / 3)]].filter(Boolean);
  if (picks.length) {
    function who(r) { return "<figcaption><strong>" + esc(r.name) + "</strong>" + esc(r.role + (r.city ? ", " + r.city : "")) + "</figcaption>"; }
    var big = picks[0];
    $("[data-voice]").insertAdjacentHTML("beforeend",
      '<figure class="quote quote--big reveal">' + BS.starsHTML(big.rating) + "<blockquote>“" + esc(big.body) + "”</blockquote>" + who(big) + "</figure>" +
      '<div class="voice__side">' + picks.slice(1).map(function (r, i) {
        return '<figure class="quote quote--small reveal" style="--i:' + (i + 1) + '">' + BS.starsHTML(r.rating) + "<blockquote>“" + esc(r.body) + "”</blockquote>" + who(r) + "</figure>";
      }).join("") + "</div>");
  }

  /* recently viewed */
  var rec = BS.recent.all().map(BS.byId).filter(Boolean);
  if (rec.length) {
    $("[data-recent-sec]").hidden = false;
    $("[data-recent]").innerHTML = rec.map(function (p) { return '<div role="listitem">' + BS.card(p, { sizes: "(max-width: 640px) 70vw, 300px" }) + "</div>"; }).join("");
  }

  BS.reveal();
  BS.shelf();
  BS.on("prefs", function () { location.reload(); });
})();
