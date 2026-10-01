/*
  Lume Live — listening tool scoring.

  Pure functions only: no network, no clock unless one is passed in, so
  the tests can pin every decision. listen.mjs does the fetching and
  hands each Reddit post here.

  A post's score is the weight of its best-matching category's phrases,
  plus small nudges:
    +1  it reads as a question (someone is asking, not announcing)
    +1  it has Indian context (we can actually serve them)
    +1  it has few comments yet (an early, useful answer gets seen)
    -5  it looks like noise or promotion
  Removed, deleted, link-only and pinned posts are never scored at all.
*/

import { CATEGORIES, INDIA_HINTS, NOISE_PHRASES, MIN_SCORE, MAX_ITEMS } from './config.mjs';

function escapeRe(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word, case-insensitive. Built once per phrase and cached, because
// the same few hundred phrases are tested against every post.
const reCache = new Map();
function phraseRe(phrase){
  let re = reCache.get(phrase);
  if(!re){
    re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(phrase.toLowerCase())}(?=$|[^a-z0-9])`);
    reCache.set(phrase, re);
  }
  return re;
}

export function hasPhrase(text, phrase){
  return phraseRe(phrase).test(text);
}

// Reddit escapes &, < and > in post bodies; normalise curly apostrophes so
// "can’t" matches "can't".
export function normalise(post){
  const raw = `${post.title || ''}\n${post.selftext || ''}`;
  return raw
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
}

function isUnusable(post){
  if(!post || !post.id || !post.title) return 'missing';
  if(post.stickied) return 'pinned';
  if(post.over_18) return 'nsfw';
  const body = (post.selftext || '').trim();
  if(body === '[removed]' || body === '[deleted]' || post.removed_by_category) return 'removed';
  if(post.is_self === false) return 'link post';
  return null;
}

/**
 * Scores one Reddit post.
 * @returns {{category: object|null, score: number, reasons: string[], skip?: string}}
 */
export function scorePost(post){
  const skip = isUnusable(post);
  if(skip) return { category: null, score: 0, reasons: [], skip };

  const text = normalise(post);
  let best = null;
  let bestWeight = 0;
  let bestHits = [];

  for(const cat of CATEGORIES){
    let weight = 0;
    const hits = [];
    for(const [w, phrases] of Object.entries(cat.phrases)){
      for(const p of phrases){
        if(hasPhrase(text, p)){
          weight += Number(w);
          hits.push(p);
        }
      }
    }
    // Strictly greater: on a tie the earlier (more urgent) category keeps it.
    if(weight > bestWeight){
      best = cat;
      bestWeight = weight;
      bestHits = hits;
    }
  }

  if(!best) return { category: null, score: 0, reasons: [] };

  // Several hits on the same idea shouldn't let one rambling post bury
  // three clear ones, so the phrase part is capped.
  let score = Math.min(bestWeight, 6);
  const reasons = bestHits.slice(0, 4).map(h => `"${h}"`);

  if(post.title.includes('?') || /\b(should i|what should|how do i|kya karu|kya karun|help me|any advice|suggest)\b/.test(text)){
    score += 1; reasons.push('question');
  }
  if(INDIA_HINTS.some(h => hasPhrase(text, h))){
    score += 1; reasons.push('India');
  }
  if((post.num_comments || 0) < 5){
    score += 1; reasons.push('few replies');
  }
  if(NOISE_PHRASES.some(p => hasPhrase(text, p))){
    score -= 5; reasons.push('looks like noise');
  }

  return { category: best, score, reasons };
}

/**
 * Turns raw posts into the day's list: fresh, above threshold, deduped,
 * crisis first, then by score, capped.
 */
export function pickPosts(posts, { now = Date.now(), maxAgeHours, minScore = MIN_SCORE, maxItems = MAX_ITEMS } = {}){
  const seen = new Set();
  const picked = [];
  for(const post of posts){
    if(!post || seen.has(post.id)) continue;
    seen.add(post.id);
    if(maxAgeHours && post.created_utc && (now / 1000 - post.created_utc) > maxAgeHours * 3600) continue;
    const r = scorePost(post);
    if(!r.category) continue;
    // Someone in crisis is on the list whatever the nudges add up to.
    if(r.category.id !== 'crisis' && r.score < minScore) continue;
    picked.push({ post, ...r });
  }
  picked.sort((a, b) => {
    const ac = a.category.id === 'crisis' ? 1 : 0;
    const bc = b.category.id === 'crisis' ? 1 : 0;
    if(ac !== bc) return bc - ac;
    return b.score - a.score || (b.post.created_utc || 0) - (a.post.created_utc || 0);
  });
  return picked.slice(0, maxItems);
}

function snippet(text, max = 280){
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// The shape the Apps Script turns into one Sheet row.
export function toItem({ post, category, score, reasons }){
  return {
    id: post.id,
    subreddit: post.subreddit,
    title: snippet(post.title, 200),
    link: `https://www.reddit.com${post.permalink}`,
    created: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : '',
    comments: post.num_comments || 0,
    snippet: snippet(post.selftext),
    category: category.id,
    categoryLabel: category.label,
    sensitive: Boolean(category.sensitive),
    score,
    reasons: reasons.join(', '),
    starter: category.starter
  };
}
