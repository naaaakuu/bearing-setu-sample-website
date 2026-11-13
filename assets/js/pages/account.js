/* Account dashboard (account.html) and the shared order data.
   The first half builds the sample business account and its orders, invoices, credit and
   timelines, and exposes them as window.BSA. support.html tracks the same orders and
   checkout.html reads the same credit balance and draws the same invoice, so an order shows
   the same dates, payment state and totals wherever it is opened.
   The second half runs only on the account page. */
(function () {
  "use strict";
  var BS = window.BS;
  if (!BS) return;
  var $ = BS.$, $$ = BS.$$, esc = BS.esc, inr = BS.inr, icon = BS.icon;

  /* ================================================================ dates */
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function D(x) { return x instanceof Date ? new Date(x.getTime()) : new Date(x); }
  function valid(x) { return x instanceof Date && !isNaN(x.getTime()); }
  function fmtDate(x, o) {
    x = D(x); o = o || {};
    if (!valid(x)) return "";
    var s = (o.day ? DAY[x.getDay()] + ", " : "") + x.getDate() + " " + MON[x.getMonth()];
    if (!o.short) s += " " + x.getFullYear();
    return s;
  }
  function fmtTime(x) {
    x = D(x);
    var h = x.getHours(), m = x.getMinutes();
    var ap = h < 12 ? "am" : "pm";
    h = h % 12 || 12;
    return h + (m ? ":" + (m < 10 ? "0" : "") + m : "") + " " + ap;
  }
  function fmtDT(x) { return fmtDate(x, { short: true }) + ", " + fmtTime(x); }
  function isWork(x) { return x.getDay() !== 0; }
  function addDays(x, n) { var y = D(x); y.setDate(y.getDate() + n); return y; }
  function at(x, h, m) { var y = D(x); y.setHours(h, m || 0, 0, 0); return y; }
  function nextWork(x) { var y = addDays(x, 1); while (!isWork(y)) y = addDays(y, 1); return y; }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function startOfDay(x) { return at(x, 0, 0); }
  function relDay(x) {
    var now = new Date();
    if (sameDay(x, now)) return "today";
    if (sameDay(x, addDays(now, 1))) return "tomorrow";
    return fmtDate(x, { day: true, short: true });
  }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  // A stored date, or null when it is missing or unreadable (new Date(null) would be 1970).
  function when(x) { if (x == null || x === "") return null; var d = D(x); return valid(d) ? d : null; }
  function fmtMobile(m) { m = String(m || ""); return m.length === 10 ? m.slice(0, 5) + " " + m.slice(5) : m; }

  /* =============================================================== account */
  // One sample account and one seller identity for the whole site (site.js).
  var ACCOUNT = BS.ACCOUNT;
  var SELLER = BS.SELLER;

  var DEFAULT_ADDRS = [
    { id: "cbe", label: "Coimbatore mill", name: "Lakshmi Narayanan", line1: "SF No. 118/2, Sathy Road", line2: "Saravanampatti", city: "Coimbatore", state: "Tamil Nadu", pin: "641035", note: "Stores, gate 2. Receiving 9 am to 5 pm.", isDefault: true },
    { id: "tpr", label: "Tiruppur unit", name: "R. Senthil Kumar", line1: "Plot 42, SIDCO Industrial Estate", line2: "Mudalipalayam", city: "Tiruppur", state: "Tamil Nadu", pin: "641606", note: "Maintenance store, ask for the shift engineer." }
  ];
  function addresses() {
    var a = BS.store.get("acctAddresses", null);
    a = Array.isArray(a) ? a.filter(function (x) { return x && typeof x === "object" && x.id && x.label; }) : [];
    return a.length ? a : DEFAULT_ADDRS.map(function (x) { return Object.assign({}, x); });
  }
  function addrById(id) { return addresses().filter(function (a) { return a.id === id; })[0] || DEFAULT_ADDRS.filter(function (a) { return a.id === id; })[0]; }

  var PAY = { credit: "30-day credit", neft: "Bank transfer (NEFT/RTGS)", upi: "UPI", card: "Card or netbanking" };

  /* Six past orders, Aug to Nov 2026, built from real catalogue ids. The three unpaid credit
     invoices (BS-2610-2290, BS-2611-0583, BS-2611-4821) add up to the ₹53,680 credit used.
     Each step has a fixed time; normSample() decides from the clock which steps have happened,
     so an order never shows a step from the future as done. Expected delivery follows the
     zones on policies.html#shipping: Coimbatore and Tiruppur are 4 working days after dispatch. */
  var SAMPLE = [
    { id: "BS-2611-6034", date: "2026-11-13T09:20:00+05:30", status: "Packed", addr: "tpr", pay: "neft", paid: "2026-11-13T09:52:00+05:30", po: "KSM/TPR/PO/2611/41", courier: "Delhivery", awb: "1490218842107", inv: "INV/26-27/01142",
      lines: [["fag-6204-2rsr", 60], ["gates-800-8m-20", 4], ["fenner-a33", 10]],
      ev: { packed: "2026-11-13T13:45:00+05:30" },
      exp: { dispatched: "2026-11-13T18:00:00+05:30", out: "2026-11-18T09:00:00+05:30", delivered: "2026-11-18T14:00:00+05:30" }, recv: "R. Senthil Kumar" },
    { id: "BS-2611-4821", date: "2026-11-11T10:42:00+05:30", status: "Dispatched", addr: "cbe", pay: "credit", po: "KSM/MNT/PO/2611/118", courier: "Blue Dart", awb: "50948271630", inv: "INV/26-27/01131", recv: "K. Prakash",
      lines: [["skf-6205-2rs1-c3", 20], ["gates-1000-5m-15", 4], ["skf-lgmt-2-1kg", 6]],
      ev: { packed: "2026-11-11T15:10:00+05:30", dispatched: "2026-11-11T18:05:00+05:30" },
      scans: [["2026-11-12T04:30:00+05:30", "Left the Blue Dart Pune hub"], ["2026-11-13T06:10:00+05:30", "Arrived at the Blue Dart Coimbatore hub"]],
      exp: { out: "2026-11-16T09:00:00+05:30", delivered: "2026-11-16T14:00:00+05:30" } },
    { id: "BS-2611-0583", date: "2026-11-04T11:05:00+05:30", status: "Delivered", addr: "tpr", pay: "credit", po: "KSM/TPR/PO/2611/07", courier: "Delhivery", awb: "1490217735562", inv: "INV/26-27/01024", recv: "S. Murugan",
      lines: [["fenner-b43", 10], ["ntn-ucp205d1", 3], ["skf-6202-2rs1", 40], ["nok-tc-30x47x7", 50]],
      ev: { packed: "2026-11-04T14:30:00+05:30", dispatched: "2026-11-04T17:50:00+05:30", out: "2026-11-07T08:40:00+05:30", delivered: "2026-11-07T13:15:00+05:30" } },
    { id: "BS-2610-2290", date: "2026-10-21T09:58:00+05:30", status: "Delivered", addr: "cbe", pay: "credit", po: "KSM/MNT/PO/2610/096", courier: "Blue Dart", awb: "50947730214", inv: "INV/26-27/00873", recv: "K. Prakash",
      lines: [["fag-6204-2rsr", 40], ["skf-6205-2rs1", 16], ["gates-800-8m-20", 3], ["skf-lgmt-2-1kg", 3], ["nok-tc-25x52x7", 20]],
      ev: { packed: "2026-10-21T13:20:00+05:30", dispatched: "2026-10-21T17:35:00+05:30", out: "2026-10-23T09:05:00+05:30", delivered: "2026-10-23T12:40:00+05:30" } },
    { id: "BS-2609-7716", date: "2026-09-24T16:12:00+05:30", status: "Cancelled", addr: "cbe", pay: "credit", po: "KSM/MNT/PO/2609/081",
      lines: [["skf-22208-e", 2], ["skf-lgep-2-1kg", 2]],
      ev: { cancelled: "2026-09-24T17:02:00+05:30" }, note: "Cancelled by you before packing. No invoice was raised and no credit was used." },
    { id: "BS-2608-3127", date: "2026-08-14T10:20:00+05:30", status: "Delivered", addr: "cbe", pay: "credit", paid: "2026-09-11T11:00:00+05:30", po: "KSM/MNT/PO/2608/064", courier: "Blue Dart", awb: "50943318807", inv: "INV/26-27/00418", recv: "K. Prakash",
      lines: [["fag-6204-2rsr", 100], ["skf-6205-2rs1", 50], ["skf-lgmt-2-18kg", 1], ["fenner-a33", 20], ["nok-tc-25x52x7", 50]],
      ev: { packed: "2026-08-14T14:05:00+05:30", dispatched: "2026-08-14T17:40:00+05:30", out: "2026-08-18T08:55:00+05:30", delivered: "2026-08-18T12:30:00+05:30" } }
  ];
  var SAMPLE_TRACK = { id: "BS-2611-4821", pin: "641035" };
  var STATUSES = ["Confirmed", "Packed", "Dispatched", "Delivered", "Cancelled"];
  var STEP_KEYS = ["confirmed", "packed", "dispatched", "out", "delivered"];

  function computeTotals(lines, ship) {
    var sub = r2(lines.reduce(function (s, l) { return s + l.amount; }, 0));
    if (ship == null) ship = sub >= BS.FREE_SHIP ? 0 : BS.SHIP_FEE;
    var taxable = r2(sub + ship);
    var tax = r2(taxable * BS.GST);
    var total = Math.round(taxable * (1 + BS.GST));
    return { sub: sub, discount: 0, ship: ship, taxable: taxable, tax: tax, total: total, roundOff: r2(total - taxable - tax) };
  }
  function lineOf(id, qty, unit, extra) {
    var p = BS.byId(id);
    qty = Math.max(1, parseInt(qty, 10) || 1);
    var u = unit != null ? unit : p ? BS.unitPrice(p, qty) : 0;
    var b = p ? BS.brand(p.brand).name : (extra && extra.brand) || "";
    return { id: id, p: p || null, qty: qty, unit: u, amount: r2(u * qty), pn: p ? p.pn : (extra && extra.pn) || id, brand: b, title: p ? p.title : "", hsn: p ? p.hsn : "" };
  }

  /* Dispatch and delivery for an order placed through checkout. Checkout stores the dispatch
     day and the delivery (or pick-up) date it promised, so those are used as they are. An
     order saved without them gets the same BS.schedule answer for its pincode. Parts are
     packed by 4 pm and dispatched by 6 pm on the dispatch day, as the confirmation says.
     fresh: ignore the stored dates (a bank transfer that arrived later restarts the clock). */
  function planOf(o, from, mode, lines, pin, fresh) {
    var dl = !fresh && o.delivery && typeof o.delivery === "object" ? o.delivery : {};
    var dispatch = when(dl.dispatch), eta = when(dl.eta);
    if (!dispatch || !eta) {
      var s = BS.schedule(lines.map(function (l) { return { id: l.id, qty: l.qty }; }), from, pin);
      dispatch = s.dispatch;
      eta = mode === "pickup" ? s.pickup.ready : mode === "express" ? s.express.on : s.standard.to;
    }
    if (mode === "pickup") return { packed: eta, dispatched: eta, out: null, delivered: null };
    return { packed: at(dispatch, 16, 0), dispatched: at(dispatch, 18, 0), out: at(eta, 9, 0), delivered: at(eta, 14, 0) };
  }

  function normSample(s, now) {
    now = now || new Date();
    var a = addrById(s.addr);
    var lines = s.lines.map(function (l) { return lineOf(l[0], l[1]); });
    var t = computeTotals(lines);
    var ev = { confirmed: D(s.date) }, exp = {};
    var status = s.status;
    var paid = s.paid && D(s.paid) <= now ? D(s.paid) : null;
    // A bank transfer that has not arrived yet: nothing is packed, so no dates are promised.
    var awaiting = s.pay === "neft" && !paid && status !== "Cancelled";
    if (status === "Cancelled") {
      Object.keys(s.ev || {}).forEach(function (k) { ev[k] = D(s.ev[k]); });
    } else if (awaiting) {
      status = "Confirmed";
    } else {
      var plan = Object.assign({}, s.ev || {}, s.exp || {});
      Object.keys(plan).forEach(function (k) { var at = D(plan[k]); if (at <= now) ev[k] = at; else exp[k] = at; });
      status = ev.delivered ? "Delivered" : ev.dispatched ? "Dispatched" : ev.packed ? "Packed" : "Confirmed";
    }
    var o = {
      id: s.id, date: D(s.date), status: status, sample: true, lines: lines, totals: t, addr: a, mode: "standard",
      courier: s.courier || "", awb: s.awb || "", po: s.po || "", payKey: s.pay, payLabel: PAY[s.pay] || s.pay, awaiting: awaiting,
      ev: ev, exp: exp, scans: (s.scans || []).map(function (x) { return [D(x[0]), x[1]]; }).filter(function (x) { return x[0] <= now; }),
      note: s.note || "", recv: ev.delivered ? s.recv || "" : "",
      paid: paid, invNo: s.inv || "", billTo: { company: ACCOUNT.company, gstin: ACCOUNT.gstin, state: ACCOUNT.state }, billAddr: addrById("cbe"),
      contact: {}, shipLabel: "Standard delivery", coupon: ""
    };
    return o;
  }

  function normReal(o) {
    if (!o || !o.id) return null;
    var date = D(o.date || o.created || o.createdAt || o.placed);
    if (!valid(date)) return null;
    var rawLines = Array.isArray(o.lines) ? o.lines : Array.isArray(o.items) ? o.items : [];
    var lines = rawLines.map(function (l) {
      var id = l.id || l.pid || "";
      var qty = parseInt(l.qty || l.quantity, 10) || 1;
      var unit = num(l.unit != null ? l.unit : l.price);
      var L = lineOf(id, qty, unit, { pn: l.pn, brand: l.brand ? BS.brand(l.brand).name : "" });
      if (num(l.total) != null) L.amount = num(l.total);
      if (!L.title && l.title) L.title = String(l.title);
      if (!L.hsn && l.hsn) L.hsn = String(l.hsn);
      return L;
    }).filter(function (l) { return l.pn; });
    if (!lines.length) return null;
    var tt = o.totals || {};
    var sub = num(tt.sub != null ? tt.sub : tt.subtotal);
    var calc = computeTotals(lines);
    sub = sub != null ? sub : calc.sub;
    var discount = Math.abs(num(tt.discount != null ? tt.discount : typeof tt.coupon === "number" ? tt.coupon : null) || 0);
    var ship = num(tt.ship != null ? tt.ship : tt.shipping != null ? tt.shipping : tt.delivery);
    if (ship == null) ship = calc.ship;
    var taxable = r2(sub - discount + ship);
    var tax = num(tt.gst != null ? tt.gst : tt.tax);
    if (tax == null) tax = r2(taxable * BS.GST);
    var total = num(tt.total);
    if (total == null) total = Math.round(taxable + tax);
    var totals = { sub: sub, discount: discount, ship: ship, taxable: taxable, tax: tax, total: total, roundOff: r2(total - taxable - tax) };
    // Keep checkout's own GST split, so the invoice prints the same CGST, SGST or IGST figures.
    if (typeof tt.intra === "boolean") { totals.intra = tt.intra; totals.cgst = num(tt.cgst); totals.sgst = num(tt.sgst); totals.igst = num(tt.igst); }

    var a = o.address || o.shipping || {};
    var addr = {
      label: a.label || "", name: a.name || a.fullName || (o.contact && o.contact.name) || "",
      line1: a.line1 || a.address1 || a.addr1 || a.street || "", line2: a.line2 || a.address2 || a.addr2 || "",
      city: a.city || "", state: a.state || "", pin: String(a.pincode || a.pin || a.zip || a.postcode || o.pincode || "")
    };
    var dl = o.delivery;
    var dKey = String(typeof dl === "string" ? dl : dl ? dl.method || dl.id || dl.key || dl.label || dl.name || "" : "").toLowerCase();
    var mode = /pick/.test(dKey) ? "pickup" : /express/.test(dKey) ? "express" : "standard";
    var pm = o.payment || o.pay || o.paymentMethod;
    var pMethod = pm && typeof pm === "object" ? String(pm.method || "") : "";
    var pLabel = String(typeof pm === "string" ? pm : pm ? pm.label || pm.method || pm.id || pm.name || "" : "");
    var pKey = PAY[pMethod] && /^(credit|neft|upi|card)$/.test(pMethod) ? pMethod :
      /credit/i.test(pLabel) ? "credit" : /neft|rtgs|bank/i.test(pLabel) ? "neft" : /upi/i.test(pLabel) ? "upi" : pLabel ? "card" : "";
    // UPI and card are paid when the order is placed. A bank transfer is paid only once it
    // arrives (payment.paidAt); until then the order waits and promises no dispatch date.
    var paidAt = pm && typeof pm === "object" ? when(pm.paidAt) : null;
    var paid = pKey === "upi" || pKey === "card" ? date : pKey === "neft" ? paidAt : null;
    var c = o.contact || {};
    var now = new Date();
    var stored = String(o.status || "Confirmed");
    var ev = { confirmed: date }, exp = {};
    var status = "Confirmed";
    var awaiting = false;
    if (/cancel/i.test(stored)) { status = "Cancelled"; ev.cancelled = D(o.cancelledAt || date); }
    else if (pKey === "neft" && !paid) { awaiting = true; }
    else {
      var sch = planOf(o, pKey === "neft" ? paid : date, mode, lines, addr.pin, pKey === "neft");
      ["packed", "dispatched", "out", "delivered"].forEach(function (k) {
        if (!sch[k]) return;
        if (sch[k] <= now) ev[k] = sch[k]; else exp[k] = sch[k];
      });
      status = ev.delivered ? "Delivered" : ev.dispatched ? "Dispatched" : ev.packed ? "Packed" : "Confirmed";
      if (/deliver/i.test(stored)) status = "Delivered";
    }
    var h = hash(o.id);
    var courier = mode === "pickup" ? "" : (h % 2 ? "Blue Dart" : "Delhivery");
    var awb = mode === "pickup" ? "" : courier === "Blue Dart" ? "509" + String(10000000 + (h % 89999999)).slice(0, 8) : "14902" + String(10000000 + (h % 89999999)).slice(0, 8);
    var gstin = c.gstin || o.gstin || "";
    var cpn = typeof tt.coupon === "string" ? tt.coupon : tt.coupon && typeof tt.coupon === "object" ? String(tt.coupon.code || "") : "";
    return {
      id: String(o.id), date: date, status: status, sample: false, lines: lines, totals: totals, addr: addr, mode: mode,
      courier: courier, awb: awb, po: c.po || o.po || "", payKey: pKey, payLabel: PAY[pKey] || pLabel || "Paid online", awaiting: awaiting,
      ev: ev, exp: exp, scans: [], note: status === "Cancelled" ? "This order was cancelled." : "", recv: "",
      paid: paid, invNo: typeof o.invoice === "string" && /^INV\//.test(o.invoice) ? o.invoice : "", real: true,
      billTo: { company: c.business === false ? "" : c.company || c.companyName || "", gstin: gstin, state: addr.state, name: addr.name },
      contact: { email: c.email || "", mobile: c.mobile || "" },
      shipLabel: dl && typeof dl === "object" && dl.label ? String(dl.label) : "", coupon: cpn
    };
  }

  function orders() {
    var raw = BS.store.get("orders", []);
    var real = [], bad = 0;
    (Array.isArray(raw) ? raw : []).forEach(function (o) {
      try { var n = normReal(o); if (n) real.push(n); else bad++; } catch (e) { bad++; }
    });
    var ids = {}, now = new Date();
    real.forEach(function (o) { ids[o.id] = 1; });
    // a sample order whose time has not come yet (clock earlier than its date) is left out
    var all = real.concat(SAMPLE.filter(function (s) { return !ids[s.id] && D(s.date) <= now; }).map(function (s) { return normSample(s, now); }));
    all.sort(function (a, b) { return b.date - a.date; });
    all.unreadable = bad;
    return all;
  }
  function find(id) {
    var key = String(id || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!key) return null;
    return orders().filter(function (o) { return o.id.toUpperCase() === key; })[0] || null;
  }

  /* Invoices: one per order that was not cancelled. Issued on dispatch (or at order time for
     orders placed on this device, so checkout's invoice matches this list). */
  function fy(d) { var y = d.getFullYear() % 100; var s = d.getMonth() >= 3 ? y : y - 1; return s + "-" + (s + 1); }
  function invoiceOf(o) {
    if (o.status === "Cancelled") return null;
    var date = o.real ? o.date : o.ev.dispatched || null;
    if (!date) return null;
    var no = o.invNo || "INV/" + fy(date) + "/" + String(1200 + (hash(o.id) % 700)).padStart(5, "0");
    var due = o.payKey === "credit" ? addDays(startOfDay(date), 30) : null;
    // paid, due or overdue (30-day credit), or awaiting (a bank transfer that has not arrived)
    var state = "paid";
    if (o.payKey === "credit" && !o.paid) state = startOfDay(new Date()) > due ? "overdue" : "due";
    else if (o.awaiting) state = "awaiting";
    return { no: no, date: date, due: due, state: state, paid: o.paid, order: o };
  }
  function invoices() { return orders().map(invoiceOf).filter(Boolean); }
  /* The credit line: unpaid invoices on 30-day credit, sample and placed on this device.
     Checkout reads the same figures, so both pages show one available balance. */
  function credit() {
    var due = invoices().filter(function (i) { return i.order.payKey === "credit" && i.state !== "paid"; });
    var used = r2(due.reduce(function (s, i) { return s + i.order.totals.total; }, 0));
    var next = due.slice().sort(function (a, b) { return a.due - b.due; })[0] || null;
    var nextAmt = next ? due.filter(function (i) { return sameDay(i.due, next.due); }).reduce(function (s, i) { return s + i.order.totals.total; }, 0) : 0;
    return { limit: ACCOUNT.limit, used: used, avail: Math.max(0, r2(ACCOUNT.limit - used)), next: next, nextAmt: nextAmt, dueCount: due.length };
  }
  // "UPI · paid", "30-day credit · due 13 Dec", "Bank transfer (NEFT/RTGS) · awaiting transfer"
  function payText(o, inv) {
    if (inv === undefined) inv = invoiceOf(o);
    // before dispatch a sample order has no invoice yet, but a bank transfer may already be in
    var st = inv ? inv.state : o.awaiting ? "awaiting" : o.paid ? "paid" : "";
    if (st === "awaiting") return o.payLabel + " · awaiting transfer";
    if ((st === "due" || st === "overdue") && inv.due) return o.payLabel + " · due " + fmtDate(inv.due, { short: true });
    if (st === "paid" && o.paid) return o.payLabel + " · paid";
    return o.payLabel;
  }

  /* Tracking timeline for an order: five steps with dates, the current one marked. */
  function timeline(o) {
    var pickup = o.mode === "pickup";
    var labels = pickup ? ["Confirmed", "Packed", "Ready for pick up", "", "Picked up"] : ["Confirmed", "Packed", "Dispatched", "Out for delivery", "Delivered"];
    var idx = { Confirmed: 0, Packed: 1, Dispatched: 2, Delivered: 4 }[o.status];
    if (o.status === "Dispatched" && o.ev.out) idx = 3;
    var cancelled = o.status === "Cancelled";
    var steps = [];
    STEP_KEYS.forEach(function (k, i) {
      if (!labels[i]) return;
      var when = o.ev[k] || null, expd = !when ? o.exp[k] || null : null;
      var st = cancelled ? (i === 0 ? "done" : "void") : i < idx ? "done" : i === idx ? (i === 4 ? "done" : "current") : "next";
      if (!cancelled && i === 4 && idx === 4) st = "current";
      var detail = "", wait = "";
      var shipped = !!(o.ev.dispatched || o.ev.delivered);
      if (o.awaiting) {
        // Nothing is packed until the transfer arrives, so the later steps carry no dates.
        if (k === "confirmed") detail = "Waiting for your bank transfer of " + inr(o.totals.total) + ". Use " + o.id + " as the payment reference.";
        else wait = k === "packed" ? "After your transfer arrives" : "Not yet";
        if (k === "dispatched" && !pickup) detail = "We pack and dispatch once the transfer reaches our account.";
      } else {
        if (k === "dispatched" && !pickup && o.courier && shipped) detail = o.courier + " · AWB " + o.awb;
        if (k === "dispatched" && !pickup && !shipped && !cancelled) detail = "Courier and AWB are added at dispatch.";
      }
      if (k === "dispatched" && pickup) detail = "Bhosari MIDC, Pune 411026. Bring the order number and a photo ID.";
      if (k === "delivered" && when && o.recv) detail = "Received by " + o.recv;
      steps.push({ key: k, label: labels[i], at: when, expected: expd, state: st, detail: detail, wait: wait, scans: k === "dispatched" ? o.scans : [] });
    });
    return { steps: steps, cancelled: cancelled, idx: idx };
  }
  function etaText(o) {
    if (o.status === "Cancelled") return "Cancelled " + fmtDate(o.ev.cancelled || o.date, { short: true });
    if (o.status === "Delivered") return "Delivered " + fmtDate(o.ev.delivered || o.date, { day: true, short: true });
    if (o.awaiting) return "Waiting for your bank transfer";
    if (o.mode === "pickup") { var r = o.ev.dispatched || o.exp.dispatched; return r ? "Ready for pick up " + relDay(r) + (o.ev.dispatched ? "" : ", from " + fmtTime(r)) : "Ready for pick up soon"; }
    var e = o.exp.delivered || o.ev.delivered;
    if (!e) return "Arriving soon";
    var rel = relDay(e);
    return "Arriving " + (rel === "today" || rel === "tomorrow" ? rel : "by " + rel);
  }

  /* --------------------------------------------------------- tax invoice doc */
  /* One template for every tax invoice: BS.bag.docHTML in cart.js, which also draws the
     quotation. It is filled from this order data wherever the invoice is opened (the checkout
     confirmation, Orders and Invoices here), so one invoice number always shows the same
     seller, lines, batches, totals and amount in words. Needs cart.js on the page. */
  var STATE_CODES = { "Jammu and Kashmir": "01", "Himachal Pradesh": "02", "Punjab": "03", "Chandigarh": "04", "Uttarakhand": "05", "Haryana": "06", "Delhi": "07", "Rajasthan": "08", "Uttar Pradesh": "09", "Bihar": "10", "Sikkim": "11", "Arunachal Pradesh": "12", "Nagaland": "13", "Manipur": "14", "Mizoram": "15", "Tripura": "16", "Meghalaya": "17", "Assam": "18", "West Bengal": "19", "Jharkhand": "20", "Odisha": "21", "Chhattisgarh": "22", "Madhya Pradesh": "23", "Gujarat": "24", "Dadra and Nagar Haveli and Daman and Diu": "26", "Maharashtra": "27", "Karnataka": "29", "Goa": "30", "Lakshadweep": "31", "Kerala": "32", "Tamil Nadu": "33", "Puducherry": "34", "Andaman and Nicobar Islands": "35", "Telangana": "36", "Andhra Pradesh": "37", "Ladakh": "38" };
  function codeOf(state, gstin) { return BS.own(STATE_CODES, state) ? STATE_CODES[state] : gstin ? String(gstin).slice(0, 2) : ""; }
  function batchCode(o, l, i) {
    var h = hash(o.id + l.pn + i);
    var wk = 1 + (h % 40);
    return (o.date.getFullYear() % 100) + String(wk).padStart(2, "0") + "ABCDEFGHJK".charAt(h % 10) + (h % 9 + 1);
  }
  function addrHTML(a) {
    return [a.line1, a.line2, [a.city, a.pin].filter(Boolean).join(" "), a.state].filter(Boolean).map(esc).join("<br>");
  }
  // Address lines as the invoice prints them: line 1, line 2, then "City, State 641035".
  function docAddr(a) {
    var last = [a.city, a.state].filter(Boolean).join(", ") + (a.pin ? " " + a.pin : "");
    return [a.line1, a.line2, last.trim()].filter(Boolean).map(esc).join("<br>");
  }
  function payTerms(o, inv) {
    if (inv.state === "due" || inv.state === "overdue") return "30-day credit, due " + fmtDate(inv.due);
    if (inv.state === "awaiting") return "Bank transfer, awaiting payment";
    return o.paid ? o.payLabel + ", paid" : o.payLabel;
  }
  function invoiceHTML(o) {
    var bag = BS.bag, inv = o && invoiceOf(o);
    if (!bag || !inv) return "";
    var t = o.totals, a = o.addr || {}, ba = o.billAddr || a, bt = o.billTo || {}, c = o.contact || {};
    var intra = typeof t.intra === "boolean" ? t.intra : /^maharashtra$/i.test(a.state || "");
    var cgst = intra ? (t.cgst != null ? t.cgst : r2(t.tax / 2)) : 0;
    var sgst = intra ? (t.sgst != null ? t.sgst : r2(t.tax - cgst)) : 0;
    var code = codeOf(a.state);
    var bcode = codeOf(ba.state, bt.gstin);
    var billTo = (bt.gstin ? "<strong>" + esc(bt.company || bt.name || a.name || "") + "</strong><br>GSTIN " + esc(bt.gstin) : "<strong>" + esc(bt.name || a.name || "Customer") + "</strong><br>Unregistered buyer") +
      "<br>" + docAddr(ba) + (bcode ? "<br>State code " + esc(bcode) : "") + (o.po ? "<br>Your PO " + esc(o.po) : "") + (c.email ? "<br>" + esc(c.email) : "");
    var shipTo = o.mode === "pickup" ? "<strong>" + esc(SELLER.name) + "</strong><br>" + SELLER.lines.map(esc).join("<br>") + "<br>Monday to Saturday, 9:30 am to 7 pm" :
      "<strong>" + esc(a.name || bt.company || "") + "</strong>" + (o.sample && a.label ? "<br>" + esc(a.label) : "") + "<br>" + docAddr(a) + (c.mobile ? "<br>+91 " + esc(fmtMobile(c.mobile)) : "");
    var meta = [["Invoice date", fmtDate(inv.date)], ["Order", '<span class="mono">' + esc(o.id) + "</span>"],
      ["Place of supply", esc(a.state || "") + (code ? " (" + esc(code) + ")" : "")], ["Payment", esc(payTerms(o, inv))]];
    var lines = bag.docLines(o.lines).map(function (x, i) { x.batch = batchCode(o, o.lines[i], i); return x; });
    return bag.docHTML({
      kind: "invoice", no: inv.no, meta: meta,
      parties: [{ h: "Bill to", html: billTo }, { h: o.mode === "pickup" ? "Collect from" : "Ship to", html: shipTo }],
      lines: lines,
      totals: {
        sub: t.sub, discount: t.discount, coupon: t.discount ? { code: o.coupon || "" } : null, ship: t.ship,
        shipLabel: o.shipLabel || (o.mode === "express" ? "Express delivery" : "Standard delivery"),
        taxable: t.taxable, intra: intra, cgst: cgst, sgst: sgst, igst: intra ? 0 : t.tax, gst: t.tax, roundOff: t.roundOff, total: t.total
      },
      terms: [
        "GST is charged at 18% on all items. " + (intra ? "Intra-state supply from Maharashtra: CGST 9% and SGST 9%." : "Inter-state supply from Maharashtra: IGST 18%.") + " Reverse charge does not apply.",
        "Unused parts in their original packing can be returned within 7 days of delivery. Report a damaged or wrong part within 48 hours of delivery.",
        "Batch numbers trace each part to our stock records.",
        "Certified that the particulars given above are true and correct. This is a computer-generated invoice and needs no signature."
      ],
      note: "Sample document from the Bearingsetu demo store. Not a valid tax invoice. Questions: " + esc(SELLER.email)
    });
  }
  function openInvoice(o, trigger) {
    var inv = o && invoiceOf(o);
    if (!inv) { BS.toast(o && o.status === "Cancelled" ? "There is no invoice for a cancelled order." : "The GST invoice is issued at dispatch.", { icon: "info" }); return; }
    if (!BS.bag || !BS.bag.openDoc) return;
    BS.bag.openDoc({ kicker: "Tax invoice", title: inv.no, file: inv.no.replace(/\//g, "-"), html: invoiceHTML(o), trigger: trigger });
  }

  /* ---------- form helpers (validate on submit, then on blur) ---------- */
  function errEl(input) {
    var id = input.id + "-err";
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement("p");
      el.className = "error";
      el.id = id;
      (input.closest(".field") || input.parentNode).appendChild(el);
    }
    var d = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (d.indexOf(id) === -1) { d.push(id); input.setAttribute("aria-describedby", d.join(" ")); }
    return el;
  }
  function setErr(input, msg) {
    errEl(input).textContent = msg || "";
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    return !msg;
  }
  function wireForm(form, rules, onValid) {
    var tried = false;
    function check(input) { var r = rules[input.name]; if (!r) return true; return setErr(input, r(input.value.trim(), input)); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form._busy) return; // a second Enter or click while the first submit is still working
      tried = true;
      var first = null;
      Object.keys(rules).forEach(function (n) {
        var el = form.querySelector('[name="' + n + '"]');
        if (el && !check(el) && !first) first = el;
      });
      if (first) { first.focus(); return; }
      onValid(form);
    });
    form.addEventListener("focusout", function (e) { if (tried && e.target.name && rules[e.target.name]) check(e.target); });
    form.addEventListener("input", function (e) { if (e.target.getAttribute("aria-invalid") === "true") check(e.target); });
    return { reset: function () { tried = false; Object.keys(rules).forEach(function (n) { var el = form.querySelector('[name="' + n + '"]'); if (el) setErr(el, ""); }); } };
  }
  function busy(btn, on) {
    btn.classList.toggle("is-loading", on);
    btn.setAttribute("aria-busy", on ? "true" : "false");
    var f = btn.form || btn.closest("form");
    if (f) f._busy = on;
  }

  window.BSA = {
    account: ACCOUNT, seller: SELLER, sampleTrack: SAMPLE_TRACK, statuses: STATUSES,
    orders: orders, find: find, timeline: timeline, etaText: etaText, invoices: invoices, invoiceOf: invoiceOf, credit: credit,
    payText: payText, invoiceHTML: invoiceHTML, openInvoice: openInvoice, addresses: addresses, form: { setErr: setErr, wire: wireForm, busy: busy },
    fmt: { date: fmtDate, time: fmtTime, dt: fmtDT, rel: relDay }, dates: { addDays: addDays, isWork: isWork, nextWork: nextWork, at: at, sameDay: sameDay }
  };

  /* ===================================================================== page */
  var root = $("[data-acct]");
  if (!root) return;

  var BADGE = { Confirmed: "", Packed: "badge--blue", Dispatched: "badge--blue", Delivered: "badge--green", Cancelled: "badge--red" };
  function badge(status) { return '<span class="badge ' + (BADGE[status] || "") + '">' + esc(status) + "</span>"; }
  function priceGST(n) { var inc = BS.prefs().gst === "inc"; return inr(inc ? BS.withGst(n) : n) + (inc ? " incl. GST" : " + GST"); }
  function thumb(p, size) { return p ? BS.imgTag(p.img, { alt: "", sizes: (size || 48) + "px" }) : icon("cube"); }
  function delay(fn, ms) { setTimeout(fn, ms); }


  /* =================================================== overview */
  function greet() {
    var h = new Date().getHours();
    $("[data-greet]").textContent = (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") + ", " + ACCOUNT.first + ".";
  }

  function renderCredit() {
    var c = credit();
    var pct = Math.min(100, (c.used / c.limit) * 100);
    // the dashboard tile shows whole rupees; invoices keep the paise
    var used = Math.round(c.used), avail = Math.max(0, c.limit - used);
    $("[data-credit-avail]").textContent = inr(avail);
    $("[data-credit-limit]").textContent = inr(c.limit);
    $("[data-credit-used]").textContent = inr(used);
    $("[data-credit-pct]").textContent = (pct > 0 && pct < 1 ? "Under 1" : Math.round(pct)) + "% of limit";
    var m = $("[data-credit-meter]");
    m.setAttribute("aria-valuenow", String(used));
    m.setAttribute("aria-valuetext", inr(used) + " used of " + inr(c.limit));
    $(".meter__used", m).style.width = pct.toFixed(1) + "%";
    var late = c.next && c.next.due < startOfDay(new Date());
    $("[data-credit-due]").innerHTML = c.next ? '<span class="num">' + inr(Math.round(c.nextAmt)) + "</span><small>" + (late ? "Overdue since " : "") + fmtDate(c.next.due, { day: !late, short: true }) + "</small>" : "Nothing due<small>All invoices paid</small>";
  }

  function renderStats(all) {
    var open = all.filter(function (o) { return o.status === "Confirmed" || o.status === "Packed" || o.status === "Dispatched"; });
    $("[data-open-count]").textContent = String(open.length);
    var by = {};
    open.forEach(function (o) { by[o.status] = (by[o.status] || 0) + 1; });
    var parts = ["Dispatched", "Packed", "Confirmed"].filter(function (s) { return by[s]; }).map(function (s) { return by[s] + " " + s.toLowerCase(); });
    $("[data-open-sub]").textContent = parts.length ? parts.join(", ") : "Nothing on the way";

    var now = new Date();
    var months = [];
    for (var i = 3; i >= 0; i--) { var d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ y: d.getFullYear(), m: d.getMonth(), sum: 0, n: 0 }); }
    all.forEach(function (o) {
      if (o.status === "Cancelled") return;
      months.forEach(function (mm) { if (o.date.getFullYear() === mm.y && o.date.getMonth() === mm.m) { mm.sum += o.totals.total; mm.n++; } });
    });
    var cur = months[3], prev = months[2];
    $("[data-month-label]").textContent = "Spent in " + MONTH[cur.m];
    $("[data-month-spend]").textContent = inr(Math.round(cur.sum));
    $("[data-month-sub]").textContent = BS.plural(cur.n, "order") + ", incl. GST";
    var max = Math.max.apply(null, months.map(function (m) { return m.sum; })) || 1;
    var bars = $("[data-month-bars]");
    bars.innerHTML = months.map(function (m, i) {
      return '<span class="bar' + (i === 3 ? " is-now" : "") + '" title="' + MONTH[m.m] + ": " + inr(Math.round(m.sum)) + '"><span class="bar__fill" style="height:' + Math.max(4, Math.round((m.sum / max) * 100)) + '%"></span><span class="bar__m">' + MON[m.m] + "</span></span>";
    }).join("");
    var sr = $("[data-month-sr]");
    if (sr) sr.textContent = "Spend by month: " + months.map(function (m) { return MONTH[m.m] + " " + inr(Math.round(m.sum)); }).join(", ") + ".";
  }

  var AGAIN = ["fag-6204-2rsr", "skf-6205-2rs1", "gates-800-8m-20", "skf-lgmt-2-1kg", "fenner-a33", "nok-tc-25x52x7"];
  function usual(id, all) {
    var hits = [];
    all.forEach(function (o) { if (o.status === "Cancelled") return; o.lines.forEach(function (l) { if (l.id === id) hits.push({ qty: l.qty, date: o.date }); }); });
    hits.sort(function (a, b) { return b.date - a.date; });
    return { qty: hits.length ? hits[0].qty : (BS.byId(id).moq || 1), times: hits.length, last: hits.length ? hits[0].date : null };
  }
  function renderAgain(all) {
    var box = $("[data-again]");
    box.innerHTML = AGAIN.map(BS.byId).filter(Boolean).map(function (p, i) {
      var u = usual(p.id, all);
      var b = BS.brand(p.brand);
      var unit = BS.unitPrice(p, u.qty);
      var ul = BS.unitLabel(p);
      return '<div role="listitem"><article class="bcard reveal" style="--i:' + i + '" data-pid="' + esc(p.id) + '">' +
        '<a class="bcard__media" href="' + BS.url(p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(p.img, { alt: "", sizes: "(max-width: 640px) 60vw, 220px", cls: "" }).replace("<img ", "<img data-fly ") + "</a>" +
        '<div class="bcard__body">' +
          '<p class="bcard__brand">' + esc(b.name) + "</p>" +
          '<h3 class="bcard__title"><a href="' + BS.url(p) + '">' + esc(p.pn) + "</a></h3>" +
          '<p class="bcard__spec">' + esc(p.title) + "</p>" +
          '<p class="bcard__usual">Usually ' + u.qty + " " + esc(ul === "pc" ? "pcs" : ul + (u.qty > 1 ? "s" : "")) + (u.last ? " · last " + fmtDate(u.last, { short: true }) : "") + "</p>" +
          '<p class="bcard__price">' + BS.priceHTML(unit, p) + "</p>" +
          (unit < p.price ? '<p class="bcard__tier">Tier price at ' + u.qty + "</p>" : '<p class="bcard__tier bcard__tier--plain">List price</p>') +
          '<button class="btn btn--sm btn--add bcard__btn" type="button" data-add="' + esc(p.id) + '" data-qty="' + u.qty + '" aria-label="Add ' + u.qty + " × " + esc(b.name + " " + p.pn) + ' to bag">Add ' + u.qty + "</button>" +
        "</div></article></div>";
    }).join("");
    BS.reveal(box);
  }

  /* =================================================== orders */
  var ordState = { status: "all", q: "" };
  var openOrders = {};
  var ordersReady = false;
  function renderOrderFilters(all) {
    var counts = { all: all.length };
    STATUSES.forEach(function (s) { counts[s] = all.filter(function (o) { return o.status === s; }).length; });
    $("[data-ord-filter]").innerHTML = ["all"].concat(STATUSES).map(function (s) {
      return '<button class="chip" type="button" data-status="' + s + '" aria-pressed="' + (ordState.status === s) + '">' + (s === "all" ? "All" : s) + ' <span class="chip__n num">' + counts[s] + "</span></button>";
    }).join("");
  }
  function matchesOrder(o, q) {
    if (!q) return true;
    var nq = BS.norm(q);
    if (BS.norm(o.id).indexOf(nq) !== -1 || BS.norm(o.awb).indexOf(nq) !== -1 || BS.norm(o.po).indexOf(nq) !== -1) return true;
    var inv = invoiceOf(o);
    if (inv && BS.norm(inv.no).indexOf(nq) !== -1) return true;
    return o.lines.some(function (l) { return BS.norm(l.pn).indexOf(nq) !== -1 || (l.title + " " + l.brand).toLowerCase().indexOf(q.toLowerCase()) !== -1; });
  }
  function orderRow(o) {
    var isOpen = !!openOrders[o.id];
    var bid = "ord-" + o.id;
    var thumbs = o.lines.slice(0, 3).map(function (l) { return '<span class="ord__th">' + thumb(l.p) + "</span>"; }).join("") + (o.lines.length > 3 ? '<span class="ord__th ord__th--more">+' + (o.lines.length - 3) + "</span>" : "");
    var pieces = o.lines.reduce(function (s, l) { return s + l.qty; }, 0);
    var inv = invoiceOf(o);
    var t = o.totals;
    var lines = o.lines.map(function (l) {
      return '<li class="oline">' +
        '<span class="oline__img">' + thumb(l.p) + "</span>" +
        '<span class="oline__name">' + (l.p ? '<a href="' + BS.url(l.p) + '">' + esc(l.brand + " " + l.pn) + "</a>" : "<strong>" + esc(l.pn) + "</strong>") + "<small>" + esc(l.title) + "</small></span>" +
        '<span class="oline__qty num">' + l.qty + " × " + inr(l.unit, Math.round(l.unit) === l.unit ? 0 : 2) + "</span>" +
        '<span class="oline__amt num">' + inr(l.amount, Math.round(l.amount) === l.amount ? 0 : 2) + "</span></li>";
    }).join("");
    var a = o.addr;
    var ship = o.mode === "pickup" ? "Pick up from our Pune warehouse" :
      o.courier && (o.ev.dispatched || o.ev.delivered) && o.awb ? esc(o.courier) + ' · AWB <span class="mono">' + esc(o.awb) + "</span>" : "Courier and AWB are added at dispatch";
    var payTxt = esc(payText(o, inv));
    return '<article class="ord' + (isOpen ? " is-open" : "") + '" data-order="' + esc(o.id) + '">' +
      '<button class="ord__head" type="button" aria-expanded="' + isOpen + '" aria-controls="' + esc(bid) + '" data-ord-toggle>' +
        '<span class="ord__id"><span class="mono">' + esc(o.id) + '</span><span class="ord__date">' + fmtDate(o.date) + (o.real ? " · placed on this device" : "") + "</span></span>" +
        '<span class="ord__thumbs" aria-hidden="true">' + thumbs + "</span>" +
        '<span class="ord__items">' + BS.plural(o.lines.length, "part") + '<small class="num">' + BS.plural(pieces, "piece") + "</small></span>" +
        '<span class="ord__total num">' + inr(t.total) + "</span>" +
        '<span class="ord__status">' + badge(o.status) + "</span>" +
        '<span class="ord__chev" aria-hidden="true">' + icon("caret-down") + "</span>" +
      "</button>" +
      '<div class="ord__body" id="' + esc(bid) + '" role="region" aria-label="Order ' + esc(o.id) + ' details"><div class="ord__inner">' +
        (o.note ? '<p class="notice ord__note">' + icon("info") + "<span>" + esc(o.note) + "</span></p>" : "") +
        '<div class="ord__grid">' +
          '<div><h3 class="ord__h">Items</h3><ul class="olines">' + lines + "</ul>" +
            '<dl class="osum"><div><dt>Subtotal</dt><dd class="num">' + inr(t.sub, 2) + "</dd></div>" +
            (t.discount ? "<div><dt>Discount</dt><dd class=\"num\">−" + inr(t.discount, 2) + "</dd></div>" : "") +
            "<div><dt>Dispatch</dt><dd class=\"num\">" + (t.ship ? inr(t.ship) : "Free") + "</dd></div>" +
            "<div><dt>GST 18%</dt><dd class=\"num\">" + inr(t.tax, 2) + "</dd></div>" +
            '<div class="osum__total"><dt>Total</dt><dd class="num">' + inr(t.total) + "</dd></div></dl></div>" +
          '<dl class="ord__facts">' +
            "<div><dt>" + (o.mode === "pickup" ? "Billing address" : "Deliver to") + "</dt><dd>" + (a.label ? "<strong>" + esc(a.label) + "</strong><br>" : "") + esc(a.name) + "<br>" + addrHTML(a) + "</dd></div>" +
            "<div><dt>Shipment</dt><dd>" + ship + '<br><span class="muted">' + esc(etaText(o)) + "</span></dd></div>" +
            "<div><dt>Payment</dt><dd>" + payTxt + "</dd></div>" +
            (o.po ? '<div><dt>Your PO</dt><dd class="mono">' + esc(o.po) + "</dd></div>" : "") +
            (inv ? '<div><dt>Invoice</dt><dd class="mono">' + esc(inv.no) + "</dd></div>" : "") +
          "</dl>" +
        "</div>" +
        '<div class="ord__acts">' +
          '<button class="btn btn--sm" type="button" data-reorder="' + esc(o.id) + '">' + icon("arrows-clockwise") + "Reorder</button>" +
          (o.status !== "Cancelled" ? '<a class="btn btn--sm btn--quiet" href="support.html?order=' + encodeURIComponent(o.id) + '#track">' + icon("truck") + "Track</a>" : "") +
          (inv ? '<button class="btn btn--sm btn--quiet" type="button" data-invoice="' + esc(o.id) + '">' + icon("receipt") + "Invoice</button>" : '<span class="small muted">' + (o.status === "Cancelled" ? "No invoice for a cancelled order" : "The GST invoice is issued at dispatch") + "</span>") +
        "</div>" +
      "</div></div></article>";
  }
  function renderOrders() {
    var all = orders();
    renderOrderFilters(all);
    var list = all.filter(function (o) { return (ordState.status === "all" || o.status === ordState.status) && matchesOrder(o, ordState.q); });
    var box = $("[data-ord-list]");
    box.setAttribute("aria-busy", "false");
    var count = $("[data-ord-count]");
    var filtered = ordState.status !== "all" || ordState.q;
    count.textContent = filtered ? "Showing " + list.length + " of " + BS.plural(all.length, "order") + (ordState.status !== "all" ? " · " + ordState.status : "") + (ordState.q ? " · matching “" + ordState.q + "”" : "") : "Showing all " + BS.plural(all.length, "order") + ", newest first";
    if (!list.length) {
      var what = ordState.q ? "No orders match “" + esc(ordState.q) + "”" : "No " + esc(ordState.status.toLowerCase()) + " orders";
      var tip = ordState.status === "Confirmed" && !ordState.q ? "New orders show here as Confirmed until they are packed, usually within 2 hours on a working day." : "Try an order number such as BS-2611-4821, a part number such as 6205, or clear the filters.";
      box.innerHTML = '<div class="empty ord-empty">' + icon("package") + "<h3>" + what + "</h3><p>" + tip + '</p><button class="btn btn--sm btn--quiet" type="button" data-ord-clear>Clear filters</button></div>';
      return;
    }
    box.innerHTML = list.map(orderRow).join("");
    if (all.unreadable) box.insertAdjacentHTML("afterbegin", '<p class="notice notice--warm">' + icon("warning-circle") + "<span>" + BS.plural(all.unreadable, "saved order") + " on this device could not be read and is hidden.</span></p>");
  }
  function toggleOrder(btn) {
    var art = btn.closest(".ord");
    var id = art.getAttribute("data-order");
    var open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    art.classList.toggle("is-open", open);
    if (open) openOrders[id] = 1; else delete openOrders[id];
  }
  function reorder(id, btn) {
    if (btn && btn.classList.contains("is-done")) return; // ignore repeat taps while it shows Added
    var o = find(id);
    if (!o) return;
    var ok = o.lines.filter(function (l) { return l.p; });
    var gone = o.lines.length - ok.length;
    if (!ok.length) { BS.toast("These parts are no longer listed. Ask us to source them.", { icon: "info", label: "Request a quote", href: "quick-order.html#rfq" }); return; }
    ok.forEach(function (l) { BS.cart.add(l.id, l.qty); });
    var img = btn && btn.closest(".ord") ? $(".ord__th img", btn.closest(".ord")) : null;
    if (img) BS.flyToBag(img);
    BS.toast(BS.plural(ok.length, "line") + " from <strong>" + esc(o.id) + "</strong> added to your bag." + (gone ? " " + gone + " no longer listed." : ""), { label: "View bag", onAction: BS.openCart, icon: "arrows-clockwise" });
    if (btn) { var html = btn.innerHTML; btn.innerHTML = icon("check") + "Added"; btn.classList.add("is-done"); setTimeout(function () { btn.innerHTML = html; btn.classList.remove("is-done"); }, 1600); }
  }

  /* =================================================== invoices */
  function renderInvoices() {
    var list = invoices();
    var c = credit();
    var wrap = $("[data-inv-wrap]");
    wrap.setAttribute("aria-busy", "false");
    var nowD = new Date(), fyNow = fy(nowD);
    var fyStart = nowD.getMonth() >= 3 ? nowD.getFullYear() : nowD.getFullYear() - 1;
    var fyLabel = fyStart + "-" + String(fyStart + 1).slice(2);
    var paidFY = list.filter(function (i) { return i.state === "paid" && fy(i.date) === fyNow; }).reduce(function (s, i) { return s + i.order.totals.total; }, 0);
    $("[data-inv-sum]").innerHTML =
      '<div class="inv-sum__item"><span>Outstanding</span><strong class="num">' + inr(Math.round(c.used)) + "</strong><small>" + BS.plural(c.dueCount, "invoice") + " on credit</small></div>" +
      '<div class="inv-sum__item"><span>' + (c.next && c.next.due < startOfDay(nowD) ? "Overdue since" : "Next due") + "</span><strong>" + (c.next ? fmtDate(c.next.due, { day: true, short: true }) : "Nothing due") + "</strong><small>" + (c.next ? inr(Math.round(c.nextAmt)) : "You are all paid up") + "</small></div>" +
      '<div class="inv-sum__item"><span>Paid this year</span><strong class="num">' + inr(Math.round(paidFY)) + "</strong><small>Financial year " + fyLabel + "</small></div>";
    if (!list.length) {
      wrap.innerHTML = '<div class="empty">' + icon("receipt") + "<h3>No invoices yet</h3><p>Invoices appear here when an order is dispatched.</p></div>";
      return;
    }
    var today = startOfDay(new Date());
    wrap.innerHTML = '<div class="inv-table-wrap"><table class="table inv-table"><caption class="sr-only">GST invoices, newest first</caption><thead><tr>' +
      '<th scope="col">Invoice</th><th scope="col">Order</th><th scope="col" class="r">Taxable value</th><th scope="col" class="r">GST</th><th scope="col" class="r">Total</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Download</span></th></tr></thead><tbody>' +
      list.map(function (i) {
        var t = i.order.totals;
        var days = i.due ? Math.round((i.due - today) / 864e5) : 0;
        var st = i.state === "paid" ? '<span class="badge badge--green">Paid</span>' :
          i.state === "overdue" ? '<span class="badge badge--red">Overdue</span>' :
          i.state === "awaiting" ? '<span class="badge">Awaiting payment</span><small class="inv-days">by bank transfer</small>' :
          '<span class="badge">Due ' + fmtDate(i.due, { short: true }) + '</span><small class="inv-days">' + (days === 0 ? "today" : "in " + BS.plural(days, "day")) + "</small>";
        return "<tr>" +
          '<td><span class="mono inv-no">' + esc(i.no) + '</span><span class="inv-date">' + fmtDate(i.date) + "</span></td>" +
          '<td><span class="mono">' + esc(i.order.id) + "</span></td>" +
          '<td class="r num">' + inr(t.taxable, 2) + "</td>" +
          '<td class="r num">' + inr(t.tax, 2) + "</td>" +
          '<td class="r num inv-total">' + inr(t.total) + "</td>" +
          '<td class="inv-st">' + st + "</td>" +
          '<td class="inv-dl"><button class="btn btn--sm btn--quiet" type="button" data-invoice="' + esc(i.order.id) + '" aria-label="Download invoice ' + esc(i.no) + '">' + icon("download-simple") + "Download</button></td>" +
          "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  /* =================================================== saved items + lists */
  function renderWish() {
    var ids = BS.wish.all();
    $("[data-wish-count]").textContent = ids.length ? "(" + ids.length + ")" : "";
    var box = $("[data-wish]");
    if (!ids.length) {
      box.innerHTML = '<div class="empty wish-empty">' + icon("heart") + "<h3>Nothing saved yet</h3><p>Tap the heart on any product to keep it here. Saved items stay on this device, ready for your next order.</p>" +
        '<a class="btn btn--sm" href="shop.html?tag=bestseller">Browse bestsellers</a></div>';
      return;
    }
    box.innerHTML = '<ul class="wgrid">' + ids.map(BS.byId).filter(Boolean).map(function (p) {
      var b = BS.brand(p.brand), st = BS.stock(p);
      return '<li class="wcard" data-pid="' + esc(p.id) + '">' +
        '<a class="wcard__img" href="' + BS.url(p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(p.img, { alt: "", sizes: "96px" }).replace("<img ", "<img data-fly ") + "</a>" +
        '<div class="wcard__body"><p class="wcard__brand">' + esc(b.name) + '</p><h4 class="wcard__t"><a href="' + BS.url(p) + '">' + esc(p.pn) + "</a></h4>" +
        '<p class="wcard__s">' + esc(p.title) + '</p><p class="wcard__p">' + BS.priceHTML(p.price, p) + '</p><p class="' + st.cls + '">' + esc(st.short) + "</p></div>" +
        '<div class="wcard__acts"><button class="btn btn--sm btn--add" type="button" data-add="' + esc(p.id) + '" aria-label="Add ' + esc(b.name + " " + p.pn) + ' to bag">Add to bag</button>' +
        '<button class="textlink small" type="button" data-unwish="' + esc(p.id) + '" aria-label="Remove ' + esc(b.name + " " + p.pn) + ' from saved items">Remove</button></div></li>';
    }).join("") + "</ul>";
  }

  var SAMPLE_LISTS = [
    { id: "ring-frame", name: "Ring frame monthly kit", sample: true, updated: "2026-11-02T11:00:00+05:30", note: "Spindle and drafting spares for 24 ring frames",
      lines: [["fag-6204-2rsr", 120], ["skf-6202-2rs1", 60], ["gates-800-8m-20", 6], ["fenner-a33", 10], ["skf-lgmt-2-1kg", 4], ["nok-tc-25x52x7", 25]] },
    { id: "blow-room", name: "Blow room spares", sample: true, updated: "2026-10-16T15:30:00+05:30", note: "Beater and fan drive spares kept at the stores",
      lines: [["skf-ucp-205", 4], ["ntn-ucf205d1", 2], ["fenner-b43", 8], ["skf-6305-2rs1", 10], ["lovejoy-l-100", 2], ["lovejoy-l-100-spider-nbr", 4], ["rolon-08b-1", 1]] }
  ];
  function userLists() { var l = BS.store.get("lists", []); return Array.isArray(l) ? l.filter(function (x) { return x && x.name && Array.isArray(x.lines); }) : []; }
  function allLists() {
    return userLists().map(function (l) {
      var lines = l.lines.map(function (x) { return Array.isArray(x) ? x : x && typeof x === "object" ? [x.id, x.qty] : null; })
        .filter(function (x) { return x && BS.byId(x[0]); })
        .map(function (x) { return [x[0], Math.max(1, parseInt(x[1], 10) || 1)]; });
      return { id: String(l.id || l.name), name: String(l.name), sample: false, updated: l.created || l.updated, note: "Saved from your bag", lines: lines };
    }).concat(SAMPLE_LISTS);
  }
  function listCard(l, fresh) {
    var lines = l.lines.map(function (x) { return lineOf(x[0], x[1]); }).filter(function (x) { return x.p; });
    var sub = lines.reduce(function (s, x) { return s + x.amount; }, 0);
    var pcs = lines.reduce(function (s, x) { return s + x.qty; }, 0);
    return '<article class="nlist' + (fresh ? " is-fresh" : "") + '" data-list="' + esc(l.id) + '" aria-labelledby="nl-' + esc(l.id) + '">' +
      '<header class="nlist__head"><div><h4 class="nlist__t" id="nl-' + esc(l.id) + '">' + esc(l.name) + "</h4>" +
        '<p class="small muted">' + BS.plural(lines.length, "part") + " · " + BS.plural(pcs, "piece") + (l.updated ? " · updated " + fmtDate(l.updated, { short: true }) : "") + "</p></div>" +
        (l.sample ? "" : '<button class="textlink small" type="button" data-del-list="' + esc(l.id) + '" aria-label="Delete list ' + esc(l.name) + '">Delete</button>') + "</header>" +
      '<ul class="nlist__lines">' + lines.map(function (x) {
        return '<li><span class="nlist__img">' + thumb(x.p, 40) + '</span><span class="nlist__name"><a href="' + BS.url(x.p) + '">' + esc(x.brand + " " + x.pn) + "</a><small>" + esc(x.p.title) + '</small></span><span class="nlist__qty num">× ' + x.qty + "</span></li>";
      }).join("") + "</ul>" +
      '<footer class="nlist__foot"><p class="nlist__sum"><strong class="num">' + esc(priceGST(sub)) + "</strong><small>at your tier prices</small></p>" +
        '<button class="btn btn--sm' + (listAdded[l.id] ? " is-done" : "") + '" type="button" data-add-list="' + esc(l.id) + '" aria-label="Add all of ' + esc(l.name) + ' to bag">' + (listAdded[l.id] ? icon("check") + "Added" : icon("handbag") + "Add list to bag") + "</button></footer></article>";
  }
  var freshList = null;
  function renderLists() {
    var box = $("[data-nlists]");
    var t = BS.cart.totals();
    var form = '<form class="nlist nlist--new" method="post" novalidate data-newlist aria-labelledby="newlist-title">' +
      '<div class="nlist__newhead">' + icon("list-checks") + '<h4 class="nlist__t" id="newlist-title">Save your bag as a list</h4></div>' +
      (t.count ? '<p class="small muted" data-bag-summary>Your bag has ' + BS.plural(t.lines.length, "part") + ", " + BS.plural(t.count, "piece") + ". Name the list to save it.</p>" :
        '<p class="small muted" data-bag-summary>Your bag is empty. Add parts to your bag, then save them here as a named list for next time.</p>') +
      '<div class="field"><label for="nl-name">List name</label><input class="input" id="nl-name" name="name" maxlength="60" autocomplete="off" placeholder="For example, Carding monthly kit"' + (t.count ? "" : " disabled") + '><p class="error" id="nl-name-err"></p></div>' +
      (t.count ? '<button class="btn btn--sm" type="submit">Save list</button>' : '<a class="btn btn--sm btn--quiet" href="shop.html">Shop parts</a>') +
      "</form>";
    box.innerHTML = allLists().map(function (l) { return listCard(l, l.id === freshList); }).join("") + form;
    freshList = null;
    var f = $("[data-newlist]", box);
    if (t.count) wireForm(f, {
      name: function (v) {
        if (!v) return "Give the list a name, for example ‘Carding monthly kit’.";
        if (v.length < 3) return "Use at least 3 characters.";
        var dup = allLists().some(function (l) { return l.name.toLowerCase() === v.toLowerCase(); });
        return dup ? "You already have a list called ‘" + v + "’. Choose another name." : "";
      }
    }, function (form) {
      var name = form.elements.name.value.trim();
      var lines = BS.cart.lines().map(function (l) { return { id: l.id, qty: l.qty }; });
      var id = "l" + Date.now().toString(36);
      var ls = BS.store.get("lists", []);
      ls = Array.isArray(ls) ? ls : [];
      ls.unshift({ id: id, name: name, created: new Date().toISOString(), lines: lines });
      BS.store.set("lists", ls);
      freshList = id;
      renderLists();
      BS.toast("Saved <strong>" + esc(name) + "</strong> with " + BS.plural(lines.length, "part") + ".", { icon: "list-checks" });
      var card = $('[data-list="' + id + '"]');
      if (card) { card.setAttribute("tabindex", "-1"); card.focus({ preventScroll: true }); }
    });
  }
  var listAdded = {};
  function addList(id, btn) {
    if (listAdded[id]) return; // ignore repeat taps while it shows Added
    var l = allLists().filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    // fly from the card before the bag update re-renders the lists
    var img = btn ? $(".nlist__img img", btn.closest(".nlist")) : null;
    if (img) BS.flyToBag(img);
    var n = 0, pcs = 0;
    listAdded[id] = 1;
    l.lines.forEach(function (x) { if (BS.byId(x[0])) { BS.cart.add(x[0], x[1]); n++; pcs += x[1]; } });
    renderLists();
    var again = $('[data-add-list="' + id + '"]');
    if (again) again.focus({ preventScroll: true });
    setTimeout(function () {
      delete listAdded[id];
      var b = $('[data-add-list="' + id + '"]');
      if (b) { b.classList.remove("is-done"); b.innerHTML = icon("handbag") + "Add list to bag"; }
    }, 1600);
    BS.toast("<strong>" + esc(l.name) + "</strong>: " + BS.plural(n, "part") + ", " + BS.plural(pcs, "piece") + " added to your bag.", { label: "View bag", onAction: BS.openCart });
  }
  function deleteList(id) {
    var ls = userLists();
    function key(x) { return String(x.id || x.name); }
    var gone = ls.filter(function (x) { return key(x) === id; })[0];
    if (!gone) return;
    BS.store.set("lists", ls.filter(function (x) { return key(x) !== id; }));
    renderLists();
    var nb = $("#nl-name") && !$("#nl-name").disabled ? $("#nl-name") : $("[data-add-list]");
    if (nb) nb.focus({ preventScroll: true });
    BS.toast("Deleted <strong>" + esc(gone.name) + "</strong>.", { icon: "trash", label: "Undo", onAction: function () { var cur = userLists(); if (!cur.some(function (x) { return key(x) === id; })) cur.unshift(gone); BS.store.set("lists", cur); renderLists(); } });
  }

  /* =================================================== quotes */
  var SAMPLE_QUOTES = [
    { ref: "RFQ-2611-2318", sent: "2026-11-12T16:40:00+05:30", status: "progress", lines: [{ id: "fag-22312-e1-xl-c3", qty: 4 }, { text: "Phosphor bronze bush to drawing KSM-BR-07, 40 × 55 × 30 mm", qty: 12 }],
      note: "A specialist is checking lead time with the brand for the spherical rollers and getting a price on the drawing part." },
    { ref: "RFQ-2611-1946", sent: "2026-11-09T10:15:00+05:30", answered: "2026-11-09T11:52:00+05:30", valid: "2026-11-20T19:00:00+05:30", status: "answered",
      lines: [{ id: "skf-6205-2rs1-c3", qty: 250 }, { id: "fag-6204-2rsr", qty: 250 }],
      note: "Price held until the date shown, even if list prices change. Ships from Pune within one working day of acceptance." }
  ];
  function replyBy(d) {
    d = D(d);
    var open = at(d, 9, 30), close = at(d, 19, 0);
    if (!isWork(d) || d >= close) return at(nextWork(d), 11, 30);
    if (d < open) return at(d, 11, 30);
    var left = close - d;
    if (left >= 2 * 3600e3) return new Date(d.getTime() + 2 * 3600e3);
    return new Date(at(nextWork(d), 9, 30).getTime() + (2 * 3600e3 - left));
  }
  /* A typed part only becomes a catalogue product when exactly one product matches it, by part
     number ("6205-2RS1") or by brand and part number ("Timken 6205-2RS"). Several brands share
     most numbers, so a guess would show the wrong brand; otherwise the typed text stays. */
  function exactPart(text) {
    var n = BS.norm(text);
    if (!n) return null;
    var same = BS.products.filter(function (p) {
      var b = BS.brand(p.brand).name;
      return BS.norm(p.pn) === n || BS.norm(b + " " + p.pn) === n || BS.norm(b.replace(/\s*\(.*\)$/, "") + " " + p.pn) === n;
    });
    return same.length === 1 ? same[0].id : null;
  }
  function userQuotes() {
    var r = BS.store.get("rfqs", []);
    return (Array.isArray(r) ? r : []).map(function (q) {
      if (!q) return null;
      if (typeof q !== "object") return null;
      var sent = D(q.date || q.created || q.createdAt || q.sent || Date.now());
      var raw = Array.isArray(q.lines) ? q.lines : Array.isArray(q.items) ? q.items : [];
      var lines = raw.map(function (l) {
        if (typeof l === "string") return { text: l, qty: 1 };
        if (!l || typeof l !== "object") return { text: "", qty: 1 };
        var id = l.id && BS.byId(l.id) ? l.id : null;
        var pn = l.pn || l.part;
        if (!id && pn) id = exactPart(pn);
        return { id: id, text: l.pn || l.part || l.text || l.desc || l.description || l.name || "", qty: parseInt(l.qty || l.quantity, 10) || 1, target: num(l.target || l.targetPrice) };
      }).filter(function (l) { return l.id || l.text; });
      return { ref: String(q.ref || q.id || q.reference || "RFQ"), sent: valid(sent) ? sent : new Date(), status: "progress", lines: lines, user: true, needBy: q.needBy || q.date_needed || "", note: "" };
    }).filter(Boolean);
  }
  function renderQuotes() {
    var box = $("[data-quotes]");
    box.setAttribute("aria-busy", "false");
    var state = BS.store.get("acctQuotes", {});
    if (!state || typeof state !== "object") state = {};
    var list = userQuotes().concat(SAMPLE_QUOTES.map(function (q) { return Object.assign({}, q, { sent: D(q.sent), answered: q.answered ? D(q.answered) : null, valid: q.valid ? D(q.valid) : null }); }));
    list.sort(function (a, b) { return b.sent - a.sent; });
    box.innerHTML = list.map(function (q) {
      var accepted = state[q.ref];
      var expired = q.valid && q.valid < new Date() && !accepted;
      var st = accepted ? '<span class="badge badge--green">Accepted</span>' : q.status === "answered" ? (expired ? '<span class="badge">Expired</span>' : '<span class="badge badge--blue">Answered</span>') : '<span class="badge">In progress</span>';
      var total = 0;
      var rows = q.lines.map(function (l) {
        var p = l.id ? BS.byId(l.id) : null;
        var name = p ? '<a href="' + BS.url(p) + '">' + esc(BS.brand(p.brand).name + " " + p.pn) + "</a><small>" + esc(p.title) + "</small>" : "<strong>" + esc(l.text) + "</strong>" + (q.user ? "" : "<small>Made to your drawing</small>");
        var price = "";
        if (q.status === "answered" && p) { var u = BS.unitPrice(p, l.qty); total += u * l.qty; price = inr(u) + " / " + esc(BS.unitLabel(p)); }
        else price = '<span class="muted">Pricing</span>';
        return '<li><span class="qline__img">' + (p ? thumb(p, 40) : icon("note-pencil")) + '</span><span class="qline__name">' + name + '</span><span class="qline__qty num">× ' + l.qty + '</span><span class="qline__p num">' + price + "</span></li>";
      }).join("");
      var meta = "Sent " + fmtDT(q.sent) + (q.answered ? " · answered " + fmtDT(q.answered) : "");
      var foot;
      if (q.status === "answered") {
        foot = '<div class="qcard__sum"><p class="qcard__total"><strong class="num">' + inr(total) + '</strong> <small>+ GST</small></p><p class="small muted">' + (expired ? "This quote expired on " + fmtDate(q.valid, { short: true }) + ". Ask us to refresh it." : "Valid until " + fmtDate(q.valid, { day: true, short: true }) + ". " + esc(q.note)) + "</p></div>" +
          (accepted ? '<p class="qcard__done">' + icon("check-circle") + "Accepted " + fmtDate(accepted, { short: true }) + ' and added to your bag. <button class="textlink" type="button" data-open-cart>View bag</button></p>' :
            expired ? '<a class="btn btn--sm btn--quiet" href="quick-order.html#rfq">Request again</a>' :
            '<button class="btn btn--sm" type="button" data-accept="' + esc(q.ref) + '">Accept and add to bag</button>');
      } else {
        var rb = replyBy(q.sent);
        var late = rb < new Date();
        foot = '<div class="qcard__sum"><p class="qcard__wait">' + icon("clock") + (late ? "A specialist is preparing your price." : "Reply due by " + fmtTime(rb) + " " + relDay(rb) + ".") + "</p>" +
          '<p class="small muted">' + esc(q.note || "We reply by email within 2 working hours, Monday to Saturday 9:30 am to 7 pm.") + "</p></div>";
      }
      return '<article class="qcard" data-quote="' + esc(q.ref) + '">' +
        '<header class="qcard__head"><div><h3 class="qcard__ref mono">' + esc(q.ref) + "</h3><p class=\"small muted\">" + meta + (q.user ? " · from this device" : "") + "</p></div>" + st + "</header>" +
        '<ul class="qlines">' + rows + "</ul>" +
        '<footer class="qcard__foot">' + foot + "</footer></article>";
    }).join("");
  }
  function acceptQuote(ref) {
    var q = SAMPLE_QUOTES.filter(function (x) { return x.ref === ref; })[0];
    if (!q) return;
    var st = BS.store.get("acctQuotes", {});
    if (!st || typeof st !== "object" || Array.isArray(st)) st = {};
    if (st[ref]) return; // already accepted (a repeat tap)
    st[ref] = new Date().toISOString();
    BS.store.set("acctQuotes", st);
    var pcs = 0;
    q.lines.forEach(function (l) { if (l.id) { BS.cart.add(l.id, l.qty); pcs += l.qty; } });
    renderQuotes();
    BS.toast("Quote <strong>" + esc(ref) + "</strong> accepted. " + BS.plural(q.lines.length, "line") + ", " + BS.plural(pcs, "piece") + " added to your bag.", { label: "View bag", onAction: BS.openCart });
    var done = $('[data-quote="' + ref + '"] .qcard__done button');
    if (done) done.focus();
  }

  /* =================================================== addresses */
  var STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
  var editing = null;
  function saveAddrs(list) { BS.store.set("acctAddresses", list); }
  function addrForm(a, isNew) {
    a = a || { label: "", name: "", line1: "", line2: "", city: "", state: "Tamil Nadu", pin: "", note: "" };
    var k = isNew ? "new" : a.id;
    function f(name, label, val, extra, span) {
      return '<div class="field' + (span ? " span-2" : "") + '"><label for="ad-' + k + "-" + name + '">' + label + "</label><input class=\"input\" id=\"ad-" + k + "-" + name + '" name="' + name + '" value="' + esc(val || "") + '"' + (extra || "") + '><p class="error" id="ad-' + k + "-" + name + '-err"></p></div>';
    }
    return '<form class="addr addr--form" method="post" novalidate data-addr-form="' + esc(k) + '" aria-labelledby="ad-' + k + '-title">' +
      '<h3 class="addr__t" id="ad-' + k + '-title">' + (isNew ? "Add an address" : "Edit " + esc(a.label)) + "</h3>" +
      '<div class="form-grid">' +
        f("label", "Address name", a.label, ' autocomplete="off" placeholder="For example, Palladam unit"') +
        f("name", "Contact person", a.name, ' autocomplete="name"') +
        f("line1", "Address line 1", a.line1, ' autocomplete="address-line1" placeholder="Plot, survey or door number, street"', true) +
        '<div class="field span-2"><label for="ad-' + k + '-line2">Address line 2 <small>Optional</small></label><input class="input" id="ad-' + k + '-line2" name="line2" value="' + esc(a.line2 || "") + '" autocomplete="address-line2" placeholder="Area or industrial estate"></div>' +
        f("city", "City", a.city, ' autocomplete="address-level2"') +
        '<div class="field"><label for="ad-' + k + '-state">State</label><select class="select" id="ad-' + k + '-state" name="state" autocomplete="address-level1"><option value="">Choose a state</option>' +
          STATES.map(function (s) { return "<option" + (s === a.state ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + '</select><p class="error" id="ad-' + k + '-state-err"></p></div>' +
        f("pin", "Pincode", a.pin, ' inputmode="numeric" maxlength="6" autocomplete="postal-code"') +
        '<div class="field span-2"><label for="ad-' + k + '-note">Delivery note <small>Optional</small></label><input class="input" id="ad-' + k + '-note" name="note" value="' + esc(a.note || "") + '" maxlength="120" placeholder="Gate, receiving hours, who to ask for"></div>' +
      "</div>" +
      '<div class="addr__formacts"><button class="btn btn--sm" type="submit">' + (isNew ? "Save address" : "Save changes") + '</button><button class="btn btn--sm btn--quiet" type="button" data-addr-cancel>Cancel</button></div></form>';
  }
  function renderAddrs() {
    var list = addresses();
    var box = $("[data-addrs]");
    box.innerHTML = list.map(function (a) {
      if (editing === a.id) return addrForm(a, false);
      return '<article class="addr' + (a.isDefault ? " is-default" : "") + '" aria-labelledby="addr-' + esc(a.id) + '">' +
        '<header class="addr__head"><h3 class="addr__t" id="addr-' + esc(a.id) + '">' + esc(a.label) + "</h3>" + (a.isDefault ? '<span class="badge badge--blue">Default</span>' : "") + "</header>" +
        '<p class="addr__lines"><strong>' + esc(a.name) + "</strong><br>" + esc(ACCOUNT.company) + "<br>" + addrHTML(a) + "</p>" +
        (a.note ? '<p class="small muted addr__note">' + esc(a.note) + "</p>" : "") +
        '<div class="addr__acts"><button class="btn btn--sm btn--quiet" type="button" data-addr-edit="' + esc(a.id) + '" aria-label="Edit ' + esc(a.label) + '">' + icon("note-pencil") + "Edit</button>" +
        (a.isDefault ? "" : '<button class="textlink small" type="button" data-addr-default="' + esc(a.id) + '">Make default</button>') +
        (a.user && !a.isDefault ? '<button class="textlink small addr__rm" type="button" data-addr-remove="' + esc(a.id) + '">Remove</button>' : "") +
        "</div></article>";
    }).join("") +
      (editing === "new" ? addrForm(null, true) : '<button class="addr addr--add" type="button" data-addr-add>' + icon("plus") + "<span>Add an address</span><small>Another plant, warehouse or site</small></button>");
    var f = $("[data-addr-form]", box);
    if (f) {
      var key = f.getAttribute("data-addr-form");
      wireForm(f, {
        label: function (v) { return v ? "" : "Name this address, for example ‘Palladam unit’."; },
        name: function (v) { return v ? "" : "Enter the person who receives deliveries."; },
        line1: function (v) { return v.length >= 5 ? "" : v ? "Add the plot, survey or door number and street." : "Enter the first address line."; },
        city: function (v) { return v ? "" : "Enter the city."; },
        state: function (v) { return v ? "" : "Choose a state."; },
        pin: function (v) { return /^[1-9]\d{5}$/.test(v) ? "" : v ? "Pincodes have 6 digits and do not start with 0, for example 641035." : "Enter the 6-digit pincode."; }
      }, function (form) {
        var E = form.elements;
        var data = { label: E.label.value.trim(), name: E.name.value.trim(), line1: E.line1.value.trim(), line2: E.line2.value.trim(), city: E.city.value.trim(), state: E.state.value, pin: E.pin.value.trim(), note: E.note.value.trim() };
        var all = addresses();
        if (key === "new") {
          data.id = "a" + Date.now().toString(36);
          data.user = true;
          all.push(data);
        } else all = all.map(function (a) { return a.id === key ? Object.assign({}, a, data) : a; });
        saveAddrs(all);
        editing = null;
        renderAddrs();
        BS.toast(key === "new" ? "Address <strong>" + esc(data.label) + "</strong> added." : "Address <strong>" + esc(data.label) + "</strong> updated.", { icon: "map-pin" });
        var focusEl = key === "new" ? $$("[data-addr-edit]", box).pop() : $('[data-addr-edit="' + key + '"]', box);
        if (focusEl) focusEl.focus();
      });
      var firstInput = $("input", f);
      if (firstInput) firstInput.focus();
    }
  }

  /* =================================================== team */
  var TEAM = [
    { id: "ln", name: "Lakshmi Narayanan", title: "Maintenance Purchase", role: "Admin", limit: "₹2,00,000", note: "Approves orders above team limits", you: true, last: "Active now" },
    { id: "sk", name: "R. Senthil Kumar", title: "Maintenance Engineer, ring frames", role: "Buyer", limit: "₹25,000", note: "Orders above this come to you", addr: "tpr" },
    { id: "pr", name: "Priya Raghavan", title: "Accounts", role: "Accounts", limit: "No ordering", note: "Sees invoices and statements", last: "Signed in 10 Nov" }
  ];
  var ROLE_LIMIT = { Admin: "₹2,00,000", Buyer: "₹25,000", Requester: "Needs approval", Accounts: "No ordering" };
  // A buyer's "Last order" comes from the newest order to their site that the clock allows,
  // so it never names a date the Orders list does not show.
  function lastSeen(m) {
    if (!m.addr) return m.last || "";
    var o = orders().filter(function (x) { return x.sample && x.addr && x.addr.id === m.addr; })[0];
    return o ? "Last order " + fmtDate(o.date, { short: true }) : "Active";
  }
  function initials(n) { return n.replace(/^[A-Z]\.\s*/, "").split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase(); }
  function invites() { var v = BS.store.get("acctInvites", []); return Array.isArray(v) ? v.filter(function (m) { return m && typeof m.email === "string" && m.email; }) : []; }
  function renderTeam() {
    var box = $("[data-team]");
    var inv = invites();
    box.innerHTML = '<ul class="members" aria-label="Team members">' + TEAM.map(function (m) {
      return '<li class="member"><span class="avatar avatar--sm" aria-hidden="true">' + initials(m.name) + "</span>" +
        '<span class="member__who"><strong>' + esc(m.name) + (m.you ? ' <span class="muted">(you)</span>' : "") + "</strong><small>" + esc(m.title) + "</small></span>" +
        '<span class="member__role"><span class="member__k">Role</span>' + esc(m.role) + "</span>" +
        '<span class="member__limit"><span class="member__k">Approval limit</span><span class="num">' + esc(m.limit) + "</span><small>" + esc(m.note) + "</small></span>" +
        '<span class="member__st"><span class="badge badge--green">Active</span><small>' + esc(lastSeen(m)) + "</small></span></li>";
    }).join("") + inv.map(function (m) {
      return '<li class="member is-pending"><span class="avatar avatar--sm avatar--pending" aria-hidden="true">' + icon("user-plus") + "</span>" +
        '<span class="member__who"><strong class="member__email">' + esc(m.email) + "</strong><small>Invited " + fmtDate(m.at, { short: true }) + "</small></span>" +
        '<span class="member__role"><span class="member__k">Role</span>' + esc(m.role) + "</span>" +
        '<span class="member__limit"><span class="member__k">Approval limit</span><span class="num">' + esc(ROLE_LIMIT[m.role] || "") + "</span></span>" +
        '<span class="member__st"><span class="badge">Pending</span><button class="textlink small" type="button" data-cancel-invite="' + esc(m.email) + '" aria-label="Cancel invitation for ' + esc(m.email) + '">Cancel invite</button></span></li>';
    }).join("") + "</ul>";
  }
  function initInvite() {
    var form = $("[data-invite]");
    var w = wireForm(form, {
      email: function (v) {
        if (!v) return "Enter your colleague’s work email.";
        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) return "Enter a valid email address, for example name@company.in.";
        if (invites().some(function (m) { return m.email.toLowerCase() === v.toLowerCase(); })) return "An invitation to this email is already pending.";
        return "";
      },
      role: function (v) { return v ? "" : "Choose what this person can do."; }
    }, function () {
      var btn = $(".invite__btn", form);
      busy(btn, true);
      delay(function () {
        var email = form.elements.email.value.trim(), role = form.elements.role.value;
        var list = invites();
        list.push({ email: email, role: role, at: new Date().toISOString() });
        BS.store.set("acctInvites", list);
        busy(btn, false);
        form.reset();
        w.reset();
        renderTeam();
        BS.toast("Invitation for <strong>" + esc(email) + "</strong> added as " + esc(role) + ". It stays pending until they sign in.", { icon: "user-plus" });
      }, 650);
    });
  }

  /* =================================================== settings */
  function renderGstPref() {
    var inc = BS.prefs().gst === "inc";
    $$("[data-gst]").forEach(function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-gst") === "inc") === inc)); });
    var p = BS.byId("skf-6205-2rs1");
    if (p) $("[data-gst-example]").textContent = "For example, SKF 6205-2RS1 shows as " + (inc ? inr(BS.withGst(p.price), 2) + " incl. GST." : inr(p.price) + " + GST.");
  }
  var NOTIFY_DEFAULT = { email: true, whatsapp: false, pricedrop: true };
  var NOTIFY_LABEL = { email: "Order updates by email", whatsapp: "WhatsApp updates", pricedrop: "Price-drop alerts" };
  function initSettings() {
    renderGstPref();
    $("[data-gst-seg]").addEventListener("click", function (e) {
      var b = e.target.closest("[data-gst]");
      if (!b || b.getAttribute("aria-pressed") === "true") return;
      BS.setPref("gst", b.getAttribute("data-gst"));
      BS.toast(b.getAttribute("data-gst") === "inc" ? "Prices now include 18% GST across the store." : "Prices now show before GST across the store.", { icon: "currency-inr" });
    });
    var n = Object.assign({}, NOTIFY_DEFAULT, BS.store.get("acctNotify", {}));
    $$("[data-notify]").forEach(function (el) {
      var k = el.getAttribute("data-notify");
      el.checked = !!n[k];
      el.addEventListener("change", function () {
        var cur = Object.assign({}, NOTIFY_DEFAULT, BS.store.get("acctNotify", {}));
        cur[k] = el.checked;
        BS.store.set("acctNotify", cur);
        BS.toast(NOTIFY_LABEL[k] + (el.checked ? " turned on." : " turned off."), { icon: el.checked ? "check-circle" : "info" });
      });
    });
    $("[data-signout]").addEventListener("click", function () {
      BS.toast("This is a sample account, there is nothing to sign out of.", { icon: "info" });
    });
  }

  /* =================================================== sub-nav: scroll spy + hash landing */
  var secs = $$("[data-spy-sec]");
  var links = $$("[data-spy]");
  var bar = $("[data-acct-tabs]");
  var lockUntil = 0, current = null;
  function scrollPad() { return parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 70; }
  function setActive(id) {
    if (id === current) return;
    current = id;
    links.forEach(function (a) {
      var on = a.getAttribute("data-spy") === id;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      // Re-centre the phone tab strip on the section in view, unless a tab has keyboard focus.
      if (on && bar && bar.scrollWidth > bar.clientWidth + 4 && !bar.contains(document.activeElement)) {
        var left = a.parentNode.offsetLeft - (bar.clientWidth - a.parentNode.offsetWidth) / 2;
        bar.scrollTo({ left: Math.max(0, left), behavior: BS.reduceMotion ? "auto" : "smooth" });
      }
    });
  }
  function spy() {
    if (Date.now() < lockUntil) return;
    var pad = scrollPad() + 40;
    var cur = secs[0].id;
    secs.forEach(function (s) { if (s.getBoundingClientRect().top <= pad) cur = s.id; });
    var last = secs[secs.length - 1];
    if (last.getBoundingClientRect().bottom < window.innerHeight - 20) cur = last.id;
    setActive(cur);
  }
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { spy(); ticking = false; });
  }, { passive: true });
  window.addEventListener("resize", BS.debounce(spy, 120));
  links.forEach(function (a) {
    a.addEventListener("click", function () { setActive(a.getAttribute("data-spy")); lockUntil = Date.now() + 900; });
  });
  // Tabbing along the phone tab strip: keep the focused tab inside the visible part of the strip.
  if (bar) bar.addEventListener("focusin", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (a && bar.scrollWidth > bar.clientWidth + 4) a.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "auto" });
  });

  var userMoved = false;
  ["wheel", "touchmove", "keydown", "mousedown"].forEach(function (ev) { window.addEventListener(ev, function () { userMoved = true; }, { passive: true, once: true }); });
  function hashId() { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ""; } }
  function land(force) {
    var h = hashId();
    if (!h) return;
    var el = document.getElementById(h);
    if (!el || !root.contains(el)) return;
    if (userMoved && !force) return;
    var html = document.documentElement;
    var prev = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    el.scrollIntoView({ block: "start" });
    html.style.scrollBehavior = prev;
    var sec = el.closest("[data-spy-sec]");
    if (sec) { current = null; setActive(sec.id); lockUntil = Date.now() + 300; }
  }
  window.addEventListener("hashchange", function () {
    var sec = document.getElementById(hashId());
    if (sec && sec.hasAttribute("data-spy-sec")) { setActive(sec.id); lockUntil = Date.now() + 900; }
  });

  /* =================================================== events */
  root.addEventListener("click", function (e) {
    var el;
    if ((el = e.target.closest("[data-ord-toggle]"))) { toggleOrder(el); return; }
    if ((el = e.target.closest("[data-status]"))) {
      ordState.status = el.getAttribute("data-status");
      renderOrders();
      var b = $('[data-status="' + ordState.status + '"]');
      if (b) b.focus();
      return;
    }
    if ((el = e.target.closest("[data-ord-clear]"))) { ordState = { status: "all", q: "" }; $("[data-ord-q]").value = ""; renderOrders(); $("[data-ord-q]").focus(); return; }
    if ((el = e.target.closest("[data-reorder]"))) { reorder(el.getAttribute("data-reorder"), el); return; }
    if ((el = e.target.closest("[data-invoice]"))) { var o = find(el.getAttribute("data-invoice")); if (o) openInvoice(o, el); return; }
    if ((el = e.target.closest("[data-unwish]"))) {
      var id = el.getAttribute("data-unwish"), p = BS.byId(id);
      BS.wish.toggle(id);
      BS.toast("Removed <strong>" + esc(BS.brand(p.brand).name + " " + p.pn) + "</strong> from saved items.", { icon: "heart", label: "Undo", onAction: function () { if (!BS.wish.has(id)) BS.wish.toggle(id); } });
      var next = $("[data-unwish]") || $("[data-wish] a, [data-wish] button");
      if (next) next.focus();
      return;
    }
    if ((el = e.target.closest("[data-add-list]"))) { addList(el.getAttribute("data-add-list"), el); return; }
    if ((el = e.target.closest("[data-del-list]"))) { deleteList(el.getAttribute("data-del-list")); return; }
    if ((el = e.target.closest("[data-accept]"))) { acceptQuote(el.getAttribute("data-accept")); return; }
    if ((el = e.target.closest("[data-addr-edit]"))) { editing = el.getAttribute("data-addr-edit"); renderAddrs(); return; }
    if ((el = e.target.closest("[data-addr-add]"))) { editing = "new"; renderAddrs(); return; }
    if ((el = e.target.closest("[data-addr-cancel]"))) {
      var was = editing; editing = null; renderAddrs();
      var back = was === "new" ? $("[data-addr-add]") : $('[data-addr-edit="' + was + '"]');
      if (back) back.focus();
      return;
    }
    if ((el = e.target.closest("[data-addr-default]"))) {
      var did = el.getAttribute("data-addr-default");
      var all = addresses().map(function (a) { return Object.assign({}, a, { isDefault: a.id === did }); });
      saveAddrs(all); renderAddrs();
      var nd = all.filter(function (a) { return a.id === did; })[0];
      BS.toast("<strong>" + esc(nd.label) + "</strong> is now your default delivery address.", { icon: "map-pin" });
      var eb = $('[data-addr-edit="' + did + '"]'); if (eb) eb.focus();
      return;
    }
    if ((el = e.target.closest("[data-addr-remove]"))) {
      var rid = el.getAttribute("data-addr-remove");
      var before = addresses();
      var gone = before.filter(function (a) { return a.id === rid; })[0];
      saveAddrs(before.filter(function (a) { return a.id !== rid; })); renderAddrs();
      BS.toast("Removed <strong>" + esc(gone.label) + "</strong>.", { icon: "trash", label: "Undo", onAction: function () { saveAddrs(before); renderAddrs(); } });
      var ad = $("[data-addr-add]"); if (ad) ad.focus();
      return;
    }
    if ((el = e.target.closest("[data-cancel-invite]"))) {
      var em = el.getAttribute("data-cancel-invite");
      BS.store.set("acctInvites", invites().filter(function (m) { return m.email !== em; }));
      renderTeam();
      BS.toast("Invitation for " + esc(em) + " cancelled.", { icon: "info" });
      $("#inv-email").focus();
      return;
    }
  });
  root.addEventListener("keydown", function (e) {
    var chip = e.target.closest && e.target.closest("[data-ord-filter] .chip");
    if (!chip || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    var all = $$("[data-ord-filter] .chip");
    var i = all.indexOf(chip) + (e.key === "ArrowRight" ? 1 : -1);
    if (all[i]) { e.preventDefault(); all[i].focus(); }
  });
  var q = $("[data-ord-q]");
  q.addEventListener("input", BS.debounce(function () { ordState.q = q.value.trim(); if (ordersReady) renderOrders(); }, 140));
  q.addEventListener("keydown", function (e) { if (e.key === "Escape" && q.value) { e.stopPropagation(); q.value = ""; ordState.q = ""; renderOrders(); } });

  BS.on("wish", renderWish);
  BS.on("cart", function () {
    var f = $("[data-newlist]");
    if (f && f.contains(document.activeElement)) return; // do not wipe what someone is typing
    // keep keyboard focus on the same control after the lists re-render
    var a = document.activeElement, box = $("[data-nlists]"), sel = null;
    if (a && box && box.contains(a)) {
      ["data-add-list", "data-del-list"].forEach(function (k) { if (a.hasAttribute(k)) sel = "[" + k + '="' + a.getAttribute(k) + '"]'; });
      if (!sel && a.matches("a[href]")) sel = 'a[href="' + a.getAttribute("href") + '"]';
    }
    renderLists();
    if (sel) { var b = $(sel, box); if (b) b.focus({ preventScroll: true }); }
  });
  BS.on("prefs", function () { renderGstPref(); renderAgain(orders()); renderWish(); renderLists(); });
  window.addEventListener("storage", function (e) {
    if (e.key === "bs.orders") { renderAll(); }
    if (e.key === "bs.wish") renderWish();
    if (e.key === "bs.rfqs") renderQuotes();
  });

  /* =================================================== boot */
  function renderAll() {
    var all = orders();
    renderCredit();
    renderStats(all);
    if (ordersReady) { renderOrders(); renderInvoices(); renderQuotes(); }
  }
  greet();
  var all0 = orders();
  renderCredit();
  renderStats(all0);
  renderAgain(all0);
  renderWish();
  renderLists();
  renderAddrs();
  renderTeam();
  initInvite();
  initSettings();
  BS.shelf(root);
  BS.reveal(root);
  spy();
  land(true);
  // Orders, invoices and quotes load like an account API would: skeletons first.
  delay(function () {
    ordersReady = true;
    renderOrders();
    renderInvoices();
    renderQuotes();
    BS.reveal(root);
    land(false);
    spy();
  }, 420);
})();
