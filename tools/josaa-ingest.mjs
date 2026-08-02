#!/usr/bin/env node
/**
 * josaa-ingest.mjs — build the Lume Live cutoff dataset from official JoSAA data.
 *
 * Source: https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx
 * That page is a public Government of India query form (no login, no paywall). Data is
 * reused under GODL-India with attribution — see data/josaa/manifest.json -> source.
 *
 * This script MUST be run somewhere with network access to josaa.admissions.nic.in.
 * It is deliberately not run at build time: the dataset changes a few times a year,
 * not per deploy.
 *
 *   node tools/josaa-ingest.mjs --years 2024,2025,2026
 *   node tools/josaa-ingest.mjs --years 2026 --round 5 --limit 200   # quick smoke test
 *   node tools/josaa-ingest.mjs --from-cache                         # re-parse, no network
 *   node tools/josaa-ingest.mjs --probe                              # inspect the form only
 *
 * Raw HTML is cached under tools/.cache/josaa/ so a re-run costs nothing and a parser
 * change can be re-applied without hammering a government server.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', '.cache', 'josaa');
const OUT = path.join(ROOT, 'data', 'josaa');

const BASE = 'https://josaa.admissions.nic.in';
const ARCHIVE = `${BASE}/applicant/seatmatrix/openingclosingrankarchieve.aspx`;

/* JoSAA rejects bursts. One request every REQUEST_GAP_MS, single-threaded, always. */
const REQUEST_GAP_MS = 1500;
const MAX_RETRIES = 4;

const INSTITUTE_TYPES = ['IIT', 'NIT', 'IIIT', 'Other-GFTI'];

/* ------------------------------------------------------------------ args -- */

function parseArgs(argv) {
  const a = {
    years: [], round: null, limit: Infinity,
    fromCache: false, probe: false, verbose: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--years') a.years = argv[++i].split(',').map(s => parseInt(s.trim(), 10));
    else if (k === '--round') a.round = parseInt(argv[++i], 10);
    else if (k === '--limit') a.limit = parseInt(argv[++i], 10);
    else if (k === '--from-cache') a.fromCache = true;
    else if (k === '--probe') a.probe = true;
    else if (k === '--verbose' || k === '-v') a.verbose = true;
    else if (k === '--help' || k === '-h') { printHelp(); process.exit(0); }
    else { console.error(`Unknown flag: ${k}`); printHelp(); process.exit(2); }
  }
  if (!a.years.length) a.years = [new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear()];
  return a;
}

function printHelp() {
  console.log(`
josaa-ingest — build data/josaa/* from the official JoSAA archive.

  --years 2024,2025,2026   Years to pull (default: last three)
  --round N                Force a round number (default: highest available per year)
  --limit N                Stop after N result rows — smoke testing
  --from-cache             Re-parse cached HTML, make no network calls
  --probe                  Fetch the form, print discovered fields, exit
  --verbose                Log every request

Run --probe first. JoSAA renames its ASP.NET controls between years; probe tells you
whether the field discovery below still matches reality before you pull thousands of rows.
`);
}

/* ------------------------------------------------------------- http layer -- */

let lastRequestAt = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function throttle() {
  const wait = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/**
 * JoSAA is an ASP.NET WebForms app: it 403s or returns an error page for requests that
 * do not look like a browser continuing a session. We keep cookies across the run.
 */
const cookieJar = new Map();

function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function absorbCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function request(url, { method = 'GET', body = null, referer = ARCHIVE } = {}) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    try {
      const res = await fetch(url, {
        method,
        body,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Referer': referer,
          ...(cookieJar.size ? { Cookie: cookieHeader() } : {}),
          ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
      });
      absorbCookies(res);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw new Error(`${url} failed after ${MAX_RETRIES + 1} tries: ${err.message}`);
      const backoff = 2000 * Math.pow(2, attempt);
      console.warn(`  ! ${err.message} — retrying in ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
}

/* ------------------------------------------------------------ html helpers -- */

const decodeEntities = s => s
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

const stripTags = s => decodeEntities(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Hidden ASP.NET state (__VIEWSTATE etc.) that every postback must echo back. */
function extractHiddenFields(html) {
  const fields = {};
  const re = /<input[^>]*type=["']hidden["'][^>]*>/gi;
  for (const [tag] of html.matchAll(re)) {
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1];
    if (!name) continue;
    fields[name] = decodeEntities(tag.match(/value=["']([^"']*)["']/i)?.[1] ?? '');
  }
  return fields;
}

/** All <select> controls with their options, so we can discover field names rather than hardcode them. */
function extractSelects(html) {
  const selects = {};
  const re = /<select[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi;
  for (const [, name, inner] of html.matchAll(re)) {
    const options = [];
    for (const [, value, label] of inner.matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi)) {
      const text = stripTags(label);
      if (text && !/^select/i.test(text)) options.push({ value: decodeEntities(value), text });
    }
    selects[name] = options;
  }
  return selects;
}

/**
 * Find a control by what its options look like, not by its ASP.NET id — the ids change
 * between years, the option vocabularies do not.
 */
function findSelect(selects, predicate) {
  for (const [name, options] of Object.entries(selects)) {
    if (options.length && predicate(options, name)) return { name, options };
  }
  return null;
}

function discoverFields(html) {
  const selects = extractSelects(html);
  const has = (opts, ...needles) => {
    const joined = opts.map(o => o.text.toLowerCase()).join('|');
    return needles.some(n => joined.includes(n));
  };
  return {
    selects,
    year: findSelect(selects, o => o.every(x => /^20\d\d$/.test(x.text.trim()))),
    /* 1-2 digits only: a 4-digit option is a year, and matching that here would silently
       send the year value into the round field. */
    round: findSelect(selects, o => o.length <= 8 && o.every(x => /^\d{1,2}$/.test(x.text.trim()))),
    instType: findSelect(selects, o => has(o, 'iit', 'nit', 'gfti')),
    seatType: findSelect(selects, o => has(o, 'obc-ncl', 'ews')),
    gender: findSelect(selects, o => has(o, 'gender-neutral', 'female')),
  };
}

/* --------------------------------------------------------------- table parse -- */

/** Pull every <table> that looks like a results grid, and return it as rows of cells. */
function parseResultTable(html) {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => m[0]);
  for (const table of tables) {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m =>
      [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => stripTags(c[1]))
    ).filter(r => r.length);
    if (rows.length < 2) continue;

    const header = rows[0].map(h => h.toLowerCase());
    const col = (...needles) => header.findIndex(h => needles.some(n => h.includes(n)));

    const idx = {
      institute: col('institute'),
      branch: col('academic program', 'program name', 'branch'),
      quota: col('quota'),
      seatType: col('seat type'),
      gender: col('gender'),
      open: col('opening rank'),
      close: col('closing rank'),
    };
    if (idx.institute < 0 || idx.close < 0) continue;

    return rows.slice(1)
      .filter(r => r.length >= header.length - 1 && r[idx.institute])
      .map(r => ({
        institute: r[idx.institute],
        branch: idx.branch >= 0 ? r[idx.branch] : '',
        quota: idx.quota >= 0 ? r[idx.quota] : 'AI',
        seatType: idx.seatType >= 0 ? r[idx.seatType] : '',
        gender: idx.gender >= 0 ? r[idx.gender] : '',
        openRank: r[idx.open],
        closeRank: r[idx.close],
      }));
  }
  return [];
}

/* JoSAA prints preparatory-course ranks as e.g. "1234P". Those are not comparable to
   general ranks and must not silently become 1234. */
function parseRank(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s === '-') return null;
  if (/P$/i.test(s)) return null;
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------------- cache -- */

const cacheKey = parts => parts.join('__').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() + '.html';

async function cached(key, produce, { fromCache }) {
  const file = path.join(CACHE, key);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    if (fromCache) return null;
  }
  const html = await produce();
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, html, 'utf8');
  return html;
}

/* --------------------------------------------------------------- normalise -- */

/** "Computer Science and Engineering (4 Years, Bachelor of Technology)" -> parts */
function splitBranch(raw) {
  const m = raw.match(/^(.*?)\s*\((\d+)\s*Years?,\s*([^)]+)\)\s*$/i);
  if (m) return { name: m[1].trim(), years: parseInt(m[2], 10), degree: m[3].trim() };
  return { name: raw.trim(), years: null, degree: null };
}

function instituteType(name) {
  const n = name.toLowerCase();
  if (n.includes('indian institute of technology')) return 'IIT';
  if (n.includes('national institute of technology')) return 'NIT';
  if (n.includes('indian institute of information technology')) return 'IIIT';
  return 'GFTI';
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ------------------------------------------------------------------ ingest -- */

async function fetchArchiveForm() {
  const html = await request(ARCHIVE);
  return { html, fields: discoverFields(html), hidden: extractHiddenFields(html) };
}

async function probe() {
  console.log(`Probing ${ARCHIVE} ...\n`);
  const { fields } = await fetchArchiveForm();
  const report = ['year', 'round', 'instType', 'seatType', 'gender'];
  let ok = true;
  for (const key of report) {
    const f = fields[key];
    if (!f) { ok = false; console.log(`  ${key.padEnd(10)} NOT FOUND`); continue; }
    console.log(`  ${key.padEnd(10)} ${f.name}`);
    console.log(`  ${''.padEnd(10)}   ${f.options.slice(0, 6).map(o => o.text).join(', ')}${f.options.length > 6 ? ` … (${f.options.length})` : ''}`);
  }
  console.log(`\nAll <select> controls seen: ${Object.keys(fields.selects).join(', ') || '(none)'}`);
  if (!ok) {
    console.log(`\nSome controls were not recognised. JoSAA has probably changed the page.`);
    console.log(`Fix discoverFields() in this file, then re-probe. Do not guess field names.`);
    process.exitCode = 1;
  } else {
    console.log(`\nField discovery looks healthy — safe to run a real ingest.`);
  }
}

async function ingest(args) {
  console.log(`Ingesting JoSAA cutoffs for ${args.years.join(', ')}\n`);

  const form = args.fromCache ? null : await fetchArchiveForm();
  if (form && !form.fields.instType) {
    throw new Error('Could not discover the institute-type control. Run --probe and update discoverFields().');
  }

  const records = [];
  const problems = [];

  for (const year of args.years) {
    for (const instType of INSTITUTE_TYPES) {
      const round = args.round ?? 'final';
      const key = cacheKey(['orcr', year, instType, round]);

      const html = await cached(key, async () => {
        if (!form) throw new Error('no cache and --from-cache set');
        const payload = new URLSearchParams({ ...form.hidden });
        const set = (field, matcher) => {
          if (!field) return;
          const opt = field.options.find(matcher) ?? field.options[field.options.length - 1];
          if (opt) payload.set(field.name, opt.value);
        };
        set(form.fields.year, o => o.text.trim() === String(year));
        set(form.fields.instType, o => o.text.toLowerCase().includes(instType.split('-')[0].toLowerCase()));
        if (args.round != null) set(form.fields.round, o => o.text.trim() === String(args.round));
        payload.set('__EVENTTARGET', '');
        payload.set('__EVENTARGUMENT', '');
        if (args.verbose) console.log(`  -> POST ${year} ${instType} round=${round}`);
        return request(ARCHIVE, { method: 'POST', body: payload.toString() });
      }, args);

      if (!html) { problems.push(`${year}/${instType}: no cached page and network disabled`); continue; }

      const rows = parseResultTable(html);
      if (!rows.length) { problems.push(`${year}/${instType}: no result rows parsed`); continue; }

      for (const r of rows) {
        const close = parseRank(r.closeRank);
        const open = parseRank(r.openRank);
        if (close == null) continue;
        records.push({ year, instType, ...r, openRank: open ?? close, closeRank: close });
        if (records.length >= args.limit) break;
      }
      console.log(`  ${year} ${instType.padEnd(10)} ${rows.length} rows`);
      if (records.length >= args.limit) break;
    }
    if (records.length >= args.limit) break;
  }

  if (!records.length) {
    console.error('\nNo records ingested. Nothing written — refusing to emit an empty dataset.');
    problems.forEach(p => console.error(`  - ${p}`));
    process.exitCode = 1;
    return;
  }

  await emit(records, args, problems);
}

/* -------------------------------------------------------------------- emit -- */

async function emit(records, args, problems) {
  const instituteIdx = new Map();
  const branchIdx = new Map();
  const quotas = [];
  const seatTypes = [];
  const genders = [];

  const intern = (list, value) => {
    let i = list.indexOf(value);
    if (i < 0) { i = list.length; list.push(value); }
    return i;
  };

  const shards = new Map();

  for (const r of records) {
    const instName = r.institute.trim();
    if (!instituteIdx.has(instName)) {
      instituteIdx.set(instName, {
        id: instituteIdx.size,
        n: instName,
        t: instituteType(instName),
        slug: slug(instName),
      });
    }
    const branch = splitBranch(r.branch);
    const bKey = `${branch.name}|${branch.degree ?? ''}|${branch.years ?? ''}`;
    if (!branchIdx.has(bKey)) {
      branchIdx.set(bKey, { id: branchIdx.size, n: branch.name, deg: branch.degree, y: branch.years, slug: slug(branch.name) });
    }

    const seatType = r.seatType.trim() || 'OPEN';
    const gender = r.gender.trim() || 'Gender-Neutral';
    const shardKey = `${seatType}__${gender}`;
    if (!shards.has(shardKey)) shards.set(shardKey, []);
    shards.get(shardKey).push([
      instituteIdx.get(instName).id,
      branchIdx.get(bKey).id,
      intern(quotas, r.quota.trim() || 'AI'),
      r.year,
      r.openRank,
      r.closeRank,
    ]);
    intern(seatTypes, seatType);
    intern(genders, gender);
  }

  await fs.mkdir(OUT, { recursive: true });

  const shardFiles = {};
  for (const [key, rows] of shards) {
    const file = `${slug(key)}.json`;
    shardFiles[key] = file;
    rows.sort((a, b) => a[0] - b[0] || a[1] - b[1] || b[3] - a[3]);
    await fs.writeFile(path.join(OUT, file), JSON.stringify({
      schemaVersion: 1,
      key,
      cols: ['inst', 'branch', 'quota', 'year', 'open', 'close'],
      rows,
    }), 'utf8');
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      name: 'Joint Seat Allocation Authority (JoSAA), Government of India',
      url: ARCHIVE,
      licence: 'Government Open Data License – India (GODL-India)',
      note: 'Opening/closing ranks as published by JoSAA. Reproduced with attribution. Not an official JoSAA product.',
    },
    years: [...new Set(records.map(r => r.year))].sort(),
    counts: { records: records.length, institutes: instituteIdx.size, branches: branchIdx.size },
    institutes: [...instituteIdx.values()],
    branches: [...branchIdx.values()],
    quotas, seatTypes, genders,
    shards: shardFiles,
    problems,
  };
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\nWrote ${shards.size} shards + manifest to data/josaa/`);
  console.log(`  ${records.length} rows · ${instituteIdx.size} institutes · ${branchIdx.size} branches`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s) recorded in manifest.problems:`);
    problems.forEach(p => console.log(`  - ${p}`));
  }
}

/* -------------------------------------------------------------------- main -- */

const args = parseArgs(process.argv);
try {
  if (args.probe) await probe();
  else await ingest(args);
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  process.exitCode = 1;
}
