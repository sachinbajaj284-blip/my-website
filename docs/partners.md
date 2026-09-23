# Partners

How a career counsellor becomes a Lume Live partner, how their clients'
reports earn them commission, and how that commission gets paid.
`partner-with-us.html` states the terms; `api/_lib/partners.js` keeps them.

---

## The short version

- A counsellor pays **₹1,999 once** to join, and only after the owner
  approves them following the vetting call.
- A partner's link is `assessment.html?partner=CODE`. A client who buys the
  **₹999 Full Clarity Report** through it earns the partner **₹300**: 30% of
  what the client paid, up to ₹300.
- **A client stays with the first partner** they paid through, for good.
- Commission is **payable 7 days** after the report was bought. The owner
  pays it **monthly by UPI** from `npm run partners`.
- **Nothing on the site moves money.** A human makes every transfer.

---

## Running it

All of this needs `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and
`FIREBASE_PRIVATE_KEY` in your shell, the same as `referrals:payouts`.

**After a vetting call**, approve the Google account they will sign in with:

```
npm run partners -- --approve them@gmail.com --note "call 24 Sep"
```

Then send them `https://lumelive.co.in/partner-dashboard.html`. They sign in,
see the ₹1,999 button and pay. The moment the payment is confirmed they
are a partner, and the dashboard shows their link. The owner notification
for that payment names their new code.

Changed your mind before they paid? `--revoke them@gmail.com`.

**Once a month:**

```
npm run partners                                   # who is owed what, and their UPI ID
npm run partners -- --pay <uid> --note "UTR 402913"
```

Pay each UPI ID in your banking app first, then mark it paid. `--pay`
refuses to run without a `--note`, because a transfer you can't reference
is one you can't reconcile.

`npm run partners -- --list` shows every partner with their clients,
reports, earnings and UPI ID.

**A refunded report**, or a "client" who turns out to be the partner's own
second account: `npm run partners -- --void <order_id> --note "why"`. Only
unpaid commission can be voided.

---

## The rules, and where they live

| Rule | Where |
|---|---|
| The joining fee is refused to anyone not approved (412) | `create-order.js` → `canJoin()` |
| The browser's amount is ignored; ₹1,999 comes from the catalogue | `catalog.js` |
| Paying the joining fee activates the partner, once | `fulfillment.js` → `activate()` |
| Only `student-full-report` earns commission | `COMMISSION_SKUS` |
| 30% of the amount paid, at most ₹300; demo orders earn nothing | `commissionFor()`, `creditReport()` |
| One commission per order, however often fulfilment runs | `partnerEarnings/{orderId}` |
| A client belongs to the first partner they paid through | `partnerClients/{clientUid}` |
| A partner buying on their own link earns nothing | `creditReport()` → `SELF` |
| Payable after 7 days | `HOLD_MS` |
| Paying twice is impossible | `settle()` only touches rows still `owed` |

The link travels like this: `cashfree-payments.js` stashes `?partner=` for
90 days (first link wins) and sends it as `partner_code` with every
checkout. `create-order.js` checks its shape and tags it onto report orders
only. Fulfilment reads it back once Cashfree says PAID and calls
`creditReport()`, which decides.

**Session offers are hidden from partner clients.** Once a partner code is
stashed, `cashfree-payments.js` hides anything marked
`data-lume-session-offer`. On `assessment.html` that covers the FIRST50
countdown bar, the ₹7,500 expert upgrade, the "Book ₹249 Session" button
and the FAQ line about booking a session. Mark any new session offer on
a page partners send clients to.

---

## Switches

| | |
|---|---|
| `LUME_PARTNERS_ENABLED=0` | Stops new commissions and hides `/api/partners/*`. Earnings already recorded can still be paid from the CLI. |

---

## What this does not do yet

- **Tax.** Commission paid to individuals may need TDS once a partner
  crosses the annual threshold (s.194H). Collect PANs and get an
  accountant's view before volume builds.
- **The refund policy** doesn't mention the joining fee yet.
- **Minimum payout** is not enforced. The owner pays whatever has
  matured each month.
