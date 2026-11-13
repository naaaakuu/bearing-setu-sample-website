/* Quotation request. With the API: stored, acknowledged and visible in the buyer's account.
   Without it: the request is prepared for email, WhatsApp, download or print, and the page says so plainly.
   Signed-in verified accounts can place a direct order only when the business has published prices and freight rules. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, icon = BS.icon, doc = document;
  var GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
  var PIN = /^[1-9]\d{5}$/;

  // Links such as checkout.html?custom=6205%20x%2050 or ?add=skf-6205-2rs1&qty=20 add to the list once.
  (function consumeParams() {
    var P = BS.params(), changed = false;
    if (P.get("custom")) { BS.list.addCustom(P.get("custom"), P.get("qty") || 1); changed = true; }
    if (P.get("add") && BS.byId(P.get("add"))) { BS.list.add(P.get("add"), P.get("qty") || 1); changed = true; }
    if (changed) { try { history.replaceState(null, "", "checkout.html"); } catch (e) { /* ignore */ } }
  })();

  function saved() { var s = BS.store.get("contact", {}); return s && typeof s === "object" ? s : {}; }
  function prefill() {
    var a = BS.account && BS.account(), s = saved();
    return { name: s.name || (a && a.name) || "", company: s.company || (a && a.company) || "", gstin: s.gstin || (a && a.gstin) || "", phone: s.phone || (a && a.phone) || "", email: s.email || (a && a.email) || "", pincode: s.pincode || "" };
  }
  function field(id, label, o) {
    o = o || {};
    return '<div class="field' + (o.full ? " full" : "") + '"><label class="label" for="' + id + '">' + label + (o.req ? ' <span aria-hidden="true">*</span>' : "") + "</label>" +
      (o.area ? '<textarea class="textarea" id="' + id + '" name="' + id + '" maxlength="1000" placeholder="' + esc(o.ph || "") + '">' + esc(o.v || "") + "</textarea>"
        : '<input class="input" id="' + id + '" name="' + id + '" type="' + (o.type || "text") + '"' + (o.mode ? ' inputmode="' + o.mode + '"' : "") + ' value="' + esc(o.v || "") + '" maxlength="' + (o.max || 120) + '"' + (o.req ? " required" : "") + (o.ac ? ' autocomplete="' + o.ac + '"' : "") + ' placeholder="' + esc(o.ph || "") + '">') +
      (o.hint ? '<span class="hint" id="' + id + '-h">' + o.hint + "</span>" : "") + '<span class="error" id="' + id + '-e" hidden></span></div>';
  }

  function summary() {
    var t = BS.list.totals(), el = $("[data-summary]");
    if (!t.count) { el.innerHTML = "<h2>Your parts</h2><p class=\"small muted\">Your list is empty.</p><a class=\"btn btn--block\" href=\"shop.html\">Browse parts</a>"; return; }
    el.innerHTML = "<h2>Your parts (" + t.count + ')</h2><ul class="qsum">' + t.lines.map(function (l) { return "<li><span>" + esc(l.p ? BS.name(l.p) : l.text) + "</span><b>× " + l.qty.toLocaleString("en-IN") + "</b></li>"; }).join("") + '</ul><a class="textlink small" href="cart.html">Edit quote list</a>' +
      (BS.cfg.shipping.note ? '<p class="small muted">' + esc(BS.cfg.shipping.note) + "</p>" : "");
  }

  /* ----------------------------------------------------------------- forms */
  function canOrder(t) {
    var a = BS.account && BS.account();
    return !!(BS.api.enabled && a && a.status === "verified" && BS.priceMode() === "list" && BS.cfg.shipping.mode !== "quoted" && t.allPriced);
  }
  var finished = false; // after the confirmation replaces the page, list and session events must not re-render
  function render() {
    if (finished) return;
    summary();
    var t = BS.list.totals(), host = $("[data-forms]");
    if (!t.count) { host.innerHTML = '<div class="empty">' + icon("clipboard-text") + '<h3>There is nothing to quote yet</h3><p>Add parts from the catalogue, or paste a list into Quick order.</p><p style="margin-top:14px"><a class="btn" href="shop.html">Browse parts</a> <a class="btn btn--quiet" href="quick-order.html">Quick order</a></p></div>'; return; }
    var v = prefill(), a = BS.account && BS.account();
    var html = '<form class="card" data-rfq novalidate><h2>Your details</h2><div class="form-grid">' +
      field("f-name", "Name", { req: 1, v: v.name, ac: "name" }) + field("f-company", "Company", { req: 1, v: v.company, ac: "organization" }) +
      field("f-phone", "Phone", { req: 1, v: v.phone, type: "tel", mode: "tel", ac: "tel", max: 20 }) + field("f-email", "Email", { req: 1, v: v.email, type: "email", ac: "email" }) +
      field("f-gstin", "GSTIN", { v: v.gstin, max: 15, hint: "Optional. Add it so the quotation carries the right tax details." }) + field("f-pin", "Delivery pincode", { req: 1, v: v.pincode, mode: "numeric", max: 6, ac: "postal-code", hint: "Freight depends on the destination." }) +
      field("f-notes", "Notes", { full: 1, area: 1, ph: "Quantities per month, brand preference, application, anything we should know" }) +
      '<div class="field" style="position:absolute;left:-9999px" aria-hidden="true"><label for="f-web">Website</label><input id="f-web" name="website" tabindex="-1" autocomplete="off"></div>' +
      '</div><p class="small muted" style="margin-top:14px">We use these details only to reply to this request. See our <a href="policies.html#privacy">privacy notice</a>.</p>' +
      '<p style="margin-top:16px"><button class="btn btn--lg" type="submit" data-submit>Send request</button></p><p class="error" id="f-form-e" role="alert" hidden></p></form>';
    if (canOrder(t)) {
      var cr = a.credit, creditOK = BS.creditApproved();
      html += '<form class="card" data-order novalidate><h2>Or place an order now</h2><p class="small muted" style="margin-bottom:12px">You are signed in as a verified account and every part on your list has a published price.</p>' +
        '<div class="field"><label class="label" for="o-po">Purchase order number (optional)</label><input class="input" id="o-po" maxlength="40"></div>' +
        '<div class="stack" style="margin-top:14px"><label class="opt"><input type="radio" name="pay" value="bank-transfer" checked><span><strong>Bank transfer</strong><br><span class="small muted">You pay as per the proforma we send.</span></span></label>' +
        (creditOK ? '<label class="opt"><input type="radio" name="pay" value="credit"><span><strong>Credit</strong><br><span class="small muted">' + (cr.available != null ? "Available " + BS.inr(cr.available) + (cr.termsDays ? ", " + cr.termsDays + "-day terms" : "") + "." : "") + "</span></span></label>" : "") + "</div>" +
        '<div class="field" style="margin-top:14px"><label class="label" for="o-addr">Delivery address</label><textarea class="textarea" id="o-addr" maxlength="400" required placeholder="Full address with pincode"></textarea></div>' +
        '<p class="small muted" style="margin-top:12px">Prices exclude GST. Freight is added by the system according to the shipping settings.</p><p style="margin-top:14px"><button class="btn btn--dark btn--lg" type="submit">Place order</button></p><p class="error" id="o-form-e" role="alert" hidden></p></form>';
    }
    host.innerHTML = html;
  }

  function err(id, msg) { var e = $("#" + id + "-e"), i = $("#" + id); if (!e) return; e.hidden = !msg; e.textContent = msg || ""; if (i) { if (msg) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); } }
  function validate() {
    var ok = true, first = null;
    function bad(id, m) { err(id, m); ok = false; if (!first) first = $("#" + id); }
    ["f-name", "f-company", "f-phone", "f-email", "f-gstin", "f-pin"].forEach(function (id) { err(id, ""); });
    if (!$("#f-name").value.trim()) bad("f-name", "Enter your name.");
    if (!$("#f-company").value.trim()) bad("f-company", "Enter your company or workshop name.");
    var ph = $("#f-phone").value.replace(/[\s\-()]/g, ""); if (!/^\+?\d{10,13}$/.test(ph)) bad("f-phone", "Enter a phone number with at least 10 digits.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($("#f-email").value.trim())) bad("f-email", "Enter a valid email address.");
    var g = $("#f-gstin").value.replace(/\s/g, "").toUpperCase(); if (g && !GSTIN.test(g)) bad("f-gstin", "A GSTIN has 15 characters, for example 27ABCDE1234F1Z5.");
    if (!PIN.test($("#f-pin").value.trim())) bad("f-pin", "Enter a 6 digit pincode.");
    if (first) first.focus();
    return ok;
  }
  function contact() {
    return { name: $("#f-name").value.trim(), company: $("#f-company").value.trim(), gstin: $("#f-gstin").value.replace(/\s/g, "").toUpperCase(), phone: $("#f-phone").value.trim(), email: $("#f-email").value.trim(), pincode: $("#f-pin").value.trim(), notes: $("#f-notes").value.trim() };
  }

  /* ------------------------------------------------------------ confirmation */
  function confirmView(o) {
    var st = $("[data-stage]");
    finished = true;
    var ch = "";
    if (o.static) {
      var text = BS.listText(o.lines, o.contact), subj = "Quotation request from " + (o.contact.company || o.contact.name);
      var mail = BS.mailto(subj, text), wa = BS.waLink(text);
      ch = '<div class="notice notice--warm"><strong>One more step: send it to us.</strong> This website cannot store your request, so choose how to send it.</div><div class="confirm__acts">' +
        (mail ? '<a class="btn" href="' + esc(mail) + '">' + icon("envelope-simple") + " Send by email</a>" : "") + (wa ? '<a class="btn" rel="noopener" href="' + esc(wa) + '">' + icon("whatsapp-logo") + " Send on WhatsApp</a>" : "") +
        '<button class="btn btn--quiet" type="button" data-csv>' + icon("download-simple") + ' Download CSV</button><button class="btn btn--quiet" type="button" data-copy>' + icon("copy") + ' Copy text</button><button class="btn btn--quiet" type="button" data-print>' + icon("printer") + " Print</button></div>" +
        (mail || wa ? "" : '<p class="small muted">Download the list and send it to us with your company details.</p>');
    }
    st.innerHTML = '<div class="confirm">' + icon("check-circle", "big") + '<h1 class="h1">' + esc(o.title) + "</h1>" + (o.ref ? '<div class="confirm__ref" aria-label="Reference">' + esc(o.ref) + "</div>" : "") + '<p class="lede" style="margin:0 auto">' + o.body + "</p>" + ch +
      '<p class="confirm__acts"><a class="btn btn--quiet" href="shop.html">Continue browsing</a>' + (o.account ? '<a class="btn btn--quiet" href="account.html">View in your account</a>' : "") + "</p></div>";
    window.scrollTo(0, 0);
    var h = $(".confirm h1"); if (h) { h.tabIndex = -1; h.focus(); }
    $$("[data-csv]", st).forEach(function (b) { b.addEventListener("click", function () { BS.downloadCSV("bearingsetu-quotation-request.csv", BS.listRows(o.lines)); }); });
    $$("[data-copy]", st).forEach(function (b) { b.addEventListener("click", function () { BS.copyText(BS.listText(o.lines, o.contact)); }); });
    $$("[data-print]", st).forEach(function (b) { b.addEventListener("click", function () { window.print(); }); });
  }

  doc.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.matches("[data-rfq]")) {
      e.preventDefault();
      if (!validate()) return;
      var c = contact(), lines = BS.list.lines(), btn = $("[data-submit]");
      BS.store.set("contact", { name: c.name, company: c.company, gstin: c.gstin, phone: c.phone, email: c.email, pincode: c.pincode });
      if ($("#f-web").value) { confirmView({ title: "Request received", body: "Thank you.", lines: lines, contact: c }); return; } // honeypot
      if (!BS.api.enabled) { confirmView({ static: true, title: "Your request is ready to send", body: "We have put your parts and details together.", lines: lines, contact: c }); return; }
      btn.disabled = true; btn.textContent = "Sending…";
      BS.api.post("/api/quotes", { kind: lines.some(function (l) { return l.qty >= 100; }) ? "bulk" : "quote", contact: c, lines: lines.map(function (l) { return l.p ? { id: l.id, pn: l.p.pn, brand: BS.brand(l.p.brand).name, title: l.p.title, qty: l.qty } : { pn: l.text, qty: l.qty }; }) })
        .then(function (r) { BS.list.clear(); confirmView({ title: "Request received", ref: r.ref, body: "Thank you. We have emailed an acknowledgement to <strong>" + esc(c.email) + "</strong>. We will reply with price, availability and freight.", lines: lines, contact: c, account: BS.session && BS.session.signedIn() }); })
        .catch(function (x) { btn.disabled = false; btn.textContent = "Send request"; var m = $("#f-form-e"); m.hidden = false; m.textContent = x.message + " Your list is still saved. Please try again."; });
    } else if (f.matches("[data-order]")) {
      e.preventDefault();
      var addr = $("#o-addr").value.trim(), m = $("#o-form-e");
      if (addr.length < 10) { m.hidden = false; m.textContent = "Enter the delivery address."; $("#o-addr").focus(); return; }
      var pay = (f.querySelector("input[name=pay]:checked") || {}).value || "bank-transfer", a = BS.account();
      var shipTo = { label: "Order", line1: addr.slice(0, 200), line2: addr.slice(200, 400) || undefined, city: a.city || "", state: a.state || "", pin: (addr.match(/\b[1-9]\d{5}\b/) || [""])[0] };
      var ob = f.querySelector("button[type=submit]"); ob.disabled = true;
      BS.api.post("/api/me/orders", { lines: BS.list.lines().map(function (l) { return { id: l.id, qty: l.qty }; }), payment: pay, shipTo: shipTo, poNumber: $("#o-po").value.trim() || undefined })
        .then(function (r) { var lines = BS.list.lines(); BS.list.clear(); BS.session.refresh(); confirmView({ title: "Order placed", ref: r.no || (r.order && r.order.no), body: pay === "credit" ? "Your order has been placed on your credit account. You will receive an email confirmation." : "Your order has been placed. We will send a proforma invoice with the bank details.", lines: lines, contact: { name: a.name, company: a.company }, account: true }); })
        .catch(function (x) { ob.disabled = false; m.hidden = false; m.textContent = x.code === "credit_limit_exceeded" ? "This order is above your available credit. Choose bank transfer or request a quotation." : x.code === "freight_needs_quote" ? "Freight for this order has to be quoted. Please send the quotation request instead." : x.message; });
    }
  });
  BS.on("list", render); BS.on("session", render); BS.on("overlay", render);
  render();
})();
