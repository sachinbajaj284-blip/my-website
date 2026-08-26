/*
  The gate on the coupon admin routes.

  Two endpoints can now rewrite what a coupon is worth — /api/coupons/seed
  and /api/coupons/issue — and the check that guards them is a security
  control, so it lives in one place. The same reasoning as the CORS
  allow-list in http.js: a control copied into a second file is a control
  that can drift, and the drift is silent until someone finds it.

  Set in Vercel → Project → Settings → Environment Variables:

    COUPON_ADMIN_TOKEN   a long random secret, 24+ characters

  With that variable unset — the state of every deploy until someone
  deliberately arms it — these routes answer 404, the same as any
  unrouted path, so their presence cannot be discovered by probing.
*/

const crypto = require("crypto");

// A short token is not a secret. Refusing to run beats quietly accepting
// something guessable on a route that can rewrite prices.
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
  const header = String((req && req.headers && req.headers.authorization) || "");
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

/*
  Returns { ok:true } or { ok:false, status, error }.

  `routeName` only appears in a server-side log line, never in a reply.

  The two failure shapes are deliberate and different:

    404  the route is not armed, or is armed with a token too short to be
         one. Indistinguishable from a path that was never deployed.
    401  armed, but the caller presented the wrong token. Says nothing
         about which part was wrong.
*/
function requireAdmin(req, routeName){
  const expected = String(process.env.COUPON_ADMIN_TOKEN || "");

  if(!expected){
    return { ok: false, status: 404, error: "Not found" };
  }
  if(expected.length < MIN_TOKEN_LENGTH){
    console.error("[lume coupons] COUPON_ADMIN_TOKEN is shorter than " + MIN_TOKEN_LENGTH +
                  " characters — " + (routeName || "admin") + " endpoint disabled.");
    return { ok: false, status: 404, error: "Not found" };
  }

  const provided = bearer(req);
  if(!provided || !tokenMatches(provided, expected)){
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}

module.exports = { requireAdmin, bearer, tokenMatches, MIN_TOKEN_LENGTH };
