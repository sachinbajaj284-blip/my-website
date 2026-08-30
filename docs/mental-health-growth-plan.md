# Mental Health Sessions — Traffic & Booking Growth Plan

**Context:** career counselling enquiries are down. Mental health capacity is available.
This plan reallocates demand generation toward mental health support while reusing
assets Lume Live already owns.

**Horizon:** 90 days, in three 30-day blocks.
**Owner:** Sachin Bajaj. **Primary booking rail:** WhatsApp (+91 70156 71280) → paid slot.

---

## 1. Where we actually stand (audit, not assumption)

### Assets that are already strong

| Asset | State | Why it matters |
|---|---|---|
| `lume-wellbeing-check.js` — PHQ-4, GAD-7, Rosenberg Self-Esteem, Satisfaction With Life, Flourishing, COPSOQ-style work stress | Built, working, non-diagnostic framing, ends on **"Book Rs 249 first session"** WhatsApp CTA | This is a complete lead-capture funnel. It is the single most under-used thing on the site. |
| Practitioner credibility | M.Sc Clinical Psychology (Gurugram University), PGDGC Jamia Millia Islamia | "Qualified, not a life coach" is the trust gate in Indian mental health search. |
| Price point | Rs 249 first session vs Rs 2,000–3,000 market | Removes the largest stated objection before it is raised. |
| Crisis routing | Tele-MANAS 14416 already cited on 6 pages | Ethically and legally the right baseline. Keep it on every new page. |
| Distribution surface | 24 career city pages, all already linking to the Rohtak mental health page | Free internal link equity, currently pointed at the wrong target. |
| Measurement | GA4 (`G-1CZ93P4P3V`), Microsoft Clarity, Meta pixel | Instrumentation exists; conversion events do not. |

### Gaps that are capping growth

1. **Every option that *names* mental health is priceless.** `services-pricing.html` lists
   *"1:1 Career and Mental Health Support — Custom, based on need"* behind a
   **"Send Support Enquiry"** button, and `book-session.html` marks its mental health and
   parent sessions `as per plan`. Mental health *was* buyable — but only through the generic
   "First 1:1 Session" at Rs 249. So a visitor arriving with a mental health concern saw no
   price on the one option matching their need, and got routed to a form, while career
   counselling could be bought in one click. Biggest single conversion leak.

2. **The screener has almost no entry points.** It is reachable only from `index.html`.
   `assessment.html` and `for-working-professionals.html` both *download* it and offer nothing
   that can open it — no trigger in their markup at all. The `data-ll-open` attributes that
   look like buttons on the working-professionals page live inside the script's own submenu
   markup, which renders only after a check is already open. Working professionals could not
   reach the workplace-strain screener, the most relevant one for them, though the page
   shipped it.

3. **The screener is implemented four times over** — `lume-wellbeing-check.js`, identical CSS
   blocks in `index.css` and `assessment.css`, and a second full copy of both the logic and
   the styles inlined in `for-working-professionals.html`. Four copies is four things to
   drift.

4. **Content asymmetry:** 24 career city pages vs **1** mental health city page (Rohtak).

5. **Internal links point the wrong way.** `mental-health-counselling-rohtak.html` has ~30 inbound
   links; the national guide `student-mental-health-india.html` has 3. We are funnelling national
   traffic into a hyper-local page that cannot rank nationally.

6. **No national hub.** There is no `/mental-health-counselling` page. The Rohtak page is doing
   national duty in a local costume.

7. **No screener landing pages.** "anxiety test", "depression test online", "stress test" carry
   very high Indian search volume with low commercial competition — and we already own the tool
   that satisfies that intent. We rank for none of it.

---

> **Correction (implementation pass).** Two findings above were first written from a partial
> read and are corrected in place: mental health was never entirely unbuyable, and the
> working-professionals page had no dead buttons — it had no buttons. The conclusions held
> and the fixes were the same, but the shape of each defect was different from the first
> description.

## 2. Strategy in one line

**Lead with the free, credible self-check — not with the session.**

Nobody in India searches "book a therapist". They search *"why do I feel like this"*,
*"anxiety test"*, *"exam ke baad depression"*, *"job stress"*. The screener meets that intent,
gives a real result, and the result is the natural moment to offer a Rs 249 conversation.
We are not selling therapy to strangers; we are giving them a mirror and standing next to it.

Funnel: **Symptom search → free screener → banded result → Rs 249 first session → follow-up.**

---

## 3. Traffic plan (getting the right people here)

### 3.1 Screener-first SEO pages — *highest priority*

Build a dedicated page per screener. Each is a thin landing page whose hero **is** the test,
with the result feeding the existing WhatsApp CTA. Target ~1,200 words + FAQ schema.

| Page | Primary intent | Screener |
|---|---|---|
| `free-anxiety-test.html` | "anxiety test online India", "am I anxious" | GAD-7 |
| `free-depression-test.html` | "depression test", "low mood test" | PHQ-4 (mood) |
| `exam-stress-test.html` | "exam stress test", "board exam anxiety" | PHQ-4 + GAD-7 |
| `work-stress-burnout-test.html` | "burnout test", "job stress test India" | COPSOQ workplace |
| `self-esteem-test.html` | "self esteem test", "confidence test" | Rosenberg |
| `wellbeing-check.html` | hub page linking all six | menu |

Non-negotiable on every one: "this is a reflection tool, not a diagnosis", Tele-MANAS 14416,
counsellor credentials, and no fear language.

### 3.2 National hub page

`mental-health-counselling.html` — the page the whole site points at. Covers: what a session is,
who the counsellor is, what it costs, confidentiality, what it is *not* (not a diagnosis, not
emergency care), how to book. Then re-point the ~30 inbound links currently going to the Rohtak
page: city pages keep linking to Rohtak, everything else goes to the hub.

### 3.3 Programmatic city pages — *shipped*

Ten cities, generated from `tools/build-mh-pages.mjs`: Delhi, Gurugram, Noida, Mumbai,
Bengaluru, Hyderabad, Pune, Jaipur, Chandigarh, Lucknow.

Deliberately **not** cloned from the career template. Measured on article body, two career
city pages still share 64% of their text, the worst pair 76%, and none of the 24 names a
single local institution. The mental health pages share at most **38%** with each other, and
each carries its own pressure profile, concerns, FAQ answers and account of what is already
available locally.

The rule for an eleventh city: if it cannot be given real local content, it should not be
added. A cluster of near-duplicates does not just fail to rank — it drags down the pages
around it.

**On numbers:** Tele-MANAS (14416) is the only helpline quoted on any of these pages. Local
institutions are named because those names are stable; no local phone number is published
from memory, because a wrong crisis number on a mental health page does real harm.

### 3.4 Situational / seasonal content

These are the moments people actually search. Build ahead of the calendar, not during it.

- Board results week (May) — *already partly covered*, expand
- NEET/JEE result and dropper-year despair (June–July)
- College first-year homesickness and hostel adjustment (Aug–Sep)
- Placement season rejection (Sep–Dec)
- Breakup / relationship distress in students — large, under-served, and it converts
- First-job burnout and manager conflict (year-round, working professionals)
- Parent-side: *"my child has stopped talking to me"*, *"is my teenager depressed"*

### 3.5 Social / video

We already have session photography and thumbnail assets. Highest-leverage format is
**60-second Reels/Shorts answering one specific question** ("Is it stress or anxiety?",
"What actually happens in a first counselling session?"), each ending on the free self-check —
never on "book now". Post 4–5/week. Repurpose one long YouTube explainer per week into 5 clips.

### 3.6 Schools and colleges

`school-partnerships.html` already offers Mental Health Seminars. This is the fastest volume
channel and does not depend on SEO timelines: a free 45-minute session for a school gets the
self-check QR in front of 200+ students at once. Target 2 school seminars per month, and pitch
college counselling cells and hostel wardens the same way.

### 3.7 Paid (only after conversion is fixed)

Do not spend until Section 4 is shipped. Then start small: Meta ads to the screener pages
(not to the booking page), Rs 300–500/day, audiences of parents 35–55 and students 18–24 in
tier-1/tier-2 cities. Mental health ad copy is restricted on Meta — advertise the *free check*,
never a claimed condition or outcome.

---

## 4. Conversion plan (turning traffic into bookings)

This block matters more than the traffic block. Fix it first.

1. **Publish a real mental health price and make it buyable.**
   Replace "Custom — based on need / Send Support Enquiry" with the same structure career has:
   **Rs 499 per 45-minute session, first session Rs 249**, direct checkout, self-selected slot,
   instant calendar invite. Keep "custom" only for multi-session plans.

2. **Fix the dead buttons on `for-working-professionals.html`** — load `lume-wellbeing-check.js`
   and add the `workStress` check to that page. One-line fix, immediate return.

3. **Put the self-check on every mental health page**, above the fold, as the primary CTA.
   Sessions are the secondary CTA. Always.

4. **Lead with confidentiality, because that is the real objection.**
   Explicit, repeated, near every CTA: *no one else is told; no report goes to your parents,
   school or employer; you can use a first name only.* In India this beats price as a barrier —
   for students in particular, fear of the family finding out is the reason they don't book.

5. **Reduce the first-session promise.** Do not sell "therapy". Sell *one 45-minute confidential
   conversation with a qualified counsellor to work out what is going on and what would help*.
   Low commitment converts; a treatment course does not.

6. **Make the result page do the selling.** The screener band already produces a tailored line —
   extend it so a moderate/severe band offers the session, a minimal band offers a free guide
   instead. Do not push a session at someone who does not need one; it destroys trust and
   the referrals that come with it.

7. **Follow up.** Screener completions that don't book get one WhatsApp message at 24h and one
   at 72h — supportive, not salesy, with an easy opt-out.

8. **Social proof, ethically.** Anonymised, consented, outcome-honest ("I finally understood
   what was happening" — not "cured"). Never a testimonial that names a diagnosis.

9. **Instrument the funnel.** GA4 and Clarity are installed but there are no conversion events.
   Add: `selfcheck_start`, `selfcheck_complete` (with band), `whatsapp_click`, `booking_paid`.
   Without this, every decision below is a guess.

---

## 5. Guardrails — non-negotiable

Mental health marketing carries risk that career marketing does not. These are cheap to honour
and expensive to skip.

- **Never imply diagnosis.** The existing "this is not a diagnosis" framing is correct — carry it
  onto every new page, every ad, every Reel.
- **Never use fear or urgency.** No "you may be depressed and not know it", no countdown timers,
  no scarcity on mental health offers.
- **Crisis routing on every page.** Tele-MANAS 14416 (free, 24×7). If a screener returns a severe
  band or a self-harm signal, the result must lead with helpline and urgent professional care —
  not with our Rs 249 button.
- **Minors.** Under-18s need parental consent for a paid session. Say so plainly, and route
  parent-facing pages to the parent, not the child.
- **Data.** The screener does not store answers today. Keep it that way, and say so on the page —
  it is a real differentiator.
- **Scope honesty.** We provide non-diagnostic counselling support. We are not a psychiatric
  service and do not prescribe. State it.

---

## 6. The supply-side constraint (flagging this deliberately)

"At a big scale" has a ceiling that traffic cannot solve: **one counsellor**. At 45 minutes a
session, ~6 sessions/day is a realistic sustainable maximum, and mental health sessions carry
emotional load that career sessions do not — burning out the practitioner ends the business.

Before demand generation runs hot, decide one of:
- cap daily mental health slots and let a waitlist form (protects quality, slows revenue), or
- onboard 2–3 empanelled M.Sc/M.Phil counsellors on a revenue-share (the internship and
  fellowship tracks in `services-pricing.html` are already a pipeline for this), or
- raise price and reduce volume once demand is proven.

**Recommendation:** cap slots for the first 30 days, use the waitlist as proof of demand, and
empanel from Block 2 onward. Do not scale traffic past capacity — a missed or rushed mental
health session does more brand damage than a missed career session.

---

## 7. 90-day sequencing

### Block 1 (Days 1–30) — Fix the leaks, don't add traffic yet

Shipped:
- [x] Mental health pricing published: Rs 499 / Rs 249 first, bookable directly
- [x] Screener surfaced on `for-working-professionals.html` (incl. `workStress`) and `assessment.html`
- [x] Screener consolidated into one shared `lume-wellbeing-check.js` + `.css`
- [x] `mental-health-counselling.html` national hub built; generic inbound links re-pointed
- [x] GA4 events: `selfcheck_start`, `selfcheck_complete` (with band), `whatsapp_click`, `booking_paid`
- [x] Screener pages: `free-anxiety-test.html`, `exam-stress-test.html`
- [x] Confidentiality copy near every mental health CTA

Still open:
- [ ] **Decide the capacity model (Section 6)** — a business call, not a code change

**Exit criteria:** a visitor can go search → screener → result → paid booking without one
enquiry form, and we can see every step of that in GA4.

### Block 2 (Days 31–60) — Build the traffic engine

Shipped:
- [x] Remaining 4 screener pages + `wellbeing-check.html` hub
- [x] 10 city pages — Delhi, Gurugram, Noida, Mumbai, Bengaluru, Hyderabad, Pune, Jaipur,
      Chandigarh, Lucknow (Block 3's five brought forward)

Still open — none of these are code:
- [ ] Start Reels: 4–5/week off screener page content
- [ ] 2 school seminars booked
- [ ] Empanel first additional counsellor
- [ ] 24h/72h WhatsApp follow-up live

**Exit criteria:** organic mental health sessions per week is a number that moves, not zero.

### Block 3 (Days 61–90) — Scale what proved out
- Situational pages built ahead of the season (city pages shipped in Block 2)
- Turn on paid at Rs 300–500/day to screener pages only
- Weekly YouTube explainer + clip repurposing
- Review: which screener converts best → double down there, cut what doesn't

---

## 8. What to measure

| Metric | Why | Block 1 baseline goal |
|---|---|---|
| Screener starts / week | Top of funnel health | establish baseline |
| Screener completion rate | Is the tool too long? | > 60% |
| Completion → WhatsApp click | Is the offer landing? | > 15% |
| WhatsApp click → paid booking | Is the rail leaking? | > 30% |
| Mental health sessions / week | The actual goal | > 0 and rising |
| Rs 249 → repeat session rate | Is the service good? | > 25% |

The one to watch hardest is **completion → WhatsApp click**. If traffic is high and that number
is low, the problem is trust or price clarity, not traffic — and more traffic will not fix it.

---

## 9. Biggest single lever

If only one thing gets done: **publish the Rs 249 mental health price with direct checkout, and
put the free self-check on every mental health page as the primary CTA.**

The screener is already built, already credible, already ends on the right call to action.
Right now it lives on two pages, and the offer it points at cannot be bought. Fixing that costs
days, not months, and every traffic tactic in Section 3 multiplies against it.
