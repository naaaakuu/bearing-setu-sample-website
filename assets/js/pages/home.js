/* Home page: categories, size finder, shortcuts, brands, contact band. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc;
  var PRIMARY = ["ball-bearings", "roller-bearings", "housed-units", "belts-pulleys", "seals"];
  var OTHER = ["lubrication", "power-transmission", "linear-motion", "mounting-tools"];

  function count(catId) { return BS.products.filter(function (p) { return p.cat === catId; }).length; }

  function renderCats() {
    var grid = $("[data-cat-grid]"), more = $("[data-cat-more]");
    grid.innerHTML = PRIMARY.map(BS.cat).filter(Boolean).map(function (c) {
      var subs = (c.subs || []).slice(0, 4).map(function (s) { return '<a href="shop.html?cat=' + esc(c.id) + "&amp;sub=" + esc(s.id) + '">' + esc(s.name) + "</a>"; }).join("");
      return '<li><div class="catcard"><a class="catcard__img" href="shop.html?cat=' + esc(c.id) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(c.img, { alt: "", sizes: "(max-width: 860px) 46vw, 240px" }) + "</a>" +
        '<div class="catcard__body"><a class="catcard__name" href="shop.html?cat=' + esc(c.id) + '">' + esc(c.name) + '</a><span class="catcard__count">' + BS.plural(count(c.id), "part") + '</span><div class="catcard__subs">' + subs + "</div></div></div></li>";
    }).join("");
    more.innerHTML = OTHER.map(BS.cat).filter(Boolean).map(function (c) {
      var m = BS.img(c.img);
      return '<li><a href="shop.html?cat=' + esc(c.id) + '"><img src="' + esc(m.xs || m.sm || m.src) + '" alt="" width="44" height="44" loading="lazy"><span>' + esc(c.name) + "<small>" + BS.plural(count(c.id), "part") + "</small></span></a></li>";
    }).join("");
  }

  function renderShortcuts() {
    var S = [
      ["Deep groove ball bearings", "shop.html?cat=ball-bearings&sub=deep-groove"], ["Tapered roller bearings", "shop.html?cat=roller-bearings&sub=tapered"],
      ["Spherical roller bearings", "shop.html?cat=roller-bearings&sub=spherical"], ["Pillow block units", "shop.html?cat=housed-units&sub=pillow-block"],
      ["Classical V-belts (A, B, C)", "shop.html?cat=belts-pulleys&sub=classical-v"], ["Wedge belts (SPA, SPB, SPZ)", "shop.html?cat=belts-pulleys&sub=wedge-v"],
      ["Timing belts", "shop.html?cat=belts-pulleys&sub=timing"], ["Oil seals", "shop.html?cat=seals&sub=oil-seals"], ["O-rings", "shop.html?cat=seals&sub=o-rings"],
      ["Bearing greases", "shop.html?cat=lubrication&sub=greases"], ["Equivalent parts", "tools.html#interchange"], ["Part number decoder", "tools.html#decoder"]
    ];
    $("[data-shortcuts]").innerHTML = S.map(function (s) { return '<li><a href="' + esc(s[1]) + '">' + esc(s[0]) + "</a></li>"; }).join("");
  }

  function renderBrands() {
    $("[data-brands]").innerHTML = BS.brandsInUse().map(function (b) { return '<li><a href="shop.html?brand=' + esc(b.id) + '">' + esc(b.name.replace(/\s*\(.*\)/, "")) + "</a></li>"; }).join("");
  }

  function renderContact() {
    var el = $("[data-contact-band]"), c = BS.contact(), links = [];
    if (c.phone) links.push('<a class="btn btn--light" href="' + esc(c.phoneHref) + '">' + BS.icon("phone") + " " + esc(c.phone) + "</a>");
    if (c.whatsapp) links.push('<a class="btn btn--light" rel="noopener" href="' + esc(BS.waLink("Hello Bearingsetu, I need a quotation.")) + '">' + BS.icon("whatsapp-logo") + " WhatsApp</a>");
    links.push('<a class="btn ' + (links.length ? "btn--ghost" : "btn--light") + '" href="quick-order.html#rfq">Request a quotation</a>');
    el.innerHTML = '<div><h2>Need help choosing the right part?</h2><p>' + (c.hours ? "We are available " + esc(c.hours) + "." : "Send us the part number or the measurements and we will reply with a quotation.") + '</p></div><div class="contactband__links">' + links.join("") + "</div>";
  }

  /* ----------------------------------------------------------------- finder */
  function num(el) { var v = parseFloat(String(el.value).replace(",", ".")); return isFinite(v) && v > 0 ? v : null; }
  function near(a, b) { return a != null && b != null && Math.abs(a - b) < 0.6; }
  var finders = {
    brg: function (f) {
      var d = num($("#b-d", f)), D = num($("#b-D", f)), B = num($("#b-B", f));
      var q = [], n = null;
      if (d || D || B) {
        n = BS.products.filter(function (p) { return (p.cat === "ball-bearings" || p.cat === "roller-bearings") && p.d != null && (d == null || near(p.d, d)) && (D == null || near(p.D, D)) && (B == null || near(p.B, B)); }).length;
        if (d) q.push("d=" + d); if (D) q.push("D=" + D); if (B) q.push("B=" + B);
      }
      return { n: n, noun: "bearing", href: "shop.html?cat=bearings" + (q.length ? "&" + q.join("&") : "") };
    },
    seal: function (f) {
      var d = num($("#s-d", f)), D = num($("#s-D", f)), B = num($("#s-B", f));
      var q = [], n = null;
      if (d || D || B) {
        n = BS.products.filter(function (p) { return p.sub === "oil-seals" && (d == null || near(p.d, d)) && (D == null || near(p.D, D)) && (B == null || near(p.B, B)); }).length;
        if (d) q.push("d=" + d); if (D) q.push("D=" + D); if (B) q.push("B=" + B);
      }
      return { n: n, noun: "oil seal", href: "shop.html?cat=seals&sub=oil-seals" + (q.length ? "&" + q.join("&") : "") };
    },
    belt: function (f) {
      var s = $("#v-s", f).value, l = num($("#v-l", f)), q = [], n = null;
      if (s || l) {
        n = BS.products.filter(function (p) { return p.cat === "belts-pulleys" && p.spec && p.spec.lengthMm && (!s || p.spec.section === s) && (l == null || Math.abs(p.spec.lengthMm - l) <= Math.max(2, l * 0.01)); }).length;
        if (s) q.push("section=" + encodeURIComponent(s)); if (l) q.push("len=" + l);
      }
      return { n: n, noun: "belt", href: "shop.html?cat=belts-pulleys" + (q.length ? "&" + q.join("&") : "") };
    }
  };
  function updateFinder(f) {
    var r = finders[f.getAttribute("data-finder")](f);
    $("[data-finder-link]", f).setAttribute("href", r.href);
    $("[data-finder-count]", f).textContent = r.n == null ? "" : r.n ? BS.plural(r.n, r.noun) + " found" : "No match in the catalogue. You can still request it.";
  }
  function initFinder() {
    var sel = $("#v-s");
    var sections = {};
    BS.products.forEach(function (p) { if ((p.sub === "classical-v" || p.sub === "wedge-v") && p.spec && p.spec.section) sections[p.spec.section] = 1; });
    Object.keys(sections).sort().forEach(function (s) { var o = document.createElement("option"); o.value = s; o.textContent = s; sel.appendChild(o); });
    $$("[data-finder]").forEach(function (f) { f.addEventListener("input", function () { updateFinder(f); }); f.addEventListener("submit", function (e) { e.preventDefault(); location.href = $("[data-finder-link]", f).getAttribute("href"); }); });
    var tabs = $$("[data-tab]");
    function show(t) {
      tabs.forEach(function (b) { var on = b === t; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; $("#" + b.getAttribute("aria-controls")).hidden = !on; });
      t.focus();
    }
    tabs.forEach(function (b, i) {
      b.addEventListener("click", function () { show(b); });
      b.addEventListener("keydown", function (e) {
        var j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
        if (j != null) { e.preventDefault(); show(tabs[(j + tabs.length) % tabs.length]); }
      });
    });
    if (location.hash === "#finder") { /* default tab already shown */ }
  }

  function render() { renderCats(); renderShortcuts(); renderBrands(); renderContact(); }
  render();
  initFinder();
  BS.on("overlay", render);
})();
