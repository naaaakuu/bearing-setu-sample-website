/* Account: sign in, then quotations, orders, notifications and profile. All data comes from the API.
   Credit is shown only when the backend says this account is approved for it. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, icon = BS.icon, doc = document;
  var host = $("[data-account]");
  var data = { quotes: null, orders: null, notes: null };
  var accepting = null;

  function arr(r, k) { return Array.isArray(r) ? r : (r && (r[k] || r.items)) || []; }
  function date(s) { try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }
  var QSTAT = { "new": ["Received", "badge"], responded: ["Quotation ready", "badge badge--green"], accepted: ["Accepted", "badge badge--blue"], declined: ["Declined", "badge badge--red"], closed: ["Closed", "badge"], expired: ["Expired", "badge badge--orange"] };
  var OSTAT = { placed: ["Placed", "badge badge--blue"], confirmed: ["Confirmed", "badge badge--blue"], dispatched: ["Dispatched", "badge badge--green"], delivered: ["Delivered", "badge badge--green"], cancelled: ["Cancelled", "badge badge--red"] };
  function pill(m, k) { var s = m[k] || [k, "badge"]; return '<span class="' + s[1] + '">' + esc(s[0]) + "</span>"; }

  /* ---------------------------------------------------------------- signed out */
  function signedOut() {
    if (!BS.api.enabled) {
      host.innerHTML = '<header class="pagehead"><h1 class="h1">Accounts</h1></header><div class="notice">Online accounts are not switched on for this website yet. You can still <a href="quick-order.html#rfq">request a quotation</a> without one.</div>';
      return;
    }
    host.innerHTML = '<header class="pagehead"><h1 class="h1">Sign in</h1><p class="muted">For registered business accounts.</p></header><div class="split"><form class="card formcard" data-login novalidate><div class="field"><label class="label" for="l-email">Email</label><input class="input" id="l-email" type="email" autocomplete="username" required></div><div class="field" style="margin-top:14px"><label class="label" for="l-pass">Password</label><input class="input" id="l-pass" type="password" autocomplete="current-password" required></div><p style="margin-top:16px"><button class="btn btn--lg" type="submit">Sign in</button></p><p class="error" role="alert" data-login-err hidden></p>' +
      (BS.hasDirectContact() ? '<p class="small muted" style="margin-top:12px">Forgotten your password? Contact us and we will help.</p>' : "") + '</form><div class="card card--panel"><h2 class="h3">New here?</h2><p class="muted" style="margin:8px 0 14px">Register your company to keep your details and follow your quotations and orders.</p><a class="btn btn--quiet" href="business.html#register">Register your business</a></div></div>';
  }

  /* ----------------------------------------------------------------- signed in */
  function statusBlock(a) {
    if (a.status === "pending") return '<div class="notice notice--warm"><strong>Your account is waiting for verification.</strong> We are checking your company details. You can request quotations in the meantime, and we will email you when the status changes.</div>';
    if (a.status === "suspended") return '<div class="notice notice--red"><strong>Your account is suspended.</strong> Please contact us to find out why.</div>';
    return "";
  }
  function creditBlock(a) {
    if (!BS.creditApproved()) return ""; // never mention credit to accounts without it
    var c = a.credit, pct = c.limit > 0 ? Math.min(100, Math.round((c.used / c.limit) * 100)) : 0;
    return '<section class="credit-card" aria-labelledby="cr-h"><h2 id="cr-h">Credit</h2><div class="big">' + BS.inr(c.available) + '</div><p class="small">available of ' + BS.inr(c.limit) + (c.termsDays ? " on " + c.termsDays + "-day terms" : "") + '</p><div class="progress" style="margin:10px 0" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Credit used"><span style="width:' + pct + '%"></span></div><p class="small">Outstanding ' + BS.inr(c.used) + ". Pick Credit as the payment method when you place an order.</p></section>";
  }
  function quoteRow(q) {
    var p = q.pricing, ready = q.status === "responded", lines = (q.lines || []).map(function (l) { return "<tr><td>" + esc((l.brand ? l.brand + " " : "") + l.pn) + '</td><td class="r num">' + l.qty + '</td><td class="r num">' + (l.unitPrice != null && l.available !== false ? BS.inr(l.unitPrice) : l.available === false ? "Not available" : "") + "</td></tr>"; }).join("");
    var tot = p ? '<p class="small" style="margin-top:8px">Subtotal ' + BS.inr(p.subtotal) + " · Freight " + BS.inr(p.freight || 0) + " · " + esc(p.gstType || "GST") + " " + BS.inr(p.gstAmount) + " · <strong>Total " + BS.inr(p.total) + "</strong>" + (p.validUntil ? " · Valid until " + esc(date(p.validUntil)) : "") + "</p>" + (p.note ? '<p class="small">' + esc(p.note) + "</p>" : "") : "";
    return '<tr><td data-label="Reference"><details><summary><strong>' + esc(q.ref) + "</strong></summary><div style=\"padding:8px 0\"><div class=\"table-wrap\"><table class=\"table\"><thead><tr><th>Part</th><th class=\"r\">Qty</th><th class=\"r\">Unit price</th></tr></thead><tbody>" + lines + "</tbody></table></div>" + tot + "</div></details></td><td>" + date(q.at) + "</td><td>" + pill(QSTAT, q.status) + "</td><td class=\"r\">" + (ready ? '<button class="btn btn--sm" type="button" data-accept="' + esc(q.ref) + '">Accept</button>' : q.orderNo ? "Order " + esc(q.orderNo) : "") + "</td></tr>";
  }
  function acceptPanel(a) {
    var q = (data.quotes || []).filter(function (x) { return x.ref === accepting; })[0];
    if (!q) return "";
    var creditOK = BS.creditApproved(), total = q.pricing ? q.pricing.total : 0, over = creditOK && a.credit.available < total;
    var ship = (a.shipTo && a.shipTo[0]) || {};
    return '<form class="card" data-accept-form style="margin-top:14px"><h3 class="h3">Accept quotation ' + esc(q.ref) + "</h3><p class=\"muted small\">Total " + BS.inr(total) + " including GST and freight.</p><div class=\"stack\" style=\"margin-top:12px\"><label class=\"opt\"><input type=\"radio\" name=\"pay\" value=\"bank-transfer\" checked><span><strong>Bank transfer</strong><br><span class=\"small muted\">You pay as per the proforma.</span></span></label>" +
      (creditOK ? '<label class="opt' + (over ? " is-off" : "") + '"><input type="radio" name="pay" value="credit"' + (over ? " disabled" : "") + '><span><strong>Credit</strong><br><span class="small muted">' + (over ? "This is above your available credit of " + BS.inr(a.credit.available) + "." : "Available " + BS.inr(a.credit.available) + (a.credit.termsDays ? ", " + a.credit.termsDays + "-day terms" : "") + ".") + "</span></span></label>" : "") + '</div><div class="field" style="margin-top:12px"><label class="label" for="a-addr">Delivery address</label><textarea class="textarea" id="a-addr" maxlength="400" required>' + esc([ship.line1, ship.line2, ship.city, ship.state, ship.pin].filter(Boolean).join(", ")) + '</textarea></div><div class="field" style="margin-top:12px"><label class="label" for="a-po">Purchase order number (optional)</label><input class="input" id="a-po" maxlength="40"></div><p style="margin-top:14px"><button class="btn" type="submit">Place order</button> <button class="btn btn--quiet" type="button" data-cancel-accept>Cancel</button></p><p class="error" role="alert" data-accept-err hidden></p></form>';
  }
  function orderRow(o) {
    var hist = (o.history || []).map(function (h) { return "<li>" + esc(date(h.at)) + ": " + esc(h.status) + (h.note ? " (" + esc(h.note) + ")" : "") + "</li>"; }).join("");
    var tr = o.tracking && o.tracking.ref ? esc(o.tracking.carrier || "Carrier") + " " + esc(o.tracking.ref) : "";
    return "<tr><td><details><summary><strong>" + esc(o.no) + "</strong></summary><ul class=\"hist\">" + hist + "</ul>" + (tr ? '<p class="small">Tracking: ' + tr + "</p>" : "") + "</details></td><td>" + date(o.at) + "</td><td>" + pill(OSTAT, o.status) + '</td><td class="r num">' + BS.inr(o.total) + "</td><td>" + (o.payment ? esc(o.payment.method === "credit" ? "Credit" : "Bank transfer") + " · " + esc(o.payment.status) : "") + '</td><td class="r"><button class="btn btn--sm btn--quiet" type="button" data-reorder="' + esc(o.no) + '">Reorder</button></td></tr>';
  }
  function table(head, rows, empty) {
    if (!rows.length) return '<p class="muted">' + empty + "</p>";
    return '<div class="table-wrap dtable"><table class="table"><thead><tr>' + head.map(function (h, i) { return '<th scope="col"' + (/Total|^$/.test(h) ? ' class="r"' : "") + ">" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
  }
  function signedIn(a) {
    var unread = (data.notes || []).filter(function (n) { return !n.read; }).length;
    host.innerHTML = '<div class="acct-head"><div><h1>' + esc(a.company) + '</h1><p class="muted">GSTIN ' + esc(a.gstin || "not provided") + " · " + esc(a.email) + '</p></div><div><button class="btn btn--quiet" type="button" data-logout>Sign out</button></div></div>' + statusBlock(a) +
      '<div class="acct-grid">' + creditBlock(a) + '<div class="card"><h2 class="h3" style="margin-bottom:10px">Account</h2><dl class="kv"><dt>Status</dt><dd>' + esc(a.status === "verified" ? "Verified" : a.status === "pending" ? "Awaiting verification" : "Suspended") + "</dd><dt>Contact</dt><dd>" + esc(a.name) + "</dd><dt>Phone</dt><dd>" + esc(a.phone || "") + "</dd>" + (a.discountPct > 0 && a.status === "verified" ? "<dt>Your pricing</dt><dd>Account pricing applied</dd>" : "") + "</dl></div></div>" +
      '<section class="acct-sec" id="notifications"><h2>Notifications ' + (unread ? '<span class="badge badge--blue">' + unread + " new</span>" : "") + "</h2>" + ((data.notes || []).length ? '<ul class="nlist">' + data.notes.slice(0, 8).map(function (n) { return '<li class="' + (n.read ? "" : "is-new") + '"><strong>' + esc(n.title) + '</strong><div class="small">' + esc(n.body || "") + "</div><time>" + esc(date(n.at)) + "</time></li>"; }).join("") + "</ul>" + (unread ? '<p style="margin-top:10px"><button class="btn btn--sm btn--quiet" type="button" data-read-all>Mark all as read</button></p>' : "") : '<p class="muted">Nothing yet.</p>') + "</section>" +
      '<section class="acct-sec" id="quotes"><h2>Quotations</h2>' + table(["Reference", "Date", "Status", ""], (data.quotes || []).map(quoteRow), 'No quotations yet. <a href="quick-order.html#rfq">Request one</a>.') + (accepting ? acceptPanel(a) : "") + "</section>" +
      '<section class="acct-sec" id="orders"><h2>Orders</h2>' + table(["Order", "Date", "Status", "Total", "Payment", ""], (data.orders || []).map(orderRow), "No orders yet.") + "</section>" +
      '<section class="acct-sec" id="profile"><h2>Profile</h2><form class="card formcard" data-profile novalidate><div class="form-grid"><div class="field"><label class="label" for="p-name">Name</label><input class="input" id="p-name" value="' + esc(a.name) + '" maxlength="80"></div><div class="field"><label class="label" for="p-phone">Phone</label><input class="input" id="p-phone" value="' + esc(a.phone || "") + '" maxlength="20"></div><div class="field"><label class="label" for="p-city">City</label><input class="input" id="p-city" value="' + esc(a.city || "") + '" maxlength="60"></div><div class="field"><label class="label" for="p-state">State</label><input class="input" id="p-state" value="' + esc(a.state || "") + '" maxlength="60"></div></div><p style="margin-top:14px"><button class="btn btn--quiet" type="submit">Save changes</button></p><p class="small" data-profile-msg role="status"></p></form></section>';
  }

  function load() {
    var a = BS.account();
    if (!BS.api.enabled || !BS.session.signedIn() || !a) { signedOut(); return; }
    signedIn(a);
    Promise.all([BS.api.get("/api/me/quotes").then(function (r) { data.quotes = arr(r, "quotes"); }), BS.api.get("/api/me/orders").then(function (r) { data.orders = arr(r, "orders"); }), BS.api.get("/api/me/notifications").then(function (r) { data.notes = arr(r, "items"); })])
      .then(function () { signedIn(BS.account()); }).catch(function (e) { if (e.status !== 401) BS.toast(e.message, { error: true }); });
  }

  doc.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.matches("[data-login]")) {
      e.preventDefault();
      var err = $("[data-login-err]"), btn = f.querySelector("button[type=submit]"); err.hidden = true; btn.disabled = true;
      BS.session.login($("#l-email").value.trim(), $("#l-pass").value).then(function () { load(); })
        .catch(function (x) { err.hidden = false; err.textContent = x.status === 403 ? "This account is suspended. Please contact us." : x.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : x.status === 401 ? "Email or password is not correct." : x.message; btn.disabled = false; });
    } else if (f.matches("[data-profile]")) {
      e.preventDefault();
      var msg = $("[data-profile-msg]");
      BS.api.patch("/api/me", { name: $("#p-name").value.trim(), phone: $("#p-phone").value.trim(), city: $("#p-city").value.trim(), state: $("#p-state").value.trim() }).then(function () { return BS.session.refresh(); }).then(function () { msg.textContent = "Saved."; }).catch(function (x) { msg.textContent = x.message; });
    } else if (f.matches("[data-accept-form]")) {
      e.preventDefault();
      var m = $("[data-accept-err]"), pay = (f.querySelector("input[name=pay]:checked") || {}).value || "bank-transfer", addr = $("#a-addr").value.trim();
      if (addr.length < 10) { m.hidden = false; m.textContent = "Enter the delivery address."; return; }
      var ab = f.querySelector("button[type=submit]"); ab.disabled = true;
      BS.api.post("/api/me/quotes/" + encodeURIComponent(accepting) + "/accept", { payment: pay, shipTo: { label: "Order", line1: addr.slice(0, 200), line2: addr.slice(200, 400) || undefined, city: BS.account().city || "", state: BS.account().state || "", pin: (addr.match(/\b[1-9]\d{5}\b/) || [""])[0] }, poNumber: $("#a-po").value.trim() || undefined })
        .then(function () { accepting = null; BS.toast("Order placed. You will receive an email confirmation."); return BS.session.refresh(); }).then(load)
        .catch(function (x) { ab.disabled = false; m.hidden = false; m.textContent = x.code === "credit_limit_exceeded" ? "This order is above your available credit." : x.code === "credit_not_enabled" ? "Credit is not enabled on this account." : x.message; });
    }
  });
  doc.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement; if (!t || !t.closest) return;
    if (t.closest("[data-logout]")) { BS.session.logout(); data = { quotes: null, orders: null, notes: null }; load(); return; }
    var ac = t.closest("[data-accept]"); if (ac) { accepting = ac.getAttribute("data-accept"); signedIn(BS.account()); var f = $("[data-accept-form]"); if (f) f.scrollIntoView({ block: "center" }); return; }
    if (t.closest("[data-cancel-accept]")) { accepting = null; signedIn(BS.account()); return; }
    var ro = t.closest("[data-reorder]");
    if (ro) { BS.api.post("/api/me/orders/" + encodeURIComponent(ro.getAttribute("data-reorder")) + "/reorder-lines", {}).then(function (r) { var n = 0; (r.lines || []).forEach(function (l) { if (BS.byId(l.id)) { BS.list.add(l.id, l.qty); n++; } }); BS.toast(n ? n + " parts added to your quote list" : "None of those parts are in the catalogue any more.", n ? { action: { label: "View list", fn: BS.openList } } : { error: true }); }).catch(function (x) { BS.toast(x.message, { error: true }); }); return; }
    if (t.closest("[data-read-all]")) BS.api.post("/api/me/notifications/read", {}).then(function () { (data.notes || []).forEach(function (n) { n.read = true; }); signedIn(BS.account()); });
  });
  BS.on("session", function (a) { if (!a) load(); });
  (BS.api.ready || Promise.resolve()).then(load);
})();
