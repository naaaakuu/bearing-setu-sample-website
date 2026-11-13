/* Quick order: paste or upload a list, match it to the catalogue, review, add to the quote list. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, doc = document;
  var rows = [];
  var EXAMPLE = "6205-2RS1 x 200\nSKF 6306 2Z, 50\nSPA 1250 20\nTC 25x52x7 100\n25x52x15 30\n6205 2rs 10";

  function build(text) {
    rows = BS.parseLines(text).map(function (r) { return { raw: r.raw, part: r.part, qty: r.qty, status: r.status, options: r.options.slice(0, 4), sel: r.status === "missing" ? -1 : 0, include: true, via: r.via }; });
    paint();
  }
  function badge(s) { return s === "found" ? '<span class="badge badge--green">Matched</span>' : s === "check" ? '<span class="badge badge--orange">Please check</span>' : '<span class="badge badge--red">Not in catalogue</span>'; }
  function rowHTML(r, i) {
    var p = r.sel >= 0 ? r.options[r.sel] : null;
    var match = p ? '<div class="qr__match"><strong>' + esc(BS.name(p)) + "</strong><span class=\"muted small\">" + esc(p.title) + (BS.dims(p) && p.title.indexOf(" x ") < 0 ? " · " + esc(BS.dims(p)) : "") + "</span>" + (r.via && r.sel === 0 ? '<div class="small" style="color:var(--amber-ink)">Matched as equivalent to ' + esc(r.via) + "</div>" : "") + "</div>"
      : '<div class="qr__match"><strong>' + esc(r.part) + '</strong><span class="muted small">We will source this as written.</span></div>';
    var alts = r.options.length > 1 ? '<label class="sr-only" for="alt-' + i + '">Alternative match for ' + esc(r.part) + '</label><select class="select" id="alt-' + i + '" data-alt="' + i + '">' + r.options.map(function (o, k) { return '<option value="' + k + '"' + (k === r.sel ? " selected" : "") + ">" + esc(BS.name(o) + (o.title ? " · " + o.title : "")) + "</option>"; }).join("") + '<option value="-1"' + (r.sel === -1 ? " selected" : "") + ">None of these, use as written</option></select>" : "";
    return "<tr><td><span class=\"qr__raw\">" + esc(r.raw) + "</span></td><td>" + badge(r.sel < 0 ? "missing" : r.status) + "</td><td>" + match + alts + '</td><td><label class="sr-only" for="qty-' + i + '">Quantity for ' + esc(r.part) + '</label><input class="input" id="qty-' + i + '" type="number" min="1" max="999999" value="' + r.qty + '" data-qty="' + i + '" inputmode="numeric"></td>' +
      '<td><label class="check"><input type="checkbox" data-inc="' + i + '"' + (r.include ? " checked" : "") + '><span class="small">Include</span></label></td></tr>';
  }
  function paint() {
    var out = $("[data-result]");
    if (!rows.length) { out.hidden = false; out.innerHTML = '<div class="empty"><h3>No lines found</h3><p>Type or paste at least one part number.</p></div>'; return; }
    var found = rows.filter(function (r) { return r.sel >= 0 && r.status === "found"; }).length, miss = rows.filter(function (r) { return r.sel < 0; }).length;
    out.hidden = false;
    out.innerHTML = "<h2>Review " + BS.plural(rows.length, "line") + '</h2><p class="muted small">' + found + " matched" + (miss ? ", " + miss + " not in the catalogue (they stay on the list as written)" : "") + ". Change a match or a quantity if needed.</p>" +
      '<div class="table-wrap" style="margin-top:12px"><table class="qr"><thead><tr><th scope="col">You entered</th><th scope="col">Status</th><th scope="col">Match</th><th scope="col">Quantity</th><th scope="col">Include</th></tr></thead><tbody>' + rows.map(rowHTML).join("") + "</tbody></table></div>" +
      '<div class="qo__bar"><span class="small" data-count></span><span class="qo__acts"><button class="btn btn--quiet" type="button" data-add>Add to quote list</button><button class="btn" type="button" data-rfq>Add and request quotation</button></span></div>';
    count();
  }
  function count() { var n = rows.filter(function (r) { return r.include; }).length, c = $("[data-count]"); if (c) c.textContent = n + " of " + rows.length + " lines selected"; $$("[data-add],[data-rfq]").forEach(function (b) { b.disabled = !n; }); }
  function commit() {
    var added = 0;
    rows.forEach(function (r) {
      if (!r.include) return;
      if (r.sel >= 0) BS.list.add(r.options[r.sel].id, r.qty); else BS.list.addCustom(r.raw.replace(/\s+/g, " "), r.qty);
      added++;
    });
    return added;
  }

  /* ------------------------------------------------------------------ files */
  function parseCSV(text) {
    var out = [], row = [], cell = "", q = false;
    text = text.replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === "," || ch === ";" || ch === "\t") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(function (c) { return c.trim(); })) out.push(row); row = []; }
      else cell += ch;
    }
    row.push(cell); if (row.some(function (c) { return c.trim(); })) out.push(row);
    return out;
  }
  function gridToText(grid) {
    if (!grid.length) return "";
    var head = grid[0].map(function (c) { return String(c).trim().toLowerCase(); });
    var pi = head.findIndex(function (h) { return /part|item|code|product|bearing|designation|number|description/.test(h); });
    var qi = head.findIndex(function (h) { return /^(qty|quantity|nos|pcs|units)/.test(h) || /\bqty\b|quantity/.test(h); });
    var hasHead = pi >= 0 || qi >= 0;
    if (pi < 0) pi = 0; if (qi < 0) qi = grid[0].length > 1 ? 1 : -1;
    return grid.slice(hasHead ? 1 : 0).map(function (r) { var part = String(r[pi] == null ? "" : r[pi]).trim(), qty = qi >= 0 ? String(r[qi] == null ? "" : r[qi]).trim() : ""; return part ? part + (/^\d+$/.test(qty) ? " x " + qty : "") : ""; }).filter(Boolean).join("\n");
  }
  function loadSheetJS() {
    return new Promise(function (res, rej) {
      if (window.XLSX) return res(window.XLSX);
      var s = doc.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = function () { res(window.XLSX); }; s.onerror = function () { rej(new Error("load")); }; doc.head.appendChild(s);
    });
  }
  function onFile(f) {
    if (!f) return;
    $("[data-filename]").textContent = f.name;
    if (f.size > 2e6) { BS.toast("That file is larger than 2 MB. Please split it.", { error: true }); return; }
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      loadSheetJS().then(function (X) { return f.arrayBuffer().then(function (buf) { var wb = X.read(buf, { type: "array" }); var ws = wb.Sheets[wb.SheetNames[0]]; return X.utils.sheet_to_json(ws, { header: 1, raw: false }); }); })
        .then(function (g) { var t = gridToText(g); $("#qo-text").value = t; build(t); })
        .catch(function () { BS.toast("Could not read the Excel file here. Save it as CSV and upload that instead.", { error: true }); });
    } else {
      var rd = new FileReader();
      rd.onload = function () { var t = gridToText(parseCSV(String(rd.result))); $("#qo-text").value = t; build(t); };
      rd.readAsText(f);
    }
  }

  doc.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement; if (!t || !t.closest) return;
    if (t.closest("[data-match]")) { build($("#qo-text").value); var r = $("[data-result]"); if (!r.hidden) r.scrollIntoView({ behavior: BS.reduceMotion ? "auto" : "smooth", block: "start" }); }
    else if (t.closest("[data-example]")) { $("#qo-text").value = EXAMPLE; build(EXAMPLE); }
    else if (t.closest("[data-add]")) { var n = commit(); if (n) { BS.toast(BS.plural(n, "line") + " added to your quote list", { action: { label: "View list", fn: BS.openList } }); } }
    else if (t.closest("[data-rfq]")) { if (commit()) location.href = "checkout.html"; }
    else if (t.closest("[data-template]")) { e.preventDefault(); BS.downloadCSV("bearingsetu-parts-list-template.csv", [["Part", "Qty"], ["6205-2RS1", 200], ["SPA 1250", 20], ["TC 25x52x7", 100]]); }
  });
  doc.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "qo-file") onFile(t.files[0]);
    else if (t.matches && t.matches("[data-alt]")) { var i = +t.getAttribute("data-alt"); rows[i].sel = parseInt(t.value, 10); paint(); var again = $("#alt-" + i); if (again) again.focus(); }
    else if (t.matches && t.matches("[data-qty]")) rows[+t.getAttribute("data-qty")].qty = Math.max(1, parseInt(t.value, 10) || 1);
    else if (t.matches && t.matches("[data-inc]")) { rows[+t.getAttribute("data-inc")].include = t.checked; count(); }
  });
  var q = BS.params().get("q"); if (q) { $("#qo-text").value = q; build(q); }
})();
