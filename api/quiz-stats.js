/*
  Lume Live — quiz completion counters.

  GET  /api/quiz-stats?quiz=stream   -> { available, total, today, week, ranked[] }
  POST /api/quiz-stats               -> { quiz, result }  records one completion

  Feeds the leaderboard under a quiz result: how many people have taken
  it, and what everyone else got.

  Both directions fail SOFT but HONESTLY, which are different things: if
  Firestore is unconfigured or erroring, GET answers 200 with
  `available:false` and the page renders nothing rather than a guess, and
  POST answers 200 with `recorded:false` so a counter outage can never
  stop a student seeing their result. What neither path does is invent a
  number to fill the space.

  POST is public by necessity — it is called the moment a quiz finishes,
  before anyone identifies themselves — so it is rate limited per IP and
  accepts only a known quiz with a known result key (see _lib/quizStats).
  Nothing identifying is stored.
*/

const { json, setCors, readBody } = require("./_lib/http");
const { checkRateLimit, clientKey } = require("./_lib/rateLimit");

// Browsers cache the count briefly so a burst of result views does not
// become a burst of reads; s-maxage lets the CDN carry most of them.
const CACHE = "public, max-age=30, s-maxage=120, stale-while-revalidate=600";

function stats(){
  // Required lazily: on a deploy without Firebase credentials this throws,
  // and that has to become `available:false`, not a 500 on the page.
  return require("./_lib/quizStats");
}

module.exports = async function handler(req, res){
  setCors(req, res, "GET,POST,OPTIONS");
  if(req.method === "OPTIONS"){ res.statusCode = 204; return res.end(); }

  if(req.method === "GET"){
    const quiz = String((req.query && req.query.quiz) ||
      (req.url.split("?")[1] || "").split("&")
        .map(p => p.split("="))
        .filter(p => p[0] === "quiz")
        .map(p => decodeURIComponent(p[1] || ""))[0] || "");
    try{
      const out = await stats().readStats(quiz);
      if(out.available) res.setHeader("Cache-Control", CACHE);
      return json(res, 200, out);
    }catch(err){
      return json(res, 200, { available:false, reason:"unavailable" });
    }
  }

  if(req.method !== "POST"){
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return json(res, 405, { error:"Method not allowed." });
  }

  let body;
  try{ body = await readBody(req); }
  catch(err){ return json(res, 200, { recorded:false, reason:"bad-body" }); }

  const quiz = String((body && body.quiz) || "");
  const result = String((body && body.result) || "");

  try{
    const api = stats();
    if(!api.isQuiz(quiz)) return json(res, 200, { recorded:false, reason:"unknown-quiz" });

    const allowed = await checkRateLimit({
      key: "quiz-stats:" + clientKey(req),
      limit: 20,
      windowMs: 60 * 60 * 1000
    });
    if(!allowed) return json(res, 200, { recorded:false, reason:"rate-limited" });

    const done = await api.recordTake({ quiz, result });
    return json(res, 200, { recorded: !!done.ok, total: done.total || null });
  }catch(err){
    return json(res, 200, { recorded:false, reason:"unavailable" });
  }
};
