# Bearingsetu server and admin panel

This folder is the "back office" of the Bearingsetu store. The storefront (the pages on GitHub Pages) works by itself as a
catalogue and enquiry site. When you connect this server to it, you also get:

* business **accounts** that you verify,
* **credit** that only you can switch on, customer by customer,
* **quotations**: customers send a list, you reply with prices,
* **orders** with status updates and tracking,
* **prices and stock** that you type in (nothing is ever invented: no price means "Quote only"),
* **emails** to customers and to your team, and an **audit log** of every change.

It has **no dependencies**: you only need [Node.js](https://nodejs.org) version 22 or newer. The admin panel (a web page for
you, not for customers) is served by the same server at `/admin/`.

Technical contract between this server and the storefront: `docs/API.md`.

---

## 1. Run it on your own computer (5 minutes)

```bash
cd bearing-setu-sample-website
node server/cli.mjs init            # creates the (empty) data folder and server/.env with a fresh SECRET
node server/cli.mjs hash-password   # type an admin password; copy the ADMIN_PASSWORD=... line it prints
```

Open `server/.env` in a text editor and set at least:

```
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD=scrypt:...           # the line printed above (or a plain password of 10+ characters)
CORS_ORIGINS=http://localhost:4173  # the address your storefront is opened from (see section 5)
```

Then start it:

```bash
node server/index.mjs
```

Open <http://127.0.0.1:8787/admin/> and log in. If the admin page says it is disabled, `ADMIN_EMAIL` or `ADMIN_PASSWORD` is
missing or the password is shorter than 10 characters.

The first thing to do in the panel: **Settings**. Fill in your business details (and your GST *state code*, the first two digits of your GSTIN).

> **The data folder starts empty on purpose.** There are no demo accounts and no demo prices. For *local development only* you can
> run `node server/cli.mjs demo` to add clearly labelled DEMO accounts and prices. It refuses to run when `NODE_ENV=production`.

## 2. Put it online

Any host that can run Node 22 works (a small VPS, Render, Railway, Fly.io ...). Requirements:

1. Run `node server/index.mjs` from the repository folder (or `npm start` inside `server/`).
2. Set the environment variables from section 3 in the host's settings (or a `server/.env` file on the server).
   Always set `NODE_ENV=production` and a long random `SECRET`.
3. **Use HTTPS.** Logins and tokens travel over the connection. Most hosts give you HTTPS for free; on your own server put nginx or
   Caddy in front. When something sits in front of the server, set `TRUST_PROXY=1` so the rate limits see each visitor's real address.
4. Keep the data folder (`DATA_DIR`) on **storage that survives restarts** (a persistent disk or volume), and back it up (section 7).
   Hosts with throw-away disks will lose your data on every deploy.

`GET /api/health` answers `{"ok":true}` for uptime checks.

## 3. Settings (environment variables)

Set them in `server/.env` (copy `server/.env.example`) or in your host's settings. The `.env` file is private and git-ignored.

| Name | What it does |
|---|---|
| `PORT` | Port to listen on (default `8787`). Hosts usually set it. |
| `HOST` | Address to listen on. Default `127.0.0.1`, or `0.0.0.0` when `NODE_ENV=production`. |
| `NODE_ENV` | Set to `production` online. Then `SECRET` is required and `demo` is refused. |
| `DATA_DIR` | Where data is stored (default `server/data`). |
| `SECRET` | Long random text that signs login tokens (32+ characters in production). Create one: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Changing it logs everybody out. Without it (outside production) a temporary one is used and logins are lost on restart. |
| `CORS_ORIGINS` | Websites allowed to call the API from a browser, comma separated, exact addresses without a path: `https://www.example.com,https://you.github.io`. Include the address of the storefront, and the admin panel's own address if you open it from another site. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The admin login. The admin API and panel stay off until both are set. `ADMIN_PASSWORD` is a password of at least 10 characters, or (better) the hash from `node server/cli.mjs hash-password`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email, see section 6. With no `SMTP_HOST`, emails are saved as files in `DATA_DIR/outbox` and shown as "Not sent" in the Email log. |
| `TRUST_PROXY` | How many proxies sit in front of the server (normally `1` on hosting platforms, `0` when none). Needed for correct per-visitor rate limits. |
| `STOREFRONT_URL` | Public address of the storefront. Optional: used for "Open your account" links in emails. |
| `CATALOG_FILE` | Path to the storefront catalogue (default `../assets/js/catalog.js`, relative to `server/`). The server only **reads** it. If it is missing the server still works with the products you add yourself. |

## 4. Admin login

1. `node server/cli.mjs hash-password` asks for a password (typing is hidden) and prints `ADMIN_PASSWORD=scrypt:...`.
2. Paste that line into `server/.env` (or your host's settings) together with `ADMIN_EMAIL=...`. Restart the server.
3. Open `/admin/` and log in. The session lasts 12 hours and ends when you close the browser tab.

To change the password, do the same again. To log everybody out (for example after a leak), change `SECRET`.

**Admin panel on another address.** The login screen has an "API address" box. Leave it alone when the page comes from this server.
If you open the panel from somewhere else (for example `admin/index.html` hosted on GitHub Pages), type the server address there and add the
page's address to `CORS_ORIGINS`.

## 5. Connect the storefront

In the storefront's `assets/js/config.js` set `apiBase` to your server's public address, without a trailing slash:

```js
apiBase: 'https://api.yourcompany.com'
```

and add the storefront's address to `CORS_ORIGINS` on the server (exact scheme, host and port, for example `https://you.github.io`).
Leave `apiBase` empty and the storefront keeps working on its own, in static mode.

## 6. Email (SMTP)

Customers and your team get emails when someone registers, an account is verified or suspended, credit is approved or changed,
a quote is received or answered, an order is placed or updated, and when a payment is recorded. Staff addresses are set in
**Settings > Emails**.

Fill in the `SMTP_*` lines with the details from your email provider:

| Setting | Typical value |
|---|---|
| `SMTP_HOST` | `smtp.yourprovider.com` |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (secure from the start) |
| `SMTP_SECURE` | `true` only for port 465; otherwise `false` and the server upgrades to TLS by itself when offered |
| `SMTP_USER` / `SMTP_PASS` | your mailbox or API login (use an app password if your provider offers one) |
| `MAIL_FROM` | `orders@yourcompany.com` or `Bearingsetu <orders@yourcompany.com>` (must be an address your provider lets you send from) |

The server never sends your SMTP password over an unencrypted connection (it stops with an error instead). Check **Email log** in
the panel after the first test: it shows each email as Sent, Failed (with the reason) or Not sent (SMTP not set up). Email problems
never stop an order or a registration from being saved.

## 7. Backups

Everything lives in the data folder (`server/data` by default): `accounts.json`, `orders.json`, `quotes.json`,
`commercial.json` (prices and stock), `catalog.json` (products and brands you added), `settings.json`, `notifications.json`,
`audit.json`, `outbox.json`, `counters.json`, and `outbox/` (emails saved as files when SMTP is off).

* **Back up** by copying the whole folder, daily and before updates. The files are written safely (temp file, then rename), so a copy taken
  while the server runs is fine.
  `tar czf bearingsetu-backup-$(date +%F).tar.gz server/data`
* **Restore:** stop the server, put the saved folder back, start the server.
* If a file is damaged the server refuses to start and tells you which one; it never overwrites it. Restore that file from a backup.
* The files contain customer details and password hashes. Keep backups private.

## 8. How credit works, step by step

Credit is **off for every new account** and only you can change it. Customers who are not approved never see anything about
credit: not in the account page, not in the checkout, not in any response from the server.

1. **Register.** A business registers on the website. The account is `pending`, credit is `none`. You get an email (if staff emails are set).
2. **Verify.** In **Accounts**, open the account, check the GSTIN, press **Verify this account**. The customer is emailed and notified.
3. **Approve credit.** In the account's **Credit** box choose *Approved*, enter the limit and payment terms (1 to 180 days) and press
   **Save credit settings**. A box asks you to confirm and says exactly who will be emailed and what changes. Credit can only be approved
   for a verified account, with a limit above 0.
4. **The customer is told.** An email and an in-app notification say what changed, with old and new values ("Credit limit: Rs 0.00 to Rs 5,00,000.00,
   payment terms 0 days to 45 days"). Every later change (limit, terms, suspend, reinstate, withdraw) does the same, and each one is written to the audit log.
5. **The customer orders on credit.** At checkout "credit" is accepted only for an approved credit facility on a verified account, and only while
   the order fits in the available credit (limit minus what is already owed). Each credit order adds to "Owes now".
6. **Cancelling** an order that is still unpaid gives its amount back to the available credit.
7. **Payments.** When money arrives, open the account and use **Record a payment received** (amount, bank reference, optionally the order).
   "Owes now" goes down, the customer is emailed, and the payment is audited. You cannot record more than is owed. Choosing the order marks it paid when fully paid.
8. **Suspend** pauses new credit orders (existing orders and what is owed stay as they are). **Not enabled** (withdraw) switches credit off; any balance still owed stays payable.

Saving the same credit settings again changes nothing and sends nothing.

## 9. Prices, quotes and orders

* **Products & prices**: type a price (excluding GST), quantity prices (`10:254|50:241` means 254 each from 10 pieces, 241 from 50), stock,
  lead time in days and minimum order, then press Save. Products without a price show "Quote only". Tick Hide to remove a product from the store.
  Download the CSV, fill it in with Excel, and import it back (the panel checks the file first and lists problems line by line).
* **Pricing mode** (Settings): *Quote only* never shows prices; customers send lists and you answer in **Quotes**.
  *Show my prices* shows the prices you entered and lets verified customers order directly, but only with a flat shipping fee;
  if you quote freight per order, customers must request a quote.
* **Quotes**: enter a unit price, availability and lead time per line, freight, a valid-until date and an optional note, then send. GST is added
  automatically: **IGST** when the customer's GSTIN state differs from your state code (Settings), otherwise **CGST + SGST**. If your state code is
  empty, IGST is used. The customer accepts the quote in their account and an order is created.
* **Orders**: New > Confirmed > Dispatched > Delivered, or Cancelled while New or Confirmed. Each status change asks for confirmation and emails the customer.

## 10. Safety, in plain words

* Passwords are stored only as salted scrypt hashes; login tokens are signed and expire (customers 7 days, admin 12 hours); a customer token never works on admin pages.
* Wrong email and wrong password give the same message and take the same time. Limits per visitor address: 10 logins / 15 minutes, 5 registrations / hour, 10 quote requests / hour.
* Everything customers type is checked, size-limited (requests over 256 KB are refused), and escaped before it is shown in emails or in the admin panel.
* Only the websites in `CORS_ORIGINS` can call the API from a browser.
* The admin panel only talks to the server and sends strict security headers; the admin token lives in the browser tab (sessionStorage) and disappears when you close it.
* The audit log records who did what and when, with before and after values. Passwords and tokens are never logged or emailed.

## 11. Moving to a database later

The data layer is one small file, `server/lib/store.mjs`. The rest of the code reads with `store.get('accounts')` and changes data only inside
`store.tx(['accounts', ...], draft => { ... })`, which runs one change at a time and either saves everything or nothing. To move to PostgreSQL/SQLite:
keep that interface, map each collection (`accounts`, `quotes`, `orders`, `commercial`, `catalog`, `settings`, `notifications`, `audit`, `outbox`, `counters`)
to a table (or a JSONB column) and implement `tx` as a database transaction. Money is already stored as plain numbers in rupees with two decimals, and every
calculation is done in whole paise.
The JSON files are fine for a small business (hundreds of customers, thousands of orders); they are rewritten on each change, so very large volumes call for a database.

## 12. Tests

```bash
cd server
node --test "test/*.test.mjs"      # or, from the repository folder: node --test server/test/*.test.mjs
```

The tests never open a network port: they call the app directly (`createApp(...).inject(...)`), use a fake mailbox, a scripted fake SMTP server and a tiny
fake browser for the admin panel. (Passing just the folder, `node --test server/test/`, does not work on every Node 22 release, so use the pattern above.)

---

## Decisions (where `docs/API.md` left room, and what this server does)

**Errors and rules**
* Error bodies are `{ error, message }`. Validation errors (`invalid_input`) also carry `field`; some carry details such as `ids`, `available`, `outstanding`. `429` also sets `Retry-After`.
* Request bodies must be `application/json` (otherwise `415`), at most 256 KB (`413`). Unknown JSON fields are ignored.
* Admin API without `ADMIN_EMAIL`/`ADMIN_PASSWORD` (or with a password under 10 characters): `503 admin_disabled`.
* Extra limits besides the specified ones: admin login 10 / 15 minutes, order tracking 60 / hour per visitor address. `X-Forwarded-For` is trusted only when `TRUST_PROXY` is set.

**Credit**
* A customer sees credit details only when `credit.status` is `approved` **and** the account is `verified`. In every other case they get exactly `credit: { status: "none" }`, including while credit is suspended (they are told by email and notification).
* `PUT .../credit`: `approved` needs both `limit` (above 0) and `termsDays` (1 to 180) in the body. `suspended` is only possible after approval (`409 invalid_credit_transition`), so nobody is ever emailed about credit they never had. `none` sets limit and terms back to 0 and keeps the amount still owed. Sending the current values again returns `changed:false` and writes no audit entry or email.
* Payments larger than the amount owed are refused (`409 payment_exceeds_outstanding`) instead of silently clamped. `POST .../credit/payments` accepts an optional `orderNo` to settle a particular credit order. Marking a credit order paid through `PATCH /api/admin/orders/:no` is refused (`409 use_credit_payment`) so the balance cannot be counted twice. Credit orders carry `payment.termsDays` and `payment.paidAmount`; a cancelled one carries `payment.releasedAmount`.
* Credit orders are also audited (`credit.charge`, `credit.release`, `credit.payment`).

**Quotes and orders**
* On `POST /api/quotes`: when `id` matches the catalogue, name, brand and title come from the catalogue (and `pn` becomes optional). An unknown `id` is dropped and the typed `pn` kept (when no catalogue file is available the id is kept). A present-but-invalid token is `401`.
* Responding needs a price (or `available:false`) for **every** line, and at least one priced line; `validUntil` is `YYYY-MM-DD`, valid to the end of that day in Indian time, not in the past. A responded quote past that date shows as `expired` (computed, no timer) and can be re-issued. `declined` also emails the customer; `closed` is internal and silent; an accepted quote is locked.
* GST is charged on goods plus freight. With CGST + SGST both halves are rounded separately and added (`cgst`, `sgst` are returned next to `gstAmount`). IGST is used when the business state code is blank or the buyer's state is unknown (the total tax is the same; only the split differs).
* Direct orders: shipping `mode` is `quoted` or `flat` (`flatFee`, optional `freeOver`). A line is refused if the product has no price, is hidden, is below the minimum order (`below_moq`) or above the stock figure you entered (`insufficient_stock`). Stock is **not** reduced automatically: update it in the panel. The customer's `discountPct` applies, and a special price (`customPrices`) replaces it. Duplicate lines are merged. Verified or not, an account may order by bank transfer; only credit needs verification. The response is `{ order, account }` (201), also for accepting a quote.
* Order PATCH with the status it already has is a harmless no-op. A cancelled order is frozen. For bank-transfer orders `paymentStatus` is `pending` or `paid` (paid emails the customer); refunds are handled by you outside the system.
* `GET /api/track` returns the history without staff notes.

**Prices and catalogue**
* In `quote` pricing mode the public `GET /api/commercial` returns `price: null` and no `tiers` (prices are "never shown"); stock, lead time, moq and `hidden` are still returned.
* `PUT /api/admin/commercial/:id`: omitted fields keep their value, `null` clears it, an entry with nothing left disappears (back to "Quote only"). The product must exist in the static catalogue or be admin-added (`404 unknown_product`).
* CSV: columns `id, pn, brand, title, price, tiers, stock, lead_days, moq, hidden`. Blank means "no value". `merge:true` only touches products and columns present in the file; otherwise the file replaces everything, except that a row with an error never wipes the old value. `dryRun:true` checks without saving. Text cells starting with `=`, `+`, `-` or `@` are prefixed with `'` on export so spreadsheets do not run them.
* `PUT /api/admin/catalog/products/:id` keeps only the documented Product fields (so a stray `price` is dropped) and un-hides the product. `DELETE` removes an admin-added product (and its prices) or hides a built-in one.
* `GET /api/me` also returns the customer's own `customPrices` (agreed special prices).
* Added read-only admin endpoints: `GET /api/admin/catalog/products/:id`; `GET /api/admin/commercial` also returns `products`, `categories`, `brands`; list endpoints accept `limit`, `offset` and return `total`.

**Email and admin panel**
* Emails are queued and sent one at a time in the background, so a slow mail server never slows a web request. The result (sent, failed with reason, skipped) is written to the email log. Emails still queued when the server stops are lost; the log shows nothing for them.
* The panel's Content-Security-Policy is `default-src 'self'` plus `connect-src` for `https:` and localhost, because the login screen lets you point the panel at another API address. `/admin` (no slash) is served too.
* `ADMIN_PASSWORD` may be a hash (`scrypt:...`). Storing a hash instead of a plain password is recommended.

## Known limits

* One administrator account. There is no email verification of customer addresses (verification means *you* checked the business) and no password-reset flow yet.
* Single server process: the JSON files and in-memory rate limits are not shared between several copies of the server.
* Stock is a number you maintain; it is not reduced by orders.
