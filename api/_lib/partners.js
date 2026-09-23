/*
  Lume Live — the partner ledger.

  A partner is a career counsellor who pays ₹1,999 once to join, brings
  their own clients, and earns ₹300 on every ₹999 Full Clarity Report one
  of those clients buys. partner-with-us.html states the terms; this file
  is where they are kept.

  How a counsellor becomes a partner
  ────────────────────────────────────────────────────────────────────
    1. They apply (WhatsApp form on partner-with-us.html) and have a
       vetting call.
    2. The owner approves their Google account's email:
         node tools/partners.mjs --approve them@gmail.com
    3. They sign in on partner-dashboard.html and pay the joining fee.
       create-order.js refuses that SKU to anyone not approved, so the
       page promise "you pay only after the call" is enforced, not hoped.
    4. Fulfilment sees the paid order and activates them: a partner
       document and a code, which is their link.

  How a report earns commission
  ────────────────────────────────────────────────────────────────────
  The link is assessment.html?partner=CODE. cashfree-payments.js stashes
  the code and sends it with the checkout; create-order.js tags it onto
  the Cashfree order; fulfilment reads it back once the money has
  arrived and calls creditReport(). The browser only ever *reports* a
  code — whether it earns anything is decided here.

  A client belongs to the first partner whose paid order they came
  through, for good. That binding is what stops a second counsellor's
  link taking over a client someone else brought in, and it lets a
  client who comes back later without the link still credit their
  counsellor.

  ───────────────────────────────────────────────────────────────────────
  Money leaves this building by hand
  ───────────────────────────────────────────────────────────────────────
  As with referrals, nothing here moves money. It records what is owed;
  the owner pays each partner's UPI ID monthly and marks the rows paid
  with tools/partners.mjs. See the top of api/_lib/referrals.js for why
  that is deliberate.

  Firestore layout
  ────────────────────────────────────────────────────────────────────
    partnerInvites/{email}        who may pay the joining fee
      { email, status: "approved"|"revoked", note, approved_at, joined_uid }

    partners/{uid}
      { code, name, email, status: "active", joined_at, join_order_id,
        clients, reports, earned, paid, upi }

    partnerCodes/{CODE}           index, so a link resolves in one read
      { uid, created_at }

    partnerClients/{clientUid}    which partner a client belongs to
      { code, partner_uid, first_order_id, created_at }

    partnerEarnings/{orderId}     one row per credited report
      { partner_uid, code, client_uid, order_id, sku, amount_paid,
        commission, status: "owed"|"paid"|"void", created_at,
        paid_at, payout_note }

  Keying the earning row by order id is the idempotency: order-status is
  polled and Cashfree retries webhooks, and every one of those calls lands
  on the same document.
*/

const { makeCode, normalizeCode, isValidCode, normalizeUpi, isValidUpi } = require("./referrals");

const PARTNERS = "partners";
const CODES = "partnerCodes";
const INVITES = "partnerInvites";
const CLIENTS = "partnerClients";
const EARNINGS = "partnerEarnings";

// The joining fee's SKU. Its price lives in catalog.js with every other.
const JOIN_SKU = "partner-joining-fee";

/*
  Which purchases earn a partner commission. An allow-list, like
  QUALIFYING_EVENTS in referrals.js: adding a key here is adding a way to
  pay money out. Only the report — Lume's own sessions are not sold to a
  partner's clients, and a partner's sessions are paid to them directly.
*/
const COMMISSION_SKUS = { "student-full-report": true };

/*
  30% of what the client actually paid, never more than ₹300. At the
  report's list price that is exactly the ₹300 the partner page
  promises; a client who used a discount code earns the partner 30% of
  the smaller amount, so a ₹1 demo or a 100%-off code never pays out
  more than it took in.
*/
const COMMISSION_RATE = 0.30;
const COMMISSION_CAP = 300;

/*
  How long a commission sits before the owner pays it. Reports are rarely
  refunded (refund-policy.html: not once the report is generated), but a
  week is the window in which a failed payment, a chargeback or a
  partner buying reports for made-up clients shows up.
*/
const HOLD_MS = 7 * 24 * 60 * 60 * 1000;

const LANDING = "https://lumelive.co.in/assessment.html";

function partnerUrl(code){
  return LANDING + "?partner=" + encodeURIComponent(code) + "#self-assessments";
}

function commissionFor(amountPaid){
  const paid = Math.max(0, Number(amountPaid) || 0);
  return Math.min(COMMISSION_CAP, Math.round(paid * COMMISSION_RATE));
}

function earnsCommission(sku){
  return Object.prototype.hasOwnProperty.call(COMMISSION_SKUS, String(sku || ""));
}

// Google sign-in emails, compared case-insensitively. The invite is keyed
// by this, so the owner can approve an address before its account exists.
function normalizeEmail(value){
  return String(value == null ? "" : value).trim().toLowerCase().slice(0, 120);
}

function isValidEmail(value){
  return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(normalizeEmail(value));
}

/*
  Set LUME_PARTNERS_ENABLED=0 to stop new commissions and hide the
  partner API without a deploy. Commissions already earned stay in the
  ledger and can still be paid from the CLI.
*/
function isEnabled(){
  const raw = String(process.env.LUME_PARTNERS_ENABLED == null ? "1" : process.env.LUME_PARTNERS_ENABLED)
    .trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

// Required lazily so this module loads (and tests) without Firebase.
function firestore(){
  return require("./firebaseAdmin").db();
}

/* ------------------------------------------------------------------ */
/* Approval and joining                                                */
/* ------------------------------------------------------------------ */

async function approve({ email, note, now }, options){
  const db = (options || {}).db || firestore();
  const address = normalizeEmail(email);
  if(!isValidEmail(address)) return { ok: false, reason: "BAD_EMAIL" };

  await db.collection(INVITES).doc(address).set({
    email: address,
    status: "approved",
    note: String(note || "").slice(0, 300),
    approved_at: now == null ? Date.now() : now
  }, { merge: true });
  return { ok: true, email: address };
}

async function revoke({ email, note }, options){
  const db = (options || {}).db || firestore();
  const address = normalizeEmail(email);
  const ref = db.collection(INVITES).doc(address);
  const snap = await ref.get();
  if(!snap.exists) return { ok: false, reason: "NOT_FOUND" };
  await ref.set({ status: "revoked", note: String(note || "").slice(0, 300) }, { merge: true });
  return { ok: true, email: address };
}

async function partnerFor(uid, options){
  const db = (options || {}).db || firestore();
  const id = String(uid || "");
  if(!id) return null;
  const snap = await db.collection(PARTNERS).doc(id).get();
  const data = snap.exists ? (snap.data() || {}) : null;
  return data && data.status === "active" ? data : null;
}

/*
  Where this account stands: "active" (a partner), "approved" (may pay
  the joining fee), or "none". The dashboard draws from this and
  create-order refuses the joining fee on anything but "approved".
*/
async function joinState({ uid, email }, options){
  const db = (options || {}).db || firestore();
  if(await partnerFor(uid, { db })) return "active";

  const address = normalizeEmail(email);
  if(!isValidEmail(address)) return "none";
  const snap = await db.collection(INVITES).doc(address).get();
  const invite = snap.exists ? (snap.data() || {}) : null;
  return invite && invite.status === "approved" ? "approved" : "none";
}

async function canJoin({ uid, email }, options){
  const state = await joinState({ uid, email }, options);
  if(state === "active") return { ok: false, reason: "ALREADY_PARTNER" };
  if(state !== "approved") return { ok: false, reason: "NOT_APPROVED" };
  return { ok: true };
}

/*
  Called by fulfilment when a joining-fee order is PAID. Idempotent: a
  second call for someone already active returns their existing code.

  It does not re-check the invite. The money has arrived — create-order
  checked the invite before taking it — and refusing to activate a paid
  partner would be the worst outcome available here. An invite revoked
  in the seconds between paying and this call is for the owner to sort
  out with a refund.

  The code is claimed the way referrals.js claims one: a create of the
  index document inside a transaction, retried on a collision.
*/
async function activate({ uid, email, name, orderId, now, attempts }, options){
  const opts = options || {};
  const db = opts.db || firestore();
  const id = String(uid || "");
  if(!id) return { ok: false, reason: "NO_ACCOUNT" };

  const existing = await partnerFor(id, { db });
  if(existing) return { ok: true, created: false, code: existing.code };

  const at = now == null ? Date.now() : now;
  const tries = Math.max(1, Number(attempts) || 5);
  const partnerRef = db.collection(PARTNERS).doc(id);

  for(let i = 0; i < tries; i++){
    const code = makeCode(name || email, opts.random);
    const indexRef = db.collection(CODES).doc(code);

    const claimed = await db.runTransaction(async (tx) => {
      const taken = await tx.get(indexRef);
      if(taken.exists) return false;
      tx.set(indexRef, { uid: id, created_at: at });
      return true;
    });
    if(!claimed) continue;

    await partnerRef.set({
      code,
      name: String(name || "").slice(0, 80),
      email: normalizeEmail(email),
      status: "active",
      joined_at: at,
      join_order_id: String(orderId || ""),
      clients: 0,
      reports: 0,
      earned: 0,
      paid: 0
    }, { merge: true });

    const address = normalizeEmail(email);
    if(isValidEmail(address)){
      try{
        await db.collection(INVITES).doc(address).set({ joined_uid: id, joined_at: at }, { merge: true });
      }catch(err){ /* the invite is bookkeeping; the partner exists */ }
    }
    return { ok: true, created: true, code };
  }

  throw new Error("Could not allocate a partner code after " + tries + " attempts.");
}

async function lookupCode(code, options){
  const key = normalizeCode(code);
  if(!isValidCode(key)) return null;
  const db = (options || {}).db || firestore();
  const snap = await db.collection(CODES).doc(key).get();
  if(!snap.exists) return null;
  const uid = String((snap.data() || {}).uid || "");
  if(!uid || !(await partnerFor(uid, { db }))) return null;
  return { code: key, uid };
}

/* ------------------------------------------------------------------ */
/* Commission                                                          */
/* ------------------------------------------------------------------ */

/*
  Credit the partner behind a PAID report order, once.

  Every refusal is a named reason and none of them throws, because
  fulfilment calls this for every report sold and most reports have
  nothing to do with a partner.

  Resolves { ok, reason, commission, partnerUid, code }.
*/
async function creditReport({ orderId, sku, amountPaid, clientUid, partnerCode, isDemo, now }, options){
  const db = (options || {}).db || firestore();
  const at = now == null ? Date.now() : now;
  const order = String(orderId || "");
  const client = String(clientUid || "");

  if(!order) return { ok: false, reason: "NO_ORDER" };
  if(!earnsCommission(sku)) return { ok: false, reason: "NOT_ELIGIBLE" };
  if(isDemo) return { ok: false, reason: "DEMO" };

  const commission = commissionFor(amountPaid);
  if(commission <= 0) return { ok: false, reason: "NOTHING_PAID" };

  /*
    Who this client belongs to. An existing binding wins over whatever
    code this order carries: the client was brought in by that partner,
    and a second counsellor's link does not take them over.
  */
  const bindingRef = client ? db.collection(CLIENTS).doc(client) : null;
  let partnerUid = "";
  let code = "";
  if(bindingRef){
    const bound = await bindingRef.get();
    if(bound.exists){
      const b = bound.data() || {};
      partnerUid = String(b.partner_uid || "");
      code = String(b.code || "");
    }
  }
  if(!partnerUid){
    const found = partnerCode ? await lookupCode(partnerCode, { db }) : null;
    if(!found) return { ok: false, reason: "NO_PARTNER" };
    partnerUid = found.uid;
    code = found.code;
  }

  // A partner buying a report on their own link is not a client.
  if(client && partnerUid === client) return { ok: false, reason: "SELF" };

  const earningRef = db.collection(EARNINGS).doc(order);
  const partnerRef = db.collection(PARTNERS).doc(partnerUid);

  return db.runTransaction(async (tx) => {
    const already = await tx.get(earningRef);
    if(already.exists) return { ok: false, reason: "ALREADY_CREDITED" };

    const snap = await tx.get(partnerRef);
    const partner = snap.exists ? (snap.data() || {}) : null;
    if(!partner || partner.status !== "active") return { ok: false, reason: "NO_PARTNER" };

    // Re-read inside the transaction so two orders from one new client
    // cannot both count them as a new client.
    let newClient = false;
    if(bindingRef){
      const bound = await tx.get(bindingRef);
      if(!bound.exists){
        newClient = true;
        tx.set(bindingRef, { code, partner_uid: partnerUid, first_order_id: order, created_at: at });
      }
    }

    tx.set(earningRef, {
      partner_uid: partnerUid,
      code,
      client_uid: client,
      order_id: order,
      sku: String(sku),
      amount_paid: Math.max(0, Number(amountPaid) || 0),
      commission,
      status: "owed",
      created_at: at,
      paid_at: null,
      payout_note: ""
    });

    tx.set(partnerRef, {
      clients: (Number(partner.clients) || 0) + (newClient ? 1 : 0),
      reports: (Number(partner.reports) || 0) + 1,
      earned: (Number(partner.earned) || 0) + commission
    }, { merge: true });

    return { ok: true, reason: "CREDITED", commission, partnerUid, code };
  });
}

/* ------------------------------------------------------------------ */
/* Balances and payouts                                                */
/* ------------------------------------------------------------------ */

function isMatured(row, now){
  return (now - Number(row.created_at || 0)) >= HOLD_MS;
}

/*
  A partner's numbers, computed from their earning rows rather than kept
  as running balances: what can be paid depends on when each report was
  bought, and voiding a row takes effect with no counter to fix up.
*/
async function summary(uid, options){
  const opts = options || {};
  const db = opts.db || firestore();
  const now = opts.now == null ? Date.now() : opts.now;
  const id = String(uid || "");

  const partner = await partnerFor(id, { db });
  if(!partner) return null;

  const rows = await db.collection(EARNINGS).where("partner_uid", "==", id).get();
  let owed = 0, payable = 0, paid = 0, reports = 0;
  rows.forEach(function(row){
    const r = row.data() || {};
    const amount = Number(r.commission) || 0;
    if(r.status === "void") return;
    reports += 1;
    if(r.status === "paid"){ paid += amount; return; }
    owed += amount;
    if(isMatured(r, now)) payable += amount;
  });

  return {
    code: partner.code,
    url: partnerUrl(partner.code),
    name: partner.name || "",
    joined_at: partner.joined_at || null,
    clients: Math.max(0, Number(partner.clients) || 0),
    reports,
    earned: owed + paid,
    paid,
    owed,
    payable,
    clearing: owed - payable,
    commission: COMMISSION_CAP,
    hold_days: Math.round(HOLD_MS / (24 * 60 * 60 * 1000)),
    upi: String(partner.upi || "")
  };
}

async function setUpi({ uid, upi }, options){
  const db = (options || {}).db || firestore();
  const id = String(uid || "");
  if(!(await partnerFor(id, { db }))) return { ok: false, reason: "NOT_PARTNER" };
  const address = normalizeUpi(upi);
  if(!isValidUpi(address)) return { ok: false, reason: "BAD_UPI" };
  await db.collection(PARTNERS).doc(id).set({ upi: address }, { merge: true });
  return { ok: true, upi: address };
}

/*
  Everyone the owner should pay this month: matured, unpaid commission,
  grouped by partner, with the UPI ID to send it to.
*/
async function listPayable(options){
  const opts = options || {};
  const db = opts.db || firestore();
  const now = opts.now == null ? Date.now() : opts.now;

  const rows = await db.collection(EARNINGS).where("status", "==", "owed").get();
  const byPartner = new Map();
  rows.forEach(function(row){
    const r = row.data() || {};
    if(!isMatured(r, now)) return;
    const uid = String(r.partner_uid || "");
    const entry = byPartner.get(uid) || { uid, code: r.code, amount: 0, reports: 0 };
    entry.amount += Number(r.commission) || 0;
    entry.reports += 1;
    byPartner.set(uid, entry);
  });

  const out = [];
  for(const entry of byPartner.values()){
    const snap = await db.collection(PARTNERS).doc(entry.uid).get();
    const p = snap.exists ? (snap.data() || {}) : {};
    out.push(Object.assign(entry, { name: p.name || "", email: p.email || "", upi: p.upi || "" }));
  }
  return out.sort(function(a, b){ return b.amount - a.amount; });
}

/*
  Mark a partner's matured commission as paid, after the owner has made
  the transfer. Only rows still "owed" inside the transaction are
  touched, so running this twice cannot pay twice.
*/
async function settle({ uid, note, now }, options){
  const opts = options || {};
  const db = opts.db || firestore();
  const at = now == null ? Date.now() : now;
  const id = String(uid || "");
  const ref = String(note || "").trim().slice(0, 300);
  if(!ref) return { ok: false, reason: "NOTE_REQUIRED" };

  // Queried outside the transaction: a Firestore transaction may not run
  // a query. Each row is re-read inside it, which is what guards the race.
  const rows = await db.collection(EARNINGS).where("partner_uid", "==", id).get();
  const ids = [];
  rows.forEach(function(row){
    const r = row.data() || {};
    if(r.status === "owed" && isMatured(r, at)) ids.push(row.id);
  });
  if(!ids.length) return { ok: false, reason: "NOTHING_PAYABLE" };

  const partnerRef = db.collection(PARTNERS).doc(id);
  return db.runTransaction(async (tx) => {
    const snaps = [];
    for(const rowId of ids) snaps.push(await tx.get(db.collection(EARNINGS).doc(rowId)));
    const partnerSnap = await tx.get(partnerRef);
    const partner = partnerSnap.exists ? (partnerSnap.data() || {}) : {};

    let amount = 0, count = 0;
    for(const snap of snaps){
      const r = snap.data() || {};
      if(!snap.exists || r.status !== "owed") continue;
      amount += Number(r.commission) || 0;
      count += 1;
      tx.set(db.collection(EARNINGS).doc(snap.id), { status: "paid", paid_at: at, payout_note: ref }, { merge: true });
    }
    if(!count) return { ok: false, reason: "NOTHING_PAYABLE" };

    tx.set(partnerRef, { paid: (Number(partner.paid) || 0) + amount }, { merge: true });
    return { ok: true, amount, count };
  });
}

/*
  Cancel one commission — a refunded report, or a client who turns out
  not to be real. Only an unpaid row can be voided; money already sent is
  a conversation, not a ledger edit.
*/
async function voidEarning({ orderId, note }, options){
  const db = (options || {}).db || firestore();
  const earningRef = db.collection(EARNINGS).doc(String(orderId || ""));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(earningRef);
    if(!snap.exists) return { ok: false, reason: "NOT_FOUND" };
    const r = snap.data() || {};
    if(r.status === "paid") return { ok: false, reason: "ALREADY_PAID" };
    if(r.status === "void") return { ok: false, reason: "ALREADY_VOID" };

    const partnerRef = db.collection(PARTNERS).doc(String(r.partner_uid || ""));
    const partnerSnap = await tx.get(partnerRef);
    const partner = partnerSnap.exists ? (partnerSnap.data() || {}) : {};
    const amount = Number(r.commission) || 0;

    tx.set(earningRef, { status: "void", payout_note: String(note || "").slice(0, 300) }, { merge: true });
    tx.set(partnerRef, {
      reports: Math.max(0, (Number(partner.reports) || 0) - 1),
      earned: Math.max(0, (Number(partner.earned) || 0) - amount)
    }, { merge: true });
    return { ok: true, amount, partnerUid: r.partner_uid };
  });
}

async function listPartners(options){
  const db = (options || {}).db || firestore();
  const rows = await db.collection(PARTNERS).get();
  const out = [];
  rows.forEach(function(row){ out.push(Object.assign({ uid: row.id }, row.data())); });
  return out.sort(function(a, b){ return (a.joined_at || 0) - (b.joined_at || 0); });
}

module.exports = {
  PARTNERS,
  CODES,
  INVITES,
  CLIENTS,
  EARNINGS,
  JOIN_SKU,
  COMMISSION_SKUS,
  COMMISSION_RATE,
  COMMISSION_CAP,
  HOLD_MS,
  partnerUrl,
  commissionFor,
  earnsCommission,
  normalizeEmail,
  isValidEmail,
  isEnabled,
  approve,
  revoke,
  partnerFor,
  joinState,
  canJoin,
  activate,
  lookupCode,
  creditReport,
  summary,
  setUpi,
  listPayable,
  settle,
  voidEarning,
  listPartners
};
