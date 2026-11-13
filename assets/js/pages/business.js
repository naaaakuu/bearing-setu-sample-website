/* Business account page: tier demo, credit guide, volume calculator, application form */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, inr = BS.inr, icon = BS.icon;
  var doc = document;

  function round2(n) { return Math.round(n * 100) / 100; }
  function brandName(p) { return BS.brand(p.brand).name.replace(/\s*\(.*\)$/, ""); }
  function label(p) { return brandName(p) + " " + p.pn; }
  function pct(n) { return Math.round(n * 100) + "%"; }
  // Quantity bands from a product's tiers: [[from, to, price], ...]
  function bands(p) {
    var t = p.tiers || [];
    var out = [[1, t.length ? t[0][0] - 1 : null, p.price]];
    t.forEach(function (x, i) { out.push([x[0], t[i + 1] ? t[i + 1][0] - 1 : null, x[1]]); });
    return out;
  }
  function bandLabel(b) { return b[1] == null ? b[0] + "+" : b[0] === b[1] ? String(b[0]) : b[0] + " to " + b[1]; }

  /* --------------------------------------------------------- hero CTA */
  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  $$("[data-scroll-apply]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var target = $("#apply");
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: BS.reduceMotion ? "auto" : "smooth", block: "start" });
      try { history.replaceState(null, "", "#apply"); } catch (err) { /* ignore */ }
      if (!coarse) setTimeout(function () { var f = $("#ba-company"); if (f && !$("[data-apply-form]").hidden) f.focus({ preventScroll: true }); }, BS.reduceMotion ? 0 : 650);
    });
  });

  /* ------------------------------------------------ tier pricing tile */
  var tierP = BS.byId("skf-6205-2rs1") || BS.products.filter(function (p) { return (p.tiers || []).length >= 3; })[0];
  var tierBox = $("[data-tier-demo]");
  if (tierP && tierBox) {
    var bs = bands(tierP);
    tierBox.innerHTML =
      '<div class="bz-tiers__prod"><span class="bz-tiers__img">' + BS.imgTag(tierP.img, { alt: "", sizes: "64px" }) + "</span>" +
        '<div><p class="bz-tiers__b">' + esc(brandName(tierP)) + '</p><p class="bz-tiers__pn"><a href="' + BS.url(tierP) + '">' + esc(tierP.pn) + "</a></p>" +
        '<p class="bz-tiers__s">' + BS.subtitle(tierP) + "</p></div></div>" +
      '<table class="bz-tiers__t"><caption class="sr-only">Tier prices for ' + esc(label(tierP)) + ", excluding GST</caption>" +
        '<thead><tr><th scope="col">Quantity</th><th scope="col" class="r">Price per ' + esc(BS.unitLabel(tierP)) + '</th><th scope="col" class="r">You save</th></tr></thead><tbody>' +
        bs.map(function (b, i) {
          var save = 1 - b[2] / tierP.price;
          return "<tr" + (i === bs.length - 1 ? ' class="is-best"' : "") + '><td class="num">' + esc(bandLabel(b)) + '</td><td class="r num"><strong>' + inr(b[2]) + '</strong></td><td class="r num">' + (i ? pct(save) : '<span class="muted">List price</span>') + "</td></tr>";
        }).join("") +
      "</tbody></table>" +
      '<p class="bz-tiers__note">Live catalogue prices, excluding GST.</p>';
  }

  /* --------------------------------------------- saved list tile (real reorder) */
  var LIST = [["skf-6205-2rs1", 24], ["nsk-608zz", 60], ["ina-hk2016", 40], ["fenner-a33", 12], ["skf-lgmt-2-1kg", 6]];
  var listBox = $("[data-list-demo]");
  if (listBox) {
    var items = LIST.map(function (x) { var p = BS.byId(x[0]); return p ? { p: p, qty: x[1] } : null; }).filter(Boolean);
    var tot = items.reduce(function (s, it) { return s + BS.unitPrice(it.p, it.qty) * it.qty; }, 0);
    listBox.innerHTML =
      '<div class="bz-list__head"><div><p class="bz-list__t">Ring frame, monthly kit</p><p class="bz-list__s">' + BS.plural(items.length, "part") + " · last ordered 14 Oct</p></div>" +
        '<span class="bz-list__tot num">' + inr(round2(tot)) + "<small>+ GST</small></span></div>" +
      '<ul class="bz-list__rows">' + items.map(function (it) {
        return '<li><span class="bz-list__img">' + BS.imgTag(it.p.img, { alt: "", sizes: "36px" }) + '</span><span class="bz-list__pn">' + esc(label(it.p)) + '</span><span class="bz-list__q num">× ' + it.qty + "</span></li>";
      }).join("") + "</ul>" +
      '<button class="btn btn--sm bz-list__btn" type="button" data-reorder>' + icon("arrows-clockwise") + "Reorder all " + items.length + "</button>";
    $("[data-reorder]", listBox).addEventListener("click", function () {
      var btn = this;
      if (btn.classList.contains("is-done")) return;
      items.forEach(function (it) { BS.cart.add(it.p.id, it.qty); });
      var img = $(".bz-list__img img", listBox);
      if (img) BS.flyToBag(img);
      BS.toast("Ring frame, monthly kit: " + esc(BS.plural(items.length, "part")) + " added to your bag.", { label: "View bag", onAction: BS.openCart });
      btn.innerHTML = icon("check") + "Added to bag";
      btn.classList.add("is-done");
      setTimeout(function () { btn.innerHTML = icon("arrows-clockwise") + "Reorder all " + items.length; btn.classList.remove("is-done"); }, 1800);
    });
  }

  /* -------------------------------------------------- credit guide */
  var seg = $("[data-turnover]");
  var fill = $("[data-gauge-fill]");
  var gVal = $("[data-gauge-val]");
  var gLive = $("[data-gauge-live]");
  var shown = 200000, anim = 0, userPicked = false;
  function setLimit(btn, focus) {
    var radios = $$("[role=radio]", seg);
    radios.forEach(function (r) { var on = r === btn; r.setAttribute("aria-checked", on ? "true" : "false"); r.tabIndex = on ? 0 : -1; });
    if (focus) btn.focus();
    var to = +btn.getAttribute("data-limit");
    fill.style.strokeDasharray = Math.max(3, (to - 50000) / 950000 * 100).toFixed(1) + " 100";
    cancelAnimationFrame(anim);
    var from = shown, t0 = performance.now(), dur = BS.reduceMotion ? 0 : 700;
    (function tick(now) {
      var k = dur ? Math.min(1, (now - t0) / dur) : 1;
      var e = 1 - Math.pow(1 - k, 3);
      shown = Math.round(from + (to - from) * e);
      gVal.textContent = k < 1 ? inr(Math.round(shown / 1000) * 1000) : inr(to);
      if (k < 1) anim = requestAnimationFrame(tick);
      else { shown = to; if (gLive && userPicked) gLive.textContent = "Typical starting limit " + inr(to) + "."; }
    })(t0);
  }
  if (seg) {
    var radios = $$("[role=radio]", seg);
    radios.forEach(function (r, i) {
      r.addEventListener("click", function () { userPicked = true; setLimit(r); });
      r.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % radios.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + radios.length) % radios.length;
        else if (e.key === "Home") n = 0;
        else if (e.key === "End") n = radios.length - 1;
        if (n == null) return;
        e.preventDefault();
        userPicked = true; setLimit(radios[n], true);
      });
    });
    // fill the gauge when it scrolls into view
    var start = $('[role=radio][aria-checked="true"]', seg);
    fill.style.strokeDasharray = "0 100";
    if ("IntersectionObserver" in window && !BS.reduceMotion) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { io.disconnect(); setTimeout(function () { setLimit($('[role=radio][aria-checked="true"]', seg)); }, 250); }
      }, { threshold: 0.4 });
      io.observe(fill.closest("svg"));
    } else setLimit(start);
  }

  /* -------------------------------------------- volume calculator */
  var PICKS = ["skf-6205-2rs1", "ntn-ucp205d1", "fenner-a33", "nok-tc-25x52x7", "skf-lgmt-2-1kg", "skf-22210-e"]
    .map(BS.byId).filter(function (p) { return p && (p.tiers || []).length; });
  var sel = $("[data-vol-part]"), range = $("[data-vol-qty]"), out = $("[data-vol-out]");
  var prodBox = $("[data-vol-prod]"), resBox = $("[data-vol-result]"), ticks = $("[data-vol-ticks]");
  var cur = null;
  var volLive = $("[data-vol-live]"), volReady = false;
  var speak = BS.debounce(function (t) { if (volLive && volReady) volLive.textContent = t; }, 450);

  sel.innerHTML = PICKS.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(label(p) + " · " + p.title.replace(/,.*$/, "")) + "</option>"; }).join("");

  function setProduct(id) {
    cur = BS.byId(id) || PICKS[0];
    var s = BS.stock(cur);
    prodBox.innerHTML = '<a class="bz-calc__img" href="' + BS.url(cur) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(cur.img, { alt: "", sizes: "88px" }) + "</a>" +
      '<div class="bz-calc__pt"><p class="bz-calc__b">' + esc(brandName(cur)) + '</p><p class="bz-calc__pn"><a href="' + BS.url(cur) + '">' + esc(cur.pn) + "</a></p>" +
      '<p class="bz-calc__s">' + BS.subtitle(cur) + '</p><p class="' + s.cls + '">' + esc(s.text) + "</p></div>";
    var breaks = (cur.tiers || []).filter(function (t) { return t[0] <= 500; });
    ticks.innerHTML = breaks.map(function (t) { return '<span style="--p:' + ((t[0] - 1) / 499).toFixed(4) + '"></span>'; }).join("");
    jump.innerHTML = '<span class="small muted">Price breaks</span>' + [[1, cur.price]].concat(breaks).map(function (t) {
      return '<button class="chip" type="button" data-jump="' + t[0] + '" aria-pressed="false">' + t[0] + (t[0] > 1 ? "+" : "") + "</button>";
    }).join("");
    update();
  }
  var jump = $("[data-vol-jump]");
  jump.addEventListener("click", function (e) {
    var b = e.target.closest("[data-jump]");
    if (!b) return;
    range.value = b.getAttribute("data-jump");
    volReady = true;
    update();
  });

  function update() {
    var p = cur;
    var qty = Math.max(1, Math.min(500, parseInt(range.value, 10) || 1));
    var u = BS.unitLabel(p);
    var unitWord = qty === 1 ? u : u === "pc" ? "pcs" : u + (/[sx]$/.test(u) ? "es" : "s");
    out.textContent = qty.toLocaleString("en-IN") + " " + unitWord;
    range.setAttribute("aria-valuetext", qty + " " + unitWord);
    range.style.setProperty("--fill", ((qty - 1) / 499 * 100).toFixed(2) + "%");
    var unit = BS.unitPrice(p, qty);
    var total = round2(unit * qty);
    var base = p.price * qty;
    var save = round2(base - total);
    var nt = BS.nextTier(p, qty);
    var bs = bands(p);
    var curBand = 0;
    bs.forEach(function (b, i) { if (qty >= b[0]) curBand = i; });
    var bill = Math.max(qty, p.moq || 1);
    $$("[data-jump]", jump).forEach(function (b, i) { b.setAttribute("aria-pressed", i === curBand ? "true" : "false"); });
    speak(qty.toLocaleString("en-IN") + " " + unitWord + ": " + inr(unit) + " each, " + inr(total) + " before GST" + (save > 0 ? ", saving " + inr(save) : "") + ".");
    resBox.innerHTML =
      '<div class="bz-calc__big">' +
        '<div><p class="bz-calc__l">Unit price</p><p class="bz-calc__unit num">' + inr(unit) + "<small> / " + esc(u) + "</small></p>" +
        '<p class="bz-calc__band">' + (curBand ? '<span class="badge badge--blue">Tier ' + esc(bandLabel(bs[curBand])) + "</span>" : '<span class="badge">List price</span>') + "</p></div>" +
        '<dl class="bz-calc__nums">' +
          '<div><dt>Total ex GST</dt><dd class="num">' + inr(total) + "</dd></div>" +
          '<div><dt>Incl. 18% GST</dt><dd class="num">' + inr(BS.withGst(total)) + "</dd></div>" +
          '<div class="is-save"><dt>Saving vs single-piece price</dt><dd class="num">' + (save > 0 ? inr(save) + " <small>(" + pct(save / base) + ")</small>" : "₹0") + "</dd></div>" +
        "</dl>" +
      "</div>" +
      '<ol class="bz-ladder" aria-label="Price per tier">' + bs.map(function (b, i) {
        var w = Math.max(8, b[2] / p.price * 100);
        return '<li class="' + (i === curBand ? "is-on" : i < curBand ? "is-past" : "") + '"' + (i === curBand ? ' aria-current="true"' : "") + '>' +
          '<span class="bz-ladder__q num">' + esc(bandLabel(b)) + "</span>" +
          '<span class="bz-ladder__bar"><span style="width:' + w.toFixed(1) + '%"></span></span>' +
          '<span class="bz-ladder__p num">' + inr(b[2]) + "</span>" +
          '<span class="bz-ladder__s num">' + (i ? "−" + pct(1 - b[2] / p.price) : "") + "</span></li>";
      }).join("") + "</ol>" +
      '<p class="bz-calc__next">' + (nt ? "Add " + (nt.qty - qty).toLocaleString("en-IN") + " more to pay <strong>" + inr(nt.price) + "</strong> each." : "You are on the best tier for this part. For more than " + (BS.bestTier(p) ? BS.bestTier(p).qty : 500) + ", ask for a quote.") +
        (p.moq > 1 && qty < p.moq ? " Sold in packs of " + p.moq + ", so we round up to " + p.moq + "." : "") + "</p>" +
      '<div class="bz-calc__acts"><button class="btn" type="button" data-vol-add>Add ' + bill.toLocaleString("en-IN") + " to bag</button>" +
        '<a class="more" href="quick-order.html?pn=' + encodeURIComponent(p.id) + "&qty=" + qty + '#rfq">Need more? Get a quote</a></div>';
  }

  sel.addEventListener("change", function () { volReady = true; setProduct(sel.value); });
  range.addEventListener("input", function () { volReady = true; update(); });
  resBox.addEventListener("click", function (e) {
    if (!e.target.closest("[data-vol-add]")) return;
    var qty = Math.max(1, parseInt(range.value, 10) || 1);
    BS.addToBag(cur.id, qty, $(".bz-calc__img img", prodBox));
  });
  if (PICKS.length) setProduct(PICKS[0].id);
  else { var calcSec = $("#volume"); if (calcSec) calcSec.hidden = true; }

  /* -------------------------------------------- application form */
  var STATES = { "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "25": "Daman and Diu", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory" };
  var GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  var form = $("[data-apply-form]");
  var done = $("[data-apply-done]");
  var errSum = $("[data-errsum]");
  var gst = $("#ba-gstin"), gstHint = $("[data-gst-hint]");
  var GST_HINT = gstHint.innerHTML;
  var creditSw = $("[data-credit-switch]"), creditNote = $("[data-credit-note]");
  var submitBtn = $("[data-apply-submit]");
  var submitted = false;

  function normMobile(v) {
    var d = String(v || "").replace(/[\s\-().]/g, "");
    if (/^\+?91\d{10}$/.test(d)) d = d.replace(/^\+?91/, "");
    if (/^0\d{10}$/.test(d)) d = d.slice(1);
    return d;
  }
  function gstInfo(v) {
    v = String(v || "").toUpperCase();
    if (!GSTIN_RE.test(v) || !STATES[v.slice(0, 2)]) return null;
    return { state: STATES[v.slice(0, 2)], code: v.slice(0, 2), pan: v.slice(2, 12) };
  }

  gst.addEventListener("input", function () {
    var v = gst.value.toUpperCase().replace(/\s+/g, "");
    if (v !== gst.value) { var pos = gst.selectionStart; gst.value = v; try { gst.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
    var info = gstInfo(v);
    if (info) {
      gstHint.innerHTML = icon("check-circle") + "<span>Registered in <strong>" + esc(info.state) + "</strong> (state code " + info.code + ") · PAN " + esc(info.pan) + "</span>";
      gstHint.classList.add("is-ok");
    } else {
      gstHint.innerHTML = GST_HINT;
      gstHint.classList.remove("is-ok");
    }
  });

  creditSw.addEventListener("change", function () {
    creditNote.hidden = !creditSw.checked;
  });

  var RULES = {
    "ba-company": function (v) { return v.length < 2 ? "Enter your company name as registered for GST." : ""; },
    "ba-gstin": function (v) {
      v = v.toUpperCase();
      if (!v) return "Enter your GSTIN.";
      if (v.length !== 15) return "A GSTIN has 15 characters. You have entered " + v.length + ".";
      if (!GSTIN_RE.test(v)) return "Check the GSTIN. It should look like 27AABCS1234F1Z5.";
      if (!STATES[v.slice(0, 2)]) return "The first two digits should be a state code, for example 27 for Maharashtra.";
      return "";
    },
    "ba-name": function (v) { return v.length < 2 ? "Enter the name of the person we should contact." : ""; },
    "ba-email": function (v) { return !v ? "Enter a work email." : /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? "" : "Enter an email address like name@company.com."; },
    "ba-mobile": function (v) { if (!v) return "Enter a mobile number."; return /^[6-9]\d{9}$/.test(normMobile(v)) ? "" : "Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9."; },
    "ba-city": function (v) { return v.length < 2 ? "Enter the city of your plant or office." : ""; },
    "ba-spend": function (v) { return v ? "" : "Choose your monthly spend."; },
    "ba-industry": function (v) { return v ? "" : "Choose your industry."; },
    "ba-consent": function () { return $("#ba-consent").checked ? "" : "Confirm you can open an account for this business."; }
  };
  function validate(el) {
    var rule = RULES[el.id];
    if (!rule) return "";
    var msg = rule(el.type === "checkbox" ? "" : el.value.trim());
    var err = $("#" + el.id + "-err");
    if (err) err.textContent = msg;
    if (msg) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    return msg;
  }
  function validateAll() {
    return Object.keys(RULES).map(function (id) { return $("#" + id); }).filter(function (el) { return validate(el); });
  }
  function updateSummary() {
    var n = $$('[aria-invalid="true"]', form).length;
    if (!n) errSum.hidden = true;
    else if (!errSum.hidden) errSum.innerHTML = icon("warning-circle") + "<span>Check " + BS.plural(n, "field") + " below.</span>";
  }
  form.addEventListener("focusout", function (e) {
    if (!submitted) return;
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("button")) return;
    if (RULES[e.target.id]) { validate(e.target); updateSummary(); }
  });
  form.addEventListener("change", function (e) {
    if (submitted && (e.target.tagName === "SELECT" || e.target.type === "checkbox") && RULES[e.target.id]) { validate(e.target); updateSummary(); }
  });
  form.addEventListener("input", function (e) {
    var el = e.target;
    if (submitted && el.getAttribute("aria-invalid") === "true" && RULES[el.id] && !RULES[el.id](el.value.trim())) { validate(el); updateSummary(); }
  });

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
    var g = gst.value.trim().toUpperCase();
    var info = gstInfo(g);
    var data = {
      ref: "BA-" + (1000 + Math.floor(Math.random() * 9000)),
      date: new Date().toISOString(),
      status: "Under review",
      company: $("#ba-company").value.trim(),
      gstin: g,
      state: info.state,
      pan: info.pan,
      name: $("#ba-name").value.trim(),
      email: $("#ba-email").value.trim(),
      mobile: normMobile($("#ba-mobile").value),
      city: $("#ba-city").value.trim(),
      spend: $("#ba-spend").value,
      industry: $("#ba-industry").value,
      credit: creditSw.checked
    };
    setTimeout(function () {
      BS.store.set("bizApplication", data);
      BS.emit("bizApplication", data);
      submitBtn.classList.remove("is-loading");
      submitBtn.removeAttribute("aria-busy");
      submitBtn.disabled = false;
      showDone(data);
    }, 1100);
  });

  function row(k, v) { return "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>"; }
  function showDone(d) {
    form.hidden = true;
    $("[data-prev]").hidden = true;
    done.hidden = false;
    var first = d.name.split(/\s+/)[0];
    done.innerHTML =
      '<div class="bz-done__top"><span class="bz-done__ic">' + icon("check") + "</span>" +
      '<h3 class="h3" tabindex="-1" data-done-h>Application ' + esc(d.ref) + " received.</h3>" +
      '<p class="bz-done__lede">We verify GSTIN details within one working day.</p></div>' +
      '<ol class="bz-done__next">' +
        "<li><strong>Today</strong><span>We check " + esc(d.gstin) + " against the GST register and email " + esc(first) + " at " + esc(d.email) + ".</span></li>" +
        "<li><strong>Within one working day</strong><span>Tier prices switch on for everyone you add to the account.</span></li>" +
        (d.credit ? "<li><strong>For credit</strong><span>We ask for GST returns, the business PAN and two trade references, then set your limit.</span></li>" : "") +
      "</ol>" +
      '<dl class="bz-done__dl">' + row("Company", d.company) + row("Registered in", d.state + " · PAN " + d.pan) + row("Contact", d.name + " · " + d.mobile.replace(/^(\d{5})(\d{5})$/, "$1 $2")) +
        row("City", d.city) + row("Industry", d.industry) + row("Monthly spend", d.spend) + row("30-day credit", d.credit ? "Requested" : "Not requested") + "</dl>" +
      '<p class="small muted">Sample store: this application is saved in this browser only.</p>' +
      '<div class="bz-done__acts"><a class="btn" href="shop.html">Shop parts</a><a class="btn btn--quiet" href="quick-order.html">Try quick order</a></div>' +
      '<button class="textlink small bz-done__again" type="button" data-apply-again>Edit or send a new application</button>';
    var h = $("[data-done-h]", done);
    // one column: bring the confirmation itself into view, not the section heading above it
    var target = window.matchMedia("(max-width: 834px)").matches ? done : $("#apply");
    var top = target.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.5) target.scrollIntoView({ behavior: BS.reduceMotion ? "auto" : "smooth", block: "start" });
    if (h) h.focus({ preventScroll: true });
  }
  done.addEventListener("click", function (e) {
    if (!e.target.closest("[data-apply-again]")) return;
    done.hidden = true;
    form.hidden = false;
    var f = $("#ba-company");
    if (f) f.focus();
  });

  // an application already saved on this device
  var prev = BS.store.get("bizApplication", null);
  if (prev && typeof prev === "object" && prev.ref) {
    var pv = $("[data-prev]");
    var when = "";
    var pd = new Date(prev.date);
    if (!isNaN(pd.getTime())) when = pd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    pv.hidden = false;
    pv.innerHTML = icon("check-circle") + "<span>You applied for <strong>" + esc(typeof prev.company === "string" && prev.company ? prev.company : "your business") + "</strong>" + (when ? " on " + esc(when) : "") + ", reference " + esc(prev.ref) + ". It is " + esc((typeof prev.status === "string" && prev.status ? prev.status : "under review").toLowerCase()) + ". You can update the details below.</span>";
    ["company", "gstin", "name", "email", "mobile", "city"].forEach(function (k) {
      var el = $("#ba-" + k);
      if (el && prev[k] && typeof prev[k] !== "object") el.value = String(prev[k]);
    });
    if (prev.spend) { $("#ba-spend").value = String(prev.spend); if (!$("#ba-spend").value) $("#ba-spend").value = ""; }
    if (prev.industry) { $("#ba-industry").value = String(prev.industry); if (!$("#ba-industry").value) $("#ba-industry").value = ""; }
    if (prev.credit) { creditSw.checked = true; creditNote.hidden = false; }
    gst.dispatchEvent(new Event("input"));
  }

  /* The floating "Talk to a specialist" button steps aside over the calculator and the application
     form through the shared float logic in site.js: both carry data-float-avoid in the markup. */

  BS.reveal();
})();
