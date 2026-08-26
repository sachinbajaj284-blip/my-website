/*
  GET /api/agent/cohort-attention?code=...

  The students in a cohort worth a counsellor's time, by name.

  Armed by AGENT_ADMIN_TOKEN, like the other agent routes.

  ── Why this is its own route ──

  Everything else about a cohort is counts. This is the one response that
  carries identifiers for a list of children, and it is a separate URL
  with a blunt name so that nobody adds it to the principal's payload by
  reaching for "the rest of the cohort data". /api/agent/cohort returns
  principalView(); this returns counsellorView(); the two never travel
  together.

  ── What is in it, and what is deliberately not ──

  Three lists, none of them clinical:

    worthATalk       strongest interests point away from the stream
                     they are already enrolled in
    noClearSignal    no interest stands out, so the assessment did not
                     narrow anything down
    checkResponses   answered near-identically throughout — a data
                     quality note, not a judgement about the student

  There is no wellbeing list and there must not be one. Phase 0 does not
  store the wellbeing screener, and when it does, a list of distressed
  minors is not something an HTTP endpoint hands over on a bearer token.

  These are prompts for a conversation. Nothing here says a student chose
  wrong, and the reasons are phrased so they can be read aloud to the
  student without causing harm — which is the test any line on this list
  has to pass.
*/

const { json, setCors } = require("../../http");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { checkAdminToken } = require("../../adminAuth");
const { listByCohort } = require("../../assessments");
const { buildCohortStats, counsellorView } = require("../../cohortStats");
const { getCohort } = require("../../cohorts");

module.exports = async function handler(req, res){
  const gate = checkAdminToken(req, "AGENT_ADMIN_TOKEN", "agent");
  if(!gate.ok) return json(res, gate.status, gate.body);

  setCors(req, res, "GET,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "GET"){
    return json(res, 405, { ok:false, error:"Method not allowed" });
  }

  const allowed = await checkRateLimit({
    key: "agent-attention:" + clientKey(req),
    limit: 120,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed) return json(res, 429, { ok:false, error:"Too many requests. Please wait." });

  const url = new URL(req.url, "http://localhost");
  const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
  if(!code) return json(res, 400, { ok:false, error:"A cohort code is required." });

  try{
    const cohort = await getCohort(code);
    if(!cohort) return json(res, 404, { ok:false, error:"No cohort with that code." });

    const profiles = await listByCohort(code);
    const stats = buildCohortStats(profiles);

    return json(res, 200, {
      ok: true,
      code: code,
      students: profiles.length,
      attention: counsellorView(stats),
      // Said in the payload as well as the docs, because this response
      // will end up pasted somewhere at some point.
      note: "For the school's counsellor only. Not for the principal's copy, and not a clinical assessment."
    });
  }catch(err){
    console.error("[lume cohort] attention list failed:", err && err.message);
    return json(res, 503, { ok:false, error:"Could not build the list." });
  }
};
