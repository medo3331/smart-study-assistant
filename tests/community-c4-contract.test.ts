import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const sql = read("db/106-community-moderation-c4.sql");
const reportRoute = read("app/api/community/report/route.ts");
const modRoute = read("app/api/community/moderation/route.ts");
const modHandlers = read("lib/community/moderation-handlers.ts");
const adminRoute = read("app/api/admin/community/moderation/route.ts");
const moderationLib = read("lib/community/moderation.ts");
const postsRoute = read("app/api/community/posts/route.ts");
const commentsRoute = read("app/api/community/posts/[id]/comments/route.ts");
const postCard = read("components/community/PostCard.tsx");
const modStatus = read("components/community/ModerationStatus.tsx");
const authRoles = read("lib/auth-roles.ts");
const adminPage = read("app/admin/community/moderation/page.tsx");
const adminClient = read("app/admin/community/moderation/ModerationClient.tsx");

describe("Community C4 SQL contract", () => {
  it("moderation tables are RLS-locked with no direct client access", () => {
    expect(sql).toContain("alter table public.content_reports     enable row level security");
    expect(sql).toContain("alter table public.moderation_actions  enable row level security");
    expect(sql).toContain("alter table public.moderation_appeals  enable row level security");
    expect(sql).toContain("alter table public.moderation_audit_log enable row level security");
    // كل الوصول عبر RPCs — مفيش policies مباشرة على جداول الإشراف
    expect(sql).not.toMatch(/create policy\s+"?content_reports/);
    expect(sql).not.toMatch(/create policy\s+"?moderation_/);
  });

  it("report reasons and statuses are constrained", () => {
    expect(sql).toContain("check (target_type in ('post','comment','user'))");
    expect(sql).toContain("check (status in ('pending','reviewed','dismissed'))");
    expect(sql).toContain("check (action_type in ('warning','restrict','suspend','lift'))");
    expect(sql).toContain("check (status in ('pending','approved','rejected'))");
  });

  it("report_content is rate-limited, de-duplicated and rejects self-reports", () => {
    const fn = sql.slice(sql.indexOf("function public.report_content"), sql.indexOf("$$;", sql.indexOf("function public.report_content")));
    expect(fn).toContain("interval '1 hour'");
    expect(fn).toContain("already_reported");
    expect(fn).toContain("cannot_report_self");
  });

  it("penalty state gates posting and commenting, with an insert trigger backstop", () => {
    const create = sql.slice(sql.indexOf("function public.create_community_post"), sql.indexOf("$$;", sql.indexOf("function public.create_community_post")));
    expect(create).toContain("community_penalty_state(v_me)");
    expect(create).toContain("'restricted'");
    const comment = sql.slice(sql.indexOf("function public.add_post_comment"), sql.indexOf("$$;", sql.indexOf("function public.add_post_comment")));
    expect(comment).toContain("community_penalty_state(v_me)");
    expect(sql).toContain("create trigger trg_community_posts_moderation");
    expect(sql).toContain("create trigger trg_community_comments_moderation");
    expect(sql).toContain("raise exception 'MAGICLY_MODERATION_BLOCKED'");
  });

  it("admin RPCs are gated on is_site_admin and allow service_role, and audit every action", () => {
    const adminFns = ["mod_resolve_report", "mod_issue_action", "mod_lift_action", "mod_resolve_appeal"];
    for (const fnName of adminFns) {
      const fn = sql.slice(sql.indexOf(`function public.${fnName}`), sql.indexOf("$$;", sql.indexOf(`function public.${fnName}`)));
      expect(fn).toContain("is_site_admin()");
      expect(fn).toContain("service_role");
    }
    // كل إجراء إداري يكتب في سجل التدقيق
    expect(sql.match(/into public\.moderation_audit_log/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("appeals: one per action, approval lifts the penalty", () => {
    const submit = sql.slice(sql.indexOf("function public.submit_moderation_appeal"), sql.indexOf("$$;", sql.indexOf("function public.submit_moderation_appeal")));
    expect(submit).toContain("already_appealed");
    expect(submit).toContain("user_id = v_me and active");
    const resolve = sql.slice(sql.indexOf("function public.mod_resolve_appeal"), sql.indexOf("$$;", sql.indexOf("function public.mod_resolve_appeal")));
    expect(resolve).toContain("set active = false");
    expect(resolve).toContain("is_banned = false");
  });

  it("suspension without days is a permanent ban on profiles; restrict sets restriction_until", () => {
    const issue = sql.slice(sql.indexOf("function public.mod_issue_action"), sql.indexOf("$$;", sql.indexOf("function public.mod_issue_action")));
    expect(issue).toContain("is_banned = true");
    expect(issue).toContain("restriction_until = v_expires");
    expect(issue).toContain("warning_count");
  });
});

describe("Community C4 API contract", () => {
  it("student report endpoint validates UUIDs and maps to report_content", () => {
    expect(reportRoute).toContain("reportHandler");
    expect(modHandlers).toContain('rpc("report_content"');
    expect(modHandlers).toContain("UUID_RE.test(targetId)");
  });

  it("student moderation endpoint exposes status and appeals", () => {
    expect(modRoute).toContain("moderationGetHandler");
    expect(modRoute).toContain("moderationAppealHandler");
    expect(modHandlers).toContain('rpc("community_my_moderation_status")');
    expect(modHandlers).toContain('rpc("submit_moderation_appeal"');
  });

  it("admin API requires community.moderate and only forwards whitelisted actions", () => {
    expect(adminRoute).toContain('actorHasPermission(actor, "community.moderate")');
    for (const a of ["resolve_report", "issue_action", "lift_action", "resolve_appeal"]) {
      expect(adminRoute).toContain(`case "${a}"`);
    }
    expect(adminRoute).toContain('rpc(rpcName, args)');
  });

  it("posts and comments are AI-scanned before publish with fail-open on errors", () => {
    expect(moderationLib).toContain("scanCommunityText");
    expect(moderationLib).toContain("fail-open");
    expect(postsRoute).toContain("scanCommunityText");
    expect(postsRoute).toContain('"content_blocked"');
    expect(commentsRoute).toContain("scanCommunityText");
    expect(postsRoute).toContain("enforceContentViolation");
  });

  it("permission community.moderate exists for owner/admin/support/moderator and is sensitive", () => {
    expect(authRoles).toContain('"community.moderate": { key: "community.moderate", allowed_roles: ["owner","admin","support","moderator"], is_sensitive: true }');
    expect(authRoles).toContain('"community.moderate",');
  });
});

describe("Community C4 UI contract", () => {
  it("PostCard has a report button with the full reason list for other users' posts", () => {
    expect(postCard).toContain("ReportPanel");
    expect(postCard).toContain('targetType="post"');
    expect(postCard).toContain('targetType="comment"');
  });

  it("comments and user profiles are reportable too (shared ReportPanel)", () => {
    const panel = read("components/community/ReportPanel.tsx");
    expect(panel).toContain("targetType: ReportTargetType;");
    expect(panel).toContain("REPORT_REASONS");
    expect(read("components/community/ProfileActions.tsx")).toContain('targetType="user"');
  });

  it("students see their moderation status and can appeal from the hub", () => {
    expect(modStatus).toContain("/api/community/moderation");
    expect(modStatus).toContain("تقديم اعتراض");
    expect(read("app/community/page.tsx")).toContain("<ModerationStatus />");
  });

  it("admin moderation page enforces the permission server-side and exposes the 4 queues", () => {
    expect(adminPage).toContain('requireAdminPermission("community.moderate")');
    for (const t of ["التقارير", "الاعتراضات", "العقوبات", "سجل التدقيق"]) {
      expect(adminClient).toContain(t);
    }
  });
});
