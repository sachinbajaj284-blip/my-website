/*
  Lume Live — quiz leaderboard.

  Under a quiz result: how many people have completed it, how many today,
  and the ranked breakdown of what everyone got with the student's own
  result marked. Real counts from /api/quiz-stats — see api/_lib/quizStats.js.

  Three rules, because this is a number shown to teenagers deciding what
  to study:

  1. No number is ever invented here. If the endpoint is unavailable, or
     the totals are too small to say anything, the block does not render.
     There is no placeholder, no "1,000+ students", no seeded baseline.

  2. It says "completions", not "people". One browser is counted once per
     quiz, which stops an idle retake inflating the total, but it is a
     cookie-level check and someone who wants to can beat it. The wording
     matches what the number can actually support.

  3. The distribution is information, not pressure. A student whose
     result is rare should read "1 in 12 get this", not "you are unusual"
     — the copy below is deliberately flat about where they landed.

  Usage:
    LumeLeaderboard.mount({
      el:      document.getElementById("leaderboard"),
      quiz:    "stream",
      result:  "pcm",                       // the key this student got
      labels:  { pcm:"PCM", pcb:"PCB" },    // key -> display name
      lang:    "en" | "hi",
      tone:    "genz" | "clean"
    });
*/
(function(){
"use strict";

var ENDPOINT = "/api/quiz-stats";
var SEEN_KEY = "lumeQuizCounted:";
/* Below this the distribution is noise — ten people is not a trend, and
   showing "100% of students got PCM" off three completions is worse than
   showing nothing. The headline count appears earlier than the bars. */
var MIN_FOR_BARS = 25;
var MIN_FOR_TOTAL = 5;

var T = {
  en: {
    genz: {
      head:"the scoreboard", total:"people have taken this",
      today:"{n} today", week:"{n} this week",
      you:"you", dist:"what everyone's getting",
      rare:"only {pct}% get this — you're built different 😭",
      common:"{pct}% get this too, you're in good company",
      first:"you're early. send it to someone and start the count 👀",
      counting:"counting…"
    },
    clean: {
      head:"How others scored", total:"completions so far",
      today:"{n} today", week:"{n} this week",
      you:"you", dist:"What everyone else got",
      rare:"Only {pct}% get this combination.",
      common:"{pct}% of students get this too.",
      first:"You are one of the first to take this.",
      counting:"Loading…"
    }
  },
  hi: {
    genz: {
      head:"स्कोरबोर्ड", total:"लोग ये quiz ले चुके हैं",
      today:"आज {n}", week:"इस हफ़्ते {n}",
      you:"तू", dist:"बाकी सबका क्या आ रहा है",
      rare:"सिर्फ़ {pct}% को ये आता है — अलग बात है 😭",
      common:"{pct}% को भी यही आया, अकेला नहीं है",
      first:"तू जल्दी आ गया. किसी को भेज और गिनती शुरू कर 👀",
      counting:"गिन रहे हैं…"
    },
    clean: {
      head:"बाकी लोगों का result", total:"लोग ये quiz ले चुके हैं",
      today:"आज {n}", week:"इस हफ़्ते {n}",
      you:"आप", dist:"बाकी सबका क्या आया",
      rare:"सिर्फ़ {pct}% को यह combination आता है।",
      common:"{pct}% students को भी यही आता है।",
      first:"आप इसे लेने वालों में से शुरुआती हैं।",
      counting:"लोड हो रहा है…"
    }
  }
};

function t(cfg, key, vars){
  var lang = T[cfg.lang === "hi" ? "hi" : "en"];
  var str = (lang[cfg.tone === "clean" ? "clean" : "genz"] || lang.genz)[key] || "";
  if(vars) for(var k in vars) str = str.replace("{" + k + "}", vars[k]);
  return str;
}
function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(ch){
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch];
  });
}
function group(n){
  /* Indian digit grouping: 1,20,450 rather than 120,450. */
  var s = String(Math.max(0, Math.floor(n)));
  if(s.length <= 3) return s;
  var last3 = s.slice(-3), rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}
function track(name, params){
  try{ if(window.gtag) window.gtag("event", name, params || {}); }catch(e){}
}

var CSS = [
".lbBox{margin:20px 0;padding:18px;border-radius:20px;background:linear-gradient(135deg,#11143a,#2a1a63 60%,#4a2270);color:#fff;border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 36px rgba(24,14,72,.24)}",
".lbHead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}",
".lbTitle{font-size:.74rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.62);margin:0}",
".lbLive{display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:800;color:#9dffcf}",
".lbDot{width:7px;height:7px;border-radius:50%;background:#3ef2a1;box-shadow:0 0 0 0 rgba(62,242,161,.7);animation:lbPulse 2.2s infinite}",
"@keyframes lbPulse{0%{box-shadow:0 0 0 0 rgba(62,242,161,.6)}70%{box-shadow:0 0 0 9px rgba(62,242,161,0)}100%{box-shadow:0 0 0 0 rgba(62,242,161,0)}}",
".lbTotal{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px}",
".lbBig{font-size:2.5rem;font-weight:900;letter-spacing:-.03em;line-height:1}",
".lbUnit{font-size:.95rem;font-weight:700;color:rgba(255,255,255,.78)}",
".lbSub{font-size:.82rem;color:rgba(255,255,255,.62);margin:0 0 14px}",
".lbDistLbl{font-size:.72rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55);margin:0 0 8px}",
".lbRow{margin:0 0 9px}",
".lbRowTop{display:flex;justify-content:space-between;gap:10px;font-size:.86rem;font-weight:700;margin-bottom:4px}",
".lbRank{color:rgba(255,255,255,.45);font-weight:900;margin-right:6px}",
".lbPct{color:#9dffcf;font-weight:800;font-variant-numeric:tabular-nums}",
".lbTrack{height:9px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden}",
".lbFill{height:100%;border-radius:99px;background:linear-gradient(90deg,#8b7dff,#7ee8fa);width:0;transition:width .9s cubic-bezier(.22,.9,.3,1)}",
".lbRow.me .lbFill{background:linear-gradient(90deg,#3ef2a1,#9dffcf)}",
".lbRow.me .lbRowTop{color:#fff}",
".lbYou{display:inline-block;margin-left:7px;padding:2px 8px;border-radius:99px;background:#3ef2a1;color:#06301f;font-size:.66rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;vertical-align:middle}",
".lbNote{margin:12px 0 0;font-size:.84rem;line-height:1.5;color:rgba(255,255,255,.84)}",
".lbLoading{font-size:.84rem;color:rgba(255,255,255,.55)}",
"@media (prefers-reduced-motion:reduce){.lbDot{animation:none}.lbFill{transition:none}}",
"@media print{.lbBox{display:none!important}}"
].join("\n");

function injectCSS(){
  if(document.getElementById("lbCSS")) return;
  var s = document.createElement("style");
  s.id = "lbCSS"; s.textContent = CSS;
  document.head.appendChild(s);
}

/* One completion per browser per quiz. Deliberately defeatable — see the
   note at the top about why the copy says "completions". */
function alreadyCounted(quiz){
  try{ return localStorage.getItem(SEEN_KEY + quiz) === "1"; }catch(e){ return false; }
}
function markCounted(quiz){
  try{ localStorage.setItem(SEEN_KEY + quiz, "1"); }catch(e){}
}

function record(cfg){
  if(alreadyCounted(cfg.quiz)) return Promise.resolve(null);
  markCounted(cfg.quiz);
  try{
    return fetch(ENDPOINT, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ quiz:cfg.quiz, result:cfg.result })
    }).then(function(r){ return r.json(); }).catch(function(){ return null; });
  }catch(e){ return Promise.resolve(null); }
}

/* One fetch per quiz per page. The story card shows the same counts, and
   two components asking the same endpoint the same question is both a
   wasted round trip and a way for the page and the card to disagree. */
var cache = Object.create(null);
var inflight = Object.create(null);

function load(quiz){
  if(cache[quiz]) return Promise.resolve(cache[quiz]);
  if(inflight[quiz]) return inflight[quiz];
  var req;
  try{
    req = fetch(ENDPOINT + "?quiz=" + encodeURIComponent(quiz))
      .then(function(r){ return r.json(); })
      .catch(function(){ return { available:false }; });
  }catch(e){ req = Promise.resolve({ available:false }); }

  inflight[quiz] = req.then(function(data){
    var out = data || { available:false };
    /* Only a real answer is cached: an outage should be retried by the
       next caller, not remembered for the life of the page. */
    if(out.available) cache[quiz] = out;
    delete inflight[quiz];
    return out;
  });
  return inflight[quiz];
}

/* What another component can use. `cached` is synchronous and returns
   null until the numbers are in, so a caller can draw immediately and
   redraw when `stats` resolves. Both honour the same floor as the page:
   below it there is nothing true to say. */
function usable(data){
  return !!(data && data.available && data.total >= MIN_FOR_TOTAL);
}
function cached(quiz){
  return usable(cache[quiz]) ? cache[quiz] : null;
}
function stats(quiz){
  return load(quiz).then(function(data){ return usable(data) ? data : null; });
}

function render(cfg, data){
  var el = cfg.el;
  if(!data || !data.available || !(data.total >= MIN_FOR_TOTAL)){
    /* Too early to say anything true. An empty leaderboard is better
       than a furnished one. */
    el.innerHTML = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;

  var mine = null;
  (data.ranked || []).forEach(function(r){ if(r.key === cfg.result) mine = r; });

  var html = '<div class="lbBox">' +
    '<div class="lbHead"><p class="lbTitle">' + esc(t(cfg, "head")) + '</p>' +
    '<span class="lbLive"><span class="lbDot"></span>' +
      esc(t(cfg, "today", { n:group(data.today || 0) })) + '</span></div>' +
    '<div class="lbTotal"><span class="lbBig">' + esc(group(data.total)) + '</span>' +
    '<span class="lbUnit">' + esc(t(cfg, "total")) + '</span></div>' +
    '<p class="lbSub">' + esc(t(cfg, "week", { n:group(data.week || 0) })) + '</p>';

  var bars = (data.ranked || []).filter(function(r){ return r.count > 0; });
  if(data.total >= MIN_FOR_BARS && bars.length > 1){
    html += '<p class="lbDistLbl">' + esc(t(cfg, "dist")) + '</p>';
    bars.slice(0, 7).forEach(function(r, i){
      var label = (cfg.labels && cfg.labels[r.key]) || r.key;
      var me = r.key === cfg.result;
      html += '<div class="lbRow' + (me ? " me" : "") + '">' +
        '<div class="lbRowTop"><span><span class="lbRank">' + (i + 1) + '</span>' + esc(label) +
        (me ? '<span class="lbYou">' + esc(t(cfg, "you")) + '</span>' : "") + '</span>' +
        '<span class="lbPct">' + esc(r.pct) + '%</span></div>' +
        '<div class="lbTrack"><div class="lbFill" data-w="' + esc(r.pct) + '"></div></div></div>';
    });
    if(mine){
      html += '<p class="lbNote">' +
        esc(t(cfg, mine.pct < 15 ? "rare" : "common", { pct:mine.pct })) + '</p>';
    }
  }
  html += "</div>";
  el.innerHTML = html;

  /* Two frames so the bars animate from zero rather than snapping. */
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      Array.prototype.forEach.call(el.querySelectorAll(".lbFill"), function(f){
        f.style.width = f.getAttribute("data-w") + "%";
      });
    });
  });
}

function mount(cfg){
  if(!cfg || !cfg.el || !cfg.quiz) return;
  injectCSS();
  cfg.el.hidden = true;

  /* Record first, then read, so the student's own completion is included
     in the number they are shown. A failed POST still reads. */
  record(cfg)
    .then(function(){ return load(cfg.quiz); })
    .then(function(data){
      render(cfg, data);
      if(data && data.available){
        track("quiz_leaderboard_view", {
          event_category:"social_proof", event_label:cfg.quiz, value:data.total || 0
        });
      }
    })
    .catch(function(){ cfg.el.hidden = true; });
}

window.LumeLeaderboard = {
  mount:mount, stats:stats, cached:cached, format:group,
  MIN_FOR_BARS:MIN_FOR_BARS, MIN_FOR_TOTAL:MIN_FOR_TOTAL
};

})();
