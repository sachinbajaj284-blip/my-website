#!/usr/bin/env node
/**
 * build-library-guides.mjs — write the Career Library guide articles.
 *
 *   node tools/build-library-guides.mjs           # write every page
 *   node tools/build-library-guides.mjs --check   # exit 1 if any file on disk is stale
 *
 * Content lives in library-guides.mjs. These mirror the shell of the existing
 * hand-authored library articles (what-is-cuet.html and the rest): shared library.css,
 * the inline .facts grid, an Article + Organization + WebSite graph, a schema-only
 * FAQPage, and a BreadcrumbList under the Career Library.
 *
 * Unlike the profession guides, the body here is free-form (`body`), because admission
 * and exam content varies — process steps, option lists, comparison tables — and doesn't
 * fit one fixed section order. Each guide carries a share card at og/<slug>.png (add the
 * slug to tools/og-images.mjs). Pages are auto-discovered by tools/sitemap.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY_GUIDES } from './library-guides.mjs';
import { COMPARISONS } from './comparisons.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lumelive.co.in';
const CHECK = process.argv.includes('--check');

const fileOf = g => `${g.slug}.html`;

// Comparison pages ("A vs B") are library articles too — same shell — but they sit
// under Compare Careers rather than the Career Library, so the nav, breadcrumb and
// footer point there. A guide's `kind: 'compare'` selects that chrome.
const chromeOf = g => g.kind === 'compare'
  ? {
      parentHref: 'compare-careers.html', parentName: 'Compare Careers',
      nav: '<a href="index.html">Home</a><a href="compare-careers.html">Compare</a><a href="career-explorer.html">Careers</a><a class="cta" href="assessment.html#free-test">Free Career Test</a>',
      footer: '<a href="index.html">Home</a> &middot; <a href="compare-careers.html">Compare Careers</a> &middot; <a href="career-explorer.html">Careers</a> &middot; <a href="career-library.html">Library</a> &middot; <a href="privacy-policy.html">Privacy Policy</a>',
    }
  : {
      parentHref: 'career-library.html', parentName: 'Career Library',
      nav: '<a href="index.html">Home</a><a href="career-explorer.html">Careers</a><a href="career-library.html">Library</a><a class="cta" href="assessment.html#free-test">Free Career Test</a>',
      footer: '<a href="index.html">Home</a> &middot; <a href="career-explorer.html">Careers</a> &middot; <a href="career-library.html">Library</a> &middot; <a href="services-pricing.html">Services &amp; Pricing</a> &middot; <a href="privacy-policy.html">Privacy Policy</a> · <a href="terms.html">Terms of Service</a>',
    };

// Hero glyph + eyebrow for the admission/exam guides (keyed by slug). Comparisons use
// the scales glyph and a VS header built from their crumb instead.
const GLYPH_GUIDE = {
  'neet-counselling-process': '🩺', 'josaa-counselling-process': '⚙️',
  'what-to-do-after-neet': '🩺', 'what-to-do-after-jee': '🛠️',
  'cuet-admission-process': '🎓', 'scholarships-for-students-india': '💰',
};
const EYEBROW_GUIDE = {
  'neet-counselling-process': 'NEET · Counselling', 'josaa-counselling-process': 'JEE · JoSAA',
  'what-to-do-after-neet': 'After NEET', 'what-to-do-after-jee': 'After JEE',
  'cuet-admission-process': 'CUET · Admission', 'scholarships-for-students-india': 'Scholarships',
};

// Ambient, on-brand hero motif — inline SVG, so it passes the strict img-src CSP, scales
// with the hero, and is genuinely licence-free. Shared with build-career-profiles.mjs.
const DECO = `<svg class="ar-deco" viewBox="0 0 220 300" fill="none" aria-hidden="true">` +
  `<circle cx="150" cy="150" r="118" stroke="currentColor" stroke-width="1.4" opacity=".45"/>` +
  `<circle cx="150" cy="150" r="78" stroke="currentColor" stroke-width="1.4" opacity=".7"/>` +
  `<circle cx="150" cy="150" r="38" stroke="currentColor" stroke-width="1.4"/>` +
  `<path d="M28 272 C 90 210 135 196 236 112" stroke="currentColor" stroke-width="2.2" opacity=".85"/>` +
  `<circle cx="150" cy="150" r="4.5" fill="currentColor"/>` +
  `<circle cx="236" cy="112" r="6" fill="currentColor"/></svg>`;

// The hero's visual block: a VS header for comparisons, stat chips for guides with facts.
function heroExtra(g) {
  if (g.kind === 'compare') {
    const [a, b] = g.crumb.split(/\s+vs\s+/i);
    return `    <div class="vs-head"><div class="vs-side">${a}</div><div class="vs-badge">VS</div><div class="vs-side">${b}</div></div>`;
  }
  if (g.facts) {
    return `    <div class="hero-facts">
${g.facts.map(([b, s]) => `      <div class="hf"><b>${b}</b><span>${s}</span></div>`).join('\n')}
    </div>`;
  }
  return '';
}

function headGraph(g) {
  const url = `${SITE}/${fileOf(g)}`;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: g.headline,
        description: g.metaDesc,
        datePublished: g.date,
        dateModified: g.date,
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
      { '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'Lume Live', url: `${SITE}/`, inLanguage: 'en-IN', publisher: { '@id': `${SITE}/#organization` } },
    ],
  }, null, 2);
}

const faqGraph = g => JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: g.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

const breadcrumbGraph = g => {
  const c = chromeOf(g);
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${SITE}/${fileOf(g)}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: c.parentName, item: `${SITE}/${c.parentHref}` },
      { '@type': 'ListItem', position: 3, name: g.crumb, item: `${SITE}/${fileOf(g)}` },
    ],
  }, null, 2);
};

function guidePage(g) {
  const url = `${SITE}/${fileOf(g)}`;
  const og = `${SITE}/og/${g.slug}.png`;
  const chrome = chromeOf(g);
  const cta = g.cta || {};
  const ctaHref = cta.href || 'assessment.html#free-test';
  const ctaLabel = cta.label || 'Start the Free Career Snapshot';
  const glyph = g.kind === 'compare' ? '⚖️' : (GLYPH_GUIDE[g.slug] || '📚');
  const eyebrow = g.kind === 'compare' ? 'Compare Careers' : (EYEBROW_GUIDE[g.slug] || 'Career Library');
  const takeaways = g.takeaways ? `
    <div class="takeaway">
    <b>Key takeaways</b>
    <ul>
${g.takeaways.map(t => `      <li>${t}</li>`).join('\n')}
    </ul>
    </div>
` : '';
  const ctaBox = cta.h3 ? `
    <div class="cta-box">
      <h3>${cta.h3}</h3>
      <p>${cta.p}</p>
      <a class="btn gold" href="${ctaHref}">${ctaLabel}</a>
    </div>
` : '';

  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' www.googletagmanager.com connect.facebook.net; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data: www.google-analytics.com www.googletagmanager.com www.facebook.com; connect-src 'self' www.googletagmanager.com *.google-analytics.com *.analytics.google.com www.facebook.com connect.facebook.net; object-src 'none'; base-uri 'self';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${g.title}</title>
<meta name="description" content="${g.metaDesc}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="icon" href="favicon.ico" sizes="any">
<meta property="og:type" content="article">
<meta property="og:title" content="${g.ogTitle}">
<meta property="og:description" content="${g.ogDesc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${og}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="library.css">
<script type="application/ld+json">
${headGraph(g)}
</script>
<script type="application/ld+json">${faqGraph(g)}</script>
<link rel="stylesheet" href="site-anim.css">
<script type="application/ld+json">
${breadcrumbGraph(g)}
</script>
<meta property="og:site_name" content="Lume Live">
<meta property="og:locale" content="en_IN">
<meta name="twitter:title" content="${g.title}">
<meta name="twitter:description" content="${g.metaDesc}">
</head>
<body>
<header class="top"><nav class="nav">
  <a class="brand" href="index.html"><img src="logo.png" alt="Lume Live logo" decoding="async"><span>LUME LIVE</span></a>
  <div class="nlinks">${chrome.nav}</div>
</nav></header>

<header class="ar-hero">
  <div class="wrap">
    <p class="crumb"><a href="index.html">Home</a> &rsaquo; <a href="${chrome.parentHref}">${chrome.parentName}</a> &rsaquo; ${g.crumb}</p>
    <div class="ar-glyph">${glyph}</div>
    <span class="ar-eyebrow">${eyebrow}</span>
    <h1>${g.h1}</h1>
    <div class="ar-meta">By the Lume Live counselling team &middot; Updated October 2026 &middot; ${g.readMin} min read</div>
    <p class="ar-lead">${g.lead}</p>
${heroExtra(g)}
    ${DECO}
  </div>
</header>

<div class="wrap">
  <article role="main">
${g.body}
${takeaways}${ctaBox}
    <div class="related">
      <h2>Explore next</h2>
${g.related.map(([href, label]) => `      <a href="${href}">${label}</a>`).join('\n')}
    </div>
  </article>
</div>

<footer class="foot">
  Lume Live &middot; Online career counselling &amp; mental-health support across India &middot; WhatsApp +91 70156 71280<br>
  ${chrome.footer}
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
const ALL = [...LIBRARY_GUIDES, ...COMPARISONS];
let stale = 0, wrote = 0;
for (const g of ALL) {
  const file = path.join(ROOT, fileOf(g));
  const html = guidePage(g);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (prev === html) continue;
  if (CHECK) { console.error(`stale: ${fileOf(g)}`); stale++; continue; }
  fs.writeFileSync(file, html);
  wrote++;
}
if (CHECK) {
  console.log(stale ? `${stale} page(s) stale — run node tools/build-library-guides.mjs` : `all ${ALL.length} library guides & comparisons up to date`);
  process.exit(stale ? 1 : 0);
}
console.log(`wrote ${wrote} of ${ALL.length} library guides & comparisons`);
