# MAGICLY — Communication Hub — Execution Checklist

## Batch 0: Inventory & Preservation
- [x] Verify workspace root
- [x] Verify branch and HEAD SHA
- [x] Inspect git status, modified, and untracked files
- [x] Identify existing worktrees
- [x] Inventory existing systems (Announcement Center, Support Widget, Notifications/Tickets)
- [x] Document what can be reused
- [x] Document what needs improvement
- [x] Create `docs/communication-hub/INVENTORY.md`
- [x] Preserve all existing work (no destructive actions)

## Batch 1: Support Ticket System
- [x] Database migration: `db/31-support-tickets-full.sql`
  - Added: priority, assigned_to, resolved_by, resolved_at, closed_reason, rating, rating_at to support_tickets
  - Added: support_ticket_attachments table
  - Added: support_ticket_assignments table
  - Added: support_ticket_events table
  - Added: support_ticket_ratings table
  - Added: RLS policies for all new tables
- [x] Database client: `lib/db.ts` (Drizzle ORM client)
- [x] Schema: `lib/db/schema.ts` (drizzle table definitions)
- [x] API: GET /api/tickets — index tickets (student + support staff)
- [x] API: POST /api/tickets — create ticket
- [x] API: GET /api/tickets/[id] — view ticket
- [x] API: PATCH /api/tickets/[id] — update ticket (status, priority, assignment, rating)
- [x] API: DELETE /api/tickets/[id] — delete ticket
- [x] API: GET /api/tickets/[id]/messages — list messages
- [x] API: POST /api/tickets/[id]/messages — reply to ticket
- [x] API: GET /api/tickets/[id]/attachments — list attachments
- [x] API: POST /api/tickets/[id]/attachments — upload attachment
- [x] API: POST /api/tickets/[id]/rate — rate ticket
- [x] API: GET /api/tickets/[id]/events — audit trail
- [x] Admin page: `app/admin/support/tickets/page.tsx` (basic dashboard)
- [ ] Student ticket page (to be created in Batch 1)
- [ ] Student ticket detail page with messages (to be created in Batch 1)

## Batch 2: Live Chat
- [ ] Database: chat_conversations, chat_participants, chat_messages, chat_attachments, chat_events
- [ ] Database: RLS policies for chat tables
- [ ] API: GET/POST /api/chat/conversations
- [ ] API: GET/POST /api/chat/conversations/[id]/messages
- [ ] API: GET /api/chat/queue (agent queue)
- [ ] UI: Student chat interface
- [ ] UI: Admin/agent chat interface
- [ ] Offline behavior and reconnection
- [ ] Message delivery/read status

## Batch 3: Announcement Center Stabilization
- [ ] Inspect existing Announcement Center (Batch 1A)
- [ ] Verify scheduling is operational
- [ ] Verify audience authorization (RLS + API)
- [ ] Verify read receipts
- [ ] Verify click tracking
- [ ] Add search and filters to admin UI
- [ ] Add campaign analytics metrics

## Batch 4: Unified Inbox
- [ ] Database: inbox aggregation tables (if needed)
- [ ] Admin interface: unified inbox
- [ ] Filters by communication type (tickets, chats, direct messages)
- [ ] Quick reply
- [ ] Archive

## Batch 5: Notification Engine
- [ ] Database: notification_preferences, notification_delivery_logs
- [ ] API: GET/POST /api/notifications (existing)
- [ ] API: GET /api/notifications/unread-count
- [ ] API: PUT /api/notifications/[id]
- [ ] UI: Student notification center
- [ ] Admin: notification templates and delivery tracking

## Batch 6: AI Support
- [ ] AI categorization (ticket classification)
- [ ] AI priority suggestion
- [ ] AI summary generation
- [ ] AI reply suggestions
- [ ] Integration with existing AI router (no paid APIs)

## Batch 7: Analytics & Permissions
- [ ] Support analytics: tickets by status, priority, category, resolution time
- [ ] Chat analytics: conversations, response time, resolution rate
- [ ] Announcements analytics: published, delivered, read, clicked
- [ ] Role-based permissions enforcement
- [ ] Audit trail for admin actions

## Batch 8: Security & QA
- [ ] Security audit (independent review)
- [ ] RLS verification
- [ ] IDOR tests
- [ ] Unit tests
- [ ] Integration tests
- [ ] Build verification
- [ ] Final integration review

## Key Files Created
- `db/31-support-tickets-full.sql` — database migration
- `lib/db.ts` — Drizzle ORM client
- `lib/db/schema.ts` — Drizzle schema
- `app/api/tickets/route.ts` — tickets collection API
- `app/api/tickets/[id]/route.ts` — ticket resource API
- `app/api/tickets/[id]/messages/route.ts` — ticket messages API
- `app/api/tickets/[id]/rate/route.ts` — ticket rating API
- `app/api/tickets/[id]/events/route.ts` — ticket audit events API
- `app/api/tickets/[id]/attachments/route.ts` — ticket attachments API
- `app/admin/support/tickets/page.tsx` — admin support dashboard (placeholder)

## Implementation Notes
- Batch 1 (Support Tickets) is the first real system. It is complete for API + database.
- The student-facing ticket interface and agent workspace UI are placeholders and need to be created in Batch 1.
- All API routes enforce server-side authorization via Supabase auth and `hasPermission`.
- RLS policies are in place for all new tables.
- No production SQL has been applied.
- No deployment has been performed.
