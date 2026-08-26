/*
  POST /api/coupons/issue        — admin only

  Issues an invitation coupon to a named account, or revokes one. Same
  operation as `npm run coupons:issue`, for when there is no local
  checkout to run it from — both call the same issueCoupon(), so they
  cannot disagree about what issuing means.

  This exists because the alternative is worse. Issuing needs the
  Firebase Admin credentials, and those live in Vercel; running the CLI
  means copying production secrets onto a laptop, and editing the
  Firestore document by hand in the console means one misspelled field
  name away from a live 100%-off code that anybody can use. Here the
  credentials never move and issueCoupon() reads the result back.

  ───────────────────────────────────────────────────────────────────────
  Access
  ───────────────────────────────────────────────────────────────────────
  Guarded by COUPON_ADMIN_TOKEN, exactly as /api/coupons/seed is — see
  api/_lib/adminAuth.js. Unset, this route answers 404 like any unrouted
  path, so its presence cannot be found by probing.

  Usage:

    # issue it
    curl -X POST https://lumelive.co.in/api/coupons/issue \
      -H "Authorization: Bearer $COUPON_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"code":"CLARITY100","email":"someone@example.com"}'

    # see what it would do, without writing
    curl -X POST https://lumelive.co.in/api/coupons/issue \
      -H "Authorization: Bearer $COUPON_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"code":"CLARITY100","email":"someone@example.com","dry_run":true}'

    # take it back
    curl -X POST https://lumelive.co.in/api/coupons/issue \
      -H "Authorization: Bearer $COUPON_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"code":"CLARITY100","revoke":true}'

  The reply carries the effective configuration — the built-in definition
  and the Firestore document combined — so the caller sees what checkout
  will actually do rather than what they meant to write.
*/

const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { requireAdmin } = require("../_lib/adminAuth");
const { issueCoupon } = require("../_lib/coupons");

// Accepts "email" or "emails", one or many, so a caller doesn't have to
// remember which. A code may legitimately be issued to a couple of
// people (a parent and a student, say).
function emailsFrom(body){
  const raw = [].concat(body.emails || [], body.email || []);
  return raw.map(function(e){ return String(e || "").trim(); }).filter(Boolean);
}

module.exports = async function handler(req, res){
  const gate = requireAdmin(req, "coupon-issue");
  if(!gate.ok && gate.status === 404){
    return json(res, 404, { error: gate.error });
  }

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  // POST only. A GET route that hands out a free product is one prefetch,
  // crawler or shared link away from firing by accident.
  if(req.method !== "POST"){
    return json(res, 405, { error: "Method not allowed" });
  }

  // Ahead of the token check, so a stolen-token guessing loop is slow and
  // an armed endpoint still can't be hammered.
  const allowed = await checkRateLimit({
    key: "coupon-issue:" + clientKey(req),
    limit: 5,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed){
    return json(res, 429, { error: "Too many attempts. Please wait and try again." });
  }

  if(!gate.ok){
    return json(res, gate.status, { error: gate.error });
  }

  let body = {};
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413) return json(res, 413, { error: "Request body too large." });
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const result = await issueCoupon({
    code: body.code,
    emails: emailsFrom(body),
    revoke: body.revoke === true,
    dryRun: body.dry_run === true
  });

  if(result.configured === false){
    return json(res, 503, { ok: false, error: result.message });
  }

  /*
    Non-2xx on failure so a script wrapping this notices without parsing
    the body. issueCoupon() reports ok:false for the case that matters
    most — the coupon reading back live with no recipient — which is a
    real problem with real money attached, not a validation nicety.
  */
  return json(res, result.ok ? 200 : 400, {
    ok: result.ok,
    dry_run: Boolean(result.dryRun),
    code: result.code,
    message: result.message,
    // Defaults and Firestore document combined: what checkout will do.
    effective: result.effective || null
  });
};
