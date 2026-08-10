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

| Code | Discount | Applies to | Limit | Promoted in hero |
|---|---|---|---|---|
| `FIRST50` | 50% | Emotional Wellness Session (₹499 → ₹249) | unlimited | **yes** |
| `MIND50` | 50% | Wellness + Introductory sessions | 200 uses | no |
| `CAREER30` | 30% | Full Clarity Report, Career Roadmap | unlimited | no |
| `PARENT200` | ₹200 flat | Full Clarity Report, Stream Clarity Session | unlimited | no |
| `REFER200` | ₹200 flat | Full Clarity Report | unlimited | no |
| `INTERN500` | ₹500 flat | All three internship tracks | 50 uses | no |

`npm run coupons:list` prints the current catalogue.

---

## Where a coupon lives

Two places, in this order of authority:

1. **Firestore**, collection `coupons`, one document per code, document id =
   the uppercased code. This is what you edit day to day.
2. **`api/_lib/coupons.js` → `DEFAULT_COUPONS`**, the same data in code. Used
   when Firestore is unreachable or hasn't been seeded.

A Firestore document fully replaces its built-in twin. Nothing breaks if
Firestore is never configured — the built-ins keep every offer working, you
just can't change them without a deploy, and `times_used` has nowhere durable
to live.

### Fields

| Field | Type | Notes |
|---|---|---|
| `code` | string | Uppercase, unique. Same as the document id. |
| `discount_type` | `'percentage'` \| `'flat'` | Anything else is read as `percentage`. |
| `discount_value` | number | `50` = 50%, or `200` = ₹200 off. |
| `applicable_packs` | string[] | SKU ids. **An empty array means every pack** — name your packs. |
| `is_active` | boolean | Defaults to true. Set false to pause without deleting. |
| `expiration_date` | ISO string / Timestamp / null | Optional. Null = never expires. |
| `usage_limit` | number / null | Optional. Null = unlimited. |
| `times_used` | number | Server-maintained. Do not edit by hand. |
| `min_amount` | number / null | Optional minimum order value. |
| `headline`, `description` | string | Hero banner copy. |
| `promote` | boolean | Show this code in the hero banner. |
| `first_time_only` | boolean | Copy flag only — it changes the eyebrow text, nothing else. |

Pack ids come from `api/_lib/catalog.js`.

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

## Endpoints

### `POST /api/coupons/validate`

```json
{ "code": "FIRST50", "pack_id": "wellness-session" }
```

```json
{
  "valid": true, "reason": "applied",
  "message": "50% off applied — you save ₹250.",
  "sku": "wellness-session", "label": "Emotional Wellness Session",
  "base_amount": 499, "discount_amount": 250, "final_amount": 249,
  "currency": "INR",
  "coupon": { "code": "FIRST50", "discount_type": "percentage", "discount_value": 50 }
}
```

A rejected code returns **200** with `valid: false` and a `reason` of
`not_found` · `inactive` · `expired` · `limit_reached` · `not_applicable` ·
`below_minimum` · `unknown_pack` · `rate_limited` · `network`. Each carries a
`message` written for the client to read as-is.

Rate limited to 20 attempts per IP per 10 minutes — enough to fix a typo,
useless for guessing codes.

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
     data-lume-coupon-headline="50% off your first wellness session"
     data-lume-coupon-description="…"
     data-lume-coupon-base="499"
     data-lume-coupon-final="249"></div>
```

Add `data-lume-coupon-theme="light"` on a white background.

The attributes are the fallback shown before `/api/coupons/active` answers, so
the banner is never blank or wrong on first paint. If the API says the offer is
gone, the badge removes itself.

**Checkout widget**

```js
var coupon = LumeCoupons.mountCheckout(document.getElementById("sessCoupon"), {
  getPack: function(){ return { sku: plan.sku, amount: plan.amount, label: plan.label }; },
  onChange: renderPriceRow      // null, or { code, base, discount, total, label }
});

coupon.getCode()                 // "FIRST50" — pass this to the pay call
coupon.reset()                   // client switched to a different pack
coupon.rejectServerSide(message) // create-order refused the code
```

`?coupon=FIRST50` in the URL pre-fills the field, which is how a campaign link
hands a code to the page.

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
