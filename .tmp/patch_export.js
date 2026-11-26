const fs=require('fs');
const p='C:/Desktop/smart-study-assistant/.worktrees/phase1-ai-credits/lib/ai/ai-credit-guard.ts';
let c=fs.readFileSync(p,'utf8');
const old='function serverRequestId(): string {';
const replacement='export function serverRequestId(): string {';
if(!c.includes(old)){console.error('NOT FOUND');process.exit(1);}
fs.writeFileSync(p,c.replace(old,replacement),'utf8');
console.log('Exported serverRequestId.');
