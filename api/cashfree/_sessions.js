/*
  Server-side session tracking for the "₹49 first session only" offer.

  A returning client must pay the regular ₹499, not the ₹49 first-session
  price. The authoritative signal lives here: a phone-keyed Firestore
  document written the moment a session payment is confirmed PAID.

    hasPaidSession(phone)  -> true  : this phone has a confirmed session
                              false : no record yet (treat as first session)
                              null  : unknown (Firestore unavailable) — the
                                      caller decides how to fall back
    recordPaidSession(...) -> writes/merges the phone's paid-session record

  Collection: "sessionCustomers" (doc id = 10-digit phone). Overridable
  with LUME_SESSION_CUSTOMERS_COLLECTION.
*/

const { getDb, fieldValue } = require("./_firebase-admin");

const COLLECTION = process.env.LUME_SESSION_CUSTOMERS_COLLECTION || "sessionCustomers";

// SKUs that count as "a session already taken".
const SESSION_SKUS = ["intro-session", "wellness-session"];

function isSessionSku(sku){
  return SESSION_SKUS.indexOf(String(sku || "")) !== -1;
}

function normPhone(phone){
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

// Firestore map keys cannot contain . $ [ ] / # — sanitise an order id.
function safeKey(orderId){
  return String(orderId || "").replace(/[.$\[\]/#]/g, "_");
}

async function hasPaidSession(phone){
  const p = normPhone(phone);
  if(p.length < 10){ return false; }
  const db = getDb();
  if(!db){ return null; }
  try{
    const snap = await db.collection(COLLECTION).doc(p).get();
    return snap.exists === true;
  }catch(err){
    console.warn("[sessions] lookup failed:", err.message);
    return null;
  }
}

async function recordPaidSession(phone, info){
  const p = normPhone(phone);
  if(p.length < 10){ return false; }
  const db = getDb();
  const FV = fieldValue();
  if(!db || !FV){ return false; }

  info = info || {};
  const orderId = String(info.orderId || "");
  try{
    const ref = db.collection(COLLECTION).doc(p);
    const payload = {
      phone: p,
      lastOrderId: orderId,
      lastSku: info.sku || "",
      lastAmount: (info.amount != null ? Number(info.amount) : null),
      lastPaidAt: FV.serverTimestamp(),
      updatedAt: FV.serverTimestamp(),
      paidCount: FV.increment(1)
    };
    // Nested map merge keeps this idempotent-ish: re-recording the same
    // order just overwrites its own key rather than adding a new one.
    if(orderId){
      payload.orders = {};
      payload.orders[safeKey(orderId)] = { sku: info.sku || "", amount: (info.amount != null ? Number(info.amount) : null), at: FV.serverTimestamp() };
    }
    await ref.set(payload, { merge: true });
    return true;
  }catch(err){
    console.warn("[sessions] record failed:", err.message);
    return false;
  }
}

module.exports = { hasPaidSession, recordPaidSession, isSessionSku, normPhone, SESSION_SKUS };
