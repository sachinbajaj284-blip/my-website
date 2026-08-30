/* Content for the six screener landing pages. Each one leads with its own check,
   explains its own bands honestly, and only then mentions a session. The band
   thresholds below are read off lume-wellbeing-check.js — if the scales there
   change, these have to change with them. */

import { CRISIS, NOT_A_DIAGNOSIS } from './mh-pages.mjs';

const bands = rows => `<div class="bands">
${rows.map(([cls, name, text]) => `      <div class="bandrow ${cls}"><i></i><div><b>${name}</b><span>${text}</span></div></div>`).join('\n')}
    </div>`;

const bookBox = (kicker, blurb, waText) => `<div class="cta-box">
      <h3>${kicker}</h3>
      <p>${blurb}</p>
      <div class="cta-row">
        <a class="btn" href="book-session.html">Pick a slot &rarr;</a>
        <a class="btn wa" href="https://wa.me/917015671280?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener">Ask on WhatsApp</a>
      </div>
    </div>`;

const PRICE = `<p>A Lume Live session is a confidential 1:1 conversation with Sachin Bajaj, who holds an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia. Sessions are <strong>&#8377;499 for 45 minutes, with your first at &#8377;249</strong> using code FIRST50.</p>
    <p><strong>Nothing is shared with your parents, school, college or employer</strong>, and you can book using a first name only. For most people that matters more than the price does.</p>`;

export const SCREENERS = [
  {
    slug: 'free-depression-test.html',
    check: 'phq4Mood', nQ: 4,
    title: 'Free Depression Test Online (PHQ-4) | Lume Live',
    desc: 'Take a free, private low-mood and depression self-check in 2 minutes. No sign-up, nothing stored. Understand your result and what actually helps next. India.',
    keywords: 'free depression test, depression test online India, PHQ test online, am I depressed, low mood test, depression screening free, mental health check India',
    ogTitle: 'Free Depression Test Online (PHQ-4) — Lume Live',
    ogDesc: 'A free, private 2-minute low-mood self-check. No sign-up, nothing stored, no diagnosis — just a clear result and what helps next.',
    toolName: 'Free Low Mood Self-Check (PHQ-4)',
    toolDesc: 'A free, private PHQ-4 self-check covering low mood and anxiety over the last two weeks, scored into a reflection band. Not a diagnosis, and no answers are stored.',
    kicker: '&#128274; Free &middot; Anonymous &middot; Nothing Stored',
    h1: 'Free Depression Self-Check',
    lede: 'Four questions about the last two weeks. Two minutes. You get a clear result and a plain-English explanation of what it suggests &mdash; no sign-up, no email, and nothing saved anywhere.',
    heroNote: 'This is a reflection tool, not a diagnosis. Your answers never leave your browser.',
    body: `<h2>Take the check</h2>
    <p>This uses the PHQ-4, four questions covering low mood and anxiety over the past two weeks. Answer for how the fortnight has actually been rather than how you think it should have been &mdash; there is nobody here to reassure.</p>
    <div class="cta-box" id="test">
      <h3>Free low mood self-check</h3>
      <p>4 questions &middot; about 2 minutes &middot; no sign-up, nothing stored</p>
      <div class="cta-row"><button type="button" class="btn" data-ll-open="phq4Mood">Start the check</button></div>
      <p class="ll-check-note" style="margin-top:14px">Worry is the louder part for you? The <button type="button" class="linkish" data-ll-open="gad7">GAD-7 anxiety check</button> goes deeper on that side.</p>
    </div>

    ${CRISIS}

    <h2>What your score means</h2>
    <p>The PHQ-4 scores four items from 0 (not at all) to 3 (nearly every day), for a total out of 12. It also splits into two subscores out of 6 &mdash; one for anxiety, one for low mood &mdash; which is often the more useful half of the result.</p>
    ${bands([
      ['b1', '0&ndash;2 &middot; normal range', 'Low mood is not currently a significant load. Worth re-checking if things shift.'],
      ['b2', '3&ndash;5 &middot; mild range', 'Present but generally manageable. Often responds to sleep, routine, movement and having someone to talk to.'],
      ['b3', '6&ndash;8 &middot; moderate range', 'Likely costing you something &mdash; energy, interest, concentration. A sensible point to get support rather than wait it out.'],
      ['b4', '9&ndash;12 &middot; severe range', 'A heavy load to be carrying alone. Professional support is genuinely worth arranging now.'],
    ])}
    <div class="note">A subscore of <strong>3 or more</strong> on either half is the signal worth paying attention to, especially if it has been there for weeks. And a more useful question than the number: <strong>have things you used to enjoy gone flat?</strong> Loss of interest is often the earliest honest sign, and it shows up before anyone would call themselves depressed.</div>

    <h2>Low mood, sadness, and depression are not the same thing</h2>
    <p>Sadness has an object. Something happened, you feel it, and it moves. Low mood is flatter and less attached &mdash; things that should register simply don't. Depression, clinically, is a persistent version of that with a cluster of other features: sleep and appetite changes, loss of interest, difficulty concentrating, a heaviness in the body, and often a harsh running commentary about yourself.</p>
    <p>A questionnaire cannot tell you which of those you have. What it can do is tell you whether the last fortnight has been heavier than you have been admitting, which is a genuinely useful thing to know about yourself.</p>

    <h2>Why the two-week window matters</h2>
    <p>The PHQ-4 asks about a fortnight, not your life. Mood moves &mdash; a score taken the week after a result, a breakup, or a bad stretch at work is measuring that week, which is the point. It is a snapshot of load, not a description of who you are, and it is not a label you are now stuck with.</p>
    <p>If you are unsure, take it again in two weeks and see whether the picture holds. A pattern tells you far more than any single result.</p>

    <h2 id="helps">What actually helps</h2>
    <p>None of this replaces support, but all of it is worth doing while you decide:</p>
    <ul>
      <li><strong>Act before you feel like it.</strong> Low mood removes motivation first and energy second, so waiting to feel like doing something means waiting a long time. Doing the small thing badly usually restores more mood than resting does.</li>
      <li><strong>Protect sleep, but don't over-sleep.</strong> Both too little and much too much make low mood worse. A consistent wake time does more than a consistent bedtime.</li>
      <li><strong>Get outside early.</strong> Twenty minutes of morning light is one of the few free interventions with a real effect on mood and sleep timing.</li>
      <li><strong>Keep one social contact you cannot cancel.</strong> Withdrawal is the mechanism by which low mood maintains itself; one fixed commitment interrupts it.</li>
      <li><strong>Notice the commentary.</strong> Low mood is very good at presenting harsh opinions about you as though they were observations. Writing one down and reading it back later is often enough to see it for what it is.</li>
    </ul>

    <h2>When self-help isn't enough</h2>
    <p>These work reasonably well when you can still get some distance from how you feel. They work less well when the flatness has been constant for weeks, when you are withdrawing from things you used to manage easily, or when you have started thinking of yourself as the problem rather than as someone dealing with one.</p>
    <p>That is the point at which talking to someone qualified stops being an overreaction and becomes the efficient option &mdash; not because you are broken, but because low mood is genuinely hard to see clearly from inside it.</p>

    <h2 id="book">Talking to someone about it</h2>
    ${PRICE}
    ${bookBox('Book a first session — &#8377;249', 'One 45-minute conversation. Pick your own slot and get the invite immediately. No package, no commitment to a course of treatment.', 'Hello Lume Live! I took the low mood self-check and would like to book a session. 💛')}`,
    faq: [
      ['Is this depression test free?', 'Completely. No sign-up, no email, no payment. Your answers are not stored, sent or seen by anyone &mdash; they stay in your browser for the length of the check and are gone when you close the tab.'],
      ['Does this test diagnose depression?', 'No. The PHQ-4 is a brief screening and reflection scale, not a diagnostic instrument. It tells you roughly how heavy the last fortnight has been. Only a qualified clinician can diagnose depression, and that takes a proper assessment rather than four questions.'],
      ['What is the PHQ-4?', 'A four-item version of the widely used Patient Health Questionnaire, combining two anxiety items and two low-mood items. Each scores 0&ndash;3, giving a total out of 12 plus two subscores out of 6.'],
      ['What score means I should get help?', 'There is no cut-off that decides for you. Broadly, 0&ndash;2 is normal, 3&ndash;5 mild, 6&ndash;8 moderate and 9&ndash;12 severe, and a subscore of 3 or more on either half is worth attention. But if mood is affecting your sleep, work, studies or relationships, that is worth talking about whatever you scored.'],
      ['Is it anonymous?', 'Yes. No name, email or phone number to take it, and nothing recorded. If you later book a session, a first name is enough.'],
      ['I scored in the severe range. What now?', 'A high score is information, not a verdict &mdash; low mood responds well to support. A sensible next step is one confidential conversation with someone qualified. If you are having thoughts of harming yourself, call Tele-MANAS on 14416 today rather than waiting for a session.'],
    ],
  },
  {
    slug: 'work-stress-burnout-test.html',
    check: 'workStress', nQ: 10,
    title: 'Free Burnout & Work Stress Test | Lume Live',
    desc: 'A free, private 4-minute burnout and work stress self-check for professionals in India. No sign-up, nothing stored. Understand your strain level and what helps.',
    keywords: 'burnout test, work stress test India, job stress test online, am I burnt out, workplace stress assessment free, employee burnout check, work life balance test',
    ogTitle: 'Free Burnout & Work Stress Test — Lume Live',
    ogDesc: 'A free, private 4-minute work strain self-check. No sign-up, nothing stored, no diagnosis — just a clear result and what helps next.',
    toolName: 'Free Workplace Stress & Burnout Self-Check',
    toolDesc: 'A free, private workplace and study strain reflection across ten psychosocial domains, scored into a strain band. Not a diagnosis, and no answers are stored.',
    kicker: '&#128274; Free &middot; Anonymous &middot; Nothing Stored',
    h1: 'Free Burnout &amp; Work Stress Check',
    lede: 'Ten questions about workload, control, support and recovery. Four minutes. An honest read on how much strain you are actually carrying &mdash; no sign-up, no email, nothing saved.',
    heroNote: 'This is a reflection tool, not a diagnosis. Your answers never leave your browser.',
    body: `<h2>Take the check</h2>
    <p>This reflection draws on the psychosocial domains that workplace stress research keeps returning to: demands, control, clarity, support, reward and recovery. It asks about the last two weeks of your working or studying life.</p>
    <div class="cta-box" id="test">
      <h3>Free work strain self-check</h3>
      <p>10 questions &middot; about 4 minutes &middot; no sign-up, nothing stored</p>
      <div class="cta-row"><button type="button" class="btn" data-ll-open="workStress">Start the check</button></div>
      <p class="ll-check-note" style="margin-top:14px">Also useful: the <button type="button" class="linkish" data-ll-open="phq4Anxiety">2-minute anxiety and low mood check</button>, if the strain has started following you home.</p>
    </div>

    ${CRISIS}

    <h2>What your score means</h2>
    <p>Each of the ten items scores 0 to 3, for a total out of 30. The bands describe load, not diagnosis &mdash; burnout is not a clinical diagnosis in India in the way an anxiety disorder is, and this check does not pretend otherwise.</p>
    ${bands([
      ['b1', '0&ndash;8 &middot; lower strain', 'Demands and recovery are roughly in balance. Worth re-checking after a heavy quarter.'],
      ['b2', '9&ndash;15 &middot; moderate strain', 'Real load, still absorbable. This is the band where small changes to boundaries and recovery pay off most.'],
      ['b3', '16&ndash;22 &middot; high strain', 'Demands are outrunning your capacity to recover. Worth treating as a problem to solve rather than a season to survive.'],
      ['b4', '23&ndash;30 &middot; very high strain', 'A load at this level reliably damages sleep, health and relationships if it continues. Support is warranted.'],
    ])}
    <div class="note">The single most predictive item is not workload &mdash; it is <strong>control</strong>. People handle astonishing volumes of work when they have some say over how it gets done, and much smaller volumes when they do not. If your high scores cluster around control, clarity and support rather than hours, that tells you where the actual problem is.</div>

    <h2>Stress, strain and burnout are three different things</h2>
    <p><strong>Stress</strong> is the response to a demand, and it is not inherently harmful &mdash; it rises, you meet the thing, it falls. <strong>Strain</strong> is what accumulates when that cycle stops completing: demand stays up, recovery does not happen, and the baseline creeps.</p>
    <p><strong>Burnout</strong> is the end state of prolonged strain, and it has a recognisable shape: exhaustion that sleep does not fix, growing cynicism or detachment about work you used to care about, and a slide in your sense of being effective at it. That last one is the cruel part &mdash; burnout convinces you that you have become bad at your job, when what has actually happened is that you have run out of capacity.</p>

    <h2 id="helps">What actually helps</h2>
    <p>Most burnout advice is aimed at the individual because the individual is who is reading it. Worth being honest that a good deal of workplace strain is structural, and no amount of breathing exercises fixes an impossible workload. That said:</p>
    <ul>
      <li><strong>Protect recovery, not just rest.</strong> Scrolling is not recovery. Recovery is anything that genuinely takes your attention elsewhere &mdash; exercise, a craft, another person, something with your hands.</li>
      <li><strong>Find the controllable edge.</strong> You may not control the workload, but there is usually something &mdash; the order of tasks, one recurring meeting, when you answer messages. Restoring even small control changes the strain disproportionately.</li>
      <li><strong>Make the invisible work visible.</strong> A lot of strain comes from effort nobody has counted. Writing down what you actually did in a week is often the fastest way to see why you are tired.</li>
      <li><strong>Separate the finishing line from the notification.</strong> If work can reach you at any hour, no hour is off. One reliably unreachable window per day does more than a longer holiday.</li>
      <li><strong>Say the number out loud.</strong> To a manager, a mentor or a counsellor. Strain that stays private tends to be attributed to personal inadequacy rather than to load.</li>
    </ul>

    <h2>When it is worth talking to someone</h2>
    <p>If the strain has started following you home &mdash; sleep going, Sunday evenings turning heavy, patience gone with people who deserve better &mdash; that is no longer a work problem you can solve at work. It is also the point at which people most often decide to simply endure it, which is how a difficult quarter becomes a difficult year.</p>
    <p>If you are a working professional weighing a bigger change, our <a href="for-working-professionals.html">Lume Lens working profile</a> looks at direction rather than strain. This check and that one answer different questions, and it is worth knowing which you are actually asking.</p>

    <h2 id="book">Talking to someone about it</h2>
    ${PRICE}
    ${bookBox('Book a first session — &#8377;249', 'One 45-minute conversation about the load and what would realistically change it. Pick your own slot, get the invite immediately.', 'Hello Lume Live! I took the work stress check and would like to book a session. 💛')}`,
    faq: [
      ['Is this burnout test free?', 'Completely. No sign-up, no email, no payment. Your answers are not stored, sent or seen by anyone &mdash; they stay in your browser and are gone when you close the tab.'],
      ['Is burnout a medical diagnosis?', 'Not in the way an anxiety disorder is. The WHO classifies burnout as an occupational phenomenon rather than a medical condition. That does not make it less real, but it does mean no questionnaire can diagnose it &mdash; this check measures strain, which is the useful part.'],
      ['Will my employer see this?', 'No. There is no account, no email and nothing recorded. If you later book a session, that is confidential too &mdash; nothing is reported to your employer, and you can book using a first name only.'],
      ['My workload is genuinely impossible. Can counselling help with that?', 'It cannot change your workload, and anyone promising otherwise is selling something. What it can help with is the part you do control: boundaries, how you are reading the situation, what you want to ask for, and whether staying is the right call. Sometimes the honest answer is that the job is the problem.'],
      ['Is this the same as a career change assessment?', 'No. This measures strain. If the question is direction rather than load, the Lume Lens working profile is built for that, and the two are worth keeping separate.'],
      ['I scored in the very high band. What now?', 'Treat it as information about load, not about your capability. One confidential conversation is a reasonable next step. If exhaustion has tipped into hopelessness or thoughts of self-harm, call Tele-MANAS on 14416 today.'],
    ],
  },

  {
    slug: 'self-esteem-test.html',
    check: 'selfEsteem', nQ: 10,
    title: 'Free Self-Esteem Test (Rosenberg Scale) | Lume Live',
    desc: 'Take the Rosenberg self-esteem scale free and privately in 3 minutes. No sign-up, nothing stored. Understand your result and what actually builds self-worth.',
    keywords: 'free self esteem test, Rosenberg self esteem scale online, confidence test India, low self esteem check, self worth assessment free, self confidence test students',
    ogTitle: 'Free Self-Esteem Test (Rosenberg Scale) — Lume Live',
    ogDesc: 'A free, private 3-minute self-esteem check using the Rosenberg scale. No sign-up, nothing stored, no diagnosis.',
    toolName: 'Free Self-Esteem Self-Check (Rosenberg Scale)',
    toolDesc: 'A free, private ten-item Rosenberg self-esteem reflection, scored into a band. A snapshot of self-view rather than a diagnosis, and no answers are stored.',
    kicker: '&#128274; Free &middot; Anonymous &middot; Nothing Stored',
    h1: 'Free Self-Esteem Check',
    lede: 'Ten statements about how you currently see yourself. Three minutes. A snapshot of self-view, not a verdict on your worth &mdash; no sign-up, no email, nothing saved.',
    heroNote: 'This is a reflection tool, not a diagnosis. Your answers never leave your browser.',
    body: `<h2>Take the check</h2>
    <p>This is the Rosenberg self-esteem scale, ten statements you agree or disagree with. Answer for how you feel about yourself lately rather than how you would like to. Half the items are worded positively and half negatively, which is deliberate &mdash; it makes the result harder to game without meaning to.</p>
    <div class="cta-box" id="test">
      <h3>Free self-esteem self-check</h3>
      <p>10 statements &middot; about 3 minutes &middot; no sign-up, nothing stored</p>
      <div class="cta-row"><button type="button" class="btn" data-ll-open="selfEsteem">Start the check</button></div>
      <p class="ll-check-note" style="margin-top:14px">If low self-worth comes with a flat mood, the <button type="button" class="linkish" data-ll-open="phq4Mood">2-minute low mood check</button> is worth taking too.</p>
    </div>

    ${CRISIS}

    <h2>What your score means</h2>
    <p>Items score 0 to 3, with the negatively worded ones reversed, for a total out of 30.</p>
    ${bands([
      ['b4', '0&ndash;14 &middot; lower range', 'Self-criticism is currently loud. This band often reflects a rough period rather than a fixed trait &mdash; and it is the band that most limits what people let themselves attempt.'],
      ['b2', '15&ndash;25 &middot; typical range', 'A broadly workable self-view, with the ordinary doubts most people carry. Worth noticing which particular items you scored low on.'],
      ['b1', '26&ndash;30 &middot; higher range', 'A steady and positive self-view. Worth checking it is genuine rather than a habit of answering the way you think you should.'],
    ])}
    <div class="note">Read this one as a <strong>snapshot, not a trait</strong>. Self-esteem moves with context far more than people expect &mdash; a bad result, a rejection, a period of comparison, or simply being tired can shift a score by several points. What matters is not today's number but whether a low view of yourself is quietly deciding things: what you apply for, who you ask, what you think you are allowed to want.</div>

    <h2>Confidence and self-esteem are different</h2>
    <p>Confidence is domain-specific and evidence-based: you are confident at something because you have done it before. It goes up with practice and it is normal to have a lot of it in one area and none in another.</p>
    <p>Self-esteem is the background judgment about whether you are fundamentally alright as a person. It is much less responsive to achievement, which is why people who have achieved a great deal often score low here and are genuinely surprised that the achieving did not fix it. Adding accomplishments to a low self-esteem is like adding water to a leaking bucket &mdash; the issue is the leak.</p>

    <h2>The comparison problem, specifically in India</h2>
    <p>Self-worth here gets attached early and firmly to a small number of visible markers: marks, rank, which college, which company, what the extended family has heard. A child learns that they are the number, and then keeps that arithmetic running long after school ends.</p>
    <p>The result is a particular kind of low self-esteem that is not obviously distressed. It looks like functioning: working hard, meeting expectations, and privately believing none of it counts. Comparison with cousins and classmates keeps the score updated in real time, and social media supplies an endless feed of edited comparators. If that describes the shape of it, the fix is not more achievement.</p>

    <h2 id="helps">What actually helps</h2>
    <ul>
      <li><strong>Separate the event from the verdict.</strong> "I did badly in that paper" is an event. "I am not good enough" is a verdict smuggled in behind it. Writing both lines out makes the smuggling visible.</li>
      <li><strong>Notice who you compare against.</strong> Low self-esteem selects comparators strategically &mdash; always upward, always in the one dimension where you fall short. Naming that pattern takes a surprising amount of force out of it.</li>
      <li><strong>Collect counter-evidence deliberately.</strong> A harsh self-view filters memory: it keeps failures and discards the rest. Writing down things that went fine, as they happen, builds a record the filter cannot edit later.</li>
      <li><strong>Act before you feel worthy.</strong> Waiting to feel confident before applying, asking or trying means waiting indefinitely. Self-esteem tends to follow action rather than precede it.</li>
      <li><strong>Watch how you talk to yourself.</strong> If you would not say it to a friend in the same position, it is not an accurate observation &mdash; it is a habit.</li>
    </ul>

    <h2>When it is worth talking to someone</h2>
    <p>Self-criticism responds well to being said out loud to someone who does not agree with it. That is most of what helps here, and it is very hard to do alone &mdash; the whole difficulty of low self-esteem is that the judge and the defendant are the same person.</p>
    <p>It is especially worth talking to someone if a low view of yourself is shaping decisions: choosing a smaller course, not applying, staying in something that is going badly because you think it is what you deserve.</p>

    <h2 id="book">Talking to someone about it</h2>
    ${PRICE}
    ${bookBox('Book a first session — &#8377;249', 'One 45-minute conversation. No advice about believing in yourself &mdash; just a careful look at where the harsh view came from and what it is costing you.', 'Hello Lume Live! I took the self-esteem check and would like to book a session. 💛')}`,
    faq: [
      ['Is this self-esteem test free?', 'Completely. No sign-up, no email, no payment, and nothing is stored &mdash; your answers stay in your browser and are gone when you close the tab.'],
      ['What is the Rosenberg self-esteem scale?', 'A ten-item scale developed by sociologist Morris Rosenberg and one of the most widely used measures of global self-worth. Five items are worded positively and five negatively, and the negative ones are reverse-scored.'],
      ['Does a low score mean something is wrong with me?', 'No. It means self-criticism is currently loud, which is a state rather than a fact about your worth. Scores move with circumstances &mdash; the same person can land in different bands in different months.'],
      ['Can self-esteem actually change?', 'Yes, though not by being told to think positively. It shifts through repeatedly noticing the gap between the verdicts you pass on yourself and what actually happened, which is slow but reliable and is much of what counselling for this involves.'],
      ['Will anyone find out I took this?', 'No. There is no account, no email and nothing recorded. If you later book a session, that is confidential too and a first name is enough.'],
      ['I scored very low. What now?', 'A low score is worth taking seriously but not as a judgment &mdash; it is the band where people most often let a harsh self-view make decisions for them. One confidential conversation is a reasonable next step. If you are having thoughts of harming yourself, call Tele-MANAS on 14416 today.'],
    ],
  },

  {
    slug: 'wellbeing-check.html',
    check: 'wellbeingMenu', nQ: 0, menu: true,
    title: 'Free Mental Health Self-Checks | Lume Live',
    desc: 'Seven free, private mental health self-checks — anxiety, low mood, self-esteem, work stress, life satisfaction and flourishing. No sign-up, nothing stored.',
    keywords: 'free mental health test India, online self check mental health, anxiety depression test free, wellbeing assessment India, psychological self assessment free, mental health screening online',
    ogTitle: 'Free Mental Health Self-Checks — Lume Live',
    ogDesc: 'Seven free, private self-checks covering anxiety, low mood, self-esteem, work stress and wellbeing. No sign-up, nothing stored, no diagnosis.',
    toolName: 'Lume Live Free Wellbeing Self-Checks',
    toolDesc: 'A free suite of seven private mental health and wellbeing self-checks including PHQ-4, GAD-7, the Rosenberg self-esteem scale and a workplace strain reflection. Not diagnostic, and no answers are stored.',
    kicker: '&#128274; Seven Checks &middot; Free &middot; Nothing Stored',
    h1: 'Free Mental Health Self-Checks',
    lede: 'Seven short reflections covering anxiety, low mood, self-esteem, work strain, life satisfaction and flourishing. Two to four minutes each, all free, and none of your answers are stored anywhere.',
    heroNote: 'These are reflection tools, not diagnoses. Your answers never leave your browser.',
    body: `<h2>Pick the one that fits</h2>
    <p>Each of these is a brief, well-established reflection scale. They give you a band and a plain-English reading, not a label &mdash; and they are most useful as a starting point for a conversation, whether that is with a counsellor or with someone who cares about you.</p>
    <div class="cta-box" id="checks">
      <h3>All seven checks</h3>
      <p>No sign-up, no email, nothing saved. Start wherever your question is.</p>
      <div class="ll-check-row" style="justify-content:center">
        <button type="button" class="ll-check-btn" data-ll-open="phq4Anxiety">Anxiety &amp; low mood &middot; 2 min</button>
        <button type="button" class="ll-check-btn" data-ll-open="gad7">Anxiety, GAD-7 &middot; 3 min</button>
        <button type="button" class="ll-check-btn" data-ll-open="phq4Mood">Low mood &middot; 2 min</button>
        <button type="button" class="ll-check-btn" data-ll-open="selfEsteem">Self-esteem &middot; 3 min</button>
        <button type="button" class="ll-check-btn" data-ll-open="workStress">Work / study stress &middot; 4 min</button>
        <button type="button" class="ll-check-btn" data-ll-open="lifeSat">Life satisfaction &middot; 2 min</button>
        <button type="button" class="ll-check-btn" data-ll-open="flourishing">Flourishing &middot; 3 min</button>
      </div>
      ${NOT_A_DIAGNOSIS}
    </div>

    ${CRISIS}

    <h2>What each one is for</h2>
    <p>They overlap a little, which is deliberate &mdash; the same difficulty shows up differently depending on what you ask about.</p>
    <div class="concerns">
      <div class="concern"><div class="ic">&#128172;</div><b>PHQ-4 &middot; anxiety and low mood</b><p>Four questions, the quickest useful read. Gives a total out of 12 plus separate anxiety and low-mood subscores. Start here if you are not sure which applies.</p></div>
      <div class="concern"><div class="ic">&#128163;</div><b>GAD-7 &middot; anxiety</b><p>Seven questions, the standard brief anxiety scale. Use it if worry is the loud part &mdash; racing thoughts, restlessness, dread that will not switch off. <a href="free-anxiety-test.html">Full page</a>.</p></div>
      <div class="concern"><div class="ic">&#127783;</div><b>PHQ-4 &middot; low mood</b><p>The same four items read for the mood side. Use it if things have gone flat rather than frightening. <a href="free-depression-test.html">Full page</a>.</p></div>
      <div class="concern"><div class="ic">&#129746;</div><b>Rosenberg &middot; self-esteem</b><p>Ten statements about how you currently see yourself. Useful when comparison and self-criticism are shaping what you let yourself attempt. <a href="self-esteem-test.html">Full page</a>.</p></div>
      <div class="concern"><div class="ic">&#128293;</div><b>Workplace strain</b><p>Ten questions across workload, control, clarity, support and recovery. For working professionals and students carrying a heavy load. <a href="work-stress-burnout-test.html">Full page</a>.</p></div>
      <div class="concern"><div class="ic">&#127793;</div><b>Life satisfaction &amp; flourishing</b><p>Two broader reflections on how life is going overall &mdash; meaning, relationships, competence, optimism. Less about symptoms, more about direction.</p></div>
    </div>

    <h2>How to read any of these honestly</h2>
    <ul>
      <li><strong>They measure a window, not a person.</strong> Most ask about the last two weeks. A score taken in a bad fortnight is measuring the fortnight.</li>
      <li><strong>The band matters less than the effect.</strong> Whatever you score, the question worth answering is whether this is affecting your sleep, work, studies, relationships or decisions.</li>
      <li><strong>A low score is not proof you are fine.</strong> People under-report, particularly when they have got used to something. If you took the check because something felt wrong, that instinct is data too.</li>
      <li><strong>None of them diagnose.</strong> Not one. Diagnosis requires a proper assessment by a qualified clinician, and no questionnaire substitutes for that.</li>
    </ul>

    <h2>Your answers are not stored</h2>
    <p>This is worth being specific about, because most free tests online are lead-capture forms wearing a lab coat. There is no account here, no email field and no result saved. The check runs entirely in your browser and the answers are gone when you close the tab. Nothing is sent to us, and there is nothing for us to sell or lose.</p>
    <p>If you do choose to book a session afterwards, that is confidential too: nothing is reported to your parents, school, college or employer, and a first name is enough to book.</p>

    <h2 id="book">If a result makes you want to talk to someone</h2>
    ${PRICE}
    ${bookBox('Book a first session — &#8377;249', 'One 45-minute conversation. Bring the result if it helps, or leave it &mdash; either way you are talking to a person, not a score.', 'Hello Lume Live! I took a self-check and would like to book a session. 💛')}`,
    faq: [
      ['Are these mental health tests really free?', 'Yes, all seven. No sign-up, no email, no payment, no upsell to see your result. Nothing is stored &mdash; the checks run in your browser and your answers are gone when you close the tab.'],
      ['Can these tests diagnose a mental health condition?', 'No, and any site telling you otherwise is misleading you. These are screening and reflection scales. Diagnosis requires a proper assessment by a qualified clinician, which a questionnaire cannot substitute for.'],
      ['Which check should I start with?', 'If you are unsure, the PHQ-4 &mdash; it is four questions and covers both anxiety and low mood, so it points you toward whichever is louder. From there the GAD-7 goes deeper on anxiety, and the others cover self-esteem, work strain and general wellbeing.'],
      ['Are these the real scales or simplified versions?', 'The PHQ-4, GAD-7 and Rosenberg scale are the standard instruments. The workplace strain, life satisfaction and flourishing reflections are informed by established research domains rather than being formal administrations of any one instrument, and they are labelled that way in the tool.'],
      ['I am under 18. Can I take these?', 'Yes, all of them, without anyone else needing to know. A paid session needs parent or guardian consent if you are under 18. Tele-MANAS on 14416 is free, confidential and available to under-18s without parental consent.'],
      ['What if my result worries me?', 'A result is information, not a verdict, and every one of these conditions responds to support. One confidential conversation is a reasonable next step. If you are in immediate distress or having thoughts of self-harm, call Tele-MANAS on 14416 today rather than waiting.'],
    ],
  },

];
