/*
  Tests for cohort batch drafting — run with:  npm run cohort:test

  Phase 2 is Phase 1 run three hundred at a time. Two things go
  catastrophically wrong at that scale and both are tested here first:
  matching results to students by position instead of by custom_id, which
  silently sends every report to the wrong child; and letting a named list
  of teenagers into the document that goes to a principal.

  Everything else — the arithmetic, the batch lifecycle — follows.

  No test makes an API call. The batch client and the summary call are
  both injected.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";

const store = install();

const require = createRequire(import.meta.url);
const { buildBatchRequests, collectResults, draftCohortSummary, buildSummaryMessage } = require("../api/_lib/cohortAgent.js");
const { buildCohortStats, principalView, counsellorView, enrolledStream, spread, hollandCode } = require("../api/_lib/cohortStats.js");
const cohorts = require("../api/_lib/cohorts.js");
const { validate } = require("../api/_lib/assessments.js");
const { RIASEC, ANCHORS, VARK } = require("../api/_lib/reportTables.js");
const attentionHandler = require("../api/_lib/routes/agent/cohort-attention.js");

let passed = 0, failed = 0;

async function test(name, fn){
  try{ await fn(); passed++; console.log("  ✓ " + name); }
  catch(err){ failed++; console.log("  ✗ " + name + "\n      " + (err && err.message || err)); }
}

const ADMIN_TOKEN = "agent-admin-" + "z".repeat(24);

// ── fixtures ──────────────────────────────────────────────────────────

function profileFor(uid, riasec, stage){
  return {
    runId: "run-" + uid,
    uid: uid,
    cohort: "TESTSCH-CLASS11-K7M4XQ",
    scores: {
      riasec: Object.assign({ max:7 }, riasec),
      anchors: { MA:28, IN:19, AU:21, ST:14, EN:11, SV:36, CH:31, WF:17, max:42 },
      vark: { V:8, A:3, R:10, K:5, max:16 },
      bigfive: { E:22, A:31, C:29, N:18, O:34, max:40 }
    },
    context: { stage: stage || "Class 11 Science", age:16, city:"Rohtak" },
    createdAt: "2026-08-2" + (uid.length % 9) + "T10:00:00.000Z"
  };
}

function proseFor(tag){
  const riasec = {};
  for(const k of Object.keys(RIASEC)) riasec[k] = {
    meaning: tag + " meaning " + k,
    realLife: [tag + " rl1 " + k, tag + " rl2 " + k],
    nextStep: tag + " step " + k
  };
  const anchors = {};
  for(const k of Object.keys(ANCHORS)) anchors[k] = { nextStep: tag + " anchor " + k };
  const vark = {};
  for(const k of Object.keys(VARK)) vark[k] = { nextStep: tag + " vark " + k };
  return { riasec, anchors, vark,
    personality: { trait:"O", desc: tag + " personality" },
    careerDirections: [tag+"1", tag+"2", tag+"3", tag+"4", tag+"5", tag+"6"] };
}

function batchRow(runId, prose){
  return {
    custom_id: runId,
    result: { type:"succeeded", message: {
      content:[{ type:"text", text: JSON.stringify(prose) }],
      usage:{ input_tokens: 12000, output_tokens: 3400 },
      model: "claude-opus-5"
    } }
  };
}

function mockRes(){
  return { statusCode:0, headers:{}, body:null,
    setHeader(k,v){ this.headers[k]=v; },
    end(p){ this.body = p ? JSON.parse(p) : null; } };
}
function mockReq({ method="GET", token, url="/" } = {}){
  const headers = { "content-type":"application/json" };
  if(token) headers.authorization = "Bearer " + token;
  return { method, headers, url, socket:{ remoteAddress:"127.0.0.1" },
    on(e, cb){ if(e==="data") cb(Buffer.from("{}")); if(e==="end") cb(); return this; } };
}
async function call(handler, options){
  const res = mockRes();
  await handler(mockReq(options), res);
  return res;
}

// ── the bug that must not ship ────────────────────────────────────────

console.log("\nmatching results to students");

await test("results arriving in a different order still reach the right student", async () => {
  const profiles = ["aa","bb","cc","dd","ee","ff"].map(u => profileFor(u, { R:1,I:6,A:2,S:3,E:1,C:2 }));

  // Deliberately reversed, which is what "arbitrary order" means in practice.
  const rows = profiles.map(p => batchRow(p.runId, proseFor(p.uid))).reverse();

  const { drafted, failed } = await collectResults(rows, profiles);
  assert.equal(failed.length, 0);
  assert.equal(drafted.size, 6);

  for(const p of profiles){
    const got = drafted.get(p.runId);
    assert.match(got.prose.riasec.I.meaning, new RegExp("^" + p.uid + " "),
      "student " + p.uid + " received another student's report");
  }
});

await test("a shuffled batch of thirty still matches one-to-one", async () => {
  const profiles = Array.from({ length: 30 }, (_, i) => profileFor("s" + i, { R:1,I:6,A:2,S:3,E:1,C:2 }));
  const rows = profiles.map(p => batchRow(p.runId, proseFor(p.uid)));
  for(let i = rows.length - 1; i > 0; i--){        // deterministic shuffle
    const j = (i * 7 + 3) % (i + 1);
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  const { drafted } = await collectResults(rows, profiles);
  for(const p of profiles){
    assert.match(drafted.get(p.runId).prose.personality.desc, new RegExp("^" + p.uid + " "));
  }
});

await test("a result for a run we never submitted is a failure, not a silent skip", async () => {
  const profiles = [profileFor("aa", { R:1,I:6,A:2,S:3,E:1,C:2 })];
  const rows = [batchRow("run-aa", proseFor("aa")), batchRow("run-stranger", proseFor("x"))];

  const { drafted, failed } = await collectResults(rows, profiles);
  assert.equal(drafted.size, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].reason, "unknown_custom_id");
});

await test("a submitted run with no result is reported", async () => {
  const profiles = ["aa","bb"].map(u => profileFor(u, { R:1,I:6,A:2,S:3,E:1,C:2 }));
  const { drafted, failed } = await collectResults([batchRow("run-aa", proseFor("aa"))], profiles);
  assert.equal(drafted.size, 1);
  assert.deepEqual(failed.map(f => [f.runId, f.reason]), [["run-bb", "no_result"]]);
});

await test("two results for the same run do not overwrite each other silently", async () => {
  const profiles = [profileFor("aa", { R:1,I:6,A:2,S:3,E:1,C:2 })];
  const rows = [batchRow("run-aa", proseFor("first")), batchRow("run-aa", proseFor("second"))];
  const { drafted, failed } = await collectResults(rows, profiles);
  assert.equal(drafted.size, 1);
  assert.match(drafted.get("run-aa").prose.personality.desc, /^first /);
  assert.equal(failed[0].reason, "duplicate_result");
});

await test("a failed or refused row does not become a report", async () => {
  const profiles = ["aa","bb","cc"].map(u => profileFor(u, { R:1,I:6,A:2,S:3,E:1,C:2 }));
  const rows = [
    batchRow("run-aa", proseFor("aa")),
    { custom_id:"run-bb", result:{ type:"errored", error:{ type:"invalid_request" } } },
    { custom_id:"run-cc", result:{ type:"succeeded", message:{
        stop_reason:"refusal", stop_details:{ category:"reasoning_extraction" }, content:[] } } }
  ];
  const { drafted, failed } = await collectResults(rows, profiles);
  assert.equal(drafted.size, 1);
  assert.deepEqual(failed.map(f => f.reason).sort(), ["errored", "refusal"]);
});

await test("an incomplete draft in a batch is held to the same bar as a single one", async () => {
  const profiles = [profileFor("aa", { R:1,I:6,A:2,S:3,E:1,C:2 })];
  const broken = proseFor("aa");
  broken.riasec.C.nextStep = "";
  const { drafted, failed } = await collectResults([batchRow("run-aa", broken)], profiles);
  assert.equal(drafted.size, 0);
  assert.equal(failed[0].reason, "incomplete");
});

await test("every batch request carries its runId as custom_id", async () => {
  const profiles = ["aa","bb"].map(u => profileFor(u, { R:1,I:6,A:2,S:3,E:1,C:2 }));
  const requests = buildBatchRequests(profiles);
  assert.deepEqual(requests.map(r => r.custom_id), ["run-aa", "run-bb"]);
  assert.equal(requests[0].params.model, "claude-opus-5");
  assert.equal(requests[0].params.output_config.format.type, "json_schema");
  // Same cached prefix as a single draft — the batch discount and the
  // cache discount are separate and we want both.
  assert.deepEqual(requests[0].params.system, requests[1].params.system);
});

// ── what the principal may see ────────────────────────────────────────

console.log("\nwhat the principal may see");

/*
  Realistic Firebase-shaped uids, not readable labels. An earlier version
  of this file used uid "flat", which collides with the legitimate
  profileClarity.flat key and made the leak test pass for the wrong
  reason — a substring check is only as good as the strings it is given.
*/
const UID = {
  clearA:   "Kj8x2QaR4mN7pLz3WcY5Bv1XnH9t",
  clearB:   "Tf6yG2nQ8kM4rZ7wJ3vD5xB9cL1p",
  mismatch: "Mn9pLz4Kj8x2QaR7WcY5Bv1XnH3t",
  flat:     "Rt2WcY8Bv4XnH1Kj8x2QaR7mN5pL",
  straight: "Bv4XnH1Rt2WcY8Kj3x9QaR6mN2pZ"
};

const mixedCohort = [
  profileFor(UID.clearA, { R:1,I:6,A:2,S:3,E:1,C:2 }, "Class 11 Science"),
  profileFor(UID.clearB, { R:2,I:5,A:1,S:2,E:1,C:1 }, "Class 11 Science"),
  profileFor(UID.mismatch, { R:1,I:1,A:6,S:5,E:2,C:1 }, "Class 11 Science"),
  profileFor(UID.flat, { R:3,I:4,A:3,S:4,E:3,C:4 }, "Class 11 Commerce"),
  profileFor(UID.straight, { R:3,I:3,A:3,S:3,E:3,C:3 }, "Class 11 Commerce")
];

await test("the principal's view carries no identifier of any kind", async () => {
  const stats = buildCohortStats(mixedCohort);
  const text = JSON.stringify(principalView(stats));
  for(const p of mixedCohort){
    assert.ok(!text.includes(p.uid), "principal view leaked uid " + p.uid);
    assert.ok(!text.includes(p.runId), "principal view leaked runId " + p.runId);
  }
});

await test("the counsellor's view is the one that carries names", async () => {
  const stats = buildCohortStats(mixedCohort);
  const view = counsellorView(stats);
  assert.equal(view.totals.worthATalk, 1);
  assert.equal(view.worthATalk[0].uid, UID.mismatch);
  assert.equal(view.totals.noClearSignal, 1);
  assert.equal(view.noClearSignal[0].uid, UID.flat);
  assert.equal(view.totals.checkResponses, 1);
  assert.equal(view.checkResponses[0].uid, UID.straight);
});

await test("a student with no clear peak is never flagged as stream-mismatched", async () => {
  // Reading a mismatch off a profile with no signal would be inventing one.
  const stats = buildCohortStats([profileFor(UID.flat, { R:3,I:4,A:3,S:4,E:3,C:4 }, "Class 11 Science")]);
  assert.equal(stats.principal.streamAttention.checked, 0);
  assert.equal(stats.counsellor.worthATalk.length, 0);
});

await test("a straight-lined profile does not vote in the distributions", async () => {
  const stats = buildCohortStats([
    profileFor(UID.clearA, { R:1,I:6,A:2,S:3,E:1,C:2 }),
    profileFor(UID.straight, { R:3,I:3,A:3,S:3,E:3,C:3 })
  ]);
  assert.equal(stats.principal.students, 2);
  assert.equal(stats.principal.interestLeaders.length, 1);
  assert.equal(stats.principal.interestLeaders[0].key, "I");
  assert.equal(stats.principal.dataQuality.straightLined, 1);
});

await test("the reasons given are phrased so they could be read to the student", async () => {
  const stats = buildCohortStats(mixedCohort);
  const reasons = counsellorView(stats).worthATalk
    .concat(counsellorView(stats).noClearSignal, counsellorView(stats).checkResponses)
    .map(s => s.reason).join(" ").toLowerCase();
  for(const word of ["risk", "concern", "problem", "poor", "weak", "wrong", "fail"]){
    assert.ok(!reasons.includes(word), "reason text used the word '" + word + "'");
  }
});

await test("there is no wellbeing section anywhere", async () => {
  const stats = buildCohortStats(mixedCohort);
  const text = JSON.stringify(stats).toLowerCase();
  for(const word of ["wellbeing", "mental", "distress", "anxiety", "depress"]){
    assert.ok(!text.includes(word), "cohort stats mention '" + word + "' — Phase 0 does not store that instrument");
  }
});

await test("stage strings map to streams, and unknown ones stay unknown", async () => {
  assert.equal(enrolledStream("Class 12 Science"), "Science");
  assert.equal(enrolledStream("Class 11 PCB"), "Science");
  assert.equal(enrolledStream("Class 11 Commerce"), "Commerce");
  assert.equal(enrolledStream("Class 12 Humanities"), "Humanities");
  assert.equal(enrolledStream("B.Tech final year"), null);
  assert.equal(enrolledStream(""), null);
});

// ── the summary call ──────────────────────────────────────────────────

console.log("\nthe principal's summary");

const cohortRecord = { code:"TESTSCH-CLASS11-K7M4XQ", school:"Test School", label:"Class 11" };

function summaryReturning(summary){
  return async () => ({
    content: [{ type:"text", text: JSON.stringify(summary) }],
    usage: { input_tokens: 900, output_tokens: 700 },
    model: "claude-opus-5"
  });
}

const goodSummary = {
  headline: "A cohort that leans Investigative with a wide spread of work values.",
  overview: "Most of this group lead with Investigative interests.",
  standsOut: [{ title:"Investigative lean", detail:"Two in five lead here." },
              { title:"Written notes dominate", detail:"Most learn best from text." }],
  forTeaching: "Written summaries will land better than discussion for most of this group.",
  whereToSpendAttention: "One student has no clear signal and one sits in a stream their interests do not point at."
};

await test("the model is given computed numbers, never asked to count", async () => {
  const stats = buildCohortStats(mixedCohort);
  const msg = buildSummaryMessage({ stats, cohort: cohortRecord });
  assert.match(msg, /Students assessed: 5/);
  assert.match(msg, /No interest stands out: 1/);
  assert.match(msg, /strongest interests point away from that stream: 1/);
});

await test("the summary prompt carries no student identifier", async () => {
  const stats = buildCohortStats(mixedCohort);
  const msg = buildSummaryMessage({ stats, cohort: cohortRecord });
  for(const p of mixedCohort){
    assert.ok(!msg.includes(p.uid), "summary prompt leaked " + p.uid);
    assert.ok(!msg.includes(p.runId), "summary prompt leaked " + p.runId);
  }
});

await test("a summary is produced from the statistics", async () => {
  const stats = buildCohortStats(mixedCohort);
  const out = await draftCohortSummary({ stats, cohort: cohortRecord },
    { createMessage: summaryReturning(goodSummary) });
  assert.equal(out.summary.headline, goodSummary.headline);
});

await test("a summary that names a student is discarded, not published", async () => {
  const stats = buildCohortStats(mixedCohort);
  const leaky = Object.assign({}, goodSummary, {
    whereToSpendAttention: "Student " + UID.mismatch + " in particular should be seen first."
  });
  await assert.rejects(
    draftCohortSummary({ stats, cohort: cohortRecord }, { createMessage: summaryReturning(leaky) }),
    err => err.code === "SUMMARY_LEAKED_IDENTIFIER"
  );
});

await test("a refused summary is reported rather than stored", async () => {
  const stats = buildCohortStats(mixedCohort);
  await assert.rejects(
    draftCohortSummary({ stats, cohort: cohortRecord }, { createMessage: async () => ({
      stop_reason:"refusal", stop_details:{ category:"unspecified" }, content:[] }) }),
    err => err.code === "MODEL_REFUSED"
  );
});

// ── cohort records ────────────────────────────────────────────────────

console.log("\ncohort records");

await test("a minted code is not guessable from the school's name", async () => {
  store.clear();
  const a = await cohorts.createCohort({ school:"DAV Public School", label:"Class 11 Science" });
  const b = await cohorts.createCohort({ school:"DAV Public School", label:"Class 11 Science" });
  assert.notEqual(a.code, b.code, "two groups at the same school must not collide");
  assert.match(a.code, /^DAVPUBLIC-CLASS11SC-[A-Z0-9]{6}$/);
  // No characters a teacher would misread down a phone.
  assert.ok(!/[OI015S]/.test(a.code.split("-").pop()));
});

await test("a cohort code on a saved assessment is validated for shape", async () => {
  const base = { consent:true, scores:{ riasec:{ R:1,I:6,A:2,S:3,E:1,C:2 } } };
  assert.equal(validate(Object.assign({ cohort:"DAVPUBLIC-CLASS11-K7M4XQ" }, base)).ok, true);
  assert.equal(validate(Object.assign({ cohort:"lowercase-ok" }, base)).doc.cohort, "LOWERCASE-OK");
  assert.equal(validate(Object.assign({ cohort:"has spaces" }, base)).ok, false);
  assert.equal(validate(Object.assign({ cohort:"x".repeat(80) }, base)).ok, false);
  // Absent is normal — most people take this on their own.
  assert.equal(validate(base).doc.cohort, null);
});

await test("the batch roster is recorded at submission, not re-derived later", async () => {
  store.clear();
  const cohort = await cohorts.createCohort({ school:"Test", label:"11A" });
  await cohorts.markSubmitted({ code: cohort.code, batchId:"batch_123", runIds:["run-aa","run-bb"] });

  const after = await cohorts.getCohort(cohort.code);
  assert.equal(after.status, cohorts.STATUS.SUBMITTED);
  assert.equal(after.batchId, "batch_123");
  assert.deepEqual(after.runIds, ["run-aa","run-bb"]);
});

await test("a summarised cohort stores the principal's half only", async () => {
  store.clear();
  const cohort = await cohorts.createCohort({ school:"Test", label:"11A" });
  const stats = buildCohortStats(mixedCohort);
  await cohorts.markSummarised({ code: cohort.code, summary: goodSummary, stats: principalView(stats) });

  const stored = JSON.stringify(await cohorts.getCohort(cohort.code));
  for(const p of mixedCohort){
    assert.ok(!stored.includes(p.uid), "the cohort document became a roster of flagged students");
  }
});

// ── the attention route ───────────────────────────────────────────────

console.log("\nthe attention route");

await test("unarmed, it answers 404", async () => {
  delete process.env.AGENT_ADMIN_TOKEN;
  const res = await call(attentionHandler, { token: ADMIN_TOKEN, url:"/api/agent/cohort-attention?code=X" });
  assert.equal(res.statusCode, 404);
});

await test("armed, a wrong token is a flat 401", async () => {
  process.env.AGENT_ADMIN_TOKEN = ADMIN_TOKEN;
  const res = await call(attentionHandler, { token:"w".repeat(32), url:"/api/agent/cohort-attention?code=X" });
  assert.equal(res.statusCode, 401);
});

await test("it returns the named lists, labelled for the counsellor", async () => {
  process.env.AGENT_ADMIN_TOKEN = ADMIN_TOKEN;
  store.clear();
  const cohort = await cohorts.createCohort({ school:"Test", label:"11A" });
  mixedCohort.forEach(p => store.seed("assessments", p.runId, Object.assign({}, p, { cohort: cohort.code })));

  const res = await call(attentionHandler, { token: ADMIN_TOKEN,
    url: "/api/agent/cohort-attention?code=" + cohort.code });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.students, 5);
  assert.equal(res.body.attention.totals.worthATalk, 1);
  assert.match(res.body.note, /counsellor only/i);
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
