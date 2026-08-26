# Saved assessment results

What happens to an assessment after somebody finishes it — what is kept,
what deliberately isn't, and how a client takes it back.

---

## The short version

- Assessments are **still scored in the browser**, exactly as before. Nothing
  about the item banks, the scoring or the on-screen report changed.
- When the report renders, the page **offers** to save the result. The
  checkbox starts unchecked and nothing is stored unless it is ticked.
- What is stored is **scores, not answers** — six RIASEC totals, eight work
  anchors, four VARK counts, five Big Five traits. Never "item 12: 2".
- A result belongs to the account that saved it. The uid comes from a
  verified Firebase ID token, **never from the request body**.
- `POST /api/assessment/delete` removes every run for an account, for real.
  Consent you can't withdraw isn't consent.

---

## Why this exists

Before this, `assessment.html` wrote progress to `localStorage` under
`lume-live-assessment-progress:{uid}` and that was the only copy. Clear
site data and it is gone. Finish the test on a phone and book the session
from a laptop and it is gone. Come back after the board results and it is
gone.

The counsellor felt it worst: someone would arrive at a ₹249 session having
completed a full psychometric battery the week before, and the counsellor
would open a blank page. The first ten minutes of every session went on
re-establishing what the assessment already knew.

Everything in `docs/ai-agent-spec.md` is also blocked on this. A report the
agent drafts from a profile needs the profile to exist somewhere other than
a browser tab that was closed a month ago.

---

## What is stored

`assessments/{runId}` in Firestore, one document per completed run:

```json
{
  "runId": "m9x4kq-1a2b3c4d5e6f7a8b",
  "uid": "firebase-uid-of-the-account",
  "schemaVersion": 1,
  "instrument": "student-full-v1",
  "consent": true,
  "scores": {
    "riasec":  { "R":3, "I":6, "A":4, "S":5, "E":2, "C":2, "max":7 },
    "anchors": { "MA":28, "IN":19, "AU":21, "ST":14, "EN":11, "SV":36, "CH":31, "WF":17, "max":42 },
    "vark":    { "V":8, "A":3, "R":10, "K":5, "max":16 },
    "bigfive": { "E":22, "A":31, "C":29, "N":18, "O":34, "max":40 }
  },
  "context": { "stage":"Class 12 Science", "age":17, "city":"Rohtak" },
  "createdAt": "2026-08-26T09:12:44.108Z",
  "updatedAt": "2026-08-26T09:12:44.108Z"
}
```

### What is deliberately not stored

**Item-level answers.** Every downstream use — the report, a school cohort
view, a counsellor opening a session — needs the profile. None of them need
the rows. The rows are what makes a breach of this collection actually
harmful, so they never leave the browser. Storing less is the design, not a
shortcut.

**Name, phone, email.** The account already holds them, verified. Copying
them here would mean two places to honour a deletion request from.

**The wellbeing screener.** `lume-wellbeing-check.js` is a separate,
on-demand modal, it is not part of the `saGenerate` flow, and it is the most
sensitive thing this site asks anybody. It gets its own consent conversation
before it gets storage. `INSTRUMENTS` in `api/_lib/assessments.js` has no
entry for it, so it cannot be saved here by accident.

---

## The shape is a whitelist

`validate()` in `api/_lib/assessments.js` **rebuilds** the document key by
key from `INSTRUMENTS` and `CONTEXT_FIELDS`, rather than trusting and
cleaning what arrived. Anything not in those tables is dropped.

Without that, `/api/assessment/save` is a "write arbitrary JSON to our
database, authenticated as any signed-in user" endpoint. That is a very
different and much worse thing than the one we meant to build, and the
difference is about fifteen lines.

Three rules the validator enforces, each with a test:

**Consent must be literally `true`.** Not missing, not `"true"`, not `1`.
A stored document without a recorded consent is the thing we promised not to
create.

**Every score must be a JSON number inside its instrument's range.** Not
`Number(value)` — an unanswered part of the assessment scores as `NaN` in
the browser, `JSON.stringify` turns `NaN` into `null`, and `Number(null)` is
`0`. That path would file "scored zero on every work anchor" as a real
profile. A missing score fails loudly instead.

**A score above the maximum is refused, not clamped.** RIASEC tops out at 7.
An 8 means the page and this file have drifted apart, and silently storing a
7 would hide that until a counsellor noticed a report reading strangely.

---

## Ownership

The uid comes from `requireAccount()` — a verified Firebase ID token — and
the request body's opinion is never consulted. There is a test that posts
`{"uid": "somebody-else"}` and asserts the run still files under the caller.

This is the same rule `create-order.js` follows, for the same reason
`restore-access.js` stopped trusting typed-in phone numbers: knowing
somebody's identifier must not get you their data.

`/api/assessment/latest` takes **no parameters at all**. There is no
request that asks for another person's profile, so there is no request to
get wrong.

### When account checks are off

`LUME_REQUIRE_ACCOUNT=0` exists so a Firebase credential problem can't stop
people paying — checkout can proceed without knowing who somebody is. A
per-person result store cannot: there is no uid to file under. So all three
endpoints answer `503` rather than inventing an owner, and the page tells
the client their report is still on their device.

---

## Endpoints

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/assessment/save` | POST | account | Save a finished run. `201` on success. |
| `/api/assessment/latest` | GET | account | Newest run, or `{found:false}`. |
| `/api/assessment/delete` | POST | account | Delete every run. Needs `{"confirm":true}`. |

`latest` answers `200 {found:false}` for an account with nothing saved —
which is almost everyone — so the page has one success path to read from.
The same choice `coupons/validate` makes about a wrong code.

### Rate limits are keyed per account, not per IP

A school computer lab is one public IP with a class behind it, and a whole
year group finishing an assessment in the same period is precisely the case
this endpoint exists to serve. A tight per-IP budget would refuse student
eleven and break the cohort work in `docs/ai-agent-spec.md` before it
started.

So each endpoint has two checks: a loose per-IP flood guard (300–600 per
10 min), and the real budget keyed on the uid — save 10 / 10 min, delete
10 / 10 min, latest 60 / 10 min. Both fail open, like every other limit on
this site. There is a test that walks 25 students through one IP and
asserts none of them is refused.

---

## The page side

Two lines were added to the minified block in `assessment.html`:

- `window.saScores()` — returns `{scores, context}` built from the page's own
  scoring functions (`H()` RIASEC, `W()` anchors, `N()` VARK, `q()` Big Five)
  reduced from `[{key, score}]` to `{key: score}`.
- `saGenerate` ends by calling `window.lumeAssessmentSave.offer()`.

Everything else lives in `lume-assessment-save.js`, unminified, which
renders the consent card into `#saReport` after the report.

**The card never blocks the report.** Every failure path — offline, signed
out, server down, endpoint not deployed — ends with the report on screen and
the result still in `localStorage`. Saving is a bonus, not a step. If
`window.saScores` is missing, or any score is non-finite, no card is offered
at all rather than one that is guaranteed to fail.

---

## Deleting

`POST /api/assessment/delete` with `{"confirm": true}` removes every run for
the calling account and returns how many went.

It deletes rather than flagging. A soft delete leaves the scores in the
collection, which is exactly what the person asking has asked us not to do.

The confirmation flag is there so a mis-routed request can't wipe a profile
by arriving at the wrong URL.

`privacy-policy.html` points at this. The delete link also appears on the
consent card itself once a result has been saved, because the moment
somebody is most likely to change their mind is right after agreeing.

---

## What a deploy needs

Nothing new. This uses the Firebase Admin credentials that
`api/_lib/account.js` and the entitlement system already require:

```
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

With them unset, the endpoints answer `503` and the assessment page carries
on exactly as it did before this was built.

### Firestore rules

The `assessments` collection is written and read **only** through the Admin
SDK in `/api/*`. No browser touches it directly. Make sure your security
rules deny client access to it, the same as `entitlements`:

```
match /assessments/{runId} {
  allow read, write: if false;
}
```

---

## Tests

`npm run assessment:test` — 28 assertions against `tools/firestore-stub.mjs`,
now including a fake `auth().verifyIdToken` so the ownership rules run for
real rather than being asserted about.

The four worth knowing:

- A body-supplied `uid` cannot file a result under another account.
- One account reading another's result gets `found:false`.
- A `null` score is refused, so a blank assessment can't store as all-zeros.
- Deleting one account's runs leaves every other account's intact.
- Twenty-five students saving from a single IP are all accepted.
