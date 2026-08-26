/*
  Drafting a whole school at once.

  Phase 1's agent, submitted through the Batch API at half the per-token
  price, plus one ordinary call that turns the computed statistics into
  prose for a principal.

  ── The bug this file exists to not have ──

  Batch results come back in ARBITRARY ORDER. Zipping them against the
  request array by position is the obvious implementation and it is
  catastrophic here: it sends student A's report to student B, in a
  school, three hundred times, and every single report looks plausible.
  Nothing in this file may index a result by position. collectResults()
  keys strictly on custom_id, refuses a custom_id it did not submit, and
  the test feeds it deliberately shuffled results.

  ── Why the summary is a separate, ordinary call ──

  The numbers in a cohort summary are computed by cohortStats.js before
  the model is asked for a single word. The model is given the finished
  statistics and asked to write them up; it is never asked to count
  anything. A principal reading "31% of your Science cohort lead with
  Artistic interests" is reading arithmetic, not a recollection.
*/

const { buildSchema, buildUserMessage, validateDraft } = require("./reportAgent");
const { systemBlocks } = require("./reportStyle");
const { RIASEC } = require("./reportTables");

const MODEL = "claude-opus-5";

/*
  One batch request per profile, custom_id = runId.

  runId is `{base36}-{16 hex}` from assessments.js, which is inside the
  character set custom_id allows and is unique per run, so it is both a
  valid key and the thing we actually need back.
*/
function buildBatchRequests(profiles){
  return (profiles || []).map(profile => ({
    custom_id: String(profile.runId),
    params: {
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: buildSchema(profile) }
      },
      cache_control: { type: "ephemeral" },
      system: systemBlocks(),
      messages: [{ role: "user", content: buildUserMessage(profile) }]
    }
  }));
}

/*
  Turns whatever the batch hands back into per-run outcomes.

  `results` is any iterable of batch result rows — the SDK's async
  iterator in production, an array in tests. Order is not trusted and not
  used.

  Returns { drafted, failed } where drafted is keyed by runId. A row for
  a custom_id we never submitted is a failure, not a silent skip: it
  means the batch and the roster have diverged and somebody must look.
*/
async function collectResults(results, profiles){
  const byRunId = new Map((profiles || []).map(p => [String(p.runId), p]));
  const drafted = new Map();
  const failed = [];
  const seen = new Set();

  for await (const row of results){
    const runId = String(row && row.custom_id || "");

    if(!byRunId.has(runId)){
      failed.push({ runId: runId, reason: "unknown_custom_id",
                    detail: "The batch returned a result for a run that was not submitted." });
      continue;
    }
    if(seen.has(runId)){
      failed.push({ runId: runId, reason: "duplicate_result",
                    detail: "The batch returned two results for the same run." });
      continue;
    }
    seen.add(runId);

    const outcome = row.result || {};

    if(outcome.type !== "succeeded"){
      failed.push({
        runId: runId,
        reason: outcome.type || "unknown",
        detail: (outcome.error && outcome.error.type) || null
      });
      continue;
    }

    const message = outcome.message || {};
    if(message.stop_reason === "refusal"){
      failed.push({ runId: runId, reason: "refusal",
                    detail: (message.stop_details && message.stop_details.category) || null });
      continue;
    }

    const block = (message.content || []).find(b => b && b.type === "text");
    if(!block){
      failed.push({ runId: runId, reason: "empty", detail: null });
      continue;
    }

    let prose;
    try{
      prose = typeof block.text === "string" ? JSON.parse(block.text) : block.text;
    }catch(err){
      failed.push({ runId: runId, reason: "not_json", detail: null });
      continue;
    }

    // Same completeness gate a single draft goes through. A batch is not
    // a reason to lower the bar; it is three hundred reasons not to.
    const checked = validateDraft(prose, byRunId.get(runId));
    if(!checked.ok){
      failed.push({ runId: runId, reason: "incomplete", detail: checked.problems.join("; ") });
      continue;
    }

    drafted.set(runId, { prose: prose, usage: message.usage || null, model: message.model || MODEL });
  }

  // A submitted run with no row at all is its own kind of failure.
  for(const runId of byRunId.keys()){
    if(!seen.has(runId)){
      failed.push({ runId: runId, reason: "no_result",
                    detail: "The batch returned nothing for this run." });
    }
  }

  return { drafted, failed };
}

// ── the principal's summary ───────────────────────────────────────────

const SUMMARY_SYSTEM = `You are writing the cohort summary a Lume Live counsellor hands to a school principal.

Lume Live is an Indian career counselling practice. The reader is a head teacher or a school counsellor deciding where to spend limited attention across a year group.

You are given statistics that have ALREADY BEEN COMPUTED from the students' assessments. Your job is to write them up. Never recompute, never estimate, and never state a number that is not in the input. If you want to say "about a third", check that the input supports it.

## What to write

- An opening paragraph: what this cohort looks like, in plain language.
- What stands out: the two or three patterns a school could actually act on.
- What it means for teaching: the learning-channel mix, concretely.
- Where attention is worth spending: how many students have no clear signal, and how many are in a stream their interests do not point at.

## Rules

**No names, no individuals, ever.** You are given counts only. If you find yourself writing "one student", stop — the named list goes to the school's counsellor separately and is not your business.

**Nothing clinical.** No wellbeing, no stress, no mental health, no "at risk". These students were assessed on interests, work values, learning style and personality, and nothing else. A school reading anything clinical into this document would be reading something we did not measure.

**A flat profile is not a deficiency.** Students with no clear interest peak are the ones who most need a conversation, and that is how to say it — not as a failing of the student.

**No recommendations about individual subject choices.** Describe patterns; leave decisions to the counsellor and the family.

**Indian school context.** Class 10, Class 11, Class 12, streams, boards, entrance exams. Rupees if money comes up at all.

Warm, direct, and short. A principal reads the first paragraph and skims the rest.`;

function buildSummarySchema(){
  const str = (description) => ({ type:"string", description });
  return {
    type: "object",
    properties: {
      headline: str("One sentence naming the single most useful thing about this cohort."),
      overview: str("2-3 sentences describing the cohort in plain language."),
      standsOut: {
        type: "array",
        items: { type:"object",
                 properties: { title: str("A short label."), detail: str("2-3 sentences.") },
                 required: ["title", "detail"], additionalProperties: false },
        minItems: 2, maxItems: 4,
        description: "The patterns a school could act on."
      },
      forTeaching: str("2-3 sentences on what the learning-channel mix means in a classroom."),
      whereToSpendAttention: str("2-3 sentences on where counselling time would do most good, in counts not names.")
    },
    required: ["headline", "overview", "standsOut", "forTeaching", "whereToSpendAttention"],
    additionalProperties: false
  };
}

function buildSummaryMessage({ stats, cohort }){
  const p = stats.principal;
  const lines = [];

  const rows = (label, list, total) => {
    if(!list || !list.length) return;
    lines.push("");
    lines.push(label + ":");
    list.forEach(r => {
      const pct = total ? " (" + Math.round((r.count / total) * 100) + "%)" : "";
      lines.push("  " + (r.label || r.key) + ": " + r.count + pct);
    });
  };

  lines.push("Cohort: " + (cohort.label || cohort.code));
  if(cohort.school) lines.push("School: " + cohort.school);
  lines.push("Students assessed: " + p.students);

  rows("Year groups", p.stages, p.students);
  rows("Leading interest", p.interestLeaders, p.students);
  rows("Most common three-letter interest codes", p.hollandCodes, p.students);
  rows("Leading work value", p.anchorLeaders, p.students);
  rows("Preferred learning channel", p.learningChannels, p.students);

  lines.push("");
  lines.push("Average personality trait scores:");
  p.traitAverages.forEach(t => lines.push("  " + t.label + ": " + t.average + " out of " + t.max));

  lines.push("");
  lines.push("Profile clarity:");
  lines.push("  Clear leading interest: " + p.profileClarity.clear);
  lines.push("  No interest stands out: " + p.profileClarity.flat);

  lines.push("");
  lines.push("Stream and interest:");
  lines.push("  Students whose stream was stated and profile was clear: " + p.streamAttention.checked);
  lines.push("  Of those, strongest interests point away from that stream: " + p.streamAttention.worthATalk);

  lines.push("");
  lines.push("Data quality:");
  lines.push("  Assessments answered near-identically throughout: " + p.dataQuality.straightLined);

  return lines.join("\n");
}

function defaultCreateMessage(){
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();
  return (request) => client.messages.create(request);
}

async function draftCohortSummary({ stats, cohort }, options){
  const opts = options || {};
  const createMessage = opts.createMessage || defaultCreateMessage();

  const response = await createMessage({
    model: opts.model || MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type:"json_schema", schema: buildSummarySchema() } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    system: [{ type: "text", text: SUMMARY_SYSTEM }],
    messages: [{ role: "user", content: buildSummaryMessage({ stats, cohort }) }]
  });

  if(response && response.stop_reason === "refusal"){
    const err = new Error("The model declined to summarise this cohort.");
    err.code = "MODEL_REFUSED";
    throw err;
  }

  const block = (response && response.content || []).find(b => b && b.type === "text");
  if(!block){
    const err = new Error("The model returned no summary.");
    err.code = "EMPTY_SUMMARY";
    throw err;
  }

  let summary;
  try{
    summary = typeof block.text === "string" ? JSON.parse(block.text) : block.text;
  }catch(err){
    const bad = new Error("The summary was not JSON.");
    bad.code = "BAD_SUMMARY";
    throw bad;
  }

  /*
    The one check worth making on a document about minors: it must not
    have acquired a name. The model is given no names, so a name here
    would mean either a leak into the prompt or an invention, and both
    are reasons to stop rather than to publish.
  */
  const text = JSON.stringify(summary);
  const uidLeak = (stats.counsellor.worthATalk || [])
    .concat(stats.counsellor.noClearSignal || [], stats.counsellor.checkResponses || [])
    .some(s => text.includes(s.uid) || text.includes(s.runId));
  if(uidLeak){
    const err = new Error("The summary contained a student identifier and was discarded.");
    err.code = "SUMMARY_LEAKED_IDENTIFIER";
    throw err;
  }

  return { summary: summary, usage: response.usage || null, model: response.model || MODEL };
}

module.exports = {
  MODEL,
  buildBatchRequests,
  collectResults,
  buildSummarySchema,
  buildSummaryMessage,
  draftCohortSummary,
  SUMMARY_SYSTEM
};
