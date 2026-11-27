# MAGICLY — Communication Hub — Batch 0 Inventory

## Verified Workspace

- Root: `C:/Desktop/smart-study-assistant`
- Branch: `sprint1/announcement-center-unified-credits`
- HEAD SHA: `5a785b48`
- Git status: Modified + Untracked + Worktrees

## Existing Worktrees

- `.worktrees/phase-0-economy-truth/` — phase 0 economy work
- `.worktrees/worship-phase1/` — phase 1 worship work

## Existing Communication Systems (to reuse, not duplicate)

### 1. Announcement Center (Batch 1A stabilization — in progress)

**Files:**
- `app/api/announcements/route.ts` — GET (index) + POST (create)
- `app/api/announcements/[id]/route.ts` — PATCH + DELETE (admin only)
- `app/api/announcements/[id]/read/route.ts` — POST (read receipt)
- `app/api/announcements/unread-count/route.ts` — unread counter
- `lib/announcements/service.ts` — server service (audience matching, deliveries, reads)
- `lib/announcements/` — JS template helpers (play, lorem, getFaker)
- `db/80-announcement-center.sql` — schema (announcements table extension, announcement_reads, announcement_deliveries, RLS)
- `db/phase1a-announcements-schema.sql` — earlier schema
- `db/phase1e-announcement-email-campaigns.sql` — email/push campaigns

**RLS:** `announcements` table (read published, RLS enforced), `announcement_reads` (self read + insert), `announcement_deliveries` (admin select)

### 2. Support Widget (Batch 1 partial — UI only, no backend)

**Files:**
- `components/SupportWidget.tsx` — support widget UI (modal/window)
- `lib/support/open-support.ts` — `openSupport()` event dispatcher
- `app/api/announcements/[id]/read/route.ts` — read receipt route (from Batch 1A)
- `lib/admin/auth-check.ts` — admin permission checks
- `lib/announcements/service.ts` — audience matching

**Status:** UI component exists. No backend routes. No database tables. No RLS for support.

### 3. Notifications + Tickets (Phase 1-2, expanded in Batch 0)

**Files:**
- `db/25-notifications-and-tickets.sql` — notifications + support_tickets schema (Phase 1-2)
- `db/64-admin-messaging-rls.sql` — admin messaging RLS
- `db/65-notifications-push-rls.sql` — push notification RLS
- `db/admin-messaging.sql` — admin messaging schema
- `db/phase-communication-center.sql` — Unified Communication Center schema

**Tables created:**
- `public.support_tickets` — id, user_id, subject, category, status, created_at, updated_at
- `public.support_messages` — id, ticket_id, author_id, author_role, body, created_at
- `public.notifications` — id, user_id, title, message, type, is_read, created_at, created_by

**RLS:** support_tickets (self read only), support_messages (self read), notifications (own read/update/delete)

**Missing tables:**
- `support_ticket_attachments`
- `support_ticket_assignments`
- `support_ticket_events`
- `support_ticket_ratings`
- `chat_conversations`
- `chat_participants`
- `chat_messages`
- `chat_attachments`
- `chat_events`
- `notification_preferences`
- `notification_delivery_logs`
- `support_canned_responses`
- `communication_settings`

### 4. Admin Notification Routes (Phase 1-2)

**Files:**
- `app/api/notifications/route.ts` — GET/POST notifications (from Batch 2 phase)
- `app/api/notifications/[id]/route.ts` — GET/PUT/DELETE single notification (from Batch 2 phase)
- `app/api/notifications/unread-count/route.ts` — unread counter (from Batch 2 phase)

**Status:** Backend exists but incomplete (no community/schema for preferences, delivery logs, analytics).

### 5. Admin Announcements Component

**Files:**
- `components/admin/AnnouncementsAdmin.tsx` — admin announcements UI (636 lines)
- `app/dashboard/page.tsx` — admin dashboard (modified)
- `app/admin/analytics/page.tsx` — analytics page (modified)
- `lib/admin/nav.ts` — admin navigation
- `lib/admin/overview.ts` — admin overview

## Existing Admin Roles & Permissions

**Files:**
- `lib/admin/auth-check.ts` — role and permission checks
- `db/admin-roles.sql` — admin roles schema
- `db/10-user-code-regenerate-permission.sql` — permissions regeneration

**Roles:** owner, admin, moderator, support_agent, support_manager, marketing_manager, read_only_analyst

**Permissions:** existing `ADMIN_PERMISSION_KEYS` and `ADMIN_PERMISSION_MAP`

## Existing Supabase Infrastructure

**Realtime:** Configured (Supabase Realtime library in use)
**File upload:** `storage/` bucket + `public/uploads` storage
**Email:** Existing SMTP configuration (used by announcement center)
**API:** Next.js App Router (App Router endpoints)
**Database:** Drizzle ORM

## Existing Hooks

**Files:**
- `app/hooks/use-notifications.ts` — notification hook (from Batch 2 phase)
- `app/hooks/use-unread-count.ts` — unread counter hook (from Batch 2 phase)

## Existing Components (New)

**Files:**
- `components/layout/DeferredOverlays.tsx` — lazy-loaded overlays
- `components/magic-wheel/WheelCharts.tsx` — charts
- `app/admin/analytics/AnalyticsChartsLazy.tsx` — analytics charts

## Audit Findings

### What Can Be Reused
- Announcement Center (route.ts, service.ts, DB schema, RLS)
- Support Widget UI (components/SupportWidget.tsx)
- Notifications + support_tickets + support_messages DB schema
- Admin roles & permissions (lib/admin/auth-check.ts)
- Admin navigation & dashboard (app/dashboard/page.tsx, lib/admin/nav.ts)
- Drizzle ORM setup
- Supabase client & service client
- File upload storage

### What Needs Improvement
- `support_tickets` schema is minimal (no priority, attachments, assignments, events, ratings)
- `support_messages` has no read status or agent metadata
- No `support_ticket_attachments`, `support_ticket_assignments`, `support_ticket_events`, `support_ticket_ratings`
- No chat system (chat_conversations, chat_messages, chat_participants)
- No `notification_preferences`, `notification_delivery_logs`
- No admin notification routes for preference management
- No schema for admin support queue (no admin-specific fields)

### What is Missing
- Full support ticket lifecycle (create, reply, attach, assign, reassign, escalate, close, rate)
- Full chat system (conversations, messages, participants, read status, delivery)
- Unified inbox for admins
- Notification engine (preferences, delivery logs, templates)
- Campaign analytics for announcements
- AI support assistant integration
- Admin permission model for communication hub

## Preservation Checklist (Batch 0)

- [x] Verify root: `C:/Desktop/smart-study-assistant` → CONFIRMED
- [x] Verify branch: `sprint1/announcement-center-unified-credits` → CONFIRMED
- [x] Verify HEAD SHA: `5a785b48` → CONFIRMED
- [x] Git status: Modified + Untracked + Worktrees → DOCUMENTED
- [x] Existing worktrees identified: `.worktrees/phase-0-economy-truth/`, `.worktrees/worship-phase1/` → DOCUMENTED
- [x] Previous work inventory: Announcement Center + Support Widget + Notifications + Tickets → DOCUMENTED
- [x] No destructive actions taken → CONFIRMED
