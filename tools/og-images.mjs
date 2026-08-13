#!/usr/bin/env node
/**
 * Generates 1200x630 Open Graph cards into og/, in the same house style as the
 * cards that already ship there: navy gradient, gold rule along the top, logo
 * lockup, gold eyebrow, serif headline, and a footer line with the price pill.
 *
 * The cards it produces are checked in, so this only needs re-running when a
 * page is added to PAGES below or the styling changes.
 *
 *   node tools/og-images.mjs            # write every card
 *   node tools/og-images.mjs home start # write just these slugs
 *
 * Needs Playwright's chromium. Existing hand-made cards are never overwritten
 * unless their slug is listed here.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'og');

// slug -> { eyebrow, title }. slug is the og/<slug>.png filename.
const PAGES = {
  home:                             { eyebrow: 'From ₹249 a session', title: "India's Most Affordable Career Counselling" },
  'college-predictor':              { eyebrow: 'JoSAA Tools',        title: 'What Can You Get With Your JEE Rank?' },
  'choice-list':                    { eyebrow: 'JoSAA Tools',        title: 'Get Your Choice List In The Right Order' },
  colleges:                         { eyebrow: 'JoSAA Tools',        title: 'Every College In JoSAA Counselling' },
  'services-pricing':               { eyebrow: 'Services & Pricing', title: 'Affordable Counselling, Priced In The Open' },
  start:                            { eyebrow: 'Start Here',         title: "Not Sure Where To Begin? Two Taps." },
  'story-careers-beyond-doctor-engineer': { eyebrow: 'Career Stories', title: '5 Careers Beyond Doctor & Engineer' },
  'story-exam-burnout':             { eyebrow: 'Career Stories',     title: '5 Quiet Signs Of Exam Burnout' },
  'internship-ethics':              { eyebrow: 'Internships',        title: 'How We Protect Clients And Interns' },
  'privacy-policy':                 { eyebrow: 'Policies',           title: 'Your Privacy, Handled With Care' },
  'refund-policy':                  { eyebrow: 'Policies',           title: 'Transparent Payment Support' },
  terms:                            { eyebrow: 'Policies',           title: 'Clear Terms For A Calm Experience' },
};

const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'logo.png')).toString('base64');

// Fonts are vendored and inlined rather than pulled from the Google Fonts CDN:
// the generator has to render identically offline, and a webfont that fails to
// load silently falls back to a system serif and ships a wrong-looking card.
const font = f => 'data:font/woff2;base64,' +
  fs.readFileSync(path.join(ROOT, 'tools', 'fonts', f + '.woff2')).toString('base64');

const FACES = `
  @font-face{font-family:Mont;src:url(${font('montserrat-800')}) format('woff2');font-weight:800}
  @font-face{font-family:Mont;src:url(${font('montserrat-900')}) format('woff2');font-weight:900}
  @font-face{font-family:Playf;src:url(${font('playfair-800')}) format('woff2');font-weight:800}
`;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const card = ({ eyebrow, title }) => `<!doctype html><meta charset="utf-8">
<style>
${FACES}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;font-family:Mont,Arial,sans-serif;
       background:
         radial-gradient(70% 90% at 0% 0%, rgba(10,110,110,.55), transparent 62%),
         radial-gradient(50% 70% at 100% 108%, rgba(201,147,58,.16), transparent 60%),
         linear-gradient(150deg,#0D1B40,#13224d 55%,#0D1B40);
       position:relative;padding:64px 76px;display:flex;flex-direction:column;justify-content:space-between}
  .rule{position:absolute;top:0;left:0;right:0;height:8px;
        background:linear-gradient(90deg,#0A6E6E,#0E8C8C 22%,#C9933A 62%,#E8B95A)}
  .brand{display:flex;align-items:center;gap:20px}
  .brand img{width:56px;height:56px;border-radius:50%;object-fit:cover;
             border:2px solid rgba(232,185,90,.75)}
  .brand span{font-size:27px;font-weight:900;letter-spacing:.13em;color:#fff}
  .brand span b{color:#E8B95A;font-weight:900}
  .eyebrow{font-size:20px;font-weight:800;letter-spacing:.19em;text-transform:uppercase;
           color:#E8B95A;margin-bottom:22px}
  h1{font-family:Playf,Georgia,serif;font-weight:800;color:#fff;
     font-size:${title.length > 44 ? 62 : 72}px;line-height:1.12;max-width:1010px;
     letter-spacing:-.01em}
  .foot{display:flex;align-items:center;justify-content:space-between;gap:24px}
  .foot .site{font-size:21px;font-weight:800;color:#fff}
  .foot .site i{font-style:normal;color:rgba(255,255,255,.62);font-weight:700}
  .pill{border:1.5px solid rgba(232,185,90,.6);border-radius:999px;padding:13px 26px;
        font-size:19px;font-weight:800;color:#E8B95A;white-space:nowrap;
        background:rgba(232,185,90,.07)}
</style>
<div class="rule"></div>
<div class="brand"><img src="${logo}" alt=""><span>LUME <b>LIVE</b></span></div>
<div>
  <div class="eyebrow">${esc(eyebrow)}</div>
  <h1>${esc(title)}</h1>
</div>
<div class="foot">
  <div class="site">lumelive.co.in <i>· Career &amp; Mental-Health Counselling</i></div>
  <div class="pill">Founder-led · ₹249 first session</div>
</div>`;

const only = process.argv.slice(2);
const targets = Object.entries(PAGES).filter(([slug]) => !only.length || only.includes(slug));
if (!targets.length) {
  console.error('No matching slugs. Known:', Object.keys(PAGES).join(', '));
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

for (const [slug, spec] of targets) {
  await page.setContent(card(spec), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, `${slug}.png`) });
  console.log('wrote og/' + slug + '.png');
}

await browser.close();
