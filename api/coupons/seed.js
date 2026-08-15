/*
  POST /api/coupons/seed        — admin only

  Writes the coupon catalogue from api/_lib/coupons.js into Firestore and
  verifies it read back correctly, so offers can be edited from the
  Firebase console without a deploy. Same operation as
  `npm run coupons:seed`, for when there is no local checkout to run it
  from — both call the same seedCoupons(), so they cannot disagree about
  what a coupon document should contain.

  ───────────────────────────────────────────────────────────────────────
  Access
  ───────────────────────────────────────────────────────────────────────
  This is the only route on the site that writes to the coupon catalogue,
  so it is closed by default and opens only when you deliberately arm it.

  Set in Vercel → Project → Settings → Environment Variables:

    COUPON_ADMIN_TOKEN   a long random secret, 24+ characters

  With that variable unset — which is the state of every deploy until
  someone sets it — this endpoint does not exist as far as the outside
  world is concerned: it answers 404, the same as any unrouted path, so
  its presence cannot be discovered by probing.

  Usage:

    curl -X POST https://lumelive.co.in/api/coupons/seed \
      -H "Authorization: Bearer $COUPON_ADMIN_TOKEN"

    # see what would change without writing
    curl -X POST https://lumelive.co.in/api/coupons/seed \
      -H "Authorization: Bearer $COUPON_ADMIN_TOKEN" \
      -H "Content-Type: application/json" -d '{"dry_run":true}'

  The token goes in a header, never a query string — query strings end up
  in access logs, browser history and referer headers.

  Re-running is safe: times_used is carried forward per code, so a
  re-seed never resets a counter a real redemption has incremented.
*/

const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { requireAdmin } = require("../_lib/adminAuth");
const { seedCoupons } = require("../_lib/coupons");

module.exports = async function handler(req, res){
  // Not armed → indistinguishable from a route that was never deployed.
  // The token check itself lives in _lib/adminAuth.js, shared with
  // /api/coupons/issue, because a security control copied into a second
  // file is one that can drift.
  const gate = requireAdmin(req, "coupon-seed");
  if(!gate.ok && gate.status === 404){
    return json(res, 404, { error: gate.error });
  }

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  // POST only. A GET route that rewrites the price list is one prefetch,
  // crawler or shared link away from firing by accident.
  if(req.method !== "POST"){
    return json(res, 405, { error: "Method not allowed" });
  }

  // Ahead of the token check, so a stolen-token guessing loop is slow and
  // an armed endpoint still can't be hammered.
  const allowed = await checkRateLimit({
    key: "coupon-seed:" + clientKey(req),
    limit: 5,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed){
    return json(res, 429, { error: "Too many attempts. Please wait and try again." });
  }

  // Deliberately says nothing about which part was wrong.
  if(!gate.ok){
    return json(res, gate.status, { error: gate.error });
  }

  let body = {};
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413) return json(res, 413, { error: "Request body too large." });
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const result = await seedCoupons({ dryRun: body.dry_run === true });

  if(!result.configured){
    return json(res, 503, { ok: false, error: result.message });
  }

  // A mismatch is a real failure — the catalogue that prices real orders
  // is not what the code says it should be. Answer non-2xx so a script
  // wrapping this notices without having to parse the body.
  const status = result.ok ? 200 : 500;
  return json(res, status, {
    ok: result.ok,
    dry_run: result.dryRun,
    message: result.message,
    live_at_checkout: result.live,
    documents: result.written,
    problems: result.problems
  });
};
