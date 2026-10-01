#!/usr/bin/env node
/**
 * Layout-shift guard tests. Run: node tools/cls-guard.test.mjs
 *
 * index.css (~190 KB) loads after first paint. Until it lands, anything it
 * hides on a phone is visible: the mobile menu renders open in the page,
 * the desktop links and the hero's right panel widen the layout, and the
 * hero jumps ~1,500px when the stylesheet arrives. That was a 1.0 layout
 * shift (Google wants under 0.1) and a mobile Lighthouse score of 50.
 *
 * The rules that prevent it live in <style id="cls-guard">, outside the
 * critical-css block, because tools/build-critical-css.mjs rewrites that
 * block and only keeps rules for visible elements, so it would drop these.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let passed = 0;
function test(name, fn){ fn(); passed++; console.log(`ok - ${name}`); }

const guard = (html.match(/<style id="cls-guard">([\s\S]*?)<\/style>/) || [])[1];

test('the guard block exists, separate from critical-css', () => {
  assert.ok(guard, 'missing <style id="cls-guard">');
  const critical = (html.match(/<style id="critical-css">([\s\S]*?)<\/style>/) || [])[1] || '';
  assert.ok(!critical.includes('CLS guard'), 'guard rules must not live inside critical-css');
});

test('it comes before index.css is requested', () => {
  assert.ok(html.indexOf('id="cls-guard"') < html.indexOf('href="index.css"'));
});

test('it hides everything index.css hides on a phone', () => {
  const css = guard.replace(/\s+/g, '');
  for(const rule of ['.mob-menu{display:none}', '.mob-menu.open{display:block}']){
    assert.ok(css.includes(rule), `missing ${rule}`);
  }
  const mobile = (css.match(/@media\(max-width:960px\)\{([^}]*\}[^}]*\}[^}]*\})/) || [])[1] || '';
  for(const sel of ['.nav-links', '.side-icons', '.hero-right']){
    assert.ok(mobile.includes(`${sel}{display:none}`), `${sel} must be hidden under 960px`);
  }
});

test('it pins the nav height and the decorative particle box', () => {
  const css = guard.replace(/\s+/g, '');
  assert.match(css, /\.nav-inner\{[^}]*height:var\(--nav-h\)/);
  assert.match(css, /#hero\.hero-particles\{[^}]*height:100svh/);
});

console.log(`\n${passed} layout-shift guard tests passed.`);
