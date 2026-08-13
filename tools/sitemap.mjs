#!/usr/bin/env node
/**
 * Regenerates sitemap.xml from the HTML actually present in the repo.
 *
 *   node tools/sitemap.mjs           # write sitemap.xml
 *   node tools/sitemap.mjs --check   # exit 1 if sitemap.xml is stale (CI)
 *
 * Rules:
 *  - a page is included iff it is not <meta name="robots" content="noindex">
 *  - index.html is emitted as the bare origin, matching its canonical
 *  - <lastmod> is the file's last git commit date, so it reflects real edits
 *  - a page whose canonical points elsewhere is skipped, since only the
 *    canonical URL belongs in a sitemap
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://lumelive.co.in/';

// Longest matching prefix wins; falls through to the default.
const PRIORITY = [
  [/^index\.html$/,                    '1.0',  'weekly'],
  [/^index-hi\.html$/,                 '0.95', 'weekly'],
  [/^assessment\.html$/,               '0.95', 'weekly'],
  [/^(book-session|start)\.html$/,     '0.9',  'weekly'],
  [/^career-intelligence\.html$/,      '0.92', 'weekly'],
  [/^for-working-professionals\.html$/,'0.9',  'weekly'],
  [/^career-counselling-in-/,          '0.85', 'monthly'],
  [/^career-counselling-/,             '0.85', 'monthly'],
  [/^mental-health-counselling-/,      '0.85', 'monthly'],
  [/^(services-pricing|for-parents)\.html$/, '0.8', 'monthly'],
  [/^(career-explorer|career-library|compare-careers)\.html$/, '0.8', 'weekly'],
  [/^(college-predictor|colleges|choice-list|stream-selector)\.html$/, '0.8', 'weekly'],
  [/^career-as-/,                      '0.75', 'monthly'],
  [/^career-options-after-/,           '0.75', 'monthly'],
  [/-vs-/,                             '0.7',  'monthly'],
  [/^is-.*-right-for-you\.html$/,      '0.7',  'monthly'],
  [/^(internships|school-partnerships|partner-with-us)\.html$/, '0.7', 'monthly'],
  [/^(privacy-policy|terms|refund-policy|internship-ethics)\.html$/, '0.3', 'yearly'],
];
const DEFAULT = ['0.65', 'monthly'];

// The two homepages are translations of each other.
const ALTERNATES = [
  ['en-in',     ORIGIN],
  ['hi-in',     ORIGIN + 'index-hi.html'],
  ['x-default', ORIGIN],
];
const HREFLANG_PAGES = new Set(['index.html', 'index-hi.html']);

const lastmod = file => {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', file],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    if (d) return d;
  } catch { /* not in git yet */ }
  return fs.statSync(path.join(ROOT, file)).mtime.toISOString().slice(0, 10);
};

const pages = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html'))
  .sort()
  .filter(f => {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const robots = (h.match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/i) || [, ''])[1];
    if (/noindex/i.test(robots)) return false;
    const canon = (h.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i) || [, ''])[1];
    const expected = f === 'index.html' ? ORIGIN : ORIGIN + f;
    if (canon && canon !== expected) {
      console.warn(`skip ${f}: canonical points to ${canon}`);
      return false;
    }
    return true;
  });

const body = pages.map(f => {
  const loc = f === 'index.html' ? ORIGIN : ORIGIN + f;
  const rule = PRIORITY.find(([re]) => re.test(f));
  const [priority, changefreq] = rule ? rule.slice(1) : DEFAULT;
  const alts = HREFLANG_PAGES.has(f)
    ? ALTERNATES.map(([l, href]) =>
        `\n    <xhtml:link rel="alternate" hreflang="${l}" href="${href}"/>`).join('')
    : '';
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod(f)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${alts}
  </url>`;
}).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;

const out = path.join(ROOT, 'sitemap.xml');
if (process.argv.includes('--check')) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (current !== xml) {
    console.error('sitemap.xml is stale — run: node tools/sitemap.mjs');
    process.exit(1);
  }
  console.log(`sitemap.xml is up to date (${pages.length} urls)`);
} else {
  fs.writeFileSync(out, xml);
  console.log(`wrote sitemap.xml with ${pages.length} urls`);
}
