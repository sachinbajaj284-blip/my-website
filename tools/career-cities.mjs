/* Content for the metro career-counselling city pages.
 *
 * These are the cross-fill of the mental-health city cluster: the metros already have
 * mental-health, online-therapy and condition pages, but career counselling was
 * Haryana-only. This table adds the eight big non-Haryana cities.
 *
 * It exists as data, not hand-written HTML, for the reason the mh-cities table spells
 * out: a hand-authored city cluster drifts into near-duplicates, and a cluster of
 * near-duplicates drags down the pages around it. So every city below carries its own
 * local picture — the boards and entrance exams that actually run there, the coaching
 * culture, the default path families reach for — and its own FAQ answers. The shared
 * shell (credentials, pricing, the DMIT stance, the booking flow) is identical because
 * it is identical on the existing hand-made pages too; the differentiation lives in the
 * local prose below.
 *
 * Nothing here invents a local Lume office: sessions are online and the practice is
 * based in Rohtak, which the shell states plainly. Institutions and exams are named
 * because those names are stable and checkable.
 */

export const CAREER_CITIES = [
  {
    key: 'delhi', city: 'Delhi', alt: null, region: 'IN-DL', state: 'Delhi',
    served: ['New Delhi', 'Delhi NCR'],
    lede: 'Delhi gives a student more options than almost anywhere in India — and more noise to go with them. DU and CUET, the coaching belts, the pull of a dozen "prestige" paths at once. Work 1:1 with a qualified M.Sc Clinical Psychologist to cut through it and find the path that actually fits, from home, in Hindi or English, starting at ₹499.',
    hindi: 'Options ke shor mein, ek clear aur honest disha. 🎯',
    subtitle: 'too much choice, and how to narrow it well',
    intro: [
      'Delhi is a city of options. Dozens of good colleges within an hour, CUET as the gateway to DU and the central universities, enormous coaching ecosystems for NEET, JEE and civil services, and a steady supply of people around you who seem certain about exactly what you should do. That abundance is a real advantage. It can also leave a student paralysed — chasing whatever sounds most impressive at a family gathering rather than the path that genuinely fits them.',
      'Career counselling, done properly, narrows that field with evidence instead of noise. Lume Live’s counsellors hold an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia, and take every session themselves, online, from our base in Rohtak. Before a family commits to a stream, a CUET subject combination or an expensive coaching lane, one structured conversation checks that the plan matches the student, not the neighbourhood.',
    ],
    covers: [
      '<strong>Stream selection after Class 10</strong> — decided on the student’s tested interests and aptitude, not on which choice sounds most impressive at a family gathering.',
      '<strong>The CUET &amp; course question after Class 12</strong> — DU and central-university combinations, NEET, JEE, CLAT, design, liberal arts, study abroad: which genuinely fits this student, with honest backups.',
      '<strong>Drop-year and course-change decisions</strong> — including the particular weight of a second or third attempt in the Mukherjee Nagar and Rajinder Nagar coaching belts.',
      '<strong>Exam stress and burnout</strong> — Delhi’s pressure produces plenty; our counsellors handle the emotional and career sides together. See our <a href="mental-health-counselling-delhi.html" style="color:var(--teal);font-weight:700">mental health counselling in Delhi</a>.',
    ],
    dmit: 'Delhi has no shortage of career-counselling franchises and aggregators, and some still sell fingerprint-based "DMIT" tests at a premium. DMIT has no standing in mainstream psychology and cannot measure interests, aptitude or personality. Lume Live uses only validated frameworks — <strong>Holland RIASEC</strong> (career interests), <strong>VARK</strong> (learning style) and a <strong>Career Values</strong> inventory — each explained in plain language before use.',
    who: 'Every Delhi enquiry reaches Lume Live’s own counselling team — never a franchise partner, never an outsourced call centre. That is the practical difference between Lume Live and the aggregator listings a "career counsellor in Delhi" search surfaces.',
    note: '<span class="hi">Ek aur coaching, ek aur package kaafi nahi</span> — the question is usually direction, not more effort. Counselling makes sure the time and the money are backing a path the student genuinely fits.',
    faq: [
      ['Is professional career counselling available in Delhi?', 'Yes. Lume Live provides online 1:1 career counselling for Delhi students and families, delivered by our own counsellors — M.Sc Clinical Psychology (Gurugram University), PGDGC (Jamia Millia Islamia). Sessions run over secure video call in Hindi and English, so the whole family can join from home anywhere in Delhi or NCR.'],
      ['How much does career counselling cost in Delhi?', 'The first 45-minute session is ₹499. A free 60-second Career Snapshot is available with no payment, and the optional ₹999 Full Clarity Report adds a detailed psychometric profile before your session — far more affordable than the DMIT and franchise packages common across Delhi.'],
      ['How is this different from the expensive career packages in Delhi?', 'Delhi is full of franchises and aggregators, some charging tens of thousands and some using unscientific DMIT fingerprint tests. Lume Live is different — every session is taken by our own qualified M.Sc Clinical Psychologist, using validated tools, at a fraction of the cost.'],
      ['Does Lume Live use DMIT fingerprint testing?', 'No, never. DMIT is not recognised by mainstream psychology and cannot measure interests or aptitude. Lume Live uses validated frameworks — Holland RIASEC for career interests, VARK for learning style, and a Career Values inventory — each explained clearly before use.'],
      ['Can Delhi students take counselling for CUET and stream selection?', 'Yes — stream selection after Class 10 and the CUET subject-combination decision are two of the most common reasons families book. A psychometric snapshot plus a guided 1:1 conversation separates genuine interest from result pressure and the pull of whatever course sounds most prestigious.'],
      ['How do I book a session from Delhi?', 'Message +91 70156 71280 on WhatsApp and the Lume Live team will confirm a slot, usually within a day. You can also take the free Career Snapshot first and bring the result to your session.'],
    ],
  },

  {
    key: 'mumbai', city: 'Mumbai', alt: null, region: 'IN-MH', state: 'Maharashtra',
    served: ['Navi Mumbai', 'Thane', 'Mumbai Metropolitan Region'],
    lede: 'Mumbai runs on ambition and moves fast — commerce, CA and finance for some, media and creative lines for others, and a handful of colleges everyone is chasing. In the hustle it’s easy to pick the default rather than the fit. Work 1:1 with a qualified M.Sc Clinical Psychologist to choose deliberately, online, in Hindi or English, from ₹499.',
    hindi: 'Bhaagti Mumbai mein, ek soch-samajh kar liya gaya faisla. 🎯',
    subtitle: 'choosing deliberately in a city that rewards speed',
    intro: [
      'Mumbai’s funnel is distinctive: the HSC boards and MHT-CET, a strong commerce-and-CA default in a lot of families, the gravity of a finance capital, and a genuinely large creative economy in film, media and design. The options are rich — but the city’s pace pushes students toward whatever the obvious next step is, long before anyone asks whether it suits them.',
      'Career counselling slows that down and narrows it with evidence. Lume Live’s counsellors hold an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia, and take every session themselves, online. Before a family locks in commerce over science, a CA track over a creative one, or an expensive coaching lane, one structured conversation checks the plan against the student.',
    ],
    covers: [
      '<strong>Stream selection after Class 10</strong> — decided on tested interests and aptitude, not on the family’s default or a cousin’s success story.',
      '<strong>The course question after Class 12</strong> — the CA and commerce route, MHT-CET and engineering, NEET, design (NID/NIFT), media and liberal arts, study abroad: which genuinely fits, with honest backups.',
      '<strong>Drop-year and course-change decisions</strong> — calm, structured analysis for students reconsidering a path partway through.',
      '<strong>Exam stress and burnout</strong> — the city’s pace produces plenty; we handle the emotional and career sides together. See our <a href="mental-health-counselling-mumbai.html" style="color:var(--teal);font-weight:700">mental health counselling in Mumbai</a>.',
    ],
    dmit: 'Mumbai has plenty of premium career-counselling packages, and some still push fingerprint-based "DMIT" tests at a steep price. DMIT has no recognition in mainstream psychology and cannot measure interests, aptitude or personality. Lume Live uses only validated frameworks — <strong>Holland RIASEC</strong> (career interests), <strong>VARK</strong> (learning style) and a <strong>Career Values</strong> inventory — each explained before use.',
    who: 'Every Mumbai enquiry reaches Lume Live’s own counselling team — never a franchise partner, never an outsourced call centre. That is the practical difference between Lume Live and the premium listings a "career counsellor in Mumbai" search surfaces.',
    note: '<span class="hi">Tezi galat nahi hai</span> — a fast city is an advantage when the effort points the right way. Counselling simply makes sure the direction was chosen, not defaulted into.',
    faq: [
      ['Is professional career counselling available in Mumbai?', 'Yes. Lume Live provides online 1:1 career counselling for Mumbai students and families, delivered by our own counsellors — M.Sc Clinical Psychology (Gurugram University), PGDGC (Jamia Millia Islamia). Sessions run over secure video call in Hindi and English, so the family can join from home anywhere across Mumbai, Navi Mumbai and Thane.'],
      ['How much does career counselling cost in Mumbai?', 'The first 45-minute session is ₹499. A free 60-second Career Snapshot is available with no payment, and the optional ₹999 Full Clarity Report adds a detailed psychometric profile — far more affordable than the DMIT and franchise packages common in Mumbai.'],
      ['Is this useful if my child is set on commerce and CA?', 'Yes — often especially then. Commerce and CA are excellent paths for the right student, and a poor fit for others who chose them by default. A psychometric profile and a guided conversation confirm whether the route suits this student, or whether a related path (finance, design, management, law) fits better.'],
      ['Does Lume Live use DMIT fingerprint testing?', 'No, never. DMIT is not recognised by mainstream psychology and cannot measure interests or aptitude. Lume Live uses validated frameworks — Holland RIASEC, VARK and a Career Values inventory — each explained clearly before use.'],
      ['Can Mumbai students take counselling for stream selection after Class 10?', 'Yes — it is the single most common reason families book. A psychometric snapshot plus a guided 1:1 conversation separates genuine interest from the commerce-versus-science default and from peer comparison, which runs high in Mumbai’s competitive colleges.'],
      ['How do I book a session from Mumbai?', 'Message +91 70156 71280 on WhatsApp and the Lume Live team will confirm a slot, usually within a day. You can also take the free Career Snapshot first and bring the result to your session.'],
    ],
  },

  {
    key: 'bangalore', city: 'Bangalore', alt: 'Bengaluru', region: 'IN-KA', state: 'Karnataka',
    served: ['Bengaluru'],
    lede: 'In Bengaluru it can feel as though everyone is an engineer or building a startup, and anything else is falling behind. That’s a narrow story. Work 1:1 with a qualified M.Sc Clinical Psychologist to look honestly at what fits this student — tech or not — online, in Hindi or English, from ₹499.',
    hindi: 'Bheed se alag, apni sateek raah. 🎯',
    subtitle: 'beyond “everyone’s an engineer”',
    intro: [
      'Bengaluru’s pull is tech, and it is strong. The II PU science default, CET and COMEDK into engineering, and an economy so dominated by software and startups that other good paths can feel second-rate. They aren’t. Design, research, product, the pure sciences, law, management — the city is full of people thriving outside engineering, but a seventeen-year-old rarely sees them.',
      'Career counselling widens that lens with evidence. Lume Live’s counsellors hold an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia, and take every session themselves, online. Before a student defaults to PCM and a CET coaching lane, one structured conversation checks whether engineering actually fits — and names the strong alternatives honestly if it doesn’t.',
    ],
    covers: [
      '<strong>Stream selection after Class 10</strong> — decided on tested interests and aptitude, not on the assumption that science-then-engineering is the only serious route.',
      '<strong>The course question after II PU / Class 12</strong> — CET and COMEDK engineering, NEET, design, the research and product paths Bengaluru itself is full of, liberal arts, study abroad: which genuinely fits, with honest backups.',
      '<strong>Drop-year and course-change decisions</strong> — structured analysis for students reconsidering the default partway through.',
      '<strong>Exam stress and burnout</strong> — comparison in a high-achieving city produces plenty; we handle the emotional and career sides together. See our <a href="mental-health-counselling-bangalore.html" style="color:var(--teal);font-weight:700">mental health counselling in Bengaluru</a>.',
    ],
    dmit: 'Bengaluru has many career-counselling services, and some still sell fingerprint-based "DMIT" tests at a premium. DMIT has no standing in mainstream psychology and cannot measure interests, aptitude or personality. Lume Live uses only validated frameworks — <strong>Holland RIASEC</strong> (career interests), <strong>VARK</strong> (learning style) and a <strong>Career Values</strong> inventory — each explained before use.',
    who: 'Every Bengaluru enquiry reaches Lume Live’s own counselling team — never a franchise partner, never an outsourced call centre. That is the practical difference between Lume Live and the aggregator listings a "career counsellor in Bangalore" search surfaces.',
    note: '<span class="hi">Engineer banna galat nahi</span> — for the right student it’s a great fit. The point of counselling is to confirm it’s a choice, not a default picked because the whole city seemed to make it.',
    faq: [
      ['Is professional career counselling available in Bengaluru?', 'Yes. Lume Live provides online 1:1 career counselling for Bengaluru students and families, delivered by our own counsellors — M.Sc Clinical Psychology (Gurugram University), PGDGC (Jamia Millia Islamia). Sessions run over secure video call in Hindi and English, so the family can join from home anywhere in Bengaluru.'],
      ['How much does career counselling cost in Bengaluru?', 'The first 45-minute session is ₹499. A free 60-second Career Snapshot is available with no payment, and the optional ₹999 Full Clarity Report adds a detailed psychometric profile — far more affordable than the premium packages common in Bengaluru.'],
      ['My child is good at studies but unsure about engineering. Can counselling help?', 'Yes, and it is one of the most common situations here. Being capable of engineering is not the same as being suited to it. A psychometric profile and a guided conversation separate genuine aptitude and interest from the city’s default, and name the strong alternatives — design, research, management, law — where they fit better.'],
      ['Does Lume Live use DMIT fingerprint testing?', 'No, never. DMIT is not recognised by mainstream psychology and cannot measure interests or aptitude. Lume Live uses validated frameworks — Holland RIASEC, VARK and a Career Values inventory — each explained clearly before use.'],
      ['Can Bengaluru students take counselling for stream selection after Class 10?', 'Yes — it is the single most common reason families book. A psychometric snapshot plus a guided 1:1 conversation separates the student’s real interest from peer comparison, which runs especially high in a city where so many families assume the same path.'],
      ['How do I book a session from Bengaluru?', 'Message +91 70156 71280 on WhatsApp and the Lume Live team will confirm a slot, usually within a day. You can also take the free Career Snapshot first and bring the result to your session.'],
    ],
  },

  {
    key: 'hyderabad', city: 'Hyderabad', alt: null, region: 'IN-TG', state: 'Telangana',
    served: ['Secunderabad'],
    lede: 'Hyderabad runs one of the most intense Intermediate and coaching systems in the country, where a rank can feel like the only measure of a student’s worth. Work 1:1 with a qualified M.Sc Clinical Psychologist to widen that lens and choose a real fit, online, in Hindi or English, from ₹499.',
    hindi: 'Rank se zyada, sahi raah maayne rakhti hai. 🎯',
    subtitle: 'past the rank, to the right fit',
    intro: [
      'Hyderabad’s Intermediate system is built around a single ranked funnel. The big corporate colleges, integrated EAMCET, JEE and NEET coaching, residential campuses and pre-dawn timetables — all of it pointed at medicine or engineering, with a student’s worth quietly reduced to a number. Many families arrive having never been asked whether that funnel actually suits the child inside it.',
      'Career counselling puts that question back at the centre. Lume Live’s counsellors hold an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia, and take every session themselves, online. Before two years are committed to one track, a psychometric profile and a structured conversation separate genuine interest and aptitude from the pressure of the rank machine.',
    ],
    covers: [
      '<strong>The MPC vs BiPC decision after Class 10</strong> — Hyderabad’s central stream choice, decided on tested interests and aptitude rather than on which coaching batch a child is pushed into.',
      '<strong>The course question after Intermediate</strong> — EAMCET engineering, NEET, the pharma and life-science paths the city is full of, design, liberal arts, study abroad: which genuinely fits, with honest backups.',
      '<strong>Drop-year and course-change decisions</strong> — structured, calm analysis when a rank didn’t land where it was supposed to.',
      '<strong>Exam stress and burnout</strong> — the Intermediate system produces a great deal of it; we handle the emotional and career sides together. See our <a href="mental-health-counselling-hyderabad.html" style="color:var(--teal);font-weight:700">mental health counselling in Hyderabad</a>.',
    ],
    dmit: 'Hyderabad has many career-counselling services around its coaching ecosystem, and some still sell fingerprint-based "DMIT" tests at a premium. DMIT has no standing in mainstream psychology and cannot measure interests, aptitude or personality. Lume Live uses only validated frameworks — <strong>Holland RIASEC</strong> (career interests), <strong>VARK</strong> (learning style) and a <strong>Career Values</strong> inventory — each explained before use.',
    who: 'Every Hyderabad enquiry reaches Lume Live’s own counselling team — never a franchise partner, never an outsourced call centre. That is the practical difference between Lume Live and the aggregator listings a "career counsellor in Hyderabad" search surfaces.',
    note: '<span class="hi">Rank aapki keemat nahi hai</span> — a number measures one exam on one day, not a student’s worth or their future. Counselling builds the decision on a much wider base than that.',
    faq: [
      ['Is professional career counselling available in Hyderabad?', 'Yes. Lume Live provides online 1:1 career counselling for Hyderabad and Secunderabad students and families, delivered by our own counsellors — M.Sc Clinical Psychology (Gurugram University), PGDGC (Jamia Millia Islamia). Sessions run over secure video call in Hindi and English, from home.'],
      ['How much does career counselling cost in Hyderabad?', 'The first 45-minute session is ₹499. A free 60-second Career Snapshot is available with no payment, and the optional ₹999 Full Clarity Report adds a detailed psychometric profile — far more affordable than the packages sold around the coaching ecosystem here.'],
      ['Is this useful for a student in an Intermediate corporate college?', 'Yes, and often badly needed. The Intermediate system is built around rank, not fit, and a short psychometric profile plus a conversation outside that system helps a student — and their parents — see whether the track suits them before another year is committed to it.'],
      ['Does Lume Live use DMIT fingerprint testing?', 'No, never. DMIT is not recognised by mainstream psychology and cannot measure interests or aptitude. Lume Live uses validated frameworks — Holland RIASEC, VARK and a Career Values inventory — each explained clearly before use.'],
      ['Can you help with the MPC versus BiPC decision after Class 10?', 'Yes — it is one of the most common reasons Hyderabad families book. The choice sets up years of study, and a psychometric snapshot plus a guided conversation grounds it in the student’s genuine interests and aptitude rather than in which batch is easiest to join.'],
      ['How do I book a session from Hyderabad?', 'Message +91 70156 71280 on WhatsApp and the Lume Live team will confirm a slot, usually within a day. You can also take the free Career Snapshot first and bring the result to your session.'],
    ],
  },

  {
    key: 'pune', city: 'Pune', alt: null, region: 'IN-MH', state: 'Maharashtra',
    served: ['Pimpri-Chinchwad'],
    lede: 'Pune pulls in students from across India and the world, with a huge spread of colleges and courses. That choice is a gift and a trap — it’s easy to land on the wrong course and realise too late. Work 1:1 with a qualified M.Sc Clinical Psychologist to choose well the first time, online, in Hindi or English, from ₹499.',
    hindi: 'Itne saare raaste — sahi wala pehli baar mein. 🎯',
    subtitle: 'choosing well in a city built for students',
    intro: [
      'Pune is a student city with an unusually wide menu: Savitribai Phule Pune University and MHT-CET engineering on one side, a deep management and liberal-arts scene (Symbiosis, FLAME and more) on the other, and a steady inflow of students a long way from home. The breadth is a real advantage — and it is exactly why wrong-course regret is one of the most common things families bring here.',
      'Career counselling turns that breadth from a trap into an asset. Lume Live’s counsellors hold an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia, and take every session themselves, online. Before a family picks from the long list, a psychometric profile and a structured conversation narrow it to what genuinely fits the student.',
    ],
    covers: [
      '<strong>Stream selection after Class 10</strong> — decided on tested interests and aptitude, so the first big choice points the right way.',
      '<strong>The course question after Class 12</strong> — MHT-CET engineering, management and BBA, liberal arts and design, NEET, study abroad: which genuinely fits, with honest backups.',
      '<strong>Course-change and drop-year decisions</strong> — including the very Pune situation of realising, a semester in, that the course doesn’t fit, and deciding calmly what to do next.',
      '<strong>Exam stress and burnout</strong> — being far from home adds to it; we handle the emotional and career sides together. See our <a href="mental-health-counselling-pune.html" style="color:var(--teal);font-weight:700">mental health counselling in Pune</a>.',
    ],
    dmit: 'Pune has many career-counselling services, and some still sell fingerprint-based "DMIT" tests at a premium. DMIT has no standing in mainstream psychology and cannot measure interests, aptitude or personality. Lume Live uses only validated frameworks — <strong>Holland RIASEC</strong> (career interests), <strong>VARK</strong> (learning style) and a <strong>Career Values</strong> inventory — each explained before use.',
    who: 'Every Pune enquiry reaches Lume Live’s own counselling team — never a franchise partner, never an outsourced call centre. That is the practical difference between Lume Live and the aggregator listings a "career counsellor in Pune" search surfaces.',
    note: '<span class="hi">Itne options ka faida</span> — a wide menu only helps if the choice is made deliberately. Counselling makes sure the breadth works for the student instead of overwhelming them.',
    faq: [
      ['Is professional career counselling available in Pune?', 'Yes. Lume Live provides online 1:1 career counselling for Pune students and families, delivered by our own counsellors — M.Sc Clinical Psychology (Gurugram University), PGDGC (Jamia Millia Islamia). Sessions run over secure video call in Hindi and English, from home.'],
      ['How much does career counselling cost in Pune?', 'The first 45-minute session is ₹499. A free 60-second Career Snapshot is available with no payment, and the optional ₹999 Full Clarity Report adds a detailed psychometric profile — far more affordable than the packages common in Pune.'],
      ['My child has started a course and thinks it’s wrong. Can you help?', 'Yes — this is one of the most common things Pune families bring, and the city’s huge course menu makes it more common here than most places. A structured session separates a passing dip from a genuine mismatch, and maps the realistic options — switching, continuing, or a planned change — calmly rather than in a panic.'],
      ['Does Lume Live use DMIT fingerprint testing?', 'No, never. DMIT is not recognised by mainstream psychology and cannot measure interests or aptitude. Lume Live uses validated frameworks — Holland RIASEC, VARK and a Career Values inventory — each explained clearly before use.'],
      ['Can Pune students take counselling for stream selection after Class 10?', 'Yes — it is the single most common reason families book. A psychometric snapshot plus a guided 1:1 conversation grounds the first big choice in the student’s genuine interest and aptitude, so the wide menu of courses later becomes an advantage, not a source of regret.'],
      ['How do I book a session from Pune?', 'Message +91 70156 71280 on WhatsApp and the Lume Live team will confirm a slot, usually within a day. You can also take the free Career Snapshot first and bring the result to your session.'],
    ],
  },

  {
    key: 'jaipur', city: 'Jaipur', alt: null, region: 'IN-RJ', state: 'Rajasthan',
    served: ['Rajasthan'],
    lede: 'Rajasthan’s coaching culture casts a long shadow over Jaipur — JEE and NEET preparation, the Kota route, and a steady stream of droppers weighing another attempt. Work 1:1 with a qualified M.Sc Clinical Psychologist to decide with evidence, not momentum, online, in Hindi or English, from ₹499.',
    hindi: 'Bhaagte raho nahi — soch kar aage badho. 🎯',
    subtitle: 'deciding with evidence, not momentum',
    intro: [
      'Few places feel the pull of coaching like Jaipur. JEE and NEET preparation dominates the conversation, Kota is a short drive away, and a large number of students are weighing a drop year or already in one. The momentum is powerful — another attempt, another batch, another year — and it can carry a student a long way down a path nobody stopped to check was right for them.',
      'Career counselling interrupts that momentum with evidence. Lume Live’s counsellors hold an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia, and take every session themselves, online. Before a family funds another attempt, a psychometric profile and a structured conversation ask the harder question — is this the right target at all, and what else genuinely fits.',
    ],
    covers: [
      '<strong>Stream selection after Class 10</strong> — decided on tested interests and aptitude, before the coaching track narrows everything to JEE or NEET.',
      '<strong>The course question after Class 12</strong> — JEE and NEET, yes, but also the commerce, design, management, law and government-exam paths that get overlooked here, each weighed honestly.',
      '<strong>The drop-year decision</strong> — the honest, evidence-based version of "is another attempt worth it?", instead of carrying on by momentum. See our guide for <a href="career-counselling-for-neet-jee-droppers.html" style="color:var(--teal);font-weight:700">NEET/JEE droppers</a>.',
      '<strong>Exam stress and burnout</strong> — coaching pressure produces a great deal of it; we handle the emotional and career sides together. See our <a href="mental-health-counselling-jaipur.html" style="color:var(--teal);font-weight:700">mental health counselling in Jaipur</a>.',
    ],
    dmit: 'Jaipur has many career-counselling services around its coaching ecosystem, and some still sell fingerprint-based "DMIT" tests at a premium. DMIT has no standing in mainstream psychology and cannot measure interests, aptitude or personality. Lume Live uses only validated frameworks — <strong>Holland RIASEC</strong> (career interests), <strong>VARK</strong> (learning style) and a <strong>Career Values</strong> inventory — each explained before use.',
    who: 'Every Jaipur enquiry reaches Lume Live’s own counselling team — never a franchise partner, never an outsourced call centre. That is the practical difference between Lume Live and the aggregator listings a "career counsellor in Jaipur" search surfaces.',
    note: '<span class="hi">Ek aur attempt se pehle</span> — the question is whether the target is right, not only whether to try again. Counselling answers that on evidence before another year is committed.',
    faq: [
      ['Is professional career counselling available in Jaipur?', 'Yes. Lume Live provides online 1:1 career counselling for Jaipur students and families, delivered by our own counsellors — M.Sc Clinical Psychology (Gurugram University), PGDGC (Jamia Millia Islamia). Sessions run over secure video call in Hindi and English, from home.'],
      ['How much does career counselling cost in Jaipur?', 'The first 45-minute session is ₹499. A free 60-second Career Snapshot is available with no payment, and the optional ₹999 Full Clarity Report adds a detailed psychometric profile — far more affordable than the packages sold around Jaipur’s coaching ecosystem.'],
      ['Should my child take a drop year for JEE or NEET?', 'That is exactly the kind of decision a session is for. Rather than carrying on by momentum, we look at the evidence — aptitude, the realistic gain from another attempt, the student’s own motivation, and the strong alternatives — so the choice to repeat or move on is made deliberately. Our <a href="career-counselling-for-neet-jee-droppers.html">guide for droppers</a> covers this in depth.'],
      ['Does Lume Live use DMIT fingerprint testing?', 'No, never. DMIT is not recognised by mainstream psychology and cannot measure interests or aptitude. Lume Live uses validated frameworks — Holland RIASEC, VARK and a Career Values inventory — each explained clearly before use.'],
      ['Can Jaipur students take counselling for stream selection after Class 10?', 'Yes — it is the single most common reason families book, and doing it early matters here, before the coaching track narrows every option down to JEE or NEET. A psychometric snapshot plus a guided conversation keeps the full range of paths on the table.'],
      ['How do I book a session from Jaipur?', 'Message +91 70156 71280 on WhatsApp and the Lume Live team will confirm a slot, usually within a day. You can also take the free Career Snapshot first and bring the result to your session.'],
    ],
  },

  {
    key: 'lucknow', city: 'Lucknow', alt: null, region: 'IN-UP', state: 'Uttar Pradesh',
    served: ['Uttar Pradesh'],
    lede: 'In Lucknow a government job is still treated as the one safe destination, and modern careers rarely get a fair hearing. Work 1:1 with a qualified M.Sc Clinical Psychologist to weigh every real option — sarkari and otherwise — on the evidence, online, in Hindi or English, from ₹499.',
    hindi: 'Sarkari naukri ke aage bhi raaste hain. 🎯',
    subtitle: 'beyond the sarkari-naukri default',
    intro: [
      'Lucknow’s career conversation still bends heavily toward the government job. UPSC and state PCS, SSC, banking — treated by many families as the one secure outcome, with everything else seen as a gamble. Meanwhile CUET has opened the central universities, and modern careers in technology, design, management, media and law are more reachable from here than ever, but they rarely get discussed on equal terms.',
      'Career counselling levels that conversation with evidence. Lume Live’s counsellors hold an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia, and take every session themselves, online. A psychometric profile and a structured conversation weigh the sarkari route and the modern ones side by side, on fit, rather than on which one feels safest by habit.',
    ],
    covers: [
      '<strong>Stream selection after Class 10</strong> — decided on tested interests and aptitude, not on which stream is assumed to lead to a government job.',
      '<strong>The course question after Class 12</strong> — CUET and the central universities, NEET and JEE, the government-exam tracks, and the technology, design, management and media paths now open to Lucknow students: all weighed honestly.',
      '<strong>Drop-year and course-change decisions</strong> — including the real trade-off between years of exam preparation and other routes.',
      '<strong>Exam stress and burnout</strong> — long preparation cycles produce plenty; we handle the emotional and career sides together. See our <a href="mental-health-counselling-lucknow.html" style="color:var(--teal);font-weight:700">mental health counselling in Lucknow</a>.',
    ],
    dmit: 'Lucknow has a growing number of career-counselling services, and some still sell fingerprint-based "DMIT" tests at a premium. DMIT has no standing in mainstream psychology and cannot measure interests, aptitude or personality. Lume Live uses only validated frameworks — <strong>Holland RIASEC</strong> (career interests), <strong>VARK</strong> (learning style) and a <strong>Career Values</strong> inventory — each explained before use.',
    who: 'Every Lucknow enquiry reaches Lume Live’s own counselling team — never a franchise partner, never an outsourced call centre. That is the practical difference between Lume Live and the aggregator listings a "career counsellor in Lucknow" search surfaces.',
    note: '<span class="hi">Sarkari naukri galat nahi hai</span> — for the right student it’s a genuinely good fit. The point of counselling is to make sure it was chosen on the evidence, not reached for by default.',
    faq: [
      ['Is professional career counselling available in Lucknow?', 'Yes. Lume Live provides online 1:1 career counselling for Lucknow students and families, delivered by our own counsellors — M.Sc Clinical Psychology (Gurugram University), PGDGC (Jamia Millia Islamia). Sessions run over secure video call in Hindi and English, from home.'],
      ['How much does career counselling cost in Lucknow?', 'The first 45-minute session is ₹499. A free 60-second Career Snapshot is available with no payment, and the optional ₹999 Full Clarity Report adds a detailed psychometric profile — far more affordable than the packages common in Lucknow.'],
      ['Is a government job really the safest option for my child?', 'For some students it is a genuinely good fit; for others it means years of preparation for a path that never suited them. A session weighs the sarkari route honestly against the modern alternatives — on the student’s aptitude, interests and the realistic odds — so the choice is made on evidence rather than by assumption.'],
      ['Does Lume Live use DMIT fingerprint testing?', 'No, never. DMIT is not recognised by mainstream psychology and cannot measure interests or aptitude. Lume Live uses validated frameworks — Holland RIASEC, VARK and a Career Values inventory — each explained clearly before use.'],
      ['Can Lucknow students take counselling for CUET and stream selection?', 'Yes — stream selection after Class 10 and the CUET decision are two of the most common reasons families book. A psychometric snapshot plus a guided conversation keeps the full range of paths — central universities, modern careers and government routes — genuinely on the table.'],
      ['How do I book a session from Lucknow?', 'Message +91 70156 71280 on WhatsApp and the Lume Live team will confirm a slot, usually within a day. You can also take the free Career Snapshot first and bring the result to your session.'],
    ],
  },

  {
    key: 'chandigarh', city: 'Chandigarh', alt: null, region: 'IN-CH', state: 'Chandigarh',
    served: ['Mohali', 'Panchkula', 'Tricity'],
    lede: 'Chandigarh’s schools are strong and its families ambitious, with the tricity’s colleges, Panjab University and the pull of the services all in the mix. Work 1:1 with a qualified M.Sc Clinical Psychologist to turn that ambition toward the right target, online, in Hindi or English, from ₹499.',
    hindi: 'Mehnat ko sahi disha milni chahiye. 🎯',
    subtitle: 'ambition, pointed at the right target',
    intro: [
      'Chandigarh and the wider tricity — Mohali and Panchkula — have strong CBSE schools, ambitious families and a well-earned reputation for sending students into medicine, engineering, commerce and the armed forces. Panjab University and PEC anchor the local options, and there is a notable services aspiration that runs through many households. The ambition is real; what it sometimes skips is the question of which target it should be aimed at.',
      'Career counselling supplies that question, with evidence behind it. Lume Live’s counsellors hold an M.Sc in Clinical Psychology (Gurugram University) and a PGDGC from Jamia Millia Islamia, and take every session themselves, online. Before a family commits to a stream, a PU or tricity course, or an NDA and services track, one structured conversation checks that the plan fits the student.',
    ],
    covers: [
      '<strong>Stream selection after Class 10</strong> — decided on tested interests and aptitude, not on the stream a strong school cohort is all expected to take.',
      '<strong>The course question after Class 12</strong> — JEE and NEET, Panjab University and the tricity colleges, commerce and CA, design, the NDA and services route, study abroad: which genuinely fits, with honest backups.',
      '<strong>Drop-year and course-change decisions</strong> — calm, structured analysis for students reconsidering a path partway through.',
      '<strong>Exam stress and burnout</strong> — high-performing schools produce plenty; we handle the emotional and career sides together. See our <a href="mental-health-counselling-chandigarh.html" style="color:var(--teal);font-weight:700">mental health counselling in Chandigarh</a>.',
    ],
    dmit: 'Chandigarh and the tricity have many career-counselling services, and some still sell fingerprint-based "DMIT" tests at a premium. DMIT has no standing in mainstream psychology and cannot measure interests, aptitude or personality. Lume Live uses only validated frameworks — <strong>Holland RIASEC</strong> (career interests), <strong>VARK</strong> (learning style) and a <strong>Career Values</strong> inventory — each explained before use.',
    who: 'Every Chandigarh enquiry reaches Lume Live’s own counselling team — never a franchise partner, never an outsourced call centre. That is the practical difference between Lume Live and the aggregator listings a "career counsellor in Chandigarh" search surfaces.',
    note: '<span class="hi">Ambition galat nahi hai</span> — high expectations are a strength when they are pointed at the right target. Counselling makes sure the effort and the money back a direction the student genuinely fits.',
    faq: [
      ['Is professional career counselling available in Chandigarh?', 'Yes. Lume Live provides online 1:1 career counselling for Chandigarh, Mohali and Panchkula students and families, delivered by our own counsellors — M.Sc Clinical Psychology (Gurugram University), PGDGC (Jamia Millia Islamia). Sessions run over secure video call in Hindi and English, from home.'],
      ['How much does career counselling cost in Chandigarh?', 'The first 45-minute session is ₹499. A free 60-second Career Snapshot is available with no payment, and the optional ₹999 Full Clarity Report adds a detailed psychometric profile — far more affordable than the packages common across the tricity.'],
      ['My child is considering the NDA or the services. Can counselling help?', 'Yes. The services are a strong fit for some students and a poor one for others, and a psychometric profile plus a structured conversation help a family judge which — and plan honest backups alongside, so the decision carries less risk whichever way it goes.'],
      ['Does Lume Live use DMIT fingerprint testing?', 'No, never. DMIT is not recognised by mainstream psychology and cannot measure interests or aptitude. Lume Live uses validated frameworks — Holland RIASEC, VARK and a Career Values inventory — each explained clearly before use.'],
      ['Can tricity students take counselling for stream selection after Class 10?', 'Yes — it is the single most common reason families book. A psychometric snapshot plus a guided 1:1 conversation separates the student’s genuine interest from result pressure and from the choice a strong school cohort is all expected to make.'],
      ['How do I book a session from Chandigarh?', 'Message +91 70156 71280 on WhatsApp and the Lume Live team will confirm a slot, usually within a day. You can also take the free Career Snapshot first and bring the result to your session.'],
    ],
  },
];
