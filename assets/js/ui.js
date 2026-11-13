/* Bearingsetu UI: images, product cards, toasts, header search with suggestions, category menu,
   mobile menu, quote-list drawer, and business details filled from the configuration. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, icon = BS.icon, doc = document;
  var IMGS = window.BS_IMAGES || {};

  /* ------------------------------------------------------------------- images */
  BS.img = function (key) { return IMGS[key] || IMGS["dgbb-open"] || { src: "", w: 1000, h: 1000, alt: "" }; };
  BS.imgTag = function (key, o) {
    o = o || {};
    var m = BS.img(key);
    var srcset = m.sm ? m.sm + " 480w, " + m.src + " " + (m.w || 1000) + "w" : "";
    var blend = m.bg === "white" || m.bg === "light";
    var cls = ((o.cls || "") + (blend ? "" : " no-blend")).trim();
    return '<img src="' + esc(m.sm || m.src) + '"' + (srcset ? ' srcset="' + esc(srcset) + '" sizes="' + esc(o.sizes || "(max-width: 860px) 46vw, 260px") + '"' : "") +
      ' alt="' + esc(o.alt != null ? o.alt : "") + '" width="' + (m.w || 1000) + '" height="' + (m.h || 1000) + '"' +
      (o.eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async"' + (cls ? ' class="' + cls + '"' : "") + ">";
  };

  /* -------------------------------------------------------------- product card */
  // One card for every listing. Facts first (brand, part number, size), then price or "Quote", then the action.
  BS.card = function (p, o) {
    o = o || {};
    var b = BS.brand(p.brand), av = BS.availability(p), dims = BS.dims(p);
    var chips = BS.chips(p).map(function (c) { return '<li' + (dims && c === dims ? ' class="is-size"' : "") + ">" + esc(c) + "</li>"; }).join("");
    var min = BS.moq(p);
    var main =
      '<p class="pcard__brand">' + esc(b.name) + "</p>" +
      '<h3 class="pcard__title"><a href="' + BS.url(p) + '">' + esc(p.pn) + "</a></h3>" +
      '<p class="pcard__name">' + esc(p.title) + "</p>" +
      (chips ? '<ul class="pcard__specs" aria-label="Key specifications">' + chips + "</ul>" : "") +
      (o.via ? '<p class="pcard__via">Equivalent to ' + esc(o.via) + "</p>" : "");
    var foot =
      '<div class="pcard__foot">' + (BS.priceMode() === "list" || av ? "<div>" + (BS.priceMode() === "list" ? BS.priceHTML(p, 1) : "") + (av ? '<div><span class="' + av.cls + '">' + esc(av.text) + "</span></div>" : "") + "</div>" : "") +
      '<div class="pcard__act"><label class="sr-only" for="q-' + esc(p.id) + '">Quantity of ' + esc(BS.name(p)) + '</label>' +
      '<input id="q-' + esc(p.id) + '" type="number" inputmode="numeric" min="' + min + '" max="999999" value="' + min + '" data-qty>' +
      '<button class="btn btn--sm" type="button" data-add="' + esc(p.id) + '" aria-label="Add ' + esc(BS.name(p)) + ' to quote list">Add to quote</button></div></div>';
    return '<article class="pcard' + (o.row ? " pcard--row" : "") + '" data-pid="' + esc(p.id) + '">' +
      '<a class="pcard__media" href="' + BS.url(p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(p.img, { alt: "", sizes: o.sizes }) + "</a>" +
      '<div class="pcard__body">' + (o.row ? '<div class="pcard__main">' + main + "</div>" + foot : main + foot) + "</div></article>";
  };

  /* -------------------------------------------------------------------- toasts */
  BS.toast = function (msg, o) {
    o = o || {};
    var box = $("[data-toasts]");
    if (!box) return;
    var t = doc.createElement("div");
    t.className = "toast" + (o.error ? " toast--error" : "");
    var m = doc.createElement("span"); m.className = "toast__msg"; m.textContent = msg; t.appendChild(m);
    if (o.action) {
      var a = doc.createElement("button"); a.type = "button"; a.className = "toast__act"; a.textContent = o.action.label;
      a.addEventListener("click", function () { o.action.fn(); t.remove(); });
      t.appendChild(a);
    }
    while (box.children.length > 2) box.firstChild.remove();
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, o.action ? 8000 : 4200);
  };
  BS.closeToasts = function () { var b = $("[data-toasts]"); if (b) b.innerHTML = ""; };

  /* ---------------------------------------------------------------- overlays */
  var locks = {};
  BS.lock = function (on, key) { key = key || "page"; if (on) locks[key] = 1; else delete locks[key]; doc.body.classList.toggle("bs-locked", Object.keys(locks).length > 0); };
  BS.trap = function (container, e) {
    if (e.key !== "Tab") return;
    var f = BS.focusables(container);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (f.indexOf(doc.activeElement) === -1) { first.focus(); e.preventDefault(); }
    else if (e.shiftKey && doc.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && doc.activeElement === last) { first.focus(); e.preventDefault(); }
  };

  /* ---------------------------------------------------------------- quote list */
  var drawer, scrim, lastFocus, undo = null;
  function badge() {
    var n = BS.list.count();
    $$("[data-list-count]").forEach(function (el) { el.textContent = n > 99 ? "99+" : n; el.setAttribute("data-n", n); });
    $$("[data-open-list]").forEach(function (b) { b.setAttribute("aria-label", "Quote list, " + BS.plural(n, "part")); });
  }
  function nameFor(l) { return l.p ? BS.name(l.p) : l.text; }
  function lineHTML(l) {
    var key = esc(l.key), name = esc(nameFor(l));
    var min = l.p ? BS.moq(l.p) : 1;
    var img = l.p ? '<a class="line__img" href="' + BS.url(l.p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(l.p.img, { alt: "", sizes: "60px" }) + "</a>" : '<span class="line__img" aria-hidden="true"></span>';
    var u = l.p ? BS.unitPrice(l.p, l.qty) : null;
    return '<div class="line" data-line="' + key + '">' + img + "<div>" +
      (l.p ? '<a class="line__t" href="' + BS.url(l.p) + '">' + name + "</a>" : '<span class="line__t">' + name + "</span>") +
      '<p class="line__s">' + (l.p ? esc(l.p.title) : "Not in the catalogue. We will quote it separately.") + "</p>" +
      '<div class="line__row">' + BS.stepper(l.key, l.qty, min, nameFor(l)) +
      (u != null ? '<span class="small num">' + BS.inr(u * l.qty) + " <span class=muted>+ GST</span></span>" : "") +
      '<button class="textlink small" type="button" data-remove="' + key + '" aria-label="Remove ' + name + '">Remove</button></div></div></div>';
  }
  BS.stepper = function (key, qty, min, name) {
    var of = name ? " of " + esc(name) : "";
    return '<div class="stepper stepper--sm" data-stepper="' + esc(key) + '" data-min="' + (min || 1) + '">' +
      '<button type="button" data-step="-1" aria-label="Decrease quantity' + of + '"' + (qty <= min ? " disabled" : "") + ">" + icon("minus") + "</button>" +
      '<input type="number" inputmode="numeric" min="' + (min || 1) + '" max="999999" value="' + qty + '" aria-label="Quantity' + of + '">' +
      '<button type="button" data-step="1" aria-label="Increase quantity' + of + '">' + icon("plus") + "</button></div>";
  };
  function renderDrawer() {
    var body = $("[data-list-lines]"), foot = $("[data-list-foot]");
    if (!body) return;
    var t = BS.list.totals();
    var title = $("#list-drawer-title");
    if (title) title.textContent = t.count ? "Quote list (" + t.count + ")" : "Quote list";
    var rows = t.lines.map(lineHTML);
    if (undo) rows.splice(Math.min(undo.pos, rows.length), 0, '<div class="line line--undo"><p class="small">Removed <strong>' + esc(undo.name) + '</strong>.</p><button class="textlink small" type="button" data-undo>Undo</button></div>');
    var focusKey = doc.activeElement && doc.activeElement.closest && body.contains(doc.activeElement) ? (doc.activeElement.closest("[data-line]") || {}).getAttribute && doc.activeElement.closest("[data-line]").getAttribute("data-line") : null;
    if (!t.count && !undo) {
      body.innerHTML = '<div class="empty" style="margin:16px 0">' + icon("clipboard-text") + "<h3>Your quote list is empty</h3><p class=small>Search by part number or size, or paste a whole list into Quick order.</p>" +
        '<p style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn btn--sm" href="shop.html">Browse parts</a><a class="btn btn--sm btn--quiet" href="quick-order.html">Quick order</a></p></div>';
      foot.hidden = true; foot.innerHTML = "";
    } else {
      body.innerHTML = rows.join("");
      foot.hidden = !t.count;
      foot.innerHTML = !t.count ? "" :
        '<div class="sumrow"><span>' + BS.plural(t.count, "part") + "</span><span class=num>" + t.units.toLocaleString("en-IN") + " units</span></div>" +
        (t.allPriced ? '<div class="sumrow small"><span>Indicative total before GST</span><span class="num">' + BS.inr(t.sub) + "</span></div>" : "") +
        '<p class="small muted">' + (t.allPriced ? "Final prices, GST and freight are confirmed in your quotation." : "Prices, availability and freight are confirmed in your quotation.") + "</p>" +
        '<a class="btn btn--block" href="checkout.html">Request quotation</a><a class="btn btn--block btn--quiet" href="cart.html">Review list</a>';
    }
    if (focusKey) { var row = $$("[data-line]", body).filter(function (r) { return r.getAttribute("data-line") === focusKey; })[0]; var inp = row && $("input", row); if (inp) inp.focus(); }
  }
  function openList() {
    drawer = drawer || $("#list-drawer"); scrim = scrim || $("[data-scrim]");
    if (!drawer) { location.href = "cart.html"; return; }
    closeMega(); closeMenu();
    lastFocus = doc.activeElement; undo = null;
    renderDrawer(); drawer.hidden = false;
    requestAnimationFrame(function () { drawer.classList.add("is-open"); scrim.classList.add("is-on"); BS.lock(true, "list"); var c = $("[data-close-list]", drawer); if (c) c.focus(); });
  }
  function closeList() {
    if (!drawer || !drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open"); scrim.classList.remove("is-on"); BS.lock(false, "list"); undo = null;
    setTimeout(function () { if (!drawer.classList.contains("is-open")) drawer.hidden = true; }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  BS.openList = openList; BS.closeList = closeList;
  BS.addToList = function (id, qty) {
    var p = BS.list.add(id, qty);
    if (!p) return;
    BS.toast("Added " + BS.name(p) + " to your quote list", { action: { label: "View list", fn: openList } });
  };

  /* ----------------------------------------------------------------- search */
  var RECENT = "recentq";
  function remember(q) { q = String(q || "").trim(); if (q.length < 2) return; var r = BS.store.list(RECENT).filter(function (x) { return x !== q; }); r.unshift(q); BS.store.set(RECENT, r.slice(0, 6)); }
  BS.rememberQuery = remember;
  var EXAMPLES = ["6205 2RS", "25x52x15", "SPA 1250", "TC 25x52x7", "B60", "UCP 205"];
  function sgProduct(r, id) {
    var p = r.p, b = BS.brand(p.brand), m = BS.img(p.img), d = BS.dims(p);
    return '<a class="sg" role="option" id="' + id + '" href="' + BS.url(p) + '"><span class="sg__img"><img src="' + esc(m.xs || m.sm || m.src) + '" alt="" width="44" height="44" loading="lazy"></span>' +
      '<span class="sg__txt"><span class="sg__t">' + esc(p.pn) + "<small>" + esc(b.name) + '</small></span><span class="sg__s">' + esc(p.title) + (d && p.title.indexOf(" x ") < 0 ? " · " + esc(d) : "") + (r.via ? " · equivalent to " + esc(r.via) : "") + "</span></span></a>";
  }
  function renderSuggest(box, input, q) {
    var n = 0, html = "", id = function () { return "sg-" + (n++); };
    q = String(q || "").trim();
    if (!q) {
      var rec = BS.store.list(RECENT);
      if (rec.length) html += '<div class="suggest__group"><p class="suggest__h">Recent searches</p>' + rec.map(function (x) { return '<a class="sg sg--plain" role="option" id="' + id() + '" href="shop.html?q=' + encodeURIComponent(x) + '">' + icon("clock") + esc(x) + "</a>"; }).join("") + "</div>";
      html += '<div class="suggest__group"><p class="suggest__h">Try a part number or size</p>' + EXAMPLES.map(function (x) { return '<a class="sg sg--plain" role="option" id="' + id() + '" href="shop.html?q=' + encodeURIComponent(x) + '">' + icon("magnifying-glass") + esc(x) + "</a>"; }).join("") + "</div>";
    } else {
      var s = BS.suggest(q);
      if (s.size) html += '<div class="suggest__group"><a class="sg sg--plain" role="option" id="' + id() + '" href="' + esc(s.size.href) + '">' + icon("ruler") + "Parts of size <strong>" + esc(s.size.label) + "</strong> (" + s.size.count + ")</a></div>";
      if (s.products.length) html += '<div class="suggest__group"><p class="suggest__h">Parts</p>' + s.products.map(function (r) { return sgProduct(r, id()); }).join("") + "</div>";
      if (s.cats.length || s.brands.length) {
        html += '<div class="suggest__group"><p class="suggest__h">Categories and brands</p>' +
          s.cats.map(function (c) { return '<a class="sg sg--plain" role="option" id="' + id() + '" href="' + esc(c.href) + '">' + icon("squares-four") + esc(c.name) + (c.parent ? ' <span class="muted small">in ' + esc(c.parent) + "</span>" : "") + "</a>"; }).join("") +
          s.brands.map(function (b) { return '<a class="sg sg--plain" role="option" id="' + id() + '" href="shop.html?brand=' + esc(b.id) + '">' + icon("tag") + esc(b.name) + ' <span class="muted small">' + b.count + " parts</span></a>"; }).join("") + "</div>";
      }
      if (s.total) html += '<div class="suggest__group"><a class="sg sg--plain sg--all" role="option" id="' + id() + '" href="shop.html?q=' + encodeURIComponent(q) + '">See all ' + s.total + " results for “" + esc(q) + "”" + icon("arrow-right") + "</a></div>";
      else html += '<p class="suggest__empty">No catalogue match for <strong>' + esc(q) + '</strong>. Check the number, or <a href="quick-order.html#rfq">ask us to source it</a>.</p>';
    }
    box.innerHTML = html;
  }
  function bindSearch(form) {
    var input = $("[data-search-input]", form), box = $("[data-suggest]", form), active = -1;
    if (!input || !box || form._bound) return;
    form._bound = true;
    var opts = function () { return $$('[role="option"]', box); };
    function open() { box.hidden = false; input.setAttribute("aria-expanded", "true"); }
    function close() { box.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; }
    function mark(i) {
      var o = opts(); o.forEach(function (x) { x.setAttribute("aria-selected", "false"); });
      active = o.length ? (i + o.length) % o.length : -1;
      if (active >= 0) { o[active].setAttribute("aria-selected", "true"); input.setAttribute("aria-activedescendant", o[active].id); o[active].scrollIntoView({ block: "nearest" }); } else input.removeAttribute("aria-activedescendant");
    }
    var update = BS.debounce(function () { renderSuggest(box, input, input.value); active = -1; open(); }, 70);
    input.addEventListener("input", update);
    input.addEventListener("focus", function () { renderSuggest(box, input, input.value); open(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (box.hidden) { renderSuggest(box, input, input.value); open(); } mark(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); mark(active - 1); }
      else if (e.key === "Escape") { if (!box.hidden) { e.preventDefault(); close(); } }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); remember(input.value); location.href = opts()[active].getAttribute("href"); }
    });
    form.addEventListener("submit", function () { remember(input.value); });
    box.addEventListener("mousedown", function (e) { e.preventDefault(); });
    box.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("a.sg"); if (a) remember(input.value); });
    doc.addEventListener("click", function (e) { if (!form.contains(e.target)) close(); });
    form.addEventListener("focusout", function () { setTimeout(function () { if (!form.contains(doc.activeElement)) close(); }, 0); });
    var q0 = BS.params().get("q"); if (q0 != null && form.hasAttribute("data-fill-q")) input.value = q0;
  }
  BS.bindSearch = bindSearch;

  /* --------------------------------------------------------- category menu */
  var MEGA_COLS = [["ball-bearings", "roller-bearings"], ["housed-units", "mounting-tools"], ["belts-pulleys", "power-transmission"], ["seals", "lubrication", "linear-motion"]];
  function catBlock(c) {
    return '<div class="mega__col"><h3><a href="shop.html?cat=' + esc(c.id) + '">' + esc(c.name) + "</a></h3><ul>" +
      (c.subs || []).map(function (s) { return '<li><a href="shop.html?cat=' + esc(c.id) + "&amp;sub=" + esc(s.id) + '">' + esc(s.name) + "</a></li>"; }).join("") + "</ul></div>";
  }
  function buildMega() {
    var el = $("[data-mega]");
    if (!el) return;
    var cols = MEGA_COLS.map(function (ids) { return "<div>" + ids.map(function (id) { var c = BS.cat(id); return c ? catBlock(c) : ""; }).join('<div style="height:14px"></div>') + "</div>"; }).join("");
    var brands = BS.brandsInUse().map(function (b) { return '<a href="shop.html?brand=' + esc(b.id) + '">' + esc(b.name.replace(/\s*\(.*\)/, "")) + "</a>"; }).join("");
    el.innerHTML = '<div class="mega__in">' + cols + '<div><p class="mega__h">Brands</p><div class="mega__brands">' + brands + '</div><p class="mega__h" style="margin-top:18px">Find a part</p><ul class="mega__col"><li><a href="index.html#finder">By size</a></li><li><a href="tools.html#interchange">Equivalent parts</a></li><li><a href="quick-order.html">Quick order from a list</a></li></ul></div></div>';
  }
  function openMega() { var m = $("[data-mega]"), t = $("[data-mega-toggle]"); if (!m) return; m.hidden = false; t.setAttribute("aria-expanded", "true"); }
  function closeMega() { var m = $("[data-mega]"), t = $("[data-mega-toggle]"); if (!m || m.hidden) return; m.hidden = true; if (t) t.setAttribute("aria-expanded", "false"); }
  BS.closeMega = closeMega;

  /* ------------------------------------------------------------ mobile menu */
  function buildMenu() {
    var el = $("[data-mmenu]");
    if (!el) return;
    var cats = BS.catalog.categories.map(function (c) {
      return "<details><summary>" + esc(c.name) + '</summary><ul><li><a href="shop.html?cat=' + esc(c.id) + '">All ' + esc(c.name.toLowerCase()) + "</a></li>" +
        (c.subs || []).map(function (s) { return '<li><a href="shop.html?cat=' + esc(c.id) + "&amp;sub=" + esc(s.id) + '">' + esc(s.name) + "</a></li>"; }).join("") + "</ul></details>";
    }).join("");
    el.innerHTML = '<div class="mmenu__top"><span class="h3">Menu</span><button class="icon-btn" type="button" data-close-menu aria-label="Close menu">' + icon("x") + '</button></div><div class="mmenu__body">' + cats +
      '<a class="mmenu__row" href="quick-order.html">Quick order from a list</a><a class="mmenu__row" href="quick-order.html#rfq">Request a quotation</a><a class="mmenu__row" href="index.html#finder">Find by size</a><a class="mmenu__row" href="tools.html">Tools</a><a class="mmenu__row" href="business.html">For business</a><a class="mmenu__row" href="account.html" data-needs-api>Account</a><a class="mmenu__row" href="support.html">Help and contact</a>' +
      '<div class="mmenu__foot" data-biz-contact></div></div>';
    fillBiz();
  }
  var menuOpen = false;
  function openMenu() {
    var el = $("[data-mmenu]"), b = $("[data-open-menu]");
    if (!el) return;
    closeMega(); closeList();
    el.classList.add("is-open"); menuOpen = true; b.setAttribute("aria-expanded", "true"); BS.lock(true, "menu");
    var c = $("[data-close-menu]", el); if (c) c.focus();
  }
  function closeMenu() {
    if (!menuOpen) return;
    var el = $("[data-mmenu]"), b = $("[data-open-menu]");
    el.classList.remove("is-open"); menuOpen = false; b.setAttribute("aria-expanded", "false"); BS.lock(false, "menu"); b.focus();
  }

  /* ---------------------------------------- business details from configuration */
  function bizValue(k) {
    var b = BS.biz();
    if (k === "legalOrName") return b.legalName || b.name || "Bearingsetu";
    return b[k] == null ? "" : String(b[k]);
  }
  function contactBlock() {
    var b = BS.biz(), c = BS.contact(), out = [];
    if (c.phone) out.push('<a href="' + esc(c.phoneHref) + '">' + icon("phone") + " " + esc(c.phone) + "</a>");
    if (c.whatsapp) out.push('<a href="' + esc(BS.waLink("Hello Bearingsetu, I need a quotation.")) + '" rel="noopener">' + icon("whatsapp-logo") + " WhatsApp</a>");
    if (c.email) out.push('<a href="mailto:' + esc(c.email) + '">' + icon("envelope-simple") + " " + esc(c.email) + "</a>");
    if (c.hours) out.push("<span>" + icon("clock") + " " + esc(c.hours) + "</span>");
    var addr = (b.addressLines || []).concat([[b.city, b.state, b.pin].filter(Boolean).join(", ")]).filter(Boolean);
    if (addr.length) out.push("<span>" + icon("map-pin") + " " + esc(addr.join(", ")) + "</span>");
    return out.join("");
  }
  function fillBiz() {
    $$("[data-biz]").forEach(function (el) { el.textContent = bizValue(el.getAttribute("data-biz")); });
    $$("[data-biz-show]").forEach(function (el) {
      var k = el.getAttribute("data-biz-show");
      el.hidden = !(k === "whatsapp" ? BS.contact().whatsapp : bizValue(k));
    });
    $$("[data-biz-link]").forEach(function (a) {
      var k = a.getAttribute("data-biz-link"), c = BS.contact();
      a.setAttribute("href", k === "phone" ? c.phoneHref || "#" : k === "whatsapp" ? BS.waLink("Hello Bearingsetu, I need a quotation.") || "#" : "#");
    });
    $$("[data-biz-contact]").forEach(function (el) { el.innerHTML = contactBlock() || '<span class="small">Send us a quotation request and we will reply.</span>'; });
    var note = $("[data-foot-note]");
    if (note) {
      var s = BS.cfg.shipping, parts = ["Prices and availability are confirmed in your quotation. GST is charged as applicable."];
      if (s.note) parts.push(s.note);
      if (s.leadTimeNote) parts.push(s.leadTimeNote);
      parts.push("Product photos show the type of part; the brand markings on the part you receive may differ.");
      note.innerHTML = "<p>" + parts.map(esc).join(" ") + "</p>";
    }
  }
  function fillAccount() {
    var a = BS.account && BS.account();
    var topLink = $("[data-account-link]"), lbl = $("[data-account-label]");
    if (topLink) topLink.textContent = a ? "My account" : "Sign in";
    if (lbl) lbl.textContent = a ? (a.company || "Account").slice(0, 18) : "Account";
  }
  // Accounts, sign-in and order tracking only exist when the API is connected; hide them otherwise.
  function gateApi() { $$("[data-needs-api]").forEach(function (el) { if (el.id !== "register" && el.id !== "track") el.hidden = !BS.api.enabled; }); }
  BS.refreshChrome = function () { fillBiz(); fillAccount(); badge(); gateApi(); };

  /* Small helpers kept for pages that list parts (tools, quick order). */
  BS.subtitle = function (p) { var d = BS.dims(p); return esc(p.title) + (d && !/\d\s*[x\u00D7]\s*\d/i.test(p.title) ? " \u00B7 " + d : ""); };
  BS.stock = function (p) { var a = BS.availability(p); return a ? { cls: a.cls, text: a.text, short: a.text } : { cls: "stock stock--none", text: "", short: "View part" }; };
  BS.reveal = function () {};

  /* Download, copy and list helpers shared by the quote pages. */
  function csvCell(v) { v = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  BS.downloadCSV = function (name, rows) {
    var text = "\uFEFF" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    var a = doc.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name;
    doc.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  BS.listRows = function (lines) {
    return [["Brand", "Part number", "Description", "Size", "Quantity"]].concat(lines.map(function (l) { return l.p ? [BS.brand(l.p.brand).name, l.p.pn, l.p.title, BS.dims(l.p), l.qty] : ["", l.text, "Not in catalogue", "", l.qty]; }));
  };
  BS.copyText = function (text) {
    var done = function () { BS.toast("Copied to clipboard"); };
    var fallback = function () { var t = doc.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0"; doc.body.appendChild(t); t.select(); try { doc.execCommand("copy"); done(); } catch (e) { BS.toast("Could not copy. Select the text and copy it manually.", { error: true }); } t.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  };

  /* ------------------------------------------------------------ GST toggle */
  BS.gstToggleHTML = function () {
    if (!BS.cfg.pricing.showGstToggle || BS.priceMode() !== "list") return "";
    var inc = BS.gstInc();
    return '<div class="seg" role="group" aria-label="Show prices"><button type="button" data-gst="ex" aria-pressed="' + !inc + '">Ex GST</button><button type="button" data-gst="inc" aria-pressed="' + inc + '">Incl. GST</button></div>';
  };

  /* ------------------------------------------------------------------ events */
  doc.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement; if (!t || !t.closest) return;
    var add = t.closest("[data-add]");
    if (add) {
      var wrap = add.closest(".pcard__act, [data-add-wrap]") || add.parentElement, qi = $("[data-qty]", wrap);
      BS.addToList(add.getAttribute("data-add"), qi ? qi.value : 1);
      return;
    }
    if (t.closest("[data-open-list]")) { openList(); return; }
    if (t.closest("[data-close-list]") || t.closest("[data-scrim]")) { closeList(); return; }
    if (t.closest("[data-open-menu]")) { openMenu(); return; }
    if (t.closest("[data-close-menu]")) { closeMenu(); return; }
    if (t.closest("[data-mega-toggle]")) { var m = $("[data-mega]"); if (m.hidden) openMega(); else closeMega(); return; }
    var g = t.closest("[data-gst]");
    if (g) { BS.setGstInc(g.getAttribute("data-gst") === "inc"); return; }
    var mm = t.closest("[data-mmenu] a"); if (mm) closeMenu();
    if (!t.closest("[data-mega]") && !t.closest("[data-mega-toggle]")) closeMega();
    // drawer controls
    var dr = t.closest("#list-drawer");
    if (dr) {
      var step = t.closest("[data-step]"), rm = t.closest("[data-remove]"), un = t.closest("[data-undo]");
      if (step) { var st = step.closest("[data-stepper]"), inp = $("input", st), k = st.getAttribute("data-stepper"); BS.list.set(k, (parseInt(inp.value, 10) || 1) + parseInt(step.getAttribute("data-step"), 10)); }
      else if (rm) { var key = rm.getAttribute("data-remove"), pos = BS.list.lines().findIndex(function (l) { return l.key === key; }), line = BS.list.lines()[pos]; var raw = BS.store.list("quote").filter(function (x) { return x.key === key; })[0]; BS.list.remove(key); undo = { raw: raw, pos: pos, name: line ? nameFor(line) : "part" }; renderDrawer(); var ub = $("[data-undo]", dr); if (ub) ub.focus(); }
      else if (un && undo) { BS.list.restore(undo.raw, undo.pos); undo = null; renderDrawer(); }
    }
  });
  doc.addEventListener("change", function (e) {
    var st = e.target.closest && e.target.closest("#list-drawer [data-stepper]");
    if (st) BS.list.set(st.getAttribute("data-stepper"), e.target.value);
  });
  doc.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (drawer && drawer.classList.contains("is-open")) closeList(); else if (menuOpen) closeMenu(); else closeMega(); }
    if (drawer && drawer.classList.contains("is-open")) BS.trap(drawer, e);
    var mm = $("[data-mmenu]"); if (menuOpen && mm) BS.trap(mm, e);
    var tag = (e.target.tagName || "").toLowerCase();
    if ((e.key === "/" && tag !== "input" && tag !== "textarea" && tag !== "select" && !e.target.isContentEditable) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
      var si = $("#hq"); if (si) { e.preventDefault(); si.focus(); si.select(); }
    }
  });
  BS.on("list", function () { badge(); if (drawer && drawer.classList.contains("is-open")) renderDrawer(); });
  BS.on("prefs", function () { if (drawer && drawer.classList.contains("is-open")) renderDrawer(); });
  BS.on("overlay", function () { buildMega(); BS.refreshChrome(); });
  BS.on("session", fillAccount);

  /* ------------------------------------------------------------------- init */
  function init() {
    buildMega(); buildMenu(); BS.refreshChrome();
    $$("[data-search-form]").forEach(bindSearch);
    if (window.matchMedia && window.matchMedia("(max-width: 860px)").matches) $$(".foot details").forEach(function (d) { d.removeAttribute("open"); });
    if (menuOpen === false) { var mm = $("[data-mmenu]"); if (mm) mm.classList.remove("is-open"); }
    window.addEventListener("resize", BS.debounce(function () { if (window.innerWidth > 860 && menuOpen) closeMenu(); }, 120));
    BS.emit("ready");
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
})();
