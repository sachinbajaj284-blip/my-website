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
      source (null for a sale — see below),
      grantedAt (first PAID confirmation), updatedAt (server timestamp)
    }

  `source` is the field to filter on when adding up what was actually
  earned: null is an ordinary sale through the gateway, "manual" is money
  that arrived off-platform, and "demo" is a ₹1 demonstration order placed
  with a demo coupon — real access, deliberately not revenue. See
  docs/coupons.md (LUMEDEMO) and docs/manual-entitlements.md.

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

/*
  Idempotent: safe to call every time a payment is confirmed — and it is
  called a lot, because order-status is polled by the browser and the
  webhook is retried by Cashfree.

  `grantedAt` is written once and then left alone. It used to be stamped
  with the current time on every call, which meant it drifted forward with
  each poll and recorded "the last time we checked" rather than when the
  customer actually got access. That is the field restore-access hands
  back and the one you would reach for to answer "when did they buy this",
  so it has to mean what it says. The rest of the record is refreshed,
  since a later confirmation carries the better copy of it.

  Done in a transaction so two confirmations racing — a poll and a webhook
  for the same payment, which is now the normal case — cannot both decide
  they are the first.
*/
async function recordPaidEntitlement(details){
  const firestore = db();
  const orderId = String(details.orderId || "");
  if(!orderId) return;

  const phone = normalizePhone(details.phone);
  const email = normalizeEmail(details.email);
  const now = new Date().toISOString();
  const ref = firestore.collection(COLLECTION).doc(orderId);

  await firestore.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() || {}) : {};
    tx.set(ref, {
      orderId: orderId,
      sku: String(details.sku || ""),
      status: "PAID",
      amount: details.amount != null ? Number(details.amount) : null,
      currency: details.currency || "INR",
      phone: phone || null,
      email: email || null,
      name: details.name || null,
      // The Firebase account that bought this, when the order carried one.
      uid: details.uid ? String(details.uid) : null,
      /*
        Where this record came from, and the one field that says whether
        the money is income.

        null for an ordinary gateway sale, "manual" for a direct transfer
        (written by recordManualEntitlement below), "demo" for a ₹1
        demonstration order — fulfilment passes that when the order carries
        the demo tag create-order stamps from a coupon marked is_demo.

        Written on every confirmation rather than only the first, because
        unlike grantedAt it is not a fact about when something happened: it
        is what the order IS, and both callers derive it from the same
        order tags, so a later confirmation cannot disagree with an earlier
        one about it.
      */
      source: details.source ? String(details.source) : null,
      grantedAt: existing.grantedAt || details.grantedAt || now,
      updatedAt: now
    }, { merge: true });
  });
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

/*
  Looks up prior PAID entitlements for the "restore access on a new
  device" flow. Returns a de-duplicated (by sku) array, newest first.

  `uid` is the one to match on wherever there is one. It is the Firebase
  account that paid, stamped onto the order by create-order.js from a
  verified token and never from anything the browser typed — so it
  survives the very things that break the other two keys: paying with a
  work email and signing in with a personal one, a typo in the checkout
  form, a phone number entered with a country code one time and without
  it the next.

  It was being written by recordPaidEntitlement and then never read,
  which is how someone could pay while signed in, verify their email,
  and still be told we had no record of their purchase.

  phone and email stay, because orders placed before accounts were
  required carry no uid at all.
*/
async function findPaidEntitlements({ phone, email, uid }){
  const firestore = db();
  const p = normalizePhone(phone);
  const e = normalizeEmail(email);
  const u = uid ? String(uid) : "";
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

  await collect("uid", u);
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
