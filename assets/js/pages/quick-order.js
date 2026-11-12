/* Quick order: paste a list, upload a BOM, request a quote.
   Matching uses BS.parseLines and BS.search; nothing leaves the browser. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, inr = BS.inr, icon = BS.icon;
  var doc = document;

  var MAX_PASTE = 200, MAX_BOM = 500, MAX_RFQ = 100;
  var SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

  /* ------------------------------------------------------------ helpers */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fmtDate(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtSize(b) {
    if (b < 1024) return b + " bytes";
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + " KB";
    return (b / 1024 / 1024).toFixed(1) + " MB";
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function brandName(p) { return BS.brand(p.brand).name.replace(/\s*\(.*\)$/, ""); }
  function label(p) { return brandName(p) + " " + p.pn; }
  function announce(el, text) { if (el) el.textContent = text; }
  var NONE = '<span class="muted"><span aria-hidden="true">–</span><span class="sr-only">None</span></span>';

  /* ----------------------------------------------------------- matching */
  var BRAND_ALIASES = {
    skf: "skf", fag: "fag", schaeffler: "fag", ina: "ina", nsk: "nsk", ntn: "ntn", koyo: "koyo", jtekt: "koyo",
    timken: "timken", nbc: "nbc", zkl: "zkl", hiwin: "hiwin", samick: "samick", fenner: "fenner", gates: "gates",
    rolon: "rolon", lovejoy: "lovejoy", nok: "nok", parker: "parker", shell: "shell", servo: "servo", indianoil: "servo"
  };
  var BRAND_RE = new RegExp("^(" + Object.keys(BRAND_ALIASES).join("|") + ")\\b[\\s:\\-]*", "i");
  function brandFromText(text) {
    var t = String(text || "").toLowerCase();
    var keys = Object.keys(BRAND_ALIASES);
    for (var i = 0; i < keys.length; i++) if (new RegExp("\\b" + keys[i] + "\\b").test(t)) return BRAND_ALIASES[keys[i]];
    return null;
  }
  function statusOf(score) { return score >= 84 ? "found" : score >= 50 ? "check" : "missing"; }

  // Same thresholds as BS.parseLines, plus brand-aware matching ("SKF 6205 2RS1")
  // and a list of close candidates so the buyer can pick when several parts fit.
  function resolve(part, hint) {
    var q = String(part || "").trim();
    var m = q.match(BRAND_RE);
    var brand = hint || null, rest = q;
    if (m && q.length > m[0].length) { brand = brand || BRAND_ALIASES[m[1].toLowerCase()]; rest = q.slice(m[0].length).trim(); }
    var res = BS.search(q, 10);
    if (m && rest && rest !== q) {
      var alt = BS.search(rest, 10);
      if (alt.length && (!res.length || alt[0].score > res[0].score || res[0].p.brand !== brand)) res = alt;
    }
    var note = "";
    var pool = res;
    if (brand) {
      var same = res.filter(function (r) { return r.p.brand === brand; });
      if (same.length && statusOf(same[0].score) !== "missing") {
        res = same.concat(res.filter(function (r) { return r.p.brand !== brand; }));
        pool = same;
      } else if (res.length && statusOf(res[0].score) !== "missing") {
        note = "No " + BS.brand(brand).name.replace(/\s*\(.*\)$/, "") + " part with this number. Closest from another brand.";
      }
    }
    var top = res[0];
    var status = top ? statusOf(top.score) : "missing";
    if (status === "found" && brand && top.p.brand !== brand) status = "check";
    if (status === "check" && !note) note = "Closest match. Check the number before ordering.";
    var options = status === "missing" ? [] : res.filter(function (r) { return r.score >= 50; }).slice(0, 6).map(function (r) { return r.p; });
    var close = status === "missing" ? [] : pool.filter(function (r) { return statusOf(r.score) !== "missing" && r.score >= top.score - 3; });
    var size = BS.parseSize(rest);
    if (status !== "missing" && size && top.score >= 80 && top.score < 100 && !note) note = "Matched by size.";
    return { status: status, p: status === "missing" ? null : top.p, options: options, ambiguous: close.length > 1, note: note };
  }

  function makeLine(raw, part, qty, hint, choice) {
    var r = resolve(part, hint);
    var line = { raw: raw, part: part, qty: Math.max(1, qty || 1), status: r.status, p: r.p, options: r.options, ambiguous: r.ambiguous, note: r.note, picked: false };
    // Several parts fit equally well: the buyer has to pick one, so it counts as "to check".
    if (line.status === "found" && line.ambiguous && line.options.length > 1) line.status = "check";
    if (choice && BS.byId(choice)) {
      var cp = BS.byId(choice);
      line.p = cp;
      line.status = "found";
      line.note = "";
      line.picked = true;
      if (line.options.indexOf(cp) === -1) line.options.unshift(cp);
    }
    return line;
  }

  function lineAmount(l) {
    if (!l.p) return { unit: 0, amount: 0, base: 0 };
    var unit = BS.unitPrice(l.p, l.qty);
    return { unit: unit, amount: round2(unit * l.qty), base: round2(l.p.price * l.qty) };
  }

  /* ------------------------------------------------------------- results table
     One component, used by the Paste tab and the BOM tab. */
  var uid = 0;
  function Results(root, cfg) {
    var id = cfg.id || "r" + (++uid);
    var self = { lines: [], root: root };
    root.innerHTML =
      '<div class="qo-card qo-res">' +
        '<div class="qo-res__head">' +
          '<div><h2 class="h3" id="' + id + '-title">' + esc(cfg.title || "Your list") + '</h2>' +
          '<p class="qo-res__status" aria-live="polite" data-status></p></div>' +
          '<div class="qo-res__legend" aria-hidden="true">' +
            '<span class="is-found">' + icon("check-circle") + "Matched</span>" +
            '<span class="is-check">' + icon("warning-circle") + "Check</span>" +
            '<span class="is-missing">' + icon("x-circle") + "Not found</span>" +
          "</div>" +
        "</div>" +
        '<div class="qo-res__body" data-body></div>' +
        '<div class="qo-add" data-add>' +
          '<div class="field qo-add__find">' +
            '<label for="' + id + '-q">Add a part</label>' +
            '<div class="qo-combo">' + icon("magnifying-glass", "qo-combo__ic") +
              '<input class="input" id="' + id + '-q" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + id + '-list" autocomplete="off" spellcheck="false" placeholder="Part number, size or name" aria-describedby="' + id + '-q-hint ' + id + '-q-err">' +
              '<ul class="qo-combo__list" id="' + id + '-list" role="listbox" aria-label="Matching parts" hidden></ul>' +
            "</div>" +
            '<p class="hint qo-add__hint" id="' + id + '-q-hint" aria-live="polite"></p>' +
            '<p class="error" id="' + id + '-q-err"></p>' +
          "</div>" +
          '<div class="field qo-add__qty"><label for="' + id + '-qty">Quantity</label>' + stepper(1, id + "-qty", "") + "</div>" +
          '<button class="btn btn--dark qo-add__btn" type="button" data-add-line>' + icon("plus") + "Add to list</button>" +
        "</div>" +
        '<div class="qo-sum" data-sum hidden></div>' +
      "</div>";

    var body = $("[data-body]", root), sum = $("[data-sum]", root), status = $("[data-status]", root);
    var card = $(".qo-res", root);

    self.loading = function (msg) {
      card.classList.remove("is-stale");
      body.innerHTML = '<div class="qo-skel" aria-hidden="true">' + new Array(5).join('<div class="qo-skel__row"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>') + "</div>";
      sum.hidden = true;
      announce(status, msg || "Matching your list…");
    };
    self.stale = function (on) {
      card.classList.toggle("is-stale", !!on);
      if (on) announce(status, "Matching…");
    };

    self.render = function (lines, extra) {
      self.lines = lines;
      card.classList.remove("is-stale");
      if (!lines.length) {
        body.innerHTML = '<div class="empty qo-empty">' + icon(cfg.emptyIcon || "list-checks") + "<h3>" + esc(cfg.emptyTitle || "Nothing to price yet") + "</h3><p>" + (cfg.emptyText || "") + "</p></div>";
        sum.hidden = true;
        announce(status, cfg.emptyStatus || "No lines yet.");
        BS.emit("qo-layout");
        return;
      }
      body.innerHTML = (extra && extra.note ? '<p class="notice notice--warm qo-res__note">' + icon("info") + "<span>" + extra.note + "</span></p>" : "") +
        '<table class="qo-table" role="table"><caption class="sr-only">Matched parts with quantity, price and availability</caption>' +
        '<thead><tr role="row">' +
          '<th scope="col" role="columnheader" class="qo-c-st"><span class="sr-only">Match</span></th>' +
          '<th scope="col" role="columnheader" class="qo-c-typed">You typed</th>' +
          '<th scope="col" role="columnheader" class="qo-c-part">Matched part</th>' +
          '<th scope="col" role="columnheader" class="qo-c-qty">Quantity</th>' +
          '<th scope="col" role="columnheader" class="qo-c-unit r">Unit price</th>' +
          '<th scope="col" role="columnheader" class="qo-c-amt r">Amount</th>' +
          '<th scope="col" role="columnheader" class="qo-c-stock">Availability</th>' +
          '<th scope="col" role="columnheader" class="qo-c-rm"><span class="sr-only">Remove</span></th>' +
        "</tr></thead><tbody>" + lines.map(rowHTML).join("") + "</tbody></table>";
      totals();
    };

    function rowHTML(l, i) {
      var n = i + 1;
      var st = l.status;
      var stIcon = st === "found" ? "check-circle" : st === "check" ? "warning-circle" : "x-circle";
      var stText = st === "found" ? "Matched" : st === "check" ? (l.ambiguous && !l.picked ? "Several parts fit, pick one" : "Check this match") : "Not found";
      var part;
      if (!l.p) {
        part = '<div class="qo-part qo-part--none"><span class="qo-part__img qo-part__img--none">' + icon("question") + "</span><div>" +
          '<p class="qo-part__pn">Not in the catalogue</p>' +
          '<p class="qo-part__t">We can source it. <button class="textlink" type="button" data-to-quote="' + i + '">Add to a quote request</button></p></div></div>';
      } else {
        var showPick = (l.ambiguous || l.picked) && l.options.length > 1;
        part = '<div class="qo-part"><a class="qo-part__img" href="' + BS.url(l.p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(l.p.img, { alt: "", sizes: "56px" }) + "</a><div class=\"qo-part__txt\">" +
          (showPick
            ? '<label class="sr-only" for="' + id + "-pick-" + i + '">Choose the part for line ' + n + "</label>" +
              '<select class="select qo-pick" id="' + id + "-pick-" + i + '" data-pick="' + i + '">' + l.options.map(function (o) {
                return '<option value="' + esc(o.id) + '"' + (o === l.p ? " selected" : "") + ">" + esc(label(o) + " · " + inr(o.price)) + "</option>";
              }).join("") + "</select>" +
              '<p class="qo-part__t">' + (l.picked ? BS.subtitle(l.p) : esc(l.options.length + " parts fit. Pick the one you need.")) + ' <a href="' + BS.url(l.p) + '">Details</a></p>'
            : '<p class="qo-part__brand">' + esc(brandName(l.p)) + '</p><a class="qo-part__pn" href="' + BS.url(l.p) + '">' + esc(l.p.pn) + "</a>" +
              '<p class="qo-part__t">' + BS.subtitle(l.p) + "</p>") +
          (l.note && st === "check" ? '<p class="qo-part__note">' + esc(l.note) + "</p>" : "") +
          "</div></div>";
      }
      var a = lineAmount(l);
      return '<tr class="qo-row is-' + st + '" role="row" data-row="' + i + '">' +
        '<td class="qo-c-st" role="cell">' + icon(stIcon) + '<span class="sr-only">' + stText + "</span></td>" +
        '<td class="qo-c-typed" role="cell"><span class="qo-typed mono" title="' + esc(l.raw) + '">' + esc(l.raw) + '</span><span class="qo-line-n">Line ' + n + "</span></td>" +
        '<td class="qo-c-part" role="cell">' + part + "</td>" +
        '<td class="qo-c-qty" role="cell">' + stepper(l.qty, id + "-qty-" + i, "Quantity for line " + n, i) + moqNote(l) + "</td>" +
        '<td class="qo-c-unit r num" role="cell" data-label="Unit" data-unit>' + unitHTML(l, a) + "</td>" +
        '<td class="qo-c-amt r num" role="cell" data-label="Amount" data-amt>' + (l.p ? inr(a.amount) : '<span class="muted">Quote</span>') + "</td>" +
        '<td class="qo-c-stock" role="cell" data-stock>' + stockHTML(l) + "</td>" +
        '<td class="qo-c-rm" role="cell"><button class="icon-btn qo-rm" type="button" data-remove-line="' + i + '" aria-label="Remove line ' + n + (l.p ? ", " + esc(label(l.p)) : "") + '">' + icon("trash") + "</button></td>" +
      "</tr>";
    }

    function moqNote(l) {
      return l.p && l.p.moq > 1 && l.qty < l.p.moq ? '<p class="qo-moq">Sold in packs of ' + l.p.moq + ". We round up to " + l.p.moq + ".</p>" : "";
    }
    function unitHTML(l, a) {
      if (!l.p) return NONE;
      var nt = BS.nextTier(l.p, l.qty);
      var u = esc(BS.unitLabel(l.p));
      var sub = a.unit < l.p.price ? '<small class="is-tier">Tier price, list ' + inr(l.p.price) + "</small>" :
        nt ? "<small>" + inr(nt.price) + " at " + nt.qty + "+</small>" : "";
      return inr(a.unit) + '<span class="qo-unit"> / ' + u + "</span>" + sub;
    }
    function stockHTML(l) {
      if (!l.p) return '<span class="stock stock--out">On request</span>';
      var s = BS.stock(l.p);
      if (l.p.stock > 0 && l.qty > l.p.stock) return '<span class="stock stock--low">' + l.p.stock + " in stock, balance on request</span>";
      return '<span class="' + s.cls + '">' + esc(s.text) + "</span>";
    }

    function totals() {
      var lines = self.lines;
      var priced = lines.filter(function (l) { return l.p; });
      var sub = 0, base = 0;
      priced.forEach(function (l) { var a = lineAmount(l); sub += a.amount; base += a.base; });
      sub = round2(sub);
      var gst = round2(sub * BS.GST);
      var save = round2(base - sub);
      var found = lines.filter(function (l) { return l.status === "found"; }).length;
      var check = lines.filter(function (l) { return l.status === "check"; }).length;
      var miss = lines.length - found - check;
      announce(status, BS.plural(lines.length, "line") + " · " + found + " matched" + (check ? " · " + check + " to check" : "") + (miss ? " · " + miss + " not found" : ""));
      var ship = sub >= BS.FREE_SHIP ? "Free dispatch on this order." : "Add " + inr(Math.ceil(BS.FREE_SHIP - sub)) + " for free dispatch. Otherwise " + inr(BS.SHIP_FEE) + ".";
      var n = priced.length;
      sum.hidden = false;
      sum.innerHTML =
        '<div class="qo-sum__left">' +
          '<dl class="qo-sum__nums">' +
            '<div><dt>Lines priced</dt><dd class="num">' + n + " of " + lines.length + "</dd></div>" +
            '<div><dt>Total ex GST</dt><dd class="num">' + inr(sub) + "</dd></div>" +
            '<div><dt>GST 18%</dt><dd class="num">' + inr(gst) + "</dd></div>" +
            '<div class="is-total"><dt>Total incl. GST</dt><dd class="num">' + inr(round2(sub + gst)) + "</dd></div>" +
          "</dl>" +
          '<p class="small qo-sum__note">' + (save > 0 ? '<span class="qo-save">You save ' + inr(save) + " with tier prices.</span> " : "") + esc(ship) + "</p>" +
        "</div>" +
        '<div class="qo-sum__acts">' +
          '<button class="textlink qo-sum__clear" type="button" data-clear-list>Clear</button>' +
          '<button class="btn btn--quiet" type="button" data-quote-list>Request a quote for this list</button>' +
          '<button class="btn" type="button" data-add-all' + (n ? "" : " disabled") + ">" + (n ? "Add " + BS.plural(n, "line") + " to bag" : "Nothing to add yet") + "</button>" +
        "</div>";
      BS.emit("qo-layout");
    }
    self.totals = totals;

    // Refresh one row's price cells in place so a stepper keeps focus.
    function refreshRow(i) {
      var tr = $('[data-row="' + i + '"]', body);
      var l = self.lines[i];
      if (!tr || !l) return;
      var a = lineAmount(l);
      $("[data-unit]", tr).innerHTML = unitHTML(l, a);
      $("[data-amt]", tr).innerHTML = l.p ? inr(a.amount) : '<span class="muted">Quote</span>';
      $("[data-stock]", tr).innerHTML = stockHTML(l);
      var old = $(".qo-moq", tr);
      if (old) old.remove();
      var note = moqNote(l);
      if (note) $(".qo-c-qty", tr).insertAdjacentHTML("beforeend", note);
    }

    /* events */
    function qtyFrom(input) { return Math.max(1, Math.min(99999, parseInt(input.value, 10) || 1)); }
    root.addEventListener("input", function (e) {
      var st = e.target.closest("[data-row-qty]");
      if (!st) return;
      var i = +st.getAttribute("data-row-qty");
      if (!self.lines[i] || !e.target.value) return;
      self.lines[i].qty = qtyFrom(e.target);
      refreshRow(i);
      totals();
      cfg.onQty && cfg.onQty(i, self.lines[i].qty, true);
    });
    root.addEventListener("change", function (e) {
      var st = e.target.closest("[data-row-qty]");
      if (st) {
        var i = +st.getAttribute("data-row-qty");
        if (!self.lines[i]) return;
        self.lines[i].qty = qtyFrom(e.target.matches("input") ? e.target : $("input", st));
        refreshRow(i);
        totals();
        cfg.onQty && cfg.onQty(i, self.lines[i].qty);
        return;
      }
      var pick = e.target.closest("[data-pick]");
      if (pick) {
        var pi = +pick.getAttribute("data-pick");
        cfg.onPick && cfg.onPick(pi, pick.value);
        var again = $('[data-pick="' + pi + '"]', body);
        if (again) again.focus();
      }
    });
    root.addEventListener("click", function (e) {
      var t = e.target, el;
      if ((el = t.closest("[data-remove-line]"))) {
        var tr = el.closest("tr");
        // A double click or a second click during the exit animation must not remove the next line too.
        if (tr && tr.classList.contains("is-leaving")) return;
        var line = self.lines[+el.getAttribute("data-remove-line")];
        if (!line) return;
        var go = function () {
          var i = self.lines.indexOf(line);
          if (i === -1) return;
          cfg.onRemove && cfg.onRemove(i);
          var next = $('[data-remove-line="' + Math.min(i, self.lines.length - 1) + '"]', body) || $("#" + id + "-q");
          if (next) next.focus();
        };
        if (tr && !BS.reduceMotion) { tr.classList.add("is-leaving"); setTimeout(go, 220); } else go();
        return;
      }
      if ((el = t.closest("[data-to-quote]"))) { cfg.onQuoteLine && cfg.onQuoteLine(self.lines[+el.getAttribute("data-to-quote")]); return; }
      if (t.closest("[data-add-all]")) { addAll(t.closest("[data-add-all]")); return; }
      if (t.closest("[data-quote-list]")) { cfg.onQuote && cfg.onQuote(self.lines); return; }
      if (t.closest("[data-clear-list]")) { cfg.onClear && cfg.onClear(); return; }
      if (t.closest("[data-add-line]")) { addPart(); return; }
      if ((el = t.closest("[data-opt]"))) { choose(+el.getAttribute("data-opt")); qQty.focus(); qQty.select(); return; }
    });

    function addAll(btn) {
      var priced = self.lines.filter(function (l) { return l.p; });
      // a double click must not put the list in the bag twice
      if (!priced.length || btn.classList.contains("is-done")) return;
      priced.forEach(function (l) { BS.cart.add(l.p.id, l.qty); });
      var img = $(".qo-row .qo-part__img img", body);
      if (img) BS.flyToBag(img);
      BS.toast(esc(BS.plural(priced.length, "line")) + " added to your bag.", { label: "View bag", onAction: BS.openCart });
      btn.innerHTML = icon("check") + "Added to bag";
      btn.classList.add("is-done");
      setTimeout(function () { if (btn.isConnected) { btn.classList.remove("is-done"); btn.textContent = "Add " + BS.plural(priced.length, "line") + " to bag"; } }, 1800);
    }

    /* add a part: small type-ahead */
    var q = $("#" + id + "-q"), list = $("#" + id + "-list"), qErr = $("#" + id + "-q-err"), qHint = $("#" + id + "-q-hint"), qQty = $("#" + id + "-qty");
    var opts = [], active = -1, chosen = null;
    function openList(on) {
      list.hidden = !on;
      q.setAttribute("aria-expanded", on ? "true" : "false");
      if (!on) { active = -1; q.removeAttribute("aria-activedescendant"); }
    }
    function renderOpts() {
      var v = q.value.trim();
      chosen = null;
      setErr(q, qErr, "");
      qHint.textContent = "";
      if (v.length < 2) { opts = []; openList(false); return; }
      opts = BS.search(v, 6).map(function (r) { return r.p; });
      if (!opts.length) {
        // said inline, not in a floating list that would cover the Add button
        openList(false);
        qHint.textContent = "No part matches “" + v + "” yet. Try a size like 25x52x15, or request a quote for it.";
        return;
      }
      list.innerHTML = opts.map(function (p, i) {
        var s = BS.stock(p);
        return '<li class="qo-opt" id="' + id + "-opt-" + i + '" role="option" aria-selected="false" data-opt="' + i + '">' +
          '<span class="qo-opt__img">' + BS.imgTag(p.img, { alt: "", sizes: "40px" }) + "</span>" +
          '<span class="qo-opt__t"><strong>' + esc(label(p)) + "</strong><small>" + BS.subtitle(p) + "</small></span>" +
          '<span class="qo-opt__p num">' + inr(p.price) + "<small>" + esc(s.short) + "</small></span></li>";
      }).join("");
      active = -1;
      openList(true);
    }
    function setActive(i) {
      var items = $$("[data-opt]", list);
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach(function (el, k) { el.setAttribute("aria-selected", k === active ? "true" : "false"); });
      q.setAttribute("aria-activedescendant", items[active].id);
      items[active].scrollIntoView({ block: "nearest" });
    }
    function choose(i) {
      var p = opts[i];
      if (!p) return;
      chosen = p;
      q.value = label(p);
      openList(false);
    }
    function addPart() {
      var v = q.value.trim();
      var p = chosen;
      if (!p && v) {
        var r = resolve(v);
        if (r.p && r.status === "found") p = r.p;
      }
      qHint.textContent = "";
      if (!v) { setErr(q, qErr, "Type a part number, size or name."); q.focus(); return; }
      if (!p) { setErr(q, qErr, "No part matches “" + v + "”. Pick one from the list, or request a quote for it."); q.focus(); return; }
      var qty = Math.max(1, parseInt(qQty.value, 10) || 1);
      cfg.onAdd && cfg.onAdd(p, qty);
      q.value = "";
      qQty.value = 1;
      var minus = $('[data-step="-1"]', qQty.closest("[data-stepper]"));
      if (minus) minus.disabled = true;
      chosen = null;
      openList(false);
      setErr(q, qErr, "");
      q.focus();
    }
    q.addEventListener("input", BS.debounce(renderOpts, 80));
    q.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) renderOpts(); setActive(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (!list.hidden && active > -1) { choose(active); qQty.focus(); qQty.select(); }
        else addPart();
      } else if (e.key === "Escape") {
        if (!list.hidden) { e.stopPropagation(); openList(false); }
      }
    });
    qQty.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addPart(); } });
    q.addEventListener("blur", function () { setTimeout(function () { if (doc.activeElement !== q) openList(false); }, 150); });
    list.addEventListener("mousedown", function (e) { e.preventDefault(); });

    return self;
  }

  function stepper(qty, inputId, aria, row) {
    return '<div class="stepper stepper--sm" data-stepper="" data-local' + (row != null ? ' data-row-qty="' + row + '"' : "") + ">" +
      '<button type="button" data-step="-1" aria-label="Decrease quantity"' + (qty <= 1 ? " disabled" : "") + ">" + icon("minus") + "</button>" +
      '<input type="number" inputmode="numeric" min="1" max="99999" value="' + qty + '" id="' + inputId + '"' + (aria ? ' aria-label="' + esc(aria) + '"' : "") + ">" +
      '<button type="button" data-step="1" aria-label="Increase quantity">' + icon("plus") + "</button></div>";
  }

  function setErr(input, errEl, msg) {
    if (!errEl) return;
    errEl.textContent = msg || "";
    if (input) {
      if (msg) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }

  /* ---------------------------------------------------------------- tabs */
  var TABS = ["paste", "bom", "rfq"];
  var tabBtns = $$("[data-tab]");
  var current = null;
  function selectTab(key, opts) {
    opts = opts || {};
    if (TABS.indexOf(key) === -1) key = "paste";
    tabBtns.forEach(function (b) {
      var on = b.getAttribute("data-tab") === key;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      $("#" + b.getAttribute("aria-controls")).hidden = !on;
    });
    current = key;
    if (opts.hash !== false) {
      try { history.replaceState(null, "", location.pathname + location.search + "#" + key); } catch (e) { /* file:// or sandboxed */ }
    }
    BS.emit("qo-layout");
    if (opts.focus) $("#tab-" + key).focus();
    if (opts.scroll) {
      var top = $("[data-tabs]").getBoundingClientRect().top + window.pageYOffset - 70;
      if (window.pageYOffset > top || opts.scroll === "force") window.scrollTo({ top: Math.max(0, top), behavior: BS.reduceMotion ? "auto" : "smooth" });
    }
  }
  tabBtns.forEach(function (b, i) {
    b.addEventListener("click", function () { selectTab(b.getAttribute("data-tab")); });
    b.addEventListener("keydown", function (e) {
      var k = e.key, n = null;
      if (k === "ArrowRight") n = (i + 1) % tabBtns.length;
      else if (k === "ArrowLeft") n = (i - 1 + tabBtns.length) % tabBtns.length;
      else if (k === "Home") n = 0;
      else if (k === "End") n = tabBtns.length - 1;
      if (n == null) return;
      e.preventDefault();
      selectTab(tabBtns[n].getAttribute("data-tab"), { focus: true });
    });
  });
  window.addEventListener("hashchange", function () {
    var h = location.hash.slice(1);
    if (TABS.indexOf(h) !== -1 && h !== current) selectTab(h, { hash: false, scroll: "force" });
  });

  /* ------------------------------------------------------------- paste tab */
  var SAMPLES = {
    textile: "6205-2RS1 x 200\n6202-2RS1 x 120\n608ZZ x 300\nHK2016 x 100\nA33 x 40\n1000-5M-15 x 20\nLGMT 2/1 x 12",
    pump: "6305-2RS1 x 10\n6306-2Z x 10\n6206 ZZ x 6\n6208-2Z/C3 x 6\nTC 35x62x10 x 20\nL-100 x 4\nL-100 NBR x 8\nLGEP 2/1 x 2",
    conveyor: "UCP205D1 x 24\nUCF205D1 x 12\nUCT205D1 x 6\n22210 E x 4\nSNL 510-608 x 2\n08B-1 x 5\n08B-1 17T x 8\nB60 x 10\nB-48 x 10"
  };
  var SAMPLE_NAMES = { textile: "Textile mill monthly kit", pump: "Pump overhaul", conveyor: "Conveyor spares" };

  var ta = $("[data-paste]");
  var meta = $("[data-paste-meta]");
  var draft = BS.store.get("qoDraft", null) || {};
  var choices = draft.choices || {};
  var lineMap = [];
  var pasteLines = [];

  var paste = Results($('[data-results="paste"]'), {
    id: "pl",
    title: "Your list",
    emptyIcon: "list-checks",
    emptyTitle: "Your priced list appears here",
    emptyText: "Paste part numbers above, load a sample list, or add parts one at a time below.",
    emptyStatus: "No lines yet. Paste a list to start.",
    onQty: function (i, qty) {
      var l = pasteLines[i];
      if (!l) return;
      var rows = ta.value.split(/\r?\n/);
      var at = lineMap[i];
      if (at == null) return;
      l.raw = l.part + " x " + qty;
      rows[at] = l.raw;
      ta.value = rows.join("\n");
      var typed = $('[data-row="' + i + '"] .qo-typed', paste.root);
      if (typed) { typed.textContent = l.raw; typed.title = l.raw; }
      saveDraft();
    },
    onRemove: function (i) {
      var before = ta.value;
      var rows = ta.value.split(/\r?\n/);
      var at = lineMap[i];
      if (at == null) return;
      var gone = rows[at];
      rows.splice(at, 1);
      ta.value = rows.join("\n").replace(/^\n+/, "");
      parsePaste();
      BS.toast("Removed <strong>" + esc(gone.trim()) + "</strong>.", { label: "Undo", icon: "trash", onAction: function () { ta.value = before; parsePaste(); } });
    },
    onPick: function (i, id) {
      var l = pasteLines[i];
      if (!l) return;
      choices[BS.norm(l.part)] = id;
      parsePaste();
    },
    onAdd: function (p, qty) {
      choices[BS.norm(p.pn)] = p.id;
      var v = ta.value.replace(/\s+$/, "");
      ta.value = (v ? v + "\n" : "") + p.pn + " x " + qty;
      parsePaste();
      BS.toast("<strong>" + esc(label(p)) + "</strong> added to your list.", { icon: "list-checks" });
    },
    onClear: function () { clearPaste(); },
    onQuote: function (lines) { sendToQuote(lines, "your list"); },
    onQuoteLine: function (l) { quoteOne(l); }
  });

  function saveDraft() {
    // Keep only choices for parts still on the list.
    var keep = {};
    pasteLines.forEach(function (l) { var k = BS.norm(l.part); if (choices[k]) keep[k] = choices[k]; });
    choices = Object.assign({}, choices);
    BS.store.set("qoDraft", { text: ta.value, choices: keep });
  }

  function parsePaste() {
    var rows = ta.value.split(/\r?\n/);
    lineMap = [];
    rows.forEach(function (r, i) { if (r.trim()) lineMap.push(i); });
    var total = lineMap.length;
    lineMap = lineMap.slice(0, MAX_PASTE);
    pasteLines = BS.parseLines(ta.value).map(function (l) {
      return makeLine(l.raw, l.part, l.qty, null, choices[BS.norm(l.part)]);
    });
    paste.render(pasteLines, total > MAX_PASTE ? { note: "We priced the first " + MAX_PASTE + " of " + total + " lines. For longer lists, upload a BOM." } : null);
    meta.textContent = total ? BS.plural(Math.min(total, MAX_PASTE), "line") + " · saved on this device" : "Your list is saved on this device as you type.";
    saveDraft();
  }
  var parseSoon = BS.debounce(parsePaste, 260);
  ta.addEventListener("input", function () { paste.stale(true); parseSoon(); });

  function clearPaste() {
    if (!ta.value.trim()) return;
    var before = ta.value, beforeChoices = Object.assign({}, choices);
    ta.value = "";
    choices = {};
    parsePaste();
    ta.focus();
    BS.toast("List cleared.", { label: "Undo", icon: "trash", onAction: function () { ta.value = before; choices = beforeChoices; parsePaste(); } });
  }

  $$("[data-sample]").forEach(function (b) {
    b.addEventListener("click", function () {
      var key = b.getAttribute("data-sample");
      var before = ta.value;
      ta.value = SAMPLES[key];
      parsePaste();
      if (before.trim() && before !== SAMPLES[key]) {
        BS.toast("Loaded <strong>" + esc(SAMPLE_NAMES[key]) + "</strong>.", { label: "Undo", icon: "arrow-counter-clockwise", onAction: function () { ta.value = before; parsePaste(); } });
      }
      var r = $('[data-results="paste"] .qo-res');
      if (r && r.getBoundingClientRect().top > window.innerHeight * 0.8) r.scrollIntoView({ behavior: BS.reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });

  /* --------------------------------------------------------------- BOM tab */
  var bomInput = $("[data-bom-input]");
  var drop = $("[data-drop]");
  var bomErr = $("[data-bom-err]");
  var mapEl = $("[data-map]");
  var bomResEl = $('[data-results="bom"]');
  var bomStart = $("[data-bom-start]");
  var bom = null;        // { name, size, kind, rows, header, cols, map, notes }
  var bomLines = [];
  var bomFile = null;
  var bomNote = null;    // shown above the BOM results, e.g. when only the first 500 lines were matched

  var bomRes = Results(bomResEl, {
    id: "bl",
    title: "Matched from your BOM",
    emptyIcon: "file-csv",
    emptyTitle: "No lines left",
    emptyText: "You removed every line. Add parts below or choose another file.",
    onQty: function (i, qty) { if (bomLines[i]) bomLines[i].qty = qty; },
    onRemove: function (i) {
      var gone = bomLines.splice(i, 1)[0];
      bomRes.render(bomLines, bomNote);
      if (gone) BS.toast("Removed <strong>" + esc(gone.raw) + "</strong>.", { label: "Undo", icon: "trash", onAction: function () { bomLines.splice(i, 0, gone); bomRes.render(bomLines, bomNote); } });
    },
    onPick: function (i, id) {
      var l = bomLines[i];
      var p = BS.byId(id);
      if (!l || !p) return;
      l.p = p; l.status = "found"; l.picked = true; l.note = "";
      bomRes.render(bomLines, bomNote);
    },
    onAdd: function (p, qty) {
      var l = makeLine(label(p), p.pn, qty, p.brand, p.id);
      bomLines.push(l);
      bomRes.render(bomLines, bomNote);
      BS.toast("<strong>" + esc(label(p)) + "</strong> added to the list.", { icon: "list-checks" });
    },
    onClear: function () { resetBom(true); },
    onQuote: function (lines) { sendToQuote(lines, bom ? bom.name : "your BOM", bomFile); },
    onQuoteLine: function (l) { quoteOne(l); }
  });

  function showBomErr(msg) {
    bomErr.innerHTML = msg ? icon("warning-circle") + "<span>" + msg + "</span>" : "";
    drop.classList.toggle("is-error", !!msg);
  }

  function resetBom(focus) {
    bom = null; bomLines = []; bomFile = null; bomNote = null;
    mapEl.hidden = true; mapEl.innerHTML = "";
    bomResEl.hidden = true;
    bomStart.hidden = false;
    bomInput.value = "";
    showBomErr("");
    if (focus) $("[data-choose]", drop).focus();
  }

  // open the picker from the button or anywhere on the drop zone
  drop.addEventListener("click", function (e) {
    if (e.target === bomInput) return;
    bomInput.click();
  });
  bomInput.addEventListener("change", function () { if (bomInput.files && bomInput.files[0]) readFile(bomInput.files[0]); });

  var depth = 0;
  drop.addEventListener("dragenter", function (e) { e.preventDefault(); depth++; drop.classList.add("is-over"); });
  drop.addEventListener("dragover", function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; });
  drop.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove("is-over"); });
  drop.addEventListener("drop", function (e) {
    e.preventDefault();
    depth = 0;
    drop.classList.remove("is-over");
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readFile(f);
  });
  // A file dropped beside the zone should not navigate away from the page.
  ["dragover", "drop"].forEach(function (t) {
    window.addEventListener(t, function (e) { if (current === "bom" && !drop.contains(e.target)) e.preventDefault(); });
  });

  function extOf(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; }

  function readFile(file) {
    showBomErr("");
    var ext = extOf(file.name);
    if (["csv", "txt", "xlsx", "xls"].indexOf(ext) === -1) {
      showBomErr("“" + esc(file.name) + "” is not a file we can read. Choose an Excel (.xlsx, .xls), CSV or TXT file.");
      bomInput.value = "";
      return;
    }
    if (!file.size) { showBomErr("“" + esc(file.name) + "” is empty. Check you saved the sheet, then try again."); bomInput.value = ""; return; }
    if (file.size > 10 * 1024 * 1024) { showBomErr("That file is larger than 10 MB. Save just the BOM sheet as CSV and try again."); bomInput.value = ""; return; }
    bomFile = file;
    mapLoading(file, ext === "xlsx" || ext === "xls" ? "Opening the spreadsheet…" : "Reading the file…");
    if (ext === "csv" || ext === "txt") {
      var fr = new FileReader();
      fr.onload = function () { gotRows(file, ext, parseText(String(fr.result || ""))); };
      fr.onerror = function () { failRead("We could not read “" + esc(file.name) + "”. Try saving it again."); };
      fr.readAsText(file);
    } else {
      loadSheetJS(function (ok) {
        if (!ok) { failRead("We could not load the Excel reader just now. Save the sheet as CSV (File, Save as, CSV) and upload that instead."); return; }
        var fr2 = new FileReader();
        fr2.onload = function () {
          try {
            var wb = window.XLSX.read(new Uint8Array(fr2.result), { type: "array" });
            var name = null, rows = [];
            for (var i = 0; i < wb.SheetNames.length; i++) {
              var r = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, raw: false, defval: "", blankrows: false });
              if (r.some(function (row) { return row.some(function (c) { return String(c).trim(); }); })) { name = wb.SheetNames[i]; rows = r; break; }
            }
            gotRows(file, ext, rows, wb.SheetNames.length > 1 && name ? "Read the sheet “" + name + "”, the first one with data." : "");
          } catch (err) {
            failRead("“" + esc(file.name) + "” could not be opened as a spreadsheet. Save it as CSV and try again.");
          }
        };
        fr2.onerror = function () { failRead("We could not read “" + esc(file.name) + "”. Try saving it again."); };
        fr2.readAsArrayBuffer(file);
      });
    }
  }
  function failRead(msg) {
    bomFile = null;
    mapEl.hidden = true;
    bomStart.hidden = false;
    bomInput.value = "";
    showBomErr(msg);
  }

  var sheetState = 0, sheetWaiters = [];
  function loadSheetJS(cb) {
    if (window.XLSX) { cb(true); return; }
    sheetWaiters.push(cb);
    if (sheetState === 1) return;
    sheetState = 1;
    var s = doc.createElement("script");
    s.src = SHEETJS;
    s.async = true;
    s.crossOrigin = "anonymous";
    var done = function (ok) { sheetState = ok ? 2 : 0; var w = sheetWaiters; sheetWaiters = []; w.forEach(function (f) { f(ok && !!window.XLSX); }); };
    s.onload = function () { done(true); };
    s.onerror = function () { s.remove(); done(false); };
    doc.head.appendChild(s);
  }

  /* CSV / TXT: quotes, commas, semicolons, tabs. Plain lists fall back to the paste format. */
  function detectDelim(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 20);
    var best = null, bestScore = 0;
    [",", ";", "\t", "|"].forEach(function (d) {
      var counts = lines.map(function (l) { return splitRow(l, d).length - 1; });
      var withD = counts.filter(function (c) { return c > 0; }).length;
      // a separator that shows up on only a few lines ("A33, 12" in a plain list) is not a column separator
      if (!withD || withD / lines.length < 0.6) return;
      var avg = counts.reduce(function (a, b) { return a + b; }, 0) / lines.length;
      var same = counts.filter(function (c) { return c === counts[0]; }).length / lines.length;
      var score = withD / lines.length * 2 + same + Math.min(avg, 6) / 10;
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }
  function splitRow(line, d) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"' && !cur.trim()) { q = true; cur = ""; }
      else if (c === d) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  function parseCSV(text, d) {
    var rows = [], row = [], cur = "", q = false, i = 0, n = text.length;
    for (; i < n; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
        continue;
      }
      if (c === '"' && !cur.trim()) { q = true; cur = ""; }
      else if (c === d) { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); rows.push(row); row = []; cur = "";
      } else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); }).filter(function (r) { return r.some(Boolean); });
  }
  var QTY_TAIL = /^(.*?)(?:\s*[,;:\t×xX\*=]\s*|\s+-\s+|\s+qty\s*|\s+)(\d{1,6})\s*(?:pcs?|nos?|units?|sets?|kits?)?\.?$/i;
  function parseText(text) {
    text = text.replace(/^\uFEFF/, "");
    var d = detectDelim(text);
    if (d) { var rows = parseCSV(text, d); rows.delim = d; return rows; }
    // one part per line, like the paste box
    var out = [["Part number", "Quantity"]];
    text.split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim().replace(/\s+/g, " ");
      if (!line) return;
      var m = line.match(QTY_TAIL);
      if (m && m[1] && /[a-z0-9]/i.test(m[1])) out.push([m[1].trim(), m[2]]);
      else out.push([line, ""]);
    });
    out.delim = "lines";
    return out;
  }

  var HEAD = {
    qty: /\b(qty|qnty|quantity|quantities|nos|pcs|units|req(uired)?|order\s*qty|count)\b/i,
    brand: /\b(brand|make|mfr|mfg|manufacturer|oem|maker)\b/i,
    part: /(part|p\/?n\b|item\s*code|code|material|cat(alogue|alog)?\.?\s*no|model|designation|bearing\s*no|ref(erence)?\b|sku)/i,
    desc: /(desc|description|item|name|particular|specification|spec|details)/i
  };
  function detectHeader(rows) {
    for (var r = 0; r < Math.min(rows.length, 10); r++) {
      var row = rows[r], hits = 0, nums = 0;
      row.forEach(function (c) {
        var s = String(c).trim();
        if (!s) return;
        if (/^\d+(\.\d+)?$/.test(s)) nums++;
        if (HEAD.qty.test(s) || HEAD.brand.test(s) || HEAD.part.test(s) || HEAD.desc.test(s)) hits++;
      });
      if (hits >= 1 && nums === 0) return r;
    }
    return -1;
  }
  function colLetter(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  function guessMap(cols, body) {
    var map = { part: -1, desc: -1, qty: -1, brand: -1 };
    var used = {};
    function take(key, test) {
      for (var i = 0; i < cols.length; i++) if (!used[i] && cols[i].head && test.test(cols[i].head)) { map[key] = i; used[i] = 1; return; }
    }
    take("qty", HEAD.qty); take("brand", HEAD.brand); take("part", HEAD.part); take("desc", HEAD.desc);
    // No usable header: look at the values instead.
    var sample = body.slice(0, 30);
    function share(i, fn) { var v = sample.map(function (r) { return String(r[i] || "").trim(); }).filter(Boolean); return v.length ? v.filter(fn).length / v.length : 0; }
    if (map.qty === -1) {
      for (var i = cols.length - 1; i >= 0; i--) if (!used[i] && share(i, function (s) { return /^\d{1,6}(\.0+)?$/.test(s.replace(/,/g, "")); }) > 0.8) { map.qty = i; used[i] = 1; break; }
    }
    if (map.part === -1) {
      var best = -1, bestShare = 0;
      for (var j = 0; j < cols.length; j++) {
        if (used[j]) continue;
        var sh = share(j, function (s) { var r = BS.search(s, 1)[0]; return r && r.score >= 50; });
        if (sh > bestShare) { bestShare = sh; best = j; }
      }
      if (best > -1 && bestShare >= 0.3) { map.part = best; used[best] = 1; }
    }
    if (map.part === -1 && map.desc === -1) {
      for (var k = 0; k < cols.length; k++) if (!used[k]) { map.part = k; used[k] = 1; break; }
    }
    if (map.brand === -1) {
      for (var b = 0; b < cols.length; b++) if (!used[b] && share(b, function (s) { return !!brandFromText(s) && s.length < 30; }) > 0.6) { map.brand = b; used[b] = 1; break; }
    }
    return map;
  }

  function gotRows(file, ext, rows, sheetNote) {
    if (!rows || !rows.length) { failRead("“" + esc(file.name) + "” has no rows we can read. Check the file has a part number column."); return; }
    var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    var h = detectHeader(rows);
    var cols = [];
    for (var i = 0; i < width; i++) {
      var head = h > -1 ? String(rows[h][i] || "").trim() : "";
      cols.push({ head: head, label: "Column " + colLetter(i) + (head ? " · " + head : "") });
    }
    var body = rows.slice(h + 1).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
    if (!body.length) { failRead("“" + esc(file.name) + "” has a header row but no parts under it."); return; }
    var map = guessMap(cols, body);
    var delim = rows.delim === "\t" ? "tab separated" : rows.delim === ";" ? "semicolon separated" : rows.delim === "," ? "comma separated" : rows.delim === "|" ? "pipe separated" : rows.delim === "lines" ? "one part per line" : "spreadsheet";
    bom = { name: file.name, size: file.size, kind: ext, rows: body, header: h, cols: cols, map: map, delim: delim, sheetNote: sheetNote || "", total: body.length };
    renderMap();
  }

  function mapLoading(file, msg) {
    bomStart.hidden = true;
    bomResEl.hidden = true;
    mapEl.hidden = false;
    mapEl.innerHTML = '<div class="qo-card qo-map__card" aria-busy="true">' +
      '<div class="qo-file"><span class="qo-file__ic">' + icon(/\.xlsx?$/i.test(file.name) ? "file-xls" : "file-csv") + '</span><div><p class="qo-file__n">' + esc(file.name) + '</p><p class="small muted" role="status">' + esc(msg) + "</p></div></div>" +
      '<div class="qo-map__grid">' + new Array(5).join('<div class="field"><span class="skeleton" style="height:14px;width:40%"></span><span class="skeleton" style="height:50px"></span></div>') + "</div>" +
      '<div class="qo-skel"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div></div>';
  }

  function bomUsable() {
    var m = bom.map;
    return bom.rows.filter(function (r) {
      return (m.part > -1 && String(r[m.part] || "").trim()) || (m.desc > -1 && String(r[m.desc] || "").trim());
    });
  }
  function qtyCell(v) {
    var s = String(v == null ? "" : v).replace(/,/g, "").trim();
    var m = s.match(/^(\d+(?:\.\d+)?)/);
    if (!m) return null;
    var n = Math.round(parseFloat(m[1]));
    return n > 0 ? n : null;
  }

  function renderMap() {
    var m = bom.map;
    var usable = bomUsable();
    var count = Math.min(usable.length, MAX_BOM);
    var noQty = m.qty === -1;
    var blankQty = noQty ? 0 : usable.slice(0, MAX_BOM).filter(function (r) { return qtyCell(r[m.qty]) == null; }).length;
    var notes = [];
    if (bom.sheetNote) notes.push(["info", esc(bom.sheetNote)]);
    if (noQty) notes.push(["warning-circle", "We did not find a quantity column, so every line is set to 1. Pick the column below if there is one, or change quantities after matching."]);
    else if (blankQty) notes.push(["info", BS.plural(blankQty, "row") + " had no quantity and will be set to 1."]);
    if (usable.length > MAX_BOM) notes.push(["warning-circle", "This file has " + usable.length.toLocaleString("en-IN") + " lines. We will match the first " + MAX_BOM + ". Split the rest into a second file or request a quote for the full list."]);
    if (m.part === -1 && m.desc === -1) notes.push(["warning-circle", "Pick the column that holds part numbers or descriptions."]);
    var FIELDS = [["part", "Part number"], ["desc", "Description"], ["qty", "Quantity"], ["brand", "Brand"]];
    var preview = usable.slice(0, 5);
    mapEl.innerHTML = '<div class="qo-card qo-map__card">' +
      '<div class="qo-file"><span class="qo-file__ic">' + icon(bom.kind === "xlsx" || bom.kind === "xls" ? "file-xls" : "file-csv") + "</span>" +
        '<div class="qo-file__txt"><p class="qo-file__n">' + esc(bom.name) + '</p><p class="small muted">' + esc(fmtSize(bom.size) + " · " + BS.plural(bom.total, "row") + " · " + (bom.delim === "one part per line" ? "" : (bom.header > -1 ? "header on row " + (bom.header + 1) : "no header row") + " · ") + bom.delim) + "</p></div>" +
        '<button class="btn btn--sm btn--quiet" type="button" data-bom-another>Choose another file</button></div>' +
      (notes.length ? '<div class="qo-map__notes">' + notes.map(function (n) { return '<p class="notice' + (n[0] === "warning-circle" ? " notice--warm" : "") + '">' + icon(n[0]) + "<span>" + n[1] + "</span></p>"; }).join("") + "</div>" : "") +
      '<h3 class="h4 qo-map__h" id="map-h">Check the columns</h3>' +
      '<p class="small muted">' + (bom.delim === "one part per line" ? "We read one part per line, with the quantity at the end." : bom.header > -1 ? "We matched these from your header row. Change any that look wrong." : "Your file has no header row, so we went by the values. Change any that look wrong.") + "</p>" +
      '<div class="qo-map__grid" role="group" aria-labelledby="map-h">' + FIELDS.map(function (f) {
        return '<div class="field"><label for="map-' + f[0] + '">' + f[1] + (f[0] === "part" || f[0] === "desc" ? "" : " <small>optional</small>") + "</label>" +
          '<select class="select" id="map-' + f[0] + '" data-map-key="' + f[0] + '"><option value="-1">' + (f[0] === "qty" ? "Not in file, use 1" : "Not in file") + "</option>" +
          bom.cols.map(function (c, i) { return '<option value="' + i + '"' + (m[f[0]] === i ? " selected" : "") + ">" + esc(c.label) + "</option>"; }).join("") + "</select></div>";
      }).join("") + "</div>" +
      '<div class="qo-preview"><p class="small muted qo-preview__l">First ' + Math.min(5, preview.length) + " of " + BS.plural(usable.length, "line") + ", as we read them</p>" +
        '<div class="table-wrap"><table class="table qo-preview__t' + (m.part > -1 ? " has-part" : "") + '"><thead><tr><th scope="col">Part number</th><th scope="col" class="qo-pv-desc">Description</th><th scope="col" class="r">Quantity</th><th scope="col">Brand</th></tr></thead><tbody>' +
        (preview.length ? preview.map(function (r) {
          var qv = m.qty > -1 ? qtyCell(r[m.qty]) : null;
          return "<tr><td class=\"mono\">" + cell(r, m.part) + "</td><td class=\"qo-pv-desc\">" + cell(r, m.desc) + '</td><td class="r num">' + (qv != null ? qv : '<span class="muted">1</span>') + "</td><td>" + cell(r, m.brand) + "</td></tr>";
        }).join("") : '<tr><td colspan="4" class="muted">No rows with a part number or description in the chosen columns.</td></tr>') +
        "</tbody></table></div></div>" +
      '<div class="qo-map__foot"><p class="small muted">Rows without a part number or description are skipped.</p>' +
        '<button class="btn btn--lg" type="button" data-match' + (count ? "" : " disabled") + ">Match " + BS.plural(count, "line") + "</button></div>" +
      "</div>";
    BS.emit("qo-layout");
  }
  function cell(r, i) { var v = i > -1 ? String(r[i] == null ? "" : r[i]).trim() : ""; return v ? esc(v) : NONE; }

  mapEl.addEventListener("change", function (e) {
    var s = e.target.closest("[data-map-key]");
    if (!s || !bom) return;
    var key = s.getAttribute("data-map-key"), v = +s.value;
    // one column, one meaning
    Object.keys(bom.map).forEach(function (k) { if (k !== key && bom.map[k] === v && v > -1) bom.map[k] = -1; });
    bom.map[key] = v;
    renderMap();
    var again = $("#map-" + key);
    if (again) again.focus();
  });
  mapEl.addEventListener("click", function (e) {
    if (e.target.closest("[data-bom-another]")) { bomInput.value = ""; bomInput.click(); return; }
    if (e.target.closest("[data-match]")) { matchBom(); return; }
    if (e.target.closest("[data-map-edit]")) { renderMap(); bomResEl.hidden = true; $("#map-part").focus(); }
  });

  function matchBom() {
    var m = bom.map;
    var usableCount = bomUsable().length;
    var rows = bomUsable().slice(0, MAX_BOM);
    bomResEl.hidden = false;
    bomRes.loading("Matching " + BS.plural(rows.length, "line") + "…");
    mapEl.innerHTML = '<div class="qo-card qo-map__card qo-map__card--done"><div class="qo-file"><span class="qo-file__ic">' + icon(bom.kind === "xlsx" || bom.kind === "xls" ? "file-xls" : "file-csv") + "</span>" +
      '<div class="qo-file__txt"><p class="qo-file__n">' + esc(bom.name) + '</p><p class="small muted" data-bom-progress role="status">Matching ' + BS.plural(rows.length, "line") + "…</p></div>" +
      '<div class="qo-file__acts"><button class="btn btn--sm btn--quiet" type="button" data-map-edit>Change columns</button><button class="btn btn--sm btn--quiet" type="button" data-bom-another>Choose another file</button></div></div></div>';
    var out = [], i = 0;
    var prog = $("[data-bom-progress]", mapEl);
    var start = Date.now();
    function step() {
      var end = Math.min(rows.length, i + 60);
      for (; i < end; i++) {
        var r = rows[i];
        var pn = m.part > -1 ? String(r[m.part] || "").trim() : "";
        var desc = m.desc > -1 ? String(r[m.desc] || "").trim() : "";
        var qty = m.qty > -1 ? qtyCell(r[m.qty]) || 1 : 1;
        var brandText = m.brand > -1 ? String(r[m.brand] || "") : "";
        var hint = brandFromText(brandText);
        var text = (pn || desc).replace(/[\r\n]+/g, " ");
        // the same quick-order parser the paste box uses
        var parsed = BS.parseLines(text + " x " + qty)[0] || { raw: text, part: text, qty: qty };
        var line = makeLine((brandText && !brandFromText(pn) ? brandText.trim() + " " : "") + (pn || desc) + " x " + qty, parsed.part, parsed.qty, hint, null);
        if (line.status === "missing" && pn && desc) {
          var alt = makeLine(line.raw, desc, qty, hint, null);
          if (alt.status !== "missing") { alt.status = "check"; alt.note = "Matched on the description. Check the part number."; line = alt; }
        }
        out.push(line);
      }
      if (prog) prog.textContent = "Matched " + i + " of " + rows.length + "…";
      if (i < rows.length) setTimeout(step, 0);
      else setTimeout(function () {
        bomLines = out;
        bomNote = usableCount > out.length ? { note: "We matched the first " + out.length + " of " + usableCount.toLocaleString("en-IN") + " lines in this file. Upload the rest as a second file, or request a quote for the full list." } : null;
        var miss = out.filter(function (l) { return !l.p; }).length;
        if (prog) prog.textContent = BS.plural(out.length, "line") + " read from " + (usableCount > out.length ? "the first " + out.length + " of " + usableCount.toLocaleString("en-IN") + " rows" : "this file") + (miss ? " · " + miss + " not in the catalogue" : "");
        bomRes.render(bomLines, bomNote);
        var head = $(".qo-res", bomResEl);
        if (head) head.scrollIntoView({ behavior: BS.reduceMotion ? "auto" : "smooth", block: "start" });
      }, Math.max(0, 450 - (Date.now() - start)));
    }
    setTimeout(step, 30);
  }

  // CSV template, generated in the browser
  $("[data-template]").addEventListener("click", function (e) {
    e.preventDefault();
    var csv = "Part number,Description,Quantity,Brand\r\n" +
      "6205-2RS1,\"Deep groove ball bearing, sealed\",200,SKF\r\n" +
      "UCP205D1,\"Pillow block unit, 25 mm bore\",40,NTN\r\n" +
      "B60,Classical V-belt,75,Fenner\r\n";
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = doc.createElement("a");
    a.href = url;
    a.download = "bearingsetu-bom-template.csv";
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    BS.toast("Template downloaded. Fill it in and drop it here.", { icon: "download-simple" });
  });

  /* --------------------------------------------------------------- RFQ tab */
  var form = $("[data-rfq-form]");
  var linesEl = $("[data-lines]");
  var linesCount = $("[data-lines-count]");
  var noteEl = $("[data-rfq-note]");
  var errSum = $("[data-errsum]");
  var doneEl = $("[data-rfq-done]");
  var wrap = $("[data-rfq-wrap]");
  var fileInput = $("[data-attach-input]");
  var fileShow = $("[data-attach-file]");
  var rowSeq = 0;
  var submitted = false;

  var dateIn = $("#rfq-date");
  dateIn.min = todayISO();

  function rowCount() { return $$(".qo-line", linesEl).length; }
  function addRow(part, qty, target, focus) {
    if (rowCount() >= MAX_RFQ) { BS.toast("A quote request holds up to " + MAX_RFQ + " lines. Attach the full list as a file.", { icon: "info" }); return null; }
    var k = ++rowSeq;
    var li = doc.createElement("li");
    li.className = "qo-line";
    li.innerHTML =
      '<span class="qo-line__n num" aria-hidden="true"></span>' +
      '<div class="field qo-line__part"><label for="rl-p-' + k + '">Part number or description</label>' +
        '<input class="input" id="rl-p-' + k + '" type="text" autocomplete="off" spellcheck="false" data-l="part" aria-describedby="rl-p-' + k + '-hint rl-p-' + k + '-err" value="' + esc(part || "") + '">' +
        '<p class="hint qo-line__match" id="rl-p-' + k + '-hint" data-match-hint></p><p class="error" id="rl-p-' + k + '-err"></p></div>' +
      '<div class="field qo-line__qty"><label for="rl-q-' + k + '">Quantity</label>' +
        '<input class="input num" id="rl-q-' + k + '" type="text" inputmode="numeric" autocomplete="off" data-l="qty" aria-describedby="rl-q-' + k + '-err" value="' + esc(qty || "") + '">' +
        '<p class="error" id="rl-q-' + k + '-err"></p></div>' +
      '<div class="field qo-line__tgt"><label for="rl-t-' + k + '">Target price / unit <small>optional</small></label>' +
        '<div class="qo-rupee"><span aria-hidden="true">₹</span><input class="input num" id="rl-t-' + k + '" type="text" inputmode="decimal" autocomplete="off" data-l="target" aria-describedby="rl-t-' + k + '-err" value="' + esc(target || "") + '"></div>' +
        '<p class="error" id="rl-t-' + k + '-err"></p></div>' +
      '<button class="icon-btn qo-line__rm" type="button" data-rm-row>' + icon("x") + "</button>";
    linesEl.appendChild(li);
    renumber();
    matchHint($('[data-l="part"]', li));
    if (focus) $('[data-l="part"]', li).focus();
    return li;
  }
  function renumber() {
    var rows = $$(".qo-line", linesEl);
    rows.forEach(function (li, i) {
      $(".qo-line__n", li).textContent = i + 1;
      var rm = $("[data-rm-row]", li);
      rm.setAttribute("aria-label", "Remove line " + (i + 1));
      rm.disabled = rows.length === 1;
      $('[data-l="part"]', li).setAttribute("aria-label", "Part number or description, line " + (i + 1));
      $('[data-l="qty"]', li).setAttribute("aria-label", "Quantity, line " + (i + 1));
      $('[data-l="target"]', li).setAttribute("aria-label", "Target price per unit in rupees, line " + (i + 1) + ", optional");
    });
    var filled = rows.filter(function (li) { return $('[data-l="part"]', li).value.trim(); }).length;
    linesCount.textContent = filled ? BS.plural(filled, "line") + (rows.length >= MAX_RFQ ? " · the most one request holds" : "") : "";
  }
  function setRows(items) {
    linesEl.innerHTML = "";
    if (!items.length) items = [{}];
    items.slice(0, MAX_RFQ).forEach(function (it) { addRow(it.part, it.qty, it.target); });
  }
  function getRows() {
    return $$(".qo-line", linesEl).map(function (li) {
      return { li: li, part: $('[data-l="part"]', li).value.trim(), qty: $('[data-l="qty"]', li).value.trim(), target: $('[data-l="target"]', li).value.trim() };
    });
  }
  function firstEmptyRow() {
    var rows = getRows();
    var r = rows.filter(function (x) { return !x.part && !x.qty && !x.target; })[0];
    return r ? r.li : null;
  }
  function matchHint(input) {
    var hint = $("[data-match-hint]", input.closest(".field"));
    var v = input.value.trim();
    if (!v || v.length < 3) { hint.innerHTML = ""; return; }
    var r = resolve(v);
    if (r.p && r.status === "found" && !r.ambiguous) {
      var s = BS.stock(r.p);
      hint.innerHTML = icon("check-circle") + "<span>In the catalogue: " + esc(label(r.p)) + ", " + inr(r.p.price) + " + GST. " + esc(s.short) + ".</span>";
      hint.className = "hint qo-line__match is-found";
    } else if (r.p) {
      hint.innerHTML = "<span>Several parts fit. We will confirm the exact one.</span>";
      hint.className = "hint qo-line__match";
    } else {
      hint.innerHTML = "<span>Not in the catalogue. We will source it.</span>";
      hint.className = "hint qo-line__match";
    }
  }

  $("[data-add-row]").addEventListener("click", function () { addRow("", "", "", true); });
  linesEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm-row]");
    if (!b) return;
    var li = b.closest(".qo-line");
    var next = li.nextElementSibling || li.previousElementSibling;
    li.remove();
    renumber();
    if (next) $('[data-l="part"]', next).focus();
  });
  linesEl.addEventListener("input", BS.debounce(function (e) {
    if (e.target.matches('[data-l="part"]')) matchHint(e.target);
    renumber();
  }, 200));

  // brand chips: "Any" is exclusive
  var brandBox = $("[data-brands]");
  brandBox.addEventListener("change", function (e) {
    var cb = e.target;
    if (!cb.matches('input[name="brand"]')) return;
    var all = $$('input[name="brand"]', brandBox);
    var any = all[0];
    if (cb === any && any.checked) all.slice(1).forEach(function (x) { x.checked = false; });
    else if (cb !== any && cb.checked) any.checked = false;
    if (!all.some(function (x) { return x.checked; })) any.checked = true;
  });
  function brandsChosen() { return $$('input[name="brand"]:checked', brandBox).map(function (x) { return x.value; }); }

  // attachment: show name and size, nothing is uploaded
  fileInput.addEventListener("change", function () { showAttach(); validateField(fileInput); });
  function showAttach() {
    var f = fileInput.files && fileInput.files[0];
    if (!f) { fileShow.hidden = true; fileShow.innerHTML = ""; return; }
    fileShow.hidden = false;
    fileShow.innerHTML = icon(/\.(xlsx?|csv)$/i.test(f.name) ? "file-xls" : "clipboard-text") + '<span class="qo-attach__n">' + esc(f.name) + '</span><span class="muted num">' + esc(fmtSize(f.size)) + "</span>" +
      '<button class="icon-btn" type="button" data-attach-clear aria-label="Remove ' + esc(f.name) + '">' + icon("x") + "</button>";
  }
  fileShow.addEventListener("click", function (e) {
    if (!e.target.closest("[data-attach-clear]")) return;
    fileInput.value = "";
    showAttach();
    validateField(fileInput);
    fileInput.focus();
  });
  function attachFile(file) {
    if (!file || typeof DataTransfer === "undefined") return false;
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      showAttach();
      return true;
    } catch (e) { return false; }
  }

  // GSTIN: format check and state from the first two digits
  var STATES = { "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "25": "Daman and Diu", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory" };
  var GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  var gstIn = $("#rfq-gstin"), gstHint = $("[data-gstin-hint]");
  var GST_HINT = gstHint.innerHTML;
  gstIn.addEventListener("input", function () {
    var v = gstIn.value.toUpperCase().replace(/\s+/g, "");
    if (v !== gstIn.value) { var pos = gstIn.selectionStart; gstIn.value = v; try { gstIn.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
    if (GSTIN_RE.test(v) && STATES[v.slice(0, 2)]) {
      gstHint.innerHTML = icon("check-circle") + "<span>Registered in " + esc(STATES[v.slice(0, 2)]) + ". Quote will show " + (v.slice(0, 2) === "27" ? "CGST and SGST" : "IGST") + ".</span>";
      gstHint.classList.add("is-ok");
    } else {
      gstHint.innerHTML = GST_HINT;
      gstHint.classList.remove("is-ok");
    }
  });

  function normMobile(v) {
    var d = String(v || "").replace(/[\s\-().]/g, "");
    if (/^\+?91\d{10}$/.test(d)) d = d.replace(/^\+?91/, "");
    if (/^0\d{10}$/.test(d)) d = d.slice(1);
    return d;
  }

  var RULES = {
    "rfq-pin": function (v) { return !v ? "Enter the delivery pincode." : /^[1-9]\d{5}$/.test(v) ? "" : "Enter a 6-digit pincode, for example 411019."; },
    "rfq-company": function (v) { return v.length < 2 ? "Enter your company name." : ""; },
    "rfq-name": function (v) { return v.length < 2 ? "Enter your name." : ""; },
    "rfq-email": function (v) { return !v ? "Enter your work email." : /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? "" : "Enter an email address like name@company.com."; },
    "rfq-mobile": function (v) { if (!v) return "Enter a mobile number."; var d = normMobile(v); return /^[6-9]\d{9}$/.test(d) ? "" : "Enter a 10-digit mobile number, for example 98220 45117."; },
    "rfq-gstin": function (v) {
      if (!v) return "";
      v = v.toUpperCase();
      if (!GSTIN_RE.test(v)) return "Check the GSTIN. It has 15 characters, for example 27AABCS1234F1Z5.";
      if (!STATES[v.slice(0, 2)]) return "The first two digits should be a state code, for example 27 for Maharashtra.";
      return "";
    },
    "rfq-date": function (v) { return v && v < todayISO() ? "Choose today or a later date." : ""; },
    "rfq-file": function () { var f = fileInput.files && fileInput.files[0]; return f && f.size > 20 * 1024 * 1024 ? "Choose a file under 20 MB, or send it to orders@bearingsetu.com." : ""; }
  };
  function validateField(el) {
    var rule = RULES[el.id];
    if (!rule) return "";
    var msg = rule(el.type === "file" ? "" : el.value.trim());
    setErr(el.type === "file" ? null : el, $("#" + el.id + "-err"), msg);
    if (el.type === "file") $("[data-attach]").classList.toggle("is-invalid", !!msg);
    return msg;
  }
  function rowErrors(r, needOne) {
    var pe = "", qe = "", te = "";
    var any = r.part || r.qty || r.target;
    if (any || needOne) {
      if (!r.part) pe = needOne && !any ? "Add at least one part number or description." : "Enter a part number or description.";
      if (r.part || r.qty) {
        var qn = r.qty.replace(/,/g, "");
        if (!qn) qe = "Enter a quantity.";
        else if (!/^\d{1,6}$/.test(qn) || +qn < 1) qe = "Use a whole number, 1 or more.";
      }
      if (r.target) {
        var tn = r.target.replace(/[,₹\s]/g, "");
        if (!/^\d+(\.\d{1,2})?$/.test(tn) || +tn <= 0) te = "Enter a price in rupees, like 280 or 280.50.";
      }
    }
    return { part: pe, qty: qe, target: te };
  }
  function validateRow(r, needOne) {
    var pIn = $('[data-l="part"]', r.li), qIn = $('[data-l="qty"]', r.li), tIn = $('[data-l="target"]', r.li);
    var er = rowErrors(r, needOne), pe = er.part, qe = er.qty, te = er.target;
    setErr(pIn, $("#" + pIn.id + "-err"), pe);
    setErr(qIn, $("#" + qIn.id + "-err"), qe);
    setErr(tIn, $("#" + tIn.id + "-err"), te);
    return [pe && pIn, qe && qIn, te && tIn].filter(Boolean);
  }
  function validateAll() {
    var bad = [];
    var rows = getRows();
    var filled = rows.filter(function (r) { return r.part || r.qty || r.target; });
    rows.forEach(function (r, i) { bad = bad.concat(validateRow(r, !filled.length && i === 0)); });
    ["rfq-date", "rfq-pin", "rfq-company", "rfq-name", "rfq-email", "rfq-mobile", "rfq-gstin", "rfq-file"].forEach(function (id) {
      var el = $("#" + id);
      if (validateField(el)) bad.push(el.type === "file" ? $(".qo-attach__btn") : el);
    });
    return bad;
  }
  form.addEventListener("focusout", function (e) {
    if (!submitted) return;
    // Moving to a button (Add a line, Remove, Send): an error appearing now would
    // shift that button out from under the pointer. Submit checks everything anyway.
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("button, label.qo-attach__btn, .qo-bchip, [data-attach-input]")) return;
    var el = e.target;
    if (el.matches("[data-l]")) {
      var li = el.closest(".qo-line");
      var r = getRows().filter(function (x) { return x.li === li; })[0];
      if (r) validateRow(r, false);
    } else if (RULES[el.id]) validateField(el);
    var left = $$('[aria-invalid="true"]', form).length;
    if (!left) errSum.hidden = true;
    else if (!errSum.hidden) errSum.innerHTML = icon("warning-circle") + "<span>Check " + BS.plural(left, "field") + " below.</span>";
  });
  form.addEventListener("input", function (e) {
    // clear an error as soon as the field is fixed
    var el = e.target;
    if (!submitted || el.getAttribute("aria-invalid") !== "true") return;
    if (RULES[el.id] && !RULES[el.id](el.value.trim())) validateField(el);
    else if (el.matches("[data-l]")) {
      // a part line: drop this field's message as soon as it is fixed, without adding new ones while typing
      var li = el.closest(".qo-line");
      var r = getRows().filter(function (x) { return x.li === li; })[0];
      if (r && !rowErrors(r, false)[el.getAttribute("data-l")]) setErr(el, $("#" + el.id + "-err"), "");
    }
    if (!$$('[aria-invalid="true"]', form).length) errSum.hidden = true;
  });

  var submitBtn = $("[data-rfq-submit]");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    submitted = true;
    var bad = validateAll();
    if (bad.length) {
      errSum.hidden = false;
      errSum.innerHTML = icon("warning-circle") + "<span>Check " + BS.plural(bad.length, "field") + " below.</span>";
      bad[0].focus();
      return;
    }
    errSum.hidden = true;
    submitBtn.classList.add("is-loading");
    submitBtn.setAttribute("aria-busy", "true");
    submitBtn.disabled = true;
    var data = collect();
    setTimeout(function () {
      var list = BS.store.get("rfqs", []);
      if (!Array.isArray(list)) list = [];
      list.unshift(data);
      BS.store.set("rfqs", list.slice(0, 50));
      BS.emit("rfqs", data);
      submitBtn.classList.remove("is-loading");
      submitBtn.removeAttribute("aria-busy");
      submitBtn.disabled = false;
      showDone(data);
    }, 1100);
  });

  function collect() {
    var now = new Date();
    var ref = "RFQ-" + String(now.getFullYear()).slice(2) + pad(now.getMonth() + 1) + "-" + (1000 + Math.floor(Math.random() * 9000));
    var rows = getRows().filter(function (r) { return r.part; }).map(function (r) {
      var res = resolve(r.part);
      var t = r.target.replace(/[,₹\s]/g, "");
      return { part: r.part, qty: parseInt(r.qty.replace(/,/g, ""), 10), target: t ? +t : null, id: res.p && res.status === "found" && !res.ambiguous ? res.p.id : null };
    });
    var f = fileInput.files && fileInput.files[0];
    var g = gstIn.value.trim().toUpperCase();
    return {
      ref: ref,
      date: now.toISOString(),
      status: "Awaiting reply",
      lines: rows,
      brands: brandsChosen(),
      needBy: dateIn.value || null,
      pincode: $("#rfq-pin").value.trim(),
      company: $("#rfq-company").value.trim(),
      name: $("#rfq-name").value.trim(),
      email: $("#rfq-email").value.trim(),
      mobile: normMobile($("#rfq-mobile").value),
      gstin: g || null,
      state: g ? STATES[g.slice(0, 2)] || null : null,
      notes: $("#rfq-notes").value.trim(),
      file: f ? { name: f.name, size: f.size } : null,
      source: source
    };
  }

  function showDone(d) {
    wrap.hidden = true;
    doneEl.hidden = false;
    var lines = d.lines.map(function (l) {
      return "<tr><td>" + esc(l.part) + '</td><td class="r num">' + l.qty.toLocaleString("en-IN") + '</td><td class="r num">' + (l.target ? inr(l.target) : NONE) + "</td></tr>";
    }).join("");
    doneEl.innerHTML = '<div class="qo-card qo-done__card">' +
      '<div class="qo-done__top">' +
        '<span class="qo-done__ic">' + icon("check") + "</span>" +
        '<h2 class="h2" tabindex="-1" data-done-h>Quote request sent.</h2>' +
        '<p class="qo-done__ref">Reference <span class="mono">' + esc(d.ref) + "</span></p>" +
        '<p class="lede qo-done__lede">A specialist will reply by email within 2 working hours (Monday to Saturday, 9:30 am to 7 pm).</p>' +
        '<p class="small muted">We will write to ' + esc(d.email) + ". This is a sample store, so no email is sent and nothing is uploaded.</p>" +
      "</div>" +
      '<div class="qo-done__grid">' +
        '<div><h3 class="h4">What you asked for</h3><div class="table-wrap"><table class="table"><thead><tr><th scope="col">Part</th><th scope="col" class="r">Quantity</th><th scope="col" class="r">Target</th></tr></thead><tbody>' + lines + "</tbody></table></div></div>" +
        '<div><h3 class="h4">Details</h3><dl class="qo-done__dl">' +
          dd("Brands", d.brands.join(", ")) +
          dd("Need by", d.needBy ? fmtDate(d.needBy) : "Flexible") +
          dd("Deliver to", "Pincode " + d.pincode) +
          dd("Company", d.company + (d.gstin ? " · " + d.gstin : "")) +
          dd("Contact", d.name + " · " + d.mobile.replace(/^(\d{5})(\d{5})$/, "$1 $2")) +
          (d.file ? dd("Attachment", d.file.name + ", " + fmtSize(d.file.size) + " (kept on your device)") : "") +
          (d.notes ? dd("Notes", d.notes) : "") +
        "</dl></div>" +
      "</div>" +
      '<div class="qo-done__acts">' +
        '<a class="btn btn--lg" href="account.html#quotes">See your quotes</a>' +
        '<a class="btn btn--lg btn--quiet" href="shop.html">Continue shopping</a>' +
        '<button class="textlink" type="button" data-rfq-again>Start another request</button>' +
      "</div></div>";
    var h = $("[data-done-h]", doneEl);
    selectTab("rfq", { scroll: "force" });
    if (h) h.focus({ preventScroll: true });
  }
  function dd(k, v) { return "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>"; }
  doneEl.addEventListener("click", function (e) {
    if (!e.target.closest("[data-rfq-again]")) return;
    form.reset();
    fileInput.value = "";
    showAttach();
    setRows([]);
    submitted = false;
    noteEl.hidden = true;
    gstHint.innerHTML = GST_HINT;
    gstHint.classList.remove("is-ok");
    $$("[aria-invalid]", form).forEach(function (x) { x.removeAttribute("aria-invalid"); });
    $$(".error", form).forEach(function (x) { x.textContent = ""; });
    prefillContact();
    doneEl.hidden = true;
    wrap.hidden = false;
    source = "form";
    var first = $('[data-l="part"]', linesEl);
    if (first) first.focus();
  });

  /* moving lines into the quote form */
  var source = "form";
  function linesToRows(lines) {
    return lines.map(function (l) { return { part: l.p ? label(l.p) : l.part, qty: String(l.qty) }; });
  }
  function sendToQuote(lines, from, file) {
    if (!lines.length) return;
    var rows = linesToRows(lines);
    setRows(rows);
    source = from === "your list" ? "paste" : "bom";
    var attached = file ? attachFile(file) : false;
    var extra = lines.length > MAX_RFQ ? " The first " + MAX_RFQ + " are below" + (attached ? "; the full file is attached." : ". Attach the full list as a file.") : attached ? " We attached " + esc(file.name) + " as well." : "";
    showNote("We copied " + BS.plural(Math.min(lines.length, MAX_RFQ), "line") + " from " + esc(from) + "." + extra + " Add delivery details and send.");
    selectTab("rfq", { scroll: "force" });
  }
  function quoteOne(l) {
    if (!l) return;
    var empty = firstEmptyRow();
    var part = l.p ? label(l.p) : l.part;
    if (empty) {
      $('[data-l="part"]', empty).value = part;
      $('[data-l="qty"]', empty).value = l.qty;
      matchHint($('[data-l="part"]', empty));
      renumber();
    } else addRow(part, String(l.qty), "");
    BS.toast("<strong>" + esc(part) + "</strong> added to your quote request.", { label: "Open", icon: "paper-plane-tilt", onAction: function () { selectTab("rfq", { scroll: "force" }); } });
  }
  function showNote(html) {
    noteEl.hidden = false;
    noteEl.innerHTML = icon("info") + "<span>" + html + "</span>";
  }

  function prefillContact() {
    // details from a business account application on this device, if any
    var app = BS.store.get("bizApplication", null);
    if (!app || typeof app !== "object") return;
    var set = function (id, v) { var el = $("#" + id); if (el && !el.value && v) el.value = v; };
    set("rfq-company", app.company);
    set("rfq-name", app.name);
    set("rfq-email", app.email);
    set("rfq-mobile", app.mobile);
    set("rfq-gstin", app.gstin);
    if (gstIn.value) gstIn.dispatchEvent(new Event("input"));
  }

  /* The floating "Talk to a specialist" button sits bottom right. Over the order tools it
     would cover prices, remove buttons and form fields (on phones it sits on the amount
     column), so it steps aside while it overlaps a tool card and comes back below them.
     The same help is in the quote form and in "Ask a specialist" further down. */
  var help = $("[data-help-float]"), helpOff = false, helpRaf = 0;
  if (help) help.classList.add("qo-float");
  function placeHelp() {
    helpRaf = 0;
    if (!help) return;
    var hb = help.getBoundingClientRect();
    if (!hb.width) return;
    var off = $$(".qo-work .qo-card").some(function (el) {
      if (!el.offsetParent) return false;
      var r = el.getBoundingClientRect();
      return r.right > hb.left && r.left < hb.right && r.top < hb.bottom + 8 && r.bottom > hb.top - 8;
    });
    if (off !== helpOff) {
      helpOff = off;
      help.classList.toggle("is-off", off);
      if (off) help.setAttribute("tabindex", "-1"); else help.removeAttribute("tabindex");
      if (off) help.setAttribute("aria-hidden", "true"); else help.removeAttribute("aria-hidden");
    }
  }
  function queueHelp() { if (!helpRaf) helpRaf = requestAnimationFrame(placeHelp); }
  window.addEventListener("scroll", queueHelp, { passive: true });
  window.addEventListener("resize", queueHelp);
  BS.on("qo-layout", queueHelp);

  /* -------------------------------------------------------------- start up */
  function prefillFromURL() {
    var q = BS.params();
    var items = [];
    // A product id, or a part number that only one product in the catalogue carries, becomes "Brand PN".
    function partFor(token) {
      var t = String(token || "").replace(/\s+/g, " ").trim().slice(0, 120);
      var p = BS.byId(t);
      if (p) return label(p);
      var n = BS.norm(t);
      var same = n ? BS.products.filter(function (x) { return BS.norm(x.pn) === n; }) : [];
      return same.length === 1 ? label(same[0]) : t;
    }
    function qtyFor(v) { var n = parseInt(v, 10); return String(n > 0 ? Math.min(n, 99999) : 1); }
    if (q.get("lines")) {
      q.get("lines").split(",").forEach(function (tok) {
        tok = tok.trim();
        var i = tok.lastIndexOf(":");
        var pn = (i > -1 ? tok.slice(0, i) : tok).trim();
        if (!pn) return;
        items.push({ part: partFor(pn), qty: qtyFor(i > -1 ? tok.slice(i + 1) : 1) });
      });
    }
    if (q.get("pn") && q.get("pn").trim()) items.push({ part: partFor(q.get("pn")), qty: qtyFor(q.get("qty")) });
    // the shop sends what was searched for when nothing matched
    if (!items.length && q.get("q") && q.get("q").trim()) items.push({ part: q.get("q").replace(/\s+/g, " ").trim().slice(0, 120), qty: "" });
    var sizeAdded = false;
    if (q.get("size")) {
      var s = BS.parseSize(q.get("size").replace(/[^0-9.x×*]/gi, " ").replace(/\s+/g, "x"));
      if (s) {
        sizeAdded = true;
        var dims = [s.d, s.D, s.B].filter(function (x) { return x != null; });
        items.push({ part: "Bearing, " + dims.join(" × ") + " mm (" + (dims.length === 3 ? "bore × outer × width" : "bore × outer") + ")", qty: "" });
      }
    }
    if (!items.length) return false;
    setRows(items);
    var fromPn = !!(q.get("pn") && q.get("pn").trim());
    var fromLines = !fromPn && !sizeAdded && !!q.get("lines");
    var fromSearch = !fromPn && !sizeAdded && !fromLines;
    source = fromLines ? "cart" : sizeAdded ? "size-finder" : fromSearch ? "search" : "product";
    showNote(fromLines ? "We copied " + BS.plural(items.length, "line") + " from your bag. Check the quantities, then add delivery details." :
      sizeAdded ? "We added the size you searched for. Add how many you need and any brand preference." :
      fromSearch ? "We added what you searched for. Add how many you need, and a drawing or photo if you have one." :
      "We added the part you were looking at. Check the quantity, then add delivery details.");
    getRows().forEach(function (r) { if (!r.qty) $('[data-l="qty"]', r.li).placeholder = "How many?"; });
    return true;
  }

  // Paste tab: restore the saved draft
  ta.value = typeof draft.text === "string" ? draft.text : "";
  parsePaste();

  // RFQ tab
  var fromURL = prefillFromURL();
  if (!fromURL) setRows([]);
  prefillContact();

  var startHash = location.hash.slice(1);
  if (TABS.indexOf(startHash) !== -1) selectTab(startHash, { hash: false });
  else if (fromURL) selectTab("rfq");
  else selectTab("paste", { hash: false });

  queueHelp();
  BS.reveal();
})();
