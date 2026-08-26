/*
  POST /api/assessment/delete

  Deletes every assessment result belonging to the signed-in account.

  Request:
    Authorization: Bearer <Firebase ID token>
    { "confirm": true }

  Response 200:
    { "deleted": true, "runs_deleted": 2 }

  This endpoint is the other half of the consent checkbox. Asking
  somebody to agree to their psychometric profile being stored, and then
  giving them no way to take that back, is not consent — it is a form.
  privacy-policy.html points here.

  POST rather than DELETE because it is called from a page with the same
  fetch helper as everything else on this site, and because DELETE with
  an Authorization header trips more corporate proxies than it is worth.
  `confirm: true` is required so a mis-routed request can't wipe a
  profile by arriving at the wrong URL.

  It deletes rather than marking deleted. A soft delete would leave the
  scores sitting in the collection, which is exactly what the person
  asking has asked us not to do.
*/

const { json, setCors, readBody } = require("../../http");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { requireAccount } = require("../../account");
const { deleteRuns } = require("../../assessments");

module.exports = async function handler(req, res){
  setCors(req, res, "POST,OPTIONS");

  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }

  if(req.method !== "POST"){
    return json(res, 405, { deleted:false, error:"Method not allowed" });
  }

  // Loose per-IP flood guard only; the per-person budget is below.
  const notFlooding = await checkRateLimit({
    key: "assessment-delete-ip:" + clientKey(req),
    limit: 300,
    windowMs: 10 * 60 * 1000
  });
  if(!notFlooding){
    return json(res, 429, { deleted:false, error:"Too many attempts from this network. Please wait a few minutes and try again." });
  }

  const account = await requireAccount(req);
  if(!account.ok){
    return json(res, account.status, { deleted:false, code:account.code, error:account.error });
  }
  if(!account.account){
    return json(res, 503, {
      deleted:false, code:"ACCOUNT_CHECK_DISABLED",
      error:"We can't verify your sign-in right now, so we can't delete your results. Please email hello@lumelive.co.in and we'll do it by hand."
    });
  }

  const withinBudget = await checkRateLimit({
    key: "assessment-delete-uid:" + account.account.uid,
    limit: 10,
    windowMs: 10 * 60 * 1000
  });
  if(!withinBudget){
    return json(res, 429, { deleted:false, error:"Too many attempts. Please wait a few minutes and try again." });
  }

  let body;
  try{ body = await readBody(req); }
  catch(err){ return json(res, 400, { deleted:false, error:"Invalid JSON body." }); }

  if(body.confirm !== true){
    return json(res, 400, { deleted:false, code:"CONFIRM_REQUIRED", error:"Deleting saved results needs an explicit confirmation." });
  }

  try{
    const count = await deleteRuns(account.account.uid);
    return json(res, 200, { deleted:true, runs_deleted:count });
  }catch(err){
    console.error("[lume assessment] delete failed:", err && err.message);
    return json(res, 503, {
      deleted:false, code:"STORE_UNAVAILABLE",
      error:"We couldn't delete your results just now. Please try again, or email hello@lumelive.co.in and we'll do it by hand."
    });
  }
};
