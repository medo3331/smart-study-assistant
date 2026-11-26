const fs=require('fs');
const base='C:/Desktop/smart-study-assistant/.worktrees/phase1-ai-credits/';
const routes=[
  {
    file:'app/api/chat/route.ts',
    importOld:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";',
    importNew:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";',
    old:'    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? CURRENT_AI_MODEL);',
    new:'    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? CURRENT_AI_MODEL, { operationId });',
  },
  {
    file:'app/api/generate-game-questions/route.ts',
    importOld:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";',
    importNew:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";',
    old:'    const g = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");',
    new:'    const operationId = serverRequestId();\n    const g = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b", { operationId });',
  },
  {
    file:'app/api/generate-plan/generate_day/route.ts',
    importOld:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";',
    importNew:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";',
    old:'    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");',
    new:'    const operationId = serverRequestId();\n    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b", { operationId });',
  },
  {
    file:'app/api/generate-slides/route.ts',
    importOld:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";',
    importNew:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";',
    old:'    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");',
    new:'    const operationId = serverRequestId();\n    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b", { operationId });',
  },
  {
    file:'app/api/lectures/[id]/ask/route.ts',
    importOld:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";',
    importNew:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";',
    old:'    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID);',
    new:'    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID, { operationId });',
  },
  {
    file:'app/api/lectures/[id]/process/route.ts',
    importOld:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";',
    importNew:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";',
    old:'    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID);',
    new:'    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID, { operationId });',
  },
  {
    file:'app/api/lesson-quiz/route.ts',
    importOld:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";',
    importNew:'import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";',
    old:'    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");',
    new:'    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b", { operationId });',
  },
];
for(const r of routes){
  let c=fs.readFileSync(base+r.file,'utf8').replace(/\r\n/g,'\n');
  if(c.indexOf(r.importOld)!==-1) c=c.replace(r.importOld,r.importNew);
  if(c.indexOf(r.old)===-1){console.error('OLD NOT FOUND @',r.file);process.exit(1);}
  c=c.replace(r.old,r.new);
  fs.writeFileSync(base+r.file,c,'utf8');
  console.log('PATCHED: '+r.file);
}
