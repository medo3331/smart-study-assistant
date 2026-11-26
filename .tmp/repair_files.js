const { execSync } = require('child_process');
const fs = require('fs');
const base = 'C:/Desktop/smart-study-assistant/.worktrees/phase1-ai-credits/';
const files = [
  'app/api/generate-game-questions/route.ts',
  'app/api/generate-plan/generate_day/route.ts',
  'app/api/generate-slides/route.ts',
  'app/api/lectures/[id]/ask/route.ts',
  'app/api/lectures/[id]/process/route.ts',
  'app/api/lesson-quiz/route.ts',
];

for (const rel of files) {
  // 1. Restore from git (use HEAD form)
  execSync(`git checkout HEAD -- ${rel}`, { cwd: base, stdio: 'ignore' });
  let c = fs.readFileSync(base + rel, 'utf8').replace(/\r\n/g, '\n');

  // 2. Add serverRequestId to import
  const importOld = 'import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";';
  const importNew = 'import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";';
  if (c.indexOf(importOld) !== -1) c = c.replace(importOld, importNew);

  // 3a. generate-game-questions: const g = await guardAiAccessAndReserve(...)
  if (rel === 'app/api/generate-game-questions/route.ts') {
    const old = '    const g = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");';
    const nw = '    const operationId = serverRequestId();\n    const g = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b", { operationId });';
    if (c.indexOf(old) !== -1) c = c.replace(old, nw);
  }
  // 3b. generate-plan/generate_day: guard = await ...
  else if (rel === 'app/api/generate-plan/generate_day/route.ts') {
    const old = '    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");';
    const nw = '    const operationId = serverRequestId();\n    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b", { operationId });';
    if (c.indexOf(old) !== -1) c = c.replace(old, nw);
  }
  // 3c. generate-slides: guard = await ...
  else if (rel === 'app/api/generate-slides/route.ts') {
    const old = '    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");';
    const nw = '    const operationId = serverRequestId();\n    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b", { operationId });';
    if (c.indexOf(old) !== -1) c = c.replace(old, nw);
  }
  // 3d. lectures/[id]/ask: const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID);
  else if (rel === 'app/api/lectures/[id]/ask/route.ts') {
    const old = '    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID);';
    const nw = '    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID, { operationId });';
    if (c.indexOf(old) !== -1) c = c.replace(old, nw);
  }
  // 3e. lectures/[id]/process: const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID);
  else if (rel === 'app/api/lectures/[id]/process/route.ts') {
    const old = '    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID);';
    const nw = '    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID, { operationId });';
    if (c.indexOf(old) !== -1) c = c.replace(old, nw);
  }
  // 3f. lesson-quiz: const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");
  else if (rel === 'app/api/lesson-quiz/route.ts') {
    const old = '    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");';
    const nw = '    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b", { operationId });';
    if (c.indexOf(old) !== -1) c = c.replace(old, nw);
  }

  // 4. Write back (LF for safety)
  fs.writeFileSync(base + rel, c, 'utf8');
  console.log('REPAIRED: ' + rel);
}
