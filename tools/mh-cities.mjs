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
 * "why here" prose and its own FAQ answers. If a new city can’t be given real local
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
    lede: 'Entrance exams, coaching timetables, and a city where a young person is never more than one conversation away from being ranked against somebody. Private 1:1 support, online, in Hindi or English.',
    hindi: 'Baat karna kamzori nahi, samajhdari hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Delhi puts two things in the same few kilometres: a lot of very selective institutions, and a lot of families who moved here so their child could get into one. DU cut-offs, the CUET scramble, the civil services coaching belts around Mukherjee Nagar and Rajinder Nagar, NEET and JEE hanging over everything.</p>
    <p>Two stories come up over and over in sessions. One is the aspirant in a rented room with no family nearby, where a bad month has nobody in it. The isolation does more harm than the syllabus ever does. The other is the student whose family has visibly given things up to fund this, who has quietly decided that struggling would be ungrateful. So they say nothing.</p>`,
    why: `<p>Delhi is better served than most cities. Psychiatry at AIIMS, and IHBAS in Dilshad Garden, one of the big public mental health institutions in the country. If you need a psychiatric assessment, or things are severe, go there.</p>
    <p>Neither is built for the much larger group who aren’t ill but are struggling anyway. The student who can’t make themselves open the book. The aspirant on a third attempt. The twenty-six-year-old who has stopped enjoying anything and can’t say why. Public psychiatry has waiting lists and a clinical threshold you’ve to cross first. Private therapy here runs &#8377;1,500 to &#8377;3,000 a session, which for a student means asking a parent for the money, which for a lot of them means not going.</p>
    <p>Sessions here happen online, so nobody sees you turn up, and the first one is &#8377;249.</p>`,
    concerns: [
      ['&#127891;', 'Coaching and entrance pressure', 'NEET, JEE, CUET and civil services preparation &mdash; including the particular weight of a second or third attempt.'],
      ['&#127968;', 'Living away from family', 'PG rooms and rented flats in the coaching belts, where a bad month has nobody in it.'],
      ['&#128200;', 'DU admission and cut-off stress', 'The narrow window between a board result and a place, and what it feels like to miss it.'],
      ['&#128149;', 'Family expectation and guilt', 'Struggling in a household that has visibly sacrificed, and reading that as a reason to stay quiet.'],
    ],
    faq: [
      ['Do I have to travel anywhere in Delhi for a session?', 'No. Sessions are online by video, voice or chat, so there’s no clinic to reach across the city and no waiting room to sit in. For most people in Delhi that’s the point &mdash; the traffic is a real barrier, and so is being seen.'],
      ['Is this available in Hindi?', 'Yes. Hindi or English, whichever you actually think in. For a lot of people in Delhi, describing what’s going on is much easier in Hindi even when their working life runs in English.'],
      ['I am preparing for UPSC and can’t afford time away. Is one session useful?', 'Yes, and one is genuinely a reasonable amount to start with. Forty-five minutes, online, at a slot you pick. A great deal of aspirant distress is about isolation and the arithmetic of attempts rather than about the syllabus, and that’s workable in a single conversation.'],
      ['Will my parents find out?', 'No. Nothing is reported to your parents, and you can book using a first name only. This is the most common question we are asked in Delhi and the answer doesn’t have caveats attached to it, beyond the standard limit where there’s serious risk to life.'],
    ],
  },
  {
    slug: 'mental-health-counselling-gurugram.html',
    city: 'Gurugram', region: 'IN-HR', state: 'Haryana',
    careerPage: 'career-counselling-in-gurugram.html',
    lede: 'Long hours, longer commutes, and offices where being exhausted reads as being committed. Private 1:1 support for professionals, students and parents in Gurugram. Online, Hindi or English.',
    hindi: 'Thak jaana normal hai. Har roz thakna nahi. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Most of Gurugram moved here for work in the last ten years. That does something specific: the support people normally lean on, family down the road, school friends, neighbours who’ve known you a while, just isn’t there. The people around you’re colleagues. Colleagues are also who you’re measured against.</p>
    <p>What comes out of that’s a familiar shape of strain. Demands high, pay reasonable, control low, support thin, recovery basically absent. Add two hours of commute and rent that makes quitting feel dangerous, and you get people who aren’t in crisis but have been running years past what they could keep up.</p>
    <p>The other Gurugram story is the parent on those hours who’s worried about a teenager they barely see on weekdays, and genuinely can’t tell if what they’re seeing is normal fifteen or something else.</p>`,
    why: `<p>Plenty of offices across Cyber City and Golf Course Road run wellness programmes, and some are good. The catch people describe is trust. Whatever the confidentiality policy says, it’s hard to speak freely to a counsellor your employer arranged when the thing you want to talk about is your manager, or the fact that you’re thinking of leaving.</p>
    <p>This sits outside all of that. Online, &#8377;249 for a first session, and nothing reaches your company, because your company was never part of it.</p>`,
    concerns: [
      ['&#128293;', 'Burnout and workplace strain', 'Exhaustion that sleep doesn’t fix, Sunday-evening dread, effort that stopped feeling like it counts.'],
      ['&#127968;', 'Isolation after relocating', 'Building a life in a city where everyone you know is a colleague.'],
      ['&#128337;', 'Commute and boundary collapse', 'Work that reaches you at any hour, and a day with no genuinely unreachable window in it.'],
      ['&#128106;', 'Parenting on corporate hours', 'Worrying about a teenager you mostly see at weekends, and not knowing what’s normal.'],
    ],
    faq: [
      ['Will my employer know I booked a session?', 'No. This is completely independent of any corporate wellness programme &mdash; your company isn’t involved, isn’t billed, and isn’t told. You can book using a first name only.'],
      ['Can I do a session outside office hours?', 'Yes. You pick your own slot from the live calendar, and evening and weekend times are available. Sessions are online, so there’s no commute added to your day.'],
      ['My problem is genuinely my workload. Can counselling fix that?', 'It can’t change your workload, and it would be dishonest to claim otherwise. What it can help with is the part you do control &mdash; boundaries, what you want to ask for, how you’re reading the situation, and whether staying is the right call. Sometimes the honest conclusion is that the job is the problem.'],
      ['I am a parent in Gurugram worried about my teenager. Where do I start?', 'A parent session is a reasonable first step, and it doesn’t require your child to agree to anything. It is often more useful than pushing a reluctant teenager into a room. Our guide <a href="for-parents.html">for parents</a> covers the signs worth taking seriously.'],
    ],
  },
  {
    slug: 'mental-health-counselling-noida.html',
    city: 'Noida', region: 'IN-UP', state: 'Uttar Pradesh',
    careerPage: 'career-counselling-in-noida.html',
    lede: 'A student city and a shift-work city at once. Private 1:1 support for students, hostellers and people working nights across Noida and Greater Noida. Online, Hindi or English.',
    hindi: 'Akela lagna aam hai, par akela rehna zaroori nahi. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Two very different groups share this postcode. One is students. The private university belt through Greater Noida pulls young people from across UP, Bihar, Jharkhand and the north-east, most of them living away from home for the first time, plenty of them still adjusting to studying in a language that isn’t the one they think in.</p>
    <p>In first year that shows up as homesickness nobody mentions, because each of them has decided they’re the only one feeling it. Later it gets quieter and worse. Two semesters of failed papers, a student who has stopped telling their family anything, and a widening gap between what home believes and what’s going on.</p>
    <p>The other group works in IT and BPO, and night shifts do something to mental health that gets badly underrated. Months of sleeping against your body clock drags mood down and pushes anxiety up on its own. It cuts you off socially at the same time, because your free hours are everybody else’s working ones.</p>`,
    why: `<p>Most campuses here have a counselling cell and it’s a reasonable thing to use. What students hesitate over usually isn’t the counsellor. It’s that the cell sits inside the same institution that decides your attendance, your grades, and what gets said to your parents. That closeness is enough to make people edit themselves.</p>
    <p>This sits outside all of it. Nothing reaches your college, your warden or your family, and the first session is &#8377;249.</p>`,
    concerns: [
      ['&#127890;', 'Hostel and first-year adjustment', 'Homesickness, language shifts, and the specific loneliness of a room full of people.'],
      ['&#128220;', 'Backlogs and academic spiral', 'Failed papers, a widening gap with what home believes, and no obvious way back.'],
      ['&#127769;', 'Night shifts and body clock', 'Sleeping against your rhythm for months, and what that does to mood and worry.'],
      ['&#128241;', 'Distance from family', 'Managing a version of yourself on phone calls that no longer matches your life.'],
    ],
    faq: [
      ['Will my college or hostel warden be told?', 'No. This is entirely outside your institution &mdash; no attendance record, no note to a warden, nothing to a college counselling cell. You can book using a first name only.'],
      ['I have backlogs and my parents don’t know. Can I talk about that?', 'Yes, and it is one of the most common things students bring here. The academic problem and the problem of the growing gap with home are two different problems, and it usually helps to separate them before deciding anything.'],
      ['I work night shifts. Can I get a session that fits?', 'Yes &mdash; you pick your own slot, and daytime slots that suit a night-shift schedule are available. Worth saying that the shift pattern itself is often part of what’s going on, and that’s a legitimate thing to work on rather than just accept.'],
      ['Is it available in Hindi?', 'Yes, Hindi or English. A lot of students in Noida study in English and think in Hindi, and there’s no reason a session should run in the harder language.'],
    ],
  },
  {
    slug: 'mental-health-counselling-mumbai.html',
    city: 'Mumbai', region: 'IN-MH', state: 'Maharashtra',
    careerPage: 'career-counselling-in-mumbai.html',
    lede: 'A city that rewards endurance and almost never asks what it costs you. Private 1:1 support for students, professionals and families across Mumbai and the MMR. Online, in Hindi or English.',
    hindi: 'Sab kuch sambhaal lena hi taakat nahi hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>What Mumbai adds is a shortage of time and a shortage of space. Two hours each way is a normal commute. A flat shared with three generations is a normal flat. Between them, a lot of people here have nowhere to be alone and not one hour that belongs to them. Distress that would surface somewhere else gets folded into a day with no room to notice it.</p>
    <p>Then there’s the local script about coping. Mumbai’s picture of itself is a city that keeps going, and it does, and that’s worth something. It also slides easily into the belief that struggling means you personally lacked stamina. People turn up to a first session having already decided they should have managed this on their own.</p>
    <p>For students it runs along the HSC and CET calendar, the medical and engineering funnel, and a tight cluster of colleges where the gap between two of them gets treated as the gap between two entire lives.</p>`,
    why: `<p>Some of the best psychiatric care in India is in Mumbai’s public hospitals. KEM and Sion among them, and TISS has been serious about mental health work in this city for decades. If you need a psychiatric assessment, those are the right doors to knock on.</p>
    <p>Harder to find is an unhurried conversation when you aren’t ill. Private therapy here is about the most expensive in the country, and public services quite rightly go to the people who are worst off. That leaves the middle, struggling but functioning, not in crisis, which is where most people actually live, with the least available to them.</p>
    <p>Sessions run online, which takes the commute out of it entirely, and the first is &#8377;249.</p>`,
    concerns: [
      ['&#128649;', 'Commute and time poverty', 'Days with no hour that belongs to you, and distress that never gets a chance to surface.'],
      ['&#127968;', 'No private space at home', 'Living closely with family, and having nowhere to fall apart or even to think.'],
      ['&#128176;', 'Financial pressure and rent', 'The particular anxiety of a city where staying costs more than most people earn comfortably.'],
      ['&#127891;', 'HSC, CET and college competition', 'A narrow funnel treated as though it decides everything that follows.'],
    ],
    faq: [
      ['Do I have to travel for a session?', 'No, and in Mumbai that’s often the deciding factor. Sessions are online by video, voice or chat, so a session costs you forty-five minutes rather than forty-five minutes plus three hours of travel.'],
      ['I share a home and have no privacy. How do people manage a session?', 'Most commonly by voice or chat rather than video, with headphones, from wherever is workable &mdash; including a parked car or an office meeting room. It is a very common constraint here and it’s worth saying up front rather than deciding a session is impossible.'],
      ['Can we talk in Marathi?', 'Sessions run in Hindi or English. If Marathi is the language you think in, it’s worth saying so at the start &mdash; a lot can be accommodated in how a session is run, and it is better to raise it than to work in a language that makes the difficult parts harder to reach.'],
      ['Is &#8377;249 really the full cost of a first session?', 'Yes, for a 45-minute first session with code FIRST50; sessions after that are &#8377;499. Mumbai private therapy commonly runs several times that, which is exactly why this is priced the way it is.'],
    ],
  },
  {
    slug: 'mental-health-counselling-bangalore.html',
    city: 'Bangalore', region: 'IN-KA', state: 'Karnataka',
    careerPage: 'career-counselling-in-bangalore.html',
    lede: 'Full of people who came here for the work, quietly measuring themselves against everyone who came earlier. Private 1:1 support across Bengaluru. Online, Hindi or English.',
    hindi: 'Sabke saath rehkar bhi akela lagna aam hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>The pressure here is comparison, inside a peer group that happens to be exceptional. When everyone around you is an engineer, a founder, or someone whose company just closed a round, a perfectly good career starts feeling like falling behind. Very capable people sit down for a first session convinced they’re failing, on evidence that wouldn’t survive five minutes of scrutiny.</p>
    <p>Startups sharpen it. Equity that might be worth nothing, runway measured in months, and a culture where total absorption is the floor rather than the ceiling. High stakes, little control, and no point at which anyone tells you it’s fine to stop. Layoff cycles added a background hum of insecurity that people keep to themselves, because saying it out loud feels like conceding something.</p>
    <p>Under the tech story sits a large student population. Engineering, design and management colleges pulling people in from across the south and well beyond, with the same first-year isolation any move produces.</p>`,
    why: `<p>NIMHANS is here, and it’s the leading mental health and neurosciences institution in the country. For a psychiatric assessment or anything serious, that’s where to go, and having it in the city changes what’s available in a real way.</p>
    <p>One side effect is that the local conversation about mental health leans clinical. That leaves out the much bigger group whose problem isn’t a disorder at all. The engineer who’s stopped enjoying anything. The founder who can’t switch off. The student who looks fine on paper and is doing badly everywhere else.</p>
    <p>This is for them. Online, and &#8377;249 for a first session.</p>`,
    concerns: [
      ['&#128200;', 'Comparison and impostor feelings', 'Measuring an ordinary good career against an unusually high-achieving peer group.'],
      ['&#128293;', 'Startup and tech burnout', 'High stakes, low control, and no defined point at which you’re allowed to stop.'],
      ['&#128683;', 'Job insecurity and layoff anxiety', 'Background dread that people manage privately because naming it feels like weakness.'],
      ['&#127968;', 'Isolation after relocating', 'A full calendar, a wide network, and nobody you can call at two in the morning.'],
    ],
    faq: [
      ['How is this different from going to NIMHANS?', 'Different purpose. NIMHANS is a major clinical institution and the right place for psychiatric assessment, diagnosis and severe or complex need. This is non-diagnostic counselling support &mdash; unhurried conversations for people who are struggling but not ill. If what you describe needs psychiatric care, we will say so.'],
      ['I have a demanding job. Are there slots outside work hours?', 'Yes. You pick your own slot, and evening and weekend times are available. Sessions are online, so no commute is added to a day that probably has enough in it.'],
      ['Everyone around me seems to be doing better. Is that worth a session?', 'Yes, and it is one of the most common things people bring here. Comparison inside a high-achieving peer group is a genuine and specific difficulty, not a trivial one, and it responds well to being examined out loud with someone who isn’t in that peer group.'],
      ['Will my employer or my team know?', 'No. This is independent of any corporate wellness programme &mdash; your employer isn’t involved, not billed and not told, and a first name is enough to book.'],
    ],
  },
  {
    slug: 'mental-health-counselling-hyderabad.html',
    city: 'Hyderabad', region: 'IN-TG', state: 'Telangana',
    careerPage: 'career-counselling-in-hyderabad.html',
    lede: 'Intermediate colleges run like factories, and an IT corridor that never really shuts. Private 1:1 support across Hyderabad and Secunderabad. Online, Hindi or English.',
    hindi: 'Marks se zyada zaroori aap hain. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Hyderabad runs one of the hardest adolescent academic environments in the country. The Intermediate corporate-college system, integrated EAMCET, JEE and NEET coaching, residential campuses, days that start before dawn and finish after dark. Two years of being a teenager compressed into one long ranking exercise. There has been repeated public concern in this state about student suicides in that system, and for families here it isn’t an abstract worry.</p>
    <p>The damage doesn’t come from the studying. It comes from everything the studying pushes out. Sleep. Unstructured time. Friendships that aren’t also competition. Any sense of yourself that isn’t academic. Tell a sixteen-year-old for two years that their worth is a rank, and when the rank turns up short, they have nothing left to answer with.</p>
    <p>Next to that sits HITEC City and the pharma corridor, carrying the long-hours, low-control strain you’d find in any Indian IT hub, plus a large relocated workforce supporting families they live hundreds of kilometres from.</p>`,
    why: `<p>The Institute of Mental Health at Erragadda is here, one of the older public psychiatric hospitals in India, and there’s good private psychiatry too. For clinical need, those are the right places.</p>
    <p>What families usually need first is something else. One person who isn’t the college, isn’t the family and isn’t keeping score, who a teenager can tell the real version to. Inside a residential Intermediate campus there’s often nobody at all in that category.</p>
    <p>Sessions run online, nothing goes back to a college, and the first is &#8377;249.</p>`,
    concerns: [
      ['&#128218;', 'Intermediate and integrated coaching load', 'Residential campuses, pre-dawn schedules, and two years with everything non-academic removed.'],
      ['&#128201;', 'Rank identity and result collapse', 'Being told your worth is a number, and then receiving the number.'],
      ['&#128105;&#8205;&#128187;', 'IT corridor strain', 'Long hours and low control in HITEC City, often while supporting family elsewhere.'],
      ['&#128106;', 'Parents who can’t read the signs', 'Knowing something is wrong with your child and not knowing what’s normal for this system.'],
    ],
    faq: [
      ['My child is in a residential Intermediate college. Can they have a session?', 'Yes, online, at a slot outside college hours. If your child is under 18 you’ll need to consent as a parent, but the content of the session stays between your child and the counsellor &mdash; that confidentiality is what makes it useful to them.'],
      ['I am a parent and my child refuses to talk to anyone. What can I do?', 'Book a parent session for yourself. It is often more productive than pushing a resistant teenager into a room, and it doesn’t require their agreement. Much of the useful work in these situations is about how the conversation at home is being held.'],
      ['Will the college be told?', 'No. Nothing is reported to a college, a hostel or a coaching institute. This sits entirely outside that system, which for a student inside it is usually the whole point.'],
      ['We are worried about our child but it isn’t an emergency. Is a session still appropriate?', 'Yes, and earlier is better. Most of what helps is available well before a crisis. If it ever does become urgent &mdash; talk of self-harm, or immediate distress &mdash; call Tele-MANAS on 14416 straight away rather than waiting for a session.'],
    ],
  },

  {
    slug: 'mental-health-counselling-pune.html',
    city: 'Pune', region: 'IN-MH', state: 'Maharashtra',
    careerPage: 'career-counselling-in-pune.html',
    lede: 'Every June this city fills up with students who have just left home for the first time. Private 1:1 support across Pune. Online, Hindi or English.',
    hindi: 'Ghar se door hona aasaan nahi hota. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>The thing about Pune is that most of its young population came from somewhere else. The colleges pull students in from across Maharashtra, the north-east, Bihar, the Gulf and a good deal of Africa, and every June tens of thousands of eighteen-year-olds land in a rented room in a city they don’t know.</p>
    <p>First year follows a pattern you could set a clock by. A few intense weeks, then a dip around the second month when the novelty wears off and it becomes obvious that nobody here really knows you. Almost everyone goes through it. Almost nobody mentions it, because each of them has concluded that everyone else settled in fine.</p>
    <p>The second pattern is more of a Pune speciality. A student on a course their family chose and is paying for from another city, who worked out during the first semester that it’s wrong for them, and now has to weigh their own life against that money.</p>`,
    why: `<p>There’s good private psychiatry in Pune and a long civil-society tradition around mental health. People have been talking about this publicly here for longer than in most of the country. Sassoon covers the public need.</p>
    <p>But a first-year student a long way from home rarely needs clinical care. What they need is one person who isn’t a parent, isn’t a roommate and isn’t attached to the college, who they can give the unedited version to. Small thing. Surprisingly hard to find when you’re eighteen in a new city.</p>
    <p>Sessions run online, nothing goes to a college or to your family, and the first is &#8377;249.</p>`,
    concerns: [
      ['&#127962;', 'First-year adjustment and homesickness', 'The second-month dip nobody admits to because everyone assumes they’re alone in it.'],
      ['&#128218;', 'Wrong course, family investment', 'Realising a course doesn’t fit when someone else is paying for it from another city.'],
      ['&#128172;', 'Language and belonging', 'Arriving from another state or country and reading the room in an unfamiliar language.'],
      ['&#128149;', 'Relationships and first heartbreak', 'A breakup a thousand kilometres from anyone who has known you longer than a year.'],
    ],
    faq: [
      ['I only moved here two months ago and feel awful. Is that normal?', 'Extremely. The dip around the second month is close to universal and it isn’t a sign that you’ve chosen wrongly or can’t cope. It’s worth talking about precisely because everyone experiences it privately and concludes they’re the only one.'],
      ['My family is paying for a course I don’t want to continue. Where do I even start?', 'Usually by separating two questions that get tangled: whether the course is right for you, and how to have the conversation at home. Both are workable, but they need different thinking, and trying to solve them together is what makes it feel impossible.'],
      ['Will my college know?', 'No. This is entirely outside your institution &mdash; nothing goes to a college counselling cell, a warden or your attendance record, and a first name is enough to book.'],
      ['I am an international student in Pune. Can I book?', 'Yes. Sessions are online and run in English or Hindi. Being far from home in a country that isn’t yours adds a genuine layer to all of this, and it is a reasonable thing to bring to a session rather than something to push through.'],
    ],
  },
  {
    slug: 'mental-health-counselling-jaipur.html',
    city: 'Jaipur', region: 'IN-RJ', state: 'Rajasthan',
    careerPage: 'career-counselling-in-jaipur.html',
    lede: 'A state where coaching is treated as the only route, and saying it isn\'t working is genuinely hard. Private 1:1 support across Jaipur and Rajasthan. Online, Hindi or English.',
    hindi: 'Ek exam aapki poori kahani nahi hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Nowhere else in India has quite Rajasthan’s relationship with competitive exams. Kota is two hundred and fifty kilometres up the road, it’s the national centre of entrance coaching, and the culture around it reaches into every family in the state. Most Jaipur students either go to Kota, come back from Kota, or grow up being measured against a cousin who did.</p>
    <p>That creates a particular trap. The route is so well established socially that stepping off it looks like failing rather than choosing. A student who’s struggling has no way to say so that doesn’t sound like giving up. So they don’t say it. They carry on, often through a drop year, sometimes two.</p>
    <p>The drop year deserves its own paragraph. People outside it badly underestimate how isolating it is. School friends have gone off to colleges and new lives, your days have no shape except studying, and every conversation with a relative turns into a progress review you didn’t ask for.</p>`,
    why: `<p>There’s psychiatry at SMS Medical College and its associated hospitals, plus reasonable private options. Those matter when the need is clinical.</p>
    <p>The gap isn’t clinical care. It’s somewhere private to say the sentence that’s hardest to say in Rajasthan: this isn’t working and I don’t know if I should keep going. Say that in a family or a friend group and it has consequences. That’s the whole reason it needs somewhere neutral first.</p>
    <p>Sessions run online, nothing goes to anyone, and the first is &#8377;249.</p>`,
    concerns: [
      ['&#128218;', 'Coaching and Kota pressure', 'A route so established that leaving it reads as failure rather than as a decision.'],
      ['&#128337;', 'Drop year isolation', 'Days without structure, friends who moved on, and every family conversation a progress review.'],
      ['&#128201;', 'Repeated attempts', 'The particular weight of a second or third attempt, and what it starts to mean about you.'],
      ['&#128106;', 'Family expectation', 'Wanting to say it isn’t working, in a household where that sentence has consequences.'],
    ],
    faq: [
      ['I am in a drop year and it is going badly. Is that worth a session?', 'Yes, and it is one of the most common reasons students in Rajasthan book. The drop year is isolating in a way people outside it underestimate, and most of the difficulty is that structure and company have disappeared at the same time, not that you lack discipline.'],
      ['I want to stop preparing but can’t say so at home. Can counselling help?', 'That is squarely the kind of thing a session is for. It usually helps to work out what you actually want before working out how to say it &mdash; those are two separate problems, and trying to solve them at once is what makes it feel unsayable.'],
      ['Will my parents or my coaching institute be told?', 'No. Nothing goes to your family, your institute or anyone else, and you can book using a first name only. If you’re under 18, a parent does need to consent to a paid session, but what you discuss stays confidential.'],
      ['Is the session in Hindi?', 'Yes if you want it to be. Hindi or English, whichever you think in &mdash; and for most students in Rajasthan the difficult things are much easier to reach in Hindi.'],
    ],
  },
  {
    slug: 'mental-health-counselling-chandigarh.html',
    city: 'Chandigarh', region: 'IN-CH', state: 'Chandigarh, Punjab &amp; Haryana',
    careerPage: 'career-counselling-in-chandigarh.html',
    lede: 'Small enough that word travels, and that being seen walking into a clinic puts people off going at all. Private 1:1 support across Chandigarh, Mohali and Panchkula. Online, Hindi or English.',
    hindi: 'Gal karn naal farak painda hai. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>Chandigarh is small and socially dense in a way the big metros aren’t. Families know each other, neighbourhoods stay put, and the same names turn up across schools, clubs and offices. Mostly that’s pleasant. In one respect it’s a problem: privacy is hard here, and being seen is a real reason people don’t get help.</p>
    <p>Two things come with the region. One is a strong habit of appearing fine. Distress is something you handle at home, not something you discuss. The other is migration. An enormous number of tricity families have a child abroad or getting ready to go, and the pressure around IELTS, visas and the money already committed is its own local stressor. So is what happens when the plan falls through, or when the child who went is struggling alone on the other side of the world.</p>
    <p>There’s a sizeable student population too, across Panjab University and the Mohali belt, carrying the usual academic pressure and the usual business of becoming your own person.</p>`,
    why: `<p>PGIMER is here, and its psychiatry department is among the strongest in India. For diagnosis and serious clinical need, the tricity is better served than most of the country.</p>
    <p>Being well served clinically doesn’t fix the visibility problem though, and in a city this size that problem decides things. People tell us they didn’t go because of who might see them in the corridor.</p>
    <p>Online sessions take that away completely. There’s no building for anyone to see you walk into. First session is &#8377;249.</p>`,
    concerns: [
      ['&#128064;', 'Being seen, and word travelling', 'A city small enough that walking into a clinic is itself a deterrent.'],
      ['&#9992;', 'Migration and IELTS pressure', 'The money and expectation committed to going abroad, and what happens when it doesn’t work.'],
      ['&#127968;', 'Family reputation and appearance', 'A strong local script that distress is managed at home rather than discussed.'],
      ['&#127891;', 'University and first independence', 'Academic pressure and the ordinary difficulty of becoming a separate person.'],
    ],
    faq: [
      ['Chandigarh is small and I don’t want to be seen. Is this really private?', 'Yes, and it is the main reason people here choose an online session. There is no clinic, no waiting room and no building to be seen entering. Nothing is reported to anyone, and you can book using a first name only.'],
      ['Can we talk in Punjabi?', 'Sessions run in Hindi or English. If Punjabi is the language you think in, say so at the start &mdash; a lot can be accommodated in how a session runs, and it is better to raise it than to work in a language that keeps the difficult things at arm\'s length.'],
      ['My child has gone abroad and is struggling. Can we get help from here?', 'Yes. A parent session is a reasonable place to start, and your child can also book independently &mdash; sessions are online, so distance isn’t an obstacle. Struggling alone overseas is common and rarely mentioned home in full.'],
      ['How is this different from PGIMER?', 'Different purpose. PGIMER is a major clinical institution and the right place for psychiatric assessment and serious need. This is non-diagnostic counselling support &mdash; conversations for people who are struggling but not ill, without a referral, a waiting list, or a corridor.'],
    ],
  },
  {
    slug: 'mental-health-counselling-lucknow.html',
    city: 'Lucknow', region: 'IN-UP', state: 'Uttar Pradesh',
    careerPage: 'career-counselling-in-lucknow.html',
    lede: 'A government-exam city, where preparing can stretch across years and the waiting becomes its own weight. Private 1:1 support across Lucknow and UP. Online, Hindi or English.',
    hindi: 'Intezaar lamba ho sakta hai, akela nahi hona chahiye. &#128155;',
    pressure: `<h3>What the pressure looks like here</h3>
    <p>The government-exam route dominates here, and what makes it different is how long it goes on. UPSC, UPPSC, SSC, banking, police recruitment, drawing aspirants from all over UP, with preparation measured in years rather than months. Vacancies get delayed. Exams get postponed. Results end up in court. A year can disappear for reasons that have nothing to do with you.</p>
    <p>That’s an unusual thing to live inside. Sustained effort, no feedback, no visible progress, no date when it ends. Most ways of coping assume you can tell whether you’re getting closer. Here you often can’t, sometimes for years, while everyone you grew up with moves into jobs and marriages and their own flats.</p>
    <p>The social weight is heavy too. In a lot of families the aspirant is carrying everyone’s hope, and each year makes it more expensive to say out loud that this might not work.</p>`,
    why: `<p>There’s real clinical capacity in the city. Psychiatry at King George’s Medical University and at the RML institute, both right for diagnosis and serious need.</p>
    <p>What an aspirant is dealing with usually isn’t clinical though. It’s years of uncertainty, isolation and family expectation nobody says out loud. That kind of thing gets left alone because it doesn’t look like illness. It just looks like preparing.</p>
    <p>Sessions run online and stay private. First one is &#8377;249.</p>`,
    concerns: [
      ['&#128220;', 'Long-horizon exam preparation', 'Years of effort with no feedback, no visible progress and no defined endpoint.'],
      ['&#8987;', 'Delays outside your control', 'Postponed exams and disputed results, and a year lost to neither effort nor failure.'],
      ['&#128106;', 'Carrying a family\'s hope', 'Preparation that has become collective, and gets more expensive to question each year.'],
      ['&#128128;', 'Watching peers move on', 'Friends entering jobs and marriages while your life stays deliberately on hold.'],
    ],
    faq: [
      ['I have been preparing for years and feel stuck. Is that a mental health issue?', 'It doesn’t have to be a disorder to be worth talking about. Sustained uncertainty with no feedback is a genuinely difficult psychological situation, and it wears people down in ways that look like laziness or lost motivation from the outside and feel very different from the inside.'],
      ['Everyone in my family is counting on this. Can I even talk about stopping?', 'Yes, and a session is a reasonable place to do it, precisely because it is outside the family. It is usually worth working out what you actually think before working out what to say at home &mdash; those are separate problems.'],
      ['Is the session in Hindi?', 'Yes if you want it to be. Hindi or English, whichever you think in. For most aspirants in UP that’s Hindi, and there’s no reason a session should run in the harder language.'],
      ['I can’t afford much. What does it cost?', 'A first session is &#8377;249 with code FIRST50, and sessions after that are &#8377;499 for 45 minutes. That is deliberately well below typical private counselling rates, which commonly run &#8377;1,500&ndash;&#8377;3,000, because affordability is exactly what stops aspirants getting support.'],
    ],
  },

];
