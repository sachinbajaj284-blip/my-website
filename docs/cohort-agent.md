# Drafting a whole school

Phase 1's report agent, run three hundred at a time through the Batch API,
plus one summary for the principal.

---

## The short version

- A **cohort** is a code a school hands to a year group. Students type it (or
  follow a link) when they take the assessment; the run is tagged with it.
- Drafting runs through the **Batch API at 50%** of the per-token price. A
  school of 300 costs roughly **₹1,800 in tokens**.
- **Batch results come back in arbitrary order.** Everything here keys on
  `custom_id`. Never on position. This is the one bug that would ruin a
  school pilot silently.
- The principal gets **counts**. The school's counsellor gets **names**, from
  a different endpoint, and the two never travel together.
- A batch signs nothing. Three hundred drafts still go through the same
  counsellor review queue as one.

---

## The lifecycle

Four steps, because a batch takes between minutes and a day. Anything
pretending to be synchronous would be a request that times out and leaves a
school half-drafted with no record of where it got to.

```
create   →  mint a code, hand it to the school
submit   →  every saved profile with that code goes to the Batch API
collect  →  read the finished batch, write per-student drafts
summarise → compute the statistics, write the principal's document
```

All four are `POST /api/agent/cohort` with an `action`, armed by
`AGENT_ADMIN_TOKEN`.

```bash
curl -X POST .../api/agent/cohort -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
  -d '{"action":"create","school":"DAV Public School","label":"Class 11 Science"}'
# → { "code": "DAVPUBLIC-CLASS11SC-K7M4XQ" }

curl -X POST .../api/agent/cohort -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
  -d '{"action":"submit","code":"DAVPUBLIC-CLASS11SC-K7M4XQ"}'
# → 202 { "batch_id": "msgbatch_...", "students": 34 }

curl -X POST .../api/agent/cohort -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
  -d '{"action":"collect","code":"DAVPUBLIC-CLASS11SC-K7M4XQ"}'
# → { "ready": false, "processing_status": "in_progress" }   …or…
# → { "ready": true, "drafted": 34, "failed": 0 }

curl -X POST .../api/agent/cohort -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
  -d '{"action":"summarise","code":"DAVPUBLIC-CLASS11SC-K7M4XQ"}'
```

`submit` and `summarise` both take `dry_run: true` — the first returns the
`custom_id` list without spending anything, the second returns the computed
statistics without calling the model.

---

## The bug this is built around

**Batch results come back in arbitrary order.** Zipping them against the
request array by position is the obvious implementation, and here it sends
student A's report to student B, three hundred times, and every single report
looks plausible. Nobody notices until a parent does.

`collectResults()` therefore:

- keys strictly on `custom_id` (which is the `runId`),
- treats a `custom_id` it did not submit as a **failure**, not a skip — it
  means the batch and the roster have diverged and somebody must look,
- treats a second row for the same `custom_id` as a failure rather than
  letting it overwrite,
- reports a submitted run that came back with **no row at all**.

Two tests cover it directly: results fed in reverse, and a deterministic
shuffle of thirty, both asserting every student receives their own prose.

**The roster is recorded at submission**, not re-derived at collection. A
student who takes the assessment while the batch is running is not a missing
result; they are simply in the next batch.

A batch is not a reason to lower the completeness bar — it is three hundred
reasons not to. Every result goes through the same `validateDraft()` a single
report does.

---

## Who sees what

This is the part to get right, and it is a duty question rather than an
engineering one.

**A named list of students handed to a head teacher is a different product
from a distribution chart.** `buildCohortStats()` returns two halves and they
stay separate all the way to the page.

| | Route | Carries |
|---|---|---|
| Principal | `POST /api/agent/cohort` (`summarise`) | Counts, distributions, averages. **Never a uid.** |
| School counsellor | `GET /api/agent/cohort-attention?code=…` | The handful of students worth a conversation, by uid. |

`principalView()` is the chokepoint any principal-facing path must call. One
obvious chokepoint beats remembering not to spread the whole stats object into
a response.

The cohort document itself stores only the principal's half, so a `cohorts`
record is never a roster of flagged teenagers sitting in a collection. The
named lists are recomputed on demand for whoever is allowed to see them.

There is a test that asserts every fixture uid is absent from the principal
view, from the summary prompt, and from the stored cohort document.

### The three lists, and why none of them are clinical

| List | Means |
|---|---|
| `worthATalk` | Strongest interests point away from the stream they are already in. |
| `noClearSignal` | No interest stands out — the assessment did not narrow anything down. |
| `checkResponses` | Answered near-identically throughout. A data-quality note. |

**There is no wellbeing list and there must not be one.** Phase 0 deliberately
does not store the wellbeing screener. When it does, a list of distressed
minors is not something an HTTP endpoint hands over on a bearer token.

Every reason string has to pass one test: **it could be read aloud to the
student without causing harm.** There is a test asserting the words "risk",
"concern", "problem", "poor", "weak", "wrong" and "fail" appear nowhere in
them. A flat profile is not a deficiency — those students are the ones who
most need a conversation, and that is how it is phrased.

---

## What the statistics actually say

`_lib/cohortStats.js` is pure arithmetic — no model, no Firestore. The model
is handed finished numbers and asked to write them up; it is never asked to
count. A principal reading "two in five lead with Investigative interests" is
reading arithmetic.

The principal's half:

- students assessed, and the year-group mix
- leading interest, and the most common three-letter codes
- leading work value, preferred learning channel
- average personality trait scores
- **profile clarity** — how many have a clear peak, how many do not
- **stream attention** — of the students whose stream was stated and whose
  profile had a peak, how many have interests pointing elsewhere
- **data quality** — how many answered near-identically

### Two judgement calls worth knowing

**A straight-lined profile does not vote in the distributions.** It has a "top
interest" only because something had to sort first. Letting it count would put
a click-through in the same column as a real answer. It still counts as a
student and as a data-quality note.

**A student with no clear peak is never flagged as stream-mismatched.**
Reading a mismatch off a profile with no signal would be inventing one.

### What is deliberately not computed

**There is no interest-to-subject-combination recommendation.** The stream
selector scores its own axes, which measure different things from RIASEC, and
bridging the two properly is separate work. Faking it would produce exactly
the confident-sounding pseudo-mapping this practice criticises DMIT for. The
stream signal here runs in one direction only — noticing a distance between
interests and an *existing* enrolment — and never suggests a stream to anyone.

---

## The cohort code

`newCohortCode()` produces e.g. `DAVPUBLIC-CLASS11SC-K7M4XQ`.

A student types it, so it cannot be a secret. But a guessable code means a
stranger can file themselves into a school's roster and skew its averages, or
appear on a counsellor's list — so six random characters are appended, and
`/api/agent/cohort` refuses to run for a code with no cohort record.

The random tail uses an alphabet with no `O`/`0`, `I`/`1` or `S`/`5`. A
teacher reads this out to a room of thirty.

A school can share `assessment.html?group=CODE` instead of dictating it. The
field stays visible and editable either way — **a code applied invisibly from
a URL is not something a student agreed to.**

One run per account per cohort: a student who re-takes the assessment counts
once, as their most recent profile, rather than twice with the earlier one
dragging the averages around.

---

## Firestore

`cohorts/{code}`:

```
code, school, label, createdBy,
status: "open" | "submitted" | "drafted" | "summarised" | "failed",
batchId, submittedAt, runIds[], drafted, failures[],
summary, stats,          ← principal's half only
createdAt, updatedAt
```

Deny browser access, same as the others:

```
match /cohorts/{code} {
  allow read, write: if false;
}
```

---

## What it costs

Batch is 50% of standard token pricing, and the cached prefix from Phase 1
still applies — the two discounts are separate and this gets both. There is a
test asserting the `system` blocks are identical across batch requests, since
a per-student prefix would throw the cache discount away at exactly the scale
where it matters most.

At ₹90 to the dollar, roughly **₹5–7 per student**, so **about ₹1,800 for a
school of 300**, plus a rupee or two for the summary.

Against one school contract, that is noise. The number that actually matters
is still counsellor review minutes — 300 drafts is 300 reviews, and that is
the real constraint on how many schools can be served. Watch the edit-diff
data from Phase 1 before promising a second school the same week.

---

## Tests

`npm run cohort:test` — 27 assertions, no API calls.

The five worth knowing:

- **Results fed in reverse order still reach the right student**, and again
  with a shuffled batch of thirty.
- **An unknown `custom_id` is a failure**, not a silent skip.
- **The principal's view contains no uid**, checked against every fixture.
- **A summary that names a student is discarded**, not published.
- **The reason strings avoid judgement words** entirely.

One note on the fixtures: the uids are realistic Firebase-shaped strings, not
readable labels. An earlier version used the uid `"flat"`, which collides with
the legitimate `profileClarity.flat` key and made the leak test pass for the
wrong reason. A substring check is only as good as the strings it is given.

---

## Known gaps

**No cohort UI.** Everything is curl. A school-facing screen — create, watch
the batch, read the summary — is the obvious next thing, and the review queue
at `/counsellor-review.html` already handles the 300 drafts that come out.

**No PDF or delivery.** Same gap as Phase 1: signing marks a report released,
but putting it in front of a student or emailing a principal a document is not
built.

**Collection is manual.** Somebody has to call `collect` after the batch ends.
A scheduled poll would be a small addition, and Vercel cron is the obvious
place for it.
