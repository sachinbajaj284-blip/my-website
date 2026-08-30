/* Content for the mental health city pages.
 *
 * The existing career city cluster is thinner than it should be. Its prose does vary
 * between cities, but two of those pages still share 64% of their article body, the
 * worst pair shares 76%, and not one of the 24 names a single local institution. That
 * is the pattern this table exists to avoid, because a cluster of near-duplicates does
 * not just fail to rank, it drags the pages around it down too. The pages generated
 * from this table share at most 38% of their body with each other.
 *
 * So every city below carries its own pressure profile, its own concerns, its own
 * "why here" prose and its own FAQ answers. If a new city cannot be given real local
 * content, it should not be added.
 *
 * Institutions are named because those names are stable and checkable. No local
 * helpline number is published: Tele-MANAS (14416) is the only number quoted, since a
 * wrong crisis number on a mental health page does real harm.
 */

export const CITIES = [
  {
    slug: 'mental-health-counselling-delhi.html',
    city: 'Delhi', region: 'IN-DL', state: 'Delhi NCR',
    careerPage: null,
    lede: 'Delhi runs on entrance exams, coaching timetables and comparison &mdash; and a young person here is rarely more than a conversation away from being ranked against someone. Confidential 1:1 support, online, in Hindi or English.',
    hindi: 'Baat karna kamzori nahi, samajhdari hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Delhi concentrates the two things that reliably raise student distress: an enormous number of highly selective institutions, and an enormous number of families who moved here so their child could reach one. DU cut-offs, the CUET scramble, the coaching belts around Mukherjee Nagar and Rajinder Nagar for civil services, and the long shadow of NEET and JEE all sit within the same few kilometres.</p>
    <p>Two patterns come up again and again in sessions. The first is the aspirant living away from family in a rented room, where a bad month has no one in it &mdash; the isolation does more damage than the syllabus. The second is the student from a family that has already sacrificed visibly for this, who has concluded that struggling would be ingratitude, and so says nothing at all.</p>`,
    why: `<p>Delhi has genuine mental health infrastructure &mdash; the psychiatry department at AIIMS, and IHBAS in Dilshad Garden, one of India's major public mental health institutions. Those are the right places for psychiatric assessment and for anything severe.</p>
    <p>What they are not built for is the much larger group who are not ill but are quietly struggling: the student who cannot start studying, the aspirant in their third attempt, the young professional who has stopped enjoying anything. Public psychiatry has waiting lists and a clinical threshold. Private therapy in Delhi commonly runs &#8377;1,500&ndash;&#8377;3,000 a session, which for most students means asking a parent, which for many means not going.</p>
    <p>Sessions here are online, so nobody sees you attend, and a first session costs &#8377;249.</p>`,
    concerns: [
      ['&#127891;', 'Coaching and entrance pressure', 'NEET, JEE, CUET and civil services preparation &mdash; including the particular weight of a second or third attempt.'],
      ['&#127968;', 'Living away from family', 'PG rooms and rented flats in the coaching belts, where a bad month has nobody in it.'],
      ['&#128200;', 'DU admission and cut-off stress', 'The narrow window between a board result and a place, and what it feels like to miss it.'],
      ['&#128149;', 'Family expectation and guilt', 'Struggling in a household that has visibly sacrificed, and reading that as a reason to stay quiet.'],
    ],
    faq: [
      ['Do I have to travel anywhere in Delhi for a session?', 'No. Sessions are online by video, voice or chat, so there is no clinic to reach across the city and no waiting room to sit in. For most people in Delhi that is the point &mdash; the traffic is a real barrier, and so is being seen.'],
      ['Is this available in Hindi?', 'Yes. Hindi or English, whichever you actually think in. For a lot of people in Delhi, describing what is going on is much easier in Hindi even when their working life runs in English.'],
      ['I am preparing for UPSC and cannot afford time away. Is one session useful?', 'Yes, and one is genuinely a reasonable amount to start with. Forty-five minutes, online, at a slot you pick. A great deal of aspirant distress is about isolation and the arithmetic of attempts rather than about the syllabus, and that is workable in a single conversation.'],
      ['Will my parents find out?', 'No. Nothing is reported to your parents, and you can book using a first name only. This is the most common question we are asked in Delhi and the answer does not have caveats attached to it, beyond the standard limit where there is serious risk to life.'],
    ],
  },
  {
    slug: 'mental-health-counselling-gurugram.html',
    city: 'Gurugram', region: 'IN-HR', state: 'Haryana',
    careerPage: 'career-counselling-in-gurugram.html',
    lede: 'Long hours, longer commutes, and a workplace culture where exhaustion reads as commitment. Confidential 1:1 support for professionals, students and parents in Gurugram &mdash; online, in Hindi or English.',
    hindi: 'Thak jaana normal hai. Har roz thakna nahi. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Gurugram is an unusual city psychologically: a very large share of the people in it moved here for work in the last decade, which means the ordinary support structure most people rely on &mdash; family nearby, friends from school, a neighbourhood that knows you &mdash; is simply absent. The people around you are colleagues, and colleagues are also the people you are being measured against.</p>
    <p>The result is a distinct pattern of workplace strain: high demands and reasonable pay, but low control, thin support and almost no recovery. Add a commute that eats two hours and a rental cost that makes leaving a job feel risky, and you get people who are not in crisis but have been running at a level they could not sustain for years.</p>
    <p>The other Gurugram pattern is the parent working these hours who is worried about a teenager they barely see on weekdays, and who cannot tell whether what they are noticing is adolescence or something more.</p>`,
    why: `<p>Corporate wellness programmes exist across the Cyber City and Golf Course Road offices, and some are decent. The problem people describe is trust: a counsellor routed through your employer is very hard to speak freely to, whatever the confidentiality policy says, when what you want to discuss is your manager or the fact that you are thinking of leaving.</p>
    <p>Sessions here are independent of any employer, online, and cost &#8377;249 for a first session. Nothing goes to your company, because your company is not involved.</p>`,
    concerns: [
      ['&#128293;', 'Burnout and workplace strain', 'Exhaustion that sleep does not fix, Sunday-evening dread, effort that stopped feeling like it counts.'],
      ['&#127968;', 'Isolation after relocating', 'Building a life in a city where everyone you know is a colleague.'],
      ['&#128337;', 'Commute and boundary collapse', 'Work that reaches you at any hour, and a day with no genuinely unreachable window in it.'],
      ['&#128106;', 'Parenting on corporate hours', 'Worrying about a teenager you mostly see at weekends, and not knowing what is normal.'],
    ],
    faq: [
      ['Will my employer know I booked a session?', 'No. This is completely independent of any corporate wellness programme &mdash; your company is not involved, is not billed, and is not told. You can book using a first name only.'],
      ['Can I do a session outside office hours?', 'Yes. You pick your own slot from the live calendar, and evening and weekend times are available. Sessions are online, so there is no commute added to your day.'],
      ['My problem is genuinely my workload. Can counselling fix that?', 'It cannot change your workload, and it would be dishonest to claim otherwise. What it can help with is the part you do control &mdash; boundaries, what you want to ask for, how you are reading the situation, and whether staying is the right call. Sometimes the honest conclusion is that the job is the problem.'],
      ['I am a parent in Gurugram worried about my teenager. Where do I start?', 'A parent session is a reasonable first step, and it does not require your child to agree to anything. It is often more useful than pushing a reluctant teenager into a room. Our guide <a href="for-parents.html">for parents</a> covers the signs worth taking seriously.'],
    ],
  },
  {
    slug: 'mental-health-counselling-noida.html',
    city: 'Noida', region: 'IN-UP', state: 'Uttar Pradesh',
    careerPage: 'career-counselling-in-noida.html',
    lede: 'A student city and a shift-work city at the same time. Confidential 1:1 support for students, hostellers and working professionals across Noida and Greater Noida &mdash; online, in Hindi or English.',
    hindi: 'Akela lagna aam hai, par akela rehna zaroori nahi. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Noida holds two populations with very different problems in the same postcode. One is students &mdash; the private university belt through Greater Noida draws young people from across UP, Bihar, Jharkhand and the north-east, most of them living away from home for the first time, many of them in a language environment they are still adjusting to.</p>
    <p>The first-year version of this is homesickness that nobody admits to because everyone assumes they are the only one. The later version is quieter and more serious: a student who has been failing papers for two semesters, has stopped telling their family anything, and is now managing a gap between what home believes and what is actually happening.</p>
    <p>The other population is the IT and BPO workforce, where night shifts do something specific and underrated to mental health. Sleeping against your body clock for months degrades mood and anxiety directly, and it isolates you socially at the same time, because your free hours are everyone else's working ones.</p>`,
    why: `<p>Most Noida campuses have a counselling cell, and using it is a reasonable thing to do. The hesitation students describe is structural rather than about the counsellor: the cell sits inside the institution that also decides your attendance, your grades and what gets communicated to your parents, and that proximity is enough to make people edit what they say.</p>
    <p>Sessions here are outside all of that. Nothing goes to your college, your hostel warden or your family, and a first session is &#8377;249.</p>`,
    concerns: [
      ['&#127890;', 'Hostel and first-year adjustment', 'Homesickness, language shifts, and the specific loneliness of a room full of people.'],
      ['&#128220;', 'Backlogs and academic spiral', 'Failed papers, a widening gap with what home believes, and no obvious way back.'],
      ['&#127769;', 'Night shifts and body clock', 'Sleeping against your rhythm for months, and what that does to mood and worry.'],
      ['&#128241;', 'Distance from family', 'Managing a version of yourself on phone calls that no longer matches your life.'],
    ],
    faq: [
      ['Will my college or hostel warden be told?', 'No. This is entirely outside your institution &mdash; no attendance record, no note to a warden, nothing to a college counselling cell. You can book using a first name only.'],
      ['I have backlogs and my parents do not know. Can I talk about that?', 'Yes, and it is one of the most common things students bring here. The academic problem and the problem of the growing gap with home are two different problems, and it usually helps to separate them before deciding anything.'],
      ['I work night shifts. Can I get a session that fits?', 'Yes &mdash; you pick your own slot, and daytime slots that suit a night-shift schedule are available. Worth saying that the shift pattern itself is often part of what is going on, and that is a legitimate thing to work on rather than just accept.'],
      ['Is it available in Hindi?', 'Yes, Hindi or English. A lot of students in Noida study in English and think in Hindi, and there is no reason a session should run in the harder language.'],
    ],
  },
  {
    slug: 'mental-health-counselling-mumbai.html',
    city: 'Mumbai', region: 'IN-MH', state: 'Maharashtra',
    careerPage: 'career-counselling-in-mumbai.html',
    lede: 'A city that rewards endurance and rarely asks what it costs. Confidential 1:1 support for students, professionals and families across Mumbai and the MMR &mdash; online, in Hindi, English or Marathi-friendly conversation.',
    hindi: 'Sab kuch sambhaal lena hi taakat nahi hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Mumbai's particular contribution to stress is time and space. A two-hour commute each way is ordinary, a home shared with three generations is ordinary, and the consequence is that a great many people here have nowhere to be alone and no hour that is genuinely theirs. Distress that would surface elsewhere gets absorbed into a schedule that has no room to notice it.</p>
    <p>There is also a strong local script about coping. The city's self-image is resilience &mdash; it keeps going, it always has &mdash; and that is genuinely admirable, but it converts easily into a belief that struggling is a personal failure of stamina. People arrive at a first session having decided in advance that they should have been able to handle this.</p>
    <p>The student version runs through the HSC and CET calendar, the medical and engineering funnel, and a competitive cluster of colleges where the difference between two institutions is treated as the difference between two lives.</p>`,
    why: `<p>Mumbai has some of the best psychiatric care in the country in its public hospitals &mdash; the departments at KEM and at Sion among them &mdash; and TISS has long been a serious centre for mental health work in the city. If what you need is psychiatric assessment, those are the right doors.</p>
    <p>What is harder to find is an unhurried conversation for someone who is not ill. Private therapy in Mumbai is among the most expensive in India, and public services are correctly prioritised for severity. The middle &mdash; struggling, functioning, not in crisis &mdash; is where most people actually are and where the least is available.</p>
    <p>Sessions here are online, which removes the commute entirely, and a first session is &#8377;249.</p>`,
    concerns: [
      ['&#128649;', 'Commute and time poverty', 'Days with no hour that belongs to you, and distress that never gets a chance to surface.'],
      ['&#127968;', 'No private space at home', 'Living closely with family, and having nowhere to fall apart or even to think.'],
      ['&#128176;', 'Financial pressure and rent', 'The particular anxiety of a city where staying costs more than most people earn comfortably.'],
      ['&#127891;', 'HSC, CET and college competition', 'A narrow funnel treated as though it decides everything that follows.'],
    ],
    faq: [
      ['Do I have to travel for a session?', 'No, and in Mumbai that is often the deciding factor. Sessions are online by video, voice or chat, so a session costs you forty-five minutes rather than forty-five minutes plus three hours of travel.'],
      ['I share a home and have no privacy. How do people manage a session?', 'Most commonly by voice or chat rather than video, with headphones, from wherever is workable &mdash; including a parked car or an office meeting room. It is a very common constraint here and it is worth saying up front rather than deciding a session is impossible.'],
      ['Can we talk in Marathi?', 'Sessions run in Hindi or English. If Marathi is the language you think in, it is worth saying so at the start &mdash; a lot can be accommodated in how a session is run, and it is better to raise it than to work in a language that makes the difficult parts harder to reach.'],
      ['Is &#8377;249 really the full cost of a first session?', 'Yes, for a 45-minute first session with code FIRST50; sessions after that are &#8377;499. Mumbai private therapy commonly runs several times that, which is exactly why this is priced the way it is.'],
    ],
  },
  {
    slug: 'mental-health-counselling-bangalore.html',
    city: 'Bangalore', region: 'IN-KA', state: 'Karnataka',
    careerPage: 'career-counselling-in-bangalore.html',
    lede: 'A city of people who moved here for the work and are quietly measuring themselves against everyone who moved here earlier. Confidential 1:1 support across Bengaluru &mdash; online, in Hindi or English.',
    hindi: 'Sabke saath rehkar bhi akela lagna aam hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Bengaluru's distinctive pressure is comparison inside a peer group that is genuinely exceptional. When the people around you are engineers, founders and people whose companies just raised a round, an ordinary good career starts to feel like underperformance. Very capable people arrive at a first session convinced they are falling behind, on evidence that would not survive five minutes of examination.</p>
    <p>The startup layer sharpens this. Equity that may be worth nothing, a runway that ends in months, and a culture that treats total absorption as the baseline produce a specific kind of strain: high stakes, low control, and no clear point at which you are allowed to stop. Layoff cycles have added a background insecurity that people manage privately because saying it out loud feels like admitting weakness.</p>
    <p>Underneath the tech story is a large student population &mdash; the city's engineering, design and management colleges pull young people from across the south and beyond, with the same first-year isolation that any migration produces.</p>`,
    why: `<p>Bengaluru is home to NIMHANS, which is the leading mental health and neurosciences institution in the country and the right place for psychiatric assessment and serious clinical need. Having it here genuinely changes what is available in this city.</p>
    <p>It also means the local conversation about mental health skews clinical, which leaves out the much larger group whose difficulty is not a disorder: the engineer who has stopped enjoying anything, the founder who cannot switch off, the student who is doing fine on paper and badly in every other respect.</p>
    <p>Sessions here are for that group, they are online, and a first session is &#8377;249.</p>`,
    concerns: [
      ['&#128200;', 'Comparison and impostor feelings', 'Measuring an ordinary good career against an unusually high-achieving peer group.'],
      ['&#128293;', 'Startup and tech burnout', 'High stakes, low control, and no defined point at which you are allowed to stop.'],
      ['&#128683;', 'Job insecurity and layoff anxiety', 'Background dread that people manage privately because naming it feels like weakness.'],
      ['&#127968;', 'Isolation after relocating', 'A full calendar, a wide network, and nobody you can call at two in the morning.'],
    ],
    faq: [
      ['How is this different from going to NIMHANS?', 'Different purpose. NIMHANS is a major clinical institution and the right place for psychiatric assessment, diagnosis and severe or complex need. This is non-diagnostic counselling support &mdash; unhurried conversations for people who are struggling but not ill. If what you describe needs psychiatric care, we will say so.'],
      ['I have a demanding job. Are there slots outside work hours?', 'Yes. You pick your own slot, and evening and weekend times are available. Sessions are online, so no commute is added to a day that probably has enough in it.'],
      ['Everyone around me seems to be doing better. Is that worth a session?', 'Yes, and it is one of the most common things people bring here. Comparison inside a high-achieving peer group is a genuine and specific difficulty, not a trivial one, and it responds well to being examined out loud with someone who is not in that peer group.'],
      ['Will my employer or my team know?', 'No. This is independent of any corporate wellness programme &mdash; your employer is not involved, not billed and not told, and a first name is enough to book.'],
    ],
  },
  {
    slug: 'mental-health-counselling-hyderabad.html',
    city: 'Hyderabad', region: 'IN-TG', state: 'Telangana',
    careerPage: 'career-counselling-in-hyderabad.html',
    lede: 'Intermediate colleges that run like factories, and an IT corridor that never quite closes. Confidential 1:1 support across Hyderabad and Secunderabad &mdash; online, in Hindi or English.',
    hindi: 'Marks se zyada zaroori aap hain. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Hyderabad carries one of the most intense adolescent academic environments in India. The Intermediate corporate-college system, with its integrated EAMCET, JEE and NEET coaching, residential campuses and schedules that start before dawn and end after dark, compresses two years of adolescence into a single ranking exercise. The state has seen repeated public concern about student suicides in that system, and it is not an abstract worry to families here.</p>
    <p>The specific harm is not the studying. It is the removal of everything else &mdash; sleep, unstructured time, friendships that are not competitive, and any identity that is not academic. A student who has been told for two years that their worth is a rank has no available answer when the rank arrives and is not what was required.</p>
    <p>Alongside that sits HITEC City and the pharma corridor, with the same long-hours, low-control strain found in any Indian IT hub, and a large relocated workforce living away from the families they support.</p>`,
    why: `<p>Hyderabad has the Institute of Mental Health at Erragadda, one of the older public psychiatric hospitals in the country, and good private psychiatry. Those are the right places for clinical need.</p>
    <p>What families here more often need first is different: someone outside the college, outside the family and outside the rankings, who a teenager can say the true version to. Inside a residential Intermediate campus there is frequently nobody in that category at all.</p>
    <p>Sessions here are online, nothing is reported to a college, and a first session is &#8377;249.</p>`,
    concerns: [
      ['&#128218;', 'Intermediate and integrated coaching load', 'Residential campuses, pre-dawn schedules, and two years with everything non-academic removed.'],
      ['&#128201;', 'Rank identity and result collapse', 'Being told your worth is a number, and then receiving the number.'],
      ['&#128105;&#8205;&#128187;', 'IT corridor strain', 'Long hours and low control in HITEC City, often while supporting family elsewhere.'],
      ['&#128106;', 'Parents who cannot read the signs', 'Knowing something is wrong with your child and not knowing what is normal for this system.'],
    ],
    faq: [
      ['My child is in a residential Intermediate college. Can they have a session?', 'Yes, online, at a slot outside college hours. If your child is under 18 you will need to consent as a parent, but the content of the session stays between your child and the counsellor &mdash; that confidentiality is what makes it useful to them.'],
      ['I am a parent and my child refuses to talk to anyone. What can I do?', 'Book a parent session for yourself. It is often more productive than pushing a resistant teenager into a room, and it does not require their agreement. Much of the useful work in these situations is about how the conversation at home is being held.'],
      ['Will the college be told?', 'No. Nothing is reported to a college, a hostel or a coaching institute. This sits entirely outside that system, which for a student inside it is usually the whole point.'],
      ['We are worried about our child but it is not an emergency. Is a session still appropriate?', 'Yes, and earlier is better. Most of what helps is available well before a crisis. If it ever does become urgent &mdash; talk of self-harm, or immediate distress &mdash; call Tele-MANAS on 14416 straight away rather than waiting for a session.'],
    ],
  },

  {
    slug: 'mental-health-counselling-pune.html',
    city: 'Pune', region: 'IN-MH', state: 'Maharashtra',
    careerPage: 'career-counselling-in-pune.html',
    lede: 'A city that fills every June with students who have just left home for the first time. Confidential 1:1 support across Pune &mdash; online, in Hindi or English.',
    hindi: 'Ghar se door hona aasaan nahi hota. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Pune's defining feature, psychologically, is that a very large share of its young population is from somewhere else. The colleges pull students from across Maharashtra, the north-east, Bihar, the Gulf and much of Africa, and every academic year begins with tens of thousands of eighteen-year-olds in a rented room in an unfamiliar city.</p>
    <p>The first-year pattern is consistent enough to be predictable: an intense few weeks, then a dip somewhere around the second month when the novelty goes and the absence of anyone who knows you properly becomes obvious. Almost everyone experiences it and almost nobody says so, because each of them has concluded that everyone else has settled in fine.</p>
    <p>The second pattern is a Pune speciality: the student on a course chosen by a family that is paying for it from another city, who worked out in the first semester that it is wrong for them, and who now has to weigh their own life against that investment.</p>`,
    why: `<p>Pune has good private psychiatry and a long-standing civil-society mental health presence &mdash; this is a city where the subject has been discussed publicly for longer than in most of India. Sassoon serves the public need.</p>
    <p>What a first-year student away from home usually needs, though, is not clinical care. It is one person who is not their parent, not their roommate and not attached to their college, who they can say the unedited version to. That is a small thing that is remarkably hard to find at eighteen in a new city.</p>
    <p>Sessions here are online, nothing is reported to a college or to your family, and a first session is &#8377;249.</p>`,
    concerns: [
      ['&#127962;', 'First-year adjustment and homesickness', 'The second-month dip nobody admits to because everyone assumes they are alone in it.'],
      ['&#128218;', 'Wrong course, family investment', 'Realising a course does not fit when someone else is paying for it from another city.'],
      ['&#128172;', 'Language and belonging', 'Arriving from another state or country and reading the room in an unfamiliar language.'],
      ['&#128149;', 'Relationships and first heartbreak', 'A breakup a thousand kilometres from anyone who has known you longer than a year.'],
    ],
    faq: [
      ['I only moved here two months ago and feel awful. Is that normal?', 'Extremely. The dip around the second month is close to universal and it is not a sign that you have chosen wrongly or cannot cope. It is worth talking about precisely because everyone experiences it privately and concludes they are the only one.'],
      ['My family is paying for a course I do not want to continue. Where do I even start?', 'Usually by separating two questions that get tangled: whether the course is right for you, and how to have the conversation at home. Both are workable, but they need different thinking, and trying to solve them together is what makes it feel impossible.'],
      ['Will my college know?', 'No. This is entirely outside your institution &mdash; nothing goes to a college counselling cell, a warden or your attendance record, and a first name is enough to book.'],
      ['I am an international student in Pune. Can I book?', 'Yes. Sessions are online and run in English or Hindi. Being far from home in a country that is not yours adds a genuine layer to all of this, and it is a reasonable thing to bring to a session rather than something to push through.'],
    ],
  },
  {
    slug: 'mental-health-counselling-jaipur.html',
    city: 'Jaipur', region: 'IN-RJ', state: 'Rajasthan',
    careerPage: 'career-counselling-in-jaipur.html',
    lede: 'A state where the coaching route is treated as the only route, and where saying it is not working is genuinely difficult. Confidential 1:1 support across Jaipur and Rajasthan &mdash; online, in Hindi or English.',
    hindi: 'Ek exam aapki poori kahani nahi hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Rajasthan's relationship with competitive exams is unlike anywhere else in India. Kota, two hundred and fifty kilometres from Jaipur, is the national centre of entrance coaching, and the culture around it reaches every family in the state. A great many Jaipur students either go to Kota, come back from Kota, or grow up being measured against cousins who did.</p>
    <p>That produces a very specific difficulty: the route is so socially established that stepping off it reads as failure rather than as a choice. A student who is struggling has no available language for it that does not sound like giving up, and so continues in silence &mdash; often through a drop year, sometimes through two.</p>
    <p>The dropper year deserves its own mention. It is isolating in a way that people outside it consistently underestimate: your school friends have moved on to colleges and new lives, your days have no structure but study, and every conversation with a relative is an implicit progress review.</p>`,
    why: `<p>Jaipur has psychiatry at SMS Medical College and its associated hospitals, and reasonable private options. Those matter for clinical need.</p>
    <p>The gap here is not clinical care but a confidential place to say the sentence that is hardest to say in Rajasthan: this is not working, and I do not know whether to continue. That sentence has consequences inside a family and a peer group, which is exactly why it needs somewhere neutral first.</p>
    <p>Sessions here are online, nothing is reported to anyone, and a first session is &#8377;249.</p>`,
    concerns: [
      ['&#128218;', 'Coaching and Kota pressure', 'A route so established that leaving it reads as failure rather than as a decision.'],
      ['&#128337;', 'Drop year isolation', 'Days without structure, friends who moved on, and every family conversation a progress review.'],
      ['&#128201;', 'Repeated attempts', 'The particular weight of a second or third attempt, and what it starts to mean about you.'],
      ['&#128106;', 'Family expectation', 'Wanting to say it is not working, in a household where that sentence has consequences.'],
    ],
    faq: [
      ['I am in a drop year and it is going badly. Is that worth a session?', 'Yes, and it is one of the most common reasons students in Rajasthan book. The drop year is isolating in a way people outside it underestimate, and most of the difficulty is that structure and company have disappeared at the same time, not that you lack discipline.'],
      ['I want to stop preparing but cannot say so at home. Can counselling help?', 'That is squarely the kind of thing a session is for. It usually helps to work out what you actually want before working out how to say it &mdash; those are two separate problems, and trying to solve them at once is what makes it feel unsayable.'],
      ['Will my parents or my coaching institute be told?', 'No. Nothing goes to your family, your institute or anyone else, and you can book using a first name only. If you are under 18, a parent does need to consent to a paid session, but what you discuss stays confidential.'],
      ['Is the session in Hindi?', 'Yes if you want it to be. Hindi or English, whichever you think in &mdash; and for most students in Rajasthan the difficult things are much easier to reach in Hindi.'],
    ],
  },
  {
    slug: 'mental-health-counselling-chandigarh.html',
    city: 'Chandigarh', region: 'IN-CH', state: 'Chandigarh, Punjab &amp; Haryana',
    careerPage: 'career-counselling-in-chandigarh.html',
    lede: 'A small city where word travels, and where being seen walking into a clinic is its own deterrent. Confidential 1:1 support across Chandigarh, Mohali and Panchkula &mdash; online, in Hindi, English or Punjabi-friendly conversation.',
    hindi: 'Gal karn naal farak painda hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Chandigarh is small, well-connected and socially dense in a way the big metros are not. Families know each other, neighbourhoods are stable, and the same names come up across schools, clubs and offices. That is pleasant in most respects and a genuine obstacle in one: privacy is hard, and the risk of being seen is a real reason people do not seek help here.</p>
    <p>The regional context adds two things. First, a strong culture of appearing to be doing well &mdash; distress is something you manage at home rather than discuss. Second, the long shadow of migration: an enormous number of families in the tricity have a child abroad or preparing to go, and the pressure around IELTS, visas and the money committed to that route is a distinctive local stressor. So is what happens when that plan fails, or when the child who went is struggling alone overseas.</p>
    <p>There is also a substantial student population across Panjab University and the Mohali belt, with the ordinary academic and first-independence pressures.</p>`,
    why: `<p>Chandigarh has PGIMER, whose department of psychiatry is among the strongest in the country. For diagnosis and serious clinical need, the tricity is better served than most of India.</p>
    <p>But being well served clinically does not solve the visibility problem, and in a city this size that problem is decisive. People describe not going precisely because of who might see them in the corridor.</p>
    <p>Sessions here are online, which removes that entirely &mdash; there is no building to be seen entering. A first session is &#8377;249.</p>`,
    concerns: [
      ['&#128064;', 'Being seen, and word travelling', 'A city small enough that walking into a clinic is itself a deterrent.'],
      ['&#9992;', 'Migration and IELTS pressure', 'The money and expectation committed to going abroad, and what happens when it does not work.'],
      ['&#127968;', 'Family reputation and appearance', 'A strong local script that distress is managed at home rather than discussed.'],
      ['&#127891;', 'University and first independence', 'Academic pressure and the ordinary difficulty of becoming a separate person.'],
    ],
    faq: [
      ['Chandigarh is small and I do not want to be seen. Is this really private?', 'Yes, and it is the main reason people here choose an online session. There is no clinic, no waiting room and no building to be seen entering. Nothing is reported to anyone, and you can book using a first name only.'],
      ['Can we talk in Punjabi?', 'Sessions run in Hindi or English. If Punjabi is the language you think in, say so at the start &mdash; a lot can be accommodated in how a session runs, and it is better to raise it than to work in a language that keeps the difficult things at arm\'s length.'],
      ['My child has gone abroad and is struggling. Can we get help from here?', 'Yes. A parent session is a reasonable place to start, and your child can also book independently &mdash; sessions are online, so distance is not an obstacle. Struggling alone overseas is common and rarely mentioned home in full.'],
      ['How is this different from PGIMER?', 'Different purpose. PGIMER is a major clinical institution and the right place for psychiatric assessment and serious need. This is non-diagnostic counselling support &mdash; conversations for people who are struggling but not ill, without a referral, a waiting list, or a corridor.'],
    ],
  },
  {
    slug: 'mental-health-counselling-lucknow.html',
    city: 'Lucknow', region: 'IN-UP', state: 'Uttar Pradesh',
    careerPage: 'career-counselling-in-lucknow.html',
    lede: 'A government-exam city, where preparation can stretch across years and the waiting is its own weight. Confidential 1:1 support across Lucknow and Uttar Pradesh &mdash; online, in Hindi or English.',
    hindi: 'Intezaar lamba ho sakta hai, akela nahi hona chahiye. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Lucknow's dominant stressor is the government-exam route, and the thing that makes it distinctive is duration. UPSC, UPPSC, SSC, banking and police recruitment draw aspirants from across UP, and preparation is frequently measured in years rather than months. Vacancies get delayed, exams get postponed, results get litigated, and an aspirant can lose a year to circumstances entirely outside their control.</p>
    <p>That produces a psychological situation that is genuinely unusual: sustained effort with no feedback, no visible progress and no defined endpoint. Ordinary coping strategies assume you can see whether you are getting closer. Here you often cannot, sometimes for years, while everyone around you gradually moves into jobs, marriages and independence.</p>
    <p>The social weight is heavy too. In many families the aspirant is carrying a collective hope, and the longer preparation runs, the more expensive it becomes to say that it might not work.</p>`,
    why: `<p>Lucknow has real clinical capacity &mdash; psychiatry at King George's Medical University, and at the RML institute &mdash; and those are the right places for diagnosis and serious need.</p>
    <p>The aspirant's difficulty is usually not clinical. It is years of uncertainty, isolation and unspoken family expectation, which is precisely the sort of thing that goes unaddressed because it does not look like an illness. It simply looks like preparing.</p>
    <p>Sessions here are online, private, and a first session is &#8377;249.</p>`,
    concerns: [
      ['&#128220;', 'Long-horizon exam preparation', 'Years of effort with no feedback, no visible progress and no defined endpoint.'],
      ['&#8987;', 'Delays outside your control', 'Postponed exams and disputed results, and a year lost to neither effort nor failure.'],
      ['&#128106;', 'Carrying a family\'s hope', 'Preparation that has become collective, and gets more expensive to question each year.'],
      ['&#128128;', 'Watching peers move on', 'Friends entering jobs and marriages while your life stays deliberately on hold.'],
    ],
    faq: [
      ['I have been preparing for years and feel stuck. Is that a mental health issue?', 'It does not have to be a disorder to be worth talking about. Sustained uncertainty with no feedback is a genuinely difficult psychological situation, and it wears people down in ways that look like laziness or lost motivation from the outside and feel very different from the inside.'],
      ['Everyone in my family is counting on this. Can I even talk about stopping?', 'Yes, and a session is a reasonable place to do it, precisely because it is outside the family. It is usually worth working out what you actually think before working out what to say at home &mdash; those are separate problems.'],
      ['Is the session in Hindi?', 'Yes if you want it to be. Hindi or English, whichever you think in. For most aspirants in UP that is Hindi, and there is no reason a session should run in the harder language.'],
      ['I cannot afford much. What does it cost?', 'A first session is &#8377;249 with code FIRST50, and sessions after that are &#8377;499 for 45 minutes. That is deliberately well below typical private counselling rates, which commonly run &#8377;1,500&ndash;&#8377;3,000, because affordability is exactly what stops aspirants getting support.'],
    ],
  },

];
