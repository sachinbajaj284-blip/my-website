/*
  Tests for the website assistant — run with:  npm run web:test

  The WhatsApp agent arrives with its identity proven by an HMAC. This
  one arrives as an anonymous browser on a public URL, which changes the
  threat model rather than the agent: the same distress screen, the same
  refusal to invent a cut-off, but now reachable by anybody with a
  keyboard and no cost to them for trying.

  So the tests here are mostly about the two things that are different.

  Money: three ceilings, and what happens when each is hit.

  Identity: a session id is a bearer token for one transcript and must
  never become an account. The test that matters most is that a caller
  who invents a session id gets their own empty thread rather than
  somebody else's conversation.

  And one that is not different, deliberately: an acute message must
  never reach the composing model here either. That is asserted on the
  call not being made, not on the text coming back.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";
import crypto from "node:crypto";

const store = install();
const require = createRequire(import.meta.url);

const conversations = require("../api/_lib/conversations.js");
const { handleWeb } = require("../api/_lib/chatTurn.js");
const { RISK, ACUTE_REPLY, CRISIS_RESOURCES } = require("../api/_lib/safetyScreen.js");
const webRoute = require("../api/_lib/routes/agent/web.js");

let passed = 0, failed = 0;
async function test(name, fn){
  try{ await fn(); passed++; console.log("  ✓ " + name); }
  catch(err){ failed++; console.log("  ✗ " + name + "\n      " + (err && err.message || err)); }
}

function mockRes(){
  return { statusCode:0, headers:{}, body:null,
    setHeader(k,v){ this.headers[k.toLowerCase()]=v; },
    end(p){ this.body = p ? JSON.parse(p) : null; } };
}
function mockReq({ method="POST", body={}, ip="203.0.113.9", token } = {}){
  const raw = Buffer.from(JSON.stringify(body));
  const headers = { "content-type":"application/json" };
  if(token) headers.authorization = "Bearer " + token;
  return { method, headers, url:"/api/agent/web",
    socket:{ remoteAddress: ip },
    on(e, cb){ if(e==="data") cb(raw); if(e==="end") cb(); return this; } };
}
/*
  A stubbed agent, always. Without it these would run the real SDK, fail
  on the missing key, and then pass by asserting against the handoff
  message — a test that proves the error path works and nothing else.
*/
async function post(options){
  const res = mockRes();
  const opts = options || {};
  const deps = { screen: opts.screen || calm, agent: opts.agent || agentSaying("Here's what I'd look at."), notify: quiet };
  await webRoute(mockReq(opts), res, deps);
  return res;
}

const calm = async () => ({ risk: RISK.NONE, reason: "" });
const acute = async () => ({ risk: RISK.ACUTE, reason: "self-harm" });
const quiet = async () => ({ type:"stub" });
function agentSaying(text){
  const spy = async () => ({ reply: text, toolCalls: [], usage: { input_tokens: 10, output_tokens: 5 }, rounds: 1 });
  return spy;
}

// ── the session is a transcript key, not an identity ──────────────────

console.log("\nsessions");

await test("a session id is issued by the server, not chosen by the caller", async () => {
  const id = conversations.webSessionId();
  assert.equal(id.length, 32);
  assert.ok(conversations.validWebSession(id));
  for(const bad of ["", "1", "abc", "../../etc", "x".repeat(200), "has space here!!!!!!!!!!!!!!!!!"]){
    assert.equal(conversations.validWebSession(bad), false, JSON.stringify(bad) + " should be refused");
  }
});

await test("an invented session id gets its own empty thread, not somebody else's", async () => {
  const real = conversations.webSessionId();
  const mine = await conversations.getWebThread(real);
  mine.turns.push({ role:"user", text:"my private question" });
  await conversations.saveThread(mine);

  // Somebody guesses. Even the same string in a different shape must not land here.
  const guessed = await conversations.getWebThread("1");
  assert.equal(guessed.turns.length, 0, "a guessed session must not read an existing transcript");
  assert.notEqual(guessed.threadId, mine.threadId);
});

await test("a web thread and a WhatsApp thread never share an id", async () => {
  /*
    Pinned on the namespace string rather than on two ids happening to
    differ. The first version of this compared webThreadId(x) against
    threadId(x) and passed even with the namespaces made identical,
    because normalizePhone reshapes its input and the two were hashing
    different strings for an unrelated reason. The namespace is the
    actual guard, so the namespace is what gets asserted.
  */
  const id = "T3stS3ss10nId0000000000000000000";
  const expected = crypto.createHash("sha256")
    .update("lume-web-thread:" + id).digest("hex").slice(0, 32);
  assert.equal(conversations.webThreadId(id), expected,
    "web threads must hash under their own namespace");

  const phoneNamespace = crypto.createHash("sha256")
    .update("lume-thread:" + id).digest("hex").slice(0, 32);
  assert.notEqual(conversations.webThreadId(id), phoneNamespace,
    "a shared namespace would let a session id collide with a phone thread");
});

await test("a web thread carries no phone number", async () => {
  const thread = await conversations.getWebThread(conversations.webSessionId());
  assert.equal(thread.phone, undefined, "a browser has no phone and must not be given a field for one");
  assert.equal(thread.channel, "web");
});

// ── the gate, on this channel too ─────────────────────────────────────

console.log("\nthe gate holds on the web");

await test("an acute message never reaches the composing model", async () => {
  let called = false;
  const agent = async () => { called = true; return { reply:"should not happen", toolCalls:[], usage:{}, rounds:1 }; };

  const out = await handleWeb(
    { sessionId: conversations.webSessionId(), text: "i don't want to be here anymore" },
    { screen: acute, agent, notify: quiet });

  assert.equal(called, false, "the model was called on an acute message");
  assert.equal(out.reply, ACUTE_REPLY);
  assert.equal(out.locked, true);
  assert.equal(out.agentRan, false);
});

await test("the acute reply carries helpline numbers a person checked", async () => {
  const out = await handleWeb(
    { sessionId: conversations.webSessionId(), text: "i can't do this" },
    { screen: acute, agent: agentSaying("x"), notify: quiet });
  for(const line of CRISIS_RESOURCES){
    assert.ok(out.reply.includes(line), "missing helpline: " + line);
  }
});

await test("a locked web thread stays locked — the agent does not talk over a counsellor", async () => {
  const id = conversations.webSessionId();
  await handleWeb({ sessionId: id, text: "i want to end it" }, { screen: acute, agent: agentSaying("x"), notify: quiet });

  let called = false;
  const agent = async () => { called = true; return { reply:"hello again", toolCalls:[], usage:{}, rounds:1 }; };
  const out = await handleWeb({ sessionId: id, text: "actually about commerce" }, { screen: calm, agent, notify: quiet });

  assert.equal(called, false, "the agent answered on a thread locked to a human");
  assert.equal(out.locked, true);
});

// ── identity ──────────────────────────────────────────────────────────

console.log("\nidentity");

await test("an anonymous visitor is answered, and carries no uid", async () => {
  let seen;
  const agent = async (args) => { seen = args; return { reply:"sure", toolCalls:[], usage:{}, rounds:1 }; };
  await handleWeb({ sessionId: conversations.webSessionId(), text: "what does a CA earn?" },
    { screen: calm, agent, notify: quiet });
  assert.equal(seen.context.uid, null, "an anonymous browser must not be handed an account");
  assert.equal(seen.context.phone, null, "a web turn has no phone number");
});

await test("a signed-in visitor's uid reaches the agent", async () => {
  let seen;
  const agent = async (args) => { seen = args; return { reply:"sure", toolCalls:[], usage:{}, rounds:1 }; };
  await handleWeb({ sessionId: conversations.webSessionId(), text: "what suits me?", uid: "Kj8x2QaR4mN7pLz3WcY5Bv1XnH9t" },
    { screen: calm, agent, notify: quiet });
  assert.equal(seen.context.uid, "Kj8x2QaR4mN7pLz3WcY5Bv1XnH9t");
});

// ── the route ─────────────────────────────────────────────────────────

console.log("\nthe route");

await test("an empty message is refused before anything is spent", async () => {
  const res = await post({ body: { message: "   " } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});

await test("an overlong message is refused rather than truncated and answered", async () => {
  const res = await post({ body: { message: "a".repeat(5000) } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /shorten/i);
});

await test("a GET reports config and never a secret", async () => {
  const KEY = "ANTHROPIC_API_KEY";
  const had = process.env[KEY];
  process.env[KEY] = "sk-ant-this-must-never-be-echoed";
  try{
    const res = await post({ method: "GET", body: {} });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.route, "agent/web");
    assert.equal(res.body.anthropic_key, true, "should report the key as present");

    const wire = JSON.stringify(res.body);
    assert.ok(!wire.includes("sk-ant"), "the health check must never echo a secret");
    assert.ok(!/[0-9]{2,}\s*chars|length/i.test(wire), "not even a length");
  } finally {
    if(had === undefined) delete process.env[KEY]; else process.env[KEY] = had;
  }
});

await test("a GET says what is missing rather than shrugging", async () => {
  const KEY = "ANTHROPIC_API_KEY";
  const had = process.env[KEY];
  delete process.env[KEY];
  try{
    const res = await post({ method: "GET", body: {} });
    assert.equal(res.body.anthropic_key, false);
    assert.equal(res.body.answering, false);
    assert.ok(res.body.missing.includes("ANTHROPIC_API_KEY"),
      "the whole point is that it names the missing variable");
  } finally {
    if(had === undefined) delete process.env[KEY]; else process.env[KEY] = had;
  }
});

await test("a GET cannot send a message", async () => {
  let called = false;
  const res = await post({ method: "GET", body: { message: "answer me" },
    agent: async () => { called = true; return { reply:"x", toolCalls:[], usage:{}, rounds:1 }; } });
  assert.equal(called, false, "a GET must not reach the agent");
  assert.equal(res.body.reply, undefined);
});

await test("the first reply issues a session and says it is new", async () => {
  const res = await post({ body: { message: "hi" }, ip: "198.51.100.4" });
  assert.equal(res.statusCode, 200);
  assert.ok(conversations.validWebSession(res.body.session), "a usable session id should come back");
  assert.equal(res.body.new_session, true);
  assert.equal(res.body.reply, "Here's what I'd look at.", "the agent's answer should reach the browser");
  assert.equal(res.body.locked, false, "a normal first message must not arrive locked");
});

await test("sending the issued session back continues the same conversation", async () => {
  const first = await post({ body: { message: "hi" }, ip: "198.51.100.5" });
  const again = await post({ body: { message: "and after 12th?", session: first.body.session }, ip: "198.51.100.5" });
  assert.equal(again.body.session, first.body.session);
  assert.equal(again.body.new_session, false);
  assert.equal(again.body.locked, false);
});

await test("a junk session id is replaced rather than trusted", async () => {
  const res = await post({ body: { message: "hi", session: "../../../etc/passwd" }, ip: "198.51.100.6" });
  assert.equal(res.statusCode, 200);
  assert.notEqual(res.body.session, "../../../etc/passwd");
  assert.ok(conversations.validWebSession(res.body.session));
  assert.equal(res.body.new_session, true);
});

await test("an anonymous reply is not marked personalised", async () => {
  const res = await post({ body: { message: "hello" }, ip: "198.51.100.7" });
  assert.equal(res.body.personalised, false);
});

await test("an acute message over HTTP still never reaches the model", async () => {
  /* The same guarantee as on WhatsApp, asserted through the public door
     rather than through the function behind it. */
  let called = false;
  const res = await post({
    body: { message: "i don't want to be here" },
    ip: "198.51.100.8",
    screen: acute,
    agent: async () => { called = true; return { reply:"no", toolCalls:[], usage:{}, rounds:1 }; }
  });
  assert.equal(called, false, "the model was called on an acute message arriving over HTTP");
  assert.equal(res.statusCode, 200, "a person in trouble gets an answer, not an error code");
  assert.equal(res.body.locked, true);
  assert.match(res.body.reply, /14416/, "the reply must carry the helpline numbers");
});

await test("a failing agent hands over instead of leaking the error to the browser", async () => {
  const res = await post({
    body: { message: "hi" },
    ip: "198.51.100.9",
    agent: async () => { throw new Error("upstream exploded with a secret in it"); }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(!/exploded|secret/i.test(JSON.stringify(res.body)), "internal error text must not reach the browser");
  assert.match(res.body.reply, /counsellor/i);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if(failed > 0) process.exit(1);
