/*
  Tests for the checkout path — run with:  npm run checkout:test

  These exist because of a real outage. Every "Pay Securely with Cashfree"
  button on the site failed for a day, on every page, telling customers it
  was their ad blocker. The cause was a single stale line: a check for
  window.Cashfree that ran *before* the code that loads it, left behind
  when the SDK was moved to an on-demand load. Nothing in the repo noticed,
  because nothing in the repo had ever pressed the button.

  So the question these answer is the blunt one — if someone presses Pay,
  does a payment session reach Cashfree? Everything else here is in
  support of that.

  There is no browser involved (see tools/dom-stub.mjs). That buys a test
  fast enough to run on every push, and it is enough to catch anything
  that breaks the path from lumeCashfreePay() to Cashfree.checkout().
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { loadCheckoutHelper, sdkThatWorks, sdkThatFails, sdkThatIsEmpty,
         accountStub, signedInUser } from "./dom-stub.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const HELPER = path.join(ROOT, "cashfree-payments.js");
const { SKU_PRICES } = require("../api/_lib/catalog.js");

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

function group(name){ console.log("\n" + name); }

// --- helpers -------------------------------------------------------------

const ORDER = {
  order_id: "lume_test_abc123",
  cf_order_id: "cf_test",
  payment_session_id: "session_test_abc",
  order_amount: 499,
  list_amount: 499,
  discount_amount: 0,
  coupon_code: ""
};

// Records every call, so a test can assert what was sent as well as what
// came back. `calls[0].init.headers` is how the account token is checked.
function fetchStub(body = ORDER, status = 200){
  const calls = [];
  const fn = (url, init) => {
    calls.push({ url, init: init || {}, body: init && init.body ? JSON.parse(init.body) : null });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body)
    });
  };
  fn.calls = calls;
  return fn;
}

function waitFor(check, what, timeoutMs = 3000){
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll(){
      let value;
      try{ value = check(); }catch(err){ return reject(err); }
      if(value) return resolve(value);
      if(Date.now() - started > timeoutMs) return reject(new Error("timed out waiting for " + what));
      setTimeout(poll, 5);
    })();
  });
}

// What the payment modal is currently showing the client.
function modalBody(win){
  const overlay = win.document.body.children.find(c => c.className === "lcf-overlay");
  return overlay ? overlay.querySelector(".lcf-body").innerHTML : "";
}

const PAYMENT = { sku:"wellness-session", amount:499, label:"1:1 Counselling Session", customerPhone:"9999999999" };

// --- the checkout path ---------------------------------------------------

group("pressing Pay reaches Cashfree");

await test("a checkout completes when the SDK has not loaded yet", async () => {
  const record = {};
  const win = loadCheckoutHelper(HELPER, { fetch: fetchStub(), onScript: sdkThatWorks(record) });

  // The state every real page is in at this moment: the SDK is fetched on
  // demand, so nothing has defined window.Cashfree. A checkout must still
  // go through. This is the exact regression — a pre-flight check here
  // took every payment on the site down.
  assert.equal(typeof win.Cashfree, "undefined", "window.Cashfree should not exist before a checkout");

  win.lumeCashfreePay(Object.assign({}, PAYMENT));

  await waitFor(() => record.checkout, "Cashfree.checkout() to be called");
  assert.equal(record.checkout.paymentSessionId, "session_test_abc",
    "the session id from create-order must reach Cashfree");
  assert.equal(record.checkout.redirectTarget, "_modal");
});

await test("the SDK is not fetched until a checkout starts", async () => {
  const record = {};
  const win = loadCheckoutHelper(HELPER, { fetch: fetchStub(), onScript: sdkThatWorks(record) });

  // Loading it up front costs every visitor a third-party request for a
  // page most of them will never buy anything on. If this ever needs to
  // change, the guard in the test above is what stops the change from
  // silently disabling payments.
  assert.equal(win.scripts.length, 0, "no script should be injected before a checkout starts");

  win.lumeCashfreePay(Object.assign({}, PAYMENT));
  await waitFor(() => win.scripts.length > 0, "the SDK to be requested");
  assert.match(win.scripts[0].src, /sdk\.cashfree\.com/);
});

await test("an SDK that cannot be fetched shows the failure screen", async () => {
  const win = loadCheckoutHelper(HELPER, { fetch: fetchStub(), onScript: sdkThatFails() });
  win.lumeCashfreePay(Object.assign({}, PAYMENT));

  await waitFor(() => /lcf-ico err/.test(modalBody(win)), "the failure screen");
  const body = modalBody(win);
  // The client must be told what went wrong and be left a way to pay.
  assert.match(body, /Could not reach the payment provider/);
  assert.match(body, /lcf-upi/, "the UPI fallback panel must be offered");
  assert.match(body, /data-act="retry"/, "the client must be able to try again");
});

await test("an SDK that loads without starting fails cleanly", async () => {
  const win = loadCheckoutHelper(HELPER, { fetch: fetchStub(), onScript: sdkThatIsEmpty() });
  win.lumeCashfreePay(Object.assign({}, PAYMENT));

  await waitFor(() => /lcf-ico err/.test(modalBody(win)), "the failure screen");
  // Escaped on the way into the modal, hence the loose match on the apostrophe.
  assert.match(modalBody(win), /script loaded but didn.{0,6}t start/);
});

await test("a failed SDK load can be retried in the same session", async () => {
  const record = {};
  let attempt = 0;
  const win = loadCheckoutHelper(HELPER, {
    fetch: fetchStub(),
    onScript: (script, w) => {
      attempt += 1;
      // Fail once, then behave — the client's connection came back.
      if(attempt === 1) return sdkThatFails()(script, w);
      return sdkThatWorks(record)(script, w);
    }
  });

  win.lumeCashfreePay(Object.assign({}, PAYMENT));
  await waitFor(() => /lcf-ico err/.test(modalBody(win)), "the first attempt to fail");

  // A cached rejection would make every later attempt fail without so much
  // as a request, leaving "Try payment again" permanently broken.
  win.lumeCashfreePay(Object.assign({}, PAYMENT));
  await waitFor(() => record.checkout, "the retry to reach Cashfree");
  assert.equal(record.checkout.paymentSessionId, "session_test_abc");
});

await test("a refused order shows the client an error rather than hanging", async () => {
  const record = {};
  const win = loadCheckoutHelper(HELPER, {
    fetch: fetchStub({ error: "Unknown payment item." }, 400),
    onScript: sdkThatWorks(record)
  });
  win.lumeCashfreePay(Object.assign({}, PAYMENT));

  await waitFor(() => /lcf-ico err/.test(modalBody(win)), "the failure screen");
  assert.equal(record.checkout, undefined, "no checkout should open without an order");
});

await test("the amount the server priced replaces the page's", async () => {
  const record = {};
  const win = loadCheckoutHelper(HELPER, {
    // The client typed a coupon: the server charges 249, the page said 499.
    fetch: fetchStub(Object.assign({}, ORDER, { order_amount:249, list_amount:499, discount_amount:250, coupon_code:"FIRST50" })),
    onScript: sdkThatWorks(record)
  });
  const options = Object.assign({}, PAYMENT);
  win.lumeCashfreePay(options);

  await waitFor(() => record.checkout, "Cashfree.checkout() to be called");
  assert.equal(options.amount, 249, "the modal must show what is actually being charged");
  assert.equal(options.couponCode, "FIRST50");
});

// --- the account behind the purchase -------------------------------------

group("every purchase belongs to an account");

await test("a signed-out client is asked for an account, and no order is created", async () => {
  const record = {};
  const fetchFn = fetchStub();
  const win = loadCheckoutHelper(HELPER, {
    fetch: fetchFn, onScript: sdkThatWorks(record), account: accountStub(null)
  });
  win.lumeCashfreePay(Object.assign({}, PAYMENT));

  await waitFor(() => /data-act="signup"/.test(modalBody(win)), "the account screen");
  // Nothing was priced, nothing was reserved at Cashfree, nothing charged.
  assert.equal(fetchFn.calls.length, 0, "no order should be created for a signed-out client");
  assert.equal(record.checkout, undefined, "no checkout should open");
  assert.match(modalBody(win), /account/i);
});

await test("a signed-in client's token is sent with the order", async () => {
  const record = {};
  const fetchFn = fetchStub();
  const win = loadCheckoutHelper(HELPER, {
    fetch: fetchFn, onScript: sdkThatWorks(record), account: accountStub(signedInUser())
  });
  win.lumeCashfreePay(Object.assign({}, PAYMENT));

  await waitFor(() => record.checkout, "Cashfree.checkout() to be called");
  const headers = fetchFn.calls[0].init.headers;
  // create-order decides whose purchase this is from the token alone, so
  // a checkout that forgets to send it is a checkout the server refuses.
  assert.equal(headers.Authorization, "Bearer id-token-uid_test");
});

await test("the account fills in contact details the page didn't collect", async () => {
  const record = {};
  const fetchFn = fetchStub();
  const win = loadCheckoutHelper(HELPER, {
    fetch: fetchFn, onScript: sdkThatWorks(record), account: accountStub(signedInUser())
  });
  // internships and the handbook collect their own details; the session
  // modal on index.html doesn't always have an email.
  win.lumeCashfreePay({ sku:"wellness-session", amount:499, label:"1:1 Counselling Session" });

  await waitFor(() => record.checkout, "Cashfree.checkout() to be called");
  assert.equal(fetchFn.calls[0].body.customer.email, "client@example.com");
  assert.equal(fetchFn.calls[0].body.customer.name, "A Client");
});

await test("a page's own details are not overwritten by the account", async () => {
  const record = {};
  const fetchFn = fetchStub();
  const win = loadCheckoutHelper(HELPER, {
    fetch: fetchFn, onScript: sdkThatWorks(record), account: accountStub(signedInUser())
  });
  win.lumeCashfreePay(Object.assign({}, PAYMENT, {
    customerEmail:"typed@example.com", customerName:"Typed Name"
  }));

  await waitFor(() => record.checkout, "Cashfree.checkout() to be called");
  assert.equal(fetchFn.calls[0].body.customer.email, "typed@example.com");
  assert.equal(fetchFn.calls[0].body.customer.name, "Typed Name");
});

await test("signing in from the account screen resumes the same checkout", async () => {
  const record = {};
  const fetchFn = fetchStub();
  const account = accountStub(null);
  const win = loadCheckoutHelper(HELPER, {
    fetch: fetchFn, onScript: sdkThatWorks(record), account
  });
  win.lumeCashfreePay(Object.assign({}, PAYMENT));

  await waitFor(() => /data-act="signup"/.test(modalBody(win)), "the account screen");

  // The client presses "Create account & continue", and completes it.
  const overlay = win.document.body.children.find(c => c.className === "lcf-overlay");
  overlay.querySelector(".lcf-body").querySelector('[data-act="signup"]').click();
  assert.deepEqual(account.prompts, ["signup"], "the sign-in UI should have been opened");
  account.signIn();

  // They must land back in their payment, not at the beginning of it.
  await waitFor(() => record.checkout, "the checkout to resume after signing in");
  assert.equal(record.checkout.paymentSessionId, "session_test_abc");
});

await test("a sign-in the server rejects returns the client to the account screen", async () => {
  const record = {};
  // The sign-in expired while the page sat open: the browser still thinks
  // it has a user, the server disagrees.
  const fetchFn = fetchStub({ error:"Your sign-in has expired. Please sign in again to complete your payment.", code:"INVALID_ACCOUNT" }, 401);
  const win = loadCheckoutHelper(HELPER, {
    fetch: fetchFn, onScript: sdkThatWorks(record), account: accountStub(signedInUser())
  });
  win.lumeCashfreePay(Object.assign({}, PAYMENT));

  await waitFor(() => /data-act="signup"/.test(modalBody(win)), "the account screen");
  assert.equal(record.checkout, undefined, "no checkout should open on a refused sign-in");
});

await test("a missing account layer does not block the payment path", async () => {
  const record = {};
  const fetchFn = fetchStub();
  // lume-auth.js failed to load. The gate still holds — create-order
  // enforces it — so the request goes and the server answers. Blocking
  // here instead would make one missing script a second way to take
  // every payment on the site down, which is how the last outage worked.
  const win = loadCheckoutHelper(HELPER, { fetch: fetchFn, onScript: sdkThatWorks(record) });
  assert.equal(typeof win.lumeAccount, "undefined");
  win.lumeCashfreePay(Object.assign({}, PAYMENT));

  await waitFor(() => fetchFn.calls.length > 0, "the order request to be attempted");
});

// --- every checkout the site offers --------------------------------------

group("every checkout the site offers");

const PAGES = fs.readdirSync(ROOT)
  .filter(f => /\.(html|js)$/.test(f))
  .map(f => ({ file:f, text:fs.readFileSync(path.join(ROOT, f), "utf8") }));

// The SKUs actually handed to a payment: those in a lumeCashfreePay call,
// and those on a coupon widget (which prices against the same catalogue).
function paymentSkus(text){
  const found = new Set();
  const calls = /lumeCashfreePay\s*\(/g;
  let m;
  while((m = calls.exec(text))){
    const window_ = text.slice(m.index, m.index + 600);
    const sku = /sku\s*:\s*["']([a-z0-9-]+)["']/.exec(window_);
    // A computed sku (sku:l.sku, sku:currentPlan) is checked through its
    // plan map below instead.
    if(sku) found.add(sku[1]);
  }
  const widgets = /data-sku="([a-z0-9-]+)"/g;
  while((m = widgets.exec(text))) found.add(m[1]);
  return found;
}

await test("every sku handed to a checkout exists in the catalogue", () => {
  const bad = [];
  for(const { file, text } of PAGES){
    for(const sku of paymentSkus(text)){
      if(!SKU_PRICES[sku]) bad.push(file + " -> " + sku);
    }
  }
  // An unknown sku is a 400 from create-order: the client presses Pay and
  // is told "Unknown payment item."
  assert.deepEqual(bad, [], "these skus would be refused by create-order:\n      " + bad.join("\n      "));
});

await test("every price shown next to a sku matches the catalogue", () => {
  const wrong = [];
  for(const { file, text } of PAGES){
    for(const [sku, product] of Object.entries(SKU_PRICES)){
      // Both shapes the site uses: {sku:"x", amount:N} and "x":{...amount:N}.
      const patterns = [
        new RegExp('sku\\s*:\\s*["\']' + sku + '["\'][\\s\\S]{0,160}?amount\\s*:\\s*(\\d+)', "g"),
        new RegExp('["\']' + sku + '["\']\\s*:\\s*\\{[^}]{0,240}?amount\\s*:\\s*(\\d+)', "g")
      ];
      for(const re of patterns){
        let m;
        while((m = re.exec(text))){
          if(Number(m[1]) !== product.amount){
            wrong.push(file + " -> " + sku + ": page says " + m[1] + ", catalogue says " + product.amount);
          }
        }
      }
    }
  }
  // The page is only ever a display: create-order charges the catalogue
  // price. A mismatch means a client agrees to one number and is asked
  // for another at the gateway.
  assert.deepEqual(wrong, [], "page prices disagree with the catalogue:\n      " + wrong.join("\n      "));
});

await test("the report checkout always shows its coupon box", () => {
  /*
    The coupon field hides itself unless /api/coupons/active lists the sku
    (promoted offers only), a code is stashed, or ?coupon= is in the URL.
    An unpromoted invitation code satisfies none of those, so without
    data-always-show there is nowhere on the ₹999 report checkout to type
    one — which is exactly the state CLARITY100 shipped into.
  */
  const hosts = [];
  for(const { file, text } of PAGES){
    const re = /<div[^>]*data-lume-coupon-checkout[^>]*>/g;
    let m;
    while((m = re.exec(text))){
      if(/data-sku="student-full-report"/.test(m[0])){
        hosts.push({ file, tag: m[0] });
      }
    }
  }
  assert.ok(hosts.length >= 2, "expected a report coupon host on both index.html and assessment.html");
  const missing = hosts.filter(h => !/data-always-show/.test(h.tag)).map(h => h.file);
  assert.deepEqual(missing, [], "report checkouts without data-always-show: " + missing.join(", "));
});

await test("every page with a checkout loads the checkout helper", () => {
  const missing = PAGES
    .filter(p => /\.html$/.test(p.file))
    .filter(p => /lumeCashfreePay\s*\(/.test(p.text))
    .filter(p => !/src="cashfree-payments\.js"/.test(p.text))
    .map(p => p.file);
  // Without the script the button calls a function that does not exist,
  // and the page falls back to "Cashfree checkout is still loading" for ever.
  assert.deepEqual(missing, [], "pages calling lumeCashfreePay without the script: " + missing.join(", "));
});

// --- result --------------------------------------------------------------

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
