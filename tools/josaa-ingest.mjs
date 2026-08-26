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
import dns from 'node:dns';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/*
  Node has preferred IPv6 since v17. Several nic.in hosts publish an AAAA record that
  accepts a connection and then never answers, which surfaces as a connect timeout that
  curl — still IPv4-first on many builds — does not see. Ask for IPv4 first.
*/
dns.setDefaultResultOrder('ipv4first');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', '.cache', 'josaa');
const OUT = path.join(ROOT, 'data', 'josaa');

const BASE = 'https://josaa.admissions.nic.in';
const ARCHIVE = `${BASE}/applicant/seatmatrix/openingclosingrankarchieve.aspx`;

/* JoSAA rejects bursts. One request every REQUEST_GAP_MS, single-threaded, always. */
const REQUEST_GAP_MS = 1500;
const MAX_RETRIES = 4;

/* JoSAA is a slow server on a good day and the cascade makes six requests per
   combination, so this is patient — but bounded, so a stall fails and retries instead
   of hanging the job for five minutes. */
const REQUEST_TIMEOUT_MS = 60_000;

/*
  How long to wait for the TCP+TLS handshake specifically.

  This is the number that was actually failing. undici — which is what global
  fetch is — applies its own connect timeout of 10 seconds and reaches it long
  before any AbortSignal budget matters, so run #11 reported
  "UND_ERR_CONNECT_TIMEOUT ... timeout: 10000ms" five times while curl, with
  -m 30, had fetched the same page six seconds earlier. JoSAA is simply slow to
  accept a connection.

  undici's connect timeout is only reachable through a custom Agent, and this
  project installs nothing for the ingest, so request() below uses node:https
  instead of fetch and sets both timeouts itself.
*/
const CONNECT_TIMEOUT_MS = 30_000;

const INSTITUTE_TYPES = ['IIT', 'NIT', 'IIIT', 'Other-GFTI'];

/* ------------------------------------------------------------------ args -- */

function parseArgs(argv) {
  const a = {
    years: [], round: null, limit: Infinity,
    fromCache: false, probe: false, verbose: false, dump: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--years') a.years = argv[++i].split(',').map(s => parseInt(s.trim(), 10));
    else if (k === '--round') a.round = parseInt(argv[++i], 10);
    else if (k === '--limit') a.limit = parseInt(argv[++i], 10);
    else if (k === '--from-cache') a.fromCache = true;
    else if (k === '--probe') a.probe = true;
    else if (k === '--dump') a.dump = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : path.join(ROOT, 'work', 'dump');
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
  --dump [dir]             Write every request and response to dir (default work/dump)
                           for inspection. Use when the ingest returns no rows and you
                           need to see what JoSAA actually sent back.
  --verbose                Log every request

Run --probe first. JoSAA renames its ASP.NET controls between years; probe tells you
whether the field discovery below still matches reality before you pull thousands of rows.
`);
}

/* --------------------------------------------------------------- dumping -- */

/* When a pull comes back with no rows, the only thing worth having is the page JoSAA
   actually returned. This writes each exchange to disk — the payload we posted, the
   response we got, and a summary of what the response contains — so one run answers
   "what is the postback contract" instead of several runs of guessing.
   Nothing here is ever committed; the workflow uploads it as an artifact. */
const dumper = {
  dir: null,
  seq: 0,
  async init(dir) {
    if (!dir) return;
    this.dir = dir;
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    console.log(`Dumping every exchange to ${path.relative(ROOT, dir)}/`);
  },
  async write(label, { url, method, payload, html }) {
    if (!this.dir) return;
    const n = String(++this.seq).padStart(2, '0');
    const stem = `${n}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    if (payload != null) {
      /* __VIEWSTATE is enormous and not interesting; keep its length, drop the body. */
      const readable = [...new URLSearchParams(payload).entries()]
        .map(([k, v]) => `${k} = ${v.length > 120 ? `<${v.length} chars>` : v}`)
        .join('\n');
      await fs.writeFile(path.join(this.dir, `${stem}.request.txt`), `${method} ${url}\n\n${readable}\n`, 'utf8');
    }
    if (html != null) {
      await fs.writeFile(path.join(this.dir, `${stem}.response.html`), html, 'utf8');
      await fs.writeFile(path.join(this.dir, `${stem}.summary.txt`), summarise(html), 'utf8');
    }
  },
};

/** What a returned page contains, in the terms we care about. */
function summarise(html) {
  const selects = extractSelects(html);
  const lines = [`bytes: ${html.length}`, ''];

  lines.push('selects:');
  for (const [name, options] of Object.entries(selects)) {
    lines.push(`  ${name}  (${options.length} options)`);
    if (options.length) lines.push(`    ${options.slice(0, 8).map(o => `${o.text}=${o.value}`).join(', ')}`);
  }
  if (!Object.keys(selects).length) lines.push('  (none)');

  /* Submit controls are the thing we are most likely missing — an ASP.NET grid usually
     needs a named button posted, or an __EVENTTARGET naming the control that changed. */
  lines.push('', 'submit controls:');
  const buttons = [...html.matchAll(/<input[^>]*type=["'](submit|button|image)["'][^>]*>/gi)].map(m => m[0]);
  for (const b of buttons) {
    lines.push(`  name=${b.match(/name=["']([^"']+)["']/i)?.[1] ?? '?'}  value=${b.match(/value=["']([^"']*)["']/i)?.[1] ?? ''}`);
  }
  if (!buttons.length) lines.push('  (none)');

  /* __doPostBack targets tell us which controls fire a partial postback on change. */
  const targets = new Set([...html.matchAll(/__doPostBack\((?:&#39;|['"])([^'"&]+)/g)].map(m => m[1]));
  lines.push('', `__doPostBack targets: ${targets.size ? [...targets].join(', ') : '(none)'}`);

  /* If the dropdowns do not fire __doPostBack, something else fills them, and the whole
     posting strategy depends on which. An onchange handler names it. */
  lines.push('', 'select onchange handlers:');
  const handlers = [...html.matchAll(/<select[^>]*name=["']([^"']+)["'][^>]*>/gi)]
    .map(m => [m[1], m[0].match(/onchange=["']([^"']*)["']/i)?.[1]])
    .filter(([, h]) => h);
  handlers.forEach(([name, h]) => lines.push(`  ${name} -> ${h.slice(0, 160)}`));
  if (!handlers.length) lines.push('  (none — the dropdowns are not wired in markup)');

  /* Client-side population means a JSON endpoint somewhere. These are the shapes it
     takes on ASP.NET pages: a PageMethod, a ScriptService, or a plain jQuery call. */
  lines.push('', 'candidate data endpoints in inline script:');
  const endpoints = new Set();
  for (const [, u] of html.matchAll(/url\s*:\s*["']([^"']+)["']/gi)) endpoints.add(u);
  for (const [, u] of html.matchAll(/(?:fetch|open)\s*\(\s*["']([^"']+\.(?:aspx|asmx|json|svc)[^"']*)["']/gi)) endpoints.add(u);
  for (const [, u] of html.matchAll(/["'](\/[^"']*\/(?:[A-Za-z]+)\.(?:asmx|svc)(?:\/[A-Za-z]+)?)["']/g)) endpoints.add(u);
  for (const [, m] of html.matchAll(/PageMethods\.([A-Za-z_]\w*)/g)) endpoints.add('PageMethods.' + m);
  [...endpoints].slice(0, 20).forEach(u => lines.push(`  ${u}`));
  if (!endpoints.size) lines.push('  (none found)');

  lines.push('', 'external scripts:');
  const srcs = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map(m => m[1]);
  srcs.slice(0, 15).forEach(u => lines.push(`  ${u}`));
  if (!srcs.length) lines.push('  (none)');

  lines.push('', 'tables:');
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => m[0]);
  tables.forEach((t, i) => {
    const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].length;
    const head = [...t.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].slice(0, 8).map(c => stripTags(c[1]));
    lines.push(`  [${i}] ${rows} rows | first cells: ${head.join(' | ').slice(0, 200)}`);
  });
  if (!tables.length) lines.push('  (none)');

  /* ASP.NET renders validation and error text into well-known spans. */
  const msgs = [...html.matchAll(/<span[^>]*id=["'][^"']*(?:lbl|msg|error|Message)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
    .map(m => stripTags(m[1])).filter(Boolean);
  lines.push('', `page messages: ${msgs.length ? msgs.join(' / ') : '(none)'}`);

  return lines.join('\n') + '\n';
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

/* node:https hands back a plain header bag, where set-cookie is already the
   array form (it is the one header Node never folds into a single string). */
function absorbCookies(headers) {
  const value = headers && headers['set-cookie'];
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

/*
  undici reports every transport failure as the bare string "fetch failed" and hides the
  real reason on err.cause — which is how a run could fail five times in a row and tell
  nobody whether it was DNS, a refused connection or a certificate the runner would not
  verify. Walk the chain and print what actually happened.
*/
function describeError(err) {
  const parts = [];
  let node = err;
  let depth = 0;
  while (node && depth++ < 5) {
    const bits = [node.code, node.errno, node.syscall, node.reason, node.message]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
    if (bits.length) parts.push(bits.join(' '));
    node = node.cause;
  }
  return parts.join('  <-  ') || String(err);
}

/* Certificate failures are the one class worth naming out loud: Indian government sites
   periodically renew with an incomplete chain, curl papers over it and Node does not,
   which looks like an outage and is not one. */
const TLS_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);

function tlsHint(err) {
  let node = err;
  let depth = 0;
  while (node && depth++ < 5) {
    if (node.code && TLS_CODES.has(node.code)) {
      return `\nThis is a TLS trust failure (${node.code}), not an outage — curl may well ` +
             `still fetch the page.\nJoSAA has probably renewed with an incomplete chain. ` +
             `Fetch the missing intermediate and\npoint NODE_EXTRA_CA_CERTS at it, rather ` +
             `than disabling verification.`;
    }
    node = node.cause;
  }
  return '';
}

/*
  One HTTP exchange, on node:https rather than fetch.

  fetch is friendlier, but it hides the connect timeout behind undici and there
  is no way to raise it without adding a dependency this workflow does not
  install. Everything below is what fetch was giving us — redirects, cookies,
  a body as text — with the two timeouts that matter made explicit:

    connect  the handshake, which is what JoSAA is slow at
    overall  the whole exchange, so a half-open socket cannot hang the job

  Accept-Encoding is pinned to identity so there is no compressed body to
  inflate; the pages are tens of kilobytes and the ingest is rate-limited
  anyway, so the bandwidth is irrelevant next to the complexity.
*/
function httpRequest(url, { method, headers, body, redirectsLeft = 5 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      method,
      headers,
      /* Node resolves this itself; ipv4first is set at the top of the file. */
      timeout: CONNECT_TIMEOUT_MS,
    });

    let settled = false;
    const fail = (err) => { if (!settled) { settled = true; req.destroy(); reject(err); } };

    const overall = setTimeout(() => {
      const err = new Error('Overall request timeout after ' + REQUEST_TIMEOUT_MS + 'ms');
      err.code = 'REQUEST_TIMEOUT';
      fail(err);
    }, REQUEST_TIMEOUT_MS);

    /* `timeout` here is socket inactivity, which covers the handshake: nothing
       arrives on a socket that never connects. */
    req.on('timeout', () => {
      const err = new Error('Connect/idle timeout after ' + CONNECT_TIMEOUT_MS + 'ms');
      err.code = 'CONNECT_TIMEOUT';
      fail(err);
    });
    req.on('error', fail);

    req.on('response', (res) => {
      const location = res.headers.location;
      if (location && res.statusCode >= 300 && res.statusCode < 400 && redirectsLeft > 0) {
        res.resume();
        clearTimeout(overall);
        settled = true;
        resolve(httpRequest(new URL(location, url).toString(), {
          method: 'GET', headers, body: null, redirectsLeft: redirectsLeft - 1,
        }));
        return;
      }

      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        clearTimeout(overall);
        if (settled) return;
        settled = true;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8'),
        });
      });
      res.on('error', fail);
    });

    if (body) req.write(body);
    req.end();
  });
}

async function request(url, { method = 'GET', body = null, referer = ARCHIVE, async: isAsync = false } = {}) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    try {
      const res = await httpRequest(url, {
        method,
        body,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Referer': referer,
          ...(cookieJar.size ? { Cookie: cookieHeader() } : {}),
          ...(method === 'POST' ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body || ''),
          } : {}),
          /* ASP.NET decides between a page and a delta on this header. Without it
             a partial postback is answered with a full render. */
          ...(isAsync ? { 'X-MicrosoftAjax': 'Delta=true', 'X-Requested-With': 'XMLHttpRequest' } : {}),
        },
      });

      absorbCookies(res.headers);

      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      return res.text;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `${url} failed after ${MAX_RETRIES + 1} tries: ${describeError(err)}${tlsHint(err)}`
        );
      }
      const backoff = 2000 * Math.pow(2, attempt);
      console.warn(`  ! ${describeError(err)} — retrying in ${backoff / 1000}s`);
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

/*
  The value each <select> currently carries, including the placeholder that
  extractSelects() filters out of the option list. A postback has to echo back every
  control on the form, not just the one that changed, so this is what the untouched ones
  are set to.
*/
function extractSelectedValues(html) {
  const values = {};
  const re = /<select[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi;
  for (const [, name, inner] of html.matchAll(re)) {
    /* Read the whole option tag, not the part before value=. `selected` sits on either
       side of it depending on who generated the markup, and looking at only one side
       means a selected year reads as the placeholder — which would post --Select-- and
       get nothing back. */
    const options = [...inner.matchAll(/<option\b([^>]*)>/gi)].map(m => ({
      attrs: m[1],
      value: decodeEntities(m[1].match(/value=["']([^"']*)["']/i)?.[1] ?? ''),
    }));
    const chosen = options.find(o => /\bselected\b/i.test(o.attrs));
    values[name] = chosen ? chosen.value : (options[0] ? options[0].value : '');
  }
  return values;
}

/*
  The button that actually runs the query.

  ASP.NET renders a grid from a button's click handler. Posting the form without the
  button's name means Page_Load runs and the handler never does, so the response is the
  page with no grid on it — which is exactly the 11,950-byte "Not Available" page every
  filter combination came back with on 13 August.
*/
function findSubmitButton(html) {
  for (const [tag] of html.matchAll(/<input[^>]*type=["'](?:submit|button)["'][^>]*>/gi)) {
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1];
    if (!name) continue;
    const value = tag.match(/value=["']([^"']*)["']/i)?.[1] ?? '';
    /* Skip the ones that navigate away rather than query: the CSC login on this page
       is a submit input too. */
    if (/login|logout|reset|clear|back/i.test(name + ' ' + value)) continue;
    return { name, value: decodeEntities(value) };
  }
  return null;
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

/**
 * Fallback for when there is no vocabulary to match on.
 *
 * Vocabulary matching above is the right default and stays first, because it survives
 * JoSAA renaming a control. But it only works if the control has options in the served
 * HTML, and since 2026 the archive page ships its dropdowns empty and fills them by
 * postback — so every lookup returned null and the probe reported the whole form
 * missing while plainly listing six <select> controls it could see.
 *
 * These patterns are the observed control names from that probe output, not guesses.
 * They match on the id suffix so the ASP.NET container prefix is free to change.
 */
const CONTROL_NAME_HINTS = {
  year: /ddl_?year$/i,
  round: /ddl_?round(no|num)?$/i,
  /* The live control is "ddlInstype" — "ins" + "type", with a single t. Spelling out the
     longer forms too so a tidy-up on JoSAA's side does not break this again. It must not
     match "ddlInstitute", which is a different control on the same form; requiring the
     name to end in "type" keeps them apart. */
  instType: /ddl_?ins(t|titute)?type$/i,
  seatType: /ddl_?seattype$/i,
  gender: /ddl_?gender$/i,
};

function findSelectByName(selects, pattern) {
  for (const [name, options] of Object.entries(selects)) {
    /* Compare on the trailing id only: "ctl00$ContentPlaceHolder1$ddlYear" -> "ddlYear". */
    const leaf = name.split(/[$:]/).pop();
    if (pattern.test(leaf)) return { name, options };
  }
  return null;
}

function discoverFields(html) {
  const selects = extractSelects(html);
  const has = (opts, ...needles) => {
    const joined = opts.map(o => o.text.toLowerCase()).join('|');
    return needles.some(n => joined.includes(n));
  };

  /* Records which route found each control so the probe can say so out loud. A control
     found by name with no options is a working ingest only if we can post a literal
     value for it, which is why `set()` below takes one. */
  const pick = (key, predicate) => {
    const byOptions = predicate ? findSelect(selects, predicate) : null;
    if (byOptions) return { ...byOptions, via: 'options' };
    const byName = findSelectByName(selects, CONTROL_NAME_HINTS[key]);
    if (byName) return { ...byName, via: 'name' };
    return null;
  };

  return {
    selects,
    year: pick('year', o => o.every(x => /^20\d\d$/.test(x.text.trim()))),
    /* 1-2 digits only: a 4-digit option is a year, and matching that here would silently
       send the year value into the round field. */
    round: pick('round', o => o.length <= 8 && o.every(x => /^\d{1,2}$/.test(x.text.trim()))),
    instType: pick('instType', o => has(o, 'iit', 'nit', 'gfti')),
    seatType: pick('seatType', o => has(o, 'obc-ncl', 'ews')),
    /* Not posted by the ingest — row gender comes from the results table. JoSAA dropped
       this control from the archive form, so its absence is reported, never fatal. */
    gender: pick('gender', o => has(o, 'gender-neutral', 'female')),
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

async function cached(key, produce, { fromCache, dump }) {
  const file = path.join(CACHE, key);
  /* A dump run exists to see what the server sends right now. Serving it from cache
     would write a dump of a page nobody fetched. */
  if (!dump) {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      if (fromCache) return null;
    }
  } else if (fromCache) {
    return null;
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
  await dumper.write('initial-get', { url: ARCHIVE, method: 'GET', html });
  return { html, fields: discoverFields(html), hidden: extractHiddenFields(html) };
}

/* --------------------------------------------------------- asp.net ajax -- */

/*
  The archive form's dropdowns live inside an UpdatePanel.

  Run #10's contract inspection settled this: the served page contains
  Sys.WebForms, PageRequestManager and UpdatePanel, and nothing anywhere writes
  ctl00$hdnSecKey — it is an empty hidden field, not a token. So the reason a
  well-formed full postback came back as the 11,950-byte "Not Available" page is
  that the browser never sends one. It sends a PARTIAL postback:

    <scriptManagerName> = <updatePanelId>|<eventTarget>
    __ASYNCPOST         = true

  and gets back a pipe-delimited delta rather than a page.

  Both ids are read off the page rather than hardcoded, because they carry the
  ASP.NET container prefix and that is exactly the thing that changes between
  admission years.
*/
function discoverAjax(html) {
  const init = /Sys\.WebForms\.PageRequestManager\._initialize\(\s*'([^']*)'\s*,\s*'([^']*)'\s*(?:,\s*\[([^\]]*)\])?/.exec(html);
  if (!init) return null;

  /* The panel list is rendered as ['tctl00$...$UpdatePanel1',''] — a leading 't'
     or 'f' marks whether the panel always updates. Strip it. */
  const panels = (init[3] || '')
    .split(',')
    .map(part => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .map(id => id.replace(/^[tf]/, ''));

  return { scriptManager: init[1], formId: init[2], panels };
}

/*
  A delta is a flat run of length-prefixed records:

    <len>|<type>|<id>|<content of exactly len chars>|

  The two that matter are `updatePanel`, whose content is the re-rendered HTML
  for that panel, and `hiddenField`, which is how the server hands back the new
  __VIEWSTATE and __EVENTVALIDATION. `error` carries a server-side exception,
  which must surface rather than being read as an empty page.

  Length is counted in characters, so the content is sliced rather than split —
  a record whose HTML contains a pipe would otherwise tear the whole parse apart.
*/
function parseAsyncDelta(text) {
  const out = { panels: {}, hidden: {}, error: null, records: 0 };
  let i = 0;

  while (i < text.length) {
    const lenEnd = text.indexOf('|', i);
    if (lenEnd < 0) break;
    const len = Number(text.slice(i, lenEnd));
    if (!Number.isFinite(len) || len < 0) break;

    const typeEnd = text.indexOf('|', lenEnd + 1);
    if (typeEnd < 0) break;
    const type = text.slice(lenEnd + 1, typeEnd);

    const idEnd = text.indexOf('|', typeEnd + 1);
    if (idEnd < 0) break;
    const id = text.slice(typeEnd + 1, idEnd);

    const content = text.substr(idEnd + 1, len);
    i = idEnd + 1 + len + 1;
    out.records++;

    if (type === 'updatePanel') out.panels[id] = content;
    else if (type === 'hiddenField') out.hidden[id] = content;
    else if (type === 'error') out.error = content;
  }

  return out;
}

/* A delta always opens with a length and a pipe; a page never does. */
function looksLikeDelta(text) {
  return /^\d+\|/.test(String(text || '').trimStart());
}

/* ------------------------------------------------------------ form session -- */

/*
  A conversation with the ASP.NET form, rather than a single shot at it.

  The 13 August dump settled what the page is: ddlYear arrives with eleven options and
  ddlroundno, ddlInstype, ddlInstitute, ddlBranch and ddlSeatType all arrive with none —
  the server fills each one from the postback that follows the choice above it. It also
  showed a submit control, ctl00$ContentPlaceHolder1$btnSubmit, that the ingest never
  posted.

  So the old approach could not have worked, and its failure mode was quiet: one POST
  setting every field at once, carrying the GET's __VIEWSTATE, with no button and an
  empty __EVENTTARGET. ASP.NET answered the only way it can — it rendered the page,
  never ran the button's handler, and returned the same 11,950-byte "Not Available"
  body for every filter. Twelve identical pages read as twelve failed parses.

  This class does what a browser does:

    - every request carries the hidden state from the LAST response, not the first.
      __VIEWSTATE and __EVENTVALIDATION are per-response, and a stale __EVENTVALIDATION
      is what rejects a value the server did not itself render.
    - every request echoes back every control on the form, at whatever it is currently
      set to, because that is what a browser submits.
    - a change posts __EVENTTARGET naming the control that changed, so the server knows
      which cascade step to run.
    - the query posts the button, because that is the thing that builds the grid.
*/
class FormSession {
  constructor(html) { this.load(html); }

  load(html) {
    this.html = html;
    this.hidden = extractHiddenFields(html);
    this.selects = extractSelects(html);
    this.values = extractSelectedValues(html);
    this.button = findSubmitButton(html) || this.button || null;
    this.fields = discoverFields(html);
    /* Only the full page carries the _initialize call, so keep the first one
       seen: a delta re-renders the panel, not the script that set it up. */
    this.ajax = discoverAjax(html) || this.ajax || null;
    return this;
  }

  /*
    Fold a partial-postback delta back in. The panel HTML replaces what we know
    about the controls inside it; the hiddenField records replace __VIEWSTATE and
    __EVENTVALIDATION, which is the whole reason the next request can succeed.
  */
  applyDelta(delta) {
    const panelHtml = Object.values(delta.panels).join('\n');
    if (panelHtml) {
      const selects = extractSelects(panelHtml);
      const values = extractSelectedValues(panelHtml);
      Object.assign(this.selects, selects);
      Object.assign(this.values, values);
      this.html = panelHtml;
      this.fields = discoverFields(this.renderedForm());
      const button = findSubmitButton(panelHtml);
      if (button) this.button = button;
    }
    for (const [name, value] of Object.entries(delta.hidden)) this.hidden[name] = value;
    return this;
  }

  /*
    discoverFields() wants markup, but after a delta what we hold is a set of
    controls spread across the original page and one panel. Re-emit the current
    controls as minimal markup so discovery keeps working off one view.
  */
  renderedForm() {
    return Object.entries(this.selects).map(([name, options]) =>
      '<select name="' + name + '">' +
      options.map(o => '<option value="' + o.value + '">' + o.text + '</option>').join('') +
      '</select>'
    ).join('');
  }

  /** Options currently offered by a control, by its full posted name. */
  optionsFor(name) { return this.selects[name] || []; }

  /**
   * One postback. `changed` is the control whose value we are setting, and becomes
   * __EVENTTARGET; pass `submit: true` instead to press the query button.
   */
  buildPayload({ changed = null, value = null, submit = false }) {
    const payload = new URLSearchParams();

    for (const [k, v] of Object.entries(this.hidden)) payload.set(k, v);
    for (const [name, current] of Object.entries(this.values)) payload.set(name, current);

    if (changed) payload.set(changed, value == null ? '' : String(value));

    payload.set('__EVENTTARGET', submit ? '' : (changed || ''));
    payload.set('__EVENTARGUMENT', '');
    payload.set('__LASTFOCUS', '');

    /* A button posts as a normal field. Its presence is what tells ASP.NET to run the
       click handler; __EVENTTARGET stays empty for a real button press. */
    if (submit && this.button) payload.set(this.button.name, this.button.value);

    /*
      Inside an UpdatePanel every one of these is a partial postback, including
      the button press. The ScriptManager field names which panel is being
      updated and what triggered it; without it the server renders the whole page
      and, on this form, refuses.
    */
    if (this.ajax && this.ajax.scriptManager) {
      const panel = this.ajax.panels[0] || '';
      const trigger = submit && this.button ? this.button.name : (changed || '');
      payload.set(this.ajax.scriptManager, panel + '|' + trigger);
      payload.set('__ASYNCPOST', 'true');
    }

    return payload;
  }
}

/** Sends one step of the conversation and folds the response back into the session. */
async function step(session, opts, { label, dump }) {
  const payload = session.buildPayload(opts);
  const body = payload.toString();

  let html;
  try {
    html = await request(ARCHIVE, { method: 'POST', body, async: Boolean(session.ajax) });
  } catch (err) {
    /* Run #12 lost the whole request because the dump was written only after a
       successful response — five connect timeouts and nothing on disk to show
       what we had been about to send. Record the attempt, then rethrow. */
    if (dump) {
      await dumper.write(label + '-FAILED', {
        url: ARCHIVE, method: 'POST', payload: body,
        html: '(no response — ' + describeError(err) + ')',
      });
    }
    throw err;
  }

  if (dump) await dumper.write(label, { url: ARCHIVE, method: 'POST', payload: body, html });

  if (looksLikeDelta(html)) {
    const delta = parseAsyncDelta(html);
    if (delta.error) {
      throw new Error('JoSAA returned a server error in the partial postback: ' + delta.error.slice(0, 300));
    }
    session.applyDelta(delta);
  } else {
    session.load(html);
  }
  /* Remember what we just chose: the response re-renders the control and, if the server
     honoured the choice, marks it selected — but if it re-renders it empty we would
     otherwise silently drop back to the placeholder on the next step. */
  if (opts.changed) session.values[opts.changed] = opts.value == null ? '' : String(opts.value);
  return html;
}

/*
  Pick an option by what it says, and say so out loud when nothing matches.

  The previous version fell back to `options[options.length - 1]`, which meant a failed
  match silently selected whatever happened to sort last — asking for 2024 and being
  handed some other year, with nothing in the log to say so. A pull that cannot select
  what it was asked for has to stop, not improvise.
*/
function chooseOption(options, matcher, what) {
  const hit = options.find(matcher);
  if (hit) return hit;
  const seen = options.slice(0, 8).map(o => o.text).join(', ') || '(none)';
  throw new Error(`Could not find ${what} among the options the form offered: ${seen}`);
}

/** "All" where the form offers it, otherwise the first real option. */
function chooseAll(options) {
  return options.find(o => /^all\b/i.test(o.text.trim())) || options[0] || null;
}

/* The ingest only ever posts these three. gender is reported for visibility but JoSAA
   removed it from the archive form, and row gender comes from the results table, so a
   missing gender control must not fail the probe. */
const REQUIRED_CONTROLS = ['year', 'round', 'instType'];

async function probe() {
  console.log(`Probing ${ARCHIVE} ...\n`);
  const { fields } = await fetchArchiveForm();
  const report = ['year', 'round', 'instType', 'seatType', 'gender'];
  const missing = [];
  let emptyOptions = 0;

  for (const key of report) {
    const required = REQUIRED_CONTROLS.includes(key);
    const f = fields[key];
    if (!f) {
      if (required) missing.push(key);
      console.log(`  ${key.padEnd(10)} NOT FOUND${required ? '' : '  (optional — not posted by the ingest)'}`);
      continue;
    }
    console.log(`  ${key.padEnd(10)} ${f.name}  [matched by ${f.via}]`);
    if (f.options.length) {
      console.log(`  ${''.padEnd(10)}   ${f.options.slice(0, 6).map(o => o.text).join(', ')}${f.options.length > 6 ? ` … (${f.options.length})` : ''}`);
    } else {
      emptyOptions++;
      console.log(`  ${''.padEnd(10)}   (no options in the served HTML — filled by postback)`);
    }
  }

  console.log(`\nAll <select> controls seen: ${Object.keys(fields.selects).join(', ') || '(none)'}`);

  if (emptyOptions) {
    console.log(
      `\n${emptyOptions} control(s) arrived empty. That is expected on this page now: JoSAA\n` +
      `populates them by postback. The ingest posts literal values (the year, the institute\n` +
      `type) for those, so this is not on its own a problem — but it does mean the values\n` +
      `are unverified until a real pull returns rows. Run the smoke test next.`
    );
  }

  if (missing.length) {
    console.log(`\nRequired control(s) not recognised: ${missing.join(', ')}.`);
    console.log(`JoSAA has probably renamed them. Update CONTROL_NAME_HINTS from the list above,`);
    console.log(`then re-probe. Do not guess field names — read them off the page.`);
    process.exitCode = 1;
  } else {
    console.log(`\nField discovery looks healthy — safe to run a smoke test.`);
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

  /* Guard for the literal-value path above. If JoSAA ignores a posted value, every
     combination comes back as the same page — same row count in every year, which the
     validator's "incomplete pull" check reads as healthy. Fingerprinting the parsed rows
     catches it: two filter combinations must not produce byte-identical results. */
  const seenPages = new Map();
  const fingerprint = rows =>
    createHash('sha256')
      .update(rows.map(r => `${r.institute}|${r.branch}|${r.seatType}|${r.openRank}|${r.closeRank}`).join('\n'))
      .digest('hex');

  /* A dump is for reading, not for coverage. One combination now traces six labelled
     steps — year, round, type, the three "All" selections and the submit — which is the
     whole conversation; a second copy of it just makes a bigger artifact to scroll. */
  const DUMP_MAX_POSTS = 1;
  let dumpPosts = 0;

  for (const year of args.years) {
    for (const instType of INSTITUTE_TYPES) {
      if (args.dump && dumpPosts >= DUMP_MAX_POSTS) {
        console.log(`\nDump limit reached (${DUMP_MAX_POSTS} posts) — stopping early.`);
        return;
      }
      if (args.dump) dumpPosts++;
      const round = args.round ?? 'final';
      const key = cacheKey(['orcr', year, instType, round]);

      const html = await cached(key, async () => {
        if (!form) throw new Error('no cache and --from-cache set');
        if (args.verbose) console.log(`  -> ${year} ${instType} round=${round}`);

        /*
          A fresh form per combination. The query response does not carry the dropdowns
          any more — the "Not Available" page had no <select> at all — so there is
          nothing left to drive a second query from, and re-fetching is both simpler and
          honest about that.
        */
        const session = new FormSession(await request(ARCHIVE));
        const tag = `${year}-${instType}`.toLowerCase();

        const nameOf = key => session.fields[key]?.name;

        // 1. Year. The only control the served page fills in for us.
        const yearName = nameOf('year');
        if (!yearName) throw new Error('No year control on the form. Run --probe.');
        const yearOpt = chooseOption(
          session.optionsFor(yearName), o => o.text.trim() === String(year), `year ${year}`
        );
        await step(session, { changed: yearName, value: yearOpt.value },
                   { label: `${tag}-1-year`, dump: args.dump });

        // 2. Round. Populated by the year postback. Default to the last one, which is
        //    the final round — the ranks people actually quote.
        const roundName = nameOf('round');
        if (roundName) {
          const opts = session.optionsFor(roundName);
          if (opts.length) {
            const roundOpt = args.round != null
              ? chooseOption(opts, o => o.text.trim() === String(args.round), `round ${args.round}`)
              : opts[opts.length - 1];
            await step(session, { changed: roundName, value: roundOpt.value },
                       { label: `${tag}-2-round`, dump: args.dump });
          }
        }

        // 3. Institute type. Populated by the round postback.
        const typeName = nameOf('instType');
        if (!typeName) throw new Error('No institute-type control on the form. Run --probe.');
        const needle = instType.split('-')[0].toLowerCase();
        const typeOpt = chooseOption(
          session.optionsFor(typeName),
          o => o.text.toLowerCase().includes(needle),
          `institute type ${instType}`
        );
        await step(session, { changed: typeName, value: typeOpt.value },
                   { label: `${tag}-3-insttype`, dump: args.dump });

        // 4. Institute, branch and seat type: take "All" so one query covers the type.
        for (const [key, pattern] of [['institute', /ddl_?institute$/i], ['branch', /ddl_?branch$/i], ['seatType', /ddl_?seattype$/i]]) {
          const found = findSelectByName(session.selects, pattern);
          if (!found || !found.options.length) continue;
          const all = chooseAll(found.options);
          if (!all) continue;
          await step(session, { changed: found.name, value: all.value },
                     { label: `${tag}-4-${key}`, dump: args.dump });
        }

        // 5. Press Submit. This is the step that was missing entirely, and without it
        //    ASP.NET never runs the handler that builds the grid.
        if (!session.button) {
          throw new Error('No submit button found on the form — the grid is built by one. Run --dump.');
        }
        if (args.verbose) console.log(`     pressing ${session.button.name}`);
        return await step(session, { submit: true }, { label: `${tag}-5-submit`, dump: args.dump });
      }, args);

      if (!html) { problems.push(`${year}/${instType}: no cached page and network disabled`); continue; }

      const rows = parseResultTable(html);
      if (!rows.length) { problems.push(`${year}/${instType}: no result rows parsed`); continue; }

      const fp = fingerprint(rows);
      const clash = seenPages.get(fp);
      if (clash) {
        problems.push(
          `${year}/${instType} returned exactly the same rows as ${clash} — the posted filter ` +
          `was ignored, so this data is not what it claims to be. Re-probe before trusting any of it.`
        );
        continue;
      }
      seenPages.set(fp, `${year}/${instType}`);

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
  await dumper.init(args.dump);
  if (args.probe) await probe();
  else await ingest(args);
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  process.exitCode = 1;
}
