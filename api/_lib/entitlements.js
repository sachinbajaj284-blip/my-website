/*
  Server-side purchase records ("entitlements").

  This is the source of truth for "who paid for what" — written only from
  server code (via Firebase Admin, which bypasses Firestore security
  rules) after Cashfree itself confirms a PAID order. The client never
  writes to this collection directly, so it can't be forged from devtools
  the way localStorage can.

  Firestore layout:
    entitlements/{order_id} = {
      sku, orderId, status, amount, phone, email, name,
      grantedAt (first PAID confirmation), updatedAt (server timestamp)
    }

  Manual grants (money that arrived off-platform — a direct UPI or bank
  transfer) live in the same collection with the same shape, so every
  reader — restore-access, the coupon rules' first_time_only check,
  reconciliation — sees one list of who paid rather than two. They carry
  three extra fields, `source: "manual"`, `reference` and `note`, which
  say where the money came from and make them separable in the console.
  Written by /api/entitlements/grant. See docs/manual-entitlements.md.
*/

const crypto = require("crypto");
const { db } = require("./firebaseAdmin");
const { normalizePhone, normalizeEmail } = require("./identity");

const COLLECTION = "entitlements";

/*
  Manual order ids.

  A manual grant needs an order id because everything downstream is keyed
  on one: entitlements/{order_id}, restore-access's reply, and the
  localStorage entry that lumeCashfreeVerifyAccess re-checks.

  It is random rather than derived from the payment reference because
  /api/cashfree/order-status is public and takes nothing but an order id.
  A readable id like "manual_UPI12345" would be guessable, and guessing
  one would unlock paid content for the guesser. 16 random bytes is not.

  The prefix is what order-status matches on to know it should resolve
  this from Firestore instead of asking Cashfree about an order Cashfree
  has never heard of. Total length is 39 characters, inside the
  /^[A-Za-z0-9_-]{3,45}$/ that endpoint validates against.
*/
const MANUAL_ORDER_PREFIX = "manual_";
const REFERENCE_COLLECTION = "manualGrantRefs";

function isManualOrderId(orderId){
  return String(orderId || "").startsWith(MANUAL_ORDER_PREFIX);
}

function newManualOrderId(){
  return MANUAL_ORDER_PREFIX + crypto.randomBytes(16).toString("hex");
}

// The bank/UPI reference for the transfer, normalised so the same payment
// typed twice with different spacing is recognised as one payment. This
// is the idempotency key for a grant, not a secret — see above.
function normalizeReference(reference){
  return String(reference == null ? "" : reference)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 64);
}

// Idempotent: safe to call every time order-status confirms PAID.
async function recordPaidEntitlement(details){
  const firestore = db();
  const orderId = String(details.orderId || "");
  if(!orderId) return;

  const phone = normalizePhone(details.phone);
  const email = normalizeEmail(details.email);

  await firestore.collection(COLLECTION).doc(orderId).set({
    orderId: orderId,
    sku: String(details.sku || ""),
    status: "PAID",
    amount: details.amount != null ? Number(details.amount) : null,
    currency: details.currency || "INR",
    phone: phone || null,
    email: email || null,
    name: details.name || null,
    grantedAt: details.grantedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/*
  Records money that arrived outside the payment gateway.

  Idempotent on the payment reference, not on the order id: the caller
  doesn't know the order id yet (it's generated here), and the thing that
  must not be double-granted is the transfer. `manualGrantRefs/{REF}`
  is the claim — the first caller for a reference mints the order id, and
  every later call for the same reference gets that same grant back with
  created:false rather than a second entitlement.

  Returns { orderId, reference, created }.
*/
async function recordManualEntitlement(details){
  const firestore = db();
  const reference = normalizeReference(details.reference);
  if(!reference) throw new Error("A payment reference is required for a manual grant.");

  const sku = String(details.sku || "");
  if(!sku) throw new Error("A sku is required for a manual grant.");

  const phone = normalizePhone(details.phone);
  const email = normalizeEmail(details.email);
  if(!phone && !email) throw new Error("A manual grant needs a phone or an email to attach the purchase to.");

  const refDoc = firestore.collection(REFERENCE_COLLECTION).doc(reference);
  const now = new Date().toISOString();

  // Claim the reference. Whoever wins mints the order id; everyone else
  // reads the winner's.
  const claim = await firestore.runTransaction(async tx => {
    const snap = await tx.get(refDoc);
    if(snap.exists && snap.data().orderId){
      return { orderId: String(snap.data().orderId), created: false };
    }
    const orderId = newManualOrderId();
    tx.set(refDoc, { reference: reference, orderId: orderId, sku: sku, createdAt: now }, { merge: true });
    return { orderId: orderId, created: true };
  });

  if(claim.created){
    await firestore.collection(COLLECTION).doc(claim.orderId).set({
      orderId: claim.orderId,
      sku: sku,
      status: "PAID",
      amount: details.amount != null ? Number(details.amount) : null,
      currency: details.currency || "INR",
      phone: phone || null,
      email: email || null,
      name: details.name || null,
      // Provenance. `source` is what separates these from gateway orders
      // when reconciling; without it a manual grant is indistinguishable
      // from a Cashfree payment that never reached the bank.
      source: "manual",
      reference: reference,
      note: details.note ? String(details.note).slice(0, 500) : null,
      grantedAt: now,
      updatedAt: now
    }, { merge: true });
  }

  return { orderId: claim.orderId, reference: reference, created: claim.created };
}

// Reads an existing manual grant for a reference without writing one, so
// the grant endpoint's dry_run can report "this transfer is already
// recorded" without recording it.
async function peekManualGrant(reference){
  const normalized = normalizeReference(reference);
  if(!normalized) return null;
  const snap = await db().collection(REFERENCE_COLLECTION).doc(normalized).get();
  if(!snap.exists || !snap.data().orderId) return null;
  return { orderId: String(snap.data().orderId), reference: normalized, sku: snap.data().sku || "" };
}

/*
  Resolves one entitlement by order id, for order-status to answer with
  when the id is a manual grant rather than a Cashfree order.

  Returns null for anything that isn't a live manual grant — a Cashfree
  order id, an unknown id, or a manual grant that has since been revoked
  (status set to anything but PAID in the console). Callers must treat
  null as "no access", never as "couldn't check".
*/
async function findManualEntitlement(orderId){
  const id = String(orderId || "");
  if(!isManualOrderId(id)) return null;
  const snap = await db().collection(COLLECTION).doc(id).get();
  if(!snap.exists) return null;
  const d = snap.data();
  if(String(d.status || "").toUpperCase() !== "PAID") return null;
  if(String(d.source || "") !== "manual") return null;
  return d;
}

// Looks up prior PAID entitlements by phone and/or email, for the
// "restore access on a new device" flow. Returns a de-duplicated
// (by sku) array, newest first.
async function findPaidEntitlements({ phone, email }){
  const firestore = db();
  const p = normalizePhone(phone);
  const e = normalizeEmail(email);
  const found = new Map();

  async function collect(field, value){
    if(!value) return;
    const snap = await firestore.collection(COLLECTION).where(field, "==", value).get();
    snap.forEach(doc => {
      const d = doc.data();
      if(String(d.status || "").toUpperCase() !== "PAID") return;
      const existing = found.get(d.sku);
      if(!existing || String(d.updatedAt || "") > String(existing.updatedAt || "")){
        found.set(d.sku, d);
      }
    });
  }

  await collect("phone", p);
  await collect("email", e);

  return Array.from(found.values())
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .map(d => ({ sku: d.sku, order_id: d.orderId, amount: d.amount, grantedAt: d.grantedAt }));
}

/*
  Claims the right to send the owner exactly one "new paid booking"
  notification for this order.

  order-status is polled — the return page checks once per load, the
  payment modal checks on demand, and a client who refreshes checks again
  — so without a claim every refresh would post another row. The
  transaction makes the first caller the only winner.

  Fails open: if Firestore is unavailable we return true and let the
  notification through. A duplicate row the owner can ignore is a much
  cheaper mistake than a paid booking nobody hears about, and the Apps
  Script de-duplicates on orderId anyway.
*/
async function claimPaidNotification(orderId){
  const id = String(orderId || "");
  if(!id) return false;
  try{
    const ref = db().collection(COLLECTION).doc(id);
    return await db().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if(snap.exists && snap.data().ownerNotifiedAt) return false;
      tx.set(ref, { ownerNotifiedAt: new Date().toISOString() }, { merge: true });
      return true;
    });
  }catch(err){
    console.error("[lume entitlements] notification claim failed, sending anyway:", String(err && err.message || err));
    return true;
  }
}

module.exports = {
  recordPaidEntitlement, findPaidEntitlements, claimPaidNotification,
  recordManualEntitlement, peekManualGrant, findManualEntitlement,
  isManualOrderId, normalizeReference, MANUAL_ORDER_PREFIX,
  normalizePhone, normalizeEmail
};
