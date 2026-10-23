/**
 * Phase 3 UI review — driven through a real browser.
 *
 * Every step clicks what a student would click and reads the DOM that
 * actually renders. HTTP-only assertions are not enough: a 200 says
 * nothing about whether a button is reachable, or whether a plan reordered.
 *
 * Requires Edge on the CDP port:
 *   msedge --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp>
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./cdp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const creds = JSON.parse(readFileSync(join(ROOT, ".smoke-credentials.json"), "utf8"));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + name + (detail ? " \u2014 " + detail : ""));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await connect();

/* == 0. sign in through the real form == */
console.log("\n[0] login");
await b.setViewport(1440, 900);
await b.goto("http://localhost:3000/login");
const filled = await b.evaluate(`(() => {
  const inputs = [...document.querySelectorAll("input")];
  const pass = inputs.find(i => i.type === "password");
  const email = inputs.find(i => i.type === "email") || inputs.find(i => /mail/i.test(i.name + i.id + i.placeholder));
  if (!pass || !email) return "missing";
  const setVal = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  setVal(email, ${JSON.stringify(creds.email)});
  setVal(pass, ${JSON.stringify(creds.password)});
  return "ok";
})()`);
check("credentials filled into the real form", filled === "ok", String(filled).slice(0, 60));
const clicked = await b.evaluate(`(() => {
  const btn = [...document.querySelectorAll("button,input[type=submit]")].find(x => /\u062f\u062e\u0648\u0644|login/i.test(x.innerText || x.value || ""));
  if (!btn) return false; btn.click(); return true;
})()`);
check("login button clicked", clicked === true);
const left = await b.waitFor(`location.pathname !== "/login"`, 30000);
check("signed in (left /login)", left, await b.evaluate("location.pathname"));
await sleep(1800);

/* == 1. dashboard entry point == */
console.log("\\n[1] dashboard");
await b.goto("http://localhost:3000/dashboard");
await b.waitFor(`document.body.innerText.length > 200`, 20000);
await sleep(1800);
const linkInfo = await b.evaluate(`(() => {
  const a = [...document.querySelectorAll("a")].find(x => (x.getAttribute("href") || "").includes("/diagnostic"));
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return { visible: r.width > 0 && r.height > 0, w: Math.round(r.width), h: Math.round(r.height), text: a.innerText.trim().replace(/\\n/g," ") };
})()`);
check("dashboard shows a /diagnostic link", !!linkInfo);
check("the link is visible and clickable", !!linkInfo && linkInfo.visible && linkInfo.h > 24, linkInfo ? linkInfo.w + "x" + linkInfo.h : "");
await b.click('a[href="/diagnostic"]');
const onDiag = await b.waitFor(`location.pathname === "/diagnostic"`, 20000);
check("clicking it navigates to /diagnostic", onDiag, await b.evaluate("location.pathname"));
await sleep(1800);

/* == 2. intro == */
console.log("\\n[2] intro");
const introText = await b.text();
check("intro copy rendered", /تشخيص سريع/.test(introText));
check("subject resolved server-side", /الرياضيات/.test(introText), (introText.match(/في [^\\n]{2,30}/) || [""])[0]);
check("start button present", await b.evaluate(`!![...document.querySelectorAll("button")].find(x=>/ابدأ التشخيص/.test(x.innerText))`));
// NOTE: this project throws a pre-existing "SyntaxError: Unexpected token
// ')'" on /login, /faq and /exams alike. Recorded, not counted as a Phase 3
// regression.
const errs0 = b.consoleLog.filter(c => c.type === "error");
check("no console errors before starting", errs0.length === 0, JSON.stringify(errs0).slice(0, 150));

/* == 3. questions == */
console.log("\\n[3] questions");
await b.click("button");
const gotQ = await b.waitFor(`document.querySelectorAll("ol > li").length > 0`, 25000);
check("questions rendered after Start", gotQ);
const qInfo = await b.evaluate(`(() => {
  const items = [...document.querySelectorAll("ol > li")];
  return { count: items.length, options: items.map(li => li.querySelectorAll("button").length) };
})()`);
check("10 questions", qInfo && qInfo.count === 10, "got " + (qInfo && qInfo.count));
check("every question offers options", qInfo && qInfo.options.every(n => n >= 2), JSON.stringify(qInfo && qInfo.options));
const leak = await b.evaluate(`(() => {
  const h = document.documentElement.outerHTML;
  return ["correct_option_index","correctOptionIndex","correct_answer","answer_key"].filter(k => h.includes(k));
})()`);
check("no answer key in the rendered DOM", (leak || []).length === 0, (leak || []).join(","));

/* == 4. answer everything == */
console.log("\\n[4] answering");
const answered = await b.evaluate(`(() => {
  const items = [...document.querySelectorAll("ol > li")];
  let n = 0;
  for (const li of items) { const x = li.querySelectorAll("button"); if (x.length) { x[0].click(); n++; } }
  return n;
})()`);
check("an option was selected on every question", answered === 10, "clicked " + answered);
await sleep(800);
const prog = await b.evaluate("(() => { const t = document.body.innerText; const i = t.indexOf(String.fromCharCode(1571)); return i >= 0 ? t.slice(i, i + 30).replace(/\\n/g, \" \") : \"\"; })()");
check("progress counter reflects the answers", prog.length > 0, prog);
check("submit button is enabled", await b.evaluate(`(() => { const x=[...document.querySelectorAll("button")].find(y=>/سلّم|سلم/.test(y.innerText)); return x ? !x.disabled : false; })()`));

/* == 5. submit, watching for a double submission == */
console.log("\\n[5] submit");
const netBefore = b.networkLog.length;
await b.evaluate(`(() => { const x=[...document.querySelectorAll("button")].find(y=>/سلّم|سلم/.test(y.innerText)); if(x) x.click(); })()`);
await sleep(150);
const guard = await b.evaluate(`(() => {
  const x = [...document.querySelectorAll("button")].find(y=>/سلّم|سلم/.test(y.innerText));
  if (!x) return "gone";
  if (x.disabled) return "disabled";
  x.click(); x.click();
  return "clicked-again";
})()`);
check("submit is guarded against a double click", guard === "disabled" || guard === "gone", guard);
const submits = b.networkLog.slice(netBefore).filter(n => n.url.includes("/api/diagnostic/submit"));
check("no duplicate submit request", submits.length <= 1, submits.length + " request(s)");

const gotResult = await b.waitFor(/خلصت التشخيص/, 35000);
check("result screen rendered", gotResult);
await sleep(1500);

const resText = await b.text();
check("quiz is gone from the DOM", (await b.evaluate(`document.querySelectorAll("ol > li").length`)) === 0);
check("score shown on the result card", /خلصت التشخيص/.test(resText), (resText.match(/[^\n]*\u2044[^\n]*/) || [""])[0].trim());
check("percentage and correct count shown", /٪/.test(resText) && /إجابة صحيحة/.test(resText));
check("weak topics carry a marker", /🔴/.test(resText), (resText.match(/🔴[^\\n]*/g) || []).join(", "));
check("no raw UUID rendered as a topic", !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(resText));
check("plan change notice shown", /عدّلنا خطتك|مش قادرين نحدّث/.test(resText));
check("planner reason rendered verbatim", /لأن مستواك|بقى في الأول|راجعنا|زدنا|حوّلنا|أضفنا/.test(resText),
  (resText.match(/[^\\n]*(?:مستواك|خطتك)[^\\n]*/g) || []).join(" || ").slice(0, 180));
const errs1 = b.consoleLog.filter(c => c.type === "error");
check("no console errors after the flow", errs1.length === 0, JSON.stringify(errs1).slice(0, 200));

/* == 6. plan link and its consistency == */
console.log("\\n[6] plan");
const planHref = await b.evaluate(`(() => { const a=[...document.querySelectorAll("a")].find(x=>/خطتك/.test(x.innerText)); return a ? a.getAttribute("href") : null; })()`);
check("a link to the plan is offered", !!planHref, String(planHref));
if (planHref) {
  await b.evaluate(`(() => { const a=[...document.querySelectorAll("a")].find(x=>/خطتك/.test(x.innerText)); if(a) a.click(); })()`);
  await sleep(2800);
  const planText = await b.text();
  check("plan view rendered", /خطة|امتحان/.test(planText), planText.slice(0, 70).replace(/\\n/g, " | "));
  await b.goto("http://localhost:3000/diagnostic");
  await sleep(1800);
}

/* == 7. refresh == */
console.log("\\n[7] refresh");
const before = b.networkLog.filter(n => n.url.includes("/api/diagnostic/submit")).length;
await b.goto("http://localhost:3000/diagnostic");
await sleep(2800);
const nav = await b.evaluate(`(() => ({
  hasIntro: /ابدأ التشخيص/.test(document.body.innerText),
  hasQuiz: document.querySelectorAll("ol > li").length,
  error: /مش قادرين|حصل خطأ/.test(document.body.innerText),
}))()`);
check("refresh lands on a usable state", nav.hasIntro || nav.hasQuiz > 0, JSON.stringify(nav));
check("refresh shows no error state", !nav.error);
const after = b.networkLog.filter(n => n.url.includes("/api/diagnostic/submit")).length;
check("refresh did not resubmit", after === before, before + " -> " + after);

/* == 8. responsive == */
console.log("\\n[8] responsive");
await b.setViewport(1440, 900);
await b.goto("http://localhost:3000/diagnostic");
await sleep(2500);
const desk = await b.evaluate(`(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }))()`);
check("desktop: no horizontal overflow", desk.sw <= desk.vw + 2, desk.sw + "/" + desk.vw);

await b.setViewport(390, 844);
await sleep(1800);
const mob = await b.evaluate(`(() => {
  const btn = [...document.querySelectorAll("button")].find(x => /ابدأ التشخيص/.test(x.innerText));
  const r = btn ? btn.getBoundingClientRect() : null;
  return { sw: document.documentElement.scrollWidth, vw: window.innerWidth, ok: !!r && r.width > 40 && r.height > 30, w: r ? Math.round(r.width) : 0 };
})()`);
check("mobile: no horizontal overflow", mob.sw <= mob.vw + 2, mob.sw + "/" + mob.vw);
check("mobile: start button large enough to tap", mob.ok, mob.w + "px wide");

await b.click("button");
const mobQ = await b.waitFor(`document.querySelectorAll("ol > li").length > 0`, 25000);
check("mobile: questions render", mobQ);
const mobQ2 = await b.evaluate(`(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }))()`);
check("mobile: quiz has no horizontal overflow", mobQ2.sw <= mobQ2.vw + 2, mobQ2.sw + "/" + mobQ2.vw);
const tap = await b.evaluate(`(() => { const b = document.querySelector("ol > li button"); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`);
check("mobile: option buttons tappable", !!tap && tap.h >= 32, tap ? tap.w + "x" + tap.h : "none");

await b.setViewport(1440, 900);
const passed = results.filter(r => r.ok).length;
console.log("\\nSUMMARY  " + passed + "/" + results.length + " passed");
for (const r of results) if (!r.ok) console.log("  FAILED: " + r.name);
b.close();
process.exit(passed === results.length ? 0 : 1);
