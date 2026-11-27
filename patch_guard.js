const fs = require('fs');
const path = "/c/Desktop/smart-study-assistant/.worktrees/phase1-ai-credits/lib/ai/ai-credit-guard.ts";
let content = fs.readFileSync(path, 'utf8');

const old = `  // ---- Reserve 1 credit atomically for authenticated user ----
  // ⚠️ \`opts?.refId\` — نفس المرجع عبر طلبات العملية الواحدة ⇒ **حجز واحد**.
  //    \`reserve_ai_credit\` idempotent على \`p_ref_id\` (بيرجّع
  //    \`already_existed\` من غير خصم تاني).
  const refId = opts?.refId ?? \`ai_req:\${serverRequestId()}\`;`;

const new = `  // Stable server-generated operationId for exactly-once reservations.
  // MUST stay constant across retries of the same logical request; otherwise
  // \`reserve_ai_credit\` (idempotent on p_ref_id) will charge twice and the
  // financial model breaks (double deduction). Callers that can retry a request
  // SHOULD pass \`opts.operationId\`; the guard then derives refId from the stable
  // operationId so every retry of the same operation reuses the SAME hold and the
  // settlement model stays idempotent.
  const operationId = opts?.operationId ?? serverRequestId();
  // refId = reservation key. Prefer an explicit refId if the caller supplies one;
  // otherwise derive it from the stable operationId so retries reuse the same hold.
  const refId = opts?.refId ?? \`ai_req:\${operationId}\`;`;

if (!content.includes(old)) { console.error("OLD BLOCK NOT FOUND"); process.exit(1); }
content = content.replace(old, new);
fs.writeFileSync(path, content, 'utf8');
console.log("Guard patch applied.");
