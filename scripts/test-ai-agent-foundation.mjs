#!/usr/bin/env node
/**
 * AI Agent Foundation tests — agent layer on top of the existing AI core.
 * Runs only the tests under lib/ai/agents/__tests__/; does not re-test core.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = join(__dirname, "..", "lib", "ai", "agents", "__tests__");

let pass = 0;
let fail = 0;
const failures = [];

if (!existsSync(testsDir)) {
  console.log(`AI Agent Foundation: no tests yet (${testsDir} does not exist). Skipping.`);
  process.exit(0);
}

const files = readdirSync(testsDir).filter((f) => f.endsWith(".test.mjs")).sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", join(testsDir, file)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  const stdout = result.stdout?.toString() ?? "";
  const stderr = result.stderr?.toString() ?? "";
  const ok = result.status === 0;
  if (ok) {
    pass++;
    process.stdout.write(`  ✓ ${file}\n${stdout.split("\n").filter(Boolean).map((l) => "    " + l).join("\n")}\n`);
  } else {
    fail++;
    failures.push({ file, stdout, stderr, code: result.status });
    process.stdout.write(`  ✗ ${file}\n${stdout}${stderr}`);
  }
}

console.log(`\nAI Agent Foundation: ${pass} files passed, ${fail} failed.`);
if (fail > 0) {
  for (const f of failures) console.error(`FAIL ${f.file} (exit ${f.code})`);
  process.exit(1);
}
