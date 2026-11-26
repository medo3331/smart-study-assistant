const fs=require('fs');
const base='C:/Desktop/smart-study-assistant/.worktrees/phase1-ai-credits/';
const files=[
  'app/api/agents/generate/route.ts',
  'app/api/ai/plan/route.ts',
  'app/api/ai/generate/route.ts',
  'app/api/ai/file/generate/route.ts',
  'app/api/ai/image-gen/route.ts',
  'app/api/ai/diagram/route.ts',
];
const importAdd='import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";';
const importOld='import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";';
for(const rel of files){
  const p=base+rel;
  let c=fs.readFileSync(p,'utf8');
  if(!c.includes(importOld)){console.warn('IMPORT MISSING @',rel); continue;}
  c=c.replace(importOld, importAdd);
  // simple single-line pattern (no options)
  const re=/(const|let|var)?\s*(\w+)\s*(?:=\s*await\s*)?guardAiAccessAndReserve\(supabase, user\.id, ([^);]+)\)\s*;/g;
  let m;
  let count=0;
  const out=[];
  while((m=re.exec(c))){
    out.push(c.slice(0,m.index)+'const operationId = serverRequestId();'+m[0].replace('guardAiAccessAndReserve(supabase, user.id, '+m[3]+')','guardAiAccessAndReserve(supabase, user.id, '+m[3]+', { operationId })')+'     ');
    c=c.slice(0,m.index)+out[out.length-1]+c.slice(re.lastIndex);
    re.lastIndex=m.index+out[out.length-1].length;
    count++;
  }
  fs.writeFileSync(p,c,'utf8');
  console.log('PATCHED '+rel+' simple-pattern: '+count);
}
