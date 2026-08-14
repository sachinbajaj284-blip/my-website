/*
  POST /api/entitlements/grant        — admin only

  Records a payment that arrived outside the gateway — a direct UPI or
  bank transfer — as a real entitlement, so the customer's access and the
  books agree.

  This exists because the alternative people reach for is worse. The
  tempting shortcut is to special-case a customer somewhere in the UI
  ("if the phone number is X, skip the payment step"), which grants
  access with no payment record behind it: nothing to reconcile against
  the bank statement, nothing to refund against, no way to revoke it
  without a deploy, and — since a phone number is not a secret — nothing
  stopping anyone who learns the number from claiming the same thing.

  A grant here is the same record a Cashfree payment writes, in the same
  collection, differing only by `source: "manual"` and the transfer's
  reference. Everything downstream therefore treats it as what it is: a
  purchase. Restore-access finds it, the coupon rules' first_time_only
  check counts it, and it can be revoked by setting status in the
  Firebase console.

  ───────────────────────────────────────────────────────────────────────
  Access
  ───────────────────────────────────────────────────────────────────────
  This route hands out paid product for free, so it is closed by default
  and opens only when deliberately armed.

  Set in Vercel → Project → Settings → Environment Variables:

    ENTITLEMENT_ADMIN_TOKEN   a long random secret, 24+ characters

  With that unset — the state of every deploy until someone sets it —
  this endpoint answers 404, the same as any unrouted path, so its
  presence cannot be discovered by probing. Unset it again when you are
  done; it only needs to be armed while you are using it.

  Usage:

    # see what would happen, write nothing
    curl -X POST https://lumelive.co.in/api/entitlements/grant \
      -H "Authorization: Bearer $ENTITLEMENT_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"sku":"student-full-report","email":"someone@example.com",
           "phone":"9812345678","name":"Their Name",
           "reference":"UPI-402913887654","dry_run":true}'

    # do it
    curl -X POST https://lumelive.co.in/api/entitlements/grant \
      -H "Authorization: Bearer $ENTITLEMENT_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"sku":"student-full-report","email":"someone@example.com",
           "phone":"9812345678","name":"Their Name",
           "reference":"UPI-402913887654",
           "note":"Direct transfer verified against bank statement"}'

  The token goes in a header, never a query string — query strings end up
  in access logs, browser history and referer headers. POST only: a GET
  route that hands out paid product is one prefetch or shared link away
  from firing by accident.

  `reference` is the transfer's bank/UPI reference and is required. It is
  both the audit trail and the idempotency key — re-posting the same
  reference returns the original grant instead of creating a second one,
  so a retried curl or a double-tapped script cannot grant twice.

  See docs/manual-entitlements.md.
*/

const crypto = require("crypto");
const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { getProduct } = require("../_lib/catalog");
const {
  recordManualEntitlement, peekManualGrant,
  normalizeReference, normalizePhone, normalizeEmail
} = require("../_lib/entitlements");

// A short token is not a secret. Refusing to run beats quietly accepting
// something guessable on a route that gives away paid product.
const MIN_TOKEN_LENGTH = 24;

// Compares hashes rather than the raw strings: timingSafeEqual needs equal
// lengths, and hashing first stops the comparison from leaking the token's
// length as well as its contents.
function tokenMatches(provided, expected){
  const a = crypto.createHash("sha256").update(String(provided)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function bearer(req){
  const header = String(req.headers.authorization || "");
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

module.exports = async function handler(req, res){
  const expected = String(process.env.ENTITLEMENT_ADMIN_TOKEN || "");

  // Not armed → indistinguishable from a route that was never deployed.
  if(!expected){
    return json(res, 404, { error: "Not found" });
  }
  if(expected.length < MIN_TOKEN_LENGTH){
    console.error("[lume entitlements] ENTITLEMENT_ADMIN_TOKEN is shorter than " + MIN_TOKEN_LENGTH + " characters — grant endpoint disabled.");
    return json(res, 404, { error: "Not found" });
  }

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST"){
    return json(res, 405, { error: "Method not allowed" });
  }

  // Ahead of the token check, so a token-guessing loop is slow and an
  // armed endpoint still can't be hammered.
  const allowed = await checkRateLimit({
    key: "entitlement-grant:" + clientKey(req),
    limit: 5,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed){
    return json(res, 429, { error: "Too many attempts. Please wait and try again." });
  }

  const provided = bearer(req);
  if(!provided || !tokenMatches(provided, expected)){
    // Deliberately says nothing about which part was wrong.
    return json(res, 401, { error: "Unauthorized" });
  }

  let body = {};
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413) return json(res, 413, { error: "Request body too large." });
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const sku = String(body.sku || "").trim();
  const product = getProduct(sku);
  if(!product){
    return json(res, 400, { error: "Unknown sku. Pack ids are listed in api/_lib/catalog.js." });
  }

  const reference = normalizeReference(body.reference);
  if(!reference){
    return json(res, 400, { error: "A payment reference is required — the bank or UPI reference for the transfer. It is the audit trail and the idempotency key." });
  }

  // normalizePhone deliberately discards the guest placeholder number, so
  // a grant made against it would be attached to nobody and would never
  // restore. Reject rather than write a record that cannot work.
  const phone = normalizePhone(body.phone);
  const email = normalizeEmail(body.email);
  if(!phone && !email){
    return json(res, 400, { error: "A phone or an email is required, so the purchase attaches to a person." });
  }
  if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
    return json(res, 400, { error: "That email doesn't look like an address." });
  }

  // Defaults to list price. An explicit amount is for the case where what
  // actually landed differs from list — a part payment, or a negotiated
  // rate — and the record should say what was really received.
  let amount = product.amount;
  if(body.amount != null){
    amount = Number(body.amount);
    if(!isFinite(amount) || amount < 0){
      return json(res, 400, { error: "amount must be a non-negative number of rupees." });
    }
  }

  /*
    Restoring on a new device runs off the *verified email* on a signed-in
    Firebase account (restore-access.js trusts nothing typed in). A grant
    with no email, or with an email that isn't the one they sign in with,
    is a valid record that they will never be able to self-restore from.
    Worth saying plainly in the response rather than letting it be
    discovered later by a customer who can't get in.
  */
  const warnings = [];
  if(!email){
    warnings.push("No email on this grant — it is recorded, but the customer cannot self-restore access on a new device, because restore-access looks up the verified email of a signed-in account. Add the email they sign in with to make it restorable.");
  }

  try{
    const existing = await peekManualGrant(reference);

    if(body.dry_run === true){
      return json(res, 200, {
        ok: true,
        dry_run: true,
        already_recorded: Boolean(existing),
        message: existing
          ? "This reference is already recorded — a real call would return the existing grant, not create a second one."
          : "A real call would record this grant.",
        grant: {
          order_id: existing ? existing.orderId : null,
          sku: sku, label: product.label, amount: amount,
          phone: phone || null, email: email || null,
          reference: reference
        },
        warnings: warnings
      });
    }

    const result = await recordManualEntitlement({
      sku: sku,
      amount: amount,
      phone: body.phone,
      email: body.email,
      name: body.name ? String(body.name).slice(0, 120) : null,
      reference: reference,
      note: body.note
    });

    return json(res, result.created ? 201 : 200, {
      ok: true,
      created: result.created,
      message: result.created
        ? "Grant recorded."
        : "This reference was already recorded — returning the existing grant rather than creating a second one.",
      grant: {
        order_id: result.orderId,
        sku: sku, label: product.label, amount: amount,
        phone: phone || null, email: email || null,
        reference: result.reference
      },
      warnings: warnings
    });
  }catch(err){
    console.error("[lume entitlements] manual grant failed:", String(err && err.message || err));
    // Firestore is where entitlements live; without it there is nothing to
    // write to and nothing to check against. Never pretend a grant landed.
    return json(res, 503, { ok: false, error: "Could not record the grant right now — the entitlement store is unreachable. Nothing was written; retry." });
  }
};
