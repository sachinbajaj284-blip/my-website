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

const crypto = require("crypto");
const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { seedCoupons } = require("../_lib/coupons");

// A short token is not a secret. Refusing to run beats quietly accepting
// something guessable on the one route that can rewrite prices.
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
  const expected = String(process.env.COUPON_ADMIN_TOKEN || "");

  // Not armed → indistinguishable from a route that was never deployed.
  if(!expected){
    return json(res, 404, { error: "Not found" });
  }
  if(expected.length < MIN_TOKEN_LENGTH){
    console.error("[lume coupons] COUPON_ADMIN_TOKEN is shorter than " + MIN_TOKEN_LENGTH + " characters — seed endpoint disabled.");
    return json(res, 404, { error: "Not found" });
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
