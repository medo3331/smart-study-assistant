import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sqlPath = path.join(process.cwd(), "db", "phase1a-announcements-schema.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

describe("Phase 1A announcements schema (static SQL review)", () => {
  it("creates both tables idempotently", () => {
    expect(sql).toContain("create table if not exists public.announcements");
    expect(sql).toContain("create table if not exists public.announcement_reads");
  });

  it("defines audience and status checks", () => {
    expect(sql).toContain("'all', 'student', 'graduate', 'freelancer'");
    expect(sql).toContain("'draft', 'published', 'archived'");
  });

  it("prevents illogical publish/expire dates", () => {
    expect(sql).toContain("announcements_publish_expires_check");
    expect(sql).toContain("publish_at is null or expires_at is null or publish_at < expires_at");
  });

  it("prevents duplicate read receipts", () => {
    expect(sql).toContain("primary key (announcement_id, user_id)");
  });

  it("adds useful indexes", () => {
    expect(sql).toContain("announcement_reads_user_id_idx");
    expect(sql).toContain("announcements_status_audience_publish_idx");
  });

  it("enables RLS on both tables", () => {
    expect(sql.match(/enable row level security/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not derive audience from mutable profiles.persona", () => {
    expect(sql).not.toContain("current_user_announcement_audience");
    expect(sql).not.toContain("security definer");
    expect(sql).not.toContain("from public.profiles");
  });

  it("RLS uses only publication and active windows", () => {
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain("publish_at is null or publish_at <= now()");
    expect(sql).toContain("expires_at is null or expires_at > now()");
  });

  it("has authenticated self-read announcement policy", () => {
    expect(sql).toContain('announcements: authenticated read published');
    expect(sql).toContain("to authenticated");
  });

  it("has self-only read receipt policies", () => {
    expect(sql).toContain('announcement_reads: authenticated self read');
    expect(sql).toContain('announcement_reads: authenticated self insert');
    expect(sql).toContain("user_id = auth.uid()");
  });

  it("recreates check constraints deterministically", () => {
    expect(sql).toContain("drop constraint if exists announcements_audience_check");
    expect(sql).toContain("drop constraint if exists announcements_publish_expires_check");
    expect(sql).toContain("alter column audience set default 'all'");
  });

  it("documents rollback and manual review", () => {
    expect(sql).toContain("ROLLBACK");
    expect(sql).toContain("REVIEW BEFORE RUNNING");
  });
});

// The following scenarios require a live Supabase/Postgres database and are
// intentionally skipped in CI. They are listed here as the manual staging checklist.
describe.skip("DB-required RLS scenarios (manual staging)", () => {
  it("anonymous users cannot read announcements", () => {});
  it("authenticated users cannot read draft or archived announcements", () => {});
  it("authenticated users cannot read announcements for another audience", () => {});
  it("authenticated users can read published announcements for all or their audience", () => {});
  it("users can insert only their own announcement_reads rows", () => {});
  it("users cannot insert read receipts for unpublished or expired announcements", () => {});
  it("changing profiles.persona does not grant another audience because RLS does not use persona", () => {});
  it("users cannot update or delete announcements", () => {});
  it("service role can manage announcements", () => {});
});
