/*
  GET /api/agent/queue

  The reports waiting for a counsellor, oldest first.

  Armed by AGENT_ADMIN_TOKEN, same as the other agent routes.

    curl https://lumelive.co.in/api/agent/queue \
      -H "Authorization: Bearer $AGENT_ADMIN_TOKEN"

  Response 200:
    { "count": 2, "drafts": [ { "run_id": "...", "uid": "...",
                                "drafted_at": "...", "model": "..." } ] }

  Deliberately a list of handles, not of prose. The queue is read to
  decide what to open next; the words themselves come from
  /api/agent/draft?run_id=... one report at a time. Shipping every
  drafted report in one response would make this the single most
  sensitive payload on the site, for no benefit to the person reading it.
*/

const { json, setCors } = require("../../http");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { checkAdminToken } = require("../../adminAuth");
const { listDrafts } = require("../../reports");

module.exports = async function handler(req, res){
  const gate = checkAdminToken(req, "AGENT_ADMIN_TOKEN", "agent");
  if(!gate.ok) return json(res, gate.status, gate.body);

  setCors(req, res, "GET,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "GET"){
    return json(res, 405, { error:"Method not allowed" });
  }

  const allowed = await checkRateLimit({
    key: "agent-queue:" + clientKey(req),
    limit: 300,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed){
    return json(res, 429, { error:"Too many requests. Please wait." });
  }

  try{
    const drafts = await listDrafts();
    return json(res, 200, {
      count: drafts.length,
      drafts: drafts.map(d => ({
        run_id: d.runId,
        uid: d.uid,
        drafted_at: d.draftedAt,
        model: d.model
      }))
    });
  }catch(err){
    console.error("[lume agent] queue failed:", err && err.message);
    return json(res, 503, { error:"Couldn't reach the review queue." });
  }
};
