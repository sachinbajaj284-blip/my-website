/*
  The gate the conversational agent does not get to argue with.

  Every inbound message is classified BEFORE the agent composes anything.
  Not after, and not as part of the same call — because the thing being
  gated is the agent's helpfulness, and a model asked to "be helpful, but
  stop if this is a crisis" is being asked to mark its own homework mid
  sentence.

  ── Why a model call and not a word list ──

  "I don't see the point of any of this anymore" contains no keyword
  worth matching. Neither does "sab kuch khatam lagta hai" or "mummy
  papa ko meri wajah se sirf pareshani hai". A regex over an English
  word list on a service whose clients type Hinglish would be security
  theatre.

  ── Why this exists at all ──

  lumelive.co.in publishes student-mental-health-india.html,
  how-to-deal-with-exam-anxiety.html and board-exam-stress-guide.html,
  and ships a clinical screener in lume-wellbeing-check.js. During
  results week this agent will meet a student in crisis. That is a
  statistical certainty, not a hypothetical, and the design has to
  assume it rather than hope.

  ── Tuned to over-escalate ──

  A false positive costs a counsellor thirty seconds of reading. A false
  negative is the thing this gate exists to prevent. Where the rubric is
  unsure it is told to choose the more serious band, and the tests
  include messages that are merely glum to check the band above does not
  swallow everything.
*/

const MODEL = "claude-opus-5";

const RISK = { NONE: "none", CONCERN: "concern", ACUTE: "acute" };

/*
  India-specific, staffed, free, and correct as written. These numbers go
  out verbatim in a fixed message — no model composes them, because a
  helpline digit invented under pressure is the worst possible failure
  this system could have.
*/
const CRISIS_RESOURCES = [
  "Tele-MANAS — 14416 (free, 24x7, in many Indian languages)",
  "KIRAN — 1800-599-0019 (free, 24x7)",
  "AASRA — 9820466726 (24x7)"
];

const ACUTE_REPLY = [
  "I'm really glad you told me this, and I don't want you to sit with it alone.",
  "",
  "I'm not the right kind of help for what you're carrying right now — a person is. Please talk to one of these, any time, free:",
  "",
  CRISIS_RESOURCES.map(r => "• " + r).join("\n"),
  "",
  "If you are in immediate danger, please call 112 or get to someone you trust right now.",
  "",
  "Someone from Lume Live will also reach out to you directly. You matter more than any career question."
].join("\n");

const SCREEN_RUBRIC = `You are a safety classifier for an Indian career-counselling service used by school and college students, and by their parents.

You are shown ONE message from a client. Decide how much risk of harm it carries. You are not replying to them and you are not helping them — you are only classifying.

Return one of three bands.

"acute" — any sign of risk to life or safety, now or soon:
- Any mention of suicide, self-harm, not wanting to be alive, not waking up, ending things, disappearing permanently.
- Hopelessness framed as final: "there is no point", "everyone would be better off without me", "sab khatam".
- Any plan, method, means, timing or goodbye.
- Abuse, violence or being unsafe at home.
- Someone saying a friend or sibling is in that state.

"concern" — real distress, but no sign of danger to life:
- Panic, dread, not sleeping, not eating, crying a lot, cannot study at all.
- Intense shame or self-blame about results, rank, or letting parents down.
- Severe pressure from family framed as unbearable.
- Being bullied, isolated, or feeling worthless.

"none" — everything else, including ordinary stress:
- "Worried about boards", "confused between PCM and PCB", "scared I'll get a bad rank", "my parents want engineering and I don't".
- Frustration, indecision, disappointment, irritation.
- Any question about careers, exams, colleges, fees, bookings or the service.

Rules:
- Judge the message, not your guess about the person.
- Indian students write in English, Hindi, and Hinglish in Latin script. Read all three the same way.
- Ordinary exam anxiety is "none". This service exists for stressed students; treating every worried teenager as a crisis would make the gate useless and the service unusable.
- When you are genuinely torn between two bands, choose the more serious one.
- "reason" is one short clause naming what you saw. It is read by a counsellor, so never quote the client's words back at length.`;

function buildScreenSchema(){
  return {
    type: "object",
    properties: {
      risk: { type: "string", enum: [RISK.NONE, RISK.CONCERN, RISK.ACUTE] },
      reason: { type: "string", description: "One short clause naming what you saw." }
    },
    required: ["risk", "reason"],
    additionalProperties: false
  };
}

function defaultCreateMessage(){
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();
  return (request) => client.messages.create(request);
}

/*
  Returns { risk, reason }.

  FAILS CLOSED. Every other rate limit and guard on this site fails open,
  because a broken limiter should not stop somebody paying. This one is
  the opposite: if the classifier errors, times out, refuses, or answers
  something unparseable, the result is "concern" — the agent proceeds
  gently and a human is told. An unclassifiable message is not a safe
  message, and the cost of being wrong in this direction is a counsellor
  reading something they did not need to.
*/
async function screenMessage(text, options){
  const opts = options || {};
  const createMessage = opts.createMessage || defaultCreateMessage();
  const message = String(text || "").slice(0, 4000);

  if(!message.trim()){
    return { risk: RISK.NONE, reason: "empty message" };
  }

  let response;
  try{
    response = await createMessage({
      model: opts.model || MODEL,
      max_tokens: 256,
      output_config: {
        // The rubric does the work; deep reasoning here buys latency on
        // every single inbound message and little else.
        effort: "low",
        format: { type: "json_schema", schema: buildScreenSchema() }
      },
      cache_control: { type: "ephemeral" },
      system: [{ type: "text", text: SCREEN_RUBRIC }],
      messages: [{ role: "user", content: message }]
    });
  }catch(err){
    return { risk: RISK.CONCERN, reason: "screening failed: " + (err && err.message || "unknown"), degraded: true };
  }

  if(!response || response.stop_reason === "refusal"){
    return { risk: RISK.CONCERN, reason: "screening refused", degraded: true };
  }

  const block = (response.content || []).find(b => b && b.type === "text");
  if(!block) return { risk: RISK.CONCERN, reason: "screening returned nothing", degraded: true };

  let verdict;
  try{
    verdict = typeof block.text === "string" ? JSON.parse(block.text) : block.text;
  }catch(err){
    return { risk: RISK.CONCERN, reason: "screening was not parseable", degraded: true };
  }

  const risk = [RISK.NONE, RISK.CONCERN, RISK.ACUTE].indexOf(verdict && verdict.risk) !== -1
    ? verdict.risk
    : RISK.CONCERN;

  return {
    risk: risk,
    reason: String((verdict && verdict.reason) || "").slice(0, 300),
    degraded: risk !== (verdict && verdict.risk)
  };
}

module.exports = {
  RISK,
  MODEL,
  SCREEN_RUBRIC,
  CRISIS_RESOURCES,
  ACUTE_REPLY,
  buildScreenSchema,
  screenMessage
};
