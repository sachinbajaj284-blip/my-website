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

---

## How the ingest talks to the form

This is the part that was wrong for a long time, so it is worth writing down.

The archive page is ASP.NET WebForms with **cascading dropdowns**. The 13 August 2026
dump settled its shape:

```
ctl00$ContentPlaceHolder1$ddlYear        11 options   ← the only one that arrives filled
ctl00$ContentPlaceHolder1$ddlroundno      0 options
ctl00$ContentPlaceHolder1$ddlInstype      0 options
ctl00$ContentPlaceHolder1$ddlInstitute    0 options
ctl00$ContentPlaceHolder1$ddlBranch       0 options
ctl00$ContentPlaceHolder1$ddlSeatType     0 options

submit control: ctl00$ContentPlaceHolder1$btnSubmit  value=Submit
```

Each control is filled by the postback that follows the choice above it, and the grid is
built by the **button's click handler**.

The original ingest sent a single POST that set every field at once, carried the initial
GET's `__VIEWSTATE`, left `__EVENTTARGET` empty, and never posted the button. ASP.NET
answered the only way it could: it rendered the page, never ran the handler, and returned
an identical 11,950-byte *"Not Available"* body for every filter combination. Twelve
identical pages read downstream as twelve failed parses, which is why the pipeline
reported "no result rows parsed" and nobody could see why.

`FormSession` now holds a conversation instead:

1. `GET` the form.
2. Postback selecting the **year**, with `__EVENTTARGET` naming `ddlYear`.
3. Postback selecting the **round** — default the last option, which is the final round.
4. Postback selecting the **institute type**.
5. Postback selecting **All** for institute, branch and seat type where offered.
6. Postback pressing **btnSubmit**, which is the step that builds the grid.

Three rules make that work, each with a test:

- **Every request carries the hidden state from the last response**, not the first.
  `__VIEWSTATE` and `__EVENTVALIDATION` are per-response, and a stale `__EVENTVALIDATION`
  is what rejects a value the server did not itself render.
- **Every request echoes back every control on the form**, at whatever it is currently
  set to. That is what a browser submits.
- **A cascade step sets `__EVENTTARGET`; the query posts the button and leaves it empty.**

A fresh form is fetched per year/institute-type combination, because the query response
carries no `<select>` at all — there is nothing left to drive a second query from.

### Two silent failures that are now loud

**A missing option stops the pull.** `chooseOption()` used to fall back to
`options[options.length - 1]`, so asking for a year that was not on offer silently
recorded some other year's ranks under it. It now throws and names what it was looking
for.

**A selected value is read from the whole option tag.** `selected` sits on either side of
`value=` depending on who generated the markup. Reading only one side made a selected
year read as the `--Select--` placeholder, which would post `0` and get nothing back.

---

## When the network is the problem

On 26 August 2026 one run fetched the page fine and the next timed out completely, four
minutes apart, from the same runner. JoSAA is intermittently unreachable from GitHub's IP
ranges.

The workflow now tries three times before believing a failure, and asks **Node** whether
it can reach the host rather than inferring it from `curl` — the two do not trust the same
things, and a run has already failed in exactly that gap. When they disagree it prints the
certificate chain.

The ingest reports the real cause too: undici puts every transport failure on `err.cause`
and reports `err.message` as the useless string `"fetch failed"`, so `request()` walks the
chain, and names a TLS trust failure explicitly when it sees one. It also asks for IPv4
first, because several `nic.in` hosts publish an AAAA record that accepts a connection and
then never answers.

### Why the ingest is on `node:https` and not `fetch`

That diagnostic immediately earned its keep. Run #11 reported, five times:

```
UND_ERR_CONNECT_TIMEOUT Connect Timeout Error
  (attempted address: josaa.admissions.nic.in:443, timeout: 10000ms)
```

**10 seconds is not a number this file set.** `REQUEST_TIMEOUT_MS` is 60 s, applied with
an `AbortSignal` — but undici, which is what global `fetch` is, applies its *own* connect
timeout of 10 s and reaches it long before any signal budget matters. The signal never
governed the phase that was failing.

That is almost certainly the whole curl-works-but-Node-does-not story: in run #11 curl
fetched the page with `-m 30` at 14:12:14, and Node gave up at 10 s six seconds later.
JoSAA is simply slow to complete a handshake.

undici's connect timeout is reachable only through a custom `Agent`, and adding `undici`
as a dependency would break a workflow that deliberately installs nothing. So `request()`
uses `node:https` and sets both timeouts itself — `CONNECT_TIMEOUT_MS` (30 s) for the
handshake, `REQUEST_TIMEOUT_MS` (60 s) for the whole exchange. Redirects, cookies and the
delta header all still work the same way; `Accept-Encoding` is pinned to `identity` so
there is no compressed body to inflate.

**If three attempts fail, that is not a bug in this pipeline.** Re-run later, or use
option B from a machine in India.

---

## Where this stands (26 August 2026)

Run #7 on the branch reached JoSAA and dumped a full cascade attempt. Two things were
settled and one is still open.

**Settled: the cascade is the right shape.** The new onchange diagnostic shows each
dropdown wired for AutoPostBack:

```
ddlroundno   -> javascript:setTimeout('__doPostBack('...$ddlroundno','')', 0)
ddlInstype   -> javascript:setTimeout('__doPostBack('...$ddlInstype','')', 0)
ddlInstitute -> ...
ddlBranch    -> ...
```

An earlier dump reported `__doPostBack targets: ctl00$BtnCscLogin` and nothing else,
which is what led to the idea that the dropdowns might be filled by client-side AJAX.
They are not — the old regex simply did not match a `__doPostBack` wrapped in
`setTimeout`. There are also no candidate JSON endpoints in the page, so postback is the
only mechanism on offer.

**Still open: the server rejects even a correctly-shaped postback.** The first cascade
step — `__EVENTTARGET=ddlYear`, the served page's own `__VIEWSTATE` and
`__EVENTVALIDATION`, every control echoed — comes back as the same 11,950-byte
*"Not Available"* page with the entire form stripped out. So the request is not
malformed; it is missing something the browser sends and we do not.

Two candidates, and the **Inspect the postback contract** step in the workflow
distinguishes them:

1. **`ctl00$hdnSecKey`.** The form ships this hidden field empty and loads
   `Scripts/Common.js`. That is the shape of an anti-automation token written by script
   before any postback. If `Common.js` computes it, the ingest has to as well.
2. **An UpdatePanel.** The page pulls two `WebResource.axd` bundles. If the dropdowns
   sit inside an `UpdatePanel`, a browser posts `__ASYNCPOST=true` with a
   `ScriptManager` target and receives a pipe-delimited delta rather than HTML — and a
   full postback is refused in exactly this way.

Read that step's output on the most recent run before writing any more code. If it is
(1), the fix is to reproduce whatever `Common.js` puts in the field. If it is (2), the
fix is to post the ScriptManager fields and parse the delta instead of the page.

Everything upstream of that — discovery, the cascade, the button, the parser — is done
and tested offline against a fixture built from the real dump.

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
