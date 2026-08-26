/*
  One inbound WhatsApp message, start to finish.

  The order of operations here is the safety design. It is deliberately
  boring and deliberately rigid:

    1. Is this thread already locked to a human?      → do not compose
    2. Screen the message for distress                 → may lock it now
    3. Is this person within their daily budget?       → hand off if not
    4. Only then, run the agent

  Step 2 happens before step 4 on every single message, with no fast
  path, no cache, and no "we already screened this person earlier".
  Somebody can be fine at 9pm and not fine at 11pm, and the whole point
  of the gate is that it is asked every time.

  ── The acute branch composes nothing ──

  On an acute screen the agent is never called. A fixed, human-written
  message goes out carrying helpline numbers that a person checked, the
  owner is paged, and the thread locks so the next message reaches a
  human rather than a chatbot that has decided the moment passed. A model
  improvising a crisis response — or a helpline digit — is the worst
  failure available to this system, so it is not given the chance.
*/

const { screenMessage, RISK, ACUTE_REPLY } = require("./safetyScreen");
const { runTurn } = require("./chatAgent");
const conversations = require("./conversations");
const { notifyOwner } = require("./notify");
const { latestRun } = require("./assessments");

const LOCKED_REPLY =
  "A counsellor from Lume Live is picking this up personally — they'll message you here shortly. " +
  "I'll stay out of the way until then.";

const OVER_BUDGET_REPLY =
  "We've covered a lot today. Let me get a counsellor to take this from here — " +
  "they can go properly into it with you. Someone will message you shortly.";

const FAILED_REPLY =
  "Something went wrong at my end. A counsellor has been told and will message you shortly — " +
  "sorry about that.";

/*
  `deps` exists so the whole flow can be tested without an API key, a
  network, or Firestore: { screen, agent, notify }.
*/
async function handleInbound({ phone, text }, deps){
  const d = deps || {};
  const screen = d.screen || screenMessage;
  const agent = d.agent || runTurn;
  const notify = d.notify || notifyOwner;

  const thread = await conversations.getThread(phone);
  const uid = await conversations.linkedAccount(phone);
  const message = String(text || "").trim();

  conversations.appendTurn(thread, { role: "user", text: message.slice(0, 4000) });

  // ── 1. already with a human ─────────────────────────────────────────
  if(thread.humanLocked){
    conversations.appendTurn(thread, { role: "assistant", text: LOCKED_REPLY, by: "system" });
    await conversations.saveThread(thread);
    return { reply: LOCKED_REPLY, risk: null, locked: true, agentRan: false };
  }

  // ── 2. the gate ─────────────────────────────────────────────────────
  const verdict = await screen(message);
  conversations.flagRisk(thread, verdict);

  if(verdict.risk === RISK.ACUTE){
    conversations.lockToHuman(thread, verdict.reason || "acute screen");
    conversations.appendTurn(thread, { role: "assistant", text: ACUTE_REPLY, by: "safety" });
    await conversations.saveThread(thread);

    try{
      await notify({
        type: "whatsapp-agent-URGENT",
        phone: String(phone || ""),
        summary: "URGENT: a client on WhatsApp may be at risk. The agent has stopped and this thread is locked to a human.",
        details: { thread: thread.threadId, reason: verdict.reason || "", degraded: Boolean(verdict.degraded) }
      });
    }catch(err){
      // The client already has the helpline numbers. A failed notification
      // must not swallow that, and it must be loud in the log.
      console.error("[lume agent] URGENT notification failed for thread", thread.threadId, err && err.message);
    }

    return { reply: ACUTE_REPLY, risk: RISK.ACUTE, locked: true, agentRan: false };
  }

  // ── 3. budget ───────────────────────────────────────────────────────
  if(!conversations.withinBudget(thread)){
    conversations.appendTurn(thread, { role: "assistant", text: OVER_BUDGET_REPLY, by: "system" });
    conversations.lockToHuman(thread, "daily message cap reached");
    await conversations.saveThread(thread);
    try{
      await notify({
        type: "whatsapp-agent-handoff",
        phone: String(phone || ""),
        summary: "Daily agent cap reached — conversation handed to a human.",
        details: { thread: thread.threadId }
      });
    }catch(err){ console.error("[lume agent] cap notification failed:", err && err.message); }
    return { reply: OVER_BUDGET_REPLY, risk: verdict.risk, locked: true, agentRan: false };
  }

  // ── 4. the agent ────────────────────────────────────────────────────
  let profileTaken = null;
  if(uid){
    try{
      const run = await latestRun(uid);
      if(run) profileTaken = String(run.createdAt || "").slice(0, 10);
    }catch(err){ profileTaken = null; }
  }

  /*
    A "concern" screen does not stop the agent, but it changes what the
    agent is told to do: acknowledge, do not problem-solve the distress,
    and offer a person. Delivered as an instruction in the context block
    rather than by swapping the system prompt, so the cached prefix holds.
  */
  const entitlementHint = verdict.risk === RISK.CONCERN
    ? "This client sounds genuinely stressed. Acknowledge it briefly and warmly, do not try to work through the feeling with them, and offer a session with a counsellor. Keep it short."
    : null;

  let result;
  try{
    result = await agent({
      message: message,
      history: conversations.recentTurns(thread).slice(0, -1),
      context: { uid: uid, phone: phone, threadId: thread.threadId, profileTaken, entitlementHint }
    });
  }catch(err){
    console.error("[lume agent] turn failed:", err && err.message);
    conversations.appendTurn(thread, { role: "assistant", text: FAILED_REPLY, by: "system" });
    conversations.lockToHuman(thread, "agent error: " + (err && err.code || "unknown"));
    await conversations.saveThread(thread);
    try{
      await notify({ type:"whatsapp-agent-handoff", phone:String(phone || ""),
        summary:"The agent errored and the thread was handed to a human.",
        details:{ thread: thread.threadId, error: String(err && err.message || "").slice(0, 300) } });
    }catch(e){ /* already logged above */ }
    return { reply: FAILED_REPLY, risk: verdict.risk, locked: true, agentRan: true, failed: true };
  }

  /*
    An exhausted loop or an empty reply is not something to paper over
    with a filler sentence: the agent had five rounds and did not land an
    answer, which is a question for a person.
  */
  const reply = String(result.reply || "").trim();
  if(!reply || result.exhausted){
    conversations.appendTurn(thread, { role: "assistant", text: FAILED_REPLY, by: "system" });
    conversations.lockToHuman(thread, result.exhausted ? "agent ran out of tool rounds" : "agent returned nothing");
    conversations.chargeMessage(thread, result.usage);
    await conversations.saveThread(thread);
    try{
      await notify({ type:"whatsapp-agent-handoff", phone:String(phone || ""),
        summary:"The agent could not settle on an answer and handed over.",
        details:{ thread: thread.threadId, rounds: result.rounds } });
    }catch(e){ /* logged by notify */ }
    return { reply: FAILED_REPLY, risk: verdict.risk, locked: true, agentRan: true, exhausted: true };
  }

  conversations.appendTurn(thread, {
    role: "assistant", text: reply, by: "agent",
    tools: result.toolCalls.map(t => t.name)
  });
  conversations.chargeMessage(thread, result.usage);

  // The agent asked for a human. Lock so it stops answering over them.
  if(result.handedOff) conversations.lockToHuman(thread, "agent requested handoff");

  await conversations.saveThread(thread);

  return {
    reply: reply,
    risk: verdict.risk,
    locked: Boolean(result.handedOff),
    agentRan: true,
    tools: result.toolCalls.map(t => t.name),
    usage: result.usage
  };
}

module.exports = { handleInbound, LOCKED_REPLY, OVER_BUDGET_REPLY, FAILED_REPLY };
