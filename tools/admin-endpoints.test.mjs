/*
  Tests for the coupon admin routes — run with:  npm run admin:test

  Two endpoints can rewrite what a coupon is worth: /api/coupons/seed
  writes the catalogue, /api/coupons/issue hands a code to a named
  account. Both are guarded by COUPON_ADMIN_TOKEN, and the properties
  worth pinning down are the ones you cannot see by reading a response
  body: that an unarmed route is indistinguishable from one that was
  never deployed, and that a wrong token learns nothing from the reply.

  Runs against the real handlers with a stubbed request and response and
  an in-memory Firestore — no network, no credentials.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";

const store = install();

const require = createRequire(import.meta.url);
const { requireAdmin } = require("../api/_lib/adminAuth.js");
const issueRoute = require("../api/coupons/issue.js");
const { quote } = require("../api/_lib/coupons.js");

const TOKEN = "a-long-enough-admin-token-0123456789";

let passed = 0;
let failed = 0;

async function test(name, fn){
  const saved = process.env.COUPON_ADMIN_TOKEN;
  try{
    await fn();
    passed += 1;
    console.log("  ✓ " + name);
  }catch(err){
    failed += 1;
    console.log("  ✗ " + name + "\n      " + (err && err.message || err));
  }finally{
    if(saved === undefined) delete process.env.COUPON_ADMIN_TOKEN;
    else process.env.COUPON_ADMIN_TOKEN = saved;
  }
}

// Minimal stand-ins for Node's req/res, enough for these handlers.
function reqFor(body, headers){
  const raw = body == null ? "" : JSON.stringify(body);
  const listeners = {};
  return {
    method: "POST",
    url: "/api/coupons/issue",
    headers: Object.assign({ "content-type": "application/json" }, headers || {}),
    socket: { remoteAddress: "127.0.0.1" },
    on(event, fn){
      listeners[event] = fn;
      // readBody attaches data/end synchronously; feed it once both are on.
      if(event === "end"){
        if(raw && listeners.data) listeners.data(Buffer.from(raw));
        listeners.end();
      }
      return this;
    },
    destroy(){}
  };
}

function resStub(){
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v){ this.headers[k.toLowerCase()] = v; },
    end(payload){
      try{ this.body = payload ? JSON.parse(payload) : null; }
      catch(err){ this.body = payload; }
    }
  };
}

async function callIssue(body, headers){
  const res = resStub();
  await issueRoute(reqFor(body, headers), res);
  return res;
}

const auth = { authorization: "Bearer " + TOKEN };

console.log("\nthe admin gate");

await test("an unset token makes the route answer 404, not 401", async () => {
  delete process.env.COUPON_ADMIN_TOKEN;
  const g = requireAdmin({ headers: auth }, "test");
  assert.equal(g.ok, false);
  // 404 and not 401: an unarmed route must look like one that does not
  // exist, or its presence can be found by probing.
  assert.equal(g.status, 404);
  assert.equal(g.error, "Not found");
});

await test("a token too short to be a secret disables the route", async () => {
  process.env.COUPON_ADMIN_TOKEN = "short";
  const g = requireAdmin({ headers: { authorization: "Bearer short" } }, "test");
  assert.equal(g.status, 404, "even the correct short token must not open it");
});

await test("a wrong token is refused, and the reply says nothing useful", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  const g = requireAdmin({ headers: { authorization: "Bearer " + TOKEN + "x" } }, "test");
  assert.equal(g.status, 401);
  assert.equal(g.error, "Unauthorized");
});

await test("a missing or malformed header is refused", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  for(const headers of [{}, { authorization: "" }, { authorization: TOKEN }, { authorization: "Basic " + TOKEN }]){
    assert.equal(requireAdmin({ headers }, "test").status, 401, JSON.stringify(headers));
  }
});

await test("the right token opens it, and the scheme is case-insensitive", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  assert.equal(requireAdmin({ headers: auth }, "test").ok, true);
  assert.equal(requireAdmin({ headers: { authorization: "bearer " + TOKEN } }, "test").ok, true);
});

console.log("\nPOST /api/coupons/issue");

await test("unarmed, the route is a 404", async () => {
  delete process.env.COUPON_ADMIN_TOKEN;
  const res = await callIssue({ code: "CLARITY100", email: "someone@example.com" }, auth);
  assert.equal(res.statusCode, 404);
});

await test("armed but unauthorised, nothing is written", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  store.clear();
  const res = await callIssue({ code: "CLARITY100", email: "someone@example.com" },
                              { authorization: "Bearer wrong-but-long-enough-0123456789" });
  assert.equal(res.statusCode, 401);
  const q = await quote({ code: "CLARITY100", packId: "student-full-report",
                          customer: { email: "someone@example.com" } });
  assert.equal(q.reason, "inactive", "an unauthorised call must not issue the coupon");
});

await test("a valid call issues the coupon and reports what checkout will do", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  store.clear();
  const res = await callIssue({ code: "CLARITY100", email: "Recipient@Example.com" }, auth);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.code, "CLARITY100");
  assert.deepEqual(res.body.effective.restricted_to_emails, ["recipient@example.com"]);
  assert.equal(res.body.effective.is_active, true);

  const q = await quote({ code: "CLARITY100", packId: "student-full-report",
                          customer: { email: "recipient@example.com" } });
  assert.equal(q.ok, true);
  assert.equal(q.final_amount, 1);
});

await test("issuing with no recipient is refused, and writes nothing", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  store.clear();
  const res = await callIssue({ code: "CLARITY100" }, auth);
  // 400, not 200-with-ok-false: a script wrapping this should notice
  // without parsing the body.
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.message, /at least one account email/i);

  const q = await quote({ code: "CLARITY100", packId: "student-full-report",
                          customer: { email: "anyone@example.com" } });
  assert.equal(q.reason, "inactive");
});

await test("a dry run reports without writing", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  store.clear();
  const res = await callIssue({ code: "CLARITY100", email: "recipient@example.com", dry_run: true }, auth);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dry_run, true);

  const q = await quote({ code: "CLARITY100", packId: "student-full-report",
                          customer: { email: "recipient@example.com" } });
  assert.equal(q.reason, "inactive", "a dry run must not issue anything");
});

await test("revoking takes an issued code back", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  store.clear();
  await callIssue({ code: "CLARITY100", email: "recipient@example.com" }, auth);
  const res = await callIssue({ code: "CLARITY100", revoke: true }, auth);
  assert.equal(res.statusCode, 200);

  const q = await quote({ code: "CLARITY100", packId: "student-full-report",
                          customer: { email: "recipient@example.com" } });
  assert.equal(q.reason, "inactive");
});

await test("several recipients can be named at once", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  store.clear();
  const res = await callIssue({ code: "CLARITY100", emails: ["a@x.com", "b@x.com"] }, auth);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.effective.restricted_to_emails, ["a@x.com", "b@x.com"]);
});

await test("an unknown code is refused", async () => {
  process.env.COUPON_ADMIN_TOKEN = TOKEN;
  store.clear();
  const res = await callIssue({ code: "NOSUCHCODE", email: "a@x.com" }, auth);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /No coupon called/i);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
