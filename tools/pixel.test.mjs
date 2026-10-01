#!/usr/bin/env node
/**
 * Meta Pixel tests. Run: node tools/pixel.test.mjs
 *
 * Two promises are checked here, because breaking either is a legal and
 * trust problem, not a cosmetic one:
 *   1. Nothing goes to Meta before a visitor taps Allow.
 *   2. Nothing from the wellbeing self-checks ever goes to Meta, and the
 *      Pixel is never on a mental-health page.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { NO_PIXEL, TAG, problems, patchCsp, cspAllowsPixel, applyPixel } from './pixel-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lume-pixel.js'), 'utf8');

let passed = 0;
function test(name, fn){ fn(); passed++; console.log(`ok - ${name}`); }

/* ---- a DOM just big enough for lume-pixel.js ---- */
function el(tag){
  return {
    tagName: tag.toUpperCase(), children: [], attrs: {}, listeners: {}, parentNode: null,
    innerHTML: '', className: '',
    setAttribute(k, v){ this.attrs[k] = String(v); },
    getAttribute(k){ return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k){ return k in this.attrs; },
    addEventListener(t, fn){ (this.listeners[t] = this.listeners[t] || []).push(fn); },
    appendChild(c){ c.parentNode = this; this.children.push(c); return c; },
    removeChild(c){ this.children = this.children.filter(x => x !== c); c.parentNode = null; },
    insertBefore(c){ return this.appendChild(c); }
  };
}

function page({ consent = null, bodyAttrs = {} } = {}){
  const store = new Map(consent ? [['lume_mkt_consent', consent]] : []);
  const head = el('head');
  const firstScript = el('script');
  head.appendChild(firstScript);
  const body = el('body');
  Object.assign(body.attrs, bodyAttrs);
  const docListeners = {};
  const gaCalls = [];
  const document = {
    body,
    createElement: el,
    getElementsByTagName: () => [firstScript],
    addEventListener(t, fn){ (docListeners[t] = docListeners[t] || []).push(fn); }
  };
  const window = {
    document,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    },
    gtag(...args){ gaCalls.push(args); return 'ga-result'; }
  };
  window.window = window;
  vm.runInNewContext(SRC, window);

  const scripts = () => head.children.filter(c => c.tagName === 'SCRIPT' && c.src);
  const fbqCalls = () => {
    if(!window.fbq) return [];
    // Objects made inside the vm sandbox have its prototypes; compare as data.
    return JSON.parse(JSON.stringify(window.fbq.queue.map(a => Array.from(a))));
  };
  const bar = () => body.children.find(c => c.className === 'lume-consent');
  const click = (target, l) => {
    const e = { target: { closest: sel => (sel === '[data-lc]' || sel === '[data-lume-consent]') ? target : null }, preventDefault(){} };
    for(const fn of l) fn(e);
  };
  return {
    window, store, gaCalls, scripts, fbqCalls, bar,
    choose(v){ click({ getAttribute: () => v }, bar().listeners.click); },
    openChoices(){ click({}, docListeners.click || []); }
  };
}

/* ---- behaviour ---- */

test('first visit: bar shown, nothing loaded from Meta', () => {
  const p = page();
  assert.ok(p.bar(), 'consent bar should show');
  assert.equal(p.window.fbq, undefined);
  assert.equal(p.scripts().length, 0);
});

test('Allow loads Meta with automatic scraping off before init', () => {
  const p = page();
  p.choose('yes');
  assert.equal(p.store.get('lume_mkt_consent'), 'granted');
  assert.equal(p.bar(), undefined);
  assert.equal(p.scripts()[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  const calls = p.fbqCalls();
  const ac = calls.findIndex(c => c[0] === 'set' && c[1] === 'autoConfig' && c[2] === false);
  const init = calls.findIndex(c => c[0] === 'init');
  assert.ok(ac >= 0 && ac < init, 'autoConfig false must precede init');
  assert.equal(calls[init][1], '2567834410403965');
  assert.deepEqual(calls[init + 1], ['track', 'PageView']);
});

test('No thanks loads nothing and the bar stays away', () => {
  const p = page();
  p.choose('no');
  assert.equal(p.store.get('lume_mkt_consent'), 'denied');
  assert.equal(p.window.fbq, undefined);
  assert.equal(page({ consent: 'denied' }).bar(), undefined);
});

test('events before consent never reach Meta, GA still gets them', () => {
  const p = page();
  p.window.gtag('event', 'payment_success', { value: 249 });
  assert.equal(p.window.fbq, undefined);
  assert.equal(p.gaCalls.length, 1);
});

test('wellbeing self-check events are never sent to Meta', () => {
  const p = page({ consent: 'granted' });
  const before = p.fbqCalls().length;
  p.window.gtag('event', 'selfcheck_start', { event_label: 'gad7' });
  p.window.gtag('event', 'selfcheck_complete', { event_label: 'gad7', band: 'Severe anxiety range', score: '18 / 21' });
  p.window.gtag('event', 'whatsapp_click', { event_label: 'GAD-7', band: 'Severe anxiety range' });
  assert.equal(p.fbqCalls().length, before);
  assert.equal(p.gaCalls.length, 3, 'GA must still receive them');
  assert.doesNotMatch(JSON.stringify(p.fbqCalls()), /anxiety|band|gad7/i);
});

test('allow-listed events map to Meta without their parameters', () => {
  const p = page({ consent: 'granted' });
  const n = p.fbqCalls().length;
  p.window.gtag('event', 'free_test_completed', { event_label: 'Investigative' });
  p.window.gtag('event', 'stream_quiz_lead', { email: 'x@y.z' });
  p.window.gtag('event', 'booking_whatsapp_click', { event_label: 'mental health session' });
  p.window.gtag('event', 'payment_initiated', { value: 249, event_label: 'mh-session' });
  p.window.gtag('event', 'payment_success', { value: 249, transaction_id: 'ord_1', event_label: 'mh-session' });
  assert.deepEqual(p.fbqCalls().slice(n), [
    ['trackCustom', 'AssessmentComplete'],
    ['track', 'Lead'],
    ['track', 'Contact'],
    ['track', 'InitiateCheckout', { value: 249, currency: 'INR' }],
    ['track', 'Purchase', { value: 249, currency: 'INR' }]
  ]);
});

test('the gtag wrapper returns what GA returns and passes every call through', () => {
  const p = page({ consent: 'granted' });
  assert.equal(p.window.gtag('event', 'coupon_removed'), 'ga-result');
  assert.deepEqual(p.gaCalls.at(-1), ['event', 'coupon_removed']);
});

test('Cookie choices reopens the bar; revoking stops Meta', () => {
  const p = page({ consent: 'granted' });
  assert.equal(p.bar(), undefined);
  p.openChoices();
  assert.ok(p.bar());
  p.choose('no');
  assert.deepEqual(p.fbqCalls().at(-1), ['consent', 'revoke']);
});

test('data-no-pixel on <body> disables everything', () => {
  const p = page({ consent: 'granted', bodyAttrs: { 'data-no-pixel': '' } });
  assert.equal(p.window.fbq, undefined);
  assert.equal(p.bar(), undefined);
});

/* ---- page placement ---- */

test('every page is in line: Pixel where allowed, never on wellbeing pages', () => {
  const bad = [];
  let carrying = 0;
  for(const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))){
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for(const p of problems(f, html)) bad.push(`${f}: ${p}`);
    if(html.includes(TAG)){
      carrying++;
      assert.ok(!NO_PIXEL.some(re => re.test(f)), `${f} must not carry the Pixel`);
    }
  }
  assert.deepEqual(bad, [], 'run: node tools/pixel-pages.mjs');
  assert.ok(carrying > 50, `only ${carrying} pages carry the Pixel`);
  for(const f of ['free-anxiety-test.html', 'mental-health-counselling.html', 'wellbeing-check.html']){
    assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('lume-pixel'), f);
  }
});

test('CSP patching adds Meta and keeps everything else', () => {
  const csp = "default-src 'self'; script-src 'self' x.com; img-src 'self' data:; connect-src 'self'; object-src 'none';";
  const out = patchCsp(csp);
  assert.ok(cspAllowsPixel(out));
  assert.match(out, /script-src 'self' x\.com connect\.facebook\.net/);
  assert.match(out, /object-src 'none'/);
  assert.equal(patchCsp(out), out, 'patching twice changes nothing');
  const noConnect = patchCsp("default-src 'self'; script-src 'self'; img-src 'self';");
  assert.match(noConnect, /connect-src 'self' www\.facebook\.com/);
});

test('applyPixel is idempotent', () => {
  const html = '<head><script async src="https://www.googletagmanager.com/gtag/js?id=G-1CZ93P4P3V"></script>\n<script>gtag("config","G-1CZ93P4P3V")</script>\n<meta http-equiv="Content-Security-Policy" content="script-src \'self\'; img-src \'self\'; connect-src \'self\';"></head>';
  const once = applyPixel(html);
  assert.equal(once.split(TAG).length, 2);
  assert.equal(applyPixel(once), once);
  assert.ok(once.indexOf(TAG) > once.indexOf('gtag("config"'));
});

console.log(`\n${passed} pixel tests passed.`);
