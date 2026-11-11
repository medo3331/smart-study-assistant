/**
 * Navbar smoke test — يشغّل المتصفح الحقيقي ويقيس حاجات محددة.
 *
 * الهدف: يمنع رجوع الـ bugs اللي اتكشفت فعلاً وقت شغل الـ navbar:
 *   1. الشريط بيغطي عنصر من الصفحة (فهرس/عنوان بيختفي تحت الشريط).
 *   2. ارتفاع الشريط مش مطابق لـ `--nav-h` (56px) → الـ `calc(100dvh - var(--nav-h))`
 *      في الصفحات اللي بتملأ الشاشة بيبقى غلط، وبيطلع scrollbar مزدوج.
 *   3. شريط الكتابة في الشات (composer) مش ظاهر فوق الـ fold.
 *
 * ⚠️ مش جزء من CI — بيشتغل على جهاز فيه Edge + شغّال `npm run dev`.
 *    التشغيل: `npm run check:navbar`
 *
 * ⚠️ الصفحة بتتصل بـ localhost:3000. لو السيرفر مش شغّال، السكربت
 *    بيقولك إنك تشغّل `npm run dev` الأول.
 */
import { connect } from "./cdp.mjs";
import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/* ------------------------------------------------------------------ */
/* إعدادات                                                            */
/* ------------------------------------------------------------------ */

/** السيرفر اللي بيتختبر عليه. */
const BASE_URL = process.env.NAVSMOKE_URL ?? "http://localhost:3000";

/** بورت الـ CDP — لازم يبقى زي اللي `cdp.mjs` بيفتح بيه (`9222`). */
const CDP_PORT = 9222;

/** الصفحات اللي بنختبرها — 6 صفحات × 2 viewport. */
const PAGES = [
  { path: "/shop", label: "المتجر" },
  { path: "/community", label: "المجتمع" },
  { path: "/missions", label: "المهام اليومية" },
  { path: "/worship", label: "العبادات" },
  { path: "/lesson/1", label: "صفحة درس" },
  { path: "/chat", label: "المساعد" },
];

/** الـ viewports اللي بنختبر عليها. */
const VIEWPORTS = [
  { width: 1440, height: 900, label: "desktop" },
  { width: 390, height: 844, label: "mobile" },
];

/** ارتفاع الشريط المتوقع — لازم يطابق `--nav-h` في `app/globals.css`. */
const EXPECTED_NAV_HEIGHT = 56;

/**
 * سُماح الـ overflow اللي إحنا عارفينه ومستRecorded في `docs/TECH_DEBT.md`:
 *   - 56px: الشريط العلوي `sticky` — بياخد مكان من الـ flow، والصفحات
 *     اللي shell بتاعها `min-h-screen` (PageShell) بتطلع 56px زيادة.
 *   - 36px: جرس `NotificationBell` — `position: relative` جوّه root layout.
 *
 * أي overflow أكبر من ده = regression جديد، مش known issue.
 * (N-006 = جرس الإشعارات، N-007 = الشريط sticky مع `min-h-screen`.)
 */
const KNOWN_LAYOUT_OVERFLOW = EXPECTED_NAV_HEIGHT + 36;

/** حد اعتبار الـ scroller الداخلي "page-like" (شبه صفحة كاملة). */
const PAGE_LIKE_SCROLLER_RATIO = 0.6;

/**
 * صفحات الـ auth — مفيش فيها الشريط العلوي أصلاً (لكل واحدة ترويستتها).
 *
 * بعض الصفحات محتاجة تسجيل دخول (زي `/lesson/[dayId]` — بتروح لـ `/login`
 * لما الـ session مش موجود). السكربت بيتعامل معاها كـ **skip** مش failure:
 * القياس عليها معناه لا شيء لأن الشريط مش موجود هناك أصلاً.
 */
const AUTH_PATHS = ["/login", "/register"];

/** مسار Edge. أول واحد موجود بيتستخدم. */
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter(Boolean) as string[];

type Check = { name: string; ok: boolean | "skip"; detail: string };

/** نتيجة الفحص جوه المتصفح — بترجع من `b.evaluate`. */
type PageProbe = {
  finalPath: string;
  navPresent: boolean;
  navHeight: number | null;
  covered: { text: string; top: number }[];
  coveredCount: number;
  pageOverflowPx: number;
  innerScrollers: { height: number; scrollable: boolean }[];
  pageLikeScrollers: number;
  composerPresent: boolean;
  composerTop: number | null;
  composerBottom: number | null;
  composerVisible: boolean | null;
  chatRoot: { top: number; bottom: number; height: number } | null;
  viewportH: number;
};

/* ------------------------------------------------------------------ */
/* أدوات مساعدة                                                       */
/* ------------------------------------------------------------------ */

function findEdge(): string | null {
  for (const candidate of EDGE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(4000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

/** هل فيه حاجة شغّالة أصلاً على بورت الـ CDP؟ */
async function isCdpUp(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** يشغّل Edge headless على بورت CDP. يرجع عملية نقدر نقتلها. */
function launchEdge(profileDir: string): ChildProcess | null {
  const edge = findEdge();
  if (!edge) return null;
  return spawn(
    edge,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore", detached: false },
  );
}

/* ------------------------------------------------------------------ */
/* الفحوصات                                                           */
/* ------------------------------------------------------------------ */

/**
 * فحص صفحة واحدة في viewport واحد.
 *
 * بيرجع قايمة فحوصات. كل فحص له اسم و`ok` و`detail`.
 */
async function checkPage(
  b: Awaited<ReturnType<typeof connect>>,
  page: { path: string; label: string },
  viewport: { width: number; height: number; label: string },
): Promise<Check[]> {
  await b.setViewport(viewport.width, viewport.height);
  await b.goto(`${BASE_URL}${page.path}`);

  // ⚠️ في `next dev` أول زيارة لمسار بتاخد وقت compile — نستنى لحد ما
  //    الـ DOM يبقى فيه الشريط. ولو الصفحة محتاجة تسجيل دخول هتروح
  //    `/login` (مفيش شريط هناك) ⇒ نستنى التحويل كمان.
  await b.waitFor(
    `document.querySelector("header.sticky") || ${AUTH_PATHS.map((p) => `location.pathname === ${JSON.stringify(p)}`).join(" || ")}`,
    15000,
  );
  await sleep(400);

  const raw = (await b.evaluate(`(() => {
    const de = document.documentElement;

    // الشريط: <header class="sticky ..."> وفيه سطر بارتفاع h-14 جوّاه
    const header = document.querySelector("header.sticky");
    const bar = header ? header.querySelector(":scope > div") : null;
    const barRect = bar ? bar.getBoundingClientRect() : null;

    // العناصر اللي الشريط بيغطيها.
    // ⚠️ لازم نتجاهل عناصر الشريط نفسه (هي جوه الـ header طبعاً)،
    //    وإلا كل زرار في القايمة بيتحسب "مغطّى" — false positive.
    const covered = [];
    if (barRect) {
      for (const el of document.querySelectorAll("p, span, button, a, h1, h2, h3, li, label")) {
        if (header.contains(el)) continue;
        const text = (el.textContent || "").trim();
        if (!text) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        // تقاطع العنصر مع شريط الـ navbar
        const top = Math.max(r.top, barRect.top);
        const bottom = Math.min(r.bottom, barRect.bottom);
        const left = Math.max(r.left, barRect.left);
        const right = Math.min(r.right, barRect.right);
        if (bottom - top < 2 || right - left < 2) continue;

        // النقطة في نص التقاطع: لو اللي فوقها هو الشريط ⇒ العنصر مغطّى
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        if (hit && header.contains(hit)) {
          covered.push({ text: text.slice(0, 40), top: Math.round(r.top) });
        }
      }
    }

    // الـ scrollers الداخلية
    const innerScrollers = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.overflowY !== "auto" && cs.overflowY !== "scroll") continue;
      const r = el.getBoundingClientRect();
      innerScrollers.push({
        height: Math.round(r.height),
        scrollable: el.scrollHeight > el.clientHeight + 2,
      });
    }
    const pageLikeScrollers = innerScrollers.filter(
      (s) => s.scrollable && s.height >= window.innerHeight * ${PAGE_LIKE_SCROLLER_RATIO},
    ).length;

    // الـ composer في الشات
    const composer = document.querySelector("textarea");
    const composerRect = composer ? composer.getBoundingClientRect() : null;

    // حاوية الشات (flex + h-[calc(100dvh - var(--nav-h))])
    const chatRoot = document.querySelector('[class*="100dvh"]');
    const chatRect = chatRoot ? chatRoot.getBoundingClientRect() : null;

    return {
      finalPath: location.pathname,
      navPresent: !!bar,
      navHeight: barRect ? Math.round(barRect.height) : null,
      covered: covered.slice(0, 8),
      coveredCount: covered.length,
      pageOverflowPx: de.scrollHeight - de.clientHeight,
      innerScrollers: innerScrollers.slice(0, 6),
      pageLikeScrollers,
      composerPresent: !!composer,
      composerTop: composerRect ? Math.round(composerRect.top) : null,
      composerBottom: composerRect ? Math.round(composerRect.bottom) : null,
      composerVisible: composerRect
        ? composerRect.bottom <= window.innerHeight && composerRect.top >= 0
        : null,
      chatRoot: chatRect
        ? { top: Math.round(chatRect.top), bottom: Math.round(chatRect.bottom), height: Math.round(chatRect.height) }
        : null,
      viewportH: window.innerHeight,
    };
  })()`)) as PageProbe;

  const r = raw;
  const checks: Check[] = [];
  const id = `${page.path} @ ${viewport.label}`;

  // 0) الصفحة محتاجة تسجيل دخول ⇒ نقيسها مينفعش. نتخطاها (مش failure).
  if (AUTH_PATHS.includes(r.finalPath)) {
    checks.push({
      name: `${id} — skipped (auth required)`,
      ok: "skip",
      detail: `landed on ${r.finalPath}`,
    });
    return checks;
  }

  // 0b) الصفحة ما اتحوّلتش (تحويل تاني = auth redirect = قياس فاشل)
  checks.push({
    name: `${id} — no redirect`,
    ok: r.finalPath === page.path,
    detail: r.finalPath === page.path ? "ok" : `landed on ${r.finalPath}`,
  });

  // 1) الشريط موجود
  checks.push({
    name: `${id} — navbar present`,
    ok: r.navPresent,
    detail: r.navPresent ? `h=${r.navHeight}px` : "no header.sticky found",
  });

  // 2) ارتفاع الشريط = --nav-h بالظبط
  if (r.navPresent) {
    checks.push({
      name: `${id} — navbar height == ${EXPECTED_NAV_HEIGHT}`,
      ok: r.navHeight === EXPECTED_NAV_HEIGHT,
      detail: r.navHeight === EXPECTED_NAV_HEIGHT ? "ok" : `got ${r.navHeight}px`,
    });
  }

  // 3) مفيش عنصر تحت الشريط
  checks.push({
    name: `${id} — no content covered by navbar`,
    ok: r.coveredCount === 0,
    detail:
      r.coveredCount === 0
        ? "ok"
        : `${r.coveredCount} covered: ` +
          r.covered.map((c) => `"${c.text}"@${c.top}`).join(", "),
  });

  // 4) مفيش scrollbar مزدوج: صفحة بتسكرول **و** scroller داخلي شبيه بصفحة.
  //    الـ overflow المسموح هو الـ known layout overflow بس
  //    (N-006 + N-007) — أي زيادة فوقه regression.
  const hasDoubleScroll =
    r.pageLikeScrollers > 0 && r.pageOverflowPx > KNOWN_LAYOUT_OVERFLOW;
  checks.push({
    name: `${id} — no double scrollbar`,
    ok: !hasDoubleScroll,
    detail:
      `page=+${r.pageOverflowPx}px inner=${r.pageLikeScrollers} page-like` +
      (hasDoubleScroll
        ? ` ← DOUBLE SCROLL (>${KNOWN_LAYOUT_OVERFLOW}px)`
        : r.pageOverflowPx > KNOWN_LAYOUT_OVERFLOW
          ? " (long page, no inner scroller — ok)"
          : ""),
  });

  // 5) حاوية الشات لازم تملأ الشاشة بالظبط: من تحت الـ nav لحد أسفل الـ viewport
  if (r.chatRoot) {
    checks.push({
      name: `${id} — chat container fits viewport`,
      ok:
        r.chatRoot.bottom <= r.viewportH + 1 &&
        r.chatRoot.top >= EXPECTED_NAV_HEIGHT - 1,
      detail: `top=${r.chatRoot.top} bottom=${r.chatRoot.bottom} viewport=${r.viewportH}`,
    });
  }

  // 6) الـ composer في الشات ظاهر فوق الـ fold
  if (r.composerPresent) {
    checks.push({
      name: `${id} — chat composer visible`,
      ok: r.composerVisible === true,
      detail:
        r.composerVisible === true
          ? `bottom=${r.composerBottom} <= ${r.viewportH}`
          : `bottom=${r.composerBottom} vs viewport ${r.viewportH}`,
    });
  }

  return checks;
}

/* ------------------------------------------------------------------ */
/* التشغيل                                                            */
/* ------------------------------------------------------------------ */

async function main() {
  if (!(await isServerUp())) {
    console.error(`\n❌ السيرفر مش شغّال على ${BASE_URL}.`);
    console.error("   شغّله الأول:  npm run dev\n");
    process.exit(2);
  }

  // لو مفيش Edge شغّال على البورت، شغّل واحد headless
  let edgeProcess: ChildProcess | null = null;
  let cdpReady = await isCdpUp();
  if (!cdpReady) {
    const edge = findEdge();
    if (!edge) {
      console.error("\n❌ مفيش Edge/Chrome. حطّ المسار في EDGE_PATH.\n");
      process.exit(2);
    }
    const profileDir = `${process.env.TEMP ?? "."}/navsmoke-profile`;
    edgeProcess = launchEdge(profileDir);
    for (let i = 0; i < 40 && !cdpReady; i++) {
      await sleep(500);
      cdpReady = await isCdpUp();
    }
    if (!cdpReady) {
      console.error("\n❌ Edge ما اشتغلش على بورت CDP.\n");
      edgeProcess?.kill();
      process.exit(2);
    }
  }

  const b = await connect();
  const all: Check[] = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const page of PAGES) {
        all.push(...(await checkPage(b, page, viewport)));
      }
    }
  } finally {
    b.close();
    edgeProcess?.kill();
  }

  // التقرير
  let failed = 0;
  let passed = 0;
  let skipped = 0;
  for (const c of all) {
    if (c.ok === "skip") {
      skipped++;
      console.log(`  SKIP  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
      continue;
    }
    if (!c.ok) failed++;
    else passed++;
    console.log(
      `  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail && c.detail !== "ok" ? ` — ${c.detail}` : ""}`,
    );
  }

  console.log(
    `\n${passed}/${passed + failed} passed` +
      (skipped ? `, ${skipped} skipped` : "") +
      (failed ? ` — ${failed} FAILED` : ""),
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
