/*
  POST /api/agent/sign

  A counsellor releases a drafted report, with whatever edits they made.

  Armed by AGENT_ADMIN_TOKEN, same as /api/agent/report.

    curl -X POST https://lumelive.co.in/api/agent/sign \
      -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"run_id":"m9x4kq-...","counsellor":"Name, M.Sc Clinical Psychology",
           "final_prose":{ ...the edited draft... }}'

  Response 200:
    { "signed": true, "run_id": "...", "changed_fields": 7 }

  `counsellor` is required and is not decoration. It is the name that
  stands behind the words, and a signature with nobody's name on it is
  the thing this whole review step exists to prevent.

  `final_prose` is optional. Omitting it signs the draft unchanged, which
  is a real and expected outcome — but it is recorded as zero edits, and
  a run of zero-edit signatures is worth being suspicious of, because it
  usually means somebody is clicking through rather than reading.
*/

const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { checkAdminToken } = require("../_lib/adminAuth");
const { signReport } = require("../_lib/reports");

module.exports = async function handler(req, res){
  const gate = checkAdminToken(req, "AGENT_ADMIN_TOKEN", "agent");
  if(!gate.ok) return json(res, gate.status, gate.body);

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST"){
    return json(res, 405, { signed:false, error:"Method not allowed" });
  }

  const allowed = await checkRateLimit({
    key: "agent-sign:" + clientKey(req),
    limit: 120,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed){
    return json(res, 429, { signed:false, error:"Too many requests. Please wait." });
  }

  let body;
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413){
      // An edited report is bigger than a checkout payload and _lib/http
      // caps at 16 KB. Say so plainly rather than letting it look like a
      // network fault to somebody who has just spent ten minutes editing.
      return json(res, 413, { signed:false, error:"That edit is too large to send in one request." });
    }
    return json(res, 400, { signed:false, error:"Invalid JSON body." });
  }

  const runId = String(body.run_id || "").trim();
  if(!runId){
    return json(res, 400, { signed:false, error:"A run_id is required." });
  }

  const counsellor = String(body.counsellor || "").trim();
  if(!counsellor){
    return json(res, 400, { signed:false, code:"COUNSELLOR_REQUIRED",
      error:"A signature needs a name — this is what says a qualified person read it." });
  }

  const finalProse = body.final_prose && typeof body.final_prose === "object" ? body.final_prose : null;

  try{
    const report = await signReport({ runId: runId, finalProse: finalProse, counsellor: counsellor });
    return json(res, 200, {
      signed: true,
      run_id: report.runId,
      signed_by: report.signedBy,
      signed_at: report.signedAt,
      changed_fields: report.edits ? report.edits.changedFields : 0
    });
  }catch(err){
    if(err && err.code === "NO_DRAFT"){
      return json(res, 404, { signed:false, code:"NO_DRAFT", error:err.message });
    }
    console.error("[lume agent] signing failed:", err && err.message);
    return json(res, 503, { signed:false, code:"STORE_UNAVAILABLE", error:"Couldn't record the signature." });
  }
};
