/*
  Lume Live — the referral ledger.

  A student who sends a friend to the free Career Snapshot earns credit
  towards something we actually sell. Three rules shape everything here,
  and they are the reason this is a server-side module rather than a
  counter in localStorage:

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
     control is CREDIT_CAP rupees of discount on our own products, which
     they can only use by paying us the rest.

  Nothing here pays anyone cash, and nothing here mints a coupon yet.
  This is the ledger: who referred whom, how much they have earned. The
  redemption side (turning credit into a flat-discount coupon through
  api/_lib/coupons.js, with the 7-day hold before credit is spendable)
  is a separate step and deliberately not wired in here — a ledger that
  cannot spend is a ledger that cannot be drained while we watch it.

  Firestore layout
  ────────────────────────────────────────────────────────────────────
    referrers/{uid}
      { code, name, created_at, qualified, credit_earned,
        day, day_count }

    referralCodes/{CODE}          index, so a link resolves in one read
      { uid, created_at }

    referralAttributions/{referredUid}
      { code, referrer_uid, event, credit, created_at }

  The index is a separate collection rather than a query on `referrers`
  because a code lookup happens on every inbound link and a keyed read
  is one document, always, with no index to keep.
*/

const crypto = require("crypto");

const REFERRERS = "referrers";
const CODES = "referralCodes";
const ATTRIBUTIONS = "referralAttributions";

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
const CREDIT_CAP = 300;

// A real student does not refer six people in an afternoon. This is the
// burst control; the cap above is the total control.
const DAILY_QUALIFY_LIMIT = 5;

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
function rewardFor(alreadyQualified, creditSoFar){
  const done = Math.max(0, Number(alreadyQualified) || 0);
  const banked = Math.max(0, Number(creditSoFar) || 0);

  let amount = 0;
  for(const tier of TIERS){
    if(done < tier.upTo){ amount = tier.amount; break; }
  }

  // Never accrue past the cap: the last referral before it is worth the
  // remainder, not the full tier.
  return Math.max(0, Math.min(amount, CREDIT_CAP - banked));
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
  const earned = Math.max(0, Number(data.credit_earned) || 0);
  return {
    code: data.code || "",
    qualified: Math.max(0, Number(data.qualified) || 0),
    credit_earned: earned,
    credit_cap: CREDIT_CAP,
    credit_remaining: Math.max(0, CREDIT_CAP - earned),
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
      credit_earned: 0,
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

  Resolves { ok, reason, credit, stats }.
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
    const earned = Number(data.credit_earned) || 0;
    const credit = rewardFor(qualified, earned);

    // At the cap the referral is still recorded — we want the count, and
    // recording it stops the same friend being re-used once the cap
    // lifts — but it is worth nothing.
    if(credit <= 0 && earned >= CREDIT_CAP){
      tx.set(attributionRef, {
        code: found.code, referrer_uid: found.uid,
        event: String(event), credit: 0, created_at: at
      });
      tx.set(referrerRef, {
        qualified: qualified + 1, day, day_count: dayCount + 1
      }, { merge: true });
      return { ok: true, reason: "CAP_REACHED", credit: 0,
               stats: publicStats(Object.assign({}, data, { qualified: qualified + 1 })) };
    }

    tx.set(attributionRef, {
      code: found.code, referrer_uid: found.uid,
      event: String(event), credit, created_at: at
    });

    const next = Object.assign({}, data, {
      qualified: qualified + 1,
      credit_earned: earned + credit,
      day,
      day_count: dayCount + 1
    });
    tx.set(referrerRef, {
      qualified: next.qualified,
      credit_earned: next.credit_earned,
      day: next.day,
      day_count: next.day_count
    }, { merge: true });

    return { ok: true, reason: "QUALIFIED", credit, stats: publicStats(next) };
  });
}

module.exports = {
  REFERRERS,
  CODES,
  ATTRIBUTIONS,
  TIERS,
  CREDIT_CAP,
  DAILY_QUALIFY_LIMIT,
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
  recordQualified
};
