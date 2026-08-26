# The WhatsApp agent

The one part of this system that talks to a client without a counsellor
reading it first.

---

## The short version

- Lives on **WhatsApp**, because `index.html` alone carries 48 links to
  `wa.me/917015671280` and `api/submit.js` exists precisely because people
  compose those messages and never press send. The conversation is already
  there.
- Every inbound message passes a **distress screen before the agent composes
  anything**. On an acute reading the agent is never called at all.
- Grounded on **Lume Live's own career library** — 97 careers and 51
  government routes with Indian salary bands and entrance exams. It may not
  describe a career that is not in the file.
- **Possession of a phone number unlocks nothing.** Linking requires a code
  minted from a signed-in session.
- Roughly **₹15–25 per conversation**, capped per person per day.

---

## Order of operations

This is the safety design, and it is deliberately rigid:

```
1. Is this thread locked to a human?   → do not compose
2. Screen the message                   → may lock it now
3. Is this person within budget?        → hand off if not
4. Only then, run the agent
```

Step 2 runs before step 4 on **every single message** — no fast path, no
cache, no "we screened this person earlier". Somebody can be fine at 9pm and
not fine at 11pm. There is a test that sends three messages and asserts the
screen was called three times.

### The acute branch composes nothing

The agent is not called. A fixed, human-written message goes out carrying
helpline numbers a person checked — Tele-MANAS 14416, KIRAN 1800-599-0019,
AASRA — the owner is paged, and the thread **locks**, so the next message
reaches a human rather than a chatbot that has decided the moment passed.

A model improvising a crisis response, or worse a helpline digit, is the
single worst failure available to this system. It is not given the chance.
The test asserts the composing model **was not called**, not merely that the
output text was right.

Only a named human can unlock a thread. Not the agent, and not the passage of
time.

### The screen fails CLOSED

Every other guard on this site fails open — a broken rate limiter must not
stop somebody paying. This one is the opposite. If the classifier errors,
times out, refuses, or returns something unparseable, the verdict is
`concern`: the agent proceeds gently and a human is told.

An unclassifiable message is not a safe message.

### Why a model call and not a word list

"I don't see the point of any of this anymore" contains no keyword worth
matching. Neither does *"sab kuch khatam lagta hai"*. A regex over an English
word list, on a service whose clients type Hinglish, would be theatre.

### `concern` still answers

Real distress that is not danger gets an answer, but the agent is told to
acknowledge briefly, **not** work through the feeling, and offer a session.
That instruction rides in the per-turn context block, not the system prompt,
so the cached prefix holds.

---

## Measuring the rubric

Claiming the gate over-escalates is worth nothing unmeasured.

```
npm run safety:check
```

Runs `tools/safety/fixtures.json` against the real classifier — real API
calls, so it is **not** part of `npm test`. An `acute` case that comes back
lower **fails and blocks**. An over-escalation is reported and allowed,
because that is the direction the rubric is tuned in: a false positive costs a
counsellor thirty seconds; a false negative is what the gate exists to
prevent.

**The fixture file should be owned by a counsellor.** What is committed is a
skeleton written to exercise the rubric's shape — sixteen cases, some
Hinglish. It is not a clinical instrument. Real coverage means real phrasings
drawn from messages the practice has actually received, and that is not an
engineer's document to write.

---

## Whose data it can see

`restore-access.js` deliberately stopped trusting typed-in phone numbers,
because a phone number is not a secret — it is shareable, guessable, and
often printed on a school form. An agent that handed over a psychometric
profile to whoever messaged from a number would reopen exactly that hole, at
scale, over a channel where nobody signs in.

So **linking is a separate, deliberate act**:

1. Client signs in on the website and calls `POST /api/agent/link-code`.
2. They get a six-character code, valid 15 minutes, single use.
3. They send it to the agent on WhatsApp.
4. `agentLinks/{phone}` now points at their uid.

Until then the agent is happy to discuss careers, exams and colleges, and
will not read one personal field. Tests cover the guess, the reuse, the
expiry, and a second number trying the same code.

### The two rules in the tool layer

**A SKU, never an amount.** `create_checkout` takes a `sku` and there is no
schema field anywhere that could carry a rupee figure. `_lib/catalog.js` says
at the top that it is the one place a price lives and the browser is never
trusted with a number; a model is not a more trustworthy client than a
browser, it is a less predictable one. A test passes `amount: 1` and asserts
the reply still says ₹499.

**The agent inherits an identity, it does not have one.** No tool schema has
a `uid`, `phone`, `account`, `email` or `customer` parameter — there is a
test that walks every schema and asserts it. The uid comes from the link the
caller established, never from something the model said.

The agent also cannot sell everything: the internship tracks and the parent
handbook are absent from `OFFERABLE`. An agent quietly selling a ₹11,999
supervised-hours programme over WhatsApp is not a thing anybody asked for.

---

## What it is allowed to know

Three sources. The test for a fourth: *could ChatGPT answer this without it?*

1. **The client's own saved scores** (Phase 0). The only genuinely unmatched
   input.
2. **`_lib/careerCorpus.js`** — 97 careers and 51 government routes extracted
   from `career-intelligence.html`, including the **RIASEC theme codes each
   career is already tagged with**. That tagging is the bridge between a
   client's profile and the library, and it is why an answer can be about
   them rather than about careers in general.
3. **JoSAA cutoffs** — which do not exist yet.

`predict_colleges` therefore answers honestly: the dataset is not published,
here is the official site, would you like a session. **Inventing a cutoff is
the most damaging thing this agent could do** — a student picks a college on
it — so the handler refuses rather than degrading gracefully.

Likewise `lookup_career` returning nothing is a real answer the agent must
relay, not route around. The instruction is explicit and the handler says so
in its own response text.

### Why the corpus is a file and not a prompt

The full corpus is ~115 KB. What goes in the cached system prompt is
`catalogue()` — id, title, sector, themes, about 9.7 KB — so the agent knows
what exists and can name a real id. Full records come back one at a time
through the tool.

---

## The loop

A manual tool loop, not the SDK's tool runner: this codebase hand-rolls its
plumbing, and the money-touching tools want an approval gate readable in one
file rather than a callback threaded through a helper.

- **All tool results for a round go back in one user message.** Splitting them
  quietly teaches the model to stop calling tools in parallel. There is a test
  asserting a single message with two results.
- **A failing tool still returns a result**, with `is_error: true`. A missing
  `tool_result` is a malformed conversation.
- **Five rounds, then stop.** An agent that has looked five times and not
  settled is a question for a person, so it hands over rather than filling the
  silence.

### The cached prefix

System prompt plus catalogue are cached; transcript and profile are not.
Nothing per-client may move into the cached half — at WhatsApp volumes that
turns a tenth-of-a-rupee cache read into a full-price re-send on every message
anybody sends. Tested by running two different clients and asserting the
`system` blocks are byte-identical.

---

## Budget

`AGENT_DAILY_MESSAGE_CAP` (default 40) per phone number per day. Metered on
the number rather than the account, because an unlinked stranger can talk too.

At the cap the conversation **hands off to a human** — it does not refuse.
"You have used your allowance" is a terrible thing to say to somebody who
might be about to ask the question that matters. There is a test asserting the
words "allowance", "limit" and "quota" appear nowhere in that reply.

The gate still runs first: an acute message is screened even when the budget
is spent.

---

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/agent/webhook` | HMAC (`WHATSAPP_APP_SECRET`) | Inbound WhatsApp. Signature checked before anything is parsed or written. |
| `GET /api/agent/webhook` | `WHATSAPP_VERIFY_TOKEN` | Provider subscription handshake. |
| `POST /api/agent/link-code` | Signed-in account | Mint a linking code; `action:"unlink"` removes one. |
| `POST /api/agent/chat` | `AGENT_ADMIN_TOKEN` | Drive a turn without a phone; `action:"read"` / `"unlock"` for a counsellor watching a thread. |

`/api/agent/chat` is admin-gated and **not** a public chat route: it takes a
phone number as a parameter, so a public version would let any caller name
whose conversation to continue. The webhook is the public door, and it proves
the number with an HMAC.

The webhook never returns 500. A provider retries on error, and a retried
message is a message answered twice.

---

## Firestore

| Collection | Holds |
|---|---|
| `conversations/{threadId}` | Transcript, risk flags, human-lock state, daily spend |
| `agentLinks/{phone}` | phone → uid, once proven |
| `agentLinkCodes/{code}` | Short-lived, single-use linking codes |

`threadId` is a SHA-256 of the number, so the collection is not itself a
directory of everybody who has ever messaged the business. Transcripts are
capped at 200 turns and spend history at 14 days.

Deny browser access to all three:

```
match /conversations/{id} { allow read, write: if false; }
match /agentLinks/{id}    { allow read, write: if false; }
match /agentLinkCodes/{id}{ allow read, write: if false; }
```

---

## What a deploy needs

```
ANTHROPIC_API_KEY
AGENT_ADMIN_TOKEN            already needed by Phases 1 and 2
WHATSAPP_APP_SECRET          HMAC secret; unset → webhook 404s
WHATSAPP_VERIFY_TOKEN        subscription handshake
WHATSAPP_ACCESS_TOKEN        Cloud API send
WHATSAPP_PHONE_NUMBER_ID     Cloud API send
AGENT_DAILY_MESSAGE_CAP      optional, default 40
```

With `WHATSAPP_APP_SECRET` unset the webhook answers 404 and nothing else on
the site changes.

---

## Tests

`npm run chat:test` — 33 assertions, no API calls. The screen, the agent and
the notifier are all injected.

The five that matter most:

- **An acute message never reaches the composing model** — asserted on the
  call not being made.
- **The screen is asked on every message**, not once per thread.
- **The screen fails closed**, unlike every other guard here.
- **No tool schema exposes an identity or a price parameter** — every schema
  walked.
- **`create_checkout` prices from the catalogue** even when told otherwise.

---

## Known gaps

**The fixture corpus is a skeleton.** Named above. This is the highest-value
thing a counsellor can contribute to Phase 3, and until it is real the
`safety:check` pass rate means less than it looks like it does.

**No JoSAA data.** The agent's third grounding source does not exist. Fixing
`discoverFields()` and running the ingest is still the highest-value change in
this repository, and it is what makes the agent decisively better than a
general chatbot rather than merely better-sourced.

**Nobody watches the queue.** Locked threads page the owner through
`notifyOwner`, but there is no screen listing them. `/api/agent/chat` with
`action:"read"` is the raw material for one.

**No Hindi test coverage.** The prompt instructs Hinglish handling and the
fixtures include three Hinglish cases, but nothing verifies the agent's
*replies* come back in the right register.

**Cost is estimated, not measured.** ₹15–25 per conversation assumes ten turns
and a warm cache. `usage` is accumulated per turn and stored on the thread —
read the real numbers before trusting the estimate.
