/*
  The payout queue — the only thing that decides that money leaves.

    node tools/referral-payouts.mjs                       # what is owed
    node tools/referral-payouts.mjs --list paid
    node tools/referral-payouts.mjs --pay u1_1750000000000 --note "UTR 402913"
    node tools/referral-payouts.mjs --reject u1_1750000000000 --note "same device as referrer"

  The flow is deliberately two-handed: this prints a UPI ID and an
  amount, YOU make the transfer in your banking app, and then you come
  back and mark it paid. Nothing here talks to a payment rail.

  That is not a missing feature. An automated payout API needs a funded
  balance behind a key that lives in the same environment as the website;
  a bug or a farm that beats the other controls then drains a bank
  account instead of over-issuing a discount, and transferred money does
  not come back. The manual step is the last place a human sees the
  numbers before they become irreversible — so look at them.

  What to look at before paying:
    * A referrer whose friends all joined within a few minutes.
    * The same UPI ID appearing under two different referrers.
    * Anyone at the cap within a day of signing up.
  --reject returns the money to the student's payable balance rather than
  taking it away, so a rejection you get wrong is recoverable. Paying
  someone you should not have is not.

  Needs the same three variables the rest of the server code uses:
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
*/

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function arg(name){
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? (process.argv[i + 1] || "") : null;
}
function has(name){ return process.argv.includes("--" + name); }

function inr(n){ return "₹" + (Number(n) || 0).toLocaleString("en-IN"); }

function when(ts){
  if(!ts) return "—";
  return new Date(Number(ts)).toISOString().replace("T", " ").slice(0, 16);
}

function fail(msg){
  console.error("\n  " + msg + "\n");
  process.exit(1);
}

if(!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY){
  fail("FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not set.");
}

const referrals = require("../api/_lib/referrals.js");

async function list(status){
  const rows = await referrals.listPayouts(status);
  if(!rows.length){
    console.log("\n  Nothing " + status + ".\n");
    return;
  }

  console.log("\n  " + rows.length + " " + status + ":\n");
  let total = 0;
  for(const row of rows){
    total += Number(row.amount) || 0;
    // The referrer's own numbers alongside the request, because the
    // decision is about the pattern and not about this one row.
    let summary = null;
    try{ summary = await referrals.payoutSummary(row.uid); }catch(e){ summary = null; }

    console.log("  " + row.id);
    console.log("    " + inr(row.amount) + "  ->  " + row.upi);
    console.log("    code " + (row.code || "?") + "   requested " + when(row.requested_at)
      + (row.settled_at ? "   settled " + when(row.settled_at) : ""));
    if(summary){
      console.log("    lifetime: " + inr(summary.earned) + " earned, "
        + inr(summary.paid) + " already paid");
    }
    if(row.note) console.log("    note: " + row.note);
    console.log("");
  }
  console.log("  Total " + status + ": " + inr(total) + "\n");

  if(status === "pending"){
    console.log("  Pay each UPI ID above, then mark it:");
    console.log("    node tools/referral-payouts.mjs --pay <id> --note \"UTR ...\"\n");
  }
}

async function settle(id, status){
  const note = arg("note") || "";
  if(status === "paid" && !note){
    // A transfer with no reference is one you cannot reconcile later.
    fail("Refusing to mark paid without --note. Put the UTR or transaction reference in it.");
  }

  const result = await referrals.settlePayout({ id, status, note });
  if(!result.ok){
    if(result.reason === "NOT_FOUND") fail("No payout with id " + id + ".");
    if(result.reason === "ALREADY_SETTLED") fail("That payout is already " + result.status + ".");
    fail("Could not settle " + id + ": " + result.reason);
  }

  console.log("\n  " + id + " -> " + status + "  (" + inr(result.amount) + ")");
  if(status === "rejected"){
    console.log("  Returned to the student's payable balance — they can ask again.");
  }
  console.log("");
}

const payId = arg("pay");
const rejectId = arg("reject");

if(payId){
  await settle(payId, "paid");
}else if(rejectId){
  await settle(rejectId, "rejected");
}else if(has("pay") || has("reject")){
  fail("--pay and --reject need a payout id. Run with no arguments to see them.");
}else{
  await list(arg("list") || "pending");
}

process.exit(0);
