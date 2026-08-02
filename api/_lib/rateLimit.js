/*
  Lightweight per-IP rate limiting, backed by Firestore (reuses the same
  Firebase project/credentials as the entitlement system — no new infra).

  Fails OPEN: if Firebase isn't configured yet, or the check errors for
  any reason, the request is allowed through rather than blocked. A
  broken rate limiter should never be able to take down checkout or lead
  capture — it's a defence against abuse, not a critical dependency.
*/

const { db } = require("./firebaseAdmin");

const COLLECTION = "rateLimits";

function clientKey(req){
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  const ip = forwarded.split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "unknown";
  return ip;
}

// Returns true if the request should be allowed, false if it should be
// rejected (429). `key` should already include the endpoint name so
// different endpoints don't share a budget.
async function checkRateLimit({ key, limit, windowMs }){
  try{
    const firestore = db();
    const ref = firestore.collection(COLLECTION).doc(key);
    const now = Date.now();

    return await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;

      if(!data || (now - Number(data.windowStart || 0)) > windowMs){
        tx.set(ref, { windowStart: now, count: 1 });
        return true;
      }

      const nextCount = Number(data.count || 0) + 1;
      tx.set(ref, { windowStart: data.windowStart, count: nextCount }, { merge: true });
      return nextCount <= limit;
    });
  }catch(err){
    return true;
  }
}

module.exports = { checkRateLimit, clientKey };
