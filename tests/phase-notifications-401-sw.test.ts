import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const bell = read("components/NotificationBell.tsx");
const sw = read("public/sw.js");

describe("Notifications 401 and service worker FetchEvent regression", () => {
  it("NotificationBell waits for auth before fetching", () => {
    expect(bell).toContain('createClient');
    expect(bell).toContain('onAuthStateChange');
    expect(bell).toContain('authReady');
    expect(bell).toContain('hasUser');
    expect(bell).toContain('if(!authReady||!hasUser)return null;');
  });

  it("NotificationBell treats 401 as expected unauthenticated state", () => {
    expect(bell).toContain('r.status===401');
    expect(bell).toContain('setError(null)');
  });

  it("service worker does not resolve FetchEvent with Response.error", () => {
    expect(sw).toContain('VERSION = "v3"');
    expect(sw).not.toContain("Response.error()");
  });

  it("service worker guards cache access for navigation", () => {
    expect(sw).toContain("let cache = null;");
    expect(sw).toContain("try { cache = await caches.open(PAGES); } catch { cache = null; }");
  });
});
