#!/usr/bin/env node
/*
  Lume Live — listening tool.

  Reads the newest posts in the subreddits listed in config.mjs, keeps the
  ones where someone is asking something Sachin can genuinely help with,
  and sends that short list to a Google Sheet (and, through the Sheet's
  script, to Telegram). It never posts, comments or messages anyone:
  replying is done by a person, by hand.

  Run:
    node tools/listen/listen.mjs --dry-run   print the list, send nothing
    node tools/listen/listen.mjs             send it to LISTEN_WEBHOOK_URL

  Environment:
    LISTEN_WEBHOOK_URL     Apps Script Web App from docs/listening-webhook.gs
    LISTEN_WEBHOOK_TOKEN   Shared secret the script checks (optional)
    REDDIT_CLIENT_ID       Free Reddit "script" app — optional, but Reddit
    REDDIT_CLIENT_SECRET   often refuses anonymous requests from cloud IPs

  Uses only Node built-ins (Node 18+ fetch), like the rest of tools/, so
  the GitHub Action needs no install step. See docs/listening-tool.md.
*/

import { SUBREDDITS, MAX_AGE_HOURS } from './config.mjs';
import { pickPosts, toItem } from './score.mjs';

const USER_AGENT = 'web:in.co.lumelive.listener:v1.0 (read-only daily digest; contact hello@lumelive.co.in)';
const PAUSE_MS = Number(process.env.LISTEN_PAUSE_MS ?? 1500);
const TIMEOUT_MS = 15000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, init = {}){
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Application-only OAuth: no Reddit user is logged in and nothing can be
// posted with this token — it is read access, which is all this needs.
async function redditToken(){
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if(!id || !secret) return null;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if(!res.ok) throw new Error(`Reddit login failed: HTTP ${res.status}`);
  const body = await res.json();
  if(!body.access_token) throw new Error('Reddit login returned no token');
  return body.access_token;
}

async function fetchSubreddit(sub, token){
  const url = token
    ? `https://oauth.reddit.com/r/${sub}/new?limit=100&raw_json=1`
    : `https://www.reddit.com/r/${sub}/new.json?limit=100&raw_json=1`;
  const body = await fetchJson(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  return (body?.data?.children || []).map(c => c.data).filter(Boolean);
}

async function send(items){
  const url = process.env.LISTEN_WEBHOOK_URL;
  if(!url) throw new Error('LISTEN_WEBHOOK_URL is not set (use --dry-run to print instead)');
  const token = process.env.LISTEN_WEBHOOK_TOKEN || '';
  // Apps Script answers a POST with a 302 to the result; fetch follows it.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, type: 'listening', items }),
    signal: AbortSignal.timeout(30000)
  });
  const text = await res.text();
  if(!res.ok) throw new Error(`Webhook HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text.slice(0, 300);
}

function printTable(items){
  if(!items.length){ console.log('No posts made the list today.'); return; }
  for(const [i, it] of items.entries()){
    console.log(`\n${String(i + 1).padStart(2)}. [${it.score}] ${it.categoryLabel}  r/${it.subreddit}  (${it.comments} comments)`);
    console.log(`    ${it.title}`);
    console.log(`    ${it.link}`);
    console.log(`    why: ${it.reasons}`);
  }
}

async function main(){
  const dryRun = process.argv.includes('--dry-run');

  let token = null;
  try{
    token = await redditToken();
    console.log(token ? 'Reddit: signed in with app credentials.' : 'Reddit: no app credentials, using public JSON.');
  }catch(err){
    console.warn(`Reddit: ${err.message} — falling back to public JSON.`);
  }

  const posts = [];
  const failed = [];
  for(const sub of SUBREDDITS){
    try{
      const got = await fetchSubreddit(sub, token);
      posts.push(...got);
      console.log(`r/${sub}: ${got.length} posts`);
    }catch(err){
      // One renamed or private subreddit must not cost the whole day's list.
      failed.push(sub);
      console.warn(`r/${sub}: skipped (${err.message})`);
    }
    await sleep(PAUSE_MS);
  }

  if(failed.length === SUBREDDITS.length){
    console.error('Every subreddit failed — Reddit is blocking this runner. Add REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET (docs/listening-tool.md).');
    process.exit(1);
  }

  const items = pickPosts(posts, { maxAgeHours: MAX_AGE_HOURS }).map(toItem);
  console.log(`\n${posts.length} posts read, ${items.length} on today's list.`);

  if(dryRun){
    printTable(items);
    return;
  }
  // An empty day is still sent, so the Sheet's script can say "nothing today"
  // rather than leaving you wondering whether it ran.
  const reply = await send(items);
  console.log(`Sent to Sheet: ${reply}`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
