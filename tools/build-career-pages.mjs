#!/usr/bin/env node
/**
 * build-career-pages.mjs — write the metro career-counselling landing pages.
 *
 *   node tools/build-career-pages.mjs           # write every page
 *   node tools/build-career-pages.mjs --check   # exit 1 if any file on disk is stale
 *
 * Content lives in career-cities.mjs. These pages mirror the shell of the existing
 * hand-authored career-counselling-in-<town>.html pages (same inline CSS, same booking
 * flow, same ₹499 pricing, same DMIT stance), but are generated from data so the metro
 * cluster can't drift into the near-duplicates the hand-made Haryana cluster did. The
 * existing Haryana pages are intentionally left untouched.
 *
 * Career pages carry a photograph (sachin.jpeg) as their share image, so unlike the
 * mental-health pages they need no generated OG card. They are auto-discovered by
 * tools/sitemap.mjs (the career-counselling-in- priority rule already covers them), so
 * run `npm run sitemap` after adding a city.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAREER_CITIES } from './career-cities.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lumelive.co.in';
const WA = '917015671280';
const YEAR = '2026';
const NATIONAL = 'online-career-counselling-india.html';
const HARYANA_HUB = 'career-counselling-haryana.html';
const CHECK = process.argv.includes('--check');

// The Haryana / NCR career pages that already exist, for the cross-link block.
const HARYANA_CLUSTER = [
  ['career-counselling-in-rohtak.html', 'Rohtak'],
  ['career-counselling-in-gurugram.html', 'Gurugram'],
  ['career-counselling-in-faridabad.html', 'Faridabad'],
  ['career-counselling-in-sonipat.html', 'Sonipat'],
  ['career-counselling-in-panipat.html', 'Panipat'],
  ['career-counselling-in-hisar.html', 'Hisar'],
  ['career-counselling-in-bhiwani.html', 'Bhiwani'],
  ['career-counselling-in-noida.html', 'Noida'],
];

// served-area strings that are regions, not cities, for the schema areaServed.
const AREAS = new Set([
  'Delhi NCR', 'Mumbai Metropolitan Region', 'Tricity', 'Rajasthan', 'Uttar Pradesh',
]);

// Several of these metro slugs were previously thin "copy-paste" city pages that
// Google treated as doorway pages; they were retired and now 301-redirect to the
// national page (see vercel.json + tools/redirects.test.mjs). We must never
// resurrect a retired URL: a page that has a redirect is skipped here, for both
// emission and cross-linking. To bring one back, remove its redirect from
// vercel.json first — then this generator will write it.
const REDIRECTED = new Set(
  (JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).redirects || [])
    .map(r => r.source.replace(/^\//, '')),
);
const ACTIVE = CAREER_CITIES.filter(c => !REDIRECTED.has(`career-counselling-in-${c.key}.html`));

const slugOf = c => `career-counselling-in-${c.key}.html`;
const stripTags = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const waUrl = msg => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;

const CSS = `
:root{--navy:#0D1B40;--navy2:#142C5A;--teal:#0A6E6E;--gold:#C9933A;--gold2:#E8B84E;--mint:#ECF7F6;--gray:#F5F7F8;--dark:#1A2C2C;--mid:#4A6060;--white:#fff}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Inter',Arial,Helvetica,sans-serif;color:var(--dark);background:#fff;line-height:1.65}
a{text-decoration:none;color:inherit}
img{max-width:100%;display:block}
.wrap{max-width:900px;margin:0 auto;padding:0 20px}
.nav{position:sticky;top:0;z-index:30;background:rgba(255,255,255,.97);backdrop-filter:blur(14px);box-shadow:0 2px 20px rgba(13,27,64,.08)}
.nav-inner{max-width:1180px;margin:auto;padding:13px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{display:flex;align-items:center;gap:10px;font-weight:900;color:var(--navy)}
.brand img{width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid var(--gold)}
.nav-links{display:flex;align-items:center;gap:8px;color:var(--mid);font-size:.85rem;font-weight:800}
.nav-links a{padding:8px 11px;border-radius:9px}
.nav-links a:hover{background:var(--gray);color:var(--navy)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:10px;padding:13px 22px;font-weight:800;background:var(--gold);color:#fff;cursor:pointer;transition:background .2s;font-size:.92rem}
.btn:hover{background:#b5832e}
.btn.wa{background:#1EAE5C}
.btn.wa:hover{background:#178f4a}
.btn.secondary{background:#fff;color:var(--navy);border:1px solid #DDE7E5}
.crumb{font-size:.78rem;color:var(--mid);padding:16px 0 0}
.crumb a{color:var(--teal);font-weight:700}
.hero{background:#0D1B40;color:#fff;padding:44px 20px 40px;position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;inset:0;background:radial-gradient(55% 75% at 8% 0%,rgba(10,110,110,.4),transparent 60%),radial-gradient(45% 60% at 100% 120%,rgba(201,147,58,.18),transparent 60%);pointer-events:none}
.hero-inner{position:relative;z-index:1;max-width:1180px;margin:auto;display:grid;grid-template-columns:1.15fr .85fr;gap:38px;align-items:center}
.kicker{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(232,184,78,.42);background:rgba(201,147,58,.16);color:#FFE2A3;border-radius:999px;padding:7px 13px;font-size:.72rem;font-weight:900;letter-spacing:.6px;text-transform:uppercase;margin-bottom:16px}
h1{font-family:Georgia,serif;font-size:clamp(1.9rem,4.2vw,3rem);line-height:1.12;margin-bottom:14px}
.hero p.lede{color:rgba(255,255,255,.82);font-size:1rem;max-width:600px;margin-bottom:8px}
.hindi-line{color:#FFE2A3;font-size:.95rem;font-weight:700;margin-bottom:18px}
.hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:24px}
.stat{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px 8px;text-align:center}
.stat b{display:block;color:var(--gold2);font-size:1.3rem}
.stat span{font-size:.62rem;text-transform:uppercase;letter-spacing:.4px;color:rgba(255,255,255,.64);font-weight:800}
.photo-frame{border-radius:20px;overflow:hidden;box-shadow:0 28px 80px rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.16);background:#fff}
.photo-frame img{width:100%;height:auto;object-fit:contain}
article{padding:44px 0 10px}
h2{font-family:Georgia,serif;font-size:clamp(1.5rem,3vw,2.1rem);line-height:1.18;color:var(--navy);margin:38px 0 14px}
h2:first-of-type{margin-top:0}
h3{font-size:1.05rem;color:var(--navy);margin:20px 0 8px}
p{margin-bottom:14px;font-size:.98rem}
ul,ol{margin:0 0 14px 22px}
li{margin-bottom:7px;font-size:.98rem}
.hi{color:var(--teal);font-weight:700;font-style:normal}
.note{background:var(--mint);border-left:4px solid var(--teal);border-radius:8px;padding:14px 16px;margin:18px 0;font-size:.92rem;color:var(--dark)}
.credentials{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
.cred{background:#fff;border:1px solid #E2E9E8;border-radius:14px;padding:18px 14px;text-align:center}
.cred .ic{font-size:1.6rem;margin-bottom:8px}
.cred b{display:block;color:var(--navy);font-size:.86rem;margin-bottom:3px}
.cred span{font-size:.72rem;color:var(--mid)}
.cta-box{background:linear-gradient(135deg,#F7FAF9,#FFF8E8);border:1px solid #E8E2D0;border-radius:18px;padding:26px;margin:26px 0;text-align:center}
.cta-box h3{margin-top:0;font-size:1.2rem}
.cta-box p{max-width:520px;margin:0 auto 16px;color:var(--mid)}
.cta-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.faq-item{border-bottom:1px solid #E2E9E8;padding:16px 0}
.faq-item h3{margin:0 0 8px}
.faq-item p{margin-bottom:0;color:var(--mid)}
.related{background:var(--gray);border-radius:14px;padding:20px;margin:26px 0}
.related h2{margin-top:0}
.related a{display:block;color:var(--teal);font-weight:700;padding:4px 0}
.footer{padding:30px 20px 76px;text-align:center;background:#08142F;color:rgba(255,255,255,.72);font-size:.82rem}
.footer a{color:#E8B95A}
.sticky-cta{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #E2E9E8;box-shadow:0 -6px 24px rgba(13,27,64,.12);padding:10px 16px;display:flex;gap:10px;justify-content:center;z-index:40}
.sticky-cta .btn{flex:1;max-width:220px}
@media(max-width:960px){.hero-inner{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}.nav-links{display:none}.credentials{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.stats{grid-template-columns:1fr 1fr}}
@media(min-width:961px){.sticky-cta{display:none}}

.citylist{margin:10px 0 26px;line-height:2.1;font-size:15px}
.citylist a{display:inline-block;padding:4px 12px;margin:3px 4px 3px 0;border:1px solid #DDE7E5;border-radius:999px;text-decoration:none;font-weight:600}
.citylist a:hover{background:#F3F8F7}
.citylist .cl-group{display:block;margin-top:12px;font-weight:800;font-size:13px;letter-spacing:.04em;text-transform:uppercase;opacity:.65}`;

const SCRIPTS = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-1CZ93P4P3V"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-1CZ93P4P3V');</script>
<script src="lume-pixel.js" defer></script>
<script>
/* Lume WhatsApp message polish — minimal, bulleted handoff (lumeWaUpgrade) */
(function(){
  var WA='917015671280';
  function build(body){
    var b=body.replace(/[.\\s]+$/,'');
    var lines=['Hello Lume Live!','• '+b];
    if(!/please|confirm|\\?\\s*$/i.test(body))lines.push('• Please share the next steps and available options');
    return lines.join('\\n');
  }
  function textOf(link){try{return new URL(link.href).searchParams.get('text')||'';}catch(e){return'';}}
  function upgrade(){
    document.querySelectorAll('a[href*="wa.me/'+WA+'"]').forEach(function(link){
      if(link.getAttribute('data-wa-upgraded'))return;
      var text=textOf(link),body;
      if(!text){body='I would like to know more about your counselling programmes.';}
      else if(/^\\s*(👋\\s*)?(hi|hello)\\s+(sachin|lume live)/i.test(text)){
        body=text.replace(/^\\s*(👋\\s*)?(hi|hello)\\s+(sachin|lume live)[!,.\\s]*/i,'').trim();
        if(!body)body='I would like to know more about your counselling programmes.';
      } else {return;}
      link.setAttribute('href','https://wa.me/'+WA+'?text='+encodeURIComponent(build(body)));
      link.setAttribute('data-wa-upgraded','1');
    });
  }
  upgrade();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',upgrade);
})();
</script>
<script src="site-anim.js" defer></script>
  <script src="lume-capture.js" defer></script>`;

function areaServed(c) {
  const out = [{ '@type': 'City', name: c.city }];
  for (const s of c.served) out.push({ '@type': AREAS.has(s) ? 'AdministrativeArea' : 'City', name: s });
  if (c.state !== c.city) out.push({ '@type': 'AdministrativeArea', name: c.state });
  return out;
}

function jsonLd(c, slug) {
  const url = `${SITE}/${slug}`;
  const placename = c.state && c.state !== c.city ? `${c.city}, ${c.state}` : c.city;
  const graph = [
    {
      '@type': ['ProfessionalService', 'LocalBusiness'],
      '@id': `${url}#business`,
      name: `Lume Live Career Counselling — ${c.city}`,
      url,
      description: `Online 1:1 career counselling for ${c.city}${c.alt ? ` (${c.alt})` : ''}, ${c.state} students and families by Lume Live's qualified counsellors (M.Sc Clinical Psychology), based in Rohtak. Psychometric assessments (Holland RIASEC, VARK, Career Values), stream selection guidance and exam-related support.`,
      image: `${SITE}/sachin.jpeg`,
      logo: `${SITE}/logo.png`,
      priceRange: '₹199-₹11999',
      telephone: '+91-7015671280',
      email: 'hello@lumelive.co.in',
      address: { '@type': 'PostalAddress', addressLocality: 'Rohtak', addressRegion: 'Haryana', postalCode: '124001', addressCountry: 'IN' },
      areaServed: areaServed(c),
      openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '09:00', closes: '20:00' }],
      founder: { '@id': `${SITE}/#sachin-bajaj` },
      sameAs: ['https://www.facebook.com/profile.php?id=61589670451910', 'https://www.instagram.com/lumelive.co.in/?hl=en'],
    },
    {
      '@type': 'Person',
      '@id': `${SITE}/#sachin-bajaj`,
      name: 'Sachin Bajaj',
      jobTitle: 'Career & Mental Health Counsellor',
      description: 'Sachin Bajaj is a career and mental health counsellor based in Rohtak, Haryana, holding an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia. He was felicitated as an AILET 2026 Laureate and has personally guided 500+ students across India.',
      url: `${SITE}/`,
      image: `${SITE}/sachin.jpeg`,
      alumniOf: [{ '@type': 'CollegeOrUniversity', name: 'Gurugram University' }, { '@type': 'CollegeOrUniversity', name: 'Jamia Millia Islamia, New Delhi' }],
      award: 'AILET 2026 Laureate — Toppers’ Felicitation Ceremony',
      knowsLanguage: ['en-IN', 'hi-IN'],
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Online Career Counselling', item: `${SITE}/${NATIONAL}` },
        { '@type': 'ListItem', position: 3, name: `Career Counselling in ${c.city}`, item: url },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: stripTags(q), acceptedAnswer: { '@type': 'Answer', text: stripTags(a) } })),
    },
  ];
  // placename is carried in the geo meta, not the graph; referenced to keep lint quiet.
  void placename;
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

function otherCities(c) {
  const metros = ACTIVE.filter(o => o.key !== c.key)
    .map(o => `      <a href="${slugOf(o)}">${o.city}</a>`).join('\n');
  const haryana = HARYANA_CLUSTER
    .map(([href, name]) => `      <a href="${href}">${name}</a>`).join('\n');
  // Only show the "Major cities" group when there is at least one other active metro.
  const metrosGroup = metros ? `      <span class="cl-group">Major cities</span>\n${metros}\n` : '';
  return `${metrosGroup}      <span class="cl-group">Haryana &amp; Delhi-NCR</span>
${haryana}
      <span class="cl-group">Across India</span>
      <a href="${NATIONAL}">Online, anywhere in India</a>
      <a href="${HARYANA_HUB}">Career counselling in Haryana</a>`;
}

function careerPage(c) {
  const slug = slugOf(c);
  const url = `${SITE}/${slug}`;
  const placename = c.state && c.state !== c.city ? `${c.city}, ${c.state}` : c.city;
  const kicker = `📍 Serving ${placename} · Online 1:1 · Qualified Counsellors`;
  const title = `Career Counselling in ${c.city} ${YEAR} | Lume Live`;
  const metaDesc = `Career counselling in ${c.city}${c.alt ? ` (${c.alt})` : ''} by M.Sc Clinical Psychology counsellors — online 1:1 sessions and real psychometric tests. First session ₹499.`;
  const keywords = `career counselling in ${c.city}, career counsellor ${c.city}, career counselling near me ${c.city}, psychometric test ${c.city}, stream selection ${c.city}, online career counselling ${c.state}`;
  const ogTitle = `Career Counselling in ${c.city} ${YEAR} — Lume Live`;
  const ogDesc = `Online 1:1 career counselling for ${c.city} students and families by an M.Sc Clinical Psychologist. Real psychometric tests, ₹499 first session.`;
  const mh = `mental-health-counselling-${c.key}.html`;

  const relatedExtra = c.key === 'jaipur'
    ? '      <a href="career-counselling-for-neet-jee-droppers.html">Career counselling for NEET/JEE droppers</a>\n'
    : '';

  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' www.googletagmanager.com connect.facebook.net; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data: www.google-analytics.com www.googletagmanager.com www.facebook.com; connect-src 'self' www.googletagmanager.com *.google-analytics.com *.analytics.google.com www.facebook.com connect.facebook.net; object-src 'none'; base-uri 'self';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${metaDesc}">
<meta name="keywords" content="${keywords}">
<meta name="author" content="Lume Live">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta name="geo.region" content="${c.region}">
<meta name="geo.placename" content="${placename}">
<meta http-equiv="content-language" content="en-IN">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lume Live">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/sachin.jpeg">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:description" content="${ogDesc}">
<meta name="twitter:image" content="${SITE}/sachin.jpeg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<script type="application/ld+json">
${jsonLd(c, slug)}
</script>
<style>${CSS}
</style>
<link rel="stylesheet" href="site-anim.css">
</head>
<body>
<nav class="nav"><div class="nav-inner">
  <a class="brand" href="index.html"><img src="logo.png" alt="Lume Live logo" decoding="async"><span>LUME LIVE</span></a>
  <div class="nav-links">
    <a href="index.html">Home</a>
    <a href="${NATIONAL}">All-India</a>
    <a href="assessment.html#free-test">Free Career Snapshot</a>
    <a class="btn wa" href="${waUrl(`Hello Lume Live! I am from ${c.city} and want career counselling.`)}" target="_blank">WhatsApp</a>
  </div>
</div></nav>

<header class="hero">
  <div class="hero-inner">
    <div>
      <span class="kicker">${kicker}</span>
      <h1>Career Counselling in ${c.city} ${YEAR} — Online 1:1 Guidance from Lume Live</h1>
      <p class="lede">${c.lede}</p>
      <p class="hindi-line">${c.hindi}</p>
      <div class="hero-actions">
        <a class="btn" href="#book">Book ₹499 Session</a>
        <a class="btn secondary" href="assessment.html#free-test">Take Free Career Snapshot</a>
      </div>
      <div class="stats">
        <div class="stat"><b>500+</b><span>Students Guided</span></div>
        <div class="stat"><b>M.Sc</b><span>Clinical Psychology</span></div>
        <div class="stat"><b>AILET '26</b><span>Laureate Award</span></div>
        <div class="stat"><b>₹499</b><span>First Session</span></div>
      </div>
    </div>
    <div class="photo-frame"><img src="sachin.jpeg" alt="Lume Live career counsellor for ${c.city} families, M.Sc Clinical Psychology" decoding="async" loading="lazy"></div>
  </div>
</header>

<div class="wrap">
  <p class="crumb"><a href="index.html">Home</a> &rsaquo; <a href="${NATIONAL}">Online Career Counselling</a> &rsaquo; ${c.city}</p>

  <article role="main">
    <h2>Career counselling in ${c.city} — ${c.subtitle}</h2>
    <p>${c.intro[0]}</p>
    <p>${c.intro[1]}</p>

    <h2>What a session covers for ${c.city} students</h2>
    <ul>
${c.covers.map(li => `      <li>${li}</li>`).join('\n')}
    </ul>
    <p><span class="hi">Format seedha hai:</span> pehle validated psychometric assessment, phir 45 minute ki 1:1 baat-cheet, aur end mein likha hua roadmap.</p>

    <div class="cta-box" id="book">
      <h3>Book your ₹499 first session from ${c.city}</h3>
      <p>45 minutes, 1:1 with your Lume Live counsellor over video call — both parents welcome to join from home.</p>
      <div class="cta-row">
        <a class="btn wa" href="${waUrl(`Hello Lume Live! I am from ${c.city} and want to book the ₹499 session.`)}" target="_blank">💬 Book on WhatsApp — ₹499</a>
        <a class="btn secondary" href="tel:+917015671280">Call +91 70156 71280</a>
      </div>
    </div>

    <h2>Validated psychometric testing — not an expensive DMIT package</h2>
    <p>${c.dmit} Start free with the <a href="assessment.html#free-test" style="color:var(--teal);font-weight:700">60-second Career Snapshot</a>, or go deeper with the ₹999 Full Clarity Report. The full comparison is in our guide: <a href="is-dmit-test-scientific.html" style="color:var(--teal);font-weight:700">is DMIT scientific?</a></p>

    <h2>Who takes your session</h2>
    <div class="credentials">
      <div class="cred"><div class="ic">🎓</div><b>M.Sc Clinical Psychology</b><span>Gurugram University</span></div>
      <div class="cred"><div class="ic">📜</div><b>PGDGC</b><span>Jamia Millia Islamia, New Delhi</span></div>
      <div class="cred"><div class="ic">🏆</div><b>AILET 2026 Laureate</b><span>Toppers' Felicitation Ceremony</span></div>
      <div class="cred"><div class="ic">🎤</div><b>500+ Students Guided</b><span>Sessions across India</span></div>
    </div>
    <p>${c.who}</p>

    <div class="note">${c.note}</div>

    <h2>Frequently asked questions — career counselling in ${c.city}</h2>

${c.faq.map(([q, a]) => `    <div class="faq-item">
      <h3>${q}</h3>
      <p>${a}</p>
    </div>`).join('\n')}

    <h2>Career counselling in other cities</h2>
    <p>Sessions run online, so the counsellor is the same wherever you are — what changes on each page is the local picture: the boards, the coaching culture and the colleges families there are weighing.</p>
    <p class="citylist">
${otherCities(c)}
    </p>

    <div class="related">
      <h2>Explore next</h2>
      <a href="${NATIONAL}">Online career counselling across India</a>
      <a href="${mh}">Mental health counselling in ${c.city}</a>
${relatedExtra}      <a href="career-explorer.html">Career Explorer — how to become a doctor, engineer, CA &amp; more</a>
      <a href="compare-careers.html">Compare careers side by side</a>
      <a href="assessment.html#free-test">Free 60-second Career Snapshot</a>
    </div>
  </article>
</div>

<footer class="footer">
  Lume Live · Career &amp; mental health counselling for ${c.city} — based in Rohtak, serving PAN India online · WhatsApp +91 70156 71280<br>
  <a href="index.html">Home</a> · <a href="${NATIONAL}">All-India</a> · <a href="services-pricing.html">Services &amp; Pricing</a> · <a href="refund-policy.html">Refund Policy</a> · <a href="privacy-policy.html">Privacy Policy</a> · <a href="terms.html">Terms of Service</a>
</footer>

<div class="sticky-cta">
  <a class="btn" href="#book">Book ₹499 Session</a>
  <a class="btn wa" href="https://wa.me/${WA}" target="_blank">💬 WhatsApp</a>
</div>

${SCRIPTS}
</body>
</html>
`;
}

/* ── write ─────────────────────────────────────────────────────────────── */
let stale = 0, wrote = 0;
for (const c of ACTIVE) {
  const slug = slugOf(c);
  const html = careerPage(c);
  const file = path.join(ROOT, slug);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (prev === html) continue;
  if (CHECK) { console.error(`stale: ${slug}`); stale++; continue; }
  fs.writeFileSync(file, html);
  wrote++;
}
const skipped = CAREER_CITIES.length - ACTIVE.length;
if (CHECK) {
  console.log(stale ? `${stale} page(s) stale — run node tools/build-career-pages.mjs` : `all ${ACTIVE.length} active career pages up to date (${skipped} skipped: retired/redirected)`);
  process.exit(stale ? 1 : 0);
}
console.log(`wrote ${wrote} of ${ACTIVE.length} active career pages (${skipped} skipped: retired/redirected)`);
