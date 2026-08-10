/*
  How a customer is identified, and nothing else.

  These two normalisers decide when two purchases belong to the same
  person — for restoring access on a new device, and for "one use per
  customer" on a coupon. They live in their own module because they are
  pure: entitlements.js and coupons.js both need them, and coupons.js
  must be loadable when Firebase is not configured at all (it falls back
  to a built-in catalogue). Importing entitlements.js for them would drag
  firebase-admin in at module load and take that fallback away.
*/

// create-order.js sends this placeholder to Cashfree for guest checkouts
// (phone is optional for parents-handbook). It is not a real customer
// phone number — treating it as one would let restore-access return every
// phone-less guest's purchase to anyone who queries it, and would make
// every guest look like the same person to a per-customer coupon limit.
const GUEST_PLACEHOLDER_PHONE = "9999999999";

function normalizePhone(phone){
  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
  return digits === GUEST_PLACEHOLDER_PHONE ? "" : digits;
}

function normalizeEmail(email){
  return String(email || "").trim().toLowerCase();
}

module.exports = { GUEST_PLACEHOLDER_PHONE, normalizePhone, normalizeEmail };
