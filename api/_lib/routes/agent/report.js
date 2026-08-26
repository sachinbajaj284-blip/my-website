/*
  POST /api/agent/report

  Drafts the personalised sections of a Full Clarity Report from a saved
  assessment profile. Writes a draft; releases nothing.

  Armed by:
    AGENT_ADMIN_TOKEN   a long random secret, 24+ characters

  With it unset — the state of every deploy until someone sets it — this
  answers 404, the same as any unrouted path. Separate from
  ENTITLEMENT_ADMIN_TOKEN so revoking one does not revoke the other.

  Usage:

    # what would be sent to the model, and what it would cost — no call made
    curl -X POST https://lumelive.co.in/api/agent/report \
      -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"run_id":"m9x4kq-1a2b3c4d5e6f7a8b","dry_run":true}'

    # draft it
    curl -X POST https://lumelive.co.in/api/agent/report \
      -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"run_id":"m9x4kq-1a2b3c4d5e6f7a8b"}'

  Response 201:
    { "drafted": true, "run_id": "...", "status": "draft",
      "usage": { "input_tokens": ..., "output_tokens": ... } }

  The draft goes to reports/{run_id} at status "draft" and is not a
  deliverable. /api/agent/sign is what releases it, and only a counsellor
  holding the token can call that.

  dry_run exists because the first thing anybody wants to know about a
  new prompt is what it actually sends. It returns the assembled system
  blocks and user message without calling the model or writing anything.
*/

const { json, setCors, readBody } = require("../../http");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { checkAdminToken } = require("../../adminAuth");
const { getRun, latestRun } = require("../../assessments");
const { buildUserMessage, draftReport } = require("../../reportAgent");
const { systemBlocks } = require("../../reportStyle");
const { saveDraft } = require("../../reports");

// A run is addressed directly, or by whose latest profile it is. The
// second is what a counsellor actually has to hand after a session.
async function resolveProfile({ runId, uid }){
  if(runId) return await getRun(runId);
  if(uid) return await latestRun(String(uid));
  return null;
}

module.exports = async function handler(req, res){
  const gate = checkAdminToken(req, "AGENT_ADMIN_TOKEN", "agent");
  if(!gate.ok) return json(res, gate.status, gate.body);

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST"){
    return json(res, 405, { drafted:false, error:"Method not allowed" });
  }

  // Ahead of anything expensive. Drafting costs real money per call, so
  // this limit is about the bill as much as about abuse.
  const allowed = await checkRateLimit({
    key: "agent-report:" + clientKey(req),
    limit: 60,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed){
    return json(res, 429, { drafted:false, error:"Too many drafting requests. Please wait." });
  }

  let body;
  try{ body = await readBody(req); }
  catch(err){ return json(res, 400, { drafted:false, error:"Invalid JSON body." }); }

  const runId = String(body.run_id || "").trim();
  const uid = String(body.uid || "").trim();
  if(!runId && !uid){
    return json(res, 400, { drafted:false, error:"Give a run_id, or a uid to draft that account's latest profile." });
  }

  let profile;
  try{
    profile = await resolveProfile({ runId, uid });
  }catch(err){
    console.error("[lume agent] profile lookup failed:", err && err.message);
    return json(res, 503, { drafted:false, code:"STORE_UNAVAILABLE", error:"Couldn't reach saved profiles." });
  }

  if(!profile){
    return json(res, 404, { drafted:false, error:"No saved assessment profile for that run_id or account." });
  }

  if(body.dry_run === true){
    return json(res, 200, {
      drafted: false,
      dry_run: true,
      run_id: profile.runId,
      uid: profile.uid,
      system: systemBlocks().map(b => b.text),
      user_message: buildUserMessage(profile)
    });
  }

  let result;
  try{
    result = await draftReport(profile);
  }catch(err){
    /*
      Four ways this fails and they want different answers. A refusal or
      an incomplete draft is about this profile and retrying unchanged
      will do the same thing; a missing key or an outage is about us.
    */
    const code = err && err.code;
    if(code === "MODEL_REFUSED" || code === "INCOMPLETE_DRAFT" || code === "BAD_DRAFT" || code === "EMPTY_DRAFT"){
      console.error("[lume agent] drafting failed (" + code + "):", err.message);
      return json(res, 422, { drafted:false, code:code, error:err.message, problems:err.problems || null });
    }
    console.error("[lume agent] drafting error:", err && err.message);
    return json(res, 503, { drafted:false, code:"AGENT_UNAVAILABLE", error:"The drafting service is unavailable right now." });
  }

  try{
    const saved = await saveDraft({
      runId: profile.runId,
      uid: profile.uid,
      prose: result.draft,
      meta: { model: result.model, usage: result.usage }
    });
    return json(res, 201, {
      drafted: true,
      run_id: saved.runId,
      status: saved.status,
      model: saved.model,
      usage: saved.usage
    });
  }catch(err){
    if(err && err.code === "ALREADY_SIGNED"){
      return json(res, 409, { drafted:false, code:"ALREADY_SIGNED", error:err.message });
    }
    console.error("[lume agent] saving draft failed:", err && err.message);
    return json(res, 503, { drafted:false, code:"STORE_UNAVAILABLE", error:"Couldn't save the draft." });
  }
};
