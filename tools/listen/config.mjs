/*
  Lume Live — listening tool settings.

  Everything you might want to tune lives here: which subreddits to read,
  which phrases count as "this person needs what we do", and the reply
  starter Sachin edits before posting. No code below needs to change when
  you add a subreddit, a phrase or a better starter.

  Phrases are matched case-insensitively against the post title and body,
  as whole words, so "drop" does not match "dropdown". Weights are rough:
  a single strong phrase (weight 3) plus a question should clear the
  threshold; a single weak one (weight 1) should not.
*/

export const SUBREDDITS = [
  'JEENEETards',
  'NEET',
  'Indian_Academia',
  'IndianTeenagers',
  'CBSE',
  'Btechtards',
  'developersIndia',
  'UPSC',
  'CAIndia',
  'LawSchoolIndia',
  'IndianWorkplace'
];

// Only posts newer than this are considered. A little over a day, so a
// late cron run never leaves a gap; the Sheet drops the overlap.
export const MAX_AGE_HOURS = 26;

// A post must reach this score to make the list, and the list never
// grows past MAX_ITEMS — a short list gets read, a long one gets skipped.
export const MIN_SCORE = 4;
export const MAX_ITEMS = 25;

/*
  Categories, in priority order. When a post matches several, the one
  with the highest phrase weight wins; ties go to the earlier category,
  which is why crisis and distress come first.

  sensitive: true means the person may be struggling. These rows are
  flagged for a human, the starter never links the site or mentions a
  price, and the tests enforce that.
*/
export const CATEGORIES = [
  {
    id: 'crisis',
    label: 'Crisis — reply as a person, today',
    sensitive: true,
    phrases: {
      3: ['suicide', 'suicidal', 'kill myself', 'end my life', 'end it all',
          'want to die', 'self harm', 'self-harm', 'cutting myself',
          'no reason to live', 'mar jaana', 'marna chahta', 'marna chahti',
          'jeene ka mann nahi']
    },
    starter:
`I'm really glad you posted this instead of keeping it in. What you're feeling right now matters, and you don't have to sort it out alone tonight.

If you're in India, Tele-MANAS (14416 or 1-800-891-4416) is free and open 24x7, and iCall (9152987821) has trained counsellors too. If you're in immediate danger, please call 112.

Is there one person near you — a friend, sibling, anyone — you could message right now just to say you're not okay?`
  },
  {
    id: 'distress',
    label: 'Struggling — human check-in, no pitch',
    sensitive: true,
    phrases: {
      3: ['depressed', 'depression', 'anxiety attack', 'panic attack',
          'mental breakdown', 'breaking down', 'feel hopeless', 'feeling hopeless',
          'feel worthless', 'feeling worthless', "can't cope", 'cannot cope',
          'feel so alone', 'nobody understands', 'lonely', 'crying every day',
          'can\'t stop crying'],
      2: ['overwhelmed', 'burnt out', 'burned out', 'burnout', 'mentally exhausted',
          'feel lost', 'feeling lost', 'no motivation', 'ghabrahat', 'tension ho rahi',
          'bahut stress']
    },
    starter:
`That sounds genuinely heavy, and it makes sense that you feel this way after what you've described. You're not weak for struggling with it.

One small thing that often helps: write down the one worry that's loudest right now, and next to it the smallest step that's in your control this week. It doesn't fix everything, but it turns a fog into something you can look at.

If it ever feels like too much, Tele-MANAS (14416) is free and 24x7. And you're welcome to talk it through here too.`
  },
  {
    id: 'jee_neet_drop',
    label: 'JEE / NEET — drop year or fit',
    sensitive: false,
    phrases: {
      3: ['drop year', 'take a drop', 'taking a drop', 'should i drop', 'dropper',
          'second drop', 'drop lena', 'drop le lu', 'drop lun', 'partial drop',
          'is jee for me', 'is neet for me', 'not cracking jee', 'not cracking neet',
          'low percentile', 'bad rank'],
      2: ['jee mains', 'jee advanced', 'neet ug', 'josaa', 'counselling round',
          'which college', 'nit or iiit', 'tier 3 college']
    },
    starter:
`Before deciding on the drop, it helps to separate three questions that usually get mixed up:
1. Was the gap this year about effort, method, or something outside your control (health, family, coaching)?
2. If you drop and get roughly the same rank, what's your plan B — and is it worse than taking the best option available now?
3. Do you actually want the field (engineering / medicine), or the label of the exam?

If 1 is "method" and you have a clear answer to 2, a drop can work well. If it's mostly pressure, it's worth pausing.

(I'm a counselling psychologist and work with a lot of droppers — this short check helps some people think it through: https://lumelive.co.in/is-jee-right-for-you.html)`
  },
  {
    id: 'stream_choice',
    label: 'Stream choice after Class 10',
    sensitive: false,
    phrases: {
      3: ['which stream', 'stream selection', 'choose stream', 'choosing stream',
          'pcm or pcb', 'pcb or pcm', 'science or commerce', 'commerce or humanities',
          'arts or commerce', 'after 10th', 'after class 10', 'konsa stream',
          'kaunsa stream', 'regret taking pcm', 'regret taking pcb', 'switch stream',
          'change stream'],
      2: ['class 11', '11th', 'pcmb', 'humanities', 'maths or no maths']
    },
    starter:
`Stream choice is less about "which is best" and more about which subjects you can sit with for two years. A quick way to test it:
- Which subject do you do even when no one's checking? That's interest.
- Which one do you score in without heavy tuition? That's aptitude.
- What careers are you picturing — and do they actually need that stream? (Many don't.)

If interest and aptitude point the same way, that's usually your answer. If they clash, talk to someone before 11th starts — switching later is possible but costs a year of stress.

There's a free 5-minute stream selector that names the exact subject combination, if it helps: https://lumelive.co.in/stream-selector.html`
  },
  {
    id: 'after_graduation',
    label: 'After graduation / college direction',
    sensitive: false,
    phrases: {
      3: ['what after btech', 'after btech', 'after b.tech', 'after bcom', 'after b.com',
          'after bsc', 'after b.sc', 'after ba', 'confused about career',
          'career confusion', 'no idea what to do', "don't know what to do with my life",
          'which career', 'career advice', 'career guidance', 'mba or job',
          'masters or job', 'ms or job'],
      2: ['placement', 'unplaced', 'no placement', 'final year', 'career options']
    },
    starter:
`Being unsure at this stage is far more common than it looks from LinkedIn. Three things that usually narrow it down:
1. List the 2–3 courses or projects you didn't hate — what did they have in common (people, numbers, building, writing)?
2. Pick 2 roles that fit that pattern and message one person in each. Ask what a normal Tuesday looks like.
3. Prefer options that keep doors open (a job with learning, or a skill course) over expensive ones that close them (an MBA just to delay deciding).

(I'm a counselling psychologist; if a structured look helps, the free assessment here maps interests to roles: https://lumelive.co.in/assessment.html)`
  },
  {
    id: 'career_switch',
    label: 'Working professional — switch or stuck',
    sensitive: false,
    phrases: {
      3: ['career switch', 'switch career', 'change career', 'career change',
          'stuck in my job', 'hate my job', 'toxic manager', 'toxic workplace',
          'quit my job', 'should i quit', 'resign or not', 'job stress'],
      2: ['appraisal', 'notice period', 'layoff', 'laid off', 'promotion', 'salary hike']
    },
    starter:
`Before deciding on the switch, it's worth checking which of these is actually the problem — they have very different fixes:
- The work itself (you'd be bored doing it anywhere)
- The place (manager, team, culture)
- The stage (burnt out, and anything would feel bad right now)

If it's the place, a lateral move fixes it. If it's the work, plan the switch over 6–12 months while still employed. If it's burnout, rest first — decisions made exhausted tend to be regretted.

There's a free work-stress check here if you want a quick read on the burnout side: https://lumelive.co.in/work-stress-burnout-test.html`
  },
  {
    id: 'parent_pressure',
    label: 'Parent pressure / family conflict',
    sensitive: false,
    phrases: {
      3: ['parents forcing', 'parents want me', 'parents are forcing', 'family pressure',
          'parents pressure', 'parents won\'t let', 'convince my parents',
          'my father wants', 'my mother wants', 'ghar wale', 'gharwale',
          'papa chahte', 'mummy chahti'],
      2: ['parents', 'disappointed my parents']
    },
    starter:
`This is one of the hardest spots to be in, because you care about them and about your own future. What tends to work better than arguing:
1. Find out what they're actually worried about — usually money, security, or what relatives will say — not the specific course.
2. Come back with answers to that worry: salaries, colleges, people who've done your path.
3. Ask for a trial: one year, one course, a clear checkpoint you all agree on.

Sometimes a neutral third person (a counsellor or teacher they respect) helps more than any argument from you.`
  },
  {
    id: 'exam_stress',
    label: 'Exam stress / results',
    sensitive: false,
    phrases: {
      3: ['exam stress', 'exam anxiety', 'board exam', 'boards stress', 'scared of exam',
          'can\'t focus', 'cannot focus', 'can\'t concentrate', 'result anxiety',
          'failed exam', 'failed in', 'compartment', 'backlog'],
      2: ['revision', 'study plan', 'procrastinating', 'procrastination']
    },
    starter:
`Exam stress usually comes from trying to hold the whole syllabus in your head at once. A few things that genuinely help:
- Break today into 3 blocks of 50 minutes, each with one named chapter. Only today.
- After each block, write 3 lines on what you remember. That's active recall, and it calms the "I know nothing" feeling.
- Sleep is part of revision — memory consolidates overnight.

If the fear is bigger than the exam itself, that's worth talking about too. There's a free exam stress check here: https://lumelive.co.in/exam-stress-test.html`
  }
];

// Context that makes a post more likely to be someone we can actually help.
export const INDIA_HINTS = [
  'india', 'indian', 'cbse', 'icse', 'jee', 'neet', 'cuet', 'nit', 'iit', 'iiit',
  'lpa', 'rupees', 'lakh', 'delhi', 'haryana', 'board', 'coaching', 'kota'
];

// Posts that are noise, promotion or not a real question.
export const NOISE_PHRASES = [
  'meme', 'shitpost', 'giveaway', 'dm me for', 'join my telegram', 'join our telegram',
  'referral code', 'promo code', 'selling notes', 'paid service', 'whatsapp group link',
  'rate my', 'roast me'
];
