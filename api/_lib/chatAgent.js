/*
  The conversational agent: system prompt, and the tool loop.

  A manual loop rather than the SDK's tool runner. This codebase
  hand-rolls its plumbing on purpose and carries almost no dependencies,
  and more to the point the money-touching tools want an approval gate
  somebody can read in one file rather than a callback threaded through a
  helper.

  ── What is cached and what is not ──

  The system prompt and the career catalogue are identical on every turn
  and are sent as cached blocks. The transcript and the client's own
  profile are not. Nothing per-client may move into the cached half: at
  WhatsApp volumes that would turn a tenth-of-a-rupee cache read into a
  full-price re-send on every message anybody sends.

  ── What this file does not decide ──

  Whether the client is safe. That happened before this was called; see
  safetyScreen.js. By the time runTurn() executes, somebody else has
  already decided this message is one the agent may answer.
*/

const { definitions, run: runTool } = require("./agentTools");
const { catalogue } = require("./careerCorpus");
const { craftBlocks } = require("./counsellingCraft");

const MODEL = "claude-opus-5";

// Enough for a few lookups and an answer. A conversation that wants more
// than this is a conversation that wants a human.
const MAX_TOOL_ROUNDS = 5;

const SYSTEM = `You are Lume AI — Lume Live's assistant on WhatsApp.

Introduce yourself as Lume AI if somebody asks who they are talking to, and say plainly that you are an assistant, not a counsellor. Never imply you are the counsellor they would meet in a session.

Lume Live is an Indian career counselling practice based in Rohtak, Haryana, working online across India. Its counsellors hold an M.Sc in Clinical Psychology. A first 1:1 session is ₹249 with code FIRST50 (list ₹499), against a typical Indian market rate of ₹2,000–3,000. There are no compulsory packages.

You are talking to students, and often to their parents.

## How to talk

Short. WhatsApp short — two or three sentences, then a question. Never a wall of text, never bullet lists unless they genuinely asked for a list of things.

Warm and direct. You are the practice's front desk, not a chatbot performing enthusiasm. No exclamation marks stacked up, no "Great question!", no emoji unless they use them first.

Answer in the language and register the message arrived in. Hindi gets Hindi. Hinglish in Latin script gets Hinglish back — that is how most parents write, and translating them into formal English reads as correcting them.

## What you actually know

You have Lume Live's own career library — 97 careers and 51 government-job routes, with Indian salary bands, entrance exams and what the work is like day to day. **Every factual claim about a career must come from lookup_career or lookup_government_job.** If the library does not have something, say so. Do not describe a career from general knowledge: a client can get that from any chatbot, and being right about Indian specifics is the entire reason this service is worth messaging.

Never invent: cut-offs, ranks, fees, college names with claims attached, exam dates, statistics, salary figures. If you did not get it from a tool, you do not know it.

## Their own results

If they have linked their account, get_my_scores gives you their real assessment — interests, work values, learning style, personality. That is the one thing no other assistant has, so use it: talk about *them*, not about careers in general.

If they have not linked, do not ask them for personal details as a substitute. Offer the linking step, and meanwhile answer the general question well.

## What you must not do

The two blocks that follow this one carry how a counsellor actually works and what the limits are. Read them as binding, not as background — in particular the sections on describing tendencies rather than diagnosing, and on when to refer.

**Do not counsel.** You answer questions about streams, exams, colleges, careers, fees and bookings. You do not do therapy, you do not work through family conflict, and you do not talk anybody through distress. That is a session with a human, and offering one is the right answer.

**Being expert here means referring sooner, not doing more.** A question about the decision is yours. A question about the person is not.

**Do not promise outcomes.** No "you will get in", no "this course guarantees a job".

**Prices come from tools.** Never state a rupee figure you did not get back from validate_coupon or create_checkout in this conversation.

**One person's data only.** You can see the account linked to this number and nothing else. If somebody asks about another student, tell them you cannot.

## When to hand over

Call handoff_to_human when they ask for a person, when the question needs judgement about their life rather than information, when they are upset, or when you have looked twice and still cannot help. Handing over early is a good outcome, not a failure — a booked session is what this conversation is for.

## Selling

Do not push. Answer the question first. If a session or a report is genuinely the next step, say so once, plainly, with what it costs and what they get. If they say no, drop it and keep helping.`;

/*
  The catalogue as a second cached block: ids and titles only, so the
  agent knows what exists and can pass a real query, without carrying the
  text of ninety-seven career records on every turn.
*/
function catalogueBlock(){
  const cat = catalogue();
  return [
    "# Lume Live career library — index only",
    "Use lookup_career / lookup_government_job to read any of these. Do not answer from this index alone; it has no detail in it.",
    "",
    "## Careers (id | title | sector | RIASEC themes)",
    cat.careers.join("\n"),
    "",
    "## Government job routes (id | title | category)",
    cat.gov.join("\n")
  ].join("\n");
}

/*
  Four cached blocks, in the order they are useful to the model: who it is and
  how it behaves, then the domain it works in, then how a counsellor conducts
  the conversation, then the index of what it may talk about.

  All four are byte-identical on every request, which is what keeps a turn at
  a tenth of a rupee. The craft blocks are shared with the report agent — the
  knowledge does not differ between writing a report and answering a message,
  only the register does, and that lives in SYSTEM above.
*/
function systemBlocks(){
  return [
    { type: "text", text: SYSTEM },
    ...craftBlocks(),
    { type: "text", text: catalogueBlock() }
  ];
}

/*
  Per-turn context the agent needs but must not be able to change. Sent
  as a user-side preamble rather than in the system blocks, because it
  varies per client and the system blocks are cached.
*/
function contextBlock({ uid, profileTaken, entitlementHint }){
  const lines = ["[Context you did not receive from the client]"];
  lines.push(uid
    ? "This number is linked to a Lume Live account. get_my_scores and check_entitlements will work."
    : "This number is NOT linked to any account. Personal tools will refuse. Offer the linking step if personal advice is wanted.");
  if(profileTaken) lines.push("They have a saved assessment from " + profileTaken + ".");
  if(entitlementHint) lines.push(entitlementHint);
  return lines.join("\n");
}

function defaultCreateMessage(){
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();
  return (request) => client.messages.create(request);
}

function textOf(content){
  return (content || []).filter(b => b && b.type === "text").map(b => b.text).join("\n").trim();
}

/*
  One turn: the client's message in, the agent's reply out, with however
  many tool rounds it took in between.

  Returns { reply, toolCalls, usage, rounds, handedOff }.
*/
async function runTurn({ message, history, context }, options){
  const opts = options || {};
  const createMessage = opts.createMessage || defaultCreateMessage();
  const execute = opts.runTool || runTool;
  const ctx = context || {};

  const messages = [];

  // The transcript, oldest first.
  for(const turn of (history || [])){
    if(turn.role !== "user" && turn.role !== "assistant") continue;
    if(!turn.text) continue;
    messages.push({ role: turn.role, content: turn.text });
  }

  messages.push({
    role: "user",
    content: contextBlock(ctx) + "\n\n" + String(message || "")
  });

  const usage = { input_tokens: 0, output_tokens: 0 };
  const toolCalls = [];
  let handedOff = false;
  let rounds = 0;

  while(rounds <= MAX_TOOL_ROUNDS){
    const response = await createMessage({
      model: opts.model || MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: systemBlocks(),
      tools: definitions(),
      messages: messages
    });

    usage.input_tokens += Number((response.usage || {}).input_tokens || 0);
    usage.output_tokens += Number((response.usage || {}).output_tokens || 0);

    if(response.stop_reason === "refusal"){
      const err = new Error("The model declined this message.");
      err.code = "MODEL_REFUSED";
      throw err;
    }

    const calls = (response.content || []).filter(b => b && b.type === "tool_use");

    if(!calls.length){
      return {
        reply: textOf(response.content),
        toolCalls: toolCalls,
        usage: usage,
        rounds: rounds,
        handedOff: handedOff
      };
    }

    messages.push({ role: "assistant", content: response.content });

    /*
      Every tool_result for a round goes back in ONE user message. Splitting
      them across messages quietly teaches the model to stop calling tools
      in parallel, and a failed tool still gets a result rather than being
      dropped — a missing tool_result is a malformed conversation.
    */
    const results = [];
    for(const call of calls){
      let output;
      try{
        output = await execute(call.name, call.input, ctx);
      }catch(err){
        output = { error: "That lookup failed. Tell the client you could not check, rather than guessing." };
      }
      if(call.name === "handoff_to_human") handedOff = true;
      toolCalls.push({ name: call.name, input: call.input });
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(output),
        is_error: Boolean(output && output.error)
      });
    }
    messages.push({ role: "user", content: results });

    rounds++;
  }

  /*
    Out of rounds. Not an error the client should see as one — it means
    the agent kept reaching for tools and never settled, which is exactly
    the shape of a question a person should answer.
  */
  return {
    reply: "",
    toolCalls: toolCalls,
    usage: usage,
    rounds: rounds,
    handedOff: handedOff,
    exhausted: true
  };
}

module.exports = { MODEL, SYSTEM, MAX_TOOL_ROUNDS, systemBlocks, catalogueBlock, contextBlock, runTurn };
