/* Help page: order tracking (API only) and contact hints. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, esc = BS.esc;
  function paint() {
    var t = $("#track"); if (t) t.hidden = !BS.api.enabled;
    var h = $("[data-contact-hint]");
    if (h && !BS.hasDirectContact()) h.textContent = "Send your part numbers or measurements with the quantity using the quotation request and we will reply.";
  }
  paint(); BS.on("overlay", paint);
  var f = $("[data-track]"); if (!f) return;
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var out = $("[data-track-out]"), no = $("#t-no").value.trim().toUpperCase(), em = $("#t-email").value.trim();
    if (!no || !em) { out.innerHTML = '<p class="error" style="margin-top:12px">Enter the order number and the email used on the order.</p>'; return; }
    out.innerHTML = '<p class="small muted" style="margin-top:12px">Checking…</p>';
    BS.api.get("/api/track?no=" + encodeURIComponent(no) + "&email=" + encodeURIComponent(em), { anon: true }).then(function (r) {
      var o = r.order || r, hist = (o.history || []).map(function (h) { return "<li>" + esc(new Date(h.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })) + ": " + esc(h.status) + "</li>"; }).join("");
      out.innerHTML = '<div class="notice" style="margin-top:14px"><strong>' + esc(o.no || no) + "</strong>: " + esc(o.status) + (o.tracking && o.tracking.ref ? "<br>" + esc(o.tracking.carrier || "Carrier") + " reference " + esc(o.tracking.ref) : "") + (hist ? '<ul class="hist">' + hist + "</ul>" : "") + "</div>";
    }).catch(function (x) { out.innerHTML = '<p class="error" style="margin-top:12px">' + (x.status === 404 ? "We could not find an order with those details." : esc(x.message)) + "</p>"; });
  });
})();
