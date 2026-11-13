/* Quote list page. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, esc = BS.esc, icon = BS.icon, doc = document;

  function rowHTML(l) {
    var key = esc(l.key), p = l.p, min = p ? BS.moq(p) : 1, u = p ? BS.unitPrice(p, l.qty) : null, inc = BS.gstInc();
    var part = p
      ? '<a class="qpart__img" href="' + BS.url(p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(p.img, { alt: "", sizes: "68px" }) + '</a><div><a class="qpart__t" href="' + BS.url(p) + '">' + esc(BS.name(p)) + '</a><div class="qpart__s">' + esc(p.title) + '</div><div class="qpart__c">' + BS.chips(p).map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div></div>"
      : '<span class="qpart__img" aria-hidden="true"></span><div><span class="qpart__t">' + esc(l.text) + '</span><div class="qpart__s">Not in the catalogue. We will quote it separately.</div></div>';
    return '<tr data-line="' + key + '"><td class="qcell-part"><div class="qpart">' + part + "</div></td><td>" + BS.stepper(l.key, l.qty, min, p ? BS.name(p) : l.text) + "</td>" +
      (BS.priceMode() === "list" ? '<td class="r num">' + (u != null ? BS.inr(inc ? BS.withGst(u * l.qty) : u * l.qty) + '<div class="small muted">' + BS.inr(inc ? BS.withGst(u) : u) + " each</div>" : '<span class="muted">Quote</span>') + "</td>" : "") +
      '<td class="r"><button class="textlink small" type="button" data-remove="' + key + '" aria-label="Remove ' + esc(p ? BS.name(p) : l.text) + '">Remove</button></td></tr>';
  }

  function render() {
    var t = BS.list.totals(), box = $("[data-lines]"), sum = $("[data-summary]");
    var focus = doc.activeElement && doc.activeElement.closest && doc.activeElement.closest("[data-line]");
    var fkey = focus ? focus.getAttribute("data-line") : null;
    if (!t.count) {
      box.innerHTML = '<div class="empty">' + icon("clipboard-text") + "<h3>Your quote list is empty</h3><p>Search by part number or size, or paste a whole list into Quick order.</p><p style=\"margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap\"><a class=\"btn\" href=\"shop.html\">Browse parts</a><a class=\"btn btn--quiet\" href=\"quick-order.html\">Quick order</a></p></div>";
      sum.innerHTML = '<h2>What happens next</h2><p class="small muted">Add parts, then request a quotation. We confirm price, availability and freight before you commit to anything.</p>';
      return;
    }
    var list = BS.priceMode() === "list";
    box.innerHTML = '<table class="qtable"><thead><tr><th scope="col">Part</th><th scope="col">Quantity</th>' + (list ? '<th scope="col" class="r">Price' + (BS.gstInc() ? " incl. GST" : " + GST") + "</th>" : "") + '<th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody>' + t.lines.map(rowHTML).join("") + "</tbody></table>";
    var ship = BS.cfg.shipping;
    sum.innerHTML = "<h2>Summary</h2>" +
      '<div class="sumrow"><span>' + BS.plural(t.count, "part") + '</span><span class="num">' + t.units.toLocaleString("en-IN") + " units</span></div>" +
      (t.allPriced ? "<div>" + BS.gstToggleHTML() + '</div><div class="sumrow"><span>Indicative total</span><strong class="num">' + BS.inr(BS.gstInc() ? BS.withGst(t.sub) : t.sub) + "</strong></div><p class=\"small muted\">" + (BS.gstInc() ? "Includes" : "Excludes") + " GST. Freight is not included.</p>" : "") +
      '<p class="small muted">' + esc(t.allPriced ? "Final prices, GST and freight are confirmed in your quotation." : "Price, availability and freight are confirmed in your quotation.") + (ship.note ? " " + esc(ship.note) : "") + "</p>" +
      '<a class="btn btn--block btn--lg" href="checkout.html">Request quotation</a>' +
      '<div class="qactions"><button class="btn btn--sm btn--quiet" type="button" data-csv>' + icon("download-simple") + ' Download CSV</button><button class="btn btn--sm btn--quiet" type="button" data-copy>' + icon("copy") + ' Copy</button><button class="btn btn--sm btn--quiet" type="button" data-print>' + icon("printer") + ' Print</button><button class="btn btn--sm btn--quiet" type="button" data-clear>' + icon("trash") + " Clear</button></div>";
    if (fkey) { var r = $('[data-line="' + (window.CSS && CSS.escape ? CSS.escape(fkey) : fkey) + '"] input'); if (r) r.focus(); }
  }

  doc.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement; if (!t || !t.closest) return;
    if (t.closest("#list-drawer")) return;
    var step = t.closest("[data-step]");
    if (step) { var st = step.closest("[data-stepper]"), inp = $("input", st); BS.list.set(st.getAttribute("data-stepper"), (parseInt(inp.value, 10) || 1) + parseInt(step.getAttribute("data-step"), 10)); return; }
    var rm = t.closest("[data-remove]");
    if (rm) {
      var key = rm.getAttribute("data-remove"), pos = BS.list.lines().findIndex(function (l) { return l.key === key; }), raw = BS.store.list("quote").filter(function (x) { return x.key === key; })[0];
      BS.list.remove(key);
      BS.toast("Removed from your quote list", { action: { label: "Undo", fn: function () { BS.list.restore(raw, pos); } } });
      return;
    }
    if (t.closest("[data-csv]")) BS.downloadCSV("bearingsetu-quote-list.csv", BS.listRows(BS.list.lines()));
    else if (t.closest("[data-copy]")) BS.copyText(BS.listText(BS.list.lines()));
    else if (t.closest("[data-print]")) window.print();
    else if (t.closest("[data-clear]")) { var all = BS.store.list("quote"); BS.list.clear(); BS.toast("Quote list cleared", { action: { label: "Undo", fn: function () { BS.store.set("quote", all); BS.emit("list", { type: "add" }); } } }); }
  });
  doc.addEventListener("change", function (e) {
    var st = e.target.closest && e.target.closest(".qtable [data-stepper]");
    if (st) BS.list.set(st.getAttribute("data-stepper"), e.target.value);
  });
  $("[data-add-custom]").addEventListener("submit", function (e) {
    e.preventDefault();
    var i = $("#c-text");
    if (!i.value.trim()) { i.setAttribute("aria-invalid", "true"); i.focus(); return; }
    i.removeAttribute("aria-invalid");
    BS.list.addCustom(i.value, $("#c-qty").value); i.value = ""; $("#c-qty").value = 1; i.focus();
  });
  BS.on("list", render); BS.on("prefs", render); BS.on("overlay", render);
  render();
})();
