/*
  POST /api/referrals/code        — signed in

  "What is my referral link?" Mints the caller's code on first ask and
  returns it with their running totals. Safe to call on every page load:
  the mint happens once and every call after it is a single read.

  POST rather than GET because the first call writes. A GET that creates
  a row is one prefetch or crawler away from filling a collection with
  codes nobody asked for.

  Answers:
    200 { ok:true, code, url, stats }
    401 not signed in         — the browser should just stay quiet
    404 programme switched off
    503 Firebase unavailable
*/

const { json, setCors, readBody } = require("../../http");
const { requireAccount } = require("../../account");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { ensureCode, isEnabled } = require("../../referrals");

// Where a referral link lands. The share sheet appends ?ref= to whatever
// page the student was on, but a code handed over in conversation needs
// somewhere to point, and start.html is the shortest path to a result.
const LANDING = "https://lumelive.co.in/start.html";

function referralUrl(code){
  return LANDING + "?ref=" + encodeURIComponent(code);
}

module.exports = async function handler(req, res){
  if(!isEnabled()) return json(res, 404, { error: "Not found" });

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  // Minting is a write per new account, so an unauthenticated flood
  // should not reach Firestore at all.
  const allowed = await checkRateLimit({
    key: "referral-code:" + clientKey(req),
    limit: 60,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed) return json(res, 429, { error: "Too many requests. Please try again shortly." });

  // Body is read and discarded: nothing in it is used. Reading it keeps
  // the request shape identical to every other POST on the site, and
  // caps the size.
  try{ await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413) return json(res, 413, { error: "Request body too large." });
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const account = await requireAccount(req);
  if(!account.ok) return json(res, account.status, { error: account.error, code: account.code });
  if(!account.account){
    // Account enforcement is switched off site-wide. There is no "who",
    // so there is nothing to mint.
    return json(res, 401, { error: "Sign in to get your referral link.", code: "NO_ACCOUNT" });
  }

  try{
    const result = await ensureCode({
      uid: account.account.uid,
      name: account.account.name || account.account.email
    });
    return json(res, 200, {
      ok: true,
      code: result.stats.code,
      url: referralUrl(result.stats.code),
      created: result.created,
      stats: result.stats
    });
  }catch(err){
    console.error("[lume referrals] could not mint a code:", err && err.message);
    return json(res, 503, { error: "Referral links are unavailable right now. Please try again in a few minutes." });
  }
};

module.exports.referralUrl = referralUrl;
