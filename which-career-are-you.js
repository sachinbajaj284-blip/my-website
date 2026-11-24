/* ==================================================================
   Lume Live — "Which Career Are You?" quiz
   ------------------------------------------------------------------
   A fast, fun, shareable top-of-funnel quiz. It maps eight relatable
   choices to one of six career archetypes, each tied to REAL career
   guides on the site, then hands the result to LumeStory (the story-card
   share sheet) and funnels to the science-backed Career Snapshot.

   This is deliberately the light, gateway version — the result screen
   says so and points to the real psychometric snapshot. It is not a
   diagnosis; it is a conversation starter that earns a share.
   ================================================================== */
(function () {
  "use strict";

  var QUIZ_URL = "https://lumelive.co.in/which-career-are-you.html";
  var SNAPSHOT = "assessment.html#free-test";

  /* ---- the six archetypes (mapped loosely to RIASEC so the follow-on
         snapshot feels consistent, but named to be fun and flex-worthy) ---- */
  var ARCHES = {
    builder: {
      name: "The Builder", emoji: "🔧", letter: "R",
      tagline: "You make things that work in the real world.",
      blurb: "Hands-on, practical and happiest when something you made actually runs. You'd rather build the thing than talk about it.",
      careers: [
        ["Civil Engineer", "career-as-civil-engineer.html"],
        ["Architect", "career-as-architect.html"],
        ["Software Engineer", "career-as-software-engineer.html"],
        ["Commercial Pilot", "career-as-commercial-pilot.html"]
      ]
    },
    investigator: {
      name: "The Investigator", emoji: "🔬", letter: "I",
      tagline: "You can't rest until you know how it works.",
      blurb: "Curious, sharp and a bit obsessive about getting to the truth. Give you a hard problem and you'll disappear until it's solved.",
      careers: [
        ["Data Scientist", "career-as-data-scientist.html"],
        ["Doctor (MBBS)", "career-as-doctor-mbbs.html"],
        ["AI / ML Engineer", "career-as-ai-ml-engineer.html"],
        ["Cybersecurity Analyst", "career-as-cybersecurity-analyst.html"]
      ]
    },
    creator: {
      name: "The Creator", emoji: "🎨", letter: "A",
      tagline: "You see what isn't there yet — and make it.",
      blurb: "Imaginative and expressive, you think in ideas, images and stories. A blank page is a playground, not a problem.",
      careers: [
        ["Product Designer", "career-as-product-designer.html"],
        ["Fashion Designer", "career-as-fashion-designer.html"],
        ["Journalist", "career-as-journalist.html"],
        ["Architect", "career-as-architect.html"]
      ]
    },
    ally: {
      name: "The Ally", emoji: "🤝", letter: "S",
      tagline: "People grow when you're around.",
      blurb: "Warm, tuned-in and genuinely moved by helping others. The friend everyone vents to — and the one who actually helps.",
      careers: [
        ["Psychologist", "career-as-psychologist.html"],
        ["Teacher", "career-as-teacher.html"],
        ["Nurse", "career-as-nurse.html"],
        ["Physiotherapist", "career-as-physiotherapist.html"]
      ]
    },
    trailblazer: {
      name: "The Trailblazer", emoji: "🚀", letter: "E",
      tagline: "You'd rather lead the thing than join it.",
      blurb: "Ambitious, persuasive and allergic to sitting still. You see an opening, back yourself, and bring people with you.",
      careers: [
        ["Investment Banker", "career-as-investment-banker.html"],
        ["Lawyer", "career-as-lawyer.html"],
        ["Digital Marketer", "career-as-digital-marketer.html"],
        ["Civil Services (IAS)", "career-as-civil-services-ias.html"]
      ]
    },
    organizer: {
      name: "The Organizer", emoji: "📊", letter: "C",
      tagline: "Everything you touch starts running on time.",
      blurb: "Precise, reliable and quietly powerful — the person who turns chaos into a clean system. Numbers and order feel good to you.",
      careers: [
        ["Chartered Accountant", "career-as-chartered-accountant.html"],
        ["Company Secretary", "career-as-company-secretary.html"],
        ["Cost Accountant", "career-as-cost-accountant.html"],
        ["Civil Services (IAS)", "career-as-civil-services-ias.html"]
      ]
    }
  };
  var ORDER = ["builder", "investigator", "creator", "ally", "trailblazer", "organizer"];

  var QUESTIONS = [
    { q: "It’s a free Sunday. You’re most likely…", o: [
      ["Building or fixing something (IRL or in a game)", "builder"],
      ["Down a rabbit hole figuring out how something works", "investigator"],
      ["Making something — editing, drawing, writing", "creator"],
      ["Hanging out, helping a friend through something", "ally"],
      ["Planning a trip, a hustle or a side project", "trailblazer"],
      ["Sorting your setup, notes or a suspiciously neat spreadsheet", "organizer"]
    ]},
    { q: "Group project. You’re the one who…", o: [
      ["Builds the actual thing", "builder"],
      ["Does the research and gets the facts right", "investigator"],
      ["Makes it look good and presents it", "creator"],
      ["Keeps everyone together and calm", "ally"],
      ["Pitches it and takes the lead", "trailblazer"],
      ["Makes the plan and chases the deadlines", "organizer"]
    ]},
    { q: "A subject you’d actually enjoy…", o: [
      ["Physics or a hands-on workshop", "builder"],
      ["Bio, CS or a good math puzzle", "investigator"],
      ["Art, design or literature", "creator"],
      ["Psychology or sociology", "ally"],
      ["Business, economics or debate", "trailblazer"],
      ["Accounts or statistics", "organizer"]
    ]},
    { q: "Friends come to you when they need…", o: [
      ["Something fixed", "builder"],
      ["An answer or an explanation", "investigator"],
      ["Ideas or an aesthetic", "creator"],
      ["To vent, or real advice", "ally"],
      ["A push and a plan to win", "trailblazer"],
      ["To finally get organised", "organizer"]
    ]},
    { q: "What would make a job feel worth it?", o: [
      ["Seeing something real that you built", "builder"],
      ["Cracking problems nobody else could", "investigator"],
      ["Creating something original and yours", "creator"],
      ["Actually changing someone’s life", "ally"],
      ["Growth, influence and the upside", "trailblazer"],
      ["Mastery, order and things done right", "organizer"]
    ]},
    { q: "Your most-used type of app?", o: [
      ["Sandbox / build / sim games", "builder"],
      ["Explainers, Wikipedia, Reddit threads", "investigator"],
      ["Instagram, Pinterest, editing apps", "creator"],
      ["Messaging and socials — it’s about people", "ally"],
      ["LinkedIn, markets, business reels", "trailblazer"],
      ["Notion, calendar, to-do lists", "organizer"]
    ]},
    { q: "Your dream flex in 10 years?", o: [
      ["“I built that.” (a bridge, an app, a plane)", "builder"],
      ["“I figured out how X actually works.”", "investigator"],
      ["“That’s my design / film / brand.”", "creator"],
      ["“I genuinely changed lives.”", "ally"],
      ["“I run the whole company.”", "trailblazer"],
      ["“Everything I touch just runs perfectly.”", "organizer"]
    ]},
    { q: "Pick a vibe:", o: [
      ["🔧 Hands-on", "builder"],
      ["🔬 Curious", "investigator"],
      ["🎨 Creative", "creator"],
      ["🤝 Caring", "ally"],
      ["🚀 Ambitious", "trailblazer"],
      ["📊 Precise", "organizer"]
    ]}
  ];

  /* ---- tiny DOM helpers ---- */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function track(name, label) { try { if (window.gtag) gtag("event", name, { event_category: "which_career_quiz", event_label: label || "" }); } catch (e) {} }

  var root, state;

  function start() {
    state = { i: 0, counts: {}, answers: [] };
    ORDER.forEach(function (k) { state.counts[k] = 0; });
    track("wcay_start");
    renderQuestion();
  }

  function renderQuestion() {
    var total = QUESTIONS.length, n = state.i, qd = QUESTIONS[n];
    root.innerHTML = "";
    var card = el("div", "wcay-card");

    var pct = Math.round((n) / total * 100);
    var pbWrap = el("div", "wcay-progress");
    var pb = el("div", "wcay-bar");
    pb.setAttribute("role", "progressbar");
    pb.setAttribute("aria-valuemin", "0"); pb.setAttribute("aria-valuemax", String(total));
    pb.setAttribute("aria-valuenow", String(n));
    pb.setAttribute("aria-label", "Question " + (n + 1) + " of " + total);
    var fill = el("div", "wcay-bar-fill"); fill.style.width = pct + "%";
    pb.appendChild(fill); pbWrap.appendChild(pb);
    pbWrap.appendChild(el("div", "wcay-step", "Question " + (n + 1) + " / " + total));
    card.appendChild(pbWrap);

    card.appendChild(el("h2", "wcay-q", qd.q));

    var opts = el("div", "wcay-opts");
    qd.o.forEach(function (opt) {
      var b = el("button", "wcay-opt"); b.type = "button"; b.innerHTML = opt[0];
      b.addEventListener("click", function () {
        state.counts[opt[1]] += 1;
        state.answers.push(opt[1]);
        state.i += 1;
        if (state.i >= total) renderResult(); else renderQuestion();
        try { card.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
      });
      opts.appendChild(b);
    });
    card.appendChild(opts);

    if (n > 0) {
      var back = el("button", "wcay-back", "← Back"); back.type = "button";
      back.addEventListener("click", function () {
        state.i -= 1; var last = state.answers.pop(); if (last) state.counts[last] -= 1; renderQuestion();
      });
      card.appendChild(back);
    }
    root.appendChild(card);
  }

  function ranked() {
    var total = 0; ORDER.forEach(function (k) { total += state.counts[k]; });
    total = total || 1;
    return ORDER.map(function (k) { return { key: k, pct: Math.round(state.counts[k] / total * 100) }; })
      .sort(function (a, b) { return b.pct - a.pct; });
  }

  function renderResult() {
    var r = ranked(), topKey = r[0].key, a = ARCHES[topKey], pct = r[0].pct;
    track("wcay_complete", a.name);

    root.innerHTML = "";
    var card = el("div", "wcay-card wcay-result");

    card.appendChild(el("div", "wcay-result-eyebrow", "Your career archetype"));
    var head = el("div", "wcay-result-head");
    head.appendChild(el("div", "wcay-emoji", a.emoji));
    var ht = el("div");
    ht.appendChild(el("div", "wcay-title", a.name));
    ht.appendChild(el("div", "wcay-tagline", a.tagline));
    head.appendChild(ht);
    card.appendChild(head);

    card.appendChild(el("div", "wcay-match", pct + "% <span>" + a.name.replace("The ", "") + "</span>"));
    card.appendChild(el("p", "wcay-blurb", a.blurb));

    // mix bars (top 3)
    var bars = el("div", "wcay-bars");
    r.slice(0, 3).forEach(function (row) {
      var b = el("div", "wcay-mixrow");
      b.appendChild(el("span", "wcay-mixlabel", ARCHES[row.key].emoji + " " + ARCHES[row.key].name.replace("The ", "")));
      var track2 = el("div", "wcay-mixtrack"); var f = el("div", "wcay-mixfill"); f.style.width = Math.max(row.pct, 4) + "%"; track2.appendChild(f);
      b.appendChild(track2);
      b.appendChild(el("span", "wcay-mixpct", row.pct + "%"));
      bars.appendChild(b);
    });
    card.appendChild(bars);

    // career matches (real guides)
    card.appendChild(el("div", "wcay-careers-h", "Careers that fit " + a.name))
    var chips = el("div", "wcay-careers");
    a.careers.forEach(function (c) {
      var link = el("a", "wcay-career"); link.href = c[1]; link.innerHTML = c[0] + " →";
      link.addEventListener("click", function () { track("wcay_career_click", c[0]); });
      chips.appendChild(link);
    });
    card.appendChild(chips);

    // share (the viral loop)
    var share = el("div", "wcay-share");
    var sBtn = el("button", "wcay-share-btn", "📸 Post my result — watch the replies");
    sBtn.type = "button";
    sBtn.addEventListener("click", function () { openStory(r, a, pct); });
    share.appendChild(sBtn);
    card.appendChild(share);

    // the honest funnel line + CTAs
    card.appendChild(el("p", "wcay-fine", "This is the fun version. Your real, science-backed result takes 60 seconds 👇"));
    var cta = el("div", "wcay-cta");
    var c1 = el("a", "wcay-cta-btn primary", "Take the free Career Snapshot"); c1.href = SNAPSHOT;
    c1.addEventListener("click", function () { track("wcay_to_snapshot", a.name); });
    var c2 = el("a", "wcay-cta-btn", "Talk to a counsellor — ₹499"); c2.href = "book-session.html";
    cta.appendChild(c1); cta.appendChild(c2);
    card.appendChild(cta);

    var retake = el("button", "wcay-back", "↺ Retake the quiz"); retake.type = "button";
    retake.addEventListener("click", start);
    card.appendChild(retake);

    root.appendChild(card);

    // make the share unmissable: a one-time pulse once the result settles
    try {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(function () {
        sBtn.classList.add("wcay-pulse");
        setTimeout(function () { sBtn.classList.remove("wcay-pulse"); }, 3600);
      }, 700);
    } catch (e) {}
  }

  function openStory(r, a, pct) {
    track("wcay_share_open", a.name);
    if (!window.LumeStory) { // graceful fallback: native share or copy
      var txt = "I'm " + a.name + " " + a.emoji + " on Lume Live's Which Career Are You quiz. What are you? " + QUIZ_URL;
      if (navigator.share) { navigator.share({ title: "Which Career Are You?", text: txt, url: QUIZ_URL }).catch(function () {}); }
      else { try { navigator.clipboard.writeText(txt); } catch (e) {} }
      return;
    }
    window.LumeStory.open({
      quiz: "archetype",
      statsKey: a.letter,
      eyebrow: "Which Career Are You?",
      title: a.name,
      subtitle: a.tagline,
      matchPct: pct,
      matchLabel: a.name.replace("The ", ""),
      emoji: a.emoji,
      options: ORDER.map(function (k) { return ARCHES[k].name.replace("The ", ""); }),
      versus: r.slice(0, 2).map(function (row) { return { label: ARCHES[row.key].name.replace("The ", ""), pct: row.pct }; }),
      bars: r.slice(0, 3).map(function (row) { return { label: ARCHES[row.key].name.replace("The ", ""), pct: row.pct }; }),
      chips: a.careers.slice(0, 3).map(function (c) { return c[0]; }),
      kicker: "I just found my career type",
      fomo: "Runner-up: " + ARCHES[r[1].key].name.replace("The ", "") + ". Think you can guess yours?",
      cta: "Which one are you? 👇",
      url: QUIZ_URL
    });
  }

  function init() {
    root = document.getElementById("wcayApp");
    if (!root) return;
    var startBtn = document.getElementById("wcayStart");
    if (startBtn) startBtn.addEventListener("click", function () {
      document.getElementById("wcayIntro").style.display = "none";
      root.style.display = "block";
      start();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
