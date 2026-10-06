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
import { CONDITIONS } from './mh-conditions.mjs';
import { LANDINGS } from './mh-landings.mjs';

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
// Cities without a local career page point at the national one. Its links are
// labelled for India, not the city, so they don't promise a page that isn't there.
const careerIsNational = c => c.careerPage === 'online-career-counselling-india.html';

function buildCity(c) {
  const related = [
    [HUB, 'Online mental health counselling in India'],
    ['wellbeing-check.html', 'Free mental health self-checks'],
    ['free-anxiety-test.html', 'Free anxiety test (GAD-7)'],
    ['exam-stress-test.html', 'Free exam stress check'],
    ...(c.careerPage ? [[c.careerPage, careerIsNational(c) ? 'Online career counselling across India' : `Career counselling in ${c.city}`]] : []),
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
      ...(c.careerPage ? [[c.careerPage, careerIsNational(c) ? 'Careers' : `Careers ${c.city}`]] : [['for-parents.html', 'For Parents']]),
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

/* ── condition explainer pages ─────────────────────────────────────────── */
// A MedicalWebPage "about" a MedicalCondition is the honest schema for a page that
// explains a condition without claiming to diagnose or treat it.
const conditionNode = c => ({
  '@type': 'MedicalWebPage',
  '@id': `${SITE}/${c.slug}#webpage`,
  name: c.title.replace(/ \| Lume Live$/, ''),
  url: `${SITE}/${c.slug}`,
  description: c.desc,
  inLanguage: 'en-IN',
  about: { '@type': 'MedicalCondition', name: c.conditionName },
  lastReviewed: '2026-10-06',
  publisher: { '@type': 'Organization', name: 'Lume Live', url: `${SITE}/` },
});

const PRICE = `<p>A session is a private 1:1 conversation with Sachin Bajaj, who has an M.Sc in Clinical Psychology from Gurugram University and a PGDGC from Jamia Millia Islamia. It&rsquo;s <strong>&#8377;499 for 45 minutes, and &#8377;249 for your first</strong> with the code FIRST50.</p>
    <p><strong>Nothing goes to your parents, school, college or employer.</strong> A first name is enough to book. For most people that turns out to matter more than the price.</p>`;

const bookBox = (heading, blurb, waText) => `<div class="cta-box">
      <h3>${heading}</h3>
      <p>${blurb}</p>
      <div class="cta-row">
        <a class="btn" href="book-session.html">Pick a slot &rarr;</a>
        <a class="btn wa" href="https://wa.me/917015671280?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener">Ask on WhatsApp</a>
      </div>
    </div>`;

function buildCondition(c) {
  // Every condition page links to the other ones, so none hangs off a single link.
  const others = CONDITIONS.filter(o => o.slug !== c.slug)
    .map(o => `      <a href="${o.slug}">Understanding ${o.name} &rarr;</a>`)
    .join('\n');

  const related = [
    c.screener,
    ['wellbeing-check.html', 'All seven free self-checks'],
    [HUB, 'Online mental health counselling in India'],
    ['student-mental-health-india.html', 'Student mental health in India'],
    ['for-parents.html', 'For parents: spotting the signs early'],
    ['book-session.html', 'Book a &#8377;249 first session'],
  ];

  const body = `<h2>${c.whatH2}</h2>
    ${c.what}

    <div class="cta-box" id="check">
      <h3>${c.checkBox.heading}</h3>
      <p>${c.checkBox.blurb}</p>
      <div class="cta-row"><button type="button" class="btn" data-ll-open="${c.check}">${c.checkLabel}</button></div>
      <p class="ll-check-note" style="margin-top:14px">${c.checkBox.note}</p>
    </div>

    ${CRISIS}

    <h2>Signs to look for</h2>
    <p>${c.signsIntro}</p>
    <div class="concerns">
${c.signs.map(([ic, b, p]) => `      <div class="concern"><div class="ic">${ic}</div><b>${b}</b><p>${p}</p></div>`).join('\n')}
    </div>

    <h2>What causes it, and what keeps it going</h2>
    ${c.causes}

    <h2>What actually helps</h2>
    <p>None of this replaces proper support, but all of it is worth doing while you decide:</p>
    <ul>
${c.helps.map(([lead, rest]) => `      <li><strong>${lead}</strong> ${rest}</li>`).join('\n')}
    </ul>

    <h2 id="support">When to get support</h2>
    ${c.whenHelp}

    <h2>Common myths, cleared up</h2>
${c.myths.map(([m, t]) => `    <div class="faq-item"><h3>${m}</h3><p>${t}</p></div>`).join('\n')}

    <h2 id="book">Talking to someone about it</h2>
    <p>You don&rsquo;t need a diagnosis, a crisis or a tidy explanation to book a session. &ldquo;Something feels off and I can&rsquo;t explain it&rdquo; is a perfectly good place to start.</p>
    ${PRICE}
    ${bookBox(`Book a first session &mdash; &#8377;249`, 'One 45-minute conversation. Pick your own slot and get the invite immediately. Video, voice or chat &mdash; no package, no commitment to a course of treatment.', `Hello Lume Live! I would like to talk about ${c.conditionName.replace(/ \(.*\)/, '')}. 💛`)}

    <div class="note">This page is general information, not medical advice, and nothing here is a diagnosis. Lume Live offers non-diagnostic counselling support &mdash; we don&rsquo;t diagnose conditions or prescribe medication. If what you&rsquo;re describing needs a psychiatrist, your counsellor will say so and help you find one.</div>

    <h2>Other conditions, explained</h2>
    <div class="related">
${others}
    </div>`;

  return page({
    slug: c.slug, title: c.title, desc: c.desc, keywords: c.keywords,
    ogTitle: c.ogTitle, ogDesc: c.ogDesc,
    graph: [
      conditionNode(c),
      crumbNode(c.slug, [
        ['Home', `${SITE}/`],
        ['Mental Health Counselling', `${SITE}/${HUB}`],
        [`Understanding ${c.name.replace(/&amp;/g, '&')}`, `${SITE}/${c.slug}`],
      ]),
      faqNode(c.slug, c.faq),
    ],
    nav: [
      ['index.html', 'Home'],
      [HUB, 'Counselling'],
      ['wellbeing-check.html', 'Free Checks'],
      ['student-mental-health-india.html', 'Student Guide'],
    ],
    waNav: `Hello Lume Live! I&rsquo;d like to talk about ${c.conditionName.replace(/ \(.*\)/, '')}.`,
    kicker: c.kicker, h1: c.h1, lede: c.lede, hindi: c.hindi,
    heroCard: c.heroCard,
    actions: [
      `        <button type="button" class="btn" data-ll-open="${c.check}">${c.checkLabel}</button>`,
      `        <a class="btn secondary" href="#book">Book a &#8377;249 first session</a>`,
    ],
    heroNote: 'This page is general information, not a diagnosis. Any self-check is anonymous and not stored &mdash; your answers never leave your browser.',
    crumb: `<a href="index.html">Home</a> &rsaquo; <a href="${HUB}">Mental Health Counselling</a> &rsaquo; Understanding ${esc(c.name.replace(/&amp;/g, '&'))}`,
    body, faq: c.faq, related,
    stickyCheck: c.check,
  });
}

/* ── conversion landing pages ──────────────────────────────────────────── */
// A national counselling service. Same ProfessionalService shape the city pages use,
// minus the areaServed city, since this one serves all of India.
const landingServiceNode = l => ({
  '@type': 'ProfessionalService',
  '@id': `${SITE}/${l.slug}#service`,
  name: 'Lume Live — Online Therapy & Counselling',
  url: `${SITE}/${l.slug}`,
  description: 'Confidential, non-diagnostic online counselling across India by a counsellor with an M.Sc in Clinical Psychology. Support for anxiety, stress, low mood, burnout and self-esteem for students, parents and working professionals.',
  image: `${SITE}/og/${l.slug.replace(/\.html$/, '')}.png`,
  logo: `${SITE}/logo.png`,
  telephone: '+91-7015671280',
  email: 'hello@lumelive.co.in',
  areaServed: { '@type': 'Country', name: 'India' },
  availableLanguage: ['en', 'hi'],
  priceRange: '₹249-₹499',
  provider: {
    '@type': 'Person', name: 'Sachin Bajaj',
    jobTitle: 'Career and Mental Health Counsellor',
    hasCredential: 'M.Sc Clinical Psychology (Gurugram University); PGDGC (Jamia Millia Islamia)',
  },
});

// The short city key a city landing slug is built from: mental-health-counselling-delhi
// → delhi, so the therapy pages read online-therapy-delhi, therapy-for-anxiety-delhi.
const cityKey = c => c.slug.replace(/^mental-health-counselling-/, '').replace(/\.html$/, '');

function buildLanding(l) {
  const body = `<div class="cta-box" id="check">
      <h3>Not sure it&rsquo;s worth a session? Start here.</h3>
      <p>Take a free, private self-check first &mdash; two minutes, no sign-up, nothing saved. It helps you see what&rsquo;s going on, and there&rsquo;s no pressure to book anything.</p>
      <div class="cta-row"><button type="button" class="btn" data-ll-open="${l.check}">${l.checkLabel}</button></div>
      <p class="ll-check-note" style="margin-top:14px">It&rsquo;s a reflection tool, not a diagnosis. Your answers never leave your browser.</p>
    </div>

    ${CRISIS}

    <h2>${l.helpsH2 || 'What people talk to us about'}</h2>
    <p>${l.helpsIntro || 'You don&rsquo;t need a diagnosis, a crisis, or a tidy explanation to book. These are simply the things people bring to a first session most often:'}</p>
    <div class="concerns">
${l.helps.map(([ic, b, p]) => `      <div class="concern"><div class="ic">${ic}</div><b>${b}</b><p>${p}</p></div>`).join('\n')}
    </div>

    <h2>How it works</h2>
    <div class="concerns steps">
${l.steps.map(([n, b, p]) => `      <div class="concern"><div class="ic">${n}</div><b>${b}</b><p>${p}</p></div>`).join('\n')}
    </div>

    <h2>Confidential means confidential</h2>
    <p>Price isn&rsquo;t what stops most people booking. It&rsquo;s the worry that someone will find out. So, plainly:</p>
    <ul>
      <li><strong>Nothing goes to your parents, school, college or employer.</strong> No report, no summary, not even confirmation that you turned up.</li>
      <li><strong>A first name is enough to book.</strong> You don&rsquo;t owe us your full name, and you don&rsquo;t have to explain yourself in advance.</li>
      <li><strong>The self-checks store nothing.</strong> Your answers sit in your browser and vanish when you close the tab.</li>
      <li><strong>Sessions are online.</strong> No waiting room, nobody to bump into.</li>
    </ul>

    <h2>Who you&rsquo;ll be talking to</h2>
    <p>Sachin Bajaj has an M.Sc in Clinical Psychology from Gurugram University and a PGDGC from Jamia Millia Islamia, and has worked with more than 500 students and families across India. You get the same counsellor every session &mdash; no app shuffling you between strangers who each need the story from the top.</p>
    <div class="credentials">
      <div class="cred"><div class="ic">&#127891;</div><b>M.Sc</b><span>Clinical Psychology, Gurugram University</span></div>
      <div class="cred"><div class="ic">&#128220;</div><b>PGDGC</b><span>Jamia Millia Islamia, New Delhi</span></div>
      <div class="cred"><div class="ic">&#129309;</div><b>500+</b><span>Students &amp; families supported</span></div>
      <div class="cred"><div class="ic">&#128483;</div><b>&#2361;&#2367;&#2306;&#2342;&#2368; + EN</b><span>Whichever you think in</span></div>
    </div>

    <h2>What this is, and what it isn&rsquo;t</h2>
    <p>It&rsquo;s counselling support, not treatment: confidential conversations about what you&rsquo;re carrying and what might help. We don&rsquo;t diagnose conditions and we don&rsquo;t prescribe medication, and this isn&rsquo;t an emergency service. If what you describe needs a psychiatrist, your counsellor will tell you so in the first session and help you find one. You won&rsquo;t be sold a package instead.</p>

    <h2 id="book">What a session costs</h2>
    <p><strong>&#8377;499 for 45 minutes</strong>, and your <strong>first one is &#8377;249</strong> with the code <strong>FIRST50</strong>. Private counselling in India usually runs &#8377;1,500 to &#8377;3,000 a session. You&rsquo;re not signing up for a course of treatment &mdash; you&rsquo;re booking one conversation, and you can stop after it.</p>
    <div class="cta-box">
      <h3>Book a first session &mdash; &#8377;249</h3>
      <p>Pick a slot from the live calendar and the video-call invite arrives straight away. Video, voice or chat, whichever suits you.</p>
      <div class="cta-row">
        <a class="btn" href="book-session.html">Pick a slot &rarr;</a>
        <a class="btn wa" href="https://wa.me/917015671280?text=${encodeURIComponent('Hello Lume Live! I would like to book an online counselling session. 💛')}" target="_blank" rel="noopener">Ask on WhatsApp</a>
      </div>
    </div>${l.cityList ? `

    <h2 id="cities">Online therapy in your city</h2>
    <p>Everything runs online, so where you live doesn&rsquo;t limit who you can talk to &mdash; these pages just speak to what it looks like locally.</p>
    <p class="citylist">
      ${CITIES.map(c => `<a href="online-therapy-${cityKey(c)}.html">${c.city}</a>`).join(' &middot;\n      ')}
    </p>` : ''}`;

  return page({
    slug: l.slug, title: l.title, desc: l.desc, keywords: l.keywords,
    ogTitle: l.ogTitle, ogDesc: l.ogDesc,
    graph: [
      landingServiceNode(l),
      crumbNode(l.slug, [
        ['Home', `${SITE}/`],
        ['Mental Health Counselling', `${SITE}/${HUB}`],
        ['Online Therapy & Counselling', `${SITE}/${l.slug}`],
      ]),
      faqNode(l.slug, l.faq),
    ],
    nav: [
      ['index.html', 'Home'],
      [HUB, 'Counselling'],
      ['wellbeing-check.html', 'Free Checks'],
      ['book-session.html', 'Book'],
    ],
    waNav: 'Hello Lume Live! I would like to talk about online counselling.',
    kicker: l.kicker, h1: l.h1, lede: l.lede, hindi: l.hindi,
    heroCard: l.heroCard, heroNote: l.heroNote, stats: l.stats,
    actions: [
      `        <button type="button" class="btn" data-ll-open="${l.check}">${l.checkLabel}</button>`,
      `        <a class="btn secondary" href="#book">Book a &#8377;249 first session</a>`,
    ],
    crumb: `<a href="index.html">Home</a> &rsaquo; <a href="${HUB}">Mental Health Counselling</a> &rsaquo; Online Therapy &amp; Counselling`,
    body, faq: l.faq, related: l.related,
    stickyCheck: l.check,
  });
}

/* ── city conversion landing pages ─────────────────────────────────────── */
// Each "flavour" reuses the condition framing (check, concerns, steps) from its
// national landing page in LANDINGS, and pairs it with a city's own local prose
// (pressure, why, FAQ) from CITIES — so online-therapy-delhi and therapy-for-anxiety-
// delhi are genuinely local and genuinely distinct, not thin spins of one template.
const FLAVORS = [
  {
    key: 'general', stem: 'online-therapy', from: 'online-therapy-india.html',
    label: 'Online Therapy &amp; Counselling', linkLabel: 'Online therapy &amp; counselling',
    about: null, explainer: null, screener: null,
    lede: c => `Talk to a qualified counsellor from anywhere in ${c.city} &mdash; privately, with nobody told. Not sure you need a session? Start with a free, two-minute self-check and decide from there.`,
    desc: c => `Confidential online therapy & counselling in ${c.city} with an M.Sc Clinical Psychologist. Anxiety, stress, low mood, burnout. Free self-check, first session ₹249.`,
    kw: c => `online therapy ${c.city}, online counselling ${c.city}, therapist in ${c.city}, talk to a counsellor ${c.city}, affordable therapy ${c.city}, online psychologist ${c.city}`,
    faqExtra: [
      ['Is this therapy, or counselling?', 'It&rsquo;s confidential, non-diagnostic counselling support &mdash; structured conversations about what you&rsquo;re carrying and what would help. We don&rsquo;t diagnose or prescribe. If what you describe needs a psychiatrist, your counsellor will say so and help you find one.'],
      ['How much does a session cost?', 'A session is &#8377;499 for 45 minutes, and your first is &#8377;249 with the code FIRST50. No packages &mdash; you book one conversation at a time.'],
    ],
  },
  {
    key: 'anxiety', stem: 'therapy-for-anxiety', from: 'therapy-for-anxiety.html',
    label: 'Online Therapy &amp; Counselling for Anxiety', linkLabel: 'Online therapy for anxiety',
    about: 'Anxiety',
    explainer: ['understanding-anxiety.html', 'Understanding anxiety: signs &amp; what helps'],
    screener: ['free-anxiety-test.html', 'Free anxiety test (GAD-7)'],
    lede: c => `When worry won&rsquo;t switch off and your body stays braced, talking to someone qualified helps &mdash; privately and online for ${c.city}. Start with a free, two-minute anxiety check.`,
    desc: c => `Confidential online counselling for anxiety in ${c.city} with an M.Sc Clinical Psychologist. Racing thoughts, constant worry, panic. Free anxiety check, first session ₹249.`,
    kw: c => `therapy for anxiety ${c.city}, anxiety counselling ${c.city}, anxiety therapist ${c.city}, help with anxiety ${c.city}, online anxiety counselling ${c.city}`,
    faqExtra: [
      ['Can counselling actually help my anxiety?', 'Yes. Anxiety is highly manageable &mdash; counselling helps you understand what keeps it going and build skills to lower it. For many people the change is large.'],
      ['Is the anxiety check a diagnosis?', 'No. The GAD-7 is a brief reflection scale that tells you roughly how heavy the last couple of weeks have been. Only a qualified professional can diagnose, and your answers aren&rsquo;t stored.'],
    ],
  },
  {
    key: 'depression', stem: 'therapy-for-depression', from: 'therapy-for-depression.html',
    label: 'Online Therapy &amp; Counselling for Depression', linkLabel: 'Online therapy for depression',
    about: 'Depression',
    explainer: ['understanding-depression.html', 'Understanding depression: signs &amp; what helps'],
    screener: ['free-depression-test.html', 'Free depression self-check (PHQ-4)'],
    lede: c => `When things go flat and mornings get heavier, you don&rsquo;t have to push through alone. Private, online counselling for ${c.city}. Start with a free, two-minute check.`,
    desc: c => `Confidential online counselling for depression in ${c.city} with an M.Sc Clinical Psychologist. Low mood, exhaustion, loss of interest. Free self-check, first session ₹249.`,
    kw: c => `therapy for depression ${c.city}, depression counselling ${c.city}, depression therapist ${c.city}, help with low mood ${c.city}, online depression counselling ${c.city}`,
    faqExtra: [
      ['Can counselling help with depression?', 'Often, yes &mdash; especially for mild to moderate low mood, where counselling, support and small changes make a real difference. More severe depression sometimes needs medication alongside, and a counsellor will tell you honestly.'],
      ['I feel numb rather than sad. Is that still worth talking about?', 'Yes. Loss of feeling &mdash; not enjoying anything, feeling flat or empty &mdash; is a core feature of depression and is often missed. It&rsquo;s very much worth talking through.'],
    ],
  },
];

const landingCityServiceNode = (c, f, slug) => ({
  '@type': 'ProfessionalService',
  '@id': `${SITE}/${slug}#service`,
  name: `Lume Live — ${f.label.replace(/&amp;/g, '&')} in ${c.city}`,
  url: `${SITE}/${slug}`,
  description: `Confidential, non-diagnostic online counselling for ${c.city}${f.about ? `, with support for ${f.about.toLowerCase()}` : ''}, by a counsellor with an M.Sc in Clinical Psychology. First session ₹249.`,
  image: `${SITE}/og/${slug.replace(/\.html$/, '')}.png`,
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
});

function buildCityLanding(c, f) {
  const src = LANDINGS.find(l => l.slug === f.from);
  const key = cityKey(c);
  const slug = `${f.stem}-${key}.html`;

  const siblings = FLAVORS.filter(g => g.key !== f.key)
    .map(g => `      <a href="${g.stem}-${key}.html">${g.linkLabel} in ${c.city} &rarr;</a>`).join('\n');
  const otherCities = CITIES.filter(o => o.slug !== c.slug)
    .map(o => `<a href="${f.stem}-${cityKey(o)}.html">${o.city}</a>`).join(' &middot;\n      ');

  const related = [
    [c.slug, `Mental health counselling in ${c.city}`],
    ...(f.explainer ? [f.explainer] : []),
    ...(f.screener ? [f.screener] : []),
    [f.from, `${f.linkLabel} across India`],
    ['wellbeing-check.html', 'All seven free self-checks'],
    ['book-session.html', 'Book a &#8377;249 first session'],
  ];

  const body = `<div class="cta-box" id="check">
      <h3>Not sure it&rsquo;s worth a session? Start here.</h3>
      <p>Take a free, private self-check first &mdash; no sign-up, nothing saved. There&rsquo;s no pressure to book anything.</p>
      <div class="cta-row"><button type="button" class="btn" data-ll-open="${src.check}">${src.checkLabel}</button></div>
      <p class="ll-check-note" style="margin-top:14px">It&rsquo;s a reflection tool, not a diagnosis. Your answers never leave your browser.</p>
    </div>

    ${CRISIS}

    <h2>${src.helpsH2} in ${c.city}</h2>
    <p>${src.helpsIntro}</p>
    <div class="concerns">
${src.helps.map(([ic, b, p]) => `      <div class="concern"><div class="ic">${ic}</div><b>${b}</b><p>${p}</p></div>`).join('\n')}
    </div>

    ${c.pressure}

    <h2>How it works</h2>
    <div class="concerns steps">
${src.steps.map(([n, b, p]) => `      <div class="concern"><div class="ic">${n}</div><b>${b}</b><p>${p}</p></div>`).join('\n')}
    </div>

    <h2>What&rsquo;s already available in ${c.city}, and what&rsquo;s missing</h2>
    <div class="local">
${c.why.split('\n').map(x => '    ' + x.trim()).join('\n')}
    </div>

    <h2>Confidential means confidential</h2>
    <ul>
      <li><strong>Nothing goes to your parents, school, college or employer.</strong> No report, no summary, not even confirmation that you turned up.</li>
      <li><strong>A first name is enough to book.</strong> You don&rsquo;t owe us your full name, and you don&rsquo;t have to explain yourself in advance.</li>
      <li><strong>The self-checks store nothing.</strong> Your answers sit in your browser and vanish when you close the tab.</li>
      <li><strong>Sessions are online.</strong> No waiting room, nobody to bump into.</li>
    </ul>

    <h2>Who you&rsquo;ll be talking to</h2>
    <p>Sachin Bajaj has an M.Sc in Clinical Psychology from Gurugram University and a PGDGC from Jamia Millia Islamia, and has worked with more than 500 students and families across India. You get the same counsellor every session &mdash; no app shuffling you between strangers who each need the story from the top.</p>
    <div class="credentials">
      <div class="cred"><div class="ic">&#127891;</div><b>M.Sc</b><span>Clinical Psychology, Gurugram University</span></div>
      <div class="cred"><div class="ic">&#128220;</div><b>PGDGC</b><span>Jamia Millia Islamia, New Delhi</span></div>
      <div class="cred"><div class="ic">&#129309;</div><b>500+</b><span>Students &amp; families supported</span></div>
      <div class="cred"><div class="ic">&#128483;</div><b>&#2361;&#2367;&#2306;&#2342;&#2368; + EN</b><span>Whichever you think in</span></div>
    </div>

    <h2>What this is, and what it isn&rsquo;t</h2>
    <p>It&rsquo;s counselling support, not treatment: confidential conversations about what you&rsquo;re carrying and what might help. We don&rsquo;t diagnose conditions and we don&rsquo;t prescribe medication, and this isn&rsquo;t an emergency service. If what you describe needs a psychiatrist, your counsellor will tell you so in the first session and help you find one. You won&rsquo;t be sold a package instead.</p>

    <h2 id="book">What a session costs in ${c.city}</h2>
    <p><strong>&#8377;499 for 45 minutes</strong>, and your <strong>first one is &#8377;249</strong> with the code <strong>FIRST50</strong>. Private counselling in India usually runs &#8377;1,500 to &#8377;3,000 a session. You&rsquo;re not signing up for a course of treatment &mdash; you&rsquo;re booking one conversation, and you can stop after it.</p>
    <div class="cta-box">
      <h3>Book a first session &mdash; &#8377;249</h3>
      <p>Pick a slot from the live calendar and the video-call invite arrives straight away. Video, voice or chat, whichever suits you.</p>
      <div class="cta-row">
        <a class="btn" href="book-session.html">Pick a slot &rarr;</a>
        <a class="btn wa" href="https://wa.me/917015671280?text=${encodeURIComponent(`Hello Lume Live! I would like to book an online counselling session in ${c.city}. 💛`)}" target="_blank" rel="noopener">Ask on WhatsApp</a>
      </div>
    </div>

    <h2>More ways we can help in ${c.city}</h2>
    <div class="related">
${siblings}
    </div>

    <h2>Online therapy in other cities</h2>
    <p>Everything runs online, so what changes between these pages is the local picture, not the counsellor.</p>
    <p class="citylist">
      ${otherCities}
    </p>`;

  return page({
    slug,
    title: `${f.label} in ${c.city} | Lume Live`,
    desc: f.desc(c),
    keywords: f.kw(c),
    ogTitle: `${f.label} in ${c.city} — Lume Live`,
    ogDesc: f.desc(c),
    geo: { region: c.region, place: `${c.city}, ${c.state}`.replace(/&amp;/g, '&') },
    graph: [
      landingCityServiceNode(c, f, slug),
      crumbNode(slug, [
        ['Home', `${SITE}/`],
        ['Mental Health Counselling', `${SITE}/${HUB}`],
        [`${f.label.replace(/&amp;/g, '&')} in ${c.city}`, `${SITE}/${slug}`],
      ]),
      faqNode(slug, [...c.faq, ...f.faqExtra]),
    ],
    nav: [
      ['index.html', 'Home'],
      [HUB, 'Counselling'],
      ['wellbeing-check.html', 'Free Checks'],
      ['book-session.html', 'Book'],
    ],
    waNav: `Hello Lume Live! I want to talk about online counselling in ${c.city}.`,
    kicker: `&#128205; ${c.city} &middot; Confidential &middot; Non-Diagnostic`,
    h1: `${f.label} in ${c.city}`,
    lede: f.lede(c), hindi: c.hindi,
    heroCard: c.heroCard,
    heroNote: 'The check is free, anonymous and not stored &mdash; your answers never leave your browser.',
    stats: src.stats,
    actions: [
      `        <button type="button" class="btn" data-ll-open="${src.check}">${src.checkLabel}</button>`,
      `        <a class="btn secondary" href="#book">Book a &#8377;249 first session</a>`,
    ],
    crumb: `<a href="index.html">Home</a> &rsaquo; <a href="${HUB}">Mental Health Counselling</a> &rsaquo; ${f.label} in ${c.city}`,
    body, faq: [...c.faq, ...f.faqExtra], related,
    stickyCheck: src.check,
  });
}

/* ── write ─────────────────────────────────────────────────────────────── */
const out = [
  ...SCREENERS.map(s => [s.slug, buildScreener(s)]),
  ...CITIES.map(c => [c.slug, buildCity(c)]),
  ...CONDITIONS.map(c => [c.slug, buildCondition(c)]),
  ...LANDINGS.map(l => [l.slug, buildLanding(l)]),
  ...CITIES.flatMap(c => FLAVORS.map(f => [`${f.stem}-${cityKey(c)}.html`, buildCityLanding(c, f)])),
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
