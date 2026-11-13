/* Business page: config-driven text and (with the API) account registration. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, doc = document;
  var GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

  function paint() {
    var reg = $("#register"); if (reg) reg.hidden = !BS.api.enabled;
    var n = $("[data-ship-note]"); if (n && BS.cfg.shipping.note) n.textContent = BS.cfg.shipping.note;
    var pa = $("[data-price-answer]");
    if (pa && BS.priceMode() === "list") pa.textContent = "Where we have published a price it is shown per unit, excluding GST. Parts without a price are quoted on request, and freight is always confirmed separately unless the shipping settings say otherwise.";
  }
  paint();
  BS.on("overlay", paint);
  var form = $("[data-register]");
  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("[data-reg-err]"), ok = $("[data-reg-ok]"); err.hidden = true; ok.hidden = true;
    var v = { company: $("#r-company").value.trim(), gstin: $("#r-gstin").value.replace(/\s/g, "").toUpperCase(), name: $("#r-name").value.trim(), email: $("#r-email").value.trim(), phone: $("#r-phone").value.trim(), city: $("#r-city").value.trim(), state: $("#r-state").value.trim(), password: $("#r-pass").value };
    var bad = !v.company ? ["r-company", "Enter the company name."] : !GSTIN.test(v.gstin) ? ["r-gstin", "Enter a valid 15 character GSTIN."] : !v.name ? ["r-name", "Enter your name."] : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email) ? ["r-email", "Enter a valid email address."] : !/^\+?\d{10,13}$/.test(v.phone.replace(/[\s\-()]/g, "")) ? ["r-phone", "Enter a phone number with at least 10 digits."] : v.password.length < 10 ? ["r-pass", "Use a password of at least 10 characters."] : null;
    if (bad) { err.hidden = false; err.textContent = bad[1]; $("#" + bad[0]).focus(); return; }
    var btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    BS.api.post("/api/auth/register", v, { anon: true }).then(function () {
      form.reset(); ok.hidden = false; ok.textContent = "Thank you. We have received your registration and will verify the details. We will email " + v.email + " when your account status changes. You can already request quotations.";
    }).catch(function (x) { err.hidden = false; err.textContent = x.code === "email_taken" || x.status === 409 ? "An account with this email already exists. Try signing in." : x.message; }).finally(function () { btn.disabled = false; });
  });
})();
