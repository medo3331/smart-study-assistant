/**
 * Resolve hook so `node --experimental-strip-types` can load the repo's
 * extensionless relative TS imports (Next resolves them fine; bare Node ESM
 * needs an explicit ".ts"). Test infrastructure only — never imported by app code.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (error?.code === "ERR_MODULE_NOT_FOUND" && isRelative) {
      try {
        return await next(`${specifier}.ts`, context);
      } catch {
        // fall through to the original error
      }
    }
    throw error;
  }
}
