# Bearingsetu API contract

The storefront (static HTML/JS on GitHub Pages) works on its own in **static mode**. When `apiBase` is set in
`assets/js/config.js`, it also talks to this API: business accounts, admin-approved credit, quotations, orders,
notifications and admin-managed prices and stock.

The server lives in `server/` (Node 22+, **zero npm dependencies**) and the admin panel in `admin/`.
Everything is JSON over HTTPS. Money is INR, numbers (not strings), rounded to 2 decimals. Dates are ISO 8601 UTC.

## Principles

* **Credit is off by default.** A new account has `credit.status = "none"`. Only an administrator can change it.
  No public endpoint or page may reveal that credit exists to an account that is not approved.
* **Nothing is invented.** A product has a price only if an administrator entered one. No price means "quote".
* Every credit change, account status change, price change and order status change is written to the **audit log**
  (who, when, before, after) and, where a customer is affected, creates an **in-app notification** and an **email**.
* Customer data is private: customers only ever see their own records; admin endpoints need the admin token.

## Auth

* Customer token: `Authorization: Bearer <token>` from `POST /api/auth/login` (HMAC-signed, 7 days).
* Admin token: from `POST /api/admin/login` (HMAC-signed with a different audience, 12 hours). Admin credentials come from
  environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD`); the admin API is disabled until they are set.
* Passwords: `crypto.scrypt` with a per-user salt, constant-time compare. Minimum 10 characters.
* Rate limit per IP (in memory): login 10 per 15 min, register 5 per hour, quotes 10 per hour. Return `429`.
* CORS: allow only origins listed in `CORS_ORIGINS` (comma separated). Reflect the origin; `Vary: Origin`.
* Errors: `{ "error": "machine_code", "message": "Human readable" }` with the right HTTP status.

## Environment

`PORT`, `DATA_DIR` (default `server/data`), `SECRET` (token signing, required in production), `CORS_ORIGINS`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`true` = implicit TLS, otherwise STARTTLS if offered),
`SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. With no SMTP settings, emails are written to `DATA_DIR/outbox/*.eml` and logged as `skipped`.

## Public endpoints

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/health` | | `{ ok:true, time }` |
| GET | `/api/config` | | public settings (see Settings) |
| GET | `/api/catalog` | | `{ products:{ upsert:[Product], hide:[id] }, brands:[Brand], updatedAt }` |
| GET | `/api/commercial` | | `{ updatedAt, items:{ [productId]: Commercial } }` |
| POST | `/api/auth/register` | `{ company, gstin, name, email, phone, password, city, state }` | `201 { ok:true }`. Creates account `status:"pending"`, `credit.status:"none"`. Emails the customer an acknowledgement and notifies staff. GSTIN is validated for format only (15 chars, `^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$`). Duplicate email gives `409`. |
| POST | `/api/auth/login` | `{ email, password }` | `{ token, account }` (account as in `/api/me`). Pending accounts can log in (they see status). Suspended get `403`. |
| POST | `/api/quotes` | `{ contact:{ name, company, gstin?, email, phone, pincode?, notes? }, lines:[{ id?, pn, brand?, title?, qty, note? }], kind:"quote"\|"bulk" }` | `201 { ref }`. Works for guests and for logged in customers (token optional, links the quote to the account). Validates 1 to 200 lines, qty 1 to 1,000,000. Emails an acknowledgement to the contact and notifies staff. |
| GET | `/api/track?no=BS-...&email=...` | | the order's `{ no, status, history, tracking }` only if the email matches the account or contact email, otherwise `404`. |

## Customer endpoints (Bearer token)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/me` | `{ account }` |
| PATCH | `/api/me` | edit `name, phone, city, state, shipTo[]` only (never status, credit, discount) |
| GET | `/api/me/notifications` | `{ items:[{ id, at, title, body, read }], unread }` |
| POST | `/api/me/notifications/read` | `{ ids?:[...] }` marks all if omitted |
| GET | `/api/me/quotes` | list, newest first |
| GET | `/api/me/quotes/:ref` | one quote |
| POST | `/api/me/quotes/:ref/accept` | `{ payment:"bank-transfer"\|"credit", shipTo, poNumber? }`; only if quote `status:"responded"`, not expired; creates an Order |
| GET | `/api/me/orders` | list |
| GET | `/api/me/orders/:no` | one order |
| POST | `/api/me/orders` | `{ lines:[{ id, qty }], payment, shipTo, poNumber? }` direct order. Allowed only when `settings.pricing.mode === "list"` and every line has a commercial price. Freight is computed from `settings.shipping`; in `"quoted"` shipping mode this endpoint returns `409 freight_needs_quote` and the customer must use a quote. |
| POST | `/api/me/orders/:no/reorder-lines` | returns `{ lines:[{ id, qty }] }` for the storefront to refill its enquiry list |

Credit rule applied wherever `payment:"credit"` is requested: reject with `403 credit_not_enabled` unless
`account.credit.status === "approved"` and `account.status === "verified"`; reject with `409 credit_limit_exceeded` if
`order.total > credit.limit - credit.used`. On success `credit.used += total`. Cancelling an unpaid credit order releases it.

## Admin endpoints (admin Bearer token)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/admin/login` | `{ email, password }` gives `{ token }` |
| GET | `/api/admin/stats` | counts: pending accounts, new quotes, open orders, credit outstanding |
| GET | `/api/admin/accounts` | `?status=&q=` list (never includes password hashes) |
| GET | `/api/admin/accounts/:id` | account with quotes, orders, audit entries |
| PATCH | `/api/admin/accounts/:id` | `{ status?:"pending"\|"verified"\|"suspended", discountPct?:0-50, customPrices?:{ [productId]: price }, adminNote? }` notifies and emails on status change |
| PUT | `/api/admin/accounts/:id/credit` | `{ status:"none"\|"approved"\|"suspended", limit, termsDays, note? }`. Setting `approved` requires `account.status === "verified"` (`409 account_not_verified`), `limit > 0`, `termsDays` 1 to 180. **Always** writes an audit entry, creates a notification and sends an email to the customer saying what changed (approved, limit changed, terms changed, suspended, withdrawn). |
| POST | `/api/admin/accounts/:id/credit/payments` | `{ amount, ref, note? }` reduces `credit.used` (cannot go below 0), audited |
| GET | `/api/admin/quotes` | `?status=&q=` |
| GET | `/api/admin/quotes/:ref` | |
| PUT | `/api/admin/quotes/:ref` | respond: `{ lines:[{ index, unitPrice, available?:bool, leadDays? }], freight, validUntil, note, status:"responded"\|"declined"\|"closed" }`. On `responded` computes subtotal, GST and total, then notifies and emails the customer. |
| GET | `/api/admin/orders` | `?status=&q=` |
| GET | `/api/admin/orders/:no` | |
| PATCH | `/api/admin/orders/:no` | `{ status?, tracking?:{ carrier, ref }, paymentStatus?, note? }` valid transitions only; notifies and emails the customer on status change |
| GET | `/api/admin/commercial` | all commercial items plus the static catalogue ids (so the UI can list products without prices) |
| PUT | `/api/admin/commercial/:id` | `{ price, tiers, stock, leadDays, moq, hidden? }` audited |
| POST | `/api/admin/commercial/import` | `{ csv }` replaces or merges (`merge:true`), returns `{ updated, errors:[{ line, message }] }` |
| GET | `/api/admin/commercial/export` | CSV text (`text/csv`) |
| PUT | `/api/admin/catalog/products/:id` | upsert a full product (technical fields) | 
| DELETE | `/api/admin/catalog/products/:id` | remove an admin-added product, or hide a built-in one |
| PUT | `/api/admin/catalog/brands/:id` | `{ name, origin }` |
| GET / PUT | `/api/admin/settings` | full settings |
| GET | `/api/admin/outbox` | email log (to, subject, status, error, at) |
| GET | `/api/admin/audit` | `?entity=&limit=` |

## Shapes

```ts
Account = {
  id, company, gstin, name, email, phone, city, state, stateCode,
  status: "pending" | "verified" | "suspended",
  credit: { status: "none" | "approved" | "suspended", limit: number, used: number, available: number, termsDays: number, updatedAt },
  discountPct: number,               // customer specific pricing, 0 by default
  shipTo: [{ label, line1, line2?, city, state, pin }],
  createdAt
}
Commercial = {
  price: number | null,              // ex GST, per unit
  tiers?: [[minQty, price], ...],    // only if the administrator entered them
  stock?: number | null,             // only if verified
  leadDays?: number | null,
  moq?: number | null,
  hidden?: boolean
}
Product = { id, pn, brand, family, cat, sub, title, d?, D?, B?, seal?, clr?, spec?, attrs:[[k,v]], desc, img, eq?, rel?, unit, pack?, hsn, gst }
Quote  = { ref: "Q-2026-00001", at, status: "new"|"responded"|"accepted"|"declined"|"closed"|"expired", kind, accountId?, contact, lines:[{ id?, pn, brand?, title?, qty, note?, unitPrice?, available?, leadDays? }], pricing?:{ subtotal, freight, gstType, gstRate, gstAmount, total, validUntil, note }, orderNo?, history:[{ at, status, note }] }
Order  = { no: "BS-2026-00001", at, accountId, status: "placed"|"confirmed"|"dispatched"|"delivered"|"cancelled", quoteRef?, lines:[...], subtotal, freight, gstType: "IGST"|"CGST+SGST", gstRate, gstAmount, total, payment:{ method, status: "pending"|"paid"|"on-credit" }, shipTo, poNumber?, tracking:{ carrier, ref, dispatchedAt }|null, history:[{ at, status, note }] }
```

Valid order transitions: `placed → confirmed → dispatched → delivered`; `placed|confirmed → cancelled`.

## Settings (public part is returned by `GET /api/config`)

```json
{
  "business": { "name": "", "legalName": "", "gstin": "", "addressLines": [], "city": "", "state": "", "stateCode": "", "pin": "",
                "phone": "", "whatsapp": "", "email": "", "supportEmail": "", "hours": "" },
  "pricing": { "mode": "quote", "gstRate": 18, "showGstToggle": true },
  "shipping": { "mode": "quoted", "flatFee": null, "freeOver": null, "note": "", "leadTimeNote": "" },
  "catalogue": { "showIndicativePerformance": false },
  "email": { "notifyTo": [], "fromName": "" }
}
```

`email.notifyTo` is private (omitted from `GET /api/config`). Blank values mean "not configured": the storefront hides
those lines instead of showing placeholders. `pricing.mode` is `"quote"` (default, prices never shown, enquiry basket)
or `"list"` (administrator entered prices are shown).

## Email

Plain text plus a simple HTML part. Events: registration received, account verified or suspended, credit approved /
changed / suspended / withdrawn, quote received, quote responded, order placed, order status changed, payment recorded.
Staff are notified (to `email.notifyTo`) of new registrations, quotes and orders. All user supplied text is escaped in
HTML parts. Never include passwords or tokens in email.
