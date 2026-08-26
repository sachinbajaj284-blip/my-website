/*
  Tests for the route dispatchers — run with:  npm run dispatch:test

  The agent's nine routes and the assessment's three now sit behind one
  catch-all each, because Vercel's Hobby plan deploys at most twelve
  functions and one-file-per-route took the site to twenty-four.

  That consolidation moved a failure mode. Before, a route existed
  because its file existed; now it exists because somebody also added it
  to a map, and a route missing from the map does not crash or fail to
  build — it answers 404 on a URL the rest of the site still links to.
  So the load-bearing test here is the last one: every handler file on
  disk must be wired, and every wired name must resolve to a real
  handler. The rest pin the dispatch behaviour itself.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { install } from "./firestore-stub.mjs";

// Must happen before anything requires firebase-admin.
install();

const require = createRequire(import.meta.url);
const { dispatcher, segment } = require("../api/_lib/dispatch.js");

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

function res(){
  const out = { statusCode: 200, headers: {}, body: "" };
  return {
    get statusCode(){ return out.statusCode; },
    set statusCode(v){ out.statusCode = v; },
    setHeader(k, v){ out.headers[k.toLowerCase()] = v; },
    end(b){ out.body = b == null ? "" : String(b); },
    _out: out
  };
}

await test("the last path segment picks the handler", async () => {
  let seen = null;
  const handler = dispatcher("agent", { chat: async (req) => { seen = req.url; } });
  await handler({ url: "/api/agent/chat" }, res());
  assert.equal(seen, "/api/agent/chat");
});

await test("a query string is not part of the segment", async () => {
  let hit = false;
  const handler = dispatcher("agent", { queue: async () => { hit = true; } });
  await handler({ url: "/api/agent/queue?status=pending&code=X" }, res());
  assert.equal(hit, true);
});

await test("a trailing slash still routes", async () => {
  let hit = false;
  const handler = dispatcher("agent", { sign: async () => { hit = true; } });
  await handler({ url: "/api/agent/sign/" }, res());
  assert.equal(hit, true);
});

await test("a hyphenated route is not truncated", async () => {
  let hit = null;
  const handler = dispatcher("agent", {
    cohort: async () => { hit = "cohort"; },
    "cohort-attention": async () => { hit = "cohort-attention"; }
  });
  await handler({ url: "/api/agent/cohort-attention?code=X" }, res());
  assert.equal(hit, "cohort-attention", "cohort-attention must not fall through to cohort");
});

await test("an unknown segment is a 404, not a crash", async () => {
  const handler = dispatcher("agent", { chat: async () => {} });
  const r = res();
  await handler({ url: "/api/agent/nope" }, r);
  assert.equal(r.statusCode, 404);
  assert.match(r._out.body, /NOT_FOUND/);
  assert.match(r._out.headers["content-type"], /application\/json/);
});

await test("an inherited property name cannot be used as a route", async () => {
  // Object.prototype.hasOwnProperty guards this; a bare lookup would
  // return Object.prototype.constructor and try to call it.
  const handler = dispatcher("agent", { chat: async () => {} });
  const r = res();
  await handler({ url: "/api/agent/constructor" }, r);
  assert.equal(r.statusCode, 404);
});

await test("a missing url is a 404 rather than a throw", async () => {
  const handler = dispatcher("agent", { chat: async () => {} });
  const r = res();
  await handler({}, r);
  assert.equal(r.statusCode, 404);
});

await test("segment() reads the last path element", () => {
  assert.equal(segment("/api/agent/chat"), "chat");
  assert.equal(segment("/api/agent/chat?a=1"), "chat");
  assert.equal(segment("/api/agent/chat/"), "chat");
  assert.equal(segment(""), "");
});

/*
  The one that matters. A handler added to api/_lib/routes/<group>/ and
  forgotten in the map is a dead endpoint that builds cleanly.

  This reads the real map off the catch-all rather than rebuilding one
  from the same directory it is checking — a disk-to-disk comparison
  would agree with itself no matter what the catch-all actually wired.
*/
for(const group of ["agent", "assessment", "coupons"]){
  await test("every " + group + " handler on disk is wired, and every wired name resolves", () => {
    const onDisk = readdirSync(new URL("../api/_lib/routes/" + group + "/", import.meta.url))
      .filter(f => f.endsWith(".js"))
      .map(f => f.replace(/\.js$/, ""))
      .sort();

    const mod = require("../api/" + group + "/[...route].js");
    assert.equal(typeof mod, "function", "the catch-all must export a handler");
    assert.ok(mod.routes, "the catch-all must export its route map for this check");

    const wired = Object.keys(mod.routes).sort();
    assert.deepEqual(wired, onDisk,
      "wired routes and handler files disagree — on disk: " + onDisk.join(", ") +
      " / wired: " + wired.join(", "));

    for(const name of wired){
      assert.equal(typeof mod.routes[name], "function",
        name + " is wired but does not resolve to a handler");
    }
  });
}

await test("the wiring check would notice a route missing from the map", () => {
  // Proves the check above can fail. Same comparison, one route dropped.
  const mod = require("../api/agent/[...route].js");
  const short = { ...mod.routes };
  delete short.webhook;
  assert.throws(() => {
    assert.deepEqual(Object.keys(short).sort(), Object.keys(mod.routes).sort());
  }, "a dropped route must be detectable");
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if(failed > 0) process.exit(1);
