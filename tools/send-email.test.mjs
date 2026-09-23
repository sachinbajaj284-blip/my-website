/*
  Tests for the sign-in code's mail sender — run with:
    npm run sendmail:test

  Every one of these is a way the send can fail while looking fine from
  here, and each has a different fix at the other end. The card now
  prints the reason, so it has to be the right reason.

  The nastiest is the 200 that is not a send: an Apps Script Web App
  deployed as "Anyone with a Google Account" answers an anonymous POST
  with Google's sign-in page, status 200, script never run. Trusting
  res.ok there would tell somebody to check an inbox for an email that
  was never written.
*/
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

async function withFetch(impl, env, fn){
  const realFetch = globalThis.fetch;
  const saved = { ...process.env };
  Object.assign(process.env, env);
  globalThis.fetch = impl;
  delete require.cache[require.resolve("../api/_lib/sendEmail.js")];
  const mod = require("../api/_lib/sendEmail.js");
  try{ return await fn(mod); }
  finally{ globalThis.fetch = realFetch; process.env = saved; }
}

const MSG = { to: "a@b.co", subject: "s", text: "t" };

await withFetch(async () => ({ ok: true, status: 200, text: async () => "sent" }),
  { AUTH_EMAIL_WEBHOOK_URL: "https://script.example/exec" },
  async (m) => { const r = await m.sendEmail(MSG); ok("a script that says 'sent' is a success", r.ok === true); });

await withFetch(async () => ({ ok: true, status: 200, text: async () => "<!DOCTYPE html><html>Sign in to continue</html>" }),
  { AUTH_EMAIL_WEBHOOK_URL: "https://script.example/exec" },
  async (m) => {
    const r = await m.sendEmail(MSG);
    ok("a 200 that is really Google's sign-in page is a failure, not a send",
       r.ok === false && r.reason === "WEBHOOK_NEEDS_ANYONE_ACCESS");
  });

await withFetch(async () => ({ ok: false, status: 401, text: async () => "no" }),
  { AUTH_EMAIL_WEBHOOK_URL: "https://script.example/exec" },
  async (m) => { const r = await m.sendEmail(MSG); ok("an HTTP error carries its status", r.reason === "WEBHOOK_401"); });

await withFetch(async () => { throw new Error("boom"); },
  { AUTH_EMAIL_WEBHOOK_URL: "https://script.example/exec" },
  async (m) => { const r = await m.sendEmail(MSG); ok("an unreachable webhook says so", r.reason === "WEBHOOK_UNREACHABLE"); });

await withFetch(async () => ({ ok: true, status: 200, text: async () => "sent" }),
  { AUTH_EMAIL_WEBHOOK_URL: "", OWNER_WEBHOOK_URL: "" },
  async (m) => { const r = await m.sendEmail(MSG); ok("no webhook at all is its own reason", r.reason === "NOT_CONFIGURED"); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
