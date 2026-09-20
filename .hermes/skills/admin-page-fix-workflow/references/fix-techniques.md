# Admin Page Fix Techniques

Reference for `admin-page-fix-workflow`. Used when applying the procedure to a specific fix.

## Preview HTML generation

Before applying patches to `app/admin/page.tsx`, write `workspace/admin-fix-preview.html` showing:
- The deleted sections (labelled "REMOVED")
- The unified sections
- The new form buttons with their hidden inputs

This lets the user confirm the fix visually (`ah`) before any `patch` call touches source code.

## TypeScript verification commands

Always run in order:

```bash
npm run typecheck   # tsc --noEmit — catches parse/import errors
npm run build       # full Next.js build — catches runtime JSX nesting errors
```

Both must return exit 0. Report exact exit codes; never say "clean" without the command output.

## JSX nesting check (before deleting)

When removing a duplicate `<section>` inside a parent section (e.g. nested admin section inside Plans):

1. Read with `read_file(offset=..., limit=...)` covering the parent open tag, the inner open tag, and both close tags.
2. Confirm the parent section's `</section>` remains after removal.
3. Confirm no extra `</section>` is left unclosed.

Pattern observed: nested `Phase 4.11 Real Admin Controls` inside `Phase 4.9 Plans` produced two `</section>` tags at lines 760/761 (original). Removing the inner section (lines 759-783) kept the parent's closing tag intact.

## Real server-action form pattern

Replace preview buttons (`<button>... (preview)</button>`) with:

```jsx
<form action={async (formData: FormData) => {
  "use server";
  const modelId = formData.get("model_id") as string;
  const enabledTarget = formData.get("target_enabled") === "true";
  const adminId = (formData.get("admin_user_id") as string) || "";
  const adminEmail = (formData.get("admin_email") as string) || null;
  const res = await toggleModelStatus(modelId, enabledTarget, adminId, adminEmail);
  console.log("[AI Model Toggle]", { modelId, enabledTarget, ok: res.ok, auditId: res.auditId, msg: res.message });
  alert("نتيجة التفعيل: " + (...));
}} className="inline">
  <input type="hidden" name="model_id" value="..." />
  <input type="hidden" name="target_enabled" value="false" />
  <input type="hidden" name="admin_user_id" value={user?.id || ""} />
  <input type="hidden" name="admin_email" value={user?.email || ""} />
  <button type="submit" className="...">تعطيل</button>
</form>
```

Pass `admin_user_id` and `admin_email` through hidden fields rather than relying on component-scope closure, since inline server actions may not reliably capture `user` from the server component scope.
