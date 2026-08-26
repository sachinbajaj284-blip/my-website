# The report drafting agent

How a saved assessment profile becomes a Full Clarity Report a counsellor
has signed.

---

## The short version

- The agent drafts **only the personalised prose**. Names, definitions,
  scores and maxima come from `_lib/reportTables.js` and the saved profile.
- **The model has no numeric slot anywhere in its output schema**, so it
  cannot contradict a client's scores — not "we validate that it didn't",
  but "there is nowhere for it to write one".
- A draft is **not a deliverable**. It sits at `status: "draft"` until a
  counsellor signs it at `/counsellor-review.html`.
- Signing records **what the counsellor changed, field by field**. That diff
  is the eval set; without it you are tuning a prompt on impressions.
- Roughly **₹9–14 of tokens** per report, against a ₹999 report.

---

## Why it is shaped this way

The ₹999 report was a counsellor typing prose into `report-template.html` by
hand, an hour at a time. That caps how many can be sold, and it is the reason
the price cannot move: at ₹1,999 the counsellor hour is the same hour.

So the agent's job is narrow on purpose. It does not design the report, score
it, lay it out or deliver it — all of that existed already. It writes the
paragraphs that have to be different for every client, and a person checks
them.

---

## What the model writes, and what it does not

`report-template.html` renders about forty fields. The agent is responsible
for eleven kinds of them:

| Written by the agent | Comes from us |
|---|---|
| `riasec[].meaning` | `riasec[].name`, `.tag` |
| `riasec[].realLife[]` (exactly two) | `anchors[].name`, `.short`, `.desc` |
| `riasec[].nextStep` | `vark[].name`, `.desc` |
| `anchors[].nextStep` | `personality.name`, `.word` |
| `vark[].nextStep` | every `score` and `max` |
| `personality.desc` | |
| `careerDirections[]` (exactly six) | |

The right-hand column is counsellor-written text already living in
`assessment.html`, extracted into `_lib/reportTables.js`. Paying a model to
rewrite it every time would cost tokens to produce something worse and
inconsistent.

The more important reason is the second one. Because scores and labels are
never in the model's output, **no amount of drift or hallucination can change
what a client's numbers say they are.** There is a test that hands
`buildReportData()` a draft claiming `score: 999, name: "Supergenius"` and
asserts the report still reads 6 out of 7, Investigative.

---

## The call

`api/_lib/reportAgent.js`, `claude-opus-5`:

```js
{
  model: "claude-opus-5",
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  output_config: { effort: "high", format: { type: "json_schema", schema } },
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  cache_control: { type: "ephemeral" },
  system: [ HOUSE_STYLE, EXEMPLAR ],     // stable — cached
  messages: [{ role: "user", content: profileSummary }]
}
```

**Structured outputs, not parsing.** `output_config.format` pins the reply to
the schema, so there is no JSON to fish out of prose and no repair step.

**No `budget_tokens`.** It returns a 400 on this model. Thinking is on by
default; `adaptive` is the explicit form. `effort` goes inside
`output_config`, not at the top level.

**The cached prefix must not vary.** The house style and exemplar are
identical on every call, which is what makes a draft cost single-digit
rupees. Interpolating a client's name or the date into them would invalidate
the cache on every request and quietly multiply the bill. There is a test
that drafts for two different clients and asserts the `system` blocks are
byte-identical.

**Refusal fallbacks are on.** The report writes about exam pressure and
self-doubt, which is exactly the sort of thing a safety classifier can
decline. Without a fallback a decline is just a stop, and a counsellor is
left with no draft and no explanation.

### The house style prompt

`_lib/reportStyle.js` is the highest-leverage file in this build. It carries
the voice rules — describe tendencies never diagnose, no clinical language,
explain low scores rather than skipping them, no promises, every next step
doable this week for free — and one worked exemplar.

**The exemplar is the weak part.** There is one, lifted from the
counsellor-written sample data in `report-template.html`, so it is genuinely
Lume Live's voice rather than an imitation of it. Two more, written by a
counsellor from real signed reports, would do more for draft quality than any
rewording of the rules above them. That is the single highest-value
contribution a counsellor can make to this system.

---

## Review and signing

`/counsellor-review.html` — internal, `noindex`, gated on the same
`AGENT_ADMIN_TOKEN` as the routes. Token lives in `sessionStorage`, so it
closes with the tab.

The screen shows the client's actual scores down the left, every drafted
field as an editable box on the right, sorted highest score first. Edited
fields highlight as you type and the count at the bottom is the number about
to be recorded. Signing needs a name.

### Why a signature

The credential on this site is M.Sc Clinical Psychology. It has to mean a
person read the words.

### Why the diff

Every edit is a statement about what the agent got wrong. `signReport()`
walks the drafted prose and the released prose together and stores one row
per changed field — `{ field, from, to }`.

That record is what lets you improve the prompt on evidence. If
`riasec.*.nextStep` is rewritten on every single report, the next-step
instruction in `reportStyle.js` is wrong and you can see it. When the diffs
get small and boring, the prompt is working — and only then is it reasonable
to discuss shipping unreviewed.

**A run of zero-edit signatures is worth being suspicious of.** It usually
means somebody is clicking through rather than reading.

---

## Endpoints

All armed by `AGENT_ADMIN_TOKEN` (24+ characters). Unset — the state of every
deploy until somebody sets it — they answer `404`, indistinguishable from an
unrouted path. Separate from `ENTITLEMENT_ADMIN_TOKEN` so revoking one does
not revoke the other.

| Route | Method | Purpose |
|---|---|---|
| `/api/agent/report` | POST | Draft from `run_id`, or `uid` for that account's latest profile. `dry_run: true` returns the assembled prompt without calling the model. |
| `/api/agent/queue` | GET | Drafts waiting, oldest first. Handles only, never prose. |
| `/api/agent/draft` | GET | One report: prose, profile, and the merged `LUME_REPORT_DATA`. |
| `/api/agent/sign` | POST | Release it. Needs `counsellor`; `final_prose` optional. |

`dry_run` exists because the first thing anybody wants to know about a new
prompt is what it actually sends.

The queue returns handles rather than prose deliberately — shipping every
drafted report in one response would make it the single most sensitive
payload on the site, for no benefit to the person reading it.

---

## Firestore

`reports/{runId}` — one document per drafted run, so a profile cannot quietly
acquire two competing reports.

```
runId, uid, status: "draft" | "signed",
draftProse, finalProse, signedBy, signedAt,
edits: { changedFields, changes: [{ field, from, to }] },
model, usage, draftedAt, updatedAt
```

`releasedProse()` returns `null` for anything unsigned. Any client-facing
path must go through it — reading `draftProse` directly would hand over words
nobody approved.

Redrafting overwrites an unsigned draft freely (drafting is cheap, and a
stale draft nobody signed is worth nothing) but refuses to overwrite a signed
one, which is a document a client may already be holding.

Deny browser access in your rules, same as `entitlements` and `assessments`:

```
match /reports/{runId} {
  allow read, write: if false;
}
```

---

## What it costs

List prices are $5/M input and $25/M output for `claude-opus-5`, with cached
reads at roughly a tenth of the input rate. At ₹90 to the dollar, a report is
**about ₹9–14**: the house style and exemplar are cached, the per-client
message is small, and the output is 3–4K tokens of prose.

Against a ₹999 report — ₹1,999 after repricing — that is under 1.5% of
revenue. The real number to watch is not the token cost but **the review
minutes**, which is exactly what the edit diff measures.

`usage` is stored on every report, so the actual figure is in the data rather
than in this paragraph. Check it before trusting the estimate.

---

## What a deploy needs

```
ANTHROPIC_API_KEY     the API key
AGENT_ADMIN_TOKEN     a long random secret, 24+ characters
```

Plus the Firebase credentials Phase 0 already needs. With `AGENT_ADMIN_TOKEN`
unset the routes 404 and nothing else on the site changes.

`@anthropic-ai/sdk` is the second dependency this project has. Keep it that
way.

---

## Tests

`npm run report:test` — 34 assertions, no API calls. `draftReport()` takes an
injectable `createMessage` for exactly this reason, so the drafting rules run
without an API key, a network, or a rupee of spend.

The five worth knowing:

- **The output schema contains no numeric field**, walked recursively.
- **A tampered draft cannot change a score**, name or maximum.
- **The cached system blocks are identical across two different clients.**
- **A low-scoring interest cannot be silently skipped** — an omitted key
  fails validation rather than producing a report with a hole in it.
- **An unsigned draft is never releasable**, and a signed report cannot be
  redrafted over.

---

## Known gaps

**One exemplar, not three.** Named above. A counsellor writing two more from
real signed reports is the highest-value next change to this system.

**No delivery path yet.** Signing marks a report released; actually putting
it in front of the client who paid — entitlement check, rendered page, PDF —
is not built. `releasedProse()` is the function that path must call.

**No cohort mode.** Phase 2 in `docs/ai-agent-spec.md` is this agent run
through the Batch API at half price. The drafting call is already shaped for
it; what is missing is the batch submission and the principal-facing summary.
