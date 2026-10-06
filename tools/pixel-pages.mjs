#!/usr/bin/env node
/*
  Lume Live — which pages may carry the Meta Pixel.

  Adds <script src="lume-pixel.js" defer></script> right after the GA4
  snippet on every page that has GA4, except the pages in NO_PIXEL. It also
  lets Meta through the page's Content-Security-Policy. lume-pixel.js itself
  loads nothing until a visitor consents.

  NO_PIXEL is the line that keeps wellbeing data away from Meta. Mental-health
  pages, self-tests and stress articles must never load it: even a page view
  there says something about the visitor's health. A new page on any of these
  topics belongs in this list.

    node tools/pixel-pages.mjs           update pages in place
    node tools/pixel-pages.mjs --check   fail if any page is out of line (CI)
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GA_ID = 'G-1CZ93P4P3V';
export const TAG = '<script src="lume-pixel.js" defer></script>';

export const NO_PIXEL = [
  /^mental-health-counselling.*\.html$/,
  /^mental-health-calendar\.html$/,
  /^free-anxiety-test\.html$/,
  /^free-depression-test\.html$/,
  /^self-esteem-test\.html$/,
  /^exam-stress-test\.html$/,
  /^work-stress-burnout-test\.html$/,
  /^wellbeing-check\.html$/,
  /^student-mental-health-india\.html$/,
  /^how-to-deal-with-exam-anxiety\.html$/,
  /^board-exam-stress-guide\.html$/,
  /^story-exam-burnout\.html$/,
  /^report-template\.html$/
];

// What Meta needs from each CSP directive.
const CSP_ADD = {
  'script-src': ['connect.facebook.net'],
  'img-src': ['www.facebook.com'],
  'connect-src': ['www.facebook.com', 'connect.facebook.net']
};

export function wantsPixel(file, html){
  return html.includes(GA_ID) && !NO_PIXEL.some(re => re.test(file));
}

// Adds Meta's hosts to each directive. A directive the page does not set
// would fall back to default-src 'self' and block Meta, so it is added as
// 'self' plus the hosts, which keeps everything else exactly as strict.
export function patchCsp(csp){
  const parts = csp.split(';').map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = parts.map(part => {
    const [name, ...vals] = part.split(/\s+/);
    const add = CSP_ADD[name];
    if(!add) return part;
    seen.add(name);
    for(const host of add) if(!vals.includes(host)) vals.push(host);
    return [name, ...vals].join(' ');
  });
  for(const [name, hosts] of Object.entries(CSP_ADD)){
    if(!seen.has(name)) out.push([name, "'self'", ...hosts].join(' '));
  }
  return out.join('; ') + ';';
}

export function cspAllowsPixel(csp){
  const get = name => {
    const m = csp.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`));
    return m ? m[1].split(/\s+/) : null;
  };
  const script = get('script-src'), img = get('img-src'), connect = get('connect-src');
  return Boolean(script && script.includes('connect.facebook.net') &&
    img && img.includes('www.facebook.com') &&
    connect && connect.includes('www.facebook.com'));
}

const CSP_RE = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;

// Where the tag goes: after the inline <script> that follows the GA loader.
function insertAt(html){
  const loader = html.indexOf(`gtag/js?id=${GA_ID}`);
  if(loader < 0) return -1;
  const afterLoader = html.indexOf('</script>', loader) + '</script>'.length;
  const nextOpen = html.indexOf('<script', afterLoader);
  const inlineEnd = html.indexOf('</script>', nextOpen);
  // Only treat it as the GA inline block if it actually configures GA.
  if(nextOpen < 0 || !html.slice(nextOpen, inlineEnd).includes(GA_ID)) return afterLoader;
  return inlineEnd + '</script>'.length;
}

export function applyPixel(html){
  let out = html;
  if(!out.includes(TAG)){
    const at = insertAt(out);
    if(at < 0) throw new Error('no GA4 snippet to anchor on');
    out = out.slice(0, at) + '\n' + TAG + out.slice(at);
  }
  out = out.replace(CSP_RE, (_, a, csp, b) => a + patchCsp(csp) + b);
  return out;
}

export function problems(file, html){
  const has = html.includes(TAG);
  const csp = (html.match(CSP_RE) || [])[2];
  if(!wantsPixel(file, html)) return has ? ['has the Pixel but must not'] : [];
  const p = [];
  if(!has) p.push('missing the Pixel tag');
  if(csp && !cspAllowsPixel(csp)) p.push('CSP blocks Meta');
  return p;
}

function pages(){
  return fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const check = process.argv.includes('--check');
  let bad = 0, changed = 0, withPixel = 0;
  for(const file of pages()){
    const full = path.join(ROOT, file);
    const html = fs.readFileSync(full, 'utf8');
    if(check){
      for(const p of problems(file, html)){ console.error(`${file}: ${p}`); bad++; }
      if(html.includes(TAG)) withPixel++;
      continue;
    }
    if(!wantsPixel(file, html)) continue;
    const next = applyPixel(html);
    withPixel++;
    if(next !== html){ fs.writeFileSync(full, next); changed++; }
  }
  if(check){
    if(bad){ console.error(`\n${bad} problem(s). Fix with: node tools/pixel-pages.mjs`); process.exit(1); }
    console.log(`Pixel placement OK: ${withPixel} pages carry it, none of the no-pixel pages do.`);
  }else{
    console.log(`${changed} page(s) updated; ${withPixel} carry the Pixel.`);
  }
}
