# Magicly AI Consumption Policy (Phase 1)

## /api/chat
- Governed by: subscription quota (`checkSubscriptionQuota`) + credits (`guardAiAccessAndReserve`) + rate limit.
- One operation = one user message.
- Failed provider calls refund credit; quota counted? quota check occurs before; failure after may have consumed quota (existing behavior).

## /api/ai
- Governed by: subscription quota (`checkSubscriptionQuota`) + credits + rate limit.
- One operation = one task execution.

## /api/generate-plan
- Governed by: credits only (no subscription quota currently).
- One operation = one plan generation.
- Failed operations refund credit (catch path); invalid JSON path needs refund fix (minor).

## /api/generate-slides
- Governed by: credits only (no subscription quota currently).
- One operation = one slide deck generation.

## /api/unified-ai
- Governed by: credits only (credits are quota), model access policy.
- Anonymous: free models only.

## Unresolved
- Whether generate-plan/slides should also enforce subscription quota is not approved; leave unchanged until owner decision.
- Unified-ai recording via recordAiOperation not added due duplicate-risk and lack of supabase client context in all paths; document only.
