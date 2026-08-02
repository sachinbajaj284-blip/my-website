# JoSAA cutoff dataset — runbook

The college predictor (`college-predictor.html`) reads a static dataset in `data/josaa/`.
That dataset is **not** in git and **not** built during deploy. You generate it by hand a
few times a year, check it, and commit it.

## Why it is not automated

JoSAA publishes final ranks once per admission cycle. Scraping a government server on
every Vercel deploy would be rude and pointless. The ingest is a manual, deliberate step.

## Where to run it

The ingest needs to reach `josaa.admissions.nic.in`. Many networks — corporate VPNs, some
cloud sandboxes, and the Claude Code web environment — block `.nic.in` outright. Pick
whichever of these works for you:

**A. GitHub Actions (recommended, nothing to install).** Actions tab → *Refresh JoSAA
dataset* → *Run workflow*. Leave `smoke_test` ticked for the first run: it pulls a few
hundred rows, proves the scraper still matches the live page, and commits nothing. If that
succeeds, run it again with `smoke_test` unticked and it will ingest, validate, generate
the browse pages, and commit everything back to the branch. It also runs monthly through
July–September, when JoSAA publishes.

**B. Your own machine.** Node 18+ and ordinary broadband:

```bash
git clone <this repo> && cd my-website
npm run josaa:probe      # confirm JoSAA is reachable and the form still matches
npm run josaa:refresh    # ingest -> validate -> generate
git add data/josaa colleges sitemap-colleges.xml && git commit && git push
```

**C. The environment's network policy.** If you want this to work inside a Claude Code web
session, the environment has to allow `josaa.admissions.nic.in`. See
<https://code.claude.com/docs/en/claude-code-on-the-web> for how network policies are
configured.

If `--probe` times out from a runner but works from your laptop, JoSAA is likely
throttling or geo-blocking non-Indian IPs — use option B.

## Prerequisites

Node 18+. The ingest tools use only Node built-ins, so there is nothing to `npm install`.

## Steps

```bash
# 1. Check that JoSAA has not renamed its form controls since the last run.
npm run josaa:probe

# 2. Pull the data. Raw HTML is cached in tools/.cache/josaa/ (gitignored).
npm run josaa:ingest -- --years 2024,2025,2026

# 3. Gate: refuses to pass on swapped columns, bad ranks, partial pulls.
npm run josaa:validate

# 4. Generate the static browse pages under colleges/ + sitemap-colleges.xml.
npm run josaa:pages

# 5. Eyeball the predictor and colleges.html locally, then commit
#    data/josaa/, colleges/ and sitemap-colleges.xml together.
```

`npm run josaa:refresh` chains steps 2-4 in order and stops on the first failure.

`npm run josaa:test` runs the parser unit tests against a fixture and needs no network —
run it after touching `tools/josaa-ingest.mjs`.

To render a staging dataset without touching the live pages:

```bash
node tools/josaa-pages.mjs --data /tmp/staging/josaa --out /tmp/staging/colleges
```

## Last resort: feed it pages by hand

If nothing can reach JoSAA programmatically, you can still build the dataset. Open the
[archive page](https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx)
in a browser, run one query per institute type for each year, save each result page
(Ctrl+S, "HTML only"), and drop the files here with exactly these names:

```
tools/.cache/josaa/orcr__2026__iit__final.html
tools/.cache/josaa/orcr__2026__nit__final.html
tools/.cache/josaa/orcr__2026__iiit__final.html
tools/.cache/josaa/orcr__2026__other-gfti__final.html
```

…and the same for each other year. Then:

```bash
node tools/josaa-ingest.mjs --years 2024,2025,2026 --from-cache
npm run josaa:validate && npm run josaa:pages
```

`--from-cache` makes no network calls at all — it just re-parses whatever is in the cache
directory. This is also how you re-apply a parser fix without re-scraping.

## When the probe fails

JoSAA is an ASP.NET WebForms app and its control ids change between years. The ingest
discovers controls by their **option vocabulary** rather than their id, so most
year-to-year changes are absorbed automatically. If `--probe` still reports `NOT FOUND`,
open `discoverFields()` in `tools/josaa-ingest.mjs` and widen the matcher for the control
in question. Do not hardcode an id you have not seen in the live page, and do not guess.

## What the data looks like

- `manifest.json` — dictionaries (institutes, branches, quotas), the years covered, the
  source attribution, and a `problems` array recording anything the ingest could not pull.
- `<seat-type>__<gender>.json` — one shard per combination, so a student downloads only
  their slice. Rows are `[institute, branch, quota, year, openingRank, closingRank]`
  against dictionary indices.
- `institute-states.json` — hand-maintained institute→state map powering the Home State
  quota filter and the state filter on `colleges.html`. Extend it when the ingest reports
  an unmatched NIT/IIIT/GFTI.
- `pagesGeneratedAt` — stamped into the manifest by `josaa-pages.mjs`. `colleges.html`
  links to the generated per-institute pages only when this is present, so an ingest
  without a generate cannot leave the browse index pointing at files that do not exist.

## The generated pages

`tools/josaa-pages.mjs` writes:

- `colleges/<institute-slug>.html` — one per institute, with a cutoff table per seat type
  (OPEN first, then EWS, OBC-NCL, SC, ST). Gender-neutral pool only; female-only seats are
  a separate pool and are handled in the predictor rather than doubling every page.
- `colleges/branch-<branch-slug>.html` — one per branch offered by at least
  `MIN_INSTITUTES_FOR_BRANCH_PAGE` (8) institutes. The threshold exists to avoid publishing
  thin pages that rank for nothing.
- `sitemap-colleges.xml` — listed as a second `Sitemap:` line in `robots.txt`.

These are committed to git like the dataset. The tables are written into the HTML rather
than fetched by script: these pages exist to be indexed, and a client-rendered table
indexes as an empty page.

## Correctness rules that must not be broken

1. **IIT rows are JEE Advanced ranks. Everything else is JEE Main.** Different exams,
   different scales. Never compare one to the other.
2. **Reserved seat types use category ranks, not CRL.** An OBC-NCL cutoff is an OBC-NCL
   rank.
3. **Preparatory-course ranks (`1234P`) are discarded**, not parsed as `1234`.
4. **Opening rank ≤ closing rank.** The validator treats an inversion as a parsing error,
   because it almost always means the columns were read in the wrong order.

## Attribution

Source: JoSAA Opening & Closing Rank archive, Government of India, reused under
GODL-India. The attribution line at the foot of `college-predictor.html` is required —
do not remove it.

## Refresh cadence

Re-run after JoSAA publishes its final round, typically late July or August. The
validator warns if the newest year in the dataset is stale once counselling season has
started.
