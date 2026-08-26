/*
  POST /api/agent/cohort   — create a cohort, submit its batch, collect it
  GET  /api/agent/cohort   — list cohorts, or one with ?code=

  Armed by AGENT_ADMIN_TOKEN, like the other agent routes.

  The whole Phase 2 lifecycle, driven by an `action`:

    create     mint a code for a school group
    submit     send every saved profile carrying that code to the Batch API
    collect    read the finished batch, write per-student drafts
    summarise  compute the statistics and write the principal's summary

  Four steps rather than one call because a batch takes between minutes
  and a day. Anything that pretended to be synchronous here would be a
  request that times out and leaves a school half-drafted with no record
  of where it got to.

    # 1. mint a code, hand it to the school
    curl -X POST .../api/agent/cohort -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
      -d '{"action":"create","school":"DAV Public School","label":"Class 11 Science"}'

    # 2. once the class has taken it
    curl -X POST .../api/agent/cohort -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
      -d '{"action":"submit","code":"DAVPUBLIC-CLASS11-K7M4XQ"}'

    # 3. when the batch has ended
    curl -X POST .../api/agent/cohort -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
      -d '{"action":"collect","code":"DAVPUBLIC-CLASS11-K7M4XQ"}'

    # 4. the principal's document
    curl -X POST .../api/agent/cohort -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
      -d '{"action":"summarise","code":"DAVPUBLIC-CLASS11-K7M4XQ"}'

  Every drafted report lands at status "draft" exactly as a single one
  does. A batch does not sign anything — three hundred reports still need
  a counsellor, and the review queue is where they go.
*/

const { json, setCors, readBody } = require("../../http");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { checkAdminToken } = require("../../adminAuth");
const { listByCohort } = require("../../assessments");
const { saveDraft } = require("../../reports");
const { buildBatchRequests, collectResults, draftCohortSummary } = require("../../cohortAgent");
const { buildCohortStats, principalView } = require("../../cohortStats");
const cohorts = require("../../cohorts");

function batchClient(){
  const Anthropic = require("@anthropic-ai/sdk");
  return new Anthropic();
}

// ── actions ───────────────────────────────────────────────────────────

async function doCreate(body){
  const school = String(body.school || "").trim();
  const label = String(body.label || "").trim();
  if(!school && !label){
    return { status:400, body:{ ok:false, error:"Give the cohort a school and a label." } };
  }
  const cohort = await cohorts.createCohort({ school, label, createdBy: String(body.created_by || "") });
  return { status:201, body:{ ok:true, code:cohort.code, school:cohort.school, label:cohort.label, status:cohort.status } };
}

async function doSubmit(body){
  const code = String(body.code || "").trim().toUpperCase();
  const cohort = await cohorts.getCohort(code);
  if(!cohort) return { status:404, body:{ ok:false, error:"No cohort with that code." } };

  if(cohort.status === cohorts.STATUS.SUBMITTED && !body.resubmit){
    return { status:409, body:{ ok:false, code:"ALREADY_SUBMITTED",
      error:"A batch for this cohort is already running. Collect it, or pass resubmit:true." } };
  }

  const profiles = await listByCohort(code);
  if(!profiles.length){
    return { status:400, body:{ ok:false, error:"No saved assessments carry that cohort code yet." } };
  }

  const requests = buildBatchRequests(profiles);

  if(body.dry_run === true){
    return { status:200, body:{ ok:true, dry_run:true, code:code,
      students:profiles.length,
      custom_ids: requests.map(r => r.custom_id) } };
  }

  let batch;
  try{
    batch = await batchClient().messages.batches.create({ requests: requests });
  }catch(err){
    console.error("[lume cohort] batch submit failed:", err && err.message);
    await cohorts.markFailed({ code: code, reason: "submit_failed" });
    return { status:503, body:{ ok:false, code:"SUBMIT_FAILED", error:"Could not submit the batch." } };
  }

  await cohorts.markSubmitted({ code: code, batchId: batch.id, runIds: profiles.map(p => p.runId) });
  return { status:202, body:{ ok:true, code:code, batch_id:batch.id, students:profiles.length,
    status:cohorts.STATUS.SUBMITTED } };
}

async function doCollect(body){
  const code = String(body.code || "").trim().toUpperCase();
  const cohort = await cohorts.getCohort(code);
  if(!cohort) return { status:404, body:{ ok:false, error:"No cohort with that code." } };
  if(!cohort.batchId) return { status:400, body:{ ok:false, error:"Nothing has been submitted for this cohort." } };

  const client = batchClient();

  let batch;
  try{
    batch = await client.messages.batches.retrieve(cohort.batchId);
  }catch(err){
    console.error("[lume cohort] batch retrieve failed:", err && err.message);
    return { status:503, body:{ ok:false, error:"Could not reach the batch." } };
  }

  // Not an error — most of the time this is the honest answer.
  if(batch.processing_status !== "ended"){
    return { status:200, body:{ ok:true, ready:false, code:code,
      batch_id:cohort.batchId, processing_status:batch.processing_status,
      request_counts: batch.request_counts || null } };
  }

  /*
    The roster is the one recorded at submission, not a fresh query. A
    student who took the assessment while the batch was running is not a
    missing result; they are simply in the next batch.
  */
  const submitted = await listByCohort(code);
  const roster = submitted.filter(p => (cohort.runIds || []).indexOf(p.runId) !== -1);

  let collected;
  try{
    collected = await collectResults(await client.messages.batches.results(cohort.batchId), roster);
  }catch(err){
    console.error("[lume cohort] reading results failed:", err && err.message);
    return { status:503, body:{ ok:false, error:"Could not read the batch results." } };
  }

  const byRunId = new Map(roster.map(p => [String(p.runId), p]));
  const failures = collected.failed.slice();
  let written = 0;

  for(const [runId, result] of collected.drafted){
    const profile = byRunId.get(runId);
    try{
      await saveDraft({
        runId: runId,
        uid: profile.uid,
        prose: result.prose,
        meta: { model: result.model, usage: result.usage }
      });
      written++;
    }catch(err){
      // A report already signed is not a failure to report on; it is a
      // report that is further along than this batch.
      failures.push({ runId: runId, reason: err && err.code === "ALREADY_SIGNED" ? "already_signed" : "save_failed",
                      detail: err && err.message });
    }
  }

  await cohorts.markDrafted({ code: code, drafted: written, failures: failures });

  return { status:200, body:{ ok:true, ready:true, code:code,
    drafted: written, failed: failures.length, failures: failures,
    status: cohorts.STATUS.DRAFTED } };
}

async function doSummarise(body){
  const code = String(body.code || "").trim().toUpperCase();
  const cohort = await cohorts.getCohort(code);
  if(!cohort) return { status:404, body:{ ok:false, error:"No cohort with that code." } };

  const profiles = await listByCohort(code);
  if(!profiles.length){
    return { status:400, body:{ ok:false, error:"No saved assessments carry that cohort code." } };
  }

  const stats = buildCohortStats(profiles);

  if(body.dry_run === true){
    return { status:200, body:{ ok:true, dry_run:true, code:code, principal: principalView(stats) } };
  }

  let result;
  try{
    result = await draftCohortSummary({ stats: stats, cohort: cohort });
  }catch(err){
    const code2 = err && err.code;
    if(code2 === "SUMMARY_LEAKED_IDENTIFIER" || code2 === "MODEL_REFUSED" || code2 === "BAD_SUMMARY" || code2 === "EMPTY_SUMMARY"){
      console.error("[lume cohort] summary rejected (" + code2 + "):", err.message);
      return { status:422, body:{ ok:false, code:code2, error:err.message } };
    }
    console.error("[lume cohort] summary failed:", err && err.message);
    return { status:503, body:{ ok:false, error:"Could not draft the summary." } };
  }

  await cohorts.markSummarised({ code: code, summary: result.summary, stats: principalView(stats) });

  return { status:200, body:{ ok:true, code:code, status:cohorts.STATUS.SUMMARISED,
    summary: result.summary, usage: result.usage } };
}

const ACTIONS = { create: doCreate, submit: doSubmit, collect: doCollect, summarise: doSummarise };

module.exports = async function handler(req, res){
  const gate = checkAdminToken(req, "AGENT_ADMIN_TOKEN", "agent");
  if(!gate.ok) return json(res, gate.status, gate.body);

  setCors(req, res, "GET,POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }

  const allowed = await checkRateLimit({
    key: "agent-cohort:" + clientKey(req),
    limit: 120,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed) return json(res, 429, { ok:false, error:"Too many requests. Please wait." });

  if(req.method === "GET"){
    const url = new URL(req.url, "http://localhost");
    const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
    try{
      if(code){
        const cohort = await cohorts.getCohort(code);
        if(!cohort) return json(res, 200, { ok:true, found:false, code:code });
        const profiles = await listByCohort(code);
        return json(res, 200, { ok:true, found:true, cohort: cohort, assessments: profiles.length });
      }
      const rows = await cohorts.listCohorts();
      return json(res, 200, { ok:true, count: rows.length, cohorts: rows.map(c => ({
        code:c.code, school:c.school, label:c.label, status:c.status,
        drafted:c.drafted, created_at:c.createdAt
      })) });
    }catch(err){
      console.error("[lume cohort] listing failed:", err && err.message);
      return json(res, 503, { ok:false, error:"Could not reach cohorts." });
    }
  }

  if(req.method !== "POST"){
    return json(res, 405, { ok:false, error:"Method not allowed" });
  }

  let body;
  try{ body = await readBody(req); }
  catch(err){ return json(res, 400, { ok:false, error:"Invalid JSON body." }); }

  const action = ACTIONS[String(body.action || "")];
  if(!action){
    return json(res, 400, { ok:false, error:"action must be one of: create, submit, collect, summarise." });
  }

  try{
    const result = await action(body);
    return json(res, result.status, result.body);
  }catch(err){
    console.error("[lume cohort] " + body.action + " failed:", err && err.message);
    return json(res, 503, { ok:false, error:"That step could not be completed." });
  }
};
