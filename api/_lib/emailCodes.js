/*
  Lume Live — the six-digit code that signs someone in by email.

  Firebase has no email OTP. It offers a passwordless *link*, which is a
  different thing with different failure modes: it has to be opened in
  the browser that asked for it, and on a phone it usually is not. A code
  can be read off a notification and typed anywhere, which is why the
  phone flow reads the way it does and why this one matches it.

  So the code is ours, and the rules below are the ones Firebase would
  otherwise have enforced for us:

    * The code is never stored. Only a SHA-256 of it, salted with the
      address it was issued for and a server-side pepper, so a leaked
      copy of the collection is not a list of working codes.
    * Ten minutes, then it is dead.
    * Five wrong guesses, then it is dead. A million codes and unlimited
      guesses is not a six-digit secret, it is a slow password.
    * Single use. A correct guess deletes the document before the caller
      is told it was correct.
    * Comparison is timing-safe. The margin is tiny over the internet,
      but it costs one function call to not think about it.

  What it deliberately does NOT do is say whether an address has an
  account. Both cases issue a code and answer identically; the account
  is created at verification, once the person has proved they can read
  the inbox. "No account with that email" is a free list of your
  customers, and worse, of who is not one.

  Storage is Firestore via firebaseAdmin, the same project as everything
  else — no new infrastructure. `store` is injectable so the rules can be
  tested without credentials or a network.
*/

const crypto = require("crypto");

const COLLECTION = "emailSignInCodes";
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// Long enough that a second tap is a wait rather than a second email,
// short enough that a genuinely lost message is not a punishment.
const RESEND_COOLDOWN_MS = 45 * 1000;

function normalizeEmail(email){
  return String(email == null ? "" : email).trim().toLowerCase();
}

/*
  A plausible address, not a valid one — RFC 5322 in a regex is famously
  a mistake, and the only real test of an address is whether a code sent
  to it comes back.
*/
function looksLikeEmail(email){
  const value = normalizeEmail(email);
  if(value.length < 6 || value.length > 254) return false;
  if(/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if(at < 1 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/*
  The pepper turns "hash of a six-digit number and an address anyone can
  guess" into something a stolen database cannot be brute-forced against
  offline: without it, 1,000,000 hashes per address is seconds of work.

  Set LUME_AUTH_CODE_PEPPER to a long random string. If it is unset the
  codes still expire, still lock out, and are still single-use — so this
  warns rather than refuses, because an inability to sign in is a worse
  failure than a weaker hash.
*/
function pepper(){
  const value = String(process.env.LUME_AUTH_CODE_PEPPER || "");
  if(!value){
    console.warn("[lume auth] LUME_AUTH_CODE_PEPPER is not set — sign-in codes are hashed without one. Set it to a long random string.");
  }
  return value;
}

function addressKey(email){
  return crypto.createHash("sha256").update("addr:" + pepper() + ":" + normalizeEmail(email)).digest("hex");
}

function hashCode(email, code){
  return crypto.createHash("sha256")
    .update("code:" + pepper() + ":" + normalizeEmail(email) + ":" + String(code))
    .digest("hex");
}

/*
  Math.random() is not a secret. randomInt is, and the modulo-free range
  means 000000–999999 are equally likely — a skew here would shrink the
  keyspace for everyone.
*/
function newCode(){
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function sameHash(a, b){
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if(left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/*
  The clock, injectable for tests.

  Written out rather than `options.now || Date.now()`, because a `now` of
  0 is a perfectly good timestamp and that expression silently swaps it
  for the real clock — which is exactly the kind of thing a test written
  from zero discovers and a reader never does.
*/
function at(options){
  return (options && options.now != null) ? Number(options.now) : Date.now();
}

function collection(store){
  const firestore = store || require("./firebaseAdmin").db();
  return firestore.collection(COLLECTION);
}

/*
  Issues a code for an address.

  Returns { ok:true, code, expiresAt } — the caller emails `code` and
  must never log it or return it to the browser — or
  { ok:false, code:"TOO_SOON", retryInMs } when one was just sent.
*/
async function issueCode(email, opts){
  const options = opts || {};
  const now = at(options);
  const ref = collection(options.store).doc(addressKey(email));
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() || {}) : null;

  if(existing && now - Number(existing.issuedAt || 0) < RESEND_COOLDOWN_MS){
    return {
      ok: false,
      code: "TOO_SOON",
      retryInMs: RESEND_COOLDOWN_MS - (now - Number(existing.issuedAt || 0))
    };
  }

  const value = options.codeForTest || newCode();
  await ref.set({
    codeHash: hashCode(email, value),
    issuedAt: now,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0
  });

  return { ok: true, code: value, expiresAt: now + CODE_TTL_MS };
}

/*
  Checks a code and, either way, leaves nothing reusable behind.

  Returns { ok:true } or { ok:false, code:<why> } where why is one of
  NO_CODE (never issued, or already spent), EXPIRED, LOCKED (too many
  wrong guesses) or WRONG_CODE.

  A wrong guess is recorded in a transaction: two browsers guessing in
  parallel must not each read "attempts: 4" and both be allowed.
*/
async function verifyCode(email, code, opts){
  const options = opts || {};
  const now = at(options);
  const firestore = options.store || require("./firebaseAdmin").db();
  const ref = firestore.collection(COLLECTION).doc(addressKey(email));
  const expected = hashCode(email, String(code || "").trim());

  const outcome = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if(!snap.exists){ return { ok:false, code:"NO_CODE" }; }
    const data = snap.data() || {};

    if(now > Number(data.expiresAt || 0)){
      tx.delete(ref);
      return { ok:false, code:"EXPIRED" };
    }
    if(Number(data.attempts || 0) >= MAX_ATTEMPTS){
      tx.delete(ref);
      return { ok:false, code:"LOCKED" };
    }
    if(!sameHash(data.codeHash, expected)){
      const attempts = Number(data.attempts || 0) + 1;
      // The last wrong guess takes the code with it, so the lockout is
      // not itself a thing to wait out.
      if(attempts >= MAX_ATTEMPTS){ tx.delete(ref); }
      else { tx.set(ref, { attempts: attempts }, { merge: true }); }
      return { ok:false, code:"WRONG_CODE", attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts) };
    }

    // Correct. Spend it before saying so.
    tx.delete(ref);
    return { ok:true };
  });

  return outcome;
}

module.exports = {
  issueCode,
  verifyCode,
  normalizeEmail,
  looksLikeEmail,
  COLLECTION,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS
};
