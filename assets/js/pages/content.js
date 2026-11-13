/* About, policies, site map and 404. One script, switched by <body data-page>. */
(function () {
  "use strict";
  if (!window.BS) return; // site.js failed to load: the static page still reads fine.
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, icon = BS.icon;
  var page = document.body.getAttribute("data-page");

  function setErr(input, errEl, msg) {
    if (!errEl) return;
    errEl.textContent = msg || "";
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  }
  function ref(prefix) {
    var d = new Date();
    return prefix + "-" + String(d.getFullYear()).slice(2) + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + (1000 + Math.floor(Math.random() * 9000));
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? u : ""; }

  /* ================================================================= about */
  var STATES = { "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "25": "Daman and Diu", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory" };
  var GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  function about() {
    var INDS = [
      ["ind-textile", "Textile mills", "Spindle and loom bearings, timing belts and lithium grease for ring frames and looms.", "shop.html?cat=ball-bearings&sub=deep-groove"],
      ["ind-cement", "Cement and mining", "Spherical rollers, plummer blocks and adapter sleeves.", "shop.html?cat=roller-bearings&sub=spherical"],
      ["ind-steel", "Steel and rolling mills", "Cylindrical rollers and high-temperature greases.", "shop.html?cat=roller-bearings&sub=cylindrical"],
      ["ind-automotive", "Automotive and tractors", "Tapered rollers, needle bearings and oil seals.", "shop.html?cat=roller-bearings&sub=tapered"],
      ["ind-pumps", "Pumps and motors", "C3 deep groove bearings and couplings.", "shop.html?q=C3"],
      ["ind-agriculture", "Agriculture", "Pillow blocks, flange units and V-belts for threshers, chaff cutters and pumps.", "shop.html?cat=housed-units"],
      ["ind-food", "Food processing", "Chains, linear motion parts and lubricants.", "shop.html?cat=power-transmission"],
      ["ind-paper", "Sugar and paper", "Chains, sprockets, couplings and heavy greases.", "shop.html?cat=power-transmission&sub=roller-chains"]
    ];
    var grid = $("[data-industries]");
    grid.innerHTML = INDS.map(function (d, i) {
      var big = i === 0;
      var img = big ? '<img src="assets/img/s/' + d[0] + '.webp" srcset="assets/img/s/' + d[0] + "-sm.webp 900w, assets/img/s/" + d[0] + '.webp 1800w" sizes="(max-width: 640px) 100vw, 620px" alt="" width="1800" height="1200" loading="lazy">' :
        '<img src="assets/img/s/' + d[0] + '-sm.webp" alt="" width="900" height="600" loading="lazy">';
      return '<li class="reveal" style="--i:' + (i % 4) + '"><a class="aind" href="' + d[3] + '">' + img +
        '<span class="aind__in"><h3>' + esc(d[1]) + "</h3><p>" + esc(d[2]) + '</p><span class="aind__go">Shop parts' + icon("arrow-right") + "</span></span></a></li>";
    }).join("");

    /* stock examples: read live from the catalogue, so they always match the listings.
       Each row shows one state (in stock, low, made to order). If the named part has moved to another
       state, show a part that is in that state now; if none is, show the named part as it is. */
    function stockState(p) { var c = BS.stock(p).cls; return /--low/.test(c) ? "low" : /--out/.test(c) ? "out" : "in"; }
    function brandName(p) { return BS.brand(p.brand).name.replace(/\s*\(.*\)$/, ""); }
    $$("[data-stock-pid]").forEach(function (li) {
      var p = BS.byId(li.getAttribute("data-stock-pid")), want = li.getAttribute("data-stock-state");
      if (!p) return; // keep the written example
      if (want && stockState(p) !== want) {
        var alt = BS.products.filter(function (q) { return q.cat === p.cat && stockState(q) === want; })[0] ||
          BS.products.filter(function (q) { return stockState(q) === want; })[0];
        if (alt) p = alt;
      }
      var st = BS.stock(p), pn = $(".mono", li), lab = $(".stock", li);
      if (pn) pn.textContent = brandName(p) + " " + p.pn;
      if (lab) { lab.className = st.cls; lab.textContent = st.text; }
    });
    var chatStock = $("[data-chat-stock]"), cFag = BS.byId("fag-6205-2rsr-c3"), cSkf = BS.byId("skf-6205-2rs1-c3");
    if (chatStock && cFag && cSkf) {
      var avail = function (p) { if (p.stock) return "is in stock in Pune"; var t = BS.stock(p).text; return t.charAt(0).toLowerCase() + t.slice(1); };
      chatStock.textContent = cFag.stock && cSkf.stock ? "Both are in stock in Pune." : "The FAG " + avail(cFag) + " and the SKF " + avail(cSkf) + ".";
    }

    /* supplier form */
    var LINES = ["Bearings", "Housed units", "Belts and pulleys", "Seals and O-rings", "Lubricants", "Chains and sprockets", "Couplings", "Linear motion", "Mounting tools"];
    $("[data-lines]").innerHTML = LINES.map(function (l, i) {
      return '<label class="pick"><input type="checkbox" name="lines" value="' + esc(l) + '" id="ln-' + i + '"><span>' + icon("check") + esc(l) + "</span></label>";
    }).join("");
    var form = $("[data-sell-form]"), done = $("[data-sell-done]"), btn = $("[data-sell-btn]");
    // The button ships disabled, so without this script the form cannot be sent (and cannot put its details in a URL).
    btn.disabled = false;
    var F = { company: $("#s-company"), name: $("#s-name"), type: $("#s-type"), email: $("#s-email"), mobile: $("#s-mobile"), gstin: $("#s-gstin") };
    var linesSet = $(".lines", form), linesErr = $("#s-lines-err"), gHint = $("[data-gstin-hint]"), G_HINT = gHint.textContent;
    var msg = $("#s-msg"), msgCount = $("[data-msg-count]");
    var tried = false, busy = false;

    function mobileDigits(v) { return String(v || "").replace(/[\s-]/g, "").replace(/^(\+91|91(?=\d{10}$)|0(?=\d{10}$))/, ""); }
    var checks = {
      company: function (v) { return !v.trim() ? "Enter your company name." : v.trim().length < 2 ? "Company name looks too short." : ""; },
      name: function (v) { return !v.trim() ? "Enter your name." : !/[a-z]/i.test(v) ? "Enter your name in letters." : ""; },
      type: function (v) { return v ? "" : "Choose the kind of business you run."; },
      email: function (v) { return !v.trim() ? "Enter your work email." : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "Enter an email like name@company.in." : ""; },
      mobile: function (v) { var d = mobileDigits(v); return !d ? "Enter a mobile number." : !/^\d{10}$/.test(d) ? "Enter a 10-digit mobile number." : !/^[6-9]/.test(d) ? "Indian mobile numbers start with 6, 7, 8 or 9." : ""; },
      gstin: function (v) {
        var g = v.trim().toUpperCase();
        if (!g) return "Enter your GSTIN. We need it to raise purchase orders.";
        if (g.length !== 15) return "A GSTIN has 15 characters. This one has " + g.length + ".";
        if (!GSTIN_RE.test(g)) return "This does not match the GSTIN format, for example 27AAACB1234F1Z5.";
        if (!STATES[g.slice(0, 2)]) return "The first two digits should be a state code from 01 to 38.";
        return "";
      }
    };
    function gstHint() {
      var g = F.gstin.value.trim().toUpperCase();
      if (GSTIN_RE.test(g) && STATES[g.slice(0, 2)]) {
        gHint.textContent = "State code " + g.slice(0, 2) + ": " + STATES[g.slice(0, 2)] + ".";
      } else gHint.textContent = G_HINT;
    }
    function checkField(k) { var m = checks[k](F[k].value); setErr(F[k], $("#" + F[k].id + "-err"), m); return !m; }
    function checkLines() {
      var n = $$("input:checked", linesSet).length;
      linesErr.textContent = n ? "" : "Pick at least one product line.";
      if (n) linesSet.removeAttribute("aria-invalid"); else linesSet.setAttribute("aria-invalid", "true");
      return n > 0;
    }
    var pressing = false, queued = {};
    document.addEventListener("pointerdown", function () { pressing = true; }, true);
    function released() {
      if (!pressing) return;
      pressing = false;
      setTimeout(function () { var q = queued; queued = {}; Object.keys(q).forEach(function (k) { if (tried) checkField(k); }); }, 0);
    }
    document.addEventListener("pointerup", released, true);
    document.addEventListener("pointercancel", released, true);
    Object.keys(F).forEach(function (k) {
      // Wait for a press to finish, so an error appearing above the button cannot move it mid-click.
      F[k].addEventListener("blur", function () { if (!tried) return; if (pressing) queued[k] = 1; else checkField(k); });
      F[k].addEventListener(k === "type" ? "change" : "input", function () {
        if (k === "gstin") gstHint();
        if (tried && F[k].getAttribute("aria-invalid") === "true") checkField(k);
      });
    });
    F.gstin.addEventListener("blur", function () { F.gstin.value = F.gstin.value.trim().toUpperCase(); gstHint(); });
    linesSet.addEventListener("change", function () { if (tried) checkLines(); });
    msg.addEventListener("input", function () { msgCount.textContent = msg.value.length + " of 500 characters"; });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      tried = true;
      var bad = null;
      Object.keys(F).forEach(function (k) { if (!checkField(k) && !bad) bad = F[k]; });
      if (!checkLines() && !bad) bad = $("input", linesSet);
      if (bad) { bad.focus(); return; }
      busy = true;
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      var g = F.gstin.value.trim().toUpperCase();
      var rec = {
        ref: ref("SUP"), at: new Date().toISOString(), company: F.company.value.trim(), name: F.name.value.trim(), type: F.type.value,
        email: F.email.value.trim(), mobile: mobileDigits(F.mobile.value), gstin: g,
        lines: $$("input:checked", linesSet).map(function (i) { return i.value; }), message: msg.value.trim()
      };
      setTimeout(function () {
        var all = BS.store.get("supplierLeads", []);
        if (!Array.isArray(all)) all = [];
        all.unshift(rec);
        BS.store.set("supplierLeads", all.slice(0, 20));
        busy = false;
        btn.classList.remove("is-loading");
        btn.removeAttribute("aria-busy");
        var first = rec.name.split(/\s+/)[0];
        done.innerHTML = '<span class="okmark">' + icon("check-circle") + "</span>" +
          '<h3 class="h3">Thank you, ' + esc(first) + ".</h3>" +
          "<p class=\"muted\">We have " + esc(rec.company) + "’s details. A partner manager will email <strong>" + esc(rec.email) + "</strong> within 2 working days.</p>" +
          '<p class="sell__ref">Reference <strong class="mono">' + esc(rec.ref) + "</strong></p>" +
          '<dl class="dl-grid sell__sum" style="grid-template-columns:minmax(0,1fr)"><div><dt>Business</dt><dd>' + esc(rec.type) + "</dd></div><div><dt>GSTIN</dt><dd class=\"mono\">" + esc(rec.gstin) + " · " + esc(STATES[rec.gstin.slice(0, 2)]) + "</dd></div><div><dt>Product lines</dt><dd>" + esc(rec.lines.join(", ")) + "</dd></div></dl>" +
          '<button class="btn btn--quiet" type="button" data-sell-again>Send another enquiry</button>';
        form.hidden = true;
        done.hidden = false;
        done.focus();
      }, 900);
    });
    done.addEventListener("click", function (e) {
      if (!e.target.closest("[data-sell-again]")) return;
      form.reset();
      tried = false;
      Object.keys(F).forEach(function (k) { setErr(F[k], $("#" + F[k].id + "-err"), ""); });
      linesErr.textContent = ""; linesSet.removeAttribute("aria-invalid");
      gHint.textContent = G_HINT; msgCount.textContent = "0 of 500 characters";
      done.hidden = true;
      form.hidden = false;
      F.company.focus();
    });
  }

  /* ============================================================== policies */
  var KEY_LABELS = { cart: "Bag", wish: "Saved items", recent: "Recently viewed parts", recentQ: "Recent searches", prefs: "Display preferences", orders: "Sample orders", rfqs: "Quote requests", lists: "Saved lists", saved: "Saved for later", coupon: "Applied coupon", account: "Sample account details", addresses: "Addresses", supplierLeads: "Supplier enquiries", pincode: "Delivery pincode", checkout: "Checkout details", quotes: "Quotes", settings: "Notification settings", team: "Team members" };

  function readKeys() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("bs.") === 0) out.push(k);
      }
    } catch (e) { return null; }
    return out.sort();
  }
  function describe(k) {
    var raw = null, v = null;
    try { raw = localStorage.getItem(k); v = JSON.parse(raw); } catch (e) { v = raw; }
    if (Array.isArray(v)) return v.length ? BS.plural(v.length, "entry", "entries") : "Empty";
    if (v && typeof v === "object") { var n = Object.keys(v).length; return n ? BS.plural(n, "setting") : "Empty"; }
    return "Saved";
  }

  function policies() {
    /* table of contents: highlight the section in view */
    var links = $$("[data-toc] a");
    var secs = links.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
    var current = null;
    function spy() {
      var probe = window.innerHeight * 0.3, cur = null;
      secs.forEach(function (s) { if (s && s.getBoundingClientRect().top <= probe) cur = s.id; });
      if (!cur && secs[0]) cur = secs[0].getBoundingClientRect().top < window.innerHeight ? secs[0].id : null;
      if (cur === current) return;
      current = cur;
      links.forEach(function (a) { if (a.getAttribute("href") === "#" + cur) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    }
    var ticking = false;
    window.addEventListener("scroll", function () { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; spy(); }); }, { passive: true });
    spy();

    /* my data */
    var list = $("[data-mydata-list]"), sum = $("[data-mydata-sum]"), openBtn = $("[data-clear-open]"), dlg = $("[data-clear-dlg]"), desc = $("[data-dlg-desc]");
    var justCleared = false;
    function renderData() {
      var keys = readKeys();
      if (keys === null) {
        sum.textContent = "Storage is blocked";
        list.innerHTML = '<li class="notice notice--warm" style="background:var(--orange-tint)">' + icon("warning-circle") + "<p>Your browser is blocking storage for this site, so nothing is kept between visits and there is nothing to clear.</p></li>";
        openBtn.disabled = true;
        return;
      }
      openBtn.disabled = !keys.length;
      if (!keys.length) {
        sum.textContent = "Nothing stored";
        list.innerHTML = '<li class="mydata__none' + (justCleared ? " is-done" : "") + '">' + icon("check-circle") + "<span>" + (justCleared ? "Done. Nothing from Bearingsetu is stored in this browser now." : "Bearingsetu has nothing stored in this browser.") + "</span></li>";
        return;
      }
      sum.textContent = BS.plural(keys.length, "item") + " stored only in this browser";
      list.innerHTML = keys.map(function (k) {
        var short = k.slice(3);
        return "<li><span>" + esc(KEY_LABELS[short] || short) + " <code>" + esc(k) + "</code></span><small>" + esc(describe(k)) + "</small></li>";
      }).join("");
    }
    function clearAll() {
      var keys = readKeys() || [];
      keys.forEach(function (k) {
        // Reset the in-memory fallback in site.js too, then remove the key.
        try { BS.store.set(k.slice(3), undefined); } catch (e) { /* ignore */ }
        try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
      });
      justCleared = true;
      renderData();
      BS.emit("cart", { type: "clear" });
      BS.emit("wish", { id: null, on: false });
      BS.toast("Your data on this site has been cleared.", { icon: "check-circle" });
      // The button is now disabled, so move focus to the panel that reports the result.
      var title = $(".mydata__title");
      if (title) { title.setAttribute("tabindex", "-1"); title.focus(); }
    }
    openBtn.addEventListener("click", function () {
      var keys = readKeys() || [];
      var names = keys.map(function (k) { return (KEY_LABELS[k.slice(3)] || k.slice(3)).toLowerCase(); });
      desc.textContent = "This removes " + (names.length ? names.slice(0, 4).join(", ") + (names.length > 4 ? " and " + (names.length - 4) + " more" : "") : "everything Bearingsetu has stored") + " from this browser. It cannot be undone.";
      if (dlg && typeof dlg.showModal === "function") {
        dlg.returnValue = "";
        dlg.showModal();
      } else if (window.confirm(desc.textContent)) clearAll();
    });
    if (dlg) dlg.addEventListener("close", function () {
      if (dlg.returnValue === "clear") clearAll();
      else if (!openBtn.disabled) openBtn.focus();
    });
    renderData();
    BS.on("cart", function (d) { if (!d || d.type !== "clear") { justCleared = false; renderData(); } });
    BS.on("wish", function (d) { if (d && d.id) { justCleared = false; renderData(); } });
    window.addEventListener("storage", function () { justCleared = false; renderData(); });

    /* image credits */
    var box = $("[data-credits]"), count = $("[data-credits-count]");
    var IM = window.BS_IMAGES;
    try {
      if (!IM || typeof IM !== "object") throw new Error("missing");
      var seen = {}, rows = [];
      Object.keys(IM).forEach(function (k) {
        var m = IM[k];
        if (!m || m.missing || !m.src || seen[m.src]) return;
        seen[m.src] = 1;
        rows.push(m);
      });
      if (!rows.length) {
        box.innerHTML = '<div class="empty">' + icon("info") + "<h3>No photo credits yet</h3><p>Photos are still being added. Their credits will appear here as soon as they are.</p></div>";
        count.textContent = "";
      } else {
        var authors = {};
        rows.forEach(function (m) { authors[m.author || "Unknown"] = 1; });
        count.textContent = BS.plural(rows.length, "photograph") + " by " + BS.plural(Object.keys(authors).length, "creator") + ".";
        // The thumbnail is 44 px, so use the smallest file there is. Every -sm.webp has a -xs.webp (about 128 px wide)
        // beside it, even where the manifest does not list it yet; if one is missing, the image falls back to the sm file.
        var thumb = function (m) {
          var sm = m.sm || m.src;
          return m.xs || (/-sm\.webp$/.test(sm) ? sm.replace(/-sm\.webp$/, "-xs.webp") : sm);
        };
        box.addEventListener("error", function (e) {
          var t = e.target, fb = t && t.getAttribute && t.getAttribute("data-fallback");
          if (t.tagName === "IMG" && fb && t.getAttribute("src") !== fb) t.setAttribute("src", fb);
        }, true);
        box.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th scope="col">Photo</th><th scope="col">Creator</th><th scope="col">Licence</th><th scope="col"><span class="sr-only">Source</span></th></tr></thead><tbody>' +
          rows.map(function (m) {
            var lic = safeUrl(m.license_url), src = safeUrl(m.source_url);
            var title = String(m.title || "Untitled").replace(/\.(jpe?g|png|tiff?|webp)$/i, "");
            return '<tr><td><span class="credits__img"><img src="' + esc(thumb(m)) + '" data-fallback="' + esc(m.sm || m.src) + '" alt="" width="44" height="44" loading="lazy" decoding="async"><span>' + esc(title) + "</span></span></td>" +
              "<td>" + esc(m.author || "Unknown") + "</td>" +
              '<td class="credits__lic">' + (lic ? '<a href="' + esc(lic) + '" rel="noopener license">' + esc(m.license || "Licence") + "</a>" : esc(m.license || "")) + "</td>" +
              '<td class="r">' + (src ? '<a href="' + esc(src) + '" rel="noopener">Source</a>' : "") + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      }
    } catch (err) {
      box.innerHTML = '<div class="notice notice--warm">' + icon("warning-circle") + "<p>We could not load the list of photo credits. Refresh the page to try again.</p></div>";
      count.textContent = "";
    }
    if (location.hash && location.hash.length > 1) {
      var t = document.getElementById(location.hash.slice(1));
      if (t) requestAnimationFrame(function () { t.scrollIntoView({ block: "start" }); spy(); });
    }
  }

  /* ============================================================== site map */
  function sitemap() {
    var P = BS.products, cats = BS.catalog.categories || [];
    var box = $("[data-smap-cats]");
    if (!cats.length) {
      box.innerHTML = '<div class="empty">' + icon("squares-four") + '<h3>Categories are loading</h3><p>Refresh the page, or browse <a href="shop.html">all products</a>.</p></div>';
    } else {
      box.innerHTML = cats.map(function (c) {
        var n = P.filter(function (p) { return p.cat === c.id; }).length;
        return '<div class="smap__group"><h3 class="smap__h"><a href="shop.html?cat=' + encodeURIComponent(c.id) + '">' + esc(c.name) + "</a><small>" + n + "</small></h3><ul>" +
          (c.subs || []).map(function (s) {
            var m = P.filter(function (p) { return p.cat === c.id && p.sub === s.id; }).length;
            return '<li><a href="shop.html?cat=' + encodeURIComponent(c.id) + "&amp;sub=" + encodeURIComponent(s.id) + '">' + esc(s.name) + "</a><small>" + m + "</small></li>";
          }).join("") + "</ul></div>";
      }).join("");
      $("[data-smap-total]").textContent = BS.plural(P.length, "part") + " in " + BS.plural(cats.length, "category", "categories");
    }
    var brands = (BS.catalog.brands || []).map(function (b) { return { b: b, n: P.filter(function (p) { return p.brand === b.id; }).length }; }).filter(function (x) { return x.n; });
    $("[data-smap-brands]").innerHTML = brands.map(function (x) {
      return '<li><a class="chip chip--outline" href="shop.html?brand=' + encodeURIComponent(x.b.id) + '">' + esc(x.b.name) + ' <span class="muted">' + x.n + "</span></a></li>";
    }).join("");
  }

  /* =================================================================== 404 */
  function notFound() {
    var g = $(".nf__balls");
    if (g) {
      var html = "", n = 9, R = 80, r = 15.5;
      for (var i = 0; i < n; i++) {
        var a = i * 2 * Math.PI / n - Math.PI / 2, x = 120 + R * Math.cos(a), y = 120 + R * Math.sin(a);
        if (i === 0) { html += '<circle class="nf__gap" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '"/>'; continue; }
        html += '<circle class="nf__ball" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '"/><circle class="nf__shine" cx="' + (x - 5).toFixed(1) + '" cy="' + (y - 5).toFixed(1) + '" r="4.5"/>';
      }
      g.innerHTML = html;
    }
    var path = location.pathname + location.search;
    if (!/\/404(\.html)?$/.test(location.pathname)) {
      var el = $("[data-nf-path]");
      var shown = path;
      try { shown = decodeURIComponent(path); } catch (e) { /* malformed escape: show it as typed */ }
      el.textContent = "We looked for " + shown.slice(0, 120) + " and found nothing there.";
      el.hidden = false;
    }
    var form = $("[data-nf-form]"), q = $("#nf-q");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      BS.openSearch(q.value.trim());
    });
    // The page sets <base> to the site root, so in-page links like #main would leave the page. Keep them here.
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href^='#']");
      if (!a) return;
      var id = a.getAttribute("href").slice(1), t = id && document.getElementById(id);
      e.preventDefault();
      if (!t) return;
      if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
      t.scrollIntoView({ block: "start" });
      t.focus({ preventScroll: true });
    });
  }

  if (page === "about") about();
  else if (page === "policies") policies();
  else if (page === "sitemap") sitemap();
  else if (page === "404") notFound();
  BS.reveal();
})();
