/*
  POST /api/assessment/save

  Saves a finished assessment result against the signed-in account.

  Request:
    Authorization: Bearer <Firebase ID token>
    {
      "instrument": "student-full-v1",
      "consent": true,
      "scores": {
        "riasec":  { "R":3, "I":6, "A":4, "S":5, "E":2, "C":2 },
        "anchors": { "SV":36, "CH":31, "MA":28, "AU":21, "IN":19, "WF":17, "ST":14, "EN":11 },
        "vark":    { "V":8, "A":3, "R":10, "K":5 },
        "bigfive": { "O":34, "C":29, "E":22, "A":31, "N":18 }
      },
      "context": { "stage":"Class 12 Science", "age":17, "city":"Rohtak", "concern":"..." }
    }

  Response 201:
    { "saved": true, "run_id": "m7x2k1-4f9a...", "created_at": "2026-08-26T..." }

  The uid is taken from the verified token and never from the body. A
  client can save its own result and nobody else's; there is no field
  here that lets it say whose result this is.

  Scores are recomputed nowhere. The browser did the scoring — it has
  the item bank and always has — and this endpoint's job is to keep the
  answer, not to second-guess it. What it does check is that every score
  is a number inside the range its instrument can actually produce, so a
  page that has drifted out of sync with _lib/assessments.js fails loudly
  here instead of quietly storing a profile nothing downstream can read.
*/

const { json, setCors, readBody } = require("../../http");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { requireAccount } = require("../../account");
const { validate, saveRun } = require("../../assessments");

module.exports = async function handler(req, res){
  setCors(req, res, "POST,OPTIONS");

  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }

  if(req.method !== "POST"){
    return json(res, 405, { saved:false, error:"Method not allowed" });
  }

  /*
    Two limits, and the IP one is deliberately loose.

    A school computer lab is one public IP with thirty students on it,
    and a whole class finishing an assessment in the same period is the
    cohort case this endpoint exists to serve — a tight per-IP budget
    would refuse student eleven. So the IP check here is only a flood
    guard, and the real per-person limit is keyed on the uid below,
    where one person retrying is distinguishable from a lab full of
    people each saving once.
  */
  const notFlooding = await checkRateLimit({
    key: "assessment-save-ip:" + clientKey(req),
    limit: 300,
    windowMs: 10 * 60 * 1000
  });
  if(!notFlooding){
    return json(res, 429, { saved:false, error:"Too many attempts from this network. Please wait a few minutes and try again." });
  }

  const account = await requireAccount(req);
  if(!account.ok){
    return json(res, account.status, { saved:false, code:account.code, error:account.error });
  }

  /*
    LUME_REQUIRE_ACCOUNT=0 turns account checks off site-wide so a
    Firebase credential problem can't stop people paying. Checkout can
    proceed without knowing who somebody is; a per-person result store
    cannot — there is no uid to file it under. So this endpoint declines
    rather than inventing an owner.
  */
  if(!account.account){
    return json(res, 503, {
      saved:false, code:"ACCOUNT_CHECK_DISABLED",
      error:"We can't save results right now. Your report is still on this device — please try again later."
    });
  }

  /*
    The real limit. Finishing an assessment is a once-in-a-while act; the
    page retries once on its own, and somebody re-taking it to see what
    changes is fine. Ten in ten minutes is far more than an honest
    session needs.
  */
  const withinBudget = await checkRateLimit({
    key: "assessment-save-uid:" + account.account.uid,
    limit: 10,
    windowMs: 10 * 60 * 1000
  });
  if(!withinBudget){
    return json(res, 429, { saved:false, error:"Too many attempts. Please wait a few minutes and try again." });
  }

  let body;
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413){
      return json(res, 413, { saved:false, error:"Request body too large." });
    }
    return json(res, 400, { saved:false, error:"Invalid JSON body." });
  }

  const checked = validate(body);
  if(!checked.ok){
    return json(res, 400, { saved:false, code:checked.error, error:checked.message });
  }

  try{
    const { runId, createdAt } = await saveRun({ uid: account.account.uid, doc: checked.doc });
    return json(res, 201, { saved:true, run_id:runId, created_at:createdAt });
  }catch(err){
    console.error("[lume assessment] save failed:", err && err.message);
    return json(res, 503, {
      saved:false, code:"STORE_UNAVAILABLE",
      error:"We couldn't save your result just now. It's still on this device — please try again in a few minutes."
    });
  }
};
