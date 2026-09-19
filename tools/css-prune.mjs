#!/usr/bin/env node
/**
 * Removes rules from index.css whose selectors can never match.
 *
 *   npm i --no-save postcss postcss-selector-parser
 *   node tools/css-prune.mjs           # report what would go
 *   node tools/css-prune.mjs --apply   # rewrite index.css
 *
 * Deliberately NOT wired into CI or the build: it needs postcss, and
 * tests.yml runs on a bare checkout with no install step so the payment
 * tests can never be blocked by a dependency. Run it by hand when the
 * homepage's markup has moved on, and verify the result before committing
 * (screenshot diff + computed-style diff against the previous index.css).
 *
 * index.css is loaded by index.html alone, so "can never match" is decided
 * against that page and the scripts it loads. A rule is KEPT unless every
 * class and id in its selector is absent from all of them.
 *
 * Why string matching rather than browser coverage: Lighthouse's "unused
 * CSS" is coverage-based — it reports what was not needed to paint the
 * first screen, which includes every below-the-fold and state-dependent
 * rule the page genuinely uses. Deleting on that signal breaks the page.
 * Matching identifier tokens across the HTML and JS instead keeps rules
 * that only ever appear via classList.add(), which is most of the
 * interactive styling here.
 *
 * The limit worth knowing: a class assembled from fragments at runtime
 * ("btn-" + kind) is invisible to this. Every concatenation in the current
 * sources appends a whole token (" top", " show", " lcp-light"), so they
 * survive — but re-check that before trusting a future run.
 *
 * Most of what this removed was styling copy-pasted to
 * for-working-professionals.html, which carries its own inline CSS and
 * never loads this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import selParser from 'postcss-selector-parser';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// ---- 1. Build the haystack: every place a class/id name could be referenced.
const SOURCES = ['index.html','cashfree-payments.js','lume-assessment-home.js',
  'lume-auth.js','lume-capture.js','lume-coupons.js','lume-wellbeing-check.js',
  'site-anim.js','lume-story-share.js','lume-qr.js','lume-leaderboard.js'];
let hay = '';
for (const f of SOURCES) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) hay += '\n' + fs.readFileSync(p, 'utf8');
  else console.error('  (missing, skipped)', f);
}
// Every identifier-ish token that appears anywhere in HTML or JS.
const tokens = new Set(hay.match(/[A-Za-z_][\w-]*/g) || []);

const css = fs.readFileSync(path.join(ROOT, 'index.css'), 'utf8');
const root = postcss.parse(css);

// ---- 2. Decide per rule.
const usedKeyframes = new Set();
const keep = new WeakSet();
const dropped = [];
let totalRules = 0;

const namesOf = sel => {
  const out = { classes: [], ids: [], tags: [] };
  try {
    selParser(s => s.walk(n => {
      if (n.type === 'class') out.classes.push(n.value);
      else if (n.type === 'id') out.ids.push(n.value);
      else if (n.type === 'tag') out.tags.push(n.value.toLowerCase());
    })).processSync(sel);
  } catch { return null; }   // unparseable -> caller keeps it
  return out;
};

root.walkRules(rule => {
  if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
  totalRules++;
  // A selector list is kept if ANY of its parts is kept.
  const parts = rule.selectors || [rule.selector];
  const keptParts = parts.filter(sel => {
    const n = namesOf(sel);
    if (!n) return true;                        // couldn't parse -> keep
    if (!n.classes.length && !n.ids.length) return true;  // element/universal -> keep
    return [...n.classes, ...n.ids].every(name => tokens.has(name));
  });
  if (keptParts.length) {
    keep.add(rule);
    if (keptParts.length !== parts.length) rule.selectors = keptParts;
  } else {
    dropped.push({ sel: rule.selector.slice(0, 100), size: rule.toString().length });
  }
});

// ---- 3. Which @keyframes / custom props are still referenced by kept rules?
let keptCss = '';
root.walkRules(r => { if (keep.has(r)) keptCss += r.toString(); });
root.walkAtRules(/keyframes/, at => {
  if (!new RegExp(`(^|[^\\w-])${at.params}([^\\w-]|$)`).test(keptCss)) {
    dropped.push({ sel: '@keyframes ' + at.params, size: at.toString().length, kf: true });
  } else usedKeyframes.add(at.params);
});

const droppedBytes = dropped.reduce((a, d) => a + d.size, 0);
console.log(`rules: ${totalRules} | would drop: ${dropped.filter(d=>!d.kf).length} rules + ${dropped.filter(d=>d.kf).length} keyframes`);
console.log(`bytes: ${(css.length/1024).toFixed(0)}KB total, ~${(droppedBytes/1024).toFixed(0)}KB droppable`);
console.log('\nsample of dropped selectors:');
dropped.slice(0, 40).forEach(d => console.log('   ', d.sel));

if (APPLY) {
  // Keyframe steps (0%, 100%, from, to) are rules too, and the analysis loop
  // above deliberately skips them — so they are not in `keep`. Removing every
  // rule outside `keep` therefore empties every @keyframes block, and the
  // empty-at-rule sweep below then deletes the lot, silently killing every
  // animation on the page. Skip them here the same way.
  root.walkRules(r => {
    if (r.parent?.type === 'atrule' && /keyframes/i.test(r.parent.name)) return;
    if (!keep.has(r)) r.remove();
  });
  root.walkAtRules(/keyframes/, at => { if (!usedKeyframes.has(at.params)) at.remove(); });
  // drop at-rules left empty
  let again = true;
  while (again) { again = false;
    root.walkAtRules(at => { if (at.nodes && at.nodes.length === 0) { at.remove(); again = true; } }); }
  fs.writeFileSync(path.join(ROOT, 'index.css'), root.toString());
  console.log('\nwrote index.css');
}
