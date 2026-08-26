/*
  What a class of assessments adds up to.

  Pure arithmetic over saved profiles. No model, no Firestore, no clock —
  the drafting agent writes prose about a cohort *after* this has decided
  what is true about it, so the numbers a principal reads are computed
  rather than composed.

  ── Two rules about who sees what ──

  AGGREGATE FOR THE PRINCIPAL, NAMES FOR THE COUNSELLOR. A named list of
  students handed to a head teacher is a different product with
  different duties from a distribution chart. buildCohortStats() returns
  the two halves separately and they must stay separate all the way to
  the page: `principal` carries counts and never a uid, `counsellor`
  carries the handful of students worth a conversation.

  NOTHING HERE IS CLINICAL. Phase 0 deliberately does not store the
  wellbeing screener, so there is no wellbeing section and there must not
  be one until that instrument has had its own consent conversation. The
  flags below are about interests and about data quality — "this student
  and their stream point in different directions", "this student answered
  everything the same way" — and are phrased as a reason to talk to
  somebody, never as a finding about them.
*/

const { RIASEC, ANCHORS, VARK, BIGFIVE, MAXIMA } = require("./reportTables");

// A profile with no clear peak is the most useful thing this whole
// exercise finds: it is the student a counsellor should see first,
// because the assessment did not answer their question either.
const FLAT_SPREAD = 0.25;

// Answering every item identically produces a profile that looks real
// and means nothing. Reported as data quality, never as a judgement.
const STRAIGHT_LINE_SPREAD = 0.05;

function ranked(group){
  if(!group) return [];
  return Object.keys(group)
    .filter(k => k !== "max")
    .sort((a, b) => group[b] - group[a])
    .map(key => ({ key, score: group[key] }));
}

// How much daylight there is between the top and bottom of a profile,
// as a fraction of what the instrument could produce.
function spread(group, max){
  const rows = ranked(group);
  if(rows.length < 2) return 0;
  const ceiling = group.max || max || 1;
  return (rows[0].score - rows[rows.length - 1].score) / ceiling;
}

function hollandCode(riasec){
  return ranked(riasec).slice(0, 3).map(r => r.key).join("");
}

function tally(){
  const counts = new Map();
  return {
    add(key){ if(key != null) counts.set(key, (counts.get(key) || 0) + 1); },
    // Descending by count, then alphabetically, so the same cohort always
    // renders in the same order.
    rows(label){
      return Array.from(counts.entries())
        .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))
        .map(([key, count]) => label ? { key, label: label(key), count } : { key, count });
    }
  };
}

/*
  Which broad stream a stage string describes, or null when it does not
  say. Deliberately crude: it reads only what the school already told us
  and never guesses from scores.
*/
function enrolledStream(stage){
  const text = String(stage || "").toLowerCase();
  if(!text) return null;
  if(/commerce/.test(text)) return "Commerce";
  if(/humanities|\barts\b/.test(text)) return "Humanities";
  if(/\bscience\b|\bpcm\b|\bpcb\b|\bmedical\b|non-?medical/.test(text)) return "Science";
  return null;
}

/*
  The interests that most often sit behind each stream.

  A coarse signal for starting a conversation, not a recommendation, and
  used in exactly one direction: to notice when a student's strongest
  interests are nowhere near the stream they are already in. It never
  suggests a stream to anybody.

  A real interest-to-subject-combination bridge would have to run through
  the stream selector's own axes, which score different things entirely.
  That is separate work and should not be faked here.
*/
const STREAM_INTERESTS = {
  Science: ["I", "R"],
  Commerce: ["C", "E"],
  Humanities: ["A", "S"]
};

function average(total, count){
  return count ? Math.round((total / count) * 10) / 10 : 0;
}

function buildCohortStats(runs){
  const profiles = (runs || []).filter(r => r && r.scores);

  const interest = tally();
  const holland = tally();
  const anchor = tally();
  const channel = tally();
  const stage = tally();

  const traitTotals = {};
  let traitCount = 0;

  const clarity = { clear: 0, flat: 0 };
  const streamAttention = { checked: 0, worthATalk: 0 };
  let straightLined = 0;

  const counsellor = {
    // Students whose strongest interests and current stream point
    // different ways. A prompt for a conversation, nothing more.
    worthATalk: [],
    // Students the assessment could not separate — no clear peak.
    noClearSignal: [],
    // Profiles that look like the form was clicked through.
    checkResponses: []
  };

  for(const run of profiles){
    const scores = run.scores;
    const context = run.context || {};
    const who = { uid: run.uid, runId: run.runId, stage: context.stage || "", city: context.city || "" };

    stage.add(context.stage || "not given");

    if(scores.riasec){
      const rows = ranked(scores.riasec);
      const gap = spread(scores.riasec, MAXIMA.riasec);
      const flat = gap < FLAT_SPREAD;
      const straight = gap < STRAIGHT_LINE_SPREAD;

      /*
        A straight-lined profile has a "top interest" only because
        something had to sort first. Letting it vote in the distribution
        would put a click-through in the same column as a real answer, so
        it counts as a student and as a data-quality note, and nowhere
        else.
      */
      if(!straight){
        interest.add(rows[0].key);
        holland.add(hollandCode(scores.riasec));
      }

      if(straight){
        straightLined++;
        counsellor.checkResponses.push(Object.assign({
          reason: "Every interest scored almost the same — worth checking the assessment was taken properly."
        }, who));
      }else if(flat){
        clarity.flat++;
        counsellor.noClearSignal.push(Object.assign({
          reason: "No interest stands out, so the assessment has not narrowed anything down."
        }, who));
      }else{
        clarity.clear++;
      }

      /*
        Only asked of a student whose profile actually has a peak. Telling
        a school that a student with no clear interests is "not aligned"
        with their stream would be reading a signal that isn't there.
      */
      const stream = enrolledStream(context.stage);
      if(stream && STREAM_INTERESTS[stream] && !flat){
        streamAttention.checked++;
        const topTwo = rows.slice(0, 2).map(r => r.key);
        const overlaps = topTwo.some(k => STREAM_INTERESTS[stream].indexOf(k) !== -1);
        if(!overlaps){
          streamAttention.worthATalk++;
          counsellor.worthATalk.push(Object.assign({
            reason: "Strongest interests are " +
                    topTwo.map(k => RIASEC[k].name).join(" and ") +
                    ", which is some distance from " + stream + "."
          }, who));
        }
      }
    }

    if(scores.anchors && spread(scores.anchors, MAXIMA.anchors) >= STRAIGHT_LINE_SPREAD){
      anchor.add(ranked(scores.anchors)[0].key);
    }
    if(scores.vark && spread(scores.vark, MAXIMA.vark) >= STRAIGHT_LINE_SPREAD){
      channel.add(ranked(scores.vark)[0].key);
    }

    if(scores.bigfive){
      traitCount++;
      for(const key of Object.keys(BIGFIVE)){
        if(scores.bigfive[key] == null) continue;
        traitTotals[key] = (traitTotals[key] || 0) + scores.bigfive[key];
      }
    }
  }

  const principal = {
    students: profiles.length,
    stages: stage.rows(),
    interestLeaders: interest.rows(k => RIASEC[k] ? RIASEC[k].name : k),
    hollandCodes: holland.rows().slice(0, 8),
    anchorLeaders: anchor.rows(k => ANCHORS[k] ? ANCHORS[k].name : k),
    learningChannels: channel.rows(k => VARK[k] ? VARK[k].name : k),
    traitAverages: Object.keys(BIGFIVE).map(key => ({
      key: key,
      label: BIGFIVE[key].name,
      average: average(traitTotals[key] || 0, traitCount),
      max: MAXIMA.bigfive
    })),
    profileClarity: clarity,
    streamAttention: streamAttention,
    dataQuality: { straightLined: straightLined }
  };

  return { principal, counsellor };
}

/*
  The principal's copy, with every identifier stripped.

  buildCohortStats already keeps the halves apart, but this is the
  function any principal-facing path must call — a single careless spread
  of the whole stats object into a response is exactly how a named list
  of teenagers ends up somewhere it should not be, and one obvious
  chokepoint is worth more than remembering not to.
*/
function principalView(stats){
  if(!stats || !stats.principal) return null;
  return JSON.parse(JSON.stringify(stats.principal));
}

// The counsellor's copy. Counts of each list, plus the students in them.
function counsellorView(stats){
  if(!stats || !stats.counsellor) return null;
  const c = stats.counsellor;
  return {
    worthATalk: c.worthATalk.slice(),
    noClearSignal: c.noClearSignal.slice(),
    checkResponses: c.checkResponses.slice(),
    totals: {
      worthATalk: c.worthATalk.length,
      noClearSignal: c.noClearSignal.length,
      checkResponses: c.checkResponses.length
    }
  };
}

module.exports = {
  buildCohortStats,
  principalView,
  counsellorView,
  ranked,
  spread,
  hollandCode,
  enrolledStream,
  STREAM_INTERESTS,
  FLAT_SPREAD,
  STRAIGHT_LINE_SPREAD
};
