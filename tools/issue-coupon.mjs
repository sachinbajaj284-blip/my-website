/*
  Issues an invitation coupon to a named account, in Firestore.

    node tools/issue-coupon.mjs --code CLARITY100 --email someone@example.com
    node tools/issue-coupon.mjs --code CLARITY100 --email a@x.com --email b@x.com
    node tools/issue-coupon.mjs --code CLARITY100 --email someone@example.com --dry-run
    node tools/issue-coupon.mjs --code CLARITY100 --revoke

  Needs the same three variables the rest of the server code uses:
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.

  Why this exists rather than a line in api/_lib/coupons.js:

  An invitation code is addressed to a specific person, and that
  person's email address is personal data. This repository is public, so
  committing it would publish it and leave it in the git history for
  good. Codes like CLARITY100 therefore ship parked — inactive, with an
  empty recipient list — and are issued onto their Firestore document,
  which loadCoupon layers over the built-in definition.

  The parked default is also the fail-safe: with no document, or with
  Firestore unreachable, the code reads back inactive rather than
  becoming a discount for whoever types it.

  The writing, the refusal to issue without a recipient, and the
  read-back check all live in issueCoupon() in api/_lib/coupons.js.
  This file is the terminal-friendly face of it.
*/

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { issueCoupon } = require("../api/_lib/coupons.js");

function argValues(flag){
  const out = [];
  process.argv.forEach((arg, i) => {
    if(arg === flag && process.argv[i + 1]) out.push(process.argv[i + 1]);
    else if(arg.startsWith(flag + "=")) out.push(arg.slice(flag.length + 1));
  });
  return out;
}

const code = argValues("--code")[0] || "";
const emails = argValues("--email");
const revoke = process.argv.includes("--revoke");
const dryRun = process.argv.includes("--dry-run");

if(!code){
  console.error("Usage: node tools/issue-coupon.mjs --code CODE --email someone@example.com [--dry-run]");
  console.error("       node tools/issue-coupon.mjs --code CODE --revoke");
  process.exit(2);
}

const result = await issueCoupon({ code, emails, revoke, dryRun });

console.log("");
console.log(result.ok ? "  " + result.message : "  " + result.message);

if(result.effective){
  const e = result.effective;
  console.log("");
  console.log("  Effective configuration at checkout (defaults + Firestore):");
  console.log("    active            " + e.is_active);
  console.log("    issued to         " + (e.restricted_to_emails.length ? e.restricted_to_emails.join(", ") : "(nobody — open to all)"));
  console.log("    works on          " + (e.applicable_packs.length ? e.applicable_packs.join(", ") : "(every pack)"));
  console.log("    uses              " + e.times_used + " of " + (e.usage_limit == null ? "unlimited" : e.usage_limit));
  console.log("    advertised        " + e.promote);
}

if(result.configured === false){
  console.log("");
  console.log("  Set the three FIREBASE_* variables and run again.");
}

console.log("");
process.exit(result.ok ? 0 : 1);
