#!/usr/bin/env node
/**
 * Redirect tests. Run: node tools/redirects.test.mjs
 *
 * vercel.json permanently redirects retired pages (the copy-paste city
 * pages Google treated as doorway pages) to the page that replaced them.
 * These checks keep that tidy: a retired page must stay deleted, its
 * replacement must exist, and nothing on the site may link to the old
 * address — an internal link through a redirect wastes Google's crawl and
 * tells it the old page still matters.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { redirects = [] } = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

let passed = 0;
function test(name, fn){ fn(); passed++; console.log(`ok - ${name}`); }

test('every redirect is permanent, from a deleted page to a live one', () => {
  assert.ok(redirects.length > 0, 'no redirects found');
  for(const r of redirects){
    assert.equal(r.permanent, true, `${r.source} should be permanent`);
    const from = r.source.replace(/^\//, '');
    const to = r.destination.replace(/^\//, '');
    assert.ok(!fs.existsSync(path.join(ROOT, from)), `${from} still exists; delete it`);
    assert.ok(fs.existsSync(path.join(ROOT, to)), `${to} is missing`);
  }
});

test('no page links to a redirected address', () => {
  const sources = redirects.map(r => r.source.replace(/^\//, ''));
  const bad = [];
  for(const f of pages){
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for(const s of sources){
      if(html.includes(`"${s}"`) || html.includes(`/${s}"`)) bad.push(`${f} -> ${s}`);
    }
  }
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  for(const s of sources) if(sitemap.includes(`/${s}<`)) bad.push(`sitemap.xml -> ${s}`);
  assert.deepEqual(bad, []);
});

console.log(`\n${passed} redirect tests passed.`);
