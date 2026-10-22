/*
  Records a manual entitlement for every person in a CSV — one SKU, one
  transfer, many recipients. Built for a corporate deal: a company pays
  Lume Live once, off-platform, for access on behalf of its staff, and
  each named employee then signs in and finds the product unlocked.

    # preview (writes nothing) — the default, always run this first
    npm run entitlements:grant -- --file employees.csv --reference ERAUTO-INV-2026-001

    # apply, once the preview looks right
    npm run entitlements:grant -- --file employees.csv --reference ERAUTO-INV-2026-001 --commit

    # a different pack, and the real per-head amount so the books sum to the invoice
    npm run entitlements:grant -- --file staff.csv --reference ACME-NEFT-9931 \
      --sku lume-lens-working-profile --amount 1200 --commit

  Needs the same three variables the rest of the server code uses:
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.

  ───────────────────────────────────────────────────────────────────────
  Why a CSV and one --reference, not fifty curl calls
  ───────────────────────────────────────────────────────────────────────
  /api/entitlements/grant records ONE transfer for ONE person, keyed on
  the transfer's reference so a retry can't grant twice. A corporate deal
  is the opposite shape: a single payment that has to become fifty
  separate entitlements, each attached to a different employee. Fifty
  curls would need fifty distinct references invented by hand, and a
  typo'd or reused one silently attaches two people to the same grant.

  So this tool derives each recipient's reference from the ONE invoice
  reference plus a hash of that recipient's own email (or phone): see
  deriveReference. The result is

    - unique per employee, so every one gets their own entitlement;
    - stable across runs, so re-running the file after fixing two rows
      re-grants nobody — recordManualEntitlement is idempotent on exactly
      this reference and returns the existing grant with created:false;
    - traceable, because every grant carries the invoice reference as its
      prefix, so `source:"manual"` rows for this deal sort together when
      you reconcile against the bank statement.

  ───────────────────────────────────────────────────────────────────────
  Why direct, and why dry-run by default
  ───────────────────────────────────────────────────────────────────────
  It calls recordManualEntitlement() directly rather than POSTing to the
  armed HTTP endpoint, the same way issue-coupon.mjs calls issueCoupon():
  run from a machine that already has the FIREBASE_* secrets, there is no
  token to arm and disarm. The HTTP endpoint stays the right tool for a
  single off-platform payment; this is the right tool for a batch.

  It writes nothing without --commit. A batch that hands out paid product
  to dozens of people is precisely where a preview earns its keep — the
  grant endpoint's own docs say to dry-run every single grant first, and a
  file of fifty is fifty chances to have the wrong column mapped.

  The CSV needs a header row with (at least) an `email` column; `phone`
  and `name` are optional. Column order does not matter and header case
  and spacing are ignored. A row with neither a usable email nor a 10-digit
  phone is reported and skipped, never guessed at; the rest still run.
*/

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const {
  recordManualEntitlement, peekManualGrant,
  normalizeReference, normalizePhone, normalizeEmail
} = require("../api/_lib/entitlements.js");
const { getProduct } = require("../api/_lib/catalog.js");

// The same shape the grant endpoint accepts — an address with an @, a dot
// after it, and no spaces. normalizeEmail only trims and lowercases, so the
// format check is ours to make.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* ============================================================
   Parsing the file
   ============================================================ */

/*
  A small RFC-4180-ish CSV reader: it honours double-quoted fields, so a
  name like "Patel, Riya" or an address with a comma survives, and a ""
  inside quotes is a literal quote. Returns an array of string arrays, one
  per record. Good enough for a staff list; this is not trying to be a
  spreadsheet engine.
*/
function parseCsv(text){
  const s = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
  const rows = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let sawField = false;

  for(let i = 0; i < s.length; i++){
    const ch = s[i];
    if(inQuotes){
      if(ch === '"'){
        if(s[i + 1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      }else{
        field += ch;
      }
    }else if(ch === '"'){
      inQuotes = true;
      sawField = true;
    }else if(ch === ','){
      record.push(field); field = ""; sawField = true;
    }else if(ch === '\n'){
      record.push(field); rows.push(record);
      record = []; field = ""; sawField = false;
    }else{
      field += ch; sawField = true;
    }
  }
  if(sawField || field.length){ record.push(field); rows.push(record); }
  return rows;
}

// Which column holds what. Header matching is forgiving — lowercased, with
// spaces, dashes and underscores stripped — so "E-Mail", "email_address"
// and "Email" all land on `email`. The first header that looks like each
// field wins; everything else is ignored.
function headerIndex(headers){
  const norm = headers.map(function(h){
    return String(h || "").toLowerCase().replace(/[\s_-]/g, "");
  });
  function find(names){
    for(let i = 0; i < norm.length; i++){
      if(names.indexOf(norm[i]) !== -1) return i;
    }
    return -1;
  }
  return {
    email: find(["email", "emailaddress", "mail"]),
    phone: find(["phone", "phonenumber", "mobile", "mobilenumber", "number", "contact"]),
    name:  find(["name", "fullname", "employeename", "employee"])
  };
}

/*
  Turns the raw rows into { email, phone, name, line } records. `line` is
  the 1-based line number in the file (header counted), so a problem can be
  pointed at the exact row the operator has to go and fix. Entirely blank
  rows — the trailing newline, a spacer line — are dropped rather than
  reported as errors.
*/
function toRecords(rows){
  const nonEmpty = rows.filter(function(r){
    return r.some(function(c){ return String(c || "").trim() !== ""; });
  });
  if(!nonEmpty.length) return { records: [], error: "The file is empty." };

  // Find the header among the raw rows so `line` stays true to the file.
  let headerRowIndex = rows.findIndex(function(r){
    return r.some(function(c){ return String(c || "").trim() !== ""; });
  });
  const cols = headerIndex(rows[headerRowIndex]);
  if(cols.email === -1 && cols.phone === -1){
    return { records: [], error: "No `email` or `phone` column found in the header row. Give the file a header row naming its columns." };
  }

  const records = [];
  for(let i = headerRowIndex + 1; i < rows.length; i++){
    const r = rows[i];
    if(!r.some(function(c){ return String(c || "").trim() !== ""; })) continue;
    const cell = function(idx){ return idx === -1 ? "" : String(r[idx] == null ? "" : r[idx]).trim(); };
    records.push({
      email: cell(cols.email),
      phone: cell(cols.phone),
      name: cell(cols.name),
      line: i + 1
    });
  }
  return { records: records, columns: cols };
}

/* ============================================================
   Deriving one recipient's reference
   ============================================================ */

/*
  The per-recipient idempotency key. See the header: it is the invoice
  reference with a short hash of the recipient's identity appended, so it
  is unique per person and identical every time this exact person is
  processed against this exact invoice. normalizeReference is applied here
  too, so what the preview prints is byte-for-byte what gets stored.

  The identity seed is the normalised email when there is one, else the
  normalised phone — whichever the grant will actually attach to. Two rows
  that normalise to the same identity therefore derive the same reference,
  which planGrants catches as a collision rather than silently granting one
  and skipping the other.
*/
function deriveReference(baseReference, seed){
  const base = normalizeReference(baseReference);
  const h = crypto.createHash("sha256").update(String(seed || "")).digest("hex").slice(0, 12);
  return normalizeReference(base + h);
}

/* ============================================================
   Building the plan
   ============================================================ */

/*
  Validates every record and works out exactly what would be written, with
  no Firestore access at all, so the whole plan can be shown — or unit
  tested — before a single document is touched.

  Returns { grants, problems, warnings, total }:
    grants   — ready to pass to recordManualEntitlement, each with its
               derived reference and the resolved amount.
    problems — rows that cannot be granted (no identity, bad email,
               duplicate identity). Named by line number. These are
               skipped, not fatal.
    warnings — rows that will be granted but can't self-restore (phone
               only, no email). Worth seeing; not blocking.
*/
function planGrants(opts){
  const records = opts.records || [];
  const sku = opts.sku;
  const product = getProduct(sku);
  const amount = opts.amount != null ? opts.amount : (product ? product.amount : null);
  const note = opts.note;

  const grants = [];
  const problems = [];
  const warnings = [];
  const seenReference = new Map();  // reference -> the line that first used it
  let total = 0;

  records.forEach(function(rec){
    const email = normalizeEmail(rec.email);
    const phone = normalizePhone(rec.phone);

    // Given an email that isn't an address at all — a name typed in the
    // wrong column, a trailing "n/a". Refuse rather than attach the grant
    // to a mailbox that can never sign in.
    if(rec.email && !EMAIL_RE.test(email)){
      problems.push({ line: rec.line, who: rec.email, reason: "that email isn't a valid address" });
      return;
    }
    // Phone present but not ten digits (after stripping +91 and spaces),
    // and no email to fall back on — nothing dependable to attach to.
    const phoneLooksReal = phone.length === 10;
    if(!email && rec.phone && !phoneLooksReal){
      problems.push({ line: rec.line, who: rec.phone, reason: "phone isn't a 10-digit number and there's no email" });
      return;
    }
    if(!email && !phoneLooksReal){
      problems.push({ line: rec.line, who: rec.name || "(row " + rec.line + ")", reason: "no email or phone to attach the grant to" });
      return;
    }

    const seed = email || phone;
    const reference = deriveReference(opts.baseReference, seed);

    // Two rows for the same person against the same invoice would derive
    // the same reference and the second would no-op onto the first. That is
    // almost always a duplicated line, so it is reported rather than hidden.
    if(seenReference.has(reference)){
      problems.push({
        line: rec.line,
        who: email || phone,
        reason: "same person as line " + seenReference.get(reference) + " — duplicate row, skipped"
      });
      return;
    }
    seenReference.set(reference, rec.line);

    if(!email){
      warnings.push({ line: rec.line, who: phone, note: "phone only — recorded, but they can't self-restore on a new device until you add the email they sign in with" });
    }

    total += amount != null ? Number(amount) : 0;
    grants.push({
      line: rec.line,
      sku: sku,
      amount: amount,
      email: email || null,
      phone: phone || null,
      name: rec.name || null,
      reference: reference,
      note: note
    });
  });

  return { grants: grants, problems: problems, warnings: warnings, total: total };
}

/* ============================================================
   CLI
   ============================================================ */

function argValue(flag){
  const argv = process.argv;
  for(let i = 0; i < argv.length; i++){
    if(argv[i] === flag && argv[i + 1] != null) return argv[i + 1];
    if(argv[i].indexOf(flag + "=") === 0) return argv[i].slice(flag.length + 1);
  }
  return null;
}

function inr(n){
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

async function main(){
  const file = argValue("--file");
  const baseReference = argValue("--reference");
  const sku = argValue("--sku") || "lume-lens-working-profile";
  const amountArg = argValue("--amount");
  const commit = process.argv.includes("--commit");

  if(!file || !baseReference){
    console.error("Usage: node tools/grant-entitlements.mjs --file employees.csv --reference INVOICE-REF [--sku SKU] [--amount RUPEES] [--commit]");
    console.error("");
    console.error("  --file       CSV with a header row and an `email` column (`phone`, `name` optional)");
    console.error("  --reference  the single transfer/invoice reference the whole batch is paid under");
    console.error("  --sku        the pack to grant (default: lume-lens-working-profile)");
    console.error("  --amount     rupees to record PER PERSON (default: catalogue price). Use the");
    console.error("               negotiated per-head figure so the grants sum to the invoice.");
    console.error("  --commit     actually write. Without it, nothing is written (preview only).");
    process.exit(2);
  }

  const product = getProduct(sku);
  if(!product){
    console.error("\n  Unknown sku \"" + sku + "\". Pack ids are listed in api/_lib/catalog.js.\n");
    process.exit(1);
  }

  let amount = null;
  if(amountArg != null){
    amount = Number(amountArg);
    if(!isFinite(amount) || amount < 0){
      console.error("\n  --amount must be a non-negative number of rupees.\n");
      process.exit(1);
    }
  }

  let text = "";
  try{
    text = readFileSync(file, "utf8");
  }catch(err){
    console.error("\n  Could not read " + file + ": " + String(err && err.message || err) + "\n");
    process.exit(1);
  }

  const parsed = toRecords(parseCsv(text));
  if(parsed.error){
    console.error("\n  " + parsed.error + "\n");
    process.exit(1);
  }

  const note = argValue("--note") ||
    ("Corporate bulk grant for " + product.label + " — invoice/transfer " + baseReference);
  const plan = planGrants({
    records: parsed.records,
    baseReference: baseReference,
    sku: sku,
    amount: amount,
    note: note
  });

  const effectiveAmount = amount != null ? amount : product.amount;

  console.log("");
  console.log("  " + (commit ? "Granting" : "PREVIEW (nothing will be written)"));
  console.log("  pack        " + product.label + " (" + sku + ")");
  console.log("  per person  " + inr(effectiveAmount) + (amount == null ? "  (catalogue price — pass --amount for the negotiated rate)" : ""));
  console.log("  invoice     " + baseReference);
  console.log("  recipients  " + plan.grants.length + " to grant, " + plan.problems.length + " skipped");
  console.log("  total       " + inr(plan.total) + " across the batch");
  console.log("");

  if(plan.problems.length){
    console.log("  ! Skipped rows (fix these in the file and re-run — the rest are unaffected):");
    plan.problems.forEach(function(p){
      console.log("    line " + p.line + "  " + p.who + "  — " + p.reason);
    });
    console.log("");
  }

  if(plan.warnings.length){
    console.log("  ~ Granted, but cannot self-restore (no email):");
    plan.warnings.forEach(function(w){
      console.log("    line " + w.line + "  " + w.who + "  — " + w.note);
    });
    console.log("");
  }

  if(!plan.grants.length){
    console.log("  Nothing to grant.\n");
    process.exit(plan.problems.length ? 1 : 0);
  }

  if(!commit){
    console.log("  This was a preview. Re-run with --commit to write the " + plan.grants.length + " grant(s) above.\n");
    process.exit(0);
  }

  // Writing. Each grant is independent: one failure is reported and the
  // batch carries on, so a single flaky write never strands the other
  // forty-nine. recordManualEntitlement is idempotent on the derived
  // reference, so a re-run after a partial failure re-grants nobody.
  let created = 0;
  let already = 0;
  let failed = 0;

  for(const g of plan.grants){
    try{
      const existing = await peekManualGrant(g.reference);
      const res = await recordManualEntitlement({
        sku: g.sku,
        amount: g.amount,
        phone: g.phone,
        email: g.email,
        name: g.name,
        reference: g.reference,
        note: g.note
      });
      if(res.created){
        created += 1;
        console.log("    ✓ line " + g.line + "  " + (g.email || g.phone) + "  granted  (" + res.orderId + ")");
      }else{
        already += 1;
        console.log("    = line " + g.line + "  " + (g.email || g.phone) + "  already granted" + (existing ? "" : "") + "  (" + res.orderId + ")");
      }
    }catch(err){
      failed += 1;
      console.log("    ✗ line " + g.line + "  " + (g.email || g.phone) + "  FAILED: " + String(err && err.message || err));
    }
  }

  console.log("");
  console.log("  Done — " + created + " new, " + already + " already granted, " + failed + " failed, " + plan.problems.length + " skipped.");
  if(failed){
    console.log("  Re-run the same command to retry the failures — grants already written will report as 'already granted'.");
  }
  console.log("");
  process.exit(failed ? 1 : 0);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if(isMain){
  await main();
}

export { parseCsv, headerIndex, toRecords, deriveReference, planGrants };
