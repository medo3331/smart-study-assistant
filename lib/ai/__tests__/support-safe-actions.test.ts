// ============================================================================
// MAGICLY — support-safe-actions tests (Phase 1)
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  getSafeAction,
  safeActionList,
  executeSafeAction,
} from "../support-safe-actions";

describe("support-safe-actions – list", () => {
  it("exports at least the initial read-only actions", () => {
    expect(safeActionList.length).toBeGreaterThanOrEqual(6);
  });

  it("finds action by key", () => {
    const action = getSafeAction("check_transaction_status");
    expect(action).toBeDefined();
    expect(action!.key).toBe("check_transaction_status");
    expect(action!.risk).toBe("low");
    expect(action!.requiresPermissions).toContain("audit.read");
  });
});

describe("support-safe-actions – execute", () => {
  it("executes read-only action successfully in Phase 1", async () => {
    const result = await executeSafeAction(
      getSafeAction("check_service_availability")!,
      {}
    );
    expect(result.success).toBe(true);
    expect(result.result?.actionKey).toBe("check_service_availability");
    expect(result.result?.phase).toBe("phase1");
  });
});
