const fs=require('fs');
const base='C:/Desktop/smart-study-assistant/.worktrees/phase1-ai-credits/';
const files=[
  'app/api/chat/route.ts',
  'app/api/generate-game-questions/route.ts',
  'app/api/generate-plan/generate_day/route.ts',
  'app/api/generate-slides/route.ts',
  'app/api/lectures/[id]/ask/route.ts',
  'app/api/lectures/[id]/process/route.ts',
  'app/api/lesson-quiz/route.ts',
];
const importOld='import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";';
const importAdd='import { guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId } from "@/lib/ai/ai-credit-guard";';
const re=/(?:^|\n)(\s*)(const|let|var)?\s*(\w+)\s*(?:=\s*await\s*)?guardAiAccessAndReserve\(supabase, user\.id, ([^);]+)\)/g;

for(const rel of files){
  const p=base+rel;
  let c=fs.readFileSync(p,'utf8');
  const hasCRLF=c.includes('\r\n');
  c=c.replace(/\r\n/g,'\n');
  if(c.includes(importOld)){
    c=c.replace(importOld, importAdd.replace('guardAiAccessAndReserve, refundAiCreditIfNeeded }','guardAiAccessAndReserve, refundAiCreditIfNeeded, serverRequestId }'));
  }
  let count=0;
  c=c.replace(re,(m,sep,indent,varDecl,varName,eqAwait,model)=>{
    const opLine = sep + indent + 'const operationId = serverRequestId();';
    const call = indent + varDecl + varName + (eqAwait || '') + 'guardAiAccessAndReserve(supabase, user.id, ' + model + ', { operationId })';
    count++;
    return opLine + '\n' + call;
  });
  fs.writeFileSync(p,c,'utf8');
  if(hasCRLF) fs.writeFileSync(p,c.replace(/\n/g,'\r\n'),'utf8');
  console.log('PATCHED simple: '+rel+' -> '+count);
}
