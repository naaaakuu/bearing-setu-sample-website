/* Bearingsetu API client (optional). Active only when BS_CONFIG.apiBase is set.
   Provides: BS.api (requests), BS.session (customer sign-in), live settings, prices and catalogue changes.
   If the API is unreachable the storefront keeps working from its static files. */
(function () {
  "use strict";
  var BS = window.BS, store = BS.store;
  var base = String(BS.cfg.apiBase || "").replace(/\/+$/, "");
  var api = (BS.api = { enabled: !!base, base: base });

  function request(method, path, body, opts) {
    opts = opts || {};
    if (!api.enabled) return Promise.reject(Object.assign(new Error("API not configured"), { code: "no_api" }));
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 12000) : null;
    var headers = { Accept: "application/json" };
    var tok = store.get("token", null);
    if (tok && !opts.anon) headers.Authorization = "Bearer " + tok;
    if (body != null) headers["Content-Type"] = "application/json";
    return fetch(base + path, { method: method, headers: headers, body: body != null ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* not json */ }
          if (!r.ok) {
            if (r.status === 401 && tok && !opts.anon) { session.clear(); }
            throw Object.assign(new Error((j && j.message) || "Request failed (" + r.status + ")"), { status: r.status, code: (j && j.error) || "http_" + r.status, data: j });
          }
          return j;
        });
      })
      .catch(function (e) {
        if (e && e.name === "AbortError") throw Object.assign(new Error("The server took too long to answer."), { code: "timeout" });
        if (e instanceof TypeError) throw Object.assign(new Error("Could not reach the server."), { code: "network" });
        throw e;
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }
  api.get = function (p, o) { return request("GET", p, null, o); };
  api.post = function (p, b, o) { return request("POST", p, b == null ? {} : b, o); };
  api.patch = function (p, b, o) { return request("PATCH", p, b, o); };

  /* ------------------------------------------------------------------ session */
  var current = store.get("account", null);
  var session = (BS.session = {
    account: function () { return current; },
    signedIn: function () { return !!(store.get("token", null) && current); },
    set: function (token, account) { store.set("token", token); current = account; store.set("account", account); BS.emit("session", account); },
    clear: function () { store.del("token"); store.del("account"); current = null; BS.emit("session", null); },
    // Refresh from the server so credit and status shown are always the backend's, never a stale copy.
    refresh: function () {
      if (!api.enabled || !store.get("token", null)) return Promise.resolve(null);
      return api.get("/api/me").then(function (r) { current = r.account; store.set("account", current); BS.emit("session", current); return current; }).catch(function () { return current; });
    },
    login: function (email, password) { return api.post("/api/auth/login", { email: email, password: password }, { anon: true }).then(function (r) { session.set(r.token, r.account); return r.account; }); },
    logout: function () { session.clear(); }
  });
  // Only a signed-in account can ever see or use credit. Public pages never mention it.
  BS.account = function () { return api.enabled ? current : null; };

  /* ------------------------------------------------------ live settings and data */
  var CACHE_KEY = "overlay";
  function apply(o) {
    if (!o) return;
    if (o.config) BS.setConfig(o.config);
    if (o.commercial) BS.setCommercial(o.commercial);
    if (o.catalog) BS.applyCatalogOverlay(o.catalog);
  }
  api.ready = Promise.resolve();
  if (api.enabled) {
    var cached = store.get(CACHE_KEY, null);
    if (cached && typeof cached === "object") apply(cached);
    var fresh = {};
    api.ready = Promise.all([
      api.get("/api/config", { anon: true, timeout: 6000 }).then(function (r) { fresh.config = r; }).catch(function () {}),
      api.get("/api/commercial", { anon: true, timeout: 6000 }).then(function (r) { fresh.commercial = r && r.items; }).catch(function () {}),
      api.get("/api/catalog", { anon: true, timeout: 6000 }).then(function (r) { fresh.catalog = r; }).catch(function () {})
    ]).then(function () {
      if (fresh.config || fresh.commercial || fresh.catalog) {
        var merged = Object.assign({}, cached || {}, fresh);
        apply(merged);
        store.set(CACHE_KEY, merged);
        BS.emit("overlay", merged);
      }
      return session.refresh();
    });
  }
})();
