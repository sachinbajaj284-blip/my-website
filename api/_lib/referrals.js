/*
  Lume Live — the referral ledger.

  A student who sends a friend to the free Career Snapshot earns ₹50,
  paid out in cash over UPI. Three rules shape everything here, and they
  are the reason this is a server-side module rather than a counter in
  localStorage:

  1. A referral is worth something, so the browser never decides that one
     happened. The client reports "I arrived with code X"; this module
     decides whether that is a real code, a real new person, and not the
     referrer themselves.

  2. A given friend counts exactly once, ever, for exactly one referrer.
     That is enforced by the document id in `referralAttributions` —
     keyed by the *referred* uid, not by the pair — so a second claim for
     the same person is a no-op whoever sends it, and re-running a claim
     is safe.

  3. Credit is capped. The worst case for a farm that defeats every other
     control is EARNINGS_CAP rupees of discount on our own products, which
     they can only use by paying us the rest.

  ───────────────────────────────────────────────────────────────────────
  Money leaves this building by hand
  ───────────────────────────────────────────────────────────────────────
  Nothing in this file moves money. It records what is owed, what has
  been asked for and what has been settled; the transfer itself is made
  by a human running tools/referral-payouts.mjs and paying the UPI IDs it
  prints. That is deliberate, and it is not laziness:

  * An automated payout rail needs a funded balance sitting behind an
    API key. A bug, or a farm that beats the other controls, drains a
    real bank account rather than over-issuing a discount.
  * Money that has left cannot be clawed back. Everything below — the
    hold, the threshold, the caps — exists to make the window between
    "earned" and "paid" long enough for a human to notice a pattern.

  Two protections exist here that credit never needed:

    HOLD_MS         earnings are not payable until they have aged. A
                    burst of referrals on Tuesday cannot be cashed out
                    on Tuesday.
    MIN_PAYOUT      a payout is a manual UPI transfer, so forty ₹50
                    transfers is not a workflow. Earnings accumulate
                    until they are worth one transfer.

  Firestore layout
  ────────────────────────────────────────────────────────────────────
    referrers/{uid}
      { code, name, created_at, qualified, earned, paid, requested,
        day, day_count }

    referralCodes/{CODE}          index, so a link resolves in one read
      { uid, created_at }

    referralAttributions/{referredUid}
      { code, referrer_uid, event, amount, created_at }

    referralPayouts/{uid}_{requestedAt}
      { uid, code, amount, upi, status, requested_at, settled_at, note }

  `earned` on the referrer is the lifetime total. `paid` is what has
  actually been transferred and `requested` is what is sitting in an
  unsettled request — the difference between them and the matured
  earnings is what a student may ask for next.

  The index is a separate collection rather than a query on `referrers`
  because a code lookup happens on every inbound link and a keyed read
  is one document, always, with no index to keep.
*/

const crypto = require("crypto");

const REFERRERS = "referrers";
const CODES = "referralCodes";
const ATTRIBUTIONS = "referralAttributions";
const PAYOUTS = "referralPayouts";

/*
  What a referral is worth, in whole rupees. One place, because the
  number is a business decision that will change and must never be
  duplicated into a route.

  It is a table rather than a constant so that tiering it later ("first
  two at 50, next three at 75") is an edit here and nothing else: the
  bracket is chosen by how many the referrer has *already* qualified.
*/
const TIERS = [
  { upTo: Infinity, amount: 50 }
];

// The most any one account can accrue. Six referrals at the current
// rate — enough to cover half a ₹999 report, bounded enough that a farm
// that beats every other control is not an open tap.
const EARNINGS_CAP = 300;

// A real student does not refer six people in an afternoon. This is the
// burst control; the cap above is the total control.
const DAILY_QUALIFY_LIMIT = 5;

/*
  How long an earning has to sit before it can be asked for.

  This is the only control that still works after every other one has
  been beaten: a farm that manufactures referrals has to wait a week
  with the evidence sitting in Firestore before any money moves, and a
  week is long enough for a human to look at a referrer whose numbers
  went strange.
*/
const HOLD_MS = 7 * 24 * 60 * 60 * 1000;

// Each payout is a manual UPI transfer. Paying ₹50 six times costs more
// in attention than the ₹300 is worth, so earnings bank up first.
const MIN_PAYOUT = 200;

/*
  Which client-reported events are allowed to qualify a referral. The
  free Career Snapshot is the whole point of the programme — the friend
  has to have actually finished something, not just loaded a page.

  Adding a key here is adding a way to earn money, so it is an explicit
  allow-list and never a pass-through of whatever the client sent.
*/
const QUALIFYING_EVENTS = { snapshot: true, stream: true };

/* ------------------------------------------------------------------ */
/* Codes                                                               */
/* ------------------------------------------------------------------ */

/*
  Deliberately missing B/8, I/1, O/0, S/5 and Z/2. These codes are read
  off a phone screen in someone's Instagram story and typed by hand; a
  character set that cannot be misread is worth more than four extra
  bits of entropy.
*/
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";

const CODE_MIN = 6;
const CODE_MAX = 12;

// The same shape the coupon field applies (see lume-coupons.js), so a
// referral code can be typed into the box that already exists.
function normalizeCode(value){
  return String(value == null ? "" : value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_MAX);
}

function isValidCode(value){
  const code = normalizeCode(value);
  return code.length >= CODE_MIN && code.length <= CODE_MAX;
}

/*
  A code a student recognises as theirs: up to four letters of their own
  name, then four random characters. "Aarav" -> "AARAV7K2" reads as
  belonging to someone, which matters when it is sitting in a caption
  next to their face.

  `random` is injectable so the tests can pin a code instead of
  asserting on a regex.
*/
function makeCode(name, random){
  const pick = random || function(n){
    const bytes = crypto.randomBytes(n);
    let out = "";
    for(let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  };

  const stem = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);

  // No usable letters in the display name — plenty of accounts are a
  // phone number — so the brand stands in for the stem.
  return (stem.length >= 3 ? stem : "LUME") + pick(4);
}

/* ------------------------------------------------------------------ */
/* Reward maths                                                        */
/* ------------------------------------------------------------------ */

// What the next referral is worth to someone who has already qualified
// `alreadyQualified` of them, given what they have banked so far.
function rewardFor(alreadyQualified, earnedSoFar){
  const done = Math.max(0, Number(alreadyQualified) || 0);
  const banked = Math.max(0, Number(earnedSoFar) || 0);

  let amount = 0;
  for(const tier of TIERS){
    if(done < tier.upTo){ amount = tier.amount; break; }
  }

  // Never accrue past the cap: the last referral before it is worth the
  // remainder, not the full tier.
  return Math.max(0, Math.min(amount, EARNINGS_CAP - banked));
}

function todayKey(now){
  return new Date(now == null ? Date.now() : now).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Kill switch                                                         */
/* ------------------------------------------------------------------ */

/*
  Set LUME_REFERRALS_ENABLED=0 to turn the programme off without a
  deploy. It exists because this is the one feature on the site that
  gives money away: if something here is being abused at 2am, the answer
  should be one environment variable, not a revert.

  Default is on — a referral link already in the wild must keep working
  unless someone has deliberately switched it off.
*/
function isEnabled(){
  const raw = String(process.env.LUME_REFERRALS_ENABLED == null ? "1" : process.env.LUME_REFERRALS_ENABLED)
    .trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

// Required lazily, and behind a try, so this module stays loadable (and
// unit-testable) on a deploy where Firebase is not configured at all.
function firestore(){
  return require("./firebaseAdmin").db();
}

function publicStats(doc){
  const data = doc || {};
  const earned = Math.max(0, Number(data.earned) || 0);
  return {
    code: data.code || "",
    qualified: Math.max(0, Number(data.qualified) || 0),
    earned: earned,
    cap: EARNINGS_CAP,
    remaining: Math.max(0, EARNINGS_CAP - earned),
    next_reward: rewardFor(Number(data.qualified) || 0, earned)
  };
}

/*
  The caller's own code, minted on first ask.

  Collisions are possible — 26^4 over the random half — so a taken code
  is retried rather than assumed unique. The index write is the claim:
  it is a create, not a set, inside a transaction, so two students
  minting the same code at the same moment cannot both win.
*/
async function ensureCode({ uid, name, attempts }, options){
  const id = String(uid || "");
  if(!id) throw new Error("ensureCode requires a uid.");

  const opts = options || {};
  const db = opts.db || firestore();
  const tries = Math.max(1, Number(attempts) || 5);

  const ref = db.collection(REFERRERS).doc(id);
  const existing = await ref.get();
  if(existing.exists && existing.data() && existing.data().code){
    return { created: false, stats: publicStats(existing.data()) };
  }

  for(let i = 0; i < tries; i++){
    const code = makeCode(name, opts.random);
    const indexRef = db.collection(CODES).doc(code);
    const now = Date.now();

    // The index entry is the claim, and it is taken inside a transaction
    // so that two students drawing the same code in the same instant
    // cannot both read "free" and then both write. A read-then-write
    // outside one would leave exactly that window open, and the loser
    // would silently own a code that resolves to somebody else.
    const claimed = await db.runTransaction(async (tx) => {
      const taken = await tx.get(indexRef);
      if(taken.exists) return false;
      tx.set(indexRef, { uid: id, created_at: now });
      return true;
    });
    if(!claimed) continue;

    const doc = {
      code,
      name: String(name || "").slice(0, 80),
      created_at: now,
      qualified: 0,
      earned: 0,
      day: todayKey(now),
      day_count: 0
    };

    await ref.set(doc, { merge: true });
    return { created: true, stats: publicStats(doc) };
  }

  throw new Error("Could not allocate a referral code after " + tries + " attempts.");
}

async function statsFor(uid, options){
  const db = (options || {}).db || firestore();
  const snap = await db.collection(REFERRERS).doc(String(uid || "")).get();
  return snap.exists ? publicStats(snap.data()) : null;
}

async function lookupCode(code, options){
  const key = normalizeCode(code);
  if(!isValidCode(key)) return null;
  const db = (options || {}).db || firestore();
  const snap = await db.collection(CODES).doc(key).get();
  if(!snap.exists) return null;
  const uid = String((snap.data() || {}).uid || "");
  return uid ? { code: key, uid } : null;
}

/*
  Record that `referredUid` arrived on `code` and finished `event`.

  Every refusal is a named reason rather than a throw, because most of
  them are ordinary — a student re-taking the quiz, someone who followed
  their own link — and the route answers 200 to all of them. The client
  must not be able to tell a farm-detection refusal from a duplicate.

  Resolves { ok, reason, amount, stats }.
*/
async function recordQualified({ code, referredUid, event, now }, options){
  const opts = options || {};
  const db = opts.db || firestore();
  const at = now == null ? Date.now() : now;

  const referred = String(referredUid || "");
  if(!referred) return { ok: false, reason: "NO_ACCOUNT" };

  if(!Object.prototype.hasOwnProperty.call(QUALIFYING_EVENTS, String(event || ""))){
    return { ok: false, reason: "EVENT_NOT_QUALIFYING" };
  }

  const found = await lookupCode(code, { db });
  if(!found) return { ok: false, reason: "UNKNOWN_CODE" };

  // The cheapest fraud there is, and the one everybody tries first.
  if(found.uid === referred) return { ok: false, reason: "SELF_REFERRAL" };

  const attributionRef = db.collection(ATTRIBUTIONS).doc(referred);
  const referrerRef = db.collection(REFERRERS).doc(found.uid);

  return db.runTransaction(async (tx) => {
    // Keyed by the referred person, so this is also the "already counted
    // for someone else" check. First referrer to qualify them wins.
    const already = await tx.get(attributionRef);
    if(already.exists) return { ok: false, reason: "ALREADY_ATTRIBUTED" };

    const snap = await tx.get(referrerRef);
    if(!snap.exists) return { ok: false, reason: "UNKNOWN_CODE" };
    const data = snap.data() || {};

    const day = todayKey(at);
    const dayCount = data.day === day ? (Number(data.day_count) || 0) : 0;
    if(dayCount >= DAILY_QUALIFY_LIMIT){
      return { ok: false, reason: "DAILY_LIMIT" };
    }

    const qualified = Number(data.qualified) || 0;
    const earned = Number(data.earned) || 0;
    const amount = rewardFor(qualified, earned);

    // At the cap the referral is still recorded — we want the count, and
    // recording it stops the same friend being re-used once the cap
    // lifts — but it is worth nothing.
    if(amount <= 0 && earned >= EARNINGS_CAP){
      tx.set(attributionRef, {
        code: found.code, referrer_uid: found.uid,
        event: String(event), amount: 0, created_at: at
      });
      tx.set(referrerRef, {
        qualified: qualified + 1, day, day_count: dayCount + 1
      }, { merge: true });
      return { ok: true, reason: "CAP_REACHED", amount: 0,
               stats: publicStats(Object.assign({}, data, { qualified: qualified + 1 })) };
    }

    tx.set(attributionRef, {
      code: found.code, referrer_uid: found.uid,
      event: String(event), amount, created_at: at
    });

    const next = Object.assign({}, data, {
      qualified: qualified + 1,
      earned: earned + amount,
      day,
      day_count: dayCount + 1
    });
    tx.set(referrerRef, {
      qualified: next.qualified,
      earned: next.earned,
      day: next.day,
      day_count: next.day_count
    }, { merge: true });

    return { ok: true, reason: "QUALIFIED", amount, stats: publicStats(next) };
  });
}

/* ------------------------------------------------------------------ */
/* Payouts                                                             */
/* ------------------------------------------------------------------ */

/*
  A UPI ID, loosely. We cannot tell whether an address exists — only the
  bank can, at transfer time — so this rejects what is obviously not one
  and lets the human making the transfer catch the rest. Being strict
  here would reject valid handles we have not heard of; being absent
  would let "i'll tell you later" through as an address.
*/
function normalizeUpi(value){
  return String(value == null ? "" : value).trim().toLowerCase().slice(0, 128);
}

function isValidUpi(value){
  return /^[a-z0-9][a-z0-9.\-_]{1,64}@[a-z]{2,32}$/.test(normalizeUpi(value));
}

/*
  What this student may actually ask for right now.

  Deliberately computed from the attribution rows rather than from a
  running balance on the referrer: the hold means the answer depends on
  WHEN each referral happened, and a single number cannot carry that.
  Reading the rows also means a correction — deleting a fraudulent
  attribution — takes effect immediately, with no counter to fix up.
*/
async function payoutSummary(uid, options){
  const opts = options || {};
  const db = opts.db || firestore();
  const now = opts.now == null ? Date.now() : opts.now;
  const id = String(uid || "");

  const snap = await db.collection(REFERRERS).doc(id).get();
  if(!snap.exists) return null;
  const data = snap.data() || {};

  const rows = await db.collection(ATTRIBUTIONS).where("referrer_uid", "==", id).get();
  let matured = 0;
  rows.forEach(function(row){
    const r = row.data() || {};
    if((now - Number(r.created_at || 0)) >= HOLD_MS) matured += Number(r.amount) || 0;
  });

  const paid = Math.max(0, Number(data.paid) || 0);
  const requested = Math.max(0, Number(data.requested) || 0);
  const payable = Math.max(0, matured - paid - requested);

  return {
    earned: Math.max(0, Number(data.earned) || 0),
    paid,
    pending: requested,
    matured,
    payable,
    min_payout: MIN_PAYOUT,
    hold_days: Math.round(HOLD_MS / (24 * 60 * 60 * 1000)),
    can_request: payable >= MIN_PAYOUT,
    upi: String(data.upi || "")
  };
}

/*
  Ask to be paid.

  Refusals are named and ordinary. The age declaration is a deliberate
  speed bump rather than a control: we cannot verify it, and it is here
  so that nobody is paid without having been asked the question.

  Resolves { ok, reason, amount }.
*/
async function requestPayout({ uid, upi, ageDeclared, now }, options){
  const opts = options || {};
  const db = opts.db || firestore();
  const at = now == null ? Date.now() : now;
  const id = String(uid || "");

  if(!id) return { ok: false, reason: "NO_ACCOUNT" };
  if(!ageDeclared) return { ok: false, reason: "AGE_NOT_DECLARED" };

  const address = normalizeUpi(upi);
  if(!isValidUpi(address)) return { ok: false, reason: "BAD_UPI" };

  // Read the rows OUTSIDE the transaction: a Firestore transaction may
  // not run a query, and the referrer document read inside it is what
  // actually guards against two requests racing.
  const summary = await payoutSummary(id, { db, now: at });
  if(!summary) return { ok: false, reason: "NO_CODE" };
  if(summary.pending > 0) return { ok: false, reason: "ALREADY_PENDING" };
  if(summary.payable < MIN_PAYOUT) return { ok: false, reason: "MIN_NOT_MET", payable: summary.payable };

  const referrerRef = db.collection(REFERRERS).doc(id);
  const payoutRef = db.collection(PAYOUTS).doc(id + "_" + at);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(referrerRef);
    if(!snap.exists) return { ok: false, reason: "NO_CODE" };
    const data = snap.data() || {};

    // Re-checked against the document the transaction actually read, so
    // two requests sent at once cannot both pass the check above.
    if((Number(data.requested) || 0) > 0) return { ok: false, reason: "ALREADY_PENDING" };

    const amount = summary.payable;
    tx.set(payoutRef, {
      uid: id,
      code: String(data.code || ""),
      amount,
      upi: address,
      status: "pending",
      requested_at: at,
      settled_at: null,
      note: ""
    });
    tx.set(referrerRef, {
      requested: amount,
      upi: address,
      age_declared_at: at
    }, { merge: true });

    return { ok: true, reason: "REQUESTED", amount, id: id + "_" + at };
  });
}

/*
  Settle a request: "paid" once the money has actually been sent,
  "rejected" when it has not and will not be.

  A rejection releases the amount back to payable rather than destroying
  it — the student keeps what they earned, and whoever rejected it should
  say why in the note. Only a payout that is still pending can be
  settled, so running the CLI twice cannot pay twice.
*/
async function settlePayout({ id, status, note, now }, options){
  const opts = options || {};
  const db = opts.db || firestore();
  const at = now == null ? Date.now() : now;
  const state = status === "paid" ? "paid" : "rejected";

  const payoutRef = db.collection(PAYOUTS).doc(String(id || ""));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(payoutRef);
    if(!snap.exists) return { ok: false, reason: "NOT_FOUND" };
    const payout = snap.data() || {};
    if(payout.status !== "pending") return { ok: false, reason: "ALREADY_SETTLED", status: payout.status };

    const referrerRef = db.collection(REFERRERS).doc(String(payout.uid || ""));
    const referrer = await tx.get(referrerRef);
    const data = referrer.exists ? (referrer.data() || {}) : {};
    const amount = Math.max(0, Number(payout.amount) || 0);

    tx.set(payoutRef, {
      status: state,
      settled_at: at,
      note: String(note || "").slice(0, 300)
    }, { merge: true });

    tx.set(referrerRef, {
      // Cleared either way: the money is no longer "asked for".
      requested: Math.max(0, (Number(data.requested) || 0) - amount),
      // Only a real transfer moves `paid`.
      paid: (Number(data.paid) || 0) + (state === "paid" ? amount : 0)
    }, { merge: true });

    return { ok: true, reason: state.toUpperCase(), amount, uid: payout.uid };
  });
}

// Every payout in a given state, oldest first. For the CLI, which is the
// only thing that reads this.
async function listPayouts(status, options){
  const db = (options || {}).db || firestore();
  const wanted = String(status || "pending");
  const rows = await db.collection(PAYOUTS).where("status", "==", wanted).get();
  const out = [];
  rows.forEach(function(row){ out.push(Object.assign({ id: row.id }, row.data())); });
  return out.sort(function(a, b){ return (a.requested_at || 0) - (b.requested_at || 0); });
}

module.exports = {
  REFERRERS,
  CODES,
  ATTRIBUTIONS,
  PAYOUTS,
  TIERS,
  EARNINGS_CAP,
  DAILY_QUALIFY_LIMIT,
  HOLD_MS,
  MIN_PAYOUT,
  QUALIFYING_EVENTS,
  CODE_MIN,
  CODE_MAX,
  normalizeCode,
  isValidCode,
  makeCode,
  rewardFor,
  todayKey,
  publicStats,
  isEnabled,
  ensureCode,
  statsFor,
  lookupCode,
  recordQualified,
  normalizeUpi,
  isValidUpi,
  payoutSummary,
  requestPayout,
  settlePayout,
  listPayouts
};
