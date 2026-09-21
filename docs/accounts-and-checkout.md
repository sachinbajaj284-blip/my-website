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
- **An account is a name, a mobile number and an OTP.** No password, and no
  separate sign-up: a number either has an account behind it or gets one the
  moment the OTP checks out.
- **Email verification is not required to pay**, and no longer asked for at
  all on a new account. The panel and the checks stay for the older
  email-and-password accounts, which still verify an inbox to restore access.

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

There is now one form, on every page: **full name, mobile number, OTP**
(Firebase `signInWithPhoneNumber`, with an invisible reCAPTCHA). The name is
asked on the way in, or straight after the first OTP for someone who arrived
through "Sign in". A returning number skips it entirely.

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
  phone and email; leaving them blank used to be a way to look like a new
  person. Every order now carries the account's verified number — checkout
  fills `customer.phone` from it, and `create-order.js` falls back to it.
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
