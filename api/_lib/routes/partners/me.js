/*
  POST /api/partners/me           — signed in

  Everything partner-dashboard.html draws, in one call:

    {}                  → where this account stands, and if it is a
                          partner, their link and numbers
    { upi: "x@bank" }   → save the UPI ID their commission is paid to

  POST for the same reason /api/referrals/payout is: nothing about a
  person's earnings should sit behind a URL that can be prefetched,
  logged or shared.

  Answers:
    200 { ok:true, state, email, join, partner }
        state   "none"      not approved yet — apply first
                "approved"  may pay the joining fee
                "active"    a partner; `partner` carries the numbers
    200 { ok:false, reason, message, … }   a UPI ID that was refused
    401 not signed in
    404 programme switched off
    503 Firebase unavailable
*/

const { json, setCors, readBody } = require("../../http");
const { requireAccount } = require("../../account");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { getProduct } = require("../../catalog");
const partners = require("../../partners");

const MESSAGES = {
  BAD_UPI: "That doesn't look like a UPI ID. It should look like yourname@bank.",
  NOT_PARTNER: "Your partner account isn't active yet."
};

module.exports = async function handler(req, res){
  if(!partners.isEnabled()) return json(res, 404, { error: "Not found" });

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const allowed = await checkRateLimit({
    key: "partner-me:" + clientKey(req),
    limit: 60,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed) return json(res, 429, { error: "Too many requests. Please try again shortly." });

  let body = {};
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413) return json(res, 413, { error: "Request body too large." });
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const identity = await requireAccount(req);
  if(!identity.ok) return json(res, identity.status, { error: identity.error, code: identity.code });
  if(!identity.account) return json(res, 401, { error: "Sign in first.", code: "NO_ACCOUNT" });

  const account = identity.account;
  const product = getProduct(partners.JOIN_SKU);
  const join = { sku: partners.JOIN_SKU, amount: product ? product.amount : null, label: product ? product.label : "" };

  try{
    let saved = null;
    if(body && body.upi != null){
      saved = await partners.setUpi({ uid: account.uid, upi: body.upi });
    }

    const state = await partners.joinState({ uid: account.uid, email: account.email });
    const partner = state === "active" ? await partners.summary(account.uid) : null;
    const answer = { ok: true, state, email: account.email, join, partner };

    if(saved && !saved.ok){
      return json(res, 200, Object.assign(answer, {
        ok: false,
        reason: saved.reason,
        message: MESSAGES[saved.reason] || "We couldn't save that. Please message us and we'll sort it out."
      }));
    }
    return json(res, 200, answer);
  }catch(err){
    console.error("[lume partners] /me failed:", err && err.message);
    return json(res, 503, { error: "Your partner dashboard is unavailable right now. Please try again in a few minutes." });
  }
};
