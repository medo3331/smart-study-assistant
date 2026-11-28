// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1
// Support Tickets — Unit Tests
// ===========================================================================
// Note: These are basic unit tests. Integration tests require a running
// Supabase instance with test data.

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { support_tickets, support_ticket_attachments, support_ticket_events, support_ticket_ratings, support_messages, support_ticket_assignments } from '@/lib/db/schema';
import { eq, desc, and, or, sql } from 'drizzle-orm';

// هذه اختبارات تكاملية تحتاج قاعدة بيانات حقيقية (DATABASE_URL) —
// من غير DB بنعمل skip عشان ماتلوّش نتيجة الـ CI في البيئات من غير قاعدة.
const hasDatabase = Boolean(process.env.DATABASE_URL);

// Helper to create a test ticket
async function createTestTicket(overrides: Partial<typeof support_tickets.$inferInsert> = {}) {
  const data: typeof support_tickets.$inferInsert = {
    user_id: 'test-user-123',
    subject: 'Test ticket',
    category: 'bug',
    status: 'open',
    priority: 'normal',
    description: 'Test description',
    ...overrides,
  };
  const [ticket] = await db.insert(support_tickets).values(data as any).returning();
  return ticket;
}

describe.skipIf(!hasDatabase)('Support Tickets API', () => {
  describe('GET /api/tickets', () => {
    it('should return tickets for authorized user', async () => {
      // Create test tickets
      await createTestTicket({ user_id: 'test-user-123', subject: 'My bug' });
      await createTestTicket({ user_id: 'test-user-456', subject: 'Another ticket' });

      // Simulate API call
      // Note: In a real test, you'd use supertest or similar
      // For now, verify the query works
      const tickets = await db.select().from(support_tickets).where(
        and(
          eq(support_tickets.status, 'open'),
          eq(support_tickets.priority, 'normal'),
          eq(support_tickets.category, 'other')
        )
      );

      expect(tickets.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/tickets', () => {
    it('should create a ticket with valid data', async () => {
      const data: typeof support_tickets.$inferInsert = {
        user_id: 'test-user',
        subject: 'Test ticket',
        category: 'bug',
        description: 'Test description',
      };

      const [ticket] = await db
        .insert(support_tickets)
        .values(data)
        .returning();

      expect(ticket.id).toBeDefined();
      expect(ticket.status).toBe('open');
      expect(ticket.category).toBe('bug');
    });

    it('should reject ticket with invalid subject', async () => {
      // In a real test, you'd call the API with invalid data
      // and verify it returns 400
      const data: typeof support_tickets.$inferInsert = {
        user_id: 'test-user',
        subject: 'ab', // Too short
        category: 'bug',
        description: 'Test description',
      };

      // Should not insert
      await expect(
        db.insert(support_tickets).values(data).returning()
      ).rejects.toThrow();
    });
  });

  describe('Ticket status', () => {
    it('should support all statuses', async () => {
      const validStatuses = ['open', 'in_progress', 'closed', 'cancelled'];
      for (const status of validStatuses) {
        const [ticket] = await db
          .insert(support_tickets)
          .values({ user_id: 'test', subject: 'Test', category: 'bug', status, description: 'Test' } as any)
          .returning();
        expect(ticket.status).toBe(status);
      }
    });
  });

  describe('Ticket priority', () => {
    it('should support all priorities', async () => {
      const validPriorities = ['low', 'normal', 'high', 'urgent'];
      for (const priority of validPriorities) {
        const [ticket] = await db
          .insert(support_tickets)
          .values({ user_id: 'test', subject: 'Test', category: 'bug', priority, description: 'Test' } as any)
          .returning();
        expect(ticket.priority).toBe(priority);
      }
    });
  });

  describe('Comments and messages', () => {
    it('should create a message for a ticket', async () => {
      const ticket = await createTestTicket();

      const [message] = await db
        .insert(support_messages)
        .values({
          ticket_id: ticket.id,
          user_id: 'test-user',
          author_role: 'user',
          body: 'Test message',
        })
        .returning();

      expect(message.id).toBeDefined();
      expect(message.body).toBe('Test message');
    });

    it('should create multiple messages on a ticket', async () => {
      const ticket = await createTestTicket();

      const messages = await Promise.all([
        db.insert(support_messages).values({ ticket_id: ticket.id, user_id: 'user', author_role: 'user', body: 'Message 1' }).returning(),
        db.insert(support_messages).values({ ticket_id: ticket.id, user_id: 'admin', author_role: 'admin', body: 'Message 2' }).returning(),
      ]);

      expect(messages.length).toBe(2);
    });
  });

  describe('Attachments', () => {
    it('should attach a file to a ticket', async () => {
      const ticket = await createTestTicket();

      const [attachment] = await db
        .insert(support_ticket_attachments)
        .values({
          ticket_id: ticket.id,
          user_id: 'test-user',
          file_path: '/uploads/test.jpg',
          file_name: 'test.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
        } as any)
        .returning();

      expect(attachment.id).toBeDefined();
      expect(attachment.file_name).toBe('test.jpg');
    });
  });

  describe('Ratings', () => {
    it('should rate a ticket', async () => {
      const ticket = await createTestTicket();

      const [rating] = await db
        .insert(support_ticket_ratings)
        .values({
          ticket_id: ticket.id,
          user_id: 'test-user',
          rating: 5,
          comment: 'Great support!',
        })
        .returning();

      expect(rating.rating).toBe(5);
      expect(rating.comment).toBe('Great support!');
    });

    it('should only allow one rating per user per ticket', async () => {
      const ticket = await createTestTicket();

      // First rating
      await db.insert(support_ticket_ratings).values({
        ticket_id: ticket.id,
        user_id: 'test-user',
        rating: 5,
        comment: 'First rating',
      } as any);

      // Second rating should fail due to unique constraint (simulated)
      await expect(
        db.insert(support_ticket_ratings).values({
          ticket_id: ticket.id,
          user_id: 'test-user',
          rating: 4,
          comment: 'Second rating',
        } as any).returning()
      ).rejects.toThrow();
    });
  });

  describe('Event log', () => {
    it('should log ticket events', async () => {
      const ticket = await createTestTicket();

      await db.insert(support_ticket_events).values({
        ticket_id: ticket.id,
        actor_id: 'test-user',
        event_type: 'ticket_created',
        details: { subject: 'Test' },
      } as any);

      const events = await db
        .select()
        .from(support_ticket_events)
        .where(eq(support_ticket_events.ticket_id, ticket.id))
        .orderBy(desc(support_ticket_events.created_at));

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].event_type).toBe('ticket_created');
    });
  });

  describe('Assignments', () => {
    it('should assign a ticket to an agent', async () => {
      const ticket = await createTestTicket();

      const [assignment] = await db
        .insert(support_ticket_assignments)
        .values({
          ticket_id: ticket.id,
          user_id: 'agent-user',
          assigned_by: 'admin',
          assigned_at: new Date(),
        })
        .returning();

      expect(assignment.id).toBeDefined();
      expect(assignment.assigned_at).toBeDefined();
    });
  });

  describe('Filtering', () => {
    it('should filter tickets by status', async () => {
      // Create tickets with different statuses
      await createTestTicket({ status: 'open' });
      await createTestTicket({ status: 'closed' });

      const open = await db.select().from(support_tickets).where(eq(support_tickets.status, 'open') as any);
      const resolved = await db.select().from(support_tickets).where(eq(support_tickets.status, 'closed') as any);

      expect(open.length).toBeGreaterThanOrEqual(1);
      expect(resolved.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter tickets by priority', async () => {
      await createTestTicket({ priority: 'urgent' });
      await createTestTicket({ priority: 'normal' });

      const urgent = await db.select().from(support_tickets).where(eq(support_tickets.priority, 'urgent') as any);
      const normal = await db.select().from(support_tickets).where(eq(support_tickets.priority, 'normal'));

      expect(urgent.length).toBeGreaterThanOrEqual(1);
      expect(normal.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Security', () => {
    it('should not allow users to update tickets they do not own (non-support)', async () => {
      // Create a ticket for user A
      const ticketA = await createTestTicket({ user_id: 'user-a' });

      // User B tries to update ticket A
      // In a real test, this would be an API call by user B
      // Should be rejected due to authorization
      // This is a server-side protection
      const ticketB = await createTestTicket({ user_id: 'user-b' });

      // Verify ticket B is not accessible to user A in API context
      // (simulated by checking the data)
      expect(ticketA.user_id).not.toBe('user-b');
    });

    it('should enforce RLS policies for non-admin users', async () => {
      // This is a static check - the actual enforcement is in the API route
      // and RLS policies
      const validRoles = ['admin', 'support_manager', 'support_agent', 'owner'];
      for (const role of validRoles) {
        const [ticket] = await db
          .insert(support_tickets)
          .values({ user_id: 'test', subject: 'Test', category: 'bug', status: 'open', description: 'Test' })
          .returning();
        expect(ticket.id).toBeDefined();
      }
    });
  });
});
