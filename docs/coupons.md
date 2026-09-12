# Coupon codes and discounts

How offers work on lumelive.co.in — what exists, how to run a new one,
and why the price is safe.

---

## The short version

- A coupon is a **code**. The client types it; the server decides what it's worth.
- `/api/coupons/validate` exists so the checkout screen can *show* a discount.
- `/api/cashfree/create-order` recalculates that discount from scratch before
  charging anything, so editing prices in devtools changes the display and
  nothing else.
- A code is only counted as used once Cashfree confirms the money arrived.

---

## Live offers

**One offer is advertised: `FIRST50`.** `CLARITY100` and `LUMEDEMO` ship
parked and are issued to named accounts from Firestore — see below. Every
other SKU sells at list price.

| Code | Discount | Applies to | Limits | Live | Shown on site |
|---|---|---|---|---|---|
| `FIRST50` | 50% | 1:1 Counselling Session (₹499 → ₹249) | **1 per customer, first session only** | **yes** | yes |
| `CLARITY100` | 100% | Full Clarity Report (₹999 → **₹1**) | **1 use ever, locked to one account** | issued in Firestore | **no** |
| `LUMEDEMO` | 100% | **every SKU** (all → **₹1**) | **unlimited, locked to one account** | issued in Firestore | **no** |
| `MIND50` | 50% | 1:1 Counselling Session | 200 uses | no | no |
| `CAREER30` | 30% | Full Clarity Report, Career Roadmap | — | no | no |
| `PARENT200` | ₹200 flat | Full Clarity Report, Stream Clarity Session | — | no | no |
| `REFER200` | ₹200 flat | Full Clarity Report | — | no | no |
| `INTERN500` | ₹500 flat | All three internship tracks | 50 uses | no | no |

### `CLARITY100` — the free Full Clarity Report

A single invitation code, meant to be given to one named person.

**It charges ₹1, not ₹0.** Cashfree will not create a zero-value order, so
`discountFor()` caps every discount at `base - MIN_CHARGE`. The client sees
₹999 struck through and ₹1 payable. Setting `discount_value` higher than 100
changes nothing — the cap decides.

**It is deliberately not promoted.** `promote: false` keeps it out of
`/api/coupons/active`, which is what draws the offer badges. A one-use
100%-off code on a public badge is claimed by the first stranger who reads
it, not by the person it was meant for. Don't set that flag true; a test
asserts it stays false.

**It burns on payment, not on typing.** `recordRedemption` runs from
order-status once Cashfree confirms PAID, so the code stays claimable until
someone actually completes checkout. Two people checking out in the same
few seconds could in principle both get it — the exposure is one extra
report, and the alternative (burning it at validate time) lets anyone
destroy the offer by typing the code.

**Anyone can type it on the report checkout.** The ₹999 report checkout
carries `data-always-show`, so its "Have a coupon code?" box is on screen for
every visitor — an invitation code is never promoted, so without that flag
there would be nowhere to type one. The trade-off is deliberate: anybody who
learns the code can try it, and the one-use limit is what bounds that.

**Or send the recipient a link**, which pre-fills the code for them:

```
https://lumelive.co.in/assessment.html?coupon=CLARITY100#self-assessments
```

It reveals and pre-fills the field with "CLARITY100 ready"; the client taps
**Apply**, the price row redraws to ₹1, and Pay carries the code to
create-order, which re-derives the discount itself.

On checkouts *without* `data-always-show`, the coupon field stays hidden
unless one of these is true (see `mountDeclarative` in `lume-coupons.js`):

1. `/api/coupons/active` lists that SKU — **promoted** offers only;
2. a code is stashed in `sessionStorage` from a tapped offer badge;
3. `?coupon=` is in the URL.

An unpromoted code satisfies none of the first two, which is why a new
invitation code needs either the link or the flag. CLARITY100 shipped with
neither and was briefly unusable.

**It is locked to one account, and issued from Firestore — not from here.**

The recipient's email address is personal data and this repository is public,
so it is never committed. The code ships parked in `DEFAULT_COUPONS`
(`is_active: false`, empty `restricted_to_emails`) and is issued onto its
`coupons/CLARITY100` document, which `loadCoupon` layers over the built-in
definition:

```
npm run coupons:issue -- --code CLARITY100 --email their-account@example.com
npm run coupons:issue -- --code CLARITY100 --email x@y.com --dry-run
npm run coupons:issue -- --code CLARITY100 --revoke
```

That prints the **effective** configuration — defaults and document combined —
so you can see what checkout will actually do, rather than what you hoped you
wrote.

The parked default is the fail-safe. With no document, or with Firestore
unreachable, the code reads back inactive: off for everybody, rather than a
live 100%-off discount for whoever types the string first. `issueCoupon()`
enforces the same rule from the other side — it refuses to issue without a
recipient, and refuses to *report success* if the read-back comes back active
with an empty list (which is what a misspelled field name in the Firebase
console would produce).

Matching is against the email inside the **verified Firebase ID token**, so it
cannot be claimed by typing the address into a form, only by being signed in
as that account. That is what lets the code be live while the report's coupon
box is on screen for every visitor: anyone may type `CLARITY100`, and everyone
but the named account is refused with `not_invited`.

**Re-seeding will not take it back.** `npm run coupons:seed` writes the
catalogue over Firestore, and the parked default would otherwise revoke a code
somebody had already been given. `seedCoupons` preserves an existing
non-empty `restricted_to_emails` and its `is_active`, the same way it carries
`times_used` forward. A test covers it.

**The address has to be the one they sign in with.** The comparison is exact
after lower-casing; it does not know about Gmail's dots-and-plus aliasing, so
`a.b@gmail.com` and `ab@gmail.com` are two different people here. If the
recipient signs up with a variant, the code refuses them — confirm the address
on the account, not the one you were given verbally.

To re-issue it to somebody else, run `coupons:issue` with the new address and
clear the counter (below).

**One use, ever.** `usage_limit: 1` is a lifetime cap across everybody, not
per month or per campaign, and `per_customer_limit: 1` means the recipient
cannot take a second one either. Once redeemed it is spent.

To hand it to someone else afterwards, reset the counter: delete
`coupons/CLARITY100` in Firestore (or set `times_used: 0`) and re-seed.

### `LUMEDEMO` — the demonstration account

The code the demo account pays with, so the whole route — assessment, payment,
report, session booking — can be walked in front of a school or a corporate
client without the demo costing a fee each time.

It is the widest code in the catalogue. Everything below is the reason it is
still safe.

**It covers every SKU, including ones added later.** `applicable_packs` is
empty, which `appliesToPack()` reads as "every pack". A SKU added to
`catalog.js` next month is demonstrable the day it ships, with nobody
remembering to edit a list here.

**It is unlimited.** `usage_limit` and `per_customer_limit` are both `null`,
and `first_time_only` is false. Every other code here is a promotion, where a
cap is the whole mechanism; this one is a tool used repeatedly, and a cap on it
would mean a demo failing in front of a client.

**Which makes the recipient list the only limit.** So it ships parked exactly
like `CLARITY100` — `is_active: false`, empty `restricted_to_emails` — and is
issued onto its Firestore document. If that document is missing or Firestore is
unreachable, it falls back to inactive, not to an unlimited 100%-off code for
every SKU belonging to whoever types `LUMEDEMO`. Don't set `is_active` true in
the catalogue, don't put the address there, and don't set `promote`. Tests
assert all three.

**It charges ₹1 per order, not ₹0** — the `MIN_CHARGE` cap, because Cashfree
will not create a zero-value order. For a demo that is the better number
anyway: the client watches a real payment clear a real gateway and a real
entitlement appear, which is the part they are being asked to believe. Budget
₹1 per step of the demo.

To issue it:

```bash
node tools/issue-coupon.mjs --code LUMEDEMO --email demo-account@example.com --dry-run
node tools/issue-coupon.mjs --code LUMEDEMO --email demo-account@example.com
```

**One account only, and the tool enforces it.** `max_recipients: 1` on the
coupon makes `coupons:issue` refuse to put a second address on this code —
whether by `--add` or by passing two `--email` flags — and nothing is written
when it refuses:

```
LUMEDEMO is for one account only, and this would give it to 2: … Nothing was
written. Drop --add to MOVE the code to … instead of adding to the 1 already
on it.
```

Anyone demoing shares the one login. That is deliberate: this is an unlimited
100%-off code on every SKU, and its whole safety rests on the recipient list
being short and known.

**Moving it to a replacement account is still one command** — the cap restrains
widening, not swapping. Re-issue without `--add` and the list is replaced:

```bash
node tools/issue-coupon.mjs --code LUMEDEMO --email new-account@example.com --dry-run
node tools/issue-coupon.mjs --code LUMEDEMO --email new-account@example.com
```

The output names whoever lost the code on its own line, on a `--dry-run` too,
while it is still free to fix. Check the `issued to` and `max accounts` lines
the command prints at the end: that is what checkout will actually see.

The cap is a guard on this tool, not a security boundary — anyone who can write
to Firestore can edit `restricted_to_emails` directly and skip `issueCoupon`
entirely. What it prevents is the operator mistake of quietly widening the code.
It is read from the built-in catalogue rather than the Firestore document, so
the same write it restrains cannot raise it.

`max_recipients` is `null` (no cap) for every other code, which is why
`CLARITY100` can still be issued to more than one address if you ever need to.

Use the address the demo account actually **signs in** with. The comparison is
exact after lower-casing and knows nothing about Gmail's dots-and-plus
aliasing, so `a.b@gmail.com` and `ab@gmail.com` are two different people here.

To switch the demo off — between client meetings, or when a laptop goes
missing:

```bash
node tools/issue-coupon.mjs --code LUMEDEMO --revoke
```

That is one command and takes effect immediately, with no deploy.

**Using it on a checkout that shows no coupon box.** Most checkouts hide the
"Have a coupon code?" field unless the SKU has a promoted offer, and this code
is never promoted — so on most pages there is nowhere to type it. Append
`?coupon=LUMEDEMO` to the page URL: that reveals the field on any declarative
checkout and pre-fills it, leaving one tap on **Apply**. Nothing needed
per-page, and nothing revealed to anyone else, since the code only works for
the one account.

So the demo runs: sign in as the demo account → open the page with
`?coupon=LUMEDEMO` → Apply → pay ₹1 → the report or booking appears like any
other purchase.

**Demo orders do not count as revenue.** Every ₹1 it pays for is marked as a
demonstration at the moment it is created, so the money can be left out of the
books without anyone recognising a coupon code by eye:

| Where | What to look for |
|---|---|
| `entitlements/{order_id}` in Firestore | `source: "demo"` — **the authoritative filter.** `null` is an ordinary sale, `"manual"` is an off-platform transfer |
| The order at Cashfree | the `demo: "1"` order tag |
| The owner's Sheet / webhook | `demo: yes` in the Details cell, and the summary opens with `[DEMO — not revenue]` |

So "what did we actually earn" is `entitlements` where `source` is null, and
adding up `amount` across everything overstates it by ₹1 per demo step.

The chain is worth knowing, because it is the same trick as the coupon code
itself: `is_demo: true` on the coupon → `create-order` stamps `demo: "1"` onto
the order tags from the coupon it actually applied → `fulfillment.js` reads the
tag back off the order Cashfree returns and writes `source: "demo"`. Going
through the order tag is what makes it survive the redirect to the gateway, so
the mark is identical whether the payment was confirmed by the browser poll or
by the webhook.

Two things deliberately *not* done. `create-order` does not compare the code
against the string `"LUMEDEMO"` — "which codes are demo codes" is written once,
on the coupon, or the next demo code added quietly counts as income. And a
missing or unrecognised tag reads as a **real sale**: mistaking a demo for
revenue overstates the books, while mistaking a sale for a demo hides money,
and only one of those is recoverable. Tests cover both directions, including
that `FIRST50` keeps counting as revenue.

The entitlement is otherwise completely ordinary — same collection, same shape,
real access, restore-access finds it on a second device. Only the provenance
differs, exactly like a manual grant.

**Why not a free-access flag on the account instead.** The tempting shortcut is
a check somewhere in the UI — "if the signed-in email is the demo account, skip
payment". That grants access with no order behind it: nothing in the books,
nothing for restore-access to find on a second device, nothing to revoke
without a deploy, and a demo that no longer exercises the payment path it is
supposed to be demonstrating. A coupon keeps the demo on the same rails as a
real purchase, which is the only way the demo proves anything. The same
argument as `docs/manual-entitlements.md`.

The switched-off codes are kept in the catalogue rather than deleted: they
document the shape of each kind of offer, and re-enabling one is a single
`is_active` flag. Being in the file does **not** make them live — a switched-off
code is refused at checkout and the price stays at list.

`npm run coupons:list` prints the current catalogue.

---

## Where a coupon lives

Two places, in this order of authority:

1. **Firestore**, collection `coupons`, one document per code, document id =
   the uppercased code. This is what you edit day to day.
2. **`api/_lib/coupons.js` → `DEFAULT_COUPONS`**, the same data in code. Used
   when Firestore is unreachable or hasn't been seeded.

Firestore fields are layered **over** the built-in definition, field by field —
not swapped in wholesale. That matters because not every `coupons/{CODE}`
document is a complete offer: on a deployment that was never seeded, the first
redemption creates one holding just `{ code, times_used }`. Replacing the
definition with that would leave the code with no `discount_value`, no
`applicable_packs` (which reads as *every* pack) and none of its per-customer
limits — silently turning it into 0% off everything, unrestricted, the moment
somebody used it.

Nothing breaks if Firestore is never configured — the built-ins keep every
offer working, you just can't change them without a deploy.

**Seeding is optional, and the per-customer limits do not depend on it.** On
production Firestore *is* configured (it is what entitlements and the rate
limiter run on), so `loadCoupon` falls back to the built-in definition when a
document is absent while the counters in `couponCustomers` are still written
at payment time. An unseeded deploy enforces one-per-customer correctly.
Seeding buys one thing: editing offers in the Firebase console without a
deploy.

### Fields

| Field | Type | Notes |
|---|---|---|
| `code` | string | Uppercase, unique. Same as the document id. |
| `discount_type` | `'percentage'` \| `'flat'` | Anything else is read as `percentage`. |
| `discount_value` | number | `50` = 50%, or `200` = ₹200 off. |
| `applicable_packs` | string[] | SKU ids. **An empty array means every pack** — name your packs. |
| `is_active` | boolean | Defaults to true. Set false to pause without deleting. |
| `expiration_date` | ISO string / Timestamp / null | Optional. Null = never expires. |
| `usage_limit` | number / null | Optional **global** cap. Null = unlimited. |
| `per_customer_limit` | number / null | Optional cap **per person**. `1` = one use each. |
| `first_time_only` | boolean | Refuse if this person has bought before. |
| `first_time_skus` | string[] | What "bought before" means. Defaults to `applicable_packs`. |
| `times_used` | number | Server-maintained. Do not edit by hand. |
| `min_amount` | number / null | Optional minimum order value. |
| `headline`, `description` | string | Hero banner copy. |
| `promote` | boolean | Show this code in the hero banner. |
| `restricted_to_emails` | string[] | Account emails this code was issued to. **Empty = anyone.** Matched against the verified token's email; fails closed when the caller is unidentified. |
| `max_recipients` | number / null | How many accounts may hold the code at once. Null = no cap. Enforced by `coupons:issue`, not at checkout — a guard against widening a code by mistake, not a security boundary. |
| `is_demo` | boolean | Marks orders paid with this code as demonstrations rather than sales (`source: "demo"`), so they stay out of revenue. Read as `=== true`. |


Pack ids come from `api/_lib/catalog.js`.

### The retired ₹49 session

`intro-session` (₹49) was the site's acquisition offer before FIRST50. It is
gone from `catalog.js`, so no new order can be created at that price, and the
two session plans in `index.html` both point at `wellness-session` (₹499) now.

It is deliberately **still recognised** by `order-status.js`, `payment-return.html`
and the `SKU_FLOW` map in `cashfree-payments.js`: clients who bought one still
hold that entitlement, and those paths have to keep resolving it. Don't "tidy
up" those three references.

---

## Running a new offer

1. Add it to `DEFAULT_COUPONS` in `api/_lib/coupons.js`.
2. `npm run coupons:test` — the maths and the rules are covered there.
3. `npm run coupons:seed` to push it to Firestore (safe to re-run; `times_used`
   is carried forward).
4. To promote it in the hero, set `promote: true` and update the fallback
   attributes on the badge in `index.html` so the offer is right on first paint.

**Pausing an offer:** set `is_active: false` in the Firebase console. The hero
banner removes itself on the next page load and the code stops working at
checkout immediately — no deploy needed.

### Seeding without a local checkout

`POST /api/coupons/seed` does the same job as `npm run coupons:seed`, for when
there is no local repo to run it from. Both call the same `seedCoupons()`, so
they cannot disagree about what a coupon document should contain.

It is **closed by default**. Arm it by setting one variable in Vercel:

```
COUPON_ADMIN_TOKEN   a long random secret, 24+ characters
```

With that unset — the state of every deploy until you set it — the route
answers **404**, identical to any unrouted path, so its existence can't be
found by probing. A token shorter than 24 characters is treated as unset and
logged, because a short token isn't a secret on the one route that can rewrite
prices.

```bash
# see what would change, write nothing
curl -X POST https://lumelive.co.in/api/coupons/seed \
  -H "Authorization: Bearer $COUPON_ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"dry_run":true}'

# do it
curl -X POST https://lumelive.co.in/api/coupons/seed \
  -H "Authorization: Bearer $COUPON_ADMIN_TOKEN"
```

The token goes in a header, never a query string — query strings end up in
access logs, browser history and referer headers. POST only: a GET route that
rewrites the price list is one prefetch or shared link away from firing by
accident. Wrong or missing token is a flat `401` that says nothing about which
part was wrong, compared in constant time, and rate limited to 5 attempts per
IP per hour.

A verification mismatch answers **500** with the offending fields listed, so a
script wrapping this notices without parsing prose.

**Rotate or unset `COUPON_ADMIN_TOKEN` when you're done seeding** — the
endpoint only needs to be armed while you're using it.

---

## Why the price is safe

The browser never sends a price. It sends a `sku` and a `coupon_code`; every
number comes from the server.

```
  browser                       server
  ───────                       ──────
  "FIRST50" + "wellness-session"
        │
        ├──► POST /api/coupons/validate
        │      quote() → ₹499 − ₹250 = ₹249      (display only)
        │
        └──► POST /api/cashfree/create-order
               quote() AGAIN, same code path      ← this one decides the charge
               order_amount = ₹249
               order_tags.coupon_code = "FIRST50"
```

`create-order.js` ignores `body.amount` entirely. If a code expires in the
seconds between validating and paying, the second `quote()` refuses it and the
client is charged full price — the endpoint reports this back as
`coupon_rejected`, the checkout modal stops before the gateway opens, and the
coupon field explains why.

**Redemption counting** happens in `order-status.js`, only for `PAID` orders,
and is idempotent per `order_id` (a `couponRedemptions/{order_id}` document is
the claim). Counting at validate-time would let anyone burn a limited offer by
typing the code; counting at order-creation would burn it on every abandoned
checkout.

---

## "One per customer", and what a first session means

`FIRST50` is `per_customer_limit: 1` **and** `first_time_only: true`. Both are
needed, and they catch different people:

- **`per_customer_limit`** counts redemptions of *this code* by this person,
  from `couponCustomers/{CODE}__{identity}`.
- **`first_time_only`** asks whether they have ever *bought* one of
  `first_time_skus` — read from the `entitlements` records. Someone who paid
  the full ₹499 last month has had their first session even though they never
  touched a coupon, and the limit alone would happily discount their second.

`first_time_skus` for FIRST50 includes the retired `intro-session`, so a client
who took the old ₹49 session doesn't get a "first" session twice.

**A person is their phone *and* their email**, and both are counted
(`identityKeys`). Checking one would be trivial to sidestep — same phone,
different email, discount again. The guest placeholder number `9999999999` is
explicitly not an identity, or every phone-less guest would look like one
person.

**The email is the account's, never the typed one.** `create-order` takes it
off the verified Firebase token and ignores whatever is in the form, and
`fulfillment.js` counts the redemption against the same address (the
`account_email` order tag), falling back to the contact address only for orders
with no account on them. These have to agree: a limit checked against one
address and counted against another is not a limit, and for a code addressed to
named accounts (`restricted_to_emails`) a typed address would mean the
restriction could be satisfied by anyone who knew the recipient's email.

**Where it is enforced:** `create-order.js`, against the account it is about to
charge. `/api/coupons/validate` also applies the rules *when the
browser sends a customer*, which is what lets the checkout correct itself —
the coupon widget re-checks on the phone field (`recheckCustomer()`), so a
returning client sees ₹499 on the booking screen rather than being refused at
the payment step. The validate call is a courtesy; create-order is the gate.

**Both rules fail open.** If Firestore is unreachable the checks return
"allowed" and log, exactly like `rateLimit` and the entitlement writes. A
returning client occasionally slipping through during an outage is a far
smaller cost than telling genuine first-timers their advertised discount is
unavailable. It also means the limits do nothing on a deploy with no
`FIREBASE_*` configured — the built-in catalogue can price a coupon, but only
Firestore can remember who used it.

**Testing:** `tools/firestore-stub.mjs` is an in-memory Firestore, so these
rules are tested for real — seed a redemption or an entitlement, assert the
coupon is refused. `npm run coupons:test`.

---

## Endpoints

### `POST /api/coupons/validate`

```json
{ "code": "FIRST50", "pack_id": "wellness-session" }
```

```json
{
  "valid": true, "reason": "applied",
  "message": "50% off applied — you save ₹250.",
  "sku": "wellness-session", "label": "1:1 Counselling Session",
  "base_amount": 499, "discount_amount": 250, "final_amount": 249,
  "currency": "INR",
  "coupon": { "code": "FIRST50", "discount_type": "percentage", "discount_value": 50 }
}
```

A rejected code returns **200** with `valid: false` and a `reason` of
`not_found` · `inactive` · `expired` · `limit_reached` · `not_applicable` ·
`below_minimum` · `unknown_pack` · `rate_limited` · `network`. Each carries a
`message` written for the client to read as-is.

Rate limited to 30 attempts per IP per 10 minutes — enough for a typo plus the
offer the checkout auto-applies on open, useless for guessing codes.

### `GET /api/coupons/active`

Returns every `promote`-flagged offer that is active, unexpired and not fully
claimed, with the price it produces. Drives the hero banner. Cached 5 minutes
at the edge.

---

## Front-end

`lume-coupons.js` provides both pieces, with no dependencies.

**Hero badge** — any element with the data attributes below is upgraded
automatically. Tapping the code copies it, toasts, and remembers it for the tab
so the checkout field pre-fills.

```html
<div data-lume-coupon-badge="FIRST50"
     data-lume-coupon-eyebrow="First session offer"
     data-lume-coupon-headline="50% off your first counselling session"
     data-lume-coupon-description="…"
     data-lume-coupon-base="499"
     data-lume-coupon-final="249"></div>
```

Add `data-lume-coupon-theme="light"` on a white background.

The attributes are the fallback shown before `/api/coupons/active` answers, so
the banner is never blank or wrong on first paint. If the API says the offer is
gone, the badge removes itself.

**Checkout widget — the declarative path**

Most checkouts need no JavaScript at all. Drop a div in the checkout UI and
load the script:

```html
<div data-lume-coupon-checkout
     data-sku="student-full-report"
     data-amount="999"
     data-label="Lume Live Full Clarity Report"
     data-price-el=".sa-pay-price strong"   <!-- optional: page's own price -->
     data-phone="#saPhone"                  <!-- optional: for per-customer rules -->
     data-suggest="FIRST50"></div>          <!-- optional: auto-apply this code -->
```

It finds the price row, phone field and `[data-lume-coupon-pay-amount]` inside
its own `.modal` by convention; `data-price-el` / `data-detail-el` / `data-phone`
override that where the markup differs.

**The pay call needs no change.** `cashfree-payments.js` asks
`LumeCoupons.stateForSku(sku)` before creating the order, so a page gets a
working coupon field from markup alone. Threading the code through by hand is
exactly why the offer originally reached one checkout out of six.

**A widget stays hidden unless a code could actually apply to its SKU** — from
`offer_skus` on `/api/coupons/active`. A coupon box on a product with no live
offer is an invitation to abandon checkout and go hunting for one that doesn't
exist. It reveals itself anyway if the visitor arrived holding a code.

Current coverage:

| Checkout | SKU | Wired |
|---|---|---|
| Session modal (index) | wellness-session | ✅ programmatic (plan switches) |
| Report gate (index, assessment) | student-full-report | ✅ |
| Lume Lens gate (professionals) | lume-lens-working-profile | ✅ |
| Enrol modal (internships) | 3 tracks | ✅ programmatic (track switches) |
| PDF modal (index, assessment, professionals) | parents-handbook | ✅ |
| Handbook form (for-parents) | parents-handbook | ✅ |
| Roadmap CTA (career-intelligence) | career-intelligence-roadmap | ❌ no checkout step — the button goes straight to the gateway, so there is nowhere to put a field. Needs a checkout screen first. |

**Checkout widget — the programmatic path**

For a checkout whose SKU changes as the client chooses (the session modal, the
internship enrol modal), pass callbacks instead:

```js
var coupon = LumeCoupons.mountCheckout(document.getElementById("sessCoupon"), {
  getPack: function(){ return { sku: plan.sku, amount: plan.amount, label: plan.label }; },
  getSuggestedCode: function(){ return plan.suggestCoupon || ""; },
  getCustomer: function(){ return { phone: phoneInput.value, email: "" }; },
  onChange: renderPriceRow      // null, or { code, base, discount, total, label }
});

coupon.getCode()                 // "FIRST50" — pass this to the pay call
coupon.recheckCustomer()         // phone/email changed — re-verify per-person rules
coupon.reset()                   // client switched to a different pack
coupon.rejectServerSide(message) // create-order refused the code
```

`?coupon=FIRST50` in the URL pre-fills the field, which is how a campaign link
hands a code to the page.

### Auto-applied offers

`getSuggestedCode` is the code the pack is **advertised** at. The site quotes
"first session ₹249" in the hero, the countdown bar and 50-odd landing pages,
so the checkout applies FIRST50 on open rather than making the client find and
type the code they were already promised — otherwise clicking "Book ₹249 Now"
would land on a ₹499 screen.

It goes through exactly the same server validation as a typed code, silently:
no toast, no error state. If the offer has been paused, the price simply stays
₹499 and no promise is made that checkout won't honour. "Remove" is always
available, and re-opening the same pack keeps whatever the client had rather
than re-validating.

**If you retire FIRST50, clear `suggestCoupon` on the session plans in
`index.html` and fix the ₹249 copy** — otherwise the pages keep advertising a
price the checkout no longer reaches.

---

## Offer ideas that fit this catalogue

- **`FIRST50`** — the acquisition offer. A ₹499 session at ₹249 is a low enough
  first step to convert, high enough to signal it's real work. Keep it
  uncapped; it pays for itself in second sessions.
- **Seasonal, dated** — `BOARD199` in Feb–Apr (exam anxiety), `STREAM250` in
  May–Jul (results season). Set `expiration_date` so they retire themselves
  instead of relying on you to remember.
- **Capped scarcity** — anything with `usage_limit` set can be advertised
  honestly as "first 100 students", and the banner disappears on its own when
  the limit is hit.
- **Referral** — `REFER200` already matches the ₹200 credit promised on
  `book-session.html`, so that page's promise and the checkout now agree.
- **Bundles** — a flat code on `career-intelligence-roadmap` for clients who
  already bought the ₹999 report turns the roadmap into an upsell rather than a
  separate decision.

What to avoid: a percentage code with an empty `applicable_packs` list. It will
apply to the ₹11,999 University Credit Track too.
