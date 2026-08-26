/*
  Saved assessment results.

  Until now every assessment on this site was scored in the browser and
  then thrown away: assessment.html writes progress to localStorage under
  `lume-live-assessment-progress:{uid}` and nothing ever leaves the
  device. Clearing site data, switching from the phone to the laptop, or
  simply finishing the test loses the result — and the counsellor who
  later writes that client's report starts from a blank page.

  This is where a finished result is kept instead.

  Two rules shape everything below.

  SCORES, NOT ANSWERS. What gets stored is the computed profile — six
  RIASEC totals, eight work anchors, four VARK counts, five Big Five
  traits. Not "item 12: 2". Every downstream product (the report, a
  school cohort view, a counsellor opening a session) needs the profile
  and none of them need the item rows, and the item rows are what makes
  a breach of this collection actually harmful. Storing less is not a
  compromise here; it is the whole design.

  THE SHAPE IS A WHITELIST. validate() rebuilds the document key by key
  from a fixed table rather than trusting and cleaning what arrived.
  Anything the client sends that isn't in INSTRUMENTS or CONTEXT_FIELDS
  is dropped on the floor. Without that, /api/assessment/save is a
  general-purpose "write arbitrary JSON to our database, authenticated
  as any signed-in user" endpoint, which is a different and much worse
  thing than the one we meant to build.
*/

const crypto = require("crypto");
const { db } = require("./firebaseAdmin");

const COLLECTION = "assessments";

/*
  Bumped when the meaning of a stored score changes — a re-scaled
  instrument, a re-worded item bank, a different maximum. Old documents
  keep their old version rather than being migrated, because a report
  drafted from a v1 profile should stay reproducible from that profile.
  Readers that care must check it.
*/
const SCHEMA_VERSION = 1;

/*
  The instruments assessment.html actually scores, with the keys and
  maxima its own scoring functions produce. These maxima are not
  decoration: a score outside [0, max] means the page and this file have
  drifted apart, and it is rejected rather than stored.

    riasec   H()  six interest types, one point per ticked statement
    anchors  W()  eight work values, 40 Likert points + 4 per top-three pick
    vark     N()  four learning channels, one point per option chosen
    bigfive  q()  five traits, IPIP-50 scored 0-40

  `wellbeing` is deliberately absent. lume-wellbeing-check.js is a
  separate, on-demand screener with its own modal, it is not part of the
  saGenerate flow, and it is the most sensitive thing this site asks
  anybody. It gets its own consent conversation before it gets storage.
*/
const INSTRUMENTS = {
  riasec:  { keys: ["R", "I", "A", "S", "E", "C"], max: 7 },
  anchors: { keys: ["SV", "CH", "MA", "AU", "IN", "WF", "ST", "EN"], max: 42 },
  vark:    { keys: ["V", "A", "R", "K"], max: 16 },
  bigfive: { keys: ["O", "C", "E", "A", "N"], max: 40 }
};

/*
  Context the counsellor needs to read a profile properly — a RIASEC
  code means something different for a Class 10 student than for a
  working professional.

  Name, phone and email are NOT here. The account already carries them,
  they are verified there and typed here, and copying them into a second
  collection means two places to honour a deletion request from.
*/
const CONTEXT_FIELDS = {
  stage:   80,   // "Class 12 Science"
  city:    60,
  course:  80,
  concern: 300   // free text, the one field where somebody may write a paragraph
};

const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS);
const MAX_AGE = 100;

/*
  A cohort code ties a run to a school group, so the batch drafting in
  Phase 2 knows which runs belong together. The student types it once,
  from whatever the school handed out.

  It is validated for shape only and never trusted to mean anything on
  its own: /api/agent/cohort refuses to run for a code with no cohort
  record, and the codes it mints carry a random tail precisely so a
  stranger cannot guess their way into a school's roster.
*/
const COHORT_CODE = /^[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){0,3}$/;

function newRunId(){
  // Time-ordered prefix so a plain string sort puts the newest run last,
  // and 8 random bytes so two runs saved in the same millisecond — the
  // same person double-tapping Generate — cannot collide.
  return Date.now().toString(36) + "-" + crypto.randomBytes(8).toString("hex");
}

function clampText(value, max){
  return String(value == null ? "" : value).trim().slice(0, max);
}

/*
  Rebuilds a storable document from whatever arrived, or explains why it
  can't. Returns { ok:true, doc } or { ok:false, error }.

  Pure — no Firestore, no clock beyond the run id — so the rules can be
  tested directly.
*/
function validate(input){
  const body = input && typeof input === "object" ? input : {};

  /*
    Consent is checked here rather than at the endpoint because this is
    the function that decides what a stored document looks like, and a
    stored document without a recorded consent is exactly the thing we
    promised not to create. `true` only: a missing flag is not consent,
    and neither is the string "false".
  */
  if(body.consent !== true){
    return { ok:false, error:"CONSENT_REQUIRED", message:"We can only save your result if you agree to it being stored." };
  }

  const scores = body.scores && typeof body.scores === "object" ? body.scores : null;
  if(!scores){
    return { ok:false, error:"NO_SCORES", message:"No assessment scores were included." };
  }

  const cleanScores = {};
  let instrumentsSeen = 0;

  for(const name of INSTRUMENT_NAMES){
    const raw = scores[name];
    if(raw == null) continue;              // a partial save is allowed
    if(typeof raw !== "object"){
      return { ok:false, error:"BAD_SCORES", message:"The " + name + " scores are not in the expected format." };
    }

    const spec = INSTRUMENTS[name];
    const out = {};
    for(const key of spec.keys){
      /*
        Strictly a JSON number. Not Number(raw[key]) — an unanswered part
        of the assessment scores as NaN in the browser, JSON.stringify
        turns NaN into null, and Number(null) is 0. That path would store
        "this person scored zero on every work anchor" as though it were
        a real profile. A missing score has to fail here instead.
      */
      const value = raw[key];
      if(typeof value !== "number" || !Number.isFinite(value)){
        return { ok:false, error:"BAD_SCORES", message:"The " + name + " score for " + key + " is missing or not a number." };
      }
      if(value < 0 || value > spec.max){
        return { ok:false, error:"BAD_SCORES", message:"The " + name + " score for " + key + " is outside the range this instrument can produce." };
      }
      out[key] = value;
    }
    out.max = spec.max;
    cleanScores[name] = out;
    instrumentsSeen++;
  }

  if(instrumentsSeen === 0){
    return { ok:false, error:"NO_SCORES", message:"No recognised assessment scores were included." };
  }

  const context = body.context && typeof body.context === "object" ? body.context : {};
  const cleanContext = {};
  for(const field of Object.keys(CONTEXT_FIELDS)){
    const value = clampText(context[field], CONTEXT_FIELDS[field]);
    if(value) cleanContext[field] = value;
  }

  // Age is the one context field with a shape worth enforcing: it drives
  // how a report is written, and "17" typed as "seventeen" should not
  // silently become NaN in a stored profile.
  const age = Number(context.age);
  if(context.age != null && String(context.age).trim() !== ""){
    if(!Number.isFinite(age) || age < 5 || age > MAX_AGE){
      return { ok:false, error:"BAD_CONTEXT", message:"That age doesn't look right — please check it." };
    }
    cleanContext.age = Math.round(age);
  }

  // Optional. A student taking the assessment on their own has none.
  let cohort = null;
  if(body.cohort != null && String(body.cohort).trim() !== ""){
    cohort = String(body.cohort).trim().toUpperCase();
    if(!COHORT_CODE.test(cohort)){
      return { ok:false, error:"BAD_COHORT", message:"That group code doesn't look right — please check it with your school." };
    }
  }

  return {
    ok: true,
    doc: {
      schemaVersion: SCHEMA_VERSION,
      instrument: clampText(body.instrument, 40) || "student-full-v1",
      scores: cleanScores,
      context: cleanContext,
      cohort: cohort,
      consent: true
    }
  };
}

/*
  Writes a validated document. The uid comes from the verified ID token
  at the endpoint and is never read from the body — the same rule
  create-order.js follows, for the same reason.
*/
async function saveRun({ uid, doc }){
  const firestore = db();
  const runId = newRunId();
  const now = new Date().toISOString();

  await firestore.collection(COLLECTION).doc(runId).set(Object.assign({}, doc, {
    runId: runId,
    uid: String(uid),
    createdAt: now,
    updatedAt: now
  }));

  return { runId, createdAt: now };
}

/*
  Every run this account has saved, newest first.

  Filtered by uid and sorted in JS rather than with orderBy, so this
  needs no composite index in Firestore — one person's runs are a
  handful of documents and sorting them here costs nothing. If that ever
  stops being true, add the index and the orderBy together.
*/
async function listRuns(uid){
  const firestore = db();
  const snap = await firestore.collection(COLLECTION).where("uid", "==", String(uid)).get();

  const rows = [];
  snap.forEach(doc => rows.push(doc.data()));

  return rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

/*
  Every run tagged with a cohort code, oldest first.

  One run per account: a student who re-takes the assessment should count
  once in their school's cohort, as their most recent profile, not twice
  with the earlier one dragging the averages around.
*/
async function listByCohort(cohort){
  const firestore = db();
  const code = String(cohort || "").trim().toUpperCase();
  if(!code) return [];

  const snap = await firestore.collection(COLLECTION).where("cohort", "==", code).get();

  const newest = new Map();
  snap.forEach(doc => {
    const run = doc.data();
    const seen = newest.get(run.uid);
    if(!seen || String(run.createdAt || "") > String(seen.createdAt || "")){
      newest.set(run.uid, run);
    }
  });

  return Array.from(newest.values())
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

// One run by id. Here rather than in the callers so `assessments` is
// still a collection only this file knows the name of.
async function getRun(runId){
  const firestore = db();
  const snap = await firestore.collection(COLLECTION).doc(String(runId)).get();
  return snap.exists ? snap.data() : null;
}

async function latestRun(uid){
  const rows = await listRuns(uid);
  return rows.length ? rows[0] : null;
}

/*
  Deletes every run belonging to an account.

  This exists because the consent we ask for is not worth much without
  it. It deletes rather than flagging: a soft delete would leave the
  scores in the collection, which is precisely what somebody asking to
  be forgotten is asking us not to do.

  Returns the number of runs removed.
*/
async function deleteRuns(uid){
  const firestore = db();
  const snap = await firestore.collection(COLLECTION).where("uid", "==", String(uid)).get();

  const ids = [];
  snap.forEach(doc => ids.push(doc.id));

  for(const id of ids){
    await firestore.collection(COLLECTION).doc(id).delete();
  }

  return ids.length;
}

// What a client is allowed to read back about its own run. Kept separate
// from the stored shape so adding an internal field later — a drafting
// status, a counsellor note — doesn't publish it by accident.
function publicView(run){
  if(!run) return null;
  return {
    run_id: run.runId,
    instrument: run.instrument,
    schema_version: run.schemaVersion,
    scores: run.scores,
    context: run.context,
    created_at: run.createdAt
  };
}

module.exports = {
  COLLECTION,
  SCHEMA_VERSION,
  INSTRUMENTS,
  CONTEXT_FIELDS,
  COHORT_CODE,
  validate,
  saveRun,
  listRuns,
  listByCohort,
  getRun,
  latestRun,
  deleteRuns,
  publicView,
  newRunId
};
