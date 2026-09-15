/*
  Tests for the quiz leaderboard counters — run with:  npm run quiz:test

  The point of these is the honesty rule as much as the arithmetic: a
  page that says "1,240 students" must never be able to say it because a
  counter guessed. So alongside counting, these assert that an
  unconfigured or failing Firestore produces `available:false` and a
  count of nothing, and that the endpoint refuses to store a quiz or a
  result key it does not recognise.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import { install } from "./firestore-stub.mjs";

const store = install();
const require = createRequire(import.meta.url);

const quizStats = require("../api/_lib/quizStats.js");
const handler = require("../api/quiz-stats.js");

let passed = 0, failed = 0;
async function test(name, fn){
  try{ await fn(); passed++; console.log("  ✓ " + name); }
  catch(err){ failed++; console.log("  ✗ " + name + "\n      " + (err && err.message || err)); }
}

function res(){
  const r = {
    statusCode: 0, headers:{}, body:null,
    setHeader(k, v){ r.headers[k.toLowerCase()] = v; },
    end(text){ r.body = text ? JSON.parse(text) : null; }
  };
  return r;
}
function req(method, url, body){
  const r = { method, url, headers:{ "x-forwarded-for":"203.0.113." + Math.floor(Math.random()*250) } };
  if(body !== undefined) r.body = body;
  /* readBody() consumes a stream; the stub mirrors what Vercel does for
     an already-parsed JSON body. */
  r.on = (event, fn) => {
    if(event === "data" && body !== undefined) fn(Buffer.from(JSON.stringify(body)));
    if(event === "end") fn();
    return r;
  };
  return r;
}
async function call(method, url, body){
  const r = res();
  await handler(req(method, url, body), r);
  return r;
}

console.log("\nquiz stats\n");

await test("records a completion and counts it", async () => {
  store.clear();
  await quizStats.recordTake({ quiz:"stream", result:"pcm" });
  await quizStats.recordTake({ quiz:"stream", result:"pcm" });
  await quizStats.recordTake({ quiz:"stream", result:"pcb" });
  const out = await quizStats.readStats("stream");
  assert.equal(out.total, 3);
  assert.equal(out.ranked[0].key, "pcm");
  assert.equal(out.ranked[0].count, 2);
  assert.equal(out.ranked[0].pct, 66.7);
});

await test("percentages are of counted results, and add up", async () => {
  store.clear();
  for(let i = 0; i < 3; i++) await quizStats.recordTake({ quiz:"snapshot", result:"I" });
  await quizStats.recordTake({ quiz:"snapshot", result:"A" });
  const out = await quizStats.readStats("snapshot");
  const sum = out.ranked.reduce((n, r) => n + r.pct, 0);
  assert.ok(Math.abs(sum - 100) < 0.2, "percentages sum to " + sum);
});

await test("an unknown result key is not stored, but the take still counts", async () => {
  store.clear();
  await quizStats.recordTake({ quiz:"stream", result:"__injected__" });
  const out = await quizStats.readStats("stream");
  assert.equal(out.total, 1);
  assert.deepEqual(out.ranked, []);
});

await test("an unknown quiz is refused outright", async () => {
  store.clear();
  const done = await quizStats.recordTake({ quiz:"../../etc", result:"pcm" });
  assert.equal(done.ok, false);
  assert.equal((await quizStats.readStats("nope")).available, false);
  assert.equal(store.read("quizStats", "../../etc"), undefined);
});

/* The allowlist is a copy of keys that live in another file, so it can
   drift silently. This reads the real ones back out of the quiz. */
await test("the allowlist matches the quiz's actual result keys", async () => {
  const src = fs.readFileSync(new URL("../stream-selector.js", import.meta.url), "utf8");
  const combos = src.slice(src.indexOf("var COMBOS = {"));
  const keys = [];
  combos.replace(/^([a-z_]+):\{ w:\{/gm, (m, k) => { keys.push(k); return m; });
  assert.ok(keys.length >= 7, "found " + keys.length + " combinations");
  keys.forEach(k => assert.ok(
    quizStats.isResult("stream", k),
    "combination '" + k + "' is missing from the stats allowlist"));
});

await test("day history stays bounded", async () => {
  const days = {};
  for(let i = 0; i < 40; i++) days["2026-01-" + String(i + 1).padStart(2, "0")] = i;
  const trimmed = quizStats.trimDays(days);
  assert.equal(Object.keys(trimmed).length, quizStats.DAY_WINDOW);
  assert.ok(Object.keys(trimmed).sort()[0] > "2026-01-20");
});

await test("today and week reflect what was recorded", async () => {
  store.clear();
  await quizStats.recordTake({ quiz:"stream", result:"pcm" });
  await quizStats.recordTake({ quiz:"stream", result:"pcb" });
  const out = await quizStats.readStats("stream");
  assert.equal(out.today, 2);
  assert.equal(out.week, 2);
});

await test("GET returns the counts", async () => {
  store.clear();
  await quizStats.recordTake({ quiz:"stream", result:"pcm" });
  const r = await call("GET", "/api/quiz-stats?quiz=stream");
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.available, true);
  assert.equal(r.body.total, 1);
  assert.ok(r.headers["cache-control"]);
});

await test("GET for an unknown quiz is available:false, never a number", async () => {
  const r = await call("GET", "/api/quiz-stats?quiz=whatever");
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.available, false);
  assert.equal(r.body.total, undefined);
});

await test("POST records, and rejects an unknown quiz", async () => {
  store.clear();
  const ok = await call("POST", "/api/quiz-stats", { quiz:"stream", result:"pcm" });
  assert.equal(ok.body.recorded, true);
  const bad = await call("POST", "/api/quiz-stats", { quiz:"hack", result:"pcm" });
  assert.equal(bad.body.recorded, false);
  assert.equal(bad.statusCode, 200);
});

await test("a broken datastore reports unavailable, not a made-up count", async () => {
  /* Breaking the store rather than the module: quizStats.js destructures
     db() at require time, so swapping the export afterwards would patch
     something nothing calls, and the test would pass without proving
     anything. */
  const original = store.firestore.collection;
  store.firestore.collection = () => { throw new Error("firestore down"); };
  try{
    const r = await call("GET", "/api/quiz-stats?quiz=stream");
    assert.equal(r.body.available, false);
    assert.equal(r.body.total, undefined);
    const p = await call("POST", "/api/quiz-stats", { quiz:"stream", result:"pcm" });
    assert.equal(p.body.recorded, false);
    assert.equal(p.statusCode, 200, "a counter outage must not break the result page");
  }finally{ store.firestore.collection = original; }
});

await test("other methods are refused", async () => {
  const r = await call("DELETE", "/api/quiz-stats");
  assert.equal(r.statusCode, 405);
});

console.log("\n  " + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
