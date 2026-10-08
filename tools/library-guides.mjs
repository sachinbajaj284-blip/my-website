/* Content for the Career Library admission & exam guides.
 *
 * These are the high-intent, seasonal pages families search for during India's
 * admission cycle: how the counselling processes actually work, and what the real
 * options are after a result. Generated (not hand-authored) so the shell stays
 * consistent with the existing library articles, but with a free-form `body` because
 * admission content doesn't fit one fixed section order.
 *
 * Deliberately evergreen: no year-specific dates or cut-offs are stated, because those
 * change every cycle and a stale date on an admissions page does real harm. Each guide
 * points to the official portal (MCC, JoSAA, the university, NSP) for current dates.
 * Process facts — who conducts what, the quota split, the round structure, the
 * freeze/float/slide choices — are stable and checkable.
 */

const DATE = '2026-10-08';

export const LIBRARY_GUIDES = [
  {
    slug: 'neet-counselling-process',
    crumb: 'NEET Counselling Process',
    title: 'NEET Counselling: How It Works (MCC & State) | Lume Live',
    h1: 'NEET Counselling: How It Works, Step by Step',
    headline: 'NEET Counselling Explained: MCC All-India Quota, State Counselling & Rounds',
    metaDesc: 'How NEET counselling works in India — the MCC All-India Quota vs 85% state quota, the rounds, choice filling, documents and reporting. A clear, jargon-free guide.',
    ogTitle: 'NEET Counselling: How It Works (MCC & State)',
    ogDesc: 'AIQ vs state quota, the rounds, choice filling, freeze/float, documents and reporting — NEET counselling explained in plain language.',
    readMin: 9, date: DATE,
    lead: 'Clearing NEET is only half the journey &mdash; the seat is decided in counselling, and that process confuses more families than the exam does. Here is the plain-language version: <strong>who runs it, how the quotas split, and what you actually do, round by round</strong>.',
    facts: [['MCC + States', 'Who runs it'], ['15% AIQ / 85% State', 'Quota split'], ['Online', 'Choice filling'], ['mcc.nic.in', 'Official portal']],
    body: `    <h2>Two counsellings run in parallel</h2>
    <p>This is the single most important thing to understand. Your NEET score feeds <strong>two separate counselling processes</strong> at once, and you can take part in both:</p>
    <ul>
      <li><strong>All India Quota (AIQ) &mdash; run by the MCC</strong> (Medical Counselling Committee, mcc.nic.in). This covers the 15% All India Quota seats in government colleges, plus deemed and central universities, AIIMS, JIPMER, ESIC and AFMS seats. It is pan-India &mdash; no domicile needed.</li>
      <li><strong>State Quota &mdash; run by each state's authority.</strong> This covers the remaining 85% of government-college seats, and most state private-college seats. These usually require <strong>domicile</strong> of that state, and each state has its own portal, schedule and rules.</li>
    </ul>
    <div class="note">You register separately for AIQ and for your state. Many students run both in parallel &mdash; an AIQ seat in one state and a home-state seat as backup &mdash; and decide once allotments come in.</div>

    <h2>The steps, in order</h2>
    <ol>
      <li><strong>Register</strong> on the counselling portal (MCC for AIQ; your state's portal for state quota) and pay the fee and refundable security deposit.</li>
      <li><strong>Fill and lock your choices</strong> &mdash; the colleges and courses you want, in your true order of preference. Order matters more than anything else here.</li>
      <li><strong>Seat allotment</strong> is released based on your rank, category and choices.</li>
      <li><strong>Accept and report</strong> &mdash; pay the fee, complete document verification, and report to the allotted college (online or in person, as specified).</li>
    </ol>

    <h2>The rounds</h2>
    <p>Counselling runs over several rounds so seats freed by students moving or leaving can be re-allotted. The usual shape:</p>
    <table class="cmp">
      <tr><th>Round</th><th>What happens</th></tr>
      <tr><td>Round 1</td><td>First allotment on your locked choices.</td></tr>
      <tr><td>Round 2</td><td>Fresh and upgraded allotments; you can try to improve on Round 1.</td></tr>
      <tr><td>Round 3 / Mop-Up</td><td>Remaining vacant seats are filled, including many deemed/private seats.</td></tr>
      <tr><td>Stray Vacancy</td><td>The last seats, usually filled strictly from a waiting list.</td></tr>
    </table>
    <p>When you get a seat, you normally choose to <strong>freeze</strong> (keep it, no upgrade), <strong>float/upgrade</strong> (keep it but ask for a better choice in the next round), or <strong>skip</strong> (decline and try again) &mdash; and the rules on fees forfeited for leaving a seat get stricter in later rounds, so read them before you act.</p>

    <h2>Documents to keep ready</h2>
    <ul>
      <li>NEET admit card and scorecard/rank letter</li>
      <li>Class 10 and 12 marksheets and certificates</li>
      <li>Photo ID (Aadhaar/passport) and passport-size photos</li>
      <li>Category certificate (SC/ST/OBC/EWS) if claiming a reserved seat</li>
      <li>Domicile certificate for state counselling</li>
      <li>PwD certificate if applicable</li>
    </ul>

    <h2>Common mistakes to avoid</h2>
    <ul>
      <li><strong>Only registering for one counselling.</strong> Doing both AIQ and state widens your options a lot.</li>
      <li><strong>Filling choices by prestige, not preference.</strong> List colleges in the order you'd actually join them, including honest backups.</li>
      <li><strong>Missing a round's deadline.</strong> The schedules are tight and unforgiving &mdash; set reminders from the official portal.</li>
      <li><strong>Leaving a seat without checking the forfeiture rules.</strong> The cost of resigning rises in later rounds.</li>
    </ul>`,
    takeaways: [
      'NEET feeds two counsellings at once — MCC (15% AIQ + deemed/central) and your state (85% state quota). Do both.',
      'AIQ is pan-India; state quota usually needs domicile. Register and fill choices separately for each.',
      'Fill choices in your true order of preference, with honest backups — order decides your seat.',
      'Watch the rounds and the freeze/float/skip rules; forfeiture costs rise in later rounds.',
    ],
    cta: {
      h3: 'Confused about which seat to actually take?',
      p: 'An AIQ seat now versus a home-state upgrade later, government versus private, MBBS versus a strong alternative — these are big calls. A ₹499 counselling session helps you weigh them clearly. Or start with the free Career Snapshot.',
    },
    faq: [
      ['Who conducts NEET counselling?', 'Two bodies, in parallel. The MCC (Medical Counselling Committee) runs the 15% All India Quota plus deemed, central, AIIMS, JIPMER, ESIC and AFMS seats, on mcc.nic.in. Each state runs its own counselling for the remaining 85% state-quota government seats and most state private seats.'],
      ['What is the difference between All India Quota and state quota?', 'The All India Quota (15% of government seats) is open to students from anywhere in India, with no domicile requirement, and is run by the MCC. State quota (the other 85%) is for students who are domiciled in that state, run by the state authority. You can take part in both.'],
      ['Can I take part in both AIQ and state counselling?', 'Yes, and most students do. You register separately for each, and it genuinely widens your options — you might hold a home-state seat as a safety net while trying for a better AIQ allotment, then decide.'],
      ['What does freeze, float and skip mean?', 'When you are allotted a seat, freeze means you accept it and want no upgrade; float (or upgrade) means you accept it but want a higher choice in the next round if possible; skip means you decline it. The fee you forfeit for leaving a seat generally increases in later rounds.'],
      ['Do dates change every year?', 'Yes — exact counselling dates, fees and round schedules are set fresh each cycle, so always confirm them on the official portal (mcc.nic.in for AIQ, your state portal for state quota) rather than relying on last year’s calendar.'],
    ],
    related: [
      ['what-to-do-after-neet.html', 'Didn’t clear NEET or scored low? Your options'],
      ['is-neet-right-for-you.html', 'Is NEET right for you?'],
      ['career-as-doctor-mbbs.html', 'Career as a Doctor (MBBS) in India'],
      ['career-counselling-for-neet-jee-droppers.html', 'Career counselling for NEET/JEE droppers'],
      ['assessment.html#free-test', 'Free 60-second Career Snapshot'],
    ],
  },

  {
    slug: 'josaa-counselling-process',
    crumb: 'JoSAA Counselling Process',
    title: 'JoSAA Counselling: How It Works, Step by Step | Lume Live',
    h1: 'JoSAA Counselling: How It Works, Step by Step',
    headline: 'JoSAA Counselling Explained: Choice Filling, Rounds & Freeze/Float/Slide',
    metaDesc: 'How JoSAA counselling works for IIT, NIT, IIIT and GFTI admission — registration, choice filling, the rounds, and the freeze, float and slide options explained simply.',
    ogTitle: 'JoSAA Counselling: How It Works, Step by Step',
    ogDesc: 'Registration, choice filling, the rounds, and freeze/float/slide — JoSAA counselling for IITs, NITs, IIITs and GFTIs, in plain language.',
    readMin: 9, date: DATE,
    lead: 'Your JEE rank gets you to the door; <strong>JoSAA decides which door opens</strong>. For IIT, NIT, IIIT and GFTI seats it is the one process that matters, and filling it well can change which college and branch you end up in. Here is how it works.',
    facts: [['JoSAA', 'Who runs it'], ['IIT / NIT / IIIT / GFTI', 'Seats covered'], ['6 rounds (approx.)', 'Allotment rounds'], ['josaa.nic.in', 'Official portal']],
    body: `    <h2>What JoSAA is</h2>
    <p>JoSAA &mdash; the <strong>Joint Seat Allocation Authority</strong> &mdash; runs one combined counselling for the top government engineering seats in India:</p>
    <ul>
      <li><strong>IITs</strong> &mdash; admission through your <strong>JEE Advanced</strong> rank.</li>
      <li><strong>NITs, IIITs and GFTIs</strong> (Government Funded Technical Institutes) &mdash; admission through your <strong>JEE Main</strong> rank.</li>
    </ul>
    <p>One registration, one choice list, one set of rounds covers all of them. That is the point of JoSAA: you don't apply to each institute separately.</p>

    <h2>The steps, in order</h2>
    <ol>
      <li><strong>Register</strong> on josaa.nic.in with your JEE credentials once counselling opens.</li>
      <li><strong>Fill choices</strong> &mdash; every institute-and-branch combination you'd accept, arranged in your true order of preference. You can (and should) add many.</li>
      <li><strong>Lock</strong> your choices before the deadline. Unlocked choices are auto-locked, but lock them yourself to be safe.</li>
      <li><strong>Seat allotment</strong> is released each round based on your rank, category and choice order.</li>
      <li><strong>Accept the seat</strong> &mdash; pay the seat-acceptance fee, upload documents, and complete online reporting.</li>
    </ol>
    <div class="note">Choice order is everything. JoSAA gives you the highest-preference seat your rank can reach in that round &mdash; so put choices in the order you truly want them, not the order of their reputation.</div>

    <h2>Freeze, float and slide</h2>
    <p>When you're allotted a seat, you choose how to respond &mdash; this is where most of the confusion lives:</p>
    <table class="cmp">
      <tr><th>Option</th><th>What it means</th></tr>
      <tr><td>Freeze</td><td>Accept this seat and stop. You won't be considered for any upgrade in later rounds.</td></tr>
      <tr><td>Float</td><td>Accept this seat, but stay in the running for a higher preference anywhere. If a better choice opens, you move; if not, you keep this one.</td></tr>
      <tr><td>Slide</td><td>Accept this seat, but stay in the running only for a higher-preference branch within the same institute.</td></tr>
    </table>
    <p>Choose <strong>freeze</strong> only when you're genuinely happy to stop; <strong>float</strong> if you'd take a better option at any institute; <strong>slide</strong> if you love the institute but want a better branch there.</p>

    <h2>The rounds, and what comes after</h2>
    <p>JoSAA runs several rounds (commonly around six) so vacated seats can be reallocated. If you're floating, your seat can upgrade from round to round. Once the JoSAA rounds finish, the <strong>CSAB Special Rounds</strong> fill remaining NIT-system seats &mdash; a useful second chance if your JoSAA result wasn't ideal.</p>

    <h2>Common mistakes to avoid</h2>
    <ul>
      <li><strong>Filling too few choices.</strong> Add every acceptable option; a short list can leave you with no seat.</li>
      <li><strong>Ordering by reputation, not preference.</strong> List what you'd actually join first.</li>
      <li><strong>Freezing too early.</strong> If a better seat is realistic, float &mdash; freezing ends your chance of upgrading.</li>
      <li><strong>Missing the acceptance or reporting deadline.</strong> An allotted seat is lost if you don't confirm it in time.</li>
    </ul>`,
    takeaways: [
      'JoSAA is one combined counselling for IITs (via JEE Advanced) and NITs/IIITs/GFTIs (via JEE Main).',
      'Choice order decides your seat — list institute-and-branch options in your true order of preference, and add plenty.',
      'Freeze = stop; Float = chase a better seat anywhere; Slide = chase a better branch in the same institute.',
      'After the JoSAA rounds, CSAB Special Rounds are a second chance for remaining NIT-system seats.',
    ],
    cta: {
      h3: 'Which branch and college should you actually prioritise?',
      p: 'A higher-ranked college or a branch you’ll enjoy? Core engineering or a newer field? Your choice order deserves real thought. A ₹499 session helps you build it, or start with the free Career Snapshot to clarify what fits.',
    },
    faq: [
      ['What is JoSAA counselling?', 'JoSAA (the Joint Seat Allocation Authority) runs a single combined counselling that allocates seats across the IITs (through JEE Advanced), and the NITs, IIITs and GFTIs (through JEE Main). One registration and one choice list cover all of these institutes.'],
      ['How important is choice order in JoSAA?', 'It is the most important thing you control. JoSAA allots the highest-preference seat your rank can reach in each round, so your list should be in the exact order you would actually join the options — not in order of their reputation.'],
      ['What is the difference between freeze, float and slide?', 'Freeze means you accept the allotted seat and stop, with no upgrade. Float means you accept it but stay in the running for a higher preference at any institute. Slide means you accept it but stay in the running only for a better branch within the same institute.'],
      ['What happens after JoSAA rounds end?', 'The CSAB Special Rounds are held to fill seats that remain vacant in the NIT system (NITs, IIITs, GFTIs). They are a genuine second chance, especially if your JoSAA allotment was not what you hoped for.'],
      ['Do JoSAA dates and number of rounds change each year?', 'Yes — the schedule, fees and exact number of rounds are set fresh each cycle, so always confirm the current details on the official portal, josaa.nic.in, rather than relying on a previous year.'],
    ],
    related: [
      ['college-predictor.html', 'College Predictor — what can you get with your JEE rank?'],
      ['choice-list.html', 'Build your JoSAA choice list in the right order'],
      ['colleges.html', 'Browse every college in JoSAA counselling'],
      ['what-to-do-after-jee.html', 'Low JEE rank or didn’t qualify? Your options'],
      ['career-as-software-engineer.html', 'Career as a Software Engineer in India'],
    ],
  },

  {
    slug: 'what-to-do-after-neet',
    crumb: 'What To Do After NEET',
    title: 'Didn’t Clear NEET or Scored Low? Your Options | Lume Live',
    h1: 'Didn’t Clear NEET or Scored Low? Your Real Options',
    headline: 'What To Do After a Low NEET Score: Medical & Allied Health Options in India',
    metaDesc: 'A low NEET score or not qualifying is not the end. The real options — BDS, AYUSH, nursing, allied health, veterinary, biosciences, a drop year and more — weighed honestly.',
    ogTitle: 'Didn’t Clear NEET or Scored Low? Your Options',
    ogDesc: 'BDS, AYUSH, nursing, allied health, veterinary, biosciences, a drop year and more — the real options after a low NEET score, weighed honestly.',
    readMin: 9, date: DATE,
    lead: 'A low NEET score feels like a door slamming. It isn’t. There is a whole set of respected healthcare and science careers &mdash; many still reached through NEET &mdash; and some excellent paths outside medicine entirely. Here they are, weighed honestly.',
    facts: [['Many', 'Routes still open'], ['NEET often still used', 'For BDS/AYUSH/Nursing'], ['Govt vs private', 'Cost matters'], ['Fit > prestige', 'The real filter']],
    body: `    <h2>First: don’t decide in the first 48 hours</h2>
    <p>Results day is the worst time to make a years-long decision. The disappointment is loud and the options look smaller than they are. Give it a few days, then work through the list below calmly &mdash; ideally with someone who isn’t as emotionally invested as you are right now.</p>

    <h2>Still medicine, still often via NEET</h2>
    <ul>
      <li><strong>Government MBBS, if your rank reaches it</strong> &mdash; state quota and the mop-up rounds sometimes open seats a borderline score can still get. Work the counselling fully before assuming MBBS is gone.</li>
      <li><strong>Private &amp; deemed MBBS</strong> &mdash; possible at a lower rank, but fees often run from tens of lakhs to a crore or more over the course. A genuine option only if the family can fund it without strain.</li>
      <li><strong>BDS (dentistry)</strong> &mdash; a full medical profession via NEET, with a lower cut-off than MBBS. <a href="career-as-dentist.html">How to become a dentist &rarr;</a></li>
      <li><strong>AYUSH &mdash; BAMS, BHMS, BUMS, BNYS</strong> &mdash; Ayurveda, homeopathy, Unani and naturopathy degrees, admitted through NEET, leading to recognised practice.</li>
      <li><strong>Veterinary (B.V.Sc &amp; A.H.)</strong> &mdash; a five-year medical path for animals, with its own NEET-based counselling.</li>
    </ul>

    <h2>Allied health &mdash; growing fast, often overlooked</h2>
    <p>These are real careers with rising demand, and many don’t need a top NEET score (some don’t need NEET at all &mdash; check each):</p>
    <ul>
      <li><strong>B.Sc Nursing</strong> &mdash; secure, in-demand and highly portable abroad. <a href="career-as-nurse.html">How to become a nurse &rarr;</a></li>
      <li><strong>B.Pharm / Pharm.D</strong> &mdash; the science of medicines, with industry, research and clinical roles. <a href="career-as-pharmacist.html">How to become a pharmacist &rarr;</a></li>
      <li><strong>BPT (physiotherapy)</strong> &mdash; hands-on rehabilitation, growing with sports and ageing care. <a href="career-as-physiotherapist.html">How to become a physiotherapist &rarr;</a></li>
      <li><strong>Other allied health</strong> &mdash; medical lab technology, radiology &amp; imaging, optometry, occupational therapy, audiology, nutrition &amp; dietetics.</li>
    </ul>

    <h2>Outside medicine entirely</h2>
    <ul>
      <li><strong>B.Sc in biosciences</strong> &mdash; biotechnology, microbiology, biochemistry, genetics &mdash; strong routes into research and the life-sciences industry.</li>
      <li><strong>Psychology</strong> &mdash; if the pull was always &ldquo;helping people&rdquo;. <a href="career-as-psychologist.html">How to become a psychologist &rarr;</a></li>
      <li><strong>CUET-based degrees</strong> &mdash; a wide range of university courses across streams. <a href="what-is-cuet.html">What is CUET? &rarr;</a></li>
    </ul>

    <h2>Studying MBBS abroad &mdash; read this carefully</h2>
    <p>It’s a real route, but one to approach with eyes open. To practise in India afterwards you must clear the screening exam (FMGE / the NExT framework), and you need NEET qualification plus a college that meets the current NMC rules on duration, medium and clinical training. Do thorough due diligence on the specific college and country &mdash; this is where families get burned.</p>

    <h2>The drop-year decision</h2>
    <p>Repeating a year can be the right call &mdash; but only as a considered choice, not a reflex. Weigh it honestly: how far was your score from the seat you want, is the gap fixable in a year, and is your motivation genuine or just momentum and family pressure? Our <a href="career-counselling-for-neet-jee-droppers.html">guide for droppers</a> works through this properly.</p>`,
    takeaways: [
      'Don’t decide in the first 48 hours — work the full counselling before assuming MBBS is gone.',
      'Many respected paths still run through NEET: BDS, AYUSH, veterinary, and nursing in many states.',
      'Allied health (nursing, pharmacy, physiotherapy, lab tech, optometry) is in demand and often overlooked.',
      'A drop year and studying MBBS abroad can work — but both need honest, informed scrutiny, not a reflex.',
    ],
    cta: {
      h3: 'Overwhelmed by the options after NEET?',
      p: 'This is exactly the moment counselling earns its keep — sorting the realistic paths from the noise, and matching them to you rather than to panic. Book a ₹499 session, or start with the free Career Snapshot.',
    },
    faq: [
      ['Is a low NEET score the end of a medical career?', 'No. Government MBBS may still be reachable through state quota or mop-up rounds, and several full medical paths — BDS, AYUSH degrees, veterinary science — are admitted at lower NEET cut-offs. Beyond those, nursing, pharmacy and allied-health careers are respected and in demand.'],
      ['What can I do after NEET without MBBS?', 'A lot: BDS, BAMS/BHMS and other AYUSH courses, B.Sc Nursing, B.Pharm, physiotherapy, medical lab technology, optometry and more — many via NEET — plus biosciences, psychology and CUET-based degrees outside the NEET system.'],
      ['Should I take a drop year to retake NEET?', 'Only as a considered decision. Weigh how far your score was from the seat you want, whether that gap is realistically closable in a year, and whether your motivation is genuine rather than momentum or pressure. For some students it pays off; for others, a strong alternative path is the better call.'],
      ['Is studying MBBS abroad a good idea?', 'It can be, but with caution. To practise in India you must clear the screening exam (FMGE/NExT), hold NEET qualification, and choose a college that meets current NMC rules. Do careful due diligence on the specific country and college — this is where many families run into trouble.'],
    ],
    related: [
      ['neet-counselling-process.html', 'NEET counselling: how it works (MCC & state)'],
      ['career-as-nurse.html', 'Career as a Nurse in India'],
      ['career-as-dentist.html', 'Career as a Dentist in India'],
      ['career-counselling-for-neet-jee-droppers.html', 'Career counselling for NEET/JEE droppers'],
      ['assessment.html#free-test', 'Free 60-second Career Snapshot'],
    ],
  },

  {
    slug: 'what-to-do-after-jee',
    crumb: 'What To Do After JEE',
    title: 'Low JEE Rank or Didn’t Qualify? Your Options | Lume Live',
    h1: 'Low JEE Rank or Didn’t Qualify? Your Real Options',
    headline: 'What To Do After a Low JEE Rank: Engineering & Alternative Paths in India',
    metaDesc: 'A low JEE rank is not the end of engineering — or of a great career. NITs via JoSAA, CSAB, state quota, private entrances, other engineering routes and strong non-engineering pivots.',
    ogTitle: 'Low JEE Rank or Didn’t Qualify? Your Options',
    ogDesc: 'NITs via JoSAA, CSAB, state quota, BITSAT/VITEEE and other private routes, and strong non-engineering pivots — the real options after a low JEE rank.',
    readMin: 9, date: DATE,
    lead: 'If the JEE rank wasn’t what you hoped, breathe &mdash; a great engineering career does not depend on a single exam, and there are strong paths both within engineering and well outside it. Here is the honest map.',
    facts: [['Many', 'Routes still open'], ['JoSAA + CSAB', 'Govt seats'], ['BITSAT/VITEEE/CETs', 'Private &amp; state'], ['Skill > college tag', 'Long run']],
    body: `    <h2>First: the college name matters less than you think</h2>
    <p>In engineering &mdash; especially software and newer fields &mdash; what you build and learn outpaces the college tag within a few years. Plenty of people from ordinary colleges do exceptionally well. So choose the best realistic option, then focus on skills. With that framing, here are the routes.</p>

    <h2>Government seats &mdash; work JoSAA and CSAB fully</h2>
    <ul>
      <li><strong>NITs, IIITs and GFTIs via JoSAA</strong> &mdash; a moderate JEE Main rank still reaches many good branches and institutes, especially if you fill choices widely. See <a href="josaa-counselling-process.html">how JoSAA works &rarr;</a> and the <a href="college-predictor.html">College Predictor</a>.</li>
      <li><strong>CSAB Special Rounds</strong> &mdash; after JoSAA, these fill remaining NIT-system seats; a real second chance worth registering for.</li>
      <li><strong>State-quota seats via JEE Main</strong> &mdash; many states admit to their government and top colleges using your JEE Main score, through state counselling.</li>
    </ul>

    <h2>Strong private &amp; other-entrance routes</h2>
    <p>Some of India’s best-placed engineering colleges don’t use JEE at all:</p>
    <table class="cmp">
      <tr><th>Exam / route</th><th>Leads to</th></tr>
      <tr><td>BITSAT</td><td>BITS Pilani, Goa, Hyderabad</td></tr>
      <tr><td>VITEEE</td><td>VIT Vellore &amp; campuses</td></tr>
      <tr><td>SRMJEEE / MET / others</td><td>SRM, Manipal and other strong private universities</td></tr>
      <tr><td>COMEDK / state CETs</td><td>Private &amp; state colleges (e.g. Karnataka, Maharashtra)</td></tr>
    </table>
    <p>Several of these still have application windows after JEE results, so you may not have missed them.</p>

    <h2>Still want research or pure science?</h2>
    <ul>
      <li><strong>IISER / IISc via the IAT</strong> &mdash; for a research-focused BS/BS-MS in the sciences.</li>
      <li><strong>B.Sc at a strong university</strong> &mdash; physics, maths, computer science &mdash; a genuine route into data, research and tech, often via CUET.</li>
    </ul>

    <h2>Non-engineering pivots worth a real look</h2>
    <p>If the honest truth is that engineering was a default rather than a fit, this is a good moment to reconsider:</p>
    <ul>
      <li><strong>Design</strong> &mdash; UCEED/NID for product, UX and more. <a href="career-as-product-designer.html">Career as a product designer &rarr;</a></li>
      <li><strong>Architecture</strong> &mdash; via NATA/JEE Paper 2. <a href="career-as-architect.html">Career as an architect &rarr;</a></li>
      <li><strong>Data, CS and tech</strong> through a B.Sc or BCA route. <a href="career-as-data-scientist.html">Career as a data scientist &rarr;</a></li>
      <li><strong>CUET-based degrees</strong> across commerce, economics and the sciences. <a href="what-is-cuet.html">What is CUET? &rarr;</a></li>
    </ul>

    <h2>The drop-year decision</h2>
    <p>Repeating for JEE can be worth it &mdash; but only as a clear-eyed choice. Ask how far your rank was from the seat you want, whether a year can realistically close that gap, and whether you have the motivation for another intense cycle. Our <a href="career-counselling-for-neet-jee-droppers.html">guide for droppers</a> helps you decide honestly.</p>`,
    takeaways: [
      'In engineering, skills outrun the college tag within a few years — pick the best realistic seat, then build.',
      'Work JoSAA and the CSAB special rounds fully; a moderate JEE Main rank still reaches good NIT-system seats.',
      'Top private colleges use their own exams (BITSAT, VITEEE, CETs) — several windows are still open after JEE.',
      'If engineering was a default, design, architecture, pure science and CUET routes are worth a genuine look.',
    ],
    cta: {
      h3: 'Not sure whether to take a seat, switch paths, or drop?',
      p: 'A lower rank forces a real decision, and it’s easy to make it in a panic. A ₹499 session helps you weigh the seat in hand against the alternatives and a drop year, calmly. Or start with the free Career Snapshot.',
    },
    faq: [
      ['Is a low JEE rank the end of an engineering career?', 'Not at all. A moderate JEE Main rank still reaches many NIT-system seats through JoSAA and CSAB, state quotas use JEE Main too, and several of India’s best private colleges admit through their own exams. Beyond that, what you build in engineering matters more than the college name within a few years.'],
      ['Which good engineering colleges don’t use JEE?', 'Several strong private universities run their own entrance exams — BITS Pilani through BITSAT, VIT through VITEEE, and SRM, Manipal and others through their tests — while COMEDK and various state CETs cover many private and state colleges. Some of these windows are still open after JEE results.'],
      ['What are good alternatives to engineering after JEE?', 'If engineering was a default rather than a genuine fit, strong alternatives include design (via UCEED/NID), architecture (NATA), pure sciences and research (IISER/IISc via IAT, or a B.Sc), and a wide range of CUET-based degrees across commerce, economics and the sciences.'],
      ['Should I drop a year to retake JEE?', 'Only as a considered choice. Weigh how far your rank was from your target seat, whether a year of focused work can realistically close that gap, and whether you genuinely have the motivation for another cycle — rather than repeating out of momentum or pressure.'],
    ],
    related: [
      ['josaa-counselling-process.html', 'JoSAA counselling: how it works, step by step'],
      ['college-predictor.html', 'College Predictor — what can you get with your JEE rank?'],
      ['is-jee-right-for-you.html', 'Is JEE right for you?'],
      ['career-counselling-for-neet-jee-droppers.html', 'Career counselling for NEET/JEE droppers'],
      ['assessment.html#free-test', 'Free 60-second Career Snapshot'],
    ],
  },

  {
    slug: 'cuet-admission-process',
    crumb: 'CUET Admission Process',
    title: 'After Your CUET Result: How Admission Works | Lume Live',
    h1: 'After Your CUET Result: How University Admission Works',
    headline: 'CUET Admission Explained: From Scorecard to University Seat (DU CSAS & Others)',
    metaDesc: 'What happens after the CUET result — how scores convert to seats, DU’s CSAS, university-wise counselling, preference filling and documents. A clear guide for Class 12 families.',
    ogTitle: 'After Your CUET Result: How Admission Works',
    ogDesc: 'How CUET scores become university seats — DU’s CSAS, university-wise counselling, preference filling and documents, explained in plain language.',
    readMin: 8, date: DATE,
    lead: 'CUET is only the test &mdash; the <strong>seat is decided afterwards, university by university</strong>, and that second stage trips up a lot of families. Here is what happens once your CUET scorecard is out, and how to navigate it.',
    facts: [['CUET-UG', 'The score'], ['Each university', 'Runs its own admission'], ['Preference filling', 'The key step'], ['nta/university portals', 'Where to apply']],
    body: `    <h2>CUET gives a score, not a seat</h2>
    <p>This is the core thing to understand. Clearing or scoring well in CUET does not automatically place you anywhere. Your CUET score is the <strong>currency</strong>; each participating university then runs its <strong>own admission process</strong> using that score. So after results, your job shifts from &ldquo;prepare&rdquo; to &ldquo;apply, in the right order, to the right places&rdquo;.</p>
    <div class="note">Scores are normalised across exam shifts, so the mark you see is adjusted for difficulty. Admission everywhere is based on this normalised CUET score plus each university’s own criteria.</div>

    <h2>Delhi University: the CSAS system</h2>
    <p>DU, the single biggest CUET destination, uses <strong>CSAS (Common Seat Allocation System)</strong>, which runs in phases:</p>
    <ol>
      <li><strong>Registration</strong> on the DU CSAS portal and payment.</li>
      <li><strong>Preference filling</strong> &mdash; you list combinations of <em>programme + college</em> in your order of preference. This step decides everything, so fill it thoughtfully and widely.</li>
      <li><strong>Seat allocation rounds</strong> &mdash; seats are allotted by CUET score, category and your preferences, over several rounds with upgrade options.</li>
      <li><strong>Accept, verify, pay</strong> &mdash; confirm the seat, complete document verification and pay the fee within the window.</li>
    </ol>

    <h2>Other universities run their own version</h2>
    <p>BHU, Allahabad, Jamia (for its CUET-based courses), and many central, state and private universities each run their own counselling or merit-list admission on CUET scores. The practical implications:</p>
    <ul>
      <li><strong>Apply separately to each university</strong> you’re targeting &mdash; there is no single national seat allocation across all of them.</li>
      <li><strong>Track each one’s portal and deadlines</strong> independently; they don’t share a calendar.</li>
      <li><strong>Keep documents ready</strong> for several processes at once.</li>
    </ul>

    <h2>Filling preferences well</h2>
    <ul>
      <li><strong>Go wide.</strong> List many programme-college combinations; a short list risks no seat.</li>
      <li><strong>Order by genuine preference</strong> &mdash; where you’d actually go first &mdash; not by name alone. Weigh the course as much as the college.</li>
      <li><strong>Include safe backups</strong> below your ambitious choices.</li>
      <li><strong>Don’t freeze a seat you’d trade up from</strong> if upgrade rounds are available.</li>
    </ul>

    <h2>Documents to keep ready</h2>
    <ul>
      <li>CUET scorecard and Class 12 marksheet</li>
      <li>Class 10 marksheet / certificate (for date of birth)</li>
      <li>Photo ID (Aadhaar) and photographs</li>
      <li>Category certificate (SC/ST/OBC/EWS) if applicable, and any ECA/sports proof</li>
    </ul>`,
    takeaways: [
      'CUET gives a normalised score, not a seat — each university then runs its own admission on that score.',
      'DU uses CSAS: register, fill programme-college preferences, then allocation rounds decide your seat.',
      'There is no single national allocation — apply separately to each university and track each deadline.',
      'Preference filling is the decisive step: go wide, order by genuine preference, and include safe backups.',
    ],
    cta: {
      h3: 'Unsure which programme-college combinations to prioritise?',
      p: 'The CUET preference list is where the real decision happens, and course fit matters as much as the college name. A ₹499 session helps you build a smart list, or start with the free Career Snapshot to clarify direction.',
    },
    faq: [
      ['Does a good CUET score guarantee admission?', 'No. CUET gives you a normalised score, which is the currency for admission — but each participating university runs its own process (counselling or merit lists) using that score. You still have to apply, fill preferences and secure a seat at each university separately.'],
      ['How does Delhi University admission work after CUET?', 'DU uses the CSAS (Common Seat Allocation System): you register, fill preferences as combinations of programme and college in your order of choice, and seats are then allotted over several rounds by CUET score, category and your preferences, with upgrade options before you finally accept.'],
      ['Do I apply to each university separately after CUET?', 'Yes. There is no single national seat allocation across all CUET universities. Delhi University, BHU, Allahabad, Jamia and others each run their own admission on your CUET score, so you register and track deadlines for each one you are targeting.'],
      ['How should I fill my CUET preferences?', 'Go wide and order by genuine preference. List many programme-college combinations in the order you would actually join them, weigh the course as much as the college name, include safe backups, and avoid freezing a seat you would upgrade from if rounds allow.'],
    ],
    related: [
      ['what-is-cuet.html', 'What is CUET? A simple guide'],
      ['what-to-do-after-board-results.html', 'What to do after board results'],
      ['career-counselling-after-12th.html', 'Career counselling after Class 12'],
      ['scholarships-for-students-india.html', 'Scholarships for students in India'],
      ['assessment.html#free-test', 'Free 60-second Career Snapshot'],
    ],
  },

  {
    slug: 'scholarships-for-students-india',
    crumb: 'Scholarships Guide',
    title: 'Scholarships for Students in India: A Practical Guide | Lume Live',
    h1: 'Scholarships for Students in India: A Practical Guide',
    headline: 'Scholarships for Students in India: Government, State & Private Options',
    metaDesc: 'A practical guide to scholarships in India — the National Scholarship Portal, government, state and private schemes, who qualifies, how to apply, and how to avoid scams.',
    ogTitle: 'Scholarships for Students in India: A Practical Guide',
    ogDesc: 'The National Scholarship Portal, government, state and private schemes, who qualifies, how to apply, and how to avoid scams — a practical guide.',
    readMin: 8, date: DATE,
    lead: 'Money stops far too many capable students, and far too much scholarship funding goes unclaimed simply because families don’t know it exists. This is a practical map of <strong>where to look, who qualifies, and how to apply</strong> &mdash; without getting scammed.',
    facts: [['NSP', 'The main hub'], ['Govt + state + private', 'Three sources'], ['Merit &amp; means', 'Common basis'], ['scholarships.gov.in', 'Start here']],
    body: `    <h2>Start with the National Scholarship Portal</h2>
    <p>The <strong>National Scholarship Portal (NSP)</strong>, at scholarships.gov.in, is the single biggest starting point &mdash; a government platform that hosts a large number of central and state scholarship schemes in one place, with one application profile. If you do nothing else, create a profile here and browse what you’re eligible for.</p>

    <h2>The three sources of scholarships</h2>
    <table class="cmp">
      <tr><th>Source</th><th>Examples</th><th>Where to look</th></tr>
      <tr><td>Central government</td><td>Central Sector Scheme, pre- and post-matric schemes for SC/ST/OBC/EWS and minorities, schemes for girls and PwD students</td><td>NSP (scholarships.gov.in)</td></tr>
      <tr><td>State government</td><td>State-specific merit and means scholarships, fee reimbursement schemes</td><td>Your state’s scholarship portal</td></tr>
      <tr><td>Private &amp; corporate</td><td>Foundations and companies (e.g. large corporate and trust-run scholarships), college-specific aid</td><td>Each foundation’s own site; your college’s aid office</td></tr>
    </table>

    <h2>What scholarships are based on</h2>
    <ul>
      <li><strong>Merit</strong> &mdash; marks, exam ranks or academic record.</li>
      <li><strong>Means</strong> &mdash; family income below a threshold.</li>
      <li><strong>Merit-cum-means</strong> &mdash; a combination; common for the better-funded awards.</li>
      <li><strong>Category &amp; group</strong> &mdash; SC/ST/OBC/EWS, minorities, girls, first-generation learners, PwD students, specific regions.</li>
    </ul>

    <h2>Documents you’ll usually need</h2>
    <ul>
      <li>Income certificate (central to most means-based awards)</li>
      <li>Caste/category certificate, where relevant</li>
      <li>Mark sheets and admission proof</li>
      <li>Aadhaar and a bank account in the student’s name (for direct transfer)</li>
      <li>Domicile certificate for state schemes; passport-size photos</li>
    </ul>
    <div class="note">Keep a single, clearly labelled folder (digital and physical) of these documents. Most missed scholarships are lost not to ineligibility but to a deadline reached without the paperwork ready.</div>

    <h2>How to actually get them</h2>
    <ol>
      <li><strong>Start early</strong> &mdash; windows open and close on fixed dates, often soon after admission.</li>
      <li><strong>Apply broadly</strong> &mdash; you can hold several scholarships where rules allow; treat it like a numbers game.</li>
      <li><strong>Get the income certificate sorted first</strong> &mdash; it gates most means-based awards and takes time to obtain.</li>
      <li><strong>Check renewal rules</strong> &mdash; many are annual and need you to reapply or maintain marks.</li>
    </ol>

    <h2>Avoiding scams</h2>
    <p>One rule covers most of it: <strong>a genuine scholarship never asks you to pay to receive it.</strong> Be wary of anyone demanding a fee, a &ldquo;processing charge&rdquo;, or your banking passwords/OTP to &ldquo;release&rdquo; a scholarship. Apply only through official portals (scholarships.gov.in, your state portal, or the foundation’s own verified site), and never share an OTP.</p>`,
    takeaways: [
      'Start at the National Scholarship Portal (scholarships.gov.in) — one profile, many central and state schemes.',
      'Three sources: central government, your state, and private/corporate foundations. Apply across all three.',
      'Most awards hinge on merit, means, or both; get the income certificate sorted early, as it gates many.',
      'A real scholarship never asks you to pay to receive it — apply only via official portals, and never share an OTP.',
    ],
    cta: {
      h3: 'Planning a path that actually fits the budget?',
      p: 'Scholarships widen what’s possible, but the right course and college still have to fit the student. A ₹499 counselling session helps you plan both together. Or start with the free Career Snapshot.',
    },
    faq: [
      ['What is the National Scholarship Portal?', 'The National Scholarship Portal (NSP), at scholarships.gov.in, is a government platform that brings a large number of central and state scholarship schemes into one place with a single application profile. It is the best starting point for most students in India.'],
      ['What kinds of scholarships can students in India get?', 'Broadly three sources: central government schemes (including category, means and merit awards on the NSP), state-government scholarships and fee-reimbursement schemes, and private or corporate scholarships from foundations, companies and individual colleges. Most are based on merit, family income, or a combination.'],
      ['What documents do I need to apply for a scholarship?', 'Commonly an income certificate (for means-based awards), a caste/category certificate where relevant, mark sheets and admission proof, Aadhaar, a bank account in the student’s name for direct transfer, and often a domicile certificate for state schemes. Keeping them ready in one folder prevents missed deadlines.'],
      ['How do I avoid scholarship scams?', 'Remember that a genuine scholarship never asks you to pay to receive it. Ignore anyone demanding a fee, a processing charge, or your banking OTP or passwords, and apply only through official portals — scholarships.gov.in, your state’s portal, or a foundation’s own verified website.'],
    ],
    related: [
      ['career-counselling-fees-india.html', 'Career counselling fees in India'],
      ['what-to-do-after-board-results.html', 'What to do after board results'],
      ['cuet-admission-process.html', 'After your CUET result: how admission works'],
      ['career-counselling-after-12th.html', 'Career counselling after Class 12'],
      ['assessment.html#free-test', 'Free 60-second Career Snapshot'],
    ],
  },
];
