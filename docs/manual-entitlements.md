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

## Many at once — a corporate / bulk deal

A company pays Lume Live **once**, off-platform, for access on behalf of its
staff — e.g. ER Automotives buying the Lume Lens Working Profile
(`lume-lens-working-profile`) for 50 employees. That is one transfer that has
to become 50 separate entitlements, one per named employee. Do **not** turn off
the payment gateway or hand round a 100%-off coupon (a 100%-off code still
charges ₹1 and still makes every employee go through checkout). Grant them.

`tools/grant-entitlements.mjs` reads a CSV of employees and records one manual
entitlement each. It calls `recordManualEntitlement` directly — the same code
path as the endpoint — so, run from a machine that has the `FIREBASE_*`
secrets, there is no HTTP token to arm. It writes **nothing** without
`--commit`.

```bash
# 1. preview (writes nothing) — always first
npm run entitlements:grant -- \
  --file employees.csv \
  --reference ERAUTO-INV-2026-001 \
  --amount 1200          # the negotiated PER-HEAD rate, so the grants sum to the invoice

# 2. apply, once the preview looks right
npm run entitlements:grant -- \
  --file employees.csv --reference ERAUTO-INV-2026-001 --amount 1200 --commit
```

The CSV needs a header row with an `email` column; `phone` and `name` are
optional and column order/case don't matter. A template is at
[`examples/corporate-grants.sample.csv`](examples/corporate-grants.sample.csv).

| Flag | Required | Notes |
|---|---|---|
| `--file` | yes | CSV of recipients. |
| `--reference` | yes | The **one** invoice/transfer reference the whole batch was paid under. |
| `--sku` | no | Pack to grant. Default `lume-lens-working-profile`. |
| `--amount` | no | Rupees **per person**. Defaults to catalogue price; pass the negotiated per-head rate so the grants reconcile to the invoice total. |
| `--commit` | no | Actually write. Without it, preview only. |

**One invoice, many references.** A grant is idempotent on its reference, so the
tool derives each employee's reference from the invoice reference plus a hash of
that employee's email (or phone). Each is therefore unique per person (everyone
gets their own entitlement), stable across runs (re-running the file after
fixing two rows re-grants nobody), and prefixed with the invoice reference (so
the `source:"manual"` rows for this deal sort together when you reconcile). A
row with no usable email or phone, or a duplicated person, is reported and
skipped — the rest still run.

The per-person email caveat above applies to every row: an employee granted by
email can self-restore on any device; one granted by phone only cannot until you
add their sign-in email. After the grant, each employee signs in with that email
and `lumeCashfreeVerifyAccess("lume-lens-working-profile")` unlocks the
assessment — no payment on their end.

Tested by `npm run entitlements:grant:test` (part of `npm test`).

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
`grantedAt` and `amount`.

`source` is what separates the kinds of record, so nothing blurs together in
the books:

| `source` | What it is | Revenue? |
|---|---|---|
| `null` | an ordinary payment through Cashfree | **yes** |
| `"manual"` | money that arrived off-platform, matched by `reference` | **yes** |
| `"demo"` | a ₹1 demonstration order from the demo account — real access, not a sale | no |

So earned income is every row where `source` is not `"demo"`. See
[coupons.md](coupons.md#lumedemo--the-demonstration-account) for how a demo
order gets marked.

---

## Testing

`npm run entitlements:test` — 35 tests against `tools/firestore-stub.mjs`, the
same in-memory Firestore the coupon rules are tested on. They cover
idempotency, the identity rules, the restore path, revocation, and the
endpoint's closed-by-default gate.
