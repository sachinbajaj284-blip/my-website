/*
  Tests for saved assessment results — run with:  npm run assessment:test

  Phase 0 of the agent work is "stop throwing the assessment away", and
  the thing that makes that safe rather than reckless is a small set of
  rules: a result belongs to the account that saved it and to no other,
  nothing is stored without a recorded consent, only scores the
  instruments can actually produce are accepted, and a deletion actually
  deletes. Those are the rules under test here.

  Runs against tools/firestore-stub.mjs — an in-memory Firestore plus a
  registry of ID tokens the test decides are valid — because every one
  of these rules is about what does or doesn't end up in the database.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";

// Must happen before anything requires firebase-admin.
const store = install();

const require = createRequire(import.meta.url);
const { validate, saveRun, latestRun, listRuns, deleteRuns, COLLECTION } = require("../api/_lib/assessments.js");
const saveHandler = require("../api/assessment/save.js");
const latestHandler = require("../api/assessment/latest.js");
const deleteHandler = require("../api/assessment/delete.js");

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

const ASHA_TOKEN = "asha-token-" + "a".repeat(20);
const RAVI_TOKEN = "ravi-token-" + "r".repeat(20);

store.setIdToken(ASHA_TOKEN, { uid: "uid-asha", email: "asha@example.com", email_verified: true, name: "Asha" });
store.setIdToken(RAVI_TOKEN, { uid: "uid-ravi", email: "ravi@example.com", email_verified: false, name: "Ravi" });

const validScores = {
  riasec:  { R:3, I:6, A:4, S:5, E:2, C:2 },
  anchors: { SV:36, CH:31, MA:28, AU:21, IN:19, WF:17, ST:14, EN:11 },
  vark:    { V:8, A:3, R:10, K:5 },
  bigfive: { O:34, C:29, E:22, A:31, N:18 }
};

function validBody(overrides){
  return Object.assign({
    instrument: "student-full-v1",
    consent: true,
    scores: JSON.parse(JSON.stringify(validScores)),
    context: { stage: "Class 12 Science", age: 17, city: "Rohtak" }
  }, overrides || {});
}

function mockRes(){
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v){ this.headers[k] = v; },
    end(payload){ this.body = payload ? JSON.parse(payload) : null; }
  };
}

function mockReq({ method = "POST", token, body = {} } = {}){
  const raw = JSON.stringify(body);
  const headers = { "content-type": "application/json" };
  if(token) headers.authorization = "Bearer " + token;
  return {
    method,
    headers,
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

// ── the shape rules ───────────────────────────────────────────────────

console.log("\nwhat may be stored");

await test("a well-formed result validates", async () => {
  const r = validate(validBody());
  assert.equal(r.ok, true);
  assert.equal(r.doc.scores.riasec.I, 6);
  assert.equal(r.doc.scores.riasec.max, 7);
  assert.equal(r.doc.schemaVersion, 1);
});

await test("no consent, no document", async () => {
  for(const value of [undefined, false, "true", 1, null]){
    const r = validate(validBody({ consent: value }));
    assert.equal(r.ok, false, "consent=" + JSON.stringify(value) + " should be refused");
    assert.equal(r.error, "CONSENT_REQUIRED");
  }
});

await test("a score above its instrument's maximum is refused, not clamped", async () => {
  const body = validBody();
  body.scores.riasec.I = 9;            // RIASEC tops out at 7
  const r = validate(body);
  assert.equal(r.ok, false);
  assert.equal(r.error, "BAD_SCORES");
});

await test("a negative score is refused", async () => {
  const body = validBody();
  body.scores.bigfive.N = -1;
  assert.equal(validate(body).ok, false);
});

await test("a missing key in an instrument is refused — a half-scored profile is not a profile", async () => {
  const body = validBody();
  delete body.scores.anchors.EN;
  const r = validate(body);
  assert.equal(r.ok, false);
  assert.equal(r.error, "BAD_SCORES");
});

await test("a null score is refused — an unanswered part must not store as zero", async () => {
  // JSON.stringify(NaN) is null, and Number(null) is 0. Without a strict
  // number check this stores a blank assessment as a real all-zero profile.
  const body = validBody();
  body.scores.anchors.MA = null;
  const r = validate(body);
  assert.equal(r.ok, false);
  assert.equal(r.error, "BAD_SCORES");
});

await test("a numeric string is refused rather than coerced", async () => {
  const body = validBody();
  body.scores.riasec.I = "6";
  assert.equal(validate(body).ok, false);
});

await test("a run with only some instruments is allowed", async () => {
  const r = validate({ consent: true, scores: { riasec: validScores.riasec } });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.doc.scores), ["riasec"]);
});

await test("no recognised instrument at all is refused", async () => {
  const r = validate({ consent: true, scores: { astrology: { sun: 1 } } });
  assert.equal(r.ok, false);
  assert.equal(r.error, "NO_SCORES");
});

await test("item-level answers and any other unknown field are dropped, never stored", async () => {
  const body = validBody();
  body.answers = { personality: { 1: 4, 2: 2 } };
  body.scores.riasec.secretNote = "keep me";
  body.context.parentPhone = "9812345678";
  body.uid = "uid-somebody-else";

  const r = validate(body);
  assert.equal(r.ok, true);
  const serialised = JSON.stringify(r.doc);
  assert.ok(!serialised.includes("answers"), "raw answers must not survive validation");
  assert.ok(!serialised.includes("keep me"), "unknown score keys must not survive validation");
  assert.ok(!serialised.includes("9812345678"), "unknown context fields must not survive validation");
  assert.ok(!serialised.includes("uid-somebody-else"), "a body-supplied uid must not survive validation");
});

await test("free text is length-capped rather than refused", async () => {
  const r = validate(validBody({ context: { concern: "x".repeat(900) } }));
  assert.equal(r.ok, true);
  assert.equal(r.doc.context.concern.length, 300);
});

await test("an impossible age is refused", async () => {
  assert.equal(validate(validBody({ context: { age: 200 } })).ok, false);
  assert.equal(validate(validBody({ context: { age: "seventeen" } })).ok, false);
  assert.equal(validate(validBody({ context: { age: 17 } })).ok, true);
  // Absent is fine — plenty of people skip it.
  assert.equal(validate(validBody({ context: {} })).ok, true);
});

// ── ownership ─────────────────────────────────────────────────────────

console.log("\nwhose result it is");

await test("saving requires a signed-in account", async () => {
  store.clear();
  const res = await call(saveHandler, { body: validBody() });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "NO_ACCOUNT");
});

await test("an unrecognised token is refused", async () => {
  store.clear();
  const res = await call(saveHandler, { token: "forged-" + "f".repeat(24), body: validBody() });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_ACCOUNT");
});

await test("a saved run is filed under the token's uid", async () => {
  store.clear();
  const res = await call(saveHandler, { token: ASHA_TOKEN, body: validBody() });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.saved, true);
  assert.ok(res.body.run_id);

  const stored = store.read(COLLECTION, res.body.run_id);
  assert.equal(stored.uid, "uid-asha");
});

await test("a uid in the body cannot file a result under somebody else's account", async () => {
  store.clear();
  const res = await call(saveHandler, {
    token: ASHA_TOKEN,
    body: validBody({ uid: "uid-ravi", account_uid: "uid-ravi" })
  });
  assert.equal(res.statusCode, 201);

  const stored = store.read(COLLECTION, res.body.run_id);
  assert.equal(stored.uid, "uid-asha", "the verified token decides ownership, never the body");

  const ravi = await listRuns("uid-ravi");
  assert.equal(ravi.length, 0);
});

await test("one account cannot read another's result", async () => {
  store.clear();
  await call(saveHandler, { token: ASHA_TOKEN, body: validBody() });

  const mine = await call(latestHandler, { method: "GET", token: ASHA_TOKEN });
  assert.equal(mine.body.found, true);

  const theirs = await call(latestHandler, { method: "GET", token: RAVI_TOKEN });
  assert.equal(theirs.body.found, false, "Ravi must not see Asha's profile");
  assert.equal(theirs.body.run, null);
});

await test("an unverified email can still save — verification is not a gate here", async () => {
  store.clear();
  const res = await call(saveHandler, { token: RAVI_TOKEN, body: validBody() });
  assert.equal(res.statusCode, 201);
});

// ── reading back ──────────────────────────────────────────────────────

await test("a class saving from one school IP is not rate-limited as one person", async () => {
  // A computer lab is a single public IP. The per-IP budget is a flood
  // guard; the real limit is per account, or student eleven is refused.
  store.clear();
  for(let i = 0; i < 25; i++){
    const token = "lab-token-" + i + "-" + "x".repeat(16);
    store.setIdToken(token, { uid: "uid-lab-" + i, email: "s" + i + "@school.edu", email_verified: true });
    const res = await call(saveHandler, { token: token, body: validBody() });
    assert.equal(res.statusCode, 201, "student " + (i + 1) + " was refused");
  }
});

await test("one account cannot save unboundedly", async () => {
  store.clear();
  const token = "spammer-" + "s".repeat(24);
  store.setIdToken(token, { uid: "uid-spammer", email: "s@example.com", email_verified: true });

  let refused = 0;
  for(let i = 0; i < 14; i++){
    const res = await call(saveHandler, { token: token, body: validBody() });
    if(res.statusCode === 429) refused++;
  }
  assert.ok(refused > 0, "the per-account budget should bite");
});

console.log("\nreading it back");

await test("no saved result is found:false, not an error", async () => {
  store.clear();
  const res = await call(latestHandler, { method: "GET", token: ASHA_TOKEN });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.found, false);
  assert.equal(res.body.run, null);
});

await test("latest returns the newest of several runs", async () => {
  store.clear();
  await saveRun({ uid: "uid-asha", doc: validate(validBody()).doc });
  await new Promise(r => setTimeout(r, 5));
  const second = validate(validBody({ context: { stage: "Dropper year" } })).doc;
  await saveRun({ uid: "uid-asha", doc: second });

  const run = await latestRun("uid-asha");
  assert.equal(run.context.stage, "Dropper year");
  assert.equal((await listRuns("uid-asha")).length, 2);
});

await test("the read-back view exposes scores and nothing internal", async () => {
  store.clear();
  await call(saveHandler, { token: ASHA_TOKEN, body: validBody() });
  const res = await call(latestHandler, { method: "GET", token: ASHA_TOKEN });

  assert.deepEqual(
    Object.keys(res.body.run).sort(),
    ["context", "created_at", "instrument", "run_id", "schema_version", "scores"]
  );
  assert.ok(!("uid" in res.body.run), "the view must not echo the uid back");
  assert.equal(res.body.run.scores.bigfive.O, 34);
});

await test("GET only", async () => {
  const res = await call(latestHandler, { method: "POST", token: ASHA_TOKEN });
  assert.equal(res.statusCode, 405);
});

// ── deletion ──────────────────────────────────────────────────────────

console.log("\ntaking it back");

await test("deletion needs an explicit confirmation", async () => {
  store.clear();
  await call(saveHandler, { token: ASHA_TOKEN, body: validBody() });

  const res = await call(deleteHandler, { token: ASHA_TOKEN, body: {} });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "CONFIRM_REQUIRED");
  assert.equal((await listRuns("uid-asha")).length, 1, "nothing should have been deleted");
});

await test("deletion removes every run, and really removes them", async () => {
  store.clear();
  await call(saveHandler, { token: ASHA_TOKEN, body: validBody() });
  await call(saveHandler, { token: ASHA_TOKEN, body: validBody() });

  const res = await call(deleteHandler, { token: ASHA_TOKEN, body: { confirm: true } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.runs_deleted, 2);

  assert.equal((await listRuns("uid-asha")).length, 0);
  // Not merely flagged — gone from the collection.
  const remaining = Object.keys(store.dump()).filter(k => k.startsWith(COLLECTION + "/"));
  assert.deepEqual(remaining, []);
});

await test("deleting my results does not touch anybody else's", async () => {
  store.clear();
  await call(saveHandler, { token: ASHA_TOKEN, body: validBody() });
  await call(saveHandler, { token: RAVI_TOKEN, body: validBody() });

  await call(deleteHandler, { token: ASHA_TOKEN, body: { confirm: true } });

  assert.equal((await listRuns("uid-asha")).length, 0);
  assert.equal((await listRuns("uid-ravi")).length, 1, "Ravi's profile must survive Asha's deletion");
});

await test("deletion requires a signed-in account", async () => {
  store.clear();
  await saveRun({ uid: "uid-asha", doc: validate(validBody()).doc });

  const res = await call(deleteHandler, { body: { confirm: true } });
  assert.equal(res.statusCode, 401);
  assert.equal((await listRuns("uid-asha")).length, 1);
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
