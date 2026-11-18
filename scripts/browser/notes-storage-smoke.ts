/**
 * Phase 1B.1 — browser acceptance tests for the notes storage foundation.
 *
 * These tests run against a REAL browser: real IndexedDB, real Web Locks,
 * two real tabs on the same origin. Nothing here is mocked.
 *
 * How it works (no new dependencies):
 *   • The `lib/notes/*.ts` sources are transpiled to ESM in memory with the
 *     `typescript` package that is already installed, and served over a local
 *     HTTP server. The tests therefore exercise the real module source.
 *   • Edge is launched headless and driven through the existing CDP helper
 *     (scripts/browser/cdp.mjs).
 *   • Two tabs are opened on the same origin, so they share one IndexedDB
 *     database and one Web Locks namespace — exactly like two real tabs.
 *
 * Usage:  node scripts/browser/notes-storage-smoke.ts
 * (The dev server is NOT required — the harness serves its own origin.)
 */
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpdir } from "node:os";
import ts from "typescript";
import { connectBrowser } from "./cdp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOTES_DIR = join(ROOT, "lib", "notes");

const CDP_PORT = Number(process.env.NOTES_CDP_PORT ?? 9223);
const HTTP_PORT = Number(process.env.NOTES_HTTP_PORT ?? 4319);
/** A second origin — used by the versionchange test so the DB version bump
 *  cannot affect the other tests. */
const HTTP_PORT_V2 = HTTP_PORT + 1;

const RUN_ID = `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].filter(Boolean) as string[];

function findBrowser(): string | null {
  for (const candidate of EDGE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Harness server                                                      */
/* ------------------------------------------------------------------ */

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>notes storage harness</title></head>
<body>
<script>
  window.__harnessError = null;
  window.addEventListener("error", (event) => {
    window.__harnessError = String((event && event.message) || event);
  });
  window.addEventListener("unhandledrejection", (event) => {
    window.__harnessError = String((event && event.reason) || event);
  });
</script>
<script type="module" onerror="window.__harnessError = 'module load failed: ' + (event && event.message)">
  import * as notes from "/lib/notes/index.js";
  import * as testing from "/lib/notes/testing.js";
  window.__notes = notes;
  window.__testing = testing;
  window.__runId = new URLSearchParams(location.search).get("run") ?? "run";
  window.__harnessReady = true;
</script>
</body></html>`;

function transpileModule(name: string): string {
  const file = join(NOTES_DIR, `${name}.ts`);
  const source = readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
      useDefineForClassFields: true,
    },
    fileName: file,
  });

  // The sources use extension-less relative imports (bundler resolution).
  // A browser resolves ES module specifiers literally, so the ".js" has to
  // be added for the harness.
  return output.outputText.replace(
    /((?:from|import)\s*["'])(\.\/[A-Za-z0-9_-]+)(["'])/g,
    "$1$2.js$3",
  );
}

function startServer(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];

    if (path === "/harness.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HARNESS_HTML);
      return;
    }

    const match = /^\/lib\/notes\/([A-Za-z0-9_-]+)\.js$/.exec(path);
    if (match) {
      const name = match[1];
      if (!existsSync(join(NOTES_DIR, `${name}.ts`))) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      res.end(transpileModule(name));
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/* ------------------------------------------------------------------ */
/* Browser                                                             */
/* ------------------------------------------------------------------ */

type Browser = Awaited<ReturnType<typeof connectBrowser>>;

/** A tab handle with a typed evaluate(). */
type Page = {
  targetId: string;
  sessionId: string;
  evaluate: <T = unknown>(
    expression: string,
    opts?: { awaitPromise?: boolean },
  ) => Promise<T>;
  goto: (url: string) => Promise<unknown>;
  close: () => Promise<unknown>;
};

function launchBrowser(): ChildProcess {
  const binary = findBrowser();
  if (!binary) {
    throw new Error(
      "No Edge/Chrome found. Set EDGE_PATH to the browser executable.",
    );
  }
  const profileDir = mkdtempSync(join(tmpdir(), "notes-smoke-"));
  return spawn(
    binary,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
}

async function waitForCdp(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error("The browser never exposed its CDP endpoint");
}

/* ------------------------------------------------------------------ */
/* Assertions                                                          */
/* ------------------------------------------------------------------ */

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function must(name: string, ok: boolean, detail = ""): void {
  check(name, ok, detail);
  if (!ok) throw new Error(`assertion failed: ${name} ${detail}`);
}

/* ------------------------------------------------------------------ */
/* Page helpers                                                        */
/* ------------------------------------------------------------------ */

async function openTab(
  browser: Browser,
  origin: string,
): Promise<Page> {
  const page = (await browser.newPage("about:blank")) as Page;
  await page.goto(`${origin}/harness.html?run=${RUN_ID}`);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const ready = await page
      .evaluate("window.__harnessReady === true")
      .catch(() => false);
    if (ready) return page;
    await sleep(150);
  }
  const failure = await page
    .evaluate<string>(
      "String(window.__harnessError || 'no error captured') + ' | url=' + location.href",
    )
    .catch((error) => String(error));
  throw new Error(`the harness page never became ready — ${failure}`);
}

async function waitFor(
  page: Page,
  expression: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await page.evaluate(expression).catch(() => false);
    if (value) return true;
    await sleep(150);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const server = await startServer(HTTP_PORT);
  const serverV2 = await startServer(HTTP_PORT_V2);
  const origin = `http://127.0.0.1:${HTTP_PORT}`;
  const originV2 = `http://127.0.0.1:${HTTP_PORT_V2}`;

  const browserProcess = launchBrowser();
  let browser: Browser | null = null;

  try {
    await waitForCdp();
    browser = await connectBrowser({ port: CDP_PORT });

    let tabA: Page | null = null;
    let tabB: Page | null = null;

    const ensureA = async (): Promise<Page> => {
      if (!tabA) tabA = await openTab(browser!, origin);
      return tabA;
    };
    const ensureB = async (): Promise<Page> => {
      if (!tabB) tabB = await openTab(browser!, origin);
      return tabB;
    };

    /* -- 1. real IndexedDB open/write/read/close/reopen -------------- */
    {
      const a = await ensureA();
      const result = await a.evaluate<{
        wrote: boolean;
        reopened: boolean;
        ownerId: string;
        pageCount: number;
      }>(`(async () => {
        const { createNoteRepository } = window.__notes;
        const id = window.__runId;
        const now = new Date().toISOString();
        const repo = await createNoteRepository();
        const owner = repo.ownerId;
        await repo.saveNotebook({ id: "nb-"+id, ownerId: owner, title: "T1", pageIds: [], createdAt: now, updatedAt: now });
        await repo.savePage({ id: "pg-"+id, ownerId: owner, notebookId: "nb-"+id, template: "lined", persistedSnapshot: { ink: "hello" }, localJournal: [], quarantined: false, createdAt: now, updatedAt: now });
        const before = await repo.getPage("pg-"+id);
        const wrote = before !== null && before.persistedSnapshot.ink === "hello";
        await repo.dispose();
        const repo2 = await createNoteRepository();
        const after = await repo2.getPage("pg-"+id);
        const reopened = after !== null;
        const pageCount = (await repo2.listPages()).length;
        await repo2.dispose();
        return { wrote, reopened, ownerId: owner, pageCount };
      })()`);
      check("1. IndexedDB: write then read", result.wrote);
      check("1. IndexedDB: close + reopen keeps the record", result.reopened);
    }

    /* -- 2. anonymous identity persists across a reload --------------- */
    {
      const a = await ensureA();
      const before = await a.evaluate<string>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        const id = repo.ownerId;
        await repo.dispose();
        return id;
      })()`);
      await a.goto(`${origin}/harness.html?run=${RUN_ID}`);
      await waitFor(a, "window.__harnessReady === true");
      const after = await a.evaluate<string>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        const id = repo.ownerId;
        await repo.dispose();
        return id;
      })()`);
      must("2. the anonymous identity survives a reload", before === after, `${before} vs ${after}`);
    }

    /* -- 3. two tabs resolve the same anonymous identity -------------- */
    {
      const a = await ensureA();
      const b = await ensureB();
      const idA = await a.evaluate<string>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        const id = repo.ownerId;
        await repo.dispose();
        return id;
      })()`);
      const idB = await b.evaluate<string>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        const id = repo.ownerId;
        await repo.dispose();
        return id;
      })()`);
      must("3. both tabs resolve the same anonymous identity", idA === idB, `${idA} vs ${idB}`);
    }

    /* -- 4 + 5. two tabs compete for the same owner lock -------------- */
    {
      const a = await ensureA();
      const b = await ensureB();

      const aInfo = await a.evaluate<{
        lockName: string;
        isWriter: boolean;
        status: string;
        ownerId: string;
      }>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__repo = repo;
        return { lockName: repo.lockName, isWriter: repo.isWriter(), status: repo.status, ownerId: repo.ownerId };
      })()`);

      const bInfo = await b.evaluate<{
        lockName: string;
        isWriter: boolean;
        status: string;
        ownerId: string;
      }>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__repo = repo;
        return { lockName: repo.lockName, isWriter: repo.isWriter(), status: repo.status, ownerId: repo.ownerId };
      })()`);

      must("4. both tabs target the same owner lock", aInfo.lockName === bInfo.lockName, aInfo.lockName);
      must("4. both tabs share the same owner namespace", aInfo.ownerId === bInfo.ownerId, aInfo.ownerId);
      must("5. only the first tab holds the write lease", aInfo.isWriter === true && bInfo.isWriter === false, `A=${aInfo.isWriter} B=${bInfo.isWriter}`);
      must("5. the second tab reports read-only", bInfo.status === "read-only", bInfo.status);

      /* -- 8. writes are rejected without the lease -------------------- */
      const rejected = await b.evaluate<{ code: string; message: string }>(`(async () => {
        const repo = window.__repo;
        const now = new Date().toISOString();
        try {
          await repo.savePage({ id: "nope-"+window.__runId, ownerId: repo.ownerId, notebookId: "nb-x", template: "lined", persistedSnapshot: {}, localJournal: [], quarantined: false, createdAt: now, updatedAt: now });
          return { code: "NO_ERROR", message: "the write was accepted" };
        } catch (error) {
          return { code: error.code ?? error.name, message: String(error.message) };
        }
      })()`);
      must("8. a write without the lease is rejected", rejected.code === "NOTES_READ_ONLY", `${rejected.code} (${rejected.message})`);

      /* -- 6. the waiting tab is promoted after the release ------------- */
      await a.evaluate("window.__repo.dispose(); 'disposed'");
      const promoted = await waitFor(b, "window.__repo.isWriter() === true", 10_000);
      must("6. the waiting tab becomes the writer after the release", promoted);

      const bWrite = await b.evaluate<boolean>(`(async () => {
        const repo = window.__repo;
        const now = new Date().toISOString();
        await repo.savePage({ id: "promoted-"+window.__runId, ownerId: repo.ownerId, notebookId: "nb-x", template: "lined", persistedSnapshot: {}, localJournal: [], quarantined: false, createdAt: now, updatedAt: now });
        return (await repo.getPage("promoted-"+window.__runId)) !== null;
      })()`);
      must("6. the promoted tab can write", bWrite);

      await b.evaluate("window.__repo.dispose(); 'disposed'");
    }

    /* -- 7. the waiting tab is promoted after the writer tab dies ----- */
    {
      const a = await ensureA();
      const b = await ensureB();

      await a.evaluate(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__repo = repo;
        return repo.isWriter();
      })()`);
      const bIsWriter = await b.evaluate<boolean>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__repo = repo;
        return repo.isWriter();
      })()`);
      must("7. the second tab starts read-only", bIsWriter === false);

      // Terminate the writer tab entirely.
      await a.close();
      tabA = null;

      const promoted = await waitFor(b, "window.__repo.isWriter() === true", 15_000);
      must("7. the waiting tab is promoted after the writer tab is terminated", promoted);

      await b.evaluate("window.__repo.dispose(); 'disposed'");
    }

    /* -- 9 + 10. atomic notebook deletion ----------------------------- */
    {
      const a = await ensureA();
      const deleted = await a.evaluate<{ notebook: boolean; pages: number }>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        const id = window.__runId;
        const now = new Date().toISOString();
        await repo.saveNotebook({ id: "casc-"+id, ownerId: repo.ownerId, title: "cascade", pageIds: [], createdAt: now, updatedAt: now });
        for (const n of ["a","b","c"]) {
          await repo.savePage({ id: "casc-"+id+"-"+n, ownerId: repo.ownerId, notebookId: "casc-"+id, template: "lined", persistedSnapshot: {}, localJournal: [], quarantined: false, createdAt: now, updatedAt: now });
        }
        await repo.deleteNotebook("casc-"+id);
        const notebook = await repo.getNotebook("casc-"+id);
        const pages = (await repo.listPages("casc-"+id)).length;
        await repo.dispose();
        return { notebook: notebook === null, pages };
      })()`);
      must("9. the notebook is gone after the cascade delete", deleted.notebook);
      must("9. every page of the notebook is gone", deleted.pages === 0, `${deleted.pages} left`);

      const rollback = await a.evaluate<{
        errorName: string;
        errorKind: string;
        notebookStillThere: boolean;
        pagesStillThere: number;
      }>(`(async () => {
        const { createNoteRepository, classifyNotesError } = window.__notes;
        const { setStorageTestHooks } = window.__testing;
        const id = window.__runId;
        const now = new Date().toISOString();
        const repo = await createNoteRepository();
        await repo.saveNotebook({ id: "roll-"+id, ownerId: repo.ownerId, title: "rollback", pageIds: [], createdAt: now, updatedAt: now });
        for (const n of ["a","b"]) {
          await repo.savePage({ id: "roll-"+id+"-"+n, ownerId: repo.ownerId, notebookId: "roll-"+id, template: "lined", persistedSnapshot: {}, localJournal: [], quarantined: false, createdAt: now, updatedAt: now });
        }
        // Controlled failure inside the cascade transaction.
        setStorageTestHooks({ beforeCascadeDelete: (tx) => { tx.abort(); } });
        let errorName = "NONE";
        let errorKind = "NONE";
        try {
          await repo.deleteNotebook("roll-"+id);
        } catch (error) {
          errorName = error.name;
          errorKind = classifyNotesError(error);
        }
        setStorageTestHooks(null);
        const notebookStillThere = (await repo.getNotebook("roll-"+id)) !== null;
        const pagesStillThere = (await repo.listPages("roll-"+id)).length;
        await repo.dispose();
        return { errorName, errorKind, notebookStillThere, pagesStillThere };
      })()`);
      must("10. the injected failure aborts the transaction", rollback.errorName === "AbortError", rollback.errorName);
      must("10. the aborted delete is classified as an abort", rollback.errorKind === "abort", rollback.errorKind);
      must("10. the notebook survives the aborted delete", rollback.notebookStillThere);
      must("10. every page survives the aborted delete", rollback.pagesStillThere === 2, `${rollback.pagesStillThere} left`);
    }

    /* -- 11 + 12 + 13 + 14. disposal ---------------------------------- */
    {
      const a = await ensureA();
      const b = await ensureB();

      const aWriter = await a.evaluate<boolean>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__repo = repo;
        return repo.isWriter();
      })()`);
      const bWriter = await b.evaluate<boolean>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__repo = repo;
        return repo.isWriter();
      })()`);
      const lockState = await a.evaluate<string>(`navigator.locks.query().then((q) => JSON.stringify({ held: q.held.map(l => l.name), pending: q.pending.map(l => l.name) }))`);
      must("11. the writer tab holds the lease", aWriter === true, `A=${aWriter} B=${bWriter} locks=${lockState}`);

      // Arm the promotion timestamp in the waiting tab. A timer is NOT used
      // here: background tabs throttle timers, so the proof is done with
      // clocks instead of a race.
      await b.evaluate(`(async () => {
        const repo = window.__repo;
        window.__promotedAt = null;
        repo.whenWriter().then(() => { window.__promotedAt = Date.now(); }, () => {});
        return "armed";
      })()`);

      // A write that takes a while, so the disposal has to wait for it.
      await a.evaluate(`(async () => {
        const { setStorageTestHooks } = window.__testing;
        const repo = window.__repo;
        const now = new Date().toISOString();
        setStorageTestHooks({ beforeWrite: async () => { await new Promise(r => setTimeout(r, 900)); } });
        const order = [];
        const state = { t0: Date.now(), t1: 0, t2: 0, writeError: null, order };
        const write = repo.savePage({ id: "slow-"+window.__runId, ownerId: repo.ownerId, notebookId: "nb-slow", template: "lined", persistedSnapshot: {}, localJournal: [], quarantined: false, createdAt: now, updatedAt: now });
        write.then(() => { state.t1 = Date.now(); order.push("write-settled"); }, (e) => { state.t1 = Date.now(); state.writeError = String((e && e.message) || e); order.push("write-failed"); });
        const disposal = repo.dispose();
        disposal.then(() => { state.t2 = Date.now(); order.push("dispose-settled"); }, () => { state.t2 = Date.now(); order.push("dispose-failed"); });
        window.__slow = { write, disposal, state };
        return "started";
      })()`);

      // 11. new operations are rejected immediately.
      const afterDispose = await a.evaluate<{ code: string; message: string }>(`(async () => {
        const repo = window.__repo;
        try {
          await repo.getNotebook("anything");
          return { code: "NO_ERROR", message: "the read was accepted" };
        } catch (error) {
          return { code: error.code ?? error.name, message: String(error.message) };
        }
      })()`);
      must("11. a new operation is rejected right after dispose()", afterDispose.code === "NOTES_DISPOSED", `${afterDispose.code} (${afterDispose.message})`);

      // 12a. while the write is in flight the owner lock is still held and the
      //      waiting tab has NOT been promoted.
      const locksDuringWrite = await a.evaluate<string>(`navigator.locks.query().then((q) => JSON.stringify({ held: q.held.map(l => l.name), pending: q.pending.map(l => l.name) }))`);
      const promotedDuringWrite = await b.evaluate<number>("window.__promotedAt === null ? -1 : window.__promotedAt");
      must(
        "12a. the owner lock is still held while the write is in flight",
        locksDuringWrite.includes("\"held\":[\"magicly-notes-writer:"),
        locksDuringWrite,
      );
      must(
        "12b. the waiting tab is not promoted while the write is in flight",
        promotedDuringWrite === -1,
        `promotedAt=${promotedDuringWrite}`,
      );

      // 13. the disposal completes only after the pending write finished.
      const drained = await a.evaluate<{
        order: string[];
        isWriter: boolean;
        t1: number;
        t2: number;
      }>(`(async () => {
        await window.__slow.write;
        await window.__slow.disposal;
        return { order: window.__slow.state.order, isWriter: window.__repo.isWriter(), t1: window.__slow.state.t1, t2: window.__slow.state.t2 };
      })()`);
      must("13. the write settles before the disposal", drained.order[0] === "write-settled" && drained.order[1] === "dispose-settled", JSON.stringify(drained.order));
      must("13. the disposal settles at or after the write", drained.t2 >= drained.t1, `t1=${drained.t1} t2=${drained.t2}`);
      must("13. the lease is released after the disposal completed", drained.isWriter === false);

      // 14. the next tab acquires the lock only after the disposal completed.
      const promoted = await waitFor(b, "window.__promotedAt !== null", 10_000);
      const promotedAt = await b.evaluate<number>("window.__promotedAt ?? -1");
      must("14. the waiting tab acquires the lock after the disposal", promoted, `promotedAt=${promotedAt}`);
      must(
        "14. the handover happened only after the protected write finished",
        promotedAt >= drained.t1,
        `promotedAt=${promotedAt} writeSettledAt=${drained.t1}`,
      );
      must(
        "14. the handover happened right after the disposal (not much later)",
        promotedAt - drained.t1 < 5000,
        `promotedAt=${promotedAt} writeSettledAt=${drained.t1}`,
      );

      await b.evaluate("window.__repo.dispose(); 'disposed'");
    }

    /* -- 17. dispose while waiting for the promotion (P2-02) ---------- */
    {
      const a = await ensureA();
      const b = await ensureB();

      // 1. Tab A acquires the owner writer lease.
      const aWriter = await a.evaluate<boolean>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__repo = repo;
        return repo.isWriter();
      })()`);
      must("17. tab A acquires the owner writer lease", aWriter === true);

      // 2. Tab B creates a repository for the same owner and waits.
      const bWaiting = await b.evaluate<boolean>(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__repo = repo;
        window.__promotion = { state: "pending", code: null, message: null };
        repo.whenWriter().then(
          () => { window.__promotion.state = "promoted"; },
          (error) => {
            window.__promotion.state = "rejected";
            window.__promotion.code = error.code ?? error.name;
            window.__promotion.message = String(error.message);
          },
        );
        return repo.isWriter();
      })()`);
      must("17. tab B waits (read-only) for the same owner lease", bWaiting === false);

      // 3. Dispose tab B's repository BEFORE tab A releases.
      await b.evaluate(`(async () => { await window.__repo.dispose(); return "disposed"; })()`);

      const promotionAfterDispose = await b.evaluate<string>(
        "JSON.stringify(window.__promotion)",
      );
      must(
        "17. the promotion promise rejects when the waiting repo is disposed",
        promotionAfterDispose.includes('"state":"rejected"'),
        promotionAfterDispose,
      );
      must(
        "17. the rejection carries the stable typed error",
        promotionAfterDispose.includes("NOTES_WRITER_LEASE_CANCELLED"),
        promotionAfterDispose,
      );

      // 4. Tab B must not be able to write.
      const writeAttempt = await b.evaluate<string>(`(async () => {
        const repo = window.__repo;
        try {
          await repo.savePage({ id: "z-"+window.__runId, ownerId: repo.ownerId, notebookId: "nb-z", template: "lined", persistedSnapshot: {}, localJournal: [], quarantined: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          return "WROTE";
        } catch (error) {
          return error.code ?? error.name;
        }
      })()`);
      must("17. the disposed waiting tab performs no write", writeAttempt === "NOTES_DISPOSED", writeAttempt);

      // 5. Release tab A.
      await a.evaluate(`(async () => { await window.__repo.dispose(); return "disposed"; })()`);

      // 6. Tab B must never become the writer, and its promotion promise must
      //    stay rejected.
      await sleep(400);
      const bStillWaiting = await b.evaluate<boolean>(
        "window.__repo.isWriter() === false",
      );
      must("17. the disposed waiting tab never becomes the writer", bStillWaiting === true);
      const promotionAfterRelease = await b.evaluate<string>(
        "JSON.stringify(window.__promotion)",
      );
      must(
        "17. the promotion promise stays rejected after the release",
        promotionAfterRelease.includes('"state":"rejected"') &&
          !promotionAfterRelease.includes('"state":"promoted"'),
        promotionAfterRelease,
      );

      // 7. A subsequent fresh repository acquires the lock normally.
      await b.evaluate(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__fresh = repo;
        window.__freshPromotion = { state: "pending" };
        repo.whenWriter().then(
          () => { window.__freshPromotion.state = "promoted"; },
          (error) => { window.__freshPromotion.state = "rejected:" + (error.code ?? error.name); },
        );
        return "created";
      })()`);
      const freshIsWriter = await waitFor(
        b,
        "window.__fresh.isWriter() === true",
        15_000,
      );
      must("17. a fresh repository acquires the lock normally", freshIsWriter === true);
      const freshPromotion = await b.evaluate<string>(
        "JSON.stringify(window.__freshPromotion)",
      );
      must(
        "17. the fresh repository's promotion promise resolves",
        freshPromotion.includes('"state":"promoted"'),
        freshPromotion,
      );
      await b.evaluate(`(async () => { await window.__fresh.dispose(); return "disposed"; })()`);
    }

    /* -- 15. native error identity ------------------------------------ */
    {
      const a = await ensureA();
      await a.evaluate(`(async () => {
        const repo = await Promise.race([
          window.__notes.createNoteRepository(),
          new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 4000)),
        ]);
        if (repo === "TIMEOUT") { window.__diag = "createNoteRepository timed out"; return "timeout"; }
        window.__repo = repo;
        window.__originalPut = IDBObjectStore.prototype.put;
        window.__attempts = 0;
        IDBObjectStore.prototype.put = function (...args) {
          window.__attempts += 1;
          throw new DOMException("simulated quota failure", "QuotaExceededError");
        };
        window.__diag = "repo ready, isWriter=" + repo.isWriter();
        return repo.isWriter();
      })()`);
      const diag = await a.evaluate<string>("window.__diag ?? 'none'");
      check("15. the repo is ready for the quota test", diag.startsWith("repo ready"), diag);
      const quota = await a.evaluate<{ name: string; kind: string; attempts: number; diag: string }>(`(async () => {
        const { classifyNotesError } = window.__notes;
        const { setStorageTestHooks } = window.__testing;
        setStorageTestHooks(null);
        const repo = window.__repo;
        let name = "NONE";
        let kind = "NONE";
        let diag = "start";
        const outcome = await Promise.race([
          repo.savePage({ id: "q-"+window.__runId, ownerId: repo.ownerId, notebookId: "nb-q", template: "lined", persistedSnapshot: {}, localJournal: [], quarantined: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).then(
            () => ({ outcome: "resolved", name: "NONE", kind: "NONE" }),
            (e) => ({ outcome: "rejected", name: String((e && e.name) || e), kind: classifyNotesError(e) }),
          ),
          new Promise((resolve) => setTimeout(() => resolve({ outcome: "TIMEOUT", name: "NONE", kind: "NONE" }), 5000)),
        ]);
        name = outcome.name;
        kind = outcome.kind;
        diag = outcome.outcome;
        return { name, kind, attempts: window.__attempts, diag };
      })()`);
      check("15. the quota write settled", quota.diag !== "TIMEOUT", quota.diag);
      await a.evaluate(`(() => { IDBObjectStore.prototype.put = window.__originalPut; window.__originalPut = null; return "restored"; })()`);
      must("15. the native quota error keeps its identity", quota.name === "QuotaExceededError", quota.name);
      must("15. the quota error is classified as quota", quota.kind === "quota", quota.kind);
      must("15. the failed write is NOT retried", quota.attempts === 1, `${quota.attempts} attempts`);

      // Release the lease before the next block creates another repository.
      await a.evaluate(`(async () => { await window.__repo.dispose(); return "disposed"; })()`);

      const abort = await a.evaluate<{ name: string; kind: string; isWriter: boolean }>(`(async () => {
        const { createNoteRepository, classifyNotesError } = window.__notes;
        const { setStorageTestHooks } = window.__testing;
        const repo = await createNoteRepository();
        const id = window.__runId;
        const now = new Date().toISOString();
        const isWriter = repo.isWriter();
        await repo.saveNotebook({ id: "ab-"+id, ownerId: repo.ownerId, title: "abort", pageIds: [], createdAt: now, updatedAt: now });
        setStorageTestHooks({ beforeCascadeDelete: (tx) => { tx.abort(); } });
        let name = "NONE";
        let kind = "NONE";
        try {
          await repo.deleteNotebook("ab-"+id);
        } catch (error) {
          name = error.name;
          kind = classifyNotesError(error);
        }
        setStorageTestHooks(null);
        await repo.dispose();
        return { name, kind, isWriter };
      })()`);
      must("15. the aborted transaction keeps the AbortError identity", abort.name === "AbortError", `${abort.name} (isWriter=${abort.isWriter})`);
      must("15. the abort is classified as abort", abort.kind === "abort", abort.kind);
    }

    /* -- 16. versionchange + blocked (on a separate origin) ----------- */
    {
      const a = await openTab(browser!, originV2);
      const b = await openTab(browser!, originV2);

      await a.evaluate(`(async () => {
        const repo = await window.__notes.createNoteRepository();
        window.__repo = repo;
        return repo.isWriter();
      })()`);

      // 16a. Our versionchange handler closes the connection of THIS tab, so
      //      the other tab's upgrade is never blocked.
      const upgrade = await b.evaluate<{ blocked: boolean; upgraded: boolean; version: number }>(`(async () => {
        const state = { blocked: false, upgraded: false, version: 0 };
        await new Promise((resolve) => {
          const request = indexedDB.open("magicly-notes", 2);
          request.onupgradeneeded = () => {};
          request.onblocked = () => { state.blocked = true; };
          request.onsuccess = () => { state.upgraded = true; state.version = request.result.version; request.result.close(); resolve(); };
          request.onerror = () => resolve();
          setTimeout(resolve, 8000);
        });
        return state;
      })()`);
      must("16a. our versionchange handler releases the connection (no block)", upgrade.blocked === false, JSON.stringify(upgrade));
      must("16a. the upgrade completes after the holder released the connection", upgrade.upgraded === true && upgrade.version === 2, JSON.stringify(upgrade));

      // 16b. The closed connection is invalidated; the next operation reopens
      //      and the native VersionError is preserved.
      const reopened = await a.evaluate<{ kind: string; name: string }>(`(async () => {
        const { classifyNotesError } = window.__notes;
        try {
          await window.__repo.getNotebook("anything");
          return { kind: "NONE", name: "NONE" };
        } catch (error) {
          return { kind: classifyNotesError(error), name: error.name };
        }
      })()`);
      must("16b. the closed connection is invalidated and reopened", reopened.kind === "version" && reopened.name === "VersionError", JSON.stringify(reopened));

      // 16c. A foreign connection that does NOT close on versionchange blocks
      //      the upgrade — the browser fires the blocked event.
      await a.evaluate(`(async () => {
        window.__raw = await new Promise((res) => {
          const request = indexedDB.open("magicly-notes", 3);
          request.onsuccess = () => res(request.result);
        });
        return "held";
      })()`);
      await b.evaluate(`(async () => {
        window.__up = { blocked: false, upgraded: false, version: 0 };
        const promise = new Promise((resolve) => {
          const request = indexedDB.open("magicly-notes", 4);
          request.onblocked = () => { window.__up.blocked = true; };
          request.onsuccess = () => { window.__up.upgraded = true; window.__up.version = request.result.version; request.result.close(); resolve(); };
          request.onerror = () => resolve();
        });
        window.__upPromise = promise;
        return "started";
      })()`);
      const blockedSeen = await waitFor(b, "window.__up.blocked === true", 8000);
      must("16c. the upgrade is blocked while a foreign connection holds the database", blockedSeen === true);
      await a.evaluate("window.__raw.close(); 'closed'");
      const upgradedAfter = await waitFor(b, "window.__up.upgraded === true", 10_000);
      const upState = await b.evaluate<string>("JSON.stringify(window.__up)");
      must("16c. the blocked upgrade completes once the holder closed", upgradedAfter === true, upState);

      await a.close();
      await b.close();
    }
  } finally {
    try {
      browser?.close();
    } catch {
      /* ignore */
    }
    try {
      browserProcess.kill();
    } catch {
      /* ignore */
    }
    server.close();
    serverV2.close();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  for (const f of failed) console.log(`  FAILED: ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
