# The Lume Live agent — build spec

What to build, in what order, and why each piece exists. Three agents share
one engine: a **report writer** that drafts the paid deliverable, a **cohort
runner** that does the same thing 300 at a time for a school, and a
**conversational agent** on WhatsApp that answers from a student's own scores
and can act on their account.

---

## The short version

- **Nothing here works until assessment results are saved.** Today they live
  in `localStorage` and are destroyed when the tab closes. Phase 0 is not an
  AI feature and has to ship first.
- The **Report Agent** drafts the prose fields of `LUME_REPORT_DATA` from a
  student's scores. A counsellor edits and signs. Token cost is roughly **₹9–14
  against a ₹999 report** — the point is decoupling price from counsellor hours.
- The **Cohort Agent** is the same call in a batch, at half the token price.
  One school of 300 costs about **₹1,800 in tokens** and produces the artefact
  that wins the meeting.
- The **conversational agent** lives on WhatsApp, not the website, because
  that is where every conversation on this business already happens.
- It is grounded on three things only: **the student's own scores**, **our
  career corpus**, and **JoSAA cutoffs**. Anything it could answer without
  those is something ChatGPT already answers, and is not a reason to build.
- Every inbound message passes a **distress screen** before the agent composes
  a reply. That gate is the one place the agent has no autonomy.

---

## Phase 0 — save the assessment

### The problem

`assessment.html` runs an IPIP-50 Big Five, a RIASEC inventory, eight work
anchors, VARK, and a wellbeing screener. All of it is written to
`localStorage` under `lume-live-assessment-progress` and never leaves the
browser. Firestore holds `coupons`, `entitlements`, `couponRedemptions`,
`rateLimits` and account records. It holds **no assessment results at all**.

So: the richest data this business collects is thrown away at the browser,
and every agent below has nothing to be personal about.

### The fix

A new endpoint and a new collection. The scoring stays exactly where it is —
client-side, unchanged — and the *result* is posted.

```
POST /api/assessment/save
Authorization: Bearer <Firebase ID token>
```

```json
{
  "instrument": "student-full-v1",
  "consent": true,
  "scores": {
    "riasec":      { "R": 3, "I": 6, "A": 4, "S": 5, "E": 2, "C": 2, "max": 7 },
    "anchors":     { "SV": 36, "CH": 31, "MA": 28, "AU": 21, "IN": 19, "WF": 17, "ST": 14, "EN": 11, "max": 42 },
    "vark":        { "V": 8, "A": 3, "R": 10, "K": 5, "max": 16 },
    "bigfive":     { "O": 34, "C": 29, "E": 22, "A": 31, "N": 18, "max": 40 },
    "wellbeing":   { "band": "moderate", "flagged": false }
  },
  "context": { "stage": "Class 12 Science", "age": 17, "city": "Rohtak", "concern": "..." }
}
```

Written to `assessments/{uid}/runs/{runId}`. Scores only — **not item-level
answers**. A ranked interest profile is what every downstream product needs;
the raw "I insult people: 2" rows add nothing and make a breach materially
worse.

Reuse the existing plumbing: `_lib/http.js` for CORS and the body cap,
`_lib/account.js`'s `requireAccount()` for the token, `_lib/rateLimit.js`
keyed `assessment:` for abuse. Same shape as every other endpoint in `api/`.

### The consent question

This is a real decision and it is not an engineering one. Storing minors'
psychometric and wellbeing-screener data server-side is a different act from
computing it in their browser and forgetting it.

The build assumes: **an explicit, un-prechecked consent control before the
result is saved**, a stated retention period in `privacy-policy.html`, a
delete path, and the wellbeing screener stored as a band rather than item
responses. If the answer to consent is no, **stop here** — Phases 1–3 have no
data to run on and the honest recommendation becomes "don't build an agent
yet."

### The bonus

Saving the result also gives you the thing the August traffic audit said you
were burning daily: a known audience of assessment-takers to retarget. That
is worth the phase on its own, before any AI is involved.

---

## Phase 1 — the Report Agent

### What it does

Takes a saved score document. Produces the prose that `report-template.html`
already knows how to render — and nothing else. It does not design, score,
lay out or deliver the report. Those all exist.

The fields it writes, per the template's `window.LUME_REPORT_DATA`:

| Section | Fields per entry | Entries |
|---|---|---|
| `riasec[]` | `meaning`, `realLife[]`, `nextStep` | 6 |
| `anchors[]` | `desc`, `nextStep` | 8 |
| `vark[]` | `desc`, `nextStep` | 4 |
| `personality` | `desc` | 1 |
| `careerDirections[]` | — (derived from top RIASEC, six strings) | 1 |

Note the sample data in the template leaves the low-scoring entries blank.
The agent fills all of them — a report that goes quiet on your bottom three
interests reads as unfinished, and explaining a low score is often the more
useful paragraph.

### The call

Anthropic TypeScript/JS SDK, `claude-opus-5`. Structured outputs so the model
returns exactly the template's shape and nothing needs parsing:

```js
const response = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  output_config: {
    effort: "high",
    format: { type: "json_schema", schema: REPORT_SCHEMA }
  },
  cache_control: { type: "ephemeral" },
  system: [
    { type: "text", text: HOUSE_STYLE },        // stable — cached
    { type: "text", text: EXEMPLAR_REPORTS }    // stable — cached
  ],
  messages: [{ role: "user", content: JSON.stringify(scoreDoc) }]
});
```

Notes that matter:

- **`thinking: {type:"adaptive"}`** — on Opus 5 thinking is on by default and
  this is the explicit form. Do **not** send `budget_tokens`; it returns a 400
  on this model.
- **`effort` goes inside `output_config`**, not at the top level.
- **Cache the style guide and exemplars.** They are identical on every
  request and they are the bulk of the input. Verify it is working by
  checking `usage.cache_read_input_tokens` is non-zero on the second call —
  if it is zero, something volatile has crept into the prefix.
- **Enable refusal fallbacks.** This agent writes about exam stress and
  self-doubt; a safety classifier declining mid-report would otherwise just
  stop. Add `betas: ["server-side-fallback-2026-07-01"]` and
  `fallbacks: "default"`.

### The house style prompt

The single highest-leverage file in this build. It should carry, at minimum:

- **Strengths-based, never diagnostic.** "You tend to be energised by…" not
  "You are an introvert." We publish `is-dmit-test-scientific.html` calling
  out pseudo-scientific certainty; an AI asserting personality facts is the
  same failure wearing our logo.
- **Indian context by default** — CUET, JEE, NEET, CLAT, state boards, the
  actual entrance calendar, rupee salary bands from `career-intelligence.html`.
- **Address the student, expect the parent to read it.** Both are in the room.
- **Every `nextStep` is doable this week, without money.** The sample data
  gets this right; hold the line ("explain one difficult topic to a classmate
  this week", not "consider job shadowing opportunities").
- **Never promise an outcome.** No "you will excel at", no salary guarantees,
  no ranking of careers by prestige.
- **Two or three full exemplar reports** written by an actual counsellor.
  These do more for output quality than any amount of instruction prose.

### The review queue

The draft is not the deliverable. It lands in `reports/{uid}/{runId}` with
`status: "draft"`, and a counsellor opens it in an editor that renders
`report-template.html` live, edits any field, and presses Sign. Signing sets
`status: "signed"`, stamps the counsellor's name, and only then is the report
released to the account.

Two reasons this is not optional. The credential on the site is M.Sc Clinical
Psychology and it has to mean a person read it. And the review queue is the
only place you will ever see what the agent gets wrong — the edits are your
eval set. Log the diff between draft and signed. When those diffs get small
and boring, you have earned the right to discuss shipping unreviewed.

---

## Phase 2 — the Cohort Agent

Same call, run through the **Batch API** at 50% of the per-token price, plus
one extra call that reads all the individual results and writes a
principal-facing summary.

```js
const batch = await client.messages.batches.create({
  requests: students.map(s => ({
    custom_id: s.uid,
    params: { model: "claude-opus-5", max_tokens: 16000, /* …as Phase 1… */ }
  }))
});
// poll batches.retrieve(id).processing_status until "ended", then stream results
```

**Results come back in arbitrary order — key by `custom_id`, never by
position.** Getting this wrong sends student A's report to student B, in a
school, in a batch of 300. Assert on it in the test.

The cohort summary is the sales artefact:

- Distribution of subject-combination fit across the class
- Interest clusters — how many Investigative-dominant, how many Artistic
- The gap between what students are interested in and what they've enrolled in
- Wellbeing bands aggregated, with **no names**, and a private count of
  students the school counsellor should see first

Handle that last one carefully. A named list of at-risk minors handed to a
principal is a different product with different duties. Aggregate in the
principal's copy; route names to the school counsellor only, and only where
the school has one.

---

## Phase 3 — the conversational agent

### Where it lives

**WhatsApp.** `index.html` alone carries 48 links to `wa.me/917015671280`.
Every enquiry form on the site already builds a WhatsApp message —
`api/submit.js` exists specifically because people compose those messages and
never press send. The conversation is already there; a website chat bubble
would be a concierge in an empty shop.

Website widget later, once the JoSAA pipeline is fixed and there is traffic
to talk to.

### What it is grounded on

Three sources, and the test for adding a fourth is: *could ChatGPT answer this
without it?* If yes, it is not grounding, it is padding.

1. **The student's own saved scores** (Phase 0). The only genuinely
   unmatched input.
2. **The career corpus** — `career-intelligence.html` is 95+ careers and 50+
   government jobs with salary bands and entrance exams; plus the career
   guides, exam-fit pages and methodology pages. Retrieved, not stuffed.
3. **JoSAA cutoffs** — once `discoverFields()` is fixed and the ingest
   actually runs. Until then the college-predictor tool returns "not yet
   published" and the agent says so plainly.

### What it can do

Tools, not just talk. Every one of these endpoints already exists:

| Tool | Backing | Notes |
|---|---|---|
| `get_my_scores` | `assessments/{uid}` | Read-only. The reason the agent is worth using. |
| `lookup_career` | career corpus | Salary bands, entrance exams, our own pages. |
| `predict_colleges` | JoSAA dataset | Rank + category + round → realistic institutes. |
| `check_entitlements` | `_lib/entitlements.js` | "Where's my report?" answered without a human. |
| `validate_coupon` | `/api/coupons/validate` | Agent never quotes a price; it fetches one. |
| `create_checkout` | `/api/cashfree/create-order` | Returns a link. Sends a `sku`, never an amount. |
| `get_booking_link` | booking calendar | Real availability. |
| `capture_lead` | `/api/lead` | The midnight visitor who vanishes is still on the list. |
| `handoff_to_human` | `_lib/notify.js` | Full transcript to the counsellor. |

Define these with raw JSON schemas and **`strict: true`** (a top-level field
on the tool definition, alongside `name`/`description`/`input_schema`, with
`additionalProperties: false` and `required` set). Drive them with a **manual
tool loop** rather than the SDK's Tool Runner — this codebase hand-rolls its
plumbing on purpose, has one dependency, and the money-touching tools want an
explicit approval gate you can read in one file.

Two hard rules on the money tools:

- **`create_checkout` sends a `sku`. Never an amount.** `_lib/catalog.js` is
  the one place a price lives and that does not change because the caller is
  a model. The comment at the top of that file is about a browser; it applies
  identically here.
- **`check_entitlements` and `create_checkout` require the account token.**
  The agent inherits the caller's identity; it does not have its own. This is
  the hole `restore-access.js` deliberately closed — knowing a phone number
  must not unlock anyone's paid content, and an agent is not an exception.

### Language

Hindi and Hinglish, first-class. There is already `index-hi.html` and
`stream-selector-hi.html`. Most parents will type Hinglish and every rigid
form-driven competitor handles it badly. Do not translate — answer in the
language and register the message arrived in.

---

## The safety gate

The one place the agent has no autonomy.

Every inbound message runs a **classification call before the agent composes
anything**. Not a keyword filter — a model call, because "I don't see the
point of any of this anymore" contains no keyword worth matching.

```js
const screen = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 256,
  output_config: { effort: "low", format: { type: "json_schema", schema: SCREEN_SCHEMA } },
  system: SCREEN_RUBRIC,   // stable — cached
  messages: [{ role: "user", content: inboundMessage }]
});
// → { risk: "none" | "concern" | "acute", reason: string }
```

- **`none`** → the agent proceeds normally.
- **`concern`** → the agent proceeds, warmly, but is instructed to offer a
  session with a human and not to problem-solve the distress itself. Flagged
  for review.
- **`acute`** → **the agent does not compose a reply at all.** A fixed,
  human-written message goes out with crisis resources (Tele-MANAS 14416,
  KIRAN 1800-599-0019). `notifyOwner()` pages a human immediately. The
  conversation is locked to human-only until someone clears it.

Tune the rubric to **over-escalate**. A false positive costs a counsellor
thirty seconds of reading. A false negative is the thing this entire gate
exists to prevent. If p95 latency on the screen becomes a problem, `claude-haiku-4-5`
is the swap — it costs roughly a rupee less per conversation and the gate
still works, but start on Opus 5 and only move if the numbers force it.

**Why this carve-out and no other.** The site publishes
`student-mental-health-india.html`, `how-to-deal-with-exam-anxiety.html`,
`board-exam-stress-guide.html`, and ships a clinical screener in
`lume-wellbeing-check.js`. During results week the agent *will* meet a student
in crisis. Everything else — streams, exams, colleges, cutoffs, fees,
logistics, interpreting one's own scores — runs unsupervised, as intended.

---

## Endpoints

All CommonJS under `api/`, matching the existing style: `_lib/http.js` for
`json`/`setCors`/`readBody`, `_lib/account.js` for `requireAccount`,
`_lib/rateLimit.js` for throttling, `_lib/firebaseAdmin.js` for `db()`.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/assessment/save` | POST | account | Persist a scored run. Phase 0. |
| `/api/assessment/latest` | GET | account | Read back the newest run. |
| `/api/agent/report` | POST | admin token | Draft a report for one uid. |
| `/api/agent/cohort` | POST | admin token | Submit a batch for a school. |
| `/api/agent/chat` | POST | account or WhatsApp signature | One conversational turn. |
| `/api/agent/webhook` | POST | provider signature | WhatsApp inbound. |

Gate the two back-office routes with the existing pattern:
`ENTITLEMENT_ADMIN_TOKEN` is precedent — closed by default, useless until an
environment variable is set. Use a separate `AGENT_ADMIN_TOKEN` so revoking
one does not revoke the other.

`/api/agent/chat` gets its own rate-limit budget, keyed per account rather
than per IP — a WhatsApp conversation arrives from the provider's IP, so
`clientKey(req)` alone would rate-limit every user as one.

---

## Firestore collections

| Collection | Key | Holds |
|---|---|---|
| `assessments/{uid}/runs/{runId}` | uid + run | Scores, instrument version, consent flag, timestamp |
| `reports/{uid}/{runId}` | uid + run | Draft prose, status, counsellor, signed-at, draft/signed diff |
| `conversations/{threadId}` | thread | Transcript, risk flags, human-lock state, token spend |
| `agentBudgets/{uid}` | uid | Daily message and token counters |

`conversations` is not optional. It is the audit trail for anything the agent
said, the queue a human picks up on handoff, and the evidence if a school
ever asks what the agent tells their students.

---

## Environment variables

```
ANTHROPIC_API_KEY          the API key
AGENT_ADMIN_TOKEN          arms /api/agent/report and /api/agent/cohort; closed by default
AGENT_DAILY_MESSAGE_CAP    per-account message ceiling (default 40)
WHATSAPP_VERIFY_TOKEN      webhook signature verification
WHATSAPP_ACCESS_TOKEN      send API
```

`npm i @anthropic-ai/sdk` — the second dependency this project will have.
Keep it that way.

---

## Cost model

Anthropic list prices: Opus 5 at $5/M input, $25/M output; batch at 50%;
cached input reads at roughly a tenth of the input rate. Rupee figures assume
**₹90 to the dollar** — recompute if that has moved.

| Job | Tokens | Cost | Against |
|---|---|---|---|
| One report | ~14K in (mostly cached), ~3.5K out | **₹9–14** | a ₹999 report, ₹1,999 repriced |
| School of 300, batched | as above × 300, at 50% | **~₹1,800** | one school contract |
| One conversation, 10 turns | ~20K cached prefix + history, ~4K out | **₹15–25** | a ₹249 first session |
| Distress screen | ~600 in cached, ~20 out, per message | **~₹1.50/conversation** | not optional |

These are token costs only and the conversation figure is the soft one — it
moves with how long people actually talk. Two things follow:

- **Measure before you commit.** `client.messages.countTokens()` on a real
  transcript beats any estimate in this document.
- **Cap it per account.** `agentBudgets/{uid}`, a daily message ceiling, and
  a hard stop that hands off to a human rather than refusing. An autonomous
  agent on a public WhatsApp number without a per-user cap is an open invoice.

The report number is the one that matters, and it is the whole argument for
Phase 1: **₹12 of tokens and ten minutes of review, against an hour of a
clinical psychologist's writing time.** That is what makes ₹1,999 defensible
and ₹249 unnecessary.

---

## Tests

Follow the existing convention — plain Node scripts under `tools/`, stubs
instead of live services, wired into `npm test`:

```
tools/agent.test.mjs          schema conformance, prompt assembly, cost guard
tools/agent-safety.test.mjs   the distress rubric against a fixture corpus
tools/agent-tools.test.mjs    tool loop: sku-not-amount, auth required, batch keying
```

`tools/firestore-stub.mjs` already exists and should back all three. Add an
Anthropic stub alongside it — no test should make a paid API call.

The three assertions worth writing first:

1. **`create_checkout` refuses a request carrying an amount.** Prices come
   from `_lib/catalog.js` or the call fails.
2. **Batch results are matched by `custom_id`.** Feed the stub results in
   shuffled order and assert every report lands on the right student.
3. **An `acute` classification never reaches the composing model.** Assert on
   the call *not* being made, not just on the output text.

The safety fixture corpus should be written by a counsellor, not by an
engineer and not by a model.

---

## Sequence

| | Ships | Why here |
|---|---|---|
| **0** | Assessment persistence + consent | Everything below is blocked on it. Also hands you a retargeting audience on its own. |
| **1** | Report Agent + review queue | Highest value, lowest risk, no student ever talks to it. Decouples price from counsellor hours. |
| **2** | Cohort Agent | Phase 1 in a batch. Build it when there is a school meeting in the calendar, not before. |
| **3** | WhatsApp agent + safety gate | Needs 0 to be personal, 1 to have something to sell, and the JoSAA fix to be genuinely better than ChatGPT. |

Two things outside this spec should happen before Phase 3, because they
change what the agent is worth: **fix `discoverFields()` and run the JoSAA
ingest**, and **reprice**. An agent that converts visitors into ₹249 sessions
is doing the same arithmetic the traffic audit already called the problem.

---

## What this deliberately does not do

- **No diagnosis, no clinical claims, no trait assertions.** Interests and
  preferences, described tentatively. We call out DMIT for false certainty in
  public; the same standard applies inward.
- **No unattended crisis handling.** Detect, stop, escalate.
- **No AI-generated site content.** Twenty-two city pages already sit at
  68–76% mutual overlap and may be reading as doorway pages. More machine
  prose there makes a live problem worse.
- **No replacing the counsellor.** It removes the forty minutes of admin
  around the session so the forty-five minutes of counselling is worth
  charging properly for. That is the entire thesis.
