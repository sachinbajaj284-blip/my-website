/* ──────────────────────────────────────────────────────────────────────────
   Lume Live — Mental Health Awareness Calendar: data
   ----------------------------------------------------------------------------
   This file is the SINGLE source of truth for both:
     • the auto-updating awareness band on the homepage (index.html), and
     • the full calendar page (mental-health-calendar.html).
   The renderer lives in lume-mh-calendar.js — you do not need to touch it to
   change content. Just edit the `entries` array below.

   HOW TO EDIT
   -----------
   Each entry is one observance that repeats every year. Fields:

     id        unique slug (lowercase, hyphens). Used internally only.
     title     the event name shown to visitors.
     start     "MM-DD" — the first day it is relevant (month-day, no year).
     end       "MM-DD" — the last day. For a single day, set end === start.
     category  one of: "Exam stress" | "Anxiety" | "Self-care" |
               "Crisis" | "Awareness"  (drives the little colour chip).
     lines     2–4 plain-language sentences of psychoeducation. No HTML.
     link      a page on this site to send people to (e.g. "exam-stress-test.html").
     linkText  the button label for that link.
     hindi     (optional) one short supportive line in Hindi. Leave "" to omit.

   NOTES
   -----
   • Dates have no year — the calendar simply repeats annually.
   • A single-day event that lands on "today" is badged "Today".
     A multi-day range that includes today shows as "Happening now".
     When nothing is active today, the band shows the NEXT one with a countdown.
   • Keep ranges from overlapping where you can; if two ranges are active on the
     same day, the shorter one wins (it is the more specific).
   • The crisis helpline below is reused verbatim — it is the Government of
     India's free, 24×7 line. Do not replace it with a number from memory.
   ────────────────────────────────────────────────────────────────────────── */
window.LUME_MH_CALENDAR = {
  helpline: 'Tele-MANAS 14416',
  helplineNote: "In a crisis, call Tele-MANAS 14416 — free, 24×7, Government of India.",
  entries: [
    {
      id: 'new-year-realistic-goals',
      title: 'New Year, Kinder Goals',
      start: '01-01', end: '01-20',
      category: 'Self-care',
      lines: "A fresh year brings pressure to “fix everything at once.” Big, vague resolutions tend to collapse by February and leave you feeling worse. One small, specific habit you can keep beats ten you cannot. Progress, not perfection, is what actually protects your mood.",
      link: 'wellbeing-check.html',
      linkText: 'Take a 2-minute wellbeing check',
      hindi: 'छोटी शुरुआत भी असली शुरुआत है — खुद पर थोड़ा नरम रहें।'
    },
    {
      id: 'board-exam-season',
      title: 'Board Exam Season',
      start: '02-01', end: '04-10',
      category: 'Exam stress',
      lines: "As boards approach, racing thoughts, poor sleep and irritability are common — this is a normal stress response, not a sign of weakness. Fixed sleep, short breaks and talking to someone protect focus far more than extra late-night hours. You are not your marks.",
      link: 'board-exam-stress-guide.html',
      linkText: 'Read the board exam stress guide',
      hindi: 'थोड़ी घबराहट सामान्य है — आप अकेले नहीं हैं।'
    },
    {
      id: 'zero-discrimination-day',
      title: 'Zero Discrimination Day',
      start: '03-01', end: '03-01',
      category: 'Awareness',
      lines: "Everyone deserves support without judgement — whatever their background, identity or struggle. Feeling judged keeps many people out of a counselling room for years. A good first conversation is confidential and never about blame.",
      link: 'mental-health-counselling.html',
      linkText: 'See how counselling works',
      hindi: ''
    },
    {
      id: 'world-health-day',
      title: 'World Health Day',
      start: '04-07', end: '04-07',
      category: 'Awareness',
      lines: "Health is not only physical — how you sleep, eat, move and feel are all connected. Checking in on your mind deserves the same attention as a fever or a cough. A two-minute self-check is a calm place to start.",
      link: 'wellbeing-check.html',
      linkText: 'Check in on yourself',
      hindi: ''
    },
    {
      id: 'mental-health-awareness-week',
      title: 'Mental Health Awareness Week',
      start: '05-08', end: '05-14',
      category: 'Awareness',
      lines: "You don’t need a “diagnosis” to seek support. If you feel overwhelmed, stuck, or just need someone to listen, that is reason enough. Talking early is a strength, not a last resort.",
      link: 'mental-health-counselling.html',
      linkText: 'Talk to a counsellor',
      hindi: 'मदद माँगना कमज़ोरी नहीं, समझदारी है।'
    },
    {
      id: 'board-results-season',
      title: 'Board Results Season',
      start: '05-15', end: '06-20',
      category: 'Exam stress',
      lines: "Results day can bring relief, disappointment or panic — sometimes all three. A single number does not decide your worth or close your options. Before any big decision about streams or re-takes, take a breath and talk it through with someone calm.",
      link: 'what-to-do-after-board-results.html',
      linkText: 'What to do after board results',
      hindi: 'एक नंबर आपका भविष्य तय नहीं करता।'
    },
    {
      id: 'self-care-day',
      title: 'International Self-Care Day',
      start: '07-24', end: '07-24',
      category: 'Self-care',
      lines: "Self-care isn’t a reward you earn after everything else is done — it is basic maintenance. Sleep, water, movement, and ten quiet minutes a day are not luxuries. Protecting them is how you keep showing up for everything else.",
      link: 'wellbeing-check.html',
      linkText: 'Take a wellbeing check',
      hindi: ''
    },
    {
      id: 'new-college-session',
      title: 'New College Session',
      start: '08-01', end: '08-20',
      category: 'Self-care',
      lines: "Starting college can feel exciting and anxious at once — a new city, new people, living away from home and a workload nobody warned you about. Give yourself a few weeks to settle; everyone around you is finding their feet too, even when they hide it well. If the homesickness or nerves stay heavy, it’s okay to ask for support.",
      link: 'mental-health-counselling.html',
      linkText: 'Find support',
      hindi: ''
    },
    {
      id: 'suicide-prevention-day',
      title: 'World Suicide Prevention Day',
      start: '09-10', end: '09-10',
      category: 'Crisis',
      lines: "If life feels unbearable, you are not alone and this can get better with help. Thoughts of self-harm are an emergency, not a weakness — reaching out is the bravest, strongest thing you can do. Please tell someone today; a crisis cannot wait.",
      link: 'student-mental-health-india.html',
      linkText: 'Read: student mental health in India',
      hindi: 'अगर मन में खुद को नुकसान पहुँचाने के विचार आ रहे हैं — Tele-MANAS 14416 पर अभी कॉल करें।'
    },
    {
      id: 'world-mental-health-day',
      title: 'World Mental Health Day',
      start: '10-10', end: '10-10',
      category: 'Awareness',
      lines: "One day each year the whole world talks openly about mental health — and every other day matters just as much. Checking in on a friend, or on yourself, costs nothing and changes a lot. Ask how someone really is, and stay for the answer.",
      link: 'mental-health-counselling.html',
      linkText: 'Talk to a counsellor',
      hindi: 'आज किसी से पूछिए — “सच में कैसे हो?”'
    },
    {
      id: 'stress-awareness',
      title: 'Stress & Burnout Awareness Week',
      start: '11-01', end: '11-07',
      category: 'Awareness',
      lines: "Constant exhaustion, cynicism and feeling you can never catch up are signs of burnout, not of laziness. It builds quietly over weeks, so it is easy to miss until you crash. Naming it early makes it much easier to recover.",
      link: 'work-stress-burnout-test.html',
      linkText: 'Take the burnout check',
      hindi: ''
    },
    {
      id: 'year-end-exam-calm',
      title: 'Exam-Prep Calm',
      start: '12-01', end: '12-31',
      category: 'Exam stress',
      lines: "As the year ends and exams loom, the goal is steady effort, not panic. Study in short focused blocks, sleep properly, and remember that fear makes revision feel harder than it is. One difficult exam is never worth more than you are.",
      link: 'how-to-deal-with-exam-anxiety.html',
      linkText: 'How to deal with exam anxiety',
      hindi: 'घबराहट में पढ़ाई मुश्किल लगती है — थोड़ा रुककर, गहरी साँस लें।'
    }
  ]
};
