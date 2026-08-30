#!/usr/bin/env node
/**
 * mh-pages.mjs — generate the mental health landing pages.
 *
 *   node tools/mh-pages.mjs            # write every page
 *   node tools/mh-pages.mjs --check    # exit 1 if any file on disk is stale (CI)
 *
 * Covers the national hub, the six screener pages and the city pages. They share a
 * page shell, a stylesheet (mh-page.css) and the screener itself
 * (lume-wellbeing-check.js/.css), so the only thing that varies between them is the
 * content in this file — which is the point: a city page is worth publishing only if
 * its local content is real, and keeping that content in one table makes it obvious
 * at a glance when it is not.
 *
 * mental-health-counselling-rohtak.html predates this generator and is deliberately
 * left alone; it is hand-written and already indexed.
 *
 * On numbers: Tele-MANAS (14416) is the only helpline quoted anywhere here. Local
 * institutions are named, because those names are stable, but no local phone number
 * is published from memory — a wrong crisis number on a mental health page is worse
 * than no number at all.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lumelive.co.in';
const WA = '917015671280';
const CREDS = 'M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia';

const CSP = `default-src 'self'; script-src 'self' 'unsafe-inline' www.googletagmanager.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data: www.google-analytics.com www.googletagmanager.com; connect-src 'self' www.googletagmanager.com *.google-analytics.com *.analytics.google.com; object-src 'none'; base-uri 'self';`;

const esc = s => String(s).replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wa = t => `https://wa.me/${WA}?text=${encodeURIComponent(t)}`;

/* ── the crisis box, identical everywhere on purpose ───────────────────── */
const CRISIS = `<div class="crisis"><b>If this is an emergency:</b> counselling isn't a crisis service. If you or someone near you is in immediate danger, or having thoughts of self-harm, call <b>Tele-MANAS on 14416</b> now. It's free, it's 24&times;7, and it's run by the Government of India. Or go straight to the nearest hospital emergency department. Please don't sit and wait for a session.</div>`;

const NOT_A_DIAGNOSIS = `<p class="ll-check-note" style="margin-top:14px">These are reflection tools, meant for thinking with and for talking through with a counsellor. None of them is a diagnosis, and no questionnaire anywhere can hand you one.</p>`;

/* ── shared page shell ─────────────────────────────────────────────────── */
function page(o) {
  const url = `${SITE}/${o.slug}`;
  const graph = JSON.stringify({ '@context': 'https://schema.org', '@graph': o.graph }, null, 2);
  const geo = o.geo ? `<meta name="geo.region" content="${o.geo.region}">
<meta name="geo.placename" content="${esc(o.geo.place)}">
` : '';
  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta name="keywords" content="${esc(o.keywords)}">
<meta name="author" content="Lume Live">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
${geo}<meta http-equiv="content-language" content="en-IN">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lume Live">
<meta property="og:title" content="${esc(o.ogTitle || o.title)}">
<meta property="og:description" content="${esc(o.ogDesc || o.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/sachin.jpeg">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.ogTitle || o.title)}">
<meta name="twitter:description" content="${esc(o.ogDesc || o.desc)}">
<meta name="twitter:image" content="${SITE}/sachin.jpeg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<script type="application/ld+json">
${graph}
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-1CZ93P4P3V"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-1CZ93P4P3V');</script>
<link rel="stylesheet" href="mh-page.css">
<link rel="stylesheet" href="lume-wellbeing-check.css">
</head>
<body>
<nav class="nav"><div class="nav-inner">
  <a class="brand" href="index.html"><img src="logo.png" alt="Lume Live logo" decoding="async"><span>LUME LIVE</span></a>
  <div class="nav-links">
${o.nav.map(([h, t]) => `    <a href="${h}">${t}</a>`).join('\n')}
    <a class="btn wa" href="${wa(o.waNav)}" target="_blank" rel="noopener">WhatsApp</a>
  </div>
</div></nav>

<header class="hero">
  <div class="hero-inner">
    <div>
      <span class="kicker">${o.kicker}</span>
      <h1>${esc(o.h1)}</h1>
      <p class="lede">${o.lede}</p>
${o.hindi ? `      <p class="hindi-line">${o.hindi}</p>\n` : ''}      <div class="hero-actions">
${o.actions.join('\n')}
      </div>
      <p class="hero-note">${o.heroNote}</p>
${o.stats ? `      <div class="stats">\n${o.stats.map(([b, s]) => `        <div class="stat"><b>${b}</b><span>${s}</span></div>`).join('\n')}\n      </div>\n` : ''}    </div>
    <div class="photo-frame"><img src="sachin.jpeg" alt="Sachin Bajaj, Lume Live mental health counsellor, M.Sc Clinical Psychology" decoding="async" loading="lazy"></div>
  </div>
</header>

<div class="wrap">
  <p class="crumb">${o.crumb}</p>

  <article role="main">
${o.body}

    <h2>Frequently asked questions</h2>
${o.faq.map(([q, a]) => `    <div class="faq-item"><h3>${q}</h3><p>${a}</p></div>`).join('\n')}

    <div class="related">
      <h2>Explore next</h2>
${o.related.map(([h, t]) => `      <a href="${h}">${t} &rarr;</a>`).join('\n')}
    </div>
  </article>
</div>

<footer class="footer">
  <p>&copy; <span id="yr">2026</span> Lume Live &middot; Non-diagnostic counselling support, online across India.</p>
  <p style="margin-top:8px">In a crisis, call <b>Tele-MANAS 14416</b> &mdash; free, 24&times;7. &middot; <a href="privacy-policy.html">Privacy</a> &middot; <a href="terms.html">Terms</a> &middot; <a href="refund-policy.html">Refunds</a></p>
</footer>

<div class="sticky-cta">
  <button type="button" class="btn secondary" data-ll-open="${o.stickyCheck}">Free check</button>
  <a class="btn" href="book-session.html">Book &#8377;249</a>
</div>

<script>document.getElementById('yr').textContent=new Date().getFullYear();</script>
<script src="lume-wellbeing-check.js" defer></script>
<script src="site-anim.js" defer></script>
</body>
</html>
`;
}

/* ── schema helpers ────────────────────────────────────────────────────── */
const faqNode = (slug, faq) => ({
  '@type': 'FAQPage',
  '@id': `${SITE}/${slug}#faq`,
  mainEntity: faq.map(([q, a]) => ({
    '@type': 'Question',
    name: q.replace(/<[^>]+>/g, ''),
    acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') }
  }))
});
const crumbNode = (slug, trail) => ({
  '@type': 'BreadcrumbList',
  '@id': `${SITE}/${slug}#breadcrumb`,
  itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t[0], item: t[1] }))
});
const toolNode = (slug, name, description) => ({
  '@type': 'WebApplication',
  '@id': `${SITE}/${slug}#tool`,
  name, url: `${SITE}/${slug}`,
  applicationCategory: 'HealthApplication',
  operatingSystem: 'Any',
  description,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
  isAccessibleForFree: true,
  publisher: { '@type': 'Organization', name: 'Lume Live', url: `${SITE}/` }
});

export { page, faqNode, crumbNode, toolNode, esc, wa, CRISIS, NOT_A_DIAGNOSIS, CREDS, ROOT, SITE };
