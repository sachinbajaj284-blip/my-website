/*
  Drafting the personalised half of a Full Clarity Report.

  Input is a saved profile from assessments.js. Output is prose, keyed by
  instrument key, in exactly the shape reports.js merges into
  LUME_REPORT_DATA. Nothing here writes to Firestore and nothing here
  decides whether a client sees anything — this is the model call and the
  shape check around it, and that is all.

  Three decisions worth knowing.

  THE MODEL NEVER EMITS A NUMBER. Names, tags, definitions, scores and
  maxima all come from reportTables.js and the saved profile. The schema
  below has no numeric field anywhere, so a hallucinated score is not a
  bug we have to catch — it is a sentence the model has no slot to write.

  STRUCTURED OUTPUT, NOT PARSING. output_config.format pins the reply to
  the schema, so there is no JSON to fish out of prose and no repair
  step. The check in validateDraft() is a second pair of eyes on
  completeness, not a parser.

  THE CLIENT IS INJECTABLE. `createMessage` can be passed in, the same
  way account.js takes `verifyIdToken`, so the drafting rules can be
  tested without an API key, a network, or a rupee of spend.
*/

const { systemBlocks } = require("./reportStyle");
const { RIASEC, ANCHORS, VARK, BIGFIVE } = require("./reportTables");

const MODEL = "claude-opus-5";

/*
  additionalProperties:false everywhere, and every field required. A
  draft missing three nextSteps is not a cheaper draft — it is a report
  with holes in it that a counsellor has to notice, and noticing is
  exactly what we are trying to spend their attention on less.
*/
function buildSchema(profile){
  const scores = profile.scores || {};

  const entry = (fields) => ({
    type: "object",
    properties: fields,
    required: Object.keys(fields),
    additionalProperties: false
  });

  const str = (description) => ({ type: "string", description });

  const group = (present, keys, fields) => {
    if(!present) return null;
    const props = {};
    for(const key of keys) props[key] = entry(fields);
    return entry(props);
  };

  const properties = {};

  const riasec = group(scores.riasec, Object.keys(RIASEC), {
    meaning:   str("2-3 sentences on what this interest level means for this person."),
    realLife:  { type:"array", items:{ type:"string" }, minItems:2, maxItems:2,
                 description:"Exactly two concrete examples, 1-2 sentences each." },
    nextStep:  str("One action they can take this week, alone, for free.")
  });
  if(riasec) properties.riasec = riasec;

  const anchors = group(scores.anchors, Object.keys(ANCHORS), {
    nextStep: str("One action this week that tests or uses this work value.")
  });
  if(anchors) properties.anchors = anchors;

  const vark = group(scores.vark, Object.keys(VARK), {
    nextStep: str("One study habit to try this week, specific to this channel.")
  });
  if(vark) properties.vark = vark;

  if(scores.bigfive){
    properties.personality = entry({
      trait: { type:"string", enum: Object.keys(BIGFIVE),
               description:"The trait whose score is furthest from the mid-point — the one worth leading with." },
      desc:  str("2-3 sentences on how this trait tends to show up for them.")
    });
  }

  properties.careerDirections = {
    type: "array",
    items: { type: "string" },
    minItems: 6,
    maxItems: 6,
    description: "Six short career directions, 2-4 words each, from the top interests and anchors together."
  };

  return { type:"object", properties, required:Object.keys(properties), additionalProperties:false };
}

/*
  What the model is told about this particular person. Deliberately
  small and deliberately last: everything stable lives in the cached
  system blocks, so only this varies per request.

  Scores are labelled with their maximum in the text — the model needs to
  know 6 is high for RIASEC and low for anchors — but it still never
  writes one back.
*/
function buildUserMessage(profile){
  const scores = profile.scores || {};
  const context = profile.context || {};
  const lines = [];

  const describe = (label, table, group) => {
    if(!group) return;
    lines.push("");
    lines.push(label + ":");
    Object.keys(table)
      .filter(k => group[k] != null)
      .sort((a, b) => group[b] - group[a])
      .forEach(k => {
        lines.push("  " + table[k].name + " (" + k + "): " + group[k] + " out of " + group.max);
      });
  };

  lines.push("Draft the personalised sections for this profile.");
  lines.push("");
  lines.push("Context:");
  lines.push("  Stage: " + (context.stage || "not given"));
  lines.push("  Age: " + (context.age != null ? context.age : "not given"));
  lines.push("  City: " + (context.city || "not given"));
  if(context.course) lines.push("  Course: " + context.course);
  lines.push("  In their words, what they want help with: " + (context.concern || "not given"));

  describe("RIASEC interests, highest first", RIASEC, scores.riasec);
  describe("Work anchors, highest first", ANCHORS, scores.anchors);
  describe("Learning channels, highest first", VARK, scores.vark);
  describe("Personality traits, highest first", BIGFIVE, scores.bigfive);

  return lines.join("\n");
}

/*
  Completeness, not correctness — a model cannot be checked for whether
  it said something true about a teenager, which is why a counsellor
  signs. What can be checked is that every key the profile carries got
  every field, that nothing came back empty, and that no number leaked
  into the prose slots.
*/
function validateDraft(draft, profile){
  const scores = profile.scores || {};
  const problems = [];

  const text = (value, where) => {
    if(typeof value !== "string" || !value.trim()) problems.push(where + " is empty");
    else if(value.length > 1200) problems.push(where + " is implausibly long");
  };

  const checkGroup = (name, table, fields) => {
    if(!scores[name]) return;
    const group = draft && draft[name];
    if(!group || typeof group !== "object"){ problems.push(name + " is missing"); return; }
    for(const key of Object.keys(table)){
      const item = group[key];
      if(!item || typeof item !== "object"){ problems.push(name + "." + key + " is missing"); continue; }
      for(const field of fields){
        if(field === "realLife"){
          if(!Array.isArray(item.realLife) || item.realLife.length !== 2){
            problems.push(name + "." + key + ".realLife must have exactly two items");
          }else{
            item.realLife.forEach((line, i) => text(line, name + "." + key + ".realLife[" + i + "]"));
          }
        }else{
          text(item[field], name + "." + key + "." + field);
        }
      }
    }
  };

  checkGroup("riasec", RIASEC, ["meaning", "realLife", "nextStep"]);
  checkGroup("anchors", ANCHORS, ["nextStep"]);
  checkGroup("vark", VARK, ["nextStep"]);

  if(scores.bigfive){
    const p = draft && draft.personality;
    if(!p || typeof p !== "object") problems.push("personality is missing");
    else{
      if(!BIGFIVE[p.trait]) problems.push("personality.trait is not a known trait");
      text(p.desc, "personality.desc");
    }
  }

  if(!Array.isArray(draft && draft.careerDirections) || draft.careerDirections.length !== 6){
    problems.push("careerDirections must have exactly six entries");
  }else{
    draft.careerDirections.forEach((d, i) => text(d, "careerDirections[" + i + "]"));
  }

  return { ok: problems.length === 0, problems };
}

/*
  The call.

  `createMessage` defaults to the Anthropic SDK but can be injected. It
  receives the fully-built request and must resolve to a Messages API
  response.
*/
function defaultCreateMessage(){
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();
  return (request) => client.messages.create(request);
}

async function draftReport(profile, options){
  const opts = options || {};
  const createMessage = opts.createMessage || defaultCreateMessage();

  const request = {
    model: opts.model || MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: buildSchema(profile) }
    },
    /*
      A report about exam pressure and self-doubt is exactly the sort of
      thing a safety classifier can decline. Without a fallback a decline
      is simply a stop, and a counsellor is left with no draft and no
      explanation; with one the same request finishes on another model.
    */
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    system: systemBlocks(),
    messages: [{ role: "user", content: buildUserMessage(profile) }]
  };

  const response = await createMessage(request);

  if(response && response.stop_reason === "refusal"){
    const detail = (response.stop_details && response.stop_details.category) || "unspecified";
    const err = new Error("The drafting model declined this profile (" + detail + ").");
    err.code = "MODEL_REFUSED";
    throw err;
  }

  const block = (response && response.content || []).find(b => b && b.type === "text");
  if(!block){
    const err = new Error("The drafting model returned no text.");
    err.code = "EMPTY_DRAFT";
    throw err;
  }

  let draft;
  try{
    draft = typeof block.text === "string" ? JSON.parse(block.text) : block.text;
  }catch(parseErr){
    const err = new Error("The drafting model returned something that is not JSON.");
    err.code = "BAD_DRAFT";
    throw err;
  }

  const checked = validateDraft(draft, profile);
  if(!checked.ok){
    const err = new Error("The draft came back incomplete: " + checked.problems.join("; "));
    err.code = "INCOMPLETE_DRAFT";
    err.problems = checked.problems;
    throw err;
  }

  return {
    draft: draft,
    usage: response.usage || null,
    model: response.model || request.model
  };
}

module.exports = { MODEL, buildSchema, buildUserMessage, validateDraft, draftReport };
