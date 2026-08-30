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

const PRICE = `<p>A session is a private 1:1 conversation with Sachin Bajaj, who has an M.Sc in Clinical Psychology from Gurugram University and a PGDGC from Jamia Millia Islamia. It’s <strong>&#8377;499 for 45 minutes, and &#8377;249 for your first</strong> with the code FIRST50.</p>
    <p><strong>Nothing goes to your parents, school, college or employer.</strong> A first name is enough to book. For most people that turns out to matter more than the price.</p>`;

export const SCREENERS = [
  {
    slug: 'free-depression-test.html',
    heroCard: 'Flat is not the same as sad, and it is much easier to miss. That is what this check is for.',
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
    <p>Four questions, covering low mood and anxiety over the past two weeks. Answer for how the fortnight really went, not how you feel it ought to have gone. There’s nobody here you need to reassure.</p>
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
      ['b1', '0&ndash;2 &middot; normal range', 'Low mood isn’t weighing much on you right now. Worth checking again if things change.'],
      ['b2', '3&ndash;5 &middot; mild range', 'Present but generally manageable. Often responds to sleep, routine, movement and having someone to talk to.'],
      ['b3', '6&ndash;8 &middot; moderate range', 'Likely costing you something &mdash; energy, interest, concentration. A sensible point to get support rather than wait it out.'],
      ['b4', '9&ndash;12 &middot; severe range', 'A heavy load to be carrying alone. Professional support is genuinely worth arranging now.'],
    ])}
    <div class="note">A subscore of <strong>3 or more</strong> on either half is the signal worth paying attention to, especially if it has been there for weeks. And a more useful question than the number: <strong>have things you used to enjoy gone flat?</strong> Loss of interest is often the earliest honest sign, and it shows up before anyone would call themselves depressed.</div>

    <h2>Low mood, sadness, and depression aren’t the same thing</h2>
    <p>Sadness has something attached to it. Something happened, you feel it, it shifts. Low mood is flatter and attached to nothing in particular. Things that should land just don’t. Depression, clinically, is a lasting version of that with other things alongside it: sleep and appetite change, interest drains away, concentrating gets hard, your body feels heavy, and there’s often a running commentary about yourself you’d never accept from anyone else.</p>
    <p>No questionnaire can tell you which of those you have. What it can tell you is whether the last two weeks were heavier than you’ve been letting on. That’s worth knowing.</p>

    <h2>Why the two-week window matters</h2>
    <p>The PHQ-4 asks about a fortnight, not your life. Mood moves. Take it the week after a result, a breakup or a bad run at work and it’s measuring that week, which is exactly what it’s for. A snapshot of load. Not a description of you, and not a label you’re stuck with now.</p>
    <p>If you’re unsure, take it again in a fortnight and see whether the picture holds. A pattern tells you far more than one result ever will.</p>

    <h2 id="helps">What actually helps</h2>
    <p>None of this replaces support, but all of it’s worth doing while you decide:</p>
    <ul>
      <li><strong>Move first, feel like it later.</strong> Low mood takes motivation before it takes energy, so waiting until you feel like doing something means waiting a very long time. Doing the small thing badly lifts mood more than resting does.</li>
      <li><strong>Protect sleep, but don’t over-sleep.</strong> Both too little and much too much make low mood worse. A consistent wake time does more than a consistent bedtime.</li>
      <li><strong>Get outside early.</strong> Twenty minutes of morning light is one of the few free interventions with a real effect on mood and sleep timing.</li>
      <li><strong>Keep one social contact you can’t cancel.</strong> Withdrawal is the mechanism by which low mood maintains itself; one fixed commitment interrupts it.</li>
      <li><strong>Catch the commentary.</strong> Low mood is very good at dressing up harsh opinions as plain observations. Write one down, read it back a day later, and it usually gives itself away.</li>
    </ul>

    <h2>When self-help isn’t enough</h2>
    <p>All of that works reasonably well while you can still get some distance from how you feel. It works less well once the flatness has run for weeks, once you’re pulling out of things you used to manage without thinking, or once you’ve started treating yourself as the problem instead of someone who has one.</p>
    <p>That’s the stage where talking to someone qualified stops being an overreaction and starts being the quicker route. Not because you’re broken. Because low mood is very hard to see straight from the inside.</p>

    <h2 id="book">Talking to someone about it</h2>
    ${PRICE}
    ${bookBox('Book a first session — &#8377;249', 'One 45-minute conversation. Pick your own slot and get the invite immediately. No package, no commitment to a course of treatment.', 'Hello Lume Live! I took the low mood self-check and would like to book a session. 💛')}`,
    faq: [
      ['Is this depression test free?', 'Completely. No sign-up, no email, no payment. Your answers aren’t stored, sent or seen by anyone &mdash; they stay in your browser for the length of the check and are gone when you close the tab.'],
      ['Does this test diagnose depression?', 'No. The PHQ-4 is a brief screening and reflection scale, not a diagnostic instrument. It tells you roughly how heavy the last fortnight has been. Only a qualified clinician can diagnose depression, and that takes a proper assessment rather than four questions.'],
      ['What is the PHQ-4?', 'A four-item version of the widely used Patient Health Questionnaire, combining two anxiety items and two low-mood items. Each scores 0&ndash;3, giving a total out of 12 plus two subscores out of 6.'],
      ['What score means I should get help?', 'There is no cut-off that decides for you. Broadly, 0&ndash;2 is normal, 3&ndash;5 mild, 6&ndash;8 moderate and 9&ndash;12 severe, and a subscore of 3 or more on either half is worth attention. But if mood is affecting your sleep, work, studies or relationships, that’s worth talking about whatever you scored.'],
      ['Is it anonymous?', 'Yes. No name, email or phone number to take it, and nothing recorded. If you later book a session, a first name is enough.'],
      ['I scored in the severe range. What now?', 'A high score is information, not a verdict &mdash; low mood responds well to support. A sensible next step is one confidential conversation with someone qualified. If you’re having thoughts of harming yourself, call Tele-MANAS on 14416 today rather than waiting for a session.'],
    ],
  },
  {
    slug: 'work-stress-burnout-test.html',
    heroCard: 'Burnout tells you that you have got bad at your job. Usually you have just run out of road.',
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
    lede: 'Ten questions about workload, control, support and recovery. Four minutes. An honest read on how much strain you’re actually carrying &mdash; no sign-up, no email, nothing saved.',
    heroNote: 'This is a reflection tool, not a diagnosis. Your answers never leave your browser.',
    body: `<h2>Take the check</h2>
    <p>Ten questions drawn from the areas workplace stress research keeps coming back to: how much is being asked, how much say you have, how clear it is, what support there is, whether effort gets noticed, and whether you ever recover. It covers your last two weeks at work or in class.</p>
    <div class="cta-box" id="test">
      <h3>Free work strain self-check</h3>
      <p>10 questions &middot; about 4 minutes &middot; no sign-up, nothing stored</p>
      <div class="cta-row"><button type="button" class="btn" data-ll-open="workStress">Start the check</button></div>
      <p class="ll-check-note" style="margin-top:14px">Also useful: the <button type="button" class="linkish" data-ll-open="phq4Anxiety">2-minute anxiety and low mood check</button>, if the strain has started following you home.</p>
    </div>

    ${CRISIS}

    <h2>What your score means</h2>
    <p>Every item scores 0 to 3, so 30 in total. These bands describe load, not diagnosis. Burnout isn’t a clinical diagnosis the way an anxiety disorder is, and this check doesn’t pretend otherwise.</p>
    ${bands([
      ['b1', '0&ndash;8 &middot; lower strain', 'Demands and recovery are roughly in balance. Worth re-checking after a heavy quarter.'],
      ['b2', '9&ndash;15 &middot; moderate strain', 'Real load, still absorbable. This is the band where small changes to boundaries and recovery pay off most.'],
      ['b3', '16&ndash;22 &middot; high strain', 'Demands are outrunning your capacity to recover. Worth treating as a problem to solve rather than a season to survive.'],
      ['b4', '23&ndash;30 &middot; very high strain', 'A load at this level reliably damages sleep, health and relationships if it continues. Support is warranted.'],
    ])}
    <div class="note">The single most predictive item isn’t workload &mdash; it is <strong>control</strong>. People handle astonishing volumes of work when they have some say over how it gets done, and much smaller volumes when they don’t. If your high scores cluster around control, clarity and support rather than hours, that tells you where the actual problem is.</div>

    <h2>Stress, strain and burnout are three different things</h2>
    <p><strong>Stress</strong> is just the response to a demand, and there’s nothing wrong with it. It rises, you meet the thing, it drops again. <strong>Strain</strong> is what piles up when that cycle stops finishing. Demand stays high, recovery never arrives, and your baseline creeps upward.</p>
    <p><strong>Burnout</strong> is where long strain ends up, and it has a shape you can recognise. Tiredness sleep won’t touch. Creeping cynicism about work you genuinely used to care about. And a growing sense that you’re getting worse at it. That last part is the cruel one. Burnout convinces you that you’ve become bad at your job, when what really happened is that you ran out of road.</p>

    <h2 id="helps">What actually helps</h2>
    <p>Nearly all burnout advice is aimed at you personally, because you’re the one reading it. Let’s be honest that a lot of workplace strain is structural, and no breathing exercise has ever fixed an impossible workload. With that said:</p>
    <ul>
      <li><strong>Guard recovery, not just rest.</strong> Scrolling isn’t recovery. Recovery is whatever actually takes your attention somewhere else. Exercise, a craft, another person, something you do with your hands.</li>
      <li><strong>Find the edge you can move.</strong> The workload may not be yours to change, but something usually is. The order you do things in. One recurring meeting. When you answer messages. Getting even a little control back shifts the strain more than it should.</li>
      <li><strong>Write down the invisible work.</strong> A lot of strain comes from effort nobody counted, including you. Listing what you really did in a week is often the quickest way to understand why you’re so tired.</li>
      <li><strong>Put a wall somewhere.</strong> If work can reach you at any hour then no hour is really off. One window a day where you’re genuinely unreachable does more good than a longer holiday.</li>
      <li><strong>Say it out loud to someone.</strong> A manager, a mentor, a counsellor. Strain kept private gets blamed on the person carrying it, usually by the person carrying it.</li>
    </ul>

    <h2>When it’s worth talking to someone</h2>
    <p>When the strain starts following you home, it’s no longer a problem you can solve at work. Sleep goes. Sunday evenings get heavy. You lose patience with people who deserve better. It’s also, unhelpfully, the exact stage where most people decide to just get through it, which is how one hard quarter turns into a hard year.</p>
    <p>If you’re weighing up a bigger change, the <a href="for-working-professionals.html">Lume Lens working profile</a> looks at direction instead of strain. Different question, different tool. Worth knowing which one you’re actually asking.</p>

    <h2 id="book">Talking to someone about it</h2>
    ${PRICE}
    ${bookBox('Book a first session — &#8377;249', 'One 45-minute conversation about the load and what would realistically change it. Pick your own slot, get the invite immediately.', 'Hello Lume Live! I took the work stress check and would like to book a session. 💛')}`,
    faq: [
      ['Is this burnout test free?', 'Completely. No sign-up, no email, no payment. Your answers aren’t stored, sent or seen by anyone &mdash; they stay in your browser and are gone when you close the tab.'],
      ['Is burnout a medical diagnosis?', 'Not in the way an anxiety disorder is. The WHO classifies burnout as an occupational phenomenon rather than a medical condition. That doesn’t make it less real, but it does mean no questionnaire can diagnose it &mdash; this check measures strain, which is the useful part.'],
      ['Will my employer see this?', 'No. There is no account, no email and nothing recorded. If you later book a session, that’s confidential too &mdash; nothing is reported to your employer, and you can book using a first name only.'],
      ['My workload is genuinely impossible. Can counselling help with that?', 'It can’t change your workload, and anyone promising otherwise is selling something. What it can help with is the part you do control: boundaries, how you’re reading the situation, what you want to ask for, and whether staying is the right call. Sometimes the honest answer is that the job is the problem.'],
      ['Is this the same as a career change assessment?', 'No. This measures strain. If the question is direction rather than load, the Lume Lens working profile is built for that, and the two are worth keeping separate.'],
      ['I scored in the very high band. What now?', 'Treat it as information about load, not about your capability. One confidential conversation is a reasonable next step. If exhaustion has tipped into hopelessness or thoughts of self-harm, call Tele-MANAS on 14416 today.'],
    ],
  },

  {
    slug: 'self-esteem-test.html',
    heroCard: 'Achievement doesn’t fix low self-esteem. People who have plenty of the first still score low here.',
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
    <p>Ten statements to agree or disagree with, from the Rosenberg scale. Answer for how you’ve felt about yourself lately, not how you’d like to feel. Half are worded positively and half negatively on purpose, which makes it harder to skew the result without noticing you’re doing it.</p>
    <div class="cta-box" id="test">
      <h3>Free self-esteem self-check</h3>
      <p>10 statements &middot; about 3 minutes &middot; no sign-up, nothing stored</p>
      <div class="cta-row"><button type="button" class="btn" data-ll-open="selfEsteem">Start the check</button></div>
      <p class="ll-check-note" style="margin-top:14px">If low self-worth comes with a flat mood, the <button type="button" class="linkish" data-ll-open="phq4Mood">2-minute low mood check</button> is worth taking too.</p>
    </div>

    ${CRISIS}

    <h2>What your score means</h2>
    <p>Items score 0 to 3, the negative ones reversed, for 30 in total.</p>
    ${bands([
      ['b4', '0&ndash;14 &middot; lower range', 'Self-criticism is loud right now. This band usually reflects a rough patch rather than something fixed about you, and it’s the one that most narrows what people let themselves try.'],
      ['b2', '15&ndash;25 &middot; typical range', 'A workable view of yourself, with the ordinary doubts nearly everyone carries. Have a look at which particular items you marked low.'],
      ['b1', '26&ndash;30 &middot; higher range', 'Steady and positive. Only worth double-checking that it’s real, and not a habit of answering the way you think you ought to.'],
    ])}
    <div class="note">Read this one as a <strong>snapshot, not a trait</strong>. Self-esteem moves with context far more than people expect &mdash; a bad result, a rejection, a period of comparison, or simply being tired can shift a score by several points. What matters isn’t today’s number but whether a low view of yourself is quietly deciding things: what you apply for, who you ask, what you think you’re allowed to want.</div>

    <h2>Confidence and self-esteem are different</h2>
    <p>Confidence is about specific things, and it runs on evidence. You’re confident at something because you’ve done it before. Practice raises it, and having heaps in one area and none at all in another is completely normal.</p>
    <p>Self-esteem is the quieter judgment underneath: whether you’re basically alright as a person. Achievement barely moves it, which is why people who have achieved a great deal often score low here and are honestly baffled that it didn’t help. Piling accomplishments onto low self-esteem is pouring water into a leaking bucket. The leak is the problem.</p>

    <h2>The comparison problem, specifically in India</h2>
    <p>Self-worth gets pinned early to a short list of visible markers. Marks. Rank. Which college. Which company. What the extended family has heard. A child learns that they <em>are</em> the number, and keeps running that arithmetic long after school finishes.</p>
    <p>What comes out of that is a low self-esteem that doesn’t look distressed at all. It looks like coping. Working hard, meeting expectations, and privately believing none of it counts. Cousins and classmates keep the scoreboard updated in real time, and social media supplies an endless feed of edited people to lose against. If that’s the shape of yours, more achievement won’t fix it.</p>

    <h2 id="helps">What actually helps</h2>
    <ul>
      <li><strong>Split the event from the verdict.</strong> "I did badly in that paper" is an event. "I’m not good enough" is a verdict that slipped in behind it. Write both lines down and you can see the join.</li>
      <li><strong>Notice who you pick to compare against.</strong> Low self-esteem chooses carefully. Always upward, always on the one measure where you come off worst. Just naming that pattern takes a surprising amount of the sting out.</li>
      <li><strong>Collect the counter-evidence.</strong> A harsh view of yourself filters your memory. It keeps the failures and quietly bins everything else. Writing down what went fine, as it happens, builds a record the filter can’t get at afterwards.</li>
      <li><strong>Act before you feel worthy of it.</strong> Waiting to feel confident before you apply, ask or try means waiting forever. Self-esteem tends to follow action, not lead it.</li>
      <li><strong>Listen to how you talk to yourself.</strong> If you’d never say it to a friend in the same spot, it isn’t an accurate observation. It’s a habit.</li>
    </ul>

    <h2>When it’s worth talking to someone</h2>
    <p>Self-criticism loses a lot of its power when you say it out loud to someone who doesn’t agree with it. That’s most of what helps, and it’s nearly impossible alone, because with low self-esteem the judge and the defendant are the same person.</p>
    <p>It matters most when a low view of yourself has started making your decisions. Picking the smaller course. Not applying. Staying in something that’s going badly because part of you thinks it’s what you deserve.</p>

    <h2 id="book">Talking to someone about it</h2>
    ${PRICE}
    ${bookBox('Book a first session — &#8377;249', 'One 45-minute conversation. No advice about believing in yourself &mdash; just a careful look at where the harsh view came from and what it is costing you.', 'Hello Lume Live! I took the self-esteem check and would like to book a session. 💛')}`,
    faq: [
      ['Is this self-esteem test free?', 'Completely. No sign-up, no email, no payment, and nothing is stored &mdash; your answers stay in your browser and are gone when you close the tab.'],
      ['What is the Rosenberg self-esteem scale?', 'A ten-item scale developed by sociologist Morris Rosenberg and one of the most widely used measures of global self-worth. Five items are worded positively and five negatively, and the negative ones are reverse-scored.'],
      ['Does a low score mean something is wrong with me?', 'No. It means self-criticism is currently loud, which is a state rather than a fact about your worth. Scores move with circumstances &mdash; the same person can land in different bands in different months.'],
      ['Can self-esteem actually change?', 'Yes, though not by being told to think positively. It shifts through repeatedly noticing the gap between the verdicts you pass on yourself and what actually happened, which is slow but reliable and is much of what counselling for this involves.'],
      ['Will anyone find out I took this?', 'No. There is no account, no email and nothing recorded. If you later book a session, that’s confidential too and a first name is enough.'],
      ['I scored very low. What now?', 'A low score is worth taking seriously but not as a judgment &mdash; it is the band where people most often let a harsh self-view make decisions for them. One confidential conversation is a reasonable next step. If you’re having thoughts of harming yourself, call Tele-MANAS on 14416 today.'],
    ],
  },

  {
    slug: 'wellbeing-check.html',
    heroCard: 'No account, no email, no saved result. Most free tests online are lead-capture forms in a lab coat.',
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
    <p>Each one is a short, well-established reflection scale. You get a band and a plain-English reading, not a label. They work best as the start of a conversation, whether that turns out to be with a counsellor or just with someone who cares about you.</p>
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
    <p>They overlap a bit on purpose. The same difficulty looks different depending on what you ask about it.</p>
    <div class="concerns">
      <div class="concern"><div class="ic">&#128172;</div><b>PHQ-4 &middot; anxiety and low mood</b><p>Four questions, the fastest useful read. Total out of 12, plus separate anxiety and low-mood subscores. Start here if you can’t tell which one applies to you.</p></div>
      <div class="concern"><div class="ic">&#128163;</div><b>GAD-7 &middot; anxiety</b><p>Seven questions, the standard short anxiety scale. Use it when worry is the loud part: racing thoughts, restlessness, dread that won’t switch off. <a href="free-anxiety-test.html">Full page</a>.</p></div>
      <div class="concern"><div class="ic">&#127783;</div><b>PHQ-4 &middot; low mood</b><p>The same four items, read for the mood side. Use it when things have gone flat rather than frightening. <a href="free-depression-test.html">Full page</a>.</p></div>
      <div class="concern"><div class="ic">&#129746;</div><b>Rosenberg &middot; self-esteem</b><p>Ten statements about how you see yourself lately. Useful when comparison and self-criticism have started shaping what you let yourself try. <a href="self-esteem-test.html">Full page</a>.</p></div>
      <div class="concern"><div class="ic">&#128293;</div><b>Workplace strain</b><p>Ten questions on workload, control, clarity, support and recovery. For anyone carrying a heavy load at work or in class. <a href="work-stress-burnout-test.html">Full page</a>.</p></div>
      <div class="concern"><div class="ic">&#127793;</div><b>Life satisfaction &amp; flourishing</b><p>Two wider reflections on how life is going: meaning, relationships, feeling capable, feeling hopeful. Less about symptoms, more about direction.</p></div>
    </div>

    <h2>How to read any of these honestly</h2>
    <ul>
      <li><strong>They measure a window, not a person.</strong> Most ask about the last fortnight. A score taken in a bad fortnight is measuring the fortnight.</li>
      <li><strong>The band matters less than the effect.</strong> Whatever you score, the real question is whether this is getting into your sleep, work, studies, relationships or decisions.</li>
      <li><strong>A low score isn’t proof you’re fine.</strong> People under-report, especially once they’ve got used to something. If you opened the check because something felt off, that instinct counts as evidence too.</li>
      <li><strong>None of them diagnose.</strong> Not one. That takes a proper assessment by a qualified clinician, and no questionnaire stands in for it.</li>
    </ul>

    <h2>Your answers aren’t stored</h2>
    <p>Worth being specific about this, because most free tests online are lead-capture forms in a lab coat. No account here, no email field, no saved result. The check runs entirely in your browser and your answers go when the tab does. Nothing reaches us, so there’s nothing for us to sell, leak or lose.</p>
    <p>If you do go on to book a session, that’s private too. Nothing goes to your parents, school, college or employer, and a first name is enough.</p>

    <h2 id="book">If a result makes you want to talk to someone</h2>
    ${PRICE}
    ${bookBox('Book a first session — &#8377;249', 'One 45-minute conversation. Bring the result if it helps, or leave it &mdash; either way you’re talking to a person, not a score.', 'Hello Lume Live! I took a self-check and would like to book a session. 💛')}`,
    faq: [
      ['Are these mental health tests really free?', 'Yes, all seven. No sign-up, no email, no payment, no upsell to see your result. Nothing is stored &mdash; the checks run in your browser and your answers are gone when you close the tab.'],
      ['Can these tests diagnose a mental health condition?', 'No, and any site telling you otherwise is misleading you. These are screening and reflection scales. Diagnosis requires a proper assessment by a qualified clinician, which a questionnaire can’t substitute for.'],
      ['Which check should I start with?', 'If you’re unsure, the PHQ-4 &mdash; it is four questions and covers both anxiety and low mood, so it points you toward whichever is louder. From there the GAD-7 goes deeper on anxiety, and the others cover self-esteem, work strain and general wellbeing.'],
      ['Are these the real scales or simplified versions?', 'The PHQ-4, GAD-7 and Rosenberg scale are the standard instruments. The workplace strain, life satisfaction and flourishing reflections are informed by established research domains rather than being formal administrations of any one instrument, and they’re labelled that way in the tool.'],
      ['I am under 18. Can I take these?', 'Yes, all of them, without anyone else needing to know. A paid session needs parent or guardian consent if you’re under 18. Tele-MANAS on 14416 is free, confidential and available to under-18s without parental consent.'],
      ['What if my result worries me?', 'A result is information, not a verdict, and every one of these conditions responds to support. One confidential conversation is a reasonable next step. If you’re in immediate distress or having thoughts of self-harm, call Tele-MANAS on 14416 today rather than waiting.'],
    ],
  },

];
