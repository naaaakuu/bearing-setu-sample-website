/* Checkout: contact, delivery and payment steps, a live order summary with
   the CGST/SGST or IGST split, and the confirmation view with a GST invoice.
   Uses BS.bag from cart.js (loaded first). Sample store: nothing is charged. */
(function () {
  "use strict";
  var BS = window.BS, bag = BS.bag, $ = BS.$, $$ = BS.$$, esc = BS.esc, inr = BS.inr, icon = BS.icon;
  var doc = document;
  var root = $("[data-co]");
  if (!root || !bag) return;

  /* ------------------------------------------------ states and GST codes */
  var STATES = [["Andhra Pradesh", "37"], ["Arunachal Pradesh", "12"], ["Assam", "18"], ["Bihar", "10"], ["Chhattisgarh", "22"], ["Goa", "30"], ["Gujarat", "24"], ["Haryana", "06"], ["Himachal Pradesh", "02"], ["Jharkhand", "20"], ["Karnataka", "29"], ["Kerala", "32"], ["Madhya Pradesh", "23"], ["Maharashtra", "27"], ["Manipur", "14"], ["Meghalaya", "17"], ["Mizoram", "15"], ["Nagaland", "13"], ["Odisha", "21"], ["Punjab", "03"], ["Rajasthan", "08"], ["Sikkim", "11"], ["Tamil Nadu", "33"], ["Telangana", "36"], ["Tripura", "16"], ["Uttar Pradesh", "09"], ["Uttarakhand", "05"], ["West Bengal", "19"]];
  var UTS = [["Andaman and Nicobar Islands", "35"], ["Chandigarh", "04"], ["Dadra and Nagar Haveli and Daman and Diu", "26"], ["Delhi", "07"], ["Jammu and Kashmir", "01"], ["Ladakh", "38"], ["Lakshadweep", "31"], ["Puducherry", "34"]];
  var BY_CODE = {}, CODE_OF = {};
  STATES.concat(UTS).forEach(function (s) { BY_CODE[s[1]] = s[0]; CODE_OF[s[0]] = s[1]; });
  BY_CODE["25"] = "Dadra and Nagar Haveli and Daman and Diu";
  BY_CODE["28"] = "Andhra Pradesh";
  BY_CODE["97"] = "Other Territory";
  var GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  var CITY = { "110": "New Delhi", "141": "Ludhiana", "302": "Jaipur", "380": "Ahmedabad", "395": "Surat", "400": "Mumbai", "411": "Pune", "412": "Pune", "416": "Kolhapur", "422": "Nashik", "431": "Chhatrapati Sambhajinagar", "440": "Nagpur", "452": "Indore", "500": "Hyderabad", "530": "Visakhapatnam", "560": "Bengaluru", "600": "Chennai", "638": "Erode", "641": "Coimbatore", "682": "Kochi", "700": "Kolkata" };
  function stateFromPin(pin) {
    var p2 = +pin.slice(0, 2), p3 = pin.slice(0, 3);
    if (p3 === "403") return "Goa";
    if (p3 === "737") return "Sikkim";
    if (p3 === "744") return "Andaman and Nicobar Islands";
    if (p2 >= 40 && p2 <= 44) return "Maharashtra";
    if (p3 === "110") return "Delhi";
    if (p2 >= 56 && p2 <= 59) return "Karnataka";
    if (p2 >= 60 && p2 <= 64 && p3 !== "605") return "Tamil Nadu";
    if (p2 >= 67 && p2 <= 69 && p3 !== "682") return "Kerala";
    if (p3 === "682") return "Kerala";
    if (p2 === 50) return "Telangana";
    if (p2 >= 51 && p2 <= 53) return "Andhra Pradesh";
    if (+p3 >= 380 && +p3 <= 395) return "Gujarat";
    if (p2 >= 30 && p2 <= 34) return "Rajasthan";
    if (p2 >= 45 && p2 <= 48) return "Madhya Pradesh";
    if (p2 === 49) return "Chhattisgarh";
    if (+p3 >= 700 && +p3 <= 736) return "West Bengal";
    if (p2 >= 75 && p2 <= 77) return "Odisha";
    return "";
  }

  /* ------------------------------------------------------------ elements */
  var STEPS = ["contact", "delivery", "payment"];
  var CREDIT = { limit: 200000, used: 53680, avail: 146320 };
  var PAY = { upi: "UPI", card: "Card or netbanking", credit: "30-day credit", neft: "Bank transfer (NEFT/RTGS)" };
  var els = {
    top: $("[data-co-top]"), flow: $("[data-co-flow]"), empty: $("[data-co-empty]"), done: $("[data-co-done]"),
    sum: $("[data-co-sum]"), lines: $("[data-sum-lines]"), rows: $("[data-sum-rows]"), cpn: $("[data-sum-coupon]"), pos: $("[data-sum-pos]"),
    toggle: $("[data-sum-toggle]"), toggleLabel: $("[data-sum-toggle-label]"), totalM: $("[data-sum-total-m]"),
    place: $("[data-place]"), placeTotal: $("[data-place-total]"), live: $("[data-co-live]"),
    state: $("#co-state"), pin: $("#co-pin"), city: $("#co-city"), gstin: $("#co-gstin"), biz: $("#co-biz"), mobile: $("#co-mobile")
  };
  function F(name) { return $('[data-f="' + name + '"]'); }
  function sec(step) { return $('[data-cstep="' + step + '"]'); }
  function body(step) { return $('[data-step-form="' + step + '"]'); }

  // State select
  function opts(list) { return list.map(function (s) { return '<option value="' + esc(s[0]) + '">' + esc(s[0]) + "</option>"; }).join(""); }
  els.state.insertAdjacentHTML("beforeend", '<optgroup label="States">' + opts(STATES) + '</optgroup><optgroup label="Union territories">' + opts(UTS) + "</optgroup>");

  var S = { step: "contact", done: { contact: false, delivery: false }, tried: {}, upiMode: "id", placed: null, coupon: { value: "", error: "" } };

  /* ---------------------------------------------------------------- data */
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function mobileOf(raw) {
    var d = digits(raw);
    if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
    return d;
  }
  function v(name) { var el = F(name); return el ? String(el.value || "").trim() : ""; }
  function data() {
    var ship = $('input[name="ship"]:checked'), pay = $('input[name="pay"]:checked');
    return {
      email: v("email"), mobile: mobileOf(v("mobile")), business: els.biz.checked,
      company: v("company"), gstin: v("gstin").toUpperCase().replace(/\s+/g, ""), po: v("po"),
      name: v("name"), line1: v("line1"), line2: v("line2"), city: v("city"), state: els.state.value, pincode: digits(v("pincode")),
      ship: ship ? ship.value : "standard", pay: pay ? pay.value : "", upi: v("upi"), upiMode: S.upiMode, terms: F("terms").checked
    };
  }
  function fmtMobile(m) { return m.length === 10 ? m.slice(0, 5) + " " + m.slice(5) : m; }
  function gstinState(g) { return g && g.length >= 2 ? BY_CODE[g.slice(0, 2)] || "" : ""; }
  function totals(d) { d = d || data(); return bag.totals({ delivery: d.ship, state: d.state }); }

  /* ---------------------------------------------------------- validation */
  var RULES = { contact: ["email", "mobile", "company", "gstin"], delivery: ["name", "line1", "pincode", "city", "state"], payment: ["pay", "upi", "terms"] };
  function credit(d, t) {
    if (!d.business) return { ok: false, why: "For business purchases. Turn on ‘This is a business purchase’ and add your GSTIN." };
    if (!GSTIN_RE.test(d.gstin) || !BY_CODE[d.gstin.slice(0, 2)]) return { ok: false, why: "Add a valid GSTIN in Contact to pay on credit." };
    if (t.total > CREDIT.avail) return { ok: false, why: "This order is more than your available credit of " + inr(CREDIT.avail) + "." };
    return { ok: true, why: "Sample limit " + inr(CREDIT.limit) + ". Available " + inr(CREDIT.avail) + "." };
  }
  function check(name, d) {
    var x = d[name];
    switch (name) {
      case "email":
        if (!x) return "Enter your email address.";
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x) ? "" : "Enter an email address like name@company.in.";
      case "mobile":
        if (!x) return "Enter your 10-digit mobile number.";
        return /^[6-9]\d{9}$/.test(x) ? "" : "Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.";
      case "company":
        return d.business && x.length < 2 ? "Enter the company name for the invoice." : "";
      case "gstin":
        if (!d.business) return "";
        if (!x) return "Enter your 15-character GSTIN.";
        if (x.length !== 15) return "A GSTIN has 15 characters. This one has " + x.length + ".";
        if (!BY_CODE[x.slice(0, 2)]) return "The first two digits should be a state code, for example 27 for Maharashtra.";
        return GSTIN_RE.test(x) ? "" : "That doesn’t match the GSTIN format: 2 digits, 10-character PAN, then 3 characters, like 27AAPFU0939F1ZV.";
      case "name":
        return x.length < 2 ? "Enter the name of the person receiving the parts." : "";
      case "line1":
        return x.length < 3 ? "Enter the building, street or industrial area." : "";
      case "city":
        return x.length < 2 ? "Enter the city or town." : "";
      case "state":
        return x ? "" : "Choose the state. It decides how GST is split.";
      case "pincode":
        if (!x) return "Enter the 6-digit pincode.";
        return /^[1-9]\d{5}$/.test(x) ? "" : "A pincode has 6 digits and doesn’t start with 0.";
      case "pay":
        if (!x) return "Choose how you’d like to pay.";
        if (x === "credit") { var c = credit(d, totals(d)); return c.ok ? "" : c.why; }
        return "";
      case "upi":
        if (d.pay !== "upi" || d.upiMode !== "id") return "";
        if (!x) return "Enter your UPI ID, or choose Any UPI app.";
        return /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63}$/i.test(x) ? "" : "Enter a UPI ID like ravi.kulkarni@okhdfcbank.";
      case "terms":
        return d.terms ? "" : "Tick the box to agree to the terms of sale and return policy.";
    }
    return "";
  }
  function targetOf(name) {
    if (name === "pay") return $('input[name="pay"]:checked') || $('input[name="pay"]:not(:disabled)');
    return F(name);
  }
  function setError(name, msg) {
    var err = $('[data-err="' + name + '"]');
    if (err) err.textContent = msg || "";
    var els2 = name === "pay" ? $$('input[name="pay"]') : [F(name)];
    els2.forEach(function (el) {
      if (!el) return;
      if (el._base == null) el._base = el.getAttribute("aria-describedby") || "";
      var ids = el._base.split(" ").filter(function (x) { return x && x !== (err && err.id); });
      if (msg) { el.setAttribute("aria-invalid", "true"); if (err) ids.push(err.id); }
      else el.removeAttribute("aria-invalid");
      if (ids.length) el.setAttribute("aria-describedby", ids.join(" ")); else el.removeAttribute("aria-describedby");
    });
  }
  function validate(step) {
    var d = data(), first = null;
    RULES[step].forEach(function (n) {
      var msg = check(n, d);
      setError(n, msg);
      if (msg && !first) first = n;
    });
    return first;
  }
  function focusField(name) {
    var el = targetOf(name);
    if (!el) return;
    el.focus({ preventScroll: true });
    var box = el.closest(".field, .popt, .opts") || el;
    box.scrollIntoView({ block: "center", behavior: BS.reduceMotion ? "auto" : "smooth" });
  }

  /* --------------------------------------------------------------- steps */
  function canOpen(step) {
    for (var i = 0; i < STEPS.indexOf(step); i++) if (!S.done[STEPS[i]]) return false;
    return true;
  }
  function stepSummary(step, d) {
    if (step === "contact") {
      return esc(d.email) + '<span class="cstep__sep"> · </span><span class="nowrap">+91 ' + esc(fmtMobile(d.mobile)) + "</span>" + (d.business ? "<br>" + esc(d.company) + '<span class="cstep__sep"> · </span><span class="nowrap">GSTIN ' + esc(d.gstin) + "</span>" : "");
    }
    if (step === "delivery") {
      var s = bag.schedule(totals(d).lines);
      var when = d.ship === "pickup" ? "Pick up " + bag.day(s.pickup.ready) + " from " + bag.time(s.pickup.ready) :
        d.ship === "express" ? "Express, arrives " + bag.day(s.express.on) : "Standard, arrives by " + bag.day(s.standard.to);
      return esc(d.name) + ", " + esc(d.city) + ', <span class="nowrap">' + esc(d.state) + " " + esc(d.pincode) + "</span><br>" + esc(when);
    }
    return "";
  }
  function paint() {
    var d = data();
    STEPS.forEach(function (step) {
      var s = sec(step), open = step === S.step, done = step !== "payment" && S.done[step];
      var btn = $("[data-step-toggle]", s), edit = $("[data-step-edit]", s), sum = $("[data-step-sum]", s);
      s.classList.toggle("is-open", open);
      s.classList.toggle("is-done", done && !open);
      s.classList.toggle("is-locked", !open && !canOpen(step));
      body(step).hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (!open && !canOpen(step)) btn.setAttribute("aria-disabled", "true"); else btn.removeAttribute("aria-disabled");
      if (edit) edit.hidden = !(done && !open);
      if (sum) sum.innerHTML = done && !open ? stepSummary(step, d) : "";
    });
  }
  function firstField(step) {
    var f = $$("input, select, textarea", body(step)).filter(function (el) { return !el.disabled && el.type !== "hidden" && el.offsetParent !== null; })[0];
    // In a radio group, focus lands on the chosen option, as arrow keys expect.
    if (f && f.type === "radio") f = $('input[name="' + f.name + '"]:checked', body(step)) || f;
    return f;
  }
  function openStep(step, focus) {
    S.step = step;
    paint();
    if (step === "payment") refreshPayment();
    if (!focus) return;
    var s = sec(step);
    s.scrollIntoView({ block: "start", behavior: BS.reduceMotion ? "auto" : "smooth" });
    var f = firstField(step);
    if (f) f.focus({ preventScroll: true });
  }
  function goTo(step) {
    if (step === S.step || !canOpen(step)) return;
    // Leaving a finished step that is being edited: it must still be valid.
    if (S.step !== "payment" && S.done[S.step]) {
      S.tried[S.step] = true;
      var bad = validate(S.step);
      if (bad) { focusField(bad); say("Check the highlighted details before you move on."); return; }
      saveDraft();
    }
    openStep(step, true);
  }
  function next(step) {
    S.tried[step] = true;
    var bad = validate(step);
    if (bad) { focusField(bad); say("Some details need attention."); return; }
    S.done[step] = true;
    if (step === "contact") {
      var gs = gstinState(data().gstin);
      if (data().business && gs && CODE_OF[gs] && !els.state.value) { els.state.value = gs; S.stateAuto = true; renderSummary(); }
    }
    saveDraft();
    var i = STEPS.indexOf(step) + 1;
    while (STEPS[i] !== "payment" && S.done[STEPS[i]]) i++;
    openStep(STEPS[i], true);
  }

  /* ------------------------------------------------------------- summary */
  function oline(l) {
    var p = l.p, name = BS.brand(p.brand).name + " " + p.pn;
    return '<li class="oline"><span class="oline__img">' + BS.imgTag(p.img, { alt: "", sizes: "64px" }) + '<span class="oline__qty" aria-hidden="true">' + l.qty + "</span></span>" +
      '<span class="oline__txt"><a href="' + BS.url(p) + '">' + esc(name) + "</a><small>" + l.qty + " × " + inr(l.unit) + " · " + esc(p.title) + "</small></span>" +
      '<span class="oline__amt num">' + inr(l.total) + "</span></li>";
  }
  function row(label, value, cls) { return '<div class="sumrow' + (cls ? " " + cls : "") + '"><dt>' + label + '</dt><dd class="num">' + value + "</dd></div>"; }
  function renderCoupon() {
    var c = bag.coupon();
    if (c) {
      els.cpn.innerHTML = '<div class="cpn-on">' + icon("tag") + "<span><strong>" + esc(c.code) + "</strong> applied · " + esc(c.label) + '</span><button class="textlink small" type="button" data-coupon-remove aria-label="Remove coupon ' + esc(c.code) + '">Remove</button></div>';
      return;
    }
    var err = S.coupon.error, open = S.coupon.open || !!err;
    els.cpn.innerHTML = '<button class="ocpn__toggle" type="button" aria-expanded="' + open + '" aria-controls="ocpn-form" data-cpn-toggle>' + icon("tag") + "Add a coupon code</button>" +
      '<form class="cpn" id="ocpn-form" novalidate data-coupon-form' + (open ? "" : " hidden") + ">" +
      '<label class="sr-only" for="ocpn-code">Coupon code</label>' +
      '<div class="cpn__row"><input class="input cpn__input mono" id="ocpn-code" autocomplete="off" spellcheck="false" autocapitalize="characters" maxlength="24" value="' + esc(S.coupon.value) + '" aria-describedby="ocpn-hint' + (err ? " ocpn-err" : "") + '"' + (err ? ' aria-invalid="true"' : "") + ">" +
      '<button class="btn btn--dark cpn__btn" type="submit">Apply</button></div>' +
      '<p class="error" id="ocpn-err" role="alert">' + esc(err) + '</p><p class="hint" id="ocpn-hint">Sample store: try SETU5.</p></form>';
  }
  function renderSummary() {
    if (S.placed) return;
    var d = data(), t = totals(d);
    if (!t.lines.length) { showEmpty(); return; }
    els.lines.innerHTML = t.lines.map(oline).join("");
    var shipLabel = d.ship === "express" ? "Express delivery" : d.ship === "pickup" ? "Pick up in Pune" : "Standard delivery";
    var tax = t.intra === true ? row("CGST 9%", inr(t.cgst)) + row("SGST 9%", inr(t.sgst)) : t.intra === false ? row("IGST 18%", inr(t.igst)) : row("GST 18%", inr(t.gst));
    els.rows.innerHTML =
      row("Subtotal <small>" + BS.plural(t.count, "item") + "</small>", inr(t.sub)) +
      (t.savings > 0 ? row("Volume savings included", inr(t.savings), "is-save") : "") +
      (t.coupon ? row("Coupon " + esc(t.coupon.code), "−" + inr(t.discount), "is-save") : "") +
      row(shipLabel, t.ship ? inr(t.ship) : "Free") +
      row("Taxable value", inr(t.taxable), "is-quiet") +
      tax +
      row("Total", inr(t.total), "is-total");
    els.pos.innerHTML = d.state ?
      icon("map-pin") + "<span>Place of supply: " + esc(d.state) + " (" + CODE_OF[d.state] + "). " + (t.intra ? "We ship from Maharashtra, so GST is split into CGST and SGST." : "We ship from Maharashtra, so IGST applies.") + "</span>" :
      icon("info") + "<span>Choose a delivery state to see CGST and SGST (Maharashtra) or IGST (other states).</span>";
    els.totalM.textContent = inr(t.total);
    els.placeTotal.textContent = "You pay " + inr(t.total) + " including GST.";
    var std = $('[data-ship-fee="standard"]');
    if (std) std.innerHTML = t.sub >= BS.FREE_SHIP ? "Free" : inr(BS.SHIP_FEE) + "<small>Free above " + inr(BS.FREE_SHIP) + "</small>";
    renderShipDates(t);
    refreshPayment(d, t);
    if (S.lastTotal != null && S.lastTotal !== t.total) say("Order total " + inr(t.total) + " including GST.");
    S.lastTotal = t.total;
  }
  function renderShipDates(t) {
    var s = bag.schedule(t.lines);
    $('[data-ship-date="standard"]').textContent = "Arrives " + bag.day(s.standard.from) + " to " + bag.day(s.standard.to);
    $('[data-ship-date="express"]').textContent = "Arrives " + bag.day(s.express.on) + " in metro cities";
    var r = s.pickup.ready, today = r.toDateString() === new Date().toDateString();
    $('[data-ship-date="pickup"]').textContent = "Ready " + (today ? "today" : bag.day(r)) + " from " + bag.time(r) + ", Bhosari MIDC";
    $("[data-ship-promise]").innerHTML = icon("truck") + "<span>" + esc(bag.promise(s)) + "</span>";
    var pickup = data().ship === "pickup";
    $("[data-pickup-note]").hidden = !pickup;
    $("[data-addr-intro]").textContent = pickup ? "Billing address. We print it on your invoice; you collect the parts in Pune." : "Where should we deliver? We print this address on your invoice.";
  }
  function refreshPayment(d, t) {
    d = d || data(); t = t || totals(d);
    var c = credit(d, t), radio = $('input[name="pay"][value="credit"]');
    radio.disabled = !c.ok;
    if (!c.ok && radio.checked) { radio.checked = false; showPayBody(); }
    $("[data-credit-why]").textContent = c.why;
    var popt = radio.closest(".popt");
    popt.classList.toggle("is-disabled", !c.ok);
    var fix = $("[data-credit-fix]", popt);
    if (!c.ok && (!d.business || !GSTIN_RE.test(d.gstin))) {
      if (!fix) popt.insertAdjacentHTML("beforeend", '<button class="popt__fix textlink small" type="button" data-credit-fix>Add GSTIN in Contact</button>');
    } else if (fix) fix.remove();
    var due = new Date(); due.setDate(due.getDate() + 30);
    $("[data-credit-due]").textContent = "Pay by " + bag.date(due) + ". Available after this order: " + inr(Math.max(0, CREDIT.avail - t.total)) + ".";
  }
  function showPayBody() {
    var cur = $('input[name="pay"]:checked');
    $$(".popt").forEach(function (p) {
      var on = !!cur && p.getAttribute("data-popt") === cur.value;
      p.classList.toggle("is-on", on);
      $("[data-popt-body]", p).hidden = !on;
    });
  }

  /* ------------------------------------------------------- empty state */
  function showEmpty() {
    els.flow.hidden = true;
    els.empty.hidden = false;
    $(".co__lede", els.top).hidden = true;
    var last = bag.arr("orders").filter(function (o) { return o && o.id && o.totals; })[0];
    var saved = bag.arr("saved").filter(function (x) { return x && BS.byId(x.id); }).length;
    var links = [];
    links.push(saved ? '<a class="more" href="cart.html#saved">' + BS.plural(saved, "part") + " saved for later</a>" : '<a class="more" href="cart.html">Back to your bag</a>');
    if (last) links.push('<a class="more" href="checkout.html?order=' + encodeURIComponent(last.id) + '">Your last order, ' + esc(last.id) + "</a>");
    els.empty.innerHTML = '<div class="empty">' + icon("handbag") + '<h2 class="h3">Your bag is empty.</h2><p>Add the parts you need, then come back here to check out. Your contact and delivery details stay saved in this browser.</p>' +
      '<div class="co-empty__ctas"><a class="btn" href="shop.html">Shop parts</a><a class="btn btn--quiet" href="quick-order.html">Quick order</a></div>' +
      (links.length ? '<div class="co-empty__links">' + links.join("") + "</div>" : "") + "</div>";
  }

  /* ------------------------------------------------------- live region */
  var liveEl = $("[data-co-live]");
  function say(msg) { if (!liveEl) return; liveEl.textContent = ""; setTimeout(function () { liveEl.textContent = msg; }, 60); }

  /* -------------------------------------------------------------- draft */
  var DRAFT = ["email", "mobile", "company", "gstin", "po", "name", "line1", "line2", "city", "state", "pincode"];
  var saveDraft = BS.debounce(function () {
    if (S.placed) return;
    var d = data(), out = { business: d.business, ship: d.ship };
    DRAFT.forEach(function (k) { out[k] = d[k]; });
    out.mobile = v("mobile");
    BS.store.set("checkoutDraft", out);
  }, 250);
  function restore() {
    var dr = BS.store.get("checkoutDraft", null);
    if (!dr) return;
    DRAFT.forEach(function (k) { var el = F(k); if (el && dr[k]) el.value = dr[k]; });
    els.biz.checked = !!dr.business;
    $("[data-biz]").hidden = !dr.business;
    var r = dr.ship && $('input[name="ship"][value="' + dr.ship + '"]');
    if (r) r.checked = true;
    updateGstinHint();
    updatePinHint();
  }

  /* ---------------------------------------------------------- field UX */
  function updateGstinHint() {
    var g = els.gstin.value.toUpperCase().replace(/\s+/g, "");
    var hint = $("[data-gstin-hint]");
    var st = gstinState(g);
    if (g.length >= 2 && st) {
      var ok = GSTIN_RE.test(g);
      hint.innerHTML = (ok ? '<span class="ok">' + icon("check-circle") + "Registered in " + esc(st) + " (" + g.slice(0, 2) + ")</span>" : "State: " + esc(st) + " (" + g.slice(0, 2) + "). " + (15 - g.length > 0 ? (15 - g.length) + " more characters." : ""));
    } else hint.textContent = "15 characters, for example 27AAPFU0939F1ZV.";
  }
  function updatePinHint() {
    var pin = digits(els.pin.value), hint = $("[data-pin-hint]");
    if (pin.length === 6 && /^[1-9]/.test(pin)) {
      var city = CITY[pin.slice(0, 3)], st = stateFromPin(pin);
      hint.textContent = city || st ? "Looks like " + [city, st].filter(Boolean).join(", ") + "." : "6 digits.";
    } else hint.textContent = "6 digits.";
  }
  function onPin() {
    var pin = digits(els.pin.value);
    if (els.pin.value !== pin) els.pin.value = pin;
    updatePinHint();
    if (pin.length !== 6) return;
    var st = stateFromPin(pin), city = CITY[pin.slice(0, 3)];
    // A state we guessed (from the GSTIN or an earlier pincode) gives way to the pincode; one the buyer chose does not.
    if (st && (!els.state.value || (S.stateAuto && els.state.value !== st))) { els.state.value = st; S.stateAuto = true; if (S.tried.delivery) setError("state", ""); renderSummary(); }
    if (city && (!els.city.value.trim() || els.city.value === S.cityAuto)) { els.city.value = city; S.cityAuto = city; if (S.tried.delivery) setError("city", ""); }
  }

  /* --------------------------------------------------------- place order */
  function pad(n, l) { n = String(n); while (n.length < (l || 2)) n = "0" + n; return n; }
  function place() {
    if (S.placing || S.placed) return;
    S.tried.payment = true;
    for (var i = 0; i < 2; i++) {
      var step = STEPS[i];
      S.tried[step] = true;
      var bad = validate(step);
      if (bad) {
        S.done[step] = false;
        openStep(step, false);
        focusField(bad);
        say("Check your " + step + " details. Some need attention.");
        return;
      }
      S.done[step] = true;
    }
    var badPay = validate("payment");
    if (badPay) { focusField(badPay); say("Some payment details need attention."); return; }
    var btn = els.place;
    S.placing = true;
    btn.classList.add("is-loading");
    btn.setAttribute("aria-disabled", "true");
    btn.setAttribute("aria-busy", "true");
    say("Placing your order.");
    setTimeout(function () {
      var order;
      try { order = buildOrder(); }
      catch (e) {
        S.placing = false;
        btn.classList.remove("is-loading");
        btn.removeAttribute("aria-disabled");
        btn.removeAttribute("aria-busy");
        var err = $('[data-err="terms"]');
        err.textContent = "We couldn’t save your order in this browser. Check that site storage is allowed, then try again.";
        return;
      }
      showDone(order, true);
    }, 1200);
  }
  function buildOrder() {
    var d = data(), t = totals(d), now = new Date(), s = bag.schedule(t.lines, now);
    var orders = bag.arr("orders");
    var id;
    do { id = "BS-" + bag.yymm(now) + "-" + bag.rand4(); } while (orders.some(function (o) { return o && o.id === id; }));
    var fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    var eta = d.ship === "pickup" ? s.pickup.ready : d.ship === "express" ? s.express.on : s.standard.to;
    var order = {
      id: id, date: now.toISOString(), status: "Confirmed",
      lines: t.lines.map(function (l) { return { id: l.id, pn: l.p.pn, brand: BS.brand(l.p.brand).name, title: l.p.title, hsn: l.p.hsn, qty: l.qty, unit: l.unit, total: l.total }; }),
      items: t.count, total: t.total,
      totals: { sub: t.sub, savings: t.savings, coupon: t.coupon ? t.coupon.code : null, discount: t.discount, ship: t.ship, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, gst: t.gst, total: t.total, intra: t.intra },
      contact: { email: d.email, mobile: d.mobile, business: d.business, company: d.business ? d.company : "", gstin: d.business ? d.gstin : "", gstState: d.business ? gstinState(d.gstin) : "", po: d.business ? d.po : "" },
      address: { name: d.name, line1: d.line1, line2: d.line2, city: d.city, state: d.state, stateCode: CODE_OF[d.state], pincode: d.pincode },
      pincode: d.pincode,
      delivery: { method: d.ship, label: bag.SHIP[d.ship].label, fee: t.ship, dispatch: s.dispatch.toISOString(), from: d.ship === "standard" ? s.standard.from.toISOString() : eta.toISOString(), eta: eta.toISOString() },
      payment: { method: d.pay, label: PAY[d.pay], mode: d.pay === "upi" ? d.upiMode : null, upi: d.pay === "upi" && d.upiMode === "id" ? d.upi : null },
      invoice: "INV/" + pad(fy % 100) + "-" + pad((fy + 1) % 100) + "/0" + id.slice(-4),
      placeOfSupply: d.state + " (" + CODE_OF[d.state] + ")"
    };
    orders.unshift(order);
    BS.store.set("orders", orders);
    if (t.coupon) {
      var used = bag.arr("couponsUsed");
      used.push({ code: t.coupon.code, order: id, date: order.date });
      BS.store.set("couponsUsed", used);
    }
    S.placed = order;
    BS.cart.clear();
    bag.removeCoupon();
    try { history.replaceState(null, "", "checkout.html?order=" + encodeURIComponent(id)); } catch (e) { /* file:// or sandboxed */ }
    return order;
  }

  /* -------------------------------------------------------- confirmation */
  function addrHTML(a) {
    return esc(a.name) + "<br>" + esc(a.line1) + (a.line2 ? "<br>" + esc(a.line2) : "") + "<br>" + esc(a.city) + ", " + esc(a.state) + " " + esc(a.pincode);
  }
  function payPanel(o) {
    var p = o.payment || {}, amt = inr(o.totals.total);
    if (p.method === "neft") {
      return '<section class="done__pay tile" aria-labelledby="pay-h">' +
        '<div class="done__pay-copy"><h2 class="h4" id="pay-h">Pay ' + amt + " by bank transfer</h2>" +
        "<p class=\"muted\">Use NEFT or RTGS from your bank and put the order number in the reference, so we can match it. We pack and dispatch once it reaches our account.</p>" +
        '<p class="small done__sample">' + icon("info") + "Placeholder details in this sample store. Do not send money.</p></div>" +
        '<dl class="bank">' +
          '<div><dt>Account name</dt><dd>Bearingsetu</dd></div>' +
          '<div><dt>Bank</dt><dd>Sample Bank, Bhosari branch, Pune</dd></div>' +
          '<div><dt>Account number</dt><dd class="mono">0000 0000 0000 0000</dd></div>' +
          '<div><dt>IFSC</dt><dd class="mono">SMPL0000001</dd></div>' +
          '<div><dt>Amount</dt><dd class="num">' + amt + ' <button class="textlink small" type="button" data-copy="' + esc(String(o.totals.total)) + '" aria-label="Copy amount">Copy</button></dd></div>' +
          '<div><dt>Reference</dt><dd class="mono">' + esc(o.id) + ' <button class="textlink small" type="button" data-copy="' + esc(o.id) + '" aria-label="Copy reference">Copy</button></dd></div>' +
        "</dl></section>";
    }
    var msg = p.method === "upi" && p.mode === "id" ? "In the live store, a payment request for " + amt + " goes to " + esc(p.upi) + ". You approve it in your UPI app within 10 minutes." :
      p.method === "upi" ? "In the live store, a QR code for " + amt + " appears here. Scan it with any UPI app within 10 minutes." :
      p.method === "card" ? "In the live store, you now finish paying " + amt + " on Razorpay’s secure page." :
      p.method === "credit" ? amt + " goes on your 30-day credit. Pay by " + bag.date(new Date(new Date(o.date).getTime() + 30 * 864e5)) + "." : "";
    return msg ? '<p class="notice done__paynote">' + icon(p.method === "credit" ? "hand-coins" : p.method === "card" ? "credit-card" : "qr-code") + "<span>" + msg + " No payment was taken.</span></p>" : "";
  }
  function timeline(o) {
    var placed = new Date(o.date), dl = o.delivery, dispatch = new Date(dl.dispatch), eta = new Date(dl.eta);
    var steps;
    if ((o.payment || {}).method === "neft") {
      // Nothing is packed until the transfer arrives, so the dates follow the payment.
      var ref = "Use " + esc(o.id) + " as the payment reference. We email you when it arrives.";
      steps = dl.method === "pickup" ? [
        ["Order confirmed", "Today, " + bag.time(placed), true],
        ["Transfer received", ref, false],
        ["Ready for pickup", "About 4 hours after the transfer arrives, Monday to Saturday. Bhosari MIDC, Pune 411026.", false],
        ["Collected", "Bring the order number and a photo ID. We hold parts for 7 days.", false]
      ] : [
        ["Order confirmed", "Today, " + bag.time(placed), true],
        ["Transfer received", ref, false],
        ["Packed and dispatched", (dispatch > bag.addWorking(placed, 1) ?
          "From " + bag.dayLong(dispatch) + ", once every part is ready and the transfer has arrived." :
          "The same day if the transfer arrives by 4&nbsp;pm, Monday to Saturday.") + " Tracking by SMS and email.", false],
        ["Delivered", dl.method === "express" ? "Next working day after dispatch in metro cities." : "2 to 4 working days after dispatch.", false]
      ];
    } else if (dl.method === "pickup") {
      steps = [
        ["Order confirmed", "Today, " + bag.time(placed), true],
        ["Packed and checked", "By " + bag.time(eta) + (bag.when(eta, placed) === "today" ? " today" : ", " + bag.when(eta, placed)), false],
        ["Ready for pickup", bag.dayLong(eta) + " from " + bag.time(eta) + ". Bhosari MIDC, Pune 411026.", false],
        ["Collected", "Bring the order number and a photo ID. We hold parts for 7 days.", false]
      ];
    } else {
      var w = bag.when(dispatch, placed);
      steps = [
        ["Order confirmed", "Today, " + bag.time(placed), true],
        ["Packed", "By 4&nbsp;pm" + (w === "today" ? " today" : ", " + bag.day(dispatch)), false],
        ["Dispatched", (w === "today" ? "Today, " + bag.day(dispatch) : w.charAt(0).toUpperCase() + w.slice(1)) + ". Tracking by SMS and email.", false],
        ["Delivered", "By " + bag.dayLong(eta) + (dl.method === "express" ? " (express)" : ""), false]
      ];
    }
    return '<ol class="tl">' + steps.map(function (s, i) {
      return '<li class="tl__step' + (s[2] ? " is-done" : "") + '" style="--i:' + i + '"><span class="tl__dot" aria-hidden="true">' + (s[2] ? icon("check") : "") + '</span><div><p class="tl__t">' + s[0] + (s[2] ? '<span class="sr-only"> (done)</span>' : "") + '</p><p class="tl__s">' + s[1] + "</p></div></li>";
    }).join("") + "</ol>";
  }
  function doneHTML(o) {
    var c = o.contact, a = o.address, t = o.totals, placed = new Date(o.date);
    var tax = t.intra ? "CGST " + inr(t.cgst) + " + SGST " + inr(t.sgst) : "IGST " + inr(t.igst);
    var items = o.lines.map(function (l) {
      var p = BS.byId(l.id) || {};
      return '<li class="oline">' + '<span class="oline__img">' + (p.img ? BS.imgTag(p.img, { alt: "", sizes: "64px" }) : "") + '<span class="oline__qty" aria-hidden="true">' + l.qty + "</span></span>" +
        '<span class="oline__txt"><strong>' + esc(l.brand + " " + l.pn) + "</strong><small>" + l.qty + " × " + inr(l.unit) + "</small></span>" +
        '<span class="oline__amt num">' + inr(l.total) + "</span></li>";
    }).join("");
    return '<section class="done" aria-labelledby="done-title"><div class="wrap">' +
      '<div class="done__hero">' +
        '<div class="done__check" aria-hidden="true"><svg viewBox="0 0 80 80"><circle class="done__ring" cx="40" cy="40" r="36"/><path class="done__tick" d="M24 41.5l10.5 10.5L57 29.5"/></svg></div>' +
        '<h1 class="h1 done__title" id="done-title" tabindex="-1">Thank you.<br><span class="tone">Your order <span class="done__id">' + esc(o.id) + "</span> <span class=\"nowrap\">is confirmed.</span></span></h1>" +
        '<p class="lede done__lede">We’ve sent the confirmation to <strong>' + esc(c.email) + "</strong> and will text dispatch updates to +91 " + esc(fmtMobile(c.mobile)) + ".</p>" +
        '<p class="done__sample small">' + icon("info") + "Sample store: no email was sent, no payment was taken and nothing will ship.</p>" +
        '<div class="done__ctas">' +
          '<button class="btn btn--lg" type="button" data-invoice>' + icon("receipt") + "Download GST invoice</button>" +
          '<a class="btn btn--lg btn--quiet" href="support.html?order=' + encodeURIComponent(o.id) + '#track">Track this order</a>' +
          '<a class="more" href="shop.html">Continue shopping</a>' +
        "</div>" +
      "</div>" +
      payPanel(o) +
      '<div class="done__grid">' +
        '<div class="done__col">' +
          '<section class="done__card" aria-labelledby="next-h"><h2 class="h4" id="next-h">What happens next</h2>' + timeline(o) + "</section>" +
          '<section class="done__help" aria-labelledby="help-h"><h2 class="h4" id="help-h">Questions about this order?</h2>' +
            '<p class="muted">Write to orders@bearingsetu.com with your order number, or ask for a call back. We reply Monday to Saturday, 9:30 am to 7 pm.</p>' +
            '<div class="done__help-links"><a class="more" href="mailto:orders@bearingsetu.com?subject=' + encodeURIComponent("Order " + o.id) + '">Email us</a><a class="more" href="support.html#contact">Request a call back</a><a class="more" href="support.html#returns">Start a return</a></div>' +
          "</section>" +
        "</div>" +
        '<section class="done__card done__card--mist" aria-labelledby="det-h"><h2 class="h4" id="det-h">Order details</h2>' +
          '<dl class="done__dl">' +
            "<div><dt>Order number</dt><dd class=\"mono\">" + esc(o.id) + "</dd></div>" +
            "<div><dt>Placed on</dt><dd>" + bag.date(placed) + ", " + bag.time(placed) + "</dd></div>" +
            "<div><dt>Invoice</dt><dd class=\"mono\">" + esc(o.invoice) + "</dd></div>" +
            "<div><dt>" + (o.delivery.method === "pickup" ? "Billing address" : "Deliver to") + "</dt><dd>" + addrHTML(a) + "</dd></div>" +
            "<div><dt>Delivery</dt><dd>" + esc(o.delivery.label) + (o.delivery.fee ? ", " + inr(o.delivery.fee) : ", free") + "</dd></div>" +
            "<div><dt>Payment</dt><dd>" + esc(o.payment.label) + "</dd></div>" +
            (c.business ? "<div><dt>Billed to</dt><dd>" + esc(c.company) + '<br><span class="mono">' + esc(c.gstin) + "</span>" + (c.po ? "<br>PO " + esc(c.po) : "") + "</dd></div>" : "") +
            "<div><dt>GST</dt><dd>" + tax + "<br><span class=\"muted\">Place of supply " + esc(o.placeOfSupply) + "</span></dd></div>" +
          "</dl>" +
          '<ul class="osum__lines done__lines">' + items + "</ul>" +
          '<dl class="osum__rows">' +
            row("Subtotal", inr(t.sub)) +
            (t.discount ? row("Coupon " + esc(t.coupon), "−" + inr(t.discount), "is-save") : "") +
            row("Dispatch", t.ship ? inr(t.ship) : "Free") +
            row("GST", inr(t.gst)) +
            row("Total", inr(t.total), "is-total") +
          "</dl>" +
        "</section>" +
      "</div>" +
    "</div></section>";
  }
  function invoiceHTML(o) {
    var c = o.contact, a = o.address, t = o.totals, placed = new Date(o.date);
    var billTo = (c.business ? "<strong>" + esc(c.company) + "</strong><br>GSTIN " + esc(c.gstin) + "<br>" : "<strong>" + esc(a.name) + "</strong><br>Unregistered buyer<br>") + esc(a.line1) + (a.line2 ? "<br>" + esc(a.line2) : "") + "<br>" + esc(a.city) + ", " + esc(a.state) + " " + esc(a.pincode) + "<br>" + esc(c.email);
    var shipTo = o.delivery.method === "pickup" ? "<strong>Collect from Bearingsetu</strong><br>Bhosari MIDC, Pune 411026<br>Maharashtra" : "<strong>" + esc(a.name) + "</strong><br>" + esc(a.line1) + (a.line2 ? "<br>" + esc(a.line2) : "") + "<br>" + esc(a.city) + ", " + esc(a.state) + " " + esc(a.pincode) + "<br>+91 " + esc(fmtMobile(c.mobile));
    var meta = [["Invoice date", bag.date(placed)], ["Order", '<span class="mono">' + esc(o.id) + "</span>"]];
    if (c.po) meta.push(["PO number", esc(c.po)]);
    meta.push(["Place of supply", esc(o.placeOfSupply)], ["Payment", esc(o.payment.label)], ["Reverse charge", "No"]);
    return bag.docHTML({
      kind: "invoice", no: o.invoice, meta: meta,
      parties: [{ h: "Bill to", html: billTo }, { h: "Ship to", html: shipTo }],
      lines: bag.docLines(o.lines),
      totals: Object.assign({}, t, { coupon: t.coupon ? { code: t.coupon } : null, shipLabel: o.delivery.label }),
      terms: [
        "GST is charged at 18% on all items. " + (t.intra ? "Intra-state supply: CGST 9% and SGST 9%." : "Inter-state supply: IGST 18%."),
        "Unused parts in their original packing can be returned within 7 days of delivery.",
        "Certified that the particulars given above are true and correct. This is a computer-generated invoice and needs no signature."
      ],
      note: "Sample document from the Bearingsetu demo store. Not a valid tax invoice. Questions: orders@bearingsetu.com"
    });
  }
  function showDone(o, fresh) {
    S.placed = o;
    els.top.hidden = true;
    els.flow.hidden = true;
    els.empty.hidden = true;
    els.done.innerHTML = doneHTML(o);
    els.done.hidden = false;
    if (fresh) els.done.classList.add("is-fresh");
    doc.title = "Order " + o.id + " confirmed · Bearingsetu";
    window.scrollTo(0, 0);
    var h = $("#done-title");
    if (h) h.focus({ preventScroll: true });
  }

  /* -------------------------------------------------------------- events */
  root.addEventListener("submit", function (e) {
    var form = e.target;
    if (form.matches("[data-coupon-form]")) { e.preventDefault(); applyCoupon(); return; }
    var step = form.getAttribute("data-step-form");
    if (!step) return;
    e.preventDefault();
    if (step === "payment") place(); else next(step);
  });
  root.addEventListener("click", function (e) {
    var el;
    if ((el = e.target.closest("[data-step-toggle]"))) {
      if (el.getAttribute("aria-disabled") === "true") return;
      goTo(el.getAttribute("data-step-toggle"));
      return;
    }
    if ((el = e.target.closest("[data-step-edit]"))) { goTo(el.getAttribute("data-step-edit")); return; }
    if (e.target.closest("[data-credit-fix]")) {
      if (!els.biz.checked) { els.biz.checked = true; $("[data-biz]").hidden = false; }
      goTo("contact");
      setTimeout(function () { ($("#co-company").value.trim() ? els.gstin : $("#co-company")).focus(); }, 30);
      return;
    }
    if ((el = e.target.closest("[data-upi-mode]"))) {
      S.upiMode = el.getAttribute("data-upi-mode");
      $$("[data-upi-mode]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === el)); });
      $("[data-upi-id]").hidden = S.upiMode !== "id";
      $("[data-upi-qr]").hidden = S.upiMode !== "qr";
      setError("upi", "");
      return;
    }
    if ((el = e.target.closest("[data-sum-toggle]"))) {
      var open = !els.sum.classList.contains("is-open");
      els.sum.classList.toggle("is-open", open);
      el.setAttribute("aria-expanded", String(open));
      els.toggleLabel.textContent = open ? "Hide order summary" : "Show order summary";
      return;
    }
    if (e.target.closest("[data-coupon-remove]")) {
      S.coupon = { value: "", error: "", open: false };
      bag.removeCoupon();
      BS.toast("Coupon removed.", { icon: "tag" });
      var tg = $("[data-cpn-toggle]");
      if (tg) tg.focus();
      return;
    }
    if ((el = e.target.closest("[data-cpn-toggle]"))) {
      S.coupon.open = el.getAttribute("aria-expanded") !== "true";
      renderCoupon();
      if (S.coupon.open) $("#ocpn-code").focus(); else $("[data-cpn-toggle]").focus();
      return;
    }
    if ((el = e.target.closest("[data-invoice]")) && S.placed) {
      bag.openDoc({ kicker: "Tax invoice", title: S.placed.invoice, file: S.placed.invoice.replace(/\//g, "-"), html: invoiceHTML(S.placed), trigger: el });
      return;
    }
    if ((el = e.target.closest("[data-copy]"))) {
      var text = el.getAttribute("data-copy");
      var ok = function () { BS.toast("Copied " + esc(text) + ".", { icon: "copy" }); };
      try { navigator.clipboard.writeText(text).then(ok, ok); } catch (err) { ok(); }
      return;
    }
  });
  function applyCoupon() {
    var input = $("#ocpn-code");
    S.coupon.value = input.value;
    var res = bag.applyCoupon(input.value);
    if (res.error) {
      S.coupon.error = res.error;
      S.coupon.open = true;
      renderCoupon();
      $("#ocpn-code").focus();
      return;
    }
    S.coupon = { value: "", error: "", open: false };
    BS.toast("<strong>" + esc(res.coupon.code) + "</strong> applied. " + esc(res.coupon.label) + ".", { icon: "tag" });
    var rm = $("[data-coupon-remove]");
    if (rm) rm.focus();
  }

  root.addEventListener("input", function (e) {
    var t = e.target, name = t.getAttribute("data-f");
    if (t.id === "ocpn-code") {
      S.coupon.value = t.value;
      if (S.coupon.error) { S.coupon.error = ""; t.removeAttribute("aria-invalid"); $("#ocpn-err").textContent = ""; }
      return;
    }
    if (!name) return;
    if (name === "gstin") {
      var up = t.value.toUpperCase().replace(/\s+/g, "");
      if (up !== t.value) { var pos = t.selectionStart; t.value = up; try { t.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } }
      updateGstinHint();
      refreshPayment();
    }
    if (name === "pincode") onPin();
    if (name === "mobile") {
      var clean = t.value.replace(/[^\d\s+]/g, "");
      if (clean !== t.value) t.value = clean;
    }
    // Clear an error as soon as the field is fixed; new errors wait for blur or submit.
    if (t.getAttribute("aria-invalid") === "true") { if (!check(name, data())) setError(name, ""); }
    saveDraft();
  });
  root.addEventListener("change", function (e) {
    var t = e.target, name = t.getAttribute("data-f");
    if (!name) return;
    if (name === "business") {
      $("[data-biz]").hidden = !t.checked;
      if (!t.checked) { setError("company", ""); setError("gstin", ""); }
      refreshPayment();
    }
    if (name === "state") S.stateAuto = false;
    if (name === "state" || name === "ship") renderSummary();
    if (name === "state" && S.tried.delivery) setError("state", check("state", data()));
    if (name === "pay") { showPayBody(); setError("pay", ""); }
    if (name === "terms" && t.checked) setError("terms", "");
    saveDraft();
  });
  root.addEventListener("focusout", function (e) {
    var t = e.target, name = t.getAttribute && t.getAttribute("data-f");
    if (!name || name === "pay" || name === "ship") return;
    var step = t.closest("[data-step-form]");
    step = step && step.getAttribute("data-step-form");
    if (name === "mobile") { var m = mobileOf(t.value); if (/^[6-9]\d{9}$/.test(m)) t.value = fmtMobile(m); }
    if (step && S.tried[step]) setError(name, check(name, data()));
  });

  BS.on("cart", function () { if (!S.placed) renderSummary(); });
  BS.on("coupon", function () { if (!S.placed) { renderCoupon(); renderSummary(); } });
  window.addEventListener("storage", function (e) {
    if (S.placed || !/^bs\.(cart|coupon)$/.test(e.key || "")) return;
    // Parts added in another tab while this one shows the empty state: start the flow.
    if (els.flow.hidden) { if (BS.cart.count()) location.reload(); return; }
    renderCoupon(); renderSummary();
  });
  // Keep dispatch dates and the 4 pm promise current while the page stays open.
  setInterval(function () { if (!S.placed && !els.flow.hidden) renderShipDates(totals()); }, 60000);

  /* ---------------------------------------------------------------- init */
  var oid = BS.params().get("order");
  var past = oid && bag.arr("orders").filter(function (o) { return o && o.id === oid && o.totals && o.contact && o.address && o.delivery && o.payment && Array.isArray(o.lines); })[0];
  if (past) { showDone(past, false); return; }
  if (!BS.cart.count()) { showEmpty(); return; }
  restore();
  renderCoupon();
  renderSummary();
  showPayBody();
  paint();
})();
