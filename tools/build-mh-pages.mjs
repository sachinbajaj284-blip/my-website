#!/usr/bin/env node
/**
 * build-mh-pages.mjs — write the mental health landing pages.
 *
 *   node tools/build-mh-pages.mjs           # write every page
 *   node tools/build-mh-pages.mjs --check   # exit 1 if any file on disk is stale
 *
 * Content lives in mh-screeners.mjs and mh-cities.mjs; the shell lives in mh-pages.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { page, faqNode, crumbNode, toolNode, esc, CRISIS, ROOT, SITE } from './mh-pages.mjs';
import { SCREENERS } from './mh-screeners.mjs';
import { CITIES } from './mh-cities.mjs';

const HUB = 'mental-health-counselling.html';
const CHECK = process.argv.includes('--check');

/* ── screener pages ────────────────────────────────────────────────────── */
function buildScreener(s) {
  const related = [
    ['wellbeing-check.html', 'All seven free self-checks'],
    ['free-anxiety-test.html', 'Free anxiety test (GAD-7)'],
    ['free-depression-test.html', 'Free depression self-check (PHQ-4)'],
    ['self-esteem-test.html', 'Free self-esteem check'],
    ['work-stress-burnout-test.html', 'Free burnout &amp; work stress check'],
    ['exam-stress-test.html', 'Free exam stress check'],
    [HUB, 'Online mental health counselling in India'],
  ].filter(r => r[0] !== s.slug).slice(0, 6);

  return page({
    slug: s.slug, title: s.title, desc: s.desc, keywords: s.keywords,
    ogTitle: s.ogTitle, ogDesc: s.ogDesc,
    graph: [
      toolNode(s.slug, s.toolName, s.toolDesc),
      crumbNode(s.slug, [
        ['Home', `${SITE}/`],
        ['Mental Health Counselling', `${SITE}/${HUB}`],
        [s.h1.replace(/&amp;/g, '&'), `${SITE}/${s.slug}`],
      ]),
      faqNode(s.slug, s.faq),
    ],
    nav: [
      ['index.html', 'Home'],
      [HUB, 'Counselling'],
      ['wellbeing-check.html', 'All Checks'],
      ['student-mental-health-india.html', 'Student Guide'],
    ],
    waNav: 'Hello Lume Live! I took a self-check and would like to talk.',
    kicker: s.kicker, h1: s.h1, lede: s.lede, heroNote: s.heroNote,
    heroCard: s.heroCard || 'You don’t have to be in crisis to talk to someone. Most people who book are just tired of carrying it alone.',
    actions: [
      `        <button type="button" class="btn" data-ll-open="${s.check}">${s.menu ? 'Choose a check' : 'Start the check'} &rarr;</button>`,
      `        <a class="btn secondary" href="#book">Book a &#8377;249 first session</a>`,
    ],
    crumb: `<a href="index.html">Home</a> &rsaquo; <a href="${HUB}">Mental Health Counselling</a> &rsaquo; ${esc(s.h1.replace(/&amp;/g, '&'))}`,
    body: s.body, faq: s.faq, related,
    stickyCheck: s.check,
  });
}

/* ── city pages ────────────────────────────────────────────────────────── */
function buildCity(c) {
  const related = [
    [HUB, 'Online mental health counselling in India'],
    ['wellbeing-check.html', 'Free mental health self-checks'],
    ['free-anxiety-test.html', 'Free anxiety test (GAD-7)'],
    ['exam-stress-test.html', 'Free exam stress check'],
    ...(c.careerPage ? [[c.careerPage, `Career counselling in ${c.city}`]] : []),
    ['student-mental-health-india.html', 'Student mental health in India'],
    ['for-parents.html', 'For parents: spotting the signs early'],
  ];

  /* Every city page links to every other one. Without this each hangs off a single
     link from the hub, which isn’t enough for any of them to be found. */
  const others = CITIES.filter(o => o.slug !== c.slug)
    .map(o => `<a href="${o.slug}">${o.city}</a>`)
    .concat('<a href="mental-health-counselling-rohtak.html">Rohtak</a>')
    .join(' &middot;\n      ');

  const body = `<h2>Talking to someone qualified in ${c.city} &mdash; without the awkwardness</h2>
    ${c.pressure}

    <div class="cta-box" id="checks">
      <h3>Not sure it’s worth a session?</h3>
      <p>Try a free self-check first. Two minutes, no sign-up, nothing saved.</p>
      <div class="ll-check-row" style="justify-content:center">
        <button type="button" class="ll-check-btn" data-ll-open="phq4Anxiety">Anxiety &amp; low mood &middot; 2 min</button>
        <button type="button" class="ll-check-btn" data-ll-open="wellbeingMenu">More checks</button>
      </div>
      <p class="ll-check-note" style="margin-top:14px">It’s a reflection tool, not a diagnosis. Your answers never leave your browser.</p>
    </div>

    ${CRISIS}

    <h2 id="concerns">What counselling in ${c.city} can help with</h2>
    <p>These are the things people in ${c.city} bring to a first session most often. You don’t need a diagnosis to book one, and you don’t need a crisis. "Something feels off and I can’t explain it" is a perfectly good place to start.</p>
    <div class="concerns">
${c.concerns.map(([ic, b, p]) => `      <div class="concern"><div class="ic">${ic}</div><b>${b}</b><p>${p}</p></div>`).join('\n')}
    </div>

    <h2>What is already available in ${c.city}, and what’s missing</h2>
    <div class="local">
${c.why.split('\n').map(l => '    ' + l.trim()).join('\n')}
    </div>

    <h2>Confidential means confidential</h2>
    <p>Price isn’t what stops most people in ${c.city} from booking. It’s the worry that someone will find out. So, plainly:</p>
    <ul>
      <li><strong>Nothing goes to your parents, school, college or employer.</strong> No report, no summary, not even confirmation that you turned up.</li>
      <li><strong>A first name is enough to book.</strong> You don’t owe us your full name, and you don’t have to explain yourself in advance.</li>
      <li><strong>The self-checks store nothing.</strong> Your answers sit in your browser and vanish when you close the tab.</li>
      <li><strong>Sessions are online.</strong> No waiting room, nobody to bump into.</li>
    </ul>
    <div class="note">One limit, and every counsellor anywhere works under the same one: if your life or someone else’s is at serious risk, your counsellor will talk to you about bringing in someone who can keep you safe. With you, not behind your back.</div>

    <h2>Who you’ll be talking to</h2>
    <p>Sachin Bajaj has an M.Sc in Clinical Psychology from Gurugram University and a PGDGC from Jamia Millia Islamia, and has worked with more than 500 students and families across India. You get the same counsellor every session. No app shuffling you between strangers who each need the story from the top.</p>
    <div class="credentials">
      <div class="cred"><div class="ic">&#127891;</div><b>M.Sc</b><span>Clinical Psychology, Gurugram University</span></div>
      <div class="cred"><div class="ic">&#128220;</div><b>PGDGC</b><span>Jamia Millia Islamia, New Delhi</span></div>
      <div class="cred"><div class="ic">&#129309;</div><b>500+</b><span>Students &amp; families supported</span></div>
      <div class="cred"><div class="ic">&#128483;</div><b>&#2361;&#2367;&#2306;&#2342;&#2368; + EN</b><span>Whichever you think in</span></div>
    </div>

    <h2>What this is, and what it isn’t</h2>
    <p>It’s counselling support, not treatment: confidential conversations about what you’re carrying and what might help. We don’t diagnose conditions and we don’t prescribe medication, and this isn’t an emergency service. If what you describe needs a psychiatrist, your counsellor will tell you so in the first session and help you find one. You won’t be sold a package instead.</p>

    <h2 id="book">What a session costs in ${c.city}</h2>
    <p><strong>&#8377;499 for 45 minutes</strong>, and your <strong>first one is &#8377;249</strong> with the code <strong>FIRST50</strong>. Private counselling in India usually runs &#8377;1,500 to &#8377;3,000 a session. You’re not signing up for a course of treatment here. You’re booking one conversation, and you can stop after it.</p>
    <div class="cta-box">
      <h3>Book a first session &mdash; &#8377;249</h3>
      <p>Pick a slot from the live calendar and the video-call invite arrives straight away. Video, voice or chat, whichever suits you.</p>
      <div class="cta-row">
        <a class="btn" href="book-session.html">Pick a slot &rarr;</a>
        <a class="btn wa" href="https://wa.me/917015671280?text=${encodeURIComponent(`Hello Lume Live! I would like to book a mental health session in ${c.city}. 💛`)}" target="_blank" rel="noopener">Ask on WhatsApp</a>
      </div>
    </div>

    <h2>Counselling in other cities</h2>
    <p>Everything runs online, so what changes between these pages is the local picture, not the counsellor.</p>
    <p class="citylist">
      ${others}
    </p>`;

  return page({
    slug: c.slug,
    title: `Mental Health Counselling in ${c.city} | Lume Live`,
    desc: `Confidential online mental health counselling in ${c.city} by an M.Sc Clinical Psychologist. Anxiety, stress, low mood, burnout. Free self-check, first session ₹249.`,
    keywords: `mental health counselling ${c.city}, counsellor in ${c.city}, psychologist ${c.city}, online therapy ${c.city}, anxiety counselling ${c.city}, student counselling ${c.city}, affordable counselling ${c.city}`,
    ogTitle: `Mental Health Counselling in ${c.city} — Lume Live`,
    ogDesc: `Confidential 1:1 online counselling in ${c.city} with an M.Sc Clinical Psychologist. Take a free, private self-check first. First session ₹249.`,
    geo: { region: c.region, place: `${c.city}, ${c.state}`.replace(/&amp;/g, '&') },
    graph: [
      {
        '@type': 'ProfessionalService',
        '@id': `${SITE}/${c.slug}#service`,
        name: `Lume Live Mental Health Counselling — ${c.city}`,
        url: `${SITE}/${c.slug}`,
        description: `Confidential, non-diagnostic online mental health counselling for ${c.city} by a counsellor with an M.Sc in Clinical Psychology. Support for anxiety, stress, low mood, burnout and self-esteem for students, parents and working professionals.`,
        image: `${SITE}/og/${c.slug.replace(/\.html$/, '')}.png`,
        logo: `${SITE}/logo.png`,
        telephone: '+91-7015671280',
        email: 'hello@lumelive.co.in',
        areaServed: { '@type': 'City', name: c.city },
        availableLanguage: ['en', 'hi'],
        priceRange: '₹249-₹499',
        provider: {
          '@type': 'Person', name: 'Sachin Bajaj',
          jobTitle: 'Career and Mental Health Counsellor',
          hasCredential: 'M.Sc Clinical Psychology (Gurugram University); PGDGC (Jamia Millia Islamia)',
        },
      },
      crumbNode(c.slug, [
        ['Home', `${SITE}/`],
        ['Mental Health Counselling', `${SITE}/${HUB}`],
        [`Mental Health Counselling in ${c.city}`, `${SITE}/${c.slug}`],
      ]),
      faqNode(c.slug, c.faq),
    ],
    nav: [
      ['index.html', 'Home'],
      [HUB, 'Counselling'],
      ['wellbeing-check.html', 'Free Checks'],
      ...(c.careerPage ? [[c.careerPage, `Careers ${c.city}`]] : [['for-parents.html', 'For Parents']]),
    ],
    waNav: `Hello Lume Live! I want to talk about mental health counselling in ${c.city}.`,
    kicker: `&#128205; ${c.city} &middot; Confidential &middot; Non-Diagnostic Support`,
    h1: `Mental Health Counselling in ${c.city}`,
    lede: c.lede, hindi: c.hindi,
    heroCard: c.heroCard || 'You don’t have to be in crisis to talk to someone.',
    actions: [
      `        <button type="button" class="btn" data-ll-open="phq4Anxiety">Take the free 2-minute check</button>`,
      `        <a class="btn secondary" href="#book">Book a &#8377;249 first session</a>`,
    ],
    heroNote: 'The check is free, anonymous and not stored &mdash; your answers never leave your browser.',
    crumb: `<a href="index.html">Home</a> &rsaquo; <a href="${HUB}">Mental Health Counselling</a> &rsaquo; ${c.city}`,
    body, faq: c.faq, related,
    stickyCheck: 'phq4Anxiety',
  });
}

/* ── write ─────────────────────────────────────────────────────────────── */
const out = [
  ...SCREENERS.map(s => [s.slug, buildScreener(s)]),
  ...CITIES.map(c => [c.slug, buildCity(c)]),
];

let stale = 0, wrote = 0;
for (const [slug, html] of out) {
  const file = path.join(ROOT, slug);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (prev === html) continue;
  if (CHECK) { console.error(`stale: ${slug}`); stale++; continue; }
  fs.writeFileSync(file, html);
  wrote++;
}
if (CHECK) {
  console.log(stale ? `${stale} page(s) stale — run node tools/build-mh-pages.mjs` : `all ${out.length} pages up to date`);
  process.exit(stale ? 1 : 0);
}
console.log(`wrote ${wrote} of ${out.length} mental health pages`);
