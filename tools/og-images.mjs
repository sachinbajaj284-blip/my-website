#!/usr/bin/env node
/**
 * Generates 1200x630 Open Graph cards into og/, in the same house style as the
 * cards that already ship there: navy gradient, gold rule along the top, logo
 * lockup, gold eyebrow, serif headline, and a footer line with the price pill.
 *
 * The cards it produces are checked in, so this only needs re-running when a
 * page is added to PAGES below or the styling changes.
 *
 *   node tools/og-images.mjs            # write every card
 *   node tools/og-images.mjs home start # write just these slugs
 *
 * Needs Playwright's chromium. Existing hand-made cards are never overwritten
 * unless their slug is listed here.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES } from './mh-cities.mjs';
import { CAREER_PROFILES } from './career-profiles.mjs';
import { COMPARISONS } from './comparisons.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'og');

// slug -> { eyebrow, title }. slug is the og/<slug>.png filename.
const PAGES = {
  /* mental health cluster — these pages carry no photograph, so the share card is
     the only image they have. */
  'mental-health-counselling':                        { eyebrow: 'Mental Health', title: "Online Counselling You Can Actually Afford" },
  'mental-health-counselling-delhi':                  { eyebrow: 'Mental Health · Delhi', title: "Confidential Counselling In Delhi" },
  'mental-health-counselling-gurugram':               { eyebrow: 'Mental Health · Gurugram', title: "Confidential Counselling In Gurugram" },
  'mental-health-counselling-noida':                  { eyebrow: 'Mental Health · Noida', title: "Confidential Counselling In Noida" },
  'mental-health-counselling-mumbai':                 { eyebrow: 'Mental Health · Mumbai', title: "Confidential Counselling In Mumbai" },
  'mental-health-counselling-bangalore':              { eyebrow: 'Mental Health · Bengaluru', title: "Confidential Counselling In Bengaluru" },
  'mental-health-counselling-hyderabad':              { eyebrow: 'Mental Health · Hyderabad', title: "Confidential Counselling In Hyderabad" },
  'mental-health-counselling-pune':                   { eyebrow: 'Mental Health · Pune', title: "Confidential Counselling In Pune" },
  'mental-health-counselling-jaipur':                 { eyebrow: 'Mental Health · Jaipur', title: "Confidential Counselling In Jaipur" },
  'mental-health-counselling-chandigarh':             { eyebrow: 'Mental Health · Chandigarh', title: "Confidential Counselling In Chandigarh" },
  'mental-health-counselling-lucknow':                { eyebrow: 'Mental Health · Lucknow', title: "Confidential Counselling In Lucknow" },
  'mental-health-counselling-rohtak':                 { eyebrow: 'Mental Health · Rohtak', title: "Confidential Counselling In Rohtak" },
  'mental-health-counselling-faridabad':              { eyebrow: 'Mental Health · Faridabad', title: "Confidential Counselling In Faridabad" },
  'mental-health-counselling-sonipat':                { eyebrow: 'Mental Health · Sonipat', title: "Confidential Counselling In Sonipat" },
  'mental-health-counselling-panipat':                { eyebrow: 'Mental Health · Panipat', title: "Confidential Counselling In Panipat" },
  'mental-health-counselling-hisar':                  { eyebrow: 'Mental Health · Hisar', title: "Confidential Counselling In Hisar" },
  'mental-health-counselling-bhiwani':                { eyebrow: 'Mental Health · Bhiwani', title: "Confidential Counselling In Bhiwani" },
  'student-mental-health-india':                      { eyebrow: 'Student Guide', title: "Student Mental Health In India" },
  'mental-health-calendar':                           { eyebrow: 'Mental Health · All Year', title: "The Mental Health Awareness Calendar" },
  'wellbeing-check':                                  { eyebrow: 'Free Self-Checks', title: "Seven Free, Private Mental Health Checks" },
  'free-anxiety-test':                                { eyebrow: 'Free Self-Check', title: "Free Anxiety Test, In Three Minutes" },
  'free-depression-test':                             { eyebrow: 'Free Self-Check', title: "Free Low Mood Check, In Two Minutes" },
  'self-esteem-test':                                 { eyebrow: 'Free Self-Check', title: "Free Self-Esteem Check, In Three Minutes" },
  'work-stress-burnout-test':                         { eyebrow: 'Free Self-Check', title: "Free Burnout And Work Stress Check" },
  'psychology-tuition':                               { eyebrow: 'Psychology Tuition · Class 11 & 12', title: "Learn Psychology From A CBSE Teacher",
                                                        foot: 'lumelive.co.in <i>· Online Psychology Tuition</i>', pill: '₹7,999 a month · Notes & PYQs' },
  'exam-stress-test':                                 { eyebrow: 'Free Self-Check', title: "Free Exam Stress Check For Students" },
  home:                             { eyebrow: 'From ₹249 a session', title: "India's Most Affordable Career Counselling" },
  'college-predictor':              { eyebrow: 'JoSAA Tools',        title: 'What Can You Get With Your JEE Rank?' },
  'choice-list':                    { eyebrow: 'JoSAA Tools',        title: 'Get Your Choice List In The Right Order' },
  colleges:                         { eyebrow: 'JoSAA Tools',        title: 'Every College In JoSAA Counselling' },
  'services-pricing':               { eyebrow: 'Services & Pricing', title: 'Affordable Counselling, Priced In The Open' },
  start:                            { eyebrow: 'Start Here',         title: "Not Sure Where To Begin? Two Taps." },
  'story-careers-beyond-doctor-engineer': { eyebrow: 'Career Stories', title: '5 Careers Beyond Doctor & Engineer' },
  'story-exam-burnout':             { eyebrow: 'Career Stories',     title: '5 Quiet Signs Of Exam Burnout' },
  'internship-ethics':              { eyebrow: 'Internships',        title: 'How We Protect Clients And Interns' },
  'privacy-policy':                 { eyebrow: 'Policies',           title: 'Your Privacy, Handled With Care' },
  'refund-policy':                  { eyebrow: 'Policies',           title: 'Transparent Payment Support' },
  terms:                            { eyebrow: 'Policies',           title: 'Clear Terms For A Calm Experience' },
  'stream-selector-hi':             { eyebrow: 'फ्री क्विज़ · हिंदी',    title: '10वीं के बाद कौन-सी stream सही है?',
                                      foot: 'lumelive.co.in <i>· करियर और मेंटल-हेल्थ काउंसलिंग</i>',
                                      pill: 'पहला session सिर्फ ₹249' },
};

/* Condition explainer pages and therapy landing pages added later. The share card
   is the only image these carry, so each needs one. City cards are generated from
   the CITIES table below so they can't drift from the pages that exist. */
const EXPLAINER_CARDS = {
  'understanding-anxiety':             ['Understanding · Anxiety',        'What Anxiety Is, And What Helps'],
  'understanding-depression':          ['Understanding · Depression',     'What Depression Is, And What Helps'],
  'understanding-ocd':                 ['Understanding · OCD',            'What OCD Really Is'],
  'understanding-panic-attacks':       ['Understanding · Panic',          'Panic Attacks: Why They Happen'],
  'understanding-social-anxiety':      ['Understanding · Social Anxiety', 'More Than Shyness: Social Anxiety'],
  'understanding-stress-and-burnout':  ['Understanding · Burnout',        'Stress & Burnout: Spot It, Recover'],
  'understanding-adhd':                ['Understanding · ADHD',           'ADHD In Adults And Students'],
  'understanding-insomnia':            ['Understanding · Sleep',          'Insomnia: Why You Can’t Sleep'],
  'understanding-ptsd':                ['Understanding · Trauma',         'PTSD & Trauma: Signs And Help'],
  'understanding-bipolar-disorder':    ['Understanding · Bipolar',        'Bipolar Disorder, Explained'],
  'online-therapy-india':              ['Online Therapy',                 'Online Therapy & Counselling In India'],
  'therapy-for-anxiety':               ['Online Therapy · Anxiety',       'Online Therapy For Anxiety'],
  'therapy-for-depression':            ['Online Therapy · Depression',    'Online Therapy For Depression'],
  'therapy-for-stress':                ['Online Therapy · Burnout',       'Online Therapy For Stress & Burnout'],
  'therapy-for-ocd':                   ['Online Therapy · OCD',           'Online Therapy For OCD'],
  'therapy-for-panic-attacks':         ['Online Therapy · Panic',         'Online Therapy For Panic Attacks'],
  'therapy-for-social-anxiety':        ['Online Therapy · Social Anxiety', 'Online Therapy For Social Anxiety'],
  'therapy-for-adhd':                  ['Support · ADHD',                 'ADHD Counselling & Support'],
  'therapy-for-insomnia':              ['Online Therapy · Sleep',         'Counselling For Insomnia & Sleep'],
  'therapy-for-ptsd':                  ['Support · Trauma',               'Counselling For PTSD & Trauma'],
  'therapy-for-bipolar-disorder':      ['Support · Bipolar',              'Counselling Support For Bipolar'],
};
for (const [slug, [eyebrow, title]] of Object.entries(EXPLAINER_CARDS)) PAGES[slug] = { eyebrow, title };

// One card per city × therapy flavour, keyed to match the page's og/<slug>.png.
const CITY_FLAVOURS = [
  ['online-therapy',         c => [`Online Therapy · ${c.city}`, `Online Therapy In ${c.city}`]],
  ['therapy-for-anxiety',    c => [`Anxiety · ${c.city}`,        `Therapy For Anxiety In ${c.city}`]],
  ['therapy-for-depression', c => [`Low Mood · ${c.city}`,       `Therapy For Depression In ${c.city}`]],
];
for (const c of CITIES) {
  const key = c.slug.replace(/^mental-health-counselling-/, '').replace(/\.html$/, '');
  for (const [stem, make] of CITY_FLAVOURS) {
    const [eyebrow, title] = make(c);
    PAGES[`${stem}-${key}`] = { eyebrow, title };
  }
}

// Generated profession guides carry a share card in the same style as the existing
// career-as-<slug> cards: a "Career Guide" eyebrow and the page's own H1.
for (const c of CAREER_PROFILES) {
  PAGES[`career-as-${c.slug}`] = { eyebrow: 'Career Guide', title: `How to Become ${c.article} ${c.name} in India` };
}

// Admission & exam library guides.
const ADMISSION_CARDS = {
  'neet-counselling-process':       ['Admissions · NEET',  'NEET Counselling, Explained'],
  'josaa-counselling-process':      ['Admissions · JoSAA', 'JoSAA Counselling, Step by Step'],
  'what-to-do-after-neet':          ['After NEET',         'Your Options After a Low NEET Score'],
  'what-to-do-after-jee':           ['After JEE',          'Your Options After a Low JEE Rank'],
  'cuet-admission-process':         ['Admissions · CUET',  'After Your CUET Result'],
  'scholarships-for-students-india':['Scholarships',       'Scholarships For Students In India'],
};
for (const [slug, [eyebrow, title]] of Object.entries(ADMISSION_CARDS)) PAGES[slug] = { eyebrow, title };

// Comparison pages: a "Compare" eyebrow and the short "A vs B" from the page's crumb.
for (const c of COMPARISONS) PAGES[c.slug] = { eyebrow: 'Compare', title: c.crumb };

const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'logo.png')).toString('base64');

// Fonts are vendored and inlined rather than pulled from the Google Fonts CDN:
// the generator has to render identically offline, and a webfont that fails to
// load silently falls back to a system serif and ships a wrong-looking card.
const font = f => 'data:font/woff2;base64,' +
  fs.readFileSync(path.join(ROOT, 'tools', 'fonts', f + '.woff2')).toString('base64');

const FACES = `
  @font-face{font-family:Mont;src:url(${font('montserrat-800')}) format('woff2');font-weight:800}
  @font-face{font-family:Mont;src:url(${font('montserrat-900')}) format('woff2');font-weight:900}
  @font-face{font-family:Playf;src:url(${font('playfair-800')}) format('woff2');font-weight:800}
`;

// Montserrat and Playfair carry no Devanagari, and the render container has no
// system Devanagari font either, so a Hindi card without these comes out as
// rows of tofu boxes.
//
// They are added only to cards that actually contain Devanagari. Noto Sans
// Devanagari also covers ₹ and ·, and it wins those glyphs over the system
// fallback Montserrat was using — putting it in every card's stack silently
// re-renders all twelve English cards that are already checked in.
const DEVA_FACES = `
  @font-face{font-family:Deva;src:url(${font('noto-sans-devanagari-800')}) format('woff2');font-weight:800}
  @font-face{font-family:DevaSerif;src:url(${font('noto-serif-devanagari-700')}) format('woff2');font-weight:700}
`;
const hasDevanagari = s => /[\u0900-\u097F]/.test(s);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// foot carries its own markup (the <i> that greys the tagline) so it is
// interpolated raw; pill is plain text and goes through esc().
const DEFAULT_FOOT = 'lumelive.co.in <i>· Career &amp; Mental-Health Counselling</i>';
const DEFAULT_PILL = 'Founder-led · ₹249 first session';

const card = ({ eyebrow, title, foot = DEFAULT_FOOT, pill = DEFAULT_PILL }) => {
  const deva = hasDevanagari(eyebrow + title + foot + pill);
  const sans  = deva ? 'Mont,Deva,Arial,sans-serif' : 'Mont,Arial,sans-serif';
  const serif = deva ? 'Playf,DevaSerif,Georgia,serif' : 'Playf,Georgia,serif';
  return `<!doctype html><meta charset="utf-8">
<style>
${FACES}${deva ? DEVA_FACES : ''}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;font-family:${sans};
       background:
         radial-gradient(70% 90% at 0% 0%, rgba(10,110,110,.55), transparent 62%),
         radial-gradient(50% 70% at 100% 108%, rgba(201,147,58,.16), transparent 60%),
         linear-gradient(150deg,#0D1B40,#13224d 55%,#0D1B40);
       position:relative;padding:64px 76px;display:flex;flex-direction:column;justify-content:space-between}
  .rule{position:absolute;top:0;left:0;right:0;height:8px;
        background:linear-gradient(90deg,#0A6E6E,#0E8C8C 22%,#C9933A 62%,#E8B95A)}
  .brand{display:flex;align-items:center;gap:20px}
  .brand img{width:56px;height:56px;border-radius:50%;object-fit:cover;
             border:2px solid rgba(232,185,90,.75)}
  .brand span{font-size:27px;font-weight:900;letter-spacing:.13em;color:#fff}
  .brand span b{color:#E8B95A;font-weight:900}
  .eyebrow{font-size:20px;font-weight:800;letter-spacing:.19em;text-transform:uppercase;
           color:#E8B95A;margin-bottom:22px}
  h1{font-family:${serif};font-weight:800;color:#fff;
     font-size:${title.length > 44 ? 62 : 72}px;line-height:1.12;max-width:1010px;
     letter-spacing:-.01em}
  .foot{display:flex;align-items:center;justify-content:space-between;gap:24px}
  .foot .site{font-size:21px;font-weight:800;color:#fff}
  .foot .site i{font-style:normal;color:rgba(255,255,255,.62);font-weight:700}
  .pill{border:1.5px solid rgba(232,185,90,.6);border-radius:999px;padding:13px 26px;
        font-size:19px;font-weight:800;color:#E8B95A;white-space:nowrap;
        background:rgba(232,185,90,.07)}
</style>
<div class="rule"></div>
<div class="brand"><img src="${logo}" alt=""><span>LUME <b>LIVE</b></span></div>
<div>
  <div class="eyebrow">${esc(eyebrow)}</div>
  <h1>${esc(title)}</h1>
</div>
<div class="foot">
  <div class="site">${foot}</div>
  <div class="pill">${esc(pill)}</div>
</div>`;
};

const only = process.argv.slice(2);
const targets = Object.entries(PAGES).filter(([slug]) => !only.length || only.includes(slug));
if (!targets.length) {
  console.error('No matching slugs. Known:', Object.keys(PAGES).join(', '));
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
// CHROMIUM_PATH lets this run where Playwright's browser lives somewhere else
// (CI, a container); the default is the local install.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

for (const [slug, spec] of targets) {
  await page.setContent(card(spec), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, `${slug}.png`) });
  console.log('wrote og/' + slug + '.png');
}

await browser.close();
