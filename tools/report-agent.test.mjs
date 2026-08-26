/*
  Tests for the report drafting agent — run with:  npm run report:test

  Phase 1 turns a saved profile into prose a counsellor signs. The rules
  worth holding still are: the model never writes a number, a draft is
  never a deliverable, a report cannot be signed by nobody, and what the
  counsellor changed is recorded so the prompt can be tuned on evidence
  rather than on impressions.

  No test here makes an API call. draftReport() takes an injectable
  createMessage for exactly this reason, so the drafting rules can be
  exercised without an API key, a network, or a rupee of spend.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";

const store = install();

const require = createRequire(import.meta.url);
const { buildSchema, buildUserMessage, validateDraft, draftReport } = require("../api/_lib/reportAgent.js");
const { buildReportData, saveDraft, signReport, diffProse, getReport, listDrafts, releasedProse,
        STATUS_DRAFT, STATUS_SIGNED, COLLECTION } = require("../api/_lib/reports.js");
const { RIASEC, ANCHORS, VARK, BIGFIVE } = require("../api/_lib/reportTables.js");
const reportHandler = require("../api/agent/report.js");
const signHandler = require("../api/agent/sign.js");
const queueHandler = require("../api/agent/queue.js");

let passed = 0;
let failed = 0;

async function test(name, fn){
  try{
    await fn();
    passed += 1;
    console.log("  ✓ " + name);
  }catch(err){
    failed += 1;
    console.log("  ✗ " + name + "\n      " + (err && err.message || err));
  }
}

// ── fixtures ──────────────────────────────────────────────────────────

const ADMIN_TOKEN = "agent-admin-" + "z".repeat(24);

const profile = {
  runId: "run-abc123",
  uid: "uid-asha",
  schemaVersion: 1,
  instrument: "student-full-v1",
  scores: {
    riasec:  { R:3, I:6, A:4, S:5, E:2, C:2, max:7 },
    anchors: { MA:28, IN:19, AU:21, ST:14, EN:11, SV:36, CH:31, WF:17, max:42 },
    vark:    { V:8, A:3, R:10, K:5, max:16 },
    bigfive: { E:22, A:31, C:29, N:18, O:34, max:40 }
  },
  context: { stage:"Class 12 Science", age:17, city:"Rohtak", concern:"Confused about streams" },
  createdAt: "2026-08-20T10:00:00.000Z"
};

// A complete, well-formed draft — what a good model call returns.
function goodDraft(){
  const riasec = {};
  for(const k of Object.keys(RIASEC)){
    riasec[k] = {
      meaning: "You tend to lean this way, " + k + ".",
      realLife: ["An example for " + k + ".", "A second example for " + k + "."],
      nextStep: "Try one small thing this week for " + k + "."
    };
  }
  const anchors = {};
  for(const k of Object.keys(ANCHORS)) anchors[k] = { nextStep: "A step for " + k + "." };
  const vark = {};
  for(const k of Object.keys(VARK)) vark[k] = { nextStep: "A habit for " + k + "." };

  return {
    riasec, anchors, vark,
    personality: { trait: "O", desc: "You tend to be curious about new ideas." },
    careerDirections: ["Medicine & Healthcare","Research & Science","Psychology","Public Health","Science Writing","Teaching"]
  };
}

function modelReturning(draft, extra){
  return async () => Object.assign({
    content: [{ type: "text", text: JSON.stringify(draft) }],
    usage: { input_tokens: 12000, output_tokens: 3400 },
    model: "claude-opus-5"
  }, extra || {});
}

function mockRes(){
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v){ this.headers[k] = v; },
    end(payload){ this.body = payload ? JSON.parse(payload) : null; }
  };
}

function mockReq({ method = "POST", token, body = {}, url = "/" } = {}){
  const raw = JSON.stringify(body);
  const headers = { "content-type": "application/json" };
  if(token) headers.authorization = "Bearer " + token;
  return {
    method, headers, url,
    socket: { remoteAddress: "127.0.0.1" },
    on(event, cb){
      if(event === "data") cb(Buffer.from(raw));
      if(event === "end") cb();
      return this;
    }
  };
}

async function call(handler, options){
  const res = mockRes();
  await handler(mockReq(options), res);
  return res;
}

function seedProfile(){
  store.seed("assessments", profile.runId, profile);
}

// ── the model never writes a number ───────────────────────────────────

console.log("\nwhat the model is allowed to write");

await test("the output schema has no numeric field anywhere", async () => {
  const schema = buildSchema(profile);
  const seen = [];
  (function walk(node, path){
    if(!node || typeof node !== "object") return;
    if(node.type === "number" || node.type === "integer") seen.push(path);
    for(const key of Object.keys(node)) walk(node[key], path + "." + key);
  })(schema, "");
  assert.deepEqual(seen, [], "a numeric slot lets the model contradict a client's scores");
});

await test("the schema asks for prose on every key the profile carries", async () => {
  const schema = buildSchema(profile);
  assert.deepEqual(Object.keys(schema.properties.riasec.properties).sort(), Object.keys(RIASEC).sort());
  assert.deepEqual(Object.keys(schema.properties.anchors.properties).sort(), Object.keys(ANCHORS).sort());
  assert.deepEqual(Object.keys(schema.properties.vark.properties).sort(), Object.keys(VARK).sort());
  assert.equal(schema.additionalProperties, false);
});

await test("an instrument the client did not take gets no slot", async () => {
  const partial = { scores: { riasec: profile.scores.riasec }, context: {} };
  const schema = buildSchema(partial);
  assert.ok(schema.properties.riasec);
  assert.ok(!schema.properties.anchors, "asking for anchors prose with no anchor scores invites invention");
  assert.ok(!schema.properties.personality);
});

await test("the user message carries scores and context, highest first", async () => {
  const msg = buildUserMessage(profile);
  assert.match(msg, /Class 12 Science/);
  assert.match(msg, /Confused about streams/);
  // Investigative (6) must appear before Enterprising (2).
  assert.ok(msg.indexOf("Investigative") < msg.indexOf("Enterprising"));
  assert.match(msg, /Investigative \(I\): 6 out of 7/);
});

// ── draft completeness ────────────────────────────────────────────────

console.log("\ndraft completeness");

await test("a complete draft passes", async () => {
  assert.equal(validateDraft(goodDraft(), profile).ok, true);
});

await test("a missing nextStep is caught", async () => {
  const d = goodDraft();
  d.riasec.C.nextStep = "";
  const r = validateDraft(d, profile);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(" "), /riasec\.C\.nextStep/);
});

await test("a low-scoring interest cannot be silently skipped", async () => {
  const d = goodDraft();
  delete d.riasec.E;                       // Enterprising, their lowest
  const r = validateDraft(d, profile);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(" "), /riasec\.E/);
});

await test("realLife must have exactly two items", async () => {
  const d = goodDraft();
  d.riasec.I.realLife = ["only one"];
  assert.equal(validateDraft(d, profile).ok, false);
});

await test("an unknown personality trait is caught", async () => {
  const d = goodDraft();
  d.personality.trait = "Z";
  assert.equal(validateDraft(d, profile).ok, false);
});

await test("careerDirections must be exactly six", async () => {
  const d = goodDraft();
  d.careerDirections = ["one", "two"];
  assert.equal(validateDraft(d, profile).ok, false);
});

// ── the model call ────────────────────────────────────────────────────

console.log("\nthe model call");

await test("the request pins the model, the schema and the cached prefix", async () => {
  let sent = null;
  await draftReport(profile, { createMessage: async (req) => { sent = req; return modelReturning(goodDraft())(); } });

  assert.equal(sent.model, "claude-opus-5");
  assert.equal(sent.output_config.format.type, "json_schema");
  assert.equal(sent.thinking.type, "adaptive");
  assert.ok(!("budget_tokens" in sent.thinking), "budget_tokens is rejected on this model");
  assert.equal(sent.cache_control.type, "ephemeral");
  assert.equal(sent.system.length, 2, "house style and exemplar are two cached blocks");
  assert.equal(sent.fallbacks, "default");
});

await test("the cached prefix does not vary between two different clients", async () => {
  const requests = [];
  const capture = async (req) => { requests.push(req); return modelReturning(goodDraft())(); };

  await draftReport(profile, { createMessage: capture });
  await draftReport(Object.assign({}, profile, {
    runId: "run-other", uid: "uid-ravi",
    context: { stage: "B.Tech final year", age: 21, city: "Hisar" }
  }), { createMessage: capture });

  assert.deepEqual(requests[0].system, requests[1].system,
    "anything per-client in the system blocks invalidates the cache on every call");
  assert.notDeepEqual(requests[0].messages, requests[1].messages);
});

await test("a refusal is reported, not stored as a report", async () => {
  await assert.rejects(
    draftReport(profile, { createMessage: async () => ({
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "reasoning_extraction" },
      content: []
    }) }),
    err => err.code === "MODEL_REFUSED"
  );
});

await test("an incomplete reply is rejected rather than half-saved", async () => {
  const d = goodDraft();
  d.anchors.WF.nextStep = "";
  await assert.rejects(
    draftReport(profile, { createMessage: modelReturning(d) }),
    err => err.code === "INCOMPLETE_DRAFT"
  );
});

await test("a non-JSON reply is rejected", async () => {
  await assert.rejects(
    draftReport(profile, { createMessage: async () => ({ content: [{ type:"text", text:"I'm afraid I can't" }] }) }),
    err => err.code === "BAD_DRAFT"
  );
});

// ── merging into the template ─────────────────────────────────────────

console.log("\nmerging into the template");

await test("scores come from the profile and names from our own tables", async () => {
  const data = buildReportData({ profile, prose: goodDraft(), client: { name: "Asha" } });

  const investigative = data.riasec.find(r => r.key === "I");
  assert.equal(investigative.score, 6);
  assert.equal(investigative.max, 7);
  assert.equal(investigative.name, "Investigative");
  assert.equal(investigative.tag, RIASEC.I.tag);
  assert.equal(data.riasec[0].key, "I", "highest interest leads");
});

await test("a model that invents a score cannot change one", async () => {
  const tampered = goodDraft();
  tampered.riasec.I.score = 999;
  tampered.riasec.I.name = "Supergenius";
  tampered.riasec.I.max = 1;

  const data = buildReportData({ profile, prose: tampered, client: {} });
  const investigative = data.riasec.find(r => r.key === "I");
  assert.equal(investigative.score, 6);
  assert.equal(investigative.name, "Investigative");
  assert.equal(investigative.max, 7);
});

await test("anchor and VARK descriptions are ours, next steps are the draft's", async () => {
  const data = buildReportData({ profile, prose: goodDraft(), client: {} });
  const service = data.anchors.find(a => a.key === "SV");
  assert.equal(service.desc, ANCHORS.SV.desc);
  assert.match(service.nextStep, /A step for SV/);
  assert.equal(data.anchors[0].key, "SV", "highest anchor leads");
});

await test("the personality band is computed, not written", async () => {
  const data = buildReportData({ profile, prose: goodDraft(), client: {} });
  assert.equal(data.personality.name, BIGFIVE.O.name);
  assert.equal(data.personality.score, 34);
  assert.equal(data.personality.word, "High");     // 34 of 40
});

// ── draft, review, sign ───────────────────────────────────────────────

console.log("\ndraft, review, sign");

await test("a draft is stored unsigned and is not releasable", async () => {
  store.clear();
  await saveDraft({ runId: profile.runId, uid: profile.uid, prose: goodDraft(), meta: { model:"claude-opus-5" } });

  const report = await getReport(profile.runId);
  assert.equal(report.status, STATUS_DRAFT);
  assert.equal(report.signedBy, null);
  assert.equal(releasedProse(report), null, "an unsigned draft must never be released");
});

await test("signing releases it and records who", async () => {
  store.clear();
  await saveDraft({ runId: profile.runId, uid: profile.uid, prose: goodDraft(), meta: {} });
  await signReport({ runId: profile.runId, finalProse: null, counsellor: "A Counsellor, M.Sc" });

  const report = await getReport(profile.runId);
  assert.equal(report.status, STATUS_SIGNED);
  assert.equal(report.signedBy, "A Counsellor, M.Sc");
  assert.ok(releasedProse(report));
});

await test("the counsellor's edits are recorded field by field", async () => {
  store.clear();
  const draft = goodDraft();
  await saveDraft({ runId: profile.runId, uid: profile.uid, prose: draft, meta: {} });

  const edited = JSON.parse(JSON.stringify(draft));
  edited.riasec.I.meaning = "A warmer rewrite of the same point.";
  edited.riasec.I.realLife[1] = "A better second example.";
  edited.careerDirections[0] = "Medicine";

  const report = await signReport({ runId: profile.runId, finalProse: edited, counsellor: "A Counsellor" });

  assert.equal(report.edits.changedFields, 3);
  const fields = report.edits.changes.map(c => c.field).sort();
  assert.deepEqual(fields, ["careerDirections[0]", "riasec.I.meaning", "riasec.I.realLife[1]"]);
  const meaning = report.edits.changes.find(c => c.field === "riasec.I.meaning");
  assert.equal(meaning.from, draft.riasec.I.meaning);
  assert.equal(meaning.to, "A warmer rewrite of the same point.");
});

await test("signing unchanged records zero edits rather than pretending", async () => {
  store.clear();
  const draft = goodDraft();
  await saveDraft({ runId: profile.runId, uid: profile.uid, prose: draft, meta: {} });
  const report = await signReport({ runId: profile.runId, finalProse: draft, counsellor: "A Counsellor" });
  assert.equal(report.edits.changedFields, 0);
});

await test("what the client gets is the edited version, not the draft", async () => {
  store.clear();
  const draft = goodDraft();
  await saveDraft({ runId: profile.runId, uid: profile.uid, prose: draft, meta: {} });

  const edited = JSON.parse(JSON.stringify(draft));
  edited.riasec.I.meaning = "The counsellor's words.";
  await signReport({ runId: profile.runId, finalProse: edited, counsellor: "A Counsellor" });

  const released = releasedProse(await getReport(profile.runId));
  assert.equal(released.riasec.I.meaning, "The counsellor's words.");
});

await test("a signed report cannot be silently redrafted over", async () => {
  store.clear();
  await saveDraft({ runId: profile.runId, uid: profile.uid, prose: goodDraft(), meta: {} });
  await signReport({ runId: profile.runId, finalProse: null, counsellor: "A Counsellor" });

  await assert.rejects(
    saveDraft({ runId: profile.runId, uid: profile.uid, prose: goodDraft(), meta: {} }),
    err => err.code === "ALREADY_SIGNED"
  );
});

await test("the queue holds drafts only, oldest first", async () => {
  store.clear();
  await saveDraft({ runId: "run-old", uid: "uid-1", prose: goodDraft(), meta: {} });
  await new Promise(r => setTimeout(r, 5));
  await saveDraft({ runId: "run-new", uid: "uid-2", prose: goodDraft(), meta: {} });
  await saveDraft({ runId: "run-done", uid: "uid-3", prose: goodDraft(), meta: {} });
  await signReport({ runId: "run-done", finalProse: null, counsellor: "A Counsellor" });

  const queue = await listDrafts();
  assert.deepEqual(queue.map(d => d.runId), ["run-old", "run-new"]);
});

await test("diffProse ignores structure and reports only changed text", async () => {
  const before = { a: { b: "one" }, list: ["x", "y"] };
  const after  = { a: { b: "two" }, list: ["x", "y"] };
  assert.deepEqual(diffProse(before, after), [{ field:"a.b", from:"one", to:"two" }]);
});

// ── the endpoints ─────────────────────────────────────────────────────

console.log("\nendpoint access");

await test("unarmed, the drafting route answers 404", async () => {
  delete process.env.AGENT_ADMIN_TOKEN;
  const res = await call(reportHandler, { token: ADMIN_TOKEN, body: { run_id: profile.runId } });
  assert.equal(res.statusCode, 404);
});

await test("a short token disables the route", async () => {
  process.env.AGENT_ADMIN_TOKEN = "tooshort";
  const res = await call(reportHandler, { token: "tooshort", body: { run_id: profile.runId } });
  assert.equal(res.statusCode, 404);
});

await test("armed, a wrong token is a flat 401", async () => {
  process.env.AGENT_ADMIN_TOKEN = ADMIN_TOKEN;
  const res = await call(reportHandler, { token: "w".repeat(32), body: { run_id: profile.runId } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Unauthorized");
});

await test("dry_run shows the prompt and writes nothing", async () => {
  process.env.AGENT_ADMIN_TOKEN = ADMIN_TOKEN;
  store.clear(); seedProfile();

  const res = await call(reportHandler, { token: ADMIN_TOKEN, body: { run_id: profile.runId, dry_run: true } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dry_run, true);
  assert.equal(res.body.system.length, 2);
  assert.match(res.body.user_message, /Class 12 Science/);
  assert.equal(await getReport(profile.runId), null, "a dry run must not write a draft");
});

await test("an unknown run_id is a 404, not an invented profile", async () => {
  process.env.AGENT_ADMIN_TOKEN = ADMIN_TOKEN;
  store.clear();
  const res = await call(reportHandler, { token: ADMIN_TOKEN, body: { run_id: "nope" } });
  assert.equal(res.statusCode, 404);
});

await test("signing requires a named counsellor", async () => {
  process.env.AGENT_ADMIN_TOKEN = ADMIN_TOKEN;
  store.clear();
  await saveDraft({ runId: profile.runId, uid: profile.uid, prose: goodDraft(), meta: {} });

  const res = await call(signHandler, { token: ADMIN_TOKEN, body: { run_id: profile.runId } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "COUNSELLOR_REQUIRED");

  const report = await getReport(profile.runId);
  assert.equal(report.status, STATUS_DRAFT, "it must still be unsigned");
});

await test("the queue lists handles, never prose", async () => {
  process.env.AGENT_ADMIN_TOKEN = ADMIN_TOKEN;
  store.clear();
  await saveDraft({ runId: profile.runId, uid: profile.uid, prose: goodDraft(), meta: { model:"claude-opus-5" } });

  const res = await call(queueHandler, { method: "GET", token: ADMIN_TOKEN, url: "/api/agent/queue" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.deepEqual(Object.keys(res.body.drafts[0]).sort(), ["drafted_at", "model", "run_id", "uid"]);
  assert.ok(!JSON.stringify(res.body).includes("nextStep"), "the queue must not ship report prose");
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
