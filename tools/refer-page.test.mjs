/*
  Tests for the referral dashboard — run with:  npm run refer:test

  refer.html is the page that tells a student a number they will hold us
  to. What is worth testing is not how it looks but what it says: that a
  signed-out visitor is never shown a reward, that every figure comes
  from the server rather than from a rule the page invented, that the
  page stops promising a reward once the student is at the ceiling, and
  that "try again" can actually succeed after a failure.

  The DOM is built from refer.html's own ids, so a renamed or deleted
  element fails here rather than silently in a browser.
*/

import vm from "node:vm";
import fs from "node:fs";
import assert from "node:assert/strict";

const HTML = fs.readFileSync(new URL("../refer.html", import.meta.url), "utf8");

// The page's own inline script — the last <script> block with a body.
const SCRIPT = (HTML.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map(b => b.replace(/^<script>/, "").replace(/<\/script>$/, ""))
  .filter(b => b.includes("LumeReferral"))
  .pop();

const IDS = [...HTML.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);

let passed = 0;
let failed = 0;

async function test(name, fn){
  try{
    await fn();
    passed += 1;
    console.log("  ✓ " + name);
  }catch(err){
    failed += 1;
    console.log("  ✗ " + name + "\n      " + (err && err.message || err));
  }
}

class Cls {
  constructor(){ this.set = new Set(); }
  add(...c){ c.forEach(x => this.set.add(x)); }
  remove(...c){ c.forEach(x => this.set.delete(x)); }
  contains(c){ return this.set.has(c); }
  toggle(c, on){ (on === undefined ? !this.set.has(c) : on) ? this.set.add(c) : this.set.delete(c); }
}

class Node {
  constructor(id){
    this.id = id;
    this.classList = new Cls();
    this.style = {};
    this.textContent = "";
    this.children = [];
    this.onclick = null;
  }
  appendChild(n){ this.children.push(n); n.parentNode = this; return n; }
  getContext(){
    // Enough of a 2d context for the QR painter to run.
    return { fillStyle: "", fillRect(){}, };
  }
  click(){ if(this.onclick) this.onclick({ type: "click" }); }
}

function buildPage(){
  const byId = {};
  IDS.forEach(id => { byId[id] = new Node(id); });

  // The two lookups the script makes through parentNode, wired to match
  // refer.html's actual nesting.
  const barWrap = new Node("(.bar)");
  barWrap.appendChild(byId.bar);
  const barLbl = new Node("(.barlbl)");
  barLbl.appendChild(byId.barNow);
  barLbl.appendChild(byId.barCap);

  byId.qr.width = 336;
  byId.qr.height = 336;

  return { byId, barWrap, barLbl };
}

/*
  Loads the page script against stubs we control. `referral` and
  `account` stand in for lume-referral.js and lume-auth.js.
*/
function run({ referral, account, qr } = {}){
  const page = buildPage();
  const opened = [];
  const win = {
    LumeReferral: referral,
    lumeAccount: account,
    LumeQR: qr === undefined ? { matrix: () => ({ size: 21, get: () => 1 }) } : qr,
    open: (url) => opened.push(url),
    gtag(){},
    addEventListener(){},
    prompt(){}
  };
  const doc = {
    readyState: "complete",
    getElementById: id => page.byId[id] || null
  };
  const sandbox = {
    window: win, document: doc, navigator: {}, console,
    setTimeout, clearTimeout
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox);
  return { page, opened, win };
}

const CODE = "AARA7K2P";

function referralStub(opts = {}){
  let calls = 0;
  const stub = {
    calls: () => calls,
    ready(){
      calls += 1;
      const answer = typeof opts.ready === "function" ? opts.ready(calls) : opts.ready;
      return Promise.resolve(answer === undefined ? CODE : answer);
    },
    stats: () => (typeof opts.stats === "function" ? opts.stats() : (opts.stats || null)),
    decorate: (url, code) => url + "?ref=" + code,
    inviteMessage: (lang, url) => "invite " + lang + " " + url
  };
  return stub;
}

function accountStub(user){
  const handlers = [];
  return {
    ready: () => Promise.resolve(user || null),
    prompt(){ this.prompted = true; },
    onSignIn(fn){ handlers.push(fn); },
    _signIn(){ handlers.forEach(fn => fn()); }
  };
}

// Promises resolve on the microtask queue; let them.
const settle = () => new Promise(r => setTimeout(r, 0));

function visible(page, name){
  return !page.byId[name].classList.contains("hide");
}

console.log("\nthe page's own wiring");

await test("every id the script reaches for exists in the page", () => {
  const used = [...SCRIPT.matchAll(/\$\("([^"]+)"\)/g)].map(m => m[1]);
  const missing = used.filter(id => !IDS.includes(id));
  assert.deepEqual(missing, [], "script reaches for ids the page does not define");
});

console.log("\nsigned out");

await test("a signed-out visitor sees the sign-in card and no numbers", async () => {
  const { page } = run({ referral: referralStub(), account: accountStub(null) });
  await settle();
  assert.equal(visible(page, "signedOut"), true);
  assert.equal(visible(page, "dash"), false);
  assert.equal(page.byId.sCredit.textContent, "", "no reward is shown to someone who cannot be credited");
});

await test("pressing sign in opens the account prompt", async () => {
  const account = accountStub(null);
  const { page } = run({ referral: referralStub(), account });
  await settle();
  page.byId.signIn.click();
  assert.equal(account.prompted, true);
});

await test("signing in loads the dashboard without a reload", async () => {
  const account = accountStub(null);
  const { page } = run({
    referral: referralStub({ stats: { qualified: 1, credit_earned: 50, credit_cap: 300, credit_remaining: 250, next_reward: 50 } }),
    account
  });
  await settle();
  assert.equal(visible(page, "dash"), false);
  account._signIn();
  await settle();
  assert.equal(visible(page, "dash"), true);
});

await test("a page whose modules never loaded still shows something correct", async () => {
  const { page } = run({ referral: undefined, account: undefined });
  await settle();
  assert.equal(visible(page, "signedOut"), true, "a blank page is the one unacceptable outcome");
});

console.log("\nsigned in");

const FULL = { qualified: 3, credit_earned: 150, credit_cap: 300, credit_remaining: 150, next_reward: 50 };

await test("the dashboard shows the server's numbers", async () => {
  const { page } = run({
    referral: referralStub({ stats: FULL }),
    account: accountStub({ uid: "u1" })
  });
  await settle();
  assert.equal(visible(page, "dash"), true);
  assert.equal(page.byId.sFriends.textContent, 3);
  assert.equal(page.byId.sCredit.textContent, "₹150");
  assert.equal(page.byId.bar.style.width, "50%");
  assert.equal(page.byId.barCap.textContent, "of ₹300 max");
  assert.match(page.byId.rewardLine.textContent, /₹50 of credit/);
});

await test("the link is shown with the student's own code", async () => {
  const { page } = run({ referral: referralStub({ stats: FULL }), account: accountStub({ uid: "u1" }) });
  await settle();
  assert.equal(page.byId.linkText.textContent, "lumelive.co.in/start.html?ref=" + CODE,
    "and without the scheme, which is noise on a link somebody reads aloud");
});

await test("at the ceiling the page stops promising a reward", async () => {
  const maxed = { qualified: 6, credit_earned: 300, credit_cap: 300, credit_remaining: 0, next_reward: 0 };
  const { page } = run({ referral: referralStub({ stats: maxed }), account: accountStub({ uid: "u1" }) });
  await settle();
  assert.match(page.byId.rewardLine.textContent, /full ₹300/);
  assert.equal(/earns you/.test(page.byId.rewardLine.textContent), false,
    "promising a reward that will not be paid is the one thing this line must not do");
});

await test("no stats means no invented ones, and no bar", async () => {
  const { page, } = run({ referral: referralStub({ stats: null }), account: accountStub({ uid: "u1" }) });
  await settle();
  assert.equal(visible(page, "dash"), true);
  assert.equal(page.byId.sCredit.textContent, "₹0");
  assert.equal(visible(page, "bar"), true);
  // The bar's WRAPPER is what gets hidden; with no cap there is no
  // denominator, so a progress bar would be meaningless.
  assert.equal(page.byId.bar.parentNode.classList.contains("hide"), true);
  assert.equal(/₹/.test(page.byId.rewardLine.textContent), false,
    "a rupee figure the server did not send must never appear");
});

await test("the WhatsApp invite carries the referral link", async () => {
  const { page, opened } = run({ referral: referralStub({ stats: FULL }), account: accountStub({ uid: "u1" }) });
  await settle();
  page.byId.waInvite.click();
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^https:\/\/api\.whatsapp\.com\/send\?text=/);
  assert.match(decodeURIComponent(opened[0]), new RegExp("ref=" + CODE));
});

console.log("\nwhen things go wrong");

await test("no code means the failure card, not an empty dashboard", async () => {
  const { page } = run({ referral: referralStub({ ready: "" }), account: accountStub({ uid: "u1" }) });
  await settle();
  assert.equal(visible(page, "failed"), true);
  assert.equal(visible(page, "dash"), false);
});

await test("try again really tries again", async () => {
  // The retry button is only worth having if the module underneath it
  // does not cache the failure — see lume-referral.js's ready().
  const referral = referralStub({
    ready: (n) => (n === 1 ? "" : CODE),
    stats: () => FULL
  });
  const { page } = run({ referral, account: accountStub({ uid: "u1" }) });
  await settle();
  assert.equal(visible(page, "failed"), true);

  page.byId.retry.click();
  await settle();
  assert.equal(visible(page, "dash"), true);
  assert.equal(referral.calls(), 2);
});

await test("a QR that cannot be drawn hides itself rather than showing a blank square", async () => {
  const { page } = run({
    referral: referralStub({ stats: FULL }),
    account: accountStub({ uid: "u1" }),
    qr: { matrix: () => null }
  });
  await settle();
  assert.equal(visible(page, "qrWrap"), false);
  assert.equal(visible(page, "dash"), true, "and the rest of the page is unaffected");
});

await test("a missing QR encoder is survivable", async () => {
  const { page } = run({
    referral: referralStub({ stats: FULL }),
    account: accountStub({ uid: "u1" }),
    qr: null
  });
  await settle();
  assert.equal(visible(page, "qrWrap"), false);
  assert.equal(visible(page, "dash"), true);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if(failed > 0) process.exit(1);
