/**
 * Resolve hook so `node --experimental-strip-types` can load the repo's
 * extensionless relative TS imports (Next resolves them fine; bare Node ESM
 * needs an explicit ".ts"). Also tries "<dir>/index.ts" so barrel folders
 * like lib/ai/tasks work in tests too. Test infrastructure only — never
 * imported by app code.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (isRelative && (error?.code === "ERR_MODULE_NOT_FOUND" || error?.code === "ERR_UNSUPPORTED_DIR_IMPORT")) {
      try {
        return await next(`${specifier}.ts`, context);
      } catch {
        // fall through to the index attempt
      }
      try {
        return await next(`${specifier}/index.ts`, context);
      } catch {
        // fall through to the original error
      }
    }
    throw error;
  }
}
