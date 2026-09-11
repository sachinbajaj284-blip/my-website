# The Cashfree webhook — fulfilment that doesn't depend on the customer's browser

`POST /api/cashfree/webhook`

---

## The short version

- Cashfree calls this endpoint when a payment succeeds, so a purchase is
  recorded **even if the customer never comes back to the site**.
- It is verified by **HMAC signature** against `CASHFREE_CLIENT_SECRET`. No new
  environment variable is required.
- It does **not** believe the payload. It reads an order id out of it and then
  asks Cashfree's own `/pg/orders/{id}` what the order really is.
- It is **idempotent**, and it answers **503 when it wants a retry** — which is
  how a payment that Firestore was too busy to record still gets recorded.

---

## The problem it solves

Before this endpoint, a payment was only ever learned about one way: the
customer's browser returned to `payment-return.html`, which polled
`/api/cashfree/order-status`, which wrote the entitlement.

That makes fulfilment depend on the customer completing a redirect — the one
part of a checkout nobody controls. When it didn't happen:

- no entitlement row was written, so the assessment gate stayed locked;
- **restore-access found nothing to restore**, because there was no row to find
  — so the documented self-service fix didn't work either;
- the owner never got the payment notification;
- a coupon redemption went uncounted;
- the only remaining fix was a manual grant, done by hand, after the customer
  complained.

The customer who pays on a UPI app and closes the tab, or loses signal on the
way back, is not an edge case. Cashfree knew about every one of those payments.
Nothing was asking it.

---

## What it trusts

This is a public URL that hands out paid product. It believes exactly two
things.

**1. The signature.** Cashfree signs every delivery:

```
signature = base64( HMAC-SHA256( timestamp + raw_body, secret ) )
```

sent as `x-webhook-signature` with `x-webhook-timestamp`. The body is compared
**as received, byte for byte** — which is why `bodyParser` is disabled on this
route. Re-serialising parsed JSON changes the bytes and breaks every signature.
The comparison is constant-time.

**2. Nothing else in the payload.** Even a correctly signed body is read only
for an order id. The amount, the status, the sku and the customer all come from
Cashfree's own order lookup afterwards. A signed delivery claiming
`"sku": "internship-240-hour"` on a ₹199 order grants the ₹199 product, because
the gateway's `order_tags` decide what was bought and the payload does not.
There is a test for exactly that.

### Why there is no timestamp freshness window

A replay achieves nothing here: fulfilment is idempotent and re-derived from the
gateway, so re-delivering an old payment just re-confirms a purchase that
already exists. A freshness window would buy no security and would drop the
legitimate retries Cashfree sends for hours after an outage — the deliveries
this endpoint exists to catch.

---

## The acknowledgement contract

Cashfree retries anything that isn't a 2xx, and this endpoint uses that
deliberately.

| Situation | Answer | Why |
|---|---|---|
| Entitlement written | `200` | Done. |
| Bad or missing signature | `401` | Final. A caller who can't sign shouldn't be invited back. |
| Event we don't act on (e.g. `PAYMENT_FAILED_WEBHOOK`) | `200` | Nothing to do. Refunds are reconciled in the dashboard, not by revoking access from under someone mid-assessment. |
| Order the gateway says isn't `PAID` | `200` | Cashfree's own verdict. |
| `PAID` but no `order_tags.sku` | `200` | A legacy order; logged as a warning. Retrying won't add tags. |
| Gateway unreachable, or a 5xx from it | `503` | Transient. Come back. |
| Gateway 404 for the order | `200` | Final; there is nothing to come back for. |
| **Entitlement write failed** | `503` | The payment is real and the customer's product is locked. This is the case the endpoint exists for. |
| No signing secret configured | `503` | A misconfiguration shouldn't silently eat live payments. |

---

## Setup

Cashfree Dashboard → **Developers → Webhooks → Add endpoint**:

```
https://lumelive.co.in/api/cashfree/webhook
```

Subscribe to the **payment success** event. The dashboard shows a friendly label
("Payment Success") — `PAYMENT_SUCCESS_WEBHOOK` is what appears in the payload's
`type` field, not in the UI. If your dashboard has no event picker and sends
everything, that's fine: unmatched events are acknowledged and ignored.

**Webhook version.** The endpoint is built against `2022-09-01` and is
deliberately tolerant of neighbouring versions: the event match is a substring
(`PAYMENT_SUCCESS`) and the order id is read from either `data.order.order_id`
or `data.order_id`. Being loose costs nothing, because a match only means "go
ask the gateway about this order" — the grant still rests solely on Cashfree's
own `PAID` verdict. Any delivery the endpoint declines to act on is logged with
its `type`, so a version that sends a success under an unrecognised name shows
up in the Vercel logs rather than as a customer who paid and stayed locked out.

No new environment variable is needed — the signing key is
`CASHFREE_CLIENT_SECRET`, already set for `create-order.js`. Set
`CASHFREE_WEBHOOK_SECRET` only if you rotate the webhook key separately from the
API key; when it's set, it wins.

Use Cashfree's **"Test webhook"** button to confirm the endpoint answers `200`
before relying on it. Reading the failures:

- **"The endpoint did not respond properly"** while this is still unmerged — the
  URL is a 404. Test a Vercel preview deployment, or merge first.
- **`401`** — the signature didn't verify. The dashboard is signing with a
  different key than `CASHFREE_CLIENT_SECRET`; set `CASHFREE_WEBHOOK_SECRET` to
  the key shown for that endpoint.
- **`503`** — the endpoint is asking for a retry. The function logs say why.

---

## How it fits with the polling path

Both paths now call the same `_lib/fulfillment.js`:

```
browser returns  →  order-status  ─┐
                                   ├─→  fulfillPaidOrder(order)  →  entitlement
Cashfree webhook →  webhook       ─┘                              →  coupon count
                                                                  →  owner notify
```

Polling is still the fast path — it's what makes the unlock appear while the
customer is watching. The webhook is the one that doesn't depend on them being
there. Whichever arrives first fulfils; the other is a no-op.

That shared module is the point. Two copies of fulfilment is exactly the bug you
don't want: a payment that writes an entitlement down one path and a coupon
count down the other.

---

## Note on `grantedAt`

`recordPaidEntitlement` writes `grantedAt` **once** and preserves it on every
later confirmation. It previously re-stamped it on each call, so it drifted
forward with every poll and recorded "the last time we checked" rather than when
the customer got access. It's the field restore-access hands back and the one
you'd reach for to answer *when did they buy this*, so it has to mean that.

---

## Related

- `docs/manual-entitlements.md` — recording a payment that never touched the gateway.
- `docs/accounts-and-checkout.md` — how access is tied to an account and restored on a new device.
- `docs/owner-notifications.md` — where the payment notification goes.
