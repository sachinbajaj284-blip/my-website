/*
  GET /api/agent/draft?run_id=...

  One drafted report, with everything the review screen needs to render
  it: the drafted prose, the saved profile it came from, and the merged
  LUME_REPORT_DATA that report-template.html renders.

  Armed by AGENT_ADMIN_TOKEN, same as the other agent routes.

    curl "https://lumelive.co.in/api/agent/draft?run_id=m9x4kq-..." \
      -H "Authorization: Bearer $AGENT_ADMIN_TOKEN"

  Response 200:
    { "found": true, "run_id": "...", "status": "draft",
      "prose": { ...editable fields... },
      "report_data": { ...what the template renders... },
      "edits": null }

  The merged report_data is built here rather than in the browser so the
  review screen shows exactly what a client would see, using the same
  buildReportData() a delivered report goes through. A preview assembled
  differently from the real thing is a preview that lies.
*/

const { json, setCors } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { checkAdminToken } = require("../_lib/adminAuth");
const { getReport, buildReportData, STATUS_SIGNED } = require("../_lib/reports");
const { getRun } = require("../_lib/assessments");

module.exports = async function handler(req, res){
  const gate = checkAdminToken(req, "AGENT_ADMIN_TOKEN", "agent");
  if(!gate.ok) return json(res, gate.status, gate.body);

  setCors(req, res, "GET,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "GET"){
    return json(res, 405, { found:false, error:"Method not allowed" });
  }

  const allowed = await checkRateLimit({
    key: "agent-draft:" + clientKey(req),
    limit: 300,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed){
    return json(res, 429, { found:false, error:"Too many requests. Please wait." });
  }

  const url = new URL(req.url, "http://localhost");
  const runId = String(url.searchParams.get("run_id") || "").trim();
  if(!runId){
    return json(res, 400, { found:false, error:"A run_id is required." });
  }

  try{
    const report = await getReport(runId);
    if(!report) return json(res, 200, { found:false, run_id:runId });

    const profile = await getRun(runId);

    // A signed report shows what was released; an unsigned one shows the
    // draft. Reviewing the model's words after somebody has already
    // edited them would be reviewing the wrong document.
    const prose = report.status === STATUS_SIGNED
      ? (report.finalProse || report.draftProse)
      : report.draftProse;

    return json(res, 200, {
      found: true,
      run_id: report.runId,
      uid: report.uid,
      status: report.status,
      model: report.model,
      usage: report.usage,
      drafted_at: report.draftedAt,
      signed_by: report.signedBy,
      signed_at: report.signedAt,
      edits: report.edits,
      prose: prose,
      profile: profile ? { scores: profile.scores, context: profile.context } : null,
      report_data: profile ? buildReportData({ profile: profile, prose: prose, client: {} }) : null
    });
  }catch(err){
    console.error("[lume agent] draft read failed:", err && err.message);
    return json(res, 503, { found:false, error:"Couldn't reach the report." });
  }
};
