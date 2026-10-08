#!/usr/bin/env node
/**
 * fetch-profession-photos.mjs — pull strictly-CC0 / public-domain photos for the
 * profession pages, optimise them, record provenance, and wire them in.
 *
 *   node tools/fetch-profession-photos.mjs                # fetch any that are missing
 *   node tools/fetch-profession-photos.mjs --force        # re-fetch all
 *   node tools/fetch-profession-photos.mjs --only=nurse,chef
 *
 * RUN THIS LOCALLY, not in the Claude cloud session — that environment's network policy
 * blocks every image host. On a normal machine it just works (no API key needed).
 *
 * What it does, per profession:
 *   1. Queries the Openverse API filtered to license=cc0,pdm (CC0 + Public Domain Mark
 *      only — genuinely licence-free, no attribution required), wide orientation.
 *   2. Downloads the first usable result and, if `sharp` is installed, crops/compresses
 *      it to a 1200x640 JPEG (install with: npm i sharp). Without sharp it saves the raw
 *      image — the page CSS still crops it to the banner via object-fit, just larger.
 *   3. Writes images/professions/<slug>.jpg and records source/licence in credits.json.
 * Finally it rebuilds the generated profession pages, injects the banner into the older
 * hand-authored ones, and regenerates the sitemap. The banner only appears on a page once
 * its image exists, so nothing changes until you run this.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'images', 'professions');
const API = 'https://api.openverse.org/v1/images/';

const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '')
  .split(',').map(s => s.trim()).filter(Boolean);

// slug -> [search query, display name]. Names drive alt text + injection into the older
// hand-authored pages; the 14 generated pages take their names from career-profiles.mjs.
const PROFS = {
  nurse: ['nurse hospital patient care', 'Nurse'],
  dentist: ['dentist dental clinic', 'Dentist'],
  pharmacist: ['pharmacist pharmacy medicine', 'Pharmacist'],
  physiotherapist: ['physiotherapy rehabilitation exercise', 'Physiotherapist'],
  'company-secretary': ['corporate office boardroom meeting', 'Company Secretary'],
  'fashion-designer': ['fashion design studio sewing', 'Fashion Designer'],
  chef: ['chef cooking restaurant kitchen', 'Chef'],
  journalist: ['journalist microphone newsroom reporter', 'Journalist'],
  'civil-engineer': ['civil engineer construction site', 'Civil Engineer'],
  teacher: ['teacher classroom students', 'Teacher'],
  'ai-ml-engineer': ['artificial intelligence computer code server', 'AI/ML Engineer'],
  'cybersecurity-analyst': ['cybersecurity computer server network', 'Cybersecurity Analyst'],
  'investment-banker': ['finance stock market trading office', 'Investment Banker'],
  'cost-accountant': ['accounting calculator finance desk', 'Cost Accountant'],
  // older hand-authored profession pages
  architect: ['architect blueprint drawing building', 'Architect'],
  'chartered-accountant': ['accountant finance office documents', 'Chartered Accountant'],
  'civil-services-ias': ['government building india administration', 'Civil Services (IAS) Officer'],
  'commercial-pilot': ['airline pilot cockpit aircraft', 'Commercial Pilot'],
  'data-scientist': ['data analytics charts computer screen', 'Data Scientist'],
  'digital-marketer': ['digital marketing laptop analytics', 'Digital Marketer'],
  'doctor-mbbs': ['doctor hospital stethoscope', 'Doctor (MBBS)'],
  lawyer: ['lawyer courtroom law books justice', 'Lawyer'],
  'product-designer': ['product designer sketching prototype', 'Product Designer'],
  psychologist: ['counselling therapy conversation office', 'Psychologist'],
  'software-engineer': ['software developer coding computer', 'Software Engineer'],
};

// Which pages are hand-authored (need banner injection vs a generator rebuild).
const GENERATED = new Set([
  'nurse', 'dentist', 'pharmacist', 'physiotherapist', 'company-secretary', 'fashion-designer',
  'chef', 'journalist', 'civil-engineer', 'teacher', 'ai-ml-engineer', 'cybersecurity-analyst',
  'investment-banker', 'cost-accountant',
]);

const clean = s => String(s || '').replace(/[<>"&]/g, '').trim();

async function openverse(query) {
  const url = `${API}?q=${encodeURIComponent(query)}&license=cc0,pdm&size=large&aspect_ratio=wide&mature=false&page_size=12`;
  const r = await fetch(url, { headers: { 'User-Agent': 'LumeLive-photo-fetch/1.0' } });
  if (!r.ok) throw new Error(`Openverse ${r.status}`);
  const j = await r.json();
  return (j.results || []).filter(x => ['cc0', 'pdm'].includes((x.license || '').toLowerCase()));
}

async function download(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'LumeLive-photo-fetch/1.0' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`img ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw new Error(`not an image (${ct})`);
  return Buffer.from(await r.arrayBuffer());
}

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* optional */ }

async function save(buf, file) {
  if (sharp) {
    await sharp(buf).resize(1200, 640, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 80, mozjpeg: true }).toFile(file);
  } else {
    fs.writeFileSync(file, buf); // CSS object-fit still crops to the banner at display time
  }
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const creditsFile = path.join(OUT, 'credits.json');
  const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, 'utf8')) : {};
  if (!sharp) console.warn('• sharp not installed — saving raw images (install for smaller files: npm i sharp)\n');

  let got = 0;
  for (const [slug, [query, name]] of Object.entries(PROFS)) {
    if (ONLY.length && !ONLY.includes(slug)) continue;
    const file = path.join(OUT, `${slug}.jpg`);
    if (fs.existsSync(file) && !FORCE) { console.log(`· ${slug}: already present (skip)`); continue; }
    try {
      const results = await openverse(query);
      let saved = false;
      for (const res of results) {
        const u = res.url || res.thumbnail;
        if (!u) continue;
        try {
          const buf = await download(u);
          await save(buf, file);
          credits[slug] = {
            title: clean(res.title) || name,
            creator: clean(res.creator),
            license: (res.license || '').toUpperCase() + (res.license_version ? ` ${res.license_version}` : ''),
            source: res.foreign_landing_url || res.url,
            fetched: new Date().toISOString().slice(0, 10),
          };
          console.log(`✓ ${slug}: ${credits[slug].license} — ${credits[slug].title}`);
          saved = true; got++;
          break;
        } catch { /* try next result */ }
      }
      if (!saved) console.warn(`✗ ${slug}: no usable CC0/PD image found for "${query}"`);
    } catch (e) {
      console.warn(`✗ ${slug}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 400)); // be polite to the API
  }

  fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + '\n');

  // Rebuild generated pages (the generator now sees the image files) and inject the
  // banner into the older hand-authored pages.
  execFileSync('node', ['tools/build-career-profiles.mjs'], { cwd: ROOT, stdio: 'inherit' });
  injectHandAuthored(credits);
  try { execFileSync('node', ['tools/sitemap.mjs'], { cwd: ROOT, stdio: 'inherit' }); } catch { /* optional */ }

  console.log(`\nDone. Fetched ${got} photo(s). Review them, then commit images/professions/ and the pages.`);
}

function figure(slug, name, cr) {
  const cap = cr ? `<figcaption>Photo: ${clean(cr.title)} · ${cr.license}${cr.source ? ` · <a href="${cr.source}" target="_blank" rel="noopener nofollow">source</a>` : ''}</figcaption>` : '';
  return `\n<figure class="ar-photo"><img src="images/professions/${slug}.jpg" alt="${name} at work in India" loading="lazy" decoding="async">${cap}</figure>\n`;
}

function injectHandAuthored(credits) {
  for (const [slug, [, name]] of Object.entries(PROFS)) {
    if (GENERATED.has(slug)) continue;                       // handled by the generator
    if (!fs.existsSync(path.join(OUT, `${slug}.jpg`))) continue;
    const f = path.join(ROOT, `career-as-${slug}.html`);
    if (!fs.existsSync(f)) continue;
    let html = fs.readFileSync(f, 'utf8');
    if (html.includes('class="ar-photo"')) continue;         // idempotent
    const anchor = '</header>\n\n<div class="wrap">';
    if (!html.includes(anchor)) { console.warn(`! ${slug}: hero anchor not found, skipped injection`); continue; }
    html = html.replace(anchor, `</header>\n${figure(slug, name, credits[slug])}\n<div class="wrap">`);
    fs.writeFileSync(f, html);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
