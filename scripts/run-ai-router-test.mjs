/**
 * Runs the legacy router policy test with the TypeScript resolve hook.
 * (routing.ts now imports ./types etc. extensionlessly — fine for Next,
 * needs the hook for bare `node --experimental-strip-types`.)
 */
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const hookUrl = pathToFileURL(join(here, "lib", "ts-resolve-hook.mjs")).href;

const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--import",
    `data:text/javascript,import { register } from "node:module"; register(${JSON.stringify(hookUrl)})`,
    join(here, "test-ai-router.mjs"),
  ],
  { stdio: "inherit", cwd: repoRoot }
);

process.exit(result.status ?? 1);
