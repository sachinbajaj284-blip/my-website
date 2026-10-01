# Referrals

How a student earns credit for sending a friend to the free Career
Snapshot — what ships today, what is deliberately missing, and where the
money can and cannot leak.

---

## The short version

- A student gets a **code** (`AARA7K2P`) and a link (`?ref=AARA7K2P`).
- A friend who arrives on that link and **finishes a quiz** qualifies it.
- The referrer earns **₹50**, capped at **₹300** per account.
- The friend gets **₹100 off** their first report or session (`FRIEND100`).
- Both accounts need a **verified mobile number** — one number, one account.
- Earnings become withdrawable **7 days** later, from **₹200** up.
- **A human makes every transfer**, from `npm run referrals:payouts`.
  Nothing on the site can move money.

The browser reports; the server decides. `/api/referrals/claim` takes the
code and the event as a *request* to qualify a referral and checks it
against every rule in `api/_lib/referrals.js` before anything is written.

---

## Cash, and what it costs us

This pays ₹50 in cash. That was a deliberate call, made with the
alternative on the table, and it is worth writing down what it buys and
what it costs so the trade is not rediscovered later.

**What it costs.** The Career Snapshot is free, so a referral to it
generates ₹0 of revenue — every ₹50 is real money out with no matching
money in. Store credit would have been self-limiting, because a fake
referral earns a discount the faker can only use by paying us the rest.
Cash has no such floor: a farm that beats the controls below takes money.

**What that means in practice.** Three things carry the weight:

| | |
|---|---|
| `HOLD_MS` (7 days) | Earnings cannot be withdrawn the day they are made. This is the only control that still works after all the others have been beaten — a week is long enough for a human to notice a referrer whose numbers went strange. |
| `MIN_PAYOUT` (₹200) | Each payout is a manual transfer. Four ₹50 referrals per transfer instead of one keeps the queue readable, and a queue nobody reads is a queue nobody checks. |
| `EARNINGS_CAP` (₹300) | The most any one account can ever take. |

**The part code cannot fix.** Most of the people earning here are
school students. Paying an individual a referral benefit in India raises
TDS questions (s.194R covers benefits arising from a referral
arrangement, with a threshold), and paying a minor raises guardian
consent. `refer.html` asks for an age declaration before a payout can be
requested, and that is a speed bump, not compliance — it is unverified
and self-reported. **Get an accountant's view before this runs at any
volume.** ASCI disclosure is a separate question and is covered at the
bottom of this file.

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
| **₹300 lifetime cap** per referrer | `EARNINGS_CAP`; the last referral before it is worth the remainder |
| **7-day hold** before earnings can be withdrawn | `HOLD_MS`, applied per attribution row at payout time |
| **₹200 minimum withdrawal** | `MIN_PAYOUT` |
| **One pending payout at a time** | re-checked inside the transaction, so two requests cannot race |
| The code must be real | `referralCodes/{CODE}` lookup |
| **Referred account has a verified phone** | `requiresPhone()`; the number comes off the ID token, never the body |
| **One phone, one account, one referral** | `referralPhones/{hash}` — first verifier keeps it |
| **A payout needs a verified phone too** | checked in `requestPayout` |

The attribution document is keyed by the **referred** person rather than
by the (code, person) pair. That one choice is what makes a replay, a
double-submit and a second referrer trying to claim the same friend all
the same no-op.

At the cap a referral is still **recorded** (and the friend still spent),
it is just worth ₹0. Otherwise raising the cap later would make every
previously-capped friend claimable again.

---

## The phone gate

Email is free and unlimited, which is why a ₹50 payout against an
email-only account is farmable in an afternoon. A phone number costs
money and a SIM, and **Firebase only puts one on an ID token after an
SMS code has come back from it** — so the claim *is* the verification.
There is no "verified" flag to trust and nothing the client sends can
fake one. `api/_lib/account.js` reads it off the token; the request body
is never consulted.

Two rules, and the second is the one that bites:

1. The referred account must carry a verified number.
2. That number is bound to the **first** account that verifies it, and a
   referral is refused if it already belongs to someone else — or to the
   referrer.

Without rule 2 the gate is decorative: one SIM would qualify ten
accounts, and a referrer's own second account would qualify against
their own phone. That second case is reported as `SELF_REFERRAL` rather
than as a phone problem, because that is what it is — the same human,
twice.

**Numbers are stored as a salted hash, never in the clear.** All we ever
need to answer is "is this the same number as that one", and a Firestore
collection of readable phone numbers is a liability that answers a
question nobody asked. **Set `LUME_PHONE_SALT`** — without it the space
of Indian mobile numbers is small enough to enumerate, and the hash is
barely a hash. The code warns once per process if it is missing.

### Nobody is asked for a number mid-quiz any more

`claimWithPhone()` used to open the phone-verification card when a claim
came back needing a number. That ended when sign-in became an email and
a code: somebody who had just verified themselves one way was
immediately asked to do it again another way, and — since phone auth
needs the Blaze plan — the card could not finish even if they agreed.
A dead end, mid-quiz, right after the result they came for.

It is now exactly `claim()`. A referral that needs a number does not
count yet, and `refer.html` still offers **Verify my number** to anyone
who has gone looking for their reward. That button needs Blaze to work;
until then the verified-number rule below means referrals do not pay
out. If you would rather they paid out without it, the rule to relax is
`requiresPhone()` in `api/_lib/referrals.js`.

A claim blocked on a missing phone is deliberately **not** marked as
claimed locally, unlike every other refusal, because it is the one
refusal that stops being true once the student acts on it.

### If SMS breaks

Firebase phone auth needs the **Blaze plan**, an **authorised domain**
and a **working reCAPTCHA**. If any of those is wrong, every referral
silently stops qualifying. `LUME_REFERRAL_REQUIRE_PHONE=0` keeps the
programme running while you fix it, at the cost of the control it buys.

The pages that can show the SMS panel had their CSP extended for
reCAPTCHA (`script-src www.google.com`, and a `frame-src` — which most
of them did not have at all, so the iframe would have been blocked by
`default-src 'self'`).

---

## Firestore layout

```
referrers/{uid}
  { code, name, created_at, qualified, earned, paid, requested,
    day, day_count, upi, age_declared_at }

referralCodes/{CODE}            index: one keyed read per inbound link
  { uid, created_at }

referralAttributions/{referredUid}
  { code, referrer_uid, event, amount, created_at }

referralPayouts/{uid}_{requestedAt}
  { uid, code, amount, upi, status, requested_at, settled_at, note }

referralPhones/{sha256(salt:last10digits)}
  { uid, created_at }              first account to verify it keeps it
```

`earned` is the lifetime total, `paid` is what has actually been
transferred, `requested` is sitting in an unsettled request.

**What can be withdrawn is computed from the attribution rows, not from
a balance.** The hold means the answer depends on *when* each referral
happened, and one number cannot carry that. Reading the rows also means
deleting a fraudulent attribution takes effect immediately, with no
counter to fix up afterwards.

To see who one student referred: query `referralAttributions` on
`referrer_uid`.

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

### `POST /api/referrals/payout` — signed in

```json
{}                                                    → what can I withdraw?
{ "request": true, "upi": "…", "age_declared": true } → withdraw it
```

The read is folded into the POST so the dashboard makes one call, and so
nothing about a person's earnings is reachable by a URL that could be
prefetched, logged or shared.

Unlike `/claim`, refusals here are **named and explained** — every one of
them is something the student can act on (wrong UPI format, not enough
yet, already pending, age not declared). A fresh summary rides back with
every answer, refusal included, so the page redraws from what is true
rather than from what it hoped happened.

**This endpoint does not move money.** It writes a request.

### `POST /api/referrals/friends` — signed in

The list behind the totals: who joined, what each earned, and whether it
has cleared the hold — the question a student staring at a balance they
cannot withdraw is actually asking.

**It cannot say who hasn't finished.** An attribution row is written when
a referral qualifies and never before, so there is no record of somebody
who opened a link and stopped. The copy on the page does not imply
otherwise.

**A first name, and nothing else.** The friend agreed to take a quiz, not
to appear on someone else's dashboard. No email, no phone, no surname, no
uid. A referrer shown "Aarav" learns nothing they didn't know — they sent
Aarav the link. An email address would be different in kind: a handle for
contacting someone who never offered it.

`firstName()` refuses anything containing `@` or a long digit run, because
people type their email or number into the name field and stripping the
punctuation out of one would leave the local part looking like a name
("aaravgmailcom"). Those show as **A friend**.

Names are read from Firebase Auth per request, not copied onto the
attribution when it is written. One batched lookup per dashboard view
buys two things: a third party's name is never duplicated into a document
belonging to someone else, and a friend who deletes their account stops
appearing without anything having to remember to erase them. If the
lookup fails the list still renders — dates and amounts are the
load-bearing part.

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

### The referral block

Under the share buttons, shown **only once the student turns out to have
a code** — which means signed in, so there is an account to credit.
Somebody who cannot be paid is never shown a reward.

It says three things: what a friend is worth, that it is **credit and
not cash**, and the ceiling. Every number comes from the server's
`stats`; when they are missing the block says less rather than guessing,
because a client-side ₹50 that disagrees with the ledger is a support
ticket. Progress ("2 friends have joined · ₹100 earned") appears only
once there is something to report — "0 friends joined" is a scoreboard
of a failure and reads as one.

Until this shipped the reward was invisible: the code rode along in the
caption and the QR and nothing ever told the student they earned
anything. An incentive nobody knows about cannot motivate.

### Two different WhatsApp buttons, on purpose

The existing **💬 WhatsApp** button in the share grid posts the *story
card* — a 1080x1920 image plus caption, aimed at Status.

The **💬 Invite on WhatsApp** button in the referral block sends a
sentence and a link, no image, aimed at a 1:1 chat or a group. An image
with a caption is a status post in the wrong place.

The invite text (`LumeReferral.inviteMessage`) deliberately **does not
mention the reward**. A friend told "take this so I get ₹50" is being
asked for a favour; one told the quiz is worth two minutes is being given
something. The reward is the referrer's business, and it is shown to
them. There is a test that keeps it that way.

---

## refer.html — the dashboard

`refer.html` is where a student finds their link, their code as a QR,
and what they have earned. Reachable from the share sheet
("See all your referrals →") and from the homepage footer.

**`noindex, follow`.** It is a signed-in dashboard: there is nothing on
it for a crawler, and an indexed page that only says "sign in" is thin
content. That tag is also what keeps it out of `sitemap.xml`, which is
generated from it — so the page adds no sitemap churn.

**Every number on it is the server's.** `/api/referrals/code` is the only
source; nothing is computed from a rule the browser thinks it knows. When
the totals are missing, the reward line and the progress bar say nothing
rather than guessing, because a page that says ₹50 while the ledger says
₹0 is a support ticket, and these are numbers a student will hold us to.
At the ceiling the page stops promising a reward it will not pay.

The signed-out card is the default state in the markup, so a visitor with
no JavaScript sees something correct rather than "Getting your link…"
forever. A signed-in student sees it for a moment before the dashboard
loads — that is the trade, and it is the right way round.

Covered by `npm run refer:test`, which builds its DOM from the page's own
ids, so a renamed element fails there rather than silently in a browser.

---

## The friend's half

The referrer earns ₹50; the friend gets **₹100 off** their first paid
report or counselling session. Without it this was half a programme: the
friend did the thing the ₹50 was paid for and got nothing at all.

They are asked for nothing in return — the mid-quiz SMS prompt is gone
(see the phone gate above), so the only thing that ever reaches them is
this.

It is the existing coupon engine, not a second discount path.
`FRIEND100` is an ordinary catalogue coupon (`api/_lib/coupons.js`) with
one new rule:

| Field | Meaning |
|---|---|
| `requires_referral: true` | Only usable by an account the referral ledger says a friend actually referred |

`checkCustomerRules` answers it with one keyed read of
`referralAttributions/{uid}` — the same document the ₹50 was paid
against, so the discount and the payout cannot disagree about who was
referred.

**It fails closed**, like `restricted_to_emails`: no uid, no attribution,
or an unreadable ledger all mean refused. An unreadable ledger is not
evidence of a referral, and the student can still pay full price.

**The uid comes off the verified token**, never the body — `create-order`
reads it from Firebase the same way it reads the email, and a source-text
guard in `coupons.test.mjs` pins both. A uid from the body would let
anyone claim to have been referred.

### Why not the ₹499 session

`FRIEND100` deliberately does **not** apply to `wellness-session`.
`FIRST50` already takes that from ₹499 to ₹249, and codes do not stack —
offering ₹100 there would give a referred student a *worse* deal than an
unreferred one. There is a test that keeps it off that SKU.

### How the friend finds out

`/api/referrals/claim` returns the offer once the referral has actually
been recorded, and `lume-referral.js` shows a dismissible bar under their
result. Shown once per device: it is information, not a nag, and the code
works whether or not they read it.

Both the bar and the dashboard render **what the server sent**. Switch
`FRIEND100` off and `friendOffer()` returns null, so nothing is promised
anywhere — no ₹100 is written into a page.

### What it costs

₹50 cash + ₹100 discount = **₹150 per converted friend**. On the ₹999
report that nets ₹849. On a ₹999 session, the same. It is thinner than
the ₹50 alone, and it is the half that makes the ask reasonable.

### The programme this replaced

`book-session.html` used to run a separate manual scheme: *"they book
free, you save ₹200 — have them mention your name on WhatsApp"*, with the
friend's first session free. It was fulfilled by hand and promised
different numbers from the tracked programme, so a student could read two
contradictory offers on one site. That section now points at
`refer.html`. `REFER200` stays parked in the catalogue so old orders
carrying the code still resolve.

---

## Paying people

```
npm run referrals:payouts                                  # what is owed
npm run referrals:payouts -- --list paid
npm run referrals:payouts -- --pay <id> --note "UTR 402913"
npm run referrals:payouts -- --reject <id> --note "why"
```

The flow is two-handed on purpose: the CLI prints a UPI ID and an amount,
**you** make the transfer in your banking app, then you come back and
mark it paid. `--pay` refuses without a `--note`, because a transfer with
no reference is one you cannot reconcile later.

**Why there is no payout API.** An automated rail needs a funded balance
behind a key living in the same environment as the website. A bug, or a
farm that beats the controls, then drains a bank account rather than
over-issuing a discount — and transferred money does not come back. The
manual step is the last place a human sees the numbers before they
become irreversible.

**What to look for before paying.** The CLI prints each referrer's
lifetime totals next to the request for exactly this reason:

- friends who all joined within a few minutes of each other
- the same UPI ID under two different referrers
- anyone at the cap within a day of signing up

`--reject` returns the money to the student's payable balance rather than
destroying it, so they can ask again and a rejection you get wrong is
recoverable. **Paying someone you should not have is not.** When in
doubt, reject with a note and ask them.

---

## Operating it

| | |
|---|---|
| Turn it off | `LUME_REFERRALS_ENABLED=0` — both routes 404, links keep resolving |
| Change what a referral is worth | `TIERS` in `api/_lib/referrals.js` (a table, so tiering it is an edit in one place) |
| Change the cap | `EARNINGS_CAP` |
| Change the friend's discount | `FRIEND100` in `api/_lib/coupons.js`, then `npm run coupons:seed` |
| Turn the friend's half off | set `FRIEND100` to `is_active: false` — the pages stop promising it on their own |
| Turn the phone gate off | `LUME_REFERRAL_REQUIRE_PHONE=0` — see above before you do |
| Phone hash salt | `LUME_PHONE_SALT` — **set this**, and never change it afterwards: every existing hash becomes unmatchable |
| Change the hold | `HOLD_MS` — applies to unpaid earnings immediately, including ones already banked |
| Change the withdrawal minimum | `MIN_PAYOUT` |
| Pay people | `npm run referrals:payouts` — see above |
| Change the invite wording | `inviteMessage()` in `lume-referral.js` — shared with `refer.html` when it lands |
| Tests | `npm run referrals:test` (ledger), `npm run referrals:client:test` (browser), `npm run refer:test` (dashboard) |

The kill switch exists because this is the one feature on the site that
gives money away. If something is being abused at 2am the answer should
be one environment variable, not a revert.

---

## What is deliberately still manual

Nothing on the original backlog is outstanding. Two things are manual by
choice rather than by omission, and both are argued for above:

- **Payouts.** A human runs `npm run referrals:payouts`, pays the UPI IDs
  it prints, and marks them paid. There is no payout API because an
  automated rail needs a funded balance behind a key living in the same
  environment as the website, and transferred money does not come back.
- **Everything the phone gate cannot do.** It proves a number was
  verified once. It does not prove the person behind it is not the
  referrer's sibling, and no amount of code will.

### Notes

`stream-selector.html` and its Hindi twin now carry `lume-auth.js`, so
the Stream Selector can both originate and receive referrals. It had to:
the phone panel lives in that module, and without it a friend landing
there could never verify a number and no referral through that quiz
could ever qualify.

`lume-auth.js` imports Firebase the first time an account is actually
needed — the share sheet opening, or a claim asking for a number — not
on page load.

---

## Compliance note

ASCI requires disclosure when someone is **paid to promote** a brand.
Rewarding a referral that converts is closer to affiliate than to paid
promotion; rewarding the act of posting is not. That is one reason the
reward is attached to the scan and not to the story.

This now pays **cash**, which sharpens two things that were theoretical
while it paid credit:

- **TDS.** s.194R covers benefits arising from a referral arrangement,
  with a threshold. Money going to individuals is the accountant's
  question, not this file's.
- **Minors.** Most people earning here are school students. The age
  declaration on `refer.html` is self-reported and unverified — it
  ensures nobody is paid without having been *asked*, and that is all it
  does.

Neither is solved in code, and neither should be discovered at volume.
