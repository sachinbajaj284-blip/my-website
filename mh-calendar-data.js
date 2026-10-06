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
      id: 'day-of-education',
      title: 'International Day of Education',
      start: '01-24', end: '01-24',
      category: 'Awareness',
      lines: "Learning is meant to open doors, not crush the person walking through them. Marks measure one kind of performance on one day — never your worth, your intelligence or your future. A rested, supported student learns more than one running on fear.",
      link: 'student-mental-health-india.html',
      linkText: 'Read: student mental health in India',
      hindi: 'नंबर आपकी काबिलियत नहीं, सिर्फ एक दिन का हिसाब हैं।'
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
      id: 'day-of-happiness',
      title: 'International Day of Happiness',
      start: '03-20', end: '03-20',
      category: 'Self-care',
      lines: "Happiness isn’t a prize for finishing everything — it grows from small, ordinary moments: a walk, a real conversation, enough sleep. Chasing it by achievement alone tends to push it further away. Notice one good thing today, however small.",
      link: 'wellbeing-check.html',
      linkText: 'Take a wellbeing check',
      hindi: 'खुशी बड़ी मंज़िल में नहीं, छोटे पलों में छिपी होती है।'
    },
    {
      id: 'world-bipolar-day',
      title: 'World Bipolar Day',
      start: '03-30', end: '03-30',
      category: 'Awareness',
      lines: "Bipolar disorder is a real, treatable health condition — not a mood, a choice or a character flaw. With the right support, people living with it lead full, steady lives. Understanding it is the first step to replacing stigma with care.",
      link: 'mental-health-counselling.html',
      linkText: 'Talk to a counsellor',
      hindi: 'सही मदद से ज़िंदगी फिर से संतुलित हो सकती है।'
    },
    {
      id: 'autism-awareness-day',
      title: 'World Autism Awareness Day',
      start: '04-02', end: '04-02',
      category: 'Awareness',
      lines: "Autistic people experience the world differently, not wrongly. Acceptance means making room for different ways of communicating, focusing and feeling — at home, in school and at work. Understanding helps far more than trying to ‘fix’ anyone.",
      link: 'mental-health-counselling.html',
      linkText: 'See how counselling works',
      hindi: 'हर दिमाग़ अलग है — और यह बिल्कुल ठीक है।'
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
      id: 'day-of-yoga',
      title: 'International Day of Yoga',
      start: '06-21', end: '06-21',
      category: 'Self-care',
      lines: "Breath and movement are two of the simplest tools for a restless mind. A few minutes of slow breathing or gentle stretching can lower stress in the moment — no app or equipment needed. Calm is a skill you can practise, not a mood you wait for.",
      link: 'wellbeing-check.html',
      linkText: 'Take a wellbeing check',
      hindi: 'कुछ गहरी साँसें भी मन को थोड़ा हल्का कर देती हैं।'
    },
    {
      id: 'ptsd-awareness-day',
      title: 'PTSD Awareness Day',
      start: '06-27', end: '06-27',
      category: 'Awareness',
      lines: "After a frightening or painful event, the mind can stay on high alert — flashbacks, poor sleep, feeling constantly on edge. This is a normal response to trauma, and it is treatable. You don’t have to carry it alone or ‘just get over it’.",
      link: 'mental-health-counselling.html',
      linkText: 'Talk to a counsellor',
      hindi: 'मुश्किल अनुभव के बाद डर महसूस होना सामान्य है — मदद मौजूद है।'
    },
    {
      id: 'youth-skills-day',
      title: 'World Youth Skills Day',
      start: '07-15', end: '07-15',
      category: 'Awareness',
      lines: "Not knowing your path yet is normal — skills and direction are built over time, not found overnight. Comparison with others your age is the fastest way to feel behind. Focus on your next small step, and ask for guidance when the future feels foggy.",
      link: 'mental-health-counselling.html',
      linkText: 'Find support',
      hindi: 'रास्ता अभी साफ़ न हो तो भी ठीक है — एक कदम काफ़ी है।'
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
      id: 'youth-day',
      title: 'International Youth Day',
      start: '08-12', end: '08-12',
      category: 'Awareness',
      lines: "Young people carry real pressure — studies, expectations, an uncertain future — and often feel they must hide it. Your feelings are valid, and asking for help is a sign of strength, not failure. A good first conversation stays confidential.",
      link: 'student-mental-health-india.html',
      linkText: 'Read: student mental health in India',
      hindi: 'आपकी भावनाएँ सही हैं — मदद माँगना हिम्मत की बात है।'
    },
    {
      id: 'teachers-day-india',
      title: "Teachers' Day (India)",
      start: '09-05', end: '09-05',
      category: 'Awareness',
      lines: "A teacher who notices a quiet, struggling student can change everything. Supporting young minds means caring for how they feel, not only how they score. If a student seems withdrawn, a kind question can be the start of real help.",
      link: 'student-mental-health-india.html',
      linkText: 'How to support a struggling student',
      hindi: 'एक शिक्षक का साथ किसी बच्चे की पूरी राह बदल सकता है।'
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
      id: 'world-gratitude-day',
      title: 'World Gratitude Day',
      start: '09-21', end: '09-21',
      category: 'Self-care',
      lines: "Gratitude isn’t about pretending everything is fine — it’s about noticing what is, even on a hard day. Naming one thing you’re thankful for gently shifts attention away from worry. It’s a small habit with a real effect on mood.",
      link: 'wellbeing-check.html',
      linkText: 'Take a wellbeing check',
      hindi: 'मुश्किल दिन में भी एक अच्छी बात ढूँढना मन को सहारा देता है।'
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
      id: 'day-of-the-girl',
      title: 'International Day of the Girl Child',
      start: '10-11', end: '10-11',
      category: 'Awareness',
      lines: "Every girl deserves to feel safe, heard and free to dream — at home, in school and online. Pressure, comparison and unfair expectations take a quiet toll on mental health. Listening without judgement is one of the kindest things we can offer.",
      link: 'mental-health-counselling.html',
      linkText: 'Talk to a counsellor',
      hindi: 'हर बेटी को सुना जाना और सपने देखने का हक़ है।'
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
      id: 'world-kindness-day',
      title: 'World Kindness Day',
      start: '11-13', end: '11-13',
      category: 'Self-care',
      lines: "Kindness counts twice — it lifts the person who receives it and the person who gives it. The hardest person to be kind to is often yourself; speak to yourself as you would to a friend. One small, genuine gesture today is enough.",
      link: 'wellbeing-check.html',
      linkText: 'Check in on yourself',
      hindi: 'खुद के साथ भी वैसी ही नरमी रखें, जैसी किसी दोस्त के साथ।'
    },
    {
      id: 'childrens-day-india',
      title: "Children's Day (India)",
      start: '11-14', end: '11-14',
      category: 'Awareness',
      lines: "Children feel stress too — about marks, friendships and fitting in — even when they can’t put it into words. Feeling safe to talk, without fear of being judged or compared, is what protects a child’s mind most. Ask how they really are, and listen.",
      link: 'for-parents.html',
      linkText: 'Guidance for parents',
      hindi: 'बच्चे भी तनाव महसूस करते हैं — उन्हें सुनना सबसे बड़ी मदद है।'
    },
    {
      id: 'mens-day',
      title: "International Men's Day",
      start: '11-19', end: '11-19',
      category: 'Awareness',
      lines: "Boys and men are often taught to hide what they feel — and that silence shows up as stress, anger or burnout. Reaching out isn’t weakness; it takes real courage. Talking to someone is a strength, whatever anyone told you growing up.",
      link: 'work-stress-burnout-test.html',
      linkText: 'Take the burnout check',
      hindi: 'भावनाएँ छुपाना ताक़त नहीं — बात करना असली हिम्मत है।'
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
    },
    {
      id: 'disabilities-day',
      title: 'International Day of Persons with Disabilities',
      start: '12-03', end: '12-03',
      category: 'Awareness',
      lines: "Mental health is part of everyone’s health — including people living with disabilities, who too often face extra barriers to support. Inclusion means access, understanding and respect, not pity. Everyone deserves care that fits their needs.",
      link: 'mental-health-counselling.html',
      linkText: 'See how counselling works',
      hindi: 'हर किसी को अपनी ज़रूरत के मुताबिक़ सहारा पाने का हक़ है।'
    }
  ]
};
