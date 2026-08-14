# Manual entitlements — recording a payment that didn't go through the gateway

Someone pays you directly — a UPI transfer, a bank transfer, cash at a
school event — and now they need the product they paid for. This is how you
record it.

---

## The short version

- A manual grant is **the same record a Cashfree payment writes**, in the same
  `entitlements` collection, differing only by `source: "manual"` and the
  transfer's reference.
- Make one with `POST /api/entitlements/grant`, which is **closed by default**.
- The transfer's **reference is required** — it is both the audit trail and the
  idempotency key, so the same transfer can't grant twice.
- Everything downstream then treats it as a purchase: restore-access finds it,
  `first_time_only` coupon rules count it, order-status verifies it.

---

## Why not just special-case the customer

The shortcut is to hard-code the person somewhere in the UI or the assistant —
*"if the phone number is 97…, skip the payment step."* It looks like one line
and it costs a lot:

- **A phone number is not a secret.** It's shareable, guessable and often
  public. Anyone who learns it gets the product free.
- **There is no payment record.** Nothing reconciles against the bank
  statement, and `refund-policy.html` has nothing to refund against.
- **It can't be revoked** without a code change and a deploy.
- **It re-opens a hole that was deliberately closed.** `restore-access.js`
  stopped trusting typed-in phone numbers and emails precisely so that knowing
  someone's contact details couldn't unlock their paid content.

A grant records the thing that actually happened — money arrived — and lets
every existing rule do its job.

---

## Arming the endpoint

Set in Vercel → Project → Settings → Environment Variables:

```
ENTITLEMENT_ADMIN_TOKEN   a long random secret, 24+ characters
```

With it unset — the state of every deploy until you set it — the route answers
**404**, identical to any unrouted path, so its existence can't be found by
probing. A token shorter than 24 characters is treated as unset and logged.

**Unset or rotate it when you're done.** It only needs to be armed while you're
using it. Same posture as `COUPON_ADMIN_TOKEN` on `/api/coupons/seed`.

The token goes in a header, never a query string — query strings end up in
access logs, browser history and referer headers. POST only, and rate limited
to 5 attempts per IP per hour ahead of the token check, so a guessing loop is
slow even against an armed endpoint.

---

## Making a grant

Always dry-run first:

```bash
curl -X POST https://lumelive.co.in/api/entitlements/grant \
  -H "Authorization: Bearer $ENTITLEMENT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "sku": "student-full-report",
        "name": "Their Name",
        "phone": "9812345678",
        "email": "them@example.com",
        "reference": "UPI-402913887654",
        "note": "Direct transfer, verified against bank statement 14 Aug",
        "dry_run": true
      }'
```

Drop `dry_run` to write it. A new grant answers **201**; a reference that was
already recorded answers **200** with `created: false` and the original grant.

### Fields

| Field | Required | Notes |
|---|---|---|
| `sku` | yes | Must exist in `api/_lib/catalog.js`. |
| `reference` | yes | The bank/UPI reference. Audit trail **and** idempotency key. |
| `email` | see below | The address they **sign in with** — see the warning below. |
| `phone` | see below | 10 digits; `+91`/spaces are normalised off. |
| `name` | no | First name only is ever shown back to the customer. |
| `amount` | no | Defaults to the catalogue price. Set it when what landed differs — a part payment or a negotiated rate — so the record says what was really received. |
| `note` | no | Free text, 500 chars. Why this grant exists. |
| `dry_run` | no | Report what would happen, write nothing. |

At least one of `phone` / `email` is required, so the purchase attaches to a
person. The guest placeholder number `9999999999` is not an identity and is
refused.

### The email matters more than the phone

Restoring access on a new device runs off the **verified email of a signed-in
Firebase account** — `restore-access.js` trusts nothing typed in. So:

- A grant **with the email they sign in with** → they can self-restore anywhere.
- A grant **with only a phone** → recorded correctly, counts for reconciliation
  and for coupon `first_time_only`, but **they cannot self-restore**. The
  endpoint returns a `warnings` entry saying exactly this.

If you only have their phone, the grant is still worth making — just expect to
unlock their device yourself, or collect their email later and re-grant with a
new reference.

---

## What happens after a grant

The grant writes `entitlements/{manual_…}` and the chain runs unchanged:

```
  customer signs in (verified email)
        │
        ├──► POST /api/cashfree/restore-access
        │      findPaidEntitlements(email) → [{ sku, order_id: "manual_…" }]
        │      browser stores the order_id
        │
        └──► lumeCashfreeVerifyAccess(sku)
               GET /api/cashfree/order-status?order_id=manual_…
               resolved from Firestore, NOT from Cashfree   ← the manual branch
               → PAID + matching sku → unlocked
```

That middle step is why `order-status.js` has a manual branch. Cashfree has
never heard of a manual order, so without it the verify step would 404 and then
**delete** the access restore-access had just handed over.

### Order ids are random on purpose

A manual order id is `manual_` + 16 random bytes. It is not derived from the
payment reference, because `/api/cashfree/order-status` is public and takes
nothing but an order id — a readable id like `manual_UPI12345` would be
guessable, and guessing one would unlock paid content for the guesser.

Idempotency instead runs through `manualGrantRefs/{REFERENCE}`, which maps the
normalised reference to the order id it minted.

---

## Revoking one

Set `status` to anything other than `PAID` on the `entitlements/{order_id}`
document in the Firebase console. `findManualEntitlement` stops resolving it,
`findPaidEntitlements` stops returning it, and the next verify call drops the
customer's local entry. No deploy.

This is the part a hard-coded bypass can't do.

---

## Reconciliation

Manual grants are the rows where `source == "manual"`. Each carries the
`reference` you can match against a bank statement line, plus `note`,
`grantedAt` and `amount`. Gateway payments have no `source` field, so the two
never blur together in the books.

---

## Testing

`npm run entitlements:test` — 35 tests against `tools/firestore-stub.mjs`, the
same in-memory Firestore the coupon rules are tested on. They cover
idempotency, the identity rules, the restore path, revocation, and the
endpoint's closed-by-default gate.
