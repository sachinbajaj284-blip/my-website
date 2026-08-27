/*
  Tests for the WhatsApp agent — run with:  npm run chat:test

  Phase 3 is the only part of this system that talks to a client without
  a counsellor reading it first, so the tests lead with the things that
  must hold no matter what the model does:

    - an acute message never reaches the composing model at all
    - possession of a phone number unlocks nothing
    - no tool can be talked into naming a different account
    - no tool can be talked into naming a price
    - the cached prefix never varies per client

  Everything else follows. No test makes an API call: the screen, the
  agent and the notifier are all injected.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";

const store = install();

const require = createRequire(import.meta.url);
const { handleInbound, LOCKED_REPLY, OVER_BUDGET_REPLY, FAILED_REPLY } = require("../api/_lib/chatTurn.js");
const { RISK, ACUTE_REPLY, CRISIS_RESOURCES, screenMessage } = require("../api/_lib/safetyScreen.js");
const { definitions, run: runTool, OFFERABLE } = require("../api/_lib/agentTools.js");
const { systemBlocks, contextBlock, runTurn } = require("../api/_lib/chatAgent.js");
const corpus = require("../api/_lib/careerCorpus.js");
const conversations = require("../api/_lib/conversations.js");
const webhook = require("../api/_lib/routes/agent/webhook.js");

let passed = 0, failed = 0;
async function test(name, fn){
  try{ await fn(); passed++; console.log("  ✓ " + name); }
  catch(err){ failed++; console.log("  ✗ " + name + "\n      " + (err && err.message || err)); }
}

const PHONE = "919812345678";
const OTHER_PHONE = "919800000001";
const UID = "Kj8x2QaR4mN7pLz3WcY5Bv1XnH9t";

function screenReturning(risk, reason){
  return async () => ({ risk, reason: reason || "test" });
}
function agentReturning(reply, extra){
  return async () => Object.assign({ reply, toolCalls: [], usage:{ input_tokens:900, output_tokens:120 },
                                     rounds:0, handedOff:false }, extra || {});
}
const silentNotify = async () => true;

// ── the gate ──────────────────────────────────────────────────────────

console.log("\nthe safety gate");

await test("an acute message never reaches the composing model", async () => {
  store.clear();
  let agentCalled = false;
  const result = await handleInbound({ phone: PHONE, text: "I don't want to wake up tomorrow" }, {
    screen: screenReturning(RISK.ACUTE, "mentions not wanting to wake up"),
    agent: async () => { agentCalled = true; return agentReturning("hi")(); },
    notify: silentNotify
  });

  assert.equal(agentCalled, false, "the agent must not be called at all on an acute screen");
  assert.equal(result.agentRan, false);
  assert.equal(result.reply, ACUTE_REPLY);
  assert.equal(result.risk, RISK.ACUTE);
});

await test("the acute reply carries real helpline numbers, composed by nobody", async () => {
  for(const line of CRISIS_RESOURCES) assert.ok(ACUTE_REPLY.includes(line));
  assert.match(ACUTE_REPLY, /14416/);
  assert.match(ACUTE_REPLY, /1800-599-0019/);
});

await test("an acute message pages a human", async () => {
  store.clear();
  const sent = [];
  await handleInbound({ phone: PHONE, text: "there is no point in any of this" }, {
    screen: screenReturning(RISK.ACUTE, "hopelessness framed as final"),
    agent: agentReturning("should not run"),
    notify: async (payload) => { sent.push(payload); return true; }
  });
  assert.equal(sent.length, 1);
  assert.match(sent[0].type, /URGENT/);
});

await test("a locked thread stays locked — the next message does not reach the agent either", async () => {
  store.clear();
  let calls = 0;
  const agent = async () => { calls++; return agentReturning("hi")(); };

  await handleInbound({ phone: PHONE, text: "I want to disappear" },
    { screen: screenReturning(RISK.ACUTE, "acute"), agent, notify: silentNotify });

  const second = await handleInbound({ phone: PHONE, text: "actually what does a CA earn?" },
    { screen: screenReturning(RISK.NONE), agent, notify: silentNotify });

  assert.equal(calls, 0, "a locked thread must never reach the agent");
  assert.equal(second.reply, LOCKED_REPLY);
});

await test("only a named human can unlock a thread", async () => {
  store.clear();
  await handleInbound({ phone: PHONE, text: "I want to disappear" },
    { screen: screenReturning(RISK.ACUTE, "acute"), agent: agentReturning("x"), notify: silentNotify });

  const thread = await conversations.getThread(PHONE);
  assert.equal(thread.humanLocked, true);

  conversations.unlockThread(thread, "A Counsellor");
  await conversations.saveThread(thread);

  const reopened = await handleInbound({ phone: PHONE, text: "what does a CA earn?" },
    { screen: screenReturning(RISK.NONE), agent: agentReturning("About ₹40k–90k a month to start."), notify: silentNotify });
  assert.match(reopened.reply, /40k/);
});

await test("the gate is asked on every message, not once per thread", async () => {
  store.clear();
  let screened = 0;
  const screen = async () => { screened++; return { risk: RISK.NONE, reason:"fine" }; };
  for(let i = 0; i < 3; i++){
    await handleInbound({ phone: PHONE, text: "question " + i },
      { screen, agent: agentReturning("answer"), notify: silentNotify });
  }
  assert.equal(screened, 3, "somebody fine at 9pm may not be fine at 11pm");
});

await test("a screening failure fails CLOSED, unlike every other guard here", async () => {
  const verdict = await screenMessage("anything", {
    createMessage: async () => { throw new Error("network down"); }
  });
  assert.equal(verdict.risk, RISK.CONCERN);
  assert.equal(verdict.degraded, true);
});

await test("an unparseable screening answer is treated as concern, not as none", async () => {
  const verdict = await screenMessage("anything", {
    createMessage: async () => ({ content: [{ type:"text", text:"not json at all" }] })
  });
  assert.equal(verdict.risk, RISK.CONCERN);
});

await test("a concern screen still answers, but tells the agent to offer a person", async () => {
  store.clear();
  let seenContext = null;
  await handleInbound({ phone: PHONE, text: "I can't sleep, I cry every day before boards" }, {
    screen: screenReturning(RISK.CONCERN, "not sleeping, crying"),
    agent: async (input) => { seenContext = input.context; return agentReturning("I'm sorry.")(); },
    notify: silentNotify
  });
  assert.match(seenContext.entitlementHint, /offer a session/i);
  assert.match(seenContext.entitlementHint, /do not try to work through/i);
});

// ── identity ──────────────────────────────────────────────────────────

console.log("\nwhose data the agent can see");

await test("an unlinked number gets nothing personal, however it asks", async () => {
  store.clear();
  for(const toolName of ["get_my_scores", "check_entitlements", "create_checkout"]){
    const out = await runTool(toolName, { sku:"wellness-session" }, { uid:null, phone:PHONE });
    assert.equal(out.linked, false, toolName + " leaked to an unlinked caller");
    assert.match(out.message, /linked/i);
  }
});

await test("no tool schema has a parameter that could name another account", async () => {
  for(const def of definitions()){
    for(const param of Object.keys(def.input_schema.properties)){
      assert.ok(!/uid|phone|account|email|customer/i.test(param),
        def.name + " exposes an identity parameter: " + param);
    }
  }
});

await test("no tool schema has a parameter that could carry a price", async () => {
  for(const def of definitions()){
    for(const [param, spec] of Object.entries(def.input_schema.properties)){
      assert.ok(!/amount|price|rupee|discount|total|cost/i.test(param),
        def.name + " exposes a price parameter: " + param);
      assert.ok(!(spec.type === "number" && /amount|price/i.test(param)));
    }
  }
});

await test("create_checkout prices from the catalogue, not from anything said to it", async () => {
  store.clear();
  const out = await runTool("create_checkout",
    { sku:"wellness-session", amount: 1, price: 1 },   // ignored: not in the schema
    { uid: UID, phone: PHONE });
  assert.equal(out.ok, true);
  assert.equal(out.amount, 499, "the price must come from catalog.js");
});

await test("create_checkout refuses products that are not the agent's to sell", async () => {
  const out = await runTool("create_checkout", { sku:"internship-240-hour" }, { uid: UID, phone: PHONE });
  assert.equal(out.ok, false);
  assert.ok(OFFERABLE.indexOf("internship-240-hour") === -1);
});

await test("linking needs a code minted from a signed-in session", async () => {
  store.clear();
  // A stranger guessing gets nowhere.
  const guess = await runTool("link_account", { code:"AAAAAA" }, { phone: PHONE });
  assert.equal(guess.ok, false);
  assert.equal(await conversations.linkedAccount(PHONE), null);

  // The real flow: signed-in page mints, WhatsApp redeems.
  const { code } = await conversations.createLinkCode(UID);
  const linked = await runTool("link_account", { code }, { phone: PHONE });
  assert.equal(linked.ok, true);
  assert.equal(await conversations.linkedAccount(PHONE), UID);
});

await test("a linking code is single use and does not link a second number", async () => {
  store.clear();
  const { code } = await conversations.createLinkCode(UID);
  await runTool("link_account", { code }, { phone: PHONE });

  const second = await runTool("link_account", { code }, { phone: OTHER_PHONE });
  assert.equal(second.ok, false);
  assert.match(second.message, /already been used/i);
  assert.equal(await conversations.linkedAccount(OTHER_PHONE), null);
});

await test("an expired code does not link", async () => {
  store.clear();
  const { code } = await conversations.createLinkCode(UID);
  store.seed("agentLinkCodes", code, Object.assign({}, store.read("agentLinkCodes", code), {
    expiresAt: new Date(Date.now() - 1000).toISOString()
  }));
  const out = await runTool("link_account", { code }, { phone: PHONE });
  assert.equal(out.ok, false);
  assert.match(out.message, /expired/i);
});

await test("unlinking actually unlinks", async () => {
  store.clear();
  const { code } = await conversations.createLinkCode(UID);
  await runTool("link_account", { code }, { phone: PHONE });
  await conversations.unlinkAccount(PHONE);
  assert.equal(await conversations.linkedAccount(PHONE), null);
});

// ── grounding ─────────────────────────────────────────────────────────

console.log("\nwhat it may claim to know");

await test("a career the library does not have returns a refusal to improvise", async () => {
  const out = await runTool("lookup_career", { query: "quantum astrologer" }, {});
  assert.equal(out.found, false);
  assert.match(out.message, /rather than describing the career from general knowledge/i);
});

await test("a real career comes back with Indian salary bands and exams", async () => {
  const out = await runTool("lookup_career", { query: "chartered accountant" }, {});
  assert.equal(out.found, true);
  const ca = out.careers[0];
  assert.match(ca.title, /Chartered Accountant/);
  assert.ok(ca.salary.entry);
  assert.ok(ca.exams);
});

await test("cutoffs are refused honestly while the JoSAA ingest has no data", async () => {
  const out = await runTool("predict_colleges", { rank: 12400, category:"OPEN" }, {});
  assert.equal(out.available, false);
  assert.match(out.message, /Do not estimate a cutoff from memory/i);
});

await test("the catalogue index names real ids the agent can look up", async () => {
  const cat = corpus.catalogue();
  assert.equal(cat.careers.length, 97);
  assert.equal(cat.gov.length, 51);
  const firstId = cat.careers[0].split(" | ")[0];
  assert.ok(corpus.getCareer(firstId), "catalogue lists an id that getCareer cannot resolve");
});

// ── the loop ──────────────────────────────────────────────────────────

console.log("\nthe tool loop");

await test("the cached prefix does not vary between two clients", async () => {
  const requests = [];
  const capture = async (req) => {
    requests.push(req);
    return { content: [{ type:"text", text:"Answer." }], usage:{ input_tokens:1, output_tokens:1 } };
  };
  await runTurn({ message:"hi", history:[], context:{ uid: UID, phone: PHONE } }, { createMessage: capture });
  await runTurn({ message:"hello", history:[], context:{ uid: null, phone: OTHER_PHONE } }, { createMessage: capture });

  assert.deepEqual(requests[0].system, requests[1].system,
    "anything per-client in the cached blocks re-bills every message at full price");
  assert.notDeepEqual(requests[0].messages, requests[1].messages);
});

await test("the agent is named Buddy and does not pass itself off as a counsellor", async () => {
  const prefix = systemBlocks().map(b => b.text).join("\n");
  assert.match(prefix, /You are Buddy/);
  assert.match(prefix, /Introduce yourself as Buddy/);
  assert.match(prefix, /assistant, not a counsellor/);
  assert.ok(!/Lume AI/.test(prefix), "the old name should be gone from the prompt");
});

await test("the agent is told to do the asking, and told where to stop", async () => {
  /*
    A student who is worried but cannot name the question is the common
    case, not the edge case — so the agent asks rather than waiting. The
    risk in that instruction is the opposite failure: an intake form that
    interrogates somebody before it will tell them anything, or one that
    collects identifiers it has no business holding. Both halves are
    pinned here because the second is what makes the first safe.
  */
  const prefix = systemBlocks().map(b => b.text).join("\n");

  // It asks.
  assert.match(prefix, /Lead with the question\. Do not wait to be asked one\./);
  assert.match(prefix, /Never open with "how can I help\?"/);

  // It does not interrogate.
  assert.match(prefix, /One question per message/);
  assert.match(prefix, /Answer first when they asked something real/);
  assert.match(prefix, /Ask only what changes your answer/);
  assert.match(prefix, /Stop asking once you can answer/);

  // It does not hoard identity, and does not re-ask what it already has.
  assert.match(prefix, /Never ask for identifiers/);
  assert.match(prefix, /Never ask for what a tool can tell you/);

  // One question at a time is the counselling craft's rule too — the two
  // blocks must not contradict each other on this.
  assert.match(prefix, /one question at a time/i);
});

await test("the agent is allowed to be useful, and still may not invent a number", async () => {
  /*
    "It answers nothing" and "it invents cut-offs" are the two ways this
    prompt fails, and they pull in opposite directions. The first version
    said every factual claim about a career had to come from a tool, which
    made it refuse study advice, exam questions and anything the 97-career
    library did not happen to hold — useless in a way that reads as broken.

    Loosening that is the change most likely to erode the guarantee that
    actually matters, so both edges are pinned here.
  */
  const prefix = systemBlocks().map(b => b.text).join("\n");

  // It may think.
  assert.match(prefix, /Answer freely from your own knowledge/);
  assert.match(prefix, /unhelpfulness wearing caution's coat/);

  // It may not make up the things somebody acts on.
  assert.match(prefix, /Look up, every time, no exceptions/);
  assert.match(prefix, /a number, date, cut-off or price that somebody could act on must be looked up/);
  assert.match(prefix, /predict_colleges/);
  assert.match(prefix, /plausible invention is the most damaging thing you can produce/);

  // Prices still come from the catalogue, not from recollection.
  assert.match(prefix, /only figures returned by validate_coupon or create_checkout/);
});

await test("the channel reaches the agent, because register depends on it", async () => {
  const web = contextBlock({ uid: null, channel: "web" });
  const wa  = contextBlock({ uid: null, channel: "whatsapp" });

  assert.match(web, /website chat panel/);
  assert.match(web, /do not clip a real question into two sentences/);
  assert.match(wa,  /two or three sentences/);
  assert.notEqual(web, wa, "the two channels must not read identically");

  // On the web a sign-in is the whole linking step; there is no code.
  assert.match(contextBlock({ uid: null, channel: "web" }), /no code to send here/);
  assert.match(contextBlock({ uid: null, channel: "whatsapp" }), /linking step/);
});

await test("the counselling craft reaches the model, and is shared with the report agent", async () => {
  const prefix = systemBlocks().map(b => b.text).join("\n");

  // The Indian decision calendar.
  assert.match(prefix, /Dropping Maths closes engineering/);
  assert.match(prefix, /JoSAA allocates IITs/);
  assert.match(prefix, /log kya kahenge/i);

  // The counselling method.
  assert.match(prefix, /Resist the righting reflex/);
  assert.match(prefix, /A flat profile usually means limited exposure/);
  assert.match(prefix, /Career guidance is not psychotherapy/);

  // The same two blocks the report agent gets, byte for byte.
  const craft = require("../api/_lib/counsellingCraft.js").craftBlocks();
  const reportPrefix = require("../api/_lib/reportStyle.js").systemBlocks().map(b => b.text);
  for(const block of craft){
    assert.ok(prefix.includes(block.text), "the chat prefix is missing a craft block");
    assert.ok(reportPrefix.includes(block.text), "the report prefix is missing the same craft block");
  }
});

await test("expertise did not quietly widen the scope", async () => {
  const prefix = systemBlocks().map(b => b.text).join("\n");
  /* The risk in asking for a more expert agent is that it starts doing more
     counselling rather than recognising the edge sooner. The prompt has to
     keep saying the opposite. */
  assert.match(prefix, /Do not counsel/);
  assert.match(prefix, /referring sooner, not doing more/);
  assert.match(prefix, /Refer without hesitating/);
  assert.match(prefix, /never diagnose/i);
});

await test("every tool result for a round goes back in one message", async () => {
  let round = 0;
  const capture = async (req) => {
    if(round++ === 0){
      return { content: [
        { type:"tool_use", id:"t1", name:"lookup_career", input:{ query:"actuary" } },
        { type:"tool_use", id:"t2", name:"get_booking_link", input:{} }
      ], usage:{ input_tokens:1, output_tokens:1 } };
    }
    // Splitting results across messages teaches the model to stop
    // calling tools in parallel.
    const last = req.messages[req.messages.length - 1];
    assert.equal(last.role, "user");
    assert.equal(last.content.length, 2, "both tool results must arrive in a single user message");
    return { content: [{ type:"text", text:"Here you go." }], usage:{ input_tokens:1, output_tokens:1 } };
  };
  const out = await runTurn({ message:"tell me about actuary and booking", history:[], context:{} },
    { createMessage: capture });
  assert.equal(out.reply, "Here you go.");
  assert.deepEqual(out.toolCalls.map(t => t.name), ["lookup_career", "get_booking_link"]);
});

await test("a failing tool still returns a result rather than being dropped", async () => {
  let round = 0;
  const capture = async (req) => {
    if(round++ === 0){
      return { content: [{ type:"tool_use", id:"t1", name:"lookup_career", input:{ query:"x" } }],
               usage:{ input_tokens:1, output_tokens:1 } };
    }
    const last = req.messages[req.messages.length - 1];
    assert.equal(last.content[0].type, "tool_result");
    assert.equal(last.content[0].is_error, true);
    return { content: [{ type:"text", text:"I couldn't check that." }], usage:{ input_tokens:1, output_tokens:1 } };
  };
  const out = await runTurn({ message:"x", history:[], context:{} },
    { createMessage: capture, runTool: async () => { throw new Error("boom"); } });
  assert.match(out.reply, /couldn't check/);
});

await test("an agent that never settles hands over instead of filling silence", async () => {
  store.clear();
  const spinning = async () => ({ reply:"", toolCalls:[], usage:{}, rounds:6, handedOff:false, exhausted:true });
  const result = await handleInbound({ phone: PHONE, text:"..." },
    { screen: screenReturning(RISK.NONE), agent: spinning, notify: silentNotify });

  assert.equal(result.reply, FAILED_REPLY);
  assert.equal(result.locked, true);
});

await test("a handoff locks the thread so the agent stops answering over a human", async () => {
  store.clear();
  const handing = async () => ({ reply:"Someone will message you.", toolCalls:[{ name:"handoff_to_human" }],
                                 usage:{}, rounds:1, handedOff:true });
  await handleInbound({ phone: PHONE, text:"can I talk to a person" },
    { screen: screenReturning(RISK.NONE), agent: handing, notify: silentNotify });

  const thread = await conversations.getThread(PHONE);
  assert.equal(thread.humanLocked, true);
});

// ── budget ────────────────────────────────────────────────────────────

console.log("\nbudget");

await test("the daily cap hands over rather than refusing", async () => {
  store.clear();
  const thread = await conversations.getThread(PHONE);
  for(let i = 0; i < conversations.DAILY_MESSAGE_CAP; i++) conversations.chargeMessage(thread, null);
  await conversations.saveThread(thread);

  let agentCalled = false;
  const result = await handleInbound({ phone: PHONE, text:"one more question" }, {
    screen: screenReturning(RISK.NONE),
    agent: async () => { agentCalled = true; return agentReturning("hi")(); },
    notify: silentNotify
  });

  assert.equal(agentCalled, false);
  assert.equal(result.reply, OVER_BUDGET_REPLY);
  assert.ok(!/allowance|limit|quota/i.test(result.reply), "do not tell a client they ran out of allowance");
});

await test("an acute message is screened even when the budget is spent", async () => {
  store.clear();
  const thread = await conversations.getThread(PHONE);
  for(let i = 0; i < conversations.DAILY_MESSAGE_CAP; i++) conversations.chargeMessage(thread, null);
  await conversations.saveThread(thread);

  const result = await handleInbound({ phone: PHONE, text:"I want to end it" }, {
    screen: screenReturning(RISK.ACUTE, "acute"),
    agent: agentReturning("x"),
    notify: silentNotify
  });
  assert.equal(result.reply, ACUTE_REPLY, "the gate must run before the budget check");
});

await test("the thread id is a hash, so the collection is not a phone directory", async () => {
  const id = conversations.threadId(PHONE);
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.ok(!id.includes("9812345678"));
});

// ── the webhook ───────────────────────────────────────────────────────

console.log("\nthe webhook");

await test("a bad signature is rejected", async () => {
  const raw = JSON.stringify({ hello: "world" });
  assert.equal(webhook.signatureValid(raw, "sha256=" + "0".repeat(64), "secret"), false);
  assert.equal(webhook.signatureValid(raw, "garbage", "secret"), false);
  assert.equal(webhook.signatureValid(raw, "", "secret"), false);
});

await test("a good signature is accepted", async () => {
  const crypto = await import("node:crypto");
  const raw = JSON.stringify({ hello: "world" });
  const sig = "sha256=" + crypto.createHmac("sha256", "secret").update(raw, "utf8").digest("hex");
  assert.equal(webhook.signatureValid(raw, sig, "secret"), true);
  assert.equal(webhook.signatureValid(raw, sig, "wrong-secret"), false);
});

await test("only real text messages are extracted — receipts and reactions are ignored", async () => {
  const payload = { entry: [{ changes: [{ value: {
    messages: [
      { id:"1", from:"919812345678", type:"text", text:{ body:"hello" } },
      { id:"2", from:"919812345678", type:"reaction", reaction:{ emoji:"👍" } },
      { id:"3", from:"919812345678", type:"image", image:{ id:"x" } }
    ],
    statuses: [{ id:"s1", status:"delivered" }]
  } }] }] };
  const out = webhook.extractMessages(payload);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "hello");
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
