/*
  Delete the Firestore collections the AI agent wrote, and nothing else.

    node tools/purge-agent-data.mjs                 count what is there
    node tools/purge-agent-data.mjs --delete        actually delete it

  Needs the same three variables the rest of the server uses:
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.

  ── Why this file exists ──

  The agent work was removed from the codebase, but removing code does
  not remove rows. Anything written while those features were live is
  still in Firestore, and this deletes it.

  ── Why it is written defensively ──

  This is the one irreversible thing in this repository. There is no
  undo, no soft delete and no export first, so the design assumes a
  mistake will eventually be made and tries to make the expensive
  mistakes impossible rather than unlikely.

  Three rules:

  1. Only the six collections below are touched. They are listed
     explicitly, never derived by listing what happens to be in the
     database, because a derived list grows silently when somebody adds
     a collection and would one day include something that matters.

  2. Everything that pays the bills is named in KEEP and checked against
     the delete list at startup. If the two ever overlap this refuses to
     run at all. That check exists because "assessments" and
     "entitlements" are four characters apart in a hurry.

  3. It counts before it deletes and prints what it found. Deleting is
     opt-in with --delete; running it bare tells you what would go.

  Delete this file once the purge is done. A tool that empties
  collections has no business sitting in a repository indefinitely.
*/

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* Written only by the removed agent and assessment code. */
const PURGE = [
  { name: "assessments",    what: "saved free-assessment results" },
  { name: "conversations",  what: "WhatsApp and web chat transcripts" },
  { name: "agentLinks",     what: "phone-number to account links" },
  { name: "agentLinkCodes", what: "six-character linking codes" },
  { name: "reports",        what: "drafted and signed report prose" },
  { name: "cohorts",        what: "school cohort records" }
];

/*
  Live business data. Named here so the guard below can prove the delete
  list does not contain any of it.
*/
const KEEP = [
  "coupons", "couponRedemptions", "couponCustomers",
  "entitlements", "manualGrantRefs",
  "rateLimits"
];

const doDelete = process.argv.includes("--delete");
const BATCH = 400;

function fail(msg){
  console.error("\n" + msg + "\n");
  process.exit(1);
}

// ── guard: the two lists must not intersect ───────────────────────────
const overlap = PURGE.map(c => c.name).filter(n => KEEP.includes(n));
if(overlap.length){
  fail("REFUSING TO RUN: these are on both the delete and keep lists: " + overlap.join(", "));
}

if(!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY){
  fail("FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set.");
}

const { db } = require("../api/_lib/firebaseAdmin.js");
const firestore = db();

console.log("Project: " + process.env.FIREBASE_PROJECT_ID);
console.log(doDelete ? "Mode:    DELETE — this cannot be undone\n" : "Mode:    count only (pass --delete to remove)\n");
console.log("Never touched: " + KEEP.join(", ") + "\n");

let total = 0;
const counts = [];

for(const { name, what } of PURGE){
  const snap = await firestore.collection(name).get();
  counts.push({ name, size: snap.size });
  total += snap.size;
  console.log("  " + String(snap.size).padStart(6) + "  " + name.padEnd(16) + what);
}

console.log("\n  " + String(total).padStart(6) + "  documents in total");

if(!doDelete){
  console.log("\nNothing was deleted. Re-run with --delete to remove them.");
  process.exit(0);
}

if(total === 0){
  console.log("\nNothing to delete.");
  process.exit(0);
}

console.log("\nDeleting…\n");

for(const { name } of PURGE){
  let removed = 0;
  /* Batched, because a single commit is capped and a collection of
     unknown size should not decide whether this works. */
  for(;;){
    const snap = await firestore.collection(name).limit(BATCH).get();
    if(snap.empty) break;
    const batch = firestore.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    removed += snap.size;
  }
  console.log("  " + String(removed).padStart(6) + "  " + name + " emptied");
}

// ── verify rather than assume ─────────────────────────────────────────
console.log("");
let left = 0;
for(const { name } of PURGE){
  const snap = await firestore.collection(name).limit(1).get();
  if(!snap.empty){
    console.log("  ! " + name + " still has documents");
    left++;
  }
}
console.log(left ? "\nSome collections are not empty — re-run." : "\nDone. All six collections are empty.");
