#!/usr/bin/env node
/**
 * Listening tool tests. Run: node tools/listen/listen.test.mjs
 *
 * No network: every post below is invented and only exercises the scoring.
 * The safety checks matter most — a reply starter for someone in distress
 * must never carry a link, a price or the brand name.
 */

import assert from 'node:assert/strict';
import { CATEGORIES, MAX_ITEMS } from './config.mjs';
import { scorePost, pickPosts, toItem, hasPhrase } from './score.mjs';

const NOW = Date.UTC(2026, 9, 1, 6, 0, 0);
let n = 0;
const post = (title, selftext = '', extra = {}) => ({
  id: `t${++n}`,
  subreddit: 'JEENEETards',
  title,
  selftext,
  permalink: `/r/JEENEETards/comments/t${n}/x/`,
  created_utc: NOW / 1000 - 3600,
  num_comments: 1,
  is_self: true,
  ...extra
});

let passed = 0;
function test(name, fn){
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

const cat = p => scorePost(p).category?.id;

test('categorises the main kinds of question', () => {
  assert.equal(cat(post('Should I take a drop year after 85 percentile in JEE?')), 'jee_neet_drop');
  assert.equal(cat(post('PCM or PCB after 10th? Confused', 'cbse student')), 'stream_choice');
  assert.equal(cat(post('What after BTech if no placement?', 'tier 3 college')), 'after_graduation');
  assert.equal(cat(post('Thinking of a career switch from testing to product, should I quit?')), 'career_switch');
  assert.equal(cat(post('Parents forcing me into engineering, how do I convince my parents?')), 'parent_pressure');
  assert.equal(cat(post('Board exam stress is killing me, cannot focus')), 'exam_stress');
});

test('reads Hinglish', () => {
  assert.equal(cat(post('Drop lena chahiye ya nahi? JEE mains 80%ile')), 'jee_neet_drop');
  assert.equal(cat(post('Konsa stream lu 11th me? gharwale bol rahe science lo')), 'stream_choice');
});

test('distress and crisis outrank career topics in the same post', () => {
  assert.equal(cat(post('Dropper here, feeling hopeless and depressed after JEE result')), 'distress');
  assert.equal(cat(post('After NEET result I want to die, should I drop again?')), 'crisis');
});

test('crisis is always listed and listed first, even with a low score', () => {
  const lowCrisis = post('want to die', '', { num_comments: 50 });
  const strong = post('Should I take a drop year? JEE mains low percentile, India', '');
  const picked = pickPosts([strong, lowCrisis], { now: NOW });
  assert.equal(picked[0].category.id, 'crisis');
  assert.equal(picked.length, 2);
});

test('sensitive starters never sell', () => {
  for(const c of CATEGORIES.filter(c => c.sensitive)){
    assert.doesNotMatch(c.starter, /https?:\/\//, `${c.id} starter has a link`);
    assert.doesNotMatch(c.starter, /lume/i, `${c.id} starter names the brand`);
    assert.doesNotMatch(c.starter, /₹|rs\.?\s?\d|\b249\b|\bprice\b|\bbook\b/i, `${c.id} starter mentions money or booking`);
    assert.match(c.starter, /14416/, `${c.id} starter lacks Tele-MANAS`);
  }
});

test('every career starter discloses at most one link, to our own site', () => {
  for(const c of CATEGORIES.filter(c => !c.sensitive)){
    const links = c.starter.match(/https?:\/\/\S+/g) || [];
    assert.ok(links.length <= 1, `${c.id} has ${links.length} links`);
    for(const l of links) assert.match(l, /^https:\/\/lumelive\.co\.in\//);
  }
});

test('drops noise, removed, link, pinned and NSFW posts', () => {
  assert.equal(cat(post('Which stream? Join my telegram for notes', 'after 10th')), 'stream_choice');
  assert.ok(scorePost(post('Which stream? Join my telegram for notes', 'after 10th')).score < 4);
  assert.equal(scorePost(post('Should I take a drop?', '[removed]')).skip, 'removed');
  assert.equal(scorePost(post('Should I take a drop?', '', { is_self: false })).skip, 'link post');
  assert.equal(scorePost(post('Should I take a drop?', '', { stickied: true })).skip, 'pinned');
  assert.equal(scorePost(post('Should I take a drop?', '', { over_18: true })).skip, 'nsfw');
  assert.equal(scorePost(post('Rank 1 memes compilation')).category, null);
});

test('matches whole words only', () => {
  assert.ok(hasPhrase('should i take a drop year?', 'drop year'));
  assert.ok(!hasPhrase('the dropdown is broken', 'drop'));
  assert.ok(!hasPhrase('backlogged tasks', 'backlog'));
  assert.ok(hasPhrase("i can't cope", "can't cope"));
});

test('curly apostrophes are normalised', () => {
  assert.equal(cat(post('I can’t cope with this anymore')), 'distress');
});

test('old posts and duplicates are dropped; threshold and cap hold', () => {
  const old = post('Should I take a drop year? JEE', '', { created_utc: NOW / 1000 - 30 * 3600 });
  const fresh = post('Should I take a drop year? JEE');
  const weak = post('placement', '', { num_comments: 40 });
  const picked = pickPosts([old, fresh, fresh, weak], { now: NOW, maxAgeHours: 26 });
  assert.deepEqual(picked.map(p => p.post.id), [fresh.id]);

  const many = Array.from({ length: 60 }, () => post('Should I take a drop year? JEE India'));
  assert.equal(pickPosts(many, { now: NOW }).length, MAX_ITEMS);
});

test('toItem produces a complete Sheet row', () => {
  const p = post('PCM or PCB after 10th?', 'cbse '.repeat(200));
  const item = toItem({ post: p, ...scorePost(p) });
  assert.equal(item.link, `https://www.reddit.com${p.permalink}`);
  assert.equal(item.category, 'stream_choice');
  assert.equal(item.sensitive, false);
  assert.ok(item.snippet.length <= 280);
  assert.ok(item.starter.length > 50);
  for(const k of ['id', 'subreddit', 'title', 'created', 'comments', 'score', 'reasons', 'categoryLabel']){
    assert.ok(k in item, `missing ${k}`);
  }
});

console.log(`\n${passed} listening tests passed.`);
