/* profession-art.mjs — original, on-brand SVG emblem illustrations, one per profession.
 *
 * These are authored by hand (not fetched), so they are genuinely licence-free, inline
 * (CSP-safe), razor-sharp at any size and themed to the brand. Each is a minimal
 * two-colour line emblem (gold + light-teal, with occasional white) on a soft cushioned
 * badge, sized for the hero of a career-as-<slug> page.
 *
 * Shared by build-career-profiles.mjs (the generated guides) and the one-off hero
 * migration for the older hand-authored guides, so both use the identical art.
 */

const G = '#E8B95A';   // gold — primary stroke
const T = '#7FC4C4';   // light teal — secondary
const W = '#ffffff';

// Common emblem stroke defaults applied on the <g>.
const badge = inner => `<svg class="ar-art" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
  `<rect x="2.5" y="2.5" width="91" height="91" rx="23" fill="${W}" fill-opacity="0.06" stroke="${G}" stroke-opacity="0.32" stroke-width="1.5"/>` +
  `<g fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;

const EM = {
  // ── Medical & health ───────────────────────────────────────────────
  'doctor-mbbs': // stethoscope
    `<circle cx="33" cy="26" r="3.5" stroke="${T}"/><circle cx="55" cy="26" r="3.5" stroke="${T}"/>` +
    `<path d="M33 29.5c0 16 11 17 11 23M55 29.5c0 16-11 17-11 23" stroke="${T}"/>` +
    `<path d="M44 52.5v6a14 14 0 0 0 20 12.6" stroke="${G}"/>` +
    `<circle cx="68" cy="66" r="8" stroke="${G}"/><circle cx="68" cy="66" r="2.5" fill="${G}" stroke="none"/>`,
  'nurse': // caring heart + medical cross
    `<path d="M48 72C30 60 22 50 22 39a13 13 0 0 1 26-3 13 13 0 0 1 26 3c0 11-8 21-26 33z" stroke="${G}"/>` +
    `<path d="M48 38v16M40 46h16" stroke="${T}"/>`,
  'dentist': // tooth
    `<path d="M48 26c-10-8-26-4-26 10 0 10 4 14 6 26 2 10 10 10 11-2 .5-6 1-9 3-9s2.5 3 3 9c1 12 9 12 11 2 2-12 6-16 6-26 0-14-16-18-26-10" stroke="${G}"/>` +
    `<path d="M40 36c3-2 8-2 11 0" stroke="${T}"/>`,
  'pharmacist': // capsule + cross
    `<rect x="30" y="30" width="22" height="44" rx="11" transform="rotate(-45 41 52)" stroke="${G}"/>` +
    `<path d="M33 41 49 57" stroke="${G}"/>` +
    `<path d="M64 30v12M58 36h12" stroke="${T}"/>`,
  'physiotherapist': // figure in motion
    `<circle cx="42" cy="26" r="5" stroke="${G}"/>` +
    `<path d="M42 31v18l-8 16M42 42l12 6M42 49l10 16" stroke="${G}"/>` +
    `<path d="M60 28c5 3 8 8 8 14" stroke="${T}"/>`,
  'psychologist': // head profile + spiral
    `<path d="M62 70c-3 4-9 5-14 5-14 0-24-11-24-25S34 24 46 24c11 0 20 8 21 18" stroke="${G}"/>` +
    `<path d="M52 44a7 7 0 1 0-7 7 10 10 0 1 0 10-10" stroke="${T}"/>`,

  // ── Finance & commerce ─────────────────────────────────────────────
  'chartered-accountant': // calculator
    `<rect x="28" y="22" width="40" height="52" rx="6" stroke="${G}"/>` +
    `<rect x="34" y="28" width="28" height="10" rx="2" stroke="${T}"/>` +
    `<path d="M36 48h0M48 48h0M60 48h0M36 56h0M48 56h0M60 56h0M36 64h0M48 64h0M60 64h0" stroke="${G}"/>`,
  'company-secretary': // document + seal
    `<path d="M34 20h20l12 12v38a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4z" stroke="${G}"/>` +
    `<path d="M54 20v12h12M38 40h20M38 48h20" stroke="${T}"/>` +
    `<circle cx="58" cy="64" r="8" stroke="${G}"/><path d="M58 60v8M54 64h8" stroke="${G}"/>`,
  'cost-accountant': // pie + coin
    `<path d="M46 48V26a22 22 0 1 0 22 22H46z" stroke="${G}"/>` +
    `<path d="M50 44h18a18 18 0 0 0-18-18z" stroke="${T}"/>`,
  'investment-banker': // rising chart + arrow
    `<path d="M26 70h44M30 70V54M42 70V44M54 70V50M66 70V34" stroke="${T}"/>` +
    `<path d="M30 56l12-12 12 6 16-20M58 30h12v12" stroke="${G}"/>`,

  // ── Technology ─────────────────────────────────────────────────────
  'software-engineer': // code brackets
    `<rect x="22" y="26" width="52" height="44" rx="6" stroke="${T}"/>` +
    `<path d="M40 42l-8 6 8 6M56 42l8 6-8 6M50 38l-6 20" stroke="${G}"/>`,
  'data-scientist': // scatter + trend
    `<path d="M28 24v46h44" stroke="${T}"/>` +
    `<path d="M34 62l12-10 10 4 14-22" stroke="${G}"/>` +
    `<circle cx="34" cy="62" r="2.5" fill="${G}" stroke="none"/><circle cx="46" cy="52" r="2.5" fill="${G}" stroke="none"/><circle cx="56" cy="56" r="2.5" fill="${G}" stroke="none"/><circle cx="70" cy="34" r="2.5" fill="${G}" stroke="none"/>`,
  'ai-ml-engineer': // neural net
    `<circle cx="28" cy="34" r="4" stroke="${G}"/><circle cx="28" cy="62" r="4" stroke="${G}"/>` +
    `<circle cx="48" cy="48" r="4" stroke="${T}"/>` +
    `<circle cx="68" cy="34" r="4" stroke="${G}"/><circle cx="68" cy="62" r="4" stroke="${G}"/>` +
    `<path d="M31 36l14 10M31 60l14-10M51 46l14-10M51 50l14 10" stroke="${T}"/>`,
  'cybersecurity-analyst': // shield + keyhole
    `<path d="M48 22l22 8v16c0 16-10 24-22 28-12-4-22-12-22-28V30z" stroke="${G}"/>` +
    `<circle cx="48" cy="46" r="5" stroke="${T}"/><path d="M48 51v9" stroke="${T}"/>`,

  // ── Creative & design ──────────────────────────────────────────────
  'product-designer': // compass pen + node
    `<path d="M30 68L58 28l8 8-28 40-11 3z" stroke="${G}"/>` +
    `<path d="M52 34l8 8" stroke="${T}"/>` +
    `<circle cx="34" cy="64" r="3" fill="${G}" stroke="none"/>`,
  'fashion-designer': // dress + needle
    `<path d="M40 24l-6 10 6 6-10 30h24l-10-30 6-6-6-10z" stroke="${G}"/>` +
    `<path d="M60 30l10 10M66 28l6 6" stroke="${T}"/><circle cx="60" cy="30" r="2.5" stroke="${T}"/>`,
  'journalist': // microphone
    `<rect x="40" y="22" width="16" height="30" rx="8" stroke="${G}"/>` +
    `<path d="M32 44a16 16 0 0 0 32 0M48 60v12M40 72h16" stroke="${T}"/>`,
  'architect': // building + ruler
    `<path d="M30 72V36l16-10 16 10v36" stroke="${G}"/>` +
    `<path d="M40 72V54h12v18M40 44h0M52 44h0" stroke="${T}"/>` +
    `<path d="M64 30l8 8-22 22" stroke="${G}"/>`,

  // ── Other professions ──────────────────────────────────────────────
  'chef': // toque + collar
    `<path d="M32 50a12 12 0 1 1 7-22 12 12 0 0 1 18 0 12 12 0 1 1 7 22z" stroke="${G}"/>` +
    `<path d="M32 50v16h32V50" stroke="${T}"/><path d="M40 50v16M48 50v16M56 50v16" stroke="${T}"/>`,
  'teacher': // open book
    `<path d="M48 32c-6-6-16-6-22-4v34c6-2 16-2 22 4 6-6 16-6 22-4V28c-6-2-16-2-22 4z" stroke="${G}"/>` +
    `<path d="M48 32v38" stroke="${T}"/>`,
  'civil-engineer': // hard hat
    `<path d="M24 62h48M30 62v-8a18 18 0 0 1 36 0v8" stroke="${G}"/>` +
    `<path d="M44 38V28h8v10" stroke="${T}"/><path d="M38 54h20" stroke="${T}"/>`,
  'commercial-pilot': // airplane
    `<path d="M44 20c4 0 6 6 6 14v10l20 12v6l-20-6v10l6 6v4l-12-4-12 4v-4l6-6V60l-20 6v-6l20-12V34c0-8 2-14 6-14z" stroke="${G}"/>`,
  'digital-marketer': // megaphone + arrow
    `<path d="M26 44v10l8 2 4 14h6l-3-13 25 9V32z" stroke="${G}"/>` +
    `<path d="M74 30c6 4 6 20 0 24" stroke="${T}"/>`,
  'lawyer': // scales of justice
    `<path d="M48 22v50M34 72h28M26 34h44M48 34l-8-8M48 34l8-8" stroke="${G}"/>` +
    `<path d="M26 34l-7 16a9 9 0 0 0 14 0zM70 34l-7 16a9 9 0 0 0 14 0z" stroke="${T}"/>`,
  'civil-services-ias': // columned building + star
    `<path d="M24 40l24-14 24 14M28 40v26M40 40v26M56 40v26M68 40v26M24 70h48" stroke="${G}"/>` +
    `<path d="M48 30l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" stroke="${T}"/>`,
};

export const ART = {};
for (const [slug, inner] of Object.entries(EM)) ART[slug] = badge(inner);
