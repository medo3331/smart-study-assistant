import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";

// -------------------------------------------------------------------------
// MAGICLY — /lib/db/index.ts
// Database abstraction layer for Support Tickets (Sprint 1, Batch 1)
//
// The ticket routes use Drizzle ORM patterns. This layer provides a Drizzle
// compatible `db` object backed by the existing Supabase PostgreSQL cluster.
// It does NOT replace the project's primary Supabase client — it is a thin
// wrapper used ONLY by the tickets feature.
//
// This file is part of Phase 1C "Build Recovery & Tickets Repair" and is
// scoped to feat/inbox-phase0-security-fixes. No Production access.
// -------------------------------------------------------------------------

// Use the existing PgPool connection string (already configured in .env.local)
// The connection string is set at runtime by the deployment environment.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Create a Drizzle database instance backed by the PgPool
const db = drizzlePg(pool);

export { db };
export { drizzlePg };
export { Pool };
