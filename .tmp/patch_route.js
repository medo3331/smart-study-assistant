const fs=require('fs');
const p='C:/Desktop/smart-study-assistant/.worktrees/phase1-ai-credits/app/api/ai/route.ts';
let c=fs.readFileSync(p,'utf8');
const importOld='import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";';
const importNew='import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";';
if(!c.includes(importOld)){console.error('IMPORT NOT FOUND');process.exit(1);}
c=c.replace(importOld,importNew);
const guardOld='    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");';
const guardNew='    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b", { operationId });';
const count=c.split(guardOld).length-1;
if(count===0){console.error('GUARD CALL NOT FOUND');process.exit(1);}
c=c.split(guardOld).join(guardNew);
fs.writeFileSync(p,c,'utf8');
console.log('Route patched: import + '+count+' guard call(s).');
