import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "db");
const activationSql = fs.readFileSync(path.join(root, "54-admin-operations.sql"), "utf8");
const campaignSql = fs.readFileSync(path.join(root, "phase1e-announcement-email-campaigns.sql"), "utf8");
const activationFixSql = fs.readFileSync(path.join(root, "55-fix-admin-activation-expires-at.sql"), "utf8");
const userOperationsSql = fs.readFileSync(path.join(root, "56-admin-user-operations-center.sql"), "utf8");

describe("admin operations migrations (static safety checks)", () => {
  it("keeps activation migration manual and allows UUID-only accounts", () => {
    expect(activationSql.toLowerCase()).toContain("manual migration");
    expect(activationSql).toContain("ALTER COLUMN user_code DROP NOT NULL");
    expect(activationSql).toContain("p_user_id uuid");
    expect(activationSql).toContain("p_user_code IS NOT NULL");
    expect(activationSql).toContain("GRANT EXECUTE ON FUNCTION public.admin_activate_subscription");
    expect(activationSql).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("creates activation, entitlement, quota and welcome notification in one RPC", () => {
    const rpc = activationSql.slice(activationSql.indexOf("CREATE OR REPLACE FUNCTION public.admin_activate_subscription"));
    expect(rpc).toContain("INSERT INTO public.subscription_activations");
    expect(rpc).toContain("INSERT INTO public.entitlements");
    expect(rpc).toContain("INSERT INTO public.subscription_quotas");
    expect(rpc).toContain("INSERT INTO public.notifications");
    expect(rpc).toContain("ON CONFLICT (subscription_activation_id) DO NOTHING");
    expect(rpc).not.toContain("INSERT INTO public.ai_credit_ledger");
  });

  it("qualifies entitlement expiry references to avoid output-column ambiguity", () => {
    expect(activationSql).toContain("UPDATE public.entitlements AS e");
    expect(activationSql).toContain("e.expires_at IS NULL OR e.expires_at > v_now");
    expect(activationFixSql).toContain("UPDATE public.entitlements AS e");
    expect(activationFixSql).toContain("e.expires_at IS NULL OR e.expires_at > v_now");
  });

  it("recreates the notification type constraint idempotently", () => {
    expect(activationSql).toContain("DROP CONSTRAINT IF EXISTS notifications_type_check");
    expect(activationSql).toContain("ADD CONSTRAINT notifications_type_check");
  });

  it("defines secure user operations and atomic subscription revocation", () => {
    expect(userOperationsSql).toContain("CREATE TABLE IF NOT EXISTS public.admin_user_operations");
    expect(userOperationsSql).toContain("admin_update_user_operations: service_role only");
    expect(userOperationsSql).toContain("admin_revoke_subscription: service_role only");
    expect(userOperationsSql).toContain("UPDATE public.entitlements AS e");
    expect(userOperationsSql).toContain("VALUES (p_user_id, 'free', 0, 0, v_now, v_now)");
    expect(userOperationsSql).toContain("INSERT INTO public.payments");
  });

  it("matches campaign sender override used by the send API", () => {
    expect(campaignSql).toContain("sender_override text");
    expect(campaignSql).toContain("add column if not exists sender_override text");
  });
});
