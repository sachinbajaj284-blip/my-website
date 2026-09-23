/*
  The partner programme, from the owner's side.

    node tools/partners.mjs --approve them@gmail.com --note "vetting call 24 Sep"
    node tools/partners.mjs --revoke them@gmail.com --note "changed their mind"
    node tools/partners.mjs --list                   # every partner and their numbers
    node tools/partners.mjs                          # what is owed this month
    node tools/partners.mjs --pay <uid> --note "UTR 402913"
    node tools/partners.mjs --void <order_id> --note "report refunded"

  --approve is what lets a counsellor pay the ₹1,999 joining fee. Use the
  Google account email they will sign in with — ask for it on the
  vetting call. Nothing else opens the joining fee.

  Paying is two-handed, like tools/referral-payouts.mjs: this prints a UPI
  ID and an amount, YOU make the transfer in your banking app, then you
  come back and mark it paid. Nothing here talks to a payment rail.

  Before paying, look for:
    * A partner whose "clients" all bought within minutes of each other.
    * The same UPI ID under two partners.
    * Reports bought by a partner's own family or second account.
  --void cancels one unpaid commission; money already sent is not
  touched by this tool.

  Needs FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
*/

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function arg(name){
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? (process.argv[i + 1] || "") : null;
}

function inr(n){ return "₹" + (Number(n) || 0).toLocaleString("en-IN"); }

function when(ts){
  if(!ts) return "—";
  return new Date(Number(ts)).toISOString().slice(0, 10);
}

function fail(msg){
  console.error("\n  " + msg + "\n");
  process.exit(1);
}

if(!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY){
  fail("FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not set.");
}

const partners = require("../api/_lib/partners.js");

async function approve(email){
  const result = await partners.approve({ email, note: arg("note") || "" });
  if(!result.ok) fail("That doesn't look like an email address: " + email);
  console.log("\n  Approved " + result.email + ".");
  console.log("  They can now sign in on https://lumelive.co.in/partner-dashboard.html with that Google account and pay the joining fee.\n");
}

async function revoke(email){
  const result = await partners.revoke({ email, note: arg("note") || "" });
  if(!result.ok) fail("No approval found for " + email + ".");
  console.log("\n  Revoked " + result.email + ". They can no longer pay the joining fee.");
  console.log("  An already-active partner is not affected by this.\n");
}

async function listAll(){
  const rows = await partners.listPartners();
  if(!rows.length){
    console.log("\n  No partners yet.\n");
    return;
  }
  console.log("\n  " + rows.length + " partner" + (rows.length === 1 ? "" : "s") + ":\n");
  for(const p of rows){
    console.log("  " + (p.name || "(no name)") + "  <" + (p.email || "?") + ">");
    console.log("    code " + p.code + "   joined " + when(p.joined_at) + "   uid " + p.uid);
    console.log("    " + (p.clients || 0) + " clients, " + (p.reports || 0) + " reports, "
      + inr(p.earned) + " earned, " + inr(p.paid) + " paid" + (p.upi ? "   UPI " + p.upi : "   (no UPI ID yet)"));
    console.log("");
  }
}

async function owed(){
  const rows = await partners.listPayable();
  if(!rows.length){
    console.log("\n  Nothing to pay. Commission becomes payable once a report is "
      + Math.round(partners.HOLD_MS / 86400000) + " days old.\n");
    return;
  }
  let total = 0;
  console.log("\n  To pay this month:\n");
  for(const row of rows){
    total += row.amount;
    console.log("  " + (row.name || "(no name)") + "  <" + (row.email || "?") + ">   code " + row.code);
    console.log("    " + inr(row.amount) + " for " + row.reports + " report" + (row.reports === 1 ? "" : "s")
      + "  ->  " + (row.upi || "NO UPI ID — ask them to add one on their dashboard"));
    console.log("    node tools/partners.mjs --pay " + row.uid + " --note \"UTR ...\"");
    console.log("");
  }
  console.log("  Total: " + inr(total) + "\n");
}

async function pay(uid){
  const note = arg("note") || "";
  // A transfer with no reference is one you cannot reconcile later.
  if(!note) fail("Refusing to mark paid without --note. Put the UTR or transaction reference in it.");
  const result = await partners.settle({ uid, note });
  if(!result.ok){
    if(result.reason === "NOTHING_PAYABLE") fail("Nothing payable for " + uid + ".");
    fail("Could not settle " + uid + ": " + result.reason);
  }
  console.log("\n  " + uid + " -> paid " + inr(result.amount) + " for " + result.count + " report"
    + (result.count === 1 ? "" : "s") + ".\n");
}

async function voidOne(orderId){
  const result = await partners.voidEarning({ orderId, note: arg("note") || "" });
  if(!result.ok){
    if(result.reason === "NOT_FOUND") fail("No commission recorded for order " + orderId + ".");
    if(result.reason === "ALREADY_PAID") fail("That commission has already been paid — this tool won't un-pay it.");
    if(result.reason === "ALREADY_VOID") fail("That commission is already void.");
    fail("Could not void " + orderId + ": " + result.reason);
  }
  console.log("\n  Voided " + inr(result.amount) + " on order " + orderId + ".\n");
}

const approveEmail = arg("approve");
const revokeEmail = arg("revoke");
const payUid = arg("pay");
const voidOrder = arg("void");

if(approveEmail) await approve(approveEmail);
else if(revokeEmail) await revoke(revokeEmail);
else if(payUid) await pay(payUid);
else if(voidOrder) await voidOne(voidOrder);
else if(process.argv.includes("--list")) await listAll();
else if(["--approve", "--revoke", "--pay", "--void"].some(f => process.argv.includes(f))){
  fail("That option needs a value. See the top of tools/partners.mjs.");
}
else await owed();

process.exit(0);
