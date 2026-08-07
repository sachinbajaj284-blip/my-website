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
*/

const { db } = require("./firebaseAdmin");

const COLLECTION = "entitlements";

// create-order.js sends this placeholder to Cashfree for guest checkouts
// (phone is optional for parents-handbook/intro-session). It is not a real
// customer phone number — treating it as one would let restore-access
// return every phone-less guest's purchase to anyone who queries it.
const GUEST_PLACEHOLDER_PHONE = "9999999999";

function normalizePhone(phone){
  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
  return digits === GUEST_PLACEHOLDER_PHONE ? "" : digits;
}

function normalizeEmail(email){
  return String(email || "").trim().toLowerCase();
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

module.exports = { recordPaidEntitlement, findPaidEntitlements, claimPaidNotification, normalizePhone, normalizeEmail };
