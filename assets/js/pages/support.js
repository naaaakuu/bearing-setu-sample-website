/* Support page: FAQ search, order tracking, returns and call-back requests.
   Order data and form helpers come from account.js (window.BSA). */
(function () {
  "use strict";
  var BS = window.BS, BSA = window.BSA;
  if (!BS || !BSA) return;
  var $ = BS.$, $$ = BS.$$, esc = BS.esc, icon = BS.icon;
  var F = BSA.form, fmt = BSA.fmt, dates = BSA.dates;

  function rand4() { return String(1000 + Math.floor(Math.random() * 9000)); }
  function scrollToEl(el, focusEl) {
    el.scrollIntoView({ behavior: BS.reduceMotion ? "auto" : "smooth", block: "start" });
    if (focusEl) setTimeout(function () { focusEl.focus({ preventScroll: true }); }, BS.reduceMotion ? 0 : 450);
  }
  function normId(v) {
    var s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    var m = s.match(/^BS(\d{4})(\d{4})$/);
    return m ? "BS-" + m[1] + "-" + m[2] : String(v || "").trim().toUpperCase();
  }
  var ID_RE = /^BS-\d{4}-\d{4}$/;
  var FORMAT_MSG = "Order numbers look like BS-2611-4821: BS, then the year and month, then 4 digits.";

  /* ================================================================ FAQ */
  var FAQ = [
    { id: "ordering", name: "Ordering", items: [
      ["quick", "How do I order a long list of parts quickly?", 'Use <a href="quick-order.html">Quick order</a>. Paste part numbers with quantities, one per line, such as <span class="mono">6205-2RS1 x 200</span>, and every line is matched and priced as you type. You can also upload a bill of materials as an Excel or CSV file.'],
      ["volume", "Do I get a better price for larger quantities?", 'Yes. Every product shows tier prices, for example 10+, 50+ and 200+ pieces, and the lower price applies in your bag automatically. For larger volumes or a yearly rate contract, <a href="quick-order.html#rfq">request a quote</a>. A specialist replies within 2 working hours, Monday to Saturday 9:30 am to 7 pm.'],
      ["equivalent", "I have a part number from another brand. Can you find the equivalent?", 'Use the <a href="tools.html#interchange">interchange finder</a>. Equivalents share boundary dimensions and sealing type. For critical machines, also check the cage, internal clearance and grease, or ask a specialist to confirm.'],
      ["cancel", "Can I change or cancel an order?", 'Yes, until it is packed. Request a call back or email <a href="mailto:orders@bearingsetu.com">orders@bearingsetu.com</a> with the order number. Once an order is dispatched it cannot be cancelled, but unused parts can be returned within 7 days of delivery.'],
      ["unlisted", "Can you supply a part that is not listed?", 'Often, yes. Send the part number, a photo of the old part or a drawing through <a href="quick-order.html#rfq">Request a quote</a>. We confirm price, brand and lead time by email.']
    ] },
    { id: "payments", name: "Payments and credit", items: [
      ["methods", "Which payment methods do you accept?", "UPI, cards and netbanking on Razorpay’s secure payment page, NEFT or RTGS bank transfer, and 30-day credit for verified business accounts. We never ask for card numbers, OTPs or bank passwords by phone, email or WhatsApp."],
      ["credit", "How does 30-day credit work?", 'Open a <a href="business.html">business account</a> with your GSTIN. Once it is verified, you pay each invoice 30 days from the invoice date. Your credit limit depends on your GST returns and trade references. See what is used and what is due under <a href="account.html#invoices">Invoices in your account</a>.'],
      ["invoice", "Will I get a GST invoice?", "Yes, with every order. Add your GSTIN at checkout and the invoice carries both GSTINs, HSN codes, batch numbers and the tax split, so you can claim input tax credit. Invoices can be downloaded from your account at any time."],
      ["igst", "Why do some invoices show IGST and others CGST and SGST?", "We ship from Pune, Maharashtra. Deliveries within Maharashtra carry CGST 9% plus SGST 9%. Deliveries to any other state carry IGST 18%. The total tax is 18% either way."],
      ["incgst", "Can I see prices including GST?", 'Prices show before GST by default, because most of our buyers claim input tax credit. Switch to prices including GST in <a href="account.html#settings">account settings</a>.']
    ] },
    { id: "shipping", name: "Shipping and delivery", items: [
      ["dispatch", "When will my order be dispatched?", "Order by 4 pm, Monday to Saturday, and in-stock parts are dispatched the same day. Orders placed after 4 pm or on a Sunday go out on the next working day. Made-to-order items show their lead time on the product page."],
      ["cost", "How much does dispatch cost?", "Dispatch is free on orders of ₹5,000 or more before GST. Below that, it costs ₹120 per order."],
      ["time", "How long does delivery take?", 'Standard delivery takes 1 working day after dispatch in the Pune region, 2 working days to the rest of Maharashtra, Delhi, Bengaluru, Chennai, Hyderabad and Kolkata, and 4 to 5 working days elsewhere. Express, for ₹350, arrives the next working day after dispatch outside the Pune region. You can also pick up from our Pune warehouse, usually ready in about 4 hours. See the <a href="policies.html#shipping">delivery table</a>.'],
      ["tracking", "How do I track my order?", 'Use <a href="#track" data-jump="track">Track an order</a> on this page with your order number and delivery pincode. Once the order is dispatched you see the courier and AWB number. Email and WhatsApp updates can be switched on in <a href="account.html#settings">account settings</a>.'],
      ["air", "Do you send greases and oils by air?", "No. Greases and oils travel by road, which can add a day in some regions. Aerosol sprays are never sent by air."]
    ] },
    { id: "returns", name: "Returns", items: [
      ["what", "What can I return?", "Unused parts in their original packing, within 7 days of delivery. Seals, labels and boxes should be intact so the part can go back on the shelf. A damaged or wrong part must be reported within 48 hours of delivery."],
      ["not", "What cannot be returned?", "Parts that have been fitted, run, greased or heated, or damaged after delivery. Greases and oils once the tin, pail or drum is opened. Chains and belts cut or made to length, and seals made to drawing. Items made to order or sourced specially on a quote."],
      ["start", "How do I start a return?", 'Fill in the <a href="#returns" data-jump="returns">return request</a> on this page with your order number and the item. You get a reference straight away, and we email pickup details within one working day.'],
      ["refund", "When do I get my money back?", "After the part reaches our Pune warehouse and passes inspection, we refund your original payment method within 5 working days. For orders on credit, we issue a credit note against your account."],
      ["damaged", "What if a part arrives damaged, or I received a different part?", "Tell us within 48 hours of delivery, with photos of the part, its label and the box. We replace it or refund it in full, including any dispatch charge, and we pay for the return."]
    ] },
    { id: "technical", name: "Parts and technical", items: [
      ["c3", "What does C3 clearance mean, and do I need it?", 'C3 means the bearing has more internal radial clearance than normal (CN). The extra room allows for heat and a tight fit on the shaft, so C3 is common in electric motors, pumps, fans and vibrating screens. Replace like for like: if the old bearing says C3, order C3. The same bearing is written <span class="mono">6205-2RS1/C3</span> by SKF, <span class="mono">6205-2RSR-C3</span> by FAG and <span class="mono">6205DDUC3</span> by NSK.'],
      ["nlgi", "What do NLGI grades mean for grease?", "The NLGI number says how stiff a grease is, from 000 (almost fluid) to 6 (block). Most rolling bearings use NLGI 2, such as SKF LGMT 2. NLGI 3 is firmer and suits larger bearings, vertical shafts and vibration. NLGI 1 and 0 suit centralised lubrication systems and cold conditions. Avoid mixing greases with different thickeners, such as lithium and polyurea."],
      ["seals", "What do 2RS, 2Z and ZZ mean?", "They describe what covers the bearing on both sides. 2RS, 2RS1, 2RSR, DDU and LLU are rubber contact seals, best against dust and water. 2Z, ZZ and 2ZR are metal shields, with lower friction for higher speeds but less protection from fine dust. A bearing with no suffix is open and is lubricated from the housing."],
      ["bore", "How do I read the bore size from a bearing number?", 'For most metric ball and roller bearings, multiply the last two digits by 5 to get the bore in millimetres, from 04 upwards: a 6205 has a 25 mm bore and a 6310 has a 50 mm bore. 00 is 10 mm, 01 is 12 mm, 02 is 15 mm and 03 is 17 mm. The <a href="tools.html#decoder">part number decoder</a> reads the full number for you.'],
      ["grease", "How much grease should I put in a bearing?", 'Fill the bearing itself fully, and the free space in the housing to about a third to a half. Too much grease makes a bearing run hot. The <a href="tools.html#grease">grease calculator</a> gives the relubrication quantity from the bearing size.']
    ] }
  ];
  var items = [];
  FAQ.forEach(function (g) {
    g.items.forEach(function (it) {
      var tmp = document.createElement("div");
      tmp.innerHTML = it[2];
      items.push({ id: g.id + "-" + it[0], group: g, q: it[1], a: it[2], text: (it[1] + " " + tmp.textContent + " " + g.name).toLowerCase() });
    });
  });
  var groupsEl = $("[data-faq-groups]");
  groupsEl.innerHTML = FAQ.map(function (g, gi) {
    return '<div class="fgroup reveal" style="--i:' + gi + '" id="faq-' + g.id + '" data-fgroup="' + g.id + '">' +
      '<h3 class="fgroup__t">' + esc(g.name) + '<span class="fgroup__n num" data-fgroup-n></span></h3>' +
      '<div class="fgroup__list">' + items.filter(function (x) { return x.group === g; }).map(function (x) {
        return '<div class="fq" data-fq="' + x.id + '">' +
          '<h4 class="fq__h"><button class="fq__btn" type="button" id="fq-' + x.id + '-b" aria-expanded="false" aria-controls="fq-' + x.id + '-p">' +
            '<span class="fq__q">' + esc(x.q) + '</span><span class="fq__ic" aria-hidden="true">' + icon("plus", "fq__plus") + icon("minus", "fq__minus") + "</span></button></h4>" +
          '<div class="fq__panel" id="fq-' + x.id + '-p" role="region" aria-labelledby="fq-' + x.id + '-b"><div class="fq__inner"><div class="fq__a">' + x.a + "</div></div></div></div>";
      }).join("") + "</div></div>";
  }).join("");

  function setOpen(row, open) {
    row.classList.toggle("is-open", open);
    $(".fq__btn", row).setAttribute("aria-expanded", String(open));
  }
  groupsEl.addEventListener("click", function (e) {
    var b = e.target.closest(".fq__btn");
    if (b) { var row = b.closest(".fq"); setOpen(row, !row.classList.contains("is-open")); return; }
    var j = e.target.closest("[data-jump]");
    if (j) { e.preventDefault(); var t = document.getElementById(j.getAttribute("data-jump")); history.replaceState(null, "", "#" + t.id); scrollToEl(t, $("input", t)); }
  });

  // highlight query words inside text nodes only, so links in answers keep working
  function highlight(el, words) {
    if (!words.length) return;
    var re = new RegExp("(" + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "gi");
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      if (!re.test(n.nodeValue)) return;
      re.lastIndex = 0;
      var span = document.createElement("span");
      span.innerHTML = esc(n.nodeValue).replace(re, "<mark>$1</mark>");
      var frag = document.createDocumentFragment();
      while (span.firstChild) frag.appendChild(span.firstChild);
      n.parentNode.replaceChild(frag, n);
    });
  }
  var qInput = $("[data-faq-q]"), countEl = $("[data-faq-count]"), hitsEl = $("[data-faq-hits]"), statusEl = $("[data-faq-status]"), emptyEl = $("[data-faq-empty]");
  var clearBtn = $(".sup-search__clear");
  if (window.matchMedia("(max-width: 640px)").matches) qInput.placeholder = "Search: C3, NLGI, invoices";
  function runSearch() {
    var raw = qInput.value.trim();
    var words = raw.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 0; });
    clearBtn.hidden = !raw;
    var matches = [];
    items.forEach(function (x) {
      var row = $('[data-fq="' + x.id + '"]');
      $(".fq__q", row).textContent = x.q;
      $(".fq__a", row).innerHTML = x.a;
      var hit = !words.length || words.every(function (w) { return x.text.indexOf(w) !== -1; });
      row.hidden = !hit;
      if (hit && words.length) {
        matches.push(x);
        highlight($(".fq__q", row), words);
        highlight($(".fq__a", row), words);
        var inQ = words.some(function (w) { return x.q.toLowerCase().indexOf(w) !== -1; });
        if (!inQ) setOpen(row, true);
      }
    });
    FAQ.forEach(function (g) {
      var el = $('[data-fgroup="' + g.id + '"]');
      var n = $$(".fq:not([hidden])", el).length;
      el.hidden = n === 0;
      $("[data-fgroup-n]", el).textContent = words.length && n ? String(n) : "";
    });
    if (!words.length) {
      countEl.textContent = "";
      hitsEl.hidden = true;
      statusEl.hidden = true;
      emptyEl.hidden = true;
      groupsEl.hidden = false;
      return;
    }
    var label = "“" + raw + "”";
    countEl.textContent = matches.length ? BS.plural(matches.length, "answer") + " " + (matches.length === 1 ? "matches " : "match ") + label + "." : "No answers match " + label + ".";
    statusEl.hidden = false;
    statusEl.innerHTML = matches.length ? "Showing " + BS.plural(matches.length, "answer") + " for " + esc(label) + ' <button class="textlink" type="button" data-faq-clear>Clear search</button>' : "";
    groupsEl.hidden = !matches.length;
    emptyEl.hidden = !!matches.length;
    if (!matches.length) $("[data-faq-empty-t]").textContent = "No answers for " + label;
    hitsEl.hidden = false;
    if (!matches.length) {
      hitsEl.innerHTML = '<p class="sup-hits__none">Try fewer words, or <a href="#contact" data-cb-topic="Something else">ask a specialist</a>. We reply within one working day.</p>';
      return;
    }
    hitsEl.innerHTML = '<ul class="sup-hits__list">' + matches.slice(0, 5).map(function (x) {
      return '<li><button class="hit" type="button" data-hit="' + x.id + '"><span class="hit__q">' + esc(x.q) + '</span><span class="hit__g">' + esc(x.group.name) + "</span>" + icon("caret-right") + "</button></li>";
    }).join("") + "</ul>" + (matches.length > 5 ? '<a class="more sup-hits__all" href="#faq">See all ' + matches.length + " answers</a>" : "");
    $$(".hit__q", hitsEl).forEach(function (el) { highlight(el, words); });
  }
  qInput.addEventListener("input", BS.debounce(runSearch, 120));
  $("[data-faq-form]").addEventListener("submit", function (e) {
    e.preventDefault();
    runSearch();
    var first = $(".fq:not([hidden]) .fq__btn");
    scrollToEl($("#faq"), first || null);
  });
  qInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && qInput.value) { e.stopPropagation(); qInput.value = ""; runSearch(); }
    if (e.key === "ArrowDown") { var h = $(".hit", hitsEl); if (h) { e.preventDefault(); h.focus(); } }
  });
  hitsEl.addEventListener("keydown", function (e) {
    var hs = $$(".hit", hitsEl), i = hs.indexOf(document.activeElement);
    if (i === -1) return;
    if (e.key === "ArrowDown" && hs[i + 1]) { e.preventDefault(); hs[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (hs[i - 1] || qInput).focus(); }
  });
  hitsEl.addEventListener("click", function (e) {
    var h = e.target.closest("[data-hit]");
    if (!h) return;
    var row = $('[data-fq="' + h.getAttribute("data-hit") + '"]');
    setOpen(row, true);
    scrollToEl(row, $(".fq__btn", row));
  });
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-faq-clear]")) { qInput.value = ""; runSearch(); qInput.focus(); return; }
    var t = e.target.closest("[data-topic]");
    if (t) { qInput.value = t.getAttribute("data-topic"); runSearch(); qInput.focus(); }
  });

  /* ================================================================ tracking */
  var trackForm = $("[data-track-form]"), out = $("[data-track-out]");
  var tId = $("#trk-id"), tPin = $("#trk-pin"), tBtn = $("[data-track-btn]");
  var tTried = false, lastShown = null;
  function pinOf(o) { return o.mode === "pickup" ? "" : String(o.addr.pin || "").replace(/\D/g, ""); }
  function validateTrack() {
    var id = normId(tId.value), pin = tPin.value.replace(/\D/g, "");
    var o = null, okId = true, okPin = true;
    if (!tId.value.trim()) okId = F.setErr(tId, "Enter your order number, for example BS-2611-4821.");
    else if (!ID_RE.test(id)) okId = F.setErr(tId, FORMAT_MSG + " Find it in your confirmation email, on the GST invoice or under Orders in your account.");
    else {
      o = BSA.find(id);
      okId = F.setErr(tId, o ? "" : "We could not find order " + id + ". Check the digits against your confirmation email or invoice. Orders placed on another device show in that device’s account.");
    }
    if (!pin) okPin = F.setErr(tPin, "Enter the 6-digit delivery pincode.");
    else if (!/^[1-9]\d{5}$/.test(pin)) okPin = F.setErr(tPin, "Pincodes have 6 digits and do not start with 0, for example 641035.");
    else if (o && pinOf(o) && pinOf(o) !== pin) okPin = F.setErr(tPin, "This pincode does not match the delivery address for " + o.id + ". Use the pincode the order is going to.");
    else okPin = F.setErr(tPin, "");
    return { ok: okId && okPin, order: o, focus: !okId ? tId : !okPin ? tPin : null };
  }
  function stepHTML(s) {
    var when = s.at ? fmt.dt(s.at) : s.expected ? "Expected " + fmt.rel(s.expected) + (/packed|dispatched/.test(s.key) && /today|tomorrow/.test(fmt.rel(s.expected)) ? ", by " + fmt.time(s.expected) : "") : s.state === "void" ? "Did not happen" : s.wait || "Not yet";
    var cls = "tl__step is-" + s.state + (s.key === "delivered" && s.state !== "next" && s.state !== "void" && s.at ? " is-final" : "");
    return '<li class="' + cls + '"' + (s.state === "current" ? ' aria-current="step"' : "") + ">" +
      '<span class="tl__dot" aria-hidden="true">' + (s.state === "done" || (s.state === "current" && s.key === "delivered") ? icon("check") : "") + "</span>" +
      '<div class="tl__body"><p class="tl__label">' + esc(s.label) + (s.state === "current" ? '<span class="tl__now">Now</span>' : "") +
        '<span class="sr-only">' + (s.state === "done" ? ", done" : s.state === "current" ? ", current step" : s.state === "void" ? ", cancelled" : ", to come") + "</span></p>" +
        '<p class="tl__when">' + esc(when) + "</p>" +
        (s.detail ? '<p class="tl__detail">' + esc(s.detail).replace(/AWB (\S+)/, 'AWB <span class="mono">$1</span>') + "</p>" : "") +
        (s.scans && s.scans.length && s.state !== "next" ? '<ul class="tl__scans">' + s.scans.map(function (x) { return "<li><span>" + fmt.dt(x[0]) + "</span>" + esc(x[1]) + "</li>"; }).join("") + "</ul>" : "") +
      "</div></li>";
  }
  function trackHTML(o) {
    var tl = BSA.timeline(o);
    var B = { Confirmed: "", Packed: "badge--blue", Dispatched: "badge--blue", Delivered: "badge--green", Cancelled: "badge--red" };
    var a = o.addr;
    var meta = [];
    if (o.courier && (o.ev.dispatched || o.status === "Delivered")) meta.push(esc(o.courier) + ' · AWB <span class="mono">' + esc(o.awb) + "</span>");
    if (o.mode === "pickup") meta.push("Pick up at Bhosari MIDC, Pune");
    else meta.push("To " + esc([a.city, a.pin].filter(Boolean).join(" ")));
    var pcs = o.lines.reduce(function (s, l) { return s + l.qty; }, 0);
    return '<article class="trk-card" aria-labelledby="trk-card-t">' +
      '<header class="trk-card__head"><div><p class="trk-card__id mono">' + esc(o.id) + " · placed " + fmt.date(o.date, { short: true }) + "</p>" +
        '<h3 class="trk-card__eta" id="trk-card-t">' + esc(BSA.etaText(o)) + "</h3>" +
        '<p class="trk-card__meta">' + meta.join('<span aria-hidden="true"> · </span>') + "</p></div>" +
        '<span class="badge ' + (B[o.status] || "") + '">' + esc(o.status) + "</span></header>" +
      (tl.cancelled ? '<p class="notice notice--warm trk-card__note">' + icon("info") + "<span>" + esc(o.note || "This order was cancelled.") + "</span></p>" : "") +
      '<ol class="tl' + (tl.cancelled ? " tl--void" : "") + '">' + tl.steps.map(stepHTML).join("") + "</ol>" +
      '<div class="trk-items"><h4 class="trk-items__t">' + BS.plural(o.lines.length, "part") + ", " + BS.plural(pcs, "piece") + "</h4><ul>" +
        o.lines.map(function (l) {
          return '<li><span class="trk-items__img">' + (l.p ? BS.imgTag(l.p.img, { alt: "", sizes: "44px" }) : icon("cube")) + '</span><span class="trk-items__n">' +
            (l.p ? '<a href="' + BS.url(l.p) + '">' + esc(l.brand + " " + l.pn) + "</a>" : "<strong>" + esc(l.pn) + "</strong>") + "<small>" + esc(l.title) + '</small></span><span class="trk-items__q num">× ' + l.qty + "</span></li>";
        }).join("") + "</ul></div>" +
      '<footer class="trk-card__foot">' +
        (o.status === "Delivered" ? '<button class="btn btn--sm btn--quiet" type="button" data-return-for="' + esc(o.id) + '">' + icon("arrow-counter-clockwise") + "Start a return</button>" : "") +
        '<a class="btn btn--sm btn--quiet" href="#contact" data-cb-topic="Order status or delivery" data-cb-parts="Order ' + esc(o.id) + '">' + icon("headset") + "Ask about this order</a>" +
        '<a class="more" href="account.html#orders">See all orders</a>' +
      "</footer></article>";
  }
  function skeletonHTML() {
    return '<div class="trk-card trk-card--skel" aria-busy="true"><span class="skeleton sk-a"></span><span class="skeleton sk-b"></span>' +
      '<div class="sk-tl">' + [1, 2, 3, 4, 5].map(function () { return '<span class="skeleton sk-dot"></span><span class="skeleton sk-line"></span>'; }).join("") + "</div></div>";
  }
  var trackSay = $("[data-track-status]");
  function showOrder(o, scroll) {
    tBtn.classList.add("is-loading");
    tBtn.setAttribute("aria-busy", "true");
    out.setAttribute("aria-busy", "true");
    out.innerHTML = skeletonHTML();
    lastShown = o.id;
    if (trackSay) trackSay.textContent = "Looking up order " + o.id + ".";
    setTimeout(function () {
      tBtn.classList.remove("is-loading");
      tBtn.setAttribute("aria-busy", "false");
      out.setAttribute("aria-busy", "false");
      out.innerHTML = trackHTML(o);
      if (trackSay) trackSay.textContent = "Order " + o.id + ": " + o.status + ". " + BSA.etaText(o) + ".";
      var card = $(".trk-card", out);
      if (scroll && window.matchMedia("(max-width: 834px)").matches) card.scrollIntoView({ behavior: BS.reduceMotion ? "auto" : "smooth", block: "start" });
    }, 520);
  }
  trackForm.addEventListener("submit", function (e) {
    e.preventDefault();
    tTried = true;
    var r = validateTrack();
    if (!r.ok) { r.focus.focus(); return; }
    tId.value = r.order.id;
    showOrder(r.order, true);
  });
  [tId, tPin].forEach(function (el) {
    el.addEventListener("blur", function () { if (tTried) validateTrack(); });
    el.addEventListener("input", function () { if (el.getAttribute("aria-invalid") === "true") validateTrack(); });
  });
  $("[data-try]").addEventListener("click", function (e) {
    e.preventDefault();
    tId.value = BSA.sampleTrack.id;
    tPin.value = BSA.sampleTrack.pin;
    F.setErr(tId, ""); F.setErr(tPin, "");
    trackForm.requestSubmit ? trackForm.requestSubmit() : trackForm.dispatchEvent(new Event("submit", { cancelable: true }));
  });
  out.addEventListener("click", function (e) {
    var b = e.target.closest("[data-return-for]");
    if (b) { rOrder.value = b.getAttribute("data-return-for"); lookupReturnOrder(); scrollToEl($("#returns"), rItemSel.offsetParent ? rItemSel : rItem); }
  });

  /* ================================================================ returns */
  var rForm = $("[data-return-form]"), rDone = $("[data-return-done]");
  var rOrder = $("#rt-order"), rStatus = $("[data-rt-status]"), rItemSel = $("#rt-item-sel"), rItem = $("#rt-item"), rQty = $("#rt-qty"), rReason = $("#rt-reason"), rCond = $("#rt-cond"), rPhotos = $("#rt-photos"), rFiles = $("[data-rt-files]");
  var rFound = null;
  function daysSince(d) { return Math.floor((dates.at(new Date(), 0, 0) - dates.at(d, 0, 0)) / 864e5); }
  function lookupReturnOrder() {
    var id = normId(rOrder.value);
    if (rFound && rFound.id === id) return;
    rFound = ID_RE.test(id) ? BSA.find(id) : null;
    var selWrap = $("[data-rt-item-select]"), txtWrap = $("[data-rt-item-text]");
    if (rFound) {
      rOrder.value = rFound.id;
      rItemSel.innerHTML = '<option value="">Choose an item from this order</option>' + rFound.lines.map(function (l, i) {
        return '<option value="' + i + '">' + esc((l.brand ? l.brand + " " : "") + l.pn) + " · " + l.qty + " ordered</option>";
      }).join("");
      selWrap.hidden = false; txtWrap.hidden = true;
      var del = rFound.ev.delivered;
      var msg, cls;
      if (rFound.status === "Cancelled") { msg = "This order was cancelled, so there is nothing to return."; cls = "is-warn"; }
      else if (!del) { msg = "On its way. Returns open once the order is delivered."; cls = "is-warn"; }
      else if (daysSince(del) > 7) { msg = "Delivered " + fmt.date(del, { short: true }) + ", more than 7 days ago."; cls = "is-warn"; }
      else { msg = "Delivered " + fmt.date(del, { day: true, short: true }) + " to " + (rFound.addr.city || "your address") + ". " + BS.plural(rFound.lines.length, "part") + " in this order."; cls = "is-ok"; }
      rStatus.className = "rt-status " + cls;
      rStatus.innerHTML = icon(cls === "is-ok" ? "check-circle" : "warning-circle") + "<span>" + esc(msg) + "</span>";
    } else {
      selWrap.hidden = true; txtWrap.hidden = false;
      rItemSel.innerHTML = "";
      if (ID_RE.test(id)) {
        rStatus.className = "rt-status is-info";
        rStatus.innerHTML = icon("info") + "<span>We could not find this order on this device. Describe the item below and we will match it.</span>";
      } else { rStatus.className = "rt-status"; rStatus.textContent = ""; }
    }
  }
  rOrder.addEventListener("change", lookupReturnOrder);
  rOrder.addEventListener("input", BS.debounce(function () { if (ID_RE.test(normId(rOrder.value))) lookupReturnOrder(); }, 250));
  function needsPhoto() { return /Damaged|different/i.test(rReason.value); }
  // Damage in transit or a wrong part must be reported within 48 hours of delivery
  // (policies.html#returns); other returns have 7 days.
  var REPORT_MS = 48 * 3600e3;
  function lateReport(reason) {
    return !!(rFound && rFound.ev.delivered && /Damaged|different/i.test(reason) && Date.now() - rFound.ev.delivered.getTime() > REPORT_MS);
  }
  function renderFiles() {
    var fs = Array.prototype.slice.call(rPhotos.files || []);
    rFiles.innerHTML = fs.map(function (f) { return "<li>" + icon("upload-simple") + "<span>" + esc(f.name) + "</span><small>" + (f.size > 1048576 ? (f.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(f.size / 1024)) + " KB") + "</small></li>"; }).join("");
  }
  rPhotos.addEventListener("change", function () { renderFiles(); if (rTried) F.setErr(rPhotos, photoRule()); });
  function photoRule() {
    var fs = Array.prototype.slice.call(rPhotos.files || []);
    if (fs.length > 5) return "Choose up to 5 photos.";
    if (fs.some(function (f) { return !/^image\//.test(f.type) && !/\.(jpe?g|png|heic|webp)$/i.test(f.name); })) return "Photos must be images, such as JPG or PNG.";
    if (fs.some(function (f) { return f.size > 10 * 1048576; })) return "Each photo must be under 10 MB.";
    if (!fs.length && needsPhoto()) return "Add at least one photo of the part and its box, so we can approve this quickly.";
    return "";
  }
  var rTried = false;
  var rRules = {
    order: function (v) {
      var id = normId(v);
      if (ID_RE.test(id) && (!rFound || rFound.id !== id)) lookupReturnOrder();
      if (!v) return "Enter the order number, for example BS-2611-0583.";
      if (!ID_RE.test(id)) return FORMAT_MSG;
      if (rFound) {
        if (rFound.status === "Cancelled") return "Order " + rFound.id + " was cancelled, so it cannot be returned.";
        if (!rFound.ev.delivered) return "Order " + rFound.id + " has not been delivered yet. You can request a return once it arrives.";
        if (daysSince(rFound.ev.delivered) > 7) return "Order " + rFound.id + " was delivered on " + fmt.date(rFound.ev.delivered) + ", more than 7 days ago. For a quality concern, request a call back below.";
      }
      return "";
    },
    itemSel: function (v) { return rFound && v === "" ? "Choose the item you want to return." : ""; },
    itemText: function (v) { return !rFound && v.length < 3 ? "Enter the part number and brand of the item." : ""; },
    qty: function (v) {
      var n = parseInt(v, 10);
      if (!n || n < 1) return "Enter how many pieces you are returning.";
      if (rFound && rItemSel.value !== "") { var l = rFound.lines[+rItemSel.value]; if (l && n > l.qty) return "You ordered " + l.qty + " of these. Enter " + l.qty + " or fewer."; }
      return "";
    },
    reason: function (v) {
      if (!v) return "Choose a reason for the return.";
      if (lateReport(v)) return "A damaged or wrong part must be reported within 48 hours of delivery, and order " + rFound.id + " was delivered on " + fmt.date(rFound.ev.delivered) + ". Request a call back below and a specialist will look into it.";
      return "";
    },
    cond: function (v, el) { return el.checked ? "" : "Returns are accepted only for unused parts in original packing. For a fitted part that failed, request a call back."; },
    photos: function () { return photoRule(); }
  };
  F.wire(rForm, rRules, function () {
    var btn = $(".rtn__submit", rForm);
    F.busy(btn, true);
    setTimeout(function () {
      F.busy(btn, false);
      var ref = "RT-" + rand4();
      var line = rFound && rItemSel.value !== "" ? rFound.lines[+rItemSel.value] : null;
      var itemName = line ? (line.brand ? line.brand + " " : "") + line.pn : rItem.value.trim();
      var rec = { ref: ref, date: new Date().toISOString(), order: normId(rOrder.value), item: itemName, qty: parseInt(rQty.value, 10), reason: rReason.value, photos: (rPhotos.files || []).length, notes: $("#rt-notes").value.trim() };
      var list = BS.store.get("returns", []);
      list = Array.isArray(list) ? list : [];
      list.unshift(rec);
      BS.store.set("returns", list);
      rForm.hidden = true;
      rDone.hidden = false;
      rDone.innerHTML = '<span class="done__check" aria-hidden="true">' + icon("check") + "</span>" +
        '<h3 class="h3">Return requested.</h3><p class="done__ref">Reference <span class="mono">' + ref + "</span></p>" +
        '<p class="muted">We email pickup details within one working day. Keep the part in its original packing until the courier collects it.</p>' +
        '<dl class="done__dl"><div><dt>Order</dt><dd class="mono">' + esc(rec.order) + "</dd></div><div><dt>Item</dt><dd>" + esc(rec.item) + " × " + rec.qty + "</dd></div><div><dt>Reason</dt><dd>" + esc(rec.reason) + "</dd></div>" +
        (rec.photos ? "<div><dt>Photos</dt><dd>" + rec.photos + " attached</dd></div>" : "") + "</dl>" +
        '<div class="done__acts"><button class="btn btn--sm btn--quiet" type="button" data-return-again>Return another item</button><a class="more" href="#track">Track an order</a></div>';
      rDone.focus();
      BS.toast("Return <strong>" + ref + "</strong> requested.", { icon: "check-circle" });
    }, 900);
  });
  rForm.addEventListener("submit", function () { rTried = true; }, true);
  rReason.addEventListener("change", function () { if (rTried) { F.setErr(rPhotos, photoRule()); F.setErr(rReason, rRules.reason(rReason.value)); } });
  rItemSel.addEventListener("change", function () {
    var l = rFound && rItemSel.value !== "" ? rFound.lines[+rItemSel.value] : null;
    if (l) { rQty.max = l.qty; if (+rQty.value > l.qty) rQty.value = l.qty; }
  });
  rDone.addEventListener("click", function (e) {
    if (!e.target.closest("[data-return-again]")) return;
    rForm.reset(); rFiles.innerHTML = ""; rStatus.textContent = ""; rStatus.className = "rt-status"; rFound = null;
    $("[data-rt-item-select]").hidden = true; $("[data-rt-item-text]").hidden = false;
    rTried = false;
    Object.keys(rRules).forEach(function (n) { var el = rForm.querySelector('[name="' + n + '"]'); if (el) F.setErr(el, ""); });
    rDone.hidden = true; rForm.hidden = false; rOrder.focus();
  });

  /* ================================================================ call back */
  var cbForm = $("[data-cb-form]"), cbDone = $("[data-cb-done]"), slotSel = $("[data-cb-slots]");
  var SLOTS = [[9, 30, 11, 30], [11, 30, 13, 30], [14, 0, 16, 0], [16, 0, 19, 0]];
  function t12(h, m, showAp) { var ap = h < 12 ? "am" : "pm"; var hh = h % 12 || 12; return hh + (m ? ":" + (m < 10 ? "0" : "") + m : "") + (showAp ? " " + ap : ""); }
  function slotLabel(s) { var sameAp = (s[0] < 12) === (s[2] < 12); return t12(s[0], s[1], !sameAp) + " to " + t12(s[2], s[3], true); }
  function buildSlots() {
    var now = new Date(), opts = [], day = new Date(now);
    for (var d = 0; d < 3 && opts.length < 8; d++) {
      if (d > 0) day = dates.nextWork(day);
      if (!dates.isWork(day)) continue;
      SLOTS.forEach(function (s) {
        var end = dates.at(day, s[2], s[3]);
        if (end - now < 75 * 60e3) return;
        var dayLbl = dates.sameDay(day, now) ? "Today" : dates.sameDay(day, dates.addDays(now, 1)) ? "Tomorrow" : fmt.date(day, { day: true, short: true });
        opts.push({ v: dates.at(day, s[0], s[1]).toISOString(), l: dayLbl + ", " + slotLabel(s), when: slotLabel(s).replace(" to ", " and ") + " " + (dayLbl === "Today" || dayLbl === "Tomorrow" ? dayLbl.toLowerCase() : "on " + dayLbl) });
      });
    }
    slotSel.innerHTML = '<option value="">Choose a time slot</option>' + opts.map(function (o) { return '<option value="' + o.v + '" data-when="' + esc(o.when) + '">' + esc(o.l) + "</option>"; }).join("");
  }
  buildSlots();
  var TOPIC_ABOUT = { "Order status or delivery": "your order", "Return or replacement": "your return", "Price for volume or a quote": "prices for your volumes", "Help choosing a part": "choosing the right part", "Is my part genuine?": "checking your part is genuine", "Credit account and invoices": "your credit account and invoices", "Something else": "your question" };
  function cleanMobile(v) { return v.replace(/[\s\-()]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, ""); }
  var cbW = F.wire(cbForm, {
    name: function (v) { return v.length >= 2 ? "" : "Enter your name so the specialist knows who to ask for."; },
    mobile: function (v) {
      var m = cleanMobile(v);
      if (!m) return "Enter your 10-digit mobile number.";
      return /^[6-9]\d{9}$/.test(m) ? "" : "Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.";
    },
    topic: function (v) { return v ? "" : "Choose what the call is about."; },
    slot: function (v) { return v ? "" : "Choose when we should call."; }
  }, function () {
    var btn = $('button[type="submit"]', cbForm);
    F.busy(btn, true);
    setTimeout(function () {
      F.busy(btn, false);
      var ref = "CB-" + rand4();
      var m = cleanMobile(cbForm.elements.mobile.value);
      var opt = slotSel.options[slotSel.selectedIndex];
      var rec = { ref: ref, date: new Date().toISOString(), name: cbForm.elements.name.value.trim(), mobile: m, topic: cbForm.elements.topic.value, slot: slotSel.value, parts: cbForm.elements.parts.value.trim() };
      var list = BS.store.get("callbacks", []);
      list = Array.isArray(list) ? list : [];
      list.unshift(rec);
      BS.store.set("callbacks", list);
      cbForm.hidden = true;
      cbDone.hidden = false;
      cbDone.innerHTML = '<span class="done__check" aria-hidden="true">' + icon("check") + "</span>" +
        '<h3 class="h3">We will call between ' + esc(opt.getAttribute("data-when")) + ".</h3>" +
        '<p class="done__ref">Reference <span class="mono">' + ref + "</span></p>" +
        '<p class="muted">A specialist will call ' + esc(rec.name.split(" ")[0]) + " on +91 " + m.slice(0, 5) + " " + m.slice(5) + " about " + esc(TOPIC_ABOUT[rec.topic] || "your question") + ". If the slot no longer works, reply to the confirmation email or request a new slot.</p>" +
        (rec.parts ? '<pre class="done__parts mono">' + esc(rec.parts) + "</pre>" : "") +
        '<div class="done__acts"><button class="btn btn--sm btn--quiet" type="button" data-cb-again>Request another call back</button></div>';
      cbDone.focus();
      BS.toast("Call back <strong>" + ref + "</strong> booked.", { icon: "headset" });
    }, 900);
  });
  cbDone.addEventListener("click", function (e) {
    if (!e.target.closest("[data-cb-again]")) return;
    cbForm.reset(); cbW.reset(); buildSlots();
    cbDone.hidden = true; cbForm.hidden = false;
    cbForm.elements.name.focus();
  });
  // links that preselect a topic (genuine check, order help, empty FAQ)
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-cb-topic]");
    if (!a) return;
    e.preventDefault();
    if (!cbForm.hidden) {
      cbForm.elements.topic.value = a.getAttribute("data-cb-topic");
      var parts = a.getAttribute("data-cb-parts");
      if (parts && !cbForm.elements.parts.value) cbForm.elements.parts.value = parts;
      if (cbForm.elements.topic.getAttribute("aria-invalid") === "true") F.setErr(cbForm.elements.topic, "");
    }
    history.replaceState(null, "", "#contact");
    scrollToEl($("#contact"), cbForm.hidden ? cbDone : cbForm.elements.name);
  });

  /* copy email */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy]");
    if (!b) return;
    var v = b.getAttribute("data-copy");
    function done() { BS.toast("Copied <strong>" + esc(v) + "</strong>.", { icon: "copy" }); }
    function fallback() { BS.toast("Our email is <strong>" + esc(v) + "</strong>.", { icon: "envelope-simple" }); }
    try {
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(v).then(done, fallback);
      else fallback();
    } catch (err) { fallback(); }
  });

  /* open now, in India time */
  (function () {
    var el = $("[data-open-now]");
    var parts = {};
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    } catch (err) { return; }
    var wd = parts.weekday, mins = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
    var open = wd !== "Sun" && mins >= 570 && mins < 1140;
    var next = wd === "Sat" && mins >= 1140 ? "Monday" : wd === "Sun" ? "Monday" : mins < 570 ? "today" : "tomorrow";
    el.className = "visit__open " + (open ? "is-open" : "is-closed");
    el.textContent = open ? "Open now, closes at 7 pm" : "Closed now, opens " + next + " at 9:30 am";
  })();

  /* ================================================================ boot */
  var pOrder = BS.params().get("order");
  if (pOrder) {
    tId.value = normId(pOrder);
    var o = BSA.find(tId.value);
    if (o) {
      if (pinOf(o)) tPin.value = pinOf(o);
      showOrder(o, false);
    } else { tTried = true; validateTrack(); }
  }
  BS.reveal();
  // land on the hash after the FAQ has rendered
  var hashId = "";
  try { hashId = decodeURIComponent(location.hash.slice(1)); } catch (err) { hashId = ""; }
  if (hashId) {
    var target = document.getElementById(hashId);
    if (target) requestAnimationFrame(function () {
      var html = document.documentElement, prev = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      target.scrollIntoView({ block: "start" });
      html.style.scrollBehavior = prev;
    });
  }
})();
