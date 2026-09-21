# Referrals

How a student earns credit for sending a friend to the free Career
Snapshot — what ships today, what is deliberately missing, and where the
money can and cannot leak.

---

## The short version

- A student gets a **code** (`AARA7K2P`) and a link (`?ref=AARA7K2P`).
- A friend who arrives on that link and **finishes a quiz** qualifies it.
- The referrer accrues **₹50** of credit, capped at **₹300** per account.
- The credit is a **number in a ledger**. Nothing spends it yet — see
  *Not built yet* below. Nobody is paid cash at any point.

The browser reports; the server decides. `/api/referrals/claim` takes the
code and the event as a *request* to qualify a referral and checks it
against every rule in `api/_lib/referrals.js` before anything is written.

---

## Why credit and not ₹50 cash

The Career Snapshot is free, so a referral to it generates ₹0 of revenue.
Paying cash for one means paying real money for an action that a student
with ten throwaway Gmail addresses can perform ten times in ten minutes.
Credit against our own products inverts that: a fake referral earns a
discount the faker can only use by paying us the rest of the price, and
it pulls the genuine referrer towards the ₹999 report.

Cash payouts also mean KYC and TDS on money sent to people who are mostly
minors. That is a decision to take deliberately, not to back into.

---

## The rules that decide money

All of these live in `api/_lib/referrals.js` and are covered by
`npm run referrals:test`.

| Rule | Where it is enforced |
|---|---|
| A friend counts **once, ever, for one referrer** | document id of `referralAttributions/{referredUid}` |
| **No self-referral** | code's uid vs. the caller's uid |
| **Only allow-listed events qualify** (`snapshot`, `stream`) | `QUALIFYING_EVENTS` — an allow-list, never a pass-through |
| **5 qualified referrals per day** per referrer | `DAILY_QUALIFY_LIMIT`, checked inside the transaction |
| **₹300 lifetime cap** per referrer | `CREDIT_CAP`; the last referral before it is worth the remainder |
| The code must be real | `referralCodes/{CODE}` lookup |

The attribution document is keyed by the **referred** person rather than
by the (code, person) pair. That one choice is what makes a replay, a
double-submit and a second referrer trying to claim the same friend all
the same no-op.

At the cap a referral is still **recorded** (and the friend still spent),
it is just worth ₹0. Otherwise raising the cap later would make every
previously-capped friend claimable again.

---

## Firestore layout

```
referrers/{uid}
  { code, name, created_at, qualified, credit_earned, day, day_count }

referralCodes/{CODE}            index: one keyed read per inbound link
  { uid, created_at }

referralAttributions/{referredUid}
  { code, referrer_uid, event, credit, created_at }
```

To see what one student has earned: `referrers/{uid}`. To see who they
referred: query `referralAttributions` on `referrer_uid`.

---

## Endpoints

Both sit behind one serverless function (`api/referrals/[...route].js`)
for the same reason the coupon routes do — Vercel's Hobby plan deploys
twelve, and the site is now at **eleven**.

### `POST /api/referrals/code` — signed in

Mints the caller's code on first ask, returns it and their totals after
that. Safe to call on every page load. POST, not GET, because the first
call writes.

```
200 { ok:true, code:"AARA7K2P", url:"https://lumelive.co.in/start.html?ref=AARA7K2P", stats:{…} }
401 not signed in     404 programme off     503 Firebase down
```

### `POST /api/referrals/claim` — signed in

```json
{ "ref": "AARA7K2P", "event": "snapshot" }
```

**Every outcome is `200 { ok:true, counted:<bool> }`.** A client that can
tell "already counted" from "you tripped the daily limit" is a client
that can map the anti-abuse rules, and the page says thank you either
way. The reason is logged, never sent.

A thrown error is also a 200 — a broken ledger must never break the quiz
result behind it.

---

## The browser half

`lume-referral.js` is on `start.html`, `index.html`, `assessment.html`,
`stream-selector.html`, `stream-selector-hi.html` and
`career-intelligence.html`.

**Inbound.** `?ref=` is stashed for 30 days, **first touch wins**. A
student who opens two friends' links belongs to the one who actually got
them there; overwriting would reward whoever shared most recently, which
rewards spam. Nothing is shown to them — somebody arriving on a friend's
link should get the quiz, not a banner about another person's reward.

**Outbound.** The student's own code is fetched once per session (only
when signed in) and cached against their uid, so a shared laptop cannot
hand the second student the first one's code.

**Everything fails silently.** Every storage access and every fetch is
wrapped. Private mode, blocked cookies and a full quota all throw on
plain `localStorage`, and one of those on a quiz page must not be a blank
result screen.

## How the code reaches a friend

`lume-story-share.js` appends the referrer's code to the card's URL at
one choke point in `open()`, so the **QR on the story card** and every
generated caption carry it with no change to the three callers. The
displayed short link stays clean — `shortUrl()` already drops the query.

The code is cached, so `decorate()` can answer synchronously inside a
canvas draw; if it has not been fetched yet the sheet re-renders once it
lands rather than blocking the preview on the network.

This is the point of the whole design: **we pay for scans, not for
posts.** There is nothing to verify about an Instagram story, no manual
review queue, and no reward for posting to an audience of nobody.

---

## Operating it

| | |
|---|---|
| Turn it off | `LUME_REFERRALS_ENABLED=0` — both routes 404, links keep resolving |
| Change what a referral is worth | `TIERS` in `api/_lib/referrals.js` (a table, so tiering it is an edit in one place) |
| Change the cap | `CREDIT_CAP` |
| Tests | `npm run referrals:test` |

The kill switch exists because this is the one feature on the site that
gives money away. If something is being abused at 2am the answer should
be one environment variable, not a revert.

---

## Not built yet

Deliberately, and in roughly this order:

1. **Spending the credit.** Minting a flat-discount coupon from
   `credit_earned` through `api/_lib/coupons.js`, with the **7-day hold**
   before credit becomes spendable so a burst can be clawed back. A
   ledger that cannot spend cannot be drained while we watch it.
2. **Phone OTP on the referred account.** The single highest-leverage
   control left — it kills most throwaway-email farming. Nothing today
   checks how old the referred account is.
3. **`refer.html`** — the dashboard: code, link, progress to the next
   reward, who has joined.
4. **The friend's side of the offer** (₹100 off their first paid
   product), which is what makes this two-sided.
5. **WhatsApp share button** in the story sheet. It will out-refer
   Instagram in India for this audience by a wide margin.

`stream-selector.html` has no `lume-auth.js`, so a student cannot be
signed in there and `ready()` returns `""`. Inbound capture still works.
Adding auth to that page is worth doing before step 3.

---

## Compliance note

ASCI requires disclosure when someone is **paid to promote** a brand.
Rewarding a referral that converts is closer to affiliate than to paid
promotion; rewarding the act of posting is not. That is another reason
the reward is attached to the scan and not to the story. Set a minimum
age before anything here pays cash.
