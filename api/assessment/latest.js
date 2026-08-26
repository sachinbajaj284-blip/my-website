/*
  GET /api/assessment/latest

  The newest saved result belonging to the signed-in account.

  Request:
    Authorization: Bearer <Firebase ID token>

  Response 200 — found:
    {
      "found": true,
      "run": {
        "run_id": "m7x2k1-4f9a...",
        "instrument": "student-full-v1",
        "schema_version": 1,
        "scores": { "riasec": {...}, "anchors": {...}, "vark": {...}, "bigfive": {...} },
        "context": { "stage": "Class 12 Science", "age": 17 },
        "created_at": "2026-08-26T09:12:44.108Z"
      }
    }

  Response 200 — nothing saved yet:
    { "found": false, "run": null }

  An account with no saved result is not an error — it is the normal
  state of almost everyone — so it answers 200 with found:false and the
  page has one success path to read from. The same choice coupons/validate
  makes about a wrong code.

  There is no way to ask for somebody else's result: the uid comes from
  the verified token and this endpoint takes no parameters at all.
*/

const { json, setCors } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { requireAccount } = require("../_lib/account");
const { latestRun, publicView } = require("../_lib/assessments");

module.exports = async function handler(req, res){
  setCors(req, res, "GET,OPTIONS");

  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }

  if(req.method !== "GET"){
    return json(res, 405, { found:false, error:"Method not allowed" });
  }

  // Loose per-IP flood guard only — a school lab is one IP with a class
  // behind it. The per-person budget below is the real limit.
  const notFlooding = await checkRateLimit({
    key: "assessment-latest-ip:" + clientKey(req),
    limit: 600,
    windowMs: 10 * 60 * 1000
  });
  if(!notFlooding){
    return json(res, 429, { found:false, error:"Too many requests from this network. Please wait a few minutes." });
  }

  const account = await requireAccount(req);
  if(!account.ok){
    return json(res, account.status, { found:false, code:account.code, error:account.error });
  }
  if(!account.account){
    return json(res, 503, {
      found:false, code:"ACCOUNT_CHECK_DISABLED",
      error:"We can't look up saved results right now."
    });
  }

  const withinBudget = await checkRateLimit({
    key: "assessment-latest-uid:" + account.account.uid,
    limit: 60,
    windowMs: 10 * 60 * 1000
  });
  if(!withinBudget){
    return json(res, 429, { found:false, error:"Too many requests. Please wait a few minutes." });
  }

  try{
    const run = await latestRun(account.account.uid);
    return json(res, 200, { found: Boolean(run), run: publicView(run) });
  }catch(err){
    console.error("[lume assessment] latest failed:", err && err.message);
    return json(res, 503, { found:false, code:"STORE_UNAVAILABLE", error:"We couldn't reach your saved results just now." });
  }
};
