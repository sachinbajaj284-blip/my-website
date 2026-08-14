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

**One offer is advertised: `FIRST50`.** One more is live but unlisted:
`CLARITY100`, below. Every other SKU sells at list price.

| Code | Discount | Applies to | Limits | Live | Shown on site |
|---|---|---|---|---|---|
| `FIRST50` | 50% | 1:1 Counselling Session (₹499 → ₹249) | **1 per customer, first session only** | **yes** | yes |
| `CLARITY100` | 100% | Full Clarity Report (₹999 → **₹1**) | **1 use in total, 1 per customer** | **yes** | **no** |
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

**How the recipient actually uses it.** Send them this link:

```
https://lumelive.co.in/assessment.html?coupon=CLARITY100#self-assessments
```

This matters, because there is no coupon box waiting for them otherwise. The
checkout coupon field is hidden by default and only reveals itself when one
of three things is true (see `mountDeclarative` in `lume-coupons.js`):

1. `/api/coupons/active` lists this SKU — which only happens for **promoted**
   offers, and CLARITY100 is deliberately not one;
2. a code is stashed in `sessionStorage` from a tapped offer badge;
3. **`?coupon=` is in the URL.**

So for an unpromoted code the link is the route. It reveals the field,
pre-fills the code and shows "CLARITY100 ready"; the client taps **Apply**,
the price row redraws to ₹1, and Pay carries the code to create-order, which
re-derives the discount itself.

Anyone who lands on the page without that link sees the plain ₹999 checkout
with no coupon box at all — which is the intent for a one-use code.

To hand it to someone else afterwards, reset the counter: delete
`coupons/CLARITY100` in Firestore (or set `times_used: 0`) and re-seed.

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

**Where it is enforced:** `create-order.js`, against the contact details it is
about to charge. `/api/coupons/validate` also applies the rules *when the
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
