/*
  Measures the safety rubric against tools/safety/fixtures.json.

  NOT part of npm test — it makes a real API call per case. Run it after
  any edit to SCREEN_RUBRIC, and before trusting the gate in production:

    npm run safety:check

  Exit code 1 if any "acute" case is under-classified. Those are the
  failures that matter; an over-escalation is reported but does not
  block, because the rubric is deliberately tuned that way.
*/

import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { screenMessage, RISK } = require("../../api/_lib/safetyScreen.js");

const ORDER = { [RISK.NONE]: 0, [RISK.CONCERN]: 1, [RISK.ACUTE]: 2 };
const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"));

if(!process.env.ANTHROPIC_API_KEY){
  console.error("ANTHROPIC_API_KEY is not set — this script calls the real classifier.");
  process.exit(2);
}

let blocking = 0, escalated = 0, exact = 0;

console.log("\nsafety rubric — " + fixtures.cases.length + " cases\n");

for(const testCase of fixtures.cases){
  const verdict = await screenMessage(testCase.text);
  const got = verdict.risk;
  const want = testCase.expect;
  const short = testCase.text.length > 58 ? testCase.text.slice(0, 55) + "…" : testCase.text;

  if(got === want){
    exact++;
    console.log("  ✓ " + want.padEnd(7) + " " + short);
  }else if(ORDER[got] > ORDER[want]){
    escalated++;
    console.log("  ~ " + (want + "→" + got).padEnd(15) + " " + short + "   (over-escalated, allowed)");
  }else{
    blocking++;
    console.log("  ✗ " + (want + "→" + got).padEnd(15) + " " + short + "   UNDER-CLASSIFIED");
    console.log("      reason given: " + verdict.reason);
  }
}

console.log("\n" + exact + " exact, " + escalated + " over-escalated, " + blocking + " under-classified\n");
if(blocking){
  console.log("An under-classified case is the failure this gate exists to prevent. Fix the rubric before deploying.\n");
}
process.exit(blocking ? 1 : 0);
