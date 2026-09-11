# The payment webhook

## Why it exists

Before this endpoint, a payment was only ever recorded if the customer's
browser came back from Cashfree and polled `/api/cashfree/order-status`.

That is the one step of a checkout nobody controls. A UPI app that
doesn't hand control back, a tab closed on the receipt screen, a phone
that locks mid-redirect, a flaky connection on the return leg — in every
one of those the money arrives at Cashfree and the site learns nothing:

- no entitlement record, so the customer cannot open what they paid for;
- nothing for `restore-access` to find, because it reads the records
  that same poll writes — so "restore my purchase" fails too;
- no owner notification, so nobody knows there was a sale until the
  customer asks for a refund.

Cashfree retries a webhook until it gets a `2xx`. That makes
`/api/cashfree/webhook` the reliable path to fulfilment, and the browser
poll now only the fast one. Both call the same `fulfilPaidOrder()` in
`api/_lib/fulfil.js`, and every step of it is idempotent per order, so
whichever arrives first does the work and the other is a no-op.

## Setup — two steps

**1. Register the endpoint.** Cashfree Dashboard → Developers →
Webhooks → add:

```
https://lumelive.co.in/api/cashfree/webhook
```

Subscribe it to at least `PAYMENT_SUCCESS_WEBHOOK`. Anything else is
acknowledged and ignored.

**2. Set the signing secret** in Vercel → Project → Settings →
Environment Variables, then redeploy:

```
CASHFREE_WEBHOOK_SECRET=...
```

If Cashfree signs with your client secret rather than a separate one,
this falls back to `CASHFREE_CLIENT_SECRET` and you can skip it.

**Until one of those is set, every delivery is refused** and fulfilment
silently falls back to "only if the browser returns". `/api/cashfree/health`
reports this under `webhook` and now fails (503) when it is missing,
rather than reporting a healthy gateway.

## How a delivery is checked

A request that reaches this endpoint claiming a payment succeeded is,
if believed, free product. So it has to prove itself:

1. **Signature.** Cashfree signs
   `base64(HMAC-SHA256(timestamp + rawBody, secret))`. The raw bytes are
   hashed, not a re-serialised object, and the comparison is
   `timingSafeEqual` so a wrong signature can't be narrowed down a byte
   at a time.
2. **Freshness.** A delivery more than 15 minutes old is refused, so a
   signed body captured off the wire can't be replayed back at us later.
3. **The gateway's own record.** Only the order id is read out of the
   delivery; everything that decides money — the sku, the account, the
   coupon, the confirmed customer details — is read from Cashfree's copy
   of the order, which is where `create-order.js` wrote the tags. The
   webhook body is never the source of a grant.

## What it returns, and why

| Situation | Reply | Reason |
|---|---|---|
| Fulfilled | `200` | Stops the retries |
| Not a payment success event | `200` | Nothing to retry for |
| Order not `PAID` at Cashfree | `200` | Not a grant, and won't become one |
| Bad or stale signature | `401` | Refused, and logged |
| Order lookup failed | `502` | Keep it in the retry queue |
| Entitlement write failed | `500` | The record access depends on — retry it |

The coupon count and the owner notification are best-effort and never
hold up the `200`; only a failed entitlement write asks for a redelivery.

## Tests

`npm run webhook:test` — covers forged, unsigned, tampered and replayed
deliveries, and that a genuine one records a purchase with no browser
involved, exactly once across retries. Runs in CI on every push.
