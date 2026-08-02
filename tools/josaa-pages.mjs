#!/usr/bin/env node
/**
 * josaa-pages.mjs — generate the static browse pages from data/josaa/.
 *
 *   node tools/josaa-pages.mjs           # write colleges/ + sitemap-colleges.xml
 *   node tools/josaa-pages.mjs --clean   # remove generated pages first
 *   node tools/josaa-pages.mjs --dry-run # report what would be written
 *
 * Run this AFTER josaa-ingest.mjs and josaa-validate.mjs. The cutoff tables are written
 * into the HTML rather than fetched by script: these pages exist to be indexed, and a
 * client-rendered table indexes as an empty page.
 *
 * On success it stamps `pagesGeneratedAt` into manifest.json. colleges.html only links to
 * these pages when that stamp is present, so an ingest without a generate cannot leave
 * the browse index pointing at files that were never written.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lumelive.co.in';
const SOURCE_URL = 'https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx';

/* Institute pages list Gender-Neutral rows, which is the pool almost everyone is in.
   Female-only cutoffs are a separate pool; the predictor covers them properly rather than
   doubling the length of every page here. */
const PAGE_GENDER = 'Gender-Neutral';

/* A branch page with a handful of institutes on it is thin content that competes with
   nothing. Only generate one where the branch is offered broadly. */
const MIN_INSTITUTES_FOR_BRANCH_PAGE = 8;

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const CLEAN = args.includes('--clean');

/* --data / --out let a staging dataset be rendered somewhere harmless before the real
   one is committed. Default to the live locations. */
const flagValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
};
const DATA = flagValue('--data', path.join(ROOT, 'data', 'josaa'));
const OUT = flagValue('--out', path.join(ROOT, 'colleges'));
const SITEMAP_DIR = OUT === path.join(ROOT, 'colleges') ? ROOT : path.dirname(OUT);

/* ------------------------------------------------------------------ helpers -- */

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = n => Number(n).toLocaleString('en-IN');

const TYPE_LABEL = {
  IIT: 'Indian Institute of Technology',
  NIT: 'National Institute of Technology',
  IIIT: 'Indian Institute of Information Technology',
  GFTI: 'Government Funded Technical Institute',
};

/* Seat-type section order. Alphabetical would put EWS above OPEN, which is not how anyone
   reads this page — OPEN is the default case and belongs first, PwD variants last.
   Anything unrecognised sorts to the end, alphabetically. */
const SEAT_TYPE_ORDER = ['OPEN', 'EWS', 'OBC-NCL', 'SC', 'ST'];
const seatTypeRank = st => {
  const i = SEAT_TYPE_ORDER.indexOf(st);
  if (i >= 0) return i;
  const base = SEAT_TYPE_ORDER.findIndex(s => st.startsWith(s));
  return base >= 0 ? SEAT_TYPE_ORDER.length + base : 999;
};

const QUOTA_LABEL = {
  AI: 'All India', HS: 'Home State', OS: 'Other State',
  GO: 'Goa', JK: 'J&K', LA: 'Ladakh',
};

/* Branch -> an existing career page, so these pages feed the rest of the site rather than
   dead-ending. Only mapped where the link is genuinely relevant. */
const CAREER_LINKS = [
  { re: /computer science|artificial intelligence|machine learning/i, href: 'career-as-software-engineer.html', label: 'What a software engineering career actually looks like' },
  { re: /data science|data analytics/i, href: 'career-as-data-scientist.html', label: 'What a data science career actually looks like' },
  { re: /information technology/i, href: 'career-as-software-engineer.html', label: 'What a software engineering career actually looks like' },
  { re: /architecture|planning/i, href: 'career-as-architect.html', label: 'What an architecture career actually looks like' },
  { re: /design/i, href: 'career-as-product-designer.html', label: 'What a product design career actually looks like' },
];

function careerLinksFor(branchNames, depth) {
  const up = '../'.repeat(depth);
  const seen = new Set();
  const out = [];
  for (const name of branchNames) {
    for (const link of CAREER_LINKS) {
      if (link.re.test(name) && !seen.has(link.href)) {
        seen.add(link.href);
        out.push(`<a href="${up}${link.href}">${esc(link.label)}</a>`);
      }
    }
  }
  return out.slice(0, 3);
}

/* --------------------------------------------------------------- page chrome -- */

function head({ title, description, canonical, jsonLd, depth }) {
  const up = '../'.repeat(depth);
  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' www.googletagmanager.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data: www.google-analytics.com www.googletagmanager.com; connect-src 'self' www.googletagmanager.com *.google-analytics.com *.analytics.google.com; object-src 'none'; base-uri 'self';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/png" sizes="32x32" href="${up}favicon-32.png">
<link rel="icon" href="${up}favicon.ico" sizes="any">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="${up}colleges.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>

<header class="top"><nav class="nav">
  <a class="brand" href="${up}index.html"><img src="${up}logo.png" alt="Lume Live logo"><span>LUME LIVE</span></a>
  <a class="navlink" href="${up}college-predictor.html">Predict by rank →</a>
</nav></header>
`;
}

function tail(depth) {
  const up = '../'.repeat(depth);
  return `
  <p class="src">Cutoff data source: <a href="${SOURCE_URL}" rel="nofollow noopener" target="_blank">JoSAA Opening &amp; Closing Rank archive</a>, Government of India. Reproduced with attribution under GODL-India. Lume Live is not affiliated with JoSAA, the NTA or any institute.</p>
</div>

<footer class="foot">
  Lume Live &middot; Online career counselling &amp; mental-health support across India &middot; WhatsApp +91 70156 71280<br>
  <a href="${up}index.html">Home</a> &middot; <a href="${up}colleges.html">All colleges</a> &middot; <a href="${up}college-predictor.html">Rank predictor</a> &middot; <a href="${up}choice-list.html">Choice filling</a> &middot; <a href="${up}career-explorer.html">Careers</a>
</footer>

<script async src="https://www.googletagmanager.com/gtag/js?id=G-1CZ93P4P3V"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-1CZ93P4P3V');</script>
</body>
</html>
`;
}

function leadBox(depth, heading, body) {
  const up = '../'.repeat(depth);
  return `  <div class="lead-box">
    <h2>${esc(heading)}</h2>
    <p>${esc(body)}</p>
    <a class="btn gold" href="${up}college-predictor.html">Check my rank against these cutoffs</a>
  </div>
`;
}

/* --------------------------------------------------------------- table build -- */

function cutoffTable({ caption, subtitle, columns, rows, years }) {
  const head = `<tr><th>${columns.map(esc).join('</th><th>')}</th>${years.map(y => `<th>${y} closing</th>`).join('')}</tr>`;
  const body = rows.map(r => {
    const cells = r.cells.map((c, i) =>
      `<td class="${i === 0 ? 'branch' : ''}">${esc(c)}</td>`).join('');
    const ranks = years.map(y => {
      const v = r.byYear[y];
      return v == null
        ? '<td class="rank dim">—</td>'
        : `<td class="rank">${fmt(v)}</td>`;
    }).join('');
    return `<tr>${cells}${ranks}</tr>`;
  }).join('\n      ');

  return `  <div class="tablewrap">
    <table>
      <caption>${esc(caption)}<small>${esc(subtitle)}</small></caption>
      <thead>${head}</thead>
      <tbody>
      ${body}
      </tbody>
    </table>
  </div>
`;
}

/* ------------------------------------------------------------- institute page -- */

function institutePage({ inst, seatSections, years, manifest, stateName }) {
  const typeName = TYPE_LABEL[inst.t] ?? inst.t;
  const newest = Math.max(...years);
  const canonical = `${SITE}/colleges/${inst.slug}.html`;

  const allBranches = [...new Set(
    seatSections.flatMap(s => s.rows.map(r => r.cells[0]))
  )];
  const best = Math.min(...seatSections.flatMap(s =>
    s.rows.map(r => r.byYear[newest]).filter(v => v != null)));

  const sections = seatSections.map(s => cutoffTable({
    caption: `${s.seatType} — ${inst.n}`,
    subtitle: `${PAGE_GENDER} pool · closing ranks as published by JoSAA`,
    columns: ['Branch', 'Quota'],
    rows: s.rows,
    years,
  })).join('\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollegeOrUniversity',
        name: inst.n,
        url: canonical,
        ...(stateName ? { address: { '@type': 'PostalAddress', addressRegion: stateName, addressCountry: 'IN' } } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Colleges', item: `${SITE}/colleges.html` },
          { '@type': 'ListItem', position: 3, name: inst.n, item: canonical },
        ],
      },
    ],
  };

  const title = `${inst.n} — JoSAA Cutoffs ${years[0]}–${newest} (Branch-wise Closing Ranks) | Lume Live`;
  const description = `Branch-wise JoSAA opening and closing ranks for ${inst.n} across ${years.join(', ')}, taken from the official JoSAA archive. Compare seat types and quotas, then check your own rank.`;

  const careers = careerLinksFor(allBranches, 1);

  return head({ title, description, canonical, jsonLd, depth: 1 }) + `
<div class="wrap">
  <nav class="crumbs"><a href="../index.html">Home</a> › <a href="../colleges.html">Colleges</a> › ${esc(inst.n)}</nav>

  <div class="hero">
    <span class="eyebrow">${esc(inst.t)}${stateName ? ' · ' + esc(stateName) : ''}</span>
    <h1>${esc(inst.n)} — JoSAA cutoffs</h1>
    <p>Branch-wise closing ranks for ${esc(inst.n)}, a ${esc(typeName)}, as published in the official JoSAA opening and closing rank archive for ${years.join(', ')}. Ranks below are for the ${PAGE_GENDER.toLowerCase()} pool.</p>
    <div class="stats">
      <div class="stat"><b>${allBranches.length}</b><span>Branches</span></div>
      <div class="stat"><b>${seatSections.length}</b><span>Seat types</span></div>
      ${Number.isFinite(best) ? `<div class="stat"><b>${fmt(best)}</b><span>Best ${newest} closing</span></div>` : ''}
      <div class="stat"><b>${years.length}</b><span>Years of data</span></div>
    </div>
  </div>

  <div class="note">
    <b>Which rank applies here</b>
    ${inst.t === 'IIT'
      ? 'IIT seats are allotted on your <strong>JEE Advanced</strong> rank. The numbers below are Advanced ranks and cannot be compared with JEE Main ranks.'
      : 'Seats here are allotted on your <strong>JEE Main</strong> rank. For reserved seat types the figures are category ranks, not Common Rank List ranks.'}
  </div>

${sections}
${leadBox(1, 'Is your rank in range?',
    'These are last year\'s numbers, not this year\'s. The predictor puts your rank against them and sorts the result into safe, target and reach.')}
  <div class="note">
    <b>How to read this</b>
    A closing rank is the last rank admitted in that round — so a rank better than the number shown would have got a seat. Cutoffs move every year with candidate numbers and seat additions, and a branch that closed early one year can stay open the next. Use this to build a shortlist, not to rule anything in or out with certainty.
  </div>

  <section class="faq">
    <h2>Common questions</h2>
    <details>
      <summary>Are these the final cutoffs?</summary>
      <p>They are the closing ranks JoSAA published for the rounds in its archive. Later rounds usually close at a wider rank than earlier ones, because seats free up as candidates withdraw.</p>
    </details>
    <details>
      <summary>Why do some branches show a dash?</summary>
      <p>A dash means JoSAA published no closing rank for that branch, quota and seat type in that year — usually because the seat did not exist yet, or nobody was allotted it. We leave it blank rather than carry over a number from another year.</p>
    </details>
    <details>
      <summary>What about female-only seats?</summary>
      <p>Those are a separate pool with their own, usually more generous, cutoffs. The rank predictor covers them — switch the gender pool there.</p>
    </details>
  </section>
${careers.length ? `
  <section class="related">
    <h2>Before you commit to a branch</h2>
    ${careers.join('\n    ')}
    <a href="../book-session.html">Talk it through with a counsellor</a>
  </section>
` : ''}` + tail(1);
}

/* ---------------------------------------------------------------- branch page -- */

function branchPage({ branch, rows, years, instituteCount }) {
  const newest = Math.max(...years);
  const slug = `branch-${branch.slug}`;
  const canonical = `${SITE}/colleges/${slug}.html`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: `${branch.n} — JoSAA cutoffs across institutes`,
        url: canonical,
        isBasedOn: SOURCE_URL,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Colleges', item: `${SITE}/colleges.html` },
          { '@type': 'ListItem', position: 3, name: branch.n, item: canonical },
        ],
      },
    ],
  };

  const title = `${branch.n} Cutoffs ${newest} — JoSAA Closing Ranks Across ${instituteCount} Institutes | Lume Live`;
  const description = `${branch.n} JoSAA closing ranks across ${instituteCount} IITs, NITs, IIITs and GFTIs for ${years.join(', ')}, from the official JoSAA archive. Open category, gender-neutral pool.`;

  const table = cutoffTable({
    caption: `${branch.n} — OPEN seats, ${PAGE_GENDER} pool`,
    subtitle: 'Sorted by most recent closing rank. IIT rows are JEE Advanced ranks; all others are JEE Main ranks.',
    columns: ['Institute', 'Type', 'Quota'],
    rows,
    years,
  });

  const careers = careerLinksFor([branch.n], 1);

  return head({ title, description, canonical, jsonLd, depth: 1 }) + `
<div class="wrap">
  <nav class="crumbs"><a href="../index.html">Home</a> › <a href="../colleges.html">Colleges</a> › ${esc(branch.n)}</nav>

  <div class="hero">
    <span class="eyebrow">Branch comparison</span>
    <h1>${esc(branch.n)} — where your rank can take you</h1>
    <p>JoSAA closing ranks for ${esc(branch.n)} across ${instituteCount} institutes, for ${years.join(', ')}. Open category, ${PAGE_GENDER.toLowerCase()} pool, taken from the official JoSAA archive.</p>
  </div>

  <div class="note">
    <b>Read the Type column first</b>
    IIT rows are <strong>JEE Advanced</strong> ranks. NIT, IIIT and GFTI rows are <strong>JEE Main</strong> ranks. They are different exams on different scales — a number in one row is not comparable to a number in another unless the Type matches.
  </div>

${table}
${leadBox(1, 'Which of these is realistic for you?',
    'Enter your rank, category and home state and the predictor sorts every option into safe, target and reach.')}
${careers.length ? `
  <section class="related">
    <h2>Is this the right branch for you?</h2>
    ${careers.join('\n    ')}
    <a href="../book-session.html">Talk it through with a counsellor</a>
  </section>
` : ''}` + tail(1);
}

/* --------------------------------------------------------------------- build -- */

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(DATA, 'manifest.json'), 'utf8'));
  } catch {
    console.error('No data/josaa/manifest.json — run tools/josaa-ingest.mjs first.');
    process.exit(1);
  }

  let stateMap = null;
  try {
    stateMap = JSON.parse(await fs.readFile(path.join(DATA, 'institute-states.json'), 'utf8'));
  } catch { /* optional */ }

  const stateFor = name => {
    if (!stateMap) return null;
    const lower = name.toLowerCase();
    const hit = stateMap.institutes.find(i => lower.includes(i.match));
    return hit ? stateMap.states[hit.state] : null;
  };

  const years = [...manifest.years].sort();
  if (!years.length) { console.error('manifest.years is empty — nothing to generate.'); process.exit(1); }

  /* Load only the gender pool these pages present. */
  const shardEntries = Object.entries(manifest.shards ?? {})
    .filter(([key]) => key.endsWith(`__${PAGE_GENDER}`));
  if (!shardEntries.length) {
    console.error(`No shards for the ${PAGE_GENDER} pool — nothing to generate.`);
    process.exit(1);
  }

  /* instituteId -> seatType -> "branch|quota" -> { byYear } */
  const byInstitute = new Map();
  /* branchId -> "instituteId|quota" -> { byYear, inst } (OPEN only, for branch pages) */
  const byBranch = new Map();

  for (const [key, file] of shardEntries) {
    const seatType = key.slice(0, key.lastIndexOf('__'));
    const shard = JSON.parse(await fs.readFile(path.join(DATA, file), 'utf8'));
    const c = {};
    shard.cols.forEach((name, i) => { c[name] = i; });

    for (const row of shard.rows) {
      const instId = row[c.inst], branchId = row[c.branch];
      const quota = manifest.quotas[row[c.quota]];
      const year = row[c.year], close = row[c.close];

      if (!byInstitute.has(instId)) byInstitute.set(instId, new Map());
      const seats = byInstitute.get(instId);
      if (!seats.has(seatType)) seats.set(seatType, new Map());
      const key2 = `${branchId}|${quota}`;
      const rec = seats.get(seatType).get(key2) ?? { branchId, quota, byYear: {} };
      rec.byYear[year] = close;
      seats.get(seatType).set(key2, rec);

      if (seatType === 'OPEN') {
        if (!byBranch.has(branchId)) byBranch.set(branchId, new Map());
        const key3 = `${instId}|${quota}`;
        const brec = byBranch.get(branchId).get(key3) ?? { instId, quota, byYear: {} };
        brec.byYear[year] = close;
        byBranch.get(branchId).set(key3, brec);
      }
    }
  }

  if (CLEAN && !DRY) await fs.rm(OUT, { recursive: true, force: true });
  if (!DRY) await fs.mkdir(OUT, { recursive: true });

  const newest = Math.max(...years);
  const written = [];
  let biggest = { file: null, bytes: 0 };

  /* ---- institute pages ---- */
  for (const inst of manifest.institutes) {
    const seats = byInstitute.get(inst.id);
    if (!seats) continue;

    const seatSections = [...seats.entries()]
      .sort((a, b) => seatTypeRank(a[0]) - seatTypeRank(b[0]) || a[0].localeCompare(b[0]))
      .map(([seatType, recs]) => ({
        seatType,
        rows: [...recs.values()]
          .map(r => ({
            cells: [
              manifest.branches[r.branchId]?.n ?? 'Unknown branch',
              QUOTA_LABEL[r.quota] ?? r.quota,
            ],
            byYear: r.byYear,
          }))
          .sort((a, b) => (a.byYear[newest] ?? Infinity) - (b.byYear[newest] ?? Infinity)),
      }))
      .filter(s => s.rows.length);

    if (!seatSections.length) continue;

    const html = institutePage({ inst, seatSections, years, manifest, stateName: stateFor(inst.n) });
    const file = path.join(OUT, `${inst.slug}.html`);
    if (!DRY) await fs.writeFile(file, html, 'utf8');
    written.push(`colleges/${inst.slug}.html`);
    if (html.length > biggest.bytes) biggest = { file: `${inst.slug}.html`, bytes: html.length };
  }

  /* ---- branch pages, only where the branch is broadly offered ---- */
  let branchPages = 0;
  for (const [branchId, recs] of byBranch) {
    const branch = manifest.branches[branchId];
    if (!branch) continue;
    const institutes = new Set([...recs.values()].map(r => r.instId));
    if (institutes.size < MIN_INSTITUTES_FOR_BRANCH_PAGE) continue;

    const rows = [...recs.values()]
      .map(r => {
        const inst = manifest.institutes[r.instId];
        return {
          cells: [inst?.n ?? 'Unknown', inst?.t ?? '', QUOTA_LABEL[r.quota] ?? r.quota],
          byYear: r.byYear,
        };
      })
      .sort((a, b) => (a.byYear[newest] ?? Infinity) - (b.byYear[newest] ?? Infinity));

    const html = branchPage({ branch, rows, years, instituteCount: institutes.size });
    const file = path.join(OUT, `branch-${branch.slug}.html`);
    if (!DRY) await fs.writeFile(file, html, 'utf8');
    written.push(`colleges/branch-${branch.slug}.html`);
    branchPages++;
    if (html.length > biggest.bytes) biggest = { file: `branch-${branch.slug}.html`, bytes: html.length };
  }

  /* ---- sitemap ---- */
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${written.map(p => `  <url><loc>${SITE}/${p}</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.6</priority></url>`).join('\n')}
</urlset>
`;
  if (!DRY) await fs.writeFile(path.join(SITEMAP_DIR, 'sitemap-colleges.xml'), sitemap, 'utf8');

  /* ---- stamp the manifest so colleges.html starts linking ---- */
  if (!DRY) {
    manifest.pagesGeneratedAt = new Date().toISOString();
    await fs.writeFile(path.join(DATA, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  }

  console.log(`${DRY ? '[dry run] would write' : 'Wrote'} ${written.length} pages`);
  console.log(`  ${written.length - branchPages} institute pages · ${branchPages} branch pages`);
  console.log(`  sitemap-colleges.xml${DRY ? ' (not written)' : ''}`);
  if (biggest.file) {
    const kb = Math.round(biggest.bytes / 1024);
    console.log(`  largest page: ${biggest.file} (${kb} KB)`);
    if (kb > 400) console.log(`  ! that is heavy for a mobile connection — consider splitting by seat type.`);
  }
  if (!DRY) console.log(`\nAdd sitemap-colleges.xml to robots.txt if it is not already listed.`);
}

main().catch(err => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
