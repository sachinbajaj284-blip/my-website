/*
  Drafted reports, and the counsellor's signature on them.

  A drafted report is not a deliverable. It sits at status "draft" until
  a counsellor has read it, edited whatever needed editing, and signed —
  and only a signed report is ever released to a client. The credential
  on this site is M.Sc Clinical Psychology and it has to mean a person
  read the words.

  The other reason is less obvious and matters more over time. Every
  edit a counsellor makes is a statement about what the drafting agent
  got wrong. sign() records the diff between what the model wrote and
  what the counsellor released, field by field, so the review queue is
  also the eval set. When those diffs get small and boring the prompt is
  working; when a particular field is edited every single time, that
  field's instruction in reportStyle.js is wrong. Without this record
  you are tuning a prompt on vibes.

  reports/{runId} — one document per drafted run, so a report is
  addressable by the profile it was drafted from and a profile cannot
  quietly acquire two competing reports.
*/

const { db } = require("./firebaseAdmin");
const { RIASEC, ANCHORS, VARK, BIGFIVE, MAXIMA } = require("./reportTables");

const COLLECTION = "reports";

const STATUS_DRAFT = "draft";
const STATUS_SIGNED = "signed";

/*
  Merges the fixed tables, the saved scores and the drafted prose into
  the object report-template.html renders from.

  Note where each field comes from. Names, tags, definitions and maxima
  are ours. Scores are the client's. Only meaning / realLife / nextStep /
  desc / careerDirections came from the model. Nothing the model wrote
  can change a number, because it was never given a slot to put one in.
*/
function buildReportData({ profile, prose, client }){
  const scores = profile.scores || {};
  const context = profile.context || {};
  const person = client || {};

  const sortedKeys = (table, group) =>
    Object.keys(table).filter(k => group[k] != null).sort((a, b) => group[b] - group[a]);

  const data = {
    name: person.name || "",
    age: context.age != null ? String(context.age) : "",
    stage: context.stage || "",
    city: context.city || "",
    concern: context.concern || "",
    generatedAt: new Date().toISOString()
  };

  if(scores.riasec){
    data.riasec = sortedKeys(RIASEC, scores.riasec).map(key => {
      const written = (prose.riasec && prose.riasec[key]) || {};
      return {
        key: key,
        name: RIASEC[key].name,
        tag: RIASEC[key].tag,
        score: scores.riasec[key],
        max: scores.riasec.max || MAXIMA.riasec,
        meaning: written.meaning || "",
        realLife: Array.isArray(written.realLife) ? written.realLife : [],
        nextStep: written.nextStep || ""
      };
    });
  }

  if(scores.anchors){
    data.anchors = sortedKeys(ANCHORS, scores.anchors).map(key => {
      const written = (prose.anchors && prose.anchors[key]) || {};
      return {
        key: key,
        name: ANCHORS[key].name,
        short: ANCHORS[key].short,
        score: scores.anchors[key],
        max: scores.anchors.max || MAXIMA.anchors,
        desc: ANCHORS[key].desc,
        nextStep: written.nextStep || ""
      };
    });
  }

  if(scores.vark){
    data.vark = sortedKeys(VARK, scores.vark).map(key => {
      const written = (prose.vark && prose.vark[key]) || {};
      return {
        key: key,
        name: VARK[key].name,
        desc: VARK[key].desc,
        score: scores.vark[key],
        max: scores.vark.max || MAXIMA.vark,
        nextStep: written.nextStep || ""
      };
    });
  }

  if(scores.bigfive && prose.personality){
    const trait = BIGFIVE[prose.personality.trait] ? prose.personality.trait : sortedKeys(BIGFIVE, scores.bigfive)[0];
    const score = scores.bigfive[trait];
    const max = scores.bigfive.max || MAXIMA.bigfive;
    data.personality = {
      name: BIGFIVE[trait].name,
      // The band, not an interpretation. Same thresholds the assessment
      // page uses, so the report and the on-screen result agree.
      word: score >= max * 0.675 ? "High" : score <= max * 0.325 ? "Lower" : "Mid-range",
      score: score,
      max: max,
      desc: prose.personality.desc || ""
    };
  }

  data.careerDirections = Array.isArray(prose.careerDirections) ? prose.careerDirections : [];

  return data;
}

/*
  Records a fresh draft. Overwrites any previous unsigned draft for the
  same run — re-drafting is cheap and a stale draft nobody signed is
  worth nothing — but refuses to overwrite a signed one, because that is
  a document a client may already be holding.
*/
async function saveDraft({ runId, uid, prose, meta }){
  const firestore = db();
  const ref = firestore.collection(COLLECTION).doc(String(runId));

  const existing = await ref.get();
  if(existing.exists && existing.data().status === STATUS_SIGNED){
    const err = new Error("This report has already been signed. Unsign it first if it needs redrafting.");
    err.code = "ALREADY_SIGNED";
    throw err;
  }

  const now = new Date().toISOString();
  const doc = {
    runId: String(runId),
    uid: String(uid),
    status: STATUS_DRAFT,
    draftProse: prose,
    finalProse: null,
    signedBy: null,
    signedAt: null,
    edits: null,
    model: (meta && meta.model) || null,
    usage: (meta && meta.usage) || null,
    draftedAt: now,
    updatedAt: now
  };

  await ref.set(doc);
  return doc;
}

/*
  Walks the drafted prose and the counsellor's released version together
  and returns one row per field that changed. Only the leaf strings are
  compared — the structure is fixed by the schema, so a structural
  difference would be a bug rather than an edit.
*/
function diffProse(before, after){
  const changes = [];

  const walk = (a, b, path) => {
    if(typeof a === "string" || typeof b === "string"){
      const from = typeof a === "string" ? a : "";
      const to = typeof b === "string" ? b : "";
      if(from !== to) changes.push({ field: path, from: from, to: to });
      return;
    }
    if(Array.isArray(a) || Array.isArray(b)){
      const left = Array.isArray(a) ? a : [];
      const right = Array.isArray(b) ? b : [];
      const n = Math.max(left.length, right.length);
      for(let i = 0; i < n; i++) walk(left[i], right[i], path + "[" + i + "]");
      return;
    }
    if((a && typeof a === "object") || (b && typeof b === "object")){
      const keys = new Set(Object.keys(a || {}).concat(Object.keys(b || {})));
      for(const key of keys) walk((a || {})[key], (b || {})[key], path ? path + "." + key : key);
    }
  };

  walk(before, after, "");
  return changes;
}

/*
  The signature. Takes the counsellor's final prose — which may be
  byte-identical to the draft, and often will be — and records who
  released it and what they changed on the way.
*/
async function signReport({ runId, finalProse, counsellor }){
  const firestore = db();
  const ref = firestore.collection(COLLECTION).doc(String(runId));

  const snap = await ref.get();
  if(!snap.exists){
    const err = new Error("There is no drafted report for that run.");
    err.code = "NO_DRAFT";
    throw err;
  }

  const current = snap.data();
  const released = finalProse || current.draftProse;
  const changes = diffProse(current.draftProse, released);
  const now = new Date().toISOString();

  const patch = {
    status: STATUS_SIGNED,
    finalProse: released,
    signedBy: String(counsellor || "").slice(0, 120),
    signedAt: now,
    updatedAt: now,
    edits: {
      changedFields: changes.length,
      // The rows themselves, so a later pass can ask *what kind* of thing
      // gets rewritten rather than just how often.
      changes: changes
    }
  };

  await ref.set(patch, { merge: true });
  return Object.assign({}, current, patch);
}

async function getReport(runId){
  const firestore = db();
  const snap = await firestore.collection(COLLECTION).doc(String(runId)).get();
  return snap.exists ? snap.data() : null;
}

// The queue a counsellor works through: drafted, not yet signed, oldest
// first — a report that has been waiting three days matters more than one
// drafted this morning.
async function listDrafts(){
  const firestore = db();
  const snap = await firestore.collection(COLLECTION).where("status", "==", STATUS_DRAFT).get();

  const rows = [];
  snap.forEach(doc => rows.push(doc.data()));
  return rows.sort((a, b) => String(a.draftedAt || "").localeCompare(String(b.draftedAt || "")));
}

// The released prose for a signed report, or null. This is what any
// client-facing path must call — asking for the draft would hand over
// words nobody approved.
function releasedProse(report){
  if(!report || report.status !== STATUS_SIGNED) return null;
  return report.finalProse || report.draftProse;
}

module.exports = {
  COLLECTION,
  STATUS_DRAFT,
  STATUS_SIGNED,
  buildReportData,
  saveDraft,
  signReport,
  diffProse,
  getReport,
  listDrafts,
  releasedProse
};
