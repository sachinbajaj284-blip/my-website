# Accounts at checkout

Every purchase belongs to a Lume Live account. A client cannot reach the
Cashfree payment window without signing in first, on any page, for any SKU.

---

## The short version

- Press Pay while signed out → the payment modal shows an account screen
  instead of creating an order. Nothing is priced and nothing is reserved.
- Create an account or sign in → the checkout **resumes by itself**, in the
  same modal, with the same item and coupon. The client does not start over.
- The order carries the account: `order_tags.account_uid` comes from a
  verified Firebase ID token, never from the page.
- **An account is a name, an email address and a six-digit code.** No
  password, and no separate sign-up: an address either has an account behind
  it or gets one the moment the code checks out.
- **The code proves the inbox**, so accounts made this way are created
  `emailVerified: true` — restore-access works on the first try, and the old
  "check your inbox" panel never appears for them.

---

## Where the rule actually lives

Two layers, and only the second one is a gate.

**`cashfree-payments.js`** asks `window.lumeAccount` who is signed in before
it creates an order. This is the courtesy: it produces a clear screen and a
one-tap route into sign-in, instead of a rejection from the server.

**`api/_lib/account.js`**, called from `create-order.js`, is the enforcement.
It verifies a Firebase ID token with the Admin SDK. A request that skips the
page entirely — curl, a stale tab, a script — is refused here with `401`.

The page layer deliberately **fails open to the server**. If `lume-auth.js`
doesn't load, the checkout still sends the request and lets create-order
answer, rather than blocking locally. A client-side hard dependency would be
a second way to take every payment on the site down, which is exactly how the
August outage worked.

---

## What a deploy now needs

`create-order` cannot verify a sign-in without Firebase Admin credentials:

```
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

These were previously optional — without them, restore-access silently
no-opped and checkout was unaffected. **That is no longer true.** With the
account requirement on and these unset, `create-order` returns `503` and
nobody can pay.

`GET /api/cashfree/health` reports this directly under `account_gate`, and
the endpoint fails (503) rather than reporting a healthy gateway:

```json
"account_gate": {
  "required": true,
  "can_verify": false,
  "message": "Every checkout requires a signed-in account, but Firebase Admin is not configured — so NO ONE CAN PAY. …"
}
```

### The kill switch

```
LUME_REQUIRE_ACCOUNT=0
```

Lifts the requirement entirely — checkout goes back to accepting anonymous
orders. It exists so a credential problem on the Firebase side (expired
service account, project moved) can be answered with one environment
variable instead of leaving the site unable to take money.

It is **on by default**, and any value other than `0`/`false`/`off`/`no`
leaves it on. Switch it back the moment the real problem is fixed.

---

## Signing in, on six different pages

Three pages used to run their own email-and-password modal (`index.html`,
`assessment.html`, `for-working-professionals.html`).
`career-intelligence.html` had Firebase but nothing to sign in with, and
`for-parents.html` and `internships.html` had no account layer at all.

There is now one form, on every page: **full name, email address, 6-digit
code** — the same two fields whichever button was pressed, because Create
account and Sign in lead to the same flow and a form that changes shape
suggests they are different things. The name typed is the name the account
keeps, so a name that went in wrong can be corrected by signing in again.

Firebase has no email OTP — only a passwordless *link*, which has to be opened
in the browser that asked for it and on a phone usually is not. So the code is
ours:

| | |
|---|---|
| `POST /api/auth/send-code` | `{ email }` → issues a code, emails it. Answers identically whether or not the address has an account. |
| `POST /api/auth/verify-code` | `{ email, code, name? }` → `{ token }`, a Firebase **custom token** the browser exchanges for a normal session. |

`api/_lib/emailCodes.js` holds the rules: the code is stored only as a salted
SHA-256, dies after 10 minutes, dies after 5 wrong guesses, and is single-use.
Rate limits are per address and per IP, reusing `api/_lib/rateLimit.js`. The
account is created at *verification*, never at send — so the send endpoint
cannot be used to find out who has an account.

Emails go out through the Apps Script that already sends owner notifications —
see "Sending the sign-in code" in `docs/owner-notifications.md` for the snippet
it needs. Set `LUME_AUTH_CODE_PEPPER` to a long random string in Vercel;
without it the codes still expire, lock out and are single-use, but the stored
hashes are weaker.

**Why not SMS?** It was built that way first, and an OTP to a phone is the
better flow — a number is the field entitlements and coupon limits already key
on, and an SMS beats a Spam folder. Firebase phone auth requires the Blaze
plan, which requires a card. The phone version is in this repo's history if
that changes.

`lume-auth.js` is the one thing the checkout talks to:

```js
window.lumeAccount.ready()      // Promise<user|null>, once auth state is known
window.lumeAccount.current()    // user|null
window.lumeAccount.prompt(mode) // opens the name / number / OTP form
window.lumeAccount.onSignIn(fn) // fires once, when a user appears
window.lumeAccount.token()      // Promise<idToken|"">
```

`lume-auth.js` claims `window.openAuth` when it loads, because every Login and
Create Account button on those three pages already calls that name — claiming
it is what retires their email-and-password forms. Clicking it while signed in
shows who you are and a way to sign out, rather than asking again for the
number you signed in with.

Nothing runs on page load: Firebase is imported the first time an account is
actually needed, which on most pages is never.

`ready()` resolves with whoever is signed in *now*, not with the first answer
it ever got. That distinction is the whole flow — the first answer is
normally "nobody", the client then signs in, and a cached "nobody" would
leave them being asked to create an account they just created.

---

## What this improved for free

- **Coupon limits mean what they say.** `per_customer_limit` is matched on
  phone and email; leaving the email blank used to be a way to look like a new
  person. Every order now carries a verified account email.
- **Restore-access is more reliable.** Orders are stamped with `account_uid`,
  and entitlements record it, so a purchase is tied to an account rather than
  only to contact details that can be typed wrong or changed later. It also
  matches on the token's `phone_number`, which Firebase only sets after an
  SMS code came back — the same standing a clicked email link has, and the
  field older orders (placed before accounts existed) already carry.

---

## Tests

`npm run account:test` covers the server rule — missing header, forged token,
expired sign-in, unverified email, missing credentials (503, not 401), and the
kill switch. It runs with no Firebase, no credentials and no network, because
`requireAccount` takes an injectable verifier.

`npm run checkout:test` covers the page side — that a signed-out client
creates no order, that the token is sent, that signing in resumes the same
checkout, and that a missing `lume-auth.js` does not block the payment path.
