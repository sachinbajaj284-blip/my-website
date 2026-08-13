/*
  Writes the coupon catalogue from api/_lib/coupons.js into Firestore.

    node tools/seed-coupons.mjs --dry-run     show what would be written
    node tools/seed-coupons.mjs               write it

  Needs the same three variables the rest of the server code uses:
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.

  The writing and verification live in seedCoupons() in
  api/_lib/coupons.js, because POST /api/coupons/seed does the same job
  for anyone without a local checkout — two copies of "what a coupon
  document should contain" is exactly the drift that would let the two
  disagree about a price. This file is the terminal-friendly face of it.

  Seeding is optional. The site prices correctly on the built-in
  catalogue alone, and the per-customer limits work unseeded — running
  this makes the offers editable in the Firebase console without a
  deploy.

  Re-running is safe: times_used is carried forward, so a code already
  redeemed 12 times still reads 12 after a re-seed.
*/

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DEFAULT_COUPONS, COLLECTION, seedCoupons } = require("../api/_lib/coupons.js");

const dryRun = process.argv.includes("--dry-run");

// Whether a code is LIVE is the thing you actually want to see here, so it
// leads every row — a catalogue listing that made a switched-off code look
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

const result = await seedCoupons({});

if(!result.configured){
  console.error(result.message);
  console.error("Set the three FIREBASE_* variables, or keep using the built-in catalogue.");
  process.exit(1);
}

result.written.forEach(function(doc){
  console.log(doc.action.padEnd(8) + doc.code + " (times_used: " + doc.times_used + ")");
});

if(!result.ok){
  console.error("\n✗ " + (result.problems.length || 1) + " problem(s):");
  (result.problems.length ? result.problems : [result.message]).forEach(function(p){
    console.error("    " + p);
  });
  console.error("\nFix before relying on it.\n");
  process.exit(1);
}

console.log("\n✓ all " + result.written.length + " documents verified in " + COLLECTION + "/");
console.log("✓ live at checkout: " + (result.live.join(", ") || "(none)"));
console.log("✓ offers are now editable in the Firebase console without a deploy\n");
process.exit(0);
