/*
  The fixed half of a report.

  Every score has a name, a tag and a description that are the same for
  every client who ever gets one — "Investigative / the Thinkers", what a
  work anchor means, how a learning channel works. That text was written
  by a counsellor and it lives in assessment.html, where the on-screen
  report renders it.

  It is copied here rather than re-derived because the drafting agent
  must not write it. Two reasons, and the second is the important one:

  - It is already written, so paying a model to rewrite it every time
    would cost tokens to produce something worse and inconsistent.

  - Keeping it out of the model's output means the model's output is
    ONLY the personalised prose. It never emits a name, a score, a
    maximum or a definition, so no amount of drift or hallucination can
    change what a client's numbers say they are. buildReportData() in
    reports.js merges these tables with the saved scores; the draft
    supplies adjectives, never arithmetic.

  Extracted from assessment.html — if the item banks there are ever
  re-worded, re-extract rather than editing by hand, and bump
  SCHEMA_VERSION in assessments.js so old profiles stay readable.
*/

const RIASEC = {
    "R": {
      "name": "Realistic",
      "tag": "the Doers",
      "desc": "Practical, hands-on people who are often good at mechanical, technical, athletic or physical work and enjoy working with tools, machines, animals, plants or the outdoors."
    },
    "I": {
      "name": "Investigative",
      "tag": "the Thinkers",
      "desc": "Curious, analytical people who like to observe, learn, investigate and solve problems using ideas and evidence."
    },
    "A": {
      "name": "Artistic",
      "tag": "the Creators",
      "desc": "Imaginative, original people who like unstructured situations where they can use creativity and self-expression."
    },
    "S": {
      "name": "Social",
      "tag": "the Helpers",
      "desc": "Warm, supportive people who like to work with and for others — teaching, helping, caring and guiding."
    },
    "E": {
      "name": "Enterprising",
      "tag": "the Persuaders",
      "desc": "Energetic, ambitious people who like to lead, persuade, sell and influence others to reach goals."
    },
    "C": {
      "name": "Conventional",
      "tag": "the Organisers",
      "desc": "Careful, detail-oriented people who like order, structure and working with data, records and clear procedures."
    }
  };

const ANCHORS = {
    "MA": {
      "name": "Mastery & Expertise",
      "short": "Mastery",
      "desc": "You are driven by becoming genuinely capable at meaningful work. Growth feels strongest when you can deepen skill, earn trust for quality, and keep improving your craft."
    },
    "IN": {
      "name": "Influence & Direction",
      "short": "Influence",
      "desc": "You are driven by shaping direction with and through people. You may enjoy coordinating effort, taking responsibility, and turning shared goals into clear progress."
    },
    "AU": {
      "name": "Autonomy",
      "short": "Autonomy",
      "desc": "You are driven by room to decide how work gets done. Trust, flexible methods, and ownership of your process matter more than constant supervision."
    },
    "ST": {
      "name": "Stability & Security",
      "short": "Stability",
      "desc": "You are driven by predictability, fairness and a reliable base. Clear expectations, dependable income, and long-term continuity help you do your best work."
    },
    "EN": {
      "name": "Enterprise & Creation",
      "short": "Enterprise",
      "desc": "You are driven by building new things. Creating a product, service, project or independent path may feel more exciting than simply maintaining an existing routine."
    },
    "SV": {
      "name": "Service & Impact",
      "short": "Service",
      "desc": "You are driven by usefulness and human impact. Work feels meaningful when it supports people, communities, wellbeing or causes that matter to you."
    },
    "CH": {
      "name": "Challenge & Growth",
      "short": "Challenge",
      "desc": "You are driven by stretch. Complex problems, high standards and visible growth keep you engaged, especially when the answer is not obvious at first."
    },
    "WF": {
      "name": "Work-Life Fit",
      "short": "Work-Life Fit",
      "desc": "You are driven by a sustainable fit between career, health, relationships and personal priorities. Success needs to leave room for the whole person."
    }
  };

const VARK = {
    "V": {
      "name": "Visual Structure",
      "desc": "You learn well when ideas are arranged in clear layouts, diagrams, charts, timelines or maps.",
      "tip": "Turn notes into charts, mind maps, comparison tables and colour-coded structures."
    },
    "A": {
      "name": "Spoken Discussion",
      "desc": "You learn well through explanation, dialogue, questions, teaching back and hearing ideas in words.",
      "tip": "Talk topics through, explain them aloud, use study conversations and record short verbal summaries."
    },
    "R": {
      "name": "Written Notes",
      "desc": "You learn well from precise words, lists, definitions, summaries and written examples you can revisit.",
      "tip": "Rewrite notes in your own words, build checklists, make flashcards and practise concise written answers."
    },
    "K": {
      "name": "Hands-On Practice",
      "desc": "You learn well by trying, applying, testing and connecting ideas to real examples or practical tasks.",
      "tip": "Use sample problems, role plays, case examples, mock attempts and quick practice cycles."
    }
  };

const BIGFIVE = {
    "E": {
      "name": "Extroversion",
      "desc": "How much energy you draw from social interaction. Higher scorers tend to be sociable and outgoing; lower scorers are more reserved and often prefer working independently."
    },
    "A": {
      "name": "Agreeableness",
      "desc": "How much you adjust your behaviour to suit others. Higher scorers tend to be warm and cooperative; lower scorers are more direct and inclined to 'tell it like it is'."
    },
    "C": {
      "name": "Conscientiousness",
      "desc": "Being organised, dependable and hardworking. Higher scorers plan, follow rules and attend to detail; lower scorers are more spontaneous and flexible."
    },
    "N": {
      "name": "Neuroticism",
      "desc": "Emotional reactivity. Higher scorers experience worry and mood changes more readily; lower scorers tend to feel calm and emotionally steady."
    },
    "O": {
      "name": "Openness",
      "desc": "Seeking new experiences and ideas. Higher scorers tend to be imaginative and curious; lower scorers are often practical and down to earth."
    }
  };

// The maxima the assessment can actually produce. Mirrors INSTRUMENTS in
// assessments.js; a report is built from a saved profile, so the two must
// agree or a percentage bar renders wrong.
const MAXIMA = { riasec: 7, anchors: 42, vark: 16, bigfive: 40 };

module.exports = { RIASEC, ANCHORS, VARK, BIGFIVE, MAXIMA };
