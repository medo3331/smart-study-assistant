const fs=require('fs');
const p='C:/Desktop/smart-study-assistant/.worktrees/phase1-ai-credits/lib/ai/ai-credit-guard.ts';
const old='  const refId = opts?.refId ?? `ai_req:${serverRequestId()}`;';
const rep=[
  '  // Stable server-generated operationId for exactly-once reservations.',
  '  // MUST stay constant across retries of the same logical request; otherwise',
  '  // `reserve_ai_credit` (idempotent on p_ref_id) will charge twice and the',
  '  // financial model breaks (double deduction). Callers that can retry a request',
  '  // SHOULD pass `opts.operationId`; the guard then derives refId from the stable',
  '  // operationId so every retry of the same operation reuses the SAME hold and the',
  '  // settlement model stays idempotent.',
  '  const operationId = opts?.operationId ?? serverRequestId();',
  '  // refId = reservation key. Prefer an explicit refId if the caller supplies one;',
  '  // otherwise derive it from the stable operationId so retries reuse the same hold.',
  '  const refId = opts?.refId ?? `ai_req:${operationId}`;',
].join('\n');
let c=fs.readFileSync(p,'utf8');
const i=c.indexOf(old);
if(i===-1){console.error('OLD LINE NOT FOUND at '+i);process.exit(1);}
c=c.replace(old, rep);
fs.writeFileSync(p,c,'utf8');
console.log('Guard patch applied.');
