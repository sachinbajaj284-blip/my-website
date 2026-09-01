#!/usr/bin/env node
/**
 * build-critical-css.mjs — regenerate the inlined above-the-fold CSS in index.html.
 *
 *   node tools/build-critical-css.mjs            # rewrite the <style id="critical-css"> block
 *   node tools/build-critical-css.mjs --check    # fail if it is stale, write nothing
 *
 * Why this exists: index.css is ~195 KB and render-blocking, which held first paint
 * at 5.4s on a phone. The rules needed to paint the first screen are ~25 KB of that,
 * so they are inlined and the rest loads non-blocking.
 *
 * The catch with any critical-CSS setup is that it goes stale silently — someone
 * edits the hero, the inlined copy still describes the old one, and the page flashes
 * the wrong layout before the real stylesheet arrives. Run --check in CI, or run this
 * whenever the top of the homepage changes.
 *
 * Needs Playwright and a local server; both are only dev dependencies, nothing here
 * ships to the browser.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8123;
const CHECK = process.argv.includes('--check');

/* The viewport the critical set is computed for. A phone, because that is what the
   Lighthouse mobile score and most of the audience actually use. Anything wider gets
   the same CSS plus a slightly larger first screen, which is harmless. */
const VIEWPORT = { width: 390, height: 844 };

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
               '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
               '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
               '.ico': 'image/x-icon' };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer(async (req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
      try {
        const buf = await fs.readFile(path.join(ROOT, rel));
        res.writeHead(200, { 'Content-Type': MIME[path.extname(rel)] || 'application/octet-stream' });
        res.end(buf);
      } catch { res.writeHead(404); res.end('not found'); }
    });
    server.listen(PORT, () => resolve(server));
  });
}

/* Runs in the page. A rule is critical if any element it matches intersects the first
   viewport. Custom-property and element-level blocks always come along, because
   everything downstream resolves against them. */
function collectCritical() {
  const VH = window.innerHeight;
  const sheet = [...document.styleSheets].find(s => s.href && s.href.includes('index.css'));
  if (!sheet) return { error: 'index.css not found as a stylesheet — is it still linked synchronously for extraction?' };

  const seen = new Set();
  const critical = [];

  const aboveFold = sel => {
    let els;
    try { els = document.querySelectorAll(sel); } catch { return false; }
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.top < VH && r.bottom > -50 && r.width > 0) return true;
    }
    return false;
  };

  const walk = (rules, media) => {
    for (const rule of rules) {
      if (rule.type === CSSRule.STYLE_RULE) {
        /* Match on the base selector — an element cannot be :hover during a static
           measurement, but its hover rule is still needed to avoid a restyle. */
        const probe = rule.selectorText.split(',')
          .map(s => s.replace(/::?(before|after|hover|focus|active|focus-visible|placeholder|-webkit-[\w-]+)/g, '').trim())
          .filter(Boolean).join(',');
        if (probe && aboveFold(probe) && !seen.has(rule.cssText)) {
          seen.add(rule.cssText); critical.push({ css: rule.cssText, media });
        }
      } else if (rule.type === CSSRule.MEDIA_RULE) {
        walk(rule.cssRules, rule.conditionText || rule.media.mediaText);
      } else if (rule.type === CSSRule.SUPPORTS_RULE) {
        walk(rule.cssRules, media);
      }
    }
  };
  walk(sheet.cssRules, null);

  const roots = [];
  const collectRoot = rules => {
    for (const rule of rules) {
      if (rule.type === CSSRule.STYLE_RULE && /^(:root|html|body|\*)/.test(rule.selectorText.trim())) {
        if (!seen.has(rule.cssText)) { seen.add(rule.cssText); roots.push(rule.cssText); }
      } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
        collectRoot(rule.cssRules);
      }
    }
  };
  collectRoot(sheet.cssRules);

  return { total: sheet.cssRules.length, critical, roots };
}

const require_ = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require_('playwright'));
} catch {
  console.error('Playwright is not installed. npm i -D playwright, then re-run.');
  process.exit(2);
}

const server = await serve();
const html = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');

/* Extraction measures a copy of the page, not the page itself, and that copy has to
   differ in two ways:
     1. index.css becomes a plain blocking <link>, so the real cascade is in effect
        rather than the preload swap the shipped page uses.
     2. the existing inlined block is removed. Leaving it in makes the tool measure a
        page already styled by its own previous output, so the result depends on what
        it produced last time and never settles. Stripping it makes each run
        deterministic and the --check comparison meaningful. */
const EXTRACT = 'index.__extract__.html';
await fs.writeFile(
  path.join(ROOT, EXTRACT),
  html
    .replace(/<style id="critical-css">[\s\S]*?<\/style>/, '')
    .replace(/<link rel="preload" href="index\.css"[^>]*>/, '<link rel="stylesheet" href="index.css">'),
  'utf8'
);

/* Playwright looks for the exact browser build its own version pins. On a machine
   where Chromium was provisioned separately (a CI image, this repo's sandbox) that
   path will not exist, and the default launch dies with "run npx playwright install".
   Find whatever Chromium is actually present and use it. */
async function findChromium() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', `${process.env.HOME}/.cache/ms-playwright`]
    .filter(Boolean);
  for (const root of roots) {
    let entries;
    try { entries = await fs.readdir(root); } catch { continue; }
    for (const dir of entries.filter(d => d.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(root, dir, rel);
        try { await fs.access(p); return p; } catch { /* keep looking */ }
      }
    }
  }
  return null;
}

/* Which Chromium is used is not a detail: cssText serialisation differs between
   builds, so a block generated with one and checked with another reads as
   "stale" when nothing has actually changed. That made the --check in CI
   impossible to satisfy — the runner resolved a headless-shell build while a
   contributor had a full Chromium, same rules, different bytes.

   So prefer the build Playwright itself pins, which CI and anyone who has run
   `npx playwright install chromium` both have, and fall back to whatever is
   lying around only when that one is genuinely absent. Bumping the playwright
   dependency changes the pinned build and will need one regeneration. */
async function pinnedChromium() {
  try {
    const p = chromium.executablePath();
    await fs.access(p);
    return p;
  } catch { return null; }
}

let out;
try {
  const executablePath = (await pinnedChromium()) || (await findChromium());
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await (await browser.newContext({ viewport: VIEWPORT })).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/${EXTRACT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const result = await page.evaluate(collectCritical);
  await browser.close();

  if (result.error) { console.error(result.error); process.exit(1); }

  const byMedia = new Map();
  for (const r of result.critical) {
    const k = r.media || '';
    if (!byMedia.has(k)) byMedia.set(k, []);
    byMedia.get(k).push(r.css);
  }
  out = result.roots.join('\n') + '\n';
  for (const [m, rules] of byMedia) {
    out += m ? `@media ${m}{\n${rules.join('\n')}\n}\n` : rules.join('\n') + '\n';
  }
  console.log(`${result.critical.length} of ${result.total} rules are above the fold — ${(out.length / 1024).toFixed(1)} KB`);
} finally {
  await fs.rm(path.join(ROOT, EXTRACT), { force: true });
  server.close();
}

const current = html.match(/<style id="critical-css">([\s\S]*?)<\/style>/)?.[1] ?? null;

/* Compared with whitespace flattened rather than character for character.
   Chromium builds serialise cssText with small formatting differences, so an
   exact comparison reports "stale" for a block that is the same CSS — which is
   what made this check impossible to satisfy in CI, where the runner's build
   differs from whatever a contributor happens to have. Any real change still
   differs after flattening; only spacing is forgiven. */
const flatten = css => css.replace(/\s+/g, ' ').replace(/\s*([{};:,])\s*/g, '$1').trim();

if (CHECK) {
  if (current === null) { console.error('No <style id="critical-css"> block in index.html.'); process.exit(1); }
  if (flatten(current) !== flatten(out)) {
    console.error('Critical CSS is stale. Run: node tools/build-critical-css.mjs');
    process.exit(1);
  }
  console.log('Critical CSS is up to date.');
} else {
  if (current === null) { console.error('No <style id="critical-css"> block to update.'); process.exit(1); }
  await fs.writeFile(
    path.join(ROOT, 'index.html'),
    html.replace(/<style id="critical-css">[\s\S]*?<\/style>/, `<style id="critical-css">${out}</style>`),
    'utf8'
  );
  console.log('Updated the critical-css block in index.html.');
}
