/*
  School cohorts, and the state of the batch drafting one.

  A cohort is a code a school hands to a year group. Students type it
  when they take the assessment; assessments.js records it on the run.
  Everything here is about turning that set of runs into three hundred
  drafted reports and one summary.

  ── Why the code carries a random tail ──

  A student types the code, so it has to be short enough to type and it
  cannot be a secret. But a guessable code — "DAV-RHTK-12A" — means a
  stranger can file themselves into a school's roster and skew its
  averages, or worse, appear on a counsellor's list. newCohortCode()
  appends six random characters so the guessing does not work, and
  /api/agent/cohort refuses to run for a code with no cohort record, so
  a typo lands nowhere rather than creating a phantom group.

  ── Batch state ──

  A batch is not instant: it is submitted, and somewhere between minutes
  and a day later it has results. The cohort document is where that
  lives, so a poll can come from anywhere and a page reload does not lose
  the job.

    status: "open"        collecting assessments, nothing submitted
            "submitted"   batch is with the API
            "drafted"     per-student drafts written, summary not yet made
            "summarised"  the principal's summary exists
            "failed"      submission itself failed
*/

const crypto = require("crypto");
const { db } = require("./firebaseAdmin");

const COLLECTION = "cohorts";

const STATUS = {
  OPEN: "open",
  SUBMITTED: "submitted",
  DRAFTED: "drafted",
  SUMMARISED: "summarised",
  FAILED: "failed"
};

// Unambiguous in handwriting and when read aloud down a phone: no O/0,
// no I/1, no S/5. A school will read this out to a room of thirty.
const ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY2346789";

function randomTail(length){
  const bytes = crypto.randomBytes(length);
  let out = "";
  for(let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function slug(text, max){
  return String(text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, max);
}

/*
  e.g. school "DAV Public School", label "Class 11 Science" →
  "DAVPUBLIC-CLASS11-K7M4XQ"

  Readable enough that a teacher can tell two groups apart, random enough
  that neither can be guessed from the other.
*/
function newCohortCode({ school, label }){
  const parts = [];
  const s = slug(school, 9);
  const l = slug(label, 9);
  if(s) parts.push(s);
  if(l) parts.push(l);
  parts.push(randomTail(6));
  return parts.join("-");
}

async function createCohort({ school, label, createdBy }){
  const firestore = db();
  const code = newCohortCode({ school, label });
  const now = new Date().toISOString();

  const doc = {
    code: code,
    school: String(school || "").slice(0, 120),
    label: String(label || "").slice(0, 120),
    createdBy: String(createdBy || "").slice(0, 120),
    status: STATUS.OPEN,
    batchId: null,
    submittedAt: null,
    runIds: [],
    drafted: 0,
    failures: [],
    summary: null,
    stats: null,
    createdAt: now,
    updatedAt: now
  };

  await firestore.collection(COLLECTION).doc(code).set(doc);
  return doc;
}

async function getCohort(code){
  const firestore = db();
  const snap = await firestore.collection(COLLECTION).doc(String(code || "").toUpperCase()).get();
  return snap.exists ? snap.data() : null;
}

async function listCohorts(){
  const firestore = db();
  const snap = await firestore.collection(COLLECTION).get();
  const rows = [];
  snap.forEach(doc => rows.push(doc.data()));
  return rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function patchCohort(code, patch){
  const firestore = db();
  const ref = firestore.collection(COLLECTION).doc(String(code).toUpperCase());
  await ref.set(Object.assign({}, patch, { updatedAt: new Date().toISOString() }), { merge: true });
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
}

// Records that a batch is in flight, and exactly which runs went into it.
// The roster is stored rather than re-derived at collection time: a
// student who takes the assessment while the batch is running must not
// silently appear as a missing result.
async function markSubmitted({ code, batchId, runIds }){
  return await patchCohort(code, {
    status: STATUS.SUBMITTED,
    batchId: String(batchId),
    runIds: (runIds || []).map(String),
    submittedAt: new Date().toISOString(),
    failures: []
  });
}

async function markDrafted({ code, drafted, failures }){
  return await patchCohort(code, {
    status: STATUS.DRAFTED,
    drafted: Number(drafted) || 0,
    failures: failures || []
  });
}

async function markSummarised({ code, summary, stats }){
  return await patchCohort(code, {
    status: STATUS.SUMMARISED,
    summary: summary || null,
    // Only the principal's half is stored on the cohort document. The
    // named lists are recomputed on demand for whoever is allowed to see
    // them, so a cohort record is never itself a roster of flagged
    // teenagers sitting in a collection.
    stats: stats || null
  });
}

async function markFailed({ code, reason }){
  return await patchCohort(code, {
    status: STATUS.FAILED,
    failures: [{ reason: String(reason || "unknown") }]
  });
}

module.exports = {
  COLLECTION,
  STATUS,
  newCohortCode,
  createCohort,
  getCohort,
  listCohorts,
  patchCohort,
  markSubmitted,
  markDrafted,
  markSummarised,
  markFailed
};
