/*
  Writes the coupon catalogue from api/_lib/coupons.js into Firestore.

    node tools/seed-coupons.mjs --dry-run     show what would be written
    node tools/seed-coupons.mjs               write it

  Needs the same three variables the rest of the server code uses:
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.

  Seeding is optional. The site works on the built-in catalogue alone —
  running this just makes the offers editable in the Firebase console
  without a deploy, and gives times_used somewhere durable to live.

  Re-running is safe: times_used is never overwritten, so a code that has
  already been redeemed 12 times still reads 12 after a re-seed.
*/

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DEFAULT_COUPONS, COLLECTION } = require("../api/_lib/coupons.js");

const dryRun = process.argv.includes("--dry-run");

// Whether a code is LIVE is the thing you actually want to see here, so it
// leads every row — a catalogue listing that made an switched-off code look
// identical to a running one would be worse than no listing at all.
function line(c){
  const state = c.is_active === false ? "  off " : "> LIVE";
  const value = c.discount_type === "percentage" ? c.discount_value + "%" : "₹" + c.discount_value;
  const packs = c.applicable_packs.length ? c.applicable_packs.join(", ") : "(ALL PACKS)";
  const limits = [
    c.usage_limit == null ? "unlimited" : c.usage_limit + " total",
    c.per_customer_limit != null ? c.per_customer_limit + "/customer" : null,
    c.first_time_only ? "first-time only" : null
  ].filter(Boolean).join(", ");
  return " " + state + "  " + c.code.padEnd(11) + value.padEnd(6) +
    (limits.length > 38 ? limits + "  " : limits.padEnd(40)) + packs;
}

const live = DEFAULT_COUPONS.filter(function(c){ return c.is_active !== false; });
console.log("\nCoupon catalogue — " + live.length + " live of " + DEFAULT_COUPONS.length + "\n");
DEFAULT_COUPONS.forEach(function(c){ console.log(line(c)); });
console.log("\nEverything not marked LIVE is refused at checkout; those SKUs sell at list price.\n");

if(dryRun){
  console.log("--dry-run: nothing written.\n");
  process.exit(0);
}

const { db } = require("../api/_lib/firebaseAdmin.js");

let firestore;
try{
  firestore = db();
}catch(err){
  console.error("Firebase Admin is not configured: " + err.message);
  console.error("Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or keep using the built-in catalogue.");
  process.exit(1);
}

let written = 0;
for(const coupon of DEFAULT_COUPONS){
  const ref = firestore.collection(COLLECTION).doc(coupon.code);
  const existing = await ref.get();

  // Everything except the redemption counter is replaced; times_used is
  // carried forward so a re-seed can never hand a used-up code back out.
  const payload = Object.assign({}, coupon, {
    times_used: existing.exists ? Number(existing.data().times_used) || 0 : 0,
    updatedAt: new Date().toISOString()
  });

  await ref.set(payload, { merge: true });
  written += 1;
  console.log((existing.exists ? "updated " : "created ") + coupon.code +
    " (times_used: " + payload.times_used + ")");
}

console.log("\nDone — " + written + " coupon documents in " + COLLECTION + "/.\n");
process.exit(0);
