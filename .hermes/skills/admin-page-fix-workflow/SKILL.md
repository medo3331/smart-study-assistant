---
name: admin-page-fix-workflow
category: software-development
description: Next.js admin page repair workflow — preview-first for code fixes, TypeScript compiler verification, safe duplicate JSX removal, and real server-action forms replacing preview buttons.
triggers:
  - "fix admin page"
  - "remove duplicate section"
  - "preview button not working"
  - "toggle preview to real action"
---

# Admin Page Fix Workflow (smart-study-assistant)

Always-on rules for fixing `app/admin/page.tsx` and similar server-rendered admin pages.

## Procedure

1. **Preview before edit.** Before applying any patch, generate an HTML preview (`workspace/admin-fix-preview.html`) showing the fixed sections. Show it; wait for user approval (`ah` or equivalent).
2. **Verify syntax with compiler.** Never rely on manual tracking. After edits, run:
   ```bash
   npm run typecheck   # tsc --noEmit
   npm run build       # full build
   ```
   Both must exit 0 before claiming PASS.
3. **Safe JSX duplicate removal.** When deleting a duplicate `<section>`, read the area with `read_file(offset=..., limit=...)` to check nesting. Look for nested `<section>` tags and matching `</section>` tags. Remove the inner section + its closing tag; keep the parent section's closing tag intact.
4. **Real server-action forms.** When a button says "(preview)" and references a server action (`toggleModelStatus`), replace the `<button>` with a `<form action={...}>` containing:
   - Hidden `model_id`
   - Hidden `target_enabled` (`"true"` / `"false"`)
   - Hidden `admin_user_id` (`user?.id || ""`)
   - Hidden `admin_email` (`user?.email || ""`)
   The inline action reads these from `formData` and calls `await toggleModelStatus(...)`.

## Pitfalls

- **Nested JSX breaks silently:** A duplicate admin section nested inside a Plans `<section>` leaves an extra `</section>` or removes one incorrectly, corrupting the page structure. Always read before deleting; confirm the parent section's open/close tags remain balanced after removal.
- **Manual syntax tracking fails at scale:** The TypeScript compiler catches parse errors faster and more reliably than line-by-line manual review, especially in files > 500 lines. Always run `npm run typecheck`; never substitute it with hand-tracing.
- **Preview-only buttons deceive users:** If a button says "preview" but the user expects a real action, the fix must create an inline `"use server"` form that actually calls the imported action. Do not leave the label as "preview" after the fix.
- **Pass admin identity through hidden fields, not closure:** Inside JSX inline actions, `user?.id` and `user?.email` may not be reliably captured from component scope. Always embed them in hidden `<input>` fields so the action reads them from `formData`.
- **No hidden delays:** The user's standing rule is `لا تأجيل مخفي`. After confirming what changed, apply fixes immediately; do not create extra review loops unless the user explicitly asks for another preview.
- **Imported actions must be called, not just imported:** Importing `getRewardsHistory` or `getMostActiveUsers` at the top of the file does not display data. In the JSX, call the action (e.g., `await getRewardsHistory(10)` in the server component body) and bind the result with `.map()` (e.g., `rewardsWinners.map(...)`). A static placeholder table (`لا توجد مكافآت مسجلة بعد`) without `.map()` means the action was never invoked.
- **`alert()` is a browser-only API — never in `"use server"`:** Calling `alert(...)` inside an inline `"use server"` form action causes `ReferenceError: alert is not defined` at runtime (500 error). Replace it with `redirect("/admin?success=..." + encodeURIComponent(...))` or `redirect("/admin?error=..." + ...)` so the server action returns control to the page via query params, which `sp.success` / `sp.error` reads.
- **Audit action distinction when reusing subscription mechanisms:** When a reward (`rewards.manage`) reuses the `subscription_activations` insertion mechanism (e.g., `trial_week` / `pro_week`), the audit entry must use `action: "rewards.manage"` and `resource_type: "reward"` — never `"subscriptions.manage"`. The `details` must explicitly distinguish it (`subscription_activation_reused: true`, `distinction: "REWARD operation (rewards.manage)"`). Otherwise audit reports will confuse rewards with direct subscription activations.
- **New DB tables need RLS policies, not just schema SQL:** Creating `rewards_issued` with only `CREATE TABLE` leaves it without RLS policies (confirmed by `SELECT * FROM pg_policies WHERE tablename='rewards_issued'` returning 0). Add policies matching the audit pattern: `admin read`, `admin write`, and `no client insert/update/delete` (`with check (false)` / `using (false)`). Run the SQL file manually in Supabase SQL Editor after approval.
