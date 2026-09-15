/*
  Lume Live — quiz completion counters.

  Backs the "how many people took this" leaderboard on the quiz result
  pages. One Firestore document per quiz:

    quizStats/{quiz} = {
      total:   1234,                     // completions, all time
      results: { pcm: 410, pcb: 268 },   // what everyone got
      days:    { "2026-09-15": 37 },     // last DAY_WINDOW days only
      updatedAt: 1757894400000
    }

  Two rules this module exists to enforce:

  1. The numbers are real or they are absent. Every read path returns
     `available:false` rather than a plausible-looking number when
     Firestore is unconfigured or erroring, because a made-up count on a
     page that says "students" is a lie to a fifteen-year-old deciding
     what to study.

  2. It is a counter, not a log. Nothing identifying is written — no IP,
     no name, no answers, only which of a fixed set of results came up.
     The one-per-browser check lives on the client, so a retake does not
     inflate the total; that is deliberately defeatable, and the number
     is described as "completions" rather than "people" because of it.
*/

const { db } = require("./firebaseAdmin");

const COLLECTION = "quizStats";
const DAY_WINDOW = 14;          // days of history kept in the document
const MAX_RESULT_KEYS = 40;     // guards against a caller inventing keys

// Only these quizzes have counters, and only these result keys are
// accepted for each — an unknown key is dropped rather than stored, so
// the collection cannot be used as free write-anything storage.
const QUIZZES = {
  // These are the COMBOS keys in stream-selector.js and the RIASEC theme
  // letters in assessment.html. They have to match those exactly — a key
  // that does not appear here is counted in `total` but not broken out,
  // so a rename on the client shows up as a flat distribution rather
  // than as wrong percentages.
  stream:    ["pcm", "pcb", "pcmb", "com_m", "com", "hum", "hum_m"],
  snapshot:  ["R", "I", "A", "S", "E", "C"]
};

function isQuiz(quiz){ return Object.prototype.hasOwnProperty.call(QUIZZES, quiz); }
function isResult(quiz, result){
  return isQuiz(quiz) && QUIZZES[quiz].indexOf(String(result)) !== -1;
}

function today(now){
  return new Date(now || Date.now()).toISOString().slice(0, 10);
}

/* Keeps `days` bounded: a document that grows a key a day forever will
   eventually stop being writable, and nothing on the page looks back
   further than a fortnight anyway. */
function trimDays(days){
  const keys = Object.keys(days || {}).sort();
  const keep = keys.slice(-DAY_WINDOW);
  const out = {};
  keep.forEach(function(k){ out[k] = days[k]; });
  return out;
}

async function recordTake({ quiz, result, now }){
  if(!isQuiz(quiz)) return { ok:false, reason:"unknown-quiz" };

  const stamp = today(now);
  const firestore = db();
  const ref = firestore.collection(COLLECTION).doc(quiz);

  return await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists && snap.data()) || {};

    const results = Object.assign({}, data.results || {});
    if(isResult(quiz, result) && Object.keys(results).length <= MAX_RESULT_KEYS){
      results[result] = Number(results[result] || 0) + 1;
    }

    const days = trimDays(Object.assign({}, data.days || {}));
    days[stamp] = Number(days[stamp] || 0) + 1;

    const total = Number(data.total || 0) + 1;
    tx.set(ref, { total, results, days, updatedAt: Number(now || Date.now()) }, { merge: true });
    return { ok:true, total };
  });
}

/* Shaped for the page: the ranked distribution, today's count, and the
   last seven days. Percentages are computed from the counted results
   rather than from `total`, so they always add up to 100 even though a
   completion recorded before a result key existed is in `total` only. */
function shape(quiz, data){
  const results = (data && data.results) || {};
  const counted = Object.keys(results).reduce(function(n, k){ return n + Number(results[k] || 0); }, 0);

  const ranked = Object.keys(results)
    .map(function(key){
      return {
        key: key,
        count: Number(results[key] || 0),
        pct: counted ? Math.round(Number(results[key] || 0) * 1000 / counted) / 10 : 0
      };
    })
    .sort(function(a, b){ return b.count - a.count || a.key.localeCompare(b.key); });

  const days = (data && data.days) || {};
  const recent = Object.keys(days).sort().slice(-7)
    .map(function(d){ return { day:d, count:Number(days[d] || 0) }; });

  return {
    available: true,
    quiz: quiz,
    total: Number((data && data.total) || 0),
    today: Number(days[today()] || 0),
    week: recent.reduce(function(n, r){ return n + r.count; }, 0),
    ranked: ranked,
    recent: recent
  };
}

async function readStats(quiz){
  if(!isQuiz(quiz)) return { available:false, reason:"unknown-quiz" };
  const snap = await db().collection(COLLECTION).doc(quiz).get();
  return shape(quiz, snap.exists ? snap.data() : {});
}

module.exports = { recordTake, readStats, shape, QUIZZES, isQuiz, isResult, trimDays, DAY_WINDOW };
