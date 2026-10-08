#!/usr/bin/env node
/**
 * build-career-profiles.mjs — write the "How to Become a <career>" profession guides.
 *
 *   node tools/build-career-profiles.mjs           # write every page
 *   node tools/build-career-profiles.mjs --check   # exit 1 if any file on disk is stale
 *
 * Content lives in career-profiles.mjs. These mirror the shell of the existing
 * hand-authored career-as-<career>.html guides exactly: shared library.css, the inline
 * .facts grid, an Article + Organization + WebSite graph, a schema-only FAQPage (no
 * visible FAQ section, same as the existing pages), and a BreadcrumbList under the
 * Career Explorer. The existing 11 guides are left untouched.
 *
 * Each guide carries a share card at og/career-as-<slug>.png in the house style — add
 * the slug to tools/og-images.mjs and run `npm run og:images -- <slug>` to produce it.
 * Pages are auto-discovered by tools/sitemap.mjs (the career-as- priority rule covers
 * them), so run `npm run sitemap` after adding one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAREER_PROFILES } from './career-profiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lumelive.co.in';
const CHECK = process.argv.includes('--check');

const title = c => `How to Become ${c.article} ${c.name} in India`;
const slugFile = c => `career-as-${c.slug}.html`;

function headGraph(c) {
  const url = `${SITE}/${slugFile(c)}`;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: `${title(c)} (2026): Path, Skills & Salary`,
        description: c.metaDesc,
        datePublished: c.date,
        dateModified: c.date,
        author: { '@id': `${SITE}/#organization` },
        publisher: { '@id': `${SITE}/#organization` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        '@id': `${url}#article`,
        isPartOf: { '@id': `${SITE}/#website` },
        inLanguage: 'en-IN',
      },
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organization`,
        name: 'Lume Live',
        url: `${SITE}/`,
        logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` },
        email: 'hello@lumelive.co.in',
        telephone: '+91-7015671280',
        sameAs: ['https://www.facebook.com/profile.php?id=61589670451910', 'https://www.instagram.com/lumelive.co.in/?hl=en'],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        name: 'Lume Live',
        url: `${SITE}/`,
        inLanguage: 'en-IN',
        publisher: { '@id': `${SITE}/#organization` },
      },
    ],
  }, null, 2);
}

const faqGraph = c => JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

const breadcrumbGraph = c => JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  '@id': `${SITE}/${slugFile(c)}#breadcrumb`,
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Career Explorer', item: `${SITE}/career-explorer.html` },
    { '@type': 'ListItem', position: 3, name: c.name, item: `${SITE}/${slugFile(c)}` },
  ],
}, null, 2);

function profilePage(c) {
  const slug = slugFile(c);
  const url = `${SITE}/${slug}`;
  const og = `${SITE}/og/career-as-${c.slug}.png`;
  const related = [
    ...c.related,
    ['career-explorer.html', 'See all careers in the Career Explorer'],
    ['holland-riasec-test-explained.html', 'The Holland RIASEC test, explained'],
    ['assessment.html#free-test', 'Free 60-second Career Snapshot'],
  ];

  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' www.googletagmanager.com connect.facebook.net; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data: www.google-analytics.com www.googletagmanager.com www.facebook.com; connect-src 'self' www.googletagmanager.com *.google-analytics.com *.analytics.google.com www.facebook.com connect.facebook.net; object-src 'none'; base-uri 'self';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title(c)} (2026) | Lume Live</title>
<meta name="description" content="${c.metaDesc}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="icon" href="favicon.ico" sizes="any">
<meta property="og:type" content="article">
<meta property="og:title" content="${title(c)} (2026)">
<meta property="og:description" content="${c.ogDesc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${og}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="library.css">
<style>
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:24px 0}
.facts div{background:#fff;padding:16px 14px;text-align:center}
.facts b{display:block;color:var(--navy);font-size:.98rem;margin-bottom:3px}
.facts span{font-size:.68rem;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:800}
@media(max-width:640px){.facts{grid-template-columns:1fr 1fr}}
</style>
<script type="application/ld+json">
${headGraph(c)}
</script>
<script type="application/ld+json">${faqGraph(c)}</script>
<link rel="stylesheet" href="site-anim.css">
<script type="application/ld+json">
${breadcrumbGraph(c)}
</script>
<meta property="og:site_name" content="Lume Live">
<meta property="og:locale" content="en_IN">
<meta name="twitter:title" content="${title(c)} (2026) | Lume Live">
<meta name="twitter:description" content="${c.metaDesc}">
</head>
<body>
<header class="top"><nav class="nav">
  <a class="brand" href="index.html"><img src="logo.png" alt="Lume Live logo" decoding="async"><span>LUME LIVE</span></a>
  <div class="nlinks"><a href="index.html">Home</a><a href="career-explorer.html">Careers</a><a href="career-library.html">Library</a><a class="cta" href="assessment.html#free-test">Free Career Test</a></div>
</nav></header>

<div class="wrap">
  <p class="crumb"><a href="index.html">Home</a> &rsaquo; <a href="career-explorer.html">Career Explorer</a> &rsaquo; ${c.name}</p>
  <article role="main">
    <h1>${title(c)}</h1>
    <div class="meta">By the Lume Live counselling team &middot; Updated October 2026 &middot; ${c.readMin} min read</div>
    <p class="lead">${c.lead}</p>

    <div class="facts">
${c.facts.map(([b, s]) => `      <div><b>${b}</b><span>${s}</span></div>`).join('\n')}
    </div>

    <h2>What ${c.article} ${c.name.toLowerCase()} actually does</h2>
    <p>${c.does}</p>

    <h2>The path after Class 10</h2>
    <p>${c.after10}</p>

    <h2>The path after Class 12</h2>
    <ul>
${c.after12.map(li => `      <li>${li}</li>`).join('\n')}
    </ul>

    <h2>Top institutions &amp; entry routes</h2>
    <table class="cmp">
      <tr><th>Type</th><th>Institutions</th><th>How you get in</th></tr>
${c.institutions.map(([a, b, d]) => `      <tr><td>${a}</td><td>${b}</td><td>${d}</td></tr>`).join('\n')}
    </table>

    <h2>Core skills to build</h2>
    <ul>
${c.skills.map(([bold, rest]) => `      <li><strong>${bold}</strong> &mdash; ${rest}</li>`).join('\n')}
    </ul>

    <h2>Salary in India (2026)</h2>
    <table class="cmp">
      <tr><th>Stage</th><th>Typical annual pay</th></tr>
${c.salary.map(([stage, pay]) => `      <tr><td>${stage}</td><td>${pay}</td></tr>`).join('\n')}
    </table>

    <h2>Is this career right for you?</h2>
    <p>${c.fit}</p>

    <div class="takeaway">
    <b>Key takeaways</b>
    <ul>
${c.takeaways.map(t => `      <li>${t}</li>`).join('\n')}
    </ul>
    </div>

    <div class="cta-box">
      <h3>${c.ctaH3}</h3>
      <p>${c.ctaP}</p>
      <a class="btn gold" href="assessment.html#free-test">Start the Free Career Snapshot</a>
    </div>

    <div class="related">
      <h2>Explore next</h2>
${related.map(([href, label]) => `      <a href="${href}">${label}</a>`).join('\n')}
    </div>
  </article>
</div>

<footer class="foot">
  Lume Live &middot; Online career counselling &amp; mental-health support across India &middot; WhatsApp +91 70156 71280<br>
  <a href="index.html">Home</a> &middot; <a href="career-explorer.html">Careers</a> &middot; <a href="career-library.html">Library</a> &middot; <a href="services-pricing.html">Services &amp; Pricing</a> &middot; <a href="privacy-policy.html">Privacy Policy</a> · <a href="terms.html">Terms of Service</a>
</footer>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-1CZ93P4P3V"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-1CZ93P4P3V');</script>
<script src="lume-pixel.js" defer></script>
<script src="site-anim.js" defer></script>
</body>
</html>
`;
}

/* ── write ─────────────────────────────────────────────────────────────── */
let stale = 0, wrote = 0;
for (const c of CAREER_PROFILES) {
  const slug = slugFile(c);
  const html = profilePage(c);
  const file = path.join(ROOT, slug);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (prev === html) continue;
  if (CHECK) { console.error(`stale: ${slug}`); stale++; continue; }
  fs.writeFileSync(file, html);
  wrote++;
}
if (CHECK) {
  console.log(stale ? `${stale} page(s) stale — run node tools/build-career-profiles.mjs` : `all ${CAREER_PROFILES.length} career profiles up to date`);
  process.exit(stale ? 1 : 0);
}
console.log(`wrote ${wrote} of ${CAREER_PROFILES.length} career profiles`);
