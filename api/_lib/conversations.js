/*
  WhatsApp threads: who is on the other end, what has been said, what it
  has cost, and whether a human has taken over.

  ── Linking a phone number to an account ──

  This is the part that had to be got right rather than got working.

  restore-access.js deliberately stopped trusting typed-in phone numbers,
  because a phone number is not a secret: it is shareable, guessable and
  often printed on a school form. An agent that hands over somebody's
  psychometric profile to whoever messages from their number would
  reopen exactly that hole, at scale, over a channel where nobody signs
  in.

  So possession of the number is not enough. A client links once, from
  the website, while signed in: they generate a short code, send it to
  us on WhatsApp, and only then does agentLinks/{phone} point at their
  uid. Until that has happened the agent is happy to talk about careers,
  exams and colleges — and will not read a single personal field.

  The link is revocable, and deleting it is a one-liner because it is one
  document.

  ── Budgets ──

  An autonomous agent on a public WhatsApp number without a per-person
  cap is an open invoice. Every turn is metered against the identity we
  actually have — the phone number, since an unlinked stranger can talk
  too — and the cap hands off to a human rather than refusing, because
  "you have used your allowance" is a terrible thing to say to someone
  who might be about to ask something that matters.
*/

const crypto = require("crypto");
const { db } = require("./firebaseAdmin");
const { normalizePhone } = require("./identity");

const THREADS = "conversations";
const LINKS = "agentLinks";
const LINK_CODES = "agentLinkCodes";

// Generous for a real conversation, nowhere near enough to be expensive.
const DAILY_MESSAGE_CAP = Number(process.env.AGENT_DAILY_MESSAGE_CAP || 40);

// How much transcript the agent is shown. Long enough to hold a thread,
// short enough that a month-old conversation is not re-billed every turn.
const HISTORY_TURNS = 16;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY2346789";
const CODE_TTL_MS = 15 * 60 * 1000;

function threadId(phone){
  const p = normalizePhone(phone);
  // Hashed so the collection is not itself a directory of everybody who
  // has ever messaged the business.
  return crypto.createHash("sha256").update("lume-thread:" + p).digest("hex").slice(0, 32);
}

/*
  A browser has no phone number, so a web conversation is keyed by a
  session id the server issues and the browser stores.

  Hashed into a separate namespace from phone threads, and deliberately
  so: the two must never be able to collide, because a collision would
  hand a website visitor somebody's WhatsApp transcript. The namespace
  string is the whole guard, so it is not a detail to tidy away.
*/
function webSessionId(){
  return crypto.randomBytes(24).toString("base64url");
}

/*
  A session id is a bearer token for one transcript, so it has to look
  like one: server-issued, long, and unguessable. Anything that does not
  match what webSessionId() produces is refused rather than normalised
  into a thread of its own — otherwise a caller could pick "1" and share
  a conversation with whoever picked "1" before them.
*/
const WEB_SESSION = /^[A-Za-z0-9_-]{32}$/;

function validWebSession(id){
  return WEB_SESSION.test(String(id || ""));
}

function webThreadId(sessionId){
  return crypto.createHash("sha256")
    .update("lume-web-thread:" + String(sessionId))
    .digest("hex").slice(0, 32);
}

async function getWebThread(sessionId){
  const firestore = db();
  const id = webThreadId(sessionId);
  const snap = await firestore.collection(THREADS).doc(id).get();
  if(snap.exists) return snap.data();

  return {
    threadId: id,
    channel: "web",
    /* No phone. A web thread has no phone number and must not grow one:
       the field exists on WhatsApp threads and its absence here is what
       keeps the two kinds of transcript distinguishable in Firestore. */
    turns: [],
    humanLocked: false,
    lockReason: null,
    riskFlags: [],
    spend: {},
    createdAt: new Date().toISOString(),
    updatedAt: null
  };
}

function today(){
  return new Date().toISOString().slice(0, 10);
}

// ── linking ───────────────────────────────────────────────────────────

function newLinkCode(){
  const bytes = crypto.randomBytes(6);
  let out = "";
  for(let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/*
  Called from a signed-in page. The uid comes from a verified ID token,
  never from anything typed.
*/
async function createLinkCode(uid){
  const firestore = db();
  const code = newLinkCode();
  const now = Date.now();

  await firestore.collection(LINK_CODES).doc(code).set({
    code: code,
    uid: String(uid),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
    usedAt: null
  });

  return { code: code, expiresInMinutes: Math.round(CODE_TTL_MS / 60000) };
}

/*
  Called when a code arrives over WhatsApp. Single use, short lived, and
  it binds the number the message actually came from — not a number
  anybody typed.
*/
async function redeemLinkCode({ code, phone }){
  const firestore = db();
  const key = String(code || "").trim().toUpperCase();
  const p = normalizePhone(phone);
  if(!key || !p) return { ok:false, reason:"invalid" };

  const ref = firestore.collection(LINK_CODES).doc(key);
  const snap = await ref.get();
  if(!snap.exists) return { ok:false, reason:"unknown" };

  const row = snap.data();
  if(row.usedAt) return { ok:false, reason:"already_used" };
  if(new Date(row.expiresAt).getTime() < Date.now()) return { ok:false, reason:"expired" };

  await firestore.collection(LINKS).doc(p).set({
    phone: p,
    uid: String(row.uid),
    linkedAt: new Date().toISOString()
  });
  await ref.set({ usedAt: new Date().toISOString() }, { merge: true });

  return { ok:true, uid: String(row.uid) };
}

async function linkedAccount(phone){
  const firestore = db();
  const p = normalizePhone(phone);
  if(!p) return null;
  const snap = await firestore.collection(LINKS).doc(p).get();
  return snap.exists ? String(snap.data().uid) : null;
}

async function unlinkAccount(phone){
  const firestore = db();
  const p = normalizePhone(phone);
  if(!p) return false;
  await firestore.collection(LINKS).doc(p).delete();
  return true;
}

// ── threads ───────────────────────────────────────────────────────────

async function getThread(phone){
  const firestore = db();
  const id = threadId(phone);
  const snap = await firestore.collection(THREADS).doc(id).get();
  if(snap.exists) return snap.data();

  return {
    threadId: id,
    phone: normalizePhone(phone),
    turns: [],
    humanLocked: false,
    lockReason: null,
    riskFlags: [],
    spend: {},
    createdAt: new Date().toISOString(),
    updatedAt: null
  };
}

async function saveThread(thread){
  const firestore = db();
  await firestore.collection(THREADS).doc(thread.threadId).set(
    Object.assign({}, thread, { updatedAt: new Date().toISOString() })
  );
  return thread;
}

// The slice of transcript the agent is shown.
function recentTurns(thread){
  return (thread.turns || []).slice(-HISTORY_TURNS);
}

function appendTurn(thread, turn){
  thread.turns = (thread.turns || []).concat([
    Object.assign({ at: new Date().toISOString() }, turn)
  ]);
  // Bounded so a thread document cannot grow without limit. What is
  // trimmed is still in the owner's WhatsApp; this is our working copy.
  if(thread.turns.length > 200) thread.turns = thread.turns.slice(-200);
  return thread;
}

/*
  A human takes over. Set on an acute screen, and clearable only by a
  person — never by the agent, and never by the passage of time. The
  point of the lock is that the next message from somebody in crisis
  reaches a human, not a chatbot that has decided the moment has passed.
*/
function lockToHuman(thread, reason){
  thread.humanLocked = true;
  thread.lockReason = String(reason || "").slice(0, 300);
  return thread;
}

function unlockThread(thread, by){
  thread.humanLocked = false;
  thread.lockReason = null;
  thread.unlockedBy = String(by || "").slice(0, 120);
  return thread;
}

function flagRisk(thread, verdict){
  thread.riskFlags = (thread.riskFlags || []).concat([{
    at: new Date().toISOString(),
    risk: verdict.risk,
    reason: verdict.reason || "",
    degraded: Boolean(verdict.degraded)
  }]).slice(-50);
  return thread;
}

// ── budget ────────────────────────────────────────────────────────────

function messagesToday(thread){
  return Number((thread.spend || {})[today()] || 0);
}

function withinBudget(thread){
  return messagesToday(thread) < DAILY_MESSAGE_CAP;
}

function chargeMessage(thread, usage){
  const day = today();
  thread.spend = thread.spend || {};
  thread.spend[day] = Number(thread.spend[day] || 0) + 1;

  if(usage){
    const tokens = thread.tokens || {};
    tokens[day] = {
      input: Number((tokens[day] && tokens[day].input) || 0) + Number(usage.input_tokens || 0),
      output: Number((tokens[day] && tokens[day].output) || 0) + Number(usage.output_tokens || 0)
    };
    thread.tokens = tokens;
  }

  // Keep a fortnight. Enough to see a pattern, not a permanent log of
  // how often somebody messaged us.
  const keep = Object.keys(thread.spend).sort().slice(-14);
  thread.spend = Object.fromEntries(keep.map(k => [k, thread.spend[k]]));
  if(thread.tokens){
    thread.tokens = Object.fromEntries(
      Object.keys(thread.tokens).sort().slice(-14).map(k => [k, thread.tokens[k]])
    );
  }
  return thread;
}

module.exports = {
  THREADS, LINKS, LINK_CODES,
  DAILY_MESSAGE_CAP, HISTORY_TURNS,
  threadId,
  webSessionId, validWebSession, webThreadId, getWebThread,
  newLinkCode, createLinkCode, redeemLinkCode, linkedAccount, unlinkAccount,
  getThread, saveThread, recentTurns, appendTurn,
  lockToHuman, unlockThread, flagRisk,
  messagesToday, withinBudget, chargeMessage
};
